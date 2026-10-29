import React, { useEffect, useState } from 'react';
import logoImg from '../assets/logo.png';
import { supabase } from '../supabase';

// Live "waiting for you" counts: expert applications, expert announcements and post reports that need an admin decision.
function usePendingCounts() {
  const [counts, setCounts] = useState({});
  useEffect(() => {
    let live = true;
    const load = async () => {
      const [apps, bcs, reps] = await Promise.all([
        supabase.from('expert_applications').select('id', { count: 'exact', head: true }).eq('status', 'Pending'),
        supabase.from('broadcasts').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'Pending'),
      ]);
      if (live) setCounts({ experts: apps.count || 0, broadcasts: bcs.error ? 0 : bcs.count || 0, reports: reps.count || 0 });
    };
    load();
    let channel = null;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!live || !user) return;
      // applications are in the realtime publication; announcements notify every admin when submitted
      channel = supabase.channel('admin-pending-counts')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'expert_applications' }, load)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, load)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, load)
        .subscribe();
    });
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { live = false; if (channel) supabase.removeChannel(channel); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  return counts;
}

export default function Sidebar({ activeTab, onTabChange, onLogout, onClose, isOpen = true }) {
  const pending = usePendingCounts();
  const menuGroups = [
    {
      title: "User Management",
      items: [
        { id: "users", label: "Users", icon: "group" },
        { id: "experts", label: "Experts", icon: "medical_services" },
        { id: "sellers", label: "Sellers", icon: "store" }
      ]
    },
    {
      title: "Content Management",
      items: [
        { id: "posts", label: "Posts", icon: "article" },
        { id: "comments", label: "Comments", icon: "chat" },
        { id: "reports", label: "Reports", icon: "report" }
      ]
    },
    {
      title: "Marketplace",
      items: [
        { id: "products", label: "Products", icon: "shopping_bag" },
        { id: "orders", label: "Orders", icon: "shopping_cart" },
        { id: "categories", label: "Categories", icon: "category" }
      ]
    },
    {
      title: "Consultations",
      items: [
        // Appointments and Reviews are part of Meetings (filters + meeting details)
        { id: "meetings", label: "Bookings & Payments", icon: "groups" }
      ]
    },
    {
      title: "Notifications",
      items: [
        { id: "broadcasts", label: "Broadcasts", icon: "campaign" }
      ]
    }
  ];

  return (
    <aside className={`fixed left-0 top-0 h-full w-[260px] bg-surface border-r border-outline-variant flex flex-col z-50 transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="h-16 flex items-center justify-between px-6 border-b border-outline-variant">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => onTabChange("dashboard")}>
          <img src={logoImg} alt="AgroConnect" className="w-8 h-8 rounded-lg object-contain" />
          <span className="font-headline-lg text-on-surface font-bold">Agro Connect</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-primary transition-colors cursor-pointer flex"
            title="Hide menu"
            aria-label="Hide menu"
          >
            <span className="material-symbols-outlined">menu_open</span>
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-4 flex flex-col gap-1 px-3">
        {/* Dashboard */}
        <button
          onClick={() => onTabChange("dashboard")}
          className={`w-full text-left px-4 py-2 flex items-center gap-3 rounded-lg mb-4 transition-colors font-bold ${
            activeTab === "dashboard"
              ? "bg-surface-container-highest text-primary-container border-l-4 border-primary-container"
              : "text-on-surface-variant hover:text-on-surface hover:bg-surface-variant"
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">dashboard</span>
          <span className="font-label-md">Dashboard</span>
        </button>

        {menuGroups.map((group, groupIdx) => (
          <div key={groupIdx} className="mb-4">
            <h3 className="px-4 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider mb-2">
              {group.title}
            </h3>
            {group.items.map((item) => (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full text-left px-4 py-2 flex items-center gap-3 rounded-lg transition-colors ${
                  activeTab === item.id
                    ? "bg-surface-container-highest text-primary-container border-l-4 border-primary-container font-bold"
                    : "text-on-surface-variant hover:text-on-surface hover:bg-surface-variant"
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                <span className="font-label-md">{item.label}</span>
                {pending[item.id] > 0 && (
                  <span data-testid={`pending-${item.id}`} title="Waiting for review"
                    className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-error text-white text-[11px] font-bold flex items-center justify-center">
                    {pending[item.id]}
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-outline-variant">
        <button
          onClick={onLogout}
          className="w-full text-left text-on-surface-variant hover:text-on-surface hover:bg-surface-variant px-4 py-2 flex items-center gap-3 rounded-lg transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">logout</span>
          <span className="font-label-md">Logout</span>
        </button>
      </div>
    </aside>
  );
}
