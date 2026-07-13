import type { BriefingPromptCategory } from './briefingPrompts.types'

export const PROMPT_TEMPLATE_VERSION = 1 as const

export interface CategoryPromptRule {
  readonly templateName: string
  readonly researchScope: readonly string[]
  readonly sourcePriorities: readonly string[]
  readonly requiredInstructions: readonly string[]
  readonly detailedChecks: readonly string[]
}

export interface ResolvedCategoryPromptRule extends CategoryPromptRule {
  readonly categoryId: string
  readonly categoryCode: string
  readonly displayName: string
  readonly wrapperClass: string
  readonly briefingIdPattern: string
  readonly briefingIdExample: string
  readonly slugPattern: string
  readonly slugExample: string
  readonly seoTitlePattern: string
  readonly footerOrder: readonly string[]
  readonly contentNote: string
}

export const NEWS_CONTENT_NOTE = '이 글은 공개된 공식 자료와 신뢰할 수 있는 보도를 바탕으로 핵심 내용을 독립적으로 재구성한 뉴스 브리핑입니다.<br>Writer by <strong>Daily Brief Note</strong>'

export const categoryPromptRules: Readonly<Record<string, CategoryPromptRule>> = Object.freeze({
  economy: Object.freeze({
    templateName: '경제 브리핑 작성 템플릿',
    researchScope: Object.freeze(['거시경제', '금융시장', '물가', '금리', '환율', '산업', '기업', '무역', '공급망', '에너지 가격', '고용', '부동산', '경제·금융 정책']),
    sourcePriorities: Object.freeze(['정부 부처와 공공기관', '한국은행', '통계청', '금융위원회·금융감독원', '국제기구', '기업 공시·IR', '거래소', '신뢰도 높은 경제·산업 보도']),
    requiredInstructions: Object.freeze(['공식 통계의 확정치·잠정치·전망을 구분한다.', '금리·환율·증감률·금액은 기준 시점, 비교 기간, 단위를 함께 확인한다.', '시장 반응과 공식 정책 효과를 같은 사실처럼 단정하지 않는다.']),
    detailedChecks: Object.freeze(['통계의 원계열·계절조정 여부와 전년·전월 대비 기준을 확인한다.', '정책 발표, 시행일, 시장 예상과 실제 결정의 차이를 확인한다.']),
  }),
  global: Object.freeze({
    templateName: '국제 브리핑 작성 템플릿',
    researchScope: Object.freeze(['외교', '안보', '분쟁', '국제기구', '제재', '무역 갈등', '글로벌 공급망', '주요 국가 정책', '국제 법적 결정']),
    sourcePriorities: Object.freeze(['각국 정부와 공식 성명', '국제기구', '조약·협정 원문', '국제 법원·규제기관', '주요 통신사', '신뢰도 높은 국제 보도']),
    requiredInstructions: Object.freeze(['확인된 사실, 당사국의 공식 입장, 분석, 전망을 구분한다.', '분쟁 당사자의 주장을 독립적으로 검증하고 한쪽 주장만 사실로 단정하지 않는다.', '제재·협정·법적 결정의 적용 대상과 발효 시점을 확인한다.']),
    detailedChecks: Object.freeze(['현지 발표 시각과 한국 기준 시각, 사건 발생일과 보도일을 구분한다.', '번역된 고유명사·기관명·조약명의 공식 표기를 대조한다.']),
  }),
  technology: Object.freeze({
    templateName: '과학기술 브리핑 작성 템플릿',
    researchScope: Object.freeze(['AI', '반도체', '우주', '바이오', '에너지 기술', '로봇', '통신', '사이버 보안', '과학 연구', '기술 정책', '제품·서비스 발표']),
    sourcePriorities: Object.freeze(['연구 논문과 학술지', '공식 연구기관', '정부 기관', '기업 공식 발표', '제품·기술 문서', '학회 자료', '신뢰도 높은 과학·기술 전문 매체']),
    requiredInstructions: Object.freeze(['연구 단계, 시험·실증 단계, 승인 단계, 상용화를 구분한다.', '성능 수치는 데이터셋·시험 환경·비교 기준이 같은지 확인한다.', '예고된 미래 기능을 현재 제공되는 기능처럼 쓰지 않는다.']),
    detailedChecks: Object.freeze(['동료평가 논문, 프리프린트, 보도자료의 증거 수준을 구분한다.', '제품 발표일, 실제 출시일, 지원 지역과 이용 조건을 확인한다.']),
  }),
  society: Object.freeze({
    templateName: '사회 브리핑 작성 템플릿',
    researchScope: Object.freeze(['노동', '교육', '보건', '안전', '재난', '주거', '교통', '사법', '복지', '인구', '생활 정책', '사회적 사건']),
    sourcePriorities: Object.freeze(['정부 기관', '지방자치단체', '경찰·소방', '법원', '공공기관', '공식 통계', '신뢰도 높은 보도']),
    requiredInstructions: Object.freeze(['피해 규모·사망·부상 등 민감 수치는 최신 공식 발표를 기준으로 한다.', '확인된 피해와 추정 피해, 신고와 수사 결과를 구분한다.', '피해자 개인정보와 불필요하게 자극적인 묘사를 배제한다.']),
    detailedChecks: Object.freeze(['속보 수치가 정정되었는지 최신 기관 발표를 다시 확인한다.', '법원 판단은 심급, 선고일, 확정 여부를 구분한다.']),
  }),
  'climate-energy': Object.freeze({
    templateName: '환경·에너지 브리핑 작성 템플릿',
    researchScope: Object.freeze(['기후', '탄소', '전력', '재생에너지', '원전', '석유·가스', '환경 정책', '오염', '생물다양성', '자연자본', '기상·재난', '에너지 공급망']),
    sourcePriorities: Object.freeze(['환경부', '산업통상자원부', '기상청', '전력·에너지 공공기관', '국제에너지기구(IEA)', 'IPCC', 'UN 기관', '공식 통계', '연구기관']),
    requiredInstructions: Object.freeze(['전력·온실가스·기온·재난 수치의 단위와 기준 기간을 확인한다.', '기상 현상과 기후 변화의 인과관계를 근거 없이 과장하지 않는다.', '발전 설비용량, 발전량, 전력 비중처럼 의미가 다른 지표를 구분한다.']),
    detailedChecks: Object.freeze(['관측값·예보·시나리오와 잠정·확정 통계를 구분한다.', '배출량의 범위, 기준연도, CO2와 CO2e 단위를 확인한다.']),
  }),
})

