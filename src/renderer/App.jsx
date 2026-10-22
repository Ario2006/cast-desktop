import { lazy, Suspense, useLayoutEffect, useRef } from 'react'
import { api } from './api'
import Footer from './components/Footer'
import PermissionCard from './components/PermissionCard'
import SearchInput from './components/SearchInput'
import SuggestionList from './components/SuggestionList'
import WidgetHost from './components/WidgetHost'
import styles from './components/launcher.module.css'
import { useAsyncSuggestions } from './hooks/useAsyncSuggestions'
import { useBridgeEvents, useKeyboard } from './hooks/useKeyboard'
import { useStore } from './store/useStore'

const SettingsView = lazy(() => import('./components/SettingsView'))
const Welcome = lazy(() => import('./components/Welcome'))

function Launcher() {
  useAsyncSuggestions()
  const widget = useStore((s) => s.activeWidget)
  const permissionCard = useStore((s) => s.permissionCard)
  return (
    <>
      <div className={styles.card}>
        <SearchInput />
        <div className={styles.body}>
          {permissionCard && <PermissionCard {...permissionCard} />}
          {widget ? <WidgetHost widget={widget} /> : !permissionCard && <SuggestionList />}
        </div>
      </div>
      <Footer />
    </>
  )
}

export default function App() {
  useKeyboard()
  useBridgeEvents()
  const view = useStore((s) => s.view)
  const toast = useStore((s) => s.toast)
  const leaving = useStore((s) => s.leaving)
  const animToken = useStore((s) => s.animToken)
  const frame = useRef(null)

  // Keep the native window height in sync with the content (card + footer + shadow margin).
  useLayoutEffect(() => {
    const el = frame.current
    let last = 0
    const report = () => {
      const h = Math.ceil(el.getBoundingClientRect().height)
      if (h !== last) {
        last = h
        api.launcher.resize(h)
      }
    }
    const ro = new ResizeObserver(report)
    ro.observe(el)
    report()
    return () => ro.disconnect()
  }, [])

  return (
    // clicking the transparent margin around the card dismisses the launcher
    <div
      ref={frame}
      className={styles.frame}
      onMouseDown={(e) => e.target === e.currentTarget && useStore.getState().hide()}
    >
      <div className={styles.dragStrip} />
      <div className={`${styles.stage} ${leaving ? styles.leaving : ''}`} data-anim={animToken % 2}>
        {view === 'settings' || view === 'welcome' ? (
          <Suspense fallback={null}>
            {view === 'settings' ? <SettingsView /> : <Welcome />}
          </Suspense>
        ) : (
          <Launcher />
        )}
        {toast && (
          <div className={styles.toastWrap}>
            <div className={styles.toast} data-kind={toast.kind} role="status">
              {toast.text}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
