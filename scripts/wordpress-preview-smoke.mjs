import { spawn } from 'node:child_process'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { SmokeError, assertNoSecretLeaks, createCleanupManager, maskSecrets, parseSupabaseStatusOutput, serializeTemporaryEnv } from './wordpress-runtime-smoke/helpers.mjs'

const root = resolve(import.meta.dirname, '..')
const cli = join(root, 'node_modules', 'supabase', 'dist', 'supabase.js')
const functionUrl = 'http://127.0.0.1:54321/functions/v1/wordpress-publication-preview'
const edgeContainer = 'supabase_edge_runtime_daily-brief-note-manager'
const allowedOrigin = 'http://localhost:5173'
const timeoutMs = 60_000

function assert(condition, code, stage) { if (!condition) throw new SmokeError(code, stage) }
function secret(label, value) { return { label, value } }
function timedFetch(input, init = {}) { return fetch(input, { ...init, signal: AbortSignal.any([init.signal ?? new AbortController().signal, AbortSignal.timeout(10_000)]) }) }

async function terminate(child) {
  if (!child?.pid || child.exitCode !== null) return
  if (process.platform === 'win32') {
    await new Promise((done) => { const kill = spawn(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'), ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true }); kill.once('error', done); kill.once('exit', done) })
  } else {
    try { process.kill(-child.pid, 'SIGTERM') } catch { child.kill('SIGTERM') }
  }
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

function equal(left, right) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b) }
function sendJson(response, status, value, headers = {}) { const body = JSON.stringify(value); response.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers }); response.end(body) }

async function startMockWordPress(username, password) {
  const expectedAuthorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
  const audit = []
  const categoryPages = [[{ id: 1, name: '경제', slug: 'economy', parent: 0, count: 1 }], [{ id: 2, name: '국제', slug: 'global', parent: 0, count: 1 }]]
  const tagPages = [[{ id: 11, name: 'Macro', slug: 'macro', count: 1 }, { id: 12, name: 'Policy', slug: 'policy', count: 1 }, { id: 13, name: 'Markets', slug: 'markets', count: 1 }], [{ id: 14, name: 'Inflation', slug: 'inflation', count: 1 }, { id: 15, name: 'Rates', slug: 'rates', count: 1 }]]
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://mock.invalid')
    const auth = request.headers.authorization ?? ''
    const allowedPaths = new Set(['/wp-json/wp/v2/categories', '/wp-json/wp/v2/tags', '/wp-json/wp/v2/statuses', '/wp-json/wp/v2/posts'])
    let status = request.method === 'GET' ? 200 : 405
    if (status === 200 && !equal(auth, expectedAuthorization)) status = 401
    if (status === 200 && !allowedPaths.has(url.pathname)) status = 404
    const keys = [...url.searchParams.keys()].sort()
    audit.push({ method: request.method ?? '', pathname: url.pathname, keys, authorizationValid: status !== 401, status })
    if (status !== 200) return sendJson(response, status, { code: 'mock_failure' })
    if (url.pathname.endsWith('/categories') || url.pathname.endsWith('/tags')) {
      const page = Number(url.searchParams.get('page'))
      const valid = url.searchParams.get('context') === 'edit' && url.searchParams.get('per_page') === '100' && url.searchParams.get('hide_empty') === 'false' && url.searchParams.get('order') === 'asc' && url.searchParams.get('orderby') === 'id' && [1, 2].includes(page)
      if (!valid) return sendJson(response, 404, { code: 'mock_query' })
      const pages = url.pathname.endsWith('/categories') ? categoryPages : tagPages
      const total = pages.flat().length
      return sendJson(response, 200, pages[page - 1], { 'X-WP-Total': String(total), 'X-WP-TotalPages': '2' })
    }
    if (url.pathname.endsWith('/statuses')) return sendJson(response, 200, { draft: { slug: 'draft' }, pending: { slug: 'pending' }, publish: { slug: 'publish' }, future: { slug: 'future' }, private: { slug: 'private' } })
    const validPostQuery = url.searchParams.get('context') === 'edit' && url.searchParams.get('slug') === 'economy-briefing-2026-07-18' && ['draft', 'pending', 'publish', 'future', 'private'].includes(url.searchParams.get('status'))
    return validPostQuery ? sendJson(response, 200, []) : sendJson(response, 404, { code: 'mock_query' })
  })
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '0.0.0.0', done) })
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('MOCK_ADDRESS_FAILED')
  return { audit, port: address.port, close: () => new Promise((done, reject) => { server.closeIdleConnections?.(); server.closeAllConnections?.(); server.close((error) => error ? reject(error) : done()) }) }
}

