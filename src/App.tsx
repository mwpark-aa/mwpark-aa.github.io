import { useState } from 'react'
import Navigation from './components/Navigation/Navigation'
import Dashboard from './components/Dashboard/Dashboard'
import LocalExplorer from './components/LocalExplorer/LocalExplorer'
import type { Category, AppPage } from './types'

export default function App() {
  const [activePage, setActivePage] = useState<AppPage>('feed')
  const [activeCategory, setActiveCategory] = useState<Category>('All')

  return (
    <>
      <Navigation
        activePage={activePage}
        onPageChange={setActivePage}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
      />
      {activePage === 'feed'
        ? <Dashboard activeCategory={activeCategory} />
        : <LocalExplorer />
      }
    </>
  )
}
