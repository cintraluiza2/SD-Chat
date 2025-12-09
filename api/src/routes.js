const express = require('express');
const db = require('./db');
const { sendMessageToKafka } = require('./kafka');
const { generateToken, authMiddleware } = require('./auth');
const { hashPassword, comparePassword } = require('./password');

const router = express.Router();

/**
 * @openapi
 * /v1/auth/register:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Register a new user
 *     description: Creates a new user account with username and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AuthRequest'
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Missing username or password
 *       409:
 *         description: User already exists
 */
// Cadastro de usuário (register)
router.post('/v1/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  try {
    // Garante username único
    const userExists = await db.query('SELECT id FROM users WHERE username = $1', [username]);
    if (userExists.rows.length > 0) {
      return res.status(409).json({ error: 'username already exists' });
    }
    const password_hash = await hashPassword(password);
    const result = await db.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
      [username, password_hash]
    );
    return res.status(201).json({ id: result.rows[0].id, username });
  } catch (err) {
    console.error('Error in register', err);
    return res.status(500).json({ error: 'Failed to register' });
  }
});
/**
 * @openapi
 * /v1/auth/login:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Authenticate user and get JWT token
 *     description: Validates credentials and returns a JWT token for subsequent requests
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AuthRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       401:
 *         description: Invalid credentials
 */

// Login seguro (username + senha)
router.post('/v1/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  try {
    const user = await db.query('SELECT id, username, password_hash FROM users WHERE username = $1', [username]);
    if (user.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const valid = await comparePassword(password, user.rows[0].password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    // Gera JWT com user_id e username
    const token = generateToken({ user_id: user.rows[0].id, username: user.rows[0].username });
    return res.json({ token });
  } catch (err) {
    console.error('Error in login', err);
    return res.status(500).json({ error: 'Failed to login' });
  }
});

/**
 * @openapi
 * /v1/conversations/{id}/participants:
 *   get:
 *     tags:
 *       - Conversations
 *     summary: List conversation participants
 *     description: Retrieves all participants of a conversation
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *         description: Conversation ID
 *     responses:
 *       200:
 *         description: Participants retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 participants:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ['john_doe', 'jane_smith']
 *       500:
 *         description: Server error
 */

// GET /api/v1/conversations/:id/participants – lista participantes da conversa
router.get('/v1/conversations/:id/participants', authMiddleware, async (req, res) => {
  const conversationId = req.params.id;
  try {
    const result = await db.query(
      'SELECT username FROM conversation_participants WHERE conversation_id = $1',
      [conversationId]
    );
    return res.json({ participants: result.rows.map(r => r.username) });
  } catch (err) {
    console.error('Error fetching participants', err);
    return res.status(500).json({ error: 'Failed to fetch participants' });
  }
});

/**
 * @openapi
 * /v1/users/{username}/conversations:
 *   get:
 *     tags:
 *       - Conversations
 *     summary: Lista conversas do usuário
 *     description: Retorna as conversas do usuário autenticado (ou de outro usuário) incluindo participantes.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: username
 *         required: true
 *         schema:
 *           type: string
 *         description: Nome de usuário
 *     responses:
 *       200:
 *         description: Conversas retornadas com participantes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 conversations:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Conversation'
 *       500:
 *         description: Erro no servidor
 */
