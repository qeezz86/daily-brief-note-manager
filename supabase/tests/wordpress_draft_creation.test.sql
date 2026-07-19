begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

select has_table('public', 'wordpress_publication_attempts', '1 attempts table exists');
select has_column('public', 'wordpress_publication_attempts', 'idempotency_key', '2 idempotency column exists');
select col_type_is('public', 'wordpress_publication_attempts', 'wordpress_post_id', 'bigint', '3 WordPress ID uses bigint');
select has_pk('public', 'wordpress_publication_attempts', '4 primary key exists');
select has_fk('public', 'wordpress_publication_attempts', '5 owner/content foreign keys exist');
select ok((select relrowsecurity from pg_class where oid = 'public.wordpress_publication_attempts'::regclass), '6 RLS is enabled');
select is((select count(*) from pg_indexes where schemaname='public' and tablename='wordpress_publication_attempts' and indexdef like '%WHERE (status = ANY%'), 1::bigint, '7 one partial execution guard exists');
select function_returns('public', 'transition_wordpress_publication_attempt_service', array['uuid','uuid','text','text','text','bigint','text','text','text','text','boolean'], 'wordpress_publication_attempts', '8 service transition returns the attempt');

insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000005c01','draft-owner@example.test'),
  ('00000000-0000-4000-8000-000000005c02','draft-other@example.test');
insert into public.posts(id,owner_id,category_id,briefing_date,title,summary,html_body,slug,content_status,source_import_type,updated_at) values
  ('5c100000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000005c01','economy','2026-07-19','원본','요약','<div class="daily-brief-note news-briefing economy"><h1>원본</h1></div>','economy-briefing-2026-07-19','ready','manual_entry','2026-07-19T00:00:00Z'),
  ('5c100000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000005c01','economy','2026-07-20','원본2','요약','<div class="daily-brief-note news-briefing economy"><h1>원본2</h1></div>','economy-briefing-2026-07-20','ready','manual_entry','2026-07-19T00:00:00Z'),
  ('5c100000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000005c02','economy','2026-07-21','다른 사용자','요약','<div></div>','economy-briefing-2026-07-21','ready','manual_entry','2026-07-19T00:00:00Z');

-- Test-only bridge emulates the Edge Function's independently verified caller
-- and service-role-only RPC without exposing that production RPC to authenticated.
create function public.transition_wordpress_publication_attempt(
  p_attempt_id uuid, p_expected_status text, p_new_status text,
  p_actual_payload_fingerprint text default null, p_wordpress_post_id bigint default null,
  p_wordpress_post_status text default null, p_wordpress_post_slug text default null,
  p_wordpress_post_link text default null, p_error_code text default null,
  p_error_retryable boolean default null
) returns public.wordpress_publication_attempts
language plpgsql security definer set search_path = '' as $$
declare
  old_claims text := current_setting('request.jwt.claims', true);
  result public.wordpress_publication_attempts;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  result := public.transition_wordpress_publication_attempt_service(
    '00000000-0000-4000-8000-000000005c01', p_attempt_id, p_expected_status,
    p_new_status, p_actual_payload_fingerprint, p_wordpress_post_id,
    p_wordpress_post_status, p_wordpress_post_slug, p_wordpress_post_link,
    p_error_code, p_error_retryable
  );
  perform set_config('request.jwt.claims', old_claims, true);
  return result;
exception when others then
  perform set_config('request.jwt.claims', old_claims, true);
  raise;
end;
$$;
revoke all on function public.transition_wordpress_publication_attempt(uuid,text,text,text,bigint,text,text,text,text,boolean) from public, anon;
grant execute on function public.transition_wordpress_publication_attempt(uuid,text,text,text,bigint,text,text,text,text,boolean) to authenticated;

