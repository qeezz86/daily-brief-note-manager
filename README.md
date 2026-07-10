# Daily Brief Note Content Manager

Daily Brief Note의 콘텐츠, SEO 정보, 출처, 뉴스 추적 이력과 생성 프롬프트를 관리하기 위한 비공개 웹앱입니다.

현재 저장소는 Phase 0 초기화 단계입니다. 기본 React 앱 셸과 라우팅, 테스트, PWA 설정, Supabase 브라우저 클라이언트 연결 지점만 포함합니다. 인증, 데이터베이스 migration, 실제 콘텐츠 기능은 아직 구현하지 않았습니다.

## 요구 환경

- Node.js `^20.19.0` 또는 `>=22.12.0`
- npm
- Phase 1부터 사용할 Supabase 프로젝트

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
   VITE_SUPABASE_ANON_KEY=your-public-anon-key
   ```

   브라우저 코드에는 service role key를 사용하지 않습니다. Phase 0 대시보드는 환경 변수가 비어 있어도 실행됩니다.

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
├─ migrations/ # Phase 1부터 버전 관리 migration 추가
├─ seed/       # 공용 seed 파일
└─ tests/      # 데이터베이스 테스트
```

제품 요구사항과 상세 규칙은 `docs/` 문서를 기준으로 합니다.
