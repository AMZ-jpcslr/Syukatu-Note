-- v2: private import inbox, explicit approval, extension pairing and optional Gmail.
-- Additive only. Apply after 005, once, in full.
begin;
alter table public.user_applications add column field_provenance jsonb not null default '{}';
alter table public.selection_steps add column field_provenance jsonb not null default '{}', add column import_key text;
alter table public.tasks add column due_value text, add column estimated_minutes integer not null default 30 check(estimated_minutes between 1 and 1440), add column calendar_enabled boolean not null default true, add column field_provenance jsonb not null default '{}', add column import_key text;
-- Existing dates have no reliable origin; treat them as user-managed rather than replacing them silently.
update public.user_applications set field_provenance=jsonb_build_object('application_deadline',jsonb_build_object('source_type','manual','userEdited',true,'lastUpdated',now())) where application_deadline is not null or application_deadline_value is not null;
create unique index import_step_key on public.selection_steps(user_application_id,import_key) where import_key is not null;
create unique index import_task_key on public.tasks(user_application_id,import_key) where import_key is not null;
create table public.user_profiles(user_id uuid primary key references public.anonymous_users(id),skills text[] not null default '{}',experiences text[] not null default '{}',interests text[] not null default '{}');
create table public.data_sources(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.anonymous_users(id),type text not null check(type in('mypage','mail','official','shared','text')),
 source_ref text not null,url text not null default '',gmail_message_id text,received_at timestamptz,page_title text not null default '',content_hash text not null,checked_at timestamptz not null default now(),
 unique(user_id,type,source_ref),unique(id,user_id));
create table public.import_inbox(
 id uuid primary key default gen_random_uuid(),user_id uuid not null,source_id uuid not null,source_type text not null,source_ref text not null,company_id uuid references public.companies(id),
 raw_extracted_json jsonb not null,previous_json jsonb,status text not null default 'pending' check(status in('pending','approved','rejected')),created_at timestamptz not null default now(),reviewed_at timestamptz,
 foreign key(source_id,user_id) references public.data_sources(id,user_id) on update cascade on delete cascade,unique(id,user_id));
create table public.imported_events(
 id uuid primary key default gen_random_uuid(),user_id uuid not null,user_application_id uuid not null,title text not null,event_type text not null,start_value text not null,end_value text,import_key text not null,
 field_provenance jsonb not null default '{}',completed boolean not null default false,
 foreign key(user_application_id,user_id) references public.user_applications(id,user_id) on update cascade on delete cascade,unique(user_application_id,import_key));
create table public.import_audit(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.anonymous_users(id),inbox_id uuid,user_application_id uuid,action text not null,details jsonb not null default '{}',created_at timestamptz not null default now());
create table public.extension_pairings(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.anonymous_users(id),code_hash text not null unique,expires_at timestamptz not null,used_at timestamptz,created_at timestamptz not null default now());
create table public.extension_tokens(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.anonymous_users(id),token_hash text not null unique,label text not null default 'Chrome',extension_origin text not null,expires_at timestamptz not null,revoked_at timestamptz,created_at timestamptz not null default now());
create table public.import_rate_limits(key text primary key,window_start timestamptz not null default now(),count int not null default 1);
create table public.gmail_connections(user_id uuid primary key references public.anonymous_users(id),refresh_token_encrypted text not null,next_page_token text,sync_enabled boolean not null default false,last_synced_at timestamptz,last_error text,lease_until timestamptz,created_at timestamptz not null default now());
create table public.gmail_oauth_states(state_hash text primary key,user_id uuid not null references public.anonymous_users(id),browser_hash text not null,expires_at timestamptz not null);

