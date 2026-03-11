import React, { useState, useCallback, useEffect, useRef } from 'react'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'
import Chip from '@mui/material/Chip'
import { motion, AnimatePresence } from 'framer-motion'
import LocationOnIcon from '@mui/icons-material/LocationOn'
import MyLocationIcon from '@mui/icons-material/MyLocation'
import PlaceIcon from '@mui/icons-material/Place'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import StarIcon from '@mui/icons-material/Star'
import type { LocalPlace } from '../../types'

const RADIUS_OPTIONS = [
  { label: '500m', value: 500 },
  { label: '1km', value: 1000 },
  { label: '3km', value: 3000 },
  { label: '5km', value: 5000 },
]

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

type Step = 'init' | 'locating' | 'activities' | 'places'
type SortOrder = 'distance' | 'rating'

interface GeoInfo {
  lat: number
  lng: number
  address: string
}

interface ActivityDef {
  emoji: string
  name: string
  desc: string
}

const FIXED_ACTIVITIES: ActivityDef[] = [
  { emoji: '🍚', name: '밥집', desc: '맛집 탐방' },
  { emoji: '☕', name: '카페', desc: '커피 한 잔의 여유' },
  { emoji: '🍨', name: '디저트', desc: '달콤한 디저트 카페' },
  { emoji: '🍺', name: '술집/바', desc: '분위기 좋은 한 잔' },
  { emoji: '🌿', name: '산책', desc: '공원과 자연 즐기기' },
  { emoji: '📸', name: '사진 명소', desc: '포토스팟 찾기' },
  { emoji: '📚', name: '독서', desc: '조용한 독서 공간' },
  { emoji: '🎮', name: '오락', desc: '게임과 엔터테인먼트' },
  { emoji: '🧗', name: '액티비티', desc: '클라이밍·사격·볼링' },
  { emoji: '🎬', name: '영화', desc: '최신 영화 관람' },
  { emoji: '🛍', name: '쇼핑', desc: '동네 쇼핑 탐방' },
  { emoji: '🎨', name: '전시/문화', desc: '갤러리와 문화 체험' },
]

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ko`,
      { headers: { 'User-Agent': 'MinwooPortfolio/1.0' } },
    )
    if (!res.ok) return `위도 ${lat.toFixed(2)}, 경도 ${lng.toFixed(2)}`
    const data = await res.json()
    const { suburb, city_district, city, county, state } = data.address ?? {}
    return [suburb ?? city_district, city ?? county ?? state].filter(Boolean).join(' ') || data.display_name?.split(',')[0] || '현재 위치'
  } catch {
    return '현재 위치'
  }
}

async function fetchPlaces(
  geo: GeoInfo,
  params: { activity?: string; query?: string; radius?: number },
): Promise<{ places: LocalPlace[]; kakaoCount: number }> {
  const searchParams = new URLSearchParams({
    lat: String(geo.lat),
    lng: String(geo.lng),
    address: geo.address,
    radius: String(params.radius ?? 1000),
  })
  if (params.query) searchParams.set('query', params.query)
  else if (params.activity) searchParams.set('activity', params.activity)

  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/local-recommend?${searchParams}`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
  )
  if (!res.ok) throw new Error(`장소 추천 실패: ${res.status}`)
  const data = await res.json()
  return {
    places: data.places ?? [],
    kakaoCount: data.kakaoCount ?? (data.places?.length || 0)
  }
}

