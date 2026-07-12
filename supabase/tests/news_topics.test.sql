begin;

create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000003a1', 'topic-owner@example.test'),
  ('00000000-0000-0000-0000-0000000003b1', 'topic-other@example.test');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000003a1","role":"authenticated"}';

select lives_ok($$
  insert into public.news_topics (id, owner_id, category_id, topic_key, canonical_title, first_seen_at, last_seen_at)
  values ('83000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000003a1', 'economy', 'rate-outlook', '금리 전망', '2026-07-01', '2026-07-02')
$$, 'owner creates a news topic');

select throws_ok($$
  insert into public.news_topics (owner_id, category_id, topic_key, canonical_title, first_seen_at, last_seen_at)
  values ('00000000-0000-0000-0000-0000000003a1', 'ai-column', 'not-news', 'Not news', '2026-07-01', '2026-07-01')
$$, '23514', null::text, 'non-news categories are rejected');

select throws_ok($$
  insert into public.news_topics (owner_id, category_id, topic_key, canonical_title, first_seen_at, last_seen_at)
  values ('00000000-0000-0000-0000-0000000003a1', 'economy', 'RATE-OUTLOOK', 'Duplicate', '2026-07-01', '2026-07-01')
$$, '23505', null::text, 'topic keys are unique after case normalization');

select lives_ok($$
  insert into public.news_topics (id, owner_id, category_id, topic_key, canonical_title, first_seen_at, last_seen_at)
  values ('83000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000003a1', 'global', 'rate-outlook', '국제 금리', '2026-07-01', '2026-07-01')
$$, 'the same topic key is allowed in another category');

set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000003b1","role":"authenticated"}';
select lives_ok($$
  insert into public.news_topics (id, owner_id, category_id, topic_key, canonical_title, first_seen_at, last_seen_at)
  values ('83000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000003b1', 'economy', 'rate-outlook', 'Other owner', '2026-07-01', '2026-07-01')
$$, 'the same topic key is allowed for another owner');

set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000003a1","role":"authenticated"}';
select throws_ok($$
  insert into public.news_topics (owner_id, category_id, topic_key, canonical_title, first_seen_at, last_seen_at)
  values ('00000000-0000-0000-0000-0000000003a1', 'economy', 'bad-date', 'Bad date', '2026-07-02', '2026-07-01')
$$, '23514', null::text, 'last seen cannot precede first seen');

select lives_ok($$
  update public.news_topics set canonical_title = '금리 전망 수정', topic_summary = ' 요약 ', last_seen_at = '2026-07-03'
  where id = '83000000-0000-0000-0000-000000000001'
$$, 'owner updates editable topic fields');

select results_eq($$
  update public.news_topics set canonical_title = 'Forbidden'
  where id = '83000000-0000-0000-0000-000000000003' returning id
$$, $$ values (null::uuid) limit 0 $$, 'another owner topic is not updated');

select lives_ok($$ select public.transition_news_topic_status('83000000-0000-0000-0000-000000000001', 'monitoring', '관찰') $$, 'active transitions to monitoring');

insert into public.news_topics (id, owner_id, category_id, topic_key, canonical_title, first_seen_at, last_seen_at) values
  ('83000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000003a1', 'economy', 'close-topic', 'Close topic', '2026-07-01', '2026-07-01'),
  ('83000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000003a1', 'economy', 'active-topic', 'Active topic', '2026-07-01', '2026-07-01'),
  ('83000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000003a1', 'economy', 'rollback-topic', 'Rollback topic', '2026-07-01', '2026-07-01');

select lives_ok($$ select public.transition_news_topic_status('83000000-0000-0000-0000-000000000004', 'closed', '종료 확인') $$, 'active transitions to closed');
select throws_ok($$ select public.transition_news_topic_status('83000000-0000-0000-0000-000000000005', 'closed', '  ') $$, '22023', null::text, 'closed transition requires a reason');
select lives_ok($$ select public.transition_news_topic_status('83000000-0000-0000-0000-000000000004', 'reopened', '새 진전') $$, 'closed transitions to reopened');
select throws_ok($$ select public.transition_news_topic_status('83000000-0000-0000-0000-000000000005', 'reopened', 'invalid') $$, '22023', null::text, 'invalid transitions are rejected');
select throws_ok($$ select public.transition_news_topic_status('83000000-0000-0000-0000-000000000005', 'active', null) $$, '22023', null::text, 'unchanged status is rejected');
select is((select count(*)::integer from public.news_status_history where topic_id = '83000000-0000-0000-0000-000000000001'), 1, 'successful transition creates history');
select results_eq($$ select from_status, to_status from public.news_status_history where topic_id = '83000000-0000-0000-0000-000000000001' $$, $$ values ('active'::text, 'monitoring'::text) $$, 'history stores exact from and to statuses');

reset role;
create function public.reject_topic_history_test() returns trigger language plpgsql set search_path = '' as $$ begin if new.reason = 'force-rollback' then raise exception 'forced history failure'; end if; return new; end $$;
create trigger reject_topic_history_test before insert on public.news_status_history for each row execute function public.reject_topic_history_test();
create function public.topic_transition_rolls_back_test() returns boolean language plpgsql set search_path = '' as $$
declare before_count integer; after_count integer; saved_status text;
begin
  select count(*) into before_count from public.news_status_history where topic_id = '83000000-0000-0000-0000-000000000006';
  begin perform public.transition_news_topic_status('83000000-0000-0000-0000-000000000006', 'monitoring', 'force-rollback'); exception when others then null; end;
  select status into saved_status from public.news_topics where id = '83000000-0000-0000-0000-000000000006';
  select count(*) into after_count from public.news_status_history where topic_id = '83000000-0000-0000-0000-000000000006';
  return saved_status = 'active' and before_count = after_count;
end $$;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000003a1","role":"authenticated"}';
select ok(public.topic_transition_rolls_back_test(), 'history failure rolls back topic and history');
select throws_ok($$ select public.transition_news_topic_status('83000000-0000-0000-0000-000000000003', 'monitoring', null) $$, '42501', null::text, 'another owner cannot transition a topic');

set local role anon;
set local "request.jwt.claims" = '{"role":"anon"}';
select throws_ok($$ select public.transition_news_topic_status('83000000-0000-0000-0000-000000000001', 'closed', 'x') $$, '42501', null::text, 'anonymous callers cannot execute the RPC');

set local role authenticated;
set local "request.jwt.claims" = '{"role":"authenticated"}';
select throws_ok($$ select public.transition_news_topic_status('83000000-0000-0000-0000-000000000001', 'closed', 'x') $$, '42501', null::text, 'missing auth uid is rejected');

set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000003a1","role":"authenticated"}';
select is((select bool_and(history.owner_id = topic.owner_id) from public.news_status_history history join public.news_topics topic on topic.id = history.topic_id), true, 'history owner always matches topic owner');

reset role;
alter table public.news_topics disable trigger news_topics_validate_category;
alter table public.news_topics disable trigger news_topics_validate_initial_state;
insert into public.news_topics (id, owner_id, category_id, topic_key, canonical_title, first_seen_at, last_seen_at)
values ('83000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-0000000003a1', 'ai-column', 'invalid-category', 'Invalid category', '2026-07-01', '2026-07-01');
alter table public.news_topics enable trigger news_topics_validate_category;
alter table public.news_topics enable trigger news_topics_validate_initial_state;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000003a1","role":"authenticated"}';
select throws_ok($$ select public.transition_news_topic_status('83000000-0000-0000-0000-000000000007', 'monitoring', null) $$, '23514', null::text, 'non-news topic transition is rejected');

select * from finish();
rollback;
