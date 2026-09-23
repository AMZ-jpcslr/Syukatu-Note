-- Additive update: retain all dates, application IDs, private records and RLS.
begin;
alter table public.recruitment_templates add column deadline_type text not null default 'date' check(deadline_type in ('date','capacity'));
alter table public.user_applications
 add column deadline_type text not null default 'date' check(deadline_type in ('date','capacity')),
 add column copied_deadline_type text not null default 'date' check(copied_deadline_type in ('date','capacity')),
 add column application_status text not null default 'unknown' check(application_status in ('open','upcoming','closed','unknown'));
-- Existing private applications remain unknown; do not apply current public status retroactively.
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
 insert into public.recruitment_templates(company_id,company_name,graduation_year,job_category,position_name,selection_type,application_start,application_deadline,deadline_type,application_status,url,source_url,source_type,verification_status,public,public_flow,created_by_user_id)
 values(company,trim(payload->>'company_name'),(payload->>'graduation_year')::int,coalesce(payload->>'job_category',''),coalesce(payload->>'position_name',''),payload->>'selection_type',nullif(payload->>'application_start','')::date,nullif(payload->>'application_deadline','')::date,coalesce(payload->>'deadline_type','date'),coalesce(payload->>'application_status','unknown'),official_url,official_url,'user_submitted','unverified',true,safe_flow,auth.uid()) returning id into result;
 return result;
end $$;
create or replace function public.copy_template(template_id uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare t public.recruitment_templates; result uuid; s jsonb; i int:=0;
begin
 select * into t from public.recruitment_templates where id=template_id and public and url ~* '^https?://[^/ ]+';
 if not found then raise exception 'Template not available'; end if;
 insert into public.user_applications(user_id,recruitment_template_id,company_id,company_name,industry,tags,graduation_year,job_category,position_name,selection_type,application_start,application_deadline,copied_application_deadline,deadline_type,copied_deadline_type,application_status,last_verified_at,url,status,priority)
 select auth.uid(),t.id,t.company_id,t.company_name,c.industry,c.tags,t.graduation_year,t.job_category,t.position_name,t.selection_type,t.application_start,t.application_deadline,t.application_deadline,t.deadline_type,t.deadline_type,t.application_status,t.last_verified_at,t.url,'応募予定','未設定' from public.companies c where c.id=t.company_id returning id into result;
 for s in select * from jsonb_array_elements(t.public_flow) loop
 insert into public.selection_steps(user_id,user_application_id,title,step_type,order_index) values(auth.uid(),result,s->>'title',s->>'step_type',i); i:=i+1;
 end loop;
 return result;
end $$;
create or replace function public.import_bundle(payload jsonb) returns integer language plpgsql security invoker set search_path='' as $$
declare item jsonb; app public.user_applications; step public.selection_steps; task public.tasks; n int:=0;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 perform set_config('career.importing','true',true);
 if length(payload::text)>5242880 or jsonb_array_length(payload->'applications')>500 then raise exception 'Import too large'; end if;
 for item in select * from jsonb_array_elements(payload->'applications') loop
  app:=jsonb_populate_record(null::public.user_applications,item);
  app.deadline_type:=coalesce(app.deadline_type,'date'); app.copied_deadline_type:=coalesce(app.copied_deadline_type,'date'); app.application_status:=coalesce(app.application_status,'unknown');
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
create function public.apply_template_deadline_details(application_id uuid, expected_deadline date, expected_type text) returns void language plpgsql security invoker set search_path='' as $$
declare t public.recruitment_templates;
begin
 select rt.* into t from public.recruitment_templates rt join public.user_applications a on a.recruitment_template_id=rt.id where a.id=application_id and a.user_id=auth.uid() and rt.public;
 if not found then raise exception 'Template not available'; end if;
 if t.application_deadline is distinct from expected_deadline or t.deadline_type is distinct from expected_type then raise exception '募集情報を再読み込みしてください'; end if;
 update public.user_applications set application_deadline=t.application_deadline,copied_application_deadline=t.application_deadline,deadline_type=t.deadline_type,copied_deadline_type=t.deadline_type,last_verified_at=t.last_verified_at where id=application_id and user_id=auth.uid();
end $$;
revoke all on function public.apply_template_deadline_details(uuid,date,text) from public,anon;
grant execute on function public.apply_template_deadline_details(uuid,date,text) to authenticated;
-- Only the posting user may update public availability, under the existing owner policy.
grant update(application_status) on public.recruitment_templates to authenticated;
commit;
