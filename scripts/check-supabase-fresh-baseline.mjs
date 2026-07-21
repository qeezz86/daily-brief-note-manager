import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const deploymentModes = Object.freeze({
  fresh: 'FRESH_PROJECT_BASELINE_REQUIRED',
  incremental: 'EXISTING_PROJECT_INCREMENTAL_READY',
  partial: 'PARTIAL_BASELINE_BLOCKED',
  historyMismatch: 'HISTORY_MISMATCH_BLOCKED',
  unexpectedObjects: 'UNEXPECTED_REMOTE_OBJECTS_BLOCKED',
})

const manifestRelativePath = 'config/supabase-fresh-project-baseline.json'
const runbookRelativePath = 'docs/WORDPRESS_PRODUCTION_DEPLOYMENT_RUNBOOK.md'
const protectedEnvironmentNames = new Set([
  '.env', '.env.local', '.env.production', '.env.production.local',
  'supabase/functions/.env.local',
])

function normalize(relativePath) {
  return relativePath.split(path.sep).join('/')
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function orderedUnique(values) {
  return values.length === new Set(values).size && same(values, [...values].sort())
}

function result(name, issues) {
  return { name, pass: issues.length === 0, issues: [...issues].sort() }
}

async function readJson(root, relativePath) {
  return JSON.parse(await fs.readFile(path.join(root, relativePath), 'utf8'))
}

async function filesIn(root, relativeDirectory) {
  return (await fs.readdir(path.join(root, relativeDirectory), { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort()
}

function stripSqlComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\r\n]*/g, '')
}

function stripDollarQuotedBodies(source) {
  return source.replace(/\$[A-Za-z0-9_]*\$[\s\S]*?\$[A-Za-z0-9_]*\$/g, '')
}

function credentialLiteralIssues(relativePath, source) {
  const issues = []
  if (/\bsb_(?:secret|service_role)_[A-Za-z0-9_-]{12,}\b/.test(source)) issues.push(`${relativePath}: Supabase elevated key-like literal`)
  if (/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{16,}\b/.test(source)) issues.push(`${relativePath}: JWT-like literal`)
  if (/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(source)) issues.push(`${relativePath}: UUID literal`)
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(source)) issues.push(`${relativePath}: email literal`)
  if (/https?:\/\/(?!localhost\b|127\.0\.0\.1\b|example\.(?:com|test)\b|<)[^\s'"`)]+/i.test(source)) issues.push(`${relativePath}: non-placeholder URL literal`)

  const assignedSecret = /^\s*(?:SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD|SUPABASE_SERVICE_ROLE_KEY|WORDPRESS_APPLICATION_PASSWORD)\s*[=:]\s*(?!env\(|<|\$\{|process\.env\b)(?:["']?)([^\s"']{12,})/gim
  if (assignedSecret.test(source)) issues.push(`${relativePath}: assigned credential-like value`)
  return issues
}

function migrationSafetyIssues(relativePath, source) {
  const normalized = stripSqlComments(source)
  const topLevel = stripDollarQuotedBodies(normalized)
  const issues = credentialLiteralIssues(relativePath, source)
  if (/\bdrop\s+table\b/i.test(topLevel)) issues.push(`${relativePath}: DROP TABLE is forbidden`)
  if (/\btruncate(?:\s+table)?\b/i.test(topLevel)) issues.push(`${relativePath}: TRUNCATE is forbidden`)
  if (/\bdelete\s+from\s+[A-Za-z0-9_.]+\s*;/i.test(topLevel)) issues.push(`${relativePath}: unconditional DELETE is forbidden`)
  if (/^\s*update\s+public\.posts\b/im.test(topLevel)) issues.push(`${relativePath}: top-level posts rewrite is forbidden`)
  return issues
}

function seedSafetyIssues(relativePath, source, allowedTables) {
  const normalized = stripSqlComments(source)
  const issues = credentialLiteralIssues(relativePath, source)
  const targets = [...normalized.matchAll(/\binsert\s+into\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi)].map((match) => match[1].toLowerCase())
  if (targets.length === 0) issues.push(`${relativePath}: no INSERT target found`)
  for (const table of new Set(targets)) {
    if (!allowedTables.includes(table)) issues.push(`${relativePath}: seed target ${table} is not allowed`)
  }
  if (!/\bon\s+conflict\b[\s\S]*\bdo\s+(?:update|nothing)\b/i.test(normalized)) issues.push(`${relativePath}: seed is not an idempotent upsert`)
  if (/\b(?:delete\s+from|truncate|drop\s+table)\b/i.test(normalized)) issues.push(`${relativePath}: destructive seed statement`)
  return issues
}

export function classifyRemoteState(inspection, manifest) {
  const filenames = manifest.migrations.map((migration) => migration.filename)
  const baseline = filenames.slice(0, -3)
  const incremental = filenames.slice(-3)
  const state = inspection.remoteState ?? inspection
  const migrationSet = (values, setName) => {
    if (Array.isArray(values)) return values
    if (setName === 'all') return filenames
    if (setName === 'baseline-19') return baseline
    if (setName === 'wordpress-incremental-3') return incremental
    return []
  }
  const applied = migrationSet(state.appliedMigrations, state.appliedMigrationSet)
  const pending = migrationSet(state.pendingMigrations, state.pendingMigrationSet)
  const tables = state.applicationTables ?? []
  const functions = state.applicationFunctions ?? []
  const remoteOnly = state.remoteOnlyMigrations ?? []
  const unexpected = state.unexpectedObjects ?? []
  const historyRows = state.migrationHistoryRows ?? (state.migrationHistoryPresent === false ? 0 : applied.length)

  if (remoteOnly.length > 0 || state.historyMatchesSchema === false || state.checksumStatus === 'unknown') {
    return deploymentModes.historyMismatch
  }
  if (historyRows === 0 && (tables.length > 0 || functions.length > 0) && unexpected.length === 0) {
    return deploymentModes.historyMismatch
  }
  if (unexpected.length > 0) return deploymentModes.unexpectedObjects
  if (historyRows === 0 && applied.length === 0 && tables.length === 0 && functions.length === 0 && same(pending, filenames)) {
    return deploymentModes.fresh
  }
  if (same(applied, baseline) && same(pending, incremental) && state.coreSchemaPresent === true && state.historyMatchesSchema === true) {
    return deploymentModes.incremental
  }
  return deploymentModes.partial
}

export function validateDeploymentPlan(inspection, manifest, mode = classifyRemoteState(inspection, manifest)) {
  const filenames = manifest.migrations.map((migration) => migration.filename)
  const expectedMigrations = mode === deploymentModes.fresh ? filenames : filenames.slice(-3)
  const plan = inspection.deploymentPlan ?? {}
  const plannedMigrations = Array.isArray(plan.plannedMigrations)
    ? plan.plannedMigrations
    : plan.plannedMigrationSet === 'all'
      ? filenames
      : plan.plannedMigrationSet === 'wordpress-incremental-3'
        ? filenames.slice(-3)
        : []
  const issues = []

  if (mode !== deploymentModes.fresh && mode !== deploymentModes.incremental) {
    issues.push(`${mode}: deployment is blocked`)
    return issues
  }
  if (!same(plannedMigrations, expectedMigrations)) {
    issues.push(`${mode}: planned migrations must exactly match the approved ordered ${expectedMigrations.length}-migration set`)
  }
  if (mode === deploymentModes.fresh) {
    if (plan.includeSeed !== true) issues.push('fresh baseline must include the approved production seed')
    if (!same(plan.seedFiles ?? [], manifest.seedFiles)) issues.push('fresh baseline seed files must exactly match the manifest')
    if (plan.seedSafety === 'unsafe') issues.push('fresh baseline seed assessment is unsafe')
  } else if (plan.includeSeed !== false || (plan.seedFiles ?? []).length > 0) {
    issues.push('incremental deployment must not reapply seed data by default')
  }
  return issues
}

export async function checkSupabaseFreshBaseline(options = {}) {
  const root = path.resolve(options.root ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'))
  const manifest = options.manifest ?? await readJson(root, manifestRelativePath)
  const checks = []

  const migrationFiles = await filesIn(root, 'supabase/migrations')
  const expectedMigrationFiles = manifest.migrations.map((migration) => migration.filename)
  const migrationIssues = []
  if (manifest.schemaVersion !== 1) migrationIssues.push('manifest schemaVersion must be 1')
  if (manifest.deploymentMode !== 'fresh-project-baseline') migrationIssues.push('manifest deploymentMode is invalid')
  if (manifest.migrationCount !== 22 || manifest.migrations.length !== 22) migrationIssues.push('manifest must contain exactly 22 migrations')
  if (!same(migrationFiles, expectedMigrationFiles)) migrationIssues.push('migration directory does not exactly match the ordered manifest')
  if (migrationFiles.some((filename) => !filename.endsWith('.sql'))) migrationIssues.push('migration directory contains a non-SQL file')
  const versions = manifest.migrations.map((migration) => migration.version)
  if (!orderedUnique(versions)) migrationIssues.push('migration versions must be unique and ascending')
  for (const migration of manifest.migrations) {
    if (migration.filename !== `${migration.version}_${migration.filename.slice(15)}`) migrationIssues.push(`${migration.filename}: version and filename disagree`)
  }
  if (expectedMigrationFiles[0] !== '20260710080000_initial_schema.sql') migrationIssues.push('first migration must be the initial schema')
  if (expectedMigrationFiles.at(-1) !== '20260719130000_harden_wordpress_draft_transition.sql') migrationIssues.push('last migration must be transition hardening')
  checks.push(result('migration inventory', migrationIssues))

  const migrationSafety = []
  for (const filename of migrationFiles.filter((name) => name.endsWith('.sql'))) {
    const relativePath = normalize(path.join('supabase/migrations', filename))
    migrationSafety.push(...migrationSafetyIssues(relativePath, await fs.readFile(path.join(root, relativePath), 'utf8')))
  }
  checks.push(result('migration safety', migrationSafety))

  const seedFiles = await filesIn(root, 'supabase/seed')
  const seedIssues = []
  if (!same(seedFiles, manifest.seedFiles)) seedIssues.push('seed directory does not exactly match the manifest whitelist')
  if (!Array.isArray(manifest.allowedSeedTables) || manifest.allowedSeedTables.length === 0) seedIssues.push('allowedSeedTables must not be empty')
  for (const filename of seedFiles) {
    const relativePath = normalize(path.join('supabase/seed', filename))
    seedIssues.push(...seedSafetyIssues(relativePath, await fs.readFile(path.join(root, relativePath), 'utf8'), manifest.allowedSeedTables ?? []))
  }
  const configToml = await fs.readFile(path.join(root, 'supabase/config.toml'), 'utf8')
  if (!/\[db\.seed\][\s\S]*?enabled\s*=\s*true/i.test(configToml)) seedIssues.push('supabase/config.toml must enable seeding')
  if (!/sql_paths\s*=\s*\[\s*["']\.\/seed\/\*\.sql["']\s*\]/i.test(configToml)) seedIssues.push('supabase/config.toml seed path must be ./seed/*.sql')
  checks.push(result('production seed', seedIssues))

  const runbook = await fs.readFile(path.join(root, runbookRelativePath), 'utf8')
  const runbookHeadings = [
    'Remote Database State Classification', 'Fresh Project Baseline Path', 'Existing Project Incremental Path',
    'Partial or History-Mismatch Stop Path', 'Production Seed Policy', 'Fresh Baseline Approval Gate',
    'Fresh Baseline Post-Deployment Verification', 'Auth User Bootstrap Timing', 'Recovery and Forward-Fix Policy',
  ]
  const runbookIssues = runbookHeadings.filter((heading) => !runbook.includes(heading)).map((heading) => `runbook missing ${heading}`)
  if (!runbook.includes('22')) runbookIssues.push('runbook does not state the 22-migration baseline')
  if (!runbook.includes('마지막 3개')) runbookIssues.push('runbook does not preserve the three-migration incremental path')
  checks.push(result('runbook modes', runbookIssues))

  const inspection = options.inspection ?? await readJson(root, options.fixture ?? 'scripts/fixtures/supabase-fresh-baseline/fresh-empty-project.json')
  const mode = classifyRemoteState(inspection, manifest)
  checks.push(result('deployment plan', validateDeploymentPlan(inspection, manifest, mode)))

  return {
    pass: checks.every((check) => check.pass),
    mode,
    checks,
    protectedEnvironmentFilesRead: [],
    networkRequests: 0,
    remoteCliCommands: 0,
  }
}

export function formatSupabaseFreshBaselineReport(report) {
  const lines = [
    `Supabase fresh baseline readiness: ${report.pass ? 'PASS' : 'FAIL'}`,
    `- deployment mode: ${report.mode}`,
  ]
  for (const check of report.checks) {
    lines.push(`- ${check.name}: ${check.pass ? 'PASS' : 'FAIL'}`)
    for (const issue of check.issues) lines.push(`  - ${issue}`)
  }
  lines.push(`- protected environment files read: ${report.protectedEnvironmentFilesRead.length}`)
  lines.push(`- network requests: ${report.networkRequests}`)
  lines.push(`- remote CLI commands: ${report.remoteCliCommands}`)
  return lines.join('\n')
}

function parseFixtureArgument(args) {
  const index = args.indexOf('--fixture')
  if (index === -1) return undefined
  if (!args[index + 1]) throw new Error('--fixture requires a repository-relative JSON path')
  const candidate = normalize(args[index + 1])
  if (protectedEnvironmentNames.has(candidate) || candidate.includes('..')) throw new Error('unsafe fixture path')
  return candidate
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const report = await checkSupabaseFreshBaseline({ fixture: parseFixtureArgument(process.argv.slice(2)) })
  process.stdout.write(`${formatSupabaseFreshBaselineReport(report)}\n`)
  if (!report.pass) process.exitCode = 1
}
