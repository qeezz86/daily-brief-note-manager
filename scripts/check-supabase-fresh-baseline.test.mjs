import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

import {
  checkDatabaseRuntimeEvidence,
  formatDatabaseRuntimeEvidenceReport,
  parseDatabaseEvidenceArguments,
} from './check-supabase-fresh-baseline.mjs'

const runningUnderVitest = process.env.VITEST === 'true' || process.env.VITEST_WORKER_ID !== undefined
const nodeRequire = createRequire(import.meta.url)
const registerTest = runningUnderVitest
  ? (await import('vitest')).test
  : nodeRequire('node:test').test

const expectedMigrations = ['20260710080000', '20260801120000']
const expectedMigration = '20260801120000'
const validMigrationRows = [
  { local: '20260710080000', remote: '20260710080000', time: '2026-07-10 08:00:00' },
  { local: '20260801120000', remote: '20260801120000', time: '2026-08-01 12:00:00' },
]
const validTypes = [
  'export type Json = string | number | boolean | null',
  'export type Database = {',
  '  public: {',
  '    Functions: {',
  '      save_chatgpt_paste_post: { Args: { p_item: Json }; Returns: Json }',
  '    }',
  '  }',
  '}',
  '',
].join('\n')
const validCliArguments = [
  '--migration-json', 'migrations.json',
  '--pgtap', 'pgtap.tap',
  '--generated-types', 'generated.types.ts',
  '--tracked-types', 'tracked.types.ts',
  '--expected-migration', expectedMigration,
]

function tapEvidence(count = 40) {
  return [
    'TAP version 13',
    '1..40',
    ...Array.from({ length: count }, (_, index) => `ok ${index + 1} - contract ${index + 1}`),
    '',
  ].join('\n')
}

function issueText(report) {
  return report.checks.flatMap((check) => check.issues).join('\n')
}

async function withEvidence(overrides, callback) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dbn-runtime-evidence-'))
  const values = {
    migrationJson: JSON.stringify(validMigrationRows),
    pgTap: tapEvidence(),
    generatedTypes: validTypes,
    trackedTypes: validTypes,
    ...overrides,
  }
  const paths = {
    migrationJson: path.join(root, 'migrations.json'),
    pgTap: path.join(root, 'pgtap.tap'),
    generatedTypes: path.join(root, 'generated.types.ts'),
    trackedTypes: path.join(root, 'tracked.types.ts'),
  }
  try {
    for (const [name, filePath] of Object.entries(paths)) {
      if (values[name] !== undefined) await fs.writeFile(filePath, values[name])
    }
    const options = { ...paths, expectedMigrations, expectedMigration }
    await callback(options, paths)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}

registerTest('1 complete valid evidence passes', async () => {
  await withEvidence({}, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, true, formatDatabaseRuntimeEvidenceReport(report))
  })
})

registerTest('2 expected migration identity present passes', async () => {
  await withEvidence({}, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.doesNotMatch(issueText(report), /expected migration .* missing/)
  })
})

registerTest('3 expected migration identity missing fails', async () => {
  await withEvidence({ migrationJson: JSON.stringify(validMigrationRows.slice(0, 1)) }, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, false)
    assert.match(issueText(report), /expected migration 20260801120000 is missing/)
  })
})

registerTest('4 unexpected pending migration fails', async () => {
  const rows = structuredClone(validMigrationRows)
  rows[1].remote = null
  await withEvidence({ migrationJson: JSON.stringify(rows) }, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, false)
    assert.match(issueText(report), /unexpected pending migration/)
  })
})

registerTest('5 divergent or mismatched migration fails', async () => {
  const rows = structuredClone(validMigrationRows)
  rows[1].remote = '20260801120001'
  await withEvidence({ migrationJson: JSON.stringify(rows) }, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, false)
    assert.match(issueText(report), /divergent migration identity/)
  })
})

registerTest('6 malformed migration JSON fails', async () => {
  await withEvidence({ migrationJson: '{"local":' }, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, false)
    assert.match(issueText(report), /malformed JSON/)
  })
})

registerTest('7 empty migration evidence fails', async () => {
  await withEvidence({ migrationJson: '' }, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, false)
    assert.match(issueText(report), /migration state: evidence is empty/)
  })
})

registerTest('8 pgTAP exact 40 of 40 passes', async () => {
  await withEvidence({}, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    const check = report.checks.find((entry) => entry.name === 'pgTAP 40/40')
    assert.equal(check?.pass, true)
  })
})

