import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'

import {
  authFormSchema,
  type AuthFormValues,
} from '../features/auth/auth-schema'
import { useAuth } from '../features/auth/useAuth'

type AuthMode = 'sign-in' | 'sign-up'

function getAuthErrorMessage(message: string) {
  if (message.toLowerCase().includes('invalid login credentials')) {
    return '이메일 또는 비밀번호를 확인해 주세요.'
  }

  return message
}

export function LoginPage() {
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AuthFormValues>({
    resolver: zodResolver(authFormSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setSubmitError(null)
    setSuccessMessage(null)

    const result =
      mode === 'sign-in'
        ? await signIn(email, password)
        : await signUp(email, password)

    if (result.error) {
      setSubmitError(getAuthErrorMessage(result.error))
      return
    }

    if (result.emailConfirmationRequired) {
      setSuccessMessage('이메일 확인 후 로그인해 주세요.')
      setMode('sign-in')
      return
    }

    navigate('/dashboard', { replace: true })
  })

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-panel__brand">Daily Brief Note</div>
        <h1 id="auth-title">
          {mode === 'sign-in' ? '관리자 로그인' : '계정 만들기'}
        </h1>

        <div className="segmented-control" aria-label="인증 방식">
          <button
            type="button"
            aria-pressed={mode === 'sign-in'}
            onClick={() => setMode('sign-in')}
          >
            로그인
          </button>
          <button
            type="button"
            aria-pressed={mode === 'sign-up'}
            onClick={() => setMode('sign-up')}
          >
            회원가입
          </button>
        </div>

        <form className="auth-form" onSubmit={onSubmit} noValidate>
          <label htmlFor="email">이메일</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'email-error' : undefined}
            {...register('email')}
          />
          {errors.email ? (
            <p className="field-error" id="email-error">
              {errors.email.message}
            </p>
          ) : null}

          <label htmlFor="password">비밀번호</label>
          <input
            id="password"
            type="password"
            autoComplete={
              mode === 'sign-in' ? 'current-password' : 'new-password'
            }
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? 'password-error' : undefined}
            {...register('password')}
          />
          {errors.password ? (
            <p className="field-error" id="password-error">
              {errors.password.message}
            </p>
          ) : null}

          {submitError ? <p className="form-alert" role="alert">{submitError}</p> : null}
          {successMessage ? (
            <p className="form-success" role="status">{successMessage}</p>
          ) : null}

          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? '처리 중'
              : mode === 'sign-in'
                ? '로그인하기'
                : '가입하기'}
          </button>
        </form>
      </section>
    </main>
  )
}