async function createUser(admin, local, secrets, cleanup, label) {
  const email = `wordpress-preview-${randomUUID()}@example.invalid`; const password = `${randomBytes(24).toString('base64url')}aA1!`
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

async function seedFixture(user) {
  const postId = randomUUID(); const names = ['Macro', 'Policy', 'Markets', 'Inflation', 'Rates']
  const html = '<div class="daily-brief-note news-briefing economy"><h1>경제 대표 제목</h1><a href="#sources">출처</a></div>'
  const post = await user.client.from('posts').insert({ id: postId, owner_id: user.id, category_id: 'economy', briefing_date: '2026-07-18', published_on: '2026-07-18', title: '경제 대표 제목', summary: '요약', html_body: html, slug: 'economy-briefing-2026-07-18', content_status: 'ready', source_import_type: 'manual_entry' })
  if (post.error) throw new SmokeError('DB_FIXTURE_FAILED', 'post fixture')
  const seo = await user.client.from('seo_data').insert({ post_id: postId, owner_id: user.id, representative_title: '경제 대표 제목', alternative_titles: ['대안1', '대안2', '대안3', '대안4'], meta_description: '가'.repeat(130), focus_keyword: '경제 동향' })
  if (seo.error) throw new SmokeError('DB_FIXTURE_FAILED', 'SEO fixture')
  const tags = await user.client.from('tags').insert(names.map((name) => ({ owner_id: user.id, name, normalized_name: name.toLowerCase() }))).select('id,name,normalized_name')
  if (tags.error || !tags.data) throw new SmokeError('DB_FIXTURE_FAILED', 'tag fixture')
  const links = await user.client.from('post_tags').insert(tags.data.map((tag) => ({ owner_id: user.id, post_id: postId, tag_id: tag.id })))
  if (links.error) throw new SmokeError('DB_FIXTURE_FAILED', 'post tag fixture')
  const mappings = [{ owner_id: user.id, site_origin: '', mapping_kind: 'category', local_key: 'economy', wordpress_taxonomy: 'category', wordpress_term_id: 1, wordpress_term_slug: 'economy', wordpress_term_name: '경제' }, ...tags.data.map((tag, index) => ({ owner_id: user.id, site_origin: '', mapping_kind: 'tag', local_key: tag.normalized_name, wordpress_taxonomy: 'post_tag', wordpress_term_id: 11 + index, wordpress_term_slug: tag.normalized_name, wordpress_term_name: tag.name }))]
  return { postId, mappings }
}

async function requestPlan(token, publishableKey, postId, origin = allowedOrigin) {
  const response = await timedFetch(functionUrl, { method: 'POST', headers: { apikey: publishableKey, Authorization: `Bearer ${token}`, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'prepare-publication', contentId: postId }) })
  const text = await response.text(); let body = null; try { body = JSON.parse(text) } catch { /* gateway error */ }
  return { status: response.status, text, body }
}

