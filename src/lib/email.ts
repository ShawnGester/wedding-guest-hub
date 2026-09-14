import emailjs from '@emailjs/browser'
import { plusOneNames } from './plusOnes'
import type { AppSettings, EmailAttachment, Guest } from '../types'

export function emailjsConfigured(settings: AppSettings): boolean {
  const { publicKey, serviceId, templateId } = settings.emailjs
  return Boolean(publicKey && serviceId && templateId)
}

/** First name of a plus-one full name ("Choco Marks" → "Choco"). */
export function plusOneFirstName(name?: string): string {
  return (name ?? '').trim().split(/\s+/).filter(Boolean)[0] ?? ''
}

/** Greeting used in emails: "Caroline", "Caroline and Choco", or "Caroline, Choco, and Sam". */
export function greetingName(guest: Guest): string {
  const names = [guest.firstName.trim(), ...plusOneNames(guest).map(plusOneFirstName)].filter(
    Boolean,
  )
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

function applyMessageTokens(template: string, settings: AppSettings, guest: Guest): string {
  const greeting = greetingName(guest)
  return template
    .replaceAll('{{guestNames}}', greeting)
    .replaceAll('{{ourNames}}', settings.coupleNames)
    // leftover aliases so already-saved drafts do not send the literal token
    .replaceAll('{{names}}', greeting)
    .replaceAll('{{greeting}}', greeting)
    .replaceAll('{{firstName}}', greeting)
    .replaceAll('{{coupleNames}}', settings.coupleNames)
}

function attachmentsBlock(attachments: EmailAttachment[], links: string[]): string {
  const parts: string[] = []
  for (const a of attachments) {
    if (a.kind === 'link' || a.url.startsWith('http')) {
      parts.push(`<li><a href="${a.url}">${a.name}</a></li>`)
    } else {
      parts.push(`<li>${a.name} (attached in campaign — open hub to download)</li>`)
    }
  }
  for (const url of links) {
    if (!url.trim()) continue
    parts.push(`<li><a href="${url.trim()}">${url.trim()}</a></li>`)
  }
  if (!parts.length) return ''
  return `<p><strong>Links &amp; attachments</strong></p><ul>${parts.join('')}</ul>`
}

export function buildSaveTheDateContent(
  settings: AppSettings,
  guest: Guest,
  opts: {
    subject: string
    bodyHtml: string
    bodyText: string
    attachments: EmailAttachment[]
    linkUrls: string[]
  },
): { subject: string; html: string; text: string; toEmail: string; toName: string; fromName: string } {
  const html =
    applyMessageTokens(opts.bodyHtml, settings, guest) +
    attachmentsBlock(opts.attachments, opts.linkUrls)

  const text =
    applyMessageTokens(opts.bodyText, settings, guest) +
    (opts.linkUrls.length
      ? `\n\nLinks:\n${opts.linkUrls.map((u) => `- ${u}`).join('\n')}`
      : '')

  return {
    subject: opts.subject,
    html,
    text,
    toEmail: guest.email,
    toName: greetingName(guest) || `${guest.firstName} ${guest.lastName}`.trim(),
    fromName: settings.fromName || settings.coupleNames,
  }
}

export async function sendSaveTheDate(
  settings: AppSettings,
  guest: Guest,
  opts: {
    subject: string
    bodyHtml: string
    bodyText: string
    attachments: EmailAttachment[]
    linkUrls: string[]
  },
): Promise<void> {
  if (!emailjsConfigured(settings)) {
    throw new Error('EmailJS is not configured. Add keys in Settings.')
  }
  if (!guest.email.trim()) {
    throw new Error(`${guest.firstName} has no email address.`)
  }

  const content = buildSaveTheDateContent(settings, guest, opts)

  await emailjs.send(
    settings.emailjs.serviceId,
    settings.emailjs.templateId,
    {
      to_email: content.toEmail,
      to_name: content.toName,
      from_name: content.fromName,
      reply_to: settings.replyToEmail,
      subject: content.subject,
      message_html: content.html,
      message: content.text,
      couple_names: settings.coupleNames,
    },
    { publicKey: settings.emailjs.publicKey },
  )
}

/** Fallback: open a mailto draft for a single guest. */
export function mailtoDraft(
  guest: Guest,
  subject: string,
  bodyText: string,
  settings: AppSettings,
): string {
  const body = applyMessageTokens(bodyText, settings, guest)
  return `mailto:${encodeURIComponent(guest.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
