import React, { useEffect, useState } from 'react';
import { Button } from './Button';

// Meeting dates/times are Asia/Kolkata local times (app_timezone() in the database; India has no DST).
const APP_TZ_OFFSET = '+05:30';
export const meetingStartMs = (dateStr, timeStr) => Date.parse(`${dateStr}T${(timeStr || '00:00').slice(0, 5)}:00${APP_TZ_OFFSET}`);
const formatClock = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

// Button state only (usability): join_consultation() re-checks everything on the server. nowMs is the server clock
// (phone clock + offset measured by consultation_join_status()), so a wrong phone clock does not open it early.
export function getJoinState(appt, nowMs) {
  const startMs = meetingStartMs(appt.date, appt.time);
  const opensMs = startMs - 5 * 60 * 1000;
  const endsMs = appt.endsMs || startMs + 30 * 60 * 1000;
  if (nowMs >= endsMs) return { isReady: false, ended: true, text: 'Meeting ended' };
  if (nowMs >= opensMs) return { isReady: true, text: 'Join Meeting' };
  const diff = opensMs - nowMs;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const sec = Math.floor((diff % 60000) / 1000);
  const wait = h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h > 0 ? `${h}h ${m}m` : `${m}m ${sec}s`;
  return { isReady: false, text: `Join opens ${formatClock(opensMs)} (in ${wait})` };
}

// Only this button re-renders every second (not the whole Catch Up page, which froze Android WebView).
export default function JoinMeetingButton({ meeting, clockOffsetMs = 0, busy, onJoin, icon = 'video_call', style }) {
  const [now, setNow] = useState(() => Date.now() + clockOffsetMs);
  useEffect(() => {
    setNow(Date.now() + clockOffsetMs);
    const t = setInterval(() => setNow(Date.now() + clockOffsetMs), 1000);
    return () => clearInterval(t);
  }, [clockOffsetMs]);
  const state = getJoinState(meeting, now);
  const enabled = state.isReady && !busy;
  return (
    <Button
      onClick={(e) => { e.stopPropagation(); if (enabled) onJoin(meeting); }}
      variant="primary"
      icon={icon}
      disabled={!enabled}
      style={{ ...style, opacity: enabled ? 1 : 0.6, cursor: enabled ? 'pointer' : 'not-allowed' }}
    >
      {busy ? 'Joining…' : state.text}
    </Button>
  );
}
