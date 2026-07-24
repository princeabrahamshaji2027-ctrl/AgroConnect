import React, { useState, useEffect, useRef } from 'react';
import Header from '../components/Header';
import InputField from '../components/InputField';
import { Button } from '../components/Button';
import './pages.css';

export default function Chat() {
  const [activeThread, setActiveThread] = useState(null);
  const [newMsg, setNewMsg] = useState('');
  const messagesEndRef = useRef(null);

  const threads = [
    {
      id: 'thread1',
      name: 'Ramesh Kumar',
      avatar: 'https://images.unsplash.com/photo-1542435503-956c469947f6?auto=format&fit=crop&q=80&w=200&h=200',
      lastMsg: 'Thanks for the vermicompost tips. I will try it on my basmati crops.',
      time: '12:30 PM',
      messages: [
        { id: 'm1', sender: 'them', text: 'Hello, are you available to help with a vermicompost setup question?', time: '12:15 PM' },
        { id: 'm2', sender: 'me', text: 'Sure Ramesh! What do you need help with?', time: '12:20 PM' },
        { id: 'm3', sender: 'them', text: 'Thanks for the vermicompost tips. I will try it on my basmati crops.', time: '12:30 PM' }
      ]
    },
    {
      id: 'thread2',
      name: 'Dr. Anita Rao',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200&h=200',
      lastMsg: 'Early copper fungicide spray is recommended. Let me know if symptoms persist.',
      time: 'Yesterday',
      messages: [
        { id: 'm4', sender: 'me', text: 'Doctor, my tomato leaves are showing dark circles. Is it early blight?', time: 'Yesterday 10:15 AM' },
        { id: 'm5', sender: 'them', text: 'Yes, that looks like early blight. Early copper fungicide spray is recommended. Let me know if symptoms persist.', time: 'Yesterday 11:30 AM' }
      ]
    }
  ];

  const [activeThreads, setActiveThreads] = useState(threads);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeThread, activeThreads]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!newMsg.trim() || !activeThread) return;

    const myMessage = {
      id: `msg_${Date.now()}`,
      sender: 'me',
      text: newMsg,
      time: 'Just now'
    };

    const updatedThreads = activeThreads.map(t => {
      if (t.id === activeThread.id) {
        const messages = [...t.messages, myMessage];
        const updated = { ...t, lastMsg: newMsg, time: 'Just now', messages };
        setActiveThread(updated); // Sync active view
        return updated;
      }
      return t;
    });

    setActiveThreads(updatedThreads);
    setNewMsg('');

    // Trigger mock auto response after 1.5 seconds
    setTimeout(() => {
      const responseMessage = {
        id: `msg_${Date.now() + 1}`,
        sender: 'them',
        text: "Thanks for your message! This is a mock automated reply. Looking forward to talking further.",
        time: 'Just now'
      };

      const finalThreads = updatedThreads.map(t => {
        if (t.id === activeThread.id) {
          const messages = [...t.messages, responseMessage];
          const updated = { ...t, lastMsg: responseMessage.text, time: 'Just now', messages };
          // Only update active if they are still on the same thread
          if (activeThread.id === t.id) {
            setActiveThread(updated);
          }
          return updated;
        }
        return t;
      });
      setActiveThreads(finalThreads);
    }, 1500);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {!activeThread ? (
        /* Conversation list */
        <>
          <Header title="Messages" />
          <div className="page-container fade-in">
            <div className="chat-thread-list">
              {activeThreads.map(t => (
                <div 
                  key={t.id} 
                  className="chat-thread-item"
                  onClick={() => setActiveThread(t)}
                >
                  <img src={t.avatar} alt={t.name} className="chat-thread-avatar" />
                  <div className="chat-thread-details">
                    <div className="chat-thread-name-row">
                      <span className="chat-thread-name">{t.name}</span>
                      <span className="chat-thread-time">{t.time}</span>
                    </div>
                    <p className="chat-thread-msg">{t.lastMsg}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        /* Active chat screen */
        <>
          <Header 
            title={activeThread.name} 
            showBack 
            onBackClick={() => setActiveThread(null)} 
            rightActions={
              <img src={activeThread.avatar} alt={activeThread.name} style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
            }
          />
          
          <div className="page-container fade-in" style={{ paddingBottom: '76px', display: 'flex', flexDirection: 'column' }}>
            <div className="chat-messages-area">
              {activeThread.messages.map(m => (
                <div 
                  key={m.id}
                  className={`chat-bubble ${m.sender === 'me' ? 'sent' : 'received'}`}
                >
                  <div>{m.text}</div>
                  <span style={{ fontSize: '10px', opacity: 0.6, alignSelf: 'flex-end', display: 'block', marginTop: '4px', textAlign: 'right' }}>
                    {m.time}
                  </span>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input */}
            <form 
              onSubmit={handleSendMessage}
              style={{
                position: 'absolute',
                bottom: `calc(var(--bottom-nav-height) + var(--safe-bottom) + 8px)`,
                left: '16px',
                right: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'var(--bg-dark)'
              }}
            >
              <button 
                type="button" 
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                title="Attach Files"
              >
                <span className="material-symbols-outlined">attach_file</span>
              </button>
              
              <div style={{ flex: 1 }}>
                <InputField
                  placeholder="Type a message..."
                  value={newMsg}
                  onChange={(e) => setNewMsg(e.target.value)}
                />
              </div>

              <button 
                type="submit" 
                style={{ 
                  background: 'var(--primary-green)', 
                  border: 'none', 
                  color: '#121212', 
                  width: '40px', 
                  height: '40px', 
                  borderRadius: '50%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  cursor: 'pointer' 
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>send</span>
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
