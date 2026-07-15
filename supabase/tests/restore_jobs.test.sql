begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000004c01','restore-owner@example.test'),
 ('00000000-0000-0000-0000-000000004c02','restore-other@example.test');

create function public.test_restore_job(p_hash text,p_count integer) returns jsonb language sql set search_path='' as $$
 select public.create_restore_job('daily-brief-note-backup',1,'core',p_hash,'daily-brief-note-restore-plan',1,1,repeat(substr(p_hash,1,1),64),repeat('f',64),'ready','restore.json','{"operationalHistory":"exclude","timestamps":"preserve"}'::jsonb,'[]'::jsonb,'[]'::jsonb,p_count);
$$;
create function public.test_restore_record(p_source text,p_target uuid,p_stage integer,p_action text default 'preserve_id',p_name text default 'Tag') returns jsonb language sql security definer set search_path='' as $$
 with payload as (select jsonb_build_object('createdAt','2026-07-15T00:00:00.000Z','name',p_name,'normalizedName',lower(p_name)) value)
 select jsonb_build_object('section','tags','sourceId',p_source,'targetId',p_target,'action',p_action,'stageKey','stage-'||p_stage,'stageOrder',p_stage,'sequenceNo',0,'payload',value,'payloadFingerprint',public.restore_payload_fingerprint(value),'dependencies','[]'::jsonb,'safeDisplay',p_name) from payload;
$$;

set local role authenticated;
set local "request.jwt.claims"='{"sub":"00000000-0000-0000-0000-000000004c01","role":"authenticated"}';

select has_table('public','restore_jobs','1 restore jobs table exists');
select has_table('public','restore_job_records','2 restore records table exists');
select has_table('public','restore_job_record_attempts','3 restore attempts table exists');
select has_function('public','create_restore_job',array['text','integer','text','text','text','integer','integer','text','text','text','text','jsonb','jsonb','jsonb','integer'],'4 create RPC exists');
select has_function('public','run_restore_job_record',array['uuid'],'5 run RPC exists');
select function_privs_are('public','create_restore_job',array['text','integer','text','text','text','integer','integer','text','text','text','text','jsonb','jsonb','jsonb','integer'],'authenticated',array['EXECUTE'],'6 authenticated executes create');
select function_privs_are('public','create_restore_job',array['text','integer','text','text','text','integer','integer','text','text','text','text','jsonb','jsonb','jsonb','integer'],'anon',array[]::text[],'7 anon cannot execute create');
select table_privs_are('public','restore_jobs','authenticated',array['SELECT'],'8 direct job writes blocked');
select table_privs_are('public','restore_job_records','authenticated',array['SELECT'],'9 snapshot direct writes blocked');
select table_privs_are('public','restore_job_record_attempts','authenticated',array['SELECT'],'10 attempt direct writes blocked');
set local role postgres;
select is(public.restore_payload_fingerprint('{"createdAt":"2026-07-15T00:00:00.000Z","name":"Tag","normalizedName":"tag"}'::jsonb),'401a3f4b565bda16ab89571fab02ad0df23415e89a2c026bf06437d63b1d83f9','11 JS canonical fingerprint matches DB');
set local role authenticated;
set local "request.jwt.claims"='{"sub":"00000000-0000-0000-0000-000000004c01","role":"authenticated"}';

create temporary table restore_one as select public.test_restore_job(repeat('a',64),2) value;
select is((select value->>'status' from restore_one),'preparing','12 job starts preparing');
select is((select owner_id from public.restore_jobs where id=(select (value->>'jobId')::uuid from restore_one)),'00000000-0000-0000-0000-000000004c01'::uuid,'13 owner injected from auth');
select is((public.test_restore_job(repeat('a',64),2)->>'isExisting'),'true','14 same checksum and plan returns existing');
select throws_ok($$ select public.create_restore_job('daily-brief-note-backup',1,'wrong',repeat('b',64),'daily-brief-note-restore-plan',1,1,repeat('b',64),repeat('f',64),'ready','x','{"operationalHistory":"exclude"}','[]','[]',1) $$,'23514','RESTORE_INVALID_PAYLOAD','15 invalid profile blocked');
select throws_ok($$ select public.create_restore_job('daily-brief-note-backup',1,'full',repeat('b',64),'daily-brief-note-restore-plan',1,1,repeat('b',64),repeat('f',64),'ready','x','{"operationalHistory":"include"}','[]','[]',1) $$,'23514','RESTORE_OPERATIONAL_HISTORY_BLOCKED','16 operational include blocked');

