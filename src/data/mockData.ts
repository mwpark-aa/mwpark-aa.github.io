import type { FeedItem, DataSource } from '../types'

export const feedItems: FeedItem[] = [
  {
    id: 'ai-001',
    category: 'AI Trends',
    title: 'GPT-5 유출 벤치마크, GPT-4o 대비 3배 성능 향상 시사',
    summary: [
      'ML 커뮤니티에서 유통 중인 내부 벤치마크에 따르면 GPT-5의 MMLU 점수는 87.3%로, 추론 과제에서 Claude 3.5 Sonnet과 Gemini Ultra 1.5를 앞선다. 혁신인가, 또 다른 하이프인가.',
      '멀티모달 기능은 200ms 이하 지연으로 실시간 영상 이해를 지원할 것으로 알려졌다. 정적 이미지 분석은 이미 구식이 됐다.',
      '컨텍스트 윈도우가 최대 200만 토큰으로 확장 예정. 전체 코드베이스 분석이나 장편 소설 처리가 현실이 된다.',
    ],
    sourceUrl: 'https://news.ycombinator.com',
    sourceName: 'Hacker News',
    collectedAt: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
  },
  {
    id: 'ai-002',
    category: 'AI Trends',
    title: 'Anthropic, 엔터프라이즈용 Constitutional AI 도구 포함한 Claude API v3 출시',
    summary: [
      'Claude API v3는 세분화된 Constitutional AI 설정을 도입해 기업이 자체 안전 정책을 정의할 수 있도록 했다. 조정 가능한 가드레일이 드디어 등장했다.',
      '새로운 Batch Inference API로 처리량 10배, 비용 60% 절감 가능. 대규모 문서 처리 파이프라인에 최적화됐다.',
      '도구 사용이 32개 동시 병렬 실행을 지원하게 됐다. 에이전틱 워크플로우의 수준이 달라졌다.',
    ],
    sourceUrl: 'https://www.anthropic.com/news',
    sourceName: 'Anthropic Blog',
    collectedAt: new Date(Date.now() - 1000 * 60 * 37).toISOString(),
  },
  {
    id: 'ai-003',
    category: 'AI Trends',
    title: 'Mistral, 독점 모델에 도전하는 오픈소스 Mistral-Next 공개',
    summary: [
      'Mistral-Next(340억 파라미터)는 코딩 벤치마크에서 GPT-4의 94% 성능을 A100 단일 GPU로 구현한다. LLM 민주화의 흐름이 이어진다.',
      '아파치 2.0 라이선스로 완전 공개, 상업적 사용 가능. 유럽 데이터 주권 규정에도 적합하다.',
      '새로운 혼합 전문가(MoE) 아키텍처로 동급 밀집 모델 대비 추론 비용 40% 절감. LLM 배포 경제학이 바뀌고 있다.',
    ],
    sourceUrl: 'https://www.reddit.com/r/MachineLearning/',
    sourceName: 'Reddit r/MachineLearning',
    collectedAt: new Date(Date.now() - 1000 * 60 * 92).toISOString(),
  },
  {
    id: 'ai-004',
    category: 'AI Trends',
    title: 'Google DeepMind AlphaCode 2, 경쟁 프로그래밍 상위 15% 진입',
    summary: [
      'AlphaCode 2는 Codeforces 문제의 43%를 해결해 활동 중인 인간 경쟁 프로그래머 상위 15% 수준에 도달했다.',
      '자기 개선 파이프라인으로 실패한 테스트 케이스를 분석해 5회 반복 이내에 정확도를 27% 향상시킨다.',
      '외부 라이브러리 문서 없이도 멀티 파일 프로젝트와 API 추론을 처리한다. 도구를 넘어 동료의 영역에 가까워졌다.',
    ],
    sourceUrl: 'https://arxiv.org',
    sourceName: 'ArXiv',
    collectedAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
  },
  {
    id: 'tech-001',
    category: 'Tech Blogs',
    title: 'Vercel, V0 3.0 발표 — AI 생성 UI 컴포넌트가 프로덕션 수준에 도달',
    summary: [
      'V0 3.0은 단일 자연어 프롬프트로 서버 액션, DB 스키마, API 라우트까지 포함한 풀스택 컴포넌트를 생성한다.',
      '기존 Figma 파일이나 Storybook 컴포넌트를 분석해 팀 스타일 가이드에 맞는 코드를 자동 생성한다. 디자인 시스템 일관성이 AI의 문제가 됐다.',
      '자동 성능 최적화와 A/B 테스트 스캐폴딩을 포함한 원클릭 배포. Vercel이 개발 툴체인 전체를 조용히 잠식하고 있다.',
    ],
    sourceUrl: 'https://vercel.com/blog',
    sourceName: 'Vercel Blog',
    collectedAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
  },
  {
    id: 'tech-002',
    category: 'Tech Blogs',
    title: 'Linear, 동기화 엔진을 Rust로 재작성해 레이턴시 10배 단축',
    summary: [
      'Linear은 협업 동기화 엔진을 Node.js에서 Rust로 전환했다. P99 레이턴시: 87ms → 8ms. 서버 비용: 65% 절감.',
      '메모리 안전성 덕분에 레이스 컨디션 버그가 완전히 제거됐고, 단일 서버로 동시 접속 2만 명을 처리한다.',
      '점진적 모듈별 마이그레이션은 99.99% 가동률을 유지하며 8개월에 걸쳐 완료됐다.',
    ],
    sourceUrl: 'https://linear.app/blog',
    sourceName: 'Linear Blog',
    collectedAt: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
  },
  {
    id: 'tech-003',
    category: 'Tech Blogs',
    title: 'Shopify 엔지니어링: 블랙 프라이데이 초당 410만 요청 처리 후기',
    summary: [
      'Shopify는 블랙 프라이데이 2024에 초당 410만 요청의 피크를 기록했다 — 전년 대비 31% 증가. 엣지 캐싱과 예측 오토스케일링의 결과다.',
      'ML 기반 예측 오토스케일링으로 트래픽 급증을 15분 전에 감지해 콜드 스타트 없이 컨테이너를 사전 워밍업한다.',
      '12개 분산 체크아웃 클러스터를 통해 글로벌 체크아웃 레이턴시 평균 210ms를 달성했다. 레이턴시는 기능이다.',
    ],
    sourceUrl: 'https://shopify.engineering',
    sourceName: 'Shopify Engineering',
    collectedAt: new Date(Date.now() - 1000 * 60 * 145).toISOString(),
  },
]

export const dataSources: DataSource[] = [
  {
    id: 'src-001',
    name: 'Hacker News',
    status: 'active',
    lastCrawled: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
    itemsCollected: 142,
  },
  {
    id: 'src-002',
    name: 'TechCrunch',
    status: 'active',
    lastCrawled: new Date(Date.now() - 1000 * 60 * 7).toISOString(),
    itemsCollected: 87,
  },
  {
    id: 'src-003',
    name: 'Reddit ML',
    status: 'active',
    lastCrawled: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    itemsCollected: 63,
  },
  {
    id: 'src-004',
    name: 'OpenAI Blog',
    status: 'pending',
    lastCrawled: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    itemsCollected: 29,
  },
  {
    id: 'src-005',
    name: 'ArXiv CS.AI',
    status: 'error',
    lastCrawled: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    itemsCollected: 0,
  },
]
