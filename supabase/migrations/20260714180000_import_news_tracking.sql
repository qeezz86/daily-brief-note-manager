-- Phase 4A-3: atomically import news tracking for one already-imported post.

create function public.import_news_tracking_for_post(
  p_post_id uuid,
  p_tracking jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := (select auth.uid());
  post_row public.posts;
  topic_row public.news_topics;
  topic_value jsonb;
  update_value jsonb;
  followup_value jsonb;
  source_order_value jsonb;
  unknown_key text;
  topic_map jsonb := '{}'::jsonb;
  created_topic_map jsonb := '{}'::jsonb;
  update_map jsonb := '{}'::jsonb;
  update_topic_map jsonb := '{}'::jsonb;
  topic_keys jsonb := '{}'::jsonb;
  update_keys jsonb := '{}'::jsonb;
  followup_keys jsonb := '{}'::jsonb;
  seen_item_orders integer[] := '{}'::integer[];
  seen_source_orders integer[] := '{}'::integer[];
  topic_external_key text;
  topic_key_value text;
  canonical_title_value text;
  topic_summary_value text;
  topic_status_value text;
  closed_reason_value text;
  first_seen_value date;
  last_seen_value date;
  update_external_key text;
  update_type_value text;
  headline_value text;
  fact_summary_value text;
  change_summary_value text;
  previous_external_key text;
  item_order_value integer;
  topic_id_value uuid;
  previous_update_id_value uuid;
  saved_update_id uuid;
  source_order_integer integer;
  source_count integer;
  linked_count integer;
  progress_count integer;
  inserted_updates integer := 0;
  topic_count integer := 0;
  reused_topic_count integer := 0;
  created_topic_count integer := 0;
  update_count integer := 0;
  followup_count integer := 0;
  source_link_count integer := 0;
  followup_external_key text;
  check_text_value text;
  priority_value text;
  due_date_value date;
  followup_status_value text;
  resolution_note_value text;
  resolved_at_value timestamptz;
begin
  if current_owner is null then
    raise exception 'IMPORT_TRACKING_PERMISSION_DENIED' using errcode = '42501';
  end if;

  select post.* into post_row
    from public.posts post
   where post.id = p_post_id and post.owner_id = current_owner
   for update;
  if post_row.id is null then
    raise exception 'IMPORT_TRACKING_INVALID_POST' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.categories category
     where category.id = post_row.category_id and category.content_group = 'news'
  ) then
    raise exception 'IMPORT_TRACKING_NOT_NEWS' using errcode = '23514';
  end if;
  if jsonb_typeof(p_tracking) is distinct from 'object'
     or jsonb_typeof(p_tracking -> 'topics') is distinct from 'array'
     or jsonb_typeof(p_tracking -> 'updates') is distinct from 'array'
     or jsonb_typeof(p_tracking -> 'followups') is distinct from 'array'
     or jsonb_array_length(p_tracking -> 'topics') < 1
     or jsonb_array_length(p_tracking -> 'updates') < 1
     or public.import_payload_has_forbidden_key(p_tracking) then
    raise exception 'IMPORT_TRACKING_INVALID_PAYLOAD' using errcode = '22023';
  end if;
  select key into unknown_key from jsonb_object_keys(p_tracking) key
   where key <> all(array['topics', 'updates', 'followups']) limit 1;
  if unknown_key is not null then
    raise exception 'IMPORT_TRACKING_INVALID_PAYLOAD' using errcode = '22023';
  end if;
  if exists (select 1 from public.news_updates item where item.post_id = post_row.id) then
    raise exception 'IMPORT_TRACKING_INVALID_POST' using errcode = '23514';
  end if;
  if exists (select 1 from public.sources source where source.post_id = post_row.id and source.news_update_id is not null) then
    raise exception 'IMPORT_TRACKING_SOURCE_CONFLICT' using errcode = '23514';
  end if;
  select count(*) into source_count from public.sources source where source.post_id = post_row.id and source.owner_id = current_owner;

  for topic_value in select value from jsonb_array_elements(p_tracking -> 'topics')
  loop
    if jsonb_typeof(topic_value) is distinct from 'object' then raise exception 'IMPORT_TRACKING_INVALID_PAYLOAD' using errcode = '22023'; end if;
    select key into unknown_key from jsonb_object_keys(topic_value) key
     where key <> all(array['topic_external_key', 'topic_key', 'canonical_title', 'topic_summary', 'status', 'closed_reason', 'first_seen_at', 'last_seen_at']) limit 1;
    if unknown_key is not null then raise exception 'IMPORT_TRACKING_INVALID_PAYLOAD' using errcode = '22023'; end if;

    topic_external_key := nullif(btrim(topic_value ->> 'topic_external_key'), '');
    topic_key_value := lower(nullif(btrim(topic_value ->> 'topic_key'), ''));
    canonical_title_value := nullif(btrim(topic_value ->> 'canonical_title'), '');
    topic_summary_value := nullif(btrim(topic_value ->> 'topic_summary'), '');
    topic_status_value := topic_value ->> 'status';
    closed_reason_value := nullif(btrim(topic_value ->> 'closed_reason'), '');
    begin
      first_seen_value := (topic_value ->> 'first_seen_at')::date;
      last_seen_value := (topic_value ->> 'last_seen_at')::date;
    exception when others then
      raise exception 'IMPORT_TRACKING_INVALID_PAYLOAD' using errcode = '22023';
    end;
    if topic_external_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
       or topic_key_value !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
       or canonical_title_value is null or char_length(canonical_title_value) > 200
       or topic_status_value not in ('active', 'monitoring', 'closed', 'reopened')
       or last_seen_value < first_seen_value
       or (topic_status_value = 'closed' and closed_reason_value is null)
       or (topic_status_value <> 'closed' and closed_reason_value is not null) then
      raise exception 'IMPORT_TRACKING_TOPIC_CONFLICT' using errcode = '22023';
    end if;
    if topic_keys ? topic_external_key then raise exception 'IMPORT_TRACKING_DUPLICATE_TOPIC_KEY' using errcode = '22023'; end if;
    if exists (
      select 1 from jsonb_each_text(topic_keys) entry
       where entry.value = topic_key_value
    ) then raise exception 'IMPORT_TRACKING_DUPLICATE_TOPIC_KEY' using errcode = '22023'; end if;
    topic_keys := topic_keys || jsonb_build_object(topic_external_key, topic_key_value);

    select topic.* into topic_row
      from public.news_topics topic
     where topic.owner_id = current_owner
       and topic.category_id = post_row.category_id
       and lower(btrim(topic.topic_key)) = topic_key_value
     for update;
    if topic_row.id is not null then
      if topic_row.canonical_title <> canonical_title_value
         or (topic_summary_value is not null and topic_row.topic_summary is distinct from topic_summary_value)
         or topic_row.status <> topic_status_value
         or (topic_status_value = 'closed' and topic_row.closed_reason is distinct from closed_reason_value) then
        raise exception 'IMPORT_TRACKING_TOPIC_CONFLICT' using errcode = '23514';
      end if;
      topic_id_value := topic_row.id;
      reused_topic_count := reused_topic_count + 1;
    else
      if topic_status_value = 'reopened' then raise exception 'IMPORT_TRACKING_TOPIC_CONFLICT' using errcode = '22023'; end if;
      insert into public.news_topics (
        owner_id, category_id, topic_key, canonical_title, topic_summary,
        status, closed_reason, first_seen_at, last_seen_at
      ) values (
        current_owner, post_row.category_id, topic_key_value, canonical_title_value,
        topic_summary_value, 'active', null, first_seen_value, last_seen_value
      ) returning id into topic_id_value;
      insert into public.news_status_history (owner_id, topic_id, from_status, to_status, reason)
      values (current_owner, topic_id_value, null, 'active', 'Import initial state');
      if topic_status_value in ('monitoring', 'closed') then
        perform public.transition_news_topic_status(topic_id_value, topic_status_value, closed_reason_value);
      end if;
      created_topic_count := created_topic_count + 1;
      created_topic_map := created_topic_map || jsonb_build_object(topic_external_key, true);
    end if;
    topic_map := topic_map || jsonb_build_object(topic_external_key, topic_id_value::text);
    topic_count := topic_count + 1;
    topic_row := null;
  end loop;

  -- Validate the full update graph before creating any row.
  for update_value in select value from jsonb_array_elements(p_tracking -> 'updates')
  loop
    if jsonb_typeof(update_value) is distinct from 'object' then raise exception 'IMPORT_TRACKING_INVALID_UPDATE_TYPE' using errcode = '22023'; end if;
    select key into unknown_key from jsonb_object_keys(update_value) key
     where key <> all(array['update_external_key', 'topic_external_key', 'update_type', 'headline', 'fact_summary', 'importance_summary', 'impact_summary', 'change_summary', 'previous_update_external_key', 'item_order', 'source_orders']) limit 1;
    if unknown_key is not null then raise exception 'IMPORT_TRACKING_INVALID_UPDATE_TYPE' using errcode = '22023'; end if;
    update_external_key := nullif(btrim(update_value ->> 'update_external_key'), '');
    topic_external_key := nullif(btrim(update_value ->> 'topic_external_key'), '');
    update_type_value := update_value ->> 'update_type';
    headline_value := nullif(btrim(update_value ->> 'headline'), '');
    fact_summary_value := nullif(btrim(update_value ->> 'fact_summary'), '');
    change_summary_value := nullif(btrim(update_value ->> 'change_summary'), '');
    previous_external_key := nullif(btrim(update_value ->> 'previous_update_external_key'), '');
    begin item_order_value := (update_value ->> 'item_order')::integer;
    exception when others then raise exception 'IMPORT_TRACKING_INVALID_ITEM_ORDER' using errcode = '22023'; end;
    if update_external_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or not (topic_map ? topic_external_key)
       or update_type_value not in ('new', 'follow_up', 'correction', 'closure_note')
       or headline_value is null or char_length(headline_value) > 200
       or fact_summary_value is null or char_length(fact_summary_value) > 4000
       or (update_type_value = 'new' and previous_external_key is not null)
       or (update_type_value <> 'new' and (previous_external_key is null or change_summary_value is null)) then
      raise exception 'IMPORT_TRACKING_INVALID_UPDATE_TYPE' using errcode = '22023';
    end if;
    if update_keys ? update_external_key then raise exception 'IMPORT_TRACKING_DUPLICATE_UPDATE_KEY' using errcode = '22023'; end if;
    if item_order_value < 1 or item_order_value = any(seen_item_orders) then raise exception 'IMPORT_TRACKING_INVALID_ITEM_ORDER' using errcode = '22023'; end if;
    if jsonb_typeof(update_value -> 'source_orders') is distinct from 'array' or jsonb_array_length(update_value -> 'source_orders') < 1 then raise exception 'IMPORT_TRACKING_SOURCE_NOT_FOUND' using errcode = '22023'; end if;
    for source_order_value in select value from jsonb_array_elements(update_value -> 'source_orders')
    loop
      begin source_order_integer := (source_order_value #>> '{}')::integer;
      exception when others then raise exception 'IMPORT_TRACKING_SOURCE_NOT_FOUND' using errcode = '22023'; end;
      if source_order_integer < 1 or source_order_integer > source_count then raise exception 'IMPORT_TRACKING_SOURCE_NOT_FOUND' using errcode = '22023'; end if;
      if source_order_integer = any(seen_source_orders) then raise exception 'IMPORT_TRACKING_SOURCE_CONFLICT' using errcode = '22023'; end if;
      seen_source_orders := array_append(seen_source_orders, source_order_integer);
    end loop;
    update_keys := update_keys || jsonb_build_object(update_external_key, true);
    update_topic_map := update_topic_map || jsonb_build_object(update_external_key, topic_external_key);
    seen_item_orders := array_append(seen_item_orders, item_order_value);
  end loop;
  update_count := jsonb_array_length(p_tracking -> 'updates');
  for expected_order in 1..update_count loop
    if not (expected_order = any(seen_item_orders)) then raise exception 'IMPORT_TRACKING_INVALID_ITEM_ORDER' using errcode = '22023'; end if;
  end loop;

  for update_value in select value from jsonb_array_elements(p_tracking -> 'updates')
  loop
    update_external_key := update_value ->> 'update_external_key';
    previous_external_key := nullif(btrim(update_value ->> 'previous_update_external_key'), '');
    if previous_external_key is not null then
      if previous_external_key = update_external_key then raise exception 'IMPORT_TRACKING_PREVIOUS_CYCLE' using errcode = '22023'; end if;
      if not (update_keys ? previous_external_key) then raise exception 'IMPORT_TRACKING_MISSING_PREVIOUS' using errcode = '22023'; end if;
      if update_topic_map ->> previous_external_key is distinct from update_topic_map ->> update_external_key then raise exception 'IMPORT_TRACKING_TOPIC_CONFLICT' using errcode = '23514'; end if;
    end if;
  end loop;

  -- Resolve same-payload previous references in deterministic topological passes.
  while inserted_updates < update_count loop
    progress_count := 0;
    for update_value in select value from jsonb_array_elements(p_tracking -> 'updates') order by (value ->> 'item_order')::integer
    loop
      update_external_key := update_value ->> 'update_external_key';
      if update_map ? update_external_key then continue; end if;
      previous_external_key := nullif(btrim(update_value ->> 'previous_update_external_key'), '');
      if previous_external_key is not null and not (update_map ? previous_external_key) then continue; end if;
      topic_external_key := update_value ->> 'topic_external_key';
      topic_id_value := (topic_map ->> topic_external_key)::uuid;
      update_type_value := update_value ->> 'update_type';
      select topic.* into topic_row from public.news_topics topic where topic.id = topic_id_value and topic.owner_id = current_owner for update;
      if (topic_row.status = 'closed' and update_type_value in ('new', 'follow_up') and not (created_topic_map ? topic_external_key))
         or (update_type_value = 'closure_note' and topic_row.status <> 'closed') then
        raise exception 'IMPORT_TRACKING_INVALID_CLOSURE' using errcode = '22023';
      end if;
      previous_update_id_value := case when previous_external_key is null then null else (update_map ->> previous_external_key)::uuid end;
      insert into public.news_updates (
        owner_id, post_id, topic_id, item_order, update_type, headline,
        fact_summary, importance_summary, impact_summary, change_summary, previous_update_id
      ) values (
        current_owner, post_row.id, topic_id_value, (update_value ->> 'item_order')::integer,
        update_type_value, btrim(update_value ->> 'headline'), btrim(update_value ->> 'fact_summary'),
        nullif(btrim(update_value ->> 'importance_summary'), ''), nullif(btrim(update_value ->> 'impact_summary'), ''),
        nullif(btrim(update_value ->> 'change_summary'), ''), previous_update_id_value
      ) returning id into saved_update_id;

      linked_count := 0;
      for source_order_value in select value from jsonb_array_elements(update_value -> 'source_orders')
      loop
        source_order_integer := (source_order_value #>> '{}')::integer;
        update public.sources source set news_update_id = saved_update_id
         where source.owner_id = current_owner and source.post_id = post_row.id
           and source.sort_order = source_order_integer - 1 and source.news_update_id is null;
        if not found then raise exception 'IMPORT_TRACKING_SOURCE_CONFLICT' using errcode = '23514'; end if;
        linked_count := linked_count + 1;
      end loop;
      source_link_count := source_link_count + linked_count;
      update_map := update_map || jsonb_build_object(update_external_key, saved_update_id::text);
      inserted_updates := inserted_updates + 1;
      progress_count := progress_count + 1;
    end loop;
    if progress_count = 0 then raise exception 'IMPORT_TRACKING_PREVIOUS_CYCLE' using errcode = '22023'; end if;
  end loop;

  for followup_value in select value from jsonb_array_elements(p_tracking -> 'followups')
  loop
    if jsonb_typeof(followup_value) is distinct from 'object' then raise exception 'IMPORT_TRACKING_INVALID_FOLLOWUP' using errcode = '22023'; end if;
    select key into unknown_key from jsonb_object_keys(followup_value) key
     where key <> all(array['followup_external_key', 'topic_external_key', 'check_text', 'priority', 'due_date', 'status', 'resolution_note', 'resolved_at']) limit 1;
    if unknown_key is not null then raise exception 'IMPORT_TRACKING_INVALID_FOLLOWUP' using errcode = '22023'; end if;
    followup_external_key := nullif(btrim(followup_value ->> 'followup_external_key'), '');
    topic_external_key := nullif(btrim(followup_value ->> 'topic_external_key'), '');
    check_text_value := nullif(btrim(followup_value ->> 'check_text'), '');
    priority_value := followup_value ->> 'priority';
    followup_status_value := followup_value ->> 'status';
    resolution_note_value := nullif(btrim(followup_value ->> 'resolution_note'), '');
    begin
      due_date_value := nullif(btrim(followup_value ->> 'due_date'), '')::date;
      resolved_at_value := nullif(btrim(followup_value ->> 'resolved_at'), '')::timestamptz;
    exception when others then raise exception 'IMPORT_TRACKING_INVALID_FOLLOWUP' using errcode = '22023'; end;
    if followup_external_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or followup_keys ? followup_external_key
       or not (topic_map ? topic_external_key) or check_text_value is null
       or priority_value not in ('high', 'normal', 'low')
       or followup_status_value not in ('pending', 'done', 'cancelled')
       or (followup_status_value = 'pending' and (resolution_note_value is not null or resolved_at_value is not null))
       or (followup_status_value <> 'pending' and (resolution_note_value is null or resolved_at_value is null)) then
      raise exception 'IMPORT_TRACKING_INVALID_FOLLOWUP' using errcode = '22023';
    end if;
    topic_id_value := (topic_map ->> topic_external_key)::uuid;
    select topic.* into topic_row from public.news_topics topic where topic.id = topic_id_value and topic.owner_id = current_owner;
    if topic_row.status = 'closed' and followup_status_value = 'pending' then raise exception 'IMPORT_TRACKING_INVALID_FOLLOWUP' using errcode = '22023'; end if;
    insert into public.news_followups (
      owner_id, topic_id, check_text, status, due_date, priority, resolution_note, resolved_at
    ) values (
      current_owner, topic_id_value, check_text_value, followup_status_value,
      due_date_value, priority_value, resolution_note_value, resolved_at_value
    );
    followup_keys := followup_keys || jsonb_build_object(followup_external_key, true);
    followup_count := followup_count + 1;
  end loop;

  return jsonb_build_object(
    'postId', post_row.id,
    'topicCount', topic_count,
    'reusedTopicCount', reused_topic_count,
    'createdTopicCount', created_topic_count,
    'updateCount', update_count,
    'followupCount', followup_count,
    'sourceLinkCount', source_link_count
  );
exception
  when unique_violation then
    raise exception 'IMPORT_TRACKING_TOPIC_CONFLICT' using errcode = '23505';
end;
$$;

comment on function public.import_news_tracking_for_post(uuid, jsonb) is
  'Atomically imports topics, status history, updates, source links, and followups for one owned news post. Content rows are outside this transaction.';

revoke all on function public.import_news_tracking_for_post(uuid, jsonb) from public, anon;
grant execute on function public.import_news_tracking_for_post(uuid, jsonb) to authenticated;
