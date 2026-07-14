begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000003b01', 'prompt-owner@example.test'),
  ('00000000-0000-0000-0000-000000003b02', 'prompt-other@example.test');

insert into public.posts (
  id, owner_id, category_id, briefing_date, published_on, display_id, title,
  summary, html_body, slug, content_status, source_import_type
)
select
  ('3b100000-0000-0000-0000-' || lpad(day_no::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000003b01', 'economy',
  date '2026-07-06' + day_no, date '2026-07-06' + day_no,
  '#2026-07-' || lpad((6 + day_no)::text, 2, '0') || '-ECO',
  '브리핑 ' || day_no, '요약 ' || day_no, '<div><h1>제목</h1></div>',
  'prompt-post-' || day_no, 'published', 'manual_entry'
from generate_series(1, 6) as day_no;

insert into public.posts (id, owner_id, category_id, briefing_date, published_on, title, summary, html_body, slug, content_status, source_import_type) values
  ('3b100000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000003b01','economy','2026-07-13','2026-07-13','보관 글','요약','<div><h1>제목</h1></div>','prompt-archived','archived','manual_entry'),
  ('3b100000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000003b01','economy','2026-07-14','2026-07-14','미래 글','요약','<div><h1>제목</h1></div>','prompt-future','published','manual_entry'),
  ('3b100000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000003b02','economy','2026-07-13','2026-07-13','타인 글','요약','<div><h1>제목</h1></div>','prompt-other','published','manual_entry');

insert into public.news_topics (id, owner_id, category_id, topic_key, canonical_title, topic_summary, status, first_seen_at, last_seen_at) values
  ('3b200000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000003b01','economy','active-topic','활성 주제','활성 요약','active','2026-07-01 00:00+09','2026-07-12 00:00+09'),
  ('3b200000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000003b01','economy','monitoring-topic','모니터링 주제','모니터링 요약','monitoring','2026-07-01 00:00+09','2026-07-11 00:00+09'),
  ('3b200000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000003b01','economy','reopened-topic','재개 주제','재개 요약','active','2026-07-01 00:00+09','2026-07-10 00:00+09'),
  ('3b200000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000003b01','economy','closed-topic','종료 주제','종료 요약','active','2026-07-01 00:00+09','2026-07-10 00:00+09'),
  ('3b200000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000003b02','economy','other-topic','타인 주제','타인 요약','active','2026-07-01 00:00+09','2026-07-12 00:00+09');

alter table public.news_topics disable trigger news_topics_normalize_edit;
update public.news_topics set status = 'reopened', closed_reason = '이전 종료' where id = '3b200000-0000-0000-0000-000000000003';
update public.news_topics set status = 'closed', closed_reason = '공식 종료' where id = '3b200000-0000-0000-0000-000000000004';
alter table public.news_topics enable trigger news_topics_normalize_edit;

insert into public.news_status_history (id, owner_id, topic_id, from_status, to_status, reason, changed_at) values
  ('3b300000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000003b01','3b200000-0000-0000-0000-000000000003','active','closed','이전 종료','2026-07-08 12:00+09'),
  ('3b300000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000003b01','3b200000-0000-0000-0000-000000000003','closed','reopened','새 발표','2026-07-09 12:00+09'),
  ('3b300000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000003b01','3b200000-0000-0000-0000-000000000004','active','closed','공식 종료','2026-07-10 12:00+09');

insert into public.news_updates (id, owner_id, post_id, topic_id, item_order, update_type, headline, fact_summary) values
  ('3b400000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000003b01','3b100000-0000-0000-0000-000000000006','3b200000-0000-0000-0000-000000000001',2,'new','두 번째 항목','두 번째 사실'),
  ('3b400000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000003b01','3b100000-0000-0000-0000-000000000006','3b200000-0000-0000-0000-000000000002',1,'new','첫 번째 항목','첫 번째 사실'),
  ('3b400000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000003b02','3b100000-0000-0000-0000-000000000009','3b200000-0000-0000-0000-000000000005',1,'new','타인 항목','타인 사실');

insert into public.news_followups (id, owner_id, topic_id, check_text, status, due_date, priority, resolution_note, resolved_at, created_at, updated_at) values
  ('3b500000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000003b01','3b200000-0000-0000-0000-000000000001','마감 초과 확인','pending','2026-07-12','normal',null,null,'2026-07-11 09:00+09','2026-07-11 09:00+09'),
  ('3b500000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000003b01','3b200000-0000-0000-0000-000000000001','완료 확인','done','2026-07-12','high','완료','2026-07-12 12:00+09','2026-07-11 09:00+09','2026-07-12 12:00+09'),
  ('3b500000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000003b01','3b200000-0000-0000-0000-000000000002','취소 확인','cancelled',null,'low','취소','2026-07-12 12:00+09','2026-07-11 09:00+09','2026-07-12 12:00+09'),
  ('3b500000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000003b02','3b200000-0000-0000-0000-000000000005','타인 확인','pending',null,'high',null,null,'2026-07-11 09:00+09','2026-07-11 09:00+09');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000003b01","role":"authenticated"}';

select lives_ok($$ select public.get_news_briefing_prompt_context('economy','2026-07-13',5,90,20) $$, 'owner news context succeeds');
select throws_ok($$ select public.get_news_briefing_prompt_context('ai-column','2026-07-13',5,90,20) $$, '22023', null::text, 'non-news category rejected');
select throws_ok($$ select public.get_news_briefing_prompt_context('missing','2026-07-13',5,90,20) $$, '22023', null::text, 'missing category rejected');
select is((public.get_news_briefing_prompt_context('economy','2026-07-13',5,90,20)->'recentPosts') @> '[{"title":"타인 글"}]'::jsonb, false, 'other owner post excluded');
select is((public.get_news_briefing_prompt_context('economy','2026-07-13',5,90,20)->'openTopics') @> '[{"topicKey":"other-topic"}]'::jsonb, false, 'other owner topic excluded');
select is((public.get_news_briefing_prompt_context('economy','2026-07-13',5,90,20)->'pendingFollowups') @> '[{"checkText":"타인 확인"}]'::jsonb, false, 'other owner followup excluded');
select is(jsonb_array_length(public.get_news_briefing_prompt_context('economy','2026-07-13',5,90,20)->'recentPosts'), 5, 'recent posts limited to five');
select results_eq($$ select value->>'publishedOn' from jsonb_array_elements(public.get_news_briefing_prompt_context('economy','2026-07-13',5,90,20)->'recentPosts') with ordinality $$, $$ values ('2026-07-12'),('2026-07-11'),('2026-07-10'),('2026-07-09'),('2026-07-08') $$, 'recent posts newest first');
select results_eq($$ select value->>'headline' from jsonb_array_elements(public.get_news_briefing_prompt_context('economy','2026-07-13',5,90,20)->'recentPosts'->0->'updates') $$, $$ values ('첫 번째 항목'),('두 번째 항목') $$, 'post updates use item order');
select is((public.get_news_briefing_prompt_context('economy','2026-07-13',5,90,20)->'recentPosts') @> '[{"title":"보관 글"}]'::jsonb, false, 'archived post excluded');
select is((public.get_news_briefing_prompt_context('economy','2026-07-13',5,90,20)->'recentPosts') @> '[{"title":"미래 글"}]'::jsonb, false, 'future post excluded');
select ok((public.get_news_briefing_prompt_context('economy','2026-07-13',5,90,20)->'openTopics') @> '[{"status":"active"}]'::jsonb, 'active topic included');
select ok((public.get_news_briefing_prompt_context('economy','2026-07-13',5,90,20)->'openTopics') @> '[{"status":"monitoring"}]'::jsonb, 'monitoring topic included');
select ok((public.get_news_briefing_prompt_context('economy','2026-07-13',5,90,20)->'openTopics') @> '[{"status":"reopened"}]'::jsonb, 'reopened topic included');
select is((public.get_news_briefing_prompt_context('economy','2026-07-13',5,90,20)->'openTopics') @> '[{"topicKey":"closed-topic"}]'::jsonb, false, 'closed topic excluded from open list');
select ok((public.get_news_briefing_prompt_context('economy','2026-07-13',5,90,20)->'pendingFollowups') @> '[{"checkText":"마감 초과 확인"}]'::jsonb, 'pending followup included');
select is((public.get_news_briefing_prompt_context('economy','2026-07-13',5,90,20)->'pendingFollowups') @> '[{"checkText":"완료 확인"}]'::jsonb, false, 'done followup excluded');
select is((public.get_news_briefing_prompt_context('economy','2026-07-13',5,90,20)->'pendingFollowups') @> '[{"checkText":"취소 확인"}]'::jsonb, false, 'cancelled followup excluded');
select is(public.get_news_briefing_prompt_context('economy','2026-07-13',5,90,20)->'pendingFollowups'->0->>'overdue', 'true', 'overdue computed from reference date');
select ok((public.get_news_briefing_prompt_context('economy','2026-07-13',5,90,20)->'recentClosedTopics') @> '[{"topicKey":"closed-topic"}]'::jsonb, 'recent closed topic included');
select is((public.get_news_briefing_prompt_context('economy','2026-07-13',5,90,20)->'recentClosedTopics') @> '[{"topicKey":"reopened-topic"}]'::jsonb, false, 'reopened topic excluded from closed list');
select throws_ok($$ select public.get_news_briefing_prompt_context('economy','2026-07-13',5,181,20) $$, '22023', null::text, 'lookback over 180 rejected');
select throws_ok($$ select public.get_news_briefing_prompt_context('economy','2026-07-13',5,90,21) $$, '22023', null::text, 'closed limit over 20 rejected');
set local role anon; set local "request.jwt.claims" = '{"role":"anon"}';
select throws_ok($$ select public.get_news_briefing_prompt_context('economy','2026-07-13',5,90,20) $$, '42501', null::text, 'anon cannot execute');
set local role authenticated; set local "request.jwt.claims" = '{"role":"authenticated"}';
select throws_ok($$ select public.get_news_briefing_prompt_context('economy','2026-07-13',5,90,20) $$, '42501', null::text, 'missing auth uid rejected');
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000003b01","role":"authenticated"}';
select is(public.get_news_briefing_prompt_context('economy','2026-07-13',5,90,20)->>'schemaVersion', '1', 'schema version is one');
select ok((select (value->>'recentPosts')::integer = jsonb_array_length(context->'recentPosts') and (value->>'recentUpdates')::integer = 2 and (value->>'openTopics')::integer = jsonb_array_length(context->'openTopics') and (value->>'pendingFollowups')::integer = jsonb_array_length(context->'pendingFollowups') and (value->>'recentClosedTopics')::integer = jsonb_array_length(context->'recentClosedTopics') from (select public.get_news_briefing_prompt_context('economy','2026-07-13',5,90,20) context) source cross join lateral (select source.context->'counts' value) counts), 'counts match returned arrays');

select * from finish();
rollback;
