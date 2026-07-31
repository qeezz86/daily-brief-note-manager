begin;

create extension if not exists pgtap with schema extensions;
select plan(36);

select has_function(
  'public',
  'get_dashboard_overview',
  array['integer'],
  '1 dashboard overview RPC exists with the exact signature'
);
select function_returns(
  'public',
  'get_dashboard_overview',
  array['integer'],
  'jsonb',
  '2 dashboard overview RPC returns jsonb'
);
select ok(
  not (select prosecdef from pg_proc where oid = 'public.get_dashboard_overview(integer)'::regprocedure),
  '3 dashboard overview RPC is SECURITY INVOKER'
);
select is(
  (select proconfig from pg_proc where oid = 'public.get_dashboard_overview(integer)'::regprocedure),
  array['search_path=""'],
  '4 dashboard overview RPC fixes an empty search_path'
);
select function_privs_are(
  'public', 'get_dashboard_overview', array['integer'],
  'authenticated', array['EXECUTE'],
  '5 authenticated can execute the dashboard overview RPC'
);
select function_privs_are(
  'public', 'get_dashboard_overview', array['integer'],
  'anon', array[]::text[],
  '6 anon cannot execute the dashboard overview RPC'
);
select function_privs_are(
  'public', 'get_dashboard_overview', array['integer'],
  'public', array[]::text[],
  '7 PUBLIC cannot execute the dashboard overview RPC'
);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000005e01', 'dashboard-owner@example.test'),
  ('00000000-0000-0000-0000-000000005e02', 'dashboard-other@example.test');

insert into public.posts (
  id, owner_id, category_id, briefing_date, title, summary, html_body, slug,
  content_status, source_import_type, image_prompt, image_alt, updated_at
) values
  ('5e100000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000005e01','economy',date '2026-07-27','가장 오래된 글','요약','<div><h1>제목</h1></div>','dashboard-old','draft','manual_entry',null,null,'2026-07-29 01:00+00'),
  ('5e100000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000005e01','economy',date '2026-07-28','발행 준비 글','요약','<div><h1>제목</h1></div>','dashboard-ready','ready','manual_entry','프롬프트','ALT','2026-07-29 02:00+00'),
  ('5e100000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000005e01','global',date '2026-07-29','가장 최근 글','요약','<div><h1>제목</h1></div>','dashboard-new','draft','manual_entry',null,null,'2026-07-29 03:00+00'),
  ('5e100000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000005e02','economy',date '2026-07-29','타인 글','민감 요약','<div>민감 HTML</div>','dashboard-other','draft','manual_entry','민감 프롬프트','민감 ALT','2026-07-29 04:00+00');

insert into public.news_topics (
  id, owner_id, category_id, topic_key, canonical_title, status,
  first_seen_at, last_seen_at
) values
  ('5e200000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000005e01','economy','active-owner','활성 주제','active','2026-07-01','2026-07-29'),
  ('5e200000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000005e01','economy','monitoring-owner','모니터링 주제','monitoring','2026-07-01','2026-07-29'),
  ('5e200000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000005e02','economy','active-other','타인 활성 주제','active','2026-07-01','2026-07-29');

insert into public.news_followups (
  id, owner_id, topic_id, check_text, status, priority
) values
  ('5e300000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000005e01','5e200000-0000-0000-0000-000000000001','대기 확인','pending','normal'),
  ('5e300000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000005e01','5e200000-0000-0000-0000-000000000001','완료 확인','done','normal'),
  ('5e300000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000005e02','5e200000-0000-0000-0000-000000000003','타인 대기','pending','high');

insert into public.generated_prompts (
  id, owner_id, category_id, requested_post_count, actual_post_count,
  prompt_mode, prompt_text, is_pinned, generated_at, reference_date,
  closed_lookback_days, context_schema_version, context_snapshot
) values
  ('5e400000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000005e01','economy',5,2,'standard','오래된 프롬프트',false,'2026-07-29 01:00+00','2026-07-29',90,1,'{"schemaVersion":1,"referenceDate":"2026-07-29","category":{"id":"economy"}}'),
  ('5e400000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000005e01','global',5,1,'standard','최근 프롬프트',false,'2026-07-29 02:00+00','2026-07-29',90,1,'{"schemaVersion":1,"referenceDate":"2026-07-29","category":{"id":"global"}}'),
  ('5e400000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000005e02','economy',5,5,'standard','타인 민감 프롬프트',false,'2026-07-29 03:00+00','2026-07-29',90,1,'{"schemaVersion":1,"referenceDate":"2026-07-29","category":{"id":"economy"}}');

create temporary table pg_temp.dashboard_physical_count_baseline
on commit drop
as
select
  (select count(*)::bigint from public.posts) as posts_count,
  (select count(*)::bigint from public.generated_prompts) as prompts_count;

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"00000000-0000-0000-0000-000000005e01","role":"authenticated"}';

