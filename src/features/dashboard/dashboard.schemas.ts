import type { DashboardOverviewData } from './dashboard.types'

const uuidPattern = /^(?:[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}|0{8}-0{4}-0{4}-0{4}-0{12}|f{8}-f{4}-f{4}-f{4}-f{12})$/i
const timestampPattern = /^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|([+-](?:[01]\d|2[0-3]):[0-5]\d)))$/
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/

function assert(condition: boolean): asserts condition {
  if (!condition) {
    throw new Error('대시보드 데이터 형식이 올바르지 않습니다.')
  }
}

function strictFields(
  value: unknown,
  keys: readonly string[],
): unknown[] {
  assert(typeof value === 'object' && value !== null && !Array.isArray(value))
  assert(
    Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key)),
  )

  return keys.map((key) => Reflect.get(value, key))
}

function assertArray(value: unknown): asserts value is unknown[] {
  assert(Array.isArray(value))
}

function assertNonemptyString(value: unknown): asserts value is string {
  assert(typeof value === 'string' && value.length > 0)
}

function assertInteger(
  value: unknown,
  minimum: number,
): asserts value is number {
  assert(
    typeof value === 'number'
    && Number.isInteger(value)
    && value >= minimum,
  )
}

function assertPattern(
  value: unknown,
  pattern: RegExp,
): asserts value is string {
  assert(typeof value === 'string' && pattern.test(value))
}

function assertContentStatus(
  value: unknown,
): asserts value is 'draft' | 'ready' | 'published' | 'archived' {
  assert(
    value === 'draft'
    || value === 'ready'
    || value === 'published'
    || value === 'archived',
  )
}

export const dashboardRecentLimitSchema = {
  parse(value: unknown) {
    assert(
      typeof value === 'number'
      && Number.isInteger(value)
      && value >= 1
      && value <= 10,
    )

    return value
  },
}

export function parseDashboardOverview(value: unknown): DashboardOverviewData {
  const [
    schemaVersion,
    countsValue,
    categoryCounts,
    recentPosts,
    recentPromptRuns,
  ] = strictFields(
    value,
    [
      'schema_version',
      'counts',
      'category_counts',
      'recent_posts',
      'recent_prompt_runs',
    ],
  )
  assert(schemaVersion === 1)

  const [
    totalPosts,
    readyPosts,
    activeNewsTopics,
    pendingNewsFollowups,
  ] = strictFields(
    countsValue,
    [
      'total_posts',
      'ready_posts',
      'active_news_topics',
      'pending_news_followups',
    ],
  )
  assertInteger(totalPosts, 0)
  assertInteger(readyPosts, 0)
  assertInteger(activeNewsTopics, 0)
  assertInteger(pendingNewsFollowups, 0)

  assertArray(categoryCounts)
  const parsedCategoryCounts = categoryCounts.map((category) => {
    const [categoryId, categoryName, postCount] = strictFields(
      category,
      ['category_id', 'category_name', 'post_count'],
    )
    assertNonemptyString(categoryId)
    assertNonemptyString(categoryName)
    assertInteger(postCount, 0)

    return {
      categoryId,
      categoryName,
      postCount,
    }
  })

  assertArray(recentPosts)
  const parsedRecentPosts = recentPosts.map((post) => {
    const [id, title, categoryId, contentStatus, updatedAt] = strictFields(
      post,
      ['id', 'title', 'category_id', 'content_status', 'updated_at'],
    )
    assertPattern(id, uuidPattern)
    assertNonemptyString(title)
    assertNonemptyString(categoryId)
    assertContentStatus(contentStatus)
    assertPattern(updatedAt, timestampPattern)

    return {
      id,
      title,
      categoryId,
      contentStatus,
      updatedAt,
    }
  })

  assertArray(recentPromptRuns)
  const parsedRecentPromptRuns = recentPromptRuns.map((run) => {
    const [
      id,
      categoryId,
      referenceDate,
      requestedPostCount,
      actualPostCount,
      generatedAt,
    ] = strictFields(
      run,
      [
        'id',
        'category_id',
        'reference_date',
        'requested_post_count',
        'actual_post_count',
        'generated_at',
      ],
    )
    assertPattern(id, uuidPattern)
    assertNonemptyString(categoryId)
    assertPattern(referenceDate, dateOnlyPattern)
    assertInteger(requestedPostCount, 1)
    assertInteger(actualPostCount, 0)
    assertPattern(generatedAt, timestampPattern)

    return {
      id,
      categoryId,
      referenceDate,
      requestedPostCount,
      actualPostCount,
      generatedAt,
    }
  })

  return {
    schemaVersion: 1,
    counts: {
      totalPosts,
      readyPosts,
      activeNewsTopics,
      pendingNewsFollowups,
    },
    categoryCounts: parsedCategoryCounts,
    recentPosts: parsedRecentPosts,
    recentPromptRuns: parsedRecentPromptRuns,
  }
}
