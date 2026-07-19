import { afterEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkWordPressProductionReadiness } from './check-wordpress-production-readiness.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temporaryRoots = []

async function copy(relativePath, root) {
  const source = path.join(projectRoot, relativePath)
  const target = path.join(root, relativePath)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.copyFile(source, target)
}

async function write(root, relativePath, value) {
  const target = path.join(root, relativePath)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, value)
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dbn-wordpress-readiness-'))
  temporaryRoots.push(root)
  const checklist = JSON.parse(await fs.readFile(path.join(projectRoot, 'config/wordpress-production-readiness.json'), 'utf8'))
  const files = [
    'config/wordpress-production-readiness.json', 'supabase/config.toml', 'package.json', '.env.example',
    'README.md', 'docs/WORDPRESS_INTEGRATION.md', 'docs/WORDPRESS_DRAFT_CREATION.md',
    'docs/WORDPRESS_PRODUCTION_DEPLOYMENT_RUNBOOK.md',
    ...checklist.requiredMigrations.map((name) => `supabase/migrations/${name}`),
  ]
  files.push(...checklist.requiredFunctions.map((functionName) => `supabase/functions/${functionName}/index.ts`))
  files.push('supabase/functions/wordpress-draft-create/wordpressDraftClient.ts')
  for (const relativePath of files) await copy(relativePath, root)
  return { root, checklist }
}

function check(report, name) {
  const found = report.checks.find((item) => item.name === name)
  if (!found) throw new Error(`missing check ${name}`)
  return found
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe('WordPress production readiness checker', () => {
  it('accepts the placeholder-only baseline and returns deterministic result ordering', async () => {
    const { root } = await fixture()
    await write(root, 'config/placeholders.env', 'WORDPRESS_APPLICATION_PASSWORD=<WORDPRESS_APPLICATION_PASSWORD>\n')
    const first = await checkWordPressProductionReadiness({ root })
    const second = await checkWordPressProductionReadiness({ root })
    expect(first.pass).toBe(true)
    expect(first).toEqual(second)
    expect(first.checks.map((item) => item.name)).toEqual([
      'migrations', 'functions', 'JWT policy', 'server-only credentials', 'draft-only write',
      'forbidden writes', 'migration contract', 'runbook', 'package commands', 'secret scan',
    ])
  })

  it('detects a required migration missing', async () => {
    const { root, checklist } = await fixture()
    await fs.rm(path.join(root, 'supabase/migrations', checklist.requiredMigrations[0]))
    expect(check(await checkWordPressProductionReadiness({ root }), 'migrations').pass).toBe(false)
  })

  it('detects a Function entry missing', async () => {
    const { root, checklist } = await fixture()
    await fs.rm(path.join(root, 'supabase/functions', checklist.requiredFunctions[0], 'index.ts'))
    expect(check(await checkWordPressProductionReadiness({ root }), 'functions').pass).toBe(false)
  })

  it('detects JWT verification being disabled', async () => {
    const { root } = await fixture()
    const file = path.join(root, 'supabase/config.toml')
    await fs.writeFile(file, (await fs.readFile(file, 'utf8')).replace('verify_jwt = true', 'verify_jwt = false'))
    expect(check(await checkWordPressProductionReadiness({ root }), 'JWT policy').pass).toBe(false)
  })

  it('detects a production --no-verify-jwt script', async () => {
    const { root } = await fixture()
    const file = path.join(root, 'package.json')
    const json = JSON.parse(await fs.readFile(file, 'utf8'))
    json.scripts.deploy = 'supabase functions deploy wordpress-draft-create --no-verify-jwt'
    await fs.writeFile(file, JSON.stringify(json))
    expect(check(await checkWordPressProductionReadiness({ root }), 'JWT policy').pass).toBe(false)
  })

  it('detects a VITE WordPress password variable', async () => {
    const { root } = await fixture()
    await write(root, 'src/leak.ts', 'const value = import.meta.env.VITE_WORDPRESS_APPLICATION_PASSWORD\n')
    expect(check(await checkWordPressProductionReadiness({ root }), 'server-only credentials').pass).toBe(false)
  })

  it('detects WORDPRESS_LOCAL_MODE in production config', async () => {
    const { root } = await fixture()
    await write(root, '.env.production', 'WORDPRESS_LOCAL_MODE=true\n')
    expect(check(await checkWordPressProductionReadiness({ root }), 'server-only credentials').pass).toBe(false)
  })

  it('detects an arbitrary WordPress endpoint', async () => {
    const { root } = await fixture()
    const file = 'supabase/functions/wordpress-draft-create/wordpressDraftClient.ts'
    await fs.appendFile(path.join(root, file), "\nconst unsafe = new URL('wp-json/wp/v2/arbitrary', new URL('https://example.com'))\n")
    expect(check(await checkWordPressProductionReadiness({ root }), 'draft-only write').pass).toBe(false)
  })

  it('detects a publish status', async () => {
    const { root } = await fixture()
    const file = 'supabase/functions/wordpress-draft-create/wordpressDraftClient.ts'
    await fs.appendFile(path.join(root, file), "\nconst unsafe = { status: 'publish' }\n")
    expect(check(await checkWordPressProductionReadiness({ root }), 'forbidden writes').pass).toBe(false)
  })

  it.each(['PUT', 'PATCH', 'DELETE'])('detects forbidden %s WordPress writes', async (method) => {
    const { root } = await fixture()
    const file = 'supabase/functions/wordpress-draft-create/wordpressDraftClient.ts'
    await fs.appendFile(path.join(root, file), `\nconst unsafe = { method: '${method}' }\n`)
    expect(check(await checkWordPressProductionReadiness({ root }), 'forbidden writes').pass).toBe(false)
  })

  it.each(['media', 'categories', 'tags'])('detects forbidden %s endpoint writes', async (endpoint) => {
    const { root } = await fixture()
    const file = 'supabase/functions/wordpress-draft-create/wordpressDraftClient.ts'
    await fs.appendFile(path.join(root, file), `\nconst unsafe = { endpoint: 'wp-json/wp/v2/${endpoint}', method: 'POST' }\n`)
    const report = await checkWordPressProductionReadiness({ root })
    expect(check(report, 'forbidden writes').pass).toBe(false)
  })

  it('detects a missing runbook', async () => {
    const { root } = await fixture()
    await fs.rm(path.join(root, 'docs/WORDPRESS_PRODUCTION_DEPLOYMENT_RUNBOOK.md'))
    expect(check(await checkWordPressProductionReadiness({ root }), 'runbook').pass).toBe(false)
  })

  it('detects a real secret-like fixture', async () => {
    const { root } = await fixture()
    const secret = ['sb', 'secret', 'A'.repeat(24)].join('_')
    await write(root, 'config/leak.env', `LEAK=${secret}\n`)
    expect(check(await checkWordPressProductionReadiness({ root }), 'secret scan').pass).toBe(false)
  })
})
