import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import { useActiveCategoriesQuery } from '../features/categories/categories.queries'
import { NewsTopicForm } from '../features/newsTopics/NewsTopicForm'
import type { CreateNewsTopicFormValues } from '../features/newsTopics/newsTopicFormSchema'
import { useCreateNewsTopicMutation } from '../features/newsTopics/newsTopics.queries'
import { supabase, type DatabaseClient } from '../shared/supabase/client'

export function NewsTopicCreatePageContent({ client = supabase, userId }: { client?: DatabaseClient | null; userId: string }) {
  const navigate = useNavigate(); const [error, setError] = useState<string | null>(null)
  const categoriesQuery = useActiveCategoriesQuery(client); const mutation = useCreateNewsTopicMutation(client, userId)
  const categories = (categoriesQuery.data ?? []).filter((item) => item.content_group === 'news')
  async function save(values: CreateNewsTopicFormValues) { setError(null); try { const topic = await mutation.mutateAsync({ categoryId: values.categoryId, topicKey: values.topicKey, canonicalTitle: values.canonicalTitle, topicSummary: values.topicSummary.trim() || null, initialStatus: values.initialStatus, firstSeenAt: values.firstSeenAt, lastSeenAt: values.lastSeenAt }); navigate(`/news-topics/${topic.id}`, { replace: true }) } catch (reason) { setError(reason instanceof Error ? reason.message : '뉴스 주제를 저장하지 못했습니다.') } }
  return <section className="content-editor"><div className="page-heading-with-actions"><div><p className="dashboard__eyebrow">뉴스 추적</p><h1>뉴스 주제 신규 생성</h1></div><Link className="secondary-link" to="/news-topics">목록으로</Link></div>{categoriesQuery.isPending ? <div className="content-state" role="status">카테고리를 불러오고 있습니다.</div> : null}{categoriesQuery.isError ? <div className="content-state content-state--error" role="alert"><h2>카테고리를 불러오지 못했습니다</h2></div> : null}{categoriesQuery.isSuccess ? <NewsTopicForm mode="create" categories={categories} isSaving={mutation.isPending} submitError={error} onCreate={save} /> : null}</section>
}
export function NewsTopicCreatePage() { const { user } = useAuth(); return <NewsTopicCreatePageContent userId={user?.id ?? ''} /> }