do $$ declare t text; begin
 foreach t in array array['user_profiles','data_sources','import_inbox','imported_events','import_audit','extension_pairings','extension_tokens','import_rate_limits','gmail_connections','gmail_oauth_states'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
 foreach t in array array['user_profiles','data_sources','import_inbox','imported_events','import_audit'] loop
 execute format('create policy private_read on public.%I for select to authenticated using(user_id=auth.uid())',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy profile_write on public.user_profiles for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant insert,update,delete on public.user_profiles to authenticated;
create policy event_write on public.imported_events for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant update,delete on public.imported_events to authenticated;
create index on public.import_inbox(user_id,status,created_at desc);
create index on public.import_audit(user_id,created_at desc);

create function public.import_rate_limit(bucket text, maximum integer, window_seconds integer) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer; begin
 insert into public.import_rate_limits(key) values(bucket) on conflict(key) do update set count=case when import_rate_limits.window_start < now()-make_interval(secs=>window_seconds) then 1 else import_rate_limits.count+1 end, window_start=case when import_rate_limits.window_start < now()-make_interval(secs=>window_seconds) then now() else import_rate_limits.window_start end returning count into n;
 return n<=maximum;
end $$;
create function public.claim_extension_pairing(code_digest text,token_digest text,origin_value text) returns boolean language plpgsql security definer set search_path='' as $$
declare p public.extension_pairings; begin
 select * into p from public.extension_pairings where code_hash=code_digest and used_at is null and expires_at>now() for update;
 if p.id is null then return false; end if;
 update public.extension_pairings set used_at=now() where id=p.id;
 insert into public.extension_tokens(user_id,token_hash,extension_origin,expires_at) values(p.user_id,token_digest,origin_value,now()+interval '90 days');
 return true;
end $$;
create function public.enqueue_private_import(owner_id uuid,kind text,ref text,extraction jsonb,digest text) returns uuid language plpgsql security definer set search_path='' as $$
declare src public.data_sources; previous jsonb; approved jsonb; result uuid; begin
 if kind not in('mypage','mail','official','shared','text') or length(extraction::text)>60000 then raise exception 'Invalid import'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||kind||ref,0));
 select * into src from public.data_sources where user_id=owner_id and type=kind and source_ref=ref for update;
 if src.id is not null then
  select id,raw_extracted_json into result,previous from public.import_inbox where source_id=src.id order by created_at desc limit 1;
  if src.content_hash=digest then update public.data_sources set checked_at=now() where id=src.id; return result; end if;
  select raw_extracted_json into approved from public.import_inbox where source_id=src.id and status='approved' order by reviewed_at desc limit 1;
  previous=coalesce(approved,previous);
 end if;
 insert into public.data_sources(user_id,type,source_ref,url,gmail_message_id,page_title,content_hash) values(owner_id,kind,ref,extraction->>'pageUrl',case when kind='mail' then ref end,extraction->>'pageTitle',digest)
 on conflict(user_id,type,source_ref) do update set content_hash=excluded.content_hash,checked_at=now(),page_title=excluded.page_title returning * into src;
 insert into public.import_inbox(user_id,source_id,source_type,source_ref,raw_extracted_json,previous_json) values(owner_id,src.id,kind,ref,extraction,previous) returning id into result;
 return result;
end $$;

create function public.import_source_rank(kind text) returns integer language sql immutable as $$ select case kind when 'manual' then 6 when 'mypage' then 5 when 'mail' then 4 when 'official' then 3 when 'shared' then 2 else 1 end $$;
create function public.mark_user_edit() returns trigger language plpgsql set search_path='' as $$
declare f text; begin
 if current_setting('career.importing',true)='true' then return new; end if;
 foreach f in array case tg_table_name when 'user_applications' then array['company_name','position_name','application_deadline','application_deadline_value','event_start','event_end'] when 'selection_steps' then array['title','deadline','deadline_value','scheduled_at','scheduled_value'] when 'tasks' then array['title','due_date','due_value'] else array['title','start_value','end_value'] end loop
  if (to_jsonb(new)->f) is distinct from (to_jsonb(old)->f) then new.field_provenance = new.field_provenance || jsonb_build_object(f,jsonb_build_object('source_type','manual','lastUpdated',now(),'userEdited',true)); end if;
 end loop; return new;
end $$;
create trigger v2_manual_edit before insert or update on public.user_applications for each row execute function public.mark_user_edit();
create trigger v2_manual_edit before insert or update on public.selection_steps for each row execute function public.mark_user_edit();
create trigger v2_manual_edit before insert or update on public.tasks for each row execute function public.mark_user_edit();
create trigger v2_manual_edit before insert or update on public.imported_events for each row execute function public.mark_user_edit();

