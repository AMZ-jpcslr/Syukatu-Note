-- Read-only v2 deployment diagnostic. No private row contents are selected.
select name,to_regclass('public.'||name) is not null as exists
from unnest(array['import_inbox','data_sources','imported_events','import_audit','extension_pairings','extension_tokens','gmail_connections','gmail_oauth_states','user_profiles']) name;
select relname,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname in('import_inbox','data_sources','imported_events','import_audit','extension_pairings','extension_tokens','gmail_connections','gmail_oauth_states','user_profiles');
select to_regprocedure('public.review_private_import(jsonb)') is not null as review_rpc,
 to_regprocedure('public.claim_extension_pairing(text,text,text)') is not null as pairing_rpc;
select column_name from information_schema.columns where table_schema='public' and table_name='tasks' and column_name in('due_value','estimated_minutes','calendar_enabled','field_provenance');
