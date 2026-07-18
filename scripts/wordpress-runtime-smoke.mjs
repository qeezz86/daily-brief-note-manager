import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import process from 'node:process'

import { createClient } from '@supabase/supabase-js'

import {
  SmokeError,
  assertNoSecretLeaks,
  assertReadOnlyMockAudit,
  createCleanupManager,
  parseSupabaseStatusOutput,
  serializeTemporaryEnv,
} from './wordpress-runtime-smoke/helpers.mjs'
import { startMockWordPress } from './wordpress-runtime-smoke/mock-wordpress.mjs'

const projectRoot = resolve(import.meta.dirname, '..')
const supabaseCli = join(projectRoot, 'node_modules', 'supabase', 'dist', 'supabase.js')
const edgeRuntimeContainer = 'supabase_edge_runtime_daily-brief-note-manager'
const functionUrl = 'http://127.0.0.1:54321/functions/v1/wordpress-diagnostics'
const allowedOrigin = 'http://localhost:5173'
const timeoutMs = 30_000

function secret(label, value) {
  return { label, value }
}

function strongPassword() {
  return `${randomBytes(24).toString('base64url')}aA1!`
}

function assert(condition, code, stage) {
  if (!condition) throw new SmokeError(code, stage)
}

function timedFetch(input, init = {}) {
  const timeoutSignal = AbortSignal.timeout(10_000)
  const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal
  return fetch(input, { ...init, signal })
}

async function terminateProcessTree(child) {
  if (!child || child.exitCode !== null || !child.pid) return
  if (process.platform === 'win32') {
    const taskkill = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe')
    await new Promise((resolveTask) => {
      const killer = spawn(taskkill, ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
      })
      killer.once('error', resolveTask)
      killer.once('exit', resolveTask)
    })
    if (child.exitCode === null) {
      await Promise.race([
        new Promise((resolveExit) => child.once('exit', resolveExit)),
        new Promise((resolveTimeout) => setTimeout(resolveTimeout, 2_000)),
      ])
    }
    if (child.exitCode === null) throw new Error('PROCESS_TERMINATION_FAILED')
    return
  }

  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
  await Promise.race([
    new Promise((resolveExit) => child.once('exit', resolveExit)),
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, 2_000)),
  ])
  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      child.kill('SIGKILL')
    }
  }
}

async function runSupabase(args, { stage, failureCode, signal }) {
  const child = spawn(process.execPath, [supabaseCli, ...args], {
    cwd: projectRoot,
    detached: process.platform !== 'win32',
    env: process.env,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += String(chunk).slice(0, 1_048_576 - stdout.length) })
  child.stderr.on('data', (chunk) => { stderr += String(chunk).slice(0, 1_048_576 - stderr.length) })

  const timer = setTimeout(() => { void terminateProcessTree(child).catch(() => undefined) }, timeoutMs)
  const abort = () => { void terminateProcessTree(child).catch(() => undefined) }
  signal.addEventListener('abort', abort, { once: true })
  const exitCode = await new Promise((resolveExit, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => resolveExit(code))
  }).catch(() => null)
  clearTimeout(timer)
  signal.removeEventListener('abort', abort)

  if (signal.aborted) throw new SmokeError('INTERRUPTED', stage)
  if (exitCode !== 0) throw new SmokeError(failureCode, stage)
  return { stdout, stderr }
}

async function removeSmokeEdgeRuntime() {
  assert(/^supabase_edge_runtime_[a-z0-9-]+$/.test(edgeRuntimeContainer), 'EDGE_CONTAINER_NAME_INVALID', 'Edge Runtime cleanup')
  const runDocker = (args) => new Promise((resolveExit) => {
    const child = spawn('docker', args, {
      cwd: projectRoot,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'ignore'],
    })
    child.once('error', () => resolveExit(null))
    child.once('exit', resolveExit)
  })
  const available = await runDocker(['version', '--format', '{{.Server.Version}}'])
  if (available !== 0) throw new Error('DOCKER_UNAVAILABLE')
  const exists = await runDocker(['container', 'inspect', edgeRuntimeContainer])
  if (exists !== 0) return
  const removed = await runDocker(['container', 'rm', '--force', edgeRuntimeContainer])
  if (removed !== 0) throw new Error('EDGE_CONTAINER_REMOVE_FAILED')
}

