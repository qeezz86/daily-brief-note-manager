import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

import { useAuth } from '../features/auth/useAuth'

export function AppLayout() {
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const { signOut, user } = useAuth()

  async function handleSignOut() {
    setIsSigningOut(true)
    setSignOutError(null)
    const result = await signOut()
    setSignOutError(result.error)
    setIsSigningOut(false)
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <span className="app-header__brand">Daily Brief Note</span>
          <span className="app-header__section">Content Manager</span>
          <nav className="app-navigation" aria-label="주요 메뉴">
            <NavLink to="/dashboard">대시보드</NavLink>
            <NavLink to="/content">콘텐츠</NavLink>
            <NavLink to="/imports">콘텐츠 가져오기</NavLink>
            <NavLink to="/imports/history">Import 이력</NavLink>
            <NavLink to="/news-topics">뉴스 주제</NavLink>
            <NavLink to="/news-followups">후속 확인</NavLink>
            <NavLink to="/briefing-prompts">브리핑 프롬프트</NavLink>
            <NavLink to="/backups">백업</NavLink>
          </nav>
          <div className="app-header__account">
            <span title={user?.email}>{user?.email}</span>
            <button
              className="secondary-button"
              type="button"
              disabled={isSigningOut}
              onClick={() => void handleSignOut()}
            >
              {isSigningOut ? '로그아웃 중' : '로그아웃'}
            </button>
          </div>
        </div>
      </header>
      {signOutError ? (
        <div className="app-alert" role="alert">{signOutError}</div>
      ) : null}
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
