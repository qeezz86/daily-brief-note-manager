-- Phase 4A-4: durable import jobs, immutable snapshots, resume, retry and idempotent stages.

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  format text not null check (format = 'daily-brief-note-content-import'),
  schema_version integer not null check (schema_version = 1),
  source_name text check (source_name is null or char_length(source_name) <= 500),
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  status text not null default 'preparing' check (status in (
    'preparing', 'ready', 'running', 'completed', 'completed_with_errors', 'cancelled', 'failed'
  )),
  expected_item_count integer not null check (expected_item_count between 1 and 2000),
  total_count integer not null check (total_count between 1 and 2000),
  ready_count integer not null default 0 check (ready_count >= 0),
  warning_count integer not null default 0 check (warning_count >= 0),
  invalid_count integer not null default 0 check (invalid_count >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  acknowledged_warning_count integer not null default 0 check (acknowledged_warning_count >= 0),
  dry_run_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(dry_run_summary) = 'object'),
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (owner_id, source_fingerprint)
);

create table public.import_job_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid not null,
  item_index integer not null check (item_index between 0 and 1999),
  external_key text not null check (char_length(btrim(external_key)) between 1 and 300),
  payload_fingerprint text not null check (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  title text not null check (char_length(btrim(title)) between 1 and 500),
  category_id text not null references public.categories (id) on delete restrict,
  validation_status text not null check (validation_status in ('ready', 'warning')),
  normalized_payload jsonb not null check (jsonb_typeof(normalized_payload) = 'object'),
  warning_acknowledged boolean not null default false,
  content_status text not null default 'pending' check (content_status in (
    'pending', 'running', 'imported', 'failed', 'skipped_duplicate', 'cancelled'
  )),
  tracking_status text not null check (tracking_status in (
    'not_applicable', 'not_present', 'pending', 'running', 'imported', 'failed', 'cancelled'
  )),
  post_id uuid,
  content_attempt_count integer not null default 0 check (content_attempt_count >= 0),
  tracking_attempt_count integer not null default 0 check (tracking_attempt_count >= 0),
  content_error_code text,
  content_error_message text,
  content_retryable boolean not null default false,
  tracking_error_code text,
  tracking_error_message text,
  tracking_retryable boolean not null default false,
  topic_count integer check (topic_count is null or topic_count >= 0),
  reused_topic_count integer check (reused_topic_count is null or reused_topic_count >= 0),
  created_topic_count integer check (created_topic_count is null or created_topic_count >= 0),
  update_count integer check (update_count is null or update_count >= 0),
  followup_count integer check (followup_count is null or followup_count >= 0),
  source_link_count integer check (source_link_count is null or source_link_count >= 0),
  content_started_at timestamptz,
  content_completed_at timestamptz,
  tracking_started_at timestamptz,
  tracking_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (job_id, item_index),
  unique (job_id, external_key),
  foreign key (job_id, owner_id) references public.import_jobs (id, owner_id) on delete cascade,
  foreign key (post_id, owner_id) references public.posts (id, owner_id) on delete restrict
);

create table public.import_job_item_attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  job_item_id uuid not null,
  stage text not null check (stage in ('content', 'tracking')),
  attempt_no integer not null check (attempt_no > 0),
  status text not null check (status in ('running', 'imported', 'failed')),
  safe_error_code text,
  safe_error_message text,
  retryable boolean not null default false,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (job_item_id, stage, attempt_no),
  foreign key (job_item_id, owner_id) references public.import_job_items (id, owner_id) on delete cascade
);

create index import_jobs_owner_created_idx on public.import_jobs (owner_id, created_at desc, id desc);
create index import_jobs_owner_status_created_idx on public.import_jobs (owner_id, status, created_at desc);
create index import_job_items_job_index_idx on public.import_job_items (job_id, item_index);
create index import_job_items_job_content_idx on public.import_job_items (job_id, content_status, item_index);
create index import_job_items_job_tracking_idx on public.import_job_items (job_id, tracking_status, item_index);
create index import_job_attempts_item_started_idx on public.import_job_item_attempts (job_item_id, started_at desc);

create trigger import_jobs_set_updated_at before update on public.import_jobs
for each row execute function public.set_updated_at();
create trigger import_job_items_set_updated_at before update on public.import_job_items
for each row execute function public.set_updated_at();

alter table public.import_jobs enable row level security;
alter table public.import_job_items enable row level security;
alter table public.import_job_item_attempts enable row level security;

revoke all on table public.import_jobs from public, anon, authenticated;
revoke all on table public.import_job_items from public, anon, authenticated;
revoke all on table public.import_job_item_attempts from public, anon, authenticated;
grant select on table public.import_jobs to authenticated;
grant select on table public.import_job_items to authenticated;
grant select on table public.import_job_item_attempts to authenticated;

create policy import_jobs_select_own on public.import_jobs for select to authenticated
using ((select auth.uid()) = owner_id);
create policy import_job_items_select_own on public.import_job_items for select to authenticated
using ((select auth.uid()) = owner_id);
create policy import_job_item_attempts_select_own on public.import_job_item_attempts for select to authenticated
using ((select auth.uid()) = owner_id);