function PlaceCard({ place, index }: { place: LocalPlace; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.4) }}
      style={{ height: '100%', width: '100%' }}
    >
      <Box
        sx={{
          background: '#18181b',
          border: '1px solid #27272a',
          borderRadius: 3,
          height: '100%',
          minHeight: 180,
          display: 'flex',
          flexDirection: 'column',
          transition: 'all 0.15s ease',
          overflow: 'hidden',
          '&:hover': {
            borderColor: '#3b82f6',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            '& .place-image': {
              transform: 'scale(1.05)',
            }
          },
        }}
      >
        {/* Image / Map Thumbnail */}
        {place.imageUrl && (
          <Box sx={{ position: 'relative', width: '100%', pt: '56.25%', overflow: 'hidden', background: '#27272a' }}>
            <Box
              component="img"
              src={place.imageUrl}
              alt={place.name}
              className="place-image"
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transition: 'transform 0.4s ease',
              }}
              onError={(e: any) => {
                // If the searched image fails, fallback to static map
                const staticMapFallback = `https://map2.daum.net/map/staticmap?mx=${place.x}&my=${place.y}&w=400&h=300&level=3&iw=400&ih=300&map_type=TYPE_MAP&map_attribute=ROADMAP&q=${encodeURIComponent(place.name)}`;
                if (e.target.src !== staticMapFallback) {
                  e.target.src = staticMapFallback;
                } else {
                  e.target.style.display = 'none';
                }
              }}
            />
          </Box>
        )}

        <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5, flex: 1 }}>
          {/* Header: name + distance badge */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="body2"
                sx={{
                  color: '#fafafa',
                  fontWeight: 600,
                  fontSize: 15,
                  lineHeight: 1.3,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {place.name}
              </Typography>
              {place.rating && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3, mt: 0.5 }}>
                  <StarIcon sx={{ fontSize: 14, color: '#fbbf24' }} />
                  <Typography variant="caption" sx={{ color: '#fbbf24', fontWeight: 700, fontSize: 12 }}>
                    {place.rating.toFixed(1)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#52525b', fontSize: 10, ml: 0.5 }}>
                    AI 별점
                  </Typography>
                </Box>
              )}
            </Box>
            {place.distance && (
              <Chip
                label={place.distance}
                size="small"
                sx={{
                  height: 20,
                  fontSize: 11,
                  background: 'rgba(59,130,246,0.1)',
                  color: '#93c5fd',
                  border: '1px solid rgba(59,130,246,0.2)',
                  flexShrink: 0,
                  '& .MuiChip-label': { px: 1 },
                }}
              />
            )}
          </Box>

          {/* Category */}
          <Typography variant="caption" sx={{ color: '#52525b', fontSize: 12 }}>
            {place.category}
          </Typography>

          {/* Spacer */}
          <Box sx={{ flexGrow: 1 }} />

          {/* Address */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <PlaceIcon sx={{ fontSize: 12, color: '#52525b', flexShrink: 0 }} />
            <Typography
              variant="caption"
              sx={{
                color: '#71717a',
                fontSize: 11,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {place.address}
            </Typography>
          </Box>

          {/* Link */}
          <Button
            component="a"
            href={place.placeUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="outlined"
            size="small"
            fullWidth
            sx={{
              borderColor: '#27272a',
              color: '#a1a1aa',
              fontSize: 11,
              py: 0.8,
              borderRadius: 1.5,
              textTransform: 'none',
              '&:hover': {
                borderColor: '#3b82f6',
                color: '#3b82f6',
                background: 'transparent',
              },
            }}
          >
            카카오맵으로 보기
          </Button>
        </Box>
      </Box>
    </motion.div>
  )
}

export default function LocalExplorer() {
  const [step, setStep] = useState<Step>(() => {
    const cached = localStorage.getItem('mw-last-geo')
    return cached ? 'activities' : 'init'
  })
  const [geo, setGeo] = useState<GeoInfo | null>(() => {
    const cached = localStorage.getItem('mw-last-geo')
    if (cached) {
      try {
        return JSON.parse(cached)
      } catch {
        return null
      }
    }
    return null
  })
  const [radius, setRadius] = useState<number>(1000)
  const [selectedActivity, setSelectedActivity] = useState<string | null>(null)
  const [places, setPlaces] = useState<LocalPlace[]>([])
  const [kakaoCount, setKakaoCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nlQuery, setNlQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortOrder>('distance')
  const isInternalStepChange = useRef(false)

  // Sync step with history for back button support
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state && e.state.step) {
        isInternalStepChange.current = true
        setStep(e.state.step)
      }
    };
    window.addEventListener('popstate', handlePopState)

    // Initial state
    if (!window.history.state) {
      window.history.replaceState({ step }, '')
    }

    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (isInternalStepChange.current) {
      isInternalStepChange.current = false
      return
    }
    // Only push state if the step is different from current history state to avoid duplicates
    if (window.history.state?.step !== step) {
      window.history.pushState({ step }, '')
    }
  }, [step])

  const handleLocate = useCallback(async () => {
    setStep('locating')
    setError(null)

    if (!navigator.geolocation) {
      setError('이 브라우저는 위치 서비스를 지원하지 않습니다.')
      setStep('init')
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        const address = await reverseGeocode(lat, lng)
        const newGeo = { lat, lng, address }
        setGeo(newGeo)
        localStorage.setItem('mw-last-geo', JSON.stringify(newGeo))
        setStep('activities')
      },
      (err) => {
        const msg =
          err.code === 1
            ? '위치 접근이 거부되었습니다. 브라우저 설정에서 허용해주세요.'
            : '위치를 가져오지 못했습니다. 다시 시도해주세요.'
        setError(msg)
        setStep('init')
      },
      { timeout: 10000, enableHighAccuracy: false },
    )
  }, [])

  const handleSearch = useCallback(
    async (activityName: string, queryText?: string) => {
      if (!geo) return
      setSelectedActivity(activityName)
      setStep('places')
      setLoading(true)
      setError(null)
      setPlaces([])
      setKakaoCount(null)

      try {
        const { places: ps, kakaoCount: kc } = await fetchPlaces(geo, {
          activity: queryText ? undefined : activityName,
          query: queryText,
          radius
        })
        setPlaces(ps)
        setKakaoCount(kc)
      } catch {
        setError('장소를 불러오지 못했습니다. 다시 시도해주세요.')
      } finally {
        setLoading(false)
      }
    },
    [geo, radius],
  )

  useEffect(() => {
    if (selectedActivity && step === 'places') {
      handleSearch(selectedActivity, nlQuery === selectedActivity ? nlQuery : undefined)
    }
  }, [radius])

  const handleNaturalSearch = useCallback(() => {
    if (!nlQuery.trim()) return
    handleSearch(nlQuery.trim(), nlQuery.trim())
  }, [nlQuery, handleSearch])

  const handleSelectActivity = useCallback(
    (activityName: string) => {
      handleSearch(activityName)
    },
    [handleSearch],
  )

  const handleBack = useCallback(() => {
    setStep('activities')
    setSelectedActivity(null)
    setPlaces([])
    setError(null)
  }, [])

  const handleReset = useCallback(() => {
    setStep('init')
    setGeo(null)
    setSelectedActivity(null)
    setPlaces([])
    setError(null)
  }, [])

  const sortedPlaces = React.useMemo(() => {
    if (sortBy === 'distance') return places
    return [...places].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
  }, [places, sortBy])

  return (
    <Box sx={{ minHeight: 'calc(100vh - 64px)', background: '#09090b' }}>
      <Container maxWidth="lg" sx={{ py: 4, px: { xs: 2, md: 3 } }}>
        <AnimatePresence mode="wait">

          {/* ─── INIT ─── */}
          {step === 'init' && (
            <motion.div
              key="init"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 'calc(100vh - 160px)',
                  gap: 3,
                  textAlign: 'center',
                }}
              >
                <Box
                  sx={{
                    width: 72,
                    height: 72,
                    borderRadius: '50%',
                    background: 'rgba(59,130,246,0.1)',
                    border: '1px solid rgba(59,130,246,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <LocationOnIcon sx={{ fontSize: 32, color: '#3b82f6' }} />
                </Box>

                <Box>
                  <Typography
                    variant="h5"
                    sx={{ color: '#fafafa', fontWeight: 700, mb: 1, fontSize: { xs: 20, sm: 24 } }}
                  >
                    지금 근처에서 뭐 할까요?
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ color: '#71717a', maxWidth: 320, lineHeight: 1.7, fontSize: 14 }}
                  >
                    위치를 허용하면 AI가 근처에서 할 수 있는 것들을 추천해드려요
                  </Typography>
                </Box>

                {error && (
                  <Box
                    sx={{
                      background: 'rgba(239,68,68,0.08)',
                      border: '1px solid rgba(239,68,68,0.2)',
                      borderRadius: 2,
                      px: 2,
                      py: 1.5,
                      maxWidth: 360,
                    }}
                  >
                    <Typography variant="caption" sx={{ color: '#f87171', fontSize: 13 }}>
                      {error}
                    </Typography>
                  </Box>
                )}

                <Button
                  variant="contained"
                  startIcon={<MyLocationIcon />}
                  onClick={handleLocate}
                  sx={{
                    background: '#3b82f6',
                    color: '#fff',
                    px: 4,
                    py: 1.5,
                    borderRadius: 2.5,
                    fontSize: 14,
                    fontWeight: 600,
                    textTransform: 'none',
                    boxShadow: '0 4px 20px rgba(59,130,246,0.3)',
                    '&:hover': {
                      background: '#2563eb',
                      boxShadow: '0 4px 24px rgba(59,130,246,0.4)',
                    },
                  }}
                >
                  내 위치 찾기
                </Button>

                <Typography variant="caption" sx={{ color: '#3f3f46', fontSize: 11 }}>
                  위치 정보는 서버에 저장되지 않습니다
                </Typography>
              </Box>
            </motion.div>
          )}

          {/* ─── LOCATING ─── */}
          {step === 'locating' && (
            <motion.div
              key="locating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 'calc(100vh - 160px)',
                  gap: 2,
                }}
              >
                <motion.div
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <Box
                    sx={{
                      width: 64,
                      height: 64,
                      borderRadius: '50%',
                      background: 'rgba(59,130,246,0.15)',
                      border: '2px solid rgba(59,130,246,0.4)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <MyLocationIcon sx={{ fontSize: 28, color: '#3b82f6' }} />
                  </Box>
                </motion.div>
                <Typography variant="body2" sx={{ color: '#71717a' }}>
                  위치를 확인하는 중...
                </Typography>
              </Box>
            </motion.div>
          )}

          {/* ─── ACTIVITIES ─── */}
          {step === 'activities' && (
            <motion.div
              key="activities"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
            >
              <Box sx={{ mb: 4 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: { xs: '1 1 100%', sm: 'auto' }, minWidth: 0 }}>
                    <LocationOnIcon sx={{ fontSize: 14, color: '#3b82f6', flexShrink: 0 }} />
                    <Typography
                      variant="caption"
                      sx={{
                        color: '#3b82f6',
                        fontSize: 13,
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {geo?.address}
                    </Typography>
                    <Button
                      size="small"
                      onClick={handleReset}
                      sx={{
                        color: '#52525b',
                        fontSize: 11,
                        textTransform: 'none',
                        px: 0.8,
                        py: 0.2,
                        minWidth: 'auto',
                        flexShrink: 0,
                        '&:hover': { color: '#a1a1aa' },
                      }}
                    >
                      위치 변경
                    </Button>
                  </Box>

                  {/* Radius in activities step */}
                  <Box
                    sx={{
                      display: 'flex',
                      gap: 0.5,
                      ml: { xs: 0, sm: 'auto' },
                      mt: { xs: 1, sm: 0 },
                      width: { xs: '100%', sm: 'auto' },
                      overflowX: 'auto',
                      '&::-webkit-scrollbar': { display: 'none' },
                      msOverflowStyle: 'none',
                      scrollbarWidth: 'none',
                      pb: { xs: 0.5, sm: 0 }
                    }}
                  >
                    {RADIUS_OPTIONS.map((opt) => (
                      <Chip
                        key={opt.value}
                        label={opt.label}
                        size="small"
                        onClick={() => setRadius(opt.value)}
                        sx={{
                          height: 22,
                          fontSize: 10,
                          flexShrink: 0,
                          background: radius === opt.value ? 'rgba(59,130,246,0.15)' : 'rgba(39,39,42,0.4)',
                          color: radius === opt.value ? '#93c5fd' : '#71717a',
                          border: radius === opt.value ? '1px solid rgba(59,130,246,0.3)' : '1px solid rgba(63,63,70,0.2)',
                          fontWeight: radius === opt.value ? 600 : 400,
                          '& .MuiChip-label': { px: 1 },
                        }}
                      />
                    ))}
                  </Box>
                </Box>
                <Typography variant="h6" sx={{ color: '#fafafa', fontWeight: 700, fontSize: { xs: 18, sm: 22 } }}>
                  지금 이 근처에서 뭐 할까요?
                </Typography>
                <Typography variant="caption" sx={{ color: '#52525b', fontSize: 12 }}>
                  원하는 카테고리를 선택하면 AI가 장소를 추천해드려요
                </Typography>
              </Box>

              {/* Natural language input */}
              <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
                <Box
                  component="input"
                  value={nlQuery}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNlQuery(e.target.value)}
                  onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') handleNaturalSearch() }}
                  placeholder="비 오는 날 혼자 가기 좋은 곳..."
                  sx={{
                    flex: 1,
                    background: '#18181b',
                    border: '1px solid #27272a',
                    borderRadius: 2,
                    px: 2,
                    py: 1.5,
                    color: '#fafafa',
                    fontSize: 14,
                    outline: 'none',
                    fontFamily: 'inherit',
                    transition: 'border-color 0.15s ease',
                    '&:focus': { borderColor: '#10b981' },
                    '&::placeholder': { color: '#3f3f46' },
                  }}
                />
                <Button
                  variant="contained"
                  onClick={handleNaturalSearch}
                  disabled={!nlQuery.trim()}
                  sx={{
                    background: '#10b981',
                    color: '#09090b',
                    px: 2.5,
                    borderRadius: 2,
                    fontWeight: 600,
                    fontSize: 13,
                    textTransform: 'none',
                    flexShrink: 0,
                    '&:hover': { background: '#059669' },
                    '&:disabled': { background: '#27272a', color: '#52525b' },
                  }}
                >
                  검색
                </Button>
              </Box>

              {/* Divider */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                <Box sx={{ flex: 1, height: '1px', background: '#27272a' }} />
                <Typography variant="caption" sx={{ color: '#3f3f46', fontSize: 12, whiteSpace: 'nowrap' }}>
                  또는 카테고리 선택
                </Typography>
                <Box sx={{ flex: 1, height: '1px', background: '#27272a' }} />
              </Box>

              <Grid container spacing={1.5}>
                {FIXED_ACTIVITIES.map((act, i) => (
                  <Grid item xs={6} sm={4} md={3} key={act.name}>
                    <motion.div
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.04, duration: 0.2 }}
                      style={{ height: '100%' }}
                    >
                      <Box
                        onClick={() => handleSelectActivity(act.name)}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          background: '#18181b',
                          border: '1px solid #27272a',
                          borderRadius: 2.5,
                          px: 2,
                          py: 1.8,
                          cursor: 'pointer',
                          height: '100%',
                          transition: 'all 0.15s ease',
                          '&:hover': {
                            borderColor: '#3b82f6',
                            background: 'rgba(59,130,246,0.06)',
                            transform: 'translateY(-2px)',
                            boxShadow: '0 4px 16px rgba(59,130,246,0.12)',
                          },
                        }}
                      >
                        <Typography sx={{ fontSize: 22, lineHeight: 1 }}>{act.emoji}</Typography>
                        <Box>
                          <Typography variant="body2" sx={{ color: '#fafafa', fontWeight: 600, fontSize: 13, lineHeight: 1.2 }}>
                            {act.name}
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#52525b', fontSize: 11 }}>
                            {act.desc}
                          </Typography>
                        </Box>
                      </Box>
                    </motion.div>
                  </Grid>
                ))}
              </Grid>

            </motion.div>
          )}

          {/* ─── PLACES ─── */}
          {step === 'places' && (
            <motion.div
              key="places"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
            >
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: { xs: 'column', sm: 'row' },
                  alignItems: { xs: 'flex-start', sm: 'center' },
                  gap: { xs: 2, sm: 1.5 },
                  mb: 3
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', width: { xs: '100%', sm: 'auto' }, gap: 1.5 }}>
                  <Button
                    startIcon={<ArrowBackIcon sx={{ fontSize: '14px !important' }} />}
                    onClick={handleBack}
                    sx={{
                      color: '#71717a',
                      fontSize: 12,
                      textTransform: 'none',
                      px: 1.2,
                      py: 0.5,
                      minWidth: 'auto',
                      borderRadius: 1.5,
                      flexShrink: 0,
                      '& .MuiButton-startIcon': { mr: 0.4 },
                      '&:hover': { color: '#fafafa', background: 'rgba(255,255,255,0.04)' },
                    }}
                  >
                    돌아가기
                  </Button>

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                      <LocationOnIcon sx={{ fontSize: 13, color: '#3b82f6' }} />
                      <Typography
                        variant="caption"
                        sx={{
                          color: '#3b82f6',
                          fontSize: 12,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {geo?.address}
                      </Typography>
                    </Box>
                  </Box>
                </Box>

                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    alignItems: { xs: 'flex-start', sm: 'center' },
                    justifyContent: 'space-between',
                    width: '100%',
                    gap: 1.5
                  }}
                >
                  <Typography variant="h6" sx={{ color: '#fafafa', fontWeight: 700, fontSize: { xs: 16, sm: 20 }, whiteSpace: 'nowrap' }}>
                    근처{' '}
                    <Box component="span" sx={{ color: '#3b82f6' }}>
                      {selectedActivity}
                    </Box>{' '}
                    추천
                  </Typography>

                  {/* Radius Selection in Places step */}
                  <Box
                    sx={{
                      display: 'flex',
                      gap: 0.5,
                      overflowX: 'auto',
                      pb: { xs: 0.5, sm: 0 },
                      width: { xs: '100%', sm: 'auto' },
                      '&::-webkit-scrollbar': { display: 'none' },
                      msOverflowStyle: 'none',
                      scrollbarWidth: 'none'
                    }}
                  >
                    {RADIUS_OPTIONS.map((opt) => (
                      <Chip
                        key={opt.value}
                        label={opt.label}
                        size="small"
                        onClick={() => {
                          setRadius(opt.value)
                        }}
                        sx={{
                          height: 22,
                          fontSize: 10,
                          flexShrink: 0,
                          background: radius === opt.value ? 'rgba(59,130,246,0.15)' : 'rgba(39,39,42,0.4)',
                          color: radius === opt.value ? '#93c5fd' : '#71717a',
                          border: radius === opt.value ? '1px solid rgba(59,130,246,0.3)' : '1px solid rgba(63,63,70,0.2)',
                          fontWeight: radius === opt.value ? 600 : 400,
                          '& .MuiChip-label': { px: 1 },
                        }}
                      />
                    ))}
                  </Box>

                  {/* Sort Order Selector */}
                  <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                    <Chip
                      label="거리순"
                      size="small"
                      onClick={() => setSortBy('distance')}
                      sx={{
                        height: 22,
                        fontSize: 10,
                        background: sortBy === 'distance' ? 'rgba(59,130,246,0.15)' : 'transparent',
                        color: sortBy === 'distance' ? '#93c5fd' : '#52525b',
                        border: '1px solid',
                        borderColor: sortBy === 'distance' ? 'rgba(59,130,246,0.3)' : 'rgba(63,63,70,0.2)',
                        fontWeight: sortBy === 'distance' ? 600 : 400,
                        '& .MuiChip-label': { px: 1 },
                      }}
                    />
                    <Chip
                      label="AI 추천순"
                      size="small"
                      onClick={() => setSortBy('rating')}
                      sx={{
                        height: 22,
                        fontSize: 10,
                        background: sortBy === 'rating' ? 'rgba(16,185,129,0.1)' : 'transparent',
                        color: sortBy === 'rating' ? '#6ee7b7' : '#52525b',
                        border: '1px solid',
                        borderColor: sortBy === 'rating' ? 'rgba(16,185,129,0.2)' : 'rgba(63,63,70,0.2)',
                        fontWeight: sortBy === 'rating' ? 600 : 400,
                        '& .MuiChip-label': { px: 1 },
                      }}
                    />
                  </Box>
                </Box>
              </Box>

              {error && (
                <Box
                  sx={{
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.2)',
                    borderRadius: 2,
                    px: 2,
                    py: 1.5,
                    mb: 3,
                  }}
                >
                  <Typography variant="caption" sx={{ color: '#f87171' }}>
                    {error}
                  </Typography>
                </Box>
              )}

              {loading ? (
                <Grid container spacing={2}>
                  {[...Array(12)].map((_, i) => (
                    <Grid item xs={12} sm={6} md={4} key={i}>
                      <Box
                        sx={{
                          background: '#18181b',
                          border: '1px solid #27272a',
                          borderRadius: 3,
                          overflow: 'hidden',
                          height: 300,
                        }}
                      >
                        <Box sx={{ background: '#27272a', height: '56.25%', width: '100%' }} />
                        <Box sx={{ p: 2.5 }}>
                          <Box sx={{ background: '#27272a', borderRadius: 1, height: 18, width: '60%', mb: 1.5 }} />
                          <Box sx={{ background: '#27272a', borderRadius: 1, height: 14, width: '90%', mb: 1 }} />
                        </Box>
                      </Box>
                    </Grid>
                  ))}
                </Grid>
              ) : (
                <Grid container spacing={2}>
                  {sortedPlaces.map((place, i) => (
                    <Grid item xs={12} sm={6} md={4} key={place.name + i} sx={{ display: 'flex' }}>
                      <PlaceCard place={place} index={i} />
                    </Grid>
                  ))}
                </Grid>
              )}

              {!loading && places.length === 0 && !error && (
                <Box sx={{ textAlign: 'center', py: 8 }}>
                  <Typography variant="body2" sx={{ color: '#52525b', mb: 1 }}>
                    {kakaoCount === 0 
                      ? '해당 지역에 검색 결과가 없습니다.' 
                      : '검색 결과는 있으나, 추천할 만한 장소를 찾지 못했습니다.'}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#3f3f46', display: 'block', mb: 2 }}>
                    {kakaoCount === 0 
                      ? '탐색 반경을 넓히거나 다른 키워드로 검색해보세요.' 
                      : '반경을 조정하거나 잠시 후 다시 시도해주세요.'}
                  </Typography>
                  <Button
                    onClick={() => selectedActivity && handleSearch(selectedActivity, nlQuery === selectedActivity ? nlQuery : undefined)}
                    sx={{ color: '#3b82f6', textTransform: 'none', fontSize: 13 }}
                  >
                    다시 시도
                  </Button>
                </Box>
              )}

              {!loading && places.length > 0 && (
                <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
                  <Chip
                    label="카카오맵 데이터 기반 · AI 별점 및 정렬"
                    size="small"
                    sx={{
                      background: 'rgba(245,158,11,0.08)',
                      border: '1px solid rgba(245,158,11,0.15)',
                      color: '#d97706',
                      fontSize: 11,
                      height: 26,
                    }}
                  />
                </Box>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </Container>
    </Box>
  )
}
