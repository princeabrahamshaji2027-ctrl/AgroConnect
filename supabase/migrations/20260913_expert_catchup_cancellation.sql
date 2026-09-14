-- Migration: Add columns for expert catch up, cancellation reason, offered reschedule slots, interactive messages, and expert active status

-- 1. Add cancellation_reason and offered_reschedule_slots to consultation_bookings
ALTER TABLE public.consultation_bookings
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS offered_reschedule_slots jsonb DEFAULT '[]'::jsonb;

-- 2. Add message_type and metadata to messages
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS message_type varchar(50) DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- 3. Add is_active to experts
ALTER TABLE public.experts
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
