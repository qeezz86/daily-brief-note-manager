begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000003c01', 'prompt-run-owner@example.test'),
  ('00000000-0000-0000-0000-000000003c02', 'prompt-run-other@example.test');

insert into public.categories (
  id, content_group, name, code, wrapper_class, display_id_pattern,
  slug_pattern, sort_order, enabled
)
select 'disabled-news', content_group, '비활성 뉴스', 'OFF', wrapper_class,
       '#YYYY-MM-DD-OFF', 'disabled-YYYY-MM-DD', 999, false
from public.categories
where id = 'economy';

create function public.test_news_prompt_snapshot(
  p_category_id text,
  p_reference_date date,
  p_recent_count integer default 0
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'schemaVersion', 1,
    'referenceDate', p_reference_date::text,
    'category', jsonb_build_object(
      'id', category.id,
      'name', category.name,
      'code', category.code,
      'wrapperClass', category.wrapper_class,
      'displayIdPattern', category.display_id_pattern,
      'slugPattern', category.slug_pattern
    ),
    'recentPosts', coalesce((
      select jsonb_agg(jsonb_build_object('index', item_no) order by item_no)
      from generate_series(1, p_recent_count) as item_no
    ), '[]'::jsonb),
    'openTopics', '[]'::jsonb,
    'pendingFollowups', '[]'::jsonb,
    'recentClosedTopics', '[]'::jsonb,
    'counts', jsonb_build_object(
      'recentPosts', p_recent_count,
      'recentUpdates', 0,
      'openTopics', 0,
      'pendingFollowups', 0,
      'overdueFollowups', 0,
      'recentClosedTopics', 0
    )
  )
  from public.categories as category
  where category.id = p_category_id;
$$;

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"00000000-0000-0000-0000-000000003c01","role":"authenticated"}';

select lives_ok($$
  select public.save_news_briefing_prompt_run(
    'economy', '2026-07-13', 'standard', 90, 1,
    public.test_news_prompt_snapshot('economy', '2026-07-13', 1),
    E'Exact prompt\n'
  )
$$, 'owner can save a news briefing prompt run');

select is((select owner_id from public.generated_prompts where prompt_text = E'Exact prompt\n'), auth.uid(), 'owner is always auth.uid');
select is((select is_pinned from public.generated_prompts where prompt_text = E'Exact prompt\n'), false, 'saved prompt starts unpinned');
select is((select prompt_text from public.generated_prompts where prompt_text = E'Exact prompt\n'), E'Exact prompt\n', 'prompt text is stored exactly');
select is((select context_snapshot from public.generated_prompts where prompt_text = E'Exact prompt\n'), public.test_news_prompt_snapshot('economy', '2026-07-13', 1), 'context snapshot is stored exactly');

select throws_ok($$ select public.save_news_briefing_prompt_run('ai-column','2026-07-13','standard',90,1,public.test_news_prompt_snapshot('ai-column','2026-07-13'),'x') $$, '22023', null::text, 'non-news category is rejected');
select throws_ok($$ select public.save_news_briefing_prompt_run('disabled-news','2026-07-13','standard',90,1,public.test_news_prompt_snapshot('disabled-news','2026-07-13'),'x') $$, '22023', null::text, 'disabled category is rejected');
select throws_ok($$ select public.save_news_briefing_prompt_run('missing','2026-07-13','standard',90,1,jsonb_build_object('schemaVersion',1,'referenceDate','2026-07-13','category',jsonb_build_object('id','missing'),'recentPosts','[]'::jsonb),'x') $$, '22023', null::text, 'missing category is rejected');
select throws_ok($$ select public.save_news_briefing_prompt_run('economy','2026-07-13','invalid',90,1,public.test_news_prompt_snapshot('economy','2026-07-13'),'x') $$, '22023', null::text, 'invalid mode is rejected');
select throws_ok($$ select public.save_news_briefing_prompt_run('economy','2026-07-13','standard',181,1,public.test_news_prompt_snapshot('economy','2026-07-13'),'x') $$, '22023', null::text, 'invalid lookback is rejected');
select throws_ok($$ select public.save_news_briefing_prompt_run('economy','2026-07-13','standard',90,1,public.test_news_prompt_snapshot('economy','2026-07-13'),'   ') $$, '22023', null::text, 'blank prompt is rejected');
select throws_ok($$ select public.save_news_briefing_prompt_run('economy','2026-07-13','standard',90,2,public.test_news_prompt_snapshot('economy','2026-07-13'),'x') $$, '22023', null::text, 'unsupported schema version is rejected');
select throws_ok($$ select public.save_news_briefing_prompt_run('economy','2026-07-13','standard',90,1,public.test_news_prompt_snapshot('global','2026-07-13'),'x') $$, '22023', null::text, 'snapshot category mismatch is rejected');
select throws_ok($$ select public.save_news_briefing_prompt_run('economy','2026-07-13','standard',90,1,public.test_news_prompt_snapshot('economy','2026-07-12'),'x') $$, '22023', null::text, 'snapshot reference date mismatch is rejected');
select is((select count(*) from public.generated_prompts where owner_id <> auth.uid()), 0::bigint, 'other owner data is not exposed');

