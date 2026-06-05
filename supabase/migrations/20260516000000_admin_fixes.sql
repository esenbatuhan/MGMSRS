-- ADMIN PANEL FIXES - Type Mismatch & RLS Resolution
-- Date: 2026-05-16

-- 0. CRITICAL FIX: prevent_sensitive_update trigger'ı admin işlemlerini de engelliyor!
-- Admin'lerin is_banned ve role değiştirmesine izin ver, normal kullanıcıları engelle.
CREATE OR REPLACE FUNCTION prevent_sensitive_update() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin'ler bu kısıtlamadan muaf
  IF is_admin() THEN RETURN NEW; END IF;
  
  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.is_banned IS DISTINCT FROM OLD.is_banned THEN
    RAISE EXCEPTION 'Yetkisiz kolon degisikligi engellendi.';
  END IF;
  RETURN NEW;
END;
$$;

-- 1. closed_slots: Admin INSERT/DELETE/UPDATE politikaları ekle
-- (Mevcut: sadece SELECT var. Admin doğrudan tablo işlemi yapamıyor.)
DROP POLICY IF EXISTS "Adminler closed_slots yonetebilir" ON closed_slots;
CREATE POLICY "Adminler closed_slots yonetebilir" ON closed_slots
  FOR ALL USING (is_admin());

-- 2. Yeni RPC: Tüm günü kapat (saat = NULL olarak kayıt ekler)
CREATE OR REPLACE FUNCTION admin_close_day(target_tarih DATE, target_description TEXT DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  -- Önce günün tüm tekil slot kayıtlarını temizle
  DELETE FROM closed_slots WHERE tarih = target_tarih;
  -- Sonra saat=NULL ile tüm günü kapat
  INSERT INTO closed_slots (tarih, saat, description) VALUES (target_tarih, NULL, target_description)
    ON CONFLICT DO NOTHING;
END;
$$;

-- 3. admin_close_slot güncelle: description parametresi ekle
CREATE OR REPLACE FUNCTION admin_close_slot(target_tarih DATE, target_saat INTEGER, target_description TEXT DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  INSERT INTO closed_slots (tarih, saat, description) VALUES (target_tarih, target_saat, target_description)
    ON CONFLICT DO NOTHING;
END;
$$;

-- 4. admin_ban_user güncelle: banned_at + gelecek randevuları otomatik sil
CREATE OR REPLACE FUNCTION admin_ban_user(target_user_id UUID, ban_reason_text TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  -- Kullanıcıyı yasakla
  UPDATE profiles SET is_banned = true, ban_reason = ban_reason_text, banned_at = NOW() WHERE id = target_user_id;
  -- Bugün ve sonrasındaki randevuları iptal et (geçmiş kayıtlar korunur)
  DELETE FROM appointments WHERE user_id = target_user_id AND tarih >= CURRENT_DATE;
END;
$$;

-- 5. admin_unban_user güncelle: banned_at'ı da temizle
CREATE OR REPLACE FUNCTION admin_unban_user(target_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE profiles SET is_banned = false, ban_reason = null, banned_at = null WHERE id = target_user_id;
END;
$$;

