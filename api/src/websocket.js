const { WebSocketServer } = require("ws");
const { verifyToken } = require("./auth");
const { kafkaEmitter } = require("./kafka");
const db = require("./db");

const connectedUsers = {}; // { username: ws }

function broadcastPresence(wss, username, isOnline) {
  const message = JSON.stringify({
    type: 'presence_update',
    username: username,
    is_online: isOnline
  });
  
  wss.clients.forEach(client => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  });
}

function startWebSocketServer(server) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", async (ws, req) => {
    try {
      // extrai token da URL: ws://host:3003/?token=XXX
      const params = req.url.split("token=")[1];
      if (!params) {
        console.log("WS: conexão sem token → encerrada");
        ws.close();
        return;
      }

      const payload = verifyToken(params);
      ws.username = payload.sub;
      connectedUsers[payload.sub] = ws;

      console.log(`[WS] conectado → ${payload.sub}`);

      // 1. Atualiza DB para ONLINE
      try {
        await db.query(`
          INSERT INTO user_presence (username, is_online, last_seen)
          VALUES ($1, true, NOW())
          ON CONFLICT (username) DO UPDATE SET is_online = true, last_seen = NOW()
        `, [ws.username]);

        // 2. Broadcast ONLINE para todos
        broadcastPresence(wss, ws.username, true);
      } catch (err) {
        console.error(`Erro ao atualizar presença ONLINE para ${ws.username}:`, err.message);
      }

      ws.send(
        JSON.stringify({
          type: "welcome",
          user: payload.sub,
        })
      );

      ws.on("close", async () => {
        delete connectedUsers[payload.sub];
        console.log(`[WS] desconectado → ${payload.sub}`);
        
        // 1. Atualiza DB para OFFLINE
        try {
          await db.query(`
            UPDATE user_presence SET is_online = false, last_seen = NOW() WHERE username = $1
          `, [payload.sub]);

          // 2. Broadcast OFFLINE para todos
          broadcastPresence(wss, payload.sub, false);
        } catch (err) {
          console.error(`Erro ao atualizar presença OFFLINE para ${payload.sub}:`, err.message);
        }
      });

      ws.on("error", (err) => {
        console.error(`[WS] erro → ${payload.sub}:`, err.message);
      });
    } catch (err) {
      console.log("WS error:", err.message);
      ws.close();
    }
  });

  //  Aqui processamos eventos vindos do Worker/Kafka
  kafkaEmitter.on("message_delivered", async (msg) => {
    console.log('[WS] Processando message_delivered:', { 
      conversation_id: msg.conversation_id, 
      sender: msg.sender_username, 
      type: msg.type 
    });

    // Envia status para o remetente
    const wsSender = connectedUsers[msg.sender_username];
    if (wsSender && wsSender.readyState === 1) { // WebSocket.OPEN = 1
      try {
        const payload = JSON.stringify({
          type: "message_status",
          message: msg,
        });
        console.log(`[WS] ANTES de enviar para ${msg.sender_username}, readyState=${wsSender.readyState}`);
        console.log(`[WS] Payload:`, payload.substring(0, 200));
        wsSender.send(payload);
        console.log(`[WS] Enviado message_status para ${msg.sender_username}`);
      } catch (err) {
        console.error(`[WS] Erro ao enviar para ${msg.sender_username}:`, err.message);
        console.error(`[WS] Stack:`, err.stack);
      }
    }

    // Busca participantes da conversa
    try {
      const result = await db.query(
        "SELECT username FROM conversation_participants WHERE conversation_id = $1",
        [msg.conversation_id]
      );
      console.log(`[WS] Participantes da conversa ${msg.conversation_id}:`, result.rows.map(r => r.username));
      
      for (const row of result.rows) {
        const username = row.username;
        // Não envia para o remetente
        if (username !== msg.sender_username) {
          const wsRecipient = connectedUsers[username];
          if (wsRecipient && wsRecipient.readyState === 1) { // WebSocket.OPEN = 1
            try {
              wsRecipient.send(
                JSON.stringify({
                  type: "new_message",
                  message: msg,
                })
              );
              console.log(`[WS] Enviado new_message para ${username}`);
            } catch (err) {
              console.error(`[WS] Erro ao enviar para ${username}:`, err.message);
            }
          } else {
            console.log(`[WS] ${username} não está conectado ou WebSocket não está aberto`);
          }
        }
      }
    } catch (err) {
      console.error("[WS] Erro ao buscar participantes da conversa:", err);
    }
  });
  
  // Listener para quando uma mensagem é marcada como lida
  kafkaEmitter.on("message_read", (data) => {
    console.log('[WS] Mensagem lida:', data);
    
    // Notifica o remetente que sua mensagem foi lida
    const wsSender = connectedUsers[data.sender];
    if (wsSender && wsSender.readyState === 1) {
      try {
        wsSender.send(JSON.stringify({
          type: "message_read",
          message_id: data.message_id,
          reader: data.reader
        }));
        console.log(`[WS] Notificado ${data.sender} que mensagem ${data.message_id} foi lida por ${data.reader}`);
      } catch (err) {
        console.error(`[WS] Erro ao notificar leitura:`, err.message);
      }
    }
  });
}

module.exports = { startWebSocketServer };
