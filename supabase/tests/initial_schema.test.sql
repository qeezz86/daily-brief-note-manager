begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'owner-a@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'owner-b@example.test');

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select is(
  (select count(*) from public.categories),
  8::bigint,
  'authenticated users can read seeded categories'
);

select throws_ok(
  $$
    insert into public.categories (
      id,
      content_group,
      name,
      code,
      wrapper_class,
      slug_pattern,
      sort_order
    ) values (
      'forbidden-category',
      'news',
      '금지',
      'NOPE',
      'daily-brief-note news-briefing forbidden',
      'forbidden-YYYY-MM-DD',
      999
    )
  $$,
  '42501',
  null::text,
  'authenticated users cannot insert categories'
);

select throws_ok(
  $$update public.categories set name = '변경 금지' where id = 'economy'$$,
  '42501',
  null::text,
  'authenticated users cannot update categories'
);

select throws_ok(
  $$delete from public.categories where id = 'economy'$$,
  '42501',
  null::text,
  'authenticated users cannot delete categories'
);

select lives_ok(
  $$
    insert into public.posts (
      id,
      owner_id,
      category_id,
      briefing_date,
      title,
      summary,
      html_body,
      slug,
      content_status,
      source_import_type
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-0000000000a1',
      'economy',
      '2026-07-10',
      'Owner A post',
      'Summary',
      '<div>Body</div>',
      'owner-a-post',
      'draft',
      'manual_entry'
    )
  $$,
  'owner A can insert an owned post'
);

select lives_ok(
  $$
    update public.posts
       set title = 'Owner A updated post'
     where id = '10000000-0000-0000-0000-000000000001'
  $$,
  'owner A can update an owned post'
);

select is(
  (
    select title
      from public.posts
     where id = '10000000-0000-0000-0000-000000000001'
  ),
  'Owner A updated post',
  'owner A can read an owned post'
);

reset role;

insert into public.posts (
  id,
  owner_id,
  category_id,
  briefing_date,
  title,
  summary,
  html_body,
  slug,
  content_status,
  source_import_type
)
values (
  '10000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-0000000000b1',
  'economy',
  '2026-07-11',
  'Owner B post',
  'Summary',
  '<div>Body</div>',
  'owner-b-post',
  'draft',
  'manual_entry'
);

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select is(
  (
    select count(*)
      from public.posts
     where id = '10000000-0000-0000-0000-000000000002'
  ),
  0::bigint,
  'owner A cannot read owner B posts'
);

update public.posts
   set title = 'Unauthorized change'
 where id = '10000000-0000-0000-0000-000000000002';

reset role;

select is(
  (
    select count(*)
      from public.posts
     where id = '10000000-0000-0000-0000-000000000002'
       and title = 'Unauthorized change'
  ),
  0::bigint,
  'owner A cannot update owner B posts'
);

set local role anon;
set local "request.jwt.claims" = '{"role":"anon"}';

select throws_ok(
  $$select count(*) from public.posts$$,
  '42501',
  null::text,
  'anonymous users have no user-table privileges'
);

reset role;

select throws_ok(
  $$
    insert into public.seo_data (
      post_id,
      owner_id,
      representative_title,
      alternative_titles,
      meta_description,
      focus_keyword
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-0000000000b1',
      'Mismatched owner',
      '[]'::jsonb,
      'Description',
      'Keyword'
    )
  $$,
  '23503',
  null::text,
  'child owner_id must match the parent owner_id'
);

insert into public.news_topics (
  id,
  owner_id,
  category_id,
  topic_key,
  canonical_title,
  status,
  first_seen_at,
  last_seen_at
)
values (
  '20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1',
  'economy',
  'topic-key',
  'Tracked topic',
  'active',
  '2026-07-10',
  '2026-07-10'
);

select throws_ok(
  $$
    insert into public.news_topics (
      id,
      owner_id,
      category_id,
      topic_key,
      canonical_title,
      status,
      first_seen_at,
      last_seen_at
    ) values (
      '20000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-0000000000a1',
      'economy',
      'topic-key',
      'Duplicate topic',
      'active',
      '2026-07-10',
      '2026-07-10'
    )
  $$,
  '23505',
  null::text,
  'topic_key is unique per owner and category'
);

insert into public.posts (
  id,
  owner_id,
  category_id,
  series_no,
  title,
  summary,
  html_body,
  slug,
  content_status,
  source_import_type
)
values (
  '30000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1',
  'ai-column',
  7,
  'AI post one',
  'Summary',
  '<div>Body</div>',
  'ai-007-a',
  'draft',
  'manual_entry'
);

select throws_ok(
  $$
    insert into public.posts (
      id,
      owner_id,
      category_id,
      series_no,
      title,
      summary,
      html_body,
      slug,
      content_status,
      source_import_type
    ) values (
      '30000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-0000000000a1',
      'ai-column',
      7,
      'AI post duplicate',
      'Summary',
      '<div>Body</div>',
      'ai-007-b',
      'draft',
      'manual_entry'
    )
  $$,
  '23505',
  null::text,
  'series_no is unique per owner and category'
);

