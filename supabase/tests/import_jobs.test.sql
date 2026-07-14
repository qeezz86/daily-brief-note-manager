begin;

create extension if not exists pgtap with schema extensions;
select plan(78);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000004a4', 'job-owner@example.test'),
  ('00000000-0000-0000-0000-0000000004b4', 'job-other@example.test');

create function public.test_job_snapshot(p_day integer, p_external text, p_tracking boolean default false)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'schemaVersion', 1,
    'externalKey', p_external,
    'contentGroup', 'news',
    'content', jsonb_build_object(
      'category_id','economy','title','Job post ' || p_day,'summary','Summary',
      'slug','economy-briefing-2027-01-' || lpad(p_day::text,2,'0'),'status','draft',
      'briefing_date','2027-01-' || lpad(p_day::text,2,'0'),'published_on','2027-01-' || lpad(p_day::text,2,'0'),
      'published_at',null,'display_id','#2027-01-' || lpad(p_day::text,2,'0') || '-ECO','series_no',null,
      'wordpress_url',null,
      'html_body','<div class="daily-brief-note news-briefing economy"><h1>Job</h1><section id="sources"><a href="https://example.com/job/' || p_day || '">Source</a></section></div>',
      'seo',jsonb_build_object('representative_title','Representative','alternative_titles',jsonb_build_array('A','B','C','D'),'meta_description',repeat('가',120),'focus_keyword','focus'),
      'image',jsonb_build_object('prompt','Prompt','alt','Alt'),
      'tags',jsonb_build_array('금리','환율','물가','산업동향','정책변화'),
      'sources',jsonb_build_array(jsonb_build_object('source_name','기관','source_title','원문','source_url','https://example.com/job/' || p_day,'source_published_at',null,'checked_point','확인','sort_order',0)),
      'metadata',null
    ),
    'tracking', case when p_tracking then jsonb_build_object(
      'topics',jsonb_build_array(jsonb_build_object('topic_external_key',p_external || '-topic','topic_key',p_external || '-key','canonical_title','Topic ' || p_day,'topic_summary','Topic summary','status','active','closed_reason',null,'first_seen_at','2027-01-01','last_seen_at','2027-01-02')),
      'updates',jsonb_build_array(jsonb_build_object('update_external_key',p_external || '-update','topic_external_key',p_external || '-topic','update_type','new','headline','Headline','fact_summary','Facts','importance_summary',null,'impact_summary',null,'change_summary',null,'previous_update_external_key',null,'item_order',1,'source_orders',jsonb_build_array(1))),
      'followups','[]'::jsonb
    ) else 'null'::jsonb end
  );
$$;

