/**
 * Server-side API routes with robust error handling
 */
const express = require('express');
const router = express.Router();
const hostawayApi = require('./api');

// Sample data for fallback when API is not available
const sampleData = require('../src/sampleData').sampleData;

/**
 * Helper to respond with error
 * @param {Response} res - Express response object
 * @param {Error} error - Error object
 * @param {number} status - HTTP status code
 */
const handleError = (res, error, status = 500) => {
  // Log the error details
  console.error('API Error:', {
    message: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    status: error.status || status
  });
  
  // Determine appropriate status code
  const statusCode = error.status || status;
  
  // Send error response
  res.status(statusCode).json({ 
    error: { 
      message: error.message || 'Internal server error',
      code: error.code,
      // Only include detailed info in development
      details: process.env.NODE_ENV === 'development' ? error.data : undefined
    } 
  });
};

/**
 * Middleware to handle async route handlers
 * @param {Function} fn - Async route handler
 * @returns {Function} Express middleware
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((error) => {
    handleError(res, error);
  });
};

/**
 * Get all listings/properties
 */
router.get('/api/listings', asyncHandler(async (req, res) => {
  try {
    const response = await hostawayApi.getListings(req.query);
    res.json(response);
  } catch (error) {
    console.warn('Falling back to sample data for listings');
    // Fallback to sample data
    res.json({
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
    });
  }
}));

/**
 * Get calendar for a listing
 */
router.get('/api/calendar', asyncHandler(async (req, res) => {
  const { listingId, startDate, endDate } = req.query;
  
  if (!listingId || !startDate || !endDate) {
    return res.status(400).json({ 
      error: { message: 'Missing required parameters: listingId, startDate, endDate' }
    });
  }
  
  try {
    const response = await hostawayApi.getCalendar(listingId, startDate, endDate);
    res.json(response);
  } catch (error) {
    // For calendar, we don't have a good sample data fallback
    // so we return an appropriate error
    handleError(res, error, error.status || 500);
  }
}));

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  const healthData = {
    status: 'UP',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  };
  
  res.json(healthData);
});

// Handle 404 for undefined API routes
router.use('/api/*', (req, res) => {
  res.status(404).json({
    error: {
      message: `API endpoint not found: ${req.originalUrl}`,
      status: 404
    }
  });
});

// Helper function
function calculateNights(checkIn, checkOut) {
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  const diffTime = Math.abs(end - start);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

module.exports = router;

/**
 * Get a single reservation
 */
router.get('/api/reservations/:id', asyncHandler(async (req, res) => {
  try {
    const response = await hostawayApi.getReservationById(req.params.id);
    res.json(response);
  } catch (error) {
    console.warn('Falling back to sample data for single reservation');
    // Fallback to sample data
    const reservation = sampleData.reservations.find(r => r.id === req.params.id);
    
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
  }
}));

/**
 * Get a single listing
 */
router.get('/api/listings/:id', asyncHandler(async (req, res) => {
  try {
    const response = await hostawayApi.getListingById(req.params.id);
    res.json(response);
  } catch (error) {
    console.warn('Falling back to sample data for single listing');
    // Fallback to sample data
    const property = sampleData.properties.find(p => p.id === req.params.id);
    
    if (property) {
      res.json({ result: property });
    } else {
      res.status(404).json({ error: { message: 'Listing not found' } });
    }
  }
}));

/**
 * Get all reservations
 */
router.get('/api/reservations', asyncHandler(async (req, res) => {
  try {
    let response;
    
    // Check if status=confirmed is in query params
    if (req.query.status === 'confirmed') {
      response = await hostawayApi.getConfirmedReservations(req.query);
    } else {
      response = await hostawayApi.getReservations(req.query);
    }
    
    res.json(response);
  } catch (error) {
    console.warn('Falling back to sample data for reservations');
    
    // Helper function for calculating nights
    const calculateNights = (checkIn, checkOut) => {
      const start = new Date(checkIn);
      const end = new Date(checkOut);
      const diffTime = Math.abs(end - start);
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };
    
    // Convert to API format
    const sampleReservations = sampleData.reservations.map(res => ({
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
    
    // Filter based on query params
    let filteredReservations = [...sampleReservations];
    
    // Apply listing filter
    if (req.query.listingId) {
      filteredReservations = filteredReservations.filter(r => 
        r.listingId === req.query.listingId
      );
    }
    
    // Apply date filters
    if (req.query.arrivalStartDate) {
      const startDate = new Date(req.query.arrivalStartDate);
      filteredReservations = filteredReservations.filter(r => 
        new Date(r.checkInDate) >= startDate
      );
    }
    
    if (req.query.departureEndDate) {
      const endDate = new Date(req.query.departureEndDate);
      filteredReservations = filteredReservations.filter(r => 
        new Date(r.checkOutDate) <= endDate
      );
    }
    
    // Apply current status filters
    if (req.query.arrivalEndDate && req.query.departureStartDate) {
      const arrivalEnd = new Date(req.query.arrivalEndDate);
      const departureStart = new Date(req.query.departureStartDate);
      
      filteredReservations = filteredReservations.filter(r => {
        const checkIn = new Date(r.checkInDate);
        const checkOut = new Date(r.checkOutDate);
        return checkIn <= arrivalEnd && checkOut >= departureStart;
      });
    }
    
    // Apply status filter
    if (req.query.status) {
      filteredReservations = filteredReservations.filter(r => 
        r.status === req.query.status
      );
    }
    
    // Apply search filter
    if (req.query.search) {
      const searchTerm = req.query.search.toLowerCase();
      filteredReservations = filteredReservations.filter(r => 
        r.guestName.toLowerCase().includes(searchTerm)
      );
    }
    
    // Apply pagination
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    
    const paginatedReservations = filteredReservations.slice(offset, offset + limit);
    
    res.json({
      result: {
        reservations: paginatedReservations,
        meta: {
          total: filteredReservations.length,
          limit,
          offset,
          hasMore: offset + limit < filteredReservations.length
        }
      }
    });
  }
}));

/**
 * Get consolidated financial report
 */
router.post('/api/finance/report/consolidated', asyncHandler(async (req, res) => {
  console.log("TEST")
  try {
    // Convert JSON body to form data for the Hostaway API
    const params = new URLSearchParams();
    
    // Add all parameters from request body to form data
    for (const [key, value] of Object.entries(req.body)) {
      params.append(key, value);
    }
    
    // Get auth token
    const token = await getAuthToken();
    
    // Make request to Hostaway API
    const response = await fetch(`${HOSTAWAY_BASE_URL}/finance/report/consolidated`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API request failed with status ${response.status}`);
    }
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching consolidated financial report:', error);
    handleError(res, error);
  }
}));