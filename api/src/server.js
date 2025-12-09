const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const http = require("http");

const router = require('./routes');
const { initKafka } = require('./kafka');
const { startWebSocketServer } = require("./websocket");
const uploadRoutes = require("./routes-upload");
const client = require("prom-client");
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;



// Habilita CORS para todas as origens (ajuste origin se necessário)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json());
// Swagger UI and JSON spec
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/docs/swagger.json', (req, res) => res.json(swaggerSpec));

app.use('/api', router);
app.use("/api", uploadRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

client.collectDefaultMetrics();

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
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
