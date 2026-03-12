export type Category = 'All' | 'AI Trends' | 'Tech Blogs'

export interface FeedItem {
  id: string
  category: Exclude<Category, 'All'>
  title: string
  summary: string[]  // 3 bullet points
  sourceUrl: string
  sourceName: string
  collectedAt: string
}

export type SourceStatus = 'active' | 'pending' | 'error'

export interface DataSource {
  id: string
  name: string
  status: SourceStatus
  lastCrawled: string
  itemsCollected: number
}

export type AppPage = 'feed' | 'local' | 'stock'

export interface LocalPlace {
  name: string
  category: string
  distance: string   // e.g. "150m" or "1.2km"
  address: string
  phone: string
  rating?: number    // AI-estimated rating (1.0–5.0)
  x: string          // longitude for reference
  y: string          // latitude for reference
  placeUrl: string   // kakao map url
  tags?: string[]    // AI-generated tags
}
