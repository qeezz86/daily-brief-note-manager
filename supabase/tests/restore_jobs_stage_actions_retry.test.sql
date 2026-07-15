begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000004e01','restore-action@example.test'),
 ('00000000-0000-0000-0000-000000004e02','restore-action-other@example.test');

create function public.test_restore_action_job(p_hash text,p_count integer) returns uuid language sql set search_path='' as $$
 select (public.create_restore_job('daily-brief-note-backup',1,'core',p_hash,'daily-brief-note-restore-plan',1,1,repeat(substr(p_hash,1,1),64),repeat('f',64),'ready','action.json','{"operationalHistory":"exclude","timestamps":"preserve"}','[]','[]',p_count)->>'jobId')::uuid;
$$;
create function public.test_restore_action_record(p_source text,p_target uuid,p_stage integer,p_sequence integer,p_action text default 'preserve_id',p_name text default 'Tag') returns jsonb language sql security definer set search_path='' as $$
 with payload as (select jsonb_build_object('name',p_name,'normalizedName',lower(p_name),'createdAt','2026-07-15T00:00:00Z') value)
 select jsonb_build_object('section','tags','sourceId',p_source,'targetId',p_target,'action',p_action,'stageKey','stage-'||p_stage,'stageOrder',p_stage,'sequenceNo',p_sequence,'payload',value,'payloadFingerprint',public.restore_payload_fingerprint(value),'dependencies','[]'::jsonb,'safeDisplay',p_name) from payload;
$$;
create function public.test_restore_action_generic(p_section text,p_source text,p_target text,p_stage integer,p_sequence integer,p_action text,p_payload jsonb,p_dependencies jsonb default '[]') returns jsonb language sql security definer set search_path='' as $$ select jsonb_build_object('section',p_section,'sourceId',p_source,'targetId',p_target,'action',p_action,'stageKey','stage-'||p_stage,'stageOrder',p_stage,'sequenceNo',p_sequence,'payload',p_payload,'payloadFingerprint',public.restore_payload_fingerprint(p_payload),'dependencies',p_dependencies,'safeDisplay',p_source) $$;

set local role authenticated;
set local "request.jwt.claims"='{"sub":"00000000-0000-0000-0000-000000004e01","role":"authenticated"}';

create temporary table action_jobs(name text primary key,id uuid);
insert into action_jobs values('preserve',public.test_restore_action_job(repeat('a',64),1));
select public.append_restore_job_records((select id from action_jobs where name='preserve'),jsonb_build_array(public.test_restore_action_record('preserve','4e100000-0000-0000-0000-000000000001',1,0)));
select public.finalize_restore_job((select id from action_jobs where name='preserve'));
select is((public.run_restore_job_record((select id from public.restore_job_records where job_id=(select id from action_jobs where name='preserve')))->>'status'),'applied','1 preserve action applies');
select is((select owner_id from public.tags where id='4e100000-0000-0000-0000-000000000001'),'00000000-0000-0000-0000-000000004e01'::uuid,'2 domain owner injected');
select is((public.run_restore_job_record((select id from public.restore_job_records where job_id=(select id from action_jobs where name='preserve')))->>'idempotent'),'true','3 successful recall idempotent');
select is((select count(*)::int from public.restore_job_record_attempts where restore_job_record_id=(select id from public.restore_job_records where job_id=(select id from action_jobs where name='preserve'))),1,'4 idempotent recall adds no attempt');

insert into action_jobs values('remap',public.test_restore_action_job(repeat('b',64),1));
select public.append_restore_job_records((select id from action_jobs where name='remap'),jsonb_build_array(public.test_restore_action_record('remap','4e100000-0000-0000-0000-000000000002',1,0,'remap_id','Remap')));
select public.finalize_restore_job((select id from action_jobs where name='remap'));
select is((public.run_restore_job_record((select id from public.restore_job_records where job_id=(select id from action_jobs where name='remap')))->>'status'),'applied','5 remap action applies');

