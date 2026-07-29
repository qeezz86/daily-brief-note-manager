begin;

create extension if not exists pgtap with schema extensions;
select plan(32);

select has_function(
  'public',
  'update_post_image_metadata',
  array['uuid', 'text', 'text'],
  '1 image metadata RPC exists with the expected signature'
);
select function_privs_are(
  'public', 'update_post_image_metadata', array['uuid', 'text', 'text'],
  'authenticated', array['EXECUTE'],
  '2 authenticated can execute the image metadata RPC'
);
select function_privs_are(
  'public', 'update_post_image_metadata', array['uuid', 'text', 'text'],
  'anon', array[]::text[],
  '3 anon cannot execute the image metadata RPC'
);
select function_privs_are(
  'public', 'update_post_image_metadata', array['uuid', 'text', 'text'],
  'public', array[]::text[],
  '4 PUBLIC cannot execute the image metadata RPC'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.update_post_image_metadata(uuid,text,text)'::regprocedure),
  '5 image metadata RPC follows the project SECURITY DEFINER convention'
);
select is(
  (
    select coalesce(array_to_string(proconfig, ','), '')
      from pg_proc
     where oid = 'public.update_post_image_metadata(uuid,text,text)'::regprocedure
  ),
  'search_path=""',
  '6 image metadata RPC fixes an empty search_path'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.posts'::regclass),
  '7 posts RLS remains enabled'
);
select is(
  (
    select array_agg(policyname order by policyname)
      from pg_policies
     where schemaname = 'public'
       and tablename = 'posts'
  ),
  array[
    'posts_delete_own',
    'posts_insert_own',
    'posts_select_own',
    'posts_update_own'
  ]::name[],
  '8 existing posts owner policies remain unchanged'
);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000005d01', 'image-owner@example.test'),
  ('00000000-0000-0000-0000-000000005d02', 'image-other@example.test');

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"00000000-0000-0000-0000-000000005d01","role":"authenticated"}';

insert into public.posts (
  id, owner_id, category_id, briefing_date, published_on, display_id,
  title, summary, html_body, slug, wordpress_url, content_status, published_at,
  source_import_type, image_prompt, image_alt
) values (
  '5d000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000005d01',
  'economy',
  '2026-07-27',
  '2026-07-27',
  '#2026-07-27-ECO',
  'Original title',
  'Original summary',
  '<div class="daily-brief-note news-briefing economy"><h1>Original</h1></div>',
  'phase-5d-owner',
  'https://example.com/phase-5d-owner',
  'draft',
  '2026-07-27 01:00:00+00',
  'manual_entry',
  'Original prompt',
  'Original ALT'
);

set local "request.jwt.claims" =
  '{"sub":"00000000-0000-0000-0000-000000005d02","role":"authenticated"}';

insert into public.posts (
  id, owner_id, category_id, briefing_date, title, summary, slug,
  content_status, source_import_type, image_prompt, image_alt
) values (
  '5d000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000005d02',
  'economy',
  '2026-07-28',
  'Other title',
  'Other summary',
  'phase-5d-other',
  'draft',
  'manual_entry',
  'Other prompt',
  'Other ALT'
);

set local "request.jwt.claims" =
  '{"sub":"00000000-0000-0000-0000-000000005d01","role":"authenticated"}';

select lives_ok(
  $$
    select public.update_post_image_metadata(
      '5d000000-0000-0000-0000-000000000001',
      '  Updated prompt  ',
      '  Updated ALT  '
    )
  $$,
  '9 owner saves prompt and ALT in one RPC call'
);
select is(
  (select image_prompt from public.posts where id = '5d000000-0000-0000-0000-000000000001'),
  'Updated prompt',
  '10 image prompt is trimmed and stored'
);
select is(
  (select image_alt from public.posts where id = '5d000000-0000-0000-0000-000000000001'),
  'Updated ALT',
  '11 image ALT is trimmed and stored'
);
select is(
  (
    select public.update_post_image_metadata(
      '5d000000-0000-0000-0000-000000000001',
      'Returned prompt',
      'Returned ALT'
    ) ->> 'image_prompt'
  ),
  'Returned prompt',
  '12 RPC returns the saved prompt'
);
select is(
  (select image_alt from public.posts where id = '5d000000-0000-0000-0000-000000000001'),
  'Returned ALT',
  '13 prompt and ALT are saved together'
);
select is(
  (select title from public.posts where id = '5d000000-0000-0000-0000-000000000001'),
  'Original title',
  '14 title is not changed'
);
select is(
  (select html_body from public.posts where id = '5d000000-0000-0000-0000-000000000001'),
  '<div class="daily-brief-note news-briefing economy"><h1>Original</h1></div>',
  '15 HTML body is not changed'
);
select is(
  (select category_id from public.posts where id = '5d000000-0000-0000-0000-000000000001'),
  'economy',
  '16 category is not changed'
);
select is(
  (select content_status from public.posts where id = '5d000000-0000-0000-0000-000000000001'),
  'draft',
  '17 content status is not changed'
);
select is(
  (select published_on from public.posts where id = '5d000000-0000-0000-0000-000000000001'),
  '2026-07-27'::date,
  '18 publication date is not changed'
);
select is(
  (select published_at from public.posts where id = '5d000000-0000-0000-0000-000000000001'),
  '2026-07-27 01:00:00+00'::timestamptz,
  '19 publication timestamp is not changed'
);
select is(
  (select owner_id from public.posts where id = '5d000000-0000-0000-0000-000000000001'),
  '00000000-0000-0000-0000-000000005d01'::uuid,
  '20 owner is not changed'
);

