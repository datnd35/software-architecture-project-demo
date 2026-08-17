import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 5,
  duration: '20s',
};

export default function () {
  const endpoints = [
    'http://nginx/api/health',
    'http://nginx/api/lab/cpu?ms=50',
    'http://nginx/api/lab/latency?ms=100',
    'http://nginx/api/lab/queue?jobs=30&workers=4'
  ];

  const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
  const res = http.get(endpoint);
  check(res, {
    'status is 200': (r) => r.status === 200,
  });
  sleep(0.3);
}
