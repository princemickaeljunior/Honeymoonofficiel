const admin = require('firebase-admin');

// Init Firebase Admin (utilise les variables d'environnement)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();
const auth = admin.auth();

// Map catégorie → préfixe page
const CATEGORY_MAP = {
  'honey-girl': 'hg',
  'original': 'or',
  'ambassadrice': 'am',
  'star': 'st'
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email, password, username, category, number } = req.body;

  if (!email || !password || !username || !category || !number) {
    return res.status(400).json({ error: 'Champs manquants' });
  }

  const prefix = CATEGORY_MAP[category];
  if (!prefix) return res.status(400).json({ error: 'Catégorie invalide' });

  const pageId = `${prefix}-${number}`; // ex: hg-1, or-2

  try {
    // Créer le compte Firebase Auth
    const user = await auth.createUser({ email, password });

    // Sauvegarder dans Firestore
    await db.collection('creators').doc(pageId).set({
      uid: user.uid,
      email,
      username,
      category,
      pageId,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      status: 'away',
      photo: '',
      bio: '',
      telegram: '',
      links: {}
    }, { merge: true });

    // Lier uid → pageId
    await db.collection('creator_accounts').doc(user.uid).set({
      pageId,
      email,
      username,
      category
    });

    res.status(200).json({ success: true, pageId, uid: user.uid });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
