import { plusOneNames, seatedCount } from './lib/plusOnes'
import { createEmptyData, type AppData } from './types'

const KEY = 'wedding-guest-hub:v1'

export function normalizeAppData(raw: unknown): AppData | null {
  if (!raw || typeof raw !== 'object') return null
  const parsed = raw as AppData
  if (parsed.version !== 1 || !Array.isArray(parsed.guests)) return null
  return {
    ...createEmptyData(),
    ...parsed,
    guests: parsed.guests.map((g) => {
      const plusOnes = plusOneNames(g)
      const rest = { ...g } as typeof g & {
        physicalInvite?: boolean
        addressStatus?: string
        mailingAddress?: string
        addressSubmittedAt?: string
      }
      delete rest.physicalInvite
      delete rest.addressStatus
      delete rest.mailingAddress
      delete rest.addressSubmittedAt
      return {
        ...rest,
        plusOnes,
        plusOne: plusOnes.length > 0,
        plusOneName: plusOnes.join(', '),
        partySize: Math.max(g.partySize || 1, seatedCount({ plusOnes })),
        saveTheDateAcknowledged: Boolean(
          (g as { saveTheDateAcknowledged?: boolean }).saveTheDateAcknowledged,
        ),
      }
    }),
    campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns : [],
    settings: (() => {
      const saved = { ...(parsed.settings ?? {}) } as typeof parsed.settings & {
        addressFormUrl?: string
      }
      delete saved.addressFormUrl
      return {
        ...createEmptyData().settings,
        ...saved,
        emailjs: {
          ...createEmptyData().settings.emailjs,
          ...saved.emailjs,
        },
      }
    })(),
  }
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return createEmptyData()
    return normalizeAppData(JSON.parse(raw)) ?? createEmptyData()
  } catch {
    return createEmptyData()
  }
}

export function saveData(data: AppData): void {
  localStorage.setItem(KEY, JSON.stringify(data))
}

export function downloadJson(data: AppData, filename = 'wedding-guest-hub-backup.json') {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadText(text: string, filename: string, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
