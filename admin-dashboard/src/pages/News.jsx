import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function News() {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchNews = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('news')
        .select('*, profiles:created_by(full_name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNews(data || []);
    } catch (err) {
      console.error('Error fetching news:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
  }, []);

  const handlePublish = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('news').insert({
        title: title.trim(),
        content: content.trim(),
        created_by: user?.id
      });
      if (error) throw error;
      setTitle('');
      setContent('');
      fetchNews();
    } catch (err) {
      alert(err.message || 'Error publishing news');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this news item?')) return;
    const { error } = await supabase.from('news').delete().eq('id', id);
    if (!error) fetchNews();
  };

  return (
    <div className="p-6 pb-24 max-w-[1600px] mx-auto flex flex-col gap-6">
      <div>
        <h1 className="font-headline-xl text-on-surface mb-1">News & Announcements</h1>
        <p className="font-body-sm text-on-surface-variant">Publish news updates visible to all AgroConnect users.</p>
      </div>

      {/* Publish form */}
      <form onSubmit={handlePublish} className="card-bg rounded-xl border border-outline-variant p-6 flex flex-col gap-4">
        <h2 className="text-on-surface font-semibold">Publish New Announcement</h2>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Headline..."
          className="w-full bg-[#171A1D] border border-outline-variant rounded-lg px-4 py-2 text-on-surface text-body-sm focus:outline-none focus:border-primary-container"
          required
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Full announcement text..."
          rows={4}
          className="w-full bg-[#171A1D] border border-outline-variant rounded-lg px-4 py-2 text-on-surface text-body-sm focus:outline-none focus:border-primary-container resize-none"
          required
        />
        <button
          type="submit"
          disabled={submitting}
          className="self-end bg-primary-container text-on-primary-container px-6 py-2 rounded-lg font-label-md hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
        >
          {submitting ? 'Publishing...' : 'Publish'}
        </button>
      </form>

      {/* News list */}
      <div className="card-bg rounded-xl overflow-hidden border border-outline-variant">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <span className="animate-spin h-8 w-8 border-4 border-primary-container border-t-transparent rounded-full" />
          </div>
        ) : news.length === 0 ? (
          <div className="p-8 text-center text-on-surface-variant/50">No news published yet</div>
        ) : (
          <div className="divide-y divide-outline-variant/20">
            {news.map((item) => (
              <div key={item.id} className="p-5 flex justify-between items-start gap-4">
                <div className="flex flex-col gap-1 flex-1">
                  <span className="font-bold text-on-surface">{item.title}</span>
                  <p className="text-on-surface-variant text-body-sm line-clamp-2">{item.content}</p>
                  <span className="text-[10px] text-on-surface-variant/50 mt-1">
                    By {item.profiles?.full_name || 'Admin'} • {new Date(item.created_at).toLocaleDateString()}
                  </span>
                </div>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="bg-error/10 text-error hover:bg-error/20 border border-error/30 px-3 py-1.5 rounded font-label-sm transition-colors cursor-pointer flex-shrink-0"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
