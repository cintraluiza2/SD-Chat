const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const db = require('./db');
const { hashPassword, comparePassword } = require('./password');
const { generateToken } = require('./auth');

const PROTO_PATH = path.join(__dirname, '../proto/auth.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const authProto = grpc.loadPackageDefinition(packageDefinition).auth;

async function register(call, callback) {
  const { username, password } = call.request;
  try {
    const userExists = await db.query('SELECT id FROM users WHERE username = $1', [username]);
    if (userExists.rows.length > 0) {
      return callback(null, { error: 'username already exists' });
    }
    const password_hash = await hashPassword(password);
    const result = await db.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
      [username, password_hash]
    );
    callback(null, { id: result.rows[0].id, username });
  } catch (err) {
    callback(null, { error: 'Failed to register' });
  }
}

async function login(call, callback) {
  const { username, password } = call.request;
  try {
    const user = await db.query('SELECT id, username, password_hash FROM users WHERE username = $1', [username]);
    if (user.rows.length === 0) {
      return callback(null, { error: 'Invalid credentials' });
    }
    const valid = await comparePassword(password, user.rows[0].password_hash);
    if (!valid) {
      return callback(null, { error: 'Invalid credentials' });
    }
    const token = generateToken({ user_id: user.rows[0].id, username: user.rows[0].username });
    callback(null, { token });
  } catch (err) {
    callback(null, { error: 'Failed to login' });
  }
}

function main() {
  const server = new grpc.Server();
  server.addService(authProto.AuthService.service, {
    Register: register,
    Login: login,
  });
  server.bindAsync('0.0.0.0:50052', grpc.ServerCredentials.createInsecure(), () => {
    console.log('Auth gRPC server running on port 50052');
    server.start();
  });
}

main();
