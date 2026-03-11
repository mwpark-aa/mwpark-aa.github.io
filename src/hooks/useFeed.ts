import { useState, useEffect, useCallback } from 'react'
import type { FeedItem, DataSource, Category } from '../types'
import { feedItems as mockFeedItems, dataSources as mockDataSources } from '../data/mockData'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export function useFeed(category: Category) {
  const [items, setItems] = useState<FeedItem[]>([])
  const [sources, setSources] = useState<DataSource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      setError(null)

      // Fallback to mock if no env vars
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        setItems(mockFeedItems)
        setSources(mockDataSources)
        setLoading(false)
        return
      }

      try {
        const params = new URLSearchParams({ limit: '50' })
        if (category !== 'All') params.set('category', category)

        const [feedRes, sourcesRes] = await Promise.all([
          fetch(
            `${SUPABASE_URL}/functions/v1/feed?${params}`,
            { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
          ),
          fetch(
            `${SUPABASE_URL}/functions/v1/sources`,
            { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
          )
        ])

        if (!feedRes.ok) throw new Error(`Feed fetch failed: ${feedRes.status}`)

        const feedData = await feedRes.json()
        const sourcesData = sourcesRes.ok ? await sourcesRes.json() : mockDataSources

        setItems(feedData)
        setSources(sourcesData)
      } catch (err) {
        console.error('Failed to fetch from Supabase, using mock data:', err)
        // Graceful fallback
        setItems(mockFeedItems)
        setSources(mockDataSources)
        setError('실시간 데이터를 불러오지 못했습니다. 샘플 데이터를 표시합니다.')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [category])

  return { items, sources, loading, error }
}
