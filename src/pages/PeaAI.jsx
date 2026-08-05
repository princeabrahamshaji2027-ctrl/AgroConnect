import React, { useState, useEffect, useRef } from 'react';
import Header from '../components/Header';
import InputField from '../components/InputField';
import './pages.css';

// Simple markdown formatter component to render bold text, lists, and headers nicely without third-party libraries
function SimpleMarkdown({ text }) {
  const lines = text.split('\n');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {lines.map((line, idx) => {
        let content = line.trim();
        
        // Headers (### Header)
        if (content.startsWith('###')) {
          return (
            <h4 key={idx} style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary-green)', margin: '6px 0 2px 0' }}>
              {content.substring(3).trim()}
            </h4>
          );
        }
        if (content.startsWith('##')) {
          return (
            <h3 key={idx} style={{ fontSize: '15px', fontWeight: '700', color: 'var(--primary-green)', margin: '8px 0 4px 0' }}>
              {content.substring(2).trim()}
            </h3>
          );
        }
        
        // Bullet points (* Item)
        if (content.startsWith('*') || content.startsWith('-')) {
          const rawText = content.substring(1).trim();
          return (
            <div key={idx} style={{ display: 'flex', gap: '6px', paddingLeft: '8px', fontSize: '13px', lineHeight: '1.4', color: '#eeeeee' }}>
              <span>•</span>
              <span>{parseBold(rawText)}</span>
            </div>
          );
        }
        
        // Empty lines
        if (!content) {
          return <div key={idx} style={{ height: '4px' }} />;
        }
        
        // Regular line
        return (
          <p key={idx} style={{ fontSize: '13.5px', lineHeight: '1.45', color: '#eeeeee', margin: 0 }}>
            {parseBold(content)}
          </p>
        );
      })}
    </div>
  );
}

// Inline Bold parser
function parseBold(text) {
  const parts = text.split('**');
  return parts.map((part, index) => {
    // Odd indexes are bold
    if (index % 2 === 1) {
      return <strong key={index} style={{ color: 'white', fontWeight: '700' }}>{part}</strong>;
    }
    return part;
  });
}

