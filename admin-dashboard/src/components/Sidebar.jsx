import React from 'react';
import logoImg from '../assets/logo.jpg';

export default function Sidebar({ activeTab, onTabChange, onLogout }) {
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
        { id: "appointments", label: "Appointments", icon: "event" },
        { id: "meetings", label: "Meetings", icon: "groups" }
      ]
    },
    {
      title: "System",
      items: [
        { id: "admins", label: "Admins", icon: "admin_panel_settings" },
        { id: "activity_logs", label: "Activity Logs", icon: "history" }
      ]
    }
  ];

  return (
    <aside className="fixed left-0 top-0 h-full w-[260px] bg-surface border-r border-outline-variant flex flex-col z-50">
      <div className="h-16 flex items-center px-6 border-b border-outline-variant">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => onTabChange("dashboard")}>
          <img src={logoImg} alt="AgroConnect" className="w-8 h-8 rounded-lg object-cover" />
          <span className="font-headline-lg text-on-surface font-bold">Agro Connect</span>
        </div>
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
