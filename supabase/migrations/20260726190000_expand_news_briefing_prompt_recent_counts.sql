-- Phase 5C-R2: expand news briefing prompt recent-post counts without new columns.

begin;

create or replace function public.get_news_briefing_prompt_context(
  p_category_id text,
  p_reference_date date,
  p_recent_post_limit integer default 5,
  p_closed_lookback_days integer default 90,
  p_closed_limit integer default 20
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_owner uuid := (select auth.uid());
  selected_category public.categories;
  context_result jsonb;
begin
  if current_owner is null then
    raise exception 'BRIEFING_PROMPT_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_reference_date is null then
    raise exception 'BRIEFING_PROMPT_REFERENCE_DATE_REQUIRED' using errcode = '22023';
  end if;
  if p_recent_post_limit is null or p_recent_post_limit not in (5, 10, 15) then
    raise exception 'BRIEFING_PROMPT_RECENT_LIMIT_INVALID' using errcode = '22023';
  end if;
  if p_closed_lookback_days is null or p_closed_lookback_days < 1 or p_closed_lookback_days > 180 then
    raise exception 'BRIEFING_PROMPT_LOOKBACK_INVALID' using errcode = '22023';
  end if;
  if p_closed_limit is null or p_closed_limit < 1 or p_closed_limit > 20 then
    raise exception 'BRIEFING_PROMPT_CLOSED_LIMIT_INVALID' using errcode = '22023';
  end if;

  select category.* into selected_category
  from public.categories as category
  where category.id = p_category_id;

  if selected_category.id is null then
    raise exception 'BRIEFING_PROMPT_CATEGORY_NOT_FOUND' using errcode = '22023';
  end if;
  if selected_category.content_group <> 'news' then
    raise exception 'BRIEFING_PROMPT_NEWS_CATEGORY_REQUIRED' using errcode = '22023';
  end if;
  if not selected_category.enabled then
    raise exception 'BRIEFING_PROMPT_CATEGORY_DISABLED' using errcode = '22023';
  end if;

  with recent_posts as (
    select post.id, post.published_on, post.updated_at, post.display_id,
           post.title, post.summary
    from public.posts as post
    where post.owner_id = current_owner
      and post.category_id = p_category_id
      and post.content_status = 'published'
      and post.published_on <= p_reference_date
    order by post.published_on desc, post.updated_at desc, post.id asc
    limit p_recent_post_limit
  ),
  recent_post_json as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', post.id,
        'publishedOn', post.published_on,
        'updatedAt', post.updated_at,
        'displayId', post.display_id,
        'title', post.title,
        'summary', post.summary,
        'updates', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', update_row.id,
            'itemOrder', update_row.item_order,
            'updateType', update_row.update_type,
            'headline', update_row.headline,
            'factSummary', update_row.fact_summary,
            'importanceSummary', update_row.importance_summary,
            'impactSummary', update_row.impact_summary,
            'changeSummary', update_row.change_summary,
            'topicId', topic.id,
            'topicKey', topic.topic_key,
            'topicTitle', topic.canonical_title,
            'previousUpdateId', update_row.previous_update_id
          ) order by update_row.item_order, update_row.id)
          from public.news_updates as update_row
          join public.news_topics as topic
            on topic.id = update_row.topic_id and topic.owner_id = current_owner
          where update_row.owner_id = current_owner and update_row.post_id = post.id
        ), '[]'::jsonb)
      ) order by post.published_on desc, post.updated_at desc, post.id asc
    ), '[]'::jsonb) as value
    from recent_posts as post
  ),
  open_topic_rows as (
    select topic.id, topic.topic_key, topic.canonical_title, topic.topic_summary,
           topic.status, topic.first_seen_at, topic.last_seen_at, topic.closed_reason,
           latest_update.id as latest_update_id,
           latest_update.headline as latest_headline,
           latest_update.update_type as latest_update_type,
           latest_update.fact_summary as latest_fact_summary,
           latest_update.change_summary as latest_change_summary,
           latest_update.published_on as latest_published_on
    from public.news_topics as topic
    left join lateral (
      select update_row.id, update_row.headline, update_row.update_type,
             update_row.fact_summary, update_row.change_summary, post.published_on
      from public.news_updates as update_row
      join public.posts as post
        on post.id = update_row.post_id and post.owner_id = current_owner
      where update_row.owner_id = current_owner
        and update_row.topic_id = topic.id
        and post.published_on <= p_reference_date
      order by post.published_on desc nulls last, update_row.created_at desc, update_row.id
      limit 1
    ) as latest_update on true
    where topic.owner_id = current_owner
      and topic.category_id = p_category_id
      and topic.status in ('active', 'monitoring', 'reopened')
      and topic.first_seen_at < ((p_reference_date + 1)::timestamp at time zone 'Asia/Seoul')
  ),
  open_topic_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', topic.id,
      'topicKey', topic.topic_key,
      'canonicalTitle', topic.canonical_title,
      'topicSummary', topic.topic_summary,
      'status', topic.status,
      'firstSeenAt', topic.first_seen_at,
      'lastSeenAt', topic.last_seen_at,
      'lastClosedReason', topic.closed_reason,
      'latestUpdate', case when topic.latest_update_id is null then null else jsonb_build_object(
        'id', topic.latest_update_id,
        'headline', topic.latest_headline,
        'updateType', topic.latest_update_type,
        'factSummary', topic.latest_fact_summary,
        'changeSummary', topic.latest_change_summary,
        'publishedOn', topic.latest_published_on
      ) end
    ) order by
      case topic.status when 'reopened' then 1 when 'active' then 2 else 3 end,
      topic.last_seen_at desc, topic.topic_key, topic.id), '[]'::jsonb) as value
    from open_topic_rows as topic
  ),
  followup_rows as (
    select followup.id, followup.check_text, followup.priority, followup.due_date,
           followup.updated_at, topic.id as topic_id, topic.topic_key,
           topic.canonical_title,
           (followup.due_date is not null and followup.due_date < p_reference_date) as overdue
    from public.news_followups as followup
    join public.news_topics as topic
      on topic.id = followup.topic_id and topic.owner_id = current_owner
    where followup.owner_id = current_owner
      and followup.status = 'pending'
      and topic.category_id = p_category_id
      and followup.created_at < ((p_reference_date + 1)::timestamp at time zone 'Asia/Seoul')
  ),
  followup_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', followup.id,
      'checkText', followup.check_text,
      'priority', followup.priority,
      'dueDate', followup.due_date,
      'overdue', followup.overdue,
      'topicId', followup.topic_id,
      'topicKey', followup.topic_key,
      'topicTitle', followup.canonical_title
    ) order by followup.overdue desc,
      case followup.priority when 'high' then 1 when 'normal' then 2 else 3 end,
      followup.due_date asc nulls last, followup.updated_at desc, followup.id), '[]'::jsonb) as value
    from followup_rows as followup
  ),
  closed_topic_rows as (
    select topic.id, topic.topic_key, topic.canonical_title, topic.topic_summary,
           topic.closed_reason, closed_history.changed_at as closed_at,
           closure_update.headline as closure_headline,
           closure_update.fact_summary as closure_fact_summary,
           closure_update.change_summary as closure_change_summary
    from public.news_topics as topic
    join lateral (
      select history.changed_at
      from public.news_status_history as history
      where history.owner_id = current_owner
        and history.topic_id = topic.id
        and history.to_status = 'closed'
        and history.changed_at < ((p_reference_date + 1)::timestamp at time zone 'Asia/Seoul')
      order by history.changed_at desc, history.id desc
      limit 1
    ) as closed_history on true
    left join lateral (
      select update_row.headline, update_row.fact_summary, update_row.change_summary
      from public.news_updates as update_row
      join public.posts as post
        on post.id = update_row.post_id and post.owner_id = current_owner
      where update_row.owner_id = current_owner
        and update_row.topic_id = topic.id
        and update_row.update_type = 'closure_note'
        and post.published_on <= p_reference_date
      order by post.published_on desc nulls last, update_row.created_at desc, update_row.id
      limit 1
    ) as closure_update on true
    where topic.owner_id = current_owner
      and topic.category_id = p_category_id
      and topic.status = 'closed'
      and closed_history.changed_at >= ((p_reference_date - p_closed_lookback_days)::timestamp at time zone 'Asia/Seoul')
    order by closed_history.changed_at desc, topic.id
    limit p_closed_limit
  ),
  closed_topic_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', topic.id,
      'topicKey', topic.topic_key,
      'canonicalTitle', topic.canonical_title,
      'topicSummary', topic.topic_summary,
      'closedReason', topic.closed_reason,
      'closedAt', topic.closed_at,
      'closureNote', case when topic.closure_headline is null then null else jsonb_build_object(
        'headline', topic.closure_headline,
        'factSummary', topic.closure_fact_summary,
        'changeSummary', topic.closure_change_summary
      ) end
    ) order by topic.closed_at desc, topic.id), '[]'::jsonb) as value
    from closed_topic_rows as topic
  )
  select jsonb_build_object(
    'schemaVersion', 1,
    'referenceDate', p_reference_date,
    'category', jsonb_build_object(
      'id', selected_category.id,
      'name', selected_category.name,
      'code', selected_category.code,
      'wrapperClass', selected_category.wrapper_class,
      'displayIdPattern', selected_category.display_id_pattern,
      'slugPattern', selected_category.slug_pattern
    ),
    'recentPosts', recent_post_json.value,
    'openTopics', open_topic_json.value,
    'pendingFollowups', followup_json.value,
    'recentClosedTopics', closed_topic_json.value,
    'counts', jsonb_build_object(
      'recentPosts', jsonb_array_length(recent_post_json.value),
      'recentUpdates', (select coalesce(sum(jsonb_array_length(post.value -> 'updates')), 0)::integer from jsonb_array_elements(recent_post_json.value) as post(value)),
      'openTopics', jsonb_array_length(open_topic_json.value),
      'pendingFollowups', jsonb_array_length(followup_json.value),
      'overdueFollowups', (select count(*)::integer from jsonb_array_elements(followup_json.value) as followup(value) where (followup.value ->> 'overdue')::boolean),
      'recentClosedTopics', jsonb_array_length(closed_topic_json.value)
    )
  ) into context_result
  from recent_post_json, open_topic_json, followup_json, closed_topic_json;

  return context_result;
