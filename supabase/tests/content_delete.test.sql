-- Phase 5O-A: existing schema contract only. Run later with the repository pgTAP suite.
-- Fixtures and assertions are transactional; no migrations, grants, or policy changes.
begin;
-- Transaction-local test framework setup, matching the existing SQL test suite.
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id, email) values
 ('5d000000-0000-4000-8000-000000000001', 'content-delete-owner@example.test'),
 ('5d000000-0000-4000-8000-000000000002', 'content-delete-other@example.test');

-- 1: deletable news; 2: surviving news; 3: Import protected; 4: WP protected;
-- 5-7: the three distinct metadata kinds (7 is archived).
insert into public.posts(id, owner_id, category_id, briefing_date, series_no, title, summary, slug, content_status, source_import_type)
select ('5d100000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
 '5d000000-0000-4000-8000-000000000001',
 case n when 5 then 'ai-column' when 6 then 'info-db' when 7 then 'chinese-study' else 'economy' end,
 case when n <= 4 then date '2026-09-01' + n else null end,
 case when n >= 5 then 901 else null end,
 'delete fixture ' || n, 'summary', 'content-delete-fixture-' || n,
 case when n = 7 then 'archived' else 'draft' end, 'manual_entry'
from generate_series(1,7) n;

insert into public.seo_data(post_id, owner_id, representative_title, meta_description, focus_keyword)
select id, owner_id, title, 'meta', 'fixture' from public.posts
where owner_id = '5d000000-0000-4000-8000-000000000001';
insert into public.tags(id, owner_id, name, normalized_name) values
 ('5d200000-0000-4000-8000-000000000001','5d000000-0000-4000-8000-000000000001','reusable delete fixture','reusable delete fixture');
insert into public.post_tags(post_id, owner_id, tag_id)
select id, owner_id, '5d200000-0000-4000-8000-000000000001' from public.posts
where owner_id = '5d000000-0000-4000-8000-000000000001';
insert into public.ai_metadata(post_id,owner_id,field_name) values
 ('5d100000-0000-4000-8000-000000000005','5d000000-0000-4000-8000-000000000001','AI');
insert into public.info_db_metadata(post_id,owner_id,field_name) values
 ('5d100000-0000-4000-8000-000000000006','5d000000-0000-4000-8000-000000000001','정보');
insert into public.chinese_metadata(post_id,owner_id,learning_topic,program_name,original_title,original_url,verified_core_fact) values
 ('5d100000-0000-4000-8000-000000000007','5d000000-0000-4000-8000-000000000001','학습','CCTV','원문','https://news.cctv.com/2026/09/04/delete-fixture.shtml','사실');
insert into public.series_counters(owner_id,category_id,last_issued_no) values
 ('5d000000-0000-4000-8000-000000000001','ai-column',901),
 ('5d000000-0000-4000-8000-000000000001','info-db',901),
 ('5d000000-0000-4000-8000-000000000001','chinese-study',901);

insert into public.news_topics(id,owner_id,category_id,topic_key,canonical_title,first_seen_at,last_seen_at) values
 ('5d300000-0000-4000-8000-000000000001','5d000000-0000-4000-8000-000000000001','economy','content-delete-topic','공유 주제','2026-09-01','2026-09-04');
insert into public.news_updates(id,owner_id,post_id,topic_id,item_order,update_type,headline,fact_summary,previous_update_id) values
 ('5d400000-0000-4000-8000-000000000001','5d000000-0000-4000-8000-000000000001','5d100000-0000-4000-8000-000000000001','5d300000-0000-4000-8000-000000000001',1,'new','초기','사실',null),
 ('5d400000-0000-4000-8000-000000000002','5d000000-0000-4000-8000-000000000001','5d100000-0000-4000-8000-000000000002','5d300000-0000-4000-8000-000000000001',1,'follow_up','후속','사실','5d400000-0000-4000-8000-000000000001');
insert into public.sources(id,owner_id,post_id,news_update_id,source_name,source_title,source_url,checked_point)
select ('5d500000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
 '5d000000-0000-4000-8000-000000000001',
 ('5d100000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
 case when n <= 2 then '5d400000-0000-4000-8000-000000000001'::uuid else null end,
 '기관', '자료', 'https://example.test/delete-fixture/' || n, '확인'
from generate_series(1,4) n;

insert into public.import_jobs(id,owner_id,format,schema_version,source_fingerprint,expected_item_count,total_count) values
 ('5d600000-0000-4000-8000-000000000001','5d000000-0000-4000-8000-000000000001','daily-brief-note-content-import',1,repeat('d',64),1,1);
insert into public.import_job_items(id,owner_id,job_id,item_index,external_key,payload_fingerprint,title,category_id,validation_status,normalized_payload,tracking_status,post_id) values
 ('5d700000-0000-4000-8000-000000000001','5d000000-0000-4000-8000-000000000001','5d600000-0000-4000-8000-000000000001',0,'delete-fixture',repeat('e',64),'이력','economy','ready','{}','not_present','5d100000-0000-4000-8000-000000000003');
insert into public.wordpress_publication_attempts(id,owner_id,content_id,site_origin,idempotency_key,expected_source_updated_at,expected_payload_fingerprint) values
 ('5d800000-0000-4000-8000-000000000001','5d000000-0000-4000-8000-000000000001','5d100000-0000-4000-8000-000000000004','https://wordpress.example.test','5d900000-0000-4000-8000-000000000001',now(),'sha256:'||repeat('f',64));

select ok((select relrowsecurity from pg_class where oid='public.posts'::regclass), 'posts RLS remains enabled');
select is((select count(*) from pg_policies where schemaname='public' and tablename='posts' and policyname='posts_delete_own'), 1::bigint, 'existing owner DELETE policy remains');
select is((select confdeltype::text from pg_constraint where conname='import_job_items_post_id_owner_id_fkey'), 'r', 'Import FK remains RESTRICT');
select is((select confdeltype::text from pg_constraint where conname='wordpress_publication_attempts_post_owner_fkey'), 'r', 'WordPress FK remains RESTRICT');
select ok(not has_table_privilege('authenticated','public.wordpress_publication_attempts','DELETE'), 'protected WordPress history has no browser DELETE grant');
select ok(not has_table_privilege('authenticated','public.import_job_items','DELETE'), 'protected Import history has no browser DELETE grant');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"5d000000-0000-4000-8000-000000000002","role":"authenticated"}';
with removed as (delete from public.posts where id='5d100000-0000-4000-8000-000000000001' returning id) select is((select count(*) from removed), 0::bigint, 'other owner cannot delete the eligible post');
set local "request.jwt.claims" = '{"sub":"5d000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*) from public.posts where id='5d100000-0000-4000-8000-000000000001'), 1::bigint, 'owner still sees the post after other-owner attempt');
with removed as (delete from public.posts where id='5d100000-0000-4000-8000-000000000001' and owner_id=auth.uid() returning id) select is((select count(*) from removed), 1::bigint, 'owner deletes exactly one eligible post');
select is((select count(*) from public.posts where id='5d100000-0000-4000-8000-000000000001'), 0::bigint, 'deleted post is absent');
select is((select count(*) from public.seo_data where post_id='5d100000-0000-4000-8000-000000000001'), 0::bigint, 'SEO cascades');
select is((select count(*) from public.post_tags where post_id='5d100000-0000-4000-8000-000000000001'), 0::bigint, 'tag junction cascades');
select is((select count(*) from public.sources where post_id='5d100000-0000-4000-8000-000000000001'), 0::bigint, 'post sources cascade');
select is((select count(*) from public.news_updates where post_id='5d100000-0000-4000-8000-000000000001'), 0::bigint, 'news updates cascade');
select ok((select previous_update_id is null and owner_id=auth.uid() from public.news_updates where id='5d400000-0000-4000-8000-000000000002'), 'surviving previous reference SET NULL preserves owner');
select ok((select news_update_id is null and owner_id=auth.uid() from public.sources where id='5d500000-0000-4000-8000-000000000002'), 'surviving source reference SET NULL preserves owner');
select is((select count(*) from public.tags where id='5d200000-0000-4000-8000-000000000001'), 1::bigint, 'reusable tag preserved');
select is((select count(*) from public.post_tags where post_id='5d100000-0000-4000-8000-000000000002'), 1::bigint, 'surviving post tag link preserved');
select is((select count(*) from public.news_topics where id='5d300000-0000-4000-8000-000000000001'), 1::bigint, 'shared news topic preserved');
select is((select count(*) from public.categories where id in ('economy','ai-column','info-db','chinese-study')), 4::bigint, 'shared categories preserved');

with removed as (delete from public.posts where id in ('5d100000-0000-4000-8000-000000000005','5d100000-0000-4000-8000-000000000006','5d100000-0000-4000-8000-000000000007') and owner_id=auth.uid() returning id) select is((select count(*) from removed), 3::bigint, 'eligible metadata fixtures including archived post can delete');
select is((select count(*) from public.ai_metadata where owner_id=auth.uid()), 0::bigint, 'AI metadata cascades');
select is((select count(*) from public.info_db_metadata where owner_id=auth.uid()), 0::bigint, 'InfoDB metadata cascades');
select is((select count(*) from public.chinese_metadata where owner_id=auth.uid()), 0::bigint, 'Chinese metadata cascades');
select is((select count(*) from public.series_counters where owner_id=auth.uid() and last_issued_no=901), 3::bigint, 'series counters preserved without number reuse');

select throws_ok($$delete from public.posts where id='5d100000-0000-4000-8000-000000000003' and owner_id=auth.uid()$$, '23503', null::text, 'Import history blocks parent deletion');
select throws_ok($$delete from public.posts where id='5d100000-0000-4000-8000-000000000004' and owner_id=auth.uid()$$, '23503', null::text, 'all WordPress attempt history blocks parent deletion, including received');
select is((select count(*) from public.posts where id in ('5d100000-0000-4000-8000-000000000003','5d100000-0000-4000-8000-000000000004')), 2::bigint, 'both blocked parent rows remain');
select is((select count(*) from public.seo_data where post_id in ('5d100000-0000-4000-8000-000000000003','5d100000-0000-4000-8000-000000000004')), 2::bigint, 'blocked deletes preserve SEO atomically');
select is((select count(*) from public.sources where post_id in ('5d100000-0000-4000-8000-000000000003','5d100000-0000-4000-8000-000000000004')), 2::bigint, 'blocked deletes preserve sources atomically');
select is((select count(*) from public.post_tags where post_id in ('5d100000-0000-4000-8000-000000000003','5d100000-0000-4000-8000-000000000004')), 2::bigint, 'blocked deletes preserve tag links atomically');
select is((select count(*) from public.import_job_items where id='5d700000-0000-4000-8000-000000000001' and post_id='5d100000-0000-4000-8000-000000000003' and normalized_payload='{}'::jsonb), 1::bigint, 'Import history reference and payload preserved');
select is((select count(*) from public.wordpress_publication_attempts where id='5d800000-0000-4000-8000-000000000001' and content_id='5d100000-0000-4000-8000-000000000004' and status='received'), 1::bigint, 'WordPress history remains unchanged');
select is((select count(*) from public.import_jobs where id='5d600000-0000-4000-8000-000000000001'), 1::bigint, 'Import job preserved');

select * from finish();
rollback;
