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
- 사용자 소유 테이블에는 RLS를 활성화하고 `auth.uid()`에 해당하는 데이터만 조회·생성·수정·삭제할 수 있게 한다.
- 브라우저에는 Supabase anon key만 사용하며 service role key를 노출하지 않는다.
- 외래 키, unique, check constraint, index, 삭제 동작은 migration에서 명시한다.
- 이미 발행된 `display_id`와 `slug`는 카테고리 설정 변경 시 자동으로 다시 쓰지 않는다.
- 이미지 파일, URL, 바이너리, 크기, 해상도, 스토리지 정보는 저장하지 않는다.
- 출처 기사 전문, CCTV 원문 전문, 전체 자막, 전체 번역은 저장하지 않는다.

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
  └─ generated_prompts

categories
  ├─ posts
  ├─ news_topics
  └─ generated_prompts
```

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
| 중국어 학습 | `CHINESE` | 없음 | `cctv-chinese-news-study-###` | `daily-brief-note chinese-study` |

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
| `display_id` | text | nullable |
| `title` | text | 필수 |
| `summary` | text | 필수 |
| `html_body` | text | 필수 |
| `slug` | text | 필수, 사용자별 unique |
| `wordpress_url` | text | nullable, 값이 있으면 사용자별 unique |
| `content_status` | text | `draft`, `ready`, `published`, `archived` |
| `published_at` | timestamptz | nullable |
| `source_import_type` | text | 아래 허용값 |
| `image_prompt` | text | nullable |
| `image_alt` | text | nullable |
| `image_prompt_version` | integer | 기본값 `1` |
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
- `html_body`: 사용자가 작성·발행한 자체 콘텐츠만 저장

### 5.2 `seo_data`

| 열 | 형식 | 조건 |
|---|---|---|
| `post_id` | uuid | primary key, references `posts` on delete cascade |
| `representative_title` | text | 필수 |
| `alternative_titles` | jsonb | 대안 제목 정확히 4개 권장 |
| `meta_description` | text | 120~160자 경고 |
| `focus_keyword` | text | 필수 |
| `created_at` | timestamptz | 필수 |
| `updated_at` | timestamptz | 필수 |

태그는 `tags`와 `post_tags`에서 관리한다. 태그 수는 5~8개를 권장하며 카테고리명, `Daily Brief Note`, `DailyBriefNote`는 금지한다. 동일 태그와 정규화된 유사 태그는 경고한다.

### 5.3 `tags`

| 열 | 형식 | 조건 |
|---|---|---|
| `id` | uuid | primary key |
| `owner_id` | uuid | references `auth.users` |
| `name` | text | 사용자별 unique |
| `created_at` | timestamptz | 필수 |

### 5.4 `post_tags`

| 열 | 형식 | 조건 |
|---|---|---|
| `post_id` | uuid | references `posts` on delete cascade |
| `tag_id` | uuid | references `tags` on delete cascade |

복합 primary key는 (`post_id`, `tag_id`)이다.

### 5.5 `sources`

| 열 | 형식 | 조건 |
|---|---|---|
| `id` | uuid | primary key |
| `post_id` | uuid | references `posts` on delete cascade |
| `news_update_id` | uuid | nullable |
| `source_name` | text | 필수 |
| `source_title` | text | 필수 |
| `source_url` | text | 필수 |
| `source_published_at` | timestamptz | nullable |
| `checked_at` | timestamptz | nullable |
| `checked_point` | text | 필수 |
| `sort_order` | integer | 필수 |
| `created_at` | timestamptz | 필수 |
| `updated_at` | timestamptz | 필수 |

개별 원문 URL을 권장하고 홈페이지, 검색, 목록 URL 가능성은 경고한다. 전문 대신 확인한 핵심 내용만 저장한다.

## 6. 카테고리별 메타데이터

### 6.1 `ai_metadata`

| 열 | 형식 | 조건 |
|---|---|---|
| `post_id` | uuid | primary key, references `posts` on delete cascade |
| `field_name` | text | nullable |
| `difficulty` | text | nullable |
| `estimated_read_min` | integer | nullable |

