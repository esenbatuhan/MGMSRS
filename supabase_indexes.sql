-- SUPABASE PERFORMANS OPTİMİZASYONU İÇİN İNDEKS (INDEX) SQL KOMUTLARI
-- Bu komutları Supabase projenizdeki "SQL Editor" ekranına yapıştırıp "Run" (Çalıştır) butonuna basarak uygulayabilirsiniz.

-- 1. Randevular Tablosu: Tarih kolonuna indeks
-- Neden: Frontend tarafında `.gte('tarih', startDate).lte('tarih', endDate)` sorguları yapıyoruz. 
-- Bu indeks olmazsa sunucu her sorguda tablodaki tüm satırları baştan aşağı tarar (Full Table Scan).
CREATE INDEX IF NOT EXISTS idx_appointments_tarih ON appointments(tarih);

-- 2. Randevular Tablosu: Kullanıcı ID kolonuna indeks
-- Neden: Kullanıcı "Randevularım" sekmesini açtığında `.eq('user_id', session.user.id)` sorgusu atılıyor.
-- İndeks ile sadece o kullanıcının randevuları saniyesinde filtrelenir.
CREATE INDEX IF NOT EXISTS idx_appointments_user_id ON appointments(user_id);

-- 3. Kapalı Slotlar Tablosu: Tarih kolonuna indeks
CREATE INDEX IF NOT EXISTS idx_closed_slots_tarih ON closed_slots(tarih);

-- Opsiyonel: Profiller Tablosu için banlananları hızlı bulmak için indeks
-- Neden: Admin panelinde ve anasayfada `.eq('is_banned', true)` ile sorgu atıyoruz.
CREATE INDEX IF NOT EXISTS idx_profiles_is_banned ON profiles(is_banned) WHERE is_banned = true;