registerTest('9 pgTAP 39 of 40 fails', async () => {
  await withEvidence({ pgTap: tapEvidence(39) }, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, false)
    assert.match(issueText(report), /PGTAP_ASSERTION_INVALID: expected 40 assertions, found 39/)
  })
})

registerTest('10 failed TAP assertion fails', async () => {
  await withEvidence({ pgTap: tapEvidence().replace('ok 9 -', 'not ok 9 -') }, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, false)
    assert.match(issueText(report), /1 failed assertion/)
  })
})

registerTest('11 skipped TAP assertion fails', async () => {
  await withEvidence({ pgTap: tapEvidence().replace('ok 10 - contract 10', 'ok 10 - contract 10 # SKIP blocked') }, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, false)
    assert.match(issueText(report), /1 skipped assertion/)
  })
})

registerTest('12 todo TAP assertion fails', async () => {
  await withEvidence({ pgTap: tapEvidence().replace('ok 11 - contract 11', 'ok 11 - contract 11 # TODO later') }, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, false)
    assert.match(issueText(report), /1 todo assertion/)
  })
})

registerTest('13 malformed TAP fails', async () => {
  await withEvidence({ pgTap: tapEvidence().replace('ok 1 - contract 1', 'ok banana') }, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, false)
    assert.match(issueText(report), /malformed assertion line/)
  })
})

registerTest('14 empty TAP fails', async () => {
  await withEvidence({ pgTap: '' }, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, false)
    assert.match(issueText(report), /pgTAP: evidence is empty/)
  })
})

registerTest('15 generated types exact normalized match passes', async () => {
  await withEvidence({ generatedTypes: validTypes.replace(/\n/g, '\r\n') }, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, true, formatDatabaseRuntimeEvidenceReport(report))
  })
})

registerTest('16 generated types semantic or byte mismatch fails', async () => {
  await withEvidence({ generatedTypes: validTypes.replace('p_item: Json', 'p_item: string') }, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, false)
    assert.match(issueText(report), /normalized raw bytes differ/)
  })
})

registerTest('17 unrelated generated delta fails', async () => {
  await withEvidence({ generatedTypes: validTypes.replace('export type Database', 'export type Unrelated\nexport type Database') }, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, false)
    assert.match(issueText(report), /normalized raw bytes differ/)
  })
})

registerTest('18 generated output missing or empty fails', async () => {
  await withEvidence({ generatedTypes: undefined }, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, false)
    assert.match(issueText(report), /generated types: evidence is missing or unreadable/)
  })
  await withEvidence({ generatedTypes: '' }, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, false)
    assert.match(issueText(report), /generated types: evidence is empty/)
  })
})

registerTest('19 exact RPC Args or Returns mismatch fails', async () => {
  await withEvidence({ generatedTypes: validTypes.replace('p_item: Json', 'p_other: Json'), trackedTypes: validTypes.replace('p_item: Json', 'p_other: Json') }, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, false)
    assert.match(issueText(report), /must have exact Args/)
  })
  await withEvidence({ generatedTypes: validTypes.replace('Returns: Json', 'Returns: string'), trackedTypes: validTypes.replace('Returns: Json', 'Returns: string') }, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, false)
    assert.match(issueText(report), /must have exact Args/)
  })
})

registerTest('20 failed-command evidence or result-masking marker fails', async () => {
  const failed = structuredClone(validMigrationRows)
  failed[0].commandSucceeded = false
  await withEvidence({ migrationJson: JSON.stringify(failed) }, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, false)
    assert.match(issueText(report), /RESULT_MASKING_MARKER_DETECTED/)
  })
  const masked = structuredClone(validMigrationRows)
  masked[0].masked = true
  await withEvidence({ migrationJson: JSON.stringify(masked) }, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, false)
    assert.match(issueText(report), /RESULT_MASKING_MARKER_DETECTED/)
  })
})

registerTest('21 remote or linked-project marker fails', async () => {
  const linked = structuredClone(validMigrationRows)
  linked[0].linked = true
  await withEvidence({ migrationJson: JSON.stringify(linked) }, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, false)
    assert.match(issueText(report), /REMOTE_OR_LINKED_MARKER_DETECTED/)
  })
  const remote = structuredClone(validMigrationRows)
  remote[0].databaseTarget = 'postgresql://remote.example.test/postgres'
  await withEvidence({ migrationJson: JSON.stringify(remote) }, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, false)
    assert.match(issueText(report), /REMOTE_OR_LINKED_MARKER_DETECTED/)
  })
})

