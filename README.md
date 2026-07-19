# Daily Brief Note Content Manager

Daily Brief Note의 콘텐츠, SEO 정보, 출처, 뉴스 추적 이력과 생성 프롬프트를 관리하기 위한 비공개 웹앱입니다.

현재 저장소는 Phase 5B-R1 단계입니다. 인증된 단일 허용 사용자는 `/settings/wordpress`에서 Supabase Edge Function을 통해 단일 WordPress 사이트의 읽기 전용 리소스를 진단하고 taxonomy를 로컬 설정에 매핑하며, 콘텐츠별 publication payload를 Dry Run으로 검토할 수 있습니다. WordPress credential은 브라우저나 DB에 저장하지 않으며 실제 게시·draft 생성·taxonomy 생성·미디어 업로드·수정·삭제 요청은 수행하지 않습니다. 자세한 보안 경계와 로컬 설정은 [`docs/WORDPRESS_INTEGRATION.md`](docs/WORDPRESS_INTEGRATION.md)를 참고합니다.

Phase 4B의 `/backups`에서는 공식 `core`·`full` JSON 백업을 생성하고, `/backups/restore`에서 read-only Dry Run과 결정적 복원 계획을 만든 뒤 `/backups/restore/execute`에서 원본 backup과 plan을 다시 검증해 core 데이터와 선택한 full Import 운영 이력을 실제 복원할 수 있습니다. `/backups/restore/jobs`는 영구 job·record·attempt, stage 진행률, 수동 retry, 취소·재개를 제공합니다.

복원 계획은 원본 백업과 분리된 `daily-brief-note-restore-plan` schema version 1 JSON입니다. 실행에는 두 파일이 모두 필요하고 checksum·fingerprint·category·DB 충돌을 직전에 다시 확인합니다. record별 transaction이므로 부분 성공할 수 있으며 브라우저가 닫혀 있는 동안 자동 실행하지 않습니다. 기존 row overwrite·merge, 자동 suffix와 restore undo는 지원하지 않습니다. 허용되는 기존 row 변경은 series counter의 단조 증가와 이번 job이 만든 뉴스 update의 previous 연결 완성으로 제한됩니다.

Phase 4C-1에서는 인증 공급자·route guard·공통 `AppLayout`을 초기 entry에 유지하고, 로그인과 보호 페이지를 React Router `route.lazy`로 직접 파일 단위 동적 import합니다. route 로딩 상태와 chunk load 오류 안내를 공통 처리하며 URL, 중첩 route, params와 인증 redirect 정책은 변경하지 않습니다. build baseline 1,078.60 kB(gzip 292.41 kB)이었던 entry는 521.11 kB(gzip 151.16 kB)로 감소했습니다. 자세한 원칙, route inventory와 chunk 결과는 [`docs/BUNDLE_SPLITTING.md`](docs/BUNDLE_SPLITTING.md)를 참고합니다.

Phase 4C-2에서는 실제 production graph에 있던 React·Router·Query·Supabase·Zod만 제한된 vendor chunk로 분리하고, Backup 생성, Restore 검증·계획·실행, Import 분석 엔진을 해당 사용자 동작 시점에 불러옵니다. loader는 성공 promise를 재사용하고 실패 cache를 비워 다음 동작에서 재시도합니다. entry는 25.19 kB(gzip 7.74 kB), 가장 큰 chunk는 198.47 kB이며 500 kB와 circular chunk 경고가 없습니다. PWA의 `generateSW`·`autoUpdate`·navigation fallback 정책은 유지합니다. 자세한 graph, route/action별 전이 크기와 후속 bundle budget 계획은 [`docs/BUNDLE_SPLITTING.md`](docs/BUNDLE_SPLITTING.md)를 참고합니다.

