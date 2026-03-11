import { useState, useMemo } from 'react'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import { AnimatePresence, motion } from 'framer-motion'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import Navigation from '../Navigation/Navigation'
import SearchBar from '../SearchBar/SearchBar'
import FeedCard from '../FeedCard/FeedCard'
import Sidebar from '../Sidebar/Sidebar'
import { useFeed } from '../../hooks/useFeed'
import type { Category } from '../../types'

export default function Dashboard() {
  const [activeCategory, setActiveCategory] = useState<Category>('All')
  const [searchQuery, setSearchQuery] = useState('')

  const { items, sources, loading, loadingMore, hasMore, loadMore, error } = useFeed(activeCategory)

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items

    const q = searchQuery.toLowerCase().trim()
    return items.filter((item) =>
      item.title.toLowerCase().includes(q) ||
      item.summary.some((s) => s.toLowerCase().includes(q)) ||
      item.sourceName.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
    )
  }, [items, searchQuery])

  const totalCount = filteredItems.length

  return (
    <Box sx={{ minHeight: '100vh', background: '#09090b' }}>
      {/* Sticky navigation */}
      <Navigation
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
      />

      {/* Main content */}
      <Container maxWidth="xl" sx={{ py: 3, px: { xs: 2, md: 3 }, minHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column-reverse', md: 'row' },
            gap: 3,
            flexGrow: 1,
            alignItems: 'stretch',
          }}
        >
          {/* LEFT: Main feed column */}
          <Box
            sx={{
              flex: 1,
              width: '100%',
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 2.5,
            }}
          >
            {/* Search bar */}
            <SearchBar value={searchQuery} onChange={setSearchQuery} />

            {/* Stats bar */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TrendingUpIcon sx={{ fontSize: 14, color: '#10b981' }} />
              <Typography variant="caption" sx={{ color: '#71717a', fontSize: 12 }}>
                <Box component="span" sx={{ color: '#a1a1aa', fontWeight: 500 }}>
                  {totalCount}
                </Box>
                {' '}
                {searchQuery ? '건 검색됨' : '건 수집됨'}
              </Typography>
              <Typography variant="caption" sx={{ color: '#3f3f46', fontSize: 12 }}>·</Typography>
              <Typography variant="caption" sx={{ color: '#71717a', fontSize: 12 }}>
                방금 업데이트됨
              </Typography>
              {searchQuery && (
                <>
                  <Typography variant="caption" sx={{ color: '#3f3f46', fontSize: 12 }}>·</Typography>
                  <Typography variant="caption" sx={{ color: '#71717a', fontSize: 12 }}>
                    검색 중:{' '}
                    <Box component="span" sx={{ color: '#3b82f6', fontWeight: 500 }}>
                      &ldquo;{searchQuery}&rdquo;
                    </Box>
                  </Typography>
                </>
              )}
            </Box>

            {/* Error banner */}
            {error && (
              <Box
                sx={{
                  background: 'rgba(245,158,11,0.1)',
                  border: '1px solid rgba(245,158,11,0.2)',
                  borderRadius: 2,
                  p: 1.5,
                  mb: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <Typography variant="caption" sx={{ color: '#f59e0b' }}>{error}</Typography>
              </Box>
            )}

            <Box
              role="feed"
              aria-label="지식 피드"
              aria-live="polite"
              sx={{ flexGrow: 1 }}
            >
              {loading ? (
                // Loading skeleton — 4 placeholder cards
                <Grid container spacing={2}>
                  {[...Array(4)].map((_, i) => (
                    <Grid item xs={12} sm={6} key={i}>
                      <Box
                        sx={{
                          background: '#18181b',
                          border: '1px solid #27272a',
                          borderRadius: 3,
                          p: 2.5,
                          height: 260,
                        }}
                      >
                        <Box sx={{ background: '#27272a', borderRadius: 1, height: 20, width: '30%', mb: 2 }} />
                        <Box sx={{ background: '#27272a', borderRadius: 1, height: 16, width: '90%', mb: 1 }} />
                        <Box sx={{ background: '#27272a', borderRadius: 1, height: 16, width: '70%', mb: 2 }} />
                        <Box
                          sx={{
                            background: 'rgba(16,185,129,0.05)',
                            border: '1px solid rgba(16,185,129,0.15)',
                            borderRadius: 2,
                            p: 1.5,
                            height: 80,
                          }}
                        />
                      </Box>
                    </Grid>
                  ))}
                </Grid>
              ) : (
                <AnimatePresence mode="popLayout">
                  {filteredItems.length > 0 ? (
                    <Grid container spacing={2}>
                      {filteredItems.map((item, index) => (
                        <Grid item xs={12} sm={6} key={item.id} sx={{ display: 'flex', width: '100%' }}>
                          <FeedCard item={item} index={index} />
                        </Grid>
                      ))}
                    </Grid>
                  ) : (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ duration: 0.25 }}
                    >
                      <Box
                        role="status"
                        aria-label="결과 없음"
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          py: 12,
                          gap: 1.5,
                          textAlign: 'center',
                        }}
                      >
                        <Box
                          sx={{
                            width: 48,
                            height: 48,
                            borderRadius: '50%',
                            background: '#18181b',
                            border: '1px solid #27272a',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <TrendingUpIcon sx={{ fontSize: 20, color: '#3f3f46' }} />
                        </Box>
                        <Typography variant="body2" sx={{ color: '#71717a', fontWeight: 500 }}>
                          결과 없음
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: '#3f3f46', maxWidth: 280, display: 'block', lineHeight: 1.6 }}
                        >
                          검색어를 바꾸거나 다른 카테고리를 선택해보세요.
                        </Typography>
                        {searchQuery && (
                          <Button
                            variant="text"
                            size="small"
                            onClick={() => setSearchQuery('')}
                            sx={{
                              mt: 1,
                              color: '#10b981',
                              textTransform: 'none',
                              fontSize: 12,
                              '&:hover': { background: 'rgba(16,185,129,0.08)' },
                            }}
                          >
                            검색 초기화
                          </Button>
                        )}
                      </Box>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </Box>
          {/* Load more */}
          {!loading && hasMore && (
            <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1 }}>
              <Button
                variant="outlined"
                disabled={loadingMore}
                onClick={loadMore}
                sx={{
                  color: '#10b981',
                  borderColor: 'rgba(16,185,129,0.4)',
                  textTransform: 'none',
                  fontSize: 13,
                  px: 4,
                  '&:hover': {
                    borderColor: '#10b981',
                    background: 'rgba(16,185,129,0.08)',
                  },
                }}
              >
                {loadingMore ? '불러오는 중...' : '더 보기'}
              </Button>
            </Box>
          )}
          </Box>

          {/* RIGHT: Sidebar — hidden on mobile/tablet */}
          <Sidebar sources={sources} items={items} />
        </Box>
      </Container>
    </Box>
  )
}
