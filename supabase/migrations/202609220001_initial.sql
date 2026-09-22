-- Apply through Supabase SQL Editor or supabase db push. PostgreSQL 15+.
create extension if not exists pgcrypto with schema extensions;
create table public.anonymous_users (
 id uuid primary key references auth.users(id) on delete cascade,
 transfer_code_hash text unique, transfer_expires_at timestamptz,
 created_at timestamptz not null default now()
);
create table public.companies (
 id uuid primary key default gen_random_uuid(), name text not null unique,
 industry text not null default '', website text not null default ''
);
create table public.recruitment_templates (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
 company_name text not null check(length(company_name) between 1 and 120),
 graduation_year integer not null check(graduation_year between 2020 and 2100),
 job_category text not null default '', position_name text not null default '',
 selection_type text not null check(selection_type in ('本選考','早期選考','インターン','採用直結インターン','説明会','その他')),
 application_start date, application_deadline date,
 url text not null default '' check(url = '' or url ~* '^https?://'),
 public boolean not null default false,
 public_flow jsonb not null default '[]',
 created_by_user_id uuid references public.anonymous_users(id),
 created_at timestamptz not null default now(),
 check(application_start is null or application_deadline is null or application_start <= application_deadline)
);
create table public.user_applications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.anonymous_users(id),
 recruitment_template_id uuid references public.recruitment_templates(id) on delete set null,
 company_id uuid references public.companies(id),
 company_name text not null check(length(company_name) between 1 and 120),
 industry text not null default '', graduation_year integer not null check(graduation_year between 2020 and 2100),
 job_category text not null default '', position_name text not null default '', course_name text not null default '',
 selection_type text not null check(selection_type in ('本選考','早期選考','インターン','採用直結インターン','説明会','その他')),
 application_start date, application_deadline date,
 url text not null default '' check(url = '' or url ~* '^https?://'),
 location text not null default '', priority text not null default 'B' check(priority in ('S','A','B','C')),
 status text not null default '検討中' check(status in ('検討中','応募予定','応募済','選考中','内定','不合格','辞退')),
 memo text not null default '', research text not null default '', tags text[] not null default '{}',
 created_at timestamptz not null default now(), unique(id,user_id),
 check(application_start is null or application_deadline is null or application_start <= application_deadline)
);
create table public.selection_steps (
 id uuid primary key default gen_random_uuid(), user_id uuid not null, user_application_id uuid not null,
 title text not null check(length(title) between 1 and 300), step_type text not null,
 deadline date, scheduled_at timestamptz, completed boolean not null default false,
 result text not null default '', memo text not null default '', url text not null default '' check(url = '' or url ~* '^https?://'),
 order_index integer not null default 0,
 foreign key(user_application_id,user_id) references public.user_applications(id,user_id) on delete cascade on update cascade
);
create table public.tasks (
 id uuid primary key default gen_random_uuid(), user_id uuid not null, user_application_id uuid not null,
 title text not null check(length(title) between 1 and 300), task_type text not null default 'その他',
 due_date date, completed boolean not null default false, memo text not null default '', url text not null default '' check(url = '' or url ~* '^https?://'),
 foreign key(user_application_id,user_id) references public.user_applications(id,user_id) on delete cascade on update cascade
);
create table public.es_questions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null, user_application_id uuid not null,
 question text not null check(length(question) between 1 and 2000), max_length integer not null default 400 check(max_length between 1 and 50000),
 answer text not null default '', status text not null default '下書き' check(status in ('下書き','完成','提出済み')),
 foreign key(user_application_id,user_id) references public.user_applications(id,user_id) on delete cascade on update cascade
);
create table public.interview_notes (
 id uuid primary key default gen_random_uuid(), user_id uuid not null, user_application_id uuid not null,
 scheduled_at timestamptz not null, stage text not null, format text not null check(format in ('オンライン','対面')),
 interviewer text not null default '', questions text not null default '', answers text not null default '', reflection text not null default '', result text not null default '',
 foreign key(user_application_id,user_id) references public.user_applications(id,user_id) on delete cascade on update cascade
);
create table public.transfer_attempts (user_id uuid primary key references auth.users(id) on delete cascade, window_at timestamptz not null default now(), attempts int not null default 0);
alter table public.transfer_attempts enable row level security;
revoke all on public.transfer_attempts from anon,authenticated;
alter table public.anonymous_users enable row level security;
create policy own_profile_read on public.anonymous_users for select to authenticated using(id=(select auth.uid()));
create policy own_profile_insert on public.anonymous_users for insert to authenticated with check(id=(select auth.uid()) and transfer_code_hash is null and transfer_expires_at is null);
revoke all on public.anonymous_users from anon,authenticated;
grant select(id,created_at),insert(id) on public.anonymous_users to authenticated;

