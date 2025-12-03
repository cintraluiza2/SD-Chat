const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "supersecret";

// Gera um token para login
function generateToken(username) {
  return jwt.sign({ sub: username }, SECRET, { expiresIn: "1d" });
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
    req.user = { username: payload.sub };
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
