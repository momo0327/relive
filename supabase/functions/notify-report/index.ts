// Called by a database trigger whenever a report is filed. Sends a short
// notification so reports get a timely response (App Review guideline 1.2).
//
// Channels (configure one with `supabase secrets set`):
//   • Email via Resend: RESEND_API_KEY, REPORT_EMAIL_TO, optional REPORT_EMAIL_FROM
//   • Webhook (Slack/Discord-compatible JSON): REPORT_WEBHOOK_URL
// Protected by the same internal secret as purge-media (x-purge-secret).
import { adminClient, json } from '../_shared/admin.ts';

Deno.serve(async (req) => {
  const secret = Deno.env.get('PURGE_SECRET');
  if (!secret || req.headers.get('x-purge-secret') !== secret) return json({ error: 'unauthorized' }, 401);

  let reportId: string | undefined;
  try {
    reportId = (await req.json())?.report_id;
  } catch {
    // fall through
  }
  if (!reportId) return json({ error: 'missing report_id' }, 400);

  try {
    const admin = adminClient();
    const { data: report, error } = await admin
      .from('reports')
      .select('id, reason, details, created_at, trip_id, media_id, reported_user_id, trips(name)')
      .eq('id', reportId)
      .maybeSingle();
    if (error) throw error;
    if (!report) return json({ error: 'not_found' }, 404);

    const projectRef = new URL(Deno.env.get('SUPABASE_URL') ?? '').hostname.split('.')[0];
    const tripName = (report.trips as { name?: string } | null)?.name ?? 'unknown trip';
    const target = report.media_id ? 'a memory' : 'a member';
    const subject = `Relive report: ${report.reason} (${target})`;
    const text = [
      `A ${report.reason} report was filed about ${target} in “${tripName}”.`,
      report.details ? `Details: ${report.details}` : null,
      `Report ID: ${report.id}`,
      `Review it: https://supabase.com/dashboard/project/${projectRef}/editor (table: reports)`,
      'Respond within 24 hours as promised in the app.',
    ]
      .filter(Boolean)
      .join('\n');

    const sent: string[] = [];
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const emailTo = Deno.env.get('REPORT_EMAIL_TO');
    if (resendKey && emailTo) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: Deno.env.get('REPORT_EMAIL_FROM') ?? 'Relive Reports <onboarding@resend.dev>',
          to: [emailTo],
          subject,
          text,
        }),
      });
      if (res.ok) sent.push('email');
    }
    const webhook = Deno.env.get('REPORT_WEBHOOK_URL');
    if (webhook) {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: `${subject}\n${text}`, content: `${subject}\n${text}` }),
      });
      if (res.ok) sent.push('webhook');
    }
    if (!sent.length) console.warn('notify-report: no notification channel configured');
    return json({ sent });
  } catch (err) {
    console.error('notify-report failed', err instanceof Error ? err.message : 'unknown');
    return json({ error: 'notify_failed' }, 500);
  }
});
