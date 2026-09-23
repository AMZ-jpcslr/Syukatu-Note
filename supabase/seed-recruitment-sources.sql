-- Run after migration 005 and the existing 50-company seed. Existing sources are preserved.
insert into public.company_sources(company_id,company_name,source_type,url,monitor_enabled,monitor_priority)
select distinct c.id,c.name,'recruitment',coalesce(nullif(t.source_url,''),nullif(t.url,''),c.website),true,'medium'
from public.companies c join public.recruitment_templates t on t.company_id=c.id
where c.seed_key is not null and t.public
and coalesce(nullif(t.source_url,''),nullif(t.url,''),c.website) ~* '^https?://'
on conflict do nothing;
select count(distinct company_id) as monitored_seed_companies from public.company_sources
where owner_user_id is null and company_id in(select id from public.companies where seed_key is not null);
