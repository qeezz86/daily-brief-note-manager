# Daily Brief Note 데이터베이스 스키마

## 1. 문서 목적과 범위

이 문서는 `docs/PRODUCT_SPEC.md`의 MVP 데이터 모델을 구현하기 위한 기준을 정리한다.

- 데이터베이스: Supabase PostgreSQL
- 인증: Supabase Auth
- 내부 기본 키: 별도 명시가 없으면 UUID
- 사용자 표시 ID와 내부 UUID는 분리
- 모든 스키마 변경은 `supabase/migrations/`의 버전 관리 SQL migration으로 적용
- 실제 사용자 콘텐츠는 Git에 저장하지 않음

이 문서에 적힌 `확인 필요 사항`은 migration 작성 전에 결정해야 하며, 여기서 임의로 확정하지 않는다.

## 2. 공통 보안 및 무결성 원칙

- 사용자 소유 데이터는 `owner_id`를 `auth.users`와 연결한다.
- `categories`는 애플리케이션이 제공하는 공용 설정·참조 데이터이며 사용자 소유 데이터가 아니다. 초기값은 별도 category seed로 관리한다.
- `categories`를 제외한 이 문서의 데이터 테이블은 사용자 소유 테이블이며 각 행에 `owner_id`를 직접 둔다.
- 사용자 소유 테이블에는 RLS를 활성화하고 `auth.uid()`에 해당하는 데이터만 조회·생성·수정·삭제할 수 있게 한다.
- 브라우저에는 Supabase anon key만 사용하며 service role key를 노출하지 않는다.
- 외래 키, unique, check constraint, index, 삭제 동작은 migration에서 명시한다.
- 이미 발행된 `display_id`와 `slug`는 카테고리 설정 변경 시 자동으로 다시 쓰지 않는다.
- 이미지 파일, URL, 바이너리, 크기, 해상도, 스토리지 정보는 저장하지 않는다.
- 출처 기사 전문, CCTV 원문 전문, 전체 자막, 전체 번역은 저장하지 않는다.

### 2.1 부모·자식 소유권 일치

하위 테이블의 `owner_id`는 부모 행의 `owner_id`와 반드시 같아야 한다. 애플리케이션 검증만 사용하지 않고 PostgreSQL 복합 외래 키로 강제한다.

- 복합 외래 키의 부모 테이블에는 `UNIQUE (id, owner_id)`를 둔다.
- 하위 테이블은 `(parent_id, owner_id)`로 부모의 `(id, owner_id)`를 참조한다.
- 두 부모를 연결하는 `post_tags`와 `news_updates`는 양쪽 부모 모두에 복합 외래 키를 둔다.
- nullable 부모 참조도 값이 있을 때는 같은 `owner_id`를 참조해야 한다.
- 아래 테이블 표에서 `references <parent>`로 축약한 사용자 데이터 관계도 실제 migration에서는 해당 부모의 `(id, owner_id)`를 참조하는 복합 외래 키로 구현한다.

복합 외래 키의 부모가 되는 다음 테이블에는 primary key와 별도로 `UNIQUE (id, owner_id)`를 명시한다.

- `posts`
- `tags`
- `news_topics`
- `news_updates`

적용 관계:

- `seo_data`, `sources`, `ai_metadata`, `info_db_metadata`, `chinese_metadata` → `posts`
- `post_tags` → `posts`, `tags`
- `news_updates` → `posts`, `news_topics`
- `news_updates.previous_update_id` → `news_updates`
- `sources.news_update_id` → `news_updates`
- `news_followups`, `news_status_history` → `news_topics`

### 2.2 RLS

`posts`, `seo_data`, `tags`, `post_tags`, `sources`, `ai_metadata`, `info_db_metadata`, `chinese_metadata`, `series_counters`, `news_topics`, `news_updates`, `news_followups`, `news_status_history`, `generated_prompts`에 RLS를 활성화한다.

- 일반 사용자 소유 테이블의 조회·수정·삭제 정책은 `owner_id = auth.uid()`를 조건으로 한다.
- 일반 테이블 생성과 수정의 `WITH CHECK`도 `owner_id = auth.uid()`를 조건으로 한다.
- `generated_prompts`는 자기 행 SELECT만 허용하고 저장·pin 변경은 전용 RPC로만 처리하며 직접 INSERT·UPDATE·DELETE는 허용하지 않는다.
- 복합 외래 키가 부모·자식 소유권 일치를 보장하고, RLS가 현재 인증 사용자와 행의 소유권을 보장한다.

### 2.3 JSON 입력 키와 DB 컬럼명

ChatGPT 구조화 입력과 백업 외부 형식의 JSON 입력 키는 camelCase를 사용한다. PostgreSQL 테이블과 컬럼은 snake_case를 유지한다. 저장 계층은 camelCase 입력 키를 snake_case DB 컬럼으로 명시적으로 매핑한다.

대표 매핑:

| JSON 키 | DB 컬럼 |
|---|---|
| `contentGroup` | `categories.content_group` 또는 감지용 입력 |
| `displayId` | `posts.display_id` |
| `publishedOn` | `posts.published_on` |
| `publishedAt` | `posts.published_at` |
| `representativeTitle` | `seo_data.representative_title` |
| `alternativeTitles` | `seo_data.alternative_titles` |
| `metaDescription` | `seo_data.meta_description` |
| `focusKeyword` | `seo_data.focus_keyword` |
| `sourceName` | `sources.source_name` |
| `sourceTitle` | `sources.source_title` |
| `sourceUrl` | `sources.source_url` |
| `sourcePublishedAt` | `sources.source_published_at` |
| `checkedPoint` | `sources.checked_point` |

## 3. 관계 개요

```text
auth.users
  ├─ posts ── seo_data
  │    ├─ post_tags ── tags
  │    ├─ sources
  │    ├─ ai_metadata
  │    ├─ info_db_metadata
  │    ├─ chinese_metadata
  │    └─ news_updates ── news_topics
  │                         ├─ news_followups
  │                         └─ news_status_history
  ├─ series_counters
  └─ generated_prompts

categories
  ├─ posts
  ├─ series_counters
  ├─ news_topics
  └─ generated_prompts
```

