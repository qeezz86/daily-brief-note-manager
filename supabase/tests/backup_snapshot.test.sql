begin;
create extension if not exists pgtap with schema extensions;
select plan(59);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000004b01', 'backup-owner@example.test'),
  ('00000000-0000-0000-0000-000000004b02', 'backup-other@example.test');

insert into public.posts (id, owner_id, category_id, briefing_date, published_on, display_id, title, summary, html_body, slug, content_status, source_import_type, created_at, updated_at) values
  ('4b100000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000004b01','economy','2026-07-15','2026-07-15','#2026-07-15-ECO','두 번째','요약 2','<div><h1>둘</h1></div>','backup-two','published','manual_entry','2026-07-15 02:00+00','2026-07-15 02:00+00'),
  ('4b100000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000004b01','economy','2026-07-14','2026-07-14','#2026-07-14-ECO','첫 번째','요약 1','<div><h1>하나</h1></div>','backup-one','published','manual_entry','2026-07-15 01:00+00','2026-07-15 01:00+00'),
  ('4b100000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000004b02','economy','2026-07-13','2026-07-13','#2026-07-13-ECO','타인 글','타인','<div><h1>타인</h1></div>','backup-other','published','manual_entry','2026-07-15 00:00+00','2026-07-15 00:00+00');

insert into public.seo_data (post_id, owner_id, representative_title, alternative_titles, meta_description, focus_keyword) values
  ('4b100000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000004b01','대표','["대안1","대안2","대안3","대안4"]','설명','키워드');
insert into public.tags (id, owner_id, name, normalized_name, created_at) values
  ('4b200000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000004b01','태그','태그','2026-07-15 01:00+00');
insert into public.post_tags (post_id, tag_id, owner_id) values
  ('4b100000-0000-0000-0000-000000000001','4b200000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000004b01');
insert into public.ai_metadata (post_id, owner_id, field_name, difficulty, estimated_read_min) values
  ('4b100000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000004b01','AI','beginner',5);
insert into public.info_db_metadata (post_id, owner_id, field_name, difficulty, estimated_read_min, reference_date) values
  ('4b100000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000004b01','정보','intermediate',6,'2026-07-15');
insert into public.chinese_metadata (post_id, owner_id, learning_topic, program_name, original_title, original_url, original_published_at, episode_list_included, verified_core_fact) values
  ('4b100000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000004b01','학습','CCTV','标题','https://cctv.example/item','2026-07-15 01:00+00',false,'확인');
insert into public.series_counters (owner_id, category_id, last_issued_no, updated_at) values
  ('00000000-0000-0000-0000-000000004b01','ai-column',7,'2026-07-15 01:00+00');

insert into public.news_topics (id, owner_id, category_id, topic_key, canonical_title, status, first_seen_at, last_seen_at, created_at, updated_at) values
  ('4b300000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000004b01','economy','backup-topic','백업 주제','active','2026-07-14','2026-07-15','2026-07-15 01:00+00','2026-07-15 01:00+00'),
  ('4b300000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000004b02','economy','other-topic','타인 주제','active','2026-07-14','2026-07-15','2026-07-15 01:00+00','2026-07-15 01:00+00');
insert into public.news_status_history (id, owner_id, topic_id, from_status, to_status, reason, changed_at) values
  ('4b400000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000004b01','4b300000-0000-0000-0000-000000000001','monitoring','active','재개','2026-07-15 02:00+00'),
  ('4b400000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000004b01','4b300000-0000-0000-0000-000000000001','active','monitoring',null,'2026-07-15 01:00+00');
insert into public.news_updates (id, owner_id, post_id, topic_id, item_order, update_type, headline, fact_summary, change_summary, previous_update_id, created_at, updated_at) values
  ('4b500000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000004b01','4b100000-0000-0000-0000-000000000001','4b300000-0000-0000-0000-000000000001',1,'new','첫 뉴스','사실',null,null,'2026-07-15 01:00+00','2026-07-15 01:00+00'),
  ('4b500000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000004b01','4b100000-0000-0000-0000-000000000001','4b300000-0000-0000-0000-000000000001',2,'follow_up','후속 뉴스','후속 사실','변화','4b500000-0000-0000-0000-000000000001','2026-07-15 02:00+00','2026-07-15 02:00+00');
