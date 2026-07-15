-- Phase 4B-1: deterministic, read-only user backup estimates and snapshots.

create function public.get_user_backup_estimate(p_profile text default 'core')
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_profile text := lower(btrim(coalesce(p_profile, '')));
  v_result jsonb;
begin
  if v_owner_id is null then
    raise exception using errcode = '42501', message = 'BACKUP_AUTH_REQUIRED';
  end if;
  if v_profile not in ('core', 'full') then
    raise exception using errcode = '22023', message = 'BACKUP_PROFILE_INVALID';
  end if;

  with section_counts as (
    select jsonb_strip_nulls(jsonb_build_object(
      'posts', (select count(*) from public.posts where owner_id = v_owner_id),
      'seoData', (select count(*) from public.seo_data where owner_id = v_owner_id),
      'tags', (select count(*) from public.tags where owner_id = v_owner_id),
      'postTags', (select count(*) from public.post_tags where owner_id = v_owner_id),
      'sources', (select count(*) from public.sources where owner_id = v_owner_id),
      'aiMetadata', (select count(*) from public.ai_metadata where owner_id = v_owner_id),
      'infoDbMetadata', (select count(*) from public.info_db_metadata where owner_id = v_owner_id),
      'chineseMetadata', (select count(*) from public.chinese_metadata where owner_id = v_owner_id),
      'seriesCounters', (select count(*) from public.series_counters where owner_id = v_owner_id),
      'newsTopics', (select count(*) from public.news_topics where owner_id = v_owner_id),
      'newsStatusHistory', (select count(*) from public.news_status_history where owner_id = v_owner_id),
      'newsUpdates', (select count(*) from public.news_updates where owner_id = v_owner_id),
      'newsFollowups', (select count(*) from public.news_followups where owner_id = v_owner_id),
      'generatedPrompts', (select count(*) from public.generated_prompts where owner_id = v_owner_id),
      'importJobs', case when v_profile = 'full' then (select count(*) from public.import_jobs where owner_id = v_owner_id) end,
      'importJobItems', case when v_profile = 'full' then (select count(*) from public.import_job_items where owner_id = v_owner_id) end,
      'importJobItemAttempts', case when v_profile = 'full' then (select count(*) from public.import_job_item_attempts where owner_id = v_owner_id) end
    )) counts
  )
  select jsonb_build_object(
    'profile', v_profile,
    'sectionCounts', counts,
    'totalRecords', (select coalesce(sum(entry.value::text::bigint), 0) from jsonb_each(counts) as entry(key, value)),
    'categoryManifestCount', (select count(*) from public.categories),
    'includesOperationalHistory', v_profile = 'full',
    'includesNormalizedPayload', v_profile = 'full'
  ) into v_result
  from section_counts;

  return v_result;
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
  v_profile text := lower(btrim(coalesce(p_profile, '')));
  v_result jsonb;
