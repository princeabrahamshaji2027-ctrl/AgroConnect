import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './components.css';
import Dialog from './Dialog';
import { supabase } from '../supabase';

const REPORT_REASONS = ['Spam or misleading', 'Harmful or dangerous advice', 'Hate or harassment', 'Not about farming', 'Other'];

// ⋯ on a post: the author can delete it; anyone else can report it to the admin (reports table, admin-only to read).
function PostMenu({ post, currentUserId, onDeleted }) {
  const [me, setMe] = useState(currentUserId || null);
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState(null);   // 'delete' | 'report' | 'reported'
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    if (currentUserId) { setMe(currentUserId); return; }
    supabase.auth.getSession().then(({ data: { session } }) => setMe(session?.user?.id || null));
  }, [currentUserId]);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const own = !!me && post.userId === me;

  const doDelete = async () => {
    setBusy(true); setError(null);
    const { data, error: e } = await supabase.from('posts').delete().eq('id', post.id).select('id');
    setBusy(false);
    if (e || !data?.length) { setError(e?.message || 'The post could not be deleted.'); return; }
    setDialog(null);
    onDeleted?.(post.id);
  };
  const doReport = async () => {
    setBusy(true); setError(null);
    const text = details.trim() ? `${reason}: ${details.trim().slice(0, 500)}` : reason;
    const { error: e } = await supabase.from('reports').insert({ reported_by: me, post_id: post.id, reason: text });
    setBusy(false);
    if (e) { setError(e.message); return; }
    setDialog('reported'); setDetails('');
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="post-card-action-btn" aria-label="Post options" aria-haspopup="menu" aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
        <span className="material-symbols-outlined">more_vert</span>
      </button>
      {open && (
        <div role="menu" style={{ position: 'absolute', right: 0, top: '100%', zIndex: 30, minWidth: '170px', backgroundColor: '#1E1E1E',
          border: '1px solid var(--border-color)', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
          {own ? (
            <button role="menuitem" onClick={() => { setOpen(false); setError(null); setDialog('delete'); }}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '12px 14px', background: 'none', border: 'none', color: 'var(--error)', fontSize: '14px', cursor: 'pointer' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>Delete post
            </button>
          ) : (
            <button role="menuitem" disabled={!me} onClick={() => { setOpen(false); setError(null); setDialog('report'); }}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '12px 14px', background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: '14px', cursor: 'pointer' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>flag</span>Report post
            </button>
          )}
        </div>
      )}
      {dialog && createPortal(<>   {/* on <body>: the card's animation would otherwise trap the fixed overlay inside it */}
      <Dialog isOpen={dialog === 'delete'} title="Delete this post?" confirmText={busy ? 'Deleting…' : 'Delete'} confirmDisabled={busy}
        onConfirm={doDelete} onCancel={() => setDialog(null)}>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '10px 0' }}>It is removed for everyone, with its likes and comments. This cannot be undone.</p>
        {error && <p role="alert" style={{ color: 'var(--error)', fontSize: '13px' }}>{error}</p>}
      </Dialog>
      <Dialog isOpen={dialog === 'report'} title="Report this post" confirmText={busy ? 'Sending…' : 'Send report'} confirmDisabled={busy}
        onConfirm={doReport} onCancel={() => setDialog(null)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '10px 0' }}>
          {REPORT_REASONS.map((r) => (
            <label key={r} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
              <input type="radio" name={`report-${post.id}`} checked={reason === r} onChange={() => setReason(r)} />{r}
            </label>
          ))}
          <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={2} maxLength={500} placeholder="More details (optional)"
            aria-label="Report details"
            style={{ padding: '8px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: '#1E1E1E', color: 'var(--text-primary)', resize: 'none' }} />
          {error && <p role="alert" style={{ color: 'var(--error)', fontSize: '13px' }}>{error}</p>}
        </div>
      </Dialog>
      <Dialog isOpen={dialog === 'reported'} title="Thanks for reporting" confirmText="OK" onConfirm={() => setDialog(null)} onCancel={() => setDialog(null)}>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '10px 0' }}>An admin will review this post.</p>
      </Dialog>
      </>, document.body)}
    </div>
  );
}

// One attachment per post (posts.image_path + posts.media_type). Videos get a native player inside the card; a file
// that cannot be loaded shows a placeholder instead of a broken image.
function PostMedia({ src, mediaType }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="post-card-media-error">
        <span className="material-symbols-outlined">{mediaType === 'video' ? 'videocam_off' : 'broken_image'}</span>
        <span>{mediaType === 'video' ? 'Video unavailable' : 'Image unavailable'}</span>
      </div>
    );
  }
  if (mediaType === 'video') {
    return (
      <video
        src={src}
        className="post-card-video"
        controls
        playsInline
        preload="metadata"
        aria-label="Post video"
        onError={() => setFailed(true)}
      />
    );
  }
  return <img src={src} alt="Post Attachment" className="post-card-image" loading="lazy" onError={() => setFailed(true)} />;
}

