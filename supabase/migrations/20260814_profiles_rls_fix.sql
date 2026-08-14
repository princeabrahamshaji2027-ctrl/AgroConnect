-- Migration: Fix profiles RLS policy to allow users (including admins) to read their own row
-- Prevents circular dependency in is_admin() check during profile fetching

-- Helper functions
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'Admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_banned()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND status = 'Banned'
  );
$$;

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles SELECT Policy: Users can read their own profile OR admins can read all profiles
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT
  USING (id = auth.uid() OR public.is_admin());

-- Profiles UPDATE Policy: Users can update their own non-banned profile OR admins can update any profile
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE
  USING ((auth.uid() = id AND NOT public.is_banned()) OR public.is_admin())
  WITH CHECK ((auth.uid() = id AND NOT public.is_banned()) OR public.is_admin());

-- Profiles INSERT Policy: Users can insert their own profile
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id OR public.is_admin());
