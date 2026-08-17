import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import Redis from 'ioredis';

@Injectable()
export class StorageService {
    private readonly pool: Pool;
    private readonly redis: Redis;
    private redisConnected = false;

    constructor() {
        this.pool = new Pool({
            host: process.env.POSTGRES_HOST ?? 'localhost',
            port: Number(process.env.POSTGRES_PORT ?? 5432),
            user: process.env.POSTGRES_USER ?? 'perf',
            password: process.env.POSTGRES_PASSWORD ?? 'perf',
            database: process.env.POSTGRES_DB ?? 'perf_lab',
            max: 5,
        });

        this.redis = new Redis({
            host: process.env.REDIS_HOST ?? 'localhost',
            port: Number(process.env.REDIS_PORT ?? 6379),
            lazyConnect: true,
            maxRetriesPerRequest: 1,
        });
    }

    async checkPostgres(): Promise<boolean> {
        try {
            await this.pool.query('SELECT 1');
            return true;
        } catch {
            return false;
        }
    }

    async checkRedis(): Promise<boolean> {
        try {
            if (!this.redisConnected) {
                await this.redis.connect();
                this.redisConnected = true;
            }
            const pong = await this.redis.ping();
            return pong === 'PONG';
        } catch {
            this.redisConnected = false;
            return false;
        }
    }

    async dbIndexing(indexed: boolean): Promise<{ indexed: boolean; elapsedMs: number; ok: boolean; details: string }> {
        const started = performance.now();
        try {
            await this.pool.query('CREATE TABLE IF NOT EXISTS lab_users(id SERIAL PRIMARY KEY, email TEXT, payload TEXT)');
            if (indexed) {
                await this.pool.query('CREATE INDEX IF NOT EXISTS idx_lab_users_email ON lab_users(email)');
            } else {
                await this.pool.query('DROP INDEX IF EXISTS idx_lab_users_email');
            }
            await this.pool.query(
                "INSERT INTO lab_users(email, payload) VALUES($1, $2) ON CONFLICT DO NOTHING",
                [`user-${Math.floor(Math.random() * 100000)}@lab.dev`, 'payload'],
            );
            await this.pool.query('SELECT * FROM lab_users WHERE email LIKE $1 LIMIT 10', ['user-%']);
            const elapsedMs = Math.round((performance.now() - started) * 100) / 100;
            return { indexed, elapsedMs, ok: true, details: indexed ? 'indexed query path' : 'non-indexed query path' };
        } catch (error) {
            const elapsedMs = Math.round((performance.now() - started) * 100) / 100;
            return { indexed, elapsedMs, ok: false, details: `db unavailable: ${(error as Error).message}` };
        }
    }

    async cacheDemo(key: string): Promise<{ key: string; hit: boolean; value: string; elapsedMs: number; details: string }> {
        const started = performance.now();
        try {
            if (!this.redisConnected) {
                await this.redis.connect();
                this.redisConnected = true;
            }
            const existing = await this.redis.get(key);
            if (existing) {
                const elapsedMs = Math.round((performance.now() - started) * 100) / 100;
                return { key, hit: true, value: existing, elapsedMs, details: 'cache hit' };
            }
            const value = `generated-${Date.now()}`;
            await this.redis.setex(key, 30, value);
            const elapsedMs = Math.round((performance.now() - started) * 100) / 100;
            return { key, hit: false, value, elapsedMs, details: 'cache miss -> value computed and cached' };
        } catch (error) {
            this.redisConnected = false;
            const elapsedMs = Math.round((performance.now() - started) * 100) / 100;
            return { key, hit: false, value: 'unavailable', elapsedMs, details: `redis unavailable: ${(error as Error).message}` };
        }
    }
}
