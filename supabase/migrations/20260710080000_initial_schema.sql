-- Daily Brief Note Content Manager - Phase 1A initial schema.
-- Date-only values remain PostgreSQL date values. The application interprets
-- ordinary local timestamps in Asia/Seoul and CCTV timestamps in Asia/Shanghai.

create table public.categories (
  id text primary key,
  content_group text not null
    constraint categories_content_group_check
    check (content_group in ('news', 'ai', 'info_db', 'chinese')),
  name text not null constraint categories_name_not_blank check (btrim(name) <> ''),
  code text not null constraint categories_code_not_blank check (btrim(code) <> ''),
  wrapper_class text not null
    constraint categories_wrapper_class_not_blank check (btrim(wrapper_class) <> ''),
  display_id_pattern text,
  slug_pattern text not null
    constraint categories_slug_pattern_not_blank check (btrim(slug_pattern) <> ''),
  sort_order integer not null constraint categories_sort_order_check check (sort_order >= 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_code_key unique (code)
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  category_id text not null references public.categories (id) on delete restrict,
  series_no integer constraint posts_series_no_check check (series_no is null or series_no > 0),
  briefing_date date,
  published_on date,
  display_id text,
  title text not null constraint posts_title_not_blank check (btrim(title) <> ''),
  summary text not null,
  html_body text not null,
  slug text not null constraint posts_slug_not_blank check (btrim(slug) <> ''),
  wordpress_url text,
  content_status text not null default 'draft'
    constraint posts_content_status_check
    check (content_status in ('draft', 'ready', 'published', 'archived')),
  published_at timestamptz,
  source_import_type text not null
    constraint posts_source_import_type_check
    check (source_import_type in (
      'chatgpt_paste',
      'wordpress_manual',
      'manual_entry',
      'json_import'
    )),
  image_prompt text,
  image_alt text,
  image_prompt_version integer not null default 1
    constraint posts_image_prompt_version_check check (image_prompt_version > 0),
  image_prompt_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posts_id_owner_key unique (id, owner_id),
  constraint posts_owner_slug_key unique (owner_id, slug)
);

create unique index posts_owner_wordpress_url_key
  on public.posts (owner_id, wordpress_url)
  where wordpress_url is not null;

create unique index posts_owner_news_date_key
  on public.posts (owner_id, category_id, briefing_date)
  where briefing_date is not null;

create unique index posts_owner_series_no_key
  on public.posts (owner_id, category_id, series_no)
  where series_no is not null;

create index posts_owner_category_updated_idx
  on public.posts (owner_id, category_id, updated_at desc);

create table public.seo_data (
  post_id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  representative_title text not null
    constraint seo_data_representative_title_not_blank
    check (btrim(representative_title) <> ''),
  alternative_titles jsonb not null default '[]'::jsonb
    constraint seo_data_alternative_titles_array
    check (jsonb_typeof(alternative_titles) = 'array'),
  meta_description text not null,
  focus_keyword text not null
    constraint seo_data_focus_keyword_not_blank check (btrim(focus_keyword) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seo_data_post_owner_fkey
    foreign key (post_id, owner_id)
    references public.posts (id, owner_id)
    on delete cascade
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null
    constraint tags_name_normalized check (name = btrim(name) and name <> ''),
  created_at timestamptz not null default now(),
  constraint tags_id_owner_key unique (id, owner_id)
);

create unique index tags_owner_normalized_name_key
  on public.tags (owner_id, lower(name));

create table public.post_tags (
  post_id uuid not null,
  tag_id uuid not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  primary key (post_id, tag_id),
  constraint post_tags_post_owner_fkey
    foreign key (post_id, owner_id)
    references public.posts (id, owner_id)
    on delete cascade,
  constraint post_tags_tag_owner_fkey
    foreign key (tag_id, owner_id)
    references public.tags (id, owner_id)
    on delete cascade
);

create index post_tags_owner_idx on public.post_tags (owner_id);
create index post_tags_tag_owner_idx on public.post_tags (tag_id, owner_id);

create table public.ai_metadata (
  post_id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  field_name text,
  difficulty text,
  estimated_read_min integer
    constraint ai_metadata_estimated_read_min_check
    check (estimated_read_min is null or estimated_read_min > 0),
  constraint ai_metadata_post_owner_fkey
    foreign key (post_id, owner_id)
    references public.posts (id, owner_id)
    on delete cascade
);

create table public.info_db_metadata (
  post_id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  field_name text,
  difficulty text,
  estimated_read_min integer
    constraint info_db_metadata_estimated_read_min_check
    check (estimated_read_min is null or estimated_read_min > 0),
  reference_date date,
  constraint info_db_metadata_post_owner_fkey
    foreign key (post_id, owner_id)
    references public.posts (id, owner_id)
    on delete cascade
);

create table public.chinese_metadata (
  post_id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  learning_topic text not null
    constraint chinese_metadata_learning_topic_not_blank check (btrim(learning_topic) <> ''),
  program_name text not null
    constraint chinese_metadata_program_name_not_blank check (btrim(program_name) <> ''),
  original_title text not null
    constraint chinese_metadata_original_title_not_blank check (btrim(original_title) <> ''),
  original_url text not null
    constraint chinese_metadata_original_url_not_blank check (btrim(original_url) <> ''),
  original_published_at timestamptz,
  episode_list_included boolean,
  verified_core_fact text not null
    constraint chinese_metadata_verified_core_fact_not_blank
    check (btrim(verified_core_fact) <> ''),
  difficulty text,
  learning_points text,
  constraint chinese_metadata_owner_original_url_key unique (owner_id, original_url),
  constraint chinese_metadata_post_owner_fkey
    foreign key (post_id, owner_id)
    references public.posts (id, owner_id)
    on delete cascade
);

create table public.series_counters (
  owner_id uuid not null references auth.users (id) on delete cascade,
  category_id text not null references public.categories (id) on delete restrict,
  last_issued_no integer not null default 0
    constraint series_counters_last_issued_no_check check (last_issued_no >= 0),
  updated_at timestamptz not null default now(),
  primary key (owner_id, category_id)
);

create table public.news_topics (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  category_id text not null references public.categories (id) on delete restrict,
  topic_key text not null
    constraint news_topics_topic_key_not_blank check (btrim(topic_key) <> ''),
  canonical_title text not null
    constraint news_topics_canonical_title_not_blank check (btrim(canonical_title) <> ''),
  topic_summary text,
  status text not null default 'active'
    constraint news_topics_status_check
    check (status in ('active', 'monitoring', 'closed', 'reopened')),
  closed_reason text,
  first_seen_at date not null,
  last_seen_at date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint news_topics_date_order_check check (last_seen_at >= first_seen_at),
  constraint news_topics_closed_reason_check
    check (status <> 'closed' or nullif(btrim(closed_reason), '') is not null),
  constraint news_topics_id_owner_key unique (id, owner_id),
  constraint news_topics_owner_category_topic_key_key
    unique (owner_id, category_id, topic_key)
);

create index news_topics_owner_status_idx
  on public.news_topics (owner_id, status, last_seen_at desc);

create table public.news_updates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  post_id uuid not null,
  topic_id uuid not null,
  item_order integer not null
    constraint news_updates_item_order_check check (item_order > 0),
  update_type text not null
    constraint news_updates_update_type_check
    check (update_type in ('new', 'follow_up', 'correction', 'closure_note')),
  headline text not null
    constraint news_updates_headline_not_blank check (btrim(headline) <> ''),
  fact_summary text not null
    constraint news_updates_fact_summary_not_blank check (btrim(fact_summary) <> ''),
  importance_summary text,
  impact_summary text,
  change_summary text,
  previous_update_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint news_updates_id_owner_key unique (id, owner_id),
  constraint news_updates_post_owner_fkey
    foreign key (post_id, owner_id)
    references public.posts (id, owner_id)
    on delete cascade,
  constraint news_updates_topic_owner_fkey
    foreign key (topic_id, owner_id)
    references public.news_topics (id, owner_id)
    on delete restrict,
  constraint news_updates_previous_owner_fkey
    foreign key (previous_update_id, owner_id)
    references public.news_updates (id, owner_id)
    on delete set null (previous_update_id)
);

create index news_updates_post_owner_idx
  on public.news_updates (post_id, owner_id);
create index news_updates_topic_owner_idx
  on public.news_updates (topic_id, owner_id, item_order);
create index news_updates_previous_owner_idx
  on public.news_updates (previous_update_id, owner_id)
  where previous_update_id is not null;

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  post_id uuid not null,
  news_update_id uuid,
  source_name text not null
    constraint sources_source_name_not_blank check (btrim(source_name) <> ''),
  source_title text not null
    constraint sources_source_title_not_blank check (btrim(source_title) <> ''),
  source_url text not null
    constraint sources_source_url_not_blank check (btrim(source_url) <> ''),
  source_published_at timestamptz,
  checked_at timestamptz,
  checked_point text not null
    constraint sources_checked_point_not_blank check (btrim(checked_point) <> ''),
  sort_order integer not null default 0
    constraint sources_sort_order_check check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sources_post_owner_fkey
    foreign key (post_id, owner_id)
    references public.posts (id, owner_id)
    on delete cascade,
  constraint sources_news_update_owner_fkey
    foreign key (news_update_id, owner_id)
    references public.news_updates (id, owner_id)
    on delete set null (news_update_id)
);

