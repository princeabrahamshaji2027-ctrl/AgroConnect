// Availability slot rules used when an expert publishes slots (Connect.jsx). Pure functions, unit-tested.

// "HH:MM" + minutes -> "HH:MM", or null when the slot would run past midnight (slots stay on one date).
export function slotEndTime(timeStr, minutes) {
  const [h, m] = String(timeStr || '').split(':').map((x) => parseInt(x, 10));
  if (!Number.isInteger(h) || !Number.isInteger(m) || !Number.isInteger(minutes) || minutes <= 0) return null;
  const end = h * 60 + m + minutes;
  if (end > 24 * 60 - 1) return null;
  return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
}

// A new slot must start at least 30 minutes from now (Asia/Kolkata), so nobody can publish a slot that already began.
export function slotStartsSoonEnough(dateStr, timeStr, nowMs = Date.now()) {
  const start = Date.parse(`${dateStr}T${timeStr}:00+05:30`);
  return Number.isFinite(start) && start >= nowMs + 30 * 60000;
}
