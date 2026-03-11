import { useState, useCallback } from 'react'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'
import Chip from '@mui/material/Chip'
import { motion, AnimatePresence } from 'framer-motion'
import LocationOnIcon from '@mui/icons-material/LocationOn'
import MyLocationIcon from '@mui/icons-material/MyLocation'
import StarIcon from '@mui/icons-material/Star'
import PlaceIcon from '@mui/icons-material/Place'
import TipsAndUpdatesOutlinedIcon from '@mui/icons-material/TipsAndUpdatesOutlined'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import type { LocalActivity, LocalPlace } from '../../types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

type Step = 'init' | 'locating' | 'activities' | 'places'

interface GeoInfo {
  lat: number
  lng: number
  address: string
}

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

async function fetchActivities(geo: GeoInfo): Promise<LocalActivity[]> {
  const params = new URLSearchParams({
    mode: 'activities',
    lat: String(geo.lat),
    lng: String(geo.lng),
    address: geo.address,
  })
  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/local-recommend?${params}`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
  )
  if (!res.ok) throw new Error(`활동 추천 실패: ${res.status}`)
  const data = await res.json()
  return data.activities ?? []
}

async function fetchPlaces(geo: GeoInfo, activity: string): Promise<LocalPlace[]> {
  const params = new URLSearchParams({
    mode: 'places',
    lat: String(geo.lat),
    lng: String(geo.lng),
    address: geo.address,
    activity,
  })
  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/local-recommend?${params}`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
  )
  if (!res.ok) throw new Error(`장소 추천 실패: ${res.status}`)
  const data = await res.json()
  return data.places ?? []
}

function StarRating({ rating }: { rating: number }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
      <StarIcon sx={{ fontSize: 13, color: '#f59e0b' }} />
      <Typography variant="caption" sx={{ color: '#f59e0b', fontWeight: 600, fontSize: 12 }}>
        {rating.toFixed(1)}
      </Typography>
    </Box>
  )
}

