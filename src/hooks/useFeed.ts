import { useState, useEffect, useCallback } from 'react'
import type { FeedItem, DataSource, Category } from '../types'
import { feedItems as mockFeedItems, dataSources as mockDataSources } from '../data/mockData'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const PAGE_SIZE = 20

export function useFeed(category: Category) {
  const [items, setItems] = useState<FeedItem[]>([])
  const [sources, setSources] = useState<DataSource[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  // Reset when category changes
  useEffect(() => {
    setItems([])
    setOffset(0)
    setHasMore(false)
  }, [category])

  useEffect(() => {
    async function fetchData() {
      const isFirstPage = offset === 0
      if (isFirstPage) {
        setLoading(true)
      } else {
        setLoadingMore(true)
      }
      setError(null)

      // Fallback to mock if no env vars
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        setItems(mockFeedItems)
        setSources(mockDataSources)
        setLoading(false)
        setLoadingMore(false)
        setHasMore(false)
        return
      }

      try {
        const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) })
        if (category !== 'All') params.set('category', category)

        const fetchFeed = fetch(
          `${SUPABASE_URL}/functions/v1/feed?${params}`,
          { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
        )

        if (isFirstPage) {
          const [feedRes, sourcesRes] = await Promise.all([
            fetchFeed,
            fetch(
              `${SUPABASE_URL}/functions/v1/sources`,
              { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
            )
          ])

          if (!feedRes.ok) throw new Error(`Feed fetch failed: ${feedRes.status}`)
          const feedData = await feedRes.json()
          const sourcesData = sourcesRes.ok ? await sourcesRes.json() : mockDataSources

          setItems(feedData.items)
          setSources(sourcesData)
          setHasMore(feedData.offset + feedData.limit < feedData.total)
        } else {
          const feedRes = await fetchFeed
          if (!feedRes.ok) throw new Error(`Feed fetch failed: ${feedRes.status}`)
          const feedData = await feedRes.json()

          setItems((prev) => [...prev, ...feedData.items])
          setHasMore(feedData.offset + feedData.limit < feedData.total)
        }
      } catch (err) {
        console.error('Failed to fetch from Supabase, using mock data:', err)
        setItems(mockFeedItems)
        setSources(mockDataSources)
        setError('실시간 데이터를 불러오지 못했습니다. 샘플 데이터를 표시합니다.')
        setHasMore(false)
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    }

    fetchData()
  }, [category, offset])

  const loadMore = useCallback(() => {
    setOffset((prev) => prev + PAGE_SIZE)
  }, [])

  return { items, sources, loading, loadingMore, hasMore, loadMore, error }
}
