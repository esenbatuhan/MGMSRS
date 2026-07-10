'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { TURKISH_DAYS, TURKISH_MONTHS, formatDate, getActiveWeekMonday, isWeekTransitionPreview, isBookingEnabled, getTimeUntilBookingOpen, getWeekDaysFromMonday, formatSlotTimeRange, formatSlotStartHour } from '@/utils/constants';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';

const BookingModal = dynamic(() => import('@/components/BookingModal'), { ssr: false });
const ProfileModal = dynamic(() => import('@/components/ProfileModal'), { ssr: false });
const MyAppointmentsModal = dynamic(() => import('@/components/MyAppointmentsModal'), { ssr: false });
const EditAppointmentModal = dynamic(() => import('@/components/EditAppointmentModal'), { ssr: false });
import { ThemeToggle } from '@/components/ThemeToggle';

// Helpers
function formatDisplayDate(date: Date) {
  return `${date.getDate()} ${TURKISH_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function formatCountdown(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function CalendarPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  // Data State
  const [user, setUser] = useState<any>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [closedSlots, setClosedSlots] = useState<any>({});
  // bannedUsers state kaldırıldı — doğrudan user?.is_banned kullanılıyor
  const [days7, setDays7] = useState<Date[]>([]);

  // Booking Window State
  const [bookingAllowed, setBookingAllowed] = useState(true);
  const [previewMode, setPreviewMode] = useState(false);
  const [countdown, setCountdown] = useState('');

  // UI State
  const [activeDayIndex, setActiveDayIndex] = useState<number>(-1);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [dayPickerOpen, setDayPickerOpen] = useState(false);
  const [toast, setToast] = useState({ msg: '', type: '', show: false });
  const [presenceLocks, setPresenceLocks] = useState<any>({});
  const [presenceRoom, setPresenceRoom] = useState<any>(null);
  const [presenceKey] = useState(() => Math.random().toString(36).substring(2, 10));

  // Booking Modal State
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);

  // Profile Modal
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  // Appointments Modal
  const [myApptsModalOpen, setMyApptsModalOpen] = useState(false);

  // Edit Appt Modal
  const [editApptModalOpen, setEditApptModalOpen] = useState(false);
  const [editApptToModify, setEditApptToModify] = useState<any>(null);

  const showToast = (msg: string, type = 'success') => {
    setToast({ msg, type, show: true });
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3500);
  };

  const loadData = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      // Haftalık tarih aralığını hesapla (days7 state'ine bağımlılığı koparmak için burada hesaplıyoruz)
      const activeMonday = getActiveWeekMonday();
      const weekDays = getWeekDaysFromMonday(activeMonday);
      const startStr = formatDate(weekDays[0]);
      const endStr = formatDate(weekDays[6]);

      const promises: any[] = [
        supabase.rpc('get_public_appointments', { start_date: startStr, end_date: endStr }),
        supabase.from('closed_slots').select('*').gte('tarih', startStr).lte('tarih', endStr)
      ];

      if (session) {
        promises.push(supabase.from('profiles').select('*').eq('id', session.user.id).single());
        promises.push(supabase.from('appointments').select('*').eq('user_id', session.user.id));
      }

      const results = await Promise.all(promises);
      const apptsRes = results[0];
      const closedRes = results[1];
      const profileRes = session ? results[2] : null;
      const userApptsRes = session ? results[3] : null;

      if (apptsRes.error) console.error('Error fetching public appts:', apptsRes.error);
      if (closedRes.error) console.error('Error fetching closed slots:', closedRes.error);
      
      if (session) {
        const profile = profileRes?.data;
        if (profile) setUser(profile);
        else {
          setUser({ id: session.user.id, email: session.user.email, ad: session.user.user_metadata?.first_name || '', soyad: session.user.user_metadata?.last_name || '' });
        }
      } else {
        setUser(null);
      }

      const allAppts = [...(apptsRes.data || [])];
      if (userApptsRes && userApptsRes.data) {
        userApptsRes.data.forEach((ua: any) => {
          const existingIdx = allAppts.findIndex(a => a.id === ua.id);
          if (existingIdx !== -1) {
            allAppts[existingIdx] = ua;
          } else {
            allAppts.push(ua);
          }
        });
      }
      setAppointments(allAppts);

      const adminClosed: any = {};
      (closedRes.data || []).forEach((c: any) => {
        if (c.saat === null) adminClosed[c.tarih] = 'ALL';
        else {
          if (!adminClosed[c.tarih]) adminClosed[c.tarih] = [];
          adminClosed[c.tarih].push(c.saat);
        }
      });
      setClosedSlots(adminClosed);
      // setBannedUsers kaldırılarak doğrudan user.is_banned kullanılacak
    } catch (err) {
      console.error('loadData general error:', err);
    }
  }, [supabase]);

  useEffect(() => {
    // Initial Load
    const activeMonday = getActiveWeekMonday();
    setDays7(getWeekDaysFromMonday(activeMonday));
    setBookingAllowed(isBookingEnabled());
    setPreviewMode(isWeekTransitionPreview());
    loadData();

    // 1. Timer logic (Countdown & Auto-Refresh at 09:00)
    const timer = setInterval(() => {
      const now = new Date();
      const inPreview = isWeekTransitionPreview(now);
      const enabled = isBookingEnabled(now);
      
      setPreviewMode(inPreview);
      setBookingAllowed(enabled);

      if (inPreview) {
        const remaining = getTimeUntilBookingOpen(now);
        setCountdown(remaining > 0 ? formatCountdown(remaining) : '');
      } else {
        setCountdown('');
      }

      // Transition to next week view at 09:00 Saturday automatically
      if (enabled && !bookingAllowed) {
        const newMonday = getActiveWeekMonday(now);
        setDays7(getWeekDaysFromMonday(newMonday));
        loadData();
      }
    }, 1000);

    // 2. Realtime Subscriptions
    const reloadThrottled = () => {
      const tid = setTimeout(() => loadData(), 500);
      return () => clearTimeout(tid);
    };

    const publicChannel = supabase.channel('public-sync')
      .on('broadcast', { event: 'refetch_data' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'closed_slots' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, loadData)
      .subscribe();

    // 3. Presence for Locks
    const room = supabase.channel('booking_locks', {
      config: { presence: { key: presenceKey } }
    });

    room.on('presence', { event: 'sync' }, () => {
      const state = room.presenceState();
      const newLocks: any = {};
      Object.entries(state).forEach(([key, presences]) => {
        presences.forEach((p: any) => {
          if (p.lockedSlot && p.expiresAt > Date.now()) {
            newLocks[p.lockedSlot] = { userId: key, expiresAt: p.expiresAt };
          }
        });
      });
      setPresenceLocks(newLocks);
    }).subscribe(async (status) => {
      // Başlangıçta boş track yapmaya gerek yok, sadece bir slota tıklandığında track edeceğiz
      // if (status === 'SUBSCRIBED') await room.track({ lockedSlot: null });
    });

    setPresenceRoom(room);

    return () => {
      clearInterval(timer);
      supabase.removeChannel(publicChannel);
      supabase.removeChannel(room);
    };
  }, [loadData, supabase, presenceKey]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setUserDropdownOpen(false);
  };

  // Optimization: O(1) Lookup Map
  const appointmentsMap = useMemo(() => {
    const map: any = {};
    appointments.forEach(a => { map[`${a.tarih}_${a.saat}`] = a; });
    return map;
  }, [appointments]);

  // Optimization: Memoize availability counts for all days
  const availabilityCounts = useMemo(() => {
    const now = new Date();
    const counts: Record<string, number> = {};

    days7.forEach(day => {
      const dateStr = formatDate(day);
      const isPastDay = new Date(day.getTime()).setHours(23, 59, 59, 999) < now.getTime();

      if (closedSlots[dateStr] === 'ALL' || isPastDay) {
        counts[dateStr] = -1;
        return;
      }

      let unavailableCount = 0;
      const closedArr = Array.isArray(closedSlots[dateStr]) ? closedSlots[dateStr] : [];
      const isToday = day.getDate() === now.getDate() && day.getMonth() === now.getMonth() && day.getFullYear() === now.getFullYear();

      for (let h = 8; h <= 22; h++) {
        const slotPast = isToday && h <= now.getHours();
        if (appointmentsMap[`${dateStr}_${h}`] || closedArr.includes(h) || slotPast) {
          unavailableCount++;
        }
      }
      counts[dateStr] = 15 - unavailableCount;
    });
    return counts;
  }, [days7, appointmentsMap, closedSlots]);

  const getAvailableCount = (day: Date) => availabilityCounts[formatDate(day)] ?? 0;

  // --- INTERACTIONS ---
  const openSlotModal = (day: Date, hour: number) => {
    if (!bookingAllowed) {
      showToast('⏳ Randevular henüz açılmadı! Saat 09:00\'da aktif olacak.', 'error');
      return;
    }
    if (!user) {
      showToast('Randevu almak için lütfen giriş yapın!', 'error');
      setTimeout(() => router.push('/login'), 1800);
      return;
    }
    if (user?.is_banned) {
      showToast('Hesabınız askıya alınmıştır. Lütfen yönetici ile iletişime geçin.', 'error');
      return;
    }

    const dateStr = formatDate(day);

    // Haftalık randevu kontrolü (Tüm günler için)
    const startStr = formatDate(days7[0]);
    const endStr = formatDate(days7[6]);
    const hasApptInWeek = appointments.some(a => a.user_id === user.id && a.tarih >= startStr && a.tarih <= endStr);
    if (hasApptInWeek) {
      showToast('⚠️ Mevcut haftada zaten bir randevunuz bulunuyor. Haftada yalnızca bir randevu alabilirsiniz.', 'error');
      return;
    }
    const lockKey = `${dateStr}_${hour}`;

    if (presenceLocks[lockKey] && presenceLocks[lockKey].userId !== presenceKey) {
      showToast('Bu slot şu anda başka bir kullanıcı tarafından rezerve ediliyor!', 'error');
      return;
    }

    // Track the lock via presence
    if (presenceRoom) {
      presenceRoom.track({ lockedSlot: lockKey, expiresAt: Date.now() + 5 * 60 * 1000 }).catch(console.error);
    }

    setSelectedDate(day);
    setSelectedHour(hour);
    setBookingModalOpen(true);
  };

  const closeSlotModal = async () => {
    if (presenceRoom) {
      await presenceRoom.untrack().catch(console.error);
    }
    setBookingModalOpen(false);
    loadData();
  };

  const isBanned = user?.is_banned;
  const banReason = user?.ban_reason;

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <div className="header-logo">
            <Image src="/gm-logo.png" alt="Gençlik Merkezi" width={120} height={120} className="gsb-emblem" style={{ objectFit: 'contain' }} priority />
            <div>
              <span className="header-title-main">Manavgat Gençlik Merkezi</span>
              <span className="header-title-sub">Saha Randevu Sistemi</span>
            </div>
          </div>

          {isBanned && (
            <div className="ban-notice-bar">
              <span>🚨 Hesabınız askıya alınmıştır — <strong>Neden: {banReason || 'Kurallara uyulmaması'}</strong></span>
            </div>
          )}

          <nav className="header-nav">
            <ThemeToggle />
            {user ? (
              <div className="user-menu" onMouseEnter={() => setUserDropdownOpen(true)} onMouseLeave={() => setUserDropdownOpen(false)}>
                <span className="user-greeting">
                  Hoşgeldiniz, <strong>{user.ad || 'Kullanıcı'}</strong> <span className="user-menu-arrow">▾</span>
                </span>
                <div className={`user-dropdown ${userDropdownOpen ? 'open' : ''}`}>
                  <button className="dropdown-item" onClick={() => { setProfileModalOpen(true); setUserDropdownOpen(false); }}>👤 Hesabım</button>
                  <button className="dropdown-item" onClick={() => { setMyApptsModalOpen(true); setUserDropdownOpen(false); }}>📅 Randevularım</button>
                  <div className="dropdown-divider"></div>
                  <button className="dropdown-item dropdown-item-danger" onClick={handleLogout}>↩️ Çıkış Yap</button>
                </div>
              </div>
            ) : (
              <>
                <Link href="/login" className="btn btn-outline-white">Giriş Yap</Link>
                <Link href="/register" className="btn btn-white">Üye Ol</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="main">
        <div className="container">
          {/* Booking Window Banner */}
          {previewMode && (
            <div className="booking-countdown-banner">
              <div className="countdown-icon">⏳</div>
              <div className="countdown-text">
                <strong>Yeni hafta randevuları hazırlanıyor!</strong>
                <p>Randevular saat 09:00'da açılacak. {countdown && <span className="countdown-timer">Kalan süre: {countdown}</span>}</p>
              </div>
            </div>
          )}

          <section className="week-section">
            <div className="section-title">Haftalık Takvim — Gün Seçin</div>

            {/* Mobile Day Combobox */}
            <div className="mobile-day-combo">
              <button
                className={`mobile-day-trigger ${dayPickerOpen ? 'open' : ''}`}
                onClick={() => setDayPickerOpen(!dayPickerOpen)}
              >
                <span className="mobile-day-trigger-text">
                  {activeDayIndex !== -1 && days7[activeDayIndex]
                    ? `${TURKISH_DAYS[days7[activeDayIndex].getDay()]} — ${days7[activeDayIndex].getDate()} ${TURKISH_MONTHS[days7[activeDayIndex].getMonth()]}`
                    : '— Gün Seçin —'
                  }
                </span>
                {activeDayIndex !== -1 && (() => {
                  const avail = getAvailableCount(days7[activeDayIndex]);
                  const dateStr = formatDate(days7[activeDayIndex]);
                  const now = new Date();
                  const isPastDay = new Date(days7[activeDayIndex].getTime()).setHours(23, 59, 59, 999) < now.getTime();
                  const dayClosed = closedSlots[dateStr] === 'ALL' || isPastDay;
                  if (dayClosed) return <span className="mobile-day-badge closed">Kapalı</span>;
                  if (avail === 0) return <span className="mobile-day-badge full">Dolu</span>;
                  return <span className="mobile-day-badge available">{avail} boş</span>;
                })()}
                <span className={`mobile-day-arrow ${dayPickerOpen ? 'open' : ''}`}>▾</span>
              </button>
              {dayPickerOpen && (
                <div className="mobile-day-dropdown">
                  {days7.map((day, idx) => {
                    const dateStr = formatDate(day);
                    const now = new Date();
                    const isPastDay = new Date(day.getTime()).setHours(23, 59, 59, 999) < now.getTime();
                    const dayClosed = closedSlots[dateStr] === 'ALL' || isPastDay;
                    const avail = getAvailableCount(day);
                    const isActive = activeDayIndex === idx;

                    return (
                      <button
                        key={idx}
                        className={`mobile-day-option ${isActive ? 'active' : ''} ${dayClosed ? 'disabled' : ''}`}
                        onClick={() => {
                          if (!dayClosed) {
                            setActiveDayIndex(idx);
                            setDayPickerOpen(false);
                          }
                        }}
                        disabled={dayClosed}
                      >
                        <div className="mobile-day-left">
                          <span className="mobile-day-name">{TURKISH_DAYS[day.getDay()]}</span>
                          <span className="mobile-day-date">{day.getDate()} {TURKISH_MONTHS[day.getMonth()]}</span>
                        </div>
                        <div className="mobile-day-right">
                          {dayClosed ? (
                            <span className="mobile-day-badge closed">{isPastDay ? 'Geçmiş' : 'Kapalı'}</span>
                          ) : avail === 0 ? (
                            <span className="mobile-day-badge full">Dolu</span>
                          ) : (
                            <span className="mobile-day-badge available">{avail} boş</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Desktop Grid */}
            <div className="days-grid">
              {days7.map((day, idx) => {
                const dateStr = formatDate(day);
                const now = new Date();
                const isPastDay = new Date(day.getTime()).setHours(23, 59, 59, 999) < now.getTime();
                const dayClosed = closedSlots[dateStr] === 'ALL' || isPastDay;
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                const avail = getAvailableCount(day);

                let badgeContent = <><span id={`availCount_${idx}`}>{avail}</span>&nbsp;boş</>;
                let availClass = 'day-available';

                if (dayClosed) {
                  badgeContent = <>🔒 Kapalı</>;
                  availClass += ' closed';
                } else if (avail === 0) {
                  availClass += ' full';
                } else if (avail <= 7) {
                  availClass += ' warning';
                }

                return (
                  <div
                    key={idx}
                    className={`day-card ${isWeekend ? 'weekend' : ''} ${dayClosed ? 'day-closed' : ''} ${activeDayIndex === idx ? 'active' : ''}`}
                    onClick={() => { if (!dayClosed) setActiveDayIndex(idx); }}
                    onMouseEnter={() => { if (!dayClosed && activeDayIndex === -1) setActiveDayIndex(idx); }}
                  >
                    <div className="day-name">{TURKISH_DAYS[day.getDay()]}</div>
                    <div className="day-date">{day.getDate()}</div>
                    <div className="day-month">{TURKISH_MONTHS[day.getMonth()]}</div>
                    <div className={availClass}>{badgeContent}</div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Slots Section */}
          <section className="slots-section" style={{ display: activeDayIndex !== -1 ? 'block' : 'none' }}>
            {activeDayIndex !== -1 && days7[activeDayIndex] && (
              <>
                <div className="slots-header">
                  <div className="slots-title">
                    {TURKISH_DAYS[days7[activeDayIndex].getDay()]}, {formatDisplayDate(days7[activeDayIndex])} — Randevu Saatleri
                  </div>
                  <button className="close-slots-btn" onClick={() => setActiveDayIndex(-1)}>✕ Kapat</button>
                </div>
                <div className="slots-grid">
                  {Array.from({ length: 15 }, (_, i) => i + 8).map(hour => {
                    const day = days7[activeDayIndex];
                    const dateStr = formatDate(day);

                    const taken = appointmentsMap[`${dateStr}_${hour}`];
                    const now = new Date();
                    const isPastDay = new Date(day.getTime()).setHours(23, 59, 59, 999) < now.getTime();
                    const isToday = day.getDate() === now.getDate() && day.getMonth() === now.getMonth() && day.getFullYear() === now.getFullYear();
                    const slotPast = isPastDay || (isToday && hour <= now.getHours());

                    const dayClosed = closedSlots[dateStr] === 'ALL' || isPastDay;
                    const slotClosed = dayClosed || (Array.isArray(closedSlots[dateStr]) && closedSlots[dateStr].includes(hour)) || slotPast;

                    const lockKey = `${dateStr}_${hour}`;
                    const isLockedByOther = presenceLocks[lockKey] && presenceLocks[lockKey].expiresAt > Date.now() && presenceLocks[lockKey].userId !== presenceKey;

                    const isUnavailable = taken || slotClosed || isLockedByOther;

                    // Booking window kontrolü: preview modda tüm boş slotları kilitle
                    const bookingLocked = !bookingAllowed && !taken && !slotClosed;
                    const finalUnavailable = isUnavailable || bookingLocked;

                    let badgeClass = isUnavailable ? 'taken' : 'available';
                    if (isLockedByOther) badgeClass = 'warning';
                    if (bookingLocked) badgeClass = 'warning';

                    let badgeText = taken ? 'Dolu' : (slotClosed ? '🔒 Kapalı' : (isLockedByOther ? '⏳ İşlemde' : (bookingLocked ? '🕐 09:00\'da Açılacak' : 'Boş')));

                    return (
                      <div
                        key={hour}
                        className={`slot-card ${finalUnavailable ? 'slot-taken' : 'slot-available'}`}
                        onClick={() => { if (!finalUnavailable) openSlotModal(day, hour); }}
                      >
                        <div className="slot-time">{formatSlotTimeRange(hour, day)}</div>
                        <div className="slot-status desktop-only-badge">
                          <span className={`status-badge ${badgeClass}`}>{badgeText}</span>
                        </div>
                        {taken && <div className="slot-category desktop-only-badge">{taken.kategori === 'basketbol' ? '🏀 Basketbol' : '🏐 Voleybol'}</div>}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        </div>
      </main>

      {/* --- Booking Modal --- */}
      <BookingModal
        isOpen={bookingModalOpen}
        onClose={closeSlotModal}
        selectedDate={selectedDate}
        selectedHour={selectedHour}
        user={user}
        appointments={appointments}
        onSuccess={() => { loadData(); closeSlotModal(); }}
        showToast={showToast}
      />

      <ProfileModal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        user={user}
        onSuccess={loadData}
        showToast={showToast}
      />

      <MyAppointmentsModal
        isOpen={myApptsModalOpen}
        onClose={() => setMyApptsModalOpen(false)}
        appointments={appointments}
        user={user}
        onSuccess={loadData}
        showToast={showToast}
        onOpenEditAppt={(appt) => {
          setEditApptToModify(appt);
          setEditApptModalOpen(true);
        }}
      />

      <EditAppointmentModal
        isOpen={editApptModalOpen}
        onClose={() => {
          setEditApptModalOpen(false);
          setEditApptToModify(null);
        }}
        appointment={editApptToModify}
        user={user}
        appointments={appointments}
        closedSlots={closedSlots}
        onSuccess={loadData}
        showToast={showToast}
      />

      {/* --- Footer --- */}
      <footer className="site-footer">
        <div className="footer-content">
          <div className="footer-info">
            <p><strong>Manavgat Gençlik Merkezi</strong></p>
            <p>📍 Adres: Emek, 3086. Sk. No:2, 07600 Manavgat/Antalya</p>
            <p>📞 Telefon: (0242) 742 28 50</p>
          </div>
        </div>
      </footer>

      {/* --- Toast --- */}
      <div className={`toast toast-${toast.type} ${toast.show ? 'show' : ''}`} role="alert">
        {toast.msg}
      </div>
    </>
  );
}
