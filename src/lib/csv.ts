import type { Guest, RsvpStatus } from '../types'
import { uid } from './id'

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.map((c) => c.trim())
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }
  const headers = splitCsvLine(lines[0])
  const rows = lines.slice(1).map(splitCsvLine)
  return { headers, rows }
}

function pick(map: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    const v = map[normalizeHeader(k)]
    if (v) return v
  }
  return ''
}

function normalizeName(first: string, last: string): string {
  return `${first} ${last}`.trim().toLowerCase().replace(/\s+/g, ' ')
}

function findGuestIndex(
  guests: Guest[],
  email: string,
  firstName: string,
  lastName: string,
): number {
  if (email) {
    const byEmail = guests.findIndex((g) => g.email.toLowerCase() === email)
    if (byEmail !== -1) return byEmail
  }
  const nameKey = normalizeName(firstName, lastName)
  if (!nameKey) return -1
  return guests.findIndex((g) => normalizeName(g.firstName, g.lastName) === nameKey)
}

export type MergeRsvpResult = {
  guests: Guest[]
  matched: number
  created: number
  removed: number
}

function parseBool(v: string): boolean | undefined {
  const s = v.trim().toLowerCase()
  if (!s) return undefined
  if (['true', '1', 'yes', 'y'].includes(s)) return true
  if (['false', '0', 'no', 'n'].includes(s)) return false
  return undefined
}

/**
 * Sync guests to the spreadsheet exactly: update matches, add new CSV rows,
 * remove site guests not present in the CSV. Match by email, then full name.
 */
export function mergeRsvpCsv(
  guests: Guest[],
  csvText: string,
  mode: 'rsvp' | 'address' = 'rsvp',
): MergeRsvpResult {
  const { headers, rows } = parseCsv(csvText)
  if (!headers.length) return { guests, matched: 0, created: 0, removed: 0 }

  const normHeaders = headers.map(normalizeHeader)
  let matched = 0
  let created = 0
  const now = new Date().toISOString()
  const available = [...guests]
  const synced: Guest[] = []

  for (const row of rows) {
    const map: Record<string, string> = {}
    normHeaders.forEach((h, i) => {
      map[h] = row[i] ?? ''
    })

    const email = pick(map, ['email', 'emailaddress', 'e-mail']).toLowerCase()
    const fullName = pick(map, ['name'])
    const firstName =
      pick(map, ['firstname', 'first', 'givenname']) ||
      fullName.split(/\s+/)[0] ||
      (email ? 'Guest' : '')
    const lastName =
      pick(map, ['lastname', 'last', 'surname', 'familyname']) ||
      fullName.split(/\s+/).slice(1).join(' ') ||
      ''
    const address = pick(map, [
      'address',
      'mailingaddress',
      'streetaddress',
      'fulladdress',
    ])
    const phone = pick(map, ['phone', 'phonenumber', 'mobile'])
    const household = pick(map, ['household', 'party', 'family'])
    const notes = pick(map, ['notes', 'note', 'comments'])
    const tagsRaw = pick(map, ['tags', 'tag'])
    const partyRaw = pick(map, ['partysize', 'guests', 'headcount'])
    const physicalRaw = pick(map, ['physicalinvite', 'physical'])
    const rsvpRaw = pick(map, ['rsvpstatus', 'rsvp'])
    const addressStatusRaw = pick(map, ['addressstatus'])
    const stdRaw = pick(map, ['savethedatestatus', 'stdstatus'])

    if (!email && !firstName) continue

    const idx = findGuestIndex(available, email, firstName, lastName)
    const partySize = partyRaw ? Math.max(1, Number.parseInt(partyRaw, 10) || 1) : undefined
    const physicalInvite = parseBool(physicalRaw)
    const tags = tagsRaw
      ? tagsRaw
          .split(/[;,]/)
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined

    if (idx === -1) {
      const guest: Guest = {
        id: uid('guest'),
        firstName,
        lastName,
        email,
        phone: phone || undefined,
        household: household || undefined,
        partySize: partySize ?? 1,
        tags: tags ?? [],
        notes: notes || undefined,
        rsvpStatus: (rsvpRaw as RsvpStatus) || (mode === 'rsvp' ? 'submitted' : 'unknown'),
        rsvpSubmittedAt: mode === 'rsvp' || rsvpRaw === 'submitted' ? now : undefined,
        physicalInvite: physicalInvite ?? mode === 'address',
        addressStatus:
          (addressStatusRaw as Guest['addressStatus']) ||
          (mode === 'address' ? 'submitted' : 'not_needed'),
        mailingAddress: address || undefined,
        addressSubmittedAt: mode === 'address' || addressStatusRaw === 'submitted' ? now : undefined,
        saveTheDateStatus: (stdRaw as Guest['saveTheDateStatus']) || 'not_sent',
        createdAt: now,
        updatedAt: now,
      }
      synced.push(guest)
      created++
      continue
    }

    const prev = available[idx]
    available.splice(idx, 1)
    const g: Guest = { ...prev }
    g.firstName = firstName || g.firstName
    g.lastName = lastName || g.lastName
    if (email) g.email = email
    if (phone) g.phone = phone
    if (household) g.household = household
    if (notes) g.notes = notes
    if (tags) g.tags = tags
    if (partySize != null) g.partySize = partySize
    if (physicalInvite != null) g.physicalInvite = physicalInvite
    if (address) g.mailingAddress = address
    if (rsvpRaw) g.rsvpStatus = rsvpRaw as RsvpStatus
    if (addressStatusRaw) g.addressStatus = addressStatusRaw as Guest['addressStatus']
    if (stdRaw) g.saveTheDateStatus = stdRaw as Guest['saveTheDateStatus']

    if (mode === 'rsvp') {
      g.rsvpStatus = 'submitted'
      g.rsvpSubmittedAt = now
    } else {
      g.physicalInvite = true
      g.addressStatus = 'submitted'
      g.addressSubmittedAt = now
      if (address) g.mailingAddress = address
    }
    g.updatedAt = now
    synced.push(g)
    matched++
  }

  const removed = available.length
  return { guests: synced, matched, created, removed }
}

