import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import Sidebar from './components/Sidebar';
import TopNav from './components/TopNav';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Experts from './pages/Experts';
import Sellers from './pages/Sellers';
import Posts from './pages/Posts';
import Comments from './pages/Comments';
import Reports from './pages/Reports';
import Products from './pages/Products';
import Orders from './pages/Orders';
import Categories from './pages/Categories';
import Appointments from './pages/Appointments';
import Meetings from './pages/Meetings';
import Reviews from './pages/Reviews';
import News from './pages/News';
import Banners from './pages/Banners';
import Broadcasts from './pages/Broadcasts';
import Analytics from './pages/Analytics';
import Admins from './pages/Admins';
import ActivityLogs from './pages/ActivityLogs';

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Fetch user profile when session is available
  useEffect(() => {
    if (session?.user) {
      supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()
        .then(({ data }) => setProfile(data))
        .catch(() => setProfile(null));
    } else {
      setProfile(null);
    }
  }, [session]);

  // Redirect non-admins to logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  };

  // Authentication guard
  if (!session) {
    return <Login onLogin={sess => setSession(sess)} />;
  }
  if (!profile || profile.role !== 'Admin') {
    // Not authorized – sign out immediately
    handleLogout();
    return null;
  }

  const renderPage = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'users':
        return <Users />;
      case 'experts':
        return <Experts />;
      case 'sellers':
        return <Sellers />;
      case 'posts':
        return <Posts />;
      case 'comments':
        return <Comments />;
      case 'reports':
        return <Reports />;
      case 'products':
        return <Products />;
      case 'orders':
        return <Orders />;
      case 'categories':
        return <Categories />;
      case 'appointments':
        return <Appointments />;
      case 'meetings':
        return <Meetings />;
      case 'reviews':
        return <Reviews />;
      case 'news':
        return <News />;
      case 'banners':
        return <Banners />;
      case 'broadcasts':
        return <Broadcasts />;
      case 'analytics':
        return <Analytics />;
      case 'admins':
        return <Admins />;
      case 'activity_logs':
        return <ActivityLogs />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex min-h-screen bg-surface-variant">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} onLogout={handleLogout} />
      <div className="flex flex-col flex-1 ml-[260px]">
        <TopNav
          userProfile={profile}
          onSearchChange={setSearchQuery}
          notificationCount={0}
        />
        <main className="p-6 overflow-auto flex-1" id="main-content">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}

export default App;