create index sources_post_owner_idx on public.sources (post_id, owner_id, sort_order);
create index sources_news_update_owner_idx
  on public.sources (news_update_id, owner_id)
  where news_update_id is not null;

create table public.news_followups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  topic_id uuid not null,
  check_text text not null
    constraint news_followups_check_text_not_blank check (btrim(check_text) <> ''),
  status text not null default 'pending'
    constraint news_followups_status_check
    check (status in ('pending', 'done', 'cancelled')),
  due_date date,
  priority text not null default 'normal'
    constraint news_followups_priority_check
    check (priority in ('high', 'normal', 'low')),
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint news_followups_resolution_check
    check ((status = 'pending' and resolved_at is null) or status <> 'pending'),
  constraint news_followups_topic_owner_fkey
    foreign key (topic_id, owner_id)
    references public.news_topics (id, owner_id)
    on delete cascade
);

create index news_followups_topic_owner_status_idx
  on public.news_followups (topic_id, owner_id, status);

create table public.news_status_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  topic_id uuid not null,
  from_status text
    constraint news_status_history_from_status_check
    check (from_status is null or from_status in ('active', 'monitoring', 'closed', 'reopened')),
  to_status text not null
    constraint news_status_history_to_status_check
    check (to_status in ('active', 'monitoring', 'closed', 'reopened')),
  reason text,
  changed_at timestamptz not null default now(),
  constraint news_status_history_topic_owner_fkey
    foreign key (topic_id, owner_id)
    references public.news_topics (id, owner_id)
    on delete cascade
);

