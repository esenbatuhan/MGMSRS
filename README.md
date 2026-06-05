# MGMSRS - Manavgat Gençlik Merkezi Saha Randevu Sistemi 🛡️

MGMSRS, Manavgat Gençlik Merkezi spor sahaları (Basketbol & Voleybol) için geliştirilmiş, modern, güvenli ve kullanıcı dostu bir randevu yönetim sistemidir.

![MGMSRS Logo](public/gm-logo.png)

## 🚀 Özellikler

### Kullanıcı Paneli
- **Haftalık Takvim:** Pazartesi'den Pazar'a 08:00 - 23:00 arası canlı slot takibi.
- **Dinamik Branş Seçimi:** Basketbol veya Voleybol için özelleştirilmiş takım listesi girişi.
- **Gerçek Zamanlı Kilitleme:** Bir kullanıcı randevu alırken, seçtiği slot diğer kullanıcılar için "İşlemde" olarak kilitlenir (Supabase Presence).
- **Randevu Yönetimi:** Kullanıcılar randevularına 3 saat kalana kadar takım kadrosunu düzenleyebilir, 5 saat kalana kadar iptal edebilir.
- **Gelişmiş Profil:** Kişisel bilgiler ve geçmiş randevu takibi.

### Admin Paneli (🛡️ Özel Güvenlikli)
- **Haftalık Yönetim:** Gelecek haftaların randevularını önceden kapama/açma.
- **Kullanıcı Yönetimi:** Kurallara uymayan kullanıcıları yasaklama ve neden belirtme.
- **Saha Kontrolü:** İstediği günü veya saati manuel olarak tüm kullanıcılara kapatma.
- **Drag & Drop:** Randevuları sürükle-bırak yöntemiyle kolayca farklı saatlere öteleme.

### Teknik Mimari
- **Frontend:** Next.js 15 (App Router), React 19, TypeScript.
- **Backend & Database:** Supabase (PostgreSQL).
- **Realtime:** Supabase Realtime (Broadcast, Presence, Postgres Changes).
- **Styling:** Vanilla CSS (Custom Design System), Dark Mode desteği (`next-themes`).
- **Güvenlik:** RLS (Row Level Security), Server-side Admin RPC fonksiyonları, SQL Triggers.

## 🛠️ Kurulum

### 1. Depoyu Klonlayın
```bash
git clone https://github.com/IBaTuOne/MGMSRS.git
cd MGMSRS
```

### 2. Bağımlılıkları Yükleyin
```bash
npm install
```

### 3. Ortam Değişkenlerini Yapılandırın
`.env.local` dosyası oluşturun ve Supabase bilgilerinizi ekleyin:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Veritabanı Şemasını Hazırlayın
Projeye dahil edilen SQL dosyalarını (`supabase_*.sql`) Supabase SQL Editor üzerinden sırasıyla çalıştırın.

### 5. Uygulamayı Başlatın
```bash
npm run dev
```

## 🔒 Güvenlik Notu
Bu proje, veritabanı seviyesinde sıkı güvenlik politikaları (RLS) kullanmaktadır. `.env.local` gibi hassas dosyalar `.gitignore` ile korunmaktadır.

## 📄 Lisans
Bu proje [MIT](LICENSE) lisansı ile korunmaktadır.

---
**Geliştirici:** [IBaTuOne](https://github.com/IBaTuOne)
