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

export interface LocalActivity {
  emoji: string
  name: string
  desc: string
}

export interface LocalPlace {
  name: string
  category: string
  rating: number
  desc: string
  tip: string
  address: string
}
