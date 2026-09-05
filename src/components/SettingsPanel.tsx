import { useState } from 'react'
import { useApp } from '../context/AppContext'
import type { ThemeMode } from '../types'

export function SettingsPanel() {
  const { data, updateSettings, exportBackup, importBackup, lock } = useApp()
  const [s, setS] = useState(data.settings)
  const [msg, setMsg] = useState('')

  function save() {
    updateSettings(s)
    setMsg('Settings saved.')
  }

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>Settings</h2>
          <p className="muted">
            Brand name, theme, form links, EmailJS keys, backup, and optional PIN.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={save}>
          Save settings
        </button>
      </header>

      {msg ? <p className="banner soft">{msg}</p> : null}

      <div className="form-grid">
        <label>
          Couple / brand name
          <input
            className="input"
            value={s.coupleNames}
            onChange={(e) => setS({ ...s, coupleNames: e.target.value })}
          />
        </label>
        <label className="span-2">
          Google RSVP / intake form URL
          <input
            className="input"
            value={s.googleFormUrl ?? ''}
            onChange={(e) => setS({ ...s, googleFormUrl: e.target.value })}
          />
        </label>
        <label className="span-2">
          Address intake form URL (physical invites)
          <input
            className="input"
            value={s.addressFormUrl ?? ''}
            onChange={(e) => setS({ ...s, addressFormUrl: e.target.value })}
          />
        </label>
        <label className="span-2">
          Save-the-date acknowledgement form URL
          <input
            className="input"
            value={s.saveTheDateAckFormUrl ?? ''}
            onChange={(e) => setS({ ...s, saveTheDateAckFormUrl: e.target.value })}
          />
        </label>
        <label className="span-2">
          Ack responses feed URL (auto-import)
          <input
            className="input mono"
            placeholder="https://script.google.com/macros/s/…/exec"
            value={s.saveTheDateAckResponsesUrl ?? ''}
            onChange={(e) => setS({ ...s, saveTheDateAckResponsesUrl: e.target.value })}
          />
        </label>
        <label className="check span-2">
          <input
            type="checkbox"
            checked={Boolean(s.saveTheDateAckAutoRefresh)}
            onChange={(e) => setS({ ...s, saveTheDateAckAutoRefresh: e.target.checked })}
          />
          Auto-refresh acknowledgements when opening Guests
        </label>
        <p className="muted tiny span-2">
          Link the form to a Sheet, then deploy <code>scripts/google-ack-webapp.gs</code> as a
          Google Apps Script web app (Anyone). Paste that URL above. Direct Google Sheet CSV
          links often fail in the browser due to CORS.
        </p>
        <label>
          From name
          <input
            className="input"
            value={s.fromName}
            onChange={(e) => setS({ ...s, fromName: e.target.value })}
          />
        </label>
        <label>
          Reply-to email
          <input
            className="input"
            type="email"
            value={s.replyToEmail}
            onChange={(e) => setS({ ...s, replyToEmail: e.target.value })}
          />
        </label>
        <label>
          Optional app PIN
          <input
            className="input"
            type="password"
            autoComplete="off"
            value={s.appPin ?? ''}
            onChange={(e) => setS({ ...s, appPin: e.target.value })}
          />
        </label>
        <label>
          Theme
          <select
            className="input"
            value={s.theme ?? 'light'}
            onChange={(e) => {
              const theme: ThemeMode = e.target.value === 'dark' ? 'dark' : 'light'
              const next = { ...s, theme }
              setS(next)
              updateSettings({ theme })
            }}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </div>

      <h3 className="subhead">EmailJS (free send from the site)</h3>
      <div className="form-grid">
        <label>
          Public key
          <input
            className="input mono"
            value={s.emailjs.publicKey}
            onChange={(e) =>
              setS({ ...s, emailjs: { ...s.emailjs, publicKey: e.target.value } })
            }
          />
        </label>
        <label>
          Service ID
          <input
            className="input mono"
            value={s.emailjs.serviceId}
            onChange={(e) =>
              setS({ ...s, emailjs: { ...s.emailjs, serviceId: e.target.value } })
            }
          />
        </label>
        <label className="span-2">
          Template ID
          <input
            className="input mono"
            value={s.emailjs.templateId}
            onChange={(e) =>
              setS({ ...s, emailjs: { ...s.emailjs, templateId: e.target.value } })
            }
          />
        </label>
      </div>

      <h3 className="subhead">Backup</h3>
      <p className="muted">
        Data lives in this browser (localStorage). Export regularly — and before clearing
        site data. Import to restore on another device.
      </p>
      <div className="row gap wrap">
        <button type="button" className="btn" onClick={() => exportBackup()}>
          Download JSON backup
        </button>
        <label className="file-btn">
          Import JSON backup
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              try {
                const text = await f.text()
                importBackup(text)
                const parsed = JSON.parse(text) as { settings?: typeof s }
                if (parsed.settings) setS(parsed.settings)
                setMsg('Backup imported.')
              } catch (err) {
                setMsg(err instanceof Error ? err.message : 'Import failed')
              }
              e.target.value = ''
            }}
          />
        </label>
        {s.appPin ? (
          <button type="button" className="btn" onClick={() => lock()}>
            Lock app
          </button>
        ) : null}
      </div>
    </section>
  )
}
