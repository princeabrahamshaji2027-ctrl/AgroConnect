import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import { CommCard } from '../components/Card';
import InputField from '../components/InputField';
import Dialog from '../components/Dialog';
import { Button } from '../components/Button';
import { supabase } from '../supabase';
import './pages.css';

export default function Community() {
  const [communities, setCommunities] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newCommName, setNewCommName] = useState('');
  const [newCommDesc, setNewCommDesc] = useState('');

  const fetchCommunities = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      let joinedSet = new Set();
      if (user) {
        const { data: joinedRows } = await supabase
          .from('community_members')
          .select('community_id')
          .eq('user_id', user.id);
        joinedSet = new Set(joinedRows?.map(r => r.community_id) || []);
      }

      const { data: commsData } = await supabase
        .from('communities')
        .select('*');

      if (commsData) {
        setCommunities(commsData.map(c => ({
          id: c.id,
          name: c.name,
          members: c.member_count || 0,
          description: c.description || '',
          category: c.category || 'General',
          image: c.image_path || 'https://images.unsplash.com/photo-1592417817098-8f3d6eb19675?auto=format&fit=crop&q=80&w=300&h=200',
          joined: joinedSet.has(c.id)
        })));
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchCommunities();
  }, []);

  const handleJoinToggle = async (id, isJoined) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (isJoined) {
      await supabase
        .from('community_members')
        .insert({ community_id: id, user_id: user.id, role: 'Member' });
    } else {
      await supabase
        .from('community_members')
        .delete()
        .eq('community_id', id)
        .eq('user_id', user.id);
    }

    setCommunities(communities.map(c => c.id === id ? { ...c, joined: isJoined, members: isJoined ? c.members + 1 : c.members - 1 } : c));
  };

  const handleCreateCommunity = async () => {
    if (!newCommName.trim()) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: inserted, error } = await supabase
      .from('communities')
      .insert({
        name: newCommName,
        description: newCommDesc,
        category: 'General',
        image_path: 'https://images.unsplash.com/photo-1592417817098-8f3d6eb19675?auto=format&fit=crop&q=80&w=300&h=200'
      })
      .select()
      .single();

    if (error) {
      alert(`Failed to create group: ${error.message}`);
      return;
    }

    await supabase
      .from('community_members')
      .insert({ community_id: inserted.id, user_id: user.id, role: 'Admin' });

    setIsCreateOpen(false);
    setNewCommName('');
    setNewCommDesc('');
    fetchCommunities();
  };

  const filtered = communities.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Header title="Communities" />
      
      <div className="page-container fade-in">
        
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ flex: 1 }}>
            <InputField
              placeholder="Search communities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              icon="search"
            />
          </div>
          <button 
            className="btn btn-primary" 
            onClick={() => setIsCreateOpen(true)}
            style={{ padding: '12px 14px', borderRadius: '16px' }}
            title="Create Community"
          >
            <span className="material-symbols-outlined">add</span>
          </button>
        </div>

        <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '12px' }}>Suggested Groups</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map(comm => (
            <CommCard
              key={comm.id}
              community={comm}
              onJoinToggle={handleJoinToggle}
            />
          ))}
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-secondary)' }}>
              No groups found matching your search.
            </div>
          )}
        </div>

      </div>

      <Dialog
        isOpen={isCreateOpen}
        title="Create Community"
        confirmText="Create"
        onConfirm={handleCreateCommunity}
        onCancel={() => setIsCreateOpen(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '16px 0' }}>
          <InputField
            label="Group Name"
            placeholder="e.g. Rice Cultivation Experts"
            value={newCommName}
            onChange={(e) => setNewCommName(e.target.value)}
            required
          />
          <div className="form-group">
            <label className="form-label">Description</label>
            <div className="input-container" style={{ padding: '8px 16px' }}>
              <textarea
                className="input-field"
                rows="3"
                value={newCommDesc}
                onChange={(e) => setNewCommDesc(e.target.value)}
                placeholder="What is this group about?"
                style={{ resize: 'none', height: '60px' }}
              />
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
