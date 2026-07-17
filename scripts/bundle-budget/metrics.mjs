import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

import { BundleBudgetError } from './errors.mjs'
import { differenceAssets, routeClosure, staticDependencyClosure, unionAssets } from './graph.mjs'
import { findSourceKey, manifestJavaScriptFiles } from './manifest.mjs'

export function isJavaScriptAsset(asset) {
  return typeof asset === 'string' && asset.endsWith('.js') && !asset.endsWith('.js.map')
}

export async function measureAssets(distDirectory, assets) {
  let raw = 0
  let gzip = 0
  for (const asset of [...new Set(assets)].filter(isJavaScriptAsset).sort()) {
    const assetPath = path.resolve(distDirectory, asset)
    if (!assetPath.startsWith(`${path.resolve(distDirectory)}${path.sep}`)) {
      throw new BundleBudgetError(`asset 경로가 dist 밖을 가리킵니다: ${asset}`, 'ASSET_PATH_INVALID')
    }
    let content
    try {
      content = await readFile(assetPath)
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        throw new BundleBudgetError(`manifest가 참조하는 asset 파일이 없습니다: ${asset}`, 'ASSET_FILE_MISSING')
      }
      throw error
    }
    raw += content.byteLength
    gzip += gzipSync(content, { level: 9 }).byteLength
  }
  return { raw, gzip }
}

function parseQuotedString(text, start) {
  const quote = text[start]
  let value = ''
  for (let index = start + 1; index < text.length; index += 1) {
    const character = text[index]
    if (character === '\\') {
      const next = text[index + 1]
      if (next === undefined) break
      value += next === 'n' ? '\n' : next === 'r' ? '\r' : next === 't' ? '\t' : next
      index += 1
    } else if (character === quote) {
      return { value, end: index + 1 }
    } else {
      value += character
    }
  }
  throw new BundleBudgetError('PWA precache manifest의 문자열이 닫히지 않았습니다.', 'PWA_MANIFEST_INVALID')
}

export function parsePrecacheUrls(serviceWorkerText) {
  const callIndex = serviceWorkerText.indexOf('.precacheAndRoute(')
  if (callIndex < 0) throw new BundleBudgetError('service worker에서 precacheAndRoute 호출을 찾을 수 없습니다.', 'PWA_MANIFEST_MISSING')
  const arrayStart = serviceWorkerText.indexOf('[', callIndex)
  if (arrayStart < 0) throw new BundleBudgetError('PWA precache 배열을 찾을 수 없습니다.', 'PWA_MANIFEST_INVALID')

  const urls = []
  let depth = 0
  let index = arrayStart
  while (index < serviceWorkerText.length) {
    const character = serviceWorkerText[index]
    if (character === '"' || character === "'") {
      const parsed = parseQuotedString(serviceWorkerText, index)
      index = parsed.end
      continue
    }
    if (character === '[') depth += 1
    if (character === ']') {
      depth -= 1
      if (depth === 0) break
    }
    if (serviceWorkerText.slice(index, index + 3) === 'url') {
      let cursor = index + 3
      while (/\s/.test(serviceWorkerText[cursor] ?? '')) cursor += 1
      if (serviceWorkerText[cursor] === ':') {
        cursor += 1
        while (/\s/.test(serviceWorkerText[cursor] ?? '')) cursor += 1
        if (serviceWorkerText[cursor] === '"' || serviceWorkerText[cursor] === "'") {
          const parsed = parseQuotedString(serviceWorkerText, cursor)
          urls.push(parsed.value)
          index = parsed.end
          continue
        }
      }
    }
    index += 1
  }
  if (depth !== 0 || urls.length === 0) throw new BundleBudgetError('PWA precache 배열을 구조적으로 해석할 수 없습니다.', 'PWA_MANIFEST_INVALID')
  return [...new Set(urls)].sort()
}

