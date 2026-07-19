# WordPress Publication Plan Dry Run

## 범위

Phase 5B는 저장된 콘텐츠를 WordPress draft payload로 변환하고 검증만 한다. 실제 WordPress 글·taxonomy·미디어 생성, 수정, 삭제와 Supabase 원격 배포는 수행하지 않는다. 결과의 `mode`는 항상 `dry-run`, `writePerformed`는 항상 `false`, payload `status`는 항상 `draft`다.

브라우저는 인증 세션과 다음 고정 요청만 보낸다.

```json
{ "action": "get-taxonomy-catalog" }
{ "action": "prepare-publication", "contentId": "<uuid>" }
```

사이트 URL, WordPress credential, taxonomy ID, payload, owner ID는 브라우저 요청으로 받지 않는다. `wordpress-publication-preview` Edge Function이 JWT를 검증하고 사용자 RLS context로 source content·category settings·SEO·tags·mapping을 다시 읽는다.

## GET-only WordPress 접근

- category/tag catalog: `context=edit`, `per_page=100`, 최대 taxonomy별 20 pages·2,000 terms
- duplicate slug: `status=draft,pending,publish,future,private`, `slug=<source slug>`
- 모든 요청은 GET, manual redirect, 8초 timeout, 1 MiB response 상한을 적용한다.
- catalog는 malformed term/header, page 불일치, ID/slug 중복, 상한 초과를 안전한 오류로 중단한다.

## Taxonomy mapping

`wordpress_taxonomy_mappings`는 owner와 canonical `site_origin`별로 category/tag의 local key를 기존 WordPress term에 명시적으로 연결한다. category는 exact slug를 우선하고 exact name은 단일 후보일 때만 제안한다. tag는 NFC·공백·소문자 정규화한 exact name 또는 exact slug를 사용한다. 여러 후보, 누락, 저장 term의 ID/slug 불일치는 blocker이며 자동 생성하지 않는다.

mapping에는 term ID, slug, name, 검증 시각만 저장한다. username, Application Password, Authorization, token은 저장·백업하지 않는다.

## Payload와 fingerprint

허용 필드는 `title`, `content`, `status=draft`, `slug`, `excerpt`, `categories[]`, `tags[]`뿐이다. title은 SEO 대표 제목, content는 보존된 WordPress HTML, excerpt는 meta description이다. category/tag ID는 중복 제거 후 오름차순 정렬한다. canonical JSON의 UTF-8 SHA-256을 `sha256:<64 lowercase hex>`로 표시하며 검사 시각과 DB timestamp는 fingerprint 입력에 포함하지 않는다.

Blocker에는 필수 제목·HTML·wrapper·h1·slug·SEO/tag 규칙, 위험 HTML, payload 크기, mapping 누락/모호/오래됨, duplicate slug, 검사 중 source 변경이 포함된다. 권장 meta 길이, 내부 출처 링크, h1-title 차이는 warning이다. blocker가 하나라도 있으면 `readyForDraftCreation=false`지만 검토용 payload는 그대로 표시한다.

## SEO 태그 비교 정책

태그 원문과 입력 순서는 수정하지 않는다. 비교 키에만 Unicode NFC, 앞뒤 공백 제거, 연속 whitespace 축소, 일반 공백·ASCII hyphen·en dash·em dash·중점·underscore 제거와 locale-independent lowercase를 순서대로 적용한다. 한글·중국어·숫자는 그대로 유지하며 transliteration, 형태소 분석, 외부 AI 판정을 사용하지 않는다.

- 기존 exact duplicate blocker `SEO_TAG_DUPLICATE`는 유지한다.
- 새 비교 키가 같고 기존 exact key는 다른 쌍은 `SEO_TAG_DUPLICATE_NORMALIZED` blocker다.
- 한 비교 키가 다른 키 전체를 포함하고 짧은 키가 4자 이상, 길이 차이가 1~3자인 경우에만 `SEO_TAG_POSSIBLE_NEAR_DUPLICATE` warning을 만든다.
- 숫자만 달라지는 쌍, 짧은 일반어, 단순 공통 단어만 공유하는 쌍은 near warning에서 제외한다.
- issue에는 문제가 된 두 원문 태그를 입력 순서대로 표시하며 warning 중복은 제거한다.
- payload `tags`는 기존 taxonomy resolution의 ID 배열을 사용하고 원문 태그를 자동 삭제·병합하지 않는다.

브라우저와 Edge Function은 bundle 경계를 유지한 별도 순수 함수를 사용하되 `fixtures/seo-tag-normalization.json`의 같은 전체 fixture를 실행한다. 한쪽 규칙만 변경하면 해당 동등성 테스트가 실패한다. fixture는 test에서만 읽으므로 production browser bundle과 Edge Function bundle에 포함되지 않는다.

## UI와 운영

- `/settings/wordpress`: GET-only catalog 새로고침과 명시적 category/tag mapping 저장·제거
- `/content/:postId/wordpress-preview`: source, mapping 해석, duplicate, blockers/warnings, byte size, fingerprint와 escaped payload JSON
- UI에는 게시, 발행, WordPress draft 생성 버튼이 없다.
- content `updated_at`이 plan 기준과 달라지면 stale로 표시하고 다시 실행해야 한다.
- normalized duplicate와 possible near duplicate는 원문 태그 쌍과 콘텐츠 편집 링크를 표시한다. 자동 수정 action은 제공하지 않는다.

## Phase 5B-R1 브라우저 회귀

`e2e/wordpress-publication-preview.spec.ts`는 production 우회 코드 없이 Supabase 공개 HTTP 경계를 Playwright에서 interception한다. 실제 response schema를 통과하는 ready, blocked, warning publication plan과 taxonomy catalog, duplicate slug fixture를 사용한다. Chromium은 인증된 콘텐츠 상세 → Dry Run, loading, payload·fingerprint·복사, blocker와 taxonomy 이동, 매핑 저장 loading·제거 확인을 검증한다. iPhone 13 project는 warning과 taxonomy/payload 접근성, fingerprint wrapping, 내부 JSON scroll, touch copy, navigation 비가림과 page-level horizontal overflow 부재를 검증한다. 두 project 모두 console error, pageerror와 게시·발행·draft 생성·WordPress 전송·업로드 버튼 부재를 명시적으로 확인한다.

E2E는 실제 WordPress, 실제 Edge Function과 원격 Supabase를 호출하지 않는다. taxonomy mapping mutation도 intercepted Supabase fixture에만 적용되며 test data를 DB에 남기지 않는다. WordPress write request는 0건이다.

```bash
npm run test:wordpress
npm run smoke:wordpress-preview
deno check supabase/functions/wordpress-publication-preview/index.ts
```

preview smoke는 로컬 Supabase Auth 사용자와 RLS content/mapping fixture, 로컬 Edge Function, pagination mock WordPress를 연결해 ready plan, 결정적 fingerprint, GET-only와 write count 0을 검증하고 모든 임시 fixture를 정리한다. 실제 WordPress 또는 원격 Supabase를 호출하지 않는다.

## 후속 단계

실제 draft 생성은 별도 승인·설계 단계다. Phase 5B fingerprint 재검증, source freshness, taxonomy/duplicate 재조회, 명시적 사용자 확인, idempotency와 감사 기록 없이 쓰기 기능을 추가하지 않는다.
