# Daily Brief Note 가져오기 형식

## 1. 문서 목적과 범위

이 문서는 `docs/PRODUCT_SPEC.md`에 정의된 기존 WordPress 글, ChatGPT 응답, 수동 입력, 백업 JSON 가져오기의 MVP 입력·파싱·검토 규칙을 정리한다.

MVP에서는 다음을 하지 않는다.

- WordPress 사이트 자동 크롤링
- WordPress REST API 자동 발행
- ChatGPT API 직접 호출 또는 자동 입력
- 뉴스 기사 전문, CCTV 원문 전문, 전체 자막 저장
- 이미지 파일 업로드 또는 저장

## 2. 공통 처리 흐름

모든 가져오기는 다음 순서를 지킨다.

```text
입력
→ Parse
→ Detect
→ Validate
→ Preview
→ 사용자 수정
→ 명시적 저장
```

- 파싱 직후 DB에 저장하지 않는다.
- 누락, 오분류, 파싱 실패는 필드별 경고로 표시한다.
- 사용자가 미리보기에서 수정한 뒤 `저장`을 눌러야 반영한다.
- 원본 WordPress HTML은 사용자가 정규화를 요청하지 않는 한 보존한다.
- 미리보기 HTML은 신뢰하지 않는 입력으로 취급해 sanitize하며 script와 event handler를 실행하지 않는다.

## 3. 입력 모드

가져오기 화면은 다음 입력 모드를 지원한다.

1. ChatGPT 전체 응답
2. WordPress HTML
3. 수동 입력
4. 백업 JSON 가져오기

저장 시 `posts.source_import_type`은 각각 다음 값 중 하나를 사용한다.

- `chatgpt_paste`
- `wordpress_manual`
- `manual_entry`
- `json_import`

### 3.1 Phase 4A-1 게시물 Import bundle

Phase 4A-1의 공식 콘텐츠 Import 식별자는 `daily-brief-note-content-import`, schema version은 정수 `1`이다. 외부 JSON은 camelCase만 사용하며 다음 strict 최상위 구조를 사용한다.

```json
{
  "format": "daily-brief-note-content-import",
  "schemaVersion": 1,
  "exportedAt": "2026-07-13T00:00:00Z",
  "source": "manual-export",
  "validationMode": "strict",
  "posts": []
}
```

- `format`: 필수. `daily-brief-note-content-import`만 지원하며 누락된 legacy bundle과 다른 format은 허용하지 않는다.
- `schemaVersion`: 필수. 현재는 `1`만 지원하며 다른 version을 추측 변환하지 않는다. v1 필드의 의미는 이후 변경하지 않고 비호환 변경은 v2에서만 수행한다.
- `posts`: 필수이며 비어 있지 않은 배열이다. 최대 2,000개다.
- `exportedAt`, `source`: 선택 필드다.
- `validationMode`: 선택 필드이며 `strict` 또는 `legacy`다. 생략하면 `strict`다.
- 위에 정의한 필드 외의 최상위 필드는 strict schema 오류다.
- 별도의 begin/end marker는 게시물 JSON 파일에 사용하지 않는다. Section marker는 5절의 ChatGPT 구조화 응답에만 적용한다.

게시물 object는 다음 camelCase 구조를 사용한다.

```json
{
  "externalKey": "economy-2026-07-13",
  "categoryId": "economy",
  "title": "제목",
  "summary": "요약",
  "slug": "economy-briefing-2026-07-13",
  "status": "published",
  "briefingDate": "2026-07-13",
  "publishedOn": "2026-07-13",
  "publishedAt": null,
  "displayId": "#2026-07-13-ECO",
  "seriesNo": null,
  "wordpressUrl": null,
  "htmlBody": "<div class=\"daily-brief-note news-briefing economy\">...</div>",
  "seo": {
    "representativeTitle": "대표 제목",
    "alternativeTitles": ["대안 1", "대안 2", "대안 3", "대안 4"],
    "metaDescription": "메타 설명",
    "focusKeyword": "포커스 키워드"
  },
  "image": { "prompt": "대표 이미지 프롬프트", "alt": "이미지 ALT" },
  "tags": ["태그1", "태그2", "태그3", "태그4", "태그5"],
  "sources": [{
    "sourceName": "기관명",
    "sourceTitle": "자료 제목",
    "sourceUrl": "https://example.com/article",
    "sourcePublishedAt": null,
    "checkedPoint": "확인한 핵심 내용"
  }],
  "metadata": null,
  "newsTracking": { "topicKey": "stable-topic-key", "updates": [], "followups": [] }
}
```

