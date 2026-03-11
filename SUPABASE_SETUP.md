# Supabase 설정 가이드 — Grok Intelligence Engine

## 아키텍처 개요

```
브라우저 (GitHub Pages)
    │  VITE_SUPABASE_ANON_KEY (공개 가능 — RLS로 보호됨)
    ▼
Supabase Edge Functions (Deno 런타임)
    ├── /functions/v1/feed       → feed_items 조회
    ├── /functions/v1/sources    → data_sources 조회
    ├── /functions/v1/crawl      → 크롤링 → raw_articles 저장 (Grok 없음)
    └── /functions/v1/summarize  → raw_articles → Grok 요약 → feed_items 저장
              │
              │  GROK_API_KEY (Supabase Secrets — 서버에만 존재)
              │  SUPABASE_SERVICE_ROLE_KEY (자동 주입)
              ▼
         Supabase PostgreSQL
```

별도 백엔드 서버 없음. 모든 민감한 키는 Supabase Secrets에만 저장됩니다.

---

## 1. Supabase 프로젝트 생성

1. [https://supabase.com](https://supabase.com) 접속 후 로그인
2. **"New project"** 클릭
3. 입력 항목:
   - **Name**: `grok-intelligence`
   - **Database Password**: 강력한 비밀번호 (따로 보관)
   - **Region**: Northeast Asia (Tokyo) 권장
4. **"Create new project"** — 초기화 1~2분 소요

---

## 2. 테이블 생성 SQL

SQL Editor에서 아래 SQL을 실행합니다.

### feed_items

```sql
create table public.feed_items (
  id uuid default gen_random_uuid() primary key,
  category text not null check (category in ('AI Trends', 'Tech Blogs', 'Hot Deals')),
  title text not null,
  summary text[] not null,
  source_url text not null unique,
  source_name text not null,
  collected_at timestamptz default now(),
  read_time text not null default '3 min read',
  created_at timestamptz default now()
);
```

| 컬럼 | 설명 |
|------|------|
| `id` | 자동 생성 UUID |
| `category` | `AI Trends` / `Tech Blogs` / `Hot Deals` |
| `summary` | Grok이 생성한 한글 요약 3개 (배열) |
| `source_url` | 원본 URL (중복 방지용 unique 키) |

### raw_articles

```sql
create table public.raw_articles (
  id uuid default gen_random_uuid() primary key,
  source_id text not null,
  source_name text not null,
  original_title text not null,
  snippet text,                    -- 최대 400자 본문 (토큰 절약)
  source_url text not null unique, -- 중복 방지 key
  crawled_at timestamptz default now(),
  processed boolean default false,
  processed_at timestamptz
);

create index raw_articles_processed_idx on public.raw_articles(processed, crawled_at);
create index raw_articles_source_url_idx on public.raw_articles(source_url);

-- RLS
alter table public.raw_articles enable row level security;
create policy "Service role full access" on public.raw_articles using (true) with check (true);
```

| 컬럼 | 설명 |
|------|------|
| `source_id` | 소스 식별자 (`hacker-news` / `techcrunch` / `reddit-ml`) |
| `snippet` | 최대 400자 본문 (Grok 토큰 절약용) |
| `source_url` | 원본 URL (unique — 크롤링 중복 방지) |
| `processed` | `summarize` 함수 처리 완료 여부 |

### data_sources

```sql
create table public.data_sources (
  id text primary key,
  name text not null,
  url text not null,
  status text not null default 'pending' check (status in ('active', 'pending', 'error')),
  last_crawled timestamptz,
  items_collected integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### 시드 데이터

```sql
insert into public.data_sources (id, name, url) values
                                                   ('hacker-news', 'Hacker News', 'https://hacker-news.firebaseio.com/v0/topstories.json'),
                                                   ('techcrunch', 'TechCrunch', 'https://techcrunch.com/feed/'),
                                                   ('reddit-ml', 'Reddit r/MachineLearning', 'https://www.reddit.com/r/MachineLearning/top.json?limit=10&t=day'),
                                                   ('openai-blog', 'OpenAI Blog', 'https://openai.com/news/rss'),
                                                   ('arxiv-ai', 'ArXiv CS.AI', 'https://export.arxiv.org/api/query?search_query=cat:cs.AI&sortBy=submittedDate&sortOrder=descending'),
                                                   ('huggingface-blog', 'Hugging Face Blog', 'https://huggingface.co/blog/feed.xml'),
                                                   ('google-deepmind', 'Google DeepMind', 'https://deepmind.google/blog/rss.xml');
```

---

## 3. RLS (Row Level Security) 설정

> **중요**: RLS 없이는 anon 키로 모든 데이터에 무제한 접근이 가능합니다. 반드시 설정하세요.

```sql
-- feed_items: 읽기 공개 / 쓰기는 서비스 키(Edge Function)만
alter table public.feed_items enable row level security;

create policy "Anyone can read feed items"
  on public.feed_items for select using (true);

create policy "Service role can insert feed items"
  on public.feed_items for insert with check (true);

-- data_sources: 읽기 공개 / 업데이트는 서비스 키(Edge Function)만
alter table public.data_sources enable row level security;

create policy "Anyone can read data sources"
  on public.data_sources for select using (true);

create policy "Service role can update data sources"
  on public.data_sources for update using (true);
```

| 테이블 | SELECT | INSERT / UPDATE |
|--------|--------|-----------------|
| `feed_items` | 누구나 | Edge Function (service_role) |
| `data_sources` | 누구나 | Edge Function (service_role) |

---

## 4. 인덱스

```sql
create index feed_items_category_idx on public.feed_items(category);
create index feed_items_collected_at_idx on public.feed_items(collected_at desc);
create index feed_items_source_url_idx on public.feed_items(source_url);
```

---

## 5. 자동 정리 함수 (30일 이상 항목 삭제)

```sql
create or replace function cleanup_old_feed_items()
returns void as $$
begin
  delete from public.feed_items
  where collected_at < now() - interval '30 days';
end;
$$ language plpgsql;
```

수동 실행: `select cleanup_old_feed_items();`

Pro 플랜에서 자동 스케줄:
```sql
select cron.schedule('cleanup-old-feed-items', '0 3 * * *', 'select cleanup_old_feed_items()');
```

---

## 6. 벡터 임베딩 설정

### pgvector 활성화 및 컬럼 추가

```sql
-- pgvector 활성화
create extension if not exists vector;

-- embedding 컬럼 추가 (384차원 — Supabase gte-small)
alter table public.feed_items add column if not exists embedding vector(384);

-- HNSW 인덱스 (근사 최근접 검색)
create index if not exists feed_items_embedding_idx
  on public.feed_items
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);
```

### search_feed_items RPC 함수

```sql
create or replace function search_feed_items(
  query_embedding vector(384),
  match_threshold float default 0.5,
  match_count int default 20,
  filter_category text default null
)
returns table (
  id uuid,
  category text,
  title text,
  summary text[],
  source_url text,
  source_name text,
  collected_at timestamptz,
  similarity float
)
language sql stable
as $$
  select
    id,
    category,
    title,
    summary,
    source_url,
    source_name,
    collected_at,
    1 - (embedding <=> query_embedding) as similarity
  from public.feed_items
  where
    embedding is not null
    and 1 - (embedding <=> query_embedding) > match_threshold
    and (filter_category is null or category = filter_category)
  order by embedding <=> query_embedding
  limit match_count;
