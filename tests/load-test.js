import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 100 }, // 30 saniyede 100 kullanıcıya çık
    { duration: '30s', target: 200 }, // Sonra 200'e
    { duration: '30s', target: 500 }, // Sonra 500'e (Çökme noktası arıyoruz)
    { duration: '1m', target: 500 },  // 1 dakika 500 kullanıcıda kal
    { duration: '30s', target: 0 },   // Kapanış
  ],
};

export default function () {
  const baseUrl = 'http://localhost:3000';
  
  // Ana sayfayı ziyaret et
  const res = http.get(baseUrl);
  check(res, {
    'status is 200': (r) => r.status === 200,
  });

  // Login sayfasını ziyaret et
  const loginRes = http.get(`${baseUrl}/login`);
  check(loginRes, {
    'login page status is 200': (r) => r.status === 200,
  });

  sleep(1);
}