// GET /api/v1/users/:username/conversations – lista todas as conversas do usuário COM participantes
router.get('/v1/users/:username/conversations', authMiddleware, async (req, res) => {
  const username = req.params.username;
  try {
    // Busca as conversas do usuário
    const result = await db.query(
      `SELECT c.id, c.name, c.type, c.created_at
         FROM conversations c
         JOIN conversation_participants cp ON cp.conversation_id = c.id
         WHERE cp.username = $1
         ORDER BY c.created_at DESC`,
      [username]
    );
    
    // Para cada conversa, busca os participantes
    const conversations = await Promise.all(result.rows.map(async (conv) => {
      const participantsResult = await db.query(
        'SELECT username FROM conversation_participants WHERE conversation_id = $1',
        [conv.id]
      );
      return {
        ...conv,
        participants: participantsResult.rows.map(r => r.username)
      };
    }));
    
    return res.json({ conversations });
  } catch (err) {
    console.error('Error fetching user conversations', err);
    return res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});
/**
 * @openapi
 * /v1/conversations:
 *   post:
 *     tags:
 *       - Conversations
 *     summary: Create a new conversation
 *     description: Creates a private or group conversation. For private conversations, returns existing conversation if already exists.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ConversationRequest'
 *     responses:
 *       201:
 *         description: Conversation created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 conversationId:
 *                   type: integer
 *       200:
 *         description: Existing conversation returned
 *       400:
 *         description: Invalid request
 */

// POST /v1/conversations – cria uma nova conversa (privada ou grupo)
router.post('/v1/conversations', authMiddleware, async (req, res) => {
  const { participants, type } = req.body;
  if (!participants || !Array.isArray(participants) || participants.length < 2) {
    return res.status(400).json({ error: 'participants (min. 2) required' });
  }
  const convType = type === 'group' ? 'group' : 'private';
  try {
    // Regra: evitar conversa privada duplicada
    if (convType === 'private' && participants.length === 2) {
      // Busca conversa privada existente entre os dois usuários
      const check = await db.query(
        `SELECT c.id FROM conversations c
          JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.username = $1
          JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.username = $2
         WHERE c.type = 'private'
         GROUP BY c.id
         HAVING COUNT(*) = 2`,
        [participants[0], participants[1]]
      );
      if (check.rows.length > 0) {
        // Já existe, retorna o id existente
        return res.status(200).json({ conversationId: check.rows[0].id });
      }
    }
    // Cria conversa normalmente
    const result = await db.query(
      'INSERT INTO conversations (type) VALUES ($1) RETURNING id',
      [convType]
    );
    const conversationId = result.rows[0].id;
    // Associa participantes
    for (const username of participants) {
      await db.query(
        'INSERT INTO conversation_participants (conversation_id, username) VALUES ($1, $2)',
        [conversationId, username]
      );
    }
    return res.status(201).json({ conversationId });
  } catch (err) {
    console.error('Error creating conversation', err);
    return res.status(500).json({ error: 'Failed to create conversation' });
  }
});

/**
 * @openapi
 * /v1/messages:
 *   post:
 *     tags:
 *       - Messages
 *     summary: Send a message
 *     description: Sends a text or file message to a conversation. Automatically saves as pending if recipient is offline.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MessageRequest'
 *     responses:
 *       202:
 *         description: Message queued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 message:
 *                   $ref: '#/components/schemas/Message'
 *       400:
 *         description: Missing required fields
 */

// LOGIN SIMPLES (sem senha, apenas para gerar JWT para testes)

// POST /v1/messages – envia mensagem de texto
router.post('/v1/messages', authMiddleware, async (req, res) => {
  const { conversationId, content, type, file_id } = req.body;
  const senderUsername = req.user.username;

  if (!conversationId) {
    return res.status(400).json({ error: "conversationId is required" });
  }

  if ((type === "text" || !type) && !content) {
    return res.status(400).json({ error: "content is required for text messages" });
  }

  if (type === "file" && !file_id) {
    return res.status(400).json({ error: "file_id is required for file messages" });
  }

  const msg = {
    conversation_id: conversationId,
    sender_username: senderUsername,
    content,
    type: type || 'text',
    status: 'SENT',
    timestamp: new Date().toISOString(),
  };

  if (msg.type === "file") {
    msg.file_id = file_id;
    msg.content = null;
  } else {
    msg.content = content;
  }

  try {
    // Primeiro, salva a mensagem no Kafka para ser persistida
    await sendMessageToKafka(msg);
    
    // Depois, obtém todos os participantes da conversa
    const participantsResult = await db.query(
      'SELECT username FROM conversation_participants WHERE conversation_id = $1',
      [conversationId]
    );
    
    const participants = participantsResult.rows.map(r => r.username);
    
    // Para cada participante que não é o remetente, verifica se está offline
    for (const participant of participants) {
      if (participant === senderUsername) continue; // não salva para si mesmo
      
      const presenceResult = await db.query(
        'SELECT is_online FROM user_presence WHERE username = $1',
        [participant]
      );
      
      const isOnline = presenceResult.rows.length > 0 && presenceResult.rows[0].is_online;
      
      // Se está offline, salva como mensagem pendente
      if (!isOnline) {
        await db.query(
          `INSERT INTO pending_messages (recipient_username, sender_username, conversation_id, content, delivered)
           VALUES ($1, $2, $3, $4, false)`,
          [participant, senderUsername, conversationId, content]
        );
        console.log(`Mensagem salva como pendente para ${participant}`);
      }
    }
    
    // a persistência e mudança de status será responsabilidade do worker
    return res.status(202).json({ status: 'queued', message: msg });
  } catch (err) {
    console.error('Error sending to Kafka', err);
    return res.status(500).json({ error: 'Failed to queue message' });
  }
});

/**
 * @openapi
 * /v1/conversations/{id}/messages:
 *   get:
 *     tags:
 *       - Messages
 *     summary: Lista mensagens de uma conversa
 *     description: Retorna mensagens persistidas de uma conversa, incluindo informação se a mensagem foi lida pelo remetente.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID da conversa
 *     responses:
 *       200:
 *         description: Lista de mensagens
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 conversationId:
 *                   type: integer
 *                 messages:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Message'
 *       500:
 *         description: Erro no servidor
 */
// GET /v1/conversations/:id/messages – lista mensagens já persistidas com status de leitura
router.get('/v1/conversations/:id/messages', authMiddleware, async (req, res) => {
  const conversationId = req.params.id;
  const currentUser = req.user.username;

  try {
    const result = await db.query(
      `SELECT m.id, m.conversation_id, m.sender_username, m.content, m.type, m.status, m.created_at, m.updated_at,
              m.file_id, f.file_key, f.size, f.bucket, f.uploader,
              CASE 
                WHEN m.sender_username = $2 THEN 
                  EXISTS(SELECT 1 FROM message_read_status WHERE message_id = m.id)
                ELSE false
              END as is_read
       FROM messages m
       LEFT JOIN files f ON m.file_id = f.id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at ASC`,
      [conversationId, currentUser]
    );

    return res.json({ conversationId, messages: result.rows });
  } catch (err) {
    console.error('Error fetching messages', err);
    return res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

/**
 * @openapi
 * /v1/pending-messages:
 *   get:
 *     tags:
 *       - Messages
 *     summary: Recupera mensagens pendentes
 *     description: Retorna mensagens pendentes não entregues para o usuário autenticado e marca como entregues.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Mensagens pendentes retornadas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pendingMessages:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PendingMessage'
 *       500:
 *         description: Erro no servidor
 */
// GET /v1/pending-messages – recupera mensagens pendentes do usuário logado
router.get('/v1/pending-messages', authMiddleware, async (req, res) => {
  const username = req.user.username;
  
  try {
    // Busca todas as mensagens pendentes não entregues
    const result = await db.query(
      `SELECT id, sender_username, conversation_id, content, created_at
       FROM pending_messages
       WHERE recipient_username = $1 AND delivered = false
       ORDER BY created_at ASC`,
      [username]
    );
    
    const pendingMessages = result.rows;
    
    // Marca todas como entregues
    if (pendingMessages.length > 0) {
      await db.query(
        `UPDATE pending_messages
         SET delivered = true
         WHERE recipient_username = $1 AND delivered = false`,
        [username]
      );
      console.log(`${pendingMessages.length} mensagens pendentes entregues para ${username}`);
    }
    
    return res.json({ pendingMessages });
  } catch (err) {
    console.error('Error fetching pending messages', err);
    return res.status(500).json({ error: 'Failed to fetch pending messages' });
  }
});

/**
 * @openapi
 * /v1/events/message-delivered:
 *   post:
 *     tags:
 *       - Events
 *     summary: Evento - mensagem entregue
 *     description: Endpoint usado pelo worker para notificar que uma mensagem foi entregue; emite evento interno.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message_id:
 *                 type: integer
 *               recipient:
 *                 type: string
 *               delivered_at:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Evento recebido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 */
router.post("/v1/events/message-delivered", (req, res) => {
  const msg = req.body;

  console.log("Evento recebido do Worker:", msg);

  const { kafkaEmitter } = require("./kafka");
  kafkaEmitter.emit("message_delivered", msg);

  return res.json({ ok: true });
});

/**
 * @openapi
 * /v1/users:
 *   get:
 *     tags:
 *       - Users
 *     summary: Lista usuários com presença
 *     description: Lista todos os usuários registrados junto com o status de presença (online/offline).
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de usuários
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *       500:
 *         description: Erro no servidor
 */
// GET /api/v1/users – lista todos os usuários registrados com status de presença
router.get('/v1/users', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT u.username, COALESCE(up.is_online, false) as is_online
      FROM users u
      LEFT JOIN user_presence up ON u.username = up.username
      ORDER BY u.username ASC
    `);
    return res.json({ users: result.rows });
  } catch (err) {
    console.error('Error fetching users', err);
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * @openapi
 * /v1/presence:
 *   post:
 *     tags:
 *       - Presence
 *     summary: Update user presence status
 *     description: Updates whether the authenticated user is online or offline
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PresenceRequest'
 *     responses:
 *       200:
 *         description: Presence updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PresenceResponse'
 *       500:
 *         description: Server error
 */
// POST /api/v1/presence – atualiza status de presença do usuário
router.post('/v1/presence', authMiddleware, async (req, res) => {
  const { is_online } = req.body;
  const userUsername = req.user.username;
  
  try {
    // Verifica se já existe registro
    const exists = await db.query(
      'SELECT username FROM user_presence WHERE username = $1',
      [userUsername]
    );
    
    if (exists.rows.length > 0) {
      // Atualiza registro existente
      await db.query(
        'UPDATE user_presence SET is_online = $1, updated_at = NOW() WHERE username = $2',
        [is_online, userUsername]
      );
    } else {
      // Insere novo registro
      await db.query(
        'INSERT INTO user_presence (username, is_online, updated_at) VALUES ($1, $2, NOW())',
        [userUsername, is_online]
      );
    }
    
    console.log(`Presença atualizada: ${userUsername} -> ${is_online ? 'ONLINE' : 'OFFLINE'}`);
    return res.json({ ok: true, status: is_online ? 'online' : 'offline' });
  } catch (err) {
    console.error('Error updating presence', err);
    return res.status(500).json({ error: 'Failed to update presence' });
  }
});

/**
 * @openapi
 * /v1/presence-beacon:
 *   post:
 *     tags:
 *       - Presence
 *     summary: Update presence via beacon (no auth headers)
 *     description: Alternative endpoint for navigator.sendBeacon that accepts token in body or header. Used for page unload events.
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *                 description: JWT token (can also be sent in Authorization header)
 *               is_online:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Presence updated via beacon
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PresenceResponse'
 *       401:
 *         description: No token provided
 *       400:
 *         description: Failed to update presence
 */

// POST /api/v1/presence-beacon – endpoint alternativo para navigator.sendBeacon (sem auth headers)
router.post('/v1/presence-beacon', async (req, res) => {
  try {
    const token = req.body.token || req.headers['authorization']?.replace('Bearer ', '');
    const is_online = req.body.is_online === 'true' || req.body.is_online === true;
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    // Decodifica o token sem verificar (apenas para pegar o username durante logout)
    const parts = token.split('.');
    if (parts.length !== 3) {
      return res.status(400).json({ error: 'Invalid token format' });
    }
    
    try {
      const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      const userUsername = decoded.username;
      
      // Verifica se já existe registro
      const exists = await db.query(
        'SELECT username FROM user_presence WHERE username = $1',
        [userUsername]
      );
      
      if (exists.rows.length > 0) {
        // Atualiza registro existente
        await db.query(
          'UPDATE user_presence SET is_online = $1, updated_at = NOW() WHERE username = $2',
          [is_online, userUsername]
        );
      } else {
        // Insere novo registro
        await db.query(
          'INSERT INTO user_presence (username, is_online, updated_at) VALUES ($1, $2, NOW())',
          [userUsername, is_online]
        );
      }
      
      console.log(`Presença atualizada (beacon): ${userUsername} -> ${is_online ? 'ONLINE' : 'OFFLINE'}`);
      return res.json({ ok: true, status: is_online ? 'online' : 'offline' });
    } catch (err) {
      console.error('Error decoding token:', err);
      return res.status(400).json({ error: 'Invalid token' });
    }
  } catch (err) {
    console.error('Error in beacon presence', err);
    return res.status(500).json({ error: 'Failed to update presence' });
  }
});

/**
 * @openapi
 * /v1/messages/{id}/read:
 *   post:
 *     tags:
 *       - Messages
 *     summary: Marca mensagem como lida
 *     description: Marca uma mensagem como lida pelo usuário autenticado.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID da mensagem
 *     responses:
 *       200:
 *         description: Mensagem marcada como lida
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *       401:
 *         description: Não autorizado
 *       404:
 *         description: Mensagem não encontrada
 *       500:
 *         description: Erro no servidor
 */
// POST /v1/messages/:id/read - Marca mensagem como lida
router.post('/v1/messages/:id/read', authMiddleware, async (req, res) => {
  const messageId = req.params.id;
  const readerUsername = req.user.username;
  
  try {
    // Verifica se a mensagem existe
    const msgCheck = await db.query(
      'SELECT sender_username FROM messages WHERE id = $1',
      [messageId]
    );
    
    if (msgCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Não marca como lida se for o próprio remetente
    if (msgCheck.rows[0].sender_username === readerUsername) {
      return res.json({ ok: true, note: 'Own message' });
    }
    
    // Insere registro de leitura (ou ignora se já existe)
    await db.query(
      `INSERT INTO message_read_status (message_id, reader_username, read_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (message_id, reader_username) DO NOTHING`,
      [messageId, readerUsername]
    );
    
    console.log(`✓ Mensagem ${messageId} marcada como lida por ${readerUsername}`);
    
    // Notifica o remetente via WebSocket (se estiver online)
    // Emite evento para o websocket.js
    const { kafkaEmitter } = require('./kafka');
    kafkaEmitter.emit('message_read', {
      message_id: messageId,
      reader: readerUsername,
      sender: msgCheck.rows[0].sender_username
    });
    
    return res.json({ ok: true });
  } catch (err) {
    console.error('Error marking message as read:', err);
    return res.status(500).json({ error: 'Failed to mark as read' });
  }
});

module.exports = router;
