alter table public.seo_data
  alter column representative_title drop not null,
  alter column focus_keyword drop not null;

create or replace function public.set_image_prompt_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    if new.image_prompt is not null and new.image_prompt_updated_at is null then
      new.image_prompt_updated_at = statement_timestamp();
    end if;
  elsif new.image_prompt is distinct from old.image_prompt then
    new.image_prompt_version = old.image_prompt_version + 1;
    new.image_prompt_updated_at = statement_timestamp();
  else
    new.image_prompt_version = old.image_prompt_version;
  end if;

  return new;
end;
$$;

create function public.save_post_editor(
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
  p_focus_keyword text
)
returns public.posts
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := (select auth.uid());
  post_owner uuid;
  saved_post public.posts;
  normalized_html text := case
    when nullif(btrim(p_html_body), '') is null then null
    else p_html_body
  end;
  normalized_image_prompt text := nullif(btrim(p_image_prompt), '');
  normalized_image_alt text := nullif(btrim(p_image_alt), '');
  normalized_representative_title text := nullif(btrim(p_representative_title), '');
  normalized_focus_keyword text := nullif(btrim(p_focus_keyword), '');
begin
  if current_owner is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  select owner_id
    into post_owner
    from public.posts
   where id = p_post_id
   for update;

  if post_owner is null or post_owner <> current_owner then
    raise exception 'Cannot edit a post owned by another user'
      using errcode = '42501';
  end if;

  if p_content_status in ('ready', 'published') then
    if normalized_html is null then
      raise exception 'Ready and published posts require HTML'
        using errcode = '23514';
    end if;

    if normalized_representative_title is null
      or normalized_focus_keyword is null
      or nullif(btrim(p_meta_description), '') is null then
      raise exception 'Ready and published posts require complete SEO data'
        using errcode = '23514';
    end if;

    if cardinality(p_alternative_titles) <> 4
      or exists (
        select 1
          from unnest(p_alternative_titles) as title(value)
         where nullif(btrim(title.value), '') is null
      )
      or (
        select count(distinct lower(btrim(title.value)))
          from unnest(p_alternative_titles) as title(value)
      ) <> 4 then
      raise exception 'Ready and published posts require four distinct alternative titles'
        using errcode = '23514';
    end if;

    if normalized_image_prompt is null or normalized_image_alt is null then
      raise exception 'Ready and published posts require image prompt and ALT text'
        using errcode = '23514';
    end if;
  end if;

  if p_content_status = 'published' and p_published_on is null then
    raise exception 'Published posts require published_on'
      using errcode = '23514';
  end if;

  update public.posts
     set title = btrim(p_title),
         summary = btrim(p_summary),
         slug = btrim(p_slug),
         content_status = p_content_status,
         published_on = p_published_on,
         wordpress_url = nullif(btrim(p_wordpress_url), ''),
         html_body = normalized_html,
         image_prompt = normalized_image_prompt,
         image_alt = normalized_image_alt
   where id = p_post_id
     and owner_id = current_owner
  returning * into saved_post;

  insert into public.seo_data (
    post_id,
    owner_id,
    representative_title,
    alternative_titles,
    meta_description,
    focus_keyword
  ) values (
    p_post_id,
    current_owner,
    normalized_representative_title,
    to_jsonb(p_alternative_titles),
    btrim(p_meta_description),
    normalized_focus_keyword
  )
  on conflict (post_id) do update
    set representative_title = excluded.representative_title,
        alternative_titles = excluded.alternative_titles,
        meta_description = excluded.meta_description,
        focus_keyword = excluded.focus_keyword;

  return saved_post;
end;
$$;

revoke all on function public.save_post_editor(
  uuid,
  text,
  text,
  text,
  text,
  date,
  text,
  text,
  text,
  text,
  text,
  text[],
  text,
  text
) from public, anon;

grant execute on function public.save_post_editor(
  uuid,
  text,
  text,
  text,
  text,
  date,
  text,
  text,
  text,
  text,
  text,
  text[],
  text,
  text
) to authenticated;
