import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import { motion } from 'framer-motion'
import NewspaperOutlinedIcon from '@mui/icons-material/NewspaperOutlined'
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import CurrencyBitcoinIcon from '@mui/icons-material/CurrencyBitcoin'
import type { Category, AppPage } from '../../types'

const CATEGORIES: Category[] = ['All', 'AI Trends', 'Tech Blogs']

interface NavigationProps {
  activePage: AppPage
  onPageChange: (p: AppPage) => void
  activeCategory: Category
  onCategoryChange: (c: Category) => void
}

const PAGE_TABS: { key: AppPage; label: string; Icon: React.ElementType }[] = [
  { key: 'local', label: '근처', Icon: LocationOnOutlinedIcon },
  { key: 'feed', label: '피드', Icon: NewspaperOutlinedIcon },
  { key: 'stock', label: '주식', Icon: ShowChartIcon },
  { key: 'crypto', label: '코인봇', Icon: CurrencyBitcoinIcon },
]

export default function Navigation({ activePage, onPageChange, activeCategory, onCategoryChange }: NavigationProps) {
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
            fontSize: { xs: 15, sm: 18 },
            letterSpacing: '0.05em',
            flexShrink: 0,
            userSelect: 'none',
          }}
        >
          ⚡ Minwoo
        </Typography>

        {/* CENTER: Category filter pills — only on feed */}
        {activePage === 'feed' && (
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
              flex: '0 1 auto',
              mx: 2,
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
        )}

        {/* RIGHT: Page switcher */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            background: '#18181b',
            border: '1px solid #27272a',
            borderRadius: 2,
            p: '4px',
            flexShrink: 0,
          }}
        >
          {PAGE_TABS.map(({ key, label, Icon }) => {
            const isActive = activePage === key
            return (
              <Box key={key} sx={{ position: 'relative' }}>
                {isActive && (
                  <motion.span
                    layoutId="page-active-bg"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: 8,
                      background: '#3b82f6',
                      zIndex: 0,
                    }}
                    transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                  />
                )}
                <Button
                  onClick={() => onPageChange(key)}
                  startIcon={<Icon sx={{ fontSize: '14px !important' }} />}
                  sx={{
                    position: 'relative',
                    zIndex: 1,
                    px: { xs: 1.2, sm: 1.5 },
                    py: 0.75,
                    borderRadius: 2,
                    fontSize: { xs: 11, sm: 12 },
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? '#fff' : '#71717a',
                    background: 'transparent',
                    textTransform: 'none',
                    transition: 'color 0.15s ease',
                    minWidth: 'auto',
                    lineHeight: 1.4,
                    gap: 0.5,
                    '& .MuiButton-startIcon': { mr: 0.5 },
                    '&:hover': {
                      color: isActive ? '#fff' : '#fafafa',
                      background: 'transparent',
                    },
                  }}
                >
                  {label}
                </Button>
              </Box>
            )
          })}
        </Box>
      </Toolbar>
    </AppBar>
  )
}
