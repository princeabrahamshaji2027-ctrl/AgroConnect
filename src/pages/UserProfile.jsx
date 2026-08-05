import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import { PostCard } from '../components/Card';
import { Button } from '../components/Button';
import InputField from '../components/InputField';
import Dialog from '../components/Dialog';
import { supabase } from '../supabase';
import './pages.css';

export default function UserProfile({ 
  userId = 'user1', 
  onEditProfileClick, 
  onSettingsClick, 
  onPostCommentClick,
  onProfileClick,
  onPeaAIClick,
  onShowToast
}) {
  const [user, setUser] = useState(null);
  const [userPosts, setUserPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isApplied, setIsApplied] = useState(false);

  // KYC States
  const [isKycOpen, setIsKycOpen] = useState(false);
  const [kycStep, setKycStep] = useState(1);

  // Form Fields
  const [fullName, setFullName] = useState('');
  const [qualification, setQualification] = useState('');
  const [degree, setDegree] = useState('');
  const [experience, setExperience] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [institution, setInstitution] = useState('');
  const [license, setLicense] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [portfolio, setPortfolio] = useState('');

  // Upload mocks
  const [govId, setGovId] = useState('');
  const [resume, setResume] = useState('');
  const [certs, setCerts] = useState('');
  const [profilePhoto, setProfilePhoto] = useState('');

  const [expertBio, setExpertBio] = useState('');

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
          location: profile.location || 'Punjab, India'
        });
        setFullName(profile.full_name || '');
      }

      // Fetch user posts
      const { data: postsData } = await supabase
        .from('posts')
        .select(`
          *,
          profiles:user_id (
            full_name,
            profile_image_path,
            role
          )
        `)
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
          likes: post.like_count || 0,
          category: post.category,
          location: post.location,
          time: 'Recent',
          liked: false,
          bookmarked: false,
          comments: []
        })));
      }

      // Check if applied for expert
      const { data: appData } = await supabase
        .from('expert_applications')
        .select('status')
        .eq('user_id', targetUserId)
        .eq('status', 'Pending')
        .maybeSingle();

      if (appData) {
        setIsApplied(true);
      } else {
        setIsApplied(false);
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
      if (!govId || !resume || !certs) {
        alert('Please upload all required verification documents.');
        return;
      }
      setKycStep(3);
    }
  };

  const handleKycSubmit = async () => {
    if (!expertBio.trim()) {
      alert('Please enter your professional biography.');
      return;
    }

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    const { error } = await supabase
      .from('expert_applications')
      .insert({
        user_id: authUser.id,
        qualification: `${qualification} in ${degree} from ${institution}`,
        experience: `${experience} years. Specialization: ${specialization}. Bio: ${expertBio}`,
        cv_file_path: resume || 'my_resume_agri.pdf',
        status: 'Pending'
      });

    if (error) {
      alert(`Submission failed: ${error.message}`);
      return;
    }

    setIsApplied(true);
    setIsKycOpen(false);

    if (onShowToast) {
      onShowToast('📋 Expert application submitted for Admin approval!');
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

  const isExpert = user.role === 'Agronomist' || user.role === 'Distributor';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Header title="Profile" onPeaAIClick={onPeaAIClick} rightActions={rightActions} />
      
      <div className="page-container fade-in" style={{ paddingLeft: '0', paddingRight: '0', overflowY: 'auto' }}>
        
        {/* User Card info */}
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
              <span className="profile-stat-val" style={{ color: 'var(--text-primary)' }}>{user.location}</span>
              <span className="profile-stat-lbl">Location</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', padding: '0 16px' }}>
            <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
              <Button 
                variant="primary" 
                onClick={onEditProfileClick} 
                style={{ flex: 1, padding: '10px 16px', borderRadius: '14px', fontSize: '13px' }}
              >
                Edit Profile
              </Button>
              <Button 
                variant="secondary" 
                style={{ flex: 1, padding: '10px 16px', borderRadius: '14px', fontSize: '13px' }}
              >
                Share Profile
              </Button>
            </div>

            {/* Become an expert option for standard members */}
            {!isExpert && userId === 'user1' && (
              <div style={{ width: '100%' }}>
                {!isApplied ? (
                  <Button 
                    variant="secondary" 
                    onClick={handleBecomeExpertClick}
                    style={{ width: '100%', padding: '10px 16px', borderRadius: '14px', fontSize: '13px', borderColor: 'var(--primary-green)', color: 'var(--primary-green)' }}
                  >
                    Become verified Expert
                  </Button>
                ) : (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '10px 16px', 
                    borderRadius: '14px', 
                    fontSize: '12px', 
                    color: '#FFA726', 
                    backgroundColor: 'rgba(255, 167, 38, 0.1)', 
                    border: '1px solid rgba(255, 167, 38, 0.25)',
                    fontWeight: '600' 
                  }}>
                    ⏳ Expert Application Pending Approval
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* User Posts list */}
        <div style={{ padding: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '12px' }}>My Posts</h3>
          
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
              No posts written yet. Click the + floating action button to create your first post!
            </div>
          )}
        </div>

      </div>

      {/* KYC Expert Verification Dialog */}
      <Dialog
        isOpen={isKycOpen}
        title={kycStep === 1 ? "KYC: Professional Details" : kycStep === 2 ? "KYC: Verification Uploads" : "KYC: Expert Description"}
        confirmText={kycStep === 3 ? "Submit Verification" : "Continue"}
        onConfirm={kycStep === 3 ? handleKycSubmit : handleNextKycStep}
        onCancel={() => setIsKycOpen(false)}
      >
        {/* Step 1: Details */}
        {kycStep === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '12px 0', maxHeight: '55vh', overflowY: 'auto', paddingRight: '4px' }}>
            <InputField
              label="Full Name (Official)"
              placeholder="Enter your official name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
            <InputField
              label="Highest Qualification"
              placeholder="e.g. M.Sc. in Agriculture"
              value={qualification}
              onChange={(e) => setQualification(e.target.value)}
              required
            />
            <InputField
              label="Degree / Major"
              placeholder="e.g. Plant Pathology"
              value={degree}
              onChange={(e) => setDegree(e.target.value)}
              required
            />
            <InputField
              label="Years of Experience"
              type="number"
              placeholder="e.g. 5"
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              required
            />
            <InputField
              label="Specialization / Area of Expertise"
              placeholder="e.g. Soil health, Rice diseases"
              value={specialization}
              onChange={(e) => setSpecialization(e.target.value)}
              required
            />
            <InputField
              label="Institution / University"
              placeholder="e.g. Punjab Agricultural University"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              required
            />
            <InputField
              label="License / Certificate Number (Optional)"
              placeholder="e.g. LIC-92019-IN"
              value={license}
              onChange={(e) => setLicense(e.target.value)}
            />
            <InputField
              label="LinkedIn URL (Optional)"
              placeholder="https://linkedin.com/in/username"
              value={linkedin}
              onChange={(e) => setLinkedin(e.target.value)}
            />
            <InputField
              label="Portfolio / Website (Optional)"
              placeholder="https://website.com"
              value={portfolio}
              onChange={(e) => setPortfolio(e.target.value)}
            />
          </div>
        )}

        {/* Step 2: Uploads */}
        {kycStep === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', margin: '12px 0' }}>
            <div className="form-group">
              <label className="form-label">Government ID (Aadhaar/PAN/Driving License) *</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="text" 
                  placeholder="No file chosen" 
                  value={govId} 
                  readOnly 
                  className="input-field" 
                  style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '10px 14px', flex: 1, fontSize: '13px' }} 
                />
                <Button onClick={() => setGovId('gov_id_verification.jpg')} variant="secondary" style={{ padding: '10px 14px', borderRadius: '12px', fontSize: '12px' }}>Choose File</Button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Resume / Curriculum Vitae (PDF) *</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="text" 
                  placeholder="No file chosen" 
                  value={resume} 
                  readOnly 
                  className="input-field" 
                  style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '10px 14px', flex: 1, fontSize: '13px' }} 
                />
                <Button onClick={() => setResume('my_resume_agri.pdf')} variant="secondary" style={{ padding: '10px 14px', borderRadius: '12px', fontSize: '12px' }}>Choose File</Button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Educational / Degree Certificates *</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="text" 
                  placeholder="No file chosen" 
                  value={certs} 
                  readOnly 
                  className="input-field" 
                  style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '10px 14px', flex: 1, fontSize: '13px' }} 
                />
                <Button onClick={() => setCerts('degree_cert.pdf')} variant="secondary" style={{ padding: '10px 14px', borderRadius: '12px', fontSize: '12px' }}>Choose File</Button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Profile Photo (Professional) *</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="text" 
                  placeholder="No file chosen" 
                  value={profilePhoto} 
                  readOnly 
                  className="input-field" 
                  style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '10px 14px', flex: 1, fontSize: '13px' }} 
                />
                <Button onClick={() => setProfilePhoto('my_prof_headshot.png')} variant="secondary" style={{ padding: '10px 14px', borderRadius: '12px', fontSize: '12px' }}>Choose File</Button>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '8px', alignSelf: 'flex-start' }}>
              <Button onClick={() => setKycStep(1)} variant="text" style={{ fontSize: '13px' }}>Back</Button>
            </div>
          </div>
        )}

        {/* Step 3: Description */}
        {kycStep === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', margin: '12px 0' }}>
            <div className="form-group">
              <label className="form-label">Professional Bio / Expert Description</label>
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

            <div style={{ display: 'flex', gap: '8px', alignSelf: 'flex-start' }}>
              <Button onClick={() => setKycStep(2)} variant="text" style={{ fontSize: '13px' }}>Back</Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
