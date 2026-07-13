# Daily Brief Note 프롬프트 생성 규칙

## 1. 문서 목적과 범위

이 문서는 `docs/PRODUCT_SPEC.md`에 정의된 프롬프트 생성기의 입력, 조회, 구성, 길이 제한, 출력 규칙을 정리한다.

- ChatGPT API를 직접 호출하지 않는다.
- 웹앱은 저장된 데이터로 프롬프트를 만들고 사용자가 미리보기 후 복사한다.
- 뉴스 카테고리 프롬프트 생성이 MVP 핵심이다.
- WordPress HTML 전문은 프롬프트 컨텍스트에 포함하지 않는다.

## 2. 뉴스 프롬프트 사용자 흐름

```text
뉴스 프롬프트 생성
→ 경제/국제/과학기술/사회/환경·에너지 선택
→ 최근 글 수 5/10/15 선택
→ 추가 지시사항 선택 입력
→ 프롬프트 생성
→ 미리보기
→ 클립보드 복사
```

선택한 수보다 저장된 글이 적으면 존재하는 글을 모두 사용하고 실제 사용 수를 표시한다.

예:

```text
요청: 15개
저장된 경제 브리핑: 8개
실제 사용: 8개
표시: 최근 8개를 사용했습니다
```

## 3. 뉴스 글 조회 기준

- 선택한 동일 뉴스 카테고리
- `content_status = published`
- `published_on DESC NULLS LAST, updated_at DESC`
- 요청 개수는 5, 10, 15 중 하나
- 저장된 글이 부족하면 가능한 글 전부
- 저장된 요약과 구조화된 뉴스 추적 데이터만 사용
- WordPress HTML 전문은 제외

## 4. 뉴스 프롬프트 구성

### 4.1 요청 정보

- 작성 기준일
- 뉴스 카테고리
- 생성할 브리핑 ID
- 생성할 slug
- 적용 wrapper
- 실제 사용한 최근 글 수

브리핑 ID, slug, wrapper는 선택한 카테고리 설정에서 생성하며 코드에 형식을 고정하지 않는다. 설정 변경은 과거 글의 값에 소급 적용하지 않는다.

작성 기준일과 프롬프트 생성 시각은 앱 기본 시간대 `Asia/Seoul`을 기준으로 표시한다. 날짜-only 값은 날짜로 유지하며 임의의 UTC 자정 시각으로 바꾸지 않는다.

### 4.2 최근 브리핑 요약

각 브리핑마다 다음을 포함한다.

- 발행일
- 브리핑 ID
- 제목
- 브리핑 전체 요약
- 포함된 뉴스 주제
- 신규·후속·정정 구분

### 4.3 현재 추적 중인 뉴스

`active`, `monitoring`, `reopened` 상태의 주제에서 다음을 포함한다.

- canonical title
- 최근 확인일
- 최근 변화 요약
- 마지막 브리핑 ID
- 후속 작성 인정 조건
- pending 후속 체크리스트

### 4.4 종료된 뉴스

종료 뉴스는 다음 기준으로 조회한다.

- 기본 조회 기간: 작성 기준일로부터 최근 90일
- 사용자가 늘릴 수 있는 최대 조회 기간: 180일
- 최대 포함 수: 최근 20건
- `status = closed`인 주제만 포함
- `reopened` 주제는 종료 목록에서 제외
- 조건에 맞는 종료 뉴스가 없으면 종료 뉴스 section을 생략

- 주제명
- 종료일
- 종료 사유
- 마지막 확인 내용

반드시 다음 의미의 지시를 포함한다.

```text
종료된 뉴스는 새로운 공식 발표나 실질적 변화가 확인되지 않는 한 다시 포함하지 않는다.
종료 후 의미 있는 진전이 확인되면 재개 사유를 명시하고 업데이트로 처리한다.
```

### 4.5 반복 금지 목록

다음 조건의 이슈를 정리한다.

- 최근 글에 포함되었지만 변화가 없는 주제
- 종료된 주제
- 표현만 바뀐 동일 보도
- 후속 체크리스트가 모두 완료되었고 새 발표가 없는 주제

### 4.6 후속 체크리스트

`pending` 항목을 우선순위와 함께 제공한다. 최소한 `high`와 일반 항목을 구분할 수 있어야 한다.

```text
[고우선]
- 한국은행 공식 결정과 의결문 확인

[일반]
- 월간 통계 발표 확인
```