set local role anon;
select throws_ok($$ select count(*) from public.wordpress_publication_attempts $$, '42501', null::text, '9 anonymous select is denied');
select throws_ok($$ select public.transition_wordpress_publication_attempt('5c200000-0000-4000-8000-000000000001','received','validating') $$, '42501', null::text, '10 anonymous transition is denied');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000005c01","role":"authenticated"}';
select throws_ok($$ select public.transition_wordpress_publication_attempt_service('00000000-0000-4000-8000-000000005c01','5c200000-0000-4000-8000-000000000001','received','validating') $$, '42501', null::text, 'authenticated browser cannot call service transition');
select lives_ok($$ insert into public.wordpress_publication_attempts(id,owner_id,content_id,site_origin,idempotency_key,expected_source_updated_at,expected_payload_fingerprint) values('5c200000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000005c01','5c100000-0000-4000-8000-000000000001','https://wordpress.example.com','5c300000-0000-4000-8000-000000000001','2026-07-19T00:00:00Z','sha256:'||repeat('a',64)) $$, '11 owner inserts received attempt');
select is((select count(*) from public.wordpress_publication_attempts), 1::bigint, '12 owner selects own attempt');
select throws_ok($$ insert into public.wordpress_publication_attempts(owner_id,content_id,site_origin,idempotency_key,expected_source_updated_at,expected_payload_fingerprint) values('00000000-0000-4000-8000-000000005c02','5c100000-0000-4000-8000-000000000003','https://wordpress.example.com','5c300000-0000-4000-8000-000000000009','2026-07-19T00:00:00Z','sha256:'||repeat('a',64)) $$, '42501', null::text, '13 forged owner insert is denied');
select throws_ok($$ insert into public.wordpress_publication_attempts(owner_id,content_id,site_origin,idempotency_key,expected_source_updated_at,expected_payload_fingerprint,status) values('00000000-0000-4000-8000-000000005c01','5c100000-0000-4000-8000-000000000001','https://wordpress.example.com','5c300000-0000-4000-8000-000000000008','2026-07-19T00:00:00Z','sha256:'||repeat('a',64),'succeeded') $$, '42501', null::text, '14 direct terminal insert is denied');
select throws_ok($$ update public.wordpress_publication_attempts set owner_id='00000000-0000-4000-8000-000000005c02' $$, '42501', null::text, '15 direct owner update is denied');
select throws_ok($$ update public.wordpress_publication_attempts set status='succeeded' $$, '42501', null::text, '16 direct state update is denied');

select lives_ok($$ select public.transition_wordpress_publication_attempt('5c200000-0000-4000-8000-000000000001','received','validating') $$, '17 received transitions to validating');
select throws_ok($$ select public.transition_wordpress_publication_attempt('5c200000-0000-4000-8000-000000000001','validating','succeeded') $$, '23514', 'WORDPRESS_ATTEMPT_INVALID_TRANSITION', '18 invalid transition is rejected');
select throws_ok($$ select public.transition_wordpress_publication_attempt('5c200000-0000-4000-8000-000000000001','validating','executing','sha256:'||repeat('b',64)) $$, '23514', 'WORDPRESS_ATTEMPT_FINGERPRINT_MISMATCH', '19 execution fingerprint must match');
select lives_ok($$ select public.transition_wordpress_publication_attempt('5c200000-0000-4000-8000-000000000001','validating','executing','sha256:'||repeat('a',64)) $$, '20 validating atomically acquires execution lock');
select is((select status from public.wordpress_publication_attempts where id='5c200000-0000-4000-8000-000000000001'), 'executing', '21 executing status is stored');
select lives_ok($$ select public.transition_wordpress_publication_attempt('5c200000-0000-4000-8000-000000000001','executing','succeeded','sha256:'||repeat('a',64),91,'draft','economy-briefing-2026-07-19','https://wordpress.example.com/?p=91') $$, '22 executing transitions to succeeded draft');
select throws_ok($$ select public.transition_wordpress_publication_attempt('5c200000-0000-4000-8000-000000000001','succeeded','validating') $$, '23514', 'WORDPRESS_ATTEMPT_TERMINAL', '23 succeeded is terminal');
select throws_ok($$ insert into public.wordpress_publication_attempts(owner_id,content_id,site_origin,idempotency_key,expected_source_updated_at,expected_payload_fingerprint) values('00000000-0000-4000-8000-000000005c01','5c100000-0000-4000-8000-000000000001','https://wordpress.example.com','5c300000-0000-4000-8000-000000000001','2026-07-19T00:00:00Z','sha256:'||repeat('a',64)) $$, '23505', null::text, '24 duplicate idempotency key conflicts');

