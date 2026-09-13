import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"

import { loginUser } from "../../features/auth/auth.api"

function getErrorMessage(error) {
  if (error?.response?.status === 401) {
    return "Maling username o password. Pakisuri at subukan muli."
  }
  return (
    error?.response?.data?.message ||
    error?.message ||
    "Login failed. Please check your username and password."
  )
}

function LoginPage({ onLogin }) {
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setErrorMessage("")

    if (!identifier.trim() || !password) {
      setErrorMessage("Username/email and password are required.")
      return
    }

    setIsLoading(true)

    try {
      const response = await loginUser({
        identifier: identifier.trim(),
        password,
      })

      const token = response?.data?.token
      const user = response?.data?.user

      if (!response?.success || !token || !user) {
        throw new Error("Invalid login response from server.")
      }

      await onLogin({ token, user })
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="grid min-h-svh place-items-center bg-[var(--color-page)] px-4 py-8">
      <section className="w-full max-w-md rounded-3xl border border-[var(--color-border)] bg-white p-6 shadow-card">
        <div className="flex items-center gap-3">
          <img
            alt="Auto Supply Logo"
            className="size-12 rounded-2xl object-contain shadow-sm"
            src="/arunafeltzlogo.png"
          />
          <div>
            <h1 className="text-xl font-black text-[var(--color-text-strong)]">
              Auto Supply
            </h1>
            <p className="text-xs text-[var(--color-muted)]">
              Parts & Services Management POS
            </p>
          </div>
        </div>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label
              className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-muted)]"
              htmlFor="identifier"
            >
              Username or email
            </label>
            <input
              autoCapitalize="none"
              autoComplete="username"
              autoCorrect="off"
              className="mt-2 w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm text-[var(--color-text-strong)] outline-none transition focus:border-[var(--color-maroon)]"
              disabled={isLoading}
              id="identifier"
              name="identifier"
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="superowner"
              required
              spellCheck="false"
              type="text"
              value={identifier}
            />
          </div>

          <div>
            <label
              className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-muted)]"
              htmlFor="password"
            >
              Password
            </label>
            <div className="relative mt-2">
              <input
                autoCapitalize="none"
                autoComplete="current-password"
                autoCorrect="off"
                className="w-full rounded-2xl border border-[var(--color-border)] bg-white py-3 pl-4 pr-12 text-sm text-[var(--color-text-strong)] outline-none transition focus:border-[var(--color-maroon)]"
                disabled={isLoading}
                id="password"
                name="password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••••••"
                required
                spellCheck="false"
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-[var(--color-muted)] transition hover:text-[var(--color-text-strong)]"
                onClick={() => setShowPassword((prev) => !prev)}
                tabIndex="-1"
                type="button"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {errorMessage ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
              {errorMessage}
            </p>
          ) : null}

          <button
            className="w-full rounded-2xl bg-[var(--color-maroon)] px-4 py-3 text-sm font-bold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoading}
            type="submit"
          >
            {isLoading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-xs text-[var(--color-muted)]">
          Use an active Auto Supply account. Your role and branch determine the
          workspace you can access.
        </p>
      </section>
    </main>
  )
}

export default LoginPage
