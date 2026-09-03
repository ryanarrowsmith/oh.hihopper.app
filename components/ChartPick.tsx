'use client'
import { useState, useTransition } from 'react'
import Choice from '@/components/Choice'
import { CHART_KINDS, KIND_ICON, appliesTo, measureCap } from '@/lib/charts'
import { setChartType } from '@/app/actions/reports'

/**
 * Change the mark, while looking at it.
 *
 * Choosing a chart type is a thing you do WITH the chart in front of you -- the
 * question is "does this read better as columns", and it is answered by seeing
 * it rather than by opening a form, changing a field and coming back to look.
 * So it lives in the section header, next to the thing it changes.
 *
 * Only the kinds that can say something with these measures are offered. A
 * scatter given one measure has nothing to plot it against and a stack given
 * one has nothing to stack; an offered choice that draws an empty box is worse
 * than a choice that is absent.
 *
 * The change is optimistic. The server is the truth and a refusal puts the
 * old mark back, but a chart that redraws when you pick and a spinner that
 * redraws it a second later are two different feelings, and only one of them
 * feels like a control.
 */
export default function ChartPick({ id, current, measures, onDraft }: {
  id: string
  current: string
  /** How many measures this report actually carries. */
  measures: number
  /** Called with the kind so the chart beside this redraws immediately. */
  onDraft: (kind: string) => void
}) {
  const [kind, setKind] = useState(current)
  const [said, setSaid] = useState<string | null>(null)
  const [, start] = useTransition()

  const options = CHART_KINDS.flatMap((g) =>
    g.kinds
      .filter((k) => appliesTo(k.k, measures))
      .map((k) => ({
        value: k.k as string,
        label: k.t as string,
        // What it will actually draw, when that is fewer than there are. A
        // person choosing Pie with five measures deserves to know that four of
        // them are about to go quiet.
        hint: measureCap(k.k) < measures
          ? `${k.s} Draws ${measureCap(k.k)} of your ${measures}.`
          : (k.s as string),
        icon: KIND_ICON[k.k],
        group: g.group as string,
      })))

  return (
    <div className="chartpick">
      <Choice
        name="chart_type" options={options} defaultValue={kind}
        placeholder="How to draw it" filterFrom={99}
        onPick={(next) => {
          if (next === kind) return
          const was = kind
          setKind(next); onDraft(next); setSaid(null)
          start(async () => {
            const out = await setChartType(id, next)
            if (!out.ok) { setKind(was); onDraft(was); setSaid(out.message) }
          })
        }}
      />
      {said && <p className="swhy">{said}</p>}
    </div>
  )
}