/** Column order shared by export + blank intake template (matches import aliases). */
export const GUEST_CSV_HEADERS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'household',
  'partySize',
  'tags',
  'rsvpStatus',
  'physicalInvite',
  'addressStatus',
  'mailingAddress',
  'saveTheDateStatus',
  'notes',
] as const

function escapeCsv(v: string): string {
  return `"${v.replace(/"/g, '""')}"`
}

function guestRow(g: {
  firstName: string
  lastName: string
  email: string
  phone?: string
  household?: string
  partySize: number
  tags: string[]
  rsvpStatus: string
  physicalInvite: boolean
  addressStatus: string
  mailingAddress?: string
  saveTheDateStatus: string
  notes?: string
}): string {
  return [
    g.firstName,
    g.lastName,
    g.email,
    g.phone ?? '',
    g.household ?? '',
    String(g.partySize),
    g.tags.join(';'),
    g.rsvpStatus,
    String(g.physicalInvite),
    g.addressStatus,
    g.mailingAddress ?? '',
    g.saveTheDateStatus,
    g.notes ?? '',
  ]
    .map(escapeCsv)
    .join(',')
}

/** Header-only CSV plus one sample row labeled for deletion. */
export function guestCsvTemplate(): string {
  return [
    GUEST_CSV_HEADERS.join(','),
    guestRow({
      firstName: 'Alex',
      lastName: 'Example',
      email: 'alex.example@email.com',
      phone: '555-0100',
      household: 'Example household',
      partySize: 2,
      tags: ['family'],
      rsvpStatus: 'unknown',
      physicalInvite: false,
      addressStatus: 'not_needed',
      mailingAddress: '',
      saveTheDateStatus: 'not_sent',
      notes: 'EXAMPLE – delete me',
    }),
  ].join('\n')
}

export function guestsToCsv(guests: Guest[]): string {
  const lines = [GUEST_CSV_HEADERS.join(',')]
  for (const g of guests) {
    lines.push(guestRow(g))
  }
  return lines.join('\n')
}
