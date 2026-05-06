import { useState } from 'react'
import Navigation from './components/Navigation/Navigation'
import Dashboard from './components/Dashboard/Dashboard'
import LocalExplorer from './components/LocalExplorer/LocalExplorer'
import StockExplorer from './components/StockExplorer/StockExplorer'
import CryptoExplorer from './components/CryptoExplorer/CryptoExplorer'
import { AuthProvider } from './contexts/AuthContext'
import type { Category, AppPage } from './types'

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
      {activePage === 'feed'
        ? <Dashboard activeCategory={activeCategory} />
        : activePage === 'stock'
          ? <StockExplorer />
          : activePage === 'crypto'
            ? <CryptoExplorer />
            : <LocalExplorer />
      }
    </AuthProvider>
  )
}
