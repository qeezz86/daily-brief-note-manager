-- Phase 2C-2: AI column and information DB metadata within publication bundles.

create or replace function public.save_ai_publication_bundle(
  p_post_id uuid, p_title text, p_summary text, p_slug text, p_content_status text,
  p_published_on date, p_wordpress_url text, p_html_body text, p_image_prompt text,
  p_image_alt text, p_representative_title text, p_alternative_titles text[],
  p_meta_description text, p_focus_keyword text, p_tags jsonb, p_sources jsonb,
  p_ai_metadata jsonb
)
returns public.posts
language plpgsql security definer set search_path = ''
as $$
declare
  current_owner uuid := (select auth.uid());
  post_owner uuid;
  category_group text;
  saved_post public.posts;
  field_name_value text;
  difficulty_value text;
  estimated_read_min_value integer;
  metadata_is_empty boolean;
begin
  if current_owner is null then raise exception 'Authentication is required' using errcode = '42501'; end if;
  select post.owner_id, category.content_group into post_owner, category_group
    from public.posts post join public.categories category on category.id = post.category_id
   where post.id = p_post_id for update of post;
  if post_owner is null or post_owner <> current_owner then raise exception 'Cannot edit a post owned by another user' using errcode = '42501'; end if;
  if category_group <> 'ai' then raise exception 'AI_METADATA_REQUIRES_AI_POST' using errcode = '23514'; end if;
  if jsonb_typeof(p_ai_metadata) <> 'object' then raise exception 'AI_METADATA_INVALID_SHAPE' using errcode = '22023'; end if;

  field_name_value := nullif(btrim(p_ai_metadata ->> 'field_name'), '');
  difficulty_value := nullif(btrim(p_ai_metadata ->> 'difficulty'), '');
  begin
    estimated_read_min_value := nullif(btrim(p_ai_metadata ->> 'estimated_read_min'), '')::integer;
  exception when others then raise exception 'AI_METADATA_READ_MIN_INVALID' using errcode = '22023'; end;
  metadata_is_empty := field_name_value is null and difficulty_value is null and estimated_read_min_value is null;
  if field_name_value is not null and char_length(field_name_value) > 100 then raise exception 'AI_METADATA_FIELD_NAME_INVALID' using errcode = '23514'; end if;
  if difficulty_value is not null and difficulty_value not in ('beginner', 'intermediate', 'advanced') then raise exception 'AI_METADATA_DIFFICULTY_INVALID' using errcode = '23514'; end if;
  if estimated_read_min_value is not null and (estimated_read_min_value < 1 or estimated_read_min_value > 600) then raise exception 'AI_METADATA_READ_MIN_INVALID' using errcode = '23514'; end if;
  if p_content_status in ('ready', 'published') and metadata_is_empty then raise exception 'AI_METADATA_REQUIRED' using errcode = '23514'; end if;
  if p_content_status in ('ready', 'published') and (field_name_value is null or difficulty_value is null or estimated_read_min_value is null) then raise exception 'AI_METADATA_REQUIRED' using errcode = '23514'; end if;

  select * into saved_post from public.save_post_publication_bundle(
    p_post_id, p_title, p_summary, p_slug, p_content_status, p_published_on, p_wordpress_url,
    p_html_body, p_image_prompt, p_image_alt, p_representative_title, p_alternative_titles,
    p_meta_description, p_focus_keyword, p_tags, p_sources
  );
  if metadata_is_empty and p_content_status = 'draft' then
    delete from public.ai_metadata where post_id = p_post_id and owner_id = current_owner;
  elsif not metadata_is_empty then
    insert into public.ai_metadata (post_id, owner_id, field_name, difficulty, estimated_read_min)
    values (p_post_id, current_owner, field_name_value, difficulty_value, estimated_read_min_value)
    on conflict (post_id) do update set field_name = excluded.field_name, difficulty = excluded.difficulty, estimated_read_min = excluded.estimated_read_min;
  end if;
  return saved_post;
end;
$$;

