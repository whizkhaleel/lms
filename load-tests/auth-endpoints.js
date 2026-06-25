import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://nginx:80';

const failureRate = new Rate('failed_requests');

export const options = {
  stages: [
    { duration: '10s', target: 2 },
    { duration: '20s', target: 5 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    failed_requests: ['rate<0.05'],
    http_req_duration: ['p(95)<3000'],
  },
};

export default function () {
  // Attempt login with bad credentials (should 401)
  const badLogin = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ email: 'nonexistent@test.com', password: 'wrong' }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'auth_login_fail' } }
  );

  check(badLogin, {
    'bad login returns 401': (r) => r.status === 401,
  });

  if (badLogin.status === 429) {
    console.log('Rate limited on auth — this is expected');
  }

  sleep(3);
}
