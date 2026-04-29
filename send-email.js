// ════════════════════════════════════════════════════════
//  HoneyMoon — Vercel Serverless Function
//  Fichier : api/send-email.js
//  Rôle : Envoyer les emails via SendGrid de façon sécurisée
//  La clé API est dans les variables d'environnement Vercel
// ════════════════════════════════════════════════════════

export default async function handler(req, res) {
  // CORS — autoriser uniquement le site HoneyMoon
  res.setHeader('Access-Control-Allow-Origin', 'https://honeymoonofficiel.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Répondre aux preflight OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Accepter uniquement les POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Clé API depuis les variables d'environnement Vercel (jamais dans le code)
  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
  if (!SENDGRID_API_KEY) {
    return res.status(500).json({ error: 'SendGrid API key not configured' });
  }

  // Récupérer les données de la requête
  const { type, to, name, points, plan, subject: customSubject, html: customHtml } = req.body;

  if (!to || !type) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // ── Templates emails ──
  let subject, html;

  if (type === 'custom') {
    // Email personnalisé depuis l'ancien système
    subject = customSubject || '✦ HoneyMoon';
    html = customHtml || '';
  } else if (type === 'welcome') {
    // Email de bienvenue
    subject = '✦ Bienvenue sur HoneyMoon';
    html = `
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bienvenue sur HoneyMoon</title>
</head>
<body style="margin:0;padding:0;background:#04020a;font-family:'Georgia',serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 20px;">

    <!-- Header -->
    <div style="text-align:center;margin-bottom:32px;border-bottom:1px solid rgba(201,148,58,0.2);padding-bottom:24px;">
      <div style="display:inline-block;border:1px solid #C9943A;padding:10px 20px;margin-bottom:16px;">
        <span style="font-family:'Georgia',serif;font-size:22px;color:#E2AF50;letter-spacing:0.15em;">HM</span>
      </div>
      <div>
        <span style="font-family:'Georgia',serif;font-size:28px;font-weight:300;color:#ede5db;letter-spacing:0.2em;display:block;">HONEYMOON</span>
        <span style="font-size:10px;letter-spacing:0.4em;text-transform:uppercase;color:rgba(201,148,58,0.5);">Espace Membre</span>
      </div>
    </div>

    <!-- Message principal -->
    <div style="margin-bottom:28px;">
      <p style="font-family:'Georgia',serif;font-size:26px;font-weight:300;color:#ede5db;margin:0 0 8px;line-height:1.2;">
        Bienvenue${name ? ', ' + name : ''} ✦
      </p>
      <p style="font-size:14px;color:rgba(237,229,219,0.6);line-height:1.8;margin:0 0 20px;">
        Votre compte HoneyMoon est actif. Vous faites maintenant partie du cercle privé.
      </p>
    </div>

    <!-- Points de bienvenue -->
    <div style="background:rgba(201,148,58,0.06);border:1px solid rgba(201,148,58,0.2);padding:20px;margin-bottom:24px;text-align:center;">
      <span style="font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:rgba(201,148,58,0.5);display:block;margin-bottom:8px;">Cadeau de bienvenue</span>
      <span style="font-family:'Georgia',serif;font-size:42px;color:#E2AF50;display:block;line-height:1;">${points || 50}</span>
      <span style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(201,148,58,0.6);">Points offerts</span>
      <p style="font-size:12px;color:rgba(237,229,219,0.5);margin:10px 0 0;line-height:1.6;">
        Utilisez vos points pour chatter en privé avec les créatrices<br>ou débloquer du contenu exclusif.
      </p>
    </div>

    <!-- Ce que vous pouvez faire -->
    <div style="margin-bottom:28px;">
      <p style="font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:rgba(201,148,58,0.4);margin:0 0 14px;">Votre accès</p>
      <div style="border-left:2px solid rgba(201,148,58,0.3);padding-left:16px;margin-bottom:10px;">
        <span style="font-size:13px;color:rgba(237,229,219,0.8);">💬 Chat privé avec les créatrices</span>
      </div>
      <div style="border-left:2px solid rgba(201,148,58,0.3);padding-left:16px;margin-bottom:10px;">
        <span style="font-size:13px;color:rgba(237,229,219,0.8);">🎬 Contenu exclusif débloquable</span>
      </div>
      <div style="border-left:2px solid rgba(201,148,58,0.3);padding-left:16px;margin-bottom:10px;">
        <span style="font-size:13px;color:rgba(237,229,219,0.8);">✦ Honey Chat — votre guide IA</span>
      </div>
      <div style="border-left:2px solid rgba(201,148,58,0.3);padding-left:16px;">
        <span style="font-size:13px;color:rgba(237,229,219,0.8);">◈ Points à gagner en jouant</span>
      </div>
    </div>

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:32px;">
      <a href="https://honeymoonofficiel.vercel.app" style="display:inline-block;padding:15px 40px;background:linear-gradient(135deg,#C9943A,#E2AF50);color:#04020a;font-size:10px;font-weight:700;letter-spacing:0.3em;text-transform:uppercase;text-decoration:none;">
        Accéder à mon espace →
      </a>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding-top:24px;border-top:1px solid rgba(201,148,58,0.1);">
      <p style="font-size:10px;color:rgba(237,229,219,0.25);letter-spacing:0.15em;margin:0 0 6px;">
        HoneyMoon · Espace Membre Privé · +18
      </p>
      <p style="font-size:10px;color:rgba(237,229,219,0.2);margin:0;">
        Vous recevez cet email car vous vous êtes inscrit sur HoneyMoon.<br>
        <a href="https://honeymoonofficiel.vercel.app" style="color:rgba(201,148,58,0.4);text-decoration:none;">Se désabonner</a>
      </p>
    </div>

  </div>
</body>
</html>`;

  } else if (type === 'subscription') {
    // Email confirmation abonnement créatrice
    subject = '✦ Votre accès est actif — HoneyMoon';
    html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#04020a;font-family:'Georgia',serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:28px;border-bottom:1px solid rgba(201,148,58,0.2);padding-bottom:20px;">
      <span style="font-family:'Georgia',serif;font-size:24px;font-weight:300;color:#ede5db;letter-spacing:0.2em;display:block;">HONEYMOON</span>
    </div>
    <p style="font-family:'Georgia',serif;font-size:22px;color:#ede5db;margin:0 0 16px;">Accès confirmé ✦</p>
    <p style="font-size:13px;color:rgba(237,229,219,0.6);line-height:1.8;margin:0 0 20px;">
      ${name ? name + ', votre' : 'Votre'} abonnement est actif. Vous pouvez maintenant accéder au contenu exclusif et chatter en privé.
    </p>
    <div style="background:rgba(201,148,58,0.06);border:1px solid rgba(201,148,58,0.2);padding:18px;margin-bottom:24px;">
      <span style="font-size:10px;letter-spacing:0.25em;text-transform:uppercase;color:rgba(201,148,58,0.5);display:block;margin-bottom:6px;">Formule</span>
      <span style="font-family:'Georgia',serif;font-size:20px;color:#E2AF50;">${plan || 'Honey Girl'}</span>
    </div>
    <div style="text-align:center;margin-bottom:28px;">
      <a href="https://honeymoonofficiel.vercel.app" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#C9943A,#E2AF50);color:#04020a;font-size:10px;font-weight:700;letter-spacing:0.28em;text-transform:uppercase;text-decoration:none;">
        Accéder maintenant →
      </a>
    </div>
    <div style="text-align:center;padding-top:20px;border-top:1px solid rgba(201,148,58,0.1);">
      <p style="font-size:10px;color:rgba(237,229,219,0.2);margin:0;">HoneyMoon · Espace Membre · +18</p>
    </div>
  </div>
</body>
</html>`;

  } else if (type === 'login') {
    // Email confirmation connexion
    subject = '✦ Connexion à votre compte HoneyMoon';
    html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#04020a;font-family:'Georgia',serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:24px;">
      <span style="font-family:'Georgia',serif;font-size:24px;color:#ede5db;letter-spacing:0.2em;">HONEYMOON</span>
    </div>
    <p style="font-family:'Georgia',serif;font-size:20px;color:#ede5db;margin:0 0 12px;">Nouvelle connexion détectée</p>
    <p style="font-size:13px;color:rgba(237,229,219,0.6);line-height:1.8;margin:0 0 20px;">
      ${name ? name + ', une' : 'Une'} connexion vient d'être effectuée sur votre compte HoneyMoon.<br>
      Si ce n'est pas vous, changez votre mot de passe immédiatement.
    </p>
    <div style="text-align:center;">
      <a href="https://honeymoonofficiel.vercel.app" style="display:inline-block;padding:13px 32px;background:linear-gradient(135deg,#C9943A,#E2AF50);color:#04020a;font-size:10px;font-weight:700;letter-spacing:0.25em;text-transform:uppercase;text-decoration:none;">
        Accéder à mon compte →
      </a>
    </div>
    <div style="text-align:center;margin-top:24px;">
      <p style="font-size:10px;color:rgba(237,229,219,0.2);">HoneyMoon · +18</p>
    </div>
  </div>
</body>
</html>`;
  } else {
    return res.status(400).json({ error: 'Unknown email type' });
  }

  // ── Envoyer via SendGrid API ──
  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to, name: name || '' }] }],
        from: {
          email: 'honeymoon-official@outlook.com',
          name: 'HoneyMoon'
        },
        reply_to: {
          email: 'honeymoon-official@outlook.com',
          name: 'HoneyMoon'
        },
        subject: subject,
        content: [{ type: 'text/html', value: html }]
      })
    });

    if (response.ok || response.status === 202) {
      return res.status(200).json({ success: true, type });
    } else {
      const error = await response.text();
      console.error('SendGrid error:', error);
      return res.status(500).json({ error: 'SendGrid failed', details: error });
    }
  } catch (err) {
    console.error('Send error:', err);
    return res.status(500).json({ error: err.message });
  }
}
