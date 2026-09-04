import { createEmptyData, type AppData } from './types'

const KEY = 'wedding-guest-hub:v1'

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return createEmptyData()
    const parsed = JSON.parse(raw) as AppData
    if (parsed?.version !== 1 || !Array.isArray(parsed.guests)) {
      return createEmptyData()
    }
    return {
      ...createEmptyData(),
      ...parsed,
      settings: {
        ...createEmptyData().settings,
        ...parsed.settings,
        emailjs: {
          ...createEmptyData().settings.emailjs,
          ...parsed.settings?.emailjs,
        },
      },
    }
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
