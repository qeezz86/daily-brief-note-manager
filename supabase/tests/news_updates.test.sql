begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-000000003a21', 'updates-owner@example.test'),
 ('00000000-0000-0000-0000-000000003a22', 'updates-other@example.test');
insert into public.posts (id, owner_id, category_id, briefing_date, display_id, title, summary, slug, source_import_type, series_no) values
 ('3a200000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000003a21','economy','2026-07-10','#ECO-1','경제 1','요약','eco-1','manual_entry',null),
 ('3a200000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000003a21','economy','2026-07-11','#ECO-2','경제 2','요약','eco-2','manual_entry',null),
 ('3a200000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000003a21','global','2026-07-11','#GLO-1','국제','요약','glo-1','manual_entry',null),
 ('3a200000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000003a21','ai-column',null,'AI-1','AI','요약','ai-1','manual_entry',1),
 ('3a200000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000003a22','economy','2026-07-10','#OTHER','타인','요약','other','manual_entry',null);
insert into public.news_topics (id, owner_id, category_id, topic_key, canonical_title, first_seen_at, last_seen_at) values
 ('3a210000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000003a21','economy','rates','금리','2026-07-01','2026-07-10'),
 ('3a210000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000003a21','economy','prices','물가','2026-07-01','2026-07-10'),
 ('3a210000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000003a21','global','trade','무역','2026-07-01','2026-07-10'),
 ('3a210000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000003a22','economy','other','타인','2026-07-01','2026-07-10');
