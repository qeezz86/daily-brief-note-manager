import { afterEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  checkSupabaseFreshBaseline,
  classifyRemoteState,
  deploymentModes,
  validateDeploymentPlan,
} from './check-supabase-fresh-baseline.mjs'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixtureDirectory = path.join(projectRoot, 'scripts/fixtures/supabase-fresh-baseline')
const temporaryRoots = []

async function json(relativePath) {
  return JSON.parse(await fs.readFile(path.join(projectRoot, relativePath), 'utf8'))
}

async function inspection(name) {
  return JSON.parse(await fs.readFile(path.join(fixtureDirectory, name), 'utf8'))
}

async function copy(relativePath, root) {
  const target = path.join(root, relativePath)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.copyFile(path.join(projectRoot, relativePath), target)
}

async function repositoryFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dbn-supabase-baseline-'))
  temporaryRoots.push(root)
  const manifest = await json('config/supabase-fresh-project-baseline.json')
  const files = [
    'config/supabase-fresh-project-baseline.json',
    'supabase/config.toml',
    'docs/WORDPRESS_PRODUCTION_DEPLOYMENT_RUNBOOK.md',
    'scripts/fixtures/supabase-fresh-baseline/fresh-empty-project.json',
    ...manifest.migrations.map((migration) => `supabase/migrations/${migration.filename}`),
    ...manifest.seedFiles.map((filename) => `supabase/seed/${filename}`),
  ]
  for (const file of files) await copy(file, root)
  return { root, manifest }
}

