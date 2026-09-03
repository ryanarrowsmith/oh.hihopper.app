import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import Rail from '@/components/Rail'
import TopBar from '@/components/TopBar'
import Footer from '@/components/Footer'
import Notifications, { type Note } from '@/components/Notifications'
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

  // What names this person and has not been dealt with. RLS scopes it, so
  // there is no person_id here and no way to read anybody else's.
  const { data: notes } = await db.schema('hopper').from('notification')
    .select('id, kind, title, body, href, at, read_at, shown_at')
    .order('at', { ascending: false }).limit(30)

  // So a breadcrumb can name an office instead of printing its id.
  const { data: places } = await db.schema('hopper')
    .from('location').select('id, name')

  return (
    <div className="app">
      {/* Before anything paints, so a folded rail does not flash open on every
          page load. One line, no dependency, and a browser that refuses
          storage just gets the rail unfolded. */}
      <script dangerouslySetInnerHTML={{ __html:
        "try{if(localStorage.getItem('hopper.rail')==='min')document.documentElement.dataset.rail='min'}catch(e){}" }} />
      <TopBar initials={session.initials} entities={entities ?? []}
              personId={session.personId} displayName={session.displayName}
              accountName={session.accountName} email={session.email}
              notes={(notes ?? []) as Note[]} />
      {/* Above the shell, so a box survives navigating between pages -- and so
          one subscription feeds both the boxes and the bell. */}
      <Notifications personId={session.personId} initial={(notes ?? []) as Note[]} />
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
      <Footer modules={modules} />
    </div>
  )
}
