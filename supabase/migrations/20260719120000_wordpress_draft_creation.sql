-- Phase 5C: owner-scoped WordPress draft attempts, idempotency and atomic state transitions.

create table public.wordpress_publication_attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  content_id uuid not null,
  site_origin text not null,
  operation text not null default 'create_draft'
    constraint wordpress_publication_attempts_operation_check
    check (operation = 'create_draft'),
  idempotency_key uuid not null,
  expected_source_updated_at timestamptz not null,
  expected_payload_fingerprint text not null,
  actual_payload_fingerprint text,
  status text not null default 'received'
    constraint wordpress_publication_attempts_status_check
    check (status in ('received', 'validating', 'blocked', 'executing', 'succeeded', 'failed_safe', 'uncertain')),
  wordpress_post_id bigint,
  wordpress_post_status text,
  wordpress_post_link text,
  wordpress_post_slug text,
  error_code text,
  error_retryable boolean,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wordpress_publication_attempts_post_owner_fkey
    foreign key (content_id, owner_id) references public.posts (id, owner_id) on delete cascade,
  constraint wordpress_publication_attempts_site_origin_check check (
    site_origin = btrim(site_origin)
    and site_origin ~ '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$'
  ),
  constraint wordpress_publication_attempts_expected_fingerprint_check
    check (expected_payload_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  constraint wordpress_publication_attempts_actual_fingerprint_check
    check (actual_payload_fingerprint is null or actual_payload_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  constraint wordpress_publication_attempts_wordpress_id_check
    check (wordpress_post_id is null or wordpress_post_id > 0),
  constraint wordpress_publication_attempts_result_check check (
    (status = 'succeeded'
      and wordpress_post_id is not null
      and wordpress_post_status = 'draft'
      and wordpress_post_slug is not null
      and wordpress_post_link is not null
      and error_code is null
      and error_retryable is null
      and completed_at is not null)
    or
    (status in ('blocked', 'failed_safe', 'uncertain')
      and error_code is not null
      and error_retryable is not null
      and completed_at is not null
      and (status <> 'uncertain' or actual_payload_fingerprint is not null))
    or
    (status in ('received', 'validating', 'executing')
      and wordpress_post_id is null
      and wordpress_post_status is null
      and wordpress_post_link is null
      and wordpress_post_slug is null
      and error_code is null
      and error_retryable is null
      and completed_at is null)
  ),
  constraint wordpress_publication_attempts_owner_site_idempotency_key
    unique (owner_id, site_origin, idempotency_key)
);

create index wordpress_publication_attempts_owner_content_created_idx
  on public.wordpress_publication_attempts (owner_id, content_id, created_at desc);

-- This is both the execution lock and the durable same-content guard. A failed-safe
-- attempt releases the lock; succeeded and uncertain outcomes keep it permanently.
create unique index wordpress_publication_attempts_content_execution_key
  on public.wordpress_publication_attempts (owner_id, content_id, site_origin, operation)
  where status in ('executing', 'succeeded', 'uncertain');

create trigger wordpress_publication_attempts_set_updated_at
before update on public.wordpress_publication_attempts
for each row execute function public.set_updated_at();

alter table public.wordpress_publication_attempts enable row level security;
revoke all on table public.wordpress_publication_attempts from public, anon, authenticated;
grant select, insert on table public.wordpress_publication_attempts to authenticated;

create policy wordpress_publication_attempts_select_own
on public.wordpress_publication_attempts for select to authenticated
using ((select auth.uid()) = owner_id);

create policy wordpress_publication_attempts_insert_received_own
on public.wordpress_publication_attempts for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and status = 'received'
  and operation = 'create_draft'
  and actual_payload_fingerprint is null
  and wordpress_post_id is null
  and wordpress_post_status is null
  and wordpress_post_link is null
  and wordpress_post_slug is null
  and error_code is null
  and error_retryable is null
  and started_at is null
  and completed_at is null
);

