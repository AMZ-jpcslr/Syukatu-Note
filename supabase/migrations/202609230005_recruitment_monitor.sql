-- Human-reviewed recruitment monitoring. No existing row or table is removed.
begin;
alter table public.recruitment_templates
 add column application_start_value text, add column application_deadline_value text,
 add column event_start text, add column event_end text,
 add column selection_flow_details jsonb not null default '[]',
 add column eligibility text not null default '', add column field_evidence jsonb not null default '{}';
alter table public.user_applications
 add column application_start_value text, add column application_deadline_value text,
 add column event_start text, add column event_end text,
 add column calendar_exclusions text[] not null default '{}',
 add column recruitment_notes text not null default '',add column eligibility text not null default '';
alter table public.selection_steps add column deadline_value text, add column scheduled_value text,
 add column calendar_enabled boolean not null default true;
create table public.company_sources(
 id uuid primary key default gen_random_uuid(),company_id uuid references public.companies(id),
 company_name text not null default '',owner_user_id uuid references public.anonymous_users(id),
 source_type text not null check(source_type in ('recruitment','internship','job_detail','event','mypage','other')),
 url text not null check(url ~* '^https?://' and length(url)<=2000),
 is_active boolean not null default true,monitor_enabled boolean not null default true,
 monitor_priority text not null default 'medium' check(monitor_priority in ('high','medium','low')),
 last_checked_at timestamptz,last_success_at timestamptz,last_error text,last_result text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index company_source_unique on public.company_sources(coalesce(company_id::text,''),coalesce(owner_user_id::text,''),url);
create table public.company_source_snapshots(
 id uuid primary key default gen_random_uuid(),source_id uuid not null references public.company_sources(id) on delete cascade,
 content_hash text not null,checked_at timestamptz not null default now(),content_text text not null default '',
 page_title text not null default '',pages_json jsonb not null default '[]',unique(source_id,content_hash)
);
create table public.recruitment_monitor_preferences(
 user_id uuid primary key references public.anonymous_users(id),
 auto_check boolean not null default true,ai_enabled boolean not null default false,
 notifications boolean not null default true
);
create table public.company_source_settings(
 user_id uuid not null references public.anonymous_users(id),source_id uuid not null references public.company_sources(id) on delete cascade,
 monitor_enabled boolean not null default true,monitor_priority text not null default 'medium' check(monitor_priority in ('high','medium','low')),
 primary key(user_id,source_id)
);
create table public.recruitment_reviewers(user_id uuid primary key references public.anonymous_users(id));
create table public.recruitment_monitor_jobs(
 id uuid primary key default gen_random_uuid(),source_id uuid not null references public.company_sources(id),
 company_key text not null,requested_by uuid references public.anonymous_users(id),
 status text not null default 'queued' check(status in ('queued','running','completed','failed')),
 available_at timestamptz not null default now(),locked_at timestamptz,lease_token uuid,attempts int not null default 0,
 result text,rule_count int not null default 0,ai_count int not null default 0,
 created_at timestamptz not null default now(),finished_at timestamptz
);
create unique index one_active_company_job on public.recruitment_monitor_jobs(company_key) where status in ('queued','running');
create index recruitment_jobs_pending on public.recruitment_monitor_jobs(status,available_at);
create table public.recruitment_update_candidates(
 id uuid primary key default gen_random_uuid(),company_id uuid references public.companies(id),template_id uuid references public.recruitment_templates(id),
 source_id uuid not null references public.company_sources(id),owner_user_id uuid references public.anonymous_users(id),
 source_url text not null,parser_type text not null check(parser_type in ('rule','gemini','hybrid')),
 raw_extracted_json jsonb not null,diff_json jsonb not null,
 confidence real not null check(confidence between 0 and 1),important_update boolean not null default false,
 fingerprint text not null,status text not null default 'pending' check(status in ('pending','approved','partially_approved','rejected')),
 created_at timestamptz not null default now(),reviewed_at timestamptz,reviewed_by_user_id uuid references public.anonymous_users(id),
 unique(source_id,fingerprint)
);
create table public.recruitment_candidate_reviews(
 user_id uuid not null references public.anonymous_users(id),candidate_id uuid not null references public.recruitment_update_candidates(id),
 status text not null,selected_fields text[] not null default '{}',application_id uuid references public.user_applications(id) on delete set null,
 created_at timestamptz not null default now(),primary key(user_id,candidate_id)
);
create table public.recruitment_ai_budget(month text primary key,calls int not null default 0);
alter table public.company_sources enable row level security;
create policy source_read on public.company_sources for select to authenticated using(owner_user_id is null or owner_user_id=auth.uid());
alter table public.company_source_snapshots enable row level security;
create policy snapshot_read on public.company_source_snapshots for select to authenticated using(exists(select 1 from public.company_sources s where s.id=source_id));
alter table public.recruitment_update_candidates enable row level security;
create policy candidate_read on public.recruitment_update_candidates for select to authenticated using(owner_user_id is null or owner_user_id=auth.uid());
alter table public.recruitment_monitor_jobs enable row level security;
create policy job_read on public.recruitment_monitor_jobs for select to authenticated using(exists(select 1 from public.company_sources s where s.id=source_id and (s.owner_user_id is null or s.owner_user_id=auth.uid())));
alter table public.recruitment_candidate_reviews enable row level security;
create policy receipt_read on public.recruitment_candidate_reviews for select to authenticated using(user_id=auth.uid());
alter table public.recruitment_monitor_preferences enable row level security;
create policy preference_owner on public.recruitment_monitor_preferences for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
alter table public.company_source_settings enable row level security;
create policy source_setting_owner on public.company_source_settings for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and exists(select 1 from public.company_sources s where s.id=source_id));
alter table public.recruitment_reviewers enable row level security;
create policy reviewer_self on public.recruitment_reviewers for select to authenticated using(user_id=auth.uid());
alter table public.recruitment_ai_budget enable row level security;
revoke all on public.company_sources,public.company_source_snapshots,public.recruitment_update_candidates,public.recruitment_monitor_jobs,public.recruitment_candidate_reviews,public.recruitment_monitor_preferences,public.company_source_settings,public.recruitment_reviewers,public.recruitment_ai_budget from anon,authenticated;
grant select on public.company_sources,public.company_source_snapshots,public.recruitment_update_candidates,public.recruitment_monitor_jobs,public.recruitment_candidate_reviews,public.recruitment_reviewers to authenticated;
grant select,insert,update,delete on public.recruitment_monitor_preferences,public.company_source_settings to authenticated;
grant all on public.company_sources,public.company_source_snapshots,public.recruitment_update_candidates,public.recruitment_monitor_jobs,public.recruitment_candidate_reviews,public.recruitment_monitor_preferences,public.company_source_settings,public.recruitment_reviewers,public.recruitment_ai_budget to service_role;

