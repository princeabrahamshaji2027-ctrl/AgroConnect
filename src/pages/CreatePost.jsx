import React, { useState, useEffect, useRef } from 'react';
import Header from '../components/Header';
import InputField from '../components/InputField';
import { Button } from '../components/Button';
import { supabase } from '../supabase';
import './pages.css';

const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

// Detect Capacitor environment
const isCapacitor = () => typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();

export default function CreatePost({ onPublish, onCancel }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('General');
  const [location, setLocation] = useState('Punjab, India');
  const [tagsInput, setTagsInput] = useState('');

  // Media selection states
  const [mediaType, setMediaType] = useState('image'); // 'image' | 'video'
  const [previewUrl, setPreviewUrl] = useState(null); // local object URL or data URI for preview
  const [selectedFile, setSelectedFile] = useState(null); // File object (web) or base64 data

  // Upload progress & errors
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [permissionError, setPermissionError] = useState(null);

  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);

  // Auto-detect GPS location on load
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setLocation(`Ludhiana, Punjab (GPS: ${lat.toFixed(4)}, ${lng.toFixed(4)})`);
        },
        () => {
          setLocation('Gill Village, Ludhiana, Punjab, India');
        }
      );
    }
  }, []);

  // ─── Capacitor camera/gallery picker ────────────────────────────────────────
  const handleCapacitorImagePick = async () => {
    setPermissionError(null);
    try {
      const { Camera } = await import('@capacitor/camera');
      const { CameraPermissionState } = await import('@capacitor/camera');

      // Request permissions contextually — only when user taps the picker
      const permResult = await Camera.requestPermissions({ permissions: ['camera', 'photos'] });
      if (permResult.photos === 'denied' || permResult.camera === 'denied') {
        setPermissionError('Camera/Gallery access denied. Please enable it in app Settings to pick an image.');
        return;
      }

      const photo = await Camera.getPhoto({
        resultType: 'dataUrl',
        source: 'PHOTOS',
        quality: 85,
        width: 1280,
      });

      // Convert data URL to File
      const res = await fetch(photo.dataUrl);
      const blob = await res.blob();
      if (blob.size > MAX_IMAGE_BYTES) {
        setPermissionError('Image is too large (max 10 MB). Please choose a smaller file.');
        return;
      }
      const file = new File([blob], `post_image_${Date.now()}.${photo.format}`, { type: blob.type });
      setSelectedFile(file);
      setPreviewUrl(photo.dataUrl);
    } catch (err) {
      if (err.message?.includes('cancelled') || err.message?.includes('user cancelled')) return;
      console.error('Camera error:', err);
      setPermissionError('Could not access media. Please check app permissions in Settings.');
    }
  };

  const handleCapacitorVideoPick = async () => {
    setPermissionError(null);
    try {
      const { Camera } = await import('@capacitor/camera');

      const permResult = await Camera.requestPermissions({ permissions: ['photos'] });
      if (permResult.photos === 'denied') {
        setPermissionError('Gallery access denied. Please enable it in app Settings to pick a video.');
        return;
      }

      // For video on Capacitor, use the CameraSource.PHOTOS with video limit
      // Note: Full video recording would also need microphone permission — only request if recording
      const photo = await Camera.getPhoto({
        resultType: 'dataUrl',
        source: 'PHOTOS',
        // We rely on the native picker's ability to select video files
        allowEditing: false,
        quality: 85,
      });

      const res = await fetch(photo.dataUrl);
      const blob = await res.blob();
      if (blob.size > MAX_VIDEO_BYTES) {
        setPermissionError(`Video too large (max 50 MB / ~60 seconds). Please trim and try again.`);
        return;
      }
      const file = new File([blob], `post_video_${Date.now()}.${photo.format || 'mp4'}`, { type: 'video/mp4' });
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      if (err.message?.includes('cancelled') || err.message?.includes('user cancelled')) return;
      console.error('Video pick error:', err);
      setPermissionError('Could not access media. Please check app permissions in Settings.');
    }
  };

  // ─── Web file input fallback ─────────────────────────────────────────────────
  const handleWebImageChange = (e) => {
    setPermissionError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setPermissionError('Image is too large (max 10 MB). Please choose a smaller file.');
      return;
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleWebVideoChange = (e) => {
    setPermissionError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_VIDEO_BYTES) {
      setPermissionError(`Video too large (max 50 MB / ~60 seconds). Please trim and try again.`);
      return;
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  // ─── Unified media picker ────────────────────────────────────────────────────
  const handlePickMedia = () => {
    setPermissionError(null);
    if (isCapacitor()) {
      if (mediaType === 'image') {
        handleCapacitorImagePick();
      } else {
        handleCapacitorVideoPick();
      }
    } else {
      // Web fallback: trigger hidden file input
      if (mediaType === 'image') {
        imageInputRef.current?.click();
      } else {
        videoInputRef.current?.click();
      }
    }
  };

  const openAppSettings = () => {
    if (isCapacitor() && window.Capacitor?.Plugins?.NativeSettings) {
      window.Capacitor.Plugins.NativeSettings.open({ option: 'application_details' });
    }
  };

  // ─── Publish handler ─────────────────────────────────────────────────────────
  const handlePublish = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      alert('Please fill out Title and Caption fields');
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let storagePath = null;
      let finalMediaType = mediaType; // 'image' | 'video'

      if (selectedFile) {
        const bucket = mediaType === 'video' ? 'post-videos' : 'post-images';
        const ext = selectedFile.name.split('.').pop() || (mediaType === 'video' ? 'mp4' : 'jpg');
        const fileName = `${user.id}/${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(fileName, selectedFile, { upsert: false, contentType: selectedFile.type });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
        storagePath = urlData.publicUrl;
      }

      const tags = tagsInput
        .split(',')
        .map(tag => tag.trim().toLowerCase())
        .filter(tag => tag.length > 0);

      const { data: inserted, error: insertError } = await supabase
        .from('posts')
        .insert({
          user_id: user.id,
          caption: `${title.trim()}\n\n${content.trim()}`,
          image_path: storagePath,
          category,
          location,
          media_type: finalMediaType,
          status: 'Approved',
        })
        .select()
        .single();

      if (insertError) throw insertError;

      if (onPublish) onPublish(inserted);
    } catch (err) {
      console.error('Publish error:', err);
      setUploadError(err.message || 'Failed to publish post. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Header title="Create Post" showBack onBackClick={onCancel} />

      <form onSubmit={handlePublish} className="page-container fade-in" style={{ gap: '16px', overflowY: 'auto', marginTop: 'var(--header-height)' }}>

        {/* Media Type Selector */}
        <div className="form-group">
          <label className="form-label">Content Type</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['image', 'video'].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setMediaType(type);
                  setSelectedFile(null);
                  setPreviewUrl(null);
                  setPermissionError(null);
                }}
                className={`chip ${mediaType === type ? 'active' : ''}`}
                style={{ flex: 1, justifyContent: 'center', textTransform: 'capitalize' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                  {type === 'image' ? 'image' : 'videocam'}
                </span>
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Hidden file inputs for web fallback */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleWebImageChange}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          style={{ display: 'none' }}
          onChange={handleWebVideoChange}
        />

        {/* Media Preview / Picker */}
        <div
          onClick={handlePickMedia}
          style={{
            width: '100%',
            minHeight: '140px',
            borderRadius: 'var(--border-radius)',
            border: permissionError ? '2px dashed var(--error)' : '2px dashed var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            backgroundColor: 'rgba(30, 30, 30, 0.5)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {previewUrl && mediaType === 'image' && (
            <img
              src={previewUrl}
              alt="Preview"
              style={{ width: '100%', height: '140px', objectFit: 'cover', position: 'absolute', inset: 0 }}
            />
          )}
          {previewUrl && mediaType === 'video' && (
            <video
              src={previewUrl}
              controls={false}
              style={{ width: '100%', height: '140px', objectFit: 'cover', position: 'absolute', inset: 0 }}
            />
          )}
          {!previewUrl && (
            <>
              <span className="material-symbols-outlined" style={{ fontSize: '36px', color: 'var(--primary-green)', marginBottom: '8px' }}>
                {mediaType === 'image' ? 'add_photo_alternate' : 'video_call'}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Tap to pick {mediaType === 'image' ? 'Image' : 'Video'}
              </span>
              {mediaType === 'video' && (
                <span style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Max 60 seconds / 50 MB
                </span>
              )}
            </>
          )}
          {previewUrl && (
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.6)', padding: '6px', textAlign: 'center', fontSize: '10px', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>check_circle</span>
              {mediaType === 'image' ? 'Image selected — tap to change' : 'Video selected — tap to change'}
            </div>
          )}
        </div>

        {/* Permission error display */}
        {permissionError && (
          <div style={{
            backgroundColor: 'rgba(231, 76, 60, 0.12)',
            border: '1px solid var(--error)',
            borderRadius: '12px',
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--error)', fontSize: '18px', flexShrink: 0 }}>error</span>
              <span style={{ fontSize: '13px', color: '#ffaaaa', lineHeight: '1.4' }}>{permissionError}</span>
            </div>
            <button
              type="button"
              onClick={openAppSettings}
              style={{ background: 'transparent', border: '1px solid var(--error)', color: 'var(--error)', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', alignSelf: 'flex-start' }}
            >
              Open App Settings
            </button>
          </div>
        )}

        {/* Upload error */}
        {uploadError && (
          <div style={{ backgroundColor: 'rgba(231, 76, 60, 0.12)', border: '1px solid var(--error)', borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="material-symbols-outlined" style={{ color: 'var(--error)', fontSize: '18px' }}>warning</span>
            <span style={{ fontSize: '13px', color: '#ffaaaa' }}>{uploadError}</span>
          </div>
        )}

        {/* Title */}
        <InputField
          label="Post Title *"
          placeholder="e.g. Pest damage on Rice crop leaves"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          icon="title"
          required
        />

        {/* Caption */}
        <div className="form-group">
          <label className="form-label">Caption / Description *</label>
          <div className="input-container" style={{ padding: '8px 16px' }}>
            <textarea
              className="input-field"
              rows="4"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Provide detailed coordinates, symptoms, fertilizer history, etc."
              style={{ resize: 'none', height: '90px' }}
              required
            />
          </div>
        </div>

        {/* Category */}
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
          label="Location (GPS Auto-detected)"
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

        <div style={{ display: 'flex', gap: '12px', marginTop: '12px', paddingBottom: '32px' }}>
          <Button type="button" variant="text" onClick={onCancel} style={{ flex: '0.8' }} disabled={uploading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" style={{ flex: '1.2' }} disabled={uploading}>
            {uploading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="material-symbols-outlined" style={{ animation: 'spin 1.5s infinite linear', fontSize: '18px' }}>
                  progress_activity
                </span>
                Publishing...
              </span>
            ) : 'Publish Post'}
          </Button>
        </div>

      </form>
    </div>
  );
}
