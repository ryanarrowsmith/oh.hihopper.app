import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { loadFavorites } from '@/lib/favorites'
import FavoriteList, { type Fav } from '@/components/FavoriteList'

export const dynamic = 'force-dynamic'

/**
 * The things you hearted.
 *
 * hopper.my_favorites is already scoped to the person by policy, so there is
 * no person_id here and no way to read anybody else's. What it stores is only
 * a kind and an id; the names are looked up alongside, and anything that comes
 * back nameless has been deleted or put out of this reader's reach since it
 * was hearted. Those are dropped rather than drawn as a broken row -- a
 * favourite is a shortcut, and a shortcut to nowhere is worse than one fewer
 * shortcut.
 *
 * Newest first, and the grouping happens on the client with chips. The order
 * you hearted things in is a better guess at what you want than which kind of
 * thing it was.
 */
export default async function Favorites() {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const items = await loadFavorites()

  return (
    <>
      <div className="hi"><div className="hi__t">
        <h1>Favorites</h1>
        <p className="scopeline"><span>
          {items.length === 0
            ? 'Nothing hearted yet.'
            : `${items.length} thing${items.length === 1 ? '' : 's'} you keep coming back to. Yours alone — nobody else can see this.`}
        </span></p>
      </div></div>

      <FavoriteList items={items} />
    </>
  )
}
