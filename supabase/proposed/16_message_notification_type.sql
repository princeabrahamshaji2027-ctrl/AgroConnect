-- PROPOSED — NOT APPLIED TO PRODUCTION. New notification type for chat messages (2026-10-26).
-- Alone on purpose: a new enum value cannot be used in the same transaction that adds it; 17 uses it.
-- Safe to re-run. Rollback: not needed (an unused enum value is harmless; Postgres cannot drop enum values).
alter type public.notification_type add value if not exists 'message';
