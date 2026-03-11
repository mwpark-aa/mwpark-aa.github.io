import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import SearchIcon from '@mui/icons-material/Search'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
}

export default function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <TextField
      fullWidth
      variant="outlined"
      size="medium"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="검색어를 입력하세요... (예: 'GPT-5 벤치마크 결과')"
      inputProps={{
        'aria-label': '피드 검색',
      }}
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
            <AutoAwesomeIcon
              sx={{
                color: '#3b82f6',
                fontSize: 18,
                opacity: 0.8,
              }}
            />
          </InputAdornment>
        ),
      }}
      sx={{
        '& .MuiOutlinedInput-root': {
          background: '#18181b',
          borderRadius: 2,
          color: '#fafafa',
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: '#27272a',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: '#3f3f46',
          },
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
          '&::placeholder': {
            color: '#71717a',
            opacity: 1,
          },
        },
      }}
    />
  )
}