카테고리별 `metadata`는 다음을 사용한다.

- AI: `fieldName`, `difficulty`, `estimatedReadMin`
- 정보DB: AI 필드와 nullable `referenceDate`
- 중국어 학습: `learningTopic`, `programName`, `originalTitle`, `originalUrl`, `originalPublishedAt`, `episodeListIncluded`, `verifiedCoreFact`, 선택 `difficulty`, `learningPoints`
- 뉴스: `metadata`는 `null`로 두며 추적 구조가 있으면 `newsTracking`에서 구조만 검증한다. post와 topic을 같은 entity로 취급하지 않으며 Phase 4A-1은 topic/update/followup을 저장하지 않는다.

뉴스는 `briefingDate`와 카테고리 설정의 `displayId`를 사용하고 `seriesNo`를 사용하지 않는다. AI·정보DB·중국어 학습은 `seriesNo`를 사용한다. 중국어 학습은 `displayId`를 사용하지 않는다. 카테고리 wrapper, display ID와 slug는 현재 category 설정으로 검증하며 과거 레코드를 다시 쓰지 않는다.

파일은 UTF-8 `.json`만 허용하고 BOM을 제거한다. 최대 크기는 20 MB다. `__proto__`, `constructor`, `prototype`, 30단계를 넘는 중첩과 5 MB를 넘는 단일 문자열을 차단한다. HTML은 실행하거나 기본 화면에 렌더링하지 않는다.

`strict`는 신규 입력의 전체 template class 정책을 적용한다. `legacy`는 미등록 class와 inline style을 경고로 낮출 수 있지만 script, iframe, event handler, `javascript:` URL, wrapper·h1 누락과 닫히지 않은 wrapper 같은 치명적·보안 오류는 차단한다. strict validation을 비활성화하지 않는다.

Dry Run 상태는 `ready`, `warning`, `invalid`, `duplicate`다. 결과는 영구 저장하지 않으며 실제 INSERT·UPDATE·DELETE, 자동 수정, 외부 URL fetch와 AI 의미 중복 판정을 수행하지 않는다. DB exact duplicate 후보는 slug, WordPress URL, 뉴스의 category·briefing date unique key, category·series number, 뉴스 topic key, 중국어 normalized original URL처럼 실제 DB unique 정책에 정의된 값만 사용한다. 문자열 후보는 trim하고 빈 값과 중복을 제거한 뒤 최대 100개씩 RLS 범위의 제한 projection batch query로 순차 조회한다. item별 N+1 query, `select('*')`, `owner_id` 입력과 무제한 `Promise.all`은 사용하지 않는다.

DB 중복 조회 상태는 `complete`, `partial`, `unavailable`로 유지한다. 하나의 chunk라도 실패하면 `complete`가 아니며, 성공한 chunk 결과는 결정적으로 병합한다. Phase 4A-1 Dry Run은 `partial`에 `DB_DUPLICATE_CHECK_PARTIAL`, `unavailable`에 `DB_DUPLICATE_CHECK_UNAVAILABLE` warning을 표시하고 구조 검증을 계속한다. 이후 실제 Import 단계는 이 상태가 `complete`가 아니면 저장을 차단할 수 있다.

13절의 전체 백업 schema는 최상위 `data` 아래에 관계형 배열을 두는 복구 전용 형식이다. 최상위 `data`가 있거나 `format`이 backup bundle을 식별하면 `BACKUP_BUNDLE_NOT_SUPPORTED`로 차단한다. 게시물 Import bundle의 최상위 `posts`와 다르며 실제 복구는 Phase 4A-2 이후 범위다.

## 4. 기존 WordPress 글 수동 가져오기

### 4.1 입력 항목

