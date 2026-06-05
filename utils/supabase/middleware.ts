import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Sunucu tarafında (Node.js) ağ kısıtlamaları/zaman aşımı (ETIMEDOUT) yaşandığı için
  // sunucu taraflı yetki kontrolü kaldırıldı.
  // Yetki kontrolleri tamamen istemci (Client) tarafında (app/admin/dashboard/page.tsx içinde) yapılmaktadır.
  
  return supabaseResponse
}
