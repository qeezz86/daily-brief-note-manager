-- Phase 4B-4A: durable, resumable, record-transaction core restore execution.

create table public.restore_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  backup_format text not null check (backup_format = 'daily-brief-note-backup'),
  backup_schema_version integer not null check (backup_schema_version = 1),
  backup_profile text not null check (backup_profile in ('core', 'full')),
  backup_checksum text not null check (backup_checksum ~ '^[0-9a-f]{64}$'),
  plan_format text not null check (plan_format = 'daily-brief-note-restore-plan'),
  plan_schema_version integer not null check (plan_schema_version = 1),
  plan_version integer not null check (plan_version = 1),
  plan_fingerprint text not null check (plan_fingerprint ~ '^[0-9a-f]{64}$'),
  analysis_fingerprint text not null check (analysis_fingerprint ~ '^[0-9a-f]{64}$'),
  source_name text check (source_name is null or char_length(source_name) <= 500),
  status text not null default 'preparing' check (status in ('preparing','ready','running','paused_with_errors','completed','cancelled','failed')),
  policies jsonb not null check (jsonb_typeof(policies) = 'object'),
  category_mappings jsonb not null check (jsonb_typeof(category_mappings) = 'array'),
  execution_stages jsonb not null check (jsonb_typeof(execution_stages) = 'array'),
  expected_record_count integer not null check (expected_record_count between 1 and 100000),
  current_stage_key text,
  started_at timestamptz, completed_at timestamptz, cancelled_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, owner_id), unique (owner_id, backup_checksum, plan_fingerprint)
);

