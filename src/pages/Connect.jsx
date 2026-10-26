import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import InputField from '../components/InputField';
import { Button } from '../components/Button';
import Dialog from '../components/Dialog';
import BottomSheet from '../components/BottomSheet';
import ExpertMenuSheet from '../components/ExpertMenuSheet';
import LeaveExpertDialog from '../components/LeaveExpertDialog';
import DemoCheckout from '../components/DemoCheckout';
import ConsultationFeeEditor from '../components/ConsultationFeeEditor';
import { formatInr } from '../utils/money';
import JoinMeetingButton, { meetingStartMs } from '../components/JoinMeetingButton';
import { supabase } from '../supabase';
import { normalizeMeetLink, openMeetingLink, prepareMeetWindow, MEET_LINK_HINT } from '../utils/meetLink';
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

// Open and still in the future (slots are stored as the expert's local date + time, same as this device).
function isBookableSlot(s) {
  if (s.is_booked) return false;
  const now = new Date();
  const today = formatDateYYYYMMDD(now);
  if (s.slot_date !== today) return s.slot_date > today;
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return (s.start_time || '').slice(0, 5) > hhmm;
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

function groupMeetingsByDate(meetingList) {
  const grouped = {};
  meetingList.forEach(m => {
    const d = m.date || 'Upcoming';
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(m);
  });
  Object.keys(grouped).forEach(d => {
    grouped[d].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  });
  return grouped;
}

// End of the booked slot (as consultation_window() in the database); a slot ending after midnight ends next day.
const slotEndMs = (b) => {
  const slot = b.consultation_slots;
  const start = meetingStartMs(b.meeting_date, b.meeting_time);
  if (!slot?.end_time) return null;
  const end = meetingStartMs(slot.slot_date || b.meeting_date, slot.end_time);
  return end > start ? end : end + 24 * 60 * 60 * 1000;
};
// The saved Google Meet link of a booking (video_meetings is one row per booking; PostgREST may return it as a list).
const meetingLinkOf = (b) => {
  const vm = Array.isArray(b.video_meetings) ? b.video_meetings[0] : b.video_meetings;
  return vm?.meeting_link || null;
};
function MeetLinkStatus({ link, expert = false }) {
  const ready = !!link;
  return (
    <div
      data-testid="meet-link-status"
      style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 600,
               color: ready ? 'var(--primary-green)' : '#FFA726' }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden="true">{ready ? 'link' : 'hourglass_top'}</span>
      {ready ? (expert ? 'Google Meet link saved' : 'Google Meet link ready')
             : (expert ? 'No meeting link yet — add a Google Meet link' : 'Waiting for expert to add meeting link')}
    </div>
  );
}

// The fee agreed for a booking = its confirmed payment snapshot (never the expert's current fee). Readable by the farmer.
const agreedFeeOf = (b) => {
  const list = Array.isArray(b.demo_payments) ? b.demo_payments : b.demo_payments ? [b.demo_payments] : [];
  return list.find((p) => p.status === 'succeeded')?.amount_paise ?? null;
};
const COMMON_TIME_SLOTS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30'
];