insert into public.posts (
  id,
  owner_id,
  category_id,
  series_no,
  title,
  summary,
  html_body,
  slug,
  content_status,
  source_import_type
)
values
  (
    '40000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-0000000000a1',
    'chinese-study',
    1,
    'Chinese study one',
    'Summary',
    '<div>Body</div>',
    'chinese-study-001',
    'draft',
    'manual_entry'
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-0000000000a1',
    'chinese-study',
    2,
    'Chinese study two',
    'Summary',
    '<div>Body</div>',
    'chinese-study-002',
    'draft',
    'manual_entry'
  );

insert into public.chinese_metadata (
  post_id,
  owner_id,
  learning_topic,
  program_name,
  original_title,
  original_url,
  verified_core_fact
)
values (
  '40000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1',
  '학습 주제',
  'CCTV 프로그램',
  '원문 제목',
  'https://example.test/cctv/item-1',
  '핵심 사실'
);

select throws_ok(
  $$
    insert into public.chinese_metadata (
      post_id,
      owner_id,
      learning_topic,
      program_name,
      original_title,
      original_url,
      verified_core_fact
    ) values (
      '40000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-0000000000a1',
      '다른 학습 주제',
      'CCTV 프로그램',
      '다른 원문 제목',
      'https://example.test/cctv/item-1',
      '다른 핵심 사실'
    )
  $$,
  '23505',
  null::text,
  'Chinese original_url is unique per owner'
);

insert into public.news_updates (
  id,
  owner_id,
  post_id,
  topic_id,
  item_order,
  update_type,
  headline,
  fact_summary
)
values
  (
    '50000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-0000000000a1',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    1,
    'new',
    'Initial update',
    'Initial fact'
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-0000000000a1',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    2,
    'follow_up',
    'Follow-up update',
    'Follow-up fact'
  );

update public.news_updates
   set previous_update_id = '50000000-0000-0000-0000-000000000001'
 where id = '50000000-0000-0000-0000-000000000002';

select throws_ok(
  $$
    delete from public.news_topics
     where id = '20000000-0000-0000-0000-000000000001'
  $$,
  '23503',
  null::text,
  'a topic with updates is protected by ON DELETE RESTRICT'
);

delete from public.news_updates
 where id = '50000000-0000-0000-0000-000000000001';

select is(
  (
    select previous_update_id
      from public.news_updates
     where id = '50000000-0000-0000-0000-000000000002'
  ),
  null::uuid,
  'deleting a previous update nulls only previous_update_id'
);

insert into public.sources (
  id,
  owner_id,
  post_id,
  news_update_id,
  source_name,
  source_title,
  source_url,
  checked_point,
  sort_order
)
values (
  '60000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1',
  '10000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000002',
  'Source',
  'Source title',
  'https://example.test/source',
  'Checked point',
  1
);

delete from public.news_updates
 where id = '50000000-0000-0000-0000-000000000002';

select is(
  (
    select news_update_id
      from public.sources
     where id = '60000000-0000-0000-0000-000000000001'
  ),
  null::uuid,
  'deleting an update nulls only sources.news_update_id'
);

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select is(
  public.issue_series_no(
    '00000000-0000-0000-0000-0000000000a1',
    'ai-column'
  ),
  1,
  'the first atomic series number is one'
);

select is(
  public.issue_series_no(
    '00000000-0000-0000-0000-0000000000a1',
    'ai-column'
  ),
  2,
  'the next atomic series number increments without MAX'
);

select throws_ok(
  $$
    select public.issue_series_no(
      '00000000-0000-0000-0000-0000000000b1',
      'ai-column'
    )
  $$,
  '42501',
  null::text,
  'series numbers cannot be issued for another owner'
);

select lives_ok(
  $$
    select public.save_generated_prompt(
      '00000000-0000-0000-0000-0000000000a1',
      'economy',
      15,
      10,
      'standard',
      'Prompt ' || sequence_no,
      false
    )
    from generate_series(1, 31) as sequence_no
  $$,
  'generated prompt storage accepts a batch of unpinned records'
);

select lives_ok(
  $$
    select public.save_generated_prompt(
      '00000000-0000-0000-0000-0000000000a1',
      'economy',
      15,
      10,
      'standard',
      'Pinned prompt',
      true
    )
  $$,
  'generated prompt storage accepts pinned records'
);

select is(
  (
    select count(*)
      from public.generated_prompts
     where owner_id = '00000000-0000-0000-0000-0000000000a1'
       and category_id = 'economy'
       and is_pinned = false
  ),
  30::bigint,
  'only the latest 30 unpinned prompts are retained per category'
);

select is(
  (
    select count(*)
      from public.generated_prompts
     where owner_id = '00000000-0000-0000-0000-0000000000a1'
       and category_id = 'economy'
       and is_pinned = true
  ),
  1::bigint,
  'pinned prompts are excluded from automatic cleanup'
);

select * from finish();
rollback;
