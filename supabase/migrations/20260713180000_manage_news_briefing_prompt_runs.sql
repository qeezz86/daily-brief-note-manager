-- Phase 3B-2: persist immutable news briefing prompt snapshots and manage pin retention.

alter table public.generated_prompts
  add column reference_date date,
  add column closed_lookback_days integer,
  add column context_schema_version integer,
  add column context_snapshot jsonb;

update public.generated_prompts as prompt
set reference_date = (prompt.generated_at at time zone 'Asia/Seoul')::date,
    closed_lookback_days = 90,
    context_schema_version = 1,
    context_snapshot = jsonb_build_object(
      'schemaVersion', 1,
      'referenceDate', ((prompt.generated_at at time zone 'Asia/Seoul')::date)::text,
      'category', jsonb_build_object(
        'id', category.id,
        'name', category.name,
        'code', category.code,
        'wrapperClass', category.wrapper_class,
        'displayIdPattern', category.display_id_pattern,
        'slugPattern', category.slug_pattern
      ),
      'recentPosts', '[]'::jsonb,
      'openTopics', '[]'::jsonb,
      'pendingFollowups', '[]'::jsonb,
      'recentClosedTopics', '[]'::jsonb,
      'counts', jsonb_build_object(
        'recentPosts', 0,
        'recentUpdates', 0,
        'openTopics', 0,
        'pendingFollowups', 0,
        'overdueFollowups', 0,
        'recentClosedTopics', 0
      )
    )
from public.categories as category
where category.id = prompt.category_id;

alter table public.generated_prompts
  alter column reference_date set not null,
  alter column closed_lookback_days set not null,
  alter column context_schema_version set not null,
  alter column context_snapshot set not null,
  add constraint generated_prompts_closed_lookback_days_check
    check (closed_lookback_days between 1 and 180),
  add constraint generated_prompts_context_schema_version_check
    check (context_schema_version = 1),
  add constraint generated_prompts_context_snapshot_object_check
    check (jsonb_typeof(context_snapshot) = 'object'),
  add constraint generated_prompts_context_snapshot_version_check
    check (context_snapshot ->> 'schemaVersion' = context_schema_version::text),
  add constraint generated_prompts_context_snapshot_category_check
    check (context_snapshot -> 'category' ->> 'id' = category_id),
  add constraint generated_prompts_context_snapshot_reference_date_check
    check (context_snapshot ->> 'referenceDate' = reference_date::text),
  add constraint generated_prompts_context_snapshot_privacy_check
    check (
      not context_snapshot ? 'ownerId'
      and not context_snapshot ? 'owner_id'
      and not context_snapshot ? 'email'
    );

drop function public.save_generated_prompt(uuid, text, integer, integer, text, text, boolean);

drop policy if exists generated_prompts_insert_own on public.generated_prompts;
drop policy if exists generated_prompts_update_own on public.generated_prompts;
drop policy if exists generated_prompts_delete_own on public.generated_prompts;

revoke all on table public.generated_prompts from anon, authenticated;
grant select on table public.generated_prompts to authenticated;

create function public.save_news_briefing_prompt_run(
  p_category_id text,
  p_reference_date date,
  p_prompt_mode text,
  p_closed_lookback_days integer,
  p_context_schema_version integer,
  p_context_snapshot jsonb,
  p_prompt_text text
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
  if actual_post_count > 5 then
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
    5,
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

create function public.set_news_briefing_prompt_run_pinned(
  p_prompt_run_id uuid,
  p_is_pinned boolean
)
returns public.generated_prompts
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := (select auth.uid());
  target_prompt public.generated_prompts;
  saved_prompt public.generated_prompts;
begin
  if current_owner is null then
    raise exception 'BRIEFING_PROMPT_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_prompt_run_id is null or p_is_pinned is null then
    raise exception 'BRIEFING_PROMPT_PIN_INPUT_INVALID' using errcode = '22023';
  end if;

  select prompt.*
    into target_prompt
    from public.generated_prompts as prompt
   where prompt.id = p_prompt_run_id
     and prompt.owner_id = current_owner
   for update;

  if target_prompt.id is null then
    raise exception 'BRIEFING_PROMPT_RUN_NOT_FOUND' using errcode = '22023';
  end if;

  update public.generated_prompts as prompt
     set is_pinned = p_is_pinned
   where prompt.id = target_prompt.id
     and prompt.owner_id = current_owner;

  if not p_is_pinned then
    delete from public.generated_prompts as prompt
     using (
       select stale_prompt.id
         from public.generated_prompts as stale_prompt
        where stale_prompt.owner_id = current_owner
          and stale_prompt.category_id = target_prompt.category_id
          and stale_prompt.is_pinned = false
        order by stale_prompt.generated_at desc, stale_prompt.id desc
        offset 30
     ) as stale
     where prompt.id = stale.id;
  end if;

  select prompt.*
    into saved_prompt
    from public.generated_prompts as prompt
   where prompt.id = target_prompt.id
     and prompt.owner_id = current_owner;

  if saved_prompt.id is null then
    return null;
  end if;
  return saved_prompt;
end;
$$;

revoke all on function public.save_news_briefing_prompt_run(
  text, date, text, integer, integer, jsonb, text
) from public, anon;
grant execute on function public.save_news_briefing_prompt_run(
  text, date, text, integer, integer, jsonb, text
) to authenticated;

revoke all on function public.set_news_briefing_prompt_run_pinned(uuid, boolean)
  from public, anon;
grant execute on function public.set_news_briefing_prompt_run_pinned(uuid, boolean)
  to authenticated;
