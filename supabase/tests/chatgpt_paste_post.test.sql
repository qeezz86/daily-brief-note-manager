begin;

create extension if not exists pgtap with schema extensions;
select plan(40);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000005f01', 'paste-owner-a@example.test'),
  ('00000000-0000-0000-0000-000000005f02', 'paste-owner-b@example.test');

create table public.test_chatgpt_paste_results (value jsonb not null);
grant select, insert on public.test_chatgpt_paste_results to authenticated;

create function public.test_chatgpt_paste_payload(
  p_date date,
  p_title text default 'Structured paste title'
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'content', jsonb_build_object(
      'content_group', 'news',
      'category_id', 'economy',
      'display_id', '#' || p_date::text || '-ECO',
      'series_no', null,
      'title', p_title,
      'summary', 'Structured paste summary',
      'slug', 'economy-briefing-' || p_date::text,
      'published_on', p_date,
      'published_at', null,
      'wordpress_url', null
    ),
    'seo', jsonb_build_object(
      'representative_title', 'Representative title',
      'alternative_titles', jsonb_build_array('Alt 1', 'Alt 2', 'Alt 3', 'Alt 4'),
      'meta_description', repeat('가', 120),
      'focus_keyword', 'economy',
      'tags', jsonb_build_array('금리', '환율', '물가', '산업', '정책')
    ),
    'image', jsonb_build_object('prompt', 'Image prompt', 'alt', 'Image alt'),
    'sources', jsonb_build_array(
      jsonb_build_object('source_name', '기관 A', 'source_title', '원문 A', 'source_url', 'https://example.com/a/' || p_date, 'source_published_at', null, 'checked_point', '확인 A'),
      jsonb_build_object('source_name', '기관 B', 'source_title', '원문 B', 'source_url', 'https://example.com/b/' || p_date, 'source_published_at', null, 'checked_point', '확인 B')
    ),
    'html_body', '<div class="daily-brief-note news-briefing economy"><h1>' || p_title || '</h1></div>'
  );
$$;

create function public.test_json_import_payload(p_date date)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'validation_mode', 'strict', 'category_id', 'global', 'title', 'JSON import title',
    'summary', 'JSON import summary', 'slug', 'global-briefing-' || p_date::text,
    'status', 'draft', 'briefing_date', p_date, 'published_on', p_date,
    'published_at', null, 'display_id', '#' || p_date::text || '-GLO',
    'series_no', null, 'wordpress_url', null,
    'html_body', '<div class="daily-brief-note news-briefing global"><h1>JSON import title</h1></div>',
    'seo', jsonb_build_object('representative_title', 'Representative', 'alternative_titles', jsonb_build_array('A', 'B', 'C', 'D'), 'meta_description', repeat('나', 120), 'focus_keyword', 'global'),
    'image', jsonb_build_object('prompt', 'Prompt', 'alt', 'Alt'),
    'tags', jsonb_build_array('세계정세', '외교', '정책', '시장', '안보'),
    'sources', '[]'::jsonb,
    'metadata', null
  );
$$;

select has_function('public', 'save_chatgpt_paste_post', array['jsonb'], '1 exact paste RPC exists');
select function_returns('public', 'save_chatgpt_paste_post', array['jsonb'], 'jsonb', '2 paste RPC returns jsonb');
select is((select prosecdef from pg_proc where oid = 'public.save_chatgpt_paste_post(jsonb)'::regprocedure), true, '3 paste RPC is security definer');
select is((select proconfig from pg_proc where oid = 'public.save_chatgpt_paste_post(jsonb)'::regprocedure), array['search_path=""'], '4 paste RPC fixes empty search path');
select function_privs_are('public', 'save_chatgpt_paste_post', array['jsonb'], 'public', array[]::text[], '5 PUBLIC execute revoked');
select function_privs_are('public', 'save_chatgpt_paste_post', array['jsonb'], 'anon', array[]::text[], '6 anon execute revoked');
select function_privs_are('public', 'save_chatgpt_paste_post', array['jsonb'], 'authenticated', array['EXECUTE'], '7 authenticated execute granted');

set local role authenticated;
set local "request.jwt.claims" = '{"role":"authenticated"}';
select throws_ok($$ select public.save_chatgpt_paste_post(public.test_chatgpt_paste_payload('2026-08-01')) $$, '42501', 'CHATGPT_PASTE_AUTH_REQUIRED', '8 missing auth uid rejected');

