import { useState, useMemo } from 'react'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import { AnimatePresence, motion } from 'framer-motion'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import Navigation from '../Navigation/Navigation'
import SearchBar from '../SearchBar/SearchBar'
import FeedCard from '../FeedCard/FeedCard'
import Sidebar from '../Sidebar/Sidebar'
import { useFeed } from '../../hooks/useFeed'
import { useVectorSearch } from '../../hooks/useVectorSearch'
import type { Category } from '../../types'

export default function Dashboard() {
  const [activeCategory, setActiveCategory] = useState<Category>('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [committedQuery, setCommittedQuery] = useState('')

  const { items, sources, total, categoryTotals, loading, loadingMore, hasMore, loadMore, error } = useFeed(activeCategory)
  const { results: vectorResults, loading: vectorLoading } = useVectorSearch(committedQuery, activeCategory)

  const keywordItems = useMemo(() => {
    if (!committedQuery.trim()) return items

    const q = committedQuery.toLowerCase().trim()
    // 제목·출처 매칭 우선, summary는 단어 경계로 정확 매칭
    const wordRe = new RegExp(`(^|\\s)${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i')
    return items.filter((item) =>
      item.title.toLowerCase().includes(q) ||
      item.sourceName.toLowerCase().includes(q) ||
      item.summary.some((s) => wordRe.test(s))
    )
  }, [items, committedQuery])

  // 벡터 + 키워드 결과 병합 (중복 제거, 벡터 결과 우선)
  const displayedItems = useMemo(() => {
    if (!committedQuery.trim()) return items
    if (!vectorResults) return keywordItems

    const seen = new Set(vectorResults.map((i) => i.id))
    return [...vectorResults, ...keywordItems.filter((i) => !seen.has(i.id))]
  }, [committedQuery, vectorResults, keywordItems, items])

  const isVectorActive = committedQuery.trim().length > 0 && vectorResults !== null
  const totalCount = committedQuery.trim() ? displayedItems.length : total

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
            <SearchBar
              value={searchQuery}
              onChange={(v) => {
                setSearchQuery(v)
                // 입력 지우면 벡터 결과도 초기화
                if (!v.trim()) setCommittedQuery('')
              }}
              onSubmit={(v) => setCommittedQuery(v)}
            />

            {/* Stats bar */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TrendingUpIcon sx={{ fontSize: 14, color: '#10b981' }} />
              <Typography variant="caption" sx={{ color: '#71717a', fontSize: 12, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box component="span" sx={{ color: '#a1a1aa', fontWeight: 500 }}>
                  {totalCount}
                </Box>
                {' '}
                {isVectorActive ? (
                  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                    건 유사 검색됨
                    <AutoAwesomeIcon sx={{ fontSize: 11, color: '#3b82f6', verticalAlign: 'middle' }} />
                  </Box>
                ) : (
                  committedQuery ? '건 검색됨' : '건 수집됨'
                )}
                {vectorLoading && committedQuery && (
                  <CircularProgress
                    size={12}
                    thickness={5}
                    sx={{ color: '#3b82f6', ml: 0.5, verticalAlign: 'middle' }}
                  />
                )}
              </Typography>
              <Typography variant="caption" sx={{ color: '#3f3f46', fontSize: 12 }}>·</Typography>
              <Typography variant="caption" sx={{ color: '#71717a', fontSize: 12 }}>
                방금 업데이트됨
              </Typography>
              {committedQuery && (
                <>
                  <Typography variant="caption" sx={{ color: '#3f3f46', fontSize: 12 }}>·</Typography>
                  <Typography variant="caption" sx={{ color: '#71717a', fontSize: 12 }}>
                    검색 중:{' '}
                    <Box component="span" sx={{ color: '#3b82f6', fontWeight: 500 }}>
                      &ldquo;{committedQuery}&rdquo;
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
                  {displayedItems.length > 0 ? (
                    <Grid container spacing={2}>
                      {displayedItems.map((item, index) => (
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
                        {committedQuery && (
                          <Button
                            variant="text"
                            size="small"
                            onClick={() => { setSearchQuery(''); setCommittedQuery('') }}
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
          {!loading && hasMore && !committedQuery && (
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
          <Sidebar sources={sources} categoryTotals={categoryTotals} />
        </Box>
      </Container>
    </Box>
  )
}
