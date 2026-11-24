import { BottomNav } from './components/AppChrome'
import { FirstRunNotice } from './components/FirstRunNotice'
import { UpdatePrompt } from './components/UpdatePrompt'
import { useRoute } from './lib/router'
import { useSettings } from './lib/settings'
import { HistoryPage } from './pages/HistoryPage'
import { HomePage } from './pages/HomePage'
import { ResultPage } from './pages/ResultPage'
import { ScanPage } from './pages/ScanPage'
import { SettingsPage } from './pages/SettingsPage'

export default function App() {
  const route = useRoute()
  const { firstRunAcknowledged } = useSettings()

  let page
  switch (route.name) {
    case 'scan':
      page = <ScanPage />
      break
    case 'result':
      page = <ResultPage key={route.id} id={route.id} />
      break
    case 'history':
      page = <HistoryPage />
      break
    case 'settings':
      page = <SettingsPage />
      break
    default:
      page = <HomePage />
  }

  return (
    <>
      {route.name === 'scan' && firstRunAcknowledged ? (
        page
      ) : (
        <>
          <main key={route.name} className="mx-auto min-h-dvh max-w-lg px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] animate-fade-in">
            {route.name === 'scan' ? <HomePage /> : page}
          </main>
          <BottomNav current={route.name} />
        </>
      )}
      {!firstRunAcknowledged && <FirstRunNotice />}
      <UpdatePrompt />
    </>
  )
}