- 카테고리
- WordPress URL
- 발행일
- SEO 대표 제목
- SEO 대안 제목 4개
- 메타 설명
- 포커스 키워드
- SEO 태그
- WordPress 본문 HTML
- 대표 이미지 프롬프트
- 이미지 ALT 문구

### 4.2 작업 흐름

```text
WordPress 글 편집 화면
→ 코드 편집기에서 HTML 복사
→ 가져오기 화면에 붙여넣기
→ 자동 분석
→ 추출 결과 미리보기
→ 누락·오분류 수동 수정
→ 저장
```

## 5. ChatGPT 구조화 응답

시작·종료 태그가 있는 다음 구조화 JSON 형식을 우선 파싱한다.

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

이 저장용 블록은 WordPress에 게시하는 본문과 별개다. `[WORDPRESS_HTML] ... [/WORDPRESS_HTML]`에는 WordPress 본문용 단일 HTML 블록만 둔다.

`CONTENT_META_JSON`, `SEO_JSON`, `IMAGE_PROMPT_JSON`, `SOURCES_JSON`, `NEWS_TRACKING_JSON`은 표준 JSON이어야 한다. 주석, trailing comma, HTML을 담은 JSON 문자열은 허용하지 않는다.

구조화 블록에 없는 필드는 `[WORDPRESS_HTML]`의 DOM 구조에서 추출하고 미리보기에서 사용자가 보완한다. MVP의 구조화 형식은 위에 정의된 키만 필수 지원 대상으로 삼으며, 카테고리별 메타데이터는 DOM 추출 또는 수동 입력으로 보완한다.

### 5.1 JSON 키와 DB 컬럼 매핑

JSON 입력 키는 camelCase를 사용한다. DB 컬럼은 snake_case를 유지하며 저장 전 파서가 다음처럼 매핑한다.

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

## 6. ChatGPT 비구조화 응답

기존 프로젝트 출력 순서도 지원한다.

1. SEO 입력용 대표 제목
2. SEO 대안 제목 4개
3. 메타 설명
4. URL slug
5. 포커스 키워드
6. SEO 태그
7. WordPress 본문용 HTML
8. 대표 이미지 프롬프트
9. 이미지 ALT 문구
10. 발행 전 체크리스트

파싱 우선순위:

1. 유효한 JSON 블록
2. 명시적 `[SECTION]` 구분자
3. HTML wrapper와 DOM 구조
4. 제목 패턴
5. 수동 수정

상위 단계에서 값을 찾았더라도 하위 단계의 값과 충돌하면 자동 확정하지 않고 후보와 경고를 표시한다.

## 7. HTML 파싱 및 카테고리 감지

### 7.1 파싱 방식

- 브라우저 `DOMParser`를 사용한다.
- HTML 전체 구조를 정규표현식만으로 파싱하지 않는다.
- 정규표현식은 제목의 중국어 시리즈 번호처럼 작고 정규화된 텍스트 필드에만 사용할 수 있다.
- 동일 selector가 여러 번 발견되면 첫 번째 값을 자동 확정하지 않는다.
- 발견된 값들을 후보로 표시하고 중복 selector 경고를 제공한다.
- 제목, 카테고리, slug 등 저장에 필요한 필수 필드가 모호하면 사용자가 하나를 확정할 때까지 저장을 차단한다.

### 7.2 wrapper 감지

실제 허용 wrapper는 카테고리 설정에서 읽는다. 초기 지원값은 다음과 같다.

| wrapper | 카테고리 |
|---|---|
| `daily-brief-note news-briefing economy` | 경제 |
| `daily-brief-note news-briefing global` | 국제 |
| `daily-brief-note news-briefing technology` | 과학기술 |
| `daily-brief-note news-briefing society` | 사회 |
| `daily-brief-note news-briefing climate-energy` | 환경·에너지 |
| `daily-brief-note ai-column` | AI 칼럼 |
| `daily-brief-note info-db` | 정보DB |
| `daily-brief-note chinese-study` | 중국어 학습 |

선택한 카테고리와 감지한 wrapper가 다르면 저장 전 오류 또는 경고로 표시하고 사용자가 수정하게 한다.

