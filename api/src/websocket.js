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
  kafkaEmitter.on("message_delivered", (msg) => {
    const ws = connectedUsers[msg.sender_username];

    if (ws && ws.readyState === ws.OPEN) {
      ws.send(
        JSON.stringify({
          type: "message_status",
          message: msg,
        })
      );
    }
  });
}

module.exports = { startWebSocketServer };
