-- IDEMPOTENCY DESTEĞİ
-- Bu komutu Supabase "SQL Editor" ekranında çalıştırın.

-- appointments tablosuna idempotency_key kolonu ekle
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS idempotency_key UUID UNIQUE;

-- Not: UNIQUE kısıtlaması sayesinde aynı key ile mükerrer kayıt atılması 
-- veritabanı seviyesinde de engellenmiş olur.
