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
| Total JS | 1,398,784 B | 정보성 | 23.6%, 최소 32,768 B |
| PWA precache | 93 entries / 1,448,744 B | 해당 없음 | 최소 12 entries / raw 24.2%, 최소 32,768 B |

각 byte metric의 유효 상한은 `min(absolute, max(baseline + minimumHeadroom, baseline + ceil(baseline × percentHeadroom)))`이다. 현재 build가 이 유효 상한을 넘으면 실패한다. 따라서 baseline, 비율 여유, 최소 여유, 절대 상한과 그 결과인 유효 상한을 서로 구분해야 한다. 별도로 모든 JS chunk는 500 KiB 이하여야 한다.

Phase 5K 조정 정책과 최종 검증 build 상태는 다음과 같다. Baseline은 과거 승인 측정값이고 current build는 Phase 5K 기능과 최종 Playwright communication remediation을 포함해 재빌드·검증한 산출물이다. bounded 정책 조정은 이후 전체 validation에서 성공적으로 검증되었다.

| Metric | Baseline | Percent headroom | Minimum headroom | Absolute limit | Effective limit | Current build | Remaining headroom |
|---|---:|---:|---:|---:|---:|---:|---:|
| Total JS raw | 1,131,895 B | 20.6% | 32,768 B | 1,364,992 B | 1,364,992 B | 1,331,657 B | 33,335 B |
| PWA precache raw | 1,166,460 B | 21.3% | 32,768 B | 1,414,916 B | 1,414,916 B | 1,381,613 B | 33,303 B |

PWA precache entry 정책은 절대 91 entries, baseline 대비 최소 10 entries 여유다. 유효 상한은 91 entries이며 현재 Phase 5K manifest도 91 entries이므로 discretionary post-build entry headroom은 0이다.

### Phase 5I와 Phase 5J 정책 이력

Phase 5I에서 Total JS 비율 여유는 10%에서 12%로 조정했다. PWA precache entry 최소 여유는 4에서 7로, raw 절대 상한은 1,280,000 B에서 1,306,436 B로, 비율 여유는 10%에서 12%로 조정했다. 이후 PWA raw 절대 상한을 1,306,436 B에서 1,314,699 B로, 비율 여유를 12%에서 12.70845121135744%로 조정했다.

Phase 5J에서는 Total JS 절대 상한을 1,280,000 B에서 1,331,200 B로, 비율 여유를 12%에서 17.6%로 조정했다. PWA raw 절대 상한은 1,314,699 B에서 1,376,423 B로, 비율 여유는 12.70845121135744%에서 18%로 조정했다.

Phase 5J는 승인된 Non-News Authoring Prompt Composer를 추가하며 runtime 증가는 기존 lazy non-news-context route에 격리된다. 새 third-party runtime dependency, eager-route 누출 또는 tree-shaking blocker는 발견되지 않았다. 계약을 보존하는 현실적인 최적화 여지는 약 4,000–8,000 B였지만 기존 위반 해소에는 약 29 KB 감소가 필요했으므로, 이전 정책을 맞추기 위해 승인된 기능 계약을 약화하는 방안은 채택하지 않았다. 대신 historical baseline과 checker semantics를 유지하고 현재 build 대비 약 32 KiB의 제한된 회귀 여유를 두는 정책 조정을 적용했다. 이는 bounded regression headroom adjustment이며 baseline reset, checker 완화, 무제한 예외, bundle accounting 제외 또는 checker 우회가 아니다. 이후 증가는 동일한 검토와 상한 적용을 받는다.

### Phase 5K 정책 조정

Phase 5K의 milestone은 `5K-C1 Non-News Human-Readable Response Import`이고 feature identifier는 `non-news-response-import`다. 새 lazy non-news response import workflow의 의도된 기능 증가가 조정 사유다.

