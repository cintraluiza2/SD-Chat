-- Adiciona coluna para senha (hash) e user_id único
ALTER TABLE users ADD COLUMN IF NOT EXISTS id SERIAL PRIMARY KEY;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
-- Garante username único
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);