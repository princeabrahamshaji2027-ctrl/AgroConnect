import React, { useState, useEffect, useRef } from 'react';
import Header from '../components/Header';
import InputField from '../components/InputField';
import { Button } from '../components/Button';
import { supabase } from '../supabase';
import './pages.css';

const formatTimeAgo = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
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

export default function Chat({ onNavigateToBooking, onProfileClick }) {
  const [currentUserId, setCurrentUserId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const realtimeChannelRef = useRef(null);

  // ─── Fetch current user & conversations ────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);
      await fetchConversations(user.id);
    };
    init();
  }, []);

  const fetchConversations = async (uid) => {
    setLoading(true);
    try {
      // Fetch conversations where this user is user_one or user_two
      const { data, error } = await supabase
        .from('conversations')
        .select(`
          id,
          user_one,
          user_two,
          last_message_at,
          messages (
            content,
            created_at,
            sender_id
          )
        `)
        .or(`user_one.eq.${uid},user_two.eq.${uid}`)
        .order('last_message_at', { ascending: false });

      if (error) throw error;

      // For each conversation, fetch the other participant's profile
      const enriched = await Promise.all((data || []).map(async (conv) => {
        const otherUserId = conv.user_one === uid ? conv.user_two : conv.user_one;
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, full_name, profile_image_path')
          .eq('id', otherUserId)
          .single();

        // Get the last message from the messages array
        const sortedMessages = (conv.messages || []).sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at)
        );
        const lastMsg = sortedMessages[0];

        return {
          id: conv.id,
          otherUserId,
          name: profile?.full_name || 'User',
          avatar: profile?.profile_image_path || '/profile-placeholder.png',
          lastMsg: lastMsg?.content || 'Say hi!',
          lastTime: lastMsg ? formatTimeAgo(lastMsg.created_at) : '',
        };
      }));

      setConversations(enriched);
    } catch (err) {
      console.error('Error fetching conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  // ─── Open conversation thread ───────────────────────────────────────────
  const openConversation = async (conv) => {
    setActiveConv(conv);
    await fetchMessages(conv.id);

    // Subscribe to realtime messages for this conversation
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
    }
    const channel = supabase
      .channel(`chat-${conv.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conv.id}` },
        (payload) => {
          setMessages(prev => [...prev, payload.new]);
        }
      )
      .subscribe();
    realtimeChannelRef.current = channel;
  };

  const fetchMessages = async (convId) => {
    const { data, error } = await supabase
      .from('messages')
      .select('id, content, sender_id, created_at, is_read, message_type, metadata')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });

    if (!error) setMessages(data || []);
  };

  // Cleanup realtime on unmount or when leaving thread
  useEffect(() => {
    return () => {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
      }
    };
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // ─── Send message ──────────────────────────────────────────────────────
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMsg.trim() || !activeConv || !currentUserId || sending) return;

    setSending(true);
    const msgContent = newMsg.trim();
    setNewMsg('');

    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          conversation_id: activeConv.id,
          sender_id: currentUserId,
          content: msgContent,
          is_read: false,
        });
      if (error) throw error;

      // Update last_message_at on the conversation
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', activeConv.id);

    } catch (err) {
      console.error('Failed to send message:', err);
      setNewMsg(msgContent); // Restore on error
    } finally {
      setSending(false);
    }
  };

  const handleBack = () => {
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }
    setActiveConv(null);
    setMessages([]);
    if (currentUserId) fetchConversations(currentUserId);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {!activeConv ? (
        /* ── Conversation List ─────────────────────────── */
        <>
          <Header title="Messages" />
          <div className="page-container fade-in">
            {loading ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-secondary)' }}>
                <span className="material-symbols-outlined" style={{ animation: 'spin 1.5s infinite linear', fontSize: '28px', color: 'var(--primary-green)' }}>progress_activity</span>
                <p style={{ marginTop: '8px', fontSize: '13px' }}>Loading conversations...</p>
              </div>
            ) : conversations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-secondary)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '48px', color: 'var(--border-color)', display: 'block', marginBottom: '12px' }}>chat_bubble</span>
                <p style={{ fontSize: '14px', fontWeight: '600' }}>No messages yet</p>
                <p style={{ fontSize: '12px', marginTop: '6px' }}>Start a conversation by visiting a user's profile.</p>
              </div>
            ) : (
              <div className="chat-thread-list">
                {conversations.map(conv => (
                  <div
                    key={conv.id}
                    className="chat-thread-item"
                    onClick={() => openConversation(conv)}
                  >
                    <img
                      src={conv.avatar}
                      alt={conv.name}
                      className="chat-thread-avatar"
                      onClick={(e) => { if (onProfileClick && conv.otherUserId) { e.stopPropagation(); onProfileClick(conv.otherUserId); } }}
                    />
                    <div className="chat-thread-details">
                      <div className="chat-thread-name-row">
                        <span className="chat-thread-name">{conv.name}</span>
                        <span className="chat-thread-time">{conv.lastTime}</span>
                      </div>
                      <p className="chat-thread-msg">{conv.lastMsg}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        /* ── Active Chat Thread ────────────────────────── */
        <>
          <Header
            title={activeConv.name}
            showBack
            onBackClick={handleBack}
            rightActions={
              <img
                src={activeConv.avatar}
                alt={activeConv.name}
                onClick={() => onProfileClick && activeConv.otherUserId && onProfileClick(activeConv.otherUserId)}
                style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', cursor: 'pointer' }}
              />
            }
          />

          <div className="page-container fade-in" style={{ paddingBottom: '76px', display: 'flex', flexDirection: 'column' }}>
            <div className="chat-messages-area">
              {messages.map(m => {
                const isCancellation = m.message_type === 'cancellation_reschedule' || (m.metadata && m.metadata.offered_slots);

                if (isCancellation) {
                  const meta = m.metadata || {};
                  const offered = meta.offered_slots || [];
                  return (
                    <div
                      key={m.id}
                      className={`chat-bubble ${m.sender_id === currentUserId ? 'sent' : 'received'}`}
                      style={{
                        width: '88%',
                        maxWidth: '320px',
                        backgroundColor: '#1E1E1E',
                        border: '1.5px solid var(--error)',
                        borderRadius: '16px',
                        padding: '14px',
                        color: 'var(--text-primary)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--error)', fontWeight: '700', fontSize: '13px', marginBottom: '8px' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>event_busy</span>
                        <span>Meeting Cancelled by {meta.expert_name || 'Expert'}</span>
                      </div>

                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', backgroundColor: '#262626', padding: '8px 10px', borderRadius: '8px', marginBottom: '10px', lineHeight: '1.4' }}>
                        <strong style={{ color: 'var(--text-primary)' }}>Reason:</strong> {meta.cancellation_reason || m.content}
                      </div>

                      {offered.length > 0 && (
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--primary-green)', marginBottom: '8px' }}>
                            📅 Select an offered date/time to reschedule:
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {offered.map((slot, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  if (onNavigateToBooking) {
                                    onNavigateToBooking({
                                      expertId: meta.expert_id,
                                      date: slot.date,
                                      time: slot.time
                                    });
                                  }
                                }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justify: 'space-between',
                                  padding: '8px 12px',
                                  borderRadius: '10px',
                                  backgroundColor: 'rgba(136, 217, 130, 0.12)',
                                  border: '1px solid var(--primary-green)',
                                  color: 'var(--primary-green)',
                                  fontSize: '12px',
                                  fontWeight: '700',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease',
                                  textAlign: 'left'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>schedule</span>
                                  <span>{slot.date} • {formatTime12h(slot.time)}</span>
                                </div>
                                <span style={{ fontSize: '11px', textDecoration: 'underline' }}>Book Slot →</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <span style={{ fontSize: '10px', opacity: 0.6, alignSelf: 'flex-end', display: 'block', marginTop: '8px', textAlign: 'right' }}>
                        {formatTimeAgo(m.created_at)}
                      </span>
                    </div>
                  );
                }

                return (
                  <div
                    key={m.id}
                    className={`chat-bubble ${m.sender_id === currentUserId ? 'sent' : 'received'}`}
                  >
                    <div>{m.content}</div>
                    <span style={{ fontSize: '10px', opacity: 0.6, alignSelf: 'flex-end', display: 'block', marginTop: '4px', textAlign: 'right' }}>
                      {formatTimeAgo(m.created_at)}
                    </span>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input */}
            <form
              onSubmit={handleSendMessage}
              style={{
                position: 'absolute',
                bottom: `calc(var(--bottom-nav-height) + var(--safe-bottom) + 8px)`,
                left: '16px',
                right: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'var(--bg-dark)'
              }}
            >
              <div style={{ flex: 1 }}>
                <InputField
                  placeholder="Type a message..."
                  value={newMsg}
                  onChange={(e) => setNewMsg(e.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={sending || !newMsg.trim()}
                style={{
                  background: sending ? 'var(--border-color)' : 'var(--primary-green)',
                  border: 'none',
                  color: '#121212',
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: sending ? 'default' : 'pointer',
                  flexShrink: 0,
                  transition: 'background 0.2s ease',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                  {sending ? 'hourglass_top' : 'send'}
                </span>
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
