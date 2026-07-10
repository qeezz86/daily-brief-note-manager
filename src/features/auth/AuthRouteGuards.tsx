import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { ConfigurationErrorPage } from '../../pages/ConfigurationErrorPage'
import { SessionErrorPage } from '../../pages/SessionErrorPage'
import { SessionLoadingPage } from '../../pages/SessionLoadingPage'
import { useAuth } from './useAuth'

export function RequireAuth() {
  const { isConfigured, isLoading, sessionError, user } = useAuth()
  const location = useLocation()

  if (!isConfigured) return <ConfigurationErrorPage />
  if (isLoading) return <SessionLoadingPage />
  if (sessionError) return <SessionErrorPage message={sessionError} />

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}

export function PublicOnlyRoute() {
  const { isConfigured, isLoading, sessionError, user } = useAuth()

  if (!isConfigured) return <ConfigurationErrorPage />
  if (isLoading) return <SessionLoadingPage />
  if (sessionError) return <SessionErrorPage message={sessionError} />
  if (user) return <Navigate to="/dashboard" replace />

  return <Outlet />
}