create function public.review_private_import(payload jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare c public.import_inbox; a public.user_applications; app uuid; x jsonb; parsed jsonb; provenance jsonb; fields jsonb; keys jsonb; key text; date_value text; event_kind text; row_id uuid; task_name text; old_provenance jsonb; previous_item jsonb; old_key text; changed int:=0; override boolean; begin
 select * into c from public.import_inbox where id=(payload->>'inbox_id')::uuid and user_id=auth.uid() for update;
 if c.id is null then raise exception 'Import not found'; end if;
 if c.status<>'pending' then raise exception 'Already reviewed'; end if;
 if coalesce((payload->>'reject')::boolean,false) then update public.import_inbox set status='rejected',reviewed_at=now() where id=c.id; return null; end if;
 parsed=c.raw_extracted_json; fields=coalesce(payload->'fields','[]'); keys=coalesce(payload->'item_keys','[]'); override=coalesce((payload->>'allow_override')::boolean,false);
 app=nullif(payload->>'application_id','')::uuid;
 if app is null and not(fields ? 'company') then raise exception 'Confirm company to create an application'; end if;
 if app is not null then select * into a from public.user_applications where id=app and user_id=auth.uid() for update; if a.id is null then raise exception 'Application not found'; end if; end if;
 perform set_config('career.importing','true',true);
 provenance=jsonb_build_object('source_type',c.source_type,'source_id',c.source_id,'lastUpdated',now(),'userEdited',false);
 if app is null then
  insert into public.user_applications(user_id,company_name,graduation_year,position_name,job_category,selection_type,priority,status,url)
  values(auth.uid(),payload->>'company_name',(payload->>'graduation_year')::int,case when fields ? 'recruitment' then coalesce(parsed->>'recruitmentName','') else '' end,case when fields ? 'recruitment' then coalesce(parsed->>'positionName','') else '' end,case when fields ? 'recruitment' then parsed->>'recruitmentType' else '未発表' end,'未設定','応募予定',coalesce(parsed->>'pageUrl','')) returning * into a;
  app=a.id;
 end if;
 if fields ? 'company' and a.company_name is distinct from payload->>'company_name' then
  if a.field_provenance->'company_name'->>'userEdited'='true' and not override then raise exception '手動編集した企業名があります。上書きを確認してください。'; end if;
  update public.user_applications set company_name=payload->>'company_name',field_provenance=field_provenance||jsonb_build_object('company_name',provenance) where id=app;
 end if;
 if fields ? 'recruitment' then
  if a.field_provenance->'position_name'->>'userEdited'='true' and not override then raise exception '手動編集した募集名があります。上書きを確認してください。'; end if;
  if public.import_source_rank(a.field_provenance->'position_name'->>'source_type') > public.import_source_rank(c.source_type) and not override then raise exception '優先度の高い情報があります。上書きを確認してください。'; end if;
  update public.user_applications set position_name=coalesce(parsed->>'recruitmentName',position_name),job_category=coalesce(parsed->>'positionName',job_category),selection_type=parsed->>'recruitmentType',field_provenance=field_provenance||jsonb_build_object('position_name',provenance) where id=app;
 end if;
 for x in select value from jsonb_array_elements((parsed->'deadlines')||(parsed->'events')||(case when fields ? 'flow' then parsed->'detectedSelectionSteps' else '[]'::jsonb end)) loop
  if not(keys ? (x->>'key')) then continue; end if;
  date_value=nullif(x->>'date','');
  if date_value is not null and not(date_value ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}(T[0-9]{2}:[0-9]{2}:[0-9]{2}[+]09:00)?$') then raise exception 'Invalid date'; end if;
  event_kind=case x->>'type' when 'ES_DEADLINE' then 'ES締切' when 'APPLICATION_DEADLINE' then '応募締切' when 'WEB_TEST' then 'Webテスト' when 'INTERVIEW' then '一次面接' when 'FINAL_INTERVIEW' then '最終面接' when 'GD' then 'GD' when 'INTERNSHIP' then 'インターン' when 'SESSION' then '説明会' when 'ENTRY' then '応募開始' else 'その他' end;
  -- Date + type + application is shared across MyPage/Mail. Unknown dates use title.
  key=(x->>'type')||':'||coalesce(date_value,lower(regexp_replace(x->>'title','[[:space:]]','','g')));
  provenance=provenance||jsonb_build_object('evidence',x->>'evidence');
  select value into previous_item from jsonb_array_elements(coalesce(c.previous_json->'deadlines','[]')||coalesce(c.previous_json->'events','[]')) where value->>'key'=x->>'key' and value->>'type'=x->>'type' limit 1;
  old_key=case when previous_item is not null then (previous_item->>'type')||':'||coalesce(previous_item->>'date',lower(regexp_replace(previous_item->>'title','[[:space:]]','','g'))) else key end;
  if old_key is distinct from key then
   select field_provenance into old_provenance from public.imported_events where user_application_id=app and import_key=old_key for update;
   if old_provenance is not null and not override and (old_provenance->'start_value'->>'userEdited'='true' or public.import_source_rank(old_provenance->'start_value'->>'source_type')>public.import_source_rank(c.source_type)) then raise exception '手動編集または優先度の高い日程があります。上書きを確認してください。'; end if;
   if coalesce((payload->>'calendar')::boolean,false) and date_value is not null and not exists(select 1 from public.imported_events where user_application_id=app and import_key=key) then update public.imported_events set import_key=key where user_application_id=app and import_key=old_key; end if;
   if coalesce((payload->>'tasks')::boolean,false) and not exists(select 1 from public.tasks where user_application_id=app and import_key=key) then
    if exists(select 1 from public.tasks where user_application_id=app and import_key=old_key and (field_provenance->'due_value'->>'userEdited'='true' or field_provenance->'due_date'->>'userEdited'='true')) and not override then raise exception '手動編集したタスク期限があります。上書きを確認してください。'; end if;
    update public.tasks set import_key=key,due_value=date_value,due_date=date_value::date,field_provenance=field_provenance||jsonb_build_object('due_value',provenance) where user_application_id=app and import_key=old_key;
   end if;
  end if;
  if x->>'type'='APPLICATION_DEADLINE' and date_value is not null then
   if (a.field_provenance->'application_deadline_value'->>'userEdited'='true' or a.field_provenance->'application_deadline'->>'userEdited'='true' or public.import_source_rank(a.field_provenance->'application_deadline_value'->>'source_type')>public.import_source_rank(c.source_type)) and not override then raise exception '手動編集または優先度の高い締切があります。上書きを確認してください。'; end if;
   update public.user_applications set application_deadline=date_value::date,application_deadline_value=date_value,field_provenance=field_provenance||jsonb_build_object('application_deadline_value',provenance),calendar_exclusions=array_append(array_remove(calendar_exclusions,'application_deadline'),'application_deadline') where id=app;
  end if;
  if x->>'key' like 'flow-%' then
   insert into public.selection_steps(user_id,user_application_id,title,step_type,order_index,calendar_enabled,import_key,field_provenance)
   values(auth.uid(),app,x->>'title',event_kind,(select coalesce(max(order_index),-1)+1 from public.selection_steps where user_application_id=app),false,'flow:'||(x->>'title'),jsonb_build_object('title',provenance)) on conflict(user_application_id,import_key) where import_key is not null do nothing;
   continue;
  end if;
  if coalesce((payload->>'calendar')::boolean,false) and date_value is not null then
   select field_provenance into old_provenance from public.imported_events where user_application_id=app and import_key=key for update;
   if old_provenance is not null and not override and (old_provenance->'start_value'->>'userEdited'='true' or public.import_source_rank(old_provenance->'start_value'->>'source_type')>public.import_source_rank(c.source_type)) then raise exception '既存の予定が優先されます。上書きを確認してください。'; end if;
   insert into public.imported_events(user_id,user_application_id,title,event_type,start_value,end_value,import_key,field_provenance) values(auth.uid(),app,x->>'title',event_kind,date_value,nullif(x->>'end',''),key,jsonb_build_object('start_value',provenance))
   on conflict(user_application_id,import_key) do update set start_value=excluded.start_value,end_value=excluded.end_value,field_provenance=excluded.field_provenance;
  end if;
  if coalesce((payload->>'tasks')::boolean,false) then
   task_name=case x->>'type' when 'ES_DEADLINE' then 'ES提出' when 'WEB_TEST' then 'Webテスト受験' when 'INTERVIEW' then '面接準備・面接' when 'FINAL_INTERVIEW' then '最終面接準備・面接' when 'SESSION' then 'イベント予約' when 'APPLICATION_DEADLINE' then '応募' else x->>'title' end;
   insert into public.tasks(user_id,user_application_id,title,task_type,due_date,due_value,estimated_minutes,calendar_enabled,import_key,field_provenance)
   values(auth.uid(),app,task_name,event_kind,date_value::date,date_value,case when x->>'type' in('ES_DEADLINE','WEB_TEST','INTERVIEW','FINAL_INTERVIEW') then 60 when x->>'type'='SESSION' then 10 when x->>'type'='APPLICATION_DEADLINE' then 15 else 30 end,false,key,jsonb_build_object('due_value',provenance))
   on conflict(user_application_id,import_key) where import_key is not null do nothing;
  end if;
  changed=changed+1;
 end loop;
 update public.import_inbox set status='approved',reviewed_at=now() where id=c.id;
 insert into public.import_audit(user_id,inbox_id,user_application_id,action,details) values(auth.uid(),c.id,app,'approved',jsonb_build_object('source',c.source_type,'fields',fields,'items',keys,'calendar',payload->'calendar','tasks',payload->'tasks','override',override));
 perform set_config('career.importing','false',true);
 return app;
end $$;
-- Invoker RPC uses owner-scoped grants; extraction JSON is not writable by authenticated clients.
grant update(status,reviewed_at) on public.import_inbox to authenticated;
create policy inbox_review on public.import_inbox for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant insert on public.import_audit,public.imported_events to authenticated;
create policy audit_append on public.import_audit for insert to authenticated with check(user_id=auth.uid());
create policy event_insert on public.imported_events for insert to authenticated with check(user_id=auth.uid());

create function public.transfer_import_data() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.transfer_code_hash is not null and new.transfer_code_hash is null and auth.uid() is not null and new.id<>auth.uid() then
  -- Distinct refs prevent collisions while retaining both histories.
  update public.data_sources set source_ref=source_ref||':transfer:'||id::text,user_id=auth.uid() where user_id=new.id;
  update public.import_audit set user_id=auth.uid() where user_id=new.id;
  insert into public.user_profiles(user_id,skills,experiences,interests) select auth.uid(),skills,experiences,interests from public.user_profiles where user_id=new.id on conflict(user_id) do nothing;
  delete from public.user_profiles where user_id=new.id;
  update public.extension_tokens set revoked_at=now() where user_id=new.id;
  delete from public.extension_pairings where user_id=new.id;
  delete from public.gmail_connections where user_id=new.id;
  delete from public.gmail_oauth_states where user_id=new.id;
 end if; return new;
end $$;
create trigger transfer_import after update of transfer_code_hash on public.anonymous_users for each row execute function public.transfer_import_data();
revoke all on function public.import_rate_limit(text,integer,integer),public.claim_extension_pairing(text,text,text),public.enqueue_private_import(uuid,text,text,jsonb,text),public.transfer_import_data(),public.mark_user_edit() from public,anon,authenticated;
grant execute on function public.import_rate_limit(text,integer,integer),public.claim_extension_pairing(text,text,text),public.enqueue_private_import(uuid,text,text,jsonb,text) to service_role;
revoke all on function public.review_private_import(jsonb) from public,anon;
grant execute on function public.review_private_import(jsonb) to authenticated;
create or replace function public.import_bundle(payload jsonb) returns integer language plpgsql security invoker set search_path='' as $$
declare item jsonb; app public.user_applications; step public.selection_steps; task public.tasks; evt public.imported_events; n int:=0;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 perform set_config('career.importing','true',true);
 if length(payload::text)>5242880 or jsonb_array_length(payload->'applications')>500 then raise exception 'Import too large'; end if;
 for item in select * from jsonb_array_elements(payload->'applications') loop
  app:=jsonb_populate_record(null::public.user_applications,item);
  app.deadline_type:=coalesce(app.deadline_type,'date'); app.copied_deadline_type:=coalesce(app.copied_deadline_type,'date'); app.application_status:=coalesce(app.application_status,'unknown');
  app.calendar_exclusions:=coalesce(app.calendar_exclusions,'{}'); app.recruitment_notes:=coalesce(app.recruitment_notes,''); app.eligibility:=coalesce(app.eligibility,'');
  app.field_provenance:='{}'; app.user_id:=auth.uid(); app.company_id:=null; app.recruitment_template_id:=null;
  insert into public.user_applications select (app).*; n:=n+1;
 end loop;
 for item in select * from jsonb_array_elements(payload->'steps') loop
  step:=jsonb_populate_record(null::public.selection_steps,item); step.field_provenance:='{}'; step.import_key:=null; step.user_id:=auth.uid(); step.calendar_enabled:=coalesce(step.calendar_enabled,true); step.state:=coalesce(step.state,case when step.completed then '完了' else '未着手' end);
  insert into public.selection_steps select (step).*;
 end loop;
 for item in select * from jsonb_array_elements(payload->'tasks') loop
  task:=jsonb_populate_record(null::public.tasks,item); task.field_provenance:='{}'; task.import_key:=null; task.estimated_minutes:=coalesce(task.estimated_minutes,30); task.calendar_enabled:=coalesce(task.calendar_enabled,true); task.user_id:=auth.uid();
  insert into public.tasks select (task).*;
 end loop;
 for item in select * from jsonb_array_elements(coalesce(payload->'importedEvents','[]')) loop
  evt:=jsonb_populate_record(null::public.imported_events,item); evt.user_id:=auth.uid();
  evt.field_provenance:=jsonb_build_object('start_value',jsonb_build_object('source_type','manual','userEdited',true,'lastUpdated',now()));
  insert into public.imported_events select (evt).*;
 end loop;
 perform set_config('career.importing','false',true);
 return n;
end $$;

commit;
