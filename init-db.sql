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

-- Uma conversa “default” pra facilitar testes
INSERT INTO conversations (name) VALUES ('demo-conversation')
ON CONFLICT DO NOTHING;
