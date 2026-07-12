import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import { NewsFollowupForm } from '../features/newsFollowups/NewsFollowupForm'
import type { NewsFollowupFormValues } from '../features/newsFollowups/newsFollowupFormSchema'
import { useCreateNewsFollowupMutation } from '../features/newsFollowups/newsFollowups.queries'
import { useNewsTopicQuery } from '../features/newsTopics/newsTopics.queries'
import { supabase, type DatabaseClient } from '../shared/supabase/client'

export function NewsFollowupCreatePageContent({ client = supabase, userId, topicId }: { client?: DatabaseClient | null; userId: string; topicId: string }) {
  const navigate = useNavigate(); const topicQuery = useNewsTopicQuery(client, userId, topicId); const mutation = useCreateNewsFollowupMutation(client, userId); const [error, setError] = useState<string | null>(null)
  if (topicQuery.isPending) return <div className="content-state" role="status">후속 확인 편집기를 불러오고 있습니다.</div>
  const topic = topicQuery.data
  if (!topic) return <section className="not-found"><h1>뉴스 주제를 찾을 수 없습니다</h1><Link to="/news-topics">뉴스 주제 목록으로</Link></section>
  if (topic.status === 'closed') return <section className="not-found"><h1>후속 확인을 추가할 수 없습니다</h1><p>종료된 뉴스 주제에는 새 후속 항목을 추가할 수 없습니다.</p><Link to={`/news-topics/${topic.id}`}>뉴스 주제로 돌아가기</Link></section>
  async function submit(values: NewsFollowupFormValues) { setError(null); try { await mutation.mutateAsync({ topicId, checkText: values.checkText.trim(), priority: values.priority, dueDate: values.dueDate || null }); navigate(`/news-topics/${topicId}`) } catch (cause) { setError(cause instanceof Error ? cause.message : '후속 확인 항목 저장 중 오류가 발생했습니다.') } }
  return <article className="content-detail"><p className="dashboard__eyebrow">{topic.canonical_title}</p><h1>후속 확인 추가</h1><NewsFollowupForm pending={mutation.isPending} error={error} onSubmit={submit} /></article>
}
export function NewsFollowupCreatePage() { const { user } = useAuth(); const { topicId = '' } = useParams(); return <NewsFollowupCreatePageContent userId={user?.id ?? ''} topicId={topicId} /> }

