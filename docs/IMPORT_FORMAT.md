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

명시적 section 구분자가 있는 다음 형식을 우선 파싱한다.

```text
[CONTENT_META]
content_group=news
category=economy
display_id=#2026-07-09-ECO
title=...
slug=economy-briefing-2026-07-09
published_at=2026-07-09

[SEO]
representative_title=...
alternative_title_1=...
alternative_title_2=...
alternative_title_3=...
alternative_title_4=...
meta_description=...
focus_keyword=...
tags=태그1|태그2|태그3|태그4|태그5

[IMAGE_PROMPT]
prompt=...
alt=...

[WORDPRESS_HTML]
<div class="daily-brief-note news-briefing economy">
...
</div>
```

이 저장용 블록은 WordPress에 게시하는 본문과 별개다. `[WORDPRESS_HTML]`에는 WordPress 본문용 단일 HTML 블록만 둔다.

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

1. 명시적 `[SECTION]` 구분자
2. 표준 제목 문자열
3. HTML wrapper와 DOM 구조
4. 파싱 실패 시 수동 입력

## 7. HTML 파싱 및 카테고리 감지

### 7.1 파싱 방식

- 브라우저 `DOMParser`를 사용한다.
- HTML 전체 구조를 정규표현식만으로 파싱하지 않는다.
- 정규표현식은 제목의 중국어 시리즈 번호처럼 작고 정규화된 텍스트 필드에만 사용할 수 있다.

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

## 9. 저장 전 미리보기

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

## 10. 검증 규칙

### 10.1 WordPress HTML

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

### 10.2 SEO와 태그

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

### 10.3 출처

- URL 형식 검증
- 출처명, 제목, URL 누락 경고
- 홈페이지, 검색, 목록 URL 가능성 경고
- 확인한 핵심 내용 누락 경고

### 10.4 뉴스

- 브리핑 날짜 존재
- 표시 ID 존재
- 뉴스 항목 최소 1개
- 각 항목의 뉴스 주제 연결 확인
- 후속 뉴스의 이전 업데이트 연결 권장
- 종료 처리 시 종료 사유 필수

### 10.5 중국어 학습

- `series_no` 존재
- 별도 브리핑 ID 없음
- 프로그램명과 원문 제목 존재
- 개별 원문 URL 존재
- 게시·업데이트 시간 존재 또는 누락 경고
- 본편 목록 포함 여부 기록
- 확인한 핵심 사실 존재

## 11. 중복 검사

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

## 12. 백업 JSON 가져오기

PRODUCT_SPEC는 다음 복구 흐름을 요구한다.

```text
JSON 선택
→ 저장 전 중복 검사
→ 신규 추가 또는 기존 덮어쓰기 선택
→ 결과 로그 표시
```

가져오기 파일에는 인증 정보를 포함하지 않는다. 정확한 JSON 구조와 버전 규칙은 PRODUCT_SPEC에 정의되어 있지 않으므로 구현 전에 확정해야 한다.

## 13. 확인 필요 사항

1. 구조화 ChatGPT 블록에서 `series_no`, `briefing_date`, `summary`, WordPress URL, 출처, 뉴스 주제·업데이트·후속 항목, 중국어 메타데이터를 표현하는 키가 정의되지 않았다.
2. `[CONTENT_META].published_at` 예시는 날짜만 사용하지만 DB 형식은 `timestamptz`다. 시간대와 날짜-only 입력의 변환 기준이 필요하다.
3. `[SEO].tags`의 `|` 문자가 태그 자체에 포함될 때의 escape 규칙이 없다.
4. 비구조화 응답의 “표준 제목 문자열” 목록과 각 섹션 경계 규칙이 명시되지 않았다.
5. DOM 추출에서 같은 selector가 여러 번 나타날 때의 선택·병합 규칙이 없다.
6. 등록되지 않은 class 검증의 strict mode 기본값과 허용 class 목록의 관리 위치가 명시되지 않았다.
7. 내부 링크 `<a>`의 구체적인 유효성 기준이 명시되지 않았다.
8. 중복 발견 시 “기존 글 수정”과 백업 복구의 “기존 덮어쓰기”가 어떤 필드와 관계 데이터를 교체하는지 정의되지 않았다.
9. 백업 JSON/CSV의 정확한 파일 형식, schema version, ID 보존·재매핑 규칙, import 순서가 정의되지 않았다.

