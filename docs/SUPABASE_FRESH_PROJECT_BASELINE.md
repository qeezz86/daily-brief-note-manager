# Supabase Fresh Project Baseline

## 1. 목적

이 문서는 비어 있는 Supabase 프로젝트에 Daily Brief Note Content Manager의 로컬 schema를 처음 설치하기 위한 **승인 전 계획**이다. 이 단계에서는 원격 migration, seed, Function, secret, Auth 사용자, WordPress 또는 frontend를 변경하지 않는다. Machine-readable source of truth는 `config/supabase-fresh-project-baseline.json`이다.

## 2. fresh project 정의와 현재 확인 상태

Fresh project는 다음을 모두 만족한다.

- `supabase_migrations.schema_migrations`가 없거나 0행이다.
- 예상 public application table과 application function이 없다.
- 로컬 22개 migration이 전부 pending이다.
- whitelist 밖 remote application object와 remote-only migration이 없다.

2026-07-21 read-only inspection에서 application table/function과 migration history는 0건이었고, sanitized dry-run evidence의 pending 목록은 아래 22개 전부였다. 따라서 판정은 `FRESH_PROJECT_BASELINE_REQUIRED`이다. 이전 Gate 2의 “마지막 3개만 pending” 판단은 실제 dry-run과 달랐다. Gate 4는 dry-run에서 안전하게 중단되었고 원격 write는 0건이다. 이는 history repair 대상이 아니라 fresh baseline 승인 대상이다.

## 3. migration 순서와 dependency

| # | Migration | 목적 | 직접 선행 조건 | 데이터 영향 |
|---:|---|---|---|---|
| 1 | `20260710080000_initial_schema.sql` | core table, ownership, RLS, trigger, 초기 RPC | 없음 | 신규 객체 |
| 2 | `20260710110000_allow_empty_draft_html_body.sql` | draft HTML nullable/상태 constraint | 1 | schema only |
| 3 | `20260711100000_save_post_editor.sql` | editor RPC와 draft SEO | 2 | schema/RPC |
| 4 | `20260711150000_save_post_publication_bundle.sql` | tag/source 정규화와 publication bundle | 3 | tag/source 순서의 제어된 rewrite |
| 5 | `20260711190000_save_chinese_publication_bundle.sql` | 중국어 metadata/index/RPC | 4 | schema/RPC |
| 6 | `20260712100000_save_ai_info_publication_bundles.sql` | AI·정보DB bundle RPC | 4 | RPC |
| 7 | `20260712160000_manage_news_topics.sql` | topic 정규화와 상태 전환 | 1 | index/trigger/RPC |
| 8 | `20260712210000_manage_news_updates.sql` | update 연결·순서·RPC | 4, 7 | update 순서의 제어된 rewrite |
| 9 | `20260712220000_harden_news_updates.sql` | update race hardening | 8 | RPC replacement |
| 10 | `20260712230000_manage_news_followups.sql` | follow-up RPC | 7 | RPC |
| 11 | `20260713120000_get_news_briefing_prompt_context.sql` | read-only prompt context | 9, 10 | RPC |
| 12 | `20260713180000_manage_news_briefing_prompt_runs.sql` | prompt snapshot·pin·retention | 11 | 기존 prompt snapshot backfill; 구 RPC 제거 |
| 13 | `20260714120000_import_content_posts.sql` | content import RPC | 5, 6, 12 | RPC |
| 14 | `20260714180000_import_news_tracking.sql` | tracking import RPC | 10, 13 | RPC |
| 15 | `20260715090000_manage_import_jobs.sql` | Import job tables, RLS, RPC | 14 | 신규 객체 |
| 16 | `20260715120000_get_user_backup_snapshot.sql` | backup estimate/snapshot | 15 | RPC |
| 17 | `20260716100000_execute_core_restore_jobs.sql` | restore job tables, RLS, RPC | 16 | 신규 객체 |
| 18 | `20260716160000_restore_import_history.sql` | full Import history restore lock | 15, 17 | nullable/default provenance columns; RPC wrappers |
| 19 | `20260716170000_correct_category_slug_patterns.sql` | 현재 category slug correction | 13, 18 | guarded category reference rewrite; posts 미변경 |
| 20 | `20260718120000_wordpress_taxonomy_mappings.sql` | taxonomy mapping과 backup/restore 확장 | 19 | 신규 table/RLS/RPC wrappers |
| 21 | `20260719120000_wordpress_draft_creation.sql` | publication attempt audit/idempotency | 20 | 신규 table/RLS/RPC |
| 22 | `20260719130000_harden_wordpress_draft_transition.sql` | service-only transition | 21 | 의도된 `REVOKE`/`DROP FUNCTION` 후 replacement |

