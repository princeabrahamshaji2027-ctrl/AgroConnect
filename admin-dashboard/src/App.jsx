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
import Admins from './pages/Admins';
import ActivityLogs from './pages/ActivityLogs';

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');

  useEffect(() => {
    // Get the initial session
    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Fetch user profile when session is available
  useEffect(() => {
    if (session?.user) {
      setLoadingProfile(true);
      supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()
        .then(({ data, error }) => {
          if (error) {
            console.error('Profile fetch failed:', error);
          }
          setProfile(data);
          setLoadingProfile(false);
        })
        .catch((err) => {
          console.error('Profile fetch threw:', err);
          setProfile(null);
          setLoadingProfile(false);
        });
    } else {
      setProfile(null);
      setLoadingProfile(false);
    }
  }, [session]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  };

  if (!session) {
    return <Login />;
  }

  if (loadingProfile) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <span className="animate-spin h-8 w-8 border-4 border-primary-container border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!profile || profile.role !== 'Admin') {
    console.error('Bounced to login — profile:', profile, 'session user id:', session?.user?.id);
    handleLogout();
    return null;
  }

  const renderPage = () => {
    switch (activeTab) {
      case 'dashboard':
        // Fix 1.1a: pass onTabChange so KPI cards and "View All" buttons work
        return <Dashboard onTabChange={setActiveTab} />;
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
      case 'admins':
        return <Admins />;
      case 'activity_logs':
        return <ActivityLogs />;
      default:
        return <Dashboard onTabChange={setActiveTab} />;
    }
  };

  return (
    <div className="flex min-h-screen bg-surface-variant">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} onLogout={handleLogout} />
      <div className="flex flex-col flex-1 ml-[260px]">
        <TopNav userProfile={profile} />
        {/* Fix 1.1b: pt-16 offsets fixed TopNav, h-screen + overflow-y-auto enables page scroll */}
        <main className="pt-16 h-screen overflow-y-auto flex-1" id="main-content">
          <div className="p-6">
            {renderPage()}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
