# Daily Brief Note 콘텐츠 관리 웹앱 구축 기획서

- 문서명: Daily Brief Note Content Manager
- 문서 목적: Codex 기반 구현을 위한 제품·데이터베이스·화면·업무 흐름·검증 기준 정의
- 대상 환경: 노트북·데스크톱 웹 브라우저, iPhone Safari 및 홈 화면 추가(PWA)
- 운영 방식: ChatGPT 프로젝트는 콘텐츠 생성 도구로 사용하고, 웹앱은 콘텐츠·이력·프롬프트·뉴스 추적의 기준 저장소로 사용
- 기준 문서:
  - `01_PROJECT_RULES.md`
  - `02_HTML_TEMPLATE.md`
  - `03_SEO_RULES.md`
  - `04_IMAGE_GUIDE.md`
  - `05_COPYRIGHT_POLICY.md`
  - `06_CHANGELOG.md`
  - `07_STYLE_GUIDE.md`

---

## 1. 프로젝트 개요

### 1.1 구축 목적

Daily Brief Note에서 발행하거나 발행 예정인 다음 콘텐츠를 하나의 웹앱과 클라우드 데이터베이스로 관리한다.

1. 뉴스 브리핑
   - 경제
   - 국제
   - 과학기술
   - 사회
   - 환경·에너지
2. AI 칼럼
3. 정보DB
4. 중국어 학습

웹앱은 다음 문제를 해결해야 한다.

- ChatGPT 프로젝트의 과거 대화와 출처 파일에 콘텐츠 이력을 장기간 의존하는 문제
- 발행 글 증가에 따른 주제 중복과 후속 뉴스 누락
- 프로젝트 출처 파일을 매번 교체해야 하는 인덱스 관리 문제
- 기존 워드프레스 글과 새로 생성한 글의 메타데이터 분산
- 노트북 전원이 꺼졌을 때 iPhone에서 조회·수정할 수 없는 문제
- 뉴스 카테고리별 최근 글과 추적 상태를 반영한 프롬프트 작성 부담

### 1.2 핵심 운영 원칙

- 웹앱과 DB를 콘텐츠 이력의 기준 저장소로 사용한다.
- ChatGPT 응답은 사용자가 복사하여 웹앱에 붙여넣는다.
- 웹앱은 붙여넣은 결과를 자동 분류하고 저장 전 검토 화면을 제공한다.
- 이미지 파일은 저장하지 않는다.
- 대표 이미지 프롬프트와 ALT 문구만 저장한다.
- 중국어 학습 글에는 별도의 브리핑 ID를 부여하지 않는다.
- 중국어 학습 글은 `series_no`와 제목의 `#번호`를 시리즈 식별자로 사용한다.
- 뉴스 브리핑은 브리핑 단위와 개별 뉴스 주제 단위를 분리하여 관리한다.
- 동일 뉴스는 반복하지 않고, 의미 있는 진전이 있을 때만 후속으로 연결한다.
- 워드프레스 HTML은 프로젝트에 등록된 기존 wrapper와 class만 사용한다.

---

## 2. 범위

### 2.1 MVP 필수 범위

- 이메일 기반 관리자 로그인
- 콘텐츠 목록 조회·검색·필터
- 콘텐츠 신규 등록·수정·삭제
- 기존 워드프레스 글 수동 가져오기
- ChatGPT 결과 붙여넣기 및 자동 파싱
- SEO 정보 저장
- 태그 저장
- 출처 저장
- 대표 이미지 프롬프트·ALT 저장
- 뉴스 주제·후속 체크리스트·종료 상태 관리
- 뉴스 카테고리별 최근 5·10·15개 기반 프롬프트 생성
- 프롬프트 복사
- iPhone 대응 반응형 UI
- PWA 홈 화면 추가
- 클라우드 DB 사용
- 노트북 전원이 꺼진 상태에서도 iPhone 조회·수정 가능
- 데이터 내보내기와 백업용 JSON 또는 CSV 다운로드

### 2.2 MVP 제외 범위

- 이미지 파일 업로드 및 스토리지 저장
- ChatGPT API 직접 호출
- ChatGPT 앱 자동 입력
- WordPress REST API 자동 발행
- 워드프레스 사이트 자동 크롤링
- 다중 사용자 권한 체계
- 뉴스 기사 전문 저장
- CCTV 원문 전문 또는 전체 자막 저장
- 자동 웹 리서치 및 자동 팩트체크
- 모바일 네이티브 iOS 앱

### 2.3 향후 확장 후보

- WordPress REST API 연동
- 발행 글 자동 동기화
- OpenAI API를 이용한 자동 요약·파싱
- 주제 유사도 기반 중복 경고
- 내부 링크 자동 추천
- 카테고리별 통계 대시보드
- 뉴스 후속 확인일 알림
- 변경 이력 비교
- 오프라인 임시 편집 후 재동기화

---

## 3. 확정된 제품 결정

### 3.1 이미지 관리

이미지 파일을 웹앱이나 DB에 저장하지 않는다.

`posts` 또는 별도 1:1 테이블에 다음 정보만 저장한다.

- `image_prompt`
- `image_alt`
- `image_prompt_version`
- `image_prompt_updated_at`

이미지 URL, 바이너리, 파일 크기, 해상도, WebP 파일은 관리 대상에서 제외한다.

### 3.2 중국어 학습 식별자

중국어 학습 글에는 뉴스 브리핑 ID를 적용하지 않는다.

저장 항목:

- `series_no`: 정수
- `display_series`: 화면에서 `#1`, `#2`처럼 조합
- `slug`
- CCTV 프로그램명
- 원문 제목
- 개별 원문 URL
- 게시·업데이트 시간
- 본편 목록 포함 여부
- 확인한 핵심 사실
- 학습 주제
- 난이도

예시:

```text
series_no: 12
title: CCTV 뉴스로 배우는 중국어 #12｜중국 첨단 제조업 핵심 표현 정리
slug: cctv-chinese-news-012
```

### 3.3 ID 형식

ID는 데이터베이스의 내부 UUID와 사용자에게 표시하는 ID를 분리한다.

- 내부 식별자: UUID
- 뉴스 표시 ID: 카테고리 설정값으로 생성
- AI: `AI-###`
- 정보DB: `정보DB-###`
- 중국어 학습: 별도 ID 없음, `series_no` 사용

현재 프로젝트 문서와 운영 이력 사이에 뉴스 ID 및 일부 slug 형식 차이가 있으므로 코드에 하드코딩하지 않는다.

`categories` 테이블에 다음 설정을 둔다.

- `display_id_pattern`
- `slug_pattern`
- `wrapper_class`

현재 권장 초기값:

| 카테고리 | 코드 | 표시 ID 패턴 | slug 패턴 | wrapper |
|---|---|---|---|---|
| 경제 | ECO | `#YYYY-MM-DD-ECO` | `economy-briefing-YYYY-MM-DD` | `daily-brief-note news-briefing economy` |
| 국제 | GLO | `#YYYY-MM-DD-GLO` | `global-briefing-YYYY-MM-DD` | `daily-brief-note news-briefing global` |
| 과학기술 | TEC | `#YYYY-MM-DD-TEC` | `technology-briefing-YYYY-MM-DD` | `daily-brief-note news-briefing technology` |
| 사회 | SOC | `#YYYY-MM-DD-SOC` | `society-briefing-YYYY-MM-DD` | `daily-brief-note news-briefing society` |
| 환경·에너지 | ENV | `#YYYY-MM-DD-ENV` | `climate-energy-briefing-YYYY-MM-DD` | `daily-brief-note news-briefing climate-energy` |
| AI 칼럼 | AI | `AI-###` | `ai-###` | `daily-brief-note ai-column` |
| 정보DB | INFO | `정보DB-###` | `info-db-###` | `daily-brief-note info-db` |
| 중국어 학습 | CHINESE | 없음 | `cctv-chinese-news-###` | `daily-brief-note chinese-study` |

관리 화면에서 slug 패턴과 표시 ID 패턴을 변경할 수 있게 설계한다.

### 3.4 시리즈 번호 발급

AI·정보DB·중국어 학습의 `series_no`는 `series_counters` 테이블과 PostgreSQL RPC 함수로 원자적으로 발급한다.

- `series_counters`의 primary key는 `(owner_id, category_id)`다.
- RPC 함수는 해당 카운터 행을 잠그거나 원자적으로 갱신한 뒤 다음 번호를 반환한다.
- `MAX(series_no) + 1` 방식은 사용하지 않는다.
- 삭제된 글의 번호는 재사용하지 않는다.
- 기존 글 가져오기 또는 JSON 복원에서 현재 카운터보다 큰 `series_no`가 저장되면 같은 트랜잭션에서 카운터를 해당 번호 이상으로 상향 조정한다.

---

## 4. 권장 기술 구조

### 4.1 프런트엔드

- React
- Vite
- TypeScript
- React Router
- TanStack Query
- React Hook Form
- Zod
- PWA 플러그인
- 모바일 우선 반응형 UI

### 4.2 백엔드와 데이터베이스

- Supabase
  - PostgreSQL
  - Auth
  - Row Level Security
  - Edge Functions는 MVP에서 선택 사항
- 브라우저에서 Supabase JavaScript SDK 사용
- 관리자 1인용 구조

### 4.3 배포

- GitHub: 소스코드와 마이그레이션 관리
- Vercel: 웹앱 배포
- Supabase: DB와 인증
- 환경 변수:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

서비스 역할 키는 브라우저 코드에 포함하지 않는다.

### 4.4 동작 구조

```text
노트북 브라우저 ─┐
데스크톱 브라우저 ├─> Vercel 웹앱 ─> Supabase Auth/PostgreSQL
iPhone Safari ────┘
```

노트북은 개발과 관리용 단말일 뿐 서버가 아니다. 배포된 웹앱과 클라우드 DB가 항상 실행되므로 노트북 전원이 꺼져도 iPhone에서 조회·수정할 수 있어야 한다.

---

## 5. 사용자 역할

MVP에서는 관리자 1명만 지원한다.

관리자 권한:

- 전체 콘텐츠 조회
- 등록·수정·삭제
- 기존 글 가져오기
- 뉴스 추적 상태 변경
- 후속 체크리스트 추가·완료·삭제
- 프롬프트 생성
- 설정 변경
- 데이터 내보내기

모든 사용자 데이터 테이블에는 `owner_id`를 직접 두고 Supabase Auth의 `auth.uid()`와 연결한다. 하위 테이블의 `owner_id`는 부모의 `owner_id`와 일치해야 하며 `(parent_id, owner_id)` 복합 외래 키로 DB에서 강제한다. 모든 사용자 데이터 테이블에 RLS를 활성화한다.

---

## 6. 데이터 모델

## 6.1 `categories`

카테고리와 출력 형식을 설정값으로 관리한다.

```text
id                    text primary key
content_group         text
name                  text
code                  text
wrapper_class         text
display_id_pattern    text nullable
slug_pattern          text
sort_order            integer
enabled               boolean
created_at            timestamptz
updated_at            timestamptz
```

`content_group` 허용값:

- `news`
- `ai`
- `info_db`
- `chinese`

## 6.2 `posts`

모든 콘텐츠의 공통 정보를 저장한다.

