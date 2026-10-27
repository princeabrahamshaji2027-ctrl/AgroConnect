-- PROPOSED — 2026-10-27. Server-side file rules for uploads, matching the client validators
-- (src/utils/validation.js validateImageFile / validatePdfFile): resumes PDF only, images JPG/PNG/WEBP only.
-- Sizes: CV 5 MB (UserProfile.jsx), avatar 5 MB (EditProfile.jsx, admin TopNav.jsx), post image 10 MB (CreatePost.jsx),
-- broadcast/news/product/community images 5 MB. post-videos already has its limits (50 MB, mp4/mov/webm/quicktime).
-- Existing files are not touched; only new uploads are checked. Safe to re-run. Rollback: "undo 22" in 99_rollback.sql.
update storage.buckets set allowed_mime_types = array['application/pdf'], file_size_limit = 5242880
 where id = 'expert-cvs';
update storage.buckets set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'], file_size_limit = 5242880
 where id in ('avatars', 'product-images', 'community-images', 'news-images', 'disease-images');
update storage.buckets set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'], file_size_limit = 10485760
 where id = 'post-images';
