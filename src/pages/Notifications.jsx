import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
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

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);

  const fetchNotifications = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: notifsData } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (notifsData) {
        setNotifications(notifsData.map(n => ({
          id: n.id,
          type: n.type,
          message: n.message,
          read: n.is_read,
          senderName: 'AgroConnect',
          time: formatTimeAgo(n.created_at)
        })));
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchNotifications();

    // Realtime: update list when a new notification is inserted
    let channel = null;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      channel = supabase
        .channel('notifications-realtime')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
          (payload) => {
            if (!payload.new) return;
            const n = payload.new;
            setNotifications(prev => [{
              id: n.id,
              type: n.type,
              message: n.message,
              read: n.is_read,
              senderName: 'AgroConnect',
              time: 'Just now'
            }, ...prev]);
          }
        )
        .subscribe();
    });

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const handleMarkAsRead = async (id) => {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);
    setNotifications(notifications.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const handleMarkAllRead = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id);
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  };

  const getIcon = (type) => {
    switch (type) {
      case 'like': return 'favorite';
      case 'comment': return 'chat_bubble';
      case 'announcement': return 'campaign';
      case 'report': return 'report';
      default: return 'notifications';
    }
  };

  const getIconColor = (type) => {
    switch (type) {
      case 'like': return 'var(--error)';
      case 'comment': return 'var(--primary-green)';
      case 'announcement': return '#FFA726';
      case 'report': return '#FF5A5A';
      default: return 'var(--text-primary)';
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Header 
        title="Notifications" 
        rightActions={
          <button 
            onClick={handleMarkAllRead}
            style={{ background: 'transparent', border: 'none', color: 'var(--primary-green)', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
          >
            Mark all read
          </button>
        }
      />
      
      <div className="page-container fade-in">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {notifications.map((n) => (
            <div 
              key={n.id}
              onClick={() => handleMarkAsRead(n.id)}
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
                  {n.type !== 'announcement' && n.type !== 'system' && (
                    <strong style={{ color: 'var(--text-primary)' }}>{n.senderName} </strong>
                  )}
                  <span style={{ color: '#eeeeee' }}>{n.message}</span>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginTop: '6px' }}>{n.time}</span>
              </div>
            </div>
          ))}

          {notifications.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-secondary)' }}>
              No notifications to display.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