insert into public.sources (id, owner_id, post_id, source_name, source_title, source_url, checked_point, sort_order)
select ('3a220000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid, '00000000-0000-0000-0000-000000003a21',
 case when n=9 then '3a200000-0000-0000-0000-000000000002'::uuid else '3a200000-0000-0000-0000-000000000001'::uuid end,
 '기관 '||n, '자료 '||n, 'https://example.com/'||n, '확인 '||n, n
from generate_series(1,14) n;
insert into public.sources (id, owner_id, post_id, source_name, source_title, source_url, checked_point, sort_order) values
 ('3a220000-0000-0000-0000-000000000099','00000000-0000-0000-0000-000000003a22','3a200000-0000-0000-0000-000000000005','타인','타인 자료','https://example.com/other','확인',0);

select has_index('public','news_updates','news_updates_post_item_order_key','post order unique index exists');
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000003a21","role":"authenticated"}';
select lives_ok($$ select public.create_news_update('3a200000-0000-0000-0000-000000000001','3a210000-0000-0000-0000-000000000001','new','첫 발표','기준금리가 발표됐다',null,null,null,null,array['3a220000-0000-0000-0000-000000000001']::uuid[]) $$,'owner creates new update');
select is((select item_order from public.news_updates where headline='첫 발표'),1,'first order is one');
select ok((select news_update_id is not null from public.sources where id='3a220000-0000-0000-0000-000000000001'),'source is linked');
select throws_ok($$ select public.create_news_update('3a200000-0000-0000-0000-000000000001','3a210000-0000-0000-0000-000000000001','new','잘못','사실',null,null,null,(select id from public.news_updates where headline='첫 발표'),array['3a220000-0000-0000-0000-000000000002']::uuid[]) $$,'22023',null::text,'new rejects previous');
select throws_ok($$ select public.create_news_update('3a200000-0000-0000-0000-000000000001','3a210000-0000-0000-0000-000000000001','follow_up','후속','사실',null,null,'변화',null,array['3a220000-0000-0000-0000-000000000002']::uuid[]) $$,'22023',null::text,'follow up requires previous');
select throws_ok($$ select public.create_news_update('3a200000-0000-0000-0000-000000000001','3a210000-0000-0000-0000-000000000001','correction','정정','사실',null,null,'변화',null,array['3a220000-0000-0000-0000-000000000002']::uuid[]) $$,'22023',null::text,'correction requires previous');
select throws_ok($$ select public.create_news_update('3a200000-0000-0000-0000-000000000001','3a210000-0000-0000-0000-000000000001','follow_up','후속','사실',null,null,null,(select id from public.news_updates where headline='첫 발표'),array['3a220000-0000-0000-0000-000000000002']::uuid[]) $$,'22023',null::text,'follow up requires change');
select throws_ok($$ select public.create_news_update('3a200000-0000-0000-0000-000000000001','3a210000-0000-0000-0000-000000000001','closure_note','종료','사실',null,null,'종료',(select id from public.news_updates where headline='첫 발표'),array['3a220000-0000-0000-0000-000000000002']::uuid[]) $$,'22023',null::text,'closure requires closed topic');
select lives_ok($$ select public.create_news_update('3a200000-0000-0000-0000-000000000001','3a210000-0000-0000-0000-000000000001','follow_up','후속 발표','새 수치가 발표됐다',null,null,'수치 변경',(select id from public.news_updates where headline='첫 발표'),array['3a220000-0000-0000-0000-000000000002']::uuid[]) $$,'follow up succeeds');
select is((select item_order from public.news_updates where headline='후속 발표'),2,'order increments');
select is((select previous_update_id from public.news_updates where headline='후속 발표'),(select id from public.news_updates where headline='첫 발표'),'same-topic previous stored');
select ok((select previous_update_id is not null from public.news_updates where headline='후속 발표'),'previous relation exists');
select throws_ok($$ select public.create_news_update('3a200000-0000-0000-0000-000000000001','3a210000-0000-0000-0000-000000000002','follow_up','다른 주제','사실',null,null,'변화',(select id from public.news_updates where headline='첫 발표'),array['3a220000-0000-0000-0000-000000000003']::uuid[]) $$,'23514',null::text,'different topic previous rejected');
select throws_ok($$ select public.create_news_update('3a200000-0000-0000-0000-000000000001','3a210000-0000-0000-0000-000000000001','new','다른 글 출처','사실',null,null,null,null,array['3a220000-0000-0000-0000-000000000009']::uuid[]) $$,'23514',null::text,'different post source rejected');
select throws_ok($$ select public.create_news_update('3a200000-0000-0000-0000-000000000001','3a210000-0000-0000-0000-000000000001','new','타인 출처','사실',null,null,null,null,array['3a220000-0000-0000-0000-000000000099']::uuid[]) $$,'23514',null::text,'other owner source rejected');
select throws_ok($$ select public.create_news_update('3a200000-0000-0000-0000-000000000001','3a210000-0000-0000-0000-000000000001','new','출처 탈취','사실',null,null,null,null,array['3a220000-0000-0000-0000-000000000001']::uuid[]) $$,'23514',null::text,'claimed source cannot be stolen');
select throws_ok($$ select public.create_news_update('3a200000-0000-0000-0000-000000000001','3a210000-0000-0000-0000-000000000001','new','출처 없음','사실',null,null,null,null,'{}'::uuid[]) $$,'22023',null::text,'source required');
select throws_ok($$ select public.create_news_update('3a200000-0000-0000-0000-000000000003','3a210000-0000-0000-0000-000000000001','new','불일치','사실',null,null,null,null,array['3a220000-0000-0000-0000-000000000003']::uuid[]) $$,'23514',null::text,'category mismatch rejected');
select throws_ok($$ select public.create_news_update('3a200000-0000-0000-0000-000000000004','3a210000-0000-0000-0000-000000000001','new','비뉴스','사실',null,null,null,null,array['3a220000-0000-0000-0000-000000000003']::uuid[]) $$,'23514',null::text,'non-news post rejected');
select throws_ok($$ select public.create_news_update('3a200000-0000-0000-0000-000000000005','3a210000-0000-0000-0000-000000000001','new','타인 글','사실',null,null,null,null,array['3a220000-0000-0000-0000-000000000003']::uuid[]) $$,'42501',null::text,'other owner post rejected');
select throws_ok($$ select public.create_news_update('3a200000-0000-0000-0000-000000000001','3a210000-0000-0000-0000-000000000004','new','타인 주제','사실',null,null,null,null,array['3a220000-0000-0000-0000-000000000003']::uuid[]) $$,'42501',null::text,'other owner topic rejected');
select lives_ok($$ select public.transition_news_topic_status('3a210000-0000-0000-0000-000000000001','closed','종료') $$,'topic closes');
select lives_ok($$ select public.create_news_update('3a200000-0000-0000-0000-000000000001','3a210000-0000-0000-0000-000000000001','closure_note','종료 메모','종료 확인',null,null,'추적 종료',(select id from public.news_updates where headline='후속 발표'),array['3a220000-0000-0000-0000-000000000003']::uuid[]) $$,'closed topic accepts closure note');
select is((select item_order from public.news_updates where headline='종료 메모'),3,'closure order increments');
select lives_ok($$ select public.update_news_update((select id from public.news_updates where headline='후속 발표'),'후속 수정','수정된 사실','중요','영향','수치 변경',(select id from public.news_updates where headline='첫 발표'),array['3a220000-0000-0000-0000-000000000002','3a220000-0000-0000-0000-000000000004']::uuid[]) $$,'owner updates mutable fields');
select results_eq($$ select post_id,topic_id,update_type,item_order from public.news_updates where headline='후속 수정' $$,$$ values ('3a200000-0000-0000-0000-000000000001'::uuid,'3a210000-0000-0000-0000-000000000001'::uuid,'follow_up'::text,2) $$,'identity fields unchanged');
select throws_ok($$ select public.update_news_update((select id from public.news_updates where headline='후속 수정'),'자기 참조','사실',null,null,'변화',(select id from public.news_updates where headline='후속 수정'),array['3a220000-0000-0000-0000-000000000002']::uuid[]) $$,'22023',null::text,'self previous rejected');
select throws_ok($$ select public.update_news_update((select id from public.news_updates where headline='후속 수정'),'순환 참조','사실',null,null,'변화',(select id from public.news_updates where headline='종료 메모'),array['3a220000-0000-0000-0000-000000000002','3a220000-0000-0000-0000-000000000004']::uuid[]) $$,'22023',null::text,'previous chain cycle rejected');
select throws_ok($$ select public.update_news_update((select id from public.news_updates where headline='후속 수정'),'실패 수정','사실',null,null,'변화',(select id from public.news_updates where headline='첫 발표'),array['3a220000-0000-0000-0000-000000000003']::uuid[]) $$,'23514',null::text,'another update source rejected');
select is((select headline from public.news_updates where update_type='follow_up'),'후속 수정','failed update rolls back fields');
select lives_ok($$ select public.reorder_news_updates('3a200000-0000-0000-0000-000000000001',array[(select id from public.news_updates where headline='종료 메모'),(select id from public.news_updates where headline='후속 수정'),(select id from public.news_updates where headline='첫 발표')]::uuid[]) $$,'reorder succeeds');
select results_eq($$ select headline from public.news_updates where post_id='3a200000-0000-0000-0000-000000000001' order by item_order $$,$$ values ('종료 메모'::text),('후속 수정'::text),('첫 발표'::text) $$,'orders become continuous');
select throws_ok($$ select public.reorder_news_updates('3a200000-0000-0000-0000-000000000001',array[(select id from public.news_updates where headline='종료 메모')]::uuid[]) $$,'22023',null::text,'missing ids rejected');
select throws_ok($$ select public.reorder_news_updates('3a200000-0000-0000-0000-000000000001',array[(select id from public.news_updates where headline='종료 메모'),(select id from public.news_updates where headline='종료 메모'),(select id from public.news_updates where headline='첫 발표')]::uuid[]) $$,'22023',null::text,'duplicate ids rejected');
select throws_ok($$ select public.reorder_news_updates('3a200000-0000-0000-0000-000000000001',array[(select id from public.news_updates where headline='종료 메모'),(select id from public.news_updates where headline='후속 수정'),'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid]::uuid[]) $$,'22023',null::text,'foreign ids rejected');
select results_eq($$ select headline from public.news_updates where post_id='3a200000-0000-0000-0000-000000000001' order by item_order $$,$$ values ('종료 메모'::text),('후속 수정'::text),('첫 발표'::text) $$,'failed reorder preserves order');
select lives_ok($$ select public.create_news_update('3a200000-0000-0000-0000-000000000002','3a210000-0000-0000-0000-000000000002','new','번들 연결','사실',null,null,null,null,array['3a220000-0000-0000-0000-000000000009']::uuid[]) $$,'publication regression update created');
select lives_ok($$ select public.save_post_publication_bundle('3a200000-0000-0000-0000-000000000002','경제 2 수정','요약','eco-2','draft',null,null,null,null,null,null,array[]::text[],'',null,'[]'::jsonb,'[{"source_name":"수정 기관","source_title":"수정 자료","source_url":"https://example.com/9","source_published_at":null,"checked_point":"수정 확인","sort_order":0}]'::jsonb) $$,'publication bundle edits linked source fields');
select ok((select source_title='수정 자료' and news_update_id=(select id from public.news_updates where headline='번들 연결') from public.sources where post_id='3a200000-0000-0000-0000-000000000002'),'publication bundle preserves update link');
select throws_ok($$ select public.save_post_publication_bundle('3a200000-0000-0000-0000-000000000002','롤백 제목','요약','eco-2','draft',null,null,null,null,null,null,array[]::text[],'',null,'[]'::jsonb,'[{"source_name":"대체 기관","source_title":"대체 자료","source_url":"https://example.com/replaced","source_published_at":null,"checked_point":"대체 확인","sort_order":0}]'::jsonb) $$,'23514',null::text,'publication bundle rejects linked source removal');
select ok((select source_title='수정 자료' and news_update_id=(select id from public.news_updates where headline='번들 연결') from public.sources where post_id='3a200000-0000-0000-0000-000000000002') and (select title='경제 2 수정' from public.posts where id='3a200000-0000-0000-0000-000000000002'),'failed publication bundle rolls back source link and post fields');
set local role anon; set local "request.jwt.claims" = '{"role":"anon"}';
select throws_ok($$ select public.create_news_update('3a200000-0000-0000-0000-000000000001','3a210000-0000-0000-0000-000000000001','new','anon','사실',null,null,null,null,array['3a220000-0000-0000-0000-000000000005']::uuid[]) $$,'42501',null::text,'anon cannot execute');
set local role authenticated; set local "request.jwt.claims" = '{"role":"authenticated"}';
select throws_ok($$ select public.create_news_update('3a200000-0000-0000-0000-000000000001','3a210000-0000-0000-0000-000000000001','new','uid 없음','사실',null,null,null,null,array['3a220000-0000-0000-0000-000000000005']::uuid[]) $$,'42501',null::text,'missing auth uid rejected');
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000003a21","role":"authenticated"}';
select throws_ok($$ insert into public.news_updates(owner_id,post_id,topic_id,item_order,update_type,headline,fact_summary) values('00000000-0000-0000-0000-000000003a21','3a200000-0000-0000-0000-000000000001','3a210000-0000-0000-0000-000000000001',9,'new','직접','사실') $$,'42501',null::text,'direct insert denied');
select throws_ok($$ update public.news_updates set headline='직접 수정' where headline='첫 발표' $$,'42501',null::text,'direct update denied');
select throws_ok($$ delete from public.news_updates where headline='첫 발표' $$,'42501',null::text,'direct delete denied');
select throws_ok($$ update public.sources set news_update_id=null where id='3a220000-0000-0000-0000-000000000001' $$,'42501',null::text,'direct source relation update denied');
select throws_ok($$ insert into public.sources(owner_id,post_id,news_update_id,source_name,source_title,source_url,checked_point) values('00000000-0000-0000-0000-000000003a21','3a200000-0000-0000-0000-000000000001',(select id from public.news_updates limit 1),'직접','직접','https://example.com/direct','확인') $$,'42501',null::text,'direct source relation insert denied');
select lives_ok($$ update public.sources set source_title='일반 필드 수정' where id='3a220000-0000-0000-0000-000000000001' $$,'ordinary source fields remain directly editable');
select throws_ok($$ delete from public.sources where id='3a220000-0000-0000-0000-000000000001' $$,'42501',null::text,'linked source cannot be deleted directly');
select ok(has_function_privilege('authenticated','public.save_post_publication_bundle(uuid,text,text,text,text,date,text,text,text,text,text,text[],text,text,jsonb,jsonb)','EXECUTE'),'publication source bundle remains executable');
select ok((select count(*)=3 from public.news_updates where post_id='3a200000-0000-0000-0000-000000000001'),'all successful updates remain');
select * from finish();
rollback;
