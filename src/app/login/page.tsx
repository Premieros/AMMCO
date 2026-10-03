import { LoginView } from '@/components/login-view'

export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string
    signup_error?: string
    signup_success?: string
    returnTo?: string
  }>
}) {
  const { error, signup_error, signup_success, returnTo } = await searchParams

  return (
    <LoginView
      error={error}
      signupError={signup_error}
      signupSuccess={signup_success}
      returnTo={returnTo}
    />
  )
}
