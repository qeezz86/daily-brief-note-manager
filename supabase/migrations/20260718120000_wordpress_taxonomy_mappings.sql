-- Phase 5B: owner-scoped WordPress taxonomy mappings and backup snapshot support.

create table public.wordpress_taxonomy_mappings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  site_origin text not null,
  mapping_kind text not null
    constraint wordpress_taxonomy_mappings_kind_check
    check (mapping_kind in ('category', 'tag')),
  local_key text not null
    constraint wordpress_taxonomy_mappings_local_key_check
    check (local_key = btrim(local_key) and local_key <> ''),
  wordpress_taxonomy text not null,
  wordpress_term_id bigint not null
    constraint wordpress_taxonomy_mappings_term_id_check
    check (wordpress_term_id > 0),
  wordpress_term_slug text not null
    constraint wordpress_taxonomy_mappings_term_slug_check
    check (wordpress_term_slug = btrim(wordpress_term_slug) and wordpress_term_slug <> ''),
  wordpress_term_name text not null
    constraint wordpress_taxonomy_mappings_term_name_check
    check (wordpress_term_name = btrim(wordpress_term_name) and wordpress_term_name <> ''),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wordpress_taxonomy_mappings_site_origin_check check (
    site_origin = btrim(site_origin)
    and site_origin ~ '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$'
  ),
  constraint wordpress_taxonomy_mappings_taxonomy_check check (
    (mapping_kind = 'category' and wordpress_taxonomy = 'category')
    or (mapping_kind = 'tag' and wordpress_taxonomy = 'post_tag')
  ),
  constraint wordpress_taxonomy_mappings_owner_site_kind_key
    unique (owner_id, site_origin, mapping_kind, local_key)
);

create index wordpress_taxonomy_mappings_owner_site_kind_idx
  on public.wordpress_taxonomy_mappings (owner_id, site_origin, mapping_kind, local_key);

create trigger wordpress_taxonomy_mappings_set_updated_at
before update on public.wordpress_taxonomy_mappings
for each row execute function public.set_updated_at();

alter table public.wordpress_taxonomy_mappings enable row level security;
revoke all on table public.wordpress_taxonomy_mappings from public, anon, authenticated;
grant select, insert, update, delete on table public.wordpress_taxonomy_mappings to authenticated;

create policy wordpress_taxonomy_mappings_select_own
on public.wordpress_taxonomy_mappings for select to authenticated
using ((select auth.uid()) = owner_id);

create policy wordpress_taxonomy_mappings_insert_own
on public.wordpress_taxonomy_mappings for insert to authenticated
with check ((select auth.uid()) = owner_id);

create policy wordpress_taxonomy_mappings_update_own
on public.wordpress_taxonomy_mappings for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy wordpress_taxonomy_mappings_delete_own
on public.wordpress_taxonomy_mappings for delete to authenticated
using ((select auth.uid()) = owner_id);

comment on table public.wordpress_taxonomy_mappings is
  'Explicit, user-confirmed local category/tag mappings to an existing WordPress term. Contains no credential.';

-- Preserve the Phase 4B implementations and wrap them so the version 1 backup
-- contract can gain an optional, backward-compatible settings collection.
alter function public.get_user_backup_estimate(text) rename to get_user_backup_estimate_phase4b;
alter function public.get_user_backup_snapshot(text) rename to get_user_backup_snapshot_phase4b;

create function public.get_user_backup_estimate(p_profile text default 'core')
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_result jsonb;
  v_mapping_count bigint;
begin
  if v_owner_id is null then
    raise exception using errcode = '42501', message = 'BACKUP_AUTH_REQUIRED';
  end if;

  v_result := public.get_user_backup_estimate_phase4b(p_profile);
  select count(*) into v_mapping_count
  from public.wordpress_taxonomy_mappings
  where owner_id = v_owner_id;

  v_result := jsonb_set(
    v_result,
    '{sectionCounts}',
    (v_result -> 'sectionCounts') || jsonb_build_object('wordpressTaxonomyMappings', v_mapping_count)
  );
  return jsonb_set(
    v_result,
    '{totalRecords}',
    to_jsonb((v_result ->> 'totalRecords')::bigint + v_mapping_count)
  );
