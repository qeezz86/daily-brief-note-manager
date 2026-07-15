# Core and Full Operational Restore Execution

## 입력과 준비

`/backups/restore/execute`에서 원본 backup JSON과 restore plan JSON을 함께 선택한다. 클라이언트는 checksum, schema, 관계, 민감정보, fingerprint, profile 연결, category 호환성과 최신 DB 충돌을 다시 검사한다. warning·blocked·partial DB 조회, stale plan과 remap target 충돌은 차단한다. core/include는 차단하고 full/include는 세 운영 section과 action·stage·source reference가 모두 완전할 때 허용한다. 최종 실행에는 `RESTORE` 문자열이 필요하다.

준비는 `create_restore_job` → `append_restore_job_records` → `finalize_restore_job` 순서다. snapshot은 최대 100개와 4 MiB UTF-8 요청 제한을 동시에 적용해 순차 등록한다. 한 record가 제한을 넘으면 `RESTORE_RECORD_TOO_LARGE`로 명시적으로 중단한다. 동일 fingerprint snapshot 재전송은 idempotent하고 다른 payload는 충돌한다.

## 실행과 stage barrier

브라우저는 현재 stage의 record를 sequence 순서로 하나씩 `run_restore_job_record`에 전달한다. RPC 입력은 record ID뿐이고 payload·owner·target은 DB snapshot에서 읽는다. 이전 stage의 모든 record가 applied·reused·skipped여야 다음 stage가 열린다. 같은 stage의 실패는 다른 독립 record 실행을 막지 않지만 stage 종료 후 job은 `paused_with_errors`가 된다.

각 record는 별도 transaction이다. domain write와 성공 상태가 같이 commit되며 실패 domain write는 rollback한 뒤 안전한 attempt만 남긴다. 성공 record 재호출은 기존 결과를 반환한다. 두 탭 호출은 job/record row lock으로 직렬화한다.

## 데이터 정책

지원 section은 tags, posts, SEO·category metadata, postTags, seriesCounters, news topics·history·updates·previous links, sources, followups, generated prompts와 full/include의 importJobs·importJobItems·importJobItemAttempts다. owner ID는 `auth.uid()`에서 주입하고 explicit column insert만 사용한다.

기존 row overwrite·merge나 일반 update는 하지 않는다. reuse/skip은 exact 상태를 매번 확인한다. series counter는 `greatest(current, planned)`만 허용한다. previous link는 이 job에서 생성한 update에만 연결한다.

full/include는 모든 core stage가 terminal 성공한 뒤 importJobs, importJobItems, importJobItemAttempts 순서로 진행한다. 신규 운영 row는 preserve/remap하고 기존 row는 source fingerprint와 핵심 metadata·payload·관계·상태·시각이 exact match일 때만 reuse한다. normalized payload는 fingerprint와 구조·금지 key·크기 제한을 다시 검사하고 수정 없이 보존한다. 운영 stage 실패 시 job은 `paused_with_errors`가 되며 core 결과는 유지된다.

신규 Import job은 원 status를 보존하면서 `restored_from_backup=true`, `execution_locked=true`와 backup checksum provenance를 갖는다. content/tracking 실행, retry, continue, cancel, resume, append와 finalize는 `IMPORT_JOB_EXECUTION_LOCKED`로 차단한다. 목록·상세 조회, 안전한 결과 복사와 게시물 링크는 유지한다. exact reuse 기존 job은 잠금·provenance·status·시각을 변경하지 않는다. live resume 지원은 향후 별도 schema version과 migration 범위다.

Timestamp 정책은 `preserve`와 `database_default`다. preserve는 backup RFC3339 값을 사용하고 database_default는 DB 실행 시각을 사용한다. stage/sequence는 timestamp와 독립적이다.

## Resume, retry, cancel

`/backups/restore/jobs/:jobId`는 새로고침 후 DB 상태에서 이어서 실행한다. 자동 retry와 background worker는 없다. retry 가능한 현재 stage 실패만 수동 재시도한다. 취소는 pending record만 cancelled로 바꾸며 이미 생성된 row는 유지한다. 재개 시 target 충돌을 다시 확인한다. restore undo와 이전 성공 stage 자동 rollback은 지원하지 않는다.

작업 목록과 상세는 실제 record 집계로 진행률을 계산하고 안전한 오류만 표시·복사한다. raw SQLSTATE, constraint 이름, SQL, stack trace와 인증 정보는 저장하거나 반환하지 않는다.
