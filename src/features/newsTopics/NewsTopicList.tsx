import { Link } from 'react-router-dom'
import type { Category } from '../categories/categories.types'
import { newsTopicStatusLabels, type NewsTopic, type NewsTopicStatus } from './newsTopics.types'

function status(value: string) { return newsTopicStatusLabels[value as NewsTopicStatus] ?? value }
function dateTime(value: string) { return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' }).format(new Date(value)) }

export function NewsTopicList({ topics, categories }: { topics: NewsTopic[]; categories: Category[] }) {
  const names = new Map(categories.map((item) => [item.id, item.name]))
  return <ul className="content-list" aria-label="뉴스 주제 목록">{topics.map((topic) => <li key={topic.id}><article className="content-card"><div className="content-card__heading"><div><p className="content-card__category">{names.get(topic.category_id) ?? '알 수 없는 카테고리'}</p><h2><Link to={`/news-topics/${topic.id}`}>{topic.canonical_title}</Link></h2></div><span className={`status-badge status-badge--${topic.status}`}>{status(topic.status)}</span></div><dl className="content-card__details"><div><dt>주제 키</dt><dd>{topic.topic_key}</dd></div><div><dt>최초 확인</dt><dd>{topic.first_seen_at}</dd></div><div><dt>최근 확인</dt><dd>{topic.last_seen_at}</dd></div><div><dt>최근 수정</dt><dd>{dateTime(topic.updated_at)}</dd></div>{topic.closed_reason ? <div className="content-detail__wide"><dt>종료 사유</dt><dd>{topic.closed_reason}</dd></div> : null}</dl></article></li>)}</ul>
}
