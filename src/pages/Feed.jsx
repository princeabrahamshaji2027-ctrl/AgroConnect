import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import { PostCard } from '../components/Card';
import BottomSheet from '../components/BottomSheet';
import { Button } from '../components/Button';
import InputField from '../components/InputField';
import { validateRequiredText } from '../utils/validation';
import { PostCardSkeleton, SkeletonGroup, LoadError } from '../components/Skeleton';
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
  onShowToast,
  feedVersion = 0,
  onChooseDistrict
}) {
  const [posts, setPosts] = useState([]);
  const [usersDb, setUsersDb] = useState([]);
  const [connectedUserIds, setConnectedUserIds] = useState(new Set());
  const [currentUserId, setCurrentUserId] = useState(null);
  const [myDistrict, setMyDistrict] = useState(null);
  const [loadState, setLoadState] = useState('loading');   // first load: loading | ready | error
  const [cursor, setCursor] = useState(null);              // last row's { feed_rank, created_at, id }
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

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

  // One feed row (get_feed, migration 20) → the shape PostCard expects.
  const mapRow = (post) => ({
    id: post.id,
    userId: post.user_id,
    userName: post.author_name || 'Anonymous',
    userAvatar: post.author_avatar || '/profile-placeholder.png',
    userRole: post.author_role || 'Farmer',
    content: post.caption,
    image: post.image_path,
    mediaType: post.media_type || 'image',
    videoDuration: post.video_duration_seconds,
    likes: post.like_count || 0,
    commentCount: post.comment_count || 0,
    category: post.category,
    location: post.location,
    district: post.district,
    isLocal: post.feed_rank === 0,
    time: formatTimeAgo(post.created_at),
    liked: !!post.liked_by_me,
    bookmarked: false,
    comments: []
  });
  const PAGE = 20;

  // The server orders the feed: the viewer's own district first (from their saved profile, never from the client),
  // newest first inside each group, in pages that never repeat or skip a post.
  const fetchPosts = async () => {
    try {
      // the saved session is available at once after a relaunch; getUser() needs the network first, and while it
      // had not answered every card (including the user's own) offered "Connect"
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || (await supabase.auth.getUser()).data.user?.id;
      setCurrentUserId(userId);

      const [feedRes, followRes, meRes] = await Promise.all([
        supabase.rpc('get_feed', { p_limit: PAGE, p_after_rank: null, p_after_created_at: null, p_after_id: null }),
        userId ? supabase.from('followers').select('following_id').eq('follower_id', userId) : Promise.resolve({ data: [] }),
        userId ? supabase.from('profiles').select('district').eq('id', userId).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      if (feedRes.error) throw feedRes.error;

      setConnectedUserIds(new Set(followRes.data?.map(r => r.following_id) || []));
      setMyDistrict(meRes.data?.district || null);
      const rows = feedRes.data || [];
      setPosts(rows.map(mapRow));
      const last = rows.at(-1);
      setCursor(last ? { feed_rank: last.feed_rank, created_at: last.created_at, id: last.id } : null);
      setHasMore(rows.length === PAGE);
      setLoadState('ready');
    } catch (err) {
      console.error('Error fetching posts:', err);
      setLoadState(prev => (prev === 'ready' ? 'ready' : 'error'));
      if (onShowToast && loadState === 'ready') onShowToast('Could not refresh the feed. Check your connection.');
    }
  };

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const { data, error } = await supabase.rpc('get_feed', {
      p_limit: PAGE, p_after_rank: cursor.feed_rank, p_after_created_at: cursor.created_at, p_after_id: cursor.id,
    });
    setLoadingMore(false);
    if (error) { if (onShowToast) onShowToast('Could not load more posts. Check your connection.'); return; }
    const rows = data || [];
    setPosts(prev => {
      const seen = new Set(prev.map(p => p.id));
      return [...prev, ...rows.filter(r => !seen.has(r.id)).map(mapRow)];
    });
    const last = rows.at(-1);
    if (last) setCursor({ feed_rank: last.feed_rank, created_at: last.created_at, id: last.id });
    setHasMore(rows.length === PAGE);
  };

  // reload when the user's district changes (district prompt / edit profile)
  useEffect(() => {
    if (feedVersion > 0) fetchPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedVersion]);

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
          username: (p.full_name || '').toLowerCase().replace(/\s+/g, ''),
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
            .then(async ({ data: newPost }) => {
              if (!newPost) return;
              const { data: { session } } = await supabase.auth.getSession();
              const { data: me } = session?.user
                ? await supabase.from('profiles').select('district').eq('id', session.user.id).maybeSingle()
                : { data: null };
              const isLocal = !!me?.district && newPost.district === me.district;
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
                district: newPost.district,
                isLocal,
                time: 'Just now',
                liked: false,
                bookmarked: false,
                comments: []
              };
              // keep the server's order: a local post goes to the top, another district's post to the top of the
              // non-local group (after all local posts)
              setPosts(prev => {
                if (prev.some(p => p.id === formatted.id)) return prev;
                if (isLocal) return [formatted, ...prev];
                const firstOther = prev.findIndex(p => !p.isLocal);
                const at = firstOther === -1 ? prev.length : firstOther;
                return [...prev.slice(0, at), formatted, ...prev.slice(at)];
              });
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
    if (!user) return false;

    const { error } = isLiked
      ? await supabase
          .from('likes')
          .insert({ post_id: id, user_id: user.id })
      : await supabase
          .from('likes')
          .delete()
          .eq('post_id', id)
          .eq('user_id', user.id);

    // Don't let the local count drift from the database (e.g. a duplicate like on double tap).
    if (error) {
      if (onShowToast) onShowToast(`Like failed: ${error.message}`);
      return false;
    }

    setPosts(prev => prev.map(p => p.id === id ? { ...p, liked: isLiked, likes: isLiked ? p.likes + 1 : p.likes - 1 } : p));
    return true;
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
        user_id,
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
      userId: c.user_id,
      userRole: c.profiles?.role,
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
    const commentVal = validateRequiredText(newComment, 'Comment', 1, 1000);
    if (!commentVal.isValid || !selectedPost) return;

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
        user_id,
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
      userId: insertedComment.user_id,
      userRole: insertedComment.profiles?.role,
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

    // RLS silently filters rows it denies, so check that a row was actually removed.
    const { data: deletedRows, error } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId)
      .select('id');

    if (error || !deletedRows?.length) {
      if (onShowToast) onShowToast(`Failed to delete comment: ${error?.message || 'permission denied'}`);
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

    const { data: updatedRows, error } = await supabase
      .from('comments')
      .update({ comment: editCommentText })
      .eq('id', commentId)
      .select('id');

    if (error || !updatedRows?.length) {
      if (onShowToast) onShowToast(`Failed to save comment: ${error?.message || 'permission denied'}`);
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
      if (onShowToast) onShowToast(/fetch|network/i.test(err?.message || '') ? 'No connection. Please try again.' : `Connect action failed: ${err.message}`);
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

        {loadState === 'ready' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 10px' }}>
            {myDistrict ? (
              <span><span className="material-symbols-outlined" style={{ fontSize: '14px', verticalAlign: 'middle', color: 'var(--primary-green)' }}>location_on</span> Posts from {myDistrict} first</span>
            ) : (
              <>
                <span>Choose your district to see local posts first.</span>
                {onChooseDistrict && (
                  <button type="button" onClick={onChooseDistrict}
                    style={{ background: 'transparent', border: '1px solid var(--primary-green)', color: 'var(--primary-green)', borderRadius: '12px', padding: '4px 10px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                    Choose
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {loadState === 'loading' && (
          <SkeletonGroup label="Loading posts…">{[0, 1, 2].map((i) => <PostCardSkeleton key={i} />)}</SkeletonGroup>
        )}
        {loadState === 'error' && (
          <LoadError message="Could not load the community feed. Check your connection." onRetry={() => { setLoadState('loading'); fetchPosts(); }} />
        )}
        {loadState === 'ready' && posts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
            No posts yet. Tap the + button to share the first one.
          </div>
        )}

        {posts.map(post => (
          <div key={post.id}>
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

        {loadState === 'ready' && hasMore && (
          <Button variant="secondary" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load more posts'}
          </Button>
        )}
      </div>

      {/* Comments Bottom Sheet */}
      <BottomSheet isOpen={!!selectedPost} onClose={() => setSelectedPost(null)}>
        {selectedPost && (
          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '78vh', overflow: 'hidden' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '12px', color: 'var(--primary-green)' }}>Comments</h3>
            
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px', paddingRight: '4px' }}>
              {selectedPost.comments && selectedPost.comments.length > 0 ? (
                selectedPost.comments.map(c => {
                  const isCommentOwner = !!currentUserId && c.userId === currentUserId;
                  const commentReplies = c.replies || [];
                  const isVerifiedExpert = c.userRole === 'Expert' || c.userRole === 'Agronomist';
                  
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
                            const isReplyOwner = !!currentUserId && reply.userId === currentUserId;
                            const isReplyExpert = reply.userRole === 'Expert' || reply.userRole === 'Agronomist';
                            
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