end;
$$;

create function public.get_user_backup_snapshot(p_profile text default 'core')
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_result jsonb;
  v_mappings jsonb;
  v_mapping_count bigint;
begin
  if v_owner_id is null then
    raise exception using errcode = '42501', message = 'BACKUP_AUTH_REQUIRED';
  end if;

  v_result := public.get_user_backup_snapshot_phase4b(p_profile);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'siteOrigin', site_origin,
    'mappingKind', mapping_kind,
    'localKey', local_key,
    'wordpressTaxonomy', wordpress_taxonomy,
    'wordpressTermId', wordpress_term_id,
    'wordpressTermSlug', wordpress_term_slug,
    'wordpressTermName', wordpress_term_name,
    'verifiedAt', verified_at,
    'createdAt', created_at,
    'updatedAt', updated_at
  ) order by site_origin, mapping_kind, local_key, id), '[]'::jsonb), count(*)
  into v_mappings, v_mapping_count
  from public.wordpress_taxonomy_mappings
  where owner_id = v_owner_id;

  v_result := jsonb_set(
    v_result,
    '{data}',
    (v_result -> 'data') || jsonb_build_object('wordpressTaxonomyMappings', v_mappings)
  );
  v_result := jsonb_set(
    v_result,
    '{sectionCounts}',
    (v_result -> 'sectionCounts') || jsonb_build_object('wordpressTaxonomyMappings', v_mapping_count)
  );
  return jsonb_set(
    v_result,
    '{totalRecords}',
    to_jsonb((v_result ->> 'totalRecords')::bigint + v_mapping_count)
  );
end;
$$;

comment on function public.get_user_backup_estimate(text) is
  'Returns current-user backup counts including WordPress taxonomy mappings.';
comment on function public.get_user_backup_snapshot(text) is
  'Returns a deterministic current-user backup snapshot including credential-free WordPress taxonomy mappings.';

revoke all on function public.get_user_backup_estimate_phase4b(text) from public, anon, authenticated;
revoke all on function public.get_user_backup_snapshot_phase4b(text) from public, anon, authenticated;
revoke all on function public.get_user_backup_estimate(text) from public, anon;
revoke all on function public.get_user_backup_snapshot(text) from public, anon;
-- The wrappers are SECURITY INVOKER and deliberately call the preserved
-- SECURITY INVOKER implementations, so authenticated needs execute on both.
-- RLS and auth.uid() continue to scope every row to the caller.
grant execute on function public.get_user_backup_estimate_phase4b(text) to authenticated;
grant execute on function public.get_user_backup_snapshot_phase4b(text) to authenticated;
grant execute on function public.get_user_backup_estimate(text) to authenticated;
grant execute on function public.get_user_backup_snapshot(text) to authenticated;

-- Extend the Phase 4B restore dispatcher without duplicating its mature core
-- section logic. The preserved functions still execute only from the new
-- security-definer wrappers and mapping owner_id always comes from auth.uid().
alter function public.restore_target_exists(text, text) rename to restore_target_exists_phase4b;
alter function public.restore_verify_existing(public.restore_job_records) rename to restore_verify_existing_phase4b;
alter function public.restore_apply_record(public.restore_job_records, boolean) rename to restore_apply_record_phase4b;

