import { useMemo, useState } from 'react'
import type { Category } from '../categories/categories.types'
import { taxonomyMappingLocalKey } from './wordpressTaxonomy.repository'
import { useLocalWordPressTagsQuery, useRemoveTaxonomyMappingMutation, useSaveTaxonomyMappingMutation, useTaxonomyMappingsQuery } from './wordpressPublicationPreview.queries'
import type { TaxonomyCatalogResponse } from './wordpressPublicationPreview.schema'
import type { DatabaseClient } from '../../shared/supabase/client'

export function WordPressTaxonomyMappingPanel({ client, userId, catalog, categories }: { client: DatabaseClient | null; userId: string; catalog: TaxonomyCatalogResponse; categories: Category[] }) {
  const origin = catalog.site.origin
  const mappings = useTaxonomyMappingsQuery(client, userId, origin)
  const localTags = useLocalWordPressTagsQuery(client, userId)
  const save = useSaveTaxonomyMappingMutation(client, userId, origin)
  const remove = useRemoveTaxonomyMappingMutation(client, userId, origin)
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const filteredTags = useMemo(() => (localTags.data ?? []).filter((tag) => tag.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 50), [localTags.data, search])

  async function saveSelection(kind: 'category' | 'tag', localKey: string, localName: string) {
    const termId = Number(selections[`${kind}:${localKey}`] ?? '')
    const term = kind === 'category' ? catalog.catalog.categories.find((item) => item.id === termId) : catalog.catalog.tags.find((item) => item.id === termId)
    if (!term) { setMessage(`${localName}: WordPress term을 선택해 주세요.`); return }
    try {
      await save.mutateAsync({ mappingKind: kind, localKey, wordpressTermId: term.id, wordpressTermSlug: term.slug, wordpressTermName: term.name })
      setMessage(`${localName} 매핑을 저장했습니다. WordPress에는 아무 것도 쓰지 않았습니다.`)
    } catch {
      setMessage(`${localName} 매핑을 저장하지 못했습니다. 다시 시도해 주세요.`)
    }
  }

  async function removeMapping(id: string, name: string) {
    if (!window.confirm(`${name} 매핑을 제거하시겠습니까?`)) return
    try {
      await remove.mutateAsync(id)
      setMessage(`${name} 매핑을 제거했습니다.`)
    } catch {
      setMessage(`${name} 매핑을 제거하지 못했습니다. 다시 시도해 주세요.`)
    }
  }

  if (mappings.isLoading || localTags.isLoading) return <section className="wordpress-panel"><h2>Taxonomy 매핑</h2><p>저장된 매핑을 불러오는 중입니다.</p></section>
  if (mappings.isError || localTags.isError) return <section className="wordpress-panel wordpress-panel--warning" role="alert"><h2>Taxonomy 매핑</h2><p>로컬 taxonomy 매핑을 불러오지 못했습니다.</p></section>

  const rows = mappings.data ?? []
  return <section className="wordpress-panel wordpress-taxonomy" aria-labelledby="wordpress-taxonomy-title" aria-busy={save.isPending || remove.isPending}>
    <p className="dashboard__eyebrow">GET-only catalog · 로컬 DB 설정</p>
    <h2 id="wordpress-taxonomy-title">Taxonomy 매핑</h2>
    <p>사이트 origin: <code>{origin}</code> · Catalog {catalog.catalog.categories.length} categories / {catalog.catalog.tags.length} tags</p>
    <div className="wordpress-live-region" role="status" aria-live="polite">{message}</div>
    <h3>카테고리</h3>
    <div className="wordpress-taxonomy__rows">
      {categories.map((category) => {
        const mapping = rows.find((row) => row.mapping_kind === 'category' && row.local_key === category.id)
        const currentTerm = mapping ? catalog.catalog.categories.find((term) => term.id === mapping.wordpress_term_id) : null
        const stale = Boolean(mapping && (!currentTerm || currentTerm.slug !== mapping.wordpress_term_slug))
        const value = selections[`category:${category.id}`] ?? String(mapping?.wordpress_term_id ?? '')
        return <div className="wordpress-taxonomy__row" key={category.id}>
          <div><strong>{category.name}</strong><small>{category.id}</small>{stale ? <span className="status-badge status-badge--archived">stale</span> : mapping ? <span className="status-badge">mapped</span> : <span className="status-badge status-badge--draft">missing</span>}</div>
          <label htmlFor={`wp-category-${category.id}`}>WordPress category</label>
          <select id={`wp-category-${category.id}`} value={value} onChange={(event) => setSelections((state) => ({ ...state, [`category:${category.id}`]: event.target.value }))}>
            <option value="">선택</option>{catalog.catalog.categories.map((term) => { const parent = term.parent ? catalog.catalog.categories.find((item) => item.id === term.parent)?.name : null; return <option key={term.id} value={term.id}>{term.name} ({term.slug}){parent ? ` · 상위 ${parent}` : ''}</option> })}
          </select>
          <div className="detail-actions"><button type="button" disabled={save.isPending} onClick={() => void saveSelection('category', category.id, category.name)}>매핑 저장</button>{mapping ? <button className="danger-button" type="button" disabled={remove.isPending} onClick={() => void removeMapping(mapping.id, category.name)}>매핑 제거</button> : null}</div>
          {mapping?.verified_at ? <small>마지막 확인: {new Date(mapping.verified_at).toLocaleString('ko-KR')}</small> : null}
        </div>
      })}
    </div>
    <h3>태그</h3>
    <label htmlFor="wordpress-tag-search">로컬 태그 검색</label><input id="wordpress-tag-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="태그 이름" />
    <div className="wordpress-taxonomy__rows">
      {filteredTags.map((tag) => {
        const localKey = taxonomyMappingLocalKey(tag.name)
        const mapping = rows.find((row) => row.mapping_kind === 'tag' && row.local_key === localKey)
        const exact = catalog.catalog.tags.find((term) => taxonomyMappingLocalKey(term.name) === localKey)
        const value = selections[`tag:${localKey}`] ?? String(mapping?.wordpress_term_id ?? exact?.id ?? '')
        const currentTerm = mapping ? catalog.catalog.tags.find((term) => term.id === mapping.wordpress_term_id) : null
        const stale = Boolean(mapping && (!currentTerm || currentTerm.slug !== mapping.wordpress_term_slug))
        return <div className="wordpress-taxonomy__row" key={tag.id}>
          <div><strong>{tag.name}</strong>{exact && !mapping ? <span className="status-badge">exact candidate</span> : null}{stale ? <span className="status-badge status-badge--archived">stale</span> : null}</div>
          <label htmlFor={`wp-tag-${tag.id}`}>WordPress tag</label><select id={`wp-tag-${tag.id}`} value={value} onChange={(event) => setSelections((state) => ({ ...state, [`tag:${localKey}`]: event.target.value }))}><option value="">선택</option>{catalog.catalog.tags.map((term) => <option key={term.id} value={term.id}>{term.name} ({term.slug})</option>)}</select>
          <div className="detail-actions"><button type="button" disabled={save.isPending} onClick={() => void saveSelection('tag', localKey, tag.name)}>매핑 저장</button>{mapping ? <button className="danger-button" type="button" disabled={remove.isPending} onClick={() => void removeMapping(mapping.id, tag.name)}>매핑 제거</button> : null}</div>
        </div>
      })}
      {!filteredTags.length ? <p className="field-help">표시할 로컬 태그가 없습니다.</p> : null}
    </div>
  </section>
}