export function PostCard({ post, onLike, onBookmark, onCommentClick, onProfileClick, onConnectToggle, isConnected = false, currentUserId, onDeleted }) {
  const [removed, setRemoved] = useState(false);
  const [isLiked, setIsLiked] = useState(post.liked);
  const [likesCount, setLikesCount] = useState(post.likes);
  const [isBookmarked, setIsBookmarked] = useState(post.bookmarked);

  const handleLike = async (e) => {
    e.stopPropagation();
    const prevLiked = isLiked;
    const prevCount = likesCount;
    const newLiked = !isLiked;
    setIsLiked(newLiked);
    setLikesCount(newLiked ? likesCount + 1 : likesCount - 1);
    // onLike resolves to false when the write failed; roll back the optimistic update.
    if (onLike && (await onLike(post.id, newLiked)) === false) {
      setIsLiked(prevLiked);
      setLikesCount(prevCount);
    }
  };

  const handleBookmark = (e) => {
    e.stopPropagation();
    const newBookmarked = !isBookmarked;
    setIsBookmarked(newBookmarked);
    if (onBookmark) onBookmark(post.id, newBookmarked);
  };

  if (removed) return null;
  return (
    <div className="card fade-in">
      <div className="post-card-header">
        <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', flex: 1 }} onClick={() => onProfileClick && onProfileClick(post.userId)}>
          <img src={post.userAvatar} alt={post.userName} className="post-card-avatar" />
          <div className="post-card-user-info">
            <div className="post-card-username" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
              <span>{post.userName}</span>
              {((JSON.parse(localStorage.getItem('users_db') || '[]').find(u => u.name === post.userName)?.role === 'Agronomist') || 
                post.userRole === 'Expert' || post.userRole === 'Agronomist' || post.userRole === 'Distributor') && (
                <span className="material-symbols-outlined" style={{ color: 'var(--primary-green)', fontSize: '16px' }}>verified</span>
              )}
              <span className="badge-role">{post.userRole}</span>
            </div>
            <div className="post-card-meta">
              {(() => {
                // place text plus the post's district (set by the server) when the text does not already name it
                const place = [post.location, post.district && !(post.location || '').includes(post.district) ? post.district : null]
                  .filter(Boolean).join(' · ');
                return place ? (
                  <>
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>location_on</span>
                    <span>{place}</span>
                    <span>•</span>
                  </>
                ) : null;
              })()}
              <span>{post.time}</span>
            </div>
          </div>
        </div>
        {onConnectToggle && currentUserId && post.userId !== currentUserId && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onConnectToggle(post.userId);
            }}
            style={{
              padding: '4px 10px',
              borderRadius: '12px',
              fontSize: '11px',
              fontWeight: '600',
              border: isConnected ? '1px solid var(--border-color)' : '1px solid var(--primary-green)',
              backgroundColor: isConnected ? 'rgba(255,255,255,0.08)' : 'rgba(136, 217, 130, 0.15)',
              color: isConnected ? 'var(--text-secondary)' : 'var(--primary-green)',
              cursor: 'pointer',
              marginLeft: '8px',
              marginRight: '4px'
            }}
          >
            {isConnected ? 'Connected ✓' : 'Connect'}
          </button>
        )}
        <PostMenu post={post} currentUserId={currentUserId} onDeleted={(id) => { setRemoved(true); onDeleted?.(id); }} />
      </div>

      <div className="post-card-content">{post.content}</div>

      {post.image && <PostMedia src={post.image} mediaType={post.mediaType} />}

      {post.tags && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {post.tags.map(tag => (
            <span key={tag} style={{ color: 'var(--primary-green)', fontSize: '12px', fontWeight: '500' }}>
              #{tag}
            </span>
          ))}
        </div>
      )}

      <div className="post-card-actions">
        <button 
          onClick={handleLike} 
          className={`post-card-action-btn ${isLiked ? 'liked' : ''}`}
        >
          <span className="material-symbols-outlined fill-icon">{isLiked ? 'favorite' : 'favorite'}</span>
          <span>{likesCount}</span>
        </button>

        <button 
          onClick={() => onCommentClick && onCommentClick(post)} 
          className="post-card-action-btn"
        >
          <span className="material-symbols-outlined">chat_bubble</span>
          <span>{post.comments ? post.comments.length : 0}</span>
        </button>

        <button className="post-card-action-btn">
          <span className="material-symbols-outlined">share</span>
        </button>

        <button 
          onClick={handleBookmark} 
          className={`post-card-action-btn ${isBookmarked ? 'bookmarked' : ''}`}
        >
          <span className="material-symbols-outlined">{isBookmarked ? 'bookmark' : 'bookmark'}</span>
        </button>
      </div>
    </div>
  );
}

