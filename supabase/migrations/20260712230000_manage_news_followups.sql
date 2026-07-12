-- Phase 3A-3: manage news follow-up checklist items through guarded RPCs.

create or replace function public.create_news_followup(
  p_topic_id uuid,
  p_check_text text,
  p_due_date date default null,
  p_priority text default 'normal'
)
returns public.news_followups
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := (select auth.uid());
  topic_row public.news_topics;
  saved_followup public.news_followups;
  normalized_text text := nullif(btrim(p_check_text), '');
begin
  if current_owner is null then raise exception 'NEWS_FOLLOWUP_AUTH_REQUIRED' using errcode = '42501'; end if;
  if normalized_text is null then raise exception 'NEWS_FOLLOWUP_CHECK_TEXT_REQUIRED' using errcode = '22023'; end if;
  if p_priority is null or p_priority not in ('high', 'normal', 'low') then raise exception 'NEWS_FOLLOWUP_PRIORITY_INVALID' using errcode = '22023'; end if;

  select topic.* into topic_row
  from public.news_topics topic
  where topic.id = p_topic_id and topic.owner_id = current_owner;
  if topic_row.id is null then raise exception 'NEWS_FOLLOWUP_TOPIC_NOT_FOUND' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.categories category
    where category.id = topic_row.category_id and category.content_group = 'news'
  ) then raise exception 'NEWS_FOLLOWUP_NEWS_CATEGORY_REQUIRED' using errcode = '23514'; end if;
  if topic_row.status = 'closed' then raise exception 'NEWS_FOLLOWUP_CLOSED_TOPIC' using errcode = '22023'; end if;

  insert into public.news_followups (
    owner_id, topic_id, check_text, status, due_date, priority,
    resolution_note, resolved_at
  ) values (
    current_owner, topic_row.id, normalized_text, 'pending', p_due_date, p_priority,
    null, null
  ) returning * into saved_followup;
  return saved_followup;
end;
$$;

create or replace function public.update_news_followup(
  p_followup_id uuid,
  p_check_text text,
  p_due_date date default null,
  p_priority text default 'normal'
)
returns public.news_followups
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := (select auth.uid());
  current_followup public.news_followups;
  topic_row public.news_topics;
  saved_followup public.news_followups;
  normalized_text text := nullif(btrim(p_check_text), '');
begin
  if current_owner is null then raise exception 'NEWS_FOLLOWUP_AUTH_REQUIRED' using errcode = '42501'; end if;
  if normalized_text is null then raise exception 'NEWS_FOLLOWUP_CHECK_TEXT_REQUIRED' using errcode = '22023'; end if;
  if p_priority is null or p_priority not in ('high', 'normal', 'low') then raise exception 'NEWS_FOLLOWUP_PRIORITY_INVALID' using errcode = '22023'; end if;

  select followup.* into current_followup
  from public.news_followups followup
  where followup.id = p_followup_id and followup.owner_id = current_owner
  for update;
  if current_followup.id is null then raise exception 'NEWS_FOLLOWUP_NOT_FOUND' using errcode = '42501'; end if;
  if current_followup.status <> 'pending' then raise exception 'NEWS_FOLLOWUP_ALREADY_RESOLVED' using errcode = '22023'; end if;

  select topic.* into topic_row
  from public.news_topics topic
  where topic.id = current_followup.topic_id and topic.owner_id = current_owner;
  if topic_row.id is null then raise exception 'NEWS_FOLLOWUP_TOPIC_NOT_FOUND' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.categories category
    where category.id = topic_row.category_id and category.content_group = 'news'
  ) then raise exception 'NEWS_FOLLOWUP_NEWS_CATEGORY_REQUIRED' using errcode = '23514'; end if;
  if topic_row.status = 'closed' then raise exception 'NEWS_FOLLOWUP_CLOSED_TOPIC' using errcode = '22023'; end if;

  update public.news_followups
  set check_text = normalized_text,
      due_date = p_due_date,
      priority = p_priority
  where id = current_followup.id
  returning * into saved_followup;
  return saved_followup;
end;
$$;

create or replace function public.resolve_news_followup(
  p_followup_id uuid,
  p_target_status text,
  p_resolution_note text
)
returns public.news_followups
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := (select auth.uid());
  current_followup public.news_followups;
  saved_followup public.news_followups;
  normalized_note text := nullif(btrim(p_resolution_note), '');
begin
  if current_owner is null then raise exception 'NEWS_FOLLOWUP_AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_target_status is null or p_target_status not in ('done', 'cancelled') then raise exception 'NEWS_FOLLOWUP_STATUS_INVALID' using errcode = '22023'; end if;
  if normalized_note is null then raise exception 'NEWS_FOLLOWUP_RESOLUTION_REQUIRED' using errcode = '22023'; end if;

  select followup.* into current_followup
  from public.news_followups followup
  where followup.id = p_followup_id and followup.owner_id = current_owner
  for update;
  if current_followup.id is null then raise exception 'NEWS_FOLLOWUP_NOT_FOUND' using errcode = '42501'; end if;
  if current_followup.status <> 'pending' then raise exception 'NEWS_FOLLOWUP_ALREADY_RESOLVED' using errcode = '22023'; end if;
  if not exists (
    select 1
    from public.news_topics topic
    join public.categories category on category.id = topic.category_id
    where topic.id = current_followup.topic_id
      and topic.owner_id = current_owner
      and category.content_group = 'news'
  ) then raise exception 'NEWS_FOLLOWUP_TOPIC_NOT_FOUND' using errcode = '42501'; end if;

  update public.news_followups
  set status = p_target_status,
      resolution_note = normalized_note,
      resolved_at = clock_timestamp()
  where id = current_followup.id
  returning * into saved_followup;
  return saved_followup;
end;
$$;

revoke insert, update, delete on public.news_followups from authenticated;

revoke all on function public.create_news_followup(uuid, text, date, text) from public, anon;
revoke all on function public.update_news_followup(uuid, text, date, text) from public, anon;
revoke all on function public.resolve_news_followup(uuid, text, text) from public, anon;
grant execute on function public.create_news_followup(uuid, text, date, text) to authenticated;
grant execute on function public.update_news_followup(uuid, text, date, text) to authenticated;
grant execute on function public.resolve_news_followup(uuid, text, text) to authenticated;