### 3.1 뉴스 브리핑 프롬프트 context RPC

`get_news_briefing_prompt_context(category_id, reference_date, recent_post_limit, closed_lookback_days, closed_limit)`는 인증 사용자의 뉴스 프롬프트용 데이터를 JSONB 하나로 반환하는 읽기 전용 `SECURITY INVOKER` 함수다. `owner_id`는 입력받지 않고 `auth.uid()`와 기존 RLS를 사용한다. 함수 실행 권한은 `authenticated`에만 부여한다.

반환 JSON의 `schemaVersion`은 1이다. 최근 `published` 게시물은 최대 5개, 종료 조회 기간은 1~180일, 종료 주제는 최대 20개로 제한한다. 종료 시각은 `news_status_history`의 기준일 이전 최신 `to_status = closed` 이력이며 현재 상태가 `closed`인 주제만 반환한다. WordPress HTML, 이미지 프롬프트, 사용자 이메일, 소유자 ID와 원문 기사 전문은 반환하지 않는다. 이 RPC는 `generated_prompts`를 포함한 어떤 테이블에도 쓰지 않는다.

## 4. 카테고리

### 4.1 `categories`

카테고리와 출력 형식을 설정값으로 관리한다. wrapper, 표시 ID 형식, slug 형식, 카테고리 코드를 애플리케이션 코드에 하드코딩하지 않는다.

| 열 | 형식 | 조건 |
|---|---|---|
| `id` | text | primary key |
| `content_group` | text | `news`, `ai`, `info_db`, `chinese` |
| `name` | text | 필수 |
| `code` | text | 필수 |
| `wrapper_class` | text | 필수 |
| `display_id_pattern` | text | nullable |
| `slug_pattern` | text | 필수 |
| `sort_order` | integer | 필수 |
| `enabled` | boolean | 필수 |
| `created_at` | timestamptz | 필수 |
| `updated_at` | timestamptz | 필수 |

권장 초기 설정:

| 카테고리 | 코드 | 표시 ID 패턴 | slug 패턴 | wrapper |
|---|---|---|---|---|
| 경제 | `ECO` | `#YYYY-MM-DD-ECO` | `economy-briefing-YYYY-MM-DD` | `daily-brief-note news-briefing economy` |
| 국제 | `GLO` | `#YYYY-MM-DD-GLO` | `global-briefing-YYYY-MM-DD` | `daily-brief-note news-briefing global` |
| 과학기술 | `TEC` | `#YYYY-MM-DD-TEC` | `technology-briefing-YYYY-MM-DD` | `daily-brief-note news-briefing technology` |
| 사회 | `SOC` | `#YYYY-MM-DD-SOC` | `society-briefing-YYYY-MM-DD` | `daily-brief-note news-briefing society` |
| 환경·에너지 | `ENV` | `#YYYY-MM-DD-ENV` | `climate-energy-briefing-YYYY-MM-DD` | `daily-brief-note news-briefing climate-energy` |
| AI 칼럼 | `AI` | `AI-###` | `ai-###` | `daily-brief-note ai-column` |
| 정보DB | `INFO` | `정보DB-###` | `info-db-###` | `daily-brief-note info-db` |
| 중국어 학습 | `CHINESE` | 없음 | `cctv-chinese-news-###` | `daily-brief-note chinese-study` |

`###`는 최소 3자리로 zero-padding하며 1000 이상은 그대로 확장한다. 이 설정의 변경은 기존 `posts.slug` 또는 `posts.wordpress_url`을 자동으로 다시 쓰지 않는다.

카테고리 정의 seed와 개발용 샘플 데이터는 분리한다.

## 5. 콘텐츠

### 5.1 `posts`

| 열 | 형식 | 조건 |
|---|---|---|
| `id` | uuid | primary key |
| `owner_id` | uuid | references `auth.users` |
| `category_id` | text | references `categories` |
| `series_no` | integer | nullable |
| `briefing_date` | date | nullable |
| `published_on` | date | nullable |
| `display_id` | text | nullable |
| `title` | text | 필수 |
| `summary` | text | 필수 |
| `html_body` | text | `draft`·`archived`에서는 nullable, `ready`·`published`에서는 비어 있지 않은 값 필수 |
| `slug` | text | 필수, 사용자별 unique |
| `wordpress_url` | text | nullable, 값이 있으면 사용자별 unique |
| `content_status` | text | `draft`, `ready`, `published`, `archived` |
| `published_at` | timestamptz | nullable |
| `source_import_type` | text | 아래 허용값 |
| `image_prompt` | text | nullable |
| `image_alt` | text | nullable |
| `image_prompt_version` | integer | 기본값 `1` |
| `image_prompt_updated_at` | timestamptz | nullable |
| `created_at` | timestamptz | 필수 |
| `updated_at` | timestamptz | 필수 |

`source_import_type` 허용값:

- `chatgpt_paste`
- `wordpress_manual`
- `manual_entry`
- `json_import`

콘텐츠별 조건:

- 뉴스: `briefing_date` 필수
- AI·정보DB·중국어 학습: `series_no` 필수
- 중국어 학습: `display_id`를 사용하지 않음
- `html_body`: `draft`와 `archived`에서는 `NULL`을 허용한다. `ready`와 `published`에서는 공백이 아닌 본문이 필수다. 실제 wrapper·`h1`·태그 구조는 애플리케이션 strict validation에서 검증하며, 임시 HTML 주석이나 가짜 본문은 저장하지 않는다.
- 날짜만 확인된 발행 정보는 `published_on`에 저장하고 `published_at`에 임의 시각을 만들지 않음

unique 조건:

- 복합 외래 키 부모용 `UNIQUE (id, owner_id)`
- 뉴스: `UNIQUE (owner_id, category_id, briefing_date)`
- AI·정보DB·중국어 학습: `UNIQUE (owner_id, category_id, series_no)`
- nullable 열을 사용하는 단일 `posts` 테이블 구조이므로 각 조건은 해당 콘텐츠 그룹의 필수 필드 검증과 함께 적용한다.

