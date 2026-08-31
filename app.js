
/* =========================================================
   HONEYMOON — Catalogue (front-end only)
   - Accès agence : réservé au vrai compte admin (Firebase Auth,
     email + mot de passe) — plus de mot de passe partagé en clair.
   Les données (texte, photos, vidéos, PDF contrat) sont
   sauvegardées dans le localStorage de CE navigateur
   uniquement. Le navigateur limite en général ce stockage
   à quelques Mo au total : des vidéos, même peu nombreuses,
   peuvent vite atteindre cette limite. Pour un vrai stockage
   illimité et partagé entre plusieurs appareils/agences, il
   faut un vrai backend (serveur + base de données / cloud
   storage) — dis-le moi si tu veux qu'on regarde cette étape.
   ========================================================= */

const CONTACT_EMAIL = 'honeymoon-official@outlook.com';

/* ---------------- indicateur de chargement global pour <img>/<video> -----------------
   Le site injecte énormément de contenu (photos, vidéos) via innerHTML un peu partout.
   Plutôt que de modifier chaque endroit un par un, on observe tout le document et on
   affiche un effet de chargement (shimmer) tant que le média n'est pas prêt, puis un
   fondu à l'apparition. Ça évite l'impression de "bug" quand une photo/vidéo met du
   temps à charger (réseau lent, Firebase Storage, etc.) — c'est maintenant visible
   comme un chargement normal, pas comme un blocage. */
function hmInitMediaLoading(el){
  if(el.dataset.hmMediaInit) return;
  el.dataset.hmMediaInit = '1';
  const isVideo = el.tagName === 'VIDEO';
  const ready = isVideo ? (el.readyState >= 2) : (el.complete && el.naturalWidth > 0);
  if(ready){ el.setAttribute('data-hm-loaded', ''); return; }
  el.setAttribute('data-hm-loading', '');
  const onReady = () => { el.removeAttribute('data-hm-loading'); el.setAttribute('data-hm-loaded', ''); };
  el.addEventListener(isVideo ? 'loadeddata' : 'load', onReady, { once:true });
  el.addEventListener('error', onReady, { once:true });
}
function hmScanMedia(root){
  (root || document).querySelectorAll('img:not([data-hm-media-init]), video:not([data-hm-media-init])').forEach(hmInitMediaLoading);
}
hmScanMedia();
if(window.MutationObserver){
  let hmScanScheduled = false;
  const hmObserver = new MutationObserver(() => {
    if(hmScanScheduled) return;
    hmScanScheduled = true;
    requestAnimationFrame(() => { hmScanScheduled = false; hmScanMedia(); });
  });
  hmObserver.observe(document.body, { childList:true, subtree:true });
}

/* ===== À REMPLIR : coordonnées bancaires affichées au client après sa demande de déblocage
   (en attendant l'ouverture d'un compte CCBill). Modifie les valeurs ci-dessous. ===== */
const PAYMENT_INSTRUCTIONS = {
  iban: 'FR76 XXXX XXXX XXXX XXXX XXXX XXX',
  bic: 'XXXXXXXX',
  holder: 'Prince Mickael',
  note: 'Merci d\'indiquer la référence de commande en libellé du virement.'
};
const DEFAULT_SPLIT_CREATOR_PERCENT = 60;

/* ===== À REMPLIR : notifications automatiques (email + WhatsApp) quand
   un client demande à débloquer un contenu payant.
   ------------------------------------------------------------------
   EMAIL (EmailJS — gratuit jusqu'à 200 emails/mois, sans backend) :
   1. Crée un compte sur https://www.emailjs.com
   2. Connecte ta boîte mail (Gmail/Outlook) comme "Email Service" → note son ID
   3. Crée un template avec les variables : {{to_email}} {{buyer_name}}
      {{buyer_contact}} {{creator_name}} {{item_desc}} {{price}} {{ref}}
   4. Remplace les 3 valeurs ci-dessous par les tiennes (Account → API Keys
      pour la clé publique)
   ------------------------------------------------------------------
   WHATSAPP : remplace par ton numéro Honeymoon au format international
   sans + ni espace (ex. 33612345678 pour la France). ===== */
const EMAILJS_PUBLIC_KEY = 'TON_EMAILJS_PUBLIC_KEY';
const EMAILJS_SERVICE_ID = 'TON_EMAILJS_SERVICE_ID';
const EMAILJS_TEMPLATE_ID = 'TON_EMAILJS_TEMPLATE_ID';
const ADMIN_NOTIFY_EMAIL = 'honeymoon-official@outlook.com';
const ADMIN_WHATSAPP_NUMBER = '33XXXXXXXXX';

async function sendUnlockNotifications(o){
  // Email — nécessite EmailJS configuré ci-dessus. Échoue silencieusement
  // (avec log console) si non configuré, sans bloquer la commande.
  try{
    if(typeof emailjs !== 'undefined' && EMAILJS_PUBLIC_KEY !== 'TON_EMAILJS_PUBLIC_KEY'){
      const payload = {
        buyer_name: o.buyerName, buyer_contact: o.buyerContact, creator_name: o.creatorName,
        item_desc: o.itemDesc || '', price: o.price, ref: o.ref
      };
      // Email au client (instructions de paiement)
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, Object.assign({}, payload, {
        to_email: o.buyerContact, subject: `Honeymoon — Instructions de paiement (réf. ${o.ref})`
      }));
      // Email à Honeymoon (notification de commande)
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, Object.assign({}, payload, {
        to_email: ADMIN_NOTIFY_EMAIL, subject: `Honeymoon — Nouvelle demande de déblocage (réf. ${o.ref})`
      }));
    }
  }catch(e){ console.error('emailjs notification error', e); }
}
function buildAdminWhatsappLink(o){
  const msg = encodeURIComponent(
    `Honeymoon — Nouvelle demande de déblocage\nRéf: ${o.ref}\nCréatrice: ${o.creatorName}\nClient: ${o.buyerName} (${o.buyerContact})\nContenu: ${o.itemDesc || ''}\nPrix: ${o.price}€`
  );
  return `https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${msg}`;
}
const STORAGE_KEY = 'hm_catalogue_v3';
/* ===== Accès agence par code : NE contient AUCUN mot de passe en clair.
   Le code tapé est utilisé comme mot de passe d'un compte Firebase technique
   dédié (email fixe ci-dessous). Pour créer/changer le code :
   Firebase Console → Authentication → Users → Add user, avec CET email exact
   et le code de ton choix comme mot de passe. Change-le à tout moment depuis
   Firebase sans jamais toucher au code du site. ===== */
const AGENCY_ACCESS_EMAIL = 'princeprojet@outlook.com';
/* ===== Code de test LOCAL UNIQUEMENT (pour tes essais avant hébergement).
   Ne fonctionne JAMAIS une fois le site réellement hébergé (vercel.app) —
   uniquement quand le fichier est ouvert directement (content://, file://).
   Change-le si tu veux, ou laisse tel quel : sans impact une fois en ligne. ===== */
const LOCAL_TEST_CODE = '1988';
const LOCAL_TEST_EMAIL = 'nakupendayangu@outlook.com';
/* Mot de passe RÉEL du compte membre de test (à créer une fois dans Firebase Auth, projet membres,
   avec exactement ce mot de passe — 6 caractères minimum imposés par Firebase).
   En local, taper "1988" comme mot de passe le remplace automatiquement par celui-ci. */
const LOCAL_TEST_MEMBER_REAL_PASSWORD = '1988TEST';
function isLocalTestEnvironment(){
  const proto = window.location.protocol;
  return proto !== 'https:' && proto !== 'http:';
}
const SLOT_COUNT = 150; // capacité totale du roster (nombre d'emplacements possibles) — la vitrine affiche 6 vignettes par page (voir VITRINE_PAGE_SIZE), avec navigation ‹ › entre les pages.

/* ===== Aperçu admin du Seducer Profile (70 questions) : isAdmin() vérifie le compte
   AGENCE (Firebase séparé), qui n'est jamais connecté en même temps que ton compte
   MEMBRE (celui utilisé pour voir l'onglet "Seducer Profile"). Sans ça, le tiroir
   de relecture ne pouvait jamais s'afficher pendant tes tests en tant que membre.
   On ajoute donc ici l'email de ton compte membre de test : dès que tu es connecté
   avec CET email côté membre, tu vois le tiroir, même sans être connecté en admin agence. ===== */
const DESIRE_ADMIN_PREVIEW_EMAILS = [LOCAL_TEST_EMAIL, AGENCY_ACCESS_EMAIL].map(e => e.toLowerCase());
function canSeeDesireAdminPreview(){
  if(isAdmin()) return true;
  const email = memberAuth && memberAuth.currentUser && memberAuth.currentUser.email;
  return !!(email && DESIRE_ADMIN_PREVIEW_EMAILS.includes(email.toLowerCase()));
}

// ===== Ancien système (codes fixes par créatrice, comparés côté client) — retiré :
// ne passait pas à l'échelle au-delà d'une poignée de créatrices, et n'offrait
// aucune vraie sécurité côté serveur. Remplacé par un vrai compte Firebase Auth
// par créatrice (email + mot de passe), identifié via le champ "ownerEmail" sur
// son propre document profils/{id} — voir le formulaire d'édition (admin) et
// firestore.rules. Ajouter une nouvelle créatrice ne demande plus AUCUNE
// modification de code, quel que soit leur nombre : juste un compte Firebase
// Auth + le champ ownerEmail rempli dans son profil.

// Connexion à Firebase — utilisée UNIQUEMENT pour le login admin à cette étape.
// Les profils, photos, vidéos restent stockés comme avant (aucun changement).
const firebaseConfig = {
  apiKey: "AIzaSyDjeKf3_JL4FxxZQq_d6gdXdmc2Z5RxbaY",
  authDomain: "honeymoonproject2026.firebaseapp.com",
  projectId: "honeymoonproject2026",
  storageBucket: "honeymoonproject2026.firebasestorage.app",
  messagingSenderId: "529825855432",
  appId: "1:529825855432:web:20f97cb88e0ce2d35cf2fd"
};
let auth, db, storage;
let memberAuth, memberDb, memberStorage; // instances Firebase SÉPARÉES pour les comptes membres (n'affecte jamais isAdmin()/auth.currentUser)
try{
  firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
  storage = firebase.storage();
  const memberApp = firebase.initializeApp(firebaseConfig, 'memberApp');
  memberAuth = memberApp.auth();
  memberDb = memberApp.firestore();
  memberStorage = memberApp.storage();
  // La restauration de session est asynchrone : sans cet écouteur, le badge pseudo
  // (haut de page) et le menu "Devenir membre" ne se mettent jamais à jour tout
  // seuls après un rechargement de page.
  let memberAuthAutoResumeDone = false;
  memberAuth.onAuthStateChanged((u) => {
    try{ refreshMemberBadgeFromSession(); }catch(e){}
    // Reprise automatique de l'espace membre après un rechargement de page : si une
    // session membre valide existe déjà (compte réel, pas anonyme) et qu'aucune autre
    // priorité n'est en jeu (session créatrice/admin active, ou lien direct vers la
    // fiche d'une créatrice précise), on rouvre directement sa page au lieu de la
    // laisser sur la vitrine — comme pour la créatrice, elle retrouve son espace sans
    // action. Ne se déclenche qu'une seule fois, à la toute première résolution
    // (jamais lors d'une connexion/déconnexion explicite plus tard dans la session,
    // déjà gérées ailleurs par openMemberModal()/memberLogout()).
    if(!memberAuthAutoResumeDone){
      memberAuthAutoResumeDone = true;
      const hasPriority = sessionStorage.getItem('hm_creator_slot') || (typeof isAdmin === 'function' && isAdmin()) || /^#vitrine\//.test(window.location.hash);
      if(u && !u.isAnonymous && !hasPriority){
        openMemberModal();
      }
    }
  });
}catch(e){
  console.error('Firebase init failed — le site continue de fonctionner sans synchronisation.', e);
}

/* ---------------- Envoi des photos/vidéos/audio vers Cloudflare R2 ----------------
   Remplace les anciens envois vers Firebase Storage. Le fichier est envoyé au Worker
   sécurisé (qui vérifie la connexion via authInstance avant d'écrire dans R2), qui
   renvoie l'adresse publique du fichier une fois stocké. */
const R2_UPLOAD_URL = 'https://honeymoon-uploads.honeymoon-official.workers.dev';
async function uploadToR2(authInstance, file, folder){
  if(authInstance && !authInstance.currentUser){
    try{ await authInstance.signInAnonymously(); }catch(e){}
  }
  if(!authInstance || !authInstance.currentUser){
    throw new Error('not_authenticated');
  }
  const idToken = await authInstance.currentUser.getIdToken();
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', folder);
  const res = await fetch(R2_UPLOAD_URL, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + idToken },
    body: formData
  });
  if(!res.ok){
    throw new Error('upload_failed');
  }
  const data = await res.json();
  return data.url;
}
// Même chose, mais avec un suivi en % (barre de progression) pour les fichiers lourds
// (galerie, contenu payant) — utilise XMLHttpRequest, seul moyen fiable de suivre
// la progression d'un envoi dans un navigateur.
function uploadToR2WithProgress(authInstance, file, folder, onProgress){
  return new Promise((resolve, reject) => {
    const proceed = () => {
      if(!authInstance || !authInstance.currentUser){ reject(new Error('not_authenticated')); return; }
      authInstance.currentUser.getIdToken().then((idToken) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', folder);
        const xhr = new XMLHttpRequest();
        xhr.open('POST', R2_UPLOAD_URL);
        xhr.setRequestHeader('Authorization', 'Bearer ' + idToken);
        xhr.upload.onprogress = (e) => {
          if(onProgress && e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if(xhr.status >= 200 && xhr.status < 300){
            try{ resolve(JSON.parse(xhr.responseText).url); }
            catch(e){ reject(e); }
          } else reject(new Error('upload_failed'));
        };
        xhr.onerror = () => reject(new Error('upload_failed'));
        xhr.send(formData);
      }).catch(reject);
    };
    if(authInstance && !authInstance.currentUser){
      authInstance.signInAnonymously().then(proceed).catch(proceed);
    } else {
      proceed();
    }
  });
}

const SUPPORTED_LANGS = ['fr','en','es','it'];
function detectInitialLang(){
  // L'anglais est la langue par défaut du site : on ne devine plus la langue
  // depuis celle du téléphone/navigateur (un visiteur avec un téléphone en
  // français verra quand même l'anglais, comme prévu). Seul un choix déjà
  // fait explicitement par le visiteur (mémorisé) l'emporte sur l'anglais.
  try{
    const saved = localStorage.getItem('hm_lang');
    if(saved && SUPPORTED_LANGS.includes(saved)) return saved;
  }catch(e){}
  return 'en';
}
let LANG = detectInitialLang();

const I18N = {
  en: {
    giftTipTitle: "Send a tip",
    giftTipMessageText: "Sent a {amount}€ tip 🎁",
    giftTipSentToast: "Tip sent!",
    gateSub: 'Private access',
    gateEnter: 'Enter',
    gateNoteB: 'Technical note:',
    gateNote: 'this access code is a simple browser-side barrier, not real authentication.',
    gateErr: 'Incorrect code.',
    gatePassPh: "Access code",
    creatorPassPh: "Password",
    creatorEmailPh: "Email",
    creatorEmailLabel: "Login email (creator)",
    creatorEmailNote: "The creator creates her own account (\"Create my creator account\" link on the login screen) — paste here the email she chose to activate her profile. Works for an unlimited number of creators, without ever touching the code.",
    creatorSignupLink: "No account yet? Create my creator account",
    creatorSignupSub: "Create my creator account",
    creatorSignupNote: "Create your own account. Your profile will be activated by the Honeymoon team once your application is approved.",
    creatorSuSubmit: "Create my account",
    creatorLoginLink: "← Back to login",
    creatorSignupSuccessToast: "Account created! The team will now activate your profile.",
    creatorNotActivatedErr: "Account found, but no profile is linked to it yet. Contact the Honeymoon team.",
    noPhotoYet: "No photo yet",
    tipMenuContentRequired: "Add content (photo, video or audio) before saving this line.",
    mockPurchaseNotice: "🔧 Mock purchase — the real payment system is coming soon. No amount was charged.",
    visitorNeedsAccountPurchase: "Sign up for free to purchase content — an account is required to store it in your personal gallery.",
    memberLoggedInToast: "Logged in!",
    memberBioEditBtn: "Edit",
    memberBioCancelBtn: "Cancel",
    memberBioDeleteBtn: "Delete",
    memberBioEmpty: "No biography yet. Click edit to write one.",
    myFamilyComments: "Comments",
    tipMenuEarnNote: "You'll receive about {amount}€ (60%) from this price.",
    tipMenuContentLabel: "Content to sell",
    tipMenuContentNote: "Import or capture directly the photo/video/audio you'll sell for this theme.",
    tipMenuOrderBtn: "Order",
    tipMenuOrderPrefill: "Hi, I'd like to order: {theme} ({price}€)",
    tipOrderCardLabel: "Tip Menu order",
    tipOrderDeliverBtn: "Deliver / Paid",
    ordersCustomTabLabel: "Custom orders",
    ordersTipTabLabel: "Tip Menu orders",
    ordersCustomTabNote: "All custom requests you've received, with the member's name and their request. Deliver the content or open a discussion to nail down the details.",
    ordersTipTabNote: "All orders placed from your Tip Menu, with the member's name. The content already exists: click Deliver / Paid to unlock it, or discuss delivery timing.",
    ordersCustomEmpty: "No pending custom orders.",
    ordersTipEmpty: "No pending Tip Menu orders.",
    ordersDiscussBtn: "💬 Discuss",
    tipMenuCurrencyCompareLink: "Compare with my currency (Google)",
    chatModBtnLabel: "Tips & rules",
    chatModTip1: "Be respectful and kind: a good conversation always starts with politeness.",
    chatModTip2: "Feel free to ask open questions so the conversation stays smooth and enjoyable for both of you.",
    customOrderTypeChooseLabel: "Choose a content type",
    customOrderTypeChooseNote: "There are 3 possible choices: photo, video or audio. Pick the one matching what you'll deliver.",
    customOrderHelp1: "This order is a custom request: describe exactly what you want (length, outfit, mood).",
    customOrderHelp2: "Stay respectful in your request — no nudity, no explicit or illegal content.",
    customOrderHelp3: "The price isn't negotiated directly with you: the creator sets the price (within platform limits) at delivery time.",
    customOrderHelp4: "Once delivered, your order appears in 'My purchases' — you can view it anytime.",
    tipMenuHowTitle: "How does this work?",
    tipMenuHowP1: "The Tip Menu is your ready-made content menu: set a theme, a price (within the platform's limit), and directly import the photo, video or audio you're selling.",
    tipMenuHowP2: "There's no negotiation on these items: the price is already fixed alongside the description. The member just clicks 'Order' to place the order.",
    tipMenuHowP3: "A member can also request a fully custom order directly from chat (cart button) — you deliver the content and set the price at that time.",
    tipMenuHowMemberP1: "The Tip Menu shows the ready-made content the creator offers, with prices.",
    tipMenuHowMemberP2: "No negotiation: the price is already fixed alongside the description. Click 'Order' to place your order directly.",
    tipMenuHowMemberP3: "You can also ask for something fully custom via the cart button in chat — she'll deliver the content and set the price.",
    customOrderBtnLabel: "Custom order",
    customOrderFormNote: "Describe precisely the kind of video, photo or audio you want.",
    customOrderFormPh: "E.g.: a 30-second video in red lingerie, soft mood...",
    customOrderSendBtn: "Send request",
    customOrderSentToast: "Your request was sent!",
    customOrderDeliverTitle: "Deliver this order",
    customOrderDeliverBtn: "Deliver to client",
    customOrderDeliveredToast: "Content delivered!",
    customOrderDeliveredNote: "Order delivered",
    customOrderPendingNote: "Awaiting delivery",
    customOrderViewBtn: "View my order",
    customOrderUnauthorized: "Unauthorized link: only the relevant creator can deliver this order.",
    customOrderSavedToPurchases: "Added to your purchases!",
    customOrderPurchasesTitle: "Custom orders",
    customOrderPurchasesNone: "No custom orders yet.",
    chatBotBtnLabel: "Auto message & banner",
    chatBotWelcomeLabel: "Automatic welcome message",
    chatBotWelcomeNote: "Sent automatically when the chat opens, up to 4 times per person. Add emoji to make it warmer.",
    chatBotWelcomePh: "E.g.: Hey, so glad you're here 💕 Tell me what would make you happy...",
    chatBotBannerLabel: "Scrolling banner",
    chatBotBannerNote: "A series of messages that cycle at the top of the chat, visible to the person you're talking with.",
    chatBotBannerAddBtn: "Add a message",
    chatBotIntervalLabel: "Interval (seconds)",
    levelDesc_diamond: "A remarkable level of support toward the creators.",
    bioCoverLabel: "Profile presentation photo/video",
    bioCoverNote: "This concerns your profile presentation page (different from your card's cover photo/video).",
    bioNarrativeMainTitle: "Creator's Profile",
    coverBelongsToShowcaseNote: "This concerns your public showcase page (different from your profile sheet).",
    coverPhotoTip: "A beautiful, well-lit, sensual and attractive photo to attract interest and followers.",
    mediaCommentsTitle: "Comments on this content",
    bioNarrativePersonalityTitle: "Her personality",
    bioNarrativePassionsTitle: "Her passions",
    bioNarrativeContentTitle: "What she offers",
    bioNarrativeUniverseTitle: "Her world",
    bioNarrativeLookingForTitle: "What she's looking for",
    bioNarrativeAmbitionsTitle: "Her ambitions",
    bioNarrativeDiscussionStyleTitle: "What excites her in a conversation",
    bioNarrativeDreamsTitle: "Her dreams",
    bioNarrativeFearsTitle: "Her fears",
    bioNarrativeVictoriesTitle: "Her victories",
    bioNarrativeChallengesTitle: "Her challenges",
    bioNarrativeAudienceTitle: "Where to find her",
    reportPrefillMediaComment: "Comment on a photo/video",
    commentReplyBtn: "Reply",
    vitrineEnterBtn: "Enter",
    agencyLogout: "Log out",
    visitorNeedsAccountFavorite: "Sign up for free to add creators to your favorites — coming soon.",
    visitorNeedsAccountChat: "Sign up for free to message this creator — coming soon.",
    commentModeAnonymous: "Anonymous",
    commentModeVisitor: "I'm a visitor",
    commentModeMember: "Use my username",
    commentModeCustom: "Enter a nickname",
    commentNamePh: "Your name or nickname",
    commentNameRequired: "Please enter your name or nickname before posting.",
    paidGalleryTitle: "Paid gallery",
    paidGalleryNote: "Sell exclusive photos and videos directly from your space. Allowed content: lingerie, sexy outfits, sensual dance. No nudity.",
    paidSalesLabel: "sales",
    paidTotalRevenue: "Total revenue",
    paidTotalSales: "Total sales",
    paidAddPhoto: "+ Paid photo",
    paidAddVideo: "+ Paid video",
    paidNoItems: "No paid content yet.",
    paidOrdersTitle: "Unlock requests",
    paidOrdersLoading: "Loading…",
    paidDescLabel: "Description",
    paidDescPh: "Describe this content to make it enticing…",
    paidPriceLabel: "Price (€)",
    paidTeaserLabel: "Teaser (5 seconds, free to view)",
    paidFullVideoLabel: "Full video (locked)",
    paidPhotoLabel: "Photo (locked)",
    paidFileRequired: "Please add a file before saving.",
    paidTeaserRequired: "A teaser is required for a paid video.",
    paidNoOrders: "No pending requests.",
    paidMarkPaid: "Mark as paid",
    paidMarkedPaidToast: "Sale confirmed!",
    paidExclusiveTitle: "Exclusive content",
    paidExclusiveNote: "Free preview below, unlock the full content.",
    exclusiveSalesCount: "already unlocked {count} times",
    paidTeaserBadge: "Free teaser",
    paidUnlockBtn: "Unlock for",
    paidLockedPhoto: "Locked exclusive photo",
    paidUnlockExplain: "Send your request: you'll receive payment instructions, and the content will be sent once payment is confirmed.",
    paidContactLabel: "Contact (email, phone or WhatsApp)",
    paidContactPh: "e.g. email or WhatsApp number",
    paidContactRequired: "Please enter your name and a way to contact you.",
    paidSendRequest: "Send request",
    paidRequestSent: "Request sent! You'll be contacted for payment.",
    paidPendingAgency: "Pending agency validation",
    paidSplitLabel: "Split:",
    paidSplitCreator: "creator share",
    paidInvoiceAndValidate: "Invoice & confirm",
    paidPaymentInstructionsIntro: "Your request has been recorded. Make the transfer below with the reference, and you'll receive the content once payment is confirmed.",
    paidRefLabel: "Reference",
    paidAmountLabel: "Amount",
    paidHolderLabel: "Account holder",
    paidSalesPanelBtn: "Sales",
    paidSalesPanelTitle: "Pending sales",
    paidVideoPrompt: "Click to choose a video",
    paidThisMonthLabel: "This month",
    paidAllTimeLabel: "All-time total",
    toolsTitle: "Tools",
    toolsNote: "Your personal space: calendar, notes, calculator, income/expense tracking and practical tips. This data stays on your phone, it isn't shared.",
    toolCalendar: "Calendar",
    toolNotes: "Notes",
    toolCalc: "Calculator",
    toolFinance: "Finance",
    toolAdvice: "Tips",
    toolMatchClients: "Match with Clients",
    toolMatchClientsNote: "Tap a theme from a member's profile below — I'll show you exactly how to work it into your chat, tease it, and turn it into a real connection (and a loyal subscriber).",
    toolMatchClientsWelcome: "Hey, I'm Aria — think of me as your business coach here. Every member fills in little details about themselves: what they dream about, what they're into, what makes them laugh. Those aren't small talk, they're your best opening lines. Tap a theme below and I'll break down exactly how to use it 💛",
    toolBanner: "Banner",
    toolBannerNote: "Schedule a banner (date, time, duration) that will show on your public page inviting your followers to send you a gift — birthday, Valentine's, Christmas, New Year, or your own custom message.",
    bannerActiveLabel: "Active banner",
    bannerActiveUntil: "Until",
    bannerRemoveBtn: "Remove banner",
    bannerRemoveConfirm: "Remove the current banner?",
    bannerTemplateLabel_birthday: "Birthday",
    bannerTemplateLabel_valentine: "Valentine's",
    bannerTemplateLabel_christmas: "Christmas",
    bannerTemplateLabel_newyear: "New Year",
    bannerTemplateLabel_custom: "Custom",
    bannerTemplateLabel_easter: "Easter",
    chatOccasionBtnLabel: "Occasion phrases",
    chatOccasionNote: "Tap an occasion to fill the message with a ready-made phrase, or choose Custom to write your own.",
    bannerTemplate_birthday: "🎂 My birthday is coming up! If you're feeling generous, a little gift would make my day 💛",
    bannerTemplate_valentine: "💘 Happy Valentine's Day! Send me a little gift to show me some love 😘",
    bannerTemplate_christmas: "🎄 Merry Christmas! A little gift under the tree for me would make my heart skip a beat 🎁",
    bannerTemplate_newyear: "🎆 Happy New Year! Start the year off right with a little gift for me ✨",
    bannerTemplate_custom: "",
    bannerMessageLabel: "Your message",
    bannerMessagePh: "Write whatever you want — with your name or not, up to you…",
    bannerDateLabel: "Launch date",
    bannerTimeLabel: "Time",
    bannerDurationLabel: "Display duration",
    bannerDuration1Day: "1 day",
    bannerDuration3Days: "3 days",
    bannerDuration7Days: "7 days",
    bannerDuration14Days: "14 days",
    bannerPublishBtn: "Launch the banner",
    bannerMessageRequired: "Write your message first.",
    bannerDateRequired: "Pick a valid date and time.",
    bannerPublishedToast: "Banner scheduled!",
    bannerViewerCta: "Send a gift",
    tierNudgeMessage: "Think about posting an exclusive video to thank your followers for helping you reach this milestone 💛",
    tierNudgeDismissBtn: "Got it",
    toolIdeas: "Honeymoon Business & Advices",
    ideasIntroTitle: "Welcome to your pro space",
    ideasIntroBody: "By joining Honeymoon, you're launching your own business: you're an independent, self-employed adult content creator. This is your business — it's up to you to run it seriously and professionally with your followers, so they keep coming back and supporting you. These ideas come from Honeymoon's leadership and team, to help you get the most out of it.",
    ideasWelcomeTitle: "Automatic welcome message",
    ideasWelcomeNote: "As soon as a member starts following you, this message is sent to them automatically and for free in chat — a great first impression, with no effort on your part.",
    ideasWelcomePh: "E.g.: Thanks for following me 💛 Feel free to message me, I reply to everyone!",
    ideasWelcomeSaveBtn: "Save message",
    ideasWelcomeSavedToast: "Welcome message saved!",
    ideasTierTitle: "Popularity milestones",
    ideasTierBody: "Every time you reach a new tier (bronze, silver, gold…), you'll get a small reminder in your Popularity tab suggesting you post exclusive content to thank your followers for helping you get there.",
    ideasTipsTitle: "Tips to keep your community engaged",
    ideasTipsNote: "These are suggestions, not obligations — take what fits you.",
    ideasTip1: "Reply to your messages regularly: responsiveness builds loyalty more than content volume.",
    ideasTip2: "Keep a steady posting rhythm rather than long silences followed by bursts.",
    ideasTip3: "Save something special (a photo, video, or voice note) for your most loyal followers.",
    ideasTip4: "Stay yourself: a recognizable personality builds loyalty better than generic content.",
    ideasTip5: "Set your boundaries clearly from the start — it avoids misunderstandings and builds respect.",
    audioClearBtn: "Remove audio",
    ideasWelcomeAudioLabel: "Voice message (optional)",
    bannerAudioLabel: "Voice message (optional)",
    bannerColorBgLabel: "Background color",
    bannerColorTextLabel: "Text color",
    bannerScrollLabel: "Scrolling",
    bannerBlinkLabel: "Blinking",
    bannerScrollDurationLabel: "Scroll duration (seconds)",
    toolCalendarPh: "Add a note for this day…",
    toolNotesPh: "Write anything here…",
    toolCalcError: "Error",
    toolIncome: "Income",
    toolExpense: "Expenses",
    toolBalance: "Balance",
    toolFinLabelPh: "Name (e.g. Lighting purchase)",
    toolAddEntry: "Add",
    toolNoEntries: "No entries yet.",
    toolPaymentAccessNote: "These buttons open the official PayPal and M-Pesa websites in your browser — the site cannot access your accounts directly.",
    toolFinMissing: "Please fill in a name and a valid amount.",
    toolEstimateEarnings: "Estimate my earnings",
    toolEstimatorIntro: "Tell me how much you sell each item for and how many you expect to sell per month, and I'll calculate an estimate.",
    toolEstimatorPrice: "Average price per item (€)",
    toolEstimatorVolume: "Estimated sales per month",
    toolEstimatorCalc: "Calculate my estimate",
    toolEstimatorResult: "With an average price and {monthly}€ estimated revenue this month, your share (at {percent}%) would be about {share}€. This is a simple estimate — the real amount depends on demand, content quality and consistency.",
    toolCalcReasonPh: "Reason for calculation (e.g. monthly budget)",
    toolCalcHistory: "Calculation history",
    toolCalcNoReason: "Untitled",
    toolCalcNoResult: "Do a calculation first before saving.",
    toolChatLang: "Chat language",
    toolAskAnything: "Ask your question in your own words…",
    toolNoMatch: "I don't have a ready answer for that — try rephrasing, or pick a topic from the list above.",
    paidAddAudio: "+ Audio message",
    paidAudioLabel: "Audio message (locked)",
    paidAudioPrompt: "Click to choose an audio file",
    paidAudioDescPh: "Message topic (e.g. a sweet word, a dare, a confidence…)",
    toolDailyBudgetTitle: "Daily budget",
    toolDailyBudgetNote: "How much you can spend per day without risking an overdraft, based on your current balance.",
    toolDailyBudgetDays: "Days remaining",
    toolDailyBudgetCalc: "Calculate",
    toolDailyBudgetResult: "You can spend about {amount}€ per day for {days} days without going negative.",
    toolDailyBudgetNegative: "Your balance is already negative or zero — avoid spending for now.",
    toolTaxNotice: "Important: depending on your country, income earned here may be subject to tax and mandatory declarations (self-employment, small-business status, etc.). Check with your country's tax authority to know your exact obligations and avoid surprises about what you actually keep. If no tax rule applies to your situation, this message does not concern you.",
    toolCurrency: "Currency",
    toolCompareCurrencies: "Compare currencies",
    toolCurrencyLoading: "Loading rates…",
    toolCurrencyComparedTo: "Rates against",
    toolCurrencyDate: "Rate as of",
    toolCurrencyError: "Could not load rates (check your internet connection).",
    paidAudioImport: "Import a file",
    paidAudioRecordNow: "Record now",
    paidAudioRecordPrompt: "Tap to start recording",
    paidAudioRecording: "Recording… tap to stop",
    paidAudioRecordDone: "Recording done — listen below",
    paidAudioMicError: "Couldn't access the microphone. Check your browser permissions.",
    captureNowBtn: "Take now",
    importFileBtn: "Import a file",
    filesSelected: "files selected",
    paidSeeInMyCurrency: "See in my currency",
    paidSplitBreakdown: "Payment breakdown",
    paidSplitPlatform: "Honeymoon share",
    legalLink2257: "2257 Statement",
    legalLinkTerms: "Terms",
    legalLinkPrivacy: "Privacy",
    legalLinkPricing: "Pricing & Refunds",
    legalDocTitle2257: "2257 Compliance Statement",
    legalDocTitleTerms: "Terms and Conditions",
    legalDocTitlePrivacy: "Privacy Policy",
    legalDocTitlePricing: "Pricing and Refund Policy",
    burgerHome: "Home",
    burgerTagline: "An exclusive world of creators",
    burgerSectionInfo: "Information",
    burgerSectionAccount: "Account",
    burgerBecomeMember: "Become a member",
    burgerApplyModel: "Apply to become a creator",
    burgerFaq: "FAQ",
    burgerCreatorLogin: "Creator space login",
    burgerAgencyLogin: "Private access for agencies",
    burgerRules: "Site rules",
    legalDocTitleRules: "Site Rules",
    soonBecomeMemberTitle: "Become a member — coming soon",
    soonBecomeMemberBody: "This feature is coming soon. Check back soon to find out how to join the Honeymoon community as a member.",
    memberFreeBadge: "100% free account — no sign-up fees",
    memberLoginTitle: "Log in",
    memberBackToSite: "← Back to site",
    memberSignupTitle: "Create a member account",
    memberSignupLine: "Chat with your favorite creators and unlock their Tip Menu. Free account — you only pay for what you choose to buy.",
    memberHomeWelcomeLine: "Follow your favorite creators, chat with them, and find all your purchases here.",
    memberTabSeducerProfile: "Seducer Profile",
    desireProfileThemeLabel: "Current theme",
    desireProfileComplete: "🎉 You're in — your profile will be shown among the first to creators on the site.",
    desireProgressTeaser: "Complete your profile so creators see it among the first.",
    desireCompatibilityLine: "You'll be matched with creators most compatible with you.",
    desireProfilePoints: "points",
    desireProgressLabel: "Profile completed",
    desireQuestionOfDay: "Today's question",
    desireAlreadyAnsweredToday: "You've already answered today — come back tomorrow for the next question 🔒",
    desireAnswerSaved: "Answer saved!",
    desireThemeScoresTitle: "Your scores by theme",
    desireThemeNotStarted: "Not started yet",
    desireTheme_flirt: "Flirt",
    desireTheme_playful: "Playful",
    desireTheme_talkative: "Talkative",
    desireTheme_humor: "Humor",
    desireTheme_seduction: "Seduction",
    desireTheme_travel: "Travel",
    desireTheme_music: "Music",
    desireTheme_restaurants: "Restaurants",
    desireTheme_movies: "Movies",
    desireTheme_food: "Food",
    bioDesireProfileTitle: "You'd like to know about myself",
    bioDesireProfileNote: "Be sincere here — members will believe what you share about yourself, and honest percentages help you get matched with the right people and build real affinity faster.",
    memberDiscoverCreatorsBtn: "Discover creators",
    memberIdentifierLabel: "Username or email",
    memberIdentifierPh: "your_username or you@email.com",
    memberUsernameLabel: "Username",
    memberUsernamePh: "Pick a username",
    memberEmailLabel: "Email",
    memberEmailPh: "you@email.com",
    memberPasswordLabel: "Password",
    memberPasswordPh: "Pick a password (6 characters min.)",
    memberPasswordLoginPh: "Your password",
    memberConfirmPasswordLabel: "Confirm password",
    memberConfirmPasswordPh: "Retype your password",
    memberLoginBtn: "Log in",
    memberSignupBtn: "Create my account",
    memberNoAccount: "No account yet?",
    memberCreateOne: "Create one",
    memberHaveAccount: "Already a member?",
    memberLoginInstead: "Log in",
    memberForgotLink: "Forgot password or username?",
    memberBackToLogin: "← Back to login",
    memberErrFillAll: "Please fill in all fields.",
    memberErrPassMismatch: "Passwords don't match.",
    memberErrPassShort: "Password must be at least 6 characters.",
    memberErrUsernameTaken: "This username is already taken.",
    memberErrUsernameFormat: "Username must be 3-20 characters (letters, numbers, dots, dashes, underscores).",
    memberErrEmailInUse: "An account already exists with this email.",
    memberErrInvalidEmail: "Invalid email address.",
    memberErrWeakPass: "This password is too weak.",
    memberErrLoginFailed: "Incorrect username/email or password.",
    memberErrUnknown: "Something went wrong. Try again.",
    memberErrNoConnection: "Server connection unavailable — reload the page and try again.",
    memberVerifyTitle: "Confirm your account",
    memberVerifyBody: "A confirmation email was just sent to {email}. Open it and click the link to activate your member account. Check your spam folder if you don't see it.",
    memberVerifyCheckBtn: "I've confirmed, continue",
    memberVerifyResendBtn: "Resend confirmation email",
    memberVerifyResendToast: "Confirmation email resent.",
    memberVerifyStillPending: "Your account isn't confirmed yet. Check your inbox (and spam folder), then click the link before continuing.",
    memberVerifyLogout: "Log out",
    memberHomeWelcome: "Welcome, {username}!",
    memberHomeConfirmed: "Your member account is active and confirmed.",
    memberHomeSoon: "The member area (content, subscriptions...) is coming very soon. Check back!",
    memberHomeLogout: "Log out",
    memberLoggedOutToast: "You're logged out.",
    memberSignupSuccessToast: "Account created successfully.",
    memberForgotTitle: "Forgot password or username",
    memberForgotBody: "Enter the email linked to your account. If an account exists, you'll receive a link to reset your password (your username will be shown once you're logged in).",
    memberForgotEmailPh: "you@email.com",
    memberForgotSendBtn: "Send the link",
    memberForgotSentTitle: "Email sent",
    memberForgotSentBody: "If an account exists with this email, a reset link was just sent. Open it to choose a new password.",
    memberTabDiscover: "Our Creators Honeymoon",
    memberTabProfile: "Profile",
    memberTabTools: "Tools",
    toolMatchWords: "Match Your Words",
    toolMatchWordsNote: "Tap a theme from her profile below — I'll show you how to read it and turn it into a conversation she'll actually enjoy.",
    toolMatchWordsWelcome: "Hi, I'm Nova — think of me as your wingwoman here. Every creator's profile has little clues about who she really is: what she dreams about, what she's into, what makes her laugh. Those aren't decoration, they're your best opening line. Tap a theme below and I'll show you how to use it 😊",
    memberTabPurchases: "Collection",
    memberUnverifiedBanner: "Account not confirmed yet — email sent to {email}.",
    memberResendShort: "Resend",
    memberResentShort: "Resent ✓",
    memberAvatarChange: "Change photo",
    memberLocationLabel: "Location",
    memberLocationPh: "City, country...",
    memberBioLabel: "Tell us a bit about yourself",
    memberBioPh: "Tell us a bit about yourself...",
    memberBioWordLimit: "words max",
    memberBioQuestionsTitle: "A few things about me",
    memberBioQuestionsNote: "These help creators find common ground with you — same visibility rules as your bio above.",
    memberBioNarrativeLabelSelf: "In your own words",
    memberBioNarrativeLabelOther: "In their own words",
    memberCardSectionBio: "Bio",
    memberCardSectionAbout: "About",
    memberCardSectionPhotos: "Photos",
    memberBioHobbies: "My hobbies",
    memberBioHobbiesPh: "Ex: hiking, video games, cooking...",
    memberBioPassions: "My passions",
    memberBioPassionsPh: "Ex: music, cars, travel...",
    memberBioDreams: "My dreams",
    memberBioDreamsPh: "Ex: travel the world, start a business...",
    memberBioLookingFor: "What I'm looking for here",
    memberBioLookingForPh: "Ex: friendly chat, exclusive content, a connection...",
    memberBioDiscussionStyle: "What excites me in a conversation",
    memberBioDiscussionStylePh: "Ex: humor, deep talks, playful banter...",
    memberBioQCardHobbies: "Hobbies",
    memberBioQCardPassions: "Passions",
    memberBioQCardDreams: "Dreams",
    memberBioQCardLookingFor: "Looking for",
    memberBioQCardDiscussionStyle: "Loves talking about",
    caThisMonthShort: "This month's earnings",
    coverVideoBtn: "Mini video",
    coverVideoNote: "You can use a photo, or a short intro video — it often attracts more views and followers.",
    coverVideoRules: "60 seconds maximum. No nudity — lingerie or sexy outfits only, same as your photos. No explicit sexual gestures (e.g. simulated fingering) — twerk, dance and sensual poses remain allowed. Sensual is welcome, but never the simulation of a sexual act.",
    coverVideoTooLong: "This video is longer than 60 seconds — please choose a shorter one.",
    levelDescPrefix: "Level",
    levelDesc_gray: "The starting point for every creator.",
    levelDesc_bronze: "A first community is starting to form around you.",
    levelDesc_silver: "Your popularity is growing, more and more members are following you.",
    levelDesc_gold: "You're among the well-established creators on Honeymoon.",
    levelDesc_purple: "A strong community actively supports you.",
    levelDesc_red: "The maximum level — you're among the most popular creators on the site.",
    publicIntroLabel: "Describe yourself for the public",
    publicIntroNote: "10 lines maximum. This text will appear on your public page, below your followers.",
    publicIntroPh: "E.g.: I'm passionate about dance and love sharing playful moments with you...",
    myFamilyPopularity: "Popularity",
    popularityTabNote: "Your popularity badge, your followers, and who you follow.",
    followingLabel: "Following",
    followersLabel: "Followers",
    likesLabel: "Likes",
    followersListTitle: "Followers",
    followingListTitle: "Following",
    tierLabel_gray: "Starter",
    tierLabel_bronze: "Bronze",
    tierLabel_silver: "Silver",
    tierLabel_gold: "Gold",
    tierLabel_red: "Top creator",
    tierLabel_purple: "Purple",
    tierLabel_diamond: "Diamond",
    uxdLabel: "UXD",
    uxdExplainNote: "UXD, your standing on Honeymoon. Every bit of support moves you up toward a rank recognized across the whole community — all the way to the top tier.",
    uxdLevelDesc_gray: "The starting point for every new member.",
    uxdLevelDesc_silver: "You're starting to stand out among fans.",
    uxdLevelDesc_bronze: "Your status is climbing — you're entering the circle of recognized members.",
    uxdLevelDesc_gold: "You're among the most visible members of the community.",
    uxdLevelDesc_purple: "An elite rank, reserved for a handful of members.",
    uxdLevelDesc_red: "The top rank — your status sits at the summit of Honeymoon.",
    tipMenuTabLabel: "Tip Menu",
    tipMenuTabNote: "Fill in your menu by theme (photo, video, audio). Prices are set by the platform — pick them from the list. Publish so it appears on your page.",
    tipMenuThemePh: "Theme name (e.g. lingerie)",
    tipMenuColTheme: "Theme",
    tipMenuColPhoto: "Photo",
    tipMenuColVideo: "Video",
    tipMenuColAudio: "Audio",
    tipMenuNoPrice: "—",
    tipMenuAddRow: "Add a theme",
    tipMenuRulesLabel: "Explain the rules for each theme",
    tipMenuRulesPh: "E.g.: Lingerie = photo in fine lingerie, no nudity. Sensual dance = 30-60s video...",
    tipMenuPriceLockedNote: "Prices are set by Honeymoon — you can only choose among the offered amounts.",
    tipMenuPublishBtn: "Publish to my page",
    tipMenuPublishedToast: "Tip Menu published to your page!",
    tipMenuCustomNote: "Something specific in mind? Custom requests can be discussed directly in chat.",
    tipMenuRowExplain: "For each line: choose the content type (photo, video, or audio), give it a theme, a price, and a description of what's included.",
    tipMenuPriceLabel: "Price",
    tipMenuDescLabel: "Description (what's included)",
    tipMenuDescPh: "E.g.: 30-second video, black lingerie outfit, no nudity.",
    tipMenuEditRow: "Edit",
    tipMenuRowDoneBtn: "Save this line",
    tipMenuThemeRequired: "Add a theme name before saving.",
    tipMenuHelpTheme: "The name of what you're offering, e.g. \"Red lingerie\" or \"Sensual dance\".",
    tipMenuHelpPrice: "Pick a price between {min}€ and {max}€ for this content type. If you go above the allowed maximum, it will automatically be capped at {max}€.",
    tipMenuHelpDesc: "Describe in a few words what's included (duration, outfit, what's shown or not). 20 words max.",
    tipMenuPriceClamped: "Price capped at the allowed maximum: {max}€.",
    tipMenuHelpEmoji: "You can add one or several emojis, or leave it empty — the default emoji can be erased.",
    tipMenuMaxRows: "Maximum 25 lines in your Tip Menu.",
    tipMenuTheme_lingerie: "Lingerie",
    tipMenuTheme_danse_sensuelle: "Sensual dance",
    tipMenuTheme_strip_tease: "Striptease",
    tipMenuTheme_pov_intime: "Intimate POV",
    tipMenuTheme_roleplay: "Roleplay",
    tipMenuTheme_fetish_pieds: "Foot fetish",
    tipMenuTheme_costume_theme: "Themed costume",
    tipMenuTheme_exterieur: "Outdoor",
    tipMenuTheme_duo_couple: "Duo / couple",
    tipMenuTheme_demande_personnalisee: "Custom request",
    followBtn: "Follow",
    followingBtn: "Following",
    membersViewerBtn: "Members",
    membersViewerTitle: "Members sharing their profile",
    membersViewerEmpty: "No members are sharing their bio or photos yet.",
    myMembersTabNote: "Find members who chose to share their bio or photos with you, the ones you follow, and your favorites.",
    myMembersFilterAll: "All",
    myMembersFilterFavorites: "Favorites",
    myMembersNoFavorites: "No favorites yet.",
    myMembersFavoriteBtn: "Favorite",
    myMembersUnfavoriteBtn: "Remove",
    memberVisibilityLabel: "Who can see",
    memberVisibilityEveryone: "All creators",
    memberVisibilityFavorites: "Only my favorites",
    memberVisibilityNobody: "Nobody",
    memberBioVisibleLabel: "Make my bio visible to the creator",
    memberSubtabInfos: "My info",
    memberSubtabPhotos: "My photos",
    memberSubtabPassword: "Password",
    memberPrivateFieldNote: "Never visible to anyone but you.",
    memberBioVisibilityExplain: "Based on your choice above, your bio may be seen by the relevant creators. The rest of your profile (email, purchases, password) is never visible.",
    memberPhotosVisibilityExplain: "Based on your choice above, these photos may be seen by the relevant creators. They stay separate from your purchases.",
    memberBioHiddenNote: "Your bio is only visible to you. The rest of your profile (email, purchases, password...) is never visible to creators or other members.",
    memberSaveBtn: "Save",
    memberSavedToast: "Changes saved.",
    memberChangePasswordTitle: "Change password",
    memberCurrentPasswordLabel: "Current password",
    memberCurrentPasswordPh: "Your current password",
    memberNewPasswordLabel: "New password",
    memberNewPasswordPh: "New password (6 characters min.)",
    memberChangePasswordBtn: "Update password",
    memberPasswordChangedToast: "Password updated.",
    memberErrWrongCurrentPass: "Current password is incorrect.",
    memberPurchaseHistoryTitle: "Payment history",
    memberPurchaseNone: "No purchases yet.",
    memberPurchasePending: "pending",
    memberPurchasePaid: "paid",
    memberPurchasePhotosTitle: "Purchased photos",
    memberPurchaseVideosTitle: "Purchased videos",
    memberPurchaseNoPhotos: "No photos purchased yet.",
    memberPurchaseNoVideos: "No videos purchased yet.",
    memberPurchaseLoadErr: "Couldn't load your purchases right now. Try again later.",
    applyTitle: "Apply to become a model",
    applyIntro: "This form is open to everyone. Fill it in and it will be sent directly to the Honeymoon team — no fees, no obligation.",
    applyBusinessPitch: "Joining Honeymoon means launching your own business: you run it as an independent, self-employed content creator, at your own pace and on your own terms.",
    applyNameLabel: "Name / desired username",
    applyNamePh: "Your first name or the username you'd like to use",
    applyContactEmailLabel: "Contact email",
    applyContactEmailPh: "you@email.com",
    applyContactPhoneLabel: "Phone / other contact (optional)",
    applyContactPhonePh: "WhatsApp, Telegram, phone number...",
    applyCountryLabel: "Country / location",
    applyCountryPh: "City, country",
    applyWorkingElsewhereLabel: "Are you already working on another site or with another agency?",
    applyWorkingElsewhereNo: "No, none",
    applyWorkingElsewhereYes: "Yes",
    applyWorkingElsewhereDetailLabel: "Site / agency name + your ID or username there",
    applyWorkingElsewhereDetailPh: "E.g. SiteName — username123",
    applyMotivationLabel: "Why do you want to join Honeymoon?",
    applyMotivationPh: "Your motivation, what you're looking for, your availability...",
    applySocialLabel: "Social media / portfolio (optional)",
    applySocialPh: "Instagram, TikTok, link to your photos...",
    applyLegalTitle: "Site conditions",
    applyLegalText: "Honeymoon works with a collaboration agreement (non-exclusive unless otherwise agreed): allowed content is limited to lingerie / sexy outfits / sensual dance — no nude content is accepted on this platform. For any paid content sold, the split is 60% for the creator and 40% for Honeymoon for platform management. Identity and age verification (18 years minimum) is mandatory before any publishing. The full agreement is presented and signed electronically if your application is accepted.",
    applyCheck18: "I confirm I am 18 years old or older.",
    applyCheckConditions: "I have read and accept the conditions above (allowed content, 60/40 split, identity verification).",
    applyCheckData: "I agree that my information will be shared with the Honeymoon team as part of reviewing my application.",
    applySendBtn: "Send my application",
    applyErrFillRequired: "Please fill in all required fields.",
    applyErrChecks: "Please check all 3 boxes to send your application.",
    applySentTitle: "Application sent!",
    applySentBody: "Thank you! Your application has been sent to the Honeymoon team. You'll be contacted directly at the email or contact you provided if your profile is selected.",
    applySentClose: "Close",
    applicationsPanelBtn: "Applications",
    applicationsNoneYet: "No applications yet.",
    memberTabFavorites: "Favorites",
    memberUseMyLocation: "Use my location",
    memberGeolocLoading: "Locating…",
    memberGeolocDenied: "Location denied or unavailable.",
    memberGeolocUnsupported: "Geolocation isn't available on this device.",
    memberMyPhotosTitle: "My photos",
    memberMyPhotosNote: "Personal photos, separate from your purchases. Choose below whether creators can see them.",
    memberPhotoDeleteBtn: "Delete this photo",
    memberPhotoDeleteConfirm: "Permanently delete this photo?",
    memberPhotosVisibleLabel: "Make my photos visible to creators",
    memberFavoritesNone: "No favorite creators yet. Tap ♡ on a profile to add one.",
    memberFavoritesHype: "✨ Your favorites, all in one place — never miss what's new from them.",
    memberMessagesHype: "💬 One message, one connection. They love hearing from you.",
    memberFavoriteToggle: "Add/remove from favorites",
    memberFavoriteAdded: "Added to your favorites.",
    memberFavoriteRemoved: "Removed from your favorites.",
    myCommentsTitle: "Comments received",
    myCommentsNote: "Comments left on your profile by visitors. You can delete a comment you find inappropriate or offensive.",
    myCommentsNone: "No comments yet.",
    myCommentsDelete: "Delete this comment",
    myCommentsConfirmDelete: "Permanently delete this comment?",
    myCommentsReportToTeam: "Report to team",
    logoutConfirm: "Log out of your member account?",
    deletionsPanelBtn: "Deletions",
    deletionsNoneYet: "No deletion requests yet.",
    deletionStatusCancelled: "cancelled",
    deletionStatusCompleted: "deleted",
    deletionEligibleNow: "delay elapsed — ready",
    deletionDaysLeft: "{n} day(s) left",
    deletionConfirmBtn: "Delete permanently",
    deletionFinalConfirm: "PERMANENTLY delete {name}'s account and all their content? This cannot be undone.",
    deletionCompletedToast: "Account permanently deleted.",
    creatorRulesArticleTitle: "Rules, rights and duties",
    creatorRulesArticleBody: "As a creator on Honeymoon, you keep 60% of your paid content sales (40% for platform management). Allowed content is limited to lingerie, sexy outfits and sensual dance — no nude content is accepted. A valid ID is required before any publishing. You remain free to manage your content, and you can request your account's deletion at any time below.\n\nAccount deletion: once your request is sent with a delay (1 to 7 days) and your reason, the Honeymoon team is notified. You can cancel your request at any time before the delay elapses. Once it does, deletion becomes possible and your profile, photos, videos and comments are permanently erased.",
    deletionPendingBanner: "Your account deletion is scheduled in {n} day(s).",
    deletionCancelBtn: "Cancel request",
    deletionCancelledToast: "Deletion request cancelled.",
    deletionOpenBtn: "Delete my creator account",
    deletionDelayLabel: "Delay before deletion",
    deletionDelayOption: "{n} day(s)",
    deletionReasonLabel: "Reason for deletion",
    deletionReasonPh: "Explain why you want to delete your account...",
    deletionSubmitBtn: "Send request",
    deletionRequestedToast: "Deletion request sent.",
    memberDeleteAccountTitle: "Delete my account",
    memberDeleteAccountNote: "This permanently deletes your member account, profile and personal photos. A confirmation email will be sent to you.",
    memberDeleteAccountBtn: "Delete my account",
    memberDeleteAccountConfirm1: "Are you sure you want to delete your member account? This cannot be undone.",
    memberDeleteAccountConfirm2: "Final confirmation: your profile, bio and personal photos will be permanently deleted. Continue?",
    memberDeleteAccountDone: "Your account has been deleted. A confirmation email was sent to you.",
    memberDeleteRequiresRecentLogin: "For your security, please log back in and try deleting your account again.",
    adminForgotNeedEmail: "Enter your email above first.",
    adminForgotSent: "A reset link was sent to {email}. Check your inbox.",
    visitorBadgeLabel: "Visitor",
    memberTabMessages: "Messages",
    myMessagesTitle: "Messages",
    myMessagesNote: "Chat live with members who message you.",
    chatLoading: "Loading…",
    chatEmptyNote: "No messages yet. Say hello!",
    chatNoOrdersNote: "No orders in this conversation yet.",
    chatTabLibre: "Free chat",
    chatTabOrders: "Orders",
    chatTopicStarterTemplate: "Shall we talk about {topic}? 😊",
    chatTopic_day: "Your day",
    chatTopic_travel: "Travel",
    chatTopic_music: "Music",
    chatTopic_movies: "Movies & shows",
    chatTopic_desires: "Desires",
    chatTopic_compliments: "Compliments",
    chatTopic_teasing: "A little teasing game",
    chatTopic_secrets: "Confessions",
    chatTopic_style: "Style",
    chatTopic_dreams: "Dreams",
    chatTopic_humor: "Humor",
    chatTopic_food: "Treats",
    chatTopic_perfectNight: "Perfect night",
    chatTopic_memories: "Memories",
    chatTopic_wellness: "Relaxation",
    chatTopic_nowPlaying: "What you're listening to",
    chatTopic_common: "Things in common",
    chatTopic_weekend: "Perfect weekend",
    chatTopic_littleSecret: "A little secret",
    chatTopic_reunion: "If we met up",
    chatNoConversations: "No conversations yet.",
    chatTypingIndicator: "is typing…",
    chatRulesBanner: "⚠️ Respectful chat space: insults are forbidden. Exchanging personal contact details (phone number, social media, email) is not allowed on the platform and may lead to sanctions. Chatting is free-form: suggested topics are just ideas, never an obligation.",
    chatReportMessage: "Report this message to the team",
    chatDeleteMessage: "Delete this message",
    chatDeleteMessageConfirm: "Permanently delete this message?",
    chatStartBtn: "Send a message",
    myFamilyContent: "Content",
    myTabsChooseHint: "Pick a tab above to get started.",
    myFamilyMessages: "Messages",
    myFamilyCA: "Revenue & Sales",
    myFamilyTools: "Tools",
    myFamilyRules: "Rules",
    caTabNote: "Track your earnings, payment split, and pending orders.",
    backToMenu: "Back to menu",
    burgerLogout: "Log out",
    themeToBordeaux: "Dark mode",
    themeToLight: "Light mode",
    soonApplyModelTitle: "Apply to become a creator — coming soon",
    soonApplyModelBody: "This feature is coming soon. Check back soon to find out how to apply to join the Honeymoon catalogue.",
    contractTabLabel: "Contract",
    creatorContractBtn: "Creator contract",
    creatorContractNameLabel: "Stage name",
    creatorContractConsent: "I certify I have read and accept all the terms of this contract.",
    signContractType: "Contract type",
    signTypeAgency: "Partner agency",
    signTypePartnerSite: "Partner site (cam, chat, other platform)",
    signTypeOther: "Other / blank contract",
    signPartnerSiteNameLabel: "Partner site name",
    signOtherNameLabel: "Name (agency, person, or entity)",
    signCustomTextPh: "Write the terms of this contract here (like a blank sheet)…",
    paidYouWillEarn: "You will earn about",
    toolCurrencyOther: "Other (specify)",
    toolCurrencyCustomPh: "e.g. FCFA, ₦, Rp…",
    paidSeeInGoogle: "See conversion on Google",
    paidCABrut: "Gross Revenue",
    paidCANet: "Net Revenue",
    reportLinkLabel: "🚩 Report content",
    reportModalTitle: "Report content",
    reportModalNote: "Use this form to report problematic content (suspected minor, content published without consent, stolen content, or other). We treat every report as a priority and remove the content in question pending verification.",
    reportWhichProfile: "Creator or page concerned",
    reportWhichProfilePh: "e.g. creator name or link",
    reportReason: "Reason for report",
    reportReasonMinor: "I suspect a minor is involved",
    reportReasonNonConsent: "Content published without consent",
    reportReasonStolen: "Stolen / reposted content without authorization",
    reportReasonHarassment: "Harassment / abusive behavior",
    reportReasonScam: "Scam / fraud",
    reportReasonImpersonation: "Impersonation",
    reportReasonViolence: "Violence / threats",
    reportReasonSpam: "Spam / unsolicited advertising",
    reportReasonPrivacy: "Privacy violation",
    reportReasonOther: "Other reason",
    reportAttachment: "Attachment (optional)",
    reportDetails: "Details",
    reportDetailsPh: "Describe the issue precisely…",
    reportContact: "Your contact (optional)",
    reportContactPh: "email or phone, to keep you informed",
    reportSendBtn: "Send report",
    reportDetailsRequired: "Please describe the issue before sending.",
    reportSentToast: "Report sent. Thank you — we treat it as a priority.",
    reportsPanelBtn: "Reports",
    reportsNoneYet: "No reports yet.",
    reportThisCreatorBtn: "Report this creator",
    reportCommentPrefix: "Reported comment from",
    toolAdviceNote: "Tap a topic below, the tip appears like in a conversation.",
    showcaseTitle: "Agency showcase",
    showcaseNote: "Content reserved for presenting the creator to partner agencies (not visible to the general public).",
    showcasePhotoLabel: "Presentation photo",
    showcaseShortLabel: "Short video (showreel)",
    showcaseLongLabel: "Long video (portfolio)",
    signContractBtn: "Sign a contract",
    featuredBadge: "Featured",
    featureBtn: "Feature",
    unfeatureBtn: "Unfeature",
    signContractExplain: "By signing, you confirm you are authorized to commit your agency to a representation contract with this creator, under the terms agreed with Honeymoon.",
    signAgencyName: "Agency name",
    signRepName: "Representative name",
    signDrawLabel: "Signature (draw below)",
    signClearBtn: "Clear",
    signConsentText: "I certify I am authorized to sign on behalf of my agency and I accept the terms of the contract.",
    signConfirmBtn: "Sign contract",
    signMissingFields: "Please fill in the agency and representative names.",
    signMissingSignature: "Please draw your signature.",
    signMissingConsent: "Please check the consent box.",
    signCertTitle: "Signature certificate no.",
    signSavedToast: "Contract signed and saved!",
    signNoContracts: "No signed contracts yet.",
    signViewBtn: "View",
    contractsPanelBtn: "Contracts",
    signedContractsTitle: "Signed contracts",
    agencyContractBtn: "Agency contract",
    signSignatureLabel: "Signature",
    paidWhatsappBtn: "Notify Honeymoon on WhatsApp",
    paidUploadingTeaser: "Uploading teaser…",
    paidUploadingFull: "Uploading video…",
    adminSub: 'Administrator access',
    adminEnter: 'Unlock',
    adminCancel: 'Cancel',
    adminErr: 'Incorrect administrator code.',
    editToggleOn: "CTA",
    editToggleOff: 'Done',
    heroEyebrow: 'Catalogue',
    heroTitle: '5 creators, one contract, one standard: <em>seriousness</em>.',
    heroBody: "The Honeymoon catalogue brings together 5 creators under exclusive contract, chosen for their seriousness and motivation. Some are new to the industry: expectations are made clear from the start, and they meet them.",
    catalogueTitle: 'The Catalogue',
    emptyName: 'Profile coming soon',
    emptyDesc: 'This profile will be available soon.',
    nameUndefined: 'Name to be set',
    platforms: 'Platforms',
    audience: 'Audience',
    content: 'Content',
    verified: '18+ verified',
    notVerified: 'Not verified',
    viewContract: 'View contract',
    noContract: 'Contract coming soon',
    editProfile: 'Edit this profile',
    galleryBtn: 'Gallery',
    galleryTitle: 'Gallery',
    galleryClose: 'Close',
    galleryPhotos: 'Photos',
    galleryVideos: 'Videos',
    galleryEmpty: 'No media yet.',
    storageFull: "This browser's storage is full — couldn't add that file. Try a smaller file, or move to real backend storage for a larger catalogue.",
    contactTitle: 'Interested in a collaboration?',
    contactBody: 'Contact the Honeymoon team to discuss a partnership, get more information about a creator, or arrange an introduction.',
    contactBtn: 'Contact Honeymoon',
    agencyTrustContract: "Signed contract for every creator",
    agencyTrustVerified: "18+ verified profiles",
    agencyTrustCountLabel: "creators under contract",
    footTag: 'Honeymoon — Confidential',
    modalTitle: 'Edit profile',
    stageName: 'Stage name',
    country: 'Country',
    platformsPh: 'e.g. Instagram · TikTok',
    audiencePh: 'e.g. 25K+',
    contentPh: 'e.g. Dance · Video · Social',
    availLabel: 'Available for (comma separated)',
    photoLabel: 'Cover photo',
    photoPrompt: 'Click to choose a photo',
    photoReplace: 'Current photo — click to replace',
    contractLabel: 'Contract & consent (PDF)',
    contractPrompt: 'Click to add the PDF',
    contractReplace: 'PDF added — click to replace',
    consentText: "I confirm this creator is 18 or older, has signed a contract, and has agreed to the use of her photo and information in this catalogue.",
    cancel: 'Cancel',
    save: 'Save',
    savedToast: 'Profile saved (stored in this browser)',
    needConsentToast: "Please confirm age, contract and consent before saving.",
    addedToast: 'Added to gallery',
    removedToast: 'Removed from gallery',
    creatorLink: 'Creator access',
    vitrineLink: '← Back',
    ageGateTitle: 'Age verification',
    ageGateBody: 'This site presents content reserved for adults (18 years and older). Please confirm your age to continue.',
    ageYes: "Yes, I'm 18 or older",
    ageNo: "No, I'm under 18",
    ageBlockedTitle: 'Access denied',
    ageBlockedBody: 'Access to this site is reserved for adults (18 years and older).',
    ageLeaveBtn: 'Leave',
    creatorGateSub: 'Creator access',
    creatorEnter: 'Enter',
    backAgency: '← Back',
    creatorErr: 'Incorrect code.',
    creatorLogout: 'Log out',
    myProfileHello: 'Hello',
    myProfileNote: "This is your photo and videos as they appear in the catalogue. You can't add or change anything here — for any change, contact the Honeymoon team.",
    myProfilePhotos: 'Your photos',
    myProfileVideos: 'Your videos',
    myProfileNoMedia: 'No media added yet.',
    creatorCodeLabel: 'Creator code (share with her)',
    copyBtn: 'Copy',
    copiedToast: 'Code copied',
    numberPrefix: 'No.',
    myEditBtn: 'Edit my information',
    myProfileManageNote: 'Manage your photo, information and gallery below. Photos and videos you post here will be visible on the showcase site.',
    addPhoto: 'Add photos',
    addVideo: 'Add videos',
    uploadingLabel: 'Uploading…',
    uploadFailed: 'Upload failed.',
    saveErrorToast: 'Something went wrong while saving — check your connection and try again.',
    myVaultTitle: 'My private vault',
    myVaultNote: "A private space to save your photos and videos. Unlike your gallery above, this vault is visible to no one but you.",
    myVaultPhotos: 'Saved photos',
    myVaultVideos: 'Saved videos',
    bioSectionTitle: 'Biography',
    bioSectionNote: 'This information will be used to present the creator on the showcase site.',
    bioOrigin: 'Origin',
    bioNationality: 'Nationality',
    bioAge: 'Age',
    bioBodyType: 'Body type',
    bioOrientation: 'Orientation',
    bioLookingFor: 'What she\'s looking for',
    bioPassions: 'Passions',
    bioUniverse: 'Her universe',
    bioHobbies: 'Hobbies',
    bioPersonality: 'Personality',
    bioFantasies: 'Fantasies',
    bioFetish: 'Fetish',
    bioAmbitions: 'Ambitions',
    bioDiscussionStyle: 'Kind of discussion that turns me on 🔥',
    bioDreams: 'Dreams',
    bioFears: 'Fears / phobias',
    bioVictories: 'Victories',
    bioChallenges: 'Challenges',
    bioSocials: 'Social media (optional)',
    bioSocialsPh: 'e.g. Instagram @..., TikTok @...',
    bioWorkUrl: 'Site where she works (link)',
    bioWorkUrlPh: 'https://...',
    bioOnlineStatus: 'Status',
    statusOnline: 'Online',
    statusOffline: 'Offline',
    contentPolicyNote: 'Photos and videos: lingerie or sexy outfits only (dance, twerk, sensual, teasing content allowed). No nude content — photo or video — is accepted.',
    vitrineHeroEyebrow: 'Welcome to Honeymoon',
    vitrineHeroTitle: 'Your desires, our <em>professional creators</em>',
    vitrineHeroBody: 'Active, experienced creators, entirely dedicated to you. Like, comment, discover their world.',
    vitrineHeroCta: 'Join',
    vitrineHeroTrustSuffix: 'active creators',
    vitrineBack: '← Back',
    vitrineEmpty: 'No creator published yet.',
    visitSiteBtn: 'Visit her site',
    likeLabel: 'Like',
    dislikeLabel: 'Dislike',
    commentsTitle: 'Comments',
    commentPlaceholder: 'Write a respectful comment…',
    commentSubmit: 'Post',
    commentEmpty: 'No comments yet. Be the first!',
    commentModerationError: 'Your comment contains words that are not allowed (insults, profanity). Please rephrase it.',
    commentPosted: 'Comment posted',
    commentRules: "Friendly comment space: no insults, no profanity.",
    commentsCommunityTitle: "Honeymoon Community",
    ourCreatorsTitle: "Our creators",
    bnav2257: "Notice 2257",
    bnavCgu: "Terms",
    bnavPrivacy: "Privacy",
    bnavPricing: "Pricing",
  },
};
function t(key){ const v = I18N[LANG] && I18N[LANG][key]; return (v !== undefined && v !== null) ? v : (I18N['en'] ? I18N['en'][key] : key); }
const LOADED_EXTRA_LANGS = { en: true };
function ensureLangLoaded(lang){
  // Seul l'anglais est chargé d'office avec le reste du site (langue par défaut).
  // Les autres langues ne sont récupérées qu'au moment où elles sont réellement
  // choisies, pour ne pas faire télécharger 7 langues à quelqu'un qui n'en lira
  // qu'une seule — le texte reste lisible en anglais le temps très court du chargement.
  if(LOADED_EXTRA_LANGS[lang] || I18N[lang]) return Promise.resolve();
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'i18n-' + lang + '.js';
    script.onload = () => { LOADED_EXTRA_LANGS[lang] = true; resolve(); };
    script.onerror = () => { console.error('language file failed to load:', lang); resolve(); };
    document.head.appendChild(script);
  });
}
function tr(fr, en, es){ return LANG==='fr' ? fr : (LANG==='es' ? es : en); }

document.getElementById('contact-addr').textContent = CONTACT_EMAIL;
document.getElementById('foot-year').textContent = '© ' + new Date().getFullYear();

function toast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'), 2600);
}
function mockPurchaseNotice(){
  const el = document.getElementById('toast');
  el.textContent = t('mockPurchaseNotice');
  el.classList.add('show', 'mock-purchase');
  setTimeout(()=>{ el.classList.remove('show'); el.classList.remove('mock-purchase'); }, 4200);
}
function esc(s){ return (s||'').replace(/[&<>"']/g, c => ({'&':'&lt;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
// fix: proper escape map
function escText(s){ return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
// Sécurité en plus du CSS (ellipsis) : coupe le texte d'aperçu d'un message s'il est
// trop long, pour qu'il ne dépasse jamais la bulle/ligne d'aperçu.
function truncatePreview(s, max){
  s = s || '';
  max = max || 60;
  return s.length > max ? s.slice(0, max).trimEnd() + '…' : s;
}

/* ---------------- language (menu déroulant, 12 langues) ---------------- */
const LANGS_LIST = [
  { code:'en', label:'English' },
  { code:'fr', label:'Français' },
  { code:'es', label:'Español' },
  { code:'it', label:'Italiano' }
];
function populateLangSelects(){
  document.querySelectorAll('select.lang-select').forEach(sel => {
    if(sel.dataset.filled) return;
    sel.innerHTML = LANGS_LIST.map(l => `<option value="${l.code}">${l.label}</option>`).join('');
    sel.dataset.filled = '1';
  });
}
function syncLangSelects(lang){
  document.querySelectorAll('select.lang-select').forEach(sel => { sel.value = lang; });
}
populateLangSelects();
syncLangSelects(LANG);

async function setLang(lang){
  await ensureLangLoaded(lang);
  LANG = lang;
  try{ localStorage.setItem('hm_lang', lang); }catch(e){}
  syncLangSelects(lang);
  applyStaticText();
  renderRoster();
}
document.getElementById('gate-lang-select').onchange = (e) => setLang(e.target.value);
document.getElementById('app-lang-select').onchange = (e) => setLang(e.target.value);
document.getElementById('creator-lang-select').onchange = (e) => setLang(e.target.value);
document.getElementById('creator-su-lang-select').onchange = (e) => setLang(e.target.value);

function applyStaticText(){
  document.getElementById('t-gate-sub').textContent = t('gateSub');
  document.getElementById('t-gate-enter').textContent = t('gateEnter');
  document.getElementById('t-admin-sub').textContent = t('adminSub');
  document.getElementById('t-admin-enter').textContent = t('adminEnter');
  document.getElementById('t-admin-cancel').textContent = t('adminCancel');
  document.getElementById('t-edit-toggle').textContent = editMode ? t('editToggleOff') : t('editToggleOn');
  document.getElementById('t-hero-eyebrow').textContent = t('heroEyebrow');
  document.getElementById('t-hero-title').innerHTML = t('heroTitle');
  document.getElementById('t-hero-body').textContent = t('heroBody');
  const trustContractEl = document.getElementById('t-agency-trust-contract');
  if(trustContractEl) trustContractEl.textContent = t('agencyTrustContract');
  const trustVerifiedEl = document.getElementById('t-agency-trust-verified');
  if(trustVerifiedEl) trustVerifiedEl.textContent = t('agencyTrustVerified');
  const trustCountLabelEl = document.getElementById('t-agency-trust-count-label');
  if(trustCountLabelEl) trustCountLabelEl.textContent = t('agencyTrustCountLabel');
  document.getElementById('t-catalogue-title').textContent = t('catalogueTitle');
  document.getElementById('t-contact-title').textContent = t('contactTitle');
  document.getElementById('t-contact-body').textContent = t('contactBody');
  document.getElementById('t-contact-btn').textContent = t('contactBtn');
  document.getElementById('t-foot-tag').textContent = t('footTag');
  document.getElementById('t-modal-title').textContent = t('modalTitle');
  document.getElementById('t-gallery-title').textContent = t('galleryTitle');
  document.getElementById('t-gallery-close').textContent = t('galleryClose');
  document.getElementById('gate-pass').placeholder = t('gatePassPh');
  document.getElementById('t-vitrine-link').textContent = t('vitrineLink');
  document.getElementById('t-creator-gate-sub').textContent = t('creatorGateSub');
  document.getElementById('t-creator-enter').textContent = t('creatorEnter');
  document.getElementById('t-back-agency').textContent = t('backAgency');
  document.getElementById('creator-pass').placeholder = t('creatorPassPh');
  document.getElementById('t-creator-forgot').textContent = t('memberForgotLink');
  document.getElementById('t-admin-forgot').textContent = t('memberForgotLink');
  document.getElementById('creator-email').placeholder = t('creatorEmailPh');
  document.getElementById('t-creator-signup-link').textContent = t('creatorSignupLink');
  document.getElementById('t-chat-tab-libre').textContent = t('chatTabLibre');
  document.getElementById('t-chat-tab-orders').textContent = t('chatTabOrders');
  document.getElementById('t-creator-signup-sub').textContent = t('creatorSignupSub');
  document.getElementById('t-creator-signup-note').textContent = t('creatorSignupNote');
  document.getElementById('t-creator-su-submit').textContent = t('creatorSuSubmit');
  document.getElementById('t-creator-login-link').textContent = t('creatorLoginLink');
  document.getElementById('creator-su-email').placeholder = t('creatorEmailPh');
  document.getElementById('creator-su-pass').placeholder = t('creatorPassPh');
  document.getElementById('creator-su-pass2').placeholder = t('memberConfirmPasswordPh');
  document.getElementById('t-creator-logout').textContent = t('creatorLogout');
  document.getElementById('t-agency-logout').textContent = t('agencyLogout');
  document.getElementById('t-contracts-title').textContent = t('signedContractsTitle');
  document.getElementById('t-contracts-close').textContent = t('galleryClose');
  document.getElementById('t-reports-panel-btn').textContent = t('reportsPanelBtn');
  document.getElementById('t-reports-title').textContent = t('reportsPanelBtn');
  document.getElementById('t-reports-close').textContent = t('galleryClose');
  document.documentElement.lang = LANG;
  document.documentElement.dir = (LANG === 'ar') ? 'rtl' : 'ltr';
}

/* ---------------- chaque gate (agence / créatrice) revient indépendamment à la vitrine ---------------- */
document.getElementById('show-agency-gate').onclick = () => {
  document.getElementById('creator-gate').style.display = 'none';
  requireAgeGate(() => { window.location.hash = 'vitrine'; openVitrine(); });
};
document.getElementById('show-creator-signup').onclick = () => {
  document.getElementById('creator-login-view').style.display = 'none';
  document.getElementById('creator-signup-view').style.display = 'block';
};
document.getElementById('show-creator-login').onclick = () => {
  document.getElementById('creator-signup-view').style.display = 'none';
  document.getElementById('creator-login-view').style.display = 'block';
};
document.getElementById('creator-su-submit').onclick = async () => {
  const errEl = document.getElementById('creator-su-err');
  errEl.textContent = '';
  const email = document.getElementById('creator-su-email').value.trim();
  const pass = document.getElementById('creator-su-pass').value;
  const pass2 = document.getElementById('creator-su-pass2').value;
  if(!email || !pass || !pass2){ errEl.textContent = t('memberErrFillAll'); return; }
  if(!isValidEmail(email)){ errEl.textContent = t('memberErrInvalidEmail'); return; }
  if(pass.length < 6){ errEl.textContent = t('memberErrPassShort'); return; }
  if(pass !== pass2){ errEl.textContent = t('memberErrPassMismatch'); return; }
  if(!auth){ errEl.textContent = t('memberErrNoConnection'); return; }
  const btn = document.getElementById('creator-su-submit');
  btn.disabled = true;
  try{
    if(auth.currentUser){ try{ await auth.signOut(); }catch(e){} }
    await auth.createUserWithEmailAndPassword(email, pass);
    toast(t('creatorSignupSuccessToast'));
    document.getElementById('creator-su-email').value = '';
    document.getElementById('creator-su-pass').value = '';
    document.getElementById('creator-su-pass2').value = '';
    document.getElementById('creator-signup-view').style.display = 'none';
    document.getElementById('creator-login-view').style.display = 'block';
    document.getElementById('creator-email').value = email;
  }catch(e){
    console.error('creator signup error', e);
    if(e.code === 'auth/email-already-in-use') errEl.textContent = t('memberErrEmailInUse');
    else if(e.code === 'auth/invalid-email') errEl.textContent = t('memberErrInvalidEmail');
    else errEl.textContent = t('memberErrUnknown');
  }
  btn.disabled = false;
};
document.getElementById('creator-forgot-link').onclick = async () => {
  const errEl = document.getElementById('creator-err');
  errEl.textContent = '';
  const email = document.getElementById('creator-email').value.trim();
  if(!email){ errEl.textContent = t('adminForgotNeedEmail'); return; }
  if(!auth){ errEl.textContent = t('memberErrNoConnection'); return; }
  const btn = document.getElementById('creator-forgot-link');
  btn.disabled = true;
  try{
    await auth.sendPasswordResetEmail(email);
  }catch(e){ console.error('creator password reset error', e); }
  btn.disabled = false;
  errEl.style.color = 'var(--honey)';
  errEl.textContent = t('adminForgotSent').replace('{email}', maskEmail(email));
};
document.getElementById('creator-submit').onclick = async () => {
  const email = document.getElementById('creator-email').value.trim();
  const pass = document.getElementById('creator-pass').value.trim();
  if(!email || !pass){ document.getElementById('creator-err').textContent = t('creatorErr'); return; }
  document.getElementById('creator-err').textContent = '';
  const btn = document.getElementById('creator-submit');
  btn.disabled = true;
  try{
    if(auth.currentUser){ try{ await auth.signOut(); }catch(e){} }
    await auth.signInWithEmailAndPassword(email, pass);
    // Retrouve automatiquement QUEL profil appartient à cet email — aucune
    // liste à maintenir, ça marche pareil pour 6 créatrices ou pour 500.
    const snap = await db.collection('profiles').where('ownerEmail', '==', email).limit(1).get();
    if(snap.empty){
      document.getElementById('creator-err').textContent = t('creatorNotActivatedErr');
      try{ await auth.signOut(); }catch(e){}
      btn.disabled = false;
      return;
    }
    const match = snap.docs[0].id;
    sessionStorage.setItem('hm_creator_slot', match);
    document.getElementById('creator-gate').style.display = 'none';
    launchCreatorView(match);
  }catch(e){
    console.error('creator sign-in error', e);
    document.getElementById('creator-err').textContent = t('creatorErr');
  }
  btn.disabled = false;
};
document.getElementById('creator-email').addEventListener('keydown', (e) => {
  if(e.key === 'Enter') document.getElementById('creator-pass').focus();
});
document.getElementById('creator-pass').addEventListener('keydown', (e) => {
  if(e.key === 'Enter') document.getElementById('creator-submit').click();
});
document.getElementById('creator-logout').onclick = () => {
  sessionStorage.removeItem('hm_creator_slot');
  if(auth && auth.currentUser){
    auth.signOut().catch(()=>{});
  }
  document.getElementById('creator-pass').value = ''; // sécurité : n'affiche jamais un mot de passe déjà tapé
  document.getElementById('creator-email').value = '';
  document.getElementById('my-profile-shell').style.display = 'none';
  document.getElementById('creator-signup-view').style.display = 'none';
  document.getElementById('creator-login-view').style.display = 'block';
  document.getElementById('gate').style.display = 'none';
  document.getElementById('creator-gate').style.display = 'flex';
};
document.getElementById('agency-logout').onclick = () => {
  if(auth){ auth.signOut().catch(() => {}); }
  signedInAsAdmin = false;
  localAdminBypass = false;
  document.getElementById('app-shell').style.display = 'none';
  document.getElementById('gate').style.display = 'flex';
};
document.getElementById('my-lang-select').onchange = (e) => { setMyProfileLang(e.target.value); };
function setMyProfileLang(lang){
  LANG = lang;
  syncLangSelects(lang);
  applyStaticText();
  const slot = sessionStorage.getItem('hm_creator_slot');
  if(slot) renderMyProfile(slot);
}
function setMemberLang(lang, user){
  LANG = lang;
  try{ localStorage.setItem('hm_lang', lang); }catch(e){}
  syncLangSelects(lang);
  applyStaticText();
  const activeBtn = document.querySelector('.member-tab.active');
  const activeTab = activeBtn ? activeBtn.id.replace('member-tab-', '') : 'profile';
  const body = document.getElementById('member-modal-body');
  if(body) body.dataset.memberHomeBuilt = '';
  loadMemberHome(user, activeTab);
}

/* ---------------- main gate ---------------- */
function checkGate(){
  closeAllModals();
  const creatorSlot = sessionStorage.getItem('hm_creator_slot');
  if(creatorSlot){
    document.getElementById('gate').style.display = 'none';
    launchCreatorView(creatorSlot);
    if(typeof updateTopbarHeight === 'function') setTimeout(updateTopbarHeight, 0);
    if(typeof updateBottomNavVisibility === 'function') setTimeout(updateBottomNavVisibility, 0);
    return;
  }
  if(isAdmin()){
    document.getElementById('gate').style.display = 'none';
    document.getElementById('app-shell').style.display = 'block';
    initRoster();
    if(typeof updateTopbarHeight === 'function') setTimeout(updateTopbarHeight, 0);
    if(typeof updateBottomNavVisibility === 'function') setTimeout(updateBottomNavVisibility, 0);
    return;
  }
  // Ni session créatrice, ni session agence : le site s'ouvre directement sur
  // la vitrine publique (comme un site normal), pas sur l'écran de mot de passe.
  // L'accès privé reste disponible via un petit lien discret en bas de la vitrine.
  document.getElementById('app-shell').style.display = 'none';
  document.getElementById('my-profile-shell').style.display = 'none';
  document.getElementById('gate').style.display = 'none';
  document.getElementById('creator-pass').value = '';
  requireAgeGate(() => openVitrine());
  if(typeof updateTopbarHeight === 'function') setTimeout(updateTopbarHeight, 0);
    if(typeof updateBottomNavVisibility === 'function') setTimeout(updateBottomNavVisibility, 0);
}
function openPrivateAccessGate(){
  // Force systématiquement une nouvelle authentification : jamais de bypass
  // silencieux, même si une session (locale ou Firebase) était déjà active.
  localAdminBypass = false;
  signedInAsAdmin = false;
  if(auth && auth.currentUser){
    auth.signOut().catch(()=>{});
  }
  hideAllShells();
  document.getElementById('creator-pass').value = '';
  document.getElementById('gate-pass').value = '';
  document.getElementById('gate-err').textContent = '';
  document.getElementById('gate').style.display = 'flex';
}
document.getElementById('gate-submit').onclick = () => {
  document.getElementById('gate-err').textContent = '';
  const code = document.getElementById('gate-pass').value;
  if(!code){ document.getElementById('gate-err').textContent = t('gateErr'); return; }
  // Bypass LOCAL uniquement : jamais actif une fois le site réellement hébergé.
  if(isLocalTestEnvironment() && code === LOCAL_TEST_CODE){
    localAdminBypass = true;
    document.getElementById('gate-pass').value = '';
    document.getElementById('gate').style.display = 'none';
    document.getElementById('app-shell').style.display = 'block';
    initRoster();
    if(typeof updateTopbarHeight === 'function') updateTopbarHeight();
    if(typeof updateBottomNavVisibility === 'function') updateBottomNavVisibility();
    return;
  }
  if(!auth){
    document.getElementById('gate-err').textContent = LANG==='fr'
      ? 'Connexion à Firebase indisponible — recharge la page et réessaie.'
      : 'Firebase connection unavailable — reload the page and try again.';
    return;
  }
  const btn = document.getElementById('gate-submit');
  btn.disabled = true;
  auth.signInWithEmailAndPassword(AGENCY_ACCESS_EMAIL, code)
    .then(() => {
      document.getElementById('gate-pass').value = '';
      document.getElementById('gate').style.display = 'none';
      document.getElementById('app-shell').style.display = 'block';
      initRoster();
      if(typeof updateTopbarHeight === 'function') updateTopbarHeight();
      if(typeof updateBottomNavVisibility === 'function') updateBottomNavVisibility();
    })
    .catch((err) => {
      console.error('agency code login error', err);
      document.getElementById('gate-err').textContent = t('gateErr') + ' (' + (err.code || err.message) + ')';
    })
    .finally(() => { btn.disabled = false; });
};
document.getElementById('gate-pass').addEventListener('keydown', (e) => {
  if(e.key === 'Enter') document.getElementById('gate-submit').click();
});

/* ---------------- admin gate (edit lock) — Firebase Auth email + mot de passe ---------------- */
let pendingAdminAction = null;
let localAdminBypass = false; // TEST LOCAL uniquement : jamais actif une fois le site réellement hébergé.
let signedInAsAdmin = false; // vrai uniquement après une connexion réussie sur l'écran "Accès administrateur" — le compte agence (©) ne suffit plus.
function isAdmin(){ return localAdminBypass || signedInAsAdmin; }
function requireAdmin(action){
  if(isAdmin()){ action(); return; }
  pendingAdminAction = action;
  document.getElementById('admin-pass').value = '';
  document.getElementById('admin-err').textContent = ''; document.getElementById('admin-err').style.color = '';
  document.getElementById('admin-gate').style.display = 'flex';
}
document.getElementById('admin-submit').onclick = () => {
  const email = document.getElementById('admin-email').value.trim();
  const pass = document.getElementById('admin-pass').value;
  document.getElementById('admin-err').textContent = ''; document.getElementById('admin-err').style.color = '';
  // Bypass LOCAL uniquement : exige désormais l'email ET le mot de passe, pas le mot de passe seul.
  if(isLocalTestEnvironment() && email === LOCAL_TEST_EMAIL && pass === LOCAL_TEST_CODE){
    localAdminBypass = true;
    document.getElementById('admin-pass').value = '';
    document.getElementById('admin-gate').style.display = 'none';
    const action = pendingAdminAction;
    pendingAdminAction = null;
    if(action) action();
    return;
  }
  if(!auth){
    document.getElementById('admin-err').textContent = LANG==='fr'
      ? 'Connexion à Firebase indisponible — recharge la page et réessaie.'
      : 'Firebase connection unavailable — reload the page and try again.';
    return;
  }
  auth.signInWithEmailAndPassword(email, pass)
    .then(() => {
      signedInAsAdmin = true;
      document.getElementById('admin-gate').style.display = 'none';
      const action = pendingAdminAction;
      pendingAdminAction = null;
      if(action) action();
    })
    .catch((err) => {
      console.error('admin login error', err);
      document.getElementById('admin-err').textContent = t('adminErr') + ' (' + (err.code || err.message) + ')';
    });
};
document.getElementById('admin-pass').addEventListener('keydown', (e) => {
  if(e.key === 'Enter') document.getElementById('admin-submit').click();
});
document.getElementById('admin-cancel').onclick = () => {
  pendingAdminAction = null;
  document.getElementById('admin-gate').style.display = 'none';
};
function maskEmail(email){
  const parts = (email || '').split('@');
  if(parts.length !== 2) return email || '';
  const name = parts[0];
  const visible = name.slice(0, Math.min(2, name.length));
  return visible + '•'.repeat(Math.max(3, name.length - visible.length)) + '@' + parts[1];
}
document.getElementById('admin-forgot-link').onclick = async () => {
  const errEl = document.getElementById('admin-err');
  errEl.textContent = '';
  const email = document.getElementById('admin-email').value.trim();
  if(!email){ errEl.textContent = t('adminForgotNeedEmail'); return; }
  if(!auth){ errEl.textContent = t('memberErrNoConnection'); return; }
  const btn = document.getElementById('admin-forgot-link');
  btn.disabled = true;
  try{
    await auth.sendPasswordResetEmail(email);
  }catch(e){ console.error('admin password reset error', e); }
  btn.disabled = false;
  errEl.style.color = 'var(--honey)';
  errEl.textContent = t('adminForgotSent').replace('{email}', maskEmail(email));
};

/* ---------------- roster data ---------------- */
function emptySlot(i){
  return {
    id: 'm' + i, filled: false, name: '', country: '', verified18: false,
    platforms: '', audience: '', contentType: '', availability: '',
    photo: '', contract: '', galleryPhotos: [], galleryVideos: [],
    privatePhotos: [], privateVideos: [], bio: null, likes: 0, dislikes: 0, paidContent: [],
    showcaseMedia: [], featured: false, contractSignatures: [], creatorContractSignature: null
  };
}
/* ---------------- badges de popularité (paliers de couleur selon le nombre de suiveurs) ---------------- */
const FOLLOWER_TIERS = [
  { min: 0,    level: 0, color: '#8a8a8a', key: 'gray' },
  { min: 100,  level: 1, color: '#cd7f32', key: 'bronze' },
  { min: 500,  level: 2, color: '#c0c0c0', key: 'silver' },
  { min: 1000, level: 3, color: '#d4af37', key: 'gold' },
  { min: 2000, level: 4, color: '#7c5cff', key: 'purple' },
  { min: 5000, level: 5, color: '#e0402c', key: 'red' }
];
function getFollowerTier(count){
  count = count || 0;
  let tier = FOLLOWER_TIERS[0];
  for(const tr of FOLLOWER_TIERS){ if(count >= tr.min) tier = tr; }
  return tier;
}
// Détecte si la créatrice vient de franchir un nouveau palier de popularité depuis la
// dernière fois qu'elle a ouvert cet onglet sur cet appareil (mémorisé en local) — sert à
// lui suggérer de publier un contenu exclusif pour remercier ses abonné(e)s.
function checkFollowerTierNudge(profileId, tier){
  const key = 'hm_seen_tier_' + profileId;
  let lastSeen = -1;
  try{ const v = localStorage.getItem(key); if(v !== null) lastSeen = parseInt(v, 10); }catch(e){}
  try{ localStorage.setItem(key, String(tier.level)); }catch(e){}
  if(lastSeen >= 0 && tier.level > lastSeen) return tier;
  return null;
}
function followerBadgeHtml(count){
  const tier = getFollowerTier(count);
  return `<span class="follower-badge" style="background:${tier.color};" title="${count || 0}">${count || 0}</span>`;
}
function followerShieldHtml(count){
  const tier = getFollowerTier(count);
  return `<span class="chat-tier-shield" style="color:${tier.color};" title="${t('tierLabel_' + tier.key)} — ${count || 0} ${t('followersLabel')}">${ICON_SHIELD}</span>`;
}

/* ---------------- badges UXD (statut VIP / rang de soutien, membres) ---------------- */
const UXD_TIERS = [
  { min: 0,    level: 0, color: '#9a9a9a', key: 'gray' },
  { min: 20,   level: 1, color: '#c7c7c7', key: 'silver' },
  { min: 50,   level: 2, color: '#cd7f32', key: 'bronze' },
  { min: 100,  level: 3, color: '#d4af37', key: 'gold' },
  { min: 500,  level: 4, color: '#a06bff', key: 'purple' },
  { min: 1000, level: 5, color: '#e0402c', key: 'red' }
];
function getUxdTier(amount){
  amount = amount || 0;
  let tier = UXD_TIERS[0];
  for(const tr of UXD_TIERS){ if(amount >= tr.min) tier = tr; }
  return tier;
}
function uxdBadgeHtml(amount){
  const tier = getUxdTier(amount);
  return `<span class="follower-badge uxd-badge" style="background:${tier.color};" title="${amount || 0} UXD">${amount || 0} UXD</span>`;
}
function uxdShieldHtml(amount){
  const tier = getUxdTier(amount);
  return `<span class="chat-tier-shield" style="color:${tier.color};" title="${t('tierLabel_' + tier.key)} — ${amount || 0} UXD">${ICON_SHIELD}</span>`;
}
function uxdShieldGreyHtml(amount){
  return `<span class="uxd-stat-shield" title="${amount || 0} UXD">${ICON_SHIELD}<span class="uxd-stat-num">${amount || 0}</span></span>`;
}

/* ---------------- Tip Menu : thèmes et prix fixés par la plateforme (jamais choisis librement par la créatrice) ---------------- */
const TIP_MENU_THEMES = [
  'lingerie', 'danse_sensuelle', 'strip_tease', 'pov_intime', 'roleplay',
  'fetish_pieds', 'costume_theme', 'exterieur', 'duo_couple', 'demande_personnalisee'
];
const TIP_MENU_PRICE_CAPS = {
  photo: { min: 1, max: 20 },
  video: { min: 1, max: 50 },
  audio: { min: 1, max: 50 }
};

function loadRoster(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      if(Array.isArray(parsed) && parsed.length === SLOT_COUNT){
        return parsed.map(m => Object.assign(emptySlot(0), m, {
          // La galerie vient maintenant toujours de Firebase (voir syncProfilesFromFirestore) ;
          // on ignore l'ancien format local (base64) pour éviter tout mélange.
          galleryPhotos: [],
          galleryVideos: []
        }));
      }
    }
  }catch(e){}
  const fresh = [];
  for(let i=1;i<=SLOT_COUNT;i++) fresh.push(emptySlot(i));
  return fresh;
}
function saveRoster(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(roster));
    return true;
  }catch(e){
    toast(t('storageFull'));
    return false;
  }
}

let roster = loadRoster();
let editMode = false;

document.getElementById('edit-toggle').onclick = () => {
  if(!editMode){
    requireAdmin(() => { editMode = true; refreshEditUI(); });
  } else {
    editMode = false;
    refreshEditUI();
  }
};
// Le bouton "CTA" du haut est retiré : on accède à l'administration en
// cliquant sur "Honeymoon" en bas de page (même action, même code Firebase).
document.getElementById('foot-year').onclick = () => {
  document.getElementById('edit-toggle').click();
};
function refreshEditUI(){
  document.getElementById('edit-toggle').classList.toggle('active', editMode);
  document.getElementById('t-edit-toggle').textContent = editMode ? t('editToggleOff') : t('editToggleOn');
  document.getElementById('reports-panel-btn').style.display = 'none';
  document.getElementById('applications-panel-btn').style.display = 'none';
  document.getElementById('deletions-panel-btn').style.display = 'none';
  if(isAdmin()) refreshDeletionsAlertBadge();
  renderRoster();
}

document.getElementById('contact-btn').onclick = () => {
  const subject = encodeURIComponent(LANG==='fr' ? 'Demande de partenariat — Honeymoon' : 'Partnership inquiry — Honeymoon');
  const bodyTxt = encodeURIComponent(LANG==='fr'
    ? "Bonjour,\n\nNous souhaiterions échanger au sujet d'une collaboration avec une ou plusieurs créatrices du catalogue Honeymoon.\n\n"
    : "Hello,\n\nWe'd like to discuss a collaboration with one or more creators from the Honeymoon catalogue.\n\n");
  window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${bodyTxt}`;
};

function initRoster(){
  setLang(LANG);
  syncProfilesFromFirestore();
}

/* Va chercher les infos à jour sur Firebase et les fusionne discrètement
   dans le catalogue déjà affiché. Ne touche jamais à la galerie (photos/
   vidéos), qui reste gérée comme avant. Aucune écriture n'est tentée ici
   — uniquement de la lecture, ouverte à tout le monde. */
async function syncProfilesFromFirestore(){
  if(!db) return;
  // Un visiteur qui n'a jamais rien cliqué n'a encore aucune session Firebase active —
  // si les règles de sécurité exigent une connexion (même anonyme) pour lire les profils,
  // cette lecture échoue silencieusement et la vitrine reste bloquée sur d'anciennes
  // données. On s'assure donc d'avoir une session avant de lire, comme partout ailleurs.
  if(auth && !auth.currentUser){ try{ await auth.signInAnonymously(); }catch(e){} }
  let changed = false;
  try{
    // Une seule requête pour tous les profils existants, au lieu d'interroger un par un
    // les 150 emplacements possibles (dont l'immense majorité sont vides) : un profil
    // jamais rempli n'a jamais de document Firestore, donc il n'apparaît simplement pas
    // ici — inutile de le questionner. Avant : jusqu'à 750 lectures à chaque ouverture
    // de la vitrine (150 emplacements × 5 requêtes), même avec une poignée de vraies
    // créatrices. C'était la cause principale des lenteurs générales du site.
    const allSnap = await db.collection('profiles').get();
    const byId = {};
    allSnap.forEach(d => { byId[d.id] = d; });

    await Promise.all(roster.map(async (m) => {
      const snap = byId[m.id];
      if(!snap) return; // jamais créé côté Firestore : rien à synchroniser pour cet emplacement
      try{
        // La lecture des signatures de contrat est réservée au staff (documents légaux
        // sensibles, jamais publics — à raison) : un simple visiteur n'a pas le droit de
        // la lire. Avant, cette lecture était group avec les autres et son échec empêchait
        // TOUT le reste de se mettre à jour pour ce profil (dont la photo). Elle est donc
        // récupérée séparément, avec son propre filet : si elle échoue (visiteur normal),
        // le reste (photo, galerie, contenu payant...) continue de se mettre à jour normalement.
        const [mediaSnap, paidSnap, showcaseSnap] = await Promise.all([
          db.collection('profiles').doc(m.id).collection('media').orderBy('createdAt').get(),
          db.collection('profiles').doc(m.id).collection('paid_content').orderBy('createdAt', 'desc').get(),
          db.collection('profiles').doc(m.id).collection('showcase_media').orderBy('createdAt').get()
        ]);
        let contractSigSnap = { forEach: () => {} };
        try{
          contractSigSnap = await db.collection('profiles').doc(m.id).collection('contract_signatures').orderBy('signedAt', 'desc').get();
        }catch(e){ /* normal pour un visiteur non-staff : pas d'accès à ces documents */ }
        const data = snap.data();
        Object.assign(m, {
          name: data.name ?? m.name,
          ownerEmail: data.ownerEmail ?? m.ownerEmail ?? '',
          country: data.country ?? m.country,
          verified18: data.verified18 ?? m.verified18,
          platforms: data.platforms ?? m.platforms,
          audience: data.audience ?? m.audience,
          contentType: data.contentType ?? m.contentType,
          availability: data.availability ?? m.availability,
          photo: data.photo || m.photo,
          photoType: data.photoType || m.photoType || 'image',
          bioCoverPhoto: data.bioCoverPhoto || m.bioCoverPhoto || '',
          bioCoverPhotoType: data.bioCoverPhotoType || m.bioCoverPhotoType || 'image',
          contract: data.contract || m.contract,
          filled: data.filled ?? m.filled,
          bio: data.bio || m.bio,
          likes: data.likes || 0,
          dislikes: data.dislikes || 0,
          featured: data.featured || false,
          followersCount: data.followersCount || 0,
          followingMembers: data.followingMembers || [],
          tipMenu: data.tipMenu || m.tipMenu || [],
          tipMenuRules: data.tipMenuRules || m.tipMenuRules || '',
          publicIntro: data.publicIntro || m.publicIntro || '',
          creatorContractSignature: data.creatorContractSignature || m.creatorContractSignature,
          eventBanner: data.eventBanner || null,
          welcomeMessage: data.welcomeMessage || '',
          welcomeAudioUrl: data.welcomeAudioUrl || ''
        });
        changed = true;

        const galleryPhotos = [];
        const galleryVideos = [];
        mediaSnap.forEach(d => {
          const md = d.data();
          const entry = { docId: d.id, url: md.url, likes: md.likes || 0, dislikes: md.dislikes || 0, favorites: md.favorites || 0, commentsCount: md.commentsCount || 0 };
          if(md.kind === 'video') galleryVideos.push(entry);
          else galleryPhotos.push(entry);
        });
        m.galleryPhotos = galleryPhotos;
        m.galleryVideos = galleryVideos;

        const paidContent = [];
        paidSnap.forEach(d => {
          const pd = d.data();
          paidContent.push({
            docId: d.id, kind: pd.kind, url: pd.url, teaserUrl: pd.teaserUrl || '',
            price: pd.price || 0, description: pd.description || '',
            salesCount: pd.salesCount || 0, revenue: pd.revenue || 0
          });
        });
        m.paidContent = paidContent;

        const showcaseMedia = [];
        showcaseSnap.forEach(d => {
          const sd = d.data();
          showcaseMedia.push({ docId: d.id, kind: sd.kind, url: sd.url });
        });
        m.showcaseMedia = showcaseMedia;

        const contractSignatures = [];
        contractSigSnap.forEach(d => contractSignatures.push({ id: d.id, ...d.data() }));
        m.contractSignatures = contractSignatures;
      }catch(e){
        console.error('sync error', m.id, e);
      }
    }));
  }catch(e){
    console.error('sync profiles list error', e);
  }
  if(changed) renderRoster();
}

/* ---------------- creator read-only view ---------------- */
async function launchCreatorView(slotId){
  closeAllModals();
  document.getElementById('app-shell').style.display = 'none';
  document.getElementById('my-profile-shell').style.display = 'block';
  // force un rafraîchissement d'affichage immédiat (évite un écran vide tant qu'on n'a pas interagi)
  void document.getElementById('my-profile-shell').offsetHeight;
  syncLangSelects(LANG);
  applyStaticText();
  renderMyProfile(slotId); // affichage immédiat, ne dépend d'aucune requête réseau
  if(auth && !auth.currentUser){
    try{ await auth.signInAnonymously(); }catch(e){ console.error('anon sign-in failed', e); }
  }
  const m0 = roster.find(x => x.id === slotId);
  // Un seul nouveau rendu une fois que TOUT est chargé (au lieu d'un rendu par requête) : évite le clignotement.
  await Promise.all([
    syncProfilesFromFirestore(),
    m0 ? fetchPrivateVault(m0) : Promise.resolve()
  ]);
  const scrollY = window.scrollY;
  renderMyProfile(slotId);
  window.scrollTo(0, scrollY);
}

async function fetchPrivateVault(m){
  if(!db) return;
  try{
    const snap = await db.collection('profiles').doc(m.id).collection('private_media').orderBy('createdAt').get();
    const photos = []; const videos = [];
    snap.forEach(d => {
      const md = d.data();
      const entry = { docId: d.id, url: md.url };
      if(md.kind === 'video') videos.push(entry); else photos.push(entry);
    });
    m.privatePhotos = photos;
    m.privateVideos = videos;
  }catch(e){
    console.error('private vault fetch error', e);
  }
}

function renderMyProfile(slotId){
  const m = roster.find(x => x.id === slotId);
  const body = document.getElementById('my-profile-body');
  if(!m){ body.innerHTML = ''; return; }

  const photoBlock = m.photo
    ? `<div class="my-profile-photo">${m.photoType === 'video' ? `<video src="${m.photo}" muted loop autoplay playsinline></video>` : `<img src="${m.photo}" loading="lazy" decoding="async">`}</div>`
    : `<div class="my-profile-photo home-photo-slot-empty">
         <span class="home-video-icon">${ICON_CAMERA}</span>
         <span class="home-video-label">${t('noPhotoYet')}</span>
         <span class="home-video-sub">${t('coverPhotoTip')}</span>
       </div>`;

  const homeVideoBlock = (m.photo && m.photoType === 'video') ? '' : `
    <div class="home-video-slot" id="home-video-slot-${m.id}">
      <span class="home-video-icon">${ICON_VIDEO}</span>
      <span class="home-video-label">${t('coverVideoBtn')}</span>
      <span class="home-video-sub">${t('coverVideoRules')}</span>
      <input type="file" id="home-video-file-${m.id}" accept="video/*">
    </div>`;

  body.innerHTML = `
    <div style="text-align:center;">
      <div class="home-photo-row">
        ${photoBlock}
        ${homeVideoBlock}
      </div>
      <h1 class="display" style="font-size:24px;">${t('myProfileHello')}${m.name ? ', ' + escText(m.name) : ''}</h1>
      <p style="color:var(--text-muted);font-size:13px;max-width:420px;margin:10px auto 0;line-height:1.7;">${t('myProfileManageNote')}</p>
      <button class="btn btn-primary" id="my-edit-btn" style="max-width:280px;margin:18px auto 0;">${t('myEditBtn')}</button>
    </div>
    <div class="popularity-hero" id="popularity-hero-${m.id}">
      <div class="tiktok-stat"><span class="tiktok-stat-num">${(m.followingMembers || []).length}</span><span class="tiktok-stat-label">${t('followingLabel')}</span></div>
      <div class="tiktok-stat"><span class="tiktok-stat-num">${m.followersCount || 0}</span><span class="tiktok-stat-label">${t('followersLabel')}</span></div>
      <div class="tiktok-stat"><span class="tiktok-stat-num">${[...(m.galleryPhotos||[]), ...(m.galleryVideos||[])].reduce((s,it) => s + (it.likes||0), 0)}</span><span class="tiktok-stat-label">${t('likesLabel')}</span></div>
      <div class="tiktok-stat"><span class="tiktok-stat-num" id="my-ca-month-stat">…</span><span class="tiktok-stat-label">${t('caThisMonthShort')}</span></div>
    </div>
    <div class="level-bar-wrap" id="level-bar-${m.id}"></div>
    <p style="color:var(--honey);font-size:11.5px;max-width:460px;margin:22px auto 0;line-height:1.6;text-align:center;">${t('contentPolicyNote')}</p>

    <div class="tabs-slide-row">
      <div class="tabs-arrows-row">
        <button type="button" class="level-arrow tabs-arrow-left" data-target="my-tabs-track-${m.id}">‹</button>
        <button type="button" class="level-arrow tabs-arrow-right" data-target="my-tabs-track-${m.id}">›</button>
      </div>
      <div class="my-tabs" id="my-tabs-track-${m.id}">
        <button type="button" class="my-tab-btn" id="my-tab-btn-ideas">💡${t('toolIdeas')}</button>
        <button type="button" class="my-tab-btn" id="my-tab-btn-tipmenu">🍯${t('tipMenuTabLabel')}</button>
        <button type="button" class="my-tab-btn" id="my-tab-btn-content">${ICON_MY_CONTENT}${t('myFamilyContent')}</button>
        <button type="button" class="my-tab-btn" id="my-tab-btn-messages">${ICON_MY_MESSAGES}${t('myFamilyMessages')} <span class="creator-msg-badge" id="creator-msg-badge-${m.id}" style="display:none;"></span></button>
        <button type="button" class="my-tab-btn" id="my-tab-btn-members">👥${t('membersViewerBtn')}</button>
        <button type="button" class="my-tab-btn" id="my-tab-btn-comments">${ICON_NOTE}${t('myFamilyComments')}</button>
        <button type="button" class="my-tab-btn" id="my-tab-btn-ca">${ICON_MY_CA}${t('myFamilyCA')}</button>
        <button type="button" class="my-tab-btn" id="my-tab-btn-tools">${ICON_MY_TOOLS}${t('myFamilyTools')}</button>
        <button type="button" class="my-tab-btn" id="my-tab-btn-rules">${ICON_MY_RULES}${t('myFamilyRules')}</button>
      </div>
    </div>

    <div class="my-tab-panel" id="my-tab-panel-ideas">
      <h2 class="display" style="font-size:19px;">${t('toolIdeas')}</h2>
      <div class="banner-active-card" style="border-color:var(--honey);margin-top:14px;max-width:520px;">
        <div class="banner-active-head">${t('ideasIntroTitle')}</div>
        <p class="banner-active-text">${escText(t('ideasIntroBody'))}</p>
      </div>
      <div class="member-section-title" style="margin-top:22px;">${t('ideasTierTitle')}</div>
      <p style="color:var(--text-muted);font-size:11.5px;margin:6px 0 0;line-height:1.6;max-width:460px;">${t('ideasTierBody')}</p>
      <div class="member-section-title" style="margin-top:24px;">${t('ideasTipsTitle')}</div>
      <p style="color:var(--text-muted);font-size:11px;margin:4px 0 10px;font-style:italic;">${t('ideasTipsNote')}</p>
      <ul style="margin:0;padding-left:18px;color:var(--text);font-size:12.5px;line-height:1.9;max-width:460px;">
        <li>${escText(t('ideasTip1'))}</li>
        <li>${escText(t('ideasTip2'))}</li>
        <li>${escText(t('ideasTip3'))}</li>
        <li>${escText(t('ideasTip4'))}</li>
        <li>${escText(t('ideasTip5'))}</li>
      </ul>
    </div>

    <div class="my-tab-panel active" id="my-tab-panel-empty">
      <div class="banner-active-card" style="margin-top:14px;max-width:460px;text-align:center;">
        <p class="banner-active-text">${escText(t('myTabsChooseHint'))}</p>
      </div>
    </div>

    <div class="my-tab-panel" id="my-tab-panel-content">
      <div id="my-gallery-zone" style="margin-top:14px;"></div>
      <div style="margin-top:36px;padding-top:28px;border-top:1px solid var(--border);">
        <h2 class="display" style="font-size:19px;">${t('myVaultTitle')}</h2>
        <p style="color:var(--text-muted);font-size:12.5px;max-width:460px;margin-top:8px;line-height:1.65;">${t('myVaultNote')}</p>
        <div id="my-vault-zone" style="margin-top:20px;"></div>
      </div>
      <div style="margin-top:36px;padding-top:28px;border-top:1px solid var(--border);">
        <h2 class="display" style="font-size:19px;">${t('paidGalleryTitle')}</h2>
        <p style="color:var(--text-muted);font-size:12.5px;max-width:460px;margin-top:8px;line-height:1.65;">${t('paidGalleryNote')}</p>
        <p style="color:var(--honey);font-size:11.5px;max-width:460px;margin-top:10px;line-height:1.6;">${t('contentPolicyNote')}</p>
        <div id="my-paid-content-zone" style="margin-top:20px;"></div>
      </div>
    </div>

    <div class="my-tab-panel" id="my-tab-panel-messages">
      <h2 class="display" style="font-size:19px;">${t('myMessagesTitle')}</h2>
      <p style="color:var(--text-muted);font-size:12.5px;max-width:460px;margin-top:8px;line-height:1.65;">${t('myMessagesNote')}</p>
      <div id="my-messages-zone" style="margin-top:20px;max-width:460px;"></div>
    </div>

    <div class="my-tab-panel" id="my-tab-panel-members">
      <h2 class="display" style="font-size:19px;">${t('membersViewerTitle')}</h2>
      <p style="color:var(--text-muted);font-size:12.5px;max-width:460px;margin-top:6px;line-height:1.5;">${t('myMembersTabNote')}</p>
      <div class="my-members-filter-row">
        <button type="button" class="audio-mode-btn my-members-filter-btn active" data-filter="all">${t('myMembersFilterAll')}</button>
        <button type="button" class="audio-mode-btn my-members-filter-btn" data-filter="favorites">⭐ ${t('myMembersFilterFavorites')}</button>
      </div>
      <div id="my-members-zone" style="margin-top:10px;max-width:460px;"></div>
    </div>

    <div class="my-tab-panel" id="my-tab-panel-comments">
      <h2 class="display" style="font-size:19px;">${t('myCommentsTitle')}</h2>
      <p style="color:var(--text-muted);font-size:12.5px;max-width:460px;margin-top:8px;line-height:1.65;">${t('myCommentsNote')}</p>
      <div id="my-comments-zone" style="margin-top:20px;"></div>
    </div>

    <div class="my-tab-panel" id="my-tab-panel-ca">
      <h2 class="display" style="font-size:19px;">${t('myFamilyCA')}</h2>
      <p style="color:var(--text-muted);font-size:12.5px;max-width:460px;margin-top:8px;line-height:1.65;">${t('caTabNote')}</p>
      <div id="my-ca-zone" style="margin-top:20px;"></div>
    </div>

    <div class="my-tab-panel" id="my-tab-panel-tipmenu">
      <h2 class="display" style="font-size:19px;">${t('tipMenuTabLabel')}</h2>
      <p style="color:var(--text-muted);font-size:12.5px;max-width:460px;margin-top:8px;line-height:1.65;">${t('tipMenuTabNote')}</p>
      <div id="my-tipmenu-zone" style="margin-top:20px;"></div>
    </div>

    <div class="my-tab-panel" id="my-tab-panel-tools">
      <h2 class="display" style="font-size:19px;">${t('toolsTitle')}</h2>
      <p style="color:var(--text-muted);font-size:12.5px;max-width:460px;margin-top:8px;line-height:1.65;">${t('toolsNote')}</p>
      <div id="my-tools-zone" style="margin-top:20px;"></div>
    </div>

    <div class="my-tab-panel" id="my-tab-panel-rules">
      <h2 class="display" style="font-size:19px;">${t('creatorRulesArticleTitle')}</h2>
      <div class="apply-legal-box" style="margin-top:14px;max-width:520px;">
        <p style="white-space:pre-line;">${t('creatorRulesArticleBody')}</p>
      </div>
      <div id="my-deletion-zone" style="margin-top:20px;max-width:460px;"></div>
    </div>
  `;

  const myTabs = ['ideas', 'content', 'messages', 'members', 'comments', 'ca', 'tipmenu', 'tools', 'rules'];
  function showMyTab(name){
    // Dès qu'elle choisit un onglet, on retire le message d'accueil : c'est bien
    // elle qui décide par quoi commencer, aucun onglet n'est présélectionné à l'arrivée.
    const emptyPanel = document.getElementById('my-tab-panel-empty');
    if(emptyPanel) emptyPanel.classList.remove('active');
    myTabs.forEach(n => {
      document.getElementById('my-tab-panel-' + n).classList.toggle('active', n === name);
      document.getElementById('my-tab-btn-' + n).classList.toggle('active', n === name);
    });
    if(name === 'members') renderMyMembers(m);
  }
  myTabs.forEach(n => {
    document.getElementById('my-tab-btn-' + n).onclick = () => showMyTab(n);
  });
  document.querySelectorAll('.my-members-filter-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.my-members-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderMyMembers(m, btn.dataset.filter);
    };
  });

  document.getElementById('my-edit-btn').onclick = () => openMyProfileEdit(m);
  wireSlideArrows(body);
  const homeVideoInput = document.getElementById('home-video-file-' + m.id);
  if(homeVideoInput){
    homeVideoInput.onchange = async (e) => {
      const file = e.target.files[0];
      if(!file) return;
      const slot = document.getElementById('home-video-slot-' + m.id);
      try{
        await new Promise((resolve, reject) => {
          const video = document.createElement('video');
          video.preload = 'metadata';
          video.onloadedmetadata = () => {
            URL.revokeObjectURL(video.src);
            if(video.duration > 60) reject(new Error('too_long'));
            else resolve();
          };
          video.onerror = () => reject(new Error('invalid_video'));
          video.src = URL.createObjectURL(file);
        });
      }catch(err){
        toast(t('coverVideoTooLong'));
        e.target.value = '';
        return;
      }
      slot.querySelector('.home-video-label').textContent = t('uploadingLabel');
      try{
        const url = await uploadToR2(auth, file, 'covers/' + m.id);
        m.photo = url;
        m.photoType = 'video';
        await db.collection('profiles').doc(m.id).set({ photo: url, photoType: 'video' }, { merge: true });
        toast(t('savedToast'));
        renderMyProfile(slotId);
      }catch(err){
        console.error('home video upload error', err);
        toast(t('uploadFailed'));
        slot.querySelector('.home-video-label').textContent = t('coverVideoBtn');
      }
    };
  }
  renderMyGallery(m);
  renderMyMessages(m);
  renderMyComments(m);
  renderMyVault(m);
  renderMyPaidGallery(m);
  renderMyTools(m);
  renderMyDeletionZone(m);
  renderMyPopularity(m);
  renderMyTipMenu(m);
  renderLevelBar(m);
  loadMyMonthCAStat(m);
}

function wireSlideArrows(container){
  container.querySelectorAll('.tabs-arrow-left, .tabs-arrow-right').forEach(btn => {
    const track = document.getElementById(btn.dataset.target);
    if(!track) return;
    const dir = btn.classList.contains('tabs-arrow-left') ? -1 : 1;
    btn.onclick = () => track.scrollBy({ left: dir * 140, behavior: 'smooth' });
  });
}

function renderLevelBarGeneric(containerId, tiers, value, valueLabelKey, descKeyPrefix){
  descKeyPrefix = descKeyPrefix || 'levelDesc';
  const wrap = document.getElementById(containerId);
  if(!wrap) return;
  let currentTier = tiers[0];
  for(const tr of tiers){ if(value >= tr.min) currentTier = tr; }
  const uid = containerId;
  wrap.innerHTML = `
    <div class="level-bar-row">
      <button type="button" class="level-arrow" id="level-arrow-left-${uid}">‹</button>
      <div class="level-bar" id="level-bar-track-${uid}">
        ${tiers.map((tr, idx) => `
          <div class="level-step ${tr.key === currentTier.key ? 'current' : ''} ${value >= tr.min ? 'reached' : ''}" data-idx="${idx}" data-color="${tr.color}">
            <span class="level-shield" style="${value >= tr.min ? `background:${tr.color};border-color:${tr.color};box-shadow:0 0 10px ${tr.color};` : ''}">${ICON_SHIELD}</span>
            <span class="level-step-label">${t('tierLabel_' + tr.key)}</span>
            <span class="level-step-min">${tr.min}+</span>
          </div>
        `).join('')}
      </div>
      <button type="button" class="level-arrow" id="level-arrow-right-${uid}">›</button>
    </div>
    <div class="level-desc-panel" id="level-desc-${uid}"></div>
  `;
  const track = document.getElementById('level-bar-track-' + uid);
  document.getElementById('level-arrow-left-' + uid).onclick = () => track.scrollBy({ left: -140, behavior: 'smooth' });
  document.getElementById('level-arrow-right-' + uid).onclick = () => track.scrollBy({ left: 140, behavior: 'smooth' });

  const descPanel = document.getElementById('level-desc-' + uid);
  const showTierDesc = (idx) => {
    const tr = tiers[idx];
    const nextTr = tiers[idx + 1];
    track.querySelectorAll('.level-step').forEach((el, i) => {
      const c = tiers[i].color;
      el.classList.toggle('lit', i === idx);
      el.style.setProperty('--lit-color', c);
    });
    descPanel.innerHTML = `
      <span class="level-desc-dot" style="background:${tr.color};box-shadow:0 0 8px ${tr.color};"></span>
      <span>${t('levelDescPrefix')} <b style="color:${tr.color};">${t('tierLabel_' + tr.key)}</b> — ${tr.min}${nextTr ? '–' + (nextTr.min - 1) : '+'} ${t(valueLabelKey).toLowerCase()}. ${t(descKeyPrefix + '_' + tr.key)}</span>
    `;
  };
  track.querySelectorAll('.level-step').forEach(el => {
    el.onclick = () => showTierDesc(parseInt(el.dataset.idx, 10));
    el.addEventListener('mouseenter', () => showTierDesc(parseInt(el.dataset.idx, 10)));
  });
  showTierDesc(tiers.findIndex(tr => tr.key === currentTier.key));
}

/* ================================================================
   DESIRE PROFILE — Streak membre (barre LED + bouclier + flamme fusionnés)
   -------------------------------------------------------------------------
   Logique validée avec Prince :
   - 10 thèmes × 7 questions = 70 questions → profil complet à 100%
   - 1 thème complété (7 questions) = 10% du profil
   - Barre LED : se remplit bleu → rouge sur les 7 questions du thème en cours
   - Bouclier : cumule 1 point par question répondue (0 → 70 sur l'ensemble
     des 10 thèmes), jamais remis à zéro
   - Flamme : s'allume/s'anime à chaque thème terminé (palier de 7)
   - La streak ne casse jamais : elle suit juste le rythme réel du membre
     (1 question/jour, pas de pénalité si un jour est raté)
   - État lu depuis data.desireProfile (Firestore, members/{uid}) — tant que
     les questions (étape 2) ne sont pas câblées, l'état par défaut est à 0.
   ================================================================ */
const DESIRE_THEMES = [
  'flirt', 'playful', 'talkative', 'seduction', 'humor',
  'travel', 'music', 'restaurants', 'movies', 'food'
];
const DESIRE_THEME_ICON = {
  flirt: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:2px;"><path d="M3 12c1.5-2.5 4-4 6-4 1.5 0 2.5 1 3 2 .5-1 1.5-2 3-2 2 0 4.5 1.5 6 4-1.5 1-3.5 1.5-6 1.5-1.5 0-2.5-.5-3-1-.5.5-1.5 1-3 1-2.5 0-4.5-.5-6-1.5z"/><path d="M6.5 13.5c1 1.5 3.3 2.5 5.5 2.5s4.5-1 5.5-2.5"/></svg>',
  playful: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:2px;"><circle cx="12" cy="9" r="6"/><path d="M12 15c-1 1-1 2 0 3s1 2 0 3"/><path d="M10.3 15.3h3.4"/></svg>',
  talkative: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:2px;"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
  seduction: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:2px;"><path d="M12 2c2.5 2 2.5 6 0 8-2.5-2-2.5-6 0-8z"/><path d="M8.5 6.5c-1 2 0 4.5 2 5.5M15.5 6.5c1 2 0 4.5-2 5.5"/><line x1="12" y1="10" x2="12" y2="22"/><path d="M9 16c1-1.5 2-1.5 3 0M15 19c-1-1.5-2-1.5-3 0"/></svg>',
  humor: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:2px;"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 3 4 3 4-3 4-3"/><path d="M8.2 9.3c.6-.5 1.4-.5 2 0M13.8 9.3c.6-.5 1.4-.5 2 0"/></svg>',
  travel: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:2px;"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>',
  music: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:2px;"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  restaurants: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:2px;"><path d="M18 2v20"/><path d="M15 2v7a3 3 0 0 0 3 3 3 3 0 0 0 3-3V2"/><path d="M6 2v6a2 2 0 0 0 2 2 2 2 0 0 0 2-2V2"/><path d="M8 10v12"/></svg>',
  movies: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:2px;"><path d="M20.2 6L3 11l-.9-2.3c-.3-.9.1-1.9 1-2.2l14.5-5.4c.9-.3 1.9.1 2.2 1z"/><path d="M2 11h20v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/><path d="M6 11l2-4M11.5 11l2-4M17 11l2-4"/></svg>',
  food: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:2px;"><path d="M12 8a6 6 0 0 0-6 6.5c0 3.6 2.7 7.5 6 7.5s6-3.9 6-7.5A6 6 0 0 0 12 8z"/><path d="M12 8c0-2 1-3.5 2.5-4"/><path d="M9 5c1 .5 1.5 1.5 1.5 3"/></svg>'
};

function desireBioPercentagesHtml(bio){
  const pct = (bio && bio.desirePercentages) || {};
  return `
    <div style="margin-top:26px;padding-top:20px;border-top:1px solid var(--border);">
      <h3 style="font-size:15px;margin-bottom:4px;color:var(--honey);">${t('bioDesireProfileTitle')}</h3>
      <p style="color:var(--text-muted);font-size:12px;margin-bottom:16px;line-height:1.6;">${t('bioDesireProfileNote')}</p>
      ${DESIRE_THEMES.map(key => `
        <div class="desire-pct-row" style="margin-bottom:16px;">
          <label style="display:flex;align-items:center;justify-content:space-between;margin:0 0 6px;text-transform:none;font-weight:600;">
            <span>${DESIRE_THEME_ICON[key]}${t('desireTheme_' + key)}</span>
            <span id="ed-bio-pct-${key}-val" style="color:var(--honey);font-weight:700;">${parseInt(pct[key], 10) || 0}%</span>
          </label>
          <input type="range" min="0" max="100" step="5" id="ed-bio-pct-${key}" value="${parseInt(pct[key], 10) || 0}" style="width:100%;">
        </div>
      `).join('')}
    </div>`;
}

function wireDesireBioPercentages(){
  DESIRE_THEMES.forEach(key => {
    const input = document.getElementById('ed-bio-pct-' + key);
    const val = document.getElementById('ed-bio-pct-' + key + '-val');
    if(input && val){
      input.oninput = () => { val.textContent = input.value + '%'; };
    }
  });
}

function readDesireBioPercentages(){
  const out = {};
  DESIRE_THEMES.forEach(key => {
    const input = document.getElementById('ed-bio-pct-' + key);
    out[key] = input ? parseInt(input.value, 10) || 0 : 0;
  });
  return out;
}
const DESIRE_QUESTIONS_PER_THEME = 7;
const DESIRE_TOTAL_QUESTIONS = DESIRE_THEMES.length * DESIRE_QUESTIONS_PER_THEME; // 70

function getDesireProfileState(data){
  const dp = (data && data.desireProfile) || {};
  const themeIndex = Math.min(Math.max(dp.themeIndex || 0, 0), DESIRE_THEMES.length);
  const questionIndex = Math.min(Math.max(dp.questionIndex || 0, 0), DESIRE_QUESTIONS_PER_THEME);
  const points = Math.min(Math.max(dp.points || 0, 0), DESIRE_TOTAL_QUESTIONS);
  return { themeIndex, questionIndex, points, themeScores: dp.themeScores || {} };
}

function renderLevelBar(m){
  renderLevelBarGeneric('level-bar-' + m.id, FOLLOWER_TIERS, m.followersCount || 0, 'followersLabel');
}

async function loadMyMonthCAStat(m){
  const el = document.getElementById('my-ca-month-stat');
  if(!el || !db) return;
  try{
    if(auth && !auth.currentUser){ try{ await auth.signInAnonymously(); }catch(e){} }
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let total = 0;
    const items = m.paidContent || [];
    await Promise.all(items.map(async (it) => {
      const ordersSnap = await db.collection('profiles').doc(m.id).collection('paid_content').doc(it.docId).collection('orders')
        .where('status', '==', 'paid').get();
      ordersSnap.forEach(o => {
        const d = o.data();
        const paidAt = d.paidAt && d.paidAt.toDate ? d.paidAt.toDate() : null;
        if(paidAt && paidAt >= monthStart) total += (it.price || 0);
      });
    }));
    el.textContent = total + '€';
  }catch(e){ console.error('loadMyMonthCAStat error', e); el.textContent = '—'; }
}

async function renderMyTipMenu(m){
  const zone = document.getElementById('my-tipmenu-zone');
  if(!zone) return;
  const rows = (m.tipMenu && m.tipMenu.length ? m.tipMenu : []).map(r => Object.assign({ _open: false }, r));
  const typeIconSvg = { photo: ICON_CAMERA, video: ICON_VIDEO, audio: ICON_AUDIO };
  const limitWords = (str, n) => { const words = (str || '').trim().split(/\s+/).filter(Boolean); return words.length > n ? words.slice(0, n).join(' ') : str; };

  const collapsedRowHtml = (r, idx) => `
    <div class="tipmenu-card tipmenu-collapsed" data-idx="${idx}">
      <span class="tipmenu-collapsed-emoji">${escText(r.emoji || '')}</span>
      <span class="tipmenu-collapsed-icon">${typeIconSvg[r.type || 'photo']}</span>
      <span class="tipmenu-collapsed-theme">${escText(r.theme || t('tipMenuThemePh'))}</span>
      <span class="tipmenu-collapsed-price">${r.price ? r.price + '€' : '—'}</span>
      <button type="button" class="tipmenu-edit-btn" title="${escAttr(t('tipMenuEditRow'))}">${ICON_EDIT}</button>
      <button type="button" class="tipmenu-row-rm">✕</button>
    </div>`;

  const openRowHtml = (r, idx) => {
    const type = r.type || 'photo';
    const cap = TIP_MENU_PRICE_CAPS[type];
    return `
    <div class="tipmenu-card" data-idx="${idx}">
      <div class="tipmenu-card-top">
        <input type="text" class="tipmenu-emoji" maxlength="8" value="${escAttr(r.emoji || '')}" placeholder="🌸">
        <span class="tipmenu-help tipmenu-help-inline" data-help="emoji">${ICON_HELP}</span>
        <div class="tipmenu-type-toggle">
          <button type="button" class="tipmenu-type-btn ${type==='photo'?'active':''}" data-type="photo">${ICON_CAMERA} ${t('tipMenuColPhoto')}</button>
          <button type="button" class="tipmenu-type-btn ${type==='video'?'active':''}" data-type="video">${ICON_VIDEO} ${t('tipMenuColVideo')}</button>
          <button type="button" class="tipmenu-type-btn ${type==='audio'?'active':''}" data-type="audio">${ICON_AUDIO} ${t('tipMenuColAudio')}</button>
        </div>
        <button type="button" class="tipmenu-row-rm">✕</button>
      </div>
      <div class="tipmenu-help-text" data-help-for="emoji" style="display:none;">${t('tipMenuHelpEmoji')}</div>
      <label>${t('tipMenuColTheme')}
        <span class="tipmenu-help" data-help="theme">${ICON_HELP}</span>
        <button type="button" class="tipmenu-desc-icon" data-help="desc" title="${escAttr(t('tipMenuDescLabel'))}">${ICON_NOTE}</button>
      </label>
      <div class="tipmenu-help-text" data-help-for="theme" style="display:none;">${t('tipMenuHelpTheme')}</div>
      <input type="text" class="tipmenu-theme" list="tipmenu-theme-suggestions" maxlength="15" value="${escAttr(r.theme || '')}" placeholder="${escAttr(t('tipMenuThemePh'))}">
      <div class="tipmenu-help-text" data-help-for="desc" style="display:none;">
        <label style="margin-top:0;">${t('tipMenuDescLabel')}</label>
        <textarea class="tipmenu-desc" rows="2" maxlength="200" placeholder="${escAttr(t('tipMenuDescPh'))}">${escText(r.description || '')}</textarea>
      </div>
      <label>${t('tipMenuPriceLabel')} <span class="tipmenu-help" data-help="price">${ICON_HELP}</span></label>
      <div class="tipmenu-help-text" data-help-for="price" style="display:none;">${t('tipMenuHelpPrice').replace('{min}', cap.min).replace('{max}', cap.max)}</div>
      <input type="number" class="tipmenu-price" min="${cap.min}" max="${cap.max}" step="1" value="${r.price || ''}" placeholder="${cap.min}–${cap.max}€">
      <p class="tipmenu-earn-note">${t('tipMenuEarnNote').replace('{amount}', r.price ? Math.round(r.price * 0.6 * 100) / 100 : '—')}</p>

      <label style="margin-top:10px;">${t('tipMenuContentLabel')}</label>
      <p class="member-note" style="margin:-2px 0 6px;">${t('tipMenuContentNote')}</p>
      ${r.contentUrl ? `
        <div class="tipmenu-content-preview">
          ${type === 'video' ? `<video src="${escAttr(r.contentUrl)}" controls></video>` : type === 'audio' ? `<audio src="${escAttr(r.contentUrl)}" controls></audio>` : `<img src="${escAttr(r.contentUrl)}" loading="lazy" decoding="async">`}
          <button type="button" class="tipmenu-content-rm" data-idx="${idx}">✕</button>
        </div>` : dualUploadZoneHtml('tipmenu-content-' + idx, type === 'video' ? 'video/*' : type === 'audio' ? 'audio/*' : 'image/*')}

      <div class="modal-actions" style="margin-top:12px;">
        <button type="button" class="btn btn-primary btn-sm tipmenu-row-done" style="flex:1;">${t('tipMenuRowDoneBtn')}</button>
      </div>
    </div>`;
  };

  const rowHtml = (r, idx) => r._open ? openRowHtml(r, idx) : collapsedRowHtml(r, idx);

  zone.innerHTML = `
    <div class="tipmenu-how-it-works">
      <h4>${t('tipMenuHowTitle')}</h4>
      <p>${t('tipMenuHowP1')}</p>
      <p>${t('tipMenuHowP2')}</p>
      <p>${t('tipMenuHowP3')}</p>
    </div>
    <datalist id="tipmenu-theme-suggestions">
      ${TIP_MENU_THEMES.map(th => `<option value="${escAttr(t('tipMenuTheme_' + th))}">`).join('')}
    </datalist>
    <p class="member-note" style="margin-bottom:16px;">${t('tipMenuRowExplain')}</p>
    <div id="tipmenu-rows">${rows.map(rowHtml).join('')}</div>
    <button type="button" class="btn btn-ghost btn-sm" id="tipmenu-add-row" style="margin-top:10px;">+ ${t('tipMenuAddRow')}</button>
    <div class="tipmenu-custom-preview">${ICON_CHAT_SM} ${t('tipMenuCustomNote')}</div>
    <p class="member-note" style="margin-top:16px;">${t('tipMenuPriceLockedNote')}</p>
    <a href="https://www.google.com/search?q=euro+to" target="_blank" rel="noopener" class="btn btn-ghost btn-sm" style="display:flex;align-items:center;justify-content:center;gap:6px;margin-top:8px;text-decoration:none;">${ICON_EXTLINK} ${t('tipMenuCurrencyCompareLink')}</a>
    <div class="modal-actions">
      <button class="btn btn-primary btn-sm" id="tipmenu-publish" style="flex:1;">${t('tipMenuPublishBtn')}</button>
    </div>
  `;
  let localRows = rows.slice();
  const rowsEl = document.getElementById('tipmenu-rows');

  function syncOpenCardToLocalRows(card){
    const idx = parseInt(card.dataset.idx, 10);
    if(!localRows[idx]) return;
    const priceInput = card.querySelector('.tipmenu-price');
    const type = card.querySelector('.tipmenu-type-btn.active').dataset.type;
    const cap = TIP_MENU_PRICE_CAPS[type];
    let price = priceInput.value ? parseInt(priceInput.value, 10) : null;
    // Plafond automatique : jamais au-dessus du maximum autorisé par la plateforme pour ce type.
    if(price !== null){ price = Math.max(cap.min, Math.min(cap.max, price)); }
    localRows[idx].emoji = card.querySelector('.tipmenu-emoji').value.trim();
    localRows[idx].theme = card.querySelector('.tipmenu-theme').value.trim();
    localRows[idx].type = type;
    localRows[idx].price = price;
    localRows[idx].description = limitWords(card.querySelector('.tipmenu-desc').value.trim(), 20);
  }

  function refreshRows(){ rowsEl.innerHTML = localRows.map(rowHtml).join(''); wireRows(); }

  function wireRows(){
    rowsEl.querySelectorAll('.tipmenu-row-rm').forEach(btn => {
      btn.onclick = () => {
        localRows.splice(parseInt(btn.closest('.tipmenu-card').dataset.idx, 10), 1);
        refreshRows();
      };
    });
    rowsEl.querySelectorAll('.tipmenu-edit-btn').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.closest('.tipmenu-card').dataset.idx, 10);
        localRows[idx]._open = true;
        refreshRows();
      };
    });
    rowsEl.querySelectorAll('.tipmenu-row-done').forEach(btn => {
      btn.onclick = () => {
        const card = btn.closest('.tipmenu-card');
        syncOpenCardToLocalRows(card);
        const idx = parseInt(card.dataset.idx, 10);
        if(!localRows[idx].theme){ toast(t('tipMenuThemeRequired')); return; }
        if(!localRows[idx].contentUrl){ toast(t('tipMenuContentRequired')); return; }
        localRows[idx]._open = false;
        refreshRows();
      };
    });
    rowsEl.querySelectorAll('.tipmenu-type-btn').forEach(btn => {
      btn.onclick = () => {
        const card = btn.closest('.tipmenu-card');
        const idx = parseInt(card.dataset.idx, 10);
        localRows[idx].emoji = card.querySelector('.tipmenu-emoji').value;
        localRows[idx].theme = card.querySelector('.tipmenu-theme').value;
        localRows[idx].description = card.querySelector('.tipmenu-desc').value;
        localRows[idx].type = btn.dataset.type;
        localRows[idx].price = null; // le prix dépend du type, on réinitialise
        refreshRows();
      };
    });
    rowsEl.querySelectorAll('.tipmenu-price').forEach(inp => {
      inp.addEventListener('change', () => {
        const cap = TIP_MENU_PRICE_CAPS[inp.closest('.tipmenu-card').querySelector('.tipmenu-type-btn.active').dataset.type];
        let v = parseInt(inp.value, 10);
        if(isNaN(v)) return;
        if(v > cap.max){ v = cap.max; toast(t('tipMenuPriceClamped').replace('{max}', cap.max)); }
        if(v < cap.min) v = cap.min;
        inp.value = v;
        const note = inp.closest('.tipmenu-card').querySelector('.tipmenu-earn-note');
        if(note) note.textContent = t('tipMenuEarnNote').replace('{amount}', Math.round(v * 0.6 * 100) / 100);
      });
    });
    rowsEl.querySelectorAll('.tipmenu-content-rm').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.idx, 10);
        localRows[idx].contentUrl = '';
        refreshRows();
      };
    });
    localRows.forEach((r, idx) => {
      if(!r.contentUrl && r._open){
        wireDualUpload('tipmenu-content-' + idx, async (files) => {
          const file = files[0];
          if(!file) return;
          try{
            const url = await uploadToR2(auth, file, 'tipmenu-content/' + m.id);
            localRows[idx].contentUrl = url;
            toast(t('addedToast'));
            refreshRows();
          }catch(err){ console.error('tip menu content upload error', err); toast(t('uploadFailed')); }
        });
      }
    });
    rowsEl.querySelectorAll('.tipmenu-help, .tipmenu-desc-icon').forEach(btn => {
      btn.onclick = () => {
        const card = btn.closest('.tipmenu-card');
        const el = card.querySelector(`.tipmenu-help-text[data-help-for="${btn.dataset.help}"]`);
        if(el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
      };
    });
  }
  wireRows();
  document.getElementById('tipmenu-add-row').onclick = () => {
    if(localRows.length >= 25){ toast(t('tipMenuMaxRows')); return; }
    localRows.push({ emoji: '🌸', type: 'photo', theme: '', price: null, description: '', _open: true });
    refreshRows();
  };
  document.getElementById('tipmenu-publish').onclick = async () => {
    // Ferme et valide toute ligne encore en cours d'édition avant de publier.
    rowsEl.querySelectorAll('.tipmenu-card:not(.tipmenu-collapsed)').forEach(card => syncOpenCardToLocalRows(card));
    const collected = localRows.filter(r => r.theme && r.theme.trim() && r.contentUrl).map(r => ({
      emoji: r.emoji || '', type: r.type || 'photo', theme: r.theme.trim().slice(0, 15),
      price: r.price || null, description: limitWords(r.description || '', 20), contentUrl: r.contentUrl || ''
    }));
    const btn = document.getElementById('tipmenu-publish');
    btn.disabled = true;
    try{
      await db.collection('profiles').doc(m.id).set({ tipMenu: collected }, { merge: true });
      m.tipMenu = collected;
      toast(t('tipMenuPublishedToast'));
      renderMyTipMenu(m);
    }catch(e){ console.error('publish tip menu error', e); toast(t('memberErrUnknown')); }
    btn.disabled = false;
  };
}

async function renderMyDeletionZone(m){
  const zone = document.getElementById('my-deletion-zone');
  if(!zone) return;
  zone.innerHTML = `<span class="gallery-empty">${t('paidOrdersLoading')}</span>`;
  try{
    if(auth && !auth.currentUser){ try{ await auth.signInAnonymously(); }catch(e){} }
    const snap = await db.collection('deletion_requests')
      .where('profileId', '==', m.id).where('status', '==', 'pending').limit(1).get();
    if(!snap.empty){
      const req = snap.docs[0];
      const r = req.data();
      const eligibleMs = r.eligibleAt && r.eligibleAt.toDate ? r.eligibleAt.toDate().getTime() : 0;
      const daysLeft = Math.max(0, Math.ceil((eligibleMs - Date.now()) / 86400000));
      zone.innerHTML = `
        <div class="member-banner-warn">
          <span>${t('deletionPendingBanner').replace('{n}', daysLeft)}</span>
          <button type="button" id="my-deletion-cancel-btn">${t('deletionCancelBtn')}</button>
        </div>
      `;
      document.getElementById('my-deletion-cancel-btn').onclick = async () => {
        try{
          await req.ref.set({ status: 'cancelled' }, { merge: true });
          toast(t('deletionCancelledToast'));
          renderMyDeletionZone(m);
        }catch(e){ console.error('cancel deletion error', e); toast(t('memberErrUnknown')); }
      };
      return;
    }
  }catch(e){ console.error('load deletion request error', e); }

  zone.innerHTML = `
    <button type="button" class="btn btn-ghost btn-sm" id="my-deletion-open-btn" style="border-color:var(--rose);color:var(--rose);">${t('deletionOpenBtn')}</button>
    <div id="my-deletion-form" style="display:none;margin-top:14px;">
      <label>${t('deletionDelayLabel')}</label>
      <select id="my-deletion-delay">
        ${[1,2,3,4,5,6,7].map(n => `<option value="${n}">${t('deletionDelayOption').replace('{n}', n)}</option>`).join('')}
      </select>
      <label>${t('deletionReasonLabel')}</label>
      <textarea id="my-deletion-reason" rows="3" placeholder="${escAttr(t('deletionReasonPh'))}"></textarea>
      <div class="member-err" id="my-deletion-err"></div>
      <div class="modal-actions">
        <button class="btn btn-primary btn-sm" id="my-deletion-submit" style="flex:1;background:var(--rose);border-color:var(--rose);">${t('deletionSubmitBtn')}</button>
      </div>
    </div>
  `;
  document.getElementById('my-deletion-open-btn').onclick = () => {
    document.getElementById('my-deletion-form').style.display = 'block';
    document.getElementById('my-deletion-open-btn').style.display = 'none';
  };
  document.getElementById('my-deletion-submit').onclick = async () => {
    const errEl = document.getElementById('my-deletion-err');
    errEl.textContent = '';
    const delayDays = parseInt(document.getElementById('my-deletion-delay').value, 10);
    const reason = document.getElementById('my-deletion-reason').value.trim();
    if(!reason){ errEl.textContent = t('memberErrFillAll'); return; }
    const btn = document.getElementById('my-deletion-submit');
    btn.disabled = true;
    try{
      if(auth && !auth.currentUser){ try{ await auth.signInAnonymously(); }catch(e){} }
      const eligibleAt = firebase.firestore.Timestamp.fromMillis(Date.now() + delayDays * 86400000);
      await db.collection('deletion_requests').add({
        profileId: m.id, creatorName: m.name || '', reason: reason.slice(0, 1000),
        delayDays, status: 'pending',
        requestedAt: firebase.firestore.FieldValue.serverTimestamp(), eligibleAt
      });
      try{
        if(typeof emailjs !== 'undefined' && EMAILJS_PUBLIC_KEY !== 'TON_EMAILJS_PUBLIC_KEY'){
          await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
            to_email: ADMIN_NOTIFY_EMAIL, subject: `Honeymoon — Demande de suppression de compte (${m.name || m.id})`,
            buyer_name: m.name || m.id, buyer_contact: '', creator_name: m.name || '',
            item_desc: `Raison : ${reason}\nDélai demandé : ${delayDays} jour(s)`, price: '', ref: 'SUPPRESSION'
          });
        }
      }catch(e){ console.error('deletion request emailjs error', e); }
      toast(t('deletionRequestedToast'));
      renderMyDeletionZone(m);
    }catch(e){
      console.error('deletion request error', e);
      errEl.textContent = t('memberErrUnknown') + ' (' + (e.code || e.message || e) + ')';
    }
    btn.disabled = false;
  };
}

async function renderMyComments(m){
  const zone = document.getElementById('my-comments-zone');
  if(!zone) return;
  zone.innerHTML = `<span class="gallery-empty">${t('paidOrdersLoading')}</span>`;
  try{
    if(auth && !auth.currentUser){ try{ await auth.signInAnonymously(); }catch(e){} }
    const snap = await db.collection('profiles').doc(m.id).collection('comments').orderBy('createdAt', 'desc').limit(100).get();
    if(snap.empty){
      zone.innerHTML = `<span class="gallery-empty">${t('myCommentsNone')}</span>`;
      return;
    }
    zone.innerHTML = snap.docs.map(d => {
      const c = d.data();
      return `
        <div class="comment-card">
          <div class="comment-avatar">${escText(initials(c.name))}</div>
          <div class="comment-body">
            <div class="comment-head"><span class="comment-name">${escText(c.name || '—')}</span><span class="comment-date">${formatCommentDate(c.createdAt)}</span></div>
            <div class="comment-text">${escText(c.text || '')}</div>
            <div class="comment-actions-row">
              <button class="comment-report-btn my-comment-delete-btn" data-docid="${d.id}">${ICON_TRASH} ${t('myCommentsDelete')}</button>
              <button class="comment-report-btn my-comment-flag-btn" data-name="${escAttr(c.name || '')}" data-text="${escAttr(c.text || '')}">${ICON_FLAG} ${t('myCommentsReportToTeam')}</button>
            </div>
          </div>
        </div>`;
    }).join('');
    zone.querySelectorAll('.my-comment-delete-btn').forEach(btn => {
      btn.onclick = async () => {
        if(!confirm(t('myCommentsConfirmDelete'))) return;
        btn.disabled = true;
        try{
          await db.collection('profiles').doc(m.id).collection('comments').doc(btn.dataset.docid).delete();
          renderMyComments(m);
          toast(t('removedToast'));
        }catch(e){
          console.error('delete comment error', e);
          toast(t('memberErrUnknown') + ' (' + (e.code || e.message || e) + ')');
        }
      };
    });
    zone.querySelectorAll('.my-comment-flag-btn').forEach(btn => {
      btn.onclick = () => openReportModal({
        profile: m.name || '',
        details: `${t('reportCommentPrefix')} "${btn.dataset.name}": "${btn.dataset.text}"`
      });
    });
  }catch(e){
    console.error('load my comments error', e);
    zone.innerHTML = `<span class="gallery-empty">${(LANG==='fr' ? 'Erreur : ' : 'Error: ')}${escText(e && e.message ? e.message : String(e))}</span>`;
  }
}

function renderMyVault(m){
  const zone = document.getElementById('my-vault-zone');
  if(!zone) return;

  const photoThumbs = m.privatePhotos.map((item) => `
    <div class="gallery-thumb">
      <img src="${item.url}" data-full="${item.url}" data-type="image" loading="lazy">
      <button class="rm" data-kind="photo" data-docid="${item.docId}">✕</button>
    </div>`).join('');
  const videoThumbs = m.privateVideos.map((item) => `
    <div class="gallery-thumb">
      <video src="${item.url}" data-full="${item.url}" data-type="video" muted></video>
      <button class="rm" data-kind="video" data-docid="${item.docId}">✕</button>
    </div>`).join('');

  zone.innerHTML = `
    <p class="content-policy-reminder">🔞 ${t('contentPolicyNote')}</p>
    <div class="gallery-section">
      <h4>${t('myVaultPhotos')} (${m.privatePhotos.length})</h4>
      <div class="gallery-strip">${photoThumbs}</div>
      ${dualUploadZoneHtml('vault-photo', 'image/*', { multiple: true })}
    </div>
    <div class="gallery-section">
      <h4>${t('myVaultVideos')} (${m.privateVideos.length})</h4>
      <div class="gallery-strip">${videoThumbs}</div>
      ${dualUploadZoneHtml('vault-video', 'video/*', { multiple: true })}
    </div>
  `;

  zone.querySelectorAll('.gallery-thumb img, .gallery-thumb video').forEach(el => {
    el.onclick = () => openLightbox(el.dataset.full, el.dataset.type);
  });

  wireDualUpload('vault-photo', async (files) => {
    for(const file of Array.from(files)){
      try{
        const item = await uploadMediaItem(m.id, file, 'photo', { collection: 'private_media', pathPrefix: 'private/photos' });
        m.privatePhotos.push(item);
        toast(t('addedToast'));
      }catch(err){ console.error(err); toast(t('saveErrorToast')); }
    }
    renderMyVault(m);
  });
  wireDualUpload('vault-video', async (files) => {
    for(const file of Array.from(files)){
      try{
        const item = await uploadMediaItem(m.id, file, 'video', { collection: 'private_media', pathPrefix: 'private/videos' });
        m.privateVideos.push(item);
        toast(t('addedToast'));
      }catch(err){ console.error(err); toast(t('saveErrorToast')); }
    }
    renderMyVault(m);
  });

  zone.querySelectorAll('.rm').forEach(btn => {
    btn.onclick = async () => {
      const kind = btn.dataset.kind;
      const docId = btn.dataset.docid;
      btn.disabled = true;
      try{
        await deleteMediaItem(m.id, docId, 'private_media');
        if(kind === 'photo') m.privatePhotos = m.privatePhotos.filter(x => x.docId !== docId);
        else m.privateVideos = m.privateVideos.filter(x => x.docId !== docId);
        renderMyVault(m);
        toast(t('removedToast'));
      }catch(e){
        toast(t('saveErrorToast'));
      }
    };
  });
}

/* ================= GALERIE PAYANTE (contenu à débloquer sur la vitrine) ================= */
const PAID_PHOTO_MAX = 20;
const PAID_VIDEO_MAX = 50;
const PAID_AUDIO_MAX = 50;

function renderMyPaidGallery(m){
  renderMyPaidContentZone(m);
  renderMyPaidStatsZone(m);
}

function renderMyPaidContentZone(m){
  const zone = document.getElementById('my-paid-content-zone');
  if(!zone) return;
  const items = m.paidContent || [];

  const itemCards = items.map(it => {
    const priceBadge = `<span class="paid-item-price">${it.price}€</span>`;
    const thumbs = it.kind === 'video'
      ? `
        <div class="gallery-thumb">
          <video src="${it.teaserUrl}" muted></video>
          <span class="paid-thumb-tag">${t('paidTeaserBadge')}</span>
        </div>
        <div class="gallery-thumb">
          <video src="${it.url}" muted></video>
          <div class="paid-lock-badge">${ICON_LOCK}</div>
          ${priceBadge}
        </div>`
      : it.kind === 'audio'
      ? `
        <div class="gallery-thumb audio-thumb">
          ${AICON.music}
          ${priceBadge}
        </div>`
      : `
        <div class="gallery-thumb">
          <img src="${it.url}" loading="lazy" decoding="async">
          <div class="paid-lock-badge">${ICON_LOCK}</div>
          ${priceBadge}
        </div>`;
    const audioPreview = it.kind === 'audio' ? `<audio controls src="${it.url}" style="width:100%;margin-top:8px;height:32px;"></audio>` : '';
    return `
      <div class="paid-item-row">
        <div class="gallery-strip">${thumbs}</div>
        ${audioPreview}
        <p class="paid-item-desc">${escText(it.description) || '—'}</p>
        <div class="paid-item-stats">
          <span>${ICON_CART}${it.salesCount || 0} ${t('paidSalesLabel')}</span>
          <span>${ICON_COIN}${it.revenue || 0}€</span>
          <button class="rm" data-docid="${it.docId}" style="position:static;margin-left:auto;width:auto;height:auto;padding:5px 9px;border-radius:8px;">✕ ${t('cancel')}</button>
        </div>
      </div>`;
  }).join('');

  zone.innerHTML = `
    <div class="paid-add-row">
      <button class="btn btn-ghost btn-sm" id="add-paid-photo-btn">${ICON_CAMERA}${t('paidAddPhoto')}</button>
      <button class="btn btn-ghost btn-sm" id="add-paid-video-btn">${ICON_VIDEO}${t('paidAddVideo')}</button>
      <button class="btn btn-ghost btn-sm" id="add-paid-audio-btn">${AICON.music}${t('paidAddAudio')}</button>
    </div>
    <div class="paid-items-list">
      ${itemCards || `<span class="gallery-empty">${t('paidNoItems')}</span>`}
    </div>
  `;

  document.getElementById('add-paid-photo-btn').onclick = () => openPaidContentModal(m, 'photo');
  document.getElementById('add-paid-video-btn').onclick = () => openPaidContentModal(m, 'video');
  document.getElementById('add-paid-audio-btn').onclick = () => openPaidContentModal(m, 'audio');

  zone.querySelectorAll('.paid-item-row .rm').forEach(btn => {
    btn.onclick = async () => {
      const docId = btn.dataset.docid;
      btn.disabled = true;
      try{
        await db.collection('profiles').doc(m.id).collection('paid_content').doc(docId).delete();
        m.paidContent = (m.paidContent || []).filter(x => x.docId !== docId);
        renderMyPaidGallery(m);
        toast(t('removedToast'));
      }catch(e){
        console.error(e);
        toast(t('saveErrorToast'));
      }
    };
  });
}

function renderMyPaidStatsZone(m){
  const zone = document.getElementById('my-ca-zone');
  if(!zone) return;
  const items = m.paidContent || [];
  const totalRevenue = items.reduce((sum, it) => sum + (it.revenue || 0), 0);
  const totalNet = Math.round(totalRevenue * (DEFAULT_SPLIT_CREATOR_PERCENT / 100) * 100) / 100;
  const myCurForLink = getMyCurrency(m.id);
  const cumulativeGoogleLink = (myCurForLink !== 'EUR' && totalNet > 0)
    ? `<a href="https://www.google.com/search?q=${totalNet}+EUR+to+${encodeURIComponent(myCurForLink)}" target="_blank" rel="noopener" class="price-google-link" style="margin:8px 0 0;">${ICON_EXTERNAL_LINK}<span>${t('paidSeeInGoogle')} (${escText(myCurForLink)})</span></a>`
    : '';

  zone.innerHTML = `
    <p class="mono" style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;">${t('paidThisMonthLabel')}</p>
    <div class="paid-summary" id="paid-summary-month">
      <div><span class="k">${t('paidCABrut')}</span><span class="v">…</span></div>
      <div><span class="k">${t('paidCANet')}</span><span class="v">…</span></div>
    </div>
    <p class="mono" style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin:16px 0 8px;">${t('paidAllTimeLabel')}</p>
    <div class="paid-summary">
      <div><span class="k">${t('paidCABrut')}</span><span class="v">${totalRevenue}€</span></div>
      <div><span class="k">${t('paidCANet')}</span><span class="v" style="color:#5fd67a;">${totalNet}€</span></div>
    </div>
    ${cumulativeGoogleLink}
    <div class="split-breakdown-box">
      <p class="mono" style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;">${t('paidSplitBreakdown')}</p>
      <div class="split-row"><span>${t('paidSplitCreator')}</span><span class="split-amount" style="color:#5fd67a;">${DEFAULT_SPLIT_CREATOR_PERCENT}%</span></div>
      <div class="split-row"><span>${t('paidSplitPlatform')}</span><span class="split-amount" style="color:var(--text-muted);">${100 - DEFAULT_SPLIT_CREATOR_PERCENT}%</span></div>
    </div>
    <div style="margin-top:30px;padding-top:20px;border-top:1px solid var(--border);">
      <h4 class="mono" style="font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px;">${t('paidOrdersTitle')}</h4>
      <div id="my-orders-zone"><span class="gallery-empty">${t('paidOrdersLoading')}</span></div>
    </div>
  `;

  loadMyOrders(m);
  loadMonthlyStats(m);
}

async function loadMonthlyStats(m){
  const holder = document.getElementById('paid-summary-month');
  if(!holder || !db) return;
  try{
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let monthGross = 0, monthSales = 0;
    for(const item of (m.paidContent || [])){
      const snap = await db.collection('profiles').doc(m.id).collection('paid_content').doc(item.docId)
        .collection('orders').get();
      snap.forEach(d => {
        const data = d.data();
        if(data.status !== 'paid' || !data.paidAt || !data.paidAt.toDate) return;
        if(data.paidAt.toDate() >= monthStart){
          monthSales += 1;
          monthGross += (data.creatorShare != null ? data.creatorShare + (data.platformShare || 0) : item.price) || 0;
        }
      });
    }
    const monthNet = Math.round(monthGross * (DEFAULT_SPLIT_CREATOR_PERCENT / 100) * 100) / 100;
    const myCur = getMyCurrency(m.id);
    holder.innerHTML = `
      <div><span class="k">${t('paidCABrut')}</span><span class="v">${monthGross}€</span></div>
      <div><span class="k">${t('paidCANet')}</span><span class="v" style="color:#5fd67a;">${monthNet}€</span></div>
    `;
    if(myCur !== 'EUR' && monthNet > 0){
      const url = `https://www.google.com/search?q=${monthNet}+EUR+to+${encodeURIComponent(myCur)}`;
      holder.insertAdjacentHTML('afterend', `<a href="${url}" target="_blank" rel="noopener" class="price-google-link" id="month-currency-link" style="margin:8px 0 0;">${ICON_EXTERNAL_LINK}<span>${t('paidSeeInGoogle')} (${escText(myCur)})</span></a>`);
    }
  }catch(e){
    console.error('monthly stats error', e);
    holder.innerHTML = `<div style="grid-column:1/-1;"><span class="gallery-empty">${(LANG==='fr'?'Erreur : ':'Error: ')}${escText(e.message||String(e))}</span></div>`;
  }
}

/* ================================================================
   OUTILS — espace productivité personnelle de la créatrice.
   Stocké en local sur son téléphone (localStorage), pas sur Firebase :
   plus simple, fonctionne même hors-ligne, et reste privé à cet appareil.
   ================================================================ */
function renderMyTools(m){
  const zone = document.getElementById('my-tools-zone');
  if(!zone) return;
  zone.innerHTML = `
    <div class="tabs-arrows-row-visible">
      <button type="button" class="level-arrow tabs-arrow-left" data-target="tools-tabs">‹</button>
      <button type="button" class="level-arrow tabs-arrow-right" data-target="tools-tabs">›</button>
    </div>
    <div class="room-tabs" id="tools-tabs">
      <button class="room-tab-btn active" data-tool="calendar">${ICON_CALENDAR}${t('toolCalendar')}</button>
      <button class="room-tab-btn" data-tool="notes">${ICON_NOTE}${t('toolNotes')}</button>
      <button class="room-tab-btn" data-tool="calc">${ICON_CALC}${t('toolCalc')}</button>
      <button class="room-tab-btn" data-tool="finance">${ICON_COIN}${t('toolFinance')}</button>
      <button class="room-tab-btn" data-tool="advice">${ICON_CHAT}${t('toolAdvice')}</button>
      <button class="room-tab-btn" data-tool="matchclients">${AICON.handshake}${t('toolMatchClients')}</button>
    </div>
    <div class="room-tab-panel active" id="tool-panel-calendar"></div>
    <div class="room-tab-panel" id="tool-panel-notes"></div>
    <div class="room-tab-panel" id="tool-panel-calc"></div>
    <div class="room-tab-panel" id="tool-panel-finance"></div>
    <div class="room-tab-panel" id="tool-panel-advice"></div>
    <div class="room-tab-panel" id="tool-panel-matchclients"></div>
  `;
  zone.querySelectorAll('#tools-tabs .room-tab-btn').forEach(btn => {
    btn.onclick = () => {
      zone.querySelectorAll('#tools-tabs .room-tab-btn').forEach(b => b.classList.remove('active'));
      zone.querySelectorAll('.room-tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tool-panel-' + btn.dataset.tool).classList.add('active');
    };
  });
  wireSlideArrows(zone);
  renderToolCalendar(m);
  renderToolNotes(m);
  renderToolCalc(m);
  renderToolFinance(m);
  renderToolAdvice(m);
  renderToolMatchClients(m);
}

/* ---------------- Calendrier ---------------- */
let calState = { y: null, mo: null };
function renderToolCalendar(m){
  const panel = document.getElementById('tool-panel-calendar');
  const key = 'hm_calendar_' + m.id;
  let data = {};
  try{ data = JSON.parse(localStorage.getItem(key) || '{}'); }catch(e){}
  const now = new Date();
  if(calState.y === null){ calState.y = now.getFullYear(); calState.mo = now.getMonth(); }
  const y = calState.y, mo = calState.mo;
  const first = new Date(y, mo, 1);
  const daysInMonth = new Date(y, mo + 1, 0).getDate();
  const startWeekday = first.getDay();
  const monthLabel = first.toLocaleDateString(LANG === 'fr' ? 'fr-FR' : LANG, { month: 'long' });

  let cells = '';
  for(let i = 0; i < startWeekday; i++) cells += `<div class="cal-cell empty"></div>`;
  for(let d = 1; d <= daysInMonth; d++){
    const dateStr = `${y}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const hasNote = !!data[dateStr];
    const isToday = (d === now.getDate() && mo === now.getMonth() && y === now.getFullYear());
    cells += `<button class="cal-cell ${isToday ? 'today' : ''} ${hasNote ? 'has-note' : ''}" data-date="${dateStr}">${d}</button>`;
  }

  const yearOptions = [];
  for(let yy = now.getFullYear() - 2; yy <= 2050; yy++) yearOptions.push(yy);

  panel.innerHTML = `
    <div class="cal-nav">
      <button class="cal-nav-btn" id="cal-prev">${ICON_CHEVRON_LEFT}</button>
      <span class="cal-nav-label" style="text-transform:capitalize;">${monthLabel}</span>
      <select id="cal-year-select" class="cal-year-select">
        ${yearOptions.map(yy => `<option value="${yy}" ${yy === y ? 'selected' : ''}>${yy}</option>`).join('')}
      </select>
      <button class="cal-nav-btn" id="cal-next">${ICON_CHEVRON_RIGHT}</button>
    </div>
    <div class="cal-grid">${cells}</div>
    <div id="cal-note-editor" style="margin-top:14px;display:none;">
      <label id="cal-note-date-label" style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:6px;"></label>
      <textarea id="cal-note-text" rows="2" placeholder="${t('toolCalendarPh')}"></textarea>
      <div style="display:flex;gap:8px;margin-top:8px;">
        <button class="btn btn-primary btn-sm" id="cal-note-save">${ICON_CHECK}${t('save')}</button>
        <button class="btn btn-ghost btn-sm" id="cal-note-delete">${ICON_TRASH}${t('cancel')}</button>
      </div>
    </div>
  `;

  document.getElementById('cal-prev').onclick = () => {
    calState.mo -= 1;
    if(calState.mo < 0){ calState.mo = 11; calState.y -= 1; }
    renderToolCalendar(m);
  };
  document.getElementById('cal-next').onclick = () => {
    calState.mo += 1;
    if(calState.mo > 11){ calState.mo = 0; calState.y += 1; }
    renderToolCalendar(m);
  };
  document.getElementById('cal-year-select').onchange = (e) => {
    calState.y = parseInt(e.target.value, 10);
    renderToolCalendar(m);
  };

  panel.querySelectorAll('.cal-cell[data-date]').forEach(btn => {
    btn.onclick = () => {
      const dateStr = btn.dataset.date;
      const editor = document.getElementById('cal-note-editor');
      editor.style.display = 'block';
      document.getElementById('cal-note-date-label').textContent = dateStr;
      document.getElementById('cal-note-text').value = data[dateStr] || '';
      document.getElementById('cal-note-save').onclick = () => {
        const val = document.getElementById('cal-note-text').value.trim();
        if(val) data[dateStr] = val; else delete data[dateStr];
        localStorage.setItem(key, JSON.stringify(data));
        renderToolCalendar(m);
        toast(t('savedToast'));
      };
      document.getElementById('cal-note-delete').onclick = () => {
        delete data[dateStr];
        localStorage.setItem(key, JSON.stringify(data));
        renderToolCalendar(m);
      };
    };
  });
}

/* ---------------- Bloc-notes ---------------- */
function renderToolNotes(m){
  const panel = document.getElementById('tool-panel-notes');
  const key = 'hm_notes_list_' + m.id;
  let notes = [];
  try{ notes = JSON.parse(localStorage.getItem(key) || '[]'); }catch(e){}

  const list = notes.slice().sort((a, b) => b.ts - a.ts).map(n => `
    <div class="note-card" data-id="${n.id}">
      <div class="note-card-head">
        <span class="note-card-date mono">${formatCommentDate(n.ts)}</span>
        <div class="note-card-actions">
          <button class="icon-btn note-edit" data-id="${n.id}">${ICON_EDIT}</button>
          <button class="icon-btn note-delete" data-id="${n.id}">${ICON_TRASH}</button>
        </div>
      </div>
      <p class="note-card-text">${escText(n.text)}</p>
    </div>`).join('');

  panel.innerHTML = `
    <div class="note-form">
      <textarea id="note-input" rows="3" placeholder="${t('toolNotesPh')}"></textarea>
      <button class="btn btn-primary btn-sm" id="note-add-btn">${ICON_PLUS}${t('toolAddEntry')}</button>
    </div>
    <div class="note-list">${list || `<span class="gallery-empty">${t('toolNoEntries')}</span>`}</div>
  `;

  let editingId = null;
  document.getElementById('note-add-btn').onclick = () => {
    const val = document.getElementById('note-input').value.trim();
    if(!val) return;
    if(editingId){
      const n = notes.find(x => x.id === editingId);
      if(n){ n.text = val; n.ts = Date.now(); }
      editingId = null;
    } else {
      notes.push({ id: 'n' + Date.now(), text: val, ts: Date.now() });
    }
    localStorage.setItem(key, JSON.stringify(notes));
    renderToolNotes(m);
  };

  panel.querySelectorAll('.note-edit').forEach(btn => {
    btn.onclick = () => {
      const n = notes.find(x => x.id === btn.dataset.id);
      if(!n) return;
      document.getElementById('note-input').value = n.text;
      document.getElementById('note-input').focus();
      editingId = n.id;
    };
  });
  panel.querySelectorAll('.note-delete').forEach(btn => {
    btn.onclick = () => {
      notes = notes.filter(x => x.id !== btn.dataset.id);
      localStorage.setItem(key, JSON.stringify(notes));
      renderToolNotes(m);
    };
  });
}

/* ---------------- Calculatrice ---------------- */
function renderToolCalc(m){
  const panel = document.getElementById('tool-panel-calc');
  const key = 'hm_calc_history_' + m.id;
  let history = [];
  try{ history = JSON.parse(localStorage.getItem(key) || '[]'); }catch(e){}
  history.forEach((h, i) => { if(!h.id) h.id = 'c' + i + '_' + h.ts; });

  const histList = history.slice().reverse().slice(0, 10).map(h => `
    <div class="calc-history-row">
      <div>
        <span class="calc-history-reason">${escText(h.reason) || t('toolCalcNoReason')}</span>
        <span class="calc-history-expr mono">${escText(h.expr)} = ${h.result}</span>
      </div>
      <span class="calc-history-date mono">${formatCommentDate(h.ts)}</span>
      <div class="finance-actions" style="position:static;transform:none;">
        <button class="icon-btn calc-hist-edit" data-id="${h.id}">${ICON_EDIT}</button>
        <button class="icon-btn calc-hist-delete" data-id="${h.id}">${ICON_TRASH}</button>
      </div>
    </div>`).join('');

  panel.innerHTML = `
    <div class="calc-display" id="calc-display">0</div>
    <div class="calc-grid">
      <button class="calc-btn calc-op" data-k="C">C</button>
      <button class="calc-btn calc-op" data-k="(">(</button>
      <button class="calc-btn calc-op" data-k=")">)</button>
      <button class="calc-btn calc-op" data-k="/">÷</button>
      <button class="calc-btn" data-k="7">7</button>
      <button class="calc-btn" data-k="8">8</button>
      <button class="calc-btn" data-k="9">9</button>
      <button class="calc-btn calc-op" data-k="*">×</button>
      <button class="calc-btn" data-k="4">4</button>
      <button class="calc-btn" data-k="5">5</button>
      <button class="calc-btn" data-k="6">6</button>
      <button class="calc-btn calc-op" data-k="-">−</button>
      <button class="calc-btn" data-k="1">1</button>
      <button class="calc-btn" data-k="2">2</button>
      <button class="calc-btn" data-k="3">3</button>
      <button class="calc-btn calc-op" data-k="+">+</button>
      <button class="calc-btn" data-k="0">0</button>
      <button class="calc-btn" data-k=".">,</button>
      <button class="calc-btn calc-eq" data-k="=" style="grid-column:span 2;">=</button>
    </div>
    <div class="calc-save-row">
      <input id="calc-reason" placeholder="${t('toolCalcReasonPh')}">
      <button class="icon-btn-labeled" id="calc-save-btn">${ICON_SAVE}${t('save')}</button>
    </div>
    <div class="calc-history">
      <p class="mono" style="font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin:14px 0 8px;">${t('toolCalcHistory')}</p>
      ${histList || `<span class="gallery-empty">${t('toolNoEntries')}</span>`}
    </div>
  `;
  let expr = '';
  let lastResult = null;
  let editingHistId = null;
  const display = document.getElementById('calc-display');
  panel.querySelectorAll('.calc-btn').forEach(btn => {
    btn.onclick = () => {
      const k = btn.dataset.k;
      if(k === 'C'){ expr = ''; lastResult = null; display.textContent = '0'; return; }
      if(k === '='){
        try{
          const safe = expr.replace(/,/g, '.');
          if(!/^[0-9+\-*/().\s]+$/.test(safe)) throw new Error('invalid');
          const result = Function('"use strict"; return (' + safe + ')')();
          lastResult = { expr, result: Math.round(result * 100) / 100 };
          display.textContent = String(lastResult.result).replace('.', ',');
          expr = String(result);
        }catch(e){ display.textContent = t('toolCalcError'); expr = ''; lastResult = null; }
        return;
      }
      expr += k;
      display.textContent = expr.replace(/\./g, ',');
    };
  });
  document.getElementById('calc-save-btn').onclick = () => {
    if(!lastResult){ toast(t('toolCalcNoResult')); return; }
    const reason = document.getElementById('calc-reason').value.trim();
    if(editingHistId){
      const h = history.find(x => x.id === editingHistId);
      if(h){ h.expr = lastResult.expr; h.result = lastResult.result; h.reason = reason; h.ts = Date.now(); }
      editingHistId = null;
    } else {
      history.push({ id: 'c' + Date.now(), expr: lastResult.expr, result: lastResult.result, reason, ts: Date.now() });
    }
    localStorage.setItem(key, JSON.stringify(history));
    renderToolCalc(m);
    toast(t('savedToast'));
  };
  panel.querySelectorAll('.calc-hist-edit').forEach(btn => {
    btn.onclick = () => {
      const h = history.find(x => x.id === btn.dataset.id);
      if(!h) return;
      display.textContent = String(h.result).replace('.', ',');
      expr = String(h.result);
      lastResult = { expr: h.expr, result: h.result };
      document.getElementById('calc-reason').value = h.reason || '';
      editingHistId = h.id;
    };
  });
  panel.querySelectorAll('.calc-hist-delete').forEach(btn => {
    btn.onclick = () => {
      history = history.filter(x => x.id !== btn.dataset.id);
      localStorage.setItem(key, JSON.stringify(history));
      renderToolCalc(m);
    };
  });
}

/* ---------------- Recettes & dépenses ---------------- */
function renderToolFinance(m){
  const panel = document.getElementById('tool-panel-finance');
  const key = 'hm_finance_' + m.id;
  let entries = [];
  try{ entries = JSON.parse(localStorage.getItem(key) || '[]'); }catch(e){}
  entries.forEach((e, i) => { if(!e.id) e.id = 'f' + i + '_' + Date.now(); });
  const income = entries.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
  const expense = entries.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
  const balance = income - expense;
  const curCode = getMyCurrency(m.id);
  const cur = currencySymbol(curCode);

  const rows = entries.slice().reverse().map(e => `
    <div class="finance-row">
      <div>
        <span class="finance-label">${escText(e.label)}</span>
        <span class="finance-date mono">${e.date}</span>
      </div>
      <span class="finance-amount ${e.type}">${e.type === 'income' ? '+' : '−'}${e.amount}${cur}</span>
      <div class="finance-actions">
        <button class="icon-btn fin-edit" data-id="${e.id}">${ICON_EDIT}</button>
        <button class="icon-btn fin-delete" data-id="${e.id}">${ICON_TRASH}</button>
      </div>
    </div>`).join('');

  panel.innerHTML = `
    <div class="currency-select-row">
      <span class="mono" style="font-size:10px;color:var(--text-muted);text-transform:uppercase;">${t('toolCurrency')}</span>
      <select id="fin-currency-select">
        ${CURRENCIES.map(c => `<option value="${c.code}" ${c.code===curCode?'selected':''}>${c.code} — ${c.name} (${c.symbol})</option>`).join('')}
        <option value="__custom__" ${!CURRENCIES.find(c=>c.code===curCode) ? 'selected' : ''}>✏️ ${t('toolCurrencyOther')}</option>
      </select>
      <button class="icon-btn-labeled" id="fin-currency-compare-btn">${AICON.chart}${t('toolCompareCurrencies')}</button>
    </div>
    <input id="fin-currency-custom" type="text" maxlength="8" placeholder="${t('toolCurrencyCustomPh')}"
      style="display:${!CURRENCIES.find(c=>c.code===curCode) ? 'block' : 'none'};margin-top:8px;width:140px;background:var(--bg-elev);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:7px 9px;"
      value="${!CURRENCIES.find(c=>c.code===curCode) ? escText(curCode) : ''}">
    <div id="currency-compare-box" class="currency-compare-box" style="display:none;"></div>
    <div class="paid-summary" style="margin:14px 0;">
      <div><span class="k">${t('toolIncome')}</span><span class="v" style="color:#5fd67a;">+${income}${cur}</span></div>
      <div><span class="k">${t('toolExpense')}</span><span class="v" style="color:#e06a6a;">−${expense}${cur}</span></div>
    </div>
    <div class="paid-summary" style="margin-bottom:18px;">
      <div style="grid-column:1/-1;"><span class="k">${t('toolBalance')}</span><span class="v">${balance}${cur}</span></div>
    </div>
    <div class="daily-budget-box">
      <p class="mono" style="font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;">${t('toolDailyBudgetTitle')}</p>
      <p style="color:var(--text-muted);font-size:11px;line-height:1.5;margin-bottom:10px;">${t('toolDailyBudgetNote')}</p>
      <div style="display:flex;gap:8px;align-items:flex-end;">
        <div style="flex:1;">
          <label style="font-size:10px;text-transform:uppercase;color:var(--text-muted);display:block;margin-bottom:4px;">${t('toolDailyBudgetDays')}</label>
          <input id="daily-budget-days" type="number" min="1" value="30" style="width:100%;background:var(--bg-elev);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:7px 9px;">
        </div>
        <button class="btn btn-primary btn-sm" id="daily-budget-calc">${t('toolDailyBudgetCalc')}</button>
      </div>
      <p id="daily-budget-result" class="daily-budget-result"></p>
    </div>
    <div class="finance-form">
      <select id="fin-type">
        <option value="income">${t('toolIncome')}</option>
        <option value="expense">${t('toolExpense')}</option>
      </select>
      <input id="fin-label" placeholder="${t('toolFinLabelPh')}">
      <input id="fin-amount" type="number" min="0" step="0.01" placeholder="${cur}">
      <button class="btn btn-primary btn-sm" id="fin-add">${ICON_PLUS}${t('toolAddEntry')}</button>
    </div>
    <div class="finance-list">${rows || `<span class="gallery-empty">${t('toolNoEntries')}</span>`}</div>
    <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border);">
      <p style="color:var(--text-muted);font-size:11px;line-height:1.6;margin-bottom:10px;">${t('toolPaymentAccessNote')}</p>
      <div style="display:flex;gap:8px;">
        <a class="pill-link" href="https://www.paypal.com" target="_blank" rel="noopener" style="flex:1;justify-content:center;">PayPal</a>
        <a class="pill-link" href="https://www.safaricom.co.ke/personal/m-pesa" target="_blank" rel="noopener" style="flex:1;justify-content:center;">M-Pesa</a>
      </div>
    </div>
    <div class="tax-notice-box">
      <p style="color:var(--honey);font-size:11.5px;line-height:1.65;">${t('toolTaxNotice')}</p>
    </div>
  `;
  document.getElementById('fin-currency-select').onchange = (e) => {
    const customInput = document.getElementById('fin-currency-custom');
    if(e.target.value === '__custom__'){
      customInput.style.display = 'block';
      customInput.focus();
      return;
    }
    localStorage.setItem('hm_currency_' + m.id, e.target.value);
    renderToolFinance(m);
  };
  document.getElementById('fin-currency-custom').addEventListener('keydown', (e) => {
    if(e.key === 'Enter') e.target.blur();
  });
  document.getElementById('fin-currency-custom').addEventListener('blur', (e) => {
    const val = e.target.value.trim().toUpperCase().slice(0, 8);
    if(val){
      localStorage.setItem('hm_currency_' + m.id, val);
      renderToolFinance(m);
    }
  });
  document.getElementById('fin-currency-compare-btn').onclick = () => showCurrencyComparison(curCode);
  document.getElementById('daily-budget-calc').onclick = () => {
    const days = Math.max(1, parseInt(document.getElementById('daily-budget-days').value, 10) || 30);
    const perDay = Math.floor((balance / days) * 100) / 100;
    const resultEl = document.getElementById('daily-budget-result');
    if(balance <= 0){
      resultEl.textContent = t('toolDailyBudgetNegative');
      resultEl.style.color = '#e06a6a';
    } else {
      resultEl.textContent = t('toolDailyBudgetResult').replace('{amount}', perDay).replace('{days}', days).replace(/€/, cur);
      resultEl.style.color = 'var(--honey)';
    }
  };
  let editingId = null;
  document.getElementById('fin-add').onclick = () => {
    const type = document.getElementById('fin-type').value;
    const label = document.getElementById('fin-label').value.trim();
    const amount = parseFloat(document.getElementById('fin-amount').value);
    if(!label || !amount || amount <= 0){ toast(t('toolFinMissing')); return; }
    if(editingId){
      const e = entries.find(x => x.id === editingId);
      if(e){ e.type = type; e.label = label.slice(0, 60); e.amount = Math.round(amount * 100) / 100; }
      editingId = null;
    } else {
      entries.push({ id: 'f' + Date.now(), type, label: label.slice(0, 60), amount: Math.round(amount * 100) / 100, date: new Date().toLocaleDateString(LANG) });
    }
    localStorage.setItem(key, JSON.stringify(entries));
    renderToolFinance(m);
  };
  panel.querySelectorAll('.fin-edit').forEach(btn => {
    btn.onclick = () => {
      const e = entries.find(x => x.id === btn.dataset.id);
      if(!e) return;
      document.getElementById('fin-type').value = e.type;
      document.getElementById('fin-label').value = e.label;
      document.getElementById('fin-amount').value = e.amount;
      editingId = e.id;
    };
  });
  panel.querySelectorAll('.fin-delete').forEach(btn => {
    btn.onclick = () => {
      entries = entries.filter(x => x.id !== btn.dataset.id);
      localStorage.setItem(key, JSON.stringify(entries));
      renderToolFinance(m);
    };
  });
}

/* Comparatif de devises en direct — utilise une API gratuite de taux de
   change (frankfurter.app, données de la Banque centrale européenne,
   aucune clé requise). Nécessite une connexion internet réelle : ne
   fonctionnera pas dans un aperçu hors-ligne, mais fonctionne normalement
   une fois le site en ligne sur Vercel. */
async function showCurrencyComparison(baseCode){
  const box = document.getElementById('currency-compare-box');
  box.style.display = 'block';
  box.innerHTML = `<span class="gallery-empty">${t('toolCurrencyLoading')}</span>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  try{
    const targets = CURRENCIES.map(c => c.code).filter(c => c !== baseCode).join(',');
    const res = await fetch(`https://api.frankfurter.app/latest?from=${baseCode}&to=${targets}`);
    if(!res.ok) throw new Error('API error');
    const data = await res.json();
    const rows = Object.entries(data.rates || {})
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([code, rate]) => `
        <div class="currency-compare-row">
          <span class="mono">1 ${baseCode} = </span>
          <span class="currency-compare-value">${rate.toFixed(4)} ${code}</span>
        </div>`).join('');
    box.innerHTML = `
      <div class="currency-compare-head">
        <span>${t('toolCurrencyComparedTo')} ${baseCode}</span>
        <button class="icon-btn" id="currency-compare-close">✕</button>
      </div>
      <div class="currency-compare-list">${rows}</div>
      <p class="mono" style="font-size:9.5px;color:var(--text-muted);margin-top:8px;">${t('toolCurrencyDate')} ${data.date}</p>
    `;
    document.getElementById('currency-compare-close').onclick = () => { box.style.display = 'none'; };
  }catch(e){
    console.error('currency comparison error', e);
    box.innerHTML = `<span class="gallery-empty">${t('toolCurrencyError')}</span>`;
  }
}

/* ---------------- Widget générique d'import/enregistrement audio, réutilisé pour le message de
   bienvenue et les bannières événementielles (chaque widget a son propre préfixe d'id). ---------------- */
function audioRecorderWidgetHtml(prefix, existingUrl){
  return `
    <div class="audio-mode-tabs">
      <button type="button" class="audio-mode-btn active" id="${prefix}-mode-upload">${t('paidAudioImport')}</button>
      <button type="button" class="audio-mode-btn" id="${prefix}-mode-record">${t('paidAudioRecordNow')}</button>
    </div>
    <div id="${prefix}-upload-zone">
      <div class="upload-drop" id="${prefix}-file-drop">
        <span id="${prefix}-file-label">${t('paidAudioPrompt')}</span>
        <input type="file" id="${prefix}-file-input" accept="audio/*">
      </div>
    </div>
    <div id="${prefix}-record-zone" style="display:none;">
      <div class="audio-record-box">
        <button type="button" class="audio-record-btn" id="${prefix}-record-btn">${AICON.music}</button>
        <p id="${prefix}-record-status" class="mono" style="font-size:11px;color:var(--text-muted);margin-top:8px;">${t('paidAudioRecordPrompt')}</p>
        <audio id="${prefix}-record-preview" controls style="width:100%;margin-top:10px;display:${existingUrl ? 'block' : 'none'};height:32px;" ${existingUrl ? `src="${escAttr(existingUrl)}"` : ''}></audio>
      </div>
    </div>
    ${existingUrl ? `<button type="button" class="btn btn-ghost btn-sm" id="${prefix}-clear-btn" style="margin-top:8px;">${t('audioClearBtn')}</button>` : ''}
  `;
}
// onFileReady(file) est appelé avec le File choisi (import) ou enregistré (micro) ; le parent
// s'occupe de l'upload vers Firebase Storage. onClear() est appelé si elle retire l'audio existant.
function wireAudioRecorderWidget(prefix, onFileReady, onClear){
  const uploadBtn = document.getElementById(prefix + '-mode-upload');
  const recordBtn = document.getElementById(prefix + '-mode-record');
  const uploadZone = document.getElementById(prefix + '-upload-zone');
  const recordZone = document.getElementById(prefix + '-record-zone');
  uploadBtn.onclick = () => {
    uploadBtn.classList.add('active'); recordBtn.classList.remove('active');
    uploadZone.style.display = 'block'; recordZone.style.display = 'none';
  };
  recordBtn.onclick = () => {
    recordBtn.classList.add('active'); uploadBtn.classList.remove('active');
    recordZone.style.display = 'block'; uploadZone.style.display = 'none';
  };
  document.getElementById(prefix + '-file-drop').onclick = () => document.getElementById(prefix + '-file-input').click();
  document.getElementById(prefix + '-file-input').onchange = (e) => {
    const f = e.target.files[0];
    if(f){ document.getElementById(prefix + '-file-label').textContent = f.name; onFileReady(f); }
  };
  let mediaRecorder = null, chunks = [], recording = false, stream = null;
  document.getElementById(prefix + '-record-btn').onclick = async () => {
    const statusEl = document.getElementById(prefix + '-record-status');
    const recBtn = document.getElementById(prefix + '-record-btn');
    if(!recording){
      try{
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        chunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (e) => { if(e.data.size > 0) chunks.push(e.data); };
        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'audio/webm' });
          const file = new File([blob], `enregistrement_${Date.now()}.webm`, { type: 'audio/webm' });
          const preview = document.getElementById(prefix + '-record-preview');
          preview.src = URL.createObjectURL(blob);
          preview.style.display = 'block';
          statusEl.textContent = t('paidAudioRecordDone');
          stream.getTracks().forEach(tr => tr.stop());
          onFileReady(file);
        };
        mediaRecorder.start();
        recording = true;
        recBtn.classList.add('recording');
        statusEl.textContent = t('paidAudioRecording');
      }catch(err){
        console.error('mic access error', err);
        toast(t('paidAudioMicError'));
      }
    } else {
      mediaRecorder.stop();
      recording = false;
      recBtn.classList.remove('recording');
    }
  };
  const clearBtn = document.getElementById(prefix + '-clear-btn');
  if(clearBtn && onClear) clearBtn.onclick = onClear;
}

/* ---------------- Idées Honeymoon (professionnalisme, message de bienvenue, paliers, conseils) ----------------
   Le message de bienvenue est stocké sur son propre document profil (champ welcomeMessage) et
   déclenché automatiquement par wireRoomFollowButton quand un membre commence à la suivre —
   aucune règle Firestore supplémentaire nécessaire. ---------------- */
function renderToolIdeas(m){
  const panel = document.getElementById('tool-panel-ideas');
  if(!panel) return;
  let pendingWelcomeAudioFile = null;
  let welcomeAudioCleared = false;
  panel.innerHTML = `
    <div class="banner-active-card" style="border-color:var(--honey);">
      <div class="banner-active-head">${t('ideasIntroTitle')}</div>
      <p class="banner-active-text">${escText(t('ideasIntroBody'))}</p>
    </div>

    <div class="member-section-title" style="margin-top:20px;">${t('ideasWelcomeTitle')}</div>
    <p style="color:var(--text-muted);font-size:11.5px;margin:6px 0 10px;line-height:1.6;">${t('ideasWelcomeNote')}</p>
    <textarea id="ideas-welcome-message" maxlength="500" placeholder="${escAttr(t('ideasWelcomePh'))}">${escText(m.welcomeMessage || '')}</textarea>
    <label style="margin-top:10px;">${t('ideasWelcomeAudioLabel')}</label>
    ${audioRecorderWidgetHtml('ideas-welcome-audio', m.welcomeAudioUrl || '')}
    <button type="button" class="btn btn-primary btn-sm" id="ideas-welcome-save-btn" style="margin-top:8px;">${t('ideasWelcomeSaveBtn')}</button>

    <div class="member-section-title" style="margin-top:24px;">${t('ideasTierTitle')}</div>
    <p style="color:var(--text-muted);font-size:11.5px;margin:6px 0 0;line-height:1.6;">${t('ideasTierBody')}</p>

    <div class="member-section-title" style="margin-top:24px;">${t('ideasTipsTitle')}</div>
    <p style="color:var(--text-muted);font-size:11px;margin:4px 0 10px;font-style:italic;">${t('ideasTipsNote')}</p>
    <ul style="margin:0;padding-left:18px;color:var(--text);font-size:12.5px;line-height:1.9;">
      <li>${escText(t('ideasTip1'))}</li>
      <li>${escText(t('ideasTip2'))}</li>
      <li>${escText(t('ideasTip3'))}</li>
      <li>${escText(t('ideasTip4'))}</li>
      <li>${escText(t('ideasTip5'))}</li>
    </ul>

    <p style="color:var(--rose);font-weight:700;font-size:12px;line-height:1.7;margin:20px 0 0;padding:12px 14px;background:rgba(226,99,124,0.08);border-radius:10px;">
      ${escText(MASK_ADVICE_TEXT[LANG] || MASK_ADVICE_TEXT.en)}
    </p>
    <p style="color:var(--rose);font-weight:700;font-size:12px;line-height:1.7;margin:10px 0 0;padding:12px 14px;background:rgba(226,99,124,0.08);border-radius:10px;">
      ${escText(WARDROBE_ADVICE_TEXT[LANG] || WARDROBE_ADVICE_TEXT.en)}
    </p>
  `;
  wireAudioRecorderWidget('ideas-welcome-audio',
    (file) => { pendingWelcomeAudioFile = file; welcomeAudioCleared = false; },
    m.welcomeAudioUrl ? () => {
      pendingWelcomeAudioFile = null; welcomeAudioCleared = true;
      const preview = document.getElementById('ideas-welcome-audio-record-preview');
      if(preview){ preview.style.display = 'none'; preview.removeAttribute('src'); }
      toast(t('savedToast'));
    } : null
  );
  const saveBtn = document.getElementById('ideas-welcome-save-btn');
  saveBtn.onclick = async () => {
    const text = document.getElementById('ideas-welcome-message').value.trim();
    saveBtn.disabled = true;
    try{
      const update = { welcomeMessage: text.slice(0, 500) };
      if(pendingWelcomeAudioFile){
        update.welcomeAudioUrl = await uploadToR2(auth, pendingWelcomeAudioFile, 'welcome_audio/' + m.id);
      } else if(welcomeAudioCleared){
        update.welcomeAudioUrl = firebase.firestore.FieldValue.delete();
      }
      await db.collection('profiles').doc(m.id).set(update, { merge: true });
      m.welcomeMessage = update.welcomeMessage;
      if(pendingWelcomeAudioFile) m.welcomeAudioUrl = update.welcomeAudioUrl;
      if(welcomeAudioCleared) m.welcomeAudioUrl = '';
      toast(t('ideasWelcomeSavedToast'));
      renderToolIdeas(m);
    }catch(e){ console.error('save welcome message error', e); toast(t('memberErrUnknown')); }
    saveBtn.disabled = false;
  };
}

/* ---------------- Bannière événement (anniversaire, Saint-Valentin, Noël, Nouvel An…) ----------------
   Elle programme un message avec date + heure + durée d'affichage ; il apparaît alors en haut de
   sa fiche publique pour inviter ses abonné(e)s à lui envoyer un cadeau. Stocké directement sur son
   document profil (champ eventBanner) — elle a déjà le droit d'écrire sur son propre profil, donc
   aucune règle Firestore supplémentaire n'est nécessaire. ---------------- */
const BANNER_TEMPLATE_KEYS = ['birthday', 'valentine', 'christmas', 'newyear', 'custom'];
const BANNER_TEMPLATE_EMOJI = { birthday: '🎂', valentine: '💘', christmas: '🎄', newyear: '🎆', custom: '✏️' };
function formatBannerDate(ts){
  if(!ts) return '';
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function renderToolBanner(m){
  const panel = document.getElementById('tool-panel-banner');
  if(!panel) return;
  const banner = m.eventBanner || null;
  const now = Date.now();
  const isActive = !!(banner && banner.endAt && now < banner.endAt);
  const isScheduled = !!(banner && banner.startAt && now < banner.startAt);
  const now_d = new Date();
  const todayStr = `${now_d.getFullYear()}-${String(now_d.getMonth() + 1).padStart(2, '0')}-${String(now_d.getDate()).padStart(2, '0')}`;
  const nowTimeStr = `${String(now_d.getHours()).padStart(2, '0')}:${String(now_d.getMinutes()).padStart(2, '0')}`;
  panel.innerHTML = `
    <p style="color:var(--text-muted);font-size:11.5px;margin:0 0 12px;line-height:1.6;">${t('toolBannerNote')}</p>
    ${banner && (isActive || isScheduled) ? `
      <div class="banner-active-card">
        <div class="banner-active-head">${isScheduled ? t('bannerActiveLabel') + ' — ' + formatBannerDate(banner.startAt) : t('bannerActiveLabel')}</div>
        <p class="banner-active-text">${escText(banner.message || '')}</p>
        <div class="banner-active-meta">${t('bannerActiveUntil')} ${formatBannerDate(banner.endAt)}</div>
        <button type="button" class="btn btn-ghost btn-sm" id="banner-remove-btn">${t('bannerRemoveBtn')}</button>
      </div>
    ` : ''}
    <div class="banner-template-row">
      ${BANNER_TEMPLATE_KEYS.map(key => `<button type="button" class="banner-template-btn" data-key="${key}">${BANNER_TEMPLATE_EMOJI[key]} ${t('bannerTemplateLabel_' + key)}</button>`).join('')}
    </div>
    <label>${t('bannerMessageLabel')}</label>
    <textarea id="banner-message" maxlength="280" placeholder="${escAttr(t('bannerMessagePh'))}"></textarea>
    <div class="apply-toggle-row" style="gap:10px;margin-top:10px;">
      <div style="flex:1;">
        <label>${t('bannerDateLabel')}</label>
        <input type="date" id="banner-date" class="comment-name-input" style="width:100%;" value="${todayStr}">
      </div>
      <div style="flex:1;">
        <label>${t('bannerTimeLabel')}</label>
        <input type="time" id="banner-time" class="comment-name-input" style="width:100%;" value="${nowTimeStr}">
      </div>
    </div>
    <label>${t('bannerDurationLabel')}</label>
    <select id="banner-duration" class="comment-name-input" style="width:100%;">
      <option value="1">${t('bannerDuration1Day')}</option>
      <option value="3" selected>${t('bannerDuration3Days')}</option>
      <option value="7">${t('bannerDuration7Days')}</option>
      <option value="14">${t('bannerDuration14Days')}</option>
    </select>
    <label style="margin-top:10px;">${t('bannerAudioLabel')}</label>
    ${audioRecorderWidgetHtml('banner-audio', '')}
    <button type="button" class="btn btn-primary btn-sm" id="banner-publish-btn" style="margin-top:12px;">${ICON_GIFT} ${t('bannerPublishBtn')}</button>
  `;
  let pendingBannerAudioFile = null;
  wireAudioRecorderWidget('banner-audio', (file) => { pendingBannerAudioFile = file; }, null);
  panel.querySelectorAll('.banner-template-btn').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.key;
      const ta = document.getElementById('banner-message');
      if(key !== 'custom'){ ta.value = t('bannerTemplate_' + key); }
      else { ta.value = ''; ta.focus(); }
    };
  });
  const removeBtn = document.getElementById('banner-remove-btn');
  if(removeBtn){
    removeBtn.onclick = async () => {
      if(!confirm(t('bannerRemoveConfirm'))) return;
      removeBtn.disabled = true;
      try{
        await db.collection('profiles').doc(m.id).set({ eventBanner: firebase.firestore.FieldValue.delete() }, { merge: true });
        m.eventBanner = null;
        toast(t('savedToast'));
        renderToolBanner(m);
      }catch(e){ console.error('remove banner error', e); toast(t('memberErrUnknown')); }
      removeBtn.disabled = false;
    };
  }
  const publishBtn = document.getElementById('banner-publish-btn');
  publishBtn.onclick = async () => {
    const message = document.getElementById('banner-message').value.trim();
    const dateVal = document.getElementById('banner-date').value;
    const timeVal = document.getElementById('banner-time').value;
    const days = parseInt(document.getElementById('banner-duration').value, 10) || 3;
    if(!message){ toast(t('bannerMessageRequired')); return; }
    if(!dateVal || !timeVal){ toast(t('bannerDateRequired')); return; }
    const startAt = new Date(`${dateVal}T${timeVal}`).getTime();
    if(isNaN(startAt)){ toast(t('bannerDateRequired')); return; }
    const endAt = startAt + days * 24 * 60 * 60 * 1000;
    publishBtn.disabled = true;
    try{
      const eventBanner = { message: message.slice(0, 280), startAt, endAt };
      if(pendingBannerAudioFile){
        eventBanner.audioUrl = await uploadToR2(auth, pendingBannerAudioFile, 'banner_audio/' + m.id);
      }
      await db.collection('profiles').doc(m.id).set({ eventBanner }, { merge: true });
      m.eventBanner = eventBanner;
      toast(t('bannerPublishedToast'));
      renderToolBanner(m);
    }catch(e){ console.error('publish banner error', e); toast(t('memberErrUnknown')); }
    publishBtn.disabled = false;
  };
}

/* ---------------- Conseils (chatbot à sujets, style WhatsApp) ----------------
   La langue du chat suit désormais la langue du site (sélecteur en haut de
   page) — plus de sélecteur séparé ici. ---------------- */

function renderToolAdvice(m){
  const panel = document.getElementById('tool-panel-advice');
  panel.innerHTML = `
    <p style="color:var(--text-muted);font-size:11.5px;margin:0 0 12px;line-height:1.6;">${t('toolAdviceNote')}</p>
    <div class="advice-topics" id="advice-topics">
      <button class="advice-topic-btn advice-estimator-btn" id="advice-estimator-btn">${AICON.price}${t('toolEstimateEarnings')}</button>
    </div>
    <div class="advice-chat" id="advice-chat"></div>
  `;
  const topicsEl = document.getElementById('advice-topics');
  topicsEl.insertAdjacentHTML('beforeend', ADVICE_TOPICS.map((topic, idx) => `
    <button class="advice-topic-btn" data-idx="${idx}">${premiumTagIcon(topic.icon)} ${topic.title[LANG] || topic.title.en}</button>
  `).join(''));
  topicsEl.querySelectorAll('.advice-topic-btn[data-idx]').forEach(btn => {
    btn.onclick = () => showAdviceAnswer(ADVICE_TOPICS[parseInt(btn.dataset.idx, 10)]);
  });
  document.getElementById('advice-estimator-btn').onclick = () => showEarningsEstimator(m);
}

/* Couleur de bulle selon la catégorie du sujet (déduite de son émoji) */
const BUBBLE_COLOR_MAP = {
  '💡':'#5b9dd6','📐':'#5b9dd6','🖼️':'#5b9dd6','🎨':'#5b9dd6','📱':'#5b9dd6','📸':'#5b9dd6','🌇':'#5b9dd6',
  '🎬':'#a76bd6','✂️':'#a76bd6','🎵':'#a76bd6','🕺':'#a76bd6','🪞':'#a76bd6',
  '📅':'#4fc3a1','🏷️':'#4fc3a1','💬':'#4fc3a1','🔁':'#4fc3a1','🧲':'#4fc3a1','📊':'#4fc3a1','🌟':'#4fc3a1','📝':'#4fc3a1',
  '💰':'#5fd67a','🎁':'#5fd67a','⏰':'#5fd67a','🤝':'#5fd67a',
  '🔒':'#e06a6a','🕵️':'#e06a6a',
  '🧘':'#d68bc9','🗂️':'#c9a15a'
};
function bubbleColorFor(icon){ return BUBBLE_COLOR_MAP[icon] || 'var(--honey)'; }

let lastChatActionAt = 0; // sert à accélérer le rythme si les clics s'enchaînent vite, comme dans une vraie conversation
function showAdviceAnswer(topic, userText){
  const chat = document.getElementById('advice-chat');
  const title = userText || topic.title[LANG] || topic.title.en;
  const answer = topic.answer[LANG] || topic.answer.en;
  const now = new Date();
  const color = bubbleColorFor(topic.icon);
  chat.innerHTML = `
    <div class="chat-bubble chat-user">${escText(title)}<span class="chat-time">${formatChatTime(now)}</span></div>
    <div class="chat-bubble chat-bot show" id="chat-bot-bubble" style="border-color:${color};"><span class="chat-typing-dots"><span></span><span></span><span></span></span></div>
  `;
  chat.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  const bubble = document.getElementById('chat-bot-bubble');
  const nowMs = Date.now();
  const sinceLast = lastChatActionAt ? nowMs - lastChatActionAt : 99999;
  lastChatActionAt = nowMs;
  const lineCount = Math.ceil(answer.length / 55);
  let delay = lineCount > 15 ? 2200 : 500 + Math.min(1800, answer.length * 7);
  if(sinceLast < 4000) delay = Math.round(delay * 0.45); // questions enchaînées rapidement → le bot "suit le rythme"
  setTimeout(() => typeWriterText(bubble, answer, now), delay);
}
function typeWriterText(el, text, timeDate){
  const words = text.split(' ');
  el.innerHTML = '';
  let i = 0;
  const tick = () => {
    el.innerHTML += (i > 0 ? ' ' : '') + escText(words[i]).replace(/\n/g, '<br>');
    i++;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if(i >= words.length){
      el.insertAdjacentHTML('beforeend', `<span class="chat-time">${formatChatTime(timeDate || new Date())}</span>`);
      return;
    }
    const jitter = 26 + Math.random() * 30; // vitesse de frappe légèrement irrégulière, comme un humain
    setTimeout(tick, jitter);
  };
  tick();
}

/* ---------------- "Match with Clients" — chatbot business (persona "Aria") ----------------
   Même mécanique que le Tips (recherche + sujets tapables + bulles de chat avec effet
   de frappe), mais dédiée à comment aborder les centres d'intérêt d'un membre pour
   engager la conversation, teaser, et convertir en abonnement/vente. */
function renderToolMatchClients(m){
  const panel = document.getElementById('tool-panel-matchclients');
  if(!panel) return;
  panel.innerHTML = `
    <p style="color:var(--text-muted);font-size:11.5px;margin:0 0 12px;line-height:1.6;">${t('toolMatchClientsNote')}</p>
    <div class="advice-topics" id="matchclients-topics"></div>
    <div class="advice-chat" id="matchclients-chat"></div>
  `;
  const topicsEl = document.getElementById('matchclients-topics');
  topicsEl.innerHTML = CLIENT_MATCH_TOPICS.map((topic, idx) => `
    <button class="advice-topic-btn" data-idx="${idx}">${premiumTagIcon(topic.icon)} ${topic.title[LANG] || topic.title.en}</button>
  `).join('');
  topicsEl.querySelectorAll('.advice-topic-btn[data-idx]').forEach(btn => {
    btn.onclick = () => showTopicChatAnswer('matchclients-chat', CLIENT_MATCH_TOPICS[parseInt(btn.dataset.idx, 10)]);
  });

  // Message d'accueil de la persona "Aria", affiché tout de suite à l'ouverture
  // de l'onglet — donne l'impression d'un vrai assistant déjà en session.
  const chat = document.getElementById('matchclients-chat');
  chat.innerHTML = `<div class="chat-bubble chat-bot show" id="matchclients-welcome-bubble"></div>`;
  setTimeout(() => typeWriterText(document.getElementById('matchclients-welcome-bubble'), t('toolMatchClientsWelcome')), 400);
}

/* ---------------- "Match Your Words" — chatbot membre (persona "Nova") ----------------
   Même mécanique, côté membre : comment lire les centres d'intérêt d'une créatrice
   et engager une conversation agréable et respectueuse avec elle. */
function renderMemberToolMatchWords(container){
  if(!container) return;
  container.innerHTML = `
    <p style="color:var(--text-muted);font-size:11.5px;margin:0 0 12px;line-height:1.6;">${t('toolMatchWordsNote')}</p>
    <div class="advice-topics" id="matchwords-topics"></div>
    <div class="advice-chat" id="matchwords-chat"></div>
  `;
  const topicsEl = document.getElementById('matchwords-topics');
  topicsEl.innerHTML = WORDS_MATCH_TOPICS.map((topic, idx) => `
    <button class="advice-topic-btn" data-idx="${idx}">${premiumTagIcon(topic.icon)} ${topic.title[LANG] || topic.title.en}</button>
  `).join('');
  topicsEl.querySelectorAll('.advice-topic-btn[data-idx]').forEach(btn => {
    btn.onclick = () => showTopicChatAnswer('matchwords-chat', WORDS_MATCH_TOPICS[parseInt(btn.dataset.idx, 10)]);
  });

  // Message d'accueil de la persona "Nova", affiché tout de suite à l'ouverture.
  const chat = document.getElementById('matchwords-chat');
  chat.innerHTML = `<div class="chat-bubble chat-bot show" id="matchwords-welcome-bubble"></div>`;
  setTimeout(() => typeWriterText(document.getElementById('matchwords-welcome-bubble'), t('toolMatchWordsWelcome')), 400);
}

/* Affiche une réponse de sujet façon conversation, dans n'importe quel chat cible
   (identifié par son id de container) — factorisation de showAdviceAnswer pour les
   nouveaux chatbots "Match with Clients" / "Match Your Words". */
function showTopicChatAnswer(chatId, topic, userText){
  const chat = document.getElementById(chatId);
  const title = userText || topic.title[LANG] || topic.title.en;
  const answer = topic.answer[LANG] || topic.answer.en;
  const now = new Date();
  const color = bubbleColorFor(topic.icon);
  chat.innerHTML = `
    <div class="chat-bubble chat-user">${escText(title)}<span class="chat-time">${formatChatTime(now)}</span></div>
    <div class="chat-bubble chat-bot show" id="${chatId}-bot-bubble" style="border-color:${color};"><span class="chat-typing-dots"><span></span><span></span><span></span></span></div>
  `;
  chat.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  const bubble = document.getElementById(chatId + '-bot-bubble');
  const nowMs = Date.now();
  const sinceLast = lastChatActionAt ? nowMs - lastChatActionAt : 99999;
  lastChatActionAt = nowMs;
  const lineCount = Math.ceil(answer.length / 55);
  let delay = lineCount > 15 ? 2200 : 500 + Math.min(1800, answer.length * 7);
  if(sinceLast < 4000) delay = Math.round(delay * 0.45);
  setTimeout(() => typeWriterText(bubble, answer, now), delay);
}

/* Estimateur de gains — mini-outil interactif dans le chat */
function showEarningsEstimator(m){
  const chat = document.getElementById('advice-chat');
  chat.innerHTML = `
    <div class="chat-bubble chat-user">${t('toolEstimateEarnings')}<span class="chat-time">${formatChatTime(new Date())}</span></div>
    <div class="chat-bubble chat-bot show">
      <p style="margin-bottom:10px;">${t('toolEstimatorIntro')}</p>
      <label style="font-size:10.5px;text-transform:uppercase;color:var(--text-muted);display:block;margin-bottom:4px;">${t('toolEstimatorPrice')}</label>
      <input id="est-price" type="number" min="1" value="15" style="width:100%;margin-bottom:8px;background:var(--bg-elev);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:7px 9px;">
      <label style="font-size:10.5px;text-transform:uppercase;color:var(--text-muted);display:block;margin-bottom:4px;">${t('toolEstimatorVolume')}</label>
      <input id="est-volume" type="number" min="1" value="10" style="width:100%;margin-bottom:10px;background:var(--bg-elev);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:7px 9px;">
      <button class="btn btn-primary btn-sm" id="est-calc-btn" style="width:100%;">${t('toolEstimatorCalc')}</button>
    </div>
  `;
  chat.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  document.getElementById('est-calc-btn').onclick = () => {
    const price = parseFloat(document.getElementById('est-price').value) || 0;
    const volume = parseFloat(document.getElementById('est-volume').value) || 0;
    const monthly = price * volume;
    const creatorShare = Math.round(monthly * (DEFAULT_SPLIT_CREATOR_PERCENT / 100));
    chat.insertAdjacentHTML('beforeend', `
      <div class="chat-bubble chat-bot show" id="chat-bot-bubble-result"></div>
    `);
    const bubble = document.getElementById('chat-bot-bubble-result');
    const text = t('toolEstimatorResult')
      .replace('{monthly}', monthly)
      .replace('{share}', creatorShare)
      .replace('{percent}', DEFAULT_SPLIT_CREATOR_PERCENT);
    typeWriterText(bubble, text);
  };
}

function openPaidContentModal(m, kind){
  document.getElementById('t-paid-modal-title').textContent =
    kind === 'video' ? t('paidAddVideo') : kind === 'audio' ? t('paidAddAudio') : t('paidAddPhoto');
  const max = kind === 'video' ? PAID_VIDEO_MAX : kind === 'audio' ? PAID_AUDIO_MAX : PAID_PHOTO_MAX;
  const body = document.getElementById('paid-body');
  body.innerHTML = `
    ${kind !== 'audio' ? `<p class="content-policy-reminder">🔞 ${t('contentPolicyNote')}</p>` : ''}
    <label>${t('paidDescLabel')}</label>
    <textarea id="paid-desc" rows="3" placeholder="${kind === 'audio' ? t('paidAudioDescPh') : t('paidDescPh')}"></textarea>
    <label>${t('paidPriceLabel')} (1€ – ${max}€)</label>
    <input id="paid-price" type="number" min="1" max="${max}" value="1">
    <p id="paid-price-conversion" class="daily-budget-result" style="margin:10px 0 16px;font-size:11.5px;"></p>
    ${kind === 'video' ? `
      <label>${t('paidTeaserLabel')}</label>
      ${dualUploadZoneHtml('paid-teaser', 'video/*')}
      <label>${t('paidFullVideoLabel')}</label>
      ${dualUploadZoneHtml('paid-full', 'video/*')}
    ` : kind === 'audio' ? `
      <label>${t('paidAudioLabel')}</label>
      <div class="audio-mode-tabs">
        <button type="button" class="audio-mode-btn active" id="audio-mode-upload">${t('paidAudioImport')}</button>
        <button type="button" class="audio-mode-btn" id="audio-mode-record">${t('paidAudioRecordNow')}</button>
      </div>
      <div id="audio-upload-zone">
        <div class="upload-drop" id="paid-full-drop">
          <span id="paid-full-label">${t('paidAudioPrompt')}</span>
          <input type="file" id="paid-full-file" accept="audio/*">
        </div>
      </div>
      <div id="audio-record-zone" style="display:none;">
        <div class="audio-record-box">
          <button type="button" class="audio-record-btn" id="audio-record-btn">${AICON.music}</button>
          <p id="audio-record-status" class="mono" style="font-size:11px;color:var(--text-muted);margin-top:8px;">${t('paidAudioRecordPrompt')}</p>
          <audio id="audio-record-preview" controls style="width:100%;margin-top:10px;display:none;height:32px;"></audio>
        </div>
      </div>
    ` : `
      <label>${t('paidPhotoLabel')}</label>
      ${dualUploadZoneHtml('paid-full', 'image/*')}
    `}
    <div class="modal-actions">
      <button class="btn btn-ghost btn-sm" id="paid-cancel" style="flex:1;">${t('cancel')}</button>
      <button class="btn btn-primary btn-sm" id="paid-save" style="flex:1;">${t('save')}</button>
    </div>
  `;

  let teaserFile = null, fullFile = null;

  /* Calcul immédiat (aucune API nécessaire) de ce qu'elle gagne en euros,
     affiché tout de suite pendant qu'elle tape. Si sa devise n'est pas
     l'euro, on ajoute juste un lien vers Google pour voir la conversion
     du jour, plutôt que de dépendre d'une API externe qui peut échouer. */
  const myCurCode = getMyCurrency(m.id);
  function clampPrice(){
    const input = document.getElementById('paid-price');
    let val = parseFloat(input.value);
    if(isNaN(val)) return;
    if(val > max) input.value = max;
    if(val < 1) input.value = 1;
  }
  function updatePriceConversion(){
    clampPrice();
    const resultEl = document.getElementById('paid-price-conversion');
    if(!resultEl) return;
    const price = parseFloat(document.getElementById('paid-price').value) || 0;
    if(price <= 0){ resultEl.innerHTML = ''; return; }
    const myShareEur = Math.round(price * (DEFAULT_SPLIT_CREATOR_PERCENT / 100) * 100) / 100;
    let html = `<div class="price-earn-row">${ICON_COIN}<span>${t('paidYouWillEarn')} <strong>${myShareEur}€</strong> (${DEFAULT_SPLIT_CREATOR_PERCENT}%)</span></div>`;
    if(myCurCode !== 'EUR'){
      const googleUrl = `https://www.google.com/search?q=${myShareEur}+EUR+to+${encodeURIComponent(myCurCode)}`;
      html += `<a href="${googleUrl}" target="_blank" rel="noopener" class="price-google-link">${ICON_EXTERNAL_LINK}<span>${t('paidSeeInGoogle')} (${escText(myCurCode)})</span></a>`;
    }
    resultEl.innerHTML = html;
  }
  document.getElementById('paid-price').addEventListener('input', updatePriceConversion);
  updatePriceConversion();

  if(kind === 'video'){
    wireDualUpload('paid-teaser', (files) => { teaserFile = files[0]; });
  }
  if(kind === 'video' || kind === 'photo'){
    wireDualUpload('paid-full', (files) => { fullFile = files[0]; });
  }
  if(kind === 'audio'){
    const uploadBtn = document.getElementById('audio-mode-upload');
    const recordBtn = document.getElementById('audio-mode-record');
    const uploadZone = document.getElementById('audio-upload-zone');
    const recordZone = document.getElementById('audio-record-zone');
    uploadBtn.onclick = () => {
      uploadBtn.classList.add('active'); recordBtn.classList.remove('active');
      uploadZone.style.display = 'block'; recordZone.style.display = 'none';
    };
    recordBtn.onclick = () => {
      recordBtn.classList.add('active'); uploadBtn.classList.remove('active');
      recordZone.style.display = 'block'; uploadZone.style.display = 'none';
    };

    let mediaRecorder = null, chunks = [], recording = false, stream = null;
    document.getElementById('audio-record-btn').onclick = async () => {
      const statusEl = document.getElementById('audio-record-status');
      const recBtn = document.getElementById('audio-record-btn');
      if(!recording){
        try{
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          chunks = [];
          mediaRecorder = new MediaRecorder(stream);
          mediaRecorder.ondataavailable = (e) => { if(e.data.size > 0) chunks.push(e.data); };
          mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'audio/webm' });
            fullFile = new File([blob], `enregistrement_${Date.now()}.webm`, { type: 'audio/webm' });
            const preview = document.getElementById('audio-record-preview');
            preview.src = URL.createObjectURL(blob);
            preview.style.display = 'block';
            statusEl.textContent = t('paidAudioRecordDone');
            stream.getTracks().forEach(tr => tr.stop());
          };
          mediaRecorder.start();
          recording = true;
          recBtn.classList.add('recording');
          statusEl.textContent = t('paidAudioRecording');
        }catch(err){
          console.error('mic access error', err);
          toast(t('paidAudioMicError'));
        }
      } else {
        mediaRecorder.stop();
        recording = false;
        recBtn.classList.remove('recording');
      }
    };
  }
  if(kind === 'audio'){
    document.getElementById('paid-full-drop').onclick = () => document.getElementById('paid-full-file').click();
    document.getElementById('paid-full-file').onchange = (e) => {
      fullFile = e.target.files[0];
      if(fullFile) document.getElementById('paid-full-label').textContent = fullFile.name;
    };
  }

  document.getElementById('paid-cancel').onclick = closePaidModal;
  document.getElementById('paid-save').onclick = async () => {
    const desc = document.getElementById('paid-desc').value.trim();
    let price = parseInt(document.getElementById('paid-price').value, 10) || 1;
    price = Math.max(1, Math.min(max, price));
    if(!fullFile){ toast(t('paidFileRequired')); return; }
    if(kind === 'video' && !teaserFile){ toast(t('paidTeaserRequired')); return; }

    const saveBtn = document.getElementById('paid-save');
    const cancelBtn = document.getElementById('paid-cancel');
    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    const originalLabel = saveBtn.textContent;
    try{
      let teaserUrl = '';
      let teaserDocId = null;
      if(kind === 'video'){
        // Teaser d'abord (fichier léger, upload rapide) — donne un retour visuel immédiat.
        saveBtn.textContent = t('paidUploadingTeaser');
        teaserUrl = await uploadToR2WithProgress(auth, teaserFile, 'paid/teasers/' + m.id, (pct) => {
          saveBtn.textContent = `${t('paidUploadingTeaser')} ${pct}%`;
        });
      }

      saveBtn.textContent = t('paidUploadingFull');
      const fullUpload = await uploadMediaItem(m.id, fullFile, kind, {
        collection: 'paid_content',
        pathPrefix: 'paid/' + kind + 's',
        extraFields: { price, description: desc, salesCount: 0, revenue: 0, teaserUrl },
        onProgress: (pct) => { saveBtn.textContent = `${t('paidUploadingFull')} ${pct}%`; }
      });

      m.paidContent = m.paidContent || [];
      m.paidContent.unshift({
        docId: fullUpload.docId, kind, url: fullUpload.url, teaserUrl,
        price, description: desc, salesCount: 0, revenue: 0
      });
      closePaidModal();
      renderMyPaidGallery(m);
      toast(t('addedToast'));
    }catch(e){
      console.error('paid content save error', e);
      toast((LANG==='fr' ? 'Erreur : ' : 'Error: ') + (e && e.message ? e.message : e));
    }
    saveBtn.disabled = false;
    cancelBtn.disabled = false;
    saveBtn.textContent = originalLabel;
  };

  document.getElementById('paid-backdrop').classList.add('open');
  document.getElementById('paid-modal').classList.add('open');
}
function closePaidModal(){
  document.getElementById('paid-backdrop').classList.remove('open');
  document.getElementById('paid-modal').classList.remove('open');
}
document.getElementById('paid-backdrop').onclick = closePaidModal;

/* Demandes de déblocage (paiement manuel) à valider par la créatrice */
async function loadMyOrders(m){
  const zone = document.getElementById('my-orders-zone');
  if(!zone || !db) return;
  try{
    let orders = [];
    for(const item of (m.paidContent || [])){
      // Pas de "where" combiné à "orderBy" ici : on lit tout puis on filtre/trie
      // nous-mêmes, pour éviter d'avoir à créer un index composite Firestore.
      const snap = await db.collection('profiles').doc(m.id).collection('paid_content').doc(item.docId)
        .collection('orders').get();
      snap.forEach(d => {
        const data = d.data();
        if(data.status === 'pending') orders.push({ orderId: d.id, itemDocId: item.docId, item, ...data });
      });
    }
    orders.sort((a, b) => {
      const ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });
    if(!orders.length){
      zone.innerHTML = `<span class="gallery-empty">${t('paidNoOrders')}</span>`;
      return;
    }
    // Le paiement est encaissé par l'agence — la créatrice voit le statut, sans pouvoir le valider elle-même.
    zone.innerHTML = orders.map(o => `
      <div class="order-card">
        <div>
          <div class="order-buyer">${escText(o.buyerName || '—')}</div>
          <div class="order-meta">${o.item.kind === 'video' ? t('galleryVideos') : t('galleryPhotos')} — ${o.item.price}€ — ${formatCommentDate(o.createdAt)}</div>
        </div>
        <span class="mono" style="font-size:10px;color:var(--text-muted);text-transform:uppercase;">${t('paidPendingAgency')}</span>
      </div>`).join('');
  }catch(e){
    console.error('load orders error', e);
    zone.innerHTML = `<span class="gallery-empty">${(LANG==='fr'?'Erreur : ':'Error: ')}${escText(e.message||String(e))}</span>`;
  }
}

function renderMyGallery(m){
  const zone = document.getElementById('my-gallery-zone');
  if(!zone) return;

  const photoThumbs = m.galleryPhotos.map((item) => `
    <div class="gallery-thumb">
      <img src="${item.url}" data-full="${item.url}" data-type="image" loading="lazy">
      <button class="rm" data-kind="photo" data-docid="${item.docId}">✕</button>
    </div>`).join('');
  const videoThumbs = m.galleryVideos.map((item) => `
    <div class="gallery-thumb">
      <video src="${item.url}" data-full="${item.url}" data-type="video" muted></video>
      <button class="rm" data-kind="video" data-docid="${item.docId}">✕</button>
    </div>`).join('');

  zone.innerHTML = `
    <p class="content-policy-reminder">🔞 ${t('contentPolicyNote')}</p>
    <div class="gallery-section">
      <h4>${t('myProfilePhotos')} (${m.galleryPhotos.length})</h4>
      <div class="gallery-strip">${photoThumbs}</div>
      ${dualUploadZoneHtml('my-photo', 'image/*', { multiple: true })}
    </div>
    <div class="gallery-section">
      <h4>${t('myProfileVideos')} (${m.galleryVideos.length})</h4>
      <div class="gallery-strip">${videoThumbs}</div>
      ${dualUploadZoneHtml('my-video', 'video/*', { multiple: true })}
    </div>
  `;

  zone.querySelectorAll('.gallery-thumb img, .gallery-thumb video').forEach(el => {
    el.onclick = () => openLightbox(el.dataset.full, el.dataset.type);
  });

  wireDualUpload('my-photo', (files) => handleGalleryAdd(m, files, 'galleryPhotos', () => renderMyGallery(m)));
  wireDualUpload('my-video', (files) => handleGalleryAdd(m, files, 'galleryVideos', () => renderMyGallery(m)));

  zone.querySelectorAll('.rm').forEach(btn => {
    btn.onclick = async () => {
      const kind = btn.dataset.kind;
      const docId = btn.dataset.docid;
      btn.disabled = true;
      try{
        await deleteMediaItem(m.id, docId);
        if(kind === 'photo') m.galleryPhotos = m.galleryPhotos.filter(x => x.docId !== docId);
        else m.galleryVideos = m.galleryVideos.filter(x => x.docId !== docId);
        renderMyGallery(m);
        toast(t('removedToast'));
      }catch(e){
        toast(t('saveErrorToast'));
      }
    };
  });
}

/* ---------------- creator self-edit (own info + cover photo, no contract/consent) ---------------- */
function openMyProfileEdit(m){
  const body = document.getElementById('edit-body');
  document.getElementById('t-modal-title').textContent = t('myEditBtn');
  const bio = Object.assign({
    origin:'', nationality:'', age:'', bodyType:'', orientation:'', lookingFor:'',
    passions:'', universe:'', hobbies:'', personality:'', fantasies:'', fetish:'',
    ambitions:'', socials:'', workUrl:'', status:'offline'
  }, m.bio || {});
  body.innerHTML = `
    <label>${t('photoLabel')}</label>
    <p class="member-note" style="margin:-4px 0 8px;">${t('coverVideoNote')}</p>
    <div class="cover-type-toggle">
      <button type="button" class="cover-type-btn ${(m.photoType || 'image') === 'image' ? 'active' : ''}" data-type="image">${ICON_CAMERA}${t('photoLabel')}</button>
      <button type="button" class="cover-type-btn ${m.photoType === 'video' ? 'active' : ''}" data-type="video">${ICON_VIDEO}${t('coverVideoBtn')}</button>
    </div>
    <div class="upload-drop ${m.photo ? 'has-file' : ''}" id="ed-drop">
      <span id="ed-drop-label">${m.photo ? t('photoReplace') : t('photoPrompt')}</span>
      <input type="file" id="ed-file" accept="${(m.photoType === 'video') ? 'video/*' : 'image/*'}">
    </div>
    <p class="tipmenu-help-text" id="ed-cover-rules">${t('coverVideoRules')}</p>

    <div style="margin-top:26px;padding-top:20px;border-top:1px solid var(--border);">
      <label>${t('bioCoverLabel')}</label>
      <p class="member-note" style="margin:-4px 0 8px;">${t('bioCoverNote')}</p>
      <div class="cover-type-toggle">
        <button type="button" class="cover-type-btn bio-cover-type-btn ${(m.bioCoverPhotoType || 'image') === 'image' ? 'active' : ''}" data-type="image">${ICON_CAMERA}${t('photoLabel')}</button>
        <button type="button" class="cover-type-btn bio-cover-type-btn ${m.bioCoverPhotoType === 'video' ? 'active' : ''}" data-type="video">${ICON_VIDEO}${t('coverVideoBtn')}</button>
      </div>
      <div class="upload-drop ${m.bioCoverPhoto ? 'has-file' : ''}" id="ed-bio-cover-drop">
        <span id="ed-bio-cover-drop-label">${m.bioCoverPhoto ? t('photoReplace') : t('photoPrompt')}</span>
        <input type="file" id="ed-bio-cover-file" accept="${(m.bioCoverPhotoType === 'video') ? 'video/*' : 'image/*'}">
      </div>
      <p class="tipmenu-help-text" id="ed-bio-cover-rules">${t('coverVideoRules')}</p>
    </div>

    <div style="margin-top:26px;padding-top:20px;border-top:1px solid var(--border);">
      <label>${t('publicIntroLabel')}</label>
      <p class="member-note" style="margin:-4px 0 6px;">${t('publicIntroNote')}</p>
      <textarea id="ed-public-intro" rows="4" maxlength="600" placeholder="${escAttr(t('publicIntroPh'))}">${escText(m.publicIntro || '')}</textarea>
    </div>
    <label>${t('stageName')}</label>
    <input id="ed-name" value="${escText(m.name)}" placeholder="ex. Luna">
    <label>${t('country')}</label>
    <input id="ed-country" value="${escText(m.country)}" placeholder="ex. France">
    <label>${t('platforms')}</label>
    <input id="ed-platforms" value="${escText(m.platforms)}" placeholder="${t('platformsPh')}">
    <label>${t('audience')}</label>
    <input id="ed-audience" value="${escText(m.audience)}" placeholder="${t('audiencePh')}">
    <label>${t('content')}</label>
    <input id="ed-content" value="${escText(m.contentType)}" placeholder="${t('contentPh')}">
    <label>${t('availLabel')}</label>
    <input id="ed-avail" value="${escText(m.availability)}" placeholder="ex. Partenariats marque, Collaborations">

    <div style="margin-top:26px;padding-top:20px;border-top:1px solid var(--border);">
      <h3 style="font-size:15px;margin-bottom:4px;">${t('bioSectionTitle')}</h3>
      <p style="color:var(--text-muted);font-size:12px;margin-bottom:14px;line-height:1.6;">${t('bioSectionNote')}</p>

      <label>${t('bioOrigin')}</label>
      <input id="ed-bio-origin" value="${escText(bio.origin)}">
      <label>${t('bioNationality')}</label>
      <input id="ed-bio-nationality" value="${escText(bio.nationality)}">
      <label>${t('bioAge')}</label>
      <input id="ed-bio-age" type="number" min="18" value="${escText(bio.age)}">
      <label>${t('bioBodyType')}</label>
      <input id="ed-bio-bodytype" value="${escText(bio.bodyType)}">
      <label>${t('bioOrientation')}</label>
      <input id="ed-bio-orientation" value="${escText(bio.orientation)}">
      <label>${t('bioLookingFor')}</label>
      <input id="ed-bio-lookingfor" value="${escText(bio.lookingFor)}">
      <label>${t('bioPassions')}</label>
      <textarea id="ed-bio-passions" rows="2">${escText(bio.passions)}</textarea>
      <label>${t('bioUniverse')}</label>
      <textarea id="ed-bio-universe" rows="2">${escText(bio.universe)}</textarea>
      <label>${t('bioHobbies')}</label>
      <textarea id="ed-bio-hobbies" rows="2">${escText(bio.hobbies)}</textarea>
      <label>${t('bioPersonality')}</label>
      <textarea id="ed-bio-personality" rows="2">${escText(bio.personality)}</textarea>
      <label>${t('bioFantasies')}</label>
      <textarea id="ed-bio-fantasies" rows="2">${escText(bio.fantasies)}</textarea>
      <label>${t('bioFetish')}</label>
      <textarea id="ed-bio-fetish" rows="2">${escText(bio.fetish)}</textarea>
      <label>${t('bioAmbitions')}</label>
      <textarea id="ed-bio-ambitions" rows="2">${escText(bio.ambitions)}</textarea>
      <label>${t('bioDiscussionStyle')}</label>
      <textarea id="ed-bio-discussionstyle" rows="2">${escText(bio.discussionStyle)}</textarea>
      <label>${t('bioDreams')}</label>
      <textarea id="ed-bio-dreams" rows="2">${escText(bio.dreams)}</textarea>
      <label>${t('bioFears')}</label>
      <textarea id="ed-bio-fears" rows="2">${escText(bio.fears)}</textarea>
      <label>${t('bioVictories')}</label>
      <textarea id="ed-bio-victories" rows="2">${escText(bio.victories)}</textarea>
      <label>${t('bioChallenges')}</label>
      <textarea id="ed-bio-challenges" rows="2">${escText(bio.challenges)}</textarea>
      <label>${t('bioSocials')}</label>
      <input id="ed-bio-socials" value="${escText(bio.socials)}" placeholder="${t('bioSocialsPh')}">
      <label>${t('bioWorkUrl')}</label>
      <input id="ed-bio-workurl" value="${escText(bio.workUrl)}" placeholder="${t('bioWorkUrlPh')}">
      <label>${t('bioOnlineStatus')}</label>
      <select id="ed-bio-status">
        <option value="offline" ${bio.status !== 'online' ? 'selected' : ''}>${t('statusOffline')}</option>
        <option value="online" ${bio.status === 'online' ? 'selected' : ''}>${t('statusOnline')}</option>
      </select>
      <p style="color:var(--honey);font-size:11.5px;margin-top:12px;line-height:1.6;">${t('contentPolicyNote')}</p>
    </div>
    ${desireBioPercentagesHtml(bio)}

    <div class="modal-actions">
      <button class="btn btn-ghost btn-sm" id="ed-cancel" style="flex:1;">${t('cancel')}</button>
      <button class="btn btn-primary btn-sm" id="ed-save" style="flex:1;">${t('save')}</button>
    </div>
  `;

  let newPhoto = m.photo;
  let newPhotoType = m.photoType || 'image';
  let newBioCoverPhoto = m.bioCoverPhoto || '';
  let newBioCoverPhotoType = m.bioCoverPhotoType || 'image';
  let photoUploading = false;
  wireDesireBioPercentages();

  document.querySelectorAll('.cover-type-btn:not(.bio-cover-type-btn)').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.cover-type-btn:not(.bio-cover-type-btn)').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      newPhotoType = btn.dataset.type;
      document.getElementById('ed-file').setAttribute('accept', newPhotoType === 'video' ? 'video/*' : 'image/*');
    };
  });
  document.querySelectorAll('.bio-cover-type-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.bio-cover-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      newBioCoverPhotoType = btn.dataset.type;
      document.getElementById('ed-bio-cover-file').setAttribute('accept', newBioCoverPhotoType === 'video' ? 'video/*' : 'image/*');
    };
  });

  function checkVideoDuration(file){
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src);
        if(video.duration > 60) reject(new Error('too_long'));
        else resolve();
      };
      video.onerror = () => reject(new Error('invalid_video'));
      video.src = URL.createObjectURL(file);
    });
  }

  document.getElementById('ed-file').onchange = async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    if(newPhotoType === 'video'){
      try{ await checkVideoDuration(file); }
      catch(err){
        toast(t('coverVideoTooLong'));
        e.target.value = '';
        return;
      }
    }
    photoUploading = true;
    document.getElementById('ed-drop-label').textContent = t('uploadingLabel');
    try{
      newPhoto = await uploadToR2(auth, file, 'covers/' + m.id);
      document.getElementById('ed-drop').classList.add('has-file');
      document.getElementById('ed-drop-label').textContent = t('photoReplace');
    }catch(err){
      console.error('photo upload error', err);
      toast(t('uploadFailed') + ' [' + (err && err.message || 'erreur inconnue') + ']');
      document.getElementById('ed-drop-label').textContent = t('photoPrompt');
    }
    photoUploading = false;
  };

  document.getElementById('ed-bio-cover-file').onchange = async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    if(newBioCoverPhotoType === 'video'){
      try{ await checkVideoDuration(file); }
      catch(err){
        toast(t('coverVideoTooLong'));
        e.target.value = '';
        return;
      }
    }
    photoUploading = true;
    document.getElementById('ed-bio-cover-drop-label').textContent = t('uploadingLabel');
    try{
      newBioCoverPhoto = await uploadToR2(auth, file, 'bio-covers/' + m.id);
      document.getElementById('ed-bio-cover-drop').classList.add('has-file');
      document.getElementById('ed-bio-cover-drop-label').textContent = t('photoReplace');
    }catch(err){
      console.error('bio cover upload error', err);
      toast(t('uploadFailed'));
      document.getElementById('ed-bio-cover-drop-label').textContent = t('photoPrompt');
    }
    photoUploading = false;
  };

  document.getElementById('ed-cancel').onclick = closeEdit;
  document.getElementById('ed-save').onclick = async () => {
    if(photoUploading){
      toast(t('uploadingLabel'));
      return;
    }
    const saveBtn = document.getElementById('ed-save');
    saveBtn.disabled = true;
    m.name = document.getElementById('ed-name').value.trim();
    m.publicIntro = document.getElementById('ed-public-intro').value.trim().split('\n').slice(0, 10).join('\n');
    m.country = document.getElementById('ed-country').value.trim();
    m.platforms = document.getElementById('ed-platforms').value.trim();
    m.audience = document.getElementById('ed-audience').value.trim();
    m.contentType = document.getElementById('ed-content').value.trim();
    m.availability = document.getElementById('ed-avail').value.trim();
    m.photo = newPhoto;
    m.photoType = newPhotoType;
    m.bioCoverPhoto = newBioCoverPhoto;
    m.bioCoverPhotoType = newBioCoverPhotoType;
    m.filled = !!m.name;
    m.bio = {
      origin: document.getElementById('ed-bio-origin').value.trim(),
      nationality: document.getElementById('ed-bio-nationality').value.trim(),
      age: document.getElementById('ed-bio-age').value.trim(),
      bodyType: document.getElementById('ed-bio-bodytype').value.trim(),
      orientation: document.getElementById('ed-bio-orientation').value.trim(),
      lookingFor: document.getElementById('ed-bio-lookingfor').value.trim(),
      passions: document.getElementById('ed-bio-passions').value.trim(),
      universe: document.getElementById('ed-bio-universe').value.trim(),
      hobbies: document.getElementById('ed-bio-hobbies').value.trim(),
      personality: document.getElementById('ed-bio-personality').value.trim(),
      fantasies: document.getElementById('ed-bio-fantasies').value.trim(),
      fetish: document.getElementById('ed-bio-fetish').value.trim(),
      ambitions: document.getElementById('ed-bio-ambitions').value.trim(),
      discussionStyle: document.getElementById('ed-bio-discussionstyle').value.trim(),
      dreams: document.getElementById('ed-bio-dreams').value.trim(),
      fears: document.getElementById('ed-bio-fears').value.trim(),
      victories: document.getElementById('ed-bio-victories').value.trim(),
      challenges: document.getElementById('ed-bio-challenges').value.trim(),
      socials: document.getElementById('ed-bio-socials').value.trim(),
      workUrl: document.getElementById('ed-bio-workurl').value.trim(),
      status: document.getElementById('ed-bio-status').value,
      desirePercentages: readDesireBioPercentages()
    };

    let ok = true;
    try{
      await db.collection('profiles').doc(m.id).set({
        slotNumber: parseInt(m.id.replace('m',''), 10),
        name: m.name, country: m.country, platforms: m.platforms,
        audience: m.audience, contentType: m.contentType, availability: m.availability,
        photo: m.photo, photoType: m.photoType || 'image',
        bioCoverPhoto: m.bioCoverPhoto || '', bioCoverPhotoType: m.bioCoverPhotoType || 'image',
        filled: m.filled, bio: m.bio, publicIntro: m.publicIntro || '',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }catch(e){
      console.error('self-save error', e);
      ok = false;
    }
    saveBtn.disabled = false;
    if(ok){
      closeEdit();
      renderMyProfile(m.id);
      toast(t('savedToast'));
    } else {
      toast(t('saveErrorToast'));
    }
  };

  document.getElementById('edit-backdrop').classList.add('open');
  document.getElementById('edit-modal').classList.add('open');
}

function renderRoster(){
  const filledCount = roster.filter(m => m.filled).length;
  document.getElementById('roster-count').textContent = filledCount + ' / ' + SLOT_COUNT;
  const trustCountEl = document.getElementById('agency-trust-count');
  if(trustCountEl) trustCountEl.textContent = filledCount;

  const displayOrder = [...roster].sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
  const half = Math.ceil(displayOrder.length / 2);
  const row1El = document.getElementById('roster-grid-row1');
  row1El.innerHTML = displayOrder.slice(0, half).map(m => modelCardHtml(m)).join('');
  wireCarouselCard(row1El);
  wireCarouselArrows(row1El.closest('.creator-carousel-section'));
}
function wireCarouselCard(grid){
  grid.querySelectorAll('.contract-tab-toggle').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const panel = document.getElementById('contract-group-' + btn.dataset.id);
      if(!panel) return;
      // Ferme tout autre menu contrat ouvert ailleurs sur la page.
      document.querySelectorAll('.contract-btn-group').forEach(p => { if(p !== panel) p.style.display = 'none'; });
      const isOpen = panel.style.display !== 'none';
      if(isOpen){ panel.style.display = 'none'; return; }
      const rect = btn.getBoundingClientRect();
      panel.style.display = 'flex';
      panel.style.top = Math.min(rect.bottom + window.scrollY + 4, window.scrollY + window.innerHeight - 10) + 'px';
      panel.style.left = Math.max(8, Math.min(rect.left + window.scrollX, window.scrollX + window.innerWidth - 230)) + 'px';
      const dismiss = (ev) => {
        if(!panel.contains(ev.target) && ev.target !== btn){
          panel.style.display = 'none';
          document.removeEventListener('click', dismiss);
        }
      };
      setTimeout(() => document.addEventListener('click', dismiss), 0);
    };
  });
  grid.querySelectorAll('.edit-btn').forEach(btn => {
    btn.onclick = () => requireAdmin(() => openEdit(btn.dataset.id));
  });
  grid.querySelectorAll('.contract-link[data-href]').forEach(a => {
    a.onclick = (e) => { e.preventDefault(); window.open(a.dataset.href, '_blank'); };
  });
  grid.querySelectorAll('.creator-contract-btn').forEach(btn => {
    btn.onclick = () => { document.querySelectorAll('.contract-btn-group').forEach(p => p.style.display = 'none'); openCreatorContract(btn.dataset.id); };
  });
  grid.querySelectorAll('.gallery-open-btn').forEach(btn => {
    btn.onclick = () => openGallery(btn.dataset.id);
  });
  grid.querySelectorAll('.members-viewer-btn').forEach(btn => {
    btn.onclick = () => openMembersViewer(btn.dataset.id, btn.dataset.name);
  });
  grid.querySelectorAll('.agency-contract-btn').forEach(btn => {
    btn.onclick = () => { document.querySelectorAll('.contract-btn-group').forEach(p => p.style.display = 'none'); openAgencyContractsForCreator(btn.dataset.id, btn.dataset.type); };
  });
  grid.querySelectorAll('.featured-toggle-btn').forEach(btn => {
    btn.onclick = async () => {
      const m = roster.find(x => x.id === btn.dataset.id);
      if(!m) return;
      btn.disabled = true;
      try{
        m.featured = !m.featured;
        await db.collection('profiles').doc(m.id).set({ featured: m.featured }, { merge: true });
        renderRoster();
        toast(t('savedToast'));
      }catch(e){
        console.error(e);
        m.featured = !m.featured;
        toast(t('saveErrorToast'));
        btn.disabled = false;
      }
    };
  });
}

function wireCarouselArrows(section){
  if(!section || section.dataset.wired) return;
  section.dataset.wired = '1';
  section.querySelectorAll('.carousel-arrow').forEach(btn => {
    btn.onclick = () => {
      const rows = section.querySelectorAll('.creator-carousel-row');
      rows.forEach(row => {
        const cardEl = row.querySelector('.model-card');
        const cardWidth = cardEl ? cardEl.offsetWidth + 8 : 200;
        row.scrollBy({ left: cardWidth * 3 * parseInt(btn.dataset.dir, 10), behavior: 'smooth' });
      });
    };
  });
}

function modelCardHtml(m){
  const num = m.id.replace('m', '').padStart(2, '0');
  const numBadge = `<span class="num-badge">${num}</span>`;
  const photoHtml = m.photo
    ? (m.photoType === 'video' ? `<video src="${m.photo}" muted loop autoplay playsinline></video>` : `<img src="${m.photo}" loading="lazy" decoding="async">`)
    : `<div class="placeholder">${LANG==='fr' ? 'Photo à ajouter<br>(avec autorisation de la créatrice)' : 'Photo to add<br>(with the creator\'s authorization)'}</div>`;

  if(!m.filled && !editMode){
    return `
      <div class="model-card empty-slot-card">
        <div class="model-photo empty-slot-photo">
          <span class="logo empty-slot-logo">honeymoon</span>
          ${numBadge}
        </div>
        <div class="model-body">
          <h3 style="font-size:16px;">${t('emptyName')}</h3>
          <div class="meta">${t('numberPrefix')} ${num}</div>
        </div>
      </div>`;
  }

  const creatorSigned = !!(m.creatorContractSignature && m.creatorContractSignature.signatureDataUrl);
  const contractHtml = m.filled
    ? `<button class="pill-link creator-contract-btn" data-id="${m.id}">${ICON_DOC}${t('creatorContractBtn')} ${creatorSigned ? '✅' : ''}</button>`
    : '';

  const sigsAll = m.contractSignatures || [];
  const countByType = (type) => sigsAll.filter(s => (s.contractType || 'agency') === type).length;
  const agencyContractHtml = m.filled
    ? `<button class="pill-link agency-contract-btn" data-id="${m.id}" data-type="agency">${ICON_SIGN}${t('signTypeAgency')} (${countByType('agency')})</button>`
    : '';
  const partnerSiteContractHtml = m.filled
    ? `<button class="pill-link agency-contract-btn" data-id="${m.id}" data-type="partner_site">${ICON_SIGN}${t('signTypePartnerSite')} (${countByType('partner_site')})</button>`
    : '';
  const blankContractHtml = m.filled
    ? `<button class="pill-link agency-contract-btn" data-id="${m.id}" data-type="other">${ICON_SIGN}${t('signTypeOther')} (${countByType('other')})</button>`
    : '';

  const galleryHtml = m.filled
    ? `<button class="pill-link gallery-open-btn" data-id="${m.id}">${ICON_GALLERY}${t('galleryBtn')}</button>`
    : '';
  const membersViewerHtml = m.filled
    ? `<button class="pill-link members-viewer-btn" data-id="${m.id}" data-name="${escAttr(m.name || '')}">👥 ${t('membersViewerBtn')}</button>`
    : '';

  return `
    <div class="model-card social-feed-card ${m.featured ? 'featured-card' : ''}">
      <div class="model-photo">
        ${photoHtml}
        ${m.filled ? `<div class="social-feed-scrim"></div>` : ''}
        ${numBadge}
        ${m.featured ? `<span class="featured-badge">${ICON_STAR} ${t('featuredBadge')}</span>` : ''}
        ${m.filled ? `<span class="status">${m.verified18 ? t('verified') : t('notVerified')}</span>` : ''}
      </div>
      <div class="model-body">
        <div class="name-row">
          <h3>${m.name ? escText(m.name) : t('nameUndefined')}</h3>
          ${m.filled ? followerBadgeHtml(m.followersCount) : ''}
        </div>
        <div class="meta">${t('numberPrefix')} ${num} · ${escText(m.country || '—')}</div>
        <div class="rows">
          <div class="row"><span class="k">${t('platforms')}</span><span>${escText(m.platforms || '—')}</span></div>
          <div class="row"><span class="k">${t('audience')}</span><span>${escText(m.audience || '—')}</span></div>
          <div class="row"><span class="k">${t('content')}</span><span>${escText(m.contentType || '—')}</span></div>
        </div>
        ${m.availability ? `<div class="tags">${m.availability.split(',').map(x=>`<span>${escText(x.trim())}</span>`).join('')}</div>` : ''}
        ${galleryHtml}
        ${membersViewerHtml}
        ${editMode ? `<button class="edit-btn" data-id="${m.id}">${t('editProfile')}</button>` : ''}
        ${editMode && m.filled ? `<button class="pill-link featured-toggle-btn" data-id="${m.id}">${ICON_STAR} ${m.featured ? t('unfeatureBtn') : t('featureBtn')}</button>` : ''}
      </div>
    </div>`;
}

/* ---------------- edit modal (profile info) ---------------- */
function openEdit(id){
  const m = roster.find(x => x.id === id);
  const bio = Object.assign({
    origin:'', nationality:'', age:'', bodyType:'', orientation:'', lookingFor:'',
    passions:'', universe:'', hobbies:'', personality:'', fantasies:'', fetish:'',
    ambitions:'', socials:'', workUrl:'', status:'offline'
  }, m.bio || {});
  const body = document.getElementById('edit-body');
  document.getElementById('t-modal-title').textContent = t('modalTitle');
  body.innerHTML = `
    <label id="t-creator-email-label">${t('creatorEmailLabel')}</label>
    <input id="ed-owner-email" type="email" value="${escAttr(m.ownerEmail || '')}" placeholder="creator-${m.id}@honeymoon-internal.app">
    <p class="member-note" style="margin:10px 0 16px;">${t('creatorEmailNote')}</p>
    <label>${t('stageName')}</label>
    <input id="ed-name" value="${escText(m.name)}" placeholder="ex. Luna">
    <label>${t('country')}</label>
    <input id="ed-country" value="${escText(m.country)}" placeholder="ex. France">
    <label>${t('platforms')}</label>
    <input id="ed-platforms" value="${escText(m.platforms)}" placeholder="${t('platformsPh')}">
    <label>${t('audience')}</label>
    <input id="ed-audience" value="${escText(m.audience)}" placeholder="${t('audiencePh')}">
    <label>${t('content')}</label>
    <input id="ed-content" value="${escText(m.contentType)}" placeholder="${t('contentPh')}">
    <label>${t('availLabel')}</label>
    <input id="ed-avail" value="${escText(m.availability)}" placeholder="ex. Partenariats marque, Collaborations">
    <label>${t('photoLabel')}</label>
    <p class="member-note" style="margin:-4px 0 8px;">${t('coverVideoNote')}</p>
    <div class="cover-type-toggle">
      <button type="button" class="cover-type-btn ${(m.photoType || 'image') === 'image' ? 'active' : ''}" data-type="image">${ICON_CAMERA}${t('photoLabel')}</button>
      <button type="button" class="cover-type-btn ${m.photoType === 'video' ? 'active' : ''}" data-type="video">${ICON_VIDEO}${t('coverVideoBtn')}</button>
    </div>
    <div class="upload-drop ${m.photo ? 'has-file' : ''}" id="ed-drop">
      <span id="ed-drop-label">${m.photo ? t('photoReplace') : t('photoPrompt')}</span>
      <input type="file" id="ed-file" accept="${(m.photoType === 'video') ? 'video/*' : 'image/*'}">
    </div>
    <p class="tipmenu-help-text" id="ed-cover-rules">${t('coverVideoRules')}</p>

    <div style="margin-top:26px;padding-top:20px;border-top:1px solid var(--border);">
      <h3 style="font-size:15px;margin-bottom:4px;">${t('bioSectionTitle')}</h3>
      <p style="color:var(--text-muted);font-size:12px;margin-bottom:14px;line-height:1.6;">${t('bioSectionNote')}</p>

      <label>${t('bioOrigin')}</label>
      <input id="ed-bio-origin" value="${escText(bio.origin)}">
      <label>${t('bioNationality')}</label>
      <input id="ed-bio-nationality" value="${escText(bio.nationality)}">
      <label>${t('bioAge')}</label>
      <input id="ed-bio-age" type="number" min="18" value="${escText(bio.age)}">
      <label>${t('bioBodyType')}</label>
      <input id="ed-bio-bodytype" value="${escText(bio.bodyType)}">
      <label>${t('bioOrientation')}</label>
      <input id="ed-bio-orientation" value="${escText(bio.orientation)}">
      <label>${t('bioLookingFor')}</label>
      <input id="ed-bio-lookingfor" value="${escText(bio.lookingFor)}">
      <label>${t('bioPassions')}</label>
      <textarea id="ed-bio-passions" rows="2">${escText(bio.passions)}</textarea>
      <label>${t('bioUniverse')}</label>
      <textarea id="ed-bio-universe" rows="2">${escText(bio.universe)}</textarea>
      <label>${t('bioHobbies')}</label>
      <textarea id="ed-bio-hobbies" rows="2">${escText(bio.hobbies)}</textarea>
      <label>${t('bioPersonality')}</label>
      <textarea id="ed-bio-personality" rows="2">${escText(bio.personality)}</textarea>
      <label>${t('bioFantasies')}</label>
      <textarea id="ed-bio-fantasies" rows="2">${escText(bio.fantasies)}</textarea>
      <label>${t('bioFetish')}</label>
      <textarea id="ed-bio-fetish" rows="2">${escText(bio.fetish)}</textarea>
      <label>${t('bioAmbitions')}</label>
      <textarea id="ed-bio-ambitions" rows="2">${escText(bio.ambitions)}</textarea>
      <label>${t('bioDiscussionStyle')}</label>
      <textarea id="ed-bio-discussionstyle" rows="2">${escText(bio.discussionStyle)}</textarea>
      <label>${t('bioDreams')}</label>
      <textarea id="ed-bio-dreams" rows="2">${escText(bio.dreams)}</textarea>
      <label>${t('bioFears')}</label>
      <textarea id="ed-bio-fears" rows="2">${escText(bio.fears)}</textarea>
      <label>${t('bioVictories')}</label>
      <textarea id="ed-bio-victories" rows="2">${escText(bio.victories)}</textarea>
      <label>${t('bioChallenges')}</label>
      <textarea id="ed-bio-challenges" rows="2">${escText(bio.challenges)}</textarea>
      <label>${t('bioSocials')}</label>
      <input id="ed-bio-socials" value="${escText(bio.socials)}" placeholder="${t('bioSocialsPh')}">
      <label>${t('bioWorkUrl')}</label>
      <input id="ed-bio-workurl" value="${escText(bio.workUrl)}" placeholder="${t('bioWorkUrlPh')}">
      <label>${t('bioOnlineStatus')}</label>
      <select id="ed-bio-status">
        <option value="offline" ${bio.status !== 'online' ? 'selected' : ''}>${t('statusOffline')}</option>
        <option value="online" ${bio.status === 'online' ? 'selected' : ''}>${t('statusOnline')}</option>
      </select>
    </div>
    ${desireBioPercentagesHtml(bio)}

    <label style="margin-top:26px;">${t('contractLabel')}</label>
    <div class="upload-drop ${m.contract ? 'has-file' : ''}" id="ed-contract-drop">
      <span id="ed-contract-label">${m.contract ? t('contractReplace') : t('contractPrompt')}</span>
      <input type="file" id="ed-contract-file" accept="application/pdf">
    </div>
    <div class="consent-row">
      <input type="checkbox" id="ed-verified" ${m.verified18 ? 'checked' : ''}>
      <label style="margin:0;text-transform:none;font-weight:400;">${t('consentText')}</label>
    </div>
    ${isAdmin() ? `
    <div style="margin-top:26px;padding-top:20px;border-top:1px solid var(--border);display:flex;flex-wrap:wrap;gap:6px;">
      <button type="button" class="pill-link" id="ed-reports-btn">${t('reportsPanelBtn')}</button>
      <button type="button" class="pill-link" id="ed-applications-btn">${t('applicationsPanelBtn')}</button>
      <button type="button" class="pill-link" id="ed-deletions-btn">${t('deletionsPanelBtn')}</button>
    </div>` : ''}

    <div class="modal-actions">
      <button class="btn btn-ghost btn-sm" id="ed-cancel" style="flex:1;">${t('cancel')}</button>
      <button class="btn btn-primary btn-sm" id="ed-save" style="flex:1;">${t('save')}</button>
    </div>
  `;

  if(isAdmin()){
    document.getElementById('ed-reports-btn').onclick = () => requireAdmin(openReportsPanel);
    document.getElementById('ed-applications-btn').onclick = () => requireAdmin(openApplicationsPanel);
    document.getElementById('ed-deletions-btn').onclick = () => requireAdmin(openDeletionsPanel);
  }

  let newPhoto = m.photo;
  let newPhotoType = m.photoType || 'image';
  let newContract = m.contract;
  let photoUploading = false;
  let contractUploading = false;
  wireDesireBioPercentages();

  document.querySelectorAll('.cover-type-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.cover-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      newPhotoType = btn.dataset.type;
      document.getElementById('ed-file').setAttribute('accept', newPhotoType === 'video' ? 'video/*' : 'image/*');
    };
  });

  function checkVideoDurationAgency(file){
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src);
        if(video.duration > 60) reject(new Error('too_long'));
        else resolve();
      };
      video.onerror = () => reject(new Error('invalid_video'));
      video.src = URL.createObjectURL(file);
    });
  }

  document.getElementById('ed-file').onchange = async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    if(newPhotoType === 'video'){
      try{ await checkVideoDurationAgency(file); }
      catch(err){
        toast(t('coverVideoTooLong'));
        e.target.value = '';
        return;
      }
    }
    photoUploading = true;
    document.getElementById('ed-drop-label').textContent = LANG==='fr' ? 'Envoi en cours…' : 'Uploading…';
    try{
      newPhoto = await uploadToR2(auth, file, 'covers/' + m.id);
      document.getElementById('ed-drop').classList.add('has-file');
      document.getElementById('ed-drop-label').textContent = t('photoReplace');
    }catch(err){
      console.error('photo upload error', err);
      toast((LANG==='fr' ? "Échec de l'envoi de la photo." : 'Photo upload failed.') + ' [' + (err && err.message || '?') + ']');
      document.getElementById('ed-drop-label').textContent = t('photoPrompt');
    }
    photoUploading = false;
  };

  document.getElementById('ed-contract-file').onchange = async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    contractUploading = true;
    document.getElementById('ed-contract-label').textContent = LANG==='fr' ? 'Envoi en cours…' : 'Uploading…';
    try{
      newContract = await uploadToR2(auth, file, 'contracts/' + m.id);
      document.getElementById('ed-contract-drop').classList.add('has-file');
      document.getElementById('ed-contract-label').textContent = t('contractReplace');
    }catch(err){
      console.error('contract upload error', err);
      toast(LANG==='fr' ? "Échec de l'envoi du PDF." : 'PDF upload failed.');
      document.getElementById('ed-contract-label').textContent = t('contractPrompt');
    }
    contractUploading = false;
  };

  document.getElementById('ed-cancel').onclick = closeEdit;
  document.getElementById('ed-save').onclick = async () => {
    const verified = document.getElementById('ed-verified').checked;
    const name = document.getElementById('ed-name').value.trim();
    if(name && !verified){
      toast(t('needConsentToast'));
      return;
    }
    if(photoUploading || contractUploading){
      toast(LANG==='fr' ? 'Envoi en cours, patiente un instant…' : 'Upload in progress, please wait…');
      return;
    }
    const saveBtn = document.getElementById('ed-save');
    saveBtn.disabled = true;
    m.name = name;
    m.ownerEmail = document.getElementById('ed-owner-email').value.trim();
    m.country = document.getElementById('ed-country').value.trim();
    m.platforms = document.getElementById('ed-platforms').value.trim();
    m.audience = document.getElementById('ed-audience').value.trim();
    m.contentType = document.getElementById('ed-content').value.trim();
    m.availability = document.getElementById('ed-avail').value.trim();
    m.verified18 = verified;
    m.photo = newPhoto;
    m.photoType = newPhotoType;
    m.contract = newContract;
    m.filled = !!name;
    m.bio = {
      origin: document.getElementById('ed-bio-origin').value.trim(),
      nationality: document.getElementById('ed-bio-nationality').value.trim(),
      age: document.getElementById('ed-bio-age').value.trim(),
      bodyType: document.getElementById('ed-bio-bodytype').value.trim(),
      orientation: document.getElementById('ed-bio-orientation').value.trim(),
      lookingFor: document.getElementById('ed-bio-lookingfor').value.trim(),
      passions: document.getElementById('ed-bio-passions').value.trim(),
      universe: document.getElementById('ed-bio-universe').value.trim(),
      hobbies: document.getElementById('ed-bio-hobbies').value.trim(),
      personality: document.getElementById('ed-bio-personality').value.trim(),
      fantasies: document.getElementById('ed-bio-fantasies').value.trim(),
      fetish: document.getElementById('ed-bio-fetish').value.trim(),
      ambitions: document.getElementById('ed-bio-ambitions').value.trim(),
      discussionStyle: document.getElementById('ed-bio-discussionstyle').value.trim(),
      dreams: document.getElementById('ed-bio-dreams').value.trim(),
      fears: document.getElementById('ed-bio-fears').value.trim(),
      victories: document.getElementById('ed-bio-victories').value.trim(),
      challenges: document.getElementById('ed-bio-challenges').value.trim(),
      socials: document.getElementById('ed-bio-socials').value.trim(),
      workUrl: document.getElementById('ed-bio-workurl').value.trim(),
      status: document.getElementById('ed-bio-status').value,
      desirePercentages: readDesireBioPercentages()
    };

    const localOk = saveRoster();

    let cloudOk = true;
    try{
      await db.collection('profiles').doc(m.id).set({
        slotNumber: parseInt(m.id.replace('m',''), 10),
        name: m.name, ownerEmail: m.ownerEmail || '', country: m.country, verified18: m.verified18,
        platforms: m.platforms, audience: m.audience, contentType: m.contentType,
        availability: m.availability, photo: m.photo, photoType: m.photoType || 'image', contract: m.contract, filled: m.filled,
        bio: m.bio,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }catch(e){
      console.error('firestore save error', e);
      cloudOk = false;
    }

    saveBtn.disabled = false;
    if(localOk){
      closeEdit();
      renderRoster();
      toast(cloudOk ? t('savedToast') : (LANG==='fr' ? 'Enregistré ici, mais pas synchronisé en ligne — réessaie.' : 'Saved here, but not synced online — try again.'));
    }
  };

  document.getElementById('edit-backdrop').classList.add('open');
  document.getElementById('edit-modal').classList.add('open');
}
function closeEdit(){
  document.getElementById('edit-backdrop').classList.remove('open');
  document.getElementById('edit-modal').classList.remove('open');
  // Ferme aussi la session admin : la prochaine action d'édition redemandera le mot de passe.
  signedInAsAdmin = false;
  localAdminBypass = false;
  if(auth && auth.currentUser){ auth.signOut().catch(()=>{}); }
}
document.getElementById('edit-backdrop').onclick = closeEdit;
document.getElementById('edit-modal-close').onclick = closeEdit;

/* ---------------- media helpers (Firebase Storage + Firestore) ---------------- */
async function uploadMediaItem(profileId, file, kind, opts){
  opts = opts || {};
  const collectionName = opts.collection || 'media';
  const pathPrefix = opts.pathPrefix || (kind + 's');
  const url = await uploadToR2WithProgress(auth, file, pathPrefix + '/' + profileId, opts.onProgress);
  const docRef = await db.collection('profiles').doc(profileId).collection(collectionName).add(Object.assign(
    { kind, url, createdAt: firebase.firestore.FieldValue.serverTimestamp() },
    opts.extraFields || {}
  ));
  return { docId: docRef.id, url };
}
async function deleteMediaItem(profileId, docId, collectionName){
  await db.collection('profiles').doc(profileId).collection(collectionName || 'media').doc(docId).delete();
}

/* ---------------- gallery modal (admin) ---------------- */
/* ---------------- récupération sécurisée des membres visibles pour une créatrice -----------------
   IMPORTANT : Firestore refuse toute requête "collection().get()" qui ne peut pas prouver,
   par sa structure (un .where() correspondant à la règle), qu'elle ne renverra que des documents
   autorisés ("les règles ne sont pas des filtres"). On ne peut donc plus tout récupérer d'un coup :
   on combine des lectures ciblées (membres déjà connus : chat/suivi/favoris, via doc().get(), qui
   passent toujours car évaluées sur le contenu réel du document) avec deux requêtes filtrées sur
   bioVisibility / photosVisibility == 'everyone' (chacune valide une clause précise de la règle). */
async function fetchVisibleMembersForCreator(creatorId){
  let chatMemberIds = [];
  try{
    const convSnap = await db.collection('profiles').doc(creatorId).collection('conversations').get();
    chatMemberIds = convSnap.docs.map(d => d.id);
  }catch(e){ console.error('load chat member ids error', e); }

  let followingMembers = [], favoriteMembers = [];
  try{
    const creatorDoc = await db.collection('profiles').doc(creatorId).get();
    const cd = creatorDoc.exists ? creatorDoc.data() : {};
    followingMembers = cd.followingMembers || [];
    favoriteMembers = cd.favoriteMembers || [];
  }catch(e){ console.error('load creator following/favorites error', e); }

  const knownIds = Array.from(new Set([...chatMemberIds, ...followingMembers, ...favoriteMembers]));
  const byId = {};
  await Promise.all(knownIds.map(async (id) => {
    try{
      const doc = await memberDb.collection('members').doc(id).get();
      if(doc.exists) byId[id] = doc;
    }catch(e){ /* membre supprimé ou accès refusé : on ignore silencieusement */ }
  }));

  try{
    const bioSnap = await memberDb.collection('members').where('bioVisibility', '==', 'everyone').get();
    bioSnap.forEach(doc => { byId[doc.id] = doc; });
  }catch(e){ console.error('load bio-visible members error', e); }
  try{
    const photosSnap = await memberDb.collection('members').where('photosVisibility', '==', 'everyone').get();
    photosSnap.forEach(doc => { byId[doc.id] = doc; });
  }catch(e){ console.error('load photos-visible members error', e); }

  return { docs: Object.values(byId), chatMemberIds, followingMembers, favoriteMembers };
}

// Carte membre en accordéon : repliée par défaut (juste avatar + nom), la créatrice tape
// dessus pour dérouler la bio/photos/actions — indispensable dès qu'il y a beaucoup de
// membres (100, 1000…), une fiche entièrement dépliée pour chacun prendrait bien trop de place.
// Dictionnaire mots-clés → emoji pour habiller automatiquement la bio libre d'un membre
// (un seul emoji par mot-clé, sur sa première occurrence, pour ne pas surcharger le texte).
const BIO_EMOJI_MAP = [
  [/^(travel|traveling|travelling|traveler|traveller)$/i, '✈️'],
  [/^(music|musical)$/i, '🎵'],
  [/^(dance|dancing|dancer)$/i, '💃'],
  [/^(humor|humour|funny|jokes?|joking)$/i, '😄'],
  [/^(sport|sports|fitness|gym|workout)$/i, '💪'],
  [/^(food|cooking|cook|cuisine|foodie)$/i, '🍽️'],
  [/^(nature|hiking|hike|outdoor|outdoors)$/i, '🌿'],
  [/^(beach|sun|sunny|summer)$/i, '☀️'],
  [/^(party|partying|nightlife|club|clubbing)$/i, '🎉'],
  [/^(business|entrepreneur|entrepreneurship)$/i, '💼'],
  [/^(family)$/i, '👨\u200d👩\u200d👧'],
  [/^(pet|pets|dog|dogs|cat|cats)$/i, '🐾'],
  [/^(games?|gaming|gamer)$/i, '🎮'],
  [/^(love|romantic|romance)$/i, '❤️'],
  [/^(adventure|adventurous)$/i, '🧭'],
  [/^(art|painting|paint|creative|creativity)$/i, '🎨'],
  [/^(movies?|cinema|film|films)$/i, '🎬'],
  [/^(fashion|style|stylish)$/i, '👗'],
  [/^(energy|energetic)$/i, '⚡'],
  [/^(open[- ]?minded)$/i, '✨'],
  [/^(naughty|freaky|playful|flirty)$/i, '😏'],
  [/^(wine|drink|drinks|drinking)$/i, '🍷'],
  [/^(car|cars|driving)$/i, '🚗'],
  [/^(cool|outgoing|fun)$/i, '😎'],
  [/^(kind|sweet|caring)$/i, '🥰'],
  [/^(laugh|laughing|smile|smiling)$/i, '😁'],
  [/^(dream|dreams|dreaming)$/i, '🌙'],
  [/^(hobbies|hobby|passion|passions|passionate)$/i, '✨'],
  [/^(model|modeling)$/i, '📸'],
  [/^(spa|relax|relaxing)$/i, '🧖'],
  [/^(chat|chatting|talk|talking)$/i, '💬'],
  [/^(world)$/i, '🌍']
];

// Habille un texte libre d'emoji contextuels (un par mot-clé reconnu, une seule fois chacun),
// tout en échappant correctement le texte d'origine (voir escText).
function decorateBioWithEmojis(rawText){
  const used = new Set();
  return rawText.split(/(\s+)/).map(tok => {
    if(!tok || /^\s+$/.test(tok)) return escText(tok);
    const clean = tok.replace(/[^\p{L}]/gu, '');
    if(clean){
      for(const [re, emoji] of BIO_EMOJI_MAP){
        if(re.test(clean) && !used.has(emoji)){
          used.add(emoji);
          return escText(tok) + ' ' + emoji;
        }
      }
    }
    return escText(tok);
  }).join('');
}

// Mise en forme "dorée" de la biographie libre d'un membre, dans le même style visuel que la
// bio narrative de la créatrice (icône + libellé doré en majuscules + texte, emoji contextuels
// selon les mots employés) : utilisée à la fois côté créatrice et sur la page bio du membre lui-même.
function memberBioNarrativeHtml(bioText, label){
  return `<div class="bio-narrative"><p>${ICON_CHAT_SM}<span><b>${escText(label || t('memberBioNarrativeLabelOther'))}</b>${decorateBioWithEmojis(bioText)}</span></p></div>`;
}

function memberBioQuestionsNarrativeHtml(bq){
  const rows = [
    bq.hobbies ? [ICON_PALETTE, t('memberBioQCardHobbies'), bq.hobbies] : null,
    bq.passions ? [ICON_FLAME, t('memberBioQCardPassions'), bq.passions] : null,
    bq.dreams ? [ICON_MOON_STAR, t('memberBioQCardDreams'), bq.dreams] : null,
    bq.lookingFor ? [ICON_ENVELOPE_HEART, t('memberBioQCardLookingFor'), bq.lookingFor] : null,
    bq.discussionStyle ? [ICON_CHAT, t('memberBioQCardDiscussionStyle'), bq.discussionStyle] : null
  ].filter(Boolean);
  if(!rows.length) return '';
  return `<div class="bio-narrative">${rows.map(([icon, label, val]) =>
    `<p>${icon}<span><b>${escText(label)}</b>${decorateBioWithEmojis(val)}</span></p>`
  ).join('')}</div>`;
}
function memberViewCardHtml(r, actionsHtml){
  const bq = r.bioQuestions || {};
  const bqHtml = memberBioQuestionsNarrativeHtml(bq);
  return `
    <div class="member-view-card">
      <button type="button" class="member-view-toggle">
        ${r.photoURL ? `<img class="member-view-avatar" src="${escAttr(r.photoURL)}" loading="lazy" decoding="async">` : honeymoonLogoFallbackHtml('member-view-avatar')}
        <span class="member-view-name">${escText(r.username)} ${r.isFav ? '♥' : ''} ${r.hasChatted ? '💬' : ''} ${followerBadgeHtml(r.followersCount)}</span>
        <span class="member-view-chevron">›</span>
      </button>
      <div class="member-view-details">
        ${r.location ? `<div class="member-view-loc">${escText(r.location)}</div>` : ''}
        ${r.bio ? `
        <div class="member-card-section">
          <div class="member-card-section-title">${ICON_BIO}${t('memberCardSectionBio')}</div>
          <p class="member-card-bio-text">${decorateBioWithEmojis(r.bio)}</p>
        </div>` : ''}
        ${bqHtml ? `
        <div class="member-card-section">
          <div class="member-card-section-title">${ICON_USER}${t('memberCardSectionAbout')} ${escText(r.username)}</div>
          ${bqHtml}
        </div>` : ''}
        ${r.photos.length ? `
        <div class="member-card-section">
          <div class="member-card-section-title">${ICON_CAMERA}${t('memberCardSectionPhotos')}</div>
          <div class="member-media-grid">${r.photos.map(p => `<img class="member-view-photo" src="${escAttr(typeof p === 'string' ? p : (p.url || ''))}" data-full="${escAttr(typeof p === 'string' ? p : (p.url || ''))}" data-type="image" loading="lazy" decoding="async" style="cursor:pointer;">`).join('')}</div>
        </div>` : ''}
        ${actionsHtml || ''}
      </div>
    </div>`;
}
function wireMemberViewCardToggles(container){
  container.querySelectorAll('.member-view-toggle').forEach(btn => {
    btn.onclick = () => btn.closest('.member-view-card').classList.toggle('open');
  });
  // Clic sur une photo du membre (section "Photos" de la fiche) : ouvre la
  // photo en plein écran (lightbox), comme partout ailleurs sur le site.
  container.querySelectorAll('.member-view-photo').forEach(img => {
    img.onclick = (e) => {
      e.stopPropagation();
      openLightbox(img.dataset.full, img.dataset.type);
    };
  });
}
async function openMembersViewer(creatorId, creatorName){
  document.getElementById('members-viewer-title').textContent = t('membersViewerTitle') + (creatorName ? ' — ' + creatorName : '');
  const body = document.getElementById('members-viewer-body');
  body.innerHTML = `<span class="gallery-empty">${t('chatLoading')}</span>`;
  document.getElementById('members-viewer-backdrop').classList.add('open');
  document.getElementById('members-viewer-modal').classList.add('open');
  try{
    if(auth && !auth.currentUser){ try{ await auth.signInAnonymously(); }catch(e){} }
    if(memberAuth && !memberAuth.currentUser){ try{ await memberAuth.signInAnonymously(); }catch(e){} }
    const { docs: snapDocs, chatMemberIds } = await fetchVisibleMembersForCreator(creatorId);
    const rows = [];
    snapDocs.forEach(doc => {
      const d = doc.data() || {};
      const favorites = d.favorites || [];
      const isFav = favorites.includes(creatorId);
      const hasChatted = chatMemberIds.includes(doc.id);
      const bioVis = d.bioVisibility || (d.bioVisibleToCreator ? 'everyone' : 'nobody');
      const photosVis = d.photosVisibility || (d.photosVisibleToCreator ? 'everyone' : 'nobody');
      const bioOk = bioVis === 'everyone' || (bioVis === 'favorites' && isFav);
      const photosOk = photosVis === 'everyone' || (photosVis === 'favorites' && isFav);
      if(!bioOk && !photosOk && !isFav && !hasChatted) return;
      const followingMembers = d.followersOfCreators || [];
      rows.push({
        id: doc.id, username: d.username || t('nameUndefined'),
        photoURL: photosOk ? (d.photoURL || '') : '', location: d.location || '',
        bio: bioOk ? (d.bio || '') : '', bioQuestions: bioOk ? (d.bioQuestions || null) : null, photos: photosOk ? (d.photos || []) : [],
        isFav, hasChatted, followersCount: d.followersCount || 0
      });
    });
    if(rows.length === 0){
      body.innerHTML = `<span class="gallery-empty">${t('membersViewerEmpty')}</span>`;
      return;
    }
    body.innerHTML = rows.map(r => memberViewCardHtml(r,
      `<button type="button" class="follow-btn creator-follow-member-btn" data-uid="${r.id}">${t('followBtn')}</button>`
    )).join('');
    wireMemberViewCardToggles(body);
    // État initial des boutons "Suivre" (créatrice → membre).
    let followedByCreator = [];
    try{
      const creatorDoc = await db.collection('profiles').doc(creatorId).get();
      followedByCreator = (creatorDoc.exists && creatorDoc.data().followingMembers) || [];
    }catch(e){ console.error('load creator following list error', e); }
    body.querySelectorAll('.creator-follow-member-btn').forEach(btn => {
      const uid = btn.dataset.uid;
      const setState = (isFollowing) => {
        btn.classList.toggle('following', isFollowing);
        btn.textContent = isFollowing ? t('followingBtn') : t('followBtn');
      };
      let isFollowing = followedByCreator.includes(uid);
      setState(isFollowing);
      btn.onclick = async () => {
        btn.disabled = true;
        try{
          const creatorRef = db.collection('profiles').doc(creatorId);
          if(isFollowing){
            await creatorRef.set({ followingMembers: firebase.firestore.FieldValue.arrayRemove(uid) }, { merge: true });
          } else {
            await creatorRef.set({ followingMembers: firebase.firestore.FieldValue.arrayUnion(uid) }, { merge: true });
          }
          isFollowing = !isFollowing;
          setState(isFollowing);
        }catch(e){ console.error('creator follow member error', e); toast(t('memberErrUnknown')); }
        btn.disabled = false;
      };
    });
  }catch(e){
    console.error('openMembersViewer error', e);
    body.innerHTML = `<span class="gallery-empty">${(LANG==='fr'?'Erreur : ':'Error: ')}${escText(e.message||String(e))}</span>`;
  }
}
document.getElementById('members-viewer-close').onclick = () => {
  document.getElementById('members-viewer-backdrop').classList.remove('open');
  document.getElementById('members-viewer-modal').classList.remove('open');
};
document.getElementById('members-viewer-backdrop').onclick = () => document.getElementById('members-viewer-close').click();

function openGallery(id){
  const m = roster.find(x => x.id === id);
  renderGalleryBody(m);
  document.getElementById('gallery-backdrop').classList.add('open');
  document.getElementById('gallery-modal').classList.add('open');
}
function closeGallery(){
  document.getElementById('gallery-backdrop').classList.remove('open');
  document.getElementById('gallery-modal').classList.remove('open');
}
document.getElementById('gallery-backdrop').onclick = closeGallery;
document.getElementById('gallery-close').onclick = closeGallery;

function renderGalleryBody(m){
  const canEdit = editMode && isAdmin();
  const body = document.getElementById('gallery-body');

  const showcaseSection = (kind, labelKey, accept) => {
    const items = (m.showcaseMedia || []).filter(x => x.kind === kind);
    const thumbs = items.map(item => `
      <div class="gallery-thumb">
        ${kind === 'photo'
          ? `<img src="${item.url}" data-full="${item.url}" data-type="image" loading="lazy">`
          : `<video src="${item.url}" data-full="${item.url}" data-type="video" muted></video>`}
        ${canEdit ? `<button class="rm" data-showcase="${kind}" data-docid="${item.docId}">✕</button>` : ''}
      </div>`).join('');
    const addBtn = canEdit ? `
      <div class="gallery-add-btn">＋
        <input type="file" class="gal-add-showcase" data-showcase-kind="${kind}" accept="${accept}" multiple>
      </div>` : '';
    if(!items.length && !canEdit) return '';
    return `
      <div class="gallery-section">
        <h4>${t(labelKey)} (${items.length})</h4>
        <div class="gallery-strip">${thumbs}${addBtn}</div>
      </div>`;
  };

  const bio = m.bio || {};
  const infoRow = (labelKey, value) => value ? `
    <div class="vitrine-bio-row"><span class="k">${t(labelKey)}</span><span class="v">${escText(value)}</span></div>` : '';

  body.innerHTML = `
    <div class="room-tabs">
      <button class="room-tab-btn active" id="tab-btn-presentation">${t('showcaseTitle')}</button>
      <button class="room-tab-btn" id="tab-btn-bio">${t('bioSectionTitle')}</button>
    </div>

    <div class="room-tab-panel active" id="tab-panel-presentation">
      <p style="color:var(--text-muted);font-size:11.5px;margin:4px 0 12px;line-height:1.55;">${t('showcaseNote')}</p>
      ${showcaseSection('photo', 'showcasePhotoLabel', 'image/*')}
      ${showcaseSection('video_short', 'showcaseShortLabel', 'video/*')}
      ${showcaseSection('video_long', 'showcaseLongLabel', 'video/*')}
      ${(!(m.showcaseMedia||[]).length && !canEdit) ? `<p class="gallery-empty">${t('galleryEmpty')}</p>` : ''}
    </div>

    <div class="room-tab-panel" id="tab-panel-bio">
      ${bioNarrativeHtml(m, bio)}
    </div>

    <div class="modal-actions">
      <button class="btn btn-primary btn-sm" id="gal-sign-contract-btn" style="flex:1;">${ICON_SIGN} ${t('signContractBtn')}</button>
    </div>
  `;

  body.querySelectorAll('.gallery-thumb img, .gallery-thumb video').forEach(el => {
    el.onclick = () => openLightbox(el.dataset.full, el.dataset.type);
  });

  const tabPBtn = document.getElementById('tab-btn-presentation');
  const tabBBtn = document.getElementById('tab-btn-bio');
  tabPBtn.onclick = () => {
    tabPBtn.classList.add('active'); tabBBtn.classList.remove('active');
    document.getElementById('tab-panel-presentation').classList.add('active');
    document.getElementById('tab-panel-bio').classList.remove('active');
  };
  tabBBtn.onclick = () => {
    tabBBtn.classList.add('active'); tabPBtn.classList.remove('active');
    document.getElementById('tab-panel-bio').classList.add('active');
    document.getElementById('tab-panel-presentation').classList.remove('active');
  };

  document.getElementById('gal-sign-contract-btn').onclick = () => openContractSignModal(m);

  if(canEdit){
    body.querySelectorAll('.gal-add-showcase').forEach(input => {
      input.onchange = async (e) => {
        const kind = input.dataset.showcaseKind;
        const list = Array.from(e.target.files);
        for(const file of list){
          try{
            const item = await uploadMediaItem(m.id, file, kind === 'photo' ? 'photo' : 'video', {
              collection: 'showcase_media', pathPrefix: 'showcase/' + kind
            });
            m.showcaseMedia = m.showcaseMedia || [];
            m.showcaseMedia.push({ docId: item.docId, kind, url: item.url });
            toast(t('addedToast'));
          }catch(err){ console.error(err); toast(t('saveErrorToast')); }
        }
        renderGalleryBody(m);
      };
    });

    body.querySelectorAll('.rm').forEach(btn => {
      btn.onclick = async () => {
        const showcaseKind = btn.dataset.showcase;
        const docId = btn.dataset.docid;
        btn.disabled = true;
        try{
          await db.collection('profiles').doc(m.id).collection('showcase_media').doc(docId).delete();
          m.showcaseMedia = (m.showcaseMedia || []).filter(x => x.docId !== docId);
          renderGalleryBody(m);
          renderRoster();
          toast(t('removedToast'));
        }catch(e){
          toast(t('saveErrorToast'));
        }
      };
    });
  }
}

/* ================= ZONE D'AJOUT PHOTO/VIDÉO À DOUBLE CHOIX =================
   Affiche deux boutons distincts : "Prendre maintenant" (ouvre l'appareil
   photo/caméra directement) et "Importer un fichier" (ouvre la galerie).
   Utilisé partout où la créatrice ajoute une photo ou vidéo. */
function dualUploadZoneHtml(idPrefix, accept, opts){
  opts = opts || {};
  const multiple = opts.multiple ? 'multiple' : '';
  const kindClass = accept.indexOf('video') !== -1 ? 'dual-upload-video' : 'dual-upload-photo';
  return `
    <div class="dual-upload-zone ${kindClass}">
      <label class="dual-upload-btn">
        ${ICON_CAMERA}<span>${t('captureNowBtn')}</span>
        <input type="file" id="${idPrefix}-capture" accept="${accept}" capture="user">
      </label>
      <label class="dual-upload-btn">
        ${AICON.folder}<span>${t('importFileBtn')}</span>
        <input type="file" id="${idPrefix}-import" accept="${accept}" ${multiple}>
      </label>
    </div>
    <span id="${idPrefix}-filename" class="dual-upload-filename"></span>
  `;
}
function wireDualUpload(idPrefix, onFiles){
  const nameEl = document.getElementById(idPrefix + '-filename');
  const handle = (e) => {
    const files = e.target.files;
    if(!files || !files.length) return;
    nameEl.textContent = files.length > 1 ? `${files.length} ${t('filesSelected')}` : files[0].name;
    onFiles(files);
  };
  document.getElementById(idPrefix + '-capture').onchange = handle;
  document.getElementById(idPrefix + '-import').onchange = handle;
}

async function handleGalleryAdd(m, files, field, onDone){
  const kind = field === 'galleryPhotos' ? 'photo' : 'video';
  const list = Array.from(files);
  if(!list.length) return;
  for(const file of list){
    try{
      const item = await uploadMediaItem(m.id, file, kind);
      m[field].push(item);
      toast(t('addedToast'));
    }catch(e){
      console.error('media upload error', e);
      toast(t('saveErrorToast'));
    }
  }
  renderRoster();
  if(onDone) onDone();
}

/* ---------------- lightbox ---------------- */
function openLightbox(src, type, onDelete){
  const content = document.getElementById('lightbox-content');
  content.innerHTML = type === 'video'
    ? `<video src="${src}" controls autoplay playsinline></video>`
    : `<img src="${src}" loading="lazy" decoding="async">`;
  // Bouton supprimer optionnel (ex : "Mes photos" côté espace membre) — affiché
  // uniquement en plein écran, jamais sur la vignette elle-même, pour qu'on
  // identifie clairement la photo avant de la supprimer.
  const oldDelBtn = document.getElementById('lightbox-delete-btn');
  if(oldDelBtn) oldDelBtn.remove();
  if(onDelete){
    const delBtn = document.createElement('button');
    delBtn.id = 'lightbox-delete-btn';
    delBtn.type = 'button';
    delBtn.className = 'lightbox-delete-btn';
    delBtn.textContent = t('memberPhotoDeleteBtn');
    delBtn.onclick = () => {
      if(!confirm(t('memberPhotoDeleteConfirm'))) return;
      document.getElementById('lightbox-close').click();
      onDelete();
    };
    document.getElementById('lightbox-backdrop').appendChild(delBtn);
  }
  document.getElementById('lightbox-backdrop').style.display = 'flex';
}
document.getElementById('lightbox-close').onclick = () => {
  document.getElementById('lightbox-backdrop').style.display = 'none';
  document.getElementById('lightbox-content').innerHTML = '';
  const delBtn = document.getElementById('lightbox-delete-btn');
  if(delBtn) delBtn.remove();
};
document.getElementById('lightbox-backdrop').addEventListener('click', (e) => {
  if(e.target.id === 'lightbox-backdrop'){
    document.getElementById('lightbox-close').click();
  }
});

/* =========================================================
   VITRINE — site public (sans code d'accès)
   Lecture publique des "profiles" (déjà ouverte, voir
   syncProfilesFromFirestore). Vote (like/dislike) et
   commentaires publics, avec filtre anti-insultes basique
   côté navigateur avant tout envoi.
   ========================================================= */
document.getElementById('show-vitrine').onclick = () => { requireAgeGate(() => { window.location.hash = 'vitrine'; openVitrine(); }); };
document.getElementById('vitrine-back-btn').onclick = () => {
  window.location.hash = '';
  hideAllShells();
  document.getElementById('gate').style.display = 'flex';
};

/* ---------------- documents légaux (2257, CGU, confidentialité, prix) ---------------- */
const LEGAL_DOC_TITLE_KEY = {
  statement2257: 'legalDocTitle2257', terms: 'legalDocTitleTerms',
  privacy: 'legalDocTitlePrivacy', pricing: 'legalDocTitlePricing',
  rules: 'legalDocTitleRules'
};
function openLegalDoc(docKey, fromBurger){
  const docs = LEGAL_DOCS[LANG] || LEGAL_DOCS.en;
  document.getElementById('legal-modal-title').textContent = t(LEGAL_DOC_TITLE_KEY[docKey]);
  document.getElementById('legal-modal-body').textContent = docs[docKey] || '';
  document.getElementById('legal-back-btn').style.display = fromBurger ? 'flex' : 'none';
  document.getElementById('legal-backdrop').classList.add('open');
  document.getElementById('legal-modal').classList.add('open');
}
document.querySelectorAll('.legal-link-btn[data-doc]').forEach(btn => {
  btn.onclick = () => openLegalDoc(btn.dataset.doc, false);
});
document.getElementById('legal-back-btn').onclick = () => {
  document.getElementById('legal-modal-close').click();
  openBurgerMenu();
};
document.getElementById('legal-modal-close').onclick = () => {
  document.getElementById('legal-backdrop').classList.remove('open');
  document.getElementById('legal-modal').classList.remove('open');
};
document.getElementById('legal-backdrop').onclick = () => document.getElementById('legal-modal-close').click();

/* ---------------- signalement de contenu ---------------- */
function openReportModal(prefill, fromBurger){
  prefill = prefill || {};
  document.getElementById('report-back-btn').style.display = fromBurger ? 'flex' : 'none';
  const body = document.getElementById('report-modal-body');
  body.innerHTML = `
    <h3>${t('reportModalTitle')}</h3>
    <p style="color:var(--text-muted);font-size:12px;line-height:1.6;margin-bottom:14px;">${t('reportModalNote')}</p>
    <label>${t('reportWhichProfile')}</label>
    <input id="report-profile" placeholder="${t('reportWhichProfilePh')}" value="${escText(prefill.profile || '')}">
    <label>${t('reportReason')}</label>
    <select id="report-reason">
      <option value="minor">${t('reportReasonMinor')}</option>
      <option value="nonconsent">${t('reportReasonNonConsent')}</option>
      <option value="stolen">${t('reportReasonStolen')}</option>
      <option value="harassment">${t('reportReasonHarassment')}</option>
      <option value="scam">${t('reportReasonScam')}</option>
      <option value="impersonation">${t('reportReasonImpersonation')}</option>
      <option value="violence">${t('reportReasonViolence')}</option>
      <option value="spam">${t('reportReasonSpam')}</option>
      <option value="privacy">${t('reportReasonPrivacy')}</option>
      <option value="other">${t('reportReasonOther')}</option>
    </select>
    <label>${t('reportDetails')}</label>
    <textarea id="report-details" rows="4" placeholder="${t('reportDetailsPh')}">${escText(prefill.details || '')}</textarea>
    <label>${t('reportAttachment')}</label>
    <input id="report-file" type="file" accept="image/*,.pdf">
    <label>${t('reportContact')}</label>
    <input id="report-contact" placeholder="${t('reportContactPh')}">
    <div class="modal-actions">
      <button class="btn btn-ghost btn-sm" id="report-cancel" style="flex:1;">${t('cancel')}</button>
      <button class="btn btn-primary btn-sm" id="report-send" style="flex:1;">${t('reportSendBtn')}</button>
    </div>
  `;
  document.getElementById('report-cancel').onclick = closeReportModal;
  document.getElementById('report-send').onclick = async () => {
    const profile = document.getElementById('report-profile').value.trim();
    const reason = document.getElementById('report-reason').value;
    const details = document.getElementById('report-details').value.trim();
    const contact = document.getElementById('report-contact').value.trim();
    const fileInput = document.getElementById('report-file');
    const file = fileInput && fileInput.files && fileInput.files[0];
    if(!details){ toast(t('reportDetailsRequired')); return; }
    const btn = document.getElementById('report-send');
    btn.disabled = true;
    try{
      if(auth && !auth.currentUser){ try{ await auth.signInAnonymously(); }catch(e){} }
      let attachmentUrl = '';
      if(file){
        try{
          attachmentUrl = await uploadToR2(auth, file, 'reports');
        }catch(e){ console.error('report attachment upload error', e); }
      }
      if(db){
        await db.collection('content_reports').add({
          profile: profile.slice(0, 100), reason, details: details.slice(0, 1000),
          contact: contact.slice(0, 150), attachmentUrl,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          status: 'pending'
        });
      }
      try{
        if(typeof emailjs !== 'undefined' && EMAILJS_PUBLIC_KEY !== 'TON_EMAILJS_PUBLIC_KEY'){
          await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
            to_email: ADMIN_NOTIFY_EMAIL, subject: 'Honeymoon — Signalement de contenu',
            buyer_name: contact || 'Anonyme', buyer_contact: contact, creator_name: profile,
            item_desc: `[${reason}] ${details}${attachmentUrl ? '\n\nPièce jointe : ' + attachmentUrl : ''}`, price: '', ref: 'REPORT'
          });
        }
      }catch(e){ console.error('report emailjs error', e); }
      closeReportModal();
      toast(t('reportSentToast'));
    }catch(e){
      console.error('report submit error', e);
      toast((LANG==='fr' ? 'Erreur : ' : 'Error: ') + (e && e.message ? e.message : e));
    }
    btn.disabled = false;
  };
  document.getElementById('report-backdrop').classList.add('open');
  document.getElementById('report-modal').classList.add('open');
}
function closeReportModal(){
  document.getElementById('report-backdrop').classList.remove('open');
  document.getElementById('report-modal').classList.remove('open');
}
document.getElementById('report-back-btn').onclick = () => {
  closeReportModal();
  openBurgerMenu();
};
document.getElementById('private-access-link').onclick = () => {
  if(memberAuth && memberAuth.currentUser){ return; } // bloqué pour tout membre connecté, même en cas de clic malveillant
  openPrivateAccessGate();
};
document.getElementById('report-backdrop').onclick = closeReportModal;

/* ---------------- menu burger ---------------- */
let burgerClockInterval = null;
function updateBurgerClock(){
  const el = document.getElementById('burger-panel-clock');
  if(!el) return;
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const yy = now.getFullYear();
  el.textContent = `${hh}:${mm} · ${dd}/${mo}/${yy}`;
}
function openBurgerMenu(){
  document.getElementById('burger-backdrop').classList.add('open');
  document.getElementById('burger-panel').classList.add('open');
  updateBurgerClock();
  if(burgerClockInterval) clearInterval(burgerClockInterval);
  burgerClockInterval = setInterval(updateBurgerClock, 1000);
}
function closeBurgerMenu(){
  document.getElementById('burger-backdrop').classList.remove('open');
  document.getElementById('burger-panel').classList.remove('open');
  if(burgerClockInterval){ clearInterval(burgerClockInterval); burgerClockInterval = null; }
}
document.getElementById('burger-menu-btn').onclick = openBurgerMenu;
document.getElementById('burger-close-btn').onclick = closeBurgerMenu;
document.getElementById('burger-backdrop').onclick = closeBurgerMenu;
const vitrineHeroCtaBtn = document.getElementById('vitrine-hero-cta');
if(vitrineHeroCtaBtn) vitrineHeroCtaBtn.onclick = openBurgerMenu;

document.getElementById('burger-home').onclick = () => {
  closeBurgerMenu();
  window.location.hash = '';
  requireAgeGate(() => openVitrine());
};
function showComingSoon(titleKey, bodyKey){
  closeBurgerMenu();
  document.getElementById('soon-title').textContent = t(titleKey);
  document.getElementById('soon-body').textContent = t(bodyKey);
  document.getElementById('soon-backdrop').classList.add('open');
  document.getElementById('soon-modal').classList.add('open');
}
document.getElementById('burger-become-member').onclick = () => openMemberModal();
document.getElementById('burger-apply-model').onclick = () => openApplyModal();

/* ================= ESPACE MEMBRE (compte gratuit, vrai email Firebase Auth) ================= */
function escAttr(s){ return String(s == null ? '' : s).replace(/"/g, '&quot;'); }
function isValidEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function isValidUsername(v){ return /^[a-zA-Z0-9._-]{3,20}$/.test(v); }

function openMemberModal(initialTab){
  closeBurgerMenu();
  hideAllShells();
  document.getElementById('member-shell').style.display = 'block';
  if(typeof updateTopbarHeight === 'function') setTimeout(updateTopbarHeight, 0);
  if(typeof updateBottomNavVisibility === 'function') setTimeout(updateBottomNavVisibility, 0);
  if(!memberAuth){
    renderMemberError(t('memberErrNoConnection'));
    return;
  }
  const u = memberAuth.currentUser;
  // Une session anonyme (utilisée en interne, ex. affichage côté créatrice) ne compte
  // jamais comme un vrai compte membre inscrit — sinon un visiteur peut se retrouver
  // directement sur le tableau de bord membre sans jamais s'être inscrit.
  if(!u || u.isAnonymous){ renderMemberLogin(); return; }
  // Affichage immédiat avec la session déjà en mémoire côté téléphone — plus d'attente
  // réseau à chaque ouverture. La vérification auprès de Firebase (utile si le compte a
  // été désactivé/supprimé entre-temps) se fait ensuite en arrière-plan, sans bloquer.
  loadMemberHome(u, initialTab);
  u.reload().then(() => {
    const cu = memberAuth.currentUser;
    if(!cu || cu.isAnonymous){ renderMemberLogin(); }
  }).catch((err) => {
    console.error('member session reload error (ignoré, session locale conservée)', err);
  });
}
// "Fermer" l'espace membre = revenir parcourir la vitrine publique (le membre reste
// connecté, seule la page affichée change — cohérent avec le bouton "Discover" des onglets).
function closeMemberModal(){
  memberActiveTab = null;
  openVitrine();
}
function renderMemberError(msg){
  document.getElementById('member-modal-body').innerHTML = `
    <h3>${t('memberLoginTitle')}</h3>
    <p class="member-note">${escText(msg)}</p>
    <div class="modal-actions"><button class="btn btn-primary btn-sm" id="member-error-close" style="flex:1;">${t('galleryClose')}</button></div>
  `;
  document.getElementById('member-error-close').onclick = closeMemberModal;
}
const ICON_EYE_OPEN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICON_EYE_OFF = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.6 20.6 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a20.6 20.6 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
function memberPassField(id, labelKey, phKey){
  return `
    <label>${t(labelKey)}</label>
    <div class="member-pass-wrap">
      <input id="${id}" type="password" placeholder="${escAttr(t(phKey))}" autocomplete="new-password">
      <button type="button" class="member-eye-toggle" data-target="${id}">${ICON_EYE_OPEN}</button>
    </div>
  `;
}
function wireEyeToggles(root){
  root.querySelectorAll('.member-eye-toggle').forEach(btn => {
    btn.onclick = () => {
      const inp = document.getElementById(btn.dataset.target);
      if(!inp) return;
      const hidden = inp.type === 'password';
      inp.type = hidden ? 'text' : 'password';
      btn.innerHTML = hidden ? ICON_EYE_OFF : ICON_EYE_OPEN;
    };
  });
}

function renderMemberLogin(){
  const body = document.getElementById('member-modal-body');
  body.innerHTML = `
    <button type="button" id="member-login-back" style="background:none;border:none;color:var(--text-muted);font-size:13px;cursor:pointer;padding:0 0 10px;text-align:left;">${t('memberBackToSite')}</button>
    <span class="member-badge">🔓 ${t('memberFreeBadge')}</span>
    <h3>${t('memberLoginTitle')}</h3>
    <label>${t('memberIdentifierLabel')}</label>
    <input id="member-login-id" placeholder="${escAttr(t('memberIdentifierPh'))}" autocomplete="username" value="${isLocalTestEnvironment() ? escAttr(LOCAL_TEST_EMAIL) : ''}">
    ${memberPassField('member-login-pass', 'memberPasswordLabel', 'memberPasswordLoginPh')}
    <div class="member-err" id="member-login-err"></div>
    <div class="modal-actions">
      <button class="btn btn-primary btn-sm" id="member-login-submit" style="flex:1;">${t('memberLoginBtn')}</button>
    </div>
    <button type="button" class="member-forgot-link" id="member-forgot-link">${t('memberForgotLink')}</button>
    <div class="member-switch-row">${t('memberNoAccount')} <button type="button" id="member-go-signup">${t('memberCreateOne')}</button></div>
  `;
  wireEyeToggles(body);
  document.getElementById('member-login-back').onclick = closeMemberModal;
  document.getElementById('member-go-signup').onclick = renderMemberSignup;
  document.getElementById('member-forgot-link').onclick = renderMemberForgot;
  const submit = document.getElementById('member-login-submit');
  const doLogin = () => memberLoginSubmit();
  submit.onclick = doLogin;
  body.querySelectorAll('input').forEach(inp => inp.addEventListener('keydown', e => { if(e.key === 'Enter') doLogin(); }));
}

async function memberLoginSubmit(){
  const errEl = document.getElementById('member-login-err');
  errEl.textContent = '';
  const idRaw = document.getElementById('member-login-id').value.trim();
  let pass = document.getElementById('member-login-pass').value;
  // TEST LOCAL UNIQUEMENT : "1988" est trop court pour Firebase (min. 6 caractères) —
  // en local, on le remplace automatiquement par le vrai mot de passe du compte de test.
  if(isLocalTestEnvironment() && idRaw === LOCAL_TEST_EMAIL && pass === LOCAL_TEST_CODE){
    pass = LOCAL_TEST_MEMBER_REAL_PASSWORD;
  }
  if(!idRaw || !pass){ errEl.textContent = t('memberErrFillAll'); return; }
  const btn = document.getElementById('member-login-submit');
  btn.disabled = true;
  try{
    let email = idRaw;
    if(!idRaw.includes('@')){
      if(!memberAuth.currentUser){ try{ await memberAuth.signInAnonymously(); }catch(e){} }
      const unameDoc = await memberDb.collection('usernames').doc(idRaw.toLowerCase()).get();
      if(!unameDoc.exists){ errEl.textContent = t('memberErrLoginFailed'); btn.disabled = false; return; }
      email = unameDoc.data().email;
    }
    const cred = await memberAuth.signInWithEmailAndPassword(email, pass);
    const user = cred.user;
    await user.reload();
    refreshMemberBadgeFromSession();
    toast(t('memberLoggedInToast'));
    await loadMemberHome(memberAuth.currentUser);
  }catch(e){
    console.error('member login error', e);
    if(e.code === 'auth/invalid-email') errEl.textContent = t('memberErrInvalidEmail');
    else if(e.code === 'auth/user-not-found' || e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') errEl.textContent = t('memberErrLoginFailed');
    else errEl.textContent = t('memberErrUnknown') + ' (' + (e.code || e.message || e) + ')';
  }
  btn.disabled = false;
}

function renderMemberSignup(){
  const body = document.getElementById('member-modal-body');
  body.innerHTML = `
    <button type="button" id="member-signup-back" style="background:none;border:none;color:var(--text-muted);font-size:13px;cursor:pointer;padding:0 0 10px;text-align:left;">${t('memberBackToSite')}</button>
    <span class="member-badge">🔓 ${t('memberFreeBadge')}</span>
    <h3>${t('memberSignupTitle')}</h3>
    <p class="member-welcome-line">${t('memberSignupLine')}</p>
    <label>${t('memberUsernameLabel')}</label>
    <input id="member-su-username" placeholder="${escAttr(t('memberUsernamePh'))}" autocomplete="username" maxlength="20">
    <label>${t('memberEmailLabel')}</label>
    <input id="member-su-email" type="email" placeholder="${escAttr(t('memberEmailPh'))}" autocomplete="email">
    ${memberPassField('member-su-pass', 'memberPasswordLabel', 'memberPasswordPh')}
    ${memberPassField('member-su-pass2', 'memberConfirmPasswordLabel', 'memberConfirmPasswordPh')}
    <div class="member-err" id="member-su-err"></div>
    <div class="modal-actions">
      <button class="btn btn-primary btn-sm" id="member-su-submit" style="flex:1;">${t('memberSignupBtn')}</button>
    </div>
    <div class="member-switch-row">${t('memberHaveAccount')} <button type="button" id="member-go-login">${t('memberLoginInstead')}</button></div>
  `;
  wireEyeToggles(body);
  document.getElementById('member-signup-back').onclick = closeMemberModal;
  document.getElementById('member-go-login').onclick = renderMemberLogin;
  const submit = document.getElementById('member-su-submit');
  submit.onclick = memberSignupSubmit;
  body.querySelectorAll('input').forEach(inp => inp.addEventListener('keydown', e => { if(e.key === 'Enter') memberSignupSubmit(); }));
}

async function memberSignupSubmit(){
  const errEl = document.getElementById('member-su-err');
  errEl.textContent = '';
  const username = document.getElementById('member-su-username').value.trim();
  const email = document.getElementById('member-su-email').value.trim();
  const pass = document.getElementById('member-su-pass').value;
  const pass2 = document.getElementById('member-su-pass2').value;
  if(!username || !email || !pass || !pass2){ errEl.textContent = t('memberErrFillAll'); return; }
  if(!isValidUsername(username)){ errEl.textContent = t('memberErrUsernameFormat'); return; }
  if(!isValidEmail(email)){ errEl.textContent = t('memberErrInvalidEmail'); return; }
  if(pass.length < 6){ errEl.textContent = t('memberErrPassShort'); return; }
  if(pass !== pass2){ errEl.textContent = t('memberErrPassMismatch'); return; }
  if(!memberAuth || !memberDb){ errEl.textContent = t('memberErrNoConnection'); return; }
  const btn = document.getElementById('member-su-submit');
  btn.disabled = true;
  const usernameLower = username.toLowerCase();
  let createdUser = null;
  try{
    // 1) Créer le compte d'authentification en premier : cette étape ne dépend pas des règles Firestore.
    const cred = await memberAuth.createUserWithEmailAndPassword(email, pass);
    createdUser = cred.user;
    // 2) Une fois authentifié, on peut lire/écrire Firestore (règles "request.auth != null").
    const existing = await memberDb.collection('usernames').doc(usernameLower).get();
    if(existing.exists){
      errEl.textContent = t('memberErrUsernameTaken');
      try{ await createdUser.delete(); }catch(delErr){ console.error('rollback delete user failed', delErr); }
      btn.disabled = false;
      return;
    }
    try{ await createdUser.updateProfile({ displayName: username }); }catch(e){}
    try{ await createdUser.sendEmailVerification(); }catch(e){ console.error('sendEmailVerification error', e); }
    await memberDb.collection('usernames').doc(usernameLower).set({ uid: createdUser.uid, email });
    await memberDb.collection('members').doc(createdUser.uid).set({
      username, usernameLower, email, photoURL: '', location: '', bio: '', bioVisibleToCreator: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    toast(t('memberSignupSuccessToast'));
    await loadMemberHome(createdUser);
  }catch(e){
    console.error('member signup error', e);
    if(e.code === 'auth/email-already-in-use') errEl.textContent = t('memberErrEmailInUse');
    else if(e.code === 'auth/invalid-email') errEl.textContent = t('memberErrInvalidEmail');
    else if(e.code === 'auth/weak-password') errEl.textContent = t('memberErrWeakPass');
    else errEl.textContent = t('memberErrUnknown') + ' (' + (e.code || e.message || e) + ')';
  }
  btn.disabled = false;
}

async function loadMemberHome(user, initialTab){
  let data = { username: user.displayName || '', email: user.email || '', photoURL: '', location: '', lat: null, lng: null, bio: '', bioVisibleToCreator: false, photos: [], photosVisibleToCreator: false, favorites: [] };
  try{
    const doc = await memberDb.collection('members').doc(user.uid).get();
    if(doc.exists) data = Object.assign(data, doc.data());
    // Auto-réparation : si le pseudo n'est pas dans le document (ancien bug de règles Firestore) mais existe sur le compte Auth, on le restaure.
    if(!data.username && user.displayName){
      data.username = user.displayName;
      memberDb.collection('members').doc(user.uid).set({ username: user.displayName, usernameLower: user.displayName.toLowerCase() }, { merge: true }).catch(() => {});
    }
    if(!data.favorites) data.favorites = [];
    if(!data.photos) data.photos = [];
  }catch(e){ console.error('load member doc error', e); }
  renderMemberHome(user, data, initialTab || 'profile');
}

function memberUnverifiedBannerHtml(user){
  if(user.emailVerified) return '';
  return `
    <div class="member-banner-warn">
      <span>${t('memberUnverifiedBanner').replace('{email}', escText(user.email || ''))}</span>
      <button type="button" id="member-resend-banner">${t('memberResendShort')}</button>
    </div>
  `;
}
function wireUnverifiedBanner(){
  const btn = document.getElementById('member-resend-banner');
  if(!btn) return;
  btn.onclick = async () => {
    const u = memberAuth.currentUser;
    if(!u) return;
    btn.disabled = true;
    try{ await u.sendEmailVerification(); btn.textContent = t('memberResentShort'); }
    catch(e){ console.error('resend verification error', e); toast(t('memberErrUnknown')); btn.disabled = false; }
  };
}

function renderMemberHome(user, data, activeTab){
  activeTab = activeTab || 'profile';
  const body = document.getElementById('member-modal-body');
  const skeletonAlreadyBuilt = body.dataset.memberHomeBuilt === user.uid;

  if(!skeletonAlreadyBuilt){
    const photoBlock = data.photoURL
      ? `<div class="my-profile-photo"><img src="${escAttr(data.photoURL)}" loading="lazy" decoding="async"></div>`
      : `<div class="my-profile-photo home-photo-slot-empty">
           <span class="home-video-icon">${ICON_USER}</span>
           <span class="home-video-label">${t('noPhotoYet')}</span>
         </div>`;
    body.innerHTML = `
      <span class="member-badge">✅ ${t('memberFreeBadge')}</span>
      ${memberUnverifiedBannerHtml(user)}
      <div style="text-align:center;">
        <div class="home-photo-row">${photoBlock}</div>
        <div class="member-home-quickrow">
          <select class="lang-select" id="member-lang-select"></select>
          <button class="btn btn-ghost btn-sm" id="member-home-logout">${t('memberHomeLogout')}</button>
        </div>
        <h3>${t('memberHomeWelcome').replace('{username}', escText(data.username || ''))}</h3>
        <p class="member-welcome-line" style="margin-left:auto;margin-right:auto;">${t('memberHomeWelcomeLine')}</p>
      </div>
      <div class="popularity-hero">
        <div class="tiktok-stat"><span class="tiktok-stat-num">${(data.favorites || []).length}</span><span class="tiktok-stat-label">${t('followingLabel')}</span></div>
        <div class="tiktok-stat"><span class="tiktok-stat-num">${data.followersCount || 0}</span><span class="tiktok-stat-label">${t('followersLabel')}</span></div>
        <div class="tiktok-stat">${uxdShieldGreyHtml(data.uxd)}<span class="tiktok-stat-label">${t('uxdLabel')}</span></div>
      </div>
      <div class="tabs-slide-row">
        <div class="member-tabs">
          <button type="button" class="member-tab" id="member-tab-discover">${ICON_DISCOVER_PREMIUM}${t('memberTabDiscover')}</button>
          <button type="button" class="member-tab" id="member-tab-popularity">${ICON_STAR}${t('myFamilyPopularity')}</button>
          <button type="button" class="member-tab" id="member-tab-profile">${ICON_USER}${t('memberTabProfile')}</button>
          <button type="button" class="member-tab" id="member-tab-seducer">${ICON_HEART_SM} ${t('memberTabSeducerProfile')}</button>
          <button type="button" class="member-tab" id="member-tab-favorites">${ICON_LIKE}${t('memberTabFavorites')}</button>
          <button type="button" class="member-tab" id="member-tab-messages">${ICON_CHAT_SM}${t('memberTabMessages')} <span class="member-tab-badge" id="member-tab-messages-badge" style="display:none;"></span></button>
          <button type="button" class="member-tab" id="member-tab-purchases">${ICON_CART}${t('memberTabPurchases')}</button>
          <button type="button" class="member-tab" id="member-tab-tools">${ICON_MY_TOOLS}${t('memberTabTools')}</button>
        </div>
      </div>
      <div id="member-tab-body"></div>
    `;
    wireUnverifiedBanner();
    document.getElementById('member-home-logout').onclick = memberLogout;
    document.getElementById('member-tab-discover').onclick = () => closeMemberModal();
    populateLangSelects();
    syncLangSelects(LANG);
    document.getElementById('member-lang-select').onchange = (e) => setMemberLang(e.target.value, user);
    ['popularity', 'profile', 'seducer', 'favorites', 'messages', 'purchases', 'tools'].forEach(name => {
      document.getElementById('member-tab-' + name).onclick = () => switchMemberTab(user, data, name);
    });
    updateTopbarMemberBadge(data.username);
    body.dataset.memberHomeBuilt = user.uid;
  }

  switchMemberTab(user, data, activeTab);
  prefetchMemberTabs(user, data);
}

function switchMemberTab(user, data, activeTab){
  memberActiveTab = activeTab;
  ['popularity', 'profile', 'seducer', 'favorites', 'messages', 'purchases', 'tools'].forEach(name => {
    const btn = document.getElementById('member-tab-' + name);
    if(btn) btn.classList.toggle('active', name === activeTab);
  });
  // L'animation d'entrée est déclenchée à l'intérieur de chaque fonction de rendu
  // (via paintTabBody), au moment exact où le vrai contenu apparaît — pas ici,
  // sinon elle joue sur "Chargement…" et le vrai contenu apparaît ensuite sans
  // transition (c'était la cause du côté "saccadé"/pas homogène d'un onglet à l'autre).
  if(activeTab === 'purchases') renderMemberPurchasesTab(user, data);
  else if(activeTab === 'favorites') renderMemberFavoritesTab(user, data);
  else if(activeTab === 'messages') renderMemberMessagesTab(user, data);
  else if(activeTab === 'popularity') renderMemberPopularityTab(user, data);
  else if(activeTab === 'tools') renderMemberToolsTab(user, data);
  else if(activeTab === 'seducer') renderMemberSeducerProfileTab(user, data);
  else renderMemberProfileTab(user, data);
}

/* ================================================================
   PROFIL SÉDUCTEUR — nouvel onglet membre (menu principal, à côté de "Profile").
   10 thèmes × 7 questions, 1 question/jour, 4 réponses pondérées en % →
   résultat = tableau de % par thème (1 thème complété = 10% du profil).
   Stocké dans data.desireProfile (Firestore members/{uid}), visible plus
   tard côté créatrice (même 10 thèmes dans sa bio — logique séparée).
   ================================================================ */

// Banque de questions par thème — 70 questions (10 thèmes × 7), en anglais,
// avec emoji sur chaque question et chaque réponse.
const DESIRE_QUESTION_BANK = {
  flirt: [
    { q: "😘 Your flirting style is more:", choices: [
      { label: '👀 A playful, teasing look', value: 90 },
      { label: '💬 Witty, flirty texts', value: 100 },
      { label: '😏 Slow and mysterious', value: 70 },
      { label: '🔥 Bold and direct', value: 85 },
    ]},
    { q: "💋 A flirty message you'd send first:", choices: [
      { label: '😉 A cheeky compliment', value: 90 },
      { label: '❓ A playful question', value: 100 },
      { label: '📸 A fun selfie', value: 70 },
      { label: '🎯 Something bold, straight to the point', value: 85 },
    ]},
    { q: "🌶️ Your ideal flirty banter is:", choices: [
      { label: '😂 Full of jokes and teasing', value: 100 },
      { label: '🔥 Charged with tension', value: 90 },
      { label: '🎭 Full of double meanings', value: 80 },
      { label: '🍯 Sweet and gentle', value: 60 },
    ]},
    { q: "😏 When someone flirts back, you:", choices: [
      { label: '🚀 Go all in immediately', value: 100 },
      { label: '😌 Keep it cool and let it build', value: 80 },
      { label: '😅 Get shy but love it', value: 60 },
      { label: '🔁 Match their energy exactly', value: 90 },
    ]},
    { q: "💌 Your favorite way to flirt long-distance:", choices: [
      { label: '📱 Playful texting all day', value: 100 },
      { label: '🎙️ Voice notes with a teasing tone', value: 90 },
      { label: '📸 Sending flirty photos', value: 80 },
      { label: '🎥 Video calls with lots of eye contact', value: 85 },
    ]},
    { q: "🎯 What makes flirting exciting for you:", choices: [
      { label: '🎲 The unpredictability', value: 100 },
      { label: '🔥 The tension building up', value: 95 },
      { label: '😂 The fun and laughter', value: 85 },
      { label: '👀 The eye contact', value: 80 },
    ]},
    { q: "🌙 Late-night flirty texts, you're:", choices: [
      { label: '🔥 Always up for it', value: 100 },
      { label: '😏 Depends on the mood', value: 75 },
      { label: '💤 Rarely, you prefer daytime', value: 40 },
      { label: '🎭 Love the mystery of it', value: 85 },
    ]},
  ],
  playful: [
    { q: "🎈 Your playful side comes out mostly when:", choices: [
      { label: '😄 Teasing someone you like', value: 100 },
      { label: '🎮 Playing games together', value: 85 },
      { label: '😂 Making inside jokes', value: 95 },
      { label: '🤪 Being silly in public', value: 70 },
    ]},
    { q: "🙃 A playful way you show you like someone:", choices: [
      { label: '😝 Teasing them gently', value: 100 },
      { label: '🎁 Surprising them with something fun', value: 85 },
      { label: '💌 Sending silly memes', value: 90 },
      { label: '🤭 Playful nicknames', value: 95 },
    ]},
    { q: "🎭 During a chat, you love to:", choices: [
      { label: '😏 Tease and joke around', value: 100 },
      { label: '🎲 Keep things unpredictable', value: 90 },
      { label: '😂 Make them laugh out loud', value: 95 },
      { label: '💬 Talk about anything and everything', value: 70 },
    ]},
    { q: "🐾 Your playful energy is more:", choices: [
      { label: '⚡ High and spontaneous', value: 100 },
      { label: '😌 Chill but mischievous', value: 85 },
      { label: '🎨 Creative and silly', value: 90 },
      { label: '🎯 Sharp and witty', value: 80 },
    ]},
    { q: "🎉 A playful date idea for you:", choices: [
      { label: '🎳 Something competitive and fun', value: 90 },
      { label: '🎮 Game night', value: 100 },
      { label: '🎡 An amusement park', value: 85 },
      { label: '🎲 A silly challenge or dare', value: 95 },
    ]},
    { q: "😜 When you're comfortable with someone, you:", choices: [
      { label: '🤪 Get goofy and silly', value: 100 },
      { label: '😏 Tease them nonstop', value: 95 },
      { label: '🎭 Do impressions and jokes', value: 85 },
      { label: '🫶 Show your soft playful side', value: 80 },
    ]},
    { q: "🦋 Playfulness in a relationship means:", choices: [
      { label: '😂 Never taking things too seriously', value: 100 },
      { label: '🎈 Keeping the spark alive with fun', value: 95 },
      { label: '🎲 Surprising each other often', value: 90 },
      { label: '💞 Laughing together every day', value: 100 },
    ]},
  ],
  talkative: [
    { q: "🗨️ In a conversation, you're usually:", choices: [
      { label: '🎤 The one leading the talk', value: 100 },
      { label: '😄 Chatty and full of stories', value: 95 },
      { label: '🔁 Back-and-forth, equal talking', value: 80 },
      { label: '👂 More of a listener', value: 40 },
    ]},
    { q: "📞 On a call, you tend to:", choices: [
      { label: '🗣️ Talk non-stop about everything', value: 100 },
      { label: '😂 Fill silences with jokes', value: 90 },
      { label: '💬 Keep a steady, easy conversation', value: 80 },
      { label: '🤫 Let the other person lead', value: 40 },
    ]},
    { q: "💬 Texting-wise, you're:", choices: [
      { label: '⚡ Fast replies, long messages', value: 100 },
      { label: '🎙️ Prefer voice notes', value: 90 },
      { label: '😄 Short but frequent messages', value: 85 },
      { label: '🐢 Slow but thoughtful replies', value: 50 },
    ]},
    { q: "🎉 At a party, you're the one who:", choices: [
      { label: '🎤 Keeps the conversation going', value: 100 },
      { label: '😂 Tells all the stories', value: 95 },
      { label: '🙋 Jumps in with jokes and comments', value: 85 },
      { label: '👀 Prefers listening in small groups', value: 40 },
    ]},
    { q: "🌍 Your ideal conversation topic:", choices: [
      { label: '🎢 Anything, you can talk about everything', value: 100 },
      { label: '😂 Fun stories and adventures', value: 90 },
      { label: '💭 Deep, meaningful topics', value: 85 },
      { label: '🎯 Whatever the other person wants', value: 70 },
    ]},
    { q: "📱 A typical text exchange with you looks like:", choices: [
      { label: '💬 Paragraphs and lots of details', value: 100 },
      { label: '🎭 Playful back-and-forth teasing', value: 90 },
      { label: '📸 Mixed with photos and voice notes', value: 85 },
      { label: '✅ Short and to the point', value: 50 },
    ]},
    { q: "🔊 People would describe you as:", choices: [
      { label: '🗣️ Talkative and expressive', value: 100 },
      { label: '😄 Fun to talk to for hours', value: 95 },
      { label: '💬 Easy to chat with', value: 85 },
      { label: '🤐 More reserved, quiet', value: 30 },
    ]},
  ],
  humor: [
    { q: "😂 Your sense of humor is more:", choices: [
      { label: '🎭 Sarcastic and witty', value: 100 },
      { label: '🤪 Goofy and silly', value: 90 },
      { label: '😏 Dry and deadpan', value: 85 },
      { label: '📖 Storytelling and anecdotes', value: 80 },
    ]},
    { q: "🃏 What makes you laugh the most:", choices: [
      { label: '😂 Clever wordplay', value: 100 },
      { label: '🤡 Silly, over-the-top jokes', value: 90 },
      { label: '😏 Sarcasm and teasing', value: 95 },
      { label: '📹 Funny videos and memes', value: 80 },
    ]},
    { q: "🎤 In a group, you're the one who:", choices: [
      { label: '😂 Makes everyone laugh', value: 100 },
      { label: '🎭 Delivers the best one-liners', value: 90 },
      { label: '🤣 Laughs the loudest at others', value: 80 },
      { label: '😌 Enjoys the humor quietly', value: 60 },
    ]},
    { q: "💬 Your texting humor style:", choices: [
      { label: '😂 Memes and GIFs constantly', value: 100 },
      { label: '🎭 Witty comebacks', value: 95 },
      { label: '🤪 Silly voice notes', value: 85 },
      { label: '😏 Sarcastic one-liners', value: 90 },
    ]},
    { q: "🏆 A perfect joke, for you, is:", choices: [
      { label: '⚡ Quick and unexpected', value: 100 },
      { label: '🎭 Clever and layered', value: 95 },
      { label: '🤪 Absurd and ridiculous', value: 90 },
      { label: '😏 Subtle and dry', value: 85 },
    ]},
    { q: "😄 Humor in a relationship should be:", choices: [
      { label: '💞 A daily thing, non-stop jokes', value: 100 },
      { label: '🎯 Used to break tension', value: 85 },
      { label: '🎭 Shared inside jokes', value: 95 },
      { label: '😏 Light teasing here and there', value: 80 },
    ]},
    { q: "🎬 Your go-to way to make someone laugh:", choices: [
      { label: '🎭 A funny impression', value: 90 },
      { label: '😂 A well-timed joke', value: 100 },
      { label: '📸 A ridiculous photo or meme', value: 85 },
      { label: '🤭 Teasing them playfully', value: 95 },
    ]},
  ],
  seduction: [
    { q: "🎯 Your seduction style is more:", choices: [
      { label: '🔥 Bold and straightforward', value: 100 },
      { label: '🕯️ Subtle and mysterious', value: 90 },
      { label: '😏 Playful and teasing', value: 95 },
      { label: '🧠 Slow, through conversation', value: 80 },
    ]},
    { q: "✨ What makes you irresistible, you think:", choices: [
      { label: '👀 Your gaze', value: 100 },
      { label: '😏 Your confidence', value: 95 },
      { label: '💬 Your words', value: 90 },
      { label: '🎭 Your mystery', value: 85 },
    ]},
    { q: "🌹 A seductive first move for you:", choices: [
      { label: '😘 A bold compliment', value: 95 },
      { label: '👁️ Holding eye contact a beat too long', value: 100 },
      { label: '🎁 A thoughtful surprise', value: 85 },
      { label: '🔥 A daring invitation', value: 90 },
    ]},
    { q: "💃 You seduce best when you're:", choices: [
      { label: '😌 Completely relaxed and yourself', value: 100 },
      { label: '🔥 Fully in the moment', value: 95 },
      { label: '🎭 A little mysterious', value: 85 },
      { label: '😂 Making them laugh', value: 90 },
    ]},
    { q: "🕯️ Your ideal seductive atmosphere:", choices: [
      { label: '🍷 Candlelight and low music', value: 100 },
      { label: '🌃 A rooftop at night', value: 90 },
      { label: '🛁 Something cozy and intimate', value: 95 },
      { label: '🎶 Wherever the energy feels right', value: 80 },
    ]},
    { q: "😏 When you want someone's attention, you:", choices: [
      { label: '👗 Dress to impress', value: 90 },
      { label: '💬 Say something unexpected', value: 100 },
      { label: '👀 Let your body language speak', value: 95 },
      { label: '🎯 Go straight for it', value: 85 },
    ]},
    { q: "🔑 Real seduction, to you, is mostly about:", choices: [
      { label: '🧠 Confidence', value: 100 },
      { label: '🎭 Mystery', value: 90 },
      { label: '💬 Connection', value: 95 },
      { label: '🔥 Chemistry', value: 90 },
    ]},
  ],
  travel: [
    { q: "✈️ Your ideal getaway:", choices: [
      { label: '🏖️ Always up for a last-minute flight', value: 100 },
      { label: '🗺️ The type to plan everything ahead', value: 85 },
      { label: '🏔️ Somewhere remote and adventurous', value: 95 },
      { label: '🏙️ A city break, full of culture', value: 80 },
    ]},
    { q: "🎒 On a trip, you're the one who:", choices: [
      { label: '📸 Captures every moment', value: 80 },
      { label: '🧭 Leads the way', value: 90 },
      { label: '😌 Goes with the flow', value: 100 },
      { label: '📋 Handles the logistics', value: 85 },
    ]},
    { q: "🌍 Dream destination vibe:", choices: [
      { label: '🏝️ Beach and relaxation', value: 90 },
      { label: '🏔️ Mountains and adventure', value: 95 },
      { label: '🏛️ History and culture', value: 85 },
      { label: '🎉 Nightlife and energy', value: 80 },
    ]},
    { q: "🎫 Booking style:", choices: [
      { label: '📅 Everything planned months ahead', value: 80 },
      { label: '🎲 Spontaneous, book and go', value: 100 },
      { label: '🤝 A mix of both', value: 95 },
      { label: '🧳 Whatever\'s cheapest', value: 70 },
    ]},
    { q: "🚗 Your favorite way to travel:", choices: [
      { label: '✈️ Flying somewhere new', value: 95 },
      { label: '🚗 A road trip, no fixed destination', value: 100 },
      { label: '🚆 Slow travel by train', value: 85 },
      { label: '🚶 Backpacking', value: 90 },
    ]},
    { q: "🏨 On vacation, your ideal stay is:", choices: [
      { label: '🏨 A luxury hotel', value: 90 },
      { label: '🏡 A cozy Airbnb', value: 95 },
      { label: '⛺ Camping under the stars', value: 85 },
      { label: '🏝️ An all-inclusive resort', value: 80 },
    ]},
    { q: "🧭 Travel means to you, above all:", choices: [
      { label: '🌅 New experiences', value: 100 },
      { label: '😌 Relaxation', value: 85 },
      { label: '💑 Quality time together', value: 100 },
      { label: '📸 Memories to keep', value: 90 },
    ]},
  ],
  music: [
    { q: "🎤 In the shower, you're more likely singing:", choices: [
      { label: '🎶 A catchy pop hit', value: 85 },
      { label: '🎷 A sultry R&B classic', value: 95 },
      { label: '🎸 A rock anthem', value: 90 },
      { label: '🎧 Whatever\'s trending right now', value: 80 },
    ]},
    { q: "🕺 At a party, you're mostly:", choices: [
      { label: '💃 First on the dance floor', value: 100 },
      { label: '🍹 At the bar, watching the crowd', value: 70 },
      { label: '🎧 Curating the playlist', value: 85 },
      { label: '😄 Chatting in a corner', value: 75 },
    ]},
    { q: "🎼 Your go-to genre for a date night:", choices: [
      { label: '🎷 Jazz and lounge', value: 90 },
      { label: '🎸 Acoustic and chill', value: 95 },
      { label: '🔥 Latin and dancing rhythms', value: 100 },
      { label: '🎹 Romantic ballads', value: 95 },
    ]},
    { q: "🎧 Music is, for you:", choices: [
      { label: '💃 Something to dance to', value: 90 },
      { label: '😢 Something to feel deeply', value: 100 },
      { label: '🎉 The soundtrack to good times', value: 95 },
      { label: '🧘 A way to relax', value: 85 },
    ]},
    { q: "🎙️ Your karaoke go-to:", choices: [
      { label: '🎤 A power ballad', value: 95 },
      { label: '😂 A fun, silly song', value: 85 },
      { label: '🔥 Something sexy and slow', value: 100 },
      { label: '🎸 A classic rock hit', value: 90 },
    ]},
    { q: "🚗 Your road-trip playlist is:", choices: [
      { label: '🎶 Non-stop singalong hits', value: 95 },
      { label: '🎧 A curated, chill mix', value: 90 },
      { label: '🔥 High energy, all the way', value: 100 },
      { label: '📻 Whatever\'s on the radio', value: 75 },
    ]},
    { q: "💃 Music and romance go together with:", choices: [
      { label: '🕯️ A slow dance at home', value: 100 },
      { label: '🎉 Dancing all night out', value: 90 },
      { label: '🎸 Live music together', value: 95 },
      { label: '🎧 Sharing headphones', value: 85 },
    ]},
  ],
  restaurants: [
    { q: "🍽️ On a date, you'd rather order:", choices: [
      { label: '🍝 Something to share', value: 100 },
      { label: '🥩 Your own dish', value: 75 },
      { label: '🍷 Just drinks and appetizers', value: 60 },
      { label: '🍰 Straight to dessert', value: 80 },
    ]},
    { q: "🍴 Your dining style:", choices: [
      { label: '🍽️ Always tastes from your partner\'s plate', value: 95 },
      { label: '🙋 Always asks before taking a bite', value: 75 },
      { label: '🍕 Loves sharing everything', value: 100 },
      { label: '🍽️ Sticks to your own plate', value: 60 },
    ]},
    { q: "🌶️ Your ideal cuisine for a date:", choices: [
      { label: '🍣 Sushi and fine dining', value: 90 },
      { label: '🌶️ Spicy and bold flavors', value: 100 },
      { label: '🍝 Classic Italian', value: 95 },
      { label: '🍔 Casual and fun food', value: 85 },
    ]},
    { q: "🕯️ Your dream restaurant setting:", choices: [
      { label: '🌃 Rooftop with a view', value: 95 },
      { label: '🕯️ Cozy and intimate', value: 100 },
      { label: '🎶 Lively with music', value: 85 },
      { label: '🌊 Beachside table', value: 95 },
    ]},
    { q: "🍷 Choosing wine or drinks, you:", choices: [
      { label: '🍷 Always order for the both of you', value: 85 },
      { label: '🙋 Let them choose', value: 75 },
      { label: '🤝 Decide together', value: 100 },
      { label: '🍹 Go for whatever sounds fun', value: 80 },
    ]},
    { q: "🍽️ First-date restaurant pick:", choices: [
      { label: '🍝 A cozy Italian spot', value: 95 },
      { label: '🍣 Something a bit fancy', value: 90 },
      { label: '🍔 Casual and relaxed', value: 85 },
      { label: '🌮 Somewhere fun and different', value: 100 },
    ]},
    { q: "🎂 Splitting the bill, you're:", choices: [
      { label: '💳 Happy to treat', value: 95 },
      { label: '🤝 Always split evenly', value: 85 },
      { label: '😊 Whoever offers first', value: 80 },
      { label: '🔄 Take turns each time', value: 100 },
    ]},
  ],
  movies: [
    { q: "🎬 Movie night, you'd pick:", choices: [
      { label: '👻 A horror movie, great excuse to cuddle', value: 100 },
      { label: '💕 A romantic comedy', value: 90 },
      { label: '🎭 A gripping drama', value: 85 },
      { label: '💥 An action blockbuster', value: 80 },
    ]},
    { q: "🍿 During the movie, you're:", choices: [
      { label: '🎥 100% focused on the screen', value: 70 },
      { label: '😍 More focused on them than the movie', value: 100 },
      { label: '💬 Commenting the whole time', value: 75 },
      { label: '😴 Sometimes drifting off', value: 60 },
    ]},
    { q: "🌟 Your ultimate movie genre:", choices: [
      { label: '💘 Romance', value: 95 },
      { label: '😂 Comedy', value: 90 },
      { label: '🔍 Thriller / mystery', value: 85 },
      { label: '🚀 Sci-fi', value: 80 },
    ]},
    { q: "🍫 Movie night snack of choice:", choices: [
      { label: '🍿 Popcorn, obviously', value: 90 },
      { label: '🍫 Chocolate and sweets', value: 95 },
      { label: '🍕 Something savory', value: 85 },
      { label: '🍷 Wine and cheese', value: 100 },
    ]},
    { q: "📽️ Your ideal movie date:", choices: [
      { label: '🎦 A classic cinema outing', value: 85 },
      { label: '🛋️ A cozy night in on the couch', value: 100 },
      { label: '✨ A drive-in movie', value: 95 },
      { label: '🎉 A movie marathon weekend', value: 90 },
    ]},
    { q: "😢 When a movie makes you emotional:", choices: [
      { label: '😭 You cry, no shame', value: 100 },
      { label: '😐 You hold it in', value: 60 },
      { label: '🤗 You want a hug right after', value: 95 },
      { label: '😂 You joke to lighten the mood', value: 75 },
    ]},
    { q: "🎞️ Rewatching your favorite movie together means:", choices: [
      { label: '💑 Bonding time', value: 100 },
      { label: '😌 Comfort and nostalgia', value: 95 },
      { label: '🎉 Fun no matter how many times', value: 85 },
      { label: '😴 A chance to relax', value: 70 },
    ]},
  ],
  food: [
    { q: "🍕 Your go-to comfort food:", choices: [
      { label: '🍕 Pizza, always', value: 90 },
      { label: '🍫 Something sweet', value: 95 },
      { label: '🍜 Warm comfort noodles', value: 85 },
      { label: '🥘 A home-cooked meal', value: 100 },
    ]},
    { q: "🍭 Sweet tooth level:", choices: [
      { label: '🍰 A dessert to share', value: 100 },
      { label: '🍫 Chocolate lover', value: 95 },
      { label: '🍓 Light and fruity', value: 80 },
      { label: '🚫 Not really a sweet tooth', value: 50 },
    ]},
    { q: "🌶️ Your move to make them swoon:", choices: [
      { label: '🍴 Feeding them a bite off your fork', value: 100 },
      { label: '🍽️ Letting them pick the dish', value: 85 },
      { label: '👩‍🍳 Cooking for them', value: 95 },
      { label: '🎁 Surprising them with their favorite', value: 95 },
    ]},
    { q: "🍳 Cooking together, you're:", choices: [
      { label: '👩‍🍳 The one who takes charge', value: 85 },
      { label: '🥄 Happy to just help out', value: 90 },
      { label: '🍷 There for the wine and vibes', value: 80 },
      { label: '🔥 The one who improvises', value: 95 },
    ]},
    { q: "🌍 Food-wise, you love exploring:", choices: [
      { label: '🍣 New and exotic cuisines', value: 100 },
      { label: '🍝 Comfort classics done well', value: 85 },
      { label: '🌮 Street food adventures', value: 95 },
      { label: '🥗 Healthy, fresh flavors', value: 80 },
    ]},
    { q: "🍷 A romantic dinner needs:", choices: [
      { label: '🕯️ Candlelight', value: 95 },
      { label: '🍷 Good wine', value: 90 },
      { label: '🎶 Soft music', value: 85 },
      { label: '🍽️ Great food, that\'s it', value: 100 },
    ]},
    { q: "🍯 Your idea of a food-lover's date:", choices: [
      { label: '🍫 A dessert tasting', value: 95 },
      { label: '🍷 A wine and cheese night', value: 100 },
      { label: '🌮 Street food crawl', value: 90 },
      { label: '👩‍🍳 A cooking class together', value: 95 },
    ]},
  ],
};

function getTodayDateStr(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function renderMemberSeducerProfileTab(user, data){
  const el = paintTabBody(`<div id="seducer-zone"></div>`);
  if(!el) return;
  renderSeducerProfileZone(user, data);
}

function renderSeducerProfileZone(user, data){
  const zone = document.getElementById('seducer-zone');
  if(!zone) return;
  const st = getDesireProfileState(data);
  const complete = st.themeIndex >= DESIRE_THEMES.length;
  const percent = complete ? 100 : Math.min(100, Math.round((st.themeIndex * 10) + (st.questionIndex / DESIRE_QUESTIONS_PER_THEME) * 10));
  const today = getTodayDateStr();
  const answeredToday = data.desireProfile && data.desireProfile.lastAnsweredDate === today;

  const themeScores = st.themeScores || {};
  const scoresHtml = DESIRE_THEMES.map((themeKey, idx) => {
    const done = idx < st.themeIndex || (idx === st.themeIndex && complete);
    const score = themeScores[themeKey];
    return `
      <div class="seducer-theme-row" style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border,#2a2a2a);">
        <span style="font-size:12px;">${t('desireTheme_' + themeKey)}</span>
        <span style="font-size:12px;font-weight:700;color:${done ? '#e0455a' : 'var(--text-muted)'};">
          ${done && score !== undefined ? score + '%' : t('desireThemeNotStarted')}
        </span>
      </div>`;
  }).join('');

  let questionBlockHtml = '';
  if(complete){
    questionBlockHtml = `<p style="text-align:center;font-size:12.5px;color:var(--text-muted);margin:14px 0;">${t('desireProfileComplete')}</p>`;
  } else if(answeredToday){
    questionBlockHtml = `<p style="text-align:center;font-size:12px;color:var(--text-muted);margin:14px 0;">${t('desireAlreadyAnsweredToday')}</p>`;
  } else {
    const question = DESIRE_QUESTION_BANK[DESIRE_THEMES[st.themeIndex]][st.questionIndex];
    questionBlockHtml = `
      <div class="seducer-question-card" style="margin:14px 0;padding:14px;border:1px solid var(--border,#2a2a2a);border-radius:12px;">
        <p style="font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);margin:0 0 8px;">${t('desireQuestionOfDay')} — ${t('desireTheme_' + DESIRE_THEMES[st.themeIndex])} (${st.questionIndex + 1}/${DESIRE_QUESTIONS_PER_THEME})</p>
        <p style="font-size:13.5px;margin:0 0 12px;">${escText(question.q)}</p>
        <div class="seducer-answers" style="display:flex;flex-direction:column;gap:8px;">
          ${question.choices.map((c, i) => `<button type="button" class="btn btn-ghost btn-sm seducer-answer-btn" data-idx="${i}" style="text-align:left;">${escText(c.label)}</button>`).join('')}
        </div>
      </div>`;
  }

  const adminPreviewHtml = canSeeDesireAdminPreview() ? `
    <div class="seducer-admin-preview" style="margin-top:22px;padding-top:14px;border-top:1px dashed var(--border,#2a2a2a);">
      <p style="font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);margin:0 0 6px;">🔒 Admin preview — all 70 questions</p>
      <p style="font-size:11px;color:var(--text-muted);margin:0 0 10px;">This full list is only visible to admin, for proofreading. Members never see it this way: on their side, only ONE question unlocks per day, in order, once they've answered the previous one.</p>
      ${DESIRE_THEMES.map(themeKey => `
        <details style="margin-bottom:6px;">
          <summary style="cursor:pointer;font-size:12.5px;font-weight:700;padding:6px 0;">${t('desireTheme_' + themeKey)} (${DESIRE_QUESTIONS_PER_THEME})</summary>
          <div style="padding:4px 0 8px 10px;">
            ${DESIRE_QUESTION_BANK[themeKey].map((q, i) => `
              <div style="margin:0 0 10px;padding:8px;border:1px solid var(--border,#2a2a2a);border-radius:8px;">
                <p style="font-size:10px;color:var(--text-muted);margin:0 0 4px;">🔒 Day ${i + 1}/${DESIRE_QUESTIONS_PER_THEME} — to unlock</p>
                <p style="font-size:12.5px;margin:0 0 6px;">${escText(q.q)}</p>
                <ul style="margin:0;padding-left:16px;font-size:11.5px;color:var(--text-muted);">
                  ${q.choices.map(c => `<li>${escText(c.label)}</li>`).join('')}
                </ul>
              </div>
            `).join('')}
          </div>
        </details>
      `).join('')}
    </div>
  ` : '';

  zone.innerHTML = `
    <div class="seducer-progress-wrap" style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--text-muted);margin-bottom:4px;">
        <span>${t('desireProgressLabel')}</span>
        <span>${percent}%</span>
      </div>
      <div style="height:8px;border-radius:4px;background:var(--bg-elev,#1c1c1c);overflow:hidden;">
        <div style="height:100%;width:${percent}%;background:linear-gradient(90deg,#2f7bff,#e0455a);transition:width .4s;"></div>
      </div>
      ${!complete ? `<p style="font-size:10.5px;color:var(--text-muted);margin:6px 0 0;">${t('desireProgressTeaser')}</p><p style="font-size:10.5px;color:var(--text-muted);margin:2px 0 0;">${t('desireCompatibilityLine')}</p>` : ''}
    </div>
    ${questionBlockHtml}
    <p style="font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);margin:18px 0 4px;">${t('desireThemeScoresTitle')}</p>
    <div class="seducer-scores-table">${scoresHtml}</div>
    ${adminPreviewHtml}
  `;

  if(!complete && !answeredToday){
    zone.querySelectorAll('.seducer-answer-btn').forEach(btn => {
      btn.onclick = () => answerSeducerQuestion(user, data, parseInt(btn.dataset.idx, 10));
    });
  }
}

async function answerSeducerQuestion(user, data, choiceIdx){
  const st = getDesireProfileState(data);
  if(st.themeIndex >= DESIRE_THEMES.length) return;
  const themeKey = DESIRE_THEMES[st.themeIndex];
  const question = DESIRE_QUESTION_BANK[themeKey][st.questionIndex];
  const choice = question.choices[choiceIdx];
  if(!choice) return;

  // Moyenne cumulative du score du thème en cours, au fil des questions répondues.
  const prevScores = (data.desireProfile && data.desireProfile.themeScores) || {};
  const answeredSoFar = st.questionIndex; // avant cette réponse
  const prevAvg = prevScores[themeKey] || 0;
  const newAvg = Math.round(((prevAvg * answeredSoFar) + choice.value) / (answeredSoFar + 1));

  let { themeIndex, questionIndex, points } = st;
  points = Math.min(points + 1, DESIRE_TOTAL_QUESTIONS);
  questionIndex += 1;
  const themeScores = { ...prevScores, [themeKey]: newAvg };
  if(questionIndex >= DESIRE_QUESTIONS_PER_THEME){
    questionIndex = 0;
    themeIndex += 1;
  }
  const justCompleted = themeIndex >= DESIRE_THEMES.length && st.themeIndex < DESIRE_THEMES.length;
  const desireProfile = {
    themeIndex, questionIndex, points, themeScores,
    lastAnsweredDate: getTodayDateStr(),
  };
  try{
    await memberDb.collection('members').doc(user.uid).set({ desireProfile }, { merge: true });
    data.desireProfile = desireProfile;
    toast(justCompleted ? t('desireProfileComplete') : t('desireAnswerSaved'));
    renderSeducerProfileZone(user, data);
  }catch(e){ console.error('answerSeducerQuestion error', e); toast(t('memberErrUnknown')); }
}
/* Onglet "Tools" côté membre : pour l'instant, contient uniquement le chatbot
   "Match Your Words" (thèmes des bios des créatrices + conseils de conversation).
   D'autres outils pourront être ajoutés ici plus tard, sur le même modèle que
   le menu Tools de la créatrice (calendrier, notes, etc.). */
function renderMemberToolsTab(user, data){
  const el = paintTabBody(`<div id="member-tools-zone"></div>`);
  if(!el) return;
  renderMemberToolMatchWords(document.getElementById('member-tools-zone'));
}
// Affiche le contenu d'un onglet ET (re)joue systématiquement la même animation
// d'entrée douce, à chaque fois — comportement identique sur tous les onglets,
// que le contenu vienne du cache (instantané) ou du réseau (après le chargement).
function paintTabBody(html, skipAnim){
  const el = document.getElementById('member-tab-body');
  if(!el) return null;
  el.innerHTML = html;
  if(!skipAnim){
    el.classList.remove('tab-fade-in');
    void el.offsetWidth;
    el.classList.add('tab-fade-in');
  }
  return el;
}
/* ---------------- robustesse photos/vidéos : une image cassée (URL expirée, upload
   interrompu, coupure réseau) ne doit jamais afficher l'icône "image cassée" du
   navigateur — indispensable une fois qu'il y aura de vrais clients et du vrai contenu.
   ('error' ne remonte pas (bubble) sur les img, d'où l'écoute en phase de capture.) ---------------- */
document.addEventListener('error', (e) => {
  const el = e.target;
  if(el && el.tagName === 'IMG' && !el.dataset.brokenHandled){
    el.dataset.brokenHandled = '1';
    el.style.visibility = 'hidden'; // le fond du conteneur parent apparaît à la place
  }
}, true);

function renderMemberProfileTab(user, data, subTab){
  subTab = subTab || 'infos';
  paintTabBody(`
    <div class="member-subtabs">
      <button type="button" class="member-subtab${subTab === 'infos' ? ' active' : ''}" id="member-subtab-infos">${t('memberSubtabInfos')}</button>
      <button type="button" class="member-subtab${subTab === 'photos' ? ' active' : ''}" id="member-subtab-photos">${t('memberSubtabPhotos')}</button>
      <button type="button" class="member-subtab${subTab === 'password' ? ' active' : ''}" id="member-subtab-password">${t('memberSubtabPassword')}</button>
    </div>
    <div id="member-subtab-body"></div>
  `);
  document.getElementById('member-subtab-infos').onclick = () => renderMemberProfileTab(user, data, 'infos');
  document.getElementById('member-subtab-photos').onclick = () => renderMemberProfileTab(user, data, 'photos');
  document.getElementById('member-subtab-password').onclick = () => renderMemberProfileTab(user, data, 'password');
  if(subTab === 'photos') renderMemberProfilePhotosSubtab(user, data);
  else if(subTab === 'password') renderMemberProfilePasswordSubtab(user, data);
  else renderMemberProfileInfosSubtab(user, data);
}

function renderMemberProfileInfosSubtab(user, data){
  const tabBody = document.getElementById('member-subtab-body');
  const bq = data.bioQuestions || {};
  const avatarInner = data.photoURL ? `<img src="${escAttr(data.photoURL)}" alt="" loading="lazy" decoding="async">` : '🙂';
  tabBody.innerHTML = `
    <div class="member-presentation-header">
      <div class="member-avatar-row">
        <div class="member-avatar" id="member-avatar-preview">${avatarInner}</div>
        <label class="btn btn-ghost btn-sm member-avatar-upload" style="flex:1;text-align:center;">
          ${t('memberAvatarChange')}
          <input type="file" accept="image/*" id="member-avatar-input">
        </label>
      </div>
      <h3 class="member-presentation-name">${escText(data.username || t('nameUndefined'))}</h3>
    </div>
    <div class="bio-narrative-divider"></div>

    <label>${ICON_USER}${t('memberUsernameLabel')}</label>
    <div style="display:flex;gap:8px;">
      <input id="member-pf-username" placeholder="${escAttr(t('memberUsernamePh'))}" value="${escAttr(data.username || '')}" style="flex:1;" maxlength="20">
      <button type="button" class="btn btn-ghost btn-sm" id="member-pf-username-save" style="width:auto;flex-shrink:0;">${t('memberSaveBtn')}</button>
    </div>
    <p class="member-note" id="member-pf-username-note"></p>

    <label>${ICON_MAIL_SM}${t('memberEmailLabel')}</label>
    <input value="${escAttr(data.email || user.email || '')}" disabled>
    <p class="member-note">${t('memberPrivateFieldNote')}</p>

    <label>${ICON_PIN_SM}${t('memberLocationLabel')}</label>
    <div style="display:flex;gap:8px;">
      <input id="member-pf-location" placeholder="${escAttr(t('memberLocationPh'))}" value="${escAttr(data.location || '')}" style="flex:1;">
      <button type="button" class="btn btn-ghost btn-sm" id="member-pf-geoloc" style="width:auto;flex-shrink:0;" title="${escAttr(t('memberUseMyLocation'))}">📍</button>
    </div>
    <p class="member-note" id="member-pf-geoloc-note"></p>

    <div class="bio-narrative-divider" style="margin:20px 0;"></div>

    <div class="member-bio-header">
      <label id="member-bio-label-wrap" style="margin:0;">${ICON_NOTE}${t('memberBioLabel')}<span class="member-field-done-icon" id="member-bio-done-icon">${ICON_STAR}</span></label>
      <div class="member-bio-icons">
        <button type="button" class="member-bio-icon-btn" id="member-bio-edit-btn" title="${escAttr(t('memberBioEditBtn'))}">${ICON_EDIT}</button>
        <button type="button" class="member-bio-icon-btn" id="member-bio-cancel-btn" title="${escAttr(t('memberBioCancelBtn'))}" style="display:none;">${ICON_X}</button>
        <button type="button" class="member-bio-icon-btn" id="member-bio-delete-btn" title="${escAttr(t('memberBioDeleteBtn'))}">${ICON_TRASH}</button>
      </div>
    </div>
    <div class="member-bio-readview" id="member-bio-readview">${data.bio ? memberBioNarrativeHtml(data.bio, t('memberBioNarrativeLabelSelf')) : `<span class="member-note">${t('memberBioEmpty')}</span>`}</div>
    <textarea id="member-pf-bio" rows="3" placeholder="${escAttr(t('memberBioPh'))}" style="display:none;">${escText(data.bio || '')}</textarea>
    <p class="member-note" id="member-bio-wordcount"></p>

    <div class="bio-narrative-divider" style="margin:16px 0;"></div>
    <div class="member-section-title" style="margin-top:0;">${t('memberBioQuestionsTitle')}</div>
    <p class="member-note">${t('memberBioQuestionsNote')}</p>
    <div class="member-quiz-field">
      <label>${fieldIcon(ICON_PALETTE)}${t('memberBioHobbies')}</label>
      <input id="member-pf-bio-hobbies" placeholder="${escAttr(t('memberBioHobbiesPh'))}" value="${escAttr(bq.hobbies || '')}">
    </div>
    <div class="member-quiz-field">
      <label>${fieldIcon(ICON_FLAME)}${t('memberBioPassions')}</label>
      <input id="member-pf-bio-passions" placeholder="${escAttr(t('memberBioPassionsPh'))}" value="${escAttr(bq.passions || '')}">
    </div>
    <div class="member-quiz-field">
      <label>${fieldIcon(ICON_MOON_STAR)}${t('memberBioDreams')}</label>
      <input id="member-pf-bio-dreams" placeholder="${escAttr(t('memberBioDreamsPh'))}" value="${escAttr(bq.dreams || '')}">
    </div>
    <div class="member-quiz-field">
      <label>${fieldIcon(ICON_ENVELOPE_HEART)}${t('memberBioLookingFor')}</label>
      <input id="member-pf-bio-lookingfor" placeholder="${escAttr(t('memberBioLookingForPh'))}" value="${escAttr(bq.lookingFor || '')}">
    </div>
    <div class="member-quiz-field">
      <label>${fieldIcon(ICON_CHAT)}${t('memberBioDiscussionStyle')}</label>
      <input id="member-pf-bio-discussionstyle" placeholder="${escAttr(t('memberBioDiscussionStylePh'))}" value="${escAttr(bq.discussionStyle || '')}">
    </div>

    <label>${fieldIcon(ICON_SHIELD)}${t('memberVisibilityLabel')}</label>
    ${visibilityGroupHtml('member-pf-bio-visible', data.bioVisibility || (data.bioVisibleToCreator ? 'everyone' : 'nobody'))}
    <p class="member-note visibility-note">${t('memberBioVisibilityExplain')}</p>
    <input type="hidden" id="member-pf-photos-visible" value="${escAttr(data.photosVisibility || (data.photosVisibleToCreator ? 'everyone' : 'nobody'))}">

    <div class="member-err" id="member-pf-err"></div>
    <div class="modal-actions">
      <button class="btn btn-primary btn-sm" id="member-pf-save" style="flex:1;">${t('memberSaveBtn')}</button>
    </div>
  `;
  wireVisibilityGroup('member-pf-bio-visible');
  const bioReadview = document.getElementById('member-bio-readview');
  const bioTextarea = document.getElementById('member-pf-bio');
  const bioEditBtn = document.getElementById('member-bio-edit-btn');
  const bioCancelBtn = document.getElementById('member-bio-cancel-btn');
  const bioDeleteBtn = document.getElementById('member-bio-delete-btn');
  const enterEditMode = () => {
    bioReadview.style.display = 'none';
    bioTextarea.style.display = 'block';
    bioEditBtn.style.display = 'none';
    bioCancelBtn.style.display = 'flex';
    bioTextarea.focus();
  };
  const exitEditMode = () => {
    bioTextarea.value = data.bio || '';
    bioReadview.style.display = 'block';
    bioTextarea.style.display = 'none';
    bioEditBtn.style.display = 'flex';
    bioCancelBtn.style.display = 'none';
  };
  bioEditBtn.onclick = enterEditMode;
  bioCancelBtn.onclick = exitEditMode;
  bioDeleteBtn.onclick = () => {
    bioTextarea.value = '';
    bioReadview.innerHTML = `<span class="member-note">${t('memberBioEmpty')}</span>`;
    enterEditMode();
    updateBioWordState();
  };
  document.getElementById('member-avatar-input').onchange = (e) => memberUploadAvatar(user, e.target.files[0]);
  document.getElementById('member-pf-save').onclick = () => memberSaveProfile(user, data);
  document.getElementById('member-pf-geoloc').onclick = () => memberUseGeolocation(data);
  document.getElementById('member-pf-username-save').onclick = () => memberSaveUsername(user, data);

  // Indicateur "case remplie = doré + icône" : biographie (limitée à 50 mots) + questions bio.
  const BIO_MAX_WORDS = 50;
  const bioLabelWrap = document.getElementById('member-bio-label-wrap');
  const bioDoneIcon = document.getElementById('member-bio-done-icon');
  const bioWordcountEl = document.getElementById('member-bio-wordcount');
  const updateBioWordState = () => {
    let words = bioTextarea.value.trim().match(/\S+/g) || [];
    if(words.length > BIO_MAX_WORDS){
      words = words.slice(0, BIO_MAX_WORDS);
      bioTextarea.value = words.join(' ');
    }
    const filled = words.length > 0;
    bioLabelWrap.classList.toggle('is-filled', filled);
    bioDoneIcon.classList.toggle('show', filled);
    bioWordcountEl.textContent = `${words.length}/${BIO_MAX_WORDS} ${t('memberBioWordLimit')}`;
  };
  bioTextarea.addEventListener('input', updateBioWordState);
  updateBioWordState();

  tabBody.querySelectorAll('.member-quiz-field').forEach(wrap => {
    const label = wrap.querySelector('label');
    const field = wrap.querySelector('input,textarea');
    if(!label || !field) return;
    const icon = document.createElement('span');
    icon.className = 'member-field-done-icon';
    icon.innerHTML = ICON_STAR;
    label.appendChild(icon);
    const updateField = () => {
      const filled = field.value.trim().length > 0;
      label.classList.toggle('is-filled', filled);
      icon.classList.toggle('show', filled);
    };
    field.addEventListener('input', updateField);
    updateField();
  });
}

function renderMemberProfilePhotosSubtab(user, data){
  const tabBody = document.getElementById('member-subtab-body');
  // Espace membre : plus de petite croix sur la vignette (peu lisible/moche).
  // Un clic sur la photo l'ouvre en plein écran (lightbox), avec un bouton
  // "Supprimer" clair dans cette vue — on voit précisément quelle photo on supprime.
  const myPhotoThumbs = (data.photos || []).map((p, i) => `
    <div class="member-media-thumb member-photo-thumb" data-idx="${i}" style="position:relative;cursor:pointer;">
      <img src="${escAttr(p.url)}" alt="" loading="lazy" decoding="async">
    </div>`).join('');
  tabBody.innerHTML = `
    <div class="member-section-title">${t('memberMyPhotosTitle')} (${(data.photos || []).length})</div>
    <p class="member-note">${t('memberMyPhotosNote')}</p>
    ${myPhotoThumbs ? `<div class="member-media-grid">${myPhotoThumbs}</div>` : ''}
    ${dualUploadZoneHtml('member-my-photo', 'image/*', { multiple: true })}
    <label>${fieldIcon(ICON_SHIELD)}${t('memberVisibilityLabel')}</label>
    ${visibilityGroupHtml('member-pf-photos-visible-tab', data.photosVisibility || (data.photosVisibleToCreator ? 'everyone' : 'nobody'))}
    <p class="member-note visibility-note">${t('memberPhotosVisibilityExplain')}</p>
    <div class="member-err" id="member-pf-photos-err"></div>
    <div class="modal-actions">
      <button class="btn btn-primary btn-sm" id="member-pf-photos-save" style="flex:1;">${t('memberSaveBtn')}</button>
    </div>
  `;
  wireVisibilityGroup('member-pf-photos-visible-tab');
  document.getElementById('member-pf-photos-save').onclick = async () => {
    const photosVisibility = document.getElementById('member-pf-photos-visible-tab').value;
    const btn = document.getElementById('member-pf-photos-save');
    btn.disabled = true;
    try{
      await memberDb.collection('members').doc(user.uid).set({ photosVisibility, photosVisibleToCreator: photosVisibility !== 'nobody' }, { merge: true });
      data.photosVisibility = photosVisibility;
      data.photosVisibleToCreator = photosVisibility !== 'nobody';
      toast(t('memberSavedToast'));
    }catch(e){ console.error('save photos visibility error', e); toast(t('memberErrUnknown')); }
    btn.disabled = false;
  };
  wireDualUpload('member-my-photo', async (files) => {
    for(const file of Array.from(files)){
      try{
        const url = await uploadToR2(memberAuth, file, 'member_photos/' + user.uid);
        data.photos = data.photos || [];
        data.photos.push({ url });
        await memberDb.collection('members').doc(user.uid).set({ photos: data.photos }, { merge: true });
        toast(t('addedToast'));
      }catch(err){ console.error('member photo upload error', err); toast(t('memberErrUnknown')); }
    }
    renderMemberProfilePhotosSubtab(user, data);
  });
  const deleteMemberPhoto = async (idx, btn) => {
    const item = data.photos[idx];
    if(btn) btn.disabled = true;
    try{
      if(item.path){ try{ await memberStorage.ref().child(item.path).delete(); }catch(e){} }
      data.photos.splice(idx, 1);
      await memberDb.collection('members').doc(user.uid).set({ photos: data.photos }, { merge: true });
      renderMemberProfilePhotosSubtab(user, data);
    }catch(e){ console.error('remove member photo error', e); toast(t('memberErrUnknown')); if(btn) btn.disabled = false; }
  };
  tabBody.querySelectorAll('.member-photo-thumb').forEach(thumb => {
    thumb.onclick = () => {
      const idx = parseInt(thumb.dataset.idx, 10);
      openLightbox(data.photos[idx].url, 'image', () => deleteMemberPhoto(idx));
    };
  });
}

function renderMemberProfilePasswordSubtab(user, data){
  const tabBody = document.getElementById('member-subtab-body');
  tabBody.innerHTML = `
    <div class="member-section-title">${t('memberChangePasswordTitle')}</div>
    ${memberPassField('member-pf-currentpass', 'memberCurrentPasswordLabel', 'memberCurrentPasswordPh')}
    ${memberPassField('member-pf-newpass', 'memberNewPasswordLabel', 'memberNewPasswordPh')}
    <div class="member-err" id="member-pf-pass-err"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost btn-sm" id="member-pf-pass-save" style="flex:1;">${t('memberChangePasswordBtn')}</button>
    </div>

    <div class="member-section-title" style="color:var(--rose);">${t('memberDeleteAccountTitle')}</div>
    <p class="member-note">${t('memberDeleteAccountNote')}</p>
    <div class="modal-actions">
      <button class="btn btn-ghost btn-sm" id="member-pf-delete-btn" style="flex:1;border-color:var(--rose);color:var(--rose);">${t('memberDeleteAccountBtn')}</button>
    </div>
  `;
  wireEyeToggles(tabBody);
  document.getElementById('member-pf-pass-save').onclick = () => memberChangePassword();
  document.getElementById('member-pf-delete-btn').onclick = () => memberDeleteAccount(user, data);
}

async function memberSaveUsername(user, data){
  const noteEl = document.getElementById('member-pf-username-note');
  noteEl.textContent = '';
  const newUsername = document.getElementById('member-pf-username').value.trim();
  if(!isValidUsername(newUsername)){ noteEl.textContent = t('memberErrUsernameFormat'); return; }
  if(newUsername === data.username) return;
  const btn = document.getElementById('member-pf-username-save');
  btn.disabled = true;
  const newLower = newUsername.toLowerCase();
  try{
    const existing = await memberDb.collection('usernames').doc(newLower).get();
    if(existing.exists && existing.data().uid !== user.uid){
      noteEl.textContent = t('memberErrUsernameTaken');
      btn.disabled = false;
      return;
    }
    await memberDb.collection('usernames').doc(newLower).set({ uid: user.uid, email: user.email });
    await memberDb.collection('members').doc(user.uid).set({ username: newUsername, usernameLower: newLower }, { merge: true });
    try{ await user.updateProfile({ displayName: newUsername }); }catch(e){}
    data.username = newUsername;
    updateTopbarMemberBadge(newUsername);
    toast(t('memberSavedToast'));
  }catch(e){
    console.error('save username error', e);
    noteEl.textContent = t('memberErrUnknown') + ' (' + (e.code || e.message || e) + ')';
  }
  btn.disabled = false;
}

function memberUseGeolocation(data){
  const note = document.getElementById('member-pf-geoloc-note');
  if(!navigator.geolocation){ note.textContent = t('memberGeolocUnsupported'); return; }
  note.textContent = t('memberGeolocLoading');
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const { latitude, longitude } = pos.coords;
    data._lat = latitude; data._lng = longitude;
    try{
      const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
      const geo = await resp.json();
      const a = geo.address || {};
      const city = a.city || a.town || a.village || a.county || '';
      const country = a.country || '';
      const label = [city, country].filter(Boolean).join(', ') || `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
      document.getElementById('member-pf-location').value = label;
      note.textContent = '';
    }catch(e){
      document.getElementById('member-pf-location').value = `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
      note.textContent = '';
    }
  }, (err) => {
    console.error('geolocation error', err);
    note.textContent = t('memberGeolocDenied');
  });
}

async function memberUploadAvatar(user, file){
  if(!file) return;
  if(!file.type || !file.type.startsWith('image/')){ toast(t('memberErrUnknown')); return; }
  const preview = document.getElementById('member-avatar-preview');
  const prevContent = preview.innerHTML;
  preview.innerHTML = '…';
  try{
    const url = await uploadToR2(memberAuth, file, 'avatars');
    await memberDb.collection('members').doc(user.uid).set({ photoURL: url }, { merge: true });
    preview.innerHTML = `<img src="${escAttr(url)}" alt="" loading="lazy" decoding="async">`;
    toast(t('memberSavedToast'));
  }catch(e){
    console.error('avatar upload error', e);
    preview.innerHTML = prevContent;
    toast(t('memberErrUnknown') + ' (' + (e.code || e.message || e) + ')');
  }
}

async function memberSaveProfile(user, data){
  const errEl = document.getElementById('member-pf-err');
  errEl.textContent = '';
  const location = document.getElementById('member-pf-location').value.trim().slice(0, 80);
  const bio = (document.getElementById('member-pf-bio').value.trim().match(/\S+/g) || []).slice(0, 50).join(' ');
  const bioVisibility = document.getElementById('member-pf-bio-visible').value;
  const bioQuestions = {
    hobbies: document.getElementById('member-pf-bio-hobbies').value.trim().slice(0, 200),
    passions: document.getElementById('member-pf-bio-passions').value.trim().slice(0, 200),
    dreams: document.getElementById('member-pf-bio-dreams').value.trim().slice(0, 200),
    lookingFor: document.getElementById('member-pf-bio-lookingfor').value.trim().slice(0, 200),
    discussionStyle: document.getElementById('member-pf-bio-discussionstyle').value.trim().slice(0, 200)
  };
  const photosVisibility = document.getElementById('member-pf-photos-visible').value;
  const btn = document.getElementById('member-pf-save');
  btn.disabled = true;
  try{
    const payload = {
      username: data.username || '', location, bio, bioQuestions,
      bioVisibility, photosVisibility,
      bioVisibleToCreator: bioVisibility !== 'nobody', photosVisibleToCreator: photosVisibility !== 'nobody'
    };
    if(typeof data._lat === 'number'){ payload.lat = data._lat; payload.lng = data._lng; }
    await memberDb.collection('members').doc(user.uid).set(payload, { merge: true });
    Object.assign(data, payload);
    toast(t('memberSavedToast'));
  }catch(e){
    console.error('save profile error', e);
    errEl.textContent = t('memberErrUnknown') + ' (' + (e.code || e.message || e) + ')';
  }
  btn.disabled = false;
}

async function memberChangePassword(){
  const errEl = document.getElementById('member-pf-pass-err');
  errEl.textContent = '';
  const current = document.getElementById('member-pf-currentpass').value;
  const next = document.getElementById('member-pf-newpass').value;
  if(!current || !next){ errEl.textContent = t('memberErrFillAll'); return; }
  if(next.length < 6){ errEl.textContent = t('memberErrPassShort'); return; }
  const u = memberAuth.currentUser;
  if(!u){ errEl.textContent = t('memberErrUnknown'); return; }
  const btn = document.getElementById('member-pf-pass-save');
  btn.disabled = true;
  try{
    const cred = firebase.auth.EmailAuthProvider.credential(u.email, current);
    await u.reauthenticateWithCredential(cred);
    await u.updatePassword(next);
    document.getElementById('member-pf-currentpass').value = '';
    document.getElementById('member-pf-newpass').value = '';
    toast(t('memberPasswordChangedToast'));
  }catch(e){
    console.error('change password error', e);
    if(e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') errEl.textContent = t('memberErrWrongCurrentPass');
    else if(e.code === 'auth/weak-password') errEl.textContent = t('memberErrWeakPass');
    else errEl.textContent = t('memberErrUnknown') + ' (' + (e.code || e.message || e) + ')';
  }
  btn.disabled = false;
}

async function memberDeleteAccount(user, data){
  if(!confirm(t('memberDeleteAccountConfirm1'))) return;
  if(!confirm(t('memberDeleteAccountConfirm2'))) return;
  const email = user.email;
  const uid = user.uid;
  try{
    // Purge des photos personnelles stockées.
    for(const p of (data.photos || [])){
      if(p.path){ try{ await memberStorage.ref().child(p.path).delete(); }catch(e){} }
    }
    if(data.photoURL){ try{ await memberStorage.ref().child('avatars/' + uid + '.jpg').delete(); }catch(e){} }
    try{ await memberDb.collection('members').doc(uid).delete(); }catch(e){ console.error('delete member doc error', e); }
    try{
      if(typeof emailjs !== 'undefined' && EMAILJS_PUBLIC_KEY !== 'TON_EMAILJS_PUBLIC_KEY' && email){
        await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
          to_email: email, subject: 'Honeymoon — Ton compte a été supprimé',
          buyer_name: data.username || '', buyer_contact: email, creator_name: '',
          item_desc: 'Confirmation : ton compte membre Honeymoon vient d\'être supprimé, à ta demande.',
          price: '', ref: 'COMPTE-SUPPRIME'
        });
      }
    }catch(e){ console.error('deletion confirmation emailjs error', e); }
    await user.delete();
    closeMemberModal();
    updateTopbarMemberBadge(null);
    toast(t('memberDeleteAccountDone'));
  }catch(e){
    console.error('member self delete error', e);
    if(e.code === 'auth/requires-recent-login'){
      toast(t('memberDeleteRequiresRecentLogin'));
    } else {
      toast(t('memberErrUnknown') + ' (' + (e.code || e.message || e) + ')');
    }
  }
}

async function renderMemberPurchasesTab(user, data){
  const paint = (enriched, skipAnim) => {
    const historyRows = enriched.map(o => `
      <div class="member-purchase-row">
        <span>${escText(o.creatorName || '—')} — ${o.item ? o.item.price + '€' : ''}</span>
        <span class="member-purchase-status ${o.data.status === 'paid' ? 'paid' : 'pending'}">${o.data.status === 'paid' ? t('memberPurchasePaid') : t('memberPurchasePending')}</span>
      </div>
    `).join('');
    const paidOrders = enriched.filter(o => o.data.status === 'paid' && o.item);
    const photos = paidOrders.filter(o => o.item.kind === 'photo');
    const videos = paidOrders.filter(o => o.item.kind === 'video');
    const photoThumbs = photos.map(o => `<div class="member-media-thumb"><img src="${escAttr(o.item.url || o.item.teaserUrl || '')}" alt="" loading="lazy" decoding="async"></div>`).join('');
    const videoThumbs = videos.map(o => `<div class="member-media-thumb"><video src="${escAttr(o.item.url || o.item.teaserUrl || '')}" muted></video></div>`).join('');
    const customPurchases = (data && data.customPurchases) || [];
    const customThumbs = customPurchases.map(p => `
      <div class="member-media-thumb" title="${escAttr(p.creatorName || '')}">
        ${p.type === 'video' ? `<video src="${escAttr(p.url)}" muted></video>` : p.type === 'audio' ? `<div class="audio-thumb">${ICON_AUDIO}</div>` : `<img src="${escAttr(p.url)}" alt="" loading="lazy" decoding="async">`}
      </div>`).join('');
    paintTabBody(`
      <div class="member-section-title">${t('memberPurchaseHistoryTitle')}</div>
      ${historyRows || `<p class="member-note">${t('memberPurchaseNone')}</p><button type="button" class="btn btn-primary btn-sm" id="member-purchases-discover-btn" style="margin-top:6px;">${t('memberDiscoverCreatorsBtn')}</button>`}
      <div class="member-section-title">${t('memberPurchasePhotosTitle')}</div>
      ${photoThumbs ? `<div class="member-media-grid">${photoThumbs}</div>` : `<p class="member-note">${t('memberPurchaseNoPhotos')}</p>`}
      <div class="member-section-title">${t('memberPurchaseVideosTitle')}</div>
      ${videoThumbs ? `<div class="member-media-grid">${videoThumbs}</div>` : `<p class="member-note">${t('memberPurchaseNoVideos')}</p>`}
      <div class="member-section-title">${t('customOrderPurchasesTitle')}</div>
      ${customThumbs ? `<div class="member-media-grid">${customThumbs}</div>` : `<p class="member-note">${t('customOrderPurchasesNone')}</p>`}
    `, skipAnim);
    const discoverBtn = document.getElementById('member-purchases-discover-btn');
    if(discoverBtn) discoverBtn.onclick = () => closeMemberModal();
  };
  const cached = getMemberTabCache(user.uid, 'purchases');
  if(cached){ paint(cached); } // rendu instantané depuis le cache
  else{ paintTabBody(`<p class="member-note">…</p>`); }
  try{
    if(auth && !auth.currentUser){ try{ await auth.signInAnonymously(); }catch(e){} }
    const snap = await db.collectionGroup('orders').where('buyerUid', '==', user.uid).get();
    const orders = [];
    snap.forEach(d => orders.push({ id: d.id, ref: d.ref, data: d.data() }));
    orders.sort((a, b) => {
      const ta = a.data.createdAt && a.data.createdAt.toDate ? a.data.createdAt.toDate().getTime() : 0;
      const tb = b.data.createdAt && b.data.createdAt.toDate ? b.data.createdAt.toDate().getTime() : 0;
      return tb - ta;
    });
    const enriched = await Promise.all(orders.map(async (o) => {
      try{
        const itemRef = o.ref.parent.parent;
        const creatorRef = itemRef.parent.parent;
        const [itemDoc, creatorDoc] = await Promise.all([itemRef.get(), creatorRef.get()]);
        return {
          ...o,
          item: itemDoc.exists ? itemDoc.data() : null,
          creatorName: creatorDoc.exists ? creatorDoc.data().name : ''
        };
      }catch(e){ return { ...o, item: null, creatorName: '' }; }
    }));
    setMemberTabCache(user.uid, 'purchases', enriched);
    if(memberActiveTab === 'purchases') paint(enriched, true); // ré-affiche seulement si toujours sur cet onglet, sans rejouer l'animation
  }catch(e){
    console.error('load member purchases error', e);
    if(!cached && memberActiveTab === 'purchases') paintTabBody(`<p class="member-note">${t('memberPurchaseLoadErr')}</p>`);
  }
}

/* ---------------- cache mémoire des onglets espace membre : évite de tout re-télécharger
   à chaque passage d'un onglet à l'autre (c'était la cause du côté "saccadé" au clic) —
   rendu instantané si déjà visité cette session, données rafraîchies en arrière-plan. */
const memberTabCache = {};
// Empêche une réponse réseau arrivée en retard (Popularity/Messages/Collection,
// qui font toutes un appel Firestore) d'écraser un autre onglet ouvert entre-temps —
// c'était la cause du clignotement quand on changeait d'onglet rapidement.
let memberActiveTab = null;
function getMemberTabCache(uid, tab){ return memberTabCache[uid] && memberTabCache[uid][tab]; }
function setMemberTabCache(uid, tab, value){
  memberTabCache[uid] = memberTabCache[uid] || {};
  memberTabCache[uid][tab] = value;
}
// Précharge en arrière-plan les données des autres onglets dès l'ouverture de l'espace
// membre, pour qu'un clic sur un onglet réponde instantanément (cache déjà prêt) au lieu
// d'attendre le réseau à chaque fois — c'était la cause principale du côté "saccadé".
async function prefetchMemberTabs(user, data){
  if(getMemberTabCache(user.uid, 'popularity') === undefined){
    try{
      if(auth && !auth.currentUser){ try{ await auth.signInAnonymously(); }catch(e){} }
      const followingCreators = data.followingCreators || [];
      const followingRows = followingCreators
        .map(id => (typeof roster !== 'undefined' ? roster.find(m => m.id === id) : null))
        .filter(Boolean);
      const followersSnap = await db.collection('profiles').where('followingMembers', 'array-contains', user.uid).get();
      const followerRows = followersSnap.docs
        .map(d => (typeof roster !== 'undefined' ? roster.find(m => m.id === d.id) : null))
        .filter(Boolean);
      setMemberTabCache(user.uid, 'popularity', { followingRows, followerRows });
    }catch(e){ console.error('prefetch popularity error', e); }
  }
  if(getMemberTabCache(user.uid, 'purchases') === undefined){
    try{
      if(auth && !auth.currentUser){ try{ await auth.signInAnonymously(); }catch(e){} }
      const snap = await db.collectionGroup('orders').where('buyerUid', '==', user.uid).get();
      const orders = [];
      snap.forEach(d => orders.push({ id: d.id, ref: d.ref, data: d.data() }));
      orders.sort((a, b) => {
        const ta = a.data.createdAt && a.data.createdAt.toDate ? a.data.createdAt.toDate().getTime() : 0;
        const tb = b.data.createdAt && b.data.createdAt.toDate ? b.data.createdAt.toDate().getTime() : 0;
        return tb - ta;
      });
      const enriched = await Promise.all(orders.map(async (o) => {
        try{
          const itemRef = o.ref.parent.parent;
          const creatorRef = itemRef.parent.parent;
          const [itemDoc, creatorDoc] = await Promise.all([itemRef.get(), creatorRef.get()]);
          return {
            ...o,
            item: itemDoc.exists ? itemDoc.data() : null,
            creatorName: creatorDoc.exists ? creatorDoc.data().name : ''
          };
        }catch(e){ return { ...o, item: null, creatorName: '' }; }
      }));
      setMemberTabCache(user.uid, 'purchases', enriched);
    }catch(e){ console.error('prefetch purchases error', e); }
  }
  if(getMemberTabCache(user.uid, 'messages') === undefined){
    try{
      if(auth && !auth.currentUser){ try{ await auth.signInAnonymously(); }catch(e){} }
      const memberDoc = await memberDb.collection('members').doc(user.uid).get();
      const profileIds = (memberDoc.exists && memberDoc.data().conversationProfileIds) || [];
      if(profileIds.length === 0){
        setMemberTabCache(user.uid, 'messages', []);
      } else {
        const results = await Promise.all(profileIds.map(async (profileId) => {
          try{
            const convDoc = await memberDb.collection('profiles').doc(profileId).collection('conversations').doc(user.uid).get();
            return convDoc.exists ? { profileId, c: convDoc.data() } : null;
          }catch(e){ return null; }
        }));
        const rows = results.filter(Boolean).sort((a, b) => {
          const ta = a.c.lastMessageAt && a.c.lastMessageAt.toDate ? a.c.lastMessageAt.toDate().getTime() : 0;
          const tb = b.c.lastMessageAt && b.c.lastMessageAt.toDate ? b.c.lastMessageAt.toDate().getTime() : 0;
          return tb - ta;
        });
        setMemberTabCache(user.uid, 'messages', rows);
      }
    }catch(e){ console.error('prefetch messages error', e); }
  }
}

async function renderMemberPopularityTab(user, data){
  const cached = getMemberTabCache(user.uid, 'popularity');
  const paint = (followingRows, followerRows, skipAnim) => {
    paintTabBody(`
      <div class="uxd-hero-block">
        <span class="uxd-hero-shield">${ICON_SHIELD}</span>
        <span class="uxd-hero-text">${t('uxdExplainNote')}</span>
      </div>
      <div class="level-bar-wrap" id="member-uxd-level-bar"></div>
      <div class="member-section-title" style="margin-top:20px;">${t('followingListTitle')} (${followingRows.length})</div>
      <div class="member-favorites-list" style="margin-top:10px;">
        ${followingRows.length === 0 ? `<p class="member-note">${t('membersViewerEmpty')}</p>` : followingRows.map(m => `
          <div class="member-fav-row">
            <span class="member-fav-photo">${m.photo ? `<img src="${escAttr(m.photo)}" loading="lazy" decoding="async">` : '🙂'}</span>
            <span class="member-fav-name">${escText(m.name) || t('nameUndefined')}</span>
            ${followerBadgeHtml(m.followersCount)}
          </div>`).join('')}
      </div>
      <div class="member-section-title" style="margin-top:24px;">${t('followersListTitle')} (${followerRows.length})</div>
      <div class="member-favorites-list" style="margin-top:10px;">
        ${followerRows.length === 0 ? `<p class="member-note">${t('membersViewerEmpty')}</p>` : followerRows.map(m => `
          <div class="member-fav-row">
            <span class="member-fav-photo">${m.photo ? `<img src="${escAttr(m.photo)}" loading="lazy" decoding="async">` : '🙂'}</span>
            <span class="member-fav-name">${escText(m.name) || t('nameUndefined')}</span>
          </div>`).join('')}
      </div>
    `, skipAnim);
    renderLevelBarGeneric('member-uxd-level-bar', UXD_TIERS, data.uxd || 0, 'uxdLabel', 'uxdLevelDesc');
  };
  if(cached){ paint(cached.followingRows, cached.followerRows); } // rendu instantané depuis le cache
  else{ paintTabBody(`<span class="gallery-empty">${t('chatLoading')}</span>`); }
  try{
    if(auth && !auth.currentUser){ try{ await auth.signInAnonymously(); }catch(e){} }
    const followingCreators = data.followingCreators || [];
    const followingRows = followingCreators
      .map(id => (typeof roster !== 'undefined' ? roster.find(m => m.id === id) : null))
      .filter(Boolean);
    const followersSnap = await db.collection('profiles').where('followingMembers', 'array-contains', user.uid).get();
    const followerRows = followersSnap.docs
      .map(d => (typeof roster !== 'undefined' ? roster.find(m => m.id === d.id) : null))
      .filter(Boolean);
    setMemberTabCache(user.uid, 'popularity', { followingRows, followerRows });
    if(memberActiveTab === 'popularity') paint(followingRows, followerRows, true); // ré-affiche seulement si toujours sur cet onglet, sans rejouer l'animation
  }catch(e){
    console.error('renderMemberPopularityTab error', e);
    if(!cached && memberActiveTab === 'popularity') paintTabBody(`<span class="gallery-empty">${(LANG==='fr'?'Erreur : ':'Error: ')}${escText(e.message||String(e))}</span>`);
  }
}

function renderMemberFavoritesTab(user, data){
  const favIds = data.favorites || [];
  const favModels = favIds.map(id => (typeof roster !== 'undefined' ? roster.find(m => m.id === id) : null)).filter(Boolean);
  const hypeLine = `<p class="member-welcome-line" style="margin:0 0 12px;">${t('memberFavoritesHype')}</p>`;
  if(!favModels.length){
    paintTabBody(`${hypeLine}<p class="member-note">${t('memberFavoritesNone')}</p>`);
    return;
  }
  const tabBody = paintTabBody(`
    ${hypeLine}
    <div class="member-favorites-list">
      ${favModels.map(m => `
        <button type="button" class="member-fav-row" data-id="${m.id}">
          <span class="member-fav-photo">${m.photo ? `<img src="${escAttr(m.photo)}" alt="" loading="lazy" decoding="async">` : '🙂'}</span>
          <span class="member-fav-name">${escText(m.name) || t('nameUndefined')}</span>
          <span class="member-fav-arrow">→</span>
        </button>
      `).join('')}
    </div>
  `);
  tabBody.querySelectorAll('.member-fav-row').forEach(btn => {
    btn.onclick = async () => {
      window.location.hash = 'vitrine/' + btn.dataset.id;
      await openVitrine(btn.dataset.id);
    };
  });
}

function promptSignupForMembersOnly(reason){
  toast(reason === 'chat' ? t('visitorNeedsAccountChat') : reason === 'purchase' ? t('visitorNeedsAccountPurchase') : t('visitorNeedsAccountFavorite'));
  closeBurgerMenu();
  hideAllShells();
  document.getElementById('member-shell').style.display = 'block';
  if(typeof updateTopbarHeight === 'function') setTimeout(updateTopbarHeight, 0);
  if(typeof updateBottomNavVisibility === 'function') setTimeout(updateBottomNavVisibility, 0);
  renderMemberSignup();
}
async function toggleMemberFavorite(creatorId){
  if(!memberAuth || !memberAuth.currentUser || memberAuth.currentUser.isAnonymous){
    promptSignupForMembersOnly('favorite');
    return;
  }
  const user = memberAuth.currentUser;
  try{
    const ref = memberDb.collection('members').doc(user.uid);
    const doc = await ref.get();
    let favorites = (doc.exists && doc.data().favorites) || [];
    const isFav = favorites.includes(creatorId);
    favorites = isFav ? favorites.filter(id => id !== creatorId) : [...favorites, creatorId];
    await ref.set({ favorites }, { merge: true });
    toast(isFav ? t('memberFavoriteRemoved') : t('memberFavoriteAdded'));
    refreshFavoriteButtons(favorites);
  }catch(e){
    console.error('toggle favorite error', e);
    toast(t('memberErrUnknown'));
  }
}
function refreshFavoriteButtons(favorites){
  document.querySelectorAll('.card-fav-btn, .room-fav-btn').forEach(btn => {
    const isFav = favorites.includes(btn.dataset.id);
    btn.classList.toggle('active', isFav);
    btn.textContent = isFav ? '♥' : '♡';
    btn.classList.add('state-ready');
  });
}
async function initFavoriteButtonsState(){
  if(!memberAuth || !memberAuth.currentUser || memberAuth.currentUser.isAnonymous){
    document.querySelectorAll('.card-fav-btn, .room-fav-btn').forEach(btn => btn.classList.add('state-ready'));
    return;
  }
  try{
    const doc = await memberDb.collection('members').doc(memberAuth.currentUser.uid).get();
    const favorites = (doc.exists && doc.data().favorites) || [];
    refreshFavoriteButtons(favorites);
  }catch(e){
    document.querySelectorAll('.card-fav-btn, .room-fav-btn').forEach(btn => btn.classList.add('state-ready'));
  }
}

/* ================= CHAT EN DIRECT (membre ↔ créatrice) ================= */
let chatCtx = null;
let chatUnsubMessages = null;
let chatUnsubConv = null;
let chatTypingIdleTimer = null;
let chatMyTypingTimer = null;
let chatActiveTab = 'libre'; // 'libre' (discussion libre) ou 'commandes' (demandes de commande uniquement)
let chatLastSnapDocs = [];

// Regroupe le rendu des messages, filtré par onglet actif — appelé à chaque nouveau
// message (via onSnapshot) ET à chaque changement d'onglet (sans nouvelle requête,
// on réutilise les messages déjà reçus dans chatLastSnapDocs).
function renderChatMessages(ctx, convRef, unreadField){
  const box = document.getElementById('chat-messages');
  if(!box) return;
  const allDocs = chatLastSnapDocs;
  const docs = allDocs.filter(d => chatActiveTab === 'commandes' ? !!d.data().customOrderRequest : !d.data().customOrderRequest);
  if(docs.length === 0){
    box.innerHTML = `<span class="chat-empty-note">${chatActiveTab === 'commandes' ? t('chatNoOrdersNote') : t('chatEmptyNote')}</span>`;
    return;
  }
  const wasNearBottom = (box.scrollHeight - box.scrollTop - box.clientHeight) < 80;
  box.innerHTML = docs.map(docSnap => {
    const m = docSnap.data();
    const mine = m.senderType === ctx.viewerType;
    const avatarHtml = !mine
      ? (ctx.otherPhoto ? `<img class="dm-avatar" src="${escAttr(ctx.otherPhoto)}" alt="" loading="lazy" decoding="async">` : HONEYMOON_LOGO_FALLBACK_HTML)
      : (ctx.myPhoto ? `<img class="dm-avatar" src="${escAttr(ctx.myPhoto)}" alt="" loading="lazy" decoding="async">` : HONEYMOON_LOGO_FALLBACK_HTML);
    const otherBadgeHtml = ctx.viewerType === 'creator' ? uxdShieldHtml(ctx.otherUxd) : followerShieldHtml((typeof roster !== 'undefined' && roster.find(x => x.id === ctx.profileId) || {}).followersCount);
    const myBadgeHtml = ctx.viewerType === 'creator' ? followerShieldHtml((typeof roster !== 'undefined' && roster.find(x => x.id === ctx.profileId) || {}).followersCount) : uxdShieldHtml(ctx.myUxd || 0);
    const myName = ctx.viewerType === 'member' ? (ctx.memberUsername || t('nameUndefined')) : (ctx.creatorName || t('nameUndefined'));
    const nameHtml = `<div class="dm-sender-name">${escText(mine ? myName : (ctx.otherName || t('nameUndefined')))} ${mine ? myBadgeHtml : otherBadgeHtml}</div>`;
    const likedBy = m.likedBy || [];
    const isLiked = likedBy.includes(ctx.viewerType);
    const likeCount = likedBy.length;

    if(m.customOrderRequest){
      const isDelivered = m.customOrderStatus === 'delivered';
      const isTip = m.orderKind === 'tip';
      let actionHtml = '';
      if(ctx.viewerType === 'creator' && !isDelivered){
        actionHtml = isTip
          ? `<button type="button" class="custom-order-action-btn tip-order-deliver-btn" data-docid="${docSnap.id}" data-url="${escAttr(m.tipContentUrl || '')}" data-type="${escAttr(m.tipContentType || 'photo')}" data-price="${escAttr(m.tipPrice || '')}">${ICON_GIFT} ${t('tipOrderDeliverBtn')}</button>`
          : `<button type="button" class="custom-order-action-btn custom-order-deliver-btn" data-docid="${docSnap.id}" data-text="${escAttr(m.text || '')}">${ICON_GIFT} ${t('customOrderDeliverBtn')}</button>`;
      }else if(ctx.viewerType === 'member' && isDelivered){
        actionHtml = `<button type="button" class="custom-order-action-btn custom-order-unlock-btn" data-docid="${docSnap.id}" data-url="${escAttr(m.deliveredContentUrl || '')}" data-type="${escAttr(m.deliveredContentType || 'photo')}" data-text="${escAttr(m.text || '')}">${ICON_LOCK} ${t('customOrderViewBtn')}</button>`;
      }else if(isDelivered){
        actionHtml = `<span class="custom-order-status-tag">✓ ${t('customOrderDeliveredNote')}</span>`;
      }else{
        actionHtml = `<span class="custom-order-status-tag pending">${t('customOrderPendingNote')}</span>`;
      }
      return `
        <div class="dm-bubble-row ${mine ? 'mine' : 'theirs'}">
          <div class="dm-sender-row">${avatarHtml}${nameHtml}</div>
          <div class="custom-order-card ${isTip ? 'tip-order-card' : ''}">
            <div class="custom-order-card-head">${ICON_CART} <b>${isTip ? t('tipOrderCardLabel') : t('customOrderBtnLabel')}</b></div>
            <p class="custom-order-card-text">${escText(m.text || '')}</p>
            ${actionHtml}
          </div>
          <div class="dm-bubble-footer">
            <span class="dm-bubble-time">${formatChatTime(m.createdAt)}</span>
          </div>
        </div>`;
    }

    return `
      <div class="dm-bubble-row ${mine ? 'mine' : 'theirs'}">
        <div class="dm-sender-row">${avatarHtml}${nameHtml}</div>
        <div class="dm-bubble-wrap">
          <div class="dm-bubble" data-docid="${docSnap.id}">${m.audioUrl ? `<audio controls src="${escAttr(m.audioUrl)}" style="width:220px;max-width:100%;height:34px;display:block;"></audio>${m.text ? `<div style="margin-top:6px;">${escText(m.text)}</div>` : ''}` : escText(m.text || '')}</div>
          <button type="button" class="dm-menu-btn" data-docid="${docSnap.id}" data-text="${escAttr(m.text || '')}" data-mine="${mine ? '1' : '0'}">⋮</button>
        </div>
        <div class="dm-bubble-footer">
          <button type="button" class="dm-like-btn ${isLiked ? 'liked' : ''}" data-docid="${docSnap.id}">❤ ${likeCount > 0 ? likeCount : ''}</button>
          <span class="dm-bubble-time">${formatChatTime(m.createdAt)}</span>
        </div>
      </div>`;
  }).join('');
  box.querySelectorAll('.dm-menu-btn').forEach(btn => {
    btn.onclick = (e) => openChatMessageMenu(e, btn.dataset.docid, btn.dataset.text, btn.dataset.mine === '1');
  });
  box.querySelectorAll('.dm-like-btn').forEach(btn => {
    btn.onclick = () => toggleMessageLike(btn.dataset.docid);
  });
  box.querySelectorAll('.custom-order-deliver-btn').forEach(btn => {
    btn.onclick = () => openOrderDelivery(ctx, btn.dataset.docid, btn.dataset.text);
  });
  box.querySelectorAll('.tip-order-deliver-btn').forEach(btn => {
    btn.onclick = () => quickDeliverTipOrder(ctx, btn.dataset.docid, btn.dataset.url, btn.dataset.type, btn.dataset.price);
  });
  box.querySelectorAll('.custom-order-unlock-btn').forEach(btn => {
    btn.onclick = () => {
      unlockDeliveredOrder(btn.dataset.url, btn.dataset.type, btn.dataset.text, ctx.otherName);
      saveDeliveredOrderToPurchases(ctx, btn.dataset.text, btn.dataset.url, btn.dataset.type);
    };
  });
  box.querySelectorAll('.dm-bubble').forEach(bubble => {
    let lastTap = 0;
    bubble.addEventListener('click', () => {
      const now = Date.now();
      if(now - lastTap < 320){ toggleMessageLike(bubble.dataset.docid); spawnFloatingReaction('❤️'); }
      lastTap = now;
    });
  });
  if(wasNearBottom) box.scrollTop = box.scrollHeight;
  // Marque comme lu à chaque nouveau message reçu pendant que la fenêtre est ouverte.
  convRef.set({ [unreadField]: 0 }, { merge: true }).catch(() => {});
}
function updateChatTabBadges(){
  const ordersCount = chatLastSnapDocs.filter(d => d.data().customOrderRequest && d.data().customOrderStatus !== 'delivered').length;
  const badge = document.getElementById('chat-tab-orders-badge');
  if(badge){
    if(ordersCount > 0){ badge.style.display = 'inline-flex'; badge.textContent = ordersCount > 99 ? '99+' : String(ordersCount); }
    else { badge.style.display = 'none'; }
  }
}
function switchChatTab(tab){
  chatActiveTab = tab;
  document.querySelectorAll('.chat-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const topicsRow = document.getElementById('chat-topics-row');
  if(topicsRow) topicsRow.style.display = tab === 'libre' ? 'flex' : 'none';
  if(chatCtx){
    const convRef = chatDb(chatCtx.viewerType).collection('profiles').doc(chatCtx.profileId).collection('conversations').doc(chatCtx.memberUid);
    const unreadField = chatCtx.viewerType === 'member' ? 'memberUnreadCount' : 'creatorUnreadCount';
    renderChatMessages(chatCtx, convRef, unreadField);
  }
}
document.querySelectorAll('.chat-tab-btn').forEach(btn => { btn.onclick = () => switchChatTab(btn.dataset.tab); });

/* ---------------- sujets de discussion suggérés (chips défilables, onglet libre uniquement) ---------------- */
const CHAT_TOPICS = [
  { key: 'day', emoji: '☀️' }, { key: 'travel', emoji: '✈️' }, { key: 'music', emoji: '🎵' },
  { key: 'movies', emoji: '🎬' }, { key: 'desires', emoji: '🔥' }, { key: 'compliments', emoji: '💫' },
  { key: 'teasing', emoji: '😏' }, { key: 'secrets', emoji: '🤫' }, { key: 'style', emoji: '👗' },
  { key: 'dreams', emoji: '✨' }, { key: 'humor', emoji: '😄' }, { key: 'food', emoji: '🍓' },
  { key: 'perfectNight', emoji: '🌙' }, { key: 'memories', emoji: '💭' }, { key: 'wellness', emoji: '🛁' },
  { key: 'nowPlaying', emoji: '🎧' }, { key: 'common', emoji: '💞' }, { key: 'weekend', emoji: '🥂' },
  { key: 'littleSecret', emoji: '🔑' }, { key: 'reunion', emoji: '💌' }
];
const CHAT_TOPIC_COLORS = ['#e2637c', '#c94f6a', '#d4af37', '#b84a63', '#e07a91', '#a83850'];
function wireChatTopics(){
  const row = document.getElementById('chat-topics-row');
  if(!row || row.dataset.wired) return;
  row.dataset.wired = '1';
  row.innerHTML = CHAT_TOPICS.map((tp, i) => `
    <button type="button" class="chat-topic-chip" data-key="${tp.key}" style="--chip-color:${CHAT_TOPIC_COLORS[i % CHAT_TOPIC_COLORS.length]};">
      ${tp.emoji} ${t('chatTopic_' + tp.key)}
    </button>`).join('');
  row.querySelectorAll('.chat-topic-chip').forEach(chip => {
    chip.onclick = () => {
      const input = document.getElementById('chat-input');
      if(!input) return;
      const topicLabel = t('chatTopic_' + chip.dataset.key);
      input.value = t('chatTopicStarterTemplate').replace('{topic}', topicLabel.toLowerCase());
      input.focus();
      const len = input.value.length;
      input.setSelectionRange(len, len);
    };
  });
}

function formatChatTime(ts){
  let d;
  if(ts && typeof ts.toDate === 'function') d = ts.toDate();
  else if(ts) d = new Date(ts);
  else return '';
  const pad = n => String(n).padStart(2, '0');
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : `${pad(d.getDate())}/${pad(d.getMonth()+1)} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function closeChatListeners(){
  if(chatUnsubMessages){ chatUnsubMessages(); chatUnsubMessages = null; }
  if(chatUnsubConv){ chatUnsubConv(); chatUnsubConv = null; }
  if(chatTypingIdleTimer){ clearTimeout(chatTypingIdleTimer); chatTypingIdleTimer = null; }
  if(chatMyTypingTimer){ clearTimeout(chatMyTypingTimer); chatMyTypingTimer = null; }
}

// Choisit la bonne instance Firestore selon qui écrit dans la conversation :
// un membre est authentifié via memberAuth/memberDb, jamais via auth/db
// (réservée à la créatrice/admin) — sinon les Firestore Rules voient
// request.auth.uid ne correspondant à rien et renvoient permission-denied.
function chatDb(viewerType){
  return viewerType === 'member' ? memberDb : db;
}
async function openChat(ctx){
  chatCtx = ctx;
  closeChatListeners();

  document.getElementById('chat-header-avatar').innerHTML = ctx.otherPhoto ? `<img src="${escAttr(ctx.otherPhoto)}" alt="" loading="lazy" decoding="async">` : '🍯';
  document.getElementById('chat-header-name').textContent = ctx.otherName || '';
  document.getElementById('chat-header-status').textContent = '';
  wireChatModPanel();
  wireChatOccasionPanel(ctx);
  wireChatBot(ctx);
  const cartBtn = document.getElementById('chat-cart-btn');
  const cartHelpBtn = document.getElementById('chat-cart-help-btn');
  const cartHelpPanel = document.getElementById('chat-cart-help-panel');
  if(cartBtn){
    if(ctx.viewerType === 'member'){
      cartBtn.style.display = 'flex';
      cartBtn.innerHTML = `${ICON_CART}`;
      cartBtn.title = t('customOrderBtnLabel');
      cartBtn.onclick = () => openCustomOrderForm(ctx);
      cartHelpBtn.style.display = 'flex';
      cartHelpBtn.innerHTML = ICON_HELP;
      cartHelpPanel.innerHTML = `
        <p class="chat-mod-tip">${t('customOrderHelp1')}</p>
        <p class="chat-mod-tip">${t('customOrderHelp2')}</p>
        <p class="chat-mod-tip">${t('customOrderHelp3')}</p>
        <p class="chat-mod-rule">${t('customOrderHelp4')}</p>
      `;
      cartHelpPanel.classList.remove('open');
      cartHelpBtn.onclick = () => { cartHelpPanel.style.display = cartHelpPanel.classList.contains('open') ? 'none' : 'block'; cartHelpPanel.classList.toggle('open'); };
    }else{
      cartBtn.style.display = 'none';
      cartHelpBtn.style.display = 'none';
      cartHelpPanel.style.display = 'none';
    }
  }
  document.getElementById('chat-input').value = ctx.prefillText || '';
  document.getElementById('chat-messages').innerHTML = `<span class="chat-empty-note">${t('chatLoading')}</span>`;
  document.getElementById('chat-backdrop').classList.add('open');
  // Fluidité "espace membre" appliquée uniquement quand c'est un membre qui ouvre le chat
  // (pas quand c'est la créatrice/agence qui répond depuis son tableau de bord).
  document.getElementById('chat-modal').classList.toggle('member-space-modal', ctx.viewerType === 'member');
  document.getElementById('chat-modal').classList.add('open');
  wireChatReactionRail();
  wireChatTopics();

  const convRef = chatDb(ctx.viewerType).collection('profiles').doc(ctx.profileId).collection('conversations').doc(ctx.memberUid);
  const unreadField = ctx.viewerType === 'member' ? 'memberUnreadCount' : 'creatorUnreadCount';
  const typingField = ctx.viewerType === 'member' ? 'creatorTyping' : 'memberTyping';
  const myTypingField = ctx.viewerType === 'member' ? 'memberTyping' : 'creatorTyping';
  let lastSeenReactionAt = Date.now();
  chatActiveTab = 'libre';
  chatLastSnapDocs = [];
  document.querySelectorAll('.chat-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === 'libre'));
  const topicsRow0 = document.getElementById('chat-topics-row');
  if(topicsRow0) topicsRow0.style.display = 'flex';
  updateChatTabBadges();

  // Marque comme lu dès l'ouverture.
  convRef.set({ [unreadField]: 0 }, { merge: true }).catch(() => {});

  chatUnsubConv = convRef.onSnapshot(doc => {
    const d = doc.data() || {};
    const typing = d[typingField];
    const typingAt = typing && d[typingField + 'At'] && d[typingField + 'At'].toDate ? d[typingField + 'At'].toDate().getTime() : 0;
    const isFresh = typing && (Date.now() - typingAt) < 4000;
    document.getElementById('chat-header-status').innerHTML = isFresh
      ? `${escText(t('chatTypingIndicator'))} <span class="chat-typing-dots"><span></span><span></span><span></span></span>`
      : '';
    // Réaction en direct envoyée par l'autre personne : animation seulement, jamais stockée comme message.
    const lr = d.liveReaction;
    if(lr && lr.from !== ctx.viewerType && lr.at > lastSeenReactionAt){
      lastSeenReactionAt = lr.at;
      spawnFloatingReaction(lr.key);
      playChatReceiveSound();
    }
  }, (e) => console.error('chat conv listener error', e));

  chatUnsubMessages = chatDb(ctx.viewerType).collection('profiles').doc(ctx.profileId).collection('conversations').doc(ctx.memberUid)
    .collection('messages').orderBy('createdAt', 'asc').limit(200)
    .onSnapshot(snap => {
      const prevCount = chatLastSnapDocs.length;
      if(snap.docs.length > prevCount && prevCount > 0){
        const lastDoc = snap.docs[snap.docs.length - 1].data();
        if(lastDoc.senderType !== ctx.viewerType) playChatReceiveSound();
      }
      chatLastSnapDocs = snap.docs;
      updateChatTabBadges();
      renderChatMessages(ctx, convRef, unreadField);
    }, (e) => {
      console.error('chat messages listener error', e);
      document.getElementById('chat-messages').innerHTML = `<span class="chat-empty-note">${(LANG==='fr'?'Erreur : ':'Error: ')}${escText(e.message||String(e))}</span>`;
    });

  document.getElementById('chat-input').oninput = () => {
    if(chatMyTypingTimer) clearTimeout(chatMyTypingTimer);
    convRef.set({ [myTypingField]: true, [myTypingField + 'At']: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
    chatMyTypingTimer = setTimeout(() => {
      convRef.set({ [myTypingField]: false }, { merge: true }).catch(() => {});
    }, 2500);
  };
}

function openChatMessageMenu(e, docId, text, isMine){
  document.querySelectorAll('.dm-menu-popover').forEach(p => p.remove());
  const btn = e.currentTarget;
  const rect = btn.getBoundingClientRect();
  const pop = document.createElement('div');
  pop.className = 'dm-menu-popover';
  pop.style.top = (rect.bottom + window.scrollY + 4) + 'px';
  pop.style.left = Math.max(8, rect.left + window.scrollX - 100) + 'px';
  pop.innerHTML = `
    <button type="button" id="dm-menu-report">${ICON_FLAG} ${t('chatReportMessage')}</button>
    ${isMine ? `<button type="button" id="dm-menu-delete">${ICON_TRASH} ${t('chatDeleteMessage')}</button>` : ''}
  `;
  document.body.appendChild(pop);
  pop.querySelector('#dm-menu-report').onclick = () => {
    pop.remove();
    if(!chatCtx) return;
    openReportModal({
      profile: chatCtx.creatorName || chatCtx.otherName || '',
      details: `${t('reportCommentPrefix')}: "${text}"`
    });
  };
  const deleteBtn = pop.querySelector('#dm-menu-delete');
  if(deleteBtn) deleteBtn.onclick = async () => {
    pop.remove();
    if(!chatCtx || !docId) return;
    if(!confirm(t('chatDeleteMessageConfirm'))) return;
    try{
      const msgRef = chatDb(chatCtx.viewerType).collection('profiles').doc(chatCtx.profileId)
        .collection('conversations').doc(chatCtx.memberUid).collection('messages').doc(docId);
      await msgRef.delete();
    }catch(e){ console.error('delete message error', e); toast(t('memberErrUnknown')); }
  };
  const dismiss = (ev) => { if(!pop.contains(ev.target)){ pop.remove(); document.removeEventListener('click', dismiss); } };
  setTimeout(() => document.addEventListener('click', dismiss), 0);
}

function closeChat(){
  closeChatListeners();
  stopChatBanner();
  if(chatCtx){
    const convRef = chatDb(chatCtx.viewerType).collection('profiles').doc(chatCtx.profileId).collection('conversations').doc(chatCtx.memberUid);
    const myTypingField = chatCtx.viewerType === 'member' ? 'memberTyping' : 'creatorTyping';
    convRef.set({ [myTypingField]: false }, { merge: true }).catch(() => {});
  }
  chatCtx = null;
  document.getElementById('chat-backdrop').classList.remove('open');
  document.getElementById('chat-modal').classList.remove('open');
}
document.getElementById('chat-backdrop').onclick = closeChat;
document.getElementById('chat-back-btn').onclick = closeChat;

/* ---------------- emojis du chat + son d'envoi ---------------- */
const CHAT_EMOJIS = [
  '😀','😂','🤣','😍','🥰','😘','😉','😊','😎','🤩','🥳','😏','😳','🙈','😴','🤤',
  '😢','😭','😡','😱','🤔','😅','🙄','😴','🥵','🥶','😈','🤯','😜','🫦','🤭','😬',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','💕','💗','💖','💘','💝','💋','🔥','✨',
  '👍','👎','👏','🙏','💪','🤝','👉','👌','✌️','🤞','👋','💦',
  '🍆','🍑','🍒','🥒','🍌','🍈','🥭','🍯','🍓','🌶️'
];
document.getElementById('chat-emoji-picker').innerHTML = CHAT_EMOJIS.map(e => `<button type="button">${e}</button>`).join('');
document.getElementById('chat-emoji-picker').querySelectorAll('button').forEach(btn => {
  btn.onclick = () => {
    const input = document.getElementById('chat-input');
    input.value += btn.textContent;
    input.focus();
  };
});
document.getElementById('chat-emoji-btn').onclick = () => {
  const picker = document.getElementById('chat-emoji-picker');
  picker.style.display = picker.style.display === 'none' ? 'grid' : 'none';
};
const CHAT_REACTION_ICONS = {
  gift: () => ICON_GIFT, heart: () => ICON_HEART_SM, like: () => ICON_THUMBSUP,
  happy: () => ICON_SMILE, sad: () => ICON_FROWN
};
function spawnFloatingReaction(key){
  const layer = document.getElementById('chat-float-layer');
  if(!layer) return;
  const span = document.createElement('span');
  span.className = 'chat-float-emoji';
  const getIcon = CHAT_REACTION_ICONS[key];
  span.innerHTML = getIcon ? getIcon() : key;
  span.style.right = (20 + Math.random() * 30) + 'px';
  layer.appendChild(span);
  setTimeout(() => span.remove(), 2300);
}
async function toggleMessageLike(docId){
  if(!chatCtx || !docId) return;
  const ctx = chatCtx;
  const msgRef = chatDb(ctx.viewerType).collection('profiles').doc(ctx.profileId).collection('conversations').doc(ctx.memberUid).collection('messages').doc(docId);
  try{
    const doc = await msgRef.get();
    const likedBy = (doc.exists && doc.data().likedBy) || [];
    const isLiked = likedBy.includes(ctx.viewerType);
    await msgRef.set({
      likedBy: isLiked ? firebase.firestore.FieldValue.arrayRemove(ctx.viewerType) : firebase.firestore.FieldValue.arrayUnion(ctx.viewerType)
    }, { merge: true });
  }catch(e){ console.error('toggleMessageLike error', e); }
}
function wireChatReactionRail(){
  const rail = document.getElementById('chat-reaction-rail');
  if(!rail || rail.dataset.wired) return;
  rail.dataset.wired = '1';
  const reactions = [
    { key: 'gift', icon: ICON_GIFT, title: 'Cadeau' },
    { key: 'heart', icon: ICON_HEART_SM, title: 'Cœur' },
    { key: 'like', icon: ICON_THUMBSUP, title: "J'aime" },
    { key: 'happy', icon: ICON_SMILE, title: 'Content' },
    { key: 'sad', icon: ICON_FROWN, title: 'Pas content' }
  ];
  rail.innerHTML = reactions.map(r => `<button type="button" class="chat-reaction-btn" data-reaction="${r.key}" title="${r.title}">${r.icon}</button>`).join('');
  rail.querySelectorAll('.chat-reaction-btn').forEach(btn => {
    btn.onclick = async () => {
      if(btn.dataset.reaction === 'gift' && chatCtx && chatCtx.viewerType === 'member'){
        openGiftTipPicker();
        return;
      }
      spawnFloatingReaction(btn.dataset.reaction);
      playChatSendSound();
      if(!chatCtx) return;
      const ctx = chatCtx;
      try{
        // Réaction éphémère : signal en direct, jamais enregistrée dans l'historique des messages.
        const convRef = chatDb(ctx.viewerType).collection('profiles').doc(ctx.profileId).collection('conversations').doc(ctx.memberUid);
        await convRef.set({
          liveReaction: { key: btn.dataset.reaction, from: ctx.viewerType, at: Date.now() }
        }, { merge: true });
      }catch(e){ console.error('send live reaction error', e); }
    };
  });
}
function openGiftTipPicker(){
  if(!chatCtx) return;
  document.querySelectorAll('.gift-tip-popover').forEach(p => p.remove());
  const amounts = [1, 2, 5, 10, 15, 20, 30, 50, 75, 100];
  const pop = document.createElement('div');
  pop.className = 'gift-tip-popover';
  pop.innerHTML = `
    <div class="gift-tip-title">${ICON_GIFT} ${t('giftTipTitle')}</div>
    <div class="tabs-slide-row">
      <div class="tabs-arrows-row">
        <button type="button" class="level-arrow tabs-arrow-left" data-target="gift-tip-track">‹</button>
        <button type="button" class="level-arrow tabs-arrow-right" data-target="gift-tip-track">›</button>
      </div>
      <div class="gift-tip-track" id="gift-tip-track">
        ${amounts.map(a => `<button type="button" class="gift-tip-amount-btn" data-amount="${a}">${a}€</button>`).join('')}
      </div>
    </div>
    <button type="button" class="btn btn-ghost btn-sm" id="gift-tip-cancel" style="margin-top:10px;width:100%;">${t('memberBioCancelBtn')}</button>
  `;
  document.body.appendChild(pop);
  wireSlideArrows(pop);
  pop.querySelectorAll('.gift-tip-amount-btn').forEach(btn => {
    btn.onclick = () => {
      const amount = parseInt(btn.dataset.amount, 10);
      pop.remove();
      sendGiftTip(amount);
    };
  });
  document.getElementById('gift-tip-cancel').onclick = () => pop.remove();
  const dismiss = (ev) => { if(!pop.contains(ev.target)){ pop.remove(); document.removeEventListener('click', dismiss); } };
  setTimeout(() => document.addEventListener('click', dismiss), 0);
}
async function sendGiftTip(amount){
  if(!chatCtx) return;
  const ctx = chatCtx;
  const orderText = t('giftTipMessageText').replace('{amount}', amount);
  try{
    const convRef = memberDb.collection('profiles').doc(ctx.profileId).collection('conversations').doc(ctx.memberUid);
    await convRef.collection('messages').add({
      senderType: 'member', text: orderText, customOrderRequest: true, customOrderStatus: 'pending',
      orderKind: 'giftTip', tipPrice: amount,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await convRef.set({
      memberUid: ctx.memberUid, memberUsername: ctx.memberUsername || '', creatorName: ctx.creatorName || '',
      lastMessageText: '🎁 ' + orderText, lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastSenderType: 'member', creatorUnreadCount: firebase.firestore.FieldValue.increment(1),
      pendingCustomOrderCount: firebase.firestore.FieldValue.increment(1)
    }, { merge: true });
    toast(t('giftTipSentToast'));
    playChatSendSound();
  }catch(e){ console.error('send gift tip error', e); toast(t('memberErrUnknown')); }
}
function wireChatModPanel(){
  const btn = document.getElementById('chat-mod-btn');
  const panel = document.getElementById('chat-mod-panel');
  if(!btn || !panel) return;
  btn.innerHTML = `${ICON_SHIELD}<span>${t('chatModBtnLabel')}</span>`;
  panel.innerHTML = `
    <p class="chat-mod-tip">${t('chatModTip1')}</p>
    <p class="chat-mod-tip">${t('chatModTip2')}</p>
    <p class="chat-mod-rule">${t('chatRulesBanner')}</p>
  `;
  panel.classList.remove('open');
  btn.onclick = () => panel.classList.toggle('open');
}

/* ---------------- Phrases toutes faites pour les occasions (créatrice) ----------------
   Bouton à côté de "Tips & rules" dans le chat : propose des messages prêts à poster
   pour anniversaire / Pâques / nouvel an / Saint-Valentin / Noël, avec l'emoji assorti,
   ou laisse la créatrice écrire son propre texte ("Personnalisé"). Traductions
   intégrées ici (comme MASK_ADVICE_TEXT / FAQ_ITEMS) pour ne pas dépendre des
   fichiers i18n-*.js. ---------------- */
const OCCASION_TEMPLATES = [
  { key: 'birthday', emoji: '🎂', text: {
    fr: "C'est mon anniversaire aujourd'hui ! 🎂🥳 J'adorerais le fêter avec toi — n'hésite pas à m'envoyer tes vœux 💛",
    en: "It's my birthday today! 🎂🥳 I'd love to celebrate it with you — feel free to send your wishes 💛",
    es: "¡Hoy es mi cumpleaños! 🎂🥳 Me encantaría celebrarlo contigo — no dudes en enviarme tus felicitaciones 💛",
    it: "Oggi è il mio compleanno! 🎂🥳 Mi piacerebbe festeggiarlo con te — non esitare a mandarmi i tuoi auguri 💛",
  }},
  { key: 'easter', emoji: '🐣', text: {
    fr: "Joyeuses Pâques ! 🐣🌸 Je te souhaite une journée douce et pleine de bonheur.",
    en: "Happy Easter! 🐣🌸 Wishing you a sweet day full of joy.",
    es: "¡Feliz Pascua! 🐣🌸 Te deseo un día dulce y lleno de alegría.",
    it: "Buona Pasqua! 🐣🌸 Ti auguro una giornata dolce e piena di gioia.",
  }},
  { key: 'newyear', emoji: '🎆', text: {
    fr: "Bonne année ! 🎆✨ Merci d'être là avec moi, à une année incroyable ensemble.",
    en: "Happy New Year! 🎆✨ Thank you for being here with me, here's to an amazing year together.",
    es: "¡Feliz Año Nuevo! 🎆✨ Gracias por estar aquí conmigo, brindo por un año increíble juntos.",
    it: "Buon Anno! 🎆✨ Grazie per essere qui con me, brindiamo a un anno fantastico insieme.",
  }},
  { key: 'valentine', emoji: '💘', text: {
    fr: "Joyeuse Saint-Valentin ! 💘💋 Je t'envoie tout mon amour aujourd'hui.",
    en: "Happy Valentine's Day! 💘💋 Sending you all my love today.",
    es: "¡Feliz San Valentín! 💘💋 Te envío todo mi amor hoy.",
    it: "Buon San Valentino! 💘💋 Ti mando tutto il mio amore oggi.",
  }},
  { key: 'christmas', emoji: '🎄', text: {
    fr: "Joyeux Noël ! 🎄🎁 Je te souhaite des fêtes chaleureuses et magiques.",
    en: "Merry Christmas! 🎄🎁 Wishing you warm and magical holidays.",
    es: "¡Feliz Navidad! 🎄🎁 Te deseo unas fiestas cálidas y mágicas.",
    it: "Buon Natale! 🎄🎁 Ti auguro delle feste calde e magiche.",
  }},
];
function wireChatOccasionPanel(ctx){
  const btn = document.getElementById('chat-occasion-btn');
  const panel = document.getElementById('chat-occasion-panel');
  if(!btn || !panel) return;
  if(ctx.viewerType !== 'creator'){
    btn.style.display = 'none';
    panel.style.display = 'none';
    panel.classList.remove('open');
    return;
  }
  btn.style.display = 'flex';
  btn.innerHTML = `${ICON_CALENDAR}<span>${t('chatOccasionBtnLabel')}</span>`;
  panel.style.display = '';
  panel.innerHTML = `
    <p class="chat-mod-tip">${t('chatOccasionNote')}</p>
    <div class="banner-template-row">
      ${OCCASION_TEMPLATES.map(o => `<button type="button" class="banner-template-btn chat-occasion-template-btn" data-key="${o.key}">${o.emoji} ${t('bannerTemplateLabel_' + o.key)}</button>`).join('')}
      <button type="button" class="banner-template-btn chat-occasion-template-btn" data-key="custom">✏️ ${t('bannerTemplateLabel_custom')}</button>
    </div>
  `;
  panel.classList.remove('open');
  btn.onclick = () => panel.classList.toggle('open');
  panel.querySelectorAll('.chat-occasion-template-btn').forEach(b => {
    b.onclick = () => {
      const input = document.getElementById('chat-input');
      if(!input) return;
      if(b.dataset.key !== 'custom'){
        const tpl = OCCASION_TEMPLATES.find(o => o.key === b.dataset.key);
        input.value = tpl ? (tpl.text[LANG] || tpl.text.en) : '';
      }
      panel.classList.remove('open');
      input.focus();
      const len = input.value.length;
      input.setSelectionRange(len, len);
    };
  });
}

let chatBannerTimer = null;
let chatBannerAudioEl = null;
function stopChatBanner(){
  if(chatBannerTimer){ clearInterval(chatBannerTimer); chatBannerTimer = null; }
  if(chatBannerAudioEl){ chatBannerAudioEl.pause(); chatBannerAudioEl = null; }
}
function toggleChatBannerAudio(url){
  if(chatBannerAudioEl && !chatBannerAudioEl.paused){ chatBannerAudioEl.pause(); return; }
  if(!chatBannerAudioEl || chatBannerAudioEl.src !== url){ chatBannerAudioEl = new Audio(url); }
  chatBannerAudioEl.play().catch(e => console.error('banner audio play error', e));
}
// opts : { intervalSec, bgColor, textColor, scroll, scrollDuration, blink, audioUrl }
function startChatBanner(messages, opts){
  opts = opts || {};
  stopChatBanner();
  const el = document.getElementById('chat-banner');
  if(!el) return;
  if((!messages || !messages.length) && !opts.audioUrl){ el.style.display = 'none'; return; }
  el.style.background = opts.bgColor || '';
  el.style.color = opts.textColor || '';
  el.classList.toggle('blinking', !!opts.blink);
  el.classList.toggle('scrolling', !!opts.scroll);
  let i = 0;
  const audioBtnHtml = opts.audioUrl ? `<button type="button" id="chat-banner-audio-btn">🔊</button>` : '';
  const show = () => {
    const msg = (messages && messages.length) ? messages[i % messages.length] : '';
    el.innerHTML = opts.scroll && msg
      ? `${audioBtnHtml}<span style="animation-duration:${Math.max(4, opts.scrollDuration || 10)}s;">${escText(msg)}</span>`
      : `${audioBtnHtml}${escText(msg)}`;
    i++;
    const audioBtn = document.getElementById('chat-banner-audio-btn');
    if(audioBtn) audioBtn.onclick = () => toggleChatBannerAudio(opts.audioUrl);
  };
  show();
  el.style.display = 'block';
  if(messages && messages.length > 1){
    chatBannerTimer = setInterval(show, Math.max(3, opts.intervalSec || 8) * 1000);
  }
}
function chatBannerOptsFromProfile(d){
  return {
    intervalSec: d.autoBannerIntervalSec, bgColor: d.autoBannerBgColor, textColor: d.autoBannerTextColor,
    scroll: !!d.autoBannerScroll, scrollDuration: d.autoBannerScrollDuration, blink: !!d.autoBannerBlink,
    audioUrl: d.autoBannerAudioUrl || ''
  };
}

async function wireChatBot(ctx){
  const btn = document.getElementById('chat-bot-btn');
  const panel = document.getElementById('chat-bot-panel');
  const bannerEl = document.getElementById('chat-banner');
  if(!btn || !panel) return;
  stopChatBanner();
  if(bannerEl) bannerEl.style.display = 'none';

  if(ctx.viewerType !== 'creator'){
    // Côté membre : pas de bouton de configuration, mais la bannière de la créatrice reste visible si elle en a réglé une.
    btn.style.display = 'none';
    panel.style.display = 'none';
    panel.classList.remove('open');
    try{
      const doc = await db.collection('profiles').doc(ctx.profileId).get();
      const d = doc.data() || {};
      if((d.autoBannerMessages && d.autoBannerMessages.length) || d.autoBannerAudioUrl){
        startChatBanner(d.autoBannerMessages || [], chatBannerOptsFromProfile(d));
      }
    }catch(e){ console.error('load banner (member view) error', e); }
    return;
  }

  btn.style.display = 'flex';
  let profileData = {};
  try{
    const doc = await db.collection('profiles').doc(ctx.profileId).get();
    profileData = doc.data() || {};
  }catch(e){ console.error('load chat bot config error', e); }

  if((profileData.autoBannerMessages && profileData.autoBannerMessages.length) || profileData.autoBannerAudioUrl){
    startChatBanner(profileData.autoBannerMessages || [], chatBannerOptsFromProfile(profileData));
  }

  let pendingWelcomeAudioFile = null, welcomeAudioCleared = false;
  let pendingBannerAudioFile = null, bannerAudioCleared = false;
  const originalWelcomeMessage = profileData.autoWelcomeMessage || '';
  const originalBannerMessages = JSON.parse(JSON.stringify(profileData.autoBannerMessages || []));

  const renderBotPanel = () => {
    const banners = profileData.autoBannerMessages || [];
    btn.innerHTML = `${ICON_GIFT}<span>${t('chatBotBtnLabel')}</span>`;
    panel.innerHTML = `
      <label>${t('chatBotWelcomeLabel')}</label>
      <p class="member-note" style="margin:-2px 0 6px;">${t('chatBotWelcomeNote')}</p>
      <div class="banner-template-row">
        ${BANNER_TEMPLATE_KEYS.map(key => `<button type="button" class="banner-template-btn chat-bot-welcome-template-btn" data-key="${key}">${BANNER_TEMPLATE_EMOJI[key]} ${t('bannerTemplateLabel_' + key)}</button>`).join('')}
      </div>
      <textarea id="chat-bot-welcome-text" rows="2" maxlength="300" placeholder="${escAttr(t('chatBotWelcomePh'))}">${escText(profileData.autoWelcomeMessage || '')}</textarea>
      <label style="margin-top:10px;">${t('ideasWelcomeAudioLabel')}</label>
      ${audioRecorderWidgetHtml('chat-bot-welcome-audio', profileData.autoWelcomeAudioUrl || '')}
      <button type="button" class="btn btn-ghost btn-sm" id="chat-bot-welcome-save" style="margin-top:6px;">${t('memberSaveBtn')}</button>
      <button type="button" class="btn btn-ghost btn-sm" id="chat-bot-welcome-cancel" style="margin-top:6px;">${t('memberBioCancelBtn')}</button>

      <div class="bio-narrative-divider" style="margin:16px 0;"></div>

      <label>${t('chatBotBannerLabel')}</label>
      <p class="member-note" style="margin:-2px 0 6px;">${t('chatBotBannerNote')}</p>
      <div class="banner-template-row">
        ${BANNER_TEMPLATE_KEYS.map(key => `<button type="button" class="banner-template-btn chat-bot-banner-template-btn" data-key="${key}">${BANNER_TEMPLATE_EMOJI[key]} ${t('bannerTemplateLabel_' + key)}</button>`).join('')}
      </div>
      <div id="chat-bot-banner-list">
        ${banners.map((b, i) => `
          <div style="display:flex;gap:6px;margin-bottom:6px;">
            <input type="text" class="chat-bot-banner-item" data-idx="${i}" value="${escAttr(b)}" maxlength="120" style="flex:1;">
            <button type="button" class="btn btn-ghost btn-sm chat-bot-banner-rm" data-idx="${i}" style="width:auto;flex-shrink:0;">✕</button>
          </div>`).join('')}
      </div>
      <button type="button" class="btn btn-ghost btn-sm" id="chat-bot-banner-add">+ ${t('chatBotBannerAddBtn')}</button>
      <div class="apply-toggle-row" style="gap:10px;margin-top:12px;">
        <div style="flex:1;">
          <label>${t('bannerColorBgLabel')}</label>
          <input type="color" id="chat-bot-banner-bgcolor" value="${escAttr(profileData.autoBannerBgColor || '#d4af37')}" style="width:100%;height:38px;border-radius:8px;border:1px solid var(--border);background:var(--bg-elev);">
        </div>
        <div style="flex:1;">
          <label>${t('bannerColorTextLabel')}</label>
          <input type="color" id="chat-bot-banner-textcolor" value="${escAttr(profileData.autoBannerTextColor || '#1a1206')}" style="width:100%;height:38px;border-radius:8px;border:1px solid var(--border);background:var(--bg-elev);">
        </div>
      </div>
      <div class="apply-toggle-row" style="margin-top:10px;">
        <button type="button" class="audio-mode-btn ${profileData.autoBannerScroll ? 'active' : ''}" id="chat-bot-banner-scroll-toggle">${t('bannerScrollLabel')}</button>
        <button type="button" class="audio-mode-btn ${profileData.autoBannerBlink ? 'active' : ''}" id="chat-bot-banner-blink-toggle">${t('bannerBlinkLabel')}</button>
      </div>
      <label style="margin-top:10px;">${t('bannerScrollDurationLabel')}</label>
      <input type="number" id="chat-bot-banner-scroll-duration" min="4" max="60" value="${profileData.autoBannerScrollDuration || 10}">
      <label style="margin-top:10px;">${t('chatBotIntervalLabel')}</label>
      <input type="number" id="chat-bot-interval" min="3" max="120" value="${profileData.autoBannerIntervalSec || 8}">
      <label style="margin-top:10px;">${t('bannerAudioLabel')}</label>
      ${audioRecorderWidgetHtml('chat-bot-banner-audio', profileData.autoBannerAudioUrl || '')}
      <button type="button" class="btn btn-primary btn-sm" id="chat-bot-banner-save" style="margin-top:8px;">${t('memberSaveBtn')}</button>
      <button type="button" class="btn btn-ghost btn-sm" id="chat-bot-banner-cancel" style="margin-top:8px;">${t('memberBioCancelBtn')}</button>
    `;
    panel.querySelectorAll('.chat-bot-welcome-template-btn').forEach(b => {
      b.onclick = () => {
        const key = b.dataset.key;
        const ta = document.getElementById('chat-bot-welcome-text');
        ta.value = key === 'custom' ? '' : t('bannerTemplate_' + key);
        ta.focus();
      };
    });
    panel.querySelectorAll('.chat-bot-banner-template-btn').forEach(b => {
      b.onclick = () => {
        const key = b.dataset.key;
        profileData.autoBannerMessages = profileData.autoBannerMessages || [];
        profileData.autoBannerMessages.push(key === 'custom' ? '' : t('bannerTemplate_' + key));
        renderBotPanel();
      };
    });
    wireAudioRecorderWidget('chat-bot-welcome-audio',
      (file) => { pendingWelcomeAudioFile = file; welcomeAudioCleared = false; },
      profileData.autoWelcomeAudioUrl ? () => {
        pendingWelcomeAudioFile = null; welcomeAudioCleared = true;
        const preview = document.getElementById('chat-bot-welcome-audio-record-preview');
        if(preview){ preview.style.display = 'none'; preview.removeAttribute('src'); }
      } : null
    );
    wireAudioRecorderWidget('chat-bot-banner-audio',
      (file) => { pendingBannerAudioFile = file; bannerAudioCleared = false; },
      profileData.autoBannerAudioUrl ? () => {
        pendingBannerAudioFile = null; bannerAudioCleared = true;
        const preview = document.getElementById('chat-bot-banner-audio-record-preview');
        if(preview){ preview.style.display = 'none'; preview.removeAttribute('src'); }
      } : null
    );
    document.getElementById('chat-bot-banner-scroll-toggle').onclick = (e) => e.currentTarget.classList.toggle('active');
    document.getElementById('chat-bot-banner-blink-toggle').onclick = (e) => e.currentTarget.classList.toggle('active');
    document.getElementById('chat-bot-welcome-save').onclick = async () => {
      const text = document.getElementById('chat-bot-welcome-text').value.trim();
      try{
        const update = { autoWelcomeMessage: text };
        if(pendingWelcomeAudioFile){
          update.autoWelcomeAudioUrl = await uploadToR2(auth, pendingWelcomeAudioFile, 'welcome_audio/' + ctx.profileId);
        } else if(welcomeAudioCleared){
          update.autoWelcomeAudioUrl = firebase.firestore.FieldValue.delete();
        }
        await db.collection('profiles').doc(ctx.profileId).set(update, { merge: true });
        profileData.autoWelcomeMessage = text;
        if(pendingWelcomeAudioFile) profileData.autoWelcomeAudioUrl = update.autoWelcomeAudioUrl;
        if(welcomeAudioCleared) profileData.autoWelcomeAudioUrl = '';
        toast(t('memberSavedToast'));
        renderBotPanel();
      }catch(e){ console.error('save auto welcome error', e); toast(t('memberErrUnknown')); }
    };
    document.getElementById('chat-bot-welcome-cancel').onclick = () => {
      document.getElementById('chat-bot-welcome-text').value = originalWelcomeMessage;
      toast(t('memberBioCancelBtn'));
    };
    document.getElementById('chat-bot-banner-add').onclick = () => {
      profileData.autoBannerMessages = profileData.autoBannerMessages || [];
      profileData.autoBannerMessages.push('');
      renderBotPanel();
    };
    panel.querySelectorAll('.chat-bot-banner-rm').forEach(b => {
      b.onclick = () => {
        profileData.autoBannerMessages.splice(parseInt(b.dataset.idx, 10), 1);
        renderBotPanel();
      };
    });
    document.getElementById('chat-bot-banner-save').onclick = async () => {
      const items = Array.from(panel.querySelectorAll('.chat-bot-banner-item')).map(inp => inp.value.trim()).filter(Boolean);
      const intervalSec = Math.max(3, parseInt(document.getElementById('chat-bot-interval').value, 10) || 8);
      const scrollDuration = Math.max(4, parseInt(document.getElementById('chat-bot-banner-scroll-duration').value, 10) || 10);
      const bgColor = document.getElementById('chat-bot-banner-bgcolor').value;
      const textColor = document.getElementById('chat-bot-banner-textcolor').value;
      const scroll = document.getElementById('chat-bot-banner-scroll-toggle').classList.contains('active');
      const blink = document.getElementById('chat-bot-banner-blink-toggle').classList.contains('active');
      try{
        const update = {
          autoBannerMessages: items, autoBannerIntervalSec: intervalSec,
          autoBannerBgColor: bgColor, autoBannerTextColor: textColor,
          autoBannerScroll: scroll, autoBannerScrollDuration: scrollDuration, autoBannerBlink: blink
        };
        if(pendingBannerAudioFile){
          update.autoBannerAudioUrl = await uploadToR2(auth, pendingBannerAudioFile, 'banner_audio/' + ctx.profileId);
        } else if(bannerAudioCleared){
          update.autoBannerAudioUrl = firebase.firestore.FieldValue.delete();
        }
        await db.collection('profiles').doc(ctx.profileId).set(update, { merge: true });
        Object.assign(profileData, update);
        if(pendingBannerAudioFile) profileData.autoBannerAudioUrl = update.autoBannerAudioUrl;
        if(bannerAudioCleared) profileData.autoBannerAudioUrl = '';
        startChatBanner(items, chatBannerOptsFromProfile(profileData));
        toast(t('memberSavedToast'));
        renderBotPanel();
      }catch(e){ console.error('save banner error', e); toast(t('memberErrUnknown')); }
    };
    document.getElementById('chat-bot-banner-cancel').onclick = () => {
      profileData.autoBannerMessages = JSON.parse(JSON.stringify(originalBannerMessages));
      renderBotPanel();
      toast(t('memberBioCancelBtn'));
    };
  };
  renderBotPanel();
  panel.classList.remove('open');
  btn.onclick = () => { panel.style.display = panel.classList.contains('open') ? 'none' : 'block'; panel.classList.toggle('open'); };

  // Envoi automatique du message de bienvenue (texte et/ou audio), max 4 fois par conversation.
  if(profileData.autoWelcomeMessage || profileData.autoWelcomeAudioUrl){
    try{
      const convRef = db.collection('profiles').doc(ctx.profileId).collection('conversations').doc(ctx.memberUid);
      const convDoc = await convRef.get();
      const sentCount = (convDoc.exists && convDoc.data().autoWelcomeSentCount) || 0;
      if(sentCount < 4){
        await convRef.collection('messages').add({
          senderType: 'creator', text: profileData.autoWelcomeMessage || '',
          audioUrl: profileData.autoWelcomeAudioUrl || null,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await convRef.set({
          autoWelcomeSentCount: sentCount + 1,
          lastMessageText: profileData.autoWelcomeMessage || (profileData.autoWelcomeAudioUrl ? '🎤' : ''),
          lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
          lastSenderType: 'creator', memberUid: ctx.memberUid,
          memberUnreadCount: firebase.firestore.FieldValue.increment(1)
        }, { merge: true });
      }
    }catch(e){ console.error('auto welcome send error', e); }
  }
}

/* ---------------- commande personnalisée (membre → créatrice, depuis le chat) ---------------- */
function openCustomOrderForm(ctx){
  document.getElementById('custom-order-body').innerHTML = `
    <h3>${t('customOrderBtnLabel')}</h3>
    <p class="member-note">${t('customOrderFormNote')}</p>
    <textarea id="custom-order-text" rows="4" maxlength="500" placeholder="${escAttr(t('customOrderFormPh'))}"></textarea>
    <div class="modal-actions">
      <button class="btn btn-ghost btn-sm" id="custom-order-cancel" style="flex:1;">${t('galleryClose')}</button>
      <button class="btn btn-primary btn-sm" id="custom-order-send" style="flex:1;">${t('customOrderSendBtn')}</button>
    </div>
  `;
  document.getElementById('custom-order-backdrop').classList.add('open');
  document.getElementById('custom-order-modal').classList.add('open');
  const close = () => {
    document.getElementById('custom-order-backdrop').classList.remove('open');
    document.getElementById('custom-order-modal').classList.remove('open');
  };
  document.getElementById('custom-order-cancel').onclick = close;
  document.getElementById('custom-order-backdrop').onclick = close;
  document.getElementById('custom-order-send').onclick = async () => {
    const text = document.getElementById('custom-order-text').value.trim();
    if(!text) return;
    if(containsBannedWords(text)){ toast(t('commentModerationError')); return; }
    const btn = document.getElementById('custom-order-send');
    btn.disabled = true;
    try{
      const convRef = memberDb.collection('profiles').doc(ctx.profileId).collection('conversations').doc(ctx.memberUid);
      await convRef.collection('messages').add({
        senderType: 'member', text: text, customOrderRequest: true, customOrderStatus: 'pending',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      await convRef.set({
        memberUid: ctx.memberUid, memberUsername: ctx.memberUsername || '', creatorName: ctx.creatorName || '',
        lastMessageText: '📦 ' + t('customOrderBtnLabel'), lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastSenderType: 'member', creatorUnreadCount: firebase.firestore.FieldValue.increment(1),
        pendingCustomOrderCount: firebase.firestore.FieldValue.increment(1)
      }, { merge: true });
      toast(t('customOrderSentToast'));
      close();
    }catch(e){ console.error('send custom order error', e); toast(t('memberErrUnknown')); }
    btn.disabled = false;
  };
}

/* ---------------- livraison (créatrice répond à une commande, unique à ce message/ce membre) ---------------- */
function openOrderDelivery(ctx, msgDocId, requestText, onDelivered){
  if(ctx.viewerType !== 'creator'){
    toast(t('customOrderUnauthorized'));
    return;
  }
  let selectedType = 'photo';
  const body = document.getElementById('order-delivery-body');

  const renderZone = () => {
    const cap = TIP_MENU_PRICE_CAPS[selectedType];
    const accept = selectedType === 'video' ? 'video/*' : selectedType === 'audio' ? 'audio/*' : 'image/*';
    body.innerHTML = `
      <h3>${t('customOrderDeliverTitle')}</h3>
      <p class="member-note">${escText(requestText)}</p>

      <label>${t('customOrderTypeChooseLabel')}</label>
      <p class="member-note" style="margin:-2px 0 8px;">${t('customOrderTypeChooseNote')}</p>
      <div class="tipmenu-type-toggle">
        <button type="button" class="tipmenu-type-btn ${selectedType==='photo'?'active':''}" data-type="photo">${ICON_CAMERA} ${t('tipMenuColPhoto')}</button>
        <button type="button" class="tipmenu-type-btn ${selectedType==='video'?'active':''}" data-type="video">${ICON_VIDEO} ${t('tipMenuColVideo')}</button>
        <button type="button" class="tipmenu-type-btn ${selectedType==='audio'?'active':''}" data-type="audio">${ICON_AUDIO} ${t('tipMenuColAudio')}</button>
      </div>

      <label style="margin-top:14px;">${t('tipMenuContentLabel')}</label>
      <div id="order-delivery-upload-zone">${dualUploadZoneHtml('order-delivery', accept)}</div>

      <div id="order-delivery-price-zone" style="display:none;">
        <label style="margin-top:14px;">${t('tipMenuPriceLabel')}</label>
        <p class="member-note" id="order-delivery-price-note" style="margin:-2px 0 6px;">${t('tipMenuHelpPrice').replace('{min}', cap.min).replace('{max}', cap.max)}</p>
        <input type="number" id="order-delivery-price" min="${cap.min}" max="${cap.max}" step="1" placeholder="${cap.min}–${cap.max}€">
        <p class="tipmenu-earn-note" id="order-delivery-earn-note"></p>
      </div>

      <div class="modal-actions">
        <button class="btn btn-ghost btn-sm" id="order-delivery-cancel" style="flex:1;">${t('galleryClose')}</button>
        <button class="btn btn-primary btn-sm" id="order-delivery-confirm" style="flex:1;" disabled>${t('customOrderDeliverBtn')}</button>
      </div>
    `;
    document.getElementById('order-delivery-cancel').onclick = close;
    body.querySelectorAll('.tipmenu-type-btn').forEach(btn => {
      btn.onclick = () => { selectedType = btn.dataset.type; uploadedUrl = ''; renderZone(); };
    });
    wireUpload();
  };

  document.getElementById('order-delivery-backdrop').classList.add('open');
  document.getElementById('order-delivery-modal').classList.add('open');
  const close = () => {
    document.getElementById('order-delivery-backdrop').classList.remove('open');
    document.getElementById('order-delivery-modal').classList.remove('open');
  };
  document.getElementById('order-delivery-backdrop').onclick = close;

  let uploadedUrl = '';

  const wireUpload = () => {
    const priceInput = () => document.getElementById('order-delivery-price');
    const updateEarnNote = () => {
      const v = parseInt(priceInput().value, 10) || 0;
      document.getElementById('order-delivery-earn-note').textContent = t('tipMenuEarnNote').replace('{amount}', Math.round(v * 0.6 * 100) / 100);
    };
    wireDualUpload('order-delivery', async (files) => {
      const file = files[0];
      if(!file) return;
      try{
        uploadedUrl = await uploadToR2(auth, file, 'custom-orders/' + ctx.profileId + '/' + ctx.memberUid);
        const cap = TIP_MENU_PRICE_CAPS[selectedType];
        priceInput().value = cap.min;
        document.getElementById('order-delivery-price-zone').style.display = 'block';
        updateEarnNote();
        document.getElementById('order-delivery-confirm').disabled = false;
        toast(t('addedToast'));
      }catch(err){ console.error('order delivery upload error', err); toast(t('uploadFailed')); }
    });
    document.getElementById('order-delivery-price').addEventListener('change', () => {
      const cap = TIP_MENU_PRICE_CAPS[selectedType];
      let v = parseInt(priceInput().value, 10);
      if(isNaN(v)) return;
      if(v > cap.max){ v = cap.max; toast(t('tipMenuPriceClamped').replace('{max}', cap.max)); }
      if(v < cap.min) v = cap.min;
      priceInput().value = v;
      updateEarnNote();
    });
    document.getElementById('order-delivery-confirm').onclick = async () => {
      if(!uploadedUrl) return;
      const cap = TIP_MENU_PRICE_CAPS[selectedType];
      let price = parseInt(priceInput().value, 10) || cap.min;
      price = Math.max(cap.min, Math.min(cap.max, price));
      const btn = document.getElementById('order-delivery-confirm');
      btn.disabled = true;
      try{
        const msgRef = db.collection('profiles').doc(ctx.profileId).collection('conversations').doc(ctx.memberUid).collection('messages').doc(msgDocId);
        await msgRef.set({
          customOrderStatus: 'delivered', deliveredContentUrl: uploadedUrl, deliveredContentType: selectedType,
          deliveredPrice: price, deliveredAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        const convRef = db.collection('profiles').doc(ctx.profileId).collection('conversations').doc(ctx.memberUid);
        await convRef.set({
          lastMessageText: '📦 ' + t('customOrderDeliveredNote'), lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
          lastSenderType: 'creator', memberUnreadCount: firebase.firestore.FieldValue.increment(1),
          pendingCustomOrderCount: firebase.firestore.FieldValue.increment(-1)
        }, { merge: true });
        toast(t('customOrderDeliveredToast'));
        close();
        if(onDelivered) onDelivered();
      }catch(e){ console.error('deliver order error', e); toast(t('memberErrUnknown')); }
      btn.disabled = false;
    };
  };

  renderZone();
}

/* ---------------- livraison rapide (commande Tip Menu, contenu déjà prêt) ---------------- */
async function quickDeliverTipOrder(ctx, msgDocId, contentUrl, contentType, price){
  if(ctx.viewerType !== 'creator'){
    toast(t('customOrderUnauthorized'));
    return;
  }
  if(!contentUrl){ toast(t('memberErrUnknown')); return; }
  try{
    const msgRef = db.collection('profiles').doc(ctx.profileId).collection('conversations').doc(ctx.memberUid).collection('messages').doc(msgDocId);
    await msgRef.set({
      customOrderStatus: 'delivered', deliveredContentUrl: contentUrl, deliveredContentType: contentType || 'photo',
      deliveredPrice: price ? parseInt(price, 10) : null, deliveredAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    const convRef = db.collection('profiles').doc(ctx.profileId).collection('conversations').doc(ctx.memberUid);
    await convRef.set({
      lastMessageText: '📦 ' + t('customOrderDeliveredNote'), lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastSenderType: 'creator', memberUnreadCount: firebase.firestore.FieldValue.increment(1),
      pendingTipOrderCount: firebase.firestore.FieldValue.increment(-1)
    }, { merge: true });
    toast(t('customOrderDeliveredToast'));
  }catch(e){ console.error('quick deliver tip order error', e); toast(t('memberErrUnknown')); }
}

/* ---------------- déblocage côté membre : voir la livraison + l'ajouter à ses achats ---------------- */
function unlockDeliveredOrder(url, type, requestText, creatorName){
  mockPurchaseNotice();
  if(type === 'audio'){
    const content = document.getElementById('lightbox-content');
    content.innerHTML = `<audio src="${url}" controls autoplay style="width:100%;"></audio>`;
    document.getElementById('lightbox-backdrop').style.display = 'flex';
    return;
  }
  openLightbox(url, type);
}
async function saveDeliveredOrderToPurchases(ctx, requestText, url, type){
  if(!memberAuth || !memberAuth.currentUser || memberAuth.currentUser.isAnonymous) return;
  try{
    const uid = memberAuth.currentUser.uid;
    await memberDb.collection('members').doc(uid).set({
      customPurchases: firebase.firestore.FieldValue.arrayUnion({
        creatorId: ctx.profileId, creatorName: ctx.otherName || '', requestText: requestText || '',
        url, type, addedAt: Date.now()
      })
    }, { merge: true });
    toast(t('customOrderSavedToPurchases'));
  }catch(e){ console.error('save purchase error', e); toast(t('memberErrUnknown')); }
}

let chatSendAudioCtx = null;
function playChatSendSound(){
  try{
    if(!chatSendAudioCtx) chatSendAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = chatSendAudioCtx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(700, now);
    osc.frequency.exponentialRampToValueAtTime(1150, now + 0.08);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.18);
  }catch(e){}
}
function playChatReceiveSound(){
  try{
    if(!chatSendAudioCtx) chatSendAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = chatSendAudioCtx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, now);
    osc.frequency.exponentialRampToValueAtTime(340, now + 0.11);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.22);
  }catch(e){}
}

async function sendCreatorWelcomeMessage(profileId, memberUid, memberUsername, creatorName, text, audioUrl){
  if(!text && !audioUrl) return;
  try{
    const convRef = memberDb.collection('profiles').doc(profileId).collection('conversations').doc(memberUid);
    await convRef.collection('messages').add({
      senderType: 'creator', text: (text || '').slice(0, 1000),
      audioUrl: audioUrl || null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      isWelcomeMessage: true
    });
    await convRef.set({
      memberUid: memberUid, memberUsername: memberUsername || '', creatorName: creatorName || '',
      lastMessageText: (text || (audioUrl ? '🎤' : '')).slice(0, 120), lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastSenderType: 'creator', creatorTyping: false,
      memberUnreadCount: firebase.firestore.FieldValue.increment(1)
    }, { merge: true });
    try{
      await memberDb.collection('members').doc(memberUid).set({
        conversationProfileIds: firebase.firestore.FieldValue.arrayUnion(profileId)
      }, { merge: true });
    }catch(e){ console.error('track conversationProfileIds error (welcome msg)', e); }
  }catch(e){ console.error('send welcome message error', e); }
}
async function sendChatMessage(){
  if(!chatCtx) return;
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if(!text) return;
  input.value = '';
  document.getElementById('chat-emoji-picker').style.display = 'none';
  const ctx = chatCtx;
  const convRef = chatDb(ctx.viewerType).collection('profiles').doc(ctx.profileId).collection('conversations').doc(ctx.memberUid);
  const myTypingField = ctx.viewerType === 'member' ? 'memberTyping' : 'creatorTyping';
  const otherUnreadField = ctx.viewerType === 'member' ? 'creatorUnreadCount' : 'memberUnreadCount';
  try{
    await convRef.collection('messages').add({
      senderType: ctx.viewerType, text: text.slice(0, 1000),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await convRef.set({
      memberUid: ctx.memberUid, memberUsername: ctx.memberUsername || '', creatorName: ctx.creatorName || '',
      lastMessageText: text.slice(0, 120), lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastSenderType: ctx.viewerType, [myTypingField]: false,
      [otherUnreadField]: firebase.firestore.FieldValue.increment(1)
    }, { merge: true });
    // Référence directe (fiable, sans requête collectionGroup) : la liste des conversations du membre.
    try{
      await memberDb.collection('members').doc(ctx.memberUid).set({
        conversationProfileIds: firebase.firestore.FieldValue.arrayUnion(ctx.profileId)
      }, { merge: true });
    }catch(e){ console.error('track conversationProfileIds error', e); }
    playChatSendSound();
  }catch(e){
    console.error('send chat message error', e);
    toast(t('memberErrUnknown') + ' (' + (e.code || e.message || e) + ')');
    input.value = text;
  }
}
document.getElementById('chat-send-btn').onclick = sendChatMessage;
document.getElementById('chat-input').addEventListener('keydown', (e) => {
  if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); sendChatMessage(); }
});

/* ---------------- liste des conversations : membre ---------------- */
async function renderMemberMessagesTab(user, data){
  const hypeLine = `<p class="member-welcome-line" style="margin:0 0 12px;">${t('memberMessagesHype')}</p>`;
  const paint = (rows, skipAnim) => {
    if(rows.length === 0){
      paintTabBody(`${hypeLine}<span class="gallery-empty">${t('chatNoConversations')}</span>`, skipAnim);
      return;
    }
    const tabBody = paintTabBody(hypeLine + rows.map(({ profileId, c }) => {
      const m = (typeof roster !== 'undefined') ? roster.find(x => x.id === profileId) : null;
      const unread = c.memberUnreadCount || 0;
      return `
        <button type="button" class="conv-list-row" data-pid="${profileId}">
          <span class="conv-list-avatar">${m && m.photo ? `<img src="${escAttr(m.photo)}" alt="" loading="lazy" decoding="async">` : '🙂'}</span>
          <span class="conv-list-body">
            <span class="conv-list-name">${escText((m && m.name) || c.creatorName || '—')}</span>
            <span class="conv-list-preview">${escText(truncatePreview(c.lastMessageText))}</span>
          </span>
          ${unread ? `<span class="conv-unread-badge">${unread}</span>` : ''}
        </button>`;
    }).join(''), skipAnim);
    tabBody.querySelectorAll('.conv-list-row').forEach(btn => {
      btn.onclick = () => {
        const m = (typeof roster !== 'undefined') ? roster.find(x => x.id === btn.dataset.pid) : null;
        openChat({
          profileId: btn.dataset.pid, viewerType: 'member', memberUid: user.uid,
          memberUsername: data.username || '', creatorName: (m && m.name) || '',
          otherName: (m && m.name) || t('nameUndefined'), otherPhoto: m && m.photo, myUxd: data.uxd || 0,
          myPhoto: data.photoURL || ''
        });
      };
    });
  };
  const cached = getMemberTabCache(user.uid, 'messages');
  if(cached){ paint(cached); } // rendu instantané depuis le cache
  else{ paintTabBody(`<span class="gallery-empty">${t('chatLoading')}</span>`); }
  try{
    if(auth && !auth.currentUser){ try{ await auth.signInAnonymously(); }catch(e){} }
    const memberDoc = await memberDb.collection('members').doc(user.uid).get();
    const profileIds = (memberDoc.exists && memberDoc.data().conversationProfileIds) || [];
    if(profileIds.length === 0){
      setMemberTabCache(user.uid, 'messages', []);
      if(!cached && memberActiveTab === 'messages') paintTabBody(`<span class="gallery-empty">${t('chatNoConversations')}</span>`);
      return;
    }
    const results = await Promise.all(profileIds.map(async (profileId) => {
      try{
        const convDoc = await memberDb.collection('profiles').doc(profileId).collection('conversations').doc(user.uid).get();
        return convDoc.exists ? { profileId, c: convDoc.data() } : null;
      }catch(e){ console.error('load conversation error', profileId, e); return null; }
    }));
    const rows = results.filter(Boolean).sort((a, b) => {
      const ta = a.c.lastMessageAt && a.c.lastMessageAt.toDate ? a.c.lastMessageAt.toDate().getTime() : 0;
      const tb = b.c.lastMessageAt && b.c.lastMessageAt.toDate ? b.c.lastMessageAt.toDate().getTime() : 0;
      return tb - ta;
    });
    setMemberTabCache(user.uid, 'messages', rows);
    if(memberActiveTab === 'messages') paint(rows, true); // ré-affiche seulement si toujours sur cet onglet, sans rejouer l'animation
  }catch(e){
    console.error('load member conversations error', e);
    if(!cached && memberActiveTab === 'messages') paintTabBody(`<span class="gallery-empty">${(LANG==='fr'?'Erreur : ':'Error: ')}${escText(e.message||String(e))}</span>`);
  }
}

/* ---------------- liste des conversations : créatrice ---------------- */
/* ---------------- photo membre (avec consentement) : logo Honeymoon en repli ---------------- */
const HONEYMOON_LOGO_FALLBACK_HTML = '<span class="dm-avatar dm-avatar-logo">🍯</span>';
function honeymoonLogoFallbackHtml(extraClass){
  return `<span class="dm-avatar dm-avatar-logo${extraClass ? ' ' + extraClass : ''}">🍯</span>`;
}
async function resolveMemberAvatarForCreator(memberUid, creatorId){
  try{
    if(memberAuth && !memberAuth.currentUser){ try{ await memberAuth.signInAnonymously(); }catch(e){} }
    const doc = await memberDb.collection('members').doc(memberUid).get();
    if(!doc.exists) return { photoURL: '', consented: false };
    const d = doc.data();
    const vis = d.photosVisibility || (d.photosVisibleToCreator ? 'everyone' : 'nobody');
    const favorites = d.favorites || [];
    const consented = vis === 'everyone' || (vis === 'favorites' && favorites.includes(creatorId));
    return { photoURL: consented ? (d.photoURL || '') : '', consented };
  }catch(e){ console.error('resolveMemberAvatarForCreator error', e); return { photoURL: '', consented: false }; }
}

async function renderMyPopularity(m){
  const zone = document.getElementById('my-popularity-zone');
  if(!zone) return;
  zone.innerHTML = `<span class="gallery-empty">${t('chatLoading')}</span>`;
  try{
    if(auth && !auth.currentUser){ try{ await auth.signInAnonymously(); }catch(e){} }
    if(memberAuth && !memberAuth.currentUser){ try{ await memberAuth.signInAnonymously(); }catch(e){} }
    // Qui la suit : lecture de la sous-collection profiles/{id}/followers, alimentée par
    // wireRoomFollowButton (le membre y écrit son propre doc en suivant). On NE PEUT PAS
    // interroger directement la collection "members" par followingCreators array-contains :
    // les règles Firestore interdisent la lecture d'un doc membre sauf si c'est lui-même
    // ou s'il a rendu son profil public — jamais sur la base de qui il suit.
    const followersSnap = await db.collection('profiles').doc(m.id).collection('followers').orderBy('followedAt', 'desc').get();
    const followingIds = m.followingMembers || [];
    let followingRows = [];
    if(followingIds.length > 0){
      const docs = await Promise.all(followingIds.map(uid => memberDb.collection('members').doc(uid).get()));
      followingRows = docs.filter(d => d.exists).map(d => ({ id: d.id, username: d.data().username || t('nameUndefined'), photoURL: d.data().photoURL || '' }));
    }
    const tier = getFollowerTier(m.followersCount);
    const tierNudge = checkFollowerTierNudge(m.id, tier);
    zone.innerHTML = `
      ${tierNudge ? `
        <div class="banner-active-card" id="tier-nudge-card">
          <div class="banner-active-head">🎉 ${t('tierLabel_' + tierNudge.key)}</div>
          <p class="banner-active-text">${t('tierNudgeMessage')}</p>
          <button type="button" class="btn btn-ghost btn-sm" id="tier-nudge-dismiss-btn">${t('tierNudgeDismissBtn')}</button>
        </div>
      ` : ''}
      <div class="popularity-summary">
        ${followerBadgeHtml(m.followersCount)}
        <span>${m.followersCount || 0} ${t('followersLabel')} — ${t('tierLabel_' + tier.key)}</span>
      </div>
      <div class="member-section-title" style="margin-top:20px;">${t('followersListTitle')} (${followersSnap.size})</div>
      <div class="member-favorites-list" style="margin-top:10px;">
        ${followersSnap.empty ? `<p class="member-note">${t('membersViewerEmpty')}</p>` : followersSnap.docs.map(d => {
          const dd = d.data();
          return `<div class="member-fav-row">
            ${dd.photoURL ? `<span class="member-fav-photo"><img src="${escAttr(dd.photoURL)}" loading="lazy" decoding="async"></span>` : honeymoonLogoFallbackHtml('member-fav-photo')}
            <span class="member-fav-name">${escText(dd.username || t('nameUndefined'))}</span>
          </div>`;
        }).join('')}
      </div>
      <div class="member-section-title" style="margin-top:24px;">${t('followingListTitle')} (${followingRows.length})</div>
      <div class="member-favorites-list" style="margin-top:10px;">
        ${followingRows.length === 0 ? `<p class="member-note">${t('membersViewerEmpty')}</p>` : followingRows.map(r => `
          <div class="member-fav-row">
            ${r.photoURL ? `<span class="member-fav-photo"><img src="${escAttr(r.photoURL)}" loading="lazy" decoding="async"></span>` : honeymoonLogoFallbackHtml('member-fav-photo')}
            <span class="member-fav-name">${escText(r.username)}</span>
          </div>`).join('')}
      </div>
    `;
    const tierNudgeDismissBtn = document.getElementById('tier-nudge-dismiss-btn');
    if(tierNudgeDismissBtn) tierNudgeDismissBtn.onclick = () => {
      const card = document.getElementById('tier-nudge-card');
      if(card) card.remove();
    };
  }catch(e){
    console.error('renderMyPopularity error', e);
    zone.innerHTML = `<span class="gallery-empty">${(LANG==='fr'?'Erreur : ':'Error: ')}${escText(e.message||String(e))}</span>`;
  }
}

async function renderMyMessages(m){
  const zone = document.getElementById('my-messages-zone');
  if(!zone) return;
  zone.innerHTML = `<span class="gallery-empty">${t('chatLoading')}</span>`;
  try{
    if(auth && !auth.currentUser){ try{ await auth.signInAnonymously(); }catch(e){} }
    const snap = await db.collection('profiles').doc(m.id).collection('conversations')
      .orderBy('lastMessageAt', 'desc').limit(100).get();
    const badgeEl = document.getElementById('creator-msg-badge-' + m.id);
    const customBadgeEl = document.getElementById('creator-orders-custom-badge-' + m.id);
    const tipBadgeEl = document.getElementById('creator-orders-tip-badge-' + m.id);
    if(badgeEl){
      let total = 0, totalCustom = 0, totalTip = 0;
      snap.forEach(d => {
        const dd = d.data();
        total += (dd.creatorUnreadCount || 0);
        totalCustom += (dd.pendingCustomOrderCount || 0);
        totalTip += (dd.pendingTipOrderCount || 0);
      });
      if(total > 0){ badgeEl.style.display = 'inline-flex'; badgeEl.textContent = total > 99 ? '99+' : String(total); }
      else { badgeEl.style.display = 'none'; }
      if(customBadgeEl){
        if(totalCustom > 0){ customBadgeEl.style.display = 'inline-flex'; customBadgeEl.textContent = totalCustom > 99 ? '99+' : String(totalCustom); }
        else { customBadgeEl.style.display = 'none'; }
      }
      if(tipBadgeEl){
        if(totalTip > 0){ tipBadgeEl.style.display = 'inline-flex'; tipBadgeEl.textContent = totalTip > 99 ? '99+' : String(totalTip); }
        else { tipBadgeEl.style.display = 'none'; }
      }
    }
    if(snap.empty){
      zone.innerHTML = `<span class="gallery-empty">${t('chatNoConversations')}</span>`;
      return;
    }
    zone.innerHTML = snap.docs.map(d => {
      const c = d.data();
      const unread = c.creatorUnreadCount || 0;
      const hasCustomOrder = (c.pendingCustomOrderCount || 0) > 0;
      const hasTipOrder = (c.pendingTipOrderCount || 0) > 0;
      return `
        <button type="button" class="conv-list-row" data-uid="${d.id}">
          <span class="conv-list-avatar">👤</span>
          <span class="conv-list-body">
            <span class="conv-list-name">${escText(c.memberUsername || t('nameUndefined'))}
              ${hasCustomOrder ? `<span class="conv-order-dot conv-order-dot-custom" title="${escAttr(t('ordersCustomTabLabel'))}"></span>` : ''}
              ${hasTipOrder ? `<span class="conv-order-dot conv-order-dot-tip" title="${escAttr(t('ordersTipTabLabel'))}"></span>` : ''}
            </span>
            <span class="conv-list-preview">${escText(truncatePreview(c.lastMessageText))}</span>
          </span>
          ${unread ? `<span class="conv-unread-badge">${unread}</span>` : ''}
        </button>`;
    }).join('');
    zone.querySelectorAll('.conv-list-row').forEach(btn => {
      btn.onclick = async () => {
        const c = snap.docs.find(d => d.id === btn.dataset.uid).data();
        const avatarInfo = await resolveMemberAvatarForCreator(btn.dataset.uid, m.id);
        let otherUxd = 0;
        try{
          const memberDoc = await memberDb.collection('members').doc(btn.dataset.uid).get();
          otherUxd = (memberDoc.exists && memberDoc.data().uxd) || 0;
        }catch(e){ console.error('load member uxd error', e); }
        openChat({
          profileId: m.id, viewerType: 'creator', memberUid: btn.dataset.uid,
          memberUsername: c.memberUsername || '', creatorName: m.name || '',
          otherName: c.memberUsername || t('nameUndefined'), otherPhoto: avatarInfo.photoURL || null, otherUxd,
          myPhoto: m.photo || ''
        });
      };
    });
  }catch(e){
    console.error('load my conversations error', e);
    zone.innerHTML = `<span class="gallery-empty">${(LANG==='fr'?'Erreur : ':'Error: ')}${escText(e.message||String(e))}</span>`;
  }
}

/* ---------------- onglets Commandes (personnalisées et Tip Menu) : liste séparée du chat classique ---------------- */
async function renderMyOrders(m, kind){
  const zoneId = kind === 'tip' ? 'my-orders-tip-zone' : 'my-orders-custom-zone';
  const zone = document.getElementById(zoneId);
  if(!zone) return;
  zone.innerHTML = `<span class="gallery-empty">${t('chatLoading')}</span>`;
  try{
    if(auth && !auth.currentUser){ try{ await auth.signInAnonymously(); }catch(e){} }
    const convSnap = await db.collection('profiles').doc(m.id).collection('conversations')
      .orderBy('lastMessageAt', 'desc').limit(100).get();
    const relevant = convSnap.docs.filter(d => {
      const dd = d.data();
      return kind === 'tip' ? (dd.pendingTipOrderCount || 0) > 0 : (dd.pendingCustomOrderCount || 0) > 0;
    });
    if(relevant.length === 0){
      zone.innerHTML = `<span class="gallery-empty">${kind === 'tip' ? t('ordersTipEmpty') : t('ordersCustomEmpty')}</span>`;
      return;
    }
    const rowsPerConv = await Promise.all(relevant.map(async (d) => {
      const c = d.data();
      const msgSnap = await d.ref.collection('messages')
        .where('customOrderRequest', '==', true).where('customOrderStatus', '==', 'pending')
        .orderBy('createdAt', 'desc').limit(10).get();
      return msgSnap.docs
        .map(msgDoc => ({ msgDoc, dd: msgDoc.data() }))
        .filter(o => (kind === 'tip' ? o.dd.orderKind === 'tip' : o.dd.orderKind !== 'tip'))
        .map(o => ({
          memberUid: d.id, memberUsername: c.memberUsername || t('nameUndefined'),
          msgId: o.msgDoc.id, text: o.dd.text || '',
          tipContentUrl: o.dd.tipContentUrl || '', tipContentType: o.dd.tipContentType || 'photo', tipPrice: o.dd.tipPrice || ''
        }));
    }));
    const rows = rowsPerConv.flat();
    if(rows.length === 0){
      zone.innerHTML = `<span class="gallery-empty">${kind === 'tip' ? t('ordersTipEmpty') : t('ordersCustomEmpty')}</span>`;
      return;
    }
    zone.innerHTML = rows.map(r => `
      <div class="order-row-card ${kind === 'tip' ? 'tip-order-card' : ''}">
        <div class="order-row-head">
          <span class="order-row-name">👤 ${escText(r.memberUsername)}</span>
        </div>
        <p class="order-row-text">${escText(r.text)}</p>
        <div class="order-row-actions">
          <button type="button" class="custom-order-action-btn order-row-discuss-btn" data-uid="${escAttr(r.memberUid)}">${t('ordersDiscussBtn')}</button>
          <button type="button" class="custom-order-action-btn ${kind === 'tip' ? 'tip-order-deliver-btn' : 'custom-order-deliver-btn'}"
            data-docid="${escAttr(r.msgId)}" data-uid="${escAttr(r.memberUid)}" data-text="${escAttr(r.text)}"
            data-url="${escAttr(r.tipContentUrl)}" data-type="${escAttr(r.tipContentType)}" data-price="${escAttr(r.tipPrice)}">
            ${ICON_GIFT} ${kind === 'tip' ? t('tipOrderDeliverBtn') : t('customOrderDeliverBtn')}
          </button>
        </div>
      </div>`).join('');
    const openDiscussFor = async (memberUid, memberUsername) => {
      const avatarInfo = await resolveMemberAvatarForCreator(memberUid, m.id);
      let otherUxd = 0;
      try{
        const memberDoc = await memberDb.collection('members').doc(memberUid).get();
        otherUxd = (memberDoc.exists && memberDoc.data().uxd) || 0;
      }catch(e){ console.error('load member uxd error', e); }
      openChat({
        profileId: m.id, viewerType: 'creator', memberUid,
        memberUsername: memberUsername || '', creatorName: m.name || '',
        otherName: memberUsername || t('nameUndefined'), otherPhoto: avatarInfo.photoURL || null, otherUxd,
        myPhoto: m.photo || ''
      });
    };
    zone.querySelectorAll('.order-row-discuss-btn').forEach(btn => {
      const row = rows.find(r => r.memberUid === btn.dataset.uid);
      btn.onclick = () => openDiscussFor(btn.dataset.uid, row && row.memberUsername);
    });
    zone.querySelectorAll('.custom-order-deliver-btn').forEach(btn => {
      btn.onclick = () => {
        const ctx = { profileId: m.id, memberUid: btn.dataset.uid, viewerType: 'creator' };
        openOrderDelivery(ctx, btn.dataset.docid, btn.dataset.text, () => renderMyOrders(m, kind));
      };
    });
    zone.querySelectorAll('.tip-order-deliver-btn').forEach(btn => {
      btn.onclick = () => {
        const ctx = { profileId: m.id, memberUid: btn.dataset.uid, viewerType: 'creator' };
        quickDeliverTipOrder(ctx, btn.dataset.docid, btn.dataset.url, btn.dataset.type, btn.dataset.price)
          .then(() => renderMyOrders(m, kind));
      };
    });
  }catch(e){
    console.error('load my orders error', e);
    zone.innerHTML = `<span class="gallery-empty">${(LANG==='fr'?'Erreur : ':'Error: ')}${escText(e.message||String(e))}</span>`;
  }
}

/* ---------------- onglet Membres (côté créatrice) : follow + favoris + infos partagées ---------------- */
async function renderMyMembers(m, filter){
  filter = filter || 'all';
  const zone = document.getElementById('my-members-zone');
  if(!zone) return;
  zone.innerHTML = `<span class="gallery-empty">${t('chatLoading')}</span>`;
  try{
    if(auth && !auth.currentUser){ try{ await auth.signInAnonymously(); }catch(e){} }
    if(memberAuth && !memberAuth.currentUser){ try{ await memberAuth.signInAnonymously(); }catch(e){} }
    const { docs: snapDocs, chatMemberIds, followingMembers, favoriteMembers } = await fetchVisibleMembersForCreator(m.id);
    const rows = [];
    snapDocs.forEach(doc => {
      const d = doc.data() || {};
      const memberFavorites = d.favorites || [];
      const isFav = memberFavorites.includes(m.id);
      const hasChatted = chatMemberIds.includes(doc.id);
      const isFollowedByCreator = followingMembers.includes(doc.id);
      const isCreatorFavorite = favoriteMembers.includes(doc.id);
      const bioVis = d.bioVisibility || (d.bioVisibleToCreator ? 'everyone' : 'nobody');
      const photosVis = d.photosVisibility || (d.photosVisibleToCreator ? 'everyone' : 'nobody');
      const bioOk = bioVis === 'everyone' || (bioVis === 'favorites' && isFav);
      const photosOk = photosVis === 'everyone' || (photosVis === 'favorites' && isFav);
      if(!bioOk && !photosOk && !isFav && !hasChatted && !isFollowedByCreator && !isCreatorFavorite) return;
      if(filter === 'favorites' && !isCreatorFavorite) return;
      rows.push({
        id: doc.id, username: d.username || t('nameUndefined'),
        photoURL: photosOk ? (d.photoURL || '') : '', location: d.location || '',
        bio: bioOk ? (d.bio || '') : '', bioQuestions: bioOk ? (d.bioQuestions || null) : null, photos: photosOk ? (d.photos || []) : [],
        isFav, hasChatted, isFollowedByCreator, isCreatorFavorite, followersCount: d.followersCount || 0
      });
    });
    rows.sort((a, b) => (b.isCreatorFavorite - a.isCreatorFavorite) || (b.isFollowedByCreator - a.isFollowedByCreator));
    if(rows.length === 0){
      zone.innerHTML = `<span class="gallery-empty">${filter === 'favorites' ? t('myMembersNoFavorites') : t('membersViewerEmpty')}</span>`;
      return;
    }
    zone.innerHTML = rows.map(r => memberViewCardHtml(r, `
      <div class="member-view-actions">
        <button type="button" class="follow-btn my-member-follow-btn ${r.isFollowedByCreator ? 'following' : ''}" data-uid="${r.id}">${r.isFollowedByCreator ? t('followingBtn') : t('followBtn')}</button>
        <button type="button" class="follow-btn my-member-favorite-btn ${r.isCreatorFavorite ? 'is-favorite' : ''}" data-uid="${r.id}">⭐ ${r.isCreatorFavorite ? t('myMembersUnfavoriteBtn') : t('myMembersFavoriteBtn')}</button>
      </div>
    `)).join('');
    wireMemberViewCardToggles(zone);
    zone.querySelectorAll('.my-member-follow-btn').forEach(btn => {
      btn.onclick = async () => {
        btn.disabled = true;
        const uid = btn.dataset.uid;
        const isFollowing = btn.classList.contains('following');
        try{
          const creatorRef = db.collection('profiles').doc(m.id);
          if(isFollowing){
            await creatorRef.set({ followingMembers: firebase.firestore.FieldValue.arrayRemove(uid) }, { merge: true });
          } else {
            await creatorRef.set({ followingMembers: firebase.firestore.FieldValue.arrayUnion(uid) }, { merge: true });
          }
          btn.classList.toggle('following', !isFollowing);
          btn.textContent = !isFollowing ? t('followingBtn') : t('followBtn');
        }catch(e){ console.error('creator follow member error', e); toast(t('memberErrUnknown')); }
        btn.disabled = false;
      };
    });
    zone.querySelectorAll('.my-member-favorite-btn').forEach(btn => {
      btn.onclick = async () => {
        btn.disabled = true;
        const uid = btn.dataset.uid;
        const isFav = btn.classList.contains('is-favorite');
        try{
          const creatorRef = db.collection('profiles').doc(m.id);
          await creatorRef.set({
            favoriteMembers: isFav ? firebase.firestore.FieldValue.arrayRemove(uid) : firebase.firestore.FieldValue.arrayUnion(uid)
          }, { merge: true });
          btn.classList.toggle('is-favorite', !isFav);
          btn.innerHTML = `⭐ ${!isFav ? t('myMembersUnfavoriteBtn') : t('myMembersFavoriteBtn')}`;
        }catch(e){ console.error('creator favorite member error', e); toast(t('memberErrUnknown')); }
        btn.disabled = false;
      };
    });
  }catch(e){
    console.error('load my members error', e);
    zone.innerHTML = `<span class="gallery-empty">${(LANG==='fr'?'Erreur : ':'Error: ')}${escText(e.message||String(e))}</span>`;
  }
}

const ICON_USER = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:5px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
const ICON_COMPASS_SM = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:5px;"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>';
const ICON_DISCOVER_PREMIUM = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:5px;"><path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M9 3l3 6-3 12M15 3l-3 6 3 12"/></svg>';
function updateTopbarMemberBadge(username){
  const badge = document.getElementById('topbar-member-badge');
  const burgerItem = document.getElementById('burger-become-member');
  const privateLink = document.getElementById('private-access-link');
  const msgBtn = document.getElementById('topbar-msg-btn');
  if(!badge) return;
  if(username){
    badge.style.display = 'flex';
    badge.innerHTML = ICON_USER + escText(username);
    badge.onclick = () => openMemberModal();
    if(burgerItem){ burgerItem.innerHTML = ICON_USER + escText(username); burgerItem.removeAttribute('data-i18n'); }
    if(privateLink){ privateLink.disabled = true; privateLink.style.opacity = '.25'; privateLink.style.pointerEvents = 'none'; }
    if(msgBtn){ msgBtn.style.display = 'flex'; refreshTopbarMessageBadge(); }
  } else {
    badge.style.display = 'flex';
    badge.innerHTML = ICON_USER + escText(t('visitorBadgeLabel'));
    badge.onclick = null;
    if(burgerItem){ burgerItem.setAttribute('data-i18n', 'burgerBecomeMember'); burgerItem.textContent = t('burgerBecomeMember'); }
    if(privateLink){ privateLink.disabled = false; privateLink.style.opacity = '.7'; privateLink.style.pointerEvents = ''; }
    if(msgBtn){ msgBtn.style.display = 'none'; }
  }
}
let topbarMsgConvUnsubs = [];
async function refreshTopbarMessageBadge(){
  const badgeEl = document.getElementById('topbar-msg-badge');
  if(!memberAuth || !memberAuth.currentUser || memberAuth.currentUser.isAnonymous) return;
  try{
    if(auth && !auth.currentUser){ try{ await auth.signInAnonymously(); }catch(e){} }
    topbarMsgConvUnsubs.forEach(u => u());
    topbarMsgConvUnsubs = [];
    const memberDoc = await memberDb.collection('members').doc(memberAuth.currentUser.uid).get();
    const profileIds = (memberDoc.exists && memberDoc.data().conversationProfileIds) || [];
    const counts = {};
    const updateBadges = () => {
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      const text = total > 99 ? '99+' : String(total);
      if(badgeEl){
        if(total > 0){ badgeEl.style.display = 'flex'; badgeEl.textContent = text; }
        else { badgeEl.style.display = 'none'; }
      }
      const tabBadgeEl = document.getElementById('member-tab-messages-badge');
      if(tabBadgeEl){
        if(total > 0){ tabBadgeEl.style.display = 'inline-flex'; tabBadgeEl.textContent = text; }
        else { tabBadgeEl.style.display = 'none'; }
      }
    };
    if(profileIds.length === 0){ updateBadges(); return; }
    profileIds.forEach(profileId => {
      const unsub = memberDb.collection('profiles').doc(profileId).collection('conversations').doc(memberAuth.currentUser.uid)
        .onSnapshot(doc => {
          counts[profileId] = (doc.exists && doc.data().memberUnreadCount) || 0;
          updateBadges();
        }, e => console.error('topbar message badge conv error', profileId, e));
      topbarMsgConvUnsubs.push(unsub);
    });
  }catch(e){ console.error('refreshTopbarMessageBadge error', e); }
}
document.getElementById('topbar-msg-btn').onclick = () => {
  if(!memberAuth || !memberAuth.currentUser || memberAuth.currentUser.isAnonymous) return;
  openMemberModal('messages');
};
function refreshMemberBadgeFromSession(){
  if(!memberAuth) return;
  const u = memberAuth.currentUser;
  if(!u || u.isAnonymous){ updateTopbarMemberBadge(null); return; }
  memberDb.collection('members').doc(u.uid).get().then(doc => {
    const username = (doc.exists && doc.data().username) || u.displayName || '';
    updateTopbarMemberBadge(username);
  }).catch(() => updateTopbarMemberBadge(u.displayName || ''));
}
function memberLogout(){
  if(!confirm(t('logoutConfirm'))) return;
  if(memberAuth){ memberAuth.signOut().catch(() => {}); }
  updateTopbarMemberBadge(null);
  toast(t('memberLoggedOutToast'));
  renderMemberLogin();
}

function renderMemberForgot(){
  const body = document.getElementById('member-modal-body');
  body.innerHTML = `
    <button type="button" id="member-forgot-back-site" style="background:none;border:none;color:var(--text-muted);font-size:13px;cursor:pointer;padding:0 0 10px;text-align:left;">${t('memberBackToSite')}</button>
    <h3>${t('memberForgotTitle')}</h3>
    <p class="member-note">${t('memberForgotBody')}</p>
    <label>${t('memberEmailLabel')}</label>
    <input id="member-forgot-email" type="email" placeholder="${escAttr(t('memberForgotEmailPh'))}" autocomplete="email">
    <div class="member-err" id="member-forgot-err"></div>
    <div class="modal-actions">
      <button class="btn btn-primary btn-sm" id="member-forgot-submit" style="flex:1;">${t('memberForgotSendBtn')}</button>
    </div>
    <button type="button" class="member-forgot-link" id="member-forgot-back">${t('memberBackToLogin')}</button>
  `;
  document.getElementById('member-forgot-back-site').onclick = closeMemberModal;
  document.getElementById('member-forgot-back').onclick = renderMemberLogin;
  document.getElementById('member-forgot-submit').onclick = memberForgotSubmit;
  document.getElementById('member-forgot-email').addEventListener('keydown', e => { if(e.key === 'Enter') memberForgotSubmit(); });
}
async function memberForgotSubmit(){
  const errEl = document.getElementById('member-forgot-err');
  errEl.textContent = '';
  const email = document.getElementById('member-forgot-email').value.trim();
  if(!email || !isValidEmail(email)){ errEl.textContent = t('memberErrInvalidEmail'); return; }
  const btn = document.getElementById('member-forgot-submit');
  btn.disabled = true;
  try{
    await memberAuth.sendPasswordResetEmail(email);
  }catch(e){
    console.error('password reset error', e);
    // On ne révèle jamais si l'email existe ou non (sécurité) — sauf format invalide déjà géré plus haut.
  }
  btn.disabled = false;
  const body = document.getElementById('member-modal-body');
  body.innerHTML = `
    <h3>${t('memberForgotSentTitle')}</h3>
    <p class="member-note">${t('memberForgotSentBody')}</p>
    <div class="modal-actions">
      <button class="btn btn-primary btn-sm" id="member-forgot-sent-back" style="flex:1;">${t('memberBackToLogin')}</button>
    </div>
  `;
  document.getElementById('member-forgot-sent-back').onclick = renderMemberLogin;
}
/* ================= CANDIDATURE MODÈLE (formulaire ouvert à tous) ================= */
function openApplyModal(){
  closeBurgerMenu();
  document.getElementById('apply-backdrop').classList.add('open');
  document.getElementById('apply-modal').classList.add('open');
  renderApplyForm();
}
function closeApplyModal(){
  document.getElementById('apply-backdrop').classList.remove('open');
  document.getElementById('apply-modal').classList.remove('open');
}
document.getElementById('apply-backdrop').onclick = closeApplyModal;
document.getElementById('apply-back-btn').onclick = () => {
  closeApplyModal();
  openBurgerMenu();
};

function renderApplyForm(){
  const body = document.getElementById('apply-modal-body');
  body.innerHTML = `
    <h3>${t('applyTitle')}</h3>
    <p style="color:var(--rose);font-weight:600;font-size:13.5px;line-height:1.6;margin:2px 0 10px;">${t('applyBusinessPitch')}</p>
    <p class="member-note">${t('applyIntro')}</p>

    <label>${t('applyNameLabel')}</label>
    <input id="apply-name" placeholder="${escAttr(t('applyNamePh'))}" maxlength="60">

    <label>${t('applyContactEmailLabel')}</label>
    <input id="apply-email" type="email" placeholder="${escAttr(t('applyContactEmailPh'))}">

    <label>${t('applyContactPhoneLabel')}</label>
    <input id="apply-phone" placeholder="${escAttr(t('applyContactPhonePh'))}" maxlength="60">

    <label>${t('applyCountryLabel')}</label>
    <input id="apply-country" placeholder="${escAttr(t('applyCountryPh'))}" maxlength="60">

    <label>${t('applyWorkingElsewhereLabel')}</label>
    <div class="apply-toggle-row">
      <button type="button" class="active" id="apply-elsewhere-no">${t('applyWorkingElsewhereNo')}</button>
      <button type="button" id="apply-elsewhere-yes">${t('applyWorkingElsewhereYes')}</button>
    </div>
    <div id="apply-elsewhere-detail-wrap" style="display:none;">
      <label>${t('applyWorkingElsewhereDetailLabel')}</label>
      <input id="apply-elsewhere-detail" placeholder="${escAttr(t('applyWorkingElsewhereDetailPh'))}" maxlength="120">
    </div>

    <label>${t('applyMotivationLabel')}</label>
    <textarea id="apply-motivation" rows="4" placeholder="${escAttr(t('applyMotivationPh'))}"></textarea>

    <label>${t('applySocialLabel')}</label>
    <input id="apply-social" placeholder="${escAttr(t('applySocialPh'))}" maxlength="200">

    <div class="apply-legal-box">
      <h4>${t('applyLegalTitle')}</h4>
      <p>${t('applyLegalText')}</p>
    </div>

    <div class="member-check-row">
      <input type="checkbox" id="apply-check-18">
      <label for="apply-check-18" style="margin:0;text-transform:none;font-weight:400;font-size:12px;">${t('applyCheck18')}</label>
    </div>
    <div class="member-check-row">
      <input type="checkbox" id="apply-check-conditions">
      <label for="apply-check-conditions" style="margin:0;text-transform:none;font-weight:400;font-size:12px;">${t('applyCheckConditions')}</label>
    </div>
    <div class="member-check-row">
      <input type="checkbox" id="apply-check-data">
      <label for="apply-check-data" style="margin:0;text-transform:none;font-weight:400;font-size:12px;">${t('applyCheckData')}</label>
    </div>

    <div class="member-err" id="apply-err"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost btn-sm" id="apply-cancel" style="flex:1;">${t('cancel')}</button>
      <button class="btn btn-primary btn-sm" id="apply-send" style="flex:1;">${t('applySendBtn')}</button>
    </div>
  `;
  document.getElementById('apply-cancel').onclick = closeApplyModal;
  let workingElsewhere = false;
  document.getElementById('apply-elsewhere-no').onclick = () => {
    workingElsewhere = false;
    document.getElementById('apply-elsewhere-no').classList.add('active');
    document.getElementById('apply-elsewhere-yes').classList.remove('active');
    document.getElementById('apply-elsewhere-detail-wrap').style.display = 'none';
  };
  document.getElementById('apply-elsewhere-yes').onclick = () => {
    workingElsewhere = true;
    document.getElementById('apply-elsewhere-yes').classList.add('active');
    document.getElementById('apply-elsewhere-no').classList.remove('active');
    document.getElementById('apply-elsewhere-detail-wrap').style.display = 'block';
  };
  document.getElementById('apply-send').onclick = () => applySubmit(() => workingElsewhere);
}

async function applySubmit(getWorkingElsewhere){
  const errEl = document.getElementById('apply-err');
  errEl.textContent = '';
  const name = document.getElementById('apply-name').value.trim();
  const email = document.getElementById('apply-email').value.trim();
  const phone = document.getElementById('apply-phone').value.trim();
  const country = document.getElementById('apply-country').value.trim();
  const workingElsewhere = getWorkingElsewhere();
  const elsewhereDetail = document.getElementById('apply-elsewhere-detail').value.trim();
  const motivation = document.getElementById('apply-motivation').value.trim();
  const social = document.getElementById('apply-social').value.trim();
  const c18 = document.getElementById('apply-check-18').checked;
  const cCond = document.getElementById('apply-check-conditions').checked;
  const cData = document.getElementById('apply-check-data').checked;

  if(!name || !email || !motivation){ errEl.textContent = t('applyErrFillRequired'); return; }
  if(!isValidEmail(email)){ errEl.textContent = t('memberErrInvalidEmail'); return; }
  if(workingElsewhere && !elsewhereDetail){ errEl.textContent = t('applyErrFillRequired'); return; }
  if(!c18 || !cCond || !cData){ errEl.textContent = t('applyErrChecks'); return; }

  const btn = document.getElementById('apply-send');
  btn.disabled = true;
  try{
    if(auth && !auth.currentUser){ try{ await auth.signInAnonymously(); }catch(e){} }
    await db.collection('model_applications').add({
      name: name.slice(0, 60), email: email.slice(0, 120), phone: phone.slice(0, 60),
      country: country.slice(0, 60), workingElsewhere, elsewhereDetail: elsewhereDetail.slice(0, 120),
      motivation: motivation.slice(0, 1500), social: social.slice(0, 200),
      status: 'new', createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    try{
      if(typeof emailjs !== 'undefined' && EMAILJS_PUBLIC_KEY !== 'TON_EMAILJS_PUBLIC_KEY'){
        await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
          to_email: ADMIN_NOTIFY_EMAIL, subject: 'Honeymoon — Nouvelle candidature modèle',
          buyer_name: name, buyer_contact: email + (phone ? ' / ' + phone : ''),
          creator_name: country, item_desc: `Motivation: ${motivation}\nDéjà ailleurs: ${workingElsewhere ? elsewhereDetail : 'Non'}\nRéseaux: ${social}`,
          price: '', ref: 'CANDIDATURE'
        });
      }
    }catch(e){ console.error('apply emailjs error', e); }
    renderApplySent();
  }catch(e){
    console.error('apply submit error', e);
    errEl.textContent = t('memberErrUnknown') + ' (' + (e.code || e.message || e) + ')';
  }
  btn.disabled = false;
}

function renderApplySent(){
  const body = document.getElementById('apply-modal-body');
  body.innerHTML = `
    <h3>${t('applySentTitle')}</h3>
    <p class="member-note">${t('applySentBody')}</p>
    <div class="modal-actions">
      <button class="btn btn-primary btn-sm" id="apply-sent-close" style="flex:1;">${t('applySentClose')}</button>
    </div>
  `;
  document.getElementById('apply-sent-close').onclick = closeApplyModal;
}

/* ---------------- panneau admin : candidatures modèle ---------------- */
async function openApplicationsPanel(){
  document.getElementById('applications-backdrop').classList.add('open');
  document.getElementById('applications-modal').classList.add('open');
  const body = document.getElementById('applications-body');
  body.innerHTML = `<span class="gallery-empty">${t('paidOrdersLoading')}</span>`;
  try{
    const snap = await db.collection('model_applications').orderBy('createdAt', 'desc').limit(100).get();
    if(snap.empty){
      body.innerHTML = `<span class="gallery-empty">${t('applicationsNoneYet')}</span>`;
      document.getElementById('applications-panel-count').textContent = '';
      return;
    }
    document.getElementById('applications-panel-count').textContent = `(${snap.size})`;
    body.innerHTML = snap.docs.map(d => {
      const a = d.data();
      return `
      <div class="sale-order-row">
        <div class="sale-order-head">
          <span><b>${escText(a.name) || '—'}</b></span>
          <span class="mono" style="color:var(--text-muted);">${formatCommentDate(a.createdAt)}</span>
        </div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:2px;">${escText(a.email)}${a.phone ? ' · ' + escText(a.phone) : ''}${a.country ? ' · ' + escText(a.country) : ''}</div>
        <div style="font-size:11px;color:var(--honey);margin-bottom:6px;">${a.workingElsewhere ? escText(a.elsewhereDetail) : t('applyWorkingElsewhereNo')}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;white-space:pre-line;">${escText(a.motivation) || ''}</div>
        ${a.social ? `<div style="font-size:10.5px;color:var(--text-muted);">${escText(a.social)}</div>` : ''}
      </div>`;
    }).join('');
  }catch(e){
    console.error('applications panel error', e);
    body.innerHTML = `<span class="gallery-empty">${(LANG==='fr'?'Erreur : ':'Error: ')}${escText(e.message||String(e))}</span>`;
  }
}
document.getElementById('applications-panel-btn').onclick = () => requireAdmin(openApplicationsPanel);
document.getElementById('applications-close').onclick = () => {
  document.getElementById('applications-backdrop').classList.remove('open');
  document.getElementById('applications-modal').classList.remove('open');
};
document.getElementById('applications-backdrop').onclick = () => document.getElementById('applications-close').click();

/* ---------------- panneau admin : demandes de suppression de compte créatrice ---------------- */
async function refreshDeletionsAlertBadge(){
  const btn = document.getElementById('deletions-panel-btn');
  if(!btn || !isAdmin()) return;
  try{
    const snap = await db.collection('deletion_requests').where('status', '==', 'pending').get();
    const countEl = document.getElementById('deletions-panel-count');
    if(snap.size > 0){
      countEl.textContent = `(${snap.size})`;
      btn.classList.add('alert');
    } else {
      countEl.textContent = '';
      btn.classList.remove('alert');
    }
  }catch(e){ console.error('deletions badge error', e); }
}

async function openDeletionsPanel(){
  document.getElementById('deletions-backdrop').classList.add('open');
  document.getElementById('deletions-modal').classList.add('open');
  const body = document.getElementById('deletions-body');
  body.innerHTML = `<span class="gallery-empty">${t('paidOrdersLoading')}</span>`;
  try{
    const snap = await db.collection('deletion_requests').orderBy('requestedAt', 'desc').limit(100).get();
    if(snap.empty){
      body.innerHTML = `<span class="gallery-empty">${t('deletionsNoneYet')}</span>`;
      document.getElementById('deletions-panel-count').textContent = '';
      document.getElementById('deletions-panel-btn').classList.remove('alert');
      return;
    }
    body.innerHTML = snap.docs.map(d => {
      const r = d.data();
      const now = Date.now();
      const eligibleMs = r.eligibleAt && r.eligibleAt.toDate ? r.eligibleAt.toDate().getTime() : 0;
      const daysLeft = Math.max(0, Math.ceil((eligibleMs - now) / 86400000));
      const isEligible = r.status === 'pending' && now >= eligibleMs;
      let statusHtml = '';
      if(r.status === 'cancelled') statusHtml = `<span class="member-purchase-status pending">${t('deletionStatusCancelled')}</span>`;
      else if(r.status === 'completed') statusHtml = `<span class="member-purchase-status paid">${t('deletionStatusCompleted')}</span>`;
      else if(isEligible) statusHtml = `<span class="member-purchase-status paid">${t('deletionEligibleNow')}</span>`;
      else statusHtml = `<span class="member-purchase-status pending">${t('deletionDaysLeft').replace('{n}', daysLeft)}</span>`;
      return `
      <div class="sale-order-row">
        <div class="sale-order-head">
          <span><b>${escText(r.creatorName) || r.profileId}</b></span>
          <span class="mono" style="color:var(--text-muted);">${formatCommentDate(r.requestedAt)}</span>
        </div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;white-space:pre-line;">${escText(r.reason) || ''}</div>
        <div style="margin-bottom:8px;">${statusHtml}</div>
        ${r.status === 'pending' ? `<button class="btn btn-primary btn-sm" data-id="${d.id}" data-pid="${escAttr(r.profileId)}" data-name="${escAttr(r.creatorName || '')}" class="deletion-confirm-btn" ${isEligible ? '' : 'disabled'} style="width:100%;">${t('deletionConfirmBtn')}</button>` : ''}
      </div>`;
    }).join('');
    body.querySelectorAll('[data-id]').forEach(btn => {
      btn.onclick = () => confirmCreatorDeletion(btn.dataset.id, btn.dataset.pid, btn.dataset.name);
    });
  }catch(e){
    console.error('deletions panel error', e);
    body.innerHTML = `<span class="gallery-empty">${(LANG==='fr'?'Erreur : ':'Error: ')}${escText(e.message||String(e))}</span>`;
  }
}
document.getElementById('deletions-panel-btn').onclick = () => requireAdmin(openDeletionsPanel);
document.getElementById('deletions-close').onclick = () => {
  document.getElementById('deletions-backdrop').classList.remove('open');
  document.getElementById('deletions-modal').classList.remove('open');
};
document.getElementById('deletions-backdrop').onclick = () => document.getElementById('deletions-close').click();

async function confirmCreatorDeletion(requestId, profileId, creatorName){
  if(!confirm(t('deletionFinalConfirm').replace('{name}', creatorName || profileId))) return;
  try{
    // Purge des sous-collections connues du profil.
    const profileRef = db.collection('profiles').doc(profileId);
    const subcols = ['media', 'private_media', 'comments', 'showcase_media', 'contract_signatures'];
    for(const col of subcols){
      const snap = await profileRef.collection(col).get();
      for(const doc of snap.docs){ await doc.ref.delete(); }
    }
    const paidSnap = await profileRef.collection('paid_content').get();
    for(const item of paidSnap.docs){
      const ordersSnap = await item.ref.collection('orders').get();
      for(const o of ordersSnap.docs){ await o.ref.delete(); }
      await item.ref.delete();
    }
    await profileRef.delete();
    await db.collection('deletion_requests').doc(requestId).set({ status: 'completed', completedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    toast(t('deletionCompletedToast'));
    openDeletionsPanel();
    refreshDeletionsAlertBadge();
  }catch(e){
    console.error('creator deletion error', e);
    toast(t('memberErrUnknown') + ' (' + (e.code || e.message || e) + ')');
  }
}

document.getElementById('soon-close').onclick = () => {
  document.getElementById('soon-backdrop').classList.remove('open');
  document.getElementById('soon-modal').classList.remove('open');
};
document.getElementById('soon-backdrop').onclick = () => document.getElementById('soon-close').click();

document.getElementById('burger-rules').onclick = () => {
  closeBurgerMenu();
  openLegalDoc('rules', true);
};
document.getElementById('burger-report-item').onclick = () => {
  closeBurgerMenu();
  openReportModal(null, true);
};
document.getElementById('burger-creator-login').onclick = () => {
  closeBurgerMenu();
  openPrivateAccessGate();
  document.getElementById('gate').style.display = 'none';
  document.getElementById('creator-gate').style.display = 'flex';
};
document.getElementById('burger-agency-login').onclick = () => {
  closeBurgerMenu();
  openPrivateAccessGate();
};
document.getElementById('burger-logout-item').onclick = () => {
  closeBurgerMenu();
  if(!confirm(t('logoutConfirm'))) return;
  sessionStorage.removeItem('hm_age_ok');
  if(memberAuth){ memberAuth.signOut().catch(() => {}); }
  hideAllShells();
  window.location.hash = '';
  requireAgeGate(() => openVitrine());
};
document.getElementById('burger-faq').onclick = () => {
  closeBurgerMenu();
  const body = document.getElementById('faq-body');
  const faqs = FAQ_ITEMS[LANG] || FAQ_ITEMS.en;
  body.innerHTML = faqs.map(f => `
    <div class="faq-item">
      <div class="faq-question">${escText(f.q)}</div>
      <div class="faq-answer">${escText(f.a)}</div>
    </div>`).join('');
  document.getElementById('faq-backdrop').classList.add('open');
  document.getElementById('faq-modal').classList.add('open');
};
document.getElementById('faq-close').onclick = () => {
  document.getElementById('faq-backdrop').classList.remove('open');
  document.getElementById('faq-modal').classList.remove('open');
};
document.getElementById('faq-backdrop').onclick = () => document.getElementById('faq-close').click();
document.getElementById('faq-back-btn').onclick = () => {
  document.getElementById('faq-close').click();
  openBurgerMenu();
};

/* ---------------- panneau admin : signalements ---------------- */
async function openReportsPanel(){
  document.getElementById('reports-backdrop').classList.add('open');
  document.getElementById('reports-modal').classList.add('open');
  const body = document.getElementById('reports-body');
  body.innerHTML = `<span class="gallery-empty">${t('paidOrdersLoading')}</span>`;
  try{
    const snap = await db.collection('content_reports').orderBy('createdAt', 'desc').limit(100).get();
    if(snap.empty){
      body.innerHTML = `<span class="gallery-empty">${t('reportsNoneYet')}</span>`;
      document.getElementById('reports-panel-count').textContent = '';
      return;
    }
    document.getElementById('reports-panel-count').textContent = `(${snap.size})`;
    const reasonLabels = {
      minor: t('reportReasonMinor'), nonconsent: t('reportReasonNonConsent'),
      stolen: t('reportReasonStolen'), other: t('reportReasonOther')
    };
    body.innerHTML = snap.docs.map(d => {
      const r = d.data();
      const isMinor = r.reason === 'minor';
      return `
      <div class="sale-order-row" ${isMinor ? 'style="border-color:#e06a6a;"' : ''}>
        <div class="sale-order-head">
          <span><b>${escText(r.profile) || '—'}</b> ${isMinor ? '🔴' : ''}</span>
          <span class="mono" style="color:var(--text-muted);">${formatCommentDate(r.createdAt)}</span>
        </div>
        <div style="font-size:11px;color:var(--honey);margin-bottom:4px;">${escText(reasonLabels[r.reason] || r.reason)}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;">${escText(r.details) || ''}</div>
        ${r.contact ? `<div style="font-size:10.5px;color:var(--text-muted);">${t('reportContact')}: ${escText(r.contact)}</div>` : ''}
      </div>`;
    }).join('');
  }catch(e){
    console.error('reports panel error', e);
    body.innerHTML = `<span class="gallery-empty">${(LANG==='fr'?'Erreur : ':'Error: ')}${escText(e.message||String(e))}</span>`;
  }
}
document.getElementById('reports-panel-btn').onclick = () => requireAdmin(openReportsPanel);
document.getElementById('reports-close').onclick = () => {
  document.getElementById('reports-backdrop').classList.remove('open');
  document.getElementById('reports-modal').classList.remove('open');
};
document.getElementById('reports-backdrop').onclick = () => document.getElementById('reports-close').click();

/* ---------------- age gate (18+) ---------------- */
let pendingAgeAction = null;
function requireAgeGate(onConfirm){
  if(sessionStorage.getItem('hm_age_ok') === '1'){ onConfirm(); return; }
  pendingAgeAction = onConfirm;
  document.getElementById('t-age-gate-title').textContent = t('ageGateTitle');
  document.getElementById('t-age-gate-body').textContent = t('ageGateBody');
  document.getElementById('t-age-yes').textContent = t('ageYes');
  document.getElementById('t-age-no').textContent = t('ageNo');
  document.getElementById('age-gate').style.display = 'flex';
}
document.getElementById('age-yes-btn').onclick = () => {
  sessionStorage.setItem('hm_age_ok', '1');
  document.getElementById('age-gate').style.display = 'none';
  const action = pendingAgeAction;
  pendingAgeAction = null;
  if(action) action();
};
document.getElementById('age-no-btn').onclick = () => {
  pendingAgeAction = null;
  document.getElementById('age-gate').style.display = 'none';
  document.getElementById('t-age-blocked-title').textContent = t('ageBlockedTitle');
  document.getElementById('t-age-blocked-body').textContent = t('ageBlockedBody');
  document.getElementById('t-age-leave').textContent = t('ageLeaveBtn');
  hideAllShells();
  document.getElementById('age-blocked').style.display = 'flex';
};
document.getElementById('age-leave-btn').onclick = () => {
  window.location.href = 'about:blank';
};
document.getElementById('age-gate-lang-select').onchange = (e) => setAgeGateLang(e.target.value);
function setAgeGateLang(lang){
  LANG = lang;
  try{ localStorage.setItem('hm_lang', lang); }catch(e){}
  syncLangSelects(lang);
  applyVitrineStaticText();
  document.getElementById('t-age-gate-title').textContent = t('ageGateTitle');
  document.getElementById('t-age-gate-body').textContent = t('ageGateBody');
  document.getElementById('t-age-yes').textContent = t('ageYes');
  document.getElementById('t-age-no').textContent = t('ageNo');
}
document.getElementById('vitrine-lang-select').onchange = (e) => setVitrineLang(e.target.value);
function setVitrineLang(lang){
  LANG = lang;
  try{ localStorage.setItem('hm_lang', lang); }catch(e){}
  syncLangSelects(lang);
  applyVitrineStaticText();
  renderVitrineGrid();
}
function applyVitrineStaticText(){
  document.getElementById('t-vitrine-back').textContent = t('vitrineBack');
  document.getElementById('t-vitrine-eyebrow').textContent = t('vitrineHeroEyebrow');
  document.getElementById('t-vitrine-title').innerHTML = t('vitrineHeroTitle');
  document.getElementById('t-vitrine-body').textContent = t('vitrineHeroBody');
  document.getElementById('t-vitrine-cta').textContent = t('vitrineHeroCta');
  document.getElementById('t-vitrine-trust-suffix').textContent = t('vitrineHeroTrustSuffix');
  document.getElementById('t-vitrine-foot-tag').textContent = 'Honeymoon';
  document.getElementById('t-legal-modal-close').textContent = t('galleryClose');
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if(key) el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const key = el.dataset.i18nPh;
    if(key) el.setAttribute('placeholder', t(key));
  });
  document.getElementById('t-faq-title').textContent = 'FAQ';
  document.getElementById('t-faq-close').textContent = t('galleryClose');
  document.getElementById('t-soon-close').textContent = t('galleryClose');
  document.documentElement.lang = LANG;
  document.documentElement.dir = (LANG === 'ar') ? 'rtl' : 'ltr';
}

/* ---------------- thème : noir/or de luxe, toujours actif ---------------- */
(function initTheme(){
  document.documentElement.setAttribute('data-theme', '');
})();

/* Header fixe : mesure la vraie hauteur du bandeau visible (il peut varier
   légèrement selon la langue/le contenu) et ajuste l'espace réservé en dessous,
   pour qu'aucun contenu ne passe jamais derrière sur aucune page. */
let activeTopbar = null;
function updateTopbarHeight(){
  const bars = document.querySelectorAll('.topbar');
  let visible = null;
  bars.forEach(b => {
    const rect = b.getBoundingClientRect();
    if(rect.width > 0 || rect.height > 0) visible = b;
  });
  activeTopbar = visible;
  if(visible){
    document.documentElement.style.setProperty('--topbar-h', visible.offsetHeight + 'px');
  }
}
window.addEventListener('resize', updateTopbarHeight);
window.addEventListener('load', updateTopbarHeight);
setTimeout(updateTopbarHeight, 100);
setTimeout(updateTopbarHeight, 600);

/* Header + barre du bas façon app : se cachent en descendant, réapparaissent
   en remontant (comme StripChat) — évite les soucis de la barre d'adresse
   du navigateur mobile avec un header réellement figé.
   Version fluide : un seul calcul par frame d'affichage (requestAnimationFrame),
   pas de mesure DOM coûteuse à chaque event de scroll, et un petit seuil pour
   ignorer les micro-tremblements du doigt. */
/* Le header du haut est désormais statique (toujours visible) : le
   cache/affiche au scroll a été retiré à la demande d'Ok. On garde la
   fonction/le listener présents mais neutralisés pour éviter de casser
   d'autres appels existants dans le fichier. */
let lastScrollY = window.scrollY;
let scrollTicking = false;
let navHiddenState = null;
function applyNavScrollState(hideTop){
  // no-op : header et barre du bas restent statiques.
}
window.addEventListener('scroll', () => {}, { passive: true });

/* Barre du bas fixe : plus utilisée nulle part désormais (vitrine ET agence
   affichent leurs liens légaux en ligne, sous le contenu). */
function updateBottomNavVisibility(){
  const bnav = document.getElementById('bottom-nav');
  if(!bnav) return;
  bnav.style.display = 'none';
}
document.getElementById('bnav-2257').onclick = () => openLegalDoc('statement2257', false);
document.getElementById('bnav-cgu').onclick = () => openLegalDoc('terms', false);
document.getElementById('bnav-privacy').onclick = () => openLegalDoc('privacy', false);
document.getElementById('bnav-pricing').onclick = () => openLegalDoc('pricing', false);
document.getElementById('vlegal-2257').onclick = () => openLegalDoc('statement2257', false);
document.getElementById('vlegal-cgu').onclick = () => openLegalDoc('terms', false);
document.getElementById('vlegal-privacy').onclick = () => openLegalDoc('privacy', false);
document.getElementById('vlegal-pricing').onclick = () => openLegalDoc('pricing', false);
document.getElementById('alegal-2257').onclick = () => openLegalDoc('statement2257', false);
document.getElementById('alegal-cgu').onclick = () => openLegalDoc('terms', false);
document.getElementById('alegal-privacy').onclick = () => openLegalDoc('privacy', false);
document.getElementById('alegal-pricing').onclick = () => openLegalDoc('pricing', false);


function hideAllShells(){
  document.getElementById('gate').style.display = 'none';
  document.getElementById('creator-gate').style.display = 'none';
  document.getElementById('app-shell').style.display = 'none';
  document.getElementById('my-profile-shell').style.display = 'none';
  document.getElementById('member-shell').style.display = 'none';
  document.getElementById('vitrine-shell').style.display = 'none';
  if(typeof updateBottomNavVisibility === 'function') updateBottomNavVisibility();
}
/* Ferme tout modal potentiellement resté ouvert par erreur — évite qu'un
   fond de modal invisible bloque les clics ailleurs sur la page. */
function closeAllModals(){
  ['edit', 'gallery', 'sales', 'contracts', 'invoice', 'sign', 'paid', 'vitrine'].forEach(name => {
    const backdrop = document.getElementById(name + '-backdrop');
    const modal = document.getElementById(name + '-modal');
    if(backdrop) backdrop.classList.remove('open');
    if(modal) modal.classList.remove('open');
  });
  const room = document.getElementById('vitrine-room');
  if(room) room.classList.remove('open');
}

async function openVitrine(creatorId){
  hideAllShells();
  document.getElementById('vitrine-shell').style.display = 'block';
  // force un rafraîchissement d'affichage immédiat (évite un écran vide tant qu'on n'a pas interagi)
  void document.getElementById('vitrine-shell').offsetHeight;
  if(typeof updateTopbarHeight === 'function') updateTopbarHeight();
  if(typeof updateBottomNavVisibility === 'function') updateBottomNavVisibility();
  document.getElementById('vitrine-foot-year').textContent = new Date().getFullYear();
  applyVitrineStaticText();
  renderVitrineGrid(); // affichage immédiat avec les données déjà en mémoire
  refreshMemberBadgeFromSession();
  if(creatorId) openVitrineRoom(creatorId); // lien direct vers une créatrice précise
  if(auth && !auth.currentUser){
    try{ await auth.signInAnonymously(); }catch(e){ console.error('anon sign-in failed (vitrine)', e); }
  }
  await syncProfilesFromFirestore();
  renderVitrineGrid(); // re-affichage une fois les données à jour reçues
  if(creatorId) openVitrineRoom(creatorId, true); // rafraîchit la room en silence, sans perturber la lecture
}

function parseVitrineHash(){
  const h = window.location.hash;
  if(h === '#vitrine') return { open: true, id: null };
  const m = h.match(/^#vitrine\/(m\d+)$/);
  if(m) return { open: true, id: m[1] };
  return { open: false, id: null };
}

window.addEventListener('hashchange', () => {
  // Protection : si une session créatrice est active (espace personnel ouvert),
  // on ignore tout changement d'URL involontaire (ex. après avoir choisi un
  // fichier photo/vidéo, ou pendant qu'une galerie/lightbox est ouverte
  // par-dessus) pour ne jamais la renvoyer sur la vitrine par erreur.
  if(sessionStorage.getItem('hm_creator_slot')){
    return;
  }
  const parsed = parseVitrineHash();
  if(parsed.open){
    requireAgeGate(() => openVitrine(parsed.id));
  } else {
    document.getElementById('vitrine-backdrop').classList.remove('open');
    document.getElementById('vitrine-room').classList.remove('open');
    document.getElementById('vitrine-shell').style.display = 'none';
    checkGate();
  }
});
// Lien direct possible (#vitrine ou #vitrine/m1) au premier chargement de la page.
const initialVitrineHash = parseVitrineHash();
(async () => {
  // Si la langue déjà choisie par la personne (mémorisée) n'est pas l'anglais,
  // on attend qu'elle soit récupérée avant le tout premier affichage — le texte
  // reste lisible en anglais entre-temps (jamais de blocage ni de page vide),
  // ça évite juste un "flash" où le texte changerait de langue sous les yeux.
  if(LANG !== 'en'){ await ensureLangLoaded(LANG); }
  if(initialVitrineHash.open){
    hideAllShells();
    requireAgeGate(() => openVitrine(initialVitrineHash.id));
  } else {
    // Aucun lien direct : comportement par défaut (vitrine publique, ou espace
    // créatrice/agence si une session existe déjà) — géré par checkGate().
    checkGate();
  }
})();

const VITRINE_PAGE_SIZE = 6;
let vitrinePage = 0;
function renderVitrineGrid(){
  const row1 = document.getElementById('vitrine-grid-row1');
  if(!row1) return;
  const statEl = document.getElementById('vitrine-hero-stat-count');
  if(statEl) statEl.textContent = roster.filter(m => m && m.filled && m.photo).length;
  const totalPages = Math.max(1, Math.ceil(roster.length / VITRINE_PAGE_SIZE));
  if(vitrinePage > totalPages - 1) vitrinePage = totalPages - 1;
  if(vitrinePage < 0) vitrinePage = 0;
  const start = vitrinePage * VITRINE_PAGE_SIZE;
  const html = roster.slice(start, start + VITRINE_PAGE_SIZE).map(m => vitrineCardHtml(m)).join('');
  // Évite de recréer toute la grille (et donc de faire clignoter photos/icônes)
  // quand les données n'ont pas changé depuis le dernier rendu.
  if(row1.dataset.lastHtml === html && row1.dataset.lastPage === String(vitrinePage)){ updateVitrinePageArrows(totalPages); return; }
  row1.dataset.lastHtml = html;
  row1.dataset.lastPage = String(vitrinePage);
  row1.innerHTML = html;
  [row1].forEach(grid => {
    grid.querySelectorAll('.vitrine-enter-btn').forEach(btn => {
      btn.onclick = async () => {
        try{
          window.location.hash = 'vitrine/' + btn.dataset.id;
          await openVitrineRoom(btn.dataset.id);
        }catch(err){
          console.error('vitrine card click error', err);
          toast((LANG==='fr' ? 'Erreur : ' : 'Error: ') + (err && err.message ? err.message : err));
        }
      };
    });
    grid.querySelectorAll('.card-report-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        openReportModal({ profile: btn.dataset.name || '' });
      };
    });
    grid.querySelectorAll('.card-fav-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        toggleMemberFavorite(btn.dataset.id);
      };
    });
  });
  wireVitrinePageArrows();
  updateVitrinePageArrows(totalPages);
  initFavoriteButtonsState();
}
// Navigation par page (6 vignettes) au lieu d'un défilement horizontal continu.
function wireVitrinePageArrows(){
  document.querySelectorAll('.carousel-arrow[data-group="vitrine-carousel"]').forEach(btn => {
    btn.onclick = () => {
      vitrinePage += parseInt(btn.dataset.dir, 10);
      renderVitrineGrid();
      const section = document.getElementById('vitrine-grid-row1');
      if(section) section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
  });
}
function updateVitrinePageArrows(totalPages){
  const prevBtn = document.querySelector('.carousel-arrow[data-group="vitrine-carousel"][data-dir="-1"]');
  const nextBtn = document.querySelector('.carousel-arrow[data-group="vitrine-carousel"][data-dir="1"]');
  if(prevBtn) prevBtn.disabled = vitrinePage <= 0;
  if(nextBtn) nextBtn.disabled = vitrinePage >= totalPages - 1;
}
const ICON_CAMERA = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
const ICON_AUDIO = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
const ICON_HELP = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
const ICON_GIFT = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>';
const ICON_HEART_SM = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.6z"/></svg>';
const ICON_HEART_OUTLINE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.6z"/></svg>';
const ICON_THUMBSUP = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>';
const ICON_SMILE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>';
const ICON_FROWN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>';
const ICON_SHIELD = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21.5s7.5-3.7 7.5-9.3V5.4L12 2.5l-7.5 2.9v6.8c0 5.6 7.5 9.3 7.5 9.3z" fill="currentColor" fill-opacity="0.16"/><path d="M12 8.4l1.1 2.3 2.5.4-1.8 1.8.4 2.5-2.2-1.2-2.2 1.2.4-2.5-1.8-1.8 2.5-.4z" fill="currentColor" stroke-width="1.1"/></svg>';
const ICON_MAIL_SM = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:5px;"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 6 10-6"/></svg>';
const ICON_PIN_SM = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:5px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
const ICON_SPARKLE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.8 2.8M14.9 14.9l2.8 2.8M17.7 6.3l-2.8 2.8M9.1 14.9l-2.8 2.8"/></svg>';
const ICON_SPARKLES2 = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3v4M9 13v4M2 9h4M12 9h4M3.5 4.5l2 2M12.5 13.5l2 2M14.5 4.5l-2 2M5.5 13.5l-2 2"/><circle cx="19" cy="16" r="2"/></svg>';
const ICON_PALETTE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a10 10 0 1 1 0-20c5.5 0 10 4 10 8 0 2.5-2 4-4 4h-2a1.5 1.5 0 0 0-1 2.6c.5.5.5 1.4-.1 1.9-1 .8-1.9 1.5-2.9 1.5z"/><circle cx="6.5" cy="11.5" r="1"/><circle cx="9.5" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/></svg>';
const ICON_CLAPPER = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.2 6L3 11l-.9-2.3c-.3-.9.1-1.9 1-2.2l14.5-5.4c.9-.3 1.9.1 2.2 1z"/><path d="M2 11h20v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/><path d="M6 11l2-4M11.5 11l2-4M17 11l2-4"/></svg>';
const ICON_FLAME = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2s-6 6-6 12a6 6 0 0 0 12 0c0-2-1-3-1-3s-.5 2-2 2c-2 0-1.5-3-1.5-3s-1.5 1-1.5 3c-3-2-3-6 0-11z"/></svg>';
const ICON_ENVELOPE_HEART = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 6 10-6"/></svg>';
const ICON_ROCKET = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>';
const ICON_MOON_STAR = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/><path d="M19 3v4M17 5h4"/></svg>';
const ICON_ALERT_TRIANGLE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
const ICON_TROPHY = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M17 4h3a1 1 0 0 1 1 1v2a4 4 0 0 1-4 4M7 4H4a1 1 0 0 0-1 1v2a4 4 0 0 0 4 4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/></svg>';
const ICON_TARGET_SM = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>';
const ICON_MOBILE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="20" rx="2"/><line x1="11" y1="18" x2="13" y2="18"/></svg>';
const ICON_EXTLINK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
const ICON_CHAT_SM = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:4px;"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
const ICON_VIDEO = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>';
const ICON_BIO = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const ICON_CART = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>';
const ICON_COIN = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M15 9.5c0-1.4-1.34-2.5-3-2.5s-3 1.1-3 2.5S10.34 12 12 12s3 1.1 3 2.5-1.34 2.5-3 2.5-3-1.1-3-2.5"/></svg>';
const ICON_EXTERNAL_LINK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
const ICON_MY_CONTENT = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:5px;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
const ICON_MY_MESSAGES = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:5px;"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
const ICON_MY_CA = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:5px;"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>';
const ICON_MY_TOOLS = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:5px;"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>';
const ICON_MY_RULES = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:5px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>';
const ICON_LOCK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
const ICON_STAR = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" style="vertical-align:-2px;margin-right:3px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
const ICON_SIGN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><path d="M3 17c2-4 4-4 6 0s4 4 6 0 4-4 6 0"/><path d="M3 21h18"/></svg>';
const ICON_CALENDAR = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
const ICON_NOTE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>';
const ICON_CALC = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="11" x2="8" y2="11.01"/><line x1="12" y1="11" x2="12" y2="11.01"/><line x1="16" y1="11" x2="16" y2="11.01"/><line x1="8" y1="15" x2="8" y2="15.01"/><line x1="12" y1="15" x2="12" y2="15.01"/><line x1="16" y1="15" x2="16" y2="15.01"/><line x1="8" y1="19" x2="16" y2="19"/></svg>';
const ICON_CHAT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:4px;"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
const ICON_CHEVRON_LEFT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
const ICON_CHEVRON_RIGHT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
const ICON_CHECK = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><polyline points="20 6 9 17 4 12"/></svg>';
const ICON_TRASH = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';
const ICON_FLAG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>';
const ICON_EDIT = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>';
const ICON_X = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

// Habille une icône SVG (déjà définie plus haut) pour un usage inline dans un <label> :
// même trait doré et même alignement quel que soit le champ concerné (bio libre, questions,
// visibilité...), sans toucher aux icônes de label existantes qui portent déjà leur propre style.
function fieldIcon(svg){
  return `<span class="field-icon">${svg}</span>`;
}

// Sélecteur de visibilité en 3 options (tout le monde / favoris / personne), tout en SVG doré,
// avec un code couleur explicite par niveau (vert = visible à tous, doré = favoris uniquement,
// rouge = masqué à tous) pour que le degré de confidentialité soit lisible d'un coup d'œil.
// Remplace un <select> classique par un groupe de boutons tout en conservant un input hidden
// du même id, pour que le reste du code (lecture de `.value` à la sauvegarde) n'ait rien à changer.
function visibilityGroupHtml(hiddenId, currentValue){
  const opts = [
    ['everyone', ICON_EYE_OPEN, t('memberVisibilityEveryone')],
    ['favorites', ICON_STAR, t('memberVisibilityFavorites')],
    ['nobody', ICON_EYE_OFF, t('memberVisibilityNobody')]
  ];
  return `<div class="visibility-group">
    ${opts.map(([val, icon, label]) => `<button type="button" class="visibility-opt${currentValue === val ? ' active' : ''}" data-value="${val}">${icon}<span>${escText(label)}</span></button>`).join('')}
  </div>
  <input type="hidden" id="${escAttr(hiddenId)}" value="${escAttr(currentValue)}">`;
}
function wireVisibilityGroup(hiddenId){
  const hidden = document.getElementById(hiddenId);
  if(!hidden) return;
  const group = hidden.previousElementSibling;
  if(!group || !group.classList || !group.classList.contains('visibility-group')) return;
  group.querySelectorAll('.visibility-opt').forEach(btn => {
    btn.onclick = () => {
      group.querySelectorAll('.visibility-opt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      hidden.value = btn.dataset.value;
    };
  });
}
const ICON_PLUS = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
const ICON_SAVE = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>';

/* ================= SUJETS DE CONSEILS (chatbot à sujets) =================
   Contenu disponible en français et anglais pour l'instant (les autres
   langues affichent la version anglaise par défaut). Dis-moi si tu veux
   que je traduise ces conseils dans les 12 autres langues du site. */
/* Icônes SVG modernes pour les sujets de conseils (remplace les émojis) */
const AICON = {
  light: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M15.09 14c.36-.61.66-1.14.91-1.5A5 5 0 1 0 7 10c0 2 1 3 2 4.5.25.36.55.89.91 1.5"/></svg>',
  angle: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18.4 8.6 8.6 18.4"/></svg>',
  frame: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>',
  palette: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.2-.3-.4-.6-.4-1 0-.8.7-1.4 1.5-1.4H16c3.3 0 6-2.7 6-6 0-4.9-4.5-9-10-9z"/></svg>',
  device: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>',
  film: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="7" y1="3" x2="7" y2="21"/><line x1="17" y1="3" x2="17" y2="21"/><line x1="2" y1="9" x2="22" y2="9"/><line x1="2" y1="15" x2="22" y2="15"/></svg>',
  scissors: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>',
  music: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  dance: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4" r="2"/><path d="M12 6v6l4 6M12 12l-4 6M8 10l4 2 4-2"/></svg>',
  gamepad: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><circle cx="15" cy="13" r="1"/><circle cx="18" cy="11" r="1"/><rect x="2" y="6" width="20" height="12" rx="6"/></svg>',
  stamp: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 12v-2a5 5 0 0 0-10 0v2M4 21v-3a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v3"/><path d="M2 21h20"/></svg>',
  calendar: ICON_CALENDAR,
  hashtag: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>',
  chat: ICON_CHAT,
  refresh: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
  magnet: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15v-3a6 6 0 0 1 12 0v3"/><path d="M18 15a2 2 0 0 1-4 0v-3M10 15a2 2 0 0 1-4 0v-3"/><line x1="6" y1="9" x2="6" y2="15"/><line x1="18" y1="9" x2="18" y2="15"/></svg>',
  price: ICON_COIN,
  gift: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>',
  clock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  shield: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  eye: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  leaf: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 4 13H2a10 10 0 0 0 10 10c5.5 0 10-4.5 10-10a10 10 0 0 0-10-10 7 7 0 0 0-7 7c0 3.9 3.1 7 7 7z"/></svg>',
  sun: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  mirror: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="18" rx="6"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>',
  chart: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  handshake: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2M3 3l18 0M3 3l0 10 2 2"/></svg>',
  folder: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
  star: ICON_STAR,
  pen: ICON_EDIT,
  search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  target: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  book: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  heart: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
  globe: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>'
};

/* ---------------- Icônes premium (SVG en badge coloré) pour les tags des 3
   chatbots (Tips / Match with Clients / Match Your Words) ----------------
   Réutilise l'icône SVG déjà définie dans AICON (donc rien à redessiner),
   affichée en blanc dans un petit badge rond de couleur — rendu 100% SVG,
   identique sur tous les appareils (contrairement aux emoji, qui dépendent
   de la police du téléphone). */
const AICON_BADGE_COLOR = {
  light:'#e3b341', angle:'#e3b341', frame:'#5b9dd6', palette:'#a76bd6', device:'#5b9dd6', film:'#a76bd6',
  scissors:'#a76bd6', music:'#a76bd6', dance:'#a76bd6', gamepad:'#4fc3a1', stamp:'#c9639e', calendar:'#4fc3a1', hashtag:'#4fc3a1',
  chat:'#4fc3a1', refresh:'#4fc3a1', magnet:'#4fc3a1', price:'#5fd67a', gift:'#5fd67a', clock:'#5fd67a',
  shield:'#5b9dd6', eye:'#5b9dd6', leaf:'#5fd67a', sun:'#e3b341', mirror:'#a76bd6', chart:'#4fc3a1',
  handshake:'#5fd67a', folder:'#c9a15a', star:'#d6a94e', pen:'#4fc3a1', search:'#5b9dd6', target:'#e06a6a',
  book:'#c9a15a', globe:'#5b9dd6'
};
let _aiconKeyBySvg = null;
function badgeColorFor(iconSvg){
  if(!_aiconKeyBySvg){
    _aiconKeyBySvg = new Map();
    Object.keys(AICON).forEach(k => _aiconKeyBySvg.set(AICON[k], k));
  }
  const key = _aiconKeyBySvg.get(iconSvg);
  return AICON_BADGE_COLOR[key] || '#d6a94e';
}
function premiumTagIcon(iconSvg){
  return `<span class="tag-icon-badge" style="background:${badgeColorFor(iconSvg)};">${iconSvg}</span>`;
}
if(!document.getElementById('hm-tag-premium-style')){
  const st = document.createElement('style');
  st.id = 'hm-tag-premium-style';
  st.textContent = `
    .tag-icon-badge{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;margin-right:8px;vertical-align:middle;color:#fff;flex-shrink:0;}
    .tag-icon-badge svg{width:14px;height:14px;}
  `;
  document.head.appendChild(st);
}

/* Conseil "masque" affiché en bas de la page Business & Advices — traductions
   intégrées directement ici (comme FAQ_ITEMS) pour ne pas dépendre des
   fichiers i18n-*.js séparés. */
const MASK_ADVICE_TEXT = {
  fr: "Conseil : si tu sens que ça t'aide côté sécurité ou que ça ajoute un côté mystérieux, tu peux tout à fait porter un masque pour ne pas révéler ton identité en filmant ou en publiant — le site t'y autorise, c'est entièrement ton choix.",
  en: "Tip: if you feel it helps with your safety or adds a bit of mystery, you're welcome to wear a mask to avoid revealing your identity while filming or posting — the site allows it, it's entirely your choice.",
  es: "Consejo: si sientes que te ayuda con tu seguridad o le da un toque de misterio, puedes llevar una máscara para no revelar tu identidad al grabar o publicar — el sitio lo permite, es totalmente tu elección.",
  it: "Consiglio: se pensi che possa aiutarti con la sicurezza o aggiungere un tocco di mistero, puoi tranquillamente indossare una maschera per non rivelare la tua identità quando filmi o pubblichi — il sito lo consente, è del tutto una tua scelta.",
};
const WARDROBE_ADVICE_TEXT = {
  fr: "Conseil business : pense à investir dans quelques tenues de lingerie pour te constituer une garde-robe variée à porter dans tes photos et vidéos — ça donne plus de choix à tes abonnés et ça renouvelle ton contenu.",
  en: "Business tip: consider investing in a few lingerie pieces to build a varied wardrobe for your photos and videos — it gives your followers more variety and keeps your content fresh.",
  es: "Consejo de negocio: considera invertir en algunas prendas de lencería para tener un vestuario variado en tus fotos y videos — le da más variedad a tus seguidores y renueva tu contenido.",
  it: "Consiglio di business: valuta di investire in qualche capo di lingerie per avere un guardaroba vario nelle tue foto e video — offre più varietà ai tuoi follower e rinnova i tuoi contenuti.",
};

/* ================= DEVISES ================= */
const FAQ_ITEMS = {
  fr: [
    { q: "Comment débloquer un contenu payant ?", a: "Clique sur le contenu verrouillé dans la page de la créatrice, remplis le formulaire, puis suis les instructions de paiement envoyées. Le contenu t'est transmis une fois le paiement confirmé." },
    { q: "Comment devenir créatrice sur Honeymoon ?", a: "Utilise le lien \"Postuler pour être modèle\" dans ce menu. L'équipe Honeymoon étudie chaque candidature et te recontacte." },
    { q: "Le site est-il réservé aux adultes ?", a: "Oui. L'accès est strictement réservé aux personnes de 18 ans ou plus, avec vérification d'âge avant tout accès au contenu." },
    { q: "Comment signaler un contenu problématique ?", a: "Utilise le bouton \"Signaler un contenu\" dans ce menu, ou le drapeau 🚩 présent sur chaque commentaire et chaque page de créatrice." },
    { q: "Comment sont réparties les recettes des contenus payants ?", a: "60% du montant revient à la créatrice, 40% à Honeymoon pour la gestion de la plateforme." },
    { q: "Comment contacter l'équipe Honeymoon ?", a: "Par email à honeymoon-official@outlook.com, ou via le bouton de contact en bas de la page principale." },
  ],
  en: [
    { q: "How do I unlock paid content?", a: "Tap the locked content on the creator's page, fill in the form, then follow the payment instructions sent to you. Content is delivered once payment is confirmed." },
    { q: "How do I become a creator on Honeymoon?", a: "Use the \"Apply to become a creator\" link in this menu. The Honeymoon team reviews every application and gets back to you." },
    { q: "Is the site adults-only?", a: "Yes. Access is strictly limited to people aged 18 or older, with age verification before accessing any content." },
    { q: "How do I report problematic content?", a: "Use the \"Report content\" button in this menu, or the 🚩 flag on every comment and every creator page." },
    { q: "How is paid content revenue split?", a: "60% of the amount goes to the creator, 40% to Honeymoon for platform management." },
    { q: "How do I contact the Honeymoon team?", a: "By email at honeymoon-official@outlook.com, or via the contact button at the bottom of the main page." },
  ],
  es: [
    { q: "¿Cómo desbloqueo contenido de pago?", a: "Toca el contenido bloqueado en la página de la creadora, completa el formulario y sigue las instrucciones de pago enviadas. El contenido se entrega tras confirmar el pago." },
    { q: "¿Cómo me convierto en creadora en Honeymoon?", a: "Usa el enlace \"Postular para ser modelo\" en este menú. El equipo de Honeymoon revisa cada solicitud y se pondrá en contacto contigo." },
    { q: "¿El sitio es solo para adultos?", a: "Sí. El acceso está estrictamente limitado a personas de 18 años o más, con verificación de edad antes de acceder a cualquier contenido." },
    { q: "¿Cómo denuncio contenido problemático?", a: "Usa el botón \"Denunciar contenido\" en este menú, o la bandera 🚩 presente en cada comentario y cada página de creadora." },
    { q: "¿Cómo se reparten los ingresos del contenido de pago?", a: "El 60% del importe va a la creadora, el 40% a Honeymoon por la gestión de la plataforma." },
    { q: "¿Cómo contacto al equipo de Honeymoon?", a: "Por correo a honeymoon-official@outlook.com, o mediante el botón de contacto al final de la página principal." },
  ],
  it: [
    { q: "Come sblocco un contenuto a pagamento?", a: "Tocca il contenuto bloccato nella pagina della creatrice, compila il modulo e segui le istruzioni di pagamento inviate. Il contenuto viene consegnato dopo la conferma del pagamento." },
    { q: "Come divento creatrice su Honeymoon?", a: "Usa il link \"Candidati per diventare modella\" in questo menu. Il team Honeymoon esamina ogni candidatura e ti ricontatta." },
    { q: "Il sito è riservato agli adulti?", a: "Sì. L'accesso è strettamente limitato a persone di almeno 18 anni, con verifica dell'età prima di accedere a qualsiasi contenuto." },
    { q: "Come segnalo un contenuto problematico?", a: "Usa il pulsante \"Segnala un contenuto\" in questo menu, oppure la bandierina 🚩 presente su ogni commento e su ogni pagina delle creatrici." },
    { q: "Come vengono ripartiti i ricavi dei contenuti a pagamento?", a: "Il 60% dell'importo va alla creatrice, il 40% a Honeymoon per la gestione della piattaforma." },
    { q: "Come contatto il team Honeymoon?", a: "Via email a honeymoon-official@outlook.com, oppure tramite il pulsante di contatto in fondo alla pagina principale." },
  ],
  pt: [
    { q: "Como desbloqueio conteúdo pago?", a: "Toca no conteúdo bloqueado na página da criadora, preenche o formulário e segue as instruções de pagamento enviadas. O conteúdo é entregue após a confirmação do pagamento." },
    { q: "Como me torno criadora na Honeymoon?", a: "Usa o link \"Candidatar para ser modelo\" neste menu. A equipa Honeymoon analisa cada candidatura e entra em contacto contigo." },
    { q: "O site é apenas para adultos?", a: "Sim. O acesso é estritamente limitado a pessoas com 18 anos ou mais, com verificação de idade antes de aceder a qualquer conteúdo." },
    { q: "Como denuncio conteúdo problemático?", a: "Usa o botão \"Denunciar conteúdo\" neste menu, ou a bandeira 🚩 presente em cada comentário e em cada página de criadora." },
    { q: "Como é dividida a receita do conteúdo pago?", a: "60% do valor vai para a criadora, 40% para a Honeymoon pela gestão da plataforma." },
    { q: "Como contacto a equipa Honeymoon?", a: "Por email para honeymoon-official@outlook.com, ou através do botão de contacto no final da página principal." },
  ],
  sw: [
    { q: "Ninafunguaje maudhui yanayolipiwa?", a: "Gusa maudhui yaliyofungwa kwenye ukurasa wa muundaji, jaza fomu kisha fuata maelekezo ya malipo yaliyotumwa. Maudhui hutolewa baada ya malipo kuthibitishwa." },
    { q: "Ninawezaje kuwa muundaji kwenye Honeymoon?", a: "Tumia kiungo \"Omba kuwa muundaji\" kwenye menyu hii. Timu ya Honeymoon inapitia kila ombi na itawasiliana nawe." },
    { q: "Je, tovuti ni kwa watu wazima tu?", a: "Ndiyo. Ufikiaji umezuiliwa kabisa kwa watu wenye miaka 18 au zaidi, na uthibitisho wa umri kabla ya kufikia maudhui yoyote." },
    { q: "Ninaripotije maudhui yenye tatizo?", a: "Tumia kitufe cha \"Ripoti maudhui\" kwenye menyu hii, au bendera 🚩 iliyopo kwenye kila maoni na kila ukurasa wa muundaji." },
    { q: "Mapato ya maudhui yanayolipiwa yanagawanywaje?", a: "60% ya kiasi huenda kwa muundaji, 40% kwa Honeymoon kwa ajili ya usimamizi wa jukwaa." },
    { q: "Ninawasilianaje na timu ya Honeymoon?", a: "Kwa barua pepe honeymoon-official@outlook.com, au kupitia kitufe cha mawasiliano chini ya ukurasa mkuu." },
  ],
  zu: [
    { q: "Ngivula kanjani okuqukethwe okukhokhelwayo?", a: "Thepha okuqukethwe okuvaliwe ekhasini lomdali, ugcwalise ifomu bese ulandela imiyalelo yenkokhelo ethunyelwe. Okuqukethwe kulethwa uma inkokhelo isiqinisekisiwe." },
    { q: "Ngiba kanjani umdali ku-Honeymoon?", a: "Sebenzisa isixhumanisi \"Faka isicelo sokuba yimodeli\" kule menyu. Ithimba le-Honeymoon libuyekeza sonke isicelo bese lixhumana nawe." },
    { q: "Ingabe le sayithi eyabantu abadala kuphela?", a: "Yebo. Ukufinyelela kukhawulelwe kuphela kubantu abaneminyaka engu-18 noma ngaphezulu, ngokuqinisekiswa kweminyaka ngaphambi kokufinyelela noma yikuphi okuqukethwe." },
    { q: "Ngibika kanjani okuqukethwe okunenkinga?", a: "Sebenzisa inkinobho \"Bika okuqukethwe\" kule menyu, noma ifulege 🚩 ekhona kuwo wonke amazwana nasekhasini ngalinye lomdali." },
    { q: "Imali engenayo yokuqukethwe okukhokhelwayo yahlukaniswa kanjani?", a: "60% yenani liya kumdali, 40% ku-Honeymoon ngenxa yokuphathwa kwepulatifomu." },
    { q: "Ngixhumana kanjani nethimba le-Honeymoon?", a: "Nge-imeyili ku-honeymoon-official@outlook.com, noma ngenkinobho yokuxhumana ngezansi kwekhasi eliyinhloko." },
  ],
  st: [
    { q: "Ke ntshua jwang diteng tse lefellwang?", a: "Tobetsa diteng tse notletsweng leqepheng la mmopi, tlatsa foromo ebe o latela ditaelo tsa tefo tse rometsweng. Diteng di fanwe ha tefo e netefaditswe." },
    { q: "Ke ba mmopi jwang ho Honeymoon?", a: "Sebedisa link ya \"Kopa ho ba mmopi\" lenaneng lena. Sehlopha sa Honeymoon se hlahloba kopo ka nngwe mme se tla ikopanya le wena." },
    { q: "Na sethala ke sa batho ba baholo feela?", a: "E. Phihlello e thibetswe ka ho qapha ho batho ba dilemo tse 18 kapa ho feta, ka netefatso ya dilemo pele ho fihlella diteng dife kapa dife." },
    { q: "Ke tlaleha jwang diteng tse nang le bothata?", a: "Sebedisa konopo ya \"Tlaleha diteng\" lenaneng lena, kapa folaga 🚩 e leng teng maikutlong a mang le a mang le leqepheng la mmopi ka mong." },
    { q: "Lekeno la diteng tse lefellwang le arolwa jwang?", a: "60% ya chelete e ya ho mmopi, 40% e ya ho Honeymoon bakeng sa tsamaiso ya sethala." },
    { q: "Ke ikopanya jwang le sehlopha sa Honeymoon?", a: "Ka imeile ho honeymoon-official@outlook.com, kapa ka konopo ya puisano tlasa leqephe le kgolo." },
  ],
  ln: [
    { q: "Ndenge nini nakoki kofungola bikuma ya lifuti?", a: "Finela bikuma ekangami na page ya mokeli, tondisa formulaire mpe landa malako ya paiement etindami. Bikuma epesamaka soki paiement endimami." },
    { q: "Ndenge nini nakoki kokoma mokeli na Honeymoon?", a: "Sala formulaire \"Sengaka kokoma modèle\" na menu oyo. Lisanga ya Honeymoon etalaka demande moko na moko mpe ekosolola na yo." },
    { q: "Site ezali ya bato minene kaka?", a: "Iyo. Kokota ekangami kaka na bato ya mibu 18 to koleka, na bosolo ya mibu liboso ya kokota na eloko nyonso." },
    { q: "Ndenge nini nakoki koyebisa likambo ya mbulu?", a: "Sala bouton \"Yebisa likambo\" na menu oyo, to drapeau 🚩 oyo ezali na commentaire moko na moko mpe na page ya mokeli moko na moko." },
    { q: "Mbongo ya bikuma ya lifuti ekabolamaka ndenge nini?", a: "60% ya montant ekeyi epai ya mokeli, 40% epai ya Honeymoon mpo na kobongisa plateforme." },
    { q: "Ndenge nini nakoki kosolola na lisanga ya Honeymoon?", a: "Na email honeymoon-official@outlook.com, to na bouton ya boyokani na se ya page monene." },
  ],
  kg: [
    { q: "Inki mutindu mono lenda kufungula bima ya lifuta?", a: "Fina bima yina kekangama na page ya metila, fulusa formulaire ye landa malongi ya paiement yina metindusama. Bima kepesamaka kana paiement mendimama." },
    { q: "Inki mutindu mono lenda kuvanda metila na Honeymoon?", a: "Sadila lien \"Lomba kuvanda mutindu\" na menu yayi. Dibundu ya Honeymoon ketala demande konso ye tasolula ye nge." },
    { q: "Site kele ya bantu ya nene kaka?", a: "Ee. Kukota kekangama kaka na bantu ya mvula 18 to zulu, na kieleka ya mvula na ntwala ya kukota na kima konso." },
    { q: "Inki mutindu mono lenda kuzabisa dyambu ya mbi?", a: "Sadila bouton \"Zabisa dyambu\" na menu yayi, to drapeau 🚩 yina kevanda na commentaire konso ye na page ya metila konso." },
    { q: "Mbongo ya bima ya lifuta kekabwanaka inki mutindu?", a: "60% ya montant kekwenda epai ya metila, 40% epai ya Honeymoon mpo na kubongisa plateforme." },
    { q: "Inki mutindu mono lenda kusolula ye dibundu ya Honeymoon?", a: "Na email honeymoon-official@outlook.com, to na bouton ya kuwakana na nsi ya page ya nene." },
  ],
  ar: [
    { q: "كيف أفتح محتوى مدفوعًا؟", a: "اضغطي على المحتوى المقفل في صفحة المنشئة، املئي النموذج ثم اتبعي تعليمات الدفع المُرسلة. يُسلَّم المحتوى بعد تأكيد الدفع." },
    { q: "كيف أصبح منشئة على Honeymoon؟", a: "استخدمي رابط \"التقدم لتكوني عارضة\" في هذه القائمة. يراجع فريق Honeymoon كل طلب ويتواصل معك." },
    { q: "هل الموقع مخصص للبالغين فقط؟", a: "نعم. الوصول مقتصر بشكل صارم على من هم 18 عامًا فأكثر، مع التحقق من العمر قبل الوصول إلى أي محتوى." },
    { q: "كيف أبلغ عن محتوى إشكالي؟", a: "استخدمي زر \"الإبلاغ عن محتوى\" في هذه القائمة، أو علامة 🚩 الموجودة على كل تعليق وكل صفحة منشئة." },
    { q: "كيف يتم تقسيم إيرادات المحتوى المدفوع؟", a: "60% من المبلغ يذهب إلى المنشئة، و40% إلى Honeymoon مقابل إدارة المنصة." },
    { q: "كيف أتواصل مع فريق Honeymoon؟", a: "عبر البريد الإلكتروني honeymoon-official@outlook.com، أو عبر زر التواصل أسفل الصفحة الرئيسية." },
  ],
  zh: [
    { q: "如何解锁付费内容？", a: "点击创作者页面上的锁定内容，填写表单，然后按照发送的付款说明操作。付款确认后即可获得内容。" },
    { q: "如何成为 Honeymoon 的创作者？", a: "使用本菜单中的“申请成为模特”链接。Honeymoon 团队会审核每一份申请并与你联系。" },
    { q: "本网站仅限成人使用吗？", a: "是的。访问权限严格限于年满18周岁及以上的人士，访问任何内容前均需进行年龄验证。" },
    { q: "如何举报有问题的内容？", a: "使用本菜单中的“举报内容”按钮，或每条评论和每个创作者页面上的 🚩 标志。" },
    { q: "付费内容的收益如何分配？", a: "60%归创作者所有，40%归 Honeymoon 用于平台管理。" },
    { q: "如何联系 Honeymoon 团队？", a: "通过邮箱 honeymoon-official@outlook.com，或通过主页底部的联系按钮。" },
  ],
  ja: [
    { q: "有料コンテンツはどうやって解除しますか？", a: "クリエイターのページでロックされたコンテンツをタップし、フォームに入力してから送られてきた支払い案内に従ってください。支払いが確認されるとコンテンツが届きます。" },
    { q: "Honeymoonのクリエイターになるには？", a: "このメニューの「モデルに応募する」リンクを使ってください。Honeymoonチームがすべての応募を確認し、ご連絡します。" },
    { q: "このサイトは成人限定ですか？", a: "はい。アクセスは18歳以上の方に厳しく限定されており、コンテンツにアクセスする前に年齢確認が必要です。" },
    { q: "問題のあるコンテンツはどう報告しますか？", a: "このメニューの「コンテンツを報告」ボタン、またはすべてのコメントとクリエイターページにある🚩マークを使ってください。" },
    { q: "有料コンテンツの収益はどう分配されますか？", a: "金額の60%がクリエイターに、40%がプラットフォーム運営費としてHoneymoonに配分されます。" },
    { q: "Honeymoonチームへの連絡方法は？", a: "honeymoon-official@outlook.com へのメール、またはメインページ下部の連絡ボタンからご連絡ください。" },
  ],
  ru: [
    { q: "Как разблокировать платный контент?", a: "Нажми на заблокированный контент на странице создательницы, заполни форму и следуй присланным инструкциям по оплате. Контент передаётся после подтверждения оплаты." },
    { q: "Как стать создательницей на Honeymoon?", a: "Используй ссылку «Подать заявку, чтобы стать моделью» в этом меню. Команда Honeymoon рассматривает каждую заявку и свяжется с тобой." },
    { q: "Сайт только для взрослых?", a: "Да. Доступ строго ограничен лицами от 18 лет, с проверкой возраста перед доступом к любому контенту." },
    { q: "Как сообщить о проблемном контенте?", a: "Используй кнопку «Пожаловаться на контент» в этом меню или значок 🚩 на каждом комментарии и каждой странице создательницы." },
    { q: "Как распределяется доход от платного контента?", a: "60% суммы получает создательница, 40% — Honeymoon за управление платформой." },
    { q: "Как связаться с командой Honeymoon?", a: "По email honeymoon-official@outlook.com или через кнопку контакта внизу главной страницы." },
  ],
};

const CREATOR_CONTRACT_TEXT = {
  fr: "CONTRAT DE COLLABORATION — Honeymoon & Créatrice\n\nEntre Honeymoon (représenté par Prince Mickael Record, honeymoon-official@outlook.com) et la créatrice signataire ci-dessous.\n\n1. Objet\nCe contrat encadre la collaboration entre la créatrice et Honeymoon pour la publication et la vente de contenu sur la plateforme.\n\n2. Contenu autorisé\nLingerie, tenue sexy, danse sensuelle, twerk, attitude aguicheuse. Aucun contenu nu — photo, vidéo ou audio — n'est accepté sur cette plateforme.\n\n3. Propriété du contenu\nLa créatrice reste propriétaire de tout contenu qu'elle publie. Elle garantit être seule auteure et propriétaire des droits sur ce contenu, et avoir au moins 18 ans au moment de sa création.\n\n4. Répartition des revenus\nPour tout contenu payant vendu via la plateforme : 60% du montant revient à la créatrice, 40% à Honeymoon au titre de la gestion de la plateforme.\n\n5. Exclusivité de gestion\nHoneymoon agit comme intermédiaire technique et commercial pour la mise en relation avec les visiteurs et agences partenaires, sans exclusivité imposée à la créatrice sur d'autres plateformes, sauf accord contraire signé séparément.\n\n6. Confidentialité et sécurité\nLes informations personnelles de la créatrice (identité, coordonnées) restent confidentielles et ne sont partagées qu'avec les autorités compétentes en cas d'obligation légale.\n\n7. Durée et résiliation\nCe contrat est valable jusqu'à résiliation par l'une des parties, avec un préavis de 15 jours notifié par écrit à honeymoon-official@outlook.com.\n\n8. Acceptation\nEn signant ci-dessous, la créatrice reconnaît avoir lu, compris et accepté l'ensemble des présentes conditions, ainsi que les règles du site et les conditions générales d'utilisation disponibles dans le menu du site.",
  en: "COLLABORATION AGREEMENT — Honeymoon & Creator\n\nBetween Honeymoon (represented by Prince Mickael Record, honeymoon-official@outlook.com) and the creator signing below.\n\n1. Purpose\nThis agreement governs the collaboration between the creator and Honeymoon for publishing and selling content on the platform.\n\n2. Allowed content\nLingerie, sexy outfits, sensual dance, twerking, teasing attitude. No nude content — photo, video, or audio — is accepted on this platform.\n\n3. Content ownership\nThe creator remains the owner of any content she publishes. She warrants that she is the sole author and owner of the rights to that content, and that she was at least 18 years old at the time it was created.\n\n4. Revenue split\nFor any paid content sold through the platform: 60% of the amount goes to the creator, 40% to Honeymoon for platform management.\n\n5. Management exclusivity\nHoneymoon acts as a technical and commercial intermediary for connecting with visitors and partner agencies, without imposing exclusivity on the creator regarding other platforms, unless otherwise agreed in a separate signed agreement.\n\n6. Confidentiality and security\nThe creator's personal information (identity, contact details) remains confidential and is only shared with relevant authorities where legally required.\n\n7. Duration and termination\nThis agreement remains valid until terminated by either party, with 15 days' notice given in writing to honeymoon-official@outlook.com.\n\n8. Acceptance\nBy signing below, the creator acknowledges having read, understood, and accepted all of these terms, as well as the site rules and terms and conditions available in the site menu.",
  es: "CONTRATO DE COLABORACIÓN — Honeymoon y Creadora\n\nEntre Honeymoon (representado por Prince Mickael Record, honeymoon-official@outlook.com) y la creadora firmante a continuación.\n\n1. Objeto\nEste contrato regula la colaboración entre la creadora y Honeymoon para la publicación y venta de contenido en la plataforma.\n\n2. Contenido permitido\nLencería, ropa sexy, baile sensual, twerking, actitud provocadora. No se acepta contenido desnudo — foto, video o audio — en esta plataforma.\n\n3. Propiedad del contenido\nLa creadora sigue siendo propietaria de todo el contenido que publique. Garantiza ser la única autora y propietaria de los derechos sobre dicho contenido, y tener al menos 18 años en el momento de su creación.\n\n4. Reparto de ingresos\nPara todo contenido de pago vendido a través de la plataforma: el 60% del importe corresponde a la creadora, el 40% a Honeymoon por la gestión de la plataforma.\n\n5. Exclusividad de gestión\nHoneymoon actúa como intermediario técnico y comercial para la conexión con visitantes y agencias asociadas, sin imponer exclusividad a la creadora respecto a otras plataformas, salvo acuerdo distinto firmado por separado.\n\n6. Confidencialidad y seguridad\nLa información personal de la creadora (identidad, datos de contacto) permanece confidencial y solo se comparte con las autoridades competentes en caso de obligación legal.\n\n7. Duración y rescisión\nEste contrato es válido hasta su rescisión por cualquiera de las partes, con un preaviso de 15 días notificado por escrito a honeymoon-official@outlook.com.\n\n8. Aceptación\nAl firmar a continuación, la creadora reconoce haber leído, comprendido y aceptado todas estas condiciones, así como las reglas del sitio y los términos y condiciones disponibles en el menú del sitio.",
  it: "CONTRATTO DI COLLABORAZIONE — Honeymoon e Creatrice\n\nTra Honeymoon (rappresentato da Prince Mickael Record, honeymoon-official@outlook.com) e la creatrice firmataria di seguito.\n\n1. Oggetto\nQuesto contratto disciplina la collaborazione tra la creatrice e Honeymoon per la pubblicazione e la vendita di contenuti sulla piattaforma.\n\n2. Contenuto consentito\nLingerie, abiti sexy, danza sensuale, twerking, atteggiamento provocante. Nessun contenuto nudo — foto, video o audio — è accettato su questa piattaforma.\n\n3. Proprietà del contenuto\nLa creatrice resta proprietaria di tutti i contenuti che pubblica. Garantisce di essere l'unica autrice e proprietaria dei diritti su tali contenuti e di avere almeno 18 anni al momento della loro creazione.\n\n4. Ripartizione dei ricavi\nPer ogni contenuto a pagamento venduto tramite la piattaforma: il 60% dell'importo va alla creatrice, il 40% a Honeymoon per la gestione della piattaforma.\n\n5. Esclusività di gestione\nHoneymoon agisce come intermediario tecnico e commerciale per il collegamento con visitatori e agenzie partner, senza imporre esclusività alla creatrice riguardo ad altre piattaforme, salvo diverso accordo firmato separatamente.\n\n6. Riservatezza e sicurezza\nLe informazioni personali della creatrice (identità, contatti) restano riservate e vengono condivise solo con le autorità competenti in caso di obbligo legale.\n\n7. Durata e recesso\nQuesto contratto resta valido fino al recesso di una delle parti, con un preavviso di 15 giorni notificato per iscritto a honeymoon-official@outlook.com.\n\n8. Accettazione\nFirmando di seguito, la creatrice riconosce di aver letto, compreso e accettato tutte le presenti condizioni, nonché le regole del sito e i termini e condizioni disponibili nel menu del sito.",
};

const AGENCY_CONTRACT_TEXT = {
  fr: "CONTRAT DE REPRÉSENTATION — Agence partenaire\n\nEntre Honeymoon (pour le compte de la créatrice concernée) et l'agence signataire ci-dessous.\n\n1. Objet\nCe contrat encadre la collaboration entre l'agence et la créatrice représentée, dans le cadre d'une mise en relation via Honeymoon.\n\n2. Obligations de l'agence\nL'agence s'engage à promouvoir la créatrice de manière éthique, à respecter ses limites personnelles et la politique de contenu du site (lingerie/tenue sexy uniquement, aucune nudité), et à ne faire aucun usage non autorisé de son image ou de son contenu.\n\n3. Rémunération\nLes modalités financières entre l'agence et la créatrice (commissions, partenariats rémunérés) sont définies séparément d'un commun accord entre les parties, et ne relèvent pas de la répartition standard 60/40 appliquée aux ventes directes sur Honeymoon.\n\n4. Confidentialité\nLes informations personnelles de la créatrice communiquées dans le cadre de cette collaboration restent strictement confidentielles.\n\n5. Durée et résiliation\nCe contrat reste valable jusqu'à résiliation par l'une des parties, avec notification écrite à honeymoon-official@outlook.com.\n\n6. Acceptation\nEn signant ci-dessous, le représentant de l'agence reconnaît avoir lu, compris et accepté les présentes conditions.",
  en: "REPRESENTATION AGREEMENT — Partner Agency\n\nBetween Honeymoon (on behalf of the creator concerned) and the signing agency below.\n\n1. Purpose\nThis agreement governs the collaboration between the agency and the represented creator, established through Honeymoon.\n\n2. Agency obligations\nThe agency agrees to promote the creator ethically, to respect her personal boundaries and the site's content policy (lingerie/sexy outfits only, no nudity), and to make no unauthorized use of her image or content.\n\n3. Compensation\nFinancial terms between the agency and the creator (commissions, paid partnerships) are defined separately by mutual agreement between the parties, and are not covered by the standard 60/40 split applied to direct sales on Honeymoon.\n\n4. Confidentiality\nThe creator's personal information shared as part of this collaboration remains strictly confidential.\n\n5. Duration and termination\nThis agreement remains valid until terminated by either party, with written notice to honeymoon-official@outlook.com.\n\n6. Acceptance\nBy signing below, the agency's representative acknowledges having read, understood, and accepted these terms.",
  es: "ACUERDO DE REPRESENTACIÓN — Agencia asociada\n\nEntre Honeymoon (en nombre de la creadora en cuestión) y la agencia firmante a continuación.\n\n1. Objeto\nEste acuerdo regula la colaboración entre la agencia y la creadora representada, establecida a través de Honeymoon.\n\n2. Obligaciones de la agencia\nLa agencia se compromete a promocionar a la creadora de forma ética, respetar sus límites personales y la política de contenido del sitio (lencería/ropa sexy únicamente, sin desnudos), y a no hacer ningún uso no autorizado de su imagen o contenido.\n\n3. Remuneración\nLas condiciones financieras entre la agencia y la creadora (comisiones, colaboraciones pagadas) se definen por separado de mutuo acuerdo entre las partes, y no están cubiertas por el reparto estándar 60/40 aplicado a las ventas directas en Honeymoon.\n\n4. Confidencialidad\nLa información personal de la creadora compartida en el marco de esta colaboración permanece estrictamente confidencial.\n\n5. Duración y rescisión\nEste acuerdo es válido hasta su rescisión por cualquiera de las partes, con notificación por escrito a honeymoon-official@outlook.com.\n\n6. Aceptación\nAl firmar a continuación, el representante de la agencia reconoce haber leído, comprendido y aceptado estas condiciones.",
  it: "ACCORDO DI RAPPRESENTANZA — Agenzia partner\n\nTra Honeymoon (per conto della creatrice interessata) e l'agenzia firmataria di seguito.\n\n1. Oggetto\nQuesto accordo disciplina la collaborazione tra l'agenzia e la creatrice rappresentata, stabilita tramite Honeymoon.\n\n2. Obblighi dell'agenzia\nL'agenzia si impegna a promuovere la creatrice in modo etico, a rispettare i suoi limiti personali e la politica dei contenuti del sito (solo lingerie/abiti sexy, nessuna nudità), e a non fare alcun uso non autorizzato della sua immagine o dei suoi contenuti.\n\n3. Compenso\nLe condizioni finanziarie tra l'agenzia e la creatrice (commissioni, collaborazioni retribuite) sono definite separatamente di comune accordo tra le parti, e non rientrano nella ripartizione standard 60/40 applicata alle vendite dirette su Honeymoon.\n\n4. Riservatezza\nLe informazioni personali della creatrice condivise nell'ambito di questa collaborazione restano strettamente riservate.\n\n5. Durata e recesso\nQuesto accordo resta valido fino al recesso di una delle parti, con notifica scritta a honeymoon-official@outlook.com.\n\n6. Accettazione\nFirmando di seguito, il rappresentante dell'agenzia riconosce di aver letto, compreso e accettato queste condizioni.",
};
const PARTNER_SITE_CONTRACT_TEXT = {
  fr: "CONTRAT DE PARTENARIAT — Site / Plateforme partenaire\n\nEntre Honeymoon (pour le compte de la créatrice concernée) et le site partenaire signataire ci-dessous.\n\n1. Objet\nCe contrat encadre un partenariat entre le site partenaire (ex. plateforme de cam, chat en direct, ou autre service) et la créatrice, dans le cadre d'une mise en relation via Honeymoon.\n\n2. Consentement et image\nToute utilisation de l'image, du nom ou du contenu de la créatrice sur le site partenaire nécessite son accord explicite préalable, obtenu séparément de ce contrat.\n\n3. Conformité du contenu\nLe site partenaire s'engage à respecter, pour tout contenu impliquant la créatrice, une politique au moins aussi stricte que celle de Honeymoon (lingerie/tenue sexy uniquement, aucune nudité), sauf accord écrit distinct signé par la créatrice elle-même.\n\n4. Modalités financières\nLes conditions commerciales entre le site partenaire et la créatrice (commissions, reversements) sont définies séparément d'un commun accord entre les parties.\n\n5. Confidentialité\nLes informations personnelles de la créatrice communiquées dans le cadre de ce partenariat restent strictement confidentielles.\n\n6. Durée et résiliation\nCe contrat reste valable jusqu'à résiliation par l'une des parties, avec notification écrite à honeymoon-official@outlook.com.\n\n7. Acceptation\nEn signant ci-dessous, le représentant du site partenaire reconnaît avoir lu, compris et accepté les présentes conditions.",
  en: "PARTNERSHIP AGREEMENT — Partner Site / Platform\n\nBetween Honeymoon (on behalf of the creator concerned) and the signing partner site below.\n\n1. Purpose\nThis agreement governs a partnership between the partner site (e.g. cam platform, live chat, or other service) and the creator, established through Honeymoon.\n\n2. Consent and image use\nAny use of the creator's image, name, or content on the partner site requires her explicit prior consent, obtained separately from this agreement.\n\n3. Content compliance\nThe partner site agrees that any content involving the creator will follow a policy at least as strict as Honeymoon's (lingerie/sexy outfits only, no nudity), unless otherwise agreed in a separate written agreement signed by the creator herself.\n\n4. Financial terms\nCommercial terms between the partner site and the creator (commissions, payouts) are defined separately by mutual agreement between the parties.\n\n5. Confidentiality\nThe creator's personal information shared as part of this partnership remains strictly confidential.\n\n6. Duration and termination\nThis agreement remains valid until terminated by either party, with written notice to honeymoon-official@outlook.com.\n\n7. Acceptance\nBy signing below, the partner site's representative acknowledges having read, understood, and accepted these terms.",
  es: "ACUERDO DE ASOCIACIÓN — Sitio / Plataforma asociada\n\nEntre Honeymoon (en nombre de la creadora en cuestión) y el sitio asociado firmante a continuación.\n\n1. Objeto\nEste acuerdo regula una asociación entre el sitio asociado (ej. plataforma de cam, chat en vivo u otro servicio) y la creadora, establecida a través de Honeymoon.\n\n2. Consentimiento y uso de imagen\nCualquier uso de la imagen, nombre o contenido de la creadora en el sitio asociado requiere su consentimiento explícito previo, obtenido por separado de este acuerdo.\n\n3. Cumplimiento de contenido\nEl sitio asociado acepta que todo contenido que involucre a la creadora seguirá una política al menos tan estricta como la de Honeymoon (lencería/ropa sexy únicamente, sin desnudos), salvo acuerdo distinto por escrito firmado por la propia creadora.\n\n4. Condiciones financieras\nLas condiciones comerciales entre el sitio asociado y la creadora (comisiones, pagos) se definen por separado de mutuo acuerdo entre las partes.\n\n5. Confidencialidad\nLa información personal de la creadora compartida en el marco de esta asociación permanece estrictamente confidencial.\n\n6. Duración y rescisión\nEste acuerdo es válido hasta su rescisión por cualquiera de las partes, con notificación por escrito a honeymoon-official@outlook.com.\n\n7. Aceptación\nAl firmar a continuación, el representante del sitio asociado reconoce haber leído, comprendido y aceptado estas condiciones.",
  it: "ACCORDO DI PARTNERSHIP — Sito / Piattaforma partner\n\nTra Honeymoon (per conto della creatrice interessata) e il sito partner firmatario di seguito.\n\n1. Oggetto\nQuesto accordo disciplina una partnership tra il sito partner (es. piattaforma cam, chat dal vivo o altro servizio) e la creatrice, stabilita tramite Honeymoon.\n\n2. Consenso e uso dell'immagine\nQualsiasi uso dell'immagine, del nome o dei contenuti della creatrice sul sito partner richiede il suo consenso esplicito preventivo, ottenuto separatamente da questo accordo.\n\n3. Conformità dei contenuti\nIl sito partner accetta che qualsiasi contenuto che coinvolga la creatrice segua una politica almeno rigorosa quanto quella di Honeymoon (solo lingerie/abiti sexy, nessuna nudità), salvo diverso accordo scritto firmato dalla creatrice stessa.\n\n4. Condizioni finanziarie\nLe condizioni commerciali tra il sito partner e la creatrice (commissioni, pagamenti) sono definite separatamente di comune accordo tra le parti.\n\n5. Riservatezza\nLe informazioni personali della creatrice condivise nell'ambito di questa partnership restano strettamente riservate.\n\n6. Durata e recesso\nQuesto accordo resta valido fino al recesso di una delle parti, con notifica scritta a honeymoon-official@outlook.com.\n\n7. Accettazione\nFirmando di seguito, il rappresentante del sito partner riconosce di aver letto, compreso e accettato queste condizioni.",
};

const LEGAL_DOCS = {
  fr: {
    statement2257: "Conformément aux exigences applicables en matière d'enregistrement (18 U.S.C. § 2257 et réglementations assimilées), Honeymoon déclare que toute créatrice publiant du contenu sur cette plateforme a préalablement fourni une pièce d'identité officielle attestant qu'elle est âgée d'au moins 18 ans au moment de la création du contenu, ainsi qu'un consentement écrit à la publication de ce contenu dans le cadre du contrat de collaboration signé avec Honeymoon.\n\nCes documents sont conservés de manière sécurisée et confidentielle par l'administration de Honeymoon, conformément à la réglementation en vigueur, et peuvent être présentés aux autorités compétentes sur demande légale.\n\nToute personne ayant des raisons de croire qu'un contenu publié sur ce site implique une personne mineure est invitée à le signaler immédiatement à honeymoon-official@outlook.com. Le contenu concerné sera retiré immédiatement dans l'attente d'une vérification.\n\nResponsable de la conservation des dossiers pour cette plateforme : Prince Mickael Record — honeymoon-official@outlook.com",
    terms: "1. Objet\nLes présentes conditions générales encadrent l'utilisation du site Honeymoon, plateforme de mise en relation entre créatrices de contenu et visiteurs ou agences partenaires.\n\n2. Accès\nL'accès au contenu réservé aux adultes est strictement limité aux personnes majeures (18 ans ou plus dans leur juridiction). Une vérification d'âge est requise avant tout accès au contenu.\n\n3. Contenu\nLe contenu publié par les créatrices reste leur propriété. Honeymoon agit en tant qu'intermédiaire technique et commercial. Toute reproduction, capture d'écran ou redistribution du contenu sans autorisation est strictement interdite.\n\n4. Paiements\nLes achats de contenu exclusif sont traités selon les modalités décrites dans la politique de prix et de remboursement du site.\n\n5. Comportement\nTout comportement abusif, harcelant ou menaçant envers les créatrices ou l'équipe Honeymoon entraîne une exclusion immédiate du site.\n\n6. Responsabilité\nHoneymoon met tout en œuvre pour assurer la conformité du contenu publié mais ne saurait être tenu responsable des contenus publiés par des tiers en violation des présentes conditions.\n\n7. Modification\nCes conditions peuvent être mises à jour à tout moment ; la version en vigueur est celle publiée sur le site.\n\n8. Contact\nPour toute question : honeymoon-official@outlook.com",
    privacy: "Honeymoon collecte uniquement les données nécessaires au fonctionnement du site : informations de profil des créatrices (nom de scène, pays, biographie), contenus publiés, commentaires laissés par les visiteurs, informations de contact fournies lors d'une demande de déblocage de contenu payant (prénom, moyen de contact), et données techniques liées à la vérification d'âge.\n\nCes données sont stockées de manière sécurisée via Firebase (Google). Elles ne sont jamais vendues à des tiers. Elles peuvent être partagées avec les autorités compétentes uniquement dans le cadre d'une obligation légale.\n\nLes créatrices peuvent demander la suppression de leur profil et de leur contenu à tout moment en contactant honeymoon-official@outlook.com. Les visiteurs peuvent demander la suppression de leurs commentaires ou de leurs informations de contact de la même manière.\n\nLe site utilise le stockage local de votre navigateur (localStorage) pour certaines préférences (langue, nom affiché dans les commentaires) — ces données restent sur votre appareil et ne sont pas transmises à Honeymoon.\n\nPour toute question relative à vos données personnelles : honeymoon-official@outlook.com",
    pricing: "Les prix des contenus exclusifs (photos, vidéos, messages audio) sont fixés librement par chaque créatrice, dans la limite des plafonds définis par Honeymoon (jusqu'à 20€ pour une photo, 50€ pour une vidéo ou un message audio).\n\nLe paiement s'effectue par virement bancaire selon les instructions fournies après la demande de déblocage. Le contenu est transmis une fois le paiement confirmé par l'équipe Honeymoon.\n\nRépartition des revenus : 60% du montant revient à la créatrice, 40% à Honeymoon au titre de la gestion de la plateforme.\n\nRemboursement : un remboursement peut être accordé uniquement en cas d'erreur technique avérée (contenu non reçu après paiement confirmé) ou de double paiement involontaire. Aucun remboursement n'est accordé après réception effective du contenu, sauf non-conformité manifeste avec la description publiée.\n\nPour toute demande de remboursement, contactez honeymoon-official@outlook.com en précisant la référence de commande.",
    rules: "Règles pour les visiteurs\n1. Réservé aux personnes de 18 ans ou plus.\n2. Respect obligatoire envers les créatrices dans les commentaires — aucune insulte, harcèlement ou grossièreté.\n3. Il est interdit de capturer, republier ou redistribuer le contenu des créatrices sans autorisation.\n4. Toute tentative de contact en dehors du cadre du site (pression, sollicitation insistante) est interdite et peut être signalée.\n\nRègles pour les créatrices\n1. Contenu autorisé : lingerie, tenue sexy, danse sensuelle, twerk, attitude aguicheuse. Aucune nudité n'est acceptée.\n2. Chaque créatrice doit avoir fourni une pièce d'identité valide avant toute publication.\n3. Toute photo ou vidéo publiée doit être la propriété de la créatrice — aucun contenu volé ou appartenant à un tiers.\n4. Le non-respect de ces règles peut entraîner la suspension immédiate du profil.\n\nCes règles s'ajoutent aux conditions générales d'utilisation et à la politique de confidentialité du site, disponibles dans ce même menu.",
  },
  en: {
    statement2257: "In accordance with applicable record-keeping requirements (18 U.S.C. § 2257 and related regulations), Honeymoon declares that every creator publishing content on this platform has provided, prior to publication, official identification proving she is at least 18 years old at the time the content was created, along with written consent to publish that content as part of the collaboration agreement signed with Honeymoon.\n\nThese documents are kept securely and confidentially by Honeymoon's administration, in accordance with applicable regulations, and may be produced to the relevant authorities upon lawful request.\n\nAnyone with reason to believe that content published on this site involves a minor is asked to report it immediately to honeymoon-official@outlook.com. The content in question will be removed immediately pending verification.\n\nCustodian of records for this platform: Prince Mickael Record — honeymoon-official@outlook.com",
    terms: "1. Purpose\nThese terms and conditions govern the use of the Honeymoon website, a platform connecting content creators with visitors and partner agencies.\n\n2. Access\nAccess to adult-restricted content is strictly limited to adults (18 years or older in their jurisdiction). Age verification is required before accessing any content.\n\n3. Content\nContent published by creators remains their property. Honeymoon acts as a technical and commercial intermediary. Any reproduction, screenshotting, or redistribution of content without authorization is strictly prohibited.\n\n4. Payments\nPurchases of exclusive content are processed according to the terms described in the site's pricing and refund policy.\n\n5. Conduct\nAny abusive, harassing, or threatening behaviour towards creators or the Honeymoon team results in immediate removal from the site.\n\n6. Liability\nHoneymoon makes every effort to ensure the compliance of published content but cannot be held liable for content published by third parties in breach of these terms.\n\n7. Changes\nThese terms may be updated at any time; the version in force is the one published on the site.\n\n8. Contact\nFor any questions: honeymoon-official@outlook.com",
    privacy: "Honeymoon only collects the data necessary for the site to function: creator profile information (stage name, country, bio), published content, comments left by visitors, contact details provided when requesting to unlock paid content (first name, contact method), and technical data related to age verification.\n\nThis data is stored securely via Firebase (Google). It is never sold to third parties. It may only be shared with relevant authorities where required by law.\n\nCreators may request the deletion of their profile and content at any time by contacting honeymoon-official@outlook.com. Visitors may request the deletion of their comments or contact information in the same way.\n\nThe site uses your browser's local storage (localStorage) for certain preferences (language, display name in comments) — this data stays on your device and is not transmitted to Honeymoon.\n\nFor any questions regarding your personal data: honeymoon-official@outlook.com",
    pricing: "Prices for exclusive content (photos, videos, audio messages) are freely set by each creator, within the caps defined by Honeymoon (up to €20 for a photo, €50 for a video or audio message).\n\nPayment is made by bank transfer according to the instructions provided after the unlock request. Content is delivered once payment has been confirmed by the Honeymoon team.\n\nRevenue split: 60% of the amount goes to the creator, 40% to Honeymoon for platform management.\n\nRefunds: a refund may only be granted in the event of a proven technical error (content not received after confirmed payment) or an accidental duplicate payment. No refund is granted after content has been received, except in cases of clear non-conformity with the published description.\n\nFor any refund request, contact honeymoon-official@outlook.com stating the order reference.",
    rules: "Rules for visitors\n1. Restricted to people aged 18 or older.\n2. Respect towards creators is mandatory in comments — no insults, harassment, or crude language.\n3. Capturing, reposting, or redistributing creators' content without authorization is prohibited.\n4. Any attempt to contact a creator outside the site (pressure, persistent solicitation) is prohibited and may be reported.\n\nRules for creators\n1. Allowed content: lingerie, sexy outfits, sensual dance, twerking, teasing attitude. No nudity is accepted.\n2. Every creator must provide a valid ID before publishing anything.\n3. Any photo or video published must be the creator's own property — no stolen or third-party content.\n4. Failure to follow these rules may result in immediate suspension of the profile.\n\nThese rules are in addition to the site's terms and conditions and privacy policy, available in this same menu.",
  },
  es: {
    statement2257: "De conformidad con los requisitos de conservación de registros aplicables (18 U.S.C. § 2257 y normativas relacionadas), Honeymoon declara que toda creadora que publique contenido en esta plataforma ha proporcionado previamente una identificación oficial que acredita que tiene al menos 18 años en el momento de la creación del contenido, así como su consentimiento por escrito para su publicación, en el marco del contrato de colaboración firmado con Honeymoon.\n\nEstos documentos se conservan de forma segura y confidencial por la administración de Honeymoon, conforme a la normativa vigente, y pueden presentarse a las autoridades competentes ante una solicitud legal.\n\nCualquier persona que tenga motivos para creer que un contenido publicado en este sitio involucra a un menor debe informarlo de inmediato a honeymoon-official@outlook.com. El contenido en cuestión será retirado de inmediato mientras se realiza la verificación.\n\nResponsable de la conservación de registros de esta plataforma: Prince Mickael Record — honeymoon-official@outlook.com",
    terms: "1. Objeto\nEstas condiciones generales regulan el uso del sitio Honeymoon, una plataforma que conecta a creadoras de contenido con visitantes y agencias asociadas.\n\n2. Acceso\nEl acceso al contenido reservado para adultos está estrictamente limitado a personas mayores de edad (18 años o más según su jurisdicción). Se requiere verificación de edad antes de acceder a cualquier contenido.\n\n3. Contenido\nEl contenido publicado por las creadoras sigue siendo de su propiedad. Honeymoon actúa como intermediario técnico y comercial. Queda estrictamente prohibida cualquier reproducción, captura de pantalla o redistribución del contenido sin autorización.\n\n4. Pagos\nLas compras de contenido exclusivo se procesan según las condiciones descritas en la política de precios y reembolsos del sitio.\n\n5. Comportamiento\nCualquier comportamiento abusivo, de acoso o amenazante hacia las creadoras o el equipo de Honeymoon conlleva la exclusión inmediata del sitio.\n\n6. Responsabilidad\nHoneymoon hace todo lo posible para garantizar el cumplimiento del contenido publicado, pero no puede ser considerado responsable de los contenidos publicados por terceros que infrinjan estas condiciones.\n\n7. Modificaciones\nEstas condiciones pueden actualizarse en cualquier momento; la versión vigente es la publicada en el sitio.\n\n8. Contacto\nPara cualquier pregunta: honeymoon-official@outlook.com",
    privacy: "Honeymoon solo recopila los datos necesarios para el funcionamiento del sitio: información del perfil de las creadoras (nombre artístico, país, biografía), contenido publicado, comentarios dejados por los visitantes, datos de contacto proporcionados al solicitar el desbloqueo de contenido de pago (nombre, medio de contacto) y datos técnicos relacionados con la verificación de edad.\n\nEstos datos se almacenan de forma segura a través de Firebase (Google). Nunca se venden a terceros. Solo pueden compartirse con las autoridades competentes cuando la ley lo exija.\n\nLas creadoras pueden solicitar la eliminación de su perfil y contenido en cualquier momento contactando a honeymoon-official@outlook.com. Los visitantes pueden solicitar la eliminación de sus comentarios o datos de contacto de la misma manera.\n\nEl sitio utiliza el almacenamiento local de tu navegador (localStorage) para ciertas preferencias (idioma, nombre mostrado en los comentarios) — estos datos permanecen en tu dispositivo y no se transmiten a Honeymoon.\n\nPara cualquier pregunta sobre tus datos personales: honeymoon-official@outlook.com",
    pricing: "Los precios del contenido exclusivo (fotos, videos, mensajes de audio) los fija libremente cada creadora, dentro de los límites definidos por Honeymoon (hasta 20€ por una foto, 50€ por un video o mensaje de audio).\n\nEl pago se realiza mediante transferencia bancaria según las instrucciones proporcionadas tras la solicitud de desbloqueo. El contenido se entrega una vez que el equipo de Honeymoon confirma el pago.\n\nReparto de ingresos: el 60% del importe corresponde a la creadora, el 40% a Honeymoon por la gestión de la plataforma.\n\nReembolsos: solo se concede un reembolso en caso de error técnico comprobado (contenido no recibido tras el pago confirmado) o de un pago duplicado accidental. No se concede ningún reembolso tras la recepción efectiva del contenido, salvo incumplimiento manifiesto de la descripción publicada.\n\nPara cualquier solicitud de reembolso, contacta con honeymoon-official@outlook.com indicando la referencia del pedido.",
    rules: "Reglas para los visitantes\n1. Reservado a personas de 18 años o más.\n2. Es obligatorio el respeto hacia las creadoras en los comentarios — sin insultos, acoso ni groserías.\n3. Está prohibido capturar, republicar o redistribuir el contenido de las creadoras sin autorización.\n4. Cualquier intento de contacto fuera del sitio (presión, solicitud insistente) está prohibido y puede ser denunciado.\n\nReglas para las creadoras\n1. Contenido permitido: lencería, ropa sexy, baile sensual, twerking, actitud provocadora. No se acepta ningún tipo de desnudez.\n2. Cada creadora debe haber proporcionado una identificación válida antes de publicar.\n3. Toda foto o video publicado debe ser propiedad de la creadora — ningún contenido robado o de terceros.\n4. El incumplimiento de estas reglas puede provocar la suspensión inmediata del perfil.\n\nEstas reglas se suman a los términos y condiciones y a la política de privacidad del sitio, disponibles en este mismo menú.",
  },
  it: {
    statement2257: "In conformità con i requisiti applicabili in materia di conservazione dei documenti (18 U.S.C. § 2257 e normative correlate), Honeymoon dichiara che ogni creatrice che pubblica contenuti su questa piattaforma ha fornito preventivamente un documento d'identità ufficiale che attesta di avere almeno 18 anni al momento della creazione del contenuto, oltre al consenso scritto alla pubblicazione nell'ambito del contratto di collaborazione firmato con Honeymoon.\n\nQuesti documenti sono conservati in modo sicuro e riservato dall'amministrazione di Honeymoon, in conformità con la normativa vigente, e possono essere presentati alle autorità competenti su richiesta legale.\n\nChiunque abbia motivo di ritenere che un contenuto pubblicato su questo sito coinvolga un minore è invitato a segnalarlo immediatamente a honeymoon-official@outlook.com. Il contenuto in questione sarà rimosso immediatamente in attesa di verifica.\n\nResponsabile della conservazione dei documenti per questa piattaforma: Prince Mickael Record — honeymoon-official@outlook.com",
    terms: "1. Oggetto\nLe presenti condizioni generali disciplinano l'uso del sito Honeymoon, una piattaforma che mette in contatto creatrici di contenuti con visitatori e agenzie partner.\n\n2. Accesso\nL'accesso ai contenuti riservati agli adulti è strettamente limitato alle persone maggiorenni (18 anni o più nella propria giurisdizione). È richiesta la verifica dell'età prima di accedere a qualsiasi contenuto.\n\n3. Contenuto\nIl contenuto pubblicato dalle creatrici resta di loro proprietà. Honeymoon agisce come intermediario tecnico e commerciale. È severamente vietata qualsiasi riproduzione, cattura di schermo o ridistribuzione del contenuto senza autorizzazione.\n\n4. Pagamenti\nGli acquisti di contenuti esclusivi vengono elaborati secondo le modalità descritte nella politica dei prezzi e dei rimborsi del sito.\n\n5. Comportamento\nQualsiasi comportamento abusivo, molesto o minaccioso nei confronti delle creatrici o del team Honeymoon comporta l'immediata esclusione dal sito.\n\n6. Responsabilità\nHoneymoon si impegna a garantire la conformità dei contenuti pubblicati, ma non può essere ritenuta responsabile dei contenuti pubblicati da terzi in violazione delle presenti condizioni.\n\n7. Modifiche\nLe presenti condizioni possono essere aggiornate in qualsiasi momento; la versione in vigore è quella pubblicata sul sito.\n\n8. Contatto\nPer qualsiasi domanda: honeymoon-official@outlook.com",
    privacy: "Honeymoon raccoglie solo i dati necessari al funzionamento del sito: informazioni del profilo delle creatrici (nome d'arte, paese, biografia), contenuti pubblicati, commenti lasciati dai visitatori, dati di contatto forniti in occasione di una richiesta di sblocco di contenuti a pagamento (nome, mezzo di contatto) e dati tecnici relativi alla verifica dell'età.\n\nQuesti dati sono conservati in modo sicuro tramite Firebase (Google). Non vengono mai venduti a terzi. Possono essere condivisi con le autorità competenti solo nell'ambito di un obbligo legale.\n\nLe creatrici possono richiedere la cancellazione del proprio profilo e dei propri contenuti in qualsiasi momento contattando honeymoon-official@outlook.com. I visitatori possono richiedere la cancellazione dei propri commenti o dati di contatto allo stesso modo.\n\nIl sito utilizza l'archiviazione locale del browser (localStorage) per alcune preferenze (lingua, nome visualizzato nei commenti) — questi dati restano sul tuo dispositivo e non vengono trasmessi a Honeymoon.\n\nPer qualsiasi domanda relativa ai tuoi dati personali: honeymoon-official@outlook.com",
    pricing: "I prezzi dei contenuti esclusivi (foto, video, messaggi audio) sono stabiliti liberamente da ciascuna creatrice, entro i limiti definiti da Honeymoon (fino a 20€ per una foto, 50€ per un video o un messaggio audio).\n\nIl pagamento avviene tramite bonifico bancario secondo le istruzioni fornite dopo la richiesta di sblocco. Il contenuto viene consegnato una volta confermato il pagamento dal team Honeymoon.\n\nRipartizione dei ricavi: il 60% dell'importo va alla creatrice, il 40% a Honeymoon per la gestione della piattaforma.\n\nRimborsi: un rimborso può essere concesso solo in caso di errore tecnico comprovato (contenuto non ricevuto dopo pagamento confermato) o di pagamento duplicato accidentale. Nessun rimborso viene concesso dopo l'effettiva ricezione del contenuto, salvo evidente non conformità con la descrizione pubblicata.\n\nPer qualsiasi richiesta di rimborso, contatta honeymoon-official@outlook.com indicando il riferimento dell'ordine.",
    rules: "Regole per i visitatori\n1. Riservato a persone di almeno 18 anni.\n2. Il rispetto verso le creatrici è obbligatorio nei commenti — niente insulti, molestie o volgarità.\n3. È vietato catturare, ripubblicare o ridistribuire i contenuti delle creatrici senza autorizzazione.\n4. Qualsiasi tentativo di contatto al di fuori del sito (pressione, richieste insistenti) è vietato e può essere segnalato.\n\nRegole per le creatrici\n1. Contenuto consentito: lingerie, abiti sexy, danza sensuale, twerking, atteggiamento provocante. Nessuna nudità è accettata.\n2. Ogni creatrice deve aver fornito un documento d'identità valido prima di pubblicare.\n3. Ogni foto o video pubblicato deve essere di proprietà della creatrice — nessun contenuto rubato o di terzi.\n4. Il mancato rispetto di queste regole può comportare la sospensione immediata del profilo.\n\nQueste regole si aggiungono ai termini e condizioni e all'informativa sulla privacy del sito, disponibili in questo stesso menu.",
  },
};

const CURRENCIES = [
  {code:'EUR',symbol:'€',name:'Euro'},{code:'USD',symbol:'$',name:'US Dollar'},
  {code:'GBP',symbol:'£',name:'British Pound'},{code:'CHF',symbol:'CHF',name:'Swiss Franc'},
  {code:'CAD',symbol:'CA$',name:'Canadian Dollar'},{code:'XOF',symbol:'CFA',name:'Franc CFA (BCEAO)'},
  {code:'XAF',symbol:'FCFA',name:'Franc CFA (BEAC)'},{code:'MAD',symbol:'DH',name:'Moroccan Dirham'},
  {code:'DZD',symbol:'DA',name:'Algerian Dinar'},{code:'TND',symbol:'DT',name:'Tunisian Dinar'},
  {code:'NGN',symbol:'₦',name:'Nigerian Naira'},{code:'ZAR',symbol:'R',name:'South African Rand'},
  {code:'KES',symbol:'KSh',name:'Kenyan Shilling'},{code:'GHS',symbol:'GH₵',name:'Ghanaian Cedi'},
  {code:'EGP',symbol:'E£',name:'Egyptian Pound'},{code:'CDF',symbol:'FC',name:'Congolese Franc'},
  {code:'AED',symbol:'AED',name:'UAE Dirham'},{code:'SAR',symbol:'SAR',name:'Saudi Riyal'},
  {code:'TRY',symbol:'₺',name:'Turkish Lira'},{code:'RUB',symbol:'₽',name:'Russian Ruble'},
  {code:'CNY',symbol:'¥',name:'Chinese Yuan'},{code:'JPY',symbol:'¥',name:'Japanese Yen'},
  {code:'INR',symbol:'₹',name:'Indian Rupee'},{code:'BRL',symbol:'R$',name:'Brazilian Real'},
  {code:'MXN',symbol:'MX$',name:'Mexican Peso'},{code:'AUD',symbol:'A$',name:'Australian Dollar'},
  {code:'NZD',symbol:'NZ$',name:'New Zealand Dollar'},{code:'SEK',symbol:'kr',name:'Swedish Krona'},
  {code:'NOK',symbol:'kr',name:'Norwegian Krone'},{code:'DKK',symbol:'kr',name:'Danish Krone'},
  {code:'PLN',symbol:'zł',name:'Polish Złoty'},{code:'THB',symbol:'฿',name:'Thai Baht'},
  {code:'PHP',symbol:'₱',name:'Philippine Peso'},{code:'IDR',symbol:'Rp',name:'Indonesian Rupiah'},
  {code:'KRW',symbol:'₩',name:'South Korean Won'},{code:'SGD',symbol:'S$',name:'Singapore Dollar'}
];
function getMyCurrency(creatorId){
  return localStorage.getItem('hm_currency_' + creatorId) || 'EUR';
}
function currencySymbol(code){
  const c = CURRENCIES.find(x => x.code === code);
  return c ? c.symbol : code;
}

const ADVICE_TOPICS = [
  { icon:AICON.light, title:{fr:"Bien utiliser la lumière naturelle", en:"Using natural light well", es:"Usar bien la luz natural", it:"Usare bene la luce naturale", pt:"Usar bem a luz natural", sw:"Kutumia vizuri mwanga wa asili", zu:"Ukusebenzisa ukukhanya kwemvelo kahle", st:"Ho sebedisa leseli la tlhaho hantle", ln:"Kosalela pole ya bomoto malamu", kg:"Kusadila pole ya kimenga malamu"},
    answer:{fr:"La lumière douce du matin ou de fin de journée (golden hour) est la plus flatteuse. Place-toi face à une fenêtre plutôt que dos à elle pour éviter les ombres dures sur le visage.", en:"Soft morning or late-afternoon light (golden hour) is the most flattering. Face a window rather than having it behind you to avoid harsh shadows on your face.", es:"La luz suave de la mañana o del atardecer (hora dorada) es la más favorecedora. Ponte de cara a una ventana en vez de darle la espalda para evitar sombras duras en el rostro.", it:"La luce morbida del mattino o del tardo pomeriggio (ora dorata) è la più favorevole. Mettiti di fronte a una finestra invece che di spalle per evitare ombre dure sul viso.", pt:"A luz suave da manhã ou do fim de tarde (hora dourada) é a mais favorável. Fica de frente para uma janela em vez de lhe dares as costas para evitar sombras duras no rosto.", sw:"Mwanga laini wa asubuhi au jioni (saa ya dhahabu) ndio bora zaidi. Simama ukiielekea dirisha badala ya kulipa mgongo ili kuepuka vivuli vikali usoni.", zu:"Ukukhanya okuthambile kwasekuseni noma kusihlwa (i-golden hour) yikhona okuhle kakhulu. Bheka ifasitela hhayi ukuhlehla kulo ukugwema imithunzi eqinile ebusweni.", st:"Leseli le bonolo la mahareng a hoseng kapa a mantsiboea (golden hour) ke lona le sebetsang hantle ho feta. Ema o shebane le fensetere ho fapana le ho e furalla ho qoba meriti e thata sefahlehong.", ln:"Pole ya boboto ya ntongo to ya pokwa (golden hour) ezali kitoko mingi. Telema liboso ya lininisa na esika ya kopesa yango mokongo mpo na kokima molili makasi na elongi.", kg:"Pole ya boboto ya ntangu ya nkokila to ya masika (golden hour) yina kele ya mbote mingi. Telama na ntwala ya jendele na kisika ya kupesa yandi mongongo mpo na kubuya midindu ya ngolo na luse."} },
  { icon:AICON.angle, title:{fr:"Trouver son meilleur angle", en:"Finding your best angle", es:"Encontrar tu mejor ángulo", it:"Trovare il proprio angolo migliore", pt:"Encontrar o teu melhor ângulo", sw:"Kupata pembe yako bora", zu:"Ukuthola i-engeli yakho engcono kakhulu", st:"Ho fumana engele ea hao e molemo ka ho fetisisa", ln:"Koluka angle na yo ya malamu koleka", kg:"Kubaka angle na nge ya mbote mingi"},
    answer:{fr:"Prends l'appareil légèrement au-dessus du niveau des yeux plutôt qu'en dessous — ça allonge la silhouette. Teste plusieurs angles avant une séance et note ceux qui te plaisent le plus.", en:"Hold the camera slightly above eye level rather than below — it elongates the silhouette. Test a few angles before a shoot and note which ones you like best.", es:"Sostén la cámara ligeramente por encima del nivel de los ojos en vez de por debajo — alarga la silueta. Prueba varios ángulos antes de una sesión y anota los que más te gusten.", it:"Tieni la fotocamera leggermente sopra il livello degli occhi invece che sotto — allunga la silhouette. Prova diversi angoli prima di uno shooting e annota quelli che ti piacciono di più.", pt:"Segura a câmara ligeiramente acima do nível dos olhos em vez de abaixo — alonga a silhueta. Testa vários ângulos antes de uma sessão e anota os que mais gostas.", sw:"Shika kamera juu kidogo ya usawa wa macho badala ya chini — hii inarefusha umbo. Jaribu pembe kadhaa kabla ya kikao na andika unazopenda zaidi.", zu:"Bamba ikhamera phezulu kancane kunebala lamehlo hhayi ngezansi — lokhu kwelula isimo somzimba. Zama ama-engeli amaningi ngaphambi kwesikhathi sokuthwebula bese ubhala lawo owathandayo.", st:"Tshoara khamera hodimo hanyane ho feta boemo ba mahlo ho fapana le ka tlase — sena se lelefatsa setshwantsho. Leka diengele tse ngata pele ho nako ea ho nka setshwantsho mme o ngole tseo o li ratang.", ln:"Simba kamera likolo mwa moke koleka niveau ya miso na esika ya na nse — yango ekolisaka nzoto. Meka ba angle mingi liboso ya seance mpe koma oyo olingi mingi.", kg:"Simba kamera na zulu mwa fioti ya niveau ya meso na kisika ya na nsi — yayi kelefusaka nitu. Meka ba angle mingi na ntwala ya seance ye soneka yina nge kezolaka mingi."} },
  { icon:AICON.frame, title:{fr:"Composer une bonne photo", en:"Composing a good photo", es:"Componer una buena foto", it:"Comporre una buona foto", pt:"Compor uma boa foto", sw:"Kupanga picha nzuri", zu:"Ukwakha isithombe esihle", st:"Ho theha setshwantsho se setle", ln:"Kosala composition ya kitoko", kg:"Kusala composition ya mbote"},
    answer:{fr:"Utilise la règle des tiers : imagine une grille 3x3 et place le sujet principal sur une des lignes, pas au centre. Ça rend la photo plus dynamique.", en:"Use the rule of thirds: imagine a 3x3 grid and place the main subject on one of the lines, not dead center. It makes the photo more dynamic.", es:"Usa la regla de los tercios: imagina una cuadrícula 3x3 y coloca el sujeto principal en una de las líneas, no en el centro. Hace la foto más dinámica.", it:"Usa la regola dei terzi: immagina una griglia 3x3 e posiziona il soggetto principale su una delle linee, non al centro. Rende la foto più dinamica.", pt:"Usa a regra dos terços: imagina uma grelha 3x3 e coloca o sujeito principal numa das linhas, não no centro. Torna a foto mais dinâmica.", sw:"Tumia kanuni ya thuluthi: fikiria gridi ya 3x3 na weka kiini kikuu kwenye moja ya mistari, si katikati. Hii inafanya picha iwe na mchezo zaidi.", zu:"Sebenzisa umthetho wezingxenye ezintathu: cabanga i-grid ye-3x3 futhi ubeke into eyinhloko kolunye lwemigqa, hhayi phakathi. Lokhu kwenza isithombe sibe nomdlandla omkhulu.", st:"Sebedisa molao oa dikarolo tse tharo: nahana ka grid ea 3x3 mme o behe ntho e ka sehloohong moleng o le mong, eseng bohareng. Sena se etsa hore setshwantsho se be le matla a mangata.", ln:"Sala mobeko ya ba tiers misato: kanisa grille 3x3 mpe tia eloko ya monene na moko ya milongo, na kati te. Yango ekomisaka foto kitoko mingi.", kg:"Sadila mbeko ya ba tiers tatu: banza grille 3x3 ye tula kima ya nene na mosi ya balungu, na kati ve. Yayi kesalaka nde foto kele na kikesa mingi."} },
  { icon:AICON.palette, title:{fr:"Choisir une palette de couleurs", en:"Choosing a color palette", es:"Elegir una paleta de colores", it:"Scegliere una palette di colori", pt:"Escolher uma paleta de cores", sw:"Kuchagua rangi zinazolingana", zu:"Ukukhetha imibala", st:"Ho kgetha mebala e tshwanang", ln:"Kopona ba couleur", kg:"Kusola bakuma"},
    answer:{fr:"Garde 2-3 couleurs dominantes par shooting (tenue, décor, filtre). Une palette cohérente rend ton feed plus reconnaissable et professionnel.", en:"Stick to 2-3 dominant colors per shoot (outfit, background, filter). A consistent palette makes your feed more recognizable and professional.", es:"Mantén 2-3 colores dominantes por sesión (ropa, fondo, filtro). Una paleta coherente hace tu feed más reconocible y profesional.", it:"Mantieni 2-3 colori dominanti per shooting (outfit, sfondo, filtro). Una palette coerente rende il tuo feed più riconoscibile e professionale.", pt:"Mantém 2-3 cores dominantes por sessão (roupa, fundo, filtro). Uma paleta coerente torna o teu feed mais reconhecível e profissional.", sw:"Weka rangi 2-3 kuu kwa kila kikao (nguo, mandhari, kichujio). Rangi zinazolingana zinafanya ukurasa wako utambulike na kuonekana kitaalamu.", zu:"Gcina imibala emi-2-3 ephethe isikhathi sonke sokuthwebula (izingubo, isizinda, isihlungi). Imibala evumelanayo yenza ikhasi lakho likwazi ukuhlonzwa futhi libe elobuchwepheshe.", st:"Boloka mebala e 2-3 e ka sehloohong nakong e nngwe le e nngwe ea ho nka setshwantsho (diaparo, semelo, sefihlela). Mebala e tshwanang e etsa hore leqephe la hao le tsejwe le be le boiphihlelo.", ln:"Batela ba couleur 2-3 ya monene na seance moko (bilamba, fond, filtre). Ba couleur oyo eyokani ekomisaka page na yo koyebana mpe professionnel.", kg:"Bumba bakuma 2-3 ya nene na seance mosi (bilele, fond, filtre). Bakuma yina ke ndimana kesalaka nde page na nge kezabana ye kele professionnel."} },
  { icon:AICON.device, title:{fr:"Stabiliser son téléphone", en:"Stabilizing your phone", es:"Estabilizar tu teléfono", it:"Stabilizzare il telefono", pt:"Estabilizar o telemóvel", sw:"Kutuliza simu yako", zu:"Ukuzinza ifoni yakho", st:"Ho tsitsisa mohala oa hao", ln:"Kokangisa telefone na yo", kg:"Kukangisa telefone na nge"},
    answer:{fr:"Un petit trépied ou même une pile de livres change tout : moins de flou de bougé, cadrage plus stable. Investis dans un trépied pas cher avec télécommande Bluetooth.", en:"A small tripod or even a stack of books changes everything: less motion blur, steadier framing. A cheap tripod with Bluetooth remote is a great investment.", es:"Un trípode pequeño o incluso una pila de libros cambia todo: menos desenfoque, encuadre más estable. Invierte en un trípode barato con control remoto Bluetooth.", it:"Un piccolo treppiede o anche una pila di libri cambia tutto: meno sfocatura da movimento, inquadratura più stabile. Investi in un treppiede economico con telecomando Bluetooth.", pt:"Um tripé pequeno ou até uma pilha de livros muda tudo: menos desfoque de movimento, enquadramento mais estável. Investe num tripé barato com controlo remoto Bluetooth.", sw:"Kishikilia kidogo au hata rundo la vitabu hubadilisha kila kitu: mtetemo mdogo, mchoro thabiti zaidi. Wekeza kwenye kishikilia cha bei nafuu chenye kidhibiti cha Bluetooth.", zu:"I-tripod encane noma ngisho isitaki sezincwadi kuguqula konke: ukudideka okuncane, isithombe esizinzile kakhudlwana. Tshala imali ku-tripod eshibhile ene-remote ye-Bluetooth.", st:"Tripod e nyane kapa esita le buka tse hlophisitsweng di fetola tsohle: ho sisinyeha ho fokolang, setshwantsho se tsitsitseng. Reka tripod e theko e tlase e nang le taolo ea Bluetooth.", ln:"Trepied ya moke to ata liboke ya babuku ebongolaka nyonso: koningana moke, cadrage ya kokangama. Sombá trepied ya ntalo moke na télécommande Bluetooth.", kg:"Trepied ya fioti to ata liboke ya mikanda kebongolaka mambu yonso: kuningana ya fioti, cadrage ya kukangama. Sumba trepied ya ntalu ya fioti na télécommande Bluetooth."} },
  { icon:AICON.film, title:{fr:"Filmer une vidéo fluide", en:"Filming smooth video", es:"Filmar un video fluido", it:"Filmare un video fluido", pt:"Filmar um vídeo fluido", sw:"Kupiga video laini", zu:"Ukuthwebula ividiyo ehambayo", st:"Ho nka video e phallang hantle", ln:"Kokanga video ya kotambola malamu", kg:"Kukanga video ya kutambula malamu"},
    answer:{fr:"Bouge lentement et de façon continue plutôt que par à-coups. Filme en 30fps minimum, et évite de zoomer numériquement — rapproche-toi plutôt physiquement.", en:"Move slowly and continuously rather than jerkily. Film at 30fps minimum, and avoid digital zoom — move physically closer instead.", es:"Muévete despacio y de forma continua en vez de a tirones. Filma a 30fps mínimo, y evita el zoom digital — acércate físicamente en su lugar.", it:"Muoviti lentamente e in modo continuo invece che a scatti. Filma almeno a 30fps, ed evita lo zoom digitale — avvicinati fisicamente.", pt:"Move-te devagar e de forma contínua em vez de aos solavancos. Filma a pelo menos 30fps, e evita o zoom digital — aproxima-te fisicamente.", sw:"Songa polepole na kwa mfululizo badala ya ghafla. Piga angalau 30fps, na epuka kukuza kidijitali — sogea karibu kimwili badala yake.", zu:"Nyakaza kancane futhi ngokuqhubekayo hhayi ngokuthintitha. Thwebula okungenani ku-30fps, futhi ugweme ukusondeza kwedijithali — sondela ngokoqobo.", st:"Sisinyeha butle mme ka mokgwa o tswellang, eseng ka mathata. Nka bonyane ka 30fps, mme o qobe ho hodisa ka dijithale — atamela haufi ka 'mele.", ln:"Ningana malembe mpe na boyokani na esika ya kokata-kata. Kanga na 30fps ya moke, mpe kima zoom ya numérique — pusana penepene na nzoto.", kg:"Ninga malembe ye na boyikani na kisika ya kukata-kata. Kanga na 30fps ya fioti, ye buya zoom ya numérique — fikama penepene na nitu."} },
  { icon:AICON.scissors, title:{fr:"Monter simplement une vidéo", en:"Simple video editing", es:"Editar un video de forma sencilla", it:"Montare semplicemente un video", pt:"Editar um vídeo de forma simples", sw:"Kuhariri video kwa urahisi", zu:"Ukuhlela ividiyo kalula", st:"Ho fetola video ka bonolo", ln:"Kobongisa video na pete", kg:"Kubongisa video na pete"},
    answer:{fr:"Des applis comme CapCut permettent de couper, ajouter de la musique et des transitions gratuitement. Garde les vidéos courtes en tête (15-30s) pour les réseaux.", en:"Apps like CapCut let you cut, add music and transitions for free. Keep short-form videos in mind (15-30s) for social platforms.", es:"Apps como CapCut permiten cortar, añadir música y transiciones gratis. Mantén los videos cortos (15-30s) para redes sociales.", it:"App come CapCut permettono di tagliare, aggiungere musica e transizioni gratuitamente. Tieni i video brevi (15-30s) per i social.", pt:"Apps como o CapCut permitem cortar, adicionar música e transições gratuitamente. Mantém os vídeos curtos (15-30s) para as redes sociais.", sw:"Programu kama CapCut zinaruhusu kukata, kuongeza muziki na mabadiliko bila malipo. Weka video fupi (sekunde 15-30) kwa mitandao ya kijamii.", zu:"Ama-app afana ne-CapCut avumela ukusika, ukwengeza umculo namashintsho mahhala. Gcina amavidiyo emafushane (imizuzwana engu-15-30) kumamediya enhlalo.", st:"Diapp tse kang CapCut di dumella ho seha, ho kenya mmino le diphetoho mahala. Boloka divideo tse khutshwane (metsotswana e 15-30) bakeng sa mecha ea kopano.", ln:"Ba application lokola CapCut epesaka nzela ya kokata, kobakisa miziki na batransition ofele. Batela ba video mikuse (segondes 15-30) mpo na ba réseaux.", kg:"Ba application bonso CapCut kepesaka nzila ya kukata, kubakisa miziki ye batransition ofele. Bumba ba video ya nkufi (segondes 15-30) mpo na ba réseaux."} },
  { icon:AICON.music, title:{fr:"Choisir la bonne musique", en:"Choosing the right music", es:"Elegir la música adecuada", it:"Scegliere la musica giusta", pt:"Escolher a música certa", sw:"Kuchagua muziki sahihi", zu:"Ukukhetha umculo ofanele", st:"Ho kgetha mmino o nepahetseng", ln:"Kopona miziki ya malamu", kg:"Kusola miziki ya mbote"},
    answer:{fr:"Une musique tendance au bon rythme augmente énormément la portée sur TikTok/Reels. Vérifie les sons \"trending\" dans l'appli avant de filmer une danse.", en:"A trending song with the right rhythm massively boosts reach on TikTok/Reels. Check the \"trending\" sounds in the app before filming a dance.", es:"Una canción de tendencia con el ritmo correcto aumenta muchísimo el alcance en TikTok/Reels. Revisa los sonidos \"trending\" en la app antes de filmar un baile.", it:"Una musica di tendenza con il ritmo giusto aumenta enormemente la portata su TikTok/Reels. Controlla i suoni \"di tendenza\" nell'app prima di filmare un ballo.", pt:"Uma música em tendência com o ritmo certo aumenta muito o alcance no TikTok/Reels. Verifica os sons \"em tendência\" na app antes de filmares uma dança.", sw:"Muziki maarufu wenye mdundo sahihi huongeza sana ufikiaji kwenye TikTok/Reels. Angalia sauti \"zinazovuma\" kwenye programu kabla ya kupiga dansi.", zu:"Umculo othandwayo one-rhythm efanele wandisa kakhulu ukufinyelela ku-TikTok/Reels. Hlola imisindo \"ethandwayo\" ku-app ngaphambi kokuthwebula umdanso.", st:"Mmino o tsebahalang o nang le rhythm e nepahetseng o eketsa haholo ho fihlella ho TikTok/Reels. Sheba melodi e \"tsebahalang\" ho app pele o nka video ea tantshi.", ln:"Miziki oyo ezali na lokito mpe na rythme ya malamu ebakisaka mingi bomoni na TikTok/Reels. Tala ba son oyo ezali \"trending\" na application liboso ya kokanga dance.", kg:"Miziki yina kele na lokito ye na rythme ya mbote kebakisaka mingi bumoni na TikTok/Reels. Tala ba son yina kele \"trending\" na application na ntwala ya kukanga dance."} },
  { icon:AICON.dance, title:{fr:"Bien danser devant la caméra", en:"Dancing well on camera", es:"Bailar bien frente a la cámara", it:"Ballare bene davanti alla telecamera", pt:"Dançar bem em frente à câmara", sw:"Kucheza vizuri mbele ya kamera", zu:"Ukudansa kahle phambi kwekhamera", st:"Ho bina hantle kapele ho khamera", ln:"Kobina malamu liboso ya kamera", kg:"Kubina mbote na ntwala ya kamera"},
    answer:{fr:"Répète le mouvement plusieurs fois sans filmer d'abord pour le rendre naturel. Regarde parfois la caméra, parfois ailleurs — ça donne un rendu plus authentique qu'un regard fixe.", en:"Rehearse the move a few times without filming first so it feels natural. Look at the camera sometimes, away other times — it feels more authentic than a constant stare.", es:"Ensaya el movimiento varias veces sin grabar primero para que se vea natural. Mira a la cámara a veces, y a otro lado otras — se ve más auténtico que una mirada fija.", it:"Ripeti il movimento più volte senza filmare prima, per renderlo naturale. Guarda a volte la telecamera, a volte altrove — dà un risultato più autentico di uno sguardo fisso.", pt:"Ensaia o movimento várias vezes sem filmar primeiro para que fique natural. Olha por vezes para a câmara, por vezes para outro lado — dá um resultado mais autêntico do que um olhar fixo.", sw:"Rudia mwendo mara kadhaa bila kupiga picha kwanza ili uonekane wa asili. Angalia kamera wakati mwingine, mahali pengine wakati mwingine — inaonekana halisi zaidi kuliko kutazama moja kwa moja.", zu:"Phinda umnyakazo izikhathi eziningi ngaphandle kokuthwebula kuqala ukuze ubukeke ojwayelekile. Bheka ikhamera ngezinye izikhathi, kwenye indawo ngezinye — kubukeka kuyiqiniso kunokugqolozela njalo.", st:"Pheta motsamao makgetlo a mangata pele o nka video pele hore e bonahale e le tlhaho. Sheba khamera ka nako e nngwe, kae kae ka nako e nngwe — sena se bonahala e le sebele ho feta ho shebella feela.", ln:"Zongela mouvement mbala mingi liboso ya kokanga mpo emonana ya solo. Tala kamera ntango mosusu, esika mosusu ntango mosusu — emonanaka ya solo koleka kotala kaka moko.", kg:"Vutuka mouvement mbala mingi na ntwala ya kukanga mpo yamonana ya kieleka. Tala kamera ntangu ya nkaka, kisika ya nkaka ntangu ya nkaka — yamonanaka ya kieleka kuluta kutala kaka mosi."} },
  { icon:AICON.stamp, title:{fr:"Ajouter un filigrane (watermark)", en:"Adding a watermark", es:"Añadir una marca de agua", it:"Aggiungere una filigrana", pt:"Adicionar uma marca de água", sw:"Kuongeza alama ya maji", zu:"Ukwengeza uphawu lwamanzi", st:"Ho kenya letshwao la metsi", ln:"Kobakisa filigrane", kg:"Kubakisa filigrane"},
    answer:{fr:"Ajoute ton nom ou logo en petit et discret sur tes photos/vidéos pour limiter le vol de contenu. Des applis comme Watermark gratuites suffisent.", en:"Add your name or logo small and discreet on your photos/videos to limit content theft. Free apps like Watermark are enough.", es:"Añade tu nombre o logo pequeño y discreto en tus fotos/videos para limitar el robo de contenido. Apps gratuitas como Watermark son suficientes.", it:"Aggiungi il tuo nome o logo piccolo e discreto sulle tue foto/video per limitare il furto di contenuti. App gratuite come Watermark bastano.", pt:"Adiciona o teu nome ou logótipo pequeno e discreto nas tuas fotos/vídeos para limitar o roubo de conteúdo. Apps gratuitas como Watermark são suficientes.", sw:"Ongeza jina lako au nembo kwa udogo na kwa siri kwenye picha/video zako kupunguza wizi wa maudhui. Programu za bure kama Watermark zinatosha.", zu:"Engeza igama lakho noma uphawu ngobuncane futhi ngokungagqami ezithombeni/emavidiyweni akho ukunciphisa ukwebiwa kokuqukethwe. Ama-app mahhala afana ne-Watermark ayanele.", st:"Kenya lebitso la hao kapa logo e nyane le e sa hlaheleng dintlheng tsa hao/divideo ho fokotsa bosholu ba diteng. Diapp tsa mahala tse kang Watermark di lekana.", ln:"Bakisa nkombo na yo to logo na bonene ya moke na ba foto/ba video na yo mpo na kokitisa moyibi ya bikuma. Ba application ofele lokola Watermark ekoki.", kg:"Bakisa nkumbu na nge to logo na bunene ya fioti na ba foto/ba video na nge mpo na kukitisa buivi ya bima. Ba application ofele bonso Watermark kelenda."} },
  { icon:AICON.calendar, title:{fr:"Créer un calendrier de publication", en:"Creating a posting calendar", es:"Crear un calendario de publicación", it:"Creare un calendario di pubblicazione", pt:"Criar um calendário de publicação", sw:"Kuunda ratiba ya kuchapisha", zu:"Ukwakha ikhalenda yokushicilela", st:"Ho theha khalentara ea ho hatisa", ln:"Kosala calendrier ya kobimisa", kg:"Kusala calendrier ya kubasisa"},
    answer:{fr:"Publie à heures régulières (ex. 19h-21h quand ton audience est connectée). La régularité compte plus que la fréquence pour fidéliser.", en:"Post at consistent times (e.g. 7-9pm when your audience is online). Consistency matters more than frequency for building loyalty.", es:"Publica a horas regulares (ej. 19h-21h cuando tu audiencia está conectada). La constancia importa más que la frecuencia para fidelizar.", it:"Pubblica a orari regolari (es. 19-21 quando il tuo pubblico è connesso). La regolarità conta più della frequenza per fidelizzare.", pt:"Publica em horários regulares (ex. 19h-21h quando a tua audiência está online). A regularidade conta mais do que a frequência para fidelizar.", sw:"Chapisha kwa saa za kawaida (mfano saa 7-9 jioni wafuasi wako wapo mtandaoni). Uthabiti ni muhimu zaidi ya mara ngapi kwa uaminifu.", zu:"Shicilela ngezikhathi ezijwayelekile (isb. 19h-21h lapho abalandeli bakho bexhunywe). Ukuqhubeka kubaluleke kakhulu kunokuvamile ekuthembekeni.", st:"Hatisa ka dihora tse tshwanang (mohlala 19h-21h ha balateli ba hao ba le inthaneteng). Ho tswella ho bohlokwa ho feta makgetlo bakeng sa botshepehi.", ln:"Bimisa na ba heure ya mbala na mbala (ndakisa 19h-21h ntango bayekoli na yo bazali na ligne). Kozala ya mbala na mbala eleki motango ya mbala mpo na kobatela bango.", kg:"Basisa na ba heure ya mbala na mbala (mbandu 19h-21h ntangu bayekoli na nge kele na ligne). Kuvanda ya mbala na mbala keluta motango ya mbala mpo na kubumba bo."} },
  { icon:AICON.hashtag, title:{fr:"Utiliser les bons hashtags", en:"Using the right hashtags", es:"Usar los hashtags correctos", it:"Usare gli hashtag giusti", pt:"Usar as hashtags certas", sw:"Kutumia hashtag sahihi", zu:"Ukusebenzisa ama-hashtag afanele", st:"Ho sebedisa dihashtag tse nepahetseng", ln:"Kosalela ba hashtag ya malamu", kg:"Kusadila ba hashtag ya mbote"},
    answer:{fr:"Mélange des hashtags larges (beaucoup de portée) et des hashtags de niche (moins de concurrence). 5 à 10 hashtags pertinents suffisent, inutile d'en mettre 30.", en:"Mix broad hashtags (wide reach) with niche ones (less competition). 5 to 10 relevant hashtags are enough — no need for 30.", es:"Mezcla hashtags amplios (más alcance) con hashtags de nicho (menos competencia). Con 5 a 10 hashtags relevantes basta, no hace falta poner 30.", it:"Mescola hashtag ampi (più portata) con hashtag di nicchia (meno concorrenza). 5-10 hashtag pertinenti bastano, non serve metterne 30.", pt:"Mistura hashtags amplas (mais alcance) com hashtags de nicho (menos concorrência). 5 a 10 hashtags relevantes bastam, não é preciso colocar 30.", sw:"Changanya hashtag pana (ufikiaji zaidi) na hashtag maalum (ushindani mdogo). Hashtag 5 hadi 10 zinazofaa zinatosha, hakuna haja ya kuweka 30.", zu:"Xuba ama-hashtag abanzi (ukufinyelela okwengeziwe) nama-hashtag ancane (ukuncintisana okuncane). Ama-hashtag angu-5 kuya kwangu-10 afanele ayanele, akudingeki ubeke angu-30.", st:"Kopanya dihashtag tse pharaletseng (ho fihlella ho hoholo) le dihashtag tse itseng (tlholisano e tlase). Dihashtag tse 5 ho isa ho tse 10 tse amanang di lekane, ha ho hlokahale ho kenya tse 30.", ln:"Sangisa ba hashtag ya monene (bomoni mingi) na ba hashtag ya niche (concurrence moke). Ba hashtag 5 kino 10 oyo ekoki ezali malamu, esengeli te kotia 30.", kg:"Sangisa ba hashtag ya nene (bumoni mingi) na ba hashtag ya niche (concurrence ya fioti). Ba hashtag 5 kino 10 yina kelenda kele mbote, kelombama ve kutia 30."} },
  { icon:AICON.chat, title:{fr:"Faire grandir sa communauté", en:"Growing your community", es:"Hacer crecer tu comunidad", it:"Far crescere la propria community", pt:"Fazer crescer a tua comunidade", sw:"Kukuza jumuiya yako", zu:"Ukukhulisa umphakathi wakho", st:"Ho hodisa sechaba sa hao", ln:"Kokolisa lisanga na yo", kg:"Kukolisa dibundu na nge"},
    answer:{fr:"Réponds aux commentaires dans la première heure après publication — ça booste l'algorithme. Pose une question dans ta légende pour inciter aux réponses.", en:"Reply to comments within the first hour after posting — it boosts the algorithm. Ask a question in your caption to encourage replies.", es:"Responde a los comentarios en la primera hora tras publicar — impulsa el algoritmo. Haz una pregunta en tu descripción para incentivar respuestas.", it:"Rispondi ai commenti entro la prima ora dopo la pubblicazione — favorisce l'algoritmo. Fai una domanda nella didascalia per incoraggiare le risposte.", pt:"Responde aos comentários na primeira hora após a publicação — impulsiona o algoritmo. Faz uma pergunta na legenda para incentivar respostas.", sw:"Jibu maoni ndani ya saa ya kwanza baada ya kuchapisha — hii husaidia algoriti. Uliza swali kwenye maelezo ili kuhamasisha majibu.", zu:"Phendula amazwana ehora lokuqala ngemuva kokushicilela — lokhu kusiza i-algorithm. Buza umbuzo ku-caption ukukhuthaza izimpendulo.", st:"Araba maikutlo hora ea pele ka mora ho hatisa — sena se thusa algorithm. Botsa potso ho caption ho kgothaletsa dikarabo.", ln:"Yanola ba commentaire na heure ya liboso sima ya kobimisa — yango esungaka algorithme. Tuna motuna na légende mpo na kolendisa biyano.", kg:"Vutula ba commentaire na heure ya ntete na nima ya kubasisa — yayi kesadisaka algorithme. Yula ntuba na légende mpo na kulendisa biyano."} },
  { icon:AICON.refresh, title:{fr:"Recycler son contenu", en:"Repurposing your content", es:"Reciclar tu contenido", it:"Riciclare i propri contenuti", pt:"Reciclar o teu conteúdo", sw:"Kutumia tena maudhui yako", zu:"Ukusetshenziswa kabusha kokuqukethwe kwakho", st:"Ho sebedisa diteng tsa hao hape", ln:"Kosalela lisusu bikuma na yo", kg:"Kusadila diaka bima na nge"},
    answer:{fr:"Une même séance photo peut donner 10-15 posts différents étalés sur plusieurs semaines. Pas besoin de nouveau contenu tous les jours.", en:"A single photo shoot can give you 10-15 different posts spread over several weeks. You don't need new content every day.", es:"Una misma sesión de fotos puede dar 10-15 publicaciones diferentes repartidas en varias semanas. No necesitas contenido nuevo cada día.", it:"Un solo shooting fotografico può dare 10-15 post diversi distribuiti su più settimane. Non serve nuovo contenuto ogni giorno.", pt:"Uma mesma sessão fotográfica pode dar 10-15 publicações diferentes espalhadas por várias semanas. Não precisas de conteúdo novo todos os dias.", sw:"Kikao kimoja cha picha kinaweza kutoa machapisho 10-15 tofauti yaliyosambazwa kwa wiki kadhaa. Hauhitaji maudhui mapya kila siku.", zu:"Isikhathi esisodwa sokuthwebula singanikeza izithombe ezingu-10-15 ezahlukene ezisatshalaliswe emavikini amaningi. Awudingi okuqukethwe okusha nsuku zonke.", st:"Nako e le nngwe ea ho nka setshwantsho e ka fana ka diposo tse fapaneng tse 10-15 tse aroloswang dibekeng tse ngata. Ha o hloke diteng tse ncha letsatsi le letsatsi.", ln:"Seance moko ya foto ekoki kopesa ba post 10-15 ekeseni oyo ekabwani na ba semaine ebele. Osengeli na bikuma ya sika mokolo na mokolo te.", kg:"Seance mosi ya foto kelenda kupesa ba post 10-15 ekeseni yina ekabwani na ba semaine mingi. Kelombama ve na bima ya mpa lumbu na lumbu."} },
  { icon:AICON.magnet, title:{fr:"Créer un teaser accrocheur", en:"Creating a catchy teaser", es:"Crear un teaser llamativo", it:"Creare un teaser accattivante", pt:"Criar um teaser cativante", sw:"Kuunda teaser inayovutia", zu:"Ukwakha i-teaser eheha", st:"Ho theha teaser e hohelang", ln:"Kosala teaser oyo ebendaka", kg:"Kusala teaser yina kebendaka"},
    answer:{fr:"Les 2-3 premières secondes décident si on continue à regarder. Commence par le moment le plus fort, pas par une intro lente.", en:"The first 2-3 seconds decide whether someone keeps watching. Start with the strongest moment, not a slow intro.", es:"Los primeros 2-3 segundos deciden si siguen viendo. Empieza por el momento más fuerte, no por una intro lenta.", it:"I primi 2-3 secondi decidono se si continua a guardare. Inizia con il momento più forte, non con un'intro lenta.", pt:"Os primeiros 2-3 segundos decidem se continuam a ver. Começa pelo momento mais forte, não por uma introdução lenta.", sw:"Sekunde 2-3 za kwanza huamua kama mtu ataendelea kutazama. Anza na wakati wenye nguvu zaidi, si utangulizi wa polepole.", zu:"Imizuzwana emi-2-3 yokuqala inquma ukuthi umuntu uyaqhubeka yini ukubuka. Qala ngomzuzu onamandla kakhulu, hhayi isingeniso esihamba kancane.", st:"Metsotswana e 4 ea pele e etsa qeto ea hore na batho ba tla tswela pele ho shebella. Qala ka nako e matla ka ho fetisisa, eseng ka selelekela se butle.", ln:"Segondes 2-3 ya liboso nde ekataka soki bato bakokoba kotala. Banda na moment ya makasi koleka, na intro ya malembe te.", kg:"Segondes 2-3 ya ntete nde kekataka kana bantu takwenda na ntwala ya kutala. Yantika na moment ya ngolo kuluta, na intro ya malembe ve."} },
  { icon:AICON.price, title:{fr:"Fixer ses prix", en:"Setting your prices", es:"Fijar tus precios", it:"Fissare i propri prezzi", pt:"Definir os teus preços", sw:"Kuweka bei zako", zu:"Ukubeka amanani akho", st:"Ho beha ditheko tsa hao", ln:"Kotia ba prix na yo", kg:"Kutia ba prix na nge"},
    answer:{fr:"Commence avec des prix modestes pour construire ta base de clients fidèles, puis augmente progressivement à mesure que ta demande grandit.", en:"Start with modest prices to build a loyal client base, then raise them gradually as demand grows.", es:"Empieza con precios modestos para construir tu base de clientes fieles, y súbelos poco a poco a medida que crece la demanda.", it:"Inizia con prezzi modesti per costruire la tua base di clienti fedeli, poi aumentali gradualmente man mano che cresce la domanda.", pt:"Começa com preços modestos para construir a tua base de clientes fiéis, e aumenta-os gradualmente à medida que a procura cresce.", sw:"Anza na bei ndogo ili kujenga msingi wa wateja waaminifu, kisha ongeza taratibu mahitaji yanapokua.", zu:"Qala ngamanani amancane ukwakha isisekelo sabathengi bakho abathembekile, bese wandisa kancane njengoba isidingo sikhula.", st:"Qala ka ditheko tse tlase ho haha motheo oa bareki ba hao ba tshepahalang, ebe o eketsa butle-butle ha tlhoko e ntse e hola.", ln:"Banda na ba prix ya moke mpo na kotonga base ya baklient ya sembo, na sima tombola malembe-malembe ndenge demande ekoli.", kg:"Yantika na ba prix ya fioti mpo na kutunga base ya baklient ya kieleka, na nima tombola malembe-malembe bonso demande kekola."} },
  { icon:AICON.gift, title:{fr:"Créer des offres groupées", en:"Creating bundle offers", es:"Crear ofertas combinadas", it:"Creare offerte in bundle", pt:"Criar ofertas em pacote", sw:"Kuunda ofa za pamoja", zu:"Ukwakha izinikezelo ezihlanganisiwe", st:"Ho theha ditlhahiso tse kopantsweng", ln:"Kosala ba offre esangisami", kg:"Kusala ba offre yina esangisami"},
    answer:{fr:"Propose un pack de plusieurs photos/vidéos à prix légèrement réduit par rapport à l'achat séparé — ça augmente le panier moyen.", en:"Offer a bundle of several photos/videos at a slightly reduced price compared to buying separately — it increases average order value.", es:"Ofrece un paquete de varias fotos/videos a precio ligeramente reducido frente a la compra por separado — aumenta el gasto medio.", it:"Proponi un pacchetto di più foto/video a prezzo leggermente ridotto rispetto all'acquisto separato — aumenta lo scontrino medio.", pt:"Propõe um pacote de várias fotos/vídeos a preço ligeiramente reduzido em relação à compra separada — aumenta o valor médio de compra.", sw:"Toa kifurushi cha picha/video kadhaa kwa bei iliyopunguzwa kidogo kuliko kununua tofauti — huongeza wastani wa manunuzi.", zu:"Nikeza iphakethe lezithombe/amavidiyo amaningana ngentengo encishisiwe kancane uma kuqhathaniswa nokuthenga ngokwahlukene — lokhu kwandisa isamba esilinganiselwe.", st:"Fana ka pakete ea diswantso/divideo tse ngata ka theko e fokolang hanyane ho feta ho reka ka ho arohana — sena se eketsa chelete e sebediswang.", ln:"Pesa pack ya ba foto/video ebele na prix ya moke koleka soki basombi separement — yango ebakisaka mbongo oyo bato bafutaka na moyenne.", kg:"Pesa pack ya ba foto/video mingi na prix ya fioti kuluta kana basumbi separement — yayi kebakisaka mbongo yina bantu kefutaka na moyenne."} },
  { icon:AICON.clock, title:{fr:"Créer un sentiment d'urgence", en:"Creating a sense of urgency", es:"Crear sensación de urgencia", it:"Creare un senso di urgenza", pt:"Criar um sentido de urgência", sw:"Kuunda hali ya haraka", zu:"Ukwakha umuzwa wesiphuthumayo", st:"Ho theha maikutlo a potlako", ln:"Kosala liyoki ya lombangu", kg:"Kusala kudiakisa ya lombangu"},
    answer:{fr:"Une offre \"disponible 48h seulement\" pousse à l'achat plus vite qu'une offre permanente. À utiliser avec modération pour rester crédible.", en:"A \"48h only\" offer drives faster purchases than a permanent one. Use sparingly to stay credible.", es:"Una oferta \"disponible solo 48h\" impulsa la compra más rápido que una oferta permanente. Úsalo con moderación para seguir siendo creíble.", it:"Un'offerta \"disponibile solo 48h\" spinge all'acquisto più velocemente di un'offerta permanente. Usala con moderazione per restare credibile.", pt:"Uma oferta \"disponível apenas 48h\" impulsiona a compra mais rápido do que uma oferta permanente. Usa com moderação para te manteres credível.", sw:"Ofa \"inapatikana kwa saa 48 tu\" huchochea ununuzi haraka zaidi kuliko ofa ya kudumu. Tumia kwa kiasi ili kubaki mwaminifu.", zu:"Umnikelo \"otholakala amahora angu-48 kuphela\" ukhuthaza ukuthenga ngokushesha kunomnikelo ohlala njalo. Sebenzisa ngokulinganisela ukuze uhlale wethembeka.", st:"Tlhahiso e \"fumanehang ka dihora tse 48 feela\" e kgothaletsa ho reka kapele ho feta tlhahiso e sa feleng. E sebedise ka tekano ho dula o tshepahala.", ln:"Offre \"ezali kaka na ba heure 48\" etindaka kosomba noki koleka offre ya libela. Salela na mesure mpo na kotikala ya kondimisa.", kg:"Offre \"kevanda kaka na ba heure 48\" ketinda kusumba noki kuluta offre ya mvula na mvula. Sadila na mesure mpo na kuvanda ya kundimisa."} },
  { icon:AICON.shield, title:{fr:"Protéger son identité", en:"Protecting your identity", es:"Proteger tu identidad", it:"Proteggere la propria identità", pt:"Proteger a tua identidade", sw:"Kulinda utambulisho wako", zu:"Ukuvikela ubunikazi bakho", st:"Ho sireletsa boitsebiso ba hao", ln:"Kobatela identité na yo", kg:"Kubumba identité na nge"},
    answer:{fr:"Évite les détails identifiables en arrière-plan (rue, plaque, façade reconnaissable). Désactive la géolocalisation sur tes photos avant de les poster.", en:"Avoid identifiable background details (street, license plate, recognizable façade). Turn off geolocation on your photos before posting.", es:"Evita detalles identificables en el fondo (calle, matrícula, fachada reconocible). Desactiva la geolocalización en tus fotos antes de publicarlas.", it:"Evita dettagli identificabili sullo sfondo (via, targa, facciata riconoscibile). Disattiva la geolocalizzazione sulle tue foto prima di pubblicarle.", pt:"Evita detalhes identificáveis no fundo (rua, matrícula, fachada reconhecível). Desativa a geolocalização nas tuas fotos antes de as publicares.", sw:"Epuka maelezo yanayoweza kutambulika nyuma (barabara, namba ya gari, jengo linalotambulika). Zima eneo la GPS kwenye picha zako kabla ya kuchapisha.", zu:"Gwema imininingwane ehlonzekayo ngasemuva (umgwaqo, inombolo yemoto, ingaphandle elihlonzekayo). Vala indawo ku-GPS ezithombeni zakho ngaphambi kokuzishicilela.", st:"Qoba dintlha tse ka tsejwang ka morao (seterata, nomoro ea koloi, ntlo e tsejwang). Tima sebaka sa GPS diswantshong tsa hao pele o di hatisa.", ln:"Kima ba détail oyo bakoki koyeba na fond (balabala, plaque, ndako oyo eyebani). Boma géolocalisation na ba foto na yo liboso ya kobimisa yango.", kg:"Buya ba détail yina belenda kuzaba na fond (balabala, plaque, nzo yina bezabaka). Fua géolocalisation na ba foto na nge na ntwala ya kubasisa yo."} },
  { icon:AICON.eye, title:{fr:"Éviter le partage non autorisé", en:"Avoiding unauthorized sharing", es:"Evitar la difusión no autorizada", it:"Evitare la condivisione non autorizzata", pt:"Evitar a partilha não autorizada", sw:"Kuepuka usambazaji usioidhinishwa", zu:"Ukugwema ukwabelana okungagunyaziwe", st:"Ho qoba ho arolelana ntle le tumello", ln:"Kokima kokabola oyo endimami te", kg:"Kubuya kukabula yina endimami ve"},
    answer:{fr:"Le filigrane et les métadonnées t'aident à prouver que le contenu est le tien si quelqu'un le republie sans autorisation.", en:"Watermarks and metadata help you prove content is yours if someone reposts it without permission.", es:"La marca de agua y los metadatos te ayudan a demostrar que el contenido es tuyo si alguien lo republica sin permiso.", it:"La filigrana e i metadati ti aiutano a dimostrare che il contenuto è tuo se qualcuno lo ripubblica senza autorizzazione.", pt:"A marca de água e os metadados ajudam-te a provar que o conteúdo é teu se alguém o republicar sem autorização.", sw:"Alama ya maji na metadata hukusaidia kuthibitisha maudhui ni yako endapo mtu atayachapisha tena bila ruhusa.", zu:"Uphawu lwamanzi nedatha ye-metadata kukusiza ukufakazela ukuthi okuqukethwe ngokwakho uma othile ekushicilela kabusha ngaphandle kwemvume.", st:"Letshwao la metsi le metadata li o thusa ho pakela hore diteng ke tsa hao haeba motho e mong a di hatisa hape ntle le tumello.", ln:"Filigrane na métadonnées esungaka yo kolakisa ete bikuma ezali ya yo soki moto moko abimisi yango lisusu na ndingisa te.", kg:"Filigrane na métadonnées kesadisaka nge kulakisa nde bima kele ya nge kana muntu mosi kebasisa yo diaka na ndingisa ve."} },
  { icon:AICON.leaf, title:{fr:"Gérer la pression et la fatigue", en:"Managing pressure and fatigue", es:"Gestionar la presión y el cansancio", it:"Gestire la pressione e la stanchezza", pt:"Gerir a pressão e o cansaço", sw:"Kudhibiti shinikizo na uchovu", zu:"Ukuphatha ingcindezi nokukhathala", st:"Ho laola khatello le mokgathala", ln:"Kolanda pression na kolemba", kg:"Kulanda pression na kulemba"},
    answer:{fr:"Il est normal de ne pas vouloir publier tous les jours. Planifie des jours de repos à l'avance dans ton calendrier de contenu pour éviter l'épuisement.", en:"It's normal not to want to post every day. Plan rest days ahead of time in your content calendar to avoid burnout.", es:"Es normal no querer publicar todos los días. Planifica días de descanso con antelación en tu calendario de contenido para evitar el agotamiento.", it:"È normale non voler pubblicare tutti i giorni. Pianifica in anticipo giorni di riposo nel tuo calendario contenuti per evitare il burnout.", pt:"É normal não quereres publicar todos os dias. Planeia dias de descanso com antecedência no teu calendário de conteúdo para evitar o esgotamento.", sw:"Ni kawaida kutotaka kuchapisha kila siku. Panga siku za mapumziko mapema kwenye ratiba yako ya maudhui ili kuepuka uchovu.", zu:"Kujwayelekile ukungafuni ukushicilela nsuku zonke. Hlela izinsuku zokuphumula kusengaphambili kukhalenda yakho yokuqukethwe ukugwema ukukhathala okukhulu.", st:"Ke ntho e tlwaelehileng ho se batle ho hatisa letsatsi le letsatsi. Rera matsatsi a phomolo esale pele khalentareng ea hao ea diteng ho qoba ho felelwa ke matla.", ln:"Ezali normal koluka te kobimisa mokolo na mokolo. Bongisa mikolo ya kopema liboso na calendrier ya bikuma na yo mpo na kokima kolemba mingi.", kg:"Kele normal kuluka ve kubasisa lumbu na lumbu. Bongisa balumbu ya kupema na ntwala na calendrier ya bima na nge mpo na kubuya kulemba mingi."} },
  { icon:AICON.light, title:{fr:"Améliorer la qualité de ses photos avec peu de matériel", en:"Improving photo quality with little gear", es:"Mejorar la calidad de tus fotos con poco material", it:"Migliorare la qualità delle foto con poca attrezzatura", pt:"Melhorar a qualidade das fotos com pouco material", sw:"Kuboresha ubora wa picha kwa vifaa vichache", zu:"Ukuthuthukisa ikhwalithi yezithombe ngezinsiza ezimbalwa", st:"Ho ntlafatsa boleng ba diswantso ka thepa e fokolang", ln:"Kobongisa qualité ya ba foto na biloko ya moke", kg:"Kubongisa qualité ya ba foto na bima ya fioti"},
    answer:{fr:"Un simple anneau lumineux LED (ring light) à moins de 20€ améliore énormément le rendu en intérieur, surtout le soir.", en:"A simple LED ring light under 20€ hugely improves indoor shots, especially in the evening.", es:"Un simple aro de luz LED por menos de 20€ mejora enormemente el resultado en interiores, sobre todo de noche.", it:"Un semplice ring light LED a meno di 20€ migliora enormemente la resa in interni, soprattutto di sera.", pt:"Um simples ring light LED por menos de 20€ melhora imenso o resultado em interiores, sobretudo à noite.", sw:"Mwanga wa duara wa LED wa bei chini ya euro 20 huboresha sana matokeo ndani ya nyumba, hasa jioni.", zu:"I-ring light ye-LED elula engaphansi kuka-€20 ithuthukisa kakhulu umphumela ngaphakathi, ikakhulukazi kusihlwa.", st:"Ring light ea LED e bonolo e ka tlase ho €20 e ntlafatsa haholo sephetho ka hare, haholo-holo bosiu.", ln:"Ring light moko ya LED ya moke koleka €20 ebongisaka mingi résultat na kati ya ndako, mingi-mingi na pokwa.", kg:"Ring light mosi ya LED ya fioti kuluta €20 kebongisaka mingi résultat na kati ya nzo, mingi-mingi na masika."} },
  { icon:AICON.sun, title:{fr:"Photographier en extérieur", en:"Shooting outdoors", es:"Fotografiar en exteriores", it:"Fotografare all'aperto", pt:"Fotografar no exterior", sw:"Kupiga picha nje", zu:"Ukuthwebula ngaphandle", st:"Ho nka diswantso ka ntle", ln:"Kokanga foto na libanda", kg:"Kukanga foto na nganda"},
    answer:{fr:"Privilégie les heures où le soleil est bas (tôt le matin, fin d'après-midi) pour une lumière douce et flatteuse, sans ombres dures à midi.", en:"Favor times when the sun is low (early morning, late afternoon) for soft, flattering light without harsh midday shadows.", es:"Prefiere las horas en que el sol está bajo (temprano en la mañana, al atardecer) para una luz suave y favorecedora, sin sombras duras al mediodía.", it:"Privilegia le ore in cui il sole è basso (mattina presto, tardo pomeriggio) per una luce morbida e favorevole, senza ombre dure a mezzogiorno.", pt:"Prefere as horas em que o sol está baixo (de manhã cedo, ao fim da tarde) para uma luz suave e favorável, sem sombras duras ao meio-dia.", sw:"Pendelea saa ambazo jua liko chini (asubuhi mapema, jioni) kwa mwanga laini na mzuri, bila vivuli vikali mchana.", zu:"Khetha amahora lapho ilanga liphansi (ekuseni kakhulu, kusihlwa) ukuze kube nokukhanya okuthambile nokuhle, ngaphandle kwemithunzi eqinile emini.", st:"Kgetha dihora tseo letsatsi le tlase ho tsona (hoseng haholo, mantsiboea) bakeng sa leseli le bonolo le le hohelang, ntle le meriti e thata mots'eare.", ln:"Pona ba heure oyo moyi ezali na nse (ntongo ya liboso, pokwa) mpo na pole ya boboto mpe ya kitoko, na milili makasi te na midi.", kg:"Sola ba heure yina ntangu kele na nsi (ntongo ya ntete, masika) mpo na pole ya boboto ye ya mbote, na midindu ya ngolo ve na midi."} },
  { icon:AICON.mirror, title:{fr:"Se filmer seule facilement", en:"Filming yourself alone easily", es:"Grabarte sola fácilmente", it:"Filmarsi da sole facilmente", pt:"Filmares-te sozinha facilmente", sw:"Kujipiga picha peke yako kwa urahisi", zu:"Ukuzithwebula ngokulula wedwa", st:"Ho itshwantsha o le mong ka bonolo", ln:"Komikanga yo moko na pete", kg:"Kumikanga nge mosi na pete"},
    answer:{fr:"Un trépied avec télécommande Bluetooth ou le retardateur de l'appareil te permettent de te filmer sans aide. Vérifie le cadrage avec l'écran avant/selfie.", en:"A tripod with Bluetooth remote or the camera timer lets you film yourself without help. Check framing with the front/selfie screen.", es:"Un trípode con control remoto Bluetooth o el temporizador de la cámara te permiten grabarte sin ayuda. Revisa el encuadre con la pantalla frontal/selfie.", it:"Un treppiede con telecomando Bluetooth o l'autoscatto della fotocamera ti permettono di filmarti senza aiuto. Controlla l'inquadratura con lo schermo anteriore/selfie.", pt:"Um tripé com controlo remoto Bluetooth ou o temporizador da câmara permitem-te filmares-te sem ajuda. Verifica o enquadramento com o ecrã frontal/selfie.", sw:"Kishikilia chenye kidhibiti cha Bluetooth au kipima muda cha kamera hukuwezesha kujipiga bila msaada. Angalia mpangilio kwa skrini ya mbele/selfie.", zu:"I-tripod ene-remote ye-Bluetooth noma isikhathi sekhamera sokuzithwebula kukuvumela ukuzithwebula ngaphandle kosizo. Hlola ukubekwa nge-screen engaphambili/selfie.", st:"Tripod e nang le taolo ea Bluetooth kapa nako ea khamera ea boithati e o dumella ho itshwantsha ntle le thuso. Sheba tlhophiso ka skrini ea ka pele/selfie.", ln:"Trepied na télécommande Bluetooth to minuteur ya kamera epesaka yo nzela ya komikanga yo moko na lisungi te. Tala cadrage na écran ya liboso/selfie.", kg:"Trepied na télécommande Bluetooth to minuteur ya kamera kepesaka nge nzila ya kumikanga nge mosi na lusadisu ve. Tala cadrage na écran ya ntwala/selfie."} },
  { icon:AICON.frame, title:{fr:"Retoucher ses photos sans exagérer", en:"Editing photos without overdoing it", es:"Retocar tus fotos sin exagerar", it:"Ritoccare le foto senza esagerare", pt:"Retocar as fotos sem exagerar", sw:"Kurekebisha picha bila kupitiliza", zu:"Ukulungisa izithombe ngaphandle kokweqisa", st:"Ho lokisa diswantso ntle le ho feteletsa", ln:"Kobongisa ba foto na yo na kolekisa ndelo te", kg:"Kubongisa ba foto na nge na kulekisa ndelo ve"},
    answer:{fr:"Ajuste la luminosité, le contraste et la chaleur des couleurs plutôt que d'utiliser des filtres trop forts qui rendent le rendu artificiel.", en:"Adjust brightness, contrast and color warmth rather than using overly strong filters that look artificial.", es:"Ajusta el brillo, el contraste y la calidez del color en vez de usar filtros demasiado fuertes que se ven artificiales.", it:"Regola luminosità, contrasto e calore del colore invece di usare filtri troppo forti che rendono il risultato artificiale.", pt:"Ajusta o brilho, o contraste e a temperatura da cor em vez de usares filtros demasiado fortes que tornam o resultado artificial.", sw:"Rekebisha mwangaza, tofauti na joto la rangi badala ya kutumia vichujio vikali sana vinavyofanya matokeo yaonekane bandia.", zu:"Lungisa ukukhanya, ukuphambana kanye nokufudumala kombala kunokusebenzisa izihlungi eziqinile kakhulu ezenza umphumela ubukeke ongokoqobo.", st:"Lokisa bokgabane, phapano le mocheso oa mmala ho fapana le ho sebedisa disefe tse matla haholo tse etsang hore sephetho se bonahale e se sa tlhaho.", ln:"Bongisa lumière, contraste na chaleur ya couleur na esika ya kosalela ba filtre makasi mingi oyo ekomisaka résultat ya solo te.", kg:"Bongisa lumière, contraste ye kiyoyo ya bakuma na kisika ya kusadila ba filtre ya ngolo mingi yina kesalaka résultat ya kieleka ve."} },
  { icon:AICON.chart, title:{fr:"Comprendre ses statistiques", en:"Understanding your stats", es:"Entender tus estadísticas", it:"Capire le proprie statistiche", pt:"Perceber as tuas estatísticas", sw:"Kuelewa takwimu zako", zu:"Ukuqonda izibalo zakho", st:"Ho utlwisisa dipalo tsa hao", ln:"Kososola ba statistique na yo", kg:"Kuzaba ba statistique na nge"},
    answer:{fr:"Regarde quels posts ont le plus d'engagement (likes, commentaires, temps de visionnage) et refais des contenus similaires à ceux qui marchent le mieux.", en:"Look at which posts get the most engagement (likes, comments, watch time) and create more content similar to what performs best.", es:"Fíjate en qué publicaciones tienen más interacción (me gusta, comentarios, tiempo visto) y crea contenido similar al que mejor funciona.", it:"Guarda quali post hanno più interazione (like, commenti, tempo di visualizzazione) e crea contenuti simili a quelli che funzionano meglio.", pt:"Vê que publicações têm mais interação (gostos, comentários, tempo de visualização) e cria conteúdos semelhantes aos que funcionam melhor.", sw:"Angalia machapisho gani yana mwingiliano zaidi (like, maoni, muda wa kutazama) na tengeneza maudhui yanayofanana na yale yanayofanya vizuri zaidi.", zu:"Bheka ukuthi yiziphi izithombe ezinokuxhumana okuningi (ama-like, amazwana, isikhathi sokubuka) bese wakha okuqukethwe okufanayo nalokho okusebenza kahle kakhulu.", st:"Sheba hore na diposo life di nang le ho sebediswa ho hoholo (dilikes, maikutlo, nako ea ho shebella) mme o etse diteng tse tshwanang le tse sebetsang hantle ka ho fetisisa.", ln:"Tala ba post nini ezali na boyokani mingi (ba like, ba commentaire, ntango ya kotala) mpe sala bikuma ekokani na oyo esalaka malamu koleka.", kg:"Tala ba post nki kele na boyikani mingi (ba like, ba commentaire, ntangu ya kutala) ye sala bima yina ekokani na yina kesalaka mbote kuluta."} },
  { icon:AICON.handshake, title:{fr:"Fidéliser ses clients réguliers", en:"Keeping regular clients loyal", es:"Fidelizar a tus clientes habituales", it:"Fidelizzare i clienti abituali", pt:"Fidelizar os teus clientes regulares", sw:"Kuwaaminisha wateja wako wa kawaida", zu:"Ukuthembeka kwabathengi bakho abavamile", st:"Ho tshepahala ho bareki ba hao ba tloaelehileng", ln:"Kobatela baklient na yo ya mbala na mbala", kg:"Kubumba baklient na nge ya mbala na mbala"},
    answer:{fr:"Un petit mot personnalisé ou un contenu exclusif pour tes clients les plus fidèles renforce la relation et donne envie de revenir.", en:"A short personalized note or exclusive content for your most loyal clients strengthens the relationship and encourages them to come back.", es:"Una nota personalizada o contenido exclusivo para tus clientes más fieles refuerza la relación y da ganas de volver.", it:"Un piccolo messaggio personalizzato o contenuto esclusivo per i tuoi clienti più fedeli rafforza la relazione e invoglia a tornare.", pt:"Uma pequena mensagem personalizada ou conteúdo exclusivo para os teus clientes mais fiéis reforça a relação e dá vontade de voltar.", sw:"Ujumbe mdogo wa kibinafsi au maudhui ya kipekee kwa wateja wako waaminifu zaidi huimarisha uhusiano na kuwafanya warudi.", zu:"Umyalezo omncane ozenzele wona noma okuqukethwe okukhethekile kubathengi bakho abathembeke kakhulu kuqinisa ubudlelwano futhi kubenza bafune ukubuya.", st:"Molaetsa o monyane o ikgethileng kapa diteng tse ikgethang bakeng sa bareki ba hao ba tshepahalang haholo di matlafatsa kamano mme li etsa hore ba batle ho kgutla.", ln:"Liloba moko ya moke oyo ozali kokomela bango moko to bikuma ya spécial mpo na baklient na yo ya sembo koleka elendisaka boyokani mpe epesaka posa ya kozonga.", kg:"Diambu mosi ya fioti yina kesonekela bo mosi to bima ya spécial mpo na baklient na nge ya kieleka kuluta kelendisaka boyikani ye kepesaka posa ya kuvutuka."} },
  { icon:AICON.folder, title:{fr:"Organiser ses fichiers", en:"Organizing your files", es:"Organizar tus archivos", it:"Organizzare i propri file", pt:"Organizar os teus ficheiros", sw:"Kupanga faili zako", zu:"Ukuhlela amafayela akho", st:"Ho hlophisa difaele tsa hao", ln:"Kobongisa ba fichier na yo", kg:"Kubongisa ba fisye na nge"},
    answer:{fr:"Crée un dossier par séance avec la date, pour retrouver facilement tes meilleures photos/vidéos plus tard et éviter les doublons.", en:"Create one folder per shoot with the date, to easily find your best photos/videos later and avoid duplicates.", es:"Crea una carpeta por sesión con la fecha, para encontrar fácilmente tus mejores fotos/videos más tarde y evitar duplicados.", it:"Crea una cartella per ogni shooting con la data, per ritrovare facilmente le tue foto/video migliori in seguito ed evitare duplicati.", pt:"Cria uma pasta por sessão com a data, para encontrares facilmente as tuas melhores fotos/vídeos mais tarde e evitares duplicados.", sw:"Tengeneza folda kwa kila kikao pamoja na tarehe, ili kupata kwa urahisi picha/video zako bora baadaye na kuepuka nakala.", zu:"Yakha ifolda ngasinye sokuthwebula kanye nosuku, ukuze uthole kalula izithombe/amavidiyo akho angcono kamuva futhi ugweme ukuphindaphinda.", st:"Etsa foldara bakeng sa nako e nngwe le e nngwe ea ho nka setshwantsho hammoho le letsatsi, ho fumana ka bonolo diswantso/divideo tsa hao tse ntle hamorao le ho qoba diphetiso.", ln:"Sala dossier moko na seance moko elongo na date, mpo na koluka na pete ba foto/video na yo ya malamu koleka na sima mpe kokima ba doublon.", kg:"Sala dossier mosi na seance mosi vandaka na date, mpo na kuluka na pete ba foto/video na nge ya mbote kuluta na nima ye kubuya ba doublon."} },
  { icon:AICON.star, title:{fr:"Se démarquer de la concurrence", en:"Standing out from competitors", es:"Destacar frente a la competencia", it:"Distinguersi dalla concorrenza", pt:"Destacares-te da concorrência", sw:"Kujitofautisha na washindani", zu:"Ukuzehlukanisa kwabancintisana nabo", st:"Ho ikgetholla ho tlholisano", ln:"Komikesenisa na ba concurrent", kg:"Kumikesenisa na ba concurrent"},
    answer:{fr:"Trouve un thème ou univers qui te ressemble (couleurs, décor, personnalité) et garde-le cohérent — c'est ce qui te rend reconnaissable.", en:"Find a theme or style that feels like you (colors, setting, personality) and keep it consistent — that's what makes you recognizable.", es:"Encuentra un tema o estilo que se parezca a ti (colores, ambiente, personalidad) y mantenlo coherente — eso es lo que te hace reconocible.", it:"Trova un tema o uno stile che ti somiglia (colori, ambientazione, personalità) e mantienilo coerente — è ciò che ti rende riconoscibile.", pt:"Encontra um tema ou estilo que se pareça contigo (cores, ambiente, personalidade) e mantém-no coerente — é isso que te torna reconhecível.", sw:"Tafuta mandhari au mtindo unaokufananisha (rangi, mazingira, tabia) na uudumishe — hicho ndicho kinachokufanya utambulike.", zu:"Thola isihloko noma isitayela esikufanele (imibala, indawo, ubuntu) bese uyagcina kuvumelana — yilokho okwenza uhlonzwe.", st:"Fumana sehlooho kapa setaele se o tshwanang le sona (mebala, tikoloho, botho) mme o se boloke se tshwana — ke sona se etsang hore o tsejwe.", ln:"Luka thème to style oyo ekokani na yo (couleur, ambiance, personnalité) mpe batela yango ya kokangama — yango nde ekomisaka yo koyebana.", kg:"Luka thème to style yina ekokani na nge (bakuma, ambiance, kimuntu) ye bumba yo ya kukangama — yayi nde kesalaka nde nge kezabana."} },
  { icon:AICON.pen, title:{fr:"Rédiger une légende qui capte l'attention", en:"Writing a caption that grabs attention", es:"Escribir una descripción que capte la atención", it:"Scrivere una didascalia che catturi l'attenzione", pt:"Escrever uma legenda que capte a atenção", sw:"Kuandika maelezo yanayovutia", zu:"Ukubhala incazelo edonsa ukunakwa", st:"Ho ngola caption e hohelang tlhokomelo", ln:"Kokoma légende oyo ebendaka likebi", kg:"Kusoneka légende yina kebendaka dikebi"},
    answer:{fr:"Commence par une phrase courte et intrigante avant les détails. Une question ou une confidence donne envie de lire la suite et de commenter.", en:"Start with a short, intriguing line before the details. A question or a personal note makes people want to read on and comment.", es:"Empieza con una frase corta e intrigante antes de los detalles. Una pregunta o una confidencia da ganas de seguir leyendo y comentar.", it:"Inizia con una frase breve e intrigante prima dei dettagli. Una domanda o una confidenza invoglia a leggere e a commentare.", pt:"Começa com uma frase curta e intrigante antes dos detalhes. Uma pergunta ou uma confidência dá vontade de continuar a ler e a comentar.", sw:"Anza na sentensi fupi ya kuvutia kabla ya maelezo. Swali au siri ndogo humfanya msomaji aendelee kusoma na kutoa maoni.", zu:"Qala ngomusho omfushane odonsa ukunakwa ngaphambi kwemininingwane. Umbuzo noma imfihlo encane kwenza umuntu afune ukuqhubeka ukufunda nokuphawula.", st:"Qala ka polelwana e khutshwane e hohelang pele ho dintlha. Potso kapa lekunutu le lenyane li etsa hore motho a batle ho tswela pele ho bala le ho fana ka maikutlo.", ln:"Banda na phrase ya mokuse mpe ya kobenda liboso ya ba détail. Motuna to sekele moko ya moke epesaka posa ya kotanga mpe kopesa commentaire.", kg:"Yantika na phrase ya nkufi ye ya kubenda na ntwala ya ba détail. Ntuba to sekele mosi ya fioti kepesaka posa ya kutanga ye kupesa commentaire."} }
];

/* ---------------- "Match with Clients" (créatrice) ----------------
   Chatbot à thèmes, même mécanique que ADVICE_TOPICS/Tips, mais dont les
   sujets correspondent aux centres d'intérêt qu'un membre peut avoir dans
   sa bio (voir BIO_EMOJI_MAP) : pour chaque thème, un conseil business sur
   comment l'aborder en chat, teaser, garder le contact, et convertir la
   conversation en abonnement/vente. Anglais uniquement (le site reste en
   anglais) — le fallback topic.title.en / topic.answer.en s'applique déjà
   automatiquement quel que soit LANG. */
const CLIENT_MATCH_TOPICS = [
  { icon:AICON.globe, title:{en:"He mentions travel"},
    answer:{en:"Travel talk is pure gold — everyone has a dream destination and loves being asked about it. Ask where he'd take you on a first trip, then tease that you'd need \"the right outfit for the weather\" — it's playful, personal, and gives you a natural reason to mention a themed photo set later without it feeling like a sales pitch."} },
  { icon:AICON.chat, title:{en:"He's into humor & jokes"},
    answer:{en:"If humor is his thing, don't try to out-joke him — react to his jokes with genuine laughter (😂, voice notes work even better) and throw in a light tease of your own. Guys who lead with humor are testing if you're \"fun to talk to,\" not just pretty. Prove that first, and he'll stick around far longer than someone chasing a quick reply."} },
  { icon:AICON.target, title:{en:"He's into sport & fitness"},
    answer:{en:"Ask what he trains for — it flatters his effort and gives you an easy follow-up (\"show me\" works both ways). You can mirror it back naturally: mention you've been working on your own routine, which opens the door to a workout-themed photo or video without it feeling forced."} },
  { icon:AICON.leaf, title:{en:"He loves nature & the outdoors"},
    answer:{en:"Outdoorsy guys usually value calm, genuine conversation over fast, transactional chat — slow down a little. Ask about his favorite spot to disconnect, and describe a peaceful setting of your own (a beach, a garden). It sets up a soft, natural lead-in to a relaxed, sun-lit content set."} },
  { icon:AICON.music, title:{en:"He's into nightlife & parties"},
    answer:{en:"High energy responds well to high energy — keep your messages short, punchy, and a little cheeky. Ask what gets the dance floor going for him, then say you have \"a whole party playlist and mood\" of your own — it's a natural, light tease toward a livelier, dressed-up content set."} },
  { icon:AICON.chart, title:{en:"He's business-minded / ambitious"},
    answer:{en:"Ambitious guys like being seen as more than just a subscriber — acknowledge his hustle before anything else (\"sounds like you don't stop\"). They also respond well to structure: a clear, well-presented tip menu or exclusive offer feels respectful of their time, not pushy."} },
  { icon:AICON.heart, title:{en:"He mentions family"},
    answer:{en:"This usually signals he values warmth and loyalty over novelty. Don't overthink it — a simple, sincere \"that's really sweet\" goes further than a flirty line here. Guys who open up about family tend to become your most loyal, long-term supporters once they feel genuinely cared about, not just entertained."} },
  { icon:AICON.mirror, title:{en:"He mentions pets"},
    answer:{en:"Pets are an instant soft spot — ask for a name, a breed, a funny habit. It's low-pressure small talk that builds real rapport fast. If you have a pet yourself, share it — swapping pet stories is one of the fastest ways to make a stranger feel like a friend."} },
  { icon:AICON.gamepad, title:{en:"He's into gaming"},
    answer:{en:"Gamers often chat late and expect fast, casual replies rather than long messages — match that rhythm instead of overthinking your wording. Ask what he's playing lately; a quick, genuine reaction (even \"I have no idea what that is, teach me\") keeps the conversation light and going."} },
  { icon:AICON.star, title:{en:"He's romantic / mentions love"},
    answer:{en:"Romantic guys want to feel like the connection is special, not generic — avoid copy-paste lines here more than anywhere else. Ask a real question about what romance means to him, and mirror a little vulnerability back. This is the theme where slowing down and sounding sincere converts best."} },
  { icon:AICON.frame, title:{en:"He's into adventure"},
    answer:{en:"Adventure types are drawn to spontaneity — a little unpredictability in your replies (a surprise voice note, an unexpected question) keeps things exciting for them. Ask about his craziest trip or plan, then tease that you have \"an adventurous side he hasn't seen yet.\""} },
  { icon:AICON.palette, title:{en:"He's into art & creativity"},
    answer:{en:"Creative guys appreciate being asked about their process, not just their output — \"what inspired that?\" lands better than a generic compliment. They also tend to genuinely appreciate a well-composed, artistic photo, so this is a great audience for your more aesthetic, moodier content."} },
  { icon:AICON.film, title:{en:"He's into movies & cinema"},
    answer:{en:"Ask for a favorite movie and actually react to it — it shows you're listening, not scripting. A shared favorite genre (romance, thriller) is a great excuse to describe a themed photo or video set \"inspired by\" that mood, which feels like a fun idea rather than a sales pitch."} },
  { icon:AICON.stamp, title:{en:"He's into fashion & style"},
    answer:{en:"Fashion-minded guys notice detail — mention a specific piece (color, texture, brand vibe) rather than a vague \"cute outfit.\" This is your easiest, most natural bridge into talking about your wardrobe and upcoming photo sets, since it's already his language."} },
  { icon:AICON.gift, title:{en:"He mentions wine / drinks"},
    answer:{en:"This theme is about atmosphere, not the drink itself — ask what a perfect evening looks like for him. It opens the door to describing a cozy, intimate mood of your own (candles, a glass of wine, soft lighting) as the setting for your next content drop."} },
  { icon:AICON.handshake, title:{en:"How to keep a client coming back"},
    answer:{en:"The members who stay long-term are the ones who feel remembered, not just charged. Reference something he told you weeks ago — it costs you nothing and tells him you actually pay attention. Loyalty is built in the small, free messages between purchases, not just in the purchases themselves."} }
];

/* ---------------- "Match Your Words" (membre) ----------------
   Même mécanique de chatbot à thèmes, côté membre cette fois : les sujets
   correspondent aux centres d'intérêt qu'une créatrice peut afficher dans
   sa bio, avec des conseils pour comprendre son profil et engager une
   conversation agréable et respectueuse. Anglais uniquement. */
const WORDS_MATCH_TOPICS = [
  { icon:AICON.globe, title:{en:"She mentions travel in her bio"},
    answer:{en:"Ask her about a place she's dreaming of rather than one she's already been — it's a lighter, more personal question and gives her something fun to imagine out loud. Creators get a lot of generic \"hey beautiful\" messages; a real question about her dreams instantly puts you in a different category."} },
  { icon:AICON.chat, title:{en:"She lists humor / jokes as a passion"},
    answer:{en:"This is an invitation to be playful, not to try too hard. A light, genuine joke or a witty reply to something she posted works far better than a rehearsed pickup line. If she's funny, she wants a conversation partner who can keep up, not just someone complimenting her looks."} },
  { icon:AICON.target, title:{en:"She's into fitness / sport"},
    answer:{en:"Ask what keeps her motivated rather than just complimenting her body — it shows you see the discipline behind the content, not just the result. Creators notice the difference immediately, and it tends to get a warmer, longer reply."} },
  { icon:AICON.leaf, title:{en:"She loves nature / the outdoors"},
    answer:{en:"Slow your pace a little here — outdoorsy creators often appreciate calmer, more thoughtful chats over rapid-fire messages. Ask about her favorite way to unwind; it's a low-pressure question that tends to open up a real conversation."} },
  { icon:AICON.music, title:{en:"She's into nightlife / dancing"},
    answer:{en:"Match her energy — short, upbeat, playful messages land better than long paragraphs here. Ask what song she can't resist dancing to; it's a fun, easy question that shows real interest without being heavy."} },
  { icon:AICON.chart, title:{en:"She mentions ambition / her own business"},
    answer:{en:"Treat her like the entrepreneur she is — a respectful comment about her hustle, and being mindful of her time, goes a long way. Creators remember members who are considerate over those who are demanding, and it usually leads to a much better connection."} },
  { icon:AICON.heart, title:{en:"She mentions family"},
    answer:{en:"This is usually a sign she values warmth and sincerity. A genuine, kind response works much better than a flirty one here — it shows you're listening to who she is, not just what she posts."} },
  { icon:AICON.mirror, title:{en:"She mentions a pet"},
    answer:{en:"Pets are the easiest, most natural icebreaker there is — ask for a name or a funny story. It's low-pressure, it's genuine, and it usually gets an instant, happy reply because it has nothing to do with performance."} },
  { icon:AICON.gamepad, title:{en:"She's into gaming"},
    answer:{en:"Ask what she's currently playing — it's an easy, judgment-free question that shows you're curious about her as a person, not just her content. Gamer creators especially appreciate members who see them as more than a persona."} },
  { icon:AICON.star, title:{en:"She mentions romance / what she's looking for"},
    answer:{en:"This is where being genuine matters most — avoid generic compliments and instead respond to what she actually said. A little honesty about yourself in return (not oversharing, just real) tends to build far more trust than flattery."} },
  { icon:AICON.frame, title:{en:"She's into adventure"},
    answer:{en:"Ask about her wildest trip or dream adventure — it's a fun, open question that lets her talk about herself, which is always a good sign in a first real conversation. Curiosity beats compliments here."} },
  { icon:AICON.palette, title:{en:"She's into art / creativity"},
    answer:{en:"Ask what inspired a specific photo or post rather than just saying it's beautiful — it shows you're paying attention to her as a creator, not just consuming. Creative people love being appreciated for their eye, not just their looks."} },
  { icon:AICON.gift, title:{en:"General rule: how to stand out"},
    answer:{en:"Creators get dozens of \"hi beautiful\" messages a day — the fastest way to stand out is to react to something specific she said or posted, ask a real question, and be patient. A respectful, genuinely curious member is memorable; a generic one is invisible."} }
];

function vitrineCardHtml(m){
  const num = m.id.replace('m', '').padStart(2, '0');

  // Slot pas encore rempli par la créatrice : même placeholder que la page agence.
  if(!m.filled || !m.photo){
    return `
      <div class="model-card empty-slot-card">
        <div class="model-photo empty-slot-photo">
          <span class="logo empty-slot-logo">honeymoon</span>
          <span class="num-badge">${num}</span>
        </div>
        <div class="model-body">
          <h3 style="font-size:16px;">${t('emptyName')}</h3>
          <div class="meta">${t('numberPrefix')} ${num}</div>
        </div>
      </div>`;
  }

  const online = m.bio && m.bio.status === 'online';
  const photoCount = m.galleryPhotos.length;
  const videoCount = m.galleryVideos.length;
  const hasBio = !!(m.bio && Object.keys(m.bio).some(k => k !== 'status' && m.bio[k]));

  return `
    <div class="model-card social-feed-card">
      <div class="model-photo">
        ${m.photoType === 'video' ? `<video src="${m.photo}" muted loop autoplay playsinline></video>` : `<img src="${m.photo}" loading="lazy">`}
        <div class="social-feed-scrim"></div>
        <span class="num-badge">${num}</span>
        <span class="status">${online ? t('statusOnline') : t('statusOffline')}</span>
      </div>
      <div class="model-body">
        <div class="name-row">
          <h3>${escText(m.name) || t('nameUndefined')}</h3>
          <div class="name-row-right">
            ${followerBadgeHtml(m.followersCount)}
            <button type="button" class="card-fav-btn" data-id="${m.id}" title="${escAttr(t('memberFavoriteToggle'))}">${ICON_HEART_OUTLINE}</button>
            <button type="button" class="card-report-btn" data-id="${m.id}" data-name="${escAttr(m.name || '')}" title="${escAttr(t('reportThisCreatorBtn'))}">⋮</button>
          </div>
        </div>
        <div class="meta">${escText(m.country || '—')}</div>
        <div class="tags">
          <span class="vtag">${ICON_CAMERA}${photoCount}</span>
          <span class="vtag">${ICON_VIDEO}${videoCount}</span>
          ${hasBio ? `<span class="vtag">${ICON_BIO}${t('bioSectionTitle')}</span>` : ''}
        </div>
        <button type="button" class="btn btn-primary vitrine-enter-btn" data-id="${m.id}" style="margin-top:6px;">${t('vitrineEnterBtn')}</button>
      </div>
    </div>`;
}

function bioNarrativeHtml(m, bio){
  bio = bio || {};
  const parts = [];

  const introBits = [];
  if(bio.age) introBits.push(bio.age + ' ans');
  if(bio.origin || bio.nationality) introBits.push(bio.origin || bio.nationality);
  if(m.country) introBits.push(m.country);
  if(introBits.length){
    parts.push(`<p class="bio-narrative-lead">${ICON_SPARKLES2}<span><b>${escText(m.name || '')}</b>, ${escText(introBits.join(' · '))}.</span></p>`);
  }

  if(bio.personality || bio.bodyType || bio.orientation){
    const bits = [bio.personality, bio.bodyType, bio.orientation].filter(Boolean).join(', ');
    parts.push(`<p>${ICON_SPARKLE}<span><b>${t('bioNarrativePersonalityTitle')}</b>${escText(bits)}</span></p>`);
  }

  if(bio.passions || bio.hobbies || bio.universe){
    const bits = [bio.passions, bio.hobbies, bio.universe].filter(Boolean).join(' · ');
    parts.push(`<p>${ICON_PALETTE}<span><b>${t('bioNarrativePassionsTitle')}</b>${escText(bits)}</span></p>`);
  }

  if(m.contentType || m.platforms){
    const bits = [m.contentType, m.platforms].filter(Boolean).join(' · ');
    parts.push(`<p>${ICON_CLAPPER}<span><b>${t('bioNarrativeContentTitle')}</b>${escText(bits)}</span></p>`);
  }

  if(bio.fantasies || bio.fetish){
    const bits = [bio.fantasies, bio.fetish].filter(Boolean).join(' · ');
    parts.push(`<p>${ICON_FLAME}<span><b>${t('bioNarrativeUniverseTitle')}</b>${escText(bits)}</span></p>`);
  }

  if(bio.lookingFor || m.availability){
    const bits = [bio.lookingFor, m.availability].filter(Boolean).join(' · ');
    parts.push(`<p>${ICON_ENVELOPE_HEART}<span><b>${t('bioNarrativeLookingForTitle')}</b>${escText(bits)}</span></p>`);
  }

  if(bio.ambitions){
    parts.push(`<p>${ICON_ROCKET}<span><b>${t('bioNarrativeAmbitionsTitle')}</b>${escText(bio.ambitions)}</span></p>`);
  }

  if(bio.discussionStyle){
    parts.push(`<p>${ICON_CHAT}<span><b>${t('bioNarrativeDiscussionStyleTitle')}</b>${escText(bio.discussionStyle)}</span></p>`);
  }

  if(bio.dreams){
    parts.push(`<p>${ICON_MOON_STAR}<span><b>${t('bioNarrativeDreamsTitle')}</b>${escText(bio.dreams)}</span></p>`);
  }

  if(bio.fears){
    parts.push(`<p>${ICON_ALERT_TRIANGLE}<span><b>${t('bioNarrativeFearsTitle')}</b>${escText(bio.fears)}</span></p>`);
  }

  if(bio.victories){
    parts.push(`<p>${ICON_TROPHY}<span><b>${t('bioNarrativeVictoriesTitle')}</b>${escText(bio.victories)}</span></p>`);
  }

  if(bio.challenges){
    parts.push(`<p>${ICON_TARGET_SM}<span><b>${t('bioNarrativeChallengesTitle')}</b>${escText(bio.challenges)}</span></p>`);
  }

  if(m.audience || bio.socials){
    const bits = [m.audience, bio.socials].filter(Boolean).join(' · ');
    parts.push(`<p>${ICON_MOBILE}<span><b>${t('bioNarrativeAudienceTitle')}</b>${escText(bits)}</span></p>`);
  }

  const desirePct = bio.desirePercentages || {};
  const hasDesirePct = DESIRE_THEMES.some(k => (parseInt(desirePct[k], 10) || 0) > 0);
  if(hasDesirePct){
    const rows = DESIRE_THEMES.map(k => {
      const v = parseInt(desirePct[k], 10) || 0;
      if(!v) return '';
      return `<div class="bio-desire-pct-row" style="display:flex;align-items:center;justify-content:space-between;padding:5px 0;">
        <span>${DESIRE_THEME_ICON[k]}${t('desireTheme_' + k)}</span>
        <span style="color:var(--honey);font-weight:700;">${v}%</span>
      </div>`;
    }).join('');
    parts.push(`<div class="bio-desire-pct-block"><p style="color:var(--honey);font-weight:700;font-size:13px;margin:0 0 8px;">${t('bioDesireProfileTitle')}</p>${rows}</div>`);
  }

  if(!parts.length && !m.bioCoverPhoto) return `<p class="gallery-empty">${t('galleryEmpty')}</p>`;
  const coverBlock = m.bioCoverPhoto
    ? `<div class="bio-narrative-cover">${m.bioCoverPhotoType === 'video' ? `<video src="${m.bioCoverPhoto}" controls loop playsinline></video>` : `<img src="${m.bioCoverPhoto}" loading="lazy" decoding="async">`}</div>`
    : '';
  return `${coverBlock}<h3 class="bio-narrative-title">${t('bioNarrativeMainTitle')}</h3><div class="bio-narrative">${parts.join('<div class="bio-narrative-divider"></div>')}</div>`;
}

function bioRow(labelKey, value){
  if(!value) return '';
  return `<div class="vitrine-bio-row"><span class="k">${t(labelKey)}</span><span class="v">${escText(value)}</span></div>`;
}

function exclusiveCardHtml(m, item){
  const desc = escText(item.description) || '';
  const salesBadge = (item.salesCount || 0) > 0
    ? `<span class="exclusive-sales-badge">${ICON_HEART_SM} ${t('exclusiveSalesCount').replace('{count}', item.salesCount)}</span>` : '';
  if(item.kind === 'video'){
    return `
      <div class="exclusive-thumb-wrap exclusive-video-wrap">
        <div class="exclusive-video-pair">
          ${item.teaserUrl ? `
            <div class="exclusive-thumb exclusive-teaser-thumb">
              <video src="${item.teaserUrl}" muted autoplay loop playsinline></video>
              <span class="paid-thumb-tag">${t('paidTeaserBadge')}</span>
            </div>` : ''}
          <div class="exclusive-thumb exclusive-unlock-btn" data-docid="${item.docId}" data-price="${item.price}" data-kind="video">
            <video class="exclusive-blurred-video" src="${item.url}" muted autoplay loop playsinline></video>
            <div class="exclusive-thumb-lock">${ICON_LOCK}</div>
            <span class="exclusive-thumb-price">${item.price}€</span>
          </div>
        </div>
        ${desc ? `<p class="exclusive-thumb-desc">${desc}</p>` : ''}
        ${salesBadge}
      </div>`;
  }
  if(item.kind === 'audio'){
    return `
      <div class="exclusive-thumb-wrap">
        <div class="exclusive-thumb exclusive-unlock-btn exclusive-audio-thumb" data-docid="${item.docId}" data-price="${item.price}" data-kind="audio">
          ${AICON.music}
          <div class="exclusive-thumb-lock">${ICON_LOCK}</div>
          <span class="exclusive-thumb-price">${item.price}€</span>
        </div>
        ${desc ? `<p class="exclusive-thumb-desc">${desc}</p>` : ''}
        ${salesBadge}
      </div>`;
  }
  return `
    <div class="exclusive-thumb-wrap">
      <div class="exclusive-thumb exclusive-unlock-btn" data-docid="${item.docId}" data-price="${item.price}" data-kind="photo">
        <img class="exclusive-blurred-img" src="${item.url}" loading="lazy" decoding="async">
        <div class="exclusive-thumb-lock">${ICON_LOCK}</div>
        <span class="exclusive-thumb-price">${item.price}€</span>
      </div>
      ${desc ? `<p class="exclusive-thumb-desc">${desc}</p>` : ''}
      ${salesBadge}
    </div>`;
}

function openUnlockRequest(m, docId, price, kind){
  if(!memberAuth || !memberAuth.currentUser || memberAuth.currentUser.isAnonymous){ promptSignupForMembersOnly('purchase'); return; }
  mockPurchaseNotice();
  document.getElementById('t-paid-modal-title').textContent = `${t('paidUnlockBtn')} ${price}€`;
  const body = document.getElementById('paid-body');
  body.innerHTML = `
    <p style="color:var(--text-muted);font-size:12.5px;line-height:1.6;margin-bottom:14px;">${t('paidUnlockExplain')}</p>
    <label>${t('commentNamePh')}</label>
    <input id="unlock-name" value="${escText(localStorage.getItem('hm_comment_name') || '')}">
    <label>${t('paidContactLabel')}</label>
    <input id="unlock-contact" placeholder="${t('paidContactPh')}">
    <div class="modal-actions">
      <button class="btn btn-ghost btn-sm" id="unlock-cancel" style="flex:1;">${t('cancel')}</button>
      <button class="btn btn-primary btn-sm" id="unlock-send" style="flex:1;">${t('paidSendRequest')}</button>
    </div>
  `;
  document.getElementById('unlock-cancel').onclick = closePaidModal;
  document.getElementById('unlock-send').onclick = async () => {
    const name = document.getElementById('unlock-name').value.trim();
    const contact = document.getElementById('unlock-contact').value.trim();
    if(!name || !contact){ toast(t('paidContactRequired')); return; }
    const btn = document.getElementById('unlock-send');
    btn.disabled = true;
    try{
      if(auth && !auth.currentUser){ try{ await auth.signInAnonymously(); }catch(e){} }
      const orderRef = await db.collection('profiles').doc(m.id).collection('paid_content').doc(docId)
        .collection('orders').add({
          buyerName: name.slice(0, 40),
          buyerContact: contact.slice(0, 80),
          buyerUid: (memberAuth && memberAuth.currentUser) ? memberAuth.currentUser.uid : null,
          status: 'pending',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      localStorage.setItem('hm_comment_name', name);
      const item = (m.paidContent || []).find(x => x.docId === docId);
      const orderInfo = {
        ref: orderRef.id.slice(-6).toUpperCase(), buyerName: name, buyerContact: contact,
        creatorName: m.name, itemDesc: item ? item.description : '', price
      };
      sendUnlockNotifications(orderInfo); // email au client + à Honeymoon (si EmailJS configuré)
      showPaymentInstructions(orderInfo);
    }catch(e){
      console.error('unlock request error', e);
      toast((LANG==='fr' ? 'Erreur : ' : 'Error: ') + (e && e.message ? e.message : e));
      btn.disabled = false;
    }
  };
  document.getElementById('paid-backdrop').classList.add('open');
  document.getElementById('paid-modal').classList.add('open');
}

function showPaymentInstructions(o){
  const body = document.getElementById('paid-body');
  document.getElementById('t-paid-modal-title').textContent = t('paidRequestSent');
  body.innerHTML = `
    <p style="color:var(--text-muted);font-size:12.5px;line-height:1.6;margin-bottom:14px;">${t('paidPaymentInstructionsIntro')}</p>
    <div class="vitrine-bio-rows">
      <div class="vitrine-bio-row"><span class="k">${t('paidRefLabel')}</span><span class="v" style="font-family:'JetBrains Mono',monospace;font-size:14px;color:var(--honey);">${o.ref}</span></div>
      <div class="vitrine-bio-row"><span class="k">${t('paidAmountLabel')}</span><span class="v">${o.price}€</span></div>
      <div class="vitrine-bio-row"><span class="k">IBAN</span><span class="v" style="font-family:'JetBrains Mono',monospace;">${PAYMENT_INSTRUCTIONS.iban}</span></div>
      <div class="vitrine-bio-row"><span class="k">BIC</span><span class="v" style="font-family:'JetBrains Mono',monospace;">${PAYMENT_INSTRUCTIONS.bic}</span></div>
      <div class="vitrine-bio-row"><span class="k">${t('paidHolderLabel')}</span><span class="v">${escText(PAYMENT_INSTRUCTIONS.holder)}</span></div>
    </div>
    <div class="currency-select-row" style="margin:14px 0;">
      <span class="mono" style="font-size:10px;color:var(--text-muted);text-transform:uppercase;">${t('paidSeeInMyCurrency')}</span>
      <select id="buyer-currency-select">
        <option value="">${t('toolCurrency')}…</option>
        ${CURRENCIES.filter(c => c.code !== 'EUR').map(c => `<option value="${c.code}">${c.code} — ${c.name}</option>`).join('')}
      </select>
    </div>
    <p id="buyer-currency-result" class="daily-budget-result" style="margin-bottom:10px;"></p>
    <p style="color:var(--text-muted);font-size:11.5px;line-height:1.6;margin-bottom:14px;">${escText(PAYMENT_INSTRUCTIONS.note)}</p>
    <a href="${buildAdminWhatsappLink(o)}" target="_blank" rel="noopener" class="btn btn-primary" style="display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:10px;">${t('paidWhatsappBtn')}</a>
    <div class="modal-actions">
      <button class="btn btn-primary btn-sm" id="paid-instructions-close" style="flex:1;">${t('galleryClose')}</button>
    </div>
  `;
  document.getElementById('paid-instructions-close').onclick = closePaidModal;
  document.getElementById('buyer-currency-select').onchange = async (e) => {
    const target = e.target.value;
    const resultEl = document.getElementById('buyer-currency-result');
    if(!target){ resultEl.textContent = ''; return; }
    resultEl.textContent = t('toolCurrencyLoading');
    try{
      const res = await fetch(`https://api.frankfurter.app/latest?from=EUR&to=${target}`);
      if(!res.ok) throw new Error('API error');
      const data = await res.json();
      const converted = (o.price * data.rates[target]).toFixed(2);
      resultEl.textContent = `${o.price}€ ≈ ${converted} ${target}`;
      resultEl.style.color = 'var(--honey)';
    }catch(err){
      console.error('buyer currency conversion error', err);
      resultEl.textContent = t('toolCurrencyError');
      resultEl.style.color = '#e06a6a';
    }
  };
}

async function openVitrineRoom(id, isBackgroundRefresh){
  const m = roster.find(x => x.id === id);
  if(!m) return;
  const bio = Object.assign({
    origin:'', nationality:'', age:'', bodyType:'', orientation:'', lookingFor:'',
    passions:'', universe:'', hobbies:'', personality:'', fantasies:'', fetish:'',
    ambitions:'', socials:'', workUrl:'', status:'offline'
  }, m.bio || {});
  const online = bio.status === 'online';

  const mediaThumb = (item, type) => {
    return `
    <div class="gallery-thumb-wrap">
      <div class="gallery-thumb">
        ${type === 'video'
          ? `<video src="${item.url}" data-full="${item.url}" data-type="video" muted></video>`
          : `<img src="${item.url}" data-full="${item.url}" data-type="image" loading="lazy">`}
      </div>
    </div>`;
  };

  const photoThumbs = m.galleryPhotos.map(item => mediaThumb(item, 'image')).join('');
  const videoThumbs = m.galleryVideos.map(item => mediaThumb(item, 'video')).join('');

  const publicIntro = m.publicIntro || '';

  const body = document.getElementById('vitrine-room-body');
  body.innerHTML = `
    <div class="vitrine-cover">
      ${m.photoType === 'video' ? `<video src="${m.photo}" controls loop playsinline></video>` : `<img src="${m.photo}" fetchpriority="high" decoding="async">`}
      <span class="vitrine-status-badge ${online ? 'online' : ''}">${online ? t('statusOnline') : t('statusOffline')}</span>
    </div>
    <h3>${escText(m.name) || t('nameUndefined')} <button type="button" class="room-fav-btn" data-id="${m.id}" title="${escAttr(t('memberFavoriteToggle'))}">${ICON_HEART_OUTLINE}</button></h3>
    <div class="meta" style="color:var(--text-muted);font-size:12px;margin-top:2px;">${escText(m.country || '—')}</div>

    <div class="room-support-block">
      <button type="button" class="follow-btn room-support-btn" id="room-follow-btn" data-id="${m.id}">${t('followBtn')}</button>
      <div class="room-follower-count"><span id="room-follower-badge">${followerBadgeHtml(m.followersCount)}</span> ${m.followersCount || 0} ${t('followersLabel')}</div>
    </div>
    <button type="button" class="room-chat-cta room-chat-btn" data-id="${m.id}">${ICON_CHAT_SM} ${t('chatStartBtn')}</button>
    ${(m.eventBanner && m.eventBanner.endAt && Date.now() < m.eventBanner.endAt && Date.now() >= (m.eventBanner.startAt || 0)) ? `
    <div class="room-event-banner">
      <div style="flex:1;">
        <span class="room-event-banner-text">${escText(m.eventBanner.message || '')}</span>
        ${m.eventBanner.audioUrl ? `<audio controls src="${escAttr(m.eventBanner.audioUrl)}" style="width:100%;max-width:260px;height:34px;margin-top:8px;display:block;"></audio>` : ''}
      </div>
      <button type="button" class="room-event-banner-cta room-chat-btn" data-id="${m.id}">${t('bannerViewerCta')}</button>
    </div>` : ''}
    ${publicIntro ? `<div class="room-intro-card"><p class="room-intro-line">${escText(publicIntro)}</p></div>` : ''}

    <div class="my-tabs room-tabs">
      <button type="button" class="my-tab-btn active" id="room-tab-btn-profile">${t('memberTabProfile')}</button>
      <button type="button" class="my-tab-btn" id="room-tab-btn-gallery">${t('galleryTitle')}</button>
      ${(m.tipMenu && m.tipMenu.length) ? `<button type="button" class="my-tab-btn" id="room-tab-btn-tipmenu">🍯 ${t('tipMenuTabLabel')}</button>` : ''}
      <button type="button" class="my-tab-btn" id="room-tab-btn-chat">${t('commentsCommunityTitle')} ${escText(m.name || t('nameUndefined'))}</button>
    </div>

    <div class="my-tab-panel active" id="room-tab-panel-profile">
      ${bioNarrativeHtml(m, bio)}
    </div>

    <div class="my-tab-panel" id="room-tab-panel-gallery">
      ${(m.paidContent && m.paidContent.length) || photoThumbs || videoThumbs ? `
        <div class="room-section-block">
          ${(photoThumbs || videoThumbs) ? `
            <div class="gallery-section">
              <h4>${t('galleryPhotos')} (${m.galleryPhotos.length})</h4>
              <div class="gallery-strip">${photoThumbs}</div>
            </div>
            <div class="gallery-section">
              <h4>${t('galleryVideos')} (${m.galleryVideos.length})</h4>
              <div class="gallery-strip">${videoThumbs}</div>
            </div>` : `<p class="gallery-empty">${t('galleryEmpty')}</p>`}
        </div>
        ${(m.paidContent && m.paidContent.length) ? `
        <div class="room-section-divider"></div>
        <div class="room-section-block">
          <h3 class="room-section-title">${ICON_LOCK} ${t('paidExclusiveTitle')}</h3>
          <p style="color:var(--text-muted);font-size:11.5px;margin:0 0 12px;">${t('paidExclusiveNote')}</p>
          <div class="exclusive-grid">${m.paidContent.map(it => exclusiveCardHtml(m, it)).join('')}</div>
        </div>` : ''}
      ` : `<p class="gallery-empty">${t('galleryEmpty')}</p>`}
    </div>

    ${(m.tipMenu && m.tipMenu.length) ? `
    <div class="my-tab-panel" id="room-tab-panel-tipmenu">
      <div class="tipmenu-how-it-works">
        <h4>${t('tipMenuHowTitle')}</h4>
        <p>${t('tipMenuHowMemberP1')}</p>
        <p>${t('tipMenuHowMemberP2')}</p>
        <p>${t('tipMenuHowMemberP3')}</p>
      </div>
      <div class="tipmenu-public-list">
        ${m.tipMenu.map((r, idx) => `
          <div class="tipmenu-public-row">
            ${r.contentUrl ? `
            <div class="tipmenu-public-preview ${r.type === 'audio' ? 'audio-only' : ''}">
              ${r.type === 'video' ? `<video src="${escAttr(r.contentUrl)}" muted></video>`
                : r.type === 'audio' ? `<div class="tipmenu-audio-lock-bg">${ICON_AUDIO}</div>`
                : `<img src="${escAttr(r.contentUrl)}" loading="lazy" decoding="async">`}
              <span class="tipmenu-preview-lock">${ICON_LOCK}</span>
            </div>` : ''}
            <div class="tipmenu-public-head">
              <span class="tipmenu-public-theme">${r.emoji ? r.emoji + ' ' : ''}${escText(r.theme)}</span>
              <span class="tipmenu-public-prices">${r.type === 'video' ? ICON_VIDEO : (r.type === 'audio' ? ICON_AUDIO : ICON_CAMERA)} ${r.price ? r.price + '€' : ''}</span>
            </div>
            ${r.description ? `<p class="tipmenu-public-desc">${escText(r.description)}</p>` : ''}
            <button type="button" class="tipmenu-order-btn" data-id="${m.id}" data-idx="${idx}" data-theme="${escAttr(r.theme)}" data-price="${r.price || ''}">${ICON_CART} ${t('tipMenuOrderBtn')}</button>
          </div>`).join('')}
      </div>
      ${m.tipMenuRules ? `<p class="tipmenu-public-rules">${escText(m.tipMenuRules)}</p>` : ''}
      <div class="tipmenu-custom-note">
        <span>${t('tipMenuCustomNote')}</span>
        <button type="button" class="btn btn-ghost btn-sm tipmenu-custom-chat-btn" data-id="${m.id}">${t('chatStartBtn')}</button>
      </div>
    </div>
    ` : ''}

    <div class="my-tab-panel" id="room-tab-panel-chat">
      <div class="vitrine-comments">
        <h4>${ICON_HEART_SM} ${t('commentsCommunityTitle')} ${escText(m.name || t('nameUndefined'))}</h4>
        <p class="comment-rules">${t('commentRules')}</p>
        <div class="comment-list" id="comment-list"><span class="gallery-empty">${t('commentEmpty')}</span></div>
        <div class="comment-form">
          <select id="comment-name-mode" class="comment-name-input">
            <option value="anonymous">${t('commentModeAnonymous')}</option>
            <option value="visitor">${t('commentModeVisitor')}</option>
            ${memberAuth && memberAuth.currentUser ? `<option value="member">${t('commentModeMember')}</option>` : ''}
            <option value="custom" selected>${t('commentModeCustom')}</option>
          </select>
          <input type="text" id="comment-name" class="comment-name-input" maxlength="30" placeholder="${t('commentNamePh')}" value="">
          <textarea id="comment-input" placeholder="${t('commentPlaceholder')}"></textarea>
          <button class="btn btn-primary btn-sm" id="comment-submit">${t('commentSubmit')}</button>
        </div>
      </div>
    </div>
  `;

  const roomTabs = ['profile', 'gallery', 'tipmenu', 'chat'].filter(n => document.getElementById('room-tab-panel-' + n));
  function showRoomTab(name){
    roomTabs.forEach(n => {
      document.getElementById('room-tab-panel-' + n).classList.toggle('active', n === name);
      document.getElementById('room-tab-btn-' + n).classList.toggle('active', n === name);
    });
  }
  roomTabs.forEach(n => {
    document.getElementById('room-tab-btn-' + n).onclick = () => showRoomTab(n);
  });

  body.querySelectorAll('.gallery-thumb img, .gallery-thumb video').forEach(el => {
    el.onclick = () => openLightbox(el.dataset.full, el.dataset.type);
  });

  body.querySelectorAll('.exclusive-unlock-btn').forEach(btn => {
    btn.onclick = () => openUnlockRequest(m, btn.dataset.docid, btn.dataset.price, btn.dataset.kind);
  });

  document.getElementById('comment-submit').onclick = () => submitComment(m.id);
  const commentModeSel = document.getElementById('comment-name-mode');
  const commentNameInput = document.getElementById('comment-name');
  const applyCommentMode = () => {
    const mode = commentModeSel.value;
    if(mode === 'anonymous'){ commentNameInput.value = t('commentModeAnonymous'); commentNameInput.style.display = 'none'; }
    else if(mode === 'visitor'){ commentNameInput.value = t('commentModeVisitor'); commentNameInput.style.display = 'none'; }
    else if(mode === 'member'){ commentNameInput.value = (memberAuth && memberAuth.currentUser && memberAuth.currentUser.displayName) || ''; commentNameInput.style.display = 'none'; }
    else { commentNameInput.value = ''; commentNameInput.style.display = ''; commentNameInput.focus(); }
  };
  commentModeSel.onchange = applyCommentMode;
  applyCommentMode();

  document.getElementById('vitrine-backdrop').classList.add('open');
  document.getElementById('vitrine-room').classList.add('open');
  // La fiche se met parfois à jour en silence en arrière-plan (nouvelles données reçues) pendant
  // que le membre est en train de lire/défiler — dans ce cas on ne touche pas à sa position de
  // lecture. Seule une VRAIE ouverture (nouvelle fiche, ou premier affichage) revient en haut ;
  // avant, la fiche revenait TOUJOURS en haut, même en pleine lecture pendant un rafraîchissement
  // silencieux — c'était la cause du "parfois ça commence en haut, parfois en bas".
  const roomBodyEl = document.getElementById('vitrine-room-body');
  if(!(isBackgroundRefresh && roomBodyEl.dataset.openId === id)){
    roomBodyEl.scrollTop = 0;
  }
  roomBodyEl.dataset.openId = id;
  // force un rafraîchissement d'affichage immédiat (même correctif que sur les autres pages)
  void document.getElementById('vitrine-room').offsetHeight;

  loadComments(m.id, m.name);
  const roomFavBtn = document.getElementById('vitrine-room-body').querySelector('.room-fav-btn[data-id]');
  if(roomFavBtn) roomFavBtn.onclick = () => toggleMemberFavorite(m.id);
  document.getElementById('vitrine-room-body').querySelectorAll('.room-chat-btn[data-id]').forEach(roomChatBtn => {
  roomChatBtn.onclick = async () => {
    if(!memberAuth || !memberAuth.currentUser || memberAuth.currentUser.isAnonymous){ promptSignupForMembersOnly('chat'); return; }
    const user = memberAuth.currentUser;
    let username = '';
    let myUxd = 0;
    let myPhoto = '';
    try{
      const doc = await memberDb.collection('members').doc(user.uid).get();
      username = (doc.exists && doc.data().username) || '';
      myUxd = (doc.exists && doc.data().uxd) || 0;
      myPhoto = (doc.exists && doc.data().photoURL) || '';
    }catch(e){ console.error('load member username error', e); }
    closeVitrineRoom();
    openChat({
      profileId: m.id, viewerType: 'member', memberUid: user.uid,
      memberUsername: username, creatorName: m.name || '',
      otherName: m.name || t('nameUndefined'), otherPhoto: m.photo, myUxd, myPhoto
    });
  };
  });
  initFavoriteButtonsState();
  wireRoomFollowButton(m);
  const tipMenuChatBtn = document.getElementById('vitrine-room-body').querySelector('.tipmenu-custom-chat-btn[data-id]');
  if(tipMenuChatBtn) tipMenuChatBtn.onclick = async () => {
    if(!memberAuth || !memberAuth.currentUser || memberAuth.currentUser.isAnonymous){ promptSignupForMembersOnly('chat'); return; }
    const user = memberAuth.currentUser;
    let username = '';
    let myUxd = 0;
    let myPhoto = '';
    try{
      const doc = await memberDb.collection('members').doc(user.uid).get();
      username = (doc.exists && doc.data().username) || '';
      myUxd = (doc.exists && doc.data().uxd) || 0;
      myPhoto = (doc.exists && doc.data().photoURL) || '';
    }catch(e){ console.error('load member username error', e); }
    closeVitrineRoom();
    openChat({
      profileId: m.id, viewerType: 'member', memberUid: user.uid,
      memberUsername: username, creatorName: m.name || '',
      otherName: m.name || t('nameUndefined'), otherPhoto: m.photo, myUxd, myPhoto
    });
  };
  document.getElementById('vitrine-room-body').querySelectorAll('.tipmenu-order-btn[data-id]').forEach(btn => {
    btn.onclick = async () => {
      if(!memberAuth || !memberAuth.currentUser || memberAuth.currentUser.isAnonymous){ promptSignupForMembersOnly('chat'); return; }
      const user = memberAuth.currentUser;
      let username = '';
      let myUxd = 0;
      let myPhoto = '';
      try{
        const doc = await memberDb.collection('members').doc(user.uid).get();
        username = (doc.exists && doc.data().username) || '';
        myUxd = (doc.exists && doc.data().uxd) || 0;
        myPhoto = (doc.exists && doc.data().photoURL) || '';
      }catch(e){ console.error('load member username error', e); }
      const idx = parseInt(btn.dataset.idx, 10);
      const row = (m.tipMenu && m.tipMenu[idx]) || {};
      const orderText = t('tipMenuOrderPrefill').replace('{theme}', btn.dataset.theme).replace('{price}', btn.dataset.price);
      try{
        const convRef = memberDb.collection('profiles').doc(m.id).collection('conversations').doc(user.uid);
        await convRef.collection('messages').add({
          senderType: 'member', text: orderText, customOrderRequest: true, customOrderStatus: 'pending',
          orderKind: 'tip', tipTheme: row.theme || btn.dataset.theme || '', tipPrice: row.price || btn.dataset.price || '',
          tipContentType: row.type || 'photo', tipContentUrl: row.contentUrl || '',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await convRef.set({
          memberUid: user.uid, memberUsername: username || '', creatorName: m.name || '',
          lastMessageText: '🛍️ ' + t('tipOrderCardLabel'), lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
          lastSenderType: 'member', creatorUnreadCount: firebase.firestore.FieldValue.increment(1),
          pendingTipOrderCount: firebase.firestore.FieldValue.increment(1)
        }, { merge: true });
        try{
          await memberDb.collection('members').doc(user.uid).set({
            conversationProfileIds: firebase.firestore.FieldValue.arrayUnion(m.id)
          }, { merge: true });
        }catch(e){ console.error('track conversationProfileIds error', e); }
        toast(t('customOrderSentToast'));
      }catch(e){ console.error('send tip menu order error', e); toast(t('memberErrUnknown')); }
      closeVitrineRoom();
      mockPurchaseNotice();
      openChat({
        profileId: m.id, viewerType: 'member', memberUid: user.uid,
        memberUsername: username, creatorName: m.name || '',
        otherName: m.name || t('nameUndefined'), otherPhoto: m.photo, myUxd, myPhoto
      });
    };
  });
}
async function wireRoomFollowButton(m){
  const btn = document.getElementById('room-follow-btn');
  if(!btn) return;
  const setBtnState = (isFollowing) => {
    btn.classList.toggle('following', isFollowing);
    btn.textContent = isFollowing ? t('followingBtn') : t('followBtn');
    btn.classList.add('state-ready');
  };
  let isFollowing = false;
  if(memberAuth && memberAuth.currentUser){
    try{
      const doc = await memberDb.collection('members').doc(memberAuth.currentUser.uid).get();
      const followingCreators = (doc.exists && doc.data().followingCreators) || [];
      isFollowing = followingCreators.includes(m.id);
    }catch(e){ console.error('load following state error', e); }
  }
  setBtnState(isFollowing);
  btn.onclick = async () => {
    if(!memberAuth || !memberAuth.currentUser || memberAuth.currentUser.isAnonymous){ promptSignupForMembersOnly('favorite'); return; }
    const user = memberAuth.currentUser;
    btn.disabled = true;
    try{
      const memberRef = memberDb.collection('members').doc(user.uid);
      const creatorRef = db.collection('profiles').doc(m.id);
      // Miroir de la relation d'abonnement dans profiles/{creatorId}/followers/{memberUid},
      // écrit par le membre lui-même via memberDb (même schéma que les conversations) : la
      // créatrice ne peut PAS interroger la collection "members" pour savoir qui la suit
      // (règles Firestore : lecture d'un doc membre interdite sauf si c'est lui-même ou
      // profil public), donc on lui fournit sa liste d'abonnés via cette sous-collection
      // qu'elle a le droit de lire en entier.
      const followerMirrorRef = memberDb.collection('profiles').doc(m.id).collection('followers').doc(user.uid);
      if(isFollowing){
        await memberRef.set({ followingCreators: firebase.firestore.FieldValue.arrayRemove(m.id) }, { merge: true });
        await creatorRef.set({ followersCount: firebase.firestore.FieldValue.increment(-1) }, { merge: true });
        await followerMirrorRef.delete().catch(e => console.error('followers mirror delete error', e));
        m.followersCount = Math.max(0, (m.followersCount || 0) - 1);
      } else {
        const memberSnap = await memberRef.get();
        const memberData = memberSnap.exists ? memberSnap.data() : {};
        await memberRef.set({ followingCreators: firebase.firestore.FieldValue.arrayUnion(m.id) }, { merge: true });
        await creatorRef.set({ followersCount: firebase.firestore.FieldValue.increment(1) }, { merge: true });
        await followerMirrorRef.set({
          username: memberData.username || '',
          photoURL: memberData.photoURL || '',
          followedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(e => console.error('followers mirror set error', e));
        m.followersCount = (m.followersCount || 0) + 1;
      }
      isFollowing = !isFollowing;
      setBtnState(isFollowing);
      const badgeEl = document.getElementById('room-follower-badge');
      if(badgeEl) badgeEl.innerHTML = followerBadgeHtml(m.followersCount);
    }catch(e){ console.error('toggle follow creator error', e); toast(t('memberErrUnknown')); }
    btn.disabled = false;
  };
}
document.getElementById('vitrine-backdrop').onclick = closeVitrineRoom;
document.getElementById('vitrine-room-close').onclick = closeVitrineRoom;
function closeVitrineRoom(){
  document.getElementById('vitrine-backdrop').classList.remove('open');
  document.getElementById('vitrine-room').classList.remove('open');
  if(window.location.hash.startsWith('#vitrine/')){
    window.location.hash = 'vitrine';
  }
}

/* ---------------- votes (like / dislike) ---------------- */
const ICON_LIKE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.6z"/></svg>';
const ICON_BOOKMARK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
const ICON_DISLIKE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3z"/><path d="M17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"/></svg>';
const ICON_DOC = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
const ICON_GALLERY = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';

async function castMediaVote(profileId, docId, type){
  if(!db){ toast(t('saveErrorToast')); return; }
  const key = 'hm_mvote_' + docId;
  const prev = localStorage.getItem(key);
  const ref = db.collection('profiles').doc(profileId).collection('media').doc(docId);
  const inc = firebase.firestore.FieldValue.increment(1);
  const dec = firebase.firestore.FieldValue.increment(-1);
  const update = {};

  if(prev === type){
    update[type === 'like' ? 'likes' : 'dislikes'] = dec;
    localStorage.removeItem(key);
  } else {
    if(prev){ update[prev === 'like' ? 'likes' : 'dislikes'] = dec; }
    update[type === 'like' ? 'likes' : 'dislikes'] = inc;
    localStorage.setItem(key, type);
  }

  try{
    if(auth && !auth.currentUser){ try{ await auth.signInAnonymously(); }catch(e){} }
    await ref.set(update, { merge: true });
    const snap = await ref.get();
    const data = snap.data() || {};
    const btnLike = document.querySelector(`.media-vote-btn[data-docid="${docId}"][data-type="like"]`);
    const btnDislike = document.querySelector(`.media-vote-btn[data-docid="${docId}"][data-type="dislike"]`);
    if(btnLike){ btnLike.querySelector('span').textContent = data.likes || 0; btnLike.classList.toggle('active', localStorage.getItem(key) === 'like'); }
    if(btnDislike){ btnDislike.querySelector('span').textContent = data.dislikes || 0; btnDislike.classList.toggle('active', localStorage.getItem(key) === 'dislike'); }
  }catch(e){
    console.error('media vote error', e);
    toast((LANG==='fr' ? 'Erreur vote : ' : 'Vote error: ') + (e && e.message ? e.message : e));
  }
}

/* ---------------- comments (public, moderated) ---------------- */
const BANNED_WORDS = [
  'connard','connasse','salope','pute','putain de merde','encule','enculé','enculee',
  'batard','bâtard','fdp','ntm','pd','negre','nègre','sale pute','sale chien',
  'idiot(e)? de merde','abruti','débile mental','ta gueule','ferme ta gueule',
  'fuck you','fucking bitch','bitch','asshole','cunt','whore','slut','retard','faggot',
  'nigger','n[i1]gga','stupid bitch','dumb whore','kill yourself','kys'
];
function containsBannedWords(text){
  const norm = text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // enlève les accents
  return BANNED_WORDS.some(w => {
    const pattern = w.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    try{
      const re = new RegExp('\\b' + pattern + '\\b', 'i');
      return re.test(norm);
    }catch(e){
      return norm.includes(pattern.replace(/[()?[\]]/g, ''));
    }
  });
}
function formatCommentDate(ts){
  let d;
  if(ts && typeof ts.toDate === 'function') d = ts.toDate();
  else if(ts) d = new Date(ts);
  else d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function initials(name){
  const parts = (name || '?').trim().split(/\s+/);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}

/* ================= PANNEAU ADMIN : VENTES / FACTURATION ================= */
let invoiceCounter = 1;
async function openSalesPanel(){
  document.getElementById('sales-backdrop').classList.add('open');
  document.getElementById('sales-modal').classList.add('open');
  const body = document.getElementById('sales-body');
  body.innerHTML = `<span class="gallery-empty">${t('paidOrdersLoading')}</span>`;
  try{
    const allOrders = [];
    for(const m of roster){
      if(!m.filled) continue;
      const paidSnap = await db.collection('profiles').doc(m.id).collection('paid_content').get();
      for(const itemDoc of paidSnap.docs){
        const item = itemDoc.data();
        const ordersSnap = await db.collection('profiles').doc(m.id).collection('paid_content').doc(itemDoc.id)
          .collection('orders').get();
        ordersSnap.forEach(o => {
          const data = o.data();
          if(data.status !== 'pending') return;
          allOrders.push({
            orderId: o.id, itemDocId: itemDoc.id, creatorId: m.id, creatorName: m.name || m.id,
            item, ...data
          });
        });
      }
    }
    if(!allOrders.length){
      body.innerHTML = `<span class="gallery-empty">${t('paidNoOrders')}</span>`;
      return;
    }
    body.innerHTML = allOrders.map((o, idx) => `
      <div class="sale-order-row" data-idx="${idx}">
        <div class="sale-order-head">
          <span><b>${escText(o.creatorName)}</b> — ${o.item.kind === 'video' ? t('galleryVideos') : t('galleryPhotos')} — <b>${o.item.price}€</b></span>
          <span class="mono" style="color:var(--text-muted);">${formatCommentDate(o.createdAt)}</span>
        </div>
        <div style="font-size:12px;color:var(--text-muted);">${escText(o.buyerName)} · ${escText(o.buyerContact)}</div>
        <div class="sale-split-row">
          <span>${t('paidSplitLabel')}</span>
          <input type="number" min="0" max="100" class="split-input" value="${DEFAULT_SPLIT_CREATOR_PERCENT}"> % ${t('paidSplitCreator')}
        </div>
        <button class="btn btn-primary btn-sm" data-order="${o.orderId}" data-item="${o.itemDocId}" data-creator="${o.creatorId}" data-price="${o.item.price}">${t('paidInvoiceAndValidate')}</button>
      </div>`).join('');

    body.querySelectorAll('.sale-order-row').forEach((row, idx) => {
      const o = allOrders[idx];
      row.querySelector('button').onclick = async (e) => {
        const btn = e.currentTarget;
        const splitPercent = Math.max(0, Math.min(100, parseInt(row.querySelector('.split-input').value, 10) || DEFAULT_SPLIT_CREATOR_PERCENT));
        btn.disabled = true;
        try{
          const price = o.item.price;
          const creatorShare = Math.round(price * splitPercent) / 100;
          const platformShare = Math.round((price - creatorShare) * 100) / 100;
          const itemRef = db.collection('profiles').doc(o.creatorId).collection('paid_content').doc(o.itemDocId);
          await itemRef.collection('orders').doc(o.orderId).set({
            status: 'paid', splitPercent, creatorShare, platformShare,
            paidAt: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
          await itemRef.set({
            salesCount: firebase.firestore.FieldValue.increment(1),
            revenue: firebase.firestore.FieldValue.increment(price)
          }, { merge: true });
          // Crédite le membre acheteur en UXD (1 UXD = 1€ dépensé) — jamais affiché en euros côté membre.
          if(o.buyerUid){
            try{
              await memberDb.collection('members').doc(o.buyerUid).set({
                uxd: firebase.firestore.FieldValue.increment(price)
              }, { merge: true });
            }catch(e){ console.error('credit UXD error', e); }
          }
          const localCreator = roster.find(x => x.id === o.creatorId);
          if(localCreator){
            const localItem = (localCreator.paidContent || []).find(x => x.docId === o.itemDocId);
            if(localItem){ localItem.salesCount = (localItem.salesCount||0) + 1; localItem.revenue = (localItem.revenue||0) + price; }
          }
          showInvoice({
            ref: o.orderId.slice(-6).toUpperCase(), buyerName: o.buyerName, buyerContact: o.buyerContact,
            creatorName: o.creatorName, itemDesc: o.item.description, kind: o.item.kind,
            price, splitPercent, creatorShare, platformShare, date: new Date()
          });
          toast(t('paidMarkedPaidToast'));
          row.remove();
        }catch(e2){
          console.error(e2);
          toast((LANG==='fr'?'Erreur : ':'Error: ') + (e2.message || e2));
          btn.disabled = false;
        }
      };
    });
  }catch(e){
    console.error('sales panel load error', e);
    body.innerHTML = `<span class="gallery-empty">${(LANG==='fr'?'Erreur : ':'Error: ')}${escText(e.message||String(e))}</span>`;
  }
}
document.getElementById('sales-close').onclick = () => {
  document.getElementById('sales-backdrop').classList.remove('open');
  document.getElementById('sales-modal').classList.remove('open');
};
document.getElementById('sales-backdrop').onclick = () => document.getElementById('sales-close').click();

function showInvoice(o){
  const num = 'HM-' + o.date.getFullYear() + '-' + o.ref;
  const dateStr = formatCommentDate(o.date);
  document.getElementById('invoice-body').innerHTML = `
    <div class="invoice-paper">
      <h2>Honeymoon</h2>
      <div class="inv-meta">Facture n° ${num} — ${dateStr}<br>Réf. commande : ${o.ref}</div>
      <table>
        <tr><td>${t('paidContactLabel')}</td><td style="text-align:right;">${escText(o.buyerName)} (${escText(o.buyerContact)})</td></tr>
        <tr><td>${t('creatorLink')}</td><td style="text-align:right;">${escText(o.creatorName)}</td></tr>
        <tr><td>${o.kind === 'video' ? t('galleryVideos') : t('galleryPhotos')}</td><td style="text-align:right;">${escText(o.itemDesc) || '—'}</td></tr>
        <tr class="inv-total"><td>Total</td><td style="text-align:right;">${o.price}€</td></tr>
        <tr><td>${t('paidSplitCreator')} (${o.splitPercent}%)</td><td style="text-align:right;">${o.creatorShare}€</td></tr>
        <tr><td>Honeymoon (${100 - o.splitPercent}%)</td><td style="text-align:right;">${o.platformShare}€</td></tr>
      </table>
    </div>
  `;
  document.getElementById('invoice-backdrop').classList.add('open');
  document.getElementById('invoice-modal').classList.add('open');
}
document.getElementById('invoice-close').onclick = () => {
  document.getElementById('invoice-backdrop').classList.remove('open');
  document.getElementById('invoice-modal').classList.remove('open');
};
document.getElementById('invoice-print').onclick = () => window.print();

/* ================= SIGNATURE ÉLECTRONIQUE DE CONTRAT ================= */
/* ================= CONTRAT CRÉATRICE ↔ HONEYMOON (texte fixe, nom + signature seulement) ================= */
function openCreatorContract(creatorId){
  const m = roster.find(x => x.id === creatorId);
  if(!m) return;
  const alreadySigned = !!(m.creatorContractSignature && m.creatorContractSignature.signatureDataUrl);
  if(alreadySigned){
    showSignedConfirmation({
      ref: (m.creatorContractSignature.ref || creatorId).toUpperCase(),
      creatorName: m.name, agencyName: 'Honeymoon', repName: m.name,
      signatureDataUrl: m.creatorContractSignature.signatureDataUrl,
      date: m.creatorContractSignature.signedAt && m.creatorContractSignature.signedAt.toDate
        ? m.creatorContractSignature.signedAt.toDate() : new Date()
    });
    return;
  }
  const body = document.getElementById('sign-body');
  const contractText = (CREATOR_CONTRACT_TEXT[LANG] || CREATOR_CONTRACT_TEXT.en);
  body.innerHTML = `
    <h3>${t('creatorContractBtn')} — ${escText(m.name) || t('nameUndefined')}</h3>
    <div class="creator-contract-text">${escText(contractText).replace(/\n/g, '<br>')}</div>
    <label>${t('creatorContractNameLabel')}</label>
    <input id="creator-sign-name" value="${escText(m.name)}" readonly style="opacity:.7;">
    <label>${t('signDrawLabel')}</label>
    <div class="sig-canvas-wrap"><canvas id="creator-sig-canvas"></canvas></div>
    <button class="btn btn-ghost btn-sm sig-clear-btn" id="creator-sig-clear">${t('signClearBtn')}</button>
    <label style="display:flex;align-items:flex-start;gap:8px;margin-top:16px;text-transform:none;font-weight:400;">
      <input type="checkbox" id="creator-sign-consent" style="width:auto;margin-top:3px;">
      <span style="font-size:11.5px;color:var(--text-muted);line-height:1.5;">${t('creatorContractConsent')}</span>
    </label>
    <div class="modal-actions">
      <button class="btn btn-ghost btn-sm" id="creator-sign-cancel" style="flex:1;">${t('cancel')}</button>
      <button class="btn btn-primary btn-sm" id="creator-sign-confirm" style="flex:1;">${t('signConfirmBtn')}</button>
    </div>
  `;

  const canvas = document.getElementById('creator-sig-canvas');
  const ctx = canvas.getContext('2d');
  function fitCanvas(){
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111';
  }
  fitCanvas();
  let drawing = false, hasSignature = false;
  function pos(e){
    const rect = canvas.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    return { x: cx, y: cy };
  }
  function start(e){ drawing = true; hasSignature = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); }
  function move(e){ if(!drawing) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); }
  function end(){ drawing = false; }
  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);

  document.getElementById('creator-sig-clear').onclick = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasSignature = false;
  };
  document.getElementById('creator-sign-cancel').onclick = closeSignModal;
  document.getElementById('creator-sign-confirm').onclick = async () => {
    const consent = document.getElementById('creator-sign-consent').checked;
    if(!hasSignature){ toast(t('signMissingSignature')); return; }
    if(!consent){ toast(t('signMissingConsent')); return; }
    const btn = document.getElementById('creator-sign-confirm');
    btn.disabled = true;
    try{
      if(auth && !auth.currentUser){ try{ await auth.signInAnonymously(); }catch(e){} }
      const signatureDataUrl = canvas.toDataURL('image/png');
      const ref = m.id.toUpperCase() + '-' + Date.now().toString().slice(-5);
      const signedAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('profiles').doc(m.id).set({
        creatorContractSignature: { signatureDataUrl, signedAt, ref }
      }, { merge: true });
      m.creatorContractSignature = { signatureDataUrl, signedAt: new Date(), ref };
      closeSignModal();
      renderRoster();
      showSignedConfirmation({
        ref, creatorName: m.name, agencyName: 'Honeymoon', repName: m.name,
        signatureDataUrl, date: new Date()
      });
    }catch(e){
      console.error('creator contract signature error', e);
      toast((LANG==='fr' ? 'Erreur : ' : 'Error: ') + (e && e.message ? e.message : e));
    }
    btn.disabled = false;
  };

  document.getElementById('sign-backdrop').classList.add('open');
  document.getElementById('sign-modal').classList.add('open');
}

function openContractSignModal(m, presetType){
  const body = document.getElementById('sign-body');
  const typeRowHtml = presetType ? '' : `
    <label>${t('signContractType')}</label>
    <select id="sign-contract-type">
      <option value="agency">${t('signTypeAgency')}</option>
      <option value="partner_site">${t('signTypePartnerSite')}</option>
      <option value="other">${t('signTypeOther')}</option>
    </select>`;
  const typeTitleKey = presetType === 'partner_site' ? 'signTypePartnerSite' : presetType === 'other' ? 'signTypeOther' : presetType === 'agency' ? 'signTypeAgency' : null;
  body.innerHTML = `
    <h3>${t('signContractBtn')} — ${escText(m.name) || t('nameUndefined')}${typeTitleKey ? ' · ' + t(typeTitleKey) : ''}</h3>
    <p style="color:var(--text-muted);font-size:12px;line-height:1.6;margin-bottom:14px;">${t('signContractExplain')}</p>
    ${typeRowHtml}
    <div id="sign-contract-text-box" class="creator-contract-text" style="margin-top:14px;"></div>
    <textarea id="sign-contract-custom-text" class="creator-contract-text" rows="8" style="display:none;width:100%;margin-top:14px;" placeholder="${t('signCustomTextPh')}"></textarea>
    <label id="sign-agency-name-label" style="margin-top:16px;">${t('signAgencyName')}</label>
    <input id="sign-agency-name">
    <label>${t('signRepName')}</label>
    <input id="sign-rep-name">
    <label>${t('signDrawLabel')}</label>
    <div class="sig-canvas-wrap"><canvas id="sig-canvas"></canvas></div>
    <button class="btn btn-ghost btn-sm sig-clear-btn" id="sig-clear">${t('signClearBtn')}</button>
    <label style="display:flex;align-items:flex-start;gap:8px;margin-top:16px;text-transform:none;font-weight:400;">
      <input type="checkbox" id="sign-consent" style="width:auto;margin-top:3px;">
      <span style="font-size:11.5px;color:var(--text-muted);line-height:1.5;">${t('signConsentText')}</span>
    </label>
    <div class="modal-actions">
      <button class="btn btn-ghost btn-sm" id="sign-cancel" style="flex:1;">${t('cancel')}</button>
      <button class="btn btn-primary btn-sm" id="sign-confirm" style="flex:1;">${t('signConfirmBtn')}</button>
    </div>
  `;
  function updateContractDisplay(type){
    const box = document.getElementById('sign-contract-text-box');
    const custom = document.getElementById('sign-contract-custom-text');
    if(type === 'other'){
      box.style.display = 'none';
      custom.style.display = 'block';
    } else {
      box.style.display = 'block';
      custom.style.display = 'none';
      const src = type === 'partner_site' ? PARTNER_SITE_CONTRACT_TEXT : AGENCY_CONTRACT_TEXT;
      box.textContent = (src[LANG] || src.en);
    }
  }
  const initialType = presetType || 'agency';
  updateContractDisplay(initialType);
  const nameLabel = document.getElementById('sign-agency-name-label');
  nameLabel.textContent = initialType === 'partner_site' ? t('signPartnerSiteNameLabel')
    : initialType === 'other' ? t('signOtherNameLabel') : t('signAgencyName');
  if(!presetType){
    document.getElementById('sign-contract-type').onchange = (e) => {
      const label = document.getElementById('sign-agency-name-label');
      label.textContent = e.target.value === 'partner_site' ? t('signPartnerSiteNameLabel')
        : e.target.value === 'other' ? t('signOtherNameLabel') : t('signAgencyName');
      updateContractDisplay(e.target.value);
    };
  }

  const canvas = document.getElementById('sig-canvas');
  const ctx = canvas.getContext('2d');
  function fitCanvas(){
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111';
  }
  fitCanvas();
  let drawing = false, hasSignature = false;
  function pos(e){
    const rect = canvas.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    return { x: cx, y: cy };
  }
  function start(e){ drawing = true; hasSignature = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); }
  function move(e){ if(!drawing) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); }
  function end(){ drawing = false; }
  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);

  document.getElementById('sig-clear').onclick = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasSignature = false;
  };
  document.getElementById('sign-cancel').onclick = closeSignModal;
  document.getElementById('sign-confirm').onclick = async () => {
    const agencyName = document.getElementById('sign-agency-name').value.trim();
    const repName = document.getElementById('sign-rep-name').value.trim();
    const consent = document.getElementById('sign-consent').checked;
    const contractType = presetType || document.getElementById('sign-contract-type').value;
    const customText = document.getElementById('sign-contract-custom-text').value.trim();
    if(!agencyName || !repName){ toast(t('signMissingFields')); return; }
    if(!hasSignature){ toast(t('signMissingSignature')); return; }
    if(!consent){ toast(t('signMissingConsent')); return; }
    const btn = document.getElementById('sign-confirm');
    btn.disabled = true;
    try{
      if(auth && !auth.currentUser){ try{ await auth.signInAnonymously(); }catch(e){} }
      const signatureDataUrl = canvas.toDataURL('image/png');
      const docRef = await db.collection('profiles').doc(m.id).collection('contract_signatures').add({
        agencyName: agencyName.slice(0, 80), repName: repName.slice(0, 80), contractType,
        customText: contractType === 'other' ? customText.slice(0, 4000) : '',
        signatureDataUrl, signedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      closeSignModal();
      showSignedConfirmation({
        ref: docRef.id.slice(-6).toUpperCase(), creatorName: m.name, agencyName, repName, contractType,
        signatureDataUrl, date: new Date()
      });
    }catch(e){
      console.error('contract signature error', e);
      toast((LANG==='fr' ? 'Erreur : ' : 'Error: ') + (e && e.message ? e.message : e));
    }
    btn.disabled = false;
  };

  document.getElementById('sign-backdrop').classList.add('open');
  document.getElementById('sign-modal').classList.add('open');
}
function closeSignModal(){
  document.getElementById('sign-backdrop').classList.remove('open');
  document.getElementById('sign-modal').classList.remove('open');
}
document.getElementById('sign-backdrop').onclick = closeSignModal;

function showSignedConfirmation(o){
  const num = 'HM-SIGN-' + o.date.getFullYear() + '-' + o.ref;
  document.getElementById('invoice-body').innerHTML = `
    <div class="invoice-paper">
      <h2>Honeymoon</h2>
      <div class="inv-meta">${t('signCertTitle')} ${num} — ${formatCommentDate(o.date)}</div>
      <table>
        <tr><td>${t('creatorLink')}</td><td style="text-align:right;">${escText(o.creatorName)}</td></tr>
        <tr><td>${t('signAgencyName')}</td><td style="text-align:right;">${escText(o.agencyName)}</td></tr>
        <tr><td>${t('signRepName')}</td><td style="text-align:right;">${escText(o.repName)}</td></tr>
      </table>
      <p style="font-size:11px;color:#666;margin:10px 0 4px;">${t('signSignatureLabel')}</p>
      <img src="${o.signatureDataUrl}" style="max-width:100%;border:1px solid #eee;border-radius:6px;" loading="lazy" decoding="async">
    </div>
  `;
  document.getElementById('invoice-backdrop').classList.add('open');
  document.getElementById('invoice-modal').classList.add('open');
  toast(t('signSavedToast'));
}

/* ================= PANNEAU ADMIN : CONTRATS SIGNÉS ================= */
async function openAgencyContractsForCreator(creatorId, filterType){
  const m = roster.find(x => x.id === creatorId);
  if(!m) return;
  const typeLabelKey = filterType === 'partner_site' ? 'signTypePartnerSite' : filterType === 'other' ? 'signTypeOther' : filterType === 'agency' ? 'signTypeAgency' : null;
  document.getElementById('t-contracts-title').textContent = `${t('agencyContractBtn')} — ${escText(m.name) || t('nameUndefined')}${typeLabelKey ? ' · ' + t(typeLabelKey) : ''}`;
  document.getElementById('contracts-backdrop').classList.add('open');
  document.getElementById('contracts-modal').classList.add('open');
  const body = document.getElementById('contracts-body');
  body.innerHTML = `<span class="gallery-empty">${t('paidOrdersLoading')}</span>`;
  try{
    const snap = await db.collection('profiles').doc(m.id).collection('contract_signatures').orderBy('signedAt', 'desc').get();
    let all = [];
    snap.forEach(d => all.push({ id: d.id, ...d.data() }));
    if(filterType) all = all.filter(o => (o.contractType || 'agency') === filterType);
    if(!all.length){
      body.innerHTML = `
        <span class="gallery-empty">${t('signNoContracts')}</span>
        <button class="btn btn-primary btn-sm" id="contracts-sign-new" style="width:100%;margin-top:14px;">${ICON_SIGN} ${t('signContractBtn')}</button>`;
      document.getElementById('contracts-sign-new').onclick = () => {
        document.getElementById('contracts-backdrop').classList.remove('open');
        document.getElementById('contracts-modal').classList.remove('open');
        openContractSignModal(m, filterType);
      };
      return;
    }
    body.innerHTML = all.map(o => `
      <div class="sale-order-row">
        <div class="sale-order-head">
          <span><b>${escText(o.agencyName)}</b></span>
          <span class="mono" style="color:var(--text-muted);">${formatCommentDate(o.signedAt)}</span>
        </div>
        <div style="font-size:12px;color:var(--text-muted);">${escText(o.repName)}</div>
        <button class="btn btn-ghost btn-sm" data-id="${o.id}">${t('signViewBtn')}</button>
      </div>`).join('') + `
      <button class="btn btn-primary btn-sm" id="contracts-sign-new" style="width:100%;margin-top:14px;">${ICON_SIGN} ${t('signContractBtn')}</button>`;
    body.querySelectorAll('button[data-id]').forEach((btn, idx) => {
      btn.onclick = () => {
        const o = all[idx];
        showSignedConfirmation({
          ref: o.id.slice(-6).toUpperCase(), creatorName: m.name, agencyName: o.agencyName,
          repName: o.repName, signatureDataUrl: o.signatureDataUrl,
          date: (o.signedAt && o.signedAt.toDate) ? o.signedAt.toDate() : new Date()
        });
      };
    });
    document.getElementById('contracts-sign-new').onclick = () => {
      document.getElementById('contracts-backdrop').classList.remove('open');
      document.getElementById('contracts-modal').classList.remove('open');
      openContractSignModal(m, filterType);
    };
  }catch(e){
    console.error('agency contracts error', e);
    body.innerHTML = `<span class="gallery-empty">${(LANG==='fr'?'Erreur : ':'Error: ')}${escText(e.message||String(e))}</span>`;
  }
}
document.getElementById('contracts-close').onclick = () => {
  document.getElementById('contracts-backdrop').classList.remove('open');
  document.getElementById('contracts-modal').classList.remove('open');
};
document.getElementById('contracts-backdrop').onclick = () => document.getElementById('contracts-close').click();

async function loadComments(profileId, creatorName){
  const list = document.getElementById('comment-list');
  if(!db || !list) return;
  try{
    const snap = await db.collection('profiles').doc(profileId).collection('comments')
      .orderBy('createdAt', 'desc').limit(50).get();
    if(snap.empty){
      list.innerHTML = `<span class="gallery-empty">${t('commentEmpty')}</span>`;
      return;
    }
    list.innerHTML = snap.docs.map(d => {
      const c = d.data();
      const name = escText(c.name || '—');
      const text = c.text || '';
      const likedBy = c.likedBy || [];
      const isLiked = likedBy.includes(memberLikeKey());
      const badgeHtml = c.isMember ? `<span class="comment-member-badge">${uxdShieldHtml(c.memberUxd)}</span>` : '';
      return `
        <div class="comment-card">
          <div class="comment-avatar">${escText(initials(c.name))}</div>
          <div class="comment-body">
            <div class="comment-head"><span class="comment-name">${name}${badgeHtml}</span><span class="comment-date">${formatCommentDate(c.createdAt)}</span></div>
            <div class="comment-text">${escText(text)}</div>
            <div style="display:flex;align-items:center;gap:14px;margin-top:6px;">
              <button type="button" class="comment-reply-btn" data-name="${escAttr(c.name || '')}">${t('commentReplyBtn')}</button>
              <button type="button" class="comment-like-btn ${isLiked ? 'liked' : ''}" data-docid="${d.id}" data-profile="${profileId}">${ICON_HEART_SM} ${likedBy.length > 0 ? likedBy.length : ''}</button>
            </div>
          </div>
        </div>`;
    }).join('');
    list.querySelectorAll('.comment-like-btn').forEach(btn => {
      btn.onclick = () => toggleCommentLike(btn.dataset.profile, btn.dataset.docid);
    });
    list.querySelectorAll('.comment-reply-btn').forEach(btn => {
      btn.onclick = () => {
        const input = document.getElementById('comment-input');
        if(input){ input.value = '@' + btn.dataset.name + ' '; input.focus(); }
      };
    });
  }catch(e){
    console.error('load comments error', e);
    list.innerHTML = `<span class="gallery-empty">${(LANG==='fr' ? 'Erreur de chargement : ' : 'Load error: ')}${escText(e && e.message ? e.message : String(e))}</span>`;
  }
}

function memberLikeKey(){
  if(memberAuth && memberAuth.currentUser) return 'u_' + memberAuth.currentUser.uid;
  try{
    let k = localStorage.getItem('hm_like_key');
    if(!k){ k = 'g_' + Math.random().toString(36).slice(2); localStorage.setItem('hm_like_key', k); }
    return k;
  }catch(e){ return 'g_anon'; }
}
async function toggleCommentLike(profileId, docId){
  if(!db) return;
  const ref = db.collection('profiles').doc(profileId).collection('comments').doc(docId);
  const key = memberLikeKey();
  try{
    if(auth && !auth.currentUser){ try{ await auth.signInAnonymously(); }catch(e){} }
    const doc = await ref.get();
    const likedBy = (doc.exists && doc.data().likedBy) || [];
    const isLiked = likedBy.includes(key);
    await ref.set({
      likedBy: isLiked ? firebase.firestore.FieldValue.arrayRemove(key) : firebase.firestore.FieldValue.arrayUnion(key)
    }, { merge: true });
    loadComments(profileId);
  }catch(e){ console.error('toggleCommentLike error', e); }
}

/* ---------------- favoris et commentaires par photo/vidéo (galerie gratuite uniquement) ---------------- */
async function toggleMediaFavorite(profileId, docId, btn){
  if(!db) return;
  const key = 'hm_mfav_' + docId;
  const isFav = localStorage.getItem(key) === '1';
  const ref = db.collection('profiles').doc(profileId).collection('media').doc(docId);
  try{
    if(auth && !auth.currentUser){ try{ await auth.signInAnonymously(); }catch(e){} }
    await ref.set({ favorites: firebase.firestore.FieldValue.increment(isFav ? -1 : 1) }, { merge: true });
    localStorage.setItem(key, isFav ? '0' : '1');
    btn.classList.toggle('active', !isFav);
    const countEl = btn.querySelector('span:last-child');
    const current = parseInt(countEl.textContent, 10) || 0;
    countEl.textContent = Math.max(0, current + (isFav ? -1 : 1));
  }catch(e){ console.error('toggleMediaFavorite error', e); }
}

let currentMediaCommentCtx = null;
async function openMediaComments(profileId, docId, mediaType){
  currentMediaCommentCtx = { profileId, docId, mediaType };
  document.getElementById('media-comments-name').value = '';
  document.getElementById('media-comments-input').value = '';
  document.getElementById('media-comments-backdrop').classList.add('open');
  document.getElementById('media-comments-modal').classList.add('open');
  await loadMediaComments();
}
async function loadMediaComments(){
  const ctx = currentMediaCommentCtx;
  const list = document.getElementById('media-comments-list');
  if(!ctx || !db || !list) return;
  list.innerHTML = `<span class="gallery-empty">${t('chatLoading')}</span>`;
  try{
    const snap = await db.collection('profiles').doc(ctx.profileId).collection('media').doc(ctx.docId).collection('comments')
      .orderBy('createdAt', 'desc').limit(50).get();
    if(snap.empty){
      list.innerHTML = `<span class="gallery-empty">${t('commentEmpty')}</span>`;
      return;
    }
    list.innerHTML = snap.docs.map(d => {
      const c = d.data();
      const likedBy = c.likedBy || [];
      const isLiked = likedBy.includes(memberLikeKey());
      return `
        <div class="comment-card">
          <div class="comment-avatar">${escText(initials(c.name))}</div>
          <div class="comment-body">
            <div class="comment-head"><span class="comment-name">${escText(c.name || '—')}</span><span class="comment-date">${formatCommentDate(c.createdAt)}</span></div>
            <div class="comment-text">${escText(c.text || '')}</div>
            <div style="display:flex;align-items:center;gap:14px;margin-top:4px;">
              <button type="button" class="comment-reply-btn" data-name="${escAttr(c.name || '')}">${t('commentReplyBtn')}</button>
              <button type="button" class="comment-like-btn ${isLiked ? 'liked' : ''}" data-docid="${d.id}">${ICON_THUMBSUP} ${likedBy.length > 0 ? likedBy.length : ''}</button>
              <button type="button" class="comment-dislike-icon">${ICON_FROWN}</button>
              <button type="button" class="comment-report-btn media-comment-report-btn" data-docid="${d.id}" data-text="${escAttr(c.text || '')}">🚩</button>
            </div>
          </div>
        </div>`;
    }).join('');
    list.querySelectorAll('.comment-like-btn').forEach(btn => {
      btn.onclick = () => toggleMediaCommentLike(btn.dataset.docid);
    });
    list.querySelectorAll('.comment-reply-btn').forEach(btn => {
      btn.onclick = () => {
        const input = document.getElementById('media-comments-input');
        input.value = '@' + btn.dataset.name + ' ';
        input.focus();
      };
    });
    list.querySelectorAll('.media-comment-report-btn').forEach(btn => {
      btn.onclick = () => openReportModal({ profile: ctx.profileId, details: t('reportPrefillMediaComment') + ' : ' + btn.dataset.text.slice(0, 120) });
    });
  }catch(e){
    console.error('loadMediaComments error', e);
    list.innerHTML = `<span class="gallery-empty">${(LANG==='fr' ? 'Erreur : ' : 'Error: ')}${escText(e.message || String(e))}</span>`;
  }
}
async function toggleMediaCommentLike(commentDocId){
  const ctx = currentMediaCommentCtx;
  if(!ctx || !db) return;
  const ref = db.collection('profiles').doc(ctx.profileId).collection('media').doc(ctx.docId).collection('comments').doc(commentDocId);
  const key = memberLikeKey();
  try{
    if(auth && !auth.currentUser){ try{ await auth.signInAnonymously(); }catch(e){} }
    const doc = await ref.get();
    const likedBy = (doc.exists && doc.data().likedBy) || [];
    const isLiked = likedBy.includes(key);
    await ref.set({
      likedBy: isLiked ? firebase.firestore.FieldValue.arrayRemove(key) : firebase.firestore.FieldValue.arrayUnion(key)
    }, { merge: true });
    loadMediaComments();
  }catch(e){ console.error('toggleMediaCommentLike error', e); }
}
async function submitMediaComment(){
  const ctx = currentMediaCommentCtx;
  if(!ctx) return;
  const nameInput = document.getElementById('media-comments-name');
  const input = document.getElementById('media-comments-input');
  const name = nameInput.value.trim();
  const text = input.value.trim();
  if(!name){ toast(t('commentNameRequired')); nameInput.focus(); return; }
  if(!text) return;
  if(containsBannedWords(name) || containsBannedWords(text)){
    toast(t('commentModerationError'));
    return;
  }
  const btn = document.getElementById('media-comments-submit');
  btn.disabled = true;
  try{
    if(auth && !auth.currentUser){ try{ await auth.signInAnonymously(); }catch(e){} }
    const mediaRef = db.collection('profiles').doc(ctx.profileId).collection('media').doc(ctx.docId);
    await mediaRef.collection('comments').add({
      name: name.slice(0, 30), text: text.slice(0, 500),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await mediaRef.set({ commentsCount: firebase.firestore.FieldValue.increment(1) }, { merge: true });
    input.value = '';
    toast(t('commentPosted'));
    loadMediaComments();
    const countBtn = document.querySelector(`.media-comment-btn[data-docid="${ctx.docId}"] span:last-child`);
    if(countBtn) countBtn.textContent = (parseInt(countBtn.textContent, 10) || 0) + 1;
  }catch(e){
    console.error('submitMediaComment error', e);
    toast((LANG==='fr' ? 'Erreur : ' : 'Error: ') + (e && e.message ? e.message : e));
  }
  btn.disabled = false;
}
document.getElementById('media-comments-submit').onclick = submitMediaComment;
document.getElementById('media-comments-close').onclick = () => {
  document.getElementById('media-comments-backdrop').classList.remove('open');
  document.getElementById('media-comments-modal').classList.remove('open');
};
document.getElementById('media-comments-backdrop').onclick = () => document.getElementById('media-comments-close').click();

async function submitComment(profileId){
  const nameInput = document.getElementById('comment-name');
  const input = document.getElementById('comment-input');
  const modeSel = document.getElementById('comment-name-mode');
  const name = nameInput.value.trim();
  const text = input.value.trim();
  if(!name){ toast(t('commentNameRequired')); nameInput.focus(); return; }
  if(!text) return;
  if(containsBannedWords(name) || containsBannedWords(text)){
    toast(t('commentModerationError'));
    return;
  }
  const btn = document.getElementById('comment-submit');
  btn.disabled = true;
  try{
    if(!db) throw new Error('Firestore indisponible');
    if(auth && !auth.currentUser){ try{ await auth.signInAnonymously(); }catch(e){} }
    // Badge "membre" affiché à côté du nom dans la liste : uniquement quand l'auteur
    // a choisi de commenter avec son pseudo de membre connecté (mode "member"),
    // jamais en anonyme / visiteur / pseudo libre — ces derniers restent de simples
    // invités, sans badge, comme demandé.
    let commentExtra = {};
    if(modeSel && modeSel.value === 'member' && memberAuth && memberAuth.currentUser){
      try{
        const memberSnap = await memberDb.collection('members').doc(memberAuth.currentUser.uid).get();
        const uxd = (memberSnap.exists && memberSnap.data().uxd) || 0;
        commentExtra = { isMember: true, memberUxd: uxd };
      }catch(e){ /* pas bloquant : le commentaire part quand même, juste sans badge */ }
    }
    await db.collection('profiles').doc(profileId).collection('comments').add({
      name: name.slice(0, 30),
      text: text.slice(0, 500),
      ...commentExtra,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    input.value = '';
    toast(t('commentPosted'));
    loadComments(profileId);
  }catch(e){
    console.error('comment post error', e);
    toast((LANG==='fr' ? 'Erreur : ' : 'Error: ') + (e && e.message ? e.message : e));
  }
  btn.disabled = false;
}
