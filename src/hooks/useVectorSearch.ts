import { useState, useEffect, useRef } from 'react'
import type { FeedItem, Category } from '../types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

const DEBOUNCE_MS = 600
const MIN_QUERY_LENGTH = 2

interface VectorSearchResult {
  results: FeedItem[] | null
  loading: boolean
  error: string | null
}

export function useVectorSearch(query: string, category: Category): VectorSearchResult {
  const [results, setResults] = useState<FeedItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Track the latest request to avoid stale updates from concurrent fetches
  const abortControllerRef = useRef<AbortController | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Clear any pending debounce and in-flight request on every effect run
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    const trimmed = query.trim()

    // Empty query — reset to idle state immediately
    if (!trimmed) {
      setResults(null)
      setLoading(false)
      setError(null)
      return
    }

    // Query too short — reset without showing loading
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults(null)
      setLoading(false)
      setError(null)
      return
    }

    // No env vars configured — fall back silently so caller uses keyword filter
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setResults(null)
      setLoading(false)
      setError(null)
      return
    }

    // Debounce the actual fetch
    debounceTimerRef.current = setTimeout(async () => {
      const controller = new AbortController()
      abortControllerRef.current = controller

      setLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams({ q: trimmed, limit: '20', threshold: '0.8' })
        if (category !== 'All') {
          params.set('category', category)
        }

        const response = await fetch(
          `${SUPABASE_URL}/functions/v1/search?${params.toString()}`,
          {
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            },
            signal: controller.signal,
          }
        )

        if (!response.ok) {
          throw new Error(`Vector search failed: ${response.status}`)
        }

        const data = (await response.json()) as { items: FeedItem[]; query: string }
        // 결과가 없으면 null로 두어 keyword fallback 활성화
        setResults(data.items.length > 0 ? data.items : null)
        setError(null)
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Request was cancelled — do nothing, state will be updated by the next effect
          return
        }
        console.warn('Vector search unavailable, falling back to keyword search:', err)
        // Graceful fallback — null signals the caller to use its keyword filter
        setResults(null)
        setError(null)
      } finally {
        setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [query, category])

  return { results, loading, error }
}
