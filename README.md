# Daily Brief Note Content Manager

Daily Brief Note의 콘텐츠, SEO 정보, 출처, 뉴스 추적 이력과 생성 프롬프트를 관리하기 위한 비공개 웹앱입니다.

현재 저장소는 Phase 3A-2 단계입니다. 뉴스 주제 관리에 더해 뉴스 게시물의 개별 업데이트 생성·상세·수정·순서 변경과 게시물-주제 연결을 포함합니다. 가져오기, 후속 체크리스트와 프롬프트 생성기는 아직 구현하지 않았습니다.

## 요구 환경

- Node.js `^20.19.0` 또는 `>=22.12.0`
- npm
- Supabase 프로젝트
- 로컬 데이터베이스 검증 시 Docker Desktop 또는 Docker 호환 런타임

## 로컬 실행

1. 의존성을 설치합니다.

   ```bash
   npm install
   ```

2. 환경 변수 파일을 만듭니다.

   PowerShell:

   ```powershell
   Copy-Item .env.example .env.local
   ```

3. `.env.local`에 Supabase의 공개 클라이언트 값을 입력합니다.

   ```dotenv
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   ```

   브라우저에는 Supabase Dashboard의 publishable key만 사용합니다. `service_role`, `sb_secret` 또는 데이터베이스 비밀번호는 프런트엔드 환경 변수에 넣지 않습니다. 환경 변수가 없으면 앱은 인증 요청을 보내지 않고 설정 오류 화면을 표시합니다.

4. 개발 서버를 시작합니다.

   ```bash
   npm run dev
   ```

## 검증 명령

```bash
npm run lint
npm run test
npm run build
```

## Supabase Auth 설정

Supabase Dashboard의 Authentication URL Configuration에 개발 주소를 등록합니다.

- Site URL: `http://localhost:5173`
- Redirect URLs: `http://localhost:5173`, `http://127.0.0.1:5173`

이 단계에서는 이메일·비밀번호 인증만 사용합니다. 소셜 로그인, 비밀번호 재설정, MFA와 역할 관리는 포함하지 않습니다.

## 로컬 데이터베이스

Supabase CLI는 프로젝트 개발 의존성으로 설치되어 있습니다. Docker가 실행 중인 환경에서 다음 순서로 초기 migration, seed, DB lint와 pgTAP 테스트를 검증합니다.

```bash
npm run db:start
npm run db:reset
npm run db:lint
npm run test:db
npm run db:stop
```

`db:reset`은 로컬 Supabase 데이터베이스만 다시 만들고 `supabase/migrations/`와 `supabase/seed/`를 적용합니다. 원격 프로젝트에는 적용하지 않습니다.

원격 migration은 SQL, RLS, 함수 권한과 로컬 테스트 결과를 검토한 뒤 별도 단계에서 수행해야 합니다. 이 저장소의 설정 과정에서는 `supabase link`, `supabase db push` 또는 원격 SQL 실행을 사용하지 않습니다.

로컬 migration 스키마를 변경한 뒤에는 로컬 Supabase가 실행 중인 상태에서 데이터베이스 타입을 다시 생성합니다.

```bash
npx supabase gen types typescript --local > src/shared/supabase/database.types.ts
```

로그인 후 `/content`에서 활성 카테고리와 현재 사용자의 콘텐츠를 조회하고 카테고리·상태·제목·slug로 필터링할 수 있습니다. `/content/new`에서 기본 정보를 생성하고, `/content/:postId`와 `/content/:postId/edit`에서 상세 조회와 수정을 할 수 있습니다. 삭제 대신 상태를 `archived`로 바꾸는 논리적 보관을 사용합니다.

`/news-topics`에서는 뉴스 카테고리의 주제를 카테고리·상태·대표 제목·주제 키로 필터링할 수 있습니다. 주제 키는 영문 소문자·숫자·하이픈으로 만들며 생성 후 변경하지 않습니다. 주제 상태는 `active`, `monitoring`, `closed`, `reopened`이고 전용 RPC가 상태·종료 사유·상태 이력을 한 트랜잭션으로 저장합니다. 재개 시 마지막 종료 사유는 보존하고 재개 사유는 상태 이력에 기록합니다. 뉴스 주제의 물리 삭제 UI는 제공하지 않습니다.