### 6.2 `info_db_metadata`

| 열 | 형식 | 조건 |
|---|---|---|
| `post_id` | uuid | primary key, references `posts` on delete cascade |
| `field_name` | text | nullable |
| `difficulty` | text | nullable |
| `estimated_read_min` | integer | nullable |
| `reference_date` | date | nullable |

### 6.3 `chinese_metadata`

| 열 | 형식 | 조건 |
|---|---|---|
| `post_id` | uuid | primary key, references `posts` on delete cascade |
| `learning_topic` | text | 필수 |
| `program_name` | text | 필수 |
| `original_title` | text | 필수 |
| `original_url` | text | 개별 CCTV 기사 또는 영상 URL, 필수 |
| `original_published_at` | timestamptz | nullable, 누락 시 경고 |
| `episode_list_included` | boolean | nullable |
| `verified_core_fact` | text | 필수 |
| `difficulty` | text | nullable |
| `learning_points` | text | nullable |

중국어 학습은 `posts.series_no`를 식별자로 사용하고 브리핑 ID를 생성하지 않는다. 핵심 문장 3~5개는 자체 작성 HTML에 포함할 수 있지만 원문 전체를 별도 복제하지 않는다.

## 7. 뉴스 추적

### 7.1 `news_topics`

| 열 | 형식 | 조건 |
|---|---|---|
| `id` | uuid | primary key |
| `owner_id` | uuid | references `auth.users` |
| `category_id` | text | references `categories` |
| `topic_key` | text | 카테고리 내 unique 권장 |
| `canonical_title` | text | 필수 |
| `topic_summary` | text | nullable |
| `status` | text | `active`, `monitoring`, `closed`, `reopened` |
| `closed_reason` | text | nullable, 종료 시 필수 |
| `first_seen_at` | date | 필수 |
| `last_seen_at` | date | 필수 |
| `created_at` | timestamptz | 필수 |
| `updated_at` | timestamptz | 필수 |

뉴스 글과 뉴스 주제는 서로 다른 엔터티다. 같은 주제의 의미 있는 진전은 기존 주제에 업데이트로 연결하며, 모든 뉴스 항목을 새 주제로 만들지 않는다.

### 7.2 `news_updates`

| 열 | 형식 | 조건 |
|---|---|---|
| `id` | uuid | primary key |
| `post_id` | uuid | references `posts` on delete cascade |
| `topic_id` | uuid | references `news_topics` |
| `item_order` | integer | 필수 |
| `update_type` | text | `new`, `follow_up`, `correction`, `closure_note` |
| `headline` | text | 필수 |
| `fact_summary` | text | 필수 |
| `importance_summary` | text | nullable |
| `impact_summary` | text | nullable |
| `change_summary` | text | nullable |
| `previous_update_id` | uuid | nullable, references `news_updates` |
| `created_at` | timestamptz | 필수 |
| `updated_at` | timestamptz | 필수 |

공식 발표, 새 수치, 정책 확정, 법적 결정, 기업 후속 조치, 중대한 변화, 오류 수정, 실제 영향처럼 의미 있는 변화만 업데이트로 저장한다. 표현만 바뀐 반복 보도는 새 업데이트로 저장하지 않는다.

### 7.3 `news_followups`

| 열 | 형식 | 조건 |
|---|---|---|
| `id` | uuid | primary key |
| `topic_id` | uuid | references `news_topics` on delete cascade |
| `check_text` | text | 필수 |
| `status` | text | `pending`, `done`, `cancelled` |
| `due_date` | date | nullable |
| `priority` | text | `high`, `normal`, `low` |
| `resolution_note` | text | nullable |
| `resolved_at` | timestamptz | nullable |
| `created_at` | timestamptz | 필수 |
| `updated_at` | timestamptz | 필수 |

### 7.4 `news_status_history`

| 열 | 형식 | 조건 |
|---|---|---|
| `id` | uuid | primary key |
| `topic_id` | uuid | references `news_topics` on delete cascade |
| `from_status` | text | nullable |
| `to_status` | text | 필수 |
| `reason` | text | nullable |
| `changed_at` | timestamptz | 필수 |

