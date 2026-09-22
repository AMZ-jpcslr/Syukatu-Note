-- Read-only setup diagnostic. Does not read application content or modify the DB.
with expected_tables(name) as (
  values ('anonymous_users'), ('companies'), ('recruitment_templates'),
    ('user_applications'), ('selection_steps'), ('tasks'), ('es_questions'),
    ('interview_notes'), ('transfer_attempts')
), expected_functions(signature) as (
  values ('public.publish_template(jsonb)'), ('public.copy_template(uuid)'),
    ('public.issue_transfer_code()'), ('public.redeem_transfer_code(text)'),
    ('public.import_bundle(jsonb)')
), expected_policies(table_name, policy_name) as (
  values ('anonymous_users','own_profile_read'), ('anonymous_users','own_profile_insert'),
    ('companies','companies_read'), ('recruitment_templates','template_read'),
    ('recruitment_templates','template_update'), ('user_applications','own_data'),
    ('selection_steps','own_data'), ('tasks','own_data'), ('es_questions','own_data'),
    ('interview_notes','own_data')
)
select '1. table / RLS' as check_type, t.name as object_name,
  case when c.oid is null then 'MISSING TABLE'
       when not c.relrowsecurity then 'RLS DISABLED'
       else 'OK' end as result
from expected_tables t
left join pg_class c on c.oid = to_regclass('public.' || t.name)
union all
select '2. function', f.signature,
  case when to_regprocedure(f.signature) is null then 'MISSING FUNCTION' else 'OK' end
from expected_functions f
union all
select '3. policy', p.table_name || '.' || p.policy_name,
  case when exists (
    select 1 from pg_policies actual
    where actual.schemaname='public' and actual.tablename=p.table_name
      and actual.policyname=p.policy_name
  ) then 'OK' else 'MISSING POLICY' end
from expected_policies p
union all
select '4. constraint', 'selection_steps.valid_step_type',
  case when exists (
    select 1 from pg_constraint
    where conrelid=to_regclass('public.selection_steps') and conname='valid_step_type'
  ) then 'OK' else 'MISSING CONSTRAINT' end
order by check_type, object_name;
-- OK confirms expected object presence and RLS enablement, not full schema/permission equivalence.

