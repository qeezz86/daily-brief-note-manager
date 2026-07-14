import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import { ImportJobList } from '../features/imports/ImportJobList'
import { useImportJobsQuery } from '../features/imports/importJobs.queries'
import type { ImportJobFilters, ImportJobStatus } from '../features/imports/importJobs.types'
import { supabase, type DatabaseClient } from '../shared/supabase/client'

export function ImportHistoryPageContent({ client = supabase, userId = '' }: { client?: DatabaseClient | null; userId?: string }) {
  const [filters, setFilters] = useState<ImportJobFilters>({ status: '', sourceName: '', createdFrom: '', createdTo: '' })
  const query = useImportJobsQuery(client, userId, filters)
  return <section className="content-page" aria-labelledby="import-history-title">
    <div className="content-page__heading"><div><p className="dashboard__eyebrow">Durable import history</p><h1 id="import-history-title">Import 작업 이력</h1><p>최근 100개 작업의 DB 기준 상태와 진행률입니다.</p></div><Link className="primary-button" to="/imports/new">새 Import</Link></div>
    <div className="content-toolbar">
      <label>상태<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value as ImportJobStatus | '' })}><option value="">전체</option>{['preparing','ready','running','completed','completed_with_errors','cancelled','failed'].map((status) => <option key={status}>{status}</option>)}</select></label>
      <label>source name<input value={filters.sourceName} onChange={(event) => setFilters({ ...filters, sourceName: event.target.value })} /></label>
      <label>시작일<input type="date" value={filters.createdFrom} onChange={(event) => setFilters({ ...filters, createdFrom: event.target.value })} /></label>
      <label>종료일<input type="date" value={filters.createdTo} onChange={(event) => setFilters({ ...filters, createdTo: event.target.value })} /></label>
    </div>
    {query.isPending ? <div className="content-state" role="status">작업 이력을 불러오고 있습니다.</div> : null}
    {query.isError ? <div className="content-state content-state--error" role="alert">작업 이력을 불러오지 못했습니다.</div> : null}
    {query.data ? <ImportJobList jobs={query.data} /> : null}
  </section>
}

export function ImportHistoryPage() { const { user } = useAuth(); return <ImportHistoryPageContent userId={user?.id ?? ''} /> }
