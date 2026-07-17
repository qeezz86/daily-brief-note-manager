import { describe, expect, it } from 'vitest'

import { findSourceKey, manifestJavaScriptFiles, parseManifestJson } from './manifest.mjs'
import { normalizeSourceKey } from './stable.mjs'
import { syntheticManifest } from './fixtures.test.mjs'

describe('bundle manifest parser', () => {
  it('parses a valid manifest', () => expect(Object.keys(parseManifestJson(JSON.stringify(syntheticManifest())))).toHaveLength(5))
  it('rejects malformed JSON', () => expect(() => parseManifestJson('{')).toThrow('파싱'))
  it('rejects a non-object root', () => expect(() => parseManifestJson('[]')).toThrow('객체'))
  it('rejects a missing output file', () => expect(() => parseManifestJson(JSON.stringify({ source: {} }))).toThrow('output file'))
  it('rejects a non-string output file', () => expect(() => parseManifestJson(JSON.stringify({ source: { file: 1 } }))).toThrow('output file'))
  it('rejects invalid imports', () => expect(() => parseManifestJson(JSON.stringify({ source: { file: 'a.js', imports: 'bad' } }))).toThrow('문자열 배열'))
  it('rejects a missing static reference', () => expect(() => parseManifestJson(JSON.stringify({ source: { file: 'a.js', imports: ['missing'] } }))).toThrow('존재하지 않는 module'))
  it('rejects a missing dynamic reference', () => expect(() => parseManifestJson(JSON.stringify({ source: { file: 'a.js', dynamicImports: ['missing'] } }))).toThrow('존재하지 않는 module'))
  it('normalizes Windows source paths', () => expect(normalizeSourceKey('.\\src\\main.tsx')).toBe('src/main.tsx'))
  it('normalizes POSIX source paths', () => expect(normalizeSourceKey('./src/main.tsx')).toBe('src/main.tsx'))
  it('normalizes leading slashes', () => expect(normalizeSourceKey('/src/main.tsx')).toBe('src/main.tsx'))
  it('returns empty for non-string input', () => expect(normalizeSourceKey(null)).toBe(''))
  it('finds an exact source key', () => expect(findSourceKey(syntheticManifest(), 'src/pages/LoginPage.tsx')).toBe('src/pages/LoginPage.tsx'))
  it('finds the single Vite application entry for src/main.tsx', () => expect(findSourceKey(syntheticManifest(), 'src/main.tsx')).toBe('index.html'))
  it('rejects an absent source root', () => expect(() => findSourceKey(syntheticManifest(), 'src/pages/Missing.tsx')).toThrow('manifest에 없습니다'))
  it('lists unique JavaScript assets in stable order', () => expect(manifestJavaScriptFiles(syntheticManifest())).toEqual(['assets/dashboard.js', 'assets/engine.js', 'assets/entry.js', 'assets/login.js', 'assets/shared.js']))
})
