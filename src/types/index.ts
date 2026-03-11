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

export type AppPage = 'feed' | 'local'

export interface LocalPlace {
  name: string
  category: string
  distance: string   // e.g. "150m" or "1.2km"
  address: string
  phone: string
  placeUrl: string   // kakao map deep link
  rating?: number    // AI-estimated rating (1.0–5.0)
  imageUrl?: string  // Kakao Static Map or representative image
  x: string          // longitude for fallback image
  y: string          // latitude for fallback image
}
