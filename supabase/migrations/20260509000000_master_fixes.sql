-- SUPABASE MASTER MIGRATION (Consolidated Fixes)
-- Date: 2026-05-09

-- 0. Admin Kontrolü İçin Güvenli Fonksiyon
CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role = 'admin' FROM profiles WHERE id = auth.uid();
$$;

-- 1. Profiles Tablosu Güvenliği
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Kullanicilar kendi profilini gorebilir" ON profiles;
CREATE POLICY "Kullanicilar kendi profilini gorebilir" ON profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Kullanicilar kendi profilini guncelleyebilir" ON profiles;
CREATE POLICY "Kullanicilar kendi profilini guncelleyebilir" ON profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Adminler tum profilleri gorebilir" ON profiles;
CREATE POLICY "Adminler tum profilleri gorebilir" ON profiles
  FOR SELECT USING (is_admin());

-- Profil yetki yükseltmeyi önleyen Trigger
CREATE OR REPLACE FUNCTION prevent_sensitive_update() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.is_banned IS DISTINCT FROM OLD.is_banned THEN
    RAISE EXCEPTION 'Yetkisiz kolon degisikligi engellendi.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_profile_security ON profiles;
CREATE TRIGGER enforce_profile_security
BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION prevent_sensitive_update();

-- 2. Closed Slots Tablosu Güvenliği
ALTER TABLE closed_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Herkes kapali slotlari okuyabilir" ON closed_slots;
CREATE POLICY "Herkes kapali slotlari okuyabilir" ON closed_slots
  FOR SELECT USING (true);

-- 3. Appointments Tablosu Güvenliği
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS idempotency_key UUID UNIQUE;

DROP POLICY IF EXISTS "Kullanicilar kendi randevusunu gorebilir" ON appointments;
CREATE POLICY "Kullanicilar kendi randevusunu gorebilir" ON appointments
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Adminler tum randevulari gorebilir" ON appointments;
CREATE POLICY "Adminler tum randevulari gorebilir" ON appointments
  FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "Kullanicilar kendi randevusunu olusturabilir" ON appointments;
CREATE POLICY "Kullanicilar kendi randevusunu olusturabilir" ON appointments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Kullanicilar kendi randevusunu guncelleyebilir" ON appointments;
CREATE POLICY "Kullanicilar kendi randevusunu guncelleyebilir" ON appointments
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Kullanicilar kendi randevusunu silebilir" ON appointments;
CREATE POLICY "Kullanicilar kendi randevusunu silebilir" ON appointments
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Adminler randevulari yonetebilir" ON appointments;
CREATE POLICY "Adminler randevulari yonetebilir" ON appointments
  FOR ALL USING (is_admin());

-- Çifte Rezervasyonu Önleyen UNIQUE Kısıtlaması
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS unique_appointment_slot;
ALTER TABLE appointments ADD CONSTRAINT unique_appointment_slot UNIQUE (tarih, saat);

-- Günde 1 Randevu Limitini Kontrol Eden Trigger
CREATE OR REPLACE FUNCTION check_daily_appointment_limit() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  appt_count INT;
BEGIN
  IF is_admin() THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO appt_count FROM appointments 
  WHERE user_id = NEW.user_id AND tarih = NEW.tarih AND id != NEW.id;
  IF appt_count >= 1 THEN RAISE EXCEPTION 'Ayni gunde yalnizca bir randevu alabilirsiniz.'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_daily_limit ON appointments;
CREATE TRIGGER enforce_daily_limit
BEFORE INSERT OR UPDATE ON appointments
FOR EACH ROW EXECUTE FUNCTION check_daily_appointment_limit();

-- 4. Booking Window Kontrolü Trigger'ı
CREATE OR REPLACE FUNCTION check_booking_window() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  now_istanbul TIMESTAMPTZ;
  current_dow INT;
  current_hour INT;
  next_week_monday DATE;
  appt_week_monday DATE;
BEGIN
  IF is_admin() THEN RETURN NEW; END IF;
  now_istanbul := NOW() AT TIME ZONE 'Europe/Istanbul';
  current_dow := EXTRACT(DOW FROM now_istanbul)::INT;
  current_hour := EXTRACT(HOUR FROM now_istanbul)::INT;
  next_week_monday := (now_istanbul::DATE - ((current_dow + 6) % 7) * INTERVAL '1 day')::DATE + INTERVAL '7 days';
  appt_week_monday := NEW.tarih - ((EXTRACT(DOW FROM NEW.tarih)::INT + 6) % 7) * INTERVAL '1 day';
  IF appt_week_monday >= next_week_monday THEN
    IF NOT (current_dow = 6 AND current_hour >= 10) AND current_dow != 0 THEN
      RAISE EXCEPTION 'Randevular henüz açılmadı! Cumartesi saat 10:00''dan sonra randevu alabilirsiniz.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_booking_window ON appointments;
CREATE TRIGGER enforce_booking_window
BEFORE INSERT OR UPDATE ON appointments
FOR EACH ROW EXECUTE FUNCTION check_booking_window();

-- 5. Admin & Public RPC Functions
CREATE OR REPLACE FUNCTION get_public_appointments(start_date DATE, end_date DATE)
RETURNS TABLE (id uuid, tarih DATE, saat integer, kategori text)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT id, tarih, saat, kategori FROM appointments WHERE tarih >= start_date AND tarih <= end_date; $$;

CREATE OR REPLACE FUNCTION admin_ban_user(target_user_id UUID, ban_reason_text TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN IF NOT is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF; UPDATE profiles SET is_banned = true, ban_reason = ban_reason_text WHERE id = target_user_id; END; $$;

CREATE OR REPLACE FUNCTION admin_unban_user(target_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN IF NOT is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF; UPDATE profiles SET is_banned = false, ban_reason = null WHERE id = target_user_id; END; $$;

CREATE OR REPLACE FUNCTION admin_delete_appointment(target_appt_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN IF NOT is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF; DELETE FROM appointments WHERE id = target_appt_id; END; $$;

CREATE OR REPLACE FUNCTION admin_open_day(target_tarih DATE)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN IF NOT is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF; DELETE FROM closed_slots WHERE tarih = target_tarih; END; $$;

CREATE OR REPLACE FUNCTION admin_close_slot(target_tarih DATE, target_saat INTEGER)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN IF NOT is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF; INSERT INTO closed_slots (tarih, saat) VALUES (target_tarih, target_saat) ON CONFLICT DO NOTHING; END; $$;

CREATE OR REPLACE FUNCTION admin_open_slot(target_tarih DATE, target_saat INTEGER)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN IF NOT is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF; DELETE FROM closed_slots WHERE tarih = target_tarih AND saat = target_saat; END; $$;

CREATE OR REPLACE FUNCTION admin_postpone_appointment(target_appt_id UUID, new_tarih DATE, new_saat INTEGER)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  old_tarih DATE;
  old_saat INTEGER;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Orijinal randevunun tarih ve saatini al
  SELECT tarih, saat INTO old_tarih, old_saat FROM appointments WHERE id = target_appt_id;

  -- Orijinal randevu geçmişte ise ötelemeyi engelle
  IF (old_tarih + (old_saat || ' hours')::INTERVAL) < NOW() THEN
    RAISE EXCEPTION 'Geçmiş randevular ötelenemez.';
  END IF;

  UPDATE appointments SET tarih = new_tarih, saat = new_saat WHERE id = target_appt_id;
END;
$$;
