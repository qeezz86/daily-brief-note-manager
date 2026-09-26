-- Keep the detail RPC compatible with the frontend detail schema.
create or replace function public.get_import_job(p_job_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  base jsonb;
  job public.import_jobs;
  failed_count integer;
begin
  base := public.get_import_job_v1(p_job_id);
  if base is null then return null; end if;

  select * into job
  from public.import_jobs
  where id = p_job_id and owner_id = (select auth.uid());

  select count(*)::integer into failed_count
  from public.import_job_items
  where job_id = p_job_id
    and owner_id = (select auth.uid())
    and (content_status = 'failed' or tracking_status = 'failed');

  return base || jsonb_build_object(
    'failedCount', failed_count,
    'restoredFromBackup', job.restored_from_backup,
    'executionLocked', job.execution_locked,
    'restoreOriginChecksum', job.restore_origin_checksum
  );
end $$;

revoke all on function public.get_import_job(uuid) from public, anon;
grant execute on function public.get_import_job(uuid) to authenticated;

notify pgrst, 'reload schema';
