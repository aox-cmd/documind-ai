import { useEffect, useState } from 'react'
import { LoaderCircle, Sparkles } from 'lucide-react'
import AuthPage from './pages/AuthPage'
import Workspace from './pages/Workspace'
import { authApi, setToken } from './lib/api'
import type { User, AuthResponse } from './lib/api'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  function logout() {
    sessionStorage.removeItem('documind_token')
    setToken(null)
    setUser(null)
  }

  useEffect(() => {
    let active = true
    const token = sessionStorage.getItem('documind_token')

    window.addEventListener('documind:expired', logout)

    if (!token) {
      setLoading(false)
    } else {
      setToken(token)

      authApi.me()
        .then(result => {
          if (active) setUser(result)
        })
        .catch(() => {
          if (active) logout()
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }

    return () => {
      active = false
      window.removeEventListener('documind:expired', logout)
    }
  }, [])

  function authenticate(response: AuthResponse) {
    sessionStorage.setItem('documind_token', response.access_token)
    setToken(response.access_token)
    setUser(response.user)
  }

  if (loading) {
    return (
      <div className="app-loading">
        <Sparkles size={42} />
        <h2>documind.</h2>
        <LoaderCircle className="spin" size={22} />
      </div>
    )
  }

  return user
    ? <Workspace key={user.id} user={user} onLogout={logout} />
    : <AuthPage onAuth={authenticate} />
}
