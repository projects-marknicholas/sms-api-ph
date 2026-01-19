const express = require('express');
const axios = require('axios');
const admin = require('firebase-admin');
const crypto = require('crypto');
require('dotenv').config();

// ===============================
// FIREBASE ADMIN INIT
// ===============================
const serviceAccount = require('./firebase-admin.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// ===============================
// EXPRESS SETUP
// ===============================
const app = express();
app.use(express.json());

// ===============================
// TEXTBEE CONFIG
// ===============================
const BASE_URL = 'https://api.textbee.dev/api/v1';

// ===============================
// HELPERS
// ===============================
const generateApiKey = () => {
  return 'sk-' + crypto.randomBytes(12).toString('hex');
};

const generateUserId = () => {
  return crypto.randomBytes(10).toString('hex');
};

// 🇵🇭 Normalize & validate PH phone number
const normalizePHNumber = (phone) => {
  let cleaned = phone.replace(/\s|-/g, '');

  if (cleaned.startsWith('09')) {
    cleaned = '+63' + cleaned.slice(1);
  } else if (cleaned.startsWith('639')) {
    cleaned = '+' + cleaned;
  }

  const phRegex = /^\+639\d{9}$/;
  if (!phRegex.test(cleaned)) return null;

  return cleaned;
};

// ===============================
// SEND API KEY
// ===============================
app.post('/send/api', async (req, res) => {
  try {
    const { email, phone_number, project_name } = req.body;

    if (!email || !phone_number || !project_name) {
      return res.status(400).json({
        success: false,
        error: 'email, phone_number, and project_name are required'
      });
    }

    // 🇵🇭 Validate PH phone number
    const normalizedPhone = normalizePHNumber(phone_number);
    if (!normalizedPhone) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Philippine phone number format'
      });
    }

    // 🔍 Check duplicate email
    const emailSnap = await db
      .collection('api_keys')
      .where('email', '==', email)
      .limit(1)
      .get();

    if (!emailSnap.empty) {
      return res.status(409).json({
        success: false,
        error: 'Email already exists'
      });
    }

    // 🔍 Check duplicate phone number
    const phoneSnap = await db
      .collection('api_keys')
      .where('phone_number', '==', normalizedPhone)
      .limit(1)
      .get();

    if (!phoneSnap.empty) {
      return res.status(409).json({
        success: false,
        error: 'Phone number already exists'
      });
    }

    const api_key = generateApiKey();
    const user_id = generateUserId();
    const now = new Date().toISOString();
    const start_date = now.split('T')[0];

    // ===============================
    // SMS MESSAGE TEMPLATE
    // ===============================
    const smsMessage = `API Key Created Successfully!

Project: ${project_name}
User ID: ${user_id}
API Key: ${api_key}
Email: ${email}
Start Date: ${start_date}

Save this API key securely. You will not be able to retrieve it again.`;

    // Send SMS
    const smsResponse = await axios.post(
      `${BASE_URL}/gateway/devices/${process.env.TEXTBEE_DEVICE_ID}/send-sms`,
      {
        recipients: [normalizedPhone],
        message: smsMessage
      },
      {
        headers: {
          'x-api-key': process.env.TEXTBEE_API_KEY
        }
      }
    );

    // Save to Firestore
    const docRef = await db.collection('api_keys').add({
      api_key,
      email,
      phone_number: normalizedPhone,
      project_name,
      user_id,
      is_active: true,
      start_date,
      created_at: now,
      updated_at: now
    });

    res.json({
      success: true,
      message: 'API key generated and SMS sent',
      api_key,
      user_id,
      phone_number: normalizedPhone,
      firestore_id: docRef.id
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});

app.post('/send/sms', async (req, res) => {
  try {
    const { recipient, message } = req.body;
    const authHeader = req.headers['x-api-key']?.trim();

    // Validate required fields
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'Authorization token is required'
      });
    }

    if (!recipient || !message) {
      return res.status(400).json({
        success: false,
        error: 'recipient and message are required'
      });
    }

    // Normalize recipient PH number
    const normalizedRecipient = normalizePHNumber(recipient);
    if (!normalizedRecipient) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Philippine phone number format'
      });
    }

    // 🔍 Fetch document by api_key only
    const tokenSnap = await db
      .collection('api_keys')
      .where('api_key', '==', authHeader)
      .limit(1)
      .get();

    if (tokenSnap.empty) {
      return res.status(403).json({
        success: false,
        error: 'Invalid API key'
      });
    }

    const tokenDocRef = tokenSnap.docs[0].ref;
    const tokenDoc = tokenSnap.docs[0].data();

    // ✅ Check is_active
    if (tokenDoc.is_active !== true) {
      return res.status(403).json({
        success: false,
        error: 'API key is inactive'
      });
    }

    // ⏱ Rate limiting: 1 SMS every 5 seconds
    const lastSent = tokenDoc.updated_at ? new Date(tokenDoc.updated_at) : null;
    const now = new Date();

    if (lastSent && now - lastSent < 5000) { // 5000ms = 5s
      const waitTime = Math.ceil((5000 - (now - lastSent)) / 1000);
      return res.status(429).json({
        success: false,
        error: `Rate limit exceeded. Try again in ${waitTime} second(s).`
      });
    }

    // Append watermark
    const finalMessage = `${message}\n\nSent via SMS API Philippines`;

    // Send SMS via TextBee
    const smsResponse = await axios.post(
      `${BASE_URL}/gateway/devices/${process.env.TEXTBEE_DEVICE_ID}/send-sms`,
      {
        recipients: [normalizedRecipient],
        message: finalMessage
      },
      {
        headers: {
          'x-api-key': process.env.TEXTBEE_API_KEY
        }
      }
    );

    // Update updated_at field in Firestore
    await tokenDocRef.update({
      updated_at: now.toISOString()
    });

    res.json({
      success: true,
      message: 'SMS sent successfully',
      recipient: normalizedRecipient,
      sms_response: smsResponse.data
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});

// ===============================
// START SERVER
// ===============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 SMS API running on http://localhost:${PORT}`);
});
