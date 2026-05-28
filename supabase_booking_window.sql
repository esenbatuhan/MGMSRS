-- HAFTALIK RANDEVU PENCERESİ — Sunucu Tarafı Güvenlik
-- Bu SQL'i Supabase "SQL Editor" ekranına yapıştırıp "Run" butonuna basarak çalıştırın.
--
-- KURAL: Kullanıcılar yalnızca Cumartesi 10:00'dan sonra yeni haftanın randevularını oluşturabilir.
-- Admin (role = 'admin') bu kısıtlamadan muaftır.
--
-- Saat dilimi: Türkiye (Europe/Istanbul, UTC+3)

-- Randevu ekleme/güncelleme sırasında booking window kontrolü yapan trigger fonksiyonu
CREATE OR REPLACE FUNCTION check_booking_window() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  now_istanbul TIMESTAMPTZ;
  current_dow INT;         -- 0=Pazar, 6=Cumartesi
  current_hour INT;
  current_week_monday DATE;
  next_week_monday DATE;
  appt_week_monday DATE;
  user_role TEXT;
BEGIN
  -- Admin kontrolü: Admin ise izin ver
  SELECT role INTO user_role FROM profiles WHERE id = auth.uid();
  IF user_role = 'admin' THEN
    RETURN NEW;
  END IF;

  -- Türkiye saatine göre mevcut zaman
  now_istanbul := NOW() AT TIME ZONE 'Europe/Istanbul';
  current_dow := EXTRACT(DOW FROM now_istanbul)::INT;  -- 0=Pazar, 6=Cumartesi
  current_hour := EXTRACT(HOUR FROM now_istanbul)::INT;

  -- Mevcut haftanın Pazartesi günü
  current_week_monday := (now_istanbul::DATE - ((current_dow + 6) % 7) * INTERVAL '1 day')::DATE;
  next_week_monday := current_week_monday + INTERVAL '7 days';

  -- Randevunun ait olduğu haftanın Pazartesi günü
  appt_week_monday := NEW.tarih - ((EXTRACT(DOW FROM NEW.tarih)::INT + 6) % 7) * INTERVAL '1 day';

  -- Eğer randevu gelecek haftaya aitse ve henüz Cumartesi 10:00 olmadıysa engelle
  IF appt_week_monday >= next_week_monday THEN
    -- Cumartesi 10:00 sonrasına kadar gelecek hafta randevusu oluşturulamaz
    IF NOT (current_dow = 6 AND current_hour >= 10) AND current_dow != 0 THEN
      RAISE EXCEPTION 'Randevular henüz açılmadı! Cumartesi saat 10:00''dan sonra randevu alabilirsiniz.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Mevcut trigger varsa kaldır
DROP TRIGGER IF EXISTS enforce_booking_window ON appointments;

-- Trigger'ı oluştur (INSERT ve UPDATE işlemlerinde çalışacak)
CREATE TRIGGER enforce_booking_window
BEFORE INSERT OR UPDATE ON appointments
FOR EACH ROW EXECUTE FUNCTION check_booking_window();
