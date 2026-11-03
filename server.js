// Photomaton Partagé — serveur autonome (Express + Multer + Nodemailer).
// Reçoit une photo, la stocke sur disque, l'envoie par mail, et sert une
// petite galerie. Conçu pour tourner sur Render (ou tout hébergeur Node).

const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// --- Configuration (variables d'environnement, à définir sur Render) ---
const EMAIL_TO = process.env.EMAIL_TO || 'geoffroytognizin14@gmail.com';
const GMAIL_USER = process.env.GMAIL_USER || '';
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || '';
const EMAIL_ENABLED = !!(GMAIL_USER && GMAIL_APP_PASSWORD);

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

let transporter = null;
if (EMAIL_ENABLED) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
} else {
  console.warn('[avertissement] GMAIL_USER / GMAIL_APP_PASSWORD absents : envoi mail désactivé.');
}

// --- Stockage des photos ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 Mo max par photo
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Seules les images sont acceptées'));
  },
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// --- Réception d'une photo : stockage + envoi mail automatique ---
app.post('/upload', upload.single('photo'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: 'Aucune photo reçue' });
  }

  const photoUrl = `/uploads/${req.file.filename}`;
  let emailSent = false;
  let emailError = null;

  if (EMAIL_ENABLED) {
    try {
      await transporter.sendMail({
        from: GMAIL_USER,
        to: EMAIL_TO,
        subject: 'Photomaton Partagé — nouvelle photo',
        text: 'Une nouvelle photo a été prise et envoyée automatiquement.',
        attachments: [{ filename: req.file.filename, path: req.file.path }],
      });
      emailSent = true;
    } catch (err) {
      emailError = err.message;
      console.error('Échec envoi mail :', err.message);
    }
  }

  res.json({
    ok: true,
    filename: req.file.filename,
    url: photoUrl,
    emailSent,
    emailError,
  });
});

// --- Liste des photos déjà reçues (pour la galerie) ---
app.get('/api/photos', (req, res) => {
  fs.readdir(UPLOAD_DIR, (err, files) => {
    if (err) return res.status(500).json({ ok: false, error: 'Lecture impossible' });
    const list = files
      .filter((f) => !f.startsWith('.'))
      .sort()
      .reverse()
      .map((f) => `/uploads/${f}`);
    res.json(list);
  });
});

// --- État du serveur (utile pour vérifier la config après déploiement) ---
app.get('/api/status', (req, res) => {
  res.json({
    ok: true,
    emailEnabled: EMAIL_ENABLED,
    emailTo: EMAIL_TO,
  });
});

app.listen(PORT, () => {
  console.log(`Photomaton Partagé lancé sur le port ${PORT}`);
  console.log(`Envoi mail : ${EMAIL_ENABLED ? 'activé vers ' + EMAIL_TO : 'désactivé (variables manquantes)'}`);
});