insert into action_jobs values('create',public.test_restore_action_job(repeat('c',64),1));
select public.append_restore_job_records((select id from action_jobs where name='create'),jsonb_build_array(public.test_restore_action_record('create','4e100000-0000-0000-0000-000000000003',1,0,'create','Create')));
select public.finalize_restore_job((select id from action_jobs where name='create'));
select is((public.run_restore_job_record((select id from public.restore_job_records where job_id=(select id from action_jobs where name='create')))->>'status'),'applied','6 create action applies');

set local role postgres;
insert into public.tags(id,owner_id,name,normalized_name) values('4e100000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000004e01','Reuse','reuse'),('4e100000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000004e01','Skip','skip');
set local role authenticated;
set local "request.jwt.claims"='{"sub":"00000000-0000-0000-0000-000000004e01","role":"authenticated"}';
insert into action_jobs values('reuse',public.test_restore_action_job(repeat('d',64),1));
select public.append_restore_job_records((select id from action_jobs where name='reuse'),jsonb_build_array(public.test_restore_action_record('reuse','4e100000-0000-0000-0000-000000000004',1,0,'reuse_existing','Reuse')));
select public.finalize_restore_job((select id from action_jobs where name='reuse'));
select is((public.run_restore_job_record((select id from public.restore_job_records where job_id=(select id from action_jobs where name='reuse')))->>'status'),'reused','7 exact reuse succeeds');
select is((select count(*)::int from public.tags where id='4e100000-0000-0000-0000-000000000004'),1,'8 reuse creates no duplicate');

insert into action_jobs values('reuse-mismatch',public.test_restore_action_job(repeat('e',64),1));
select public.append_restore_job_records((select id from action_jobs where name='reuse-mismatch'),jsonb_build_array(public.test_restore_action_record('reuse-mismatch','4e100000-0000-0000-0000-000000000004',1,0,'reuse_existing','Changed')));
select public.finalize_restore_job((select id from action_jobs where name='reuse-mismatch'));
select is((public.run_restore_job_record((select id from public.restore_job_records where job_id=(select id from action_jobs where name='reuse-mismatch')))->>'status'),'failed','9 reuse mismatch fails');
select is((select error_code from public.restore_job_records where job_id=(select id from action_jobs where name='reuse-mismatch')),'RESTORE_REUSE_MISMATCH','10 reuse mismatch safe code stored');
select is((select retryable from public.restore_job_records where job_id=(select id from action_jobs where name='reuse-mismatch')),false,'11 reuse mismatch is not retryable');
select ok(position('constraint' in coalesce((select error_message from public.restore_job_records where job_id=(select id from action_jobs where name='reuse-mismatch')),''))=0,'12 raw constraint is not exposed');

insert into action_jobs values('skip',public.test_restore_action_job(repeat('5',64),1));
select public.append_restore_job_records((select id from action_jobs where name='skip'),jsonb_build_array(public.test_restore_action_record('skip','4e100000-0000-0000-0000-000000000005',1,0,'skip','Skip')));
select public.finalize_restore_job((select id from action_jobs where name='skip'));
select is((public.run_restore_job_record((select id from public.restore_job_records where job_id=(select id from action_jobs where name='skip')))->>'status'),'skipped','13 exact skip succeeds');

insert into action_jobs values('skip-mismatch',public.test_restore_action_job(repeat('6',64),1));
select public.append_restore_job_records((select id from action_jobs where name='skip-mismatch'),jsonb_build_array(public.test_restore_action_record('skip-mismatch','4e100000-0000-0000-0000-000000000005',1,0,'skip','Changed')));
select public.finalize_restore_job((select id from action_jobs where name='skip-mismatch'));
select is((public.run_restore_job_record((select id from public.restore_job_records where job_id=(select id from action_jobs where name='skip-mismatch')))->>'errorCode'),'RESTORE_SKIP_MISMATCH','14 skip mismatch safe code returned');

