import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'

interface Props {
  open: boolean
  testName: string
  onNameChange: (name: string) => void
  onSave: () => void
  onClose: () => void
}

export default function SaveDialog({ open, testName, onNameChange, onSave, onClose }: Props) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { background: '#1a1a1f', color: '#fafafa', border: '1px solid #27272a' },
      }}
    >
      <DialogTitle sx={{ fontSize: 14, fontWeight: 700, color: '#fafafa' }}>
        백테스트 결과 저장
      </DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        <TextField
          autoFocus
          fullWidth
          label="테스트 이름"
          placeholder="예: BTC 1h 고점수 전략"
          value={testName}
          onChange={(e) => onNameChange(e.target.value)}
          variant="outlined"
          size="small"
          sx={{
            '& .MuiOutlinedInput-root': {
              color: '#fafafa',
              '& fieldset': { borderColor: '#27272a' },
              '&:hover fieldset': { borderColor: '#3b82f6' },
              '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
            },
            '& .MuiInputBase-input::placeholder': { color: '#52525b', opacity: 0.7 },
          }}
        />
      </DialogContent>
      <DialogActions sx={{ gap: 1, pt: 2 }}>
        <Button onClick={onClose} sx={{ color: '#52525b', textTransform: 'none' }}>
          취소
        </Button>
        <Button
          onClick={onSave}
          disabled={!testName.trim()}
          variant="contained"
          sx={{
            background: '#10b981', color: '#000', textTransform: 'none', fontWeight: 600,
            '&:disabled': { background: '#3f3f46', color: '#71717a' },
          }}
        >
          저장
        </Button>
      </DialogActions>
    </Dialog>
  )
}
