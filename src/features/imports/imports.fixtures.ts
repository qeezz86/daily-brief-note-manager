import type {
  ImportBundle,
  ImportCategory,
  ImportPost,
  ImportReferenceData,
} from './importValidation.types'
import {
  CONTENT_IMPORT_FORMAT,
  CONTENT_IMPORT_SCHEMA_VERSION,
} from './importValidation.constants'

export const importCategories: ImportCategory[] = [
  { id: 'economy', contentGroup: 'news', name: '경제', code: 'ECO', wrapperClass: 'daily-brief-note news-briefing economy', displayIdPattern: '#YYYY-MM-DD-ECO', slugPattern: 'economy-briefing-YYYY-MM-DD', enabled: true },
  { id: 'ai-column', contentGroup: 'ai', name: 'AI 칼럼', code: 'AI', wrapperClass: 'daily-brief-note ai-column', displayIdPattern: 'AI-###', slugPattern: 'ai-###', enabled: true },
  { id: 'info-db', contentGroup: 'info_db', name: '정보DB', code: 'INFO', wrapperClass: 'daily-brief-note info-db', displayIdPattern: '정보DB-###', slugPattern: 'info-db-###', enabled: true },
  { id: 'chinese-study', contentGroup: 'chinese', name: '중국어 학습', code: 'CHINESE', wrapperClass: 'daily-brief-note chinese-study', displayIdPattern: null, slugPattern: 'cctv-chinese-news-study-###', enabled: true },
  { id: 'disabled-news', contentGroup: 'news', name: '비활성', code: 'OFF', wrapperClass: 'daily-brief-note news-briefing disabled', displayIdPattern: '#YYYY-MM-DD-OFF', slugPattern: 'disabled-YYYY-MM-DD', enabled: false },
]

export const emptyImportReferenceData: ImportReferenceData = {
  categories: importCategories,
  posts: [],
  chineseUrls: [],
  newsTopics: [],
  existingTagKeys: [],
}

export function validNewsPost(overrides: Partial<ImportPost> = {}): ImportPost {
  const sourceUrl = 'https://example.com/articles/economy-1'
  return {
    externalKey: 'economy-2026-07-12', categoryId: 'economy', title: '경제 핵심 뉴스', summary: '오늘의 경제 흐름을 정리합니다.', slug: 'economy-briefing-2026-07-12', status: 'published', briefingDate: '2026-07-12', publishedOn: '2026-07-12', displayId: '#2026-07-12-ECO', seriesNo: null, wordpressUrl: 'https://example.org/economy-2026-07-12',
    htmlBody: `<div class="daily-brief-note news-briefing economy"><h1>경제 핵심 뉴스</h1><section id="sources"><h2>출처</h2><a href="${sourceUrl}">원문</a></section></div>`,
    seo: { representativeTitle: '경제 핵심 뉴스 정리', alternativeTitles: ['경제 흐름 1', '경제 흐름 2', '경제 흐름 3', '경제 흐름 4'], metaDescription: '가'.repeat(120), focusKeyword: '오늘 경제 뉴스' },
    image: { prompt: '전문적인 경제 뉴스 장면, 텍스트 없음', alt: '경제 시장 흐름을 보여주는 장면' },
    tags: ['금리', '환율', '물가', '금융시장', '산업동향'],
    sources: [{ sourceName: 'Example', sourceTitle: '경제 원문', sourceUrl, sourcePublishedAt: '2026-07-12T09:00:00+09:00', checkedPoint: '핵심 수치 확인' }],
    newsTracking: { topicKey: 'economy-core', updates: [{}], followups: [] },
    metadata: null,
    ...overrides,
  }
}

export function validImportBundle(posts: ImportPost[] = [validNewsPost()]): ImportBundle {
  return { format: CONTENT_IMPORT_FORMAT, schemaVersion: CONTENT_IMPORT_SCHEMA_VERSION, exportedAt: '2026-07-13T00:00:00Z', source: 'test', validationMode: 'strict', posts }
}
