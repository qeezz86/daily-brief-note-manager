begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

select is((select slug_pattern from public.categories where id = 'technology'), 'technology-briefing-YYYY-MM-DD', 'technology uses the current slug pattern');
select is((select slug_pattern from public.categories where id = 'climate-energy'), 'climate-energy-briefing-YYYY-MM-DD', 'climate and energy uses the current slug pattern');
select is((select slug_pattern from public.categories where id = 'chinese-study'), 'cctv-chinese-news-###', 'Chinese study uses the current slug pattern');
select is((select count(*)::integer from public.categories where slug_pattern in ('science-tech-briefing-YYYY-MM-DD','environment-briefing-YYYY-MM-DD','cctv-chinese-news-study-###')), 0, 'deprecated patterns are not current category settings');
select is((select slug_pattern from public.categories where id = 'economy'), 'economy-briefing-YYYY-MM-DD', 'economy pattern is unchanged');
select is((select slug_pattern from public.categories where id = 'global'), 'global-briefing-YYYY-MM-DD', 'global pattern is unchanged');
select is((select slug_pattern from public.categories where id = 'society'), 'society-briefing-YYYY-MM-DD', 'society pattern is unchanged');
select is((select slug_pattern from public.categories where id = 'ai-column'), 'ai-###', 'AI pattern is unchanged');
select is((select slug_pattern from public.categories where id = 'info-db'), 'info-db-###', 'information DB pattern is unchanged');
select is(replace((select slug_pattern from public.categories where id = 'chinese-study'), '###', lpad(1::text, 3, '0')), 'cctv-chinese-news-001', 'Chinese series one is zero padded');
select is(replace((select slug_pattern from public.categories where id = 'chinese-study'), '###', lpad(1000::text, greatest(3, char_length(1000::text)), '0')), 'cctv-chinese-news-1000', 'Chinese series 1000 is not truncated');

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000004c0', 'slug-migration@example.test');
select lives_ok($$
  insert into public.posts (owner_id,category_id,briefing_date,published_on,title,summary,html_body,slug,wordpress_url,content_status,source_import_type)
  values ('00000000-0000-0000-0000-0000000004c0','technology','2026-07-01','2026-07-01','Legacy technology','Summary','<div>Legacy body</div>','science-tech-briefing-2026-07-01','https://example.test/science-tech-briefing-2026-07-01','published','wordpress_manual')
$$, 'a published legacy post can remain stored');

select lives_ok($$
  update public.categories set slug_pattern='technology-briefing-YYYY-MM-DD', updated_at=statement_timestamp()
   where id='technology' and code='TEC' and content_group='news' and slug_pattern='science-tech-briefing-YYYY-MM-DD';
  update public.categories set slug_pattern='climate-energy-briefing-YYYY-MM-DD', updated_at=statement_timestamp()
   where id='climate-energy' and code='ENV' and content_group='news' and slug_pattern='environment-briefing-YYYY-MM-DD';
  update public.categories set slug_pattern='cctv-chinese-news-###', updated_at=statement_timestamp()
   where id='chinese-study' and code='CHINESE' and content_group='chinese' and slug_pattern='cctv-chinese-news-study-###'
$$, 'forward category updates are safe to reapply');
select is((select slug from public.posts where owner_id='00000000-0000-0000-0000-0000000004c0'), 'science-tech-briefing-2026-07-01', 'category update does not rewrite an existing post slug');
select is((select wordpress_url from public.posts where owner_id='00000000-0000-0000-0000-0000000004c0'), 'https://example.test/science-tech-briefing-2026-07-01', 'category update does not rewrite an existing WordPress URL');

select * from finish();
rollback;
