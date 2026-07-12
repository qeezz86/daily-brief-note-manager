begin;

create extension if not exists pgtap with schema extensions;
select plan(30);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000002a1', 'metadata-owner@example.test'),
  ('00000000-0000-0000-0000-0000000002a2', 'metadata-other@example.test');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000002a1","role":"authenticated"}';
insert into public.posts (id, owner_id, category_id, series_no, title, summary, slug, content_status, source_import_type) values
  ('74000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000002a1', 'ai-column', 901, 'AI one', 'Summary', 'ai-meta-one', 'draft', 'manual_entry'),
  ('74000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000002a1', 'ai-column', 902, 'AI two', 'Summary', 'ai-meta-two', 'draft', 'manual_entry'),
  ('74000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000002a1', 'info-db', 901, 'Info one', 'Summary', 'info-meta-one', 'draft', 'manual_entry'),
  ('74000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000002a1', 'info-db', 902, 'Info two', 'Summary', 'info-meta-two', 'draft', 'manual_entry'),
  ('74000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000002a1', 'info-db', 903, 'Info three', 'Summary', 'info-meta-three', 'draft', 'manual_entry');
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000002a2","role":"authenticated"}';
insert into public.posts (id, owner_id, category_id, series_no, title, summary, slug, content_status, source_import_type)
values ('74000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000002a2', 'ai-column', 901, 'Other', 'Summary', 'other-ai-meta', 'draft', 'manual_entry');
reset role;

create function public.test_ai_bundle(p_post_id uuid, p_status text default 'ready', p_metadata jsonb default '{"field_name":"생성형 AI","difficulty":"intermediate","estimated_read_min":8}'::jsonb, p_title text default 'AI saved') returns public.posts language plpgsql set search_path = '' as $$
begin return public.save_ai_publication_bundle(p_post_id, p_title, 'Summary', 'saved-' || right(p_post_id::text, 8), p_status, null, null, '<div class="daily-brief-note ai-column"><h1>AI</h1><section id="sources"><a href="https://example.com/a">Source</a></section></div>', 'Image prompt', 'Image ALT', 'Representative', array['A','B','C','D'], 'Description', 'Keyword', '["A","B","C","D","E"]', '[{"source_name":"Source","source_title":"Title","source_url":"https://example.com/a","source_published_at":null,"checked_point":"Check","sort_order":0}]', p_metadata); end $$;
create function public.test_info_bundle(p_post_id uuid, p_status text default 'ready', p_metadata jsonb default '{"field_name":"반도체","difficulty":"advanced","estimated_read_min":9,"reference_date":"2026-07-12"}'::jsonb, p_title text default 'Info saved') returns public.posts language plpgsql set search_path = '' as $$
begin return public.save_info_db_publication_bundle(p_post_id, p_title, 'Summary', 'saved-' || right(p_post_id::text, 8), p_status, null, null, '<div class="daily-brief-note info-db"><h1>Info</h1><section id="sources"><a href="https://example.com/a">Source</a></section></div>', 'Image prompt', 'Image ALT', 'Representative', array['A','B','C','D'], 'Description', 'Keyword', '["A","B","C","D","E"]', '[{"source_name":"Source","source_title":"Title","source_url":"https://example.com/a","source_published_at":null,"checked_point":"Check","sort_order":0}]', p_metadata); end $$;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000002a1","role":"authenticated"}';
select lives_ok($$ select public.test_ai_bundle('74000000-0000-0000-0000-000000000001') $$, 'owner saves AI metadata atomically');
select is((select difficulty from public.ai_metadata where post_id = '74000000-0000-0000-0000-000000000001'), 'intermediate', 'AI difficulty is stored');
select lives_ok($$ select public.test_ai_bundle('74000000-0000-0000-0000-000000000002', 'draft', '{}'::jsonb) $$, 'AI draft permits no metadata');
select is((select count(*)::integer from public.ai_metadata where post_id = '74000000-0000-0000-0000-000000000002'), 0, 'empty AI draft metadata is not persisted');
select throws_ok($$ select public.test_ai_bundle('74000000-0000-0000-0000-000000000002', 'ready', '{"difficulty":"beginner","estimated_read_min":1}'::jsonb) $$, '23514', null::text, 'AI ready rejects missing field');
select throws_ok($$ select public.test_ai_bundle('74000000-0000-0000-0000-000000000002', 'ready', '{"field_name":"AI","estimated_read_min":1}'::jsonb) $$, '23514', null::text, 'AI ready rejects missing difficulty');
select throws_ok($$ select public.test_ai_bundle('74000000-0000-0000-0000-000000000002', 'ready', '{"field_name":"AI","difficulty":"beginner"}'::jsonb) $$, '23514', null::text, 'AI ready rejects missing read time');
select throws_ok($$ select public.test_ai_bundle('74000000-0000-0000-0000-000000000002', 'draft', '{"estimated_read_min":0}'::jsonb) $$, '23514', null::text, 'AI rejects zero read time');
select throws_ok($$ select public.test_ai_bundle('74000000-0000-0000-0000-000000000002', 'draft', '{"estimated_read_min":-1}'::jsonb) $$, '23514', null::text, 'AI rejects negative read time');
select throws_ok($$ select public.test_ai_bundle('74000000-0000-0000-0000-000000000005', 'draft', '{}'::jsonb) $$, '23514', null::text, 'non-AI post rejects AI metadata');
select throws_ok($$ select public.test_ai_bundle('74000000-0000-0000-0000-000000000006') $$, '42501', null::text, 'other user cannot save AI metadata');