function startFunction(envFile, functionEnvironment) {
  const child = spawn(process.execPath, [
    supabaseCli,
    'functions',
    'serve',
    'wordpress-diagnostics',
    '--env-file',
    envFile,
  ], {
    cwd: projectRoot,
    detached: process.platform !== 'win32',
    env: { ...process.env, ...functionEnvironment },
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const logs = { stdout: '', stderr: '', spawnFailed: false }
  child.stdout.on('data', (chunk) => { logs.stdout += String(chunk).slice(0, 1_048_576 - logs.stdout.length) })
  child.stderr.on('data', (chunk) => { logs.stderr += String(chunk).slice(0, 1_048_576 - logs.stderr.length) })
  child.once('error', () => { logs.spawnFailed = true })
  return { child, logs }
}

async function waitForFunction({ accessToken, publishableKey, child, logs, signal }) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (signal.aborted) throw new SmokeError('INTERRUPTED', 'Edge Function readiness')
    if (logs.spawnFailed || child.exitCode !== null) throw new SmokeError('FUNCTION_SERVE_EXITED', 'Edge Function readiness')
    try {
      const response = await timedFetch(functionUrl, {
        method: 'GET',
        signal: AbortSignal.any([signal, AbortSignal.timeout(1_500)]),
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${accessToken}`,
          Origin: allowedOrigin,
        },
      })
      if (response.status === 405) return
    } catch {
      // The local gateway can refuse connections while the Function container starts.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
  }
  throw new SmokeError('FUNCTION_READINESS_TIMEOUT', 'Edge Function readiness')
}

async function diagnosticRequest({ method = 'POST', accessToken, publishableKey, origin = allowedOrigin, signal }) {
  const headers = { apikey: publishableKey, Origin: origin }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  if (method === 'POST') headers['Content-Type'] = 'application/json'
  let response
  try {
    response = await timedFetch(functionUrl, {
      method,
      signal,
      headers,
      body: method === 'POST' ? JSON.stringify({ action: 'diagnose' }) : undefined,
    })
  } catch {
    throw new SmokeError('FUNCTION_REQUEST_FAILED', 'runtime requests')
  }
  const text = await response.text()
  let body = null
  try {
    body = JSON.parse(text)
  } catch {
    // Gateway authentication errors are not guaranteed to use the Function response schema.
  }
  return { status: response.status, text, body }
}

function errorCode(response) {
  return response.body?.error?.code ?? response.body?.code ?? ''
}

function safeResponseCode(response) {
  const code = String(errorCode(response)).toUpperCase().replace(/[^A-Z0-9_]/g, '') || 'NO_CODE'
  return `HTTP_${response.status}_${code}`
}

function assertSuccess(response) {
  const body = response.body
  assert(response.status === 200, `ALLOWED_USER_${safeResponseCode(response)}`, 'allowed user diagnostic')
  assert(body?.schemaVersion === 1 && body?.ok === true, 'ALLOWED_USER_SCHEMA_FAILED', 'allowed user diagnostic')
  assert(body.site?.restApiReachable === true && body.site?.wpV2Available === true, 'WORDPRESS_DISCOVERY_FAILED', 'allowed user diagnostic')
  assert(body.site?.applicationPasswordsAdvertised === true, 'APPLICATION_PASSWORD_DISCOVERY_FAILED', 'allowed user diagnostic')
  assert(body.authentication?.authenticated === true, 'WORDPRESS_AUTH_FAILED', 'allowed user diagnostic')
  assert(body.readiness?.connection === 'ready', 'WORDPRESS_READINESS_FAILED', 'allowed user diagnostic')
  assert(Object.values(body.capabilities ?? {}).every((value) => value === true), 'WORDPRESS_CAPABILITIES_FAILED', 'allowed user diagnostic')
  assert(body.resources?.categories?.total === 2, 'WORDPRESS_CATEGORIES_FAILED', 'allowed user diagnostic')
  assert(body.resources?.tags?.total === 2, 'WORDPRESS_TAGS_FAILED', 'allowed user diagnostic')
  assert(body.resources?.postsReadable === true, 'WORDPRESS_POSTS_FAILED', 'allowed user diagnostic')
  assert(Array.isArray(body.warnings) && body.warnings.length === 0, 'WORDPRESS_WARNINGS_UNEXPECTED', 'allowed user diagnostic')
}

async function createTemporaryUser(adminClient, apiUrl, publishableKey, secrets, cleanup, label) {
  const email = `wordpress-runtime-${randomUUID()}@example.invalid`
  const password = strongPassword()
  secrets.push(secret(`${label} email`, email), secret(`${label} password`, password))

  const created = await adminClient.auth.admin.createUser({ email, password, email_confirm: true })
    .catch(() => ({ data: null, error: true }))
  if (created.error || !created.data?.user) throw new SmokeError('AUTH_USER_CREATE_FAILED', `${label} user creation`)
  const userId = created.data.user.id
  secrets.push(secret(`${label} user ID`, userId))
  cleanup.add(async () => {
    const result = await adminClient.auth.admin.deleteUser(userId)
    if (result.error) throw new Error('AUTH_USER_DELETE_FAILED')
  })

  const client = createClient(apiUrl, publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { fetch: timedFetch },
  })
  const signedIn = await client.auth.signInWithPassword({ email, password })
    .catch(() => ({ data: null, error: true }))
  const session = signedIn.data?.session
  if (signedIn.error || !session?.access_token) throw new SmokeError('AUTH_SIGN_IN_FAILED', `${label} token issuance`)
  secrets.push(
    secret(`${label} access token`, session.access_token),
    secret(`${label} refresh token`, session.refresh_token),
  )
  return { id: userId, accessToken: session.access_token }
}

async function removeStaleTemporaryUsers(adminClient) {
  const staleUserIds = []
  for (let page = 1; page <= 20; page += 1) {
    const result = await adminClient.auth.admin.listUsers({ page, perPage: 100 })
      .catch(() => ({ data: null, error: true }))
    if (result.error || !result.data?.users) {
      throw new SmokeError('AUTH_STALE_CLEANUP_FAILED', 'stale temporary user cleanup')
    }
    staleUserIds.push(...result.data.users
      .filter((user) => user.email?.startsWith('wordpress-runtime-') && user.email.endsWith('@example.invalid'))
      .map((user) => user.id))
    if (result.data.users.length < 100) break
  }
  for (const userId of staleUserIds) {
    const result = await adminClient.auth.admin.deleteUser(userId)
    if (result.error) throw new SmokeError('AUTH_STALE_CLEANUP_FAILED', 'stale temporary user cleanup')
  }
}

async function main() {
  const cleanup = createCleanupManager()
  const controller = new AbortController()
  const secrets = []
  let summary = null
  let failure = null
  let cleanupResult

  const interrupt = () => controller.abort()
  process.once('SIGINT', interrupt)
  process.once('SIGTERM', interrupt)

  try {
    const status = await runSupabase(['status', '-o', 'json'], {
      stage: 'local Supabase status',
      failureCode: 'LOCAL_SUPABASE_NOT_RUNNING',
      signal: controller.signal,
    })
    const local = parseSupabaseStatusOutput(status.stdout)
    secrets.push(secret('local publishable key', local.publishableKey), secret('local secret key', local.secretKey))

    const adminClient = createClient(local.apiUrl, local.secretKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      global: { fetch: timedFetch },
    })
    await removeStaleTemporaryUsers(adminClient)
    const allowedUser = await createTemporaryUser(adminClient, local.apiUrl, local.publishableKey, secrets, cleanup, 'allowed')
    const disallowedUser = await createTemporaryUser(adminClient, local.apiUrl, local.publishableKey, secrets, cleanup, 'disallowed')

    const mockUsername = `runtime-${randomBytes(8).toString('hex')}`
    const mockPassword = randomBytes(24).toString('base64url')
    const basicAuthorization = `Basic ${Buffer.from(`${mockUsername}:${mockPassword}`, 'utf8').toString('base64')}`
    secrets.push(
      secret('mock WordPress username', mockUsername),
      secret('mock WordPress application password', mockPassword),
      secret('mock Basic Authorization', basicAuthorization),
      secret('WordPress user email', 'wordpress-user-private@example.invalid'),
      secret('full capabilities marker', 'private_capability_marker'),
      secret('WordPress post slug', 'private-post-slug'),
      secret('WordPress post content', 'private-post-content-marker'),
      secret('WordPress post excerpt', 'private-post-excerpt-marker'),
    )
    const mock = await startMockWordPress({ username: mockUsername, applicationPassword: mockPassword })
    cleanup.add(() => mock.close())

    const temporaryRoot = await mkdtemp(join(tmpdir(), 'daily-brief-note-wordpress-smoke-'))
    assert(resolve(temporaryRoot).startsWith(`${resolve(tmpdir())}\\`) || process.platform !== 'win32', 'TEMP_PATH_INVALID', 'temporary Function environment')
    cleanup.add(() => rm(temporaryRoot, { recursive: true, force: true }))
    const envFile = join(temporaryRoot, `wordpress-${randomUUID()}.env`)
    const functionEnvironment = {
      WORDPRESS_SITE_URL: `http://host.docker.internal:${mock.port}`,
      WORDPRESS_USERNAME: mockUsername,
      WORDPRESS_APPLICATION_PASSWORD: mockPassword,
      WORDPRESS_ALLOWED_USER_ID: allowedUser.id,
      APP_ALLOWED_ORIGINS: allowedOrigin,
      WORDPRESS_LOCAL_MODE: 'true',
    }
    const envText = serializeTemporaryEnv(functionEnvironment)
    await writeFile(envFile, envText, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    if (process.platform !== 'win32') await chmod(envFile, 0o600)

    await removeSmokeEdgeRuntime()
    cleanup.add(removeSmokeEdgeRuntime)
    const functionProcess = startFunction(envFile, functionEnvironment)
    cleanup.add(() => terminateProcessTree(functionProcess.child))
    await waitForFunction({
      accessToken: allowedUser.accessToken,
      publishableKey: local.publishableKey,
      child: functionProcess.child,
      logs: functionProcess.logs,
      signal: controller.signal,
    })

    const responses = []
    const allowed = await diagnosticRequest({
      accessToken: allowedUser.accessToken,
      publishableKey: local.publishableKey,
      signal: controller.signal,
    })
    responses.push(allowed.text)
    assertSuccess(allowed)
    const WordPressRequests = mock.audit.length

    const disallowed = await diagnosticRequest({
      accessToken: disallowedUser.accessToken,
      publishableKey: local.publishableKey,
      signal: controller.signal,
    })
    responses.push(disallowed.text)
    assert(disallowed.status === 403 && errorCode(disallowed) === 'CALLER_FORBIDDEN', 'DISALLOWED_USER_FAILED', 'disallowed user')
    assert(mock.audit.length === WordPressRequests, 'DISALLOWED_USER_REACHED_WORDPRESS', 'disallowed user')

    const badOrigin = await diagnosticRequest({
      accessToken: allowedUser.accessToken,
      publishableKey: local.publishableKey,
      origin: 'https://untrusted.example',
      signal: controller.signal,
    })
    responses.push(badOrigin.text)
    assert(badOrigin.status === 403 && errorCode(badOrigin) === 'ORIGIN_FORBIDDEN', 'ORIGIN_RESTRICTION_FAILED', 'origin restriction')
    assert(mock.audit.length === WordPressRequests, 'BAD_ORIGIN_REACHED_WORDPRESS', 'origin restriction')

    const unauthenticated = await diagnosticRequest({ publishableKey: local.publishableKey, signal: controller.signal })
    responses.push(unauthenticated.text)
    assert(unauthenticated.status === 401, 'UNAUTHENTICATED_REQUEST_FAILED', 'unauthenticated request')
    assert(mock.audit.length === WordPressRequests, 'UNAUTHENTICATED_REACHED_WORDPRESS', 'unauthenticated request')

    const get = await diagnosticRequest({
      method: 'GET',
      accessToken: allowedUser.accessToken,
      publishableKey: local.publishableKey,
      signal: controller.signal,
    })
    responses.push(get.text)
    assert(get.status === 405 && errorCode(get) === 'METHOD_NOT_ALLOWED', 'METHOD_RESTRICTION_FAILED', 'method restriction')
    assert(mock.audit.length === WordPressRequests, 'GET_REACHED_WORDPRESS', 'method restriction')

    const auditSummary = assertReadOnlyMockAudit(mock.audit)
    const observableOutput = `${responses.join('\n')}\n${functionProcess.logs.stdout}\n${functionProcess.logs.stderr}`
    assertNoSecretLeaks(observableOutput, secrets)

    summary = {
      requests: auditSummary.gets,
      writes: auditSummary.writes,
      invalidPaths: auditSummary.invalidPaths,
    }
  } catch (error) {
    failure = error instanceof SmokeError
      ? error
      : new SmokeError('UNEXPECTED_SMOKE_FAILURE', 'runtime smoke')
  } finally {
    cleanupResult = await cleanup.run()
    process.removeListener('SIGINT', interrupt)
    process.removeListener('SIGTERM', interrupt)
  }

  if (failure || !cleanupResult.ok) {
    const safeFailure = failure ?? new SmokeError('CLEANUP_FAILED', 'cleanup')
    console.error('WordPress runtime smoke: FAIL')
    console.error(`- failed stage: ${safeFailure.stage}`)
    console.error(`- error code: ${safeFailure.code}`)
    console.error(`- cleanup: ${cleanupResult.ok ? 'PASS' : 'FAIL'}`)
    if (safeFailure.code === 'LOCAL_SUPABASE_NOT_RUNNING') console.error('- prerequisite: run npm run db:start')
    process.exitCode = 1
    return
  }

  console.log('WordPress runtime smoke: PASS')
  console.log('- local Supabase auth: PASS')
  console.log('- allowed user diagnostic: PASS')
  console.log('- disallowed user: PASS')
  console.log('- origin restriction: PASS')
  console.log('- unauthenticated request: PASS')
  console.log('- method restriction: PASS')
  console.log(`- WordPress requests: ${summary.requests} GET / ${summary.writes} write`)
  console.log(`- unapproved WordPress paths: ${summary.invalidPaths}`)
  console.log('- credential leakage: NONE')
  console.log('- cleanup: PASS')
}

await main()
