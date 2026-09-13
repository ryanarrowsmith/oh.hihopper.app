import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import { fenceStance, howToDraw } from '@/lib/fence'
import { SPINE, spineOf, score, easeWord, heldTo, wordsIn, type Part } from '@/lib/sow'
import { FenceMark } from '@/components/FenceMark'
import ActionForm from '@/components/ActionForm'
import GrowText from '@/components/GrowText'
import { saveSow, draftSow, signSow, aiDraftSow } from '@/app/actions/fence'
import { LANG_NAME } from '@/lib/i18n'
import { aiReady, MODEL } from '@/lib/ai'

export const dynamic = 'force-dynamic'

/**
 * The scope of work: one job, written twice, held to one glossary.
 *
 * The two languages sit side by side because that is the comparison somebody
 * making the Spanish true actually does — and stack on a phone, where they read
 * one and then the other.
 *
 * THE HEADINGS DO NOT MOVE. Every scope reads the same way so a crew knows where
 * to look; the project manager writes the text under each. There is no control on
 * this screen that adds or reorders a heading, because there is no version of
 * this document where that is the right thing to do.
 *
 * NOTHING HERE IS AI, and the screen says so rather than letting "generate"
 * imply it. The draft is rendered from the takeoff, the spec and the gate list —
 * which is exactly why it can be trusted with the numbers.
 */
