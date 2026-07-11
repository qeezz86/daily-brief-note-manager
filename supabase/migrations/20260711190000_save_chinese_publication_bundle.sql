-- Phase 2C-1: Chinese learning metadata and an atomic Chinese publication bundle.

alter table public.chinese_metadata
  alter column learning_topic drop not null,
  alter column program_name drop not null,
  alter column original_title drop not null,
  alter column original_url drop not null,
  alter column verified_core_fact drop not null;

alter table public.chinese_metadata
  drop constraint chinese_metadata_owner_original_url_key;

create unique index chinese_metadata_owner_original_url_normalized_key
  on public.chinese_metadata (
    owner_id,
    lower(regexp_replace(split_part(original_url, '#', 1), '/+$', ''))
  )
  where original_url is not null;

create or replace function public.save_chinese_publication_bundle(
  p_post_id uuid,
  p_title text,
  p_summary text,
  p_slug text,
  p_content_status text,
  p_published_on date,
  p_wordpress_url text,
  p_html_body text,
  p_image_prompt text,
  p_image_alt text,
  p_representative_title text,
  p_alternative_titles text[],
  p_meta_description text,
  p_focus_keyword text,
  p_tags jsonb,
  p_sources jsonb,
  p_chinese_metadata jsonb
)
returns public.posts
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := (select auth.uid());
  post_owner uuid;
  category_group text;
  saved_post public.posts;
  learning_topic_value text;
  program_name_value text;
  original_title_value text;
  original_url_value text;
  original_published_at_value timestamptz;
  episode_list_included_value boolean;
  verified_core_fact_value text;
  difficulty_value text;
  learning_points_value text;
  original_url_key text;
  original_host text;
  metadata_is_empty boolean;
begin
  if current_owner is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select post.owner_id, category.content_group
    into post_owner, category_group
    from public.posts as post
    join public.categories as category on category.id = post.category_id
   where post.id = p_post_id
   for update of post;

  if post_owner is null or post_owner <> current_owner then
    raise exception 'Cannot edit a post owned by another user' using errcode = '42501';
  end if;
  if category_group <> 'chinese' then
    raise exception 'CHINESE_METADATA_REQUIRES_CHINESE_POST' using errcode = '23514';
  end if;
  if jsonb_typeof(p_chinese_metadata) <> 'object' then
    raise exception 'CHINESE_METADATA_INVALID_SHAPE' using errcode = '22023';
  end if;

  learning_topic_value := nullif(btrim(p_chinese_metadata ->> 'learning_topic'), '');
  program_name_value := nullif(btrim(p_chinese_metadata ->> 'program_name'), '');
  original_title_value := nullif(btrim(p_chinese_metadata ->> 'original_title'), '');
  original_url_value := nullif(btrim(p_chinese_metadata ->> 'original_url'), '');
  verified_core_fact_value := nullif(btrim(p_chinese_metadata ->> 'verified_core_fact'), '');
  difficulty_value := nullif(btrim(p_chinese_metadata ->> 'difficulty'), '');
  learning_points_value := nullif(btrim(p_chinese_metadata ->> 'learning_points'), '');

  begin
    original_published_at_value := nullif(btrim(p_chinese_metadata ->> 'original_published_at'), '')::timestamptz;
  exception when others then
    raise exception 'CHINESE_METADATA_DATE_INVALID' using errcode = '22007';
  end;
  begin
    episode_list_included_value := case
      when p_chinese_metadata ->> 'episode_list_included' is null then null
      else (p_chinese_metadata ->> 'episode_list_included')::boolean
    end;
  exception when others then
    raise exception 'CHINESE_METADATA_EPISODE_LIST_INVALID' using errcode = '22023';
  end;

  metadata_is_empty := learning_topic_value is null and program_name_value is null and
    original_title_value is null and original_url_value is null and
    original_published_at_value is null and episode_list_included_value is null and
    verified_core_fact_value is null and difficulty_value is null and learning_points_value is null;

  if p_content_status in ('ready', 'published') then
    if learning_topic_value is null or program_name_value is null or original_title_value is null or
       original_url_value is null or original_published_at_value is null or
       episode_list_included_value is null or verified_core_fact_value is null then
      raise exception 'CHINESE_METADATA_REQUIRED' using errcode = '23514';
    end if;
    original_host := lower(substring(original_url_value from '^https?://([^/:?#]+)'));
    if original_url_value !~* '^https?://[^[:space:]]+$' or
       not (original_host = 'cctv.com' or original_host like '%.cctv.com' or
            original_host = 'cctv.cn' or original_host like '%.cctv.cn') or
       original_url_value !~* '^https?://[^/]+/.+' then
      raise exception 'CHINESE_METADATA_URL_INVALID' using errcode = '23514';
    end if;
    original_url_key := lower(regexp_replace(split_part(original_url_value, '#', 1), '/+$', ''));
    if not exists (
      select 1
        from jsonb_array_elements(p_sources) as source(item)
       where lower(regexp_replace(split_part(btrim(source.item ->> 'source_url'), '#', 1), '/+$', '')) = original_url_key
    ) then
      raise exception 'CHINESE_METADATA_URL_SOURCE_MISMATCH' using errcode = '23514';
    end if;
  end if;

  select * into saved_post from public.save_post_publication_bundle(
    p_post_id, p_title, p_summary, p_slug, p_content_status, p_published_on,
    p_wordpress_url, p_html_body, p_image_prompt, p_image_alt,
    p_representative_title, p_alternative_titles, p_meta_description,
    p_focus_keyword, p_tags, p_sources
  );

  if not metadata_is_empty then
    begin
      insert into public.chinese_metadata (
        post_id, owner_id, learning_topic, program_name, original_title,
        original_url, original_published_at, episode_list_included,
        verified_core_fact, difficulty, learning_points
      ) values (
        p_post_id, current_owner, learning_topic_value, program_name_value,
        original_title_value, original_url_value, original_published_at_value,
        episode_list_included_value, verified_core_fact_value, difficulty_value,
        learning_points_value
      ) on conflict (post_id) do update set
        learning_topic = excluded.learning_topic,
        program_name = excluded.program_name,
        original_title = excluded.original_title,
        original_url = excluded.original_url,
        original_published_at = excluded.original_published_at,
        episode_list_included = excluded.episode_list_included,
        verified_core_fact = excluded.verified_core_fact,
        difficulty = excluded.difficulty,
        learning_points = excluded.learning_points;
    exception when unique_violation then
      raise exception 'CHINESE_METADATA_ORIGINAL_URL_DUPLICATE' using errcode = '23505';
    end;
  end if;

  return saved_post;
end;
$$;

revoke all on function public.save_chinese_publication_bundle(
  uuid, text, text, text, text, date, text, text, text, text,
  text, text[], text, text, jsonb, jsonb, jsonb
) from public, anon;

grant execute on function public.save_chinese_publication_bundle(
  uuid, text, text, text, text, date, text, text, text, text,
  text, text[], text, text, jsonb, jsonb, jsonb
) to authenticated;