export function getCategoryPromptRule(categoryId: string): CategoryPromptRule {
  const rule = categoryPromptRules[categoryId]
  if (!rule) throw new Error(`지원하지 않는 뉴스 카테고리입니다: ${categoryId || '없음'}`)
  return rule
}

export function applyPromptDatePattern(pattern: string, referenceDate: string): string {
  const [year, month, day] = referenceDate.split('-')
  return pattern.replaceAll('YYYY', year).replaceAll('MM', month).replaceAll('DD', day)
}

export function getCategoryConfigurationError(category: Pick<BriefingPromptCategory, 'id' | 'wrapperClass' | 'displayIdPattern' | 'slugPattern'>): string | null {
  try {
    getCategoryPromptRule(category.id)
  } catch (error) {
    return error instanceof Error ? error.message : '지원하지 않는 뉴스 카테고리입니다.'
  }
  if (!category.wrapperClass.trim()) return '카테고리 wrapper class가 설정되지 않았습니다.'
  if (!category.displayIdPattern?.trim()) return '카테고리 브리핑 ID 패턴이 설정되지 않았습니다.'
  if (!category.slugPattern.trim()) return '카테고리 URL slug 패턴이 설정되지 않았습니다.'
  return null
}

export function resolveCategoryPromptRule(
  category: BriefingPromptCategory,
  referenceDate: string,
): ResolvedCategoryPromptRule {
  const configurationError = getCategoryConfigurationError(category)
  if (configurationError) throw new Error(configurationError)
  const rule = getCategoryPromptRule(category.id)
  const briefingIdPattern = category.displayIdPattern as string
  return Object.freeze({
    ...rule,
    categoryId: category.id,
    categoryCode: category.code,
    displayName: category.name,
    wrapperClass: category.wrapperClass,
    briefingIdPattern,
    briefingIdExample: applyPromptDatePattern(briefingIdPattern, referenceDate),
    slugPattern: category.slugPattern,
    slugExample: applyPromptDatePattern(category.slugPattern, referenceDate),
    seoTitlePattern: `[핵심 이슈 1], [핵심 이슈 2] - ${formatKoreanDate(referenceDate)} ${category.name} 브리핑｜`,
    footerOrder: Object.freeze(['출처 및 참고자료', `이전 ${category.name} 브리핑`, 'content-note']),
    contentNote: NEWS_CONTENT_NOTE,
  })
}

function formatKoreanDate(referenceDate: string): string {
  const [year, month, day] = referenceDate.split('-').map(Number)
  return `${year}년 ${month}월 ${day}일`
}
