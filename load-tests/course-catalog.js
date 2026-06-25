import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://lms_nginx:80';

const failureRate = new Rate('failed_requests');
const catalogTrend = new Trend('catalog_duration');

export const options = {
  stages: [
    { duration: '20s', target: 5 },
    { duration: '30s', target: 15 },
    { duration: '20s', target: 0 },
  ],
  thresholds: {
    failed_requests: ['rate<0.05'],
    catalog_duration: ['p(95)<500'],
  },
};

export default function () {
  const params = {
    headers: { 'Accept': 'application/json' },
    tags: { name: 'course_catalog' },
  };

  const res = http.get(`${BASE_URL}/api/v1/courses?page=1&limit=12&sort=newest`, params);

  const passed = check(res, {
    'status is 200': (r) => r.status === 200,
    'has data array': (r) => {
      try { return Array.isArray(JSON.parse(r.body).data); }
      catch { return false; }
    },
    'response time < 1s': (r) => r.timings.duration < 1000,
  });

  failureRate.add(!passed);
  catalogTrend.add(res.timings.duration);

  sleep(1);
}
