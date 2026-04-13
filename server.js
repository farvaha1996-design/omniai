// server.js — OmniAI Backend (Fixed & Production Ready)
require('dotenv').config();

const express  = require('express');
const cors     = require('cors');
const OpenAI   = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const axios    = require('axios');
const mongoose = require('mongoose');

const app  = express();
const PORT = process.env.PORT || 3001;

// ─────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ─────────────────────────────────────────────
// MongoDB — graceful (app won't crash if missing)
// ─────────────────────────────────────────────
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => console.warn('⚠️  MongoDB connection failed:', err.message));
} else {
  console.warn('⚠️  MONGO_URI not set — chat history saving disabled');
}

// Chat Schema
const chatSchema = new mongoose.Schema({
  model:     String,
  messages:  Array,
  createdAt: { type: Date, default: Date.now }
});
const Chat = mongoose.model('Chat', chatSchema);

// ─────────────────────────────────────────────
// AI Clients
// ─────────────────────────────────────────────
const openai    = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─────────────────────────────────────────────
// Route: Chat
// ─────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { model, messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }
  if (!model) {
    return res.status(400).json({ error: 'No model specified' });
  }

  try {
    let responseContent = '';

    if (model === 'gpt-4') {
      const completion = await openai.chat.completions.create({
        model:    'gpt-4-turbo',
        messages: messages,
      });
      responseContent = completion.choices[0].message.content;

    } else if (model === 'claude-3') {
      const systemMessage = messages.find(msg => msg.role === 'system');
      const userMessages  = messages.filter(msg => msg.role !== 'system');

      const response = await anthropic.messages.create({
        model:      'claude-3-opus-20240229',
        max_tokens: 1024,
        system:     systemMessage ? systemMessage.content : 'You are a helpful assistant.',
        messages:   userMessages,
      });
      responseContent = response.content[0].text;

    } else if (model === 'deepshi') {
      if (!process.env.DEPSHI_API_URL) {
        throw new Error('Deepshi API URL not configured in environment variables');
      }
      const response = await axios.post(
        `${process.env.DEPSHI_API_URL}/v1/chat/completions`,
        { model: 'deepshi-v1', messages },
        {
          headers: {
            'Authorization': `Bearer ${process.env.DEPSHI_API_KEY}`,
            'Content-Type':  'application/json',
          }
        }
      );
      responseContent = response.data.choices[0].message.content;

    } else {
      return res.status(400).json({ error: `Unsupported model: ${model}` });
    }

    // Save to MongoDB only if connected
    if (mongoose.connection.readyState === 1) {
      const chatEntry = new Chat({
        model,
        messages: [...messages, { role: 'assistant', content: responseContent }]
      });
      await chatEntry.save();
    }

    res.json({ result: responseContent });

  } catch (error) {
    console.error('Chat API Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch response from AI provider' });
  }
});

// ─────────────────────────────────────────────
// Route: Image Generation (DALL-E 3) — Fixed
// ─────────────────────────────────────────────
app.post('/api/image', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt || prompt.trim() === '') {
    return res.status(400).json({ error: 'Image prompt is required' });
  }

  try {
    const image = await openai.images.generate({
      model:  'dall-e-3',
      prompt: prompt,
      n:      1,
      size:   '1024x1024',
    });

    res.json({ url: image.data[0].url });

  } catch (err) {
    console.error('Image Generation Error:', err.message);
    res.status(500).json({ error: 'Image generation failed' });
  }
});

// ─────────────────────────────────────────────
// Route: Google Auth placeholder
// ─────────────────────────────────────────────
app.get('/auth/google', (req, res) => {
  res.json({ message: 'Google login endpoint — integrate Firebase Auth on frontend' });
});

// ─────────────────────────────────────────────
// Health Check — Railway uses this to confirm app is alive
// ─────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'OmniAI' });
});

// ─────────────────────────────────────────────
// Start Server
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 OmniAI server running on port ${PORT}`);
});
