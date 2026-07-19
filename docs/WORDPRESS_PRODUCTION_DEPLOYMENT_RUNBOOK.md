# WordPress Production Deployment Runbook

## 1. 목적과 범위

이 문서는 Phase 5C 코드를 원격 Supabase, 실제 프런트엔드와 실제 WordPress에 적용하는 Phase 5C-R2 실행 절차다. Phase 5C-R1에서는 이 문서를 작성하고 로컬 정적·자동 검증만 수행한다. 이 문서의 원격 명령과 WordPress 요청은 R1에서 실행하지 않는다.

목표는 다음 순서를 보장하는 것이다.

1. 원격 환경을 식별하고 backup과 pending migration 범위를 확인한다.
2. DB를 먼저 준비하고 세 Function을 read-only에서 write 순서로 배포한다.
3. 실제 WordPress write 없이 진단, taxonomy mapping과 publication preview를 끝낸다.
4. 별도 승인 뒤 검수된 콘텐츠 하나로 draft 하나만 만든다.
5. 불명확한 결과는 재시도하지 않고 수동으로 reconciliation한다.

Phase 5C의 유일한 WordPress write는 `POST /wp-json/wp/v2/posts`이며 서버가 고정한 status는 `draft`다. publish, schedule, update, delete, media와 taxonomy write는 허용하지 않는다.

## 2. 배포 대상 inventory

| 단위 | 파일·대상 | 분류 | 비고 |
|---|---|---|---|
| DB | `20260718120000_wordpress_taxonomy_mappings.sql` | remote DB deployment | mapping table, RLS, backup/restore RPC wrapper |
| DB | `20260719120000_wordpress_draft_creation.sql` | remote DB deployment | attempt table, constraints, indexes, initial transition RPC |
| DB | `20260719130000_harden_wordpress_draft_transition.sql` | remote DB deployment | browser transition 제거, service-only RPC |
| DB types | `src/shared/supabase/database.types.ts` | repository-only | 컴파일용 생성물이며 원격 배포 단위가 아님 |
| Function | `wordpress-diagnostics` | remote Function deployment | WordPress read-only 진단 |
| Function | `wordpress-publication-preview` | remote Function deployment | GET-only taxonomy/duplicate/preview |
| Function | `wordpress-draft-create` | remote Function deployment | 단일 draft POST와 attempt transition |
| Frontend | React/Vite PWA | frontend deployment | 제품 명세상 Vercel; 실제 project·domain은 R2에서 확인 |
| Frontend config | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | frontend deployment | 공개 값만 허용 |
| Mock·smoke | `scripts/wordpress-*-smoke.mjs`, mock server | local-only | 실제 WordPress에 배포하지 않음 |
| Test | `*.test.*`, `e2e/**`, fixtures, pgTAP | test-only | 원격 runtime 배포 대상 아님 |
| Report | `dist/**`, `artifacts/**`, Playwright report | local-only | 배포 산출물 검증용; DB/Function 배포 대상 아님 |
| Docs/config | 이 runbook, readiness JSON, README와 WordPress 문서 | documentation-only | 운영 판단 source of truth |

## 3. 전제 조건

- 승인할 commit이 Phase 5C-R1 검증을 모두 통과하고 worktree가 clean하다.
- 실행자는 `<PROJECT_REF>`, `<PRODUCTION_APP_ORIGIN>`, `<WORDPRESS_SITE_URL>`, `<WORDPRESS_ALLOWED_USER_ID>`를 독립적으로 확인했다.
- 원격 Supabase project와 실제 frontend deployment의 관계를 Dashboard에서 확인했다.
- WordPress와 Supabase backup 상태를 확인했다.
- 전용 WordPress 사용자와 전용 Application Password가 준비되었다.
- 실제 secret은 password manager와 승인된 secret store 밖에 기록하지 않는다.
- Phase 5C-R2 원격 DB 변경 승인과 단일 draft 외부 변경 승인은 서로 분리한다.
- 예상하지 않은 pending migration, RLS/RPC 불일치 또는 credential 노출이 있으면 중단한다.

현재 repository CI는 production build와 bundle budget만 실행한다. lint, Vitest, E2E, DB reset/lint/pgTAP, Deno check와 smoke는 CI gate가 아니므로 R2 실행자가 로컬 결과를 직접 확인해야 한다. 이 증거가 없으면 배포하지 않는다.