$$;
```

### embed + search Edge Functions 배포

```bash
supabase functions deploy embed
supabase functions deploy search
```

---

## 7. Edge Functions 배포

### CLI 설치 및 프로젝트 연결

```bash
brew install supabase/tap/supabase

supabase login
supabase link --project-ref your-project-ref   # 프로젝트 ref: Dashboard → Settings → General
```

### Grok API 키 등록 (서버에만 저장, 절대 노출 안 됨)

```bash
supabase secrets set GROK_API_KEY=xai-your-key-here
```

### Functions 배포

```bash
supabase functions deploy crawl
supabase functions deploy feed
supabase functions deploy sources
supabase functions deploy summarize
```

### 크롤링 스케줄 설정

```
crawl     → */10 * * * *          (10분마다)
summarize → 5,15,25,35,45,55 * * * *  (crawl 5분 후 실행 — Groq 처리)
```

Supabase Pro 플랜에서 pg_cron으로 직접 등록:

```sql
-- crawl: 10분마다
select cron.schedule(
  'crawl-articles',
  '*/10 * * * *',
  $$ select net.http_post(url := 'https://YOUR_PROJECT.supabase.co/functions/v1/crawl', headers := '{"Authorization":"Bearer YOUR_ANON_KEY"}'::jsonb, body := '{}'::jsonb); $$
);

