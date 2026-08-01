import { beforeEach, describe, expect, it, vi } from 'vitest'
import { backupSnapshotFixture } from './backups.fixtures'
import { buildBackupBundle } from './buildBackupBundle'
import {
  BACKUP_CSV_DATASETS,
  createBackupCsvFileName,
  serializeBackupCsv,
} from './backupCsv'
import type { BuiltBackup } from './backup.types'

const EXPORTED_AT = new Date('2026-07-15T06:30:00Z')

async function verifiedBackup(): Promise<BuiltBackup> {
  return buildBackupBundle(backupSnapshotFixture(), { now: EXPORTED_AT })
}

describe('backup CSV review exports', () => {
  let backup: BuiltBackup

  beforeEach(async () => {
    backup = await verifiedBackup()
  })

  it('네 dataset descriptor와 public serializer mapping을 정확한 순서로 제공한다', () => {
    expect(BACKUP_CSV_DATASETS.map(({ id, collection, fileNameId }) => ({ id, collection, fileNameId }))).toEqual([
      { id: 'posts', collection: 'posts', fileNameId: 'posts' },
      { id: 'news_topics', collection: 'newsTopics', fileNameId: 'news-topics' },
      { id: 'follow_ups', collection: 'newsFollowups', fileNameId: 'follow-ups' },
      { id: 'sources', collection: 'sources', fileNameId: 'sources' },
    ])
    for (const { id, columns } of BACKUP_CSV_DATASETS) {
      expect(serializeBackupCsv(backup, id).split('\r\n')[0]).toBe(`\uFEFF${columns.join(',')}`)
    }
  })

  it('posts 열 allowlist와 순서를 고정한다', () => {
    expect(BACKUP_CSV_DATASETS[0].columns).toEqual([
      'id', 'categoryId', 'seriesNo', 'briefingDate', 'publishedOn', 'displayId',
      'title', 'summary', 'htmlBody', 'slug', 'wordpressUrl', 'contentStatus',
      'publishedAt', 'sourceImportType', 'imagePrompt', 'imageAlt',
      'imagePromptVersion', 'imagePromptUpdatedAt', 'createdAt', 'updatedAt',
    ])
  })

  it('news topics 열 allowlist와 순서를 고정한다', () => {
    expect(BACKUP_CSV_DATASETS[1].columns).toEqual([
      'id', 'categoryId', 'topicKey', 'canonicalTitle', 'topicSummary', 'status',
      'closedReason', 'firstSeenAt', 'lastSeenAt', 'createdAt', 'updatedAt',
    ])
  })

  it('follow-ups 열 allowlist와 순서를 고정한다', () => {
    expect(BACKUP_CSV_DATASETS[2].columns).toEqual([
      'id', 'topicId', 'checkText', 'status', 'dueDate', 'priority',
      'resolutionNote', 'resolvedAt', 'createdAt', 'updatedAt',
    ])
  })

  it('sources 열 allowlist와 순서를 고정한다', () => {
    expect(BACKUP_CSV_DATASETS[3].columns).toEqual([
      'id', 'postId', 'newsUpdateId', 'sourceName', 'sourceTitle', 'sourceUrl',
      'sourcePublishedAt', 'checkedAt', 'checkedPoint', 'sortOrder', 'createdAt',
      'updatedAt',
    ])
  })

  it('unknown, owner, 인증과 session 필드를 내보내지 않는다', () => {
    Object.assign(backup.bundle.data.posts[0], {
      unknownField: 'not-exported', owner_id: 'private-owner', accessToken: 'private-token', session: 'private-session',
    })
    const csv = serializeBackupCsv(backup, 'posts')
    expect(csv).not.toMatch(/unknownField|not-exported|owner_id|private-owner|accessToken|private-token|session|private-session/u)
  })

  it('BOM, exact header, CRLF와 final newline을 사용한다', () => {
    const csv = serializeBackupCsv(backup, 'posts')
    expect(csv.startsWith(`\uFEFF${BACKUP_CSV_DATASETS[0].columns.join(',')}\r\n`)).toBe(true)
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(csv.replace(/\r\n/gu, '')).not.toContain('\n')
  })

  it('empty dataset은 BOM과 header 한 줄만 만든다', () => {
    backup.bundle.data.sources = []
    expect(serializeBackupCsv(backup, 'sources')).toBe(`\uFEFF${BACKUP_CSV_DATASETS[3].columns.join(',')}\r\n`)
  })

  it('snapshot row 순서를 정렬 없이 보존한다', () => {
    const first = { ...backup.bundle.data.posts[0], id: 'first', title: '첫째' }
    const second = { ...backup.bundle.data.posts[0], id: 'second', title: '둘째' }
    backup.bundle.data.posts = [second, first]
    const lines = serializeBackupCsv(backup, 'posts').split('\r\n')
    expect(lines[1].startsWith('second,')).toBe(true)
    expect(lines[2].startsWith('first,')).toBe(true)
  })

  it('comma가 있는 cell을 quote한다', () => {
    backup.bundle.data.posts[0].title = '경제,뉴스'
    expect(serializeBackupCsv(backup, 'posts')).toContain('"경제,뉴스"')
  })

  it('double quote를 두 번 써서 escape한다', () => {
    backup.bundle.data.posts[0].title = '"경제"'
    expect(serializeBackupCsv(backup, 'posts')).toContain('"""경제"""')
  })

  it('CR과 LF가 있는 multiline cell을 quote한다', () => {
    backup.bundle.data.posts[0].summary = '첫 줄\r\n둘째 줄'
    expect(serializeBackupCsv(backup, 'posts')).toContain('"첫 줄\r\n둘째 줄"')
  })

  it('empty string, null과 undefined를 empty cell로 만든다', () => {
    backup.bundle.data.posts[0].summary = ''
    backup.bundle.data.posts[0].htmlBody = undefined
    backup.bundle.data.posts[0].publishedAt = null
    backup.bundle.data.posts[0].wordpressUrl = undefined
    const row = serializeBackupCsv(backup, 'posts').split('\r\n')[1]
    expect(row).toContain('게시물,,,economy-briefing-2026-07-15,,published,')
  })

  it('boolean을 lowercase text로 만든다', () => {
    backup.bundle.data.sources[0].checkedPoint = true
    expect(serializeBackupCsv(backup, 'sources')).toContain(',true,')
  })

  it('finite number와 음수 number를 locale-independent하게 보존한다', () => {
    backup.bundle.data.sources[0].sortOrder = -10
    expect(serializeBackupCsv(backup, 'sources')).toContain(',-10,')
  })

  it('source timestamp string을 그대로 보존한다', () => {
    expect(serializeBackupCsv(backup, 'sources')).toContain('2026-07-14T00:00:00Z')
  })

  it('JSON-compatible array와 object를 compact JSON으로 만든다', () => {
    backup.bundle.data.posts[0].summary = ['하나', 2]
    backup.bundle.data.posts[0].htmlBody = { safe: true }
    const csv = serializeBackupCsv(backup, 'posts')
    expect(csv).toContain('"[""하나"",2]"')
    expect(csv).toContain('"{""safe"":true}"')
  })

  it('=, +, -, @ formula text 앞에 apostrophe를 붙인다', () => {
    for (const value of ['=SUM(A1:A2)', '+CMD', '-10', '@mention']) {
      backup.bundle.data.posts[0].title = value
      expect(serializeBackupCsv(backup, 'posts')).toContain(`'${value}`)
    }
  })

  it('leading whitespace, tab, CR과 LF formula 우회를 차단한다', () => {
    for (const value of [' +CMD', '\tcommand', '\rcommand', '\ncommand']) {
      backup.bundle.data.posts[0].title = value
      expect(serializeBackupCsv(backup, 'posts')).toContain(`'${value}`)
    }
  })

  it('일반 URL과 한국어·중국어 text는 바꾸지 않는다', () => {
    backup.bundle.data.posts[0].title = '한국어 中文'
    backup.bundle.data.posts[0].wordpressUrl = 'https://example.com/article'
    const csv = serializeBackupCsv(backup, 'posts')
    expect(csv).toContain('한국어 中文')
    expect(csv).toContain('https://example.com/article')
    expect(csv).not.toContain("'한국어")
  })

  it('source object를 변경하지 않고 반복 결과가 동일하다', () => {
    const before = JSON.stringify(backup.bundle.data.posts)
    const first = serializeBackupCsv(backup, 'posts')
    expect(serializeBackupCsv(backup, 'posts')).toBe(first)
    expect(JSON.stringify(backup.bundle.data.posts)).toBe(before)
  })

  it('non-finite number, bigint, symbol, function과 Date를 redacted error로 차단한다', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, 1n, Symbol('unsafe'), () => 'unsafe', new Date()]) {
      backup.bundle.data.posts[0].title = value
      expect(() => serializeBackupCsv(backup, 'posts')).toThrow('CSV에 지원되지 않는 값이 있습니다.')
    }
  })

  it('cyclic object를 차단하고 payload를 오류에 포함하지 않는다', () => {
    const cyclic: Record<string, unknown> = { privateValue: 'do-not-render' }
    cyclic.self = cyclic
    backup.bundle.data.posts[0].title = cyclic
    expect(() => serializeBackupCsv(backup, 'posts')).toThrow('CSV에 지원되지 않는 값이 있습니다.')
    try {
      serializeBackupCsv(backup, 'posts')
    } catch (error) {
      expect(String(error)).not.toContain('do-not-render')
    }
  })

  it('네 dataset의 exact safe filename을 snapshot date로 만든다', () => {
    const expectedNames = [
      ['posts', 'daily-brief-note-posts-2026-07-15-153000.csv'],
      ['news_topics', 'daily-brief-note-news-topics-2026-07-15-153000.csv'],
      ['follow_ups', 'daily-brief-note-follow-ups-2026-07-15-153000.csv'],
      ['sources', 'daily-brief-note-sources-2026-07-15-153000.csv'],
    ] as const
    for (const [datasetId, expected] of expectedNames) {
      expect(createBackupCsvFileName(backup, datasetId)).toBe(expected)
    }
  })

  it('current clock과 무관하게 bundle exportedAt을 파일명 날짜로 사용한다', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2040-01-01T00:00:00Z'))
    expect(createBackupCsvFileName(backup, 'posts')).toBe('daily-brief-note-posts-2026-07-15-153000.csv')
    vi.useRealTimers()
  })

  it('네 dataset을 동일 입력에서 결정적으로 직렬화한다', () => {
    for (const { id } of BACKUP_CSV_DATASETS) {
      expect(serializeBackupCsv(backup, id)).toBe(serializeBackupCsv(backup, id))
    }
  })
})
