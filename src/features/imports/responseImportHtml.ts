import { isHttpUrl, normalizeSourceUrl } from '../posts/publicationFields'

export interface ResponseImportSourceCandidate {
  sourceName: string
  sourceTitle: string
  sourceUrl: string
  sourcePublishedAt: string
  checkedPoint: string
}

export interface ResponseImportHtmlSecurityFinding {
  kind: 'element' | 'attribute' | 'active-url-scheme'
  value: string
}

const prohibitedElements = ['script', 'iframe', 'object', 'embed', 'form', 'style', 'link', 'meta', 'base']
const prohibitedAttributes = new Set(['style', 'srcdoc', 'action', 'formaction', 'formmethod', 'formenctype', 'formtarget', 'ping'])
const urlAttributes = new Set(['href', 'src', 'xlink:href', 'action', 'formaction'])
const activeSchemePattern = /^\s*(?:javascript|data|vbscript):/iu

export function normalizeResponseImportText(value: string) {
  return value.trim().replace(/\s+/gu, ' ')
}

function labelValue(root: ParentNode, labels: string[]) {
  for (const node of Array.from(root.querySelectorAll('tr, li, p, div, dt, dd'))) {
    if (node.tagName === 'TR') {
      const cells = Array.from(node.querySelectorAll(':scope > th, :scope > td'))
      const key = normalizeResponseImportText(cells[0]?.textContent ?? '').replace(/[:：]$/u, '')
      if (labels.includes(key) && cells[1]) return normalizeResponseImportText(cells[1].textContent ?? '')
    }
    if (node.tagName === 'DT') {
      const key = normalizeResponseImportText(node.textContent ?? '').replace(/[:：]$/u, '')
      const sibling = node.nextElementSibling
      if (labels.includes(key) && sibling?.tagName === 'DD') return normalizeResponseImportText(sibling.textContent ?? '')
    }
    const text = normalizeResponseImportText(node.textContent ?? '')
    for (const label of labels) {
      if (text.startsWith(`${label}:`) || text.startsWith(`${label}：`)) return text.slice(label.length + 1).trim()
    }
  }
  return ''
}

function sourceFromAnchor(anchor: HTMLAnchorElement): ResponseImportSourceCandidate {
  const container = anchor.closest<HTMLElement>('[data-source-name], li, tr, p, div') ?? anchor
  return {
    sourceName: container.dataset.sourceName?.trim() ?? labelValue(container, ['출처 기관', '기관', '출처명']),
    sourceTitle: container.dataset.sourceTitle?.trim() ?? normalizeResponseImportText(anchor.textContent ?? ''),
    sourceUrl: anchor.getAttribute('href')?.trim() ?? '',
    sourcePublishedAt: container.dataset.sourcePublishedAt?.trim() ?? labelValue(container, ['게시·업데이트 시각', '게시 시각', '업데이트 시각']),
    checkedPoint: container.dataset.checkedPoint?.trim() ?? labelValue(container, ['확인한 핵심 사실', '확인한 내용', '확인 포인트']),
  }
}

export function extractResponseImportSources(
  document: Document,
  options: { includeSourceCheck?: boolean; deduplicateByUrl?: boolean } = {},
): ResponseImportSourceCandidate[] {
  const selectors = options.includeSourceCheck ? '#sources, #source-check' : '#sources'
  const candidates: ResponseImportSourceCandidate[] = []
  for (const section of Array.from(document.querySelectorAll<HTMLElement>(selectors))) {
    const anchors = Array.from(section.querySelectorAll<HTMLAnchorElement>('a[href]'))
    if (section.id === 'source-check') {
      const anchor = anchors[0]
      const labelledUrl = labelValue(section, ['개별 원문 URL', '원문 URL', '출처 URL'])
      candidates.push({
        sourceName: labelValue(section, ['출처 기관', '기관', '출처명']),
        sourceTitle: labelValue(section, ['원문 제목', '출처 제목']) || normalizeResponseImportText(anchor?.textContent ?? ''),
        sourceUrl: isHttpUrl(labelledUrl) ? labelledUrl : anchor?.getAttribute('href')?.trim() || labelledUrl,
        sourcePublishedAt: labelValue(section, ['게시·업데이트 시각', '게시 시각', '업데이트 시각']),
        checkedPoint: labelValue(section, ['확인한 핵심 사실', '확인한 내용', '확인 포인트']),
      })
    } else {
      anchors.forEach((anchor) => candidates.push(sourceFromAnchor(anchor)))
    }
  }
  if (!options.deduplicateByUrl) return candidates
  const unique = new Map<string, ResponseImportSourceCandidate>()
  candidates.forEach((candidate, index) => {
    const key = candidate.sourceUrl ? normalizeSourceUrl(candidate.sourceUrl) : `empty-${index}`
    if (!unique.has(key)) unique.set(key, candidate)
  })
  return [...unique.values()]
}

export function inspectResponseImportHtmlSecurity(root: ParentNode): ResponseImportHtmlSecurityFinding[] {
  const findings: ResponseImportHtmlSecurityFinding[] = []
  prohibitedElements.forEach((tag) => {
    if (root.querySelector(tag)) findings.push({ kind: 'element', value: tag })
  })
  Array.from(root.querySelectorAll<HTMLElement>('*')).forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLocaleLowerCase('en-US')
      if (name.startsWith('on') || prohibitedAttributes.has(name)) findings.push({ kind: 'attribute', value: attribute.name })
      if (urlAttributes.has(name) && activeSchemePattern.test(attribute.value)) findings.push({ kind: 'active-url-scheme', value: attribute.value })
    }
    if (element instanceof HTMLTemplateElement) findings.push(...inspectResponseImportHtmlSecurity(element.content))
  })
  return findings
}
