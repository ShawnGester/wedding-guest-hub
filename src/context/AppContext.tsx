import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useEffectEvent,
  type ReactNode,
} from 'react'
import {
  cloudConfigured,
  fetchHubState,
  getCloud,
  saveHubState,
  signInWithEmail,
  signOutCloud as signOutCloudSession,
} from '../lib/cloud'
import { guestCsvTemplate, guestsToCsv, mergeAckCsv, mergeRsvpCsv } from '../lib/csv'
import { seatedCount } from '../lib/plusOnes'
import { uid } from '../lib/id'
import { downloadJson, downloadText, loadData, normalizeAppData, saveData } from '../storage'
import type {
  AppData,
  AppSettings,
  EmailCampaign,
  Guest,
} from '../types'

interface Metrics {
  totalGuests: number
  totalParty: number
  withEmail: number
  rsvpSubmitted: number
  rsvpUnknown: number
  rsvpRate: number
  saveTheDateSent: number
  saveTheDatePending: number
  saveTheDateAcknowledged: number
}

interface AppContextValue {
  data: AppData
  metrics: Metrics
  unlocked: boolean
  unlock: (pin: string) => boolean
  lock: () => void
  updateSettings: (patch: Partial<AppSettings>) => void
  addGuest: (partial?: Partial<Guest>) => Guest
  updateGuest: (id: string, patch: Partial<Guest>) => void
  deleteGuest: (id: string) => void
  reorderGuests: (activeId: string, overId: string) => void
  importRsvpCsv: (csv: string) => {
    matched: number
    created: number
    removed: number
  }
  importAckCsv: (csv: string) => { matched: number; unmatched: number }
  refreshAcksFromFeed: () => Promise<{ matched: number; unmatched: number }>
  exportGuestsCsv: () => void
  downloadGuestCsvTemplate: () => void
  exportBackup: () => void
  importBackup: (json: string) => void
  saveCampaign: (campaign: EmailCampaign) => void
  deleteCampaign: (id: string) => void
  markSaveTheDateSent: (guestIds: string[], status: Guest['saveTheDateStatus']) => void
  cloudEnabled: boolean
  cloudReady: boolean
  cloudEmail: string | null
  cloudError: string
  cloudLive: boolean
  signInCloud: (email: string) => Promise<void>
  signOutCloud: () => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

function computeMetrics(guests: Guest[]): Metrics {
  const totalGuests = guests.reduce((s, g) => s + seatedCount(g), 0)
  const totalParty = guests.reduce(
    (s, g) => s + Math.max(g.partySize || 1, seatedCount(g)),
    0,
  )
  const withEmail = guests.filter((g) => g.email.trim()).length
  const rsvpSubmitted = guests.filter((g) => g.rsvpStatus === 'submitted').length
  const rsvpUnknown = guests.filter((g) => g.rsvpStatus === 'unknown').length
  const saveTheDateSent = guests.filter((g) => g.saveTheDateStatus === 'sent').length
  const saveTheDatePending = guests.filter(
    (g) => g.email.trim() && g.saveTheDateStatus !== 'sent',
  ).length
  const saveTheDateAcknowledged = guests.filter((g) => g.saveTheDateAcknowledged).length
  return {
    totalGuests,
    totalParty,
    withEmail,
    rsvpSubmitted,
    rsvpUnknown,
    rsvpRate: guests.length ? Math.round((rsvpSubmitted / guests.length) * 100) : 0,
    saveTheDateSent,
    saveTheDatePending,
    saveTheDateAcknowledged,
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => loadData())
  const [unlocked, setUnlocked] = useState(() => !loadData().settings.appPin)
  const [cloudEmail, setCloudEmail] = useState<string | null>(null)
  const [cloudReady, setCloudReady] = useState(!cloudConfigured())
  const [cloudError, setCloudError] = useState('')
  const [cloudLive, setCloudLive] = useState(false)
  const hydrated = useRef(false)
  const applyingRemote = useRef(false)
  const lastPushed = useRef('')

  const persist = useEffectEvent((next: AppData) => {
    saveData(next)
  })

  useEffect(() => {
    persist(data)
  }, [data, persist])

  useEffect(() => {
    const sb = getCloud()
    if (!sb) return
    let cancelled = false
    sb.auth.getSession().then(({ data: sessionData }) => {
      if (cancelled) return
      setCloudEmail(sessionData.session?.user.email ?? null)
      setCloudReady(true)
    })
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setCloudEmail(session?.user.email ?? null)
      if (!session) {
        hydrated.current = false
        setCloudLive(false)
      }
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const sb = getCloud()
    if (!sb || !cloudEmail) return
    let cancelled = false
    hydrated.current = false
    setCloudLive(false)

    async function hydrate() {
      try {
        const remote = await fetchHubState()
        if (cancelled) return
        const local = loadData()
        if (remote && remote.guests.length > 0) {
          lastPushed.current = JSON.stringify(remote)
          applyingRemote.current = true
          setData(remote)
          setCloudError('')
        } else if (local.guests.length > 0) {
          await saveHubState(local, cloudEmail!)
          lastPushed.current = JSON.stringify(local)
          setCloudError('')
        }
        hydrated.current = true
        setCloudLive(true)
      } catch (err) {
        if (!cancelled) {
          setCloudError(err instanceof Error ? err.message : 'Could not sync guest list')
          hydrated.current = true
        }
      }
    }

    void hydrate()

    const channel = sb
      .channel('hub-state')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hub_state', filter: 'id=eq.1' },
        (payload) => {
          const next = (payload.new as { data?: unknown } | null)?.data
          if (!next) return
          const parsed = typeof next === 'string' ? JSON.parse(next) : next
          const remote = normalizeAppData(parsed)
          if (!remote) return
          const serialized = JSON.stringify(remote)
          if (serialized === lastPushed.current) return
          lastPushed.current = serialized
          applyingRemote.current = true
          setData(remote)
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void sb.removeChannel(channel)
    }
  }, [cloudEmail])

  useEffect(() => {
    if (!cloudEmail || !hydrated.current) return
    if (applyingRemote.current) {
      applyingRemote.current = false
      return
    }
    const snapshot = JSON.stringify(data)
    if (snapshot === lastPushed.current) return
    const email = cloudEmail
    const handle = window.setTimeout(() => {
      void saveHubState(data, email)
        .then(() => {
          lastPushed.current = snapshot
          setCloudError('')
          setCloudLive(true)
        })
        .catch((err: unknown) => {
          setCloudError(err instanceof Error ? err.message : 'Could not save to cloud')
          setCloudLive(false)
        })
    }, 700)
    return () => window.clearTimeout(handle)
  }, [data, cloudEmail])

  useEffect(() => {
    const mode = data.settings.theme === 'dark' ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', mode)
  }, [data.settings.theme])

  const metrics = useMemo(() => computeMetrics(data.guests), [data.guests])

  const value = useMemo<AppContextValue>(
    () => ({
      data,
      metrics,
      unlocked,
      unlock: (pin) => {
        if (!data.settings.appPin || pin === data.settings.appPin) {
          setUnlocked(true)
          return true
        }
        return false
      },
      lock: () => setUnlocked(false),
      updateSettings: (patch) => {
        setData((d) => ({
          ...d,
          settings: {
            ...d.settings,
            ...patch,
            emailjs: { ...d.settings.emailjs, ...patch.emailjs },
          },
        }))
      },
      addGuest: (partial) => {
        const now = new Date().toISOString()
        const guest: Guest = {
          id: uid('guest'),
          firstName: '',
          lastName: '',
          email: '',
          plusOnes: [],
          plusOne: false,
          plusOneName: '',
          partySize: 1,
          tags: [],
          rsvpStatus: 'unknown',
          saveTheDateStatus: 'not_sent',
          saveTheDateAcknowledged: false,
          createdAt: now,
          updatedAt: now,
          ...partial,
        }
        setData((d) => ({ ...d, guests: [guest, ...d.guests] }))
        return guest
      },
      updateGuest: (id, patch) => {
        setData((d) => ({
          ...d,
          guests: d.guests.map((g) =>
            g.id === id ? { ...g, ...patch, updatedAt: new Date().toISOString() } : g,
          ),
        }))
      },
      deleteGuest: (id) => {
        setData((d) => ({ ...d, guests: d.guests.filter((g) => g.id !== id) }))
      },
      reorderGuests: (activeId, overId) => {
        if (!activeId || !overId || activeId === overId) return
        setData((d) => {
          const from = d.guests.findIndex((g) => g.id === activeId)
          const to = d.guests.findIndex((g) => g.id === overId)
          if (from < 0 || to < 0) return d
          const guests = d.guests.slice()
          const [moved] = guests.splice(from, 1)
          guests.splice(to, 0, moved)
          return { ...d, guests }
        })
      },
      importRsvpCsv: (csv) => {
        let result = { matched: 0, created: 0, removed: 0 }
        setData((d) => {
          const merged = mergeRsvpCsv(d.guests, csv)
          result = {
            matched: merged.matched,
            created: merged.created,
            removed: merged.removed,
          }
          return { ...d, guests: merged.guests }
        })
        return result
      },
      importAckCsv: (csv) => {
        let result = { matched: 0, unmatched: 0 }
        setData((d) => {
          const merged = mergeAckCsv(d.guests, csv)
          result = { matched: merged.matched, unmatched: merged.unmatched }
          return { ...d, guests: merged.guests }
        })
        return result
      },
      refreshAcksFromFeed: async () => {
        const url = data.settings.saveTheDateAckResponsesUrl?.trim()
        if (!url) {
          throw new Error(
            'Add an Ack responses feed URL in Settings (Google Apps Script web app).',
          )
        }
        const res = await fetch(url)
        if (!res.ok) {
          throw new Error(`Could not fetch ack feed (${res.status}). Check the URL and sharing.`)
        }
        const text = await res.text()
        if (!text.trim()) {
          throw new Error('Ack feed was empty.')
        }
        let result = { matched: 0, unmatched: 0 }
        setData((d) => {
          const merged = mergeAckCsv(d.guests, text)
          result = { matched: merged.matched, unmatched: merged.unmatched }
          return { ...d, guests: merged.guests }
        })
        return result
      },
      exportGuestsCsv: () => {
        downloadText(guestsToCsv(data.guests), 'guests.csv', 'text/csv')
      },
      downloadGuestCsvTemplate: () => {
        downloadText(guestCsvTemplate(), 'guest-csv-template.csv', 'text/csv')
      },
      exportBackup: () => downloadJson(data),
      importBackup: (json) => {
        const parsed = JSON.parse(json) as AppData
        if (parsed.version !== 1) throw new Error('Unsupported backup version')
        setData(parsed)
      },
      saveCampaign: (campaign) => {
        setData((d) => {
          const exists = d.campaigns.some((c) => c.id === campaign.id)
          return {
            ...d,
            campaigns: exists
              ? d.campaigns.map((c) => (c.id === campaign.id ? campaign : c))
              : [campaign, ...d.campaigns],
          }
        })
      },
      deleteCampaign: (id) => {
        setData((d) => ({ ...d, campaigns: d.campaigns.filter((c) => c.id !== id) }))
      },
      cloudEnabled: cloudConfigured(),
      cloudReady,
      cloudEmail,
      cloudError,
      cloudLive,
      signInCloud: async (email) => {
        setCloudError('')
        await signInWithEmail(email)
      },
      signOutCloud: async () => {
        await signOutCloudSession()
        setCloudEmail(null)
        setCloudLive(false)
        hydrated.current = false
      },
      markSaveTheDateSent: (guestIds, status) => {
        const now = new Date().toISOString()
        const set = new Set(guestIds)
        setData((d) => ({
          ...d,
          guests: d.guests.map((g) =>
            set.has(g.id)
              ? {
                  ...g,
                  saveTheDateStatus: status,
                  saveTheDateSentAt: status === 'sent' ? now : g.saveTheDateSentAt,
                  updatedAt: now,
                }
              : g,
          ),
        }))
      },
    }),
    [data, metrics, unlocked, cloudReady, cloudEmail, cloudError, cloudLive],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