### 4.7 프로젝트 작성 규칙

생성 프롬프트에 다음 규칙을 포함한다.

- 확인된 뉴스만 작성
- 뉴스 수를 억지로 채우지 않음
- 완전히 동일한 뉴스 제외
- 의미 있는 진전만 업데이트
- 공식 발표일과 기사 작성일 구분
- 사실과 전망 구분
- 출처는 개별 원문 URL 사용
- 원문 문장 복사 금지
- 해외 기사 전체 직역 금지
- WordPress HTML은 단일 블록
- `<h1>` 포함
- 카테고리 설정의 올바른 wrapper 사용
- 마지막 wrapper `</div>` 포함
- SEO 태그 5~8개
- 카테고리명 및 유사 태그 제외
- `Daily Brief Note`, `DailyBriefNote` 태그 제외
- 대표 이미지 프롬프트와 ALT는 HTML 밖에 출력

### 4.8 카테고리별 작성 규칙

결정적 카테고리 규칙은 `src/features/briefingPrompts/categoryPromptRules.ts`에 category ID를 key로 둔다. category 설정이 규칙 문서보다 우선하므로 wrapper class, briefing ID pattern과 slug pattern은 context의 category 설정에서 사용하고, 정적 규칙은 조사 범위·출처 우선순위·작성 검증만 제공한다.

| category ID | 주요 조사 범위 | 우선 출처 | 필수 검증 |
|---|---|---|---|
| `economy` | 거시경제, 금융시장, 물가, 금리, 환율, 산업, 기업, 무역, 고용, 부동산, 정책 | 정부·공공기관, 한국은행, 통계청, 금융당국, 국제기구, 공시·거래소 | 확정치·잠정치·전망, 기준 시점·비교 기간·단위 구분 |
| `global` | 외교, 안보, 분쟁, 국제기구, 제재, 무역 갈등, 주요 국가 정책, 국제 법적 결정 | 각국 정부, 국제기구, 공식 성명, 조약·법원·규제기관, 주요 통신사 | 사실·공식 입장·분석·전망과 발효 시점 구분 |
| `technology` | AI, 반도체, 우주, 바이오, 에너지 기술, 로봇, 통신, 보안, 연구, 기술 정책·제품 | 논문·학술지, 연구기관, 정부, 기업 공식 발표, 기술 문서, 전문 매체 | 연구·시험·승인·상용화, 동일 성능 조건, 미래·현재 기능 구분 |
| `society` | 노동, 교육, 보건, 안전, 재난, 주거, 교통, 사법, 복지, 인구, 생활 정책 | 정부·지자체, 경찰·소방, 법원, 공공기관, 공식 통계 | 민감 수치의 최신 공식 발표, 확인·추정 피해와 수사·판결 구분 |
| `climate-energy` | 기후, 탄소, 전력, 재생에너지, 원전, 석유·가스, 오염, 생물다양성, 기상·재난 | 환경부, 산업부, 기상청, 전력기관, IEA, IPCC, UN, 연구기관 | 단위·기준 기간, 기상·기후 인과, 용량·발전량·비중 구분 |

뉴스 HTML 하단은 `출처 및 참고자료 → 이전 [카테고리] 브리핑 → content-note` 순서다. content-note는 프로젝트 HTML 템플릿의 고정 태그와 문구를 그대로 사용한다. 각 이슈의 `.update-label`은 최초 포함인 `신규`와 실질적 변화가 있는 `업데이트｜[이전 브리핑 ID] 후속`을 구분한다.

최종 출력은 SEO 대표 제목, 대안 제목 4개, 메타 설명, URL slug, 포커스 키워드, SEO 태그 5~8개, WordPress HTML, 대표 이미지 프롬프트, ALT, 발행 전 체크리스트 순서다. SEO·이미지 항목은 HTML과 분리하고 HTML은 하나의 연속된 `html` 코드블록으로 출력한다.

## 5. 의미 있는 후속 업데이트 기준

다음과 같은 변화가 확인된 경우에만 후속 업데이트로 취급한다.

- 공식 발표
- 새로운 수치
- 정책 확정
- 법적 결정
- 기업 후속 조치
- 사고·재난의 중대한 변화
- 기존 보도 오류 수정
- 시장 또는 사회에 실제 영향 발생

