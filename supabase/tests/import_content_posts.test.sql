begin;

create extension if not exists pgtap with schema extensions;
select plan(60);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000004a2', 'import-owner@example.test'),
  ('00000000-0000-0000-0000-0000000004b2', 'import-other@example.test');

create function public.test_import_payload(
  p_category text,
  p_reference date,
  p_series integer default null,
  p_status text default 'draft',
  p_wordpress_url text default null,
  p_title text default 'Imported title'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  category_row public.categories;
  slug_value text;
  display_value text;
  source_url text;
  metadata_value jsonb;
begin
  select * into category_row from public.categories where id = p_category;
  slug_value := replace(category_row.slug_pattern, 'YYYY-MM-DD', p_reference::text);
  slug_value := replace(slug_value, '###', lpad(coalesce(p_series, 0)::text, 3, '0'));
  display_value := case when category_row.display_id_pattern is null then null
    else replace(replace(category_row.display_id_pattern, 'YYYY-MM-DD', p_reference::text), '###', lpad(coalesce(p_series, 0)::text, 3, '0')) end;
  source_url := case when category_row.content_group = 'chinese'
    then 'https://news.cctv.com/' || to_char(p_reference, 'YYYY/MM/DD') || '/content-' || p_series || '.shtml'
    else 'https://example.com/' || p_category || '/' || p_reference || coalesce('-' || p_series, '') end;
  metadata_value := case category_row.content_group
    when 'ai' then jsonb_build_object('field_name','AI','difficulty','beginner','estimated_read_min',8)
    when 'info_db' then jsonb_build_object('field_name','과학','difficulty','intermediate','estimated_read_min',12,'reference_date',p_reference)
    when 'chinese' then jsonb_build_object('learning_topic','경제','program_name','新闻联播','original_title','原文标题','original_url',source_url,'original_published_at',p_reference::text || 'T10:00:00+08:00','episode_list_included',false,'verified_core_fact','핵심 문장 확인','difficulty','intermediate','learning_points','어휘')
    else null end;
  return jsonb_build_object(
    'category_id', p_category, 'title', p_title, 'summary', 'Imported summary',
    'slug', slug_value, 'status', p_status,
    'briefing_date', case when category_row.content_group = 'news' then to_jsonb(p_reference) else 'null'::jsonb end,
    'published_on', to_jsonb(p_reference), 'published_at', to_jsonb(p_reference::text || 'T09:30:00+09:00'),
    'display_id', to_jsonb(display_value), 'series_no', to_jsonb(p_series),
    'wordpress_url', to_jsonb(p_wordpress_url),
    'html_body', '<div class="' || category_row.wrapper_class || '"><h1>' || p_title || '</h1><section id="sources"><a href="' || source_url || '">Source</a></section></div>',
    'seo', jsonb_build_object('representative_title','Representative','alternative_titles',jsonb_build_array('Alt 1','Alt 2','Alt 3','Alt 4'),'meta_description',repeat('가',120),'focus_keyword','focus'),
    'image', jsonb_build_object('prompt','Image prompt','alt','Image alt'),
    'tags', jsonb_build_array('금리','환율','물가','산업동향','정책변화'),
    'sources', jsonb_build_array(jsonb_build_object('source_name','기관','source_title','원문','source_url',source_url,'source_published_at',p_reference::text || 'T08:00:00+09:00','checked_point','핵심 확인','sort_order',0)),
    'metadata', metadata_value
  );
end;
$$;

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"00000000-0000-0000-0000-0000000004a2","role":"authenticated"}';