## 4. 필요한 도구

R1 검수 기준 버전은 다음과 같다. R2에서 다시 기록하고, CLI가 달라졌으면 help를 재확인한다.

| 도구 | R1 확인 버전 |
|---|---|
| Node.js | `v24.14.0` |
| npm | `11.9.0` |
| Deno | `2.9.3` |
| Supabase CLI | `2.109.1` |
| Docker | `29.6.1` |

```powershell
node --version
npm --version
deno --version
npx supabase --version
docker --version
```

CLI 2.109.1에서 확인한 계약:

- `link`: `--project-ref`, `--password`, `--skip-pooler`
- `db push`: `--linked`, `--dry-run`, `--include-all`, `--include-roles`, `--include-seed`, `--password`
- `migration list`: `--linked`, `--local`, `--db-url`, `--password`
- `functions deploy`: function 이름, `--project-ref`, `--use-api`, `--import-map`, `--prune`, `--jobs`; `--no-verify-jwt`는 존재하지만 금지
- `secrets set`: `--project-ref`, `--env-file`
- `functions list`: `--project-ref`

## 5. placeholder 목록

문서, shell history, issue와 chat에 실제 값을 붙이지 않는다.

| Placeholder | 의미 |
|---|---|
| `<PROJECT_REF>` | 사용자가 Dashboard에서 확인한 Supabase project ref |
| `<PRODUCTION_DEPLOYMENT_COMMIT>` | 검증하고 배포할 exact Git commit |
| `<PRODUCTION_APP_ORIGIN>` | trailing slash가 없는 실제 HTTPS origin |
| `<WORDPRESS_SITE_URL>` | query/fragment/subpath가 없는 canonical HTTPS root |
| `<WORDPRESS_ALLOWED_USER_ID>` | 허용할 Supabase Auth 사용자 UUID |
| `<PATH_TO_TEMP_SECRET_ENV>` | Git 밖의 권한 제한 임시 secret 파일 |

Access token, DB password, WordPress username/Application Password, elevated Supabase key는 placeholder로도 명령 인자에 직접 쓰지 않는다. password prompt, password manager와 secret file을 사용한다.

## 6. Supabase project 연결 전 확인

먼저 read-only Dashboard 확인으로 project ref, 조직, 환경, DB major version과 frontend URL을 교차 확인한다. 실제 project ref를 추측하지 않는다.

```powershell
git status
git rev-parse HEAD
git show -s --oneline <PRODUCTION_DEPLOYMENT_COMMIT>
npx supabase link --help
npx supabase migration list --help
npx supabase db push --help
```

명시적 R2 연결 승인을 받은 뒤에만 다음을 실행한다. DB password는 command line에 넣지 않고 prompt로 입력한다.

```powershell
npx supabase link --project-ref <PROJECT_REF>
npx supabase migration list --linked
npx supabase functions list --project-ref <PROJECT_REF>
```

출력이 의도한 project와 다르거나 연결 상태가 불명확하면 즉시 중단한다.

## 7. migration preflight

### 7.1 로컬·원격 차이

```powershell
Get-ChildItem supabase/migrations -File | Sort-Object Name | Select-Object Name
npx supabase migration list --linked
npx supabase db push --linked --dry-run
```

Dry run의 pending 목록이 승인된 Phase 5B/5C 세 파일과 정확히 일치해야 한다. 더 오래된 migration, 알 수 없는 remote-only version, `--include-all`이 필요한 상태 또는 history mismatch가 보이면 push하지 않는다.

### 7.2 migration 안전 검수 결과