### 5.2 `seo_data`

| 열 | 형식 | 조건 |
|---|---|---|
| `post_id` | uuid | primary key, references `posts` on delete cascade |
| `owner_id` | uuid | references `auth.users` |
| `representative_title` | text | nullable, `ready`·`published`에서는 필수 |
| `alternative_titles` | jsonb | 대안 제목 정확히 4개 권장 |
| `meta_description` | text | 120~160자 경고 |
| `focus_keyword` | text | nullable, `ready`·`published`에서는 필수 |
| `created_at` | timestamptz | 필수 |
| `updated_at` | timestamptz | 필수 |

태그는 `tags`와 `post_tags`에서 사용자별 공유 데이터로 관리한다. 앞뒤 공백을 제거하고 내부 연속 공백을 한 칸으로 축소하며 소문자 비교 키를 사용한다. `ready`·`published`는 5~8개가 필수이고 `draft`는 0개를 허용한다. 카테고리명, `Daily Brief Note`, `DailyBriefNote`, 제목 전체는 금지하며 의미 기반 유사 태그는 자동 차단하지 않는다.

`save_post_publication_bundle` 함수는 현재 인증 사용자가 소유한 post만 잠근 뒤 기본 편집 필드, WordPress HTML, 대표 이미지 정보, `seo_data`, `post_tags`, `sources`를 하나의 트랜잭션에서 처리한다. 함수는 `SECURITY DEFINER`와 빈 `search_path`를 사용하고 소유권을 직접 확인하며 authenticated에만 실행 권한을 부여한다. `ready`·`published`에는 비어 있지 않은 HTML, 완성된 SEO, 5~8개 태그, 이미지 프롬프트·ALT, 완전한 출처 1개 이상과 HTML `#sources` URL 일치가 필요하고 `published`에는 `published_on`도 필요하다. 애플리케이션은 DOMParser로 출처 anchor를 검증하고 DB 함수도 필수 상태 조건을 재검증한다.

`import_content_post(p_item jsonb)`는 Phase 4A-2의 게시물 한 건 Import 전용 `SECURITY DEFINER` 함수다. owner와 내부 ID·timestamp는 입력받지 않고 `auth.uid()`를 사용하며 authenticated만 실행할 수 있다. 함수는 활성 category, 상태, category별 briefing/series/display ID/slug 설정, metadata 종류, 금지 내부 키와 HTML 보안 패턴을 확인한 뒤 post를 만들고 기존 `save_post_publication_bundle`, `save_chinese_publication_bundle`, `save_ai_publication_bundle`, `save_info_db_publication_bundle` 중 하나를 같은 transaction에서 호출한다. 비뉴스의 명시적 `series_no`는 `series_counters.last_issued_no = greatest(existing, imported)` 의미로 원자적으로 상향 동기화한다. unique 충돌은 기존 행을 수정하지 않고 안전한 `IMPORT_DUPLICATE_*` 오류로 반환한다. 뉴스 topic·update·followup과 영구 Import job 행은 만들지 않는다.

`import_news_tracking_for_post(p_post_id uuid, p_tracking jsonb)`는 Phase 4A-3의 뉴스 게시물 한 건 tracking Import 전용 `SECURITY DEFINER` 함수다. `auth.uid()` 소유 post를 잠그고 post에서 category를 결정한 뒤 topic 생성 또는 정확한 key의 기존 topic 재사용, 초기 상태 이력, update graph, 1-based source order 연결과 followup을 하나의 transaction으로 저장한다. owner, category, 내부 UUID와 생성·수정 시각은 입력받지 않는다. 기존 topic의 제목·요약·상태·종료 사유는 변경하지 않으며 충돌하면 전체 tracking transaction을 rollback한다. 같은 payload 내부의 `update_external_key`만 previous 참조에 사용할 수 있고 missing/self/cycle/cross-topic 참조를 차단한다. post에 update가 이미 있거나 source가 연결돼 있으면 덮어쓰지 않는다. 이 transaction 실패는 앞서 완료된 `import_content_post` transaction의 post·SEO·태그·출처를 삭제하거나 변경하지 않는다.

### 5.6 Phase 4A-4 Import job

`import_jobs`는 owner별 bundle fingerprint와 작업 상태, Dry Run 집계, 예상·실제 item 수와 시작·완료·취소 시각을 저장한다. `(owner_id, source_fingerprint)`는 unique이며 상태는 `preparing`, `ready`, `running`, `completed`, `completed_with_errors`, `cancelled`, `failed`다.

`import_job_items`는 `(job_id, item_index)`와 `(job_id, external_key)`를 unique로 유지하고 item fingerprint, 제목·category, warning 승인, 불변 `normalized_payload`, 별도 content/tracking 상태, 생성 post, 안전한 오류·retry 가능 여부, attempt 수와 tracking 결과 집계를 저장한다. content 상태는 `pending`, `running`, `imported`, `failed`, `skipped_duplicate`, `cancelled`, tracking 상태는 `not_applicable`, `not_present`, `pending`, `running`, `imported`, `failed`, `cancelled`다. `(job_id, owner_id)`와 nullable `(post_id, owner_id)` 복합 FK로 소유권을 강제한다.

`import_job_item_attempts`는 stage, 증가하는 attempt 번호, 상태, 안전한 오류 code·message, retry 가능 여부와 시작·완료 시각을 append-only로 보존한다. raw SQL 오류, SQLSTATE, constraint 이름, query와 인증 정보는 저장하지 않는다.

세 테이블은 authenticated 사용자가 자기 행만 SELECT할 수 있고 직접 INSERT·UPDATE·DELETE 권한은 없다. create, chunk append, finalize, content/tracking stage, cancel·resume 전용 `SECURITY DEFINER` RPC만 쓰기를 수행하며 `auth.uid()`와 compound ownership을 다시 확인한다. content/tracking RPC는 item row lock으로 동시 호출을 직렬화하고 내부 Import 호출을 PL/pgSQL subtransaction으로 격리해 단계 변경 rollback과 실패 상태 기록을 함께 보장한다. 읽기 RPC가 작업 목록·상세 집계를 DB에서 계산하므로 클라이언트 counter drift를 사용하지 않는다.

