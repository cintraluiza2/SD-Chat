const express = require("express");
const client = require("prom-client");

client.collectDefaultMetrics();

const app = express();

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

module.exports = function startMetricsServer() {
  const port = process.env.METRICS_PORT || 3002;
  app.listen(port, () => {
    console.log(`[METRICS] Worker metrics running on port ${port}`);
  });
};
