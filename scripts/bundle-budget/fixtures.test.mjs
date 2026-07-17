import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, it } from 'vitest'

it('provides a stable synthetic manifest fixture', () => {
  expect(Object.keys(syntheticManifest())).toHaveLength(5)
})

export function syntheticManifest() {
  return {
    'index.html': { file: 'assets/entry.js', src: 'index.html', isEntry: true, imports: ['_shared.js'], dynamicImports: ['src/pages/LoginPage.tsx'] },
    '_shared.js': { file: 'assets/shared.js', imports: [] },
    'src/pages/LoginPage.tsx': { file: 'assets/login.js', imports: ['_shared.js'], dynamicImports: ['src/features/engine.module.ts'] },
    'src/pages/DashboardPage.tsx': { file: 'assets/dashboard.js', imports: ['_shared.js'] },
    'src/features/engine.module.ts': { file: 'assets/engine.js', imports: ['_shared.js'] },
  }
}

export function budgetConfig() {
  const bytes = { absolute: 10_000, percentHeadroom: 0.1, minimumHeadroom: 10 }
  return {
    version: 1,
    units: 'bytes',
    manifestPaths: ['dist/.vite/manifest.json'],
    reportPath: 'artifacts/report.json',
    entryRoot: 'src/main.tsx',
    routes: [
      { name: 'login', source: 'src/pages/LoginPage.tsx' },
      { name: 'dashboard', source: 'src/pages/DashboardPage.tsx' },
    ],
    features: [{ name: 'engine', source: 'src/features/engine.module.ts', route: 'login' }],
    limits: {
      entry: { raw: { ...bytes }, gzip: { ...bytes } },
      largestChunk: { raw: { ...bytes }, gzip: { ...bytes } },
      loginClosure: { raw: { ...bytes }, gzip: { ...bytes } },
      routeClosure: { raw: { ...bytes }, gzip: { ...bytes } },
      routeIncremental: { raw: { ...bytes }, gzip: { ...bytes } },
      featureIncremental: { raw: { ...bytes }, gzip: { ...bytes } },
      totalJs: { raw: { ...bytes } },
      pwaPrecache: { entries: { absolute: 100, minimumHeadroom: 2 }, raw: { ...bytes } },
    },
  }
}

export async function writeAssets(directory, files = {}) {
  await mkdir(path.join(directory, 'assets'), { recursive: true })
  const defaults = {
    'assets/entry.js': 'entry()',
    'assets/shared.js': 'shared()',
    'assets/login.js': 'login()',
    'assets/dashboard.js': 'dashboard()',
    'assets/engine.js': 'engine()',
  }
  for (const [name, content] of Object.entries({ ...defaults, ...files })) {
    await mkdir(path.dirname(path.join(directory, name)), { recursive: true })
    await writeFile(path.join(directory, name), content)
  }
}
