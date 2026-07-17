# 06. Daily Brief Note 변경 이력

## 문서 목적

이 파일은 프로젝트 지침과 템플릿의 변경 내역을 기록한다.

새로운 규칙을 추가하거나 기존 규칙을 수정할 때 날짜, 대상 파일, 변경 이유를 기록한다.

---

## 2026-07-16｜URL 슬러그 규칙 정합성 수정

### 변경 대상

- `README.md`
- `docs/PRODUCT_SPEC.md`
- `docs/DATABASE_SCHEMA.md`
- `docs/IMPORT_FORMAT.md`
- `docs/BACKUP_FORMAT.md`
- `docs/project-rules/01_PROJECT_RULES.md`
- `docs/project-rules/03_SEO_RULES.md`
- category seed·forward migration과 관련 generator·validator

### 변경 내용

- 과학기술: `science-tech-briefing-YYYY-MM-DD` → `technology-briefing-YYYY-MM-DD`
- 환경·에너지: `environment-briefing-YYYY-MM-DD` → `climate-energy-briefing-YYYY-MM-DD`
- 중국어 학습: `cctv-chinese-news-study-###` → `cctv-chinese-news-###`

### 변경 이유

실제 WordPress에서 사용하는 URL slug와 프로젝트 지침, SEO 규칙, category 설정 및 validation을 일치시키기 위함이다.

### 기존 게시물 정책

이미 발행된 게시물의 slug와 WordPress URL은 자동 변경하지 않는다.

---

## 2026-07-08｜통합 최종본 v1.0

### 전체 구조

다음 구조로 프로젝트 소스를 통합했다.

- `PROJECT_INSTRUCTIONS.md`
- `01_PROJECT_RULES.md`
- `02_HTML_TEMPLATE.md`
- `03_SEO_RULES.md`
- `04_IMAGE_GUIDE.md`
- `05_COPYRIGHT_POLICY.md`
- `06_CHANGELOG.md`

### 카테고리

다음 네 카테고리를 하나의 프로젝트 규칙으로 통합했다.

- 뉴스 브리핑
- AI 칼럼
- 정보DB
- 중국어 학습

### HTML

- 모든 카테고리 본문을 WordPress HTML로 통일
- 본문 안에 `<h1>` 포함
- 카테고리별 wrapper 클래스 확정
- 전체 HTML을 하나의 연속된 코드블록으로 출력
- 마지막 `</div>` 필수
- Markdown과 HTML 혼용 금지

### SEO

- SEO 태그를 모든 카테고리에서 5~8개로 통일
- 카테고리명 태그 제외
- 의미 중복 태그 제외
- `Daily Brief Note` 및 `DailyBriefNote` 태그 금지
- SEO 입력 정보를 항목별 일반 텍스트로 분리
- 메타 설명 120~160자 권장

### 뉴스 브리핑

- 동일 뉴스 반복 금지
- 의미 있는 진전이 있는 경우에만 업데이트
- 뉴스 수를 억지로 채우지 않음
- 브리핑 ID 형식 추가
- Change Log 섹션 추가
- 기사 원문 비복사 원칙 강화

### AI 칼럼

- SEO 제목 형식을 `[제목] - AI-###`로 확정
- URL 슬러그를 `ai-###` 형식으로 확정
- 개념 정의, 작동 원리, 비교, 사례, 한계 구조 적용
- 보안·개인정보·인간 감독 항목 필수화

### 정보DB

- SEO 제목 형식을 `[제목] - 정보DB-###`로 확정
- URL 슬러그를 `info-db-###` 형식으로 확정
- 정의, 원리, 구성 요소, 비교, 사례, 오해 구조 적용
- 장기 검색형 지식 콘텐츠 기준 확정

### 중국어 학습

- 제목 형식을 `CCTV 뉴스로 배우는 중국어 #[번호]｜[뉴스 주제] 핵심 표현 정리`로 확정
- wrapper를 `daily-brief-note chinese-study`로 확정
- 목차 제목을 `<h2 id="toc">목차</h2>`로 확정
- 핵심 문장 3~5개
- 중요 단어 7~12개
- 문장 구조 2~3개
- 실생활 응용 표현 4~6개
- 복습 퀴즈 3~5개
- 성조 포함 병음 필수
- CCTV 개별 기사·영상 URL 필수
- 공식 홈페이지 또는 목록 링크만 제공하는 방식 금지

### 이미지

- 대표 이미지 16:9
- 1200×675px 권장
- WebP 형식
- 300KB 이하 권장
- 텍스트·로고·워터마크 금지
- 카테고리별 이미지 스타일 분리

### 저작권

- 기사 전문 복사 금지
- 해외 기사 전체 직역 금지
- 언론사 사진 및 방송 화면 무단 사용 금지
- CCTV 원문 전체 번역 금지
- 최소 범위 인용 원칙 적용

---

---

## 2026-07-08｜뉴스 하위 카테고리 wrapper 추가

### 변경 대상

- 파일명: `01_PROJECT_RULES.md`
- 섹션: `## 9. 카테고리별 wrapper`

### 변경 내용

뉴스 브리핑 하위 카테고리별 wrapper를 추가했다.

- 경제 브리핑: `daily-brief-note news-briefing economy`
- 국제 브리핑: `daily-brief-note news-briefing global`
- 과학기술 브리핑: `daily-brief-note news-briefing technology`
- 사회 브리핑: `daily-brief-note news-briefing society`
- 환경·에너지 브리핑: `daily-brief-note news-briefing climate-energy`

### 변경 이유

뉴스 브리핑을 경제, 국제, 과학기술, 사회, 환경·에너지로 분리 운영할 때 카테고리별 CSS 적용과 화면 구성을 명확히 하기 위함.

## 향후 변경 기록 형식

```text
## YYYY-MM-DD｜버전

### 변경 대상

- 파일명:
- 카테고리:

### 변경 내용

- 추가:
- 수정:
- 삭제:

### 변경 이유

[변경 배경과 목적]
```
