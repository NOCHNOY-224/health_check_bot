import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runChecks } from '../src/checker.js';

export default async function (req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(500).json({ ok: false, error: 'CRON_SECRET not set' });
  }
  const auth = req.headers.authorization ?? '';
  // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>".
  // Also allow the same secret via query param for manual triggering.
  const qSecret =
    typeof req.query.secret === 'string' ? req.query.secret : undefined;
  if (auth !== `Bearer ${secret}` && qSecret !== secret) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  try {
    const result = await runChecks();
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('cron failed', err);
    return res
      .status(500)
      .json({ ok: false, error: (err as Error).message ?? 'unknown' });
  }
}
