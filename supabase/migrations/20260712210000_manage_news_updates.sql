-- Phase 3A-2: atomically connect news posts, topics, updates, and sources.

with ordered as (
  select id, row_number() over (partition by post_id order by item_order, created_at, id) as next_order
  from public.news_updates
)
update public.news_updates as update_row
set item_order = ordered.next_order
from ordered
where update_row.id = ordered.id;

create unique index news_updates_post_item_order_key
  on public.news_updates (post_id, item_order);

alter table public.news_updates
  add constraint news_updates_headline_length_check check (char_length(headline) <= 200),
  add constraint news_updates_fact_summary_length_check check (char_length(fact_summary) <= 4000);

create or replace function public.create_news_update(
  p_post_id uuid,
  p_topic_id uuid,
  p_update_type text,
  p_headline text,
  p_fact_summary text,
  p_importance_summary text default null,
  p_impact_summary text default null,
  p_change_summary text default null,
  p_previous_update_id uuid default null,
  p_source_ids uuid[] default '{}'::uuid[]
)
returns public.news_updates
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := (select auth.uid());
  post_row public.posts;
  topic_row public.news_topics;
  previous_row public.news_updates;
  saved_update public.news_updates;
  next_order integer;
  normalized_change text := nullif(btrim(p_change_summary), '');
begin
  if current_owner is null then raise exception 'NEWS_UPDATE_AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_update_type not in ('new', 'follow_up', 'correction', 'closure_note') then raise exception 'NEWS_UPDATE_TYPE_INVALID' using errcode = '22023'; end if;
  if nullif(btrim(p_headline), '') is null or char_length(btrim(p_headline)) > 200 then raise exception 'NEWS_UPDATE_HEADLINE_INVALID' using errcode = '22023'; end if;
  if nullif(btrim(p_fact_summary), '') is null or char_length(btrim(p_fact_summary)) > 4000 then raise exception 'NEWS_UPDATE_FACT_INVALID' using errcode = '22023'; end if;
  if coalesce(cardinality(p_source_ids), 0) < 1 then raise exception 'NEWS_UPDATE_SOURCE_REQUIRED' using errcode = '22023'; end if;
  if (select count(*) from unnest(p_source_ids) id) <> (select count(distinct id) from unnest(p_source_ids) id) then raise exception 'NEWS_UPDATE_SOURCE_INVALID' using errcode = '22023'; end if;

  select post.* into post_row from public.posts post where post.id = p_post_id and post.owner_id = current_owner for update;
  if post_row.id is null then raise exception 'NEWS_UPDATE_POST_NOT_FOUND' using errcode = '42501'; end if;
  select topic.* into topic_row from public.news_topics topic where topic.id = p_topic_id and topic.owner_id = current_owner;
  if topic_row.id is null then raise exception 'NEWS_UPDATE_TOPIC_NOT_FOUND' using errcode = '42501'; end if;
  if post_row.category_id <> topic_row.category_id then raise exception 'NEWS_UPDATE_CATEGORY_MISMATCH' using errcode = '23514'; end if;
  if not exists (select 1 from public.categories c where c.id = post_row.category_id and c.content_group = 'news') then raise exception 'NEWS_UPDATE_NEWS_CATEGORY_REQUIRED' using errcode = '23514'; end if;

  if p_update_type = 'new' and p_previous_update_id is not null then raise exception 'NEWS_UPDATE_NEW_PREVIOUS_FORBIDDEN' using errcode = '22023'; end if;
  if p_update_type <> 'new' and p_previous_update_id is null then raise exception 'NEWS_UPDATE_PREVIOUS_REQUIRED' using errcode = '22023'; end if;
  if p_update_type <> 'new' and normalized_change is null then raise exception 'NEWS_UPDATE_CHANGE_REQUIRED' using errcode = '22023'; end if;
  if p_update_type = 'closure_note' and topic_row.status <> 'closed' then raise exception 'NEWS_UPDATE_CLOSED_TOPIC_REQUIRED' using errcode = '22023'; end if;
  if p_previous_update_id is not null then
    select item.* into previous_row from public.news_updates item where item.id = p_previous_update_id and item.owner_id = current_owner;
    if previous_row.id is null then raise exception 'NEWS_UPDATE_PREVIOUS_NOT_FOUND' using errcode = '42501'; end if;
    if previous_row.topic_id <> p_topic_id then raise exception 'NEWS_UPDATE_PREVIOUS_TOPIC_MISMATCH' using errcode = '23514'; end if;
  end if;
  if (select count(*) from public.sources source where source.id = any(p_source_ids) and source.owner_id = current_owner and source.post_id = p_post_id and source.news_update_id is null) <> cardinality(p_source_ids) then
    raise exception 'NEWS_UPDATE_SOURCE_INVALID' using errcode = '23514';
  end if;

  select coalesce(max(item_order), 0) + 1 into next_order from public.news_updates where post_id = p_post_id;
  insert into public.news_updates (owner_id, post_id, topic_id, item_order, update_type, headline, fact_summary, importance_summary, impact_summary, change_summary, previous_update_id)
  values (current_owner, p_post_id, p_topic_id, next_order, p_update_type, btrim(p_headline), btrim(p_fact_summary), nullif(btrim(p_importance_summary), ''), nullif(btrim(p_impact_summary), ''), normalized_change, p_previous_update_id)
  returning * into saved_update;
  update public.sources set news_update_id = saved_update.id where id = any(p_source_ids) and owner_id = current_owner;
  return saved_update;
