-- v1.1: additive schema. Existing records and anonymous identities are retained.
begin;
alter table public.companies add column tags text[] not null default '{}', add column aliases text[] not null default '{}', add column seed_key text unique;
alter table public.recruitment_templates
 add column source_url text,
 add column source_type text not null default 'user_submitted' check(source_type in ('official','company_mypage','third_party','user_submitted')),
 add column last_verified_at timestamptz,
 add column verification_status text not null default 'unverified' check(verification_status in ('verified','unverified','outdated')),
 add column application_status text not null default 'unknown' check(application_status in ('open','upcoming','closed','unknown')),
 add column notes_public text not null default '',
 add column seed_key text unique,
 add constraint verified_source_required check(verification_status <> 'verified' or (source_type in ('official','company_mypage') and source_url is not null and source_url ~* '^https?://[^/ ]+' and last_verified_at is not null));
update public.recruitment_templates set source_url=nullif(url,'');
alter table public.recruitment_templates drop constraint recruitment_templates_selection_type_check;
alter table public.recruitment_templates add constraint recruitment_templates_selection_type_check check(selection_type in ('本選考','早期選考','インターン','採用直結インターン','選考優遇インターン','ワークショップ','説明会','未発表','その他'));
alter table public.user_applications drop constraint user_applications_selection_type_check;
alter table public.user_applications add constraint user_applications_selection_type_check check(selection_type in ('本選考','早期選考','インターン','採用直結インターン','選考優遇インターン','ワークショップ','説明会','未発表','その他'));
alter table public.user_applications drop constraint user_applications_priority_check;
alter table public.user_applications add constraint user_applications_priority_check check(priority in ('S','A','B','C','未設定'));
alter table public.user_applications add column copied_application_deadline date, add column last_verified_at timestamptz;
-- Preserve the previous personal deadline as the original comparison baseline.
update public.user_applications set copied_application_deadline=application_deadline where recruitment_template_id is not null;
alter table public.selection_steps add column state text not null default '未着手' check(state in ('未着手','進行中','完了','合格','不合格','免除','辞退'));
update public.selection_steps set state='完了' where completed;
alter table public.selection_steps add constraint step_owner_application unique(id,user_application_id,user_id);
alter table public.tasks add column selection_step_id uuid unique;
alter table public.tasks add constraint task_source_owner foreign key(selection_step_id,user_application_id,user_id) references public.selection_steps(id,user_application_id,user_id) on delete cascade on update cascade;
alter table public.es_questions drop constraint es_questions_status_check;
alter table public.es_questions add constraint es_questions_status_check check(status in ('未着手','下書き','完成','提出済み'));
alter table public.es_questions add column submitted_at timestamptz;
alter table public.interview_notes add column location_or_url text not null default '', add column qa_pairs jsonb not null default '[]' check(jsonb_typeof(qa_pairs)='array');
create table public.user_preferences (
 user_id uuid primary key references public.anonymous_users(id),
 auto_create_tasks boolean not null default true, auto_calendar boolean not null default true
);
create table public.watchlist (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.anonymous_users(id),
 recruitment_template_id uuid not null references public.recruitment_templates(id) on delete cascade,
 created_at timestamptz not null default now(), unique(user_id,recruitment_template_id)
);
create table public.template_reports (
 id uuid primary key default gen_random_uuid(), template_id uuid not null references public.recruitment_templates(id) on delete cascade,
 user_id uuid not null references public.anonymous_users(id), report_type text not null check(report_type in ('締切が違う','URLが違う','募集終了','その他')),
 comment text not null default '' check(length(comment)<=2000), created_at timestamptz not null default now()
);
do $$ declare t text; begin
 foreach t in array array['user_preferences','watchlist','template_reports'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 execute format('create policy own_data on public.%I for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()))',t);
 end loop;
end $$;
create index on public.watchlist(user_id);
create index on public.template_reports(user_id);
create index on public.recruitment_templates(graduation_year,selection_type,application_status);
-- A submitted URL is a claim, not verification. Only the service/admin can verify.
alter policy template_read on public.recruitment_templates using((public and url ~* '^https?://[^/ ]+') or created_by_user_id=(select auth.uid()));
alter policy template_update on public.recruitment_templates with check(created_by_user_id=(select auth.uid()) and (not public or url ~* '^https?://[^/ ]+'));
create or replace function public.publish_template(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare company uuid; result uuid; safe_flow jsonb; official_url text:=trim(coalesce(payload->>'url',''));
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if length(payload::text)>30000 then raise exception 'Payload too large'; end if;
 if official_url !~* '^https?://[^/ ]+' then raise exception '公式採用URLを設定してください'; end if;
 if (select count(*) from public.recruitment_templates where created_by_user_id=auth.uid() and created_at>now()-interval '1 day')>=30 then raise exception 'Daily publication limit reached'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('title',left(e->>'title',300),'step_type',e->>'step_type')),'[]'::jsonb) into safe_flow
 from jsonb_array_elements(coalesce(payload->'public_flow','[]'::jsonb)) e;
 if exists(select 1 from jsonb_array_elements(safe_flow) e where coalesce(e->>'step_type','') not in ('応募開始','応募締切','ES締切','Webテスト','一次面接','二次面接','最終面接','GD','インターン','説明会','その他') or coalesce(e->>'title','')='') then raise exception 'Invalid public flow'; end if;
 insert into public.companies(name) values(trim(payload->>'company_name')) on conflict(name) do update set name=excluded.name returning id into company;
 insert into public.recruitment_templates(company_id,company_name,graduation_year,job_category,position_name,selection_type,application_start,application_deadline,url,source_url,source_type,verification_status,public,public_flow,created_by_user_id)
 values(company,trim(payload->>'company_name'),(payload->>'graduation_year')::int,coalesce(payload->>'job_category',''),coalesce(payload->>'position_name',''),payload->>'selection_type',nullif(payload->>'application_start','')::date,nullif(payload->>'application_deadline','')::date,official_url,official_url,'user_submitted','unverified',true,safe_flow,auth.uid()) returning id into result;
 return result;