create table public.restore_job_records (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid not null, section text not null, source_id text not null, target_id text,
  action text not null check (action in ('create','preserve_id','remap_id','reuse_existing','skip')),
  stage_key text not null, stage_order integer not null check (stage_order > 0), sequence_no integer not null check (sequence_no >= 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'), payload_fingerprint text not null check (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  dependencies jsonb not null default '[]'::jsonb check (jsonb_typeof(dependencies) = 'array'),
  safe_display text not null default '' check (char_length(safe_display) <= 500),
  status text not null default 'pending' check (status in ('pending','running','applied','reused','skipped','failed','cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0), error_code text, error_message text, retryable boolean,
  started_at timestamptz, completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, owner_id), unique (owner_id, job_id, section, source_id), unique (owner_id, job_id, stage_order, sequence_no),
  foreign key (job_id, owner_id) references public.restore_jobs (id, owner_id) on delete cascade
);

create table public.restore_job_record_attempts (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users (id) on delete cascade,
  restore_job_record_id uuid not null, attempt_no integer not null check (attempt_no > 0),
  status text not null check (status in ('running','applied','reused','skipped','failed')),
  safe_error_code text, safe_error_message text, retryable boolean, started_at timestamptz not null default now(), completed_at timestamptz,
  unique (restore_job_record_id, attempt_no),
  foreign key (restore_job_record_id, owner_id) references public.restore_job_records (id, owner_id) on delete cascade
);

create index restore_jobs_owner_created_idx on public.restore_jobs (owner_id, created_at desc, id desc);
create index restore_records_job_stage_idx on public.restore_job_records (owner_id, job_id, stage_order, sequence_no);
create index restore_records_job_status_idx on public.restore_job_records (owner_id, job_id, status);
create index restore_attempts_record_idx on public.restore_job_record_attempts (owner_id, restore_job_record_id, attempt_no);

create trigger restore_jobs_set_updated_at before update on public.restore_jobs for each row execute function public.set_updated_at();
create trigger restore_job_records_set_updated_at before update on public.restore_job_records for each row execute function public.set_updated_at();

alter table public.restore_jobs enable row level security;
alter table public.restore_job_records enable row level security;
alter table public.restore_job_record_attempts enable row level security;
revoke all on table public.restore_jobs, public.restore_job_records, public.restore_job_record_attempts from public, anon, authenticated;
grant select on table public.restore_jobs, public.restore_job_records, public.restore_job_record_attempts to authenticated;
create policy restore_jobs_select_own on public.restore_jobs for select to authenticated using ((select auth.uid()) = owner_id);
create policy restore_records_select_own on public.restore_job_records for select to authenticated using ((select auth.uid()) = owner_id);
create policy restore_attempts_select_own on public.restore_job_record_attempts for select to authenticated using ((select auth.uid()) = owner_id);

create function public.restore_canonical_json(p_value jsonb) returns text language sql immutable set search_path = '' as $$
  select case jsonb_typeof(p_value)
    when 'object' then coalesce((select '{' || string_agg(to_jsonb(key)::text || ':' || public.restore_canonical_json(value), ',' order by key) || '}' from jsonb_each(p_value)), '{}')
    when 'array' then coalesce((select '[' || string_agg(public.restore_canonical_json(value), ',' order by ordinality) || ']' from jsonb_array_elements(p_value) with ordinality), '[]')
    else p_value::text end;
$$;

create function public.restore_payload_fingerprint(p_value jsonb) returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(convert_to(public.restore_canonical_json(p_value), 'UTF8'), 'sha256'), 'hex');
$$;

create function public.restore_payload_has_forbidden_key(p_value jsonb) returns boolean language plpgsql immutable set search_path = '' as $$
declare entry record; child jsonb;
begin
  if p_value is null then return false; end if;
  if jsonb_typeof(p_value)='object' then
    for entry in select key,value from jsonb_each(p_value) loop
      if lower(entry.key) = any(array['ownerid','owner_id','email','jwt','token','accesstoken','access_token','refreshtoken','refresh_token','authorization','cookie','password','secret','servicerole','service_role','sql']) then return true; end if;
      if public.restore_payload_has_forbidden_key(entry.value) then return true; end if;
    end loop;
  elsif jsonb_typeof(p_value)='array' then for child in select value from jsonb_array_elements(p_value) loop if public.restore_payload_has_forbidden_key(child) then return true; end if; end loop; end if;
  return false;
end $$;

create function public.restore_target(p_job_id uuid, p_section text, p_source_id text) returns text language sql stable security definer set search_path = '' as $$
  select target_id from public.restore_job_records where job_id = p_job_id and section = p_section and source_id = p_source_id
    and status in ('applied','reused','skipped') limit 1;
$$;

create function public.restore_safe_error(p_message text) returns jsonb language plpgsql stable set search_path = '' as $$
declare code text := coalesce((regexp_match(p_message, '(RESTORE_[A-Z_]+)'))[1], 'RESTORE_UNKNOWN'); retry boolean := false; msg text := 'record 복원 중 안전하게 처리할 수 없는 오류가 발생했습니다.';
begin
  if code in ('RESTORE_CONNECTION_FAILED','RESTORE_STAGE_BLOCKED','RESTORE_MISSING_DEPENDENCY') then retry := true; end if;
  if code = 'RESTORE_TARGET_ID_CONFLICT' then msg := '복원 target ID가 새로 사용되어 실행할 수 없습니다.';
  elsif code = 'RESTORE_UNIQUE_KEY_CONFLICT' then msg := '복원 대상의 unique key가 새로 사용되어 실행할 수 없습니다.';
  elsif code = 'RESTORE_REUSE_MISMATCH' then msg := '재사용 대상이 계획 생성 당시와 달라졌습니다.';
  elsif code = 'RESTORE_SKIP_MISMATCH' then msg := '생략 대상 관계가 계획 생성 당시와 달라졌습니다.';
  elsif code = 'RESTORE_MISSING_DEPENDENCY' then msg := '필수 선행 record가 아직 완료되지 않았습니다.';
  elsif code = 'RESTORE_CATEGORY_MISMATCH' then msg := 'category 설정이 계획과 달라졌습니다.';
  elsif code = 'RESTORE_PREVIOUS_LINK_INVALID' then msg := '뉴스 previous update 연결을 안전하게 완성할 수 없습니다.';
  elsif code = 'RESTORE_SOURCE_LINK_INVALID' then msg := '출처와 뉴스 update 연결을 안전하게 완성할 수 없습니다.';
  elsif code = 'RESTORE_INVALID_PAYLOAD' then msg := '불변 record snapshot이 유효하지 않습니다.'; end if;
  return jsonb_build_object('code', code, 'message', msg, 'retryable', retry);
end $$;

create function public.refresh_restore_job_status(p_job_id uuid, p_owner_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare next_stage integer; next_key text; has_failed boolean; has_work boolean;
begin
  if exists(select 1 from public.restore_jobs where id=p_job_id and owner_id=p_owner_id and status in ('cancelled','failed','completed')) then return; end if;
  select min(stage_order) into next_stage from public.restore_job_records where job_id=p_job_id and owner_id=p_owner_id and status not in ('applied','reused','skipped');
  if next_stage is null then update public.restore_jobs set status='completed', current_stage_key=null, completed_at=statement_timestamp() where id=p_job_id and owner_id=p_owner_id; return; end if;
  select stage_key, bool_or(status='failed'), bool_or(status in ('pending','running')) into next_key,has_failed,has_work from public.restore_job_records where job_id=p_job_id and owner_id=p_owner_id and stage_order=next_stage group by stage_key;
  update public.restore_jobs set current_stage_key=next_key, status=case when has_failed and not has_work then 'paused_with_errors' else case when started_at is null then 'ready' else 'running' end end where id=p_job_id and owner_id=p_owner_id;
end $$;

create function public.create_restore_job(
  p_backup_format text,p_backup_schema_version integer,p_backup_profile text,p_backup_checksum text,
  p_plan_format text,p_plan_schema_version integer,p_plan_version integer,p_plan_fingerprint text,p_analysis_fingerprint text,
  p_plan_status text,p_source_name text,p_policies jsonb,p_category_mappings jsonb,p_execution_stages jsonb,p_expected_record_count integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare own uuid := (select auth.uid()); found public.restore_jobs; created_id uuid;
begin
  if own is null then raise exception 'RESTORE_PERMISSION_DENIED' using errcode='42501'; end if;
  if p_backup_format <> 'daily-brief-note-backup' or p_backup_schema_version<>1 or p_backup_profile not in ('core','full') or p_plan_format<>'daily-brief-note-restore-plan' or p_plan_schema_version<>1 or p_plan_version<>1 or p_plan_status<>'ready' then raise exception 'RESTORE_INVALID_PAYLOAD' using errcode='23514'; end if;
  if p_policies->>'operationalHistory' <> 'exclude' then raise exception 'RESTORE_OPERATIONAL_HISTORY_BLOCKED' using errcode='23514'; end if;
  select * into found from public.restore_jobs where owner_id=own and backup_checksum=p_backup_checksum and plan_fingerprint=p_plan_fingerprint;
  if found.id is not null then return jsonb_build_object('jobId',found.id,'isExisting',true,'status',found.status); end if;
  insert into public.restore_jobs(owner_id,backup_format,backup_schema_version,backup_profile,backup_checksum,plan_format,plan_schema_version,plan_version,plan_fingerprint,analysis_fingerprint,source_name,policies,category_mappings,execution_stages,expected_record_count)
  values(own,p_backup_format,p_backup_schema_version,p_backup_profile,p_backup_checksum,p_plan_format,p_plan_schema_version,p_plan_version,p_plan_fingerprint,p_analysis_fingerprint,nullif(btrim(p_source_name),''),p_policies,p_category_mappings,p_execution_stages,p_expected_record_count) returning id into created_id;
  return jsonb_build_object('jobId',created_id,'isExisting',false,'status','preparing');
end $$;

create function public.append_restore_job_records(p_job_id uuid,p_records jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare own uuid := (select auth.uid()); job public.restore_jobs; item jsonb; appended int:=0; existing_count int:=0; existing_fp text;
begin
  if own is null then raise exception 'RESTORE_PERMISSION_DENIED' using errcode='42501'; end if;
  select * into job from public.restore_jobs where id=p_job_id and owner_id=own for update;
  if job.id is null then raise exception 'RESTORE_PERMISSION_DENIED' using errcode='42501'; end if;
  if job.status<>'preparing' or jsonb_typeof(p_records)<>'array' or jsonb_array_length(p_records) not between 1 and 100 or octet_length(p_records::text)>4194304 then raise exception 'RESTORE_INVALID_PAYLOAD' using errcode='23514'; end if;
  for item in select value from jsonb_array_elements(p_records) loop
    if item->>'section' in ('importJobs','importJobItems','importJobItemAttempts') or item->>'action'='block' or public.restore_payload_has_forbidden_key(item->'payload') or public.restore_payload_fingerprint(item->'payload')<>item->>'payloadFingerprint' then raise exception 'RESTORE_INVALID_PAYLOAD' using errcode='23514'; end if;
    select payload_fingerprint into existing_fp from public.restore_job_records where owner_id=own and job_id=p_job_id and section=item->>'section' and source_id=item->>'sourceId';
    if existing_fp is not null then if existing_fp<>item->>'payloadFingerprint' then raise exception 'RESTORE_SNAPSHOT_CONFLICT' using errcode='23505'; end if; existing_count:=existing_count+1; continue; end if;
    insert into public.restore_job_records(owner_id,job_id,section,source_id,target_id,action,stage_key,stage_order,sequence_no,payload,payload_fingerprint,dependencies,safe_display)
    values(own,p_job_id,item->>'section',item->>'sourceId',nullif(item->>'targetId',''),item->>'action',item->>'stageKey',(item->>'stageOrder')::int,(item->>'sequenceNo')::int,item->'payload',item->>'payloadFingerprint',item->'dependencies',coalesce(item->>'safeDisplay',''));
    appended:=appended+1;
  end loop;
  return jsonb_build_object('appendedCount',appended,'existingCount',existing_count,'storedCount',(select count(*) from public.restore_job_records where job_id=p_job_id and owner_id=own));
end $$;

create function public.restore_target_exists(p_section text,p_target text) returns boolean language plpgsql stable security definer set search_path = '' as $$
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
    else false end;
end $$;

create function public.finalize_restore_job(p_job_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare own uuid := (select auth.uid()); job public.restore_jobs; total int; dep text; rec public.restore_job_records;
begin
  if own is null then raise exception 'RESTORE_PERMISSION_DENIED' using errcode='42501'; end if;
  select * into job from public.restore_jobs where id=p_job_id and owner_id=own for update;
  if job.id is null then raise exception 'RESTORE_PERMISSION_DENIED' using errcode='42501'; end if;
  if job.status<>'preparing' then return jsonb_build_object('jobId',job.id,'status',job.status,'recordCount',(select count(*) from public.restore_job_records where job_id=p_job_id),'idempotent',true); end if;
  select count(*) into total from public.restore_job_records where job_id=p_job_id and owner_id=own;
  if total<>job.expected_record_count then raise exception 'RESTORE_RECORD_COUNT_MISMATCH' using errcode='23514'; end if;
  if exists(select 1 from public.restore_job_records r where r.job_id=p_job_id and (r.section not in ('tags','posts','seoData','aiMetadata','infoDbMetadata','chineseMetadata','postTags','seriesCounters','newsTopics','newsStatusHistory','newsUpdates','newsUpdatePreviousLinks','sources','newsFollowups','generatedPrompts') or public.restore_payload_fingerprint(r.payload)<>r.payload_fingerprint)) then raise exception 'RESTORE_INVALID_PAYLOAD' using errcode='23514'; end if;
  if exists(select 1 from public.restore_job_records r where r.job_id=p_job_id and r.owner_id=own and r.action in ('create','preserve_id','remap_id') and r.target_id is not null group by r.section,r.target_id having count(*)>1) then raise exception 'RESTORE_TARGET_ID_CONFLICT' using errcode='23505'; end if;
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

create function public.restore_verify_existing(p_record public.restore_job_records) returns boolean language plpgsql security definer set search_path = '' as $$
declare p jsonb:=p_record.payload; own uuid:=p_record.owner_id; target uuid; post_target uuid; tag_target uuid; previous_target uuid;
begin
  if p_record.target_id ~* '^[0-9a-f-]{36}$' then target:=p_record.target_id::uuid; end if;
  if p_record.section='tags' then return exists(select 1 from public.tags where id=target and owner_id=own and name=p->>'name' and normalized_name=p->>'normalizedName');
  elsif p_record.section='posts' then return exists(select 1 from public.posts where id=target and owner_id=own and category_id=p->>'categoryId' and title=p->>'title' and slug=p->>'slug' and wordpress_url is not distinct from nullif(p->>'wordpressUrl','') and series_no is not distinct from (p->>'seriesNo')::int and briefing_date is not distinct from (p->>'briefingDate')::date and published_on is not distinct from (p->>'publishedOn')::date and display_id is not distinct from nullif(p->>'displayId',''));
  elsif p_record.section='seoData' then post_target:=public.restore_target(p_record.job_id,'posts',p->>'postId')::uuid; return exists(select 1 from public.seo_data where post_id=post_target and owner_id=own and representative_title is not distinct from nullif(p->>'representativeTitle','') and meta_description=p->>'metaDescription' and focus_keyword is not distinct from nullif(p->>'focusKeyword',''));
  elsif p_record.section='aiMetadata' then post_target:=public.restore_target(p_record.job_id,'posts',p->>'postId')::uuid; return exists(select 1 from public.ai_metadata where post_id=post_target and owner_id=own and field_name is not distinct from nullif(p->>'fieldName','') and difficulty is not distinct from nullif(p->>'difficulty','') and estimated_read_min is not distinct from (p->>'estimatedReadMin')::int);
  elsif p_record.section='infoDbMetadata' then post_target:=public.restore_target(p_record.job_id,'posts',p->>'postId')::uuid; return exists(select 1 from public.info_db_metadata where post_id=post_target and owner_id=own and field_name is not distinct from nullif(p->>'fieldName','') and difficulty is not distinct from nullif(p->>'difficulty','') and estimated_read_min is not distinct from (p->>'estimatedReadMin')::int and reference_date is not distinct from (p->>'referenceDate')::date);
  elsif p_record.section='chineseMetadata' then post_target:=public.restore_target(p_record.job_id,'posts',p->>'postId')::uuid; return exists(select 1 from public.chinese_metadata where post_id=post_target and owner_id=own and original_url is not distinct from nullif(p->>'originalUrl','') and original_title is not distinct from nullif(p->>'originalTitle','') and learning_topic is not distinct from nullif(p->>'learningTopic',''));
  elsif p_record.section='postTags' then post_target:=public.restore_target(p_record.job_id,'posts',p->>'postId')::uuid; tag_target:=public.restore_target(p_record.job_id,'tags',p->>'tagId')::uuid; return exists(select 1 from public.post_tags where post_id=post_target and tag_id=tag_target and owner_id=own);
  elsif p_record.section='seriesCounters' then return exists(select 1 from public.series_counters where owner_id=own and category_id=p->>'categoryId' and last_issued_no >= coalesce((p_record.payload->>'plannedLastIssuedNo')::int,(p->>'lastIssuedNo')::int));
  elsif p_record.section='newsTopics' then return exists(select 1 from public.news_topics where id=target and owner_id=own and category_id=p->>'categoryId' and topic_key=p->>'topicKey' and canonical_title=p->>'canonicalTitle' and topic_summary is not distinct from nullif(p->>'topicSummary','') and status=p->>'status' and closed_reason is not distinct from nullif(p->>'closedReason',''));
  elsif p_record.section='newsStatusHistory' then return exists(select 1 from public.news_status_history where id=target and owner_id=own and to_status=p->>'toStatus' and changed_at=(p->>'changedAt')::timestamptz);
  elsif p_record.section='newsUpdates' then previous_target:=case when nullif(p->>'previousUpdateId','') is null then null else public.restore_target(p_record.job_id,'newsUpdates',p->>'previousUpdateId')::uuid end; return exists(select 1 from public.news_updates where id=target and owner_id=own and item_order=(p->>'itemOrder')::int and update_type=p->>'updateType' and headline=p->>'headline' and previous_update_id is not distinct from previous_target);
  elsif p_record.section='sources' then return exists(select 1 from public.sources where id=target and owner_id=own and source_url=p->>'sourceUrl' and sort_order=(p->>'sortOrder')::int);
  elsif p_record.section='newsFollowups' then return exists(select 1 from public.news_followups where id=target and owner_id=own and check_text=p->>'checkText' and status=p->>'status');
  elsif p_record.section='generatedPrompts' then return exists(select 1 from public.generated_prompts where id=target and owner_id=own and category_id=p->>'categoryId' and prompt_text=p->>'promptText' and generated_at=(p->>'generatedAt')::timestamptz);
  end if; return false;
end $$;

create function public.restore_apply_record(p_record public.restore_job_records,p_preserve boolean) returns text language plpgsql security definer set search_path = '' as $$
 declare p jsonb:=p_record.payload; own uuid:=p_record.owner_id; target uuid; post_target uuid; topic_target uuid; previous_target uuid; tag_target uuid; caught text; created_ts timestamptz; updated_ts timestamptz;
 begin
  created_ts:=case when p_preserve then (p->>'createdAt')::timestamptz else statement_timestamp() end; updated_ts:=case when p_preserve then (p->>'updatedAt')::timestamptz else statement_timestamp() end;
  if p_record.action in ('reuse_existing','skip') then if not public.restore_verify_existing(p_record) then raise exception '%' ,case when p_record.action='skip' then 'RESTORE_SKIP_MISMATCH' else 'RESTORE_REUSE_MISMATCH' end using errcode='23514'; end if; return case when p_record.action='skip' then 'skipped' else 'reused' end; end if;
  if p_record.target_id ~* '^[0-9a-f-]{36}$' then target:=p_record.target_id::uuid; end if;
  if p_record.section='tags' then insert into public.tags(id,owner_id,name,normalized_name,created_at) values(target,own,p->>'name',p->>'normalizedName',created_ts);
  elsif p_record.section='posts' then insert into public.posts(id,owner_id,category_id,series_no,briefing_date,published_on,display_id,title,summary,html_body,slug,wordpress_url,content_status,published_at,source_import_type,image_prompt,image_alt,image_prompt_version,image_prompt_updated_at,created_at,updated_at) values(target,own,p->>'categoryId',(p->>'seriesNo')::int,(p->>'briefingDate')::date,(p->>'publishedOn')::date,nullif(p->>'displayId',''),p->>'title',p->>'summary',p->>'htmlBody',p->>'slug',nullif(p->>'wordpressUrl',''),p->>'contentStatus',(p->>'publishedAt')::timestamptz,p->>'sourceImportType',nullif(p->>'imagePrompt',''),nullif(p->>'imageAlt',''),(p->>'imagePromptVersion')::int,(p->>'imagePromptUpdatedAt')::timestamptz,created_ts,updated_ts);
  elsif p_record.section='seoData' then post_target:=public.restore_target(p_record.job_id,'posts',p->>'postId')::uuid; if not exists(select 1 from public.restore_job_records parent where parent.job_id=p_record.job_id and parent.owner_id=own and parent.section='posts' and parent.source_id=p->>'postId' and parent.action in ('create','preserve_id','remap_id') and parent.status='applied') then raise exception 'RESTORE_REUSE_MISMATCH' using errcode='23514'; end if; insert into public.seo_data(post_id,owner_id,representative_title,alternative_titles,meta_description,focus_keyword,created_at,updated_at) values(post_target,own,p->>'representativeTitle',p->'alternativeTitles',p->>'metaDescription',p->>'focusKeyword',created_ts,updated_ts);
  elsif p_record.section='aiMetadata' then post_target:=public.restore_target(p_record.job_id,'posts',p->>'postId')::uuid; if not exists(select 1 from public.restore_job_records parent join public.posts post on post.id=parent.target_id::uuid and post.owner_id=own where parent.job_id=p_record.job_id and parent.owner_id=own and parent.section='posts' and parent.source_id=p->>'postId' and parent.action in ('create','preserve_id','remap_id') and parent.status='applied' and post.category_id='ai-column') then raise exception 'RESTORE_CATEGORY_MISMATCH' using errcode='23514'; end if; insert into public.ai_metadata(post_id,owner_id,field_name,difficulty,estimated_read_min) values(post_target,own,nullif(p->>'fieldName',''),nullif(p->>'difficulty',''),(p->>'estimatedReadMin')::int);
  elsif p_record.section='infoDbMetadata' then post_target:=public.restore_target(p_record.job_id,'posts',p->>'postId')::uuid; if not exists(select 1 from public.restore_job_records parent join public.posts post on post.id=parent.target_id::uuid and post.owner_id=own where parent.job_id=p_record.job_id and parent.owner_id=own and parent.section='posts' and parent.source_id=p->>'postId' and parent.action in ('create','preserve_id','remap_id') and parent.status='applied' and post.category_id='info-db') then raise exception 'RESTORE_CATEGORY_MISMATCH' using errcode='23514'; end if; insert into public.info_db_metadata(post_id,owner_id,field_name,difficulty,estimated_read_min,reference_date) values(post_target,own,nullif(p->>'fieldName',''),nullif(p->>'difficulty',''),(p->>'estimatedReadMin')::int,(p->>'referenceDate')::date);
  elsif p_record.section='chineseMetadata' then post_target:=public.restore_target(p_record.job_id,'posts',p->>'postId')::uuid; if not exists(select 1 from public.restore_job_records parent join public.posts post on post.id=parent.target_id::uuid and post.owner_id=own where parent.job_id=p_record.job_id and parent.owner_id=own and parent.section='posts' and parent.source_id=p->>'postId' and parent.action in ('create','preserve_id','remap_id') and parent.status='applied' and post.category_id='chinese-study') then raise exception 'RESTORE_CATEGORY_MISMATCH' using errcode='23514'; end if; insert into public.chinese_metadata(post_id,owner_id,learning_topic,program_name,original_title,original_url,original_published_at,episode_list_included,verified_core_fact,difficulty,learning_points) values(post_target,own,nullif(p->>'learningTopic',''),nullif(p->>'programName',''),nullif(p->>'originalTitle',''),nullif(p->>'originalUrl',''),(p->>'originalPublishedAt')::timestamptz,(p->>'episodeListIncluded')::boolean,nullif(p->>'verifiedCoreFact',''),nullif(p->>'difficulty',''),nullif(p->>'learningPoints',''));
  elsif p_record.section='postTags' then post_target:=public.restore_target(p_record.job_id,'posts',p->>'postId')::uuid; tag_target:=public.restore_target(p_record.job_id,'tags',p->>'tagId')::uuid; insert into public.post_tags(post_id,tag_id,owner_id) values(post_target,tag_target,own);
  elsif p_record.section='seriesCounters' then insert into public.series_counters(owner_id,category_id,last_issued_no,updated_at) values(own,p->>'categoryId',coalesce((p_record.payload->>'plannedLastIssuedNo')::int,(p->>'lastIssuedNo')::int),updated_ts) on conflict(owner_id,category_id) do update set last_issued_no=greatest(public.series_counters.last_issued_no,excluded.last_issued_no),updated_at=greatest(public.series_counters.updated_at,excluded.updated_at);
  elsif p_record.section='newsTopics' then insert into public.news_topics(id,owner_id,category_id,topic_key,canonical_title,topic_summary,status,closed_reason,first_seen_at,last_seen_at,created_at,updated_at) values(target,own,p->>'categoryId',p->>'topicKey',p->>'canonicalTitle',nullif(p->>'topicSummary',''),p->>'status',nullif(p->>'closedReason',''),(p->>'firstSeenAt')::date,(p->>'lastSeenAt')::date,created_ts,updated_ts);
  elsif p_record.section='newsStatusHistory' then topic_target:=public.restore_target(p_record.job_id,'newsTopics',p->>'topicId')::uuid; insert into public.news_status_history(id,owner_id,topic_id,from_status,to_status,reason,changed_at) values(target,own,topic_target,nullif(p->>'fromStatus',''),p->>'toStatus',nullif(p->>'reason',''),case when p_preserve then (p->>'changedAt')::timestamptz else statement_timestamp() end);
  elsif p_record.section='newsUpdates' then post_target:=public.restore_target(p_record.job_id,'posts',p->>'postId')::uuid; topic_target:=public.restore_target(p_record.job_id,'newsTopics',p->>'topicId')::uuid; insert into public.news_updates(id,owner_id,post_id,topic_id,item_order,update_type,headline,fact_summary,importance_summary,impact_summary,change_summary,previous_update_id,created_at,updated_at) values(target,own,post_target,topic_target,(p->>'itemOrder')::int,p->>'updateType',p->>'headline',p->>'factSummary',nullif(p->>'importanceSummary',''),nullif(p->>'impactSummary',''),nullif(p->>'changeSummary',''),null,created_ts,updated_ts);
  elsif p_record.section='newsUpdatePreviousLinks' then target:=public.restore_target(p_record.job_id,'newsUpdates',p->>'updateId')::uuid; previous_target:=public.restore_target(p_record.job_id,'newsUpdates',p->>'previousUpdateId')::uuid; if target is null or previous_target is null or target=previous_target or not exists(select 1 from public.restore_job_records where job_id=p_record.job_id and section='newsUpdates' and source_id=p->>'updateId' and action in ('create','preserve_id','remap_id') and status='applied') or exists(with recursive chain as (select id,previous_update_id from public.news_updates where id=previous_target and owner_id=own union select item.id,item.previous_update_id from public.news_updates item join chain on item.id=chain.previous_update_id where item.owner_id=own) select 1 from chain where previous_update_id=target) then raise exception 'RESTORE_PREVIOUS_LINK_INVALID' using errcode='23514'; end if; update public.news_updates u set previous_update_id=previous_target where u.id=target and u.owner_id=own and u.previous_update_id is null and exists(select 1 from public.news_updates prev where prev.id=previous_target and prev.owner_id=own and prev.topic_id=u.topic_id); if not found then raise exception 'RESTORE_PREVIOUS_LINK_INVALID' using errcode='23514'; end if;
  elsif p_record.section='sources' then post_target:=public.restore_target(p_record.job_id,'posts',p->>'postId')::uuid; previous_target:=case when nullif(p->>'newsUpdateId','') is null then null else public.restore_target(p_record.job_id,'newsUpdates',p->>'newsUpdateId')::uuid end; if previous_target is not null and not exists(select 1 from public.news_updates update_row where update_row.id=previous_target and update_row.owner_id=own and update_row.post_id=post_target) then raise exception 'RESTORE_SOURCE_LINK_INVALID' using errcode='23514'; end if; insert into public.sources(id,owner_id,post_id,news_update_id,source_name,source_title,source_url,source_published_at,checked_at,checked_point,sort_order,created_at,updated_at) values(target,own,post_target,previous_target,p->>'sourceName',p->>'sourceTitle',p->>'sourceUrl',(p->>'sourcePublishedAt')::timestamptz,(p->>'checkedAt')::timestamptz,p->>'checkedPoint',(p->>'sortOrder')::int,created_ts,updated_ts);
  elsif p_record.section='newsFollowups' then topic_target:=public.restore_target(p_record.job_id,'newsTopics',p->>'topicId')::uuid; if p->>'status'='pending' and exists(select 1 from public.news_topics topic where topic.id=topic_target and topic.owner_id=own and topic.status='closed') then raise exception 'RESTORE_INVALID_PAYLOAD' using errcode='23514'; end if; insert into public.news_followups(id,owner_id,topic_id,check_text,status,due_date,priority,resolution_note,resolved_at,created_at,updated_at) values(target,own,topic_target,p->>'checkText',p->>'status',(p->>'dueDate')::date,p->>'priority',nullif(p->>'resolutionNote',''),(p->>'resolvedAt')::timestamptz,created_ts,updated_ts);
  elsif p_record.section='generatedPrompts' then insert into public.generated_prompts(id,owner_id,category_id,requested_post_count,actual_post_count,prompt_mode,prompt_text,is_pinned,generated_at,reference_date,closed_lookback_days,context_schema_version,context_snapshot) values(target,own,p->>'categoryId',(p->>'requestedPostCount')::int,(p->>'actualPostCount')::int,p->>'promptMode',p->>'promptText',(p->>'isPinned')::boolean,case when p_preserve then (p->>'generatedAt')::timestamptz else statement_timestamp() end,(p->>'referenceDate')::date,(p->>'closedLookbackDays')::int,(p->>'contextSchemaVersion')::int,p->'contextSnapshot');
  else raise exception 'RESTORE_INVALID_SECTION' using errcode='23514'; end if;
  return 'applied';
exception when unique_violation then raise exception 'RESTORE_UNIQUE_KEY_CONFLICT' using errcode='23505'; when foreign_key_violation then raise exception 'RESTORE_MISSING_DEPENDENCY' using errcode='23503'; when check_violation then get stacked diagnostics caught=message_text; if caught like 'RESTORE_%' then raise exception '%' ,caught using errcode='23514'; end if; raise exception 'RESTORE_INVALID_PAYLOAD' using errcode='23514'; when not_null_violation or invalid_text_representation or invalid_datetime_format or datetime_field_overflow then raise exception 'RESTORE_INVALID_PAYLOAD' using errcode='23514';
end $$;

create function public.run_restore_job_record(p_restore_job_record_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
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
  attempt_no_value:=rec.attempt_count+1; insert into public.restore_job_record_attempts(owner_id,restore_job_record_id,attempt_no,status) values(own,rec.id,attempt_no_value,'running') returning id into attempt_id;
  update public.restore_job_records set status='running',attempt_count=attempt_no_value,started_at=statement_timestamp(),completed_at=null,error_code=null,error_message=null,retryable=null where id=rec.id;
  update public.restore_jobs set status='running',started_at=coalesce(started_at,statement_timestamp()),completed_at=null where id=job.id;
  begin if rec.action in ('create','preserve_id','remap_id') and public.restore_target_exists(rec.section,rec.target_id) then raise exception 'RESTORE_TARGET_ID_CONFLICT' using errcode='23505'; end if; outcome:=public.restore_apply_record(rec,job.policies->>'timestamps'='preserve'); exception when others then get stacked diagnostics caught=message_text; err:=public.restore_safe_error(caught); end;
  if err is not null then update public.restore_job_records set status='failed',error_code=err->>'code',error_message=err->>'message',retryable=(err->>'retryable')::boolean,completed_at=statement_timestamp() where id=rec.id; update public.restore_job_record_attempts set status='failed',safe_error_code=err->>'code',safe_error_message=err->>'message',retryable=(err->>'retryable')::boolean,completed_at=statement_timestamp() where id=attempt_id; perform public.refresh_restore_job_status(job.id,own); return jsonb_build_object('recordId',rec.id,'status','failed','success',false,'idempotent',false,'errorCode',err->>'code','errorMessage',err->>'message','retryable',(err->>'retryable')::boolean); end if;
  update public.restore_job_records set status=outcome,error_code=null,error_message=null,retryable=false,completed_at=statement_timestamp() where id=rec.id; update public.restore_job_record_attempts set status=outcome,completed_at=statement_timestamp() where id=attempt_id; perform public.refresh_restore_job_status(job.id,own);
  return jsonb_build_object('recordId',rec.id,'status',outcome,'success',true,'idempotent',false);
end $$;

create function public.cancel_restore_job(p_job_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare own uuid:=(select auth.uid()); job public.restore_jobs; changed int;
begin if own is null then raise exception 'RESTORE_PERMISSION_DENIED' using errcode='42501'; end if; select * into job from public.restore_jobs where id=p_job_id and owner_id=own for update; if job.id is null then raise exception 'RESTORE_PERMISSION_DENIED' using errcode='42501'; end if; if job.status in ('completed','cancelled','failed') then return jsonb_build_object('jobId',job.id,'status',job.status,'idempotent',true); end if; update public.restore_job_records set status='cancelled',completed_at=statement_timestamp() where job_id=p_job_id and owner_id=own and status='pending'; get diagnostics changed=row_count; update public.restore_jobs set status='cancelled',cancelled_at=statement_timestamp(),completed_at=null where id=p_job_id; return jsonb_build_object('jobId',p_job_id,'status','cancelled','cancelledCount',changed,'idempotent',false); end $$;

create function public.resume_cancelled_restore_job(p_job_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare own uuid:=(select auth.uid()); job public.restore_jobs; changed int;
begin if own is null then raise exception 'RESTORE_PERMISSION_DENIED' using errcode='42501'; end if; select * into job from public.restore_jobs where id=p_job_id and owner_id=own for update; if job.id is null then raise exception 'RESTORE_PERMISSION_DENIED' using errcode='42501'; end if; if job.status<>'cancelled' then return jsonb_build_object('jobId',job.id,'status',job.status,'idempotent',true); end if;
  if exists(select 1 from public.restore_job_records r where r.job_id=p_job_id and r.status='cancelled' and r.action in ('create','preserve_id','remap_id') and ((r.section='posts' and exists(select 1 from public.posts where id=r.target_id::uuid)) or (r.section='tags' and exists(select 1 from public.tags where id=r.target_id::uuid)) or (r.section='newsTopics' and exists(select 1 from public.news_topics where id=r.target_id::uuid)) or (r.section='newsUpdates' and exists(select 1 from public.news_updates where id=r.target_id::uuid)) or (r.section='sources' and exists(select 1 from public.sources where id=r.target_id::uuid)))) then raise exception 'RESTORE_PLAN_STALE' using errcode='23514'; end if;
  update public.restore_job_records set status='pending',completed_at=null where job_id=p_job_id and owner_id=own and status='cancelled'; get diagnostics changed=row_count; update public.restore_jobs set status=case when started_at is null then 'ready' else 'running' end,cancelled_at=null where id=p_job_id; perform public.refresh_restore_job_status(p_job_id,own); return jsonb_build_object('jobId',p_job_id,'status',(select status from public.restore_jobs where id=p_job_id),'resumedCount',changed,'idempotent',false); end $$;

create function public.restore_job_json(p_job_id uuid) returns jsonb language sql stable security invoker set search_path = '' as $$
select jsonb_build_object('id',j.id,'sourceName',j.source_name,'backupProfile',j.backup_profile,'backupChecksum',j.backup_checksum,'planFingerprint',j.plan_fingerprint,'status',j.status,'currentStageKey',j.current_stage_key,'totalCount',count(r.id),'pendingCount',count(r.id) filter(where r.status='pending'),'runningCount',count(r.id) filter(where r.status='running'),'appliedCount',count(r.id) filter(where r.status='applied'),'reusedCount',count(r.id) filter(where r.status='reused'),'skippedCount',count(r.id) filter(where r.status='skipped'),'failedCount',count(r.id) filter(where r.status='failed'),'cancelledCount',count(r.id) filter(where r.status='cancelled'),'retryableFailureCount',count(r.id) filter(where r.status='failed' and r.retryable),'completedStageCount',count(distinct r.stage_order) filter(where not exists(select 1 from public.restore_job_records x where x.job_id=j.id and x.stage_order=r.stage_order and x.status not in ('applied','reused','skipped'))),'stageCount',count(distinct r.stage_order),'progressPercent',case when count(r.id)=0 then 0 else round(100.0*count(r.id) filter(where r.status in ('applied','reused','skipped','failed','cancelled'))/count(r.id),1) end,'stageProgressPercent',case when count(r.id) filter(where r.stage_key=j.current_stage_key)=0 then 0 else round(100.0*count(r.id) filter(where r.stage_key=j.current_stage_key and r.status in ('applied','reused','skipped','failed','cancelled'))/count(r.id) filter(where r.stage_key=j.current_stage_key),1) end,'createdAt',j.created_at,'startedAt',j.started_at,'completedAt',j.completed_at,'cancelledAt',j.cancelled_at) from public.restore_jobs j left join public.restore_job_records r on r.job_id=j.id and r.owner_id=j.owner_id where j.id=p_job_id and j.owner_id=(select auth.uid()) group by j.id;
$$;
create function public.get_restore_jobs(p_limit integer default 100) returns jsonb language sql stable security invoker set search_path = '' as $$ select coalesce(jsonb_agg(public.restore_job_json(id) order by created_at desc,id desc),'[]'::jsonb) from (select id,created_at from public.restore_jobs where owner_id=(select auth.uid()) order by created_at desc,id desc limit least(greatest(coalesce(p_limit,100),1),100)) q; $$;
create function public.get_restore_job(p_job_id uuid) returns jsonb language sql stable security invoker set search_path = '' as $$ select public.restore_job_json(j.id)||jsonb_build_object('backupFormat',j.backup_format,'backupSchemaVersion',j.backup_schema_version,'planFormat',j.plan_format,'planSchemaVersion',j.plan_schema_version,'planVersion',j.plan_version,'analysisFingerprint',j.analysis_fingerprint,'policies',j.policies,'categoryMappings',j.category_mappings,'executionStages',j.execution_stages) from public.restore_jobs j where j.id=p_job_id and j.owner_id=(select auth.uid()); $$;
create function public.get_restore_job_records(p_job_id uuid,p_stage text default null,p_section text default null,p_action text default null,p_status text default null,p_retryable boolean default null,p_search text default null) returns jsonb language sql stable security invoker set search_path = '' as $$ select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'section',r.section,'sourceId',r.source_id,'targetId',r.target_id,'action',r.action,'stageKey',r.stage_key,'stageOrder',r.stage_order,'sequenceNo',r.sequence_no,'safeDisplay',r.safe_display,'status',r.status,'attemptCount',r.attempt_count,'errorCode',r.error_code,'errorMessage',r.error_message,'retryable',r.retryable,'startedAt',r.started_at,'completedAt',r.completed_at,'attempts',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'attemptNo',a.attempt_no,'status',a.status,'safeErrorCode',a.safe_error_code,'safeErrorMessage',a.safe_error_message,'retryable',a.retryable,'startedAt',a.started_at,'completedAt',a.completed_at) order by a.attempt_no) from public.restore_job_record_attempts a where a.restore_job_record_id=r.id and a.owner_id=r.owner_id),'[]'::jsonb)) order by r.stage_order,r.sequence_no),'[]'::jsonb) from public.restore_job_records r where r.job_id=p_job_id and r.owner_id=(select auth.uid()) and (p_stage is null or r.stage_key=p_stage) and (p_section is null or r.section=p_section) and (p_action is null or r.action=p_action) and (p_status is null or r.status=p_status) and (p_retryable is null or r.retryable=p_retryable) and (nullif(btrim(p_search),'') is null or r.safe_display ilike '%'||btrim(p_search)||'%' or r.source_id ilike '%'||btrim(p_search)||'%' or r.target_id ilike '%'||btrim(p_search)||'%'); $$;

comment on table public.restore_job_records is 'Immutable execution snapshots; retry reads only this row and direct writes are not granted.';
revoke all on function public.restore_canonical_json(jsonb),public.restore_payload_fingerprint(jsonb),public.restore_payload_has_forbidden_key(jsonb),public.restore_target(uuid,text,text),public.restore_safe_error(text),public.refresh_restore_job_status(uuid,uuid),public.restore_target_exists(text,text),public.restore_verify_existing(public.restore_job_records),public.restore_apply_record(public.restore_job_records,boolean),public.restore_job_json(uuid) from public,anon,authenticated;
revoke all on function public.create_restore_job(text,integer,text,text,text,integer,integer,text,text,text,text,jsonb,jsonb,jsonb,integer),public.append_restore_job_records(uuid,jsonb),public.finalize_restore_job(uuid),public.run_restore_job_record(uuid),public.cancel_restore_job(uuid),public.resume_cancelled_restore_job(uuid),public.get_restore_jobs(integer),public.get_restore_job(uuid),public.get_restore_job_records(uuid,text,text,text,text,boolean,text) from public,anon;
grant execute on function public.create_restore_job(text,integer,text,text,text,integer,integer,text,text,text,text,jsonb,jsonb,jsonb,integer),public.append_restore_job_records(uuid,jsonb),public.finalize_restore_job(uuid),public.run_restore_job_record(uuid),public.cancel_restore_job(uuid),public.resume_cancelled_restore_job(uuid),public.get_restore_jobs(integer),public.get_restore_job(uuid),public.get_restore_job_records(uuid,text,text,text,text,boolean,text) to authenticated;
