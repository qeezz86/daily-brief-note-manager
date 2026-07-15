# Daily Brief Note Backup Format

## 1. 범위

Phase 4B-1의 공식 전체 백업 형식은 `daily-brief-note-backup` schema version `1`이다. 이 파일은 현재 인증 사용자의 데이터를 장기 보관하고 후속 복구 기능의 입력 계약으로 사용한다. 콘텐츠 Import용 `daily-brief-note-content-import`와는 서로 다른 형식이며 `/imports`에서 사용할 수 없다.

백업 생성은 읽기 전용이다. 복구, 자동 업로드, 예약 백업, CSV export, WordPress media·HTML 외부 asset 수집은 이 단계에 포함하지 않는다. 이미지 파일은 저장하지 않고 게시물에 이미 저장된 `imagePrompt`, `imageAlt`와 선택적 prompt metadata만 콘텐츠 행의 일부로 내보낸다.

## 2. 최상위 구조

```json
{
  "format": "daily-brief-note-backup",
  "schemaVersion": 1,
  "profile": "core",
  "exportedAt": "2026-07-15T03:04:05.000Z",
  "appVersion": null,
  "manifest": {
    "profile": "core",
    "sectionNames": [],
    "sectionCounts": {},
    "totalRecords": 0,
    "generatedPromptCount": 0,
    "includesOperationalHistory": false,
    "categoryManifestCount": 0,
    "categoryManifest": [],
    "relationshipCheck": "passed",
    "snapshotSchemaVersion": 1
  },
  "data": {},
  "checksum": {
    "algorithm": "SHA-256",
    "value": "64자리 소문자 16진수"
  }
}
```

- JSON key는 camelCase다.
- `exportedAt`은 UTC RFC 3339/ISO 8601 문자열이다.
- `appVersion`을 빌드에서 확인할 수 없으면 `null`이다.
- 관계 복원에 필요한 내부 UUID와 생성·수정 시각을 보존한다.
- `ownerId`, 인증 사용자 정보, Supabase token·key, browser storage는 포함하지 않는다.
- nullable DB 값은 필드를 삭제하지 않고 JSON `null`로 보존한다.

## 3. Profile과 section

`core`는 기본 profile이며 다음 section을 순서대로 포함한다.

1. `posts`
2. `seoData`
3. `tags`
4. `postTags`
5. `sources`
6. `aiMetadata`
7. `infoDbMetadata`
8. `chineseMetadata`
9. `seriesCounters`
10. `newsTopics`
11. `newsStatusHistory`
12. `newsUpdates`
13. `newsFollowups`
14. `generatedPrompts`

`full`은 위 section 뒤에 `importJobs`, `importJobItems`, `importJobItemAttempts`를 추가한다. 따라서 Import item의 `normalizedPayload`와 attempt 오류·결과 이력이 포함될 수 있다. 비밀정보 검사를 통과하지 못하면 어떤 profile도 파일을 만들지 않는다.

## 4. Category manifest

`categories`는 공용 seed이므로 `data`에 복제하지 않는다. 대신 manifest는 모든 category의 다음 현재 설정을 포함한다.

- `id`, `contentGroup`, `name`, `code`
- `wrapperClass`, `displayIdPattern`, `slugPattern`
- `sortOrder`, `enabled`

복구 기능은 이 manifest를 사용해 백업 당시 category 의미와 대상 환경 설정의 호환성을 확인해야 한다. category 설정 차이가 과거 게시물의 display ID나 slug를 자동 변경해서는 안 된다.

## 5. Snapshot과 결정적 정렬

RPC는 모든 사용자 data section을 하나의 data-bearing SQL statement에서 읽는다. 각 사용자 소유 table은 `auth.uid()`로 명시적으로 제한하고 RLS를 우회하지 않는다. 동일 snapshot과 동일 metadata로 생성한 canonical payload가 항상 같은 byte sequence를 갖도록 object key를 사전식으로 정렬하고 array는 section별 안정적인 식별자·순서 key로 정렬한다.

## 6. 관계 검증

파일 생성 전에 최소한 다음 관계를 확인한다.

- post를 참조하는 SEO, tag relation, source와 category metadata의 post 존재
- tag relation의 tag 존재
- source가 참조하는 news update 존재
- news status·update·followup이 참조하는 topic 존재
- news update의 post와 previous update 존재 및 같은 topic 관계
- Import item의 job, attempt의 job item, 선택적 imported post 존재

하나라도 실패하면 `relationshipCheck`를 `passed`로 만들거나 파일을 다운로드하지 않는다.

## 7. 민감정보 검사

최종 payload의 모든 object key와 문자열 값을 재귀 검사한다. `owner_id`/`ownerId`, password, access·refresh token, authorization, cookie, service-role key 같은 금지 key나 JWT, Bearer token, Supabase secret key 형태가 발견되면 생성을 중단한다. 검사 오류에는 민감한 실제 값을 표시하지 않는다.

## 8. Canonical JSON과 checksum

1. `checksum`이 없는 최상위 payload의 object key를 재귀적으로 사전식 정렬한다.
2. array 순서는 변경하지 않고 JSON escape·number·boolean·null을 표준 `JSON.stringify` 표현으로 직렬화한다.
3. UTF-8 byte sequence에 Web Crypto `SHA-256`을 적용한다.
4. 결과를 64자리 소문자 16진수로 `checksum.value`에 기록한다.
5. 완성 직후 checksum을 제거한 payload를 같은 방식으로 다시 계산해 일치 여부를 확인한다.

checksum은 전송·저장 중 우발적 변경을 탐지하기 위한 것이며 전자서명이나 신원 증명은 아니다.

## 9. 크기와 다운로드

- 생성 전 profile별 section count를 표시한다.
- 최종 pretty-printed UTF-8 JSON이 20 MiB 이상이면 큰 파일 경고를 표시한다.
- 100 MiB를 초과하면 다운로드 파일을 만들지 않는다.
- UTF-8 BOM은 사용하지 않는다.
- 파일명은 `daily-brief-note-backup-{profile}-YYYY-MM-DD-HHmmss.json`이며 timestamp는 `Asia/Seoul` 기준이다.
- 같은 생성 결과는 사용자가 다시 생성하기 전까지 checksum·manifest 복사와 재다운로드에 그대로 사용한다.
