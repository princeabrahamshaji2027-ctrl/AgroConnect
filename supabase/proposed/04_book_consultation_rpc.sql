-- PROPOSED — NOT APPLIED. AUD-014 (High).
-- Connect.jsx handleConfirmBooking does three separate client calls: insert booking, then mark the slot
-- booked, then insert a video_meetings row. Two farmers can book the same slot between those calls, and a
-- failure half-way leaves a booking whose slot still shows as free. Rules.md §3.4 requires one RPC.
-- After approval, Connect.jsx should call: supabase.rpc('book_consultation_slot', { p_slot_id, p_issue }).

create or replace function public.book_consultation_slot(p_slot_id uuid, p_issue text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot public.consultation_slots%rowtype;
  v_farmer_id uuid;
  v_booking_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if coalesce(length(trim(p_issue)), 0) = 0 then
    raise exception 'issue description is required' using errcode = '22023';
  end if;

  -- Row lock serialises concurrent bookings of the same slot.
  select * into v_slot from public.consultation_slots where id = p_slot_id for update;
  if not found then
    raise exception 'slot not found' using errcode = 'P0002';
  end if;
  if v_slot.is_booked then
    raise exception 'slot already booked' using errcode = '23505';
  end if;
  if (v_slot.slot_date + v_slot.start_time) < now() at time zone 'Asia/Kolkata' then
    raise exception 'slot is in the past' using errcode = '22023';
  end if;

  select id into v_farmer_id from public.farmer_profiles where user_id = auth.uid();
  if v_farmer_id is null then
    insert into public.farmer_profiles (user_id) values (auth.uid()) returning id into v_farmer_id;
  end if;

  insert into public.consultation_bookings
    (expert_id, farmer_id, slot_id, meeting_date, meeting_time, issue_description, status)
  values
    (v_slot.expert_id, v_farmer_id, v_slot.id, v_slot.slot_date, v_slot.start_time, p_issue, 'Booked')
  returning id into v_booking_id;

  update public.consultation_slots set is_booked = true where id = v_slot.id;

  return v_booking_id;
end;
$$;

revoke all on function public.book_consultation_slot(uuid, text) from public, anon;
grant execute on function public.book_consultation_slot(uuid, text) to authenticated;
