-- Phase 4A-2: import one validated content post and its publication bundle atomically.

create function public.import_payload_has_forbidden_key(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  entry record;
  child jsonb;
begin
  if p_value is null then return false; end if;
  if jsonb_typeof(p_value) = 'object' then
    for entry in select key, value from jsonb_each(p_value)
    loop
      if entry.key = any(array[
        'id', 'ownerId', 'owner_id', 'postId', 'post_id', 'tagId', 'tag_id',
        'sourceId', 'source_id', 'createdAt', 'created_at', 'updatedAt', 'updated_at',
        'imagePromptVersion', 'image_prompt_version', 'imagePromptUpdatedAt',
        'image_prompt_updated_at', 'newsUpdateId', 'news_update_id'
      ]) then return true; end if;
      if public.import_payload_has_forbidden_key(entry.value) then return true; end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'array' then
    for child in select value from jsonb_array_elements(p_value)
    loop
      if public.import_payload_has_forbidden_key(child) then return true; end if;
    end loop;
  end if;
  return false;
end;
$$;

create function public.import_content_post(p_item jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := (select auth.uid());
  category_row public.categories;
  saved_post public.posts;
  metadata_value jsonb := coalesce(p_item -> 'metadata', 'null'::jsonb);
  seo_value jsonb := coalesce(p_item -> 'seo', '{}'::jsonb);
  image_value jsonb := coalesce(p_item -> 'image', '{}'::jsonb);
  tags_value jsonb := coalesce(p_item -> 'tags', '[]'::jsonb);
  sources_value jsonb := coalesce(p_item -> 'sources', '[]'::jsonb);
  alternative_titles text[] := array[]::text[];
  category_id_value text;
  title_value text;
  summary_value text;
  slug_value text;
  status_value text;
  briefing_date_value date;
  published_on_value date;
  published_at_value timestamptz;
  display_id_value text;
  series_no_value integer;
  wordpress_url_value text;
  html_body_value text;
  expected_slug text;
  expected_display_id text;
  unknown_key text;
begin
  if current_owner is null then
    raise exception 'IMPORT_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if jsonb_typeof(p_item) is distinct from 'object' then
    raise exception 'IMPORT_VALIDATION_FAILED' using errcode = '22023';
  end if;
  if public.import_payload_has_forbidden_key(p_item) then
    raise exception 'IMPORT_FORBIDDEN_FIELD' using errcode = '22023';
  end if;

  select key into unknown_key
    from jsonb_object_keys(p_item) key
   where key <> all(array[
     'category_id', 'title', 'summary', 'slug', 'status', 'briefing_date',
     'published_on', 'published_at', 'display_id', 'series_no', 'wordpress_url',
     'html_body', 'seo', 'image', 'tags', 'sources', 'metadata'
   ])
   limit 1;
  if unknown_key is not null then
    raise exception 'IMPORT_VALIDATION_FAILED' using errcode = '22023';
  end if;

  if jsonb_typeof(p_item -> 'category_id') is distinct from 'string'
     or jsonb_typeof(p_item -> 'title') is distinct from 'string'
     or jsonb_typeof(p_item -> 'summary') is distinct from 'string'
     or jsonb_typeof(p_item -> 'slug') is distinct from 'string'
     or jsonb_typeof(p_item -> 'status') is distinct from 'string' then
    raise exception 'IMPORT_VALIDATION_FAILED' using errcode = '22023';
  end if;

  category_id_value := btrim(p_item ->> 'category_id');
  title_value := btrim(p_item ->> 'title');
  summary_value := btrim(p_item ->> 'summary');
  slug_value := btrim(p_item ->> 'slug');
  status_value := p_item ->> 'status';
  display_id_value := nullif(btrim(p_item ->> 'display_id'), '');
  wordpress_url_value := nullif(btrim(p_item ->> 'wordpress_url'), '');
  html_body_value := case when nullif(btrim(p_item ->> 'html_body'), '') is null then null else p_item ->> 'html_body' end;

  if category_id_value = '' or title_value = '' or summary_value = ''
     or slug_value !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     or status_value not in ('draft', 'ready', 'published', 'archived') then
    raise exception 'IMPORT_VALIDATION_FAILED' using errcode = '22023';
  end if;

  select * into category_row
    from public.categories
   where id = category_id_value and enabled = true;
  if category_row.id is null then
    raise exception 'IMPORT_INVALID_CATEGORY' using errcode = '22023';
  end if;

  begin
    briefing_date_value := nullif(btrim(p_item ->> 'briefing_date'), '')::date;
    published_on_value := nullif(btrim(p_item ->> 'published_on'), '')::date;
    published_at_value := nullif(btrim(p_item ->> 'published_at'), '')::timestamptz;
    series_no_value := nullif(btrim(p_item ->> 'series_no'), '')::integer;
  exception when others then
    raise exception 'IMPORT_VALIDATION_FAILED' using errcode = '22023';
  end;

  if wordpress_url_value is not null and wordpress_url_value !~* '^https?://[^[:space:]]+$' then
    raise exception 'IMPORT_VALIDATION_FAILED' using errcode = '22023';
  end if;
  if status_value = 'published' and published_on_value is null then
    raise exception 'IMPORT_VALIDATION_FAILED' using errcode = '23514';
  end if;

  if category_row.content_group = 'news' then
    if briefing_date_value is null or series_no_value is not null
       or (metadata_value <> 'null'::jsonb and metadata_value <> '{}'::jsonb) then
      raise exception 'IMPORT_INVALID_METADATA' using errcode = '23514';
    end if;
    expected_display_id := case when category_row.display_id_pattern is null then null
      else replace(category_row.display_id_pattern, 'YYYY-MM-DD', briefing_date_value::text) end;
  else
    if series_no_value is null or series_no_value < 1 or briefing_date_value is not null
       or jsonb_typeof(metadata_value) is distinct from 'object' then
      raise exception 'IMPORT_INVALID_METADATA' using errcode = '23514';
    end if;
    expected_display_id := case when category_row.display_id_pattern is null then null
      else replace(category_row.display_id_pattern, '###', lpad(series_no_value::text, 3, '0')) end;
  end if;

  if category_row.content_group = 'chinese' and display_id_value is not null then
    raise exception 'IMPORT_INVALID_METADATA' using errcode = '23514';
  elsif category_row.content_group <> 'chinese' and display_id_value is distinct from expected_display_id then
    raise exception 'IMPORT_VALIDATION_FAILED' using errcode = '23514';
  end if;

  expected_slug := replace(category_row.slug_pattern, 'YYYY-MM-DD', coalesce(briefing_date_value::text, ''));
  expected_slug := replace(expected_slug, '###', lpad(coalesce(series_no_value, 0)::text, 3, '0'));
  if slug_value <> expected_slug then
    raise exception 'IMPORT_VALIDATION_FAILED' using errcode = '23514';
  end if;

  if category_row.content_group = 'ai' then
    select key into unknown_key from jsonb_object_keys(metadata_value) key
     where key <> all(array['field_name', 'difficulty', 'estimated_read_min']) limit 1;
  elsif category_row.content_group = 'info_db' then
    select key into unknown_key from jsonb_object_keys(metadata_value) key
     where key <> all(array['field_name', 'difficulty', 'estimated_read_min', 'reference_date']) limit 1;
  elsif category_row.content_group = 'chinese' then
    select key into unknown_key from jsonb_object_keys(metadata_value) key
     where key <> all(array['learning_topic', 'program_name', 'original_title', 'original_url',
       'original_published_at', 'episode_list_included', 'verified_core_fact', 'difficulty', 'learning_points']) limit 1;
  end if;
  if unknown_key is not null then
    raise exception 'IMPORT_INVALID_METADATA' using errcode = '22023';
  end if;

  if jsonb_typeof(seo_value) is distinct from 'object'
     or jsonb_typeof(image_value) is distinct from 'object'
     or jsonb_typeof(tags_value) is distinct from 'array'
     or jsonb_typeof(sources_value) is distinct from 'array'
     or (seo_value ? 'alternative_titles' and jsonb_typeof(seo_value -> 'alternative_titles') is distinct from 'array') then
    raise exception 'IMPORT_VALIDATION_FAILED' using errcode = '22023';
  end if;
  if seo_value ? 'alternative_titles' then
    begin
      select coalesce(array_agg(value), array[]::text[]) into alternative_titles
        from jsonb_array_elements_text(seo_value -> 'alternative_titles') value;
    exception when others then
      raise exception 'IMPORT_VALIDATION_FAILED' using errcode = '22023';
    end;
  end if;

  if html_body_value is not null then
    if html_body_value ~* '<[[:space:]]*(script|iframe)([[:space:]>])'
       or html_body_value ~* '[[:space:]]on[a-z0-9_-]+[[:space:]]*='
       or html_body_value ~* 'javascript[[:space:]]*:' then
      raise exception 'IMPORT_VALIDATION_FAILED' using errcode = '23514';
    end if;
    if status_value in ('ready', 'published') and (
      html_body_value !~* '<[[:space:]]*h1([[:space:]>])'
      or strpos(lower(html_body_value), lower('<div class="' || category_row.wrapper_class || '"')) = 0
    ) then raise exception 'IMPORT_VALIDATION_FAILED' using errcode = '23514'; end if;
  end if;

  -- User-friendly preflight inside the transaction. Unique indexes remain the
  -- final race-condition guard and are mapped again in the exception handler.
  if wordpress_url_value is not null and exists (
    select 1 from public.posts where owner_id = current_owner and wordpress_url = wordpress_url_value
  ) then raise exception 'IMPORT_DUPLICATE_WORDPRESS_URL' using errcode = '23505';
  elsif category_row.content_group = 'chinese' and exists (
    select 1 from public.chinese_metadata
     where owner_id = current_owner and original_url is not null
       and lower(regexp_replace(split_part(original_url, '#', 1), '/+$', '')) =
           lower(regexp_replace(split_part(metadata_value ->> 'original_url', '#', 1), '/+$', ''))
  ) then raise exception 'IMPORT_DUPLICATE_CHINESE_URL' using errcode = '23505';
  elsif briefing_date_value is not null and exists (
    select 1 from public.posts where owner_id = current_owner and category_id = category_id_value and briefing_date = briefing_date_value
  ) then raise exception 'IMPORT_DUPLICATE_BRIEFING' using errcode = '23505';
  elsif series_no_value is not null and exists (
    select 1 from public.posts where owner_id = current_owner and category_id = category_id_value and series_no = series_no_value
  ) then raise exception 'IMPORT_DUPLICATE_SERIES' using errcode = '23505';
  elsif exists (select 1 from public.posts where owner_id = current_owner and slug = slug_value) then
    raise exception 'IMPORT_DUPLICATE_SLUG' using errcode = '23505';
  end if;

  insert into public.posts (
    owner_id, category_id, series_no, briefing_date, published_on, published_at,
    display_id, title, summary, html_body, slug, wordpress_url, content_status,
    source_import_type
  ) values (
    current_owner, category_id_value, series_no_value, briefing_date_value,
    published_on_value, published_at_value, display_id_value, title_value,
    summary_value, null, slug_value, wordpress_url_value, 'draft', 'json_import'
  ) returning * into saved_post;

  if category_row.content_group = 'chinese' then
    select * into saved_post from public.save_chinese_publication_bundle(
      saved_post.id, title_value, summary_value, slug_value, status_value,
      published_on_value, wordpress_url_value, html_body_value,
      image_value ->> 'prompt', image_value ->> 'alt',
      seo_value ->> 'representative_title', alternative_titles,
      coalesce(seo_value ->> 'meta_description', ''), seo_value ->> 'focus_keyword',
      tags_value, sources_value, metadata_value
    );
  elsif category_row.content_group = 'ai' then
    select * into saved_post from public.save_ai_publication_bundle(
      saved_post.id, title_value, summary_value, slug_value, status_value,
      published_on_value, wordpress_url_value, html_body_value,
      image_value ->> 'prompt', image_value ->> 'alt',
      seo_value ->> 'representative_title', alternative_titles,
      coalesce(seo_value ->> 'meta_description', ''), seo_value ->> 'focus_keyword',
      tags_value, sources_value, metadata_value
    );
  elsif category_row.content_group = 'info_db' then
    select * into saved_post from public.save_info_db_publication_bundle(
      saved_post.id, title_value, summary_value, slug_value, status_value,
      published_on_value, wordpress_url_value, html_body_value,
      image_value ->> 'prompt', image_value ->> 'alt',
      seo_value ->> 'representative_title', alternative_titles,
      coalesce(seo_value ->> 'meta_description', ''), seo_value ->> 'focus_keyword',
      tags_value, sources_value, metadata_value
    );
  else
    select * into saved_post from public.save_post_publication_bundle(
      saved_post.id, title_value, summary_value, slug_value, status_value,
      published_on_value, wordpress_url_value, html_body_value,
      image_value ->> 'prompt', image_value ->> 'alt',
      seo_value ->> 'representative_title', alternative_titles,
      coalesce(seo_value ->> 'meta_description', ''), seo_value ->> 'focus_keyword',
      tags_value, sources_value
    );
  end if;

  if category_row.content_group <> 'news' then
    insert into public.series_counters (owner_id, category_id, last_issued_no)
    values (current_owner, category_id_value, series_no_value)
    on conflict (owner_id, category_id) do update
      set last_issued_no = greatest(public.series_counters.last_issued_no, excluded.last_issued_no),
          updated_at = statement_timestamp();
  end if;

  return jsonb_build_object(
    'postId', saved_post.id,
    'title', saved_post.title,
    'categoryId', saved_post.category_id,
    'status', saved_post.content_status,
    'slug', saved_post.slug,
    'displayId', saved_post.display_id,
    'publishedOn', saved_post.published_on,
    'wordpressUrl', saved_post.wordpress_url
  );
exception
  when unique_violation then
    if wordpress_url_value is not null and exists (
      select 1 from public.posts where owner_id = current_owner and wordpress_url = wordpress_url_value
    ) then raise exception 'IMPORT_DUPLICATE_WORDPRESS_URL' using errcode = '23505';
    elsif category_row.content_group = 'chinese' and exists (
      select 1 from public.chinese_metadata
       where owner_id = current_owner and original_url is not null
         and lower(regexp_replace(split_part(original_url, '#', 1), '/+$', '')) =
             lower(regexp_replace(split_part(metadata_value ->> 'original_url', '#', 1), '/+$', ''))
    ) then raise exception 'IMPORT_DUPLICATE_CHINESE_URL' using errcode = '23505';
    elsif briefing_date_value is not null and exists (
      select 1 from public.posts where owner_id = current_owner and category_id = category_id_value and briefing_date = briefing_date_value
    ) then raise exception 'IMPORT_DUPLICATE_BRIEFING' using errcode = '23505';
    elsif series_no_value is not null and exists (
      select 1 from public.posts where owner_id = current_owner and category_id = category_id_value and series_no = series_no_value
    ) then raise exception 'IMPORT_DUPLICATE_SERIES' using errcode = '23505';
    elsif exists (select 1 from public.posts where owner_id = current_owner and slug = slug_value) then
      raise exception 'IMPORT_DUPLICATE_SLUG' using errcode = '23505';
    else raise exception 'IMPORT_VALIDATION_FAILED' using errcode = '23514';
    end if;
end;
$$;

comment on function public.import_content_post(jsonb) is
  'Atomically imports one normalized content item; news tracking is intentionally excluded until Phase 4A-3.';

revoke all on function public.import_payload_has_forbidden_key(jsonb) from public, anon, authenticated;
revoke all on function public.import_content_post(jsonb) from public, anon;
grant execute on function public.import_content_post(jsonb) to authenticated;
