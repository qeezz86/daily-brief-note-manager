# WordPress REST API integration

## Phase 5A 범위와 구조

Phase 5A는 단일 WordPress 사이트와 단일 허용 Supabase 사용자에 대한 read-only 게시 준비 진단만 구현한다.

```text
Browser → authenticated Supabase Edge Function → fixed WordPress REST API GET endpoints
```

REST discovery, Application Password 인증, 현재 사용자 capability, post type/status, categories/tags 첫 페이지와 posts 읽기를 확인한다. 글·미디어·taxonomy 생성/수정/삭제, draft/publish, DB 저장, queue, webhook, Vault와 다중 사이트는 후속 Phase 5B 범위다.

## Credential과 인증 경계

Edge Function 환경 secret은 `WORDPRESS_SITE_URL`, `WORDPRESS_USERNAME`, `WORDPRESS_APPLICATION_PASSWORD`, `WORDPRESS_ALLOWED_USER_ID`, `APP_ALLOWED_ORIGINS`다. `WORDPRESS_LOCAL_MODE`는 localhost mock에서만 사용하는 선택값이다.

브라우저 입력, React state, local/session storage, Supabase 일반 테이블, Backup/Restore JSON과 로그에는 credential을 넣지 않는다. `supabase/functions/.env.local`과 `.env.*.local`은 Git에서 제외되며 `.env.example`은 placeholder만 포함한다.

브라우저는 현재 세션으로 `supabase.functions.invoke('wordpress-diagnostics', { body: { action: 'diagnose' } })`를 호출한다. Function은 bearer token을 Supabase Auth `getUser`로 검증하고 user ID를 allowlist UUID와 exact match한다. 이메일은 authorization 기준으로 사용하지 않으며 설정 누락과 불일치는 fail closed한다.

## CORS, URL과 SSRF 정책

`OPTIONS`와 `POST`만 허용한다. CORS는 `APP_ALLOWED_ORIGINS`의 exact origin만 반영하며 wildcard는 금지한다. `authorization`, `apikey`, `content-type`과 `Vary: Origin`을 적용한다.

사이트 URL은 request body가 아니라 server secret에서만 가져온다. URL parser로 HTTPS/root path/userinfo/query/fragment를 검사한다. IP literal과 `.local`/`.internal` hostname은 거부하고 localhost는 명시적 local mode에서만 허용한다. endpoint path와 query는 코드의 고정 union이므로 임의 URL/path/query나 open proxy 호출이 불가능하다.

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

Function을 수동으로 serve할 때만 ignored env 파일을 만든다.

```powershell
Copy-Item supabase/functions/.env.example supabase/functions/.env.local
npx supabase functions serve wordpress-diagnostics --env-file supabase/functions/.env.local
```

실제 사이트에서는 전용 Application Password를 생성해 password manager에만 저장하고 chat/Git/screenshot에 남기지 않는다. ignored env 또는 배포 secret에 URL, username, password, 허용 user UUID와 origin을 설정한 뒤 인증된 `/settings/wordpress`에서 사용자가 진단을 실행한다. 사용하지 않으면 WordPress 관리자에서 해당 Application Password를 폐기한다.

Phase 5A 구현 과정에서는 실제 WordPress 호출/쓰기, 원격 Supabase deploy와 remote secret 설정을 수행하지 않는다.