```text
id                       uuid primary key
owner_id                 uuid references auth.users
category_id              text references categories
series_no                integer nullable
briefing_date            date nullable
published_on             date nullable
display_id               text nullable
title                    text
summary                  text
html_body                text nullable for draft and archived; non-blank for ready and published
slug                     text
wordpress_url            text nullable
content_status           text
published_at             timestamptz nullable
source_import_type       text
image_prompt             text nullable
image_alt                text nullable
image_prompt_version     integer default 1
image_prompt_updated_at  timestamptz nullable
created_at               timestamptz
updated_at               timestamptz
```

제약:

- `slug`는 사용자별 unique
- `wordpress_url`은 값이 있을 때 사용자별 unique
- 뉴스는 `briefing_date` 필수
- AI·정보DB·중국어 학습은 `series_no` 필수
- 뉴스는 `unique (owner_id, category_id, briefing_date)`
- AI·정보DB·중국어 학습은 `unique (owner_id, category_id, series_no)`
- 중국어 학습은 `display_id`를 사용하지 않음
- `html_body`는 `draft`와 `archived`에서는 `NULL`을 허용하고, `ready`와 `published`에서는 공백이 아닌 값이 필수다. 실제 HTML 구조는 애플리케이션 strict validation에서 검증하며, 임시 HTML 주석이나 가짜 본문은 저장하지 않는다.
- `image_prompt_version`은 이미지 프롬프트 값이 실제로 변경될 때만 DB trigger가 증가시키며, `image_prompt_updated_at`도 같은 trigger가 기록한다.
- 날짜만 확인된 발행 정보는 `published_on`에 저장하고 `published_at`에 임의 시각을 만들지 않음

`content_status` 허용값:

- `draft`
- `ready`
- `published`
- `archived`

`source_import_type` 허용값:

- `chatgpt_paste`
- `wordpress_manual`
- `manual_entry`
- `json_import`

## 6.3 `seo_data`

```text
post_id                  uuid primary key references posts on delete cascade
owner_id                 uuid references auth.users
representative_title     text nullable while a draft is incomplete
alternative_titles       jsonb
meta_description         text
focus_keyword            text nullable while a draft is incomplete
created_at               timestamptz
updated_at               timestamptz
```

검증:

- 대안 제목은 정확히 4개 권장
- `ready`와 `published`에서는 대표 제목, 서로 다른 대안 제목 4개, 메타 설명, 포커스 키워드가 모두 필수
- 메타 설명 120~160자 경고
- SEO 태그는 `ready`·`published`에서 5~8개 필수이며 `draft`에서는 0개 허용
- 카테고리명, `Daily Brief Note`, `DailyBriefNote` 태그 금지
- 공백 정규화와 영문 대소문자 무시로 결정되는 동일 태그는 차단하고 의미 기반 유사 태그는 자동 차단하지 않음

## 6.4 `tags`

```text
id          uuid primary key
owner_id    uuid references auth.users
name        text
normalized_name text
created_at  timestamptz
```

`name`은 앞뒤 공백을 제거하고 내부 연속 공백을 한 칸으로 축소한다. `normalized_name`은 정규화된 `name`의 소문자 값이며 `(owner_id, normalized_name)` unique로 경쟁 조건에서도 중복 생성을 차단한다.

## 6.5 `post_tags`

```text
post_id    uuid references posts on delete cascade
tag_id     uuid references tags on delete cascade
owner_id   uuid references auth.users
primary key (post_id, tag_id)
```

## 6.6 `sources`

글의 출처를 저장한다.

```text
id                   uuid primary key
owner_id             uuid references auth.users
post_id              uuid references posts on delete cascade
news_update_id       uuid nullable references news_updates on delete set null
source_name          text
source_title         text
source_url           text
source_published_at  timestamptz nullable
checked_at           timestamptz nullable
checked_point        text
sort_order           integer
created_at           timestamptz
updated_at           timestamptz
```

규칙:

- 검색 결과 URL이나 홈페이지 첫 화면만 저장하지 않도록 경고
- 절대 HTTP·HTTPS 개별 URL만 허용하고 fragment와 trailing slash 차이만 있는 게시물 내 중복은 차단
- 사용자 입력 순서를 0부터 시작하는 `sort_order`로 보존하며 `(post_id, sort_order)`는 unique
- 일반 콘텐츠의 `source_published_at`은 nullable
- 개별 원문 URL 권장
- 기사 전문이나 원문 전문은 저장하지 않음
- 확인한 핵심 내용만 저장

## 6.7 `ai_metadata`

```text
post_id             uuid primary key references posts on delete cascade
owner_id            uuid references auth.users
field_name          text nullable
difficulty          text nullable
estimated_read_min  integer nullable
```

## 6.8 `info_db_metadata`

```text
post_id             uuid primary key references posts on delete cascade
owner_id            uuid references auth.users
field_name          text nullable
difficulty          text nullable
estimated_read_min  integer nullable
reference_date      date nullable
```

AI 칼럼과 정보DB는 `categories.content_group`으로 UI와 저장 RPC를 분기한다. `draft`에서는 metadata 전체 미입력 또는 부분 입력을 허용하고, 신규 빈 metadata 행은 만들지 않는다. 기존 metadata를 모두 비운 draft는 행을 삭제하며, `archived`는 기존 불완전 metadata를 자동 삭제하지 않는다. `ready`·`published`에서는 `field_name`, `difficulty`, `estimated_read_min`이 필수다. 난이도 저장값은 `beginner`, `intermediate`, `advanced`이고 화면에서는 각각 입문, 중급, 고급으로 표시한다. 예상 읽기 시간은 자동 계산하지 않으며 1~600분 정수만 허용한다. 정보DB `reference_date`는 기준일 기록용 nullable `date`로, 자동 입력하지 않으며 `ready`·`published`에서도 경고만 표시하고 저장을 막지 않는다.

`save_ai_publication_bundle`, `save_info_db_publication_bundle`은 인증 사용자와 게시물 소유권, 해당 `content_group`을 확인한 뒤 `save_post_publication_bundle`을 같은 트랜잭션에서 호출하고 각 metadata를 upsert한다. 두 함수는 AI·정보DB 이외 게시물에 대한 잘못된 metadata 저장을 차단하며 metadata 저장 실패 시 publication bundle 전체를 rollback한다.

## 6.9 `chinese_metadata`

```text
post_id                    uuid primary key references posts on delete cascade
owner_id                   uuid references auth.users
learning_topic             text
program_name               text
original_title             text
original_url               text
original_published_at      timestamptz nullable
episode_list_included      boolean nullable
verified_core_fact         text
difficulty                 text nullable
learning_points            text nullable
```

중국어 학습 특수 규칙:

- 브리핑 ID 없음
- `series_no`만 사용
- CCTV 개별 기사 또는 영상 URL 필수
- 핵심 문장 3~5개는 HTML에 포함하되 DB에는 원문 전체를 별도로 복제하지 않음
- 기사 전체 번역이나 전체 자막 저장 금지
- 동일 사용자의 같은 `original_url`은 저장 금지

`draft`는 metadata 없이 또는 부분 입력으로 저장할 수 있고 `archived`는 기존 불완전 값을 보존한다. `ready`·`published`에서는 학습 주제, 프로그램명, 원문 제목·URL·실제 게시 시각, 본편 목록 포함 여부, 확인한 핵심 사실을 모두 입력한다. 본편 목록 포함 여부는 포함과 미포함 모두 유효하며 미확인만 차단한다. 원문 URL은 fragment와 불필요한 trailing slash를 제거한 기준으로 출처 URL 중 하나와 일치해야 하며, 날짜만 확인된 경우 임의 시각을 생성하지 않는다.

## 6.10 `series_counters`

```text
owner_id       uuid references auth.users
category_id    text references categories
last_issued_no integer
updated_at     timestamptz
primary key (owner_id, category_id)
```

`last_issued_no`는 한 번 발급한 가장 큰 번호를 보존한다. PostgreSQL RPC 함수가 원자적으로 증가시키고 새 번호를 반환한다. 기존 글 가져오기나 JSON 복원 시 더 큰 번호가 들어오면 `greatest(last_issued_no, imported_series_no)` 의미로 상향 조정한다.

## 6.11 날짜와 시간대

- 날짜-only 필드는 PostgreSQL `date`를 사용한다.
- `posts.published_on`은 발행일을 저장하는 `date`다.
- `posts.published_at`은 정확한 발행 시각을 확인한 경우에만 사용하는 nullable `timestamptz`다.
- 날짜만 확인되면 `published_at`에 임의 시간을 넣지 않는다.
- 앱 기본 시간대는 `Asia/Seoul`이다.
- CCTV 원문 시각은 `Asia/Shanghai`로 해석한 뒤 `timestamptz`로 저장한다.
- 날짜-only 값을 임의 UTC 자정으로 변환하지 않는다.

---

## 7. 뉴스 추적 데이터 모델

뉴스 브리핑 한 편에는 여러 개의 뉴스 이슈가 포함된다. `posts` 한 행만으로는 후속 뉴스 추적이 불가능하므로 주제와 업데이트를 분리한다.

## 7.1 `news_topics`

지속적으로 추적할 뉴스 주제의 기준 레코드다.

```text
id                  uuid primary key
owner_id            uuid references auth.users
category_id         text references categories
topic_key           text
canonical_title     text
topic_summary       text nullable
status              text
closed_reason       text nullable
first_seen_at       date
last_seen_at        date
created_at          timestamptz
updated_at          timestamptz
```

`status` 허용값:

- `active`: 후속 가능성이 높아 계속 확인
- `monitoring`: 즉시 변화는 없으나 확인 유지
- `closed`: 종료 또는 현재 기준 후속 추적 종료
- `reopened`: 종료 후 의미 있는 새 진전 발생

`topic_key`는 영문 소문자·숫자·하이픈으로 수동 지정하고 생성 후 변경하지 않는다. 제목이 바뀌어도 자동 재생성하지 않는다. DB에서는 사용자·카테고리별 `lower(btrim(topic_key))` normalized unique를 강제하며 기존 키를 자동 변경하지 않는다.

예:

```text
semiconductor-export-controls-2026
korea-base-rate-july-2026
eu-ai-act-enforcement
```

신규 상태는 `active` 또는 `monitoring`만 허용한다. 상태 변경은 일반 수정과 분리하고 다음 전환만 허용한다.

- `active` → `monitoring`, `closed`
- `monitoring` → `active`, `closed`
- `closed` → `reopened`
- `reopened` → `active`, `monitoring`, `closed`

`closed` 전환에는 `closed_reason`이 필수다. 재개 시 기존 `closed_reason`은 마지막 종료 사유로 보존하고 재개 사유는 상태 이력에 기록한다. `transition_news_topic_status` RPC가 소유권과 뉴스 카테고리를 검증한 뒤 상태, 종료 사유와 이력을 원자 저장한다. 뉴스 주제의 물리 삭제 UI는 제공하지 않는다. `news_updates`, `news_followups`와 게시물 연결은 후속 단계에서 구현한다.

## 7.2 `news_updates`

브리핑에 실린 개별 뉴스 항목을 저장한다.

```text
id                     uuid primary key
owner_id               uuid references auth.users
post_id                uuid references posts on delete cascade
topic_id               uuid references news_topics on delete restrict
item_order             integer
update_type            text
headline               text
fact_summary           text
importance_summary     text nullable
impact_summary         text nullable
change_summary         text nullable
previous_update_id     uuid nullable references news_updates on delete set null
created_at             timestamptz
updated_at             timestamptz
```