registerTest('22 production-credential marker fails', async () => {
  const rows = structuredClone(validMigrationRows)
  rows[0].credential = 'SUPABASE_ACCESS_TOKEN'
  await withEvidence({ migrationJson: JSON.stringify(rows) }, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, false)
    assert.match(issueText(report), /PRODUCTION_CREDENTIAL_MARKER_DETECTED/)
  })
})

registerTest('23 diagnostics are deterministic with no repository write or retry path', async () => {
  await withEvidence({}, async (options, paths) => {
    const before = await Promise.all(Object.values(paths).map((filePath) => fs.readFile(filePath)))
    const first = await checkDatabaseRuntimeEvidence(options)
    const second = await checkDatabaseRuntimeEvidence(options)
    const after = await Promise.all(Object.values(paths).map((filePath) => fs.readFile(filePath)))
    assert.equal(formatDatabaseRuntimeEvidenceReport(first), formatDatabaseRuntimeEvidenceReport(second))
    assert.deepEqual(after, before)
    assert.deepEqual(first.operations, {
      lifecycleCommands: 0,
      databaseCommands: 0,
      networkRequests: 0,
      repositoryWrites: 0,
      retries: 0,
      resultMasking: 0,
    })
  })
})

registerTest('24 standalone unknown option fails with a sanitized diagnostic', () => {
  assert.deepEqual(parseDatabaseEvidenceArguments(validCliArguments), {
    migrationJson: 'migrations.json',
    pgTap: 'pgtap.tap',
    generatedTypes: 'generated.types.ts',
    trackedTypes: 'tracked.types.ts',
    expectedMigration,
  })
  for (const args of [
    [...validCliArguments, '--unknown', 'value'],
    ['--'],
    ['-p', 'value'],
    ['--pgtap-extra', 'value'],
    ['--PGTAP', 'value'],
  ]) {
    assert.throws(() => parseDatabaseEvidenceArguments(args), { message: 'ARGUMENT_UNKNOWN' })
  }
})

registerTest('25 unknown positional token fails', () => {
  assert.throws(() => parseDatabaseEvidenceArguments(['unexpected']), { message: 'ARGUMENT_UNKNOWN' })
})

registerTest('26 duplicate required option fails', () => {
  assert.throws(
    () => parseDatabaseEvidenceArguments([...validCliArguments, '--pgtap', 'second.tap']),
    { message: 'ARGUMENT_DUPLICATE' },
  )
})

registerTest('27 value-less and empty option values fail', () => {
  assert.throws(
    () => parseDatabaseEvidenceArguments(validCliArguments.slice(0, -1)),
    { message: 'ARGUMENT_VALUE_MISSING' },
  )
  assert.throws(
    () => parseDatabaseEvidenceArguments([...validCliArguments.slice(0, -1), '']),
    { message: 'ARGUMENT_VALUE_MISSING' },
  )
})

registerTest('28 option followed by another option and missing required options fail', () => {
  assert.throws(
    () => parseDatabaseEvidenceArguments(['--migration-json', '--pgtap', 'pgtap.tap']),
    { message: 'ARGUMENT_VALUE_MISSING' },
  )
  assert.throws(
    () => parseDatabaseEvidenceArguments(['--migration-json', 'migrations.json']),
    { message: 'ARGUMENT_REQUIRED_MISSING' },
  )
})

registerTest('29 benign marker lookalikes pass', async () => {
  const rows = structuredClone(validMigrationRows)
  rows[0].note = 'remote work is an ordinary descriptive phrase'
  const benignTypes = validTypes.replace(
    'export type Database = {',
    'export type Note = "ordinary documentation-like string"\nexport type RemoteRecord = { remote_status: string }\nexport type Database = {',
  )
  await withEvidence({
    migrationJson: JSON.stringify(rows),
    generatedTypes: benignTypes,
    trackedTypes: benignTypes,
  }, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, true, formatDatabaseRuntimeEvidenceReport(report))
  })
})

registerTest('30 migration repair and history rewrite markers fail', async () => {
  for (const marker of ['migration repair', 'supabase migration repair', 'migration history rewrite', 'migration squash']) {
    const rows = structuredClone(validMigrationRows)
    rows[0].note = marker
    await withEvidence({ migrationJson: JSON.stringify(rows) }, async (options) => {
      const report = await checkDatabaseRuntimeEvidence(options)
      assert.equal(report.pass, false)
      assert.match(issueText(report), /FORBIDDEN_REPAIR_OR_RESET_MARKER/)
    })
  }
})

