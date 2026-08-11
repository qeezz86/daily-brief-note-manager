begin;

create extension if not exists pgtap with schema extensions;
select plan(30);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000005a01', 'wordpress-owner-a@example.test'),
  ('00000000-0000-0000-0000-000000005a02', 'wordpress-owner-b@example.test');

create table public.test_wordpress_manual_results (value jsonb not null);
grant select, insert on public.test_wordpress_manual_results to authenticated;

create table public.test_wordpress_manual_pre_state (
  post_count bigint not null,
  seo_count bigint not null,
  tag_count bigint not null,
  post_tag_count bigint not null,
  source_count bigint not null,
  ai_metadata_count bigint not null,
  series_counter_value integer not null
);
grant select, insert on public.test_wordpress_manual_pre_state to authenticated;

create function public.test_wordpress_manual_payload(
  p_category text,
  p_reference date,
  p_series integer default null,
  p_wordpress_url text default null,
  p_title text default 'Manual WordPress title'
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
  slug_value := replace(slug_value, '###', lpad(coalesce(p_series, 0)::text, greatest(3, char_length(coalesce(p_series, 0)::text)), '0'));
  display_value := case when category_row.display_id_pattern is null then null
    else replace(replace(category_row.display_id_pattern, 'YYYY-MM-DD', p_reference::text), '###', lpad(coalesce(p_series, 0)::text, greatest(3, char_length(coalesce(p_series, 0)::text)), '0')) end;
  source_url := 'https://source.example.test/' || p_category || '/' || p_reference || coalesce('-' || p_series, '');
  metadata_value := case category_row.content_group
    when 'ai' then jsonb_build_object('field_name','AI','difficulty','beginner','estimated_read_min',8)
    when 'info_db' then jsonb_build_object('field_name','과학','difficulty','intermediate','estimated_read_min',12,'reference_date',p_reference)
    when 'chinese' then jsonb_build_object('learning_topic','경제','program_name','新闻联播','original_title','原文标题','original_url',source_url,'original_published_at',p_reference::text || 'T10:00:00+08:00','episode_list_included',false,'verified_core_fact','핵심 확인','difficulty','intermediate','learning_points','어휘')
    else null end;
  return jsonb_build_object(
    'validation_mode', 'legacy', 'category_id', p_category, 'title', p_title,
    'summary', 'Manual WordPress summary', 'slug', slug_value, 'status', 'draft',
    'briefing_date', case when category_row.content_group = 'news' then to_jsonb(p_reference) else 'null'::jsonb end,
    'published_on', to_jsonb(p_reference), 'published_at', null,
    'display_id', to_jsonb(display_value), 'series_no', to_jsonb(p_series),
    'wordpress_url', to_jsonb(p_wordpress_url),
    'html_body', '<div class="' || category_row.wrapper_class || '"><h1>' || p_title || '</h1><section id="sources"><a href="' || source_url || '">Source</a></section></div>',
    'seo', jsonb_build_object('representative_title','Representative','alternative_titles',jsonb_build_array('Alt 1','Alt 2','Alt 3','Alt 4'),'meta_description',repeat('가',120),'focus_keyword','focus'),
    'image', jsonb_build_object('prompt','Image prompt','alt','Image alt'),
    'tags', jsonb_build_array('금리','환율','물가','산업동향','정책변화'),
    'sources', jsonb_build_array(jsonb_build_object('source_name','기관','source_title','원문','source_url',source_url,'source_published_at',null,'checked_point','핵심 확인','sort_order',0)),
    'metadata', metadata_value
  );
end;
$$;

select has_function('public', 'save_wordpress_manual_post', array['jsonb'], '1 exact WordPress manual RPC exists');
select function_returns('public', 'save_wordpress_manual_post', array['jsonb'], 'jsonb', '2 WordPress manual RPC returns jsonb');
select is((select prosecdef from pg_proc where oid = 'public.save_wordpress_manual_post(jsonb)'::regprocedure), false, '3 WordPress manual RPC is security invoker');
select is((select proconfig from pg_proc where oid = 'public.save_wordpress_manual_post(jsonb)'::regprocedure), array['search_path=""'], '4 WordPress manual RPC fixes empty search path');
select function_privs_are('public', 'save_wordpress_manual_post', array['jsonb'], 'public', array[]::text[], '5 PUBLIC execute revoked');
select function_privs_are('public', 'save_wordpress_manual_post', array['jsonb'], 'anon', array[]::text[], '6 anon execute revoked');
select function_privs_are('public', 'save_wordpress_manual_post', array['jsonb'], 'authenticated', array['EXECUTE'], '7 authenticated execute granted');

set local role authenticated;
set local "request.jwt.claims" = '{"role":"authenticated"}';
select throws_ok($$ select public.save_wordpress_manual_post(public.test_wordpress_manual_payload('economy','2026-08-01')) $$, '42501', 'WORDPRESS_MANUAL_AUTH_REQUIRED', '8 missing auth uid rejected');

set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000005a01","role":"authenticated"}';
select lives_ok($$ insert into public.test_wordpress_manual_results select public.save_wordpress_manual_post(public.test_wordpress_manual_payload('economy','2026-08-01',null,'https://wordpress.example.test/economy-1')) $$, '9 owner A manual import succeeds');
select ok((select (value ->> 'postId')::uuid = post.id from public.test_wordpress_manual_results cross join public.posts post where post.slug = 'economy-briefing-2026-08-01'), '10 returned postId is valid and exact');
select is((select count(*)::integer from public.posts where slug = 'economy-briefing-2026-08-01'), 1, '11 imported post persists');
select is((select source_import_type from public.posts where slug = 'economy-briefing-2026-08-01'), 'wordpress_manual', '12 provenance is fixed to wordpress_manual');
select is((select title || '|' || category_id || '|' || slug from public.posts where slug = 'economy-briefing-2026-08-01'), 'Manual WordPress title|economy|economy-briefing-2026-08-01', '13 title category and slug are preserved');
select ok((select exists(select 1 from public.seo_data where post_id = post.id) and (select count(*) from public.sources where post_id = post.id) = 1 and (select count(*) from public.post_tags where post_id = post.id) = 5 from public.posts post where slug = 'economy-briefing-2026-08-01'), '14 publication child data persists atomically');
select throws_ok($$ select public.save_wordpress_manual_post(public.test_wordpress_manual_payload('global','2026-08-02') || '{"sourceImportType":"manual_entry"}'::jsonb) $$, '22023', 'IMPORT_FORBIDDEN_FIELD', '15 caller camelCase provenance rejected');
select throws_ok($$ select public.save_wordpress_manual_post(public.test_wordpress_manual_payload('global','2026-08-02') || '{"source_import_type":"manual_entry"}'::jsonb) $$, '22023', 'IMPORT_FORBIDDEN_FIELD', '16 caller snake_case provenance rejected');
select throws_ok($$ select public.save_wordpress_manual_post(jsonb_set(public.test_wordpress_manual_payload('global','2026-08-02'), '{metadata}', '{"provenance":"manual_entry"}'::jsonb)) $$, '23514', 'IMPORT_INVALID_METADATA', '17 nested provenance attempt rejected');
select is((select count(*)::integer from public.posts where category_id = 'global' and briefing_date = '2026-08-02'), 0, '18 rejected input leaves no post');

select throws_ok($$ select public.save_wordpress_manual_post(jsonb_set(public.test_wordpress_manual_payload('global','2026-08-03'), '{slug}', '"economy-briefing-2026-08-01"'::jsonb)) $$, '23505', 'IMPORT_DUPLICATE_SLUG', '19 duplicate slug rejected');
select throws_ok($$ select public.save_wordpress_manual_post(public.test_wordpress_manual_payload('global','2026-08-03',null,'https://wordpress.example.test/economy-1')) $$, '23505', 'IMPORT_DUPLICATE_WORDPRESS_URL', '20 duplicate WordPress URL rejected');
select throws_ok($$ select public.save_wordpress_manual_post(public.test_wordpress_manual_payload('economy','2026-08-01')) $$, '23505', 'IMPORT_DUPLICATE_BRIEFING', '21 duplicate briefing identity rejected');

set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000005a02","role":"authenticated"}';
select is((select count(*)::integer from public.posts where owner_id = '00000000-0000-0000-0000-000000005a01'), 0, '22 owner B cannot observe owner A rows');
select lives_ok($$ select public.save_wordpress_manual_post(public.test_wordpress_manual_payload('economy','2026-08-01',null,'https://wordpress.example.test/economy-1')) $$, '23 owner B independently imports the same owner-scoped identity');

set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000005a01","role":"authenticated"}';
insert into public.test_wordpress_manual_pre_state
select
  (select count(*) from public.posts where owner_id = '00000000-0000-0000-0000-000000005a01'),
  (select count(*) from public.seo_data where owner_id = '00000000-0000-0000-0000-000000005a01'),
  (select count(*) from public.tags where owner_id = '00000000-0000-0000-0000-000000005a01'),
  (select count(*) from public.post_tags where owner_id = '00000000-0000-0000-0000-000000005a01'),
  (select count(*) from public.sources where owner_id = '00000000-0000-0000-0000-000000005a01'),
  (select count(*) from public.ai_metadata where owner_id = '00000000-0000-0000-0000-000000005a01'),
  coalesce((select last_issued_no from public.series_counters where owner_id = '00000000-0000-0000-0000-000000005a01' and category_id = 'ai-column'), -1);

reset role;
create function public.test_fail_wordpress_manual_finalization()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'TEST_WORDPRESS_MANUAL_PROVENANCE_FINALIZATION_FAILURE' using errcode = 'P0001';
end;
$$;
create trigger test_fail_wordpress_manual_finalization
before update of source_import_type on public.posts
for each row
when (old.source_import_type is distinct from new.source_import_type and new.source_import_type = 'wordpress_manual')
execute function public.test_fail_wordpress_manual_finalization();

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000005a01","role":"authenticated"}';
select throws_ok($$
  select public.save_wordpress_manual_post(
    jsonb_set(
      public.test_wordpress_manual_payload('ai-column','2026-08-07',902,null,'Forced finalization rollback'),
      '{tags}',
      '["원자성검증1","원자성검증2","원자성검증3","원자성검증4","원자성검증5"]'::jsonb
    )
  )
$$, 'P0001', 'TEST_WORDPRESS_MANUAL_PROVENANCE_FINALIZATION_FAILURE', '24 forced provenance finalization update failure throws after nested import');
select ok(
  (select count(*) from public.posts where owner_id = '00000000-0000-0000-0000-000000005a01') = (select post_count from public.test_wordpress_manual_pre_state)
  and not exists(select 1 from public.posts where owner_id = '00000000-0000-0000-0000-000000005a01' and category_id = 'ai-column' and series_no = 902),
  '25 provenance failure rolls back the created post'
);
select ok(
  (select count(*) from public.seo_data where owner_id = '00000000-0000-0000-0000-000000005a01') = (select seo_count from public.test_wordpress_manual_pre_state)
  and (select count(*) from public.ai_metadata where owner_id = '00000000-0000-0000-0000-000000005a01') = (select ai_metadata_count from public.test_wordpress_manual_pre_state),
  '26 provenance failure rolls back SEO and category-specific metadata children'
);
select ok(
  (select count(*) from public.tags where owner_id = '00000000-0000-0000-0000-000000005a01') = (select tag_count from public.test_wordpress_manual_pre_state)
  and (select count(*) from public.post_tags where owner_id = '00000000-0000-0000-0000-000000005a01') = (select post_tag_count from public.test_wordpress_manual_pre_state),
  '27 provenance failure rolls back newly created tags and post-tag children'
);
select is(
  (select count(*) from public.sources where owner_id = '00000000-0000-0000-0000-000000005a01'),
  (select source_count from public.test_wordpress_manual_pre_state),
  '28 provenance failure rolls back source children'
);
select is(
  coalesce((select last_issued_no from public.series_counters where owner_id = '00000000-0000-0000-0000-000000005a01' and category_id = 'ai-column'), -1),
  (select series_counter_value from public.test_wordpress_manual_pre_state),
  '29 provenance failure rolls back the serial category counter'
);
select ok(
  exists(select 1 from pg_trigger where tgname = 'test_fail_wordpress_manual_finalization' and not tgisinternal)
  and txid_current_if_assigned() is not null,
  '30 test-only failure mechanism is active inside the rollback-scoped pgTAP transaction'
);

select * from finish();
rollback;
