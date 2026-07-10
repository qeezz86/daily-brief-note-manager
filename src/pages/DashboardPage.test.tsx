import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { DashboardPage } from './DashboardPage'

describe('DashboardPage', () => {
  it('renders the Phase 0 dashboard shell', () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('heading', { name: '콘텐츠 관리' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('인증 연결이 준비되었습니다'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '콘텐츠 목록 보기' }),
    ).toHaveAttribute('href', '/content')
  })
})
