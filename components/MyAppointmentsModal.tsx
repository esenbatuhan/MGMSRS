import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { TURKISH_DAYS, TURKISH_MONTHS, formatSlotTimeRange } from '@/utils/constants';

function isEditable(tarihStr: string, saatInt: number) {
  const now = new Date();
  const apptDate = new Date(tarihStr);
  apptDate.setHours(saatInt, 0, 0, 0);
  const cutoff = new Date(apptDate.getTime() - 3 * 60 * 60 * 1000); // 3 saat
  return now < cutoff;
}

function isCancellable(tarihStr: string, saatInt: number) {
  const now = new Date();
  const apptDate = new Date(tarihStr);
  apptDate.setHours(saatInt, 0, 0, 0);
  const cutoff = new Date(apptDate.getTime() - 12 * 60 * 60 * 1000); // 12 saat
  return now < cutoff;
}

export default function MyAppointmentsModal({
  isOpen,
  onClose,
  appointments = [],
  user,
  onSuccess,
  showToast,
  onOpenEditAppt
}: {
  isOpen: boolean;
  onClose: () => void;
  appointments: any[];
  user: any;
  onSuccess: () => void;
  showToast: (msg: string, type?: string) => void;
  onOpenEditAppt: (appt: any) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [archivedAppts, setArchivedAppts] = useState<any[]>([]);
  const [loadingArchive, setLoadingArchive] = useState(false);

  useEffect(() => {
    if (!isOpen || !user?.id) return;
    const loadUserArchive = async () => {
      setLoadingArchive(true);
      const filePath = `user_archives/${user.id}.json`;
      try {
        const { data: fileData } = await supabase.storage
          .from('randevu-arsivleri')
          .download(filePath);
        if (fileData) {
          const text = await fileData.text();
          setArchivedAppts(JSON.parse(text) || []);
        } else {
          setArchivedAppts([]);
        }
      } catch (e) {
        // Silinmiş veya henüz oluşmamış arşivler için hata basmadan boş liste ata
        setArchivedAppts([]);
      } finally {
        setLoadingArchive(false);
      }
    };
    loadUserArchive();
  }, [isOpen, user?.id, supabase]);

  const myAppointmentsList = useMemo(() => {
    if (!Array.isArray(appointments) || !user) return [];
    
    const activeAppts = appointments.filter(a => a && a.user_id === user.id);
    const archivedApptsWithFlag = archivedAppts.map(a => ({ ...a, is_archived: true }));
    const allAppts = [...activeAppts];
    
    archivedApptsWithFlag.forEach(archived => {
      if (!allAppts.some(active => active.id === archived.id)) {
        allAppts.push(archived);
      }
    });

    return allAppts.sort((a, b) => {
      // Öncelik: En son alınan (oluşturulma tarihi) en üstte
      if (a.created_at && b.created_at) {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      // Fallback: Tarih ve saate göre azalan (en ileri tarihli en üstte)
      const dateA = a.tarih ? new Date(a.tarih + 'T' + String(a.saat || 0).padStart(2, '0') + ':00').getTime() : 0;
      const dateB = b.tarih ? new Date(b.tarih + 'T' + String(b.saat || 0).padStart(2, '0') + ':00').getTime() : 0;
      return dateB - dateA;
    });
  }, [appointments, archivedAppts, user?.id]);

  if (!isOpen || !user) return null;

  const handleCancelClick = (appt: any) => {
    if (!isCancellable(appt.tarih, appt.saat)) {
      showToast('Randevuya 12 saatten az kaldığı için iptal edilemez!', 'error');
      return;
    }
    setConfirmingId(appt.id);
  };

  const confirmCancel = async () => {
    if (!confirmingId) return;
    const appt = myAppointmentsList.find(a => a.id === confirmingId);
    if (!appt) return;

    setCancelling(true);
    try {
      const { error } = await supabase.from('appointments').delete().eq('id', appt.id);

      if (error) {
        console.error('Cancellation error:', error);
        showToast('Hata: ' + error.message, 'error');
        return;
      }

      const channel = supabase.channel('public-sync');
      await channel.send({ type: 'broadcast', event: 'refetch_data', payload: {} });
      supabase.removeChannel(channel);

      onSuccess();
      showToast('Randevu başarıyla iptal edildi.', 'success');
    } catch (err: any) {
      console.error('Cancellation catch error:', err);
      showToast('Bir hata oluştu. Lütfen tekrar deneyin.', 'error');
    } finally {
      setCancelling(false);
      setConfirmingId(null);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: '660px' }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2 className="modal-title">📅 Randevularım</h2>
        <p className="modal-subtitle">Almış olduğunuz saha randevuları aşağıda listelenmiştir.</p>
        <div>
          {myAppointmentsList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--gray-400)', fontSize: '15px' }}>Henüz hiç randevunuz yok.</div>
          ) : (
            myAppointmentsList.map(a => {
              if (!a.tarih || a.saat === undefined) return null;
              
              const [y, m, d] = a.tarih.split('-');
              const tarihLabel = `${d} ${TURKISH_MONTHS[parseInt(m) - 1]} ${y}`;
              const gunLabel = TURKISH_DAYS[new Date(a.tarih).getDay()];
              const isPast = new Date(a.tarih + 'T' + String(a.saat).padStart(2, '0') + ':00') < new Date();

              return (
                <div key={a.id} className={`randevu-card ${a.is_archived || isPast ? 'randevu-past' : 'randevu-upcoming'}`}>
                  <div className="randevu-card-top">
                    <div className="randevu-card-left">
                      <div className="randevu-date">{tarihLabel}</div>
                      <div className="randevu-day">{gunLabel}</div>
                    </div>
                    <div className="randevu-card-body">
                      <div className="randevu-time">⏰ {formatSlotTimeRange(a.saat, a.tarih)}</div>
                      <div className="randevu-cat">{a.kategori === 'basketbol' ? '🏀 Basketbol' : '🏐 Voleybol'}</div>
                    </div>
                    <div className={`randevu-badge ${a.is_archived ? 'badge-archive' : (isPast ? 'badge-past' : 'badge-upcoming')}`}>
                      {a.is_archived ? 'Arşivlenmiş' : (isPast ? 'Geçmiş' : 'Yakında')}
                    </div>
                  </div>
                  {(!isPast && !a.is_archived) && (
                    <div className="randevu-actions-container">
                      {user?.is_banned ? (
                        <div style={{ fontSize: '12px', color: '#FF8080', padding: '10px 12px', background: 'rgba(227,10,23,0.1)', border: '1px solid rgba(227,10,23,0.3)', borderRadius: '8px', fontWeight: 600 }}>
                          🚫 Hesabınız askıya alındığı için düzenleme ve iptal işlemleri yapılamaz.
                        </div>
                      ) : (
                        <>
                          <div style={{ fontSize: '12px', color: 'var(--gray-600)', marginBottom: '12px', padding: '10px 12px', background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: '8px' }}>
                            ℹ️ <strong>Bilgi:</strong> Randevunuza son <strong>12 saat</strong> kalana kadar iptal işlemi yapabilir, son <strong>3 saat</strong> kalana kadar takım kadronuzu düzenleyebilirsiniz.
                          </div>
                          <div className="randevu-actions">
                            {isEditable(a.tarih, a.saat) ? (
                              <button className="btn-randevu-edit" onClick={() => onOpenEditAppt(a)}>✏️ Düzenle</button>
                            ) : (
                              <button className="btn-randevu-edit" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }} title="Son 3 saat — kadro kilitlendi">🔒 Kadro Kilitlendi</button>
                            )}
                            {isCancellable(a.tarih, a.saat) ? (
                              <button className="btn-randevu-cancel" onClick={() => handleCancelClick(a)}>🗑️ İptal Et</button>
                            ) : (
                              <button className="btn-randevu-cancel" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }} title="Son 12 saat — iptal kilitlendi">🔒 İptal Süresi Doldu</button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* İptal Onay Diyaloğu */}
      {confirmingId && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div className="modal" style={{ maxWidth: '400px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚠️</div>
            <h3 className="modal-title" style={{ marginBottom: '8px', textAlign: 'center' }}>Randevuyu İptal Et</h3>
            <p className="modal-subtitle" style={{ marginBottom: '24px', textAlign: 'center' }}>
              Bu randevunuzu iptal etmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                className="btn btn-outline"
                onClick={() => setConfirmingId(null)}
                disabled={cancelling}
                style={{ flex: 1 }}
              >
                Vazgeç
              </button>
              <button
                className="btn btn-primary"
                onClick={confirmCancel}
                disabled={cancelling}
                style={{ flex: 1, background: 'var(--red)' }}
              >
                {cancelling ? 'İptal Ediliyor...' : '🗑️ Evet, İptal Et'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
