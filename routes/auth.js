const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const path = require('path');
const bcrypt = require("bcryptjs");
const { AppDataSource } = require("../config/database");
const MobileUserEntity = require("../models/MobileUser");
const FCMToken = require('../models/FCMToken');

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
    const mobileUserRepo = AppDataSource.getRepository(MobileUserEntity);
    const user = await mobileUserRepo.findOne({ where: { email } });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.json(401).json({
        status: false,
        message: "Invalid Credentials"
      });
    }
    
    const payload = {
      userId: user.id,
      email,
      name: `${user.firstName} ${user.lastName}`,
      haUserId: user.hostawayId
    };

    const userObj = user;
    userObj.userId = user.hostawayId;
    userObj.name = `${user.firstName} ${user.lastName}`

    userObj.password = undefined;
    userObj.user_id = undefined;
    userObj.hostawayId = undefined;
    userObj.firstName = undefined;
    userObj.lastName = undefined;
    userObj.revenueSharing = undefined;
    userObj.referralCode = undefined;

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRY });
    return res.status(200).json({
      user: userObj,
      token,
    })

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: { message: 'Server error occurred during login' } });
  }
});

/**
 * Get current user
 * GET /api/auth/me
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const mobileUserRepo = AppDataSource.getRepository(MobileUserEntity);
    const email = req.user.email;

    const user = await mobileUserRepo.findOne({
      where: { email },
      select: ["id", "email", "firstName", "lastName", "hostawayId", "referralCode", "revenueSharing", "user_id"]
    });

    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    return res.status(200).json(user);
  } catch (error) {
    console.error('Something went wrong fetching user details');
    console.error(error);
    return res.status(500).json({ status: false, message: "Something went wrong fetching user details" });
  }
});

/**
 * Verify token
 * POST /api/auth/verify
 */
router.post('/verify', authenticateToken, (req, res) => {
  // If middleware passes, token is valid
  res.json({ valid: true, user: req.user });
});

router.post('/fcm-token', authenticateToken, async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user?.userId;
    if (!token) {
      console.error(`Token not found in request`);
      return res.status(400).json({ message: 'Token is required.' });
    }

    const fcmTokenRepo = AppDataSource.getRepository(FCMToken);

    console.log(`[saveFCMToken] New token received for user ${req.user?.name}`);
    console.log(`[saveFCMToken] Token: ${token}`);

    const fcmToken = fcmTokenRepo.create({
      token,
      userId
    });

    await fcmTokenRepo.save(fcmToken);
    console.log(`[saveFCMToken] Token saved successfully!!!`);
    res.status(201).json({ message: 'FCM token saved successfully.' });
  } catch (error) {
    console.error('Error saving FCM token:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
})

module.exports = router;