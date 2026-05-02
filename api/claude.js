// ═══════════════════════════════════════════════════════
//  api/claude.js — Vercel Serverless Function
//  Proxy sécurisé pour l'API Anthropic
//  Clé dans ANTHROPIC_API_KEY (variable Vercel)
// ═══════════════════════════════════════════════════════

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY manquante',
      hint: 'Vercel → Settings → Environment Variables → ANTHROPIC_API_KEY'
    });
  }

  try {
    const body = req.body;
   if (!body.model) body.model = 'claude-sonnet-4-5-20250929';
    if (!body.max_tokens) body.max_tokens = 1000;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    return res.status(response.status).json(data);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
