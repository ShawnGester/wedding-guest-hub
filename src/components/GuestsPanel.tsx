import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import type { AddressStatus, Guest, RsvpStatus, SaveTheDateStatus } from '../types'

type Filter = 'all' | 'missing_rsvp' | 'physical' | 'no_email' | 'std_pending'

export function GuestsPanel() {
  const {
    data,
    addGuest,
    updateGuest,
    deleteGuest,
    importRsvpCsv,
    exportGuestsCsv,
    downloadGuestCsvTemplate,
  } = useApp()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [importMsg, setImportMsg] = useState('')

  const guests = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.guests.filter((g) => {
      if (filter === 'missing_rsvp' && g.rsvpStatus === 'submitted') return false
      if (filter === 'physical' && !g.physicalInvite) return false
      if (filter === 'no_email' && g.email.trim()) return false
      if (filter === 'std_pending' && g.saveTheDateStatus === 'sent') return false
      if (!q) return true
      const hay = `${g.firstName} ${g.lastName} ${g.email} ${g.household ?? ''} ${g.tags.join(' ')}`.toLowerCase()
      return hay.includes(q)
    })
  }, [data.guests, query, filter])

  const editing = data.guests.find((g) => g.id === editingId) ?? null

  async function onImportFile(file: File, mode: 'rsvp' | 'address') {
    const text = await file.text()
    const result = importRsvpCsv(text, mode)
    setImportMsg(
      `Imported ${mode}: ${result.matched} matched, ${result.created} created.`,
    )
  }

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>Guest list</h2>
          <p className="muted">
            Track emails, Google form RSVPs, and physical-invite address intakes.
          </p>
        </div>
        <div className="row gap">
          <button type="button" className="btn" onClick={() => exportGuestsCsv()}>
            Export CSV
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              const g = addGuest({ firstName: 'New', lastName: 'Guest' })
              setEditingId(g.id)
            }}
          >
            Add guest
          </button>
        </div>
      </header>

      <div className="toolbar">
        <input
          className="input grow"
          placeholder="Search name, email, household, tags…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="input"
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
        >
          <option value="all">All guests</option>
          <option value="missing_rsvp">Missing RSVP form</option>
          <option value="physical">Physical invites</option>
          <option value="no_email">Missing email</option>
          <option value="std_pending">Save-the-date pending</option>
        </select>
      </div>

      <div className="import-row">
        <button type="button" className="btn" onClick={() => downloadGuestCsvTemplate()}>
          Download guest CSV template
        </button>
        <label className="file-btn">
          Import Google RSVP CSV
          <input
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onImportFile(f, 'rsvp')
              e.target.value = ''
            }}
          />
        </label>
        <label className="file-btn">
          Import address intake CSV
          <input
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onImportFile(f, 'address')
              e.target.value = ''
            }}
          />
        </label>
        {importMsg ? <span className="muted">{importMsg}</span> : null}
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>RSVP form</th>
              <th>Physical</th>
              <th>Address</th>
              <th>Save the date</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {guests.map((g) => (
              <tr key={g.id}>
                <td>
                  <strong>
                    {g.firstName} {g.lastName}
                  </strong>
                  {g.household ? <div className="tiny muted">{g.household}</div> : null}
                </td>
                <td className="mono">{g.email || '—'}</td>
                <td>
                  <StatusPill value={g.rsvpStatus} />
                </td>
                <td>{g.physicalInvite ? 'Yes' : '—'}</td>
                <td>
                  {g.physicalInvite ? <StatusPill value={g.addressStatus} /> : '—'}
                </td>
                <td>
                  <StatusPill value={g.saveTheDateStatus} />
                </td>
                <td className="row gap end">
                  <button type="button" className="btn btn-ghost" onClick={() => setEditingId(g.id)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost danger"
                    onClick={() => {
                      if (confirm(`Remove ${g.firstName} ${g.lastName}?`)) deleteGuest(g.id)
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {!guests.length ? (
              <tr>
                <td colSpan={7} className="muted center">
                  No guests match this view. Add someone or clear filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {editing ? (
        <GuestEditor
          guest={editing}
          onClose={() => setEditingId(null)}
          onSave={(patch) => {
            updateGuest(editing.id, patch)
            setEditingId(null)
          }}
        />
      ) : null}
    </section>
  )
}

function StatusPill({ value }: { value: string }) {
  return <span className={`pill pill-${value}`}>{value.replaceAll('_', ' ')}</span>
}

function GuestEditor({
  guest,
  onClose,
  onSave,
}: {
  guest: Guest
  onClose: () => void
  onSave: (patch: Partial<Guest>) => void
}) {
  const [draft, setDraft] = useState(guest)
  const set = <K extends keyof Guest>(key: K, value: Guest[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-label="Edit guest"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>
          Edit {draft.firstName} {draft.lastName}
        </h3>
        <div className="form-grid">
          <label>
            First name
            <input
              className="input"
              value={draft.firstName}
              onChange={(e) => set('firstName', e.target.value)}
            />
          </label>
          <label>
            Last name
            <input
              className="input"
              value={draft.lastName}
              onChange={(e) => set('lastName', e.target.value)}
            />
          </label>
          <label>
            Email
            <input
              className="input"
              type="email"
              value={draft.email}
              onChange={(e) => set('email', e.target.value)}
            />
          </label>
          <label>
            Phone
            <input
              className="input"
              value={draft.phone ?? ''}
              onChange={(e) => set('phone', e.target.value)}
            />
          </label>
          <label>
            Household
            <input
              className="input"
              value={draft.household ?? ''}
              onChange={(e) => set('household', e.target.value)}
            />
          </label>
          <label>
            Party size
            <input
              className="input"
              type="number"
              min={1}
              value={draft.partySize}
              onChange={(e) => set('partySize', Number(e.target.value) || 1)}
            />
          </label>
          <label>
            Tags (comma-separated)
            <input
              className="input"
              value={draft.tags.join(', ')}
              onChange={(e) =>
                set(
                  'tags',
                  e.target.value
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean),
                )
              }
            />
          </label>
          <label>
            RSVP form
            <select
              className="input"
              value={draft.rsvpStatus}
              onChange={(e) => set('rsvpStatus', e.target.value as RsvpStatus)}
            >
              <option value="unknown">Unknown</option>
              <option value="submitted">Submitted</option>
              <option value="declined">Declined</option>
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.physicalInvite}
              onChange={(e) => {
                const on = e.target.checked
                setDraft((d) => ({
                  ...d,
                  physicalInvite: on,
                  addressStatus: on
                    ? d.addressStatus === 'not_needed'
                      ? 'pending'
                      : d.addressStatus
                    : 'not_needed',
                }))
              }}
            />
            Sending physical invite
          </label>
          {draft.physicalInvite ? (
            <>
              <label>
                Address intake
                <select
                  className="input"
                  value={draft.addressStatus}
                  onChange={(e) => set('addressStatus', e.target.value as AddressStatus)}
                >
                  <option value="pending">Pending</option>
                  <option value="submitted">Submitted</option>
                  <option value="not_needed">Not needed</option>
                </select>
              </label>
              <label className="span-2">
                Mailing address
                <textarea
                  className="input"
                  rows={2}
                  value={draft.mailingAddress ?? ''}
                  onChange={(e) => set('mailingAddress', e.target.value)}
                />
              </label>
            </>
          ) : null}
          <label>
            Save the date
            <select
              className="input"
              value={draft.saveTheDateStatus}
              onChange={(e) =>
                set('saveTheDateStatus', e.target.value as SaveTheDateStatus)
              }
            >
              <option value="not_sent">Not sent</option>
              <option value="queued">Queued</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
            </select>
          </label>
          <label className="span-2">
            Notes
            <textarea
              className="input"
              rows={3}
              value={draft.notes ?? ''}
              onChange={(e) => set('notes', e.target.value)}
            />
          </label>
        </div>
        <div className="row gap end">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onSave(draft)}>
            Save guest
          </button>
        </div>
      </div>
    </div>
  )
}
