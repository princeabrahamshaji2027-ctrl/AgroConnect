import React, { useState, useEffect, useRef } from 'react';
import Header from '../components/Header';
import InputField from '../components/InputField';
import { useFormValidation } from '../utils/useFormValidation';
import { Button } from '../components/Button';
import { validateRequiredText, validateImageFile, validateVideoFile } from '../utils/validation';
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
  const [location, setLocation] = useState('');
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

  // Location starts from the author's saved profile (the post's district is set by the server from the profile)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const { data } = await supabase.from('profiles').select('location, district').eq('id', session.user.id).maybeSingle();
      if (cancelled || !data) return;
      setLocation((prev) => prev || data.location || (data.district ? `${data.district}, Kerala` : ''));
    })();
    return () => { cancelled = true; };
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

  // ─── Web file input fallback ─────────────────────────────────────────────────
  const handleWebImageChange = async (e) => {
    setPermissionError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const imgVal = await validateImageFile(file, 10);
    if (!imgVal.isValid) {
      setPermissionError(imgVal.error);
      if (imageInputRef.current) imageInputRef.current.value = '';
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleWebVideoChange = async (e) => {
    setPermissionError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const vidVal = await validateVideoFile(file, MAX_VIDEO_BYTES / (1024 * 1024));
    if (!vidVal.isValid) {
      setPermissionError(vidVal.error);
      if (videoInputRef.current) videoInputRef.current.value = '';
      return;
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  // ─── Unified media picker ────────────────────────────────────────────────────
  // Videos always use the file input: on Android the WebView opens the system chooser, which offers videos. The
  // camera plugin's picker used before only returns photos, so "video" posts uploaded a photo labelled video/mp4.
  const handlePickMedia = () => {
    setPermissionError(null);
    if (mediaType === 'video') {
      videoInputRef.current?.click();
    } else if (isCapacitor()) {
      handleCapacitorImagePick();
    } else {
      imageInputRef.current?.click();
    }
  };

  const openAppSettings = () => {
    if (isCapacitor() && window.Capacitor?.Plugins?.NativeSettings) {
      window.Capacitor.Plugins.NativeSettings.open({ option: 'application_details' });
    }
  };

  // ─── Publish handler ─────────────────────────────────────────────────────────
  const postValues = { title, content };
  const v = useFormValidation({
    title: (val) => { const r = validateRequiredText(val || '', 'Post title', 2, 150); return r.isValid ? null : (val && val.trim() ? r.error : 'Please enter a post title.'); },
    content: (val) => { const r = validateRequiredText(val || '', 'Description', 5, 3000); return r.isValid ? null : (val && val.trim() ? r.error : 'Please enter a description.'); },
  });

  const handlePublish = async (e) => {
    e.preventDefault();
    if (uploading) return;
    if (!v.validateAll(postValues)) return;

    setUploading(true);
    setUploadError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let storagePath = null;
      let uploaded = null; // { bucket, fileName } so a failed post does not leave an orphan file
      // The file decides the type, not the selected tab.
      const finalMediaType = selectedFile?.type?.startsWith('video/') ? 'video' : 'image';

      if (selectedFile) {
        const bucket = finalMediaType === 'video' ? 'post-videos' : 'post-images';
        const ext = selectedFile.name.split('.').pop() || (finalMediaType === 'video' ? 'mp4' : 'jpg');
        const fileName = `${user.id}/${Date.now()}.${ext}`;

        const { error: storageError } = await supabase.storage
          .from(bucket)
          .upload(fileName, selectedFile, {
            upsert: false,
            contentType: selectedFile.type || (finalMediaType === 'video' ? 'video/mp4' : 'image/jpeg'),
          });

        if (storageError) throw new Error(`${finalMediaType === 'video' ? 'Video' : 'Image'} upload failed: ${storageError.message}. Your post was not published.`);
        uploaded = { bucket, fileName };

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

      if (insertError) {
        if (uploaded) await supabase.storage.from(uploaded.bucket).remove([uploaded.fileName]);
        throw insertError;
      }

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

      <form onSubmit={handlePublish} noValidate className="page-container fade-in" style={{ gap: '16px', overflowY: 'auto', marginTop: 'var(--header-height)' }}>

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
          onChange={(e) => { setTitle(e.target.value); v.changed('title', { ...postValues, title: e.target.value }); }}
          icon="title"
          maxLength={150}
          {...v.field('title', postValues)}
        />

        {/* Caption */}
        <InputField
          label="Caption / Description *"
          as="textarea"
          rows={4}
          value={content}
          placeholder="Provide detailed coordinates, symptoms, fertilizer history, etc."
          onChange={(e) => { setContent(e.target.value); v.changed('content', { ...postValues, content: e.target.value }); }}
          {...v.field('content', postValues)}
        />

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
                {selectedFile ? `Uploading ${mediaType}...` : 'Publishing...'}
              </span>
            ) : 'Publish Post'}
          </Button>
        </div>

      </form>
    </div>
  );
}