export async function measurePrecache(distDirectory) {
  const serviceWorkerPath = path.join(distDirectory, 'sw.js')
  let serviceWorker
  try {
    serviceWorker = await readFile(serviceWorkerPath, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') throw new BundleBudgetError('PWA service worker dist/sw.js가 없습니다.', 'PWA_MANIFEST_MISSING')
    throw error
  }
  const urls = parsePrecacheUrls(serviceWorker)
  let raw = 0
  for (const url of urls) {
    const cleanUrl = decodeURIComponent(url.split(/[?#]/, 1)[0]).replace(/^\//, '')
    const assetPath = path.resolve(distDirectory, cleanUrl)
    if (!assetPath.startsWith(`${path.resolve(distDirectory)}${path.sep}`)) {
      throw new BundleBudgetError(`precache 경로가 dist 밖을 가리킵니다: ${url}`, 'PWA_ASSET_PATH_INVALID')
    }
    try {
      raw += (await stat(assetPath)).size
    } catch (error) {
      if (error && error.code === 'ENOENT') throw new BundleBudgetError(`precache asset 파일이 없습니다: ${url}`, 'PWA_ASSET_MISSING')
      throw error
    }
  }
  return { entries: urls.length, raw, urls }
}

function record(name, category, source, assets, sizes, extra = {}) {
  return { name, category, source, assets: [...assets].sort(), ...sizes, ...extra }
}

export async function calculateMetrics(config, manifest, distDirectory) {
  const metrics = []
  const entryAssets = staticDependencyClosure(manifest, [config.entryRoot])
  const entryKey = findSourceKey(manifest, config.entryRoot)
  const entryChunk = [manifest[entryKey].file]
  metrics.push(record('entry', 'entry', config.entryRoot, entryChunk, await measureAssets(distDirectory, entryChunk)))
  metrics.push(record('entry-static-closure', 'entry-closure', config.entryRoot, entryAssets, await measureAssets(distDirectory, entryAssets)))

  const routeAssets = new Map()
  for (const route of config.routes) {
    const closure = routeClosure(manifest, config.entryRoot, route.source)
    const incremental = differenceAssets(closure, entryAssets)
    routeAssets.set(route.name, closure)
    metrics.push(record(`route.${route.name}.closure`, 'route-closure', route.source, closure, await measureAssets(distDirectory, closure)))
    metrics.push(record(`route.${route.name}.incremental`, 'route-incremental', route.source, incremental, await measureAssets(distDirectory, incremental)))
  }

  for (const feature of config.features) {
    const standalone = staticDependencyClosure(manifest, [feature.source])
    const shell = routeAssets.get(feature.route)
    if (!shell) throw new BundleBudgetError(`feature ${feature.name}의 route가 설정되어 있지 않습니다: ${feature.route}`, 'FEATURE_ROUTE_MISSING')
    const incremental = differenceAssets(standalone, shell)
    metrics.push(record(`feature.${feature.name}.standalone`, 'feature-standalone', feature.source, standalone, await measureAssets(distDirectory, standalone)))
    metrics.push(record(`feature.${feature.name}.incremental`, 'feature-incremental', feature.source, incremental, await measureAssets(distDirectory, incremental)))
  }

  const allJs = manifestJavaScriptFiles(manifest)
  const chunks = []
  for (const asset of allJs) {
    const sizes = await measureAssets(distDirectory, [asset])
    chunks.push({ file: asset, ...sizes })
    if (sizes.raw === 0) throw new BundleBudgetError(`빈 JavaScript chunk가 생성되었습니다: ${asset}`, 'EMPTY_CHUNK')
  }
  chunks.sort((left, right) => right.raw - left.raw || left.file.localeCompare(right.file))
  const largest = chunks[0]
  if (!largest) throw new BundleBudgetError('manifest에 JavaScript asset이 없습니다.', 'NO_JAVASCRIPT_ASSETS')
  metrics.push(record('largest-chunk', 'largest-chunk', null, [largest.file], largest))
  metrics.push(record('total-js', 'total-assets', null, allJs, await measureAssets(distDirectory, allJs)))

  const precache = await measurePrecache(distDirectory)
  metrics.push(record('pwa-precache', 'pwa', 'dist/sw.js', [], { raw: precache.raw, entries: precache.entries }, { urls: precache.urls }))

  return { metrics, chunks, entryAssets: unionAssets(entryAssets) }
}