정적 검수 결과 `DROP TABLE`, `TRUNCATE`, 무조건 `DELETE`, 기존 `posts` 대량 rewrite, credential literal, 실제 UUID/email, production URL literal은 없다. `DROP FUNCTION`, `DROP INDEX`, constraint/function rename은 replacement를 위한 forward hardening이며 table/data 파괴와 구분한다. 상세 object와 flag는 manifest에 기록한다.

## 4. production seed

`supabase/config.toml`은 `[db.seed] enabled = true`, `sql_paths = ["./seed/*.sql"]`이다. 승인 seed는 한 개뿐이다.

| 파일 | 대상 | 방식 | fresh 적용 | existing 재실행 |
|---|---|---|---|---|
| `supabase/seed/01_categories.sql` | `public.categories` | `INSERT ... ON CONFLICT (id) DO UPDATE` | migration 22개 뒤 | 기술적으로 idempotent지만 incremental 배포에서는 기본 금지 |

허용 데이터는 제품 동작에 필요한 정적 category definition뿐이다. 사용자, 이메일, UUID, post/HTML/news, taxonomy mapping ID, publication attempt, URL, credential/token은 금지한다. Seed는 특정 Auth user나 FK user를 요구하지 않는다.

Supabase CLI 2.109.1 help 기준으로 `db reset`은 기본적으로 configured seed를 migration 뒤 실행하며 `--no-seed`로 생략한다. `db push`는 `--include-seed`를 명시한 경우에만 config seed를 포함한다. `--sql-paths`는 local reset의 seed 경로 override다. 실제 원격 실행은 별도 승인 Gate에서만 한다.

Expected category ID는 다음 8개다: `economy`, `global`, `technology`, `society`, `climate-energy`, `ai-column`, `info-db`, `chinese-study`.

## 5. deployment mode 분류

- `FRESH_PROJECT_BASELINE_REQUIRED`: history 0, application object 0, pending 정확히 22, remote-only/unknown object 0.
- `EXISTING_PROJECT_INCREMENTAL_READY`: 앞 19개 history/schema 일치, 마지막 3개만 pending, core schema 존재. Seed 재적용 없음.
- `PARTIAL_BASELINE_BLOCKED`: 일부 migration/object만 존재하거나 pending set이 어느 승인 경로와도 일치하지 않음.
- `HISTORY_MISMATCH_BLOCKED`: schema가 있으나 history가 없거나, remote-only version, history/schema 불일치, checksum 상태 불명확.
- `UNEXPECTED_REMOTE_OBJECTS_BLOCKED`: fresh로 예상한 프로젝트에 whitelist 밖 application table/function/object가 존재.

Checker는 `scripts/fixtures/supabase-fresh-baseline/`의 sanitized JSON 또는 같은 schema의 operator summary만 읽는다. 원격 조회, protected env read, CLI 실행 또는 network 요청을 하지 않는다.

## 6. 승인 절차와 예상 원격 변경

실제 원격 변경 전 다음을 하나의 Gate evidence로 제출한다.

1. exact commit과 clean worktree
2. DB·WordPress backup 상태
3. sanitized remote classification
4. manifest와 checker PASS
5. local reset/lint/pgTAP, Vitest, Deno, smoke, E2E, lint, build, bundle PASS
6. migration 22개와 seed 1개의 exact whitelist
7. 예상 변경: public table 23개, manifest의 expected RPC, RLS/policies/index, category 8개
8. 원격 baseline migration과 seed를 실행한다는 별도 명시적 사용자 승인