- 세 파일은 timestamp 순 forward migration이다.
- SQL에 `DROP TABLE`, `TRUNCATE`, content delete, 기존 `posts` 또는 mapping rewrite가 없다.
- hardening migration은 data object가 아닌 기존 transition Function을 revoke한 뒤 `DROP FUNCTION`하고 service-only Function으로 교체한다. 이는 의도된 권한 forward-fix이며 rollback 명령이 아니다.
- migration SQL에는 명시적 cross-file transaction이 없다. 세 파일을 하나의 원자적 단위라고 가정하지 않는다. 어떤 파일에서든 실패하면 Function 배포를 중단하고 migration history를 확인한다.
- taxonomy migration은 mapping table과 backup/restore 확장을 만든다.
- draft creation migration은 attempt table, owner/content FK, unique와 partial unique execution guard, RLS와 최초 transition RPC를 만든다.
- hardening migration은 최초 RPC에 의존하므로 순서가 바뀌면 `DROP FUNCTION` 단계에서 실패한다. 최종 상태에서 authenticated는 transition RPC를 실행할 수 없고 service role만 실행할 수 있다.
- attempt는 외부 side-effect audit이므로 Backup/Restore에서 제외한다.
- credential, title, HTML body, excerpt, raw WordPress response를 attempt에 저장하지 않는다.

## 8. DB backup 확인

DB push 전 Supabase Dashboard에서 다음을 기록한다.

- project ref와 환경
- platform backup/PITR 활성 여부와 가장 최근 성공 시각
- 복구 담당자와 승인자
- WordPress 호스팅 backup 또는 snapshot의 가장 최근 성공 시각
- backup이 실제 복구 가능한 보존 기간 안에 있는지

Backup이 없거나 상태가 불명확하면 중단한다. Runbook에 자동 destructive rollback SQL을 두지 않는다. migration 역적용은 영향 분석과 별도 승인을 거친 forward-fix 또는 수동 복구 작업이다.

## 9. DB migration 적용 순서

최종 DB 변경 승인을 받은 뒤에만 실행한다.

```powershell
npx supabase db push --linked --dry-run
npx supabase db push --linked
npx supabase migration list --linked
```

적용 순서는 반드시 다음과 같다.

1. `20260718120000_wordpress_taxonomy_mappings.sql`
2. `20260719120000_wordpress_draft_creation.sql`
3. `20260719130000_harden_wordpress_draft_transition.sql`

Dashboard SQL Editor에서 read-only catalog query로 다음을 확인한다. 실제 row 내용이나 secret을 출력하지 않는다.

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('wordpress_taxonomy_mappings', 'wordpress_publication_attempts')
order by tablename;

select routine_name, security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'transition_wordpress_publication_attempt_service';

