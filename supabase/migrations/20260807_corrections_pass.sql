-- Migration: corrections pass
-- Fix 1.3: Prevent duplicate pending expert applications per user
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_application_per_user
  ON public.expert_applications (user_id)
  WHERE status = 'Pending';

-- Fix 2.10a: Add separate title column to posts
ALTER TABLE public.posts 
  ADD COLUMN IF NOT EXISTS title varchar(150);
