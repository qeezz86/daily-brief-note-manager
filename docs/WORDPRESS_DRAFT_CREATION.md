# WordPress Draft Creation

## Scope

Phase 5C는 사용자가 검토한 publication plan으로 신규 WordPress draft 1건만 생성한다. 실제 publish, scheduling, 기존 글 update/delete, media, featured image, taxonomy 생성/수정, post meta, background queue, webhook과 자동 retry는 범위 밖이다. 실제 WordPress나 원격 Supabase에는 이 작업 과정에서 접근·배포하지 않는다.

## Request and trust boundary

브라우저 요청은 `action=create-draft`, content UUID, preview의 exact source `updated_at`, `sha256:<64 lowercase hex>` fingerprint, operation 동안 고정된 UUID idempotency key와 `{ confirmed: true, scope: "single-wordpress-draft" }`만 허용한다. unknown field, payload/title/content/status/taxonomy ID/endpoint/force/retry override와 4 KiB 초과 body를 거부한다.

Gateway JWT와 Function 내부 `getUser()`를 모두 사용하고 `WORDPRESS_ALLOWED_USER_ID` UUID를 exact match한다. content, mapping, attempt 조회와 received insert는 caller JWT와 publishable/anon key를 사용하므로 RLS가 적용된다. 상태 전환만 브라우저 직접 조작을 막기 위해 Edge Function 내부의 service-role client가 단일 `transition_wordpress_publication_attempt_service` RPC에 사용된다. RPC는 `auth.role()=service_role`을 재확인하고 Function이 검증한 caller UUID로 owner row를 제한한다. service key와 owner ID는 브라우저 요청/응답에 포함하지 않는다. Origin은 `APP_ALLOWED_ORIGINS` exact allowlist이고 wildcard와 cross-origin redirect는 허용하지 않는다.

## Server rebuild and guards

Function은 DB source of truth에서 title, HTML, excerpt, slug, category/tag IDs와 `status=draft` payload를 다시 만든다. source timestamp는 preview가 받은 DB 문자열과 exact 비교해 locale 변환이나 client-side rounding을 피한다. canonical JSON fingerprint는 title/content/status/slug/excerpt와 정렬된 taxonomy ID만 포함하며 constant-work string comparison으로 expected 값과 확인한다.

POST 전에는 edit-post capability, 전체 taxonomy catalog/mapping, HTML/slug/SEO/tag validation, normalized tag duplicate, payload size와 전체 공개 상태의 duplicate slug를 다시 확인한다. mismatch 또는 blocker는 WordPress POST 0건으로 종료한다.

## Idempotency, lock and audit

`wordpress_publication_attempts`가 request/audit/local draft reference의 source of truth다. owner/site/idempotency key unique constraint와 content/site/operation의 `executing|succeeded|uncertain` partial unique index를 사용한다. transition RPC는 owner 인증, expected status compare-and-set과 다음 전이만 허용한다.

```text
received → validating → blocked
                     └→ executing → succeeded
                                  ├→ failed_safe
                                  └→ uncertain
```

같은 key의 succeeded는 저장 결과를 replay하고 POST하지 않는다. executing은 in-progress conflict, blocked/failed-safe는 같은 key 재실행 금지, uncertain은 manual reconciliation required다. 다른 key라도 같은 content에 succeeded/uncertain/executing guard가 있으면 POST하지 않는다. terminal row는 수정하지 않는다.

Audit에는 owner/content/site, operation/key, expected/actual fingerprint, safe 상태·오류, 허용된 WordPress ID/status/slug/link와 시각만 저장한다. title, HTML, excerpt, raw request/response, JWT, username, Application Password, Authorization과 stack trace는 저장하지 않는다.

## WordPress write and response

허용 method/path는 `POST /wp-json/wp/v2/posts` 하나다. body field는 `title`, `content`, `status`, `slug`, `excerpt`, `categories`, `tags`뿐이며 status는 caller가 바꿀 수 없는 `draft` literal이다. Basic Authorization은 server memory에서만 만들고 JSON content type/accept, timeout, AbortController, manual redirect와 response byte limit를 적용한다.

성공 응답은 positive `id`, exact `status=draft`, expected slug와 credential 없는 HTTPS link만 추출한다. content/excerpt/meta/author/raw response는 반환하지 않는다. 명확한 400/401/403/404/409 JSON rejection은 `failed_safe`; request 전송 뒤 timeout, connection failure, 429/5xx, redirect, invalid/oversized/non-JSON response, missing ID, non-draft 또는 wrong slug는 `uncertain`이다. uncertain은 자동 재시도하거나 보상 삭제하지 않고 WordPress 관리자에서 slug를 확인한다.

## UI and history

Ready, non-stale plan에서만 `WordPress 초안 생성 준비`를 활성화한다. dialog는 대상/site/slug/taxonomy count/source timestamp/fingerprint와 외부 변경을 보여 주고 checkbox 뒤 `초안 1건 생성`을 허용한다. TanStack mutation retry는 `false`이며 dialog를 연 operation의 UUID를 유지한다. succeeded/uncertain/executing history가 있으면 새 생성 버튼을 차단한다.

성공 UI는 post ID, draft status, slug, attempt ID, fingerprint와 allowlisted HTTPS 확인 링크를 표시한다. uncertain UI는 “다시 생성하지 마세요”와 관리자 수동 확인을 표시하며 retry/resolve/update/delete button은 제공하지 않는다. history에는 safe 상태, operation, 시각, WordPress ID/slug와 error code만 표시한다.

## Backup, restore and local verification

Attempts/idempotency는 외부 side effect 이력이므로 Backup/Restore에서 제외한다. Restore는 WordPress write를 호출하지 않는다.

`npm run smoke:wordpress-draft`는 실행 중인 local Supabase, 임시 Auth 사용자/RLS fixtures, local Edge Runtime과 mock WordPress를 연결한다. 성공 POST, replay, same-content, stale/fingerprint, caller/origin과 uncertain replay guard, draft-only body, 금지 method 0건과 secret leakage를 검사하고 fixture를 정리한다. 실제 WordPress와 원격 Supabase는 사용하지 않는다.
