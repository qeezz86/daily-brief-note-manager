# AGENTS.md

## 1. Project

Build and maintain **Daily Brief Note Content Manager**, a private content-management web app for:

- News briefings
  - Economy
  - Global
  - Technology
  - Society
  - Climate & Energy
- AI columns
- Information DB articles
- CCTV-based Chinese study articles

The app is the long-term source of truth for published content, SEO data, sources, news tracking, follow-up checklists, and ChatGPT prompt generation.

ChatGPT is used as a content-generation tool. This repository manages the resulting data and workflow.

---

## 2. Instruction precedence

When instructions conflict, use this order:

1. The user's current task
2. `docs/PRODUCT_SPEC.md`
3. `docs/DATABASE_SCHEMA.md`
4. `docs/IMPORT_FORMAT.md`
5. `docs/PROMPT_RULES.md`
6. Files under `docs/project-rules/`
7. Existing implementation and general engineering conventions

Do not silently resolve a material conflict. Report it in the final work summary.

Before starting a task:

1. Read this file.
2. Read the documents relevant to the requested feature.
3. Inspect the existing code, migrations, tests, and package scripts.
4. Make the smallest coherent change that satisfies the task.

---

## 3. Required stack

Use the existing stack unless the user explicitly changes it.

- React
- Vite
- TypeScript with strict type checking
- React Router
- TanStack Query
- React Hook Form
- Zod
- Supabase PostgreSQL
- Supabase Auth
- Row Level Security
- PWA support
- Vitest and React Testing Library
- Playwright for end-to-end tests

Do not introduce a second state-management, validation, routing, database, or UI framework without a concrete need and explicit approval.

---

## 4. Architecture

Use a feature-based structure.

```text
src/
├─ app/
├─ layouts/
├─ pages/
├─ features/
├─ shared/
├─ styles/
└─ test/

supabase/
├─ migrations/
├─ seed/
└─ tests/

docs/
└─ project-rules/
```

Rules:

- Route components belong in `src/pages/`.
- Business logic belongs in the relevant `src/features/<feature>/`.
- Shared code must be used by at least two features before moving to `src/shared/`.
- Pages must not contain direct Supabase queries, HTML parsing logic, or complex domain logic.
- Keep repositories, schemas, services, components, hooks, and types close to their feature.
- Avoid circular feature dependencies.
- Prefer small pure functions for parsers, formatters, generators, and validators.

---

## 5. Non-negotiable product rules

### 5.1 Images

- Do not implement image upload.
- Do not implement image file storage.
- Do not add image URL, binary, resolution, size, or storage-bucket workflows.
- Store only:
  - `image_prompt`
  - `image_alt`
  - optional prompt version and update timestamp

### 5.2 Chinese study content

- Chinese study posts do not have a briefing ID.
- Use `series_no` as the series identifier.
- Do not call the news display-ID generator for Chinese study posts.
- Store the individual CCTV article or video URL.
- Do not store a full CCTV article, full transcript, or full translation.

### 5.3 Configurable category formats

Do not hard-code category-specific:

- wrapper classes
- display-ID patterns
- slug patterns
- category codes

Load these values from category settings.

Changing a category setting must not rewrite historical post IDs or slugs automatically.

### 5.4 News tracking

A news briefing post and a tracked news topic are different entities.

The implementation must support:

- new updates
- follow-up updates
- corrections
- closure notes
- active topics
- monitoring topics
- closed topics
- reopened topics
- follow-up checklist items
- topic status history
- links between later and earlier updates

Do not treat every news item as a new topic.

### 5.5 Prompt generation

News prompt generation must support recent:

- 5 posts
- 10 posts
- 15 posts

If fewer posts exist, use all available posts and state the actual number used.

Generated news prompts must be able to include:

- recent briefing summaries
- active, monitoring, and reopened topics
- pending follow-up checklist items
- closed topics and closure reasons
- repeat-exclusion guidance
- category wrapper
- display-ID and slug settings
- project writing rules

Do not include full WordPress HTML bodies in generated context. Use summaries and structured tracking data.

---

## 6. Database rules

- Every schema change must be a versioned SQL migration under `supabase/migrations/`.
- Do not modify a migration that may already have been applied. Add a new migration.
- Add foreign keys, unique constraints, check constraints, and indexes deliberately.
- Use UUIDs for internal primary keys unless the schema document specifies otherwise.
- Keep user-facing IDs separate from internal primary keys.
- User-owned tables must include `owner_id`.
- Enable RLS on every user-owned table.
- Users may only read and modify their own records.
- Never expose the Supabase service-role key to browser code.
- Seed category definitions separately from development sample data.
- Preserve historical post slugs and display IDs.
- Define cascade behavior explicitly.
- Generate or update TypeScript database types after schema changes.

For migrations, verify:

- clean-database application
- constraints
- indexes
- RLS policies
- rollback or forward-fix implications

---

## 7. Import and parsing rules

### 7.1 General

Imported content must go through:

1. Parse
2. Detect
3. Validate
4. Preview
5. User correction
6. Explicit save

Do not save imported content immediately after parsing.

### 7.2 HTML parsing

- Use `DOMParser` for WordPress HTML.
- Do not parse HTML solely with regular expressions.
- Regular expressions may be used only for small normalized text fields, such as a series number inside a title.
- Preserve the original HTML body unless the user explicitly requests normalization.
- Sanitize HTML before rendering a preview.
- Do not execute imported scripts or event handlers.

### 7.3 Category detection

