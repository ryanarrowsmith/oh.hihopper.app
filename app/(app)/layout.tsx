import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import Rail from '@/components/Rail'
import TopBar from '@/components/TopBar'
import Footer from '@/components/Footer'
import Crumbs from '@/components/Crumbs'
import { CrumbTailProvider } from '@/components/CrumbTail'

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

  // So a breadcrumb can name an office instead of printing its id.
  const { data: places } = await db.schema('hopper')
    .from('location').select('id, name')

  return (
    <div className="app">
      <TopBar initials={session.initials} entities={entities ?? []}
              personId={session.personId} displayName={session.displayName}
              accountName={session.accountName} />
      <div className="shell">
        <Rail modules={modules} />
        <main className="main">
          {/* The provider has to sit above both, because the trail is drawn
              here and the name is known one level down. */}
          <CrumbTailProvider>
            <Crumbs entities={entities ?? []} places={places ?? []} />
            {children}
          </CrumbTailProvider>
        </main>
      </div>
      <Footer />
    </div>
  )
}
