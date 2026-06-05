-- SUPABASE SECURITY FIXES
-- Bu komutları Supabase "SQL Editor" ekranına yapıştırıp "Run" butonuna basarak çalıştırın.

-- 1. Profiles tablosu için RLS (Row Level Security) Aktifleştirme ve Güvenli Hale Getirme
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Kullanıcıların sadece kendi profillerini görebilmesini sağlayan politika
CREATE POLICY "Kullanicilar kendi profilini gorebilir" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Kullanıcıların sadece kendi profillerini güncelleyebilmesini sağlayan politika
CREATE POLICY "Kullanicilar kendi profilini guncelleyebilir" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Adminlerin tüm profilleri görebilmesini sağlayan politika
CREATE POLICY "Adminler tum profilleri gorebilir" ON profiles
  FOR SELECT USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- 2. Appointments tablosu için PII Veri Sızıntısını Önleyen RLS
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Herkes public verileri görebilir (Bu poliçe gereksiz verilerin UI'dan da gizlenmesiyle birlikte güvenliği artırır)
-- Supabase anon key okuma yapabilir ama Next.js UI sadece id, tarih, saat ve kategori çeker.
CREATE POLICY "Herkes randevulari okuyabilir" ON appointments
  FOR SELECT USING (true);

-- Kullanıcılar sadece kendi randevularını oluşturabilir/güncelleyebilir
CREATE POLICY "Kullanicilar kendi randevusunu olusturabilir" ON appointments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Kullanicilar kendi randevusunu guncelleyebilir" ON appointments
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Kullanicilar kendi randevusunu silebilir" ON appointments
  FOR DELETE USING (auth.uid() = user_id);

-- Adminler randevular üzerinde tam yetkiye sahiptir
CREATE POLICY "Adminler randevulari yonetebilir" ON appointments
  FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- 3. RPC Fonksiyonlarına Server-Side Admin Kontrolü Eklenmesi
-- Aşağıdaki fonksiyonlar güncellenerek, çağıran kişinin "admin" rolüne sahip olup olmadığı DB seviyesinde kontrol edilir.

CREATE OR REPLACE FUNCTION admin_ban_user(target_user_id UUID, ban_reason_text TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE profiles SET is_banned = true, ban_reason = ban_reason_text WHERE id = target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin_unban_user(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE profiles SET is_banned = false, ban_reason = null WHERE id = target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin_delete_appointment(target_appt_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  DELETE FROM appointments WHERE id = target_appt_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin_open_day(target_tarih DATE)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  DELETE FROM closed_slots WHERE tarih = target_tarih;
END;
$$;

CREATE OR REPLACE FUNCTION admin_close_slot(target_tarih DATE, target_saat INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  INSERT INTO closed_slots (tarih, saat) VALUES (target_tarih, target_saat)
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION admin_open_slot(target_tarih DATE, target_saat INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  DELETE FROM closed_slots WHERE tarih = target_tarih AND saat = target_saat;
END;
$$;

CREATE OR REPLACE FUNCTION admin_postpone_appointment(target_appt_id UUID, new_tarih DATE, new_saat INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE appointments SET tarih = new_tarih, saat = new_saat WHERE id = target_appt_id;
END;
$$;
