import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useEffectEvent,
  type ReactNode,
} from 'react'
import { guestCsvTemplate, guestsToCsv, mergeAckCsv, mergeRsvpCsv } from '../lib/csv'
import { uid } from '../lib/id'
import { downloadJson, downloadText, loadData, saveData } from '../storage'
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
  physicalInvites: number
  addressPending: number
  addressSubmitted: number
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
  importRsvpCsv: (csv: string, mode: 'rsvp' | 'address') => {
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
}

const AppContext = createContext<AppContextValue | null>(null)

function computeMetrics(guests: Guest[]): Metrics {
  const totalGuests = guests.length
  const totalParty = guests.reduce((s, g) => s + (g.partySize || 1), 0)
  const withEmail = guests.filter((g) => g.email.trim()).length
  const rsvpSubmitted = guests.filter((g) => g.rsvpStatus === 'submitted').length
  const rsvpUnknown = guests.filter((g) => g.rsvpStatus === 'unknown').length
  const physicalInvites = guests.filter((g) => g.physicalInvite).length
  const addressPending = guests.filter(
    (g) => g.physicalInvite && g.addressStatus === 'pending',
  ).length
  const addressSubmitted = guests.filter(
    (g) => g.physicalInvite && g.addressStatus === 'submitted',
  ).length
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
    rsvpRate: totalGuests ? Math.round((rsvpSubmitted / totalGuests) * 100) : 0,
    physicalInvites,
    addressPending,
    addressSubmitted,
    saveTheDateSent,
    saveTheDatePending,
    saveTheDateAcknowledged,
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => loadData())
  const [unlocked, setUnlocked] = useState(() => !loadData().settings.appPin)

  const persist = useEffectEvent((next: AppData) => {
    saveData(next)
  })

  useEffect(() => {
    persist(data)
  }, [data, persist])

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
          partySize: 1,
          tags: [],
          rsvpStatus: 'unknown',
          physicalInvite: false,
          addressStatus: 'not_needed',
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
      importRsvpCsv: (csv, mode) => {
        let result = { matched: 0, created: 0, removed: 0 }
        setData((d) => {
          const merged = mergeRsvpCsv(d.guests, csv, mode)
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
    [data, metrics, unlocked],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
