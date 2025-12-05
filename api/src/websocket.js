const { WebSocketServer } = require("ws");
const { verifyToken } = require("./auth");
const { kafkaEmitter } = require("./kafka");   // ✔ IMPORTAÇÃO ESSENCIAL

const connectedUsers = {}; // { username: ws }

function startWebSocketServer(server) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws, req) => {
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

      ws.send(
        JSON.stringify({
          type: "welcome",
          user: payload.sub,
        })
      );

      ws.on("close", () => {
        delete connectedUsers[payload.sub];
        console.log(`[WS] desconectado → ${payload.sub}`);
      });
    } catch (err) {
      console.log("WS error:", err.message);
      ws.close();
    }
  });

  //  Aqui processamos eventos vindos do Worker/Kafka
  const db = require("./db");
  kafkaEmitter.on("message_delivered", async (msg) => {
    // Envia status para o remetente
    const wsSender = connectedUsers[msg.sender_username];
    if (wsSender && wsSender.readyState === wsSender.OPEN) {
      wsSender.send(
        JSON.stringify({
          type: "message_status",
          message: msg,
        })
      );
    }

    // Busca participantes da conversa
    try {
      const result = await db.query(
        "SELECT username FROM conversation_participants WHERE conversation_id = $1",
        [msg.conversation_id]
      );
      for (const row of result.rows) {
        const username = row.username;
        // Não envia para o remetente
        if (username !== msg.sender_username) {
          const wsRecipient = connectedUsers[username];
          if (wsRecipient && wsRecipient.readyState === wsRecipient.OPEN) {
            wsRecipient.send(
              JSON.stringify({
                type: "new_message",
                message: msg,
              })
            );
          }
        }
      }
    } catch (err) {
      console.error("Erro ao buscar participantes da conversa:", err);
    }
  });
}

module.exports = { startWebSocketServer };
