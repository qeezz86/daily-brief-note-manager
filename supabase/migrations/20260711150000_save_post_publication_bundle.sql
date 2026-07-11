-- Phase 2B-2: normalized shared tags, ordered sources, and atomic publication save.

update public.tags
   set name = regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g');

alter table public.tags
  add column normalized_name text;

update public.tags
   set normalized_name = lower(name);

alter table public.tags
  alter column normalized_name set not null,
  add constraint tags_normalized_name_format_check
    check (normalized_name = lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')));

drop index public.tags_owner_normalized_name_key;

create unique index tags_owner_normalized_name_key
  on public.tags (owner_id, normalized_name);

with ranked_sources as (
  select id, row_number() over (
    partition by post_id order by sort_order, created_at, id
  ) - 1 as new_sort_order
  from public.sources
)
update public.sources as source
   set sort_order = ranked.new_sort_order
  from ranked_sources as ranked
 where source.id = ranked.id;

create unique index sources_post_sort_order_key
  on public.sources (post_id, sort_order);

create or replace function public.save_post_publication_bundle(
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
  p_sources jsonb
)
returns public.posts
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := (select auth.uid());
  post_owner uuid;
  post_category_id text;
  category_group text;
  category_name text;
  saved_post public.posts;
  normalized_html text := case when nullif(btrim(p_html_body), '') is null then null else p_html_body end;
  normalized_image_prompt text := nullif(btrim(p_image_prompt), '');
  normalized_image_alt text := nullif(btrim(p_image_alt), '');
  normalized_representative_title text := nullif(btrim(p_representative_title), '');
  normalized_focus_keyword text := nullif(btrim(p_focus_keyword), '');
  tag_item jsonb;
  source_item jsonb;
  normalized_tag text;
  normalized_key text;
  normalized_tags text[] := array[]::text[];
  normalized_keys text[] := array[]::text[];
  saved_tag_id uuid;
  source_name_value text;
  source_title_value text;
  source_url_value text;
  source_url_key text;
  checked_point_value text;
  source_keys text[] := array[]::text[];
  source_count integer := 0;
  has_official_cctv_source boolean := false;
  source_host text;
begin
  if current_owner is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select owner_id, category_id
    into post_owner, post_category_id
    from public.posts
   where id = p_post_id
   for update;

  if post_owner is null or post_owner <> current_owner then
    raise exception 'Cannot edit a post owned by another user' using errcode = '42501';
  end if;

  select content_group, name
    into category_group, category_name
    from public.categories
   where id = post_category_id;

  if jsonb_typeof(p_tags) is distinct from 'array' then
    raise exception 'TAGS_INVALID_SHAPE: tags must be an array' using errcode = '22023';
  end if;
  if jsonb_typeof(p_sources) is distinct from 'array' then
    raise exception 'SOURCES_INVALID_SHAPE: sources must be an array' using errcode = '22023';
  end if;

  for tag_item in select value from jsonb_array_elements(p_tags)
  loop
    if jsonb_typeof(tag_item) <> 'string' then
      raise exception 'TAGS_INVALID_SHAPE: every tag must be a string' using errcode = '22023';
    end if;
    normalized_tag := regexp_replace(btrim(tag_item #>> '{}'), '[[:space:]]+', ' ', 'g');
    if normalized_tag = '' then continue; end if;
    normalized_key := lower(normalized_tag);
    if p_content_status <> 'archived' and normalized_key = any(normalized_keys) then
      raise exception 'TAG_DUPLICATE' using errcode = '23514';
    end if;
    if p_content_status <> 'archived' and char_length(normalized_tag) > 80 then
      raise exception 'TAG_TOO_LONG' using errcode = '23514';
    end if;
    if p_content_status <> 'archived' and regexp_replace(normalized_key, '[[:space:]]+', '', 'g') = 'dailybriefnote' then
      raise exception 'TAG_FORBIDDEN_BRAND' using errcode = '23514';
    end if;
    if p_content_status <> 'archived' and normalized_key = lower(regexp_replace(btrim(category_name), '[[:space:]]+', ' ', 'g')) then
      raise exception 'TAG_FORBIDDEN_CATEGORY' using errcode = '23514';
    end if;
    if p_content_status <> 'archived' and normalized_key = lower(regexp_replace(btrim(p_title), '[[:space:]]+', ' ', 'g')) then
      raise exception 'TAG_FORBIDDEN_TITLE' using errcode = '23514';
    end if;
    normalized_tags := array_append(normalized_tags, normalized_tag);
    normalized_keys := array_append(normalized_keys, normalized_key);
  end loop;

  for source_item in select value from jsonb_array_elements(p_sources)
  loop
    if jsonb_typeof(source_item) <> 'object' then
      raise exception 'SOURCES_INVALID_SHAPE: every source must be an object' using errcode = '22023';
    end if;
    if not (source_item ? 'source_name' and source_item ? 'source_title' and
      source_item ? 'source_url' and source_item ? 'source_published_at' and
      source_item ? 'checked_point' and source_item ? 'sort_order') then
      raise exception 'SOURCES_INVALID_SHAPE: required source field is missing' using errcode = '22023';
    end if;
    source_name_value := nullif(btrim(source_item ->> 'source_name'), '');
    source_title_value := nullif(btrim(source_item ->> 'source_title'), '');
    source_url_value := nullif(btrim(source_item ->> 'source_url'), '');
    checked_point_value := nullif(btrim(source_item ->> 'checked_point'), '');
    if source_name_value is null or source_title_value is null or source_url_value is null or checked_point_value is null then
      raise exception 'SOURCE_INCOMPLETE' using errcode = '23514';
    end if;
    if source_url_value !~* '^https?://[^[:space:]]+$' then
      raise exception 'SOURCE_URL_INVALID' using errcode = '23514';
    end if;
    source_url_key := regexp_replace(split_part(source_url_value, '#', 1), '/+$', '');
    if lower(source_url_key) = any(source_keys) then
      raise exception 'SOURCE_DUPLICATE' using errcode = '23514';
    end if;
    source_keys := array_append(source_keys, lower(source_url_key));
    begin
      perform nullif(btrim(source_item ->> 'source_published_at'), '')::timestamptz;
    exception when others then
      raise exception 'SOURCE_PUBLISHED_AT_INVALID' using errcode = '22007';
    end;
    source_count := source_count + 1;
    source_host := lower(substring(source_url_value from '^https?://([^/:?#]+)'));
    if (source_host = 'cctv.com' or source_host like '%.cctv.com' or
        source_host = 'cctv.cn' or source_host like '%.cctv.cn') and
       source_url_value ~* '^https?://[^/]+/.+' then
      has_official_cctv_source := true;
    end if;
  end loop;

  if p_content_status in ('ready', 'published') then
    if normalized_html is null then raise exception 'Ready and published posts require HTML' using errcode = '23514'; end if;
    if normalized_representative_title is null or normalized_focus_keyword is null or nullif(btrim(p_meta_description), '') is null then
      raise exception 'Ready and published posts require complete SEO data' using errcode = '23514';
    end if;
    if cardinality(p_alternative_titles) <> 4 or exists (
      select 1 from unnest(p_alternative_titles) as title(value) where nullif(btrim(title.value), '') is null
    ) or (select count(distinct lower(btrim(title.value))) from unnest(p_alternative_titles) as title(value)) <> 4 then
      raise exception 'Ready and published posts require four distinct alternative titles' using errcode = '23514';
    end if;
    if normalized_image_prompt is null or normalized_image_alt is null then
      raise exception 'Ready and published posts require image prompt and ALT text' using errcode = '23514';
    end if;
    if cardinality(normalized_tags) < 5 or cardinality(normalized_tags) > 8 then
      raise exception 'TAG_COUNT' using errcode = '23514';
    end if;
    if source_count < 1 then raise exception 'SOURCE_REQUIRED' using errcode = '23514'; end if;
    if normalized_html !~* 'id[[:space:]]*=[[:space:]]*["'']sources["'']' then
      raise exception 'HTML_SOURCES_SECTION_REQUIRED' using errcode = '23514';
    end if;
    foreach source_url_key in array source_keys loop
      if strpos(lower(normalized_html), source_url_key) = 0 then
        raise exception 'HTML_SOURCE_URL_MISSING' using errcode = '23514';
      end if;
    end loop;
    if category_group = 'chinese' then
      if exists (select 1 from jsonb_array_elements(p_sources) item where nullif(btrim(item ->> 'source_published_at'), '') is null) then
        raise exception 'CHINESE_SOURCE_DATE_REQUIRED' using errcode = '23514';
      end if;
      if not has_official_cctv_source then raise exception 'CHINESE_CCTV_SOURCE_REQUIRED' using errcode = '23514'; end if;
    end if;
  end if;
  if p_content_status = 'published' and p_published_on is null then
    raise exception 'Published posts require published_on' using errcode = '23514';
  end if;

  update public.posts
     set title = btrim(p_title), summary = btrim(p_summary), slug = btrim(p_slug),
         content_status = p_content_status, published_on = p_published_on,
         wordpress_url = nullif(btrim(p_wordpress_url), ''), html_body = normalized_html,
         image_prompt = normalized_image_prompt, image_alt = normalized_image_alt
   where id = p_post_id and owner_id = current_owner
  returning * into saved_post;

  insert into public.seo_data (post_id, owner_id, representative_title, alternative_titles, meta_description, focus_keyword)
  values (p_post_id, current_owner, normalized_representative_title, to_jsonb(p_alternative_titles), btrim(p_meta_description), normalized_focus_keyword)
  on conflict (post_id) do update set representative_title = excluded.representative_title,
    alternative_titles = excluded.alternative_titles, meta_description = excluded.meta_description,
    focus_keyword = excluded.focus_keyword;

  delete from public.post_tags where post_id = p_post_id and owner_id = current_owner;
  for normalized_tag, normalized_key in select * from unnest(normalized_tags, normalized_keys)
  loop
    insert into public.tags (owner_id, name, normalized_name)
    values (current_owner, normalized_tag, normalized_key)
    on conflict (owner_id, normalized_name) do update set name = excluded.name
    returning id into saved_tag_id;
    insert into public.post_tags (post_id, tag_id, owner_id)
    values (p_post_id, saved_tag_id, current_owner);
  end loop;

  delete from public.sources where post_id = p_post_id and owner_id = current_owner;
  for source_item in select value from jsonb_array_elements(p_sources) order by (value ->> 'sort_order')::integer
  loop
    insert into public.sources (
      owner_id, post_id, source_name, source_title, source_url,
      source_published_at, checked_point, sort_order
    ) values (
      current_owner, p_post_id, btrim(source_item ->> 'source_name'),
      btrim(source_item ->> 'source_title'), btrim(source_item ->> 'source_url'),
      nullif(btrim(source_item ->> 'source_published_at'), '')::timestamptz,
      btrim(source_item ->> 'checked_point'), (source_item ->> 'sort_order')::integer
    );
  end loop;

  return saved_post;
end;
$$;

revoke all on function public.save_post_publication_bundle(
  uuid, text, text, text, text, date, text, text, text, text,
  text, text[], text, text, jsonb, jsonb
) from public, anon;

grant execute on function public.save_post_publication_bundle(
  uuid, text, text, text, text, date, text, text, text, text,
  text, text[], text, text, jsonb, jsonb
) to authenticated;
