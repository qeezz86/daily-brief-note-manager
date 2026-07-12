begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-000000003f01', 'followup-owner@example.test'),
 ('00000000-0000-0000-0000-000000003f02', 'followup-other@example.test');
insert into public.news_topics (id, owner_id, category_id, topic_key, canonical_title, status, first_seen_at, last_seen_at) values
 ('3f100000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000003f01','economy','active','Active','active','2026-07-01','2026-07-01'),
 ('3f100000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000003f01','economy','monitoring','Monitoring','monitoring','2026-07-01','2026-07-01'),
 ('3f100000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000003f01','economy','reopen','Reopen','active','2026-07-01','2026-07-01'),
 ('3f100000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000003f01','economy','closed','Closed','active','2026-07-01','2026-07-01'),
 ('3f100000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000003f01','economy','close-pending','Close pending','active','2026-07-01','2026-07-01'),
 ('3f100000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000003f02','economy','other','Other','active','2026-07-01','2026-07-01');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000003f01","role":"authenticated"}';
select public.transition_news_topic_status('3f100000-0000-0000-0000-000000000003','closed','종료');
select public.transition_news_topic_status('3f100000-0000-0000-0000-000000000003','reopened','재개');
select public.transition_news_topic_status('3f100000-0000-0000-0000-000000000004','closed','종료');

select lives_ok($$ select public.create_news_followup('3f100000-0000-0000-0000-000000000001','Active check',current_date - 1,'high') $$,'active topic accepts followup');
select lives_ok($$ select public.create_news_followup('3f100000-0000-0000-0000-000000000002','Monitoring check',current_date,'normal') $$,'monitoring topic accepts followup');
select lives_ok($$ select public.create_news_followup('3f100000-0000-0000-0000-000000000003','Reopened check',null,'low') $$,'reopened topic accepts followup');
select throws_ok($$ select public.create_news_followup('3f100000-0000-0000-0000-000000000004','Closed check',null,'normal') $$,'22023',null::text,'closed topic rejects followup');

reset role;
alter table public.news_topics disable trigger news_topics_validate_category;
alter table public.news_topics disable trigger news_topics_validate_initial_state;
insert into public.news_topics (id, owner_id, category_id, topic_key, canonical_title, status, first_seen_at, last_seen_at)
values ('3f100000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000003f01','ai-column','non-news','Non news','active','2026-07-01','2026-07-01');
alter table public.news_topics enable trigger news_topics_validate_category;
alter table public.news_topics enable trigger news_topics_validate_initial_state;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000003f01","role":"authenticated"}';
select throws_ok($$ select public.create_news_followup('3f100000-0000-0000-0000-000000000007','Non news',null,'normal') $$,'23514',null::text,'non-news topic rejects followup');
select throws_ok($$ select public.create_news_followup('3f100000-0000-0000-0000-000000000006','Other',null,'normal') $$,'42501',null::text,'other owner topic rejects followup');
select throws_ok($$ select public.create_news_followup('3f100000-0000-0000-0000-000000000001','  ',null,'normal') $$,'22023',null::text,'check text is required');
select throws_ok($$ select public.create_news_followup('3f100000-0000-0000-0000-000000000001','Bad priority',null,'urgent') $$,'22023',null::text,'invalid priority is rejected');
select is((select status from public.news_followups where check_text='Active check'),'pending','created status is pending');
select ok((select resolution_note is null and resolved_at is null from public.news_followups where check_text='Active check'),'created resolution fields are null');
select public.create_news_followup('3f100000-0000-0000-0000-000000000001','Overdue pending',(now() at time zone 'Asia/Seoul')::date - 1,'normal');
select public.create_news_followup('3f100000-0000-0000-0000-000000000001','Today pending',(now() at time zone 'Asia/Seoul')::date,'normal');

select lives_ok($$ select public.update_news_followup((select id from public.news_followups where check_text='Monitoring check'),'Monitoring edited',current_date + 1,'high') $$,'pending followup updates');
select public.resolve_news_followup((select id from public.news_followups where check_text='Active check'),'done','Done note');
select throws_ok($$ select public.update_news_followup((select id from public.news_followups where check_text='Active check'),'No',null,'normal') $$,'22023',null::text,'done followup cannot update');
select public.resolve_news_followup((select id from public.news_followups where check_text='Reopened check'),'cancelled','Cancel note');
select throws_ok($$ select public.update_news_followup((select id from public.news_followups where check_text='Reopened check'),'No',null,'normal') $$,'22023',null::text,'cancelled followup cannot update');
select public.create_news_followup('3f100000-0000-0000-0000-000000000005','Closed pending',null,'normal');
select public.transition_news_topic_status('3f100000-0000-0000-0000-000000000005','closed','종료');
select throws_ok($$ select public.update_news_followup((select id from public.news_followups where check_text='Closed pending'),'No',null,'normal') $$,'22023',null::text,'closed topic pending followup cannot update');
select results_eq($$ select topic_id,status from public.news_followups where check_text='Monitoring edited' $$,$$ values ('3f100000-0000-0000-0000-000000000002'::uuid,'pending'::text) $$,'update preserves topic and status');
select throws_ok($$ update public.news_followups set status='done' where check_text='Monitoring edited' $$,'42501',null::text,'status cannot change directly');
select throws_ok($$ select public.update_news_followup('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Other',null,'normal') $$,'42501',null::text,'other or missing followup cannot update');