insert into action_jobs values('target-stale',public.test_restore_action_job(repeat('7',64),1));
select public.append_restore_job_records((select id from action_jobs where name='target-stale'),jsonb_build_array(public.test_restore_action_record('target-stale','4e100000-0000-0000-0000-000000000006',1,0,'preserve_id','StaleTarget')));
select public.finalize_restore_job((select id from action_jobs where name='target-stale'));
set local role postgres; insert into public.tags(id,owner_id,name,normalized_name) values('4e100000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000004e02','Occupied','occupied'); set local role authenticated; set local "request.jwt.claims"='{"sub":"00000000-0000-0000-0000-000000004e01","role":"authenticated"}';
select is((public.run_restore_job_record((select id from public.restore_job_records where job_id=(select id from action_jobs where name='target-stale')))->>'errorCode'),'RESTORE_TARGET_ID_CONFLICT','15 new target conflict detected at run');
select is((select count(*)::int from public.restore_job_record_attempts where restore_job_record_id=(select id from public.restore_job_records where job_id=(select id from action_jobs where name='target-stale'))),1,'16 target conflict records failed attempt');

insert into action_jobs values('unique-stale',public.test_restore_action_job(repeat('8',64),1));
select public.append_restore_job_records((select id from action_jobs where name='unique-stale'),jsonb_build_array(public.test_restore_action_record('unique-stale','4e100000-0000-0000-0000-000000000007',1,0,'preserve_id','Unique')));
select public.finalize_restore_job((select id from action_jobs where name='unique-stale'));
set local role postgres; insert into public.tags(id,owner_id,name,normalized_name) values('4e100000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000004e01','Unique','unique'); set local role authenticated; set local "request.jwt.claims"='{"sub":"00000000-0000-0000-0000-000000004e01","role":"authenticated"}';
select is((public.run_restore_job_record((select id from public.restore_job_records where job_id=(select id from action_jobs where name='unique-stale')))->>'errorCode'),'RESTORE_UNIQUE_KEY_CONFLICT','17 new unique key conflict detected');
select is((select count(*)::int from public.tags where id='4e100000-0000-0000-0000-000000000007'),0,'18 failed domain insert rolls back');

insert into action_jobs values('stages',public.test_restore_action_job(repeat('9',64),2));
select public.append_restore_job_records((select id from action_jobs where name='stages'),jsonb_build_array(public.test_restore_action_record('stage-one','4e100000-0000-0000-0000-000000000009',1,0,'preserve_id','StageOne'),public.test_restore_action_record('stage-two','4e100000-0000-0000-0000-000000000010',2,0,'preserve_id','StageTwo')));
select public.finalize_restore_job((select id from action_jobs where name='stages'));
select is((public.run_restore_job_record((select id from public.restore_job_records where job_id=(select id from action_jobs where name='stages') and source_id='stage-one'))->>'status'),'applied','19 first stage allowed');
select is((public.run_restore_job_record((select id from public.restore_job_records where job_id=(select id from action_jobs where name='stages') and source_id='stage-two'))->>'status'),'applied','20 terminal prior stage allows next');
select is((select status from public.restore_jobs where id=(select id from action_jobs where name='stages')),'completed','21 last stage completes job');

insert into action_jobs values('sequence',public.test_restore_action_job(repeat('0',64),2));
select public.append_restore_job_records((select id from action_jobs where name='sequence'),jsonb_build_array(public.test_restore_action_record('seq-one','4e100000-0000-0000-0000-000000000011',1,0,'preserve_id','SeqOne'),public.test_restore_action_record('seq-two','4e100000-0000-0000-0000-000000000012',1,1,'preserve_id','SeqTwo')));
select public.finalize_restore_job((select id from action_jobs where name='sequence'));
select throws_ok($$ select public.run_restore_job_record((select id from public.restore_job_records where job_id=(select id from action_jobs where name='sequence') and source_id='seq-two')) $$,'23514','RESTORE_STAGE_BLOCKED','22 later sequence blocked while earlier pending');
select is((public.run_restore_job_record((select id from public.restore_job_records where job_id=(select id from action_jobs where name='sequence') and source_id='seq-one'))->>'status'),'applied','23 sequence first applies');
select is((public.run_restore_job_record((select id from public.restore_job_records where job_id=(select id from action_jobs where name='sequence') and source_id='seq-two'))->>'status'),'applied','24 sequence second applies after first');

