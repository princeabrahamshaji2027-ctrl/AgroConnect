import React, { useState, useEffect } from 'react';
import Splash from './pages/Splash';
import Login from './pages/Login';
import Register from './pages/Register';
import Feed from './pages/Feed';
import UserProfile from './pages/UserProfile';
import EditProfile from './pages/EditProfile';
import CreatePost from './pages/CreatePost';
import Connect from './pages/Connect';
import PeaAI from './pages/PeaAI';
import Search from './pages/Search';
import Notifications from './pages/Notifications';
import Chat from './pages/Chat';
import Settings from './pages/Settings';
import NavBar from './components/NavBar';
import { FAB } from './components/Button';
import './index.css';

import { supabase } from './supabase';

export default function App() {
  const [screen, setScreen] = useState('splash'); // 'splash' | 'login' | 'register' | 'adminDashboard' | 'appLayout'
  const [activeTab, setActiveTab] = useState('feed'); // 'feed' | 'search' | 'connect' | 'chat' | 'profile'
  const [subScreen, setSubScreen] = useState(null); // null | 'editProfile' | 'createPost' | 'notifications' | 'settings' | 'peaAI'
  const [viewingProfileId, setViewingProfileId] = useState(null); // null or user ID

  // Toast Notifications States
  const [toastMessage, setToastMessage] = useState(null);
  const [toastVisible, setToastVisible] = useState(false);

  const showToastNotification = (msg) => {
    setToastMessage(msg);
    setToastVisible(true);
  };

  useEffect(() => {
    if (toastVisible) {
      const timer = setTimeout(() => {
        setToastVisible(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [toastVisible]);

  // Realtime: show toast when a new notification arrives for the current user
  useEffect(() => {
    if (screen !== 'appLayout') return;

    let notifChannel = null;
    
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      notifChannel = supabase
        .channel('user-notifications-toast')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
          (payload) => {
            if (payload.new && !payload.new.is_read) {
              showToastNotification(payload.new.message || '🔔 New notification');
            }
          }
        )
        .subscribe();
    });

    return () => {
      if (notifChannel) supabase.removeChannel(notifChannel);
    };
  }, [screen]);

  // Android / Hardware Back Button Handling
  useEffect(() => {
    let backPressCount = 0;
    let backPressTimer = null;

    const handleBackButton = () => {
      if (subScreen) {
        setSubScreen(null);
      } else if (viewingProfileId) {
        setViewingProfileId(null);
      } else if (activeTab !== 'feed') {
        setActiveTab('feed');
      } else {
        // Tapping twice to exit
        backPressCount++;
        if (backPressCount === 1) {
          showToastNotification('Press back again to exit');
          backPressTimer = setTimeout(() => {
            backPressCount = 0;
          }, 2000);
        } else if (backPressCount === 2) {
          clearTimeout(backPressTimer);
          if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
            window.Capacitor.Plugins.App.exitApp();
          } else {
            console.log("App exited (simulated)");
            showToastNotification("Exiting Agro Connect...");
          }
        }
      }
    };

    // Capacitor listener
    if (window.Capacitor) {
      const { App: CapApp } = window.Capacitor.Plugins;
      if (CapApp) {
        const handler = CapApp.addListener('backButton', () => {
          handleBackButton();
        });
        return () => handler.remove();
      }
    }

    // If running inside native platform, skip registering popstate web fallback
    if (window.Capacitor?.isNativePlatform?.()) {
      return;
    }

    // Web fallback popstate listener
    const handlePopState = (e) => {
      e.preventDefault();
      handleBackButton();
      window.history.pushState(null, null, window.location.pathname);
    };

    window.history.pushState(null, null, window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [subScreen, viewingProfileId, activeTab]);

  // Handlers for main flow
  const handleSplashFinish = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();
      const role = profile?.role?.toLowerCase() || 'farmer';
      localStorage.setItem('access_token', session.access_token);
      localStorage.setItem('user_role', role);
      if (role === 'admin') {
        showToastNotification('⚠️ Administrators must log in via the Admin Panel website.');
        await supabase.auth.signOut();
        localStorage.removeItem('access_token');
        localStorage.removeItem('user_role');
        setScreen('login');
      } else {
        setScreen('appLayout');
      }
    } else {
      setScreen('login');
    }
  };

  const handleLoginSuccess = async (role) => {
    if (role === 'admin') {
      showToastNotification('⚠️ Administrators must log in via the Admin Panel website.');
      await supabase.auth.signOut();
      localStorage.removeItem('access_token');
      localStorage.removeItem('user_role');
      setScreen('login');
    } else {
      setScreen('appLayout');
      setActiveTab('feed');
      setSubScreen(null);
      setViewingProfileId(null);
      showToastNotification('🔓 Logged in successfully!');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('access_token');
    localStorage.removeItem('user_role');
    setScreen('login');
    setSubScreen(null);
    setViewingProfileId(null);
    showToastNotification('🔌 Logged out safely');
  };

  const handlePublishPost = (newPost) => {
    setSubScreen(null);
    showToastNotification('📝 Post published to Community Feed!');
  };

  // Render sub-screens or layout active tabs
  const renderAppLayoutContent = () => {
    if (subScreen === 'editProfile') {
      return (
        <EditProfile 
          onSave={() => {
            setSubScreen(null);
            showToastNotification('Profile updated successfully!');
          }} 
          onCancel={() => setSubScreen(null)} 
        />
      );
    }

    if (subScreen === 'createPost') {
      return (
        <CreatePost 
          onPublish={handlePublishPost} 
          onCancel={() => setSubScreen(null)} 
        />
      );
    }

    if (subScreen === 'notifications') {
      return (
        <Notifications 
          onGoBack={() => setSubScreen(null)} 
        />
      );
    }

    if (subScreen === 'settings') {
      return (
        <Settings 
          onLogout={handleLogout} 
          onGoBack={() => setSubScreen(null)} 
        />
      );
    }

    if (subScreen === 'peaAI') {
      return (
        <PeaAI 
          onGoBack={() => setSubScreen(null)} 
        />
      );
    }

    if (viewingProfileId) {
      return (
        <UserProfile 
          userId={viewingProfileId}
          onEditProfileClick={() => setSubScreen('editProfile')}
          onSettingsClick={() => setSubScreen('settings')}
          onProfileClick={(id) => setViewingProfileId(id)}
          onCancelView={() => setViewingProfileId(null)}
          onPeaAIClick={() => setSubScreen('peaAI')}
          onShowToast={showToastNotification}
        />
      );
    }

    switch (activeTab) {
      case 'feed':
        return (
          <Feed 
            onNotificationClick={() => setSubScreen('notifications')}
            onSearchClick={() => setActiveTab('search')}
            onProfileClick={(id) => setViewingProfileId(id)}
            onCreatePostClick={() => setSubScreen('createPost')}
            onPeaAIClick={() => setSubScreen('peaAI')}
            onShowToast={showToastNotification}
          />
        );
      case 'search':
        return (
          <Search 
            onProfileClick={(id) => setViewingProfileId(id)}
            onPostCommentClick={(post) => {
              setActiveTab('feed');
              // Trigger commenting layout
            }}
          />
        );
      case 'connect':
        return (
          <Connect 
            onPeaAIClick={() => setSubScreen('peaAI')}
            onShowToast={showToastNotification}
          />
        );
      case 'chat':
        return <Chat />;
      case 'profile':
        return (
          <UserProfile 
            userId="user1" 
            onEditProfileClick={() => setSubScreen('editProfile')}
            onSettingsClick={() => setSubScreen('settings')}
            onProfileClick={(id) => setViewingProfileId(id)}
            onPeaAIClick={() => setSubScreen('peaAI')}
            onShowToast={showToastNotification}
          />
        );
      default:
        return <Feed onPeaAIClick={() => setSubScreen('peaAI')} />;
    }
  };

  return (
    <div className="app-container">
      {/* Toast Notification Popup */}
      {toastVisible && toastMessage && (
        <div style={{
          position: 'absolute',
          top: 'calc(var(--safe-top) + 12px)',
          left: '16px',
          right: '16px',
          backgroundColor: '#1E1E1E',
          border: '1.5px solid var(--primary-green)',
          borderRadius: '16px',
          padding: '12px 16px',
          zIndex: 1500,
          boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          animation: 'slideUp 0.3s cubic-bezier(0.1, 0.76, 0.55, 0.94) forwards'
        }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--primary-green)', fontSize: '20px' }}>info</span>
          <span style={{ fontSize: '13px', fontWeight: '600', color: 'white', flex: 1 }}>{toastMessage}</span>
          <button onClick={() => setToastVisible(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
          </button>
        </div>
      )}

      {screen === 'splash' && <Splash onFinish={handleSplashFinish} />}
      
      {screen === 'login' && (
        <Login 
          onLoginSuccess={handleLoginSuccess}
          onGoToRegister={() => setScreen('register')}
        />
      )}

      {screen === 'register' && (
        <Register 
          onRegisterSuccess={() => {
            setScreen('login');
            showToastNotification('🎉 Registration successful! Log in now.');
          }}
          onGoToLogin={() => setScreen('login')}
        />
      )}

      {screen === 'appLayout' && (
        <>
          {renderAppLayoutContent()}
          
          {/* Only show Bottom NavBar if we are on main tabs (no full-viewport subScreens) */}
          {!subScreen && (
            <>
              {/* Show Floating Create Post button on Feed and Profile tabs */}
              {(activeTab === 'feed' || activeTab === 'profile') && !viewingProfileId && (
                <FAB onClick={() => setSubScreen('createPost')} icon="edit" />
              )}
              
              <NavBar activeTab={activeTab} onTabChange={(tab) => {
                setActiveTab(tab);
                setViewingProfileId(null);
              }} />
            </>
          )}
        </>
      )}
    </div>
  );
}
