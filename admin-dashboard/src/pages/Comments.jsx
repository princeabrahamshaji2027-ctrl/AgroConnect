import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function Comments() {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchComments = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('comments')
        .select('*, profiles(full_name, profile_image_path), posts(caption)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setComments(data || []);
    } catch (err) {
      console.error('Error fetching comments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComments();
  }, []);

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('Are you sure you want to delete this comment?')) return;
    try {
      const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;

      // Log audit trail
      await supabase.from('admin_audit_log').insert({
        admin_id: (await supabase.auth.getUser()).data.user?.id,
        action: 'delete_comment',
        target_table: 'comments',
        target_id: commentId,
        details: { note: 'Deleted due to offensive behavior/spam' }
      });

      fetchComments();
    } catch (err) {
      alert(err.message || 'Error deleting comment');
    }
  };

  return (
    <div className="p-6 pb-24 max-w-[1600px] mx-auto flex flex-col gap-6">
      <div>
        <h1 className="font-headline-xl text-on-surface mb-1">Comments Moderation</h1>
        <p className="font-body-sm text-on-surface-variant">Monitor and remove abusive or spam comments across community posts.</p>
      </div>

      <div className="card-bg rounded-xl overflow-hidden border border-outline-variant">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <span className="animate-spin h-8 w-8 border-4 border-primary-container border-t-transparent rounded-full" />
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant/30 text-on-surface-variant text-[11px] font-bold uppercase tracking-wider bg-surface-container">
                <th className="p-4">User</th>
                <th className="p-4">Comment</th>
                <th className="p-4">Post Context</th>
                <th className="p-4">Created At</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-body-sm divide-y divide-outline-variant/20">
              {comments.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-on-surface-variant/50">No comments found</td>
                </tr>
              ) : (
                comments.map((comment) => (
                  <tr key={comment.id} className="hover:bg-surface-variant/20 transition-colors">
                    <td className="p-4 flex items-center gap-3">
                      <img
                        alt="User avatar"
                        className="w-8 h-8 rounded-full object-cover border border-outline-variant"
                        src={comment.profiles?.profile_image_path || "https://lh3.googleusercontent.com/aida-public/AB6AXuCBppjcEyZbhisQCBybkq6-kIO6Nx43RhZKz7bgZ7ecB5kBxE1VrMLz8MFwq7eH0QK-HXaZQ1R9SndR2NOMV4sBtnIzunCDMwZtv4gyxLkuo3ku2x1vR2rx4r3p8BUZkXqTIG2o34p078QeSEYc9YrxW2B2vcTDoi7aJyS3zngube3F720kKwCA6XLKFyKSbhOawoKFdWeT_7v8XdNvcQjqlSIABpjPDLmWmzlAcOsfWvPmxWfp5bYn"}
                      />
                      <span className="font-bold text-on-surface">{comment.profiles?.full_name || 'Anonymous'}</span>
                    </td>
                    <td className="p-4 text-on-surface max-w-[300px] leading-relaxed">{comment.comment}</td>
                    <td className="p-4 text-on-surface-variant max-w-[200px] truncate">
                      {comment.posts?.caption || '(Deleted Post)'}
                    </td>
                    <td className="p-4 text-on-surface-variant font-mono text-[12px]">
                      {new Date(comment.created_at).toLocaleString()}
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => handleDeleteComment(comment.id)}
                        className="bg-error/10 hover:bg-error/20 text-error border border-error/30 px-3 py-1.5 rounded font-label-sm transition-colors cursor-pointer"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
