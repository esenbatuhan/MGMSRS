import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { AppointmentSchema } from "../_shared/schemas.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Yetkisiz erişim" }), { status: 401, headers: corsHeaders });
    }

    const body = await req.json();
    const { appointmentId, ...updates } = body;
    
    // Validasyon
    const validation = AppointmentSchema.partial().safeParse(updates);
    if (!validation.success) {
      return new Response(JSON.stringify({ error: "Validasyon hatası", details: validation.error.format() }), { status: 400, headers: corsHeaders });
    }

    // 1. Randevunun sahipliğini kontrol et
    const { data: appt, error: fetchError } = await supabaseClient
      .from("appointments")
      .select("user_id, tarih, saat")
      .eq("id", appointmentId)
      .single();

    if (fetchError || !appt) {
      return new Response(JSON.stringify({ error: "Randevu bulunamadı" }), { status: 404, headers: corsHeaders });
    }

    if (appt.user_id !== user.id) {
       // Admin kontrolü (Opsiyonel: Adminler de güncelleyebilmeli)
       const { data: isAdmin } = await supabaseClient.rpc("is_admin");
       if (!isAdmin) {
         return new Response(JSON.stringify({ error: "Bu işlem için yetkiniz yok" }), { status: 403, headers: corsHeaders });
       }
    }

    // 2. 3 Saat Kuralı Kontrolü (Sadece kullanıcılar için)
    const apptDateTime = new Date(`${appt.tarih}T${String(appt.saat).padStart(2, '0')}:00:00`);
    if (Date.now() > apptDateTime.getTime() - 3 * 60 * 60 * 1000) {
      return new Response(JSON.stringify({ error: "Randevuya 3 saatten az kaldığı için değişiklik yapılamaz." }), { status: 400, headers: corsHeaders });
    }

    // 3. Güncelleme
    const { data, error: updateError } = await supabaseClient
      .from("appointments")
      .update(updates)
      .eq("id", appointmentId)
      .select()
      .single();

    if (updateError) {
      if (updateError.code === "23505") {
        return new Response(JSON.stringify({ error: "Seçilen slot dolu veya günlük limit aşıldı." }), { status: 409, headers: corsHeaders });
      }
      throw updateError;
    }

    return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || "Bilinmeyen hata" }), { status: 500, headers: corsHeaders });
  }
});
