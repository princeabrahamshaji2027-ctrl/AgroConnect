import React, { useState, useEffect, useRef, useCallback } from 'react';
import Header from '../components/Header';
import { FieldError } from '../components/InputField';
import { ConversationRowSkeleton, MessageBubblesSkeleton, SkeletonGroup, LoadError } from '../components/Skeleton';
import { supabase } from '../supabase';
import './pages.css';

// Text-only messaging. Everything goes through the messaging RPCs (migration 17); the app never writes the tables.
// Users connected to each other (or who share a consultation) chat normally. Anyone else's first message lands in the
// recipient's "Message requests" box (the icon at the top right, with a blue dot while requests are waiting) until the
// recipient accepts it or replies; Decline hides it without telling the sender.

const MAX_LEN = 2000;
const PAGE = 30;

const formatTimeAgo = (dateStr) => {
  if (!dateStr) return '';
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const formatTime12h = (timeStr) => {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  let h = parseInt(parts[0], 10);
  const m = parts[1] || '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, '0')}:${m} ${ampm}`;
};

const newClientId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // older Android WebViews: RFC 4122 v4 from getRandomValues
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

const isNetworkError = (err) => /Failed to fetch|NetworkError|network|Load failed/i.test(err?.message || '');
const friendlyError = (err, fallback) => (isNetworkError(err) ? 'No connection. Please try again.' : (err?.message || fallback));

const toRow = (r) => ({
  id: r.conversation_id,
  otherUserId: r.other_user_id,
  name: r.other_name || 'User',
  avatar: r.other_avatar || '/profile-placeholder.png',
  state: r.state,
  lastMsg: r.last_message || '',
  lastAt: r.last_message_at,
  lastFromMe: r.last_from_me,
  unread: r.unread_count || 0,
});

// Adds or replaces messages by id (and replaces the optimistic copy that has the same client_id); keeps time order.
const mergeMessages = (list, incoming) => {
  const out = [...list];
  for (const m of incoming) {
    const i = out.findIndex((x) => x.id === m.id || (m.client_id && x.client_id === m.client_id && x.sender_id === m.sender_id));
    if (i >= 0) out[i] = { ...m, _status: undefined };
    else out.push(m);
  }
  return out.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
};

export default function Chat({ onNavigateToBooking, onProfileClick, onShowToast, focusConversation, clearFocusConversation }) {
  const [me, setMe] = useState(null);
  const [box, setBox] = useState('inbox');              // 'inbox' | 'requests'
  const [lists, setLists] = useState({ inbox: [], requests: [] });
  const [listState, setListState] = useState('loading'); // loading | ready | error
  const [badges, setBadges] = useState({ inbox_unread: 0, requests: 0, requests_unread: 0 });

  const [active, setActive] = useState(null);           // { id, otherUserId, name, avatar, state }
  const [messages, setMessages] = useState([]);
  const [msgState, setMsgState] = useState('idle');     // idle | loading | ready | error
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState(null);
  const [answering, setAnswering] = useState(false);

  const activeRef = useRef(null);
  activeRef.current = active;
  const meRef = useRef(null);
  meRef.current = me;
  const endRef = useRef(null);
  const areaRef = useRef(null);
  const inputRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const refreshTimerRef = useRef(null);
  const listSeqRef = useRef(0);

  // ─── conversation lists + badges (one round trip each, in parallel) ────────────────────────────────────────────
  const loadLists = useCallback(async () => {
    const seq = ++listSeqRef.current;
    const [inbox, requests, b] = await Promise.all([
      supabase.rpc('list_conversations', { p_box: 'inbox', p_limit: 50 }),
      supabase.rpc('list_conversations', { p_box: 'requests', p_limit: 50 }),
      supabase.rpc('chat_badges'),
    ]);
    if (seq !== listSeqRef.current) return null;
    const err = inbox.error || requests.error || b.error;
    if (err) {
      console.error('Error loading conversations:', err.message);
      setListState((s) => (s === 'ready' ? 'ready' : 'error'));
      return null;
    }
    const next = { inbox: (inbox.data || []).map(toRow), requests: (requests.data || []).map(toRow) };
    setLists(next);
    setBadges(b.data || { inbox_unread: 0, requests: 0, requests_unread: 0 });
    setListState('ready');
    return next;
  }, []);

  const scheduleRefresh = useCallback(() => {
    clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => { loadLists(); }, 400);
  }, [loadLists]);

  useEffect(() => {
    let channel = null;
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled || !session?.user) return;
      setMe(session.user.id);
      loadLists();
      // One channel for all my conversations: RLS only delivers messages of conversations I am part of.
      channel = supabase
        .channel(`chat-inbox-${session.user.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
          const m = payload.new;
          if (!m) return;
          const cur = activeRef.current;
          if (cur && m.conversation_id === cur.id) {
            setMessages((prev) => mergeMessages(prev, [m]));
            if (m.sender_id !== meRef.current) supabase.rpc('mark_conversation_read', { p_conversation_id: cur.id }).then(() => {});
          }
          scheduleRefresh();
        })
        .subscribe();
    })();
    return () => {
      cancelled = true;
      clearTimeout(refreshTimerRef.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [loadLists, scheduleRefresh]);

  // ─── thread ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const openConversation = useCallback(async (conv) => {
    setActive(conv);
    setMessages([]);
    setDraft('');
    setSendError(null);
    setHasMore(false);
    setMsgState('loading');
    stickToBottomRef.current = true;
    const { data, error } = await supabase.rpc('get_messages', { p_conversation_id: conv.id, p_limit: PAGE });
    if (activeRef.current?.id !== conv.id) return;
    if (error) {
      console.error('Error loading messages:', error.message);
      setMsgState('error');
      return;
    }
    setMessages(data || []);
    setHasMore((data || []).length >= PAGE);
    setMsgState('ready');
    if ((data || []).some((m) => m.sender_id !== meRef.current && !m.read_at)) {
      await supabase.rpc('mark_conversation_read', { p_conversation_id: conv.id });
      scheduleRefresh();
    }
  }, [scheduleRefresh]);

  const loadOlder = async () => {
    if (!active || loadingOlder || messages.length === 0) return;
    setLoadingOlder(true);
    stickToBottomRef.current = false;
    const area = areaRef.current;
    const prevHeight = area ? area.scrollHeight : 0;
    const { data, error } = await supabase.rpc('get_messages', {
      p_conversation_id: active.id, p_before: messages[0].created_at, p_limit: PAGE,
    });
    setLoadingOlder(false);
    if (error) { if (onShowToast) onShowToast(friendlyError(error, 'Could not load earlier messages.')); return; }
    setMessages((prev) => mergeMessages(prev, data || []));
    setHasMore((data || []).length >= PAGE);
    // keep the reader where they were instead of jumping
    requestAnimationFrame(() => { if (area) area.scrollTop += area.scrollHeight - prevHeight; });
  };

  // Opened from a profile ("Message"), a push notification or a notification row.
  useEffect(() => {
    if (!focusConversation?.id || !me) return;
    let cancelled = false;
    (async () => {
      let found = [...lists.inbox, ...lists.requests].find((c) => c.id === focusConversation.id);
      if (!found) {
        const fresh = await loadLists();
        if (cancelled) return;
        found = fresh && [...fresh.inbox, ...fresh.requests].find((c) => c.id === focusConversation.id);
      }
      const conv = found || (focusConversation.otherUserId ? {
        id: focusConversation.id,
        otherUserId: focusConversation.otherUserId,
        name: focusConversation.name || 'User',
        avatar: focusConversation.avatar || '/profile-placeholder.png',
        state: focusConversation.state || 'normal',
      } : null);
      if (clearFocusConversation) clearFocusConversation();
      if (conv) {
        if (conv.state === 'request_incoming') setBox('requests');
        openConversation(conv);
      } else if (onShowToast) {
        onShowToast('This conversation is no longer available.');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusConversation?.id, me]);

  useEffect(() => {
    if (stickToBottomRef.current && endRef.current) endRef.current.scrollIntoView({ block: 'end' });
    stickToBottomRef.current = true;
  }, [messages]);

  // ─── sending ────────────────────────────────────────────────────────────────────────────────────────────────────
  const deliver = async (conv, content, clientId) => {
    const { data, error } = await supabase.rpc('send_message', {
      p_conversation_id: conv.id, p_content: content, p_client_id: clientId,
    });
    if (activeRef.current?.id !== conv.id) { scheduleRefresh(); return; }
    if (error) {
      setMessages((prev) => prev.map((m) => (m.client_id === clientId && m._status ? { ...m, _status: 'failed', _error: friendlyError(error, 'Not sent.') } : m)));
      return;
    }
    setMessages((prev) => mergeMessages(prev, [data]));
    // replying to a request accepts it
    if (conv.state === 'request_incoming') setActive((a) => (a && a.id === conv.id ? { ...a, state: 'normal' } : a));
    scheduleRefresh();
  };

  const handleSend = (e) => {
    e.preventDefault();
    if (!active || !me) return;
    const content = draft.trim();
    if (!content) { setSendError('Please type a message.'); inputRef.current?.focus(); return; }
    if (content.length > MAX_LEN) { setSendError(`Messages can be up to ${MAX_LEN} characters.`); inputRef.current?.focus(); return; }
    setSendError(null);
    const clientId = newClientId();
    setMessages((prev) => [...prev, {
      id: `local-${clientId}`, client_id: clientId, sender_id: me, content, message_type: 'text',
      created_at: new Date().toISOString(), _status: 'sending',
    }]);
    setDraft('');
    deliver(active, content, clientId);
  };

  const retrySend = (m) => {
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, _status: 'sending', _error: undefined } : x)));
    deliver(active, m.content, m.client_id);   // same client id: the server stores it once even if the first try arrived
  };

  // ─── requests ───────────────────────────────────────────────────────────────────────────────────────────────────
  const answerRequest = async (accept) => {
    if (!active || answering) return;
    setAnswering(true);
    const { data, error } = await supabase.rpc('respond_to_message_request', { p_conversation_id: active.id, p_accept: accept });
    setAnswering(false);
    if (error) { if (onShowToast) onShowToast(friendlyError(error, 'Could not answer the request.')); return; }
    if (accept) {
      setActive((a) => (a ? { ...a, state: data || 'normal' } : a));
      setBox('inbox');
    } else {
      setActive(null);
      setMessages([]);
      if (onShowToast) onShowToast('Request declined.');
    }
    loadLists();
  };

  const handleBack = () => {
    setActive(null);
    setMessages([]);
    setMsgState('idle');
    loadLists();
  };

  // ─── rendering ──────────────────────────────────────────────────────────────────────────────────────────────────
  const renderCancellation = (m) => {
    const meta = m.metadata || {};
    const offered = Array.isArray(meta.offered_slots) ? meta.offered_slots : [];
    const mine = m.sender_id === me;
    const title = mine ? 'You cancelled this meeting'
      : `Meeting cancelled by ${meta.expert_name || active?.name || 'the other person'}`;
    return (
      <div
        key={m.id}
        className={`chat-bubble ${mine ? 'sent' : 'received'}`}
        style={{
          width: '88%', maxWidth: '320px', backgroundColor: '#1E1E1E', border: '1.5px solid var(--error)',
          borderRadius: '16px', padding: '14px', color: 'var(--text-primary)', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--error)', fontWeight: '700', fontSize: '13px', marginBottom: '8px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>event_busy</span>
          <span>{title}</span>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', backgroundColor: '#262626', padding: '8px 10px', borderRadius: '8px', marginBottom: '10px', lineHeight: '1.4', overflowWrap: 'anywhere' }}>
          <strong style={{ color: 'var(--text-primary)' }}>Reason:</strong> {meta.cancellation_reason || m.content}
        </div>
        {offered.length > 0 && !mine && (
          <div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--primary-green)', marginBottom: '8px' }}>
              Select an offered date/time to book again:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {offered.map((slot, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onNavigateToBooking && onNavigateToBooking({ expertId: meta.expert_id, date: slot.date, time: slot.time })}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '10px',
                    backgroundColor: 'rgba(136, 217, 130, 0.12)', border: '1px solid var(--primary-green)', color: 'var(--primary-green)',
                    fontSize: '12px', fontWeight: '700', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>schedule</span>
                    <span>{slot.date} • {formatTime12h(slot.time)}</span>
                  </span>
                  <span style={{ fontSize: '11px', textDecoration: 'underline' }}>Book Slot →</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <span style={{ fontSize: '10px', opacity: 0.6, display: 'block', marginTop: '8px', textAlign: 'right' }}>{formatTimeAgo(m.created_at)}</span>
      </div>
    );
  };

  const renderMessage = (m) => {
    if (m.message_type === 'cancellation_reschedule') return renderCancellation(m);
    const mine = m.sender_id === me;
    return (
      <div key={m.id} className={`chat-bubble ${mine ? 'sent' : 'received'}`} style={m._status === 'failed' ? { opacity: 0.75 } : undefined}>
        {/* plain text only: React escapes it, nothing is rendered as HTML */}
        <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.content}</div>
        <span style={{ fontSize: '10px', opacity: 0.6, display: 'block', marginTop: '4px', textAlign: 'right' }}>
          {m._status === 'sending' ? 'Sending…' : m._status === 'failed' ? '' : formatTimeAgo(m.created_at)}
        </span>
        {m._status === 'failed' && (
          <div role="alert" style={{ fontSize: '11px', color: 'var(--error)', display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
            <span>{m._error || 'Not sent.'}</span>
            <button type="button" onClick={() => retrySend(m)} style={{ background: 'none', border: 'none', color: 'var(--error)', textDecoration: 'underline', fontSize: '11px', fontWeight: 700, cursor: 'pointer', padding: 0 }}>
              Retry
            </button>
          </div>
        )}
      </div>
    );
  };

  const requestsButton = (
    <button
      type="button"
      onClick={() => setBox(box === 'requests' ? 'inbox' : 'requests')}
      aria-label={badges.requests > 0 ? `Message requests, ${badges.requests} waiting` : 'Message requests'}
      aria-pressed={box === 'requests'}
      style={{
        position: 'relative', background: box === 'requests' ? 'rgba(136, 217, 130, 0.15)' : 'transparent', border: 'none',
        borderRadius: '50%', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', color: 'var(--text-primary)',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>mark_chat_unread</span>
      {badges.requests > 0 && (
        <span
          data-testid="requests-dot"
          aria-hidden="true"
          style={{ position: 'absolute', top: '6px', right: '6px', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#2F80ED', border: '2px solid var(--bg-dark)' }}
        />
      )}
    </button>
  );

  if (!active) {
    const rows = lists[box];
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Header title={box === 'requests' ? 'Message requests' : 'Messages'} showBack={box === 'requests'} onBackClick={() => setBox('inbox')} rightActions={requestsButton} />
        <div className="page-container fade-in">
          {box === 'requests' && (
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.45, margin: '4px 0 8px' }}>
              Messages from people you are not connected with. They won't know you have seen them until you accept or reply.
            </p>
          )}
          {listState === 'loading' ? (
            <SkeletonGroup label="Loading conversations…" style={{ gap: 0 }}>
              {[0, 1, 2, 3, 4].map((i) => <ConversationRowSkeleton key={i} />)}
            </SkeletonGroup>
          ) : listState === 'error' ? (
            <LoadError message="Could not load your messages. Check your connection." onRetry={() => { setListState('loading'); loadLists(); }} />
          ) : rows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-secondary)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '48px', color: 'var(--border-color)', display: 'block', marginBottom: '12px' }}>
                {box === 'requests' ? 'mark_chat_unread' : 'chat_bubble'}
              </span>
              <p style={{ fontSize: '14px', fontWeight: '600' }}>{box === 'requests' ? 'No message requests' : 'No messages yet'}</p>
              {box === 'inbox' && <p style={{ fontSize: '12px', marginTop: '6px' }}>Open someone's profile and tap Message to start a conversation.</p>}
            </div>
          ) : (
            <div className="chat-thread-list">
              {rows.map((conv) => (
                <div
                  key={conv.id}
                  className="chat-thread-item"
                  role="button"
                  tabIndex={0}
                  onClick={() => openConversation(conv)}
                  onKeyDown={(e) => { if (e.key === 'Enter') openConversation(conv); }}
                >
                  <img
                    src={conv.avatar}
                    alt=""
                    className="chat-thread-avatar"
                    onClick={(e) => { if (onProfileClick && conv.otherUserId) { e.stopPropagation(); onProfileClick(conv.otherUserId); } }}
                  />
                  <div className="chat-thread-details" style={{ minWidth: 0 }}>
                    <div className="chat-thread-name-row">
                      <span className="chat-thread-name" style={{ fontWeight: conv.unread > 0 ? 800 : 600 }}>{conv.name}</span>
                      <span className="chat-thread-time">{formatTimeAgo(conv.lastAt)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <p className="chat-thread-msg" style={{ flex: 1, color: conv.unread > 0 ? 'var(--text-primary)' : undefined }}>
                        {conv.lastFromMe ? 'You: ' : ''}{conv.lastMsg}
                      </p>
                      {conv.state === 'request_outgoing' && (
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1px 6px', flexShrink: 0 }}>Request sent</span>
                      )}
                      {conv.unread > 0 && (
                        <span aria-label={`${conv.unread} unread`} style={{ minWidth: '18px', height: '18px', borderRadius: '9px', backgroundColor: 'var(--primary-green)', color: '#121212', fontSize: '10px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', flexShrink: 0 }}>
                          {conv.unread > 99 ? '99+' : conv.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const isIncomingRequest = active.state === 'request_incoming';
  const remaining = MAX_LEN - draft.length;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Header
        title={active.name}
        showBack
        onBackClick={handleBack}
        rightActions={
          <img
            src={active.avatar}
            alt={`${active.name}'s profile`}
            onClick={() => onProfileClick && active.otherUserId && onProfileClick(active.otherUserId)}
            style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', cursor: 'pointer' }}
          />
        }
      />

      <div className="page-container fade-in" style={{ paddingBottom: isIncomingRequest ? '190px' : '96px', display: 'flex', flexDirection: 'column' }}>
        {active.state === 'request_outgoing' && (
          <div className="form-message info" role="status">
            {active.name} will see your messages as a request until they accept or reply.
          </div>
        )}
        <div className="chat-messages-area" ref={areaRef}>
          {hasMore && msgState === 'ready' && (
            <button type="button" className="btn btn-secondary" onClick={loadOlder} disabled={loadingOlder}
              style={{ alignSelf: 'center', padding: '6px 14px', fontSize: '12px', borderRadius: '12px' }}>
              {loadingOlder ? 'Loading…' : 'Load earlier messages'}
            </button>
          )}
          {msgState === 'loading' && <MessageBubblesSkeleton />}
          {msgState === 'error' && <LoadError message="Could not load messages. Check your connection." onRetry={() => openConversation(active)} />}
          {msgState === 'ready' && messages.length === 0 && (
            <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)', padding: '24px 0' }}>Say hello to {active.name}.</p>
          )}
          {messages.map(renderMessage)}
          <div ref={endRef} />
        </div>

        <div
          style={{
            position: 'absolute', bottom: 'calc(var(--bottom-nav-height) + var(--safe-bottom) + 8px)', left: '16px', right: '16px',
            backgroundColor: 'var(--bg-dark)', display: 'flex', flexDirection: 'column', gap: '8px',
          }}
        >
          {isIncomingRequest && (
            <div className="card" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '12px', lineHeight: 1.45, color: 'var(--text-secondary)' }}>
                <strong style={{ color: 'var(--text-primary)' }}>{active.name}</strong> wants to send you messages. Accept to move this chat to your inbox, or reply to accept.
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn btn-secondary" disabled={answering} onClick={() => answerRequest(false)} style={{ flex: 1, padding: '8px', borderRadius: '12px', fontSize: '13px' }}>Decline</button>
                <button type="button" className="btn btn-primary" disabled={answering} onClick={() => answerRequest(true)} style={{ flex: 1, padding: '8px', borderRadius: '12px', fontSize: '13px' }}>Accept</button>
              </div>
            </div>
          )}
          <form onSubmit={handleSend} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className={`input-container${sendError ? ' has-error' : ''}`} style={{ flex: 1 }}>
                <input
                  ref={inputRef}
                  className="input-field"
                  aria-label="Message"
                  aria-invalid={sendError ? true : undefined}
                  aria-describedby={sendError ? 'chat-send-err' : undefined}
                  placeholder="Type a message..."
                  value={draft}
                  maxLength={MAX_LEN}
                  enterKeyHint="send"
                  disabled={msgState !== 'ready'}
                  onChange={(e) => { setDraft(e.target.value); if (sendError) setSendError(null); }}
                />
              </div>
              <button
                type="submit"
                aria-label="Send message"
                disabled={msgState !== 'ready' || !draft.trim()}
                style={{
                  background: !draft.trim() ? 'var(--border-color)' : 'var(--primary-green)', border: 'none', color: '#121212',
                  width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: draft.trim() ? 'pointer' : 'default', flexShrink: 0,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>send</span>
              </button>
            </div>
            <FieldError id="chat-send-err">{sendError}</FieldError>
            {remaining <= 200 && (
              <p className="field-hint" aria-live="polite" style={{ textAlign: 'right' }}>{remaining} characters left</p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
