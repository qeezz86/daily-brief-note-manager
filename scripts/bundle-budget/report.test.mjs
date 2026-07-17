import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createReport, formatKiB, printHumanReport, writeReport } from './report.mjs'
import { repositoryRelative, stableJson, stableObject } from './stable.mjs'

function reportInput(rootDirectory = path.resolve('workspace')) {
  const metrics = [{ name: 'entry', category: 'entry', source: 'src/main.tsx', raw: 100, gzip: 50, assets: ['assets/index-HASH.js'] }]
  const evaluation = { pass: true, results: [{ name: 'entry', status: 'PASS', dimensions: { raw: { current: 100, baseline: 100, allowed: 110, absolute: 200, excess: 0, increaseRatio: 0, passed: true } } }], violations: [], warnings: [] }
  return {
    rootDirectory,
    manifestPath: path.join(rootDirectory, 'dist/.vite/manifest.json'),
    config: { version: 1, limits: { entry: { raw: { absolute: 200 } } } },
    baseline: { version: 1, metrics: { entry: { raw: 100 } } },
    metrics,
    chunks: [{ file: 'assets/index-HASH.js', raw: 100, gzip: 50 }],
    evaluation,
    generatedAt: '2026-07-17T00:00:00.000Z',
  }
}

describe('bundle budget report', () => {
  const temporaryDirectories = []
  afterEach(async () => {
    vi.restoreAllMocks()
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
  })

  it('formats bytes as KiB', () => expect(formatKiB(1536)).toBe('1.50 KiB'))
  it('sets schema version and pass state', () => expect(createReport(reportInput())).toMatchObject({ schemaVersion: 1, pass: true }))
  it('uses a repository-relative manifest path', () => expect(createReport(reportInput()).manifestPath).toBe('dist/.vite/manifest.json'))
  it('keeps hashed output assets in reports', () => expect(JSON.stringify(createReport(reportInput()))).toContain('index-HASH.js'))
  it('does not expose an absolute source path', () => {
    const input = reportInput()
    input.metrics[0].source = path.join(input.rootDirectory, 'src/main.tsx')
    expect(createReport(input).metrics[0].source).toBe('src/main.tsx')
  })
  it('does not expose a user home path in violations', () => {
    const input = reportInput()
    input.evaluation.violations = [{ metric: 'entry', source: path.join(input.rootDirectory, 'private/user/file.js') }]
    expect(createReport(input).violations[0].source).toBe('private/user/file.js')
  })
  it('writes a report and creates its directory', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'bundle-report-'))
    temporaryDirectories.push(directory)
    const target = path.join(directory, 'nested/report.json')
    await writeReport(target, createReport(reportInput()))
    expect(JSON.parse(await readFile(target, 'utf8')).schemaVersion).toBe(1)
  })
  it('stableObject sorts object keys recursively', () => expect(Object.keys(stableObject({ z: 1, a: { z: 1, a: 2 } }))).toEqual(['a', 'z']))
  it('stableJson returns identical output for equivalent key order', () => expect(stableJson({ z: 1, a: 2 })).toBe(stableJson({ a: 2, z: 1 })))
  it('repositoryRelative never returns an outside absolute path', () => expect(repositoryRelative(path.resolve('workspace'), path.resolve('outside/file.js'))).not.toMatch(/^[A-Za-z]:|^\//))
  it('prints a non-ANSI human table', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const input = reportInput()
    printHumanReport(input.metrics, input.evaluation)
    expect(log.mock.calls.flat().join('\n')).toContain('| Metric')
    expect(log.mock.calls.flat().join('\n')).not.toContain('\u001b')
  })
  it('prints detailed failures', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const input = reportInput()
    input.evaluation.pass = false
    input.evaluation.violations = [{ metric: 'entry', dimension: 'raw', source: 'src/main.tsx', current: 120, baseline: 100, allowed: 110, absolute: 200, excess: 10, increaseRatio: 0.2 }]
    printHumanReport(input.metrics, input.evaluation)
    expect(error.mock.calls.flat().join('\n')).toContain('current=120')
  })
})
