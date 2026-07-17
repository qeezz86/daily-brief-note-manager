import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { BundleBudgetError } from './errors.mjs'
import { normalizeSourceKey } from './stable.mjs'

const ARRAY_FIELDS = ['imports', 'dynamicImports', 'css', 'assets']

export function parseManifestJson(text, label = 'manifest') {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new BundleBudgetError(`${label} JSON을 파싱할 수 없습니다.`, 'MANIFEST_JSON_INVALID')
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BundleBudgetError(`${label} 최상위 값은 객체여야 합니다.`, 'MANIFEST_SHAPE_INVALID')
  }

  const manifest = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.file !== 'string' || !value.file) {
      throw new BundleBudgetError(`${label}의 ${key} output file이 없거나 올바르지 않습니다.`, 'MANIFEST_FILE_MISSING')
    }
    for (const field of ARRAY_FIELDS) {
      if (value[field] !== undefined && (!Array.isArray(value[field]) || value[field].some((item) => typeof item !== 'string'))) {
        throw new BundleBudgetError(`${label}의 ${key}.${field}는 문자열 배열이어야 합니다.`, 'MANIFEST_SHAPE_INVALID')
      }
    }
    manifest[normalizeSourceKey(key)] = {
      ...value,
      file: normalizeSourceKey(value.file),
      ...(typeof value.src === 'string' ? { src: normalizeSourceKey(value.src) } : {}),
      imports: (value.imports ?? []).map(normalizeSourceKey),
      dynamicImports: (value.dynamicImports ?? []).map(normalizeSourceKey),
      css: (value.css ?? []).map(normalizeSourceKey),
      assets: (value.assets ?? []).map(normalizeSourceKey),
    }
  }

  for (const [key, value] of Object.entries(manifest)) {
    for (const dependency of [...value.imports, ...value.dynamicImports]) {
      if (!manifest[dependency]) {
        throw new BundleBudgetError(`${label}의 ${key}가 존재하지 않는 module ${dependency}을 참조합니다.`, 'MANIFEST_IMPORT_MISSING')
      }
    }
  }
  return manifest
}

export async function loadManifest(manifestPath) {
  let text
  try {
    text = await readFile(manifestPath, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new BundleBudgetError(`Vite manifest를 찾을 수 없습니다: ${manifestPath}`, 'MANIFEST_NOT_FOUND')
    }
    throw error
  }
  return parseManifestJson(text, path.basename(manifestPath))
}

export function findSourceKey(manifest, source) {
  const normalized = normalizeSourceKey(source)
  if (manifest[normalized]) return normalized
  const matches = Object.entries(manifest)
    .filter(([key, value]) => normalizeSourceKey(key) === normalized || value.src === normalized)
    .map(([key]) => key)
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) throw new BundleBudgetError(`source root가 manifest의 여러 module과 일치합니다: ${normalized}`, 'SOURCE_ROOT_AMBIGUOUS')
  if (normalized === 'src/main.tsx') {
    const entryMatches = Object.entries(manifest).filter(([, value]) => value.isEntry === true).map(([key]) => key)
    if (entryMatches.length === 1) return entryMatches[0]
    if (entryMatches.length > 1) throw new BundleBudgetError('manifest에 application entry가 여러 개 있어 src/main.tsx를 결정할 수 없습니다.', 'SOURCE_ROOT_AMBIGUOUS')
  }
  throw new BundleBudgetError(`설정된 source root가 manifest에 없습니다: ${normalized}`, 'SOURCE_ROOT_MISSING')
}

export function manifestJavaScriptFiles(manifest) {
  return [...new Set(Object.values(manifest).map(({ file }) => file).filter((file) => file.endsWith('.js')))].sort()
}