function namedCheck(report, name) {
  const check = report.checks.find((entry) => entry.name === name)
  if (!check) throw new Error(`missing check ${name}`)
  return check
}

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe('Supabase fresh baseline deployment classification', () => {
  it('classifies the sanitized empty project as requiring the full baseline', async () => {
    const manifest = await json('config/supabase-fresh-project-baseline.json')
    expect(classifyRemoteState(await inspection('fresh-empty-project.json'), manifest)).toBe(deploymentModes.fresh)
  })

  it('accepts the exact 26-migration fresh plan and approved seed', async () => {
    const manifest = await json('config/supabase-fresh-project-baseline.json')
    expect(manifest.migrations).toHaveLength(26)
    expect(manifest.currentApplicationPlans.fresh.pendingMigrationCount).toBe(26)
    expect(manifest.migrations.at(-1)?.filename).toBe('20260729150000_get_dashboard_overview.sql')
    expect(manifest.expectedFunctions.filter((name) => name === 'get_dashboard_overview')).toHaveLength(1)
    expect(manifest.expectedFunctions).toEqual([...manifest.expectedFunctions].sort())
    expect(validateDeploymentPlan(await inspection('fresh-empty-project.json'), manifest)).toEqual([])
  })

  it('rejects a one-migration hardening plan for an empty project', async () => {
    const manifest = await json('config/supabase-fresh-project-baseline.json')
    const value = await inspection('fresh-empty-project.json')
    value.deploymentPlan.plannedMigrationSet = 'approved-incremental'
    expect(validateDeploymentPlan(value, manifest, deploymentModes.fresh)).not.toEqual([])
  })

  it('classifies a consistent 22+4 project as incremental ready', async () => {
    const manifest = await json('config/supabase-fresh-project-baseline.json')
    const value = await inspection('existing-incremental-project.json')
    expect(classifyRemoteState(value, manifest)).toBe(deploymentModes.incremental)
    expect(manifest.currentApplicationPlans.existing.requiredAppliedMigrationCount).toBe(22)
    expect(manifest.currentApplicationPlans.existing.pendingMigrations).toEqual([
      '20260724190000_harden_wordpress_publication_attempt_retention.sql',
      '20260726190000_expand_news_briefing_prompt_recent_counts.sql',
      '20260727150000_add_post_image_prompt_alt_update_rpc.sql',
      '20260729150000_get_dashboard_overview.sql',
    ])
    expect(validateDeploymentPlan(value, manifest)).toEqual([])
  })

  it('rejects an incomplete suffix plan for an exact canonical-prefix project', async () => {
    const manifest = await json('config/supabase-fresh-project-baseline.json')
    const value = await inspection('existing-incremental-project.json')
    value.deploymentPlan = {
      plannedMigrations: ['20260729150000_get_dashboard_overview.sql'],
      includeSeed: false,
      seedFiles: [],
    }
    expect(validateDeploymentPlan(value, manifest, deploymentModes.incremental)).not.toEqual([])
  })

  it('rejects all 26 migrations for an incremental project', async () => {
    const manifest = await json('config/supabase-fresh-project-baseline.json')
    const value = await inspection('existing-incremental-project.json')
    value.deploymentPlan.plannedMigrationSet = 'all'
    expect(validateDeploymentPlan(value, manifest, deploymentModes.incremental)).not.toEqual([])
  })

  it('classifies all 26 applied migrations as current with no deployment plan', async () => {
    const manifest = await json('config/supabase-fresh-project-baseline.json')
    const value = await inspection('current-project.json')
    expect(classifyRemoteState(value, manifest)).toBe(deploymentModes.current)
    expect(validateDeploymentPlan(value, manifest)).toEqual([])
  })

  it('does not misclassify the historical first-19 applied state as current 22+3', async () => {
    const manifest = await json('config/supabase-fresh-project-baseline.json')
    const value = await inspection('legacy-19-applied-project.json')
    expect(classifyRemoteState(value, manifest)).toBe(deploymentModes.partial)
    expect(validateDeploymentPlan(value, manifest)).not.toEqual([])
  })

  it('blocks a middle migration omission', async () => {
    const manifest = await json('config/supabase-fresh-project-baseline.json')
    expect(classifyRemoteState(await inspection('middle-missing-project.json'), manifest)).toBe(deploymentModes.partial)
  })

  it('blocks an applied migration order mismatch', async () => {
    const manifest = await json('config/supabase-fresh-project-baseline.json')
    const filenames = manifest.migrations.map((migration) => migration.filename)
    const value = await inspection('existing-incremental-project.json')
    value.remoteState.appliedMigrations = filenames.slice(0, manifest.currentApplicationPlans.existing.requiredAppliedMigrationCount)
    ;[value.remoteState.appliedMigrations[10], value.remoteState.appliedMigrations[11]] = [
      value.remoteState.appliedMigrations[11],
      value.remoteState.appliedMigrations[10],
    ]
    delete value.remoteState.appliedMigrationSet
    expect(classifyRemoteState(value, manifest)).toBe(deploymentModes.partial)
  })

  it('blocks a partial baseline', async () => {
    const manifest = await json('config/supabase-fresh-project-baseline.json')
    const value = await inspection('partial-baseline-project.json')
    expect(classifyRemoteState(value, manifest)).toBe(deploymentModes.partial)
    expect(validateDeploymentPlan(value, manifest)).not.toEqual([])
  })

  it('blocks schema and history mismatch', async () => {
    const manifest = await json('config/supabase-fresh-project-baseline.json')
    expect(classifyRemoteState(await inspection('history-mismatch-project.json'), manifest)).toBe(deploymentModes.historyMismatch)
  })

  it('blocks an unexpected remote object', async () => {
    const manifest = await json('config/supabase-fresh-project-baseline.json')
    expect(classifyRemoteState(await inspection('unexpected-remote-object-project.json'), manifest)).toBe(deploymentModes.unexpectedObjects)
  })

  it('blocks an unexpected remote-only migration', async () => {
    const manifest = await json('config/supabase-fresh-project-baseline.json')
    expect(classifyRemoteState(await inspection('fresh-extra-migration.json'), manifest)).toBe(deploymentModes.historyMismatch)
  })

  it('blocks an empty project with the wrong pending count', async () => {
    const manifest = await json('config/supabase-fresh-project-baseline.json')
    expect(classifyRemoteState(await inspection('fresh-wrong-pending-count.json'), manifest)).toBe(deploymentModes.partial)
  })

  it('rejects a missing or unsafe fresh seed', async () => {
    const manifest = await json('config/supabase-fresh-project-baseline.json')
    expect(validateDeploymentPlan(await inspection('fresh-missing-seed.json'), manifest)).not.toEqual([])
    expect(validateDeploymentPlan(await inspection('fresh-unsafe-seed.json'), manifest)).not.toEqual([])
  })

  it('rejects seed reapplication on the incremental path', async () => {
    const manifest = await json('config/supabase-fresh-project-baseline.json')
    expect(validateDeploymentPlan(await inspection('incremental-seed-reapply.json'), manifest)).not.toEqual([])
  })
})