strict validation의 허용 class는 등록된 Daily Brief Note HTML 템플릿과 스타일 가이드의 class 목록을 기준으로 한다. wrapper 값은 `categories.wrapper_class`에서 읽는다. 새 class를 가져오기 과정에서 자동 등록하지 않는다.

## 8. HTML 필드 추출

### 8.1 공통 추출

| HTML 위치 | 추출 후보 |
|---|---|
| 첫 번째 `<h1>` | `title` |
| `.intro` | 도입문 |
| `.summary-box` | `summary` |
| `.brief-meta` | 작성일, 작성 기준, 표시 ID |
| `#sources`, `#source-check` | 출처 |
| 이전 콘텐츠 섹션의 `<a>` | 내부 링크 참고 정보 |
| `.content-note` | 템플릿 검증 |
| 최상위 wrapper와 마지막 닫는 태그 | HTML 무결성 |

### 8.2 뉴스 추가 추출

| HTML 위치 | 추출 후보 |
|---|---|
| `section[id^="issue-"]` | 뉴스 항목 |
| 각 이슈의 `<h2>` | `headline` |
| `무엇이 있었나` 뒤 문단 | `fact_summary` |
| `왜 중요한가` 뒤 문단 | `importance_summary` |
| `우리에게 미치는 영향` 뒤 문단 | `impact_summary` |
| `앞으로 볼 포인트` 뒤 문단 | 후속 체크리스트 |
| `.update-label` | 신규·후속 여부, 이전 브리핑 ID |
| `#change-log` | 신규·후속·제외 이력 |
| `#watch-points` | 공통 후속 체크리스트 |

추출된 뉴스 항목은 저장 전에 기존 주제와 연결할지 새 주제를 만들지 사용자가 검토한다. 표현만 다른 동일 보도를 자동으로 새 주제로 확정하지 않는다.

### 8.3 중국어 학습 추가 추출

| 입력 위치 | 추출 후보 |
|---|---|
| 제목의 `#번호` | `series_no` |
| `#source-check` 표 | 프로그램명, 원문 제목, 시간, URL, 본편 목록 포함 여부, 확인 내용 |

- 브리핑 ID는 추출하거나 생성하지 않는다.
- CCTV 개별 기사 또는 영상 URL을 사용한다.
- 원문 전문, 전체 자막, 전체 번역은 저장하지 않는다.

## 9. 날짜와 시간대

- 날짜-only 입력은 PostgreSQL `date` 대상 필드에 그대로 매핑한다.
- 시각 입력은 `timestamptz` 대상 필드에 매핑한다.
- 앱의 기본 시간대는 `Asia/Seoul`이다.
- 시간대 정보가 없는 일반 시각은 `Asia/Seoul`로 해석한다.
- CCTV 원문의 게시·업데이트 시각은 `Asia/Shanghai`로 해석한 뒤 `timestamptz`로 저장한다.
- 날짜-only 값을 임의로 UTC 자정으로 변환하지 않는다.
- 날짜만 확인된 발행 정보는 `publishedOn`으로 입력하고 `posts.published_on`에 저장한다.
- 정확한 발행 시각이 확인된 경우에만 `publishedAt`으로 입력하고 `posts.published_at`에 저장한다.
- `publishedAt`처럼 시각 필드에 날짜-only 값만 들어오면 임의의 시각을 만들지 않고 `publishedOn` 후보로 표시한다.

## 10. 저장 전 미리보기

다음을 표시하고 사용자가 수정할 수 있게 한다.

- 분류된 카테고리
- 제목
- 표시 ID 또는 시리즈 번호
- slug
- 요약
- SEO 정보
- 태그 개수
- 출처
- 뉴스 주제 연결
- 후속 체크리스트
- 이미지 프롬프트와 ALT
- HTML 검증 오류

## 11. 검증 규칙

### 11.1 WordPress HTML

- 최상위 Daily Brief Note wrapper가 정확히 하나인지 확인
- `<h1>` 존재
- wrapper가 선택한 카테고리 설정과 일치
- 최상위 wrapper가 닫혀 있음
- Markdown과 HTML 혼용 경고
- inline `style` 경고
- 중복 HTML `id` 경고
- strict validation 시 등록되지 않은 class 경고
- 대표 이미지 프롬프트가 HTML 안에 있으면 경고
- 내부 링크 `<a>` 구조 검증

