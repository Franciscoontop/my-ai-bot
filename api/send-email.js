// ================================================================
// /api/send-email.js
//
// Separate route just for sending emails via Gmail.
// Uses Node.js runtime (required for nodemailer).
// Called internally by chat.js when a lead is complete.
//
// REQUIRED ENV VARS (set in Vercel → Settings → Environment Variables):
//   GMAIL_USER  → your Gmail address
//   GMAIL_PASS  → your Gmail App Password (16 chars, no spaces)
// ================================================================

export const config = {
  runtime: "nodejs", // nodemailer needs Node.js — cannot use edge
};

import nodemailer from "nodemailer";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { name, email, phone, service, business, owner, transcript } = req.body;

    // Validate we have the minimum needed to send
    if (!name || !email || !phone) {
      return res.status(400).json({ error: "Missing lead fields" });
    }

    // ── Gmail transporter ────────────────────────────────────────
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
      },
    });

    // ── Email content ────────────────────────────────────────────
    await transporter.sendMail({
      from:    `"Web Insider Bot" <${process.env.GMAIL_USER}>`,
      to:      owner,          // client business owner
      replyTo: email,          // reply goes straight to the customer
      subject: `New Lead: ${name} — ${service} — ${business}`,

      // Plain text version
      text: `
NEW LEAD FROM YOUR WEBSITE
==========================
Name    : ${name}
Service : ${service}
Email   : ${email}
Phone   : ${phone}
Time    : ${new Date().toLocaleString()}

Hit reply to contact this customer directly.

FULL CONVERSATION:
${transcript}
      `.trim(),

      // HTML version — clean formatted email
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #eee;border-radius:8px;overflow:hidden;">

          <div style="background:#000;padding:20px 24px;">
            <h2 style="color:#fff;margin:0;font-size:18px;">🔥 New Lead from Your Website</h2>
            <p style="color:#999;margin:4px 0 0;font-size:13px;">${business}</p>
          </div>

          <div style="padding:24px;background:#fff;">
            <table style="width:100%;border-collapse:collapse;font-size:15px;">
              <tr style="border-bottom:1px solid #f0f0f0;">
                <td style="padding:10px 0;color:#999;width:90px;">Name</td>
                <td style="padding:10px 0;font-weight:bold;">${name}</td>
              </tr>
              <tr style="border-bottom:1px solid #f0f0f0;">
                <td style="padding:10px 0;color:#999;">Service</td>
                <td style="padding:10px 0;font-weight:bold;color:#cc0000;">${service}</td>
              </tr>
              <tr style="border-bottom:1px solid #f0f0f0;">
                <td style="padding:10px 0;color:#999;">Email</td>
                <td style="padding:10px 0;">
                  <a href="mailto:${email}" style="color:#000;text-decoration:none;">${email}</a>
                </td>
              </tr>
              <tr style="border-bottom:1px solid #f0f0f0;">
                <td style="padding:10px 0;color:#999;">Phone</td>
                <td style="padding:10px 0;">
                  <a href="tel:${phone}" style="color:#000;text-decoration:none;">${phone}</a>
                </td>
              </tr>
              <tr>
                <td style="padding:10px 0;color:#999;">Time</td>
                <td style="padding:10px 0;">${new Date().toLocaleString()}</td>
              </tr>
            </table>

            <div style="margin-top:20px;padding:16px;background:#f9f9f9;border-left:3px solid #000;border-radius:4px;">
              <p style="margin:0;font-size:13px;color:#555;">
                Hit <strong>Reply</strong> to contact <strong>${name}</strong> directly about their <strong>${service}</strong> inquiry.
              </p>
            </div>
          </div>

          <div style="padding:16px 24px;background:#f5f5f5;border-top:1px solid #eee;">
            <p style="margin:0 0 8px;font-size:12px;color:#999;font-weight:bold;">FULL CONVERSATION</p>
            <pre style="font-size:12px;color:#555;white-space:pre-wrap;margin:0;font-family:monospace;">${transcript}</pre>
          </div>

        </div>
      `,
    });

    console.log(`✅ Lead email sent to ${owner} for ${name} (${service})`);
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("❌ Email send failed:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