select lives_ok(
  $$ select public.get_dashboard_overview() $$,
  '8 default recent limit is accepted'
);
select lives_ok(
  $$ select public.get_dashboard_overview(1) $$,
  '9 recent limit one is accepted'
);
select lives_ok(
  $$ select public.get_dashboard_overview(10) $$,
  '10 recent limit ten is accepted'
);
select throws_ok(
  $$ select public.get_dashboard_overview(0) $$,
  '22023', 'DASHBOARD_RECENT_LIMIT_INVALID',
  '11 recent limit zero is rejected'
);
select throws_ok(
  $$ select public.get_dashboard_overview(11) $$,
  '22023', 'DASHBOARD_RECENT_LIMIT_INVALID',
  '12 recent limit eleven is rejected'
);
select throws_ok(
  $$ select public.get_dashboard_overview(null) $$,
  '22023', 'DASHBOARD_RECENT_LIMIT_INVALID',
  '13 null recent limit is rejected'
);
select is(
  public.get_dashboard_overview()->>'schema_version',
  '1',
  '14 response schema version is one'
);
select is(
  public.get_dashboard_overview()->'counts'->>'total_posts',
  '3',
  '15 total post count includes only the owner rows'
);
select is(
  public.get_dashboard_overview()->'counts'->>'ready_posts',
  '1',
  '16 ready post count uses the canonical ready status'
);
select is(
  public.get_dashboard_overview()->'counts'->>'active_news_topics',
  '1',
  '17 active topic count uses the canonical active status'
);
select is(
  public.get_dashboard_overview()->'counts'->>'pending_news_followups',
  '1',
  '18 pending follow-up count uses the canonical pending status'
);
select is(
  (public.get_dashboard_overview()->'recent_posts') @> '[{"title":"타인 글"}]'::jsonb,
  false,
  '19 another owner recent post is excluded'
);
select is(
  (public.get_dashboard_overview()->'recent_prompt_runs') @> '[{"id":"5e400000-0000-0000-0000-000000000003"}]'::jsonb,
  false,
  '20 another owner recent prompt is excluded'
);
select ok(
  (public.get_dashboard_overview()->'category_counts') @> '[{"category_id":"technology","post_count":0}]'::jsonb,
  '21 enabled zero-count categories are included'
);
select results_eq(
  $$ select value->>'category_id' from jsonb_array_elements(public.get_dashboard_overview()->'category_counts') with ordinality $$,
  $$ select id from public.categories where enabled order by sort_order, id $$,
  '22 categories use deterministic canonical ordering'
);
select is(
  jsonb_array_length(public.get_dashboard_overview(1)->'recent_posts'),
  1,
  '23 recent posts obey the requested limit'
);
select is(
  public.get_dashboard_overview(1)->'recent_posts'->0->>'title',
  '가장 최근 글',
  '24 recent posts use updated time descending'
);
select is(
  jsonb_array_length(public.get_dashboard_overview(1)->'recent_prompt_runs'),
  1,
  '25 recent prompt runs obey the requested limit'
);
select is(
  public.get_dashboard_overview(1)->'recent_prompt_runs'->0->>'id',
  '5e400000-0000-0000-0000-000000000002',
  '26 recent prompt runs use generated time descending'
);
select ok(
  not (public.get_dashboard_overview()::text ~ '"owner_id"'),
  '27 owner identifiers are absent'
);
select ok(
  not (public.get_dashboard_overview()::text ~ '"html_body"'),
  '28 HTML bodies are absent'
);
select ok(
  not (public.get_dashboard_overview()::text ~ '"prompt_text"|"context_snapshot"'),
  '29 prompt and context bodies are absent'
);
select is(
  jsonb_typeof(public.get_dashboard_overview()->'category_counts'),
  'array',
  '30 category counts are an array'
);
select is(
  jsonb_typeof(public.get_dashboard_overview()->'recent_posts'),
  'array',
  '31 recent posts are an array'
);
select is(
  jsonb_typeof(public.get_dashboard_overview()->'recent_prompt_runs'),
  'array',
  '32 recent prompt runs are an array'
);

reset role;
select is(
  (select count(*)::bigint from public.posts),
  (
    select posts_count
    from pg_temp.dashboard_physical_count_baseline
  ),
  '33 dashboard reads do not mutate posts'
);
select is(
  (select count(*)::bigint from public.generated_prompts),
  (
    select prompts_count
    from pg_temp.dashboard_physical_count_baseline
  ),
  '34 dashboard reads do not mutate prompt runs'
);

set local role authenticated;
set local "request.jwt.claims" = '{"role":"authenticated"}';
select throws_ok(
  $$ select public.get_dashboard_overview() $$,
  '42501', 'DASHBOARD_AUTH_REQUIRED',
  '35 an authenticated role without auth uid is rejected'
);

set local role anon;
set local "request.jwt.claims" = '{"role":"anon"}';
select throws_ok(
  $$ select public.get_dashboard_overview() $$,
  '42501', null::text,
  '36 anon execution is denied'
);

select * from finish();
rollback;
