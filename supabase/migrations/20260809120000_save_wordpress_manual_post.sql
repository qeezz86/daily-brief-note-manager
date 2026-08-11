-- Phase 5H: save one explicitly confirmed manual WordPress HTML import with fixed provenance.

create function public.save_wordpress_manual_post(p_item jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_owner uuid := (select auth.uid());
  imported_result jsonb;
  saved_post_id uuid;
  updated_count integer;
begin
  if current_owner is null then
    raise exception 'WORDPRESS_MANUAL_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if jsonb_typeof(p_item) = 'object' then
    if p_item ? 'sourceImportType'
       or p_item ? 'source_import_type' then
      raise exception 'IMPORT_FORBIDDEN_FIELD'
        using errcode = '22023';
    end if;
  end if;

  imported_result := public.import_content_post(p_item);
  saved_post_id := (imported_result ->> 'postId')::uuid;

  update public.posts
     set source_import_type = 'wordpress_manual'
   where id = saved_post_id
     and owner_id = current_owner
     and source_import_type = 'json_import';

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'WORDPRESS_MANUAL_PROVENANCE_FINALIZATION_FAILED'
      using errcode = '23514';
  end if;

  return imported_result;
end;
$$;

comment on function public.save_wordpress_manual_post(jsonb) is
  'Atomically imports one authenticated owner manual WordPress HTML aggregate and fixes its provenance to wordpress_manual.';

revoke all on function public.save_wordpress_manual_post(jsonb) from public, anon;
grant execute on function public.save_wordpress_manual_post(jsonb) to authenticated;
