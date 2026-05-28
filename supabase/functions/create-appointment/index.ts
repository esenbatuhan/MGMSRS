import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { AppointmentSchema } from "../_shared/schemas.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // CORS Handling
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    // 1. Güvenlik: auth.uid() doğrulaması
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Yetkisiz erişim", code: "UNAUTHORIZED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Validasyon: zod kullanımı
    const body = await req.json();
    const validation = AppointmentSchema.safeParse(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({
          error: "Validasyon hatası",
          details: validation.error.format(),
          code: "VALIDATION_ERROR",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { tarih, saat, kategori, oyuncular } = validation.data;
    const idempotencyKey = req.headers.get("x-idempotency-key");

    // 3. Idempotency Kontrolü
    if (idempotencyKey) {
      const { data: existingAppt } = await supabaseClient
        .from("appointments")
        .select("*")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (existingAppt) {
        return new Response(JSON.stringify(existingAppt), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json", "x-idempotent-replayed": "true" },
        });
      }
    }

    // 4. İş Mantığı: Race Condition Önlemi
    // Slotun kapalı olup olmadığını kontrol et
    const { data: isClosed } = await supabaseClient
      .from("closed_slots")
      .select("id")
      .eq("tarih", tarih)
      .eq("saat", saat)
      .maybeSingle();

    if (isClosed) {
      return new Response(
        JSON.stringify({ error: "Bu slot yönetici tarafından kapatılmıştır.", code: "SLOT_CLOSED" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Randevu oluşturma (Atomic Insert)
    const { data, error: insertError } = await supabaseClient
      .from("appointments")
      .insert([
        {
          user_id: user.id,
          tarih,
          saat,
          kategori,
          oyuncular,
          idempotency_key: idempotencyKey,
        },
      ])
      .select()
      .single();

    if (insertError) {
      // Çifte rezervasyon hatası (Unique Constraint)
      if (insertError.code === "23505") {
        return new Response(
          JSON.stringify({ error: "Bu saat dilimi zaten rezerve edilmiş.", code: "DOUBLE_BOOKING" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Trigger hatası (Günlük limit)
      if (insertError.message.includes("bir randevu alabilirsiniz")) {
        return new Response(
          JSON.stringify({ error: insertError.message, code: "DAILY_LIMIT_EXCEEDED" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw insertError;
    }

    const duration = Date.now() - startTime;
    console.log(`[PERF] create-appointment tamamlandı: ${duration}ms`);

    return new Response(JSON.stringify(data), {
      status: 201,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    // Sentry hata bildirimi simülasyonu (DSN eklendiğinde aktif olur)
    console.error(`[ERROR] [${new Date().toISOString()}]`, error);
    
    return new Response(
      JSON.stringify({ error: error.message || "Bilinmeyen hata", code: "INTERNAL_SERVER_ERROR" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * MÜLAKAT SORUSU: Bu fonksiyonda neden Next.js API Route yerine Edge Function tercih ettik?
 * 
 * TEKNİK CEVAP:
 * 1. Düşük Latency (Edge Computing): Edge Functions, kullanıcıya fiziksel olarak en yakın veri merkezinde (Cloudflare/Deno Deploy ağı) çalışır.
 * 2. Isolating Concurrency: Randevu alma gibi yoğun trafik alan işlemler, ana Next.js sunucusunun event loop'unu meşgul etmeden izole bir şekilde ölçeklenir.
 * 3. Cold Start Avantajı: Deno/V8 isolate yapısı, geleneksel Node.js serverless fonksiyonlarına göre çok daha hızlı (milisaniyeler içinde) ayağa kalkar.
 * 4. DB-Proximity: Supabase altyapısında çalıştığı için veritabanı ile arasındaki ağ gecikmesi minimumdur.
 * 5. Cost-Efficiency: Sadece çalıştığı süre kadar kaynak tüketir, boşta bekleyen bir sunucu maliyeti oluşturmaz.
 */
