# Hopper — oh.hihopper.app

*The home to your loose bits.*

The Hopper application. Public site is `hihopper.app`; this is the app behind it.

## Where the data lives

One Supabase project, **Oh Hi Apps**, shared with `ohhiapps.com` and the Beebee
admin portal. Hopper does **not** get its own database — it gets its own schema
inside that one, and the platform holds everything Hopper must not own.

The platform's contract is executable, not a document:

```sql
select * from beebee.check_app('hopper');   -- must return no errors
```

It enforces six things, and they shaped this schema:

1. Every table carries `account_id` referencing `beebee.accounts`, indexed with
   `account_id` leading.
2. RLS is on, with policies, on every table.
3. No app owns identity, billing or entitlements. `users`, `accounts`,
   `subscriptions`, `invoices`, `plans`, `organizations` are all refused.
4. Identity references `beebee.profiles`, never `auth.users` directly.
5. A `SECURITY DEFINER` function taking arguments in a PostgREST-exposed schema
   is an HTTP endpoint. All of Hopper's helpers live in `internal`, which is not
   exposed; the only definers in `hopper` are zero-argument triggers.
6. The app sets its own `from_email` so its mail is not plain Oh hi.

### Why the org tree is called `entity`

Rule 3 reserves `organizations`, because at the platform level a tenant **is** a
beebee account. Hopper's tree is a different object: the businesses inside one
customer's portfolio, recursive, with a holding company on top. So the table is
`hopper.entity`. Every screen still says "Organizations", because that is what a
customer calls it.

## Access

**Grants are held per person.** There is no live group whose membership changes
what people can do. The way out of the clicking is a template that stamps grants
onto a person — not a group that owns them — so what somebody holds is always
readable in one place.

- An **organization grant covers everything beneath it**. `hopper_entity_visible`
  walks *up* from the entity in question, so a grant on any ancestor covers it
  and a grant on a child never covers its parent.
- A **department grant covers that department alone**, and makes its organization
  visible enough to render — a department whose organization is invisible has no
  name to show under.
- **Places offer View and nothing else.** Editing a place is
  `manage_organizations`, one permission rather than forty.
- All three verbs false **deletes** the row. "No grant" and "a grant of nothing"
  must not be two states that look the same and behave differently.

Enforcement lives in `SECURITY DEFINER` helpers in `internal`, not inline in the
policies. That is not tidiness: a policy on `hopper.entity` that read
`hopper.entity` would re-enter its own policy, and a policy that read
`hopper.access_grant` would get that table's RLS applied on top — which answers
"no" for exactly the people it is being asked about.

### Measured, not asserted

Run as a real `authenticated` non-owner:

| | ungranted member | one leaf granted | the parent granted |
|---|---|---|---|
| organizations | 0 | 1 | 9 |
| departments | 0 | 1 | 5 |
| locations | 0 | 1 | 4 |
| people | 1 (their own row) | 1 | 1 |
| audit entries | 0 | 0 | 0 |

They can always load their own name; everything else is subtractive.

## The audit log

Append-only, hash chained (SHA-256 over a canonical field-separated body, from a
genesis of 64 zeros), tiered retention — system 45 days, structural 7 years,
anything about access indefinitely. A correction is appended and inherits the
window of what it corrects. Aged-out entries are **sealed**: content removed,
hash kept, so the chain still verifies through them.

There is no UPDATE or DELETE policy, and the privilege is revoked as well. A
kind with no tier **raises** rather than defaulting — a kind with no tier is a
kind nobody decided about.

## Modules

Two switches, and only one is Hopper's.

- **Entitlement** — what the account may have — is derived from what they bought,
  read through `internal.hopper_account_modules()`. Never stored in here: two
  places to answer "does this account have Reporting" is two places to be wrong.
- **Selection** — which organizations run it — is `hopper.entity_module`, and is
  Hopper's own. Switching off never deletes; the row keeps the selection.

A module that is off is **absent from the nav**, not greyed out.

## Running it

```bash
cp .env.example .env.local
npm install
npm run dev
```

Every query goes through the user's own session (`lib/supabase/server.ts`), never
the service role. RLS is where access is decided, and a server that reaches
around it is a second, quieter answer to "what may this person see".

## Layout

```
app/(auth)/sign-in     Hopper's own sign-in, its own branding
app/(app)/             the shell: ink top bar, rail, Steel footer, all in one container
app/(app)/admin/       organizations · people · permissions · modules · audit
lib/access.ts          what a permission IS -- one copy, read by both access screens
lib/tenant.ts          which account this is, via beebee.my_apps()
app/globals.css        the design system, lifted from the approved mockup
```

## Notes for whoever is next

- `beebee.grant_app()` returns a composite row. `result IS NOT NULL` is **false**
  when any field is null (`revoked_at` always is) — check the table, not the
  return value.
- Exposing a schema to PostgREST is `alter role authenticator set pgrst.db_schemas`,
  which is the same setting as Settings → API → Exposed schemas. Editing it in the
  dashboard rewrites the line.
- `optimizeFonts` is off so the build does not depend on reaching Google Fonts.
