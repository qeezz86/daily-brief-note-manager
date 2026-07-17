import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { calculateMetrics, isJavaScriptAsset, measureAssets, measurePrecache, parsePrecacheUrls, selectLargestChunks } from './metrics.mjs'
import { budgetConfig, syntheticManifest, writeAssets } from './fixtures.test.mjs'

describe('bundle size metrics', () => {
  let directory
  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'bundle-budget-'))
    await writeAssets(directory)
  })
  afterEach(async () => { await rm(directory, { recursive: true, force: true }) })

  it('measures exact raw bytes', async () => expect((await measureAssets(directory, ['assets/entry.js'])).raw).toBe(Buffer.byteLength('entry()')))
  it('measures gzip bytes', async () => expect((await measureAssets(directory, ['assets/entry.js'])).gzip).toBeGreaterThan(0))
  it('uses deterministic gzip options', async () => expect(await measureAssets(directory, ['assets/entry.js'])).toEqual(await measureAssets(directory, ['assets/entry.js'])))
  it('rejects a missing asset', async () => await expect(measureAssets(directory, ['assets/missing.js'])).rejects.toThrow('파일이 없습니다'))
  it('counts a duplicate asset once', async () => expect((await measureAssets(directory, ['assets/entry.js', 'assets/entry.js'])).raw).toBe(Buffer.byteLength('entry()')))
  it('excludes CSS from JavaScript measurement', async () => expect(await measureAssets(directory, ['assets/style.css'])).toEqual({ raw: 0, gzip: 0 }))
  it('excludes source maps', async () => expect(await measureAssets(directory, ['assets/entry.js.map'])).toEqual({ raw: 0, gzip: 0 }))
  it('allows an empty JavaScript file measurement', async () => {
    await writeFile(path.join(directory, 'assets/empty.js'), '')
    expect(await measureAssets(directory, ['assets/empty.js'])).toEqual({ raw: 0, gzip: 20 })
  })
  it('identifies JavaScript', () => expect(isJavaScriptAsset('assets/a.js')).toBe(true))
  it('rejects CSS as JavaScript', () => expect(isJavaScriptAsset('assets/a.css')).toBe(false))
  it('rejects maps as JavaScript', () => expect(isJavaScriptAsset('assets/a.js.map')).toBe(false))
  it('rejects non-string asset values', () => expect(isJavaScriptAsset(null)).toBe(false))
  it('selects the same asset when it is largest in raw and gzip bytes', () => {
    const largest = selectLargestChunks([
      { file: 'assets/a.js', raw: 20, gzip: 10 },
      { file: 'assets/b.js', raw: 10, gzip: 5 },
    ])
    expect(largest).toEqual({
      raw: { file: 'assets/a.js', raw: 20, gzip: 10 },
      gzip: { file: 'assets/a.js', raw: 20, gzip: 10 },
    })
  })
  it('selects raw and gzip maximum assets independently', () => {
    const largest = selectLargestChunks([
      { file: 'assets/raw.js', raw: 20, gzip: 5 },
      { file: 'assets/gzip.js', raw: 15, gzip: 10 },
    ])
    expect(largest.raw.file).toBe('assets/raw.js')
    expect(largest.gzip.file).toBe('assets/gzip.js')
  })
  it('breaks raw ties by normalized file name', () => {
    const largest = selectLargestChunks([
      { file: 'assets\\z.js', raw: 20, gzip: 5 },
      { file: 'assets/a.js', raw: 20, gzip: 4 },
    ])
    expect(largest.raw.file).toBe('assets/a.js')
  })
  it('breaks gzip ties by normalized file name', () => {
    const largest = selectLargestChunks([
      { file: 'assets\\z.js', raw: 20, gzip: 10 },
      { file: 'assets/a.js', raw: 10, gzip: 10 },
    ])
    expect(largest.gzip.file).toBe('assets/a.js')
  })
  it('parses double-quoted precache URLs', () => expect(parsePrecacheUrls('x.precacheAndRoute([{url:"index.html"}])')).toEqual(['index.html']))
  it('parses single-quoted precache URLs', () => expect(parsePrecacheUrls("x.precacheAndRoute([{url:'index.html'}])")).toEqual(['index.html']))
  it('deduplicates precache URLs', () => expect(parsePrecacheUrls('x.precacheAndRoute([{url:"a.js"},{url:"a.js"}])')).toEqual(['a.js']))
  it('sorts precache URLs', () => expect(parsePrecacheUrls('x.precacheAndRoute([{url:"z.js"},{url:"a.js"}])')).toEqual(['a.js', 'z.js']))
  it('rejects a missing precache call', () => expect(() => parsePrecacheUrls('const x = []')).toThrow('precacheAndRoute'))
  it('rejects an unterminated precache array', () => expect(() => parsePrecacheUrls('x.precacheAndRoute([{url:"a.js"}')).toThrow('구조적으로'))
  it('measures PWA entry count and bytes', async () => {
    await writeFile(path.join(directory, 'index.html'), 'html')
    await writeFile(path.join(directory, 'sw.js'), 'x.precacheAndRoute([{url:"index.html"},{url:"assets/entry.js"}])')
    expect(await measurePrecache(directory)).toMatchObject({ entries: 2, raw: 11 })
  })
  it('rejects a missing PWA asset', async () => {
    await writeFile(path.join(directory, 'sw.js'), 'x.precacheAndRoute([{url:"missing.js"}])')
    await expect(measurePrecache(directory)).rejects.toThrow('precache asset')
  })
  it('calculates entry, routes, feature, chunks, total, and PWA metrics', async () => {
    await writeFile(path.join(directory, 'index.html'), 'html')
    await writeFile(path.join(directory, 'sw.js'), 'x.precacheAndRoute([{url:"index.html"}])')
    const output = await calculateMetrics(budgetConfig(), syntheticManifest(), directory)
    expect(output.metrics.map(({ name }) => name)).toEqual(expect.arrayContaining(['entry', 'entry-static-closure', 'route.login.closure', 'route.dashboard.incremental', 'feature.engine.standalone', 'feature.engine.incremental', 'largest-chunk', 'total-js', 'pwa-precache']))
  })
  it('sorts chunks by descending raw size', async () => {
    await writeFile(path.join(directory, 'index.html'), 'html')
    await writeFile(path.join(directory, 'sw.js'), 'x.precacheAndRoute([{url:"index.html"}])')
    const { chunks } = await calculateMetrics(budgetConfig(), syntheticManifest(), directory)
    expect(chunks[0].raw).toBeGreaterThanOrEqual(chunks.at(-1).raw)
  })
  it('records the selected asset for each largest chunk dimension', async () => {
    await writeFile(path.join(directory, 'index.html'), 'html')
    await writeFile(path.join(directory, 'sw.js'), 'x.precacheAndRoute([{url:"index.html"}])')
    const { metrics } = await calculateMetrics(budgetConfig(), syntheticManifest(), directory)
    const largest = metrics.find(({ name }) => name === 'largest-chunk')
    expect(largest.dimensionAssets.raw).toMatch(/^assets\//)
    expect(largest.dimensionAssets.gzip).toMatch(/^assets\//)
  })
})
