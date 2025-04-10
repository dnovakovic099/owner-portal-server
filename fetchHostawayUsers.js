const axios = require('axios');
const config = require('./data/config.json');

// Hostaway API configuration
const HOSTAWAY_BASE_URL = 'https://api.hostaway.com/v1';
const HOSTAWAY_CLIENT_ID = config.HOSTAWAY_CLIENT_ID;
const HOSTAWAY_CLIENT_SECRET = config.HOSTAWAY_CLIENT_SECRET;

// Get authentication token
async function getAuthToken() {
  try {
    console.log('Authenticating with Hostaway API...');
    
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
    return response.data.access_token;
  } catch (error) {
    console.error('Authentication error:', error.response?.data || error.message);
    throw new Error('Failed to authenticate with Hostaway API');
  }
}

// Fetch users from Hostaway API
async function fetchHostawayUsers() {
  try {
    // Get auth token
    const token = await getAuthToken();
    
    // Make request to get users
    const response = await axios.get(`${HOSTAWAY_BASE_URL}/users`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });
    
    console.log('Successfully fetched users');
    console.log(JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('Error fetching users:', error.response?.data || error.message);
    throw error;
  }
}

// Execute the script
fetchHostawayUsers().catch(error => {
  console.error('Script failed:', error.message);
  process.exit(1);
});