Detect category primarily from the registered wrapper class.

Supported initial wrappers include:

- `daily-brief-note news-briefing economy`
- `daily-brief-note news-briefing global`
- `daily-brief-note news-briefing technology`
- `daily-brief-note news-briefing society`
- `daily-brief-note news-briefing climate-energy`
- `daily-brief-note ai-column`
- `daily-brief-note info-db`
- `daily-brief-note chinese-study`

The actual accepted values must come from category settings where possible.

### 7.4 Structured ChatGPT response

Support these sections when present:

- `[CONTENT_META]`
- `[SEO]`
- `[IMAGE_PROMPT]`
- `[WORDPRESS_HTML]`

Also support the existing human-readable output order described in the project specification.

### 7.5 Duplicate detection

Check, in order:

1. WordPress URL
2. slug
3. display ID
4. same category and publication date
5. normalized exact title
6. news topic key

Never silently overwrite an existing record.

---

## 8. Content validation

### 8.1 WordPress HTML

Validate:

- one top-level Daily Brief Note wrapper
- `<h1>` exists
- wrapper matches the selected category
- wrapper is properly closed
- no inline `style`
- no duplicate HTML IDs
- no unregistered class when strict validation is enabled
- no image prompt inside the WordPress body
- no accidental Markdown mixed into the HTML output

### 8.2 SEO

Validate or warn for:

- representative title present
- four alternative titles
- meta description target of 120–160 Korean characters
- valid slug
- focus keyword present
- 5–8 tags
- no category-name tag
- no `Daily Brief Note` or `DailyBriefNote` tag
- no exact duplicate tag
- warn about normalized near-duplicate tags

### 8.3 Sources

Store structured source metadata, not full source content.

Prefer:

- source organization
- source title
- publication or update time
- individual source URL
- checked point

Warn when a URL appears to be only a homepage, search page, or listing page.

---

## 9. UI and mobile requirements

- Use a mobile-first responsive layout.
- All MVP workflows must work in iPhone Safari.
- Support installation as a PWA.
- Keep primary actions reachable on narrow screens.
- Long HTML and prompt fields need expandable or full-screen editing.
- Use accessible labels, focus states, and keyboard navigation.
- Confirm destructive actions.
- Show loading, empty, success, and error states.
- Do not rely on hover-only interactions.
- The deployed app must work while the development notebook is powered off.

---

## 10. Security

- Treat imported HTML as untrusted.
- Sanitize HTML previews with an established sanitizer.
- Do not use `dangerouslySetInnerHTML` without sanitization.
- Do not place secrets in source code.
- Keep `.env`, backups, exports, and private data out of Git.
- Use only the public Supabase anon key in the browser.
- Validate data at UI, schema, and database levels where appropriate.
- Avoid logging private article content or authentication tokens.
- Do not store source article full text or copyrighted transcripts.

---

## 11. Testing

Add or update tests for every behavior change.

### Unit tests

Prioritize:

- wrapper detection
- content-type detection
- WordPress HTML parsing
- ChatGPT response parsing
- series number extraction
- display-ID generation
- slug generation
- SEO validation
- duplicate detection
- prompt section formatting
- prompt length limiting

### Integration tests

Cover:

- content CRUD
- parse → preview → save
- topic creation and reuse
- follow-up status changes
- closed and reopened news topics
- recent 5, 10, and 15 prompt queries
- fewer-than-requested post behavior
- backup export and import

### E2E tests

Cover critical user workflows on:

- desktop Chromium
- iPhone-sized WebKit viewport

Do not weaken or delete a valid test only to make a change pass.

---

## 12. Commands

Use the commands already defined in `package.json`. The intended baseline is:

```bash
npm install
npm run dev
npm run lint
npm run test
npm run build
npm run test:e2e
```

For database work, use the repository's Supabase scripts or CLI configuration.

If a required command is missing, add a conventional script and document it in `README.md`.

Before finishing a task, run at minimum:

```bash
npm run lint
npm run test
npm run build
```

Run relevant E2E and database tests when the task affects those areas.

If a command cannot be run, state the exact reason and what remains unverified.

---

## 13. Work discipline

- Keep changes scoped to the requested phase or feature.
- Do not perform unrelated refactors.
- Do not rename public fields, routes, or tables without migration and impact analysis.
- Do not add speculative features.
- Prefer explicit domain types over unstructured objects.
- Avoid `any`; use `unknown` and narrow it safely.
- Handle expected failures with typed results or clear exceptions.
- Keep user-visible Korean text consistent.
- Add concise comments only where the reason is not obvious from the code.
- Update documentation when behavior, setup, commands, or schema changes.
- Preserve backward compatibility for imported historical content where practical.

For large tasks:

1. Inspect the repository.
2. State the implementation plan.
3. Implement in small coherent steps.
4. Run validation.
5. Review the diff.
6. Summarize completed work and limitations.

---

## 14. Definition of done

A task is complete only when:

- the requested behavior is implemented
- relevant validation is present
- migrations are included when needed
- RLS remains correct
- tests cover the change
- lint passes
- tests pass
- production build passes
- mobile impact has been considered
- documentation is updated when needed
- no image-storage feature was introduced
- no Chinese briefing ID was introduced
- no secret was committed

---

## 15. Completion report

At the end of each Codex task, report:

1. Files created or changed
2. Main implementation decisions
3. Database migrations and RLS changes
4. Tests added or updated
5. Commands run and results
6. Remaining limitations
7. Conflicts or decisions requiring user confirmation