-- summarize: crawl 5분 후 (매시 5,15,25,35,45,55분)
select cron.schedule(
  'summarize-articles',
  '5,15,25,35,45,55 * * * *',
  $$ select net.http_post(url := 'https://YOUR_PROJECT.supabase.co/functions/v1/summarize', headers := '{"Authorization":"Bearer YOUR_ANON_KEY"}'::jsonb, body := '{}'::jsonb); $$
);

-- 기존 스케줄 변경 시 (이미 등록된 경우)
select cron.unschedule('crawl-articles');
select cron.unschedule('summarize-articles');
-- 위 schedule 명령어를 다시 실행
```

### 수동 실행

```bash
supabase functions invoke crawl
supabase functions invoke summarize
```

---

## 8. API 키 및 환경변수

### 키 확인 위치

Dashboard → **Settings** → **API**

### anon key vs service_role key

| 구분 | anon key | service_role key |
|------|----------|------------------|
| 용도 | 프론트엔드 | Edge Functions (자동 주입) |
| RLS 적용 | 적용됨 | 우회함 (전체 권한) |
| 공개 여부 | 공개 가능 | **절대 공개 금지** |

### 프론트엔드 `.env` 파일 (프로젝트 루트)

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

> `VITE_` 접두사: Vite가 브라우저 번들에 포함시키는 환경변수. service_role key에는 절대 사용 금지.

### GitHub Actions로 배포 시 (키 소스 노출 방지)

`.github/workflows/deploy.yml` 파일이 이미 프로젝트에 포함되어 있습니다.
`main` 브랜치에 push하면 자동으로 빌드 → `gh-pages` 브랜치 배포가 실행됩니다.

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - name: Build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
        run: npm run build
      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

**Secrets 등록 방법:**
Repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Secret 이름 | 값 |
|-------------|-----|
| `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGci...` |

> `GITHUB_TOKEN`은 GitHub이 자동으로 주입하므로 별도 등록 불필요.

---

## 9. 프론트엔드 연동

현재 프로젝트는 `src/hooks/useFeed.ts` 훅을 통해 Edge Function을 호출합니다.

환경변수가 설정되지 않으면 자동으로 `mockData` 폴백 동작합니다.

```ts
// src/hooks/useFeed.ts 사용 예시 (Dashboard.tsx에서 이미 연결됨)
const { items, sources, loading, error } = useFeed(activeCategory)
```

Edge Function 직접 호출 구조:
```
GET  /functions/v1/feed?category=AI+Trends&limit=20&offset=0
GET  /functions/v1/sources
POST /functions/v1/crawl      → raw_articles 저장 (Grok 없음)
POST /functions/v1/summarize  → raw_articles → Grok 요약 → feed_items 저장
```

---

## 전체 SQL (한 번에 실행)

```sql
-- 테이블
create table public.feed_items (
  id uuid default gen_random_uuid() primary key,
  category text not null check (category in ('AI Trends', 'Tech Blogs', 'Hot Deals')),
  title text not null,
  summary text[] not null,
  source_url text not null unique,
  source_name text not null,
  collected_at timestamptz default now(),
  read_time text not null default '3 min read',
  created_at timestamptz default now()
);

