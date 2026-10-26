import React, { useState, useEffect, useRef } from 'react';
import Header from '../components/Header';
import { PostCard } from '../components/Card';
import { Button } from '../components/Button';
import InputField, { FieldError, FormMessage } from '../components/InputField';
import { rules } from '../utils/formRules';
import { useFormValidation } from '../utils/useFormValidation';
import Dialog from '../components/Dialog';
import ComingSoon from '../components/ComingSoon';
import BottomSheet from '../components/BottomSheet';
import LeaveExpertDialog from '../components/LeaveExpertDialog';
import { validatePdfFile, validateRequiredText } from '../utils/validation';
import { ProfileSkeleton, LoadError } from '../components/Skeleton';
import { supabase } from '../supabase';
import './pages.css';

const isCapacitor = () => typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();

export default function UserProfile({ 
  userId = 'user1', 
  onEditProfileClick, 
  onSettingsClick, 
  onPostCommentClick,
  onCancelView,
  onProfileClick,
  onPeaAIClick,
  onLogout,
  onShowToast,
  onOpenChat
}) {
  const [user, setUser] = useState(null);
  const [userPosts, setUserPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [openingChat, setOpeningChat] = useState(false);

  // Expert application state
  const [expertAppStatus, setExpertAppStatus] = useState(null);
  const [sellerStatus, setSellerStatus] = useState(null);
  const [resignationPending, setResignationPending] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLeaveOpen, setIsLeaveOpen] = useState(false);

  // KYC Expert Dialog states
  const [isKycOpen, setIsKycOpen] = useState(false);
  const [kycStep, setKycStep] = useState(1);

  // Form fields
  const [fullName, setFullName] = useState('');
  const [qualification, setQualification] = useState('');
  const [degree, setDegree] = useState('');
  const [experience, setExperience] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [institution, setInstitution] = useState('');
  const [license, setLicense] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [expertBio, setExpertBio] = useState('');

  const [cvFile, setCvFile] = useState(null);
  const [cvFileName, setCvFileName] = useState('');
  const cvInputRef = useRef(null);

  const [isSellerOpen, setIsSellerOpen] = useState(false);
  const [isComingSoonOpen, setIsComingSoonOpen] = useState(false);
  const [shopName, setShopName] = useState('');
  // inline validation for the expert application (3 steps) and the seller form
  const kycValues = { qualification, degree, experience, specialization, institution, expertBio, shopName };
  const kyc1 = useFormValidation({
    qualification: rules.required('Please enter your highest qualification.'),
    degree: rules.required('Please enter your degree or major.'),
    experience: (val) => {
      if (!String(val ?? '').trim()) return 'Please enter your years of experience.';
      const n = Number(val);
      return Number.isInteger(n) && n >= 0 && n <= 70 ? null : 'Enter a whole number of years between 0 and 70.';
    },
    specialization: rules.required('Please enter your specialization.'),
    institution: rules.required('Please enter your institution or university.'),
  });
  const kyc3 = useFormValidation({ expertBio: rules.required('Please enter your professional biography.') });
  const sellerV = useFormValidation({ shopName: rules.required('Please enter your shop name.') });
  const [cvError, setCvError] = useState(null);
  const [kycFormError, setKycFormError] = useState(null);
  const [sellerFormError, setSellerFormError] = useState(null);
  const bindKyc = (v, key, setter) => ({
    value: kycValues[key],
    onChange: (e) => { setter(e.target.value); v.changed(key, { ...kycValues, [key]: e.target.value }); },
    ...v.field(key, kycValues),
  });
  const [sellerSubmitting, setSellerSubmitting] = useState(false);
  const [expertSubmitting, setExpertSubmitting] = useState(false);

  const fetchProfile = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const targetUserId = userId === 'user1' ? authUser?.id : userId;
      if (!targetUserId) return;

      // Fetch profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', targetUserId)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile) {
        setLoadError('This profile is not available.');
        return;
      }
      setLoadError(null);

      if (profile) {
        setUser({
          id: profile.id,
          name: profile.full_name,
          username: profile.full_name?.toLowerCase().replace(/\s+/g, '') || '',
          avatar: profile.profile_image_path || '/profile-placeholder.png',
          role: profile.role,
          bio: profile.bio || '',
          location: profile.location || 'Punjab, India',
          isBanned: profile.is_banned || false,
          followerCount: profile.follower_count || 0
        });
        setFullName(profile.full_name || '');
      }

      // Check if logged in user is connected to target profile
      if (authUser && targetUserId !== authUser.id) {
        const { data: followRow } = await supabase
          .from('followers')
          .select('id')
          .eq('follower_id', authUser.id)
          .eq('following_id', targetUserId)
          .maybeSingle();
        setIsConnected(!!followRow);
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
          userAvatar: post.profiles?.profile_image_path || '/profile-placeholder.png',
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

      if (targetUserId === authUser?.id) {
        const { data: appData } = await supabase
          .from('expert_applications')
          .select('status')
          .eq('user_id', authUser.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        setExpertAppStatus(appData?.status || null);

        const { data: sellerData } = await supabase
          .from('seller_profiles')
          .select('verification_status')
          .eq('user_id', authUser.id)
          .maybeSingle();
        setSellerStatus(sellerData?.verification_status || null);

        const { data: resignation } = await supabase
          .from('expert_resignations')
          .select('id')
          .eq('user_id', authUser.id)
          .eq('status', 'Pending')
          .maybeSingle();
        setResignationPending(!!resignation);
      }
    } catch (err) {
      console.error(err);
      // keep a profile that is already on screen; only the first load shows the error
      setLoadError(/fetch|network/i.test(err?.message || '') ? 'No connection. Check your connection and try again.' : 'Could not load this profile.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [userId]);

  useEffect(() => {
    const handleFocus = () => fetchProfile();
    document.addEventListener('visibilitychange', handleFocus);
    return () => document.removeEventListener('visibilitychange', handleFocus);
  }, [userId]);

  // Anyone can message anyone: connected users chat normally, otherwise the first message is a message request.
  const handleMessage = async () => {
    if (!user || openingChat || !onOpenChat) return;
    setOpeningChat(true);
    const { data, error } = await supabase.rpc('get_or_create_conversation', { p_other: user.id });
    setOpeningChat(false);
    if (error) {
      if (onShowToast) onShowToast(/fetch|network/i.test(error.message || '') ? 'No connection. Please try again.' : (error.message || 'Could not open the chat.'));
      return;
    }
    onOpenChat({ id: data.conversation_id, otherUserId: user.id, name: user.name, avatar: user.avatar, state: data.state });
  };

  const handleToggleConnect = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser || !user) return;

    try {
      if (isConnected) {
        const { error } = await supabase
          .from('followers')
          .delete()
          .eq('follower_id', authUser.id)
          .eq('following_id', user.id);
        if (error) throw error;
        setIsConnected(false);
        setUser(prev => ({ ...prev, followerCount: Math.max(0, (prev.followerCount || 1) - 1) }));
        if (onShowToast) onShowToast(`Disconnected from ${user.name}`);
      } else {
        const { error } = await supabase
          .from('followers')
          .insert({ follower_id: authUser.id, following_id: user.id });
        if (error) throw error;
        setIsConnected(true);
        setUser(prev => ({ ...prev, followerCount: (prev.followerCount || 0) + 1 }));
        if (onShowToast) onShowToast(`🤝 Connected with ${user.name}!`);
      }
    } catch (err) {
      if (onShowToast) onShowToast(/fetch|network/i.test(err.message || '') ? 'No connection. Please try again.' : `Could not update the connection: ${err.message}`);
    }
  };

  // Expert KYC
  const handleBecomeExpertClick = () => {
    setIsKycOpen(true);
    setKycStep(1);
  };

  const handleNextKycStep = () => {
    if (kycStep === 1) {
      if (!kyc1.validateAll(kycValues)) return;
      setKycStep(2);
    } else if (kycStep === 2) {
      if (!cvFile) {
        setCvError('Please upload your CV or resume (PDF).');
        return;
      }
      setKycStep(3);
    }
  };

  const handleCvFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const pdfVal = await validatePdfFile(file, 5);
    setCvError(null);
    if (!pdfVal.isValid) {
      setCvError(pdfVal.error);
      setCvFile(null);
      setCvFileName('');
      if (cvInputRef.current) cvInputRef.current.value = '';
      return;
    }
    setCvFile(file);
    setCvFileName(file.name);
  };

  const handleCvPick = async () => {
    cvInputRef.current?.click();
  };

  const handleKycSubmit = async () => {
    if (expertSubmitting) return;
    setKycFormError(null);
    if (!kyc3.validateAll(kycValues)) return;
    if (!cvFile) { setKycStep(2); setCvError('Please upload your CV or resume (PDF).'); return; }

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    setExpertSubmitting(true);
    try {
      const ext = cvFile.name.split('.').pop() || 'pdf';
      const cvPath = `${authUser.id}/${Date.now()}_cv.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('expert-cvs')
        .upload(cvPath, cvFile, { upsert: true, contentType: cvFile.type });
      // Without the file the admin has nothing to review, so stop here instead of saving a dangling path.
      if (uploadErr) throw new Error(`CV upload failed: ${uploadErr.message}`);

      // Earlier (e.g. Rejected) applications are kept as history; the one_pending_application_per_user
      // index rejects a second Pending row.
      const { error: insertErr } = await supabase
        .from('expert_applications')
        .insert({
          user_id: authUser.id,
          qualification: `${qualification} in ${degree} from ${institution}`,
          experience: `${experience} years. Specialization: ${specialization}. Bio: ${expertBio}`,
          cv_file_path: cvPath,
          status: 'Pending'
        });
      if (insertErr) {
        if (insertErr.code === '23505') throw new Error('You already have an expert application pending review.');
        throw insertErr;
      }

      setExpertAppStatus('Pending');
      setIsKycOpen(false);
      if (onShowToast) onShowToast('📋 Expert application submitted! Awaiting Admin approval.');
    } catch (err) {
      setKycFormError(/fetch|network/i.test(err.message || '') ? 'No connection. Your application was not sent — please try again.' : err.message);
    } finally {
      setExpertSubmitting(false);
    }
  };

  // Become Seller Placeholder & Error handling
  const handleBecomeSellerClick = () => {
    setIsComingSoonOpen(true);
  };

  const handleSellerSubmit = async () => {
    if (sellerSubmitting) return;
    setSellerFormError(null);
    if (!sellerV.validateAll(kycValues)) return;
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
      
      if (error) {
        if (error.code === '23505' || error.message?.includes('unique') || error.message?.includes('duplicate')) {
          setSellerFormError("You've already applied to become a seller.");
          return;
        }
        throw error;
      }

      setSellerStatus('Pending');
      setIsSellerOpen(false);
      if (onShowToast) onShowToast('🏪 Seller application submitted! Awaiting Admin approval.');
    } catch (err) {
      setSellerFormError(/fetch|network/i.test(err.message || '') ? 'No connection. Please try again.' : `Seller registration failed: ${err.message}`);
    } finally {
      setSellerSubmitting(false);
    }
  };


  if (!user) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-dark)' }}>
        {userId !== 'user1' && <Header title="Profile" showBack onBackClick={onCancelView} />}
        {loading ? <ProfileSkeleton /> : (
          <div style={{ padding: '24px 16px' }}>
            <LoadError message={loadError || 'Could not load this profile.'} onRetry={() => { setLoading(true); fetchProfile(); }} />
          </div>
        )}
      </div>
    );
  }

  const isExpert = user.role === 'Agronomist' || user.role === 'Expert' || user.role === 'Distributor';
  const isOwnProfile = userId === 'user1';

  // Own profile: everything except Edit Profile lives in the ☰ menu (top right).
  const rightActions = isOwnProfile ? (
    <button className="feed-header-icon" onClick={() => setIsMenuOpen(true)} aria-label="Profile menu">
      <span className="material-symbols-outlined">menu</span>
    </button>
  ) : null;

  const MenuRow = ({ icon, label, hint, onClick, danger, disabled }) => (
    <div
      role="button"
      aria-disabled={disabled || undefined}
      onClick={() => { if (disabled) return; setIsMenuOpen(false); onClick(); }}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '12px', backgroundColor: '#1E1E1E', cursor: disabled ? 'default' : 'pointer', border: '1px solid var(--border-color)', opacity: disabled ? 0.6 : 1 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span className="material-symbols-outlined" style={{ color: danger ? 'var(--error)' : 'var(--primary-green)' }}>{icon}</span>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '14px', fontWeight: '600', color: danger ? 'var(--error)' : 'var(--text-primary)' }}>{label}</span>
          {hint && <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{hint}</span>}
        </div>
      </div>
      {!disabled && <span className="material-symbols-outlined" style={{ color: 'var(--text-secondary)' }}>chevron_right</span>}
    </div>
  );

  const expertMenuRow = isExpert ? (
    <MenuRow icon="logout" label="Leave being an expert"
      hint={resignationPending ? 'Request sent — waiting for admin approval' : 'Send a request to the admin'}
      disabled={resignationPending} onClick={() => setIsLeaveOpen(true)} />
  ) : expertAppStatus === 'Pending' ? (
    <MenuRow icon="hourglass_top" label="Become a Verified Expert" hint="Application pending admin approval" disabled onClick={() => {}} />
  ) : expertAppStatus === 'Rejected' ? (
    <MenuRow icon="verified" label="Reapply as Expert" hint="Your last application was rejected" onClick={handleBecomeExpertClick} />
  ) : (
    <MenuRow icon="verified" label="Become a Verified Expert" onClick={handleBecomeExpertClick} />
  );

  const sellerMenuRow = sellerStatus === 'Verified' ? (
    <MenuRow icon="storefront" label="Verified Seller" disabled onClick={() => {}} />
  ) : sellerStatus === 'Pending' ? (
    <MenuRow icon="storefront" label="Become a Seller" hint="Application pending admin approval" disabled onClick={() => {}} />
  ) : (
    <MenuRow icon="storefront" label="Become a Seller" onClick={handleBecomeSellerClick} />
  );

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

          <div className="profile-stats-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
            <div className="profile-stat-box">
              <span className="profile-stat-val">{userPosts.length}</span>
              <span className="profile-stat-lbl">Posts</span>
            </div>
            <div className="profile-stat-box">
              <span className="profile-stat-val" style={{ color: 'var(--primary-green)' }}>{user.followerCount}</span>
              <span className="profile-stat-lbl">Connections</span>
            </div>
            <div className="profile-stat-box">
              <span className="profile-stat-val" style={{ color: 'var(--text-primary)', fontSize: '12px' }}>{user.location}</span>
              <span className="profile-stat-lbl">Location</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', padding: '0 16px' }}>
            {isOwnProfile ? (
              <Button variant="primary" onClick={onEditProfileClick} style={{ width: '100%', padding: '10px 16px', borderRadius: '14px', fontSize: '13px' }}>
                Edit Profile
              </Button>
            ) : (
              <div className="profile-actions">
                <Button
                  variant={isConnected ? "secondary" : "primary"}
                  onClick={handleToggleConnect}
                  style={{ flex: 1, padding: '12px', borderRadius: '14px', fontSize: '14px', fontWeight: '700' }}
                >
                  {isConnected ? 'Connected ✓' : 'Connect'}
                </Button>
                {onOpenChat && !user.isBanned && (
                  <Button
                    variant="secondary"
                    icon="chat"
                    onClick={handleMessage}
                    disabled={openingChat}
                    style={{ flex: 1, padding: '12px', borderRadius: '14px', fontSize: '14px', fontWeight: '700' }}
                  >
                    {openingChat ? 'Opening…' : 'Message'}
                  </Button>
                )}
              </div>
            )}

            {isOwnProfile && resignationPending && (
              <div style={{ textAlign: 'center', padding: '10px 16px', borderRadius: '14px', fontSize: '12px', color: '#FFA726', backgroundColor: 'rgba(255, 167, 38, 0.1)', border: '1px solid rgba(255, 167, 38, 0.25)', fontWeight: '600' }}>
                ⏳ Request to leave expert mode is waiting for admin approval
              </div>
            )}
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

      <input
        ref={cvInputRef}
        type="file"
        accept="application/pdf"
        style={{ display: 'none' }}
        onChange={handleCvFileChange}
      />

      {/* Profile ☰ menu */}
      <BottomSheet isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', margin: '0 0 8px 4px' }}>Menu</h3>
          <MenuRow icon="settings" label="Settings" onClick={onSettingsClick} />
          {expertMenuRow}
          {sellerMenuRow}
          {onLogout && <MenuRow icon="logout" label="Log Out" danger onClick={onLogout} />}
        </div>
      </BottomSheet>

      <LeaveExpertDialog
        isOpen={isLeaveOpen}
        onClose={() => setIsLeaveOpen(false)}
        onSubmitted={() => setResignationPending(true)}
        onShowToast={onShowToast}
      />

      {/* KYC Expert Verification Dialog */}
      <Dialog
        isOpen={isKycOpen}
        title={kycStep === 1 ? 'KYC: Professional Details' : kycStep === 2 ? 'KYC: Upload CV' : 'KYC: Expert Bio'}
        confirmText={kycStep === 3 ? 'Submit Application' : 'Continue'}
        onConfirm={kycStep === 3 ? handleKycSubmit : handleNextKycStep}
        onCancel={() => setIsKycOpen(false)}
      >
        {kycStep === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '12px 0', maxHeight: '55vh', overflowY: 'auto', paddingRight: '4px' }}>
            <InputField label="Highest Qualification" placeholder="e.g. M.Sc. in Agriculture" {...bindKyc(kyc1, 'qualification', setQualification)} />
            <InputField label="Degree / Major" placeholder="e.g. Plant Pathology" {...bindKyc(kyc1, 'degree', setDegree)} />
            <InputField label="Years of Experience" type="number" inputMode="numeric" placeholder="e.g. 5" {...bindKyc(kyc1, 'experience', setExperience)} />
            <InputField label="Specialization" placeholder="e.g. Soil health, Rice diseases" {...bindKyc(kyc1, 'specialization', setSpecialization)} />
            <InputField label="Institution / University" placeholder="e.g. Punjab Agricultural University" {...bindKyc(kyc1, 'institution', setInstitution)} />
            <InputField label="License No. (Optional)" placeholder="e.g. LIC-92019-IN" value={license} onChange={(e) => setLicense(e.target.value)} />
            <InputField label="LinkedIn URL (Optional)" placeholder="https://linkedin.com/in/username" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} />
          </div>
        )}

        {kycStep === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', margin: '12px 0' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              Upload your CV or Resume (PDF format only, max 5 MB). This will be securely stored and only visible to administrators.
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
            <FieldError>{cvError}</FieldError>
            <Button onClick={() => setKycStep(1)} variant="text" style={{ fontSize: '12px', alignSelf: 'flex-start' }}>← Back</Button>
          </div>
        )}

        {kycStep === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', margin: '12px 0' }}>
            <InputField
              label="Professional Bio"
              as="textarea"
              rows={4}
              placeholder="Example: Agricultural scientist with 12 years of experience in rice diseases, organic farming and irrigation management."
              {...bindKyc(kyc3, 'expertBio', setExpertBio)}
            />
            <FormMessage>{kycFormError}</FormMessage>
            {expertSubmitting && <div style={{ color: 'var(--primary-green)', fontSize: '13px', textAlign: 'center' }}>⏳ Uploading CV and submitting...</div>}
            <Button onClick={() => setKycStep(2)} variant="text" style={{ fontSize: '12px', alignSelf: 'flex-start' }}>← Back</Button>
          </div>
        )}
      </Dialog>

      {/* Become Seller Dialog */}
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
            icon="storefront"
            {...bindKyc(sellerV, 'shopName', setShopName)}
          />
          <FormMessage>{sellerFormError}</FormMessage>
          {sellerSubmitting && <div style={{ color: 'var(--primary-green)', fontSize: '13px', textAlign: 'center' }}>⏳ Submitting seller application...</div>}
        </div>
      </Dialog>

      {/* Coming Soon Dialog for Seller */}
      <Dialog
        isOpen={isComingSoonOpen}
        title="Coming Soon"
        confirmText="Understood"
        onConfirm={() => setIsComingSoonOpen(false)}
        onCancel={() => setIsComingSoonOpen(false)}
      >
        <ComingSoon feature="Seller Registration & Marketplace" />
      </Dialog>
    </div>
  );
}
