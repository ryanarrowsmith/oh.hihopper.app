/* 0143 — A NOTE CAN CARRY A FILE.

   Ryan's call, 14 Sep. A photograph of the corner post, the customer's own
   sketch, the permit that came back — the log is where they belong, because a
   file with no sentence around it is a file nobody can date or explain.

   THE BUCKET IS PRIVATE, and the browser never talks to it. Same shape as
   todo-files: Hopper asks storage with the signed-in person's own session and
   RLS decides, rather than a public bucket handing every quote and contract to
   anybody who can guess a uuid.

   THE PATH CARRIES THE JOB, second segment, and the policies read it back out
   with storage.foldername(). That is what makes "may I see this object" the
   same question as "may I reach this job" — one answer, one function, no
   second copy of the rule in JavaScript. */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fence-files', 'fence-files', false, 15728640, array[
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/heic',
  'application/pdf', 'text/plain', 'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword', 'application/vnd.ms-excel'
])
on conflict (id) do nothing;

alter table hopper.fence_note
  add column if not exists file_path  text,
  add column if not exists file_name  text,
  add column if not exists file_bytes bigint,
  add column if not exists file_mime  text;

comment on column hopper.fence_note.file_path is
  'Object in the fence-files bucket, <account>/<job>/<uuid>.<ext>. Never handed to a browser — /api/fence/file/<note id> fetches it with the reader''s own session.';

drop policy if exists fence_files_add on storage.objects;
create policy fence_files_add on storage.objects for insert to authenticated
  with check (
    bucket_id = 'fence-files'
    and exists (
      select 1 from hopper.fence_job j
      where j.id::text = (storage.foldername(name))[2]
        and internal.hopper_fence_reach(j.account_id, j.id)
    )
  );

drop policy if exists fence_files_read on storage.objects;
create policy fence_files_read on storage.objects for select to authenticated
  using (
    bucket_id = 'fence-files'
    and exists (
      select 1 from hopper.fence_job j
      where j.id::text = (storage.foldername(name))[2]
        and internal.hopper_fence_reach(j.account_id, j.id)
    )
  );

/* Nothing is deleted from here by anybody. The log is a record, and a record
   whose attachments can be pulled out afterwards is a record of nothing —
   fence_handoff and fence_signature make the same argument. */
drop policy if exists fence_files_remove on storage.objects;
create policy fence_files_remove on storage.objects for delete to authenticated
  using (false);
