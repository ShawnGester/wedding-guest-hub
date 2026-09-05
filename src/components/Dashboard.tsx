import { useApp } from '../context/AppContext'

export function Dashboard() {
  const { metrics, data } = useApp()
  const cards = [
    { label: 'Guests', value: metrics.totalGuests, hint: `${metrics.totalParty} headcount` },
    {
      label: 'RSVP form in',
      value: `${metrics.rsvpSubmitted}`,
      hint: `${metrics.rsvpRate}% · ${metrics.rsvpUnknown} open`,
    },
    {
      label: 'Physical invites',
      value: metrics.physicalInvites,
      hint: `${metrics.addressSubmitted} addresses · ${metrics.addressPending} pending`,
    },
    {
      label: 'Save the dates sent',
      value: metrics.saveTheDateSent,
      hint: `${metrics.saveTheDatePending} still to send`,
    },
  ]

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <p className="eyebrow">Overview</p>
          <h2>{data.settings.coupleNames || 'Wedding Guest Hub'}</h2>
          <p className="muted">
            {data.settings.weddingDate
              ? `Wedding date ${data.settings.weddingDate}`
              : 'Set your wedding date in Settings'}
            {data.settings.venue ? ` · ${data.settings.venue}` : ''}
          </p>
        </div>
        <div className="row gap wrap">
          {data.settings.googleFormUrl ? (
            <a
              className="btn"
              href={data.settings.googleFormUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open RSVP form
            </a>
          ) : null}
          {data.settings.addressFormUrl ? (
            <a
              className="btn"
              href={data.settings.addressFormUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open address form
            </a>
          ) : null}
        </div>
      </header>

      <div className="metrics">
        {cards.map((c) => (
          <article key={c.label} className="metric">
            <div className="metric-label">{c.label}</div>
            <div className="metric-value">{c.value}</div>
            <div className="metric-hint">{c.hint}</div>
          </article>
        ))}
      </div>

      <div className="tips">
        <h3>Suggested workflow</h3>
        <ol>
          <li>Add guests (or import a spreadsheet) and mark who gets a physical invite.</li>
          <li>
            Export your guest spreadsheet and import here to sync the list exactly (add /
            update / remove). Google Form CSVs work the same — only people in that file stay
            on the list.
          </li>
          <li>
            Compose save-the-dates with links or light attachments, connect free EmailJS, and
            send from the Email tab.
          </li>
          <li>Download a JSON backup before switching browsers or devices.</li>
        </ol>
      </div>
    </section>
  )
}
