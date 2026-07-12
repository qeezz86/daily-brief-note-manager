import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Category } from '../categories/categories.types'
import { NewsTopicForm } from './NewsTopicForm'
import type { NewsTopic } from './newsTopics.types'

const categories: Category[] = [{ id: 'economy', content_group: 'news', name: '경제', sort_order: 1, display_id_pattern: null, slug_pattern: 'x', wrapper_class: 'news' }]
const topic: NewsTopic = { id: '1', category_id: 'economy', topic_key: 'rate-outlook', canonical_title: '금리 전망', topic_summary: null, status: 'active', closed_reason: null, first_seen_at: '2026-07-01', last_seen_at: '2026-07-02', created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-02T00:00:00Z' }

describe('NewsTopicForm', () => {
  it('renders the create fields', () => { render(<NewsTopicForm mode="create" categories={categories} isSaving={false} submitError={null} onCreate={vi.fn()} />); expect(screen.getByLabelText('주제 키')).toBeInTheDocument(); expect(screen.getByLabelText('초기 상태')).toHaveValue('active') })
  it('offers only active and monitoring initial statuses', () => { render(<NewsTopicForm mode="create" categories={categories} isSaving={false} submitError={null} />); const options = screen.getAllByRole('option').map((item) => item.textContent); expect(options).not.toContain('종료'); expect(options).not.toContain('재개') })
  it('shows required field errors near fields', async () => { const user = userEvent.setup(); render(<NewsTopicForm mode="create" categories={categories} isSaving={false} submitError={null} onCreate={vi.fn()} />); await user.clear(screen.getByLabelText('최초 확인일')); await user.clear(screen.getByLabelText('최근 확인일')); await user.click(screen.getByRole('button', { name: '뉴스 주제 저장' })); expect(await screen.findByText('뉴스 카테고리를 선택해 주세요.')).toBeInTheDocument(); expect(screen.getByText('대표 제목을 입력해 주세요.')).toBeInTheDocument() })
  it('shows date order validation', async () => { const user = userEvent.setup(); render(<NewsTopicForm mode="create" categories={categories} isSaving={false} submitError={null} onCreate={vi.fn()} />); await user.selectOptions(screen.getByLabelText('카테고리'), 'economy'); await user.type(screen.getByLabelText('주제 키'), 'rate'); await user.type(screen.getByLabelText('대표 제목'), '금리'); await user.clear(screen.getByLabelText('최초 확인일')); await user.type(screen.getByLabelText('최초 확인일'), '2026-07-02'); await user.clear(screen.getByLabelText('최근 확인일')); await user.type(screen.getByLabelText('최근 확인일'), '2026-07-01'); await user.click(screen.getByRole('button', { name: '뉴스 주제 저장' })); expect(await screen.findByText('최근 확인일은 최초 확인일보다 이전일 수 없습니다.')).toBeInTheDocument() })
  it('keeps identity fields disabled in edit mode', () => { render(<NewsTopicForm mode="edit" categories={categories} topic={topic} isSaving={false} submitError={null} />); expect(screen.getByLabelText('카테고리')).toBeDisabled(); expect(screen.getByLabelText('주제 키')).toBeDisabled(); expect(screen.getByLabelText('최초 확인일')).toBeDisabled() })
})
