export type RsvpStatus = 'unknown' | 'submitted' | 'declined'
export type AddressStatus = 'not_needed' | 'pending' | 'submitted'
export type SaveTheDateStatus = 'not_sent' | 'queued' | 'sent' | 'failed'

export interface Guest {
  id: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  household?: string
  partySize: number
  tags: string[]
  notes?: string
  /** Google intake / RSVP form */
  rsvpStatus: RsvpStatus
  rsvpSubmittedAt?: string
  /** Physical invite mailing track */
  physicalInvite: boolean
  addressStatus: AddressStatus
  mailingAddress?: string
  addressSubmittedAt?: string
  /** Save the date email track */
  saveTheDateStatus: SaveTheDateStatus
  saveTheDateSentAt?: string
  /** Guest confirmed they received the save-the-date (via ack form) */
  saveTheDateAcknowledged: boolean
  saveTheDateAcknowledgedAt?: string
  createdAt: string
  updatedAt: string
}

export interface EmailAttachment {
  id: string
  name: string
  /** data URL or remote URL */
  url: string
  kind: 'file' | 'link' | 'photo'
  sizeBytes?: number
}

export interface EmailCampaign {
  id: string
  name: string
  subject: string
  bodyHtml: string
  bodyText: string
  attachments: EmailAttachment[]
  linkUrls: string[]
  recipientIds: string[]
  createdAt: string
  updatedAt: string
  lastSentAt?: string
}

export type ThemeMode = 'light' | 'dark'

export interface AppSettings {
  coupleNames: string
  googleFormUrl?: string
  addressFormUrl?: string
  /** Google Form: confirm save-the-date received */
  saveTheDateAckFormUrl?: string
  /**
   * Public CSV feed of form responses (Google Apps Script web app URL recommended).
   * Used by “Refresh acks from Google”.
   */
  saveTheDateAckResponsesUrl?: string
  /** When set, Guests tab refreshes acks from the feed on open */
  saveTheDateAckAutoRefresh?: boolean
  /** Optional soft lock for shared computers */
  appPin?: string
  theme: ThemeMode
  emailjs: {
    publicKey: string
    serviceId: string
    templateId: string
  }
  fromName: string
  replyToEmail: string
}

export interface AppData {
  version: 1
  guests: Guest[]
  campaigns: EmailCampaign[]
  settings: AppSettings
}

export const DEFAULT_SETTINGS: AppSettings = {
  coupleNames: 'Shawn and Mary',
  googleFormUrl: '',
  addressFormUrl: '',
  saveTheDateAckFormUrl: 'https://forms.gle/1t4K36a7Kwcoh6EE7',
  saveTheDateAckResponsesUrl: '',
  saveTheDateAckAutoRefresh: true,
  appPin: '',
  theme: 'light',
  emailjs: {
    publicKey: '',
    serviceId: '',
    templateId: '',
  },
  fromName: '',
  replyToEmail: '',
}

export function createEmptyData(): AppData {
  return {
    version: 1,
    guests: [],
    campaigns: [],
    settings: { ...DEFAULT_SETTINGS, emailjs: { ...DEFAULT_SETTINGS.emailjs } },
  }
}
