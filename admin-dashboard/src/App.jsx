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
  const [profile, setProfile] = useState(undefined); // undefined = loading, null = no profile / failed
  const [authError, setAuthError] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');

  useEffect(() => {
    // Get the initial session
    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      if (!sess) {
        setProfile(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Fetch user profile when session is available
  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      return;
    }

    let isMounted = true;
    setProfile(undefined); // Set loading state while fetching

    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error || !data) {
          console.error('Profile fetch failed:', error);
          setAuthError('Failed to verify profile credentials.');
          supabase.auth.signOut();
          setSession(null);
          setProfile(null);
        } else if (data.role !== 'Admin') {
          console.error('Access Denied: Non-admin role:', data.role);
          setAuthError('Access Denied: You do not have administrator privileges.');
          supabase.auth.signOut();
          setSession(null);
          setProfile(null);
        } else {
          setAuthError('');
          setProfile(data);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('Profile fetch threw:', err);
        setAuthError('An error occurred during authentication.');
        supabase.auth.signOut();
        setSession(null);
        setProfile(null);
      });

    return () => {
      isMounted = false;
    };
  }, [session]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setAuthError('');
  };

  if (!session) {
    return <Login authError={authError} />;
  }

  if (profile === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <span className="animate-spin h-8 w-8 border-4 border-primary-container border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!profile || profile.role !== 'Admin') {
    return <Login authError={authError || 'Access Denied: You do not have administrator privileges.'} />;
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