select lives_ok(
  $$
    select public.update_post_image_metadata(
      '5d000000-0000-0000-0000-000000000001',
      '   ',
      null
    )
  $$,
  '21 draft image prompt and ALT can be cleared'
);
select is(
  (
    select count(*)
      from public.posts
     where id = '5d000000-0000-0000-0000-000000000001'
       and image_prompt is null
       and image_alt is null
  ),
  1::bigint,
  '22 both cleared values follow the existing null normalization'
);

select public.update_post_image_metadata(
  '5d000000-0000-0000-0000-000000000001',
  'Ready prompt',
  'Ready ALT'
);
update public.posts
   set content_status = 'ready'
 where id = '5d000000-0000-0000-0000-000000000001';
select throws_ok(
  $$
    select public.update_post_image_metadata(
      '5d000000-0000-0000-0000-000000000001',
      null,
      null
    )
  $$,
  '23514',
  null::text,
  '23 ready posts retain the existing required image validation'
);
select is(
  (
    select count(*)
      from public.posts
     where id = '5d000000-0000-0000-0000-000000000001'
       and image_prompt = 'Ready prompt'
       and image_alt = 'Ready ALT'
  ),
  1::bigint,
  '24 rejected clear leaves both ready image values unchanged'
);

select throws_ok(
  $$
    select public.update_post_image_metadata(
      '5d000000-0000-0000-0000-000000000002',
      'Unauthorized prompt',
      'Unauthorized ALT'
    )
  $$,
  '42501',
  null::text,
  '25 another owner cannot update the post'
);
set local "request.jwt.claims" =
  '{"sub":"00000000-0000-0000-0000-000000005d02","role":"authenticated"}';
select is(
  (select image_prompt from public.posts where id = '5d000000-0000-0000-0000-000000000002'),
  'Other prompt',
  '26 another owner record remains unchanged'
);
set local "request.jwt.claims" =
  '{"sub":"00000000-0000-0000-0000-000000005d01","role":"authenticated"}';
select throws_ok(
  $$
    select public.update_post_image_metadata(
      '5d000000-0000-0000-0000-000000009999',
      'Missing prompt',
      'Missing ALT'
    )
  $$,
  '42501',
  null::text,
  '27 a missing post is rejected without revealing its existence'
);

set local role anon;
set local "request.jwt.claims" = '{"role":"anon"}';
select throws_ok(
  $$
    select public.update_post_image_metadata(
      '5d000000-0000-0000-0000-000000000001',
      'Anon prompt',
      'Anon ALT'
    )
  $$,
  '42501',
  null::text,
  '28 unauthenticated callers cannot execute the image metadata RPC'
);

reset role;
create function public.reject_phase_5d_image_alt()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.image_alt = 'force-atomic-failure' then
    raise exception 'forced image metadata failure' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger posts_reject_phase_5d_image_alt
before update of image_alt on public.posts
for each row execute function public.reject_phase_5d_image_alt();

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"00000000-0000-0000-0000-000000005d01","role":"authenticated"}';

select throws_ok(
  $$
    select public.update_post_image_metadata(
      '5d000000-0000-0000-0000-000000000001',
      'Must roll back',
      'force-atomic-failure'
    )
  $$,
  '23514',
  null::text,
  '29 a downstream failure aborts the image metadata RPC'
);
select is(
  (
    select count(*)
      from public.posts
     where id = '5d000000-0000-0000-0000-000000000001'
       and image_prompt = 'Ready prompt'
       and image_alt = 'Ready ALT'
  ),
  1::bigint,
  '30 a failed call partially saves neither field'
);

select lives_ok(
  $$
    select public.save_post_publication_bundle(
      '5d000000-0000-0000-0000-000000000001',
      'Full save still works',
      'Full save summary',
      'phase-5d-owner',
      'draft',
      '2026-07-27',
      'https://example.com/phase-5d-owner',
      '<div class="daily-brief-note news-briefing economy"><h1>Full save</h1></div>',
      'Full save prompt',
      'Full save ALT',
      '',
      array[]::text[],
      '',
      '',
      '[]'::jsonb,
      '[]'::jsonb
    )
  $$,
  '31 existing full article save RPC still succeeds'
);
select is(
  (
    select value -> 'data' -> 'posts' -> 0 ->> 'imagePrompt'
      from (select public.get_user_backup_snapshot('core') value) snapshot
  ),
  'Full save prompt',
  '32 backup snapshot v1 still exports image prompt without a payload change'
);

select * from finish();
rollback;
