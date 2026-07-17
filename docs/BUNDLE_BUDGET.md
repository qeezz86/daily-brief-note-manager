# Bundle budget

## 목적과 범위

Phase 4C-3은 Vite production manifest와 실제 `dist` 파일로 번들 구조를 자동 측정하고 의도하지 않은 성능 회귀를 Pull Request와 `main` push에서 차단한다. Phase 4C-2의 vendor group, route lazy 경계, feature loader, PWA 전략과 runtime 계약은 바꾸지 않는다.

## 측정 모델

모든 내부 값과 JSON baseline은 byte 단위다. CLI는 `bytes / 1024`인 KiB를 표시한다. gzip은 추가 package 없이 Node `gzipSync`의 고정 level 9 옵션으로 실제 파일을 압축한다.

Production manifest는 `dist/.vite/manifest.json`을 우선 사용하고 `dist/manifest.json`을 호환 위치로 탐색한다. `src/main.tsx`는 Vite 8 manifest의 단일 `isEntry` record로 결정하며 나머지 root는 정확한 source module key로 찾는다. 설정된 root, import reference 또는 output file이 하나라도 없으면 0 byte로 간주하거나 생략하지 않고 구성 오류로 실패한다.

- Entry: `src/main.tsx`가 만든 output chunk만 합산한다.
- Entry static closure: entry와 모든 재귀 static import의 합집합이다.
- Route closure: entry static closure와 route root static closure의 합집합이다.
- Route incremental: route closure에서 entry static closure를 뺀 추가 JS다.
- Feature standalone: 동적 feature module과 그 static imports다.
- Feature incremental: feature standalone에서 해당 route shell에 이미 포함된 asset을 뺀 action-time JS다. 이 값이 feature budget 대상이다.
- Largest chunk: raw와 gzip을 독립 차원으로 측정한다. 모든 JS asset 중 raw가 가장 큰 파일과 gzip이 가장 큰 파일을 각각 선택하며 서로 다른 asset일 수 있다. 같은 크기는 POSIX 형식으로 정규화한 파일명 오름차순으로 결정한다.
- Total JS: manifest가 참조하는 production application `.js` output의 합집합이다.

Dynamic import는 static closure를 따라가지 않고 다음 route나 feature root로 별도 측정한다. visited set으로 cycle을 종료하고 asset set으로 shared vendor와 alias output을 한 번만 합산한다. Source map, CSS, 이미지, 폰트, WebP, JSON data와 service worker는 application JS 합계에서 제외한다.

## Source roots

Entry root는 `src/main.tsx`다. 대표 route는 login, dashboard, content list/detail, news topic detail, briefing prompts, import, import job detail, backup, restore dry-run/plan, restore execute와 restore job detail이다. `/imports`와 `/imports/new`, `/backups`와 `/backups/new`, restore dry-run과 plan처럼 같은 page module을 공유하는 alias는 중복 metric을 만들지 않는다.

Feature roots는 다음과 같다.

- `src/features/backups/backupGeneration.module.ts`
- `src/features/backups/restoreValidation.module.ts`
- `src/features/backups/restorePlan.module.ts`
- `src/features/backups/restoreExecution.module.ts`
- `src/features/imports/importAnalysis.module.ts`

## 상한과 회귀 정책

`config/bundle-budget.json`은 정책과 절대 상한, `config/bundle-baseline.json`은 승인된 실제 측정값만 저장한다. Baseline에는 hashed filename을 저장하지 않는다.

| 대상 | 절대 raw | 절대 gzip | baseline 정책 |
|---|---:|---:|---|
| Entry output | 40 KiB | 15 KiB | 최소 4 KiB / 2 KiB 증가 허용 |
| Largest chunk | 250 KiB | 75 KiB | 15%, 최소 8 KiB / 4 KiB |
| Login closure | 700 KiB | 210 KiB | 8%, 최소 16 KiB / 8 KiB |
| 다른 route closure | 900 KiB | 280 KiB | 10%, 최소 16 KiB / 8 KiB |
| Route incremental | 300 KiB | 100 KiB | 15%, 최소 8 KiB / 4 KiB |
| Feature incremental | 250 KiB | 75 KiB | 15%, 최소 8 KiB / 4 KiB |
| Total JS | 1,250 KiB | 정보성 | 10%, 최소 32 KiB |
| PWA precache | 90 entries / 1,250 KiB | 해당 없음 | 2 entries / 10%, 최소 32 KiB |

회귀 허용값은 `max(baseline + minimumHeadroom, baseline + ceil(baseline × percentHeadroom))`이고 마지막에 절대 상한으로 제한한다. 현재 값이 회귀 허용값 또는 절대 상한 중 하나라도 넘으면 실패한다. 별도로 모든 JS chunk는 500 KiB 이하여야 한다.

## 현재 승인 baseline

Vite 8.1.4 production build의 승인값이다. gzip은 checker의 고정 계산값이므로 Vite 표의 반올림 표시와 조금 다를 수 있다.

| Metric | Raw | Gzip |
|---|---:|---:|
| Entry output | 25,194 B | 7,718 B |
| Entry static closure (정보성) | 545,331 B | 159,884 B |
| Login closure | 654,693 B | 192,961 B |
| Dashboard closure | 546,273 B | 160,409 B |
| Largest chunk | 198,470 B (`vendor-supabase`) | 58,867 B (`vendor-react`) |
| Total JS | 1,131,895 B | 정보성 356,118 B |
| PWA precache | 81 entries / 1,166,460 B | 해당 없음 |

