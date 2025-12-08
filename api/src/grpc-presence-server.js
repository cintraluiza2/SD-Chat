const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const db = require('./db');

const PROTO_PATH = path.join(__dirname, '../proto/presence.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const presenceProto = grpc.loadPackageDefinition(packageDefinition).presence;

async function updatePresence(call, callback) {
  let { is_online } = call.request;
  const { username } = call.request;
  console.log('[Presence] Valor bruto recebido:', { is_online, tipo: typeof is_online });
  // Aceita boolean, string, número
  if (typeof is_online === 'string') {
    is_online = is_online.toLowerCase() === 'true' || is_online === '1';
  } else if (typeof is_online === 'number') {
    is_online = is_online === 1;
  } else {
    is_online = !!is_online;
  }
  try {
    console.log('[Presence] updatePresence called:', { username, is_online });
    const exists = await db.query('SELECT username FROM user_presence WHERE username = $1', [username]);
    console.log('[Presence] user_presence exists:', exists.rows.length);
    if (exists.rows.length > 0) {
      console.log(`[Presence] UPDATE: username=${username}, is_online=${is_online}`);
      if (is_online) {
        await db.query('UPDATE user_presence SET is_online = $1, updated_at = NOW() WHERE username = $2', [true, username]);
        console.log('[Presence] user_presence updated:', { username, is_online: true });
      } else {
        await db.query('UPDATE user_presence SET is_online = $1, last_seen = NOW(), updated_at = NOW() WHERE username = $2', [false, username]);
        console.log('[Presence] user_presence updated:', { username, is_online: false, last_seen: new Date() });
      }
    } else {
      console.log(`[Presence] INSERT: username=${username}, is_online=${is_online}`);
      if (is_online) {
        await db.query('INSERT INTO user_presence (username, is_online, updated_at) VALUES ($1, $2, NOW())', [username, true]);
        console.log('[Presence] user_presence inserted:', { username, is_online: true });
      } else {
        await db.query('INSERT INTO user_presence (username, is_online, last_seen, updated_at) VALUES ($1, $2, NOW(), NOW())', [username, false]);
        console.log('[Presence] user_presence inserted:', { username, is_online: false, last_seen: new Date() });
      }
    }
    callback(null, { ok: true, status: is_online ? 'online' : 'offline' });
  } catch (err) {
    console.error('[Presence] updatePresence error:', err);
    callback(null, { ok: false, error: 'Failed to update presence', details: err.message });
  }
}

async function beaconPresence(call, callback) {
  const { token, is_online } = call.request;
  try {
    // Decodifica o token (simplificado)
    const parts = token.split('.');
    if (parts.length !== 3) return callback(null, { ok: false, error: 'Invalid token format' });
    const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    const username = decoded.username;
    const exists = await db.query('SELECT username FROM user_presence WHERE username = $1', [username]);
    if (exists.rows.length > 0) {
      await db.query('UPDATE user_presence SET is_online = $1, updated_at = NOW() WHERE username = $2', [is_online, username]);
    } else {
      await db.query('INSERT INTO user_presence (username, is_online, updated_at) VALUES ($1, $2, NOW())', [username, is_online]);
    }
    callback(null, { ok: true, status: is_online ? 'online' : 'offline' });
  } catch (err) {
    callback(null, { ok: false, error: 'Failed to update presence' });
  }
}

function main() {
  const server = new grpc.Server();
  server.addService(presenceProto.PresenceService.service, {
    UpdatePresence: updatePresence,
    BeaconPresence: beaconPresence,
  });
  server.bindAsync('0.0.0.0:50053', grpc.ServerCredentials.createInsecure(), () => {
    console.log('Presence gRPC server running on port 50053');
    server.start();
  });
}

main();
