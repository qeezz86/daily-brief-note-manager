#!/usr/bin/env node
import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createBaseline, evaluateBudgets, validateBudgetConfig } from './budget.mjs'
import { BundleBudgetError } from './errors.mjs'
import { loadManifest } from './manifest.mjs'
import { calculateMetrics } from './metrics.mjs'
import { createReport, printHumanReport, writeReport } from './report.mjs'
import { repositoryRelative, stableJson } from './stable.mjs'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const rootDirectory = path.resolve(scriptDirectory, '../..')
const configPath = path.join(rootDirectory, 'config/bundle-budget.json')
const baselinePath = path.join(rootDirectory, 'config/bundle-baseline.json')

async function readJson(filePath, label) {
  let text
  try {
    text = await readFile(filePath, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') throw new BundleBudgetError(`${label} 파일을 찾을 수 없습니다: ${repositoryRelative(rootDirectory, filePath)}`, `${label.toUpperCase()}_NOT_FOUND`)
    throw error
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new BundleBudgetError(`${label} JSON을 파싱할 수 없습니다.`, `${label.toUpperCase()}_JSON_INVALID`)
  }
}

async function discoverManifest(config) {
  for (const candidate of config.manifestPaths) {
    const absolute = path.resolve(rootDirectory, candidate)
    try {
      await access(absolute)
      return absolute
    } catch {
      // Try the next configured Vite manifest location.
    }
  }
  throw new BundleBudgetError(`Vite manifest가 없습니다. 먼저 npm run build를 실행하세요. 검사 위치: ${config.manifestPaths.join(', ')}`, 'MANIFEST_NOT_FOUND')
}

function printBaselineDiff(previous, next) {
  const names = [...new Set([...Object.keys(previous?.metrics ?? {}), ...Object.keys(next.metrics)])].sort()
  console.log('Baseline changes')
  for (const name of names) {
    const before = previous?.metrics?.[name]
    const after = next.metrics[name]
    if (JSON.stringify(before) !== JSON.stringify(after)) console.log(`- ${name}: ${JSON.stringify(before ?? null)} -> ${JSON.stringify(after ?? null)}`)
  }
}

export async function run(command = process.argv[2] ?? 'check') {
  if (!['check', 'baseline'].includes(command)) throw new BundleBudgetError(`알 수 없는 명령입니다: ${command}`, 'CLI_COMMAND_INVALID')
  const config = validateBudgetConfig(await readJson(configPath, 'budget config'))
  const manifestPath = await discoverManifest(config)
  const manifest = await loadManifest(manifestPath)
  const distDirectory = path.resolve(rootDirectory, 'dist')
  const { metrics, chunks } = await calculateMetrics(config, manifest, distDirectory)

  if (command === 'baseline') {
    if (process.env.CI) throw new BundleBudgetError('CI에서는 bundle baseline을 갱신할 수 없습니다.', 'BASELINE_CI_FORBIDDEN')
    let previous = null
    try { previous = await readJson(baselinePath, 'baseline') } catch (error) { if (!(error instanceof BundleBudgetError && error.code === 'BASELINE_NOT_FOUND')) throw error }
    const next = createBaseline(config, metrics)
    printBaselineDiff(previous, next)
    await writeFile(baselinePath, stableJson(next), 'utf8')
    console.log(`Baseline written: ${repositoryRelative(rootDirectory, baselinePath)}`)
    return 0
  }

  const baseline = await readJson(baselinePath, 'baseline')
  const evaluation = evaluateBudgets(config, metrics, baseline, chunks)
  const report = createReport({ rootDirectory, manifestPath, config, baseline, metrics, chunks, evaluation })
  const reportPath = path.resolve(rootDirectory, config.reportPath)
  await writeReport(reportPath, report)
  printHumanReport(metrics, evaluation)
  console.log(`Report: ${repositoryRelative(rootDirectory, reportPath)}`)
  return evaluation.pass ? 0 : 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().then((exitCode) => { process.exitCode = exitCode }).catch((error) => {
    if (error instanceof BundleBudgetError) {
      console.error(`[${error.code}] ${error.message}`)
      process.exitCode = error.exitCode
      return
    }
    console.error(process.argv.includes('--debug') ? error : `예상하지 못한 bundle checker 오류: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 2
  })
}
