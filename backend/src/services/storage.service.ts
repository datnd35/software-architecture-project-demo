import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import Redis from 'ioredis';

@Injectable()
export class StorageService {
    private readonly pool: Pool;
    private readonly redis: Redis;
    private redisConnected = false;
    private cacheTableReady = false;

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

    async getCacheValue(key: string): Promise<{ value: string | null; latencyMs: number }> {
        const started = performance.now();
        if (!this.redisConnected) {
            await this.redis.connect();
            this.redisConnected = true;
        }
        const value = await this.redis.get(key);
        const latencyMs = Number((performance.now() - started).toFixed(3));
        return { value, latencyMs };
    }

    async setCacheValue(key: string, value: string, ttlSeconds: number): Promise<{ latencyMs: number }> {
        const started = performance.now();
        if (!this.redisConnected) {
            await this.redis.connect();
            this.redisConnected = true;
        }
        await this.redis.setex(key, ttlSeconds, value);
        const latencyMs = Number((performance.now() - started).toFixed(3));
        return { latencyMs };
    }

    async clearCacheByPrefix(prefix: string): Promise<number> {
        if (!this.redisConnected) {
            await this.redis.connect();
            this.redisConnected = true;
        }

        const keys = await this.redis.keys(`${prefix}*`);
        if (keys.length === 0) {
            return 0;
        }

        await this.redis.del(...keys);
        return keys.length;
    }

    async getUserById(id: number): Promise<{ user: { id: number; name: string; email: string }; latencyMs: number }> {
        await this.ensureCacheUsersTable();
        const started = performance.now();

        const { rows } = await this.pool.query<{ id: number; name: string; email: string }>(
            'SELECT id, name, email FROM cache_users WHERE id = $1 LIMIT 1',
            [id],
        );

        let user = rows[0];
        if (!user) {
            const generated = {
                id,
                name: `User ${id}`,
                email: `user${id}@pel.local`,
            };
            await this.pool.query(
                'INSERT INTO cache_users(id, name, email) VALUES($1, $2, $3) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email',
                [generated.id, generated.name, generated.email],
            );
            user = generated;
        }

        const latencyMs = Number((performance.now() - started).toFixed(3));
        return { user, latencyMs };
    }

    private async ensureCacheUsersTable(): Promise<void> {
        if (this.cacheTableReady) {
            return;
        }

        await this.pool.query(
            'CREATE TABLE IF NOT EXISTS cache_users(id INT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL)',
        );
        this.cacheTableReady = true;
    }
}
