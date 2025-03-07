const express = require('express');
const cors = require('cors');
const axios = require('axios');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Hostaway API configuration
const HOSTAWAY_BASE_URL = 'https://api.hostaway.com/v1';
const HOSTAWAY_CLIENT_ID = '64614';
const HOSTAWAY_CLIENT_SECRET = 'b637e4a97f831428501b0519783608b3a3af24d40ad2fba8281d9a131802e036';

// Initialize app
const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for React application
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));

// Parse JSON body
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  next();
});

// Authentication token cache
let authToken = null;
let tokenExpires = 0;

// Get authentication token
async function getAuthToken() {
  // Check if token is still valid
  if (authToken && tokenExpires > Date.now()) {
    return authToken;
  }

  try {
    console.log('Attempting to authenticate with Hostaway API...');
    
    // Create form data for authentication request
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', HOSTAWAY_CLIENT_ID);
    params.append('client_secret', HOSTAWAY_CLIENT_SECRET);
    params.append('scope', 'general');
    
    const response = await axios.post(`${HOSTAWAY_BASE_URL}/accessTokens`, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    console.log('Authentication successful');
    
    // Store token and expiration
    authToken = response.data.access_token;
    // Set expiration to slightly before the actual expiry
    tokenExpires = Date.now() + (response.data.expires_in * 1000) - (5 * 60 * 1000);
    
    return authToken;
  } catch (error) {
    console.error('Authentication error:', error.response?.data || error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Headers:', error.response.headers);
      console.error('Data:', error.response.data);
    }
    throw new Error('Failed to authenticate with Hostaway API');
  }
}

// API route handlers for different endpoints
app.get('/api/listings', async (req, res) => {
  try {
    // Get auth token
    const token = await getAuthToken();
    
    // Build the URL with query params
    const queryString = Object.keys(req.query).length ? 
      '?' + new URLSearchParams(req.query).toString() : '';
    
    const url = `${HOSTAWAY_BASE_URL}/listings${queryString}`;
    console.log(`Making API request: GET ${url}`);
    
    // Make request to Hostaway API
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    // Send response back to client
    res.json(response.data);
  } catch (error) {
    handleApiError(error, res);
  }
});

// Get a single listing
app.get('/api/listings/:id', async (req, res) => {
  try {
    // Get auth token
    const token = await getAuthToken();
    
    const url = `${HOSTAWAY_BASE_URL}/listings/${req.params.id}`;
    console.log(`Making API request: GET ${url}`);
    
    // Make request to Hostaway API
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    // Send response back to client
    res.json(response.data);
  } catch (error) {
    handleApiError(error, res);
  }
});

// Get reservations
app.get('/api/reservations', async (req, res) => {
  try {
    // Get auth token
    const token = await getAuthToken();
    
    // Build the URL with query params
    const queryString = Object.keys(req.query).length ? 
      '?' + new URLSearchParams(req.query).toString() : '';
    
    const url = `${HOSTAWAY_BASE_URL}/reservations${queryString}`;
    console.log(`Making API request: GET ${url}`);
    
    // Make request to Hostaway API
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    // Send response back to client
    res.json(response.data);
  } catch (error) {
    handleApiError(error, res);
  }
});

// Get a single reservation
app.get('/api/reservations/:id', async (req, res) => {
  try {
    // Get auth token
    const token = await getAuthToken();
    
    const url = `${HOSTAWAY_BASE_URL}/reservations/${req.params.id}`;
    console.log(`Making API request: GET ${url}`);
    
    // Make request to Hostaway API
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    // Send response back to client
    res.json(response.data);
  } catch (error) {
    handleApiError(error, res);
  }
});

// Get calendar data
app.get('/api/calendar', async (req, res) => {
  try {
    // Get auth token
    const token = await getAuthToken();
    
    // Build the URL with query params
    const queryString = Object.keys(req.query).length ? 
      '?' + new URLSearchParams(req.query).toString() : '';
    
    const url = `${HOSTAWAY_BASE_URL}/calendar${queryString}`;
    console.log(`Making API request: GET ${url}`);
    
    // Make request to Hostaway API
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    // Send response back to client
    res.json(response.data);
  } catch (error) {
    handleApiError(error, res);
  }
});

// Helper function for handling API errors
function handleApiError(error, res) {
  console.error('API error:', error.message);
  if (error.response) {
    console.error('Status:', error.response.status);
    console.error('Data:', error.response.data);
  }
  
  // Send error to client
  res.status(error.response?.status || 500).json({
    error: error.response?.data || { message: error.message }
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Hostaway proxy server running on port ${PORT}`);
  console.log(`Access the API at http://localhost:${PORT}/api/...`);
  console.log(`Client ID: ${HOSTAWAY_CLIENT_ID ? '✓ Set' : '✗ Missing'}`);
  console.log(`Client Secret: ${HOSTAWAY_CLIENT_SECRET ? '✓ Set' : '✗ Missing'}`);
});