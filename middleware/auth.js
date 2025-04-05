/**
 * Authentication middleware for protecting routes
 */
const jwt = require('jsonwebtoken');
const path = require('path');

// Use absolute path to avoid module resolution issues
const Users = require(path.join(__dirname, '../models/users'));

// JWT secret key (in a real app, store this in an environment variable)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-for-jwt-dev-only';
const JWT_EXPIRES_IN = '24h'; // Token expiration time

/**
 * Generate a JWT token for a user
 * @param {Object} user - User object
 * @returns {string} - JWT token
 */
const generateToken = (user) => {
  return jwt.sign(
    { 
      userId: user.id,
      email: user.email,
      role: user.role,
      haUserId: user.userId  // Include Hostaway user ID in the token
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

/**
 * Verify JWT token and attach user to request
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const authenticateToken = (req, res, next) => {
  // Get token from Authorization header
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN"
  
  if (!token) {
    return res.status(401).json({ error: { message: 'Authentication required' } });
  }
  
  try {
    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Find user by ID
    Users.findById(decoded.userId)
      .then(user => {
        if (!user) {
          return res.status(401).json({ error: { message: 'Invalid user' } });
        }
        
        // Attach user to request
        req.user = user;
        next();
      })
      .catch(error => {
        console.error('User lookup error:', error);
        return res.status(500).json({ error: { message: 'Server error' } });
      });
  } catch (error) {
    console.error('Token verification error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: { message: 'Token expired' } });
    }
    
    return res.status(401).json({ error: { message: 'Invalid token' } });
  }
};

/**
 * Check if user has required role
 * @param {string|string[]} roles - Required role(s)
 * @returns {Function} - Express middleware
 */
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: { message: 'Authentication required' } });
    }
    
    const requiredRoles = Array.isArray(roles) ? roles : [roles];
    
    if (!requiredRoles.includes(req.user.role)) {
      return res.status(403).json({ error: { message: 'Access forbidden' } });
    }
    
    next();
  };
};

module.exports = {
  generateToken,
  authenticateToken,
  requireRole
};