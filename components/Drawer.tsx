'use client'
import { createContext } from 'react'

/**
 * A drawer tells whatever form is inside it how to close.
 *
 * The form is the only thing that knows whether the save worked, and the drawer
 * is the only thing that can shut -- so one passes the handle to the other.
 *
 * It lives in its own file because BOTH form shapes need it and neither should
 * have to import the other: RowForm was born inside a drawer, and ActionForm
 * finds itself in one often enough that it has to ask.
 *
 * Null, not a no-op close, because "am I in a drawer" is a real question with a
 * real answer -- a form standing on its own page has nothing to shut and must
 * say what happened some other way.
 */
export const Drawer = createContext<{ close: () => void } | null>(null)