create index news_status_history_topic_owner_changed_idx
  on public.news_status_history (topic_id, owner_id, changed_at desc);

create table public.generated_prompts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  category_id text not null references public.categories (id) on delete restrict,
  requested_post_count integer not null
    constraint generated_prompts_requested_post_count_check
    check (requested_post_count > 0),
  actual_post_count integer not null
    constraint generated_prompts_actual_post_count_check
    check (actual_post_count >= 0 and actual_post_count <= requested_post_count),
  prompt_mode text not null default 'standard'
    constraint generated_prompts_prompt_mode_check
    check (prompt_mode in ('simple', 'standard', 'detailed')),
  prompt_text text not null
    constraint generated_prompts_prompt_text_not_blank check (btrim(prompt_text) <> ''),
  is_pinned boolean not null default false,
  generated_at timestamptz not null default now()
);

create index generated_prompts_retention_idx
  on public.generated_prompts (
    owner_id,
    category_id,
    is_pinned,
    generated_at desc,
    id desc
  );

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$$;

create function public.set_image_prompt_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    if new.image_prompt is not null and new.image_prompt_updated_at is null then
      new.image_prompt_updated_at = statement_timestamp();
    end if;
  elsif new.image_prompt is distinct from old.image_prompt then
    new.image_prompt_updated_at = statement_timestamp();
  end if;

  return new;
end;
$$;

create function public.validate_post_category_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  category_group text;
begin
  select content_group
    into category_group
    from public.categories
   where id = new.category_id;

  if category_group is null then
    raise exception 'Unknown category: %', new.category_id
      using errcode = '23503';
  end if;

  if category_group = 'news' and new.briefing_date is null then
    raise exception 'News posts require briefing_date'
      using errcode = '23514';
  end if;

  if category_group <> 'news' and new.series_no is null then
    raise exception 'Non-news series posts require series_no'
      using errcode = '23514';
  end if;

  if category_group = 'chinese' and new.display_id is not null then
    raise exception 'Chinese study posts must not use display_id'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create function public.validate_news_topic_category()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  category_group text;
begin
  select content_group
    into category_group
    from public.categories
   where id = new.category_id;

  if category_group is distinct from 'news' then
    raise exception 'News topics require a news category'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

create trigger posts_validate_category_fields
before insert or update of category_id, briefing_date, series_no, display_id
on public.posts
for each row execute function public.validate_post_category_fields();

create trigger posts_set_image_prompt_updated_at
before insert or update of image_prompt
on public.posts
for each row execute function public.set_image_prompt_updated_at();

create trigger posts_set_updated_at
before update on public.posts
for each row execute function public.set_updated_at();

