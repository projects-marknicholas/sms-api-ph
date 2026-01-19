const express = require('express');
const cors = require('cors'); 
const axios = require('axios');
const admin = require('firebase-admin');
const crypto = require('crypto');
require('dotenv').config();

// ===============================
// FIREBASE ADMIN INIT
// ===============================
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCrNNJzFnQYE9rK\nPT7SKdU9AoRwoTiVE5tzTHMT5H4DQLq6cyto6Sgl6pYg0P6frl6KyPYO1DxcHRaH\n93NatHXhOXgaSHUnKT1Z7lrN6YsVR/rly85eI87IjzAiRp0n+41gyMvwzlkt49tP\n26zOKDM86pdirhCVSeotm+OyVyhLV4hjqRhXHUvHcyNTdcmQTPZlOl5AFBFE/RXJ\nQV7bc+3C8Luzlnxw7oNdbsWOUGdAXwcIQACUoXI39c4E8DWHDrwfSoQP2Xcxz5bq\n5Lm7hQV/L7rcWkElL7zYOET1WpFm/qJVvJXC53y3w0JBfqbjlnWGuc1sWYQWeZFu\nqm43jP7fAgMBAAECggEAS0FvRk523oSPtjkgrZHc3TIHlFiRvhm9yXsv1G0qJPTl\nf4KTcMyYLL6GmkszuW4Uua2nVxJcq+LPXhnb12GetU8lJ2x1Lq8WfDrlKEEBtWuL\n8knZXxEfWpJyRobCmuoclY/98U5K7fyMEPjPZ1lNWHgH7kT0HiM88CpndqOQHzlU\nQsGrIQ+r0FF8IHNHmRWjqkMTaxwL5AACqhndCQjxRQNbN2ihiqu+ukyMctjMQHnK\nzyhbewe4TOacTrjbKHGGddbPM0+8D27uD78dQHMlp4Z3n4QBTrnt7v/UU3TdEjfV\nzyMa5MQJwizFJ27+vAC4/aHOLXy64CSoO7Wl3LQNqQKBgQDn7715eBywZ7k1yT1Z\n1hwzDZgvOx3V9cd64cdMFoqaw3x3pGgcUmMPaSnO4VF+R6en0wyZBCaZ8RFlqvef\n+RBWYEBKDHRFJZ4Plo3WuI9NIfDgZAYUlrUMeiRKs60v1++3wicJsbWU+ycx6PsB\ngo/71NWZpbF+b4Qp9E9k2IZYyQKBgQC8+BUIdZdy4eF+8C1NFrFzpyBRb3jh0RZq\njALzt0i4CL+XQw7R1o+ZdIN3EMNcOBcrzKc42B4A/Dk7ibZzjU2rxg7VfeAFvfuZ\nuj/Dj7g6hRnJQubN2avAEzzHAnO5iQHhJMYW+7ZWUcQd/mTn5kQ7kNFA2ZlQ5n9Q\n6WPVa+4WZwKBgF3t1FEWGKBEUVh7+DGiqWbvkXtHOK0GzVNxjlG9K0LD+mtFlLgr\nkVyTXVAgJe27PSWVLhvl93AOldoTpBcQOdKRRlf2tTuvoVR0x1p3Aend3fwx5dh+\ntDGqYXozS+b9T2Ke6Upewsfj8pqe3NBevMrjBeIknT40EVUgUOrpWXcpAoGANgaz\ndLyx9Q1xe+pM+VpAl7EzgzTcmas+vm2TNnyzVLJjnGp2pTWzzorKP1NSl14N+d7D\n/HOFeICkGEqSGE1Q5Ih2m0EmuF2NvnDKZC4F3O1K5wiyli3idcLKQJeJ4IS0PdtW\nqyGCCwHLkUu3K7ngzirkOKc9tyx/P/HKMi1uX4cCgYAmWqAqhYrcllPbXH7NlU/h\nQgZRfQT2OQgq+TvA0iLPx4ubgZU4eB9kzyg6sBFxaEVD0BokDkVw57M8KwZ49N+V\nH0dvtCto9TVO46Ck9gM1MBTgqgFT02RAjmcSrMht7AUOlWTESRklgquYiy5pQOGy\ng5vRezi+yHNZb+tw/FBdwg==\n-----END PRIVATE KEY-----\n"
  })
});

const db = admin.firestore();

// ===============================
// EXPRESS SETUP
// ===============================
const app = express();
app.use(cors());
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