insert into public.wordpress_publication_attempts(id,owner_id,content_id,site_origin,idempotency_key,expected_source_updated_at,expected_payload_fingerprint)
values('5c200000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000005c01','5c100000-0000-4000-8000-000000000001','https://wordpress.example.com','5c300000-0000-4000-8000-000000000002','2026-07-19T00:00:00Z','sha256:'||repeat('a',64));
select public.transition_wordpress_publication_attempt('5c200000-0000-4000-8000-000000000002','received','validating');
select throws_ok($$ select public.transition_wordpress_publication_attempt('5c200000-0000-4000-8000-000000000002','validating','executing','sha256:'||repeat('a',64)) $$, '23505', 'WORDPRESS_ATTEMPT_EXECUTION_CONFLICT', '25 same content cannot acquire a second lock');
select lives_ok($$ select public.transition_wordpress_publication_attempt('5c200000-0000-4000-8000-000000000002','validating','blocked','sha256:'||repeat('a',64),null,null,null,null,'EXISTING_DRAFT_RECORD',false) $$, '26 losing attempt can be safely blocked');

insert into public.wordpress_publication_attempts(id,owner_id,content_id,site_origin,idempotency_key,expected_source_updated_at,expected_payload_fingerprint)
values('5c200000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000005c01','5c100000-0000-4000-8000-000000000002','https://wordpress.example.com','5c300000-0000-4000-8000-000000000003','2026-07-19T00:00:00Z','sha256:'||repeat('c',64));
select public.transition_wordpress_publication_attempt('5c200000-0000-4000-8000-000000000003','received','validating');
select public.transition_wordpress_publication_attempt('5c200000-0000-4000-8000-000000000003','validating','executing','sha256:'||repeat('c',64));
select lives_ok($$ select public.transition_wordpress_publication_attempt('5c200000-0000-4000-8000-000000000003','executing','uncertain','sha256:'||repeat('c',64),null,null,null,null,'WORDPRESS_DRAFT_RESULT_UNCERTAIN',false) $$, '27 uncertain result is recorded');
select throws_ok($$ select public.transition_wordpress_publication_attempt('5c200000-0000-4000-8000-000000000003','uncertain','executing','sha256:'||repeat('c',64)) $$, '23514', 'WORDPRESS_ATTEMPT_TERMINAL', '28 uncertain is terminal');

reset role;
insert into public.wordpress_publication_attempts(owner_id,content_id,site_origin,idempotency_key,expected_source_updated_at,expected_payload_fingerprint)
values('00000000-0000-4000-8000-000000005c02','5c100000-0000-4000-8000-000000000003','https://wordpress.example.com','5c300000-0000-4000-8000-000000000004','2026-07-19T00:00:00Z','sha256:'||repeat('d',64));
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000005c01","role":"authenticated"}';
select is((select count(*) from public.wordpress_publication_attempts), 3::bigint, '29 non-owner attempt is hidden');
select is(current_setting('request.jwt.claims')::jsonb->>'sub', '00000000-0000-4000-8000-000000005c01', '30 owner auth context remains explicit');
select is((select proconfig from pg_proc where oid='public.transition_wordpress_publication_attempt_service(uuid,uuid,text,text,text,bigint,text,text,text,text,boolean)'::regprocedure), array['search_path=""'], '31 service transition search_path is fixed');
select ok(position('wordpress_publication_attempts' in public.get_user_backup_snapshot('core')::text) = 0 and position('5c200000-0000-4000-8000-000000000001' in public.get_user_backup_snapshot('core')::text) = 0, '32 backup and restore input exclude attempts');

select * from finish();
rollback;