end;
$$;

create or replace function public.update_news_update(
  p_update_id uuid,
  p_headline text,
  p_fact_summary text,
  p_importance_summary text default null,
  p_impact_summary text default null,
  p_change_summary text default null,
  p_previous_update_id uuid default null,
  p_source_ids uuid[] default '{}'::uuid[]
)
returns public.news_updates
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := (select auth.uid());
  current_update public.news_updates;
  previous_row public.news_updates;
  saved_update public.news_updates;
  normalized_change text := nullif(btrim(p_change_summary), '');
begin
  if current_owner is null then raise exception 'NEWS_UPDATE_AUTH_REQUIRED' using errcode = '42501'; end if;
  select item.* into current_update from public.news_updates item where item.id = p_update_id and item.owner_id = current_owner for update;
  if current_update.id is null then raise exception 'NEWS_UPDATE_NOT_FOUND' using errcode = '42501'; end if;
  if nullif(btrim(p_headline), '') is null or char_length(btrim(p_headline)) > 200 then raise exception 'NEWS_UPDATE_HEADLINE_INVALID' using errcode = '22023'; end if;
  if nullif(btrim(p_fact_summary), '') is null or char_length(btrim(p_fact_summary)) > 4000 then raise exception 'NEWS_UPDATE_FACT_INVALID' using errcode = '22023'; end if;
  if coalesce(cardinality(p_source_ids), 0) < 1 then raise exception 'NEWS_UPDATE_SOURCE_REQUIRED' using errcode = '22023'; end if;
  if (select count(*) from unnest(p_source_ids) id) <> (select count(distinct id) from unnest(p_source_ids) id) then raise exception 'NEWS_UPDATE_SOURCE_INVALID' using errcode = '22023'; end if;
  if current_update.update_type = 'new' and p_previous_update_id is not null then raise exception 'NEWS_UPDATE_NEW_PREVIOUS_FORBIDDEN' using errcode = '22023'; end if;
  if current_update.update_type <> 'new' and p_previous_update_id is null then raise exception 'NEWS_UPDATE_PREVIOUS_REQUIRED' using errcode = '22023'; end if;
  if current_update.update_type <> 'new' and normalized_change is null then raise exception 'NEWS_UPDATE_CHANGE_REQUIRED' using errcode = '22023'; end if;
  if p_previous_update_id = current_update.id then raise exception 'NEWS_UPDATE_PREVIOUS_SELF' using errcode = '22023'; end if;
  if p_previous_update_id is not null then
    select item.* into previous_row from public.news_updates item where item.id = p_previous_update_id and item.owner_id = current_owner;
    if previous_row.id is null then raise exception 'NEWS_UPDATE_PREVIOUS_NOT_FOUND' using errcode = '42501'; end if;
    -- PostgreSQL now() is transaction-stable, so two logically ordered rows created
    -- in one transaction can share a timestamp. Self-reference is checked above.
    if previous_row.topic_id <> current_update.topic_id or previous_row.created_at > current_update.created_at then raise exception 'NEWS_UPDATE_PREVIOUS_TOPIC_MISMATCH' using errcode = '23514'; end if;
  end if;
  if current_update.update_type = 'closure_note' and not exists (select 1 from public.news_topics topic where topic.id = current_update.topic_id and topic.owner_id = current_owner and topic.status = 'closed') then raise exception 'NEWS_UPDATE_CLOSED_TOPIC_REQUIRED' using errcode = '22023'; end if;
  if (select count(*) from public.sources source where source.id = any(p_source_ids) and source.owner_id = current_owner and source.post_id = current_update.post_id and (source.news_update_id is null or source.news_update_id = current_update.id)) <> cardinality(p_source_ids) then raise exception 'NEWS_UPDATE_SOURCE_INVALID' using errcode = '23514'; end if;

  update public.sources set news_update_id = null where news_update_id = current_update.id and owner_id = current_owner and not (id = any(p_source_ids));
  update public.sources set news_update_id = current_update.id where id = any(p_source_ids) and owner_id = current_owner;
  update public.news_updates set headline = btrim(p_headline), fact_summary = btrim(p_fact_summary), importance_summary = nullif(btrim(p_importance_summary), ''), impact_summary = nullif(btrim(p_impact_summary), ''), change_summary = normalized_change, previous_update_id = p_previous_update_id
  where id = current_update.id returning * into saved_update;
  return saved_update;
end;
$$;

