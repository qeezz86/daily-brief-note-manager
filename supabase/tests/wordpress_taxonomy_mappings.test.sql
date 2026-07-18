begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

select has_table('public', 'wordpress_taxonomy_mappings', '1 mapping table exists');
select has_column('public', 'wordpress_taxonomy_mappings', 'owner_id', '2 owner column exists');
select col_type_is('public', 'wordpress_taxonomy_mappings', 'wordpress_term_id', 'bigint', '3 term id uses bigint');
select has_pk('public', 'wordpress_taxonomy_mappings', '4 primary key exists');
select has_fk('public', 'wordpress_taxonomy_mappings', '5 owner foreign key exists');
select ok((select relrowsecurity from pg_class where oid = 'public.wordpress_taxonomy_mappings'::regclass), '6 RLS is enabled');
select is((select count(*) from pg_constraint where conrelid = 'public.wordpress_taxonomy_mappings'::regclass and contype = 'u'), 1::bigint, '7 one mapping uniqueness constraint exists');
select is((select count(*) from pg_constraint where conrelid = 'public.wordpress_taxonomy_mappings'::regclass and contype = 'c'), 7::bigint, '8 mapping checks exist');

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000005b01', 'mapping-owner@example.test'),
  ('00000000-0000-4000-8000-000000005b02', 'mapping-other@example.test');

create function public.test_mapping_restore_record() returns jsonb
language sql security definer set search_path = '' as $$
with payload as (
  select jsonb_build_object(
    'id', '5b100000-0000-4000-8000-000000000010',
    'siteOrigin', 'https://restore.example.com',
    'mappingKind', 'tag',
    'localKey', 'restored-tag',
    'wordpressTaxonomy', 'post_tag',
    'wordpressTermId', 77,
    'wordpressTermSlug', 'restored-tag',
    'wordpressTermName', '복원 태그',
    'verifiedAt', '2026-07-18T02:00:00Z',
    'createdAt', '2026-07-18T02:00:00Z',
    'updatedAt', '2026-07-18T02:00:00Z'
  ) value
)
select jsonb_build_object(
  'section', 'wordpressTaxonomyMappings',
  'sourceId', '5b100000-0000-4000-8000-000000000010',
  'targetId', '5b100000-0000-4000-8000-000000000010',
  'action', 'preserve_id',
  'stageKey', 'wordpressTaxonomyMappings',
  'stageOrder', 1,
  'sequenceNo', 0,
  'payload', value,
  'payloadFingerprint', public.restore_payload_fingerprint(value),
  'dependencies', '[]'::jsonb,
  'safeDisplay', 'tag:restored-tag'
)
from payload;
$$;

set local role anon;
select throws_ok($$ select count(*) from public.wordpress_taxonomy_mappings $$, '42501', null::text, '9 anonymous select is denied');
select throws_ok($$ insert into public.wordpress_taxonomy_mappings(owner_id,site_origin,mapping_kind,local_key,wordpress_taxonomy,wordpress_term_id,wordpress_term_slug,wordpress_term_name) values('00000000-0000-4000-8000-000000005b01','https://example.com','category','economy','category',1,'economy','경제') $$, '42501', null::text, '10 anonymous insert is denied');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000005b01","role":"authenticated"}';

select lives_ok($$ insert into public.wordpress_taxonomy_mappings(id,owner_id,site_origin,mapping_kind,local_key,wordpress_taxonomy,wordpress_term_id,wordpress_term_slug,wordpress_term_name,verified_at) values('5b100000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000005b01','https://example.com','category','economy','category',10,'economy','경제','2026-07-18T01:00:00Z') $$, '11 owner can insert category mapping');
select lives_ok($$ insert into public.wordpress_taxonomy_mappings(id,owner_id,site_origin,mapping_kind,local_key,wordpress_taxonomy,wordpress_term_id,wordpress_term_slug,wordpress_term_name) values('5b100000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000005b01','https://example.com','tag','인공지능','post_tag',20,'ai','인공지능') $$, '12 owner can insert tag mapping');
select is((select count(*) from public.wordpress_taxonomy_mappings), 2::bigint, '13 owner can select own mappings');

reset role;
insert into public.wordpress_taxonomy_mappings(id,owner_id,site_origin,mapping_kind,local_key,wordpress_taxonomy,wordpress_term_id,wordpress_term_slug,wordpress_term_name) values('5b100000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000005b02','https://example.com','category','global','category',11,'global','국제');
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000005b01","role":"authenticated"}';
select is((select count(*) from public.wordpress_taxonomy_mappings), 2::bigint, '14 non-owner mapping is hidden');
select throws_ok($$ insert into public.wordpress_taxonomy_mappings(owner_id,site_origin,mapping_kind,local_key,wordpress_taxonomy,wordpress_term_id,wordpress_term_slug,wordpress_term_name) values('00000000-0000-4000-8000-000000005b02','https://example.com','category','society','category',12,'society','사회') $$, '42501', null::text, '15 forged owner insert is denied');
select lives_ok($$ update public.wordpress_taxonomy_mappings set wordpress_term_name='경제 뉴스' where id='5b100000-0000-4000-8000-000000000001' $$, '16 owner can update mapping');
select throws_ok($$ update public.wordpress_taxonomy_mappings set owner_id='00000000-0000-4000-8000-000000005b02' where id='5b100000-0000-4000-8000-000000000001' $$, '42501', null::text, '17 owner id cannot change');
select lives_ok($$ delete from public.wordpress_taxonomy_mappings where id='5b100000-0000-4000-8000-000000000002' $$, '18 owner can delete mapping');
select is((select count(*) from public.wordpress_taxonomy_mappings where id='5b100000-0000-4000-8000-000000000003'), 0::bigint, '19 non-owner delete target is hidden');

