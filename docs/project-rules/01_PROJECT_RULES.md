# 01. Daily Brief Note 프로젝트 공통 규칙

## 1. 브랜드와 운영 범위

- 공개 블로그 브랜드: `Daily Brief Note`
- 운영 플랫폼: WordPress
- 기본 테마: GeneratePress
- 콘텐츠 카테고리:
  - 뉴스 브리핑
  - AI 칼럼
  - 정보DB
  - 중국어 학습

---

## 2. 작성 역할

콘텐츠 생성 시 다음 역할을 동시에 수행한다.

- 리서처
- 팩트체커
- 전문 콘텐츠 에디터
- SEO 편집자
- 워드프레스 HTML 작성자
- 중국어 학습 콘텐츠 설계자

---

## 3. 공통 조사 원칙

뉴스, AI, 기술, 정책, 산업, 경제, 기업, 제품, 연구 관련 글은 최신 정보를 조사한 뒤 작성한다.

반드시 확인할 항목:

- 실제 발생 여부
- 공식 발표일
- 기사 작성일
- 최신 상태
- 수치와 단위
- 날짜와 시간
- 인물명과 기관명
- 원 출처와 2차 보도의 의미 일치
- 정정·철회·후속 발표 여부

---

## 4. 출처 우선순위

### 1순위: 1차 출처

- 정부기관
- 공공기관
- 기업 공식 발표
- 기업 IR 자료
- 법령·정책 원문
- 국제기구
- 대학·연구기관
- 학술 논문
- 제품 공식 문서
- CCTV 공식 기사 및 영상

### 2순위: 신뢰도 높은 보도기관

- 주요 통신사
- 공영방송
- 전문 경제·산업 매체
- 검증된 종합 언론사

### 3순위: 보조 자료

- 전문기관 해설
- 산업 분석 자료
- 공신력 있는 전문가 인터뷰

SNS, 커뮤니티, 카페, 개인 블로그는 단독 사실 근거로 사용하지 않는다.

---

## 5. 출처 표시 규칙

출처에는 가능한 범위에서 다음을 포함한다.

- 기관 또는 언론사명
- 원문 제목
- 게시일 또는 업데이트일
- 개별 원문 URL
- 해당 출처에서 확인한 핵심 내용

다음은 최종 출처로 인정하지 않는다.

- 홈페이지 첫 화면
- 검색 결과 페이지
- 주제 목록 페이지
- 출처가 불분명한 재가공 콘텐츠

---

## 6. 문체 기준

- 객관적
- 차분함
- 정보 중심
- 전문적이지만 이해하기 쉬움
- 과장 금지
- 공포 조장 금지
- 광고성 표현 금지
- 한 문단에 하나의 핵심 내용
- 모바일 기준 2~4문장 권장

전문 용어는 처음 등장할 때 한 번 설명한다.

---

## 7. 사실과 분석의 구분

다음 항목을 명확히 구분한다.

- 공식 확인
- 언론 보도
- 업계 관측
- 전문가 전망
- 작성자의 분석

전망이나 가능성을 확정적 사실처럼 작성하지 않는다.

---

## 8. 중복 관리

### 완전히 동일한 내용

- 제외
- 다시 작성하지 않음

### 의미 있는 진전이 있는 경우

다음 중 하나 이상이 있어야 업데이트로 인정한다.

- 공식 발표
- 새로운 수치
- 정책 확정
- 법적 결정
- 기업의 후속 조치
- 사고·재난 상황의 중대한 변화
- 기존 보도 오류 수정
- 시장이나 사회에 실제 영향 발생

### 표현만 달라진 반복 보도

신규 콘텐츠로 처리하지 않는다.

---

## 9. 카테고리별 wrapper

- 뉴스 브리핑: `<div class="daily-brief-note news-briefing">`

### 9.1 뉴스 브리핑 하위 카테고리 wrapper

- 경제 브리핑: `<div class="daily-brief-note news-briefing economy">`
- 국제 브리핑: `<div class="daily-brief-note news-briefing global">`
- 과학기술 브리핑: `<div class="daily-brief-note news-briefing technology">`
- 사회 브리핑: `<div class="daily-brief-note news-briefing society">`
- 환경·에너지 브리핑: `<div class="daily-brief-note news-briefing climate-energy">`

### 9.2 기타 카테고리 wrapper

- AI 칼럼: `<div class="daily-brief-note ai-column">`
- 정보DB: `<div class="daily-brief-note info-db">`
- 중국어 학습: `<div class="daily-brief-note chinese-study">`

---

## 10. URL 슬러그

- 종합: `daily-news-briefing-YYYY-MM-DD`
- 경제: `economy-briefing-YYYY-MM-DD`
- 국제: `global-briefing-YYYY-MM-DD`
- 과학기술: `technology-briefing-YYYY-MM-DD`
- 사회: `society-briefing-YYYY-MM-DD`
- 환경·에너지: `climate-energy-briefing-YYYY-MM-DD`
- AI 칼럼: `ai-###`
- 정보DB: `info-db-###`
- 중국어 학습: `cctv-chinese-news-###`

`###`는 최소 3자리로 zero-padding하며 1000 이상은 자릿수를 제한하지 않는다. 카테고리 설정 변경은 이미 발행된 게시물의 slug나 WordPress URL을 자동으로 변경하지 않는다.

---

## 11. 공통 금지 사항

- 사실 미확인 상태에서 단정
- 없는 출처 생성
- 기사 문장 복사
- 해외 기사 직역
- 언론사 이미지 무단 사용
- 의미 없는 키워드 반복
- 카테고리명 태그 사용
- 유사 태그 중복
- HTML wrapper 누락
- `<h1>` 누락
- 마지막 `</div>` 누락
- 본문을 여러 HTML 블록으로 임의 분할
- 대표 이미지 프롬프트를 HTML 본문 안에 삽입
- 내부 링크 한줄로, tap 금지 예)<p><a href="[내부 링크]">[이전 관련 브리핑 제목]</a></p>
