import { CEILING, PROMPT_AT, quarterLabel } from '@/lib/staffing'

type Q = { period: string; score: number | null }

/**
 * Eight quarters, drawn to one scale.
 *
 * The scale is 0 to 12 because 12 is the ceiling, not because 12 happens to be
 * the tallest bar -- a chart that rescales itself to the best quarter makes
 * every year look the same. The rule across it is seven, which is the number
 * that means have the conversation, so a bar under the line is the chart
 * saying the thing the words say.
 *
 * A quarter with no settled score is drawn as an empty slot rather than
 * skipped: the gap in somebody's record is information.
 */
export default function StaffQuarters({ quarters }: { quarters: Q[] }) {
  const W = 560, H = 190, PAD_L = 30, PAD_R = 10, PAD_T = 18, PAD_B = 40
  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B
  const step = plotW / Math.max(quarters.length, 1)
  const barW = Math.min(38, step * 0.52)
  const y = (v: number) => PAD_T + plotH - (v / CEILING) * plotH

  return (
    <div className="stchartw">
      <svg className="stchart" viewBox={`0 0 ${W} ${H}`} role="img"
           aria-label={`Settled score by quarter, out of ${CEILING}`}>
        {[0, 4, 8, 12].map((v) => (
          <g key={v}>
            <line className="stchart__grid" x1={PAD_L} x2={W - PAD_R} y1={y(v)} y2={y(v)} />
            <text className="stchart__ax" x={PAD_L - 8} y={y(v) + 4} textAnchor="end">{v}</text>
          </g>
        ))}

        <line className="stchart__prompt" x1={PAD_L} x2={W - PAD_R}
              y1={y(PROMPT_AT)} y2={y(PROMPT_AT)} />

        {quarters.map((q, i) => {
          const cx = PAD_L + step * i + step / 2
          const low = q.score !== null && q.score <= PROMPT_AT
          const h = q.score === null ? 0 : Math.max((q.score / CEILING) * plotH, 2)
          return (
            <g key={q.period}>
              {q.score === null ? (
                <rect className="stchart__none" x={cx - barW / 2} y={y(CEILING)}
                      width={barW} height={plotH} rx="0" />
              ) : (
                <>
                  <rect className={`stchart__bar${low ? ' is-low' : ''}`}
                        x={cx - barW / 2} y={PAD_T + plotH - h} width={barW} height={h} />
                  <text className="stchart__val" x={cx} y={y(q.score) - 6} textAnchor="middle">
                    {q.score}
                  </text>
                </>
              )}
              <text className="stchart__ax" x={cx} y={H - PAD_B + 18} textAnchor="middle">
                {quarterLabel(q.period).replace(' 20', " ’")}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="stchart__key">
        The rule is {PROMPT_AT}. Seven or under is not a verdict; it is the prompt
        to have the conversation.
      </p>
    </div>
  )
}
