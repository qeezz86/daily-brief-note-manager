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
