import React, { useState } from 'react';
import Header from '../components/Header';
import InputField from '../components/InputField';
import { PostCard, ProfileCard, CommCard } from '../components/Card';
import mockPosts from '../mock/posts.json';
import mockUsers from '../mock/users.json';
import mockCommunities from '../mock/communities.json';
import './pages.css';

export default function Search({ onProfileClick, onPostCommentClick }) {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('posts'); // 'posts' | 'users' | 'communities'
  const [recentSearches, setRecentSearches] = useState(['vermicompost', 'early blight', 'basmati price']);

  const trendingTags = ['organic', 'tomato', 'soilhealth', 'agritech', 'subsidies', 'tractor'];

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (query.trim() && !recentSearches.includes(query.trim())) {
      setRecentSearches([query.trim(), ...recentSearches.slice(0, 4)]);
    }
  };

  const handleClearRecents = () => {
    setRecentSearches([]);
  };

  const filteredPosts = mockPosts.filter(p => 
    p.content.toLowerCase().includes(query.toLowerCase()) ||
    p.category.toLowerCase().includes(query.toLowerCase()) ||
    p.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase()))
  );

  const filteredUsers = mockUsers.filter(u => 
    u.name.toLowerCase().includes(query.toLowerCase()) ||
    u.username.toLowerCase().includes(query.toLowerCase()) ||
    u.role.toLowerCase().includes(query.toLowerCase())
  );

  const filteredCommunities = mockCommunities.filter(c => 
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    c.description.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Header title="Search" />
      
      <div className="page-container fade-in">
        
        <form onSubmit={handleSearchSubmit} style={{ marginBottom: '16px' }}>
          <InputField
            placeholder="Search posts, users, or topics..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            icon="search"
          />
        </form>

        {!query ? (
          /* Initial search state: Recents & Trendings */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {recentSearches.length > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-secondary)' }}>Recent Searches</h4>
                  <button 
                    onClick={handleClearRecents}
                    style={{ background: 'transparent', border: 'none', color: 'var(--primary-green)', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                  >
                    Clear All
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {recentSearches.map((term, i) => (
                    <div 
                      key={i} 
                      onClick={() => setQuery(term)}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 0', borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--text-muted)' }}>history</span>
                      <span style={{ fontSize: '14px' }}>{term}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '12px' }}>Trending Topics</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {trendingTags.map((tag) => (
                  <button 
                    key={tag}
                    onClick={() => setQuery(tag)}
                    className="chip"
                    style={{ fontSize: '12px' }}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </div>

          </div>
        ) : (
          /* Results state */
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            
            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
              <button 
                onClick={() => setActiveFilter('posts')}
                className={`chip ${activeFilter === 'posts' ? 'active' : ''}`}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                Posts ({filteredPosts.length})
              </button>
              <button 
                onClick={() => setActiveFilter('users')}
                className={`chip ${activeFilter === 'users' ? 'active' : ''}`}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                Users ({filteredUsers.length})
              </button>
              <button 
                onClick={() => setActiveFilter('communities')}
                className={`chip ${activeFilter === 'communities' ? 'active' : ''}`}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                Groups ({filteredCommunities.length})
              </button>
            </div>

            {/* Results list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              
              {activeFilter === 'posts' && (
                filteredPosts.map(post => (
                  <PostCard 
                    key={post.id} 
                    post={post} 
                    onProfileClick={onProfileClick} 
                    onCommentClick={onPostCommentClick} 
                  />
                ))
              )}

              {activeFilter === 'users' && (
                filteredUsers.map(user => (
                  <ProfileCard 
                    key={user.id} 
                    user={user} 
                    onClick={() => onProfileClick && onProfileClick(user.id)} 
                  />
                ))
              )}

              {activeFilter === 'communities' && (
                filteredCommunities.map(comm => (
                  <CommCard 
                    key={comm.id} 
                    community={comm} 
                  />
                ))
              )}

              {((activeFilter === 'posts' && filteredPosts.length === 0) ||
                (activeFilter === 'users' && filteredUsers.length === 0) ||
                (activeFilter === 'communities' && filteredCommunities.length === 0)) && (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-secondary)' }}>
                  No results found. Try search keywords like "organic", "blight", "Ramesh".
                </div>
              )}

            </div>

          </div>
        )}

      </div>
    </div>
  );
}