create trigger seo_data_set_updated_at
before update on public.seo_data
for each row execute function public.set_updated_at();

create trigger news_topics_validate_category
before insert or update of category_id
on public.news_topics
for each row execute function public.validate_news_topic_category();

create trigger news_topics_set_updated_at
before update on public.news_topics
for each row execute function public.set_updated_at();

create trigger news_updates_set_updated_at
before update on public.news_updates
for each row execute function public.set_updated_at();

create trigger sources_set_updated_at
before update on public.sources
for each row execute function public.set_updated_at();

create trigger news_followups_set_updated_at
before update on public.news_followups
for each row execute function public.set_updated_at();

create trigger series_counters_set_updated_at
before update on public.series_counters
for each row execute function public.set_updated_at();

create function public.issue_series_no(
  p_owner_id uuid,
  p_category_id text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  category_group text;
  next_number integer;
begin
  if (select auth.uid()) is null or (select auth.uid()) <> p_owner_id then
    raise exception 'Cannot issue a series number for another owner'
      using errcode = '42501';
  end if;

  select content_group
    into category_group
    from public.categories
   where id = p_category_id
     and enabled = true;

  if category_group is null then
    raise exception 'Unknown or disabled category: %', p_category_id
      using errcode = '22023';
  end if;

  if category_group not in ('ai', 'info_db', 'chinese') then
    raise exception 'Series numbers are not available for news categories'
      using errcode = '22023';
  end if;

  insert into public.series_counters (
    owner_id,
    category_id,
    last_issued_no,
    updated_at
  )
  values (p_owner_id, p_category_id, 1, statement_timestamp())
  on conflict (owner_id, category_id)
  do update
     set last_issued_no = public.series_counters.last_issued_no + 1,
         updated_at = statement_timestamp()
  returning last_issued_no into next_number;

  return next_number;
end;
$$;

create function public.save_generated_prompt(
  p_owner_id uuid,
  p_category_id text,
  p_requested_post_count integer,
  p_actual_post_count integer,
  p_prompt_mode text,
  p_prompt_text text,
  p_is_pinned boolean default false
)
returns public.generated_prompts
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_prompt public.generated_prompts;
begin
  if (select auth.uid()) is null or (select auth.uid()) <> p_owner_id then
    raise exception 'Cannot save a prompt for another owner'
      using errcode = '42501';
  end if;

  insert into public.generated_prompts (
    owner_id,
    category_id,
    requested_post_count,
    actual_post_count,
    prompt_mode,
    prompt_text,
    is_pinned
  )
  values (
    p_owner_id,
    p_category_id,
    p_requested_post_count,
    p_actual_post_count,
    p_prompt_mode,
    p_prompt_text,
    p_is_pinned
  )
  returning * into saved_prompt;

  delete from public.generated_prompts as prompt
   using (
     select id
       from public.generated_prompts
      where owner_id = p_owner_id
        and category_id = p_category_id
        and is_pinned = false
      order by generated_at desc, id desc
      offset 30
   ) as stale
   where prompt.id = stale.id;

  return saved_prompt;
end;
$$;

alter table public.categories enable row level security;
revoke all on table public.categories from anon, authenticated;
grant select on table public.categories to authenticated;

create policy categories_select_authenticated
on public.categories
for select
to authenticated
using (true);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'posts',
    'seo_data',
    'tags',
    'post_tags',
    'sources',
    'ai_metadata',
    'info_db_metadata',
    'chinese_metadata',
    'series_counters',
    'news_topics',
    'news_updates',
    'news_followups',
    'news_status_history',
    'generated_prompts'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format(
      'grant select, insert, update, delete on table public.%I to authenticated',
      table_name
    );
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select auth.uid()) = owner_id)',
      table_name || '_select_own',
      table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = owner_id)',
      table_name || '_insert_own',
      table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id)',
      table_name || '_update_own',
      table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = owner_id)',
      table_name || '_delete_own',
      table_name
    );
  end loop;
end;
$$;

revoke all on function public.issue_series_no(uuid, text) from public, anon;
grant execute on function public.issue_series_no(uuid, text) to authenticated;

revoke all on function public.save_generated_prompt(
  uuid,
  text,
  integer,
  integer,
  text,
  text,
  boolean
) from public, anon;
grant execute on function public.save_generated_prompt(
  uuid,
  text,
  integer,
  integer,
  text,
  text,
  boolean
) to authenticated;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.set_image_prompt_updated_at() from public, anon, authenticated;
revoke all on function public.validate_post_category_fields() from public, anon, authenticated;
revoke all on function public.validate_news_topic_category() from public, anon, authenticated;
