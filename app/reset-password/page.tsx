'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function ResetPasswordPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const router = useRouter();
  const supabase = createClient();

  const [mounted, setMounted] = useState(false);
  const [returnPath, setReturnPath] = useState('/login');

  useEffect(() => {
    setMounted(true);
    if (window.location.search.includes('from=admin')) {
      setReturnPath('/admin/login');
    }
  }, []);

  const handleRequestCode = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();

    if (profileError || !profile) {
      setError('Bu e-posta adresi ile kayıtlı bir kullanıcı bulunamadı.');
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email);

    if (error) {
      setError('Kod gönderilemedi. E-posta adresinizi kontrol edin.');
    } else {
      setSuccess('Şifre sıfırlama kodu e-postanıza gönderildi!');
      setStep(2);
    }
    setLoading(false);
  };

  const handleVerifyCode = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'recovery',
    });

    if (error) {
      setError('Geçersiz veya süresi dolmuş kod. Lütfen tekrar deneyin.');
    } else {
      setSuccess('Kod doğrulandı! Yeni şifrenizi belirleyin.');
      setStep(3);
    }
    setLoading(false);
  };

  const handleUpdatePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (newPassword !== confirmPassword) {
      setError('Şifreler eşleşmiyor.');
      setLoading(false);
      return;
    }

    if (newPassword.length < 6) {
      setError('Şifre en az 6 karakter olmalıdır.');
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) {
      setError('Şifre güncellenemedi: ' + error.message);
    } else {
      setSuccess('Şifreniz başarıyla güncellendi! Yönlendiriliyorsunuz...');
      setTimeout(() => {
        router.push(returnPath);
      }, 2000);
    }
    setLoading(false);
  };

  const stepLabels = ['E-posta', 'Doğrulama', 'Yeni Şifre'];

  const isAdmin = returnPath === '/admin/login';

  return (
    <div 
      className={`auth-page ${mounted && isAdmin ? 'admin-theme' : ''}`} 
      data-theme={mounted && isAdmin ? "dark" : undefined} 
      style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div className="auth-card">
        <div className="auth-logo">
          <img 
            src="/gm-logo.png" 
            alt="Gençlik Merkezi" 
            className="auth-logo-img"
            style={{ width: '150px', height: '150px', objectFit: 'contain' }}
          />
        </div>

        <h1 className="auth-title">Şifre Sıfırlama</h1>
        <p className="auth-subtitle">
          {step === 1 && 'E-posta adresinizi girin, size bir doğrulama kodu gönderelim.'}
          {step === 2 && 'E-postanıza gelen 6 haneli kodu aşağıya girin.'}
          {step === 3 && 'Yeni şifrenizi belirleyin.'}
        </p>

        {/* Adım göstergesi */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '24px' }}>
          {[1, 2, 3].map(s => (
            <div key={s} style={{
              display: 'flex', alignItems: 'center', gap: '6px'
            }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '13px', fontWeight: 600,
                background: step >= s ? 'var(--primary, #3b82f6)' : 'rgba(255,255,255,0.1)',
                color: step >= s ? '#fff' : 'var(--gray-500, #6b7280)',
                transition: 'all 0.3s'
              }}>
                {step > s ? '✓' : s}
              </div>
              <span style={{ fontSize: '11px', color: step >= s ? 'var(--text-dark, #fff)' : 'var(--gray-500, #6b7280)' }}>
                {stepLabels[s - 1]}
              </span>
              {s < 3 && <div style={{ width: '20px', height: '2px', background: step > s ? 'var(--primary, #3b82f6)' : 'rgba(255,255,255,0.1)' }} />}
            </div>
          ))}
        </div>

        {error && (
          <div className="error-msg" style={{ display: 'block' }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{ padding: '12px', background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.2)', borderRadius: '8px', fontSize: '14px', marginBottom: '20px', textAlign: 'center' }}>
            {success}
          </div>
        )}

        {step === 1 && (
          <form className="auth-form" onSubmit={handleRequestCode} noValidate>
            <div className="form-group">
              <label htmlFor="resetEmail">E-posta Adresi</label>
              <input 
                type="email" 
                id="resetEmail"
                className="form-input" 
                placeholder="ornek@gmail.com" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                required 
              />
            </div>
            <button type="submit" className="btn btn-primary btn-block btn-lg" style={{ marginTop: '8px' }} disabled={loading || !email}>
              {loading ? 'Gönderiliyor...' : '📧 Kod Gönder'}
            </button>
          </form>
        )}

        {step === 2 && (
          <form className="auth-form" onSubmit={handleVerifyCode} noValidate>
            <div className="form-group">
              <label htmlFor="resetCode">Doğrulama Kodu (6 haneli)</label>
              <input 
                type="text" 
                id="resetCode"
                className="form-input" 
                placeholder="000000" 
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                style={{ textAlign: 'center', fontSize: '24px', letterSpacing: '8px', fontWeight: 700 }}
                autoComplete="one-time-code"
                required 
              />
              <p style={{ fontSize: '12px', color: 'var(--gray-500, #6b7280)', marginTop: '8px' }}>
                <strong>{email}</strong> adresine gönderilen kodu girin.
              </p>
            </div>
            <button type="submit" className="btn btn-primary btn-block btn-lg" style={{ marginTop: '8px' }} disabled={loading || code.length !== 6}>
              {loading ? 'Doğrulanıyor...' : '🔐 Kodu Doğrula'}
            </button>
          </form>
        )}

        {step === 3 && (
          <form className="auth-form" onSubmit={handleUpdatePassword} noValidate>
            <div className="form-group">
              <label htmlFor="newPassword">Yeni Şifre</label>
              <input 
                type="password" 
                id="newPassword"
                className="form-input" 
                placeholder="Min. 6 karakter" 
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                autoComplete="new-password"
                minLength={6}
                required 
              />
            </div>
            <div className="form-group">
              <label htmlFor="confirmNewPassword">Yeni Şifre (Tekrar)</label>
              <input 
                type="password" 
                id="confirmNewPassword"
                className="form-input" 
                placeholder="Şifrenizi tekrar girin" 
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required 
              />
            </div>
            <button type="submit" className="btn btn-primary btn-block btn-lg" style={{ marginTop: '8px' }} disabled={loading || !newPassword || !confirmPassword}>
              {loading ? 'Güncelleniyor...' : '✅ Şifreyi Güncelle'}
            </button>
          </form>
        )}

        {!isAdmin && (
          <div className="auth-footer" style={{ marginTop: '20px' }}>
            <Link href={returnPath} style={{ color: 'var(--gray-500, #6b7280)', fontSize: '13px' }}>
              &larr; Giriş Ekranına Dön
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
