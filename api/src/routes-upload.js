const express = require("express");
const db = require("./db");
const { authMiddleware } = require("./auth");
const { generateDownloadUrl } = require("./storage");
const { sendMessageToKafka } = require("./kafka");

const {
  initMultipartUpload,
  getPresignedPartUrl,
  completeMultipart
} = require("./storage");

const router = express.Router();  // <<<<<<<<<< ESSENCIAL
const BUCKET = process.env.S3_BUCKET || "uploads";

// INIT upload multipart
router.post("/v1/files/init", authMiddleware, async (req, res) => {
  try {
    const { filename, size, checksum, conversationId } = req.body;

    const key = `${conversationId}/${Date.now()}-${filename}`;

    const upload = await initMultipartUpload(BUCKET, key);

    await db.query(
      `INSERT INTO files (file_key, bucket, size, checksum, uploader, conversation_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [key, BUCKET, size, checksum, req.user.username, conversationId]
    );

    return res.json({
      uploadId: upload.UploadId,
      key
    });

  } catch (err) {
    console.error("ERROR /v1/files/init:", err);
    return res.status(500).json({ error: true, message: err.message });
  }
});

// URL PRESIGNADA DE UMA PARTE
router.post("/v1/files/part-url", authMiddleware, async (req, res) => {
  try {
    const { key, uploadId, partNumber } = req.body;

    const url = await getPresignedPartUrl(BUCKET, key, uploadId, partNumber);

    return res.json({ url });

  } catch (err) {
    console.error("ERROR /v1/files/part-url:", err);
    return res.status(500).json({ error: true, message: err.message });
  }
});

// COMPLETAR UPLOAD
router.post("/v1/files/complete", authMiddleware, async (req, res) => {
  try {
    const { key, uploadId, parts, conversationId, filename } = req.body;

    const result = await completeMultipart(BUCKET, key, uploadId, parts);

    // Buscar o file_id que foi criado em /v1/files/init
    const fileResult = await db.query(
      "SELECT id FROM files WHERE file_key = $1",
      [key]
    );

    if (fileResult.rows.length > 0) {
      const fileId = fileResult.rows[0].id;

      // Criar mensagem do tipo 'file' na conversa
      const insertResult = await db.query(
        `INSERT INTO messages (conversation_id, sender_username, content, type, file_id, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, conversation_id, sender_username, content, type, file_id, status, created_at`,
        [conversationId, req.user.username, filename, 'file', fileId, 'delivered']
      );

      const message = insertResult.rows[0];
      console.log(`✅ Arquivo criado como mensagem - fileId: ${fileId}, conversationId: ${conversationId}`);

      // IMPORTANTE: Enviar evento via Kafka para notificar via WebSocket
      await sendMessageToKafka({
        id: message.id,
        conversation_id: message.conversation_id,
        sender_username: message.sender_username,
        content: message.content,
        type: message.type,
        file_id: message.file_id,
        status: 'DELIVERED',
        timestamp: message.created_at.toISOString()
      });
    }

    return res.json({ status: "completed", result });

  } catch (err) {
    console.error("ERROR /v1/files/complete:", err);
    return res.status(500).json({ error: true, message: err.message });
  }
});

// DOWNLOAD
router.get("/v1/files/:id/download", authMiddleware, async (req, res) => {
  try {
    const fileId = req.params.id;

    const result = await db.query(
      "SELECT file_key, bucket FROM files WHERE id = $1",
      [fileId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "File not found" });
    }

    const file = result.rows[0];

    const url = await generateDownloadUrl(file.bucket, file.file_key);

    return res.json({ url });
  } catch (err) {
    console.error("ERROR /v1/files/:id/download:", err);
    return res.status(500).json({ error: true, message: err.message });
  }
});


module.exports = router;
