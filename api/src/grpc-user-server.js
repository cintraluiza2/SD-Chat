const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const db = require('./db');

const PROTO_PATH = path.join(__dirname, '../proto/user.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true, // ESSENCIAL para manter is_online
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const userProto = grpc.loadPackageDefinition(packageDefinition).user;

async function listUsers(call, callback) {
  try {
    const result = await db.query(`SELECT u.username, (up.is_online IS TRUE) as is_online FROM users u LEFT JOIN user_presence up ON u.username = up.username ORDER BY u.username ASC`);
    // Garante que is_online sempre existe (mesmo que seja false)
    const users = result.rows.map(u => ({
      username: u.username,
      is_online: typeof u.is_online === 'boolean' ? u.is_online : false
    }));
    callback(null, { users });
  } catch (err) {
    callback(null, { error: 'Failed to fetch users' });
  }
}

async function getPendingMessages(call, callback) {
  const { username } = call.request;
  try {
    const result = await db.query(`SELECT id, sender_username, conversation_id, content, created_at FROM pending_messages WHERE recipient_username = $1 AND delivered = false ORDER BY created_at ASC`, [username]);
    callback(null, { pendingMessages: result.rows });
  } catch (err) {
    callback(null, { error: 'Failed to fetch pending messages' });
  }
}

function main() {
  const server = new grpc.Server();
  server.addService(userProto.UserService.service, {
    ListUsers: listUsers,
    GetPendingMessages: getPendingMessages,
  });
  server.bindAsync('0.0.0.0:50054', grpc.ServerCredentials.createInsecure(), () => {
    console.log('User gRPC server running on port 50054');
    server.start();
  });
}

main();
