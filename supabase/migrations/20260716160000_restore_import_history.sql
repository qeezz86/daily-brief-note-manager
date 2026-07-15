-- Phase 4B-4B: restore full-profile import history as immutable, execution-locked audit data.

alter table public.import_jobs
  add column restored_from_backup boolean not null default false,
  add column execution_locked boolean not null default false,
  add column restore_origin_checksum text;

alter table public.import_jobs
  add constraint import_jobs_restore_provenance_check check (
    (not restored_from_backup and restore_origin_checksum is null)
    or (restored_from_backup and execution_locked and restore_origin_checksum ~ '^[0-9a-f]{64}$')
  );

comment on column public.import_jobs.restored_from_backup is
  'True only for immutable historical import jobs created by backup restore.';
comment on column public.import_jobs.execution_locked is
  'Blocks all import execution, retry, append, finalize, cancel and resume operations.';
comment on column public.import_jobs.restore_origin_checksum is
  'SHA-256 checksum of the backup that created this historical import job.';

alter function public.append_import_job_items(uuid,jsonb) rename to append_import_job_items_unlocked;
alter function public.finalize_import_job(uuid) rename to finalize_import_job_unlocked;
alter function public.run_import_job_item_content(uuid) rename to run_import_job_item_content_unlocked;
alter function public.run_import_job_item_tracking(uuid) rename to run_import_job_item_tracking_unlocked;
alter function public.cancel_import_job(uuid) rename to cancel_import_job_unlocked;
alter function public.resume_cancelled_import_job(uuid) rename to resume_cancelled_import_job_unlocked;