create or replace function public.reorder_news_updates(p_post_id uuid, p_update_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare current_owner uuid := (select auth.uid()); expected_count integer; supplied_count integer;
begin
  if current_owner is null then raise exception 'NEWS_UPDATE_AUTH_REQUIRED' using errcode = '42501'; end if;
  if not exists (select 1 from public.posts post where post.id = p_post_id and post.owner_id = current_owner for update) then raise exception 'NEWS_UPDATE_POST_NOT_FOUND' using errcode = '42501'; end if;
  select count(*) into expected_count from public.news_updates where post_id = p_post_id and owner_id = current_owner;
  supplied_count := coalesce(cardinality(p_update_ids), 0);
  if supplied_count <> expected_count or (select count(distinct id) from unnest(p_update_ids) id) <> expected_count or (select count(*) from public.news_updates where id = any(p_update_ids) and post_id = p_post_id and owner_id = current_owner) <> expected_count then raise exception 'NEWS_UPDATE_REORDER_INVALID' using errcode = '22023'; end if;
  update public.news_updates set item_order = item_order + expected_count where post_id = p_post_id and owner_id = current_owner;
  update public.news_updates item set item_order = ordered.position from unnest(p_update_ids) with ordinality ordered(id, position) where item.id = ordered.id and item.owner_id = current_owner;
end;
$$;

revoke insert, update, delete on public.news_updates from authenticated;
revoke insert on public.sources from authenticated;
revoke update on public.sources from authenticated;
grant insert (id, owner_id, post_id, source_name, source_title, source_url, source_published_at, checked_at, checked_point, sort_order, created_at, updated_at) on public.sources to authenticated;
grant update (source_name, source_title, source_url, source_published_at, checked_at, checked_point, sort_order) on public.sources to authenticated;

revoke all on function public.create_news_update(uuid, uuid, text, text, text, text, text, text, uuid, uuid[]) from public, anon;
revoke all on function public.update_news_update(uuid, text, text, text, text, text, uuid, uuid[]) from public, anon;
revoke all on function public.reorder_news_updates(uuid, uuid[]) from public, anon;
grant execute on function public.create_news_update(uuid, uuid, text, text, text, text, text, text, uuid, uuid[]) to authenticated;
grant execute on function public.update_news_update(uuid, text, text, text, text, text, uuid, uuid[]) to authenticated;
grant execute on function public.reorder_news_updates(uuid, uuid[]) to authenticated;

-- Preserve news-update links when the existing publication editor recreates a
-- post's sources. Linked source URLs cannot be removed or changed here; users
-- must first change the relation through update_news_update.
alter function public.save_post_publication_bundle(
  uuid, text, text, text, text, date, text, text, text, text,
  text, text[], text, text, jsonb, jsonb
) rename to save_post_publication_bundle_base;

create or replace function public.save_post_publication_bundle(
  p_post_id uuid, p_title text, p_summary text, p_slug text,
  p_content_status text, p_published_on date, p_wordpress_url text,
  p_html_body text, p_image_prompt text, p_image_alt text,
  p_representative_title text, p_alternative_titles text[],
  p_meta_description text, p_focus_keyword text, p_tags jsonb, p_sources jsonb
)
returns public.posts
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := (select auth.uid());
  saved_post public.posts;
  link jsonb;
  saved_links jsonb := '[]'::jsonb;
  replacement_source_id uuid;
begin
  if current_owner is null then raise exception 'POST_EDITOR_AUTH_REQUIRED' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'news_update_id', source.news_update_id,
    'normalized_url', lower(regexp_replace(split_part(btrim(source.source_url), '#', 1), '/+$', ''))
  )), '[]'::jsonb) into saved_links
  from public.sources source
  where source.post_id = p_post_id and source.owner_id = current_owner and source.news_update_id is not null;

  saved_post := public.save_post_publication_bundle_base(
    p_post_id, p_title, p_summary, p_slug, p_content_status, p_published_on,
    p_wordpress_url, p_html_body, p_image_prompt, p_image_alt,
    p_representative_title, p_alternative_titles, p_meta_description,
    p_focus_keyword, p_tags, p_sources
  );

  for link in select value from jsonb_array_elements(saved_links) loop
    select source.id into replacement_source_id
    from public.sources source
    where source.post_id = p_post_id and source.owner_id = current_owner
      and lower(regexp_replace(split_part(btrim(source.source_url), '#', 1), '/+$', '')) = link ->> 'normalized_url'
    limit 1;
    if replacement_source_id is null then
      raise exception 'NEWS_UPDATE_LINKED_SOURCE_REMOVED' using errcode = '23514';
    end if;
    update public.sources set news_update_id = (link ->> 'news_update_id')::uuid where id = replacement_source_id;
    replacement_source_id := null;
  end loop;
  return saved_post;
end;
$$;

revoke all on function public.save_post_publication_bundle_base(uuid, text, text, text, text, date, text, text, text, text, text, text[], text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.save_post_publication_bundle(uuid, text, text, text, text, date, text, text, text, text, text, text[], text, text, jsonb, jsonb) from public, anon;
grant execute on function public.save_post_publication_bundle(uuid, text, text, text, text, date, text, text, text, text, text, text[], text, text, jsonb, jsonb) to authenticated;
