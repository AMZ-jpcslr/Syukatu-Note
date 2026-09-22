-- Read-only v1.1 deployment checks; no user content or secrets are returned.
select table_name,column_name from information_schema.columns
where table_schema='public' and (column_name in ('source_url','verification_status','application_status','copied_application_deadline','state','selection_step_id','submitted_at','qa_pairs','seed_key')) order by table_name,column_name;
select relname as table_name,relrowsecurity as rls_enabled from pg_class join pg_namespace n on n.oid=relnamespace
where n.nspname='public' and relname in ('user_applications','selection_steps','tasks','es_questions','interview_notes','user_preferences','watchlist','template_reports') order by relname;
select routine_name from information_schema.routines where routine_schema='public' and routine_name in ('copy_template','publish_template','apply_template_deadline','reorder_steps','sync_step_task','import_bundle');
select count(*) as seeded_companies from public.companies where seed_key like 'career-company-%';
select count(distinct c.id) as companies_with_public_2028_templates from public.companies c join public.recruitment_templates t on t.company_id=c.id where c.seed_key like 'career-company-%' and t.graduation_year=2028 and t.public;