이미지 프롬프트가 실제로 변경되면 DB trigger가 `image_prompt_version`을 1 증가시키고 `image_prompt_updated_at`을 갱신한다. 동일한 프롬프트를 다시 저장할 때는 버전과 변경 시각을 증가시키지 않는다.

### 5.3 `tags`

| 열 | 형식 | 조건 |
|---|---|---|
| `id` | uuid | primary key |
| `owner_id` | uuid | references `auth.users` |
| `name` | text | 공백 정규화된 표시 이름, 최대 80자 |
| `normalized_name` | text | 정규화된 `name`의 소문자 값 |
| `created_at` | timestamptz | 필수 |

복합 외래 키 부모용 `UNIQUE (id, owner_id)`와 사용자별 중복 방지용 `UNIQUE (owner_id, normalized_name)`을 둔다.

### 5.4 `post_tags`

| 열 | 형식 | 조건 |
|---|---|---|
| `post_id` | uuid | references `posts` on delete cascade |
| `tag_id` | uuid | references `tags` on delete cascade |
| `owner_id` | uuid | references `auth.users` |

복합 primary key는 (`post_id`, `tag_id`)이다.

`(post_id, owner_id)`는 `posts(id, owner_id)`를, `(tag_id, owner_id)`는 `tags(id, owner_id)`를 참조하며 두 관계 모두 `ON DELETE CASCADE`다.

### 5.5 `sources`

| 열 | 형식 | 조건 |
|---|---|---|
| `id` | uuid | primary key |
| `owner_id` | uuid | references `auth.users` |
| `post_id` | uuid | references `posts` on delete cascade |
| `news_update_id` | uuid | nullable, references `news_updates` on delete set null |
| `source_name` | text | 필수 |
| `source_title` | text | 필수 |
| `source_url` | text | 필수 |
| `source_published_at` | timestamptz | nullable |
| `checked_at` | timestamptz | nullable |
| `checked_point` | text | 필수 |
| `sort_order` | integer | 필수 |
| `created_at` | timestamptz | 필수 |
| `updated_at` | timestamptz | 필수 |

절대 HTTP·HTTPS 개별 원문 URL을 사용한다. 홈페이지, 검색, 목록 URL 가능성은 경고하고 전문 대신 확인한 핵심 내용만 저장한다. fragment와 불필요한 trailing slash 차이만 있는 게시물 내 URL 중복은 통합 RPC에서 차단한다. `sort_order`는 UI 순서대로 0부터 다시 부여하며 `(post_id, sort_order)` unique index로 충돌을 막는다. 일반 콘텐츠의 `source_published_at`은 nullable이고 중국어 학습 `ready`·`published`에는 값이 필수다. 중국어 학습은 `cctv.com`, `cctv.cn` 또는 그 하위 도메인의 루트가 아닌 개별 URL을 최소 1개 요구한다.

generic `sources`에는 중국어 전용 프로그램명과 본편 목록 포함 여부 열이 없다. 해당 값은 기존 `chinese_metadata.program_name`, `chinese_metadata.episode_list_included`에서 별도로 표현하며 Phase 2B-2 저장 payload에는 억지로 합치지 않는다.

`(post_id, owner_id)`는 `posts(id, owner_id)`를 `ON DELETE CASCADE`로 참조한다. `news_update_id`가 있으면 `(news_update_id, owner_id)`가 `news_updates(id, owner_id)`를 참조한다. 이 nullable 관계는 실제 PostgreSQL migration에서 `ON DELETE SET NULL (news_update_id)`를 사용해 `news_update_id`만 null로 만들고 `owner_id`는 유지한다.

Phase 3A-2 이후 일반 사용자의 source 물리 삭제는 직접 테이블 쓰기가 아니라 publication bundle RPC를 통해 처리한다. 뉴스 업데이트에 연결된 source URL을 제거하려면 먼저 `update_news_update`로 연결을 변경해야 하며, publication bundle은 연결 URL 보존 여부를 확인하고 실패 시 게시물과 source 변경을 함께 rollback한다.

## 6. 카테고리별 메타데이터

### 6.1 `ai_metadata`

| 열 | 형식 | 조건 |
|---|---|---|
| `post_id` | uuid | primary key, references `posts` on delete cascade |
| `owner_id` | uuid | references `auth.users` |
| `field_name` | text | nullable |
| `difficulty` | text | nullable |
| `estimated_read_min` | integer | nullable |

### 6.2 `info_db_metadata`

| 열 | 형식 | 조건 |
|---|---|---|
| `post_id` | uuid | primary key, references `posts` on delete cascade |
| `owner_id` | uuid | references `auth.users` |
| `field_name` | text | nullable |
| `difficulty` | text | nullable |
| `estimated_read_min` | integer | nullable |
| `reference_date` | date | nullable |

AI·정보DB metadata는 `content_group`에 따라 각각 `save_ai_publication_bundle`, `save_info_db_publication_bundle`으로 저장한다. 두 RPC는 `auth.uid()`와 게시물 소유권을 확인하고 기존 `save_post_publication_bundle`을 같은 트랜잭션에서 재사용한다. `draft`의 신규 빈 metadata 행은 만들지 않으며, 기존 행을 모두 비운 draft는 삭제한다. `archived`에서는 기존 행을 자동 삭제하지 않는다. `ready`·`published`는 `field_name`, `difficulty`, `estimated_read_min`을 요구한다. `difficulty`는 애플리케이션과 RPC에서 `beginner`, `intermediate`, `advanced`로 검증하며 기존 자유 텍스트 데이터와의 충돌을 피하기 위해 DB check constraint는 추가하지 않는다. `estimated_read_min`은 1~600 정수다. `reference_date`는 정보DB의 nullable `date`이며 누락은 저장 차단이 아닌 UI 경고다.

### 6.3 `chinese_metadata`