`update_type` 허용값:

- `new`
- `follow_up`
- `correction`
- `closure_note`

Phase 3A-2에서는 뉴스 게시물과 같은 카테고리의 뉴스 주제만 연결한다. `item_order`는 게시물별 1부터 연속으로 관리한다. `new`는 이전 업데이트를 허용하지 않고, `follow_up`, `correction`, `closure_note`는 같은 주제의 이전 업데이트와 변경 요약이 필수다. `closure_note`는 현재 상태가 `closed`인 주제에만 생성한다.

생성·수정·순서 변경은 `create_news_update`, `update_news_update`, `reorder_news_updates` RPC에서 원자 처리한다. 업데이트는 게시물에 속한 미연결 출처를 하나 이상 사용한다. 현재 단일 `sources.news_update_id` 구조 때문에 한 출처를 여러 업데이트가 공유할 수 없다. 물리 삭제 UI는 제공하지 않으며 `news_followups`는 다음 단계 범위다.

업데이트 판단 기준:

- 공식 발표
- 새로운 수치
- 정책 확정
- 법적 결정
- 기업 후속 조치
- 사고·재난의 중대한 변화
- 기존 보도 오류 수정
- 시장 또는 사회에 실제 영향 발생

표현만 바뀐 반복 보도는 새 `news_updates`로 저장하지 않는다.

## 7.3 `news_followups`

뉴스 주제별 후속 확인 항목을 관리한다.

```text
id                uuid primary key
owner_id          uuid references auth.users
topic_id          uuid references news_topics on delete cascade
check_text        text
status            text
due_date          date nullable
priority          text
resolution_note   text nullable
resolved_at       timestamptz nullable
created_at        timestamptz
updated_at        timestamptz
```

`status`:

- `pending`
- `done`
- `cancelled`

`priority`:

- `high`
- `normal`
- `low`

신규 항목은 항상 `pending`으로 생성하며 `pending`에서 `done` 또는 `cancelled`로만 전환한다. 완료·취소에는 trim 후 비어 있지 않은 `resolution_note`가 필요하고 `resolved_at`은 상태 전환 RPC가 DB 현재 시각으로 설정한다. 처리된 항목을 `pending`으로 되돌리는 기능과 물리 삭제는 제공하지 않는다.

`due_date`는 시각을 붙이지 않는 날짜 값이다. `Asia/Seoul` 기준 오늘보다 이전인 `pending` 항목만 마감 초과로 계산하며 이 값은 저장하지 않는다. 정렬은 pending, 마감 초과 pending, `high`·`normal`·`low`, 빠른 마감일, 최근 수정 순이다.

`active`, `monitoring`, `reopened` 뉴스 주제에는 항목을 생성할 수 있다. `closed` 주제에는 신규 생성과 일반 수정을 금지하지만 기존 pending 항목의 완료·취소는 허용한다. 주제를 종료해도 pending 항목을 자동 완료·취소하지 않는다. `create_news_followup`, `update_news_followup`, `resolve_news_followup` RPC가 소유권·뉴스 카테고리·상태를 검증하며 일반 사용자의 직접 INSERT·UPDATE·DELETE는 허용하지 않는다. 다음 단계는 브리핑 프롬프트 생성이다.

## 7.4 `news_status_history`

주제 상태 변경 이력을 보존한다.

```text
id             uuid primary key
owner_id       uuid references auth.users
topic_id       uuid references news_topics on delete cascade
from_status    text nullable
to_status      text
reason         text nullable
changed_at     timestamptz
```

뉴스 주제를 `closed`로 변경할 때 `closed_reason`과 상태 이력을 함께 저장한다.

## 7.5 소유권과 삭제 정책

- 모든 뉴스 추적 테이블에 `owner_id`를 직접 둔다.
- `news_updates`는 `(post_id, owner_id)`와 `(topic_id, owner_id)` 복합 외래 키로 부모 소유권 일치를 강제한다.
- `news_followups`, `news_status_history`는 `(topic_id, owner_id)`로 주제 소유권 일치를 강제한다.
- `news_updates.previous_update_id`는 같은 소유자의 업데이트를 참조하고 `ON DELETE SET NULL`을 적용한다.
- `sources.news_update_id`는 같은 소유자의 업데이트를 참조하고 `ON DELETE SET NULL`을 적용한다.
- 복합 외래 키에서 `SET NULL`은 nullable 참조 열만 null로 만들고 하위 행의 `owner_id`는 유지한다.
- `sources.post_id`와 `posts` 하위 데이터는 `ON DELETE CASCADE`다.
- `news_updates.topic_id`는 `ON DELETE RESTRICT`다.
- 발행 글과 뉴스 주제는 물리 삭제보다 `archived` 또는 상태 변경을 우선한다.

---

## 8. 기존 발행 글 가져오기

## 8.1 기본 방식

MVP에서는 워드프레스 글을 자동 크롤링하지 않는다. 사용자가 워드프레스 관리자 화면에서 필요한 내용을 복사하여 웹앱의 가져오기 화면에 붙여넣는다.

### 입력 항목

- 카테고리
- 워드프레스 URL
- 발행일
- SEO 대표 제목
- SEO 대안 제목 4개
- 메타 설명
- 포커스 키워드
- SEO 태그
- 워드프레스 본문 HTML
- 대표 이미지 프롬프트
- 이미지 ALT 문구

### 작업 흐름

```text
워드프레스 글 편집 화면
→ 코드 편집기에서 HTML 복사
→ 웹앱의 기존 글 가져오기 화면에 붙여넣기
→ 자동 분석
→ 추출 결과 미리보기
→ 누락·오분류 수동 수정
→ 저장
```

## 8.2 HTML 자동 분류 기준

HTML은 정규표현식만으로 파싱하지 않는다. 브라우저 `DOMParser`를 사용한다.

### wrapper 기준

- `daily-brief-note news-briefing economy` → 경제
- `daily-brief-note news-briefing global` → 국제
- `daily-brief-note news-briefing technology` → 과학기술
- `daily-brief-note news-briefing society` → 사회
- `daily-brief-note news-briefing climate-energy` → 환경·에너지
- `daily-brief-note ai-column` → AI 칼럼
- `daily-brief-note info-db` → 정보DB
- `daily-brief-note chinese-study` → 중국어 학습

### 공통 추출

- 첫 번째 `<h1>` → `title`
- `.intro` → 도입문 후보
- `.summary-box` → `summary` 후보
- `.brief-meta` → 작성일·작성 기준·ID
- `#sources` 또는 `#source-check` → 출처
- 이전 콘텐츠 섹션의 `<a>` → 내부 링크 참고 정보
- `.content-note` → 템플릿 검증
- 최상위 wrapper와 마지막 닫는 태그 → HTML 무결성 검증

### 뉴스 추가 추출

- `section[id^="issue-"]` → 뉴스 항목 후보
- 각 이슈의 `<h2>` → headline
- `무엇이 있었나` 뒤 문단 → fact_summary
- `왜 중요한가` 뒤 문단 → importance_summary
- `우리에게 미치는 영향` 뒤 문단 → impact_summary
- `앞으로 볼 포인트` 뒤 문단 → 후속 체크리스트 후보
- `.update-label` → 신규·후속 여부와 이전 브리핑 ID 후보
- `#change-log` → 신규·후속·제외 이력
- `#watch-points` → 공통 후속 체크리스트 후보

### 중국어 추가 추출

- 제목의 `#번호` → `series_no`
- `#source-check` 표 → 프로그램명·원문 제목·시간·URL·본편 목록 포함 여부·확인 내용
- 브리핑 ID는 추출하거나 생성하지 않음

## 8.3 저장 전 검토

자동 파싱 결과는 즉시 DB에 저장하지 않는다.

미리보기에서 다음을 확인한다.

- 분류된 카테고리
- 제목
- ID 또는 시리즈 번호
- slug
- 요약
- SEO 정보
- 태그 개수
- 출처
- 뉴스 주제 연결
- 후속 체크리스트
- 이미지 프롬프트·ALT
- HTML 검증 오류

사용자가 `저장`을 눌러야 실제 DB에 반영한다.

## 8.4 검증 모드

- 신규 글과 ChatGPT 입력에는 `strict` validation을 적용한다.
- 기존 WordPress 글 가져오기에는 `legacy` validation을 적용한다.
- 치명적 오류는 두 모드 모두 저장을 차단한다.
- `legacy`는 역사적 class·형식 차이를 경고와 수동 검토 대상으로 처리할 수 있지만 보안, wrapper 무결성, 필수 식별자 같은 치명적 오류를 허용하지 않는다.
- strict validation을 완전히 비활성화하는 기능은 MVP에서 제공하지 않는다.

## 8.5 중복 검사

저장 전 다음 순서로 중복을 검사한다.

1. 동일 `wordpress_url`
2. 동일 `slug`
3. 동일 `display_id`
4. 동일 카테고리·동일 발행일
5. 제목 정규화 후 완전 일치
6. 뉴스의 경우 동일 `topic_key`

중복이 발견되면 선택지를 제공한다.

- 기존 글 열기
- 기존 글 수정
- 새 버전으로 저장하지 않고 취소
- 후속 뉴스로 연결

---

## 9. ChatGPT 응답 붙여넣기

## 9.1 권장 입력 형식

ChatGPT 결과의 마지막에 다음 DB 저장용 블록을 사용할 수 있다.

```text
[CONTENT_META_JSON]
{
  "contentGroup": "news",
  "category": "economy",
  "displayId": "#2026-07-09-ECO",
  "title": "...",
  "slug": "economy-briefing-2026-07-09",
  "publishedOn": "2026-07-09",
  "publishedAt": null
}
[/CONTENT_META_JSON]

[SEO_JSON]
{
  "representativeTitle": "...",
  "alternativeTitles": ["...", "...", "...", "..."],
  "metaDescription": "...",
  "focusKeyword": "...",
  "tags": ["태그1", "태그2", "태그3", "태그4", "태그5"]
}
[/SEO_JSON]

[IMAGE_PROMPT_JSON]
{
  "prompt": "...",
  "alt": "..."
}
[/IMAGE_PROMPT_JSON]

[SOURCES_JSON]
[
  {
    "sourceName": "...",
    "sourceTitle": "...",
    "sourceUrl": "https://example.com/source",
    "sourcePublishedAt": null,
    "checkedPoint": "..."
  }
]
[/SOURCES_JSON]

[NEWS_TRACKING_JSON]
{
  "updates": [],
  "followups": []
}
[/NEWS_TRACKING_JSON]

[WORDPRESS_HTML]
<div class="daily-brief-note news-briefing economy">
...
</div>
[/WORDPRESS_HTML]
```

모든 구조화 블록은 시작 태그와 종료 태그를 모두 사용한다. `CONTENT_META_JSON`, `SEO_JSON`, `IMAGE_PROMPT_JSON`, `SOURCES_JSON`, `NEWS_TRACKING_JSON`은 표준 JSON을 사용한다. 주석과 trailing comma를 허용하지 않는다. WordPress HTML은 JSON 문자열 안에 넣지 않고 별도의 `WORDPRESS_HTML` 블록에 둔다.