select ok((select status='done' from public.news_followups where check_text='Active check'),'pending resolves to done');
select is((select resolution_note from public.news_followups where check_text='Active check'),'Done note','done stores note');
select ok((select resolved_at is not null from public.news_followups where check_text='Active check'),'done sets resolved time');
select ok((select status='cancelled' from public.news_followups where check_text='Reopened check'),'pending resolves to cancelled');
select is((select resolution_note from public.news_followups where check_text='Reopened check'),'Cancel note','cancelled stores reason');
select ok((select resolved_at is not null from public.news_followups where check_text='Reopened check'),'cancelled sets resolved time');
select throws_ok($$ select public.resolve_news_followup((select id from public.news_followups where check_text='Monitoring edited'),'done','  ') $$,'22023',null::text,'resolution note is required');
select throws_ok($$ select public.resolve_news_followup((select id from public.news_followups where check_text='Monitoring edited'),'pending','No') $$,'22023',null::text,'pending target is rejected');
select throws_ok($$ select public.resolve_news_followup((select id from public.news_followups where check_text='Active check'),'done','Again') $$,'22023',null::text,'done cannot resolve again');
select throws_ok($$ select public.resolve_news_followup((select id from public.news_followups where check_text='Reopened check'),'cancelled','Again') $$,'22023',null::text,'cancelled cannot resolve again');
select throws_ok($$ select public.resolve_news_followup('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','done','Other') $$,'42501',null::text,'other or missing followup cannot resolve');
select ok((select status='pending' and resolution_note is null and resolved_at is null from public.news_followups where check_text='Monitoring edited'),'failed resolve leaves fields unchanged');

set local role anon; set local "request.jwt.claims" = '{"role":"anon"}';
select throws_ok($$ select public.create_news_followup('3f100000-0000-0000-0000-000000000001','Anon',null,'normal') $$,'42501',null::text,'anon cannot create');
select throws_ok($$ select public.update_news_followup('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Anon',null,'normal') $$,'42501',null::text,'anon cannot update');
select throws_ok($$ select public.resolve_news_followup('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','done','Anon') $$,'42501',null::text,'anon cannot resolve');
set local role authenticated; set local "request.jwt.claims" = '{"role":"authenticated"}';
select throws_ok($$ select public.create_news_followup('3f100000-0000-0000-0000-000000000001','No uid',null,'normal') $$,'42501',null::text,'missing auth uid is rejected');
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000003f01","role":"authenticated"}';
select throws_ok($$ insert into public.news_followups(owner_id,topic_id,check_text) values('00000000-0000-0000-0000-000000003f01','3f100000-0000-0000-0000-000000000001','Direct') $$,'42501',null::text,'direct insert denied');
select throws_ok($$ update public.news_followups set check_text='Direct' where check_text='Monitoring edited' $$,'42501',null::text,'direct update denied');
select throws_ok($$ delete from public.news_followups where check_text='Monitoring edited' $$,'42501',null::text,'direct delete denied');
select ok((select count(*) > 0 from public.news_followups),'owner selects own followups');
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000003f02","role":"authenticated"}';
select is((select count(*)::integer from public.news_followups),0,'other owner cannot select followups');
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000003f01","role":"authenticated"}';
select ok((select status='pending' and due_date < (now() at time zone 'Asia/Seoul')::date from public.news_followups where check_text='Overdue pending'),'past pending is overdue');
select ok((select status='pending' and due_date < (now() at time zone 'Asia/Seoul')::date from public.news_followups where check_text='Today pending') is false,'today is not overdue');
select ok((select not (status='pending' and due_date < (now() at time zone 'Asia/Seoul')::date) from public.news_followups where check_text='Active check'),'done past due is not overdue');
select ok((select not (status='pending' and due_date < (now() at time zone 'Asia/Seoul')::date) from public.news_followups where check_text='Reopened check'),'cancelled is not overdue');

select * from finish();
rollback;
