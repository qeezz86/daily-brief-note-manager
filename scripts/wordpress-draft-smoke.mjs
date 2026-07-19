import { spawn } from 'node:child_process'
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { SmokeError, assertNoSecretLeaks, createCleanupManager, maskSecrets, parseSupabaseStatusOutput, serializeTemporaryEnv } from './wordpress-runtime-smoke/helpers.mjs'

const root = resolve(import.meta.dirname, '..')
const cli = join(root, 'node_modules', 'supabase', 'dist', 'supabase.js')
const functionUrl = 'http://127.0.0.1:54321/functions/v1/wordpress-draft-create'
const edgeContainer = 'supabase_edge_runtime_daily-brief-note-manager'
const allowedOrigin = 'http://localhost:5173'
const tags = ['Macro', 'Policy', 'Markets', 'Inflation', 'Rates']

function assert(condition, code, stage) { if (!condition) throw new SmokeError(code, stage) }
function secret(label, value) { return { label, value } }
function timedFetch(input, init = {}) { return fetch(input, { ...init, signal: AbortSignal.any([init.signal ?? new AbortController().signal, AbortSignal.timeout(12_000)]) }) }
function equal(left, right) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b) }
function sendJson(response, status, value, headers = {}) { const body = JSON.stringify(value); response.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers }); response.end(body) }

async function terminate(child) {
  if (!child?.pid || child.exitCode !== null) return
  if (process.platform === 'win32') await new Promise((done) => { const kill = spawn(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'), ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true }); kill.once('error', done); kill.once('exit', done) })
  else { try { process.kill(-child.pid, 'SIGTERM') } catch { child.kill('SIGTERM') } }
}

async function runSupabase(args, stage) {
  const child = spawn(process.execPath, [cli, ...args], { cwd: root, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''; let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += String(chunk).slice(0, 1_048_576 - stdout.length) })
  child.stderr.on('data', (chunk) => { stderr += String(chunk).slice(0, 1_048_576 - stderr.length) })
  const code = await new Promise((done, reject) => { child.once('error', reject); child.once('exit', done) }).catch(() => null)
  if (code !== 0) throw new SmokeError(stage === 'local Supabase status' ? 'LOCAL_SUPABASE_NOT_RUNNING' : 'FUNCTION_SERVE_FAILED', stage)
  return { stdout, stderr }
}

async function removeEdgeRuntime() {
  const run = (args) => new Promise((done) => { const child = spawn('docker', args, { cwd: root, shell: false, windowsHide: true, stdio: 'ignore' }); child.once('error', () => done(null)); child.once('exit', done) })
  if (await run(['version', '--format', '{{.Server.Version}}']) !== 0) throw new Error('DOCKER_UNAVAILABLE')
  if (await run(['container', 'inspect', edgeContainer]) === 0 && await run(['container', 'rm', '--force', edgeContainer]) !== 0) throw new Error('EDGE_CONTAINER_REMOVE_FAILED')
}

async function readJsonBody(request) {
  let text = ''
  for await (const chunk of request) { text += String(chunk); if (Buffer.byteLength(text) > 2_000_000) throw new Error('BODY_TOO_LARGE') }
  return JSON.parse(text)
}

async function startMockWordPress(username, password) {
  const expectedAuthorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
  const audit = []
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://mock.invalid')
    const authorization = request.headers.authorization ?? ''
    const authorizationValid = equal(authorization, expectedAuthorization)
    const entry = { method: request.method ?? '', pathname: url.pathname, authorizationPresent: Boolean(authorization), authorizationValid, bodyFields: [], statusValue: null, responseStatus: 0 }
    audit.push(entry)
    if (!authorizationValid) { entry.responseStatus = 401; return sendJson(response, 401, { code: 'mock_auth' }) }
    if (request.method === 'GET' && url.pathname === '/wp-json/wp/v2/users/me') { entry.responseStatus = 200; return sendJson(response, 200, { id: 17, capabilities: { edit_posts: true } }) }
    if (request.method === 'GET' && url.pathname === '/wp-json/wp/v2/categories') { entry.responseStatus = 200; return sendJson(response, 200, [{ id: 1, name: '경제', slug: 'economy', parent: 0, count: 1 }], { 'X-WP-Total': '1', 'X-WP-TotalPages': '1' }) }
    if (request.method === 'GET' && url.pathname === '/wp-json/wp/v2/tags') { entry.responseStatus = 200; return sendJson(response, 200, tags.map((name, index) => ({ id: 11 + index, name, slug: name.toLowerCase(), count: 1 })), { 'X-WP-Total': '5', 'X-WP-TotalPages': '1' }) }
    if (request.method === 'GET' && url.pathname === '/wp-json/wp/v2/statuses') { entry.responseStatus = 200; return sendJson(response, 200, { draft: {}, pending: {}, publish: {}, future: {}, private: {} }) }
    if (request.method === 'GET' && url.pathname === '/wp-json/wp/v2/posts') { entry.responseStatus = 200; return sendJson(response, 200, []) }
    if (request.method === 'POST' && url.pathname === '/wp-json/wp/v2/posts') {
      let body
      try { body = await readJsonBody(request) } catch { entry.responseStatus = 400; return sendJson(response, 400, { code: 'mock_invalid_json' }) }
      entry.bodyFields = Object.keys(body).sort(); entry.statusValue = body.status
      const valid = JSON.stringify(entry.bodyFields) === JSON.stringify(['categories', 'content', 'excerpt', 'slug', 'status', 'tags', 'title'])
        && body.status === 'draft' && JSON.stringify(body.categories) === '[1]' && JSON.stringify(body.tags) === '[11,12,13,14,15]'
      if (!valid) { entry.responseStatus = 400; return sendJson(response, 400, { code: 'mock_invalid_payload' }) }
      if (body.slug.endsWith('2026-07-22')) { entry.responseStatus = 0; request.socket.destroy(); return }
      entry.responseStatus = 201
      return sendJson(response, 201, { id: 901, status: 'draft', slug: body.slug, link: `https://wordpress.example.test/?p=901`, modified_gmt: '2026-07-19T00:00:00' })
    }
    entry.responseStatus = request.method === 'GET' ? 404 : 405
    return sendJson(response, entry.responseStatus, { code: 'mock_not_allowed' })
  })
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '0.0.0.0', done) })
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('MOCK_ADDRESS_FAILED')
  return { audit, port: address.port, close: () => new Promise((done, reject) => { server.closeIdleConnections?.(); server.closeAllConnections?.(); server.close((error) => error ? reject(error) : done()) }) }
}

