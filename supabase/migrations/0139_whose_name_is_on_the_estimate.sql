/* 0139 — WHOSE NAME IS ON THE ESTIMATE.

   A document that leaves the building carries the company's own details, and
   until now nothing in Hopper held them: the footer of the estimate would have
   been three placeholders forever. They go on fence_settings beside the margin
   floor because that is where the module's own settings already live, and the
   admin panel already manages that row.

   Nullable, every one. An estimate with no address is a worse document, not a
   broken one, and the screen says which fields are empty rather than refusing
   to render. */

alter table hopper.fence_settings
  add column if not exists company_name  text,
  add column if not exists company_line1 text,
  add column if not exists company_line2 text,
  add column if not exists company_phone text,
  add column if not exists company_site  text,
  add column if not exists company_license text,
  -- How long an estimate stands before somebody has to look at it again. The
  -- date on the document is worked out from this rather than typed, so it
  -- cannot be one number on the page and another in a salesperson's head.
  add column if not exists estimate_days integer not null default 30;

comment on column hopper.fence_settings.estimate_days is
  'Days an estimate is good for. The "good through" date on the customer document is issued_at + this.';
