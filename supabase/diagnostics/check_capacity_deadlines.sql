-- Read-only checks, no user records or secrets.
select table_name,column_name,data_type,column_default from information_schema.columns
where table_schema='public' and table_name in ('user_applications','recruitment_templates')
and column_name in ('deadline_type','copied_deadline_type','application_status') order by table_name,column_name;
select routine_name from information_schema.routines where routine_schema='public' and routine_name in ('copy_template','publish_template','import_bundle','apply_template_deadline_details');
select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('user_applications','recruitment_templates','selection_steps','tasks','es_questions','interview_notes');
