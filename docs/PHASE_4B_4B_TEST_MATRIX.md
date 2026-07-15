# Phase 4B-4B Test Matrix

## 범위

full profile의 Import 운영 이력 복원, exact reuse, provenance·실행 잠금, core 이후 stage barrier와 기존 core/Import 회귀를 검증한다. 원격 Supabase는 사용하지 않고 로컬 migration과 pgTAP만 실행한다.

## DB 검증

`supabase/tests/restore_import_history.test.sql`은 80 assertions로 다음을 검증한다.

- provenance 기본값·check constraint·직접 write 제한과 backup snapshot 필드
- full/include 준비·finalize, core → jobs → items → attempts stage barrier
- job/item/attempt UUID·상태·timestamp·payload·관계 보존
- 신규 job의 backup checksum provenance와 실행 잠금
- append, finalize, content, tracking, cancel, resume의 status 독립 잠금
- exact reuse 시 기존 일반 job·item·attempt와 잠금 상태 불변
- PUBLIC·anon 실행 제한과 안전한 RLS 경계

기존 restore·Import pgTAP을 함께 실행해 core/exclude와 일반 Import job 동작을 회귀 검증한다. pgTAP `plan()`은 실제 assertion 수와 일치해야 한다.

## 프런트엔드 검증

신규 단위 테스트는 다음을 검증한다.

- optional provenance가 있는/없는 schema version 1 full snapshot
- job/content/tracking/attempt 상태 enum과 잘못된 잠금·checksum 조합
- item key·attempt key 중복, 부모·post·tracking·상태·timestamp 일관성
- normalized payload schema/category/tracking/fingerprint/depth/금지 key
- safe error의 token·SQL·constraint·stack·인증 패턴 차단
- full include/exclude와 core include 차단, operational stage 생성
- 실행 전 job/item/attempt 수, 실행 잠금과 core 유지 안내
- Import 목록의 복원 badge·origin 축약, 잠긴 상세 액션 제거
- `IMPORT_JOB_EXECUTION_LOCKED`의 raw 오류 비노출 mapping

Phase 4B-4B에서 86 tests를 추가해 전체 프런트 테스트는 1,025개다. DB는 신규 80 assertions를 더해 전체 791개다.

## 완료 명령

```bash
npm run db:start
npm run db:reset
npm run db:lint
npm run test:db
npm run lint
npm run test
npm run test
npm run test -- --maxWorkers=1 --testTimeout=20000
npm run build
git diff --check
git diff --stat
git status
```

기본 병렬 테스트는 2회 연속, 단일 worker는 1회 통과해야 한다. React act/open-handle 경고가 없어야 하며 기존 500 kB bundle 경고는 결과에 기록한다.
