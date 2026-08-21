import { describe, expect, it } from 'vitest'
import { extractResponseImportSources, inspectResponseImportHtmlSecurity, normalizeResponseImportText } from './responseImportHtml'

describe('responseImportHtml', () => {
  it('extracts only requested inert source sections and can preserve duplicate rows', () => {
    const document = new DOMParser().parseFromString(`<div><section id="sources"><p data-source-name="기관" data-checked-point="확인"><a href="https://example.com/a/#part">제목</a></p><p data-source-name="기관" data-checked-point="확인"><a href="https://example.com/a/">제목</a></p></section><section id="source-check"><a href="https://cctv.com/item">CCTV</a></section></div>`, 'text/html')
    expect(extractResponseImportSources(document)).toHaveLength(2)
    expect(extractResponseImportSources(document, { includeSourceCheck: true, deduplicateByUrl: true })).toHaveLength(2)
  })

  it('finds executable elements, event/style/form attributes, active schemes, and template content', () => {
    const document = new DOMParser().parseFromString('<div onclick="x" style="x"><a href=" javascript:alert(1)" ping="x">x</a><template><iframe src="x"></iframe></template></div>', 'text/html')
    const findings = inspectResponseImportHtmlSecurity(document)
    expect(findings.map((item) => item.kind)).toEqual(expect.arrayContaining(['element', 'attribute', 'active-url-scheme']))
    expect(findings.map((item) => item.value)).toEqual(expect.arrayContaining(['iframe', 'onclick', 'style', 'ping']))
  })

  it('normalizes extracted text without changing URL helpers', () => {
    expect(normalizeResponseImportText('  여러\n\t공백  ')).toBe('여러 공백')
  })
})