async function createUser(admin, local, secrets, cleanup, label) {
  const email = `wordpress-draft-${randomUUID()}@example.invalid`; const password = `${randomBytes(24).toString('base64url')}aA1!`
  secrets.push(secret(`${label} email`, email), secret(`${label} password`, password))
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (created.error || !created.data.user) throw new SmokeError('AUTH_USER_CREATE_FAILED', 'local Auth fixture')
  cleanup.add(async () => { const result = await admin.auth.admin.deleteUser(created.data.user.id); if (result.error) throw new Error('AUTH_USER_DELETE_FAILED') })
  const client = createClient(local.apiUrl, local.publishableKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: timedFetch } })
  const signedIn = await client.auth.signInWithPassword({ email, password })
  if (signedIn.error || !signedIn.data.session) throw new SmokeError('AUTH_SIGN_IN_FAILED', 'local Auth fixture')
  secrets.push(secret(`${label} user ID`, created.data.user.id), secret(`${label} access token`, signedIn.data.session.access_token), secret(`${label} refresh token`, signedIn.data.session.refresh_token))
  return { id: created.data.user.id, token: signedIn.data.session.access_token, client }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
  return value
}
function fingerprint(payload) { return `sha256:${createHash('sha256').update(JSON.stringify(canonical(payload))).digest('hex')}` }

