'use client'

/**
 * The switch, with its word beside it.
 *
 * `.tog` is the 52x28 switch ITSELF -- track, knob and the input over the top
 * of both -- not a row containing one. Wrapping a label in it squashes the
 * words into a 52px column, which is what happened to "and wait on them" and
 * to every field of the Desk settings before this component existed. One
 * component, so the markup is right once rather than right in nine places.
 */
export default function Toggle({
  name, value, label, defaultChecked, checked, onChange, small, disabled,
}: {
  name?: string; value?: string | number; label: string
  defaultChecked?: boolean; checked?: boolean
  onChange?: (on: boolean) => void; small?: boolean; disabled?: boolean
}) {
  const controlled = checked !== undefined
  return (
    <label className="dktog">
      <span className={`tog${small ? ' tog--sm' : ''}`}>
        <input type="checkbox" name={name} value={value} disabled={disabled}
               {...(controlled
                 ? { checked, onChange: (e: any) => onChange?.(e.target.checked) }
                 : { defaultChecked, ...(onChange ? { onChange: (e: any) => onChange(e.target.checked) } : {}) })} />
        <span className="tog__track" /><span className="tog__knob" />
      </span>
      <span className="togsay">{label}</span>
    </label>
  )
}
