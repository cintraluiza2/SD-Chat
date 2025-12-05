const express = require('express');
const bodyParser = require('body-parser');
const http = require("http");

const router = require('./routes');
const { initKafka } = require('./kafka');
const { startWebSocketServer } = require("./websocket");
const uploadRoutes = require("./routes-upload");

const app = express();
const server = http.createServer(app);  
const port = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use('/api', router);
app.use("/api", uploadRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

async function start() {
  // 1. Start HTTP first
  server.listen(port, () => {
    console.log(`API listening on port ${port}`);
  });

  // 2. Start WebSocket using the same HTTP server
  startWebSocketServer(server);

  // 3. Start Kafka AFTER WebSocket exists
  await initKafka();
}

start();