create function public.import_job_safe_error(p_stage text, p_error text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  code_value text;
  message_value text;
  retryable_value boolean := false;
  duplicate_value boolean := false;
begin
  if p_stage = 'content' then
    code_value := case
      when p_error like '%IMPORT_DUPLICATE_SLUG%' then 'IMPORT_DUPLICATE_SLUG'
      when p_error like '%IMPORT_DUPLICATE_WORDPRESS_URL%' then 'IMPORT_DUPLICATE_WORDPRESS_URL'
      when p_error like '%IMPORT_DUPLICATE_BRIEFING%' then 'IMPORT_DUPLICATE_BRIEFING'
      when p_error like '%IMPORT_DUPLICATE_SERIES%' then 'IMPORT_DUPLICATE_SERIES'
      when p_error like '%IMPORT_DUPLICATE_CHINESE_URL%' then 'IMPORT_DUPLICATE_CHINESE_URL'
      when p_error like '%IMPORT_INVALID_CATEGORY%' then 'IMPORT_INVALID_CATEGORY'
      when p_error like '%IMPORT_INVALID_METADATA%' then 'IMPORT_INVALID_METADATA'
      when p_error like '%IMPORT_FORBIDDEN_FIELD%' then 'IMPORT_FORBIDDEN_FIELD'
      when p_error like '%IMPORT_VALIDATION_FAILED%' then 'IMPORT_VALIDATION_FAILED'
      when p_error like '%IMPORT_AUTH_REQUIRED%' then 'IMPORT_AUTH_REQUIRED'
      else 'IMPORT_TEMPORARY_DATABASE_ERROR'
    end;
    duplicate_value := code_value like 'IMPORT_DUPLICATE_%';
    retryable_value := code_value = 'IMPORT_TEMPORARY_DATABASE_ERROR';
    message_value := case
      when duplicate_value then '동일한 콘텐츠가 이미 존재하여 이 항목을 건너뛰었습니다.'
      when code_value = 'IMPORT_INVALID_CATEGORY' then '카테고리가 없거나 비활성 상태입니다.'
      when code_value in ('IMPORT_INVALID_METADATA', 'IMPORT_FORBIDDEN_FIELD', 'IMPORT_VALIDATION_FAILED') then '저장된 Import snapshot이 DB 검증을 통과하지 못했습니다.'
      when code_value = 'IMPORT_AUTH_REQUIRED' then 'Import 권한을 확인할 수 없습니다.'
      else '일시적인 데이터베이스 오류로 콘텐츠 Import에 실패했습니다.'
    end;
  else
    code_value := case
      when p_error like '%IMPORT_TRACKING_INVALID_PAYLOAD%' then 'IMPORT_TRACKING_INVALID_PAYLOAD'
      when p_error like '%IMPORT_TRACKING_INVALID_POST%' then 'IMPORT_TRACKING_INVALID_POST'
      when p_error like '%IMPORT_TRACKING_NOT_NEWS%' then 'IMPORT_TRACKING_NOT_NEWS'
      when p_error like '%IMPORT_TRACKING_TOPIC_CONFLICT%' then 'IMPORT_TRACKING_TOPIC_CONFLICT'
      when p_error like '%IMPORT_TRACKING_DUPLICATE_TOPIC_KEY%' then 'IMPORT_TRACKING_DUPLICATE_TOPIC_KEY'
      when p_error like '%IMPORT_TRACKING_DUPLICATE_UPDATE_KEY%' then 'IMPORT_TRACKING_DUPLICATE_UPDATE_KEY'
      when p_error like '%IMPORT_TRACKING_MISSING_PREVIOUS%' then 'IMPORT_TRACKING_MISSING_PREVIOUS'
      when p_error like '%IMPORT_TRACKING_PREVIOUS_CYCLE%' then 'IMPORT_TRACKING_PREVIOUS_CYCLE'
      when p_error like '%IMPORT_TRACKING_INVALID_UPDATE_TYPE%' then 'IMPORT_TRACKING_INVALID_UPDATE_TYPE'
      when p_error like '%IMPORT_TRACKING_INVALID_CLOSURE%' then 'IMPORT_TRACKING_INVALID_CLOSURE'
      when p_error like '%IMPORT_TRACKING_INVALID_ITEM_ORDER%' then 'IMPORT_TRACKING_INVALID_ITEM_ORDER'
      when p_error like '%IMPORT_TRACKING_SOURCE_NOT_FOUND%' then 'IMPORT_TRACKING_SOURCE_NOT_FOUND'
      when p_error like '%IMPORT_TRACKING_SOURCE_CONFLICT%' then 'IMPORT_TRACKING_SOURCE_CONFLICT'
      when p_error like '%IMPORT_TRACKING_INVALID_FOLLOWUP%' then 'IMPORT_TRACKING_INVALID_FOLLOWUP'
      when p_error like '%IMPORT_TRACKING_PERMISSION_DENIED%' then 'IMPORT_TRACKING_PERMISSION_DENIED'
      else 'IMPORT_TRACKING_TEMPORARY_DATABASE_ERROR'
    end;
    retryable_value := code_value in ('IMPORT_TRACKING_TOPIC_CONFLICT', 'IMPORT_TRACKING_SOURCE_CONFLICT', 'IMPORT_TRACKING_TEMPORARY_DATABASE_ERROR');
    message_value := case
      when code_value = 'IMPORT_TRACKING_TOPIC_CONFLICT' then '현재 뉴스 주제 상태와 snapshot이 충돌합니다. 상태를 확인한 뒤 다시 시도할 수 있습니다.'
      when code_value = 'IMPORT_TRACKING_SOURCE_CONFLICT' then '현재 출처 연결 상태와 충돌합니다. 연결 상태를 확인한 뒤 다시 시도할 수 있습니다.'
      when code_value = 'IMPORT_TRACKING_TEMPORARY_DATABASE_ERROR' then '일시적인 데이터베이스 오류로 tracking Import에 실패했습니다.'
      when code_value = 'IMPORT_TRACKING_PERMISSION_DENIED' then 'tracking Import 권한을 확인할 수 없습니다.'
      else '저장된 뉴스 tracking snapshot이 DB 검증을 통과하지 못했습니다.'
    end;
  end if;
  return jsonb_build_object('code', code_value, 'message', message_value, 'retryable', retryable_value, 'duplicate', duplicate_value);
end;
$$;

create function public.refresh_import_job_status(p_job_id uuid, p_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_status text;
  incomplete_count integer;
  failed_count integer;
begin
  select status into job_status from public.import_jobs
   where id = p_job_id and owner_id = p_owner_id for update;
  if job_status is null or job_status in ('preparing', 'cancelled', 'failed') then return; end if;

  select
    count(*) filter (where content_status in ('pending', 'running') or (content_status = 'imported' and tracking_status in ('pending', 'running'))),
    count(*) filter (where content_status = 'failed' or tracking_status = 'failed')
  into incomplete_count, failed_count
  from public.import_job_items where job_id = p_job_id and owner_id = p_owner_id;

  if incomplete_count > 0 then
    update public.import_jobs set status = 'running', started_at = coalesce(started_at, statement_timestamp()), completed_at = null
     where id = p_job_id and owner_id = p_owner_id;
  elsif failed_count > 0 then
    update public.import_jobs set status = 'completed_with_errors', started_at = coalesce(started_at, statement_timestamp()), completed_at = statement_timestamp()
     where id = p_job_id and owner_id = p_owner_id;
  else
    update public.import_jobs set status = 'completed', started_at = coalesce(started_at, statement_timestamp()), completed_at = statement_timestamp()
     where id = p_job_id and owner_id = p_owner_id;
  end if;
end;
$$;

create function public.create_import_job(
  p_format text,
  p_schema_version integer,
  p_source_name text,
  p_source_fingerprint text,
  p_expected_item_count integer,
  p_dry_run_summary jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := (select auth.uid());
  job_row public.import_jobs;
  was_created boolean := false;
begin
  if current_owner is null then raise exception 'IMPORT_JOB_AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_format <> 'daily-brief-note-content-import' or p_schema_version <> 1
     or p_source_fingerprint !~ '^[0-9a-f]{64}$'
     or p_expected_item_count not between 1 and 2000
     or jsonb_typeof(p_dry_run_summary) is distinct from 'object'
     or public.import_payload_has_forbidden_key(p_dry_run_summary) then
    raise exception 'IMPORT_JOB_INVALID_INPUT' using errcode = '22023';
  end if;

  insert into public.import_jobs (
    owner_id, format, schema_version, source_name, source_fingerprint,
    expected_item_count, total_count, ready_count, warning_count, invalid_count,
    duplicate_count, acknowledged_warning_count, dry_run_summary
  ) values (
    current_owner, p_format, p_schema_version, nullif(btrim(p_source_name), ''), p_source_fingerprint,
    p_expected_item_count, p_expected_item_count,
    greatest(coalesce((p_dry_run_summary ->> 'readyCount')::integer, 0), 0),
    greatest(coalesce((p_dry_run_summary ->> 'warningCount')::integer, 0), 0),
    greatest(coalesce((p_dry_run_summary ->> 'invalidCount')::integer, 0), 0),
    greatest(coalesce((p_dry_run_summary ->> 'duplicateCount')::integer, 0), 0),
    greatest(coalesce((p_dry_run_summary ->> 'acknowledgedWarningCount')::integer, 0), 0),
    p_dry_run_summary
  ) on conflict (owner_id, source_fingerprint) do nothing
  returning * into job_row;
  was_created := job_row.id is not null;
  if not was_created then
    select * into job_row from public.import_jobs
     where owner_id = current_owner and source_fingerprint = p_source_fingerprint;
  end if;
  return jsonb_build_object('jobId', job_row.id, 'isExisting', not was_created, 'status', job_row.status);
exception when invalid_text_representation then
  raise exception 'IMPORT_JOB_INVALID_INPUT' using errcode = '22023';
end;
$$;

create function public.append_import_job_items(p_job_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := (select auth.uid());
  job_row public.import_jobs;
  value jsonb;
  snapshot jsonb;
  existing_row public.import_job_items;
  item_index_value integer;
  external_key_value text;
  fingerprint_value text;
  title_value text;
  category_value text;
  validation_value text;
  warning_value boolean;
  content_group_value text;
  tracking_status_value text;
  inserted_count integer := 0;
  existing_count integer := 0;
begin
  if current_owner is null then raise exception 'IMPORT_JOB_AUTH_REQUIRED' using errcode = '42501'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'IMPORT_JOB_INVALID_CHUNK' using errcode = '22023';
  end if;
  select * into job_row from public.import_jobs where id = p_job_id and owner_id = current_owner for update;
  if job_row.id is null then raise exception 'IMPORT_JOB_NOT_FOUND' using errcode = '42501'; end if;
  if job_row.status <> 'preparing' then raise exception 'IMPORT_JOB_NOT_PREPARING' using errcode = '23514'; end if;

  for value in select item from jsonb_array_elements(p_items) item
  loop
    if jsonb_typeof(value) is distinct from 'object' then raise exception 'IMPORT_JOB_INVALID_ITEM' using errcode = '22023'; end if;
    begin
      item_index_value := (value ->> 'itemIndex')::integer;
      warning_value := coalesce((value ->> 'warningAcknowledged')::boolean, false);
    exception when others then raise exception 'IMPORT_JOB_INVALID_ITEM' using errcode = '22023'; end;
    external_key_value := nullif(btrim(value ->> 'externalKey'), '');
    fingerprint_value := value ->> 'payloadFingerprint';
    title_value := nullif(btrim(value ->> 'title'), '');
    category_value := nullif(btrim(value ->> 'categoryId'), '');
    validation_value := value ->> 'validationStatus';
    snapshot := value -> 'normalizedPayload';
    if item_index_value < 0 or item_index_value >= job_row.expected_item_count
       or external_key_value is null or fingerprint_value !~ '^[0-9a-f]{64}$'
       or title_value is null or category_value is null
       or validation_value not in ('ready', 'warning')
       or jsonb_typeof(snapshot) is distinct from 'object'
       or public.import_payload_has_forbidden_key(snapshot)
       or snapshot ->> 'externalKey' is distinct from external_key_value
       or snapshot -> 'content' ->> 'category_id' is distinct from category_value
       or jsonb_typeof(snapshot -> 'content') is distinct from 'object'
       or not (snapshot ? 'schemaVersion' and snapshot ? 'contentGroup' and snapshot ? 'tracking') then
      raise exception 'IMPORT_JOB_INVALID_ITEM' using errcode = '22023';
    end if;
    select content_group into content_group_value from public.categories where id = category_value and enabled = true;
    if content_group_value is null or snapshot ->> 'contentGroup' is distinct from content_group_value then
      raise exception 'IMPORT_JOB_INVALID_CATEGORY' using errcode = '23514';
    end if;
    if validation_value = 'warning' and not warning_value then
      raise exception 'IMPORT_JOB_WARNING_NOT_ACKNOWLEDGED' using errcode = '23514';
    end if;

    select * into existing_row from public.import_job_items
     where job_id = p_job_id and item_index = item_index_value;
    if existing_row.id is not null then
      if existing_row.payload_fingerprint <> fingerprint_value or existing_row.external_key <> external_key_value then
        raise exception 'IMPORT_JOB_ITEM_CONFLICT' using errcode = '23505';
      end if;
      existing_count := existing_count + 1;
      existing_row := null;
      continue;
    end if;
    tracking_status_value := case
      when content_group_value <> 'news' then 'not_applicable'
      when snapshot -> 'tracking' = 'null'::jsonb then 'not_present'
      else 'pending'
    end;
    insert into public.import_job_items (
      owner_id, job_id, item_index, external_key, payload_fingerprint, title,
      category_id, validation_status, normalized_payload, warning_acknowledged, tracking_status
    ) values (
      current_owner, p_job_id, item_index_value, external_key_value, fingerprint_value, title_value,
      category_value, validation_value, snapshot, warning_value, tracking_status_value
    );
    inserted_count := inserted_count + 1;
  end loop;
  return jsonb_build_object(
    'appendedCount', inserted_count, 'existingCount', existing_count,
    'storedCount', (select count(*) from public.import_job_items where job_id = p_job_id and owner_id = current_owner)
  );
end;
$$;

create function public.finalize_import_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := (select auth.uid());
  job_row public.import_jobs;
  item_count integer;
  minimum_index integer;
  maximum_index integer;
begin
  if current_owner is null then raise exception 'IMPORT_JOB_AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into job_row from public.import_jobs where id = p_job_id and owner_id = current_owner for update;
  if job_row.id is null then raise exception 'IMPORT_JOB_NOT_FOUND' using errcode = '42501'; end if;
  if job_row.status <> 'preparing' then
    return jsonb_build_object('jobId', job_row.id, 'status', job_row.status, 'itemCount', job_row.total_count, 'idempotent', true);
  end if;
  select count(*), min(item_index), max(item_index) into item_count, minimum_index, maximum_index
    from public.import_job_items where job_id = p_job_id and owner_id = current_owner;
  if item_count <> job_row.expected_item_count or minimum_index <> 0 or maximum_index <> item_count - 1
     or exists (select 1 from public.import_job_items where job_id = p_job_id and validation_status = 'warning' and not warning_acknowledged) then
    raise exception 'IMPORT_JOB_FINALIZE_MISMATCH' using errcode = '23514';
  end if;
  update public.import_jobs set status = 'ready', total_count = item_count where id = p_job_id;
  return jsonb_build_object('jobId', p_job_id, 'status', 'ready', 'itemCount', item_count, 'idempotent', false);
end;
$$;

create function public.run_import_job_item_content(p_job_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := (select auth.uid());
  item_row public.import_job_items;
  job_row public.import_jobs;
  attempt_id uuid;
  attempt_no_value integer;
  result_value jsonb;
  error_value jsonb;
  caught_message text;
  duplicate_value boolean;
begin
  if current_owner is null then raise exception 'IMPORT_JOB_AUTH_REQUIRED' using errcode = '42501'; end if;
  select item.* into item_row from public.import_job_items item
   where item.id = p_job_item_id and item.owner_id = current_owner for update;
  if item_row.id is null then raise exception 'IMPORT_JOB_ITEM_NOT_FOUND' using errcode = '42501'; end if;
  select * into job_row from public.import_jobs where id = item_row.job_id and owner_id = current_owner for update;
  if job_row.status = 'cancelled' then raise exception 'IMPORT_JOB_CANCELLED' using errcode = '23514'; end if;
  if job_row.status in ('preparing', 'failed') then raise exception 'IMPORT_JOB_NOT_RUNNABLE' using errcode = '23514'; end if;
  if item_row.content_status = 'imported' then
    return jsonb_build_object('itemId', item_row.id, 'success', true, 'idempotent', true, 'contentStatus', 'imported', 'trackingStatus', item_row.tracking_status, 'postId', item_row.post_id);
  end if;
  if item_row.content_status = 'skipped_duplicate' then
    return jsonb_build_object('itemId', item_row.id, 'success', true, 'idempotent', true, 'contentStatus', 'skipped_duplicate', 'trackingStatus', item_row.tracking_status, 'postId', null);
  end if;
  if item_row.content_status = 'cancelled' or (item_row.content_status = 'failed' and not item_row.content_retryable) then
    raise exception 'IMPORT_JOB_ITEM_NOT_RETRYABLE' using errcode = '23514';
  end if;

  attempt_no_value := item_row.content_attempt_count + 1;
  insert into public.import_job_item_attempts (owner_id, job_item_id, stage, attempt_no, status)
  values (current_owner, item_row.id, 'content', attempt_no_value, 'running') returning id into attempt_id;
  update public.import_job_items set content_status = 'running', content_attempt_count = attempt_no_value,
    content_started_at = statement_timestamp(), content_completed_at = null,
    content_error_code = null, content_error_message = null, content_retryable = false
   where id = item_row.id;
  update public.import_jobs set status = 'running', started_at = coalesce(started_at, statement_timestamp()), completed_at = null
   where id = job_row.id;

  begin
    result_value := public.import_content_post(item_row.normalized_payload -> 'content');
  exception when others then
    get stacked diagnostics caught_message = message_text;
    error_value := public.import_job_safe_error('content', caught_message);
  end;

  if error_value is not null then
    duplicate_value := (error_value ->> 'duplicate')::boolean;
    update public.import_job_items set
      content_status = case when duplicate_value then 'skipped_duplicate' else 'failed' end,
      tracking_status = case when duplicate_value and tracking_status = 'pending' then 'cancelled' else tracking_status end,
      content_error_code = error_value ->> 'code', content_error_message = error_value ->> 'message',
      content_retryable = (error_value ->> 'retryable')::boolean, content_completed_at = statement_timestamp()
     where id = item_row.id;
    update public.import_job_item_attempts set status = 'failed', safe_error_code = error_value ->> 'code',
      safe_error_message = error_value ->> 'message', retryable = (error_value ->> 'retryable')::boolean,
      completed_at = statement_timestamp() where id = attempt_id;
    perform public.refresh_import_job_status(job_row.id, current_owner);
    return jsonb_build_object('itemId', item_row.id, 'success', duplicate_value, 'idempotent', false,
      'contentStatus', case when duplicate_value then 'skipped_duplicate' else 'failed' end,
      'trackingStatus', case when duplicate_value and item_row.tracking_status = 'pending' then 'cancelled' else item_row.tracking_status end,
      'postId', null, 'errorCode', error_value ->> 'code', 'errorMessage', error_value ->> 'message',
      'retryable', (error_value ->> 'retryable')::boolean);
  end if;

  update public.import_job_items set content_status = 'imported', post_id = (result_value ->> 'postId')::uuid,
    content_completed_at = statement_timestamp(), content_error_code = null, content_error_message = null, content_retryable = false
   where id = item_row.id;
  update public.import_job_item_attempts set status = 'imported', completed_at = statement_timestamp() where id = attempt_id;
  perform public.refresh_import_job_status(job_row.id, current_owner);
  return jsonb_build_object('itemId', item_row.id, 'success', true, 'idempotent', false,
    'contentStatus', 'imported', 'trackingStatus', item_row.tracking_status, 'postId', result_value ->> 'postId');
end;
$$;

create function public.run_import_job_item_tracking(p_job_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := (select auth.uid());
  item_row public.import_job_items;
  job_row public.import_jobs;
  attempt_id uuid;
  attempt_no_value integer;
  result_value jsonb;
  error_value jsonb;
  caught_message text;
begin
  if current_owner is null then raise exception 'IMPORT_JOB_AUTH_REQUIRED' using errcode = '42501'; end if;
  select item.* into item_row from public.import_job_items item
   where item.id = p_job_item_id and item.owner_id = current_owner for update;
  if item_row.id is null then raise exception 'IMPORT_JOB_ITEM_NOT_FOUND' using errcode = '42501'; end if;
  select * into job_row from public.import_jobs where id = item_row.job_id and owner_id = current_owner for update;
  if job_row.status = 'cancelled' then raise exception 'IMPORT_JOB_CANCELLED' using errcode = '23514'; end if;
  if item_row.content_status <> 'imported' or item_row.post_id is null then
    raise exception 'IMPORT_JOB_CONTENT_REQUIRED' using errcode = '23514';
  end if;
  if item_row.tracking_status in ('imported', 'not_present', 'not_applicable') then
    return jsonb_build_object('itemId', item_row.id, 'success', true, 'idempotent', true,
      'contentStatus', item_row.content_status, 'trackingStatus', item_row.tracking_status, 'postId', item_row.post_id,
      'topicCount', item_row.topic_count, 'reusedTopicCount', item_row.reused_topic_count,
      'createdTopicCount', item_row.created_topic_count, 'updateCount', item_row.update_count,
      'followupCount', item_row.followup_count, 'sourceLinkCount', item_row.source_link_count);
  end if;
  if item_row.tracking_status = 'cancelled' or (item_row.tracking_status = 'failed' and not item_row.tracking_retryable) then
    raise exception 'IMPORT_JOB_ITEM_NOT_RETRYABLE' using errcode = '23514';
  end if;

  attempt_no_value := item_row.tracking_attempt_count + 1;
  insert into public.import_job_item_attempts (owner_id, job_item_id, stage, attempt_no, status)
  values (current_owner, item_row.id, 'tracking', attempt_no_value, 'running') returning id into attempt_id;
  update public.import_job_items set tracking_status = 'running', tracking_attempt_count = attempt_no_value,
    tracking_started_at = statement_timestamp(), tracking_completed_at = null,
    tracking_error_code = null, tracking_error_message = null, tracking_retryable = false
   where id = item_row.id;
  update public.import_jobs set status = 'running', started_at = coalesce(started_at, statement_timestamp()), completed_at = null
   where id = job_row.id;

  begin
    result_value := public.import_news_tracking_for_post(item_row.post_id, item_row.normalized_payload -> 'tracking');
  exception when others then
    get stacked diagnostics caught_message = message_text;
    error_value := public.import_job_safe_error('tracking', caught_message);
  end;
  if error_value is not null then
    update public.import_job_items set tracking_status = 'failed', tracking_error_code = error_value ->> 'code',
      tracking_error_message = error_value ->> 'message', tracking_retryable = (error_value ->> 'retryable')::boolean,
      tracking_completed_at = statement_timestamp() where id = item_row.id;
    update public.import_job_item_attempts set status = 'failed', safe_error_code = error_value ->> 'code',
      safe_error_message = error_value ->> 'message', retryable = (error_value ->> 'retryable')::boolean,
      completed_at = statement_timestamp() where id = attempt_id;
    perform public.refresh_import_job_status(job_row.id, current_owner);
    return jsonb_build_object('itemId', item_row.id, 'success', false, 'idempotent', false,
      'contentStatus', item_row.content_status, 'trackingStatus', 'failed', 'postId', item_row.post_id,
      'errorCode', error_value ->> 'code', 'errorMessage', error_value ->> 'message',
      'retryable', (error_value ->> 'retryable')::boolean);
  end if;

  update public.import_job_items set tracking_status = 'imported', tracking_completed_at = statement_timestamp(),
    tracking_error_code = null, tracking_error_message = null, tracking_retryable = false,
    topic_count = (result_value ->> 'topicCount')::integer,
    reused_topic_count = (result_value ->> 'reusedTopicCount')::integer,
    created_topic_count = (result_value ->> 'createdTopicCount')::integer,
    update_count = (result_value ->> 'updateCount')::integer,
    followup_count = (result_value ->> 'followupCount')::integer,
    source_link_count = (result_value ->> 'sourceLinkCount')::integer
   where id = item_row.id;
  update public.import_job_item_attempts set status = 'imported', completed_at = statement_timestamp() where id = attempt_id;
  perform public.refresh_import_job_status(job_row.id, current_owner);
  return jsonb_build_object('itemId', item_row.id, 'success', true, 'idempotent', false,
    'contentStatus', item_row.content_status, 'trackingStatus', 'imported', 'postId', item_row.post_id,
    'topicCount', result_value -> 'topicCount', 'reusedTopicCount', result_value -> 'reusedTopicCount',
    'createdTopicCount', result_value -> 'createdTopicCount', 'updateCount', result_value -> 'updateCount',
    'followupCount', result_value -> 'followupCount', 'sourceLinkCount', result_value -> 'sourceLinkCount');
end;
$$;

create function public.cancel_import_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := (select auth.uid());
  job_row public.import_jobs;
  changed_count integer;
begin
  if current_owner is null then raise exception 'IMPORT_JOB_AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into job_row from public.import_jobs where id = p_job_id and owner_id = current_owner for update;
  if job_row.id is null then raise exception 'IMPORT_JOB_NOT_FOUND' using errcode = '42501'; end if;
  if job_row.status in ('completed', 'completed_with_errors', 'cancelled', 'failed') then
    return jsonb_build_object('jobId', job_row.id, 'status', job_row.status, 'cancelledCount', 0, 'idempotent', true);
  end if;
  update public.import_job_items set
    content_status = case when content_status = 'pending' then 'cancelled' else content_status end,
    tracking_status = case when tracking_status = 'pending' then 'cancelled' else tracking_status end
   where job_id = p_job_id and owner_id = current_owner and (content_status = 'pending' or tracking_status = 'pending');
  get diagnostics changed_count = row_count;
  update public.import_jobs set status = 'cancelled', cancelled_at = statement_timestamp(), completed_at = null where id = p_job_id;
  return jsonb_build_object('jobId', p_job_id, 'status', 'cancelled', 'cancelledCount', changed_count, 'idempotent', false);
end;
$$;

create function public.resume_cancelled_import_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := (select auth.uid());
  job_row public.import_jobs;
  changed_count integer;
begin
  if current_owner is null then raise exception 'IMPORT_JOB_AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into job_row from public.import_jobs where id = p_job_id and owner_id = current_owner for update;
  if job_row.id is null then raise exception 'IMPORT_JOB_NOT_FOUND' using errcode = '42501'; end if;
  if job_row.status <> 'cancelled' then
    return jsonb_build_object('jobId', job_row.id, 'status', job_row.status, 'resumedCount', 0, 'idempotent', true);
  end if;
  update public.import_job_items set
    content_status = case when content_status = 'cancelled' then 'pending' else content_status end,
    tracking_status = case
      when tracking_status <> 'cancelled' then tracking_status
      when normalized_payload ->> 'contentGroup' <> 'news' then 'not_applicable'
      when normalized_payload -> 'tracking' = 'null'::jsonb then 'not_present'
      else 'pending' end
   where job_id = p_job_id and owner_id = current_owner and (content_status = 'cancelled' or tracking_status = 'cancelled');
  get diagnostics changed_count = row_count;
  update public.import_jobs set status = case when started_at is null then 'ready' else 'running' end, cancelled_at = null, completed_at = null where id = p_job_id;
  perform public.refresh_import_job_status(p_job_id, current_owner);
  return jsonb_build_object('jobId', p_job_id, 'status', (select status from public.import_jobs where id = p_job_id), 'resumedCount', changed_count, 'idempotent', false);
end;
$$;

create function public.get_import_jobs(
  p_status text default null,
  p_source_name text default null,
  p_created_from date default null,
  p_created_to date default null,
  p_limit integer default 100
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(row_value order by created_at desc, id desc), '[]'::jsonb)
  from (
    select job.id, job.created_at,
      jsonb_build_object(
        'id', job.id, 'format', job.format, 'schemaVersion', job.schema_version,
        'sourceName', job.source_name, 'sourceFingerprint', job.source_fingerprint,
        'status', job.status, 'totalCount', job.total_count,
        'completedCount', count(item.id) filter (where item.content_status in ('failed', 'skipped_duplicate', 'cancelled') or (item.content_status = 'imported' and item.tracking_status in ('imported', 'not_present', 'not_applicable', 'failed', 'cancelled'))),
        'successCount', count(item.id) filter (where item.content_status in ('imported', 'skipped_duplicate') and item.tracking_status in ('imported', 'not_present', 'not_applicable')),
        'failedCount', count(item.id) filter (where item.content_status = 'failed' or item.tracking_status = 'failed'),
        'pendingCount', count(item.id) filter (where item.content_status = 'pending' or (item.content_status = 'imported' and item.tracking_status = 'pending')),
        'createdAt', job.created_at, 'startedAt', job.started_at, 'completedAt', job.completed_at,
        'progressPercent', case when job.total_count = 0 then 0 else round(100.0 * count(item.id) filter (where item.content_status in ('failed', 'skipped_duplicate', 'cancelled') or (item.content_status = 'imported' and item.tracking_status in ('imported', 'not_present', 'not_applicable', 'failed', 'cancelled'))) / job.total_count, 1) end
      ) row_value
    from public.import_jobs job
    left join public.import_job_items item on item.job_id = job.id and item.owner_id = job.owner_id
    where job.owner_id = (select auth.uid())
      and (p_status is null or job.status = p_status)
      and (nullif(btrim(p_source_name), '') is null or job.source_name ilike '%' || btrim(p_source_name) || '%')
      and (p_created_from is null or job.created_at >= p_created_from::timestamptz)
      and (p_created_to is null or job.created_at < (p_created_to + 1)::timestamptz)
    group by job.id
    order by job.created_at desc, job.id desc
    limit least(greatest(coalesce(p_limit, 100), 1), 100)
  ) rows;
$$;

create function public.get_import_job(p_job_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', job.id, 'format', job.format, 'schemaVersion', job.schema_version,
    'sourceName', job.source_name, 'sourceFingerprint', job.source_fingerprint,
    'status', job.status, 'totalCount', job.total_count, 'readyCount', job.ready_count,
    'warningCount', job.warning_count, 'invalidCount', job.invalid_count,
    'duplicateCount', job.duplicate_count, 'acknowledgedWarningCount', job.acknowledged_warning_count,
    'dryRunSummary', job.dry_run_summary,
    'completedCount', count(item.id) filter (where item.content_status in ('failed', 'skipped_duplicate', 'cancelled') or (item.content_status = 'imported' and item.tracking_status in ('imported', 'not_present', 'not_applicable', 'failed', 'cancelled'))),
    'successCount', count(item.id) filter (where item.content_status in ('imported', 'skipped_duplicate') and item.tracking_status in ('imported', 'not_present', 'not_applicable')),
    'runningCount', count(item.id) filter (where item.content_status = 'running' or item.tracking_status = 'running'),
    'pendingCount', count(item.id) filter (where item.content_status = 'pending' or (item.content_status = 'imported' and item.tracking_status = 'pending')),
    'contentImportedCount', count(item.id) filter (where item.content_status = 'imported'),
    'contentFailedCount', count(item.id) filter (where item.content_status = 'failed'),
    'trackingImportedCount', count(item.id) filter (where item.tracking_status = 'imported'),
    'trackingFailedCount', count(item.id) filter (where item.tracking_status = 'failed'),
    'trackingNotPresentCount', count(item.id) filter (where item.tracking_status = 'not_present'),
    'trackingNotApplicableCount', count(item.id) filter (where item.tracking_status = 'not_applicable'),
    'cancelledCount', count(item.id) filter (where item.content_status = 'cancelled' or item.tracking_status = 'cancelled'),
    'retryableFailureCount', count(item.id) filter (where (item.content_status = 'failed' and item.content_retryable) or (item.tracking_status = 'failed' and item.tracking_retryable)),
    'contentRetryableFailureCount', count(item.id) filter (where item.content_status = 'failed' and item.content_retryable),
    'trackingRetryableFailureCount', count(item.id) filter (where item.tracking_status = 'failed' and item.tracking_retryable),
    'nonRetryableFailureCount', count(item.id) filter (where (item.content_status = 'failed' and not item.content_retryable) or (item.tracking_status = 'failed' and not item.tracking_retryable)),
    'createdAt', job.created_at, 'startedAt', job.started_at, 'completedAt', job.completed_at, 'cancelledAt', job.cancelled_at,
    'progressPercent', case when job.total_count = 0 then 0 else round(100.0 * count(item.id) filter (where item.content_status in ('failed', 'skipped_duplicate', 'cancelled') or (item.content_status = 'imported' and item.tracking_status in ('imported', 'not_present', 'not_applicable', 'failed', 'cancelled'))) / job.total_count, 1) end
  )
  from public.import_jobs job
  left join public.import_job_items item on item.job_id = job.id and item.owner_id = job.owner_id
  where job.id = p_job_id and job.owner_id = (select auth.uid())
  group by job.id;
$$;

create function public.get_import_job_items(p_job_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', item.id, 'itemIndex', item.item_index, 'externalKey', item.external_key,
    'payloadFingerprint', item.payload_fingerprint, 'title', item.title, 'categoryId', item.category_id,
    'validationStatus', item.validation_status, 'warningAcknowledged', item.warning_acknowledged,
    'contentStatus', item.content_status, 'trackingStatus', item.tracking_status,
    'overallStatus', case
      when item.content_status = 'failed' or item.tracking_status = 'failed' then 'failed'
      when item.content_status = 'cancelled' or item.tracking_status = 'cancelled' then 'cancelled'
      when item.content_status = 'running' or item.tracking_status = 'running' then 'running'
      when item.content_status in ('imported', 'skipped_duplicate') and item.tracking_status in ('imported', 'not_present', 'not_applicable') then 'completed'
      else 'pending' end,
    'postId', item.post_id, 'contentAttemptCount', item.content_attempt_count,
    'trackingAttemptCount', item.tracking_attempt_count,
    'contentErrorCode', item.content_error_code, 'contentErrorMessage', item.content_error_message,
    'contentRetryable', item.content_retryable, 'trackingErrorCode', item.tracking_error_code,
    'trackingErrorMessage', item.tracking_error_message, 'trackingRetryable', item.tracking_retryable,
    'topicCount', item.topic_count, 'reusedTopicCount', item.reused_topic_count,
    'createdTopicCount', item.created_topic_count, 'updateCount', item.update_count,
    'followupCount', item.followup_count, 'sourceLinkCount', item.source_link_count,
    'contentStartedAt', item.content_started_at, 'contentCompletedAt', item.content_completed_at,
    'trackingStartedAt', item.tracking_started_at, 'trackingCompletedAt', item.tracking_completed_at,
    'attempts', coalesce((select jsonb_agg(jsonb_build_object(
      'id', attempt.id, 'stage', attempt.stage, 'attemptNo', attempt.attempt_no,
      'status', attempt.status, 'safeErrorCode', attempt.safe_error_code,
      'safeErrorMessage', attempt.safe_error_message, 'retryable', attempt.retryable,
      'startedAt', attempt.started_at, 'completedAt', attempt.completed_at
    ) order by attempt.started_at, attempt.attempt_no) from public.import_job_item_attempts attempt
      where attempt.job_item_id = item.id and attempt.owner_id = item.owner_id), '[]'::jsonb)
  ) order by item.item_index), '[]'::jsonb)
  from public.import_job_items item
  where item.job_id = p_job_id and item.owner_id = (select auth.uid());
$$;

comment on table public.import_jobs is 'Durable owner-scoped content import job metadata and dry-run summary.';
comment on table public.import_job_items is 'Immutable normalized execution snapshots with separate content and tracking stage state.';
comment on table public.import_job_item_attempts is 'Append-only safe stage attempt history; raw database errors are never stored.';
comment on column public.import_job_items.normalized_payload is 'Immutable after preparation; direct table writes are not granted and retry always uses this snapshot.';

revoke all on function public.import_job_safe_error(text, text) from public, anon, authenticated;
revoke all on function public.refresh_import_job_status(uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_import_job(text, integer, text, text, integer, jsonb) from public, anon;
revoke all on function public.append_import_job_items(uuid, jsonb) from public, anon;
revoke all on function public.finalize_import_job(uuid) from public, anon;
revoke all on function public.run_import_job_item_content(uuid) from public, anon;
revoke all on function public.run_import_job_item_tracking(uuid) from public, anon;
revoke all on function public.cancel_import_job(uuid) from public, anon;
revoke all on function public.resume_cancelled_import_job(uuid) from public, anon;
revoke all on function public.get_import_jobs(text, text, date, date, integer) from public, anon;
revoke all on function public.get_import_job(uuid) from public, anon;
revoke all on function public.get_import_job_items(uuid) from public, anon;

grant execute on function public.create_import_job(text, integer, text, text, integer, jsonb) to authenticated;
grant execute on function public.append_import_job_items(uuid, jsonb) to authenticated;
grant execute on function public.finalize_import_job(uuid) to authenticated;
grant execute on function public.run_import_job_item_content(uuid) to authenticated;
grant execute on function public.run_import_job_item_tracking(uuid) to authenticated;
grant execute on function public.cancel_import_job(uuid) to authenticated;
grant execute on function public.resume_cancelled_import_job(uuid) to authenticated;
grant execute on function public.get_import_jobs(text, text, date, date, integer) to authenticated;
grant execute on function public.get_import_job(uuid) to authenticated;
grant execute on function public.get_import_job_items(uuid) to authenticated;
