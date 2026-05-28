import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { AdminActionSchema } from "../_shared/schemas.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", // Admin işlemleri için service role gerekebilir veya RPC'de SECURITY DEFINER var
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    // 1. Yetki Kontrolü: Kullanıcının admin olup olmadığını RPC üzerinden kontrol et
    const { data: isAdmin, error: authError } = await supabaseClient.rpc("is_admin");

    if (authError || !isAdmin) {
      return new Response(
        JSON.stringify({ error: "Bu işlem için yönetici yetkisi gereklidir.", code: "FORBIDDEN" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Validasyon
    const body = await req.json();
    const { action, ...params } = body;

    // 3. Eylem Seçimi (Routing)
    let rpcName = "";
    switch (action) {
      case "ban_user": rpcName = "admin_ban_user"; break;
      case "unban_user": rpcName = "admin_unban_user"; break;
      case "delete_appointment": rpcName = "admin_delete_appointment"; break;
      case "open_day": rpcName = "admin_open_day"; break;
      case "close_slot": rpcName = "admin_close_slot"; break;
      case "open_slot": rpcName = "admin_open_slot"; break;
      case "postpone_appointment": rpcName = "admin_postpone_appointment"; break;
      default:
        return new Response(
          JSON.stringify({ error: "Geçersiz eylem.", code: "INVALID_ACTION" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // 4. RPC Çağrısı
    const { data, error: rpcError } = await supabaseClient.rpc(rpcName, params);

    if (rpcError) throw rpcError;

    const duration = Date.now() - startTime;
    console.log(`[PERF] Admin Action (${action}) completed in ${duration}ms`);

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error(`[ERROR] Admin Action failed:`, error);
    return new Response(
      JSON.stringify({ error: error.message || "Bilinmeyen hata", code: "INTERNAL_SERVER_ERROR" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
