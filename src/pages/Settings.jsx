import React, { useState } from 'react';
import Header from '../components/Header';
import { Button } from '../components/Button';
import './pages.css';

export default function Settings({ onLogout, onGoBack }) {
  const [darkMode, setDarkMode] = useState(true);
  const [language, setLanguage] = useState('English');
  const [notifsEnabled, setNotifsEnabled] = useState(true);
  const [showAbout, setShowAbout] = useState(false);

  const toggleDarkMode = () => setDarkMode(!darkMode);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Header title="Settings" showBack={!showAbout} onBackClick={onGoBack} />
      
      <div className="page-container fade-in" style={{ gap: '16px' }}>
        
        {!showAbout ? (
          <>
            {/* Preferences */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Preferences</h3>
              
              {/* Dark Mode toggle */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span className="material-symbols-outlined" style={{ color: 'var(--primary-green)' }}>dark_mode</span>
                  <span style={{ fontSize: '15px' }}>Dark Theme</span>
                </div>
                <input 
                  type="checkbox" 
                  checked={darkMode} 
                  onChange={toggleDarkMode}
                  style={{ accentColor: 'var(--primary-green)', width: '20px', height: '20px', cursor: 'pointer' }} 
                />
              </div>

              {/* Language Selection */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span className="material-symbols-outlined" style={{ color: 'var(--primary-green)' }}>translate</span>
                  <span style={{ fontSize: '15px' }}>Language</span>
                </div>
                <select 
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  style={{ backgroundColor: 'transparent', color: 'white', border: 'none', fontSize: '14px', outline: 'none', cursor: 'pointer' }}
                >
                  <option style={{ backgroundColor: '#1E1E1E' }} value="English">English</option>
                  <option style={{ backgroundColor: '#1E1E1E' }} value="Hindi">हिन्दी (Hindi)</option>
                  <option style={{ backgroundColor: '#1E1E1E' }} value="Punjabi">ਪੰਜਾਬੀ (Punjabi)</option>
                  <option style={{ backgroundColor: '#1E1E1E' }} value="Telugu">తెలుగు (Telugu)</option>
                </select>
              </div>

              {/* Notification Toggle */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span className="material-symbols-outlined" style={{ color: 'var(--primary-green)' }}>notifications_active</span>
                  <span style={{ fontSize: '15px' }}>Push Notifications</span>
                </div>
                <input 
                  type="checkbox" 
                  checked={notifsEnabled} 
                  onChange={() => setNotifsEnabled(!notifsEnabled)}
                  style={{ accentColor: 'var(--primary-green)', width: '20px', height: '20px', cursor: 'pointer' }} 
                />
              </div>
            </div>

            {/* General Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>General</h3>
              
              {/* About Button */}
              <div 
                onClick={() => setShowAbout(true)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span className="material-symbols-outlined" style={{ color: 'var(--primary-green)' }}>info</span>
                  <span style={{ fontSize: '15px' }}>About Agro Connect</span>
                </div>
                <span className="material-symbols-outlined" style={{ color: 'var(--text-secondary)' }}>chevron_right</span>
              </div>

              {/* Privacy Policy */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span className="material-symbols-outlined" style={{ color: 'var(--primary-green)' }}>shield</span>
                  <span style={{ fontSize: '15px' }}>Privacy & Security</span>
                </div>
                <span className="material-symbols-outlined" style={{ color: 'var(--text-secondary)' }}>chevron_right</span>
              </div>
            </div>

            <Button 
              onClick={onLogout}
              variant="secondary"
              style={{ marginTop: '24px', borderColor: 'var(--error)', color: 'var(--error)' }}
              icon="logout"
            >
              Log Out
            </Button>
          </>
        ) : (
          /* About Page detail view */
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '24px 0', gap: '16px' }}>
            <img src="/logo.png" alt="Agro Connect Logo" style={{ height: '72px', width: 'auto', marginBottom: '12px' }} />
            <h2 style={{ fontSize: '22px', fontWeight: '800' }}>Agro Connect</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Version 1.0.0 (UI Prototype)</p>
            
            <p style={{ fontSize: '14px', lineHeight: '1.6', color: '#dddddd', marginTop: '12px' }}>
              Agro Connect is a premium agricultural networking application designed to connect farmers, soil scientists, agronomists, and suppliers. By sharing local knowledge, crop updates, disease alerts, and equipment tools, we aim to build a sustainable farming future.
            </p>

            <div style={{ flex: 1 }}></div>

            <Button 
              onClick={() => setShowAbout(false)}
              variant="primary"
              style={{ width: '100%', marginTop: '32px' }}
            >
              Go Back
            </Button>
          </div>
        )}

      </div>
    </div>
  );
}
