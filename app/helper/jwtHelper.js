const jwt = require('jsonwebtoken');

// Verify JWT token middleware
const verifyJWT = (req, res, next) => {
    try {
        // Get token from header
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN format
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: 'Access denied. No token provided.' 
            });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.jwtSecretToken);
        req.user = decoded; // Add decoded user to request object
        next();
    } catch (error) {
        return res.status(403).json({ 
            success: false, 
            message: 'Invalid token.' 
        });
    }
};

// Generate JWT token
const generateJWT = (payload) => {
    return jwt.sign(
        payload,
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
    );
};

module.exports = {
    verifyJWT,
    generateJWT
}; 