정책 증거 검토 시점의 중간 측정은 Phase 5J Total JS raw 1,297,467 B에서 Phase 5K 1,331,560 B로 34,093 B 증가한 상태였다. 새 workflow chunk `assets/NonNewsResponseImportWorkflow-A87JbnsG.js`가 raw 32,613 B이며, 나머지 JS graph/shell delta는 1,480 B였다. 같은 시점의 PWA precache raw는 Phase 5J 1,343,580 B에서 Phase 5K 1,381,516 B로 37,936 B 증가했고, 이 가운데 JS contribution은 34,093 B, CSS contribution은 3,843 B였다. 이 1,331,560 B와 1,381,516 B는 최종 Playwright communication remediation과 재빌드 전의 증거 검토 측정값이며 최종 검증값이 아니다. PWA entry 수는 당시와 최종 모두 91이다.

Evidence review는 legitimate feature growth를 `True`로, avoidable implementation bloat, PWA configuration defect, baseline/tooling defect와 meaningful low-risk optimization available을 모두 `False`로 판정했다. Baseline reset은 필요하지 않다.

이에 따라 Total JS raw 정책은 absolute 1,364,992 B, percent headroom 20.6%, minimum headroom 32,768 B로 조정했다. effective allowance는 1,364,992 B이며 최종 검증값 1,331,657 B의 headroom은 33,335 B다. PWA precache raw 정책은 absolute 1,414,916 B, percent headroom 21.3%, minimum headroom 32,768 B로 조정했으며, effective allowance는 1,414,916 B이고 최종 검증값 1,381,613 B의 headroom은 33,303 B다. PWA precache entry 정책은 absolute 91, minimum headroom 10으로 조정했으며 effective allowance와 최종 검증값은 모두 91 entries라 post-build discretionary headroom은 0 entries다.

Historical baseline과 hybrid budget algorithm은 변경하지 않았다. Source optimization은 필요하지 않았고 production behavior를 약화하지 않았다. Dependency, package, lockfile 변경도 필요하지 않았으며 PWA configuration도 그대로다. 이 조정은 bounded Phase 5I/5J budget policy convention을 따른다. 조정 후 최종 bundle/PWA validation은 `PASSED`이며 violations 0, warnings 0이다. WordPress production readiness와 Playwright도 최종 validation authority에서 모두 통과했다.

### Phase 5L 정책 조정

Phase 5L의 milestone은 `5L-C1 News Human-Readable Response Import`다. 별도 bundle evidence review에서 기존 `/imports` route를 재사용하는 lazy news-response workflow의 측정값은 Total JS raw 1,365,611 B, PWA precache raw 1,415,567 B, PWA precache 93 entries였다. Phase 5L의 순 JS/PWA 증가는 33,954 B이며, `NewsResponseImportWorkflow` +31,718 B, `responseImportHtml` +2,860 B, `ImportPage` +1,022 B, `importDuplicates.repository` +569 B와 기존 `NonNewsResponseImportWorkflow` -2,215 B offset으로 구성된다. `NewsResponseImportWorkflow`와 `responseImportHtml`이라는 두 개의 필수 lazy PWA entry가 추가되었지만 새 route는 없다.

| Metric | Baseline | Percent headroom | Minimum headroom | Absolute limit | Current measured | Remaining headroom |
|---|---:|---:|---:|---:|---:|---:|
| Total JS raw | 1,131,895 B | 23.6% | 32,768 B | 1,398,784 B | 1,365,611 B | 33,173 B |
| PWA precache raw | 1,166,460 B | 24.2% | 32,768 B | 1,448,744 B | 1,415,567 B | 33,177 B |

Total JS raw 정책은 absolute 1,398,784 B, percentHeadroom 0.236, minimumHeadroom 32,768 B이고 PWA precache raw 정책은 absolute 1,448,744 B, percentHeadroom 0.242, minimumHeadroom 32,768 B다. PWA precache entry 정책은 absolute 93, minimumHeadroom 12이며 현재 측정값도 93 entries이므로 discretionary headroom은 0이다. 계약을 보존하면서 기존 한도를 해소할 만큼 충분한 안전한 source 축소 근거가 없어 Phase 5J/5K의 bounded-threshold convention에 따라 hard limit만 조정했다. Historical baseline과 bundle checker semantics는 변경하지 않았다.

이 조정은 제품 동작 확장이 아닌 정책 threshold 조정이다. 새 dependency, package/lock 변경, PWA configuration 변경 또는 vendor/chunk policy 변경은 없으며, `npm run bundle:check`는 이후 Gate에서 다시 실행해야 한다.

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