function InlineTimePicker({ value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justify: 'space-between',
          backgroundColor: '#181818',
          border: '1px solid var(--border-color)',
          color: 'var(--text-primary)',
          padding: '8px 10px',
          borderRadius: '8px',
          fontSize: '12px',
          cursor: 'pointer'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--primary-green)' }}>schedule</span>
          <span>{formatTime12h(value || '09:00')}</span>
        </div>
        <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>
          {isOpen ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 999,
          marginTop: '4px',
          backgroundColor: '#1E1E1E',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '8px',
          maxHeight: '160px',
          overflowY: 'auto',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '6px',
          boxShadow: '0 8px 16px rgba(0,0,0,0.6)'
        }}>
          {COMMON_TIME_SLOTS.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => {
                onChange(t);
                setIsOpen(false);
              }}
              style={{
                padding: '6px 8px',
                borderRadius: '6px',
                border: value === t ? '1px solid var(--primary-green)' : '1px solid var(--border-color)',
                backgroundColor: value === t ? 'rgba(136, 217, 130, 0.15)' : '#252525',
                color: value === t ? 'var(--primary-green)' : 'var(--text-primary)',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              {formatTime12h(t)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function InlineCalendarPicker({ year, month, onPrevMonth, onNextMonth, onSelectDate, selectedDate }) {
  const cells = getDaysInMonthGrid(year, month);
  return (
    <div style={{ backgroundColor: '#181818', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px', marginTop: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <button type="button" onClick={onPrevMonth} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <span className="material-symbols-outlined">chevron_left</span>
        </button>
        <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>
          {new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' })}
        </span>
        <button type="button" onClick={onNextMonth} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <span className="material-symbols-outlined">chevron_right</span>
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <div key={d}>{d}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
        {cells.map((cell, idx) => {
          if (cell.isPadding) return <div key={`pad-${idx}`} style={{ height: '32px' }} />;
          const isSelected = selectedDate === cell.dateStr;
          return (
            <button
              key={cell.dateStr}
              type="button"
              onClick={() => onSelectDate(cell.dateStr)}
              style={{
                height: '32px',
                borderRadius: '8px',
                border: isSelected ? '1.5px solid var(--primary-green)' : '1px solid var(--border-color)',
                backgroundColor: isSelected ? 'rgba(136, 217, 130, 0.2)' : '#222',
                color: isSelected ? 'var(--primary-green)' : 'var(--text-primary)',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              {cell.dayNum}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Connect({ onPeaAIClick, onShowToast, initialBooking, clearInitialBooking, onProfileClick, focusBookingId, clearFocusBooking }) {
  const [activeSubTab, setActiveSubTab] = useState('book'); // 'book' | 'upcoming' | 'history' | 'lobby' | 'reviews' | 'marketplace' | 'availability'
  
  // Book Consultation States
  const [selectedExpert, setSelectedExpert] = useState(null);
  const [bookingDate, setBookingDate] = useState('');
  const [bookingTime, setBookingTime] = useState('');
  const [bookingIssue, setBookingIssue] = useState('');
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);

  // Expert Slot Management & Identity States
  const [isCurrentExpert, setIsCurrentExpert] = useState(false);
  // role says Expert but there is no active expert record (e.g. an approval made outside the app): show why
  const [expertRecordMissing, setExpertRecordMissing] = useState(false);
  const [currentExpertId, setCurrentExpertId] = useState(null);
  const [currentExpertProfile, setCurrentExpertProfile] = useState(null);
  const [mySlots, setMySlots] = useState([]);

  // Expert Menu & Leave Expert Mode states
  const [isMenuSheetOpen, setIsMenuSheetOpen] = useState(false);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);

  // Meeting Detail Sheet & Cancellation states
  const [selectedMeetingDetail, setSelectedMeetingDetail] = useState(null);
  const [isCancelSheetOpen, setIsCancelSheetOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [offeredSlots, setOfferedSlots] = useState([]);
  const [offerDateInput, setOfferDateInput] = useState('');
  const [offerTimeInput, setOfferTimeInput] = useState('10:00');
  const [cancellingMeeting, setCancellingMeeting] = useState(false);

  // Expert Edit Profile Modal state
  const [isExpertProfileEditOpen, setIsExpertProfileEditOpen] = useState(false);
  const [expertEditBio, setExpertEditBio] = useState('');
  const [expertEditSpecialization, setExpertEditSpecialization] = useState('');

  // Expandable calendar grid for expert cards
  const [expandedExpertId, setExpandedExpertId] = useState(null);

  // Cancellation picker state
  const [showCancelCalendar, setShowCancelCalendar] = useState(false);
  const [cancelCalYear, setCancelCalYear] = useState(new Date().getFullYear());
  const [cancelCalMonth, setCancelCalMonth] = useState(new Date().getMonth());


  // Reminders, expert no-show cancellation and refunds run on the server
  // (process_consultation_lifecycle, scheduled by pg_cron) — see supabase/proposed/05_*.sql.


  // Rebuilt Manage Availability States
  const [selectedDays, setSelectedDays] = useState(['Mon', 'Tue', 'Wed']);
  const [expandedDays, setExpandedDays] = useState(['Mon']);
  const [timesByDay, setTimesByDay] = useState({
    Mon: [
      { time: '09:00' },
      { time: '11:00' },
      { time: '14:00' },
      { time: '16:00' }
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

  // Database States & Calendar States
  const [expertsList, setExpertsList] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyShown, setHistoryShown] = useState(15); // render in pages; long histories froze Android
  const [reviews, setReviews] = useState([]);
  const [allExpertSlotsMap, setAllExpertSlotsMap] = useState({});

  const currentDateObj = new Date();
  const [calYear, setCalYear] = useState(currentDateObj.getFullYear());
  const [calMonth, setCalMonth] = useState(currentDateObj.getMonth());

  // Consultations happen in Google Meet: the expert saves the link, Join opens it outside the app (migration 14)
  const [joiningId, setJoiningId] = useState(null);
  const [completingId, setCompletingId] = useState(null);
  const [linkEditor, setLinkEditor] = useState(null); // { appt, value, saving, error, saved }
  const [checkout, setCheckout] = useState(null);     // { slotId, issue } while the checkout is open (simulated payment)
  const [myFeePaise, setMyFeePaise] = useState(null); // signed-in expert's own consultation fee
  // server clock = phone clock + offset, measured by consultation_join_status(); ticks once a second
  const [clockOffsetMs, setClockOffsetMs] = useState(0);

  // Review submission state
  const [reviewingMeeting, setReviewingMeeting] = useState(null);
  const [ratingInput, setRatingInput] = useState(5);
  const [reviewTextInput, setReviewTextInput] = useState('');

  // Marketplace state
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState({});

  useEffect(() => {
    if (initialBooking && initialBooking.expertId && expertsList.length > 0) {
      const exp = expertsList.find(e => e.id === initialBooking.expertId);
      if (exp) {
        setSelectedExpert(exp);
        setBookingDate(initialBooking.date || '');
        setBookingTime(initialBooking.time || '');
        if (clearInitialBooking) clearInitialBooking();
      }
    }
  }, [initialBooking, expertsList]);

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
        .select('id, meeting_duration_minutes, buffer_time_minutes, is_active, specialization, consultation_fee_paise')
        .eq('user_id', user.id)
        .maybeSingle();

      let activeExpertId = null;
      if (myExpert && myExpert.is_active !== false) {
        setIsCurrentExpert(true);
        setCurrentExpertId(myExpert.id);
        setMyFeePaise(myExpert.consultation_fee_paise);
        activeExpertId = myExpert.id;
        setActiveSubTab(prev => (prev === 'book' ? 'upcoming' : prev));
        if (myExpert.meeting_duration_minutes) setMeetingDuration(myExpert.meeting_duration_minutes);
        if (myExpert.buffer_time_minutes) setBufferTime(myExpert.buffer_time_minutes);
        fetchMySlots(myExpert.id);

        const { data: userProf } = await supabase
          .from('profiles')
          .select('full_name, profile_image_path, role, bio')
          .eq('id', user.id)
          .single();

        if (userProf) {
          setCurrentExpertProfile({
            name: userProf.full_name || 'Expert',
            avatar: userProf.profile_image_path || '/profile-placeholder.png',
            role: userProf.role || 'Agronomist',
            bio: userProf.bio || myExpert.specialization || 'Verified Expert',
            specialization: myExpert.specialization || ''
          });
          setExpertEditBio(userProf.bio || '');
          setExpertEditSpecialization(myExpert.specialization || '');
        }
      } else {
        setIsCurrentExpert(false);
        setCurrentExpertId(null);
        setCurrentExpertProfile(null);
        const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        setExpertRecordMissing(me?.role === 'Expert');
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

      // 1c. Only experts with at least one open future slot are listed (no empty calendars); never yourself
      const hasUpcomingAvailability = (expertId) => (slotsGrouped[expertId] || []).some(isBookableSlot);

      const { data: expertsData } = await supabase
        .from('experts')
        .select(`
          id,
          user_id,
          rating,
          is_active,
          consultation_fee_paise,
          profiles:user_id (
            full_name,
            profile_image_path,
            role,
            bio
          )
        `);
      if (expertsData) {
        setExpertsList(
          expertsData
            .filter(exp => exp.is_active !== false && exp.id !== activeExpertId && hasUpcomingAvailability(exp.id))
            .map(exp => ({
              id: exp.id,
              userId: exp.user_id,
              name: exp.profiles?.full_name || 'Expert',
              avatar: exp.profiles?.profile_image_path || '/profile-placeholder.png',
              role: exp.profiles?.role || 'Expert',
              bio: exp.profiles?.bio || '',
              rating: exp.rating ? Number(exp.rating).toFixed(1) : '5.0',
              feePaise: exp.consultation_fee_paise,   // the expert's fee: the only price shown before checkout
              reviewCount: revCounts[exp.id] || 0
            }))
        );
      }

      if (activeExpertId) {
        // If expert, fetch expert's upcoming bookings
        const { data: expBookings } = await supabase
          .from('consultation_bookings')
          .select(`
            *,
            consultation_slots:slot_id ( slot_date, start_time, end_time ),
            video_meetings ( meeting_link ),
            farmer_profiles:farmer_id (
              id,
              user_id,
              profiles:user_id (
                id,
                full_name,
                profile_image_path
              )
            )
          `)
          .eq('expert_id', activeExpertId)
          .eq('status', 'Booked')
          .order('meeting_date', { ascending: true })
          .order('meeting_time', { ascending: true });

        if (expBookings) {
          setAppointments(expBookings.map(b => ({
            id: b.id,
            farmerId: b.farmer_profiles?.id,
            farmerUserId: b.farmer_profiles?.user_id || b.farmer_profiles?.profiles?.id,
            farmerName: b.farmer_profiles?.profiles?.full_name || 'Farmer',
            farmerAvatar: b.farmer_profiles?.profiles?.profile_image_path || '/profile-placeholder.png',
            expertName: b.farmer_profiles?.profiles?.full_name || 'Farmer',
            expertAvatar: b.farmer_profiles?.profiles?.profile_image_path || '/profile-placeholder.png',
            topic: b.issue_description || '',
            date: b.meeting_date,
            time: b.meeting_time,
            endsMs: slotEndMs(b),
            slotId: b.slot_id,
            meetingLink: meetingLinkOf(b),
            status: 'upcoming'
          })));
        }
      } else {
        // Get farmer profile
        const { data: farmerProfile } = await supabase
          .from('farmer_profiles')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (farmerProfile) {
          // 2. Fetch upcoming bookings for farmer
          const { data: bookingsData } = await supabase
            .from('consultation_bookings')
            .select(`
              *,
              consultation_slots:slot_id ( slot_date, start_time, end_time ),
              video_meetings ( meeting_link ),
              demo_payments ( amount_paise, status ),
              experts:expert_id (
                id,
                user_id,
                profiles:user_id (
                  id,
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
              expertUserId: appt.experts?.user_id,
              expertName: appt.experts?.profiles?.full_name || 'Expert',
              expertAvatar: appt.experts?.profiles?.profile_image_path || '/profile-placeholder.png',
              topic: appt.issue_description || '',
              date: appt.meeting_date,
              time: appt.meeting_time,
              endsMs: slotEndMs(appt),
              meetingLink: meetingLinkOf(appt),
              agreedFeePaise: agreedFeeOf(appt),
              status: 'upcoming'
            })));
          }
        }
      }

      // 3. Fetch past bookings for history
      const { data: farmerProfileForHist } = await supabase
        .from('farmer_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (farmerProfileForHist) {
        const { data: histData } = await supabase
          .from('consultation_bookings')
          .select(`
            *,
            demo_payments ( amount_paise, status ),
            experts:expert_id (
              id,
              user_id,
              profiles:user_id (
                full_name,
                profile_image_path
              )
            )
          `)
          .eq('farmer_id', farmerProfileForHist.id)
          .neq('status', 'Booked')
          .order('meeting_date', { ascending: false })
          .order('meeting_time', { ascending: false }); // newest first, also within one day

        const { data: reviewsData } = await supabase
          .from('reviews')
          .select('booking_id');
        const reviewedBookingIds = new Set(reviewsData?.map(r => r.booking_id) || []);

        if (histData) {
          const seen = new Set();
          const dedupedHistory = histData.filter(h => {
            if (seen.has(h.id)) return false;
            seen.add(h.id);
            return true;
          }).map(h => ({
            id: h.id,
            expertId: h.experts?.id,
            expertUserId: h.experts?.user_id,
            expertName: h.experts?.profiles?.full_name || 'Expert',
            expertAvatar: h.experts?.profiles?.profile_image_path || '/profile-placeholder.png',
            topic: h.issue_description || '',
            date: h.meeting_date,
            duration: '30 mins',
            status: h.status,
            completionSource: h.completion_source,
            agreedFeePaise: agreedFeeOf(h),
            cancellationReason: h.cancellation_reason,
            reviewed: reviewedBookingIds.has(h.id)
          }));
          setHistory(dedupedHistory);
        }
      }

      // 4. Fetch reviews
      const { data: revsData } = await supabase
        .from('reviews')
        .select(`
          id,
          rating,
          comment,
          reviewer_id,
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
          authorId: r.reviewer_id,
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

  // Opened from a push notification: show that booking if it is still upcoming for this user (the list is loaded
  // with the user's own permissions, so another person's booking id finds nothing).
  useEffect(() => {
    if (!focusBookingId) return;
    const upcoming = appointments.find((a) => a.id === focusBookingId);
    if (upcoming) {
      setActiveSubTab('upcoming');
      setSelectedMeetingDetail(upcoming);
      if (clearFocusBooking) clearFocusBooking();
      return;
    }
    const past = history.find((h) => h.id === focusBookingId);
    if (past) {
      setActiveSubTab('history');
      if (onShowToast) onShowToast(`This consultation is ${past.status === 'Cancelled' ? 'cancelled' : 'finished'}.`);
      if (clearFocusBooking) clearFocusBooking();
    }
  }, [focusBookingId, appointments, history]);

  // ...and if it is in neither list after loading (deleted, or not this user's), say so instead of waiting.
  useEffect(() => {
    if (!focusBookingId) return undefined;
    const t = setTimeout(() => {
      if (onShowToast) onShowToast('This consultation is no longer available.');
      if (clearFocusBooking) clearFocusBooking();
    }, 8000);
    return () => clearTimeout(t);
  }, [focusBookingId]);

  // Measure the server clock once per load (one call, not one per booking).
  useEffect(() => {
    if (appointments.length === 0) return;
    supabase.rpc('consultation_join_status', { p_booking_id: appointments[0].id }).then(({ data }) => {
      if (data?.server_now) setClockOffsetMs(Date.parse(data.server_now) - Date.now());
    });
  }, [appointments]);

  const handleBookClick = async (expert, targetDate = null) => {
    setSelectedExpert(expert);
    setSelectedSlot(null);
    setBookingDate(targetDate || '');
    setBookingTime('');

    const { data: slots } = await supabase
      .from('consultation_slots')
      .select('*')
      .eq('expert_id', expert.id)
      .order('slot_date', { ascending: true })
      .order('start_time', { ascending: true });

    const allSlots = (slots || []).filter(isBookableSlot);
    if (targetDate) {
      setAvailableSlots(allSlots.filter(s => s.slot_date === targetDate));
    } else {
      setAvailableSlots(allSlots);
    }
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
    const currentSlots = timesByDay[dayStr] || [];
    if (currentSlots.some(s => (typeof s === 'string' ? s : s.time) === timeToAdd)) {
      if (onShowToast) onShowToast(`⚠️ ${formatTime12h(timeToAdd)} is already added for ${dayStr}`);
      return;
    }
    const updated = [...currentSlots, { time: timeToAdd }].sort((a, b) => {
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
          const endTimeStr = addOneHour(timeStr);
          slotsToInsert.push({
            expert_id: currentExpertId,
            slot_date: formatDateYYYYMMDD(date),
            start_time: timeStr,
            end_time: endTimeStr,   // no price per slot: the fee is the expert's consultation fee (migration 15)
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

    if (!selectedSlot) {
      alert('Please select an available time slot.');
      return;
    }

    // Pay & Book opens the checkout (a SIMULATED payment — no provider, no money moves; never labelled as such in the UI).
    // The booking is created only when confirm_demo_payment() succeeds on the server.
    setCheckout({ slotId: selectedSlot.id, issue: bookingIssue.trim() });
  };

  const handleCheckoutClose = (result) => {
    const expert = selectedExpert;
    setCheckout(null);
    if (result?.booked) {
      setSelectedExpert(null);
      setSelectedSlot(null);
      setBookingDate('');
      setBookingTime('');
      setBookingIssue('');
      if (onShowToast) onShowToast(`📅 Booked with ${expert?.name || 'the expert'}.`);
      fetchData();
      setActiveSubTab('upcoming');
      return;
    }
    if (result?.cancelled) {
      if (onShowToast) onShowToast('Payment cancelled. Nothing was booked.');
      return;   // back to the booking dialog with the same choices
    }
    if (result?.reselect && expert) {
      setSelectedSlot(null);
      handleBookClick(expert);   // reload the expert's open slots
    }
  };

  const joinErrorText = (err) => {
    const msg = err?.message || '';
    if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'No connection. You have not joined the meeting — please check your internet and try again.';
    if (/not a participant/i.test(msg)) return 'This meeting belongs to someone else. You cannot join it.';
    if (/not added the Google Meet link/i.test(msg)) return 'The expert has not added the Google Meet link yet. You will be notified when it is ready.';
    return msg || 'Could not join the meeting. Please try again.';
  };

  // Only the booking's expert can mark it completed, after the start and once a Meet link was saved (server rule, 14).
  // AgroConnect cannot see whether the Google Meet call happened; the expert confirms it.
  const handleCompleteConsultation = async (meeting) => {
    if (completingId) return;
    setCompletingId(meeting.id);
    const { error } = await supabase.rpc('complete_consultation', { p_booking_id: meeting.id });
    setCompletingId(null);
    if (error) {
      if (onShowToast) onShowToast(/before its scheduled start/.test(error.message)
        ? 'You can mark the consultation completed after its scheduled start.' : error.message);
      return;
    }
    setSelectedMeetingDetail(null);
    fetchData();
    if (onShowToast) onShowToast('Consultation marked completed. The farmer has been asked for a review.');
  };

  const handleSaveMeetingLink = async () => {
    if (!linkEditor || linkEditor.saving) return;
    const normalized = normalizeMeetLink(linkEditor.value);
    if (!normalized) {
      setLinkEditor({ ...linkEditor, error: `Paste a Google Meet link like ${MEET_LINK_HINT}`, saved: null });
      return;
    }
    setLinkEditor({ ...linkEditor, saving: true, error: null, saved: null });
    const { data, error } = await supabase.rpc('set_meeting_link', { p_booking_id: linkEditor.appt.id, p_link: normalized });
    if (error) {
      const msg = /Failed to fetch|NetworkError|network/i.test(error.message || '')
        ? 'No connection. The link was not saved — please try again.' : (error.message || 'The link could not be saved.');
      setLinkEditor((le) => le && { ...le, saving: false, error: msg });
      return;
    }
    setLinkEditor((le) => le && { ...le, saving: false, value: data.meeting_link,
      saved: data.changed ? 'Meeting link saved. The farmer has been notified.' : 'This link is already saved.' });
    setSelectedMeetingDetail((d) => (d && d.id === linkEditor.appt.id ? { ...d, meetingLink: data.meeting_link } : d));
    fetchData();
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

  const handleAddOfferedSlot = () => {
    if (!offerDateInput || !offerTimeInput) {
      if (onShowToast) onShowToast('⚠️ Please select both date and time for reschedule option');
      return;
    }
    if (offeredSlots.some(s => s.date === offerDateInput && s.time === offerTimeInput)) {
      if (onShowToast) onShowToast('⚠️ This date/time option is already added');
      return;
    }
    setOfferedSlots([...offeredSlots, { date: offerDateInput, time: offerTimeInput }]);
  };

  const handleRemoveOfferedSlot = (index) => {
    setOfferedSlots(offeredSlots.filter((_, idx) => idx !== index));
  };

  // Join: join_consultation() re-checks participant, ban, status and the join window on the database clock, records
  // that this person opened the meeting from AgroConnect (not proof that the call happened) and returns the saved
  // Google Meet link, which is then opened outside the app. The consultation itself takes place in Google Meet.
  const handleServerValidatedJoin = async (meeting) => {
    if (joiningId) return;
    const preparedWindow = prepareMeetWindow();   // web: must happen during the tap
    setJoiningId(meeting.id);
    try {
      const { data, error } = await supabase.rpc('join_consultation', { p_booking_id: meeting.id });
      if (error) {
        preparedWindow?.close();
        alert(joinErrorText(error));
        fetchData();
        return;
      }
      if (data?.server_now) setClockOffsetMs(Date.parse(data.server_now) - Date.now());
      const opened = await openMeetingLink(data?.meeting_link, preparedWindow);
      if (!opened.ok) { alert(opened.error); return; }
      if (onShowToast) onShowToast('Opening Google Meet… The consultation takes place in Google Meet.');
    } catch (err) {
      preparedWindow?.close();
      alert(joinErrorText(err));
    } finally {
      setJoiningId(null);
    }
  };

  const handleConfirmCancelMeeting = async () => {
    if (!isCurrentExpert) {
      return handleFarmerConfirmCancelMeeting();
    }
    if (!cancelReason.trim()) {
      alert("Please provide a mandatory cancellation reason.");
      return;
    }
    if (offeredSlots.length === 0) {
      alert("Please offer at least 1 alternative date/time slot.");
      return;
    }
    if (!selectedMeetingDetail) return;

    setCancellingMeeting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const appt = selectedMeetingDetail;

      // Server updates the booking, frees the slot and notifies the farmer.
      const { error: updateErr } = await supabase.rpc('cancel_consultation_booking', {
        p_booking_id: appt.id,
        p_reason: cancelReason.trim(),
        p_offered_slots: offeredSlots
      });

      if (updateErr) throw updateErr;

      const farmerUserId = appt.farmerUserId;
      if (user && farmerUserId) {
        let { data: conv } = await supabase
          .from('conversations')
          .select('id')
          .or(`and(user_one.eq.${user.id},user_two.eq.${farmerUserId}),and(user_one.eq.${farmerUserId},user_two.eq.${user.id})`)
          .maybeSingle();

        if (!conv) {
          const { data: newConv } = await supabase
            .from('conversations')
            .insert({ user_one: user.id, user_two: farmerUserId })
            .select('id')
            .single();
          conv = newConv;
        }

        if (conv) {
          await supabase
            .from('messages')
            .insert({
              conversation_id: conv.id,
              sender_id: user.id,
              content: `Meeting Cancelled: ${cancelReason.trim()}`,
              message_type: 'cancellation_reschedule',
              metadata: {
                booking_id: appt.id,
                expert_id: currentExpertId,
                expert_name: currentExpertProfile?.name || 'Expert',
                cancellation_reason: cancelReason.trim(),
                offered_slots: offeredSlots
              }
            });

          await supabase
            .from('conversations')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', conv.id);
        }
      }

      if (onShowToast) {
        onShowToast("📅 Meeting cancelled & reschedule options sent via Chat!");
      }

      setIsCancelSheetOpen(false);
      setSelectedMeetingDetail(null);
      setCancelReason('');
      setOfferedSlots([]);
      fetchData();

    } catch (err) {
      alert(`Cancellation failed: ${err.message}`);
    } finally {
      setCancellingMeeting(false);
    }
  };

  const handleFarmerConfirmCancelMeeting = async () => {
    if (!cancelReason.trim()) {
      alert("Please provide a mandatory cancellation reason.");
      return;
    }
    if (!selectedMeetingDetail) return;

    setCancellingMeeting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const appt = selectedMeetingDetail;

      // Server computes the refund, frees the slot and notifies the expert and admins.
      const { data: refundAmount, error: updateErr } = await supabase.rpc('cancel_consultation_booking', {
        p_booking_id: appt.id,
        p_reason: cancelReason.trim()
      });

      if (updateErr) throw updateErr;

      const expertUserId = appt.expertUserId;
      if (user && expertUserId) {
        let { data: conv } = await supabase
          .from('conversations')
          .select('id')
          .or(`and(user_one.eq.${user.id},user_two.eq.${expertUserId}),and(user_one.eq.${expertUserId},user_two.eq.${user.id})`)
          .maybeSingle();

        if (!conv) {
          const { data: newConv } = await supabase
            .from('conversations')
            .insert({ user_one: user.id, user_two: expertUserId })
            .select('id')
            .single();
          conv = newConv;
        }

        if (conv) {
          await supabase
            .from('messages')
            .insert({
              conversation_id: conv.id,
              sender_id: user.id,
              content: `Meeting Cancelled: ${cancelReason.trim()}`,
              message_type: 'cancellation_reschedule',
              metadata: {
                booking_id: appt.id,
                cancellation_reason: cancelReason.trim()
              }
            });

          await supabase
            .from('conversations')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', conv.id);
        }
      }

      if (onShowToast) {
        onShowToast(`📅 Meeting cancelled. Refund of ₹${refundAmount} requested.`);
      }

      setIsCancelSheetOpen(false);
      setSelectedMeetingDetail(null);
      setCancelReason('');
      fetchData();

    } catch (err) {
      alert(`Cancellation failed: ${err.message}`);
    } finally {
      setCancellingMeeting(false);
    }
  };

  const handleSaveExpertProfileEdit = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !currentExpertId) return;

    try {
      await supabase
        .from('profiles')
        .update({ bio: expertEditBio.trim() })
        .eq('id', user.id);

      await supabase
        .from('experts')
        .update({ specialization: expertEditSpecialization.trim() })
        .eq('id', currentExpertId);

      setCurrentExpertProfile(prev => ({
        ...prev,
        bio: expertEditBio.trim(),
        specialization: expertEditSpecialization.trim()
      }));

      setIsExpertProfileEditOpen(false);
      if (onShowToast) onShowToast("Expert profile updated!");
      fetchData();
    } catch (err) {
      alert(`Update failed: ${err.message}`);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Header 
        title={isCurrentExpert ? "Expert Catch Up" : "Catch Up"} 
        onPeaAIClick={onPeaAIClick}
        leftAction={isCurrentExpert ? (
          <button 
            type="button"
            onClick={() => setIsMenuSheetOpen(true)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
            aria-label="Expert Menu"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>menu</span>
          </button>
        ) : null}
      />
      
      {/* Sub tabs nav */}
      <div style={{ 
        display: 'flex', 
        overflowX: 'auto', 
        gap: '6px', 
        padding: '12px 16px', 
        marginTop: 'calc(var(--header-height) + var(--safe-top))', 
        borderBottom: '1px solid var(--border-color)', 
        // solid, not backdrop blur: a blurred bar over a long scrolling list made Android WebView stop responding
        backgroundColor: 'rgb(18, 18, 18)',
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
        {!isCurrentExpert && (
          <button 
            onClick={() => setActiveSubTab('history')}
            className={`chip ${activeSubTab === 'history' ? 'active' : ''}`}
            style={{ flexShrink: 0, fontSize: '12px' }}
          >
            History
          </button>
        )}
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
            {expertRecordMissing && (
              <div className="card" style={{ border: '1px solid #FFA726', color: '#FFA726', fontSize: '13px', lineHeight: '1.5' }}>
                Your account is marked as an expert, but your expert record is not set up yet, so expert tools cannot be
                shown. Please contact the AgroConnect admin.
              </div>
            )}
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '4px' }}>Available Verified Experts</h3>
            {expertsList.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 12px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                No expert has open dates right now. Please check again later.
              </div>
            )}
            
            {expertsList.map((exp) => {
              const expertSlots = allExpertSlotsMap[exp.id] || [];

              return (
                <div 
                  key={exp.id} 
                  className="card fade-in" 
                  style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
                >
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <img
                      src={exp.avatar}
                      alt={exp.name}
                      onClick={() => onProfileClick && onProfileClick(exp.userId)}
                      style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => onProfileClick && onProfileClick(exp.userId)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontWeight: '600', fontSize: '15px' }}>{exp.name}</span>
                        <span className="material-symbols-outlined" style={{ color: 'var(--primary-green)', fontSize: '16px' }}>verified</span>
                      </div>
                      <span className="badge-role" style={{ display: 'inline-block', marginTop: '2px' }}>{exp.role}</span>
                      {exp.feePaise > 0 && (
                        <div data-testid="expert-fee" style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          Consultation fee <strong style={{ color: 'var(--primary-green)' }}>{formatInr(exp.feePaise)}</strong>
                        </div>
                      )}
                    </div>
                  </div>

                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                    {exp.bio || 'Verified agricultural expert specialized in seed selection, crop diagnostics, and soil management.'}
                  </p>

                  {(() => {
                    const dates = [...new Set(expertSlots.filter(isBookableSlot).map(s => s.slot_date))].sort();
                    return (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Available:</span>
                        {dates.slice(0, 4).map(d => (
                          <span key={d} style={{ fontSize: '11px', fontWeight: '600', color: 'var(--primary-green)', border: '1px solid rgba(136, 217, 130, 0.4)', borderRadius: '10px', padding: '2px 8px' }}>
                            {new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                          </span>
                        ))}
                        {dates.length > 4 && <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>+{dates.length - 4} more</span>}
                      </div>
                    );
                  })()}

                  <div style={{ display: 'flex', gap: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '10px', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#FFA726' }}>star</span>
                      <strong>{exp.rating}</strong> ({exp.reviewCount} reviews)
                    </div>
                    
                    {expandedExpertId !== exp.id && (
                      <Button 
                        onClick={() => {
                          // jump to the first month with an open slot, so the calendar never opens empty
                          const first = expertSlots.filter(isBookableSlot).map(s => s.slot_date).sort()[0];
                          if (first) {
                            setCalYear(Number(first.slice(0, 4)));
                            setCalMonth(Number(first.slice(5, 7)) - 1);
                          }
                          setExpandedExpertId(exp.id);
                        }} 
                        variant="primary" 
                        style={{ padding: '8px 16px', borderRadius: '12px', fontSize: '12px' }}
                      >
                        Book Consultation
                      </Button>
                    )}
                  </div>

                  {/* Calendar Grid Date Picker matching user_catchup page.png */}
                  {expandedExpertId === exp.id && (
                    <div className="fade-in" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px', marginTop: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="material-symbols-outlined" style={{ color: 'var(--primary-green)', fontSize: '18px' }}>calendar_month</span>
                          <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>Select a Date</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setExpandedExpertId(null)}
                          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '2px' }}
                        >
                          <span>Close</span>
                          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
                        </button>
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
                          const unbookedOnDate = dateSlots.filter(isBookableSlot);
                          const hasAvailableSlots = unbookedOnDate.length > 0;

                          return (
                            <div
                              key={cell.dateStr}
                              onClick={() => {
                                if (hasAvailableSlots) {
                                  handleBookClick(exp, cell.dateStr);
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
                                {hasAvailableSlots ? `${unbookedOnDate.length} open` : '--'}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '12px' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>info</span>
                        <span>Tap a highlighted date to see that day's times.</span>
                      </div>
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}

        {/* ================= EXPERT MANAGE AVAILABILITY ================= */}
        {activeSubTab === 'availability' && isCurrentExpert && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '32px' }}>
            <ConsultationFeeEditor feePaise={myFeePaise} onSaved={(paise) => { setMyFeePaise(paise); fetchData(); }} onShowToast={onShowToast} />
            
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
                                <InlineTimePicker
                                  value={slotPickerTime[d.short] || '09:00'}
                                  onChange={(val) => setSlotPickerTime({ ...slotPickerTime, [d.short]: val })}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              {isCurrentExpert ? 'Expert Catch Up — Scheduled Meetings' : 'Upcoming Appointments'}
            </h3>

            {/* Zero availability prompt for Expert */}
            {isCurrentExpert && mySlots.length === 0 && (
              <div className="card fade-in" style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                padding: '24px 16px',
                gap: '12px',
                backgroundColor: 'rgba(136, 217, 130, 0.08)',
                border: '1.5px dashed var(--primary-green)',
                borderRadius: '16px'
              }}>
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(136, 217, 130, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--primary-green)'
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '32px' }}>event_available</span>
                </div>
                <div>
                  <h4 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>Mark your availability</h4>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', maxWidth: '320px', lineHeight: '1.4' }}>
                    You haven't set up any consultation slots yet. Set your available days and times so farmers can book meetings with you.
                  </p>
                </div>
                <Button
                  onClick={() => setActiveSubTab('availability')}
                  variant="primary"
                  icon="edit_calendar"
                  style={{ padding: '10px 20px', borderRadius: '12px', fontSize: '13px' }}
                >
                  Set Up Availability
                </Button>
              </div>
            )}

            {isCurrentExpert ? (
              /* Expert Meeting Cards grouped by Date, then ordered by Time */
              (() => {
                const grouped = groupMeetingsByDate(appointments);
                const dateKeys = Object.keys(grouped);

                if (dateKeys.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-secondary)' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '48px', color: 'var(--border-color)', display: 'block', marginBottom: '12px' }}>event_busy</span>
                      <p style={{ fontSize: '14px', fontWeight: '600' }}>No scheduled meetings</p>
                      <p style={{ fontSize: '12px', marginTop: '4px', marginBottom: '16px' }}>Upcoming consultations with farmers will appear here.</p>
                      <Button
                        onClick={() => setActiveSubTab('availability')}
                        variant="primary"
                        icon="edit_calendar"
                        style={{ padding: '10px 20px', borderRadius: '12px', fontSize: '13px', margin: '0 auto' }}
                      >
                        Set Your Availability
                      </Button>
                    </div>
                  );
                }

                return dateKeys.map(dateStr => (
                  <div key={dateStr} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                      <span className="material-symbols-outlined" style={{ color: 'var(--primary-green)', fontSize: '18px' }}>calendar_month</span>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>{dateStr}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>({grouped[dateStr].length} meeting{grouped[dateStr].length === 1 ? '' : 's'})</span>
                    </div>

                    {grouped[dateStr].map(appt => (
                      <div
                        key={appt.id}
                        className="card fade-in"
                        onClick={() => setSelectedMeetingDetail(appt)}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                          cursor: 'pointer',
                          border: '1px solid var(--border-color)',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <img src={appt.farmerAvatar} alt={appt.farmerName} onClick={(e) => { if (onProfileClick && appt.farmerUserId) { e.stopPropagation(); onProfileClick(appt.farmerUserId); } }} style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover', border: '1.5px solid var(--primary-green)', cursor: 'pointer' }} />
                            <div>
                              <div style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)' }}>{appt.farmerName}</div>
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Farmer Consultation</div>
                            </div>
                          </div>

                          <div style={{ backgroundColor: 'rgba(136, 217, 130, 0.12)', color: 'var(--primary-green)', padding: '4px 10px', borderRadius: '10px', fontSize: '12px', fontWeight: '700' }}>
                            {formatTime12h(appt.time)}
                          </div>
                        </div>

                        {appt.topic && (
                          <div style={{ backgroundColor: '#252525', padding: '10px 12px', borderRadius: '10px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                            <strong style={{ color: 'var(--text-primary)' }}>Issue:</strong> {appt.topic}
                          </div>
                        )}

                        <MeetLinkStatus link={appt.meetingLink} expert />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '8px', fontSize: '12px', color: 'var(--primary-green)' }}>
                          <span>{appt.meetingLink ? 'Tap to update the link, join or complete' : 'Tap to add the Google Meet link'}</span>
                          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>chevron_right</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ));
              })()
            ) : (
              /* Farmer view of upcoming appointments */
              appointments.map((appt) => {
                return (
                  <div
                    key={appt.id}
                    className="card fade-in"
                    onClick={() => setSelectedMeetingDetail(appt)}
                    style={{ display: 'flex', flexDirection: 'column', gap: '14px', cursor: 'pointer', border: '1px solid var(--border-color)' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <img src={appt.expertAvatar} alt="" onClick={(e) => { if (onProfileClick && appt.expertUserId) { e.stopPropagation(); onProfileClick(appt.expertUserId); } }} style={{ width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer' }} />
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
                    {appt.agreedFeePaise != null && (
                      <div data-testid="agreed-fee" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        Consultation fee <strong style={{ color: 'var(--text-primary)' }}>{formatInr(appt.agreedFeePaise)}</strong>
                      </div>
                    )}

                    <MeetLinkStatus link={appt.meetingLink} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', color: 'var(--primary-green)' }}>Tap for details & cancellation</span>
                      <JoinMeetingButton
                        meeting={appt}
                        clockOffsetMs={clockOffsetMs}
                        busy={joiningId === appt.id}
                        onJoin={handleServerValidatedJoin}
                        waitingText={appt.meetingLink ? undefined : 'Waiting for link'}
                        style={{ padding: '8px 16px', borderRadius: '12px', fontSize: '12px' }}
                      />
                    </div>
                  </div>
                );
              })
            )}

            {!isCurrentExpert && appointments.length === 0 && (
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
            
            {history.slice(0, historyShown).map((hist) => (
              <div key={hist.id} className="card fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <img src={hist.expertAvatar} alt="" onClick={() => onProfileClick && hist.expertUserId && onProfileClick(hist.expertUserId)} style={{ width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer' }} />
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '13px' }}>{hist.expertName}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{hist.date}</div>
                    </div>
                  </div>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: '700',
                    color: hist.status === 'Cancelled' ? 'var(--error)' : 'var(--text-secondary)'
                  }}>
                    {hist.status === 'Cancelled' ? 'Cancelled'
                      : hist.completionSource === 'slot_ended' ? 'Closed after scheduled time' : `Completed (${hist.duration})`}
                  </span>
                </div>

                <p style={{ fontSize: '12px', color: '#dddddd' }}><strong>Consultation:</strong> {hist.topic}</p>
                {hist.agreedFeePaise != null && (
                  <p data-testid="history-fee" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Consultation fee <strong style={{ color: 'var(--text-primary)' }}>{formatInr(hist.agreedFeePaise)}</strong>
                  </p>
                )}
                {hist.status === 'Cancelled' && hist.cancellationReason && (
                  <p style={{ fontSize: '11px', color: 'var(--error)', backgroundColor: 'rgba(255, 90, 90, 0.1)', padding: '6px 10px', borderRadius: '8px' }}>
                    <strong>Reason:</strong> {hist.cancellationReason}
                  </p>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                  <span style={{ fontSize: '11px', color: hist.status === 'Cancelled' ? 'var(--text-muted)' : 'var(--primary-green)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                      {hist.status === 'Cancelled' ? 'cancel' : 'check_circle'}
                    </span>
                    {hist.status === 'Cancelled' ? 'Session Cancelled'
                      : hist.completionSource === 'slot_ended' ? 'Not confirmed by the expert' : 'Session Verified'}
                  </span>
                  
                  {hist.status !== 'Cancelled' && !hist.reviewed ? (
                    <Button 
                      onClick={() => handleOpenReviewDialog(hist)}
                      variant="secondary" 
                      style={{ padding: '6px 12px', borderRadius: '10px', fontSize: '11px' }}
                    >
                      Leave Review
                    </Button>
                  ) : (
                    hist.status !== 'Cancelled' && <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Review Submitted</span>
                  )}
                </div>
              </div>
            ))}
            {history.length > historyShown && (
              <Button
                variant="secondary"
                onClick={() => setHistoryShown((n) => n + 15)}
                style={{ alignSelf: 'center', padding: '8px 18px', borderRadius: '12px', fontSize: '12px' }}
              >
                Show older ({history.length - historyShown} more)
              </Button>
            )}
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
                    <img src={rev.authorAvatar} alt="" onClick={() => onProfileClick && rev.authorId && onProfileClick(rev.authorId)} style={{ width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer' }} />
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
        isOpen={!!selectedExpert && !checkout}
        title="Book Consultation Session"
        confirmText="Pay & Book"
        onConfirm={handleConfirmBooking}
        onCancel={() => setSelectedExpert(null)}
      >
        {selectedExpert && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '12px 0' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '8px' }}>
              <img src={selectedExpert.avatar} alt="" onClick={() => { const id = selectedExpert.userId; setSelectedExpert(null); if (onProfileClick && id) onProfileClick(id); }} style={{ width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer' }} />
              <div>
                <div style={{ fontWeight: '600', fontSize: '14px' }}>{selectedExpert.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  {bookingDate
                    ? `Date: ${new Date(`${bookingDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}`
                    : 'Pick a date in the calendar'}
                  {selectedSlot ? ` · ${formatTime12h(selectedSlot.start_time)}` : ''}
                </div>
              </div>
            </div>

            {availableSlots.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label className="form-label">Choose a time *</label>
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
                        {formatTime12h(slot.start_time)} - {formatTime12h(slot.end_time)}
                      </div>
                      {slot.is_booked && (
                        <span style={{ fontSize: '9px', color: 'var(--error)', fontWeight: 'bold' }}>Booked (Unavailable)</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--text-secondary)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '36px', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>event_busy</span>
                <p style={{ fontSize: '13px', fontWeight: '600' }}>No available time slots published</p>
                <p style={{ fontSize: '11px', marginTop: '4px', color: 'var(--text-muted)' }}>This expert has not published any open slots for booking yet. Please check back later.</p>
              </div>
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

      {/* Expert Identity Top-Left Menu Bottom Sheet */}
      <ExpertMenuSheet
        isOpen={isMenuSheetOpen}
        onClose={() => setIsMenuSheetOpen(false)}
        expertProfile={currentExpertProfile}
        onCustomizeAvailability={() => setActiveSubTab('availability')}
        onMeetingHistory={() => setActiveSubTab('history')}
        onExpertProfile={() => setIsExpertProfileEditOpen(true)}
        onLeaveExpertMode={() => setIsLeaveModalOpen(true)}
      />

      {/* ── Meeting Detail Bottom Sheet ─────────────────────────── */}
      <BottomSheet isOpen={!!selectedMeetingDetail} onClose={() => setSelectedMeetingDetail(null)}>
        {selectedMeetingDetail && (() => {
          const otherName = isCurrentExpert ? selectedMeetingDetail.farmerName : selectedMeetingDetail.expertName;
          const otherAvatar = isCurrentExpert ? selectedMeetingDetail.farmerAvatar : selectedMeetingDetail.expertAvatar;
          
          const timeClean = selectedMeetingDetail.time.length === 5 ? `${selectedMeetingDetail.time}:00` : selectedMeetingDetail.time;
          const startMs = new Date(`${selectedMeetingDetail.date}T${timeClean}`).getTime();
          const hoursUntilStart = (startMs - Date.now()) / 3600000;
          const isCancelledBlocked = hoursUntilStart < 14;

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
                <img
                  src={otherAvatar || '/profile-placeholder.png'}
                  alt={otherName}
                  style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', border: '1.5px solid var(--primary-green)' }}
                />
                <div>
                  <h4 style={{ fontSize: '16px', fontWeight: '700' }}>{otherName}</h4>
                  <div style={{ fontSize: '12px', color: 'var(--primary-green)', fontWeight: '600' }}>
                    {selectedMeetingDetail.date} • {formatTime12h(selectedMeetingDetail.time)}
                  </div>
                </div>
              </div>

              <div style={{ backgroundColor: '#1E1E1E', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600' }}>
                  Consultation Issue Description
                </label>
                <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: '1.4' }}>
                  {selectedMeetingDetail.topic || 'No description provided.'}
                </p>
              </div>

              <div style={{ backgroundColor: '#1E1E1E', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <MeetLinkStatus link={selectedMeetingDetail.meetingLink} expert={isCurrentExpert} />
                {isCurrentExpert && selectedMeetingDetail.meetingLink && (
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{selectedMeetingDetail.meetingLink}</div>
                )}
                {isCurrentExpert && (
                  <Button
                    onClick={() => setLinkEditor({ appt: selectedMeetingDetail, value: selectedMeetingDetail.meetingLink || '', saving: false, error: null, saved: null })}
                    variant="secondary"
                    icon={selectedMeetingDetail.meetingLink ? 'edit' : 'add_link'}
                    style={{ borderRadius: '12px', fontSize: '13px' }}
                  >
                    {selectedMeetingDetail.meetingLink ? 'Update Meeting Link' : 'Add Google Meet Link'}
                  </Button>
                )}
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  {isCurrentExpert
                    ? 'Create the meeting in Google Meet, copy its link and paste it here. Without a link the booking is cancelled 5 minutes after the start.'
                    : 'The consultation takes place in Google Meet. Join opens the link 5 minutes before the start.'}
                </div>
              </div>

              {isCancelledBlocked && (
                <div style={{ fontSize: '11px', color: '#FFA726', backgroundColor: 'rgba(255, 167, 38, 0.1)', padding: '8px 12px', borderRadius: '10px' }}>
                  ⚠️ Cancellation is only available up to 14 hours before the session.
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                {!isCancelledBlocked && (
                  <Button
                    onClick={() => setIsCancelSheetOpen(true)}
                    variant="secondary"
                    style={{ flex: 1, borderColor: 'var(--error)', color: 'var(--error)', borderRadius: '12px', fontSize: '13px' }}
                  >
                    Cancel Meeting
                  </Button>
                )}

                <JoinMeetingButton
                  meeting={selectedMeetingDetail}
                  clockOffsetMs={clockOffsetMs}
                  busy={joiningId === selectedMeetingDetail.id}
                  onJoin={handleServerValidatedJoin}
                  waitingText={selectedMeetingDetail.meetingLink ? undefined : (isCurrentExpert ? 'Add the link first' : 'Waiting for link')}
                  icon="videocam"
                  style={{ flex: 1, borderRadius: '12px', fontSize: '13px' }}
                />
              </div>

              {isCurrentExpert && Date.now() + clockOffsetMs >= meetingStartMs(selectedMeetingDetail.date, selectedMeetingDetail.time) && (
                <Button
                  onClick={() => handleCompleteConsultation(selectedMeetingDetail)}
                  variant="primary"
                  icon="task_alt"
                  disabled={completingId === selectedMeetingDetail.id || !selectedMeetingDetail.meetingLink}
                  style={{ borderRadius: '12px', fontSize: '13px' }}
                >
                  {completingId === selectedMeetingDetail.id ? 'Saving…' : 'Mark consultation completed'}
                </Button>
              )}
              {!isCurrentExpert && selectedMeetingDetail.endsMs && Date.now() + clockOffsetMs >= selectedMeetingDetail.endsMs && (
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  The scheduled time is over. The expert marks the consultation completed; then you can rate it in History.
                </div>
              )}
            </div>
          );
        })()}
      </BottomSheet>

      {/* ── Expert: add / update the Google Meet link ─────────── */}
      <BottomSheet isOpen={!!linkEditor} onClose={() => !linkEditor?.saving && setLinkEditor(null)}>
        {linkEditor && (
          <form
            onSubmit={(e) => { e.preventDefault(); handleSaveMeetingLink(); }}
            style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
          >
            <h3 style={{ fontSize: '16px', fontWeight: '700' }}>
              {linkEditor.appt.meetingLink ? 'Update Meeting Link' : 'Add Google Meet Link'}
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              Open Google Meet, create a meeting for {linkEditor.appt.farmerName} on {linkEditor.appt.date} at {formatTime12h(linkEditor.appt.time)},
              copy the meeting link and paste it below. Only you and this farmer can see it.
            </p>
            <label className="form-label" htmlFor="meet-link-input">Google Meet link</label>
            <div className="input-container" style={{ padding: '8px 16px' }}>
              <input
                id="meet-link-input"
                className="input-field"
                type="url"
                inputMode="url"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder={MEET_LINK_HINT}
                value={linkEditor.value}
                onChange={(e) => setLinkEditor({ ...linkEditor, value: e.target.value, error: null, saved: null })}
                disabled={linkEditor.saving}
              />
            </div>
            {linkEditor.error && <div role="alert" style={{ fontSize: '12px', color: 'var(--error)' }}>{linkEditor.error}</div>}
            {linkEditor.saved && <div role="status" style={{ fontSize: '12px', color: 'var(--primary-green)' }}>{linkEditor.saved}</div>}
            <div style={{ display: 'flex', gap: '10px' }}>
              <Button type="button" variant="secondary" onClick={() => setLinkEditor(null)} disabled={linkEditor.saving} style={{ flex: 1, borderRadius: '12px' }}>
                {linkEditor.saved ? 'Done' : 'Cancel'}
              </Button>
              <Button type="submit" variant="primary" icon="save" disabled={linkEditor.saving || !linkEditor.value.trim()} style={{ flex: 1, borderRadius: '12px' }}>
                {linkEditor.saving ? 'Saving…' : 'Save link'}
              </Button>
            </div>
          </form>
        )}
      </BottomSheet>

      {checkout && <DemoCheckout slotId={checkout.slotId} issue={checkout.issue} onClose={handleCheckoutClose} />}

      {/* ── Cancellation & Reschedule Bottom Sheet ───────────── */}
      <BottomSheet isOpen={isCancelSheetOpen} onClose={() => setIsCancelSheetOpen(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--error)' }}>
            {isCurrentExpert ? 'Cancel Meeting & Offer Reschedule Options' : 'Cancel Meeting'}
          </h3>

          <div className="form-group">
            <label className="form-label">Mandatory Cancellation Reason *</label>
            <div className="input-container" style={{ padding: '8px 16px' }}>
              <textarea
                className="input-field"
                rows="3"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Explain why this meeting needs to be cancelled..."
                style={{ resize: 'none', height: '70px' }}
                required
              />
            </div>
          </div>

          {isCurrentExpert && (
            <div>
              <label className="form-label" style={{ marginBottom: '6px', display: 'block' }}>
                Offer Alternative Date & Time Options *
              </label>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setShowCancelCalendar(!showCancelCalendar)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: '#181818',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justify: 'space-between',
                      cursor: 'pointer'
                    }}
                  >
                    <span>{offerDateInput ? `Date: ${offerDateInput}` : 'Select Date'}</span>
                    <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--primary-green)' }}>calendar_month</span>
                  </button>

                  <InlineTimePicker
                    value={offerTimeInput}
                    onChange={(val) => setOfferTimeInput(val)}
                  />

                  <Button type="button" onClick={handleAddOfferedSlot} variant="secondary" style={{ padding: '8px 12px', fontSize: '11px' }}>
                    + Add
                  </Button>
                </div>

                {showCancelCalendar && (
                  <InlineCalendarPicker
                    year={cancelCalYear}
                    month={cancelCalMonth}
                    onPrevMonth={() => {
                      if (cancelCalMonth === 0) { setCancelCalMonth(11); setCancelCalYear(cancelCalYear - 1); }
                      else setCancelCalMonth(cancelCalMonth - 1);
                    }}
                    onNextMonth={() => {
                      if (cancelCalMonth === 11) { setCancelCalMonth(0); setCancelCalYear(cancelCalYear + 1); }
                      else setCancelCalMonth(cancelCalMonth + 1);
                    }}
                    onSelectDate={(dateStr) => {
                      setOfferDateInput(dateStr);
                      setShowCancelCalendar(false);
                    }}
                    selectedDate={offerDateInput}
                  />
                )}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {offeredSlots.map((slot, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(136, 217, 130, 0.12)', border: '1px solid var(--primary-green)', padding: '4px 8px', borderRadius: '8px', fontSize: '11px', color: 'var(--primary-green)' }}>
                    <span>{slot.date} @ {formatTime12h(slot.time)}</span>
                    <span onClick={() => handleRemoveOfferedSlot(idx)} style={{ cursor: 'pointer', fontWeight: 'bold' }}>✕</span>
                  </div>
                ))}
                {offeredSlots.length === 0 && (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>At least 1 alternative option required.</span>
                )}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
            <Button variant="secondary" onClick={() => setIsCancelSheetOpen(false)} style={{ flex: 1 }}>
              Back
            </Button>
            <Button
              type="button"
              onClick={handleConfirmCancelMeeting}
              variant="primary"
              disabled={cancellingMeeting || !cancelReason.trim() || (isCurrentExpert && offeredSlots.length === 0)}
              style={{ flex: 1, backgroundColor: 'var(--error)', color: 'white' }}
            >
              {cancellingMeeting ? 'Cancelling...' : 'Confirm Cancellation'}
            </Button>
          </div>
        </div>
      </BottomSheet>

      {/* ── Leave expert mode: request goes to the admin ───────── */}
      <LeaveExpertDialog
        isOpen={isLeaveModalOpen}
        onClose={() => setIsLeaveModalOpen(false)}
        onShowToast={onShowToast}
      />

      {/* ── Expert Profile Edit Dialog ───────────────────────────── */}
      <Dialog
        isOpen={isExpertProfileEditOpen}
        title="Edit Expert Profile"
        confirmText="Save Profile"
        onConfirm={handleSaveExpertProfileEdit}
        onCancel={() => setIsExpertProfileEditOpen(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', margin: '12px 0' }}>
          <InputField
            label="Specialization"
            value={expertEditSpecialization}
            onChange={(e) => setExpertEditSpecialization(e.target.value)}
            placeholder="e.g. Soil Pathology & Rice Crop Health"
            icon="badge"
          />

          <div className="form-group">
            <label className="form-label">Bio / Tagline</label>
            <div className="input-container" style={{ padding: '8px 16px' }}>
              <textarea
                className="input-field"
                rows="3"
                value={expertEditBio}
                onChange={(e) => setExpertEditBio(e.target.value)}
                placeholder="Brief description of your expertise..."
                style={{ resize: 'none', height: '70px' }}
              />
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
