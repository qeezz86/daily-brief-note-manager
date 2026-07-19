# WordPress REST API integration

## Phase 5A 범위와 구조

Phase 5A는 단일 WordPress 사이트와 단일 허용 Supabase 사용자에 대한 read-only 게시 준비 진단만 구현한다.

```text
Browser → authenticated Supabase Edge Function → fixed WordPress REST API GET endpoints
```

REST discovery, Application Password 인증, 현재 사용자 capability, post type/status, categories/tags 첫 페이지와 posts 읽기를 확인한다. 글·미디어·taxonomy 생성/수정/삭제, draft/publish, queue, webhook, Vault와 다중 사이트는 수행하지 않는다.

## Phase 5B taxonomy mapping과 publication dry run

Phase 5B는 별도 `wordpress-publication-preview` Edge Function에서 전체 category/tag catalog와 duplicate slug를 GET으로만 확인하고, 사용자 RLS 데이터에서 결정적 draft payload를 만든다. mapping 설정은 Supabase에 저장하지만 WordPress에는 쓰지 않는다. 상세 요청·응답·검증·fingerprint 계약은 `docs/WORDPRESS_PUBLICATION_PLAN.md`를 따른다.

Phase 5B-R1은 Chromium과 iPhone viewport에서 이 publication preview와 taxonomy UI를 deterministic interception으로 회귀 검증한다. 실제 WordPress·원격 Supabase·실제 credential은 사용하지 않으며 WordPress write는 0건이다. SEO 태그의 공백·구분자·대소문자 비교용 정규화는 원문이나 taxonomy payload를 바꾸지 않고 normalized duplicate blocker와 제한적인 near-duplicate warning만 추가한다. UI에는 자동 태그 수정이나 게시·draft 생성·전송·업로드 action이 없다.

기존 `wordpress-diagnostics`는 연결 진단용으로 유지하며 preview Function과 독립 배포·rollback할 수 있다. 두 Function 모두 같은 server-only credential 경계, caller allowlist, exact CORS와 SSRF/redirect 정책을 공유한다.

## Credential과 인증 경계

Edge Function 환경 secret은 `WORDPRESS_SITE_URL`, `WORDPRESS_USERNAME`, `WORDPRESS_APPLICATION_PASSWORD`, `WORDPRESS_ALLOWED_USER_ID`, `APP_ALLOWED_ORIGINS`다. `WORDPRESS_LOCAL_MODE`는 localhost 또는 Docker host mock에서만 사용하는 선택값이다.

브라우저 입력, React state, local/session storage, Supabase 일반 테이블, Backup/Restore JSON과 로그에는 credential을 넣지 않는다. `supabase/functions/.env.local`과 `.env.*.local`은 Git에서 제외되며 `.env.example`은 placeholder만 포함한다.

브라우저는 현재 세션으로 `supabase.functions.invoke('wordpress-diagnostics', { body: { action: 'diagnose' } })`를 호출한다. Function은 bearer token을 Supabase Auth `getUser`로 검증하고 user ID를 allowlist UUID와 exact match한다. 이메일은 authorization 기준으로 사용하지 않으며 설정 누락과 불일치는 fail closed한다.

## CORS, URL과 SSRF 정책

`OPTIONS`와 `POST`만 허용한다. CORS는 `APP_ALLOWED_ORIGINS`의 exact origin만 반영하며 wildcard는 금지한다. `authorization`, `apikey`, `content-type`과 `Vary: Origin`을 적용한다.

사이트 URL은 request body가 아니라 server secret에서만 가져온다. URL parser로 HTTPS/root path/userinfo/query/fragment를 검사한다. IP literal과 `.local`/`.internal` hostname은 거부한다. 예외는 명시적 local mode의 localhost와 정확한 `host.docker.internal`뿐이며, HTTP(S) root URL만 허용한다. `host.docker.internal.evil.example`, 다른 `.internal` host, userinfo, query, fragment와 production mode의 Docker host는 계속 거부한다. endpoint path와 query는 코드의 고정 union이므로 임의 URL/path/query나 open proxy 호출이 불가능하다.

모든 fetch는 `redirect: manual`이다. 모든 3xx를 canonical URL 설정 오류로 처리하고 `Location`을 응답이나 로그에 노출하지 않아 Authorization이 redirect target으로 전달되지 않는다. Production secret에는 공인 WordPress hostname만 사용한다.

## WordPress client와 read-only endpoint

클라이언트는 server memory에서만 Basic Authorization을 만들고 GET only, JSON Accept, 고정 User-Agent, 요청별 8초 timeout/AbortController, manual redirect, 1 MiB body 상한, JSON 검증, pagination header 파싱과 안전한 오류 매핑을 적용한다.

- `GET /wp-json/`
- `GET /wp-json/wp/v2/users/me?context=edit`
- `GET /wp-json/wp/v2/types?context=edit`
- `GET /wp-json/wp/v2/statuses?context=edit`
- `GET /wp-json/wp/v2/categories?context=edit&per_page=100&page=1&hide_empty=false&_fields=...`
- `GET /wp-json/wp/v2/tags?context=edit&per_page=100&page=1&hide_empty=false&_fields=...`
- `GET /wp-json/wp/v2/posts?context=edit&per_page=1&page=1&_fields=id,slug,status,modified_gmt`