### 11.2 SEO와 태그

- 대표 제목 존재
- 대안 제목 4개
- 메타 설명 120~160자 경고
- slug 형식 검증
- 포커스 키워드 존재
- 태그 5~8개
- 카테고리명 태그 금지
- `Daily Brief Note`, `DailyBriefNote` 태그 금지
- 정확히 같은 태그 금지
- 정규화된 유사 태그 경고

### 11.3 출처

- URL 형식 검증
- 출처명, 제목, URL 누락 경고
- 홈페이지, 검색, 목록 URL 가능성 경고
- 확인한 핵심 내용 누락 경고

### 11.4 뉴스

- 브리핑 날짜 존재
- 표시 ID 존재
- 뉴스 항목 최소 1개
- 각 항목의 뉴스 주제 연결 확인
- 후속 뉴스의 이전 업데이트 연결 권장
- 종료 처리 시 종료 사유 필수

### 11.5 중국어 학습

- `series_no` 존재
- 별도 브리핑 ID 없음
- 프로그램명과 원문 제목 존재
- 개별 원문 URL 존재
- 게시·업데이트 시간 존재 또는 누락 경고
- 본편 목록 포함 여부 기록
- 확인한 핵심 사실 존재

## 12. 중복 검사

저장 전에 다음 순서로 검사한다.

1. 같은 WordPress URL
2. 같은 slug
3. 같은 표시 ID
4. 같은 카테고리와 발행일
5. 정규화한 제목의 완전 일치
6. 뉴스의 같은 `topic_key`

중복을 자동으로 덮어쓰지 않는다. 다음 선택지를 제공한다.

- 기존 글 열기
- 기존 글 수정
- 새 버전으로 저장하지 않고 취소
- 후속 뉴스로 연결

AI·정보DB·중국어 학습에서는 최근 컨텍스트 개수와 관계없이 해당 사용자의 전체 데이터에서 다음 값을 검사한다.

- 정규화한 exact title
- slug
- focus keyword
- 중국어 학습 `original_url`

중국어 학습의 동일 `original_url`은 경고만 표시하지 않고 저장을 차단한다.

## 13. 백업과 복구

### 13.1 JSON

JSON은 전체 복원용 형식이며 최상위 `schemaVersion`의 초기값은 `1`이다.

초기 백업 JSON은 `data` 아래에 `posts`, `seo_data`, `tags`, `post_tags`, `sources`, `ai_metadata`, `info_db_metadata`, `chinese_metadata`, `series_counters`, `news_topics`, `news_updates`, `news_followups`, `news_status_history`, `generated_prompts` 배열을 둔다. 공용 seed인 `categories`는 기본 백업에 포함하지 않는다.

```text
JSON 선택
→ schemaVersion 검증
→ dry-run
→ 전체 데이터 중복 검사
→ 항목별 insert/skip/update 선택
→ 반영 전 결과 확인
→ 명시적 실행
→ 결과 로그 표시
```

- dry-run은 DB를 변경하지 않는다.
- dry-run 결과는 예정된 `insert`, `skip`, `update`, 차단 오류를 구분한다.
- 사용자가 처리 방식을 확인하고 명시적으로 실행하기 전에는 저장하지 않는다.
- 가져오기 파일에는 인증 정보나 비밀 키를 포함하지 않는다.

### 13.2 CSV

CSV는 검토 및 내보내기 전용이다. 관계 데이터를 포함한 전체 복원 입력으로 사용하지 않는다.

## 14. 확인 필요 사항

1. 비구조화 응답의 태그 목록에서 구분 문자가 태그 자체에 포함될 때의 escape 또는 금지 규칙이 없다.
2. 비구조화 응답의 표준 제목 문자열 목록과 각 section 경계 규칙이 명시되지 않았다.
3. 내부 링크 `<a>`의 구체적인 URL 허용 범위와 오류·경고 구분이 명시되지 않았다.
4. JSON `update`가 기존 하위 관계를 교체하는지 병합하는지, 내부 UUID를 보존할지 재매핑할지 확정이 필요하다.
5. 백업 JSON의 관계 복원 순서가 아직 정해지지 않았다.
