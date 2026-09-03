'use client'
import { createSupport } from '@/lib/beebee-support'
import { supabaseBrowser } from '@/lib/supabase/client'

/**
 * Hopper's one support client.
 *
 * The helper itself is beebee's, copied in verbatim as docs/support-requests.md
 * asks -- it is the reason every Oh hi app sends the same shape of request, and
 * a local improvement to it is a local divergence. Everything Hopper decides is
 * here instead: which app id, which account, and which build.
 *
 * It runs in the browser because that is where the context lives. Route,
 * viewport, user agent, locale and time zone are all things only the page
 * knows, and a request without them is one staff have to write back about.
 * Identity is not among them: it comes from the token, and an app that can name
 * the reporter can open a request as anybody.
 */
export const support = (accountId: string) =>
  createSupport({
    supabase: supabaseBrowser() as any,
    app: 'hopper',
    account: accountId,
    // Vercel sets the commit for every deployment; nothing to configure and it
    // is the only string that answers "which build were they on" exactly.
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 8),
  })
