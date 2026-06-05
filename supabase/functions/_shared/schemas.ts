import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

export const AppointmentSchema = z.object({
  tarih: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Geçersiz tarih formatı (YYYY-MM-DD)"),
  saat: z.number().int().min(0).max(23),
  kategori: z.string().min(1, "Kategori boş olamaz"),
  oyuncular: z.array(z.object({ ad: z.string(), soyad: z.string() })).optional(),
});

export const AdminActionSchema = z.object({
  target_user_id: z.string().uuid().optional(),
  target_appt_id: z.string().uuid().optional(),
  tarih: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  saat: z.number().int().optional(),
});
