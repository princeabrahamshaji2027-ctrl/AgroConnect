-- Migration: Add RPC for admin consultation booking management
-- Allows admins to update booking status (Cancel, Mark Completed) and manage slot availability

CREATE OR REPLACE FUNCTION public.admin_update_booking_status(
  p_booking_id uuid,
  p_new_status varchar,
  p_cancellation_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_slot_id uuid;
  v_current_status varchar;
BEGIN
  -- Verify caller is Admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required.' USING ERRCODE = '42501';
  END IF;

  -- Get current booking details
  SELECT status, slot_id INTO v_current_status, v_slot_id
  FROM public.consultation_bookings
  WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found with ID %', p_booking_id USING ERRCODE = 'P0002';
  END IF;

  -- Update booking record
  UPDATE public.consultation_bookings
  SET 
    status = p_new_status,
    cancellation_reason = CASE 
      WHEN p_cancellation_reason IS NOT NULL THEN p_cancellation_reason 
      ELSE cancellation_reason 
    END,
    updated_at = now()
  WHERE id = p_booking_id;

  -- If status changed to Cancelled, unbook the corresponding slot
  IF p_new_status = 'Cancelled' AND v_slot_id IS NOT NULL THEN
    UPDATE public.consultation_slots
    SET is_booked = false
    WHERE id = v_slot_id;
  END IF;

  -- Audit log entry
  INSERT INTO public.admin_audit_log (
    admin_id,
    action,
    target_table,
    target_id,
    details
  ) VALUES (
    auth.uid(),
    'update_booking_status',
    'consultation_bookings',
    p_booking_id,
    jsonb_build_object(
      'previous_status', v_current_status,
      'new_status', p_new_status,
      'cancellation_reason', p_cancellation_reason
    )
  );

  RETURN true;
END;
$$;
