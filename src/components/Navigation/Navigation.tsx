import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import { motion, AnimatePresence } from 'framer-motion'
import type { Category } from '../../types'

const CATEGORIES: Category[] = ['All', 'AI Trends', 'Tech Blogs', 'Hot Deals']

interface NavigationProps {
  activeCategory: Category
  onCategoryChange: (c: Category) => void
  totalCount: number
}

export default function Navigation({ activeCategory, onCategoryChange, totalCount }: NavigationProps) {
  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        background: '#09090b',
        borderBottom: '1px solid #27272a',
        backdropFilter: 'blur(8px)',
      }}
    >
      <Toolbar
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          px: { xs: 1.5, sm: 3 },
          minHeight: { xs: 56, sm: 64 },
          gap: { xs: 1, sm: 2 },
        }}
      >
        {/* LEFT: Logo */}
        <Typography
          component="span"
          sx={{
            fontFamily: 'monospace',
            color: '#10b981',
            fontWeight: 700,
            fontSize: { xs: 16, sm: 18 },
            letterSpacing: '0.05em',
            flexShrink: 0,
            userSelect: 'none',
          }}
        >
          ⚡ Minwoo
        </Typography>

        {/* CENTER: Category filter pills */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            background: '#18181b',
            border: '1px solid #27272a',
            borderRadius: 2,
            p: '4px',
            overflowX: 'auto',
            whiteSpace: 'nowrap',
            flex: { xs: 1, sm: '0 1 auto' },
            mx: { xs: 0, sm: 2 },
            '&::-webkit-scrollbar': { display: 'none' },
            msOverflowStyle: 'none',
            scrollbarWidth: 'none',
          }}
        >
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat
            return (
              <Box key={cat} sx={{ position: 'relative' }}>
                {isActive && (
                  <motion.span
                    layoutId="nav-active-bg"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: 8,
                      background: '#10b981',
                      zIndex: 0,
                    }}
                    transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                  />
                )}
                <Button
                  onClick={() => onCategoryChange(cat)}
                  disableRipple={false}
                  aria-pressed={isActive}
                  aria-label={`Filter by ${cat}`}
                  sx={{
                    position: 'relative',
                    zIndex: 1,
                    px: { xs: 1.5, sm: 2 },
                    py: 0.75,
                    borderRadius: 2,
                    fontSize: { xs: 11, sm: 13 },
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? '#09090b' : '#71717a',
                    background: 'transparent',
                    textTransform: 'none',
                    transition: 'color 0.15s ease',
                    minWidth: 'auto',
                    lineHeight: 1.4,
                    '&:hover': {
                      color: isActive ? '#09090b' : '#fafafa',
                      background: 'transparent',
                    },
                  }}
                >
                  {cat}
                </Button>
              </Box>
            )
          })}
        </Box>

        {/* RIGHT: Live indicator */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            background: '#18181b',
            border: '1px solid #27272a',
            borderRadius: '999px',
            px: 1.5,
            py: 0.75,
            flexShrink: 0,
          }}
        >
          <Box
            className="pulse-dot"
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#10b981',
              flexShrink: 0,
            }}
          />
          <Typography
            component="span"
            sx={{
              fontSize: 12,
              color: '#fafafa',
              fontWeight: 500,
              whiteSpace: 'nowrap',
              display: { xs: 'none', sm: 'inline' },
            }}
          >
            Live
          </Typography>
          <AnimatePresence mode="wait">
            <motion.span
              key={totalCount}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.2 }}
              style={{
                display: 'inline-block',
                fontFamily: 'monospace',
                fontSize: 12,
                color: '#10b981',
                fontWeight: 600,
              }}
            >
              {totalCount}
            </motion.span>
          </AnimatePresence>
        </Box>
      </Toolbar>
    </AppBar>
  )
}
