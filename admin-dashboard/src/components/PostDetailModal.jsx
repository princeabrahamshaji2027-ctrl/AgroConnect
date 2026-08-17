import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import defaultAvatar from '../assets/profile-placeholder.png';

export default function PostDetailModal({ postId, onClose, onUserClick, onRefresh }) {
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchPostDetails = async () => {
    if (!postId) return;
    setLoading(true);
    try {
      // Fetch post details
      const { data: postData } = await supabase
        .from('posts')
        .select('*, profiles:user_id(id, full_name, profile_image_path, role)')
        .eq('id', postId)
        .single();

      setPost(postData);

      // Fetch comments for this post
      const { data: commentsData } = await supabase
        .from('comments')
        .select('*, profiles:user_id(id, full_name, profile_image_path)')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      setComments(commentsData || []);
    } catch (err) {
      console.error('Error fetching post details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPostDetails();
  }, [postId]);

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('Delete this comment?')) return;
    try {
      await supabase.from('comments').delete().eq('id', commentId);
      await supabase.from('admin_audit_log').insert({
        admin_id: (await supabase.auth.getUser()).data.user?.id,
        action: 'delete_comment',
        target_table: 'comments',
        target_id: commentId
      });
      fetchPostDetails();
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(`Error deleting comment: ${err.message}`);
    }
  };

  const handleDeletePost = async () => {
    if (!window.confirm('Are you sure you want to delete this post?')) return;
    try {
      await supabase.from('posts').delete().eq('id', postId);
      await supabase.from('admin_audit_log').insert({
        admin_id: (await supabase.auth.getUser()).data.user?.id,
        action: 'delete_post',
        target_table: 'posts',
        target_id: postId
      });
      if (onRefresh) onRefresh();
      onClose();
    } catch (err) {
      alert(`Error deleting post: ${err.message}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="max-w-xl w-full card-bg rounded-2xl border border-outline-variant p-6 flex flex-col gap-5 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center border-b border-outline-variant/30 pb-3">
          <h2 className="font-headline-lg text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-container">article</span>
            <span>Post Details & Comments</span>
          </h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface cursor-pointer">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12">
            <span className="animate-spin h-8 w-8 border-4 border-primary-container border-t-transparent rounded-full" />
          </div>
        ) : !post ? (
          <div className="p-8 text-center text-on-surface-variant">Post not found.</div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Author Bar */}
            <div
              className="flex items-center gap-3 cursor-pointer hover:opacity-85 transition-opacity"
              onClick={() => onUserClick(post.profiles?.id || post.user_id)}
            >
              <img
                src={post.profiles?.profile_image_path || defaultAvatar}
                alt={post.profiles?.full_name}
                className="w-10 h-10 rounded-full object-cover border border-outline-variant"
              />
              <div>
                <span className="font-bold text-on-surface block hover:text-primary transition-colors">
                  {post.profiles?.full_name || 'Anonymous User'}
                </span>
                <span className="text-[11px] text-on-surface-variant uppercase font-bold">
                  {post.profiles?.role || 'Farmer'} &bull; {new Date(post.created_at).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Content */}
            {post.image_path && (
              <img src={post.image_path} alt="Post content" className="w-full h-56 object-cover rounded-xl border border-outline-variant/30" />
            )}
            <p className="text-on-surface text-body-sm leading-relaxed whitespace-pre-wrap">{post.caption}</p>

            {/* Post Actions & Stats */}
            <div className="flex justify-between items-center border-y border-outline-variant/30 py-3">
              <div className="flex gap-4 text-[12px] text-on-surface-variant font-bold">
                <span>👍 {post.like_count || 0} Likes</span>
                <span>💬 {comments.length} Comments</span>
              </div>
              <button
                onClick={handleDeletePost}
                className="bg-error/10 hover:bg-error/20 text-error border border-error/30 px-3 py-1.5 rounded-lg text-body-sm font-semibold transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
                <span>Delete Post</span>
              </button>
            </div>

            {/* Comments List */}
            <div>
              <h4 className="font-headline-lg-mobile text-on-surface font-bold mb-3">Comments ({comments.length})</h4>
              {comments.length === 0 ? (
                <p className="text-body-sm text-on-surface-variant/60 italic">No comments on this post yet.</p>
              ) : (
                <div className="flex flex-col gap-3 max-h-52 overflow-y-auto pr-1">
                  {comments.map(c => (
                    <div key={c.id} className="bg-surface-variant/30 p-3 rounded-xl border border-outline-variant/20 flex justify-between items-start">
                      <div className="flex gap-2.5 items-start">
                        <img
                          src={c.profiles?.profile_image_path || defaultAvatar}
                          alt=""
                          className="w-7 h-7 rounded-full object-cover border border-outline-variant cursor-pointer"
                          onClick={() => onUserClick(c.profiles?.id || c.user_id)}
                        />
                        <div>
                          <span
                            className="font-bold text-on-surface text-[12px] block cursor-pointer hover:text-primary transition-colors"
                            onClick={() => onUserClick(c.profiles?.id || c.user_id)}
                          >
                            {c.profiles?.full_name || 'User'}
                          </span>
                          <p className="text-body-sm text-on-surface text-[13px] mt-0.5">{c.comment}</p>
                          <span className="text-[10px] text-on-surface-variant font-mono block mt-1">
                            {new Date(c.created_at).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteComment(c.id)}
                        className="text-error hover:text-error/80 cursor-pointer p-1"
                        title="Delete comment"
                      >
                        <span className="material-symbols-outlined text-[16px]">close</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
