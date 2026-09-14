'use client'
import Choice from '@/components/Choice'

/**
 * A row of tabs, said as a dropdown on a phone.
 *
 * Ryan's rule, 14 Sep: always prefer a dropdown on mobile unless it is ugly.
 * This is the "prefer" half. The "unless it is ugly" half is a judgment made at
 * each call site, and the line that has held so far:
 *
 *   · THREE OR MORE TABS, where they cannot all fit across a phone, become
 *     this. Wrapping them onto a second row spends vertical space on
 *     navigation, and scrolling them sideways hides tabs nobody then finds.
 *
 *   · TWO TABS STAY A ROW. Table/Chart, Reply/Note, What's on it/Who sees it —
 *     those are switches, not menus, and both halves of a switch have to be
 *     visible or the second one is a feature nobody discovers. Putting one
 *     behind a tap is the exact failure the wrap rule was written against.
 *
 *   · A STEPPER OR A CAROUSEL IS NOT A TAB SET, whatever role it carries. The
 *     numbers on a stepper are the point of it.
 *
 * It is used BESIDE the tab row rather than instead of it: both render, and
 * `.tabrow` / `.tabdrop` in the stylesheet pick at 640. `display:none` takes
 * the hidden one out of the tab order and the accessibility tree, so there is
 * never a second copy to tab into — which is why this is CSS and not a
 * useMediaQuery, on top of the usual reason (the server renders neither width).
 *
 * Hopper's own popover, never a native select: the standing rule, because a
 * native select draws its menu with the operating system and no stylesheet
 * reaches inside it.
 */
export default function TabDrop<T extends string>({ value, options, onPick, name = 'tab' }: {
  value: T
  options: { value: T; label: string }[]
  onPick: (v: T) => void
  /** Only reaches a hidden input nothing reads; distinct per page anyway, so
   *  two pickers on one screen cannot collide. */
  name?: string
}) {
  return (
    <div className="tabdrop">
      {/* Keyed on the value so the picker cannot drift out of step with the row
          if a window is dragged across the breakpoint: Choice holds its own
          state from defaultValue and does not watch the prop. */}
      <Choice key={value} name={name} defaultValue={value} filterFrom={99}
              options={options} onPick={(v) => onPick(v as T)} />
    </div>
  )
}