select throws_ok($$ insert into public.generated_prompts (owner_id,category_id,requested_post_count,actual_post_count,prompt_text,reference_date,closed_lookback_days,context_schema_version,context_snapshot) values (auth.uid(),'economy',5,0,'direct','2026-07-13',90,1,public.test_news_prompt_snapshot('economy','2026-07-13')) $$, '42501', null::text, 'direct insert is denied');
select throws_ok($$ update public.generated_prompts set is_pinned = true where prompt_text = E'Exact prompt\n' $$, '42501', null::text, 'direct update is denied');
select throws_ok($$ delete from public.generated_prompts where prompt_text = E'Exact prompt\n' $$, '42501', null::text, 'direct delete is denied');
select throws_ok($$ update public.generated_prompts set prompt_text = 'changed' where prompt_text = E'Exact prompt\n' $$, '42501', null::text, 'prompt text cannot be directly changed');
select throws_ok($$ update public.generated_prompts set context_snapshot = '{}' where prompt_text = E'Exact prompt\n' $$, '42501', null::text, 'snapshot cannot be directly changed');
select is((select count(*) from public.generated_prompts where prompt_text = E'Exact prompt\n'), 1::bigint, 'owner can select own prompt run');

set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000003c02","role":"authenticated"}';
select is((select count(*) from public.generated_prompts where prompt_text = E'Exact prompt\n'), 0::bigint, 'other owner cannot select prompt run');

set local role anon;
set local "request.jwt.claims" = '{"role":"anon"}';
select throws_ok($$ select public.save_news_briefing_prompt_run('economy','2026-07-13','standard',90,1,public.test_news_prompt_snapshot('economy','2026-07-13'),'anon') $$, '42501', null::text, 'anon cannot execute save RPC');

set local role authenticated;
set local "request.jwt.claims" = '{"role":"authenticated"}';
select throws_ok($$ select public.save_news_briefing_prompt_run('economy','2026-07-13','standard',90,1,public.test_news_prompt_snapshot('economy','2026-07-13'),'missing uid') $$, '42501', null::text, 'save RPC rejects missing auth uid');

set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000003c01","role":"authenticated"}';
select lives_ok($$ select public.set_news_briefing_prompt_run_pinned((select id from public.generated_prompts where prompt_text = E'Exact prompt\n'), true) $$, 'owner can pin prompt run');
select lives_ok($$ select public.set_news_briefing_prompt_run_pinned((select id from public.generated_prompts where prompt_text = E'Exact prompt\n'), false) $$, 'owner can unpin prompt run');

set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000003c02","role":"authenticated"}';
select throws_ok($$ select public.set_news_briefing_prompt_run_pinned((select id from public.generated_prompts where prompt_text = E'Exact prompt\n'), true) $$, '22023', null::text, 'other owner cannot pin prompt run');
set local role anon;
set local "request.jwt.claims" = '{"role":"anon"}';
select throws_ok($$ select public.set_news_briefing_prompt_run_pinned('00000000-0000-0000-0000-000000000001', true) $$, '42501', null::text, 'anon cannot execute pin RPC');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000003c01","role":"authenticated"}';
select ok((
  with before_value as (
    select prompt_text, context_snapshot from public.generated_prompts where prompt_text = E'Exact prompt\n'
  ), changed as (
    select public.set_news_briefing_prompt_run_pinned((select id from public.generated_prompts where prompt_text = E'Exact prompt\n'), true)
  )
  select prompt.prompt_text = before_value.prompt_text and prompt.context_snapshot = before_value.context_snapshot
  from before_value, changed, public.generated_prompts as prompt
  where prompt.prompt_text = E'Exact prompt\n'
), 'pin changes neither prompt text nor snapshot');

