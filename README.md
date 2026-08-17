# Performance Engineering Lab

Educational lab to visualize and measure core performance engineering concepts:

- Efficiency
- Concurrency
- Capacity
- Queue buildup
- Latency / Throughput
- CPU / Network / Disk / Memory latency
- Database indexing
- Caching
- Lock contention / CAS / Deadlock
- Amdahl's Law / Universal Scalability Law

## Stack

- Angular + TypeScript (`frontend/`)
- NestJS + Node.js + TypeScript (`backend/`)
- PostgreSQL + Redis
- NGINX reverse proxy
- Prometheus + Grafana
- k6 load tests

## Architecture

```text
Angular
   │
   ▼
NGINX
   │
   ▼
NestJS
   ├── PostgreSQL
   └── Redis

Prometheus ──► NestJS metrics
Grafana ─────► Prometheus

k6 ──────────► NGINX/API
```

## Quick start

1. Copy `.env.example` to `.env`.
2. Start all services with Docker Compose.
3. Open:
   - App: `http://localhost:8080`
   - API health: `http://localhost:8080/api/health`
   - Metrics: `http://localhost:3000/metrics`
   - Prometheus: `http://localhost:9090`
   - Grafana: `http://localhost:3001` (default `admin/admin`)

## Folder map

- `frontend/`: Angular UI for interactive demos.
- `backend/`: NestJS API, simulation endpoints, Prometheus metrics.
- `nginx/`: Reverse proxy config.
- `infrastructure/prometheus/`: Prometheus scrape config.
- `infrastructure/grafana/`: Provisioned datasource and dashboard.
- `infrastructure/k6/`: k6 load scripts.
# software-architecture-project-demo
