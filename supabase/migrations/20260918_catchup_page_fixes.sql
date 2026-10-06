-- Migration: 20260918_catchup_page_fixes.sql
-- Additive columns for consultation bookings tracking and expert no-show counter

ALTER TABLE public.consultation_bookings
  ADD COLUMN IF NOT EXISTS expert_joined_at timestamptz,
  ADD COLUMN IF NOT EXISTS notified_24h boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS notified_dayof boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS notified_30min boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS notified_expert_10min boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS refund_status text DEFAULT 'None',
  ADD COLUMN IF NOT EXISTS refund_amount numeric DEFAULT 0;

ALTER TABLE public.experts
  ADD COLUMN IF NOT EXISTS no_show_count integer DEFAULT 0;
