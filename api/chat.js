// ================================================================
// HOW TO SET THIS UP (one time only):
//
// 1. Go to your Vercel project → Settings → Environment Variables
//    Add these 3 variables:
//
//    GMAIL_USER     → the Gmail address sending the emails (yours)
//    GMAIL_PASS     → a Gmail App Password (NOT your regular password)
//    NVIDIA_API_KEY → your Nvidia API key (already have this)
//
// 2. To get a Gmail App Password:
//    → Go to myaccount.google.com
//    → Security → 2-Step Verification (turn it on if not already)
//    → Then go to: myaccount.google.com/apppasswords
//    → App name: "Web Insider Bot" → click Create
//    → Copy the 16-character password → paste into GMAIL_PASS in Vercel
//
// 3. Deploy — done. No Zapier. No monthly fee. Emails send directly.
// ================================================================

// ================================================================
// CLIENT CONFIG — change these per client deployment
// Just update OWNER_EMAIL to whoever should receive the leads.
// SENDER_EMAIL should stay as YOUR gmail (the one with app password).
// ================================================================
const CLIENT_CONFIG = {
  OWNER_EMAIL:  "clientowner@gmail.com",   // ← WHO RECEIVES THE LEAD EMAIL
  SENDER_EMAIL: process.env.GMAIL_USER,    // ← YOUR gmail (set in Vercel env vars)
  BUSINESS_NAME: "Your Business",          // ← Shown in email subject line
};

export const config = {
  runtime: "nodejs", // Must be nodejs (not edge) to use nodemailer
  maxDuration: 60,
};

import nodemailer from "nodemailer";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { messages, sheetData, systemContext, leadData } = req.body;

    const allText  = messages.map(m => m.content).join(" ");
    const userText = messages.filter(m => m.role === "user").map(m => m.content).join(" ");

    // ── 1. LEAD DETECTION ────────────────────────────────────────
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const phonePattern = /\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}/;
    const rawName      = userText.match(/\b([a-zA-Z]{2,20})\s+([a-zA-Z]{2,20})\b/);
    const nameMatch    = rawName
      ? [rawName[0].split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ")]
      : null;

    const hasEmail    = emailPattern.test(allText);
    const hasPhone    = phonePattern.test(allText);
    const hasFullName = nameMatch !== null;

    // Service detection
    const serviceKeywords = [
      "haircut","fade","beard","trim","color","blowout","nails","lashes",
      "wax","facial","massage","cleaning","plumbing","hvac","website",
      "design","consult","booking","appointment","repair","install",
      "landscaping","detailing","painting","electrical","catering"
    ];
    const foundService = serviceKeywords.find(k => userText.toLowerCase().includes(k));

    // ── 2. SEND EMAIL DIRECTLY VIA GMAIL ─────────────────────────
    // Fires when all 4 fields are present AND the frontend hasn't
    // already sent it (leadData.alreadySent flag from frontend)
    const isLeadComplete = hasEmail && hasPhone && hasFullName && foundService;
    const alreadySent    = leadData?.alreadySent === true;

    if (isLeadComplete && !alreadySent) {
      const transcript = messages
        .map(m => `${m.role === "user" ? "Customer" : "AI"}: ${m.content}`)
        .join("\n");

      const name    = nameMatch?.[0]   || "Unknown";
      const email   = allText.match(emailPattern)?.[0] || "N/A";
      const phone   = allText.match(phonePattern)?.[0] || "N/A";
      const service = foundService || "General Inquiry";

      // Send the email — non-blocking so AI response isn't delayed
      sendLeadEmail({ name, email, phone, service, transcript }).catch(
        err => console.error("Email send failed:", err)
      );
    }

    // ── 3. SYSTEM PROMPT ─────────────────────────────────────────
    const finalSystemPrompt = systemContext || `
You are a helpful, friendly AI assistant for this business.
Always finish your sentences completely. Never cut off mid-thought.

BUSINESS INFO:
${sheetData || "No business data available."}

RULES:
1. Get their name first.
2. Find out what service they need before asking for contact info.
3. Collect in order: Name → Service → Email → Phone.
4. Never ask for something already given.
5. Keep replies to 2-4 complete sentences.
6. Always end with a question or clear next step.
7. When you have all 4, confirm and say the team will be in touch.
    `.trim();

    // ── 4. NVIDIA / LLAMA API ────────────────────────────────────
    const nvidiaRes = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        model:       "meta/llama-3.1-70b-instruct",
        max_tokens:  350,
        temperature: 0.7,
        stream:      true,
        messages: [
          { role: "system", content: finalSystemPrompt },
          ...messages.map(m => ({ role: m.role, content: m.content })),
        ],
      }),
    });

    if (!nvidiaRes.ok) {
      const err = await nvidiaRes.text();
      return res.status(nvidiaRes.status).send("NVIDIA Error: " + err);
    }

    // ── 5. STREAM BUFFER ─────────────────────────────────────────
    res.setHeader("Content-Type",  "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection",    "keep-alive");

    const decoder = new TextDecoder();
    let buffer    = "";

    for await (const chunk of nvidiaRes.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim().startsWith("data: ")) continue;
        const raw = line.trim().slice(6);
        if (!raw || raw === "[DONE]") continue;
        try {
          const parsed  = JSON.parse(raw);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            const out = { choices: [{ delta: { content } }] };
            res.write(`data: ${JSON.stringify(out)}\n\n`);
          }
        } catch (_) {}
      }
    }

    // Flush remainder
    if (buffer.trim().startsWith("data: ")) {
      try {
        const raw     = buffer.trim().slice(6);
        const parsed  = JSON.parse(raw);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
        }
      } catch (_) {}
    }

    res.end();

  } catch (err) {
    console.error("Handler error:", err);
    res.status(500).json({ error: err.message });
  }
}


