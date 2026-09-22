const jwt = require("jsonwebtoken");
require("dotenv").config();

const secretKey = process.env.jwtSecretToken; // The same secret key used to generate tokens

const verifyToken = (req, res, next) => {
  let token = req.header("Authorization");

  if (!token) {
    return res
      .status(401)
      .json({ success: false, error: "Access denied. No token provided." });
  }

  if (token.startsWith("Bearer ") || token.startsWith("bearer ")) {
    token = token.slice(7).trim();
  }

  jwt.verify(token, secretKey, (err, decoded) => {
    if (err) {
      return res.status(401).json({ success: false, error: "Invalid or expired token." });
    }

    // Token is valid, and decoded data can be accessed via decoded.email, decoded.userId, etc.
    req.user = decoded;
    req.userId = decoded.userId || decoded.id;
    next(); // Move to the protected endpoint
  });
};

const refreshToken = (req, res) => {
  const credentials = req.params.emailOrPhone;

  if (!req.user) {
    return res.status(401).json({ success: false, error: "Authentication required to refresh token." });
  }

  const authenticatedIdentifier = req.user.email || req.user.phoneNumber || req.user.credentials;
  if (authenticatedIdentifier && authenticatedIdentifier !== credentials) {
    return res.status(403).json({ success: false, error: "Unauthorized token refresh attempt." });
  }

  const payload = {
    ...req.user,
    credentials,
  };
  delete payload.iat;
  delete payload.exp;

  const token = jwt.sign(payload, secretKey, {
    expiresIn: "28800s",
  });
  return res.status(200).send({
    success: true,
    message: "Successfully refreshed token",
    token,
    expiration: "28800",
  });
};

module.exports = { verifyToken, refreshToken };
