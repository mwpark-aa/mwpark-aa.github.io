import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import { motion } from 'framer-motion'
import type { FeedItem } from '../../types'

interface FeedCardProps {
  item: FeedItem
  index: number
}

const categoryConfig: Record<
  FeedItem['category'],
  { color: string; background: string; label: string }
> = {
  'AI Trends': {
    color: '#10b981',
    background: 'rgba(16,185,129,0.1)',
    label: 'AI Trends',
  },
  'Tech Blogs': {
    color: '#3b82f6',
    background: 'rgba(59,130,246,0.1)',
    label: 'Tech Blog',
  },
}

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function FeedCard({ item, index }: FeedCardProps) {
  const catConfig = categoryConfig[item.category]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10, scale: 0.97 }}
      transition={{
        duration: 0.3,
        delay: index * 0.08,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', minHeight: '320px' }}
    >
      <Card
        component="article"
        aria-label={item.title}
        sx={{
          background: '#18181b',
          border: '1px solid #27272a',
          borderRadius: 3,
          boxShadow: 'none',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          transition: 'all 0.2s ease',
          '&:hover': {
            borderColor: '#52525b',
            transform: 'translateY(-2px)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          },
        }}
      >
        <CardContent
          sx={{
            p: { xs: 2, sm: 2.5 },
            '&:last-child': { pb: { xs: 2, sm: 2.5 } },
            display: 'flex',
            flexDirection: 'column',
            flexGrow: 1,
            height: '100%',
          }}
        >
          {/* Grows to fill available space */}
          <Box sx={{ flex: 1 }}>
            {/* Top row: category chip + time */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
              <Chip
                label={catConfig.label}
                size="small"
                sx={{
                  color: catConfig.color,
                  background: catConfig.background,
                  fontWeight: 600,
                  fontSize: 11,
                  height: 22,
                  borderRadius: 1,
                  '& .MuiChip-label': { px: 1 },
                }}
              />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AccessTimeIcon sx={{ fontSize: 12, color: '#71717a' }} />
                <Typography variant="caption" sx={{ color: '#71717a', fontSize: 11 }}>
                  {formatRelativeTime(item.collectedAt)}
                </Typography>
              </Box>
            </Box>

            {/* Title */}
            <Typography
              variant="h6"
              sx={{
                fontWeight: 600,
                color: '#fafafa',
                mt: 1.5,
                fontSize: { xs: 14, sm: 15 },
                lineHeight: 1.4,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                minHeight: '2.8em',
              }}
            >
              {item.title}
            </Typography>

            {/* Analysis section */}
            <Box
              mt={2}
              p={1.5}
              sx={{
                background: 'rgba(16,185,129,0.05)',
                borderRadius: 2,
                border: '1px solid rgba(16,185,129,0.15)',
              }}
            >
              <List dense disablePadding>
                {item.summary.map((bullet, i) => (
                  <ListItem key={i} disablePadding sx={{ alignItems: 'flex-start', py: 0.25 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        color: '#a1a1aa',
                        fontSize: 12,
                        lineHeight: 1.6,
                      }}
                    >
                      · {bullet}
                    </Typography>
                  </ListItem>
                ))}
              </List>
            </Box>
          </Box>

          {/* Always pinned to bottom */}
          <Divider sx={{ borderColor: '#27272a', mt: 1.5, mb: 1.5 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="caption" sx={{ color: '#71717a', fontSize: 11 }}>
              {item.sourceName}
            </Typography>
            <Button
              variant="text"
              size="small"
              endIcon={<OpenInNewIcon sx={{ fontSize: '12px !important' }} />}
              href={item.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              component="a"
              aria-label={`원문 보기: ${item.title}`}
              sx={{
                color: '#3b82f6',
                textTransform: 'none',
                fontSize: 12,
                fontWeight: 500,
                p: '2px 6px',
                minWidth: 'auto',
                '&:hover': {
                  color: '#60a5fa',
                  background: 'rgba(59,130,246,0.08)',
                },
              }}
            >
              원문 보기
            </Button>
          </Box>
        </CardContent>
      </Card>
    </motion.div>
  )
}
