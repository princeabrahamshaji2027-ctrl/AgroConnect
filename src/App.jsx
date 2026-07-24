import React, { useState } from 'react';
import Splash from './pages/Splash';
import Login from './pages/Login';
import Register from './pages/Register';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import Feed from './pages/Feed';
import UserProfile from './pages/UserProfile';
import EditProfile from './pages/EditProfile';
import CreatePost from './pages/CreatePost';
import Community from './pages/Community';
import Search from './pages/Search';
import Notifications from './pages/Notifications';
import Chat from './pages/Chat';
import Settings from './pages/Settings';
import NavBar from './components/NavBar';
import { FAB } from './components/Button';
import './index.css';

export default function App() {
  const [screen, setScreen] = useState('splash'); // 'splash' | 'login' | 'register' | 'adminLogin' | 'adminDashboard' | 'appLayout'
  const [activeTab, setActiveTab] = useState('feed'); // 'feed' | 'search' | 'communities' | 'chat' | 'profile'
  const [subScreen, setSubScreen] = useState(null); // null | 'editProfile' | 'createPost' | 'notifications' | 'settings'
  const [viewingProfileId, setViewingProfileId] = useState(null); // null or user ID

  // Handlers for main flow
  const handleSplashFinish = () => {
    setScreen('login');
  };

  const handleLoginSuccess = (role) => {
    if (role === 'admin') {
      setScreen('adminDashboard');
    } else {
      setScreen('appLayout');
      setActiveTab('feed');
      setSubScreen(null);
      setViewingProfileId(null);
    }
  };

  const handleLogout = () => {
    setScreen('login');
    setSubScreen(null);
    setViewingProfileId(null);
  };

  const handlePublishPost = (newPost) => {
    // Add the post to mockPosts database in Feed by simulating success
    // Go back to feed
    setSubScreen(null);
  };

  // Render sub-screens or layout active tabs
  const renderAppLayoutContent = () => {
    if (subScreen === 'editProfile') {
      return (
        <EditProfile 
          onSave={() => setSubScreen(null)} 
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

    if (viewingProfileId) {
      return (
        <UserProfile 
          userId={viewingProfileId}
          onEditProfileClick={() => setSubScreen('editProfile')}
          onSettingsClick={() => setSubScreen('settings')}
          onProfileClick={(id) => setViewingProfileId(id)}
          onCancelView={() => setViewingProfileId(null)}
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
          />
        );
      case 'search':
        return (
          <Search 
            onProfileClick={(id) => setViewingProfileId(id)}
          />
        );
      case 'communities':
        return <Community />;
      case 'chat':
        return <Chat />;
      case 'profile':
        return (
          <UserProfile 
            userId="user1" 
            onEditProfileClick={() => setSubScreen('editProfile')}
            onSettingsClick={() => setSubScreen('settings')}
            onProfileClick={(id) => setViewingProfileId(id)}
          />
        );
      default:
        return <Feed />;
    }
  };

  return (
    <div className="app-container">
      {screen === 'splash' && <Splash onFinish={handleSplashFinish} />}
      
      {screen === 'login' && (
        <Login 
          onLoginSuccess={handleLoginSuccess}
          onGoToRegister={() => setScreen('register')}
          onGoToAdminLogin={() => setScreen('adminLogin')}
        />
      )}

      {screen === 'register' && (
        <Register 
          onRegisterSuccess={() => setScreen('login')}
          onGoToLogin={() => setScreen('login')}
        />
      )}

      {screen === 'adminLogin' && (
        <AdminLogin 
          onLoginSuccess={handleLoginSuccess}
          onGoToUserLogin={() => setScreen('login')}
        />
      )}

      {screen === 'adminDashboard' && (
        <AdminDashboard 
          onLogout={handleLogout}
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