뉴스 게시물 상세에서는 같은 카테고리의 주제에 `new`, `follow_up`, `correction`, `closure_note` 업데이트를 연결합니다. 후속·정정·종료 메모에는 같은 주제의 이전 업데이트와 변경 요약이 필요하고, 모든 업데이트는 기존 게시물 출처를 하나 이상 연결합니다. 생성·수정·순서 변경은 전용 RPC로 원자 처리하며 물리 삭제는 지원하지 않습니다. 현재 `sources.news_update_id` 구조에서는 한 출처가 한 업데이트에만 연결됩니다.

콘텐츠 수정 화면에서는 WordPress HTML 원문, SEO 대표 제목·대안 제목 4개·메타 설명·포커스 키워드, 태그, 대표 이미지 프롬프트·ALT 문구와 순서가 있는 출처를 입력합니다. 카테고리 설정의 `content_group`이 `ai`이면 분야·난이도·예상 읽기 시간을, `info_db`이면 여기에 기준일까지 별도로 입력합니다. `ready`와 `published`에서 두 metadata의 분야·난이도·예상 읽기 시간은 필수이며, 난이도 저장값은 `beginner`·`intermediate`·`advanced`, 읽기 시간은 1~600분 정수다. 정보DB 기준일은 nullable이며 경고 안내만 제공한다. 빈 draft metadata는 저장하지 않고 기존 빈 draft metadata는 삭제하지만 archived의 기존 metadata는 보존한다. HTML은 카테고리 설정의 wrapper를 기준으로 strict validation하며 화면에서 실행하지 않습니다. `ready`와 `published` 전환에는 유효한 HTML, 완성된 SEO, 5~8개 태그, 이미지 프롬프트·ALT, 1개 이상의 완전한 출처와 HTML `#sources` 링크 일치가 필요하고 `published`에는 발행일도 필요합니다. `draft`와 기존 `archived` 데이터는 미완성을 허용합니다. AI 칼럼·정보DB·중국어 학습은 각각의 publication bundle RPC에서 posts·SEO·태그·출처·metadata를 한 트랜잭션으로 저장합니다.

태그는 앞뒤 공백 제거와 내부 연속 공백 축소 후 대소문자를 무시하는 `normalized_name`으로 사용자별 unique를 보장합니다. 카테고리명, `Daily Brief Note`, `DailyBriefNote`, 제목 전체는 태그로 사용할 수 없습니다. 일반 출처의 게시 시각은 nullable입니다. 중국어 학습 `ready`·`published`에는 학습 주제, 프로그램명, 원문 제목·URL·실제 게시 시각, 본편 목록 포함 여부, 확인한 핵심 사실이 필요하며 원문 URL은 정규화 후 출처 URL 중 하나와 일치해야 합니다. `save_chinese_publication_bundle` RPC는 posts·SEO·태그·출처·중국어 metadata를 한 트랜잭션으로 저장합니다.

Playwright 브라우저를 설치한 뒤 E2E 테스트를 실행할 수 있습니다.

```bash
npx playwright install chromium webkit
npm run test:e2e
```

## 기본 구조

```text
src/
├─ app/        # 앱 공급자와 라우터
├─ layouts/    # 공통 화면 레이아웃
├─ pages/      # 라우트 화면
├─ features/   # 기능 단위 모듈
├─ shared/     # 공유 인프라와 Supabase 클라이언트
├─ styles/     # 전역 스타일
└─ test/       # 테스트 설정

supabase/
├─ migrations/ # 버전 관리 PostgreSQL migration
├─ seed/       # 반복 실행 가능한 공용 카테고리 seed
└─ tests/      # pgTAP 데이터베이스 테스트
```

제품 요구사항과 상세 규칙은 `docs/` 문서를 기준으로 합니다.