| 열 | 형식 | 조건 |
|---|---|---|
| `post_id` | uuid | primary key, references `posts` on delete cascade |
| `owner_id` | uuid | references `auth.users` |
| `learning_topic` | text | draft·archived에서는 nullable, ready·published 필수 |
| `program_name` | text | draft·archived에서는 nullable, ready·published 필수 |
| `original_title` | text | draft·archived에서는 nullable, ready·published 필수 |
| `original_url` | text | 개별 CCTV 기사 또는 영상 URL, ready·published 필수 |
| `original_published_at` | timestamptz | ready·published 필수, 실제 확인 시각만 저장 |
| `episode_list_included` | boolean | nullable |
| `verified_core_fact` | text | draft·archived에서는 nullable, ready·published 필수 |
| `difficulty` | text | nullable |
| `learning_points` | text | nullable |

중국어 학습은 `posts.series_no`를 식별자로 사용하고 브리핑 ID를 생성하지 않는다. 핵심 문장 3~5개는 자체 작성 HTML에 포함할 수 있지만 원문 전체를 별도 복제하지 않는다.

중국어 학습의 동일 원문 중복 저장은 fragment 제거, trailing slash 제거, hostname 소문자화 기준으로 사용자별 차단한다. `episode_list_included`는 `true`와 `false` 모두 확인값이고 `NULL`만 미확인이다. `ready`·`published`의 원문 URL은 정규화 후 구조화 출처 URL 중 하나와 일치해야 한다.

`save_chinese_publication_bundle` RPC는 소유권과 중국어 카테고리를 확인한 뒤 기존 publication bundle 저장을 같은 트랜잭션에서 재사용하고 `chinese_metadata`를 upsert한다.

### 6.4 `series_counters`

| 열 | 형식 | 조건 |
|---|---|---|
| `owner_id` | uuid | references `auth.users` |
| `category_id` | text | references `categories` |
| `last_issued_no` | integer | 필수 |
| `updated_at` | timestamptz | 필수 |

복합 primary key는 (`owner_id`, `category_id`)이다.

AI·정보DB·중국어 학습의 `series_no`는 PostgreSQL RPC 함수로 원자적으로 발급한다. RPC 함수는 해당 카운터 행을 잠그거나 원자적으로 갱신한 뒤 다음 번호를 반환하며 `MAX(series_no) + 1` 방식은 사용하지 않는다. 삭제된 글의 번호는 재사용하지 않는다.

기존 글 가져오기 또는 백업 JSON 복원에서 현재 카운터보다 큰 `series_no`가 저장되면 같은 트랜잭션에서 `last_issued_no = greatest(last_issued_no, imported_series_no)` 의미로 상향 조정한다.

## 7. 뉴스 추적

### 7.1 `news_topics`

| 열 | 형식 | 조건 |
|---|---|---|
| `id` | uuid | primary key |
| `owner_id` | uuid | references `auth.users` |
| `category_id` | text | references `categories` |
| `topic_key` | text | `UNIQUE (owner_id, category_id, topic_key)` |
| `canonical_title` | text | 필수 |
| `topic_summary` | text | nullable |
| `status` | text | `active`, `monitoring`, `closed`, `reopened` |
| `closed_reason` | text | nullable, 종료 시 필수 |
| `first_seen_at` | date | 필수 |
| `last_seen_at` | date | 필수 |
| `created_at` | timestamptz | 필수 |
| `updated_at` | timestamptz | 필수 |

뉴스 글과 뉴스 주제는 서로 다른 엔터티다. 같은 주제의 의미 있는 진전은 기존 주제에 업데이트로 연결하며, 모든 뉴스 항목을 새 주제로 만들지 않는다.

복합 외래 키 부모용 `UNIQUE (id, owner_id)`를 둔다.

`topic_key`는 새 입력에서 영문 소문자·숫자·하이픈 형식을 사용하며 생성 후 수정하지 않는다. 사용자·카테고리별 `lower(btrim(topic_key))` unique index로 대소문자와 가장자리 공백 우회를 차단하되 기존 값을 자동 변경하지 않는다. 생성 상태는 `active`, `monitoring`만 허용한다.

허용 전환은 `active → monitoring|closed`, `monitoring → active|closed`, `closed → reopened`, `reopened → active|monitoring|closed`다. 같은 상태 저장은 거부한다. `closed`와 `reopened` 전환에는 각각 종료·재개 사유가 필요하다. 재개 후에도 마지막 `closed_reason`을 보존한다. `transition_news_topic_status(topic id, target status, reason)` RPC가 인증 사용자 소유권, 뉴스 카테고리와 전환을 확인하고 주제와 상태 이력을 한 트랜잭션으로 저장한다. 일반 사용자는 상태 이력을 직접 생성·수정·삭제할 수 없다.

### 7.2 `news_updates`

| 열 | 형식 | 조건 |
|---|---|---|
| `id` | uuid | primary key |
| `owner_id` | uuid | references `auth.users` |
| `post_id` | uuid | `(post_id, owner_id)` references `posts(id, owner_id)` on delete cascade |
| `topic_id` | uuid | `(topic_id, owner_id)` references `news_topics(id, owner_id)` on delete restrict |
| `item_order` | integer | 필수 |
| `update_type` | text | `new`, `follow_up`, `correction`, `closure_note` |
| `headline` | text | 필수 |
| `fact_summary` | text | 필수 |
| `importance_summary` | text | nullable |
| `impact_summary` | text | nullable |
| `change_summary` | text | nullable |
| `previous_update_id` | uuid | nullable, references `news_updates` on delete set null |
| `created_at` | timestamptz | 필수 |
| `updated_at` | timestamptz | 필수 |

공식 발표, 새 수치, 정책 확정, 법적 결정, 기업 후속 조치, 중대한 변화, 오류 수정, 실제 영향처럼 의미 있는 변화만 업데이트로 저장한다. 표현만 바뀐 반복 보도는 새 업데이트로 저장하지 않는다.

`previous_update_id`가 있으면 `(previous_update_id, owner_id)`가 `news_updates(id, owner_id)`를 참조한다. `news_updates`는 다른 하위 테이블의 부모가 되므로 복합 외래 키 부모용 `UNIQUE (id, owner_id)`를 둔다.

