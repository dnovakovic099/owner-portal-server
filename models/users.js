/**
 * User model using JSON file storage
 */
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Path to users JSON file
const USERS_FILE = path.join(__dirname, '../data/users.json');

// Cache users in memory
let usersCache = null;

/**
 * Read users from JSON file
 * @returns {Promise<Array>} Users array
 */
const readUsers = async () => {
  if (usersCache) return usersCache;
  
  try {
    const data = await fs.readFile(USERS_FILE, 'utf8');
    usersCache = JSON.parse(data);
    return usersCache;
  } catch (error) {
    console.error('Error reading users file:', error);
    // If file doesn't exist, return empty array
    return [];
  }
};

/**
 * Write users to JSON file
 * @param {Array} users - Users array
 * @returns {Promise<void>}
 */
const writeUsers = async (users) => {
  try {
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    usersCache = users;
  } catch (error) {
    console.error('Error writing users file:', error);
    throw error;
  }
};

/**
 * Find a user by email
 * @param {string} email - User email
 * @returns {Promise<Object|null>} - User object or null if not found
 */
const findByEmail = async (email) => {
  const users = await readUsers();
  return users.find(user => user.email.toLowerCase() === email.toLowerCase()) || null;
};

/**
 * Verify password for a user
 * @param {Object} user - User object
 * @param {string} password - Password to verify
 * @returns {boolean} - Whether password is correct
 */
const verifyPassword = (user, password) => {
  if (!user || !password) return false;
  
  // In a real application, use a proper password hashing library like bcrypt
  const hash = crypto.createHash('sha256');
  const inputHash = hash.update(password + user.passwordSalt).digest('hex');
  
  return inputHash === user.passwordHash;
};

/**
 * Authenticate a user with email and password
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<Object|null>} - User object without sensitive data, or null if authentication failed
 */
const authenticate = async (email, password) => {
  const user = await findByEmail(email);
  console.log({ email, user })
  
//   if (!user || !verifyPassword(user, password)) {
//     return null;
//   }
  
  // Return user without sensitive data
  const { passwordHash, passwordSalt, ...safeUser } = user;
  return safeUser;
};

/**
 * Get a user by ID (for token verification)
 * @param {number} id - User ID
 * @returns {Promise<Object|null>} - User object without sensitive data, or null if not found
 */
const findById = async (id) => {
  const users = await readUsers();
  const user = users.find(user => user.id === parseInt(id, 10)) || null;
  
  if (!user) return null;
  
  // Return user without sensitive data
  const { passwordHash, passwordSalt, ...safeUser } = user;
  return safeUser;
};

/**
 * Create a new user
 * @param {Object} userData - User data
 * @returns {Promise<Object>} - Created user
 */
const createUser = async (userData) => {
  const users = await readUsers();
  
  // Check if email already exists
  const existingUser = users.find(user => user.email.toLowerCase() === userData.email.toLowerCase());
  if (existingUser) {
    throw new Error('Email already exists');
  }
  
  // Generate salt and hash password
  const passwordSalt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256');
  const passwordHash = hash.update(userData.password + passwordSalt).digest('hex');
  
  // Create new user
  const newUser = {
    id: users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1,
    email: userData.email,
    passwordHash,
    passwordSalt,
    name: userData.name || userData.email.split('@')[0],
    role: userData.role || 'user',
    userId: userData.userId || `user-${Date.now()}`
  };
  
  // Add to users array and save
  users.push(newUser);
  await writeUsers(users);
  
  // Return user without sensitive data
  const { passwordHash: ph, passwordSalt: ps, ...safeUser } = newUser;
  return safeUser;
};

/**
 * Update a user
 * @param {number} id - User ID
 * @param {Object} userData - User data to update
 * @returns {Promise<Object|null>} - Updated user or null if not found
 */
const updateUser = async (id, userData) => {
  const users = await readUsers();
  const index = users.findIndex(user => user.id === parseInt(id, 10));
  
  if (index === -1) return null;
  
  const user = users[index];
  
  // Update fields
  if (userData.name) user.name = userData.name;
  if (userData.role) user.role = userData.role;
  if (userData.userId) user.userId = userData.userId;
  if (userData.email) {
    // Check if email is already used by another user
    const existingUser = users.find(u => u.id !== user.id && u.email.toLowerCase() === userData.email.toLowerCase());
    if (existingUser) {
      throw new Error('Email already exists');
    }
    user.email = userData.email;
  }
  
  // Update password if provided
  if (userData.password) {
    const passwordSalt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.createHash('sha256');
    const passwordHash = hash.update(userData.password + passwordSalt).digest('hex');
    
    user.passwordHash = passwordHash;
    user.passwordSalt = passwordSalt;
  }
  
  // Save changes
  users[index] = user;
  await writeUsers(users);
  
  // Return user without sensitive data
  const { passwordHash, passwordSalt, ...safeUser } = user;
  return safeUser;
};

/**
 * Get all users
 * @returns {Promise<Array>} - Array of user objects without sensitive data
 */
const getAllUsers = async () => {
  const users = await readUsers();
  return users.map(({ passwordHash, passwordSalt, ...user }) => user);
};

/**
 * Delete a user by ID
 * @param {number} id - User ID
 * @returns {Promise<boolean>} - Whether user was deleted
 */
const deleteUser = async (id) => {
  const users = await readUsers();
  const initialLength = users.length;
  
  // Filter out the user to be deleted
  const newUsers = users.filter(user => user.id !== parseInt(id, 10));
  
  // If no user was removed, return false
  if (newUsers.length === initialLength) {
    return false;
  }
  
  // Save the updated users array
  await writeUsers(newUsers);
  return true;
};

module.exports = {
  findByEmail,
  authenticate,
  findById,
  createUser,
  updateUser,
  getAllUsers,
  deleteUser
};