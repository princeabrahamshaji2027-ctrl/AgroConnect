import React from 'react';
import Header from '../components/Header';
import { PostCard } from '../components/Card';
import { Button } from '../components/Button';
import mockUsers from '../mock/users.json';
import mockPosts from '../mock/posts.json';
import './pages.css';

export default function UserProfile({ 
  userId = 'user1', 
  onEditProfileClick, 
  onSettingsClick, 
  onPostCommentClick,
  onProfileClick
}) {
  const user = mockUsers.find(u => u.id === userId) || mockUsers[0];
  const userPosts = mockPosts.filter(p => p.userId === user.id);

  const rightActions = (
    <button 
      className="feed-header-icon" 
      onClick={onSettingsClick}
      aria-label="Settings"
    >
      <span className="material-symbols-outlined">settings</span>
    </button>
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Header title="Profile" rightActions={rightActions} />
      
      <div className="page-container fade-in" style={{ paddingLeft: '0', paddingRight: '0' }}>
        
        {/* User Card info */}
        <div className="profile-header-card">
          <img src={user.avatar} alt={user.name} className="profile-avatar-large" />
          <h2 className="profile-name">{user.name}</h2>
          <p className="profile-username">@{user.username}</p>
          
          <span className="badge-role" style={{ marginBottom: '12px' }}>{user.role}</span>
          
          {user.bio && <p className="profile-bio">{user.bio}</p>}
          
          <div className="profile-stats-row">
            <div className="profile-stat-box">
              <span className="profile-stat-val">{userPosts.length}</span>
              <span className="profile-stat-lbl">Posts</span>
            </div>
            <div className="profile-stat-box">
              <span className="profile-stat-val" style={{ color: 'var(--text-primary)' }}>{user.location}</span>
              <span className="profile-stat-lbl">Location</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', width: '100%', padding: '0 16px' }}>
            <Button 
              variant="primary" 
              onClick={onEditProfileClick} 
              style={{ flex: 1, padding: '10px 16px', borderRadius: '14px', fontSize: '13px' }}
            >
              Edit Profile
            </Button>
            <Button 
              variant="secondary" 
              style={{ flex: 1, padding: '10px 16px', borderRadius: '14px', fontSize: '13px' }}
            >
              Share Profile
            </Button>
          </div>
        </div>

        {/* User Posts list */}
        <div style={{ padding: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '12px' }}>My Posts</h3>
          
          {userPosts.length > 0 ? (
            userPosts.map(post => (
              <PostCard 
                key={post.id} 
                post={post} 
                onCommentClick={onPostCommentClick} 
                onProfileClick={onProfileClick}
              />
            ))
          ) : (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-secondary)' }}>
              No posts written yet. Click the + floating action button to create your first post!
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
