// Disposable PostgreSQL (PGlite) loaded with the REAL production schema export
// (supabase/schema/live_schema_20261024.sql) on top of a small Supabase platform stub, then the proposed scripts.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../..', import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), 'utf8');

export const LIVE_SCHEMA = 'supabase/schema/live_schema_20261024.sql';

export const PROPOSED = {
  '01': 'supabase/proposed/01_protect_profile_privileged_columns.sql',
  '02': 'supabase/proposed/02_profiles_require_sign_in.sql',
  '03': 'supabase/proposed/03_fix_security_definer_functions.sql',
  '04': 'supabase/proposed/04_reconcile_drift.sql',
  '05': 'supabase/proposed/05_consultation_lifecycle_server_side.sql',
  '06': 'supabase/proposed/06_repair_test_fixtures.sql',
  '07': 'supabase/proposed/07_storage_privacy.sql',
  '08': 'supabase/proposed/08_enable_realtime.sql',
  '09': 'supabase/proposed/09_expert_lifecycle_and_user_deletion.sql',
  '10': 'supabase/proposed/10_post_media_storage.sql',
  '11': 'supabase/proposed/11_consultation_meetings.sql',
  '12': 'supabase/proposed/12_expert_controlled_completion.sql',
  '13': 'supabase/proposed/13_push_notifications.sql',
  '14': 'supabase/proposed/14_meet_links_and_demo_payment.sql',
  '15': 'supabase/proposed/15_expert_fee_and_commission.sql',
  '16': 'supabase/proposed/16_message_notification_type.sql',
  '17': 'supabase/proposed/17_messaging.sql',
  '18': 'supabase/proposed/18_cancellation_and_refunds.sql',
  '19': 'supabase/proposed/19_messaging_keep_normal_chats.sql',
  '20': 'supabase/proposed/20_districts_and_district_feed.sql',
  '21': 'supabase/proposed/21_add_idukki_district.sql',
  '22': 'supabase/proposed/22_storage_file_limits.sql',
  '23': 'supabase/proposed/23_numeric_ranges.sql',
  '24': 'supabase/proposed/24_expert_removal_and_resumes.sql',
  '25': 'supabase/proposed/25_expert_broadcasts.sql',
  '99': 'supabase/proposed/99_rollback.sql',
};
export const ALL = ['01', '02', '03', '04', '05', '07', '08'];

export async function createDb({ proposed = [] } = {}) {
  const db = new PGlite();
  await db.exec(read('tests/db/supabase_platform_stub.sql'));
  await db.exec(read(LIVE_SCHEMA));
  // Supabase default privileges: API roles hold table privileges, RLS narrows them.
  await db.exec('grant select, insert, update, delete on all tables in schema public to anon, authenticated');
  for (const key of proposed) await applyProposed(db, key);
  return db;
}

export async function applyProposed(db, key) {
  await db.exec(read(PROPOSED[key]));
}

export async function applyFile(db, path) {
  await db.exec(read(path));
}

// Run SQL as a Supabase API caller. uid = null -> anon.
export async function as(db, uid, sql, params = []) {
  const role = uid ? 'authenticated' : 'anon';
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', $2, false)`,
    [uid ?? '', role]);
  await db.exec(`set role ${role}`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false)`);
  }
}

export const ids = {
  admin: 'aaaaaaaa-0000-4000-8000-000000000001',
  farmerA: 'aaaaaaaa-0000-4000-8000-000000000002',
  farmerB: 'aaaaaaaa-0000-4000-8000-000000000003',
  expertUser: 'aaaaaaaa-0000-4000-8000-000000000004',
  expertRow: 'bbbbbbbb-0000-4000-8000-000000000004',
};

// Like a real signup: insert into auth.users and let handle_new_user() create the profile.
export async function signUp(db, id, email, meta = {}) {
  await db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)',
    [id, email, JSON.stringify({ full_name: email, ...meta })]);
}

// Superuser seed (bypasses RLS), equivalent to running in the Supabase SQL editor.
export async function seed(db) {
  for (const [id, email, role] of [
    [ids.admin, 'admin@test.local', 'Admin'],
    [ids.farmerA, 'farmer-a@test.local', 'Farmer'],
    [ids.farmerB, 'farmer-b@test.local', 'Farmer'],
    [ids.expertUser, 'expert@test.local', 'Expert'],
  ]) {
    await signUp(db, id, email);
    await db.query('update public.profiles set role = $2 where id = $1', [id, role]);
  }
  await db.query('insert into public.experts (id, user_id, specialization, verified_date) values ($1, $2, $3, current_date)',
    [ids.expertRow, ids.expertUser, 'Soil']);
}

// A slot `days` days ahead (local Asia/Kolkata date) at `time`.
export async function addSlot(db, { days = 2, time = '10:00', rate = 400, booked = false } = {}) {
  const { rows } = await db.query(
    `insert into public.consultation_slots (expert_id, slot_date, start_time, end_time, rate, is_booked)
     values ($1, ((now() at time zone 'Asia/Kolkata') + make_interval(days => $2))::date, $3::time, $3::time + interval '30 minutes', $4, $5)
     returning id`,
    [ids.expertRow, days, time, rate, booked]);
  return rows[0].id;
}

// A Booked booking (inserted directly, superuser) starting `minutes` from now. Requires 04 (expert_joined_at).
export async function addBookingStartingIn(db, minutes, { farmer = ids.farmerA, joined = false, rate = 600 } = {}) {
  const { rows: fp } = await db.query(
    `insert into public.farmer_profiles (user_id) values ($1)
     on conflict (user_id) do update set user_id = excluded.user_id returning id`, [farmer]);
  const { rows } = await db.query(
    `with t as (select (now() at time zone 'Asia/Kolkata') + make_interval(mins => $3) as ts),
     s as (insert into public.consultation_slots (expert_id, slot_date, start_time, end_time, rate, is_booked)
           select $1, ts::date, date_trunc('minute', ts)::time, (date_trunc('minute', ts) + interval '30 minutes')::time, $4, true
           from t returning *)
     insert into public.consultation_bookings (expert_id, farmer_id, slot_id, meeting_date, meeting_time, status, expert_joined_at)
     select $1, $2, s.id, s.slot_date, s.start_time, 'Booked', case when $5 then now() end from s returning id, slot_id`,
    [ids.expertRow, fp[0].id, minutes, rate, joined]);
  return rows[0];
}

export async function startOf(db, bookingId) {
  const { rows } = await db.query(
    'select public.consultation_start(meeting_date, meeting_time) as start from public.consultation_bookings where id = $1',
    [bookingId]);
  return rows[0].start;
}

export async function rejects(promise, pattern) {
  try {
    await promise;
  } catch (e) {
    if (pattern && !pattern.test(e.message)) throw new Error(`rejected with unexpected error: ${e.message}`);
    return e;
  }
  throw new Error('expected the statement to be rejected, but it succeeded');
}
