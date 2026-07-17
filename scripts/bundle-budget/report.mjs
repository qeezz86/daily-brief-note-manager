import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { repositoryRelative, stableJson } from './stable.mjs'

export function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(2)} KiB`
}

function resultMap(evaluation) {
  return new Map(evaluation.results.map((result) => [result.name, result]))
}

export function createReport({ rootDirectory, manifestPath, config, baseline, metrics, chunks, evaluation, generatedAt = new Date().toISOString() }) {
  const results = resultMap(evaluation)
  const safeSource = (source) => source && path.isAbsolute(source) ? repositoryRelative(rootDirectory, source) : source
  const largestChunk = metrics.find((metric) => metric.name === 'largest-chunk')
  return {
    schemaVersion: 1,
    generatedAt,
    manifestPath: repositoryRelative(rootDirectory, manifestPath),
    budgetConfigVersion: config.version,
    baselineVersion: baseline.version,
    pass: evaluation.pass,
    metrics: metrics.map((metric) => ({
      name: metric.name,
      category: metric.category,
      source: safeSource(metric.source),
      raw: metric.raw,
      ...(metric.gzip === undefined ? {} : { gzip: metric.gzip }),
      ...(metric.entries === undefined ? {} : { entries: metric.entries }),
      assets: metric.assets,
      ...(metric.dimensionAssets === undefined ? {} : { dimensionAssets: metric.dimensionAssets }),
      ...(metric.urls === undefined ? {} : { urls: metric.urls }),
      result: results.get(metric.name)?.status ?? 'INFO',
    })),
    ...(largestChunk?.dimensionAssets === undefined ? {} : {
      largestChunks: {
        raw: { file: largestChunk.dimensionAssets.raw, bytes: largestChunk.raw },
        gzip: { file: largestChunk.dimensionAssets.gzip, bytes: largestChunk.gzip },
      },
    }),
    limits: config.limits,
    baseline: baseline.metrics,
    violations: evaluation.violations.map((violation) => ({ ...violation, source: safeSource(violation.source) })),
    warnings: evaluation.warnings,
    chunks: chunks.map(({ file, raw, gzip }) => ({ file, raw, gzip })),
  }
}

export async function writeReport(reportPath, report) {
  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, stableJson(report), 'utf8')
}

function tableRow(cells, widths) {
  return `| ${cells.map((cell, index) => String(cell).padEnd(widths[index])).join(' | ')} |`
}

function printSection(title, sectionMetrics, results) {
  if (sectionMetrics.length === 0) return
  console.log(`\n${title}`)
  const headings = ['Metric', 'Current', 'Gzip', 'Baseline', 'Limit', 'Result']
  const rows = sectionMetrics.map((metric) => {
    const result = results.get(metric.name)
    const raw = result?.dimensions.raw
    const entries = result?.dimensions.entries
    const isPrecache = metric.name === 'pwa-precache'
    const isLargestChunk = metric.name === 'largest-chunk'
    const rawCurrent = isLargestChunk
      ? `${formatKiB(metric.raw)} (${metric.dimensionAssets.raw})`
      : formatKiB(metric.raw)
    const gzipCurrent = metric.gzip === undefined
      ? '-'
      : isLargestChunk
        ? `${formatKiB(metric.gzip)} (${metric.dimensionAssets.gzip})`
        : formatKiB(metric.gzip)
    return [
      metric.name,
      isPrecache ? `${metric.entries} entries / ${formatKiB(metric.raw)}` : entries ? `${metric.entries} entries` : rawCurrent,
      gzipCurrent,
      isPrecache ? `${entries.baseline} entries / ${formatKiB(raw.baseline)}` : raw ? formatKiB(raw.baseline) : entries ? `${entries.baseline} entries` : '-',
      isPrecache ? `${entries.allowed} entries / ${formatKiB(raw.allowed)}` : raw ? formatKiB(raw.allowed) : entries ? `${entries.allowed} entries` : '-',
      result?.status ?? 'INFO',
    ]
  })
  const widths = headings.map((heading, index) => Math.max(heading.length, ...rows.map((row) => String(row[index]).length)))
  console.log(tableRow(headings, widths))
  console.log(tableRow(widths.map((width) => '-'.repeat(width)), widths))
  for (const row of rows) console.log(tableRow(row, widths))
}

export function printHumanReport(metrics, evaluation) {
  const results = resultMap(evaluation)
  const sections = [
    ['Entry', ['entry', 'entry-closure']],
    ['Route closures', ['route-closure']],
    ['Route incremental', ['route-incremental']],
    ['Feature engines', ['feature-standalone', 'feature-incremental']],
    ['Largest chunks', ['largest-chunk']],
    ['Total assets', ['total-assets']],
    ['PWA information', ['pwa']],
  ]
  for (const [title, categories] of sections) printSection(title, metrics.filter((metric) => categories.includes(metric.category)), results)

  if (evaluation.violations.length > 0) {
    console.error('\nBudget violations')
    for (const violation of evaluation.violations) {
      const ratio = violation.increaseRatio === null ? 'n/a' : `${(violation.increaseRatio * 100).toFixed(2)}%`
      console.error(`- ${violation.metric}.${violation.dimension}: current=${violation.current}, baseline=${violation.baseline ?? 'n/a'}, allowed=${violation.allowed}, absolute=${violation.absolute}, excess=${violation.excess}, increase=${ratio}, source=${violation.source ?? 'n/a'}`)
    }
  }
  console.log(`\nBundle budget: ${evaluation.pass ? 'PASS' : 'FAIL'}`)
}