select has_function('public', 'import_content_post', array['jsonb'], '1 import RPC exists');
select function_privs_are('public', 'import_content_post', array['jsonb'], 'authenticated', array['EXECUTE'], '2 authenticated can execute');
select function_privs_are('public', 'import_content_post', array['jsonb'], 'anon', array[]::text[], '3 anon cannot execute');
select lives_ok($$ select public.import_content_post(public.test_import_payload('economy','2026-08-01')) $$, '4 authenticated draft import succeeds');
select is((select count(*)::integer from public.posts where owner_id='00000000-0000-0000-0000-0000000004a2'),1,'5 one post saved');
select is((select source_import_type from public.posts where slug='economy-briefing-2026-08-01'),'json_import','6 import type saved');
select is((select title from public.posts where slug='economy-briefing-2026-08-01'),'Imported title','7 title saved');
select is((select summary from public.posts where slug='economy-briefing-2026-08-01'),'Imported summary','8 summary saved');
select is((select content_status from public.posts where slug='economy-briefing-2026-08-01'),'draft','9 draft status saved');
select is((select published_on from public.posts where slug='economy-briefing-2026-08-01'),'2026-08-01'::date,'10 published_on saved');
select ok((select published_at is not null from public.posts where slug='economy-briefing-2026-08-01'),'11 published_at preserved');
select ok((select html_body like '<div class=%' from public.posts where slug='economy-briefing-2026-08-01'),'12 HTML saved');
select is((select representative_title from public.seo_data where post_id=(select id from public.posts where slug='economy-briefing-2026-08-01')),'Representative','13 SEO saved');
select is((select image_prompt from public.posts where slug='economy-briefing-2026-08-01'),'Image prompt','14 image prompt saved');
select is((select image_alt from public.posts where slug='economy-briefing-2026-08-01'),'Image alt','15 image alt saved');
select is((select count(*)::integer from public.post_tags where post_id=(select id from public.posts where slug='economy-briefing-2026-08-01')),5,'16 five tag relations saved');
select is((select count(*)::integer from public.sources where post_id=(select id from public.posts where slug='economy-briefing-2026-08-01')),1,'17 source saved');
select is((select sort_order from public.sources where post_id=(select id from public.posts where slug='economy-briefing-2026-08-01')),0,'18 source order saved');
select lives_ok($$ select public.import_content_post(public.test_import_payload('global','2026-08-02',null,'ready')) $$,'19 ready import succeeds');
select lives_ok($$ select public.import_content_post(public.test_import_payload('society','2026-08-03',null,'published','https://example.org/published')) $$,'20 published import succeeds');
select lives_ok($$ select public.import_content_post(public.test_import_payload('technology','2026-08-04',null,'archived')) $$,'21 archived import succeeds');
select is((select wordpress_url from public.posts where category_id='society' and briefing_date='2026-08-03'),'https://example.org/published','22 WordPress URL saved');
select is((select display_id from public.posts where category_id='global' and briefing_date='2026-08-02'),'#2026-08-02-GLO','23 news display ID saved');
select is((select briefing_date from public.posts where category_id='technology' and briefing_date='2026-08-04'),'2026-08-04'::date,'24 news metadata saved');
select lives_ok($$ select public.import_content_post(public.test_import_payload('ai-column','2026-08-05',51,'ready')) $$,'25 AI import succeeds');
select is((select field_name from public.ai_metadata where post_id=(select id from public.posts where category_id='ai-column' and series_no=51)),'AI','26 AI metadata saved');
select is((select estimated_read_min from public.ai_metadata where post_id=(select id from public.posts where category_id='ai-column' and series_no=51)),8,'27 AI read time saved');
select lives_ok($$ select public.import_content_post(public.test_import_payload('info-db','2026-08-06',52,'ready')) $$,'28 info DB import succeeds');
select is((select difficulty from public.info_db_metadata where post_id=(select id from public.posts where category_id='info-db' and series_no=52)),'intermediate','29 info difficulty saved');
select is((select reference_date from public.info_db_metadata where post_id=(select id from public.posts where category_id='info-db' and series_no=52)),'2026-08-06'::date,'30 info reference date saved');
select lives_ok($$ select public.import_content_post(public.test_import_payload('chinese-study','2026-08-07',53,'ready')) $$,'31 Chinese import succeeds');
select is((select display_id from public.posts where category_id='chinese-study' and series_no=53),null,'32 Chinese has no display ID');
select is((select episode_list_included from public.chinese_metadata where post_id=(select id from public.posts where category_id='chinese-study' and series_no=53)),false,'33 Chinese false preserved');
select is((select program_name from public.chinese_metadata where post_id=(select id from public.posts where category_id='chinese-study' and series_no=53)),'新闻联播','34 Chinese metadata saved');
select is((select last_issued_no from public.series_counters where owner_id='00000000-0000-0000-0000-0000000004a2' and category_id='ai-column'),51,'35 AI counter synchronized');
select lives_ok($$ select public.import_content_post(public.test_import_payload('ai-column','2026-08-08',4,'draft')) $$,'36 lower AI series imports');
select is((select last_issued_no from public.series_counters where owner_id='00000000-0000-0000-0000-0000000004a2' and category_id='ai-column'),51,'37 lower series does not reduce counter');
select is((select count(*)::integer from public.series_counters where owner_id='00000000-0000-0000-0000-0000000004b2'),0,'38 other owner counter untouched');
select is((select last_issued_no from public.series_counters where owner_id='00000000-0000-0000-0000-0000000004a2' and category_id='info-db'),52,'39 category counter isolated');
select throws_ok($$ select public.import_content_post(public.test_import_payload('economy','2026-08-01')) $$,'23505','IMPORT_DUPLICATE_BRIEFING','40 duplicate briefing safely rejected');
select throws_ok($$ select public.import_content_post(public.test_import_payload('global','2026-08-13',null,'draft','https://example.org/published')) $$,'23505','IMPORT_DUPLICATE_WORDPRESS_URL','41 duplicate WordPress URL safely rejected');
select throws_ok($$ select public.import_content_post(public.test_import_payload('ai-column','2026-08-05',51)) $$,'23505','IMPORT_DUPLICATE_SERIES','42 duplicate series safely rejected');
select throws_ok($$ select public.import_content_post(public.test_import_payload('chinese-study','2026-08-07',53)) $$,'23505','IMPORT_DUPLICATE_CHINESE_URL','43 duplicate Chinese URL safely rejected');
insert into public.posts (owner_id,category_id,briefing_date,title,summary,slug,content_status,source_import_type)
values ('00000000-0000-0000-0000-0000000004a2','technology','2026-08-20','Historical','Historical','economy-briefing-2026-08-14','draft','manual_entry');
select throws_ok($$ select public.import_content_post(public.test_import_payload('economy','2026-08-14')) $$,'23505','IMPORT_DUPLICATE_SLUG','44 duplicate slug safely rejected');
select throws_ok($$ select public.import_content_post(public.test_import_payload('economy','2026-08-09') || '{"owner_id":"00000000-0000-0000-0000-0000000004b2"}'::jsonb) $$,'22023','IMPORT_FORBIDDEN_FIELD','45 owner injection rejected');
select throws_ok($$ select public.import_content_post(public.test_import_payload('economy','2026-08-09') || '{"id":"00000000-0000-0000-0000-000000000001"}'::jsonb) $$,'22023','IMPORT_FORBIDDEN_FIELD','46 post ID injection rejected');
select throws_ok($$ select public.import_content_post(public.test_import_payload('economy','2026-08-09') || '{"metadata":{"field_name":"wrong"}}'::jsonb) $$,'23514','IMPORT_INVALID_METADATA','47 wrong news metadata rejected');
select throws_ok($$ select public.import_content_post(public.test_import_payload('ai-column','2026-08-09',54) || '{"metadata":{"unknown":"x"}}'::jsonb) $$,'22023','IMPORT_INVALID_METADATA','48 unknown metadata rejected');
select throws_ok($$ select public.import_content_post(jsonb_set(public.test_import_payload('economy','2026-08-09'),'{html_body}',to_jsonb('<script>alert(1)</script>'::text))) $$,'23514','IMPORT_VALIDATION_FAILED','49 script HTML rejected');
select throws_ok($$ select public.import_content_post(jsonb_set(public.test_import_payload('economy','2026-08-09'),'{html_body}',to_jsonb('<div onclick="x()"><h1>X</h1></div>'::text))) $$,'23514','IMPORT_VALIDATION_FAILED','50 event handler rejected');
select throws_ok($$ select public.import_content_post(jsonb_set(public.test_import_payload('economy','2026-08-09'),'{tags}','["A","A"]'::jsonb)) $$,'23514',null::text,'51 duplicate tag rejects item');
select is((select count(*)::integer from public.posts where category_id='economy' and briefing_date='2026-08-09'),0,'52 tag failure rolls back post');
select throws_ok($$ select public.import_content_post(jsonb_set(
  public.test_import_payload('economy','2026-08-10'), '{sources}',
  '[{"source_name":"A","source_title":"A","source_url":"https://example.com/a","source_published_at":null,"checked_point":"A","sort_order":0},{"source_name":"B","source_title":"B","source_url":"https://example.com/b","source_published_at":null,"checked_point":"B","sort_order":0}]'::jsonb
)) $$,'23514','IMPORT_VALIDATION_FAILED','53 source relation failure is safe');
select is((select count(*)::integer from public.posts where category_id='economy' and briefing_date='2026-08-10'),0,'54 source failure rolls back post');
select lives_ok($$ select public.import_content_post(public.test_import_payload('climate-energy','2026-08-11')) $$,'55 another import reuses normalized tags');
select is((select count(*)::integer from public.tags where owner_id='00000000-0000-0000-0000-0000000004a2' and normalized_name='금리'),1,'56 normalized tag reused');
select is((select count(*)::integer from public.news_topics where owner_id='00000000-0000-0000-0000-0000000004a2'),0,'57 news topics not imported');
select is((select count(*)::integer from public.news_updates where owner_id='00000000-0000-0000-0000-0000000004a2'),0,'58 news updates not imported');

set local "request.jwt.claims" = '{"role":"authenticated"}';
select throws_ok($$ select public.import_content_post(public.test_import_payload('economy','2026-08-12')) $$,'42501','IMPORT_AUTH_REQUIRED','59 missing auth.uid rejected');
set local role anon;
set local "request.jwt.claims" = '{"role":"anon"}';
select throws_ok($$ select public.import_content_post('{}'::jsonb) $$,'42501',null::text,'60 anon execution rejected');

select * from finish();
rollback;