create function public.assert_import_job_unlocked(p_job_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare own uuid := (select auth.uid()); job public.import_jobs;
begin
  if own is null then raise exception 'IMPORT_JOB_AUTH_REQUIRED' using errcode='42501'; end if;
  select * into job from public.import_jobs where id=p_job_id and owner_id=own;
  if job.id is null then raise exception 'IMPORT_JOB_NOT_FOUND' using errcode='42501'; end if;
  if job.execution_locked then raise exception 'IMPORT_JOB_EXECUTION_LOCKED' using errcode='23514'; end if;
end $$;

create function public.assert_import_item_job_unlocked(p_item_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare own uuid := (select auth.uid()); job_id_value uuid;
begin
  if own is null then raise exception 'IMPORT_JOB_AUTH_REQUIRED' using errcode='42501'; end if;
  select item.job_id into job_id_value from public.import_job_items item where item.id=p_item_id and item.owner_id=own;
  if job_id_value is null then raise exception 'IMPORT_JOB_ITEM_NOT_FOUND' using errcode='42501'; end if;
  perform public.assert_import_job_unlocked(job_id_value);
end $$;

create function public.append_import_job_items(p_job_id uuid,p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.assert_import_job_unlocked(p_job_id); return public.append_import_job_items_unlocked(p_job_id,p_items); end $$;
create function public.finalize_import_job(p_job_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.assert_import_job_unlocked(p_job_id); return public.finalize_import_job_unlocked(p_job_id); end $$;
create function public.run_import_job_item_content(p_job_item_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.assert_import_item_job_unlocked(p_job_item_id); return public.run_import_job_item_content_unlocked(p_job_item_id); end $$;
create function public.run_import_job_item_tracking(p_job_item_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.assert_import_item_job_unlocked(p_job_item_id); return public.run_import_job_item_tracking_unlocked(p_job_item_id); end $$;
create function public.cancel_import_job(p_job_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.assert_import_job_unlocked(p_job_id); return public.cancel_import_job_unlocked(p_job_id); end $$;
create function public.resume_cancelled_import_job(p_job_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.assert_import_job_unlocked(p_job_id); return public.resume_cancelled_import_job_unlocked(p_job_id); end $$;

revoke all on function public.append_import_job_items_unlocked(uuid,jsonb),public.finalize_import_job_unlocked(uuid),
  public.run_import_job_item_content_unlocked(uuid),public.run_import_job_item_tracking_unlocked(uuid),
  public.cancel_import_job_unlocked(uuid),public.resume_cancelled_import_job_unlocked(uuid),
  public.assert_import_job_unlocked(uuid),public.assert_import_item_job_unlocked(uuid)
from public,anon,authenticated;
revoke all on function public.append_import_job_items(uuid,jsonb),public.finalize_import_job(uuid),
  public.run_import_job_item_content(uuid),public.run_import_job_item_tracking(uuid),
  public.cancel_import_job(uuid),public.resume_cancelled_import_job(uuid)
from public,anon;
grant execute on function public.append_import_job_items(uuid,jsonb),public.finalize_import_job(uuid),
  public.run_import_job_item_content(uuid),public.run_import_job_item_tracking(uuid),
  public.cancel_import_job(uuid),public.resume_cancelled_import_job(uuid)
to authenticated;

create function public.import_job_write_is_restore()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('daily_brief.restore_import_history', true), '') = 'on';
$$;

create function public.enforce_import_job_execution_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked boolean;
  parent_id uuid;
begin
  if public.import_job_write_is_restore() then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_table_name = 'import_jobs' then
    locked := old.execution_locked;
  elsif tg_table_name = 'import_job_items' then
    parent_id := case when tg_op = 'DELETE' then old.job_id else new.job_id end;
    select job.execution_locked into locked
    from public.import_jobs job
    where job.id = parent_id;
  else
    parent_id := case when tg_op = 'DELETE' then old.job_item_id else new.job_item_id end;
    select job.execution_locked into locked
    from public.import_job_items item
    join public.import_jobs job on job.id = item.job_id and job.owner_id = item.owner_id
    where item.id = parent_id;
  end if;
  if coalesce(locked, false) then
    raise exception 'IMPORT_JOB_EXECUTION_LOCKED' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create trigger import_jobs_execution_lock
before update or delete on public.import_jobs
for each row execute function public.enforce_import_job_execution_lock();
create trigger import_job_items_execution_lock
before insert or update or delete on public.import_job_items
for each row execute function public.enforce_import_job_execution_lock();
create trigger import_job_attempts_execution_lock
before insert or update or delete on public.import_job_item_attempts
for each row execute function public.enforce_import_job_execution_lock();

create function public.restore_import_payload_is_safe(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  entry record;
  child jsonb;
  normalized_key text;
begin
  if p_value is null then return true; end if;
  if jsonb_typeof(p_value) = 'object' then
    for entry in select key, value from jsonb_each(p_value) loop
      normalized_key := lower(regexp_replace(entry.key, '[^a-z0-9]', '', 'g'));
      if normalized_key = any(array[
        'ownerid','email','accesstoken','refreshtoken','servicerole','jwt','password',
        'secret','authorization','cookie','rawsql','constraint','stacktrace','rawpostgresterror',
        'proto','constructor','prototype'
      ]) or entry.key = '__proto__' then return false; end if;
      if not public.restore_import_payload_is_safe(entry.value) then return false; end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'array' then
    for child in select value from jsonb_array_elements(p_value) loop
      if not public.restore_import_payload_is_safe(child) then return false; end if;
    end loop;
  end if;
  return true;
end;
$$;

create function public.restore_import_error_is_safe(p_value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value is null or p_value !~* '(bearer[[:space:]]+[a-z0-9._-]+|sqlstate|constraint|stack[[:space:]_-]*trace|authorization|cookie|password|secret|service[[:space:]_-]*role|access[[:space:]_-]*token|refresh[[:space:]_-]*token|raw[[:space:]_-]*postgrest|\bselect\b.+\bfrom\b|\binsert\b.+\binto\b|\bupdate\b.+\bset\b|\bdelete\b.+\bfrom\b)';
$$;

create function public.restore_import_item_payload_valid(p_payload jsonb, p_fingerprint text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select jsonb_typeof(p_payload) = 'object'
    and octet_length(p_payload::text) <= 5242880
    and public.restore_import_payload_is_safe(p_payload)
    and public.restore_payload_fingerprint(p_payload) = p_fingerprint
    and p_payload->>'schemaVersion' = '1'
    and p_payload->>'contentGroup' in ('news','ai','info_db','chinese')
    and nullif(btrim(p_payload->>'externalKey'), '') is not null
    and jsonb_typeof(p_payload->'content') = 'object'
    and p_payload ? 'tracking';
$$;

create function public.restore_planned_target(p_job_id uuid, p_section text, p_source_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select target_id
  from public.restore_job_records
  where job_id = p_job_id and section = p_section and source_id = p_source_id
  limit 1;
$$;

revoke all on function public.import_job_write_is_restore(), public.enforce_import_job_execution_lock(),
  public.restore_import_payload_is_safe(jsonb), public.restore_import_error_is_safe(text),
  public.restore_import_item_payload_valid(jsonb,text), public.restore_planned_target(uuid,text,text)
from public, anon, authenticated;

create function public.restore_import_job_exact(p_target uuid, p_owner uuid, p jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.import_jobs job
    where job.id = p_target and job.owner_id = p_owner
      and job.format = p->>'format'
      and job.schema_version = (p->>'schemaVersion')::integer
      and job.source_name is not distinct from nullif(p->>'sourceName','')
      and job.source_fingerprint = p->>'sourceFingerprint'
      and job.status = p->>'status'
      and job.expected_item_count = (p->>'expectedItemCount')::integer
      and job.total_count = (p->>'totalCount')::integer
      and job.ready_count = (p->>'readyCount')::integer
      and job.warning_count = (p->>'warningCount')::integer
      and job.invalid_count = (p->>'invalidCount')::integer
      and job.duplicate_count = (p->>'duplicateCount')::integer
      and job.acknowledged_warning_count = (p->>'acknowledgedWarningCount')::integer
      and job.dry_run_summary = p->'dryRunSummary'
      and job.started_at is not distinct from (p->>'startedAt')::timestamptz
      and job.completed_at is not distinct from (p->>'completedAt')::timestamptz
      and job.cancelled_at is not distinct from (p->>'cancelledAt')::timestamptz
      and job.created_at = (p->>'createdAt')::timestamptz
      and job.updated_at = (p->>'updatedAt')::timestamptz
  );
$$;

create function public.restore_import_item_exact(p_record public.restore_job_records)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p jsonb := p_record.payload;
  target uuid := p_record.target_id::uuid;
  job_target uuid := public.restore_target(p_record.job_id,'importJobs',p->>'jobId')::uuid;
  post_target uuid := case when nullif(p->>'postId','') is null then null else public.restore_target(p_record.job_id,'posts',p->>'postId')::uuid end;
begin
  return exists(
    select 1 from public.import_job_items item
    where item.id = target and item.owner_id = p_record.owner_id and item.job_id = job_target
      and item.item_index = (p->>'itemIndex')::integer and item.external_key = p->>'externalKey'
      and item.payload_fingerprint = p->>'payloadFingerprint' and item.title = p->>'title'
      and item.category_id = p->>'categoryId' and item.validation_status = p->>'validationStatus'
      and item.normalized_payload = p->'normalizedPayload'
      and item.warning_acknowledged = (p->>'warningAcknowledged')::boolean
      and item.content_status = p->>'contentStatus' and item.tracking_status = p->>'trackingStatus'
      and item.post_id is not distinct from post_target
      and item.content_attempt_count = (p->>'contentAttemptCount')::integer
      and item.tracking_attempt_count = (p->>'trackingAttemptCount')::integer
      and item.content_error_code is not distinct from nullif(p->>'contentErrorCode','')
      and item.content_error_message is not distinct from nullif(p->>'contentErrorMessage','')
      and item.content_retryable = (p->>'contentRetryable')::boolean
      and item.tracking_error_code is not distinct from nullif(p->>'trackingErrorCode','')
      and item.tracking_error_message is not distinct from nullif(p->>'trackingErrorMessage','')
      and item.tracking_retryable = (p->>'trackingRetryable')::boolean
      and item.topic_count is not distinct from (p->>'topicCount')::integer
      and item.reused_topic_count is not distinct from (p->>'reusedTopicCount')::integer
      and item.created_topic_count is not distinct from (p->>'createdTopicCount')::integer
      and item.update_count is not distinct from (p->>'updateCount')::integer
      and item.followup_count is not distinct from (p->>'followupCount')::integer
      and item.source_link_count is not distinct from (p->>'sourceLinkCount')::integer
      and item.content_started_at is not distinct from (p->>'contentStartedAt')::timestamptz
      and item.content_completed_at is not distinct from (p->>'contentCompletedAt')::timestamptz
      and item.tracking_started_at is not distinct from (p->>'trackingStartedAt')::timestamptz
      and item.tracking_completed_at is not distinct from (p->>'trackingCompletedAt')::timestamptz
      and item.created_at = (p->>'createdAt')::timestamptz and item.updated_at = (p->>'updatedAt')::timestamptz
  );
end;
$$;

create function public.restore_import_attempt_exact(p_record public.restore_job_records)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p jsonb := p_record.payload;
  target uuid := p_record.target_id::uuid;
  item_target uuid := public.restore_target(p_record.job_id,'importJobItems',p->>'jobItemId')::uuid;
begin
  return exists(
    select 1 from public.import_job_item_attempts attempt
    where attempt.id = target and attempt.owner_id = p_record.owner_id and attempt.job_item_id = item_target
      and attempt.stage = p->>'stage' and attempt.attempt_no = (p->>'attemptNo')::integer
      and attempt.status = p->>'status'
      and attempt.safe_error_code is not distinct from nullif(p->>'safeErrorCode','')
      and attempt.safe_error_message is not distinct from nullif(p->>'safeErrorMessage','')
      and attempt.retryable = (p->>'retryable')::boolean
      and attempt.started_at = (p->>'startedAt')::timestamptz
      and attempt.completed_at is not distinct from (p->>'completedAt')::timestamptz
  );
end;
$$;

create function public.restore_apply_import_record(p_record public.restore_job_records, p_backup_checksum text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  p jsonb := p_record.payload;
  target uuid := p_record.target_id::uuid;
  job_target uuid;
  item_target uuid;
  post_target uuid;
  expected_exact boolean;
begin
  if p_record.section = 'importJobs' then
    expected_exact := public.restore_import_job_exact(target,p_record.owner_id,p);
  elsif p_record.section = 'importJobItems' then
    expected_exact := public.restore_import_item_exact(p_record);
  else
    expected_exact := public.restore_import_attempt_exact(p_record);
  end if;
  if p_record.action in ('reuse_existing','skip') then
    if not expected_exact then
      raise exception '%' ,case when p_record.action='skip' then 'RESTORE_SKIP_MISMATCH' else 'RESTORE_IMPORT_JOB_REUSE_MISMATCH' end using errcode='23514';
    end if;
    return case when p_record.action='skip' then 'skipped' else 'reused' end;
  end if;

  perform set_config('daily_brief.restore_import_history','on',true);
  if p_record.section = 'importJobs' then
    if exists(select 1 from public.import_jobs where owner_id=p_record.owner_id and source_fingerprint=p->>'sourceFingerprint') then
      raise exception 'RESTORE_IMPORT_JOB_FINGERPRINT_CONFLICT' using errcode='23505';
    end if;
    insert into public.import_jobs(
      id,owner_id,format,schema_version,source_name,source_fingerprint,status,
      expected_item_count,total_count,ready_count,warning_count,invalid_count,duplicate_count,
      acknowledged_warning_count,dry_run_summary,started_at,completed_at,cancelled_at,created_at,updated_at,
      restored_from_backup,execution_locked,restore_origin_checksum
    ) values(
      target,p_record.owner_id,p->>'format',(p->>'schemaVersion')::integer,nullif(p->>'sourceName',''),p->>'sourceFingerprint',p->>'status',
      (p->>'expectedItemCount')::integer,(p->>'totalCount')::integer,(p->>'readyCount')::integer,
      (p->>'warningCount')::integer,(p->>'invalidCount')::integer,(p->>'duplicateCount')::integer,
      (p->>'acknowledgedWarningCount')::integer,p->'dryRunSummary',(p->>'startedAt')::timestamptz,
      (p->>'completedAt')::timestamptz,(p->>'cancelledAt')::timestamptz,(p->>'createdAt')::timestamptz,(p->>'updatedAt')::timestamptz,
      true,true,p_backup_checksum
    );
  elsif p_record.section = 'importJobItems' then
    if not public.restore_import_item_payload_valid(p->'normalizedPayload',p->>'payloadFingerprint') then
      raise exception 'RESTORE_IMPORT_PAYLOAD_INVALID' using errcode='23514';
    end if;
    if not public.restore_import_error_is_safe(p->>'contentErrorMessage') or not public.restore_import_error_is_safe(p->>'trackingErrorMessage') then
      raise exception 'RESTORE_IMPORT_PAYLOAD_SENSITIVE' using errcode='23514';
    end if;
    job_target := public.restore_target(p_record.job_id,'importJobs',p->>'jobId')::uuid;
    post_target := case when nullif(p->>'postId','') is null then null else public.restore_target(p_record.job_id,'posts',p->>'postId')::uuid end;
    if job_target is null or (nullif(p->>'postId','') is not null and post_target is null) then raise exception 'RESTORE_MISSING_DEPENDENCY' using errcode='23503'; end if;
    if exists(select 1 from public.import_job_items where job_id=job_target and (item_index=(p->>'itemIndex')::integer or external_key=p->>'externalKey')) then
      raise exception 'RESTORE_IMPORT_ITEM_KEY_CONFLICT' using errcode='23505';
    end if;
    insert into public.import_job_items(
      id,owner_id,job_id,item_index,external_key,payload_fingerprint,title,category_id,validation_status,
      normalized_payload,warning_acknowledged,content_status,tracking_status,post_id,content_attempt_count,
      tracking_attempt_count,content_error_code,content_error_message,content_retryable,tracking_error_code,
      tracking_error_message,tracking_retryable,topic_count,reused_topic_count,created_topic_count,update_count,
      followup_count,source_link_count,content_started_at,content_completed_at,tracking_started_at,tracking_completed_at,
      created_at,updated_at
    ) values(
      target,p_record.owner_id,job_target,(p->>'itemIndex')::integer,p->>'externalKey',p->>'payloadFingerprint',p->>'title',
      p->>'categoryId',p->>'validationStatus',p->'normalizedPayload',(p->>'warningAcknowledged')::boolean,
      p->>'contentStatus',p->>'trackingStatus',post_target,(p->>'contentAttemptCount')::integer,(p->>'trackingAttemptCount')::integer,
      nullif(p->>'contentErrorCode',''),nullif(p->>'contentErrorMessage',''),(p->>'contentRetryable')::boolean,
      nullif(p->>'trackingErrorCode',''),nullif(p->>'trackingErrorMessage',''),(p->>'trackingRetryable')::boolean,
      (p->>'topicCount')::integer,(p->>'reusedTopicCount')::integer,(p->>'createdTopicCount')::integer,
      (p->>'updateCount')::integer,(p->>'followupCount')::integer,(p->>'sourceLinkCount')::integer,
      (p->>'contentStartedAt')::timestamptz,(p->>'contentCompletedAt')::timestamptz,
      (p->>'trackingStartedAt')::timestamptz,(p->>'trackingCompletedAt')::timestamptz,
      (p->>'createdAt')::timestamptz,(p->>'updatedAt')::timestamptz
    );
  else
    if not public.restore_import_error_is_safe(p->>'safeErrorMessage') then raise exception 'RESTORE_IMPORT_PAYLOAD_SENSITIVE' using errcode='23514'; end if;
    item_target := public.restore_target(p_record.job_id,'importJobItems',p->>'jobItemId')::uuid;
    if item_target is null then raise exception 'RESTORE_MISSING_DEPENDENCY' using errcode='23503'; end if;
    if exists(select 1 from public.import_job_item_attempts where job_item_id=item_target and stage=p->>'stage' and attempt_no=(p->>'attemptNo')::integer) then
      raise exception 'RESTORE_IMPORT_ATTEMPT_CONFLICT' using errcode='23505';
    end if;
    insert into public.import_job_item_attempts(
      id,owner_id,job_item_id,stage,attempt_no,status,safe_error_code,safe_error_message,retryable,started_at,completed_at
    ) values(
      target,p_record.owner_id,item_target,p->>'stage',(p->>'attemptNo')::integer,p->>'status',
      nullif(p->>'safeErrorCode',''),nullif(p->>'safeErrorMessage',''),(p->>'retryable')::boolean,
      (p->>'startedAt')::timestamptz,(p->>'completedAt')::timestamptz
    );
  end if;
  return 'applied';
exception
  when unique_violation then
    if p_record.section='importJobs' then raise exception 'RESTORE_IMPORT_JOB_FINGERPRINT_CONFLICT' using errcode='23505'; end if;
    raise exception 'RESTORE_UNIQUE_KEY_CONFLICT' using errcode='23505';
  when foreign_key_violation then raise exception 'RESTORE_MISSING_DEPENDENCY' using errcode='23503';
  when check_violation or not_null_violation or invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception 'RESTORE_INVALID_PAYLOAD' using errcode='23514';
end;
$$;

revoke all on function public.restore_import_job_exact(uuid,uuid,jsonb),
  public.restore_import_item_exact(public.restore_job_records), public.restore_import_attempt_exact(public.restore_job_records),
  public.restore_apply_import_record(public.restore_job_records,text)
from public, anon, authenticated;

create function public.restore_validate_import_history_plan(p_job public.restore_jobs)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec public.restore_job_records;
  parent_target text;
begin
  if p_job.policies->>'operationalHistory' = 'exclude' then
    if exists(select 1 from public.restore_job_records where job_id=p_job.id and section in ('importJobs','importJobItems','importJobItemAttempts')) then
      raise exception 'RESTORE_OPERATIONAL_HISTORY_BLOCKED' using errcode='23514';
    end if;
    return;
  end if;
  if p_job.backup_profile <> 'full' or p_job.policies->>'operationalHistory' <> 'include' then
    raise exception 'RESTORE_OPERATIONAL_HISTORY_BLOCKED' using errcode='23514';
  end if;

  for rec in select * from public.restore_job_records where job_id=p_job.id and section in ('importJobs','importJobItems','importJobItemAttempts') loop
    if rec.section='importJobs' then
      if rec.payload->>'format'<>'daily-brief-note-content-import' or rec.payload->>'schemaVersion'<>'1'
        or rec.payload->>'sourceFingerprint' !~ '^[0-9a-f]{64}$'
        or rec.payload->>'status' not in ('preparing','ready','running','completed','completed_with_errors','cancelled','failed')
        or not public.restore_import_payload_is_safe(rec.payload->'dryRunSummary') then
        raise exception 'RESTORE_INVALID_PAYLOAD' using errcode='23514';
      end if;
      if rec.action in ('create','preserve_id','remap_id') and exists(
        select 1 from public.import_jobs job where job.owner_id=p_job.owner_id and job.source_fingerprint=rec.payload->>'sourceFingerprint'
      ) then raise exception 'RESTORE_IMPORT_JOB_FINGERPRINT_CONFLICT' using errcode='23505'; end if;
      if rec.action in ('reuse_existing','skip') and not public.restore_import_job_exact(rec.target_id::uuid,p_job.owner_id,rec.payload) then
        raise exception 'RESTORE_IMPORT_JOB_REUSE_MISMATCH' using errcode='23514';
      end if;
    elsif rec.section='importJobItems' then
      parent_target := public.restore_planned_target(p_job.id,'importJobs',rec.payload->>'jobId');
      if parent_target is null or not public.restore_import_item_payload_valid(rec.payload->'normalizedPayload',rec.payload->>'payloadFingerprint')
        or rec.payload->'normalizedPayload'->>'externalKey' is distinct from rec.payload->>'externalKey'
        or rec.payload->'normalizedPayload'->'content'->>'category_id' is distinct from rec.payload->>'categoryId'
        or not public.restore_import_error_is_safe(rec.payload->>'contentErrorMessage')
        or not public.restore_import_error_is_safe(rec.payload->>'trackingErrorMessage') then
        raise exception 'RESTORE_IMPORT_PAYLOAD_INVALID' using errcode='23514';
      end if;
      if nullif(rec.payload->>'postId','') is not null and public.restore_planned_target(p_job.id,'posts',rec.payload->>'postId') is null then
        raise exception 'RESTORE_MISSING_DEPENDENCY' using errcode='23503';
      end if;
      if rec.payload->>'contentStatus'='imported' and nullif(rec.payload->>'postId','') is null then raise exception 'RESTORE_IMPORT_STATUS_INVALID' using errcode='23514'; end if;
      if nullif(rec.payload->>'postId','') is not null and rec.payload->>'contentStatus'='pending' then raise exception 'RESTORE_IMPORT_STATUS_INVALID' using errcode='23514'; end if;
      if rec.payload->>'trackingStatus'='imported' and rec.payload->>'contentStatus'<>'imported' then raise exception 'RESTORE_IMPORT_STATUS_INVALID' using errcode='23514'; end if;
      if (rec.payload->>'contentCompletedAt')::timestamptz < (rec.payload->>'contentStartedAt')::timestamptz
        or (rec.payload->>'trackingCompletedAt')::timestamptz < (rec.payload->>'trackingStartedAt')::timestamptz then
        raise exception 'RESTORE_IMPORT_STATUS_INVALID' using errcode='23514';
      end if;
    else
      parent_target := public.restore_planned_target(p_job.id,'importJobItems',rec.payload->>'jobItemId');
      if parent_target is null or rec.payload->>'stage' not in ('content','tracking')
        or rec.payload->>'status' not in ('running','imported','failed')
        or not public.restore_import_error_is_safe(rec.payload->>'safeErrorMessage') then
        raise exception 'RESTORE_INVALID_PAYLOAD' using errcode='23514';
      end if;
      if (rec.payload->>'completedAt')::timestamptz < (rec.payload->>'startedAt')::timestamptz then raise exception 'RESTORE_IMPORT_STATUS_INVALID' using errcode='23514'; end if;
    end if;
  end loop;

  if exists(
    select 1 from public.restore_job_records item
    where item.job_id=p_job.id and item.section='importJobItems'
    group by item.payload->>'jobId', item.payload->>'itemIndex' having count(*)>1
  ) or exists(
    select 1 from public.restore_job_records item
    where item.job_id=p_job.id and item.section='importJobItems'
    group by item.payload->>'jobId', item.payload->>'externalKey' having count(*)>1
  ) then raise exception 'RESTORE_IMPORT_ITEM_KEY_CONFLICT' using errcode='23505'; end if;

  if exists(
    select 1 from public.restore_job_records attempt
    where attempt.job_id=p_job.id and attempt.section='importJobItemAttempts'
    group by attempt.payload->>'jobItemId',attempt.payload->>'stage',attempt.payload->>'attemptNo' having count(*)>1
  ) then raise exception 'RESTORE_IMPORT_ATTEMPT_CONFLICT' using errcode='23505'; end if;

  if exists(
    select 1 from public.restore_job_records item
    where item.job_id=p_job.id and item.section='importJobItems'
      and (item.payload->>'contentAttemptCount')::integer <> (
        select count(*) from public.restore_job_records attempt where attempt.job_id=p_job.id and attempt.section='importJobItemAttempts'
          and attempt.payload->>'jobItemId'=item.source_id and attempt.payload->>'stage'='content'
      )
  ) or exists(
    select 1 from public.restore_job_records item
    where item.job_id=p_job.id and item.section='importJobItems'
      and (item.payload->>'trackingAttemptCount')::integer <> (
        select count(*) from public.restore_job_records attempt where attempt.job_id=p_job.id and attempt.section='importJobItemAttempts'
          and attempt.payload->>'jobItemId'=item.source_id and attempt.payload->>'stage'='tracking'
      )
  ) then raise exception 'RESTORE_IMPORT_ATTEMPT_COUNT_MISMATCH' using errcode='23514'; end if;

  if exists(
    select 1 from public.restore_job_records attempt
    where attempt.job_id=p_job.id and attempt.section='importJobItemAttempts'
    group by attempt.payload->>'jobItemId',attempt.payload->>'stage'
    having min((attempt.payload->>'attemptNo')::integer)<>1
      or max((attempt.payload->>'attemptNo')::integer)<>count(*)
  ) then raise exception 'RESTORE_IMPORT_ATTEMPT_COUNT_MISMATCH' using errcode='23514'; end if;

  if exists(
    select 1 from public.restore_job_records job
    where job.job_id=p_job.id and job.section='importJobs'
      and (job.payload->>'totalCount')::integer <> (select count(*) from public.restore_job_records item where item.job_id=p_job.id and item.section='importJobItems' and item.payload->>'jobId'=job.source_id)
  ) then raise exception 'RESTORE_IMPORT_STATUS_INVALID' using errcode='23514'; end if;

  if exists(
    select 1 from public.restore_job_records job
    where job.job_id=p_job.id and job.section='importJobs' and job.payload->>'status'='completed'
      and exists(select 1 from public.restore_job_records item where item.job_id=p_job.id and item.section='importJobItems' and item.payload->>'jobId'=job.source_id
        and (item.payload->>'contentStatus' in ('pending','running','failed') or item.payload->>'trackingStatus' in ('pending','running','failed')))
  ) or exists(
    select 1 from public.restore_job_records job
    where job.job_id=p_job.id and job.section='importJobs' and job.payload->>'status'='completed_with_errors'
      and not exists(select 1 from public.restore_job_records item where item.job_id=p_job.id and item.section='importJobItems' and item.payload->>'jobId'=job.source_id
        and (item.payload->>'contentStatus'='failed' or item.payload->>'trackingStatus'='failed'))
  ) then raise exception 'RESTORE_IMPORT_STATUS_INVALID' using errcode='23514'; end if;
end;
$$;

create or replace function public.create_restore_job(
  p_backup_format text,p_backup_schema_version integer,p_backup_profile text,p_backup_checksum text,
  p_plan_format text,p_plan_schema_version integer,p_plan_version integer,p_plan_fingerprint text,p_analysis_fingerprint text,
  p_plan_status text,p_source_name text,p_policies jsonb,p_category_mappings jsonb,p_execution_stages jsonb,p_expected_record_count integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare own uuid := (select auth.uid()); found public.restore_jobs; created_id uuid; operational text;
begin
  if own is null then raise exception 'RESTORE_PERMISSION_DENIED' using errcode='42501'; end if;
  operational := p_policies->>'operationalHistory';
  if p_backup_format <> 'daily-brief-note-backup' or p_backup_schema_version<>1 or p_backup_profile not in ('core','full')
    or p_plan_format<>'daily-brief-note-restore-plan' or p_plan_schema_version<>1 or p_plan_version<>1 or p_plan_status<>'ready'
    or operational not in ('include','exclude') or (operational='include' and p_backup_profile<>'full') then
    raise exception 'RESTORE_INVALID_PAYLOAD' using errcode='23514';
  end if;
  if jsonb_typeof(p_execution_stages)<>'array' or (operational='exclude' and exists(select 1 from jsonb_array_elements(p_execution_stages) stage where stage->>'name' in ('importJobs','importJobItems','importJobItemAttempts'))) then
    raise exception 'RESTORE_OPERATIONAL_HISTORY_BLOCKED' using errcode='23514';
  end if;
  select * into found from public.restore_jobs where owner_id=own and backup_checksum=p_backup_checksum and plan_fingerprint=p_plan_fingerprint;
  if found.id is not null then return jsonb_build_object('jobId',found.id,'isExisting',true,'status',found.status); end if;
  insert into public.restore_jobs(owner_id,backup_format,backup_schema_version,backup_profile,backup_checksum,plan_format,plan_schema_version,plan_version,plan_fingerprint,analysis_fingerprint,source_name,policies,category_mappings,execution_stages,expected_record_count)
  values(own,p_backup_format,p_backup_schema_version,p_backup_profile,p_backup_checksum,p_plan_format,p_plan_schema_version,p_plan_version,p_plan_fingerprint,p_analysis_fingerprint,nullif(btrim(p_source_name),''),p_policies,p_category_mappings,p_execution_stages,p_expected_record_count) returning id into created_id;
  return jsonb_build_object('jobId',created_id,'isExisting',false,'status','preparing');
end $$;

create or replace function public.append_restore_job_records(p_job_id uuid,p_records jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare own uuid := (select auth.uid()); job public.restore_jobs; item jsonb; appended int:=0; existing_count int:=0; existing_fp text; operational boolean;
begin
  if own is null then raise exception 'RESTORE_PERMISSION_DENIED' using errcode='42501'; end if;
  select * into job from public.restore_jobs where id=p_job_id and owner_id=own for update;
  if job.id is null then raise exception 'RESTORE_PERMISSION_DENIED' using errcode='42501'; end if;
  if job.status<>'preparing' or jsonb_typeof(p_records)<>'array' or jsonb_array_length(p_records) not between 1 and 100 or octet_length(p_records::text)>4194304 then raise exception 'RESTORE_INVALID_PAYLOAD' using errcode='23514'; end if;
  operational := job.backup_profile='full' and job.policies->>'operationalHistory'='include';
  for item in select value from jsonb_array_elements(p_records) loop
    if (item->>'section' in ('importJobs','importJobItems','importJobItemAttempts') and not operational)
      or item->>'action'='block' or public.restore_payload_has_forbidden_key(item->'payload')
      or public.restore_payload_fingerprint(item->'payload')<>item->>'payloadFingerprint' then raise exception 'RESTORE_INVALID_PAYLOAD' using errcode='23514'; end if;
    select payload_fingerprint into existing_fp from public.restore_job_records where owner_id=own and job_id=p_job_id and section=item->>'section' and source_id=item->>'sourceId';
    if existing_fp is not null then if existing_fp<>item->>'payloadFingerprint' then raise exception 'RESTORE_SNAPSHOT_CONFLICT' using errcode='23505'; end if; existing_count:=existing_count+1; continue; end if;
    insert into public.restore_job_records(owner_id,job_id,section,source_id,target_id,action,stage_key,stage_order,sequence_no,payload,payload_fingerprint,dependencies,safe_display)
    values(own,p_job_id,item->>'section',item->>'sourceId',nullif(item->>'targetId',''),item->>'action',item->>'stageKey',(item->>'stageOrder')::int,(item->>'sequenceNo')::int,item->'payload',item->>'payloadFingerprint',item->'dependencies',coalesce(item->>'safeDisplay',''));
    appended:=appended+1;
  end loop;
  return jsonb_build_object('appendedCount',appended,'existingCount',existing_count,'storedCount',(select count(*) from public.restore_job_records where job_id=p_job_id and owner_id=own));
end $$;

create or replace function public.restore_target_exists(p_section text,p_target text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare target uuid;
begin
  if p_target is null or p_target !~* '^[0-9a-f-]{36}$' then return false; end if; target:=p_target::uuid;
  return case p_section
    when 'tags' then exists(select 1 from public.tags where id=target)
    when 'posts' then exists(select 1 from public.posts where id=target)
    when 'newsTopics' then exists(select 1 from public.news_topics where id=target)
    when 'newsStatusHistory' then exists(select 1 from public.news_status_history where id=target)
    when 'newsUpdates' then exists(select 1 from public.news_updates where id=target)
    when 'sources' then exists(select 1 from public.sources where id=target)
    when 'newsFollowups' then exists(select 1 from public.news_followups where id=target)
    when 'generatedPrompts' then exists(select 1 from public.generated_prompts where id=target)
    when 'importJobs' then exists(select 1 from public.import_jobs where id=target)
    when 'importJobItems' then exists(select 1 from public.import_job_items where id=target)
    when 'importJobItemAttempts' then exists(select 1 from public.import_job_item_attempts where id=target)
    else false end;
end $$;

revoke all on function public.restore_validate_import_history_plan(public.restore_jobs) from public,anon,authenticated;

create or replace function public.finalize_restore_job(p_job_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare own uuid := (select auth.uid()); job public.restore_jobs; total int; dep text; rec public.restore_job_records; jobs_stage int; items_stage int; attempts_stage int; core_stage int;
begin
  if own is null then raise exception 'RESTORE_PERMISSION_DENIED' using errcode='42501'; end if;
  select * into job from public.restore_jobs where id=p_job_id and owner_id=own for update;
  if job.id is null then raise exception 'RESTORE_PERMISSION_DENIED' using errcode='42501'; end if;
  if job.status<>'preparing' then return jsonb_build_object('jobId',job.id,'status',job.status,'recordCount',(select count(*) from public.restore_job_records where job_id=p_job_id),'idempotent',true); end if;
  select count(*) into total from public.restore_job_records where job_id=p_job_id and owner_id=own;
  if total<>job.expected_record_count then raise exception 'RESTORE_RECORD_COUNT_MISMATCH' using errcode='23514'; end if;
  if exists(select 1 from public.restore_job_records r where r.job_id=p_job_id and (
    r.section not in ('tags','posts','seoData','aiMetadata','infoDbMetadata','chineseMetadata','postTags','seriesCounters','newsTopics','newsStatusHistory','newsUpdates','newsUpdatePreviousLinks','sources','newsFollowups','generatedPrompts','importJobs','importJobItems','importJobItemAttempts')
    or public.restore_payload_fingerprint(r.payload)<>r.payload_fingerprint
  )) then raise exception 'RESTORE_INVALID_PAYLOAD' using errcode='23514'; end if;
  if exists(select 1 from public.restore_job_records r where r.job_id=p_job_id and r.owner_id=own and r.action in ('create','preserve_id','remap_id') and r.target_id is not null group by r.section,r.target_id having count(*)>1) then raise exception 'RESTORE_TARGET_ID_CONFLICT' using errcode='23505'; end if;

  perform public.restore_validate_import_history_plan(job);
  select max(stage_order) filter(where section not in ('importJobs','importJobItems','importJobItemAttempts')),
    min(stage_order) filter(where section='importJobs'), min(stage_order) filter(where section='importJobItems'), min(stage_order) filter(where section='importJobItemAttempts')
  into core_stage,jobs_stage,items_stage,attempts_stage from public.restore_job_records where job_id=p_job_id;
  if jobs_stage is not null and (core_stage is null or jobs_stage<=core_stage or items_stage is null or items_stage<=jobs_stage or attempts_stage is null or attempts_stage<=items_stage) then
    raise exception 'RESTORE_STAGE_BLOCKED' using errcode='23514';
  end if;

  for rec in select * from public.restore_job_records where job_id=p_job_id loop
    if rec.action in ('create','preserve_id','remap_id') and public.restore_target_exists(rec.section,rec.target_id) then raise exception 'RESTORE_TARGET_ID_CONFLICT' using errcode='23505'; end if;
    for dep in select jsonb_array_elements_text(rec.dependencies) loop
      if dep like 'category:%' then
        if not exists(select 1 from jsonb_array_elements(job.category_mappings) m join public.categories c on c.id=m->>'targetCategoryId' where m->>'sourceCategoryId'=substr(dep,10) and m->>'status'<>'blocked' and c.content_group=m->'target'->>'contentGroup' and c.code=m->'target'->>'code') then raise exception 'RESTORE_CATEGORY_MISMATCH' using errcode='23514'; end if;
      elsif not exists(select 1 from public.restore_job_records d where d.job_id=p_job_id and d.section=split_part(dep,':',1) and d.source_id=substr(dep,length(split_part(dep,':',1))+2)) then raise exception 'RESTORE_MISSING_DEPENDENCY' using errcode='23514'; end if;
    end loop;
  end loop;
  update public.restore_jobs set status='ready',current_stage_key=(select stage_key from public.restore_job_records where job_id=p_job_id order by stage_order,sequence_no limit 1) where id=p_job_id;
  return jsonb_build_object('jobId',p_job_id,'status','ready','recordCount',total,'idempotent',false);
end $$;

create or replace function public.restore_safe_error(p_message text)
returns jsonb language plpgsql stable set search_path = '' as $$
declare code text := coalesce((regexp_match(p_message, '(RESTORE_[A-Z_]+)'))[1], 'RESTORE_UNKNOWN'); retry boolean := false; msg text := 'record 복원 중 안전하게 처리할 수 없는 오류가 발생했습니다.';
begin
  if code in ('RESTORE_CONNECTION_FAILED','RESTORE_STAGE_BLOCKED','RESTORE_MISSING_DEPENDENCY') then retry := true; end if;
  if code='RESTORE_TARGET_ID_CONFLICT' then msg:='복원 target ID가 새로 사용되어 실행할 수 없습니다.';
  elsif code='RESTORE_UNIQUE_KEY_CONFLICT' then msg:='복원 대상의 unique key가 새로 사용되어 실행할 수 없습니다.';
  elsif code in ('RESTORE_REUSE_MISMATCH','RESTORE_IMPORT_JOB_REUSE_MISMATCH') then msg:='재사용 대상이 계획 생성 당시와 달라졌습니다.';
  elsif code='RESTORE_SKIP_MISMATCH' then msg:='생략 대상 관계가 계획 생성 당시와 달라졌습니다.';
  elsif code='RESTORE_MISSING_DEPENDENCY' then msg:='필수 선행 record가 아직 완료되지 않았습니다.';
  elsif code='RESTORE_CATEGORY_MISMATCH' then msg:='category 설정이 계획과 달라졌습니다.';
  elsif code='RESTORE_PREVIOUS_LINK_INVALID' then msg:='뉴스 previous update 연결을 안전하게 완성할 수 없습니다.';
  elsif code='RESTORE_SOURCE_LINK_INVALID' then msg:='출처와 뉴스 update 연결을 안전하게 완성할 수 없습니다.';
  elsif code='RESTORE_IMPORT_JOB_FINGERPRINT_CONFLICT' then msg:='동일 source fingerprint의 Import 작업이 현재 DB와 충돌합니다.';
  elsif code='RESTORE_IMPORT_ITEM_KEY_CONFLICT' then msg:='Import 항목 index 또는 external key가 현재 DB와 충돌합니다.';
  elsif code='RESTORE_IMPORT_ATTEMPT_CONFLICT' then msg:='Import 시도 번호가 현재 DB와 충돌합니다.';
  elsif code in ('RESTORE_IMPORT_PAYLOAD_INVALID','RESTORE_IMPORT_PAYLOAD_SENSITIVE','RESTORE_IMPORT_STATUS_INVALID','RESTORE_IMPORT_ATTEMPT_COUNT_MISMATCH') then msg:='Import 운영 이력 snapshot의 무결성 또는 보안 검증에 실패했습니다.';
  elsif code='RESTORE_INVALID_PAYLOAD' then msg:='불변 record snapshot이 유효하지 않습니다.'; end if;
  return jsonb_build_object('code',code,'message',msg,'retryable',retry);
end $$;

create or replace function public.run_restore_job_record(p_restore_job_record_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare own uuid:=(select auth.uid()); rec public.restore_job_records; job public.restore_jobs; attempt_id uuid; attempt_no_value int; outcome text; err jsonb; caught text;
begin
  if own is null then raise exception 'RESTORE_PERMISSION_DENIED' using errcode='42501'; end if;
  select * into rec from public.restore_job_records where id=p_restore_job_record_id and owner_id=own for update;
  if rec.id is null then raise exception 'RESTORE_PERMISSION_DENIED' using errcode='42501'; end if;
  select * into job from public.restore_jobs where id=rec.job_id and owner_id=own for update;
  if rec.status in ('applied','reused','skipped') then return jsonb_build_object('recordId',rec.id,'status',rec.status,'success',true,'idempotent',true); end if;
  if job.status not in ('ready','running','paused_with_errors') then raise exception 'RESTORE_JOB_NOT_READY' using errcode='23514'; end if;
  if rec.status='cancelled' or (rec.status='failed' and not coalesce(rec.retryable,false)) then raise exception 'RESTORE_RECORD_NOT_RETRYABLE' using errcode='23514'; end if;
  if exists(select 1 from public.restore_job_records prior where prior.job_id=rec.job_id and prior.owner_id=own and ((prior.stage_order<rec.stage_order and prior.status not in ('applied','reused','skipped')) or (prior.stage_order=rec.stage_order and prior.sequence_no<rec.sequence_no and prior.status in ('pending','running')))) then raise exception 'RESTORE_STAGE_BLOCKED' using errcode='23514'; end if;
  attempt_no_value:=rec.attempt_count+1;
  insert into public.restore_job_record_attempts(owner_id,restore_job_record_id,attempt_no,status) values(own,rec.id,attempt_no_value,'running') returning id into attempt_id;
  update public.restore_job_records set status='running',attempt_count=attempt_no_value,started_at=statement_timestamp(),completed_at=null,error_code=null,error_message=null,retryable=null where id=rec.id;
  update public.restore_jobs set status='running',started_at=coalesce(started_at,statement_timestamp()),completed_at=null where id=job.id;
  begin
    if rec.action in ('create','preserve_id','remap_id') and public.restore_target_exists(rec.section,rec.target_id) then raise exception 'RESTORE_TARGET_ID_CONFLICT' using errcode='23505'; end if;
    if rec.section in ('importJobs','importJobItems','importJobItemAttempts') then
      if job.backup_profile<>'full' or job.policies->>'operationalHistory'<>'include' then raise exception 'RESTORE_OPERATIONAL_HISTORY_BLOCKED' using errcode='23514'; end if;
      outcome:=public.restore_apply_import_record(rec,job.backup_checksum);
    else
      outcome:=public.restore_apply_record(rec,job.policies->>'timestamps'='preserve');
    end if;
  exception when others then get stacked diagnostics caught=message_text; err:=public.restore_safe_error(caught); end;
  if err is not null then
    update public.restore_job_records set status='failed',error_code=err->>'code',error_message=err->>'message',retryable=(err->>'retryable')::boolean,completed_at=statement_timestamp() where id=rec.id;
    update public.restore_job_record_attempts set status='failed',safe_error_code=err->>'code',safe_error_message=err->>'message',retryable=(err->>'retryable')::boolean,completed_at=statement_timestamp() where id=attempt_id;
    perform public.refresh_restore_job_status(job.id,own);
    return jsonb_build_object('recordId',rec.id,'status','failed','success',false,'idempotent',false,'errorCode',err->>'code','errorMessage',err->>'message','retryable',(err->>'retryable')::boolean);
  end if;
  update public.restore_job_records set status=outcome,error_code=null,error_message=null,retryable=false,completed_at=statement_timestamp() where id=rec.id;
  update public.restore_job_record_attempts set status=outcome,completed_at=statement_timestamp() where id=attempt_id;
  perform public.refresh_restore_job_status(job.id,own);
  return jsonb_build_object('recordId',rec.id,'status',outcome,'success',true,'idempotent',false);
end $$;

alter function public.get_user_backup_snapshot(text) rename to get_user_backup_snapshot_v1;

create function public.get_user_backup_snapshot(p_profile text default 'core')
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  result jsonb := public.get_user_backup_snapshot_v1(p_profile);
  jobs jsonb;
begin
  if lower(btrim(coalesce(p_profile,''))) <> 'full' then return result; end if;
  select coalesce(jsonb_agg(source.value || jsonb_build_object(
    'restoredFromBackup',job.restored_from_backup,
    'executionLocked',job.execution_locked,
    'restoreOriginChecksum',job.restore_origin_checksum
  ) order by source.ordinality),'[]'::jsonb)
  into jobs
  from jsonb_array_elements(result#>'{data,importJobs}') with ordinality source(value,ordinality)
  join public.import_jobs job on job.id=(source.value->>'id')::uuid and job.owner_id=(select auth.uid());
  return jsonb_set(result,'{data,importJobs}',jobs,false);
end;
$$;

alter function public.get_import_jobs(text,text,date,date,integer) rename to get_import_jobs_v1;
alter function public.get_import_job(uuid) rename to get_import_job_v1;

create function public.get_import_jobs(
  p_status text default null,p_source_name text default null,p_created_from date default null,
  p_created_to date default null,p_limit integer default 100
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare base jsonb; result jsonb;
begin
  base := public.get_import_jobs_v1(p_status,p_source_name,p_created_from,p_created_to,p_limit);
  select coalesce(jsonb_agg(source.value || jsonb_build_object(
    'restoredFromBackup',job.restored_from_backup,'executionLocked',job.execution_locked,
    'restoreOriginChecksum',job.restore_origin_checksum
  ) order by source.ordinality),'[]'::jsonb)
  into result
  from jsonb_array_elements(base) with ordinality source(value,ordinality)
  join public.import_jobs job on job.id=(source.value->>'id')::uuid and job.owner_id=(select auth.uid());
  return result;
end $$;

create function public.get_import_job(p_job_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare base jsonb; job public.import_jobs;
begin
  base := public.get_import_job_v1(p_job_id);
  if base is null then return null; end if;
  select * into job from public.import_jobs where id=p_job_id and owner_id=(select auth.uid());
  return base || jsonb_build_object(
    'restoredFromBackup',job.restored_from_backup,'executionLocked',job.execution_locked,
    'restoreOriginChecksum',job.restore_origin_checksum
  );
end $$;

comment on function public.get_user_backup_snapshot(text) is
  'Returns schemaVersion 1 backup data and explicit optional import provenance fields for full profile.';

revoke all on function public.get_user_backup_snapshot_v1(text), public.get_import_jobs_v1(text,text,date,date,integer), public.get_import_job_v1(uuid)
from public,anon,authenticated;
revoke all on function public.get_user_backup_snapshot(text), public.get_import_jobs(text,text,date,date,integer), public.get_import_job(uuid)
from public,anon;
grant execute on function public.get_user_backup_snapshot(text), public.get_import_jobs(text,text,date,date,integer), public.get_import_job(uuid)
to authenticated;
grant execute on function public.get_user_backup_snapshot_v1(text) to authenticated;

revoke all on function public.restore_import_job_exact(uuid,uuid,jsonb),
  public.restore_import_item_exact(public.restore_job_records), public.restore_import_attempt_exact(public.restore_job_records),
  public.restore_apply_import_record(public.restore_job_records,text), public.restore_validate_import_history_plan(public.restore_jobs),
  public.restore_planned_target(uuid,text,text), public.import_job_write_is_restore(),
  public.restore_import_payload_is_safe(jsonb), public.restore_import_error_is_safe(text),
  public.restore_import_item_payload_valid(jsonb,text)
from public,anon,authenticated;
