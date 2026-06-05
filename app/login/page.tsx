'use client';

import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError('Giriş başarısız. Lütfen bilgilerinizi kontrol edin.');
    } else {
      router.push('/'); // Ana sayfaya (takvime) dön
      router.refresh();
    }
    setLoading(false);
  };

  return (
    <div className="auth-page" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="auth-card">
        {/* Logo */}
        <div className="auth-logo">
          <img 
            src="/gm-logo.png" 
            alt="Gençlik Merkezi" 
            className="auth-logo-img"
            style={{ width: '150px', height: '150px', objectFit: 'contain' }}
          />
        </div>

        <h1 className="auth-title">Giriş Yap</h1>
        <p className="auth-subtitle">Saha randevusu için hesabınıza giriş yapın.</p>

        {error && (
          <div className="error-msg" style={{ display: 'block' }}>
            {error}
          </div>
        )}

        <form className="auth-form" onSubmit={handleLogin} noValidate>
          <div className="form-group">
            <label htmlFor="loginEmail">E-posta Adresi</label>
            <input 
              type="email" 
              id="loginEmail"
              name="email"
              className="form-input" 
              placeholder="ornek@gmail.com" 
              autoComplete="email"
              required 
            />
          </div>

          <div className="form-group">
            <label htmlFor="loginSifre">Şifre</label>
            <input 
              type="password" 
              id="loginSifre"
              name="password"
              className="form-input" 
              placeholder="••••••••" 
              autoComplete="current-password"
              required 
            />
            <div style={{ textAlign: 'right', marginTop: '6px' }}>
              <Link href="/reset-password" style={{ fontSize: '13px', color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>
                Şifremi unuttum?
              </Link>
            </div>
          </div>

          <button 
            type="submit" 
            className="btn btn-primary btn-block btn-lg" 
            style={{ marginTop: '8px' }}
            disabled={loading}
          >
            {loading ? 'Giriş Yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>

        <div className="auth-footer">
          Hesabınız yok mu? <Link href="/register">Üye Ol</Link>
        </div>

        <div className="auth-footer" style={{ marginTop: '8px' }}>
          <Link href="/" style={{ color: 'var(--gray-500)', fontSize: '13px' }}>
            &larr; Takvime Dön
          </Link>
        </div>
      </div>
    </div>
  );
}
