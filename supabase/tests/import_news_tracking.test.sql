begin;

create extension if not exists pgtap with schema extensions;
select plan(55);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000004a3', 'tracking-owner@example.test'),
  ('00000000-0000-0000-0000-0000000004b3', 'tracking-other@example.test');

insert into public.posts (id, owner_id, category_id, briefing_date, title, summary, slug, content_status, source_import_type)
select ('00000000-0000-0000-0000-0000000005' || lpad(value::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-0000000004a3', 'economy', ('2026-09-01'::date + value),
       'Tracking post ' || value, 'Summary', 'tracking-post-' || value, 'draft', 'json_import'
from generate_series(1, 12) value;

insert into public.posts (id, owner_id, category_id, series_no, title, summary, slug, content_status, source_import_type) values
  ('00000000-0000-0000-0000-0000000005a1','00000000-0000-0000-0000-0000000004a3','ai-column',901,'AI','Summary','ai-901','draft','json_import');
insert into public.posts (id, owner_id, category_id, briefing_date, title, summary, slug, content_status, source_import_type) values
  ('00000000-0000-0000-0000-0000000005b1','00000000-0000-0000-0000-0000000004b3','economy','2026-10-01','Other','Summary','other-tracking-post','draft','json_import');

insert into public.sources (owner_id, post_id, source_name, source_title, source_url, checked_point, sort_order)
select '00000000-0000-0000-0000-0000000004a3',
       ('00000000-0000-0000-0000-0000000005' || lpad(post_no::text, 2, '0'))::uuid,
       'Source', 'Source ' || source_no, 'https://example.com/' || post_no || '/' || source_no,
       'Checked', source_no - 1
from generate_series(1, 12) post_no cross join generate_series(1, 2) source_no;
insert into public.sources (owner_id, post_id, source_name, source_title, source_url, checked_point, sort_order) values
  ('00000000-0000-0000-0000-0000000004b3','00000000-0000-0000-0000-0000000005b1','Source','Other','https://example.com/other','Checked',0),
  ('00000000-0000-0000-0000-0000000004a3','00000000-0000-0000-0000-0000000005a1','Source','AI','https://example.com/ai','Checked',0);

insert into public.news_topics (owner_id, category_id, topic_key, canonical_title, topic_summary, status, first_seen_at, last_seen_at) values
  ('00000000-0000-0000-0000-0000000004a3','economy','reuse-topic','Existing Topic','Existing summary','active','2026-01-01','2026-01-02'),
  ('00000000-0000-0000-0000-0000000004a3','economy','conflict-topic','Original Title','Original summary','active','2026-01-01','2026-01-02'),
  ('00000000-0000-0000-0000-0000000004a3','economy','closed-topic','Closed Topic','Closed summary','active','2026-01-01','2026-01-02');
update public.news_topics set status='closed', closed_reason='Closed reason' where topic_key='closed-topic';

create function public.test_tracking_payload(
  p_external text,
  p_topic_key text,
  p_title text,
  p_summary text default 'Topic summary',
  p_status text default 'active',
  p_closed_reason text default null
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'topics', jsonb_build_array(jsonb_build_object(
      'topic_external_key', p_external, 'topic_key', p_topic_key,
      'canonical_title', p_title, 'topic_summary', p_summary,
      'status', p_status, 'closed_reason', p_closed_reason,
      'first_seen_at', '2026-09-01', 'last_seen_at', '2026-09-02'
    )),
    'updates', jsonb_build_array(jsonb_build_object(
      'update_external_key', p_external || '-update', 'topic_external_key', p_external,
      'update_type', 'new', 'headline', 'Headline', 'fact_summary', 'Facts',
      'importance_summary', 'Importance', 'impact_summary', 'Impact',
      'change_summary', null, 'previous_update_external_key', null,
      'item_order', 1, 'source_orders', jsonb_build_array(1)
    )),
    'followups', jsonb_build_array(jsonb_build_object(
      'followup_external_key', p_external || '-followup', 'topic_external_key', p_external,
      'check_text', 'Check this', 'priority', 'high', 'due_date', '2026-10-01',
      'status', 'pending', 'resolution_note', null, 'resolved_at', null
    ))
  );
$$;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000004a3","role":"authenticated"}';

select has_function('public','import_news_tracking_for_post',array['uuid','jsonb'],'1 tracking RPC exists');
select function_privs_are('public','import_news_tracking_for_post',array['uuid','jsonb'],'authenticated',array['EXECUTE'],'2 authenticated can execute');
select function_privs_are('public','import_news_tracking_for_post',array['uuid','jsonb'],'anon',array[]::text[],'3 anon cannot execute');
select table_privs_are('public','news_updates','authenticated',array['SELECT'],'4 direct update writes remain blocked');
select table_privs_are('public','news_followups','authenticated',array['SELECT'],'5 direct followup writes remain blocked');

create temporary table tracking_result as
select public.import_news_tracking_for_post('00000000-0000-0000-0000-000000000501', public.test_tracking_payload('new-topic-ref','new-topic','New Topic')) value;
select is((select value ->> 'postId' from tracking_result),'00000000-0000-0000-0000-000000000501','6 returns post id');
select is((select (value ->> 'topicCount')::int from tracking_result),1,'7 returns topic count');
select is((select (value ->> 'createdTopicCount')::int from tracking_result),1,'8 returns created count');
select is((select (value ->> 'updateCount')::int from tracking_result),1,'9 returns update count');
select is((select (value ->> 'followupCount')::int from tracking_result),1,'10 returns followup count');
select is((select (value ->> 'sourceLinkCount')::int from tracking_result),1,'11 returns source link count');
select is((select count(*)::int from public.news_topics where topic_key='new-topic'),1,'12 creates topic');
select is((select owner_id from public.news_topics where topic_key='new-topic'),'00000000-0000-0000-0000-0000000004a3'::uuid,'13 topic owner is auth uid');
select is((select category_id from public.news_topics where topic_key='new-topic'),'economy','14 topic category comes from post');
select is((select count(*)::int from public.news_status_history where topic_id=(select id from public.news_topics where topic_key='new-topic')),1,'15 creates initial status history');
select is((select item_order from public.news_updates where post_id='00000000-0000-0000-0000-000000000501'),1,'16 preserves item order');
select ok((select news_update_id is not null from public.sources where post_id='00000000-0000-0000-0000-000000000501' and sort_order=0),'17 links source by 1-based order');
select is((select status from public.news_followups where topic_id=(select id from public.news_topics where topic_key='new-topic')),'pending','18 creates pending followup');
select is((select count(*)::int from public.posts where id='00000000-0000-0000-0000-000000000501'),1,'19 content post remains');

create temporary table reuse_result as
select public.import_news_tracking_for_post('00000000-0000-0000-0000-000000000502', public.test_tracking_payload('reuse-ref','reuse-topic','Existing Topic','Existing summary')) value;
select is((select count(*)::int from public.news_topics where topic_key='reuse-topic'),1,'20 reuses exact topic');
select is((select canonical_title from public.news_topics where topic_key='reuse-topic'),'Existing Topic','21 reused title unchanged');
select is((select topic_summary from public.news_topics where topic_key='reuse-topic'),'Existing summary','22 reused summary unchanged');
select is((select status from public.news_topics where topic_key='reuse-topic'),'active','23 reused status unchanged');
select is((select (value ->> 'reusedTopicCount')::int from reuse_result),1,'24 returns reused count');

select lives_ok($$ select public.import_news_tracking_for_post('00000000-0000-0000-0000-000000000503', public.test_tracking_payload('monitor-ref','monitor-topic','Monitor Topic','Monitor summary','monitoring')) $$,'25 monitoring import succeeds');
select is((select status from public.news_topics where topic_key='monitor-topic'),'monitoring','26 monitoring state saved');
select is((select count(*)::int from public.news_status_history where topic_id=(select id from public.news_topics where topic_key='monitor-topic')),2,'27 monitoring state history is complete');

select throws_ok($$ select public.import_news_tracking_for_post('00000000-0000-0000-0000-000000000504', jsonb_set(public.test_tracking_payload('missing-ref','missing-topic','Missing Topic'),'{updates,0,update_type}','"follow_up"'::jsonb) #- '{updates,0,previous_update_external_key}' || '{"updates":[]}'::jsonb) $$,'22023','IMPORT_TRACKING_INVALID_PAYLOAD','28 malformed graph is rejected');
-- A valid-shaped missing reference exercises the stable graph error and rollback.
select throws_ok($$ select public.import_news_tracking_for_post('00000000-0000-0000-0000-000000000504', jsonb_set(jsonb_set(jsonb_set(public.test_tracking_payload('missing-ref','missing-topic','Missing Topic'),'{updates,0,update_type}','"follow_up"'),'{updates,0,change_summary}','"Changed"'),'{updates,0,previous_update_external_key}','"absent-update"')) $$,'22023','IMPORT_TRACKING_MISSING_PREVIOUS','29 missing previous is rejected');
select is((select count(*)::int from public.news_topics where topic_key='missing-topic'),0,'30 missing previous rolls back topic');
select is((select count(*)::int from public.posts where id='00000000-0000-0000-0000-000000000504'),1,'31 tracking failure keeps content');

select throws_ok($$ select public.import_news_tracking_for_post('00000000-0000-0000-0000-000000000505', jsonb_set(public.test_tracking_payload('cycle-ref','cycle-topic','Cycle Topic'),'{updates}', '[{"update_external_key":"cycle-a","topic_external_key":"cycle-ref","update_type":"follow_up","headline":"A","fact_summary":"A","importance_summary":null,"impact_summary":null,"change_summary":"A","previous_update_external_key":"cycle-b","item_order":1,"source_orders":[1]},{"update_external_key":"cycle-b","topic_external_key":"cycle-ref","update_type":"follow_up","headline":"B","fact_summary":"B","importance_summary":null,"impact_summary":null,"change_summary":"B","previous_update_external_key":"cycle-a","item_order":2,"source_orders":[2]}]'::jsonb)) $$,'22023','IMPORT_TRACKING_PREVIOUS_CYCLE','32 cycle is rejected');
select is((select count(*)::int from public.news_updates where post_id='00000000-0000-0000-0000-000000000505'),0,'33 cycle rolls back updates');

select throws_ok($$ select public.import_news_tracking_for_post('00000000-0000-0000-0000-000000000506', jsonb_set(public.test_tracking_payload('source-ref','source-topic','Source Topic'),'{updates,0,source_orders}','[3]'::jsonb)) $$,'22023','IMPORT_TRACKING_SOURCE_NOT_FOUND','34 missing source is rejected');
select is((select count(*)::int from public.sources where post_id='00000000-0000-0000-0000-000000000506' and news_update_id is not null),0,'35 source failure rolls back links');

select throws_ok($$ select public.import_news_tracking_for_post('00000000-0000-0000-0000-000000000507', jsonb_set(jsonb_set(public.test_tracking_payload('follow-ref','follow-topic','Follow Topic'),'{followups,0,status}','"done"'),'{followups,0,resolution_note}','null')) $$,'22023','IMPORT_TRACKING_INVALID_FOLLOWUP','36 invalid followup is rejected');
select is((select count(*)::int from public.news_topics where topic_key='follow-topic'),0,'37 followup failure rolls back topic and update');

select throws_ok($$ select public.import_news_tracking_for_post('00000000-0000-0000-0000-000000000508', jsonb_set(public.test_tracking_payload('order-ref','order-topic','Order Topic'),'{updates}', '[{"update_external_key":"order-a","topic_external_key":"order-ref","update_type":"new","headline":"A","fact_summary":"A","importance_summary":null,"impact_summary":null,"change_summary":null,"previous_update_external_key":null,"item_order":1,"source_orders":[1]},{"update_external_key":"order-b","topic_external_key":"order-ref","update_type":"new","headline":"B","fact_summary":"B","importance_summary":null,"impact_summary":null,"change_summary":null,"previous_update_external_key":null,"item_order":1,"source_orders":[2]}]'::jsonb)) $$,'22023','IMPORT_TRACKING_INVALID_ITEM_ORDER','38 duplicate item order is rejected');
select throws_ok($$ select public.import_news_tracking_for_post('00000000-0000-0000-0000-000000000508', jsonb_set(public.test_tracking_payload('dup-update-ref','dup-update-topic','Dup Update Topic'),'{updates}', '[{"update_external_key":"same-update","topic_external_key":"dup-update-ref","update_type":"new","headline":"A","fact_summary":"A","importance_summary":null,"impact_summary":null,"change_summary":null,"previous_update_external_key":null,"item_order":1,"source_orders":[1]},{"update_external_key":"same-update","topic_external_key":"dup-update-ref","update_type":"new","headline":"B","fact_summary":"B","importance_summary":null,"impact_summary":null,"change_summary":null,"previous_update_external_key":null,"item_order":2,"source_orders":[2]}]'::jsonb)) $$,'22023','IMPORT_TRACKING_DUPLICATE_UPDATE_KEY','39 duplicate update key is rejected');
select throws_ok($$ select public.import_news_tracking_for_post('00000000-0000-0000-0000-000000000508', jsonb_set(public.test_tracking_payload('dup-topic-ref','dup-topic','Dup Topic'),'{topics}', ((public.test_tracking_payload('dup-topic-ref','dup-topic','Dup Topic')->'topics') || (public.test_tracking_payload('dup-topic-ref','other-topic','Other')->'topics')))) $$,'22023','IMPORT_TRACKING_DUPLICATE_TOPIC_KEY','40 duplicate topic external key is rejected');

select throws_ok($$ select public.import_news_tracking_for_post('00000000-0000-0000-0000-0000000005a1', public.test_tracking_payload('ai-ref','ai-topic','AI Topic')) $$,'23514','IMPORT_TRACKING_NOT_NEWS','41 non-news post is rejected');
select throws_ok($$ select public.import_news_tracking_for_post('00000000-0000-0000-0000-0000000005b1', public.test_tracking_payload('other-ref','other-topic','Other Topic')) $$,'42501','IMPORT_TRACKING_INVALID_POST','42 other owner post is hidden');
select throws_ok($$ select public.import_news_tracking_for_post('00000000-0000-0000-0000-000000000599', public.test_tracking_payload('none-ref','none-topic','None Topic')) $$,'42501','IMPORT_TRACKING_INVALID_POST','43 missing post is rejected');
select throws_ok($$ select public.import_news_tracking_for_post('00000000-0000-0000-0000-000000000509', public.test_tracking_payload('conflict-ref','conflict-topic','Changed Title','Original summary')) $$,'23514','IMPORT_TRACKING_TOPIC_CONFLICT','44 existing topic overwrite is rejected');
select throws_ok($$ select public.import_news_tracking_for_post('00000000-0000-0000-0000-000000000510', jsonb_set(public.test_tracking_payload('closed-ref','closed-topic','Closed Topic','Closed summary','closed','Closed reason'),'{followups}','[]'::jsonb)) $$,'22023','IMPORT_TRACKING_INVALID_CLOSURE','45 existing closed topic rejects new update');

select lives_ok($$ select public.import_news_tracking_for_post('00000000-0000-0000-0000-000000000511', jsonb_set(jsonb_set(public.test_tracking_payload('new-closed-ref','new-closed-topic','New Closed Topic','Closed summary','closed','Imported closure'),'{followups}','[]'::jsonb),'{updates}', '[{"update_external_key":"closed-a","topic_external_key":"new-closed-ref","update_type":"new","headline":"Initial","fact_summary":"Initial facts","importance_summary":null,"impact_summary":null,"change_summary":null,"previous_update_external_key":null,"item_order":1,"source_orders":[1]},{"update_external_key":"closed-b","topic_external_key":"new-closed-ref","update_type":"closure_note","headline":"Closed","fact_summary":"Closed facts","importance_summary":null,"impact_summary":null,"change_summary":"Closure","previous_update_external_key":"closed-a","item_order":2,"source_orders":[2]}]'::jsonb)) $$,'46 new closed topic and closure note import succeeds');
select is((select status from public.news_topics where topic_key='new-closed-topic'),'closed','47 closed status saved');
select is((select count(*)::int from public.news_status_history where topic_id=(select id from public.news_topics where topic_key='new-closed-topic')),2,'48 closed history saved');
select is((select update_type from public.news_updates where post_id='00000000-0000-0000-0000-000000000511' and item_order=2),'closure_note','49 closure note saved');

select lives_ok($$ select public.import_news_tracking_for_post('00000000-0000-0000-0000-000000000512', jsonb_set(jsonb_set(jsonb_set(public.test_tracking_payload('done-ref','done-topic','Done Topic'),'{followups,0,status}','"done"'),'{followups,0,resolution_note}','"Verified"'),'{followups,0,resolved_at}','"2026-09-10T10:00:00+09:00"')) $$,'50 resolved followup import succeeds');
select is((select status from public.news_followups where topic_id=(select id from public.news_topics where topic_key='done-topic')),'done','51 done status preserved');
select is((select resolution_note from public.news_followups where topic_id=(select id from public.news_topics where topic_key='done-topic')),'Verified','52 resolution note preserved');
select is((select resolved_at from public.news_followups where topic_id=(select id from public.news_topics where topic_key='done-topic')),'2026-09-10T01:00:00+00:00'::timestamptz,'53 resolved time preserved');
select ok(not ((select value from tracking_result) ? 'ownerId'),'54 result excludes owner id');

set local "request.jwt.claims" = '{"role":"authenticated"}';
select throws_ok($$ select public.import_news_tracking_for_post('00000000-0000-0000-0000-000000000509','{}'::jsonb) $$,'42501','IMPORT_TRACKING_PERMISSION_DENIED','55 missing auth uid is rejected');

select * from finish();
rollback;
