import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#09090b',
      paper: '#18181b',
    },
    primary: {
      main: '#10b981',
    },
    secondary: {
      main: '#3b82f6',
    },
    text: {
      primary: '#fafafa',
      secondary: '#71717a',
    },
    divider: '#27272a',
    error: {
      main: '#ef4444',
    },
    warning: {
      main: '#f59e0b',
    },
    success: {
      main: '#10b981',
    },
  },
  typography: {
    fontFamily: "'Inter', 'system-ui', sans-serif",
    h6: {
      fontWeight: 600,
    },
    body2: {
      color: '#a1a1aa',
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          border: '1px solid #27272a',
          background: '#18181b',
          boxShadow: 'none',
          transition: 'all 0.2s ease',
          '&:hover': {
            borderColor: '#52525b',
            transform: 'translateY(-2px)',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 600,
          fontSize: '11px',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 500,
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: {
          background: '#18181b',
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          background: '#18181b',
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: '#27272a',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: '#52525b',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#10b981',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          background: '#18181b',
          border: '1px solid #27272a',
        },
      },
    },
  },
});

export default theme;
