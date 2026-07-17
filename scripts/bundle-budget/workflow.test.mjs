import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDirectory = path.resolve(import.meta.dirname, '../..')

async function workflowText() {
  return readFile(path.join(rootDirectory, '.github/workflows/bundle-budget.yml'), 'utf8')
}

describe('bundle budget workflow', () => {
  it('uses public CI placeholders for a production-like Supabase graph', async () => {
    const workflow = await workflowText()
    expect(workflow).toContain('VITE_SUPABASE_URL: http://127.0.0.1:54321')
    expect(workflow).toContain('VITE_SUPABASE_PUBLISHABLE_KEY: ci-public-placeholder-key')
  })

  it('does not reference secrets or privileged Supabase credentials', async () => {
    const workflow = (await workflowText()).toLowerCase()
    expect(workflow).not.toContain('${{ secrets.')
    expect(workflow).not.toContain('service_role')
    expect(workflow).not.toContain('sb_secret')
  })

  it('keeps install, build, budget, and artifact steps in order', async () => {
    const workflow = await workflowText()
    const steps = [
      'name: Install dependencies',
      'name: Build production bundle',
      'name: Check bundle budget',
      'name: Upload bundle budget report',
    ].map((name) => workflow.indexOf(name))
    expect(steps.every((index) => index >= 0)).toBe(true)
    expect(steps).toEqual([...steps].sort((left, right) => left - right))
  })

  it('keeps the existing largest chunk absolute limits', async () => {
    const config = JSON.parse(await readFile(path.join(rootDirectory, 'config/bundle-budget.json'), 'utf8'))
    expect(config.limits.largestChunk).toMatchObject({
      raw: { absolute: 256000 },
      gzip: { absolute: 76800 },
    })
  })
})
