const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "supersecret";

// Gera um token para login (aceita string ou objeto)
function generateToken(payload) {
  if (typeof payload === 'string') {
    return jwt.sign({ sub: payload }, SECRET, { expiresIn: "1d" });
  }
  // payload: { user_id, username }
  return jwt.sign({ sub: payload.username, user_id: payload.user_id }, SECRET, { expiresIn: "1d" });
}

// Valida e decodifica token
function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

// Middleware para rotas REST
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) {
    return res.status(401).json({ error: "No token provided" });
  }

  const [, token] = auth.split(" ");

  try {
    const payload = verifyToken(token);
    req.user = { username: payload.sub, user_id: payload.user_id };
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

module.exports = {
  generateToken,
  verifyToken,  
  authMiddleware
};
