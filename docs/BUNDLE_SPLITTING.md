# Phase 4C-1 route bundle splitting

## 범위와 전략

React Router 7.18의 object route `lazy` API를 사용한다. 모든 동적 import는 `src/app/router.tsx`에서 실제 page 파일을 정적 literal로 직접 가리키며 page/feature barrel과 가변 경로를 사용하지 않는다. loader와 action은 현재 route에 없으므로 page `Component`만 lazy route module로 반환한다.

다음 shell은 eager로 유지한다.

- 앱 entry와 `RouterProvider`
- Query client와 `AuthProvider`
- 인증 session 초기화
- `PublicOnlyRoute`와 `RequireAuth`
- `AppLayout`과 navigation
- `RouteLoadingFallback`과 `RouteErrorFallback`
- `/` redirect와 NotFound page

lazy route에는 공통 `hydrateFallbackElement`와 `errorElement`를 연결한다. 보호 page import는 인증 guard 아래에서만 match가 렌더링되므로 session 확인과 미인증 redirect 정책을 바꾸지 않는다. fallback은 `role="status"`, `aria-live="polite"`와 짧은 한국어 문구를 사용한다. chunk load 오류는 알려진 동적 import 오류 패턴을 구분하되 raw message, asset URL과 stack을 화면에 출력하지 않는다. 자동 reload는 하지 않으며 사용자가 새로고침하거나 대시보드로 이동할 수 있다.

## Route inventory

모든 route의 index 값은 `false`다. `/`는 index route가 아니라 명시적 path redirect다. loader와 action은 전 route에 없다.

| Path | 접근 | Layout | Page/동작 | Params | Import |
|---|---|---|---|---|---|
| `/login` | public only | `PublicOnlyRoute` | `LoginPage` | 없음 | lazy |
| `/` | protected | `RequireAuth` → `AppLayout` | `/dashboard` redirect | 없음 | eager |
| `/dashboard` | protected | `RequireAuth` → `AppLayout` | `DashboardPage` | 없음 | lazy |
| `/content` | protected | `RequireAuth` → `AppLayout` | `ContentPage` | 없음 | lazy |
| `/content/new` | protected | `RequireAuth` → `AppLayout` | `ContentCreatePage` | 없음 | lazy |
| `/content/:postId` | protected | `RequireAuth` → `AppLayout` | `ContentDetailPage` | `postId` | lazy |
| `/content/:postId/edit` | protected | `RequireAuth` → `AppLayout` | `ContentEditPage` | `postId` | lazy |
| `/imports` | protected | `RequireAuth` → `AppLayout` | `ImportPage` | 없음 | lazy |
| `/imports/new` | protected | `RequireAuth` → `AppLayout` | `ImportPage` | 없음 | lazy, shared module |
| `/imports/history` | protected | `RequireAuth` → `AppLayout` | `ImportHistoryPage` | 없음 | lazy |
| `/imports/history/:jobId` | protected | `RequireAuth` → `AppLayout` | `ImportJobDetailPage` | `jobId` | lazy |
| `/backups` | protected | `RequireAuth` → `AppLayout` | `BackupPage` | 없음 | lazy |
| `/backups/new` | protected | `RequireAuth` → `AppLayout` | `BackupPage` | 없음 | lazy, shared module |
| `/backups/restore` | protected | `RequireAuth` → `AppLayout` | `BackupRestorePage` | 없음 | lazy |
| `/backups/restore/new` | protected | `RequireAuth` → `AppLayout` | `BackupRestorePage` | 없음 | lazy, shared module |
| `/backups/restore/execute` | protected | `RequireAuth` → `AppLayout` | `BackupRestoreExecutePage` | 없음 | lazy |
| `/backups/restore/jobs` | protected | `RequireAuth` → `AppLayout` | `BackupRestoreJobsPage` | 없음 | lazy |
| `/backups/restore/jobs/:jobId` | protected | `RequireAuth` → `AppLayout` | `BackupRestoreJobDetailPage` | `jobId` | lazy |
| `/news-topics` | protected | `RequireAuth` → `AppLayout` | `NewsTopicsPage` | 없음 | lazy |
| `/news-topics/new` | protected | `RequireAuth` → `AppLayout` | `NewsTopicCreatePage` | 없음 | lazy |
| `/news-topics/:topicId` | protected | `RequireAuth` → `AppLayout` | `NewsTopicDetailPage` | `topicId` | lazy |
| `/news-topics/:topicId/edit` | protected | `RequireAuth` → `AppLayout` | `NewsTopicEditPage` | `topicId` | lazy |
| `/content/:postId/news-updates/new` | protected | `RequireAuth` → `AppLayout` | `NewsUpdateCreatePage` | `postId` | lazy |
| `/news-updates/:updateId` | protected | `RequireAuth` → `AppLayout` | `NewsUpdateDetailPage` | `updateId` | lazy |
| `/news-updates/:updateId/edit` | protected | `RequireAuth` → `AppLayout` | `NewsUpdateEditPage` | `updateId` | lazy |
| `/news-followups` | protected | `RequireAuth` → `AppLayout` | `NewsFollowupsPage` | 없음 | lazy |
| `/news-topics/:topicId/followups/new` | protected | `RequireAuth` → `AppLayout` | `NewsFollowupCreatePage` | `topicId` | lazy |
| `/news-followups/:followupId/edit` | protected | `RequireAuth` → `AppLayout` | `NewsFollowupEditPage` | `followupId` | lazy |
| `/briefing-prompts` | protected | `RequireAuth` → `AppLayout` | `BriefingPromptsPage` | 없음 | lazy |
| `/briefing-prompts/history` | protected | `RequireAuth` → `AppLayout` | `BriefingPromptHistoryPage` | 없음 | lazy |
| `/briefing-prompts/history/:runId` | protected | `RequireAuth` → `AppLayout` | `BriefingPromptRunDetailPage` | `runId` | lazy |
| `*` | protected | `RequireAuth` → `AppLayout` | `NotFoundPage` | 없음 | eager |

