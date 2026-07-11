begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'chinese-owner@example.test'),
  ('00000000-0000-0000-0000-0000000000c2', 'chinese-other@example.test');

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';

insert into public.posts (id, owner_id, category_id, briefing_date, series_no, title, summary, slug, content_status, source_import_type)
values
  ('73000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'chinese-study', null, 901, 'Chinese one', 'Summary', 'chinese-one', 'draft', 'manual_entry'),
  ('73000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c1', 'chinese-study', null, 902, 'Chinese two', 'Summary', 'chinese-two', 'draft', 'manual_entry'),
  ('73000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c1', 'economy', '2026-07-11', null, 'Economy', 'Summary', 'economy-chinese-test', 'draft', 'manual_entry');

set local "request.jwt.claims" =
  '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';
insert into public.posts (id, owner_id, category_id, series_no, title, summary, slug, content_status, source_import_type)
values ('73000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000c2', 'chinese-study', 901, 'Other', 'Summary', 'chinese-other', 'draft', 'manual_entry');

reset role;
create function public.test_save_chinese_bundle(
  p_post_id uuid,
  p_status text default 'ready',
  p_metadata jsonb default '{"learning_topic":"학습 주제","program_name":"CCTV 뉴스","original_title":"원문 제목","original_url":"https://news.cctv.com/2026/07/11/article.shtml","original_published_at":"2026-07-11T12:00:00+08:00","episode_list_included":false,"verified_core_fact":"원문에 학습 문장이 있음을 확인","difficulty":"중급","learning_points":"표현 요약"}'::jsonb,
  p_title text default 'Chinese saved'
)
returns public.posts
language plpgsql
set search_path = ''
as $$
declare
  source_url text := coalesce(p_metadata ->> 'original_url', 'https://news.cctv.com/2026/07/11/article.shtml');
begin
  return public.save_chinese_publication_bundle(
    p_post_id, p_title, 'Summary', 'chinese-' || right(p_post_id::text, 8), p_status,
    null, null, '<div class="daily-brief-note chinese-study"><h1>Chinese</h1><section id="sources"><a href="' || source_url || '">Source</a></section></div>',
    'Image prompt', 'Image ALT', 'Representative', array['A', 'B', 'C', 'D'], 'Description',
    'Keyword', '["A","B","C","D","E"]', jsonb_build_array(jsonb_build_object(
      'source_name', 'CCTV', 'source_title', '원문 제목', 'source_url', source_url,
      'source_published_at', '2026-07-11T12:00:00+08:00', 'checked_point', '확인', 'sort_order', 0
    )), p_metadata
  );
end;
$$;
set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';

select lives_ok(
  $$ select public.test_save_chinese_bundle('73000000-0000-0000-0000-000000000001') $$,
  'owner atomically saves Chinese metadata'
);
select is((select episode_list_included from public.chinese_metadata where post_id = '73000000-0000-0000-0000-000000000001'), false, 'explicit false episode-list result is preserved');
select lives_ok(
  $$ select public.test_save_chinese_bundle('73000000-0000-0000-0000-000000000002', 'draft', '{}'::jsonb) $$,
  'draft permits no Chinese metadata'
);
select is((select count(*)::integer from public.chinese_metadata where post_id = '73000000-0000-0000-0000-000000000002'), 0, 'empty draft metadata is not persisted');

select throws_ok($$ select public.test_save_chinese_bundle('73000000-0000-0000-0000-000000000002', 'ready', jsonb_set('{}'::jsonb, '{program_name}', '"CCTV"')) $$, '23514', null::text, 'ready rejects missing learning_topic');
select throws_ok($$ select public.test_save_chinese_bundle('73000000-0000-0000-0000-000000000002', 'ready', jsonb_set('{"learning_topic":"주제"}'::jsonb, '{original_title}', '"제목"')) $$, '23514', null::text, 'ready rejects missing program_name');
select throws_ok($$ select public.test_save_chinese_bundle('73000000-0000-0000-0000-000000000002', 'ready', jsonb_set('{"learning_topic":"주제","program_name":"CCTV"}'::jsonb, '{original_url}', '"https://news.cctv.com/a"')) $$, '23514', null::text, 'ready rejects missing original_title');
select throws_ok($$ select public.test_save_chinese_bundle('73000000-0000-0000-0000-000000000002', 'ready', jsonb_set('{"learning_topic":"주제","program_name":"CCTV","original_title":"제목"}'::jsonb, '{original_published_at}', '"2026-07-11T12:00:00+08:00"')) $$, '23514', null::text, 'ready rejects missing original_url');
select throws_ok($$ select public.test_save_chinese_bundle('73000000-0000-0000-0000-000000000002', 'ready', jsonb_set('{"learning_topic":"주제","program_name":"CCTV","original_title":"제목","original_url":"https://news.cctv.com/a"}'::jsonb, '{episode_list_included}', 'true')) $$, '23514', null::text, 'ready rejects missing original_published_at');
select throws_ok($$ select public.test_save_chinese_bundle('73000000-0000-0000-0000-000000000002', 'ready', jsonb_set('{"learning_topic":"주제","program_name":"CCTV","original_title":"제목","original_url":"https://news.cctv.com/a","original_published_at":"2026-07-11T12:00:00+08:00"}'::jsonb, '{verified_core_fact}', '"확인"')) $$, '23514', null::text, 'ready rejects null episode_list_included');
select throws_ok($$ select public.test_save_chinese_bundle('73000000-0000-0000-0000-000000000002', 'ready', '{"learning_topic":"주제","program_name":"CCTV","original_title":"제목","original_url":"https://news.cctv.com/a","original_published_at":"2026-07-11T12:00:00+08:00","episode_list_included":true}'::jsonb) $$, '23514', null::text, 'ready rejects missing verified_core_fact');
select throws_ok($$ select public.test_save_chinese_bundle('73000000-0000-0000-0000-000000000002', 'ready', '{"learning_topic":"주제","program_name":"CCTV","original_title":"제목","original_url":"https://cctv.com.example.com/a","original_published_at":"2026-07-11T12:00:00+08:00","episode_list_included":true,"verified_core_fact":"확인"}'::jsonb) $$, '23514', null::text, 'spoofed CCTV hostname is rejected');
select throws_ok($$ select public.test_save_chinese_bundle('73000000-0000-0000-0000-000000000002') $$, '23505', null::text, 'duplicate original URL is rejected for the same owner');
select throws_ok($$ select public.test_save_chinese_bundle('73000000-0000-0000-0000-000000000004') $$, '42501', null::text, 'another user cannot save Chinese metadata');

set local role anon;
set local "request.jwt.claims" = '{"role":"anon"}';
select throws_ok($$ select public.test_save_chinese_bundle('73000000-0000-0000-0000-000000000001', 'draft', '{}'::jsonb) $$, '42501', null::text, 'anonymous callers cannot execute the Chinese bundle RPC');

reset role;
create function public.reject_chinese_metadata_test()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.verified_core_fact = 'force rollback' then raise exception 'forced Chinese metadata failure'; end if;
  return new;
end;
$$;
create trigger chinese_metadata_reject_test before insert or update on public.chinese_metadata for each row execute function public.reject_chinese_metadata_test();
set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
select public.test_save_chinese_bundle('73000000-0000-0000-0000-000000000002', 'draft', '{}'::jsonb, 'Baseline bundle');
select throws_ok($$ select public.test_save_chinese_bundle('73000000-0000-0000-0000-000000000002', 'draft', '{"verified_core_fact":"force rollback"}'::jsonb, 'Changed bundle') $$, null::text, null::text, 'metadata failure aborts the complete bundle');
select is((select title from public.posts where id = '73000000-0000-0000-0000-000000000002'), 'Baseline bundle', 'metadata failure rolls back the post and related bundle');
select throws_ok($$ select public.test_save_chinese_bundle('73000000-0000-0000-0000-000000000003', 'draft', '{"learning_topic":"주제"}'::jsonb) $$, '23514', null::text, 'non-Chinese posts reject Chinese metadata');

select * from finish();
rollback;
