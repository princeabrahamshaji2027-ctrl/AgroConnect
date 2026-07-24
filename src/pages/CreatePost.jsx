import React, { useState } from 'react';
import Header from '../components/Header';
import InputField from '../components/InputField';
import { Button } from '../components/Button';
import './pages.css';

export default function CreatePost({ onPublish, onCancel }) {
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('General');
  const [location, setLocation] = useState('Punjab, India');
  const [tagsInput, setTagsInput] = useState('');
  const [image, setImage] = useState(null);

  const handlePublish = (e) => {
    e.preventDefault();
    if (!content.trim()) return;

    const tags = tagsInput
      .split(',')
      .map(tag => tag.trim().toLowerCase())
      .filter(tag => tag.length > 0);

    if (onPublish) {
      onPublish({
        id: `post_${Date.now()}`,
        userId: 'user1',
        userName: 'Ramesh Kumar',
        userAvatar: 'https://images.unsplash.com/photo-1542435503-956c469947f6?auto=format&fit=crop&q=80&w=200&h=200',
        userRole: 'Farmer',
        content,
        image: image || 'https://images.unsplash.com/photo-1530595467537-0b5996c41f2d?auto=format&fit=crop&q=80&w=600&h=400',
        likes: 0,
        comments: [],
        category,
        location,
        tags,
        time: 'Just now',
        bookmarked: false,
        liked: false
      });
    }
  };

  const handleSelectMockImage = () => {
    // Simulate image pick by choosing a random stock crop image
    const images = [
      'https://images.unsplash.com/photo-1530595467537-0b5996c41f2d?auto=format&fit=crop&q=80&w=600&h=400',
      'https://images.unsplash.com/photo-1592417817098-8f3d6eb19675?auto=format&fit=crop&q=80&w=600&h=400',
      'https://images.unsplash.com/photo-1563514223768-45198aeeed77?auto=format&fit=crop&q=80&w=600&h=400'
    ];
    const picked = images[Math.floor(Math.random() * images.length)];
    setImage(picked);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Header title="Create Post" showBack onBackClick={onCancel} />
      
      <form onSubmit={handlePublish} className="page-container fade-in" style={{ gap: '16px' }}>
        
        {/* Mock Image Picker */}
        <div 
          onClick={handleSelectMockImage}
          style={{ 
            width: '100%', 
            height: '160px', 
            borderRadius: 'var(--border-radius)', 
            border: '2px dashed var(--border-color)', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center',
            cursor: 'pointer',
            backgroundColor: 'rgba(30, 30, 30, 0.5)',
            backgroundImage: image ? `url(${image})` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          {!image && (
            <>
              <span className="material-symbols-outlined" style={{ fontSize: '36px', color: 'var(--primary-green)', marginBottom: '8px' }}>
                add_photo_alternate
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Upload Post Image</span>
            </>
          )}
          {image && (
            <div style={{ position: 'absolute', bottom: '0', left: '0', right: '0', background: 'rgba(0,0,0,0.6)', padding: '6px', textAlign: 'center', fontSize: '11px', color: 'white' }}>
              Click to change image
            </div>
          )}
        </div>

        {/* Caption */}
        <div className="form-group">
          <label className="form-label">Caption</label>
          <div className="input-container" style={{ padding: '8px 16px' }}>
            <textarea
              className="input-field"
              rows="4"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's growing on your farm today? Share updates or ask questions..."
              style={{ resize: 'none', height: '100px' }}
              required
            />
          </div>
        </div>

        {/* Category selection */}
        <div className="form-group">
          <label className="form-label">Category</label>
          <div className="input-container">
            <span className="material-symbols-outlined input-icon">category</span>
            <select 
              value={category} 
              onChange={(e) => setCategory(e.target.value)}
              className="input-field"
              style={{ backgroundColor: 'transparent', color: 'white', border: 'none', appearance: 'none' }}
            >
              <option value="General" style={{ backgroundColor: '#1E1E1E' }}>General Discussion</option>
              <option value="Organic Farming" style={{ backgroundColor: '#1E1E1E' }}>Organic Farming</option>
              <option value="Pest Control" style={{ backgroundColor: '#1E1E1E' }}>Pest Control</option>
              <option value="Agri Tech" style={{ backgroundColor: '#1E1E1E' }}>Agri Tech / Machinery</option>
              <option value="Market Prices" style={{ backgroundColor: '#1E1E1E' }}>Market Prices</option>
            </select>
          </div>
        </div>

        {/* Location */}
        <InputField
          label="Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          icon="location_on"
        />

        {/* Tags */}
        <InputField
          label="Tags (comma separated)"
          placeholder="e.g. wheat, organic, soil"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          icon="sell"
        />

        <div style={{ display: 'flex', gap: '12px', marginTop: '16px', paddingBottom: '32px' }}>
          <Button variant="text" onClick={onCancel} style={{ flex: '0.8' }}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel} style={{ flex: '1' }}>
            Save Draft
          </Button>
          <Button type="submit" variant="primary" style={{ flex: '1.2' }}>
            Publish
          </Button>
        </div>

      </form>
    </div>
  );
}
