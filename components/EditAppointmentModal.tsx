import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { TURKISH_DAYS, TURKISH_MONTHS, formatDate, getActiveWeekMonday, isBookingEnabled, getWeekDaysFromMonday } from '@/utils/constants';



function isEditable(tarihStr: string, saatInt: number) {
  const now = new Date();
  const apptDate = new Date(tarihStr);
  apptDate.setHours(saatInt, 0, 0, 0);
  const cutoff = new Date(apptDate.getTime() - 3 * 60 * 60 * 1000); // 3 saat
  return now < cutoff;
}

export default function EditAppointmentModal({
  isOpen,
  onClose,
  appointment,
  user,
  appointments = [],
  closedSlots = {},
  onSuccess,
  showToast
}: {
  isOpen: boolean;
  onClose: () => void;
  appointment: any;
  user: any;
  appointments?: any[];
  closedSlots?: any;
  onSuccess: () => void;
  showToast: (msg: string, type?: string) => void;
}) {
  const [teamMembers, setTeamMembers] = useState<{ad: string, soyad: string, tc_no?: string, dogum_tarihi?: string, telefon?: string}[]>([]);
  const [loading, setLoading] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (isOpen && appointment) {
      const extraCount = appointment.kategori === 'voleybol' ? 11 : 9;
      let members = appointment.oyuncular || [];
      
      // Ensure array is correct size
      if (members.length < extraCount) {
        members = [...members, ...Array.from({ length: extraCount - members.length }, () => ({ ad: '', soyad: '', tc_no: '', dogum_tarihi: '', telefon: '' }))];
      } else if (members.length > extraCount) {
        members = members.slice(0, extraCount);
      }
      
      setTeamMembers(members);
    }
  }, [isOpen, appointment]);

  if (!isOpen || !appointment) return null;

  const editable = isEditable(appointment.tarih, appointment.saat);

  const saveEditAppt = async () => {
    if (!appointment.id) return;
    
    setLoading(true);
    
    try {
      // Sadece oyuncuları güncelle
      const { error } = await supabase
        .from('appointments')
        .update({
          oyuncular: teamMembers
        })
        .eq('id', appointment.id);

      if (error) {
        showToast(error.message || 'Güncelleme sırasında bir hata oluştu.', 'error');
        setLoading(false);
        return;
      }

      onSuccess();
      showToast('Takım listesi başarıyla güncellendi.', 'success');
      onClose();
    } catch (err: any) {
      console.error('Update Error:', err);
      showToast('Bir hata oluştu. Lütfen tekrar deneyin.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const [y, m, d] = appointment.tarih.split('-');
  const displayDate = `${d} ${TURKISH_MONTHS[parseInt(m) - 1]} ${y} ${TURKISH_DAYS[new Date(appointment.tarih).getDay()]}`;

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: '620px' }}>
        <button className="modal-close" onClick={onClose} disabled={loading}>✕</button>
        <h2 className="modal-title">✏️ Kadroyu Düzenle</h2>
        
        <div className="modal-subtitle" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', padding: '12px', background: 'var(--gray-50)', borderRadius: '8px', border: '1px solid var(--gray-200)' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '13px', color: 'var(--gray-500)', fontWeight: 500, textTransform: 'uppercase' }}>Randevu Bilgisi</span>
            <span style={{ fontSize: '16px', color: 'var(--gray-800)', fontWeight: 600 }}>
              {displayDate} — {String(appointment.saat).padStart(2, '0')}:00
            </span>
          </div>
          <div style={{ width: '1px', height: '30px', background: 'var(--gray-300)' }}></div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '13px', color: 'var(--gray-500)', fontWeight: 500, textTransform: 'uppercase' }}>Kategori</span>
            <span style={{ fontSize: '16px', color: 'var(--gray-800)', fontWeight: 600 }}>
              {appointment.kategori === 'basketbol' ? '🏀 Basketbol' : '🏐 Voleybol'}
            </span>
          </div>
        </div>
        
        {!editable && (
          <div className="team-locked-notice">
            🔒 Randevuya 3 saatten az kaldığı için takım listesi düzenlenemez.
          </div>
        )}

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
                <input type="text" placeholder="Ad" value={member.ad || ''} readOnly={!editable || loading} className={`form-input ${!editable ? 'readonly' : ''}`} onChange={e => { if(editable) { const newT = [...teamMembers]; newT[i] = { ...newT[i], ad: e.target.value }; setTeamMembers(newT); } }} />
                <input type="text" placeholder="Soyad" value={member.soyad || ''} readOnly={!editable || loading} className={`form-input ${!editable ? 'readonly' : ''}`} onChange={e => { if(editable) { const newT = [...teamMembers]; newT[i] = { ...newT[i], soyad: e.target.value }; setTeamMembers(newT); } }} />
                <input type="text" placeholder="T.C. Kimlik" value={member.tc_no || ''} maxLength={11} readOnly={!editable || loading} className={`form-input ${!editable ? 'readonly' : ''}`} onChange={e => { 
                  if(editable) { 
                    const val = e.target.value.replace(/\D/g, '').slice(0, 11);
                    const newT = [...teamMembers]; newT[i] = { ...newT[i], tc_no: val }; setTeamMembers(newT); 
                  } 
                }} />
                <input type="date" placeholder="Doğum Tarihi" value={member.dogum_tarihi || ''} readOnly={!editable || loading} className={`form-input ${!editable ? 'readonly' : ''}`} onChange={e => { 
                  if(editable) { 
                    const newT = [...teamMembers]; newT[i] = { ...newT[i], dogum_tarihi: e.target.value }; setTeamMembers(newT); 
                  } 
                }} />
                <input type="tel" placeholder="Telefon 0(5XX)" value={member.telefon || ''} maxLength={11} readOnly={!editable || loading} className={`form-input full-width ${!editable ? 'readonly' : ''}`} onChange={e => { 
                  if(editable) { 
                    let val = e.target.value.replace(/\D/g, '').slice(0, 11);
                    if(val && !val.startsWith('0')) val = '0' + val.slice(0, 10);
                    const newT = [...teamMembers]; newT[i] = { ...newT[i], telefon: val }; setTeamMembers(newT); 
                  } 
                }} />
              </div>
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose} disabled={loading}>İptal</button>
          {editable && (
            <button className="btn btn-primary" onClick={saveEditAppt} disabled={loading}>
              {loading ? 'Kaydediliyor...' : '💾 Kaydet'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
