import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

interface Props {
  columns: string[]
  showCommission?: boolean
}

export default function CommonTradeListHeader({ columns, showCommission = true }: Props) {
  const gridCols = showCommission
    ? '36px 100px 1.5fr 1.0fr 100px 80px 80px 80px'
    : '36px 100px 1.5fr 1.0fr 100px 80px 80px'

  return (
    <Box sx={{
      display: { xs: 'none', sm: 'grid' },
      gridTemplateColumns: gridCols,
      gap: showCommission ? 1 : 0.75,
      px: 1.5, py: 0.75, mb: 0.5,
      minWidth: 540,
      borderBottom: '1px solid #27272a',
    }}>
      {columns.map((h) => (
        <Typography
          key={h}
          sx={{ fontSize: 9, color: '#52525b', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.06em' }}
        >
          {h}
        </Typography>
      ))}
    </Box>
  )
}
