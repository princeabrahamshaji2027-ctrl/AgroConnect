import React, { useState } from 'react';
import Header from '../components/Header';
import { PostCard } from '../components/Card';
import BottomSheet from '../components/BottomSheet';
import { Button } from '../components/Button';
import InputField from '../components/InputField';
import mockPosts from '../mock/posts.json';
import './pages.css';

export default function Feed({ 
  onNotificationClick, 
  onSearchClick, 
  onProfileClick, 
  onCreatePostClick 
}) {
  const [posts, setPosts] = useState(mockPosts);
  const [selectedPost, setSelectedPost] = useState(null);
  const [newComment, setNewComment] = useState('');

  const handleLike = (id, isLiked) => {
    setPosts(posts.map(p => p.id === id ? { ...p, liked: isLiked, likes: isLiked ? p.likes + 1 : p.likes - 1 } : p));
  };

  const handleBookmark = (id, isBookmarked) => {
    setPosts(posts.map(p => p.id === id ? { ...p, bookmarked: isBookmarked } : p));
  };

  const handleCommentClick = (post) => {
    setSelectedPost(post);
  };

  const handleAddComment = (e) => {
    e.preventDefault();
    if (!newComment.trim() || !selectedPost) return;

    const added = {
      id: `comment_${Date.now()}`,
      userName: 'You',
      userAvatar: 'https://images.unsplash.com/photo-1542435503-956c469947f6?auto=format&fit=crop&q=80&w=100&h=100',
      content: newComment,
      time: 'Just now'
    };

    const updatedPosts = posts.map(p => {
      if (p.id === selectedPost.id) {
        const comments = p.comments ? [...p.comments, added] : [added];
        const updated = { ...p, comments };
        setSelectedPost(updated); // Sync comments inside bottom sheet
        return updated;
      }
      return p;
    });

    setPosts(updatedPosts);
    setNewComment('');
  };

  const rightActions = (
    <>
      <button className="feed-header-icon" onClick={onSearchClick}>
        <span className="material-symbols-outlined">search</span>
      </button>
      <button className="feed-header-icon" onClick={onNotificationClick}>
        <span className="material-symbols-outlined">notifications</span>
      </button>
    </>
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Header showLogo rightActions={rightActions} />
      
      <div className="page-container fade-in">
        {posts.map(post => (
          <PostCard
            key={post.id}
            post={post}
            onLike={handleLike}
            onBookmark={handleBookmark}
            onCommentClick={handleCommentClick}
            onProfileClick={onProfileClick}
          />
        ))}
      </div>

      {/* Comments Bottom Sheet */}
      <BottomSheet isOpen={!!selectedPost} onClose={() => setSelectedPost(null)}>
        {selectedPost && (
          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '75vh', overflow: 'hidden' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>Comments</h3>
            
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
              {selectedPost.comments && selectedPost.comments.length > 0 ? (
                selectedPost.comments.map(c => (
                  <div key={c.id} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <img src={c.userAvatar} alt={c.userName} style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
                    <div style={{ flex: 1, backgroundColor: '#252525', padding: '10px 12px', borderRadius: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '600' }}>{c.userName}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{c.time}</span>
                      </div>
                      <p style={{ fontSize: '13px', color: '#eeeeee', lineHeight: '1.4' }}>{c.content}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '24px 0', fontSize: '14px' }}>
                  No comments yet. Be the first to share your thoughts!
                </div>
              )}
            </div>

            <form onSubmit={handleAddComment} style={{ display: 'flex', gap: '8px', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
              <div style={{ flex: 1 }}>
                <InputField
                  placeholder="Write a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                />
              </div>
              <Button type="submit" style={{ padding: '10px 16px', borderRadius: '16px' }}>
                Post
              </Button>
            </form>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
