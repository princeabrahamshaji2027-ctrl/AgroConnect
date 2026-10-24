// Local, disposable "staging copy" for SQL tests: PGlite (real PostgreSQL compiled to WASM, in-process).
// It starts from tests/db/reconstructed_base_schema.sql (NOT the live schema — see that file's header), applies
// the repo's real migrations in order, then the proposed scripts requested by the test.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../..', import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), 'utf8');

export const MIGRATIONS = readdirSync(join(root, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort();

export const PROPOSED = {
  '01': 'supabase/proposed/01_protect_profile_privileged_columns.sql',
  '02': 'supabase/proposed/02_profiles_require_sign_in.sql',
  '03': 'supabase/proposed/03_fix_security_definer_functions.sql',
  '05': 'supabase/proposed/05_consultation_lifecycle_server_side.sql',
  '06': 'supabase/proposed/06_repair_test_fixtures.sql',
  '99': 'supabase/proposed/99_rollback.sql',
};

export async function createDb({ proposed = [] } = {}) {
  const db = new PGlite();
  await db.exec(read('tests/db/reconstructed_base_schema.sql'));
  // Like pg_restore / supabase db push: function bodies are checked when called, not when created.
  await db.exec('set check_function_bodies = off');
  for (const f of MIGRATIONS) await db.exec(read(`supabase/migrations/${f}`));
  await db.exec('set check_function_bodies = on');
  for (const key of proposed) await applyProposed(db, key);
  return db;
}

export async function applyProposed(db, key) {
  await db.exec(read(PROPOSED[key]));
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

// Superuser seed (bypasses RLS), equivalent to running in the Supabase SQL editor.
export async function seed(db) {
  const users = [
    [ids.admin, 'admin@test.local', 'Admin'],
    [ids.farmerA, 'farmer-a@test.local', 'Farmer'],
    [ids.farmerB, 'farmer-b@test.local', 'Farmer'],
    [ids.expertUser, 'expert@test.local', 'Expert'],
  ];
  for (const [id, email, role] of users) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
    await db.query('insert into public.profiles (id, full_name, role) values ($1, $2, $3)', [id, email, role]);
  }
  await db.query('insert into public.experts (id, user_id, specialization, verified_date) values ($1, $2, $3, current_date)',
    [ids.expertRow, ids.expertUser, 'Soil']);
}

// A slot `days` days ahead (local Asia/Kolkata date) at `time`.
export async function addSlot(db, { days = 2, time = '10:00', rate = 400, booked = false } = {}) {
  const { rows } = await db.query(
    `insert into public.consultation_slots (expert_id, slot_date, start_time, rate, is_booked)
     values ($1, ((now() at time zone 'Asia/Kolkata') + make_interval(days => $2))::date, $3::time, $4, $5) returning id`,
    [ids.expertRow, days, time, rate, booked]);
  return rows[0].id;
}

// A Booked booking (inserted directly, superuser) starting `minutes` from now.
export async function addBookingStartingIn(db, minutes, { farmer = ids.farmerA, joined = false, rate = 600 } = {}) {
  const { rows: fp } = await db.query(
    `insert into public.farmer_profiles (user_id) values ($1)
     on conflict (user_id) do update set user_id = excluded.user_id returning id`, [farmer]);
  const { rows } = await db.query(
    `with t as (select (now() at time zone 'Asia/Kolkata') + make_interval(mins => $3) as ts),
     s as (insert into public.consultation_slots (expert_id, slot_date, start_time, rate, is_booked)
           select $1, ts::date, date_trunc('minute', ts)::time, $4, true from t returning *)
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