승인 범위는 DB baseline/seed까지만이다. WordPress secrets, Functions, frontend와 draft smoke는 이 승인에 포함하지 않는다.

## 7. Auth user bootstrap timing

- Baseline migration과 category seed는 Auth user 없이 실행 가능하며 사용자 UUID를 포함하지 않는다.
- DB post-deployment 검증이 끝난 뒤 첫 운영 사용자를 Supabase Auth에서 만든다.
- Email confirmation이 켜져 있으면 확인 완료 뒤 첫 로그인을 검증한다.
- 첫 로그인 뒤 browser publishable/temporary legacy anon key로 owner-scoped empty read와 최소 test record lifecycle을 검증한다. Browser에 service role/secret key를 주지 않는다.
- `WORDPRESS_ALLOWED_USER_ID`는 확인된 첫 운영 사용자 UUID를 얻은 뒤, WordPress custom secret 설정 직전에만 secret store에 설정한다.
- 사용자 UUID는 migration, seed, repository 문서 또는 fixture에 하드코딩하지 않는다.

## 8. Fresh Baseline Post-Deployment read-only SQL

다음 SQL은 mutation이 없으며 실제 배포 승인 뒤 SQL Editor에서 실행한다. 이번 planning phase에는 원격에서 실행하지 않는다.

```sql
-- migration history: exact version inventory and count 22
select version, name
from supabase_migrations.schema_migrations
order by version;

select count(*) as migration_count
from supabase_migrations.schema_migrations;

-- public table and RLS inventory
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- public function security and configured search_path
select p.proname,
       p.prosecdef as security_definer,
       coalesce(array_to_string(p.proconfig, ','), '') as function_config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname, pg_get_function_identity_arguments(p.oid);

-- execute privileges for application roles
select p.proname,
       pg_get_function_identity_arguments(p.oid) as arguments,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname, arguments;

-- unique indexes, including the partial one-at-a-time execution guard
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and (indexdef ilike '%unique%' or indexname like 'wordpress_publication_attempts%')
order by tablename, indexname;

-- category reference data
select id
from public.categories
order by sort_order, id;

select count(*) as category_count from public.categories;

-- initial data must be empty; categories are intentionally excluded
select 'posts' as object_name, count(*) as row_count from public.posts
union all select 'tags', count(*) from public.tags
union all select 'news_topics', count(*) from public.news_topics
union all select 'news_updates', count(*) from public.news_updates
union all select 'import_jobs', count(*) from public.import_jobs
union all select 'restore_jobs', count(*) from public.restore_jobs
union all select 'wordpress_taxonomy_mappings', count(*) from public.wordpress_taxonomy_mappings
union all select 'wordpress_publication_attempts', count(*) from public.wordpress_publication_attempts
order by object_name;
```

특히 `transition_wordpress_publication_attempt_service`는 `SECURITY DEFINER`, 빈 `search_path`, anon/authenticated execute false, service_role execute true여야 한다. `wordpress_publication_attempts_content_execution_key`는 `executing`, `succeeded`, `uncertain` 상태에 대한 partial unique guard여야 한다.

## 9. failure stop과 recovery

Migration 하나라도 실패하거나 history, RLS, policy, RPC privilege, index, category 또는 초기 row-count가 다르면 즉시 중단한다. 자동 `migration repair`, history row 직접 insert, 일부 migration 임의 선택, manual schema creation, remote reset, seed 반복, Function/secret/WordPress 단계 진행은 금지한다.

DDL rollback을 자동화하지 않는다. 적용된 migration과 실제 catalog를 read-only로 보존·조사하고 새 versioned migration으로 forward-fix한다. Supabase Free plan에서는 PITR을 전제하지 않으므로 배포 직전 플랫폼 backup 가능 범위와 별도 export를 확인하고 복구 담당자·보존 기간을 기록한다.

WordPress 단계는 migration history 22, table/RLS/policy/RPC/index, category 8, initial user data 0, 첫 운영 사용자 login/owner-scope 검증이 모두 끝난 뒤에만 시작한다.
