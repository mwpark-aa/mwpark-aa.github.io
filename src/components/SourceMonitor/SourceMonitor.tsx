import Paper from '@mui/material/Paper'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'
import type { DataSource, SourceStatus, FeedItem } from '../../types'

interface SourceMonitorProps {
  sources: DataSource[]
  items?: FeedItem[]
}

const statusConfig: Record<
  SourceStatus,
  { dotColor: string; pulse: boolean; chipColor: 'success' | 'warning' | 'error'; label: string }
> = {
  active: {
    dotColor: '#10b981',
    pulse: true,
    chipColor: 'success',
    label: '수집중',
  },
  pending: {
    dotColor: '#f59e0b',
    pulse: false,
    chipColor: 'warning',
    label: '대기중',
  },
  error: {
    dotColor: '#ef4444',
    pulse: false,
    chipColor: 'error',
    label: '오류',
  },
}

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}초 전`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  return `${hours}시간 전`
}

export default function SourceMonitor({ sources, items = [] }: SourceMonitorProps) {
  const visibleSources = sources.filter((s) => s.itemsCollected > 0)
  const activeCount = visibleSources.filter((s) => s.status === 'active').length

  const stats = [
    {
      label: 'AI Trends',
      value: items.filter((i) => i.category === 'AI Trends').length,
      color: '#10b981',
    },
    {
      label: 'Tech Blogs',
      value: items.filter((i) => i.category === 'Tech Blogs').length,
      color: '#3b82f6',
    },
    {
      label: 'Hot Deals',
      value: items.filter((i) => i.category === 'Hot Deals').length,
      color: '#f59e0b',
    },
  ] as const

  return (
    <Paper
      component="aside"
      aria-label="수집 현황"
      elevation={0}
      sx={{
        background: 'rgba(24,24,27,0.8)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(39,39,42,0.8)',
        borderRadius: 4,
        p: 2.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 2.5,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        transition: 'all 0.3s ease',
        '&:hover': {
          borderColor: 'rgba(16, 185, 129, 0.4)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          transform: 'translateY(-4px)',
        },
      }}
    >
      {/* Intelligence Stats - Moved inside SourceMonitor */}
      <Box>
        <Typography
          variant="subtitle2"
          sx={{ fontWeight: 600, color: '#fafafa', mb: 1.5, fontSize: 13 }}
        >
          카테고리별 현황
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
          {stats.map(({ label, value, color }) => (
            <Box
              key={label}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 0.5,
                px: 1,
                py: 1.25,
                borderRadius: 2,
                background: 'rgba(9,9,11,0.6)',
                border: '1px solid rgba(39,39,42,0.6)',
              }}
            >
              <Typography
                sx={{
                  fontSize: 20,
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  color,
                  lineHeight: 1,
                }}
              >
                {value}
              </Typography>
              <Typography
                sx={{
                  fontSize: 10,
                  color: '#71717a',
                  textAlign: 'center',
                  lineHeight: 1.3,
                }}
              >
                {label}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      <Divider sx={{ borderColor: '#27272a', opacity: 0.5 }} />

      {/* Source list */}
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FiberManualRecordIcon sx={{ color: '#10b981', fontSize: 16 }} />
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 600, color: '#fafafa', fontSize: 13 }}
            >
              소스별 상태
            </Typography>
          </Box>
          <Typography
            variant="caption"
            sx={{ color: '#71717a', fontFamily: 'monospace', fontSize: 11 }}
          >
            {activeCount}/{visibleSources.length} 수집중
          </Typography>
        </Box>

        <Box component="ul" role="list" sx={{ listStyle: 'none', p: 0, m: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {visibleSources.map((source) => {
            const config = statusConfig[source.status]
            return (
              <Box
                key={source.id}
                component="li"
                sx={{
                  py: 1.25,
                  px: 1.5,
                  borderRadius: 2,
                  background: 'rgba(9,9,11,0.6)',
                  border: '1px solid rgba(39,39,42,0.6)',
                  transition: 'border-color 0.15s ease',
                  '&:hover': {
                    borderColor: '#3f3f46',
                  },
                }}
              >
                {/* Name row + status chip */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 0.75 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                    <Box
                      className={config.pulse ? 'pulse-dot' : undefined}
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: config.dotColor,
                        flexShrink: 0,
                      }}
                    />
                    <Typography
                      variant="body2"
                      sx={{
                        color: '#fafafa',
                        fontWeight: 500,
                        fontSize: 12,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {source.name}
                    </Typography>
                  </Box>
                  <Chip
                    size="small"
                    label={config.label}
                    color={config.chipColor}
                    sx={{
                      height: 18,
                      fontSize: 10,
                      fontWeight: 600,
                      flexShrink: 0,
                      '& .MuiChip-label': { px: 0.75 },
                    }}
                  />
                </Box>

                {/* Stats row */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pl: 2.25 }}>
                  <Typography variant="caption" sx={{ color: '#71717a', fontSize: 11 }}>
                    {source.status === 'error' ? (
                      <Box component="span" sx={{ color: '#ef4444' }}>—</Box>
                    ) : (
                      <>
                        <Box component="span" sx={{ color: '#a1a1aa', fontFamily: 'monospace' }}>
                          {source.itemsCollected}
                        </Box>
                        {'건'}
                      </>
                    )}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#71717a', fontSize: 11 }}>
                    {formatRelativeTime(source.lastCrawled)}
                  </Typography>
                </Box>
              </Box>
            )
          })}
        </Box>
      </Box>

      {/* Footer */}
      <Typography
        variant="caption"
        sx={{
          display: 'block',
          color: '#71717a',
          textAlign: 'center',
          fontSize: 11,
          pt: 1.5,
          borderTop: '1px solid #27272a',
        }}
      >
        5분마다 자동 갱신
      </Typography>
    </Paper>
  )
}
