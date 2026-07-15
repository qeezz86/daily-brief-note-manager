begin;
create extension if not exists pgtap with schema extensions;
select plan(80);

insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000004e01','restore-import@example.test'),
 ('00000000-0000-0000-0000-000000004e02','restore-import-other@example.test');

create function public.test_restore_import_record(p_section text,p_source text,p_target uuid,p_stage integer,p_sequence integer,p_action text,p_payload jsonb,p_dependencies jsonb default '[]'::jsonb)
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('section',p_section,'sourceId',p_source,'targetId',p_target,'action',p_action,'stageKey',p_section,'stageOrder',p_stage,'sequenceNo',p_sequence,'payload',p_payload,'payloadFingerprint',public.restore_payload_fingerprint(p_payload),'dependencies',p_dependencies,'safeDisplay',p_source);
$$;

select has_column('public','import_jobs','restored_from_backup','1 provenance flag exists');
select has_column('public','import_jobs','execution_locked','2 execution lock exists');
select has_column('public','import_jobs','restore_origin_checksum','3 restore checksum exists');

insert into public.import_jobs(id,owner_id,format,schema_version,source_name,source_fingerprint,status,expected_item_count,total_count)
values('4e000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000004e01','daily-brief-note-content-import',1,'regular.json',repeat('1',64),'ready',1,1);
select is((select restored_from_backup from public.import_jobs where id='4e000000-0000-0000-0000-000000000001'),false,'4 ordinary job defaults not restored');
select is((select execution_locked from public.import_jobs where id='4e000000-0000-0000-0000-000000000001'),false,'5 ordinary job defaults unlocked');
select is((select restore_origin_checksum from public.import_jobs where id='4e000000-0000-0000-0000-000000000001'),null::text,'6 ordinary job has no origin');
select throws_ok($$ insert into public.import_jobs(owner_id,format,schema_version,source_fingerprint,status,expected_item_count,total_count,restored_from_backup,execution_locked,restore_origin_checksum) values('00000000-0000-0000-0000-000000004e01','daily-brief-note-content-import',1,repeat('2',64),'ready',1,1,true,false,repeat('a',64)) $$,'23514',null::text,'7 restored unlocked combination blocked');
select throws_ok($$ insert into public.import_jobs(owner_id,format,schema_version,source_fingerprint,status,expected_item_count,total_count,restored_from_backup,execution_locked,restore_origin_checksum) values('00000000-0000-0000-0000-000000004e01','daily-brief-note-content-import',1,repeat('3',64),'ready',1,1,true,true,'bad') $$,'23514',null::text,'8 invalid restore checksum blocked');
select lives_ok($$ insert into public.import_jobs(owner_id,format,schema_version,source_fingerprint,status,expected_item_count,total_count,restored_from_backup,execution_locked,restore_origin_checksum) values('00000000-0000-0000-0000-000000004e01','daily-brief-note-content-import',1,repeat('4',64),'ready',1,1,true,true,repeat('a',64)) $$,'9 valid restored provenance accepted');

select function_privs_are('public','append_import_job_items',array['uuid','jsonb'],'authenticated',array['EXECUTE'],'10 authenticated append wrapper');
select function_privs_are('public','finalize_import_job',array['uuid'],'authenticated',array['EXECUTE'],'11 authenticated finalize wrapper');
select function_privs_are('public','run_import_job_item_content',array['uuid'],'authenticated',array['EXECUTE'],'12 authenticated content wrapper');
select function_privs_are('public','run_import_job_item_tracking',array['uuid'],'authenticated',array['EXECUTE'],'13 authenticated tracking wrapper');
select function_privs_are('public','cancel_import_job',array['uuid'],'authenticated',array['EXECUTE'],'14 authenticated cancel wrapper');
select function_privs_are('public','resume_cancelled_import_job',array['uuid'],'authenticated',array['EXECUTE'],'15 authenticated resume wrapper');
select function_privs_are('public','append_import_job_items',array['uuid','jsonb'],'anon',array[]::text[],'16 anon append denied');
select function_privs_are('public','restore_apply_import_record',array['restore_job_records','text'],'authenticated',array[]::text[],'17 private restore helper denied');

