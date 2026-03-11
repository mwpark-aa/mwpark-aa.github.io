import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import IconButton from '@mui/material/IconButton'
import SearchIcon from '@mui/icons-material/Search'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (value: string) => void
}

export default function SearchBar({ value, onChange, onSubmit }: SearchBarProps) {
  return (
    <TextField
      fullWidth
      variant="outlined"
      size="medium"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSubmit(value)
      }}
      placeholder="검색 (Enter로 유사 검색)"
      inputProps={{ 'aria-label': '피드 검색' }}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <SearchIcon
              sx={{
                color: value ? '#10b981' : '#71717a',
                fontSize: 20,
                transition: 'color 0.15s ease',
              }}
            />
          </InputAdornment>
        ),
        endAdornment: (
          <InputAdornment position="end">
            <IconButton
              size="small"
              onClick={() => onSubmit(value)}
              disabled={!value.trim()}
              aria-label="벡터 검색 실행"
              sx={{ color: value.trim() ? '#3b82f6' : '#3f3f46', p: 0.5 }}
            >
              <AutoAwesomeIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </InputAdornment>
        ),
      }}
      sx={{
        '& .MuiOutlinedInput-root': {
          background: '#18181b',
          borderRadius: 2,
          color: '#fafafa',
          '& .MuiOutlinedInput-notchedOutline': { borderColor: '#27272a' },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#3f3f46' },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#10b981',
            boxShadow: '0 0 0 3px rgba(16,185,129,0.12)',
          },
        },
        '& .MuiOutlinedInput-input': {
          color: '#fafafa',
          fontSize: 14,
          py: 1.5,
          caretColor: '#10b981',
          '&::placeholder': { color: '#71717a', opacity: 1 },
        },
      }}
    />
  )
}