JSON 입력 키는 camelCase를 사용한다. DB 컬럼은 snake_case를 유지하며 파서는 camelCase JSON 키를 저장 시 대응하는 snake_case 컬럼으로 매핑한다.

예:

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

## 9.2 비구조화 응답 지원

기존 프로젝트 출력 순서인 다음 항목도 파싱한다.

1. SEO 입력용 대표 제목
2. SEO 대안 제목 4개
3. 메타 설명
4. URL 슬러그
5. 포커스 키워드
6. SEO 태그
7. 워드프레스 본문용 HTML
8. 대표 이미지 프롬프트
9. 이미지 ALT 문구
10. 발행 전 체크리스트

파싱 우선순위:

1. 유효한 JSON 블록
2. 명시적 section
3. HTML wrapper와 DOM 구조
4. 제목 패턴
5. 수동 수정

동일 selector 또는 서로 다른 단계에서 여러 후보가 나오면 자동 확정하지 않고 후보와 경고를 표시한다. 필수 필드가 모호하면 저장을 차단한다.

---

## 10. 뉴스 프롬프트 생성기

## 10.1 사용자 흐름

```text
뉴스 프롬프트 생성
→ 경제/국제/과학기술/사회/환경·에너지 선택
→ 최근 글 수 5/10/15 선택
→ 추가 지시사항 선택 입력
→ 프롬프트 생성
→ 미리보기
→ 클립보드 복사
```

선택한 개수보다 저장된 글이 적으면 존재하는 글 전부를 사용한다.

예:

- 요청 15개
- DB에 경제 브리핑 8개
- 실제 사용 8개
- 화면에 `최근 8개를 사용했습니다` 표시

## 10.2 조회 기준

- 동일 뉴스 카테고리
- `content_status = published`
- `published_on DESC NULLS LAST, updated_at DESC`
- 선택 개수만큼 조회
- HTML 전문을 프롬프트에 넣지 않음
- 저장된 요약과 뉴스 추적 데이터만 사용

## 10.3 프롬프트 구성

생성된 프롬프트에는 다음을 포함한다.

### A. 요청 정보

- 작성 기준일
- 뉴스 카테고리
- 생성할 브리핑 ID
- 생성할 slug
- 적용 wrapper
- 최근 사용 글 수

### B. 최근 브리핑 요약

각 브리핑별:

- 발행일
- 브리핑 ID
- 제목
- 브리핑 전체 요약
- 포함된 뉴스 주제
- 신규·후속·정정 구분

### C. 현재 추적 중인 뉴스

`active`, `monitoring`, `reopened` 주제:

- canonical title
- 최근 확인일
- 최근 변화 요약
- 마지막 브리핑 ID
- 후속 작성 인정 조건
- pending 체크리스트

### D. 종료된 뉴스

기본 90일, 사용자가 지정할 수 있는 최대 180일 안에 `closed` 처리된 주제를 최근 순으로 최대 20건 포함한다. `reopened` 주제는 종료 목록에서 제외하고, 대상이 없으면 종료 뉴스 섹션을 생략한다.

- 주제명
- 종료일
- 종료 사유
- 마지막 확인 내용

프롬프트에는 다음 지시를 추가한다.

```text
종료된 뉴스는 새로운 공식 발표나 실질적 변화가 확인되지 않는 한 다시 포함하지 않는다.
종료 후 의미 있는 진전이 확인되면 재개 사유를 명시하고 업데이트로 처리한다.
```

### E. 반복 금지 목록

다음 조건에 해당하는 이슈를 자동 정리한다.

- 최근 글에 포함되었으나 변화가 없는 주제
- 종료된 주제
- 표현만 바뀐 동일 보도
- 후속 체크리스트가 모두 완료되었고 새 발표가 없는 주제

### F. 후속 체크리스트

`pending` 상태의 항목을 우선순위와 함께 제공한다.

예:

```text
[고우선]
- 한국은행 공식 결정과 의결문 확인
- 기업 IR의 투자 금액 확정 여부

[일반]
- 시행령 공포일 확인
- 월간 통계 발표 확인
```

### G. 프로젝트 작성 규칙

- 확인된 뉴스만 작성
- 억지로 뉴스 수를 채우지 않음
- 완전히 동일한 뉴스 제외
- 의미 있는 진전만 업데이트
- 공식 발표일과 기사 작성일 구분
- 사실과 전망 구분
- 출처는 개별 원문 URL 사용
- 원문 문장 복사 금지
- 해외 기사 전체 직역 금지
- 워드프레스 HTML은 단일 블록
- `<h1>` 포함
- 올바른 wrapper 사용
- 마지막 `</div>` 포함
- SEO 태그 5~8개
- 카테고리명 및 유사 태그 제외
- 대표 이미지 프롬프트와 ALT는 HTML 밖에 출력

## 10.4 프롬프트 길이 제어

최근 15개 글을 선택해도 프롬프트가 과도하게 길어지지 않도록 제한한다.

권장 기본값:

- 브리핑 전체 요약: 글당 최대 600자
- 뉴스 항목 사실 요약: 항목당 최대 350자
- 변화 요약: 항목당 최대 250자
- 후속 체크리스트: 주제당 최대 5개
- 종료된 뉴스: 최근 20개 이내
- 출처 URL 전문 목록: 프롬프트 컨텍스트에는 기본 미포함
- HTML 본문: 미포함

길이 제한으로 내용을 줄일 때 다음 항목은 생략하지 않는다.

- 사용자 요청
- 필수 프로젝트 규칙
- 생성할 ID·slug·wrapper
- `active`, `reopened` 주제의 고우선 후속 항목
- 반복 금지 지시

다음 순서로 먼저 줄인다.

1. 상세 이력
2. 오래된 종료 뉴스
3. 저우선 `monitoring` 항목

UI에 다음 모드를 제공할 수 있다.

- 간단: 최근 글 핵심만
- 표준: 요약·추적·종료 포함
- 상세: 표준 + 후속 이력

MVP 기본값은 `표준`이다.

### 10.4.1 Phase 3B-1 집계·미리보기 구현 범위

- 보호 경로: `/briefing-prompts`
- 작성 기준일: `Asia/Seoul` 날짜-only 값
- 모드: 간단·표준·상세, 기본 표준
- 이번 단계의 최근 게시물 범위: `published` 최대 5개
- 추적 주제: `active`, `monitoring`, `reopened`
- 후속 확인: 선택 카테고리의 `pending`
- 종료 주제: 기준일로부터 기본 90일, 최대 180일, 최신 20개
- context JSON: `schemaVersion = 1`
- 프롬프트와 구조화 JSON을 미리보기 후 plain text로 복사

간단 모드는 최근 브리핑 핵심과 high 또는 overdue 후속 항목, 종료 주제 핵심을 제공한다. 표준 모드는 최근 게시물의 뉴스 항목과 모든 추적 주제·pending 후속·최근 종료 주제를 제공한다. 상세 모드는 표준 정보에 중요성·영향·변화 요약과 최신 주제 업데이트 세부 내용을 더한다.

Phase 3B-1은 context와 프롬프트를 저장하지 않는다. 생성 이력, snapshot, pin, 자동 정리와 ChatGPT/OpenAI API 호출은 후속 단계다. WordPress HTML 전문, 사용자 이메일, 이미지 프롬프트와 기사 원문은 context에서 제외한다. 제품 전체의 최근 5·10·15개 선택은 후속 프롬프트 단계에서 확장한다.

### 10.4.2 Phase 3B-2 이력·snapshot 구현 범위

Phase 3B-2는 미리보기에 사용한 설정, `schemaVersion = 1` context 전체와 정확한 프롬프트 텍스트를 `generated_prompts`에 저장한다. 설정 변경 후 기존 미리보기는 stale이며 재생성 전 저장할 수 없다. 저장된 프롬프트와 snapshot은 수정하지 않고 현재 게시물·주제·후속 항목 변경으로 다시 만들거나 덮어쓰지 않는다.

이력 목록과 상세는 `/briefing-prompts/history` 아래의 보호 경로에서 제공한다. 사용자·카테고리별 미고정 최근 30개를 보존하고 고정 이력은 한도와 자동 정리에서 제외한다. 고정 해제 시 같은 트랜잭션에서 retention을 다시 적용한다. 저장과 pin 변경은 인증 사용자 소유권을 확인하는 전용 RPC만 사용한다. 외부 AI API 호출과 카테고리별 최종 작성 템플릿은 포함하지 않으며 후자는 Phase 3B-3에서 적용한다.

### 10.4.3 Phase 3B-3 카테고리별 작성 규칙·출력 템플릿

Phase 3B-3은 경제, 국제, 과학기술, 사회, 환경·에너지의 결정적 작성 규칙을 `categoryPromptRules`에 category ID별로 정의한다. 각 규칙은 조사 범위, 출처 우선순위, 필수 작성 지침과 상세 검증 항목을 제공한다. wrapper, 표시 ID와 slug 형식은 구조화 규칙에 중복 하드코딩하지 않고 생성 당시의 category 설정을 사용한다.

모든 모드는 다음 필수 규칙을 유지한다.

- 공식 자료와 신뢰할 수 있는 보도의 신규 조사 및 사실 검증
- 의미 있는 변화만 업데이트하고 반복 보도 제외
- category 설정의 wrapper·ID·slug
- SEO 10개 출력 항목 순서
- `<h1>`과 마지막 `</div>`를 포함한 하나의 연속된 WordPress HTML 블록
- 출처 및 참고자료 → 이전 카테고리 브리핑 → 고정 content-note 순서
- 기사 복사·해외 기사 전체 직역·언론사 이미지 무단 사용 금지
- 대표 이미지 프롬프트와 ALT의 HTML 외부 분리

간단 모드는 필수 규칙과 category 조사 범위를 간결하게 제공한다. 표준 모드는 category 출처 우선순위, SEO·이미지·HTML·출처 구조를 확장하며 기본 권장 모드다. 상세 모드는 사실 검증, 신규·후속·정정·종료 판정, category별 수치·정책·연구 검증과 발행 전 체크리스트를 추가한다.

현재 template version은 `1`이다. 새 context snapshot에는 기존 `schemaVersion = 1`을 유지하면서 선택 필드 `promptTemplateVersion`을 기록하고 prompt text에도 같은 버전을 표시한다. 과거 snapshot에 이 값이 없어도 상세 화면은 안전하게 표시한다. 저장된 prompt text와 snapshot은 현재 rules로 다시 생성하지 않으며, DB column이나 RPC 변경은 필요하지 않다. Phase 3B-4에서는 생성 결과에 대한 prompt 규칙 준수 검증을 강화한다.

### 10.4.4 Phase 3B-4 결정적 프롬프트 검증

생성된 prompt text를 context snapshot, 생성 설정, mode와 category rules에 대해 순수 함수로 검증한다. validation version은 `1`이며 동일 입력은 동일 결과를 만든다.

- 오류: 경계·필수 section·출력 순서·category rule·필수 context coverage·구조적 중복·후속/정정/종료 관계·개인정보/UUID·HTML 원문·핵심 저작권 지침 누락. 저장과 prompt 복사를 차단한다.
- 경고: 최근 데이터 부재, 간단 mode의 정상적인 상세 생략, 정규화 exact headline 중복, 과도한 길이. 저장과 복사를 허용한다.
- stale preview: 검증 결과도 stale로 간주하고 재생성 전 저장·prompt 복사를 차단한다. context JSON 복사는 디버깅 목적으로 허용한다.

