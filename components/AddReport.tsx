'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Choice from '@/components/Choice'
import Chart, { Legend, type Series } from '@/components/Chart'
import { createReport } from '@/app/actions/reports'

type Org = { id: string; name: string }
type Dept = { id: string; name: string; entity_id: string }
type Cat = { id: string; name: string; department_id: string }
type Col = { key: string; label: string; type: 'text' | 'number' | 'date' }

const SOURCES = [
  { k: 'google_sheet', t: 'Google Sheets', s: 'A link-shared sheet. No key needed.', live: true },
  { k: 'link', t: 'A link', s: 'Any https address that answers with CSV or JSON.', live: true },
  { k: 'upload', t: 'Upload a file', s: 'A .csv or .tsv, kept as it is.', live: false },
  { k: 'paste', t: 'Paste the data', s: 'For a one-off number nobody else holds.', live: false },
]

/**
 * Four steps, not one long form.
 *
 * The form asks four different kinds of question — where do the numbers live,
 * is this the right data, what should the chart say, and where does this hang —
 * and mixing them means each one gets answered badly. The second step is the
 * one that earns its place: a wrong tab, or a header row that is really data,
 * gets caught there instead of after the save.
 */
export default function AddReport({ orgs, depts, cats }: { orgs: Org[]; depts: Dept[]; cats: Cat[] }) {
  const router = useRouter()
  const [step, setStep] = useState(1)

  const [kind, setKind] = useState('google_sheet')
  const [url, setUrl] = useState('')
  const [tab, setTab] = useState('')

  const [cols, setCols] = useState<Col[] | null>(null)
  const [sample, setSample] = useState<(string | number | null)[][]>([])
  const [rowCount, setRowCount] = useState(0)
  const [looking, setLooking] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const [chartType, setChartType] = useState<'line' | 'bar' | 'pie'>('line')
  const [dateCol, setDateCol] = useState('')
  const [measures, setMeasures] = useState<string[]>([])

  const [org, setOrg] = useState(orgs[0]?.id ?? '')
  const [dept, setDept] = useState('')
  const [cat, setCat] = useState('')
  const [name, setName] = useState('')
  const [refresh, setRefresh] = useState('daily')
  const [restricted, setRestricted] = useState(false)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [said, setSaid] = useState<string | null>(null)

  const snapshot = kind === 'upload' || kind === 'paste'

  /**
   * What this chart will actually look like, drawn from the rows that came back
   * — not a stock picture of a bar chart.
   *
   * It goes through the same chart kit the card and the report page use, so
   * what you approve here is what gets drawn later. A preview rendered by
   * something else is a preview that can be wrong in a way nobody finds until
   * the report is live.
   */
  const preview = useMemo<Series[]>(() => {
    if (!cols || !dateCol || measures.length === 0) return []
    const di = cols.findIndex((c) => c.label === dateCol)
    if (di < 0) return []
    return measures.map((m) => {
      const mi = cols.findIndex((c) => c.label === m)
      return {
        measure: m,
        points: sample
          .map((r) => ({ on: String(r[di] ?? ''), v: Number(r[mi]) }))
          .filter((p) => /^\d{4}-\d{2}-\d{2}/.test(p.on) && Number.isFinite(p.v)),
      }
    }).filter((s) => s.points.length > 0)
  }, [cols, dateCol, measures, sample])
  const myDepts = useMemo(() => depts.filter((d) => d.entity_id === org), [depts, org])
  const myCats = useMemo(() => cats.filter((c) => c.department_id === dept), [cats, dept])

  async function peek() {
    setLooking(true); setFailure(null)
    try {
      const res = await fetch('/api/report/peek', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, tab, kind }),
      })
      const out = await res.json()
      if (out.ok) {
        setCols(out.columns); setSample(out.rows ?? []); setRowCount(out.row_count ?? 0)
        // Hopper's guess at the two that matter, from what is actually in the
        // columns rather than from what their headings hope. It is a guess and
        // the person can move it -- but a form that opens already right is a
        // form most people never have to touch.
        const d = out.columns.find((c: Col) => c.type === 'date')
        const m = out.columns.find((c: Col) => c.type === 'number')
        if (d) setDateCol(d.label)
        if (m) setMeasures([m.label])
        setStep(2)
      } else {
        setCols(null); setFailure(out.failure ?? 'Hopper could not read that.')
      }
    } catch {
      setFailure('Hopper could not reach the reader.')
    } finally { setLooking(false) }
  }

  async function save() {
    setSaving(true); setSaid(null)
    const f = new FormData()
    f.set('name', name); f.set('entity_id', org); f.set('department_id', dept)
    f.set('category_id', cat); f.set('source_kind', kind); f.set('source_url', url)
    f.set('source_tab', tab); f.set('refresh', refresh); f.set('note', note)
    f.set('chart_type', chartType); f.set('date_column', dateCol); f.set('chart_x', dateCol)
    if (restricted) f.set('restricted', 'on')
    for (const m of measures) f.append('measure', m)
    const out = await createReport(null, f)
    setSaving(false)
    setSaid(out.message)
    if (out.ok) router.push('/reporting')
  }

  const canLeave1 = snapshot || (url.trim().length > 0 && cols !== null)
  const canLeave3 = snapshot || (dateCol !== '' && measures.length > 0)
  const canSave = name.trim() && org && dept && cat && note.trim()

  const STEPS = ['Source', 'What came back', 'The chart', 'Where it hangs']

  return (
    <>
      <div className="steps" role="tablist">
        {STEPS.map((label, i) => {
          const n = i + 1
          const reachable = n === 1 || (n === 2 && cols) || (n >= 3 && (cols || snapshot))
          return (
            <button key={label} className="step" type="button" disabled={!reachable}
              aria-current={step === n ? 'step' : undefined}
              data-done={step > n ? '1' : undefined}
              onClick={() => reachable && setStep(n)}>
              <span className="step__n">{n}</span><span>{label}</span>
            </button>
          )
        })}
      </div>

      {step === 1 && (
        <>
          <p className="srchead">Reads again tomorrow</p>
          <div className="srcs">
            {SOURCES.filter((s) => s.live).map((s) => (
              <button key={s.k} className="src" type="button" aria-pressed={kind === s.k}
                      onClick={() => { setKind(s.k); setCols(null) }}>
                <span className="src__t">{s.t}</span>
                <span className="src__s">{s.s}</span>
                <span className="src__f src__f--live">Live</span>
              </button>
            ))}
          </div>
          <p className="srchead">A snapshot, kept as it is</p>
          <div className="srcs">
            {SOURCES.filter((s) => !s.live).map((s) => (
              <button key={s.k} className="src" type="button" aria-pressed={kind === s.k}
                      onClick={() => { setKind(s.k); setCols(null) }}>
                <span className="src__t">{s.t}</span>
                <span className="src__s">{s.s}</span>
                <span className="src__f src__f--snap">Snapshot</span>
              </button>
            ))}
          </div>

          {!snapshot && (
            <div className="formrow" style={{ marginTop: 18 }}>
              <div>
                <label htmlFor="ar-url">Where does the data live?</label>
                <input className="field" id="ar-url" value={url} onChange={(e) => { setUrl(e.target.value); setCols(null) }}
                       placeholder={kind === 'link'
                         ? 'https://example.com/exports/weekly.csv'
                         : 'https://docs.google.com/spreadsheets/d/…'} />
                <p className="hint">
                  {kind === 'link'
                    ? 'It has to answer without a sign-in — Hopper reads it as nobody in particular, and does not hold anybody’s key.'
                    : 'Share → General access → Anyone with the link → Viewer. No key needed.'}
                </p>
              </div>
              {/* Two fields, two meanings. A sheet has tabs; a JSON body has a
                  key holding the list. Same box, because it is the same
                  question -- which part of what is there? */}
              <div>
                <label htmlFor="ar-tab">{kind === 'link' ? 'Which list' : 'Tab'}</label>
                <input className="field" id="ar-tab" value={tab} onChange={(e) => { setTab(e.target.value); setCols(null) }}
                       placeholder={kind === 'link' ? 'Leave empty for a CSV' : 'The one the link points at'} />
                <p className="hint">
                  {kind === 'link'
                    ? 'Only for JSON, and only when the rows sit under a name Hopper cannot guess. CSV ignores it.'
                    : 'Tab names are case-sensitive. Leave it empty for the tab in the link.'}
                </p>
              </div>
            </div>
          )}

          {failure && <p className="note note--err" style={{ marginTop: 14 }}>{failure}</p>}
          {snapshot && <p className="note note--err" style={{ marginTop: 14 }}>
            Uploads and pasted data are not built yet — point Hopper at a sheet or a link for now.</p>}

          <div className="formgrid__go" style={{ marginTop: 18 }}>
            <button className="btn btn--amber" type="button" disabled={looking || !url.trim() || snapshot}
                    onClick={peek}>{looking ? 'Looking…' : 'Read it'}</button>
            {cols && <button className="btn" type="button" onClick={() => setStep(2)}>Next</button>}
          </div>
        </>
      )}

      {step === 2 && cols && (
        <>
          <div className="came">
            <div className="came__h">
              <b>{cols.length}</b> columns, <b>{rowCount.toLocaleString()}</b> rows
              <span className="ok">Read</span>
            </div>
            <div className="cols">
              {cols.map((c) => (
                <div className="col" key={c.key}>
                  <span className={`col__k${c.type === 'number' ? ' col__k--num' : c.type === 'date' ? ' col__k--date' : ''}`}>
                    {c.type === 'number' ? '12' : c.type === 'date' ? '31' : 'Aa'}
                  </span>
                  <span className="col__n">{c.label}</span>
                  <span className="col__e">
                    {sample.map((r) => r[cols.indexOf(c)]).filter((v) => v != null).slice(0, 3).join(' · ') || '—'}
                  </span>
                </div>
              ))}
            </div>
            <p className="came__note">
              Each column is typed from what is actually in it, not from what its heading hopes.
              If a column is the wrong type here, it is the sheet that needs fixing, not Hopper.
            </p>
          </div>
          <div className="formgrid__go" style={{ marginTop: 18 }}>
            <button className="btn" type="button" onClick={() => setStep(1)}>Back</button>
            <button className="btn btn--amber" type="button" onClick={() => setStep(3)}>This is right</button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          {/* The preview leads the screen. It used to sit under the controls,
              which put the thing you are deciding about below the thing you are
              deciding with — every adjustment meant scrolling away from the
              answer. */}
          <div className="came" style={{ marginBottom: 18 }}>
            <div className="came__h">
              <b>Live preview</b>
              <span style={{ color: 'var(--ink-3)' }}>
                {preview.length
                  ? `the first ${preview[0].points.length} row${preview[0].points.length === 1 ? '' : 's'} of your sheet`
                  : 'choose a date column and a measure'}
              </span>
            </div>
            <div style={{ padding: 14 }}>
              {preview.length
                ? <><Chart type={chartType} series={preview} height={220} />
                    <Legend series={preview} /></>
                : <p className="empty" style={{ margin: 0 }}>
                    Nothing to draw yet — a chart needs something along the bottom
                    and something to measure.
                  </p>}
            </div>
          </div>

          <div className="srcs">
            {([['line', 'A line', 'What it has been doing over time.'],
               ['bar', 'Bars', 'How periods compare with each other.'],
               ['pie', 'A pie', 'How one total splits up. One measure only.']] as const).map(([k, t, s]) => (
              <button key={k} className="src" type="button" aria-pressed={chartType === k}
                      onClick={() => { setChartType(k); if (k === 'pie') setMeasures((m) => m.slice(0, 1)) }}>
                <span className="src__t">{t}</span><span className="src__s">{s}</span>
              </button>
            ))}
          </div>

          <div className="formrow" style={{ marginTop: 18 }}>
            <div>
              <label htmlFor="ar-date">What dates the rows</label>
              <Choice id="ar-date" name="date_column" defaultValue={dateCol} placeholder="Choose a column"
                      options={(cols ?? []).filter((c) => c.type === 'date')
                        .map((c) => ({ value: c.label, label: c.label }))} />
              <p className="hint">The date range filters on this. A source with no dates says so
                rather than pretending to be filtered.</p>
            </div>
            <div>
              <label>What is measured</label>
              <div className="chips">
                {(cols ?? []).filter((c) => c.type === 'number').map((c) => {
                  const on = measures.includes(c.label)
                  const full = !on && measures.length >= (chartType === 'pie' ? 1 : 3)
                  return (
                    <button key={c.key} type="button" className={`chip${on ? ' chip--on' : ''}`}
                      disabled={full}
                      title={full ? (chartType === 'pie'
                        ? 'A pie shows one measure.'
                        : 'Three is the cap — only the first three colors separate at a glance.') : undefined}
                      onClick={() => setMeasures(on
                        ? measures.filter((m) => m !== c.label)
                        : [...measures, c.label])}>{c.label}</button>
                  )
                })}
              </div>
              <p className="hint">{chartType === 'pie' ? 'One measure.' : 'Up to three.'}</p>
            </div>
          </div>

          {(cols ?? []).every((c) => c.type !== 'date') &&
            <p className="note note--err" style={{ marginTop: 14 }}>
              Nothing in this tab reads as a date, so Hopper cannot keep a series for it. The rows
              will still be stored and shown.</p>}

          <div className="formgrid__go" style={{ marginTop: 18 }}>
            <button className="btn" type="button" onClick={() => setStep(2)}>Back</button>
            <button className="btn btn--amber" type="button" onClick={() => setStep(4)}>Next</button>
          </div>
        </>
      )}

      {step === 4 && (
        <>
          <div className="formrow">
            <div><label htmlFor="ar-org">Organization</label>
              <Choice id="ar-org" name="entity_id" defaultValue={org} required
                      onPick={(v) => { setOrg(v); setDept(''); setCat('') }}
                      options={orgs.map((o) => ({ value: o.id, label: o.name }))} /></div>
            <div><label htmlFor="ar-dept">Department</label>
              <Choice id="ar-dept" name="department_id" key={org} defaultValue={dept} required
                      onPick={(v) => { setDept(v); setCat('') }}
                      placeholder={myDepts.length ? 'Choose one' : 'That organization has none yet'}
                      options={myDepts.map((d) => ({ value: d.id, label: d.name }))} /></div>
          </div>
          <div className="formrow" style={{ marginTop: 12 }}>
            <div><label htmlFor="ar-cat">Category</label>
              <Choice id="ar-cat" name="category_id" key={dept} defaultValue={cat} required
                      onPick={setCat}
                      placeholder={dept ? (myCats.length ? 'Choose one' : 'That department has none yet') : 'Choose a department first'}
                      options={myCats.map((c) => ({ value: c.id, label: c.name }))} /></div>
            <div><label htmlFor="ar-name">Report name</label>
              <input className="field" id="ar-name" value={name} onChange={(e) => setName(e.target.value)}
                     placeholder="Truck hours billed" /></div>
          </div>

          <div className="formrow" style={{ marginTop: 12 }}>
            <div><label htmlFor="ar-ref">How often Hopper goes back</label>
              <Choice id="ar-ref" name="refresh" defaultValue={refresh} onPick={setRefresh}
                      options={[
                        { value: 'hourly', label: 'Hourly', hint: 'Looks every 30 minutes' },
                        { value: 'twice_daily', label: 'Twice a day', hint: 'Looks hourly' },
                        { value: 'daily', label: 'Daily', hint: 'Looks every 4 hours' },
                        { value: 'weekly', label: 'Weekly', hint: 'Looks once a day at 3 AM' },
                      ]} /></div>
            <div>
              <label htmlFor="ar-restricted">Restricted</label>
              <div className="togline">
                <span className="tog">
                  <input id="ar-restricted" type="checkbox" checked={restricted}
                         aria-label="Restricted"
                         onChange={(e) => setRestricted(e.target.checked)} />
                  <span className="tog__track" /><span className="tog__knob" />
                </span>
                <span className="togstate">{restricted ? 'On' : 'Off'}</span>
                <span className="togsay">{restricted
                  ? 'Absent for anyone not granted it by name. No role template can stamp it.'
                  : 'Anyone who can open the organization can see it.'}</span>
              </div>
            </div>
          </div>

          <div className="formrow formrow--one" style={{ marginTop: 12 }}>
            <div><label htmlFor="ar-note">What is this report for?</label>
              <textarea className="field" id="ar-note" rows={3} value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Why it exists and what it is meant to show." />
              <p className="hint">Required. A report that quietly changed shape is worse than no
                report at all, and now is the only moment anybody knows why.</p></div>
          </div>

          {said && <p className="note note--err" style={{ marginTop: 14 }}>{said}</p>}

          <div className="formgrid__go" style={{ marginTop: 18 }}>
            <button className="btn" type="button" onClick={() => setStep(3)}>Back</button>
            <button className="btn btn--amber" type="button" disabled={saving || !canSave} onClick={save}>
              {saving ? 'Saving…' : 'Register it'}
            </button>
          </div>
        </>
      )}
    </>
  )
}
