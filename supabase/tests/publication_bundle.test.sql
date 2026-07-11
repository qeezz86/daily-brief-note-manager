begin;

create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'bundle-owner@example.test'),
  ('00000000-0000-0000-0000-0000000000f1', 'bundle-other@example.test');

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';

insert into public.posts (
  id, owner_id, category_id, briefing_date, series_no, title, summary, slug,
  content_status, source_import_type
) values
  ('71000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', 'economy', '2026-07-22', null, 'Bundle one', 'Summary', 'bundle-one', 'draft', 'manual_entry'),
  ('71000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000e1', 'economy', '2026-07-23', null, 'Bundle two', 'Summary', 'bundle-two', 'draft', 'manual_entry'),
  ('71000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000e1', 'chinese-study', null, 901, 'Chinese bundle', 'Summary', 'bundle-chinese', 'draft', 'manual_entry');

set local "request.jwt.claims" =
  '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
insert into public.posts (
  id, owner_id, category_id, briefing_date, title, summary, slug,
  content_status, source_import_type
) values (
  '71000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000f1',
  'economy', '2026-07-24', 'Other bundle', 'Summary', 'bundle-other', 'draft', 'manual_entry'
);
insert into public.tags (id, owner_id, name, normalized_name) values
  ('72000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'Other tag', 'other tag');

set local "request.jwt.claims" =
  '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';

reset role;
create function public.test_save_bundle(
  p_post_id uuid,
  p_status text,
  p_tags jsonb,
  p_sources jsonb,
  p_title text default 'Ready bundle'
)
returns public.posts
language sql
set search_path = ''
as $$
  select public.save_post_publication_bundle(
    p_post_id, p_title, 'Bundle summary',
    'bundle-' || right(p_post_id::text, 8), p_status, null, null,
    '<div class="daily-brief-note"><h1>Bundle</h1><section id="sources"><a href="' ||
      coalesce(p_sources -> 0 ->> 'source_url', '') || '">Source</a></section></div>',
    'Image prompt', 'Image ALT', 'Representative title',
    array['Alternative 1', 'Alternative 2', 'Alternative 3', 'Alternative 4'],
    'Meta description', 'Focus keyword', p_tags, p_sources
  );
$$;
set local role authenticated;

select lives_ok(
  $$ select public.test_save_bundle(
    '71000000-0000-0000-0000-000000000001', 'draft', '[" AI   기술 ","반도체"]',
    '[{"source_name":"기관","source_title":"원문","source_url":"https://example.com/source","source_published_at":null,"checked_point":"확인 내용","sort_order":0}]'
  ) $$,
  'owner atomically saves tags and sources'
);

select throws_ok(
  $$ select public.test_save_bundle('71000000-0000-0000-0000-000000000001', 'ready', '["A","B","C","D"]', '[{"source_name":"기관","source_title":"원문","source_url":"https://example.com/source","source_published_at":null,"checked_point":"확인","sort_order":0}]') $$,
  '23514', null::text, 'ready rejects four tags'
);

select throws_ok(
  $$ select public.test_save_bundle('71000000-0000-0000-0000-000000000001', 'ready', '["A","B","C","D","E","F","G","H","I"]', '[{"source_name":"기관","source_title":"원문","source_url":"https://example.com/source","source_published_at":null,"checked_point":"확인","sort_order":0}]') $$,
  '23514', null::text, 'ready rejects nine tags'
);

select lives_ok(
  $$ select public.test_save_bundle('71000000-0000-0000-0000-000000000001', 'ready', '["A","B","C","D","E"]', '[{"source_name":"기관","source_title":"원문","source_url":"https://example.com/source","source_published_at":null,"checked_point":"확인","sort_order":0}]') $$,
  'ready accepts five tags and a complete source'
);

select throws_ok(
  $$ select public.test_save_bundle('71000000-0000-0000-0000-000000000001', 'draft', '["Daily Brief Note"]', '[]') $$,
  '23514', null::text, 'brand tag is forbidden'
);

select throws_ok(
  $$ select public.test_save_bundle('71000000-0000-0000-0000-000000000001', 'draft', '["경제"]', '[]') $$,
  '23514', null::text, 'category name tag is forbidden'
);

select throws_ok(
  $$ select public.test_save_bundle('71000000-0000-0000-0000-000000000001', 'draft', '["AI 기술"," ai   기술 "]', '[]') $$,
  '23514', null::text, 'normalized duplicate tags are rejected'
);

select throws_ok(
  $$ insert into public.post_tags (post_id, tag_id, owner_id) values (
    '71000000-0000-0000-0000-000000000001',
    '72000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-0000000000f1'
  ) $$,
  '42501', null::text, 'another owner tag cannot be linked'
);

select throws_ok(
  $$ select public.test_save_bundle('71000000-0000-0000-0000-000000000001', 'ready', '["A","B","C","D","E"]', '[]') $$,
  '23514', null::text, 'ready rejects zero sources'
);

select is(
  (select source_name from public.sources where post_id = '71000000-0000-0000-0000-000000000001'),
  '기관', 'complete source is persisted'
);

select throws_ok(
  $$ select public.test_save_bundle('71000000-0000-0000-0000-000000000001', 'draft', '[]', '[{"source_name":"A","source_title":"A","source_url":"https://example.com/dup#one","source_published_at":null,"checked_point":"A","sort_order":0},{"source_name":"B","source_title":"B","source_url":"https://example.com/dup#two","source_published_at":null,"checked_point":"B","sort_order":1}]') $$,
  '23514', null::text, 'fragment-only duplicate source URLs are rejected'
);

select throws_ok(
  $$ select public.test_save_bundle('71000000-0000-0000-0000-000000000004', 'draft', '[]', '[]') $$,
  '42501', null::text, 'another owner post source save is rejected'
);

select throws_ok(
  $$ select public.test_save_bundle('71000000-0000-0000-0000-000000000003', 'ready', '["A","B","C","D","E"]', '[{"source_name":"기관","source_title":"원문","source_url":"https://example.com/chinese","source_published_at":"2026-07-11T12:00:00+08:00","checked_point":"확인","sort_order":0}]') $$,
  '23514', null::text, 'Chinese ready rejects a non-CCTV source'
);

select lives_ok(
  $$ select public.test_save_bundle('71000000-0000-0000-0000-000000000003', 'ready', '["A","B","C","D","E"]', '[{"source_name":"CCTV","source_title":"节目","source_url":"https://news.cctv.com/2026/07/11/article.shtml","source_published_at":"2026-07-11T12:00:00+08:00","checked_point":"核心句","sort_order":0}]') $$,
  'Chinese ready accepts an official CCTV individual URL'
);

reset role;
create function public.test_source_rollback()
returns text
language plpgsql
set search_path = ''
as $$
begin
  begin
    perform public.test_save_bundle(
      '71000000-0000-0000-0000-000000000001', 'draft', '["rollback source"]',
      '[{"source_name":"A","source_title":"A","source_url":"https://example.com/a","source_published_at":null,"checked_point":"A","sort_order":0},{"source_name":"B","source_title":"B","source_url":"https://example.com/b","source_published_at":null,"checked_point":"B","sort_order":0}]',
      'Source failure title'
    );
  exception when unique_violation then null;
  end;
  return (select title from public.posts where id = '71000000-0000-0000-0000-000000000001');
end;
$$;
set local role authenticated;

select is(public.test_source_rollback(), 'Ready bundle', 'source insert failure rolls back the post update');

reset role;
create function public.reject_test_tag()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.normalized_name = 'trigger failure' then raise exception 'forced tag failure'; end if;
  return new;
end;
$$;
create trigger tags_reject_test before insert on public.tags for each row execute function public.reject_test_tag();

create function public.test_tag_rollback()
returns text
language plpgsql
set search_path = ''
as $$
begin
  begin
    perform public.test_save_bundle(
      '71000000-0000-0000-0000-000000000001', 'draft', '["trigger failure"]',
      '[{"source_name":"새 기관","source_title":"새 원문","source_url":"https://example.com/new","source_published_at":null,"checked_point":"새 확인","sort_order":0}]',
      'Tag failure title'
    );
  exception when others then null;
  end;
  return (select title || ':' || count(*) filter (where source_name = '새 기관')
    from public.posts left join public.sources on sources.post_id = posts.id
    where posts.id = '71000000-0000-0000-0000-000000000001' group by posts.title);
end;
$$;
set local role authenticated;

select is(public.test_tag_rollback(), 'Ready bundle:0', 'tag insert failure rolls back sources and post');

set local role anon;
set local "request.jwt.claims" = '{"role":"anon"}';
select throws_ok(
  $$ select public.test_save_bundle('71000000-0000-0000-0000-000000000001', 'draft', '[]', '[]') $$,
  '42501', null::text, 'anonymous callers cannot execute the bundle RPC'
);

set local role authenticated;
set local "request.jwt.claims" = '{"role":"authenticated"}';
select throws_ok(
  $$ select public.save_post_publication_bundle('71000000-0000-0000-0000-000000000001', 'No auth', 'Summary', 'no-auth', 'draft', null, null, null, null, null, '', array[]::text[], '', '', '[]', '[]') $$,
  '42501', null::text, 'missing auth.uid is rejected'
);

set local "request.jwt.claims" =
  '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
reset role;
drop trigger tags_reject_test on public.tags;
set local role authenticated;

select public.test_save_bundle('71000000-0000-0000-0000-000000000002', 'draft', '["A"]', '[]');
select public.test_save_bundle('71000000-0000-0000-0000-000000000001', 'draft', '["A","B"]', '[]');
select public.test_save_bundle('71000000-0000-0000-0000-000000000001', 'draft', '["B"]', '[]');
select is(
  (select count(*)::integer from public.post_tags pt join public.tags t on t.id = pt.tag_id
    where pt.post_id = '71000000-0000-0000-0000-000000000002' and t.normalized_name = 'a'),
  1, 'shared tag relation on another post is preserved'
);

select public.test_save_bundle(
  '71000000-0000-0000-0000-000000000001', 'draft', '[]',
  '[{"source_name":"Third","source_title":"Third","source_url":"https://example.com/3","source_published_at":null,"checked_point":"3","sort_order":2},{"source_name":"First","source_title":"First","source_url":"https://example.com/1","source_published_at":null,"checked_point":"1","sort_order":0},{"source_name":"Second","source_title":"Second","source_url":"https://example.com/2","source_published_at":null,"checked_point":"2","sort_order":1}]'
);
select results_eq(
  $$ select source_name from public.sources where post_id = '71000000-0000-0000-0000-000000000001' order by sort_order $$,
  $$ values ('First'::text), ('Second'::text), ('Third'::text) $$,
  'source sort_order preserves UI order'
);

select * from finish();
rollback;
