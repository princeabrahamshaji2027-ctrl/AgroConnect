import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function Reviews() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('reviews')
        .select(`
          id,
          rating,
          comment,
          created_at,
          reviewer:reviewer_id (
            id,
            full_name,
            profile_image_path
          ),
          experts:expert_id (
            id,
            profiles:user_id (
              full_name,
              profile_image_path
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReviews(data || []);
    } catch (err) {
      console.error('Error fetching reviews:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, []);

  return (
    <div className="p-6 pb-24 max-w-[1600px] mx-auto flex flex-col gap-6">
      <div>
        <h1 className="font-headline-xl text-on-surface mb-1">Consultation Reviews</h1>
        <p className="font-body-sm text-on-surface-variant">Monitor ratings and feedback submitted by farmers for expert consultation sessions.</p>
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
                <th className="p-4">Farmer / Reviewer</th>
                <th className="p-4">Expert</th>
                <th className="p-4">Rating</th>
                <th className="p-4">Review Comment</th>
                <th className="p-4">Submitted At</th>
              </tr>
            </thead>
            <tbody className="text-body-sm divide-y divide-outline-variant/20">
              {reviews.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-on-surface-variant/50">No consultation reviews found</td>
                </tr>
              ) : (
                reviews.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-variant/20 transition-colors">
                    <td className="p-4 flex items-center gap-3">
                      <img
                        alt="Reviewer avatar"
                        className="w-8 h-8 rounded-full object-cover border border-outline-variant"
                        src={r.reviewer?.profile_image_path || '/profile-placeholder.png'}
                      />
                      <span className="font-bold text-on-surface">{r.reviewer?.full_name || 'Farmer'}</span>
                    </td>
                    <td className="p-4 font-bold text-on-surface">
                      {r.experts?.profiles?.full_name || 'Expert'}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1 text-[#FFA726] font-bold text-[13px]">
                        <span className="material-symbols-outlined text-[16px]">star</span>
                        <span>{r.rating} / 5</span>
                      </div>
                    </td>
                    <td className="p-4 text-on-surface max-w-[350px] leading-relaxed">
                      {r.comment || <span className="text-on-surface-variant/50 italic">No text feedback provided</span>}
                    </td>
                    <td className="p-4 text-on-surface-variant font-mono text-[12px]">
                      {new Date(r.created_at).toLocaleString()}
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
