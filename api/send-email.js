export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
  if (!SENDGRID_API_KEY) return res.status(500).json({ error: 'API key missing' });
  const { type, to, name, points, plan } = req.body;
  if (!to || !type) return res.status(400).json({ error: 'Missing fields' });
  let subject, html;
  if (type === 'welcome') {
    subject = '✦ Bienvenue sur HoneyMoon';
    html = `<div style="background:#04020a;padding:40px 20px;font-family:Georgia,serif;max-width:520px;margin:0 auto;"><div style="text-align:center;margin-bottom:28px;border-bottom:1px solid rgba(201,148,58,0.2);padding-bottom:20px;"><p style="font-size:26px;font-weight:300;color:#E2AF50;letter-spacing:0.15em;margin:0;">HONEYMOON</p></div><p style="font-size:24px;color:#ede5db;margin:0 0 12px;">Bienvenue${name?', '+name:''} ✦</p><p style="font-size:13px;color:rgba(237,229,219,0.6);line-height:1.8;margin:0 0 20px;">Votre compte est actif. Vous faites partie du cercle privé HoneyMoon.</p><div style="background:rgba(201,148,58,0.06);border:1px solid rgba(201,148,58,0.2);padding:20px;margin-bottom:24px;text-align:center;"><p style="font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:rgba(201,148,58,0.5);margin:0 0 8px;">Cadeau de bienvenue</p><p style="font-size:42px;color:#E2AF50;margin:0;">${points||50}</p><p style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(201,148,58,0.6);margin:4px 0 0;">Points offerts</p></div><div style="text-align:center;margin-bottom:28px;"><a href="https://honeymoonofficiel.vercel.app" style="display:inline-block;padding:15px 40px;background:linear-gradient(135deg,#C9943A,#E2AF50);color:#04020a;font-size:10px;font-weight:700;letter-spacing:0.3em;text-transform:uppercase;text-decoration:none;">Accéder à mon espace →</a></div><p style="font-size:10px;color:rgba(237,229,219,0.2);text-align:center;">HoneyMoon · +18 · Espace Membre Privé</p></div>`;
  } else if (type === 'subscription') {
    subject = '✦ Votre accès est actif — HoneyMoon';
    html = `<div style="background:#04020a;padding:40px 20px;font-family:Georgia,serif;max-width:520px;margin:0 auto;"><p style="font-size:24px;color:#E2AF50;text-align:center;margin:0 0 20px;">HONEYMOON</p><p style="font-size:22px;color:#ede5db;margin:0 0 12px;">Accès confirmé ✦</p><p style="font-size:13px;color:rgba(237,229,219,0.6);line-height:1.8;margin:0 0 20px;">${name?name+', votre':'Votre'} abonnement est actif.</p><div style="background:rgba(201,148,58,0.06);border:1px solid rgba(201,148,58,0.2);padding:18px;margin-bottom:24px;"><p style="font-size:10px;letter-spacing:0.25em;text-transform:uppercase;color:rgba(201,148,58,0.5);margin:0 0 6px;">Formule</p><p style="font-size:20px;color:#E2AF50;margin:0;">${plan||'Honey Girl'}</p></div><div style="text-align:center;"><a href="https://honeymoonofficiel.vercel.app" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#C9943A,#E2AF50);color:#04020a;font-size:10px;font-weight:700;letter-spacing:0.28em;text-transform:uppercase;text-decoration:none;">Accéder maintenant →</a></div><p style="font-size:10px;color:rgba(237,229,219,0.2);text-align:center;margin-top:20px;">HoneyMoon · +18</p></div>`;
  } else {
    return res.status(400).json({ error: 'Unknown type' });
  }
  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to, name: name||'' }] }],
        from: { email: 'honeymoon-official@outlook.com', name: 'HoneyMoon' },
        reply_to: { email: 'honeymoon-official@outlook.com', name: 'HoneyMoon' },
        subject: subject,
        content: [{ type: 'text/html', value: html }]
      })
    });
    if (response.ok || response.status === 202) return res.status(200).json({ success: true });
    const err = await response.text();
    return res.status(500).json({ error: err });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
