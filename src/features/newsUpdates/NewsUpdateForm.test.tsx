import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NewsUpdateForm } from './NewsUpdateForm'

const topic = { id: 'topic', category_id: 'economy', topic_key: 'rates', canonical_title: '금리', topic_summary: null, status: 'active', closed_reason: null, first_seen_at: '2026-07-01', last_seen_at: '2026-07-02', created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-02T00:00:00Z' }
const previous = { id: 'previous', post_id: 'old-post', topic_id: 'topic', item_order: 1, update_type: 'new', headline: '이전 발표', fact_summary: '사실', importance_summary: null, impact_summary: null, change_summary: null, previous_update_id: null, created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z', post: { id: 'old-post', title: '이전 글', display_id: '#OLD', briefing_date: '2026-07-01' }, topic: { id: 'topic', canonical_title: '금리', category_id: 'economy', status: 'active' }, sources: [] }

describe('NewsUpdateForm', () => {
  it('removes the previous-update input for new updates and shows it for follow-ups', async () => {
    const user = userEvent.setup()
    render(<NewsUpdateForm post={{ category_id: 'economy', title: '게시물', display_id: '#ECO' }} topics={[topic]} previous={[previous]} sources={[{ id: 'source', source_name: '기관', source_title: '자료', source_url: 'https://example.com', news_update_id: null }]} onSubmit={vi.fn()} />)

    expect(screen.queryByLabelText('이전 업데이트')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('업데이트 유형'), 'follow_up')
    expect(screen.getByLabelText('이전 업데이트')).toBeInTheDocument()
  })
})
