import type { Category } from '../categories/categories.types'
import {
  PROMPT_TEMPLATE_VERSION,
  getCategoryConfigurationError,
  resolveCategoryPromptRule,
} from './categoryPromptRules'

function toPromptCategory(category: Category) {
  return {
    id: category.id,
    name: category.name,
    code: '',
    wrapperClass: category.wrapper_class,
    displayIdPattern: category.display_id_pattern,
    slugPattern: category.slug_pattern,
  }
}

export function BriefingPromptRuleSummary({
  category,
  referenceDate,
}: {
  category: Category | undefined
  referenceDate: string
}) {
  if (!category) return null
  const promptCategory = toPromptCategory(category)
  const error = getCategoryConfigurationError(promptCategory)
  if (error) return <section className="prompt-panel" aria-labelledby="applied-rules"><h2 id="applied-rules">적용 규칙</h2><p className="form-alert" role="alert">{error}</p></section>
  const rule = resolveCategoryPromptRule(promptCategory, referenceDate)
  return <section className="prompt-panel" aria-labelledby="applied-rules">
    <h2 id="applied-rules">적용 규칙</h2>
    <dl className="content-detail__metadata">
      <div><dt>템플릿</dt><dd>{rule.templateName}</dd></div>
      <div><dt>Wrapper class</dt><dd>{rule.wrapperClass}</dd></div>
      <div><dt>브리핑 ID 예시</dt><dd>{rule.briefingIdExample}</dd></div>
      <div><dt>URL slug 예시</dt><dd>{rule.slugExample}</dd></div>
      <div><dt>Template version</dt><dd>v{PROMPT_TEMPLATE_VERSION}</dd></div>
    </dl>
  </section>
}
