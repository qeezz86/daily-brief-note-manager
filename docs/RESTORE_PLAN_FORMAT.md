# Daily Brief Note Restore Plan Format

## 1. 범위

복원 계획의 공식 형식은 `daily-brief-note-restore-plan` schema version `1`, plan version `1`이다. 계획은 Phase 4B-1 백업과 Phase 4B-2 DB 충돌 분석을 참조하는 실행 지침이며 콘텐츠 백업 자체가 아니다. Phase 4B-3에서는 계획만 생성하고 DB를 변경하지 않는다.

## 2. 최상위 구조

```json
{
  "format": "daily-brief-note-restore-plan",
  "schemaVersion": 1,
  "planVersion": 1,
  "status": "ready",
  "createdAt": "2026-07-15T03:04:05.000Z",
  "backup": { "format": "daily-brief-note-backup", "schemaVersion": 1, "profile": "core", "checksum": "64자리 소문자 16진수", "exportedAt": "2026-07-15T00:00:00.000Z" },
  "analysis": { "fingerprint": "64자리 소문자 16진수", "createdAt": "2026-07-15T03:04:05.000Z", "databaseLookupStatus": "complete", "recheckRequiredBeforeExecution": true },
  "policies": {},
  "categoryMappings": [],
  "recordActions": [],
  "idMap": {},
  "executionStages": [],
  "summary": {},
  "issues": [],
  "fingerprint": { "algorithm": "SHA-256", "value": "..." }
}
```

`status`는 `ready`, `warning`, `blocked`다. error issue, block action, incomplete DB lookup, 필수 category/관계/target 오류가 하나라도 있으면 `blocked`다.

## 3. 정책과 action

전역 정책은 ID 충돌, 동일 데이터, 운영 이력, 비활성 category, pattern 차이와 timestamp를 다룬다. 충돌 record에는 허용된 범위에서 `recordOverrides`를 지정할 수 있다. 지원 action은 `create`, `preserve_id`, `remap_id`, `reuse_existing`, `skip`, `block`이다. overwrite와 update action은 없다.

`recordActions`는 section, source ID, target ID, action, conflict type, 안정적 reason code, dependency, warning과 짧은 safe display만 담는다. 본문이나 prompt 원문을 넣지 않는다.

## 4. 결정적 ID map

원 ID만 충돌한 UUID row는 애플리케이션 고정 namespace 아래에서 `backupChecksum:section:originalId:v1` 이름을 사용하는 UUID v5로 remap한다. 같은 입력은 같은 UUID를 만들고 section 또는 백업 checksum이 다르면 다른 UUID를 만든다. 원 ID와 같은 target, 잘못된 UUID v5, 같은 section의 target 중복 또는 현재 DB target 충돌은 block한다. category와 owner ID는 UUID remap 대상이 아니다.

## 5. 관계와 실행 stage

모든 관계 dependency는 ID map 또는 같은 ID의 category mapping으로 해석 가능해야 한다. 실행 stage는 결정적 순서를 유지하고 `newsUpdates`의 previous 관계는 topological order로 정렬한다. missing previous, self cycle과 장주기 cycle은 block한다. `seriesCounters`는 백업 값과 현재 값의 최댓값만 계획하며 감소시키지 않는다.

## 6. Fingerprint

fingerprint 입력은 plan version, backup metadata/checksum, DB analysis fingerprint/status, 정책, category mapping, record action, ID map, execution stage, summary와 issue다. object key를 재귀 사전식 정렬하는 canonical JSON의 UTF-8 bytes에 SHA-256을 적용한다. 파일 표시용 `createdAt`과 fingerprint 자체는 입력에서 제외하므로 같은 backup·DB 분석·정책은 같은 fingerprint를 만든다.

## 7. 보안과 파일

계획에는 owner ID·email·인증 정보, 전체 HTML, prompt text, Import normalized payload, 전체 backup data와 raw DB 오류를 포함하지 않는다. 파일 MIME은 `application/json;charset=utf-8`, 파일명은 `daily-brief-note-restore-plan-YYYY-MM-DD-HHmmss.json`이며 시각은 `Asia/Seoul` 기준이다. Blob URL은 다운로드 trigger 뒤 즉시 revoke한다.

blocked 또는 stale 계획은 복사·다운로드할 수 없다. Phase 4B-4는 실행 직전에 현재 DB 분석과 remap target 충돌을 다시 확인해야 한다.