registerTest('31 DB reset and persistent remote apply markers fail', async () => {
  for (const marker of ['db reset', 'supabase db reset', 'persistent remote apply']) {
    await withEvidence({ pgTap: `${tapEvidence()}# ${marker}\n` }, async (options) => {
      const report = await checkDatabaseRuntimeEvidence(options)
      assert.equal(report.pass, false)
      assert.match(issueText(report), /FORBIDDEN_REPAIR_OR_RESET_MARKER/)
    })
  }
})

registerTest('32 continue-on-error and related failure masking markers fail', async () => {
  for (const marker of ['continue-on-error', 'ignored failure', 'masked exit status', 'allowed failure']) {
    const rows = structuredClone(validMigrationRows)
    rows[0].note = marker
    await withEvidence({ migrationJson: JSON.stringify(rows) }, async (options) => {
      const report = await checkDatabaseRuntimeEvidence(options)
      assert.equal(report.pass, false)
      assert.match(issueText(report), /RESULT_MASKING_MARKER_DETECTED/)
    })
  }
})

registerTest('33 shell masking and validation retry markers fail', async () => {
  for (const marker of ['|| true', 'validation retry', 'retry checker validation']) {
    await withEvidence({ pgTap: `${tapEvidence()}# ${marker}\n` }, async (options) => {
      const report = await checkDatabaseRuntimeEvidence(options)
      assert.equal(report.pass, false)
      assert.match(issueText(report), /RESULT_MASKING_MARKER_DETECTED/)
    })
  }
})

registerTest('34 hosted, linked, project-ref, and remote type markers fail', async () => {
  for (const marker of [
    '--linked',
    '--project-ref abcdefghijklmnop',
    'project_ref=abcdefghijklmnop',
    'supabase link',
    'linked project',
    'remote database',
    'remote migration',
    'remote type generation',
    'postgresql://db.abcdefghijklmnop.supabase.co/postgres',
  ]) {
    const rows = structuredClone(validMigrationRows)
    rows[0].note = marker
    await withEvidence({ migrationJson: JSON.stringify(rows) }, async (options) => {
      const report = await checkDatabaseRuntimeEvidence(options)
      assert.equal(report.pass, false)
      assert.match(issueText(report), /REMOTE_OR_LINKED_MARKER_DETECTED/)
    })
  }
})

registerTest('35 privileged credential markers fail without echoing secret values', async () => {
  const secret = 'do-not-echo-this-secret-value'
  for (const marker of [
    `service_role=${secret}`,
    `service-role=${secret}`,
    `SUPABASE_ACCESS_TOKEN=${secret}`,
    `DATABASE_URL=${secret}`,
    `POSTGRES_URL=${secret}`,
    `hosted DB password=${secret}`,
    `production project ref=${secret}`,
  ]) {
    const types = `${validTypes}// ${marker}\n`
    await withEvidence({ generatedTypes: types, trackedTypes: types }, async (options) => {
      const report = await checkDatabaseRuntimeEvidence(options)
      const formatted = formatDatabaseRuntimeEvidenceReport(report)
      assert.equal(report.pass, false)
      assert.match(formatted, /PRODUCTION_CREDENTIAL_MARKER_DETECTED/)
      assert.doesNotMatch(formatted, new RegExp(secret))
    })
  }
  await withEvidence({ trackedTypes: `${validTypes}// service_role=${secret}\n` }, async (options) => {
    const formatted = formatDatabaseRuntimeEvidenceReport(await checkDatabaseRuntimeEvidence(options))
    assert.match(formatted, /PRODUCTION_CREDENTIAL_MARKER_DETECTED/)
    assert.doesNotMatch(formatted, new RegExp(secret))
  })
})

registerTest('36 truncated final TAP assertion fails', async () => {
  for (const truncated of [
    tapEvidence().replace('ok 40 - contract 40\n', 'ok 4\n'),
    tapEvidence().replace('ok 40 - contract 40\n', 'ok 40 -\n'),
    tapEvidence().slice(0, -1),
  ]) {
    await withEvidence({ pgTap: truncated }, async (options) => {
      const report = await checkDatabaseRuntimeEvidence(options)
      assert.equal(report.pass, false)
      assert.match(issueText(report), /PGTAP_TRUNCATED_OR_MALFORMED/)
    })
  }
})