end;
$$;

drop function public.save_news_briefing_prompt_run(
  text, date, text, integer, integer, jsonb, text
);

create function public.save_news_briefing_prompt_run(
  p_category_id text,
  p_reference_date date,
  p_prompt_mode text,
  p_closed_lookback_days integer,
  p_context_schema_version integer,
  p_context_snapshot jsonb,
  p_prompt_text text,
  p_requested_post_count integer default 5
)
returns public.generated_prompts
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := (select auth.uid());
  selected_category public.categories;
  actual_post_count integer;
  saved_prompt public.generated_prompts;
begin
  if current_owner is null then
    raise exception 'BRIEFING_PROMPT_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_reference_date is null then
    raise exception 'BRIEFING_PROMPT_REFERENCE_DATE_REQUIRED' using errcode = '22023';
  end if;
  if p_prompt_mode is null or p_prompt_mode not in ('simple', 'standard', 'detailed') then
    raise exception 'BRIEFING_PROMPT_MODE_INVALID' using errcode = '22023';
  end if;
  if p_closed_lookback_days is null or p_closed_lookback_days not between 1 and 180 then
    raise exception 'BRIEFING_PROMPT_LOOKBACK_INVALID' using errcode = '22023';
  end if;
  if p_context_schema_version is distinct from 1 then
    raise exception 'BRIEFING_PROMPT_SCHEMA_VERSION_INVALID' using errcode = '22023';
  end if;
  if p_requested_post_count is null or p_requested_post_count not in (5, 10, 15) then
    raise exception 'BRIEFING_PROMPT_REQUESTED_POST_COUNT_INVALID' using errcode = '22023';
  end if;
  if p_context_snapshot is null or jsonb_typeof(p_context_snapshot) <> 'object' then
    raise exception 'BRIEFING_PROMPT_SNAPSHOT_INVALID' using errcode = '22023';
  end if;
  if p_context_snapshot ? 'ownerId'
     or p_context_snapshot ? 'owner_id'
     or p_context_snapshot ? 'email' then
    raise exception 'BRIEFING_PROMPT_SNAPSHOT_PRIVATE_FIELD' using errcode = '22023';
  end if;
  if p_context_snapshot ->> 'schemaVersion' is distinct from p_context_schema_version::text then
    raise exception 'BRIEFING_PROMPT_SNAPSHOT_VERSION_MISMATCH' using errcode = '22023';
  end if;
  if jsonb_typeof(p_context_snapshot -> 'category') is distinct from 'object'
     or p_context_snapshot -> 'category' ->> 'id' is distinct from p_category_id then
    raise exception 'BRIEFING_PROMPT_SNAPSHOT_CATEGORY_MISMATCH' using errcode = '22023';
  end if;
  if p_context_snapshot ->> 'referenceDate' is distinct from p_reference_date::text then
    raise exception 'BRIEFING_PROMPT_SNAPSHOT_DATE_MISMATCH' using errcode = '22023';
  end if;
  if jsonb_typeof(p_context_snapshot -> 'recentPosts') is distinct from 'array' then
    raise exception 'BRIEFING_PROMPT_SNAPSHOT_POSTS_INVALID' using errcode = '22023';
  end if;
  if p_prompt_text is null or btrim(p_prompt_text) = '' then
    raise exception 'BRIEFING_PROMPT_TEXT_REQUIRED' using errcode = '22023';
  end if;

  select category.*
    into selected_category
    from public.categories as category
   where category.id = p_category_id;

  if selected_category.id is null then
    raise exception 'BRIEFING_PROMPT_CATEGORY_NOT_FOUND' using errcode = '22023';
  end if;
  if selected_category.content_group <> 'news' then
    raise exception 'BRIEFING_PROMPT_NEWS_CATEGORY_REQUIRED' using errcode = '22023';
  end if;
  if not selected_category.enabled then
    raise exception 'BRIEFING_PROMPT_CATEGORY_DISABLED' using errcode = '22023';
  end if;

  actual_post_count := jsonb_array_length(p_context_snapshot -> 'recentPosts');
  if actual_post_count > p_requested_post_count then
    raise exception 'BRIEFING_PROMPT_SNAPSHOT_POST_LIMIT_INVALID' using errcode = '22023';
  end if;

  insert into public.generated_prompts (
    owner_id,
    category_id,
    requested_post_count,
    actual_post_count,
    prompt_mode,
    prompt_text,
    is_pinned,
    generated_at,
    reference_date,
    closed_lookback_days,
    context_schema_version,
    context_snapshot
  )
  values (
    current_owner,
    p_category_id,
    p_requested_post_count,
    actual_post_count,
    p_prompt_mode,
    p_prompt_text,
    false,
    clock_timestamp(),
    p_reference_date,
    p_closed_lookback_days,
    p_context_schema_version,
    p_context_snapshot
  )
  returning * into saved_prompt;

  delete from public.generated_prompts as prompt
   using (
     select stale_prompt.id
       from public.generated_prompts as stale_prompt
      where stale_prompt.owner_id = current_owner
        and stale_prompt.category_id = p_category_id
        and stale_prompt.is_pinned = false
      order by stale_prompt.generated_at desc, stale_prompt.id desc
      offset 30
   ) as stale
   where prompt.id = stale.id;

  return saved_prompt;
