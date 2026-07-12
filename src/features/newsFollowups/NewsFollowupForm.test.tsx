import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NewsFollowupForm } from './NewsFollowupForm'

describe('NewsFollowupForm', () => {
  it('renders labeled mobile-friendly form controls', () => { render(<NewsFollowupForm pending={false} error={null} onSubmit={vi.fn()} />); expect(screen.getByLabelText('확인할 내용')).toBeInTheDocument(); expect(screen.getByLabelText('우선순위')).toHaveValue('normal'); expect(screen.getByLabelText('마감일 (선택)')).toHaveAttribute('type', 'date') })
  it('shows required check text near the field', async () => { const user = userEvent.setup(); render(<NewsFollowupForm pending={false} error={null} onSubmit={vi.fn()} />); await user.click(screen.getByRole('button', { name: '후속 확인 저장' })); expect(await screen.findByText('확인할 내용을 입력해 주세요.')).toBeInTheDocument() })
  it('submits priority and an empty date without duplication', async () => { const user = userEvent.setup(); const submit = vi.fn(); render(<NewsFollowupForm pending={false} error={null} onSubmit={submit} />); await user.type(screen.getByLabelText('확인할 내용'), '공식 결정 확인'); await user.selectOptions(screen.getByLabelText('우선순위'), 'high'); await user.click(screen.getByRole('button', { name: '후속 확인 저장' })); expect(submit).toHaveBeenCalledWith({ checkText: '공식 결정 확인', priority: 'high', dueDate: '' }, expect.anything()) })
  it('disables submission while saving and shows safe errors', () => { render(<NewsFollowupForm pending error="저장 오류" onSubmit={vi.fn()} />); expect(screen.getByRole('button', { name: '저장 중' })).toBeDisabled(); expect(screen.getByRole('alert')).toHaveTextContent('저장 오류') })
})