describe('Supabase fresh baseline repository checker', () => {
  it('accepts the exact repository baseline deterministically without network or remote CLI', async () => {
    const { root } = await repositoryFixture()
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('network must not be used') }))
    const first = await checkSupabaseFreshBaseline({ root })
    const second = await checkSupabaseFreshBaseline({ root })
    expect(first).toEqual(second)
    expect(first.pass).toBe(true)
    expect(first.networkRequests).toBe(0)
    expect(first.remoteCliCommands).toBe(0)
  })

  it('does not read protected environment files', async () => {
    const { root } = await repositoryFixture()
    await fs.writeFile(path.join(root, '.env.production'), 'SUPABASE_SERVICE_ROLE_KEY=<protected-placeholder>\n')
    const report = await checkSupabaseFreshBaseline({ root })
    expect(report.pass).toBe(true)
    expect(report.protectedEnvironmentFilesRead).toEqual([])
  })

  it('detects a changed migration order', async () => {
    const { root } = await repositoryFixture()
    const file = path.join(root, 'config/supabase-fresh-project-baseline.json')
    const manifest = JSON.parse(await fs.readFile(file, 'utf8'))
    ;[manifest.migrations[0], manifest.migrations[1]] = [manifest.migrations[1], manifest.migrations[0]]
    await fs.writeFile(file, JSON.stringify(manifest))
    expect(namedCheck(await checkSupabaseFreshBaseline({ root }), 'migration inventory').pass).toBe(false)
  })

  it('detects a missing Phase 5E migration and directory-manifest mismatch', async () => {
    const { root, manifest } = await repositoryFixture()
    await fs.rm(path.join(root, 'supabase/migrations', manifest.migrations.at(-1).filename))
    expect(namedCheck(await checkSupabaseFreshBaseline({ root }), 'migration inventory').pass).toBe(false)
  })

  it('detects a latest migration that is not the canonical Phase 5E migration', async () => {
    const { root } = await repositoryFixture()
    const manifestFile = path.join(root, 'config/supabase-fresh-project-baseline.json')
    const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'))
    const previousFilename = manifest.migrations.at(-1).filename
    const replacementFilename = '20260730150000_noncanonical_latest.sql'
    manifest.migrations.at(-1).version = '20260730150000'
    manifest.migrations.at(-1).filename = replacementFilename
    await fs.rename(
      path.join(root, 'supabase/migrations', previousFilename),
      path.join(root, 'supabase/migrations', replacementFilename),
    )
    await fs.writeFile(manifestFile, JSON.stringify(manifest))
    expect(namedCheck(await checkSupabaseFreshBaseline({ root }), 'migration inventory').pass).toBe(false)
  })

  it('detects an extra migration', async () => {
    const { root } = await repositoryFixture()
    await fs.writeFile(path.join(root, 'supabase/migrations/20990101000000_extra.sql'), 'select 1;\n')
    expect(namedCheck(await checkSupabaseFreshBaseline({ root }), 'migration inventory').pass).toBe(false)
  })

  it('detects a missing seed file', async () => {
    const { root } = await repositoryFixture()
    await fs.rm(path.join(root, 'supabase/seed/01_categories.sql'))
    expect(namedCheck(await checkSupabaseFreshBaseline({ root }), 'production seed').pass).toBe(false)
  })

  it('detects an unsafe non-reference seed target', async () => {
    const { root } = await repositoryFixture()
    await fs.appendFile(path.join(root, 'supabase/seed/01_categories.sql'), '\ninsert into public.posts (title) values (\'unsafe\');\n')
    expect(namedCheck(await checkSupabaseFreshBaseline({ root }), 'production seed').pass).toBe(false)
  })

  it('detects credential-like data in a seed without rejecting variable names alone', async () => {
    const { root } = await repositoryFixture()
    const seed = path.join(root, 'supabase/seed/01_categories.sql')
    await fs.appendFile(seed, '\n-- SUPABASE_ACCESS_TOKEN and WORDPRESS_APPLICATION_PASSWORD are names only\n')
    expect(namedCheck(await checkSupabaseFreshBaseline({ root }), 'production seed').pass).toBe(true)
    await fs.appendFile(seed, `\n-- ${'sb_secret_' + 'A'.repeat(24)}\n`)
    expect(namedCheck(await checkSupabaseFreshBaseline({ root }), 'production seed').pass).toBe(false)
  })

  it('detects forbidden destructive migration SQL', async () => {
    const { root, manifest } = await repositoryFixture()
    await fs.appendFile(path.join(root, 'supabase/migrations', manifest.migrations[5].filename), '\nDROP TABLE public.posts;\n')
    expect(namedCheck(await checkSupabaseFreshBaseline({ root }), 'migration safety').pass).toBe(false)
  })
})