insert into action_jobs values('cancel',public.test_restore_action_job(repeat('f',64),2));
select public.append_restore_job_records((select id from action_jobs where name='cancel'),jsonb_build_array(public.test_restore_action_record('keep','4e100000-0000-0000-0000-000000000013',1,0,'preserve_id','Keep'),public.test_restore_action_record('cancelled','4e100000-0000-0000-0000-000000000014',2,0,'preserve_id','Cancelled')));
select public.finalize_restore_job((select id from action_jobs where name='cancel'));
select public.run_restore_job_record((select id from public.restore_job_records where job_id=(select id from action_jobs where name='cancel') and source_id='keep'));
select is((public.cancel_restore_job((select id from action_jobs where name='cancel'))->>'cancelledCount')::int,1,'25 cancel changes pending only');
select is((select status from public.restore_job_records where job_id=(select id from action_jobs where name='cancel') and source_id='keep'),'applied','26 cancel preserves successful record');
select is((select count(*)::int from public.tags where id='4e100000-0000-0000-0000-000000000013'),1,'27 cancel keeps successful domain row');
select is((public.resume_cancelled_restore_job((select id from action_jobs where name='cancel'))->>'resumedCount')::int,1,'28 cancelled job resumes pending work');

set local role postgres; update public.restore_job_records set status='cancelled' where job_id=(select id from action_jobs where name='cancel') and source_id='cancelled'; update public.restore_jobs set status='cancelled' where id=(select id from action_jobs where name='cancel'); insert into public.tags(id,owner_id,name,normalized_name) values('4e100000-0000-0000-0000-000000000014','00000000-0000-0000-0000-000000004e02','ResumeOccupied','resumeoccupied'); set local role authenticated; set local "request.jwt.claims"='{"sub":"00000000-0000-0000-0000-000000004e01","role":"authenticated"}';
select throws_ok($$ select public.resume_cancelled_restore_job((select id from action_jobs where name='cancel')) $$,'23514','RESTORE_PLAN_STALE','29 stale cancelled job cannot resume');

set local "request.jwt.claims"='{"sub":"00000000-0000-0000-0000-000000004e02","role":"authenticated"}';
select throws_ok($$ select public.run_restore_job_record((select id from public.restore_job_records where job_id=(select id from action_jobs where name='preserve'))) $$,'42501','RESTORE_PERMISSION_DENIED','30 other user cannot run record');
select is((select count(*)::int from public.restore_job_record_attempts),0,'31 other user cannot read attempts');

set local "request.jwt.claims"='{"sub":"00000000-0000-0000-0000-000000004e01","role":"authenticated"}';
insert into action_jobs values('barrier-status',public.test_restore_action_job(repeat('1',64),2));
select public.append_restore_job_records((select id from action_jobs where name='barrier-status'),jsonb_build_array(public.test_restore_action_record('barrier-prior','4e100000-0000-0000-0000-000000000020',1,0,'preserve_id','BarrierPrior'),public.test_restore_action_record('barrier-next','4e100000-0000-0000-0000-000000000021',2,0,'preserve_id','BarrierNext'))); select public.finalize_restore_job((select id from action_jobs where name='barrier-status'));
select throws_ok($$ select public.run_restore_job_record((select id from public.restore_job_records where job_id=(select id from action_jobs where name='barrier-status') and source_id='barrier-next')) $$,'23514','RESTORE_STAGE_BLOCKED','32 prior pending blocks next stage');
set local role postgres; update public.restore_job_records set status='running' where job_id=(select id from action_jobs where name='barrier-status') and source_id='barrier-prior'; set local role authenticated; set local "request.jwt.claims"='{"sub":"00000000-0000-0000-0000-000000004e01","role":"authenticated"}';
select throws_ok($$ select public.run_restore_job_record((select id from public.restore_job_records where job_id=(select id from action_jobs where name='barrier-status') and source_id='barrier-next')) $$,'23514','RESTORE_STAGE_BLOCKED','33 prior running blocks next stage');
set local role postgres; update public.restore_job_records set status='failed' where job_id=(select id from action_jobs where name='barrier-status') and source_id='barrier-prior'; set local role authenticated; set local "request.jwt.claims"='{"sub":"00000000-0000-0000-0000-000000004e01","role":"authenticated"}';
select throws_ok($$ select public.run_restore_job_record((select id from public.restore_job_records where job_id=(select id from action_jobs where name='barrier-status') and source_id='barrier-next')) $$,'23514','RESTORE_STAGE_BLOCKED','34 prior failed blocks next stage');
set local role postgres; update public.restore_job_records set status='cancelled' where job_id=(select id from action_jobs where name='barrier-status') and source_id='barrier-prior'; set local role authenticated; set local "request.jwt.claims"='{"sub":"00000000-0000-0000-0000-000000004e01","role":"authenticated"}';
select throws_ok($$ select public.run_restore_job_record((select id from public.restore_job_records where job_id=(select id from action_jobs where name='barrier-status') and source_id='barrier-next')) $$,'23514','RESTORE_STAGE_BLOCKED','35 prior cancelled blocks next stage');
set local role postgres; update public.restore_job_records set status='reused' where job_id=(select id from action_jobs where name='barrier-status') and source_id='barrier-prior'; set local role authenticated; set local "request.jwt.claims"='{"sub":"00000000-0000-0000-0000-000000004e01","role":"authenticated"}';
select is((public.run_restore_job_record((select id from public.restore_job_records where job_id=(select id from action_jobs where name='barrier-status') and source_id='barrier-next'))->>'status'),'applied','36 terminal reused prior allows next stage');
select is((select status from public.restore_jobs where id=(select id from action_jobs where name='barrier-status')),'completed','37 terminal stages complete job');
select is((select status from public.restore_jobs where id=(select id from action_jobs where name='reuse-mismatch')),'paused_with_errors','38 failed final stage pauses job');

