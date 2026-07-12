import type { NewsTopic, NewsTopicStatus } from './newsTopics.types'

export function filterNewsTopics(topics: NewsTopic[], filter: { categoryId: string; status: NewsTopicStatus | ''; search: string }) {
  const search = filter.search.trim().toLocaleLowerCase('ko-KR')
  return topics.filter((topic) => (!filter.categoryId || topic.category_id === filter.categoryId) && (!filter.status || topic.status === filter.status) && (!search || topic.canonical_title.toLocaleLowerCase('ko-KR').includes(search) || topic.topic_key.toLocaleLowerCase('ko-KR').includes(search)))
}
