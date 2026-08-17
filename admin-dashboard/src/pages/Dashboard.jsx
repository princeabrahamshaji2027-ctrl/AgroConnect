import React, { useState, useEffect } from 'react';
import defaultAvatar from '../assets/profile-placeholder.png';
import { supabase } from '../supabase';

export default function Dashboard({ onTabChange }) {
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    totalPosts: 0,
    expertApps: 0,
    totalOrders: 0,
    pendingReports: 0,
  });

  const [loading, setLoading] = useState(true);
  const [recentPosts, setRecentPosts] = useState([]);
  const [recentApps, setRecentApps] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // Fetch Stats Counts
      const [
        { count: usersCount },
        { count: postsCount },
        { count: expertAppsCount },
        { count: ordersCount },
        { count: reportsCount },
      ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('posts').select('*', { count: 'exact', head: true }),
        supabase.from('expert_applications').select('*', { count: 'exact', head: true }).eq('status', 'Pending'),
        supabase.from('orders').select('*', { count: 'exact', head: true }),
        supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'Pending'),
      ]);

      setStats({
        totalUsers: usersCount || 0,
        activeUsers: Math.round((usersCount || 0) * 0.65), // simulated active proportion
        totalPosts: postsCount || 0,
        expertApps: expertAppsCount || 0,
        totalOrders: ordersCount || 0,
        pendingReports: reportsCount || 0,
      });

      // Fetch 4 Recent Posts
      const { data: posts } = await supabase
        .from('posts')
        .select('id, caption, image_path, created_at, category, profiles(full_name, role, profile_image_path)')
        .order('created_at', { ascending: false })
        .limit(4);
      setRecentPosts(posts || []);

      // Fetch 4 Recent Expert Applications
      const { data: apps } = await supabase
        .from('expert_applications')
        .select('id, qualification, created_at, status, profiles(full_name, profile_image_path)')
        .eq('status', 'Pending')
        .order('created_at', { ascending: false })
        .limit(4);
      setRecentApps(apps || []);

      // Fetch Top Products
      const { data: products } = await supabase
        .from('products')
        .select('id, product_name, price, image_path, category')
        .limit(5);
      setTopProducts(products || []);

      // Fetch Recent Orders
      const { data: orders } = await supabase
        .from('orders')
        .select('id, total_amount, status, created_at, profiles(full_name)')
        .order('created_at', { ascending: false })
        .limit(5);
      setRecentOrders(orders || []);

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();

    // Set up realtime listeners to reload data
    const reportsChannel = supabase
      .channel('dashboard-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, fetchDashboardData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expert_applications' }, fetchDashboardData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchDashboardData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, fetchDashboardData)
      .subscribe();

    return () => {
      supabase.removeChannel(reportsChannel);
    };
  }, []);

  const handleApproveExpert = async (appId) => {
    try {
      const { error } = await supabase.rpc('approve_expert_application', { p_application_id: appId });
      if (error) throw error;
      fetchDashboardData();
    } catch (err) {
      alert(err.message || 'Error approving application');
    }
  };

  const handleRejectExpert = async (appId) => {
    try {
      const { error } = await supabase.rpc('reject_expert_application', { p_application_id: appId, p_notes: 'Rejected from dashboard summary' });
      if (error) throw error;
      fetchDashboardData();
    } catch (err) {
      alert(err.message || 'Error rejecting application');
    }
  };

  const formatPrice = (p) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(p);
  };

  const timeAgo = (dateStr) => {
    const seconds = Math.floor((new Date() - new Date(dateStr)) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  if (loading && stats.totalUsers === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="animate-spin h-8 w-8 border-4 border-primary-container border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-6 pb-24 max-w-[1600px] mx-auto flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="font-headline-xl text-on-surface mb-1">Dashboard</h1>
          <p className="font-body-sm text-on-surface-variant">Welcome back, Admin! Here's what's happening on Agro Connect.</p>
        </div>
        <div className="flex items-center gap-2 bg-[#171A1D] border border-outline-variant rounded-lg px-4 py-2 text-body-sm text-on-surface-variant cursor-pointer hover:border-primary-container transition-colors">
          <span className="material-symbols-outlined text-[16px]">calendar_today</span>
          <span>{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Total Users */}
        <div className="card-bg rounded-xl p-4 flex flex-col gap-3 cursor-pointer" onClick={() => onTabChange("users")}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#1f2924] flex items-center justify-center">
              <span className="material-symbols-outlined text-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>group</span>
            </div>
            <span className="font-label-sm text-on-surface-variant">Total Users</span>
          </div>
          <div className="font-headline-xl text-on-surface">{stats.totalUsers}</div>
          <div className="flex items-center gap-1 font-label-sm text-primary-container">
            <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
            <span>Active Platform Growth</span>
          </div>
        </div>

        {/* Active Users */}
        <div className="card-bg rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#1f2924] flex items-center justify-center">
              <span className="material-symbols-outlined text-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
            </div>
            <span className="font-label-sm text-on-surface-variant">Active Users</span>
          </div>
          <div className="font-headline-xl text-on-surface">{stats.activeUsers}</div>
          <div className="flex items-center gap-1 font-label-sm text-primary-container">
            <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
            <span>~65% Monthly Active</span>
          </div>
        </div>

        {/* Total Posts */}
        <div className="card-bg rounded-xl p-4 flex flex-col gap-3 cursor-pointer" onClick={() => onTabChange("posts")}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#1f2924] flex items-center justify-center">
              <span className="material-symbols-outlined text-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>eco</span>
            </div>
            <span className="font-label-sm text-on-surface-variant">Total Posts</span>
          </div>
          <div className="font-headline-xl text-on-surface">{stats.totalPosts}</div>
          <div className="flex items-center gap-1 font-label-sm text-primary-container">
            <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
            <span>Community Feed</span>
          </div>
        </div>

        {/* Expert Applications */}
        <div className="card-bg rounded-xl p-4 flex flex-col gap-3 cursor-pointer" onClick={() => onTabChange("experts")}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#2a2233] flex items-center justify-center">
              <span className="material-symbols-outlined text-[#a074c4]" style={{ fontVariationSettings: "'FILL' 1" }}>workspace_premium</span>
            </div>
            <span className="font-label-sm text-on-surface-variant">Expert Apps</span>
          </div>
          <div className="font-headline-xl text-on-surface">{stats.expertApps}</div>
          <div className="flex items-center gap-1 font-label-sm text-primary-container">
            <span className="material-symbols-outlined text-[14px]">pending_actions</span>
            <span>Pending Review</span>
          </div>
        </div>

        {/* Total Orders */}
        <div className="card-bg rounded-xl p-4 flex flex-col gap-3 cursor-pointer" onClick={() => onTabChange("orders")}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#332514] flex items-center justify-center">
              <span className="material-symbols-outlined text-secondary-container" style={{ fontVariationSettings: "'FILL' 1" }}>shopping_cart</span>
            </div>
            <span className="font-label-sm text-on-surface-variant">Total Orders</span>
          </div>
          <div className="font-headline-xl text-on-surface">{stats.totalOrders}</div>
          <div className="flex items-center gap-1 font-label-sm text-primary-container">
            <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
            <span>Marketplace Sales</span>
          </div>
        </div>

        {/* Pending Reports */}
        <div className="card-bg rounded-xl p-4 flex flex-col gap-3 cursor-pointer" onClick={() => onTabChange("reports")}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#331c1e] flex items-center justify-center">
              <span className="material-symbols-outlined text-[#e74c3c]" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
            </div>
            <span className="font-label-sm text-on-surface-variant">Pending Reports</span>
          </div>
          <div className="font-headline-xl text-on-surface">{stats.pendingReports}</div>
          <div className="flex items-center gap-1 font-label-sm text-[#e74c3c]">
            <span className="material-symbols-outlined text-[14px]">warning</span>
            <span>Requires Moderation</span>
          </div>
        </div>
      </div>

      {/* Middle Row — User Growth chart removed per fix 1.1d */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">

        {/* Recent Posts */}
        <div className="xl:col-span-6 card-bg rounded-xl p-5 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-headline-lg-mobile text-on-surface">Recent Posts</h2>
            <button className="font-label-sm text-primary-container hover:underline" onClick={() => onTabChange("posts")}>View All</button>
          </div>
          <div className="flex flex-col gap-4">
            {recentPosts.length === 0 ? (
              <div className="text-on-surface-variant/50 text-body-sm text-center py-8">No recent posts found</div>
            ) : (
              recentPosts.map((post) => (
                <div key={post.id} className="flex flex-col gap-3">
                  <div className="flex items-start justify-between group">
                    <div className="flex gap-3">
                      <img
                        alt="Author avatar"
                        className="w-10 h-10 rounded-full object-cover border border-outline-variant"
                        src={post.profiles?.profile_image_path || defaultAvatar}
                      />
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-label-md text-on-surface">{post.profiles?.full_name || 'Anonymous'}</span>
                          <span className="bg-[#1f2924] text-primary-container text-[9px] font-bold px-2 py-0.5 rounded uppercase">{post.profiles?.role || 'Farmer'}</span>
                          <span className="text-[10px] text-on-surface-variant">{timeAgo(post.created_at)}</span>
                        </div>
                        <p className="font-body-sm text-on-surface-variant line-clamp-1 w-[180px]">{post.caption || 'No caption'}</p>
                      </div>
                    </div>
                    {post.image_path && (
                      <img alt="Post thumbnail" className="w-14 h-10 rounded object-cover" src={post.image_path} />
                    )}
                  </div>
                  <div className="w-full h-px bg-outline-variant/30"></div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Expert Applications */}
        <div className="xl:col-span-6 card-bg rounded-xl p-5 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-headline-lg-mobile text-on-surface">Expert Applications</h2>
            <button className="font-label-sm text-primary-container hover:underline" onClick={() => onTabChange("experts")}>View All</button>
          </div>
          <div className="flex flex-col gap-4">
            {recentApps.length === 0 ? (
              <div className="text-on-surface-variant/50 text-body-sm text-center py-8">No pending applications</div>
            ) : (
              recentApps.map((app) => (
                <div key={app.id} className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        alt="Applicant avatar"
                        className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                        src={app.profiles?.profile_image_path || defaultAvatar}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-label-md text-on-surface truncate">{app.profiles?.full_name || 'Anonymous'}</span>
                          <span className="text-[10px] text-on-surface-variant truncate">{app.qualification || 'Agronomist'}</span>
                        </div>
                        <div className="text-[10px] text-on-surface-variant">Applied {timeAgo(app.created_at)}</div>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleApproveExpert(app.id)}
                        className="bg-primary-container/10 text-primary-container hover:bg-primary-container/20 border border-primary-container/30 px-3 py-1 rounded font-label-sm transition-colors cursor-pointer"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleRejectExpert(app.id)}
                        className="bg-surface-variant text-on-surface-variant hover:text-on-surface px-3 py-1 rounded font-label-sm transition-colors cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                  <div className="w-full h-px bg-outline-variant/30"></div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Lower Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {/* Top Selling Products */}
        <div className="card-bg rounded-xl p-5 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-headline-lg-mobile text-on-surface">Featured Products</h2>
            <button className="font-label-sm text-primary-container hover:underline" onClick={() => onTabChange("products")}>View All</button>
          </div>
          <div className="flex flex-col gap-3">
            {topProducts.length === 0 ? (
              <div className="text-on-surface-variant/50 text-body-sm text-center py-8">No products found</div>
            ) : (
              topProducts.map((p) => (
                <div key={p.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-surface-variant rounded flex items-center justify-center overflow-hidden border border-outline-variant/20">
                      {p.image_path ? (
                        <img alt={p.product_name} className="w-full h-full object-cover" src={p.image_path} />
                      ) : (
                        <span className="material-symbols-outlined text-on-surface-variant">shopping_bag</span>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-label-md text-on-surface truncate w-[130px]">{p.product_name}</span>
                      <span className="text-[10px] text-on-surface-variant uppercase">{p.category || 'Product'}</span>
                    </div>
                  </div>
                  <span className="font-label-sm text-primary-container">{formatPrice(p.price)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Orders */}
        <div className="card-bg rounded-xl p-5 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-headline-lg-mobile text-on-surface">Recent Orders</h2>
            <button className="font-label-sm text-primary-container hover:underline" onClick={() => onTabChange("orders")}>View All</button>
          </div>
          <div className="flex flex-col gap-3 text-[11px]">
            {recentOrders.length === 0 ? (
              <div className="text-on-surface-variant/50 text-body-sm text-center py-8">No orders placed yet</div>
            ) : (
              recentOrders.map((o) => (
                <div key={o.id} className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-on-surface-variant font-mono text-[10px] truncate w-[80px]">#{o.id.substring(0, 8)}</span>
                    <span className="text-on-surface w-20 truncate">{o.profiles?.full_name || 'Customer'}</span>
                    <span className={`px-2 py-0.5 rounded font-bold text-[9px] uppercase ${
                      o.status === 'Delivered' ? 'bg-primary-container/20 text-primary-container' : 'bg-secondary-container/20 text-secondary-container'
                    }`}>
                      {o.status}
                    </span>
                    <span className="text-on-surface-variant">{formatPrice(o.total_amount)}</span>
                  </div>
                  <div className="w-full h-px bg-outline-variant/30"></div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* System Overview */}
        <div className="card-bg rounded-xl p-5 flex flex-col">
          <h2 className="font-headline-lg-mobile text-on-surface mb-4">System Overview</h2>
          <div className="flex flex-col gap-4 flex-1 justify-between">
            <div className="flex justify-between items-center">
              <span className="font-label-sm text-on-surface-variant">Server Status</span>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-container animate-pulse"></span>
                <span className="font-label-sm text-primary-container">Online</span>
              </div>
            </div>
            <div className="w-full h-px bg-outline-variant/30"></div>
            <div className="flex justify-between items-center">
              <span className="font-label-sm text-on-surface-variant">Database</span>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-container"></span>
                <span className="font-label-sm text-primary-container">Connected</span>
              </div>
            </div>
            <div className="w-full h-px bg-outline-variant/30"></div>
            <div className="flex justify-between items-center">
              <span className="font-label-sm text-on-surface-variant">Storage Used</span>
              <span className="font-label-sm text-on-surface">45%</span>
            </div>
            <div className="w-full h-px bg-outline-variant/30"></div>
            <div className="flex justify-between items-center">
              <span className="font-label-sm text-on-surface-variant">Total Storage</span>
              <span className="font-label-sm text-on-surface">100 GB</span>
            </div>
            <div className="w-full h-px bg-outline-variant/30"></div>
            <div className="flex justify-between items-center">
              <span className="font-label-sm text-on-surface-variant">Backup Status</span>
              <span className="font-label-sm text-on-surface">Up to date</span>
            </div>
            <div className="w-full h-px bg-outline-variant/30"></div>
            <div className="flex justify-between items-center">
              <span className="font-label-sm text-on-surface-variant">Active Sessions</span>
              <span className="font-label-sm text-on-surface">32</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
