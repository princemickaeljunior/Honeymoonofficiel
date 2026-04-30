// api/send-email.js — Vercel Function HoneyMoon
// Clé : SENDGRID_API_KEY dans Vercel Environment Variables

const FROM_EMAIL = 'honeymoon-official@outlook.com';
const FROM_NAME  = 'HoneyMoon ✦';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'SendGrid API key not configured' });

  const { type, to, name, points, subject, html } = req.body || {};
  if (!to || !to.includes('@')) return res.status(400).json({ error: 'Invalid email' });

  let emailSubject, emailHtml;

  // ── TYPE : welcome ──
  if (type === 'welcome') {
    emailSubject = `✦ Bienvenue sur HoneyMoon, ${name || 'Member'} — ${points || 50} points offerts`;
    emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#1c1045;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:40px 20px;">

    <!-- Logo -->
    <div style="text-align:center;margin-bottom:32px;">
      <p style="font-size:26px;font-weight:300;color:#f2d270;letter-spacing:0.2em;margin:0;">H O N E Y M O O N</p>
      <div style="width:60px;height:1px;background:linear-gradient(to right,transparent,#d6a94e,transparent);margin:14px auto;"></div>
      <p style="font-size:9px;letter-spacing:0.4em;text-transform:uppercase;color:rgba(214,169,78,0.5);margin:0;">Cercle privé · +18</p>
    </div>

    <!-- Welcome -->
    <h1 style="font-size:22px;font-weight:300;color:#faf6f0;margin:0 0 10px;">Bienvenue, ${name || 'Member'} ✦</h1>
    <p style="color:rgba(214,169,78,0.85);font-size:14px;line-height:1.8;margin:0 0 24px;">
      Votre compte HoneyMoon est actif. Vous faites maintenant partie du cercle privé.
    </p>

    <!-- Points -->
    <div style="background:rgba(214,169,78,0.08);border:1px solid rgba(214,169,78,0.25);padding:20px;margin-bottom:28px;text-align:center;">
      <p style="font-size:9px;letter-spacing:0.35em;text-transform:uppercase;color:rgba(214,169,78,0.55);margin:0 0 8px;">Points offerts</p>
      <p style="font-size:42px;font-weight:300;color:#f2d270;margin:0 0 4px;line-height:1;">${points || 50}</p>
      <p style="font-size:11px;color:rgba(214,169,78,0.6);margin:0;">crédités sur votre compte</p>
    </div>

    <!-- Usage points -->
    <div style="border:1px solid rgba(214,169,78,0.12);padding:18px;margin-bottom:24px;">
      <p style="font-size:9px;letter-spacing:0.3em;text-transform:uppercase;color:rgba(214,169,78,0.45);margin:0 0 12px;">Utiliser vos points</p>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(214,169,78,0.07);">
        <span style="font-size:12px;color:rgba(245,240,232,0.6);">Message privé</span>
        <span style="font-size:12px;color:#e8c060;">5 pts</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(214,169,78,0.07);">
        <span style="font-size:12px;color:rgba(245,240,232,0.6);">Photo PPV exclusive</span>
        <span style="font-size:12px;color:#e8c060;">50 pts</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;">
        <span style="font-size:12px;color:rgba(245,240,232,0.6);">Vidéo PPV exclusive</span>
        <span style="font-size:12px;color:#e8c060;">150 pts</span>
      </div>
    </div>

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:32px;">
      <a href="https://honeymoonofficiel.vercel.app" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#d4a843,#e8c060);color:#0f0a1e;font-size:10px;font-weight:700;letter-spacing:0.3em;text-transform:uppercase;text-decoration:none;">
        Accéder au cercle →
      </a>
    </div>

    <!-- Footer -->
    <div style="border-top:1px solid rgba(214,169,78,0.1);padding-top:20px;text-align:center;">
      <p style="font-size:10px;color:rgba(214,169,78,0.3);margin:0;">© HoneyMoon · Contenu adulte +18 · Accès privé</p>
      <p style="font-size:10px;color:rgba(214,169,78,0.2);margin:6px 0 0;">honeymoon-official@outlook.com</p>
    </div>

  </div>
</body>
</html>`;
  }

  // ── TYPE : custom ──
  else if (type === 'custom') {
    emailSubject = subject || '✦ HoneyMoon';
    emailHtml    = html    || '<p>Message de HoneyMoon</p>';
  }

  else {
    return res.status(400).json({ error: 'Unknown email type' });
  }

  // ── Appel SendGrid ──
  try {
    const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: emailSubject,
        content: [{ type: 'text/html', value: emailHtml }]
      })
    });

    if (sgRes.ok || sgRes.status === 202) {
      return res.status(200).json({ ok: true });
    } else {
      const err = await sgRes.text();
      console.error('SendGrid error:', err);
      return res.status(500).json({ error: 'SendGrid failed', detail: err });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