검증은 section marker와 builder가 출력한 사용자 의미 문자열을 사용하며 자연어 의미 유사도, 외부 기사 비교, 실제 뉴스 팩트체크와 외부 AI API 호출을 수행하지 않는다. Context의 잘못된 counts, post/update/followup/topic 중복과 open/closed topic 충돌을 parser에서 조용히 숨기지 않는다.

새 snapshot은 기존 `schemaVersion = 1`과 호환되는 선택 필드로 `promptValidationVersion = 1`과 오류가 없는 저장 당시 summary(`status`, `errorCount = 0`, `warningCount`, `checkCount`)를 보존한다. 상세 issue 전체는 저장하지 않는다. 과거 run에 summary가 없으면 “검증 기록 없음 (이전 이력)”으로 표시하고 현재 validator로 저장 당시 결과처럼 재검증하지 않는다. 기존 JSONB 저장 RPC가 선택 필드를 그대로 보존하므로 별도 DB migration을 사용하지 않는다.

## 10.5 프롬프트 예시

```text
# Daily Brief Note 경제 브리핑 생성 요청

작성 기준일: 2026-07-10
카테고리: 경제 브리핑
브리핑 ID: #2026-07-10-ECO
URL 슬러그: economy-briefing-2026-07-10
Wrapper: daily-brief-note news-briefing economy
참조 범위: 최근 10개 경제 브리핑

## 최근 브리핑 요약

### #2026-07-09-ECO
- 제목:
- 전체 요약:
- 신규 뉴스:
- 후속 뉴스:
- 제외된 반복 뉴스:

## 현재 추적 중인 뉴스

### [주제명]
- 상태: active
- 최근 확인일:
- 최근 변화:
- 마지막 관련 브리핑:
- 후속 작성 인정 조건:
- 확인할 항목:

## 종료된 뉴스

### [주제명]
- 종료일:
- 종료 사유:
- 재포함 조건: 새로운 공식 발표 또는 실질적 변화가 확인될 때만

## 반복 금지

- [...]
- [...]

## 작성 지시

1. 최신 자료를 새로 조사한다.
2. 위 이력과 완전히 동일한 내용은 제외한다.
3. 의미 있는 진전이 있을 때만 이전 브리핑 ID를 표시하고 업데이트로 작성한다.
4. 신규 뉴스가 부족하면 억지로 수를 채우지 않는다.
5. 사실과 분석, 전망을 구분한다.
6. 프로젝트의 HTML·SEO·출처·저작권 규칙을 적용한다.
7. 최종 결과는 지정된 10개 출력 항목 순서로 작성한다.
```

## 10.6 생성 기록

`generated_prompts` 테이블에 저장한다.

```text
id                 uuid primary key
owner_id           uuid
category_id        text
requested_post_count integer
actual_post_count  integer
prompt_mode        text
reference_date     date
closed_lookback_days integer
context_schema_version integer
context_snapshot   jsonb
prompt_text        text
is_pinned          boolean default false
generated_at       timestamptz
```

사용자·카테고리별 미고정 기록을 최근 30개까지 보존한다. `is_pinned = true`인 기록은 자동 삭제와 30개 계산에서 제외한다. PostgreSQL DB 함수가 기록 저장과 오래된 미고정 기록 정리를 하나의 트랜잭션에서 처리한다.

`requested_post_count`에는 사용자가 요청한 최근 글 수를 저장한다. `actual_post_count`에는 실제 프롬프트에 사용한 글 수를 저장한다. `context_snapshot`과 `prompt_text`는 생성 당시 값을 보존하며 pin 이외의 직접 수정·삭제를 허용하지 않는다. `prompt_text`에는 WordPress HTML 전문, 뉴스 기사 원문, CCTV 원문·전체 자막·전체 번역을 포함하지 않는다.

---

## 11. AI·정보DB·중국어 학습 컨텍스트 생성

뉴스 프롬프트 생성이 MVP 핵심이다. 나머지 카테고리도 같은 DB를 이용해 중복 방지용 컨텍스트를 생성한다.

### 11.1 AI 칼럼

`ready`, `published` 상태의 최근 20개를 제공한다.

- AI ID
- 제목
- 핵심 개념
- 요약
- 포커스 키워드
- 태그
- 유사 주제
- 기존 글과 겹치지 않아야 할 범위

### 11.2 정보DB

`ready`, `published` 상태의 최근 30개를 제공한다.

- 정보DB ID
- 제목
- 정의 대상
- 요약
- 비교한 유사 개념
- 흔한 오해
- 포커스 키워드

### 11.3 중국어 학습

`ready`, `published` 상태의 최근 20개를 제공한다.

- 시리즈 번호
- 제목
- CCTV 프로그램명
- 원문 제목
- 원문 URL
- 뉴스 주제
- 핵심 단어·문장 구조 요약
- 동일 원문 URL 및 동일 주제 중복 금지

중국어 학습 컨텍스트에는 브리핑 ID를 생성하지 않는다.

비뉴스 recent context는 `published_on DESC NULLS LAST, updated_at DESC`로 정렬한다. exact title, slug, focus keyword, 중국어 `original_url` 중복 검사는 `draft`, `ready`, `published`, `archived` 전체 데이터에서 수행한다. 동일 중국어 `original_url`은 저장을 차단한다.

---

## 12. 화면 설계

## 12.1 로그인

- 이메일 로그인
- 세션 유지
- 로그아웃

## 12.2 대시보드

표시 항목:

- 전체 글 수
- 카테고리별 글 수
- 발행 대기 글 수
- active 뉴스 주제 수
- pending 후속 체크리스트 수
- 최근 등록 글
- 최근 생성 프롬프트

## 12.3 콘텐츠 목록

필터:

- 콘텐츠 그룹
- 뉴스 하위 카테고리
- 상태
- 발행일 범위
- 태그
- 검색어

표시:

- ID 또는 시리즈 번호
- 제목
- 카테고리
- 상태
- 발행일
- WordPress URL
- 수정일

작업:

- 보기
- 수정
- 복제
- 삭제
- 프롬프트 컨텍스트로 사용

## 12.4 콘텐츠 편집

탭 또는 섹션:

1. 기본 정보
2. SEO
3. 태그
4. HTML
5. 출처
6. 이미지 프롬프트
7. 뉴스 추적 정보 또는 카테고리별 메타데이터

WordPress HTML, SEO 데이터, 태그·관계, 순서가 있는 출처, 대표 이미지 프롬프트·ALT, 기본 편집 필드와 상태 변경은 인증 사용자의 소유권을 확인하는 `save_post_publication_bundle` 함수에서 하나의 트랜잭션으로 저장한다. `draft`는 태그·출처가 없어도 저장할 수 있고 기존 `archived` 데이터는 미완성을 허용한다. `ready`와 `published`는 strict HTML validation, 완성된 SEO, 5~8개 태그, 이미지 프롬프트와 ALT, 완전한 출처 1개 이상과 HTML `#sources` 링크 일치가 필요하며 `published`는 `published_on`도 필요하다. 메타 설명 120~160자는 저장 차단이 아닌 경고다.

## 12.5 기존 글 가져오기

### 12.5.1 Phase 4A-1 Import 형식 검증과 Dry Run

보호 경로 `/imports`와 `/imports/new`는 `docs/IMPORT_FORMAT.md`의 공식 콘텐츠 Import bundle을 UTF-8 `.json` 파일 또는 JSON text로 입력받는다. 최상위 필수 필드는 `format: "daily-brief-note-content-import"`, `schemaVersion: 1`, `posts`이며 외부 JSON은 camelCase와 strict top-level schema를 유지한다. format 없는 legacy bundle, 다른 format, 지원하지 않는 version, `data` 기반 전체 backup bundle과 backup format은 명확한 오류로 차단한다. v1 필드 의미는 고정하고 비호환 변경은 v2에서 처리한다. 한 번에 하나의 입력만 사용하고 최대 20 MB, 2,000개 게시물을 검증한다.

Dry Run은 bundle, 공통 게시물 필드, 현재 category 설정, category metadata, 기존 WordPress HTML validator, SEO·태그·출처 규칙, 파일 내부 결정적 중복과 현재 인증 사용자의 DB exact duplicate를 검사한다. 결과는 `ready`, `warning`, `invalid`, `duplicate`와 안정적인 영문 issue code로 표시한다. DB 후보는 실제 unique 정책의 slug, WordPress URL, 뉴스 category·briefing date key, category·series number, 뉴스 topic key, 중국어 normalized original URL로 제한한다. 후보를 trim하고 빈 값·중복을 제거한 뒤 100개 단위로 RLS가 적용된 현재 projection의 batch SELECT를 순차 실행한다. item별 N+1 query, `select('*')`, `owner_id` 입력, 내부 UUID 노출과 무제한 `Promise.all`은 사용하지 않는다. 결과는 결정적으로 병합하고 조회 상태를 `complete`, `partial`, `unavailable`로 유지하며, chunk 하나라도 실패하면 complete로 표시하지 않는다. Phase 4A-1은 partial 또는 unavailable을 warning으로 처리하고 이후 실제 Import는 complete가 아니면 저장을 차단할 수 있다.

`strict`가 기본이며 명시적 `legacy`는 기존 WordPress class와 inline style을 경고로 분리할 수 있다. HTML 보안 오류는 항상 차단한다. HTML 원문은 실행·렌더링하거나 전체 결과 JSON에 포함하지 않고 존재 여부, 길이와 checksum만 기록한다. 결과 JSON은 복사하거나 다운로드용 text로 사용할 수 있지만 서버와 DB에 저장하지 않는다.

Phase 4A-1은 INSERT·UPDATE·DELETE, Import job/이력, 실제 Import, partial commit, rollback, upsert, 자동 수정, 백업 복구, 외부 URL fetch, WordPress API/WXR, ZIP과 AI 의미 중복 판정을 포함하지 않는다. 실제 반영은 Phase 4A-2 이후 별도 단계다.

### 12.5.2 Phase 4A-2 검증 완료 게시물 실제 Import

Dry Run의 `ready`는 기본 선택하고 `warning`은 현재 화면 세션에서 사용자가 경고를 명시적으로 승인한 뒤 선택한다. `invalid`와 `duplicate`는 선택하지 못한다. DB duplicate 조회가 `complete`가 아니거나 입력·카테고리 설정 변경으로 결과가 stale이면 실제 Import를 차단한다.

실행 버튼을 누르면 선택 항목의 exact duplicate 후보를 DB에서 다시 조회한다. 새 중복은 제외하고 남은 항목 수, ready 수, 승인 warning 수, 성공 항목 자동 rollback 불가, 기존 게시물 미수정, 뉴스 추적 미저장을 최종 확인한다. 항목은 무제한 병렬 실행 없이 입력 순서대로 하나씩 처리하며 한 항목 실패 후 다음 항목을 계속한다. 인증·연결·RPC/schema·권한 오류는 남은 실행을 중단할 수 있다.

