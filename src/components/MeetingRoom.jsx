import React, { useEffect, useState } from 'react';

// The consultation room a participant enters after the server accepted join_consultation(). There is no video
// provider yet, so this screen must not pretend a call is connected: it confirms the check-in (attendance is
// recorded on the server), shows who the meeting is with and when it ends, and lets the person leave.
export default function MeetingRoom({ meeting, session, clockOffsetMs = 0, onLeave, leaving }) {
  // own clock (minutes left); updating twice a minute keeps the rest of Catch Up from re-rendering
  const [nowMs, setNowMs] = useState(() => Date.now() + clockOffsetMs);
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now() + clockOffsetMs), 30000);
    return () => clearInterval(t);
  }, [clockOffsetMs]);
  const role = session?.role === 'expert' ? 'Expert' : 'Farmer';
  const other = role === 'Expert'
    ? { name: meeting.farmerName || 'Farmer', avatar: meeting.farmerAvatar, label: 'Farmer' }
    : { name: meeting.expertName || 'Expert', avatar: meeting.expertAvatar, label: 'Expert' };
  const endsMs = session?.ends_at ? Date.parse(session.ends_at) : null;
  const leftMin = endsMs ? Math.max(0, Math.ceil((endsMs - nowMs) / 60000)) : null;
  const fmt = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

  return (
    <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#090909', position: 'relative', zIndex: 1000 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'calc(16px + var(--safe-top)) 20px 16px', background: 'rgba(0,0,0,0.5)' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary-green)' }}>Consultation room</div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            Room {String(session?.room_id || '').slice(0, 8).toUpperCase()}
            {endsMs ? ` · ends ${fmt(session.ends_at)}${leftMin !== null ? ` (${leftMin} min left)` : ''}` : ''}
          </div>
        </div>
        <span style={{ fontSize: '11px', fontWeight: '700', color: '#FFA726', border: '1px solid rgba(255,167,38,0.5)', padding: '4px 10px', borderRadius: '10px' }}>
          Video not connected
        </span>
      </div>

      <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>
        <div role="status" style={{ backgroundColor: 'rgba(255, 167, 38, 0.1)', border: '1px solid rgba(255, 167, 38, 0.3)', borderRadius: '14px', padding: '12px 14px', fontSize: '13px', lineHeight: '1.5', color: 'var(--text-primary)' }}>
          You are checked in for this consultation. Video calling is not set up in
          AgroConnect yet, so there is no live audio or video here. Please talk to {other.name} through Chat while this
          room is open.
        </div>

        {[{ ...other }, { name: 'You', avatar: null, label: role }].map((p) => (
          <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: '14px', backgroundColor: '#1E1E1E', borderRadius: '16px', padding: '16px', border: '1px solid var(--border-color)' }}>
            {p.avatar
              ? <img src={p.avatar} alt="" style={{ width: '56px', height: '56px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--primary-green)' }} />
              : <span className="material-symbols-outlined" style={{ fontSize: '56px', color: 'var(--text-secondary)' }}>account_circle</span>}
            <div>
              <div style={{ fontSize: '15px', fontWeight: '700' }}>{p.name}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{p.label}</div>
            </div>
          </div>
        ))}

        <div style={{ backgroundColor: '#1E1E1E', borderRadius: '14px', padding: '12px 14px', border: '1px solid var(--border-color)', fontSize: '13px' }}>
          <strong>Topic:</strong> {meeting.topic || '—'}
        </div>
      </div>

      <div style={{ padding: '20px 20px calc(20px + var(--safe-bottom))', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={onLeave}
          disabled={leaving}
          style={{ padding: '12px 28px', borderRadius: '24px', backgroundColor: 'var(--error)', border: 'none', color: 'white', fontWeight: '700', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', opacity: leaving ? 0.6 : 1 }}
        >
          <span className="material-symbols-outlined" style={{ transform: 'rotate(135deg)' }}>call_end</span>
          {leaving ? 'Leaving…' : 'Leave room'}
        </button>
      </div>
    </div>
  );
}
