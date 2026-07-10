import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { TURKISH_DAYS, TURKISH_MONTHS, formatDate, isBookingEnabled, getActiveWeekMonday, validateTC, formatSlotStartHour } from '@/utils/constants';

export default function BookingModal({ 
  isOpen, 
  onClose, 
  selectedDate, 
  selectedHour, 
  user,
  appointments = [],
  onSuccess,
  showToast
}: { 
  isOpen: boolean;
  onClose: () => void;
  selectedDate: Date | null;
  selectedHour: number | null;
  user: any;
  appointments?: any[];
  onSuccess: () => void;
  showToast: (msg: string, type?: string) => void;
}) {
  const [step, setStep] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<{ad: string, soyad: string, tc_no: string, dogum_tarihi: string, telefon: string}[]>([]);
  const [bookingLoading, setBookingLoading] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSelectedCategory(null);
      setTeamMembers([]);
    }
  }, [isOpen]);

  const userHasApptInWeek = useMemo(() => {
    const monday = getActiveWeekMonday();
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    
    const startStr = formatDate(monday);
    const endStr = formatDate(sunday);
    
    return appointments.some(a => a.user_id === user?.id && a.tarih >= startStr && a.tarih <= endStr);
  }, [appointments, user?.id]);

  if (!isOpen || !selectedDate || selectedHour === null) return null;

  const dateStr = formatDate(selectedDate);
  const displayDate = `${selectedDate.getDate()} ${TURKISH_MONTHS[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`;
  const dayName = TURKISH_DAYS[selectedDate.getDay()];

  const handleSelectCategory = (category: string) => {
    if (userHasApptInWeek) return;
    setSelectedCategory(category);
    const extraCount = category === 'voleybol' ? 11 : 9;
    setTeamMembers(Array.from({ length: extraCount }, () => ({ ad: '', soyad: '', tc_no: '', dogum_tarihi: '', telefon: '' })));
    setStep(2);
  };

  const confirmBooking = async () => {
    if (!selectedCategory || !user) return;
    
    // Server-side'da da kontrol var ama client-side de uyaralım
    if (!isBookingEnabled()) {
      showToast('⏳ Randevular henüz açılmadı! Saat 09:00\'da aktif olacak.', 'error');
      return;
    }

    const filledMembers = teamMembers.filter(m => m.ad.trim() !== '' && m.soyad.trim() !== '' && m.tc_no.trim() !== '' && m.dogum_tarihi.trim() !== '' && m.telefon.trim() !== '');
    if (filledMembers.length < 7) {
      showToast('En az 8 kişinin tüm bilgilerinin eksiksiz girilmesi zorunludur.', 'error');
      return;
    }

    const allTcs = [user?.tc_no, ...filledMembers.map(m => m.tc_no)].filter(Boolean);
    const uniqueTcs = new Set(allTcs);
    if (uniqueTcs.size !== allTcs.length) {
      showToast('Aynı T.C. Kimlik numarası takımda birden fazla kez kullanılamaz.', 'error');
      return;
    }

    const invalidTcMember = filledMembers.find(m => !validateTC(m.tc_no));
    if (invalidTcMember || (user?.tc_no && !validateTC(user.tc_no))) {
      showToast('Lütfen geçerli bir T.C. Kimlik numarası giriniz.', 'error');
      return;
    }
    
    setBookingLoading(true);
    
    try {
      // UUID oluşturma (Idempotency Key için)
      const idempotencyKey = crypto.randomUUID();

      // Önce slotun kapalı olup olmadığını kontrol edelim (Yarış durumuna karşı ek önlem)
      const { data: isClosed } = await supabase
        .from('closed_slots')
        .select('id')
        .eq('tarih', dateStr)
        .eq('saat', selectedHour)
        .maybeSingle();

      if (isClosed) {
        showToast('Bu slot yönetici tarafından kapatılmıştır.', 'error');
        setBookingLoading(false);
        return;
      }

      // Randevu oluşturma (RLS ve Unique Constraint sayesinde güvenli)
      const { data, error } = await supabase
        .from('appointments')
        .insert([
          {
            user_id: user.id,
            tarih: dateStr,
            saat: selectedHour,
            kategori: selectedCategory,
            oyuncular: teamMembers,
            idempotency_key: idempotencyKey,
          },
        ])
        .select()
        .single();

      if (error) {
        // Çifte rezervasyon hatası (Unique Constraint: 23505)
        if (error.code === '23505') {
          showToast('Bu saat dilimi zaten rezerve edilmiş.', 'error');
        } else if (error.message.includes('bir randevu alabilirsiniz')) {
          showToast(error.message, 'error');
        } else {
          showToast(error.message || 'Randevu oluşturulurken bir hata oluştu.', 'error');
        }
        setBookingLoading(false);
        return;
      }

      // Broadcast the change to sync all clients securely
      const channel = supabase.channel('public-sync');
      await channel.send({ type: 'broadcast', event: 'refetch_data', payload: {} });
      supabase.removeChannel(channel);

      onSuccess();
      showToast('🎉 Randevunuz başarıyla oluşturuldu!', 'success');
    } catch (err: any) {
      console.error('Booking Error:', err);
      showToast('Bir hata oluştu. Lütfen tekrar deneyin.', 'error');
    } finally {
      setBookingLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => !bookingLoading && onClose()}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} disabled={bookingLoading}>✕</button>
        <h2 className="modal-title">Randevu Oluştur</h2>
        <p className="modal-subtitle">{dayName}, {displayDate} — {formatSlotStartHour(selectedHour)}</p>
        
        <div className="steps-indicator">
          <div className={`step ${step >= 1 ? 'active' : ''}`}><div className="step-circle">1</div><span>Branş</span></div>
          <div className={`step-line ${step >= 2 ? 'active' : ''}`}></div>
          <div className={`step ${step >= 2 ? 'active' : ''}`}><div className="step-circle">2</div><span>Takım</span></div>
        </div>

        {step === 1 && (
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '14px', color: 'var(--text-dark)' }}>Branş Seçin</h3>
            
            {userHasApptInWeek ? (
              <div className="appt-conflict-notice">
                <div className="notice-icon">⚠️</div>
                <div className="notice-text">
                  <strong>Zaten bir randevunuz var!</strong>
                  <p>Mevcut haftada zaten bir randevunuz bulunuyor. Haftada yalnızca bir randevu alabilirsiniz. Lütfen mevcut randevunuzu düzenleyin veya iptal edin.</p>
                </div>
              </div>
            ) : (
              <div className="category-grid">
                <div className={`category-card ${selectedCategory === 'basketbol' ? 'active' : ''}`} onClick={() => handleSelectCategory('basketbol')}>
                  <div className="category-icon">🏀</div>
                  <div className="category-name">Basketbol</div>
                </div>
                <div className={`category-card ${selectedCategory === 'voleybol' ? 'active' : ''}`} onClick={() => handleSelectCategory('voleybol')}>
                  <div className="category-icon">🏐</div>
                  <div className="category-name">Voleybol</div>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '14px', color: 'var(--text-dark)' }}>Takım Listesi ({selectedCategory === 'basketbol' ? '10' : '12'} Kişi)</h3>
            <div style={{ marginBottom: '15px', padding: '8px 12px', backgroundColor: '#fff3cd', border: '1px solid #ffe69c', color: '#664d03', borderRadius: '6px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>⚠️</span>
              <span>En az 8 kişinin tüm bilgilerinin eksiksiz girilmesi zorunludur.</span>
            </div>
            <div className="team-list">
              <div className="team-member-card row-owner">
                <div className="team-member-card-header">
                  <div className="team-member-number">1</div>
                  <span>{user?.ad} {user?.soyad} (Kaptan)</span>
                </div>
                <div className="team-member-card-body">
                  <input type="text" value={user?.ad || ''} readOnly className="form-input readonly" placeholder="Ad" />
                  <input type="text" value={user?.soyad || ''} readOnly className="form-input readonly" placeholder="Soyad" />
                  <input type="text" value={user?.tc_no || ''} readOnly className="form-input readonly" placeholder="T.C. Kimlik" />
                  <input type="date" value={user?.dogum_tarihi || ''} readOnly className="form-input readonly" />
                  <input type="tel" value={user?.telefon || ''} readOnly className="form-input readonly full-width" placeholder="Telefon" />
                </div>
              </div>
              {teamMembers.map((member, i) => (
                <div className="team-member-card" key={i}>
                  <div className="team-member-card-header">
                    <div className="team-member-number">{i + 2}</div>
                    <span>Oyuncu {i + 2}</span>
                  </div>
                  <div className="team-member-card-body">
                    <input type="text" placeholder="Ad" value={member.ad} className="form-input" onChange={e => { 
                      const newT = [...teamMembers]; newT[i] = { ...newT[i], ad: e.target.value }; setTeamMembers(newT); 
                    }} />
                    <input type="text" placeholder="Soyad" value={member.soyad} className="form-input" onChange={e => { 
                      const newT = [...teamMembers]; newT[i] = { ...newT[i], soyad: e.target.value }; setTeamMembers(newT); 
                    }} />
                    <input type="text" placeholder="T.C. Kimlik" value={member.tc_no} maxLength={11} className="form-input" onChange={e => { 
                      const val = e.target.value.replace(/\D/g, '').slice(0, 11);
                      const newT = [...teamMembers]; newT[i] = { ...newT[i], tc_no: val }; setTeamMembers(newT); 
                    }} />
                    <input type="date" placeholder="Doğum Tarihi" value={member.dogum_tarihi} className="form-input" onChange={e => { 
                      const newT = [...teamMembers]; newT[i] = { ...newT[i], dogum_tarihi: e.target.value }; setTeamMembers(newT); 
                    }} />
                    <input type="tel" placeholder="Telefon 0(5XX)" value={member.telefon} maxLength={11} className="form-input full-width" onChange={e => { 
                      let val = e.target.value.replace(/\D/g, '').slice(0, 11);
                      if(val && !val.startsWith('0')) val = '0' + val.slice(0, 10);
                      const newT = [...teamMembers]; newT[i] = { ...newT[i], telefon: val }; setTeamMembers(newT); 
                    }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setStep(1)} disabled={bookingLoading}>Geri</button>
              <button className="btn btn-primary" onClick={confirmBooking} disabled={bookingLoading}>{bookingLoading ? 'İşleniyor...' : '✅ Onayla'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
