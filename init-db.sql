CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash TEXT
);

CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  type VARCHAR(20) NOT NULL DEFAULT 'private'
);

CREATE TABLE files (
  id SERIAL PRIMARY KEY,
  file_key TEXT NOT NULL,
  bucket TEXT NOT NULL,
  size BIGINT,
  checksum TEXT,
  uploader VARCHAR(255),
  conversation_id INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id INT NOT NULL REFERENCES conversations(id),
  sender_username VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'text', -- 'text', 'file'
  status VARCHAR(20) NOT NULL DEFAULT 'SENT', -- SENT, DELIVERED
  file_id INT REFERENCES files(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id INT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  username VARCHAR(50) NOT NULL,
  PRIMARY KEY (conversation_id, username)
);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_messages_updated_at
BEFORE UPDATE ON messages
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);

-- Tabela de presença (status online/offline)
CREATE TABLE IF NOT EXISTS user_presence (
  username VARCHAR(50) PRIMARY KEY REFERENCES users(username) ON DELETE CASCADE,
  is_online BOOLEAN NOT NULL DEFAULT false,
  last_seen TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Tabela para armazenar mensagens pendentes de usuários offline
CREATE TABLE IF NOT EXISTS pending_messages (
  id SERIAL PRIMARY KEY,
  recipient_username VARCHAR(50) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  sender_username VARCHAR(50) NOT NULL,
  conversation_id INT NOT NULL REFERENCES conversations(id),
  content TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  delivered BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_pending_messages_recipient ON pending_messages(recipient_username, delivered);
CREATE INDEX IF NOT EXISTS idx_pending_messages_created ON pending_messages(created_at);

-- Tabela para rastrear status de leitura das mensagens
CREATE TABLE IF NOT EXISTS message_read_status (
  message_id INT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  reader_username VARCHAR(50) NOT NULL,
  read_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, reader_username)
);

CREATE INDEX IF NOT EXISTS idx_message_read_status ON message_read_status(message_id);

-- Uma conversa "default" pra facilitar testes
INSERT INTO conversations (name) VALUES ('demo-conversation')
ON CONFLICT DO NOTHING;
