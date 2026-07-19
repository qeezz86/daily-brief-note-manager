export const POST_ID = '10000000-0000-4000-8000-000000000001'
export const USER_ID = '20000000-0000-4000-8000-000000000001'
export const SUPABASE_ORIGIN = 'https://e2e.supabase.co'

export const checkedAt = '2026-07-18T06:00:00.000Z'
const updatedAt = '2026-07-18T05:00:00.000Z'
const tagNames = ['워드프레스 연동', '콘텐츠 관리', '검색 최적화', '발행 준비', '자동화 검증']

const categoryResolution = {
  resolved: [{ localKey: 'economy', localName: '경제', termId: 1, termSlug: 'economy', termName: '경제' }],
  missing: [], ambiguous: [], stale: [],
}
const tagResolution = {
  resolved: tagNames.map((name, index) => ({ localKey: name.toLowerCase(), localName: name, termId: index + 10, termSlug: `tag-${index + 1}`, termName: name })),
  missing: [], ambiguous: [], stale: [],
}

export const sourcePost = {
  id: POST_ID,
  category_id: 'economy',
  display_id: '#20260718-ECONOMY',
  series_no: null,
  briefing_date: '2026-07-18',
  published_on: null,
  title: 'WordPress Preview E2E 콘텐츠',
  summary: '실제 브라우저에서 GET-only publication preview를 검증합니다.',
  html_body: '<div class="daily-brief-note news-briefing economy"><h1>WordPress Preview E2E</h1></div>',
  slug: 'economy-briefing-2026-07-18',
  content_status: 'ready',
  wordpress_url: null,
  image_prompt: '텍스트 없는 전문 경제 뉴스 이미지',
  image_alt: '경제 뉴스와 워드프레스 발행 준비 화면',
  image_prompt_version: 1,
  image_prompt_updated_at: updatedAt,
  created_at: '2026-07-18T04:00:00.000Z',
  updated_at: updatedAt,
}

export const sourceSeo = {
  post_id: POST_ID,
  representative_title: 'WordPress Preview E2E 대표 제목',
  alternative_titles: ['대안 1', '대안 2', '대안 3', '대안 4'],
  meta_description: 'WordPress publication preview의 브라우저 흐름과 읽기 전용 보안 경계를 검증하기 위한 결정적 E2E 메타 설명입니다.',
  focus_keyword: 'WordPress publication preview',
}

export const sourceTags = tagNames.map((name, index) => ({
  tag_id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  tags: { id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, name },
}))

const payload = {
  title: sourceSeo.representative_title,
  content: sourcePost.html_body,
  status: 'draft' as const,
  slug: sourcePost.slug,
  excerpt: sourceSeo.meta_description,
  categories: [1],
  tags: [10, 11, 12, 13, 14],
}

export const readyPlan = {
  schemaVersion: 1 as const,
  ok: true as const,
  mode: 'dry-run' as const,
  writePerformed: false as const,
  checkedAt,
  source: { contentId: POST_ID, contentType: 'news' as const, categoryId: 'economy', updatedAt, seriesId: null },
  site: { origin: 'https://wordpress.example.com' },
  taxonomy: { categories: categoryResolution, tags: tagResolution },
  duplicate: { conflict: false, matches: [] },
  payload,
  payloadFingerprint: `sha256:${'a'.repeat(64)}`,
  payloadSize: { titleBytes: 41, contentBytes: 105, excerptBytes: 170, canonicalPayloadBytes: 430 },
  readyForDraftCreation: true,
  blockers: [],
  warnings: [],
}

export const blockedPlan = {
  ...readyPlan,
  taxonomy: {
    categories: { ...categoryResolution, resolved: [], missing: [{ localKey: 'economy', localName: '경제' }] },
    tags: { ...tagResolution, resolved: tagResolution.resolved.slice(1), missing: [{ localKey: '워드프레스 연동', localName: '워드프레스 연동' }] },
  },
  duplicate: { conflict: true, matches: [{ id: 901, slug: sourcePost.slug, status: 'draft', modifiedGmt: '2026-07-18T05:30:00', link: null }] },
  readyForDraftCreation: false,
  blockers: [
    { code: 'CATEGORY_MAPPING_MISSING', message: 'WordPress 카테고리 매핑이 없습니다.' },
    { code: 'TAG_MAPPING_MISSING', message: '일부 WordPress 태그 매핑이 없습니다.' },
    { code: 'WORDPRESS_DUPLICATE_SLUG', message: '동일 slug의 WordPress 글이 이미 있습니다.' },
  ],
}

export const warningPlan = {
  ...readyPlan,
  warnings: [{
    code: 'SEO_TAG_POSSIBLE_NEAR_DUPLICATE',
    message: '서로 포함 관계인 SEO 태그가 실질적으로 겹칠 수 있습니다.',
    detail: '원문 태그 "워드프레스 연동" / "워드프레스 연동법"',
  }],
}

export const taxonomyCatalog = {
  schemaVersion: 1 as const,
  ok: true as const,
  mode: 'dry-run' as const,
  writePerformed: false as const,
  checkedAt,
  site: { origin: 'https://wordpress.example.com' },
  catalog: {
    categories: [
      { id: 1, name: '경제', slug: 'economy', parent: 0, count: 8 },
      { id: 2, name: '국제', slug: 'global', parent: 0, count: 5 },
    ],
    tags: [
      { id: 10, name: '워드프레스 연동', slug: 'wordpress-integration', count: 3 },
      { id: 11, name: '콘텐츠 관리', slug: 'content-management', count: 4 },
      { id: 12, name: 'AI 도구', slug: 'ai-tools', count: 2 },
    ],
    categoryPages: 1,
    tagPages: 1,
  },
}

export const localCategories = [
  { id: 'economy', content_group: 'news', name: '경제', sort_order: 1, display_id_pattern: '#YYYYMMDD-ECONOMY', slug_pattern: 'economy-briefing-YYYY-MM-DD', wrapper_class: 'daily-brief-note news-briefing economy' },
  { id: 'global', content_group: 'news', name: '국제', sort_order: 2, display_id_pattern: '#YYYYMMDD-GLOBAL', slug_pattern: 'global-briefing-YYYY-MM-DD', wrapper_class: 'daily-brief-note news-briefing global' },
]

export const localTags = [
  { id: '30000000-0000-4000-8000-000000000001', name: '워드프레스 연동', normalized_name: '워드프레스 연동' },
  { id: '30000000-0000-4000-8000-000000000002', name: 'AI 도구', normalized_name: 'ai 도구' },
]

export const taxonomyMappings = [
  { id: '40000000-0000-4000-8000-000000000001', site_origin: taxonomyCatalog.site.origin, mapping_kind: 'category', local_key: 'economy', wordpress_taxonomy: 'category', wordpress_term_id: 1, wordpress_term_slug: 'old-economy', wordpress_term_name: '경제', verified_at: checkedAt, created_at: checkedAt, updated_at: checkedAt },
  { id: '40000000-0000-4000-8000-000000000002', site_origin: taxonomyCatalog.site.origin, mapping_kind: 'tag', local_key: '워드프레스 연동', wordpress_taxonomy: 'post_tag', wordpress_term_id: 10, wordpress_term_slug: 'wordpress-integration', wordpress_term_name: '워드프레스 연동', verified_at: checkedAt, created_at: checkedAt, updated_at: checkedAt },
]
