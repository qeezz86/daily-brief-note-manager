import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

export interface AuthActionResult {
  error: string | null
  emailConfirmationRequired?: boolean
}

export interface AuthContextValue {
  session: Session | null
  user: User | null
  isLoading: boolean
  isConfigured: boolean
  sessionError: string | null
  signIn: (email: string, password: string) => Promise<AuthActionResult>
  signUp: (email: string, password: string) => Promise<AuthActionResult>
  signOut: () => Promise<AuthActionResult>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
