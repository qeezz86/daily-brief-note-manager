-- Phase 5C hardening: browser-authenticated callers must not mutate attempt state.

revoke all on function public.transition_wordpress_publication_attempt(uuid, text, text, text, bigint, text, text, text, text, boolean)
  from public, anon, authenticated, service_role;
drop function public.transition_wordpress_publication_attempt(uuid, text, text, text, bigint, text, text, text, text, boolean);

create function public.transition_wordpress_publication_attempt_service(
  p_owner_id uuid,
  p_attempt_id uuid,
  p_expected_status text,
  p_new_status text,
  p_actual_payload_fingerprint text default null,
  p_wordpress_post_id bigint default null,
  p_wordpress_post_status text default null,
  p_wordpress_post_slug text default null,
  p_wordpress_post_link text default null,
  p_error_code text default null,
  p_error_retryable boolean default null
)
returns public.wordpress_publication_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.wordpress_publication_attempts;
begin
  if (select auth.role()) <> 'service_role' or p_owner_id is null then
    raise exception 'WORDPRESS_ATTEMPT_PERMISSION_DENIED' using errcode = '42501';
  end if;

  select * into v_attempt
  from public.wordpress_publication_attempts
  where id = p_attempt_id and owner_id = p_owner_id
  for update;

  if v_attempt.id is null then raise exception 'WORDPRESS_ATTEMPT_NOT_FOUND' using errcode = '42501'; end if;
  if v_attempt.status <> p_expected_status then raise exception 'WORDPRESS_ATTEMPT_STATE_CONFLICT' using errcode = '40001'; end if;
  if v_attempt.status in ('succeeded', 'uncertain', 'blocked', 'failed_safe') then raise exception 'WORDPRESS_ATTEMPT_TERMINAL' using errcode = '23514'; end if;
  if not (
    (p_expected_status = 'received' and p_new_status = 'validating')
    or (p_expected_status = 'validating' and p_new_status in ('blocked', 'executing'))
    or (p_expected_status = 'executing' and p_new_status in ('succeeded', 'failed_safe', 'uncertain'))
  ) then raise exception 'WORDPRESS_ATTEMPT_INVALID_TRANSITION' using errcode = '23514'; end if;

  if p_new_status = 'executing' then
    if p_actual_payload_fingerprint is null or p_actual_payload_fingerprint <> v_attempt.expected_payload_fingerprint then raise exception 'WORDPRESS_ATTEMPT_FINGERPRINT_MISMATCH' using errcode = '23514'; end if;
    if p_wordpress_post_id is not null or p_wordpress_post_status is not null or p_wordpress_post_slug is not null or p_wordpress_post_link is not null or p_error_code is not null or p_error_retryable is not null then raise exception 'WORDPRESS_ATTEMPT_INVALID_RESULT' using errcode = '23514'; end if;
  elsif p_new_status = 'succeeded' then
    if p_wordpress_post_id is null or p_wordpress_post_id <= 0 or p_wordpress_post_status <> 'draft' or p_wordpress_post_slug is null or p_wordpress_post_link is null or p_error_code is not null or p_error_retryable is not null then raise exception 'WORDPRESS_ATTEMPT_INVALID_RESULT' using errcode = '23514'; end if;
  elsif p_new_status in ('blocked', 'failed_safe', 'uncertain') then
    if p_error_code is null or p_error_retryable is null or p_wordpress_post_id is not null or p_wordpress_post_status is not null or p_wordpress_post_slug is not null or p_wordpress_post_link is not null then raise exception 'WORDPRESS_ATTEMPT_INVALID_RESULT' using errcode = '23514'; end if;
    if p_new_status = 'uncertain' and coalesce(p_actual_payload_fingerprint, v_attempt.actual_payload_fingerprint) is null then raise exception 'WORDPRESS_ATTEMPT_INVALID_RESULT' using errcode = '23514'; end if;
  end if;

  update public.wordpress_publication_attempts
  set status = p_new_status,
      actual_payload_fingerprint = coalesce(p_actual_payload_fingerprint, actual_payload_fingerprint),
      wordpress_post_id = p_wordpress_post_id,
      wordpress_post_status = p_wordpress_post_status,
      wordpress_post_slug = p_wordpress_post_slug,
      wordpress_post_link = p_wordpress_post_link,
      error_code = p_error_code,
      error_retryable = p_error_retryable,
      started_at = case when p_new_status = 'executing' then statement_timestamp() else started_at end,
      completed_at = case when p_new_status in ('blocked', 'succeeded', 'failed_safe', 'uncertain') then statement_timestamp() else null end
  where id = p_attempt_id
  returning * into v_attempt;
  return v_attempt;
exception when unique_violation then
  raise exception 'WORDPRESS_ATTEMPT_EXECUTION_CONFLICT' using errcode = '23505';
end;
$$;

revoke all on function public.transition_wordpress_publication_attempt_service(uuid, uuid, text, text, text, bigint, text, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.transition_wordpress_publication_attempt_service(uuid, uuid, text, text, text, bigint, text, text, text, text, boolean)
  to service_role;

comment on function public.transition_wordpress_publication_attempt_service(uuid, uuid, text, text, text, bigint, text, text, text, text, boolean) is
  'Service-role-only allowlisted transition; owner UUID is derived from the independently verified Edge Function caller.';
