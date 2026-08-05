import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function Posts() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('posts')
        .select('*, profiles(full_name, role, profile_image_path)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPosts(data || []);
    } catch (err) {
      console.error('Error fetching posts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const handleDeletePost = async (postId) => {
    if (!window.confirm('Are you sure you want to delete this post?')) return;
    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId);

      if (error) throw error;

      // Log audit trail
      await supabase.from('admin_audit_log').insert({
        admin_id: (await supabase.auth.getUser()).data.user?.id,
        action: 'delete_post',
        target_table: 'posts',
        target_id: postId,
        details: { note: 'Deleted due to community standards moderation' }
      });

      fetchPosts();
    } catch (err) {
      alert(err.message || 'Error deleting post');
    }
  };

  return (
    <div className="p-6 pb-24 max-w-[1600px] mx-auto flex flex-col gap-6">
      <div>
        <h1 className="font-headline-xl text-on-surface mb-1">Posts Moderation</h1>
        <p className="font-body-sm text-on-surface-variant">Review community posts, photos, and delete inappropriate content.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <span className="animate-spin h-8 w-8 border-4 border-primary-container border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.length === 0 ? (
            <div className="col-span-full card-bg rounded-xl p-8 text-center text-on-surface-variant/50">No posts in community feed yet</div>
          ) : (
            posts.map((post) => (
              <div key={post.id} className="card-bg rounded-xl border border-outline-variant p-5 flex flex-col justify-between gap-4 relative overflow-hidden group">
                <div className="flex items-center gap-3">
                  <img
                    alt="Author avatar"
                    className="w-10 h-10 rounded-full object-cover border border-outline-variant"
                    src={post.profiles?.profile_image_path || "https://lh3.googleusercontent.com/aida-public/AB6AXuCBppjcEyZbhisQCBybkq6-kIO6Nx43RhZKz7bgZ7ecB5kBxE1VrMLz8MFwq7eH0QK-HXaZQ1R9SndR2NOMV4sBtnIzunCDMwZtv4gyxLkuo3ku2x1vR2rx4r3p8BUZkXqTIG2o34p078QeSEYc9YrxW2B2vcTDoi7aJyS3zngube3F720kKwCA6XLKFyKSbhOawoKFdWeT_7v8XdNvcQjqlSIABpjPDLmWmzlAcOsfWvPmxWfp5bYn"}
                  />
                  <div className="flex flex-col">
                    <span className="font-bold text-on-surface text-body-sm">{post.profiles?.full_name || 'Anonymous'}</span>
                    <span className="text-[10px] text-on-surface-variant uppercase font-bold">{post.profiles?.role || 'Farmer'} &bull; {new Date(post.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="flex-1 flex flex-col gap-3">
                  {post.image_path && (
                    <img
                      alt="Post content"
                      className="w-full h-40 object-cover rounded-lg border border-outline-variant/30"
                      src={post.image_path}
                    />
                  )}
                  <p className="text-on-surface text-body-sm leading-relaxed whitespace-pre-wrap">{post.caption}</p>
                </div>

                <div className="border-t border-outline-variant/30 pt-3 flex justify-between items-center mt-2">
                  <div className="flex items-center gap-4 text-on-surface-variant text-[12px] font-bold">
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[16px] text-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>thumb_up</span>
                      <span>{post.like_count || 0}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[16px] text-[#a074c4]" style={{ fontVariationSettings: "'FILL' 1" }}>chat</span>
                      <span>{post.comment_count || 0}</span>
                    </span>
                    <span className="text-[10px] bg-[#1a211b] border border-outline-variant/20 px-2 py-0.5 rounded uppercase text-on-surface-variant">
                      {post.category || 'General'}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDeletePost(post.id)}
                    className="bg-error/10 hover:bg-error/20 text-error border border-error/30 p-2 rounded-lg transition-colors flex items-center justify-center cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
