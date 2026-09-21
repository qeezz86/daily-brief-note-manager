import { afterEach, describe, expect, it, vi } from 'vitest'
import { isPublicationTimestamp, publicationDateTimeInput, publicationTimestamp, preservePublicationTimestamp, sourceTimeZone } from './publicationDates'

afterEach(() => vi.unstubAllEnvs())

describe('publication dates', () => {
  it.each(['UTC', 'America/Los_Angeles', 'Asia/Seoul'])('ignores the host zone %s', (zone) => {
    vi.stubEnv('TZ', zone)
    expect(publicationTimestamp('2026-09-16T00:30', 'Asia/Seoul')).toBe('2026-09-15T15:30:00Z')
    expect(publicationTimestamp('2026-09-16T00:30', 'Asia/Shanghai')).toBe('2026-09-15T16:30:00Z')
    expect(publicationDateTimeInput('2026-09-15T16:30:45.123456Z', 'Asia/Seoul')).toBe('2026-09-16T01:30:45.123')
    expect(publicationDateTimeInput('2026-09-15T16:30:45.123456Z', 'Asia/Shanghai')).toBe('2026-09-16T00:30:45.123')
  })
  it.each(['2026-09-16T00:30:12.123456+08:00', '2026-09-15T16:30:12.123456Z'])('preserves explicit offsets and precision: %s', (timestamp) => {
    expect(publicationTimestamp(timestamp, 'Asia/Seoul')).toBe(timestamp)
  })
  it('round trips unchanged timestamps including microseconds', () => {
    const original = '2026-09-15T16:30:45.123456+00:00'
    for (const zone of ['Asia/Seoul', 'Asia/Shanghai'] as const) {
      expect(preservePublicationTimestamp(publicationDateTimeInput(original, zone), original, zone)).toBe(original)
      expect(preservePublicationTimestamp('', original, zone)).toBe('')
    }
    expect(publicationTimestamp('2026-09-16T01:30:45.123', 'Asia/Seoul')).toBe('2026-09-15T16:30:45.123Z')
    expect(preservePublicationTimestamp('2026-09-16T12:00', original, 'Asia/Seoul')).toBe('2026-09-16T12:00')
  })
  it.each(['2026-02-30T12:00', '2026-09-16', '2026-09-16T24:00', '2026-09-16T12:60', 'invalid', '2026-09-16T12:00+99:00'])('rejects invalid and date-only timestamps: %s', (value) => {
    expect(isPublicationTimestamp(value, 'Asia/Seoul')).toBe(false)
    expect(() => publicationTimestamp(value, 'Asia/Seoul')).toThrow()
  })
  it('uses historical IANA offsets and rejects nonexistent local times', () => {
    expect(publicationTimestamp('1988-07-01T12:00', 'Asia/Seoul')).toBe('1988-07-01T02:00:00Z')
    expect(isPublicationTimestamp('1988-05-08T02:30', 'Asia/Seoul')).toBe(false)
    for (const original of ['1988-10-08T16:30:00Z', '1988-10-08T17:30:00Z']) {
      expect(preservePublicationTimestamp('1988-10-09T02:30', original, 'Asia/Seoul')).toBe(original)
    }
  })
  it('handles midnight, leap days and empty values', () => {
    expect(publicationDateTimeInput('2028-02-28T15:00:00Z', 'Asia/Seoul')).toBe('2028-02-29T00:00')
    expect(publicationTimestamp('2028-02-29T00:00', 'Asia/Seoul')).toBe('2028-02-28T15:00:00Z')
    expect(publicationTimestamp('', 'Asia/Seoul')).toBeNull()
    expect(publicationDateTimeInput(null, 'Asia/Shanghai')).toBe('')
  })
  it.each([
    ['https://news.cctv.com/a/1', 'Asia/Shanghai'],
    ['https://tv.cctv.cn/video/1', 'Asia/Shanghai'],
    ['https://cctv.com.evil.test/a/1', 'Asia/Seoul'],
    ['https://example.com/a/1', 'Asia/Seoul'],
    ['', 'Asia/Seoul'],
  ] as const)('chooses the source zone for %s', (url, zone) => {
    expect(sourceTimeZone(url)).toBe(zone)
  })
})
