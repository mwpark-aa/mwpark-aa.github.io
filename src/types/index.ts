export type Category = 'All' | 'AI Trends' | 'Tech Blogs' | 'Hot Deals'

export interface FeedItem {
  id: string
  category: Exclude<Category, 'All'>
  title: string
  summary: string[]  // 3 bullet points
  sourceUrl: string
  sourceName: string
  collectedAt: string
  readTime: string
}

export type SourceStatus = 'active' | 'pending' | 'error'

export interface DataSource {
  id: string
  name: string
  status: SourceStatus
  lastCrawled: string
  itemsCollected: number
}
