import React, { useState, useEffect, useRef } from 'react';
import Header from '../components/Header';
import { PostCard } from '../components/Card';
import { Button } from '../components/Button';
import InputField from '../components/InputField';
import Dialog from '../components/Dialog';
import { supabase } from '../supabase';
import './pages.css';

// Detect Capacitor
const isCapacitor = () => typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();

export default function UserProfile({ 
  userId = 'user1', 
  onEditProfileClick, 
  onSettingsClick, 
  onPostCommentClick,
  onCancelView,
  onProfileClick,
  onPeaAIClick,
  onShowToast
}) {
  const [user, setUser] = useState(null);
  const [userPosts, setUserPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Expert application state
  const [expertAppStatus, setExpertAppStatus] = useState(null); // null | 'Pending' | 'Approved' | 'Rejected'

  // Seller profile state
  const [sellerStatus, setSellerStatus] = useState(null); // null | 'Pending' | 'Verified' | 'Rejected'

  // KYC Expert Dialog states
  const [isKycOpen, setIsKycOpen] = useState(false);
  const [kycStep, setKycStep] = useState(1);

  // Expert Form Fields
  const [fullName, setFullName] = useState('');
  const [qualification, setQualification] = useState('');
  const [degree, setDegree] = useState('');
  const [experience, setExperience] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [institution, setInstitution] = useState('');
  const [license, setLicense] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [expertBio, setExpertBio] = useState('');

  // CV file for upload
  const [cvFile, setCvFile] = useState(null);
  const [cvFileName, setCvFileName] = useState('');
  const cvInputRef = useRef(null);

  // Become Seller Dialog
  const [isSellerOpen, setIsSellerOpen] = useState(false);
  const [shopName, setShopName] = useState('');
  const [sellerSubmitting, setSellerSubmitting] = useState(false);

  // Expert submit state
  const [expertSubmitting, setExpertSubmitting] = useState(false);

  const fetchProfile = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const targetUserId = userId === 'user1' ? authUser?.id : userId;
      if (!targetUserId) return;

      // Fetch profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', targetUserId)
        .single();

      if (profile) {
        setUser({
          id: profile.id,
          name: profile.full_name,
          username: profile.full_name?.toLowerCase().replace(/\s+/g, '') || '',
          avatar: profile.profile_image_path || 'https://images.unsplash.com/photo-1542435503-956c469947f6?auto=format&fit=crop&q=80&w=200&h=200',
          role: profile.role,
          bio: profile.bio || '',
          location: profile.location || 'Punjab, India',
          isBanned: profile.is_banned || false,
        });
        setFullName(profile.full_name || '');
      }

      // Fetch user posts
      const { data: postsData } = await supabase
        .from('posts')
        .select('*, profiles:user_id(full_name, profile_image_path, role)')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false });

      if (postsData) {
        setUserPosts(postsData.map(post => ({
          id: post.id,
          userId: post.user_id,
          userName: post.profiles?.full_name || 'Anonymous',
          userAvatar: post.profiles?.profile_image_path || 'https://images.unsplash.com/photo-1542435503-956c469947f6?auto=format&fit=crop&q=80&w=200&h=200',
          userRole: post.profiles?.role || 'Farmer',
          content: post.caption,
          image: post.image_path,
          mediaType: post.media_type || 'image',
          likes: post.like_count || 0,
          category: post.category,
          location: post.location,
          time: 'Recent',
          liked: false,
          bookmarked: false,
          comments: []
        })));
      }

      // Fetch expert application status (own profile only)
      if (userId === 'user1' && authUser?.id) {
        const { data: appData } = await supabase
          .from('expert_applications')
          .select('status')
          .eq('user_id', authUser.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        setExpertAppStatus(appData?.status || null);

        // Fetch seller profile status
        const { data: sellerData } = await supabase
          .from('seller_profiles')
          .select('verification_status')
          .eq('user_id', authUser.id)
          .maybeSingle();
        setSellerStatus(sellerData?.verification_status || null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [userId]);

  // Refetch on screen focus (visibility change covers app tab switching)
  useEffect(() => {
    const handleFocus = () => fetchProfile();
    document.addEventListener('visibilitychange', handleFocus);
    return () => document.removeEventListener('visibilitychange', handleFocus);
  }, [userId]);

  // ─── Expert KYC ────────────────────────────────────────────────────────────
  const handleBecomeExpertClick = () => {
    setIsKycOpen(true);
    setKycStep(1);
  };

  const handleNextKycStep = () => {
    if (kycStep === 1) {
      if (!qualification || !degree || !experience || !specialization || !institution) {
        alert('Please fill out all required professional details.');
        return;
      }
      setKycStep(2);
    } else if (kycStep === 2) {
      if (!cvFile) {
        alert('Please upload your CV/Resume file.');
        return;
      }
      setKycStep(3);
    }
  };

  const handleCvFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert('CV file too large. Max 10 MB.');
      return;
    }
    setCvFile(file);
    setCvFileName(file.name);
  };

  const handleCvPick = async () => {
    if (isCapacitor()) {
      // On native: use Filesystem plugin or Camera to get a document
      // For now fall through to web input (document picking not in Camera plugin)
      cvInputRef.current?.click();
    } else {
      cvInputRef.current?.click();
    }
  };

  const handleKycSubmit = async () => {
    if (!expertBio.trim()) {
      alert('Please enter your professional biography.');
      return;
    }
    if (!cvFile) {
      alert('CV file is required.');
      return;
    }

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    setExpertSubmitting(true);
    try {
      // 1. Upload CV to expert-cvs bucket
      const ext = cvFile.name.split('.').pop() || 'pdf';
      const cvPath = `${authUser.id}/${Date.now()}_cv.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('expert-cvs')
        .upload(cvPath, cvFile, { upsert: false, contentType: cvFile.type });
      if (uploadErr) throw uploadErr;

      // Get a signed URL for the CV (private bucket — admins can view via service role, but store path)
      const cvStoragePath = cvPath;

      // 2. Insert expert application
      const { error: insertErr } = await supabase
        .from('expert_applications')
        .insert({
          user_id: authUser.id,
          qualification: `${qualification} in ${degree} from ${institution}`,
          experience: `${experience} years. Specialization: ${specialization}. Bio: ${expertBio}`,
          cv_file_path: cvStoragePath,
          status: 'Pending'
        });
      if (insertErr) throw insertErr;

      setExpertAppStatus('Pending');
      setIsKycOpen(false);
      if (onShowToast) onShowToast('📋 Expert application submitted! Awaiting Admin approval.');
    } catch (err) {
      alert(`Submission failed: ${err.message}`);
    } finally {
      setExpertSubmitting(false);
    }
  };

  // ─── Become Seller ──────────────────────────────────────────────────────────
  const handleBecomeSellerClick = () => {
    setShopName('');
    setIsSellerOpen(true);
  };

  const handleSellerSubmit = async () => {
    if (!shopName.trim()) {
      alert('Please enter your shop name.');
      return;
    }
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    setSellerSubmitting(true);
    try {
      const { error } = await supabase
        .from('seller_profiles')
        .insert({
          user_id: authUser.id,
          shop_name: shopName.trim(),
          verification_status: 'Pending'
        });
      if (error) throw error;

      setSellerStatus('Pending');
      setIsSellerOpen(false);
      if (onShowToast) onShowToast('🏪 Seller application submitted! Awaiting Admin approval.');
    } catch (err) {
      alert(`Seller registration failed: ${err.message}`);
    } finally {
      setSellerSubmitting(false);
    }
  };

  const rightActions = (
    <button
      className="feed-header-icon"
      onClick={onSettingsClick}
      aria-label="Settings"
    >
      <span className="material-symbols-outlined">settings</span>
    </button>
  );

  if (loading || !user) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-dark)' }}>
        <span style={{ color: 'var(--primary-green)' }}>Loading profile...</span>
      </div>
    );
  }

  const isExpert = user.role === 'Agronomist' || user.role === 'Expert' || user.role === 'Distributor';
  const isOwnProfile = userId === 'user1';

  // Status badge helpers
  const ExpertStatusBadge = () => {
    if (isExpert) return null;
    if (!isOwnProfile) return null;
    if (expertAppStatus === 'Pending') return (
      <div style={{ textAlign: 'center', padding: '10px 16px', borderRadius: '14px', fontSize: '12px', color: '#FFA726', backgroundColor: 'rgba(255, 167, 38, 0.1)', border: '1px solid rgba(255, 167, 38, 0.25)', fontWeight: '600' }}>
        ⏳ Expert Application Pending Admin Approval
      </div>
    );
    if (expertAppStatus === 'Approved') return (
      <div style={{ textAlign: 'center', padding: '10px 16px', borderRadius: '14px', fontSize: '12px', color: 'var(--primary-green)', backgroundColor: 'rgba(136, 217, 130, 0.1)', border: '1px solid rgba(136, 217, 130, 0.25)', fontWeight: '600' }}>
        ✅ Expert Application Approved
      </div>
    );
    if (expertAppStatus === 'Rejected') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ textAlign: 'center', padding: '10px 16px', borderRadius: '14px', fontSize: '12px', color: 'var(--error)', backgroundColor: 'rgba(231, 76, 60, 0.1)', border: '1px solid rgba(231, 76, 60, 0.25)', fontWeight: '600' }}>
          ❌ Expert Application Rejected
        </div>
        <Button variant="secondary" onClick={handleBecomeExpertClick} style={{ width: '100%', fontSize: '12px', borderRadius: '14px', borderColor: 'var(--primary-green)', color: 'var(--primary-green)' }}>
          Reapply as Expert
        </Button>
      </div>
    );
    // No application yet
    return (
      <Button variant="secondary" onClick={handleBecomeExpertClick} style={{ width: '100%', padding: '10px 16px', borderRadius: '14px', fontSize: '13px', borderColor: 'var(--primary-green)', color: 'var(--primary-green)' }}>
        Become Verified Expert
      </Button>
    );
  };

  const SellerStatusBadge = () => {
    if (!isOwnProfile) return null;
    if (sellerStatus === 'Pending') return (
      <div style={{ textAlign: 'center', padding: '10px 16px', borderRadius: '14px', fontSize: '12px', color: '#FFA726', backgroundColor: 'rgba(255, 167, 38, 0.1)', border: '1px solid rgba(255, 167, 38, 0.25)', fontWeight: '600' }}>
        ⏳ Seller Application Pending Admin Approval
      </div>
    );
    if (sellerStatus === 'Verified') return (
      <div style={{ textAlign: 'center', padding: '10px 16px', borderRadius: '14px', fontSize: '12px', color: 'var(--primary-green)', backgroundColor: 'rgba(136, 217, 130, 0.1)', border: '1px solid rgba(136, 217, 130, 0.25)', fontWeight: '600' }}>
        🏪 Verified Seller
      </div>
    );
    if (sellerStatus === 'Rejected') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ textAlign: 'center', padding: '10px 16px', borderRadius: '14px', fontSize: '12px', color: 'var(--error)', backgroundColor: 'rgba(231, 76, 60, 0.1)', border: '1px solid rgba(231, 76, 60, 0.25)', fontWeight: '600' }}>
          ❌ Seller Application Rejected
        </div>
        <Button variant="secondary" onClick={handleBecomeSellerClick} style={{ width: '100%', fontSize: '12px', borderRadius: '14px' }}>
          Reapply as Seller
        </Button>
      </div>
    );
    return (
      <Button variant="secondary" onClick={handleBecomeSellerClick} style={{ width: '100%', padding: '10px 16px', borderRadius: '14px', fontSize: '13px' }}>
        Become a Seller
      </Button>
    );
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Header
        title="Profile"
        onPeaAIClick={onPeaAIClick}
        rightActions={rightActions}
        showBack={!!onCancelView}
        onBackClick={onCancelView}
      />

      <div className="page-container fade-in" style={{ paddingLeft: '0', paddingRight: '0', overflowY: 'auto' }}>

        {/* Profile Header Card */}
        <div className="profile-header-card" style={{ marginTop: 'var(--header-height)' }}>
          <img src={user.avatar} alt={user.name} className="profile-avatar-large" />

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
            <h2 className="profile-name">{user.name}</h2>
            {isExpert && (
              <span className="material-symbols-outlined" style={{ color: 'var(--primary-green)', fontSize: '20px' }}>verified</span>
            )}
          </div>
          <p className="profile-username">@{user.username}</p>

          <span className="badge-role" style={{ marginBottom: '12px' }}>{user.role}</span>

          {user.bio && <p className="profile-bio">{user.bio}</p>}

          <div className="profile-stats-row">
            <div className="profile-stat-box">
              <span className="profile-stat-val">{userPosts.length}</span>
              <span className="profile-stat-lbl">Posts</span>
            </div>
            <div className="profile-stat-box">
              <span className="profile-stat-val" style={{ color: 'var(--text-primary)', fontSize: '12px' }}>{user.location}</span>
              <span className="profile-stat-lbl">Location</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', padding: '0 16px' }}>
            {isOwnProfile && (
              <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                <Button variant="primary" onClick={onEditProfileClick} style={{ flex: 1, padding: '10px 16px', borderRadius: '14px', fontSize: '13px' }}>
                  Edit Profile
                </Button>
                <Button variant="secondary" style={{ flex: 1, padding: '10px 16px', borderRadius: '14px', fontSize: '13px' }}>
                  Share Profile
                </Button>
              </div>
            )}

            {/* Expert Status */}
            <ExpertStatusBadge />

            {/* Seller Status */}
            <SellerStatusBadge />
          </div>
        </div>

        {/* User Posts */}
        <div style={{ padding: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '12px' }}>
            {isOwnProfile ? 'My Posts' : `${user.name}'s Posts`}
          </h3>

          {userPosts.length > 0 ? (
            userPosts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                onCommentClick={onPostCommentClick}
                onProfileClick={onProfileClick}
              />
            ))
          ) : (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-secondary)' }}>
              No posts yet. {isOwnProfile ? 'Tap the + button to create your first post!' : ''}
            </div>
          )}
        </div>

      </div>

      {/* Hidden CV file input */}
      <input
        ref={cvInputRef}
        type="file"
        accept=".pdf,.doc,.docx,image/*"
        style={{ display: 'none' }}
        onChange={handleCvFileChange}
      />

      {/* ── KYC Expert Verification Dialog ─────────────────────────────── */}
      <Dialog
        isOpen={isKycOpen}
        title={kycStep === 1 ? 'KYC: Professional Details' : kycStep === 2 ? 'KYC: Upload CV' : 'KYC: Expert Bio'}
        confirmText={kycStep === 3 ? 'Submit Application' : 'Continue'}
        onConfirm={kycStep === 3 ? handleKycSubmit : handleNextKycStep}
        onCancel={() => setIsKycOpen(false)}
      >
        {/* Step 1 */}
        {kycStep === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '12px 0', maxHeight: '55vh', overflowY: 'auto', paddingRight: '4px' }}>
            <InputField label="Highest Qualification" placeholder="e.g. M.Sc. in Agriculture" value={qualification} onChange={(e) => setQualification(e.target.value)} required />
            <InputField label="Degree / Major" placeholder="e.g. Plant Pathology" value={degree} onChange={(e) => setDegree(e.target.value)} required />
            <InputField label="Years of Experience" type="number" placeholder="e.g. 5" value={experience} onChange={(e) => setExperience(e.target.value)} required />
            <InputField label="Specialization" placeholder="e.g. Soil health, Rice diseases" value={specialization} onChange={(e) => setSpecialization(e.target.value)} required />
            <InputField label="Institution / University" placeholder="e.g. Punjab Agricultural University" value={institution} onChange={(e) => setInstitution(e.target.value)} required />
            <InputField label="License No. (Optional)" placeholder="e.g. LIC-92019-IN" value={license} onChange={(e) => setLicense(e.target.value)} />
            <InputField label="LinkedIn URL (Optional)" placeholder="https://linkedin.com/in/username" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} />
          </div>
        )}

        {/* Step 2 */}
        {kycStep === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', margin: '12px 0' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              Upload your CV or Resume (PDF, DOC, or image). Max 10 MB. This will be securely stored and only visible to administrators.
            </p>
            <div
              onClick={handleCvPick}
              style={{ border: '2px dashed var(--border-color)', borderRadius: '14px', padding: '24px', textAlign: 'center', cursor: 'pointer', backgroundColor: 'rgba(30,30,30,0.5)' }}
            >
              {cvFileName ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--primary-green)' }}>
                  <span className="material-symbols-outlined">check_circle</span>
                  <span style={{ fontSize: '13px', fontWeight: '600' }}>{cvFileName}</span>
                </div>
              ) : (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: '36px', color: 'var(--primary-green)', display: 'block', marginBottom: '8px' }}>upload_file</span>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Tap to upload CV / Resume</span>
                </>
              )}
            </div>
            <Button onClick={() => setKycStep(1)} variant="text" style={{ fontSize: '12px', alignSelf: 'flex-start' }}>← Back</Button>
          </div>
        )}

        {/* Step 3 */}
        {kycStep === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', margin: '12px 0' }}>
            <div className="form-group">
              <label className="form-label">Professional Bio</label>
              <div className="input-container" style={{ padding: '8px 16px' }}>
                <textarea
                  className="input-field"
                  rows="4"
                  value={expertBio}
                  onChange={(e) => setExpertBio(e.target.value)}
                  placeholder="Example: Agricultural scientist with 12 years of experience in rice diseases, organic farming and irrigation management."
                  style={{ resize: 'none', height: '100px' }}
                  required
                />
              </div>
            </div>
            {expertSubmitting && <div style={{ color: 'var(--primary-green)', fontSize: '13px', textAlign: 'center' }}>⏳ Uploading CV and submitting...</div>}
            <Button onClick={() => setKycStep(2)} variant="text" style={{ fontSize: '12px', alignSelf: 'flex-start' }}>← Back</Button>
          </div>
        )}
      </Dialog>

      {/* ── Become Seller Dialog ─────────────────────────────────────────── */}
      <Dialog
        isOpen={isSellerOpen}
        title="Register as a Seller"
        confirmText={sellerSubmitting ? 'Registering...' : 'Submit for Approval'}
        onConfirm={handleSellerSubmit}
        onCancel={() => setIsSellerOpen(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', margin: '12px 0' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
            Set up your seller shop on AgroConnect Marketplace. Your application will be reviewed by our admin team before your shop goes live.
          </p>
          <InputField
            label="Shop Name *"
            placeholder="e.g. Ramesh Agro Supplies"
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            icon="storefront"
            required
          />
          {sellerSubmitting && <div style={{ color: 'var(--primary-green)', fontSize: '13px', textAlign: 'center' }}>⏳ Submitting seller application...</div>}
        </div>
      </Dialog>
    </div>
  );
}
