import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://lms_nginx:80';

const failureRate = new Rate('failed_requests');

export const options = {
  stages: [
    { duration: '10s', target: 50 },
    { duration: '10s', target: 50 },
    { duration: '5s', target: 0 },
  ],
  thresholds: {
    failed_requests: ['rate<0.80'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/api/v1/courses?page=1&limit=5`, {
    headers: { 'Accept': 'application/json' },
    tags: { name: 'rate_limit_test' },
  });

  if (res.status === 429 || res.status === 503) {
    failureRate.add(0);
  } else {
    const passed = check(res, { 'status is 200 or rate-limited': (r) => r.status === 200 });
    failureRate.add(!passed);
  }

  sleep(0.1);
}
