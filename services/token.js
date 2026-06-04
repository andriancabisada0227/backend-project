const jwt = require("jsonwebtoken");
require("dotenv").config();

const secretKey = process.env.jwtSecretToken; // The same secret key used to generate tokens

const verifyToken = (req, res, next) => {
  const token = req.header("Authorization");

  if (!token) {
    return res
      .status(401)
      .json({ success: false, error: "Access denied. No token provided." });
  }

  jwt.verify(token, secretKey, (err, decoded) => {
    if (err) {
      return res.status(401).json({ success: false, error: "Token Expired." });
    }

    // Token is valid, and decoded data can be accessed via decoded.email, decoded.userId, etc.
    req.user = decoded;
    next(); // Move to the protected endpoint
  });
};

const refreshToken = (req, res) => {
  const credentials = req.params.emailOrPhone;

  const token = jwt.sign({ credentials }, process.env.jwtSecretToken, {
    expiresIn: "28800s",
  });
  return res.status(200).send({
    success: true,
    message: "Successfully refresh token",
    token,
    expiration: "28800",
  });
};

module.exports = { verifyToken, refreshToken };