export function ProfileCard({ user, onClick }) {
  const isVerified = user.role === 'Agronomist' || user.role === 'Distributor';
  return (
    <div className="card fade-in" style={{ display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer' }} onClick={onClick}>
      <img src={user.avatar} alt={user.name} style={{ width: '56px', height: '56px', borderRadius: '50%', objectFit: 'cover' }} />
      <div style={{ flex: 1 }}>
        <h4 style={{ fontWeight: '600', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          {user.name}
          {isVerified && (
            <span className="material-symbols-outlined" style={{ color: 'var(--primary-green)', fontSize: '16px' }}>verified</span>
          )}
        </h4>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>@{user.username}</p>
        <span className="badge-role" style={{ marginTop: '4px', display: 'inline-block' }}>{user.role}</span>
      </div>
      <span className="material-symbols-outlined" style={{ color: 'var(--text-secondary)' }}>chevron_right</span>
    </div>
  );
}

export function CommCard({ community, onJoinToggle }) {
  const [joined, setJoined] = useState(community.joined);

  const handleJoin = () => {
    const nextJoined = !joined;
    setJoined(nextJoined);
    if (onJoinToggle) onJoinToggle(community.id, nextJoined);
  };

  return (
    <div className="card fade-in" style={{ padding: '0px', overflow: 'hidden' }}>
      <img src={community.image} alt={community.name} style={{ width: '100%', height: '120px', objectFit: 'cover' }} />
      <div style={{ padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <div>
            <h4 style={{ fontSize: '16px', fontWeight: '600' }}>{community.name}</h4>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{community.members.toLocaleString()} members</p>
          </div>
          <button 
            onClick={handleJoin} 
            className={`btn ${joined ? 'btn-secondary' : 'btn-primary'}`} 
            style={{ padding: '6px 14px', fontSize: '12px', borderRadius: '12px' }}
          >
            {joined ? 'Joined' : 'Join'}
          </button>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>{community.description}</p>
      </div>
    </div>
  );
}

export function StatsCard({ title, value, icon, percentage, positive = true }) {
  return (
    <div className="card fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: '1', minWidth: '140px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '500' }}>{title}</span>
        <span className="material-symbols-outlined" style={{ color: 'var(--primary-green)', fontSize: '20px' }}>{icon}</span>
      </div>
      <div style={{ fontSize: '22px', fontWeight: '700', margin: '4px 0' }}>{value}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
        <span 
          className="material-symbols-outlined" 
          style={{ color: positive ? 'var(--primary-green)' : 'var(--error)', fontSize: '14px' }}
        >
          {positive ? 'trending_up' : 'trending_down'}
        </span>
        <span style={{ color: positive ? 'var(--primary-green)' : 'var(--error)', fontWeight: '600' }}>
          {percentage}%
        </span>
        <span style={{ color: 'var(--text-secondary)' }}>vs last week</span>
      </div>
    </div>
  );
}

export function ReportCard({ report, onAction }) {
  return (
    <div className="card fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="badge-role" style={{ backgroundColor: 'rgba(255, 90, 90, 0.15)', color: 'var(--error)' }}>
          Reported {report.reportedType.toUpperCase()}
        </span>
        <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{report.time}</span>
      </div>
      <div>
        <div style={{ fontSize: '15px', fontWeight: '600', marginBottom: '4px' }}>
          Item: <span style={{ color: 'var(--text-primary)' }}>{report.reportedName}</span>
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Reporter: <span style={{ color: 'var(--text-primary)' }}>{report.reporterName}</span>
        </div>
      </div>
      <div style={{ backgroundColor: '#252525', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', borderLeft: '3px solid var(--error)', color: '#eeeeee' }}>
        <strong>Reason:</strong> {report.reason}
      </div>
      <div style={{ display: 'flex', gap: '8px', alignSelf: 'flex-end', marginTop: '4px' }}>
        <button 
          onClick={() => onAction && onAction(report.id, 'reject')}
          className="btn btn-secondary" 
          style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '10px' }}
        >
          Reject
        </button>
        <button 
          onClick={() => onAction && onAction(report.id, 'approve')}
          className="btn btn-primary" 
          style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '10px', backgroundColor: 'var(--error)', color: 'white' }}
        >
          Action
        </button>
      </div>
    </div>
  );
}