표현만 달라진 반복 보도는 새 뉴스 업데이트로 다루지 않는다. 의미 있는 진전이 있는 후속 뉴스는 이전 업데이트와 브리핑 ID를 연결한다.

## 6. 프롬프트 길이 제어

권장 기본 제한:

| 항목 | 제한 |
|---|---|
| 브리핑 전체 요약 | 글당 최대 600자 |
| 뉴스 항목 사실 요약 | 항목당 최대 350자 |
| 변화 요약 | 항목당 최대 250자 |
| 후속 체크리스트 | 주제당 최대 5개 |
| 종료된 뉴스 | 기본 90일, 최대 180일, 최대 20건 |
| 출처 URL 전문 목록 | 기본 미포함 |
| HTML 본문 | 미포함 |

길이 제한으로 내용을 줄일 때도 다음 항목은 생략하지 않는다.

- 사용자 요청
- 필수 프로젝트 규칙
- 생성할 ID·slug·wrapper
- `active`, `reopened` 주제의 고우선 후속 항목
- 반복 금지 지시

다음 순서로 먼저 줄인다.

1. 상세 이력
2. 오래된 종료 뉴스
3. 저우선 `monitoring` 항목

프롬프트 모드:

- 간단: 최근 글 핵심만
- 표준: 요약·추적·종료 포함
- 상세: 표준 + 후속 이력

MVP 기본값은 `표준`이다. 모든 모드는 요청 정보와 프로젝트 필수 작성 규칙을 포함한다. 간단 모드는 최근 브리핑 핵심만 추가하고, 표준 모드는 최근 요약·추적 중인 뉴스·종료 뉴스를 추가하며, 상세 모드는 표준 구성에 후속 이력을 추가한다.

### 6.1 Phase 3B-1 모드 적용

Phase 3B-1의 집계 RPC는 모드와 무관하게 동일한 원시 context를 반환하고, 프런트엔드 빌더가 포함 상세도만 결정한다.

- 간단: 최근 브리핑 제목·핵심 뉴스 요약, high 또는 overdue 후속 항목, 최근 종료 주제 핵심
- 표준: 최근 게시물 최대 5개와 뉴스 항목, 모든 추적 주제, 모든 pending 후속 항목, 최근 종료 주제
- 상세: 표준 구성에 중요성·영향·변화 요약, 주제 최신 업데이트와 종료 메모 세부 내용 추가

Phase 3B-1은 최근 게시물을 최대 5개로 고정해 `schemaVersion = 1` context와 프롬프트를 미리보기만 했다. Phase 3B-2는 미리보기에 사용한 정확한 프롬프트와 전체 context snapshot, category·reference date·mode·종료 조회 기간을 이력으로 저장한다. 외부 AI API는 호출하지 않으며 제품 전체의 5·10·15개 선택은 후속 단계에서 확장한다.

### 6.2 Phase 3B-3 모드 적용

- 간단: 공통 필수 규칙, category 조사 범위, wrapper·ID·slug, 하단 순서와 간결한 출력 요구사항
- 표준: 간단 전체와 category 출처 우선순위, SEO·이미지 규칙, HTML·출처 구조
- 상세: 표준 전체와 사실 검증 체크리스트, 신규·업데이트·중복 판정, category별 수치·정책·연구 검증, 발행 전 체크리스트

핵심 HTML·SEO·저작권·중복 방지 규칙은 모든 모드에서 제거하지 않는다. 동일 context·mode·template version은 생성 시각 같은 비결정적 값을 사용하지 않고 동일한 prompt text를 만든다.

### 6.3 Phase 3B-4 결정적 검증

생성 프롬프트는 validation version 1의 순수 함수로 다음을 검사한다.

- BEGIN/END와 mode별 section marker의 존재·순서·중복
- 10개 출력 항목의 존재와 지정 순서
- category 설정의 code·wrapper·ID·slug와 조사 범위·출처 우선순위·필수/상세 지침
- context schema/category/reference date/template version과 counts·결정적 배열 순서
- 최근 post/update, open topic, pending followup, recent closed topic의 mode별 반영
- 구조적 ID/topic key 중복, open/closed 충돌과 정규화 exact headline 중복
- `new`, `follow_up`, `correction`, `closure_note`의 previous update·change summary·closed topic 관계
- 마감 초과·우선순위·마감일·연결 주제와 종료 사유·종료 시각·반복 방지 지침
- owner ID, 이메일, token/JWT, UUID, 내부 DB 오류/필드, WordPress HTML 전체 원문 노출
- 핵심 저작권·개별 원문 URL·사실/분석 구분·미확인 내용 제외 지침
- mode별 프롬프트 문자 수, 줄 수와 section 수

