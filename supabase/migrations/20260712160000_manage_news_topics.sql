create unique index news_topics_owner_category_topic_key_normalized_key
  on public.news_topics (owner_id, category_id, lower(btrim(topic_key)));

create or replace function public.validate_news_topic_initial_state()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.topic_key := lower(btrim(new.topic_key));
  new.canonical_title := btrim(new.canonical_title);
  new.topic_summary := nullif(btrim(new.topic_summary), '');
  new.closed_reason := null;

  if new.topic_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'NEWS_TOPIC_KEY_INVALID'
      using errcode = '22023';
  end if;

  if new.status not in ('active', 'monitoring') then
    raise exception 'NEWS_TOPIC_INITIAL_STATUS_INVALID'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger news_topics_validate_initial_state
before insert on public.news_topics
for each row execute function public.validate_news_topic_initial_state();

create or replace function public.normalize_news_topic_edit()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.canonical_title := btrim(new.canonical_title);
  new.topic_summary := nullif(btrim(new.topic_summary), '');
  return new;
end;
$$;

create trigger news_topics_normalize_edit
before update of canonical_title, topic_summary, last_seen_at
on public.news_topics
for each row execute function public.normalize_news_topic_edit();

create or replace function public.transition_news_topic_status(
  p_topic_id uuid,
  p_target_status text,
  p_reason text default null
)
returns public.news_topics
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_topic public.news_topics;
  previous_status text;
  category_group text;
  normalized_reason text := nullif(btrim(p_reason), '');
begin
  if current_user_id is null then raise exception 'NEWS_TOPIC_AUTH_REQUIRED' using errcode = '42501'; end if;

  select topic.* into current_topic
    from public.news_topics as topic
   where topic.id = p_topic_id and topic.owner_id = current_user_id
   for update;
  if current_topic.id is null then raise exception 'NEWS_TOPIC_NOT_FOUND' using errcode = '42501'; end if;

  select category.content_group into category_group
    from public.categories as category where category.id = current_topic.category_id;
  if category_group is distinct from 'news' then raise exception 'NEWS_TOPIC_CATEGORY_INVALID' using errcode = '23514'; end if;
  if p_target_status not in ('active', 'monitoring', 'closed', 'reopened') then raise exception 'NEWS_TOPIC_STATUS_INVALID' using errcode = '22023'; end if;
  if current_topic.status = p_target_status then raise exception 'NEWS_TOPIC_STATUS_UNCHANGED' using errcode = '22023'; end if;
  if not (
    (current_topic.status = 'active' and p_target_status in ('monitoring', 'closed')) or
    (current_topic.status = 'monitoring' and p_target_status in ('active', 'closed')) or
    (current_topic.status = 'closed' and p_target_status = 'reopened') or
    (current_topic.status = 'reopened' and p_target_status in ('active', 'monitoring', 'closed'))
  ) then raise exception 'NEWS_TOPIC_TRANSITION_INVALID' using errcode = '22023'; end if;
  if p_target_status = 'closed' and normalized_reason is null then raise exception 'NEWS_TOPIC_CLOSED_REASON_REQUIRED' using errcode = '22023'; end if;
  if p_target_status = 'reopened' and normalized_reason is null then raise exception 'NEWS_TOPIC_REOPEN_REASON_REQUIRED' using errcode = '22023'; end if;

  previous_status := current_topic.status;
  update public.news_topics
     set status = p_target_status,
         closed_reason = case when p_target_status = 'closed' then normalized_reason else current_topic.closed_reason end
   where id = current_topic.id
  returning * into current_topic;

  insert into public.news_status_history (owner_id, topic_id, from_status, to_status, reason)
  values (current_user_id, current_topic.id, previous_status, p_target_status, normalized_reason);
  return current_topic;
end;
$$;

revoke insert, update, delete on public.news_status_history from authenticated;
revoke delete on public.news_topics from authenticated;
revoke update on public.news_topics from authenticated;
grant update (canonical_title, topic_summary, last_seen_at) on public.news_topics to authenticated;

revoke all on function public.transition_news_topic_status(uuid, text, text) from public, anon;
grant execute on function public.transition_news_topic_status(uuid, text, text) to authenticated;
revoke all on function public.validate_news_topic_initial_state() from public, anon, authenticated;
revoke all on function public.normalize_news_topic_edit() from public, anon, authenticated;
