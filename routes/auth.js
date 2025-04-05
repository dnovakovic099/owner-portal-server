const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const path = require('path');

// Use absolute paths to avoid module resolution issues
const Users = require(path.join(__dirname, '../models/users'));
const { authenticateToken } = require(path.join(__dirname, '../middleware/auth'));

/**
 * Login route
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  // Validate input
  if (!email || !password) {
    return res.status(400).json({ error: { message: 'Email and password are required' } });
  }
  
  try {
    // Authenticate user
    const user = await Users.authenticate(email, password);
    
    if (!user) {
      return res.status(401).json({ error: { message: 'Invalid email or password' } });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id,
        email: user.email,
        role: user.role,
        haUserId: user.userId  // Include Hostaway user ID in the token
      },
      process.env.JWT_SECRET || 'your-secret-key-for-jwt-dev-only',
      { expiresIn: '24h' }
    );
    
    // Return user and token
    res.json({
      user: {
        ...user,
        // Ensure userId is included in the response
        userId: user.userId || null
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: { message: 'Server error occurred during login' } });
  }
});

/**
 * Get current user
 * GET /api/auth/me
 */
router.get('/me', authenticateToken, (req, res) => {
  // User is already attached to request by authenticateToken middleware
  res.json({ user: req.user });
});

/**
 * Verify token
 * POST /api/auth/verify
 */
router.post('/verify', authenticateToken, (req, res) => {
  // If middleware passes, token is valid
  res.json({ valid: true, user: req.user });
});

module.exports = router;