`item_order`는 1부터 시작하며 `(post_id, item_order)` unique index로 중복을 막는다. 생성 RPC는 같은 게시물 행을 잠그고 다음 순서를 계산한다. `new`는 `previous_update_id`가 null이어야 하며, 나머지 유형은 같은 주제의 접근 가능한 이전 행과 `change_summary`가 필요하다. `closure_note`는 종료된 주제에만 허용한다.

`create_news_update`와 `update_news_update`는 post/topic 소유권·뉴스 카테고리·카테고리 일치·이전 업데이트·출처를 검증하고 업데이트와 `sources.news_update_id`를 한 트랜잭션으로 저장한다. `reorder_news_updates`는 게시물의 모든 업데이트 ID가 정확히 한 번씩 전달된 경우에만 1부터 재부여한다. 일반 사용자의 `news_updates` 직접 INSERT·UPDATE·DELETE와 `sources.news_update_id` 직접 UPDATE는 허용하지 않는다. 한 source는 현재 FK 구조상 한 update에만 연결할 수 있다. 뉴스 업데이트 물리 삭제와 `news_followups` UI는 Phase 3A-2 범위 밖이다.

### 7.3 `news_followups`

| 열 | 형식 | 조건 |
|---|---|---|
| `id` | uuid | primary key |
| `owner_id` | uuid | references `auth.users` |
| `topic_id` | uuid | `(topic_id, owner_id)` references `news_topics(id, owner_id)` on delete cascade |
| `check_text` | text | 필수 |
| `status` | text | `pending`, `done`, `cancelled` |
| `due_date` | date | nullable |
| `priority` | text | `high`, `normal`, `low` |
| `resolution_note` | text | nullable |
| `resolved_at` | timestamptz | nullable |
| `created_at` | timestamptz | 필수 |
| `updated_at` | timestamptz | 필수 |

`create_news_followup`은 소유한 `active`, `monitoring`, `reopened` 뉴스 주제에 `pending` 항목만 생성한다. `update_news_followup`은 pending 항목의 `check_text`, `due_date`, `priority`만 수정하며 closed 주제에서는 차단한다. `resolve_news_followup`은 pending 항목을 `done` 또는 `cancelled`로 전환하면서 필수 해결 메모와 DB 현재 시각의 `resolved_at`을 원자 저장한다. 처리 항목의 reopen과 물리 삭제는 지원하지 않는다.

authenticated 사용자는 `news_followups`를 직접 INSERT·UPDATE·DELETE할 수 없고 자기 행 SELECT만 가능하다. 세 RPC는 고정된 `search_path`를 사용하는 `SECURITY DEFINER` 함수이며 함수 안에서 사용자·주제 소유권과 `content_group = news`를 다시 검증한다. 마감 초과는 저장 컬럼이 아니라 `status = pending`이고 `due_date < (now() at time zone 'Asia/Seoul')::date`인 경우의 계산 값이다. 주제 종료 시 pending 항목은 자동 변경되지 않으며 완료·취소만 가능하다.

### 7.4 `news_status_history`

| 열 | 형식 | 조건 |
|---|---|---|
| `id` | uuid | primary key |
| `owner_id` | uuid | references `auth.users` |
| `topic_id` | uuid | `(topic_id, owner_id)` references `news_topics(id, owner_id)` on delete cascade |
| `from_status` | text | nullable |
| `to_status` | text | 필수 |
| `reason` | text | nullable |
| `changed_at` | timestamptz | 필수 |

주제를 `closed`로 바꿀 때 `closed_reason`과 상태 이력을 함께 저장한다. 종료 후 의미 있는 진전이 생기면 `reopened` 상태와 재개 사유를 기록한다.

Phase 3A-3 UI는 뉴스 주제·뉴스 업데이트·후속 확인 항목의 물리 삭제를 지원하지 않는다. 다음 단계는 브리핑 프롬프트 생성이다.

## 8. 삭제 정책

- `posts` 삭제 시 `seo_data`, `post_tags`, `sources`, `ai_metadata`, `info_db_metadata`, `chinese_metadata`, `news_updates`를 `ON DELETE CASCADE`로 삭제한다.
- `news_topics` 삭제 시 `news_followups`, `news_status_history`를 `ON DELETE CASCADE`로 삭제한다.
- `news_updates.topic_id`는 `ON DELETE RESTRICT`로 두어 업데이트가 연결된 뉴스 주제의 물리 삭제를 막는다.
- `news_updates.previous_update_id`와 `sources.news_update_id`는 `ON DELETE SET NULL` 관계다.
- 복합 외래 키에서 참조 ID만 null 처리하고 `owner_id`를 유지하기 위해 실제 PostgreSQL migration은 다음처럼 컬럼 목록을 지정한다.

```sql
foreign key (previous_update_id, owner_id)
  references news_updates (id, owner_id)
  on delete set null (previous_update_id);

foreign key (news_update_id, owner_id)
  references news_updates (id, owner_id)
  on delete set null (news_update_id);
```

- 발행된 `posts`는 물리 삭제보다 `content_status = archived` 전환을 우선한다.
- `news_topics`는 물리 삭제보다 `closed` 등 상태 변경과 상태 이력 보존을 우선한다.
- UI의 물리 삭제 작업은 파급 범위를 확인하고 명시적 확인을 거쳐야 한다.

## 9. 날짜와 시간대

- 날짜-only 값은 PostgreSQL `date`에 저장한다.
- 실제 시각을 나타내는 값은 `timestamptz`에 저장한다.
- 앱의 기본 시간대는 `Asia/Seoul`이다.
- 시간대 정보가 없는 일반 시각 입력은 `Asia/Seoul` 기준으로 해석한 뒤 `timestamptz`에 저장한다.
- CCTV 원문의 게시·업데이트 시각은 `Asia/Shanghai` 기준으로 해석한 뒤 `timestamptz`에 저장한다.
- 날짜-only 값을 임의로 UTC 자정 시각으로 변환하지 않는다.

대표적인 날짜-only 필드는 `posts.briefing_date`, `posts.published_on`, `news_topics.first_seen_at`, `news_topics.last_seen_at`, `news_followups.due_date`, `info_db_metadata.reference_date`다. `published_at`, `original_published_at`, `source_published_at`, `checked_at`, 생성·수정 시각은 `timestamptz`다.

