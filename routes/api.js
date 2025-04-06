const express = require('express');
const router = express.Router();
const axios = require('axios');
const { authenticateToken } = require('../middleware/auth');
const config = require("../data/config.json");

// Hostaway API configuration
const HOSTAWAY_BASE_URL = 'https://api.hostaway.com/v1';
const HOSTAWAY_CLIENT_ID = config.HOSTAWAY_CLIENT_ID;
const HOSTAWAY_CLIENT_SECRET = config.HOSTAWAY_CLIENT_SECRET;

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

/**
 * Utility to make API requests with proper error handling
 * @param {string} method - HTTP method
 * @param {string} endpoint - API endpoint
 * @param {object} queryParams - Query parameters
 * @param {object} data - Request body data
 * @returns {Promise<object>} Response data
 */
async function makeApiRequest(method, endpoint, queryParams = {}, data = null, user = null) {
  try {
    // Get auth token
    const token = await getAuthToken();
    
    // Build the URL with query params
    let queryString = Object.keys(queryParams).length ? 
    '?' + new URLSearchParams(queryParams).toString() : '';

    if (user) {
      queryString = queryString != '' ? `${queryString}&userId=${user.userId}` : `?userId=${user.userId}`;
    }
    
    const url = `${HOSTAWAY_BASE_URL}${endpoint}${queryString}`;
    console.log(`Making API request: ${method} ${url} ${user}`);
    
    // Make request to Hostaway API
    const response = await axios({
      method,
      url,
      data,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });

    console.log({response: response && response.data.result.length})
    
    return response.data;
  } catch (error) {
    // Log the error details
    console.error(`API request error (${endpoint}):`, error.message);
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
      
      // Handle different error status codes
      switch (error.response.status) {
        case 401:
          // Token might be expired, invalidate it to force a new one
          authToken = null;
          tokenExpires = 0;
          throw new Error('Authentication failed. Please try again.');
        
        case 404:
          throw new Error(`Resource not found: ${endpoint}`);
          
        case 429:
          throw new Error('API rate limit exceeded. Please try again later.');
          
        case 500:
        case 502:
        case 503:
        case 504:
          throw new Error('Hostaway API is currently unavailable. Please try again later.');
          
        default:
          throw new Error(error.response.data?.message || 
            `API request failed with status ${error.response.status}`);
      }
    } else if (error.request) {
      // The request was made but no response was received
      throw new Error('No response received from API. Please check your network connection.');
    } else {
      // Something happened in setting up the request
      throw error;
    }
  }
}

// Middleware to protect all API routes
router.use(authenticateToken);

// API route handlers for different endpoints
router.get('/listings', async (req, res, next) => {
  console.log({ req: req.user, query: req.query });
  // const data1 = await makeApiRequest('GET', '/users', req.query, null, req.user);
  // console.log({data1: data1.result})
  try {
    const data = await makeApiRequest('GET', '/listings', req.query, null, req.user);
    res.json(data);
  } catch (error) {
    // Using sample data as fallback
    console.warn('Falling back to sample data for listings:', error.message);
    try {
      // Load sample data (assuming it's defined elsewhere)
      const sampleData = require('../../src/sampleData').properties || [];
      
      res.json({
        result: {
          listings: sampleData.map(prop => ({
            id: prop.id,
            name: prop.name,
            address: {
              full: prop.address,
              city: prop.address?.split(',')[1]?.trim() || '',
              country: prop.address?.split(',')[2]?.trim() || ''
            }
          }))
        }
      });
    } catch (fallbackError) {
      next(error); // If fallback fails, use the original error
    }
  }
});

// Get a single listing
router.get('/listings/:id', async (req, res, next) => {
  try {
    const data = await makeApiRequest('GET', `/listings/${req.params.id}`);
    res.json(data);
  } catch (error) {
    // Using sample data as fallback
    console.warn('Falling back to sample data for single listing:', error.message);
    try {
      // Load sample data
      const sampleData = require('../../src/sampleData').properties || [];
      const property = sampleData.find(p => p.id === req.params.id);
      
      if (property) {
        res.json({ result: property });
      } else {
        res.status(404).json({ error: { message: 'Listing not found' } });
      }
    } catch (fallbackError) {
      next(error);
    }
  }
});