end;
$$;

create or replace function public.restore_apply_record(
  p_record public.restore_job_records,
  p_preserve boolean
)
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
  if p_record.section = 'generatedPrompts' then
    if jsonb_typeof(p -> 'requestedPostCount') is distinct from 'number'
       or (p ->> 'requestedPostCount') not in ('5', '10', '15')
       or jsonb_typeof(p -> 'actualPostCount') is distinct from 'number'
       or (p ->> 'actualPostCount') !~ '^(0|[1-9][0-9]*)$'
       or (p ->> 'actualPostCount')::integer > (p ->> 'requestedPostCount')::integer then
      raise exception 'RESTORE_INVALID_PAYLOAD' using errcode = '23514';
    end if;
    return public.restore_apply_record_phase4b(p_record, p_preserve);
  end if;
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

alter function public.get_news_briefing_prompt_context(
  text, date, integer, integer, integer
) owner to postgres;
alter function public.save_news_briefing_prompt_run(
  text, date, text, integer, integer, jsonb, text, integer
) owner to postgres;
alter function public.restore_apply_record(
  public.restore_job_records, boolean
) owner to postgres;

revoke all on function public.get_news_briefing_prompt_context(
  text, date, integer, integer, integer
) from public, anon;
grant execute on function public.get_news_briefing_prompt_context(
  text, date, integer, integer, integer
) to authenticated;

revoke all on function public.save_news_briefing_prompt_run(
  text, date, text, integer, integer, jsonb, text, integer
) from public, anon;
grant execute on function public.save_news_briefing_prompt_run(
  text, date, text, integer, integer, jsonb, text, integer
) to authenticated;

revoke all on function public.restore_apply_record(
  public.restore_job_records, boolean
) from public, anon, authenticated;

commit;