async function main() {
  const cleanup = createCleanupManager(); const secrets = []; let failure = null; let cleanupResult; let summary; let runtimeLogs = ''
  try {
    const status = await runSupabase(['status', '-o', 'json'], 'local Supabase status')
    const local = parseSupabaseStatusOutput(status.stdout); secrets.push(secret('publishable key', local.publishableKey), secret('secret key', local.secretKey))
    const admin = createClient(local.apiUrl, local.secretKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: timedFetch } })
    const allowed = await createUser(admin, local, secrets, cleanup, 'allowed'); const disallowed = await createUser(admin, local, secrets, cleanup, 'disallowed')
    const username = `preview-${randomBytes(6).toString('hex')}`; const password = randomBytes(24).toString('base64url'); secrets.push(secret('WordPress username', username), secret('WordPress password', password))
    const mock = await startMockWordPress(username, password); cleanup.add(() => mock.close())
    const fixture = await seedFixture(allowed); const siteOrigin = `http://host.docker.internal:${mock.port}`
    for (const mapping of fixture.mappings) mapping.site_origin = siteOrigin
    const mappingResult = await allowed.client.from('wordpress_taxonomy_mappings').insert(fixture.mappings)
    if (mappingResult.error) throw new SmokeError('DB_FIXTURE_FAILED', 'taxonomy mapping fixture')
    const tempRoot = await mkdtemp(join(tmpdir(), 'daily-brief-note-wordpress-preview-')); cleanup.add(() => rm(tempRoot, { recursive: true, force: true }))
    const envFile = join(tempRoot, `${randomUUID()}.env`); const env = { WORDPRESS_SITE_URL: siteOrigin, WORDPRESS_USERNAME: username, WORDPRESS_APPLICATION_PASSWORD: password, WORDPRESS_ALLOWED_USER_ID: allowed.id, APP_ALLOWED_ORIGINS: allowedOrigin, WORDPRESS_LOCAL_MODE: 'true' }
    await writeFile(envFile, serializeTemporaryEnv(env), { encoding: 'utf8', mode: 0o600, flag: 'wx' }); if (process.platform !== 'win32') await chmod(envFile, 0o600)
    await removeEdgeRuntime(); cleanup.add(removeEdgeRuntime)
    const child = spawn(process.execPath, [cli, 'functions', 'serve', 'wordpress-publication-preview', '--env-file', envFile], { cwd: root, detached: process.platform !== 'win32', env: { ...process.env, ...env }, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const logs = { out: '', err: '' }; child.stdout.on('data', (chunk) => { logs.out += String(chunk); runtimeLogs = `${logs.out}\n${logs.err}` }); child.stderr.on('data', (chunk) => { logs.err += String(chunk); runtimeLogs = `${logs.out}\n${logs.err}` }); cleanup.add(() => terminate(child))
    const deadline = Date.now() + timeoutMs
    let readinessStatus = 0
    while (Date.now() < deadline) { if (child.exitCode !== null) throw new SmokeError('FUNCTION_SERVE_EXITED', 'preview Function readiness'); try { const response = await timedFetch(functionUrl, { method: 'GET', headers: { apikey: local.publishableKey, Authorization: `Bearer ${allowed.token}`, Origin: allowedOrigin } }); readinessStatus = response.status; if (response.status === 405) break } catch { /* starting */ } await new Promise((done) => setTimeout(done, 250)) }
    assert(Date.now() < deadline, readinessStatus ? `FUNCTION_READINESS_HTTP_${readinessStatus}` : 'FUNCTION_READINESS_TIMEOUT', 'preview Function readiness')
    const ready = await requestPlan(allowed.token, local.publishableKey, fixture.postId); assert(ready.status === 200 && ready.body?.ok === true && ready.body?.readyForDraftCreation === true, 'READY_PLAN_FAILED', 'ready publication plan')
    assert(ready.body.writePerformed === false && ready.body.payload?.status === 'draft' && /^sha256:[0-9a-f]{64}$/.test(ready.body.payloadFingerprint), 'PLAN_CONTRACT_FAILED', 'ready publication plan')
    const wpCount = mock.audit.length
    const forbidden = await requestPlan(disallowed.token, local.publishableKey, fixture.postId); assert(forbidden.status === 403, 'FORBIDDEN_USER_FAILED', 'caller authorization'); assert(mock.audit.length === wpCount, 'FORBIDDEN_REACHED_WORDPRESS', 'caller authorization')
    const writes = mock.audit.filter((item) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(item.method)).length
    assert(writes === 0 && mock.audit.every((item) => item.authorizationValid), 'WORDPRESS_WRITE_DETECTED', 'GET-only audit')
    assertNoSecretLeaks(`${ready.text}\n${forbidden.text}\n${logs.out}\n${logs.err}`, secrets)
    summary = { requests: mock.audit.length, writes, fingerprint: ready.body.payloadFingerprint.slice(0, 15) }
  } catch (error) { failure = error instanceof SmokeError ? error : new SmokeError('UNEXPECTED_SMOKE_FAILURE', 'preview runtime smoke') }
  finally { cleanupResult = await cleanup.run() }
  if (failure || !cleanupResult.ok) { const failed = failure ?? new SmokeError('CLEANUP_FAILED', 'cleanup'); console.error('WordPress publication preview smoke: FAIL'); console.error(`- failed stage: ${failed.stage}`); console.error(`- error code: ${failed.code}`); console.error(`- cleanup: ${cleanupResult.ok ? 'PASS' : 'FAIL'}`); const safeLogs = maskSecrets(runtimeLogs, secrets).trim().slice(-2000); if (safeLogs) console.error(`- safe runtime detail:\n${safeLogs}`); if (failed.code === 'LOCAL_SUPABASE_NOT_RUNNING') console.error('- prerequisite: run npm run db:start'); process.exitCode = 1; return }
  console.log('WordPress publication preview smoke: PASS')
  console.log('- local Auth + RLS DB fixtures: PASS')
  console.log('- paginated taxonomy + duplicate GET: PASS')
  console.log('- ready deterministic draft plan: PASS')
  console.log(`- WordPress requests: ${summary.requests} GET / ${summary.writes} write`)
  console.log(`- payload fingerprint: ${summary.fingerprint}…`)
  console.log('- credential leakage: NONE')
  console.log('- cleanup: PASS')
}

await main()