## 10. 프롬프트 생성 기록

### 10.1 `generated_prompts`

프롬프트 생성 기록을 저장한다.

| 열 | 형식 | 조건 |
|---|---|---|
| `id` | uuid | primary key |
| `owner_id` | uuid | references `auth.users` |
| `category_id` | text | references `categories` |
| `requested_post_count` | integer | 사용자가 요청한 최근 글 수 |
| `actual_post_count` | integer | 실제 사용한 최근 글 수 |
| `prompt_mode` | text | 프롬프트 모드 |
| `reference_date` | date | 프롬프트 작성 기준일 |
| `closed_lookback_days` | integer | 최근 종료 주제 조회 기간, 1~180 |
| `context_schema_version` | integer | 현재 지원값 `1` |
| `context_snapshot` | jsonb | 생성 당시의 전체 context snapshot |
| `prompt_text` | text | 생성한 프롬프트 |
| `is_pinned` | boolean | 기본값 `false` |
| `generated_at` | timestamptz | 생성 시각 |

- 각 `(owner_id, category_id)`별로 `generated_at DESC` 기준 최근 30개의 고정되지 않은 기록을 보존한다.
- `is_pinned = true`인 기록은 30개 계산과 자동 삭제 대상에서 제외한다.
- 새 기록 저장 후 해당 카테고리의 30개를 초과한 고정되지 않은 오래된 기록을 정리한다.
- 기록 저장과 오래된 미고정 기록 정리는 PostgreSQL DB 함수가 하나의 트랜잭션에서 처리한다.
- 고정 해제도 같은 사용자·카테고리의 retention을 같은 트랜잭션에서 다시 적용한다.
- authenticated 사용자는 자기 행 SELECT만 가능하며 직접 INSERT·UPDATE·DELETE할 수 없다.
- `save_news_briefing_prompt_run`은 `owner_id`를 입력받지 않고 `auth.uid()`로 결정하며 뉴스·활성 카테고리, 설정 범위, snapshot의 schema/category/reference date와 금지된 최상위 개인정보 필드를 검증한다.
- `set_news_briefing_prompt_run_pinned`은 소유권을 직접 확인하고 `is_pinned`만 변경한다.
- `category_id`, `reference_date`, `prompt_mode`, `closed_lookback_days`, `context_schema_version`, `context_snapshot`, `prompt_text`, `generated_at`, `owner_id`는 저장 후 변경하지 않는다.
- 이력 상세는 현재 데이터를 재조회해 prompt나 snapshot을 재구성하지 않는다.
- `requested_post_count`에는 사용자가 요청한 최근 글 수를 저장한다.
- `actual_post_count`에는 실제 프롬프트 컨텍스트에 사용한 발행 글 수를 저장한다.
- `prompt_text`에는 WordPress HTML 전문, 뉴스 기사 원문, CCTV 원문·전체 자막·전체 번역을 포함하지 않는다.
- Phase 3B-3부터 새 `context_snapshot`은 기존 `schemaVersion = 1`과 호환되는 선택 필드 `promptTemplateVersion = 1`을 포함한다. 과거 snapshot에는 이 필드가 없을 수 있으며 별도 DB column이나 migration은 사용하지 않는다.

## 10.x WordPress taxonomy mappings

`wordpress_taxonomy_mappings`는 사용자별 WordPress taxonomy 선택을 저장한다.

- 내부 PK: UUID `id`
- 소유권: `owner_id`, `auth.users` 삭제 시 cascade, RLS로 현재 사용자만 CRUD
- site: query/path 없는 canonical HTTP(S) root `site_origin`
- local identity: `mapping_kind`(`category`/`tag`) + `local_key`
- remote identity snapshot: `wordpress_taxonomy`, 양수 term ID, slug, name, nullable `verified_at`
- unique: `(owner_id, site_origin, mapping_kind, local_key)`
- check: category는 `category`, tag는 `post_tag` taxonomy만 허용

credential, Authorization, token과 WordPress 본문은 이 테이블에 저장하지 않는다. mapping 삭제는 로컬 설정만 제거하며 WordPress term을 삭제하지 않는다.

## 11. 인덱스와 중복 검사 기준

저장 전 중복 검사는 다음 순서를 따른다.

1. 사용자별 `wordpress_url`
2. 사용자별 `slug`
3. `display_id`
4. 같은 카테고리와 발행일
5. 정규화한 제목의 완전 일치
6. 뉴스의 같은 `topic_key`

필수 unique 조건:

- `posts(owner_id, slug)`
- 값이 있는 `posts(owner_id, wordpress_url)`
- 뉴스의 `posts(owner_id, category_id, briefing_date)`
- AI·정보DB·중국어 학습의 `posts(owner_id, category_id, series_no)`
- `tags(owner_id, name)`
- `news_topics(owner_id, category_id, topic_key)`
- `chinese_metadata(owner_id, original_url)`

같은 표시 ID와 정규화 제목은 저장 전 중복 검사 대상으로 처리하며 현재 확정 설계에서는 DB unique 조건으로 추가하지 않는다.

AI·정보DB·중국어 학습 컨텍스트의 exact title, slug, focus keyword 중복 검사는 최근 컨텍스트 범위가 아니라 해당 사용자의 전체 데이터에서 수행한다. 중국어 학습의 `original_url`도 전체 데이터에서 검사하며 DB unique 조건으로 저장을 차단한다.

## 12. 백업 및 복구

### 12.1 Phase 4B-1 JSON snapshot RPC

`get_user_backup_estimate(p_profile text default 'core')`는 현재 인증 사용자와 선택 profile의 section별 row count, 전체 row count, category manifest count와 operational history 포함 여부를 반환한다.

`get_user_backup_snapshot(p_profile text default 'core')`는 백업 본문을 반환하는 `STABLE SECURITY INVOKER` 함수다. owner 인자를 받지 않고 `auth.uid()`를 사용하며, 인증되지 않은 호출과 `core`·`full` 이외 profile을 거부한다. `public`과 `anon`의 실행 권한은 제거하고 `authenticated`만 실행할 수 있다. 각 user-owned table을 명시적으로 `owner_id = auth.uid()`로 제한하고 기존 RLS도 그대로 적용한다.

