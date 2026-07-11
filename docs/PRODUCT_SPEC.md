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
slug: cctv-chinese-news-study-012
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
| 중국어 학습 | CHINESE | 없음 | `cctv-chinese-news-study-###` | `daily-brief-note chinese-study` |

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

`topic_key`는 수동 지정 가능하며 카테고리 내 unique를 권장한다.

DB에서는 `unique (owner_id, category_id, topic_key)`로 강제한다.

예:

```text
semiconductor-export-controls-2026
korea-base-rate-july-2026
eu-ai-act-enforcement
```

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
prompt_text        text
is_pinned          boolean default false
generated_at       timestamptz
```

사용자·카테고리별 미고정 기록을 최근 30개까지 보존한다. `is_pinned = true`인 기록은 자동 삭제와 30개 계산에서 제외한다. PostgreSQL DB 함수가 기록 저장과 오래된 미고정 기록 정리를 하나의 트랜잭션에서 처리한다.

`requested_post_count`에는 사용자가 요청한 최근 글 수를 저장한다. `actual_post_count`에는 실제 프롬프트에 사용한 글 수를 저장한다. `prompt_text`에는 WordPress HTML 전문, 뉴스 기사 원문, CCTV 원문·전체 자막·전체 번역을 포함하지 않는다.

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

### 16.1 기본 백업

JSON은 전체 복원용이며 초기 형식은 다음과 같다.

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-07-10T00:00:00Z",
  "data": {
    "posts": [],
    "seo_data": [],
    "tags": [],
    "post_tags": [],
    "sources": [],
    "ai_metadata": [],
    "info_db_metadata": [],
    "chinese_metadata": [],
    "series_counters": [],
    "news_topics": [],
    "news_updates": [],
    "news_followups": [],
    "news_status_history": [],
    "generated_prompts": []
  }
}
```

- `schemaVersion` 초기값은 정수 `1`이다.
- 공용 seed인 `categories`는 기본 백업에서 제외한다.
- 인증 정보와 비밀 키는 포함하지 않는다.
- 관계 복원에 필요한 사용자 데이터의 ID는 포함한다.

CSV는 검토와 내보내기 전용이며 전체 관계 복원에 사용하지 않는다.

- 전체 JSON
- posts CSV
- news topics CSV
- followups CSV
- sources CSV

### 16.2 복구

- JSON 가져오기
- 저장 전 dry-run과 중복 검사
- 항목별 `insert`, `skip`, `update` 선택
- `update`는 `id`, `owner_id`, `created_at`을 변경하지 않음
- 실제 반영 전 dry-run 결과 확인과 명시적 실행
- 가져오기 결과 로그 표시

### 16.3 Git 관리 대상

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
  - `science-tech-briefing-YYYY-MM-DD`
  - `technology-briefing-YYYY-MM-DD`
- 환경 slug:
  - `environment-briefing-YYYY-MM-DD`
  - `climate-energy-briefing-YYYY-MM-DD`
- 뉴스 ID:
  - `NEWS-YYYYMMDD-CODE`
  - `#YYYY-MM-DD-CODE`

따라서 구현 원칙은 다음과 같다.

1. 어떤 형식도 코드에 고정하지 않는다.
2. `categories` 설정과 seed에서 관리한다.
3. 이미 발행된 글의 slug와 ID는 그대로 보존한다.
4. 신규 생성 기본값은 현재 운영값을 사용한다.
5. 설정 변경은 과거 글을 자동 변경하지 않는다.

이 방식이면 프로젝트 규칙이 변경되어도 DB migration 없이 설정만 수정할 수 있다.