set local role authenticated;
set local "request.jwt.claims"='{"sub":"00000000-0000-0000-0000-000000004e01","role":"authenticated"}';
select ok((public.get_user_backup_snapshot('core')->'data') ? 'posts','18 core snapshot succeeds');
select ok(not ((public.get_user_backup_snapshot('core')->'data') ? 'importJobs'),'19 core snapshot excludes operational data');
select ok((public.get_user_backup_snapshot('full')->'data') ? 'importJobs','20 full snapshot includes operational data');
select ok(exists(select 1 from jsonb_array_elements(public.get_user_backup_snapshot('full')#>'{data,importJobs}') row where row->>'id'='4e000000-0000-0000-0000-000000000001' and row->>'restoredFromBackup'='false'),'21 full snapshot writes restored flag');
select ok(exists(select 1 from jsonb_array_elements(public.get_user_backup_snapshot('full')#>'{data,importJobs}') row where row->>'id'='4e000000-0000-0000-0000-000000000001' and row->>'executionLocked'='false'),'22 full snapshot writes lock flag');
select ok(exists(select 1 from jsonb_array_elements(public.get_user_backup_snapshot('full')#>'{data,importJobs}') row where row->>'id'='4e000000-0000-0000-0000-000000000001' and row ? 'restoreOriginChecksum'),'23 full snapshot writes nullable origin');
select throws_ok($$ select public.create_restore_job('daily-brief-note-backup',1,'core',repeat('5',64),'daily-brief-note-restore-plan',1,1,repeat('5',64),repeat('f',64),'ready','core.json','{"operationalHistory":"include"}','[]','[]',1) $$,'23514','RESTORE_INVALID_PAYLOAD','24 core operational include blocked');

create temporary table op_job as select public.create_restore_job(
 'daily-brief-note-backup',1,'full',repeat('a',64),'daily-brief-note-restore-plan',1,1,repeat('a',64),repeat('f',64),'ready','full.json',
 '{"operationalHistory":"include","timestamps":"preserve"}'::jsonb,'[]'::jsonb,
 '[{"name":"tags"},{"name":"importJobs"},{"name":"importJobItems"},{"name":"importJobItemAttempts"}]'::jsonb,4
) value;
select is((select value->>'status' from op_job),'preparing','25 full operational job accepted');

create temporary table op_payloads as select
 '{"name":"Audit tag","normalizedName":"audit tag","createdAt":"2026-07-15T00:00:00Z"}'::jsonb tag_payload,
 jsonb_build_object('id','4e100000-0000-0000-0000-000000000001','format','daily-brief-note-content-import','schemaVersion',1,'sourceName','history.json','sourceFingerprint',repeat('b',64),'status','completed_with_errors','expectedItemCount',1,'totalCount',1,'readyCount',1,'warningCount',0,'invalidCount',0,'duplicateCount',0,'acknowledgedWarningCount',0,'dryRunSummary','{}'::jsonb,'startedAt','2026-07-15T00:00:00Z','completedAt','2026-07-15T00:01:00Z','cancelledAt',null,'createdAt','2026-07-15T00:00:00Z','updatedAt','2026-07-15T00:01:00Z') job_payload,
 jsonb_build_object('id','4e200000-0000-0000-0000-000000000001','jobId','4e100000-0000-0000-0000-000000000001','postId',null,'itemIndex',0,'externalKey','item-1','payloadFingerprint','28bee001321848192954f5b913d6c226994f6014bc2db2be1425a4ccb1f50e23','title','게시물','categoryId','economy','validationStatus','ready','normalizedPayload','{"schemaVersion":1,"externalKey":"item-1","contentGroup":"news","content":{"category_id":"economy","title":"게시물"},"tracking":null}'::jsonb,'warningAcknowledged',false,'contentStatus','failed','trackingStatus','not_present','contentAttemptCount',1,'trackingAttemptCount',0,'contentErrorCode','IMPORT_TEMPORARY_DATABASE_ERROR','contentErrorMessage','safe failure','contentRetryable',true,'trackingErrorCode',null,'trackingErrorMessage',null,'trackingRetryable',false,'topicCount',null,'reusedTopicCount',null,'createdTopicCount',null,'updateCount',null,'followupCount',null,'sourceLinkCount',null,'contentStartedAt','2026-07-15T00:00:00Z','contentCompletedAt','2026-07-15T00:00:30Z','trackingStartedAt',null,'trackingCompletedAt',null,'createdAt','2026-07-15T00:00:00Z','updatedAt','2026-07-15T00:01:00Z') item_payload,
 jsonb_build_object('id','4e300000-0000-0000-0000-000000000001','jobItemId','4e200000-0000-0000-0000-000000000001','stage','content','attemptNo',1,'status','failed','safeErrorCode','IMPORT_TEMPORARY_DATABASE_ERROR','safeErrorMessage','safe failure','retryable',true,'startedAt','2026-07-15T00:00:00Z','completedAt','2026-07-15T00:00:30Z') attempt_payload;

select is((public.append_restore_job_records((select (value->>'jobId')::uuid from op_job),jsonb_build_array(
 public.test_restore_import_record('tags','audit-tag','4e400000-0000-0000-0000-000000000001',1,0,'preserve_id',(select tag_payload from op_payloads)),
 public.test_restore_import_record('importJobs','4e100000-0000-0000-0000-000000000001','4e100000-0000-0000-0000-000000000001',2,0,'preserve_id',(select job_payload from op_payloads)),
 public.test_restore_import_record('importJobItems','4e200000-0000-0000-0000-000000000001','4e200000-0000-0000-0000-000000000001',3,0,'preserve_id',(select item_payload from op_payloads),'["importJobs:4e100000-0000-0000-0000-000000000001"]'),
 public.test_restore_import_record('importJobItemAttempts','4e300000-0000-0000-0000-000000000001','4e300000-0000-0000-0000-000000000001',4,0,'preserve_id',(select attempt_payload from op_payloads),'["importJobItems:4e200000-0000-0000-0000-000000000001"]')
 )))->>'appendedCount','4','26 operational records appended');
select is((select count(*)::text from public.restore_job_records where job_id=(select (value->>'jobId')::uuid from op_job)),'4','27 four snapshots stored');
select is((public.finalize_restore_job((select (value->>'jobId')::uuid from op_job))->>'status'),'ready','28 operational preflight ready');
select is((select current_stage_key from public.restore_jobs where id=(select (value->>'jobId')::uuid from op_job)),'tags','29 core stage starts first');
select throws_ok($$ select public.run_restore_job_record((select id from public.restore_job_records where job_id=(select (value->>'jobId')::uuid from op_job) and section='importJobItemAttempts')) $$,'23514','RESTORE_STAGE_BLOCKED','30 attempts blocked before core');
select is((public.run_restore_job_record((select id from public.restore_job_records where job_id=(select (value->>'jobId')::uuid from op_job) and section='tags'))->>'status'),'applied','31 core tag applied');
select throws_ok($$ select public.run_restore_job_record((select id from public.restore_job_records where job_id=(select (value->>'jobId')::uuid from op_job) and section='importJobItems')) $$,'23514','RESTORE_STAGE_BLOCKED','32 item blocked before job');
select is((public.run_restore_job_record((select id from public.restore_job_records where job_id=(select (value->>'jobId')::uuid from op_job) and section='importJobs'))->>'status'),'applied','33 import job applied');
select is((public.run_restore_job_record((select id from public.restore_job_records where job_id=(select (value->>'jobId')::uuid from op_job) and section='importJobItems'))->>'status'),'applied','34 import item applied');
select is((public.run_restore_job_record((select id from public.restore_job_records where job_id=(select (value->>'jobId')::uuid from op_job) and section='importJobItemAttempts'))->>'status'),'applied','35 import attempt applied');
select is((select status from public.restore_jobs where id=(select (value->>'jobId')::uuid from op_job)),'completed','36 restore job completed');
select ok(exists(select 1 from public.import_jobs where id='4e100000-0000-0000-0000-000000000001'),'37 import job ID preserved');
select is((select owner_id from public.import_jobs where id='4e100000-0000-0000-0000-000000000001'),'00000000-0000-0000-0000-000000004e01'::uuid,'38 owner injected');
select is((select restored_from_backup from public.import_jobs where id='4e100000-0000-0000-0000-000000000001'),true,'39 restored provenance set');
select is((select execution_locked from public.import_jobs where id='4e100000-0000-0000-0000-000000000001'),true,'40 execution locked set');
select is((select restore_origin_checksum from public.import_jobs where id='4e100000-0000-0000-0000-000000000001'),repeat('a',64),'41 origin checksum stored');
select is((select status from public.import_jobs where id='4e100000-0000-0000-0000-000000000001'),'completed_with_errors','42 original status preserved');
select is((select started_at from public.import_jobs where id='4e100000-0000-0000-0000-000000000001'),'2026-07-15T00:00:00Z'::timestamptz,'43 start time preserved');
select is((select completed_at from public.import_jobs where id='4e100000-0000-0000-0000-000000000001'),'2026-07-15T00:01:00Z'::timestamptz,'44 completion time preserved');
select is((select created_at from public.import_jobs where id='4e100000-0000-0000-0000-000000000001'),'2026-07-15T00:00:00Z'::timestamptz,'45 created time preserved');
select is((select updated_at from public.import_jobs where id='4e100000-0000-0000-0000-000000000001'),'2026-07-15T00:01:00Z'::timestamptz,'46 updated time preserved');
select ok(exists(select 1 from public.import_job_items where id='4e200000-0000-0000-0000-000000000001'),'47 item ID preserved');
select is((select job_id from public.import_job_items where id='4e200000-0000-0000-0000-000000000001'),'4e100000-0000-0000-0000-000000000001'::uuid,'48 item parent mapped');
select is((select post_id from public.import_job_items where id='4e200000-0000-0000-0000-000000000001'),null::uuid,'49 nullable post preserved');
select is((select normalized_payload from public.import_job_items where id='4e200000-0000-0000-0000-000000000001'),(select item_payload->'normalizedPayload' from op_payloads),'50 normalized payload preserved');
select is((select content_status from public.import_job_items where id='4e200000-0000-0000-0000-000000000001'),'failed','51 content status preserved');
select is((select tracking_status from public.import_job_items where id='4e200000-0000-0000-0000-000000000001'),'not_present','52 tracking status preserved');
select is((select content_attempt_count from public.import_job_items where id='4e200000-0000-0000-0000-000000000001'),1,'53 content attempt count preserved');
select ok(exists(select 1 from public.import_job_item_attempts where id='4e300000-0000-0000-0000-000000000001'),'54 attempt ID preserved');
select is((select job_item_id from public.import_job_item_attempts where id='4e300000-0000-0000-0000-000000000001'),'4e200000-0000-0000-0000-000000000001'::uuid,'55 attempt parent mapped');
select is((select stage from public.import_job_item_attempts where id='4e300000-0000-0000-0000-000000000001'),'content','56 attempt stage preserved');
select is((select status from public.import_job_item_attempts where id='4e300000-0000-0000-0000-000000000001'),'failed','57 attempt status preserved');
select is((select attempt_no from public.import_job_item_attempts where id='4e300000-0000-0000-0000-000000000001'),1,'58 attempt number preserved');
select throws_ok($$ select public.append_import_job_items('4e100000-0000-0000-0000-000000000001','[]') $$,'23514','IMPORT_JOB_EXECUTION_LOCKED','59 locked append blocked');
select throws_ok($$ select public.finalize_import_job('4e100000-0000-0000-0000-000000000001') $$,'23514','IMPORT_JOB_EXECUTION_LOCKED','60 locked finalize blocked');
select throws_ok($$ select public.run_import_job_item_content('4e200000-0000-0000-0000-000000000001') $$,'23514','IMPORT_JOB_EXECUTION_LOCKED','61 locked content blocked');
select throws_ok($$ select public.run_import_job_item_tracking('4e200000-0000-0000-0000-000000000001') $$,'23514','IMPORT_JOB_EXECUTION_LOCKED','62 locked tracking blocked');
select throws_ok($$ select public.cancel_import_job('4e100000-0000-0000-0000-000000000001') $$,'23514','IMPORT_JOB_EXECUTION_LOCKED','63 locked cancel blocked');
select throws_ok($$ select public.resume_cancelled_import_job('4e100000-0000-0000-0000-000000000001') $$,'23514','IMPORT_JOB_EXECUTION_LOCKED','64 locked resume blocked');
select throws_ok($$ update public.import_jobs set execution_locked=false where id='4e100000-0000-0000-0000-000000000001' $$,'42501',null::text,'65 direct unlock denied');
select is((public.create_import_job('daily-brief-note-content-import',1,'again.json',repeat('b',64),1,'{}')->>'isExisting'),'true','66 source fingerprint finds existing locked history');
select is((public.get_import_job('4e100000-0000-0000-0000-000000000001')->>'executionLocked'),'true','67 detail exposes lock');
select ok(exists(select 1 from jsonb_array_elements(public.get_import_jobs(null,null,null,null,100)) row where row->>'id'='4e100000-0000-0000-0000-000000000001' and row->>'restoredFromBackup'='true'),'68 list exposes restored badge data');
select ok(exists(select 1 from jsonb_array_elements(public.get_user_backup_snapshot('full')#>'{data,importJobs}') row where row->>'id'='4e100000-0000-0000-0000-000000000001' and row->>'restoreOriginChecksum'=repeat('a',64)),'69 future full backup preserves origin');

set local role postgres;
insert into public.import_jobs(id,owner_id,format,schema_version,source_name,source_fingerprint,status,expected_item_count,total_count,ready_count,dry_run_summary,started_at,completed_at,created_at,updated_at)
values('4e500000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000004e01','daily-brief-note-content-import',1,'ordinary-history.json',repeat('c',64),'completed_with_errors',1,1,1,'{}','2026-07-15T00:00:00Z','2026-07-15T00:01:00Z','2026-07-15T00:00:00Z','2026-07-15T00:01:00Z');
insert into public.import_job_items(id,owner_id,job_id,item_index,external_key,payload_fingerprint,title,category_id,validation_status,normalized_payload,content_status,tracking_status,content_attempt_count,content_error_code,content_error_message,content_retryable,content_started_at,content_completed_at,created_at,updated_at)
values('4e600000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000004e01','4e500000-0000-0000-0000-000000000001',0,'item-1','28bee001321848192954f5b913d6c226994f6014bc2db2be1425a4ccb1f50e23','게시물','economy','ready','{"schemaVersion":1,"externalKey":"item-1","contentGroup":"news","content":{"category_id":"economy","title":"게시물"},"tracking":null}','failed','not_present',1,'IMPORT_TEMPORARY_DATABASE_ERROR','safe failure',true,'2026-07-15T00:00:00Z','2026-07-15T00:00:30Z','2026-07-15T00:00:00Z','2026-07-15T00:01:00Z');
insert into public.import_job_item_attempts(id,owner_id,job_item_id,stage,attempt_no,status,safe_error_code,safe_error_message,retryable,started_at,completed_at)
values('4e700000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000004e01','4e600000-0000-0000-0000-000000000001','content',1,'failed','IMPORT_TEMPORARY_DATABASE_ERROR','safe failure',true,'2026-07-15T00:00:00Z','2026-07-15T00:00:30Z');
set local role authenticated;
set local "request.jwt.claims"='{"sub":"00000000-0000-0000-0000-000000004e01","role":"authenticated"}';
create temporary table reuse_job as select public.create_restore_job('daily-brief-note-backup',1,'full',repeat('d',64),'daily-brief-note-restore-plan',1,1,repeat('d',64),repeat('f',64),'ready','reuse.json','{"operationalHistory":"include","timestamps":"preserve"}','[]','[]',4) value;
select is((select value->>'status' from reuse_job),'preparing','70 reuse restore job created');
select is((public.append_restore_job_records((select (value->>'jobId')::uuid from reuse_job),jsonb_build_array(
 public.test_restore_import_record('tags','reuse-tag','4e800000-0000-0000-0000-000000000001',1,0,'preserve_id','{"name":"Reuse tag","normalizedName":"reuse tag","createdAt":"2026-07-15T00:00:00Z"}'),
 public.test_restore_import_record('importJobs','4e500000-0000-0000-0000-000000000001','4e500000-0000-0000-0000-000000000001',2,0,'reuse_existing',(select job_payload || jsonb_build_object('id','4e500000-0000-0000-0000-000000000001','sourceName','ordinary-history.json','sourceFingerprint',repeat('c',64)) from op_payloads)),
 public.test_restore_import_record('importJobItems','4e600000-0000-0000-0000-000000000001','4e600000-0000-0000-0000-000000000001',3,0,'reuse_existing',(select item_payload || jsonb_build_object('id','4e600000-0000-0000-0000-000000000001','jobId','4e500000-0000-0000-0000-000000000001') from op_payloads),'["importJobs:4e500000-0000-0000-0000-000000000001"]'),
 public.test_restore_import_record('importJobItemAttempts','4e700000-0000-0000-0000-000000000001','4e700000-0000-0000-0000-000000000001',4,0,'reuse_existing',(select attempt_payload || jsonb_build_object('id','4e700000-0000-0000-0000-000000000001','jobItemId','4e600000-0000-0000-0000-000000000001') from op_payloads),'["importJobItems:4e600000-0000-0000-0000-000000000001"]')
 )))->>'appendedCount','4','71 reuse snapshots appended');
select is((public.finalize_restore_job((select (value->>'jobId')::uuid from reuse_job))->>'status'),'ready','72 reuse preflight ready');
select is((public.run_restore_job_record((select id from public.restore_job_records where job_id=(select (value->>'jobId')::uuid from reuse_job) and section='tags'))->>'status'),'applied','73 reuse core stage applied');
select is((public.run_restore_job_record((select id from public.restore_job_records where job_id=(select (value->>'jobId')::uuid from reuse_job) and section='importJobs'))->>'status'),'reused','74 exact job reused');
select is((public.run_restore_job_record((select id from public.restore_job_records where job_id=(select (value->>'jobId')::uuid from reuse_job) and section='importJobItems'))->>'status'),'reused','75 exact item reused');
select is((public.run_restore_job_record((select id from public.restore_job_records where job_id=(select (value->>'jobId')::uuid from reuse_job) and section='importJobItemAttempts'))->>'status'),'reused','76 exact attempt reused');
select is((select status from public.restore_jobs where id=(select (value->>'jobId')::uuid from reuse_job)),'completed','77 reuse restore completed');
select is((select execution_locked from public.import_jobs where id='4e500000-0000-0000-0000-000000000001'),false,'78 reused ordinary job remains unlocked');
select is((select restore_origin_checksum from public.import_jobs where id='4e500000-0000-0000-0000-000000000001'),null::text,'79 reused ordinary job origin unchanged');
select is((select restored_from_backup from public.import_jobs where id='4e500000-0000-0000-0000-000000000001'),false,'80 reused ordinary job provenance unchanged');

select * from finish();
rollback;
