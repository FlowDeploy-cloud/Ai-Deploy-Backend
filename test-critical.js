const https = require("https");

const WEBHOOK_URL = "https://builddd.app.n8n.cloud/webhook/critical-alert";
const WEBHOOK_SECRET = "my_super_secret_2026_alert_key";

// ✅ Normalize + validate E.164
function normalizeE164(input) {
  const raw = String(input || "")
    .trim()
    .replace(/^whatsapp:/i, "")
    .replace(/[^\d+]/g, "");

  if (!raw.startsWith("+")) {
    throw new Error("Phone must start with + and country code");
  }

  if (!/^\+[1-9]\d{7,14}$/.test(raw)) {
    throw new Error("Invalid E.164 phone format");
  }

  return raw;
}

// ✅ Convert to WhatsApp format (IMPORTANT FIX)
function toWhatsAppFormat(phone) {
  return `whatsapp:${phone}`;
}

// 👉 Your number
const phone = normalizeE164("+918789601387");
const whatsappTo = toWhatsAppFormat(phone);

// ✅ Payload
const payload = {
  event_type: "manual_test",
  severity: "critical",
  title: "Manual Critical Alert Test",
  message: "This is a test alert from Node.js script.",
  timestamp: new Date().toISOString(),

  user: {
    id: "test-user-1",
    username: "monu-test",
    email: "monu56410000@gmail.com",
  },

  channels: {
    email: {
      enabled: true,
      to: "monu56410000@gmail.com",
    },

    whatsapp: {
      enabled: true,
      provider: "twilio",
      to: whatsappTo, // ✅ FIXED HERE
    },
  },

  twilio: {
    whatsapp_from: "whatsapp:+14155238886", // Twilio sandbox number
  },

  metadata: {
    source: "nodejs-manual-test",
  },
};

// ✅ HTTP POST function
function postJson(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);

    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: "POST",
      port: 443,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
        ...headers,
      },
    };

    const req = https.request(options, (res) => {
      let out = "";

      res.on("data", (chunk) => {
        out += chunk;
      });

      res.on("end", () => {
        resolve({
          status: res.statusCode,
          body: out,
        });
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    req.write(data);
    req.end();
  });
}

// 🚀 Run
(async () => {
  try {
    console.log("📤 Sending request...");
    console.log("📱 WhatsApp TO:", whatsappTo);

    const response = await postJson(WEBHOOK_URL, payload, {
      "x-webhook-secret": WEBHOOK_SECRET,
    });

    console.log("✅ Status:", response.status);
    console.log("📩 Response:", response.body || "(empty)");
  } catch (err) {
    console.error("❌ Request failed:", err.message);
    process.exit(1);
  }
})();