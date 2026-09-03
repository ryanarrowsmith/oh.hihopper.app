/**
 * Beebee support client.
 *
 * Copy this file into an Oh hi app. It has no dependencies beyond the Supabase
 * client the app already has, and it exists so that opening a support request
 * costs the app one call with three fields — everything else that makes a
 * request solvable is collected here, the same way, every time.
 *
 * The platform refuses anything that would let an app lie about who is asking:
 * identity comes from the token, and status and priority are staff decisions.
 * So none of those appear below.
 */

type Rpc = {
  schema: (name: string) => {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
  }
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        file: File | Blob,
        opts?: { contentType?: string; upsert?: boolean },
      ) => Promise<{ error: { message: string } | null }>
    }
  }
}

export type RequestKind = 'question' | 'bug' | 'billing' | 'access' | 'feedback'
export type Urgency = 'whenever' | 'soon' | 'blocking'

export type SupportRequest = {
  id: string
  ref: string
  status: string
  subject: string
  opened_at: string
}

export type OpenArgs = {
  subject: string
  body: string
  kind?: RequestKind
  /** What it costs THEM. Priority is ours to decide and is not sent. */
  urgency?: Urgency
  /** The record they were looking at — this is what links the request to its history. */
  subjectType?: string
  subjectId?: string
  /** An error they saw, if any. Only the useful fields are sent. */
  error?: unknown
  /** Anything app-specific. Keep it small and keep secrets out of it. */
  details?: Record<string, unknown>
  /**
   * Hold one of these per form instance (newSubmitToken()). A double-tapped
   * button then opens one request instead of two.
   */
  idempotencyKey?: string
  /** Overrides the account this request belongs to, if the app has several in play. */
  accountId?: string
  /**
   * Screenshots. A picture of the broken thing saves a round trip, and by the
   * time "can you send me a screenshot" is answered the page has usually moved
   * on. 10MB each, images / PDF / text.
   */
  files?: File[]
}

export type SupportClient = {
  open: (args: OpenArgs) => Promise<{ request?: SupportRequest; error?: string }>
  /** Shorthand for an error boundary: opens a bug with the error attached. */
  capture: (
    error: unknown,
    args?: Partial<Omit<OpenArgs, 'error' | 'kind'>>,
  ) => Promise<{ request?: SupportRequest; error?: string }>
  newSubmitToken: () => string
}

const STACK_LIMIT = 4000

/** Only the fields worth keeping. An Error is not JSON and a whole one is noise. */
function shapeError(e: unknown) {
  if (e == null) return null
  if (typeof e === 'string') return { message: e }
  const x = e as Record<string, unknown>
  const out: Record<string, unknown> = {
    message: String(x.message ?? x.error_description ?? x.error ?? e),
  }
  if (x.name) out.name = String(x.name)
  if (x.code) out.code = String(x.code)
  if (x.digest) out.digest = String(x.digest)          // Next.js server error id
  if (x.status) out.status = String(x.status)
  if (typeof x.stack === 'string') out.stack = x.stack.slice(0, STACK_LIMIT)
  return out
}

function client() {
  if (typeof window === 'undefined') return {}
  const n = window.navigator
  return {
    ua: n.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    locale: n.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    online: n.onLine,
  }
}

/**
 * The path only, never the query string. A support request is read by staff
 * later, and query strings are where tokens, emails and filters end up.
 */
function route() {
  if (typeof window === 'undefined') return null
  return window.location.pathname
}

export function createSupport(opts: {
  supabase: Rpc
  /** The registry id: 'hopper', 'junk_drawer'. */
  app: string
  /** The account this session is working in. A function, if it can change. */
  account: string | (() => string | null | undefined)
  /** Build or commit, so "works for me" can be checked against a version. */
  release?: string
}): SupportClient {
  const accountOf = () =>
    typeof opts.account === 'function' ? opts.account() : opts.account

  async function open(args: OpenArgs) {
    const account = args.accountId ?? accountOf()
    if (!account) return { error: 'No account in context to open the request against.' }

    const { data, error } = await opts.supabase.schema('beebee').rpc('open_request', {
      p_app: opts.app,
      p_account: account,
      p_subject: args.subject,
      p_body: args.body,
      p_kind: args.kind ?? 'question',
      p_urgency: args.urgency ?? 'soon',
      p_route: route(),
      p_subject_type: args.subjectType ?? null,
      p_subject_id: args.subjectId ?? null,
      p_release: opts.release ?? null,
      p_client: client(),
      p_error: shapeError(args.error),
      p_details: args.details ?? {},
      p_idempotency_key: args.idempotencyKey ?? null,
    })

    if (error) return { error: error.message }
    const request = data as SupportRequest

    // Files go up after the request exists, because storage access is checked
    // against the request id in the path. A failed upload never loses the
    // request — the words matter more than the picture.
    if (args.files?.length) {
      for (const file of args.files) {
        const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase().slice(0, 8)
        const path = `${request.id}/${crypto.randomUUID()}.${ext}`
        const { error: upErr } = await opts.supabase.storage
          .from('request-files')
          .upload(path, file, { contentType: file.type || 'application/octet-stream' })
        if (upErr) continue

        await opts.supabase.schema('beebee').rpc('attach_to_request', {
          p_request: request.id,
          p_path: path,
          p_name: file.name,
          p_mime: file.type || 'application/octet-stream',
          p_bytes: file.size,
          p_message: null,
        })
      }
    }

    return { request }
  }

  return {
    open,
    capture: (error, args = {}) => {
      const { subject, body, ...rest } = args
      return open({
        kind: 'bug',
        urgency: 'blocking',
        ...rest,
        subject: subject ?? 'Something broke',
        body: body ?? 'Reported automatically from an error the app showed.',
        error,
      })
    },
    newSubmitToken: () =>
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  }
}
