import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { readyWordPressDiagnostics } from './wordpressDiagnostics.fixtures'
import { WordPressDiagnosticsPanel } from './WordPressDiagnosticsPanel'

describe('WordPressDiagnosticsPanel', () => {
  it('shows the ready connection, safe identity, capabilities, and totals', () => {
    render(<WordPressDiagnosticsPanel result={readyWordPressDiagnostics} />)
    expect(screen.getByRole('heading', { name: '연결 준비됨' })).toBeInTheDocument()
    expect(screen.getByText('Daily Brief Note · https://wordpress.example.com')).toBeInTheDocument()
    expect(screen.getByText('Editor')).toBeInTheDocument()
    expect(screen.getByText('administrator')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('24')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getAllByText('확인됨')).toHaveLength(6)
  })

  it('shows partial warnings and truncated first-page information', () => {
    const result = structuredClone(readyWordPressDiagnostics)
    result.readiness.connection = 'partial'
    result.resources.categories!.truncated = true
    result.warnings = ['카테고리 다음 페이지가 있습니다.']
    render(<WordPressDiagnosticsPanel result={result} />)
    expect(screen.getByRole('heading', { name: '일부 확인 필요' })).toBeInTheDocument()
    expect(screen.getByText('카테고리 다음 페이지가 있습니다.')).toBeInTheDocument()
    expect(screen.getByText('1개 · 다음 페이지 있음')).toBeInTheDocument()
  })

  it('does not render credentials, username, email, or raw capability names', () => {
    const { container } = render(<WordPressDiagnosticsPanel result={readyWordPressDiagnostics} />)
    expect(container).not.toHaveTextContent('WORDPRESS_APPLICATION_PASSWORD')
    expect(container).not.toHaveTextContent('api-user')
    expect(container).not.toHaveTextContent('@')
    expect(container).not.toHaveTextContent('edit_posts')
  })
})