begin
  if v_owner_id is null then
    raise exception using errcode = '42501', message = 'BACKUP_AUTH_REQUIRED';
  end if;
  if v_profile not in ('core', 'full') then
    raise exception using errcode = '22023', message = 'BACKUP_PROFILE_INVALID';
  end if;

  -- Every data-bearing CTE below is part of this single SQL statement, so all
  -- sections, counts and relationship checks share one PostgreSQL snapshot.
  with
  category_manifest as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'contentGroup', content_group,
      'name', name,
      'code', code,
      'wrapperClass', wrapper_class,
      'displayIdPattern', display_id_pattern,
      'slugPattern', slug_pattern,
      'sortOrder', sort_order,
      'enabled', enabled,
      'createdAt', created_at,
      'updatedAt', updated_at
    ) order by sort_order asc, id asc), '[]'::jsonb) value
    from public.categories
  ),
  posts_data as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'categoryId', category_id,
      'seriesNo', series_no,
      'briefingDate', briefing_date,
      'publishedOn', published_on,
      'displayId', display_id,
      'title', title,
      'summary', summary,
      'htmlBody', html_body,
      'slug', slug,
      'wordpressUrl', wordpress_url,
      'contentStatus', content_status,
      'publishedAt', published_at,
      'sourceImportType', source_import_type,
      'imagePrompt', image_prompt,
      'imageAlt', image_alt,
      'imagePromptVersion', image_prompt_version,
      'imagePromptUpdatedAt', image_prompt_updated_at,
      'createdAt', created_at,
      'updatedAt', updated_at
    ) order by created_at asc, id asc), '[]'::jsonb) value
    from public.posts where owner_id = v_owner_id
  ),
  seo_data as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'postId', post_id,
      'representativeTitle', representative_title,
      'alternativeTitles', alternative_titles,
      'metaDescription', meta_description,
      'focusKeyword', focus_keyword,
      'createdAt', created_at,
      'updatedAt', updated_at
    ) order by post_id asc), '[]'::jsonb) value
    from public.seo_data where owner_id = v_owner_id
  ),
  tags_data as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'name', name,
      'normalizedName', normalized_name,
      'createdAt', created_at
    ) order by normalized_name asc, id asc), '[]'::jsonb) value
    from public.tags where owner_id = v_owner_id
  ),
  post_tags_data as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'postId', post_id,
      'tagId', tag_id
    ) order by post_id asc, tag_id asc), '[]'::jsonb) value
    from public.post_tags where owner_id = v_owner_id
  ),
  sources_data as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'postId', post_id,
      'newsUpdateId', news_update_id,
      'sourceName', source_name,
      'sourceTitle', source_title,
      'sourceUrl', source_url,
      'sourcePublishedAt', source_published_at,
      'checkedAt', checked_at,
      'checkedPoint', checked_point,
      'sortOrder', sort_order,
      'createdAt', created_at,
      'updatedAt', updated_at
    ) order by post_id asc, sort_order asc, id asc), '[]'::jsonb) value
    from public.sources where owner_id = v_owner_id
  ),
  ai_metadata_data as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'postId', post_id,
      'fieldName', field_name,
      'difficulty', difficulty,
      'estimatedReadMin', estimated_read_min
    ) order by post_id asc), '[]'::jsonb) value
    from public.ai_metadata where owner_id = v_owner_id
  ),
  info_db_metadata_data as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'postId', post_id,
      'fieldName', field_name,
      'difficulty', difficulty,
      'estimatedReadMin', estimated_read_min,
      'referenceDate', reference_date
    ) order by post_id asc), '[]'::jsonb) value
    from public.info_db_metadata where owner_id = v_owner_id
  ),
  chinese_metadata_data as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'postId', post_id,
      'learningTopic', learning_topic,
      'programName', program_name,
      'originalTitle', original_title,
      'originalUrl', original_url,
      'originalPublishedAt', original_published_at,
      'episodeListIncluded', episode_list_included,
      'verifiedCoreFact', verified_core_fact,
      'difficulty', difficulty,
      'learningPoints', learning_points
    ) order by post_id asc), '[]'::jsonb) value
    from public.chinese_metadata where owner_id = v_owner_id
  ),
  series_counters_data as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'categoryId', category_id,
      'lastIssuedNo', last_issued_no,
      'updatedAt', updated_at
    ) order by category_id asc), '[]'::jsonb) value
    from public.series_counters where owner_id = v_owner_id
  ),
  news_topics_data as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'categoryId', category_id,
      'topicKey', topic_key,
      'canonicalTitle', canonical_title,
      'topicSummary', topic_summary,
      'status', status,
      'closedReason', closed_reason,
      'firstSeenAt', first_seen_at,
      'lastSeenAt', last_seen_at,
      'createdAt', created_at,
      'updatedAt', updated_at
    ) order by category_id asc, topic_key asc, id asc), '[]'::jsonb) value
    from public.news_topics where owner_id = v_owner_id
  ),
  news_status_history_data as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'topicId', topic_id,
      'fromStatus', from_status,
      'toStatus', to_status,
      'reason', reason,
      'changedAt', changed_at
    ) order by topic_id asc, changed_at asc, id asc), '[]'::jsonb) value
    from public.news_status_history where owner_id = v_owner_id
  ),
  news_updates_data as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'postId', post_id,
      'topicId', topic_id,
      'itemOrder', item_order,
      'updateType', update_type,
      'headline', headline,
      'factSummary', fact_summary,
      'importanceSummary', importance_summary,
      'impactSummary', impact_summary,
      'changeSummary', change_summary,
      'previousUpdateId', previous_update_id,
      'createdAt', created_at,
      'updatedAt', updated_at
    ) order by post_id asc, item_order asc, id asc), '[]'::jsonb) value
    from public.news_updates where owner_id = v_owner_id
  ),
  news_followups_data as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'topicId', topic_id,
      'checkText', check_text,
      'status', status,
      'dueDate', due_date,
      'priority', priority,
      'resolutionNote', resolution_note,
      'resolvedAt', resolved_at,
      'createdAt', created_at,
      'updatedAt', updated_at
    ) order by topic_id asc, created_at asc, id asc), '[]'::jsonb) value
    from public.news_followups where owner_id = v_owner_id
  ),
  generated_prompts_data as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'categoryId', category_id,
      'requestedPostCount', requested_post_count,
      'actualPostCount', actual_post_count,
      'promptMode', prompt_mode,
      'referenceDate', reference_date,
      'closedLookbackDays', closed_lookback_days,
      'contextSchemaVersion', context_schema_version,
      'contextSnapshot', context_snapshot,
      'promptText', prompt_text,
      'isPinned', is_pinned,
      'generatedAt', generated_at
    ) order by generated_at asc, id asc), '[]'::jsonb) value
    from public.generated_prompts where owner_id = v_owner_id
  ),
  import_jobs_data as (
    select case when v_profile = 'full' then coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'format', format,
      'schemaVersion', schema_version,
      'sourceName', source_name,
      'sourceFingerprint', source_fingerprint,
      'status', status,
      'expectedItemCount', expected_item_count,
      'totalCount', total_count,
      'readyCount', ready_count,
      'warningCount', warning_count,
      'invalidCount', invalid_count,
      'duplicateCount', duplicate_count,
      'acknowledgedWarningCount', acknowledged_warning_count,
      'dryRunSummary', dry_run_summary,
      'startedAt', started_at,
      'completedAt', completed_at,
      'cancelledAt', cancelled_at,
      'createdAt', created_at,
      'updatedAt', updated_at
    ) order by created_at asc, id asc), '[]'::jsonb) else null end value
    from public.import_jobs where owner_id = v_owner_id
  ),
  import_job_items_data as (
    select case when v_profile = 'full' then coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'jobId', job_id,
      'itemIndex', item_index,
      'externalKey', external_key,
      'payloadFingerprint', payload_fingerprint,
      'title', title,
      'categoryId', category_id,
      'validationStatus', validation_status,
      'normalizedPayload', normalized_payload,
      'warningAcknowledged', warning_acknowledged,
      'contentStatus', content_status,
      'trackingStatus', tracking_status,
      'postId', post_id,
      'contentAttemptCount', content_attempt_count,
      'trackingAttemptCount', tracking_attempt_count,
      'contentErrorCode', content_error_code,
      'contentErrorMessage', content_error_message,
      'contentRetryable', content_retryable,
      'trackingErrorCode', tracking_error_code,
      'trackingErrorMessage', tracking_error_message,
      'trackingRetryable', tracking_retryable,
      'topicCount', topic_count,
      'reusedTopicCount', reused_topic_count,
      'createdTopicCount', created_topic_count,
      'updateCount', update_count,
      'followupCount', followup_count,
      'sourceLinkCount', source_link_count,
      'contentStartedAt', content_started_at,
      'contentCompletedAt', content_completed_at,
      'trackingStartedAt', tracking_started_at,
      'trackingCompletedAt', tracking_completed_at,
      'createdAt', created_at,
      'updatedAt', updated_at
    ) order by job_id asc, item_index asc, id asc), '[]'::jsonb) else null end value
    from public.import_job_items where owner_id = v_owner_id
  ),
  import_job_item_attempts_data as (
    select case when v_profile = 'full' then coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'jobItemId', job_item_id,
      'stage', stage,
      'attemptNo', attempt_no,
      'status', status,
      'safeErrorCode', safe_error_code,
      'safeErrorMessage', safe_error_message,
      'retryable', retryable,
      'startedAt', started_at,
      'completedAt', completed_at
    ) order by job_item_id asc, attempt_no asc, id asc), '[]'::jsonb) else null end value
    from public.import_job_item_attempts where owner_id = v_owner_id
  ),
  relationship_check as (
    select not exists (
      select 1
      from public.news_updates update_row
      join public.news_updates previous_row
        on previous_row.id = update_row.previous_update_id
       and previous_row.owner_id = update_row.owner_id
      where update_row.owner_id = v_owner_id
        and update_row.topic_id <> previous_row.topic_id
    ) passed
  ),
  data_object as (
    select jsonb_build_object(
      'posts', posts_data.value,
      'seoData', seo_data.value,
      'tags', tags_data.value,
      'postTags', post_tags_data.value,
      'sources', sources_data.value,
      'aiMetadata', ai_metadata_data.value,
      'infoDbMetadata', info_db_metadata_data.value,
      'chineseMetadata', chinese_metadata_data.value,
      'seriesCounters', series_counters_data.value,
      'newsTopics', news_topics_data.value,
      'newsStatusHistory', news_status_history_data.value,
      'newsUpdates', news_updates_data.value,
      'newsFollowups', news_followups_data.value,
      'generatedPrompts', generated_prompts_data.value
    ) || case when v_profile = 'full' then jsonb_build_object(
      'importJobs', import_jobs_data.value,
      'importJobItems', import_job_items_data.value,
      'importJobItemAttempts', import_job_item_attempts_data.value
    ) else '{}'::jsonb end value
    from posts_data, seo_data, tags_data, post_tags_data, sources_data,
      ai_metadata_data, info_db_metadata_data, chinese_metadata_data,
      series_counters_data, news_topics_data, news_status_history_data,
      news_updates_data, news_followups_data, generated_prompts_data,
      import_jobs_data, import_job_items_data, import_job_item_attempts_data
  ),
  section_counts as (
    select jsonb_object_agg(entry.key, jsonb_array_length(entry.value) order by entry.key) value
    from data_object
    cross join lateral jsonb_each(data_object.value) as entry(key, value)
  )
  select jsonb_build_object(
    'profile', v_profile,
    'snapshotSchemaVersion', 1,
    'categoryManifest', category_manifest.value,
    'sectionCounts', section_counts.value,
    'totalRecords', (select coalesce(sum(entry.value::text::bigint), 0) from jsonb_each(section_counts.value) as entry(key, value)),
    'includesOperationalHistory', v_profile = 'full',
    'relationshipCheck', case when relationship_check.passed then 'passed' else 'failed' end,
    'data', data_object.value
  ) into v_result
  from category_manifest, data_object, section_counts, relationship_check;

  return v_result;
end;
$$;

comment on function public.get_user_backup_estimate(text) is
  'Returns lightweight current-user backup section counts. Read-only SECURITY INVOKER.';
comment on function public.get_user_backup_snapshot(text) is
  'Returns a deterministic current-user backup snapshot from one data-bearing SQL statement.';

revoke all on function public.get_user_backup_estimate(text) from public, anon;
revoke all on function public.get_user_backup_snapshot(text) from public, anon;
grant execute on function public.get_user_backup_estimate(text) to authenticated;
grant execute on function public.get_user_backup_snapshot(text) to authenticated;
