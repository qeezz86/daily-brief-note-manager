import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const deploymentModes = Object.freeze({
  fresh: 'FRESH_PROJECT_BASELINE_REQUIRED',
  incremental: 'EXISTING_PROJECT_INCREMENTAL_READY',
  current: 'MIGRATION_BASELINE_CURRENT',
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

const databaseEvidenceFlags = Object.freeze([
  '--migration-json',
  '--pgtap-dir',
  '--generated-types',
  '--tracked-types',
])

const databaseEvidenceFlagSet = new Set(databaseEvidenceFlags)
const utf8Decoder = new TextDecoder('utf-8', { fatal: true })

const diagnostic = Object.freeze({
  argumentUnknown: 'ARGUMENT_UNKNOWN',
  argumentDuplicate: 'ARGUMENT_DUPLICATE',
  argumentValueMissing: 'ARGUMENT_VALUE_MISSING',
  argumentRequiredMissing: 'ARGUMENT_REQUIRED_MISSING',
  evidenceFileMissing: 'EVIDENCE_FILE_MISSING',
  evidenceFileInvalid: 'EVIDENCE_FILE_INVALID',
  manifestEvidenceInvalid: 'MANIFEST_DATABASE_EVIDENCE_INVALID',
  migrationEvidenceInvalid: 'MIGRATION_EVIDENCE_INVALID',
  migrationExpectedIdMissing: 'MIGRATION_EXPECTED_ID_MISSING',
  migrationPendingOrDivergent: 'MIGRATION_PENDING_OR_DIVERGENT',
  pgTapPlanInvalid: 'PGTAP_PLAN_INVALID',
  pgTapAssertionInvalid: 'PGTAP_ASSERTION_INVALID',
  pgTapMalformed: 'PGTAP_TRUNCATED_OR_MALFORMED',
  generatedTypesInvalid: 'GENERATED_TYPES_INVALID',
  generatedTypesMismatch: 'GENERATED_TYPES_MISMATCH',
  rpcContractMismatch: 'RPC_CONTRACT_MISMATCH',
  remoteOrLinkedMarker: 'REMOTE_OR_LINKED_MARKER_DETECTED',
  productionCredentialMarker: 'PRODUCTION_CREDENTIAL_MARKER_DETECTED',
  forbiddenRepairOrResetMarker: 'FORBIDDEN_REPAIR_OR_RESET_MARKER',
  resultMaskingMarker: 'RESULT_MASKING_MARKER_DETECTED',
})

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

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function validateDatabaseRuntimeEvidenceManifest(manifest) {
  const issues = []
  const evidence = manifest?.databaseRuntimeEvidence
  if (!isPlainObject(evidence)) {
    return [`${diagnostic.manifestEvidenceInvalid}: databaseRuntimeEvidence must be an object`]
  }
  if (evidence.schemaVersion !== 1 || !Number.isInteger(evidence.schemaVersion)) {
    issues.push(`${diagnostic.manifestEvidenceInvalid}: databaseRuntimeEvidence schemaVersion must be integer 1`)
  }

  const suites = evidence.pgTapSuites
  if (!Array.isArray(suites) || suites.length === 0) {
    issues.push(`${diagnostic.manifestEvidenceInvalid}: pgTapSuites must be a non-empty array`)
  } else {
    const ids = new Set()
    const files = new Set()
    for (const [index, suite] of suites.entries()) {
      const label = `pgTapSuites[${index}]`
      if (!isPlainObject(suite)) {
        issues.push(`${diagnostic.manifestEvidenceInvalid}: ${label} must be an object`)
        continue
      }
      if (typeof suite.id !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/.test(suite.id)) {
        issues.push(`${diagnostic.manifestEvidenceInvalid}: ${label}.id is unsafe or invalid`)
      } else if (ids.has(suite.id)) {
        issues.push(`${diagnostic.manifestEvidenceInvalid}: duplicate pgTAP suite id ${suite.id}`)
      } else {
        ids.add(suite.id)
      }
      if (typeof suite.file !== 'string' || !/^supabase\/tests\/[A-Za-z0-9][A-Za-z0-9._-]*\.test\.sql$/.test(suite.file)) {
        issues.push(`${diagnostic.manifestEvidenceInvalid}: ${label}.file must be a safe supabase/tests/*.test.sql path`)
      } else if (files.has(suite.file)) {
        issues.push(`${diagnostic.manifestEvidenceInvalid}: duplicate pgTAP suite file ${suite.file}`)
      } else {
        files.add(suite.file)
      }
      if (!Number.isInteger(suite.expectedAssertions) || suite.expectedAssertions <= 0 || suite.expectedAssertions > 10000) {
        issues.push(`${diagnostic.manifestEvidenceInvalid}: ${label}.expectedAssertions must be an integer from 1 to 10000`)
      }
    }
  }

  const contracts = evidence.requiredRpcContracts
  if (!Array.isArray(contracts) || contracts.length === 0) {
    issues.push(`${diagnostic.manifestEvidenceInvalid}: requiredRpcContracts must be a non-empty array`)
  } else {
    const names = new Set()
    for (const [index, contract] of contracts.entries()) {
      const label = `requiredRpcContracts[${index}]`
      if (!isPlainObject(contract)) {
        issues.push(`${diagnostic.manifestEvidenceInvalid}: ${label} must be an object`)
        continue
      }
      if (typeof contract.name !== 'string' || !/^[a-z_][a-z0-9_]*$/.test(contract.name)) {
        issues.push(`${diagnostic.manifestEvidenceInvalid}: ${label}.name is unsafe or invalid`)
      } else if (names.has(contract.name)) {
        issues.push(`${diagnostic.manifestEvidenceInvalid}: duplicate required RPC name ${contract.name}`)
      } else {
        names.add(contract.name)
      }
      if (!isPlainObject(contract.args) || Object.keys(contract.args).length === 0) {
        issues.push(`${diagnostic.manifestEvidenceInvalid}: ${label}.args must be a non-empty object`)
      } else {
        const argNames = Object.keys(contract.args)
        if (!same(argNames, [...argNames].sort())) {
          issues.push(`${diagnostic.manifestEvidenceInvalid}: ${label}.args keys must be deterministically sorted`)
        }
        for (const [argName, typeToken] of Object.entries(contract.args)) {
          if (!/^[a-z_][a-z0-9_]*$/.test(argName)) issues.push(`${diagnostic.manifestEvidenceInvalid}: ${label}.args contains an unsafe name`)
          if (typeof typeToken !== 'string' || !/^[A-Za-z_$][A-Za-z0-9_$]*(?:\[\])?$/.test(typeToken)) {
            issues.push(`${diagnostic.manifestEvidenceInvalid}: ${label}.args.${argName} has an unsupported type token`)
          }
        }
      }
      if (typeof contract.returns !== 'string' || !/^[A-Za-z_$][A-Za-z0-9_$]*(?:\[\])?$/.test(contract.returns)) {
        issues.push(`${diagnostic.manifestEvidenceInvalid}: ${label}.returns has an unsupported type token`)
      }
    }
  }
  return issues
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
  const existingPlan = manifest.currentApplicationPlans?.existing
  const appliedPrefixCount = existingPlan?.requiredAppliedMigrationCount
  const baseline = Number.isInteger(appliedPrefixCount) ? filenames.slice(0, appliedPrefixCount) : []
  const incremental = existingPlan?.pendingMigrations ?? []
  const state = inspection.remoteState ?? inspection
  const migrationSet = (values, setName) => {
    if (Array.isArray(values)) return values
    if (setName === 'all') return filenames
    if (setName === 'existing-canonical-prefix') return baseline
    if (setName === 'canonical-applied') return filenames
    if (setName === 'approved-incremental') return incremental
    if (setName === 'none') return []
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
  if (historyRows === baseline.length && same(applied, baseline) && same(pending, incremental) && state.coreSchemaPresent === true && state.historyMatchesSchema === true) {
    return deploymentModes.incremental
  }
  if (historyRows === filenames.length && same(applied, filenames) && pending.length === 0 && state.coreSchemaPresent === true && state.historyMatchesSchema === true) {
    return deploymentModes.current
  }
  return deploymentModes.partial
}

export function validateDeploymentPlan(inspection, manifest, mode = classifyRemoteState(inspection, manifest)) {
  const filenames = manifest.migrations.map((migration) => migration.filename)
  const incrementalMigrations = manifest.currentApplicationPlans?.existing?.pendingMigrations ?? []
  const expectedMigrations = mode === deploymentModes.fresh
    ? filenames
    : mode === deploymentModes.incremental
      ? incrementalMigrations
      : []
  const plan = inspection.deploymentPlan ?? {}
  const hasKnownPlan = Array.isArray(plan.plannedMigrations)
    || ['all', 'approved-incremental', 'none'].includes(plan.plannedMigrationSet)
  const plannedMigrations = Array.isArray(plan.plannedMigrations)
    ? plan.plannedMigrations
    : plan.plannedMigrationSet === 'all'
      ? filenames
      : plan.plannedMigrationSet === 'approved-incremental'
        ? incrementalMigrations
        : plan.plannedMigrationSet === 'none'
          ? []
        : []
  const issues = []

  if (!hasKnownPlan) issues.push('deployment plan must identify an explicit approved migration set')
  if (mode === deploymentModes.current) {
    if (plannedMigrations.length > 0) issues.push('current baseline must not plan additional migrations')
    if (plan.includeSeed !== false || (plan.seedFiles ?? []).length > 0) {
      issues.push('current baseline must not reapply seed data by default')
    }
    return issues
  }
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
  if (!Number.isInteger(manifest.migrationCount) || manifest.migrationCount <= 0 || manifest.migrationCount !== manifest.migrations.length) migrationIssues.push('manifest migrationCount must match the non-empty migration inventory')
  if (!same(migrationFiles, expectedMigrationFiles)) migrationIssues.push('migration directory does not exactly match the ordered manifest')
  if (migrationFiles.some((filename) => !filename.endsWith('.sql'))) migrationIssues.push('migration directory contains a non-SQL file')
  const versions = manifest.migrations.map((migration) => migration.version)
  if (!orderedUnique(versions)) migrationIssues.push('migration versions must be unique and ascending')
  for (const migration of manifest.migrations) {
    if (migration.filename !== `${migration.version}_${migration.filename.slice(15)}`) migrationIssues.push(`${migration.filename}: version and filename disagree`)
  }
  if (expectedMigrationFiles[0] !== '20260710080000_initial_schema.sql') migrationIssues.push('first migration must be the initial schema')
  const existingPlan = manifest.currentApplicationPlans?.existing
  const freshPlan = manifest.currentApplicationPlans?.fresh
  if (freshPlan?.requiredAppliedMigrationCount !== 0 || freshPlan?.pendingMigrationCount !== expectedMigrationFiles.length || freshPlan?.seedRequired !== true) {
    migrationIssues.push('fresh project plan metadata must require the complete migration inventory and the approved seed')
  }
  if (!Number.isInteger(existingPlan?.requiredAppliedMigrationCount) || existingPlan.requiredAppliedMigrationCount < 0 || existingPlan.requiredAppliedMigrationCount >= expectedMigrationFiles.length) migrationIssues.push('existing project plan must declare a valid applied canonical prefix')
  if (!same(existingPlan?.pendingMigrations, expectedMigrationFiles.slice(existingPlan?.requiredAppliedMigrationCount ?? 0))) migrationIssues.push('existing project plan must contain the exact ordered canonical suffix')
  if (existingPlan?.seedRequired !== false) migrationIssues.push('existing project plan metadata must not require seed reapplication')
  checks.push(result('migration inventory', migrationIssues))
  checks.push(result('database runtime evidence manifest', validateDatabaseRuntimeEvidenceManifest(manifest)))

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

function evidenceResult(name, issues) {
  return result(name, [...new Set(issues)])
}

function decodeUtf8(buffer, label, issues) {
  if (buffer.includes(0)) {
    issues.push(`${diagnostic.evidenceFileInvalid}: ${label}: NUL or binary content`)
    return undefined
  }
  try {
    return utf8Decoder.decode(buffer)
  } catch {
    issues.push(`${diagnostic.evidenceFileInvalid}: ${label}: invalid UTF-8`)
    return undefined
  }
}

async function readEvidence(relativeOrAbsolutePath, label) {
  try {
    const metadata = await fs.lstat(relativeOrAbsolutePath)
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      return { value: undefined, issues: [`${diagnostic.evidenceFileInvalid}: ${label} path is not a regular file`] }
    }
    const value = await fs.readFile(relativeOrAbsolutePath)
    return {
      value,
      issues: value.length === 0
        ? [`${diagnostic.evidenceFileInvalid}: ${label}: evidence is empty`]
        : [],
    }
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
    const category = code === 'ENOENT' ? diagnostic.evidenceFileMissing : diagnostic.evidenceFileInvalid
    return { value: undefined, issues: [`${category}: ${label}: evidence is missing or unreadable`] }
  }
}

function unsafeEvidenceMarkerIssues(label, source) {
  const markers = [
    [diagnostic.resultMaskingMarker, /(?:"(?:exitCode|exit_code)"\s*:\s*[1-9]\d*|"(?:commandSucceeded|command_succeeded|success)"\s*:\s*false|\bcommand failed\b|continue[-_ ]on[-_ ]error|\|\|\s*true|\bignored[-_ ]failure\b|\bmasked[-_ ]exit[-_ ]status\b|\ballowed[-_ ]failure\b|"(?:ignoredFailure|maskedExitStatus|allowedFailure|masked|resultMasked|result_masked)"\s*:\s*true|(?:\bvalidation\b|\bchecker\b|\btest\b).{0,40}\bretr(?:y|ies)\b|\bretr(?:y|ies)\b.{0,40}(?:\bvalidation\b|\bchecker\b|\btest\b))/i],
    [diagnostic.remoteOrLinkedMarker, /(?:--linked\b|--project-ref\b|--db-url\b|"linked"\s*:\s*true|\bproject[_-]ref\b|\bsupabase\s+link\b|\blinked[-_ ]project\b|\bremote[-_ ](?:project|database|migration)\b|\bremote[-_ ]type[-_ ]generation\b|postgres(?:ql)?:\/\/(?!localhost\b|127\.0\.0\.1\b)|(?:\bdb\.)?[a-z0-9-]+\.supabase\.co\b)/i],
    [diagnostic.productionCredentialMarker, /(?:\bproduction[-_ ](?:database|credential|secret|project[-_ ]ref)\b|\bservice[_-]role\b|\bSUPABASE_(?:ACCESS_TOKEN|DB_PASSWORD|SERVICE_ROLE_KEY)\b|\bDATABASE_URL\b|\bPOSTGRES_URL\b|\bhosted[-_ ](?:db|database)[-_ ]password\b)/i],
    [diagnostic.forbiddenRepairOrResetMarker, /(?:\b(?:supabase\s+)?migration[-_ ]repair\b|\b(?:supabase\s+)?db[-_ ]reset\b|\bmigration[-_ ]history[-_ ]rewrite\b|\bmigration[-_ ]squash\b|\bpersistent[-_ ]remote[-_ ]apply\b)/i],
  ]
  return markers
    .filter(([, pattern]) => pattern.test(source))
    .map(([category]) => `${category}: prohibited marker detected in ${label}`)
}

function migrationRowsFromJson(value) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return undefined
  if (Array.isArray(value.migrations)) return value.migrations
  if (Array.isArray(value.result)) return value.result

  const local = value.local ?? value.Local
  const remote = value.remote ?? value.Remote
  const time = value.time ?? value.Time
  if (!Array.isArray(local) || !Array.isArray(remote) || local.length !== remote.length) return undefined
  if (time !== undefined && (!Array.isArray(time) || time.length !== local.length)) return undefined
  return local.map((localVersion, index) => ({
    local: localVersion,
    remote: remote[index],
    ...(time === undefined ? {} : { time: time[index] }),
  }))
}

function migrationVersion(row, field) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return undefined
  const entry = Object.entries(row).find(([key]) => key.toLowerCase() === field)
  const value = entry?.[1]
  if (value === null || value === '') return ''
  return typeof value === 'string' && /^\d{14}$/.test(value.trim()) ? value.trim() : undefined
}

function validateMigrationEvidence(source, expectedMigrations) {
  const issues = []
  if (source.trim() === '') return [`${diagnostic.migrationEvidenceInvalid}: migration state: evidence is empty`]

  let parsed
  try {
    parsed = JSON.parse(source)
  } catch {
    return [`${diagnostic.migrationEvidenceInvalid}: migration state: malformed JSON`]
  }
  const rows = migrationRowsFromJson(parsed)
  if (!rows || rows.length === 0) return [`${diagnostic.migrationEvidenceInvalid}: migration state: JSON contains no migration rows`]

  const local = []
  const appliedToLocalDatabase = []
  for (const row of rows) {
    const localVersion = migrationVersion(row, 'local')
    const remoteVersion = migrationVersion(row, 'remote')
    if (localVersion === undefined || remoteVersion === undefined) {
      issues.push(`${diagnostic.migrationEvidenceInvalid}: migration state: malformed migration row`)
      continue
    }
    if (localVersion === '') issues.push(`${diagnostic.migrationPendingOrDivergent}: migration state: unexpected database-only migration`)
    if (remoteVersion === '') issues.push(`${diagnostic.migrationPendingOrDivergent}: migration state: unexpected pending migration`)
    if (localVersion !== '' && remoteVersion !== '' && localVersion !== remoteVersion) {
      issues.push(`${diagnostic.migrationPendingOrDivergent}: migration state: divergent migration identity`)
    }
    if (localVersion !== '') local.push(localVersion)
    if (remoteVersion !== '') appliedToLocalDatabase.push(remoteVersion)
  }

  if (!same(local, expectedMigrations)) issues.push(`${diagnostic.migrationPendingOrDivergent}: migration state: repository migration inventory is incomplete or reordered`)
  if (!same(appliedToLocalDatabase, expectedMigrations)) issues.push(`${diagnostic.migrationPendingOrDivergent}: migration state: migrated local database history is incomplete or reordered`)
  const newestExpectedMigration = expectedMigrations.at(-1)
  if (newestExpectedMigration && (!local.includes(newestExpectedMigration) || !appliedToLocalDatabase.includes(newestExpectedMigration))) {
    issues.push(`${diagnostic.migrationExpectedIdMissing}: migration state: expected migration ${newestExpectedMigration} is missing`)
  }
  return issues
}

function validatePgTapEvidence(source, expectedAssertions) {
  const issues = []
  if (source.trim() === '') return [`${diagnostic.evidenceFileInvalid}: pgTAP: evidence is empty`]
  if (/\r(?!\n)/.test(source)) issues.push(`${diagnostic.pgTapMalformed}: bare CR is forbidden`)
  if (!source.endsWith('\n')) issues.push(`${diagnostic.pgTapMalformed}: TAP stream must end with a complete newline`)

  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const assertions = []
  const planIndexes = []
  let versionCount = 0
  let yamlOpen = false
  let yamlParentFailed = false

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (yamlOpen) {
      if (line === '  ...') {
        yamlOpen = false
        yamlParentFailed = false
      } else if (!/^  \S/.test(line) && line !== '') {
        issues.push(`${diagnostic.pgTapMalformed}: malformed TAP diagnostic YAML indentation`)
      }
      continue
    }
    const mayStartYaml = yamlParentFailed
    yamlParentFailed = false
    if (line === '' || /^\s*#/.test(line)) {
      if (/^\s*#\s*(?:S|SK|SKI|T|TO|TOD)\s*$/i.test(line)) {
        issues.push(`${diagnostic.pgTapMalformed}: partial TAP directive`)
      }
      continue
    }
    if (line === 'TAP version 13') {
      versionCount += 1
      if (index !== 0 || versionCount > 1) issues.push(`${diagnostic.pgTapMalformed}: TAP version line is misplaced or duplicated`)
      continue
    }
    if (line === `1..${expectedAssertions}`) {
      planIndexes.push(index)
      continue
    }
    if (/^(?:\d+)\.\.(?:\d+)/.test(line)) {
      planIndexes.push(index)
      issues.push(`${diagnostic.pgTapPlanInvalid}: exact plan 1..${expectedAssertions} is required`)
      continue
    }
    if (/^Bail out!/i.test(line) || /^Bail(?:\s+out?)?\s*!?$/i.test(line)) {
      issues.push(`${diagnostic.pgTapMalformed}: bailout or truncated bailout detected`)
      continue
    }
    const directive = line.match(/\s+#\s*(SKIP|TODO)\b.*$/i)
    if (line.includes('#') && !directive) {
      issues.push(`${diagnostic.pgTapMalformed}: malformed or partial TAP directive`)
      continue
    }
    const assertionText = directive ? line.slice(0, directive.index) : line
    const assertion = assertionText.match(/^(not ok|ok)\s+([1-9]\d*)(?:\s+-\s+(\S.*?))?\s*$/i)
    if (assertion) {
      assertions.push({
        passed: assertion[1].toLowerCase() === 'ok',
        number: Number(assertion[2]),
        skipped: directive?.[1].toLowerCase() === 'skip',
        todo: directive?.[1].toLowerCase() === 'todo',
      })
      yamlParentFailed = assertion[1].toLowerCase() === 'not ok'
      continue
    }
    if (line === '  ---') {
      if (!mayStartYaml) issues.push(`${diagnostic.pgTapMalformed}: diagnostic YAML has no failing parent assertion`)
      yamlOpen = true
      continue
    }
    issues.push(`${diagnostic.pgTapMalformed}: malformed assertion line or unrecognized TAP content`)
  }

  if (yamlOpen) issues.push(`${diagnostic.pgTapMalformed}: unclosed TAP diagnostic YAML block`)
  if (planIndexes.length !== 1 || lines[planIndexes[0]] !== `1..${expectedAssertions}`) {
    issues.push(`${diagnostic.pgTapPlanInvalid}: exact plan 1..${expectedAssertions} is required exactly once`)
  } else {
    const assertionIndexes = lines
      .map((line, index) => /^(?:not ok|ok)\s+[1-9]\d*/i.test(line) ? index : -1)
      .filter((index) => index >= 0)
    const planIndex = planIndexes[0]
    const planIsLeading = assertionIndexes.length > 0 && planIndex < assertionIndexes[0]
    const planIsTrailing = assertionIndexes.length > 0 && planIndex > assertionIndexes.at(-1)
    if (!planIsLeading && !planIsTrailing) issues.push(`${diagnostic.pgTapPlanInvalid}: plan must precede or follow the complete assertion sequence`)
  }
  if (assertions.length !== expectedAssertions) issues.push(`${diagnostic.pgTapAssertionInvalid}: expected ${expectedAssertions} assertions, found ${assertions.length}`)
  if (!same(assertions.map((assertion) => assertion.number), Array.from({ length: expectedAssertions }, (_, index) => index + 1))) {
    issues.push(`${diagnostic.pgTapAssertionInvalid}: assertion numbers must be exactly 1 through ${expectedAssertions}`)
    issues.push(`${diagnostic.pgTapMalformed}: truncated, duplicate, missing, or out-of-range assertion number`)
  }
  const failed = assertions.filter((assertion) => !assertion.passed).length
  const skipped = assertions.filter((assertion) => assertion.skipped).length
  const todos = assertions.filter((assertion) => assertion.todo).length
  const passed = assertions.filter((assertion) => assertion.passed && !assertion.skipped && !assertion.todo).length
  if (failed > 0) issues.push(`${diagnostic.pgTapAssertionInvalid}: ${failed} failed assertion(s)`)
  if (skipped > 0) issues.push(`${diagnostic.pgTapAssertionInvalid}: ${skipped} skipped assertion(s)`)
  if (todos > 0) issues.push(`${diagnostic.pgTapAssertionInvalid}: ${todos} todo assertion(s)`)
  if (passed !== expectedAssertions) issues.push(`${diagnostic.pgTapAssertionInvalid}: expected ${expectedAssertions} passed assertions, found ${passed}`)
  return issues
}

function normalizedTypeEvidence(buffer, label, issues) {
  const hasBom = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf
  const body = hasBom ? buffer.subarray(3) : buffer
  const source = decodeUtf8(body, label, issues)
  if (source === undefined) return undefined
  if (/\r(?!\n)/.test(source)) {
    issues.push(`${diagnostic.generatedTypesInvalid}: ${label}: bare CR newline is forbidden`)
    return undefined
  }
  return { hasBom, source: source.replace(/\r\n/g, '\n') }
}

function rpcContractPattern(contract) {
  const args = Object.entries(contract.args)
    .map(([name, typeToken]) => `${escapeRegExp(name)}\\s*:\\s*${escapeRegExp(typeToken)}\\s*[;,]?`)
    .join('\\s*')
  return new RegExp(
    `(?<![A-Za-z0-9_$])${escapeRegExp(contract.name)}(?![A-Za-z0-9_$])\\s*:\\s*\\{\\s*Args\\s*:\\s*\\{\\s*${args}\\s*\\}\\s*[;,]?\\s*Returns\\s*:\\s*${escapeRegExp(contract.returns)}\\s*[;,]?\\s*\\}`,
    'g',
  )
}

function validateGeneratedTypes(generatedBuffer, trackedBuffer, requiredRpcContracts) {
  const issues = []
  const generated = normalizedTypeEvidence(generatedBuffer, 'generated types', issues)
  const tracked = normalizedTypeEvidence(trackedBuffer, 'tracked types', issues)
  if (!generated || !tracked) return issues
  if (generated.hasBom !== tracked.hasBom) issues.push(`${diagnostic.generatedTypesMismatch}: generated types: UTF-8 BOM status differs from tracked types`)
  if (generated.source !== tracked.source) issues.push(`${diagnostic.generatedTypesMismatch}: generated types: normalized raw bytes differ from tracked types`)

  for (const contract of requiredRpcContracts) {
    const generatedContracts = [...generated.source.matchAll(rpcContractPattern(contract))].length
    const trackedContracts = [...tracked.source.matchAll(rpcContractPattern(contract))].length
    if (generatedContracts !== 1 || trackedContracts !== 1) {
      const args = Object.entries(contract.args).map(([name, typeToken]) => `${name}: ${typeToken}`).join(', ')
      issues.push(`${diagnostic.rpcContractMismatch}: generated types: ${contract.name} must occur exactly once with Args { ${args} } and Returns ${contract.returns}`)
    }
  }
  return issues
}

async function repositoryMigrationInventory(root) {
  const filenames = await filesIn(root, 'supabase/migrations')
  const versions = filenames.map((filename) => filename.match(/^(\d{14})_[A-Za-z0-9_]+\.sql$/)?.[1])
  if (versions.some((version) => version === undefined) || !orderedUnique(versions)) {
    throw new Error('repository migration inventory is malformed')
  }
  return { filenames, versions }
}

async function readPgTapDirectory(directoryPath, suites) {
  const issues = []
  const evidence = new Map()
  let entries
  try {
    const metadata = await fs.lstat(directoryPath)
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error('not a regular directory')
    }
    entries = await fs.readdir(directoryPath, { withFileTypes: true })
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
    const category = code === 'ENOENT' ? diagnostic.evidenceFileMissing : diagnostic.evidenceFileInvalid
    issues.push(`${category}: pgTAP evidence directory is missing, unreadable, or invalid`)
    for (const suite of suites) {
      evidence.set(suite.id, { value: undefined, issues: [`${diagnostic.evidenceFileMissing}: pgTAP ${suite.id}: evidence is missing or unreadable`] })
    }
    return { issues, evidence }
  }

  const expectedNames = new Set(suites.map((suite) => `${suite.id}.tap`))
  const logicalNames = new Set()
  for (const entry of entries) {
    const logicalName = entry.name.toLowerCase()
    if (logicalNames.has(logicalName)) issues.push(`${diagnostic.evidenceFileInvalid}: duplicate logical pgTAP evidence ${logicalName}`)
    logicalNames.add(logicalName)
    if (!/^[a-z0-9][a-z0-9_-]*\.tap$/.test(entry.name)) {
      issues.push(`${diagnostic.evidenceFileInvalid}: unsafe pgTAP evidence filename ${entry.name}`)
    }
    if (!expectedNames.has(entry.name)) issues.push(`${diagnostic.evidenceFileInvalid}: unexpected pgTAP evidence file ${entry.name}`)
  }

  const entriesByName = new Map(entries.map((entry) => [entry.name, entry]))
  for (const suite of suites) {
    const filename = `${suite.id}.tap`
    const entry = entriesByName.get(filename)
    if (!entry) {
      const missing = `${diagnostic.evidenceFileMissing}: pgTAP ${suite.id}: configured evidence file is missing`
      issues.push(missing)
      evidence.set(suite.id, { value: undefined, issues: [missing] })
      continue
    }
    if (!entry.isFile()) issues.push(`${diagnostic.evidenceFileInvalid}: pgTAP ${suite.id}: expected path is not a regular file`)
    evidence.set(suite.id, await readEvidence(path.join(directoryPath, filename), `pgTAP ${suite.id}`))
  }
  return { issues, evidence }
}

