import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import InputField from '../components/InputField';
import { Button } from '../components/Button';
import Dialog from '../components/Dialog';
import { supabase } from '../supabase';
import './pages.css';

export default function Connect({ onPeaAIClick, onShowToast }) {
  const [activeSubTab, setActiveSubTab] = useState('book'); // 'book' | 'upcoming' | 'history' | 'lobby' | 'reviews' | 'marketplace' | 'availability'
  
  // Book Consultation States
  const [selectedExpert, setSelectedExpert] = useState(null);
  const [bookingDate, setBookingDate] = useState('');
  const [bookingTime, setBookingTime] = useState('');
  const [bookingIssue, setBookingIssue] = useState('');
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);

  // Expert Slot Management States
  const [isCurrentExpert, setIsCurrentExpert] = useState(false);
  const [currentExpertId, setCurrentExpertId] = useState(null);
  const [mySlots, setMySlots] = useState([]);
  const [newSlotDate, setNewSlotDate] = useState('');
  const [newSlotStart, setNewSlotStart] = useState('10:00');
  const [newSlotEnd, setNewSlotEnd] = useState('11:00');
  const [newSlotRate, setNewSlotRate] = useState(500);

  // Database States
  const [expertsList, setExpertsList] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [history, setHistory] = useState([]);
  const [reviews, setReviews] = useState([]);

  // Video call simulation states
  const [inVideoCall, setInVideoCall] = useState(false);
  const [currentCallRoom, setCurrentCallRoom] = useState('');
  const [meetingIdInput, setMeetingIdInput] = useState('');
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [videoCallJoinedTime, setVideoCallJoinedTime] = useState(0);

  // Review submission state
  const [reviewingMeeting, setReviewingMeeting] = useState(null);
  const [ratingInput, setRatingInput] = useState(5);
  const [reviewTextInput, setReviewTextInput] = useState('');

  // Marketplace state
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState({});
  const [checkingOut, setCheckingOut] = useState(false);
  const [orderHistory, setOrderHistory] = useState([]);

  const fetchMySlots = async (expertId) => {
    if (!expertId) return;
    const { data } = await supabase
      .from('consultation_slots')
      .select('*')
      .eq('expert_id', expertId)
      .order('slot_date', { ascending: true })
      .order('start_time', { ascending: true });
    setMySlots(data || []);
  };

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 0. Check if logged in user is an expert
      const { data: myExpert } = await supabase
        .from('experts')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (myExpert) {
        setIsCurrentExpert(true);
        setCurrentExpertId(myExpert.id);
        fetchMySlots(myExpert.id);
      }

      // 1. Fetch experts
      const { data: expertsData } = await supabase
        .from('experts')
        .select(`
          id,
          rating,
          profiles:user_id (
            full_name,
            profile_image_path,
            role,
            bio
          )
        `);
      if (expertsData) {
        setExpertsList(expertsData.map(exp => ({
          id: exp.id,
          name: exp.profiles?.full_name || 'Expert',
          avatar: exp.profiles?.profile_image_path || '/profile-placeholder.png',
          role: exp.profiles?.role || 'Expert',
          bio: exp.profiles?.bio || '',
          rating: exp.rating || 0.0
        })));
      }

      // Get farmer profile
      const { data: farmerProfile } = await supabase
        .from('farmer_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (farmerProfile) {
        // 2. Fetch upcoming bookings
        const { data: bookingsData } = await supabase
          .from('consultation_bookings')
          .select(`
            *,
            experts:expert_id (
              id,
              profiles:user_id (
                full_name,
                profile_image_path
              )
            )
          `)
          .eq('farmer_id', farmerProfile.id)
          .eq('status', 'Booked')
          .order('meeting_date', { ascending: true });

        if (bookingsData) {
          setAppointments(bookingsData.map(appt => ({
            id: appt.id,
            expertId: appt.experts?.id,
            expertName: appt.experts?.profiles?.full_name || 'Expert',
            expertAvatar: appt.experts?.profiles?.profile_image_path || '/profile-placeholder.png',
            topic: appt.issue_description || '',
            date: appt.meeting_date,
            time: appt.meeting_time,
            roomId: `AGRI-${appt.id.slice(0, 8).toUpperCase()}`,
            status: 'upcoming'
          })));
        }

        // 3. Fetch past bookings
        const { data: histData } = await supabase
          .from('consultation_bookings')
          .select(`
            *,
            experts:expert_id (
              id,
              profiles:user_id (
                full_name,
                profile_image_path
              )
            )
          `)
          .eq('farmer_id', farmerProfile.id)
          .neq('status', 'Booked')
          .order('meeting_date', { ascending: false });

        const { data: reviewsData } = await supabase
          .from('reviews')
          .select('booking_id');
        const reviewedBookingIds = new Set(reviewsData?.map(r => r.booking_id) || []);

        if (histData) {
          setHistory(histData.map(h => ({
            id: h.id,
            expertId: h.experts?.id,
            expertName: h.experts?.profiles?.full_name || 'Expert',
            expertAvatar: h.experts?.profiles?.profile_image_path || '/profile-placeholder.png',
            topic: h.issue_description || '',
            date: h.meeting_date,
            duration: '30 mins',
            reviewed: reviewedBookingIds.has(h.id)
          })));
        }
      }

      // 4. Fetch reviews
      const { data: revsData } = await supabase
        .from('reviews')
        .select(`
          id,
          rating,
          comment,
          reviewer:reviewer_id (
            full_name,
            profile_image_path
          ),
          experts:expert_id (
            profiles:user_id (
              full_name
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (revsData) {
        setReviews(revsData.map(r => ({
          id: r.id,
          authorName: r.reviewer?.full_name || 'Farmer',
          authorAvatar: r.reviewer?.profile_image_path || '/profile-placeholder.png',
          expertName: r.experts?.profiles?.full_name || 'Expert',
          rating: r.rating,
          content: r.comment || '',
          date: 'Recent'
        })));
      }

      // 5. Fetch marketplace products
      const { data: productsData } = await supabase
        .from('products')
        .select('*, seller_profiles:seller_id(shop_name, user_id, profiles:user_id(full_name))')
        .gt('stock', 0)
        .order('created_at', { ascending: false });
      if (productsData) setProducts(productsData);

      // 6. Fetch order history
      const { data: ordersData } = await supabase
        .from('orders')
        .select('*, order_items(*, products(product_name, image_path))')
        .eq('buyer_id', user.id)
        .order('created_at', { ascending: false });
      if (ordersData) setOrderHistory(ordersData);

    } catch (err) {
      console.error('Error fetching connect data:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleBookClick = async (expert) => {
    setSelectedExpert(expert);
    setSelectedSlot(null);
    setBookingDate('');
    setBookingTime('');

    const { data: slots } = await supabase
      .from('consultation_slots')
      .select('*')
      .eq('expert_id', expert.id)
      .order('slot_date', { ascending: true })
      .order('start_time', { ascending: true });

    setAvailableSlots(slots || []);
  };

  const handleCreateSlot = async () => {
    if (!currentExpertId || !newSlotDate || !newSlotStart || !newSlotEnd) {
      alert('Please select slot date and start/end time');
      return;
    }
    try {
      const { error } = await supabase
        .from('consultation_slots')
        .insert({
          expert_id: currentExpertId,
          slot_date: newSlotDate,
          start_time: newSlotStart,
          end_time: newSlotEnd,
          rate: parseFloat(newSlotRate) || 500,
          is_booked: false
        });
      if (error) throw error;
      if (onShowToast) onShowToast('✅ Availability slot created!');
      setNewSlotDate('');
      fetchMySlots(currentExpertId);
    } catch (err) {
      alert(`Error creating slot: ${err.message}`);
    }
  };

  const handleConfirmBooking = async () => {
    if (!bookingIssue) {
      alert('Please explain the consultation topic/issue');
      return;
    }

    if (selectedSlot && selectedSlot.is_booked) {
      alert('This slot is already booked by another farmer.');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let { data: farmerProfile } = await supabase
      .from('farmer_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!farmerProfile) {
      const { data: newFarmer } = await supabase
        .from('farmer_profiles')
        .insert({ user_id: user.id })
        .select('id')
        .single();
      farmerProfile = newFarmer;
    }

    const dateToUse = selectedSlot ? selectedSlot.slot_date : bookingDate;
    const timeToUse = selectedSlot ? selectedSlot.start_time : bookingTime;

    if (!dateToUse || !timeToUse) {
      alert('Please select an available time slot.');
      return;
    }

    // Insert booking
    const { error: bookingErr } = await supabase
      .from('consultation_bookings')
      .insert({
        expert_id: selectedExpert.id,
        farmer_id: farmerProfile.id,
        slot_id: selectedSlot ? selectedSlot.id : null,
        meeting_date: dateToUse,
        meeting_time: timeToUse,
        issue_description: bookingIssue,
        status: 'Booked'
      });

    if (bookingErr) {
      if (bookingErr.code === '23505' || bookingErr.message.includes('unique') || bookingErr.message.includes('slot')) {
        alert('This slot was just booked by another farmer. Please choose an available slot.');
        handleBookClick(selectedExpert);
        return;
      }
      alert(`Booking failed: ${bookingErr.message}`);
      return;
    }

    // Lock slot
    if (selectedSlot) {
      await supabase
        .from('consultation_slots')
        .update({ is_booked: true })
        .eq('id', selectedSlot.id);
    }

    // Video meeting row
    const { data: bookingRow } = await supabase
      .from('consultation_bookings')
      .select('id')
      .eq('expert_id', selectedExpert.id)
      .eq('farmer_id', farmerProfile.id)
      .eq('meeting_date', dateToUse)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (bookingRow) {
      const meetingCode = `AGRI-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
      await supabase.from('video_meetings').insert({
        booking_id: bookingRow.id,
        meeting_link: `https://meet.agroconnect.app/${meetingCode}`,
        status: 'Scheduled'
      });
    }

    setSelectedExpert(null);
    setSelectedSlot(null);
    setBookingDate('');
    setBookingTime('');
    setBookingIssue('');
    
    if (onShowToast) {
      onShowToast(`📅 Meeting booked with ${selectedExpert.name}!`);
    }
    fetchData();
    setActiveSubTab('upcoming');
  };

  const handleStartCall = (roomId) => {
    setCurrentCallRoom(roomId);
    setInVideoCall(true);
    setVideoCallJoinedTime(Date.now());
  };

  const handleJoinByLobby = (e) => {
    e.preventDefault();
    if (!meetingIdInput.trim()) return;
    handleStartCall(meetingIdInput.trim());
    setMeetingIdInput('');
  };

  const handleLeaveCall = async () => {
    setInVideoCall(false);
    
    const appt = appointments.find(a => a.roomId === currentCallRoom);
    if (appt) {
      await supabase
        .from('consultation_bookings')
        .update({ status: 'Completed' })
        .eq('id', appt.id);
    }

    setCurrentCallRoom('');
    fetchData();
    setActiveSubTab('history');
    if (onShowToast) {
      onShowToast('🔌 Meeting ended. Feel free to leave a review!');
    }
  };

  const handleOpenReviewDialog = (item) => {
    setReviewingMeeting(item);
  };

  const handleSubmitReview = async () => {
    if (!reviewTextInput.trim()) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('reviews')
      .insert({
        booking_id: reviewingMeeting.id,
        reviewer_id: user.id,
        expert_id: reviewingMeeting.expertId,
        rating: ratingInput,
        comment: reviewTextInput
      });

    if (error) {
      if (onShowToast) onShowToast(`Failed to submit review: ${error.message}`);
      return;
    }

    setReviewingMeeting(null);
    setReviewTextInput('');
    setRatingInput(5);
    
    if (onShowToast) {
      onShowToast('⭐️ Thank you for your review!');
    }
    fetchData();
    setActiveSubTab('reviews');
  };

  if (inVideoCall) {
    return (
      <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#090909', position: 'relative', zIndex: 1000 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', background: 'rgba(0,0,0,0.5)', zIndex: 10 }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary-green)' }}>Video Consultation</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Room: {currentCallRoom}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.1)', padding: '6px 12px', borderRadius: '12px', fontSize: '12px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'red', animation: 'pulse 1s infinite' }}>fiber_manual_record</span>
            <span>SIMULATED</span>
          </div>
        </div>

        <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', justifyContent: 'center' }}>
          <div style={{ flex: 1.2, position: 'relative', backgroundColor: '#1E1E1E', borderRadius: '20px', overflow: 'hidden', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', width: '100%', textAlign: 'center' }}>
              <img 
                src={appointments.find(a => a.roomId === currentCallRoom)?.expertAvatar || '/profile-placeholder.png'} 
                alt="Expert" 
                style={{ width: '96px', height: '96px', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--primary-green)' }} 
              />
              <div>
                <h4 style={{ fontSize: '16px', fontWeight: '600' }}>
                  {appointments.find(a => a.roomId === currentCallRoom)?.expertName || 'Dr. Anita Rao'}
                </h4>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Agronomist Expert (Consulting)</p>
              </div>
            </div>
            
            <div style={{ position: 'absolute', bottom: '16px', left: '16px', backgroundColor: 'rgba(0,0,0,0.6)', padding: '6px 12px', borderRadius: '10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--primary-green)' }}>mic</span>
              <span>Audio Connected</span>
            </div>
          </div>

          <div style={{ flex: 1, position: 'relative', backgroundColor: '#2A2A2A', borderRadius: '20px', overflow: 'hidden', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {!camOff ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', width: '100%' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '48px', color: 'var(--primary-green)', animation: 'spin 4s infinite linear' }}>filter_vintage</span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Local Camera Active</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '32px', color: 'var(--text-muted)' }}>videocam_off</span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Camera Muted</span>
              </div>
            )}

            <div style={{ position: 'absolute', bottom: '16px', left: '16px', backgroundColor: 'rgba(0,0,0,0.6)', padding: '6px 12px', borderRadius: '10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '14px', color: micMuted ? 'red' : 'var(--primary-green)' }}>
                {micMuted ? 'mic_off' : 'mic'}
              </span>
              <span>You (Farmer)</span>
            </div>
          </div>
        </div>

        <div style={{ padding: '24px 20px 40px 20px', background: 'rgba(30, 30, 30, 0.95)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'center', gap: '20px', zIndex: 10 }}>
          <button 
            onClick={() => setMicMuted(!micMuted)}
            style={{ width: '50px', height: '50px', borderRadius: '50%', backgroundColor: micMuted ? 'var(--error)' : 'rgba(255,255,255,0.08)', border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <span className="material-symbols-outlined">{micMuted ? 'mic_off' : 'mic'}</span>
          </button>

          <button 
            onClick={() => setCamOff(!camOff)}
            style={{ width: '50px', height: '50px', borderRadius: '50%', backgroundColor: camOff ? 'var(--error)' : 'rgba(255,255,255,0.08)', border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <span className="material-symbols-outlined">{camOff ? 'videocam_off' : 'videocam'}</span>
          </button>

          <button 
            onClick={handleLeaveCall}
            style={{ width: '50px', height: '50px', borderRadius: '50%', backgroundColor: 'var(--error)', border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <span className="material-symbols-outlined" style={{ transform: 'rotate(135deg)' }}>call_end</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Header title="Catch Up" onPeaAIClick={onPeaAIClick} />
      
      {/* Sub tabs nav */}
      <div style={{ 
        display: 'flex', 
        overflowX: 'auto', 
        gap: '6px', 
        padding: '12px 16px', 
        marginTop: 'var(--header-height)', 
        borderBottom: '1px solid var(--border-color)', 
        backgroundColor: 'rgba(18, 18, 18, 0.7)',
        backdropFilter: 'blur(10px)',
        zIndex: 90
      }}>
        <button 
          onClick={() => setActiveSubTab('book')}
          className={`chip ${activeSubTab === 'book' ? 'active' : ''}`}
          style={{ flexShrink: 0, fontSize: '12px' }}
        >
          Book Expert
        </button>
        <button 
          onClick={() => setActiveSubTab('upcoming')}
          className={`chip ${activeSubTab === 'upcoming' ? 'active' : ''}`}
          style={{ flexShrink: 0, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          Upcoming ({appointments.length})
        </button>
        <button 
          onClick={() => setActiveSubTab('history')}
          className={`chip ${activeSubTab === 'history' ? 'active' : ''}`}
          style={{ flexShrink: 0, fontSize: '12px' }}
        >
          History
        </button>
        <button 
          onClick={() => setActiveSubTab('lobby')}
          className={`chip ${activeSubTab === 'lobby' ? 'active' : ''}`}
          style={{ flexShrink: 0, fontSize: '12px' }}
        >
          Join Lobby
        </button>
        <button 
          onClick={() => setActiveSubTab('reviews')}
          className={`chip ${activeSubTab === 'reviews' ? 'active' : ''}`}
          style={{ flexShrink: 0, fontSize: '12px' }}
        >
          Reviews
        </button>
        <button 
          onClick={() => setActiveSubTab('marketplace')}
          className={`chip ${activeSubTab === 'marketplace' ? 'active' : ''}`}
          style={{ flexShrink: 0, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>storefront</span>
          Shop
        </button>
        {isCurrentExpert && (
          <button 
            onClick={() => setActiveSubTab('availability')}
            className={`chip ${activeSubTab === 'availability' ? 'active' : ''}`}
            style={{ flexShrink: 0, fontSize: '12px', borderColor: 'var(--primary-green)', color: 'var(--primary-green)' }}
          >
            Manage Availability
          </button>
        )}
      </div>

      <div className="page-container fade-in" style={{ paddingTop: '12px', overflowY: 'auto' }}>
        
        {/* ================= BOOK CONSULTATION ================= */}
        {activeSubTab === 'book' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '24px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '4px' }}>Available Verified Experts</h3>
            
            {expertsList.map((exp) => (
              <div 
                key={exp.id} 
                className="card fade-in" 
                style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
              >
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <img src={exp.avatar} alt={exp.name} style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontWeight: '600', fontSize: '15px' }}>{exp.name}</span>
                      <span className="material-symbols-outlined" style={{ color: 'var(--primary-green)', fontSize: '16px' }}>verified</span>
                    </div>
                    <span className="badge-role" style={{ display: 'inline-block', marginTop: '2px' }}>{exp.role}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--primary-green)' }}>₹500</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>per session</div>
                  </div>
                </div>

                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                  {exp.bio || 'Verified agricultural expert specialized in seed selection, crop diagnostics, and soil management.'}
                </p>

                <div style={{ display: 'flex', gap: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '10px', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#FFA726' }}>star</span>
                    <strong>4.9</strong> (15+ reviews)
                  </div>
                  
                  <Button 
                    onClick={() => handleBookClick(exp)} 
                    variant="primary" 
                    style={{ padding: '8px 16px', borderRadius: '12px', fontSize: '12px' }}
                  >
                    Book Consultation
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ================= EXPERT MANAGE AVAILABILITY ================= */}
        {activeSubTab === 'availability' && isCurrentExpert && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>Manage Expert Availability Slots</h3>
            
            <div className="card fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--primary-green)' }}>Create New Slot</h4>
              <InputField label="Slot Date" type="date" value={newSlotDate} onChange={(e) => setNewSlotDate(e.target.value)} required />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <InputField label="Start Time" type="time" value={newSlotStart} onChange={(e) => setNewSlotStart(e.target.value)} required />
                <InputField label="End Time" type="time" value={newSlotEnd} onChange={(e) => setNewSlotEnd(e.target.value)} required />
              </div>
              <InputField label="Rate (₹)" type="number" value={newSlotRate} onChange={(e) => setNewSlotRate(e.target.value)} required />
              <Button onClick={handleCreateSlot} variant="primary" style={{ marginTop: '8px', borderRadius: '12px' }}>
                Add Available Slot
              </Button>
            </div>

            <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-secondary)' }}>My Active Slots ({mySlots.length})</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {mySlots.map(s => (
                <div key={s.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px' }}>
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '13px' }}>{s.slot_date} ({s.start_time.substring(0,5)} - {s.end_time.substring(0,5)})</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Rate: ₹{s.rate}</div>
                  </div>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 'bold',
                    padding: '4px 8px',
                    borderRadius: '8px',
                    backgroundColor: s.is_booked ? 'rgba(255, 90, 90, 0.15)' : 'rgba(136, 217, 130, 0.15)',
                    color: s.is_booked ? 'var(--error)' : 'var(--primary-green)'
                  }}>
                    {s.is_booked ? 'Booked' : 'Available'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================= UPCOMING APPOINTMENTS ================= */}
        {activeSubTab === 'upcoming' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '4px' }}>Upcoming Appointments</h3>
            
            {appointments.map((appt) => (
              <div key={appt.id} className="card fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <img src={appt.expertAvatar} alt="" style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '14px' }}>{appt.expertName}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Consultation Session</div>
                    </div>
                  </div>
                  
                  <div style={{ backgroundColor: 'rgba(136, 217, 130, 0.12)', color: 'var(--primary-green)', padding: '4px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: '600' }}>
                    {appt.date} • {appt.time}
                  </div>
                </div>

                <div style={{ backgroundColor: '#252525', padding: '10px 12px', borderRadius: '10px', fontSize: '12px' }}>
                  <strong>Topic:</strong> {appt.topic}
                </div>

                <div style={{ display: 'flex', gap: '8px', alignSelf: 'flex-end' }}>
                  <Button 
                    onClick={() => handleStartCall(appt.roomId)} 
                    variant="primary" 
                    icon="video_call"
                    style={{ padding: '8px 16px', borderRadius: '12px', fontSize: '12px' }}
                  >
                    Join Meeting
                  </Button>
                </div>
              </div>
            ))}

            {appointments.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-secondary)' }}>
                No upcoming consultations scheduled.
              </div>
            )}
          </div>
        )}

        {/* ================= MEETING HISTORY ================= */}
        {activeSubTab === 'history' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '4px' }}>Meeting History</h3>
            
            {history.map((hist) => (
              <div key={hist.id} className="card fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <img src={hist.expertAvatar} alt="" style={{ width: '36px', height: '36px', borderRadius: '50%' }} />
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '13px' }}>{hist.expertName}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{hist.date}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Completed ({hist.duration})</span>
                </div>

                <p style={{ fontSize: '12px', color: '#dddddd' }}><strong>Consultation:</strong> {hist.topic}</p>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--primary-green)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>check_circle</span>
                    Session Verified
                  </span>
                  
                  {!hist.reviewed ? (
                    <Button 
                      onClick={() => handleOpenReviewDialog(hist)}
                      variant="secondary" 
                      style={{ padding: '6px 12px', borderRadius: '10px', fontSize: '11px' }}
                    >
                      Leave Review
                    </Button>
                  ) : (
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Review Submitted</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ================= JOIN LOBBY ================= */}
        {activeSubTab === 'lobby' && (
          <div className="card fade-in" style={{ padding: '24px 16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '8px' }}>Join Consultation Lobby</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.4', marginBottom: '20px' }}>
              If you have a customized consultation meeting ID provided by an administrator or expert, enter it below to join the video session lobby.
            </p>

            <form onSubmit={handleJoinByLobby} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <InputField
                label="Enter Meeting ID"
                placeholder="e.g. AGRI-ANITA-430"
                value={meetingIdInput}
                onChange={(e) => setMeetingIdInput(e.target.value)}
                icon="key"
                required
              />

              <Button type="submit" variant="primary" icon="videocam">
                Join Simulation Room
              </Button>
            </form>
          </div>
        )}

        {/* ================= REVIEWS ================= */}
        {activeSubTab === 'reviews' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '4px' }}>Recent Meeting Reviews</h3>
            
            {reviews.map((rev) => (
              <div key={rev.id} className="card fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <img src={rev.authorAvatar} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '13px' }}>{rev.authorName}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Reviewed: {rev.expertName}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{rev.date}</span>
                </div>

                <div style={{ display: 'flex', gap: '2px', margin: '4px 0' }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span 
                      key={i} 
                      className="material-symbols-outlined" 
                      style={{ fontSize: '16px', color: i < rev.rating ? '#FFA726' : 'var(--text-muted)' }}
                    >
                      star
                    </span>
                  ))}
                </div>

                <p style={{ fontSize: '13px', color: '#eeeeee', lineHeight: '1.4' }}>
                  "{rev.content}"
                </p>
              </div>
            ))}
          </div>
        )}

        {/* ================= MARKETPLACE ================= */}
        {activeSubTab === 'marketplace' && (() => {
          const cartItems = Object.entries(cart)
            .filter(([, qty]) => qty > 0)
            .map(([pid, qty]) => ({ product: products.find(p => p.id === pid), qty }))
            .filter(i => i.product);

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '32px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-secondary)' }}>
                Agro Marketplace — {products.length} Products
              </h3>

              {products.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
                  No products available yet. Check back soon!
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {products.map(product => (
                    <div key={product.id} style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                      {product.image_path ? (
                        <img src={product.image_path} alt={product.product_name} style={{ width: '100%', height: '100px', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100px', backgroundColor: 'var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '32px', color: 'var(--text-secondary)' }}>inventory_2</span>
                        </div>
                      )}
                      <div style={{ padding: '10px', flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ fontSize: '12px', fontWeight: '700', lineHeight: '1.3' }}>{product.product_name}</div>
                        {product.category && <span style={{ fontSize: '10px', color: 'var(--primary-green)', fontWeight: '600' }}>{product.category}</span>}
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Stock: {product.stock}</div>
                        <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary-green)' }}>₹{Number(product.price).toLocaleString('en-IN')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

      </div>

      {/* Book Session Dialog */}
      <Dialog
        isOpen={!!selectedExpert}
        title="Book Consultation Session"
        confirmText="Confirm Booking"
        onConfirm={handleConfirmBooking}
        onCancel={() => setSelectedExpert(null)}
      >
        {selectedExpert && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '12px 0' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '8px' }}>
              <img src={selectedExpert.avatar} alt="" style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
              <div>
                <div style={{ fontWeight: '600', fontSize: '14px' }}>{selectedExpert.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Consultation fee: ₹500</div>
              </div>
            </div>

            {availableSlots.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label className="form-label">Select Available Time Slot *</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', maxHeight: '160px', overflowY: 'auto' }}>
                  {availableSlots.map(slot => (
                    <div
                      key={slot.id}
                      onClick={() => {
                        if (!slot.is_booked) {
                          setSelectedSlot(slot);
                          setBookingDate(slot.slot_date);
                          setBookingTime(slot.start_time);
                        }
                      }}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '12px',
                        border: selectedSlot?.id === slot.id ? '2px solid var(--primary-green)' : '1px solid var(--border-color)',
                        backgroundColor: slot.is_booked ? 'rgba(255,255,255,0.03)' : selectedSlot?.id === slot.id ? 'rgba(136, 217, 130, 0.15)' : '#252525',
                        opacity: slot.is_booked ? 0.45 : 1,
                        cursor: slot.is_booked ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px'
                      }}
                    >
                      <div style={{ fontSize: '11px', fontWeight: '700', color: slot.is_booked ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                        {slot.slot_date}
                      </div>
                      <div style={{ fontSize: '10px', color: slot.is_booked ? 'var(--text-muted)' : 'var(--primary-green)', fontWeight: '600' }}>
                        {slot.start_time.substring(0,5)} - {slot.end_time.substring(0,5)}
                      </div>
                      {slot.is_booked && (
                        <span style={{ fontSize: '9px', color: 'var(--error)', fontWeight: 'bold' }}>Booked (Unavailable)</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <InputField
                  label="Select Date"
                  type="date"
                  value={bookingDate}
                  onChange={(e) => setBookingDate(e.target.value)}
                  required
                />
                <InputField
                  label="Select Time Slot"
                  type="time"
                  value={bookingTime}
                  onChange={(e) => setBookingTime(e.target.value)}
                  required
                />
              </>
            )}

            <div className="form-group">
              <label className="form-label">Consultation Topic / Issue</label>
              <div className="input-container" style={{ padding: '8px 16px' }}>
                <textarea
                  className="input-field"
                  rows="3"
                  value={bookingIssue}
                  onChange={(e) => setBookingIssue(e.target.value)}
                  placeholder="Explain the problem you're facing (e.g. wheat leaves turning yellow)..."
                  style={{ resize: 'none', height: '60px' }}
                  required
                />
              </div>
            </div>
          </div>
        )}
      </Dialog>

      {/* Review Dialog */}
      <Dialog
        isOpen={!!reviewingMeeting}
        title="Write Consultation Review"
        confirmText="Submit Review"
        onConfirm={handleSubmitReview}
        onCancel={() => setReviewingMeeting(null)}
      >
        {reviewingMeeting && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', margin: '12px 0' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Rating for session with <strong>{reviewingMeeting.expertName}</strong>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <span
                  key={star}
                  onClick={() => setRatingInput(star)}
                  className="material-symbols-outlined"
                  style={{ fontSize: '32px', color: star <= ratingInput ? '#FFA726' : 'var(--text-muted)', cursor: 'pointer' }}
                >
                  star
                </span>
              ))}
            </div>

            <div className="form-group">
              <label className="form-label">Your Review / Feedback</label>
              <div className="input-container" style={{ padding: '8px 16px' }}>
                <textarea
                  className="input-field"
                  rows="3"
                  value={reviewTextInput}
                  onChange={(e) => setReviewTextInput(e.target.value)}
                  placeholder="Share details about the expert advice you received..."
                  style={{ resize: 'none', height: '80px' }}
                  required
                />
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
