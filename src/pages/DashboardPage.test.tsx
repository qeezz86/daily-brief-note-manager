import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DashboardPage } from './DashboardPage'

describe('DashboardPage', () => {
  it('renders the Phase 0 dashboard shell', () => {
    render(<DashboardPage />)

    expect(
      screen.getByRole('heading', { name: '콘텐츠 관리' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('기본 환경이 준비되었습니다'),
    ).toBeInTheDocument()
  })
})
