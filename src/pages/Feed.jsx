import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import { PostCard } from '../components/Card';
import BottomSheet from '../components/BottomSheet';
import { Button } from '../components/Button';
import InputField from '../components/InputField';
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

export default function Feed({ 
  onNotificationClick, 
  onSearchClick, 
  onProfileClick, 
  onCreatePostClick,
  onPeaAIClick,
  onShowToast
}) {
  const [posts, setPosts] = useState([]);
  const [usersDb, setUsersDb] = useState([]);
  const [connectedUserIds, setConnectedUserIds] = useState(new Set());
  const [currentUserId, setCurrentUserId] = useState(null);

  // Pull to refresh simulation states
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [startY, setStartY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Comments state
  const [selectedPost, setSelectedPost] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [replyToCommentId, setReplyToCommentId] = useState(null);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editCommentText, setEditCommentText] = useState('');
  const [expandedReplies, setExpandedReplies] = useState({}); // { commentId: boolean }

  // Mentions state
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');

  const fetchPosts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;
      setCurrentUserId(userId);

      let likedPostIds = new Set();
      if (userId) {
        const { data: likedRows } = await supabase
          .from('likes')
          .select('post_id')
          .eq('user_id', userId);
        likedPostIds = new Set(likedRows?.map(r => r.post_id) || []);

        const { data: followRows } = await supabase
          .from('followers')
          .select('following_id')
          .eq('follower_id', userId);
        setConnectedUserIds(new Set(followRows?.map(r => r.following_id) || []));
      }

      const { data: postsData, error } = await supabase
        .from('posts')
        .select(`
          *,
          profiles:user_id (
            full_name,
            profile_image_path,
            role
          )
        `)
        .eq('status', 'Approved')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formatted = (postsData || []).map(post => ({
        id: post.id,
        userId: post.user_id,
        userName: post.profiles?.full_name || 'Anonymous',
        userAvatar: post.profiles?.profile_image_path || '/profile-placeholder.png',
        userRole: post.profiles?.role || 'Farmer',
        content: post.caption,
        image: post.image_path,
        mediaType: post.media_type || 'image',
        videoDuration: post.video_duration_seconds,
        likes: post.like_count || 0,
        commentCount: post.comment_count || 0,
        category: post.category,
        location: post.location,
        time: formatTimeAgo(post.created_at),
        liked: likedPostIds.has(post.id),
        bookmarked: false,
        comments: []
      }));

      setPosts(formatted);
    } catch (err) {
      console.error('Error fetching posts:', err);
    }
  };

  useEffect(() => {
    fetchPosts();

    const fetchUsers = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, profile_image_path, role');
      if (data) {
        setUsersDb(data.map(p => ({
          id: p.id,
          name: p.full_name,
          username: p.full_name.toLowerCase().replace(/\s+/g, ''),
          avatar: p.profile_image_path || '/profile-placeholder.png',
          role: p.role
        })));
      }
    };
    fetchUsers();

    // ── Realtime: auto-append new approved posts ──
    const channel = supabase
      .channel('feed-posts-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts', filter: 'status=eq.Approved' },
        (payload) => {
          // Fetch the new post with its profile join so we have the author data
          supabase
            .from('posts')
            .select('*, profiles:user_id(full_name, profile_image_path, role)')
            .eq('id', payload.new.id)
            .single()
            .then(({ data: newPost }) => {
              if (!newPost) return;
              const formatted = {
                id: newPost.id,
                userId: newPost.user_id,
                userName: newPost.profiles?.full_name || 'Anonymous',
                userAvatar: newPost.profiles?.profile_image_path || '/profile-placeholder.png',
                userRole: newPost.profiles?.role || 'Farmer',
                content: newPost.caption,
                image: newPost.image_path,
                mediaType: newPost.media_type || 'image',
                videoDuration: newPost.video_duration_seconds,
                likes: newPost.like_count || 0,
                commentCount: newPost.comment_count || 0,
                category: newPost.category,
                location: newPost.location,
                time: 'Just now',
                liked: false,
                bookmarked: false,
                comments: []
              };
              setPosts(prev => [formatted, ...prev]);
            });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleLike = async (id, isLiked) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (isLiked) {
      await supabase
        .from('likes')
        .insert({ post_id: id, user_id: user.id });
    } else {
      await supabase
        .from('likes')
        .delete()
        .eq('post_id', id)
        .eq('user_id', user.id);
    }

    setPosts(prev => prev.map(p => p.id === id ? { ...p, liked: isLiked, likes: isLiked ? p.likes + 1 : p.likes - 1 } : p));
  };

  const handleBookmark = (id, isBookmarked) => {
    setPosts(prev => prev.map(p => p.id === id ? { ...p, bookmarked: isBookmarked } : p));
  };

  const handleCommentClick = async (post) => {
    setSelectedPost(post);
    setReplyToCommentId(null);
    setEditingCommentId(null);

    const { data: commentsData } = await supabase
      .from('comments')
      .select(`
        id,
        comment,
        created_at,
        profiles:user_id (
          full_name,
          profile_image_path,
          role
        )
      `)
      .eq('post_id', post.id)
      .order('created_at', { ascending: true });

    const formattedComments = (commentsData || []).map(c => ({
      id: c.id,
      userName: c.profiles?.full_name || 'Anonymous',
      userAvatar: c.profiles?.profile_image_path || '/profile-placeholder.png',
      content: c.comment,
      time: formatTimeAgo(c.created_at),
      likes: 0,
      dislikes: 0,
      liked: false,
      disliked: false,
      replies: []
    }));

    const updatedPost = { ...post, comments: formattedComments };
    setSelectedPost(updatedPost);
    setPosts(prev => prev.map(p => p.id === post.id ? updatedPost : p));
  };

  // Pull to Refresh Touch Handlers
  const handleTouchStart = (e) => {
    const container = e.currentTarget;
    if (container.scrollTop === 0) {
      setStartY(e.touches[0].pageY);
      setIsDragging(true);
    }
  };

  const handleTouchMove = (e) => {
    if (!isDragging) return;
    const currentY = e.touches[0].pageY;
    const diff = currentY - startY;
    if (diff > 0) {
      // Apply drag tension
      setPullDistance(Math.min(diff * 0.4, 80));
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (pullDistance > 50) {
      setIsRefreshing(true);
      setPullDistance(60);
      // Real fetch — not a simulation
      fetchPosts().then(() => {
        setIsRefreshing(false);
        setPullDistance(0);
        if (onShowToast) {
          onShowToast('🔄 Feed refreshed!');
        }
      });
    } else {
      setPullDistance(0);
    }
  };

  // Pull to Refresh Mouse Handlers (for Web Browser convenience)
  const handleMouseDown = (e) => {
    const container = e.currentTarget;
    if (container.scrollTop === 0) {
      setStartY(e.pageY);
      setIsDragging(true);
    }
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const diff = e.pageY - startY;
    if (diff > 0) {
      setPullDistance(Math.min(diff * 0.4, 80));
    }
  };

  const handleMouseUp = () => {
    handleTouchEnd();
  };

  // Mentions trigger check
  const handleCommentInputChange = (val) => {
    setNewComment(val);
    const lastWord = val.split(' ').pop();
    if (lastWord.startsWith('@')) {
      setShowMentionSuggestions(true);
      setMentionQuery(lastWord.substring(1));
    } else {
      setShowMentionSuggestions(false);
    }
  };

  const selectMention = (username) => {
    const words = newComment.split(' ');
    words.pop(); // Remove the typed @username
    words.push(`@${username}`);
    setNewComment(words.join(' ') + ' ');
    setShowMentionSuggestions(false);
  };

  // Comment Actions
  const handleAddCommentSubmit = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || !selectedPost) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: insertedComment, error } = await supabase
      .from('comments')
      .insert({
        post_id: selectedPost.id,
        user_id: user.id,
        comment: newComment
      })
      .select(`
        id,
        comment,
        created_at,
        profiles:user_id (
          full_name,
          profile_image_path,
          role
        )
      `)
      .single();

    if (error) {
      if (onShowToast) onShowToast(`Failed to add comment: ${error.message}`);
      return;
    }

    const addedItem = {
      id: insertedComment.id,
      userName: insertedComment.profiles?.full_name || 'You',
      userAvatar: insertedComment.profiles?.profile_image_path || '/profile-placeholder.png',
      content: insertedComment.comment,
      time: 'Just now',
      likes: 0,
      dislikes: 0,
      liked: false,
      disliked: false,
      replies: []
    };

    const updatedComments = [...(selectedPost.comments || []), addedItem];
    const updatedPost = { ...selectedPost, comments: updatedComments };
    setSelectedPost(updatedPost);
    setPosts(prev => prev.map(p => p.id === selectedPost.id ? updatedPost : p));
    setNewComment('');
    setReplyToCommentId(null);
    setShowMentionSuggestions(false);
  };

  const handleLikeComment = (commentId, parentId = null) => {
    if (!selectedPost) return;
    const comments = (selectedPost.comments || []).map(c => {
      if (c.id === commentId) {
        return { ...c, liked: !c.liked, likes: !c.liked ? c.likes + 1 : c.likes - 1 };
      }
      return c;
    });
    const updatedPost = { ...selectedPost, comments };
    setSelectedPost(updatedPost);
    setPosts(prev => prev.map(p => p.id === selectedPost.id ? updatedPost : p));
  };

  const handleDislikeComment = (commentId, parentId = null) => {
    if (!selectedPost) return;
    const comments = (selectedPost.comments || []).map(c => {
      if (c.id === commentId) {
        return { ...c, disliked: !c.disliked, dislikes: !c.disliked ? c.dislikes + 1 : c.dislikes - 1 };
      }
      return c;
    });
    const updatedPost = { ...selectedPost, comments };
    setSelectedPost(updatedPost);
    setPosts(prev => prev.map(p => p.id === selectedPost.id ? updatedPost : p));
  };

  const handleDeleteComment = async (commentId, parentId = null) => {
    if (!window.confirm('Delete comment permanently?')) return;

    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId);

    if (error) {
      if (onShowToast) onShowToast(`Failed to delete comment: ${error.message}`);
      return;
    }

    if (selectedPost) {
      const updatedComments = (selectedPost.comments || []).filter(c => c.id !== commentId);
      const updatedPost = { ...selectedPost, comments: updatedComments };
      setSelectedPost(updatedPost);
      setPosts(prev => prev.map(p => p.id === selectedPost.id ? updatedPost : p));
    }
    if (onShowToast) onShowToast('🗑 Comment deleted.');
  };

  const handleEditCommentSave = async (commentId, parentId = null) => {
    if (!editCommentText.trim()) return;

    const { error } = await supabase
      .from('comments')
      .update({ comment: editCommentText })
      .eq('id', commentId);

    if (error) {
      if (onShowToast) onShowToast(`Failed to save comment: ${error.message}`);
      return;
    }

    if (selectedPost) {
      const updatedComments = (selectedPost.comments || []).map(c => c.id === commentId ? { ...c, content: editCommentText } : c);
      const updatedPost = { ...selectedPost, comments: updatedComments };
      setSelectedPost(updatedPost);
      setPosts(prev => prev.map(p => p.id === selectedPost.id ? updatedPost : p));
    }
    setEditingCommentId(null);
    setEditCommentText('');
  };

  const toggleRepliesVisibility = (commentId) => {
    setExpandedReplies(prev => ({
      ...prev,
      [commentId]: !prev[commentId]
    }));
  };

  const rightActions = (
    <>
      <button className="feed-header-icon" onClick={onPeaAIClick} style={{ display: 'flex', marginRight: '6px' }}>
        <span className="material-symbols-outlined" style={{ color: 'var(--primary-green)' }}>eco</span>
      </button>
      <button className="feed-header-icon" onClick={onNotificationClick}>
        <span className="material-symbols-outlined">notifications</span>
      </button>
    </>
  );

  const handleConnectToggle = async (targetUserId) => {
    if (!currentUserId || !targetUserId) return;
    try {
      if (connectedUserIds.has(targetUserId)) {
        const { error } = await supabase
          .from('followers')
          .delete()
          .eq('follower_id', currentUserId)
          .eq('following_id', targetUserId);
        if (error) throw error;
        setConnectedUserIds(prev => {
          const next = new Set(prev);
          next.delete(targetUserId);
          return next;
        });
        if (onShowToast) onShowToast('Disconnected.');
      } else {
        const { error } = await supabase
          .from('followers')
          .insert({ follower_id: currentUserId, following_id: targetUserId });
        if (error) throw error;
        setConnectedUserIds(prev => new Set([...prev, targetUserId]));
        if (onShowToast) onShowToast('🤝 Connected!');
      }
    } catch (err) {
      alert(`Connect action failed: ${err.message}`);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Header showLogo onPeaAIClick={onPeaAIClick} rightActions={rightActions} />
      
      {/* Scrollable feed container with Pull to Refresh triggers */}
      <div 
        className="page-container fade-in" 
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{ overflowY: 'auto', position: 'relative' }}
      >
        {/* Loading Spinner Pull Indicator */}
        {(pullDistance > 0 || isRefreshing) && (
          <div style={{
            height: `${isRefreshing ? 60 : pullDistance}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            transition: isRefreshing ? 'none' : 'height 0.2s ease',
            color: 'var(--primary-green)',
            gap: '8px',
            marginBottom: '8px'
          }}>
            <span className="material-symbols-outlined" style={{ animation: 'spin 1.5s infinite linear', fontSize: '22px' }}>
              progress_activity
            </span>
            <span style={{ fontSize: '12px', fontWeight: '700' }}>
              {isRefreshing ? 'Updating community feed...' : 'Swipe down to refresh'}
            </span>
          </div>
        )}

        {posts.map(post => (
          <div key={post.id}>
            {post.mediaType === 'video' && post.image && (
              <div style={{ margin: '0 16px 4px 16px', borderRadius: '12px', overflow: 'hidden', backgroundColor: '#000' }}>
                <video
                  src={post.image}
                  controls
                  preload="metadata"
                  style={{ width: '100%', maxHeight: '320px', display: 'block', objectFit: 'cover' }}
                />
              </div>
            )}
            <PostCard
              post={post}
              onLike={handleLike}
              onBookmark={handleBookmark}
              onCommentClick={handleCommentClick}
              onProfileClick={onProfileClick}
              onConnectToggle={handleConnectToggle}
              isConnected={connectedUserIds.has(post.userId)}
              currentUserId={currentUserId}
            />
          </div>
        ))}
      </div>

      {/* Comments Bottom Sheet */}
      <BottomSheet isOpen={!!selectedPost} onClose={() => setSelectedPost(null)}>
        {selectedPost && (
          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '78vh', overflow: 'hidden' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '12px', color: 'var(--primary-green)' }}>Comments</h3>
            
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px', paddingRight: '4px' }}>
              {selectedPost.comments && selectedPost.comments.length > 0 ? (
                selectedPost.comments.map(c => {
                  const isCommentOwner = c.userName === 'You' || c.userName === 'Ramesh Kumar';
                  const commentReplies = c.replies || [];
                  const isVerifiedExpert = usersDb.find(u => u.name === c.userName)?.role === 'Agronomist';
                  
                  return (
                    <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      
                      {/* Top level comment */}
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                        <img src={c.userAvatar} alt="" style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }} />
                        <div style={{ flex: 1, backgroundColor: '#202020', padding: '10px 12px', borderRadius: '14px', border: '1px solid var(--border-color)' }}>
                          
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ fontSize: '13px', fontWeight: '600' }}>{c.userName}</span>
                              {isVerifiedExpert && (
                                <span className="material-symbols-outlined" style={{ color: 'var(--primary-green)', fontSize: '14px' }}>verified</span>
                              )}
                            </div>
                            <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{c.time}</span>
                          </div>
                          
                          {editingCommentId === c.id ? (
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '6px' }}>
                              <input 
                                value={editCommentText}
                                onChange={(e) => setEditCommentText(e.target.value)}
                                className="input-field"
                                style={{ backgroundColor: '#1E1E1E', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--primary-green)', color: 'white', fontSize: '13px' }}
                              />
                              <Button onClick={() => handleEditCommentSave(c.id)} variant="primary" style={{ padding: '6px 10px', fontSize: '11px', borderRadius: '8px' }}>Save</Button>
                              <Button onClick={() => setEditingCommentId(null)} variant="text" style={{ padding: '6px 10px', fontSize: '11px' }}>X</Button>
                            </div>
                          ) : (
                            <p style={{ fontSize: '13px', color: '#eeeeee', lineHeight: '1.4' }}>{c.content}</p>
                          )}

                          {/* Action links */}
                          <div style={{ display: 'flex', gap: '14px', marginTop: '8px', alignItems: 'center', fontSize: '11px', color: 'var(--text-secondary)' }}>
                            
                            {/* Like comment button */}
                            <button 
                              onClick={() => handleLikeComment(c.id)}
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', color: c.liked ? 'var(--primary-green)' : 'var(--text-secondary)' }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>thumb_up</span>
                              <span>{c.likes || 0}</span>
                            </button>

                            {/* Dislike comment button */}
                            <button 
                              onClick={() => handleDislikeComment(c.id)}
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', color: c.disliked ? 'var(--error)' : 'var(--text-secondary)' }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>thumb_down</span>
                              <span>{c.dislikes || 0}</span>
                            </button>

                            {/* Reply link */}
                            <span 
                              onClick={() => setReplyToCommentId(c.id)}
                              style={{ cursor: 'pointer', fontWeight: '600' }}
                            >
                              Reply
                            </span>

                            {/* Edit own comment */}
                            {isCommentOwner && (
                              <span 
                                onClick={() => {
                                  setEditingCommentId(c.id);
                                  setEditCommentText(c.content);
                                }}
                                style={{ cursor: 'pointer', color: 'var(--primary-green)' }}
                              >
                                Edit
                              </span>
                            )}

                            {/* Delete own comment */}
                            {isCommentOwner && (
                              <span 
                                onClick={() => handleDeleteComment(c.id)}
                                style={{ cursor: 'pointer', color: 'var(--error)' }}
                              >
                                Delete
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Nested Replies threads */}
                      {commentReplies.length > 0 && (
                        <div style={{ paddingLeft: '38px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <button 
                            onClick={() => toggleRepliesVisibility(c.id)}
                            style={{ background: 'transparent', border: 'none', color: 'var(--primary-green)', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', alignSelf: 'flex-start', fontWeight: '700' }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                              {expandedReplies[c.id] ? 'expand_less' : 'expand_more'}
                            </span>
                            <span>{expandedReplies[c.id] ? 'Hide Replies' : `Show Replies (${commentReplies.length})`}</span>
                          </button>

                          {expandedReplies[c.id] && commentReplies.map(reply => {
                            const isReplyOwner = reply.userName === 'You' || reply.userName === 'Ramesh Kumar';
                            const isReplyExpert = usersDb.find(u => u.name === reply.userName)?.role === 'Agronomist';
                            
                            return (
                              <div key={reply.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }} className="fade-in">
                                <img src={reply.userAvatar} alt="" style={{ width: '22px', height: '22px', borderRadius: '50%', objectFit: 'cover' }} />
                                <div style={{ flex: 1, backgroundColor: '#1A1A1A', padding: '8px 10px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                                  
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                      <span style={{ fontSize: '12px', fontWeight: '600' }}>{reply.userName}</span>
                                      {isReplyExpert && (
                                        <span className="material-symbols-outlined" style={{ color: 'var(--primary-green)', fontSize: '12px' }}>verified</span>
                                      )}
                                    </div>
                                    <span style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>{reply.time}</span>
                                  </div>

                                  {editingCommentId === reply.id ? (
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px' }}>
                                      <input 
                                        value={editCommentText}
                                        onChange={(e) => setEditCommentText(e.target.value)}
                                        className="input-field"
                                        style={{ backgroundColor: '#202020', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--primary-green)', color: 'white', fontSize: '12px' }}
                                      />
                                      <Button onClick={() => handleEditCommentSave(reply.id, c.id)} variant="primary" style={{ padding: '4px 8px', fontSize: '10px', borderRadius: '6px' }}>Save</Button>
                                      <Button onClick={() => setEditingCommentId(null)} variant="text" style={{ padding: '4px 8px', fontSize: '10px' }}>X</Button>
                                    </div>
                                  ) : (
                                    <p style={{ fontSize: '12px', color: '#eeeeee', lineHeight: '1.4' }}>{reply.content}</p>
                                  )}

                                  <div style={{ display: 'flex', gap: '12px', marginTop: '6px', alignItems: 'center', fontSize: '10px', color: 'var(--text-secondary)' }}>
                                    <button 
                                      onClick={() => handleLikeComment(reply.id, c.id)}
                                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px', color: reply.liked ? 'var(--primary-green)' : 'var(--text-secondary)' }}
                                    >
                                      <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>thumb_up</span>
                                      <span>{reply.likes || 0}</span>
                                    </button>

                                    <button 
                                      onClick={() => handleDislikeComment(reply.id, c.id)}
                                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px', color: reply.disliked ? 'var(--error)' : 'var(--text-secondary)' }}
                                    >
                                      <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>thumb_down</span>
                                      <span>{reply.dislikes || 0}</span>
                                    </button>

                                    {isReplyOwner && (
                                      <span 
                                        onClick={() => {
                                          setEditingCommentId(reply.id);
                                          setEditCommentText(reply.content);
                                        }}
                                        style={{ cursor: 'pointer', color: 'var(--primary-green)' }}
                                      >
                                        Edit
                                      </span>
                                    )}

                                    {isReplyOwner && (
                                      <span 
                                        onClick={() => handleDeleteComment(reply.id, c.id)}
                                        style={{ cursor: 'pointer', color: 'var(--error)' }}
                                      >
                                        Delete
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '24px 0', fontSize: '13px' }}>
                  No comments yet. Be the first to share your thoughts!
                </div>
              )}
            </div>

            {/* Input field wrapper */}
            <div style={{ position: 'relative' }}>
              {/* Mentions Autocomplete suggestions */}
              {showMentionSuggestions && (
                <div style={{
                  position: 'absolute',
                  bottom: '54px',
                  left: 0,
                  right: 0,
                  backgroundColor: '#2A2A2A',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  maxHeight: '120px',
                  overflowY: 'auto',
                  zIndex: 250,
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: '0 -4px 12px rgba(0,0,0,0.4)'
                }}>
                  {usersDb
                    .filter(u => u.username.toLowerCase().includes(mentionQuery.toLowerCase()))
                    .map(u => (
                      <div 
                        key={u.id}
                        onClick={() => selectMention(u.username)}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #333' }}
                      >
                        <img src={u.avatar} alt="" style={{ width: '20px', height: '20px', borderRadius: '50%' }} />
                        <span style={{ fontSize: '12px', fontWeight: '600' }}>{u.name}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>@{u.username}</span>
                      </div>
                    ))}
                </div>
              )}

              {replyToCommentId && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', backgroundColor: 'rgba(136, 217, 130, 0.08)', borderRadius: '8px', marginBottom: '8px', fontSize: '11px', color: 'var(--primary-green)', fontWeight: '600' }}>
                  <span>Replying to {selectedPost.comments.find(c => c.id === replyToCommentId)?.userName}'s comment</span>
                  <span onClick={() => setReplyToCommentId(null)} style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}>Cancel</span>
                </div>
              )}

              <form onSubmit={handleAddCommentSubmit} style={{ display: 'flex', gap: '8px', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                <div style={{ flex: 1 }}>
                  <InputField
                    placeholder="Write a comment... (use @ to tag users)"
                    value={newComment}
                    onChange={(e) => handleCommentInputChange(e.target.value)}
                  />
                </div>
                <Button type="submit" style={{ padding: '10px 16px', borderRadius: '16px' }}>
                  Post
                </Button>
              </form>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