alter table public.companies enable row level security;
create policy companies_read on public.companies for select to authenticated using(true);
revoke all on public.companies from anon,authenticated;
grant select on public.companies to authenticated;
alter table public.recruitment_templates enable row level security;
create policy template_read on public.recruitment_templates for select to authenticated using(public or created_by_user_id=(select auth.uid()));
create policy template_update on public.recruitment_templates for update to authenticated using(created_by_user_id=(select auth.uid())) with check(created_by_user_id=(select auth.uid()));
revoke all on public.recruitment_templates from anon,authenticated;
grant select on public.recruitment_templates to authenticated;
-- Only visibility can be edited directly. Publication goes through an allowlisted RPC.
grant update(public) on public.recruitment_templates to authenticated;

do $$
declare t text;
begin
 foreach t in array array['user_applications','selection_steps','tasks','es_questions','interview_notes'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy own_data on public.%I for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()))',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 execute format('create index on public.%I(user_id)',t);
 end loop;
end $$;
create index on public.user_applications(application_deadline);
create index on public.recruitment_templates(company_name,graduation_year);
create index on public.selection_steps(user_application_id);
create index on public.tasks(user_application_id);
create index on public.es_questions(user_application_id);
create index on public.interview_notes(user_application_id);

create function public.publish_template(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare company uuid; result uuid; safe_flow jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if length(payload::text)>30000 then raise exception 'Payload too large'; end if;
 if (select count(*) from public.recruitment_templates where created_by_user_id=auth.uid() and created_at>now()-interval '1 day')>=30 then raise exception 'Daily publication limit reached'; end if;
 -- Only titles chosen in the publication dialog, never private step notes or results.
 select coalesce(jsonb_agg(jsonb_build_object('title',left(e->>'title',300),'step_type',e->>'step_type')),'[]'::jsonb) into safe_flow
 from jsonb_array_elements(coalesce(payload->'public_flow','[]'::jsonb)) e;
 insert into public.companies(name) values(trim(payload->>'company_name')) on conflict(name) do update set name=excluded.name returning id into company;
 insert into public.recruitment_templates(company_id,company_name,graduation_year,job_category,position_name,selection_type,application_start,application_deadline,url,public,public_flow,created_by_user_id)
 values(company,trim(payload->>'company_name'),(payload->>'graduation_year')::int,payload->>'job_category',payload->>'position_name',payload->>'selection_type',nullif(payload->>'application_start','')::date,nullif(payload->>'application_deadline','')::date,coalesce(payload->>'url',''),true,safe_flow,auth.uid())
 returning id into result;
 return result;
end $$;
create function public.copy_template(template_id uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare t public.recruitment_templates; result uuid; s jsonb; i int:=0;
begin
 select * into t from public.recruitment_templates where id=template_id and public;
 if not found then raise exception 'Template not available'; end if;
 insert into public.user_applications(user_id,recruitment_template_id,company_id,company_name,graduation_year,job_category,position_name,selection_type,application_start,application_deadline,url)
 values(auth.uid(),t.id,t.company_id,t.company_name,t.graduation_year,t.job_category,t.position_name,t.selection_type,t.application_start,t.application_deadline,t.url) returning id into result;
 for s in select * from jsonb_array_elements(t.public_flow) loop
 insert into public.selection_steps(user_id,user_application_id,title,step_type,order_index) values(auth.uid(),result,s->>'title',s->>'step_type',i); i:=i+1;
 end loop;
 return result;
end $$;
create function public.issue_transfer_code() returns text language plpgsql security definer set search_path='' as $$
declare code text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 code:=encode(extensions.gen_random_bytes(32),'hex');
 update public.anonymous_users set transfer_code_hash=encode(extensions.digest(code,'sha256'),'hex'),transfer_expires_at=now()+interval '30 days' where id=auth.uid();
 if not found then raise exception 'Profile not initialized'; end if;
 return code;
end $$;
create function public.redeem_transfer_code(code text) returns boolean language plpgsql security definer set search_path='' as $$
declare old_id uuid; current_id uuid:=auth.uid(); tries int;
begin
 if current_id is null then raise exception 'Authentication required'; end if;
 insert into public.transfer_attempts(user_id,attempts) values(current_id,1)
 on conflict(user_id) do update set attempts=case when public.transfer_attempts.window_at<now()-interval '1 hour' then 1 else public.transfer_attempts.attempts+1 end,
 window_at=case when public.transfer_attempts.window_at<now()-interval '1 hour' then now() else public.transfer_attempts.window_at end returning attempts into tries;
 if tries>5 or length(code)<>64 then return false; end if;
 select id into old_id from public.anonymous_users where transfer_code_hash=encode(extensions.digest(code,'sha256'),'hex') and transfer_expires_at>now() for update;
 if old_id is null or old_id=current_id then return false; end if;
 -- A row lock makes redemption single-use; composite FKs cascade ownership atomically.
 update public.user_applications set user_id=current_id where user_id=old_id;
 update public.recruitment_templates set created_by_user_id=current_id where created_by_user_id=old_id;
 update public.anonymous_users set transfer_code_hash=null,transfer_expires_at=null where id in (old_id,current_id);
 return true;
end $$;
revoke all on function public.publish_template(jsonb),public.copy_template(uuid),public.issue_transfer_code(),public.redeem_transfer_code(text) from public,anon;
grant execute on function public.publish_template(jsonb),public.copy_template(uuid),public.issue_transfer_code(),public.redeem_transfer_code(text) to authenticated;
