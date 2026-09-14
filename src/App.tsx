import { useState } from 'react'
import { Dashboard } from './components/Dashboard'
import { EmailPanel } from './components/EmailPanel'
import { GuestsPanel } from './components/GuestsPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { AppProvider, useApp } from './context/AppContext'
import './App.css'

type Tab = 'dashboard' | 'guests' | 'email' | 'settings'

function Shell() {
  const {
    data,
    unlocked,
    unlock,
    metrics,
    cloudEnabled,
    cloudReady,
    cloudEmail,
    cloudError,
    cloudLive,
    signInCloud,
  } = useApp()
  const [tab, setTab] = useState<Tab>('dashboard')
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginMsg, setLoginMsg] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)

  if (cloudEnabled && !cloudReady) {
    return (
      <div className="lock-screen">
        <div className="lock-card">
          <p className="eyebrow">Wedding Guest Hub</p>
          <h1>Connecting…</h1>
        </div>
      </div>
    )
  }

  if (cloudEnabled && !cloudEmail) {
    return (
      <div className="lock-screen">
        <div className="lock-card">
          <p className="eyebrow">Wedding Guest Hub</p>
          <h1>{data.settings.coupleNames || 'Welcome'}</h1>
          <p className="muted">
            Sign in with an allowed email to open the shared guest list. We’ll send a link — no
            password.
          </p>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault()
              setLoginBusy(true)
              setLoginMsg('')
              void signInCloud(loginEmail)
                .then(() => setLoginMsg('Check your email for the sign-in link.'))
                .catch((err: unknown) =>
                  setLoginMsg(err instanceof Error ? err.message : 'Could not send link'),
                )
                .finally(() => setLoginBusy(false))
            }}
          >
            <input
              className="input"
              type="email"
              autoFocus
              required
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              placeholder="you@gmail.com"
            />
            {loginMsg ? <p className="muted">{loginMsg}</p> : null}
            {cloudError ? <p className="danger-text">{cloudError}</p> : null}
            <button type="submit" className="btn btn-primary" disabled={loginBusy}>
              {loginBusy ? 'Sending…' : 'Email me a sign-in link'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (!unlocked) {
    return (
      <div className="lock-screen">
        <div className="lock-card">
          <p className="eyebrow">Wedding Guest Hub</p>
          <h1>{data.settings.coupleNames || 'Welcome back'}</h1>
          <p className="muted">Enter your PIN to open the guest list.</p>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault()
              const ok = unlock(pin)
              setPinError(!ok)
              if (!ok) setPin('')
            }}
          >
            <input
              className="input"
              type="password"
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN"
            />
            {pinError ? <p className="danger-text">Incorrect PIN</p> : null}
            <button type="submit" className="btn btn-primary">
              Unlock
            </button>
          </form>
        </div>
      </div>
    )
  }

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'guests', label: 'Guests', badge: metrics.totalGuests },
    { id: 'email', label: 'Save the dates', badge: metrics.saveTheDatePending },
    { id: 'settings', label: 'Settings' },
  ]

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <p className="eyebrow">Wedding Guest Hub</p>
          <h1 className="brand">{data.settings.coupleNames || 'Your wedding'}</h1>
        </div>
        <nav className="tabs" aria-label="Primary">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {typeof t.badge === 'number' ? <span className="badge">{t.badge}</span> : null}
            </button>
          ))}
        </nav>
      </header>
      <main className="main">
        {tab === 'dashboard' ? <Dashboard /> : null}
        {tab === 'guests' ? <GuestsPanel /> : null}
        {tab === 'email' ? <EmailPanel /> : null}
        {tab === 'settings' ? <SettingsPanel /> : null}
      </main>
      <footer className="footer muted">
        {cloudLive && cloudEmail
          ? `Live sync · ${cloudEmail}`
          : 'This browser only until cloud sync is connected'}
        {cloudError ? ` · ${cloudError}` : ''}
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}
