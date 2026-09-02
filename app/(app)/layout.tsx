import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import Rail from '@/components/Rail'
import TopBar from '@/components/TopBar'
import Footer from '@/components/Footer'
import Crumbs from '@/components/Crumbs'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const db = supabaseServer()

  // What this account runs. Entitlement is the platform's answer, derived from
  // what they bought -- never stored a second time in here.
  const { data: mods } = await db.schema('hopper')
    .from('entity_module').select('module_key').eq('enabled', true)
  const modules = Array.from(new Set((mods ?? []).map((m: any) => m.module_key)))

  // RLS answers this, so the switcher can never offer something the database
  // would refuse to open.
  const { data: entities } = await db.schema('hopper')
    .from('entity').select('id, name, parent_id').order('sort_order')

  return (
    <div className="app">
      <TopBar initials={session.initials} entities={entities ?? []} />
      <div className="shell">
        <Rail modules={modules} />
        <main className="main">
          <Crumbs entities={entities ?? []} />
          {children}
        </main>
      </div>
      <Footer />
    </div>
  )
}