select policyname, tablename, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in ('wordpress_taxonomy_mappings', 'wordpress_publication_attempts')
order by tablename, policyname;
```

Expected:

- 두 table 모두 RLS enabled
- mapping은 authenticated owner-only select/insert/update/delete
- attempt는 owner-only select와 received-only insert; 직접 update/delete grant 없음
- `transition_wordpress_publication_attempt_service`는 `SECURITY DEFINER`, 빈 `search_path`, service-role check와 owner UUID 제한
- PUBLIC, anon, authenticated에 transition execute 없음; service_role만 execute
- idempotency unique와 `executing|succeeded|uncertain` partial unique index 존재

기존 앱의 로그인과 content read-only 조회를 확인한다. 실패하면 Function을 배포하지 않는다.

## 10. secret 설정 순서

### 10.1 inventory

| 이름 | 사용 Function | 민감도 | Frontend 노출 | 원격 필수 | Local-only | 값·검증 | rotation |
|---|---|---:|---|---|---|---|---|
| `SUPABASE_URL` | 3개 | 공개 config | 가능 | platform 제공 | 아니요 | 현재 project HTTPS URL | project 계약 변경 시 검증 |
| `SUPABASE_ANON_KEY` | 3개 | 공개 legacy key | 가능 | platform 제공 | 아니요 | RLS client key | publishable 전환 계획과 함께 rotation |
| `SUPABASE_SERVICE_ROLE_KEY` | draft-create | 매우 민감 | 절대 금지 | platform 제공 legacy | 아니요 | elevated server key | 노출 시 즉시 rotate; Function 재검증 |
| `WORDPRESS_SITE_URL` | 3개 | server config | 금지 | 예 | 아니요 | canonical HTTPS root; subpath/query/fragment/trailing path 금지 | site 변경 시 교체·진단 |
| `WORDPRESS_USERNAME` | 3개 | confidential | 금지 | 예 | 아니요 | 전용 사용자 login | 사용자 교체 시 rotation |
| `WORDPRESS_APPLICATION_PASSWORD` | 3개 | 매우 민감 | 절대 금지 | 예 | 아니요 | 전용 Application Password | 새 password 설정→진단→기존 폐기 |
| `WORDPRESS_ALLOWED_USER_ID` | 3개 | 비밀 아님, server config | 불필요 | 예 | 아니요 | canonical Supabase Auth UUID | 담당자 교체 시 갱신 |
| `APP_ALLOWED_ORIGINS` | 3개 | 비밀 아님, server config | 불필요 | 예 | 아니요 | comma-separated exact HTTPS origins; wildcard/localhost 금지 | origin 변경 시 갱신 |
| `WORDPRESS_LOCAL_MODE` | 3개 parser | 위험한 local flag | 금지 | **설정 금지** | 예 | local mock에서만 `true` | production에서 항상 삭제 |

Hosted Edge Functions는 `SUPABASE_URL`, legacy `SUPABASE_ANON_KEY`와 `SUPABASE_SERVICE_ROLE_KEY`를 기본 환경으로 제공한다. 현재 코드는 legacy key 이름을 사용한다. 이 키들은 현재 동작하지만 Supabase가 publishable/secret key로 전환 중이므로 legacy key가 remote에서 활성인지 R2에서 확인하고 2026년 말 deprecation 전에 별도 migration을 계획한다. 현재 RPC의 `auth.role() = service_role` 계약을 새 key로 실제 검증하기 전에는 임의 교체하지 않는다.

### 10.2 설정

Git 밖에 `<PATH_TO_TEMP_SECRET_ENV>`를 만들고 OS 권한을 현재 사용자로 제한한다. `SUPABASE_*` 기본 환경은 이 파일에 복제하지 않는다. 다음 다섯 값만 넣는다.

```dotenv
WORDPRESS_SITE_URL=<WORDPRESS_SITE_URL>
WORDPRESS_USERNAME=<SECRET_FROM_PASSWORD_MANAGER>
WORDPRESS_APPLICATION_PASSWORD=<SECRET_FROM_PASSWORD_MANAGER>
WORDPRESS_ALLOWED_USER_ID=<WORDPRESS_ALLOWED_USER_ID>
APP_ALLOWED_ORIGINS=<PRODUCTION_APP_ORIGIN>
```

승인 뒤 실행한다.

```powershell
npx supabase secrets set --project-ref <PROJECT_REF> --env-file <PATH_TO_TEMP_SECRET_ENV>
```

Dashboard에서 이름과 존재만 확인하고 값을 출력하지 않는다. `WORDPRESS_LOCAL_MODE`가 있으면 삭제 승인과 삭제가 끝날 때까지 배포를 중단한다. 임시 파일은 사용 후 recoverable하지 않은 방식으로 안전하게 제거하고 terminal history에 값이 남지 않았는지 확인한다.

## 11. Function 배포 순서

모든 Function은 `supabase/config.toml`에서 `verify_jwt = true`다. `--no-verify-jwt`를 절대 사용하지 않는다. Function 내부 `getUser()`와 allowed UUID 검사도 유지한다.

```powershell
npx supabase functions deploy wordpress-diagnostics --project-ref <PROJECT_REF>
npx supabase functions list --project-ref <PROJECT_REF>

npx supabase functions deploy wordpress-publication-preview --project-ref <PROJECT_REF>
npx supabase functions list --project-ref <PROJECT_REF>

