import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import InputField from '../components/InputField';
import { Button } from '../components/Button';
import { PostCard, ProfileCard, CommCard } from '../components/Card';
import { supabase } from '../supabase';
import './pages.css';

export default function Search({ onProfileClick, onPostCommentClick }) {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('posts'); // 'posts' | 'users' | 'communities'
  const [recentSearches, setRecentSearches] = useState(['vermicompost', 'early blight', 'basmati price']);
  const [posts, setPosts] = useState([]);
  const [users, setUsers] = useState([]);
  const [communities, setCommunities] = useState([]);

  const trendingTags = ['organic', 'tomato', 'soilhealth', 'agritech', 'subsidies', 'tractor'];

  useEffect(() => {
    const loadSearchDb = async () => {
      // 1. Fetch posts with profiles
      const { data: postsData } = await supabase
        .from('posts')
        .select(`
          *,
          profiles:user_id (
            full_name,
            profile_image_path,
            role
          )
        `)
        .order('created_at', { ascending: false });

      if (postsData) {
        setPosts(postsData.map(post => ({
          id: post.id,
          userId: post.user_id,
          userName: post.profiles?.full_name || 'Anonymous',
          userAvatar: post.profiles?.profile_image_path || 'https://images.unsplash.com/photo-1542435503-956c469947f6?auto=format&fit=crop&q=80&w=200&h=200',
          userRole: post.profiles?.role || 'Farmer',
          content: post.caption,
          image: post.image_path,
          likes: post.like_count || 0,
          category: post.category,
          location: post.location,
          time: '1d ago',
          liked: false,
          bookmarked: false,
          comments: []
        })));
      }

      // 2. Fetch users
      const { data: usersData } = await supabase
        .from('profiles')
        .select('id, full_name, profile_image_path, role, location');

      if (usersData) {
        setUsers(usersData.map(u => ({
          id: u.id,
          name: u.full_name,
          username: u.full_name.toLowerCase().replace(/\s+/g, ''),
          avatar: u.profile_image_path || 'https://images.unsplash.com/photo-1542435503-956c469947f6?auto=format&fit=crop&q=80&w=200&h=200',
          role: u.role,
          location: u.location || 'Punjab, India'
        })));
      }

      // 3. Fetch communities
      const { data: commsData } = await supabase
        .from('communities')
        .select('*');

      if (commsData) {
        setCommunities(commsData.map(c => ({
          id: c.id,
          name: c.name,
          description: c.description || '',
          category: c.category || 'General',
          avatar: c.image_path || 'https://images.unsplash.com/photo-1530595467537-0b5996c41f2d?auto=format&fit=crop&q=80&w=200&h=200',
          memberCount: c.member_count || 0
        })));
      }
    };

    loadSearchDb();
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (query.trim() && !recentSearches.includes(query.trim())) {
      setRecentSearches([query.trim(), ...recentSearches.slice(0, 4)]);
    }
  };

  const handleClearRecents = () => {
    setRecentSearches([]);
  };

  const filteredPosts = posts.filter(p => 
    p.content.toLowerCase().includes(query.toLowerCase()) ||
    p.category.toLowerCase().includes(query.toLowerCase())
  );

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(query.toLowerCase()) ||
    u.username.toLowerCase().includes(query.toLowerCase()) ||
    u.role.toLowerCase().includes(query.toLowerCase())
  );

  const filteredCommunities = communities.filter(c => 
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
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
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

            {/* 1. Trending Crops */}
            <div>
              <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Trending Crops</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {['Basmati Rice 🌾', 'Desi Cotton 🌸', 'Hybrid Tomato 🍅', 'Yellow Mustard 🌼', 'Sugarcane 🎋'].map((crop) => (
                  <button 
                    key={crop}
                    onClick={() => setQuery(crop.split(' ')[0])}
                    className="chip"
                    style={{ fontSize: '12px', border: '1px solid var(--border-color)' }}
                  >
                    {crop}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Popular Experts */}
            <div>
              <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Popular Experts</h4>
              <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '6px' }}>
                {users.filter(u => u.role === 'Agronomist' || u.role === 'Expert' || u.role === 'Distributor').map((expert) => (
                  <div 
                    key={expert.id} 
                    onClick={() => onProfileClick && onProfileClick(expert.id)}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', flexShrink: 0, cursor: 'pointer', width: '80px' }}
                  >
                    <div style={{ position: 'relative' }}>
                      <img src={expert.avatar} alt="" style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', border: '1.5px solid var(--primary-green)' }} />
                      <span className="material-symbols-outlined" style={{ position: 'absolute', bottom: '-2px', right: '-2px', backgroundColor: 'var(--bg-dark)', color: 'var(--primary-green)', fontSize: '14px', borderRadius: '50%' }}>verified</span>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: '600', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>{expert.name.split(' ')[0]}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Nearby Experts */}
            <div>
              <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Nearby Experts (Ludhiana Region)</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {users.filter(u => u.role === 'Agronomist' || u.role === 'Expert').map((expert, i) => (
                  <div 
                    key={expert.id}
                    onClick={() => onProfileClick && onProfileClick(expert.id)}
                    style={{ display: 'flex', justifycontent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-card)', padding: '12px 16px', borderRadius: '16px', border: '1px solid var(--border-color)', cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <img src={expert.avatar} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          {expert.name}
                          <span className="material-symbols-outlined" style={{ color: 'var(--primary-green)', fontSize: '14px' }}>verified</span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Specialist • {expert.location.split(',')[0]}</div>
                      </div>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--primary-green)', fontWeight: '600' }}>{1.2 + i * 2.4} km away</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 4. Top Content & Articles */}
            <div>
              <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Top Content</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                  { title: 'Subsidies on Micro-Irrigation Kits 2026', readTime: '5 min read', category: 'Government Schemes' },
                  { title: 'Managing Fall Armyworm in Maize Crops', readTime: '8 min read', category: 'Pest Control' }
                ].map((art, i) => (
                  <div key={i} style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '12px 16px', cursor: 'pointer' }}>
                    <span style={{ fontSize: '10px', color: 'var(--primary-green)', fontWeight: '600' }}>{art.category}</span>
                    <h5 style={{ fontSize: '13.5px', fontWeight: '600', margin: '4px 0', color: 'white' }}>{art.title}</h5>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{art.readTime}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 5. Popular Reels */}
            <div>
              <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Popular Reels</h4>
              <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '6px' }}>
                {[
                  { title: 'Drip Irrigation hacks 💧', views: '15k views', img: 'https://images.unsplash.com/photo-1592417817098-8f3d6eb19675?auto=format&fit=crop&q=80&w=200&h=300' },
                  { title: 'Tractor maintenance 🚜', views: '24k views', img: 'https://images.unsplash.com/photo-1530595467537-0b5996c41f2d?auto=format&fit=crop&q=80&w=200&h=300' },
                  { title: 'Organic compost spray 🌿', views: '9k views', img: 'https://images.unsplash.com/photo-1563514223768-45198aeeed77?auto=format&fit=crop&q=80&w=200&h=300' }
                ].map((reel, i) => (
                  <div key={i} style={{ width: '100px', height: '150px', borderRadius: '14px', position: 'relative', overflow: 'hidden', flexShrink: 0, cursor: 'pointer' }}>
                    <img src={reel.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)' }}></div>
                    <div style={{ position: 'absolute', bottom: '8px', left: '8px', right: '8px' }}>
                      <p style={{ fontSize: '9px', fontWeight: '600', color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{reel.title}</p>
                      <span style={{ fontSize: '8px', color: 'var(--text-secondary)' }}>{reel.views}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 6. Popular Posts */}
            <div>
              <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Popular Posts</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {posts.slice(0, 2).map((post) => (
                  <div 
                    key={post.id}
                    onClick={() => {
                      if (onProfileClick) onProfileClick(post.userId);
                    }}
                    style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '12px 16px', display: 'flex', gap: '10px', cursor: 'pointer' }}
                  >
                    <img src={post.userAvatar} alt="" style={{ width: '30px', height: '30px', borderRadius: '50%' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px', fontWeight: '600' }}>{post.userName}</div>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '240px' }}>{post.content}</p>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--primary-green)', fontWeight: '600', alignSelf: 'center' }}>❤️ {post.likes}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 7. Suggested Users */}
            <div>
              <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Suggested Users</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: '32px' }}>
                {users.slice(0, 3).map((sUser) => (
                  <div 
                    key={sUser.id}
                    onClick={() => onProfileClick && onProfileClick(sUser.id)}
                    style={{ display: 'flex', justifycontent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-card)', padding: '12px 16px', borderRadius: '16px', border: '1px solid var(--border-color)', cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <img src={sUser.avatar} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '600' }}>{sUser.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>@{sUser.username}</div>
                      </div>
                    </div>
                    <Button variant="secondary" style={{ padding: '6px 12px', borderRadius: '10px', fontSize: '11px' }}>Connect</Button>
                  </div>
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
