-- Phase 5E: owner-scoped, read-only operational dashboard overview.

create function public.get_dashboard_overview(
  p_recent_limit integer default 5
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_owner uuid := (select auth.uid());
  overview jsonb;
begin
  if current_owner is null then
    raise exception 'DASHBOARD_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_recent_limit is null or p_recent_limit < 1 or p_recent_limit > 10 then
    raise exception 'DASHBOARD_RECENT_LIMIT_INVALID' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'schema_version', 1,
    'counts', jsonb_build_object(
      'total_posts', (
        select count(*)
        from public.posts as post
        where post.owner_id = current_owner
      ),
      'ready_posts', (
        select count(*)
        from public.posts as post
        where post.owner_id = current_owner
          and post.content_status = 'ready'
      ),
      'active_news_topics', (
        select count(*)
        from public.news_topics as topic
        where topic.owner_id = current_owner
          and topic.status = 'active'
      ),
      'pending_news_followups', (
        select count(*)
        from public.news_followups as followup
        where followup.owner_id = current_owner
          and followup.status = 'pending'
      )
    ),
    'category_counts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'category_id', category.id,
          'category_name', category.name,
          'post_count', (
            select count(*)
            from public.posts as post
            where post.owner_id = current_owner
              and post.category_id = category.id
          )
        )
        order by category.sort_order, category.id
      )
      from public.categories as category
      where category.enabled
    ), '[]'::jsonb),
    'recent_posts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', recent.id,
          'title', recent.title,
          'category_id', recent.category_id,
          'content_status', recent.content_status,
          'updated_at', recent.updated_at
        )
        order by recent.updated_at desc, recent.id desc
      )
      from (
        select post.id, post.title, post.category_id, post.content_status, post.updated_at
        from public.posts as post
        where post.owner_id = current_owner
        order by post.updated_at desc, post.id desc
        limit p_recent_limit
      ) as recent
    ), '[]'::jsonb),
    'recent_prompt_runs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', recent.id,
          'category_id', recent.category_id,
          'reference_date', recent.reference_date,
          'requested_post_count', recent.requested_post_count,
          'actual_post_count', recent.actual_post_count,
          'generated_at', recent.generated_at
        )
        order by recent.generated_at desc, recent.id desc
      )
      from (
        select
          prompt.id,
          prompt.category_id,
          prompt.reference_date,
          prompt.requested_post_count,
          prompt.actual_post_count,
          prompt.generated_at
        from public.generated_prompts as prompt
        where prompt.owner_id = current_owner
        order by prompt.generated_at desc, prompt.id desc
        limit p_recent_limit
      ) as recent
    ), '[]'::jsonb)
  )
  into overview;

  return overview;
end;
$$;

revoke all on function public.get_dashboard_overview(integer) from public, anon;
grant execute on function public.get_dashboard_overview(integer) to authenticated;
