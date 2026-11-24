import { useEffect, useRef, useState } from 'react'
import type { FormEvent, DragEvent } from 'react'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Sparkles, Plus, Search, FileText, UploadCloud,
  LogOut, Send, Trash2, PanelRight, Menu,
  X, LoaderCircle, BookOpen, MessageSquare,
  Copy, Check, Layers, AlertCircle
} from 'lucide-react'
import {
  documentsApi, errorMessage, formatSize
} from '../lib/api'
import type {
  User, DocumentItem, DocumentDetail,
  Message, Source
} from '../lib/api'

interface Props {
  user: User
  onLogout: () => void
}

const suggestions = [
  'What are the main topics in this document?',
  'Extract the most important information.',
  'Explain this document in simple terms.',
  'What are the key conclusions?'
]

export default function Workspace({ user, onLogout }: Props) {
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [detail, setDetail] = useState<DocumentDetail | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState('')
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(true)
  const [sidebar, setSidebar] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [tab, setTab] = useState<'text' | 'summary'>('text')
  const [source, setSource] = useState<Source | null>(null)
  const [copied, setCopied] = useState<number | null>(null)

  const fileInput = useRef<HTMLInputElement>(null)
  const chatEnd = useRef<HTMLDivElement>(null)
  const requestId = useRef(0)

  const locked = busy || uploading || opening

  useEffect(() => {
    let active = true

    documentsApi.list()
      .then(items => {
        if (active) setDocuments(items)
      })
      .catch(err => {
        if (active) setError(errorMessage(err))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [])

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, pending, busy])

  async function openDocument(id: number) {
    const currentRequest = ++requestId.current

    setSelected(id)
    setDetail(null)
    setMessages([])
    setSource(null)
    setTab('text')
    setQuestion('')
    setSidebar(false)
    setOpening(true)
    setError('')

    try {
      const [document, history] = await Promise.all([
        documentsApi.get(id),
        documentsApi.messages(id)
      ])

      if (currentRequest !== requestId.current) return

      setDetail(document)
      setMessages(history)
    } catch (err) {
      if (currentRequest === requestId.current) {
        setError(errorMessage(err))
      }
    } finally {
      if (currentRequest === requestId.current) {
        setOpening(false)
      }
    }
  }

  async function upload(file?: File) {
    if (!file || locked) return

    if (!/\.(pdf|docx|txt)$/i.test(file.name)) {
      setError('Only PDF, DOCX and TXT files are supported.')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Maximum file size is 10 MB.')
      return
    }

    if (!window.confirm(
      'Use non-confidential documents only. Relevant text will be sent to Google Gemini when you use AI features.'
    )) return

    setUploading(true)
    setError('')

    try {
      const document = await documentsApi.upload(file)

      setDocuments(old => [document, ...old])

      await openDocument(document.id)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  function drop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    void upload(event.dataTransfer.files[0])
  }

  async function send(text: string) {
    const value = text.trim()

    if (!selected || !detail || !value || locked) return

    const id = selected

    setQuestion('')
    setPending(value)
    setBusy(true)
    setError('')

    try {
      const answer = await documentsApi.chat(id, value)

      setMessages(old => [
        ...old,
        {
          id: -Date.now(),
          role: 'user',
          content: value,
          sources: null,
          created_at: new Date().toISOString()
        },
        answer
      ])
    } catch (err) {
      setError(errorMessage(err))
      setQuestion(value)
    } finally {
      setPending('')
      setBusy(false)
    }
  }

  async function summarize() {
    if (!selected || !detail || locked) return

    setBusy(true)
    setError('')
    setSource(null)

    try {
      const result = await documentsApi.summarize(selected)

      setDetail(old => old
        ? { ...old, summary: result.summary }
        : old)

      setDocuments(old => old.map(document =>
        document.id === selected
          ? { ...document, summary: result.summary }
          : document
      ))

      setTab('summary')
      setPreview(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function removeDocument() {
    if (!selected || locked) return

    if (!window.confirm('Delete this document and its conversation?')) {
      return
    }

    setBusy(true)

    try {
      await documentsApi.remove(selected)

      setDocuments(old => old.filter(item => item.id !== selected))
      setSelected(null)
      setDetail(null)
      setMessages([])
      setSource(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function clearChat() {
    if (!selected || locked) return
    if (!window.confirm('Clear this conversation?')) return

    setBusy(true)

    try {
      await documentsApi.clearMessages(selected)
      setMessages([])
      setSource(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function copy(message: Message) {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(message.id)
      window.setTimeout(() => setCopied(null), 1800)
    } catch {
      setError('Unable to copy this answer.')
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    void send(question)
  }

  const filtered = documents.filter(document =>
    document.filename.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="workspace">
      <input
        ref={fileInput}
        type="file"
        accept=".pdf,.docx,.txt"
        hidden
        onChange={event => {
          const file = event.target.files?.[0]
          event.target.value = ''
          void upload(file)
        }}
      />

      {sidebar && (
        <div className="mobile-overlay" onClick={() => setSidebar(false)} />
      )}

      <aside className={`sidebar ${sidebar ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <span className="brand-icon"><Sparkles /></span>
          documind<span>.</span>
        </div>

        <div className="sidebar-top">
          <button
            className="primary-button"
            disabled={locked}
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? <LoaderCircle className="spin" size={18} /> : <Plus size={18} />}
            Upload document
          </button>

          <div className="search-field">
            <Search size={16} />
            <input
              placeholder="Search documents..."
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </div>
        </div>

        <div className="library-label">
          YOUR LIBRARY
          <span>{documents.length}/20</span>
        </div>

        <div className="document-list">
          {loading && <div className="muted">Loading documents...</div>}

          {!loading && !filtered.length && (
            <div className="muted">No documents found.</div>
          )}

          {filtered.map(document => (
            <button
              key={document.id}
              disabled={locked}
              className={`document-item ${selected === document.id ? 'active' : ''}`}
              onClick={() => void openDocument(document.id)}
            >
              <div className={`file-icon ${document.file_type}`}>
                <FileText size={20} />
              </div>
              <div className="document-meta">
                <strong>{document.filename}</strong>
                <small>
                  {document.file_type.toUpperCase()} · {formatSize(document.file_size)}
                </small>
              </div>
            </button>
          ))}
        </div>

        <div className="sidebar-bottom">
          <div className="ai-status">
            <span className="status-dot" />
            Powered by Google Gemini
          </div>

          <div className="account">
            <div className="avatar">{user.name.charAt(0).toUpperCase()}</div>
            <div className="account-meta">
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </div>
            <button className="icon-button" title="Sign out" onClick={onLogout}>
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="workspace-header">
          <button
            className="icon-button mobile-menu"
            title="Open library"
            onClick={() => setSidebar(true)}
          >
            <Menu size={21} />
          </button>

          <div className="header-title">
            <h2>{detail?.filename || 'My workspace'}</h2>
            <p>{detail ? 'Document intelligence' : 'Your personal AI document assistant'}</p>
          </div>

          {detail && (
            <div className="header-actions">
              <button
                className="secondary-button"
                disabled={locked}
                onClick={() => void summarize()}
              >
                <Sparkles size={16} />
                <span>Summarize</span>
              </button>

              <button
                className="icon-button"
                title="Clear conversation"
                disabled={locked}
                onClick={() => void clearChat()}
              >
                <MessageSquare size={18} />
              </button>

              <button
                className="icon-button danger"
                title="Delete document"
                disabled={locked}
                onClick={() => void removeDocument()}
              >
                <Trash2 size={18} />
              </button>

              <button
                className="icon-button"
                title="Toggle document preview"
                onClick={() => setPreview(!preview)}
              >
                <PanelRight size={19} />
              </button>
            </div>
          )}
        </header>

        {error && (
          <div className="workspace-error error-banner">
            <AlertCircle size={18} />
            <span>{error}</span>
            <button onClick={() => setError('')} aria-label="Dismiss error">
              <X size={16} />
            </button>
          </div>
        )}

        {opening ? (
          <div className="center-state">
            <LoaderCircle className="spin" size={32} />
            <p>Opening document...</p>
          </div>
        ) : !detail ? (
          <motion.div
            className="empty-workspace"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="hero-symbol"><Sparkles size={38} /></div>
            <div className="eyebrow">AI DOCUMENT INTELLIGENCE</div>
            <h1>Knowledge, <span>unlocked.</span></h1>
            <p>
              Upload a document and discover a smarter way
              to read, understand and explore information.
            </p>

            <div
              className={`drop-zone ${dragging ? 'dragging' : ''}`}
              onDragOver={event => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={drop}
            >
              <UploadCloud size={35} />
              <h3>Drop your document here</h3>
              <p>PDF, DOCX or TXT · Up to 10 MB</p>

              <button
                className="primary-button"
                disabled={locked}
                onClick={() => fileInput.current?.click()}
              >
                {uploading ? 'Processing document...' : 'Browse files'}
              </button>
            </div>

            <div className="feature-grid">
              <div><MessageSquare /><strong>Ask questions</strong><small>Get contextual answers</small></div>
              <div><Layers /><strong>Summarize</strong><small>Find the key insights</small></div>
              <div><BookOpen /><strong>Explore sources</strong><small>Verify document excerpts</small></div>
            </div>

            <small className="privacy-note">
              Demo workspace. Use non-confidential documents.
              AI requests send relevant text to Google Gemini.
            </small>
          </motion.div>
        ) : (
          <>
            <div className="chat-scroll">
              {!messages.length && !pending && (
                <div className="chat-welcome">
                  <div className="hero-symbol"><Sparkles size={30} /></div>
                  <h2>Let's explore your document.</h2>
                  <p>Ask a question or start with one of these suggestions.</p>

                  <div className="suggestion-grid">
                    {suggestions.map(item => (
                      <button
                        key={item}
                        disabled={locked}
                        onClick={() => void send(item)}
                      >
                        <Sparkles size={16} />
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map(message => (
                <motion.div
                  key={message.id}
                  className={`message ${message.role}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {message.role === 'assistant' && (
                    <div className="assistant-avatar"><Sparkles size={18} /></div>
                  )}

                  <div className="message-body">
                    {message.role === 'assistant' && (
                      <div className="message-author">DocuMind AI</div>
                    )}

                    <div className="markdown">
                      {message.role === 'assistant'
                        ? <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              a: ({ children }) => <span>{children}</span>,
                              img: () => null
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                        : <p>{message.content}</p>}
                    </div>

                    {!!message.sources?.length && (
                      <div className="sources">
                        <small>DOCUMENT SOURCES</small>
                        <div className="source-buttons">
                          {message.sources.map(item => (
                            <button
                              key={item.chunk_id}
                              onClick={() => {
                                setSource(item)
                                setTab('text')
                                setPreview(true)
                              }}
                            >
                              <FileText size={14} />
                              {item.label} · {item.page_number
                                ? `Page ${item.page_number}`
                                : `Passage ${item.chunk_index + 1}`}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {message.role === 'assistant' && (
                      <button
                        className="copy-button"
                        onClick={() => void copy(message)}
                      >
                        {copied === message.id ? <Check size={14} /> : <Copy size={14} />}
                        {copied === message.id ? 'Copied' : 'Copy answer'}
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}

              {pending && (
                <div className="message user">
                  <div className="message-body">{pending}</div>
                </div>
              )}

              {busy && (
                <div className="thinking">
                  <LoaderCircle className="spin" size={18} />
                  {pending ? 'Analyzing your document...' : 'Processing request...'}
                </div>
              )}

              <div ref={chatEnd} />
            </div>

            <div className="composer-area">
              <form className="composer" onSubmit={submit}>
                <textarea
                  value={question}
                  onChange={event => setQuestion(event.target.value)}
                  placeholder="Ask anything about your document..."
                  maxLength={2000}
                  rows={2}
                  disabled={locked}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void send(question)
                    }
                  }}
                />
                <button
                  className="send-button"
                  disabled={locked || question.trim().length < 2}
                  title="Send message"
                >
                  <Send size={19} />
                </button>
              </form>
              <small>AI can make mistakes. Verify important answers with your document.</small>
            </div>
          </>
        )}
      </main>

      {detail && preview && (
        <aside className="preview-panel">
          <div className="preview-header">
            <div><BookOpen size={18} /> Document preview</div>
            <button className="icon-button" title="Close preview" onClick={() => setPreview(false)}>
              <X size={18} />
            </button>
          </div>

          <div className="preview-stats">
            <div>
              <strong>{detail.file_type === 'pdf' ? detail.page_count : '-'}</strong>
              <small>Pages</small>
            </div>
            <div><strong>{detail.chunk_count}</strong><small>Passages</small></div>
            <div><strong>{formatSize(detail.file_size)}</strong><small>File size</small></div>
          </div>

          <div className="preview-tabs">
            <button className={tab === 'text' ? 'active' : ''} onClick={() => setTab('text')}>Document</button>
            <button className={tab === 'summary' ? 'active' : ''} onClick={() => setTab('summary')}>AI summary</button>
          </div>

          <div className="preview-content">
            {tab === 'text' ? (
              <>
                {source && (
                  <div className="source-excerpt">
                    <div>
                      <strong>{source.label} · {source.page_number
                        ? `Page ${source.page_number}`
                        : `Passage ${source.chunk_index + 1}`}</strong>
                      <button title="Close excerpt" onClick={() => setSource(null)}><X size={15} /></button>
                    </div>
                    <p>{source.excerpt}</p>
                  </div>
                )}
                <article className="document-paper">
                  <h3>{detail.filename}</h3>
                  <p>{detail.extracted_text}</p>
                </article>
              </>
            ) : detail.summary ? (
              <article className="summary-content markdown">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ children }) => <span>{children}</span>,
                    img: () => null
                  }}
                >
                  {detail.summary}
                </ReactMarkdown>
              </article>
            ) : (
              <div className="summary-empty">
                <Sparkles size={30} />
                <h3>Understand more, read less.</h3>
                <p>Generate an AI-powered summary of your document.</p>
                <button className="primary-button" disabled={locked} onClick={() => void summarize()}>
                  Generate summary
                </button>
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}
