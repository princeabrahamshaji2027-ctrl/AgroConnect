import React, { useState, useRef } from 'react';
import { supabase } from '../supabase';
import defaultAvatar from '../assets/profile-placeholder.png';

export default function TopNav({ userProfile, onMenuClick, sidebarOpen, onProfileUpdate }) {
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Image file size must be less than 5MB');
      return;
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleUploadAvatar = async () => {
    if (!selectedFile || !userProfile?.id) return;
    setUploading(true);
    try {
      const ext = selectedFile.name.split('.').pop() || 'png';
      const filePath = `admin_${userProfile.id}_${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, selectedFile, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ profile_image_path: publicUrl })
        .eq('id', userProfile.id);

      if (updateError) throw updateError;

      // Log audit
      await supabase.from('admin_audit_log').insert({
        admin_id: userProfile.id,
        action: 'update_admin_avatar',
        target_table: 'profiles',
        target_id: userProfile.id
      });

      if (onProfileUpdate) onProfileUpdate({ ...userProfile, profile_image_path: publicUrl });
      setShowAvatarModal(false);
      setSelectedFile(null);
      setPreviewUrl('');
    } catch (err) {
      alert(`Avatar upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <header className={`fixed top-0 right-0 h-16 bg-surface border-b border-outline-variant flex justify-between items-center px-6 z-40 transition-all duration-300 ${sidebarOpen ? 'w-[calc(100%-260px)]' : 'w-full'}`}>
        <div className="flex items-center">
          <span
            className="material-symbols-outlined text-on-surface-variant cursor-pointer mr-4 hover:text-primary transition-colors select-none"
            onClick={onMenuClick}
            title="Toggle Sidebar"
          >
            menu
          </span>
        </div>

        <div
          className="flex items-center gap-3 border-l border-outline-variant pl-6 cursor-pointer hover:opacity-85 transition-opacity"
          onClick={() => setShowAvatarModal(true)}
          title="Click to change profile picture"
        >
          <div className="flex flex-col items-end">
            <span className="font-label-md text-on-surface font-bold">
              {userProfile?.full_name || 'Admin'}
            </span>
            <span className="font-label-sm text-on-surface-variant">Super Admin</span>
          </div>
          <div className="relative group">
            <img
              alt="Admin User Avatar"
              className="w-9 h-9 rounded-full object-cover border border-outline-variant group-hover:border-primary-container transition-colors"
              src={userProfile?.profile_image_path || defaultAvatar}
            />
            <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <span className="material-symbols-outlined text-[14px] text-white">photo_camera</span>
            </div>
          </div>
        </div>
      </header>

      {/* Admin Profile Picture Modal */}
      {showAvatarModal && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="max-w-md w-full card-bg rounded-xl border border-outline-variant p-6 flex flex-col gap-5 shadow-2xl">
            <div className="flex justify-between items-center border-b border-outline-variant/30 pb-3">
              <h2 className="font-headline-lg-mobile text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary-container">account_circle</span>
                <span>Admin Profile Photo</span>
              </h2>
              <button
                onClick={() => setShowAvatarModal(false)}
                className="text-on-surface-variant hover:text-on-surface cursor-pointer"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="flex flex-col items-center gap-4">
              <div className="w-28 h-28 rounded-full overflow-hidden border-2 border-primary-container relative bg-surface-variant">
                <img
                  src={previewUrl || userProfile?.profile_image_path || defaultAvatar}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-surface-variant hover:bg-surface-variant/80 text-on-surface border border-outline-variant px-4 py-2 rounded-lg font-label-md transition-colors flex items-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">file_upload</span>
                <span>Select New Photo</span>
              </button>
            </div>

            <div className="flex justify-end gap-3 border-t border-outline-variant/30 pt-3">
              <button
                onClick={() => {
                  setShowAvatarModal(false);
                  setSelectedFile(null);
                  setPreviewUrl('');
                }}
                className="bg-surface-variant text-on-surface px-4 py-2 rounded-lg font-label-md cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleUploadAvatar}
                disabled={!selectedFile || uploading}
                className="bg-primary-container text-on-primary-container font-semibold px-4 py-2 rounded-lg font-label-md disabled:opacity-50 cursor-pointer flex items-center gap-2"
              >
                {uploading ? (
                  <span className="animate-spin h-4 w-4 border-2 border-on-primary-container border-t-transparent rounded-full" />
                ) : (
                  <span>Save Photo</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