create table public.data_sources (
  id text primary key,
  name text not null,
  url text not null,
  status text not null default 'pending' check (status in ('active', 'pending', 'error')),
  last_crawled timestamptz,
  items_collected integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 시드
insert into public.data_sources (id, name, url) values
  ('hacker-news', 'Hacker News', 'https://hacker-news.firebaseio.com/v0/topstories.json'),
  ('techcrunch', 'TechCrunch', 'https://techcrunch.com/feed/'),
  ('reddit-ml', 'Reddit r/MachineLearning', 'https://www.reddit.com/r/MachineLearning/top.json?limit=10&t=day'),
  ('openai-blog', 'OpenAI Blog', 'https://openai.com/news/rss'),
  ('arxiv-ai', 'ArXiv CS.AI', 'https://export.arxiv.org/api/query?search_query=cat:cs.AI&sortBy=submittedDate&sortOrder=descending'),
  ('huggingface-blog', 'Hugging Face Blog', 'https://huggingface.co/blog/feed.xml'),
  ('google-deepmind', 'Google DeepMind', 'https://deepmind.google/blog/rss.xml');

-- RLS
alter table public.feed_items enable row level security;
create policy "Anyone can read feed items" on public.feed_items for select using (true);
create policy "Service role can insert feed items" on public.feed_items for insert with check (true);

alter table public.data_sources enable row level security;
create policy "Anyone can read data sources" on public.data_sources for select using (true);
create policy "Service role can update data sources" on public.data_sources for update using (true);

-- 인덱스
create index feed_items_category_idx on public.feed_items(category);
create index feed_items_collected_at_idx on public.feed_items(collected_at desc);
create index feed_items_source_url_idx on public.feed_items(source_url);

-- raw_articles 스테이징 테이블
create table public.raw_articles (
  id uuid default gen_random_uuid() primary key,
  source_id text not null,
  source_name text not null,
  original_title text not null,
  snippet text,
  source_url text not null unique,
  crawled_at timestamptz default now(),
  processed boolean default false,
  processed_at timestamptz
);

create index raw_articles_processed_idx on public.raw_articles(processed, crawled_at);
create index raw_articles_source_url_idx on public.raw_articles(source_url);

alter table public.raw_articles enable row level security;
create policy "Service role full access" on public.raw_articles using (true) with check (true);

-- 정리 함수
create or replace function cleanup_old_feed_items()
returns void as $$
begin
  delete from public.feed_items where collected_at < now() - interval '30 days';
end;
$$ language plpgsql;
```

---

## 설정 완료 체크리스트

- [ ] Supabase 프로젝트 생성
- [ ] SQL Editor에서 전체 SQL 실행
- [ ] raw_articles 테이블 생성
- [ ] `supabase link` 프로젝트 연결
- [ ] `supabase secrets set GROK_API_KEY=...`
- [ ] Edge Functions 4개 배포 (crawl / feed / sources / summarize)
- [ ] summarize Function 배포
- [ ] crawl + summarize 크론 스케줄 설정 (`*/10 * * * *` / `5,15,25,35,45,55 * * * *`)
- [ ] 프론트엔드 `.env` 파일 작성
- [ ] `.gitignore`에 `.env` 포함 여부 확인
- [ ] `supabase functions invoke crawl` 로 첫 크롤링 테스트
- [ ] `supabase functions invoke summarize` 로 첫 요약 테스트
- [ ] pgvector 익스텐션 + embedding 컬럼 + HNSW 인덱스 SQL 실행
- [ ] search_feed_items RPC 함수 SQL 실행
- [ ] embed + search Edge Functions 배포
