import { useState, useEffect, useRef } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

interface Props {
  value: string      // YYYY-MM-DDTHH:MM  또는 YYYY-MM-DD (legacy)
  onChange: (v: string) => void
  label: string
  align?: 'left' | 'right'
}

function parse(s: string) {
  if (s.includes('T')) {
    const [date, time] = s.split('T')
    const [y, m, d] = date.split('-').map(Number)
    const [h, min] = time.split(':').map(Number)
    return { year: y, month: m, day: d, hour: h ?? 0, minute: min ?? 0 }
  }
  const [y, m, d] = s.split('-').map(Number)
  return { year: y, month: m, day: d, hour: 0, minute: 0 }
}

function serialize({ year, month, day, hour, minute }: ReturnType<typeof parse>) {
  const p2 = (n: number) => String(n).padStart(2, '0')
  return `${year}-${p2(month)}-${p2(day)}T${p2(hour)}:${p2(minute)}`
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function firstDayOfWeek(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay()
}

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']
const MONTH_LABELS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']

const cell = {
  base: {
    height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: '6px', fontSize: 11, cursor: 'pointer', userSelect: 'none' as const,
  },
}

export default function DateTimePicker({ value, onChange, label, align = 'left' }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const p = parse(value)
  const [view, setView] = useState({ year: p.year, month: p.month })

  // 팝오버 열릴 때 뷰 동기화
  useEffect(() => {
    if (open) {
      const pp = parse(value)
      setView({ year: pp.year, month: pp.month })
    }
  }, [open]) // eslint-disable-line

  // 외부 클릭 닫기
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [open])

  const prevMonth = () => setView(v =>
    v.month === 1 ? { year: v.year - 1, month: 12 } : { ...v, month: v.month - 1 }
  )
  const nextMonth = () => setView(v =>
    v.month === 12 ? { year: v.year + 1, month: 1 } : { ...v, month: v.month + 1 }
  )

  const selectDay = (day: number) =>
    onChange(serialize({ ...p, year: view.year, month: view.month, day }))

  const changeHour = (delta: number) => {
    const h = Math.max(0, Math.min(23, p.hour + delta))
    onChange(serialize({ ...p, hour: h }))
  }

  const selectMinute = (m: number) => onChange(serialize({ ...p, minute: m }))

  // 달력 셀 생성
  const numDays = daysInMonth(view.year, view.month)
  const offset  = firstDayOfWeek(view.year, view.month)
  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: numDays }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const isSelected = (d: number) =>
    p.year === view.year && p.month === view.month && p.day === d

  const isToday = (d: number) => {
    const t = new Date()
    return d === t.getDate() && view.month === t.getMonth() + 1 && view.year === t.getFullYear()
  }

  const p2 = (n: number) => String(n).padStart(2, '0')
  const displayStr = `${p.year}/${p2(p.month)}/${p2(p.day)} ${p2(p.hour)}:${p2(p.minute)}`

  return (
    <Box ref={ref} sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
      {/* ── 트리거 ── */}
      <Typography sx={{ fontSize: 11, color: '#71717a', fontWeight: 600, whiteSpace: 'nowrap' }}>
        {label}
      </Typography>
      <Box
        onClick={() => setOpen(o => !o)}
        sx={{
          background: open ? '#1c1c1f' : '#18181b',
          border: '1px solid', borderColor: open ? '#52525b' : '#3f3f46',
          borderRadius: '6px', px: 1, py: '4px', cursor: 'pointer',
          userSelect: 'none', transition: 'all 0.12s',
          '&:hover': { borderColor: '#52525b', background: '#1c1c1f' },
        }}
      >
        <Typography sx={{ fontSize: 11, color: '#e4e4e7', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
          {displayStr}
        </Typography>
      </Box>

      {/* ── 팝오버 ── */}
      {open && (
        <Box sx={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          ...(align === 'right' ? { right: 0 } : { left: 0 }),
          zIndex: 9999,
          background: '#18181b',
          border: '1px solid #3f3f46',
          borderRadius: '10px',
          p: '14px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
          width: 228,
        }}>

          {/* ── 월 네비게이션 ── */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.25 }}>
            <Box
              onClick={prevMonth}
              sx={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '6px', cursor: 'pointer', color: '#71717a', fontSize: 16,
                '&:hover': { background: '#27272a', color: '#e4e4e7' } }}
            >‹</Box>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#e4e4e7', letterSpacing: '0.02em' }}>
              {view.year}년 &nbsp;{MONTH_LABELS[view.month - 1]}
            </Typography>
            <Box
              onClick={nextMonth}
              sx={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '6px', cursor: 'pointer', color: '#71717a', fontSize: 16,
                '&:hover': { background: '#27272a', color: '#e4e4e7' } }}
            >›</Box>
          </Box>

          {/* ── 요일 헤더 ── */}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', mb: '4px' }}>
            {DAY_LABELS.map((d, i) => (
              <Typography key={d} sx={{
                fontSize: 9, textAlign: 'center', fontWeight: 600,
                color: i === 0 ? '#ef4444aa' : i === 6 ? '#60a5faaa' : '#52525b',
                pb: '2px',
              }}>{d}</Typography>
            ))}
          </Box>

          {/* ── 날짜 그리드 ── */}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
            {cells.map((day, idx) => {
              const col = idx % 7
              const sel = day != null && isSelected(day)
              const tod = day != null && isToday(day)
              return (
                <Box
                  key={idx}
                  onClick={() => day && selectDay(day)}
                  sx={{
                    ...cell.base,
                    cursor: day ? 'pointer' : 'default',
                    background: sel ? '#3b82f6' : tod ? '#27272a' : 'transparent',
                    color: !day ? 'transparent'
                      : sel ? '#fff'
                      : col === 0 ? '#f87171'
                      : col === 6 ? '#93c5fd'
                      : '#d4d4d8',
                    fontWeight: sel || tod ? 700 : 400,
                    border: tod && !sel ? '1px solid #3f3f46' : '1px solid transparent',
                    '&:hover': day && !sel ? { background: '#27272a', color: '#fff' } : {},
                  }}
                >
                  {day ?? ''}
                </Box>
              )
            })}
          </Box>

          {/* ── 시간 선택 ── */}
          <Box sx={{ borderTop: '1px solid #27272a', mt: '12px', pt: '12px',
            display: 'flex', alignItems: 'center', gap: 1.5 }}>

            {/* 시 */}
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <Typography sx={{ fontSize: 9, color: '#52525b', fontWeight: 600, letterSpacing: '0.06em' }}>시</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Box onClick={() => changeHour(-1)} sx={{
                  width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '5px', cursor: 'pointer', border: '1px solid #3f3f46',
                  color: '#71717a', fontSize: 13,
                  '&:hover': { background: '#27272a', color: '#e4e4e7', borderColor: '#52525b' },
                }}>−</Box>
                <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#e4e4e7',
                  minWidth: 26, textAlign: 'center', fontFamily: 'monospace' }}>
                  {p2(p.hour)}
                </Typography>
                <Box onClick={() => changeHour(1)} sx={{
                  width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '5px', cursor: 'pointer', border: '1px solid #3f3f46',
                  color: '#71717a', fontSize: 13,
                  '&:hover': { background: '#27272a', color: '#e4e4e7', borderColor: '#52525b' },
                }}>+</Box>
              </Box>
            </Box>

            <Typography sx={{ fontSize: 16, color: '#52525b', fontWeight: 700, mt: '14px' }}>:</Typography>

            {/* 분 (15분 단위) */}
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flex: 1 }}>
              <Typography sx={{ fontSize: 9, color: '#52525b', fontWeight: 600, letterSpacing: '0.06em' }}>분</Typography>
              <Box sx={{ display: 'flex', gap: '4px' }}>
                {[0, 15, 30, 45].map(m => (
                  <Box
                    key={m}
                    onClick={() => selectMinute(m)}
                    sx={{
                      flex: 1, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: '5px', cursor: 'pointer', fontFamily: 'monospace',
                      fontSize: 11, fontWeight: 700,
                      background: p.minute === m ? '#3b82f6' : '#27272a',
                      color: p.minute === m ? '#fff' : '#71717a',
                      border: '1px solid', borderColor: p.minute === m ? '#3b82f6' : '#3f3f46',
                      '&:hover': p.minute !== m ? { background: '#3f3f46', color: '#e4e4e7', borderColor: '#52525b' } : {},
                    }}
                  >
                    {p2(m)}
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>

        </Box>
      )}
    </Box>
  )
}