구조·관계·개인정보 오류는 저장과 prompt 복사를 차단한다. 데이터 부재, 간단 mode의 정책상 상세 생략, exact headline 중복, 과도한 길이는 경고이며 저장과 복사를 허용한다. 설정 변경으로 stale이 된 preview는 검증 결과도 stale로 처리한다. AI 의미 유사도, 자연어 의미 중복 판정, 외부 기사 비교와 실제 뉴스 사실 검증은 수행하지 않는다.

## 7. 뉴스 프롬프트 기본 구조

```text
# Daily Brief Note [카테고리] 브리핑 생성 요청

작성 기준일: [...]
카테고리: [...]
브리핑 ID: [...]
URL 슬러그: [...]
Wrapper: [...]
참조 범위: 최근 [실제 사용 수]개 [...] 브리핑

## 최근 브리핑 요약

### [브리핑 ID]
- 제목:
- 전체 요약:
- 신규 뉴스:
- 후속 뉴스:
- 정정 뉴스:
- 제외된 반복 뉴스:

## 현재 추적 중인 뉴스

### [주제명]
- 상태:
- 최근 확인일:
- 최근 변화:
- 마지막 관련 브리핑:
- 후속 작성 인정 조건:
- 확인할 항목:

## 종료된 뉴스

### [주제명]
- 종료일:
- 종료 사유:
- 마지막 확인 내용:
- 재포함 조건: 새로운 공식 발표 또는 실질적 변화가 확인될 때만

## 반복 금지

- [...]

## 후속 체크리스트

[고우선]
- [...]

[일반]
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

## 8. 최종 응답 형식 지시

ChatGPT 최종 결과는 기존 프로젝트의 다음 10개 순서를 지원해야 한다.

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

구조화 저장 블록을 사용하는 경우 다음 시작·종료 태그를 사용한다.

- `[CONTENT_META_JSON] ... [/CONTENT_META_JSON]`
- `[SEO_JSON] ... [/SEO_JSON]`
- `[IMAGE_PROMPT_JSON] ... [/IMAGE_PROMPT_JSON]`
- `[SOURCES_JSON] ... [/SOURCES_JSON]`
- `[NEWS_TRACKING_JSON] ... [/NEWS_TRACKING_JSON]`
- `[WORDPRESS_HTML] ... [/WORDPRESS_HTML]`

JSON 블록의 입력 키는 camelCase를 사용한다. DB 컬럼은 snake_case를 유지하며 파서가 `displayId` → `posts.display_id`, `publishedOn` → `posts.published_on`, `publishedAt` → `posts.published_at`, `representativeTitle` → `seo_data.representative_title`, `alternativeTitles` → `seo_data.alternative_titles`, `metaDescription` → `seo_data.meta_description`, `focusKeyword` → `seo_data.focus_keyword`, `sourceName` → `sources.source_name`, `sourceTitle` → `sources.source_title`, `sourceUrl` → `sources.source_url`, `sourcePublishedAt` → `sources.source_published_at`, `checkedPoint` → `sources.checked_point`처럼 매핑한다.

대표 이미지 프롬프트와 ALT는 WordPress HTML에 넣지 않는다.

기본 출력은 위 10개 항목 순서를 따른다. 구조화 저장 블록은 필요한 경우 응답 마지막에 추가할 수 있는 선택 형식이며, 파서는 10개 항목 형식과 구조화 section 형식을 모두 지원한다.

## 9. 다른 콘텐츠 그룹의 중복 방지 컨텍스트

뉴스 외 카테고리는 같은 DB에서 최근 글 정보를 사용하되 뉴스 브리핑 규칙을 그대로 적용하지 않는다.

### 9.1 AI 칼럼

- `ready`, `published` 상태의 최근 20개를 컨텍스트로 사용
- AI ID
- 제목
- 핵심 개념
- 요약
- 포커스 키워드
- 태그
- 유사 주제
- 기존 글과 겹치지 않아야 할 범위

### 9.2 정보DB

- `ready`, `published` 상태의 최근 30개를 컨텍스트로 사용
- 정보DB ID
- 제목
- 정의 대상
- 요약
- 비교한 유사 개념
- 흔한 오해
- 포커스 키워드

### 9.3 중국어 학습

- `ready`, `published` 상태의 최근 20개를 컨텍스트로 사용
- 시리즈 번호
- 제목
- CCTV 프로그램명
- 원문 제목
- 개별 원문 URL
- 뉴스 주제
- 핵심 단어·문장 구조 요약
- 동일 원문 URL 및 동일 주제 중복 금지

중국어 학습 컨텍스트에는 브리핑 ID를 생성하지 않는다.

비뉴스 recent context는 `published_on DESC NULLS LAST, updated_at DESC`로 정렬한다. 최근 컨텍스트 범위와 별도로 해당 사용자의 `draft`, `ready`, `published`, `archived` 전체 데이터에서 exact title, slug, focus keyword 중복을 검사한다. 중국어 학습은 전체 데이터에서 `original_url`도 검사하며 동일 URL이면 저장을 차단한다.

## 10. 생성 기록

프롬프트 생성 기록은 `generated_prompts`에 저장한다.

- `owner_id`
- `category_id`
- 요청한 `requested_post_count`
- 실제 사용한 `actual_post_count`
- `prompt_mode`
- `reference_date`
- `closed_lookback_days`
- `context_schema_version`
- 생성 당시 전체 `context_snapshot`
- `prompt_text`
- `is_pinned`
- `generated_at`

새 Phase 3B-3 snapshot은 기존 context `schemaVersion = 1`을 변경하지 않고 선택 필드 `promptTemplateVersion = 1`을 포함한다. prompt text에도 template version을 표시한다. 과거 snapshot에 이 값이 없어도 유효하며 상세 화면에서는 이전 이력으로 표시한다.

Phase 3B-4의 새 snapshot은 선택 필드 `promptValidationVersion = 1`과 저장 당시 validation summary를 추가한다. 오류가 없는 결과만 저장하며 summary에는 status, error/warning/check 개수만 포함한다. 상세 issue는 저장하지 않는다. 과거 snapshot에 validation 정보가 없으면 이전 이력으로 표시하고 현재 validator로 자동 재검증하지 않는다.

- 사용자·카테고리별 최근 30개의 고정되지 않은 기록을 보존한다.
- `is_pinned = true`인 기록은 자동 삭제하지 않으며 30개 계산에서 제외한다.
- 기록 저장과 오래된 미고정 기록 정리는 PostgreSQL DB 함수가 하나의 트랜잭션에서 처리한다.
- 오래된 고정 기록을 해제하면 같은 사용자·카테고리의 retention을 다시 적용한다.
- 저장된 prompt text와 context snapshot은 수정하거나 현재 데이터로 다시 생성하지 않는다.
- 설정 변경으로 stale이 된 미리보기는 재생성 전 저장하지 않는다.
- `requested_post_count`에는 사용자가 요청한 최근 글 수를 기록한다.
- `actual_post_count`에는 실제 프롬프트에 사용한 발행 글 수를 기록한다.
- `prompt_text`에는 WordPress HTML 전문, 뉴스 기사 원문, CCTV 원문·전체 자막·전체 번역을 포함하지 않는다.

## 11. 추가 지시사항 우선순위

사용자가 입력한 추가 지시사항은 프롬프트의 주제·강조점 등 선택 영역에만 적용한다. 이미지 저장 금지, 중국어 브리핑 ID 금지, 등록 wrapper 사용, HTML·SEO·출처·저작권 규칙, 반복 뉴스 제외 같은 확정된 필수 규칙을 덮어쓸 수 없다. 충돌하는 추가 지시사항은 적용하지 않고 사용자에게 충돌 내용을 표시한다.

## 12. 확인 필요 사항

1. “후속 작성 인정 조건”을 저장하는 전용 DB 필드가 PRODUCT_SPEC 데이터 모델에 없다. 어떤 필드나 계산 규칙에서 가져올지 결정이 필요하다.
2. 간단·표준·상세 모드별 개별 길이 제한은 정의되지 않았다.
3. 길이 제한 시 문자열 자르기 기준과 생략 표시 형식이 정의되지 않았다.
4. AI·정보DB·중국어 학습 컨텍스트의 모드와 최종 템플릿은 정의되지 않았다.