설정/관리 전용 route는 현재 repository에 없으므로 새 route를 만들지 않았다.

## Production build 결과

Phase 4C-0 baseline과 Phase 4C-1 build를 같은 `npm run build` 명령으로 비교했다.

| 항목 | Baseline | Phase 4C-1 | 변화 |
|---|---:|---:|---:|
| entry minified | 1,078.60 kB | 521.11 kB | 51.7% 감소 |
| entry gzip | 292.41 kB | 151.16 kB | 48.3% 감소 |
| page route chunk | 0 | 27 | 27개 증가 |
| PWA precache | 5 entries, 1,091.49 KiB | 67 entries, 1,112.74 KiB | lazy/shared chunk 포함 |

주요 route chunk는 다음과 같다. hash는 build마다 달라질 수 있다.

| 기능 | Chunk | Minified | Gzip |
|---|---|---:|---:|
| Import Dry Run/실행 | `ImportPage-*` | 52.84 kB | 16.61 kB |
| Import job 상세 | `ImportJobDetailPage-*` | 13.12 kB | 3.93 kB |
| Backup 생성 | `BackupPage-*` | 11.16 kB | 3.99 kB |
| Restore Dry Run/plan | `BackupRestorePage-*` | 25.48 kB | 6.64 kB |
| Restore 실행 | `BackupRestoreExecutePage-*` | 14.09 kB | 4.93 kB |
| Restore job 상세 | `BackupRestoreJobDetailPage-*` | 10.47 kB | 3.37 kB |

가장 큰 chunk는 entry `index-*` 521.11 kB(gzip 151.16 kB)다. 500 kB 경고는 이 entry 때문에 남는다. 별도 page chunk 중 가장 큰 것은 `ImportPage-*` 52.84 kB이며, 공유된 Restore validator `validateBackupForRestore-*`는 55.38 kB, 공통 schema `schemas-*`는 69.78 kB다. circular chunk warning은 없다.

## Backup, Restore, Import와 PWA 영향

Backup schema·canonical JSON·checksum, Restore validator·plan/execution helper, Import schema·normalizer는 해당 lazy page dependency graph로 이동해 초기 entry에서 분리됐다. 이 단계에서는 page 내부 feature module을 추가로 동적 import하지 않았다.