create function public.add_company_source(company uuid,source_url text,kind text,company_label text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; label text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if length(source_url)>2000 or source_url !~* '^https?://' then raise exception 'Invalid URL'; end if;
 if (select count(*) from public.company_sources where owner_user_id=auth.uid())>=100 then raise exception 'URL登録は100件までです'; end if;
 if company is not null then select name into label from public.companies where id=company; if not found then raise exception 'Company unavailable'; end if; else label:=left(company_label,120); end if;
 insert into public.company_sources(company_id,company_name,owner_user_id,source_type,url) values(company,coalesce(label,''),auth.uid(),kind,source_url)
 on conflict(coalesce(company_id::text,''),coalesce(owner_user_id::text,''),url) do update set is_active=true
 returning id into result; return result;
end $$;

create function public.request_recruitment_check(source uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.company_sources; result uuid; company text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into s from public.company_sources where id=source and is_active and (owner_user_id is null or owner_user_id=auth.uid());
 if not found then raise exception 'Source unavailable'; end if;
 company:=coalesce(s.company_id::text,s.id::text)||':'||coalesce(s.owner_user_id::text,'public');
 perform pg_advisory_xact_lock(hashtextextended(company,0));
 select id into result from public.recruitment_monitor_jobs where company_key=company and status in ('queued','running');
 if found then return result; end if;
 if exists(select 1 from public.recruitment_monitor_jobs where company_key=company and created_at>now()-interval '10 minutes') then raise exception '同じ企業の確認は10分ほど間隔を空けてください'; end if;
 if (select count(*) from public.recruitment_monitor_jobs where requested_by=auth.uid() and created_at>now()-interval '1 day')>=60 then raise exception '本日の手動チェック上限に達しました'; end if;
 insert into public.recruitment_monitor_jobs(source_id,company_key,requested_by) values(source,company,auth.uid()) returning id into result;return result;
end $$;

create function public.claim_recruitment_job(wanted uuid default null) returns setof public.recruitment_monitor_jobs language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(2028,1101);
 update public.recruitment_monitor_jobs set status=case when attempts>=3 then 'failed' else 'queued' end,result='timeout',available_at=now()+interval '5 minutes'
 where status='running' and locked_at<now()-interval '10 minutes';
 if (select count(*) from public.recruitment_monitor_jobs where status='running')>=3 then return;end if;
 return query update public.recruitment_monitor_jobs set status='running',locked_at=now(),lease_token=gen_random_uuid(),attempts=attempts+1
 where id=(select id from public.recruitment_monitor_jobs where status='queued' and available_at<=now() and (wanted is null or id=wanted) order by available_at,created_at for update skip locked limit 1) returning *;
end $$;

create function public.reserve_recruitment_ai_call(maximum int) returns boolean language plpgsql security definer set search_path='' as $$
declare used int; m text:=to_char(now(),'YYYY-MM');
begin
 insert into public.recruitment_ai_budget(month,calls) values(m,0) on conflict do nothing;
 select calls into used from public.recruitment_ai_budget where month=m for update;
 if used>=greatest(0,least(maximum,10000)) then return false; end if;
 update public.recruitment_ai_budget set calls=calls+1 where month=m;return true;
end $$;

-- Finish atomically: snapshots advance only after all review candidates have been stored.
create function public.complete_recruitment_job(job uuid,token uuid,snapshot jsonb,candidates jsonb,outcome text,rules int,ai int) returns void language plpgsql security definer set search_path='' as $$
declare j public.recruitment_monitor_jobs; s public.company_sources; c jsonb;
begin
 select * into j from public.recruitment_monitor_jobs where id=job and lease_token=token and status='running' for update;
 if not found then raise exception 'Lease expired'; end if;
 select * into s from public.company_sources where id=j.source_id;
 for c in select * from jsonb_array_elements(candidates) loop
  insert into public.recruitment_update_candidates(company_id,template_id,source_id,owner_user_id,source_url,parser_type,raw_extracted_json,diff_json,confidence,important_update,fingerprint)
  values(s.company_id,nullif(c->>'template_id','')::uuid,s.id,s.owner_user_id,c->>'source_url',c->>'parser_type',c->'raw_extracted_json',c->'diff_json',(c->>'confidence')::real,(c->>'important_update')::boolean,c->>'fingerprint')
  on conflict(source_id,fingerprint) do nothing;
 end loop;
 if snapshot is not null and snapshot<>'null'::jsonb then
 insert into public.company_source_snapshots(source_id,content_hash,content_text,page_title,pages_json)
 values(s.id,snapshot->>'content_hash',left(snapshot->>'content_text',50000),left(snapshot->>'page_title',500),snapshot->'pages_json')
 on conflict(source_id,content_hash) do update set checked_at=now();
 end if;
 update public.company_sources set last_checked_at=now(),last_success_at=case when outcome in ('success','unchanged','no_relevant_info') then now() else last_success_at end,
 last_error=case when outcome in ('success','unchanged','no_relevant_info') then null else outcome end,last_result=outcome,updated_at=now() where id=s.id;
 update public.recruitment_monitor_jobs set status=case when outcome in ('success','unchanged','no_relevant_info') then 'completed' else 'failed' end,finished_at=now(),result=outcome,rule_count=rules,ai_count=ai where id=j.id;
end $$;

create function public.monitor_template_value(t jsonb,k text) returns jsonb language sql immutable set search_path='' as $$
 select case k when 'application_start' then coalesce(nullif(t->'application_start_value','null'::jsonb),t->'application_start','null'::jsonb)
 when 'application_deadline' then coalesce(nullif(t->'application_deadline_value','null'::jsonb),t->'application_deadline','null'::jsonb)
 when 'source_url' then coalesce(nullif(t->'source_url','null'::jsonb),t->'url','null'::jsonb)
 when 'notes' then coalesce(t->'notes_public','null'::jsonb)
 when 'selection_steps' then case when jsonb_array_length(coalesce(t->'selection_flow_details','[]'))>0 then t->'selection_flow_details' else
 coalesce((select jsonb_agg(jsonb_build_object('title',e->>'title','type',e->>'step_type','deadline',null,'scheduled_at',null,'order_index',n-1)) from jsonb_array_elements(coalesce(t->'public_flow','[]')) with ordinality as f(e,n)),'[]') end
 else coalesce(t->k,'null'::jsonb) end
$$;
create function public.monitor_event_type(kind text) returns text language sql immutable set search_path='' as $$
 select case kind when 'ENTRY' then '応募開始' when 'ES' then 'ES締切' when 'WEB_TEST' then 'Webテスト' when 'GD' then 'GD' when 'INTERVIEW' then '一次面接' when 'FINAL_INTERVIEW' then '最終面接' when 'INTERNSHIP' then 'インターン' else 'その他' end
$$;
create function public.monitor_day(value text) returns date language sql stable set search_path='' as $$
 select case when value is null or value='' then null when length(value)=10 then value::date else (value::timestamptz at time zone 'Asia/Tokyo')::date end
$$;

-- The only path that applies extraction is this authenticated, explicit review operation.
create function public.review_recruitment_candidate(candidate uuid,fields text[],scope text default 'personal',target_application uuid default null,add_calendar boolean default true,add_tasks boolean default false,confirmed_company text default null,confirmed_year int default null,reject_candidate boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.recruitment_update_candidates; t public.recruitment_templates; a public.user_applications; r jsonb; k text; v jsonb; field_count int; status_value text; company uuid; yr int; company_name text; app_id uuid; step jsonb; sid uuid; flow jsonb; ev text; reviewer boolean; prior jsonb; exclusions text[];
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into c from public.recruitment_update_candidates where id=candidate and (owner_user_id is null or owner_user_id=auth.uid()) for update;
 if not found or c.status<>'pending' then raise exception 'この候補は利用できません。再読み込みしてください'; end if;
 if exists(select 1 from public.recruitment_candidate_reviews where user_id=auth.uid() and candidate_id=c.id) then raise exception '確認済みの候補です'; end if;
 reviewer:=exists(select 1 from public.recruitment_reviewers where user_id=auth.uid());
 if c.template_id is not null then select * into t from public.recruitment_templates where id=c.template_id and (public or created_by_user_id=auth.uid()) for update; if not found then raise exception 'Template unavailable'; end if; end if;
 if scope not in ('personal','public') then raise exception 'Invalid scope'; end if;
 if scope='public' and not reviewer and (case when c.template_id is not null then t.created_by_user_id is distinct from auth.uid() else c.owner_user_id is distinct from auth.uid() end) then raise exception '公開募集の変更には投稿者またはレビュー担当の権限が必要です'; end if;
 if reject_candidate then
  insert into public.recruitment_candidate_reviews(user_id,candidate_id,status) values(auth.uid(),c.id,'rejected');
  if c.owner_user_id=auth.uid() or scope='public' then update public.recruitment_update_candidates set status='rejected',reviewed_at=now(),reviewed_by_user_id=auth.uid() where id=c.id; end if;
  return null;
 end if;
 if cardinality(fields)<>(select count(distinct x) from unnest(fields) x) then raise exception 'Duplicate fields'; end if;
 if cardinality(fields)=0 or fields is null then raise exception '反映する項目を選択してください'; end if;
 foreach k in array fields loop
  if k not in ('position_name','job_category','selection_type','application_status','deadline_type','application_start','application_deadline','event_start','event_end','source_url','selection_steps','eligibility','notes') or not(c.diff_json ? k) then raise exception 'Invalid review field'; end if;
  if scope='public' and c.template_id is not null then
   prior:=public.monitor_template_value(to_jsonb(t),k);
   if prior is distinct from c.diff_json->k->'before' then raise exception '元の募集情報が変更されました。再取得してください'; end if;
  end if;
 end loop;
 r:=c.raw_extracted_json;company:=c.company_id;
 yr:=coalesce((r->>'graduation_year')::int,confirmed_year);
 if yr is null or yr not between 2020 and 2100 then raise exception '卒年度を確認して指定してください'; end if;
 if confirmed_year is not null and (r->>'graduation_year') is not null and confirmed_year<>(r->>'graduation_year')::int then raise exception '抽出年度を別年度へ変更できません'; end if;
 company_name:=coalesce(nullif(confirmed_company,''),nullif(r->>'company_name',''));
 if company is not null then select name into company_name from public.companies where id=company; end if;
 if company_name is null then raise exception '企業名を確認して指定してください'; end if;
 if company is null then
  insert into public.companies(name) values(left(company_name,120)) on conflict(name) do update set name=excluded.name returning id into company;
 end if;
 if scope='public' then
  if c.template_id is null then
   -- Serialize creation by identity. A competing review must be rechecked, not silently duplicated.
   perform pg_advisory_xact_lock(hashtextextended(company::text||yr::text||coalesce(r->>'position_name','')||coalesce(r->>'selection_type',''),0));
   if exists(select 1 from public.recruitment_templates where company_id=company and graduation_year=yr and lower(regexp_replace(position_name,'[[:space:]]','','g'))=lower(regexp_replace(coalesce(r->>'position_name',''),'[[:space:]]','','g')) and selection_type=r->>'selection_type') then raise exception '同じ募集が登録されています。再取得してください'; end if;
   insert into public.recruitment_templates(company_id,company_name,graduation_year,job_category,position_name,selection_type,url,source_url,public,source_type,verification_status,created_by_user_id)
    values(company,company_name,yr,'','募集名未確認','未発表',c.source_url,c.source_url,true,'user_submitted','unverified',auth.uid()) returning * into t;
  end if;
  foreach k in array fields loop
   v:=c.diff_json->k->'after';
   if k='selection_steps' then
    flow:=(select coalesce(jsonb_agg(jsonb_build_object('title',e->>'title','step_type',public.monitor_event_type(e->>'type'))),'[]') from jsonb_array_elements(v) e);
    update public.recruitment_templates set public_flow=flow,selection_flow_details=v where id=t.id;
   elsif k in ('application_start','application_deadline') then
    execute format('update public.recruitment_templates set %I=$1,%I=$2 where id=$3',k,k||'_value') using public.monitor_day(v#>>'{}'),v#>>'{}',t.id;
   elsif k='source_url' then update public.recruitment_templates set source_url=v#>>'{}',url=v#>>'{}' where id=t.id;
   else execute format('update public.recruitment_templates set %I=$1 where id=$2',case when k='notes' then 'notes_public' else k end) using v#>>'{}',t.id;
   end if;
   update public.recruitment_templates set field_evidence=jsonb_set(field_evidence,array[k],coalesce(c.diff_json->k->'evidence','null')) where id=t.id;
  end loop;
  -- A human approval is recorded; arbitrary submitted URLs are never auto-verified.
  update public.recruitment_templates set last_verified_at=now(),verification_status='unverified' where id=t.id;
  update public.recruitment_update_candidates set template_id=t.id where id=c.id;
 end if;
 if scope='personal' or add_calendar or add_tasks or target_application is not null then
  if target_application is not null then
   select * into a from public.user_applications where id=target_application and user_id=auth.uid() for update;
   if not found or a.graduation_year<>yr or (a.company_id is not null and a.company_id<>company) or (a.company_id is null and a.company_name<>company_name) then raise exception '反映先の企業・卒年度が一致しません'; end if;
  else
   insert into public.user_applications(user_id,recruitment_template_id,company_id,company_name,graduation_year,selection_type,status,priority)
   values(auth.uid(),coalesce(t.id,c.template_id),company,company_name,yr,'未発表','応募予定','未設定') returning * into a;
  end if;
  app_id:=a.id;exclusions:=a.calendar_exclusions;
  perform set_config('career.importing','true',true);
  foreach k in array fields loop
   v:=c.diff_json->k->'after';
   if k='selection_steps' then
    for step in select * from jsonb_array_elements(v) loop
     ev:=public.monitor_event_type(step->>'type');
     select id into sid from public.selection_steps where user_application_id=a.id and title=step->>'title' and step_type=ev limit 1;
     if sid is null then
      insert into public.selection_steps(user_id,user_application_id,title,step_type,order_index) values(auth.uid(),a.id,left(step->>'title',300),ev,(select coalesce(max(order_index),-1)+1 from public.selection_steps where user_application_id=a.id)) returning id into sid;
     end if;
     update public.selection_steps set deadline=public.monitor_day(step->>'deadline'),deadline_value=step->>'deadline',
      scheduled_at=case when length(coalesce(step->>'scheduled_at',''))>10 then (step->>'scheduled_at')::timestamptz else null end,
      scheduled_value=step->>'scheduled_at',calendar_enabled=add_calendar where id=sid;
     if add_tasks then
      insert into public.tasks(user_id,user_application_id,selection_step_id,title,task_type,due_date,completed)
      values(auth.uid(),a.id,sid,case step->>'type' when 'ES' then 'ES作成・提出' when 'WEB_TEST' then 'Webテスト受験' when 'INTERVIEW' then '面接準備' when 'FINAL_INTERVIEW' then '最終面接準備' else left(step->>'title',300) end,ev,coalesce(public.monitor_day(step->>'deadline'),public.monitor_day(step->>'scheduled_at')),(select completed from public.selection_steps where id=sid))
      on conflict(selection_step_id) do update set due_date=excluded.due_date;
     end if;
    end loop;
   elsif k in ('application_start','application_deadline') then
    execute format('update public.user_applications set %I=$1,%I=$2 where id=$3',k,k||'_value') using public.monitor_day(v#>>'{}'),v#>>'{}',a.id;
   elsif k='source_url' then update public.user_applications set url=v#>>'{}' where id=a.id;
   else
    execute format('update public.user_applications set %I=$1 where id=$2',case when k='notes' then 'recruitment_notes' else k end) using v#>>'{}',a.id;
   end if;
   if k in ('application_start','application_deadline','event_start','event_end') then exclusions:=array_remove(exclusions,k);if not add_calendar then exclusions:=array_append(exclusions,k);end if;end if;
  end loop;
  perform set_config('career.importing','false',true);
  update public.user_applications set calendar_exclusions=exclusions where id=a.id;
 end if;
 select count(*) into field_count from jsonb_object_keys(c.diff_json);
 status_value:=case when cardinality(fields)=field_count then 'approved' else 'partially_approved' end;
 insert into public.recruitment_candidate_reviews(user_id,candidate_id,status,selected_fields,application_id) values(auth.uid(),c.id,status_value,fields,app_id);
 if scope='public' or c.owner_user_id=auth.uid() then update public.recruitment_update_candidates set status=status_value,reviewed_at=now(),reviewed_by_user_id=auth.uid() where id=c.id; end if;
 return app_id;
end $$;
revoke all on function public.add_company_source(uuid,text,text,text),public.request_recruitment_check(uuid),public.claim_recruitment_job(uuid),public.complete_recruitment_job(uuid,uuid,jsonb,jsonb,text,int,int),public.reserve_recruitment_ai_call(int),public.review_recruitment_candidate(uuid,text[],text,uuid,boolean,boolean,text,int,boolean),public.monitor_template_value(jsonb,text),public.monitor_event_type(text),public.monitor_day(text) from public,anon;
grant execute on function public.add_company_source(uuid,text,text,text),public.request_recruitment_check(uuid),public.review_recruitment_candidate(uuid,text[],text,uuid,boolean,boolean,text,int,boolean) to authenticated;
revoke all on function public.claim_recruitment_job(uuid),public.complete_recruitment_job(uuid,uuid,jsonb,jsonb,text,int,int),public.reserve_recruitment_ai_call(int) from authenticated;
grant execute on function public.claim_recruitment_job(uuid),public.complete_recruitment_job(uuid,uuid,jsonb,jsonb,text,int,int),public.reserve_recruitment_ai_call(int) to service_role;

create or replace function public.copy_template(template_id uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare t public.recruitment_templates; result uuid; s jsonb; i int:=0;
begin
 select * into t from public.recruitment_templates where id=template_id and public and url ~* '^https?://[^/ ]+';
 if not found then raise exception 'Template not available'; end if;
 insert into public.user_applications(user_id,recruitment_template_id,company_id,company_name,industry,tags,graduation_year,job_category,position_name,selection_type,application_start,application_deadline,copied_application_deadline,deadline_type,copied_deadline_type,application_status,last_verified_at,url,status,priority)
 select auth.uid(),t.id,t.company_id,t.company_name,c.industry,c.tags,t.graduation_year,t.job_category,t.position_name,t.selection_type,t.application_start,t.application_deadline,t.application_deadline,t.deadline_type,t.deadline_type,t.application_status,t.last_verified_at,t.url,'応募予定','未設定' from public.companies c where c.id=t.company_id returning id into result;
 if jsonb_array_length(t.selection_flow_details)>0 then
 for s in select * from jsonb_array_elements(t.selection_flow_details) loop
 insert into public.selection_steps(user_id,user_application_id,title,step_type,order_index,deadline,deadline_value,scheduled_at,scheduled_value) values(auth.uid(),result,s->>'title',public.monitor_event_type(s->>'type'),i,public.monitor_day(s->>'deadline'),s->>'deadline',case when length(s->>'scheduled_at')>10 then (s->>'scheduled_at')::timestamptz else null end,s->>'scheduled_at');i:=i+1;
 end loop;
 else
 for s in select * from jsonb_array_elements(t.public_flow) loop
 insert into public.selection_steps(user_id,user_application_id,title,step_type,order_index) values(auth.uid(),result,s->>'title',s->>'step_type',i);i:=i+1;
 end loop;
 end if;
 update public.user_applications set application_start_value=t.application_start_value,application_deadline_value=t.application_deadline_value,event_start=t.event_start,event_end=t.event_end,recruitment_notes=t.notes_public,eligibility=t.eligibility where id=result;
 return result;
end $$;
grant execute on function public.monitor_day(text),public.monitor_event_type(text) to authenticated;
create or replace function public.import_bundle(payload jsonb) returns integer language plpgsql security invoker set search_path='' as $$
declare item jsonb; app public.user_applications; step public.selection_steps; task public.tasks; n int:=0;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 perform set_config('career.importing','true',true);
 if length(payload::text)>5242880 or jsonb_array_length(payload->'applications')>500 then raise exception 'Import too large'; end if;
 for item in select * from jsonb_array_elements(payload->'applications') loop
  app:=jsonb_populate_record(null::public.user_applications,item);
  app.deadline_type:=coalesce(app.deadline_type,'date'); app.copied_deadline_type:=coalesce(app.copied_deadline_type,'date'); app.application_status:=coalesce(app.application_status,'unknown');
  app.calendar_exclusions:=coalesce(app.calendar_exclusions,'{}'); app.recruitment_notes:=coalesce(app.recruitment_notes,''); app.eligibility:=coalesce(app.eligibility,'');
  app.user_id:=auth.uid(); app.company_id:=null; app.recruitment_template_id:=null;
  insert into public.user_applications select (app).*; n:=n+1;
 end loop;
 for item in select * from jsonb_array_elements(payload->'steps') loop
  step:=jsonb_populate_record(null::public.selection_steps,item); step.user_id:=auth.uid(); step.calendar_enabled:=coalesce(step.calendar_enabled,true); step.state:=coalesce(step.state,case when step.completed then '完了' else '未着手' end);
  insert into public.selection_steps select (step).*;
 end loop;
 for item in select * from jsonb_array_elements(payload->'tasks') loop
  task:=jsonb_populate_record(null::public.tasks,item); task.user_id:=auth.uid();
  insert into public.tasks select (task).*;
 end loop;
 perform set_config('career.importing','false',true);
 return n;
end $$;
-- Transfer private monitoring records along with an explicitly redeemed legacy code.
create function public.transfer_monitor_data() returns trigger language plpgsql security definer set search_path='' as $$
declare s public.company_sources; target uuid;
begin
 if old.transfer_code_hash is not null and new.transfer_code_hash is null and auth.uid() is not null and new.id<>auth.uid() then
  for s in select * from public.company_sources where owner_user_id=new.id loop
   select id into target from public.company_sources where owner_user_id=auth.uid() and company_id is not distinct from s.company_id and url=s.url;
   if target is not null then
    -- Equal URLs merge without losing candidates, evidence or completed job history.
    insert into public.company_source_snapshots(source_id,content_hash,checked_at,content_text,page_title,pages_json)
    select target,content_hash,checked_at,content_text,page_title,pages_json from public.company_source_snapshots where source_id=s.id
    on conflict(source_id,content_hash) do nothing;
    update public.recruitment_update_candidates set source_id=target,fingerprint=fingerprint||'-transfer-'||id::text where source_id=s.id;
    update public.recruitment_monitor_jobs set source_id=target where source_id=s.id;
    insert into public.company_source_settings(user_id,source_id,monitor_enabled,monitor_priority)
    select auth.uid(),target,monitor_enabled,monitor_priority from public.company_source_settings where source_id=s.id and user_id=new.id
    on conflict(user_id,source_id) do nothing;
    delete from public.company_sources where id=s.id;
   else
    update public.company_sources set owner_user_id=auth.uid() where id=s.id;
   end if;
  end loop;
  update public.recruitment_update_candidates set owner_user_id=auth.uid() where owner_user_id=new.id;
  update public.recruitment_monitor_jobs set requested_by=auth.uid() where requested_by=new.id;
  update public.recruitment_update_candidates set reviewed_by_user_id=auth.uid() where reviewed_by_user_id=new.id;
  insert into public.recruitment_monitor_preferences(user_id,auto_check,ai_enabled,notifications)
   select auth.uid(),auto_check,ai_enabled,notifications from public.recruitment_monitor_preferences where user_id=new.id
   on conflict(user_id) do update set auto_check=excluded.auto_check,ai_enabled=excluded.ai_enabled,notifications=excluded.notifications;
  insert into public.company_source_settings(user_id,source_id,monitor_enabled,monitor_priority)
   select auth.uid(),source_id,monitor_enabled,monitor_priority from public.company_source_settings where user_id=new.id on conflict do nothing;
  insert into public.recruitment_candidate_reviews(user_id,candidate_id,status,selected_fields,application_id,created_at)
   select auth.uid(),candidate_id,status,selected_fields,application_id,created_at from public.recruitment_candidate_reviews where user_id=new.id on conflict do nothing;
  -- Reviewer privileges deliberately require explicit administrator reassignment.
 end if;
 return new;
end $$;
create trigger transfer_monitor after update of transfer_code_hash on public.anonymous_users for each row execute function public.transfer_monitor_data();
revoke all on function public.transfer_monitor_data() from public,anon,authenticated;

commit;
