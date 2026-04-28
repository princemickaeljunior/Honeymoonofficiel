const nodemailer = require('nodemailer');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { to, subject, html } = req.body;

  const transporter = nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    }
  });

  try {
    await transporter.sendMail({
      from: `"Honeymoon" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html
    });
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
