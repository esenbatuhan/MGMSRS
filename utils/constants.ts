export const TURKISH_DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
export const TURKISH_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

export function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// --- Haftalık Geçiş Sistemi ---
// Cumartesi 09:00 → yeni hafta görünür (admin düzenler, kullanıcı izler)
// Cumartesi 10:00 → yeni hafta tüm kullanıcılara açık

const TRANSITION_DAY = 6; // Cumartesi (0=Pazar, 6=Cumartesi)
const PREVIEW_HOUR = 9;   // Admin önizleme başlangıcı
const BOOKING_HOUR = 10;  // Kullanıcı randevu alma başlangıcı

/**
 * Bulunulan haftanın Pazartesi gününü döndürür (saat bilgisi olmadan).
 */
export function getCurrentWeekMonday(now?: Date) {
  const today = now ? new Date(now) : new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysFromMonday);
  return monday;
}

/**
 * Aktif randevu haftasının Pazartesi gününü döndürür.
 * Cumartesi 09:00'dan sonra → sonraki haftanın Pazartesi'ni döndürür.
 * Aksi halde → bulunulan haftanın Pazartesi'ni döndürür.
 */
export function getActiveWeekMonday(now?: Date) {
  const currentTime = now || new Date();
  const currentMonday = getCurrentWeekMonday(currentTime);
  
  // Bugün Cumartesi mi ve saat >= 09:00 mı?
  if (currentTime.getDay() === TRANSITION_DAY && currentTime.getHours() >= PREVIEW_HOUR) {
    // Sonraki haftanın Pazartesi'ni hesapla
    const nextMonday = new Date(currentMonday);
    nextMonday.setDate(nextMonday.getDate() + 7);
    return nextMonday;
  }
  
  // Bugün Pazar mı? (Pazar günü de yeni hafta gösterilmeli)
  if (currentTime.getDay() === 0) {
    // Yarınki Pazartesi = bugün + 1
    const nextMonday = new Date(currentTime);
    nextMonday.setHours(0, 0, 0, 0);
    nextMonday.setDate(nextMonday.getDate() + 1);
    return nextMonday;
  }
  
  return currentMonday;
}

/**
 * Cumartesi 09:00 – 10:00 arası mı? (Admin düzenler, kullanıcı sadece izler)
 */
export function isWeekTransitionPreview(now?: Date) {
  const currentTime = now || new Date();
  return (
    currentTime.getDay() === TRANSITION_DAY &&
    currentTime.getHours() >= PREVIEW_HOUR &&
    currentTime.getHours() < BOOKING_HOUR
  );
}

/**
 * Kullanıcılar randevu alabilir mi?
 * - Normal günlerde (Pzt-Cuma): true
 * - Cumartesi 10:00 öncesi: false
 * - Cumartesi 10:00 sonrası: true
 * - Pazar: true
 */
export function isBookingEnabled(now?: Date) {
  const currentTime = now || new Date();
  
  // Cumartesi günü saat kontrolü
  if (currentTime.getDay() === TRANSITION_DAY) {
    return currentTime.getHours() >= BOOKING_HOUR;
  }
  
  // Diğer günlerde her zaman aktif
  return true;
}

/**
 * Cumartesi 10:00'a kalan süreyi milisaniye olarak döndürür.
 * Eğer preview modda değilse 0 döndürür.
 */
export function getTimeUntilBookingOpen(now?: Date): number {
  const currentTime = now || new Date();
  
  if (!isWeekTransitionPreview(currentTime)) return 0;
  
  const target = new Date(currentTime);
  target.setHours(BOOKING_HOUR, 0, 0, 0);
  
  return Math.max(0, target.getTime() - currentTime.getTime());
}

/**
 * Belirli bir Pazartesi'den başlayarak 7 günü döndürür.
 */
export function getWeekDaysFromMonday(monday: Date) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}