function PlaceCard({ place, index }: { place: LocalPlace; index: number }) {
  const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(place.name + ' ' + place.address)}`

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.07 }}
      style={{ height: '100%' }}
    >
      <Box
        sx={{
          background: '#18181b',
          border: '1px solid #27272a',
          borderRadius: 3,
          p: 2.5,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          '&:hover': {
            borderColor: '#3b82f6',
            boxShadow: '0 0 0 1px rgba(59,130,246,0.15)',
          },
        }}
      >
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
          <Box>
            <Typography
              variant="body2"
              sx={{ color: '#fafafa', fontWeight: 600, fontSize: 15, lineHeight: 1.3 }}
            >
              {place.name}
            </Typography>
            <Typography variant="caption" sx={{ color: '#52525b', fontSize: 11, mt: 0.3, display: 'block' }}>
              {place.category}
            </Typography>
          </Box>
          <StarRating rating={place.rating} />
        </Box>

        {/* Description */}
        <Typography variant="body2" sx={{ color: '#a1a1aa', fontSize: 13, lineHeight: 1.6, flexGrow: 1 }}>
          {place.desc}
        </Typography>

        {/* Tip */}
        <Box
          sx={{
            background: 'rgba(59,130,246,0.06)',
            border: '1px solid rgba(59,130,246,0.15)',
            borderRadius: 2,
            p: 1.2,
            display: 'flex',
            gap: 0.8,
            alignItems: 'flex-start',
          }}
        >
          <TipsAndUpdatesOutlinedIcon sx={{ fontSize: 14, color: '#3b82f6', mt: 0.1, flexShrink: 0 }} />
          <Typography variant="caption" sx={{ color: '#93c5fd', fontSize: 12, lineHeight: 1.5 }}>
            {place.tip}
          </Typography>
        </Box>

        {/* Address + map link */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
            <PlaceIcon sx={{ fontSize: 12, color: '#52525b' }} />
            <Typography variant="caption" sx={{ color: '#52525b', fontSize: 11 }}>
              {place.address}
            </Typography>
          </Box>
          <Button
            component="a"
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            size="small"
            sx={{
              color: '#3b82f6',
              fontSize: 11,
              textTransform: 'none',
              px: 1,
              py: 0.3,
              minWidth: 'auto',
              borderRadius: 1.5,
              '&:hover': { background: 'rgba(59,130,246,0.08)' },
            }}
          >
            지도 보기 →
          </Button>
        </Box>
      </Box>
    </motion.div>
  )
}

export default function LocalExplorer() {
  const [step, setStep] = useState<Step>('init')
  const [geo, setGeo] = useState<GeoInfo | null>(null)
  const [activities, setActivities] = useState<LocalActivity[]>([])
  const [selectedActivity, setSelectedActivity] = useState<string | null>(null)
  const [places, setPlaces] = useState<LocalPlace[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        const geoInfo: GeoInfo = { lat, lng, address }
        setGeo(geoInfo)
        setLoading(true)

        try {
          const acts = await fetchActivities(geoInfo)
          setActivities(acts)
          setStep('activities')
        } catch (err) {
          setError('활동 목록을 불러오지 못했습니다. 다시 시도해주세요.')
          setStep('init')
        } finally {
          setLoading(false)
        }
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

  const handleSelectActivity = useCallback(
    async (activityName: string) => {
      if (!geo) return
      setSelectedActivity(activityName)
      setStep('places')
      setLoading(true)
      setError(null)
      setPlaces([])

      try {
        const ps = await fetchPlaces(geo, activityName)
        setPlaces(ps)
      } catch (err) {
        setError('장소를 불러오지 못했습니다. 다시 시도해주세요.')
      } finally {
        setLoading(false)
      }
    },
    [geo],
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
    setActivities([])
    setSelectedActivity(null)
    setPlaces([])
    setError(null)
  }, [])

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
              {/* Location header */}
              <Box sx={{ mb: 4 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <LocationOnIcon sx={{ fontSize: 16, color: '#3b82f6' }} />
                  <Typography variant="caption" sx={{ color: '#3b82f6', fontSize: 13, fontWeight: 500 }}>
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
                      ml: 0.5,
                      '&:hover': { color: '#a1a1aa' },
                    }}
                  >
                    위치 변경
                  </Button>
                </Box>
                <Typography variant="h6" sx={{ color: '#fafafa', fontWeight: 700, fontSize: { xs: 18, sm: 22 } }}>
                  지금 이 근처에서 뭐 할까요?
                </Typography>
                <Typography variant="caption" sx={{ color: '#52525b', fontSize: 12 }}>
                  원하는 활동을 선택하면 AI가 장소를 추천해드려요
                </Typography>
              </Box>

              {/* Activity pills */}
              {loading ? (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                  {[...Array(6)].map((_, i) => (
                    <Box
                      key={i}
                      sx={{
                        height: 40,
                        width: 90 + (i % 3) * 20,
                        background: '#18181b',
                        border: '1px solid #27272a',
                        borderRadius: 5,
                      }}
                    />
                  ))}
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                  {activities.map((act, i) => (
                    <motion.div
                      key={act.name}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.06, duration: 0.2 }}
                    >
                      <Box
                        onClick={() => handleSelectActivity(act.name)}
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 0.5,
                          background: '#18181b',
                          border: '1px solid #27272a',
                          borderRadius: 3,
                          px: 2.5,
                          py: 2,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          minWidth: 88,
                          '&:hover': {
                            borderColor: '#3b82f6',
                            background: 'rgba(59,130,246,0.06)',
                            transform: 'translateY(-2px)',
                            boxShadow: '0 4px 16px rgba(59,130,246,0.15)',
                          },
                        }}
                      >
                        <Typography sx={{ fontSize: 24 }}>{act.emoji}</Typography>
                        <Typography variant="body2" sx={{ color: '#fafafa', fontWeight: 600, fontSize: 13 }}>
                          {act.name}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: '#52525b', fontSize: 10, textAlign: 'center', lineHeight: 1.3 }}
                        >
                          {act.desc}
                        </Typography>
                      </Box>
                    </motion.div>
                  ))}
                </Box>
              )}
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
              {/* Back + header */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
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
                    '& .MuiButton-startIcon': { mr: 0.4 },
                    '&:hover': { color: '#fafafa', background: 'rgba(255,255,255,0.04)' },
                  }}
                >
                  돌아가기
                </Button>
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LocationOnIcon sx={{ fontSize: 14, color: '#3b82f6' }} />
                    <Typography variant="caption" sx={{ color: '#3b82f6', fontSize: 12 }}>
                      {geo?.address}
                    </Typography>
                  </Box>
                  <Typography variant="h6" sx={{ color: '#fafafa', fontWeight: 700, fontSize: { xs: 16, sm: 20 } }}>
                    근처 <Box component="span" sx={{ color: '#3b82f6' }}>{selectedActivity}</Box> 추천
                  </Typography>
                </Box>
              </Box>

              {/* Error */}
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

              {/* Loading skeleton */}
              {loading ? (
                <Grid container spacing={2}>
                  {[...Array(5)].map((_, i) => (
                    <Grid item xs={12} sm={6} md={4} key={i}>
                      <Box
                        sx={{
                          background: '#18181b',
                          border: '1px solid #27272a',
                          borderRadius: 3,
                          p: 2.5,
                          height: 200,
                        }}
                      >
                        <Box sx={{ background: '#27272a', borderRadius: 1, height: 18, width: '60%', mb: 1.5 }} />
                        <Box sx={{ background: '#27272a', borderRadius: 1, height: 14, width: '90%', mb: 1 }} />
                        <Box sx={{ background: '#27272a', borderRadius: 1, height: 14, width: '70%', mb: 2 }} />
                        <Box
                          sx={{
                            background: 'rgba(59,130,246,0.05)',
                            border: '1px solid rgba(59,130,246,0.1)',
                            borderRadius: 2,
                            height: 52,
                          }}
                        />
                      </Box>
                    </Grid>
                  ))}
                </Grid>
              ) : (
                <Grid container spacing={2}>
                  {places.map((place, i) => (
                    <Grid item xs={12} sm={6} md={4} key={place.name + i} sx={{ display: 'flex' }}>
                      <PlaceCard place={place} index={i} />
                    </Grid>
                  ))}
                </Grid>
              )}

              {/* Retry */}
              {!loading && places.length === 0 && !error && (
                <Box sx={{ textAlign: 'center', py: 8 }}>
                  <Typography variant="body2" sx={{ color: '#52525b' }}>
                    추천 장소를 가져오지 못했습니다.
                  </Typography>
                  <Button
                    onClick={() => selectedActivity && handleSelectActivity(selectedActivity)}
                    sx={{ mt: 2, color: '#3b82f6', textTransform: 'none', fontSize: 13 }}
                  >
                    다시 시도
                  </Button>
                </Box>
              )}

              {/* AI disclaimer */}
              {!loading && places.length > 0 && (
                <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
                  <Chip
                    label="AI가 생성한 추천입니다 · 실제와 다를 수 있어요"
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
