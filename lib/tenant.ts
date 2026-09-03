import { cache } from 'react'
import { supabaseServer } from '@/lib/supabase/server'

export type Session = {
  userId: string
  accountId: string
  accountName: string
  role: string
  personId: string | null
  email: string | null
  displayName: string
  initials: string
  modules: string[]
}

/**
 * Which account is this person in, and what does it run?
 *
 * beebee.my_apps() is the platform's own answer -- it already joins app access
 * to membership and account status, so this app never re-implements the
 * question of who may open it.
 */
export const currentSession = cache(async (): Promise<Session | null> => {
  const db = supabaseServer()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return null

  const { data: apps } = await db.schema('beebee').rpc('my_apps')
  const mine = (apps ?? []).find((a: any) => a.app_id === 'hopper')
  if (!mine) return null

  const { data: person } = await db.schema('hopper')
    .from('person').select('id, full_name')
    .eq('profile_id', user.id).maybeSingle()

  const { data: profile } = await db.schema('beebee')
    .from('profiles').select('full_name, email').eq('id', user.id).maybeSingle()

  const name = person?.full_name || profile?.full_name || profile?.email || 'You'

  return {
    userId: user.id,
    accountId: mine.account_id,
    accountName: mine.account_name,
    role: mine.role,
    personId: person?.id ?? null,
    email: profile?.email ?? user.email ?? null,
    displayName: name,
    initials: initialsOf(name),
    modules: [],
  }
})

function initialsOf(name: string) {
  const parts = name.replace(/@.*$/, '').split(/[\s._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'YOU'
}
