import { useState } from 'react'
import type { FormEvent } from 'react'
import { motion } from 'framer-motion'
import {
  Sparkles, ArrowRight, Eye, EyeOff,
  FileText, ShieldCheck, BrainCircuit, LoaderCircle
} from 'lucide-react'
import { authApi, errorMessage } from '../lib/api'
import type { AuthResponse } from '../lib/api'

interface Props {
  onAuth: (response: AuthResponse) => void
}

export default function AuthPage({ onAuth }: Props) {
  const [register, setRegister] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = register
        ? await authApi.register(name, email, password)
        : await authApi.login(email, password)

      onAuth(response)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-showcase">
        <div className="brand">
          <span className="brand-icon"><Sparkles /></span>
          documind<span>.</span>
        </div>

        <motion.div
          className="showcase-content"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="eyebrow">
            <Sparkles size={14} />
            YOUR INTELLIGENT WORKSPACE
          </div>

          <h1>
            Your documents.<br />
            <span>Your intelligence.</span>
          </h1>

          <p>
            Transform complex documents into clear answers.
            Discover insights, ask questions and understand
            information faster than ever.
          </p>

          <div className="showcase-features">
            <div>
              <FileText />
              <section>
                <strong>Upload anything</strong>
                <small>PDF, Word and text documents</small>
              </section>
            </div>
            <div>
              <BrainCircuit />
              <section>
                <strong>Powered by Gemini</strong>
                <small>Context-aware document intelligence</small>
              </section>
            </div>
            <div>
              <ShieldCheck />
              <section>
                <strong>Your personal workspace</strong>
                <small>Account-isolated document library</small>
              </section>
            </div>
          </div>
        </motion.div>

        <footer>DOCUMIND AI — DOCUMENT INTELLIGENCE</footer>
      </section>

      <section className="auth-form-panel">
        <motion.div
          className="auth-card"
          key={String(register)}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="auth-symbol"><Sparkles /></div>

          <h2>{register ? 'Create your workspace' : 'Welcome back'}</h2>

          <p>
            {register
              ? 'Start exploring your documents with AI.'
              : 'Sign in to your intelligent workspace.'}
          </p>

          <form onSubmit={submit}>
            {register && (
              <label>
                Full name
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                  required
                  minLength={2}
                  maxLength={100}
                />
              </label>
            )}

            <label>
              Email address
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </label>

            <label>
              Password
              <div className="password-field">
                <input
                  type={visible ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  minLength={register ? 8 : 1}
                  maxLength={128}
                />
                <button
                  type="button"
                  aria-label="Toggle password visibility"
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            {error && <div className="error-banner">{error}</div>}

            <button className="primary-button" disabled={loading}>
              {loading
                ? <LoaderCircle className="spin" size={18} />
                : <>
                    {register ? 'Create account' : 'Sign in'}
                    <ArrowRight size={18} />
                  </>}
            </button>
          </form>

          <div className="auth-switch">
            {register ? 'Already have an account?' : 'New to DocuMind?'}
            <button
              disabled={loading}
              onClick={() => {
                setRegister(!register)
                setError('')
              }}
            >
              {register ? 'Sign in' : 'Create account'}
            </button>
          </div>
        </motion.div>
      </section>
    </main>
  )
}
