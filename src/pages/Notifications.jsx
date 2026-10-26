import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import { ListRowSkeleton, SkeletonGroup, LoadError } from '../components/Skeleton';
import { supabase } from '../supabase';
import './pages.css';

const formatTimeAgo = (dateStr) => {
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

const toItem = (n) => ({
  id: n.id,
  type: n.type,
  message: n.message,
  relatedId: n.related_id,
  read: n.is_read,
  senderName: 'AgroConnect',
  createdAt: n.created_at,
});

export default function Notifications({ onGoBack, onProfileClick, onOpenChat, onOpenBooking }) {
  const [notifications, setNotifications] = useState([]);
  const [loadState, setLoadState] = useState('loading'); // loading | ready | error

  const fetchNotifications = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, message, related_id, is_read, created_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      console.error('Error loading notifications:', error.message);
      setLoadState((s) => (s === 'ready' ? 'ready' : 'error'));
      return;
    }
    setNotifications((data || []).map(toItem));
    setLoadState('ready');
  };

  useEffect(() => {
    fetchNotifications();

    // Realtime: update list when a new notification is inserted
    let channel = null;
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user;
      if (!user) return;
      channel = supabase
        .channel('notifications-realtime')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
          (payload) => {
            if (!payload.new) return;
            setNotifications((prev) => (prev.some((x) => x.id === payload.new.id) ? prev : [toItem(payload.new), ...prev]));
          }
        )
        .subscribe();
    });

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const handleMarkAsRead = async (id) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  };

  const handleMarkAllRead = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', session.user.id).eq('is_read', false);
  };

  const getIcon = (type) => {
    switch (type) {
      case 'like': return 'favorite';
      case 'comment': return 'chat_bubble';
      case 'announcement': return 'campaign';
      case 'report': return 'report';
      case 'booking': return 'event';
      case 'message': return 'chat';
      default: return 'notifications';
    }
  };

  const getIconColor = (type) => {
    switch (type) {
      case 'like': return 'var(--error)';
      case 'comment': return 'var(--primary-green)';
      case 'announcement': return '#FFA726';
      case 'report': return '#FF5A5A';
      case 'booking': return 'var(--primary-green)';
      case 'message': return '#2F80ED';
      default: return 'var(--text-primary)';
    }
  };

  const handleNotificationTap = (n) => {
    if (!n.read) handleMarkAsRead(n.id);
    // related_id holds a booking id for booking notifications and a conversation id for message notifications;
    // both are re-read with the user's own permissions on the screen they open.
    if (n.type === 'message') {
      if (n.relatedId && onOpenChat) onOpenChat({ id: n.relatedId });
      return;
    }
    if (n.type === 'booking') {
      if (n.relatedId && onOpenBooking) onOpenBooking(n.relatedId);
      return;
    }
    if (n.type === 'system') return;
    if (n.relatedId && onProfileClick) {
      onProfileClick(n.relatedId);
    } else if (n.type === 'announcement' && onProfileClick) {
      onProfileClick('user1');
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Header
        title="Notifications"
        showBack={!!onGoBack}
        onBackClick={onGoBack}
        rightActions={
          <button
            onClick={handleMarkAllRead}
            disabled={loadState !== 'ready' || notifications.every((n) => n.read)}
            style={{ background: 'transparent', border: 'none', color: 'var(--primary-green)', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
          >
            Mark all read
          </button>
        }
      />

      <div className="page-container fade-in">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {loadState === 'loading' && (
            <SkeletonGroup label="Loading notifications…" style={{ gap: 0 }}>
              {[0, 1, 2, 3, 4, 5].map((i) => <ListRowSkeleton key={i} />)}
            </SkeletonGroup>
          )}
          {loadState === 'error' && (
            <LoadError message="Could not load notifications. Check your connection." onRetry={() => { setLoadState('loading'); fetchNotifications(); }} />
          )}

          {notifications.map((n) => (
            <div
              key={n.id}
              role="button"
              tabIndex={0}
              onClick={() => handleNotificationTap(n)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleNotificationTap(n); }}
              style={{
                display: 'flex',
                gap: '12px',
                padding: '16px',
                backgroundColor: n.read ? 'var(--bg-card)' : 'rgba(136, 217, 130, 0.08)',
                border: '1px solid',
                borderColor: n.read ? 'var(--border-color)' : 'rgba(136, 217, 130, 0.25)',
                borderRadius: 'var(--border-radius)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                position: 'relative'
              }}
            >
              {/* Unread indicator dot */}
              {!n.read && (
                <div style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--primary-green)'
                }}></div>
              )}

              {/* Notification icon */}
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <span className="material-symbols-outlined" style={{ color: getIconColor(n.type), fontSize: '20px' }}>
                  {getIcon(n.type)}
                </span>
              </div>

              {/* Message & details */}
              <div style={{ flex: 1, paddingRight: '12px' }}>
                <div style={{ fontSize: '13px', lineHeight: '1.4' }}>
                  {!['announcement', 'system', 'booking', 'message'].includes(n.type) && (
                    <strong style={{ color: 'var(--text-primary)' }}>{n.senderName} </strong>
                  )}
                  <span style={{ color: '#eeeeee' }}>{n.message}</span>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginTop: '6px' }}>{formatTimeAgo(n.createdAt)}</span>
              </div>
            </div>
          ))}

          {loadState === 'ready' && notifications.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-secondary)' }}>
              No notifications to display.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
