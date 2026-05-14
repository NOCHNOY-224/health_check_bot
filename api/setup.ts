import type { VercelRequest, VercelResponse } from '@vercel/node';
import { BOT_COMMANDS } from '../src/bot';
import { bot } from '../src/telegram';

export default async function (req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(500).json({ ok: false, error: 'CRON_SECRET not set' });
  }
  const provided =
    typeof req.query.secret === 'string' ? req.query.secret : undefined;
  if (provided !== secret) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const host = req.headers.host;
  const proto =
    (req.headers['x-forwarded-proto'] as string | undefined) ?? 'https';
  if (!host) {
    return res.status(400).json({ ok: false, error: 'no host header' });
  }
  const webhookUrl = `${proto}://${host}/api/webhook`;
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookSecret) {
    return res
      .status(500)
      .json({ ok: false, error: 'WEBHOOK_SECRET not set' });
  }

  try {
    const api = bot().api;
    await api.setWebhook(webhookUrl, {
      secret_token: webhookSecret,
      drop_pending_updates: true,
      allowed_updates: ['message', 'callback_query'],
    });
    await api.setMyCommands(BOT_COMMANDS);
    const info = await api.getWebhookInfo();
    return res.status(200).json({
      ok: true,
      webhook: webhookUrl,
      info,
      commands: BOT_COMMANDS.length,
    });
  } catch (err) {
    console.error('setup failed', err);
    return res
      .status(500)
      .json({ ok: false, error: (err as Error).message ?? 'unknown' });
  }
}
