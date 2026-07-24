import React, { useState } from 'react';
import Header from '../components/Header';
import { CommCard } from '../components/Card';
import InputField from '../components/InputField';
import Dialog from '../components/Dialog';
import { Button } from '../components/Button';
import mockCommunities from '../mock/communities.json';
import './pages.css';

export default function Community() {
  const [communities, setCommunities] = useState(mockCommunities);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newCommName, setNewCommName] = useState('');
  const [newCommDesc, setNewCommDesc] = useState('');

  const handleJoinToggle = (id, isJoined) => {
    setCommunities(communities.map(c => c.id === id ? { ...c, joined: isJoined, members: isJoined ? c.members + 1 : c.members - 1 } : c));
  };

  const handleCreateCommunity = () => {
    if (!newCommName.trim()) return;

    const added = {
      id: `comm_${Date.now()}`,
      name: newCommName,
      members: 1,
      description: newCommDesc || 'No description provided.',
      category: 'General',
      image: 'https://images.unsplash.com/photo-1592417817098-8f3d6eb19675?auto=format&fit=crop&q=80&w=300&h=200',
      joined: true
    };

    setCommunities([added, ...communities]);
    setIsCreateOpen(false);
    setNewCommName('');
    setNewCommDesc('');
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