create function public.test_job_item(p_index integer, p_external text, p_hash text, p_snapshot jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('itemIndex',p_index,'externalKey',p_external,'payloadFingerprint',p_hash,
    'title',p_snapshot->'content'->>'title','categoryId','economy','validationStatus','ready',
    'warningAcknowledged',false,'normalizedPayload',p_snapshot);
$$;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000004a4","role":"authenticated"}';

select has_table('public','import_jobs','1 import jobs table exists');
select has_table('public','import_job_items','2 import items table exists');
select has_table('public','import_job_item_attempts','3 attempts table exists');
select has_function('public','create_import_job',array['text','integer','text','text','integer','jsonb'],'4 create RPC exists');
select has_function('public','run_import_job_item_content',array['uuid'],'5 content stage RPC exists');
select has_function('public','run_import_job_item_tracking',array['uuid'],'6 tracking stage RPC exists');
select function_privs_are('public','create_import_job',array['text','integer','text','text','integer','jsonb'],'authenticated',array['EXECUTE'],'7 authenticated can create');
select function_privs_are('public','create_import_job',array['text','integer','text','text','integer','jsonb'],'anon',array[]::text[],'8 anon cannot create');
select table_privs_are('public','import_jobs','authenticated',array['SELECT'],'9 jobs direct writes blocked');
select table_privs_are('public','import_job_items','authenticated',array['SELECT'],'10 items direct writes blocked');
select table_privs_are('public','import_job_item_attempts','authenticated',array['SELECT'],'11 attempts direct writes blocked');

create temporary table job_one as select public.create_import_job('daily-brief-note-content-import',1,'bundle.json',repeat('a',64),2,
  '{"total":2,"readyCount":2,"warningCount":0,"invalidCount":0,"duplicateCount":0,"acknowledgedWarningCount":0}'::jsonb) value;
select ok((select (value->>'jobId')::uuid is not null from job_one),'12 authenticated creates job');
select is((select value->>'status' from job_one),'preparing','13 new job preparing');
select is((select value->>'isExisting' from job_one),'false','14 new job is not existing');
select is((select owner_id from public.import_jobs where source_fingerprint=repeat('a',64)),'00000000-0000-0000-0000-0000000004a4'::uuid,'15 owner comes from auth uid');
select is((public.create_import_job('daily-brief-note-content-import',1,'renamed.json',repeat('a',64),2,'{}'::jsonb)->>'isExisting'),'true','16 duplicate fingerprint returns existing');
select is((select count(*)::int from public.import_jobs where source_fingerprint=repeat('a',64)),1,'17 duplicate fingerprint creates one row');
select throws_ok($$ select public.create_import_job('wrong',1,'x',repeat('b',64),1,'{}') $$,'22023','IMPORT_JOB_INVALID_INPUT','18 bad format rejected');
select throws_ok($$ select public.create_import_job('daily-brief-note-content-import',2,'x',repeat('b',64),1,'{}') $$,'22023','IMPORT_JOB_INVALID_INPUT','19 bad schema rejected');
select throws_ok($$ select public.create_import_job('daily-brief-note-content-import',1,'x','bad',1,'{}') $$,'22023','IMPORT_JOB_INVALID_INPUT','20 bad fingerprint rejected');
select throws_ok($$ select public.create_import_job('daily-brief-note-content-import',1,'x',repeat('b',64),2001,'{}') $$,'22023','IMPORT_JOB_INVALID_INPUT','21 bad count rejected');

create temporary table append_one as select public.append_import_job_items((select (value->>'jobId')::uuid from job_one), jsonb_build_array(
  public.test_job_item(0,'job-one',repeat('1',64),public.test_job_snapshot(1,'job-one',true)),
  public.test_job_item(1,'job-two',repeat('2',64),public.test_job_snapshot(2,'job-two',false))
)) value;
select is((select (value->>'appendedCount')::int from append_one),2,'22 item chunk appended');
select is((select count(*)::int from public.import_job_items where job_id=(select (value->>'jobId')::uuid from job_one)),2,'23 two snapshots stored');
select is((select tracking_status from public.import_job_items where external_key='job-one'),'pending','24 tracking payload starts pending');
select is((select tracking_status from public.import_job_items where external_key='job-two'),'not_present','25 missing tracking marked not present');
select is((public.append_import_job_items((select (value->>'jobId')::uuid from job_one),jsonb_build_array(public.test_job_item(0,'job-one',repeat('1',64),public.test_job_snapshot(1,'job-one',true))))->>'existingCount')::int,1,'26 identical index is idempotent');
select throws_ok($$ select public.append_import_job_items((select (value->>'jobId')::uuid from job_one),jsonb_build_array(public.test_job_item(0,'job-one',repeat('9',64),public.test_job_snapshot(1,'job-one',true)))) $$,'23505','IMPORT_JOB_ITEM_CONFLICT','27 changed fingerprint conflicts');
select throws_ok($$ select public.append_import_job_items((select (value->>'jobId')::uuid from job_one),'[]'::jsonb) $$,'22023','IMPORT_JOB_INVALID_CHUNK','28 empty chunk rejected');
select is((public.finalize_import_job((select (value->>'jobId')::uuid from job_one))->>'status'),'ready','29 finalize makes ready');
select is((public.finalize_import_job((select (value->>'jobId')::uuid from job_one))->>'idempotent'),'true','30 finalize is idempotent');
select throws_ok($$ select public.append_import_job_items((select (value->>'jobId')::uuid from job_one),jsonb_build_array(public.test_job_item(0,'job-one',repeat('1',64),public.test_job_snapshot(1,'job-one',true)))) $$,'23514','IMPORT_JOB_NOT_PREPARING','31 ready job append blocked');

create temporary table content_one as select public.run_import_job_item_content((select id from public.import_job_items where external_key='job-one')) value;
select is((select value->>'contentStatus' from content_one),'imported','32 content stage succeeds');
select ok((select post_id is not null from public.import_job_items where external_key='job-one'),'33 post id stored');
select is((select content_attempt_count from public.import_job_items where external_key='job-one'),1,'34 content attempt increments');
select is((select count(*)::int from public.import_job_item_attempts where job_item_id=(select id from public.import_job_items where external_key='job-one') and stage='content'),1,'35 content attempt row stored');
select is((public.run_import_job_item_content((select id from public.import_job_items where external_key='job-one'))->>'idempotent'),'true','36 content success re-call idempotent');
select is((select count(*)::int from public.posts where slug='economy-briefing-2027-01-01'),1,'37 idempotent content creates one post');
create temporary table tracking_one as select public.run_import_job_item_tracking((select id from public.import_job_items where external_key='job-one')) value;
select is((select value->>'trackingStatus' from tracking_one),'imported','38 tracking succeeds');
select is((select update_count from public.import_job_items where external_key='job-one'),1,'39 tracking counts stored');
select is((public.run_import_job_item_tracking((select id from public.import_job_items where external_key='job-one'))->>'idempotent'),'true','40 tracking success re-call idempotent');
select is((select count(*)::int from public.news_updates where post_id=(select post_id from public.import_job_items where external_key='job-one')),1,'41 idempotent tracking creates one update');
select lives_ok($$ select public.run_import_job_item_content((select id from public.import_job_items where external_key='job-two')) $$,'42 second content succeeds');
select is((select status from public.import_jobs where id=(select (value->>'jobId')::uuid from job_one)),'completed','43 all terminal stages complete job');
select is((public.get_import_job((select (value->>'jobId')::uuid from job_one))->>'completedCount')::int,2,'44 DB aggregate completed count exact');
select is(jsonb_array_length(public.get_import_job_items((select (value->>'jobId')::uuid from job_one))),2,'45 item read RPC returns ordered rows');

create temporary table job_cancel as select public.create_import_job('daily-brief-note-content-import',1,'cancel.json',repeat('c',64),2,'{}') value;
select public.append_import_job_items((select (value->>'jobId')::uuid from job_cancel),jsonb_build_array(
  public.test_job_item(0,'cancel-one',repeat('3',64),public.test_job_snapshot(3,'cancel-one',false)),
  public.test_job_item(1,'cancel-two',repeat('4',64),public.test_job_snapshot(4,'cancel-two',false))));
select public.finalize_import_job((select (value->>'jobId')::uuid from job_cancel));
select public.run_import_job_item_content((select id from public.import_job_items where external_key='cancel-one'));
select is((public.cancel_import_job((select (value->>'jobId')::uuid from job_cancel))->>'status'),'cancelled','46 job cancels');
select is((select content_status from public.import_job_items where external_key='cancel-one'),'imported','47 cancel preserves success');
select is((select content_status from public.import_job_items where external_key='cancel-two'),'cancelled','48 cancel marks pending only');
select throws_ok($$ select public.run_import_job_item_content((select id from public.import_job_items where external_key='cancel-two')) $$,'23514','IMPORT_JOB_CANCELLED','49 cancelled job blocks stage');
select is((public.resume_cancelled_import_job((select (value->>'jobId')::uuid from job_cancel))->>'status'),'running','50 cancelled job resumes');
select is((select content_status from public.import_job_items where external_key='cancel-two'),'pending','51 resume restores pending');
select is((public.run_import_job_item_content((select id from public.import_job_items where external_key='cancel-one'))->>'idempotent'),'true','52 resume never reruns success');

create temporary table job_fail as select public.create_import_job('daily-brief-note-content-import',1,'fail.json',repeat('d',64),1,'{}') value;
select public.append_import_job_items((select (value->>'jobId')::uuid from job_fail),jsonb_build_array(public.test_job_item(0,'fail-one',repeat('5',64),jsonb_set(public.test_job_snapshot(5,'fail-one',false),'{content,slug}','"invalid slug"'))));
select public.finalize_import_job((select (value->>'jobId')::uuid from job_fail));
select is((public.run_import_job_item_content((select id from public.import_job_items where external_key='fail-one'))->>'contentStatus'),'failed','53 content failure recorded');
select is((select content_error_code from public.import_job_items where external_key='fail-one'),'IMPORT_VALIDATION_FAILED','54 safe content code stored');
select is((select content_retryable from public.import_job_items where external_key='fail-one'),false,'55 invalid snapshot not retryable');
select is((select count(*)::int from public.posts where slug='economy-briefing-2027-01-05'),0,'56 failed content rolled back');
select is((select status from public.import_jobs where id=(select (value->>'jobId')::uuid from job_fail)),'completed_with_errors','57 failed item completes with errors');

set local role postgres;
create function public.test_fail_post_insert() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'temporary test failure'; end $$;
create trigger test_fail_post_insert before insert on public.posts for each row when (new.slug='economy-briefing-2027-01-06') execute function public.test_fail_post_insert();
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000004a4","role":"authenticated"}';
create temporary table job_retry as select public.create_import_job('daily-brief-note-content-import',1,'retry.json',repeat('e',64),1,'{}') value;
select public.append_import_job_items((select (value->>'jobId')::uuid from job_retry),jsonb_build_array(public.test_job_item(0,'retry-one',repeat('6',64),public.test_job_snapshot(6,'retry-one',false))));
select public.finalize_import_job((select (value->>'jobId')::uuid from job_retry));
select is((public.run_import_job_item_content((select id from public.import_job_items where external_key='retry-one'))->>'retryable'),'true','58 temporary content failure retryable');
set local role postgres;
drop trigger test_fail_post_insert on public.posts;
drop function public.test_fail_post_insert();
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000004a4","role":"authenticated"}';
select is((public.run_import_job_item_content((select id from public.import_job_items where external_key='retry-one'))->>'contentStatus'),'imported','59 content retry succeeds');
select is((select content_attempt_count from public.import_job_items where external_key='retry-one'),2,'60 retry attempt number increments');
select is((select count(*)::int from public.import_job_item_attempts where job_item_id=(select id from public.import_job_items where external_key='retry-one')),2,'61 previous attempt preserved');

insert into public.news_topics (owner_id,category_id,topic_key,canonical_title,topic_summary,status,first_seen_at,last_seen_at)
values ('00000000-0000-0000-0000-0000000004a4','economy','tracking-retry-key','Conflicting title','Topic summary','active','2027-01-01','2027-01-02');
create temporary table job_tracking_retry as select public.create_import_job('daily-brief-note-content-import',1,'tracking-retry.json',repeat('7',64),1,'{}') value;
select public.append_import_job_items((select (value->>'jobId')::uuid from job_tracking_retry),jsonb_build_array(public.test_job_item(0,'tracking-retry',repeat('7',64),public.test_job_snapshot(7,'tracking-retry',true))));
select public.finalize_import_job((select (value->>'jobId')::uuid from job_tracking_retry));
select is((public.run_import_job_item_content((select id from public.import_job_items where external_key='tracking-retry'))->>'contentStatus'),'imported','62 tracking retry content succeeds');
select is((public.run_import_job_item_tracking((select id from public.import_job_items where external_key='tracking-retry'))->>'trackingStatus'),'failed','63 tracking conflict recorded');
select is((select tracking_retryable from public.import_job_items where external_key='tracking-retry'),true,'64 tracking conflict retryable');
select is((select count(*)::int from public.posts where slug='economy-briefing-2027-01-07'),1,'65 tracking failure preserves post');
update public.news_topics set canonical_title='Topic 7' where topic_key='tracking-retry-key';
select is((public.run_import_job_item_tracking((select id from public.import_job_items where external_key='tracking-retry'))->>'trackingStatus'),'imported','66 tracking-only retry succeeds');
select is((select tracking_attempt_count from public.import_job_items where external_key='tracking-retry'),2,'67 tracking attempt number increments');
select is((select content_attempt_count from public.import_job_items where external_key='tracking-retry'),1,'68 tracking retry does not rerun content');
select is((select count(*)::int from public.import_job_item_attempts where job_item_id=(select id from public.import_job_items where external_key='tracking-retry') and stage='tracking'),2,'69 tracking attempts preserved');

select throws_ok($$ insert into public.import_jobs(owner_id,format,schema_version,source_fingerprint,expected_item_count,total_count) values('00000000-0000-0000-0000-0000000004a4','daily-brief-note-content-import',1,repeat('f',64),1,1) $$,'42501',null::text,'70 direct job insert denied');
select throws_ok($$ update public.import_job_items set normalized_payload='{}' where external_key='job-one' $$,'42501',null::text,'71 snapshot direct update denied');
select throws_ok($$ delete from public.import_job_items where external_key='job-one' $$,'42501',null::text,'72 direct item delete denied');

set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000004b4","role":"authenticated"}';
select is((select count(*)::int from public.import_jobs),0,'73 other user cannot select jobs');
select is((select count(*)::int from public.import_job_items),0,'74 other user cannot select items');
select throws_ok($$ select public.run_import_job_item_content((select id from public.import_job_items limit 1)) $$,'42501','IMPORT_JOB_ITEM_NOT_FOUND','75 other owner RPC hidden');
select is((public.create_import_job('daily-brief-note-content-import',1,'other.json',repeat('a',64),1,'{}')->>'isExisting'),'false','76 fingerprints are owner scoped');

set local "request.jwt.claims" = '{"role":"authenticated"}';
select throws_ok($$ select public.create_import_job('daily-brief-note-content-import',1,'none',repeat('8',64),1,'{}') $$,'42501','IMPORT_JOB_AUTH_REQUIRED','77 missing auth uid rejected');
set local role anon;
set local "request.jwt.claims" = '{"role":"anon"}';
select throws_ok($$ select public.get_import_job('00000000-0000-0000-0000-000000000001') $$,'42501',null::text,'78 anon read RPC execution denied');

select * from finish();
rollback;