주제를 `closed`로 바꿀 때 `closed_reason`과 상태 이력을 함께 저장한다. 종료 후 의미 있는 진전이 생기면 `reopened` 상태와 재개 사유를 기록한다.

## 8. 프롬프트 생성 기록

### 8.1 `generated_prompts`

PRODUCT_SPEC에서 선택적 저장 대상으로 정의한다.

| 열 | 형식 | 조건 |
|---|---|---|
| `id` | uuid | primary key |
| `owner_id` | uuid | 사용자 식별자 |
| `category_id` | text | 카테고리 식별자 |
| `recent_post_count` | integer | 실제 사용한 최근 글 수 |
| `prompt_mode` | text | 프롬프트 모드 |
| `prompt_text` | text | 생성한 프롬프트 |
| `generated_at` | timestamptz | 생성 시각 |

최근 30개만 유지하거나 사용자가 직접 삭제하는 방식이 제안되어 있으나 확정 규칙은 아니다.

## 9. 인덱스와 중복 검사 기준

저장 전 중복 검사는 다음 순서를 따른다.

1. 사용자별 `wordpress_url`
2. 사용자별 `slug`
3. `display_id`
4. 같은 카테고리와 발행일
5. 정규화한 제목의 완전 일치
6. 뉴스의 같은 `topic_key`

필수 unique 조건은 `posts(owner_id, slug)`, 값이 있는 `posts(owner_id, wordpress_url)`, `tags(owner_id, name)`이다. 그 밖의 중복 기준은 PRODUCT_SPEC에서 경고·권장 수준인지 DB unique 수준인지 확정되지 않았다.

## 10. 백업 및 복구 대상

MVP 다운로드 대상:

- 전체 JSON
- posts CSV
- news topics CSV
- followups CSV
- sources CSV

JSON 복구는 저장 전에 중복 검사하고 신규 추가 또는 기존 덮어쓰기를 선택하며 결과 로그를 표시한다. 인증 정보는 내보내기에 포함하지 않는다.

## 11. 확인 필요 사항

1. `categories`가 전 사용자 공용 seed인지, 관리자별 설정인지 확정이 필요하다. PRODUCT_SPEC는 설정 변경을 요구하지만 `owner_id`는 정의하지 않는다.
2. AGENTS.md는 모든 사용자 소유 테이블에 `owner_id`를 요구하지만 PRODUCT_SPEC의 `seo_data`, `post_tags`, `sources`, 세 메타데이터 테이블, `news_updates`, `news_followups`, `news_status_history`에는 `owner_id`가 없다. 부모 관계로 소유권을 판정할지 각 테이블에 열을 추가할지 결정이 필요하다.
3. `sources.news_update_id`의 외래 키 대상과 삭제 동작이 명시되지 않았다.
4. `news_updates.topic_id`, `previous_update_id`의 삭제 동작이 명시되지 않았다.
5. `display_id`의 사용자별 unique 여부와 nullable unique 처리 방식이 명시되지 않았다.
6. 같은 카테고리·발행일, 정규화 제목, 카테고리 내 `topic_key`를 DB unique로 강제할지 저장 전 경고로만 처리할지 확정이 필요하다.
7. 뉴스가 아닌 AI·정보DB에도 `series_no`가 필수지만 번호의 사용자별·카테고리별 unique 범위와 생성 방식이 명시되지 않았다.
8. `image_prompt_updated_at`은 AGENTS.md에서 선택 저장 가능하다고 하지만 PRODUCT_SPEC의 `posts` 열 목록에는 없다. 포함 여부를 결정해야 한다.
9. `generated_prompts` 저장 자체, `category_id` 외래 키, `prompt_mode` 허용값, 최근 30개 보존 방식은 확정되지 않았다.
10. 백업 JSON/CSV의 버전, 정확한 필드 구조, 관계 복원 순서, 덮어쓰기 의미가 명시되지 않았다.