registerTest('37 TAP plan with only 39 results fails', async () => {
  await withEvidence({ pgTap: tapEvidence(39) }, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, false)
    assert.match(issueText(report), /PGTAP_ASSERTION_INVALID/)
  })
})

registerTest('38 TAP without a plan fails', async () => {
  await withEvidence({ pgTap: tapEvidence().replace('1..40\n', '') }, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, false)
    assert.match(issueText(report), /PGTAP_PLAN_INVALID/)
  })
})

registerTest('39 partial or extra 41st TAP assertion fails', async () => {
  for (const extra of ['ok', 'not', 'ok 41 - unexpected']) {
    await withEvidence({ pgTap: `${tapEvidence()}${extra}\n` }, async (options) => {
      const report = await checkDatabaseRuntimeEvidence(options)
      assert.equal(report.pass, false)
      assert.match(issueText(report), /PGTAP_(?:ASSERTION_INVALID|TRUNCATED_OR_MALFORMED)/)
    })
  }
})

registerTest('40 unclosed TAP YAML diagnostic fails', async () => {
  const evidence = tapEvidence()
    .replace('ok 40 - contract 40\n', 'not ok 40 - contract 40\n  ---\n  message: failure\n')
  await withEvidence({ pgTap: evidence }, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, false)
    assert.match(issueText(report), /PGTAP_TRUNCATED_OR_MALFORMED: unclosed TAP diagnostic YAML block/)
  })
  const complete = tapEvidence()
    .replace('ok 40 - contract 40\n', 'not ok 40 - contract 40\n  ---\n  message: failure\n  ...\n')
  await withEvidence({ pgTap: complete }, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, false)
    assert.match(issueText(report), /PGTAP_ASSERTION_INVALID: 1 failed assertion/)
    assert.doesNotMatch(issueText(report), /unclosed TAP diagnostic YAML block/)
  })
})

registerTest('41 partial TAP directive fails', async () => {
  for (const partial of ['# SK', 'ok 40 - contract 40 # SK']) {
    const evidence = partial.startsWith('ok')
      ? tapEvidence().replace('ok 40 - contract 40', partial)
      : `${tapEvidence()}${partial}\n`
    await withEvidence({ pgTap: evidence }, async (options) => {
      const report = await checkDatabaseRuntimeEvidence(options)
      assert.equal(report.pass, false)
      assert.match(issueText(report), /PGTAP_TRUNCATED_OR_MALFORMED/)
    })
  }
})

registerTest('42 garbage after a completed TAP plan fails', async () => {
  await withEvidence({ pgTap: `${tapEvidence()}executed external command\n` }, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, false)
    assert.match(issueText(report), /PGTAP_TRUNCATED_OR_MALFORMED/)
  })
})

registerTest('43 duplicate TAP plan fails', async () => {
  await withEvidence({ pgTap: tapEvidence().replace('1..40\n', '1..40\n1..40\n') }, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, false)
    assert.match(issueText(report), /PGTAP_PLAN_INVALID/)
  })
})

registerTest('44 TAP bailout and truncated bailout fail', async () => {
  for (const bailout of ['Bail out! database unavailable', 'Bail out']) {
    await withEvidence({ pgTap: `${tapEvidence()}${bailout}\n` }, async (options) => {
      const report = await checkDatabaseRuntimeEvidence(options)
      assert.equal(report.pass, false)
      assert.match(issueText(report), /PGTAP_TRUNCATED_OR_MALFORMED/)
    })
  }
})

registerTest('45 invalid UTF-8, NUL, missing, and non-file evidence fail safely', async () => {
  await withEvidence({ pgTap: Buffer.from([0xc3, 0x28]) }, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, false)
    assert.match(issueText(report), /EVIDENCE_FILE_INVALID: pgTAP: invalid UTF-8/)
  })
  await withEvidence({ pgTap: Buffer.from('TAP version 13\n1..40\nok 1\0\n') }, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, false)
    assert.match(issueText(report), /EVIDENCE_FILE_INVALID: pgTAP: NUL or binary content/)
  })
  await withEvidence({ pgTap: undefined }, async (options) => {
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, false)
    assert.match(issueText(report), /EVIDENCE_FILE_MISSING/)
  })
  await withEvidence({}, async (options, paths) => {
    await fs.rm(paths.pgTap)
    await fs.mkdir(paths.pgTap)
    const report = await checkDatabaseRuntimeEvidence(options)
    assert.equal(report.pass, false)
    assert.match(issueText(report), /EVIDENCE_FILE_INVALID/)
  })
})