Route와 feature 전체 승인값은 `config/bundle-baseline.json`에 있다. 주요 incremental raw 값은 login 109,362 B, briefing prompts 135,038 B, import job detail 118,991 B, backup 91,162 B, restore dry-run/plan 47,012 B다. Feature incremental raw 값은 backup generation 16,731 B, restore validation 112,111 B, restore plan 98,175 B, restore execution 168,335 B, import analysis 127,951 B다.

Largest chunk의 gzip baseline은 최초 analyzer가 raw 최대 asset인 `vendor-supabase`의 gzip 50,700 B를 저장하던 정의를 교정해, 실제 gzip 최대 asset인 `vendor-react`의 58,867 B로 변경했다. Windows와 Node 22 Linux의 production-like build가 동일한 chunk graph와 byte 값을 생성함을 확인한 뒤 반영했으며, raw baseline과 모든 절대 상한은 변경하지 않았다. Baseline과 report의 JSON 형식은 그대로이고 report 필드 추가는 하위 호환이므로 version 1을 유지한다.

## 명령과 로컬 절차

```bash
npm run build
npm run bundle:check
```

`npm run build:budget`은 두 명령을 한 번에 실행한다. `bundle:check`는 기존 `dist`만 검사하며 baseline을 수정하지 않는다. 통과는 exit code 0, budget 초과는 1, manifest·config·source·asset 오류는 2를 반환한다. 기본 출력은 ANSI 제어문자나 raw stack 없이 현재값, gzip, baseline, 허용값과 PASS/INFO/FAIL을 보여준다.

Baseline 갱신 절차:

1. 코드 변경 후 production build와 기존 budget 실패를 확인한다.
2. 증가 원인과 최적화 가능성을 분석한다.
3. 의도된 증가일 때만 `npm run bundle:baseline`을 실행한다.
4. 출력된 전후 차이와 `config/bundle-baseline.json` diff를 검토한다.
5. 절대 상한은 별도로 검토하고 이유 없이 높이지 않는다.
6. 코드와 baseline 변경 이유를 같은 PR에 기록하고 CI로 재검증한다.

CI에서는 baseline 갱신 명령이 실패한다. Dependency 변경마다 습관적으로 baseline을 갱신하거나 budget 실패 시 현재값으로 자동 덮어쓰지 않는다.

## CI gate와 report

`.github/workflows/bundle-budget.yml`은 `pull_request`와 `main` push에서 Node 22, npm cache, `npm ci`, `npm run build`, `npm run bundle:check`를 실행한다. Gate에는 `continue-on-error`나 `|| true`가 없다. 성공·실패 모두 `artifacts/bundle-budget-report.json`만 7일 artifact로 올리며 `dist`, source map, 환경변수와 secret은 올리지 않는다.

CI build는 `VITE_SUPABASE_URL=http://127.0.0.1:54321`과 `VITE_SUPABASE_PUBLISHABLE_KEY=ci-public-placeholder-key`라는 비밀정보 없는 공개 placeholder를 사용한다. 이는 Supabase module을 포함하는 production graph를 결정적으로 생성하기 위한 build-time 설정이며 CI에서 브라우저나 앱 서버를 실행하지 않으므로 원격 Supabase에 연결하지 않는다. 실제 project URL, publishable key, service role 또는 GitHub secret은 저장하지 않는다. 설정이 없는 로컬 build는 앱의 configuration-error fallback에 따라 Supabase module graph가 제거될 수 있으므로 bundle baseline 검증에는 같은 production-like placeholder를 사용한다.

Report schema version 1에는 manifest의 저장소 상대 경로, config/baseline version, metric과 limit, violation/warning, size 내림차순 chunk, route/feature closure asset과 pass 상태가 포함된다. `largest-chunk` metric과 `largestChunks` 필드는 raw와 gzip의 선택 asset과 byte 값을 각각 기록한다. 생성 report에는 전체 source code, 환경변수, 사용자명, 사용자 home 또는 Windows 절대 경로를 넣지 않는다. Hashed output filename은 실행 결과 추적을 위해 report에만 포함할 수 있고 baseline에는 포함하지 않는다.

## PWA precache

`generateSW`가 만든 `dist/sw.js`의 Workbox `precacheAndRoute` 배열을 작은 구조 parser로 읽는다. Service worker를 Node에서 실행하거나 `eval`하지 않고, minified 문자열에 대한 단일 정규식에도 의존하지 않는다. URL별 실제 `dist` file size를 합산하고 중복 URL을 제거한다. 배열 또는 파일을 신뢰성 있게 해석하지 못하면 구성 오류로 실패하므로 현재 PWA entry 수와 size는 hard gate다.

## 실패 해석과 예외 승인

실패 메시지의 metric, dimension, current, baseline, allowed, absolute, excess, increase ratio와 source root를 먼저 확인한다. Root나 asset 누락은 manifest/config 오류이므로 baseline 갱신으로 해결하지 않는다. 성능 증가는 code split과 dependency graph를 우선 분석하고, 제품상 필요한 증가임이 설명될 때만 baseline을 변경한다. 절대 상한 변경은 별도의 근거와 리뷰가 필요하다.

Phase 5 전 기준은 모든 configured root 측정, entry/login/largest/total/PWA budget 통과, 개별 chunk 500 KiB 이하, route lazy와 feature loader 유지, PWA build와 인증 fallback 유지다.
