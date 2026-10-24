-- PROPOSED — NOT APPLIED. AUD-043 (High, confirmed live 2026-10-24). Re-runnable.
-- storage.objects has a permissive policy "expert-cvs-select" (any signed-in user may read ANY object in the
-- private expert-cvs bucket). Permissive policies are OR'ed, so it overrides the owner/admin-only policy and every
-- user can download every expert's CV. "expert-cvs-insert" and "post-videos-insert" also let users write to any path.
-- After this: CV/disease files readable by their owner and admins only; uploads only under <auth.uid()>/...
-- App paths already follow that layout (UserProfile.jsx: `${uid}/<ts>_cv.pdf`, CreatePost.jsx: `${uid}/<ts>.<ext>`),
-- and "Users can upload/update their own files" already covers expert-cvs.

drop policy if exists "expert-cvs-select" on storage.objects;
drop policy if exists "expert-cvs-insert" on storage.objects;
drop policy if exists "post-videos-insert" on storage.objects;
create policy "post-videos-insert" on storage.objects as permissive for insert to authenticated
  with check (bucket_id = 'post-videos' and (auth.uid())::text = path_tokens[1]);
