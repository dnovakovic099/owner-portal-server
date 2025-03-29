/**
 * Server-side API functions for Hostaway integration
 */
const fetch = require('node-fetch');
const { AbortController } = require('node-fetch/externals');

// Configuration
const API_BASE_URL = process.env.HOSTAWAY_API_URL || 'http://localhost:3001/api';
const API_KEY = process.env.HOSTAWAY_API_KEY || 'your-api-key';
const REQUEST_TIMEOUT = 30000; // 30 seconds

// Sample data as fallback
const sampleData = require('../src/sampleData').sampleData;

/**
 * Make API request with proper error handling and timeouts
 * @param {string} endpoint - API endpoint
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {Object} data - Optional request body for POST/PUT requests
 * @returns {Promise<Object>} - API response data
 */
async function apiRequest(endpoint, method = 'GET', data = null) {
  const url = `${API_BASE_URL}${endpoint}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-API-KEY': API_KEY
    },
    signal: controller.signal
  };
  
  if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(data);
  }

  try {
    console.log(`Making server-side API request to: ${url}`);
    const response = await fetch(url, options);
    
    // Clear the timeout since request completed
    clearTimeout(timeoutId);
    
    // Handle HTTP error responses
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `API request failed with status ${response.status}`;
      
      // Create a detailed error object
      const error = new Error(errorMessage);
      error.status = response.status;
      error.statusText = response.statusText;
      error.url = url;
      error.data = errorData;
      
      throw error;
    }
    
    const responseData = await response.json();
    return responseData;
  } catch (error) {
    // Handle specific error types
    if (error.name === 'AbortError') {
      throw new Error(`API request timed out after ${REQUEST_TIMEOUT}ms: ${url}`);
    }
    
    // Log detailed error information
    console.error('Server API request error:', {
      message: error.message,
      endpoint,
      method,
      status: error.status,
      url: error.url || url
    });
    
    // Rethrow the error for the caller to handle
    throw error;
  }
}

/**
 * Server-side Hostaway API client with built-in error handling and fallbacks
 */
const hostawayApi = {
  /**
   * Get all listings/properties
   * @param {Object} params - Optional query parameters
   * @returns {Promise<Object>} Listings response
   */
  getListings: async (params = {}) => {
    try {
      const queryParams = new URLSearchParams(params).toString();
      const endpoint = `/listings${queryParams ? `?${queryParams}` : ''}`;
      return await apiRequest(endpoint);
    } catch (error) {
      console.warn('Falling back to sample data for listings:', error.message);
      
      // Fallback to sample data
      return {
        result: {
          listings: sampleData.properties.map(prop => ({
            id: prop.id,
            name: prop.name,
            address: {
              full: prop.address,
              city: prop.address.split(',')[1]?.trim() || '',
              country: prop.address.split(',')[2]?.trim() || ''
            }
          }))
        }
      };
    }
  },
  
  /**
   * Get a single listing by ID
   * @param {number} listingId - Listing ID
   * @returns {Promise<Object>} Listing data
   */
  getListingById: async (listingId) => {
    try {
      return await apiRequest(`/listings/${listingId}`);
    } catch (error) {
      console.warn('Falling back to sample data for single listing:', error.message);
      
      // Fallback to sample data
      const property = sampleData.properties.find(p => p.id === listingId);
      
      if (!property) {
        const notFoundError = new Error('Listing not found');
        notFoundError.status = 404;
        throw notFoundError;
      }
      
      return { result: property };
    }
  },
  
  /**
   * Get all reservations
   * @param {Object} params - Optional query parameters
   * @returns {Promise<Object>} Reservations response
   */
  getReservations: async (params = {}) => {
    try {
      const queryParams = new URLSearchParams(params).toString();
      const endpoint = `/reservations${queryParams ? `?${queryParams}` : ''}`;
      return await apiRequest(endpoint);
    } catch (error) {
      console.warn('Falling back to sample data for reservations:', error.message);
      
      // Helper for calculating nights
      const calculateNights = (checkIn, checkOut) => {
        const start = new Date(checkIn);
        const end = new Date(checkOut);
        const diffTime = Math.abs(end - start);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      };
      
      // Convert to API format
      let reservations = sampleData.reservations.map(res => ({
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
      
      // Apply filters if specified
      if (params.listingId) {
        reservations = reservations.filter(r => r.listingId == params.listingId);
      }
      
      if (params.status) {
        reservations = reservations.filter(r => r.status === params.status);
      }
      
      if (params.search) {
        const searchTerm = params.search.toLowerCase();
        reservations = reservations.filter(r => 
          r.guestName.toLowerCase().includes(searchTerm)
        );
      }
      
      // Apply pagination
      const limit = parseInt(params.limit) || 10;
      const offset = parseInt(params.offset) || 0;
      
      return {
        result: {
          reservations: reservations.slice(offset, offset + limit),
          meta: {
            total: reservations.length,
            limit,
            offset,
            hasMore: offset + limit < reservations.length
          }
        }
      };
    }
  },
  
  /**
   * Get confirmed reservations
   * @param {Object} params - Additional query parameters
   * @returns {Promise<Object>} Confirmed reservations
   */
  getConfirmedReservations: async (params = {}) => {
    // Add status=confirmed to the query parameters
    return hostawayApi.getReservations({
      ...params,
      status: 'confirmed'
    });
  },
  
  /**
   * Get a single reservation by ID
   * @param {number} reservationId - Reservation ID
   * @returns {Promise<Object>} Reservation data
   */
  getReservationById: async (reservationId) => {
    try {
      return await apiRequest(`/reservations/${reservationId}`);
    } catch (error) {
      console.warn('Falling back to sample data for single reservation:', error.message);
      
      // Fallback to sample data
      const reservation = sampleData.reservations.find(r => r.id === reservationId);
      
      if (!reservation) {
        const notFoundError = new Error('Reservation not found');
        notFoundError.status = 404;
        throw notFoundError;
      }
      
      const nights = (new Date(reservation.checkOut) - new Date(reservation.checkIn)) / 
                     (1000 * 60 * 60 * 24);
      
      return { 
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
      };
    }
  },
  
  /**
   * Get calendar availability for a listing
   * @param {number} listingId - Listing ID
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Promise<Object>} Calendar data
   */
  getCalendar: async (listingId, startDate, endDate) => {
    try {
      const queryParams = new URLSearchParams({
        listingId,
        startDate,
        endDate
      }).toString();
      
      const endpoint = `/calendar?${queryParams}`;
      return await apiRequest(endpoint);
    } catch (error) {
      // For calendar, we don't provide a fallback and just pass the error up
      console.error('Error fetching calendar data:', error.message);
      throw error;
    }
  },
  
  /**
   * Initialize the API
   * Check server health
   */
  initialize: async () => {
    try {
      // Check if server is running
      const response = await fetch(`${API_BASE_URL.split('/api')[0]}/health`, {
        timeout: 5000
      });
      
      if (!response.ok) {
        throw new Error(`Server status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('✅ Successfully connected to local proxy server');
      return data.status === 'ok';
    } catch (error) {
      console.error('❌ Failed to connect to local proxy server:', error.message);
      console.log('Make sure the server is running on http://localhost:3001');
      return false;
    }
  }
};

module.exports = hostawayApi;