// Get reservations
router.get('/reservations', async (req, res, next) => {
  try {
    console.log({ query: req.query })
    const data = await makeApiRequest('GET', '/reservations', req.query);
    res.json(data);
  } catch (error) {
    console.warn('Falling back to sample data for reservations:', error.message);
    try {
      // Load sample data
      const sampleData = require('../../src/sampleData').reservations || [];
      
      // Helper function for calculating nights
      const calculateNights = (checkIn, checkOut) => {
        const start = new Date(checkIn);
        const end = new Date(checkOut);
        const diffTime = Math.abs(end - start);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      };
      
      // Convert to API format
      const sampleReservations = sampleData.map(res => ({
        id: res.id,
        listingId: res.propertyId,
        guestName: res.guestName,
        checkInDate: res.checkIn,
        checkOutDate: res.checkOut,
        basePrice: res.pricePerNight,
        cleaningFee: res.cleaningFee,
        amenitiesFee: res.amenities,
        extraFees: res.extraFees,
        totalPrice: res.pricePerNight * calculateNights(res.checkIn, res.checkOut) + 
                  res.cleaningFee + res.amenities + res.extraFees,
        source: res.bookingSource,
        status: res.status
      }));
      
      // Filter and paginate based on query params
      let filteredReservations = filterReservations(sampleReservations, req.query);
      const paginatedData = paginateResults(filteredReservations, req.query);
      
      res.json({
        result: {
          reservations: paginatedData.items,
          meta: paginatedData.meta
        }
      });
      
    } catch (fallbackError) {
      next(error);
    }
  }
});

// Get a single reservation
router.get('/reservations/:id', async (req, res, next) => {
  try {
    const data = await makeApiRequest('GET', `/reservations/${req.params.id}`);
    res.json(data);
  } catch (error) {
    console.warn('Falling back to sample data for single reservation:', error.message);
    try {
      // Load sample data
      const sampleData = require('../../src/sampleData').reservations || [];
      const reservation = sampleData.find(r => r.id === req.params.id);
      
      if (reservation) {
        const nights = calculateNights(reservation.checkIn, reservation.checkOut);
        
        res.json({ 
          result: {
            id: reservation.id,
            listingId: reservation.propertyId,
            guestName: reservation.guestName,
            checkInDate: reservation.checkIn,
            checkOutDate: reservation.checkOut,
            basePrice: reservation.pricePerNight,
            cleaningFee: reservation.cleaningFee,
            amenitiesFee: reservation.amenities,
            extraFees: reservation.extraFees,
            totalPrice: reservation.pricePerNight * nights + 
                      reservation.cleaningFee + reservation.amenities + reservation.extraFees,
            source: reservation.bookingSource,
            status: reservation.status
          }
        });
      } else {
        res.status(404).json({ error: { message: 'Reservation not found' } });
      }
    } catch (fallbackError) {
      next(error);
    }
  }
});

// Get calendar data
router.get('/calendar', async (req, res, next) => {
  const { listingId, startDate, endDate } = req.query;
  
  if (!listingId || !startDate || !endDate) {
    return res.status(400).json({
      error: { message: 'Missing required parameters: listingId, startDate, endDate' }
    });
  }
  
  try {
    const data = await makeApiRequest('GET', '/calendar', req.query);
    res.json(data);
  } catch (error) {
    // For calendar, we don't have a good sample data fallback, so pass to error handler
    next(error);
  }
});

/**
 * Get consolidated financial report
 */
