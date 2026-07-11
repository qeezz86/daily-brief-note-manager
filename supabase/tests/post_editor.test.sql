begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000c1', 'editor-owner@example.test'),
  ('00000000-0000-0000-0000-0000000000d1', 'other-owner@example.test');

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';

insert into public.posts (
  id, owner_id, category_id, briefing_date, title, summary, slug,
  content_status, source_import_type
) values (
  '70000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000c1',
  'economy',
  '2026-07-20',
  'Original title',
  'Original summary',
  'editor-original',
  'draft',
  'manual_entry'
);

insert into public.posts (
  id, owner_id, category_id, briefing_date, title, summary, slug,
  content_status, source_import_type
) values (
  '70000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-0000000000c1',
  'economy',
  '2026-07-21',
  'Incomplete draft',
  'Draft summary',
  'incomplete-draft',
  'draft',
  'manual_entry'
);

select lives_ok(
  $$
    select public.save_post_editor(
      '70000000-0000-0000-0000-000000000002',
      'Incomplete draft', 'Draft summary', 'incomplete-draft', 'draft', null, null,
      null, null, null, '', array[]::text[], '', ''
    )
  $$,
  'draft accepts empty HTML, incomplete SEO, and empty image information'
);

select lives_ok(
  $$
    select public.save_post_editor(
      '70000000-0000-0000-0000-000000000001',
      'Edited title',
      'Edited summary',
      'editor-updated',
      'draft',
      null,
      null,
      E'<div class="daily-brief-note news-briefing economy">\n  <h1>Edited</h1>\n</div>',
      'Professional image prompt',
      'Objective ALT text',
      'Representative title',
      array['Alternative 1', 'Alternative 2', 'Alternative 3', 'Alternative 4'],
      'Short draft meta description',
      'focus keyword'
    )
  $$,
  'an authenticated owner can atomically save post and SEO editor fields'
);

select is(
  (select title from public.posts where id = '70000000-0000-0000-0000-000000000001'),
  'Edited title',
  'the post update is stored'
);

select is(
  (
    select representative_title
      from public.seo_data
     where post_id = '70000000-0000-0000-0000-000000000001'
  ),
  'Representative title',
  'camelCase editor input maps to SEO storage through the RPC'
);

select is(
  (
    select image_prompt_version
      from public.posts
     where id = '70000000-0000-0000-0000-000000000001'
  ),
  2,
  'changing the image prompt increments its version'
);

select lives_ok(
  $$
    select public.save_post_editor(
      '70000000-0000-0000-0000-000000000001',
      'Edited title', 'Edited summary', 'editor-updated', 'draft', null, null,
      '<div class="daily-brief-note news-briefing economy"><h1>Edited</h1></div>',
      'Professional image prompt', 'Objective ALT text', 'Representative title',
      array['Alternative 1', 'Alternative 2', 'Alternative 3', 'Alternative 4'],
      'Short draft meta description', 'focus keyword'
    )
  $$,
  'saving an unchanged image prompt succeeds'
);

select is(
  (
    select image_prompt_version
      from public.posts
     where id = '70000000-0000-0000-0000-000000000001'
  ),
  2,
  'an unchanged image prompt does not increment its version'
);

set local "request.jwt.claims" =
  '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';

select throws_ok(
  $$
    select public.save_post_editor(
      '70000000-0000-0000-0000-000000000001',
      'Other owner edit', 'Summary', 'other-owner-edit', 'draft', null, null,
      null, null, null, '', array[]::text[], '', ''
    )
  $$,
  '42501',
  null::text,
  'the RPC rejects another authenticated owner'
);

set local role anon;
set local "request.jwt.claims" = '{"role":"anon"}';

select throws_ok(
  $$
    select public.save_post_editor(
      '70000000-0000-0000-0000-000000000001',
      'Anon edit', 'Summary', 'anon-edit', 'draft', null, null,
      null, null, null, '', array[]::text[], '', ''
    )
  $$,
  '42501',
  null::text,
  'anonymous callers cannot execute the editor RPC'
);

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';

select throws_ok(
  $$
    select public.save_post_editor(
      '70000000-0000-0000-0000-000000000001',
      'Ready null HTML', 'Summary', 'ready-null-html', 'ready', null, null,
      null, 'Prompt', 'ALT', 'Representative',
      array['A', 'B', 'C', 'D'], 'Meta description', 'Keyword'
    )
  $$,
  '23514',
  null::text,
  'ready rejects NULL HTML through the atomic editor RPC'
);

select throws_ok(
  $$
    select public.save_post_editor(
      '70000000-0000-0000-0000-000000000001',
      'Ready blank HTML', 'Summary', 'ready-blank-html', 'ready', null, null,
      '   ', 'Prompt', 'ALT', 'Representative',
      array['A', 'B', 'C', 'D'], 'Meta description', 'Keyword'
    )
  $$,
  '23514',
  null::text,
  'ready rejects blank HTML through the atomic editor RPC'
);

select throws_ok(
  $$
    select public.save_post_editor(
      '70000000-0000-0000-0000-000000000001',
      'Should roll back', 'Summary', 'rollback-editor', 'draft', null, null,
      null, null, null, '', array[]::text[], null, ''
    )
  $$,
  '23502',
  null::text,
  'a downstream SEO failure aborts the editor call'
);

select is(
  (select title from public.posts where id = '70000000-0000-0000-0000-000000000001'),
  'Edited title',
  'a downstream SEO failure rolls back the post update'
);

select lives_ok(
  $$
    select public.save_post_editor(
      '70000000-0000-0000-0000-000000000001',
      'Ready complete', 'Summary', 'ready-complete', 'ready', null, null,
      '<div class="daily-brief-note news-briefing economy"><h1>Ready</h1></div>',
      'Ready prompt', 'Ready ALT', 'Ready representative',
      array['Ready A', 'Ready B', 'Ready C', 'Ready D'],
      'Ready meta description', 'Ready keyword'
    )
  $$,
  'ready accepts complete post, SEO, and image data'
);

select * from finish();
rollback;