select lives_ok($$
  select public.save_news_briefing_prompt_run(
    'global', '2026-07-13', 'standard', 90, 1,
    public.test_news_prompt_snapshot('global', '2026-07-13'),
    'Retention ' || lpad(item_no::text, 2, '0')
  )
  from generate_series(1, 30) as item_no
$$, 'thirty unpinned prompt runs can be saved');
select is((select count(*) from public.generated_prompts where category_id = 'global' and not is_pinned), 30::bigint, 'thirty unpinned runs are retained');

select lives_ok($$ select public.save_news_briefing_prompt_run('global','2026-07-13','standard',90,1,public.test_news_prompt_snapshot('global','2026-07-13'),'Retention 31') $$, 'the thirty-first prompt is saved and retention runs');
select ok((select count(*) = 30 and bool_or(prompt_text = 'Retention 31') and not bool_or(prompt_text = 'Retention 01') from public.generated_prompts where category_id = 'global' and not is_pinned), 'latest thirty unpinned runs remain');

select public.save_news_briefing_prompt_run('global','2026-07-13','standard',90,1,public.test_news_prompt_snapshot('global','2026-07-13'),'Pinned retention');
select public.set_news_briefing_prompt_run_pinned((select id from public.generated_prompts where prompt_text = 'Pinned retention'), true);
select ok((select count(*) = 1 from public.generated_prompts where category_id = 'global' and is_pinned), 'pinned run is excluded from automatic deletion');
select public.save_news_briefing_prompt_run('global','2026-07-13','standard',90,1,public.test_news_prompt_snapshot('global','2026-07-13'),'Retention refill');
select ok((select count(*) = 31 and count(*) filter (where is_pinned) = 1 and count(*) filter (where not is_pinned) = 30 from public.generated_prompts where category_id = 'global'), 'pinned plus thirty unpinned runs coexist');

set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000003c02","role":"authenticated"}';
select public.save_news_briefing_prompt_run('global','2026-07-13','standard',90,1,public.test_news_prompt_snapshot('global','2026-07-13'),'Other owner retention');
set local role postgres;
select ok((select count(*) = 1 from public.generated_prompts where owner_id = '00000000-0000-0000-0000-000000003c02' and category_id = 'global') and (select count(*) = 31 from public.generated_prompts where owner_id = '00000000-0000-0000-0000-000000003c01' and category_id = 'global'), 'retention is independent between owners');

update public.generated_prompts set generated_at = '2000-01-01 00:00:00+00' where prompt_text = 'Pinned retention';
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000003c01","role":"authenticated"}';
select public.set_news_briefing_prompt_run_pinned((select id from public.generated_prompts where prompt_text = 'Pinned retention'), false);
select is((select count(*) from public.generated_prompts where prompt_text = 'Pinned retention'), 0::bigint, 'unpinning an old run reapplies retention');

set local role postgres;
create function public.test_prompt_retention_delete_failure()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.owner_id = '00000000-0000-0000-0000-000000003c01' and old.category_id = 'global' then
    raise exception 'TEST_RETENTION_DELETE_FAILURE';
  end if;
  return old;
end;
$$;
create trigger generated_prompts_test_retention_failure
before delete on public.generated_prompts
for each row execute function public.test_prompt_retention_delete_failure();

create function public.test_prompt_save_rolls_back()
returns boolean language plpgsql security definer set search_path = '' as $$
declare before_count bigint; failed boolean := false;
begin
  select count(*) into before_count from public.generated_prompts where owner_id = auth.uid() and category_id = 'global';
  begin
    perform public.save_news_briefing_prompt_run('global','2026-07-13','standard',90,1,public.test_news_prompt_snapshot('global','2026-07-13'),'Rollback candidate');
  exception when others then failed := true;
  end;
  return failed
    and (select count(*) from public.generated_prompts where owner_id = auth.uid() and category_id = 'global') = before_count
    and not exists (select 1 from public.generated_prompts where owner_id = auth.uid() and prompt_text = 'Rollback candidate');
end;
$$;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000003c01","role":"authenticated"}';
select ok(public.test_prompt_save_rolls_back(), 'retention failure rolls back the new prompt run');

select * from finish();
rollback;
