begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000004d01','restore-prep@example.test'),
 ('00000000-0000-0000-0000-000000004d02','restore-prep-other@example.test');

create function public.test_restore_prep_job(p_hash text,p_count integer,p_profile text default 'core',p_history text default 'exclude') returns jsonb language sql set search_path='' as $$
 select public.create_restore_job('daily-brief-note-backup',1,p_profile,p_hash,'daily-brief-note-restore-plan',1,1,repeat(substr(p_hash,1,1),64),repeat('f',64),'ready','prep.json',jsonb_build_object('operationalHistory',p_history,'timestamps','preserve'),'[]'::jsonb,'[]'::jsonb,p_count);
$$;
create function public.test_restore_prep_record(p_section text,p_source text,p_target text,p_stage integer,p_sequence integer,p_action text default 'preserve_id',p_payload jsonb default '{}'::jsonb,p_dependencies jsonb default '[]'::jsonb) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('section',p_section,'sourceId',p_source,'targetId',p_target,'action',p_action,'stageKey','stage-'||p_stage,'stageOrder',p_stage,'sequenceNo',p_sequence,'payload',p_payload,'payloadFingerprint',public.restore_payload_fingerprint(p_payload),'dependencies',p_dependencies,'safeDisplay',p_source);
$$;

select function_privs_are('public','create_restore_job',array['text','integer','text','text','text','integer','integer','text','text','text','text','jsonb','jsonb','jsonb','integer'],'anon',array[]::text[],'1 anon create execute denied');
select function_privs_are('public','create_restore_job',array['text','integer','text','text','text','integer','integer','text','text','text','text','jsonb','jsonb','jsonb','integer'],'public',array[]::text[],'2 PUBLIC create execute denied');
select function_privs_are('public','append_restore_job_records',array['uuid','jsonb'],'anon',array[]::text[],'3 anon append execute denied');
select function_privs_are('public','finalize_restore_job',array['uuid'],'anon',array[]::text[],'4 anon finalize execute denied');
select function_privs_are('public','run_restore_job_record',array['uuid'],'anon',array[]::text[],'5 anon run execute denied');
select function_privs_are('public','cancel_restore_job',array['uuid'],'anon',array[]::text[],'6 anon cancel execute denied');
select function_privs_are('public','resume_cancelled_restore_job',array['uuid'],'anon',array[]::text[],'7 anon resume execute denied');
select table_privs_are('public','restore_jobs','authenticated',array['SELECT'],'8 jobs allow select only');
select table_privs_are('public','restore_job_records','authenticated',array['SELECT'],'9 records allow select only');
select table_privs_are('public','restore_job_record_attempts','authenticated',array['SELECT'],'10 attempts allow select only');

set local role anon;
set local "request.jwt.claims"='{"role":"anon"}';
select throws_ok($$ select public.create_restore_job('daily-brief-note-backup',1,'core',repeat('1',64),'daily-brief-note-restore-plan',1,1,repeat('1',64),repeat('f',64),'ready','x','{"operationalHistory":"exclude"}','[]','[]',1) $$,'42501',null::text,'11 anon invocation blocked');

set local role authenticated;
set local "request.jwt.claims"='{"sub":"00000000-0000-0000-0000-000000004d01","role":"authenticated"}';
create temporary table prep_job as select public.test_restore_prep_job(repeat('a',64),1) value;
select is((select value->>'status' from prep_job),'preparing','12 job created preparing');
select is((select owner_id from public.restore_jobs where id=(select (value->>'jobId')::uuid from prep_job)),'00000000-0000-0000-0000-000000004d01'::uuid,'13 owner comes from auth uid');
select is((public.test_restore_prep_job(repeat('a',64),1)->>'isExisting'),'true','14 checksum and fingerprint are idempotent');
select throws_ok($$ select public.test_restore_prep_job(repeat('b',64),1,'invalid') $$,'23514','RESTORE_INVALID_PAYLOAD','15 invalid profile blocked');
select lives_ok($$ select public.test_restore_prep_job(repeat('c',64),1,'full','include') $$,'16 full operational history include accepted');
select throws_ok($$ select public.append_restore_job_records((select (value->>'jobId')::uuid from prep_job),jsonb_build_array(public.test_restore_prep_record('importJobs','import','4d100000-0000-0000-0000-000000000001',1,0))) $$,'23514','RESTORE_INVALID_PAYLOAD','17 operational section append blocked');
select throws_ok($$ select public.append_restore_job_records((select (value->>'jobId')::uuid from prep_job),jsonb_build_array(public.test_restore_prep_record('tags','blocked','4d100000-0000-0000-0000-000000000001',1,0,'block'))) $$,'23514','RESTORE_INVALID_PAYLOAD','18 block action append blocked');
select throws_ok($$ select public.append_restore_job_records((select (value->>'jobId')::uuid from prep_job),jsonb_build_array(public.test_restore_prep_record('tags','owner','4d100000-0000-0000-0000-000000000001',1,0,'preserve_id','{"name":"Tag","ownerId":"00000000-0000-0000-0000-000000004d02"}'))) $$,'23514','RESTORE_INVALID_PAYLOAD','19 owner ID payload injection blocked');

