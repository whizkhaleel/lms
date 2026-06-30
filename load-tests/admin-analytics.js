import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://nginx:80';

const failureRate = new Rate('failed_requests');
const analyticsTrend = new Trend('analytics_duration');

export const options = {
  stages: [
    { duration: '30s', target: 5 },
    { duration: '30s', target: 20 },
    { duration: '30s', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    failed_requests: ['rate<0.01'],
    analytics_duration: ['p(95)<1000'],
    http_req_duration: ['p(95)<3000'],
  },
};

function getAuthToken() {
  const loginPayload = JSON.stringify({
    email: 'shaheedmahmoudacademy@gmail.com',
    password: 'SMAbr0!h@rs2026',
  });
  const loginRes = http.post(`${BASE_URL}/api/v1/auth/login`, loginPayload, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (loginRes.status === 200) {
    try {
      return JSON.parse(loginRes.body).data?.accessToken;
    } catch { return null; }
  }
  return null;
}

export default function () {
  const token = getAuthToken();
  if (!token) {
    failureRate.add(1);
    sleep(1);
    return;
  }

  const params = {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
    tags: { name: 'admin_analytics' },
  };

  const res = http.get(`${BASE_URL}/api/v1/admin/analytics`, params);

  const passed = check(res, {
    'status is 200': (r) => r.status === 200,
    'has revenue data': (r) => {
      try { return JSON.parse(r.body).data?.revenue?.total !== undefined; }
      catch { return false; }
    },
    'response time < 2s': (r) => r.timings.duration < 2000,
  });

  failureRate.add(!passed);
  analyticsTrend.add(res.timings.duration);

  sleep(1);
}