select throws_ok($$ insert into public.wordpress_taxonomy_mappings(owner_id,site_origin,mapping_kind,local_key,wordpress_taxonomy,wordpress_term_id,wordpress_term_slug,wordpress_term_name) values('00000000-0000-4000-8000-000000005b01','https://example.com','category','economy','category',99,'other','중복') $$, '23505', null::text, '20 duplicate local mapping is rejected');
select throws_ok($$ insert into public.wordpress_taxonomy_mappings(owner_id,site_origin,mapping_kind,local_key,wordpress_taxonomy,wordpress_term_id,wordpress_term_slug,wordpress_term_name) values('00000000-0000-4000-8000-000000005b01','https://example.com','category','bad-taxonomy','post_tag',1,'bad','잘못') $$, '23514', null::text, '21 category to tag taxonomy is rejected');
select throws_ok($$ insert into public.wordpress_taxonomy_mappings(owner_id,site_origin,mapping_kind,local_key,wordpress_taxonomy,wordpress_term_id,wordpress_term_slug,wordpress_term_name) values('00000000-0000-4000-8000-000000005b01','https://example.com','tag','bad-tag','category',1,'bad','잘못') $$, '23514', null::text, '22 tag to category taxonomy is rejected');
select throws_ok($$ insert into public.wordpress_taxonomy_mappings(owner_id,site_origin,mapping_kind,local_key,wordpress_taxonomy,wordpress_term_id,wordpress_term_slug,wordpress_term_name) values('00000000-0000-4000-8000-000000005b01','https://example.com/path','tag','path','post_tag',1,'path','경로') $$, '23514', null::text, '23 non-origin URL is rejected');
select throws_ok($$ insert into public.wordpress_taxonomy_mappings(owner_id,site_origin,mapping_kind,local_key,wordpress_taxonomy,wordpress_term_id,wordpress_term_slug,wordpress_term_name) values('00000000-0000-4000-8000-000000005b01','https://example.com','tag','zero','post_tag',0,'zero','영') $$, '23514', null::text, '24 non-positive term id is rejected');
select throws_ok($$ insert into public.wordpress_taxonomy_mappings(owner_id,site_origin,mapping_kind,local_key,wordpress_taxonomy,wordpress_term_id,wordpress_term_slug,wordpress_term_name) values('00000000-0000-4000-8000-000000005b01','https://example.com','tag',' ','post_tag',2,'blank','빈값') $$, '23514', null::text, '25 blank local key is rejected');
select throws_ok($$ insert into public.wordpress_taxonomy_mappings(owner_id,site_origin,mapping_kind,local_key,wordpress_taxonomy,wordpress_term_id,wordpress_term_slug,wordpress_term_name) values('00000000-0000-4000-8000-000000005b01','https://example.com','tag','blank-slug','post_tag',2,' ','빈값') $$, '23514', null::text, '26 blank term slug is rejected');

select is((public.get_user_backup_estimate('core')->'sectionCounts'->>'wordpressTaxonomyMappings')::int, 1, '27 backup estimate includes own mapping count');
select is(jsonb_array_length(public.get_user_backup_snapshot('core')->'data'->'wordpressTaxonomyMappings'), 1, '28 backup snapshot includes own mappings only');
select is(public.get_user_backup_snapshot('core')->'data'->'wordpressTaxonomyMappings'->0->>'siteOrigin', 'https://example.com', '29 backup contains site origin metadata');
select ok(not (public.get_user_backup_snapshot('core')::text ~* 'password|authorization|credential'), '30 backup contains no WordPress credential');

create temporary table mapping_restore_job as
select public.create_restore_job(
  'daily-brief-note-backup', 1, 'core', repeat('5', 64),
  'daily-brief-note-restore-plan', 1, 1, repeat('6', 64), repeat('7', 64),
  'ready', 'mapping-restore.json', '{"operationalHistory":"exclude","timestamps":"preserve"}'::jsonb,
  '[]'::jsonb, '[]'::jsonb, 1
) value;
select is(public.append_restore_job_records(
  (select (value->>'jobId')::uuid from mapping_restore_job),
  jsonb_build_array(public.test_mapping_restore_record())
)->>'appendedCount', '1', '31 mapping restore snapshot appends');
select is((public.finalize_restore_job((select (value->>'jobId')::uuid from mapping_restore_job))->>'status'), 'ready', '32 mapping restore job finalizes');
select is((public.run_restore_job_record((select id from public.restore_job_records where source_id='5b100000-0000-4000-8000-000000000010'))->>'status'), 'applied', '33 mapping restore record applies');
select is((select owner_id from public.wordpress_taxonomy_mappings where id='5b100000-0000-4000-8000-000000000010'), '00000000-0000-4000-8000-000000005b01'::uuid, '34 restored mapping owner is rebound to current user');

select * from finish();
rollback;
