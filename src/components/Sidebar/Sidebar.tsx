import Box from '@mui/material/Box'
import SourceMonitor from '../SourceMonitor/SourceMonitor'
import type { DataSource } from '../../types'

interface SidebarProps {
  sources: DataSource[]
  categoryTotals: Record<string, number>
}

export default function Sidebar({ sources, categoryTotals }: SidebarProps) {
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
        <SourceMonitor sources={sources} categoryTotals={categoryTotals} />
      </Box>
    </Box>
  )
}
