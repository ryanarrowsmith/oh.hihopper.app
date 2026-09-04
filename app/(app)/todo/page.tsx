import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import { loadTodo } from '@/lib/todo'
import TodoRoot from '@/components/TodoRoot'

export const dynamic = 'force-dynamic'

/**
 * The root IS the to-do list.
 *
 * Not an index of lists: a person opening To Do wants to see what is on them,
 * and a table of list names with progress bars is a second click before the
 * first useful word. The lists are the headings; the tasks are the page.
 */
export default async function Page() {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const db = supabaseServer()
  const [rows, { data: ents }, { data: people }] = await Promise.all([
    loadTodo(),
    // RLS answers this, so the picker can never offer an organization the
    // insert would then refuse.
    db.schema('hopper').from('entity').select('id, name').order('sort_order'),
    db.schema('hopper').from('directory').select('id, full_name').eq('active', true),
  ])

  return (
    <TodoRoot rows={rows} orgs={(ents ?? []) as any} people={(people ?? []) as any}
              mePersonId={session.personId} />
  )
}
