import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildBot } from '../src/bot.js';

const bot = buildBot();
let initialized = false;

export default async function (req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  const expected = process.env.WEBHOOK_SECRET;
  if (expected) {
    const got = req.headers['x-telegram-bot-api-secret-token'];
    if (got !== expected) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
  }

  try {
    if (!initialized) {
      await bot.init();
      initialized = true;
    }
    await bot.handleUpdate(req.body);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('webhook failed', err);
    return res.status(200).json({ ok: false }); // 200 so Telegram won't retry forever
  }
}
