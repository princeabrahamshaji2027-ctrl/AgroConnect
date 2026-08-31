import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import InputField from '../components/InputField';
import { Button } from '../components/Button';
import Dialog from '../components/Dialog';
import { supabase } from '../supabase';
import './pages.css';

const DAYS_OF_WEEK = [
  { short: 'Mon', full: 'Monday' },
  { short: 'Tue', full: 'Tuesday' },
  { short: 'Wed', full: 'Wednesday' },
  { short: 'Thu', full: 'Thursday' },
  { short: 'Fri', full: 'Friday' },
  { short: 'Sat', full: 'Saturday' },
  { short: 'Sun', full: 'Sunday' }
];

function getNextDateForWeekday(fromDate, weekdayStr, weekOffset = 0) {
  const dayIndexMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const targetDay = dayIndexMap[weekdayStr];
  const currentDay = fromDate.getDay();
  let daysUntilTarget = targetDay - currentDay;
  if (daysUntilTarget < 0) {
    daysUntilTarget += 7;
  }
  const result = new Date(fromDate);
  result.setDate(fromDate.getDate() + daysUntilTarget + (weekOffset * 7));
  return result;
}

function formatDateYYYYMMDD(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addOneHour(timeStr) {
  if (!timeStr) return '10:00';
  const parts = timeStr.split(':');
  let h = parseInt(parts[0], 10);
  const m = parts[1] || '00';
  h = (h + 1) % 24;
  return `${String(h).padStart(2, '0')}:${m}`;
}

function formatTime12h(timeStr) {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  let h = parseInt(parts[0], 10);
  const m = parts[1] || '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, '0')}:${m} ${ampm}`;
}

function getDaysInMonthGrid(year, monthIndex) {
  const firstDayOfMonth = new Date(year, monthIndex, 1);
  const startingDayOfWeek = firstDayOfMonth.getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startingDayOfWeek; i++) {
    cells.push({ isPadding: true, dayNum: '' });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const monthStr = String(monthIndex + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const dateStr = `${year}-${monthStr}-${dayStr}`;
    cells.push({ isPadding: false, dayNum: day, dateStr });
  }

  return cells;
}

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

  // Rebuilt Manage Availability States
  const [selectedDays, setSelectedDays] = useState(['Mon', 'Tue', 'Wed']);
  const [expandedDays, setExpandedDays] = useState(['Mon']);
  const [timesByDay, setTimesByDay] = useState({
    Mon: [
      { time: '09:00', rate: 500 },
      { time: '11:00', rate: 500 },
      { time: '14:00', rate: 500 },
      { time: '16:00', rate: 500 }
    ],
    Tue: [],
    Wed: [],
    Thu: [],
    Fri: [],
    Sat: [],
    Sun: []
  });
  const [meetingDuration, setMeetingDuration] = useState(30);
  const [bufferTime, setBufferTime] = useState(10);
  const [slotPickerTime, setSlotPickerTime] = useState({ Mon: '09:00', Tue: '09:00', Wed: '09:00', Thu: '09:00', Fri: '09:00', Sat: '09:00', Sun: '09:00' });
  const [slotPickerRate, setSlotPickerRate] = useState({ Mon: 500, Tue: 500, Wed: 500, Thu: 500, Fri: 500, Sat: 500, Sun: 500 });

  // Database States & Calendar States
  const [expertsList, setExpertsList] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [history, setHistory] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [allExpertSlotsMap, setAllExpertSlotsMap] = useState({});

  const currentDateObj = new Date();
  const [calYear, setCalYear] = useState(currentDateObj.getFullYear());
  const [calMonth, setCalMonth] = useState(currentDateObj.getMonth());

  // Video call simulation states
  const [inVideoCall, setInVideoCall] = useState(false);
  const [currentCallRoom, setCurrentCallRoom] = useState('');
  const [meetingIdInput, setMeetingIdInput] = useState('');
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);

  // Review submission state
  const [reviewingMeeting, setReviewingMeeting] = useState(null);
  const [ratingInput, setRatingInput] = useState(5);
  const [reviewTextInput, setReviewTextInput] = useState('');

  // Marketplace state
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState({});

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
        .select('id, meeting_duration_minutes, buffer_time_minutes')
        .eq('user_id', user.id)
        .maybeSingle();

      if (myExpert) {
        setIsCurrentExpert(true);
        setCurrentExpertId(myExpert.id);
        if (myExpert.meeting_duration_minutes) setMeetingDuration(myExpert.meeting_duration_minutes);
        if (myExpert.buffer_time_minutes) setBufferTime(myExpert.buffer_time_minutes);
        fetchMySlots(myExpert.id);
      }

      // 1a. Fetch reviews per expert count
      const { data: allRevs } = await supabase.from('reviews').select('expert_id');
      const revCounts = {};
      if (allRevs) {
        allRevs.forEach(r => {
          if (r.expert_id) revCounts[r.expert_id] = (revCounts[r.expert_id] || 0) + 1;
        });
      }

      // 1b. Fetch all consultation slots for calendar view
      const { data: allSlots } = await supabase
        .from('consultation_slots')
        .select('*')
        .order('slot_date', { ascending: true })
        .order('start_time', { ascending: true });

      const slotsGrouped = {};
      if (allSlots) {
        allSlots.forEach(s => {
          if (!slotsGrouped[s.expert_id]) slotsGrouped[s.expert_id] = [];
          slotsGrouped[s.expert_id].push(s);
        });
      }
      setAllExpertSlotsMap(slotsGrouped);

      // 1c. Fetch experts
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
          rating: exp.rating ? Number(exp.rating).toFixed(1) : '5.0',
          reviewCount: revCounts[exp.id] || 0
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

  const handleToggleDay = (dayStr) => {
    if (selectedDays.includes(dayStr)) {
      setSelectedDays(selectedDays.filter(d => d !== dayStr));
      setExpandedDays(expandedDays.filter(d => d !== dayStr));
    } else {
      setSelectedDays([...selectedDays, dayStr]);
      if (expandedDays.length === 0) {
        setExpandedDays([dayStr]);
      }
    }
  };

  const handleToggleExpandDay = (dayStr) => {
    if (expandedDays.includes(dayStr)) {
      setExpandedDays(expandedDays.filter(d => d !== dayStr));
    } else {
      setExpandedDays([...expandedDays, dayStr]);
    }
  };

  const handleRemoveTimeSlot = (dayStr, indexToRemove) => {
    setTimesByDay(prev => ({
      ...prev,
      [dayStr]: (prev[dayStr] || []).filter((_, idx) => idx !== indexToRemove)
    }));
  };

  const handleAddTimeSlotToDay = (dayStr) => {
    const timeToAdd = slotPickerTime[dayStr] || '09:00';
    const rateToAdd = parseFloat(slotPickerRate[dayStr]) || 500;
    const currentSlots = timesByDay[dayStr] || [];
    if (currentSlots.some(s => (typeof s === 'string' ? s : s.time) === timeToAdd)) {
      if (onShowToast) onShowToast(`⚠️ ${formatTime12h(timeToAdd)} is already added for ${dayStr}`);
      return;
    }
    const updated = [...currentSlots, { time: timeToAdd, rate: rateToAdd }].sort((a, b) => {
      const tA = typeof a === 'string' ? a : a.time;
      const tB = typeof b === 'string' ? b : b.time;
      return tA.localeCompare(tB);
    });
    setTimesByDay(prev => ({
      ...prev,
      [dayStr]: updated
    }));
  };

  const handleSaveAvailability = async () => {
    if (!currentExpertId) {
      alert('Expert profile not found. Make sure your account has an expert role.');
      return;
    }
    const slotsToInsert = [];
    const today = new Date();

    for (let week = 0; week < 8; week++) {
      for (const day of selectedDays) {
        const date = getNextDateForWeekday(today, day, week);
        const daySlots = timesByDay[day] || [];
        for (const slotObj of daySlots) {
          const timeStr = typeof slotObj === 'string' ? slotObj : slotObj.time;
          const rateVal = typeof slotObj === 'object' && slotObj.rate !== undefined ? slotObj.rate : 500;
          const endTimeStr = addOneHour(timeStr);
          slotsToInsert.push({
            expert_id: currentExpertId,
            slot_date: formatDateYYYYMMDD(date),
            start_time: timeStr,
            end_time: endTimeStr,
            rate: parseFloat(rateVal) || 500,
            is_booked: false
          });
        }
      }
    }

    if (slotsToInsert.length === 0) {
      if (onShowToast) onShowToast('⚠️ Please select days and add time slots before saving availability.');
      return;
    }

    const { error } = await supabase
      .from('consultation_slots')
      .upsert(slotsToInsert, { onConflict: 'expert_id,slot_date,start_time', ignoreDuplicates: true });

    if (error) {
      alert(`Error saving availability: ${error.message}`);
      return;
    }

    await supabase
      .from('experts')
      .update({
        meeting_duration_minutes: meetingDuration,
        buffer_time_minutes: bufferTime
      })
      .eq('id', currentExpertId);

    if (onShowToast) onShowToast('✅ Availability saved!');
    fetchMySlots(currentExpertId);
    fetchData();
  };

  const handlePrevMonth = () => {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear(calYear - 1);
    } else {
      setCalMonth(calMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear(calYear + 1);
    } else {
      setCalMonth(calMonth + 1);
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '4px' }}>Available Verified Experts</h3>
            
            {expertsList.map((exp) => {
              const expertSlots = allExpertSlotsMap[exp.id] || [];
              const unbookedSlots = expertSlots.filter(s => !s.is_booked);
              const minRate = unbookedSlots.length > 0
                ? Math.min(...unbookedSlots.map(s => Number(s.rate) || 500))
                : (expertSlots.length > 0 ? Math.min(...expertSlots.map(s => Number(s.rate) || 500)) : 500);

              return (
                <div 
                  key={exp.id} 
                  className="card fade-in" 
                  style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
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
                      <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--primary-green)' }}>From ₹{minRate}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>per session</div>
                    </div>
                  </div>

                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                    {exp.bio || 'Verified agricultural expert specialized in seed selection, crop diagnostics, and soil management.'}
                  </p>

                  <div style={{ display: 'flex', gap: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '10px', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#FFA726' }}>star</span>
                      <strong>{exp.rating}</strong> ({exp.reviewCount} reviews)
                    </div>
                    
                    <Button 
                      onClick={() => handleBookClick(exp)} 
                      variant="primary" 
                      style={{ padding: '8px 16px', borderRadius: '12px', fontSize: '12px' }}
                    >
                      Book Consultation
                    </Button>
                  </div>

                  {/* Calendar Grid Date Picker matching user_catchup page.png */}
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px', marginTop: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                      <span className="material-symbols-outlined" style={{ color: 'var(--primary-green)', fontSize: '18px' }}>calendar_month</span>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>Select a Date</span>
                    </div>

                    {/* Month Header Navigation */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <button 
                        onClick={handlePrevMonth}
                        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
                      >
                        <span className="material-symbols-outlined">chevron_left</span>
                      </button>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
                        {new Date(calYear, calMonth).toLocaleString('default', { month: 'long', year: 'numeric' })}
                      </div>
                      <button 
                        onClick={handleNextMonth}
                        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
                      >
                        <span className="material-symbols-outlined">chevron_right</span>
                      </button>
                    </div>

                    {/* Weekday Labels */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '8px' }}>
                      {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                        <div key={d}>{d}</div>
                      ))}
                    </div>

                    {/* Grid of Dates */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
                      {getDaysInMonthGrid(calYear, calMonth).map((cell, idx) => {
                        if (cell.isPadding) {
                          return <div key={`pad-${idx}`} style={{ height: '48px' }} />;
                        }

                        const dateSlots = expertSlots.filter(s => s.slot_date === cell.dateStr);
                        const unbookedOnDate = dateSlots.filter(s => !s.is_booked);
                        const hasAvailableSlots = unbookedOnDate.length > 0;
                        const minDateRate = hasAvailableSlots 
                          ? Math.min(...unbookedOnDate.map(s => Number(s.rate) || 500))
                          : null;

                        return (
                          <div
                            key={cell.dateStr}
                            onClick={() => {
                              if (hasAvailableSlots) {
                                handleBookClick(exp);
                                setBookingDate(cell.dateStr);
                                setAvailableSlots(dateSlots);
                              }
                            }}
                            style={{
                              height: '48px',
                              borderRadius: '12px',
                              border: hasAvailableSlots ? '1.5px solid var(--primary-green)' : '1px solid var(--border-color)',
                              backgroundColor: hasAvailableSlots ? 'rgba(136, 217, 130, 0.06)' : '#181818',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '4px 2px',
                              cursor: hasAvailableSlots ? 'pointer' : 'default',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            <span style={{ fontSize: '13px', fontWeight: '600', color: hasAvailableSlots ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                              {cell.dayNum}
                            </span>
                            <span style={{ fontSize: '10px', fontWeight: '700', color: hasAvailableSlots ? 'var(--primary-green)' : 'var(--text-muted)', marginTop: '2px' }}>
                              {hasAvailableSlots ? `₹${minDateRate}` : '--'}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '12px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>info</span>
                      <span>You can select any available date to book a session.</span>
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        )}

        {/* ================= EXPERT MANAGE AVAILABILITY ================= */}
        {activeSubTab === 'availability' && isCurrentExpert && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '32px' }}>
            
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>Manage Availability</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Set the days and time slots when you are available for meetings
                </p>
              </div>
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                backgroundColor: 'rgba(136, 217, 130, 0.12)',
                border: '1px solid rgba(136, 217, 130, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--primary-green)'
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>edit_calendar</span>
              </div>
            </div>

            {/* Section 1: Select Available Days */}
            <div className="card fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary-green)' }}>
                1. Select Available Days
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '-8px' }}>
                Choose the days you are available for meetings
              </div>

              {/* Day Chips */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', marginTop: '4px' }}>
                {DAYS_OF_WEEK.map(d => {
                  const isSelected = selectedDays.includes(d.short);
                  return (
                    <button
                      key={d.short}
                      type="button"
                      onClick={() => handleToggleDay(d.short)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '10px 4px',
                        borderRadius: '12px',
                        border: isSelected ? '1.5px solid var(--primary-green)' : '1px solid var(--border-color)',
                        backgroundColor: isSelected ? 'rgba(136, 217, 130, 0.12)' : '#1E1E1E',
                        color: isSelected ? 'var(--primary-green)' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        outline: 'none'
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', marginBottom: '4px', color: isSelected ? 'var(--primary-green)' : 'var(--text-secondary)' }}>
                        event
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: '600' }}>{d.short}</span>
                    </button>
                  );
                })}
              </div>

              {/* Info Box */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 12px',
                borderRadius: '10px',
                backgroundColor: 'rgba(136, 217, 130, 0.08)',
                border: '1px solid rgba(136, 217, 130, 0.2)',
                marginTop: '4px'
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--primary-green)' }}>info</span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.3' }}>
                  Only selected days will be shown to users when booking a meeting with you.
                </span>
              </div>
            </div>

            {/* Section 2: Set Time Slots */}
            <div className="card fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary-green)' }}>
                2. Set Time Slots
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '-8px' }}>
                Add the time slots for each selected day
              </div>

              {selectedDays.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
                  No days selected. Please select available days above.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {DAYS_OF_WEEK.filter(d => selectedDays.includes(d.short)).map(d => {
                    const isExpanded = expandedDays.includes(d.short);
                    const daySlots = timesByDay[d.short] || [];

                    return (
                      <div
                        key={d.short}
                        style={{
                          borderRadius: '12px',
                          border: '1px solid var(--border-color)',
                          backgroundColor: '#181818',
                          overflow: 'hidden'
                        }}
                      >
                        {/* Day Accordion Header */}
                        <div
                          onClick={() => handleToggleExpandDay(d.short)}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '12px 14px',
                            cursor: 'pointer',
                            backgroundColor: 'rgba(255,255,255,0.02)'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ color: 'var(--primary-green)', fontSize: '12px' }}>●</span>
                            <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                              {d.full}
                            </span>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                              ({daySlots.length} slot{daySlots.length === 1 ? '' : 's'})
                            </span>
                          </div>
                          <span className="material-symbols-outlined" style={{ color: 'var(--text-secondary)' }}>
                            {isExpanded ? 'expand_less' : 'expand_more'}
                          </span>
                        </div>

                        {/* Day Accordion Content */}
                        {isExpanded && (
                          <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {/* Slots Chips */}
                            {daySlots.length > 0 ? (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {daySlots.map((slotObj, idx) => {
                                  const timeStr = typeof slotObj === 'string' ? slotObj : slotObj.time;
                                  const rateVal = typeof slotObj === 'object' && slotObj.rate !== undefined ? slotObj.rate : 500;
                                  return (
                                    <div
                                      key={idx}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '6px 12px',
                                        borderRadius: '10px',
                                        backgroundColor: '#252525',
                                        border: '1px solid var(--border-color)',
                                        fontSize: '12px',
                                        color: 'var(--text-primary)'
                                      }}
                                    >
                                      <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--primary-green)' }}>schedule</span>
                                      <span>{formatTime12h(timeStr)}</span>
                                      <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>₹{rateVal}</span>
                                      <span
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRemoveTimeSlot(d.short, idx);
                                        }}
                                        style={{
                                          cursor: 'pointer',
                                          marginLeft: '4px',
                                          color: 'var(--text-muted)',
                                          fontSize: '14px',
                                          fontWeight: 'bold'
                                        }}
                                      >
                                        ✕
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                No time slots added for {d.full} yet.
                              </div>
                            )}

                            {/* Add Time Slot Controls */}
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '10px',
                              borderRadius: '10px',
                              backgroundColor: '#222',
                              border: '1px border-dashed var(--border-color)'
                            }}>
                              <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>Start Time (1 hr duration)</label>
                                <input
                                  type="time"
                                  value={slotPickerTime[d.short] || '09:00'}
                                  onChange={(e) => setSlotPickerTime({ ...slotPickerTime, [d.short]: e.target.value })}
                                  style={{
                                    width: '100%',
                                    backgroundColor: '#181818',
                                    border: '1px solid var(--border-color)',
                                    color: 'var(--text-primary)',
                                    padding: '6px 8px',
                                    borderRadius: '8px',
                                    fontSize: '12px'
                                  }}
                                />
                              </div>

                              <div style={{ width: '90px' }}>
                                <label style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>Rate (₹)</label>
                                <input
                                  type="number"
                                  value={slotPickerRate[d.short] || 500}
                                  onChange={(e) => setSlotPickerRate({ ...slotPickerRate, [d.short]: e.target.value })}
                                  style={{
                                    width: '100%',
                                    backgroundColor: '#181818',
                                    border: '1px solid var(--border-color)',
                                    color: 'var(--text-primary)',
                                    padding: '6px 8px',
                                    borderRadius: '8px',
                                    fontSize: '12px'
                                  }}
                                />
                              </div>

                              <Button
                                type="button"
                                onClick={() => handleAddTimeSlotToDay(d.short)}
                                variant="secondary"
                                style={{ padding: '8px 12px', fontSize: '11px', borderRadius: '8px', alignSelf: 'flex-end' }}
                              >
                                + Add
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Timezone Footer */}
              <div style={{
                display: 'flex',
                justify: 'space-between',
                alignItems: 'center',
                padding: '10px 12px',
                borderRadius: '10px',
                backgroundColor: 'rgba(136, 217, 130, 0.08)',
                border: '1px solid rgba(136, 217, 130, 0.2)',
                marginTop: '4px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--primary-green)' }}>schedule</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Time is shown in your local timezone (Asia/Kolkata)</span>
                </div>
                <button
                  type="button"
                  onClick={() => { if (onShowToast) onShowToast('🌐 Timezone locked to Asia/Kolkata'); }}
                  style={{
                    backgroundColor: 'rgba(136, 217, 130, 0.15)',
                    border: 'none',
                    color: 'var(--primary-green)',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontSize: '10px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Change Timezone
                </button>
              </div>
            </div>

            {/* Section 3: Meeting Settings */}
            <div className="card fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary-green)' }}>
                3. Meeting Settings
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '-10px' }}>
                Configure your meeting preferences
              </div>

              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                padding: '12px',
                borderRadius: '12px',
                backgroundColor: '#181818',
                border: '1px solid var(--border-color)'
              }}>
                {/* Meeting Duration Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'rgba(136, 217, 130, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-green)' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>timer</span>
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '600' }}>Meeting Duration</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Set default duration for each meeting</div>
                    </div>
                  </div>
                  <select
                    value={meetingDuration}
                    onChange={(e) => setMeetingDuration(Number(e.target.value))}
                    style={{
                      backgroundColor: '#252525',
                      border: '1px solid var(--border-color)',
                      color: 'var(--primary-green)',
                      padding: '6px 10px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: '600',
                      outline: 'none'
                    }}
                  >
                    <option value={15}>15 mins</option>
                    <option value={30}>30 mins</option>
                    <option value={45}>45 mins</option>
                    <option value={60}>60 mins</option>
                  </select>
                </div>

                <div style={{ borderTop: '1px solid var(--border-color)' }} />

                {/* Buffer Time Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'rgba(136, 217, 130, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-green)' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>currency_rupee</span>
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '600' }}>Buffer Time</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Add gap between meetings</div>
                    </div>
                  </div>
                  <select
                    value={bufferTime}
                    onChange={(e) => setBufferTime(Number(e.target.value))}
                    style={{
                      backgroundColor: '#252525',
                      border: '1px solid var(--border-color)',
                      color: 'var(--primary-green)',
                      padding: '6px 10px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: '600',
                      outline: 'none'
                    }}
                  >
                    <option value={0}>0 mins</option>
                    <option value={5}>5 mins</option>
                    <option value={10}>10 mins</option>
                    <option value={15}>15 mins</option>
                    <option value={30}>30 mins</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <Button
              type="button"
              onClick={handleSaveAvailability}
              variant="primary"
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '16px',
                fontSize: '15px',
                fontWeight: '700',
                backgroundColor: 'var(--primary-green)',
                color: '#121212',
                marginTop: '8px'
              }}
            >
              Save Availability
            </Button>

            {/* Active generated slots summary */}
            <div style={{ marginTop: '12px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                Generated Calendar Slots ({mySlots.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                {mySlots.map(s => (
                  <div key={s.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px' }}>
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '12px' }}>{s.slot_date} ({formatTime12h(s.start_time)} - {formatTime12h(s.end_time)})</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Rate: ₹{s.rate}</div>
                    </div>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 'bold',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      backgroundColor: s.is_booked ? 'rgba(255, 90, 90, 0.15)' : 'rgba(136, 217, 130, 0.15)',
                      color: s.is_booked ? 'var(--error)' : 'var(--primary-green)'
                    }}>
                      {s.is_booked ? 'Booked' : 'Available'}
                    </span>
                  </div>
                ))}
                {mySlots.length === 0 && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', padding: '12px' }}>
                    No slots generated yet. Select days and click Save Availability above.
                  </div>
                )}
              </div>
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
                    {appt.date} • {formatTime12h(appt.time)}
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
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  {bookingDate ? `Selected Date: ${bookingDate}` : 'Select a slot below'}
                </div>
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
                        {formatTime12h(slot.start_time)} - {formatTime12h(slot.end_time)} (₹{slot.rate})
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
