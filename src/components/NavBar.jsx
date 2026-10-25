import React from 'react';
import './components.css';

export default function NavBar({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'feed', label: 'Feed', icon: 'home' },
    { id: 'search', label: 'Search', icon: 'search' },
    { id: 'connect', label: 'Catch Up', icon: 'handshake' },
    { id: 'chat', label: 'Chat', icon: 'chat' },
    { id: 'profile', label: 'Profile', icon: 'person' }
  ];

  return (
    <div className="bottom-nav">
      {tabs.map((tab) => (
        // Icons only; the label stays for screen readers and tests.
        <div
          key={tab.id}
          role="button"
          aria-label={tab.label}
          aria-current={activeTab === tab.id ? 'page' : undefined}
          className={`bottom-nav-item ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange && onTabChange(tab.id)}
        >
          <span className={`material-symbols-outlined ${activeTab === tab.id ? 'fill' : ''}`} aria-hidden="true">
            {tab.icon}
          </span>
        </div>
      ))}
    </div>
  );
}
