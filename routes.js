/**
 * Server-side API routes
 */
const express = require('express');
const router = express.Router();
const hostawayApi = require('./api');

// Sample data for fallback when API is not available
const sampleData = require('../src/sampleData').sampleData;

/**
 * Helper to respond with error
 */
const handleError = (res, error) => {
  console.error('API Error:', error);
  res.status(500).json({ error: { message: error.message || 'Internal server error' } });
};

/**
 * Get all listings/properties
 */
router.get('/api/listings', async (req, res) => {
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
});

/**
 * Get a single listing
 */
router.get('/api/listings/:id', async (req, res) => {
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
});

/**
 * Get all reservations
 */
router.get('/api/reservations', async (req, res) => {
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
});

/**
 * Get a single reservation
 */
router.get('/api/reservations/:id', async (req, res) => {
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
});

/**
 * Get calendar for a listing
 */
router.get('/api/calendar', async (req, res) => {
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
    handleError(res, error);
  }
});

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({ status: 'UP', timestamp: new Date().toISOString() });
});

module.exports = router;