Vite PWA는 기존 `generateSW`와 `autoUpdate` 설정을 그대로 사용한다. Workbox는 27개 page route chunk와 공유 chunk를 precache하므로 설치 시 전체 다운로드량이 크게 줄지는 않지만 초기 페이지의 parse·execution 비용은 분리된다. 배포 직후 오래된 entry가 사라진 chunk를 요청하면 공통 route 오류 화면이 새로고침을 안내한다. 강제 또는 반복 reload는 하지 않는다. navigation fallback과 service worker build는 production build에서 유지된다.

## 후속 단계

- Phase 4C-2: entry에 남은 React, Router, Query, Supabase 등 공통/vendor dependency와 대형 feature 내부 module을 분석하고 필요한 경우 제한적인 chunk 전략을 적용한다.
- Phase 4C-3: entry/gzip/route chunk 예산과 production build 성능 회귀 gate를 추가한다.

Phase 4C-1에서는 DB schema, migration, seed, RLS, RPC, API 계약, route URL, 인증 정책과 Workbox cache 전략을 변경하지 않았다.

# Phase 4C-2 제한적 vendor chunk와 action-level feature loading

## 실제 graph 분석

Phase 4C-1 production build의 source map을 집계하고 Phase 4C-2 build manifest의 정적 import closure를 다시 계산했다. 별도 visualizer나 runtime dependency는 추가하지 않았다. Phase 4C-1 entry에서 확인한 주요 source byte와 조치는 다음과 같다.

| Module group | Phase 4C-1 entry 포함 | source 크기 영향 | 분리 후보 | 조치 |
|---|---|---:|---|---|
| React DOM·React·scheduler | 예 | React DOM 545.40 kB, scheduler 10.38 kB | 높음 | `vendor-react` |
| React Router | 예 | 405.32 kB | 높음 | `vendor-router` |
| TanStack Query | 예 | query-core 61.76 kB | 중간 | `vendor-query` |
| Supabase client와 하위 runtime | 예 | auth 409.11 kB, storage 108.47 kB, postgrest 106.43 kB, realtime 96.75 kB 등 | 높음 | `vendor-supabase` |
| Zod | shell에는 아니며 로그인·기능 route에서 사용 | route에 따라 큼 | 중간 | `vendor-validation` |
| PWA runtime | entry가 아닌 Workbox 동적 chunk | 5.71 kB minified | 낮음 | 자동 chunk 유지 |
| 공통 UI·repository | 일부 | 개별 모듈은 작음 | 낮음 | 자동 shared chunk 유지 |
| Backup schema·checksum·canonical JSON | Backup route dependency | route/action에 따라 중간 | 높음 | 생성 엔진만 action loader로 이동 |
| Restore validator·plan·UUID·execution | Restore route dependency | route/action에 따라 큼 | 높음 | validation·plan·execution loader로 각각 이동 |
| Import schema·normalizer·fingerprint | Import route dependency | 큼 | 높음 | analysis loader로 이동 |

large fixture나 대형 정적 데이터는 production graph에서 발견되지 않았다. Backup·Import feature root barrel과 `export *` 경로도 사용하지 않는다. page, loader와 aggregator는 실제 파일을 직접 import하며 Restore execute page에서 validation 결과 계약만 `import type`으로 참조한다.

## Vendor 그룹과 분류 원칙

선택한 그룹은 실제 graph에 반복 등장하며 크기가 의미 있는 다섯 개뿐이다.

| Chunk | 정확한 package 경계 | Minified | Gzip |
|---|---|---:|---:|
| `vendor-react` | `react`, `react-dom`, `scheduler` | 189.64 kB | 59.65 kB |
| `vendor-router` | `react-router`, `react-router-dom` | 93.69 kB | 31.07 kB |
| `vendor-query` | `@tanstack/react-query`, `@tanstack/query-core` | 36.39 kB | 10.84 kB |
| `vendor-supabase` | 정확한 `@supabase/*` scope package | 198.47 kB | 51.22 kB |
| `vendor-validation` | `zod` | 70.98 kB | 19.34 kB |