create or replace function public.save_info_db_publication_bundle(
  p_post_id uuid, p_title text, p_summary text, p_slug text, p_content_status text,
  p_published_on date, p_wordpress_url text, p_html_body text, p_image_prompt text,
  p_image_alt text, p_representative_title text, p_alternative_titles text[],
  p_meta_description text, p_focus_keyword text, p_tags jsonb, p_sources jsonb,
  p_info_db_metadata jsonb
)
returns public.posts
language plpgsql security definer set search_path = ''
as $$
declare
  current_owner uuid := (select auth.uid());
  post_owner uuid;
  category_group text;
  saved_post public.posts;
  field_name_value text;
  difficulty_value text;
  estimated_read_min_value integer;
  reference_date_value date;
  metadata_is_empty boolean;
begin
  if current_owner is null then raise exception 'Authentication is required' using errcode = '42501'; end if;
  select post.owner_id, category.content_group into post_owner, category_group
    from public.posts post join public.categories category on category.id = post.category_id
   where post.id = p_post_id for update of post;
  if post_owner is null or post_owner <> current_owner then raise exception 'Cannot edit a post owned by another user' using errcode = '42501'; end if;
  if category_group <> 'info_db' then raise exception 'INFO_DB_METADATA_REQUIRES_INFO_DB_POST' using errcode = '23514'; end if;
  if jsonb_typeof(p_info_db_metadata) <> 'object' then raise exception 'INFO_DB_METADATA_INVALID_SHAPE' using errcode = '22023'; end if;

  field_name_value := nullif(btrim(p_info_db_metadata ->> 'field_name'), '');
  difficulty_value := nullif(btrim(p_info_db_metadata ->> 'difficulty'), '');
  begin estimated_read_min_value := nullif(btrim(p_info_db_metadata ->> 'estimated_read_min'), '')::integer;
  exception when others then raise exception 'INFO_DB_METADATA_READ_MIN_INVALID' using errcode = '22023'; end;
  begin reference_date_value := nullif(btrim(p_info_db_metadata ->> 'reference_date'), '')::date;
  exception when others then raise exception 'INFO_DB_METADATA_DATE_INVALID' using errcode = '22007'; end;
  metadata_is_empty := field_name_value is null and difficulty_value is null and estimated_read_min_value is null and reference_date_value is null;
  if field_name_value is not null and char_length(field_name_value) > 100 then raise exception 'INFO_DB_METADATA_FIELD_NAME_INVALID' using errcode = '23514'; end if;
  if difficulty_value is not null and difficulty_value not in ('beginner', 'intermediate', 'advanced') then raise exception 'INFO_DB_METADATA_DIFFICULTY_INVALID' using errcode = '23514'; end if;
  if estimated_read_min_value is not null and (estimated_read_min_value < 1 or estimated_read_min_value > 600) then raise exception 'INFO_DB_METADATA_READ_MIN_INVALID' using errcode = '23514'; end if;
  if p_content_status in ('ready', 'published') and (field_name_value is null or difficulty_value is null or estimated_read_min_value is null) then raise exception 'INFO_DB_METADATA_REQUIRED' using errcode = '23514'; end if;

  select * into saved_post from public.save_post_publication_bundle(
    p_post_id, p_title, p_summary, p_slug, p_content_status, p_published_on, p_wordpress_url,
    p_html_body, p_image_prompt, p_image_alt, p_representative_title, p_alternative_titles,
    p_meta_description, p_focus_keyword, p_tags, p_sources
  );
  if metadata_is_empty and p_content_status = 'draft' then
    delete from public.info_db_metadata where post_id = p_post_id and owner_id = current_owner;
  elsif not metadata_is_empty then
    insert into public.info_db_metadata (post_id, owner_id, field_name, difficulty, estimated_read_min, reference_date)
    values (p_post_id, current_owner, field_name_value, difficulty_value, estimated_read_min_value, reference_date_value)
    on conflict (post_id) do update set field_name = excluded.field_name, difficulty = excluded.difficulty, estimated_read_min = excluded.estimated_read_min, reference_date = excluded.reference_date;
  end if;
  return saved_post;
end;
$$;

revoke all on function public.save_ai_publication_bundle(uuid, text, text, text, text, date, text, text, text, text, text, text[], text, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_ai_publication_bundle(uuid, text, text, text, text, date, text, text, text, text, text, text[], text, text, jsonb, jsonb, jsonb) to authenticated;
revoke all on function public.save_info_db_publication_bundle(uuid, text, text, text, text, date, text, text, text, text, text, text[], text, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_info_db_publication_bundle(uuid, text, text, text, text, date, text, text, text, text, text, text[], text, text, jsonb, jsonb, jsonb) to authenticated;
