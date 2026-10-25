-- PROPOSED — NOT APPLIED TO PRODUCTION. Post media (2026-10-25 media bug investigation).
-- Depends on: 03 (is_admin). Safe to re-run.
--
--  * "Public buckets are readable by everyone" let anyone, signed in or not, LIST every file in avatars, post-images,
--    product-images, community-images and news-images through the Storage API (verified on staging with the anon
--    key). Files in public buckets are served by their public URL without any policy, so this policy only added
--    enumeration — including uploads whose post was never created or was deleted. It is replaced by owner/admin
--    read access, which upsert uploads (avatars) still need.
--  * post-videos had no owner delete/update policy, so a failed post could not remove its upload and a deleted
--    post's video stayed forever. Owners (first path segment = their user id) and admins can now delete/replace.

drop policy if exists "Public buckets are readable by everyone" on storage.objects;
drop policy if exists "Public bucket files are listable by their owner or an admin" on storage.objects;
create policy "Public bucket files are listable by their owner or an admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = any (array['avatars', 'post-images', 'post-videos', 'product-images', 'community-images', 'news-images'])
    and ((auth.uid())::text = path_tokens[1] or public.is_admin())
  );

drop policy if exists "post-videos-owner-delete" on storage.objects;
create policy "post-videos-owner-delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'post-videos' and ((auth.uid())::text = path_tokens[1] or public.is_admin()));

drop policy if exists "post-videos-owner-update" on storage.objects;
create policy "post-videos-owner-update" on storage.objects
  for update to authenticated
  using (bucket_id = 'post-videos' and ((auth.uid())::text = path_tokens[1] or public.is_admin()));
