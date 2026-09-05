import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import {
  buildSaveTheDateContent,
  emailjsConfigured,
  mailtoDraft,
  sendSaveTheDate,
} from '../lib/email'
import { uid } from '../lib/id'
import type { EmailAttachment, EmailCampaign, Guest } from '../types'

const SAVE_THE_DATE_IMAGE =
  'https://www.dropbox.com/scl/fi/f1eqb4ye3c1nxieu337bx/shawn-mary-save-the-date.png?rlkey=m3xilbxatm25vt6cdfkj7hr7y&raw=1'

const ACK_FORM_URL = 'https://forms.gle/1t4K36a7Kwcoh6EE7'

const DEFAULT_BODY = `Dear {{firstName}},

We're so excited to celebrate with you!

Please save the date for Shawn and Mary — Saturday, July 31, 2027.

Our wedding will take place in Vancouver, British Columbia, Canada, at Furry Creek Golf & Country Club.

Please confirm you received this: ${ACK_FORM_URL}

With love,
{{coupleNames}}`

const DEFAULT_BODY_HTML = `<p style="font-family:Georgia,serif;font-size:16px;line-height:1.5;color:#14221f;">Dear {{firstName}},</p>
<p style="margin:16px 0;">
  <img src="${SAVE_THE_DATE_IMAGE}" alt="Save the date — Shawn and Mary" width="600" style="max-width:100%;height:auto;border:0;display:block;" />
</p>
<p style="font-family:Georgia,serif;font-size:14px;line-height:1.5;color:#3d4f4a;">(If the image doesn't load, Saturday, July 31, 2027 · Vancouver, BC · Furry Creek Golf &amp; Country Club)</p>
<p style="margin:24px 0;">
  <a href="${ACK_FORM_URL}" style="display:inline-block;background:#2f6f5e;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-family:Georgia,serif;font-size:15px;">Please Confirm You Received This!</a>
</p>
<p style="font-family:Georgia,serif;font-size:13px;line-height:1.45;color:#3d4f4a;">Or open: <a href="${ACK_FORM_URL}">${ACK_FORM_URL}</a></p>`

const SAMPLE_GUEST: Guest = {
  id: 'preview-sample',
  firstName: 'Alex',
  lastName: 'Guest',
  email: 'alex.guest@example.com',
  partySize: 1,
  tags: [],
  rsvpStatus: 'unknown',
  physicalInvite: false,
  addressStatus: 'not_needed',
  saveTheDateStatus: 'not_sent',
  saveTheDateAcknowledged: false,
  createdAt: '',
  updatedAt: '',
}