create function public.transition_wordpress_publication_attempt(
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
  v_owner_id uuid := (select auth.uid());
  v_attempt public.wordpress_publication_attempts;
begin
  if v_owner_id is null then
    raise exception 'WORDPRESS_ATTEMPT_PERMISSION_DENIED' using errcode = '42501';
  end if;

  select * into v_attempt
  from public.wordpress_publication_attempts
  where id = p_attempt_id and owner_id = v_owner_id
  for update;

  if v_attempt.id is null then
    raise exception 'WORDPRESS_ATTEMPT_NOT_FOUND' using errcode = '42501';
  end if;
  if v_attempt.status <> p_expected_status then
    raise exception 'WORDPRESS_ATTEMPT_STATE_CONFLICT' using errcode = '40001';
  end if;
  if v_attempt.status in ('succeeded', 'uncertain', 'blocked', 'failed_safe') then
    raise exception 'WORDPRESS_ATTEMPT_TERMINAL' using errcode = '23514';
  end if;
  if not (
    (p_expected_status = 'received' and p_new_status = 'validating')
    or (p_expected_status = 'validating' and p_new_status in ('blocked', 'executing'))
    or (p_expected_status = 'executing' and p_new_status in ('succeeded', 'failed_safe', 'uncertain'))
  ) then
    raise exception 'WORDPRESS_ATTEMPT_INVALID_TRANSITION' using errcode = '23514';
  end if;

  if p_new_status = 'executing' then
    if p_actual_payload_fingerprint is null or p_actual_payload_fingerprint <> v_attempt.expected_payload_fingerprint then
      raise exception 'WORDPRESS_ATTEMPT_FINGERPRINT_MISMATCH' using errcode = '23514';
    end if;
    if p_wordpress_post_id is not null or p_wordpress_post_status is not null or p_wordpress_post_slug is not null
      or p_wordpress_post_link is not null or p_error_code is not null or p_error_retryable is not null then
      raise exception 'WORDPRESS_ATTEMPT_INVALID_RESULT' using errcode = '23514';
    end if;
  elsif p_new_status = 'succeeded' then
    if p_wordpress_post_id is null or p_wordpress_post_id <= 0 or p_wordpress_post_status <> 'draft'
      or p_wordpress_post_slug is null or p_wordpress_post_link is null
      or p_error_code is not null or p_error_retryable is not null then
      raise exception 'WORDPRESS_ATTEMPT_INVALID_RESULT' using errcode = '23514';
    end if;
  elsif p_new_status in ('blocked', 'failed_safe', 'uncertain') then
    if p_error_code is null or p_error_retryable is null
      or p_wordpress_post_id is not null or p_wordpress_post_status is not null
      or p_wordpress_post_slug is not null or p_wordpress_post_link is not null then
      raise exception 'WORDPRESS_ATTEMPT_INVALID_RESULT' using errcode = '23514';
    end if;
    if p_new_status = 'uncertain' and coalesce(p_actual_payload_fingerprint, v_attempt.actual_payload_fingerprint) is null then
      raise exception 'WORDPRESS_ATTEMPT_INVALID_RESULT' using errcode = '23514';
    end if;
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
exception
  when unique_violation then
    raise exception 'WORDPRESS_ATTEMPT_EXECUTION_CONFLICT' using errcode = '23505';
end;
$$;

revoke all on function public.transition_wordpress_publication_attempt(uuid, text, text, text, bigint, text, text, text, text, boolean) from public, anon;
grant execute on function public.transition_wordpress_publication_attempt(uuid, text, text, text, bigint, text, text, text, text, boolean) to authenticated;

comment on table public.wordpress_publication_attempts is
  'Non-portable audit/idempotency history for one externally-created WordPress draft; contains no article body or credential.';
comment on function public.transition_wordpress_publication_attempt(uuid, text, text, text, bigint, text, text, text, text, boolean) is
  'Owner-authenticated allowlisted transition and atomic execution lock for WordPress draft creation.';
