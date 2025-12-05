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

-- Uma conversa “default” pra facilitar testes
INSERT INTO conversations (name) VALUES ('demo-conversation')
ON CONFLICT DO NOTHING;
