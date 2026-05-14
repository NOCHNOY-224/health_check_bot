import { Redis } from '@upstash/redis';
import type { User } from './types';

let _redis: Redis | null = null;

export function redis(): Redis {
  if (_redis) return _redis;

  const url =
    process.env.KV_REST_API_URL ??
    process.env.UPSTASH_REDIS_REST_URL ??
    '';
  const token =
    process.env.KV_REST_API_TOKEN ??
    process.env.UPSTASH_REDIS_REST_TOKEN ??
    '';

  if (!url || !token) {
    throw new Error(
      'KV is not configured. Set KV_REST_API_URL / KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).',
    );
  }
  _redis = new Redis({ url, token });
  return _redis;
}

const USERS_SET = 'users';
const userKey = (tgId: number) => `user:${tgId}`;

export async function getUser(tgId: number): Promise<User | null> {
  const raw = await redis().get<User | string>(userKey(tgId));
  if (raw == null) return null;
  // Upstash SDK auto-parses JSON for objects; tolerate strings too.
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  }
  return raw as User;
}

export async function saveUser(u: User): Promise<void> {
  await redis().set(userKey(u.tgId), JSON.stringify(u));
  await redis().sadd(USERS_SET, u.tgId);
}

export async function deleteUser(tgId: number): Promise<void> {
  await redis().del(userKey(tgId));
  await redis().srem(USERS_SET, tgId);
}

export async function listUserIds(): Promise<number[]> {
  const members = await redis().smembers(USERS_SET);
  return members.map((m) => Number(m)).filter((n) => Number.isFinite(n));
}