`import_content_post(jsonb)`는 인증 사용자의 `auth.uid()`를 owner로 사용하고 게시물 한 건의 post, HTML·SEO·이미지 metadata, category metadata, 태그·관계, 순서가 있는 출처와 필요한 series counter 상향 동기화를 하나의 transaction으로 저장한다. 기존 publication bundle 검증을 재사용하며 unique race는 DB constraint와 안전한 Import 오류 코드로 차단한다. overwrite·upsert·기존 게시물 UPDATE·전체 bundle transaction/rollback은 지원하지 않는다.

### 12.5.3 Phase 4A-3 뉴스 tracking Import

콘텐츠 Import가 성공한 뉴스 게시물에 `newsTracking`이 있으면 `import_news_tracking_for_post`를 이어서 호출한다. 콘텐츠와 tracking은 별도 게시물 단위 transaction이다. tracking transaction은 신규 topic과 초기 상태 이력, 기존 topic의 안전한 재사용, news update와 같은 payload 내부 previous 참조, item order, 기존 post source 연결과 followup을 함께 저장한다. 일부라도 실패하면 해당 tracking 변경만 rollback하고 이미 생성된 콘텐츠·SEO·태그·출처는 유지한다.

기존 topic은 owner·category·정규화 topic key가 정확히 일치하고 payload의 제목·요약·상태·종료 사유가 기존 값을 덮어쓰지 않을 때만 재사용한다. update·followup은 기존 행을 찾아 수정하거나 재사용하지 않는다. 외부 JSON은 DB UUID 대신 `topicExternalKey`, `updateExternalKey`, `previousUpdateExternalKey`, `followupExternalKey`와 1-based `sourceOrders`를 사용한다. previous 참조는 같은 payload와 topic으로 제한하며 missing/self/cycle을 차단한다. 결과는 콘텐츠와 tracking 상태를 별도로 표시한다.

뉴스지만 tracking이 없으면 정상적인 `tracking_not_present`, 비뉴스는 `not_applicable`로 처리한다. tracking 실패 항목에는 콘텐츠 유지와 현재 세션 결과 복사 안내를 표시한다. 결과는 새로고침 시 사라질 수 있으며 영구 job 이력, resume, 자동 retry, retry queue와 완전한 재실행 idempotency는 Phase 4A-4에서 구현한다.

### 12.5.4 Phase 4A-4 영구 작업 이력·resume·retry·idempotency

Dry Run 뒤 사용자가 선택을 확정하면 `import_jobs`, `import_job_items`, `import_job_item_attempts`에 작업, 불변 normalized execution snapshot과 단계별 시도 기록을 저장한다. canonical JSON과 Web Crypto SHA-256으로 bundle·item fingerprint를 만들며 object key 순서는 정규화하고 array 순서는 보존한다. 파일명은 동일 bundle 판정에 포함하지 않는다. 같은 사용자의 같은 bundle은 새 작업을 만들지 않고 기존 작업 상세로 연결한다.

작업 준비는 create → 최대 100개 item chunk append → finalize 순서다. 중단된 `preparing` job에는 같은 index·fingerprint chunk를 idempotent하게 다시 보낼 수 있고 다른 snapshot 충돌은 차단한다. `invalid`와 확정 `duplicate`는 execution snapshot으로 등록하지 않으며 warning은 승인 상태를 함께 고정한다. snapshot에는 owner, 인증 정보, 내부 post/topic/update/source ID, raw DB 오류와 stack trace를 넣지 않는다.

콘텐츠와 tracking stage는 각각 item row를 잠그는 전용 RPC로 실행한다. 콘텐츠 성공 후 필요한 tracking만 실행하고, tracking 실패는 콘텐츠 transaction을 되돌리지 않는다. 성공 stage 재호출은 새 row를 만들지 않고 기존 결과를 반환한다. 실패한 콘텐츠 retry는 콘텐츠 stage만, 실패한 tracking retry는 tracking stage만 실행한다. retry 가능 여부는 안전한 오류 mapping에 따라 결정하며 자동·무한 retry는 없다.

보호 경로 `/imports/history`와 `/imports/history/:jobId`에서 최근 100개 작업, DB 집계 진행률, item 상태, 안전한 마지막 오류, post 링크와 attempt 이력을 조회한다. 사용자는 pending 계속 실행, retry 가능한 전체·콘텐츠·tracking 실패 재시도, 안전한 취소와 취소 job 재개를 할 수 있다. 취소는 이미 성공한 단계를 유지하고 아직 시작하지 않은 단계만 `cancelled`로 바꾼다. 브라우저가 닫힌 동안 worker나 cron이 자동 실행하지 않으며, 새로고침 후 사용자가 상세 화면에서 다시 시작한다.

- 입력 모드 선택
  - ChatGPT 전체 응답
  - WordPress HTML
  - 수동 입력
- 붙여넣기
- 분석
- 미리보기
- 오류 수정
- 저장

## 12.6 뉴스 추적

목록 필터:

- 카테고리
- 상태
- 최근 확인일
- pending 체크리스트 여부

주제 상세:

- canonical title
- topic key
- 상태
- 최초·최근 확인일
- 연결된 브리핑
- 업데이트 이력
- 후속 체크리스트
- 종료·재개 처리

## 12.7 프롬프트 생성

- 카테고리 카드
- 최근 5·10·15개 선택
- 간단·표준·상세 모드
- 추가 지시 입력
- 생성
- 복사
- 생성 기록 보기

## 12.8 설정

- 카테고리명
- 코드
- wrapper
- ID 패턴
- slug 패턴
- 프롬프트 템플릿
- 요약 길이 제한
- 데이터 내보내기

---

## 13. 모바일·PWA 요구사항

- iPhone Safari에서 모든 핵심 기능 사용 가능
- 홈 화면에 추가 가능
- 세로 화면 기준 390px 폭에서 가로 스크롤 최소화
- 긴 HTML과 프롬프트는 접기·펼치기 또는 전체 화면 편집기 제공
- 복사 버튼은 화면 하단에서 쉽게 접근
- 표는 모바일에서 카드형 또는 가로 스크롤 처리
- 터치 대상 최소 크기 확보
- 앱 설치 여부와 무관하게 브라우저에서 동작
- 네트워크 연결이 없으면 읽기 전용 캐시 화면을 제공할 수 있으나, MVP에서 오프라인 수정은 제외
- 노트북이 꺼져도 배포된 앱은 정상 동작해야 함

---

## 14. 검증 규칙

검증은 `strict`와 `legacy` 두 모드를 사용한다.

- 신규 글과 ChatGPT 입력: `strict`
- 기존 WordPress 글 가져오기: `legacy`
- 치명적 오류: 두 모드 모두 저장 차단
- strict validation 완전 비활성화: MVP 제외

## 14.1 공통 HTML

- `<h1>` 존재
- 최상위 wrapper 존재
- wrapper가 등록된 값과 일치
- 마지막 wrapper 닫힘
- Markdown과 HTML 혼용 경고
- 인라인 `style` 속성 경고
- 등록되지 않은 class 경고
- 중복 id 경고
- 대표 이미지 프롬프트가 HTML 안에 있으면 경고
- 내부 링크 `<a>` 구조 검증

## 14.2 SEO

- 대표 제목 존재
- 대안 제목 4개
- 메타 설명 120~160자 경고
- slug 형식 검증
- 포커스 키워드 존재
- 태그 5~8개
- 금지 태그 차단
- 중복·유사 태그 경고

## 14.3 출처

- URL 형식 검증
- 출처명·제목·URL·확인한 핵심 내용 누락 차단
- 같은 게시물의 fragment 차이만 있는 중복 URL 차단
- 입력 순서를 `sort_order`로 보존
- 홈페이지 루트 URL 가능성 경고
- 확인한 핵심 내용 누락 경고

## 14.4 뉴스

- 브리핑 날짜 존재
- 표시 ID 존재
- 뉴스 항목 최소 1개
- 각 항목이 주제와 연결되었는지 확인
- 후속 뉴스는 이전 업데이트 연결 권장
- 종료 처리 시 종료 사유 필수

## 14.5 중국어 학습

- `series_no` 존재
- 별도 브리핑 ID 없음
- 프로그램명 존재
- 원문 제목 존재
- 개별 원문 URL 존재
- `ready`·`published`에서 게시·업데이트 시간 필수
- `cctv.com`, `cctv.cn` 또는 해당 하위 도메인의 루트가 아닌 개별 원문 URL 1개 이상 필수
- 본편 목록 포함 여부 기록
- 확인한 핵심 사실 존재

Phase 2B-2의 generic `sources`는 기관명·원문 제목·URL·게시 시각·확인 핵심 내용만 표현한다. 중국어 전용 프로그램명과 본편 목록 포함 여부는 `chinese_metadata`의 별도 필드이며 이번 단계의 출처 편집 UI에는 합쳐 저장하지 않는다.

---

## 15. 보안

- Supabase Auth 사용
- 모든 사용자 데이터에 `owner_id`
- RLS 활성화
- 사용자는 자신의 데이터만 조회·수정
- anon key만 프런트엔드에서 사용
- service role key 노출 금지
- HTML은 편집 화면에서 실행하지 않고 텍스트로 처리
- HTML 미리보기 사용 시 sanitization 적용
- 저장된 HTML을 React에 직접 렌더링할 때 DOMPurify 사용
- 외부 URL은 새 창 열기 전 검증
- DB 백업용 내보내기 파일에 인증 정보 포함 금지

---

## 16. 데이터 백업과 복구

### 16.1 Phase 4B-1 전체 JSON 백업

보호 경로 `/backups`와 `/backups/new`는 현재 인증 사용자의 데이터를 공식 JSON 형식으로 생성·다운로드한다. 백업은 다음 최상위 구조를 사용하며 외부 키는 camelCase다.

```json
{
  "format": "daily-brief-note-backup",
  "schemaVersion": 1,
  "profile": "core",
  "exportedAt": "2026-07-10T00:00:00Z",
  "appVersion": null,
  "manifest": {},
  "data": {
    "posts": [],
    "seoData": [],
    "tags": [],
    "postTags": [],
    "sources": [],
    "aiMetadata": [],
    "infoDbMetadata": [],
    "chineseMetadata": [],
    "seriesCounters": [],
    "newsTopics": [],
    "newsStatusHistory": [],
    "newsUpdates": [],
    "newsFollowups": [],
    "generatedPrompts": []
  },
  "checksum": { "algorithm": "SHA-256", "value": "..." }
}
```

- 기본 `core` profile은 콘텐츠, SEO, 태그, 출처, category별 metadata, series counter, 뉴스 topic·상태 이력·update·followup, 생성 프롬프트를 포함한다.
- `full` profile은 `core`에 `importJobs`, `importJobItems`, `importJobItemAttempts`를 추가한다. normalized Import payload가 포함될 수 있음을 생성 전에 경고한다.
- 공용 `categories` 행 자체는 제외하고, 복원 시 설정 의미를 확인할 수 있도록 활성 여부와 관계없이 category ID·content group·이름·code·wrapper·ID/slug pattern·정렬·활성 상태를 manifest에 포함한다.
- 관계 복원에 필요한 내부 UUID와 timestamp는 보존하되 `owner_id`, 인증 정보, 비밀 키와 browser/local storage는 포함하지 않는다.
- DB RPC는 owner 입력을 받지 않고 `auth.uid()`를 사용하며, 한 data-bearing SQL statement의 일관된 snapshot에서 결정적으로 정렬된 결과를 반환한다. RLS는 계속 적용된다.
- 브라우저는 schema, 관계, 금지 key·token pattern을 검증한 뒤 checksum 필드를 제외한 canonical JSON의 SHA-256을 계산하고 즉시 같은 규칙으로 재검증한다.
- 예상 크기는 profile별 count로 안내한다. 최종 UTF-8 JSON이 20 MB 이상이면 경고하고 100 MB를 초과하면 다운로드를 만들지 않는다.
- 동일 생성 결과는 다시 생성하기 전까지 checksum·manifest 복사와 JSON 재다운로드에 재사용한다. 파일에는 UTF-8 BOM을 넣지 않는다.
- 파일명은 `daily-brief-note-backup-{profile}-YYYY-MM-DD-HHmmss.json`이며 시각은 `Asia/Seoul` 기준이다.
- 세부 형식과 결정적 정렬 규칙은 `docs/BACKUP_FORMAT.md`에서 관리한다.

