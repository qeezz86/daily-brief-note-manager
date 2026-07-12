import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import { NewsFollowupForm } from '../features/newsFollowups/NewsFollowupForm'
import type { NewsFollowupFormValues } from '../features/newsFollowups/newsFollowupFormSchema'
import { useNewsFollowupQuery, useUpdateNewsFollowupMutation } from '../features/newsFollowups/newsFollowups.queries'
import { supabase, type DatabaseClient } from '../shared/supabase/client'

export function NewsFollowupEditPageContent({ client = supabase, userId, followupId }: { client?: DatabaseClient | null; userId: string; followupId: string }) {
  const navigate = useNavigate(); const itemQuery = useNewsFollowupQuery(client, userId, followupId); const item = itemQuery.data; const mutation = useUpdateNewsFollowupMutation(client, userId, { id: followupId, topicId: item?.topic_id ?? '' }); const [error, setError] = useState<string | null>(null)
  if (itemQuery.isPending) return <div className="content-state" role="status">후속 확인 편집기를 불러오고 있습니다.</div>
  if (!item) return <section className="not-found"><h1>후속 확인 항목을 찾을 수 없습니다</h1><Link to="/news-followups">후속 확인 목록으로</Link></section>
  if (item.status !== 'pending' || item.topic.status === 'closed') return <section className="not-found"><h1>이 후속 항목을 수정할 수 없습니다</h1><p>처리된 항목 또는 종료된 뉴스 주제의 항목은 일반 내용을 수정할 수 없습니다.</p><Link to="/news-followups">후속 확인 목록으로</Link></section>
  async function submit(values: NewsFollowupFormValues) { setError(null); try { await mutation.mutateAsync({ checkText: values.checkText.trim(), priority: values.priority, dueDate: values.dueDate || null }); navigate(`/news-topics/${item!.topic_id}`) } catch (cause) { setError(cause instanceof Error ? cause.message : '후속 확인 항목 저장 중 오류가 발생했습니다.') } }
  return <article className="content-detail"><p className="dashboard__eyebrow">{item.topic.canonical_title}</p><h1>후속 확인 수정</h1><NewsFollowupForm initial={{ checkText: item.check_text, priority: item.priority as NewsFollowupFormValues['priority'], dueDate: item.due_date ?? '' }} pending={mutation.isPending} error={error} onSubmit={submit} /></article>
}
export function NewsFollowupEditPage() { const { user } = useAuth(); const { followupId = '' } = useParams(); return <NewsFollowupEditPageContent userId={user?.id ?? ''} followupId={followupId} /> }