export function EmailPanel() {
  const { data, saveCampaign, deleteCampaign, markSaveTheDateSent, metrics } = useApp()
  const [subject, setSubject] = useState(
    `Save the Date — ${data.settings.coupleNames || 'Our Wedding'}`,
  )
  const [bodyText, setBodyText] = useState(DEFAULT_BODY)
  const [bodyHtml, setBodyHtml] = useState(DEFAULT_BODY_HTML)
  const [linkUrls, setLinkUrls] = useState<string[]>(
    data.settings.googleFormUrl ? [data.settings.googleFormUrl] : [''],
  )
  const [attachments, setAttachments] = useState<EmailAttachment[]>([])
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        data.guests
          .filter((g) => g.email.trim() && g.saveTheDateStatus !== 'sent')
          .map((g) => g.id),
      ),
  )
  const [status, setStatus] = useState('')
  const [sending, setSending] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewAsText, setPreviewAsText] = useState(false)

  const recipients = useMemo(
    () => data.guests.filter((g) => selected.has(g.id) && g.email.trim()),
    [data.guests, selected],
  )

  const previewGuest = recipients[0] ?? data.guests.find((g) => g.email.trim()) ?? SAMPLE_GUEST

  const preview = useMemo(
    () =>
      buildSaveTheDateContent(data.settings, previewGuest, {
        subject,
        bodyHtml,
        bodyText,
        attachments,
        linkUrls: linkUrls.filter(Boolean),
      }),
    [data.settings, previewGuest, subject, bodyHtml, bodyText, attachments, linkUrls],
  )

  const configured = emailjsConfigured(data.settings)

  async function onAttachFiles(files: FileList | null) {
    if (!files?.length) return
    const next: EmailAttachment[] = []
    for (const file of Array.from(files)) {
      if (file.size > 1_500_000) {
        setStatus(`Skipped ${file.name} (over ~1.5MB — host it and paste a link instead).`)
        continue
      }
      const url = await readAsDataUrl(file)
      next.push({
        id: uid('att'),
        name: file.name,
        url,
        kind: file.type.startsWith('image/') ? 'photo' : 'file',
        sizeBytes: file.size,
      })
    }
    setAttachments((a) => [...a, ...next])
  }

  function addLinkAttachment() {
    const url = prompt('Paste a public link (photo album, PDF, RSVP form…)')
    if (!url?.trim()) return
    setAttachments((a) => [
      ...a,
      { id: uid('att'), name: url.trim(), url: url.trim(), kind: 'link' },
    ])
  }

  function persistCampaign(): EmailCampaign {
    const campaign: EmailCampaign = {
      id: uid('campaign'),
      name: subject || 'Save the Date',
      subject,
      bodyHtml,
      bodyText,
      attachments,
      linkUrls: linkUrls.filter(Boolean),
      recipientIds: [...selected],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    saveCampaign(campaign)
    return campaign
  }

  async function sendAll() {
    if (!recipients.length) {
      setStatus('Select at least one guest with an email.')
      return
    }
    if (!configured) {
      setStatus('Configure EmailJS in Settings, or use “Open mailto draft”.')
      return
    }
    setSending(true)
    setStatus(`Sending 0 / ${recipients.length}…`)
    let ok = 0
    const failed: string[] = []
    for (const guest of recipients) {
      try {
        await sendSaveTheDate(data.settings, guest, {
          subject,
          bodyHtml,
          bodyText,
          attachments,
          linkUrls: linkUrls.filter(Boolean),
        })
        markSaveTheDateSent([guest.id], 'sent')
        ok++
        setStatus(`Sending ${ok} / ${recipients.length}…`)
        // gentle throttle for free EmailJS limits
        await sleep(400)
      } catch (err) {
        markSaveTheDateSent([guest.id], 'failed')
        failed.push(guest.email)
        console.error(err)
      }
    }
    persistCampaign()
    setSending(false)
    setStatus(
      failed.length
        ? `Sent ${ok}. Failed: ${failed.join(', ')}`
        : `Sent save-the-dates to ${ok} guests.`,
    )
  }

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>Save the dates</h2>
          <p className="muted">
            Compose once, attach photos/files/links, and send from this site via EmailJS
            (free tier covers ~120 one-time sends). {metrics.saveTheDatePending} still
            pending.
          </p>
        </div>
        <div className="row gap">
          <button type="button" className="btn" onClick={() => setShowPreview(true)}>
            Preview
          </button>
          <button type="button" className="btn" onClick={() => persistCampaign()}>
            Save draft
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={sending}
            onClick={() => void sendAll()}
          >
            {sending ? 'Sending…' : `Send to ${recipients.length}`}
          </button>
        </div>
      </header>

      {!configured ? (
        <div className="banner">
          Email sending needs a free{' '}
          <a href="https://www.emailjs.com/" target="_blank" rel="noreferrer">
            EmailJS
          </a>{' '}
          account. Add your public key, service ID, and template ID under Settings. Template
          fields used: <code>to_email</code>, <code>to_name</code>, <code>subject</code>,{' '}
          <code>message_html</code>, <code>message</code>, <code>from_name</code>,{' '}
          <code>reply_to</code>.
        </div>
      ) : null}

      <div className="split">
        <div className="stack">
          <label>
            Subject
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label>
            Plain text body
            <textarea
              className="input"
              rows={8}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
            />
          </label>
          <label>
            HTML body (optional polish)
            <textarea
              className="input mono"
              rows={6}
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
            />
          </label>
          <p className="tiny muted">
            Tokens: <code>{'{{firstName}}'}</code>, <code>{'{{coupleNames}}'}</code>
          </p>

          <div className="stack">
            <strong>Links</strong>
            {linkUrls.map((url, i) => (
              <input
                key={i}
                className="input"
                placeholder="https://… (RSVP form, photo album, map)"
                value={url}
                onChange={(e) => {
                  const next = [...linkUrls]
                  next[i] = e.target.value
                  setLinkUrls(next)
                }}
              />
            ))}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setLinkUrls((u) => [...u, ''])}
            >
              + Add link
            </button>
          </div>

          <div className="stack">
            <strong>Attachments</strong>
            <div className="row gap wrap">
              <label className="file-btn">
                Upload photos / files
                <input
                  type="file"
                  multiple
                  hidden
                  onChange={(e) => void onAttachFiles(e.target.files)}
                />
              </label>
              <button type="button" className="btn" onClick={addLinkAttachment}>
                Attach by URL
              </button>
            </div>
            <ul className="att-list">
              {attachments.map((a) => (
                <li key={a.id}>
                  <span>
                    {a.kind}: {a.name}
                    {a.sizeBytes ? ` (${Math.round(a.sizeBytes / 1024)} KB)` : ''}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost danger"
                    onClick={() => setAttachments((list) => list.filter((x) => x.id !== a.id))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <p className="tiny muted">
              Large files: host on Google Drive / Dropbox and attach the share link. EmailJS
              free templates work best with links rather than huge binary attachments.
            </p>
          </div>
        </div>

        <div className="stack">
          <div className="row gap between">
            <strong>Recipients ({recipients.length})</strong>
            <div className="row gap">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() =>
                  setSelected(
                    new Set(
                      data.guests.filter((g) => g.email.trim()).map((g) => g.id),
                    ),
                  )
                }
              >
                All with email
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() =>
                  setSelected(
                    new Set(
                      data.guests
                        .filter((g) => g.email.trim() && g.saveTheDateStatus !== 'sent')
                        .map((g) => g.id),
                    ),
                  )
                }
              >
                Unsent only
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setSelected(new Set())}>
                Clear
              </button>
            </div>
          </div>
          <div className="recipient-list" tabIndex={0} role="listbox" aria-label="Email recipients">
            {data.guests.map((g) => (
              <label key={g.id} className="check recipient">
                <input
                  type="checkbox"
                  checked={selected.has(g.id)}
                  disabled={!g.email.trim()}
                  onChange={(e) => {
                    setSelected((prev) => {
                      const next = new Set(prev)
                      if (e.target.checked) next.add(g.id)
                      else next.delete(g.id)
                      return next
                    })
                  }}
                />
                <span className="recipient-meta">
                  <span className="recipient-name">
                    {g.firstName} {g.lastName}
                    <span className="tiny muted">
                      {' '}
                      · {g.saveTheDateStatus}
                      {g.saveTheDateAcknowledged ? ' · ack' : ''}
                    </span>
                  </span>
                  <span className="recipient-email tiny muted">{g.email || 'no email'}</span>
                </span>
              </label>
            ))}
          </div>

          {recipients[0] ? (
            <button
              type="button"
              className="btn"
              onClick={() => {
                window.location.href = mailtoDraft(
                  recipients[0],
                  subject,
                  bodyText,
                  data.settings,
                )
              }}
            >
              Open mailto draft (first selected)
            </button>
          ) : null}

          {status ? <p className="banner soft">{status}</p> : null}

          {data.campaigns.length ? (
            <div className="stack">
              <strong>Saved campaigns</strong>
              {data.campaigns.slice(0, 5).map((c) => (
                <div key={c.id} className="campaign-row">
                  <div>
                    <div>{c.name}</div>
                    <div className="tiny muted">{new Date(c.createdAt).toLocaleString()}</div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost danger"
                    onClick={() => deleteCampaign(c.id)}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {showPreview ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setShowPreview(false)}
        >
          <div
            className="modal email-preview-modal"
            role="dialog"
            aria-labelledby="email-preview-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="panel-head">
              <div>
                <h2 id="email-preview-title">Email preview</h2>
                <p className="muted tiny">
                  Shown as it would send to{' '}
                  <strong>
                    {preview.toName || 'Guest'}
                    {preview.toEmail ? ` <${preview.toEmail}>` : ' (sample)'}
                  </strong>
                  . Uses the first selected recipient when available.
                </p>
              </div>
              <div className="row gap">
                <button
                  type="button"
                  className={`btn ${previewAsText ? '' : 'btn-primary'}`}
                  onClick={() => setPreviewAsText(false)}
                >
                  HTML
                </button>
                <button
                  type="button"
                  className={`btn ${previewAsText ? 'btn-primary' : ''}`}
                  onClick={() => setPreviewAsText(true)}
                >
                  Plain text
                </button>
                <button type="button" className="btn" onClick={() => setShowPreview(false)}>
                  Close
                </button>
              </div>
            </header>

            <div className="email-preview-meta">
              <div>
                <span className="tiny muted">From</span>
                <div>{preview.fromName || '—'}</div>
              </div>
              <div>
                <span className="tiny muted">To</span>
                <div>
                  {preview.toName}
                  {preview.toEmail ? ` · ${preview.toEmail}` : ''}
                </div>
              </div>
              <div>
                <span className="tiny muted">Subject</span>
                <div>{preview.subject || '(no subject)'}</div>
              </div>
            </div>

            {previewAsText ? (
              <pre className="email-preview-text">{preview.text}</pre>
            ) : (
              <div
                className="email-preview-html"
                dangerouslySetInnerHTML={{ __html: preview.html }}
              />
            )}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