export default function PeaAI({ onGoBack }) {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      sender: 'pea',
      text: "Hello! I am **PEA**, your personal Agro Connect AI Assistant. 🌾🌱\n\nI can help you answer questions regarding:\n* **Plant Diseases & Pests**\n* **Organic Farming & Vermicompost**\n* **Fertilizers & Soil Health**\n* **Market Prices & Crop Suggestions**\n\nWhat would you like to grow or troubleshoot today?",
      time: 'Just now'
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  const suggestedPrompts = [
    "Identify Tomato Early Blight",
    "How to make Vermicompost?",
    "Best crop rotation for wheat",
    "Current organic rice tips"
  ];

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping]);

  const getAIResponse = (query) => {
    const q = query.toLowerCase();
    
    if (q.includes('blight') || q.includes('tomato')) {
      return "### Tomato Early Blight Control 🍅\n\nEarly blight is caused by the fungus *Alternaria solani*.\n\n**Symptoms:**\n* Dark, concentric circles (target spots) on older leaves.\n* Yellowing of leaves surrounding the spot, leading to defoliation.\n\n**Organic Control:**\n* Spray **copper fungicides** or biological controls like *Bacillus subtilis* early in the morning.\n* Prune the lower leaves of tomato plants to prevent soil-borne spores from splashing onto foliage.\n* Mulch around the base of the plant.\n\n**Prevention:**\n* Maintain a **3-year crop rotation** (avoid rotating with potatoes or eggplants).";
    }
    
    if (q.includes('vermicompost') || q.includes('compost')) {
      return "### How to Setup Vermicomposting 🪱\n\nVermicomposting uses earthworms to quickly convert organic waste into high-grade nutrient fertilizer.\n\n**Steps to build:**\n1. **Get a Bin:** Drill breathing holes in a 50L plastic container.\n2. **Bedding:** Place shredded wet newspaper, cardboard, or dry coco-coir at the bottom (5-6 inches deep).\n3. **Add Worms:** Introduce **Red Wiggler worms** (*Eisenia fetida*).\n4. **Feeding:** Feed them fruit/vegetable scraps, tea bags, coffee grounds, and crushed eggshells. Avoid dairy, meat, garlic, and citrus.\n5. **Harvesting:** Harvest the dark worm castings after 2-3 months by moving food to one side.";
    }

    if (q.includes('wheat') || q.includes('rotation')) {
      return "### Wheat Crop Rotation Strategy 🌾\n\nRotating crops prevents nutrient depletion and breaks pest life cycles.\n\n**Recommended Rotations:**\n* **Wheat-Rice Rotation:** Popular in North India, but requires strict soil rejuvenation between cycles.\n* **Wheat-Legumes (Mung bean / Chickpea):** Excellent for nitrogen fixation. Replaces depleted soil nitrogen naturally.\n* **Wheat-Mustard:** Breaks grass weed cycles and yields dual profits.";
    }

    if (q.includes('rice') || q.includes('organic')) {
      return "### Organic Rice Farming Tips 🌾🌱\n\n* **System of Rice Intensification (SRI):** Uses less water and seeds, promotes organic compost feeding.\n* **Azolla Biofertilizer:** Floating nitrogen-fixing fern that grows rapidly in paddy fields and adds 30-40 kg N/ha.\n* **Pest Control:** Use Trichogramma egg parasitoid cards for stem borer management.";
    }

    return "### Agro Connect AI Support 🌾\n\nThanks for asking! To get the best guidance:\n* Provide details of **soil type**, **irrigation**, and **symptoms**.\n* Or ask about specific crops like **Tomato, Rice, Wheat, or Maize**.\n\nI am continually learning from our verified Agronomists to give you the most accurate regional advice.";
  };

  const handleSend = (textToSend) => {
    if (!textToSend.trim()) return;

    const userMessage = {
      id: `msg_u_${Date.now()}`,
      sender: 'user',
      text: textToSend,
      time: 'Just now'
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsTyping(true);

    // Simulate AI thinking and typing response
    setTimeout(() => {
      const aiResponseText = getAIResponse(textToSend);
      const aiMessage = {
        id: `msg_a_${Date.now()}`,
        sender: 'pea',
        text: aiResponseText,
        time: 'Just now'
      };
      setIsTyping(false);
      setMessages(prev => [...prev, aiMessage]);
    }, 1500);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-dark)' }}>
      <Header title="PEA AI Assistant" showBack onBackClick={onGoBack} />
      
      {/* Messages viewport */}
      <div className="page-container fade-in" style={{ paddingBottom: '76px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div className="chat-messages-area" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {messages.map(m => (
            <div 
              key={m.id}
              className={`chat-bubble ${m.sender === 'user' ? 'sent' : 'received'}`}
              style={{
                alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%'
              }}
            >
              <SimpleMarkdown text={m.text} />
              <span style={{ fontSize: '10px', opacity: 0.5, display: 'block', marginTop: '6px', textAlign: 'right' }}>
                {m.time}
              </span>
            </div>
          ))}
          
          {isTyping && (
            <div className="chat-bubble received" style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '12px 16px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>PEA is typing</span>
              <div style={{ display: 'flex', gap: '3px' }}>
                <span className="skeleton" style={{ width: '6px', height: '6px', borderRadius: '50%' }}></span>
                <span className="skeleton" style={{ width: '6px', height: '6px', borderRadius: '50%', animationDelay: '0.2s' }}></span>
                <span className="skeleton" style={{ width: '6px', height: '6px', borderRadius: '50%', animationDelay: '0.4s' }}></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Prompt Chips */}
        {messages.length === 1 && !isTyping && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '8px 0 16px 0' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Suggested Prompts</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {suggestedPrompts.map(prompt => (
                <button
                  key={prompt}
                  onClick={() => handleSend(prompt)}
                  className="chip"
                  style={{ fontSize: '12px', borderColor: 'rgba(136, 217, 130, 0.3)', backgroundColor: 'rgba(136, 217, 130, 0.05)' }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Chat Input Bar */}
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            handleSend(inputText);
          }}
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
          <div style={{ flex: 1 }}>
            <InputField
              placeholder="Ask PEA anything about farming..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              required
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
    </div>
  );
}
