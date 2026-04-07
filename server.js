require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // serve frontend

// Connect MongoDB
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Initialize AI clients
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Chat history schema
const chatSchema = new mongoose.Schema({
    messages: Array,
    createdAt: { type: Date, default: Date.now }
});
const Chat = mongoose.model('Chat', chatSchema);

// API route: chat
app.post('/api/chat', async (req, res) => {
    const { model, messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Invalid messages format' });
    }

    try {
        let responseContent = '';

        if (model === 'gpt-4') {
            const completion = await openai.chat.completions.create({
                model: 'gpt-4-turbo',
                messages: messages,
            });
            responseContent = completion.choices[0].message.content;

        } else if (model === 'claude-3') {
            const systemMessage = messages.find(msg => msg.role === 'system');
            const userMessages = messages.filter(msg => msg.role !== 'system');

            const response = await anthropic.messages.create({
                model: 'claude-3-opus-20240229',
                max_tokens: 1024,
                system: systemMessage ? systemMessage.content : 'You are a helpful assistant.',
                messages: userMessages,
            });
            responseContent = response.content[0].text;

        } else if (model === 'deepshi') {
            if (!process.env.DEPSHI_API_URL) {
                throw new Error('Deepshi API URL not configured');
            }
            const response = await axios.post(`${process.env.DEPSHI_API_URL}/v1/chat/completions`, {
                model: 'deepshi-v1',
                messages: messages,
            }, {
                headers: {
                    'Authorization': `Bearer ${process.env.DEPSHI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });
            responseContent = response.data.choices[0].message.content;

        } else {
            return res.status(400).json({ error: 'Unsupported model selected' });
        }

        // Save chat history
        const chat = new Chat({ messages: [...messages, { role: 'assistant', content: responseContent }] });
        await chat.save();

        res.json({ result: responseContent });

    } catch (error) {
        console.error('API Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch response from AI provider' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});