# WordPress post-status reconciliation (Phase 5N-C1)

Phase 5N-C1 adds an explicit, user-triggered WordPress post-state check. It is a read-only reconciliation preview, not automatic synchronization.

## Eligibility and identity

Only an owner-scoped, succeeded `create_draft` publication attempt with a positive stored `wordpress_post_id` is eligible. Manual imports, executing attempts, failed or uncertain attempts, and attempts without that exact ID are excluded. The browser sends only `action=check-post-status`, `contentId`, and `attemptId`; it cannot select a WordPress ID, endpoint, query, URL, or credential.

## Remote read and preview

The Edge Function derives the exact ID and server configuration from the trusted attempt, then performs only `GET /wp-json/wp/v2/posts/{id}?context=edit&_fields=id,slug,status,link,modified_gmt,date_gmt`. It accepts only `draft`, `pending`, `private`, `publish`, `future`, and `trash`, uses manual redirects, an eight-second timeout, and a 1 MiB response cap. Credentials remain server-only.

The result is ephemeral. It does not mutate the publication attempt, persist synchronization state, or update local content. `IN_SYNC` may include observed `STATUS_CHANGED`, `SLUG_CHANGED`, and `LINK_CHANGED` deltas. A draft changing to publish is an externally observed `STATUS_CHANGED`; the app does not infer `REMOTE_MODIFIED` from the informational remote timestamp.

## Explicit boundaries

There is no WordPress publish, update, delete, media, taxonomy, or metadata write; no automatic retry, polling, background refresh, cron, webhook, queue, or route. Uncertain, inaccessible, missing, or identity-mismatched results provide manual-reconciliation guidance.

## Network-only loading boundary

The status-check capability requires a live browser connection, the Edge Function, and WordPress. Its deferred client asset is therefore network-only: if that asset cannot load, the page must show a bounded load/offline error, make no Edge call, and never present a stale remote status as fresh. The existing Content Detail shell remains available from the normal precache.

C3 production hardening and runtime verification remain required before any production release of this capability.

## Phase 5N unresolved Chromium validation exception

**Scope:** Phase 5N / `5N-C1 WORDPRESS_POST_SYNC_READ` (`wordpress-post-sync`).

| Area | Status | Authority consequence |
| --- | --- | --- |
| Focused validation, lint, Build #5, Bundle #2, full local test, and readiness | PASS | Does not establish browser validation. |
| Chromium #3 | `AUTHORITATIVE_FAIL`: the WordPress post-status UI remained pending. | Root cause and product-vs-E2E causation remain unresolved. |
| Full validation | INCOMPLETE; Chromium PASS is false and browser behavior is unverified. | No merge, release, deployment, or Phase closure authority. |
| Development-progress exception | GRANTED, as governance risk acceptance only. | Allows narrow development progression; it is not technical validation success. |
| Merge, release, and Phase-closure exceptions | NOT GRANTED | Git merge, release/deployment, and Phase closure remain unauthorized. |

The non-browser diagnostic exonerated the client/service path. The one-shot Direct CDP alternate diagnostic is non-validation evidence: it failed before application navigation because of Chromium GPU/runtime infrastructure failure. Q1–Q6 are `UNOBSERVED_DUE_TO_DIAGNOSTIC_FAILURE`; Q7 is `UNOBSERVABLE_BY_THIS_STRATEGY`.

No product defect, repository E2E defect, or Playwright defect has been proven. The Direct CDP infrastructure failure does not establish the cause of Chromium #3. Governed diagnostics are exhausted; Direct CDP retry, Chromium #4, and iPhone/WebKit execution are unauthorized.