insert into public.sources (id, owner_id, post_id, news_update_id, source_name, source_title, source_url, checked_point, sort_order, created_at, updated_at) values
  ('4b600000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000004b01','4b100000-0000-0000-0000-000000000001',null,'기관','두 번째 출처','https://example.com/2','확인',1,'2026-07-15 02:00+00','2026-07-15 02:00+00'),
  ('4b600000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000004b01','4b100000-0000-0000-0000-000000000001','4b500000-0000-0000-0000-000000000002','기관','첫 출처','https://example.com/1','확인',0,'2026-07-15 01:00+00','2026-07-15 01:00+00');
insert into public.news_followups (id, owner_id, topic_id, check_text, status, priority, created_at, updated_at) values
  ('4b700000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000004b01','4b300000-0000-0000-0000-000000000001','후속 확인','pending','high','2026-07-15 01:00+00','2026-07-15 01:00+00');
insert into public.generated_prompts (id, owner_id, category_id, requested_post_count, actual_post_count, prompt_mode, prompt_text, is_pinned, generated_at, reference_date, closed_lookback_days, context_schema_version, context_snapshot) values
  ('4b800000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000004b01','economy',5,1,'standard','저장 프롬프트',true,'2026-07-15 01:00+00','2026-07-15',90,1,'{"schemaVersion":1,"promptTemplateVersion":1}'),
  ('4b800000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000004b02','economy',5,0,'standard','타인 프롬프트',false,'2026-07-15 01:00+00','2026-07-15',90,1,'{"schemaVersion":1}');

insert into public.import_jobs (id, owner_id, format, schema_version, source_name, source_fingerprint, status, expected_item_count, total_count, ready_count, created_at, updated_at) values
  ('4b900000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000004b01','daily-brief-note-content-import',1,'bundle.json',repeat('a',64),'completed',2,2,2,'2026-07-15 01:00+00','2026-07-15 01:00+00'),
  ('4b900000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000004b02','daily-brief-note-content-import',1,'other.json',repeat('b',64),'completed',1,1,1,'2026-07-15 01:00+00','2026-07-15 01:00+00');
insert into public.import_job_items (id, owner_id, job_id, item_index, external_key, payload_fingerprint, title, category_id, validation_status, normalized_payload, tracking_status, created_at, updated_at) values
  ('4ba00000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000004b01','4b900000-0000-0000-0000-000000000001',1,'item-two',repeat('2',64),'둘','economy','ready','{"safe":{"value":2}}','not_present','2026-07-15 02:00+00','2026-07-15 02:00+00'),
  ('4ba00000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000004b01','4b900000-0000-0000-0000-000000000001',0,'item-one',repeat('1',64),'하나','economy','ready','{"safe":{"value":1}}','not_present','2026-07-15 01:00+00','2026-07-15 01:00+00');
insert into public.import_job_item_attempts (id, owner_id, job_item_id, stage, attempt_no, status, retryable, started_at, completed_at) values
  ('4bb00000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000004b01','4ba00000-0000-0000-0000-000000000001','content',2,'imported',false,'2026-07-15 02:00+00','2026-07-15 02:01+00'),
  ('4bb00000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000004b01','4ba00000-0000-0000-0000-000000000001','content',1,'failed',true,'2026-07-15 01:00+00','2026-07-15 01:01+00');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000004b01","role":"authenticated"}';

