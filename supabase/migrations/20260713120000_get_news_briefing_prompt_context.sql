-- Phase 3B-1: build a deterministic, read-only briefing prompt context.

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
  if p_recent_post_limit is null or p_recent_post_limit < 1 or p_recent_post_limit > 5 then
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
    select post.id, post.published_on, post.display_id, post.title, post.summary,
           post.created_at, post.updated_at
    from public.posts as post
    where post.owner_id = current_owner
      and post.category_id = p_category_id
      and post.content_status = 'published'
      and post.published_on <= p_reference_date
    order by post.published_on desc, post.updated_at desc, post.created_at desc, post.id
    limit p_recent_post_limit
  ),
  recent_post_json as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', post.id,
        'publishedOn', post.published_on,
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
      ) order by post.published_on desc, post.updated_at desc, post.created_at desc, post.id
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

revoke all on function public.get_news_briefing_prompt_context(text, date, integer, integer, integer) from public, anon;
grant execute on function public.get_news_briefing_prompt_context(text, date, integer, integer, integer) to authenticated;
