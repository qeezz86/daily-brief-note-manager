import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import { useActiveCategoriesQuery } from '../features/categories/categories.queries'
import { NewsTopicForm } from '../features/newsTopics/NewsTopicForm'
import type { EditNewsTopicFormValues } from '../features/newsTopics/newsTopicFormSchema'
import { useNewsTopicQuery, useUpdateNewsTopicMutation } from '../features/newsTopics/newsTopics.queries'
import { supabase, type DatabaseClient } from '../shared/supabase/client'

export function NewsTopicEditPageContent({ client = supabase, userId, topicId }: { client?: DatabaseClient | null; userId: string; topicId: string }) {
  const navigate = useNavigate(); const [error, setError] = useState<string | null>(null); const topicQuery = useNewsTopicQuery(client, userId, topicId); const categoriesQuery = useActiveCategoriesQuery(client); const mutation = useUpdateNewsTopicMutation(client, userId, topicId)
  if (topicQuery.isPending || categoriesQuery.isPending) return <div className="content-state" role="status">뉴스 주제를 불러오고 있습니다.</div>
  if (topicQuery.isError || categoriesQuery.isError) return <div className="content-state content-state--error" role="alert"><h1>뉴스 주제를 불러오지 못했습니다</h1></div>
  if (!topicQuery.data) return <section className="not-found"><h1>뉴스 주제를 찾을 수 없습니다</h1><p>주소가 올바르지 않거나 접근할 수 없는 주제입니다.</p><Link to="/news-topics">목록으로</Link></section>
  async function save(values: EditNewsTopicFormValues) { setError(null); try { await mutation.mutateAsync({ canonicalTitle: values.canonicalTitle, topicSummary: values.topicSummary.trim() || null, lastSeenAt: values.lastSeenAt }); navigate(`/news-topics/${topicId}`, { replace: true }) } catch (reason) { setError(reason instanceof Error ? reason.message : '뉴스 주제를 저장하지 못했습니다.') } }
  return <section className="content-editor"><div className="page-heading-with-actions"><div><p className="dashboard__eyebrow">뉴스 추적</p><h1>뉴스 주제 기본 정보 수정</h1></div><Link className="secondary-link" to={`/news-topics/${topicId}`}>상세로</Link></div><NewsTopicForm mode="edit" categories={(categoriesQuery.data ?? []).filter((item) => item.content_group === 'news')} topic={topicQuery.data} isSaving={mutation.isPending} submitError={error} onEdit={save} /></section>
}
export function NewsTopicEditPage() { const { user } = useAuth(); const { topicId = '' } = useParams(); return <NewsTopicEditPageContent userId={user?.id ?? ''} topicId={topicId} /> }