set local role anon; set local "request.jwt.claims" = '{"role":"anon"}';
select throws_ok($$ select public.test_ai_bundle('74000000-0000-0000-0000-000000000001', 'draft', '{}'::jsonb) $$, '42501', null::text, 'anonymous callers cannot execute AI RPC');
reset role;
create function public.reject_ai_metadata_test() returns trigger language plpgsql set search_path = '' as $$ begin if new.field_name = 'force rollback' then raise exception 'forced AI metadata failure'; end if; return new; end $$;
create trigger ai_metadata_reject_test before insert or update on public.ai_metadata for each row execute function public.reject_ai_metadata_test();
set local role authenticated; set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000002a1","role":"authenticated"}';
select public.test_ai_bundle('74000000-0000-0000-0000-000000000002', 'draft', '{}'::jsonb, 'AI baseline');
select throws_ok($$ select public.test_ai_bundle('74000000-0000-0000-0000-000000000002', 'draft', '{"field_name":"force rollback"}'::jsonb, 'AI changed') $$, null::text, null::text, 'AI metadata failure rolls back bundle');
select is((select title from public.posts where id = '74000000-0000-0000-0000-000000000002'), 'AI baseline', 'AI failure preserves prior post bundle');

select lives_ok($$ select public.test_info_bundle('74000000-0000-0000-0000-000000000003') $$, 'owner saves information-DB metadata atomically');
select is((select reference_date::text from public.info_db_metadata where post_id = '74000000-0000-0000-0000-000000000003'), '2026-07-12', 'information-DB reference date is stored');
select lives_ok($$ select public.test_info_bundle('74000000-0000-0000-0000-000000000004', 'draft', '{}'::jsonb) $$, 'information-DB draft permits no metadata');
select is((select count(*)::integer from public.info_db_metadata where post_id = '74000000-0000-0000-0000-000000000004'), 0, 'empty information-DB draft metadata is not persisted');
select throws_ok($$ select public.test_info_bundle('74000000-0000-0000-0000-000000000004', 'ready', '{"difficulty":"beginner","estimated_read_min":1}'::jsonb) $$, '23514', null::text, 'information-DB ready rejects missing field');
select throws_ok($$ select public.test_info_bundle('74000000-0000-0000-0000-000000000004', 'ready', '{"field_name":"DB","estimated_read_min":1}'::jsonb) $$, '23514', null::text, 'information-DB ready rejects missing difficulty');
select throws_ok($$ select public.test_info_bundle('74000000-0000-0000-0000-000000000004', 'ready', '{"field_name":"DB","difficulty":"beginner"}'::jsonb) $$, '23514', null::text, 'information-DB ready rejects missing read time');
select lives_ok($$ select public.test_info_bundle('74000000-0000-0000-0000-000000000004', 'ready', '{"field_name":"DB","difficulty":"beginner","estimated_read_min":1,"reference_date":null}'::jsonb) $$, 'information-DB permits null reference date');
select throws_ok($$ select public.test_info_bundle('74000000-0000-0000-0000-000000000004', 'draft', '{"reference_date":"not-a-date"}'::jsonb) $$, '22007', null::text, 'information-DB rejects invalid reference date');
select throws_ok($$ select public.test_info_bundle('74000000-0000-0000-0000-000000000001', 'draft', '{}'::jsonb) $$, '23514', null::text, 'AI post rejects information-DB metadata');
select throws_ok($$ select public.test_info_bundle('74000000-0000-0000-0000-000000000006') $$, '42501', null::text, 'other user cannot save information-DB metadata');
set local role anon; set local "request.jwt.claims" = '{"role":"anon"}';
select throws_ok($$ select public.test_info_bundle('74000000-0000-0000-0000-000000000003', 'draft', '{}'::jsonb) $$, '42501', null::text, 'anonymous callers cannot execute information-DB RPC');
reset role;
create function public.reject_info_metadata_test() returns trigger language plpgsql set search_path = '' as $$ begin if new.field_name = 'force rollback' then raise exception 'forced info metadata failure'; end if; return new; end $$;
create trigger info_metadata_reject_test before insert or update on public.info_db_metadata for each row execute function public.reject_info_metadata_test();
set local role authenticated; set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000002a1","role":"authenticated"}';
select public.test_info_bundle('74000000-0000-0000-0000-000000000004', 'draft', '{}'::jsonb, 'Info baseline');
select throws_ok($$ select public.test_info_bundle('74000000-0000-0000-0000-000000000004', 'draft', '{"field_name":"force rollback"}'::jsonb, 'Info changed') $$, null::text, null::text, 'information-DB metadata failure rolls back bundle');
select is((select title from public.posts where id = '74000000-0000-0000-0000-000000000004'), 'Info baseline', 'information-DB failure preserves prior post bundle');
select is((select count(*)::integer from public.info_db_metadata where post_id = '74000000-0000-0000-0000-000000000001'), 0, 'AI post has no information-DB metadata');
select is((select count(*)::integer from public.ai_metadata where post_id = '74000000-0000-0000-0000-000000000003'), 0, 'information-DB post has no AI metadata');

select * from finish();
rollback;
