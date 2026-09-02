import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

export async function POST(req: Request) {
  await supabaseServer().auth.signOut()
  return NextResponse.redirect(new URL('/sign-in', req.url), { status: 303 })
}
