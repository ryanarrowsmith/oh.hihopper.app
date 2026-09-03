'use client'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Choice from '@/components/Choice'
import GooglePick, { type Picked } from '@/components/GooglePick'
import Fold from '@/components/Fold'
import Chart, {
  Legend, CHART_KINDS, KIND_NAME, KIND_ICON, KIND_SAY, measureCap, isSplit, splitWhy,
  type Series, type ChartKind,
} from '@/components/Chart'
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
  /** The tabs the sheet actually has. Null until asked; empty means asked and
   *  the workbook would not say. */
  const [tabs, setTabs] = useState<string[] | null>(null)
  const [tabbing, setTabbing] = useState(false)
  const [points, setPoints] = useState('')
  const [together, setTogether] = useState(false)
  /** Set when the sheet was PICKED rather than pasted: a private sheet, read
   *  through the account's Google connection. */
  const [file, setFile] = useState<Picked | null>(null)

  const [cols, setCols] = useState<Col[] | null>(null)
  const [sample, setSample] = useState<(string | number | null)[][]>([])
  const [rowCount, setRowCount] = useState(0)
  // Whether the look stopped early. A big sheet is looked at, not swallowed.
  const [capped, setCapped] = useState(false)
  const [looking, setLooking] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const [chartType, setChartType] = useState<ChartKind>('line')
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
    const cut = Number(points)
    const keep = Number.isFinite(cut) && cut >= 2 ? Math.round(cut) : null
    return measures.map((m) => {
      const mi = cols.findIndex((c) => c.label === m)
      return {
        measure: m,
        points: (() => {
          const all = sample
            .map((r) => ({ on: String(r[di] ?? ''), v: Number(r[mi]) }))
            .filter((p) => /^\d{4}-\d{2}-\d{2}/.test(p.on) && Number.isFinite(p.v))
          // The preview obeys the window too. A preview that ignored it would
          // be showing a chart the saved report is not going to draw, which is
          // the one thing a preview must never do.
          return keep ? all.slice(-keep) : all
        })(),
      }
    }).filter((s) => s.points.length > 0)
  }, [cols, dateCol, measures, sample, points])
  const myDepts = useMemo(() => depts.filter((d) => d.entity_id === org), [depts, org])
  const myCats = useMemo(() => cats.filter((c) => c.department_id === dept), [cats, dept])

  async function peek() {
    // Reading and listing go together: pressing Read it is the moment somebody
    // has committed to this workbook, and the next question is which tab. If
    // the debounce has not fired yet, this is what makes sure the answer is
    // waiting when they press Next.
    if (kind === 'google_sheet' && tabs === null && !tabbing) findTabs()
    setLooking(true); setFailure(null)
    try {
      const res = await fetch('/api/report/peek', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, tab, kind, file_id: file?.id ?? null }),
      })
      const out = await res.json()
      if (out.ok) {
        setCols(out.columns); setSample(out.rows ?? []); setRowCount(out.row_count ?? 0)
        setCapped(out.capped === true)
        // Hopper's guess at the two that matter, from what is actually in the
        // columns rather than from what their headings hope. It is a guess and
        // the person can move it -- but a form that opens already right is a
        // form most people never have to touch.
        const d = out.columns.find((c: Col) => c.type === 'date')
        const m = out.columns.find((c: Col) => c.type === 'number')
        if (d) setDateCol(d.label)
        if (m) setMeasures([m.label])
        // Deliberately does not move the step. Reading a sheet used to carry you
        // straight to what came back -- past the tab picker, which is on this
        // step -- so if you had read the wrong tab you had to go back to
        // discover it, and if you had never asked for the tab list at all you
        // had silently read whichever tab the workbook opens on. Reading and
        // moving on are two decisions; the second is Next.
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
    f.set('chart_points', points)
    if (file) f.set('google_file_id', file.id)
    f.set('chart_type', chartType); f.set('date_column', dateCol); f.set('chart_x', dateCol)
    if (together) f.set('chart_together', 'on')
    if (restricted) f.set('restricted', 'on')
    for (const m of measures) f.append('measure', m)
    const out = await createReport(null, f)
    setSaving(false)
    setSaid(out.message)
    if (out.ok) router.push('/reporting')
  }

  const canLeave1 = snapshot || (url.trim().length > 0 && cols !== null)
  /**
   * Ask the sheet what is in it.
   *
   * The old form asked a PERSON to type the tab name, case-sensitive, and said
   * so in its own hint -- which is a form asking somebody to be a database, and
   * a wrong answer that only shows up after the save. The workbook already
   * knows; this asks it.
   */
  /**
   * The tab list, asked for without being asked for.
   *
   * It used to sit behind a button, which meant the commonest path through this
   * form -- paste, press Read it -- never touched it, and quietly reported on
   * whichever tab the workbook happens to open on. Choosing the tab is not an
   * advanced option; for a workbook with more than one it is the whole
   * question. So a Google address fetches its own tabs a beat after it stops
   * changing, and the button stays for asking again.
   */
  useEffect(() => {
    if (kind !== 'google_sheet' || tabs !== null || tabbing) return
    if (!/\/spreadsheets\/d\/[A-Za-z0-9-_]{20,}/.test(url)) return
    const t = setTimeout(() => { findTabs() }, 700)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, kind, tabs, tabbing])

  async function findTabs() {
    if (!url.trim() && !file) return
    setTabbing(true); setFailure(null)
    try {
      const r = await fetch('/api/report/tabs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, file_id: file?.id ?? null }),
      }).then((x) => x.json())
      if (r.ok) setTabs(r.tabs)
      else { setTabs([]); setFailure(r.failure ?? 'Hopper could not read the tab list.') }
    } catch { setTabs([]); setFailure('Hopper could not reach the reader.') }
    finally { setTabbing(false) }
  }

  const canLeave3 = snapshot || (dateCol !== '' && measures.length > 0)
  const canSave = name.trim() && org && dept && cat && note.trim()

  const STEPS = ['Source', 'Which tab', 'What came back', 'The chart', 'Where it hangs']

  /**
   * Whether the tab step is a question at all.
   *
   * A link has no tabs to enumerate and a snapshot is already the data. A
   * workbook with exactly ONE tab asks nothing either -- reading it IS reading
   * that tab -- and that is the only case that gets stepped over rather than
   * shown empty with a Next on it. A workbook that would not give up its list
   * still gets the step, because typing the name by hand is the fallback and it
   * has to live somewhere.
   */
  const needTab = kind === 'google_sheet' && (tabs === null || tabs.length !== 1)
  const afterSource = needTab ? 2 : 3

  return (
    <>
      <div className="steps" role="tablist">
        {STEPS.map((label, i) => {
          const n = i + 1
          // The tab step is only on the road when there is a tab to choose.
          const reachable = n === 1
            || (n === 2 && needTab && cols)
            || (n === 3 && cols)
            || (n >= 4 && (cols || snapshot))
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
            <div className="formrow formrow--one" style={{ marginTop: 18 }}>
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

                {/* The other door, for a sheet that must NOT be shared with
                    anyone holding the link. Picking is what grants the access,
                    not a convenience over typing an address: with the drive.file
                    scope Hopper may only open files handed to it through
                    Google's own window, so there is no way to reach a private
                    sheet by naming one. */}
                {kind === 'google_sheet' && (
                  <div className="orpick">
                    <span className="orpick__l">or, if it cannot be shared</span>
                    {file ? (
                      <p className="picked">
                        <b>{file.name}</b>
                        <span>Private, read through this account&rsquo;s Google connection.</span>
                        <button className="lnk" type="button"
                                onClick={() => { setFile(null); setCols(null); setTabs(null); setTab('') }}>
                          Pick a different one
                        </button>
                      </p>
                    ) : (
                      <GooglePick onPick={(f) => {
                        setFile(f); setCols(null); setTabs(null); setTab('')
                        setUrl(`https://docs.google.com/spreadsheets/d/${f.id}/edit`)
                      }} />
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {failure && <p className="note note--err" style={{ marginTop: 14 }}>{failure}</p>}
          {snapshot && <p className="note note--err" style={{ marginTop: 14 }}>
            Uploads and pasted data are not built yet — point Hopper at a sheet or a link for now.</p>}

          {/* The amber follows the next thing to do. Before a read, that is
              Read it; after one, reading again is a thing you MAY do and going
              on is the thing you are here for -- two amber buttons side by side
              is a fork, and this is not one. */}
          <div className="formgrid__go" style={{ marginTop: 18 }}>
            <button className={`btn${cols ? '' : ' btn--amber'}`} type="button"
                    disabled={looking || !url.trim() || snapshot}
                    onClick={peek}>{looking ? 'Looking…' : cols ? 'Read it again' : 'Read it'}</button>
            {cols && (
              <button className="btn btn--amber" type="button" disabled={tabbing}
                      onClick={() => setStep(afterSource)}>
                {tabbing ? 'Reading the tabs…' : 'Next'}
              </button>
            )}
            {cols && (
              <span className="readsaid">
                <b>{cols.length}</b> columns, <b>{rowCount.toLocaleString()}{capped && '+'}</b> rows
                {tabbing && <> · looking for tabs…</>}
              </span>
            )}
          </div>
        </>
      )}

      {/* ── Which tab ──
          Its own step, and only when there is a question. It used to sit beside
          the address on the first step, where it read as a second thing to fill
          in before pressing Read it -- and being told off for not answering a
          question you had not been asked yet is the worst kind of form. Now the
          order is the order: paste the address, read it, and THEN choose from
          the tabs that came back. */}
      {step === 2 && (
        <>
          <p className="srchead">Which tab</p>
          {tabbing ? (
            <p className="empty">Asking the workbook what is in it…</p>
          ) : (tabs?.length ?? 0) === 0 ? (
            <>
              <p className="empty" style={{ marginBottom: 12 }}>
                That workbook would not give up its tab list, so this one is by hand.
                Names are case-sensitive.
              </p>
              <div className="formrow formrow--one">
                <div>
                  <label htmlFor="ar-tab">Tab</label>
                  <input className="field" id="ar-tab" value={tab}
                         onChange={(e) => { setTab(e.target.value); setCols(null) }}
                         placeholder="The one the link points at" />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="tabs" role="group" aria-label="Which tab">
                {tabs!.map((t) => (
                  <button key={t} type="button" className="tabpick" aria-pressed={tab === t}
                          onClick={() => { setTab(t); setCols(null) }}>
                    {t}
                  </button>
                ))}
              </div>
              <p className="hint">
                {tabs!.length} tabs in that workbook. One report reads one tab; add another
                report for another tab.
              </p>
            </>
          )}

          {failure && <p className="note note--err" style={{ marginTop: 14 }}>{failure}</p>}

          <div className="formgrid__go" style={{ marginTop: 18 }}>
            <button className="btn" type="button" onClick={() => setStep(1)}>Back</button>
            {/* Choosing a tab clears what came back, because what came back was
                a different tab. Reading again is the only honest way forward. */}
            {tab && cols && (
              <button className="btn" type="button" disabled={looking} onClick={peek}>
                {looking ? 'Reading…' : 'Read it again'}
              </button>
            )}
            <button className="btn btn--amber" type="button"
                    disabled={!tab || looking}
                    onClick={() => { cols ? setStep(3) : peek() }}>
              {looking ? 'Reading…' : cols ? 'Next' : 'Read this tab'}
            </button>
            {tab && (
              <span className="readsaid">
                {cols
                  ? <><b>{cols.length}</b> columns, <b>{rowCount.toLocaleString()}{capped && '+'}</b> rows from <b>{tab}</b></>
                  : <>Reading <b>{tab}</b> is the next thing.</>}
              </span>
            )}
          </div>
        </>
      )}

      {step === 3 && cols && (
        <>
          <div className="came">
            <div className="came__h">
              <b>{cols.length}</b> columns, <b>{rowCount.toLocaleString()}{capped && '+'}</b> rows
              {/* A look at a big sheet is the first few hundred rows, so that
                  the columns can be picked without dragging the whole file
                  across. Once a date column is chosen, every real read asks
                  Google for the most recent rows instead. */}
              {capped && <em className="came__cut">the first {rowCount.toLocaleString()}, so you can pick your columns</em>}
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
            <button className="btn" type="button"
                    onClick={() => setStep(needTab ? 2 : 1)}>Back</button>
            <button className="btn btn--amber" type="button" onClick={() => setStep(4)}>This is right</button>
          </div>
        </>
      )}

      {step === 4 && (
        <>
          {/* The preview leads the screen AND stays on it. Leading was the
              right idea and not enough of it: the controls under it are taller
              than a screen, so every adjustment still scrolled the answer out
              of sight. */}
          <div className="came came--stick" style={{ marginBottom: 18 }}>
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
                ? <>
                    {/* Splitting was the right call and looked like a fault:
                        three plots appear where one was asked for and nothing
                        says why. */}
                    {!together && splitWhy(preview, chartType) &&
                      <p className="splitwhy">{splitWhy(preview, chartType)}</p>}
                    <Chart type={chartType} series={preview} height={220} together={together} />
                    {(together || !isSplit(preview, chartType)) && <Legend series={preview} />}
                  </>
                : <p className="empty" style={{ margin: 0 }}>
                    Nothing to draw yet — a chart needs something along the bottom
                    and something to measure.
                  </p>}
            </div>
          </div>

          {/* Grouped by the question each type answers rather than by shape.
              Nobody arrives wanting "a stacked column"; they arrive wanting to
              know what a total is made of. Choosing a type also trims the
              measures to what that type can draw, so the form cannot hold an
              answer the chart would refuse. */}
          {/* Grouped by the question each type answers rather than by shape.
              Nobody arrives wanting "a stacked column"; they arrive wanting to
              know what a total is made of. Choosing a type also trims the
              measures to what that type can draw, so the form cannot hold an
              answer the chart would refuse. */}
          <Fold title="How it draws" note={KIND_NAME[chartType] ?? 'Choose a mark'}>
            {/* Above the marks, not under them. It is the sentence explaining
                the thing you are about to choose, so it belongs in front of the
                choosing rather than as a footnote to it -- and it says the name
                by being lit next to the tile that is lit, so it does not need
                to say the name again. */}
            <p className="kinds__say">{KIND_SAY[chartType]}</p>

            <div className="kinds">
              {CHART_KINDS.map((g) => (
                <Fragment key={g.group}>
                  <span className="kinds__g">{g.group}</span>
                  <div className="kinds__r">
                    {g.kinds.map((c) => (
                      <button key={c.k} className="kind" type="button"
                              aria-pressed={chartType === c.k}
                              onClick={() => {
                                setChartType(c.k)
                                setMeasures((m) => m.slice(0, measureCap(c.k)))
                              }}>
                        <svg viewBox="0 0 24 24" aria-hidden="true"
                             dangerouslySetInnerHTML={{ __html: KIND_ICON[c.k] }} />
                        {c.t}
                      </button>
                    ))}
                  </div>
                </Fragment>
              ))}
            </div>

            {/* Only a question when there is something to answer. */}
            {splitWhy(preview, chartType) && (
              <div className="togline" style={{ marginTop: 14 }}>
                <span className="tog">
                  <input id="ar-together" type="checkbox" checked={together}
                         aria-label="Keep them on one plot"
                         onChange={(e) => setTogether(e.target.checked)} />
                  <span className="tog__track" /><span className="tog__knob" />
                </span>
                <span className="togstate">{together ? 'On' : 'Off'}</span>
                <span className="togsay">{together
                  ? 'One plot, one scale. The smaller measures will be close to flat — that is the trade you have made.'
                  : 'Keep them on one plot anyway. Turn this on when you are comparing shapes rather than sizes.'}</span>
              </div>
            )}

            <div className="inline1" style={{ marginTop: 16 }}>
              <label htmlFor="ar-pts">How many readings to draw</label>
              <input className="field" id="ar-pts" type="number" min={2} max={500}
                     value={points} onChange={(e) => setPoints(e.target.value)}
                     placeholder="All of them" />
              <p className="hint">
                The most recent this many. Empty draws every reading the date range holds,
                which is what a chart does until somebody says otherwise.
              </p>
            </div>
          </Fold>

          <Fold title="What it draws"
                note={measures.length
                  ? `${dateCol || 'no date column'} · ${measures.join(', ')}`
                  : 'Choose a date column and what to measure'}>
          <div className="formrow formrow--lean">
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
                  const cap = measureCap(chartType)
                  const full = !on && measures.length >= cap
                  return (
                    <button key={c.key} type="button" className={`chip${on ? ' chip--on' : ''}`}
                      disabled={full}
                      title={full ? (chartType === 'pie'
                        ? 'A pie shows one measure.'
                        : chartType === 'scatter' ? 'A scatter is exactly two measures.'
                        : chartType === 'combo' ? 'Columns and a line is two measures.'
                        : chartType === 'col' || chartType === 'barh' ? 'This type draws one measure.'
                        : cap === 6 ? 'Six is the cap for a stacked chart — its segments only ever touch their neighbours.'
                        : 'Ten is the cap.') : undefined}
                      onClick={() => setMeasures(on
                        ? measures.filter((m) => m !== c.label)
                        : [...measures, c.label])}>{c.label}</button>
                  )
                })}
              </div>
              <p className="hint">
                {(() => {
                  const cap = measureCap(chartType)
                  return cap === 1 ? 'This one draws a single measure.'
                    : `Up to ${cap}. ${measures.length} chosen.`
                })()}
                {measures.length > 3 &&
                  ' Past three, each gets a plot of its own — a heading rather than a colour says which is which.'}
              </p>
            </div>
          </div>
          </Fold>

          {(cols ?? []).every((c) => c.type !== 'date') &&
            <p className="note note--err" style={{ marginTop: 14 }}>
              Nothing in this tab reads as a date, so Hopper cannot keep a series for it. The rows
              will still be stored and shown.</p>}

          <div className="formgrid__go" style={{ marginTop: 18 }}>
            <button className="btn" type="button" onClick={() => setStep(3)}>Back</button>
            <button className="btn btn--amber" type="button" onClick={() => setStep(5)}>Next</button>
          </div>
        </>
      )}

      {step === 5 && (
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
            <button className="btn" type="button" onClick={() => setStep(4)}>Back</button>
            <button className="btn btn--amber" type="button" disabled={saving || !canSave} onClick={save}>
              {saving ? 'Saving…' : 'Register it'}
            </button>
          </div>
        </>
      )}
    </>
  )
}
