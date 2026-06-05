-- SUPABASE STORAGE BUCKET & RLS POLICIES FOR APPOINTMENT ARCHIVES
-- Date: 2026-05-20

-- 1. Create storage bucket 'randevu-arsivleri'
INSERT INTO storage.buckets (id, name, public)
VALUES ('randevu-arsivleri', 'randevu-arsivleri', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Enable RLS on storage.objects (if not already enabled)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policy: Authenticated users can read files from 'randevu-arsivleri'
DROP POLICY IF EXISTS "Public Read Randevu Arsivleri" ON storage.objects;
CREATE POLICY "Public Read Randevu Arsivleri" ON storage.objects
  FOR SELECT USING (bucket_id = 'randevu-arsivleri' AND auth.role() = 'authenticated');

-- 4. RLS Policy: Authenticated users can write/update files in 'randevu-arsivleri'
DROP POLICY IF EXISTS "Auth Manage Randevu Arsivleri" ON storage.objects;
CREATE POLICY "Auth Manage Randevu Arsivleri" ON storage.objects
  FOR ALL USING (bucket_id = 'randevu-arsivleri' AND auth.role() = 'authenticated');
