// اختبار حِمل لـ API سند (k6) — زوّار يتصفّحون المحتوى العام، ومستفيدون مسجَّلون يفتحون حساباتهم في آن واحد.
//   k6 run tests/load/sanad.js                         (الافتراضي: 50 زائراً + 50 مستفيداً لثلاث دقائق)
//   k6 run -e VISITORS=200 -e MEMBERS=100 tests/load/sanad.js
// الخادم في Development (بيانات العرض) وبحدود معدّل مرفوعة: كل الطلبات من عنوان واحد هنا — راجع tests/load/README.md
import http from 'k6/http';
import { check, group, sleep } from 'k6';

const BASE = __ENV.SANAD_API_URL || 'http://localhost:5080';
const VISITORS = Number(__ENV.VISITORS || 50);
const MEMBERS = Number(__ENV.MEMBERS || 50);
const HOLD = __ENV.HOLD || '2m';

const ramp = (target) => [
  { duration: '30s', target },
  { duration: HOLD, target },
  { duration: '15s', target: 0 },
];

export const options = {
  // تسجيل الحسابات بطيء عمداً (تجزئة كلمة المرور): 200 حساب تتجاوز الدقيقة الافتراضية
  setupTimeout: '10m',
  scenarios: {
    visitors: { executor: 'ramping-vus', exec: 'visitor', stages: ramp(VISITORS) },
    members: { executor: 'ramping-vus', exec: 'member', stages: ramp(MEMBERS) },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{scenario:visitors}': ['p(95)<500', 'p(99)<1500'],
    'http_req_duration{scenario:members}': ['p(95)<500', 'p(99)<1500'],
    checks: ['rate>0.99'],
  },
};

const json = { headers: { 'Content-Type': 'application/json' } };
const get = (path, token, name) =>
  http.get(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, tags: { name: name || path } });

// حساب مستقل لكل مستفيد افتراضي: حدود المعدّل والبيانات لكل مستخدم كما في الواقع
export function setup() {
  const run = Date.now();
  const tokens = [];
  for (let i = 0; i < MEMBERS; i++) {
    const res = http.post(`${BASE}/api/v1/auth/register/email`, JSON.stringify({
      email: `load-${run}-${i}@sanad.test`,
      password: 'Strong-Pass-123',
      displayName: `حِمل ${i}`,
      acceptTerms: true,
      acceptPrivacyPolicy: true,
    }), { headers: { ...json.headers, 'Idempotency-Key': `load-${run}-${i}` } });
    if (res.status !== 200) throw new Error(`تسجيل ${i}: ${res.status} ${res.body}`);
    tokens.push(res.json('accessToken'));
  }
  // الدليل يجمع المختصين والجهات؛ صفحة المختص ومواعيده للمختصين فقط
  const providers = (get('/api/v1/directory', null).json('items') || []).filter((p) => p.kind === 'Provider');
  if (providers.length === 0) throw new Error('لا مختصين في الدليل: شغّل الخادم في Development لبيانات العرض');
  return { tokens, providerIds: providers.map((p) => p.id) };
}

const pick = (items) => items[Math.floor(Math.random() * items.length)];
const ok = (res) => check(res, { 'status 2xx': (r) => r.status >= 200 && r.status < 300 });

// زائر بلا حساب: يومي العام، الدليل، صفحة مختص، الأدعية والتلاوات
export function visitor(data) {
  group('visitor', () => {
    ok(get('/api/v1/directory', null));
    sleep(1);
    const id = pick(data.providerIds);
    ok(get(`/api/v1/providers/${id}`, null, '/api/v1/providers/{id}'));
    sleep(1);
    ok(get('/api/v1/public/ruqyah/duas', null));
    ok(get('/api/v1/public/recitation/reciters', null));
    sleep(2);
  });
}

// مستفيد مسجَّل: حسابه ومواعيده ومحادثاته وإشعاراته، ثم مواعيد مختص متاحة
export function member(data) {
  const token = data.tokens[(__VU - 1) % data.tokens.length];
  group('member', () => {
    ok(get('/api/v1/me', token));
    ok(get('/api/v1/me/bookings', token));
    sleep(1);
    ok(get('/api/v1/me/conversations', token));
    ok(get('/api/v1/me/notifications', token));
    ok(get('/api/v1/me/recommendations', token));
    sleep(1);
    const id = pick(data.providerIds);
    ok(get(`/api/v1/providers/${id}/availability`, token, '/api/v1/providers/{id}/availability'));
    sleep(2);
  });
}