end $$;
create or replace function public.copy_template(template_id uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare t public.recruitment_templates; result uuid; s jsonb; i int:=0;
begin
 select * into t from public.recruitment_templates where id=template_id and public and url ~* '^https?://[^/ ]+';
 if not found then raise exception 'Template not available'; end if;
 insert into public.user_applications(user_id,recruitment_template_id,company_id,company_name,industry,tags,graduation_year,job_category,position_name,selection_type,application_start,application_deadline,copied_application_deadline,last_verified_at,url,status,priority)
 select auth.uid(),t.id,t.company_id,t.company_name,c.industry,c.tags,t.graduation_year,t.job_category,t.position_name,t.selection_type,t.application_start,t.application_deadline,t.application_deadline,t.last_verified_at,t.url,'応募予定','未設定' from public.companies c where c.id=t.company_id returning id into result;
 for s in select * from jsonb_array_elements(t.public_flow) loop
 insert into public.selection_steps(user_id,user_application_id,title,step_type,order_index) values(auth.uid(),result,s->>'title',s->>'step_type',i); i:=i+1;
 end loop;
 return result;
end $$;
-- User explicitly applies the currently displayed revision. A racing update asks for refresh.
create function public.apply_template_deadline(application_id uuid, expected_deadline date) returns void language plpgsql security invoker set search_path='' as $$
declare t public.recruitment_templates;
begin
 select rt.* into t from public.recruitment_templates rt join public.user_applications a on a.recruitment_template_id=rt.id where a.id=application_id and a.user_id=auth.uid() and rt.public;
 if not found then raise exception 'Template not available'; end if;
 if t.application_deadline is distinct from expected_deadline then raise exception '募集情報を再読み込みしてください'; end if;
 update public.user_applications set application_deadline=t.application_deadline, copied_application_deadline=t.application_deadline,last_verified_at=t.last_verified_at where id=application_id and user_id=auth.uid();
end $$;
create function public.reorder_steps(application_id uuid, step_ids uuid[]) returns void language plpgsql security invoker set search_path='' as $$
declare sid uuid; i int:=0;
begin
 perform 1 from public.user_applications where id=application_id and user_id=auth.uid() for update;
 if not found then raise exception 'Application not available'; end if;
 if cardinality(step_ids)<>(select count(*) from public.selection_steps where user_application_id=application_id) or cardinality(step_ids)<>(select count(distinct x) from unnest(step_ids) x) then raise exception 'Reload selection flow'; end if;
 foreach sid in array step_ids loop
 update public.selection_steps set order_index=i where id=sid and user_application_id=application_id;
 if not found then raise exception 'Invalid step'; end if; i:=i+1;
 end loop;
end $$;
create function public.normalize_step_state() returns trigger language plpgsql set search_path='' as $$
declare previous public.selection_steps; existing boolean:=false;
begin
 -- PostgREST upsert runs BEFORE INSERT before resolving ON CONFLICT.
 -- Compare the persisted row here as well, so reopening a completed step works.
 if TG_OP='UPDATE' then previous:=old; existing:=true;
 else select * into previous from public.selection_steps where id=new.id and user_id=new.user_id; existing:=found;
 end if;
 if existing and new.state is distinct from previous.state then new.completed:=new.state in ('完了','合格','不合格','免除','辞退');
 elsif existing and new.completed is distinct from previous.completed then new.state:=case when new.completed then '完了' else '未着手' end;
 elsif not existing then
  if new.completed then new.state:=case when new.state in ('合格','不合格','免除','辞退') then new.state else '完了' end;
  else new.completed:=new.state in ('完了','合格','不合格','免除','辞退'); end if;
 end if;
 return new;
end $$;
create trigger step_state before insert or update on public.selection_steps for each row execute function public.normalize_step_state();
create function public.sync_step_task() returns trigger language plpgsql security invoker set search_path='' as $$
declare enabled boolean;
begin
 if pg_trigger_depth()>1 or current_setting('career.importing',true)='true' then return new; end if;
 select auto_create_tasks into enabled from public.user_preferences where user_id=new.user_id;
 if coalesce(enabled,true) and (new.deadline is not null or new.scheduled_at is not null) then
 insert into public.tasks(user_id,user_application_id,selection_step_id,title,task_type,due_date,completed,url)
 values(new.user_id,new.user_application_id,new.id,case when new.step_type='ES締切' then 'ES提出' else new.title end,new.step_type,coalesce(new.deadline,(new.scheduled_at at time zone 'Asia/Tokyo')::date),new.completed,new.url)
 on conflict(selection_step_id) do update set title=excluded.title,task_type=excluded.task_type,due_date=excluded.due_date,completed=excluded.completed,url=excluded.url;
 else
 -- Retain user notes and tasks when automation is disabled or dates removed.
 update public.tasks set due_date=coalesce(new.deadline,(new.scheduled_at at time zone 'Asia/Tokyo')::date),completed=new.completed where selection_step_id=new.id;
 end if;
 return new;
end $$;
create trigger step_task after insert or update of title,step_type,deadline,scheduled_at,completed,state,url on public.selection_steps for each row execute function public.sync_step_task();
create function public.sync_task_completion() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if pg_trigger_depth()=1 and new.selection_step_id is not null and new.completed is distinct from old.completed then
 update public.selection_steps set completed=new.completed where id=new.selection_step_id and user_id=new.user_id;
 end if; return new;
end $$;
create trigger task_completion after update of completed on public.tasks for each row execute function public.sync_task_completion();
-- Transfer the new personal tables only when the existing redemption actually consumes a code.
create function public.transfer_v11_data() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.transfer_code_hash is not null and new.transfer_code_hash is null and auth.uid() is not null and new.id<>auth.uid() then
 insert into public.watchlist(user_id,recruitment_template_id,created_at) select auth.uid(),recruitment_template_id,created_at from public.watchlist where user_id=new.id on conflict(user_id,recruitment_template_id) do nothing;
 delete from public.watchlist where user_id=new.id;
 update public.template_reports set user_id=auth.uid() where user_id=new.id;
 insert into public.user_preferences(user_id,auto_create_tasks,auto_calendar) select auth.uid(),auto_create_tasks,auto_calendar from public.user_preferences where user_id=new.id on conflict(user_id) do update set auto_create_tasks=excluded.auto_create_tasks,auto_calendar=excluded.auto_calendar;
 delete from public.user_preferences where user_id=new.id;
 end if; return new;
end $$;
create trigger transfer_v11 after update of transfer_code_hash on public.anonymous_users for each row execute function public.transfer_v11_data();
revoke all on function public.apply_template_deadline(uuid,date),public.reorder_steps(uuid,uuid[]),public.normalize_step_state(),public.sync_step_task(),public.sync_task_completion(),public.transfer_v11_data() from public,anon;
grant execute on function public.apply_template_deadline(uuid,date),public.reorder_steps(uuid,uuid[]) to authenticated;
-- Atomic CSV import, always scoped to the caller; invoker privileges enforce RLS.
create or replace function public.import_bundle(payload jsonb) returns integer language plpgsql security invoker set search_path='' as $$
declare item jsonb; app public.user_applications; step public.selection_steps; task public.tasks; n int:=0;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 perform set_config('career.importing','true',true);
 if length(payload::text)>5242880 or jsonb_array_length(payload->'applications')>500 then raise exception 'Import too large'; end if;
 for item in select * from jsonb_array_elements(payload->'applications') loop
  app:=jsonb_populate_record(null::public.user_applications,item);
  app.user_id:=auth.uid(); app.company_id:=null; app.recruitment_template_id:=null;
  insert into public.user_applications select (app).*; n:=n+1;
 end loop;
 for item in select * from jsonb_array_elements(payload->'steps') loop
  step:=jsonb_populate_record(null::public.selection_steps,item); step.user_id:=auth.uid(); step.state:=coalesce(step.state,case when step.completed then '完了' else '未着手' end);
  insert into public.selection_steps select (step).*;
 end loop;
 for item in select * from jsonb_array_elements(payload->'tasks') loop
  task:=jsonb_populate_record(null::public.tasks,item); task.user_id:=auth.uid();
  insert into public.tasks select (task).*;
 end loop;
 perform set_config('career.importing','false',true);
 return n;
end $$;

commit;
