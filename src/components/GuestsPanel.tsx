import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../context/AppContext'
import { plusOneNames, withPlusOnes } from '../lib/plusOnes'
import type { Guest, RsvpStatus, SaveTheDateStatus } from '../types'

type Filter = 'all' | 'no_email' | 'std_pending' | 'ack_pending'

export function GuestsPanel() {
  const {
    data,
    addGuest,
    updateGuest,
    deleteGuest,
    reorderGuests,
    importRsvpCsv,
    importAckCsv,
    refreshAcksFromFeed,
    exportGuestsCsv,
    downloadGuestCsvTemplate,
  } = useApp()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creatingDraft, setCreatingDraft] = useState<Guest | null>(null)
  const [importMsg, setImportMsg] = useState('')
  const [ackRefreshing, setAckRefreshing] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [ghost, setGhost] = useState<{
    x: number
    y: number
    width: number
    offsetX: number
    offsetY: number
  } | null>(null)
  const tableWrapRef = useRef<HTMLDivElement>(null)
  const dragIdRef = useRef<string | null>(null)
  const overIdRef = useRef<string | null>(null)

  const guests = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.guests.filter((g) => {
      if (filter === 'no_email' && g.email.trim()) return false
      if (filter === 'std_pending' && g.saveTheDateStatus === 'sent') return false
      if (filter === 'ack_pending' && g.saveTheDateAcknowledged) return false
      if (!q) return true
      const hay = `${g.firstName} ${g.lastName} ${plusOneNames(g).join(' ')} ${g.email} ${g.household ?? ''} ${g.tags.join(' ')}`.toLowerCase()
      return hay.includes(q)
    })
  }, [data.guests, query, filter])

  const editing = editingId ? (data.guests.find((g) => g.id === editingId) ?? null) : null
  const editorGuest = creatingDraft ?? editing
  const hasAckFeed = Boolean(data.settings.saveTheDateAckResponsesUrl?.trim())

  async function refreshAcks() {
    setAckRefreshing(true)
    try {
      const result = await refreshAcksFromFeed()
      setImportMsg(
        `Acknowledgements refreshed: ${result.matched} marked received, ${result.unmatched} unmatched skipped.`,
      )
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : 'Ack refresh failed')
    } finally {
      setAckRefreshing(false)
    }
  }

  useEffect(() => {
    if (!data.settings.saveTheDateAckAutoRefresh) return
    if (!data.settings.saveTheDateAckResponsesUrl?.trim()) return
    void refreshAcks()
    // Intentionally once when opening Guests with auto-refresh enabled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function neighborId(id: string, direction: -1 | 1) {
    const index = guests.findIndex((g) => g.id === id)
    if (index < 0) return null
    return guests[index + direction]?.id ?? null
  }

  function finishReorder() {
    const from = dragIdRef.current
    const to = overIdRef.current
    dragIdRef.current = null
    overIdRef.current = null
    setDragId(null)
    setOverId(null)
    setGhost(null)
    document.body.classList.remove('is-reordering')
    if (from && to && from !== to) reorderGuests(from, to)
  }

  function onHandlePointerDown(event: PointerEvent<HTMLButtonElement>, id: string) {
    if (event.button !== 0) return
    event.preventDefault()
    const row = event.currentTarget.closest('tr')
    const rect = row?.getBoundingClientRect()
    dragIdRef.current = id
    overIdRef.current = null
    setDragId(id)
    setOverId(null)
    setGhost(
      rect
        ? {
            x: event.clientX,
            y: event.clientY,
            width: rect.width,
            offsetX: event.clientX - rect.left,
            offsetY: event.clientY - rect.top,
          }
        : null,
    )
    document.body.classList.add('is-reordering')
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onHandlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (!dragIdRef.current) return
    setGhost((current) =>
      current ? { ...current, x: event.clientX, y: event.clientY } : current,
    )
    const wrap = tableWrapRef.current
    if (wrap) {
      const rect = wrap.getBoundingClientRect()
      if (event.clientY < rect.top + 48) wrap.scrollTop -= 14
      else if (event.clientY > rect.bottom - 48) wrap.scrollTop += 14
    }
    const under = document.elementFromPoint(event.clientX, event.clientY)
    const row = under?.closest<HTMLElement>('tr[data-guest-id]')
    const next = row?.dataset.guestId ?? null
    const target = next && next !== dragIdRef.current ? next : null
    if (overIdRef.current !== target) {
      overIdRef.current = target
      setOverId(target)
    }
  }

  function onHandleKeyDown(event: KeyboardEvent<HTMLButtonElement>, id: string) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const target = neighborId(id, event.key === 'ArrowUp' ? -1 : 1)
    if (target) reorderGuests(id, target)
  }

  async function onImportFile(file: File) {
    const text = await file.text()
    const result = importRsvpCsv(text)
    setImportMsg(
      `Synced RSVP CSV: ${result.matched} updated, ${result.created} added, ${result.removed} removed.`,
    )
  }

  async function onImportAck(file: File) {
    const text = await file.text()
    const result = importAckCsv(text)
    setImportMsg(
      `Acknowledgements: ${result.matched} marked received, ${result.unmatched} unmatched rows skipped.`,
    )
  }

  const dragged = dragId ? guests.find((g) => g.id === dragId) : null

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>Guest List</h2>
          <p className="muted">
            Track emails, Google form RSVPs, and save-the-dates.
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
              setEditingId(null)
              setCreatingDraft(newGuestDraft())
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
          <option value="no_email">Missing email</option>
          <option value="std_pending">Save-the-date pending</option>
          <option value="ack_pending">Save-the-date not acknowledged</option>
        </select>
      </div>

      <div className="import-row">
        <span className="tip">
          <button
            type="button"
            className="btn"
            aria-describedby="tip-guest-template"
            onClick={() => downloadGuestCsvTemplate()}
          >
            Download guest CSV template
          </button>
          <span id="tip-guest-template" className="tip-bubble" role="tooltip">
            Downloads a blank spreadsheet with the columns this app expects, plus one sample row to
            delete.
          </span>
        </span>
        <span className="tip">
          <label className="file-btn" aria-describedby="tip-rsvp-sync">
            Sync from Google RSVP CSV
            <input
              type="file"
              className="file-btn-input"
              accept=".csv,text/csv"
              aria-label="Sync from Google RSVP CSV"
              aria-describedby="tip-rsvp-sync"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onImportFile(f)
                e.target.value = ''
              }}
            />
          </label>
          <span id="tip-rsvp-sync" className="tip-bubble" role="tooltip">
            Makes the guest list match that file exactly. Updates matches, adds new rows, removes
            anyone not in the file, and marks those rows as RSVP submitted.
          </span>
        </span>
        <span className="tip">
          <label className="file-btn" aria-describedby="tip-ack-sync">
            Sync save-the-date ack CSV
            <input
              type="file"
              className="file-btn-input"
              accept=".csv,text/csv"
              aria-label="Sync save-the-date ack CSV"
              aria-describedby="tip-ack-sync"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onImportAck(f)
                e.target.value = ''
              }}
            />
          </label>
          <span id="tip-ack-sync" className="tip-bubble" role="tooltip">
            Manual ack import that matches by email only and marks those guests as Received. Does
            not add or delete guests.
          </span>
        </span>
        <span
          className="tip"
          tabIndex={!hasAckFeed || ackRefreshing ? 0 : undefined}
          aria-label={
            !hasAckFeed || ackRefreshing
              ? ackRefreshing
                ? 'Refreshing acks'
                : 'Refresh acks from Google'
              : undefined
          }
          aria-describedby={!hasAckFeed || ackRefreshing ? 'tip-ack-refresh' : undefined}
        >
          <button
            type="button"
            className="btn"
            disabled={!hasAckFeed || ackRefreshing}
            aria-describedby="tip-ack-refresh"
            onClick={() => void refreshAcks()}
          >
            {ackRefreshing ? 'Refreshing acks…' : 'Refresh acks from Google'}
          </button>
          <span id="tip-ack-refresh" className="tip-bubble" role="tooltip">
            {hasAckFeed
              ? 'Pulls acknowledgement responses from the feed URL in Settings and marks matching emails as Received. Does not add or delete guests.'
              : 'Set the Ack responses feed URL in Settings first. Pulls acknowledgement responses from that feed and marks matching emails as Received. Does not add or delete guests.'}
          </span>
        </span>
        {importMsg ? <span className="muted">{importMsg}</span> : null}
      </div>

      <div className="table-wrap" ref={tableWrapRef}>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Plus 1s</th>
              <th>Save the date</th>
              <th>Ack</th>
              <th />
              <th className="drag-cell">
                <span className="sr-only">Reorder</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {guests.map((g) => (
              <tr
                key={g.id}
                data-guest-id={g.id}
                className={
                  g.id === dragId ? 'is-dragging' : g.id === overId ? 'is-drop-target' : undefined
                }
              >
                <td>
                  <strong>
                    {g.firstName} {g.lastName}
                  </strong>
                  {g.household ? <div className="tiny muted">{g.household}</div> : null}
                </td>
                <td className="mono">{g.email || '—'}</td>
                <td>
                  {plusOneNames(g).length ? (
                    <div className="plus-one-stack">
                      {plusOneNames(g).map((name, index) => (
                        <div key={`${g.id}-${index}`}>{name}</div>
                      ))}
                    </div>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <StatusPill value={g.saveTheDateStatus} />
                </td>
                <td>
                  {g.saveTheDateAcknowledged ? (
                    <span className="pill pill-submitted">Received</span>
                  ) : (
                    <span className="pill pill-pending">Pending</span>
                  )}
                </td>
                <td className="actions-cell">
                  <div className="row gap end">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        setCreatingDraft(null)
                        setEditingId(g.id)
                      }}
                    >
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
                  </div>
                </td>
                <td className="drag-cell">
                  <button
                    type="button"
                    className="drag-handle"
                    aria-label={`Reorder ${g.firstName} ${g.lastName}`}
                    title="Drag to reorder"
                    onPointerDown={(event) => onHandlePointerDown(event, g.id)}
                    onPointerMove={onHandlePointerMove}
                    onPointerUp={finishReorder}
                    onPointerCancel={finishReorder}
                    onKeyDown={(event) => onHandleKeyDown(event, g.id)}
                  >
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
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

      {dragged && ghost
        ? createPortal(
            <div
              className="drag-ghost"
              style={{
                width: ghost.width,
                transform: `translate(${ghost.x - ghost.offsetX}px, ${ghost.y - ghost.offsetY}px)`,
              }}
            >
              <strong>
                {dragged.firstName} {dragged.lastName}
              </strong>
              <span className="mono">{dragged.email || 'No email'}</span>
            </div>,
            document.body,
          )
        : null}

      {editorGuest ? (
        <GuestEditor
          key={creatingDraft ? 'new' : editorGuest.id}
          guest={editorGuest}
          isNew={Boolean(creatingDraft)}
          onClose={() => {
            setCreatingDraft(null)
            setEditingId(null)
          }}
          onSave={(patch) => {
            if (creatingDraft) {
              addGuest(fieldsForNewGuest({ ...creatingDraft, ...patch }))
              setCreatingDraft(null)
              return
            }
            if (editing) {
              updateGuest(editing.id, patch)
              setEditingId(null)
            }
          }}
        />
      ) : null}
    </section>
  )
}

function newGuestDraft(): Guest {
  const now = new Date().toISOString()
  return {
    id: 'new',
    firstName: 'New',
    lastName: 'Guest',
    email: '',
    plusOnes: [],
    plusOne: false,
    plusOneName: '',
    partySize: 1,
    tags: [],
    rsvpStatus: 'unknown',
    saveTheDateStatus: 'not_sent',
    saveTheDateAcknowledged: false,
    createdAt: now,
    updatedAt: now,
  }
}

function fieldsForNewGuest(guest: Guest): Partial<Guest> {
  const fields: Partial<Guest> = { ...guest }
  delete fields.id
  delete fields.createdAt
  delete fields.updatedAt
  return fields
}

function syncPlusOneDraft(guest: Guest, names: string[]): Guest {
  const filled = names.map((name) => name.trim()).filter(Boolean)
  return {
    ...guest,
    plusOnes: names,
    plusOne: filled.length > 0,
    plusOneName: filled.join(', '),
    partySize: 1 + filled.length,
  }
}

function StatusPill({ value }: { value: string }) {
  return <span className={`pill pill-${value}`}>{value.replaceAll('_', ' ')}</span>
}

function GuestEditor({
  guest,
  isNew = false,
  onClose,
  onSave,
}: {
  guest: Guest
  isNew?: boolean
  onClose: () => void
  onSave: (patch: Partial<Guest>) => void
}) {
  const [draft, setDraft] = useState(guest)
  const set = <K extends keyof Guest>(key: K, value: Guest[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  return createPortal(
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-label={isNew ? 'Add guest' : 'Edit guest'}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>
          {isNew ? 'Add guest' : `Edit ${draft.firstName} ${draft.lastName}`}
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
          <div className="span-2 plus-one-editor">
            <span>Plus 1s</span>
            {(draft.plusOnes ?? []).map((name, index) => (
              <div className="row gap" key={index}>
                <input
                  className="input"
                  placeholder="Choco Marks"
                  value={name}
                  onChange={(e) => {
                    const next = [...(draft.plusOnes ?? [])]
                    next[index] = e.target.value
                    setDraft((d) => syncPlusOneDraft(d, next))
                  }}
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    const next = (draft.plusOnes ?? []).filter((_, i) => i !== index)
                    setDraft((d) => syncPlusOneDraft(d, next))
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn"
              onClick={() =>
                setDraft((d) => syncPlusOneDraft(d, [...(d.plusOnes ?? []), '']))
              }
            >
              Add plus 1
            </button>
          </div>
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
          <label className="check">
            <input
              type="checkbox"
              checked={Boolean(draft.saveTheDateAcknowledged)}
              onChange={(e) => {
                const on = e.target.checked
                setDraft((d) => ({
                  ...d,
                  saveTheDateAcknowledged: on,
                  saveTheDateAcknowledgedAt: on
                    ? d.saveTheDateAcknowledgedAt || new Date().toISOString()
                    : undefined,
                }))
              }}
            />
            Acknowledged received
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
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onSave(withPlusOnes(draft, draft.plusOnes ?? []))}
          >
            Save guest
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
