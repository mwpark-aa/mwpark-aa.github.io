import { useState, lazy, Suspense } from 'react'
import Navigation from './components/Navigation/Navigation'
import { AuthProvider } from './contexts/AuthContext'
import type { Category, AppPage } from './types'

const Dashboard      = lazy(() => import('./components/Dashboard/Dashboard'))
const LocalExplorer  = lazy(() => import('./components/LocalExplorer/LocalExplorer'))
const StockExplorer  = lazy(() => import('./components/StockExplorer/StockExplorer'))
const CryptoExplorer = lazy(() => import('./components/CryptoExplorer/CryptoExplorer'))

export default function App() {
  const [activePage, setActivePage] = useState<AppPage>('crypto')
  const [activeCategory, setActiveCategory] = useState<Category>('All')

  return (
    <AuthProvider>
      <Navigation
        activePage={activePage}
        onPageChange={setActivePage}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
      />
      <Suspense fallback={null}>
        {activePage === 'feed'
          ? <Dashboard activeCategory={activeCategory} />
          : activePage === 'stock'
            ? <StockExplorer />
            : activePage === 'crypto'
              ? <CryptoExplorer />
              : <LocalExplorer />
        }
      </Suspense>
    </AuthProvider>
  )
}
