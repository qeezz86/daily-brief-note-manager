import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const orderedCheckNames = [
  'migrations',
  'functions',
  'JWT policy',
  'server-only credentials',
  'draft-only write',
  'forbidden writes',
  'migration contract',
  'runbook',
  'package commands',
  'secret scan',
]

const excludedDirectories = new Set([
  '.git', 'node_modules', 'dist', 'coverage', 'playwright-report', 'test-results', 'artifacts',
])

const textExtensions = new Set([
  '.cjs', '.css', '.env', '.example', '.html', '.js', '.json', '.jsx', '.md', '.mjs', '.sql', '.toml', '.ts', '.tsx', '.txt', '.yaml', '.yml',
])

const allowedWordPressPaths = new Set([
  'wp-json/',
  'wp-json/wp/v2/users/me',
  'wp-json/wp/v2/types',
  'wp-json/wp/v2/statuses',
  'wp-json/wp/v2/categories',
  'wp-json/wp/v2/tags',
  'wp-json/wp/v2/posts',
  'wp-json/wp/v2/${taxonomy}',
])

function normalize(relativePath) {
  return relativePath.split(path.sep).join('/')
}

async function exists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function read(root, relativePath) {
  return fs.readFile(path.join(root, relativePath), 'utf8')
}

async function walk(root, current = root) {
  const output = []
  for (const entry of await fs.readdir(current, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue
    const absolute = path.join(current, entry.name)
    if (entry.isDirectory()) output.push(...await walk(root, absolute))
    else if (entry.isFile()) output.push(normalize(path.relative(root, absolute)))
  }
  return output.sort()
}

function result(name, issues) {
  return { name, pass: issues.length === 0, issues: [...issues].sort() }
}

function functionSectionIsJwtVerified(configToml, functionName) {
  const escaped = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const section = new RegExp(`\\[functions\\.${escaped}\\]([\\s\\S]*?)(?=\\n\\[|$)`).exec(configToml)?.[1] ?? ''
  return /^\s*verify_jwt\s*=\s*true\s*$/m.test(section)
}

function findWordPressPaths(source) {
  const paths = []
  const pattern = /["'`](\/?wp-json(?:\/[A-Za-z0-9_${}-]+)*\/?)\??/g
  for (const match of source.matchAll(pattern)) paths.push(match[1].replace(/^\//, ''))
  return paths
}

function secretLikeIssue(relativePath, source) {
  const issues = []
  if (/\bsb_(?:secret|service_role)_[A-Za-z0-9_-]{12,}\b/.test(source)) issues.push(`${relativePath}: Supabase elevated key pattern`)
  if (/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{16,}\b/.test(source)) issues.push(`${relativePath}: JWT-like value`)

  const appPassword = /WORDPRESS_APPLICATION_PASSWORD\s*[=:]\s*["']?([A-Za-z0-9 ]{20,32})/g
  for (const match of source.matchAll(appPassword)) {
    const value = match[1].replace(/\s+/g, '')
    if (/^[A-Za-z0-9]{24}$/.test(value)) {
      issues.push(`${relativePath}: WordPress Application Password-like value`)
      break
    }
  }
  return issues
}

export async function checkWordPressProductionReadiness(options = {}) {
  const root = path.resolve(options.root ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'))
  const checklistPath = 'config/wordpress-production-readiness.json'
  const checklist = JSON.parse(await read(root, checklistPath))
  const checks = []

  const migrationIssues = []
  for (const name of checklist.requiredMigrations) {
    if (!await exists(path.join(root, 'supabase/migrations', name))) migrationIssues.push(`missing supabase/migrations/${name}`)
  }
  const orderedMigrations = [...checklist.requiredMigrations].sort()
  if (JSON.stringify(orderedMigrations) !== JSON.stringify(checklist.requiredMigrations)) migrationIssues.push('required migrations are not ordered')
  checks.push(result('migrations', migrationIssues))

  const functionIssues = []
  for (const name of checklist.requiredFunctions) {
    if (!await exists(path.join(root, 'supabase/functions', name, 'index.ts'))) functionIssues.push(`missing supabase/functions/${name}/index.ts`)
  }
  checks.push(result('functions', functionIssues))

  const configToml = await read(root, 'supabase/config.toml')
  const jwtIssues = []
  for (const name of checklist.requiredFunctions) {
    if (!functionSectionIsJwtVerified(configToml, name)) jwtIssues.push(`${name}: verify_jwt must be explicitly true`)
  }
  if (/verify_jwt\s*=\s*false/.test(configToml)) jwtIssues.push('supabase/config.toml contains verify_jwt=false')
  const packageJsonText = await read(root, 'package.json')
  const scriptFiles = (await walk(root)).filter((file) => file.startsWith('scripts/') && !file.endsWith('.test.mjs') && file !== 'scripts/check-wordpress-production-readiness.mjs')
  for (const file of ['package.json', ...scriptFiles]) {
    const source = file === 'package.json' ? packageJsonText : await read(root, file)
    if (source.includes('--no-verify-jwt')) jwtIssues.push(`${file}: --no-verify-jwt is forbidden`)
  }
  checks.push(result('JWT policy', jwtIssues))

  const allFiles = await walk(root)
  const frontendFiles = allFiles.filter((file) => file.startsWith('src/') || file === '.env.example' || file === 'package.json' || file.startsWith('.github/'))
  const credentialIssues = []
  for (const file of frontendFiles) {
    const source = await read(root, file)
    if (/VITE_WORDPRESS(?:_APPLICATION)?_(?:PASSWORD|USERNAME|SITE_URL)|VITE_WORDPRESS_APPLICATION_PASSWORD/.test(source)) credentialIssues.push(`${file}: VITE WordPress credential variable`)
    if (/VITE_(?:SUPABASE_)?(?:SERVICE_ROLE|SECRET)_KEY/.test(source)) credentialIssues.push(`${file}: VITE elevated Supabase key variable`)
  }
  for (const file of allFiles.filter((name) => /^\.env\.production(?:\.|$)/.test(path.basename(name)))) {
    if (/^\s*WORDPRESS_LOCAL_MODE\s*=\s*(?:true|1|yes)\s*$/im.test(await read(root, file))) credentialIssues.push(`${file}: WORDPRESS_LOCAL_MODE enabled for production`)
  }
  checks.push(result('server-only credentials', credentialIssues))

  const functionSources = allFiles.filter((file) => file.startsWith('supabase/functions/wordpress-') && file.endsWith('.ts') && !file.endsWith('.test.ts'))
  const draftIssues = []
  const forbiddenWriteIssues = []
  for (const file of functionSources) {
    const source = await read(root, file)
    for (const endpoint of findWordPressPaths(source)) {
      if (!allowedWordPressPaths.has(endpoint)) draftIssues.push(`${file}: arbitrary WordPress endpoint ${endpoint}`)
    }
    if (/method\s*:\s*["'](?:PUT|PATCH|DELETE)["']/.test(source)) forbiddenWriteIssues.push(`${file}: forbidden WordPress write method`)
    if (/status\s*:\s*["']publish["']/.test(source)) forbiddenWriteIssues.push(`${file}: publish status literal`)
    if (/wp-json\/wp\/v2\/(?:media|categories|tags)["'`]/.test(source) && /method\s*:\s*["']POST["']/.test(source)) forbiddenWriteIssues.push(`${file}: media or taxonomy write`)
  }
  const draftClient = await read(root, 'supabase/functions/wordpress-draft-create/wordpressDraftClient.ts')
  if (!/new URL\(["']wp-json\/wp\/v2\/posts["']/.test(draftClient)) draftIssues.push('draft client fixed posts endpoint missing')
  if (!/method\s*:\s*["']POST["']/.test(draftClient)) draftIssues.push('draft client POST missing')
  if (!/status\s*:\s*["']draft["']/.test(draftClient)) draftIssues.push('draft status literal missing')
  if ((draftClient.match(/method\s*:\s*["']POST["']/g) ?? []).length !== 1) draftIssues.push('draft client must contain exactly one POST implementation')
  checks.push(result('draft-only write', draftIssues))
  checks.push(result('forbidden writes', forbiddenWriteIssues))

  const migrationContractIssues = []
  const migrationSources = await Promise.all(checklist.requiredMigrations.map(async (name) => {
    const relativePath = `supabase/migrations/${name}`
    return await exists(path.join(root, relativePath)) ? read(root, relativePath) : ''
  }))
  const [mappingSql, attemptSql, hardeningSql] = migrationSources
  const requiredSql = [
    [mappingSql, 'create table public.wordpress_taxonomy_mappings', 'taxonomy mapping table'],
    [mappingSql, 'enable row level security', 'taxonomy mapping RLS'],
    [attemptSql, 'create table public.wordpress_publication_attempts', 'publication attempt table'],
    [attemptSql, "where status in ('executing', 'succeeded', 'uncertain')", 'same-content partial unique guard'],
    [attemptSql, 'enable row level security', 'publication attempt RLS'],
    [hardeningSql, 'transition_wordpress_publication_attempt_service', 'service transition RPC'],
    [hardeningSql, 'security definer', 'SECURITY DEFINER'],
    [hardeningSql, "set search_path = ''", 'fixed search_path'],
    [hardeningSql, "auth.role()) <> 'service_role'", 'service-role assertion'],
    [hardeningSql, 'to service_role', 'service-role grant'],
  ]
  for (const [source, needle, label] of requiredSql) if (!source.toLowerCase().includes(needle.toLowerCase())) migrationContractIssues.push(`missing ${label}`)
  const migrationText = `${mappingSql}\n${attemptSql}\n${hardeningSql}`
  if (/\b(?:drop\s+table|truncate\s+table|delete\s+from)\b/i.test(migrationText)) migrationContractIssues.push('destructive data operation found')
  if (/update\s+public\.(?:posts|wordpress_taxonomy_mappings)\b/i.test(migrationText)) migrationContractIssues.push('historical content or mapping rewrite found')
  if (/password|authorization|credential/i.test(attemptSql.replace(/contains no article body or credential/gi, ''))) migrationContractIssues.push('credential-like publication attempt column or logic found')
  checks.push(result('migration contract', migrationContractIssues))

  const requiredDocs = ['README.md', 'docs/WORDPRESS_INTEGRATION.md', 'docs/WORDPRESS_DRAFT_CREATION.md', 'docs/WORDPRESS_PRODUCTION_DEPLOYMENT_RUNBOOK.md']
  checks.push(result('runbook', requiredDocs.filter((file) => !allFiles.includes(file)).map((file) => `missing ${file}`)))

  const packageJson = JSON.parse(packageJsonText)
  const requiredCommands = ['check:wordpress-production-readiness', 'smoke:wordpress-runtime', 'smoke:wordpress-preview', 'smoke:wordpress-draft']
  checks.push(result('package commands', requiredCommands.filter((name) => typeof packageJson.scripts?.[name] !== 'string').map((name) => `missing npm script ${name}`)))

  const secretIssues = []
  for (const file of allFiles) {
    const extension = path.extname(file)
    if (!textExtensions.has(extension) && path.basename(file) !== '.env.example') continue
    if (/\.env(?:\..+)?\.local$/.test(file) || /(^|\/)\.env$/.test(file)) continue
    secretIssues.push(...secretLikeIssue(file, await read(root, file)))
  }
  if (await exists(path.join(root, 'dist'))) {
    for (const file of await walk(path.join(root, 'dist'))) {
      const source = await fs.readFile(path.join(root, 'dist', file), 'utf8').catch(() => '')
      secretIssues.push(...secretLikeIssue(`dist/${file}`, source))
    }
  }
  checks.push(result('secret scan', secretIssues))

  checks.sort((left, right) => orderedCheckNames.indexOf(left.name) - orderedCheckNames.indexOf(right.name))
  return { pass: checks.every((check) => check.pass), checks }
}

export function formatReadinessReport(report) {
  const lines = [`WordPress production readiness: ${report.pass ? 'PASS' : 'FAIL'}`]
  for (const check of report.checks) {
    lines.push(`- ${check.name}: ${check.pass ? (check.name === 'forbidden writes' ? 'NONE' : 'PASS') : 'FAIL'}`)
    for (const issue of check.issues) lines.push(`  - ${issue}`)
  }
  return lines.join('\n')
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const report = await checkWordPressProductionReadiness()
  process.stdout.write(`${formatReadinessReport(report)}\n`)
  if (!report.pass) process.exitCode = 1
}