router.post('/finance/report/consolidated', async (req, res, next) => {
  try {
    // Extract parameters from request body
    const { 
      listingMapIds, // Can be an array or comma-separated string
      fromDate,
      toDate,
      dateType
    } = req.body;
    
    // Prepare request body
    const requestBody = {
      statuses: ['confirmed']
    };
    
    // Handle listingMapIds parameter - can be array or string
    if (listingMapIds) {
      if (Array.isArray(listingMapIds)) {
        requestBody.listingMapIds = listingMapIds;
      } else if (typeof listingMapIds === 'string') {
        // If it's a comma-separated string, split it
        requestBody.listingMapIds = listingMapIds.split(',').map(id => id.trim());
      } else {
        // If it's a single value
        requestBody.listingMapIds = [listingMapIds];
      }
    }
    
    // Format dates to Y-m-d
    const formatDate = (dateInput) => {
      if (!dateInput) return null;
      const date = new Date(dateInput);
      // Check if date is valid
      if (isNaN(date.getTime())) {
        throw new Error(`Invalid date input: ${dateInput}`);
      }
      // Format to YYYY-MM-DD
      return date.toISOString().split('T')[0];
    };
    
    // Add formatted dates
    if (fromDate) requestBody.fromDate = formatDate(fromDate);
    if (toDate) requestBody.toDate = formatDate(toDate);
    if (dateType) requestBody.dateType = dateType;
    
    console.log({requestBody})
    
    // Make request using makeApiRequest with JSON body
    const data = await makeApiRequest('POST', '/finance/report/consolidated', {}, requestBody);
    
    res.json(data);
  } catch (error) {
    // Error handling is now part of makeApiRequest
    next(error);
  }
});

router.post('/finance/report/listingFinancials', async (req, res, next) => {
  try {
    // Extract parameters from request body
    const { 
      listingMapIds, // Can be an array or comma-separated string
      fromDate,
      toDate,
      dateType
    } = req.body;
    
    // Prepare request body
    const requestBody = {
      statuses: ['confirmed']
    };
    
    // Handle listingMapIds parameter - can be array or string
    if (listingMapIds) {
      if (Array.isArray(listingMapIds)) {
        requestBody.listingMapIds = listingMapIds;
      } else if (typeof listingMapIds === 'string') {
        // If it's a comma-separated string, split it
        requestBody.listingMapIds = listingMapIds.split(',').map(id => id.trim());
      } else {
        // If it's a single value
        requestBody.listingMapIds = [listingMapIds];
      }
    }
    
    // Format dates to Y-m-d
    const formatDate = (dateInput) => {
      if (!dateInput) return null;
      const date = new Date(dateInput);
      // Check if date is valid
      if (isNaN(date.getTime())) {
        throw new Error(`Invalid date input: ${dateInput}`);
      }
      // Format to YYYY-MM-DD
      return date.toISOString().split('T')[0];
    };
    
    // Add formatted dates
    if (fromDate) requestBody.fromDate = formatDate(fromDate);
    if (toDate) requestBody.toDate = formatDate(toDate);
    if (dateType) requestBody.dateType = dateType;
    
    // Make request using makeApiRequest with JSON body
    const data = await makeApiRequest('POST', '/finance/report/listingFinancials', {}, requestBody);
    
    res.json(data);
  } catch (error) {
    // Error handling is now part of makeApiRequest
    next(error);
  }
});

// Helper Functions

// Filter reservations helper
function filterReservations(reservations, query) {
  let filtered = [...reservations];
  
  // Apply listing filter
  if (query.listingId) {
    filtered = filtered.filter(r => r.listingId === query.listingId);
  }
  
  // Apply date filters
  if (query.arrivalStartDate) {
    const startDate = new Date(query.arrivalStartDate);
    filtered = filtered.filter(r => new Date(r.checkInDate) >= startDate);
  }
  
  if (query.departureEndDate) {
    const endDate = new Date(query.departureEndDate);
    filtered = filtered.filter(r => new Date(r.checkOutDate) <= endDate);
  }
  
  // Apply status filter
  if (query.status) {
    filtered = filtered.filter(r => r.status === query.status);
  }
  
  // Apply search filter
  if (query.search) {
    const searchTerm = query.search.toLowerCase();
    filtered = filtered.filter(r => r.guestName.toLowerCase().includes(searchTerm));
  }
  
  return filtered;
}

// Paginate results helper
function paginateResults(items, query) {
  const limit = parseInt(query.limit) || 10;
  const offset = parseInt(query.offset) || 0;
  
  return {
    items: items.slice(offset, offset + limit),
    meta: {
      total: items.length,
      limit,
      offset,
      hasMore: offset + limit < items.length
    }
  };
}

// Calculate nights between two dates
function calculateNights(checkIn, checkOut) {
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  const diffTime = Math.abs(end - start);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

module.exports = router;