select is((public.append_restore_job_records((select (value->>'jobId')::uuid from restore_one),jsonb_build_array(
 public.test_restore_record('tag-one','4c100000-0000-0000-0000-000000000001',1),
 public.test_restore_record('tag-two','4c100000-0000-0000-0000-000000000002',2,'preserve_id','TagTwo')
))->>'appendedCount')::int,2,'17 append stores two snapshots');
select is((public.append_restore_job_records((select (value->>'jobId')::uuid from restore_one),jsonb_build_array(public.test_restore_record('tag-one','4c100000-0000-0000-0000-000000000001',1)))->>'existingCount')::int,1,'18 identical append idempotent');
select throws_ok($$ select public.append_restore_job_records((select (value->>'jobId')::uuid from restore_one),jsonb_build_array(public.test_restore_record('tag-one','4c100000-0000-0000-0000-000000000001',1,'preserve_id','Changed'))) $$,'23505','RESTORE_SNAPSHOT_CONFLICT','19 changed snapshot conflicts');
select is((public.finalize_restore_job((select (value->>'jobId')::uuid from restore_one))->>'status'),'ready','20 finalize ready');
select throws_ok($$ select public.run_restore_job_record((select id from public.restore_job_records where source_id='tag-two')) $$,'23514','RESTORE_STAGE_BLOCKED','21 next stage blocked');
select is((public.run_restore_job_record((select id from public.restore_job_records where source_id='tag-one'))->>'status'),'applied','22 first stage applies');
select is((public.run_restore_job_record((select id from public.restore_job_records where source_id='tag-one'))->>'idempotent'),'true','23 success recall idempotent');
select is((public.run_restore_job_record((select id from public.restore_job_records where source_id='tag-two'))->>'status'),'applied','24 second stage applies');
select is((select status from public.restore_jobs where id=(select (value->>'jobId')::uuid from restore_one)),'completed','25 last stage completes job');
select is((select count(*)::int from public.tags where id in ('4c100000-0000-0000-0000-000000000001','4c100000-0000-0000-0000-000000000002')),2,'26 each record creates once');
select is((select count(*)::int from public.restore_job_record_attempts where owner_id='00000000-0000-0000-0000-000000004c01'),2,'27 attempts persist');

create temporary table restore_cancel as select public.test_restore_job(repeat('c',64),1) value;
select public.append_restore_job_records((select (value->>'jobId')::uuid from restore_cancel),jsonb_build_array(public.test_restore_record('tag-cancel','4c100000-0000-0000-0000-000000000003',1)));
select public.finalize_restore_job((select (value->>'jobId')::uuid from restore_cancel));
select is((public.cancel_restore_job((select (value->>'jobId')::uuid from restore_cancel))->>'status'),'cancelled','28 pending job cancels');
select is((select status from public.restore_job_records where source_id='tag-cancel'),'cancelled','29 pending record cancelled');
select is((public.resume_cancelled_restore_job((select (value->>'jobId')::uuid from restore_cancel))->>'status'),'ready','30 cancelled job resumes');
select is((select status from public.restore_job_records where source_id='tag-cancel'),'pending','31 cancelled record returns pending');

select throws_ok($$ insert into public.restore_jobs(owner_id,backup_format,backup_schema_version,backup_profile,backup_checksum,plan_format,plan_schema_version,plan_version,plan_fingerprint,analysis_fingerprint,policies,category_mappings,execution_stages,expected_record_count) values('00000000-0000-0000-0000-000000004c01','daily-brief-note-backup',1,'core',repeat('d',64),'daily-brief-note-restore-plan',1,1,repeat('d',64),repeat('f',64),'{}','[]','[]',1) $$,'42501',null::text,'32 direct job insert denied');
set local "request.jwt.claims"='{"sub":"00000000-0000-0000-0000-000000004c02","role":"authenticated"}';
select is((select count(*)::int from public.restore_jobs),0,'33 other user cannot read jobs');
select is((public.test_restore_job(repeat('a',64),1)->>'isExisting'),'false','34 duplicate plan is owner scoped');

select * from finish();
rollback;
