'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 1) return digits;
  if (digits.length <= 4) return `${digits[0]}(${digits.slice(1)}`;
  if (digits.length <= 7) return `${digits[0]}(${digits.slice(1, 4)}) ${digits.slice(4)}`;
  if (digits.length <= 9) return `${digits[0]}(${digits.slice(1, 4)}) ${digits.slice(4, 7)} ${digits.slice(7)}`;
  return `${digits[0]}(${digits.slice(1, 4)}) ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
}

function getRawPhone(formatted: string): string {
  return formatted.replace(/\D/g, '');
}

function validateTC(tc: string): boolean {
  if (!/^[1-9][0-9]{10}$/.test(tc)) return false;
  const digits = tc.split('').map(Number);
  
  const sumOdd = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
  const sumEven = digits[1] + digits[3] + digits[5] + digits[7];
  
  const digit10 = (sumOdd * 7 - sumEven) % 10;
  if ((digit10 + 10) % 10 !== digits[9]) return false;
  
  const sumFirst10 = digits.slice(0, 10).reduce((a, b) => a + b, 0);
  if (sumFirst10 % 10 !== digits[10]) return false;
  
  return true;
}

export default function RegisterPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [phone, setPhone] = useState('');
  const [kvkkAccepted, setKvkkAccepted] = useState(false);
  const [hasReadKvkk, setHasReadKvkk] = useState(false);
  const [hasReadInfo, setHasReadInfo] = useState(false);
  const [showKvkkModal, setShowKvkkModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData(e.currentTarget);
    const email = (formData.get('email') as string)?.trim();
    const password = (formData.get('password') as string);
    const confirmPassword = (formData.get('confirmPassword') as string);
    const firstName = (formData.get('firstName') as string)?.trim();
    const lastName = (formData.get('lastName') as string)?.trim();
    const phoneRaw = getRawPhone(phone);
    const birthDate = formData.get('birthDate') as string;
    const tcNo = (formData.get('tcNo') as string)?.trim();

    // Sequential Validation
    if (!firstName) {
      setError('Lütfen adınızı giriniz.');
      setLoading(false);
      return;
    }
    if (!lastName) {
      setError('Lütfen soyadınızı giriniz.');
      setLoading(false);
      return;
    }
    if (!birthDate) {
      setError('Lütfen doğum tarihinizi seçiniz.');
      setLoading(false);
      return;
    }

    const selectedDate = new Date(birthDate);
    const today = new Date();
    const minDate = new Date();
    minDate.setFullYear(minDate.getFullYear() - 100);

    if (selectedDate > today) {
      setError('Doğum tarihi bugünden büyük olamaz.');
      setLoading(false);
      return;
    }
    if (selectedDate < minDate) {
      setError('Geçersiz doğum tarihi.');
      setLoading(false);
      return;
    }
    if (!phoneRaw) {
      setError('Lütfen telefon numaranızı giriniz.');
      setLoading(false);
      return;
    }
    if (phoneRaw.length !== 11 || !phoneRaw.startsWith('0')) {
      setError('Telefon numarası 0 ile başlamalı ve 11 haneli olmalıdır.');
      setLoading(false);
      return;
    }
    if (!tcNo) {
      setError('Lütfen T.C. Kimlik numaranızı giriniz.');
      setLoading(false);
      return;
    }
    if (!validateTC(tcNo)) {
      setError('Geçersiz T.C. Kimlik numarası girdiniz.');
      setLoading(false);
      return;
    }

    if (!email) {
      setError('Lütfen e-posta adresinizi giriniz.');
      setLoading(false);
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Lütfen geçerli bir e-posta adresi giriniz.');
      setLoading(false);
      return;
    }
    if (!password) {
      setError('Lütfen şifrenizi giriniz.');
      setLoading(false);
      return;
    }
    if (password.length < 6) {
      setError('Şifre en az 6 karakter olmalıdır.');
      setLoading(false);
      return;
    }
    if (!confirmPassword) {
      setError('Lütfen şifre tekrarını giriniz.');
      setLoading(false);
      return;
    }
    if (password !== confirmPassword) {
      setError('Şifreler eşleşmiyor.');
      setLoading(false);
      return;
    }
    if (!kvkkAccepted) {
      setError('Lütfen KVKK ve Açık Rıza Metnini onaylayın.');
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          phone: phoneRaw,
          birth_date: birthDate,
          tc_no: tcNo,
        },
      },
    });

    if (error) {
      setError(error.message);
    } else {
      // Eğer Supabase ayarlarında "Confirm Email" kapalıysa sistem otomatik giriş yapar.
      // Güvenlik için eğer oturum açılmışsa hemen çıkış yapıyoruz.
      if (data.session) {
        await supabase.auth.signOut();
      }
      setRegisteredEmail(email);
      setSuccessMsg('Doğrulama kodu e-postanıza gönderildi. Hesabınızın aktifleştirilmesi için lütfen kodu girin.');
      setResendCooldown(60);
      setStep(2);
    }
    setLoading(false);
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setLoading(true);
    setError(null);
    setSuccessMsg('');

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: registeredEmail,
    });

    if (error) {
      setError(error.message);
    } else {
      setSuccessMsg('Yeni doğrulama kodu e-postanıza gönderildi.');
      setResendCooldown(60);
    }
    setLoading(false);
  };

  const handleVerifyOtp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.verifyOtp({
      email: registeredEmail,
      token: otpCode,
      type: 'signup'
    });

    if (error) {
      setError('Geçersiz veya süresi dolmuş kod. Lütfen tekrar deneyin.');
      setLoading(false);
    } else {
      setSuccessMsg('');
      setSuccess(true);
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    }
  };

  return (
    <div className="auth-page" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="auth-card" style={{ maxWidth: '520px', padding: '40px 36px' }}>
        {/* Logo */}
        <div className="auth-logo">
          <img
            src="/gm-logo.png"
            alt="Gençlik Merkezi"
            className="auth-logo-img"
            style={{ width: '150px', height: '150px', objectFit: 'contain', display: 'block', margin: '0 auto' }}
          />
        </div>

        <h1 className="auth-title">Üye Ol</h1>
        <p className="auth-subtitle">Saha randevusu için hesap oluşturun.</p>

        {error && (
          <div className="error-msg" style={{ display: 'block' }}>
            {error}
          </div>
        )}

        {success && (
          <div className="success-msg" style={{ display: 'block', marginBottom: '15px' }}>
            Kayıt başarılı! Giriş sayfasına yönlendiriliyorsunuz...
          </div>
        )}

        {successMsg && !success && (
          <div style={{ padding: '12px', background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.2)', borderRadius: '8px', fontSize: '14px', marginBottom: '20px', textAlign: 'center' }}>
            {successMsg}
          </div>
        )}

        {step === 1 && (
          <form className="auth-form" onSubmit={handleRegister} noValidate>

          {/* Ad / Soyad */}
          <div className="form-grid-auth">
            <div className="form-group">
              <label htmlFor="regAd">Ad</label>
              <input type="text" id="regAd" name="firstName" className="form-input" placeholder="Adınız" required autoComplete="given-name" />
            </div>
            <div className="form-group">
              <label htmlFor="regSoyad">Soyad</label>
              <input type="text" id="regSoyad" name="lastName" className="form-input" placeholder="Soyadınız" required autoComplete="family-name" />
            </div>
          </div>

          {/* T.C. Kimlik */}
          <div className="form-group">
            <label htmlFor="regTcNo">T.C. Kimlik Numarası</label>
            <input
              type="text"
              id="regTcNo"
              name="tcNo"
              className="form-input"
              placeholder="11 haneli T.C. Kimlik Numaranız"
              maxLength={11}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="regDogum">Doğum Tarihi</label>
            <input
              type="date"
              id="regDogum"
              name="birthDate"
              className="form-input"
              max={new Date().toISOString().split('T')[0]}
              min={new Date(new Date().setFullYear(new Date().getFullYear() - 100)).toISOString().split('T')[0]}
              required
            />
          </div>

          {/* Telefon */}
          <div className="form-group">
            <label htmlFor="regTelefon">Telefon Numarası</label>
            <input
              type="tel"
              id="regTelefon"
              className="form-input"
              placeholder="0(5XX) XXX XX XX"
              value={phone}
              onChange={e => {
                const raw = e.target.value.replace(/\D/g, '');
                if (raw.length > 0 && raw[0] !== '0') return;
                setPhone(formatPhone(e.target.value));
              }}
              autoComplete="tel"
              required
            />
          </div>

          {/* E-posta */}
          <div className="form-group">
            <label htmlFor="regEmail">E-posta Adresi</label>
            <input type="email" id="regEmail" name="email" className="form-input" placeholder="ornek@mail.com" autoComplete="email" required />
          </div>

          {/* Şifre / Şifre Tekrar */}
          <div className="form-grid-auth">
            <div className="form-group">
              <label htmlFor="regSifre">Şifre</label>
              <input type="password" id="regSifre" name="password" className="form-input" placeholder="Min. 6 karakter" autoComplete="new-password" minLength={6} required />
            </div>
            <div className="form-group">
              <label htmlFor="regSifre2">Şifre Tekrar</label>
              <input type="password" id="regSifre2" name="confirmPassword" className="form-input" placeholder="Şifrenizi tekrar girin" autoComplete="new-password" required />
            </div>
          </div>

          {/* KVKK & Bilgilendirme Onayı */}
          <div className="form-group" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: '10px', marginTop: '5px' }}>
            <input
              type="checkbox"
              id="kvkkCheck"
              checked={kvkkAccepted}
              onChange={(e) => {
                if (!hasReadKvkk) {
                  setShowKvkkModal(true);
                  return;
                }
                if (!hasReadInfo) {
                  setShowInfoModal(true);
                  return;
                }
                setKvkkAccepted(e.target.checked);
              }}
              style={{ width: '18px', height: '18px', marginTop: '3px', cursor: 'pointer' }}
            />
            <label htmlFor="kvkkCheck" style={{ textTransform: 'none', fontSize: '13px', lineHeight: '1.4', cursor: 'pointer', fontWeight: '500' }}>
              <span onClick={(e) => { e.stopPropagation(); setShowKvkkModal(true); setHasReadKvkk(true); }} style={{ color: 'var(--red)', textDecoration: 'underline' }}>KVKK Metni</span>
              {' '}ve{' '}
              <span onClick={(e) => { e.stopPropagation(); setShowInfoModal(true); setHasReadInfo(true); }} style={{ color: 'var(--red)', textDecoration: 'underline' }}>Açık Rıza Metni</span>
              'ni okudum, onaylıyorum.
            </label>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block btn-lg"
            style={{ marginTop: '12px' }}
            disabled={loading || success}
          >
            {loading ? 'İşleniyor...' : 'Üye Oluştur'}
          </button>

          </form>
        )}

        {step === 2 && !success && (
          <form className="auth-form" onSubmit={handleVerifyOtp} noValidate>
            <div className="form-group">
              <label htmlFor="otpCode">Doğrulama Kodu (6 haneli)</label>
              <input 
                type="text" 
                id="otpCode"
                className="form-input" 
                placeholder="000000" 
                value={otpCode}
                onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                style={{ textAlign: 'center', fontSize: '24px', letterSpacing: '8px', fontWeight: 700 }}
                autoComplete="one-time-code"
                required 
              />
              <p style={{ fontSize: '12px', color: 'var(--gray-500, #6b7280)', marginTop: '8px' }}>
                <strong>{registeredEmail}</strong> adresine gönderilen kodu girin.
              </p>
            </div>
            <button type="submit" className="btn btn-primary btn-block btn-lg" style={{ marginTop: '8px' }} disabled={loading || otpCode.length !== 6}>
              {loading ? 'Doğrulanıyor...' : '🔐 Kodu Doğrula'}
            </button>
            <div style={{ textAlign: 'center', marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button 
                type="button" 
                onClick={handleResendOtp} 
                disabled={resendCooldown > 0 || loading}
                style={{ background: 'none', border: 'none', color: resendCooldown > 0 ? 'var(--gray-400)' : 'var(--red)', fontSize: '14px', cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer', fontWeight: '500' }}
              >
                {resendCooldown > 0 ? `Kodu Tekrar Gönder (${resendCooldown}s)` : 'Kodu Tekrar Gönder'}
              </button>

              <button 
                type="button" 
                onClick={() => {
                  setStep(1);
                  setSuccessMsg('');
                }} 
                style={{ background: 'none', border: 'none', color: 'var(--gray-500)', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Geri Dön ve Bilgileri Düzenle
              </button>
            </div>
          </form>
        )}

        <div className="auth-footer">
          Zaten hesabınız var mı? <Link href="/login">Giriş Yap</Link>
        </div>

        <div className="auth-footer" style={{ marginTop: '8px' }}>
          <Link href="/" style={{ color: 'var(--gray-500)', fontSize: '13px' }}>
            &larr; Takvime Dön
          </Link>
        </div>

      </div>

      {/* KVKK Modal */}
      {showKvkkModal && (
        <div className="modal-overlay" onClick={() => setShowKvkkModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowKvkkModal(false)}>×</button>
            <h2 className="modal-title" style={{ fontSize: '18px' }}>KİŞİSEL VERİLERİN İŞLENMESİNE İLİŞKİN AYDINLATMA METNİ</h2>
            <div className="modal-subtitle" style={{ marginTop: '15px', color: 'var(--gray-700)', maxHeight: '60vh', overflowY: 'auto', paddingRight: '10px', textAlign: 'justify', fontSize: '13px' }}>
              <p>Gençlik ve Spor Bakanlığı'na ait tesislerde yer alan geçiş sistemlerinin kullanımı kapsamında kişisel verilerin işlenecek olması dolayısıyla 24/3/2016 tarihli ve 6698 sayılı Kişisel Verilerin Korunması Kanunu’nun “Veri Sorumlusunun Aydınlatma Yükümlülüğü” başlıklı 10 uncu maddesi uyarınca veri sorumlusu olan T.C. Gençlik ve Spor Bakanlığı’nın;</p>
              <ul style={{ listStyleType: 'none', paddingLeft: '10px', marginTop: '10px', marginBottom: '10px' }}>
                <li>a) Veri sorumlusunun ve varsa temsilcisinin kimliği,</li>
                <li>b) Kişisel verilerin hangi amaçla işleneceği,</li>
                <li>c) İşlenen verilerin kimlere ve hangi amaçla aktarılabileceği,</li>
                <li>ç) Kişisel veri toplamanın yöntemi ve hukuki sebebi,</li>
                <li>d) 6698 sayılı Kanunun 11 inci maddesinde sayılan diğer hakları,</li>
              </ul>
              <p>konularında ilgililere bilgi vermekle yükümlüdür.</p>
              <br/>
              <p>İş bu aydınlatma metni, Gençlik ve Spor Bakanlığı'na ait tesislerde yer alan geçiş sistemlerinin kullanımı esnasında kişisel verileri işlenen vatandaşları bilgilendirmek ve aydınlatmak üzere hazırlanmıştır.</p>
              <br/>
              <p><strong>a) Veri Sorumlusunun Kimliği</strong></p>
              <p>Veri Sorumlusu Emek, 3086. Sk. No:2, 07600 Manavgat/Antalya adresindeki Manavgat Gençlik Merkezi'dir. (İletişim numarası: (0242) 742 28 50)</p>
              <br/>
              <p><strong>b) Kişisel Verilerin İşlenme Amaçları</strong></p>
              <p>6698 sayılı Kişisel Verilerin Korunması Kanunu m.5/1 uyarınca açık rızanızın varlığı halinde kimlik bilgileriniz;</p>
              <ul style={{ listStyleType: 'disc', paddingLeft: '20px', marginTop: '10px', marginBottom: '10px' }}>
                <li>Spor faaliyetlerinin plan ve program dâhilinde ve mevzuata uygun bir şekilde yürütülmesini gözetmek, gelişmesini ve yaygınlaşmasını teşvik edici tedbirler almak,</li>
                <li>Spor alanında uygulanacak politikaların tespit edilmesi için gerekli çalışmaları yapmak, teşkilatlanma, federasyonların bağımsızlığı, spor tesisleri, eğitim, sponsorluk, sporcu sağlığının korunması, uluslararası organizasyonlarla ilgili çalışmaları koordine etmek, değerlendirmek ve denetlemek,</li>
                <li>Spor tesisleri ihtiyacını tespit etmek ve planlamak, spor kültürünün geliştirilmesi, yaygınlaştırılması ve özendirilmesini sağlamak ve bu konuda her türlü tedbiri almak,</li>
                <li>Seyirden yasaklanma tedbiri bulunanların spor müsabakalarına ve antrenmanlara girmelerinin engellenmesi için gerekli önlemleri almak,</li>
              </ul>
              <p>amacıyla işlenecektir. Söz konusu kişisel verileriniz, 6698 sayılı Kanunun 5 inci ve 6 ncı maddelerinde belirtilen kişisel verileri işleme şartları çerçevesinde sunulan hizmetlerin kalitesinin artırılması için gerekli çalışmaların Bakanlık birimleri tarafından yapılması ve ilgili süreçlerin yürütülmesi amacıyla işlenmektedir.</p>
              <br/>
              <p><strong>c) Kişisel Verilerin Toplanma ve Saklanma Yöntemi</strong></p>
              <p>Kişisel verileriniz veri sorumlusu tarafından ve veri işleme sorumlusu olan T.C. Gençlik ve Spor Bakanlığı Bilgi İşlem Dairesi Başkanlığı aracılığı ile fiziki veya elektronik ortamda toplanmaktadır.</p>
              <br/>
              <p>Gençlik ve Spor Bakanlığı'na ait tesislerde yer alan geçiş sistemlerinin kullanımı esnasında paylaştığınız kişisel verileriniz iş bu Aydınlatma Metninde belirtilen hukuki sebeplerle 6698 sayılı Kanunun 5 inci ve 6 ncı maddelerinde belirtilen kişisel veri işleme şartları çerçevesinde işlenebilmekte ve aynı Kanunun 8 inci maddesi kapsamında diğer kamu kurum ve kuruluşları ve diğer kişiler ile paylaşılabilmektedir.</p>
              <br/>
              <p>Kişisel verilerin güvenli bir şekilde saklanması, hukuka aykırı olarak işlenmesi ve erişilmesinin önlenmesi ile kişisel verilerin hukuka uygun olarak imha edilmesi için T.C. Gençlik ve Spor Bakanlığı tarafından gerekli teknik ve idari tedbirler alınmaktadır.</p>
              <br/>
              <p>Kişisel verileriniz, size bildirilen amaçlar ve kapsam dışında kullanılmamak kaydı ile gerekli tüm bilgi güvenliği tedbirleri de alınarak işlenecek ve yasal saklama süresince veya böyle bir süre öngörülmemişse işleme amacının gerekli kıldığı süre boyunca saklanacaktır.</p>
              <br/>
              <p><strong>d) Kişisel Verilerin Paylaşılabileceği Taraflar ve Paylaşım Amaçları</strong></p>
              <p>6698 sayılı Kanunun 8 inci maddesi kapsamında kişisel verileriniz;</p>
              <ul style={{ listStyleType: 'none', paddingLeft: '10px', marginTop: '10px', marginBottom: '10px' }}>
                <li>a) Kanunlarda açıkça öngörülmesi,</li>
                <li>b) Fiili imkânsızlık nedeniyle rızasını açıklayamayacak durumda bulunan kişinin hayatının korunması,</li>
                <li>c) Bir sözleşmenin kurulması veya ifasıyla doğrudan ilgili olması,</li>
                <li>ç) Veri sorumlusunun hukuki yükümlülüğünü yerine getirebilmesi,</li>
                <li>d) Bir hakkın tesisi, kullanılması veya korunması için zorunlu olması,</li>
              </ul>
              <br/>
              <p><strong>e) Veri Sahiplerinin Hakları ve Bu Hakların Kullanılması</strong></p>
              <p>6698 sayılı Kanunun 11 inci maddesi uyarınca T.C. Gençlik ve Spor Bakanlığı’na başvurarak;</p>
              <ul style={{ listStyleType: 'none', paddingLeft: '10px', marginTop: '10px', marginBottom: '10px' }}>
                <li>a) Kişisel verilerinizin işlenip işlenmediğini öğrenme,</li>
                <li>b) İşlenme amacını öğrenme,</li>
                <li>c) Aktarıldığı üçüncü kişileri bilme,</li>
                <li>ç) Silinmesini veya yok edilmesini isteme,</li>
                <li>d) Otomatik sistemler sonucu aleyhinize çıkan sonuca itiraz etme,</li>
                <li>e) Zarara uğramanız halinde giderilmesini talep etme,</li>
              </ul>
              <p>Haklarınıza ilişkin talepleriniz, talebin niteliğine göre en kısa sürede ve en geç 30 (otuz) gün içerisinde T.C. Gençlik ve Spor Bakanlığı tarafından sonuçlandırılacaktır.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary btn-block" onClick={() => { setShowKvkkModal(false); setHasReadKvkk(true); }}>Anladım</button>
            </div>
          </div>
        </div>
      )}

      {/* Açık Rıza Modal */}
      {showInfoModal && (
        <div className="modal-overlay" onClick={() => setShowInfoModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowInfoModal(false)}>×</button>
            <h2 className="modal-title" style={{ fontSize: '18px' }}>AÇIK RIZA ONAY FORMU</h2>
            <div className="modal-subtitle" style={{ marginTop: '15px', color: 'var(--gray-700)', maxHeight: '60vh', overflowY: 'auto', paddingRight: '10px', textAlign: 'justify', fontSize: '13px' }}>
              <p>İş bu Açık Rıza Onay Formu; Gençlik ve Spor Bakanlığı Tesis Geçiş Sistemlerinin Kullanımına Dair Yönerge kapsamında Gençlik ve Spor Bakanlığı'na ait tesislerde yer alan geçiş sistemlerinin kullanımına ilişkindir.</p>
              <br/>
              <p style={{ fontWeight: 'bold' }}>KİŞİSEL VERİLERİN KORUNMASI KANUNU KAPSAMINDA AÇIK RIZA BEYANI</p>
              <br/>
              <p>Sayın Vatandaşımız,</p>
              <br/>
              <p>Gençlik ve Spor Bakanlığı Tesis Geçiş Sistemlerinin Kullanımına Dair Yönerge kapsamında Gençlik ve Spor Bakanlığı'na ait tesislerde yer alan geçiş sistemlerinin kullanımı esnasında; spor faaliyetlerinin plan ve program dâhilinde ve mevzuata uygun bir şekilde yürütülmesini gözetmek, gelişmesini ve yaygınlaşmasını teşvik edici tedbirler almak, spor alanında uygulanacak politikaların tespit edilmesi için gerekli çalışmaları yapmak, teşkilatlanma, federasyonların bağımsızlığı, spor tesisleri, eğitim, sponsorluk, sporcu sağlığının korunması, uluslararası organizasyonlarla ilgili çalışmaları koordine etmek, değerlendirmek ve denetlemek, spor tesisleri ihtiyacını tespit etmek ve planlamak, spor kültürünün geliştirilmesi, yaygınlaştırılması ve özendirilmesini sağlamak ve bu konuda her türlü tedbiri almak, seyirden yasaklanma tedbiri bulunanların spor müsabakalarına ve antrenmanlara girmelerinin engellenmesi için gerekli önlemleri almak amacıyla Gençlik ve Spor Bakanlığı tarafından oluşturulan bilişim sistemi üzerinden kişisel verileriniz işlenmektedir.</p>
              <br/>
              <p>Bu kapsamda ad, soyad, T.C. kimlik numarası, doğum tarihi, telefon numarası ve e-mail bilgileriniz işlenecektir.</p>
              <br/>
              <p>Gençlik ve Spor Bakanlığı'na ait tesislerde yer alan geçiş sistemlerinin kullanımı kapsamında paylaşmış olduğunuz kişisel verileriniz, yukarıda açıklanan sebeplerle ve 6698 sayılı Kanunun 5 inci maddesi kapsamı ile aynı Kanunun 6 ncı maddesinde yer alan hukuki sebeplere dayanarak T.C. Gençlik ve Spor Bakanlığı tarafından veri sorumlusu sıfatıyla Bakanlığa ait bilişim sistemlerine kaydedilecek, depolanacak, muhafaza edilecek, saklanacak, yasal/bilimsel/finansal gerekler ve nedenler ile sınıflandırılacak, güncellenecek ve mevzuatın izin verdiği durumlarda ve yasal sınırlar dâhilinde ihtiyaç duyulması halinde yurt içindeki gerçek ve tüzel kişilere açıklanabilecek, sınıflandırılabilecek, raporlanabilecek, paylaşılabilecek ve işlenebilecektir.</p>
              <br/>
              <p>Kişisel verileriniz; yasal saklama süresince veya böyle bir süre öngörülmemişse işleme amacının gerekli kıldığı süre boyunca saklanacak, bu süre sona erdiğinde silinme, yok edilme ya da anonimleştirme (kişisel verilerin, başka verilerle eşleştirilerek dahi hiçbir surette kimliği belirli ya da belirlenebilir bir gerçek kişiyle ilişkilendirilemeyecek hale getirilmesi) yöntemleriyle T.C. Gençlik ve Spor Bakanlığı veri akışlarından çıkarılacaktır.</p>
              <br/>
              <p>6698 sayılı Kişisel Verilerin Korunması Kanunu gereğince tanımlanan kişisel verilerimin, Gençlik ve Spor Bakanlığı'na ait tesislerde yer alan geçiş sistemlerinin kullanımı kapsamında uygulanacak temel politikaların tespiti amacıyla işlenmesine, ilgili süreç kapsamında işlenme amacı ile sınırlı olmak üzere kullanılmasına, anonimleştirilmesine ve paylaşılmasına, gereken süre zarfında saklanmasına açık rızam olduğunu ve bu hususta tarafıma gerekli aydınlatmanın yapıldığını;</p>
              <br/>
              <p>İş bu Metni ve Aydınlatma Metnini okuduğumu ve anladığımı beyan ederim.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary btn-block" onClick={() => { setShowInfoModal(false); setHasReadInfo(true); }}>Okudum ve Kabul Ediyorum</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