set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000005f01","role":"authenticated"}';
select lives_ok($$ insert into public.test_chatgpt_paste_results select public.save_chatgpt_paste_post(public.test_chatgpt_paste_payload('2026-08-01')) $$, '9 owner A valid aggregate succeeds');
select is((select count(*)::integer from public.posts where owner_id = '00000000-0000-0000-0000-000000005f01'), 1, '10 exactly one owner A post created');
select is((select owner_id from public.posts where slug = 'economy-briefing-2026-08-01'), '00000000-0000-0000-0000-000000005f01'::uuid, '11 owner derives from auth uid');
select is((select source_import_type from public.posts where slug = 'economy-briefing-2026-08-01'), 'chatgpt_paste', '12 server fixes paste provenance');
select is((select array_agg(key order by key) from jsonb_object_keys((select value from public.test_chatgpt_paste_results limit 1)) key), array['categoryId','displayId','postId','publishedOn','slug','status','title','wordpressUrl'], '13 result exact eight-key allowlist');
select ok(not ((select value from public.test_chatgpt_paste_results limit 1) ?| array['ownerId','owner_id','auth','session','rawPaste']), '14 result excludes owner auth session and raw paste');
select is((select count(*)::integer from public.sources where post_id = (select id from public.posts where slug = 'economy-briefing-2026-08-01')), 2, '15 valid sources belong to created post');
select is((select array_agg(sort_order order by sort_order) from public.sources where post_id = (select id from public.posts where slug = 'economy-briefing-2026-08-01')), array[0,1], '16 source order preserved');
select is((select count(*)::integer from public.news_updates where owner_id = '00000000-0000-0000-0000-000000005f01'), 0, '17 zero news updates created');
select is((select count(*)::integer from public.news_followups where owner_id = '00000000-0000-0000-0000-000000005f01'), 0, '18 zero followups created');
select ok(not exists(select 1 from information_schema.columns where table_schema = 'public' and column_name in ('raw_paste','raw_paste_text')), '19 raw paste has no storage column');
select throws_ok($$ select public.save_chatgpt_paste_post(public.test_chatgpt_paste_payload('2026-08-01')) $$, '23505', 'IMPORT_DUPLICATE_BRIEFING', '20 duplicate identity rejected');
select is((select title from public.posts where slug = 'economy-briefing-2026-08-01'), 'Structured paste title', '21 duplicate attempt does not overwrite existing row');
select throws_ok($$ select public.save_chatgpt_paste_post(public.test_chatgpt_paste_payload('2026-08-02') #- '{content,title}') $$, '22023', 'CHATGPT_PASTE_MISSING_REQUIRED_FIELD', '22 missing required field rejected');
select throws_ok($$ select public.save_chatgpt_paste_post(public.test_chatgpt_paste_payload('2026-08-02') || '{"owner_id":"00000000-0000-0000-0000-000000005f02"}'::jsonb) $$, '22023', 'CHATGPT_PASTE_FORBIDDEN_FIELD', '23 caller owner rejected');
select throws_ok($$ select public.save_chatgpt_paste_post(jsonb_set(public.test_chatgpt_paste_payload('2026-08-02'), '{content,auth}', '{"uid":"x"}'::jsonb)) $$, '22023', 'CHATGPT_PASTE_FORBIDDEN_FIELD', '24 auth field rejected');
select throws_ok($$ select public.save_chatgpt_paste_post(public.test_chatgpt_paste_payload('2026-08-02') || '{"session":"secret"}'::jsonb) $$, '22023', 'CHATGPT_PASTE_FORBIDDEN_FIELD', '25 session field rejected');
select throws_ok($$ select public.save_chatgpt_paste_post(public.test_chatgpt_paste_payload('2026-08-02') || '{"source_import_type":"manual_entry"}'::jsonb) $$, '22023', 'CHATGPT_PASTE_FORBIDDEN_FIELD', '26 caller provenance rejected');
select throws_ok($$ select public.save_chatgpt_paste_post(public.test_chatgpt_paste_payload('2026-08-02') || '{"raw_paste":"secret"}'::jsonb) $$, '22023', 'CHATGPT_PASTE_FORBIDDEN_FIELD', '27 raw paste key rejected');
select throws_ok($$ select public.save_chatgpt_paste_post(public.test_chatgpt_paste_payload('2026-08-02') || '{"news_tracking":{"updates":[]}}'::jsonb) $$, '22023', 'CHATGPT_PASTE_FORBIDDEN_FIELD', '28 NEWS_TRACKING persistence rejected');
select throws_ok($$ select public.save_chatgpt_paste_post(public.test_chatgpt_paste_payload('2026-08-02') || '{"unknown":"value"}'::jsonb) $$, '22023', 'CHATGPT_PASTE_FORBIDDEN_FIELD', '29 unknown persistence key rejected');
select throws_ok($$ select public.save_chatgpt_paste_post(jsonb_set(public.test_chatgpt_paste_payload('2026-08-02'), '{sources,0,source_url}', '"javascript:bad"'::jsonb)) $$, '23514', 'SOURCE_URL_INVALID', '30 invalid source rejects aggregate');
select is((select count(*)::integer from public.posts where category_id = 'economy' and briefing_date = '2026-08-02'), 0, '31 post rolls back after source failure');
select is((select count(*)::integer from public.sources source left join public.posts post on post.id = source.post_id where post.id is null), 0, '32 zero orphan sources remain');

set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000005f02","role":"authenticated"}';
select lives_ok($$ select public.save_chatgpt_paste_post(public.test_chatgpt_paste_payload('2026-08-01')) $$, '33 owner B may create the same owner-scoped identity');
select is((select count(*)::integer from public.posts where owner_id = '00000000-0000-0000-0000-000000005f02'), 1, '34 owner B aggregate is isolated');
select is((select count(*)::integer from public.posts where owner_id = '00000000-0000-0000-0000-000000005f01'), 1, '35 owner A aggregate remains unchanged');
select throws_ok($$ select public.save_chatgpt_paste_post(jsonb_set(public.test_chatgpt_paste_payload('2026-08-03'), '{content,post_id}', '"00000000-0000-0000-0000-000000005f01"'::jsonb)) $$, '22023', 'CHATGPT_PASTE_FORBIDDEN_FIELD', '36 cross-owner post reference rejected');

set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000005f01","role":"authenticated"}';
select lives_ok($$ select public.import_content_post(public.test_json_import_payload('2026-08-03')) $$, '37 existing JSON import still succeeds');
select is((select source_import_type from public.posts where slug = 'global-briefing-2026-08-03'), 'json_import', '38 existing JSON import provenance unchanged');
select throws_ok($$ select public.save_chatgpt_paste_post(jsonb_set(public.test_chatgpt_paste_payload('2026-08-04'), '{content,category_id}', '"missing-category"'::jsonb)) $$, '23514', 'CHATGPT_PASTE_UNSUPPORTED_CATEGORY', '39 unsupported category rejected');
select is((select value ->> 'status' from public.test_chatgpt_paste_results limit 1), 'draft', '40 successful paste returns created draft status');

select * from finish();
rollback;