select has_function('public','get_user_backup_estimate',array['text'],'1 estimate RPC exists');
select has_function('public','get_user_backup_snapshot',array['text'],'2 snapshot RPC exists');
select function_privs_are('public','get_user_backup_snapshot',array['text'],'authenticated',array['EXECUTE'],'3 authenticated executes snapshot');
select function_privs_are('public','get_user_backup_snapshot',array['text'],'anon',array[]::text[],'4 anon cannot execute snapshot');
select function_privs_are('public','get_user_backup_snapshot',array['text'],'public',array[]::text[],'5 PUBLIC cannot execute snapshot');
select ok(not (select prosecdef from pg_proc where oid='public.get_user_backup_snapshot(text)'::regprocedure),'6 snapshot is SECURITY INVOKER');
select is((select provolatile::text from pg_proc where oid='public.get_user_backup_snapshot(text)'::regprocedure),'s','7 snapshot is stable and read-only');
select lives_ok($$ select public.get_user_backup_snapshot('core') $$,'8 own core snapshot succeeds');
select lives_ok($$ select public.get_user_backup_snapshot('full') $$,'9 own full snapshot succeeds');
set local "request.jwt.claims" = '{"role":"authenticated"}';
select throws_ok($$ select public.get_user_backup_snapshot('core') $$,'42501','BACKUP_AUTH_REQUIRED','10 missing auth uid rejected');
set local role anon; set local "request.jwt.claims" = '{"role":"anon"}';
select throws_ok($$ select public.get_user_backup_snapshot('core') $$,'42501',null::text,'11 anon execution rejected');
set local role authenticated; set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000004b01","role":"authenticated"}';
select throws_ok($$ select public.get_user_backup_snapshot('wrong') $$,'22023','BACKUP_PROFILE_INVALID','12 invalid profile rejected');

