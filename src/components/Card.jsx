import React, { useState } from 'react';
import './components.css';

export function PostCard({ post, onLike, onBookmark, onCommentClick, onProfileClick }) {
  const [isLiked, setIsLiked] = useState(post.liked);
  const [likesCount, setLikesCount] = useState(post.likes);
  const [isBookmarked, setIsBookmarked] = useState(post.bookmarked);

  const handleLike = (e) => {
    e.stopPropagation();
    const newLiked = !isLiked;
    setIsLiked(newLiked);
    setLikesCount(newLiked ? likesCount + 1 : likesCount - 1);
    if (onLike) onLike(post.id, newLiked);
  };

  const handleBookmark = (e) => {
    e.stopPropagation();
    const newBookmarked = !isBookmarked;
    setIsBookmarked(newBookmarked);
    if (onBookmark) onBookmark(post.id, newBookmarked);
  };

  return (
    <div className="card fade-in">
      <div className="post-card-header">
        <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => onProfileClick && onProfileClick(post.userId)}>
          <img src={post.userAvatar} alt={post.userName} className="post-card-avatar" />
          <div className="post-card-user-info">
            <div className="post-card-username">
              {post.userName} <span className="badge-role">{post.userRole}</span>
            </div>
            <div className="post-card-meta">
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>location_on</span>
              <span>{post.location}</span>
              <span>•</span>
              <span>{post.time}</span>
            </div>
          </div>
        </div>
        <button className="post-card-action-btn">
          <span className="material-symbols-outlined">more_vert</span>
        </button>
      </div>

      <div className="post-card-content">{post.content}</div>

      {post.image && (
        <img src={post.image} alt="Post Attachment" className="post-card-image" />
      )}

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
  return (
    <div className="card fade-in" style={{ display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer' }} onClick={onClick}>
      <img src={user.avatar} alt={user.name} style={{ width: '56px', height: '56px', borderRadius: '50%', objectFit: 'cover' }} />
      <div style={{ flex: 1 }}>
        <h4 style={{ fontWeight: '600', fontSize: '15px' }}>{user.name}</h4>
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