discovery와 `users/me`를 순차 확인한 뒤 나머지를 병렬 확인한다. 응답에 post item/body는 포함하지 않는다. 사용자는 ID/display name/roles만, capability는 `edit_posts`, `publish_posts`, `upload_files`, `manage_categories`, `edit_others_posts`, `delete_posts`만 boolean으로 반환한다. email, username과 전체 capability map은 제외한다.

## 결과, 오류와 로그

성공 schema version은 1이다. 연결 상태는 `ready`, `partial`, `insufficient_permissions`다. 쓰기 준비 값은 실제 쓰기 성공이 아니라 `capability-confirmed`/`capability-missing`으로만 표현한다. categories/tags가 100개를 넘으면 first page, total/totalPages와 `truncated: true`를 반환한다.

오류는 `{ schemaVersion: 1, ok: false, error: { code, message, retryable } }`만 반환한다. upstream body, stack, path, JWT, Basic Auth, WordPress username/password를 포함하지 않는다. 현재 구현은 request/response body나 secret을 로그에 기록하지 않는다. 운영 로그를 추가할 때도 event, endpoint category, status, duration과 safe error code만 허용한다.

## 로컬 mock 테스트와 수동 실행

자동 테스트는 injected mock fetch를 사용하며 외부 WordPress에 연결하지 않는다.

```bash
npm run test:wordpress
```

## Phase 5A-R2 authenticated runtime smoke

R2 smoke는 Gateway JWT 검증, Function 내부 `getUser()`, 허용 user UUID 검사와 WordPress read-only client를 하나의 로컬 경로에서 검증한다. Docker Desktop과 `npm run db:start`로 시작한 로컬 Supabase가 전제이며, 실행 중이 아니면 자동 start하거나 key를 출력하지 않고 안전한 prerequisite 안내와 함께 종료한다.

```bash
npm run smoke:wordpress-runtime
```

script는 `supabase status -o json`의 machine-readable 결과를 process memory에서만 읽어 local API URL, publishable/anon key와 secret/service-role-equivalent key를 취득한다. key, JWT, refresh token, 임시 이메일·비밀번호와 user UUID는 결과에 출력하거나 repository 파일에 저장하지 않는다. 로컬 Admin API로 random 임시 사용자 두 명을 만들고 email-confirmed 상태로 설정하며, publishable key와 password sign-in으로 각 access token을 발급한다.

Node mock WordPress는 `0.0.0.0`의 동적 port에 bind하고 Edge Runtime에서는 `http://host.docker.internal:<port>`로 접근한다. production client와 같은 7개 endpoint만 제공하고 Basic Authorization을 exact match한다. audit에는 method, pathname, 허용 query key, authorization 존재·일치 boolean과 response status만 남긴다. raw header, decoded username/password와 응답 원문은 기록하지 않는다.

Function은 운영체제 임시 디렉터리의 random `.env` 파일과 함께 다음과 같이 시작한다. smoke는 `--no-verify-jwt`를 사용하지 않아 local Gateway JWT와 Function 내부 사용자 검증을 함께 통과해야 한다.

```text
supabase functions serve wordpress-diagnostics --env-file <temporary-file>
```

검증 항목은 허용 사용자 200/ready, 다른 인증 사용자 403 `CALLER_FORBIDDEN`, 비허용 origin 403 `ORIGIN_FORBIDDEN`, 무인증 401, 인증된 GET 405 `METHOD_NOT_ALLOWED`다. 성공 요청 뒤 WordPress audit는 discovery → current user 순서, 고정 path 7개, GET 7건, write·redirect·미허용 path 0건이어야 한다. 진단·오류 응답과 Function 출력은 known-secret assertion을 통과해야 하며 post item/content, WordPress user email과 전체 capability map도 노출되면 실패한다.

성공, 실패 또는 Ctrl+C 후 Function process tree와 mock server를 종료하고 두 Auth 사용자를 삭제하며 임시 env 디렉터리를 제거한다. Supabase CLI가 Function env를 local Edge Runtime container에 보관하므로, serve 전후에 정확한 이 프로젝트의 `supabase_edge_runtime_daily-brief-note-manager` container만 제거해 이전 또는 임시 allowlist/credential이 잔류하지 않게 한다. DB·Auth 등 다른 local container는 건드리지 않는다. 원격 Supabase, 실제 WordPress와 실제 credential은 사용하지 않는다. `WORDPRESS_LOCAL_MODE=true`는 이 로컬 mock 경로 전용이며 원격 배포 secret에는 설정하지 않는다.

Function을 수동으로 serve할 때만 ignored env 파일을 만든다.

```powershell
Copy-Item supabase/functions/.env.example supabase/functions/.env.local
npx supabase functions serve wordpress-diagnostics --env-file supabase/functions/.env.local
```

실제 사이트에서는 전용 Application Password를 생성해 password manager에만 저장하고 chat/Git/screenshot에 남기지 않는다. ignored env 또는 배포 secret에 URL, username, password, 허용 user UUID와 origin을 설정한 뒤 인증된 `/settings/wordpress`에서 사용자가 진단을 실행한다. 사용하지 않으면 WordPress 관리자에서 해당 Application Password를 폐기한다.

Phase 5A 구현 과정에서는 실제 WordPress 호출/쓰기, 원격 Supabase deploy와 remote secret 설정을 수행하지 않는다.