CSV는 검토와 내보내기 전용이며 전체 관계 복원에 사용하지 않는다.

- 전체 JSON
- posts CSV
- news topics CSV
- followups CSV
- sources CSV

### 16.2 Phase 4B-2 복원 Dry Run과 호환성 검사

보호 경로 `/backups/restore`와 `/backups/restore/new`는 최대 100 MiB UTF-8 `.json` 파일 또는 JSON text 중 하나를 브라우저에서 읽고 공식 schema version 1 백업의 복원 가능성을 분석한다. 파일은 외부 서버로 업로드하지 않으며 입력 변경 시 이전 결과는 stale 처리하고 제거한다.

- checksum 필드를 제외한 canonical JSON을 Phase 4B-1과 같은 규칙으로 SHA-256 재계산한다. algorithm·hex 형식·값 불일치 또는 Web Crypto 미지원이면 DB 충돌 조회를 수행하지 않는다.
- core는 14개 필수 section, full은 여기에 세 Import operational section을 더한 17개 section을 독립 Zod schema로 검증한다. profile, section 목록, 실제 배열 길이, `sectionCounts`, `totalRecords`, generated prompt 수, category manifest 수와 operational flag를 재계산한다.
- 기존 관계 validator를 재사용하고 metadata/category 종류, news post/topic category, previous update, source/update post, 종료 주제와 pending followup, 순서·복합 관계 중복까지 다시 검사한다. 금지 key와 token pattern도 전체 입력에서 재검사한다.
- category row를 만들거나 수정하지 않는다. 백업 당시 manifest와 현재 설정의 ID·content group·code 차이는 복원 불가, 이름·wrapper·slug/display ID pattern·활성·정렬 차이는 경고로 기록한다.
- local 검증이 유효할 때만 현재 인증 사용자의 posts, tags, topics, prompts, Import jobs와 관계 후보를 실제 unique key 및 원 UUID 기준으로 조회한다. 조회는 명시적 projection, 기존 RLS와 100개 chunk를 사용하고 owner 인자를 받지 않으며 raw DB 오류를 노출하지 않는다.
- 후보는 `safe_new`, `exact_same`, `id_conflict`, `key_conflict`, `relation_conflict`, `missing_reference`로 결정적으로 분류한다. 이 단계에서는 새 UUID 또는 remap map을 만들지 않고 preserve·reuse·remap·conflict 개수와 안전한 reference만 기록한다.
- 결과는 `restorable`, `warning`, `not_restorable`로 분류한다. partial·unavailable DB 조회는 warning이며 Phase 4B-3의 계획 확정을 차단할 수 있도록 analysis에 남긴다.
- Phase 4B-3 입력용 restore analysis JSON에는 checksum fingerprint, schema/profile, category 차이, section·conflict count, conflict 목록, ID 정책 후보, DB 조회 상태, 관계·민감정보 검사와 권장 다음 작업을 포함한다. 전체 HTML, 전체 prompt text, normalized payload, token, owner ID와 raw 오류는 제외하며 영구 저장하지 않는다.

Phase 4B-2는 INSERT·UPDATE·DELETE, overwrite·upsert, category 생성, UUID remap 실행, transaction, restore job, resume·retry와 실제 복원을 포함하지 않는다. 실제 계획 선택과 반영은 Phase 4B-3 이후 별도 단계다.

### 16.3 Phase 4B-3 결정적 복원 계획

Dry Run 완료 후 같은 `/backups/restore` 화면에서 원본 bundle과 read-only DB lookup 결과를 메모리에서 재사용해 `daily-brief-note-restore-plan` schema version 1 파일을 만든다. 별도 restore job을 저장하거나 DB를 변경하지 않는다.

- 전역 정책은 ID 충돌 remap/block, 동일 데이터 reuse/skip, full operational history include/exclude, 비활성 category allow/block, pattern 차이에서 현재 설정 사용/block, timestamp 보존/DB 기본값 계획을 지원한다.
- record별 예외는 충돌 record에만 허용하며 key 불일치, broken relation과 category 의미 불일치는 강제로 block한다. overwrite, update, unique suffix, slug·series number·topic key 자동 변경은 없다.
- 새 row는 원 UUID를 preserve하고 원 ID만 충돌하면 고정 restore namespace와 `backup checksum:section:original UUID`를 입력으로 UUID v5 target을 만든다. remap target이 현재 DB와 충돌하면 계획을 block한다.
- ID map은 posts, tags, sources, news tracking, generated prompts와 full Import history의 source ID를 preserve·remap·reuse·skip target으로 연결한다. 관계 row는 이 target을 통해 해석한다. owner UUID는 포함하지 않는다.
- category는 UUID remap하지 않고 같은 ID·content group·code에만 mapping한다. name·wrapper·pattern·active 차이는 정책에 따른 warning/block이며 과거 slug·display ID·HTML을 변환하지 않는다.
- 실행 stage는 실제 FK에 맞춰 tags, posts, metadata, postTags, counter, news topics/history/updates, previous links, sources, followups, prompts, Import jobs/items/attempts 순서를 결정적으로 생성한다. previous update graph는 안정적인 topological sort를 사용하고 missing/self/장주기 cycle을 block한다.
- plan fingerprint는 backup checksum과 profile/schema, DB analysis fingerprint, category mapping, 정책, record action, ID map, stage와 summary의 canonical JSON SHA-256이다. `createdAt`은 입력에서 제외한다.
- 모든 source row action, target 해석, target 중복, preserve/remap 충돌, stage coverage, dependency 순서, previous DAG, category mapping, summary와 fingerprint를 검증한다. error 또는 block이 있거나 DB lookup이 partial/unavailable이면 plan status는 `blocked`다.
- 계획 JSON에는 전체 `htmlBody`, prompt text, normalized Import payload, owner ID, email, token과 raw DB 오류를 포함하지 않는다. 원본 backup은 별도 실행 입력으로 유지한다.
- blocked 또는 정책 변경으로 stale인 계획은 복사·다운로드할 수 없다. Phase 4B-4 실행 직전에 동일 DB conflict 분석을 다시 실행해야 한다.

실제 INSERT·UPDATE·DELETE, restore transaction/job, resume·retry와 rollback은 Phase 4B-4 범위다.

### 16.4 Git 관리 대상

Git에 저장:

- 애플리케이션 소스
- DB migration
- seed
- 테스트
- 프로젝트 문서
- `AGENTS.md`

Git에 저장하지 않음:

- `.env`
- 실제 사용자 콘텐츠 export
- Supabase 비밀 키
- 로컬 캐시

---

## 17. 권장 프로젝트 구조

```text
daily-brief-note-manager/
├─ AGENTS.md
├─ README.md
├─ docs/
│  ├─ PRODUCT_SPEC.md
│  ├─ DATABASE_SCHEMA.md
│  ├─ IMPORT_FORMAT.md
│  └─ PROMPT_RULES.md
├─ supabase/
│  ├─ migrations/
│  └─ seed.sql
├─ src/
│  ├─ app/
│  ├─ components/
│  ├─ features/
│  │  ├─ auth/
│  │  ├─ posts/
│  │  ├─ import/
│  │  ├─ seo/
│  │  ├─ sources/
│  │  ├─ news-tracking/
│  │  ├─ prompt-generator/
│  │  └─ settings/
│  ├─ lib/
│  │  ├─ supabase/
│  │  ├─ parsing/
│  │  ├─ validation/
│  │  └─ clipboard/
│  ├─ routes/
│  ├─ schemas/
│  ├─ types/
│  └─ test/
├─ public/
├─ .env.example
├─ package.json
├─ vite.config.ts
└─ tsconfig.json
```

---

## 18. 테스트 요구사항

### 18.1 단위 테스트

- wrapper 카테고리 판별
- h1 추출
- 뉴스 issue 추출
- 중국어 series_no 추출
- source-check 표 추출
- SEO 필드 파싱
- 태그 검증
- slug 생성
- display ID 생성
- 최근 5·10·15개 조회
- 프롬프트 길이 제한
- 종료 뉴스 포함
- pending 후속 체크리스트 포함

### 18.2 통합 테스트

- 로그인 후 콘텐츠 등록
- ChatGPT 응답 붙여넣기 → 미리보기 → 저장
- WordPress HTML 붙여넣기 → 자동 분류
- 뉴스 주제 신규 생성 및 기존 주제 연결
- 후속 체크리스트 완료
- 뉴스 상태 종료 및 재개
- 프롬프트 생성·복사
- JSON 내보내기·가져오기

### 18.3 E2E 테스트

- 데스크톱 Chrome
- iPhone Safari 크기
- PWA 설치 상태
- 노트북과 iPhone 간 동일 데이터 확인
- 노트북 전원과 무관한 클라우드 접속 검증

---

## 19. 구현 단계

## Phase 0. 저장소 초기화

- Vite + React + TypeScript 생성
- lint·format·test 설정
- Supabase 프로젝트 연결
- 환경 변수 템플릿
- `AGENTS.md`
- 기본 라우팅과 레이아웃

완료 조건:

- 로컬 실행
- production build 성공
- 테스트 명령 실행 가능

## Phase 1. 인증·DB

- Supabase Auth
- 전체 migration
- RLS
- category seed
- typed DB client

완료 조건:

- 로그인
- 사용자별 데이터 분리
- seed 카테고리 조회

## Phase 2. 콘텐츠 CRUD

- 대시보드
- 목록
- 등록·수정·삭제
- SEO·태그·출처·이미지 프롬프트
- 카테고리별 메타데이터

완료 조건:

- 네 종류 콘텐츠 저장
- 중국어 학습은 브리핑 ID 없이 저장
- 이미지 파일 필드가 존재하지 않음

## Phase 3. 가져오기와 파서

- ChatGPT 응답 파서
- WordPress HTML DOM 파서
- 미리보기
- 검증
- 중복 검사

완료 조건:

- 각 wrapper 샘플 자동 분류
- 파싱 실패 필드를 수동 수정 가능
- 저장 전 검토 필수

## Phase 4. 뉴스 추적

- news topics
- updates
- followups
- status history
- 종료·재개

완료 조건:

- 한 주제가 여러 브리핑에 연결
- 이전 업데이트 연결
- 종료 뉴스와 pending 항목 조회

## Phase 5. 프롬프트 생성기

- 카테고리 선택
- 5·10·15개 선택
- 프롬프트 모드
- 복사
- 생성 기록