create temporary table count_job as select public.test_restore_prep_job(repeat('d',64),2) value;
select public.append_restore_job_records((select (value->>'jobId')::uuid from count_job),jsonb_build_array(public.test_restore_prep_record('tags','one','4d100000-0000-0000-0000-000000000002',1,0,'preserve_id','{"name":"One","normalizedName":"one","createdAt":"2026-07-15T00:00:00Z"}')));
select throws_ok($$ select public.finalize_restore_job((select (value->>'jobId')::uuid from count_job)) $$,'23514','RESTORE_RECORD_COUNT_MISMATCH','20 finalize count mismatch blocked');

create temporary table dep_job as select public.test_restore_prep_job(repeat('e',64),1) value;
select public.append_restore_job_records((select (value->>'jobId')::uuid from dep_job),jsonb_build_array(public.test_restore_prep_record('postTags','rel',null,1,0,'create','{"postId":"missing","tagId":"missing"}','["posts:missing"]')));
select throws_ok($$ select public.finalize_restore_job((select (value->>'jobId')::uuid from dep_job)) $$,'23514','RESTORE_MISSING_DEPENDENCY','21 missing dependency blocked');

create temporary table duplicate_job as select public.test_restore_prep_job(repeat('6',64),2) value;
select public.append_restore_job_records((select (value->>'jobId')::uuid from duplicate_job),jsonb_build_array(public.test_restore_prep_record('tags','duplicate-one','4d100000-0000-0000-0000-000000000003',1,0,'preserve_id','{"name":"DupOne","normalizedName":"dupone","createdAt":"2026-07-15T00:00:00Z"}'),public.test_restore_prep_record('tags','duplicate-two','4d100000-0000-0000-0000-000000000003',1,1,'preserve_id','{"name":"DupTwo","normalizedName":"duptwo","createdAt":"2026-07-15T00:00:00Z"}')));
select throws_ok($$ select public.finalize_restore_job((select (value->>'jobId')::uuid from duplicate_job)) $$,'23505','RESTORE_TARGET_ID_CONFLICT','22 duplicate target blocked');

select is((public.append_restore_job_records((select (value->>'jobId')::uuid from prep_job),jsonb_build_array(public.test_restore_prep_record('tags','valid','4d100000-0000-0000-0000-000000000004',1,0,'preserve_id','{"name":"Valid","normalizedName":"valid","createdAt":"2026-07-15T00:00:00Z"}')))->>'appendedCount')::int,1,'23 valid snapshot appended');
select is((public.finalize_restore_job((select (value->>'jobId')::uuid from prep_job))->>'status'),'ready','24 valid job finalized');

set local "request.jwt.claims"='{"sub":"00000000-0000-0000-0000-000000004d02","role":"authenticated"}';
select is((select count(*)::int from public.restore_jobs),0,'25 other user cannot read jobs');
select throws_ok($$ select public.append_restore_job_records((select (value->>'jobId')::uuid from prep_job),jsonb_build_array(public.test_restore_prep_record('tags','foreign','4d100000-0000-0000-0000-000000000005',1,0))) $$,'42501','RESTORE_PERMISSION_DENIED','26 other user cannot access job RPC');
select throws_ok($$ insert into public.restore_job_records(owner_id,job_id,section,source_id,target_id,action,stage_key,stage_order,sequence_no,payload,payload_fingerprint) values('00000000-0000-0000-0000-000000004d02',(select (value->>'jobId')::uuid from prep_job),'tags','direct',null,'skip','tags',1,0,'{}',repeat('a',64)) $$,'42501',null::text,'27 direct record insert denied');

select * from finish();
rollback;
