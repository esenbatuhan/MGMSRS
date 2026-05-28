'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { TURKISH_DAYS, TURKISH_MONTHS, formatDate, getCurrentWeekMonday, getActiveWeekMonday, isWeekTransitionPreview, getWeekDaysFromMonday } from '@/utils/constants';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

// Constants
const HOURS = Array.from({ length: 15 }, (_, i) => i + 8); // 08–22



export default function AdminDashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [appointments, setAppointments] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [bannedUsers, setBannedUsers] = useState<any[]>([]);
  const [closedSlots, setClosedSlots] = useState<Record<string, string>>({}); // { "date_hour": "description" }
  
  const [currentWeekMonday, setCurrentWeekMonday] = useState<Date | null>(null);
  const [weekPickerOpen, setWeekPickerOpen] = useState(false);
  const [dragApptId, setDragApptId] = useState<string | null>(null);

  const [toast, setToast] = useState({ msg: '', type: '', show: false });

  // Modals
  const [apptDetail, setApptDetail] = useState<any | null>(null);
  const [postponeApptId, setPostponeApptId] = useState<string | null>(null);
  const [postponeDate, setPostponeDate] = useState('');
  const [postponeHour, setPostponeHour] = useState('');
  
  const [banTarget, setBanTarget] = useState<{ id: string, name: string } | null>(null);
  const [banReason, setBanReason] = useState('');

  const [banError, setBanError] = useState('');
  
  const [bannedModalOpen, setBannedModalOpen] = useState(false);

  // Week transition state
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  // Close Slot Modal State
  const [closeSlotData, setCloseSlotData] = useState<{ tarih: string, saat: number | null, note: string } | null>(null);

  // Confirmation Modals State
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [confirmDropData, setConfirmDropData] = useState<{ dragApptId: string, dateStr: string, hour: number } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Backup States
  const [backupModalOpen, setBackupModalOpen] = useState(false);
  const [backupRange, setBackupRange] = useState('3_months'); // '3_months' | '6_months' | '1_year' | 'all'
  const [backupLoading, setBackupLoading] = useState(false);
  const [backedUpAppointments, setBackedUpAppointments] = useState<any[]>([]);
  const [backupSuccess, setBackupSuccess] = useState(false);
  const [authPassword, setAuthPassword] = useState('');
  const [passwordVerified, setPasswordVerified] = useState(false);
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [archivedAppointments, setArchivedAppointments] = useState<any[]>([]);

  const showToast = (msg: string, type = 'success') => {
    setToast({ msg, type, show: true });
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3500);
  };

  const loadData = useCallback(async () => {
    // Auth Check
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/admin/login');
      return;
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
    if (!profile || profile.role !== 'admin') {
      router.push('/');
      return;
    }

    const now = new Date();
    const pastDate = new Date(now); pastDate.setDate(now.getDate() - 30);
    const futureDate = new Date(now); futureDate.setDate(now.getDate() + 60);
    const startStr = formatDate(pastDate);
    const endStr = formatDate(futureDate);

    const promises: any[] = [
      supabase.from('appointments').select('*').gte('tarih', startStr).lte('tarih', endStr),
      supabase.from('profiles').select('id, ad, soyad, email, telefon, tc_no, dogum_tarihi, is_banned, ban_reason, banned_at'),
      supabase.from('closed_slots').select('*').gte('tarih', startStr).lte('tarih', endStr)
    ];

    const [apptsRes, usersRes, closedRes] = await Promise.all(promises);

    setAppointments(apptsRes.data || []);
    setUsers(usersRes.data || []);
    setBannedUsers((usersRes.data || []).filter((u: any) => u.is_banned));

    const cObj: Record<string, string> = {};
    (closedRes.data || []).forEach((c: any) => {
      const key = c.saat === null ? `${c.tarih}_ALL` : `${c.tarih}_${c.saat}`;
      cObj[key] = c.description || (c.saat === null ? 'GÜN KAPALI' : 'KAPALI');
    });
    setClosedSlots(cObj);
  }, [supabase, router]);

  useEffect(() => {
    loadData();
    setCurrentWeekMonday(getActiveWeekMonday());
    setIsPreviewMode(isWeekTransitionPreview());

    let reloadTimeout: NodeJS.Timeout;

    // Preview mode status checker (her 30 saniye kontrol et)
    const previewInterval = setInterval(() => {
      setIsPreviewMode(isWeekTransitionPreview());
    }, 30000);

    // Supabase Realtime (Eşzamanlı Güncelleme)
    const channel = supabase.channel('admin-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setAppointments(prev => {
            if (prev.find(a => a.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
        } else if (payload.eventType === 'DELETE') {
          setAppointments(prev => prev.filter(a => a.id !== payload.old.id));
        } else if (payload.eventType === 'UPDATE') {
          setAppointments(prev => prev.map(a => a.id === payload.new.id ? payload.new : a));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'closed_slots' }, () => {
        clearTimeout(reloadTimeout);
        reloadTimeout = setTimeout(() => loadData(), 500);
      })
      .subscribe();

    return () => {
      clearInterval(previewInterval);
      clearTimeout(reloadTimeout);
      supabase.removeChannel(channel);
    };
  }, [loadData, supabase]);

  // Load weekly archives when currentWeekMonday changes
  useEffect(() => {
    if (!currentWeekMonday) return;
    const mondayStr = formatDate(currentWeekMonday);
    const filePath = `weekly_archives/${mondayStr}.json`;

    const loadWeeklyArchive = async () => {
      try {
        const { data: fileData, error } = await supabase.storage
          .from('randevu-arsivleri')
          .download(filePath);

        if (fileData) {
          const text = await fileData.text();
          const parsed = JSON.parse(text);
          setArchivedAppointments(parsed || []);
        } else {
          setArchivedAppointments([]);
        }
      } catch (err) {
        // File doesn't exist, which is expected for weeks without archives
        setArchivedAppointments([]);
      }
    };

    loadWeeklyArchive();
  }, [currentWeekMonday, supabase]);

  // Optimization: O(1) Lookup Maps (must be before early return to respect hooks order)
  const appointmentsMap = useMemo(() => {
    const map: any = {};
    // Merge database appointments
    appointments.forEach(a => { map[`${a.tarih}_${a.saat}`] = a; });
    // Merge archived appointments (archived has higher priority or is filled in if slot is empty)
    archivedAppointments.forEach(a => {
      map[`${a.tarih}_${a.saat}`] = { ...a, is_archived: true };
    });
    return map;
  }, [appointments, archivedAppointments]);

  const usersMap = useMemo(() => {
    const map: any = {};
    users.forEach(u => { map[u.id] = u; });
    return map;
  }, [users]);

  if (!currentWeekMonday) return null;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/admin/login');
  };

  // Nav
  const prevWeek = () => {
    const m = new Date(currentWeekMonday);
    m.setDate(m.getDate() - 7);
    setCurrentWeekMonday(m);
  };

  const nextWeek = () => {
    const activeMonday = getActiveWeekMonday();
    const maxFuture = new Date(activeMonday);
    maxFuture.setDate(maxFuture.getDate() + 7); // Sadece 1 hafta ileriye izin ver
    
    const m = new Date(currentWeekMonday!);
    m.setDate(m.getDate() + 7);
    
    if (m > maxFuture) return;
    setCurrentWeekMonday(m);
  };

  const isPastWeek = () => {
    const active = getActiveWeekMonday();
    return currentWeekMonday!.getTime() < active.getTime();
  };
  const readOnly = isPastWeek();

  // Slot checks
  const isDayClosed = (dateStr: string) => !!closedSlots[`${dateStr}_ALL`];
  const isSlotClosedStr = (dateStr: string, hour: number) => {
    if (closedSlots[`${dateStr}_ALL`]) return true;
    return !!closedSlots[`${dateStr}_${hour}`];
  };

  const getSlotNote = (dateStr: string, hour: number | null) => {
    if (hour === null) return closedSlots[`${dateStr}_ALL`];
    return closedSlots[`${dateStr}_ALL`] || closedSlots[`${dateStr}_${hour}`];
  };

  // Helper: All admin operations via RPC with strict type casting
  const callAdminAction = async (action: string, params: any) => {
    try {
      switch (action) {
        case 'delete_appointment': {
          const { error } = await supabase.rpc('admin_delete_appointment', {
            target_appt_id: String(params.target_appt_id)
          });
          if (error) throw error;
          return;
        }
        case 'postpone_appointment': {
          const { error } = await supabase.rpc('admin_postpone_appointment', {
            target_appt_id: String(params.target_appt_id),
            new_tarih: String(params.new_tarih),
            new_saat: Number(params.new_saat)
          });
          if (error) throw error;
          return;
        }
        case 'open_day': {
          const { error } = await supabase.rpc('admin_open_day', {
            target_tarih: String(params.target_tarih)
          });
          if (error) throw error;
          return;
        }
        case 'open_slot': {
          const { error } = await supabase.rpc('admin_open_slot', {
            target_tarih: String(params.target_tarih),
            target_saat: Number(params.target_saat)
          });
          if (error) throw error;
          return;
        }
        case 'close_slot': {
          // target_saat must be INTEGER, never null
          const { error } = await supabase.rpc('admin_close_slot', {
            target_tarih: String(params.target_tarih),
            target_saat: Number(params.target_saat),
            target_description: params.target_description || null
          });
          if (error) throw error;
          return;
        }
        case 'close_day': {
          // Tüm günü kapat (saat=NULL kayıt ekler)
          const { error } = await supabase.rpc('admin_close_day', {
            target_tarih: String(params.target_tarih),
            target_description: params.target_description || null
          });
          if (error) throw error;
          return;
        }
        case 'ban_user': {
          const { error } = await supabase.rpc('admin_ban_user', {
            target_user_id: String(params.target_user_id),
            ban_reason_text: String(params.ban_reason_text || 'Belirtilmedi')
          });
          if (error) throw error;
          return;
        }
        case 'unban_user': {
          const { error } = await supabase.rpc('admin_unban_user', {
            target_user_id: String(params.target_user_id)
          });
          if (error) throw error;
          return;
        }
        default:
          throw new Error('Bilinmeyen islem: ' + action);
      }
    } catch (err: any) {
      console.error(`Admin Action Error [${action}]:`, err);
      throw new Error(err.message || 'İşlem gerçekleştirilemedi.');
    }
  };

  // Actions
  const toggleDayClosed = async (dateStr: string) => {
    if (readOnly) return;
    if (new Date(`${dateStr}T23:59:59`) < new Date()) {
      showToast('Geçmiş günler düzenlenemez!', 'error');
      return;
    }
    if (isDayClosed(dateStr)) {
      try {
        await callAdminAction('open_day', { target_tarih: dateStr });
        showToast('Gün açıldı.', 'success');
        await loadData();
      } catch (err: any) {
        showToast('Hata: ' + err.message, 'error');
      }
    } else {
      setCloseSlotData({ tarih: dateStr, saat: null, note: '' });
    }
  };

  const toggleSlotClosedAction = async (dateStr: string, hour: number) => {
    if (readOnly || isDayClosed(dateStr)) return;
    if (new Date(`${dateStr}T${String(hour).padStart(2, '0')}:00:00`) < new Date()) {
      showToast('Geçmiş saatler düzenlenemez!', 'error');
      return;
    }
    const isClosed = isSlotClosedStr(dateStr, hour);
    if (isClosed) {
      try {
        await callAdminAction('open_slot', { target_tarih: dateStr, target_saat: hour });
        showToast('Slot açıldı.', 'success');
        await loadData();
      } catch (err: any) {
        showToast('Hata: ' + err.message, 'error');
      }
    } else {
      setCloseSlotData({ tarih: dateStr, saat: hour, note: '' });
    }
  };

  const confirmCloseSlot = async () => {
    if (!closeSlotData) return;
    const { tarih, saat, note } = closeSlotData;

    try {
      if (saat === null) {
        // Tüm günü kapat (admin_close_day RPC: saat=NULL kayıt oluşturur)
        await callAdminAction('close_day', { target_tarih: tarih, target_description: note || null });
      } else {
        // Tekil slot kapat
        await callAdminAction('close_slot', { target_tarih: tarih, target_saat: saat, target_description: note || null });
      }

      showToast(saat === null ? 'Gün kapatıldı.' : 'Slot kapatıldı.', 'success');
      setCloseSlotData(null);
      await loadData();
    } catch (err: any) {
      showToast('Hata: ' + err.message, 'error');
    }
  };

  // Drag and Drop
  const handleDrop = async (dateStr: string, hour: number) => {
    if (!dragApptId || readOnly) return;

    // Geçmiş randevu kontrolü
    const dragAppt = appointments.find(a => a.id === dragApptId);
    if (dragAppt) {
      const isPastAppt = new Date(`${dragAppt.tarih}T${String(dragAppt.saat).padStart(2, '0')}:00:00`) < new Date();
      if (isPastAppt) {
        showToast('Geçmiş randevular ötelenemez!', 'error');
        setDragApptId(null);
        return;
      }
    }

    if (new Date(`${dateStr}T${String(hour).padStart(2, '0')}:00:00`) < new Date()) {
      showToast('Randevular geçmiş bir saate taşınamaz!', 'error');
      setDragApptId(null);
      return;
    }

    if (appointments.some(a => a.tarih === dateStr && a.saat === hour && a.id !== dragApptId)) {
      showToast('Bu slot zaten dolu!', 'error'); return;
    }
    if (isDayClosed(dateStr) || isSlotClosedStr(dateStr, hour)) {
      showToast('Bu slot kapalı!', 'error'); return;
    }

    setConfirmDropData({ dragApptId, dateStr, hour });
  };

  const executeDrop = async () => {
    if (!confirmDropData) return;

    // Geçmiş randevu kontrolü
    const dragAppt = appointments.find(a => a.id === confirmDropData.dragApptId);
    if (dragAppt) {
      const isPastAppt = new Date(`${dragAppt.tarih}T${String(dragAppt.saat).padStart(2, '0')}:00:00`) < new Date();
      if (isPastAppt) {
        showToast('Geçmiş randevular ötelenemez!', 'error');
        setConfirmDropData(null);
        setDragApptId(null);
        return;
      }
    }

    setActionLoading(true);
    try {
      await callAdminAction('postpone_appointment', { 
        target_appt_id: confirmDropData.dragApptId, 
        new_tarih: confirmDropData.dateStr, 
        new_saat: confirmDropData.hour 
      });
      await loadData();
      showToast('Randevu başarıyla ötelendi. ✓', 'success');
    } catch (err: any) {
      showToast('Hata: ' + err.message, 'error');
    } finally {
      setActionLoading(false);
      setConfirmDropData(null);
      setDragApptId(null);
    }
  };

  // Appointments
  const cancelAppt = async (id: string) => {
    setConfirmCancelId(id);
    setApptDetail(null); // Close the detail modal
  };

  const executeCancel = async () => {
    if (!confirmCancelId) return;
    setActionLoading(true);
    try {
      await callAdminAction('delete_appointment', { target_appt_id: confirmCancelId });
      await loadData();
      showToast('Randevu iptal edildi.', 'success');
    } catch (err: any) {
      showToast('Hata: ' + err.message, 'error');
    } finally {
      setActionLoading(false);
      setConfirmCancelId(null);
    }
  };

  const confirmPostpone = async () => {
    if (!postponeDate || !postponeHour || !postponeApptId) { showToast('Eksik seçim!', 'error'); return; }
    const h = parseInt(postponeHour);

    // Geçmiş randevu kontrolü
    const targetAppt = appointments.find(a => a.id === postponeApptId);
    if (targetAppt) {
      const isPastAppt = new Date(`${targetAppt.tarih}T${String(targetAppt.saat).padStart(2, '0')}:00:00`) < new Date();
      if (isPastAppt) {
        showToast('Geçmiş randevular ötelenemez!', 'error');
        setPostponeApptId(null);
        return;
      }
    }

    if (appointments.some(a => a.tarih === postponeDate && a.saat === h && a.id !== postponeApptId)) {
      showToast('Seçilen slot zaten dolu!', 'error'); return;
    }
    if (isDayClosed(postponeDate) || isSlotClosedStr(postponeDate, h)) {
      showToast('Seçilen slot kapalı!', 'error'); return;
    }

    try {
      await callAdminAction('postpone_appointment', { 
        target_appt_id: postponeApptId, 
        new_tarih: postponeDate, 
        new_saat: h 
      });
      await loadData();
      setPostponeApptId(null);
      showToast('Randevu başarıyla ötelendi.', 'success');
    } catch (err: any) {
      showToast('Hata: ' + err.message, 'error');
    }
  };

  const confirmBan = async () => {
    if (!banTarget) return;
    setBanError('');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    try {
      await callAdminAction('ban_user', {
        target_user_id: banTarget.id,
        ban_reason_text: banReason || 'Belirtilmedi'
      });
      await loadData();
      setBanTarget(null);
      setBanReason('');
      setApptDetail(null);
      showToast(`${banTarget.name} yasaklandı.`, 'success');
    } catch (err: any) {
      showToast('Hata: ' + err.message, 'error');
    }
  };

  const unbanUser = async (userId: string) => {
    try {
      await callAdminAction('unban_user', { target_user_id: userId });
      await loadData();
      showToast('Yasak başarıyla kaldırıldı.', 'success');
    } catch (err: any) {
      showToast('Hata: ' + err.message, 'error');
    }
  };

  const handleVerifyPassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!authPassword) {
      setPasswordError('Lütfen şifrenizi giriniz.');
      return;
    }

    setVerifyingPassword(true);
    setPasswordError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !session.user || !session.user.email) {
        setPasswordError('Oturum bulunamadı. Lütfen sayfayı yenileyip tekrar giriş yapın.');
        setVerifyingPassword(false);
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: session.user.email,
        password: authPassword
      });

      if (error) {
        setPasswordError('Geçersiz şifre! Lütfen şifrenizi kontrol edip tekrar deneyin.');
      } else {
        setPasswordVerified(true);
        setAuthPassword('');
        showToast('🔑 Yönetici doğrulaması başarılı.', 'success');
      }
    } catch (err: any) {
      setPasswordError('Doğrulama hatası: ' + err.message);
    } finally {
      setVerifyingPassword(false);
    }
  };

  const handleBackup = async () => {
    setBackupLoading(true);
    setBackupSuccess(false);

    try {
      const today = new Date();
      const todayStr = formatDate(today);
      let startDate = new Date();

      if (backupRange === '1_month') {
        startDate.setMonth(startDate.getMonth() - 1);
      } else if (backupRange === '3_months') {
        startDate.setMonth(startDate.getMonth() - 3);
      } else if (backupRange === '6_months') {
        startDate.setMonth(startDate.getMonth() - 6);
      } else if (backupRange === '1_year') {
        startDate.setFullYear(startDate.getFullYear() - 1);
      } else {
        startDate = new Date(0); // Tüm zamanlar
      }
      const startDateStr = formatDate(startDate);

      const { data: fetchedAppts, error } = await supabase
        .from('appointments')
        .select('*')
        .gte('tarih', startDateStr)
        .lte('tarih', todayStr)
        .order('tarih', { ascending: false })
        .order('saat', { ascending: true });

      if (error) throw error;

      if (!fetchedAppts || fetchedAppts.length === 0) {
        showToast('Seçilen tarih aralığında geçmiş randevu bulunamadı.', 'error');
        setBackupLoading(false);
        return;
      }

      setBackedUpAppointments(fetchedAppts);

      // PDF Yazdırma penceresini aç
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        showToast('Yazdırma penceresi engellendi! Lütfen pop-up engelleyicisini kapatın.', 'error');
        setBackupLoading(false);
        return;
      }

      const logoUrl = window.location.origin + '/gm-logo.png';
      let htmlContent = `
        <html>
        <head>
          <title>Randevu Yedekleme Raporu - ${new Date().toLocaleDateString('tr-TR')}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
            @page {
              size: A4;
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
              background: white;
              color: black;
              font-family: 'Inter', sans-serif;
              -webkit-print-color-adjust: exact;
            }
            .dilekce-page {
              width: 210mm;
              height: 297mm;
              padding: 25mm 20mm;
              box-sizing: border-box;
              background: white;
              color: black;
              position: relative;
              page-break-after: always;
              display: flex;
              flex-direction: column;
            }
            .dilekce-page:last-child {
              page-break-after: avoid;
            }
            .header-container {
              display: flex;
              align-items: center;
              margin-bottom: 25px;
              position: relative;
            }
            .ministry-logo {
              width: 90px;
              height: 90px;
              object-fit: contain;
            }
            .header-title {
              flex: 1;
              text-align: center;
              font-size: 16px;
              font-weight: 700;
              color: black;
              margin: 0;
              padding-right: 90px;
              line-height: 1.4;
            }
            .body-text {
              font-size: 14px;
              line-height: 1.8;
              text-indent: 30px;
              text-align: justify;
              margin-top: 15px;
              margin-bottom: 30px;
              color: black;
            }
            .body-text strong {
              font-weight: 700;
              border-bottom: 1px dotted #000;
              padding: 0 4px;
            }
            .captain-info-section {
              margin-left: auto;
              width: 320px;
              font-size: 13px;
              line-height: 1.6;
              margin-bottom: 30px;
              color: black;
            }
            .captain-title {
              font-weight: 700;
              font-size: 14px;
              margin-bottom: 6px;
              text-decoration: underline;
            }
            .captain-row {
              display: flex;
              margin-bottom: 4px;
            }
            .captain-label {
              width: 100px;
              font-weight: 600;
            }
            .captain-val {
              flex: 1;
            }
            .participants-table {
              width: 100%;
              border-collapse: collapse;
              margin-top: auto;
              margin-bottom: 10px;
            }
            .participants-table th, .participants-table td {
              border: 1px solid black;
              padding: 10px 6px;
              font-size: 13px;
              text-align: left;
            }
            .participants-table th {
              font-weight: 700;
              background-color: #f2f2f2 !important;
              -webkit-print-color-adjust: exact;
              text-align: center;
              font-size: 11px;
            }
            .col-sira {
              width: 40px;
              text-align: center !important;
            }
            .col-adsoyad {
              width: 160px;
            }
            .col-tc {
              width: 140px;
            }
            .col-dogum {
              width: 110px;
            }
            .col-telefon {
              width: 120px;
            }
          </style>
        </head>
        <body>
      `;

      fetchedAppts.forEach((appt: any) => {
        const u = usersMap[appt.user_id];
        const captainName = u ? `${u.ad} ${u.soyad}` : '—';
        const captainDogum = u ? u.dogum_tarihi : '—';
        const captainTelefon = u ? u.telefon : '—';

        const [y, m, d] = appt.tarih.split('-');
        const formattedDate = `${d}.${m}.${y}`;
        const formattedTime = `${String(appt.saat).padStart(2, '0')}:00 – ${String(appt.saat + 1).padStart(2, '0')}:00`;
        const categoryText = appt.kategori.toUpperCase();

        let tableRowsHtml = '';
        const rows = [];
        
        // Kaptan bilgileri
        rows.push({
          name: captainName,
          tc_no: u ? u.tc_no : '',
          dogum_tarihi: captainDogum,
          telefon: captainTelefon
        });

        // 11 oyuncu
        for (let i = 0; i < 11; i++) {
          const p = appt.oyuncular && appt.oyuncular[i];
          if (p && (p.ad || p.soyad)) {
            rows.push({
              name: `${p.ad || ''} ${p.soyad || ''}`.trim(),
              tc_no: p.tc_no || '',
              dogum_tarihi: p.dogum_tarihi || '',
              telefon: p.telefon || ''
            });
          } else {
            rows.push({ name: '', tc_no: '', dogum_tarihi: '', telefon: '' });
          }
        }

        rows.forEach((row, index) => {
          tableRowsHtml += `
            <tr>
              <td class="col-sira">${index + 1}</td>
              <td class="col-adsoyad">${row.name}</td>
              <td class="col-tc">${row.tc_no || ''}</td>
              <td class="col-dogum">${row.dogum_tarihi || ''}</td>
              <td class="col-telefon">${row.telefon || ''}</td>
            </tr>
          `;
        });

        htmlContent += `
          <div class="dilekce-page">
            <div class="header-container">
              <img src="${logoUrl}" class="ministry-logo" alt="GSB Logo" />
              <h1 class="header-title">MANAVGAT GENÇLİK MERKEZİ MÜDÜRLÜĞÜNE</h1>
            </div>
            
            <p class="body-text">
              <strong>${formattedDate}</strong> tarihi ve <strong>${formattedTime}</strong> saatleri arasında <strong>${categoryText}</strong> oynamak için Manavgat Gençlik Merkezi Spor Salonunu kullanmak istiyoruz. Spor yapmaya engel teşkil eden bir sağlık sorunumuz olmadığını beyan ederiz.
            </p>

            <div class="captain-info-section">
              <div class="captain-title">Takım Sorumlusunun:</div>
              <div class="captain-row">
                <div class="captain-label">Adı Soyadı:</div>
                <div class="captain-val"><strong>${captainName}</strong></div>
              </div>
              <div class="captain-row">
                <div class="captain-label">Doğum Tarihi:</div>
                <div class="captain-val">${captainDogum || '—'}</div>
              </div>
              <div class="captain-row">
                <div class="captain-label">Telefon:</div>
                <div class="captain-val">${captainTelefon || '—'}</div>
              </div>
            </div>

            <table class="participants-table">
              <thead>
                <tr>
                  <th class="col-sira">SIRA</th>
                  <th class="col-adsoyad">ADI SOYADI</th>
                  <th class="col-tc">T.C KİMLİK NUMARASI</th>
                  <th class="col-dogum">DOĞUM TARİHİ</th>
                  <th class="col-telefon">TELEFON</th>
                </tr>
              </thead>
              <tbody>
                ${tableRowsHtml}
              </tbody>
            </table>
          </div>
        `;
      });

      htmlContent += `
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 500);
            };
          </script>
        </body>
        </html>
      `;

      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.focus();

      setBackupSuccess(true);
      showToast('Yazdırma ekranı başarıyla açıldı.', 'success');
    } catch (err: any) {
      showToast('Hata: ' + err.message, 'error');
    } finally {
      setBackupLoading(false);
    }
  };

  const executePurge = async () => {
    if (backedUpAppointments.length === 0) return;
    setActionLoading(true);
    const backedUpIds = backedUpAppointments.map(a => a.id);

    try {
      // 1. Group appointments by user_id for user-specific archiving
      const userArchives: Record<string, any[]> = {};
      backedUpAppointments.forEach(appt => {
        if (!userArchives[appt.user_id]) {
          userArchives[appt.user_id] = [];
        }
        userArchives[appt.user_id].push(appt);
      });

      // 2. Group appointments by week (Monday date string) for weekly calendar archiving
      const weeklyArchives: Record<string, any[]> = {};
      backedUpAppointments.forEach(appt => {
        const monday = getCurrentWeekMonday(new Date(appt.tarih));
        const mondayStr = formatDate(monday);
        if (!weeklyArchives[mondayStr]) {
          weeklyArchives[mondayStr] = [];
        }
        weeklyArchives[mondayStr].push(appt);
      });

      // 3. Process and upload User Archives (user_archives/[user_id].json)
      for (const [userId, appts] of Object.entries(userArchives)) {
        const filePath = `user_archives/${userId}.json`;
        let existingAppts: any[] = [];

        try {
          const { data: fileData, error: downloadError } = await supabase.storage
            .from('randevu-arsivleri')
            .download(filePath);

          if (fileData) {
            const text = await fileData.text();
            existingAppts = JSON.parse(text);
          }
        } catch (downloadErr) {
          console.log(`No existing user archive found for ${userId}, starting fresh.`);
        }

        // Merge and deduplicate by id
        const mergedAppts = [...existingAppts];
        appts.forEach(newAppt => {
          if (!mergedAppts.some(ea => ea.id === newAppt.id)) {
            mergedAppts.push(newAppt);
          }
        });

        // Upload merged list
        const blob = new Blob([JSON.stringify(mergedAppts, null, 2)], { type: 'application/json' });
        const { error: uploadError } = await supabase.storage
          .from('randevu-arsivleri')
          .upload(filePath, blob, {
            contentType: 'application/json',
            upsert: true
          });

        if (uploadError) {
          console.error(`Failed to upload user archive for ${userId}:`, uploadError);
          throw uploadError;
        }
      }

      // 4. Process and upload Weekly Archives (weekly_archives/[monday_date].json)
      for (const [mondayStr, appts] of Object.entries(weeklyArchives)) {
        const filePath = `weekly_archives/${mondayStr}.json`;
        let existingAppts: any[] = [];

        try {
          const { data: fileData, error: downloadError } = await supabase.storage
            .from('randevu-arsivleri')
            .download(filePath);

          if (fileData) {
            const text = await fileData.text();
            existingAppts = JSON.parse(text);
          }
        } catch (downloadErr) {
          console.log(`No existing weekly archive found for ${mondayStr}, starting fresh.`);
        }

        // Merge and deduplicate by id
        const mergedAppts = [...existingAppts];
        appts.forEach(newAppt => {
          if (!mergedAppts.some(ea => ea.id === newAppt.id)) {
            mergedAppts.push(newAppt);
          }
        });

        // Upload merged list
        const blob = new Blob([JSON.stringify(mergedAppts, null, 2)], { type: 'application/json' });
        const { error: uploadError } = await supabase.storage
          .from('randevu-arsivleri')
          .upload(filePath, blob, {
            contentType: 'application/json',
            upsert: true
          });

        if (uploadError) {
          console.error(`Failed to upload weekly archive for ${mondayStr}:`, uploadError);
          throw uploadError;
        }
      }

      // 5. Delete appointments from database table
      const { error } = await supabase
        .from('appointments')
        .delete()
        .in('id', backedUpIds);

      if (error) throw error;

      showToast(`🎉 ${backedUpIds.length} adet geçmiş randevu başarıyla arşivlenip veritabanından kalıcı olarak temizlendi.`, 'success');
      setBackupModalOpen(false);
      setBackedUpAppointments([]);
      setBackupSuccess(false);
      await loadData();
    } catch (err: any) {
      showToast('Arşivleme ve temizleme hatası: ' + err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Rendering logic
  const days = getWeekDaysFromMonday(currentWeekMonday);
  const startD = days[0];
  const endD = days[6];
  const weekLabel = `${startD.getDate()} ${TURKISH_MONTHS[startD.getMonth()]} — ${endD.getDate()} ${TURKISH_MONTHS[endD.getMonth()]} ${endD.getFullYear()}`;


  // Postpone options
  const getPostponeDateOptions = () => {
    const opts: { val: string; label: string }[] = [];
    const t = new Date();
    t.setHours(0,0,0,0);
    
    // Randevu alınabilen hafta: Aktif haftanın pazartesisi
    const activeMonday = getActiveWeekMonday();
    const days = getWeekDaysFromMonday(activeMonday);
    
    days.forEach(d => {
      // Geçmiş günlere öteleme yapılamaz (Bugün dahil ileri tarihler eklenebilir)
      if (d >= t) {
        opts.push({ 
          val: formatDate(d), 
          label: `${TURKISH_DAYS[d.getDay()]} ${d.getDate()} ${TURKISH_MONTHS[d.getMonth()]} ${d.getFullYear()}` 
        });
      }
    });
    
    return opts;
  };

  const getPostponeHourOptions = () => {
    if (!postponeDate) return [];
    return HOURS.map(h => {
      const existingAppt = appointmentsMap[`${postponeDate}_${h}`];
      const isBooked = existingAppt && existingAppt.id !== postponeApptId;
      const isClosed = isDayClosed(postponeDate) || isSlotClosedStr(postponeDate, h);
      const isPast = new Date(`${postponeDate}T${String(h).padStart(2, '0')}:00:00`) < new Date();
      let label = `${String(h).padStart(2, '0')}:00 – ${String(h + 1).padStart(2, '0')}:00`;
      if (isPast) label += ' (Geçmiş)';
      else if (isBooked) label += ' (Dolu)';
      else if (isClosed) label += ' (Kapalı)';
      return { val: h, label, disabled: isBooked || isClosed || isPast };
    });
  };

  return (
    <div className="admin-layout" onClick={(e) => { if ((e.target as HTMLElement).closest('.week-label-wrapper') === null) setWeekPickerOpen(false); }}>
      <header className="admin-header">
        <div className="admin-header-inner">
          <div className="admin-logo">
            <Image src="/gm-logo.png" alt="GSB Logo" width={80} height={80} />
            <div className="admin-logo-text">
              <span className="admin-logo-main">Yönetim Paneli</span>
              <span className="admin-logo-sub">Manavgat Gençlik Merkezi</span>
            </div>
          </div>
          <nav className="admin-nav">
            <button className="admin-nav-btn" onClick={() => {
              setBackupModalOpen(true);
              setBackupSuccess(false);
              setBackedUpAppointments([]);
              setPasswordVerified(false);
              setAuthPassword('');
              setPasswordError('');
            }}>💾 Yedekle & Temizle</button>
            <button className="admin-nav-btn" onClick={() => setBannedModalOpen(true)}>🚫 Yasaklı Kullanıcılar</button>
            <button className="admin-nav-btn danger" onClick={handleLogout}>🚪 Çıkış Yap</button>
          </nav>
        </div>
      </header>

      <div className="admin-toolbar">
        {isPreviewMode && (
          <div style={{ padding: '10px 20px', fontSize: '13px', fontWeight: 600, background: 'rgba(59,130,246,0.15)', color: '#93C5FD', borderBottom: '1px solid rgba(59,130,246,0.3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            📢 Yeni hafta önizlemesi aktif — Kullanıcılar saat 10:00'da randevu alabilecek. Şu anda yalnızca siz düzenleme yapabilirsiniz.
          </div>
        )}
        <div className="admin-week-nav">
          <button className="admin-week-btn" onClick={prevWeek} title="Önceki Hafta">‹</button>
          <div className="week-label-wrapper">
            <button 
              className={`admin-week-label-btn ${currentWeekMonday && currentWeekMonday > getActiveWeekMonday() ? 'future-week' : ''}`} 
              onClick={() => setWeekPickerOpen(!weekPickerOpen)}
            >
              {weekLabel} <span className="wp-arrow">▾</span>
            </button>
            {weekPickerOpen && (
              <div className="week-picker-dropdown" style={{ display: 'block' }}>
                {Array.from({ length: 14 }, (_, i) => {
                  const offsetWeeks = i - 12; // -12 to +1
                  const m = new Date(getActiveWeekMonday());
                  m.setDate(m.getDate() + offsetWeeks * 7);
                  const sd = getWeekDaysFromMonday(m)[0];
                  const ed = getWeekDaysFromMonday(m)[6];
                  const isCurrent = currentWeekMonday && formatDate(m) === formatDate(currentWeekMonday);
                  
                  let labelText = `${sd.getDate()} ${TURKISH_MONTHS[sd.getMonth()]} - ${ed.getDate()} ${TURKISH_MONTHS[ed.getMonth()]} ${ed.getFullYear()}`;
                  if (offsetWeeks === 1) labelText += ' (Gelecek Hafta)';
                  else if (offsetWeeks === 0) labelText += ' (Bu Hafta)';

                  return (
                    <div 
                      key={i} 
                      className={`wp-item ${isCurrent ? 'wp-active' : ''}`}
                      onClick={() => { setCurrentWeekMonday(m); setWeekPickerOpen(false); }}
                    >
                      <span>{labelText}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {(() => {
            const maxMonday = getActiveWeekMonday();
            maxMonday.setDate(maxMonday.getDate() + 7);
            const isMax = currentWeekMonday ? formatDate(currentWeekMonday) === formatDate(maxMonday) : false;
            return (
              <button className="admin-week-btn" onClick={nextWeek} title="Sonraki Hafta" disabled={isMax} style={{ opacity: isMax ? 0.3 : 1 }}>›</button>
            );
          })()}
        </div>
        <div className="admin-legend">
          <div className="admin-legend-item"><div className="legend-dot booked"></div> Dolu</div>
          <div className="admin-legend-item"><div className="legend-dot empty"></div> Boş (tıkla: kapat)</div>
          <div className="admin-legend-item"><div className="legend-dot closed"></div> Kapalı (tıkla: aç)</div>
        </div>
      </div>

      <div className="admin-grid-wrapper">
        <div className="admin-grid">
          {readOnly && (
            <div style={{ padding: '9px 20px', fontSize: '12px', fontWeight: 600, background: 'rgba(71,85,105,0.2)', color: 'var(--gray-400)', borderBottom: '1px solid var(--border)' }}>
              📖 Geçmiş hafta — Salt-okunur mod. Yalnızca randevu detayları görüntülenebilir.
            </div>
          )}
          
          <div className="ag-row ag-header-row">
            <div className="ag-day-cell ag-header-cell">Gün / Saat</div>
            {HOURS.map(h => (
              <div key={h} className="ag-slot-cell ag-header-cell">{String(h).padStart(2, '0')}:00</div>
            ))}
          </div>

          {days.map((day, idx) => {
            const dateStr = formatDate(day);
            const dayClosed = isDayClosed(dateStr);

            return (
              <div key={idx} className={`ag-row ${dayClosed ? 'ag-row-closed' : ''}`}>
                <div className="ag-day-cell">
                  <div className="ag-day-name">{TURKISH_DAYS[day.getDay()]}</div>
                  <div className="ag-day-date">{day.getDate()} {TURKISH_MONTHS[day.getMonth()]}</div>
                  {!readOnly && (
                    <button className={`ag-day-toggle ${dayClosed ? 'ag-btn-open' : 'ag-btn-close'}`} onClick={() => toggleDayClosed(dateStr)}>
                      {dayClosed ? '🔓 Aç' : '🔒 Kapat'}
                    </button>
                  )}
                </div>

                {HOURS.map(hour => {
                  const appt = appointmentsMap[`${dateStr}_${hour}`];
                  const slotClosed = !dayClosed && isSlotClosedStr(dateStr, hour);
                  
                  if (dayClosed) {
                    const note = getSlotNote(dateStr, null);
                    return (
                      <div key={hour} className="ag-slot-cell">
                        <div className="ag-slot dag-closed" title={`Gün kapalı: ${note}`}>
                          <span className="ag-slot-note">{note}</span>
                        </div>
                      </div>
                    );
                  }

                  if (appt) {
                    const u = usersMap[appt.user_id];
                    const isPastAppt = new Date(`${appt.tarih}T${String(appt.saat).padStart(2, '0')}:00:00`) < new Date();
                    return (
                      <div key={hour} className="ag-slot-cell">
                        <div 
                          className="ag-slot ag-slot-booked"
                          draggable={!readOnly && !isPastAppt}
                          onDragStart={() => setDragApptId(appt.id)}
                          onDragEnd={() => setDragApptId(null)}
                          onClick={() => setApptDetail(appt)}
                        >
                          {appt.kategori === 'basketbol' ? '🏀' : '🏐'}<br/><small>{u ? u.ad : '?'}</small>
                        </div>
                      </div>
                    );
                  }

                  if (slotClosed) {
                    const note = getSlotNote(dateStr, hour);
                    return (
                      <div key={hour} className="ag-slot-cell">
                        <div 
                          className="ag-slot ag-slot-closed" 
                          onClick={() => toggleSlotClosedAction(dateStr, hour)} 
                          style={{ cursor: readOnly ? 'default' : 'pointer' }}
                          title={`Slot kapalı: ${note}`}
                        >
                          🔒 <span className="ag-slot-note">{note}</span>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={hour} className="ag-slot-cell">
                      <div 
                        className="ag-slot ag-slot-empty"
                        onClick={() => toggleSlotClosedAction(dateStr, hour)}
                        onDragOver={(e) => { e.preventDefault(); }}
                        onDrop={() => handleDrop(dateStr, hour)}
                        style={{ cursor: readOnly ? 'default' : 'pointer' }}
                      ></div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* --- Appt Detail Modal --- */}
      {apptDetail && (() => {
        const u = usersMap[apptDetail.user_id];
        const isBanned = bannedUsers.some(b => b.id === apptDetail.user_id);
        const isPast = new Date(`${apptDetail.tarih}T${String(apptDetail.saat).padStart(2, '0')}:00:00`) < new Date();
        const [y, m, d] = apptDetail.tarih.split('-');

        return (
          <div className="admin-overlay">
            <div className="admin-modal wide">
              <button className="admin-modal-close" onClick={() => setApptDetail(null)}>✕</button>
              <h2 className="admin-modal-title">📋 Randevu Detayı</h2>
              <div className="appt-info-grid">
                <div className="appt-info-section">
                  <div className="appt-info-title">📅 Randevu</div>
                  <div className="appt-info-row"><span>Tarih:</span> <strong>{d} {TURKISH_MONTHS[parseInt(m) - 1]} {y}</strong></div>
                  <div className="appt-info-row"><span>Saat:</span>  <strong>{String(apptDetail.saat).padStart(2, '0')}:00 – {String(apptDetail.saat + 1).padStart(2, '0')}:00</strong></div>
                  <div className="appt-info-row"><span>Spor:</span>  <strong>{apptDetail.kategori === 'basketbol' ? '🏀 Basketbol' : '🏐 Voleybol'}</strong></div>
                  <div className="appt-info-row"><span>Durum:</span>
                    <span className={`appt-status-badge ${isPast ? 'past' : 'upcoming'}`}>{isPast ? 'Geçmiş' : 'Yakında'}</span>
                  </div>
                </div>
                <div className="appt-info-section">
                  <div className="appt-info-title">👤 Rezervasyon Sahibi</div>
                  {u ? (
                    <>
                      <div className="appt-info-row"><span>T.C. Kimlik:</span> <strong>{u.tc_no || '—'}</strong></div>
                      <div className="appt-info-row"><span>Ad Soyad:</span> <strong>{u.ad} {u.soyad}</strong></div>
                      <div className="appt-info-row"><span>Telefon:</span>  <strong>{u.telefon || '—'}</strong></div>
                      <div className="appt-info-row"><span>E-posta:</span>  <strong>{u.email}</strong></div>
                    </>
                  ) : <div className="appt-info-row" style={{ color: 'var(--gray-600)' }}>Kullanıcı bulunamadı.</div>}
                </div>
              </div>

              {((u) || (apptDetail.oyuncular && apptDetail.oyuncular.length > 0)) && (
                <div className="appt-info-section" style={{ marginBottom: '20px' }}>
                  <div className="appt-info-title">👥 Takım Üyeleri</div>
                  <div className="appt-players" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {u && (
                      <div className="appt-player" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="player-num" style={{ background: 'var(--red)', color: 'white' }}>1</span> 
                          <strong>{u.ad} {u.soyad}</strong> <em style={{ color: 'var(--red)', fontSize: '12px', fontWeight: 600 }}>(Kaptan)</em>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '6px', paddingLeft: '36px' }}>
                          {u.tc_no && <span><strong>T.C:</strong> {u.tc_no} </span>}
                          {u.dogum_tarihi && <span>| <strong>D.Tarihi:</strong> {u.dogum_tarihi} </span>}
                          {u.telefon && <span>| <strong>Tel:</strong> {u.telefon}</span>}
                        </div>
                      </div>
                    )}
                    {apptDetail.oyuncular?.map((o: any, i: number) => {
                      if (!o.ad && !o.soyad) return null;
                      return (
                        <div key={i} className="appt-player" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="player-num">{i + 2}</span> 
                            <strong>{o.ad} {o.soyad}</strong>
                          </div>
                          {(o.tc_no || o.dogum_tarihi || o.telefon) && (
                            <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '6px', paddingLeft: '36px' }}>
                              {o.tc_no && <span><strong>T.C:</strong> {o.tc_no} </span>}
                              {o.dogum_tarihi && <span>| <strong>D.Tarihi:</strong> {o.dogum_tarihi} </span>}
                              {o.telefon && <span>| <strong>Tel:</strong> {o.telefon}</span>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="appt-action-row">
                {(!isPast && !readOnly) ? (
                  <>
                    <button className="admin-btn admin-btn-outline" onClick={() => { setPostponeApptId(apptDetail.id); setApptDetail(null); }}>⏩ Öteleme</button>
                    <button className="admin-btn admin-btn-danger" onClick={() => cancelAppt(apptDetail.id)}>🗑 İptal Et</button>
                  </>
                ) : <span style={{ color: 'var(--gray-500)', fontSize: '12px', alignSelf: 'center' }}>📖 Geçmiş randevu — düzenleme devre dışı</span>}
                <span style={{ flex: 1 }}></span>
                {u && !isBanned ? (
                  <button className="admin-btn admin-btn-danger" onClick={() => { setBanTarget({ id: u.id, name: `${u.ad} ${u.soyad}` }); setApptDetail(null); }}>🚫 Yasakla</button>
                ) : (isBanned ? <span style={{ color: '#FF8080', fontSize: '12px', alignSelf: 'center' }}>⚠️ Yasaklı kullanıcı</span> : null)}
              </div>
            </div>
          </div>
        );
      })()}

      {/* --- Postpone Modal --- */}
      {postponeApptId && (
        <div className="admin-overlay">
          <div className="admin-modal" style={{ maxWidth: '460px' }}>
            <button className="admin-modal-close" onClick={() => setPostponeApptId(null)}>✕</button>
            <h2 className="admin-modal-title">⏩ Randevu Öteleme</h2>
            <p className="admin-modal-subtitle">Randevuyu taşımak istediğiniz yeni tarih ve saati seçin.</p>
            <div className="admin-form-group">
              <label className="admin-form-label">Yeni Tarih</label>
              <select className="admin-form-input" value={postponeDate} onChange={e => { setPostponeDate(e.target.value); setPostponeHour(''); }}>
                <option value="">— Tarih Seçin —</option>
                {getPostponeDateOptions().map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
              </select>
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Yeni Saat</label>
              <select className="admin-form-input" value={postponeHour} onChange={e => setPostponeHour(e.target.value)}>
                <option value="">{postponeDate ? '— Saat Seçin —' : '— Önce Tarih Seçin —'}</option>
                {getPostponeHourOptions().map(o => <option key={o.val} value={o.val} disabled={o.disabled}>{o.label}</option>)}
              </select>
            </div>
            <div className="admin-modal-footer">
              <button className="admin-btn admin-btn-outline" onClick={() => setPostponeApptId(null)}>İptal</button>
              <button className="admin-btn admin-btn-primary" style={{ width: 'auto', padding: '10px 28px' }} onClick={confirmPostpone}>✅ Ötelemeyi Onayla</button>
            </div>
          </div>
        </div>
      )}

      {/* --- Ban Modal --- */}
      {banTarget && (
        <div className="admin-overlay">
          <div className="admin-modal" style={{ maxWidth: '440px' }}>
            <button className="admin-modal-close" onClick={() => { setBanTarget(null); setBanReason(''); }}>✕</button>
            <h2 className="admin-modal-title">🚫 Kullanıcıyı Yasakla</h2>
            <p className="admin-modal-subtitle">
              <strong style={{ color: '#FCA5A5' }}>{banTarget.name}</strong> kullanıcısı yasaklanacak.
              Bu kullanıcı artık randevu alamayacak.
            </p>
            {banError && <div className="admin-alert admin-alert-error">{banError}</div>}
            <div className="admin-form-group">
              <label className="admin-form-label">Yasaklama Sebebi (isteğe bağlı)</label>
              <input type="text" className="admin-form-input" placeholder="Sebep giriniz..." value={banReason} onChange={e => setBanReason(e.target.value)} />
            </div>

            <div className="admin-modal-footer">
              <button className="admin-btn admin-btn-outline" onClick={() => { setBanTarget(null); setBanReason(''); }}>İptal</button>
              <button className="admin-btn admin-btn-danger" style={{ width: 'auto', padding: '10px 24px' }} onClick={confirmBan}>🚫 Yasakla</button>
            </div>
          </div>
        </div>
      )}

      {/* --- Banned Users List --- */}
      {bannedModalOpen && (
        <div className="admin-overlay">
          <div className="admin-modal wide">
            <button className="admin-modal-close" onClick={() => setBannedModalOpen(false)}>✕</button>
            <h2 className="admin-modal-title">🚫 Yasaklı Kullanıcılar</h2>
            <p className="admin-modal-subtitle">Sisteme erişimi kısıtlanan kullanıcıların listesi.</p>
            <div>
              {bannedUsers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--gray-600)' }}>Yasaklı kullanıcı bulunmamaktadır.</div>
              ) : (
                bannedUsers.map(b => (
                  <div key={b.id} className="banned-row">
                    <div className="banned-row-header">
                      <div className="banned-name">{b.ad} {b.soyad}</div>
                      <button className="admin-btn admin-btn-green admin-btn-sm" onClick={() => unbanUser(b.id)}>✅ Yasağı Kaldır</button>
                    </div>
                    <div className="banned-email">{b.email}</div>
                    <div className="banned-meta">
                      Sebep: {b.ban_reason || 'Belirtilmedi'}
                      {b.banned_at && (
                        <div style={{ fontSize: '11px', color: 'var(--gray-500)', marginTop: '4px' }}>
                          📅 {new Date(b.banned_at).toLocaleString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} tarihinde yasaklandı.
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- Close Slot Note Modal --- */}
      {closeSlotData && (
        <div className="admin-overlay">
          <div className="admin-modal" style={{ maxWidth: '440px' }}>
            <button className="admin-modal-close" onClick={() => setCloseSlotData(null)}>✕</button>
            <h2 className="admin-modal-title">🔒 {closeSlotData.saat === null ? 'Günü Kapat' : 'Slotu Kapat'}</h2>
            <p className="admin-modal-subtitle">
              Bu slotu kapatmak üzeresiniz. Bir açıklama veya not ekleyebilirsiniz.
            </p>
            <div className="admin-form-group">
              <label className="admin-form-label">Açıklama / Not (isteğe bağlı)</label>
              <textarea 
                className="admin-form-input" 
                placeholder="Örn: Saha bakımı, Özel etkinlik..." 
                value={closeSlotData.note} 
                onChange={e => setCloseSlotData({ ...closeSlotData, note: e.target.value })}
                rows={3}
                style={{ resize: 'none' }}
              />
            </div>

            <div className="admin-modal-footer">
              <button className="admin-btn admin-btn-outline" onClick={() => setCloseSlotData(null)}>İptal</button>
              <button className="admin-btn admin-btn-primary" style={{ width: 'auto', padding: '10px 24px' }} onClick={confirmCloseSlot}>🔒 Kapat</button>
            </div>
          </div>
        </div>
      )}

      {/* --- İptal Onay Modal --- */}
      {confirmCancelId && (
        <div className="admin-overlay" style={{ zIndex: 3000 }}>
          <div className="admin-modal" style={{ maxWidth: '400px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚠️</div>
            <h3 className="admin-modal-title" style={{ marginBottom: '8px', textAlign: 'center' }}>Randevuyu İptal Et</h3>
            <p className="admin-modal-subtitle" style={{ marginBottom: '24px', textAlign: 'center' }}>
              Bu randevuyu iptal etmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button className="admin-btn admin-btn-outline" onClick={() => setConfirmCancelId(null)} disabled={actionLoading} style={{ flex: 1 }}>Vazgeç</button>
              <button className="admin-btn admin-btn-danger" onClick={executeCancel} disabled={actionLoading} style={{ flex: 1 }}>
                {actionLoading ? 'İptal Ediliyor...' : '🗑️ Evet, İptal Et'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Sürükle-Bırak Öteleme Onay Modal --- */}
      {confirmDropData && (
        <div className="admin-overlay" style={{ zIndex: 3000 }}>
          <div className="admin-modal" style={{ maxWidth: '400px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔄</div>
            <h3 className="admin-modal-title" style={{ marginBottom: '8px', textAlign: 'center' }}>Randevuyu Ötele</h3>
            <p className="admin-modal-subtitle" style={{ marginBottom: '24px', textAlign: 'center' }}>
              Randevuyu bu saate ötelemek istediğinizden emin misiniz?
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button className="admin-btn admin-btn-outline" onClick={() => { setConfirmDropData(null); setDragApptId(null); }} disabled={actionLoading} style={{ flex: 1 }}>Vazgeç</button>
              <button className="admin-btn admin-btn-primary" onClick={executeDrop} disabled={actionLoading} style={{ flex: 1 }}>
                {actionLoading ? 'Öteleniyor...' : '🔄 Evet, Ötele'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* --- Backup & Purge Modal --- */}
      {backupModalOpen && (
        <div className="admin-overlay" style={{ zIndex: 2500 }}>
          <div className="admin-modal" style={{ maxWidth: '520px' }}>
            <button className="admin-modal-close" onClick={() => { if (!actionLoading && !backupLoading && !verifyingPassword) setBackupModalOpen(false); }}>✕</button>
            <h2 className="admin-modal-title">💾 Randevu Yedekleme ve Temizleme</h2>

            {!passwordVerified ? (
              <form onSubmit={handleVerifyPassword} style={{ marginTop: '20px' }}>
                <p className="admin-modal-subtitle">
                  Güvenlik Doğrulaması: Bu işlem veritabanından veri silinmesini içerir. Lütfen yönetici şifrenizi giriniz.
                </p>
                <div className="admin-form-group" style={{ marginTop: '16px' }}>
                  <label className="admin-form-label">🔑 Yönetici Şifresi</label>
                  <input 
                    type="password" 
                    className="admin-form-input" 
                    placeholder="Şifrenizi giriniz..." 
                    value={authPassword} 
                    onChange={e => setAuthPassword(e.target.value)}
                    disabled={verifyingPassword}
                    required
                  />
                </div>
                {passwordError && (
                  <div className="admin-alert admin-alert-error" style={{ marginTop: '12px' }}>
                    {passwordError}
                  </div>
                )}
                <div className="admin-modal-footer" style={{ marginTop: '24px' }}>
                  <button type="button" className="admin-btn admin-btn-outline" onClick={() => setBackupModalOpen(false)} disabled={verifyingPassword}>İptal</button>
                  <button type="submit" className="admin-btn admin-btn-primary" style={{ width: 'auto', padding: '10px 24px' }} disabled={verifyingPassword}>
                    {verifyingPassword ? 'Doğrulanıyor...' : '🔑 Onayla ve Devam Et'}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <p className="admin-modal-subtitle">
                  Geçmiş randevuları resmi dilekçe formatında A4 PDF olarak yedekleyebilir ve ardından veritabanından kalıcı olarak temizleyebilirsiniz.
                </p>

                {!backupSuccess ? (
                  <>
                    <div className="admin-form-group" style={{ marginTop: '20px' }}>
                      <label className="admin-form-label">Yedeklenecek Zaman Aralığı</label>
                      <select 
                        className="admin-form-input" 
                        value={backupRange} 
                        onChange={e => setBackupRange(e.target.value)}
                        disabled={backupLoading}
                      >
                        <option value="1_month">Son 1 Ay</option>
                        <option value="3_months">Son 3 Ay</option>
                        <option value="6_months">Son 6 Ay</option>
                        <option value="1_year">Son 1 Yıl</option>
                        <option value="all">Tüm Zamanlar</option>
                      </select>
                    </div>

                    <div className="admin-alert" style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#FBBF24', fontSize: '12px', marginTop: '16px', lineHeight: '1.5' }}>
                      💡 <strong>Nasıl Çalışır?</strong><br />
                      1. Tarih aralığını seçin ve <strong>"Yedek Oluştur ve Yazdır (PDF)"</strong> butonuna tıklayın.<br />
                      2. Tarayıcının yazdırma penceresinde <strong>"PDF olarak Kaydet"</strong> seçeneğini seçerek yedek dosyasını bilgisayarınıza kaydedin.<br />
                      3. Kaydetme işlemi tamamlandıktan sonra bu ekranda beliren silme butonunu kullanarak veritabanını temizleyin.
                    </div>

                    <div className="admin-modal-footer" style={{ marginTop: '24px' }}>
                      <button 
                        className="admin-btn admin-btn-outline" 
                        onClick={() => setBackupModalOpen(false)} 
                        disabled={backupLoading}
                      >
                        Kapat
                      </button>
                      <button 
                        className="admin-btn admin-btn-primary" 
                        style={{ width: 'auto', padding: '10px 24px' }} 
                        onClick={handleBackup}
                        disabled={backupLoading}
                      >
                        {backupLoading ? '🔍 Veriler Sorgulanıyor...' : '📄 Yedek Oluştur ve Yazdır (PDF)'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="admin-alert admin-alert-error" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5', fontSize: '13px', marginTop: '16px', lineHeight: '1.5' }}>
                      ⚠️ <strong>Yedek Raporu Oluşturuldu!</strong><br />
                      Lütfen tarayıcı yazdırma penceresinden PDF yedek dosyasını bilgisayarınıza <strong>başarıyla kaydettiğinizden emin olun</strong>.<br /><br />
                      Eğer dosya başarıyla indiyse, aşağıdaki butona tıklayarak yedeklenen <strong>{backedUpAppointments.length} adet geçmiş randevuyu</strong> veritabanından kalıcı olarak silebilirsiniz. <strong>Bu işlem geri alınamaz!</strong>
                    </div>

                    <div style={{ maxHeight: '180px', overflowY: 'auto', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12px', margin: '14px 0' }}>
                      <strong>Yedeklenen Randevular ({backedUpAppointments.length} adet):</strong>
                      <ul style={{ paddingLeft: '18px', marginTop: '6px', marginBottom: '0', color: 'var(--gray-300)' }}>
                        {backedUpAppointments.slice(0, 10).map((a, i) => (
                          <li key={i}>📅 {a.tarih} — Saat {String(a.saat).padStart(2, '0')}:00 ({a.kategori === 'basketbol' ? '🏀 Basketbol' : '🏐 Voleybol'})</li>
                        ))}
                        {backedUpAppointments.length > 10 && <li>... ve {backedUpAppointments.length - 10} adet daha.</li>}
                      </ul>
                    </div>

                    <div className="admin-modal-footer" style={{ marginTop: '24px' }}>
                      <button 
                        className="admin-btn admin-btn-outline" 
                        onClick={() => { setBackupSuccess(false); setBackedUpAppointments([]); }} 
                        disabled={actionLoading}
                      >
                        🔄 Yeniden Yedekle
                      </button>
                      <button 
                        className="admin-btn admin-btn-danger" 
                        style={{ width: 'auto', padding: '10px 24px', background: 'var(--red)', color: 'white' }} 
                        onClick={executePurge}
                        disabled={actionLoading}
                      >
                        {actionLoading ? '🧹 Temizleniyor...' : '🗑️ Evet, Yedeklenen Randevuları Sil'}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* --- Toast --- */}
      <div className={`admin-toast admin-toast-${toast.type} ${toast.show ? 'show' : ''}`}>
        {toast.msg}
      </div>
    </div>
  );
}
