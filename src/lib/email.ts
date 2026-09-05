import emailjs from '@emailjs/browser'
import type { AppSettings, EmailAttachment, Guest } from '../types'

export function emailjsConfigured(settings: AppSettings): boolean {
  const { publicKey, serviceId, templateId } = settings.emailjs
  return Boolean(publicKey && serviceId && templateId)
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
    opts.bodyHtml.replaceAll('{{firstName}}', guest.firstName).replaceAll(
      '{{coupleNames}}',
      settings.coupleNames,
    ) + attachmentsBlock(opts.attachments, opts.linkUrls)

  const text =
    opts.bodyText
      .replaceAll('{{firstName}}', guest.firstName)
      .replaceAll('{{coupleNames}}', settings.coupleNames) +
    (opts.linkUrls.length
      ? `\n\nLinks:\n${opts.linkUrls.map((u) => `- ${u}`).join('\n')}`
      : '')

  return {
    subject: opts.subject,
    html,
    text,
    toEmail: guest.email,
    toName: `${guest.firstName} ${guest.lastName}`.trim(),
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
      wedding_date: settings.weddingDate,
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
  const body = bodyText
    .replaceAll('{{firstName}}', guest.firstName)
    .replaceAll('{{coupleNames}}', settings.coupleNames)
  return `mailto:${encodeURIComponent(guest.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