`build/vendorChunks.ts`의 순수 `manualChunks` 함수는 backslash를 slash로 바꾸고 query를 제거한 뒤 마지막 `node_modules` segment에서 실제 package 이름을 추출한다. scoped package는 두 segment를 사용하고 exact name으로만 분류한다. 따라서 Windows·POSIX path를 모두 처리하며 `reactive`, `react-router-extra`, `@supabaseish/*`, application source 같은 유사 문자열은 일치하지 않는다.

설치된 Vite 8.1.4와 Rolldown 1.1.5의 type/API를 확인한 결과 Rollup `manualChunks`와 `onlyExplicitManualChunks` option을 직접 지원하지 않는다. 지원되지 않는 option을 추가하지 않고 같은 pure classifier를 `build.rolldownOptions.output.codeSplitting.groups`의 동적 name에 연결했다. `includeDependenciesRecursively: false`로 분류되지 않은 application dependency를 vendor에 흡수하지 않고 `strictExecutionOrder`를 유지한다.

선택하지 않은 별도 그룹은 다음과 같다.

- `react-hook-form`과 `@hookform/resolvers`: 로그인 및 form route에만 필요하고 단독 대형 공통 chunk 근거가 없다.
- Workbox/PWA: 이미 별도 동적 runtime chunk이며 service worker 전략을 바꾸지 않는다.
- 기타 `node_modules`: catch-all vendor나 package별 자동 분리는 초기 waterfall과 작은 chunk 수를 늘린다.
- 공통 UI·repository: 작고 route graph의 자동 shared chunk가 더 자연스럽다.
- Backup·Restore·Import: 서로 하나의 vendor/feature chunk로 합치지 않고 사용자 action 경계를 유지한다.

## Feature module loader

다섯 loader는 모두 정적 literal import, 명시적 module 반환 type과 module-scope promise cache를 사용한다.

- `loadBackupGenerationModule`: relationship·secret 검사와 backup assembly/checksum 생성
- `loadRestoreValidationModule`: backup file/text parse와 checksum·schema·관계 검증
- `loadRestorePlanModule`: 결정적 UUID map, execution graph, fingerprint와 plan 생성
- `loadRestoreExecutionModule`: backup-plan 연결 검증, preflight, prepared record와 운영 Import 이력 준비
- `loadImportAnalysisModule`: current/legacy format parse, normalization, duplicate 후보, warning·fingerprint와 job 준비

첫 호출과 동시 호출은 같은 promise를 사용한다. 성공 promise는 같은 session에서 유지하므로 다시 다운로드하거나 초기화하지 않는다. import가 reject되면 해당 cache만 비워 다음 사용자 동작에서 재시도하며 loader 간 cache는 독립적이다. test importer injection은 loader와 page prop에만 제한했고 production 기본값은 실제 literal import다.

Backup page의 설명·profile·예상 개수 query는 즉시 유지하고 생성 버튼에서만 generation module을 요청한다. Restore Dry Run은 분석 버튼에서 validation module, Dry Run 완료 후 계획 화면에서 plan module, execute page는 실행 직전 재검증/준비 시 execution module을 요청한다. Import는 입력 UI와 category query를 먼저 표시하고 Dry Run 또는 영구 job 준비 동작에서 analysis module을 요청한다. Import/Restore job 목록과 상세 page는 이 분석·계획 엔진을 import하지 않는다.

기능 module loading은 route fallback과 별도로 action 영역의 `aria-busy`, `role="status"` 문구와 비활성 버튼으로 표시한다. 작업 중 입력 변경과 중복 클릭을 막고 기존 stale 무효화 정책을 유지한다. 비동기 import·repository 결과는 unmount된 component에 반영하지 않는다. 오류는 `BACKUP_MODULE_LOAD_FAILED`, `RESTORE_MODULE_LOAD_FAILED`, `IMPORT_MODULE_LOAD_FAILED`와 재시도 안내만 표시하며 raw message, stack과 chunk URL을 노출하거나 자동 reload하지 않는다.

## Production build 결과

동일한 `npm run build` 기준 결과다. entry 파일 감소는 vendor 파일로 이동한 효과이므로 아래 정적 closure 합계와 함께 판단한다.