npx supabase functions deploy wordpress-draft-create --project-ref <PROJECT_REF>
npx supabase functions list --project-ref <PROJECT_REF>
```

순서의 이유:

1. DB table/RPC가 Function보다 먼저 있어야 한다.
2. diagnostics로 인증·CORS·WordPress 연결을 먼저 검증한다.
3. preview로 GET-only payload를 검증한다.
4. 외부 write 가능한 draft-create를 마지막에 배포한다.

각 단계에서 deployment version/commit과 timestamp를 기록한다. 한 Function이라도 실패하면 뒤 Function을 배포하지 않는다.

## 12. frontend 배포 순서

제품 명세는 Vercel을 사용하지만 실제 project·domain 연결은 R2에서 확인한다. frontend에는 다음 공개 값만 설정한다.

```dotenv
VITE_SUPABASE_URL=<PROJECT_SUPABASE_URL>
VITE_SUPABASE_PUBLISHABLE_KEY=<PROJECT_PUBLISHABLE_KEY>
```

WordPress URL, username, Application Password, allowed UUID, origin list, Supabase service-role/secret key를 Vercel 환경변수에 넣지 않는다.

현재 feature flag는 없다. Backend-first 순서로 DB → secrets → diagnostics → preview → draft-create가 모두 확인된 다음 frontend를 배포한다. 이 순서면 새 UI가 준비되지 않은 backend를 호출하는 시간을 피할 수 있다. atomic deployment가 아니므로 단계별 결과를 기록하고 문제가 있으면 frontend를 이전 배포로 rollback한다. Function rollback은 Dashboard의 이전 version 또는 승인된 commit 재배포를 사용한다. migration 역적용은 자동 rollback에 포함하지 않는다.

Production build 전후 확인:

```powershell
npm run check:wordpress-production-readiness
npm run build
npm run bundle:check
rg -n "WORDPRESS_APPLICATION_PASSWORD|SUPABASE_SERVICE_ROLE_KEY|sb_secret_|VITE_WORDPRESS" dist
```

마지막 `rg`는 결과 0건이 정상이다. 실제 WordPress username도 별도 안전한 local variable로 검색하되 출력·문서화하지 않는다. source map과 error-monitoring 설정이 request headers/body/environment를 수집하지 않는지 배포 플랫폼에서 확인한다.

## 13. read-only diagnostics

이 절차가 끝날 때까지 WordPress write는 0건이어야 한다.

1. `/wp-json/` discovery와 `wp/v2` namespace를 확인한다.
2. Application Password authentication endpoint 광고를 확인한다.
3. authenticated `users/me`가 전용 사용자와 일치하는지 확인한다.
4. `edit_posts`가 true인지 확인한다.
5. `post` type과 `draft` status를 확인한다.
6. categories와 tags 전체 catalog를 GET-only로 확인한다.
7. posts read와 duplicate slug query를 확인한다.

앱의 `/settings/wordpress`에서 diagnostics를 한 번 실행한다. 기대 상태는 `ready`; 비허용 Supabase user, 비허용 origin과 무인증 요청은 차단되어야 한다. `OPTIONS`와 authenticated `POST` response에서 exact `Access-Control-Allow-Origin`과 `Vary: Origin`을 확인한다. wildcard, localhost, 예상하지 않은 Vercel preview origin은 허용하지 않는다.

Gateway가 만든 header와 Function이 만든 CORS header를 구분해 기록한다. 비허용 origin은 403이어야 한다. Vercel preview가 필요하면 wildcard 대신 별도 Supabase project 또는 명시적인 고정 HTTPS preview origin을 검토한다.

## 14. taxonomy mapping

1. 전체 category catalog를 새로고침한다.
2. 전체 tag catalog를 새로고침한다.
3. 로컬 category를 기존 WordPress category 하나에 매핑한다.
4. 콘텐츠의 5~8개 tag를 각각 기존 WordPress tag에 매핑한다.
5. 자동 term 생성이 없음을 확인한다.
6. mapping의 term ID/slug/name과 `verified_at`을 재검증한다.
7. homepage/search/listing URL이 source로 잘못 사용되지 않았는지 별도 콘텐츠 검수한다.

Mapping 저장은 Supabase DB write지만 WordPress write가 아니다. taxonomy missing, ambiguous, stale 또는 catalog 불일치가 하나라도 있으면 중단한다.

## 15. publication preview

선정한 콘텐츠에서 `WordPress Dry Run`을 실행한다.

- duplicate slug 0건
- blocker 0건
- 모든 warning 수동 확인
- payload field가 `title`, `content`, `status`, `slug`, `excerpt`, `categories`, `tags`뿐
- status `draft`
- HTML 1.5 MiB 이하
- canonical payload 2 MiB 이하
- category mapping 1개 이상
- tag mapping 5~8개
- `source.updated_at` 기록
- `sha256:<64 lowercase hex>` fingerprint 기록
- `writePerformed=false`

Preview까지 실제 WordPress write는 0건이어야 한다.

## 16. 단일 draft 승인 gate

실사이트 smoke 콘텐츠는 다음 조건을 모두 만족해야 한다.

- 테스트 목적의 비공개 콘텐츠 또는 실제 발행 예정이지만 중요도가 낮은 검증 콘텐츠
- 동일 slug가 아직 없음
- title, slug, HTML, excerpt 최종 검수 완료
- category와 5~8 tag mapping 완료
- normalized duplicate blocker 없음
- plan ready, warning 수동 확인 완료
- HTML/payload 크기 제한 충족
- source `updated_at`과 fingerprint 고정
- media/featured image가 필요하지 않음
- 즉시 publish할 필요가 없음
- 제목이나 slug에 임의의 `test` 표식을 넣어 콘텐츠 규칙을 훼손하지 않음

실행자가 직접 확인한다.

- migration 세 개 적용 완료
- Function 세 개 배포와 commit/version 확인
- custom secret 다섯 개 설정, `WORDPRESS_LOCAL_MODE` 없음
- diagnostics ready, owner UUID 일치
- taxonomy mapping ready, duplicate slug 0
- plan ready, source timestamp/fingerprint 일치
- 기존 succeeded/uncertain/executing attempt 없음
- Supabase/WordPress backup 상태 확인
- 자동 retry 비활성
- 콘텐츠 하나, 요청 하나
- UI checkbox와 confirmation dialog 최종 승인

> **이 단계부터 WordPress에 외부 side effect가 발생한다.**

## 17. draft 1건 실행 절차

1. 승인자와 실행자가 같은 content ID, slug, source timestamp와 fingerprint를 확인한다.
2. 브라우저 탭 하나만 사용한다.
3. `WordPress 초안 생성 준비`를 선택한다.
4. dialog의 site, slug, taxonomy count, timestamp와 fingerprint를 다시 비교한다.
5. checkbox를 직접 선택한다.
6. `초안 1건 생성`을 한 번만 선택한다.
7. loading 중 새로고침, 뒤로 가기, 재클릭 또는 새 탭 실행을 하지 않는다.
8. response와 attempt ID를 안전한 운영 기록에 남긴다. title/body/credential은 로그에 복사하지 않는다.

## 18. 성공 확인

Application response:

- `created=true`
- `idempotentReplay=false`
- positive attempt ID와 WordPress post ID
- `status=draft`
- expected slug
- credential 없는 HTTPS WordPress link

WordPress 관리자:

- 새 post 정확히 1건
- Draft, publish되지 않음
- title, slug, HTML body, category와 tags 일치
- media/featured image 없음

Supabase DB:

- attempt 정확히 1건, `succeeded`
- expected/actual fingerprint 일치
- WordPress ID/status/slug/link 일치
- owner/content/site origin 일치
- credential, title, HTML, excerpt와 raw response 없음

예상과 다르면 Phase 5D로 진행하지 않는다.

## 19. idempotency 확인

실사이트에서 replay request를 자동 반복하지 않는다. 먼저 UI history와 DB record로 다음을 확인한다.

- 같은 key의 succeeded record가 replay 결과 source가 됨
- 새 생성 action이 같은 content에서 차단됨
- WordPress draft 수가 증가하지 않음
- `executing|succeeded|uncertain` partial unique guard가 유지됨

정말 필요한 경우에만 별도 승인 아래 같은 browser operation의 동일 key를 한 번 재사용한다. 새 idempotency key를 만들지 않는다. 기대 응답은 `created=false`, `idempotentReplay=true`, WordPress POST 0건이다.

## 20. uncertain 대응

다음을 uncertain으로 취급한다.

- request 전송 뒤 timeout/connection reset
- POST 뒤 invalid, oversized, non-JSON 또는 검증 불가 response
- WordPress 성공 뒤 audit 저장 실패
- post ID/status/slug 검증 실패
- Function 종료 시점 불명확

대응:

1. 같은 요청을 다시 실행하지 않는다.
2. 새 idempotency key를 만들지 않는다.
3. 자동 retry를 켜지 않는다.
4. WordPress 관리자에서 exact slug를 검색한다.
5. draft, pending, publish 등 모든 가시 status를 확인한다.
6. post가 있으면 post ID와 status를 기록한다.
7. Supabase attempt status와 fingerprint를 확인한다.
8. DB row를 자동 수정하지 않는다.
9. 삭제·재생성 대신 별도 수동 reconciliation 계획을 만든다.
10. 결과가 확정될 때까지 Phase 5D를 중단한다.

자동 보상 삭제는 금지한다. `executing`이 남은 경우도 결과 불명확으로 취급한다.

## 21. rollback·중단

즉시 중단 조건:

- 예상하지 않은 pending migration 또는 migration history mismatch
- RLS/RPC execute/search_path 불일치
- elevated key frontend 노출
- CORS wildcard, localhost 또는 불명확한 preview origin
- production `WORDPRESS_LOCAL_MODE`
- diagnostics auth 실패 또는 `edit_posts` 부족
- taxonomy mapping incomplete
- duplicate slug
- source/fingerprint mismatch
- 기존 succeeded/uncertain/executing attempt
- draft 외 status
- WordPress post 2건 이상
- credential/JWT/Authorization/request body 로그 노출
- audit 저장 실패 또는 uncertain 결과

중단 뒤 자동 retry와 반복 Function 호출을 하지 않는다. 필요하면 frontend를 이전 deployment로 rollback하고 draft-create를 이전 Function version으로 되돌린다. DB migration 역적용은 별도 승인 대상이다. WordPress post를 자동 삭제하지 않는다. correlation에는 attempt ID, content ID, safe error code, timestamp, expected fingerprint와 확인된 WordPress ID만 남기고 credential/HTML을 남기지 않는다.

## 22. credential rotation

1. 별도 새 Application Password를 목적이 드러나는 이름으로 생성한다.
2. password manager에 생성 직후 저장한다. 화면을 캡처하거나 chat/Git에 복사하지 않는다.
3. Supabase Function secret의 password만 새 값으로 교체한다.
4. diagnostics read-only를 실행한다.
5. preview read-only를 실행하고 mapping/fingerprint를 확인한다.
6. 새 credential의 WordPress last-used time/IP를 확인한다.
7. 기존 Application Password를 폐기한다.
8. rotation 시각과 수행자만 안전한 운영 기록에 남긴다.

노출이 의심되면 새 값 검증을 기다리지 말고 영향받은 Application Password를 즉시 폐기하고 draft-create 사용을 중단한다. Supabase elevated key가 노출되면 Supabase rotation 절차를 따르고 frontend bundle/log를 검사한다.

## 23. Application Password 폐기

실사이트 전용 사용자 정책:

- 개인 administrator 계정 대신 별도 사용자 사용
- 주 로그인 password를 REST Basic Auth에 사용하지 않음
- integration별 전용 Application Password 하나 사용
- 기본 WordPress 기준 최소 capability는 `edit_posts`
- draft에는 `publish_posts` 불필요
- media write가 없으므로 `upload_files` 불필요
- taxonomy catalog는 `context=view`, 기존 term 할당은 built-in category/tag의 `assign_terms=edit_posts`이므로 `manage_categories` 불필요
- plugin/custom role/filter가 권한을 바꾸면 live preflight 결과가 우선하며 부족하면 smoke 중단
- administrator를 기본 권장하지 않음

사용 종료, 담당자 변경, 노출 의심 또는 integration 폐기 시 WordPress 사용자 profile의 Application Password 목록에서 해당 이름, last-used time과 IP를 확인한 뒤 개별 폐기한다. 사용자 계정 자체를 삭제하기 전 관련 draft ownership과 감사 이력을 검토한다.

## 24. Phase 5D 진입 조건

다음이 모두 충족되어야 `READY_FOR_PHASE_5D`로 기록한다.

- 승인 commit과 배포 version 일치
- remote migrations 세 개 적용, table/RLS/RPC/index/constraint 검증 완료
- Function 세 개 JWT 이중 인증과 exact CORS 검증 완료
- frontend server-only secret 0건
- read-only preflight 16단계 완료, WordPress write 0건
- taxonomy mapping과 preview blocker 0건
- 승인된 draft 정확히 1건 성공
- WordPress와 attempt audit 일치
- idempotency를 UI/DB 우선으로 확인, 추가 POST 0건
- uncertain, credential leak, duplicate 또는 unresolved blocker 0건
- Application Password 운영·rotation·폐기 담당자 지정
- 실제 실행 결과를 사용자와 운영 책임자가 승인

Manual prerequisite가 남아 있거나 결과가 uncertain이면 Phase 5D에 진입하지 않는다.