Phase 4C-3에서는 Vite production manifest로 entry, static closure, 대표 route, 동적 feature engine, largest chunk, 전체 JS와 PWA precache를 byte 단위로 측정합니다. 절대 상한과 승인 baseline 회귀 상한을 모두 통과해야 하며 Pull Request와 `main` push의 GitHub Actions에서 필수 gate로 실행됩니다. 정책, 현재 기준값, 실패 해석과 baseline 검수 절차는 [`docs/BUNDLE_BUDGET.md`](docs/BUNDLE_BUDGET.md)를 참고합니다.

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
npm run test:wordpress
npm run smoke:wordpress-runtime
npm run build
npm run bundle:check
```

`npm run build:budget`은 production build와 budget 검사를 연속 실행합니다. 의도된 bundle 변화의 원인을 검토한 뒤에만 `npm run bundle:baseline`으로 기존 `dist`의 승인 baseline을 갱신하고, 생성된 `config/bundle-baseline.json` diff를 코드 리뷰에 포함합니다.

Bundle budget CI는 Supabase module을 포함한 production graph를 일정하게 만들기 위해 로컬 주소와 비밀정보가 아닌 공개 placeholder key를 build-time 환경변수로 사용합니다. CI는 앱을 실행하거나 원격 Supabase에 연결하지 않으며 실제 credential이나 GitHub secret을 저장하지 않습니다. Raw 최대 chunk와 gzip 최대 chunk는 서로 다른 asset일 수 있으므로 각각 독립적으로 측정합니다.

## WordPress read-only 진단

Phase 5A는 `Browser → authenticated Supabase Edge Function → WordPress REST API` 경계만 제공합니다. 실제 secret은 Git에서 제외된 `supabase/functions/.env.local`에 사용자가 직접 설정하며, 예제는 `supabase/functions/.env.example`에 있습니다.

```powershell
Copy-Item supabase/functions/.env.example supabase/functions/.env.local
npx supabase functions serve wordpress-diagnostics --env-file supabase/functions/.env.local
```

실제 WordPress URL이나 Application Password를 채팅, Git, screenshot 또는 브라우저 환경변수에 남기지 마세요. 단위 테스트는 `npm run test:wordpress`로 외부 네트워크 없이 실행합니다. 원격 Function 배포와 secret 설정은 Phase 5A 자동 작업 범위에 포함되지 않습니다.

Phase 5A-R2의 인증 통합 smoke는 Docker Desktop과 실행 중인 로컬 Supabase가 필요합니다. 먼저 `npm run db:start`를 실행한 뒤 다음 명령을 사용합니다.

```bash
npm run smoke:wordpress-runtime
```

이 명령은 실제 WordPress나 원격 Supabase에 연결하지 않습니다. 로컬 Auth에 임시 허용·비허용 사용자 두 명을 만들고 access token을 발급한 뒤, `0.0.0.0`에 열린 Node mock WordPress를 Edge Runtime에서 `host.docker.internal`로 호출합니다. 임시 Function env 파일은 운영체제 임시 디렉터리에 권한을 제한해 만들며, JWT·API key·이메일·비밀번호·Authorization은 출력하지 않습니다. 성공하면 허용 사용자 200, 비허용 사용자와 origin 차단, 무인증 차단, GET 차단, WordPress GET 7건·쓰기 0건·누출 없음과 cleanup PASS를 요약합니다. 성공·실패·Ctrl+C 모두 Function과 mock server를 종료하고 임시 사용자와 env 파일을 삭제하며, temporary env가 남지 않도록 이 프로젝트의 local Edge Runtime container도 제거합니다.

`WORDPRESS_LOCAL_MODE=true`는 정확한 `host.docker.internal` 또는 localhost root URL을 로컬 mock 용도로만 허용합니다. 원격 배포에서는 절대 활성화하지 않습니다.

Phase 5B의 `/settings/wordpress`는 기존 WordPress category/tag catalog를 GET-only로 읽어 로컬 category·tag와 명시적으로 매핑합니다. 콘텐츠 상세의 `WordPress Dry Run`은 source-of-truth DB 데이터를 다시 읽어 taxonomy 해석, 전체 공개 상태 범위의 duplicate slug, blockers/warnings, draft payload와 결정적 SHA-256 fingerprint를 표시합니다. WordPress 게시·draft 생성·taxonomy 생성 버튼과 WordPress write request는 없습니다. 계약은 `docs/WORDPRESS_PUBLICATION_PLAN.md`를 따르며 격리 smoke는 `npm run smoke:wordpress-preview`로 실행합니다.

Phase 5B-R1은 위 흐름을 Playwright의 결정적 Supabase/Edge Function interception으로 Chromium과 iPhone 13에서 검증합니다. 테스트는 인증된 콘텐츠 상세 → preview 이동, loading/ready/blocked/warning, payload 복사, taxonomy 매핑 저장·제거 확인, mobile overflow와 게시·draft·전송·업로드 UI 부재를 검사하며 실제 WordPress나 원격 Supabase에 접속하지 않습니다. SEO 태그 원문은 보존하고 NFC·공백 축소 후 공백/하이픈/en dash/em dash/중점/underscore 제거와 locale-independent lowercase를 비교에만 적용합니다. 비교 결과가 같으면 `SEO_TAG_DUPLICATE_NORMALIZED` blocker, 제한적인 포함 관계이면 `SEO_TAG_POSSIBLE_NEAR_DUPLICATE` warning이며 태그를 자동 삭제하거나 병합하지 않습니다. frontend와 Edge Function은 `fixtures/seo-tag-normalization.json` 전체를 각각 실행해 규칙 동등성을 고정합니다.

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

뉴스 업데이트에 연결된 출처는 콘텐츠 편집에서 제목·확인 내용 등 일반 정보를 수정할 수 있지만, 연결된 URL을 제거하려면 먼저 뉴스 항목 수정에서 다른 출처로 연결을 변경해야 합니다. publication bundle 저장이 실패하면 기존 출처 연결과 게시물 변경은 함께 rollback됩니다.

`/news-followups`에서는 상태·우선순위·카테고리·마감일·검색 조건으로 후속 확인 항목을 조회합니다. 신규 항목은 `pending`으로 생성되며 `done` 또는 `cancelled` 처리에는 해결 메모가 필요하고 `resolved_at`은 DB가 자동 기록합니다. 마감 초과는 `Asia/Seoul`의 오늘보다 이른 `pending` 마감일에만 적용됩니다. 종료된 주제에는 새 항목을 추가하거나 일반 내용을 수정할 수 없지만 기존 pending 항목의 완료·취소는 가능하며, 주제 종료 시 자동 처리되지 않습니다. 쓰기는 전용 RPC만 사용하고 물리 삭제와 처리 항목 재개는 지원하지 않습니다. 이 데이터는 브리핑 프롬프트 context와 저장 이력에 반영됩니다.

`/briefing-prompts`에서는 활성 뉴스 카테고리만 선택할 수 있습니다. 읽기 전용 `get_news_briefing_prompt_context` RPC가 현재 사용자 데이터에서 기준일 이전의 발행 게시물 최대 5개, 해당 뉴스 업데이트, `active`·`monitoring`·`reopened` 주제, pending 후속 항목과 최근 종료 주제 최대 20개를 결정적 순서로 집계합니다. 종료 조회 기간은 기본 90일, 최대 180일입니다. context schema version은 1이며 WordPress HTML 전문, 이미지 프롬프트, 사용자 이메일과 원문 기사 전문은 포함하지 않습니다. 미리보기 설정이 바뀌면 stale로 표시되어 재생성 전에는 저장할 수 없습니다.

`/briefing-prompts/history`와 상세 경로에서는 저장 당시 설정, 정확한 프롬프트와 context snapshot을 조회·복사하고 고정 상태를 변경합니다. 새 snapshot에는 `promptTemplateVersion`을 선택 필드로 기록하고 상세 화면에서 적용 버전을 표시합니다. 버전이 없던 과거 이력도 안전하게 표시하며, 현재 category rules로 과거 prompt text를 다시 생성하지 않습니다. 프롬프트와 snapshot은 저장 후 수정할 수 없고 현재 뉴스 데이터가 바뀌어도 과거 이력은 변하지 않습니다. 사용자·카테고리별 미고정 최근 30개를 보존하며 고정 이력은 한도와 자동 정리에서 제외됩니다. 오래된 이력을 고정 해제하면 같은 카테고리의 retention이 다시 적용됩니다. 쓰기는 전용 RPC만 사용하며 외부 AI API는 호출하지 않습니다.

카테고리별 결정적 작성 규칙은 `src/features/briefingPrompts/categoryPromptRules.ts`에 category ID를 key로 두고 관리합니다. 경제·국제·과학기술·사회·환경·에너지의 조사 범위, 출처 우선순위와 검증 지침만 구조화하며 wrapper class, briefing ID pattern과 slug pattern은 DB category 설정을 사용합니다. 프롬프트 화면의 적용 규칙 영역에서 선택 템플릿, wrapper, ID·slug 예시와 template version을 확인할 수 있습니다.

Phase 3B-4 검증 결과는 `valid`, `warning`, `invalid`를 구분합니다. 오류가 있거나 설정 변경으로 미리보기가 stale이면 프롬프트 저장과 복사를 차단하며 JSON 복사는 디버깅 목적으로 유지합니다. 데이터 부재, 간단 모드의 정상적인 상세 생략, exact headline 중복, 과도한 길이 같은 경고는 확인 후 저장·복사를 허용합니다. 새 snapshot에는 `promptValidationVersion`과 오류 없는 validation summary만 선택적으로 저장합니다. 과거 이력은 현재 규칙으로 재검증하지 않으며 저장 당시 summary가 없으면 이전 이력으로 표시합니다. AI 의미 유사도, 외부 기사 비교와 실제 뉴스 사실 검증은 수행하지 않습니다.

`/imports`는 UTF-8 `.json` 파일과 직접 붙여넣은 JSON 중 마지막으로 선택한 한 입력만 사용합니다. 파일 제한은 20 MB, 게시물 제한은 2,000개이며 BOM, 과도한 중첩·문자열, prototype pollution 키를 차단합니다. DB exact duplicate 후보는 100개씩 RLS 범위에서 순차 확인하고 조회 상태가 `complete`일 때만 job을 만들 수 있습니다. source와 item fingerprint는 canonical JSON의 SHA-256이며 파일명은 동일 bundle 판정에 포함하지 않습니다. snapshot은 100개씩 idempotent하게 등록되고 finalize 이후 직접 수정할 수 없습니다. 동일 사용자·동일 fingerprint는 새 job 대신 기존 상세로 연결됩니다. 브라우저가 닫힌 동안 자동 실행하지 않고 자동 retry도 수행하지 않으며, 사용자가 작업 상세에서 명시적으로 계속 실행하거나 실패 단계를 재시도합니다. 전체 백업의 `data` schema 또는 backup format은 이 화면에서 받지 않습니다.

`/backups`와 `/backups/new`는 공식 `daily-brief-note-backup` schema version 1 JSON을 브라우저에서 생성합니다. DB 함수는 `auth.uid()` 범위의 행만 한 SQL snapshot에서 읽고 `owner_id`를 내보내지 않습니다. Phase 5B snapshot은 credential 없는 `wordpressTaxonomyMappings` optional section을 포함하며 해당 section이 없는 기존 version 1 파일도 계속 검증·복원합니다. 생성기는 관계 무결성과 민감정보 패턴을 검사하고, checksum 필드를 제외한 canonical payload의 SHA-256을 계산한 뒤 즉시 재검증합니다. 20 MB 이상은 경고하고 100 MB를 초과하면 생성을 중단합니다. 다운로드 파일명은 `daily-brief-note-backup-{profile}-{Asia/Seoul 시각}.json`입니다.

`/backups/restore`와 `/backups/restore/new`는 최대 100 MiB UTF-8 `.json` 파일 또는 붙여넣은 JSON text 중 하나를 브라우저에서만 읽습니다. checksum을 먼저 재계산한 뒤 core·full section schema와 manifest count, 관계 무결성, 민감정보, category 의미·설정 차이를 검사하고, checksum과 local schema가 유효할 때만 현재 인증 사용자의 충돌 후보를 RLS 범위에서 100개씩 조회합니다. 결과는 `복원 가능`, `경고 있음`, `복원 불가`로 분류하고 UUID preserve·reuse·remap·conflict 후보와 Phase 4B-3용 restore analysis JSON을 생성합니다. analysis에는 전체 HTML·prompt text·owner ID·raw DB 오류가 포함되지 않습니다. 이 화면은 INSERT·UPDATE·DELETE, category 생성, UUID remap 실행 또는 영구 restore job을 만들지 않습니다.

`full` 복원에서 운영 이력 포함 정책을 선택하면 모든 core stage가 끝난 뒤 `importJobs` → `importJobItems` → `importJobItemAttempts` 순서로 실행합니다. UUID preserve·결정적 remap과 exact reuse만 허용하며 source fingerprint, 부모·post 관계, normalized payload fingerprint·금지 key, 상태·attempt count를 다시 검증합니다. 새로 생성된 Import job은 원 status와 시각을 보존하되 `restored_from_backup=true`, `execution_locked=true`인 조회 전용 감사 이력입니다. 실행·retry·cancel·resume·append·finalize는 모두 차단되고, 기존 exact reuse job은 수정하거나 잠그지 않습니다. 운영 stage 실패 시 이미 복원된 core 데이터는 유지됩니다.

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

## URL slug 기준

- 과학기술: `technology-briefing-YYYY-MM-DD`
- 환경·에너지: `climate-energy-briefing-YYYY-MM-DD`
- 중국어 학습: `cctv-chinese-news-###`

신규 글은 현재 category 설정을 사용합니다. 설정 변경이나 복원 과정에서 이미 발행된 게시물의 slug와 WordPress URL을 자동 변경하지 않습니다.