| 항목 | Phase 4C-0 | Phase 4C-1 | Phase 4C-2 |
|---|---:|---:|---:|
| entry minified | 1,078.60 kB | 521.11 kB | 25.19 kB |
| entry gzip | 292.41 kB | 151.16 kB | 7.74 kB |
| 가장 큰 JS chunk | 1,078.60 kB | 521.11 kB | 198.47 kB |
| 500 kB warning | 있음 | 있음 | 없음 |
| circular chunk warning | 없음 | 없음 | 없음 |
| PWA precache | 5 / 1,091.49 KiB | 67 / 1,112.74 KiB | 81 / 1,138.88 KiB |

entry 자체는 Phase 4C-1 대비 minified 95.2%, gzip 94.9% 감소해 필수 400/120 kB와 우선 250/90 kB 목표를 모두 충족한다. 모든 JS chunk가 500 kB 미만이고 전체 JS asset 합계는 1,131.90 kB다. 가장 큰 것은 `vendor-supabase` 198.47 kB(gzip 51.22 kB)이며 build에 size 또는 circular warning이 없다.

manifest의 static import closure를 파일 중복 없이 합산한 값은 다음과 같다. route 열은 공통 shell을 포함한 누적 값이고 action 증분은 해당 route에서 최초 동작 시 추가되는 값이다.

| 진입/동작 | 누적 Minified | 누적 Gzip | 직전 경계 대비 추가 Minified |
|---|---:|---:|---:|
| 공통 인증·보호 shell | 545.33 kB | 161.70 kB | - |
| public login | 654.69 kB | 195.06 kB | 109.36 kB |
| dashboard | 546.27 kB | 162.22 kB | 0.94 kB |
| Backup route | 636.49 kB | 188.74 kB | shell 대비 91.16 kB |
| Backup 생성 action | 653.22 kB | 195.44 kB | route 대비 16.73 kB |
| Restore Dry Run route | 592.34 kB | 176.91 kB | shell 대비 47.01 kB |
| Restore validation action | 704.45 kB | 210.25 kB | route 대비 112.11 kB |
| Restore plan action | 730.98 kB | 218.46 kB | validation 대비 26.53 kB |
| Restore execute route | 554.59 kB | 165.05 kB | shell 대비 9.26 kB |
| Restore execute action | 722.92 kB | 217.95 kB | route 대비 168.34 kB |
| Import route | 571.94 kB | 171.86 kB | shell 대비 26.61 kB |
| Import analysis action | 699.89 kB | 210.48 kB | route 대비 127.95 kB |

Phase 4C-1 login의 확인 가능한 최소 주요 합계 628.72 kB(entry, Login, Zod/form schema chunks)와 비교하면 현재 654.69 kB는 25.97 kB, 4.1% 증가다. 이는 안정 vendor 경계용 runtime/import overhead이며 기능 엔진이 login closure로 들어오지 않았음을 manifest로 확인했다. vendor 파일을 합산하지 않고 entry 25.19 kB만 성능 개선으로 해석하지 않는다.

주요 action entry chunk는 `backupGeneration.module` 2.65 kB, `restoreValidation.module` 0.23 kB, `restorePlan.module` 0.15 kB, `restoreExecution.module` 7.44 kB, `importAnalysis.module` 35.23 kB다. 이 작은 aggregator가 필요한 기존 direct module과 shared dependency를 정적으로 연결하므로 실제 최초 action 비용은 위 manifest closure 증분을 기준으로 한다.

## PWA와 후속 단계

Vite PWA의 `generateSW`, `autoUpdate`, navigation fallback과 오래된 chunk mismatch 안내를 변경하지 않았다. 81개 route·feature·vendor chunk가 precache되어 설치 전체 다운로드는 1,138.88 KiB로 늘지만, route와 action별 parse·execution 시점은 분리된다. chunk 이름 충돌이나 build 실패는 없다.

Phase 4C-3에는 현재 문서 계산을 자동화하는 entry, largest chunk, 초기 closure와 total JS budget script/CI gate만 남긴다. 이번 단계에서는 budget gate, Workbox cache 전략, 인증 E2E infrastructure, DB schema·migration·RLS·RPC, route URL과 API 계약을 변경하지 않았다.
