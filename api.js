/**
 * Server-side API functions for Hostaway integration
 */
const fetch = require('node-fetch');

// Configuration
const API_BASE_URL = process.env.HOSTAWAY_API_URL || 'http://localhost:3001/api';
const API_KEY = process.env.HOSTAWAY_API_KEY || 'your-api-key';

/**
 * Make API request to the Hostaway API
 */
async function apiRequest(endpoint, method = 'GET', data = null) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-API-KEY': API_KEY
    }
  };
  
  if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(data);
  }

  console.log(`Making server-side API request to: ${url}`);
  
  try {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API request failed with status ${response.status}`);
    }
    
    const responseData = await response.json();
    console.log({ responseData })
    return responseData;
  } catch (error) {
    console.error('Server API request error:', error);
    throw error;
  }
}

/**
 * Server-side Hostaway API client
 */
const hostawayApi = {
  /**
   * Get all listings/properties
   * @param {Object} params - Optional query parameters
   * @returns {Promise<Object>} Listings response
   */
  getListings: async (params = {}) => {
    const queryParams = new URLSearchParams(params).toString();
    const endpoint = `/listings${queryParams ? `?${queryParams}` : ''}`;
    return apiRequest(endpoint);
  },
  
  /**
   * Get a single listing by ID
   * @param {number} listingId - Listing ID
   * @returns {Promise<Object>} Listing data
   */
  getListingById: async (listingId) => {
    return apiRequest(`/listings/${listingId}`);
  },
  
  /**
   * Get all reservations
   * @param {Object} params - Optional query parameters
   * @returns {Promise<Object>} Reservations response
   */
  getReservations: async (params = {}) => {
    const queryParams = new URLSearchParams(params).toString();
    const endpoint = `/reservations${queryParams ? `?${queryParams}` : ''}`;
    return apiRequest(endpoint);
  },
  
  /**
   * Get confirmed reservations
   * @param {Object} params - Additional query parameters
   * @returns {Promise<Object>} Confirmed reservations
   */
  getConfirmedReservations: async (params = {}) => {
    // Add status=confirmed to the query parameters
    const queryParams = new URLSearchParams({
      ...params,
      status: 'confirmed'
    }).toString();
    
    const endpoint = `/reservations?${queryParams}`;
    return apiRequest(endpoint);
  },
  
  /**
   * Get a single reservation by ID
   * @param {number} reservationId - Reservation ID
   * @returns {Promise<Object>} Reservation data
   */
  getReservationById: async (reservationId) => {
    return apiRequest(`/reservations/${reservationId}`);
  },
  
  /**
   * Get calendar availability for a listing
   * @param {number} listingId - Listing ID
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Promise<Object>} Calendar data
   */
  getCalendar: async (listingId, startDate, endDate) => {
    const queryParams = new URLSearchParams({
      listingId,
      startDate,
      endDate
    }).toString();
    
    const endpoint = `/calendar?${queryParams}`;
    return apiRequest(endpoint);
  }
};

module.exports = hostawayApi;