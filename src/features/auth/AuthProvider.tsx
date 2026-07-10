import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'

import { supabase } from '../../shared/supabase/client'
import {
  AuthContext,
  type AuthActionResult,
} from './auth-context'

interface AuthProviderProps {
  children: ReactNode
  client?: SupabaseClient | null
}

const configurationError =
  'Supabase 환경 변수가 설정되지 않았습니다.'

export function AuthProvider({
  children,
  client = supabase,
}: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(client !== null)
  const [sessionError, setSessionError] = useState<string | null>(null)

  useEffect(() => {
    if (!client) {
      return
    }

    let isActive = true

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!isActive) return

      setSession(nextSession)
      setSessionError(null)
      setIsLoading(false)
    })

    void client.auth.getSession().then(({ data, error }) => {
      if (!isActive) return

      if (error) {
        setSession(null)
        setSessionError(error.message)
      } else {
        setSession(data.session)
        setSessionError(null)
      }

      setIsLoading(false)
    })

    return () => {
      isActive = false
      subscription.unsubscribe()
    }
  }, [client])

  const value = useMemo(() => {
    const unavailableResult: AuthActionResult = {
      error: configurationError,
    }

    return {
      session,
      user: session?.user ?? null,
      isLoading,
      isConfigured: client !== null,
      sessionError,
      async signIn(email: string, password: string) {
        if (!client) return unavailableResult

        const { data, error } = await client.auth.signInWithPassword({
          email,
          password,
        })

        if (error) return { error: error.message }

        setSession(data.session)
        setSessionError(null)
        return { error: null }
      },
      async signUp(email: string, password: string) {
        if (!client) return unavailableResult

        const { data, error } = await client.auth.signUp({ email, password })

        if (error) return { error: error.message }

        setSession(data.session)
        setSessionError(null)
        return {
          error: null,
          emailConfirmationRequired: data.session === null,
        }
      },
      async signOut() {
        if (!client) return unavailableResult

        const { error } = await client.auth.signOut()

        if (error) return { error: error.message }

        setSession(null)
        setSessionError(null)
        return { error: null }
      },
    }
  }, [client, isLoading, session, sessionError])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
