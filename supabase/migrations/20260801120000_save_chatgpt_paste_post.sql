-- Phase 5G: save one locally previewed structured ChatGPT paste aggregate.

create function public.save_chatgpt_paste_post(p_item jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := (select auth.uid());
  content_value jsonb;
  seo_value jsonb;
  image_value jsonb;
  sources_value jsonb;
  mapped_sources jsonb;
  category_row public.categories;
  imported_result jsonb;
  saved_post public.posts;
  saved_post_id uuid;
  source_entry record;
  unknown_key text;
begin
  if current_owner is null then
    raise exception 'CHATGPT_PASTE_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if jsonb_typeof(p_item) is distinct from 'object' then
    raise exception 'CHATGPT_PASTE_INVALID_INPUT' using errcode = '22023';
  end if;
  if public.import_payload_has_forbidden_key(p_item) then
    raise exception 'CHATGPT_PASTE_FORBIDDEN_FIELD' using errcode = '22023';
  end if;

  select key into unknown_key
    from jsonb_object_keys(p_item) key
   where key <> all(array['content', 'seo', 'image', 'sources', 'html_body'])
   limit 1;
  if unknown_key is not null then
    raise exception 'CHATGPT_PASTE_FORBIDDEN_FIELD' using errcode = '22023';
  end if;
  if not (p_item ?& array['content', 'seo', 'image', 'sources', 'html_body']) then
    raise exception 'CHATGPT_PASTE_MISSING_REQUIRED_FIELD' using errcode = '22023';
  end if;

  content_value := p_item -> 'content';
  seo_value := p_item -> 'seo';
  image_value := p_item -> 'image';
  sources_value := p_item -> 'sources';
  if jsonb_typeof(content_value) is distinct from 'object'
     or jsonb_typeof(seo_value) is distinct from 'object'
     or jsonb_typeof(image_value) is distinct from 'object'
     or jsonb_typeof(sources_value) is distinct from 'array'
     or jsonb_typeof(p_item -> 'html_body') is distinct from 'string' then
    raise exception 'CHATGPT_PASTE_INVALID_INPUT' using errcode = '22023';
  end if;

  select key into unknown_key
    from jsonb_object_keys(content_value) key
   where key <> all(array[
     'content_group', 'category_id', 'display_id', 'series_no', 'title',
     'summary', 'slug', 'published_on', 'published_at', 'wordpress_url'
   ])
   limit 1;
  if unknown_key is not null then
    raise exception 'CHATGPT_PASTE_FORBIDDEN_FIELD' using errcode = '22023';
  end if;
  if not (content_value ?& array[
    'content_group', 'category_id', 'display_id', 'title', 'slug',
    'published_on', 'published_at', 'summary', 'series_no', 'wordpress_url'
  ]) then
    raise exception 'CHATGPT_PASTE_MISSING_REQUIRED_FIELD' using errcode = '22023';
  end if;

  select key into unknown_key
    from jsonb_object_keys(seo_value) key
   where key <> all(array[
     'representative_title', 'alternative_titles', 'meta_description',
     'focus_keyword', 'tags'
   ])
   limit 1;
  if unknown_key is not null then
    raise exception 'CHATGPT_PASTE_FORBIDDEN_FIELD' using errcode = '22023';
  end if;
  if not (seo_value ?& array[
    'representative_title', 'alternative_titles', 'meta_description',
    'focus_keyword', 'tags'
  ]) then
    raise exception 'CHATGPT_PASTE_MISSING_REQUIRED_FIELD' using errcode = '22023';
  end if;

  select key into unknown_key
    from jsonb_object_keys(image_value) key
   where key <> all(array['prompt', 'alt'])
   limit 1;
  if unknown_key is not null then
    raise exception 'CHATGPT_PASTE_FORBIDDEN_FIELD' using errcode = '22023';
  end if;
  if not (image_value ?& array['prompt', 'alt']) then
    raise exception 'CHATGPT_PASTE_MISSING_REQUIRED_FIELD' using errcode = '22023';
  end if;

  mapped_sources := '[]'::jsonb;
  for source_entry in
    select value as item, ordinality
      from jsonb_array_elements(sources_value) with ordinality
  loop
    if jsonb_typeof(source_entry.item) is distinct from 'object' then
      raise exception 'CHATGPT_PASTE_INVALID_SOURCE' using errcode = '22023';
    end if;
    select key into unknown_key
      from jsonb_object_keys(source_entry.item) key
     where key <> all(array[
       'source_name', 'source_title', 'source_url', 'source_published_at', 'checked_point'
     ])
     limit 1;
    if unknown_key is not null then
      raise exception 'CHATGPT_PASTE_FORBIDDEN_FIELD' using errcode = '22023';
    end if;
    if not (source_entry.item ?& array[
      'source_name', 'source_title', 'source_url', 'source_published_at', 'checked_point'
    ]) then
      raise exception 'CHATGPT_PASTE_MISSING_REQUIRED_FIELD' using errcode = '22023';
    end if;
    mapped_sources := mapped_sources || jsonb_build_array(
      source_entry.item || jsonb_build_object('sort_order', source_entry.ordinality - 1)
    );
  end loop;

  select * into category_row
    from public.categories
   where id = btrim(content_value ->> 'category_id')
     and enabled = true;
  if category_row.id is null
     or category_row.content_group <> content_value ->> 'content_group' then
    raise exception 'CHATGPT_PASTE_UNSUPPORTED_CATEGORY' using errcode = '23514';
  end if;

  imported_result := public.import_content_post(jsonb_build_object(
    'validation_mode', 'strict',
    'category_id', content_value ->> 'category_id',
    'title', content_value ->> 'title',
    'summary', content_value ->> 'summary',
    'slug', content_value ->> 'slug',
    'status', 'draft',
    'briefing_date', case when category_row.content_group = 'news'
      then content_value -> 'published_on' else 'null'::jsonb end,
    'published_on', content_value -> 'published_on',
    'published_at', content_value -> 'published_at',
    'display_id', content_value -> 'display_id',
    'series_no', content_value -> 'series_no',
    'wordpress_url', content_value -> 'wordpress_url',
    'html_body', p_item -> 'html_body',
    'seo', jsonb_build_object(
      'representative_title', seo_value -> 'representative_title',
      'alternative_titles', seo_value -> 'alternative_titles',
      'meta_description', seo_value -> 'meta_description',
      'focus_keyword', seo_value -> 'focus_keyword'
    ),
    'image', image_value,
    'tags', seo_value -> 'tags',
    'sources', mapped_sources,
    'metadata', case when category_row.content_group = 'news'
      then 'null'::jsonb else '{}'::jsonb end
  ));

  begin
    saved_post_id := (imported_result ->> 'postId')::uuid;
  exception when others then
    raise exception 'CHATGPT_PASTE_AGGREGATE_FAILURE' using errcode = '23514';
  end;

  update public.posts
     set source_import_type = 'chatgpt_paste'
   where id = saved_post_id
     and owner_id = current_owner
     and source_import_type = 'json_import'
  returning * into saved_post;
  if saved_post.id is null then
    raise exception 'CHATGPT_PASTE_FORBIDDEN_REFERENCE' using errcode = '42501';
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
end;
$$;

comment on function public.save_chatgpt_paste_post(jsonb) is
  'Atomically saves one authenticated owner structured ChatGPT paste aggregate without retaining the raw paste or news-tracking blocks.';

revoke all on function public.save_chatgpt_paste_post(jsonb) from public, anon;
grant execute on function public.save_chatgpt_paste_post(jsonb) to authenticated;