완료 조건:

- 글이 부족하면 있는 만큼 사용
- 최근 요약·후속 체크리스트·종료 뉴스 포함
- HTML 전문 미포함
- 프로젝트 규칙 포함

## Phase 6. 모바일·배포·백업

- 반응형
- PWA
- Vercel 배포
- JSON·CSV 내보내기
- 문서화

완료 조건:

- iPhone에서 조회·수정
- 노트북이 꺼진 상태에서도 사용
- production URL에서 정상 동작

---

## 20. Codex 작업 지침

저장소 루트에 `AGENTS.md`를 만든다.

권장 내용:

```md
# AGENTS.md

## Project
Build the Daily Brief Note content management web app according to `docs/PRODUCT_SPEC.md`.

## Required stack
- React
- Vite
- TypeScript
- Supabase PostgreSQL/Auth
- PWA
- Zod validation

## Non-negotiable rules
- Do not add image upload or image storage.
- Store only image prompt and image ALT text.
- Chinese study posts do not have a briefing ID.
- Use `series_no` for Chinese study posts.
- Do not hard-code category wrapper, slug, or display ID patterns; load them from category settings.
- Use DOMParser for WordPress HTML parsing. Do not parse HTML solely with regex.
- Do not store source article full text or CCTV full transcripts.
- All database changes must be migrations.
- Enable RLS for user-owned tables.
- Use mobile-first layouts.
- Never expose Supabase service role keys.
- Sanitize HTML previews.

## Validation
Before completing a task, run:
- npm run lint
- npm run test
- npm run build

## Workflow
1. Read the product specification and related docs.
2. Write or update tests before finishing a feature.
3. Keep changes scoped to the requested phase.
4. Report migrations, tests, and remaining limitations.
```

Codex에는 한 번에 전체 앱 구현을 요청하지 말고 Phase 단위로 작업을 맡긴다.

---

## 21. Codex 시작 프롬프트

```text
이 저장소의 AGENTS.md와 docs/PRODUCT_SPEC.md를 먼저 읽어라.

Phase 0과 Phase 1만 구현하라.

목표:
1. React + Vite + TypeScript 프로젝트 초기화
2. Supabase 연결 구조 작성
3. 데이터베이스 migration 작성
4. categories seed 작성
5. 이메일 로그인 화면 작성
6. 모든 사용자 소유 테이블에 RLS 적용
7. 기본 대시보드 라우트 작성
8. 테스트·lint·build 설정

중요 제약:
- 이미지 업로드와 이미지 저장 기능을 만들지 않는다.
- image_prompt와 image_alt만 데이터 모델에 포함한다.
- 중국어 학습은 briefing ID가 없고 series_no만 사용한다.
- wrapper, slug pattern, display ID pattern은 categories 설정으로 관리한다.
- service role key를 프런트엔드에 사용하지 않는다.
- 작업 완료 후 실행한 테스트와 남은 작업을 요약한다.
```

Phase 2부터는 해당 Phase의 완료 조건만 별도 프롬프트로 전달한다.

---

## 22. MVP 완료 판정

다음 조건을 모두 충족하면 MVP 완료로 본다.

- [ ] 노트북과 iPhone에서 동일 계정으로 접속 가능
- [ ] 노트북이 꺼져도 iPhone에서 앱 사용 가능
- [ ] 네 콘텐츠 그룹 등록·조회·수정 가능
- [ ] 뉴스 5개 하위 카테고리 분류 가능
- [ ] 기존 WordPress HTML을 붙여넣어 자동 분류 가능
- [ ] ChatGPT 응답을 붙여넣어 저장 가능
- [ ] SEO 제목·대안 제목·메타 설명·키워드·태그 저장 가능
- [ ] 출처 저장 가능
- [ ] 이미지 프롬프트와 ALT만 저장
- [ ] 이미지 파일 업로드 기능 없음
- [ ] 중국어 학습에 브리핑 ID 없음
- [ ] 뉴스 주제를 여러 브리핑에 연결 가능
- [ ] 후속 체크리스트를 pending·done으로 관리 가능
- [ ] 종료된 뉴스를 기록하고 재개 가능
- [ ] 뉴스 카테고리별 최근 5·10·15개 프롬프트 생성 가능
- [ ] 저장 글이 요청 수보다 적으면 있는 만큼 사용
- [ ] 생성 프롬프트에 최근 요약·후속 체크리스트·종료 뉴스 포함
- [ ] 프롬프트를 한 번에 클립보드로 복사 가능
- [ ] 데이터 JSON·CSV 내보내기 가능
- [ ] lint·test·build 통과
- [ ] production 배포 완료

---

## 23. 구현 시 주의할 충돌 사항

프로젝트 문서와 최근 실제 운영 규칙 사이에 다음 차이가 있을 수 있다.

- 과학기술 slug:
  - 폐기된 과거값: `science-tech-briefing-YYYY-MM-DD`
  - 현재 운영값: `technology-briefing-YYYY-MM-DD`
- 환경 slug:
  - 폐기된 과거값: `environment-briefing-YYYY-MM-DD`
  - 현재 운영값: `climate-energy-briefing-YYYY-MM-DD`
- 중국어 학습 slug:
  - 폐기된 과거값: `cctv-chinese-news-study-###`
  - 현재 운영값: `cctv-chinese-news-###`
- 뉴스 ID:
  - `NEWS-YYYYMMDD-CODE`
  - `#YYYY-MM-DD-CODE`

따라서 구현 원칙은 다음과 같다.

1. 어떤 형식도 코드에 고정하지 않는다.
2. `categories` 설정과 seed에서 관리한다.
3. 이미 발행된 글의 slug와 ID는 그대로 보존한다.
4. 신규 생성 기본값은 `technology-briefing-YYYY-MM-DD`, `climate-energy-briefing-YYYY-MM-DD`, `cctv-chinese-news-###`인 현재 운영값을 사용한다.
5. 설정 변경은 과거 글을 자동 변경하지 않는다.

이 방식이면 프로젝트 규칙이 변경되어도 과거 콘텐츠 데이터를 다시 쓰지 않고 category seed와 필요한 forward migration으로 설정만 수정할 수 있다.

## Phase 4B-4A 실제 core 복원

- 실제 실행은 원본 `daily-brief-note-backup`과 분리된 `daily-brief-note-restore-plan` 두 파일을 요구한다.
- checksum, plan fingerprint, profile, section reference, category 의미와 현재 DB 충돌을 실행 직전에 다시 검사한다.
- 영구 restore job은 불변 record snapshot과 attempt를 저장하고 stage barrier에 따라 브라우저에서 순차 실행한다.
- 각 record는 독립 transaction이다. 실패 stage 이전의 성공 record는 유지되며 자동 rollback이나 restore undo는 없다.
- 새로고침 후 DB 상태에서 resume하고 retry 가능한 현재 stage 실패만 사용자가 수동 retry한다. 브라우저 종료 중에는 실행하지 않는다.
- 취소는 pending record만 취소하며 성공 row를 제거하지 않는다. 재개는 새 target 충돌을 다시 검사한다.
- preserve, UUID v5 remap, exact reuse, exact skip만 실행하며 기존 row overwrite와 일반 update를 지원하지 않는다.
- 예외적 update는 series counter의 단조 증가와 이 job이 생성한 update의 previous link 완성이다.
- `full` backup도 Import job·item·attempt는 제외 정책인 ready 계획만 실행한다. 운영 이력 복원은 Phase 4B-4B 범위다.

## Phase 4B-4B full Import 운영 이력 복원

- `full` backup과 `operationalHistory: include`인 ready 계획은 core stage 완료 뒤 `importJobs`, `importJobItems`, `importJobItemAttempts`를 순서대로 실행한다. `core` profile의 include와 section/action/parent mapping이 불완전한 계획은 차단한다.
- 운영 row는 원 UUID preserve 또는 결정적 UUID v5 remap으로 생성한다. 기존 row는 source fingerprint와 핵심 metadata·payload·상태·관계·시각이 exact match일 때만 reuse하며 overwrite·merge·suffix 생성은 하지 않는다.
- normalized payload는 원문 그대로 보존하되 fingerprint, 지원 schema, category/content/tracking 구조, 크기·깊이·문자열 제한, prototype pollution 및 인증·SQL·raw 오류 금지 key를 실행 전에 다시 검증한다.
- 신규 복원 Import job은 원 status·집계·시각을 보존하고 `restored_from_backup=true`, `execution_locked=true`, `restore_origin_checksum=<backup checksum>`으로 저장한다. 기존 exact reuse job의 provenance, 잠금, status와 timestamp는 변경하지 않는다.
- 잠긴 Import job은 조회·필터·안전한 결과 복사와 생성 게시물 링크만 허용한다. content/tracking 실행, retry, pending 계속 실행, cancel, resume, item append와 finalize는 status와 무관하게 `IMPORT_JOB_EXECUTION_LOCKED`로 거부한다.
- 운영 이력 record도 record별 transaction, stage barrier, 수동 retry, 취소·재개와 idempotency를 따른다. 운영 stage 실패는 restore job을 `paused_with_errors`로 만들지만 완료된 core row를 rollback하지 않는다.
- 기존 schema version 1 full backup은 provenance 필드가 없어도 false·false·null로 해석한다. 새 백업은 세 필드를 명시한다. 복원 이력의 live resume는 향후 별도 schema version과 forward migration에서만 재검토한다.

## Phase 4C-1 route 단위 lazy loading과 초기 bundle 분리

- 앱 entry, `RouterProvider`, `AuthProvider`, 인증 session 초기화, `PublicOnlyRoute`, `RequireAuth`, `AppLayout`, 공통 route loading/error fallback과 NotFound는 eager shell로 유지한다.
- 로그인과 보호 page는 React Router `route.lazy`로 실제 `src/pages/*Page` 파일을 직접 동적 import한다. page 또는 feature barrel과 동적 문자열 경로는 사용하지 않는다.
- `/`의 인증 후 `/dashboard` redirect, 보호 route의 `/login` redirect, 중첩 `Outlet`, params·search params, 직접 URL 진입, 새로고침과 browser history 계약은 유지한다.
- lazy page를 준비하는 동안 `role="status"`와 한국어 안내를 표시한다. chunk load 실패는 raw 오류·chunk URL·내부 path를 노출하지 않고 새로고침과 대시보드 이동을 안내하며 자동 reload하지 않는다.
- Backup·Restore·Import page와 해당 대형 feature dependency는 초기 entry에서 분리한다. feature 내부 세부 분리와 vendor/manual chunk 최적화는 Phase 4C-2 범위다.
- PWA generateSW와 navigation fallback 정책은 변경하지 않는다. lazy chunk가 precache되어도 초기 parse·execution 분리는 유지하며 전체 다운로드 정책 조정은 후속 범위다.
- Phase 4C-0 baseline entry는 1,078.60 kB(gzip 292.41 kB), Phase 4C-1 entry는 521.11 kB(gzip 151.16 kB)다. minified entry는 약 51.7% 감소했고 gzip 170 kB 목표를 충족했다.
- entry가 아직 500 kB를 21.11 kB 초과하므로 Vite chunk 경고는 남는다. vendor와 공통 dependency 분석은 Phase 4C-2, bundle budget과 성능 회귀 gate는 Phase 4C-3에서 수행한다.