async function seedFixtures(user, siteOrigin) {
  const fixtures = []
  for (const day of [19, 20, 21, 22]) {
    const postId = randomUUID(); const date = `2026-07-${day}`; const title = `경제 대표 제목 ${day}`
    const html = `<div class="daily-brief-note news-briefing economy"><h1>${title}</h1><a href="#sources">출처</a></div>`
    const requestedUpdatedAt = '2026-07-19T00:00:00.000Z'; const slug = `economy-briefing-${date}`
    const post = await user.client.from('posts').insert({ id: postId, owner_id: user.id, category_id: 'economy', briefing_date: date, title, summary: '요약', html_body: html, slug, content_status: 'ready', source_import_type: 'manual_entry', updated_at: requestedUpdatedAt }).select('updated_at').single()
    if (post.error || !post.data) throw new SmokeError('DB_FIXTURE_FAILED', 'post fixture')
    const updatedAt = post.data.updated_at
    const meta = '가'.repeat(130)
    if ((await user.client.from('seo_data').insert({ post_id: postId, owner_id: user.id, representative_title: title, alternative_titles: ['대안1','대안2','대안3','대안4'], meta_description: meta, focus_keyword: '경제' })).error) throw new SmokeError('DB_FIXTURE_FAILED', 'SEO fixture')
    const createdTags = await user.client.from('tags').upsert(tags.map((name) => ({ owner_id: user.id, name, normalized_name: name.toLowerCase() })), { onConflict: 'owner_id,normalized_name' }).select('id,name,normalized_name')
    if (createdTags.error || !createdTags.data) throw new SmokeError('DB_FIXTURE_FAILED', 'tag fixture')
    if ((await user.client.from('post_tags').insert(createdTags.data.map((tag) => ({ owner_id: user.id, post_id: postId, tag_id: tag.id })))).error) throw new SmokeError('DB_FIXTURE_FAILED', 'post tag fixture')
    fixtures.push({ postId, updatedAt, payloadFingerprint: fingerprint({ title, content: html, status: 'draft', slug, excerpt: meta, categories: [1], tags: [11,12,13,14,15] }) })
  }
  const tagRows = await user.client.from('tags').select('name,normalized_name')
  const mappings = [{ owner_id: user.id, site_origin: siteOrigin, mapping_kind: 'category', local_key: 'economy', wordpress_taxonomy: 'category', wordpress_term_id: 1, wordpress_term_slug: 'economy', wordpress_term_name: '경제' }, ...(tagRows.data ?? []).map((tag) => ({ owner_id: user.id, site_origin: siteOrigin, mapping_kind: 'tag', local_key: tag.normalized_name, wordpress_taxonomy: 'post_tag', wordpress_term_id: 11 + tags.indexOf(tag.name), wordpress_term_slug: tag.name.toLowerCase(), wordpress_term_name: tag.name }))]
  if ((await user.client.from('wordpress_taxonomy_mappings').insert(mappings)).error) throw new SmokeError('DB_FIXTURE_FAILED', 'mapping fixture')
  return fixtures
}