export async function checkDatabaseRuntimeEvidence(options) {
  const root = path.resolve(options.root ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'))
  const checks = []
  const migrationRead = await readEvidence(options.migrationJson, 'migration state')
  const generatedRead = await readEvidence(options.generatedTypes, 'generated types')
  const trackedRead = await readEvidence(options.trackedTypes, 'tracked types')

  let manifest = options.manifest
  const manifestIssues = []
  if (!manifest) {
    try {
      manifest = await readJson(root, manifestRelativePath)
    } catch {
      manifestIssues.push(`${diagnostic.manifestEvidenceInvalid}: baseline manifest is missing, unreadable, or malformed`)
    }
  }
  if (manifest) manifestIssues.push(...validateDatabaseRuntimeEvidenceManifest(manifest))

  let expectedMigrations = []
  let expectedMigrationFiles = []
  const inventoryIssues = []
  if (!Array.isArray(manifest?.migrations) || manifest.migrations.length === 0) {
    inventoryIssues.push(`${diagnostic.migrationEvidenceInvalid}: migration state: manifest migration inventory is unavailable or malformed`)
  } else {
    expectedMigrations = manifest.migrations.map((migration) => migration?.version)
    expectedMigrationFiles = manifest.migrations.map((migration) => migration?.filename)
    if (expectedMigrations.some((version) => typeof version !== 'string' || !/^\d{14}$/.test(version)) || !orderedUnique(expectedMigrations)) {
      inventoryIssues.push(`${diagnostic.migrationEvidenceInvalid}: migration state: manifest migration versions are unavailable or malformed`)
    }
    if (expectedMigrationFiles.some((filename, index) => filename !== `${expectedMigrations[index]}_${filename?.slice(15)}`)) {
      inventoryIssues.push(`${diagnostic.migrationEvidenceInvalid}: migration state: manifest migration filename/version mismatch`)
    }
  }
  if (inventoryIssues.length === 0) {
    try {
      const repositoryInventory = await repositoryMigrationInventory(root)
      if (!same(repositoryInventory.filenames, expectedMigrationFiles) || !same(repositoryInventory.versions, expectedMigrations)) {
        inventoryIssues.push(`${diagnostic.migrationPendingOrDivergent}: migration state: repository migration inventory does not exactly match the manifest`)
      }
    } catch {
      inventoryIssues.push(`${diagnostic.migrationEvidenceInvalid}: migration state: repository migration inventory is unavailable or malformed`)
    }
  }

  const migrationIssues = [...migrationRead.issues, ...inventoryIssues]
  const generatedIssues = [...generatedRead.issues, ...trackedRead.issues]
  const boundaryIssues = []
  const suites = manifestIssues.length === 0 ? manifest.databaseRuntimeEvidence.pgTapSuites : []
  const requiredRpcContracts = manifestIssues.length === 0 ? manifest.databaseRuntimeEvidence.requiredRpcContracts : []
  const pgTapDirectory = await readPgTapDirectory(options.pgTapDir, suites)

  if (migrationRead.value) {
    const source = decodeUtf8(migrationRead.value, 'migration state', migrationIssues)
    if (source !== undefined) {
      migrationIssues.push(...validateMigrationEvidence(source, expectedMigrations))
      boundaryIssues.push(...unsafeEvidenceMarkerIssues('migration state', source))
    }
  }
  const pgTapChecks = []
  for (const suite of suites) {
    const read = pgTapDirectory.evidence.get(suite.id) ?? { value: undefined, issues: [`${diagnostic.evidenceFileMissing}: pgTAP ${suite.id}: evidence is missing`] }
    const suiteIssues = [...read.issues]
    if (read.value) {
      const source = decodeUtf8(read.value, `pgTAP ${suite.id}`, suiteIssues)
      if (source !== undefined) {
        suiteIssues.push(...validatePgTapEvidence(source, suite.expectedAssertions))
        boundaryIssues.push(...unsafeEvidenceMarkerIssues(`pgTAP ${suite.id}`, source))
      }
    }
    pgTapChecks.push(evidenceResult(`pgTAP ${suite.id} ${suite.expectedAssertions}/${suite.expectedAssertions}`, suiteIssues))
  }
  if (generatedRead.value && trackedRead.value && manifestIssues.length === 0) {
    generatedIssues.push(...validateGeneratedTypes(generatedRead.value, trackedRead.value, requiredRpcContracts))
  }
  if (generatedRead.value) {
    const generatedSource = decodeUtf8(generatedRead.value, 'generated types', generatedIssues)
    if (generatedSource !== undefined) boundaryIssues.push(...unsafeEvidenceMarkerIssues('generated types', generatedSource))
  }
  if (trackedRead.value) {
    const trackedSource = decodeUtf8(trackedRead.value, 'tracked types', generatedIssues)
    if (trackedSource !== undefined) boundaryIssues.push(...unsafeEvidenceMarkerIssues('tracked types', trackedSource))
  }

  checks.push(evidenceResult('database runtime evidence manifest', manifestIssues))
  checks.push(evidenceResult('migration state', migrationIssues))
  checks.push(evidenceResult('pgTAP evidence file set', pgTapDirectory.issues))
  checks.push(...pgTapChecks)
  checks.push(evidenceResult('generated type freshness and RPC contract', generatedIssues))
  checks.push(evidenceResult('local-only security boundary', boundaryIssues))

  return {
    pass: checks.every((check) => check.pass),
    checks,
    operations: Object.freeze({
      lifecycleCommands: 0,
      databaseCommands: 0,
      networkRequests: 0,
      repositoryWrites: 0,
      retries: 0,
      resultMasking: 0,
    }),
  }
}

export function formatDatabaseRuntimeEvidenceReport(report) {
  const lines = [`Supabase database runtime evidence: ${report.pass ? 'PASS' : 'FAIL'}`]
  for (const check of report.checks) {
    lines.push(`- ${check.name}: ${check.pass ? 'PASS' : 'FAIL'}`)
    for (const issue of check.issues) lines.push(`  - ${issue}`)
  }
  lines.push(`- lifecycle commands: ${report.operations.lifecycleCommands}`)
  lines.push(`- database commands: ${report.operations.databaseCommands}`)
  lines.push(`- network requests: ${report.operations.networkRequests}`)
  lines.push(`- repository writes: ${report.operations.repositoryWrites}`)
  lines.push(`- retries: ${report.operations.retries}`)
  lines.push(`- result masking: ${report.operations.resultMasking}`)
  return lines.join('\n')
}

export function parseDatabaseEvidenceArguments(args) {
  if (args.length === 0 || (args.length === 2 && args[0] === '--fixture')) return undefined
  const values = new Map()
  for (let index = 0; index < args.length;) {
    const flag = args[index]
    if (!databaseEvidenceFlagSet.has(flag)) throw new Error(diagnostic.argumentUnknown)
    if (values.has(flag)) throw new Error(diagnostic.argumentDuplicate)
    const value = args[index + 1]
    if (value === undefined || value === '' || value.startsWith('-')) {
      throw new Error(diagnostic.argumentValueMissing)
    }
    values.set(flag, value)
    index += 2
  }
  const missing = databaseEvidenceFlags.filter((flag) => !values.has(flag))
  if (missing.length > 0) throw new Error(diagnostic.argumentRequiredMissing)
  return {
    migrationJson: values.get('--migration-json'),
    pgTapDir: values.get('--pgtap-dir'),
    generatedTypes: values.get('--generated-types'),
    trackedTypes: values.get('--tracked-types'),
  }
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
  try {
    const args = process.argv.slice(2)
    const databaseEvidenceOptions = parseDatabaseEvidenceArguments(args)
    if (databaseEvidenceOptions) {
      const report = await checkDatabaseRuntimeEvidence(databaseEvidenceOptions)
      process.stdout.write(`${formatDatabaseRuntimeEvidenceReport(report)}\n`)
      if (!report.pass) process.exitCode = 1
    } else {
      const report = await checkSupabaseFreshBaseline({ fixture: parseFixtureArgument(args) })
      process.stdout.write(`${formatSupabaseFreshBaselineReport(report)}\n`)
      if (!report.pass) process.exitCode = 1
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown checker error'
    process.stderr.write(`Supabase database runtime evidence: FAIL\n- input: ${message}\n`)
    process.exitCode = 1
  }
}
