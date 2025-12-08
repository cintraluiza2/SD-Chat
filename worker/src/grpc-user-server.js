const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const db = require('./db');
console.log('[gRPC] db importado com sucesso:', typeof db.query === 'function');

const USER_PROTO_PATH = path.join(__dirname, '../proto/user.proto');
const userPackageDef = protoLoader.loadSync(USER_PROTO_PATH);
const userProto = grpc.loadPackageDefinition(userPackageDef).user;

async function listUsers(call, callback) {
  try {
    // Busca todos os usuários e status de presença
    const usersResult = await db.query('SELECT username FROM users');
    const users = [];
    for (const row of usersResult.rows) {
      const presenceResult = await db.query('SELECT is_online FROM user_presence WHERE username = $1', [row.username]);
      let is_online = false;
      if (presenceResult.rows.length > 0) {
        const val = presenceResult.rows[0].is_online;
        console.log(`[gRPC] Presença para ${row.username}:`, val, typeof val);
        is_online = (val === true || val === 't' || val === 1 || val === 'true');
        is_online = !!is_online;
      } else {
        console.log(`[gRPC] Sem registro de presença para ${row.username}`);
      }
      users.push({
        username: row.username,
        is_online
      });
    }
    callback(null, { users });
  } catch (err) {
    console.error('[gRPC] ListUsers error:', err);
    callback(null, { users: [], error: 'Failed to list users' });
  }
}

function main() {
  const server = new grpc.Server();
  server.addService(userProto.UserService.service, {
    ListUsers: listUsers
  });
  server.bindAsync('0.0.0.0:50054', grpc.ServerCredentials.createInsecure(), () => {
    console.log('[gRPC] UserService rodando na porta 50054');
    server.start();
  });
}

main();
