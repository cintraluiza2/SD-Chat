const express = require('express');
const db = require('./db');
const { sendMessageToKafka } = require('./kafka');
const { generateToken, authMiddleware } = require('./auth');

const router = express.Router();

// LOGIN SIMPLES (sem senha, apenas para gerar JWT para testes)
router.post('/v1/auth/login', async (req, res) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'username is required' });
  }

  // registra usuário na tabela se ainda não existir
  try {
    await db.query(
      'INSERT INTO users (username) VALUES ($1) ON CONFLICT (username) DO NOTHING',
      [username]
    );
  } catch (err) {
    console.error('Error inserting user', err);
  }

  const token = generateToken(username);
  res.json({ token });
});

// POST /v1/messages – envia mensagem de texto
router.post('/v1/messages', authMiddleware, async (req, res) => {
  const { conversationId, content, type } = req.body;
  if (!conversationId || !content) {
    return res.status(400).json({ error: 'conversationId and content are required' });
  }

  const msg = {
    conversation_id: conversationId,
    sender_username: req.user.username,
    content,
    type: type || 'text',
    status: 'SENT',
    timestamp: new Date().toISOString(),
  };

  try {
    await sendMessageToKafka(msg);
    // a persistência e mudança de status será responsabilidade do worker
    return res.status(202).json({ status: 'queued', message: msg });
  } catch (err) {
    console.error('Error sending to Kafka', err);
    return res.status(500).json({ error: 'Failed to queue message' });
  }
});

// GET /v1/conversations/:id/messages – lista mensagens já persistidas
router.get('/v1/conversations/:id/messages', authMiddleware, async (req, res) => {
  const conversationId = req.params.id;

  try {
    const result = await db.query(
      `SELECT id, conversation_id, sender_username, content, type, status, created_at, updated_at
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversationId]
    );

    return res.json({ conversationId, messages: result.rows });
  } catch (err) {
    console.error('Error fetching messages', err);
    return res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

router.post("/v1/events/message-delivered", (req, res) => {
  const msg = req.body;

  console.log("Evento recebido do Worker:", msg);

  const { kafkaEmitter } = require("./kafka");
  kafkaEmitter.emit("message_delivered", msg);

  return res.json({ ok: true });
});


module.exports = router;