// ================================================================
// EMAIL SENDER — uses Gmail SMTP directly via nodemailer
// No Zapier. No third-party service. Just your Gmail account.
//
// TO CHANGE WHO GETS THE EMAIL:
// Update CLIENT_CONFIG.OWNER_EMAIL at the top of this file.
// That's the only line you change per client.
// ================================================================
async function sendLeadEmail({ name, email, phone, service, transcript }) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER, // Your Gmail (set in Vercel env vars)
      pass: process.env.GMAIL_PASS, // Your Gmail App Password (not regular password)
    },
  });

  const mailOptions = {
    from:    `"Web Insider Bot" <${process.env.GMAIL_USER}>`,
    to:      CLIENT_CONFIG.OWNER_EMAIL,   // ← owner receives this
    replyTo: email,                        // ← reply goes straight to the customer
    subject: `New Lead: ${name} wants ${service} — ${CLIENT_CONFIG.BUSINESS_NAME}`,
    text: `
NEW LEAD FROM YOUR WEBSITE
==========================

Name    : ${name}
Service : ${service}
Email   : ${email}
Phone   : ${phone}
Time    : ${new Date().toLocaleString()}

Hit reply to contact this customer directly about: ${service}

━━━ Full Conversation ━━━
${transcript}
    `.trim(),

    // HTML version — looks clean in Gmail
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#000;padding:20px;border-radius:8px 8px 0 0;">
          <h2 style="color:#fff;margin:0;font-size:20px;">🔥 New Lead from Your Website</h2>
        </div>
        <div style="background:#f9f9f9;padding:24px;border:1px solid #eee;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;color:#666;width:100px;">Name</td><td style="padding:8px 0;font-weight:bold;">${name}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Service</td><td style="padding:8px 0;font-weight:bold;color:#e00;">${service}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Email</td><td style="padding:8px 0;"><a href="mailto:${email}" style="color:#000;">${email}</a></td></tr>
            <tr><td style="padding:8px 0;color:#666;">Phone</td><td style="padding:8px 0;"><a href="tel:${phone}" style="color:#000;">${phone}</a></td></tr>
            <tr><td style="padding:8px 0;color:#666;">Time</td><td style="padding:8px 0;">${new Date().toLocaleString()}</td></tr>
          </table>
          <div style="margin-top:20px;padding:16px;background:#fff;border-left:4px solid #000;border-radius:4px;">
            <p style="margin:0;color:#666;font-size:13px;">Hit reply to contact this customer directly about: <strong>${service}</strong></p>
          </div>
        </div>
        <div style="background:#f0f0f0;padding:16px;border-radius:0 0 8px 8px;">
          <p style="margin:0;font-size:12px;color:#999;">Full conversation transcript:</p>
          <pre style="font-size:12px;color:#555;white-space:pre-wrap;margin:8px 0 0;">${transcript}</pre>
        </div>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
  console.log(`✅ Lead email sent to ${CLIENT_CONFIG.OWNER_EMAIL} for ${name}`);
}
