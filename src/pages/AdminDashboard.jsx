import React, { useState } from 'react';
import Header from '../components/Header';
import InputField from '../components/InputField';
import { Button } from '../components/Button';
import { StatsCard, ReportCard } from '../components/Card';
import Dialog from '../components/Dialog';
import mockStats from '../mock/adminStats.json';
import mockUsersList from '../mock/users.json';
import mockPostsList from '../mock/posts.json';
import './pages.css';

export default function AdminDashboard({ onLogout }) {
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'posts' | 'users' | 'reports' | 'categories' | 'notifications' | 'analytics' | 'account'
  const [showNavMenu, setShowNavMenu] = useState(false);
  
  // States to manage mock databases in-memory
  const [users, setUsers] = useState(mockUsersList);
  const [posts, setPosts] = useState(mockPostsList);
  const [reports, setReports] = useState(mockStats.recentReports);
  const [stats, setStats] = useState(mockStats.summary);
  const [categories, setCategories] = useState([
    { id: 'cat1', name: 'Organic Farming', active: true },
    { id: 'cat2', name: 'Pest Control', active: true },
    { id: 'cat3', name: 'Agri Tech', active: true },
    { id: 'cat4', name: 'Market Prices', active: false }
  ]);

  // Modals & form inputs
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [announcementText, setAnnouncementText] = useState('');
  const [announceEmergency, setAnnounceEmergency] = useState(false);
  
  const [previewPost, setPreviewPost] = useState(null);
  const [newCatName, setNewCatName] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Notifications display inside admin
  const showToast = (msg) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(''), 2500);
  };

  // Admin handlers
  const handleTogglePin = (id) => {
    setPosts(posts.map(p => p.id === id ? { ...p, pinned: !p.pinned } : p));
    showToast('Post pin status updated!');
  };

  const handleToggleHide = (id) => {
    setPosts(posts.map(p => p.id === id ? { ...p, hidden: !p.hidden } : p));
    showToast('Post visibility toggled!');
  };

  const handleDeletePost = (id) => {
    setPosts(posts.filter(p => p.id !== id));
    showToast('Post deleted successfully!');
  };

  const handleToggleRole = (id, role) => {
    setUsers(users.map(u => u.id === id ? { ...u, role } : u));
    showToast(`User role updated to ${role}!`);
  };

  const handleUserStatus = (id, status) => {
    setUsers(users.map(u => u.id === id ? { ...u, status } : u));
    showToast(`User account status: ${status}!`);
  };

  const handleReportAction = (id, action) => {
    if (action === 'approve') {
      const rep = reports.find(r => r.id === id);
      showToast(`Action taken: Approved report. Deleted item: ${rep.reportedName}`);
      if (rep.reportedType === 'post') {
        setPosts(posts.filter(p => p.content !== rep.reportedName));
      }
    } else {
      showToast('Report rejected.');
    }
    setReports(reports.filter(r => r.id !== id));
    setStats({ ...stats, pendingReports: stats.pendingReports - 1 });
  };

  const handleAddCategory = (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setCategories([...categories, { id: `cat_${Date.now()}`, name: newCatName, active: true }]);
    setNewCatName('');
    showToast('Category created!');
  };

  const handleToggleCategory = (id) => {
    setCategories(categories.map(c => c.id === id ? { ...c, active: !c.active } : c));
  };

  const handleSendAnnouncement = (e) => {
    e.preventDefault();
    if (!announcementText.trim()) return;
    showToast(announceEmergency ? '🚨 Emergency Announcement Broadcasted!' : 'Announcement Sent to users.');
    setAnnouncementText('');
    setAnnounceEmergency(false);
  };

  // Nav Items definition
  const menuItems = [
    { id: 'dashboard', label: 'Overview', icon: 'dashboard' },
    { id: 'posts', label: 'Manage Posts', icon: 'post' },
    { id: 'users', label: 'Manage Users', icon: 'group' },
    { id: 'reports', label: 'Reports', icon: 'report' },
    { id: 'categories', label: 'Categories', icon: 'category' },
    { id: 'notifications', label: 'Announcements', icon: 'campaign' },
    { id: 'analytics', label: 'Analytics', icon: 'analytics' },
    { id: 'account', label: 'Admin Account', icon: 'manage_accounts' }
  ];

  const activeLabel = menuItems.find(m => m.id === activeTab)?.label || 'Dashboard';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      
      {/* Toast Alert notification */}
      {successMessage && (
        <div style={{
          position: 'absolute',
          top: '70px',
          left: '24px',
          right: '24px',
          backgroundColor: 'var(--primary-green)',
          color: '#121212',
          padding: '12px 16px',
          borderRadius: '12px',
          fontWeight: '600',
          fontSize: '13px',
          textAlign: 'center',
          zIndex: 1000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          animation: 'slideUp 0.2s ease-out'
        }}>
          {successMessage}
        </div>
      )}

      {/* Admin Panel Header */}
      <Header 
        title={`Admin: ${activeLabel}`} 
        rightActions={
          <button 
            className="feed-header-icon" 
            onClick={() => setShowNavMenu(!showNavMenu)}
            aria-label="Toggle navigation menu"
          >
            <span className="material-symbols-outlined">{showNavMenu ? 'close' : 'menu'}</span>
          </button>
        }
      />

      {/* Navigation Sub-menu overlay */}
      {showNavMenu && (
        <div 
          onClick={() => setShowNavMenu(false)}
          style={{
            position: 'absolute',
            top: 'var(--header-height)',
            left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            zIndex: 150,
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--bg-card)',
              borderBottom: '1px solid var(--border-color)',
              padding: '12px 0',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {menuItems.map((item) => (
              <div
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setShowNavMenu(false);
                  setSearchQuery('');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '14px 20px',
                  color: activeTab === item.id ? 'var(--primary-green)' : 'var(--text-primary)',
                  backgroundColor: activeTab === item.id ? 'rgba(136, 217, 130, 0.08)' : 'transparent',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '14px'
                }}
              >
                <span className="material-symbols-outlined">{item.icon}</span>
                <span>{item.label}</span>
              </div>
            ))}
            <div 
              onClick={onLogout}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '14px 20px',
                color: 'var(--error)',
                borderTop: '1px solid var(--border-color)',
                marginTop: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '14px'
              }}
            >
              <span className="material-symbols-outlined">logout</span>
              <span>Log Out</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Admin Content scroll panel */}
      <div className="page-container fade-in" style={{ paddingBottom: '32px' }}>
        
        {/* ==================== 1. OVERVIEW TAB ==================== */}
        {activeTab === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="admin-grid">
              <StatsCard title="Total Members" value={stats.totalUsers.toLocaleString()} icon="group" percentage={stats.userGrowth} />
              <StatsCard title="Daily Active" value={stats.activeToday.toLocaleString()} icon="bolt" percentage={stats.activeGrowth} />
              <StatsCard title="Total Posts" value={stats.totalPosts.toLocaleString()} icon="article" percentage={stats.postsGrowth} />
              <StatsCard title="Reports Open" value={stats.pendingReports} icon="flag" percentage={stats.reportsGrowth} positive={false} />
            </div>

            {/* Quick action grid */}
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '12px', color: 'var(--text-secondary)' }}>Quick Actions</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <Button variant="secondary" onClick={() => setActiveTab('notifications')} icon="campaign" style={{ padding: '10px', fontSize: '13px', borderRadius: '12px' }}>
                  Broadcast Announcement
                </Button>
                <Button variant="secondary" onClick={() => setActiveTab('reports')} icon="flag" style={{ padding: '10px', fontSize: '13px', borderRadius: '12px', borderColor: 'var(--error)', color: 'var(--error)' }}>
                  Review Open Reports
                </Button>
              </div>
            </div>

            {/* Recent users section */}
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '12px', color: 'var(--text-secondary)' }}>Recent Users</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {users.slice(0, 3).map((u) => (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: 'var(--bg-card)', padding: '12px', borderRadius: '14px', border: '1px solid var(--border-color)' }}>
                    <img src={u.avatar} alt={u.name} style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: '600' }}>{u.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>@{u.username} • {u.role}</div>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--primary-green)', fontWeight: '600' }}>New</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ==================== 2. MANAGE POSTS ==================== */}
        {activeTab === 'posts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <InputField
              placeholder="Search posts by contents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              icon="search"
            />
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
              {posts
                .filter(p => p.content.toLowerCase().includes(searchQuery.toLowerCase()))
                .map(post => (
                  <div 
                    key={post.id} 
                    style={{ 
                      backgroundColor: 'var(--bg-card)', 
                      border: '1px solid var(--border-color)', 
                      borderRadius: '16px', 
                      padding: '16px', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '12px',
                      opacity: post.hidden ? 0.5 : 1
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <img src={post.userAvatar} alt="" style={{ width: '28px', height: '28px', borderRadius: '50%' }} />
                        <span style={{ fontSize: '13px', fontWeight: '600' }}>{post.userName}</span>
                        {post.pinned && <span className="badge-role" style={{ backgroundColor: 'rgba(136, 217, 130, 0.15)', color: 'var(--primary-green)' }}>Pinned</span>}
                        {post.hidden && <span className="badge-role" style={{ backgroundColor: 'rgba(255, 255, 255, 0.15)', color: 'white' }}>Hidden</span>}
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{post.time}</span>
                    </div>
                    
                    <p style={{ fontSize: '13px', lineBreak: 'anywhere', color: '#eeeeee', maxHeight: '60px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {post.content}
                    </p>

                    <div style={{ display: 'flex', gap: '8px', alignSelf: 'flex-end' }}>
                      <button onClick={() => setPreviewPost(post)} className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '11px', borderRadius: '10px' }}>Preview</button>
                      <button onClick={() => handleTogglePin(post.id)} className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '11px', borderRadius: '10px' }}>{post.pinned ? 'Unpin' : 'Pin'}</button>
                      <button onClick={() => handleToggleHide(post.id)} className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '11px', borderRadius: '10px' }}>{post.hidden ? 'Show' : 'Hide'}</button>
                      <button onClick={() => handleDeletePost(post.id)} className="btn btn-primary" style={{ padding: '6px 10px', fontSize: '11px', borderRadius: '10px', backgroundColor: 'var(--error)', color: 'white' }}>Delete</button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ==================== 3. MANAGE USERS ==================== */}
        {activeTab === 'users' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <InputField
              placeholder="Search users by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              icon="search"
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
              {users
                .filter(u => u.name.toLowerCase().includes(searchQuery.toLowerCase()) || u.username.toLowerCase().includes(searchQuery.toLowerCase()))
                .map(user => (
                  <div 
                    key={user.id} 
                    style={{ 
                      backgroundColor: 'var(--bg-card)', 
                      border: '1px solid var(--border-color)', 
                      borderRadius: '16px', 
                      padding: '16px', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '12px' 
                    }}
                  >
                    <img src={user.avatar} alt="" style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: '600' }}>{user.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>@{user.username} • {user.role}</div>
                      {user.status && <div style={{ fontSize: '10px', color: user.status === 'suspended' ? 'var(--error)' : 'var(--primary-green)', fontWeight: '600' }}>{user.status.toUpperCase()}</div>}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <select 
                        value={user.role}
                        onChange={(e) => handleToggleRole(user.id, e.target.value)}
                        style={{ backgroundColor: '#252525', color: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '4px', fontSize: '11px' }}
                      >
                        <option value="Farmer">Farmer</option>
                        <option value="Agronomist">Agronomist</option>
                        <option value="Distributor">Distributor</option>
                        <option value="Administrator">Admin</option>
                      </select>
                      
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button 
                          onClick={() => handleUserStatus(user.id, user.status === 'suspended' ? 'active' : 'suspended')}
                          style={{ border: 'none', background: user.status === 'suspended' ? 'var(--primary-green)' : 'rgba(255,90,90,0.15)', color: user.status === 'suspended' ? '#121212' : 'var(--error)', padding: '4px 6px', borderRadius: '6px', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}
                        >
                          {user.status === 'suspended' ? 'Lift Ban' : 'Suspend'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ==================== 4. REPORTS TAB ==================== */}
        {activeTab === 'reports' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {reports.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                onAction={handleReportAction}
              />
            ))}
            {reports.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-secondary)' }}>
                No pending moderation reports! Clean sheet.
              </div>
            )}
          </div>
        )}

        {/* ==================== 5. CATEGORY MANAGEMENT ==================== */}
        {activeTab === 'categories' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* Create category form */}
            <form onSubmit={handleAddCategory} style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <InputField
                  label="Create New Category"
                  placeholder="e.g. Market Rates"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                />
              </div>
              <Button type="submit" style={{ padding: '12px 18px', height: '48px', borderRadius: '16px' }}>
                Add
              </Button>
            </form>

            <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-secondary)' }}>Existing Categories</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {categories.map((c) => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-card)', padding: '16px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                  <div>
                    <span style={{ fontSize: '15px', fontWeight: '600', textDecoration: c.active ? 'none' : 'line-through', opacity: c.active ? 1 : 0.5 }}>
                      {c.name}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      onClick={() => handleToggleCategory(c.id)}
                      className="btn btn-secondary" 
                      style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '10px' }}
                    >
                      {c.active ? 'Disable' : 'Enable'}
                    </button>
                    <button 
                      onClick={() => setCategories(categories.filter(cat => cat.id !== c.id))}
                      className="btn btn-primary" 
                      style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '10px', backgroundColor: 'var(--error)', color: 'white' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ==================== 6. ANNOUNCEMENTS TAB ==================== */}
        {activeTab === 'notifications' && (
          <form onSubmit={handleSendAnnouncement} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700' }}>Broadcast Platform Announcement</h3>
            
            <div className="form-group">
              <label className="form-label">Target Audience</label>
              <div className="input-container">
                <span className="material-symbols-outlined input-icon">group</span>
                <select className="input-field" style={{ backgroundColor: 'transparent', color: 'white', border: 'none' }}>
                  <option style={{ backgroundColor: '#1E1E1E' }} value="all">All Platform Users</option>
                  <option style={{ backgroundColor: '#1E1E1E' }} value="farmers">Farmers Only</option>
                  <option style={{ backgroundColor: '#1E1E1E' }} value="experts">Agronomists / Crop Doctors</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Announcement Content</label>
              <div className="input-container" style={{ padding: '8px 16px' }}>
                <textarea
                  className="input-field"
                  rows="4"
                  value={announcementText}
                  onChange={(e) => setAnnouncementText(e.target.value)}
                  placeholder="Enter details of the system announcement..."
                  style={{ resize: 'none', height: '100px' }}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px' }}>
              <input 
                type="checkbox" 
                id="emergency" 
                checked={announceEmergency} 
                onChange={() => setAnnounceEmergency(!announceEmergency)}
                style={{ accentColor: 'var(--error)', width: '18px', height: '18px' }} 
              />
              <label htmlFor="emergency" style={{ fontSize: '13px', color: 'var(--error)', fontWeight: '600' }}>
                🚨 Flag as Emergency announcement
              </label>
            </div>

            <Button type="submit" style={{ backgroundColor: announceEmergency ? 'var(--error)' : 'var(--primary-green)', color: announceEmergency ? 'white' : '#121212', marginTop: '12px' }}>
              Broadcast Announcement
            </Button>
          </form>
        )}

        {/* ==================== 7. ANALYTICS TAB ==================== */}
        {activeTab === 'analytics' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700' }}>Platform Analytics</h3>

            {/* Daily Active Users Chart (pure CSS) */}
            <div className="card">
              <h4 style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '16px' }}>Daily Active Users (DAU)</h4>
              <div style={{ display: 'flex', height: '160px', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 8px 12px 8px', borderBottom: '1px solid var(--border-color)' }}>
                {mockStats.dailyActiveUsersChart.map((d, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: '8px' }}>
                    {/* Bar */}
                    <div style={{
                      width: '18px',
                      height: `${(d.value / 4200) * 110}px`,
                      backgroundColor: 'var(--primary-green)',
                      borderRadius: '4px 4px 0 0',
                      transition: 'height 0.3s ease',
                      position: 'relative'
                    }}>
                      <span style={{ position: 'absolute', top: '-18px', left: '50%', transform: 'translateX(-50%)', fontSize: '9px', fontWeight: '600', color: 'white' }}>
                        {(d.value / 1000).toFixed(1)}k
                      </span>
                    </div>
                    {/* Label */}
                    <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{d.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Growth statistics */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <div className="card" style={{ flex: 1, textAlign: 'center', padding: '12px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>User Growth</div>
                <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--primary-green)', margin: '4px 0' }}>+12.5%</div>
              </div>
              <div className="card" style={{ flex: 1, textAlign: 'center', padding: '12px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Post Activity</div>
                <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--primary-green)', margin: '4px 0' }}>+18.4%</div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== 8. ACCOUNT TAB ==================== */}
        {activeTab === 'account' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <img src="https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=200&h=200" alt="Admin" style={{ width: '80px', height: '80px', borderRadius: '50%', border: '2px solid var(--primary-green)', marginBottom: '8px' }} />
              <h3 style={{ fontSize: '18px', fontWeight: '700' }}>Super Admin</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>admin@agroconnect.com</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Security</h4>
              <InputField label="Current Password" type="password" placeholder="••••••••" value="admin123" icon="lock" />
              <InputField label="New Password" type="password" placeholder="Enter new password" icon="lock_reset" />
            </div>

            <Button onClick={onLogout} variant="secondary" style={{ borderColor: 'var(--error)', color: 'var(--error)', marginTop: '16px' }} icon="logout">
              Sign Out from Portal
            </Button>
          </div>
        )}

      </div>

      {/* Post Preview Modal */}
      <Dialog
        isOpen={!!previewPost}
        title="Post Preview"
        confirmText="Done"
        onConfirm={() => setPreviewPost(null)}
        onCancel={() => setPreviewPost(null)}
      >
        {previewPost && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '12px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <img src={previewPost.userAvatar} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600' }}>{previewPost.userName}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{previewPost.userRole}</div>
              </div>
            </div>
            <p style={{ fontSize: '13px', color: '#eeeeee', lineHeight: '1.4' }}>{previewPost.content}</p>
            {previewPost.image && <img src={previewPost.image} alt="" style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '8px' }} />}
          </div>
        )}
      </Dialog>

    </div>
  );
}
