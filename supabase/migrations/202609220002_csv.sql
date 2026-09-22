-- Atomic CSV import, always scoped to the caller; invoker privileges enforce RLS.
create function public.import_bundle(payload jsonb) returns integer language plpgsql security invoker set search_path='' as $$
declare item jsonb; app public.user_applications; step public.selection_steps; task public.tasks; n int:=0;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if length(payload::text)>5242880 or jsonb_array_length(payload->'applications')>500 then raise exception 'Import too large'; end if;
 for item in select * from jsonb_array_elements(payload->'applications') loop
  app:=jsonb_populate_record(null::public.user_applications,item);
  app.user_id:=auth.uid(); app.company_id:=null; app.recruitment_template_id:=null;
  insert into public.user_applications select (app).*; n:=n+1;
 end loop;
 for item in select * from jsonb_array_elements(payload->'steps') loop
  step:=jsonb_populate_record(null::public.selection_steps,item); step.user_id:=auth.uid();
  insert into public.selection_steps select (step).*;
 end loop;
 for item in select * from jsonb_array_elements(payload->'tasks') loop
  task:=jsonb_populate_record(null::public.tasks,item); task.user_id:=auth.uid();
  insert into public.tasks select (task).*;
 end loop;
 return n;
end $$;
revoke all on function public.import_bundle(jsonb) from public,anon;
grant execute on function public.import_bundle(jsonb) to authenticated;
alter table public.selection_steps add constraint valid_step_type check(step_type in ('応募開始','応募締切','ES締切','Webテスト','一次面接','二次面接','最終面接','GD','インターン','説明会','その他'));

