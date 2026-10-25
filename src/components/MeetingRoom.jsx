import React, { useEffect, useRef, useState } from 'react';

// Catch Up consultation room. The server (video-room-token) already checked the participant, booking status and
// join window and recorded attendance. With a video provider configured (videoState 'ready') this joins a private
// Daily room with the short-lived token minted for this user; otherwise it shows an honest "no video" room.
// Leaving never completes the consultation; only the expert's "End consultation" does (checked on the server).

function Tile({ track, audioTrack, label, muted, mirrored, placeholder }) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = track ? new MediaStream([track]) : null;
  }, [track]);
  useEffect(() => {
    if (audioRef.current) audioRef.current.srcObject = audioTrack ? new MediaStream([audioTrack]) : null;
  }, [audioTrack]);
  return (
    <div style={{ flex: 1, minHeight: 0, position: 'relative', backgroundColor: '#1E1E1E', borderRadius: '18px', overflow: 'hidden', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {track
        ? <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: mirrored ? 'scaleX(-1)' : 'none' }} />
        : <div style={{ color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center', padding: '12px' }}>{placeholder}</div>}
      {audioTrack && <audio ref={audioRef} autoPlay />}
      <div style={{ position: 'absolute', bottom: '10px', left: '10px', backgroundColor: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: '10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        {muted !== undefined && <span className="material-symbols-outlined" style={{ fontSize: '14px', color: muted ? 'var(--error)' : 'var(--primary-green)' }}>{muted ? 'mic_off' : 'mic'}</span>}
        <span>{label}</span>
      </div>
    </div>
  );
}

const CONTROL = { width: '52px', height: '52px', borderRadius: '50%', border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };

export default function MeetingRoom({ meeting, session, videoState = 'not_configured', isExpert, clockOffsetMs = 0, onLeave, onEnd, onRetry, leaving }) {
  const otherName = isExpert ? (meeting.farmerName || 'Farmer') : (meeting.expertName || 'Expert');
  // own clock (minutes left); updating twice a minute keeps the rest of Catch Up from re-rendering
  const [nowMs, setNowMs] = useState(() => Date.now() + clockOffsetMs);
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now() + clockOffsetMs), 30000);
    return () => clearInterval(t);
  }, [clockOffsetMs]);
  const endsMs = session?.ends_at ? Date.parse(session.ends_at) : null;
  const leftMin = endsMs ? Math.max(0, Math.ceil((endsMs - nowMs) / 60000)) : null;
  const fmt = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

  // ---- Daily call (only when the server returned a room and a token)
  const callRef = useRef(null);
  const [status, setStatus] = useState(videoState === 'ready' ? 'connecting' : 'none'); // connecting|connected|reconnecting|failed|none
  const [problem, setProblem] = useState('');
  const [local, setLocal] = useState({ video: null, audioOn: true, videoOn: true });
  const [remote, setRemote] = useState(null); // { video, audio, audioOn, name }

  useEffect(() => {
    if (videoState !== 'ready' || !session?.room_url || !session?.token) return undefined;
    let cancelled = false;
    let call;
    const refresh = () => {
      if (!call) return;
      const ps = call.participants();
      const lp = ps.local;
      setLocal({
        video: lp?.tracks?.video?.state === 'playable' ? lp.tracks.video.persistentTrack : null,
        audioOn: lp?.tracks?.audio?.state !== 'off',
        videoOn: lp?.tracks?.video?.state !== 'off',
      });
      const other = Object.values(ps).find((p) => !p.local);
      setRemote(other ? {
        video: other.tracks?.video?.state === 'playable' ? other.tracks.video.persistentTrack : null,
        audio: other.tracks?.audio?.state === 'playable' ? other.tracks.audio.persistentTrack : null,
        audioOn: other.tracks?.audio?.state !== 'off',
        name: other.user_name || otherName,
      } : null);
    };
    (async () => {
      try {
        const Daily = (await import('@daily-co/daily-js')).default;
        if (cancelled) return;
        call = Daily.getCallInstance() || Daily.createCallObject({ subscribeToTracksAutomatically: true });
        callRef.current = call;
        call
          .on('joined-meeting', () => { setStatus('connected'); refresh(); })
          .on('participant-joined', refresh)
          .on('participant-updated', refresh)
          .on('participant-left', refresh)
          .on('track-started', refresh)
          .on('track-stopped', refresh)
          .on('network-connection', (e) => setStatus(e?.event === 'interrupted' ? 'reconnecting' : 'connected'))
          .on('camera-error', (e) => {
            const t = e?.error?.type || '';
            setProblem(/permission|blocked/i.test(t)
              ? 'Camera or microphone access is blocked. Allow it in your phone settings (Apps → AgroConnect → Permissions), then rejoin.'
              : 'Your camera or microphone could not be started. The other person may not see or hear you.');
          })
          .on('error', (e) => {
            setStatus('failed');
            setProblem(/exp|eject/i.test(e?.errorMsg || '') ? 'This meeting has ended.' : 'The video call was disconnected.');
          });
        await call.join({ url: session.room_url, token: session.token });
      } catch {
        if (!cancelled) { setStatus('failed'); setProblem('Could not connect to the video call. Check your internet connection and try again.'); }
      }
    })();
    return () => {
      cancelled = true;
      const c = callRef.current;
      callRef.current = null;
      if (c) c.leave().catch(() => {}).finally(() => c.destroy().catch(() => {}));
    };
  }, [videoState, session?.room_url, session?.token]);

  const toggleMic = () => callRef.current?.setLocalAudio(!local.audioOn);
  const toggleCam = () => callRef.current?.setLocalVideo(!local.videoOn);
  const switchCam = () => callRef.current?.cycleCamera().catch(() => setProblem('Could not switch camera.'));

  const statusText = {
    connecting: 'Connecting…',
    connected: remote ? `Connected with ${remote.name}` : `Waiting for ${otherName} to join…`,
    reconnecting: 'Connection lost — reconnecting…',
    failed: 'Not connected',
  }[status];

  return (
    <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#090909', position: 'relative', zIndex: 1000 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: 'calc(16px + var(--safe-top)) 20px 12px', background: 'rgba(0,0,0,0.5)' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary-green)' }}>Consultation with {otherName}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            {endsMs ? `Ends ${fmt(session.ends_at)}${leftMin !== null ? ` (${leftMin} min left)` : ''}` : ''}
          </div>
        </div>
        {videoState === 'ready'
          ? <span role="status" aria-live="polite" style={{ fontSize: '11px', fontWeight: '700', color: status === 'connected' ? 'var(--primary-green)' : '#FFA726', border: '1px solid currentColor', padding: '4px 10px', borderRadius: '10px', textAlign: 'right' }}>{statusText}</span>
          : <span style={{ fontSize: '11px', fontWeight: '700', color: '#FFA726', border: '1px solid rgba(255,167,38,0.5)', padding: '4px 10px', borderRadius: '10px' }}>Video not connected</span>}
      </div>

      {videoState === 'ready' ? (
        <div style={{ flex: 1, minHeight: 0, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {problem && <div role="alert" style={{ backgroundColor: 'rgba(231,76,60,0.12)', border: '1px solid rgba(231,76,60,0.35)', borderRadius: '12px', padding: '10px 12px', fontSize: '12px' }}>{problem}</div>}
          <Tile track={remote?.video} audioTrack={remote?.audio} muted={remote ? !remote.audioOn : undefined} label={remote?.name || otherName}
            placeholder={remote ? `${remote.name}'s camera is off` : `Waiting for ${otherName}…`} />
          <div style={{ height: '28%', display: 'flex' }}>
            <Tile track={local.video} muted={!local.audioOn} label="You" mirrored placeholder={local.videoOn ? 'Starting camera…' : 'Your camera is off'} />
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>
          <div role="status" style={{ backgroundColor: 'rgba(255, 167, 38, 0.1)', border: '1px solid rgba(255, 167, 38, 0.3)', borderRadius: '14px', padding: '12px 14px', fontSize: '13px', lineHeight: '1.5' }}>
            {videoState === 'unavailable'
              ? `You are checked in, but the video service is not reachable right now. Try again in a moment, or talk to ${otherName} through Chat.`
              : `You are checked in for this consultation. Video calling is not set up in AgroConnect yet, so there is no live audio or video here. Please talk to ${otherName} through Chat while this room is open.`}
          </div>
          {videoState === 'unavailable' && onRetry && (
            <button onClick={onRetry} style={{ alignSelf: 'center', padding: '10px 20px', borderRadius: '14px', border: '1px solid var(--primary-green)', background: 'transparent', color: 'var(--primary-green)', fontWeight: '700', cursor: 'pointer' }}>Try video again</button>
          )}
          <div style={{ backgroundColor: '#1E1E1E', borderRadius: '14px', padding: '12px 14px', border: '1px solid var(--border-color)', fontSize: '13px' }}>
            <strong>Topic:</strong> {meeting.topic || '—'}
          </div>
        </div>
      )}

      <div style={{ padding: '16px 20px calc(16px + var(--safe-bottom))', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        {videoState === 'ready' && status !== 'failed' && (
          <>
            <button onClick={toggleMic} aria-label={local.audioOn ? 'Mute microphone' : 'Unmute microphone'} style={{ ...CONTROL, backgroundColor: local.audioOn ? 'rgba(255,255,255,0.1)' : 'var(--error)' }}>
              <span className="material-symbols-outlined">{local.audioOn ? 'mic' : 'mic_off'}</span>
            </button>
            <button onClick={toggleCam} aria-label={local.videoOn ? 'Turn camera off' : 'Turn camera on'} style={{ ...CONTROL, backgroundColor: local.videoOn ? 'rgba(255,255,255,0.1)' : 'var(--error)' }}>
              <span className="material-symbols-outlined">{local.videoOn ? 'videocam' : 'videocam_off'}</span>
            </button>
            <button onClick={switchCam} aria-label="Switch camera" style={{ ...CONTROL, backgroundColor: 'rgba(255,255,255,0.1)' }}>
              <span className="material-symbols-outlined">cameraswitch</span>
            </button>
          </>
        )}
        {videoState === 'ready' && status === 'failed' && onRetry && (
          <button onClick={onRetry} style={{ padding: '12px 20px', borderRadius: '24px', border: '1px solid var(--primary-green)', background: 'transparent', color: 'var(--primary-green)', fontWeight: '700', cursor: 'pointer' }}>Rejoin</button>
        )}
        <button onClick={onLeave} disabled={leaving} aria-label="Leave room" style={{ ...CONTROL, width: 'auto', padding: '0 18px', borderRadius: '26px', backgroundColor: 'rgba(255,255,255,0.12)', gap: '6px', fontWeight: '700', fontSize: '13px' }}>
          <span className="material-symbols-outlined">logout</span> Leave
        </button>
        {isExpert && (
          <button onClick={onEnd} disabled={leaving} aria-label="End consultation" style={{ ...CONTROL, width: 'auto', padding: '0 18px', borderRadius: '26px', backgroundColor: 'var(--error)', gap: '6px', fontWeight: '700', fontSize: '13px', opacity: leaving ? 0.6 : 1 }}>
            <span className="material-symbols-outlined" style={{ transform: 'rotate(135deg)' }}>call_end</span> {leaving ? 'Ending…' : 'End consultation'}
          </button>
        )}
      </div>
    </div>
  );
}
