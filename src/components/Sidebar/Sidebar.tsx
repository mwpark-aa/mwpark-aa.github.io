import Box from '@mui/material/Box'
import SourceMonitor from '../SourceMonitor/SourceMonitor'
import type { DataSource, FeedItem } from '../../types'

interface SidebarProps {
  sources: DataSource[]
  items: FeedItem[]
}

export default function Sidebar({ sources, items }: SidebarProps) {
  return (
    <Box
      sx={{
        width: { xs: '100%', lg: 320 },
        flexShrink: 0,
        display: { xs: 'none', lg: 'block' },
        position: 'relative',
        minHeight: '100%',
      }}
    >
      <Box
        sx={{
          position: 'sticky',
          top: { lg: 88, },
          height: 'auto',
          zIndex: 10,
        }}
      >
        <SourceMonitor sources={sources} items={items} />
      </Box>
    </Box>
  )
}
