-- get_restore_jobs and get_restore_job run as the authenticated caller and
-- delegate their owner-scoped aggregation to this helper.
grant execute on function public.restore_job_json(uuid) to authenticated;
