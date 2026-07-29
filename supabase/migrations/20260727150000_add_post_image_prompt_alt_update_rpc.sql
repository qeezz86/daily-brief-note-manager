-- Phase 5D: save only a post's image prompt and ALT text.

create function public.update_post_image_metadata(
  p_post_id uuid,
  p_image_prompt text,
  p_image_alt text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := (select auth.uid());
  post_owner uuid;
  post_status text;
  normalized_image_prompt text := nullif(btrim(p_image_prompt), '');
  normalized_image_alt text := nullif(btrim(p_image_alt), '');
  saved_post public.posts;
begin
  if current_owner is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select owner_id, content_status
    into post_owner, post_status
    from public.posts
   where id = p_post_id
   for update;

  if post_owner is null or post_owner <> current_owner then
    raise exception 'Cannot edit a post owned by another user' using errcode = '42501';
  end if;

  if post_status in ('ready', 'published')
     and (normalized_image_prompt is null or normalized_image_alt is null) then
    raise exception 'Ready and published posts require image prompt and ALT text'
      using errcode = '23514';
  end if;

  update public.posts
     set image_prompt = normalized_image_prompt,
         image_alt = normalized_image_alt
   where id = p_post_id
     and owner_id = current_owner
  returning * into saved_post;

  return jsonb_build_object(
    'id', saved_post.id,
    'image_prompt', saved_post.image_prompt,
    'image_alt', saved_post.image_alt,
    'image_prompt_version', saved_post.image_prompt_version,
    'image_prompt_updated_at', saved_post.image_prompt_updated_at,
    'updated_at', saved_post.updated_at
  );
end;
$$;

revoke all on function public.update_post_image_metadata(uuid, text, text)
  from public, anon;

grant execute on function public.update_post_image_metadata(uuid, text, text)
  to authenticated;
