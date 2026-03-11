import { useState, useEffect, useRef } from 'react'
import type { FeedItem, Category } from '../types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

interface VectorSearchResult {
  results: FeedItem[] | null
  loading: boolean
}

// committedQuery: Enter/버튼으로 확정된 쿼리만 벡터 검색 트리거
export function useVectorSearch(committedQuery: string, category: Category): VectorSearchResult {
  const [results, setResults] = useState<FeedItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    const trimmed = committedQuery.trim()

    if (!trimmed || trimmed.length < 2 || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setResults(null)
      setLoading(false)
      return
    }

    const controller = new AbortController()
    abortControllerRef.current = controller

    setLoading(true)

    const params = new URLSearchParams({ q: trimmed, threshold: '0' })
    if (category !== 'All') params.set('category', category)

    fetch(`${SUPABASE_URL}/functions/v1/search?${params.toString()}`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`)
        return res.json() as Promise<{ items: FeedItem[] }>
      })
      .then((data) => {
        setResults(data.items.length > 0 ? data.items : null)
      })
      .catch((err) => {
        if (err instanceof Error && err.name === 'AbortError') return
        console.warn('Vector search failed, falling back to keyword:', err)
        setResults(null)
      })
      .finally(() => setLoading(false))
  }, [committedQuery, category])

  return { results, loading }
}
