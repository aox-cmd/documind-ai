import axios from 'axios'

export interface User {
  id: number
  name: string
  email: string
  created_at: string
}

export interface AuthResponse {
  access_token: string
  token_type: string
  user: User
}

export interface DocumentItem {
  id: number
  filename: string
  file_type: string
  file_size: number
  page_count: number
  status: string
  summary: string | null
  created_at: string
}

export interface DocumentDetail extends DocumentItem {
  extracted_text: string
  chunk_count: number
}

export interface Source {
  label: string
  chunk_id: number
  page_number: number | null
  chunk_index: number
  excerpt: string
  score: number | null
}

export interface Message {
  id: number
  role: 'user' | 'assistant'
  content: string
  sources: Source[] | null
  created_at: string
}

export interface Chunk {
  id: number
  content: string
  page_number: number | null
  chunk_index: number
}

export interface Summary {
  summary: string
  sources: Source[]
  sampled: boolean
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api',
  timeout: 90000
})

let accessToken: string | null = null

export function setToken(token: string | null) {
  accessToken = token
}

api.interceptors.request.use(config => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

api.interceptors.response.use(
  response => response,
  error => {
    if (
      error.response?.status === 401 &&
      accessToken &&
      !error.config?.url?.includes('/auth/login')
    ) {
      window.dispatchEvent(new Event('documind:expired'))
    }
    return Promise.reject(error)
  }
)

function expectArray<T>(data: unknown): T[] {
  if (!Array.isArray(data)) {
    throw new Error('Unexpected API response.')
  }
  return data as T[]
}

export const authApi = {
  register: async (
    name: string,
    email: string,
    password: string
  ): Promise<AuthResponse> =>
    (await api.post('/auth/register', {
      name, email, password
    })).data,

  login: async (
    email: string,
    password: string
  ): Promise<AuthResponse> => {
    const body = new URLSearchParams()
    body.set('username', email)
    body.set('password', password)

    return (await api.post('/auth/login', body)).data
  },

  me: async (): Promise<User> =>
    (await api.get('/auth/me')).data
}

export const documentsApi = {
  list: async (): Promise<DocumentItem[]> =>
    expectArray<DocumentItem>(
      (await api.get('/documents')).data
    ),

  upload: async (file: File): Promise<DocumentItem> => {
    const body = new FormData()
    body.append('file', file)
    return (await api.post('/documents/upload', body)).data
  },

  get: async (id: number): Promise<DocumentDetail> =>
    (await api.get(`/documents/${id}`)).data,

  chunks: async (id: number): Promise<Chunk[]> =>
    expectArray<Chunk>(
      (await api.get(`/documents/${id}/chunks`)).data
    ),

  remove: async (id: number) =>
    api.delete(`/documents/${id}`),

  messages: async (id: number): Promise<Message[]> =>
    expectArray<Message>(
      (await api.get(`/documents/${id}/messages`)).data
    ),

  chat: async (
    id: number,
    question: string
  ): Promise<Message> =>
    (await api.post(`/documents/${id}/chat`, {
      question
    })).data,

  summarize: async (id: number): Promise<Summary> =>
    (await api.post(`/documents/${id}/summarize`)).data,

  clearMessages: async (id: number) =>
    api.delete(`/documents/${id}/messages`)
}

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail

    if (typeof detail === 'string') return detail

    if (Array.isArray(detail)) {
      return detail.map(item => item.msg).join('. ')
    }

    if (error.code === 'ECONNABORTED') {
      return 'The request timed out. Please try again.'
    }

    return 'Unable to complete your request. Please try again.'
  }

  return error instanceof Error
    ? error.message
    : 'Something went wrong.'
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