create function public.restore_target_exists(p_section text, p_target text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_section = 'wordpressTaxonomyMappings' then
    return p_target is not null
      and p_target ~* '^[0-9a-f-]{36}$'
      and exists(select 1 from public.wordpress_taxonomy_mappings where id = p_target::uuid);
  end if;
  return public.restore_target_exists_phase4b(p_section, p_target);
end;
$$;

create function public.restore_verify_existing(p_record public.restore_job_records)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  p jsonb := p_record.payload;
begin
  if p_record.section <> 'wordpressTaxonomyMappings' then
    return public.restore_verify_existing_phase4b(p_record);
  end if;
  if p_record.target_id is null or p_record.target_id !~* '^[0-9a-f-]{36}$' then return false; end if;
  return exists(
    select 1 from public.wordpress_taxonomy_mappings mapping
    where mapping.id = p_record.target_id::uuid
      and mapping.owner_id = p_record.owner_id
      and mapping.site_origin = p ->> 'siteOrigin'
      and mapping.mapping_kind = p ->> 'mappingKind'
      and mapping.local_key = p ->> 'localKey'
      and mapping.wordpress_taxonomy = p ->> 'wordpressTaxonomy'
      and mapping.wordpress_term_id = (p ->> 'wordpressTermId')::bigint
      and mapping.wordpress_term_slug = p ->> 'wordpressTermSlug'
      and mapping.wordpress_term_name = p ->> 'wordpressTermName'
  );
end;
$$;

create function public.restore_apply_record(p_record public.restore_job_records, p_preserve boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  p jsonb := p_record.payload;
  target uuid;
  created_ts timestamptz;
  updated_ts timestamptz;
begin
  if p_record.section <> 'wordpressTaxonomyMappings' then
    return public.restore_apply_record_phase4b(p_record, p_preserve);
  end if;
  if p_record.action in ('reuse_existing', 'skip') then
    if not public.restore_verify_existing(p_record) then
      raise exception '%', case when p_record.action = 'skip' then 'RESTORE_SKIP_MISMATCH' else 'RESTORE_REUSE_MISMATCH' end using errcode = '23514';
    end if;
    return case when p_record.action = 'skip' then 'skipped' else 'reused' end;
  end if;
  if p_record.target_id is null or p_record.target_id !~* '^[0-9a-f-]{36}$' then
    raise exception 'RESTORE_INVALID_PAYLOAD' using errcode = '23514';
  end if;
  target := p_record.target_id::uuid;
  created_ts := case when p_preserve then (p ->> 'createdAt')::timestamptz else statement_timestamp() end;
  updated_ts := case when p_preserve then (p ->> 'updatedAt')::timestamptz else statement_timestamp() end;
  begin
    insert into public.wordpress_taxonomy_mappings(
      id, owner_id, site_origin, mapping_kind, local_key, wordpress_taxonomy,
      wordpress_term_id, wordpress_term_slug, wordpress_term_name, verified_at,
      created_at, updated_at
    ) values (
      target, p_record.owner_id, p ->> 'siteOrigin', p ->> 'mappingKind', p ->> 'localKey', p ->> 'wordpressTaxonomy',
      (p ->> 'wordpressTermId')::bigint, p ->> 'wordpressTermSlug', p ->> 'wordpressTermName',
      (p ->> 'verifiedAt')::timestamptz, created_ts, updated_ts
    );
  exception
    when unique_violation then raise exception 'RESTORE_UNIQUE_KEY_CONFLICT' using errcode = '23505';
    when foreign_key_violation then raise exception 'RESTORE_MISSING_DEPENDENCY' using errcode = '23503';
    when check_violation or not_null_violation or invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
      raise exception 'RESTORE_INVALID_PAYLOAD' using errcode = '23514';
  end;
  return 'applied';
end;
$$;

create or replace function public.finalize_restore_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  own uuid := (select auth.uid());
  job public.restore_jobs;
  total integer;
  dep text;
  rec public.restore_job_records;
  jobs_stage integer;
  items_stage integer;
  attempts_stage integer;
  core_stage integer;
begin
  if own is null then raise exception 'RESTORE_PERMISSION_DENIED' using errcode = '42501'; end if;
  select * into job from public.restore_jobs where id = p_job_id and owner_id = own for update;
  if job.id is null then raise exception 'RESTORE_PERMISSION_DENIED' using errcode = '42501'; end if;
  if job.status <> 'preparing' then
    return jsonb_build_object('jobId', job.id, 'status', job.status, 'recordCount', (select count(*) from public.restore_job_records where job_id = p_job_id), 'idempotent', true);
  end if;
  select count(*) into total from public.restore_job_records where job_id = p_job_id and owner_id = own;
  if total <> job.expected_record_count then raise exception 'RESTORE_RECORD_COUNT_MISMATCH' using errcode = '23514'; end if;
  if exists(
    select 1 from public.restore_job_records r where r.job_id = p_job_id
      and (r.section not in ('wordpressTaxonomyMappings','tags','posts','seoData','aiMetadata','infoDbMetadata','chineseMetadata','postTags','seriesCounters','newsTopics','newsStatusHistory','newsUpdates','newsUpdatePreviousLinks','sources','newsFollowups','generatedPrompts','importJobs','importJobItems','importJobItemAttempts')
        or public.restore_payload_fingerprint(r.payload) <> r.payload_fingerprint)
  ) then raise exception 'RESTORE_INVALID_PAYLOAD' using errcode = '23514'; end if;
  if exists(select 1 from public.restore_job_records r where r.job_id = p_job_id and r.owner_id = own and r.action in ('create','preserve_id','remap_id') and r.target_id is not null group by r.section, r.target_id having count(*) > 1) then
    raise exception 'RESTORE_TARGET_ID_CONFLICT' using errcode = '23505';
  end if;
  perform public.restore_validate_import_history_plan(job);
  select max(stage_order) filter(where section not in ('importJobs','importJobItems','importJobItemAttempts')),
    min(stage_order) filter(where section='importJobs'),
    min(stage_order) filter(where section='importJobItems'),
    min(stage_order) filter(where section='importJobItemAttempts')
  into core_stage, jobs_stage, items_stage, attempts_stage
  from public.restore_job_records where job_id=p_job_id;
  if jobs_stage is not null and (
    core_stage is null or jobs_stage <= core_stage or items_stage is null
    or items_stage <= jobs_stage or attempts_stage is null or attempts_stage <= items_stage
  ) then
    raise exception 'RESTORE_STAGE_BLOCKED' using errcode='23514';
  end if;

  for rec in select * from public.restore_job_records where job_id = p_job_id loop
    if rec.action in ('create','preserve_id','remap_id') and public.restore_target_exists(rec.section, rec.target_id) then raise exception 'RESTORE_TARGET_ID_CONFLICT' using errcode = '23505'; end if;
    for dep in select jsonb_array_elements_text(rec.dependencies) loop
      if dep like 'category:%' then
        if not exists(select 1 from jsonb_array_elements(job.category_mappings) m join public.categories c on c.id = m ->> 'targetCategoryId' where m ->> 'sourceCategoryId' = substr(dep, 10) and m ->> 'status' <> 'blocked' and c.content_group = m -> 'target' ->> 'contentGroup' and c.code = m -> 'target' ->> 'code') then raise exception 'RESTORE_CATEGORY_MISMATCH' using errcode = '23514'; end if;
      elsif not exists(select 1 from public.restore_job_records d where d.job_id = p_job_id and d.section = split_part(dep, ':', 1) and d.source_id = substr(dep, length(split_part(dep, ':', 1)) + 2)) then
        raise exception 'RESTORE_MISSING_DEPENDENCY' using errcode = '23514';
      end if;
    end loop;
  end loop;
  update public.restore_jobs set status = 'ready', current_stage_key = (select stage_key from public.restore_job_records where job_id = p_job_id order by stage_order, sequence_no limit 1) where id = p_job_id;
  return jsonb_build_object('jobId', p_job_id, 'status', 'ready', 'recordCount', total, 'idempotent', false);
end;
$$;

revoke all on function public.restore_target_exists_phase4b(text, text) from public, anon, authenticated;
revoke all on function public.restore_verify_existing_phase4b(public.restore_job_records) from public, anon, authenticated;
revoke all on function public.restore_apply_record_phase4b(public.restore_job_records, boolean) from public, anon, authenticated;
revoke all on function public.restore_target_exists(text, text) from public, anon, authenticated;
revoke all on function public.restore_verify_existing(public.restore_job_records) from public, anon, authenticated;
revoke all on function public.restore_apply_record(public.restore_job_records, boolean) from public, anon, authenticated;