- 모든 data-bearing CTE와 최종 JSON 집계를 하나의 SQL statement에서 실행해 서로 다른 시점의 관계가 섞이지 않게 한다.
- `core`는 posts, seoData, tags, postTags, sources, 세 metadata, seriesCounters, 네 news tracking section, generatedPrompts를 포함한다.
- `full`은 core에 importJobs, importJobItems, importJobItemAttempts를 추가한다.
- 관계 복원에 필요한 내부 UUID와 timestamp는 보존하고 `owner_id`는 제외한다.
- nullable 필드는 null로 보존하며 array는 section별 안정적인 key로 결정적 정렬한다.
- category 공용 seed 행은 data에서 제외하고 현재 category 의미를 category manifest에 기록한다.
- snapshot은 section count, 전체 count, profile flag와 update 관계 검사를 함께 반환한다.
- 브라우저는 공식 format·manifest를 조립하고 관계와 민감정보를 검증한 뒤 canonical payload의 SHA-256 checksum을 추가한다.
- 공식 외부 형식은 `docs/BACKUP_FORMAT.md`를 따른다.

복구는 Phase 4B-1 범위가 아니다. 후속 구현은 실제 반영 전 dry-run과 중복 검사를 수행하고 항목별 `preserve`, `remap`, `reuse`, `skip`, `block` 계획과 예정 작업·오류를 표시해야 한다.

복원 계획 schemaVersion 1과 현재 복원 정책에서는 기존 데이터 overwrite 및 update를 지원하지 않는다. 향후 지원 여부는 별도 schema version과 migration에서 재검토한다.

### 12.2 CSV

CSV는 검토와 내보내기 전용이며 전체 관계 복원 형식으로 사용하지 않는다.

- posts CSV
- news topics CSV
- followups CSV
- sources CSV

### 12.3 내보내기 대상

- 전체 JSON
- posts CSV
- news topics CSV
- followups CSV
- sources CSV

## 13. 확인 필요 사항

1. `prompt_mode`의 DB 허용값을 check constraint로 강제할지 확정이 필요하다.
2. 백업 JSON 복구의 테이블별 적용 순서와 관계 remap·reuse·skip 범위는 후속 복구 단계에서 확정해야 한다. 기존 데이터 overwrite 및 update 지원 여부는 별도 schema version과 migration에서 재검토한다.

## Restore execution tables (Phase 4B-4A·4B)

`restore_jobs`는 owner별 backup checksum과 plan fingerprint를 unique하게 저장한다. 상태는 `preparing`, `ready`, `running`, `paused_with_errors`, `completed`, `cancelled`, `failed`다. 정책, category mapping과 execution stage는 job 생성 시 snapshot으로 고정된다.

`restore_job_records`는 section/source별 실행 payload, target, action, dependency, stage/sequence와 상태를 저장한다. full/include 계획은 core 뒤에 `importJobs`, `importJobItems`, `importJobItemAttempts` stage를 추가하고 각 payload fingerprint, 부모 mapping과 exact reuse를 finalize와 실행 시 다시 검사한다. `restore_job_record_attempts`는 안전한 code/message와 retry 가능 여부만 append한다.

세 테이블 모두 compound ownership FK와 RLS를 사용하고 authenticated 사용자에게 자기 row `SELECT`만 허용한다. INSERT·UPDATE·DELETE는 전용 SECURITY DEFINER RPC만 수행하며 PUBLIC·anon 실행 권한은 제거한다. 주요 RPC는 `create_restore_job`, `append_restore_job_records`, `finalize_restore_job`, `run_restore_job_record`, `cancel_restore_job`, `resume_cancelled_restore_job`, `get_restore_jobs`, `get_restore_job`, `get_restore_job_records`다.

`import_jobs`의 `restored_from_backup boolean not null default false`, `execution_locked boolean not null default false`, `restore_origin_checksum text null`은 복원 provenance를 기록한다. 일반 job은 false·false·null이며, 신규 복원 job은 true·true·실행 backup SHA-256 checksum이다. check constraint는 일반 job origin 금지와 복원 job의 잠금·checksum 형식을 강제한다. 기존 exact reuse job은 어떤 필드도 갱신하지 않는다.

Import 테이블의 기존 자기 행 SELECT RLS와 직접 write 금지를 유지한다. 운영 restore helper만 빈 `search_path`의 SECURITY DEFINER 문맥에서 `auth.uid()` owner와 명시적 컬럼 목록으로 신규 row를 만든다. 잠금 trigger는 복원된 job·item·attempt의 직접 변경을 거부하고, 기존 Import 실행 RPC wrapper는 append·finalize·content·tracking·cancel·resume 전에 부모 job의 `execution_locked`를 검사한다. 잠금 해제 RPC는 없다.
# Phase 5C: `wordpress_publication_attempts`

WordPress draft 외부 side effect의 idempotency, 실행 lock과 안전한 감사 이력을 저장한다. `owner_id`와 `(content_id, owner_id)` FK로 소유권을 강제하고 RLS select/received-insert를 owner에게만 허용한다. 일반 UPDATE 권한은 없으며 authenticated에서 execute가 revoke된 `transition_wordpress_publication_attempt_service` security-definer RPC만 고정된 순방향 전이를 수행한다. RPC는 service role을 확인하고 Edge Function이 독립적으로 검증한 owner UUID로 row를 제한한다.

- operation: `create_draft`
- status: `received`, `validating`, `blocked`, `executing`, `succeeded`, `failed_safe`, `uncertain`
- `(owner_id, site_origin, idempotency_key)` unique
- `executing`·`succeeded`·`uncertain`에 대한 content/site/operation partial unique index
- `succeeded`에는 positive WordPress ID와 `draft` status가 필수
- terminal row는 역방향 전이가 없다.
- title, HTML body, excerpt, raw WordPress response와 credential은 저장하지 않는다.

이 table은 Backup snapshot과 Restore candidate에 포함하지 않는다.