export default async function Sow({ params }: { params: { id: string } }) {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const db = supabaseServer()
  const [{ data: job }, { data: sow }, { data: terms }, stance, { data: seals }] =
    await Promise.all([
      db.schema('hopper').from('fence_job').select('id, ref, name, customer, cls, complete')
        .eq('account_id', session.accountId).eq('id', params.id).maybeSingle(),
      db.schema('hopper').from('fence_sow')
        .select('parts_en, parts_es, written_en, written_es, drafted_at, signed_at, signed_by,'
          + ' drafted_en, drafted_es, draft_model')
        .eq('account_id', session.accountId).eq('job_id', params.id).maybeSingle(),
      db.schema('hopper').from('fence_glossary').select('en, es')
        .eq('account_id', session.accountId).order('en'),
      fenceStance(session.accountId),
      db.schema('hopper').from('fence_seal').select('section')
        .eq('account_id', session.accountId).eq('job_id', params.id),
    ])
  if (!job) notFound()

  const sealed = new Set(((seals ?? []) as any[]).map((s) => s.section))
  const stand = howToDraw('sow', stance.jobRole, sealed as Set<any>)
  const mayEdit = stand === 'edit' && !(job as any).complete

  const en = spineOf(((sow as any)?.parts_en ?? []) as Part[])
  const es = spineOf(((sow as any)?.parts_es ?? []) as Part[])
  const glossary = ((terms ?? []) as any[]).map((t) => ({ en: t.en, es: t.es }))

  const sEn = score(en.map((p) => p.text).join(' '), 'en')
  const sEs = score(es.map((p) => p.text).join(' '), 'es')
  const held = heldTo(en, es, glossary)
  const used = held.filter((h) => h.used)
  const broken = used.filter((h) => !h.paired)

  const writtenEn = (sow as any)?.written_en as string | null
  const writtenEs = (sow as any)?.written_es as string | null
  // The one thing nobody notices on their own: the English moved and the Spanish
  // did not, so the crew is reading the older of the two.
  const stale = !!(writtenEn && writtenEs && new Date(writtenEn) > new Date(writtenEs)
    && wordsIn(es) > 0)
  const signed = (sow as any)?.signed_at as string | null

  const ai = aiReady()

  const Draft = ({ lang, has, by }: {
    lang: 'en' | 'es'; has: boolean; by: 'facts' | 'claude'
  }) => (
    <form action={async (f: FormData) => {
      'use server'
      await (by === 'claude' ? aiDraftSow(null, f) : draftSow(null, f))
    }}>
      <input type="hidden" name="job_id" value={(job as any).id} />
      <input type="hidden" name="lang" value={lang} />
      <button className={by === 'claude' ? 'btn btn--amber' : 'btn'} type="submit">
        {by === 'claude'
          ? `Write the ${LANG_NAME[lang]} with Claude`
          : has ? `Render the ${LANG_NAME[lang]} again` : `Render the ${LANG_NAME[lang]}`}
      </button>
    </form>
  )

  return (
    <>
      <div className="hi"><div className="hi__t">
        <h1>Scope of work</h1>
        <p className="scopeline"><span>
          <Link href={`/fence/${(job as any).id}`}>{(job as any).ref}</Link>
          {(job as any).name ? ` — ${(job as any).name}` : ''} · drafted from the job, written by
          the project manager, signed before a crew builds from it.
        </span></p>
      </div></div>

      {stand === 'sealed' && (
        <p className="note" style={{ marginTop: 16 }}>
          <b>This scope is sealed.</b> It is readable and it cannot be changed — a revision
          supersedes it and leaves the original standing.
        </p>
      )}
      {stand === 'read' && !sealed.has('sow') && (
        <p className="note" style={{ marginTop: 16 }}>
          The scope belongs to the project manager. You can read every word and add a note to the
          job; the text is theirs to change.
        </p>
      )}

      {!(sow as any)?.drafted_at && mayEdit && (
        <p className="note" style={{ marginTop: 16 }}>
          <b>Nothing drafted yet.</b> Two things can write the first version.{' '}
          <b>Render</b> turns the takeoff, the specification and the gate list into sentences and
          cannot invent a figure.{' '}
          {ai
            ? <><b>Write with Claude</b> ({MODEL}) does the same job in better prose — the facts
              go to the model as data, no prices among them, and any figure that comes back which
              is in none of them throws the whole draft away rather than saving it with a warning
              nobody reads.</>
            : <>Writing it with a model is switched off here, because this deployment has no
              Anthropic key.</>}
          {' '}Either way, every word is then yours.
        </p>
      )}

      {/* Who wrote this matters to somebody deciding how hard to read it before
          they sign it. The row records it per language; the screen says it. */}
      {((sow as any)?.drafted_en || (sow as any)?.drafted_es) && (
        <p className="swby">
          <FenceMark kind="read">
            {[(sow as any).drafted_en && `English ${(sow as any).drafted_en === 'claude'
              ? `drafted by ${(sow as any).draft_model ?? 'a model'}` : 'rendered from the takeoff'}`,
              (sow as any).drafted_es && `Spanish ${(sow as any).drafted_es === 'claude'
                ? `drafted by ${(sow as any).draft_model ?? 'a model'}` : 'rendered from the takeoff'}`,
            ].filter(Boolean).join(' · ')}
          </FenceMark>
          <small>Then edited by hand, if anybody has. A draft is a starting point, not an answer.</small>
        </p>
      )}

      {/* ONE SHEET, NOT TWO COLUMNS. The job here is a comparison — this part
          against that part — so the two languages share a row and a Save. Two
          independent columns drift out of line the moment one side runs longer,
          which is exactly when somebody is checking them against each other. */}
      <div className="swsheet">
        <header className="swsheet__h">
          <div className="swsheet__t">
            <h2>The words</h2>
            <p>{sEn.words} words · {sEs.words} palabras. The headings are fixed so every scope
              reads the same way and a crew knows where to look.</p>
          </div>
          {mayEdit && (
            <div className="swdrafts">
              {ai && <Draft lang="en" has={wordsIn(en) > 0} by="claude" />}
              {ai && <Draft lang="es" has={wordsIn(es) > 0} by="claude" />}
              <Draft lang="en" has={wordsIn(en) > 0} by="facts" />
              <Draft lang="es" has={wordsIn(es) > 0} by="facts" />
            </div>
          )}
        </header>

        {mayEdit ? (
          <ActionForm action={saveSow} label="Save the scope" className="swform">
            <input type="hidden" name="job_id" value={(job as any).id} />
            <div className="swrow swrow--head" aria-hidden="true">
              <span />
              <span>{LANG_NAME.en}</span>
              <span>{LANG_NAME.es}</span>
            </div>
            {SPINE.map((sp, i) => (
              <div className="swrow" key={sp.key}>
                <div className="swrow__k">
                  <b>{sp.en}</b>
                  <FenceMark kind="sealed" title="This heading is the same on every scope">
                    Fixed
                  </FenceMark>
                  <i>{sp.es}</i>
                  <small>{sp.hint}</small>
                </div>
                <div className="swcell">
                  <span className="swcell__l">{LANG_NAME.en}</span>
                  <GrowText className="field swtext" name={`part_en_${sp.key}`} rows={4}
                            aria-label={`${sp.en}, in English`}
                            defaultValue={en[i]?.text ?? ''} />
                </div>
                <div className="swcell">
                  <span className="swcell__l">{LANG_NAME.es}</span>
                  <GrowText className="field swtext" name={`part_es_${sp.key}`} rows={4}
                            aria-label={`${sp.es}, en español`}
                            defaultValue={es[i]?.text ?? ''} />
                </div>
              </div>
            ))}
          </ActionForm>
        ) : (
          <div className="swform">
            {SPINE.map((sp, i) => (
              <div className="swrow" key={sp.key}>
                <div className="swrow__k"><b>{sp.en}</b><i>{sp.es}</i></div>
                <div className="swcell">
                  <span className="swcell__l">{LANG_NAME.en}</span>
                  <p>{en[i]?.text || <span className="fjnone">nothing written</span>}</p>
                </div>
                <div className="swcell">
                  <span className="swcell__l">{LANG_NAME.es}</span>
                  <p>{es[i]?.text || <span className="fjnone">nothing written</span>}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* The check. Cause above effect again: what is wrong with the pair sits
          above the button that says a crew may build from it. */}
      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2>The translation check</h2>
          <p>What can be counted, counted — and then a person decides. A score is not an
            approval.</p>
        </div></div>

        <div className="swchecks">
          <div><b>{sEn.words} → {sEs.words}</b><span>words</span>
            <small>Spanish runs longer. A big gap either way is usually a missing paragraph.</small></div>
          <div><b>{sEn.sentences} → {sEs.sentences}</b><span>sentences</span>
            <small>These should match. They are the same facts.</small></div>
          <div><b>{sEn.ease} · {sEs.ease}</b><span>reads as</span>
            <small>{easeWord(sEn.ease, 'en')} · {easeWord(sEs.ease, 'es')}. Flesch and
              Fernández Huerta — the same shape, fitted to each language.</small></div>
          <div className={broken.length ? 'is-bad' : undefined}>
            <b>{used.length - broken.length} of {used.length}</b><span>glossary terms held</span>
            <small>{broken.length
              ? `${broken.length} used in English with no agreed Spanish in the text.`
              : 'Every agreed term used in the English has its partner in the Spanish.'}</small></div>
        </div>

        {stale && (
          <p className="note note--err">
            <b>The English changed after the Spanish was written.</b> The crew reads the Spanish,
            so right now they would be building from the older of the two. Draft or write the
            Spanish again before this goes out.
          </p>
        )}

        {glossary.length > 0 && (
          <>
            <h3 className="fxsub">Terms</h3>
            <div className="rlist rlist--cols"
                 style={{ ['--cols' as any]: 'minmax(0,1fr) minmax(0,1fr) 150px' }}>
              <div className="rhead"><span>English</span><span>Español</span><span>In this scope</span></div>
              {held.map((h) => (
                <div className="rrec" key={h.en}><div className="rrec__face">
                  <span className="rcell rcell--lead">{h.en}</span>
                  <span className="rcell">
                    <span className="rcell__lab">Español</span>
                    <span className="rcell__val">{h.es}</span>
                  </span>
                  <span className="rcell">
                    <span className="rcell__lab">In this scope</span>
                    <span className="rcell__val">
                      {!h.used ? <FenceMark kind="idle" title="In the glossary, not in this scope" />
                        : h.paired ? <FenceMark kind="done" title="Used, and paired in the Spanish" />
                        : <FenceMark kind="warn">English only</FenceMark>}
                    </span>
                  </span>
                </div></div>
              ))}
            </div>
            <p className="fxakey">
              <FenceMark kind="done">Used here, and paired</FenceMark>
              <FenceMark kind="warn">In the English, not in the Spanish</FenceMark>
              <FenceMark kind="idle">In the glossary, not in this scope</FenceMark>
            </p>
          </>
        )}
      </section>

      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2>Signing</h2>
          <p>A score is not an approval. Somebody who reads both languages signs to say a crew may
            build from these words — and editing them afterwards takes the signature off, because
            it was for the words that were there.</p>
        </div></div>

        {signed ? (
          <p className="swsigned">
            <FenceMark kind="done">Signed {signed.slice(0, 10)}</FenceMark>
            <small>The crew ticket can carry it.</small>
          </p>
        ) : mayEdit ? (
          <ActionForm action={signSow} label="Sign it" busy="Signing…" className="formgrid swsign">
            <input type="hidden" name="job_id" value={(job as any).id} />
            <p className="swhint">
              Both languages have to be written first. Signing records who and when; nothing here
              can check that the signer reads Spanish, and pretending to would be worse than
              saying so.
            </p>
          </ActionForm>
        ) : (
          <p className="swsigned">
            <FenceMark kind="warn">Not signed</FenceMark>
            <small>A crew can still open the ticket, and it says the scope is a draft.</small>
          </p>
        )}
      </section>
    </>
  )
}