create temporary table core_snapshot as select public.get_user_backup_snapshot('core') value;
create temporary table full_snapshot as select public.get_user_backup_snapshot('full') value;
select is((select value->'data'->'posts' @> '[{"title":"타인 글"}]' from core_snapshot),false,'13 other post excluded');
select is((select value->'data'->'newsTopics' @> '[{"topicKey":"other-topic"}]' from core_snapshot),false,'14 other topic excluded');
select is((select value->'data'->'generatedPrompts' @> '[{"promptText":"타인 프롬프트"}]' from core_snapshot),false,'15 other prompt excluded');
select is((select value->'data'->'importJobs' is null from full_snapshot),false,'16 own full includes jobs and excludes inaccessible others');
select is((select value::text like '%"owner_id":%' from full_snapshot),false,'17 owner_id key is absent');
select is((select jsonb_array_length(value->'data'->'posts') from core_snapshot),2,'18 posts included');
select is((select jsonb_array_length(value->'data'->'seoData') from core_snapshot),1,'19 seo included');
select is((select jsonb_array_length(value->'data'->'tags') from core_snapshot),1,'20 tags included');
select is((select jsonb_array_length(value->'data'->'postTags') from core_snapshot),1,'21 post tag included');
select is((select jsonb_array_length(value->'data'->'sources') from core_snapshot),2,'22 sources included');
select is((select jsonb_array_length(value->'data'->'aiMetadata') from core_snapshot),1,'23 ai metadata included');
select is((select jsonb_array_length(value->'data'->'infoDbMetadata') from core_snapshot),1,'24 info metadata included');
select is((select jsonb_array_length(value->'data'->'chineseMetadata') from core_snapshot),1,'25 chinese metadata included');
select is((select jsonb_array_length(value->'data'->'seriesCounters') from core_snapshot),1,'26 series counter included');
select is((select jsonb_array_length(value->'data'->'newsTopics') from core_snapshot),1,'27 news topic included');
select is((select jsonb_array_length(value->'data'->'newsStatusHistory') from core_snapshot),2,'28 status history included');
select is((select jsonb_array_length(value->'data'->'newsUpdates') from core_snapshot),2,'29 news updates included');
select is((select value->'data'->'newsUpdates'->1->>'previousUpdateId' from core_snapshot),'4b500000-0000-0000-0000-000000000001','30 previous update preserved');
select is((select jsonb_array_length(value->'data'->'newsFollowups') from core_snapshot),1,'31 followup included');
select is((select jsonb_array_length(value->'data'->'generatedPrompts') from core_snapshot),1,'32 generated prompt included');
select is((select value->'data' ? 'importJobs' from core_snapshot),false,'33 core excludes import jobs');
select ok((select value->'data' ? 'posts' from full_snapshot),'34 full includes core sections');
select is((select jsonb_array_length(value->'data'->'importJobs') from full_snapshot),1,'35 full includes import job');
select is((select jsonb_array_length(value->'data'->'importJobItems') from full_snapshot),2,'36 full includes import items');
select is((select jsonb_array_length(value->'data'->'importJobItemAttempts') from full_snapshot),2,'37 full includes attempts');
select is((select value->'data'->'importJobItems'->0->'normalizedPayload'->'safe'->>'value' from full_snapshot),'1','38 normalized payload preserved');
select results_eq($$ select item->>'title' from core_snapshot, lateral jsonb_array_elements(value->'data'->'posts') item $$,$$ values ('첫 번째'),('두 번째') $$,'39 posts deterministic order');
select results_eq($$ select (item->>'sortOrder')::int from core_snapshot, lateral jsonb_array_elements(value->'data'->'sources') item $$,$$ values (0),(1) $$,'40 sources sort order');
select results_eq($$ select (item->>'itemOrder')::int from core_snapshot, lateral jsonb_array_elements(value->'data'->'newsUpdates') item $$,$$ values (1),(2) $$,'41 updates item order');
select results_eq($$ select item->>'toStatus' from core_snapshot, lateral jsonb_array_elements(value->'data'->'newsStatusHistory') item $$,$$ values ('monitoring'),('active') $$,'42 status history time order');
select results_eq($$ select (item->>'itemIndex')::int from full_snapshot, lateral jsonb_array_elements(value->'data'->'importJobItems') item $$,$$ values (0),(1) $$,'43 import items index order');
select results_eq($$ select (item->>'attemptNo')::int from full_snapshot, lateral jsonb_array_elements(value->'data'->'importJobItemAttempts') item $$,$$ values (1),(2) $$,'44 attempts number order');
select is((select count(*)::int from core_snapshot, lateral jsonb_object_keys(value->'sectionCounts')),14,'45 core section set exact');
select is((select count(*)::int from full_snapshot, lateral jsonb_object_keys(value->'sectionCounts')),17,'46 full section set exact');
select is((select (value->'sectionCounts'->>'posts')::int from core_snapshot),2,'47 section count exact');
select is((select (value->>'totalRecords')::int = (select sum(v::text::int) from jsonb_each(value->'sectionCounts') x(k,v)) from core_snapshot),true,'48 total count exact');
select is((select jsonb_array_length(value->'categoryManifest') from core_snapshot),8,'49 category manifest included');
select is((select value->>'profile' from full_snapshot),'full','50 profile exact');
select is((select value->'data'->'sources'->0->>'newsUpdateId' from core_snapshot),'4b500000-0000-0000-0000-000000000002','51 source update reference preserved');
select is((select value->'data'->'newsFollowups'->0->>'topicId' from core_snapshot),'4b300000-0000-0000-0000-000000000001','52 followup topic reference preserved');
select is((select value->'data'->'generatedPrompts'->0->'contextSnapshot'->>'promptTemplateVersion' from core_snapshot),'1','53 prompt snapshot preserved');
select is((select value->'data'->'sources'->1->'newsUpdateId' from core_snapshot),'null'::jsonb,'54 nullable relationship preserved');
select is((select value->'data'->'chineseMetadata'->0->'episodeListIncluded' from core_snapshot),'false'::jsonb,'55 false is distinct from null');
select is((public.get_user_backup_estimate('core')->'sectionCounts'->>'posts')::int,2,'56 estimate count exact');
select is(public.get_user_backup_estimate('full')->>'includesNormalizedPayload','true','57 full estimate flags normalized payload');
select table_privs_are('public','import_jobs','authenticated',array['SELECT'],'58 existing direct write restriction unchanged');
select is((select count(*)::int from public.posts where owner_id='00000000-0000-0000-0000-000000004b01'),2,'59 backup RPC performs no writes');

select * from finish();
rollback;
