import React from 'react';
import './components.css';

export default function NavBar({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'feed', label: 'Feed', icon: 'home' },
    { id: 'search', label: 'Search', icon: 'search' },
    { id: 'communities', label: 'Groups', icon: 'groups' },
    { id: 'chat', label: 'Chat', icon: 'chat' },
    { id: 'profile', label: 'Profile', icon: 'person' }
  ];

  return (
    <div className="bottom-nav">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`bottom-nav-item ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange && onTabChange(tab.id)}
        >
          <span className={`material-symbols-outlined ${activeTab === tab.id ? 'fill' : ''}`}>
            {tab.icon}
          </span>
          <span>{tab.label}</span>
        </div>
      ))}
    </div>
  );
}