async function createRequest(local, user, fixture, options = {}) {
  const response = await timedFetch(functionUrl, { method: 'POST', headers: { apikey: local.publishableKey, Authorization: `Bearer ${user.token}`, Origin: options.origin ?? allowedOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create-draft', contentId: fixture.postId, expectedSourceUpdatedAt: options.updatedAt ?? fixture.updatedAt, expectedPayloadFingerprint: options.fingerprint ?? fixture.payloadFingerprint, idempotencyKey: options.key ?? randomUUID(), confirmation: { confirmed: true, scope: 'single-wordpress-draft' } }) })
  const text = await response.text(); let body = null; try { body = JSON.parse(text) } catch { /* gateway failure */ }
  return { status: response.status, text, body }
}

async function main() {
  const cleanup = createCleanupManager(); const secrets = []; let failure = null; let cleanupResult; let runtimeLogs = ''; let counts
  try {
    const status = await runSupabase(['status', '-o', 'json'], 'local Supabase status')
    const local = parseSupabaseStatusOutput(status.stdout); secrets.push(secret('publishable key', local.publishableKey), secret('secret key', local.secretKey))
    const admin = createClient(local.apiUrl, local.secretKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: timedFetch } })
    const allowed = await createUser(admin, local, secrets, cleanup, 'allowed'); const disallowed = await createUser(admin, local, secrets, cleanup, 'disallowed')
    const username = `draft-${randomBytes(6).toString('hex')}`; const password = randomBytes(24).toString('base64url'); secrets.push(secret('WordPress username', username), secret('WordPress password', password))
    const mock = await startMockWordPress(username, password); cleanup.add(() => mock.close())
    const siteOrigin = `http://host.docker.internal:${mock.port}`; const fixtures = await seedFixtures(allowed, siteOrigin)
    const tempRoot = await mkdtemp(join(tmpdir(), 'daily-brief-note-wordpress-draft-')); cleanup.add(() => rm(tempRoot, { recursive: true, force: true }))
    const envFile = join(tempRoot, `${randomUUID()}.env`); const env = { WORDPRESS_SITE_URL: siteOrigin, WORDPRESS_USERNAME: username, WORDPRESS_APPLICATION_PASSWORD: password, WORDPRESS_ALLOWED_USER_ID: allowed.id, APP_ALLOWED_ORIGINS: allowedOrigin, WORDPRESS_LOCAL_MODE: 'true' }
    await writeFile(envFile, serializeTemporaryEnv(env), { encoding: 'utf8', mode: 0o600, flag: 'wx' }); if (process.platform !== 'win32') await chmod(envFile, 0o600)
    await removeEdgeRuntime(); cleanup.add(removeEdgeRuntime)
    const child = spawn(process.execPath, [cli, 'functions', 'serve', 'wordpress-draft-create', '--env-file', envFile], { cwd: root, detached: process.platform !== 'win32', env: { ...process.env, ...env }, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const logs = { out: '', err: '' }; child.stdout.on('data', (chunk) => { logs.out += String(chunk); runtimeLogs = `${logs.out}\n${logs.err}` }); child.stderr.on('data', (chunk) => { logs.err += String(chunk); runtimeLogs = `${logs.out}\n${logs.err}` }); cleanup.add(() => terminate(child))
    const deadline = Date.now() + 60_000; let readinessStatus = 0
    while (Date.now() < deadline) { if (child.exitCode !== null) throw new SmokeError('FUNCTION_SERVE_EXITED', 'draft Function readiness'); try { const response = await timedFetch(functionUrl, { method: 'GET', headers: { apikey: local.publishableKey, Authorization: `Bearer ${allowed.token}`, Origin: allowedOrigin } }); readinessStatus = response.status; if (response.status === 405) break } catch { /* starting */ } await new Promise((done) => setTimeout(done, 250)) }
    assert(Date.now() < deadline, `FUNCTION_READINESS_${readinessStatus || 'TIMEOUT'}`, 'draft Function readiness')

    const key = randomUUID(); const created = await createRequest(local, allowed, fixtures[0], { key }); assert(created.status === 201 && created.body?.wordpress?.status === 'draft', `CREATE_HTTP_${created.status}_${created.body?.error?.code ?? 'INVALID_RESPONSE'}`, 'authenticated create')
    const postAfterCreate = mock.audit.filter((item) => item.method === 'POST').length; assert(postAfterCreate === 1, 'POST_COUNT_INVALID', 'authenticated create')
    const replay = await createRequest(local, allowed, fixtures[0], { key }); assert(replay.status === 200 && replay.body?.idempotentReplay === true, 'REPLAY_FAILED', 'idempotent replay')
    const duplicate = await createRequest(local, allowed, fixtures[0]); assert(duplicate.status === 409 && duplicate.body?.error?.code === 'EXISTING_DRAFT_RECORD', 'CONTENT_GUARD_FAILED', 'same content guard')
    const stale = await createRequest(local, allowed, fixtures[1], { updatedAt: '2026-07-18T00:00:00.000Z' }); assert(stale.status === 409 && stale.body?.error?.code === 'SOURCE_CHANGED', 'STALE_GUARD_FAILED', 'source guard')
    const mismatch = await createRequest(local, allowed, fixtures[2], { fingerprint: `sha256:${'f'.repeat(64)}` }); assert(mismatch.status === 409 && mismatch.body?.error?.code === 'PAYLOAD_FINGERPRINT_MISMATCH', 'FINGERPRINT_GUARD_FAILED', 'fingerprint guard')
    const uncertainKey = randomUUID(); const uncertain = await createRequest(local, allowed, fixtures[3], { key: uncertainKey }); assert(uncertain.status === 502 && uncertain.body?.error?.code === 'WORDPRESS_DRAFT_RESULT_UNCERTAIN', 'UNCERTAIN_FAILED', 'uncertain result')
    const uncertainReplay = await createRequest(local, allowed, fixtures[3], { key: uncertainKey }); assert(uncertainReplay.status === 409 && uncertainReplay.body?.error?.code === 'MANUAL_RECONCILIATION_REQUIRED', 'UNCERTAIN_REPLAY_FAILED', 'uncertain guard')
    const beforeDenied = mock.audit.length; const forbidden = await createRequest(local, disallowed, fixtures[1]); assert(forbidden.status === 403 && mock.audit.length === beforeDenied, 'CALLER_GUARD_FAILED', 'caller authorization')
    const badOrigin = await createRequest(local, allowed, fixtures[1], { origin: 'https://evil.example.com' }); assert(badOrigin.status === 403 && mock.audit.length === beforeDenied, 'ORIGIN_GUARD_FAILED', 'origin authorization')
    const attempts = await allowed.client.from('wordpress_publication_attempts').select('status,wordpress_post_status,error_code'); assert(!attempts.error && attempts.data?.some((row) => row.status === 'succeeded' && row.wordpress_post_status === 'draft') && attempts.data?.some((row) => row.status === 'uncertain'), 'AUDIT_FAILED', 'attempt audit')
    const postCount = mock.audit.filter((item) => item.method === 'POST').length; assert(postCount === 2, 'FINAL_POST_COUNT_INVALID', 'write audit')
    assert(mock.audit.filter((item) => ['PUT','PATCH','DELETE'].includes(item.method)).length === 0, 'FORBIDDEN_WRITE_DETECTED', 'write audit')
    assert(mock.audit.filter((item) => item.method === 'POST').every((item) => item.pathname === '/wp-json/wp/v2/posts' && item.statusValue === 'draft'), 'NON_DRAFT_WRITE_DETECTED', 'write audit')
    assertNoSecretLeaks(`${created.text}\n${replay.text}\n${duplicate.text}\n${stale.text}\n${mismatch.text}\n${uncertain.text}\n${uncertainReplay.text}\n${runtimeLogs}`, secrets)
    counts = { postCount, replayAdditional: mock.audit.filter((item) => item.method === 'POST').length - postCount }
  } catch (error) { failure = error instanceof SmokeError ? error : new SmokeError('UNEXPECTED_SMOKE_FAILURE', 'draft runtime smoke') }
  finally { cleanupResult = await cleanup.run() }
  if (failure || !cleanupResult.ok) { const failed = failure ?? new SmokeError('CLEANUP_FAILED', 'cleanup'); console.error('WordPress draft smoke: FAIL'); console.error(`- failed stage: ${failed.stage}`); console.error(`- error code: ${failed.code}`); console.error(`- cleanup: ${cleanupResult.ok ? 'PASS' : 'FAIL'}`); const safeLogs = maskSecrets(runtimeLogs, secrets).trim().slice(-2000); if (safeLogs) console.error(`- safe runtime detail:\n${safeLogs}`); if (failed.code === 'LOCAL_SUPABASE_NOT_RUNNING') console.error('- prerequisite: run npm run db:start'); process.exitCode = 1; return }
  console.log('WordPress draft smoke: PASS')
  console.log('- authenticated create: PASS')
  console.log(`- WordPress POST: ${counts.postCount}`)
  console.log('- status draft: PASS')
  console.log('- idempotent replay: PASS')
  console.log('- duplicate content guard: PASS')
  console.log('- stale source guard: PASS')
  console.log('- fingerprint guard: PASS')
  console.log('- uncertain retry guard: PASS')
  console.log('- WordPress non-draft writes: 0')
  console.log('- credential leakage: NONE')
  console.log('- cleanup: PASS')
}

await main()