insert into action_jobs values('retry',public.test_restore_action_job(repeat('2',64),3));
select public.append_restore_job_records((select id from action_jobs where name='retry'),jsonb_build_array(public.test_restore_action_generic('posts','retry-post','4e200000-0000-0000-0000-000000000001',1,0,'skip','{}'),public.test_restore_action_generic('tags','retry-tag','4e200000-0000-0000-0000-000000000002',1,1,'skip','{}'),public.test_restore_action_generic('postTags','retry-relation',null,2,0,'create','{"postId":"retry-post","tagId":"retry-tag"}','["posts:retry-post","tags:retry-tag"]'))); select public.finalize_restore_job((select id from action_jobs where name='retry'));
set local role postgres; update public.restore_job_records set status='reused' where job_id=(select id from action_jobs where name='retry') and section in ('posts','tags'); update public.restore_jobs set status='running' where id=(select id from action_jobs where name='retry'); set local role authenticated; set local "request.jwt.claims"='{"sub":"00000000-0000-0000-0000-000000004e01","role":"authenticated"}';
select is((public.run_restore_job_record((select id from public.restore_job_records where job_id=(select id from action_jobs where name='retry') and section='postTags'))->>'errorCode'),'RESTORE_MISSING_DEPENDENCY','39 retryable dependency failure recorded');
select is((select retryable from public.restore_job_records where job_id=(select id from action_jobs where name='retry') and section='postTags'),true,'40 dependency failure is retryable');
select is((select attempt_count from public.restore_job_records where job_id=(select id from action_jobs where name='retry') and section='postTags'),1,'41 first failed attempt counted');
set local role postgres; insert into public.posts(id,owner_id,category_id,series_no,title,summary,html_body,slug,content_status,source_import_type) values('4e200000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000004e01','ai-column',99,'Retry post','summary','','retry-post','draft','manual_entry'); insert into public.tags(id,owner_id,name,normalized_name) values('4e200000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000004e01','Retry tag','retry tag'); set local role authenticated; set local "request.jwt.claims"='{"sub":"00000000-0000-0000-0000-000000004e01","role":"authenticated"}';
select is((public.run_restore_job_record((select id from public.restore_job_records where job_id=(select id from action_jobs where name='retry') and section='postTags'))->>'status'),'applied','42 retry succeeds after dependency appears');
select is((select attempt_count from public.restore_job_records where job_id=(select id from action_jobs where name='retry') and section='postTags'),2,'43 retry increments attempt number');

select * from finish();
rollback;
