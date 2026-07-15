# Phase 4B-4A 실행 테스트 매트릭스

이 문서는 Phase 4B-4A 요청서의 독립 요구사항을 실제 테스트 파일과 연결한다. `covered`는 성공 경로만 공유하는 간접 검증이 아니라 해당 무결성·권한·상태 전이를 명시적으로 assertion하는 경우에만 사용한다.

## DB pgTAP

| 요구 번호 | 요구사항 | 테스트 파일 | 대표 테스트 이름/범위 | 상태 |
|---|---|---|---|---|
| DB-A | Job 준비 | `restore_jobs.test.sql`, `restore_jobs_preparation_security.test.sql` | create/owner/idempotency, profile·operational 차단, append snapshot, count·dependency·target preflight, 정상 finalize | covered |
| DB-B | 권한·RLS | `restore_jobs.test.sql`, `restore_jobs_preparation_security.test.sql` | anon/PUBLIC execute, SELECT-only table grant, 타 사용자 RLS·RPC, owner payload 주입, 직접 write 차단 | covered |
| DB-C | Stage barrier | `restore_jobs.test.sql`, `restore_jobs_stage_actions_retry.test.sql` | pending/running/failed/cancelled 차단, sequence, terminal 통과, paused/completed | covered |
| DB-D | Action | `restore_jobs.test.sql`, `restore_jobs_stage_actions_retry.test.sql` | preserve/remap/create/reuse/skip, mismatch, idempotency, target·unique 신규 충돌 | covered |
| DB-E | Tags·posts | `restore_jobs_content_sections.test.sql` | tag preserve/remap/normalized unique, post owner·timestamp, slug/URL/briefing/series 충돌, rollback | covered |
| DB-F | SEO·metadata | `restore_jobs_content_sections.test.sql` | SEO·AI·정보DB·중국어, false/null, category mismatch, 실패 상태·rollback | covered |
| DB-G | 관계·counter | `restore_jobs_content_sections.test.sql`, `restore_jobs_stage_actions_retry.test.sql` | postTag remap/dependency/retry, counter create·증가·비감소·사용자 격리 | covered |
| DB-H | 뉴스 데이터 | `restore_jobs_news_prompts.test.sql` | topic/history/update/order, previous self·cycle, source-update/post, followup·closed topic | covered |
| DB-I | Prompt·timestamp | `restore_jobs_news_prompts.test.sql`, `restore_jobs_content_sections.test.sql` | text/snapshot/pin/owner 제외, preserve/default timestamp, invalid timestamp | covered |
| DB-J | Retry·취소·오류 | `restore_jobs.test.sql`, `restore_jobs_stage_actions_retry.test.sql`, `restore_jobs_news_prompts.test.sql` | attempt 증가, safe code/raw 비노출, retry 성공, 성공 idempotency, cancel/resume/stale | covered |

## Frontend Vitest/RTL

| 요구 번호 | 요구사항 | 테스트 파일 | 대표 테스트 이름/범위 | 상태 |
|---|---|---|---|---|
| FE-A | Backup·plan 입력 검증 | `backupRestoreExecutionValidation.test.ts` | 정상 연결, schema/checksum/profile/fingerprint, operational, lookup, stale/remap 충돌 | covered |
| FE-B | 최종 확인 | `BackupRestoreExecutePage.test.tsx` | action/counter 수, no rollback·부분 성공·브라우저·운영 이력 안내, RESTORE 일치 | covered |
| FE-C | Job 준비 | `prepareRestoreJob.test.ts`, `restoreJobPreparation.test.ts` | snapshot, 100개/UTF-8/4 MiB, oversized, 순차 create→append→finalize, 재개·실패 | covered |
| FE-D | 목록·상세 | `BackupRestoreJobsPage.test.tsx`, `BackupRestoreJobDetailPage.test.tsx`, `restoreJobActions.test.ts` | 최근 100개, 진행률/stage/metadata/record/action/attempt, 모든 filter·검색·post 링크 | covered |
| FE-E | 실행 orchestration | `prepareRestoreJob.test.ts`, `restoreJobExecution.test.ts`, `BackupRestoreJobDetailPage.test.tsx` | stage/sequence 순차 RPC, 독립 실패 계속, stop/resume, retry, 응답 유실, busy lock | covered |
| FE-F | 취소·재개 | `BackupRestoreJobDetailPage.test.tsx`, `restoreJobActions.test.ts` | confirmation, rollback 아님, pending 취소, cancelled 재개, stale 실패 | covered |
| FE-G | 결과·보안 | `restoreJobActions.test.ts`, `BackupRestoreExecutePage.test.tsx`, `BackupRestoreJobDetailPage.test.tsx` | 집계, JSON/plain text 복사, raw 오류·owner·HTML 비노출, 미인증·미설정 차단 | covered |
| FE-H | 회귀 | 기존 backup/restore/import/router test suite와 전체 Vitest | Phase 4B-1/2/3, content/news/import job 회귀 포함 전체 suite | covered |

## 최종 수량

- DB: 기존 548 + Phase 4B-4A 신규 163 = 총 711 assertions
- Frontend: 기존 823 + Phase 4B-4A 신규 116 = 총 939 tests
- 기존 Phase 4B-4A의 DB 34개·Frontend 3개는 유지했으며 위 신규 수에 포함한다.
