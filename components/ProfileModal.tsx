import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';

export default function ProfileModal({
  isOpen,
  onClose,
  user,
  onSuccess,
  showToast
}: {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  onSuccess: () => void;
  showToast: (msg: string, type?: string) => void;
}) {
  const [profileData, setProfileData] = useState({ ad: '', soyad: '', dogum_tarihi: '', telefon: '', email: '' });
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    if (isOpen && user) {
      setProfileData({
        ad: user.ad || '',
        soyad: user.soyad || '',
        dogum_tarihi: user.dogum_tarihi || '',
        telefon: user.telefon || '',
        email: user.email || ''
      });
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  const saveProfile = async () => {
    if (!user) return;
    setLoading(true);
    
    // Güvenlik: Sadece izin verilen alanları (ad, soyad, telefon) güncelleriz. 
    // Email veya yasaklanma durumu değiştirilemez.
    const { error } = await supabase.from('profiles').update({
      ad: profileData.ad,
      soyad: profileData.soyad,
      telefon: profileData.telefon
    }).eq('id', user.id);

    setLoading(false);

    if (error) { 
      showToast('Hata: ' + error.message, 'error'); 
      return; 
    }
    
    onSuccess();
    showToast('Profiliniz güncellendi.', 'success');
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <button className="modal-close" onClick={onClose} disabled={loading}>✕</button>
        <h2 className="modal-title">👤 Hesabım</h2>
        <p className="modal-subtitle">Kişisel bilgilerinizi görüntüleyin ve güncelleyin.</p>
        <div className="form-grid">
          <div className="form-group">
            <label>Ad</label>
            <input type="text" className="form-input" value={profileData.ad} onChange={e => setProfileData({...profileData, ad: e.target.value})} disabled={loading} />
          </div>
          <div className="form-group">
            <label>Soyad</label>
            <input type="text" className="form-input" value={profileData.soyad} onChange={e => setProfileData({...profileData, soyad: e.target.value})} disabled={loading} />
          </div>
          <div className="form-group">
            <label>Doğum Tarihi</label>
            <input type="text" className="form-input readonly" readOnly value={profileData.dogum_tarihi} />
          </div>
          <div className="form-group">
            <label>Telefon</label>
            <input type="text" className="form-input" value={profileData.telefon} onChange={e => setProfileData({...profileData, telefon: e.target.value})} disabled={loading} />
          </div>
          <div className="form-group">
            <label>E-posta</label>
            <input type="email" className="form-input readonly" readOnly value={profileData.email} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose} disabled={loading}>İptal</button>
          <button className="btn btn-primary" onClick={saveProfile} disabled={loading}>
            {loading ? 'İşleniyor...' : '💾 Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}
