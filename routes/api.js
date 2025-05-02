const express = require('express');
const router = express.Router();
const axios = require('axios');
const { authenticateToken } = require('../middleware/auth');
const config = require("../data/config.json");
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const HostawayUser = require("../models/HostawayUser");
const MobileUser = require("../models/MobileUser");
const PartnershipInfo = require("../models/PartnershipInfo");
const { AppDataSource } = require('../config/database');
const { sendNotificationToUser } = require('../utils/notification');
const formatCurrency = require('../utils/formatCurrency');
const { In } = require('typeorm');


// Hostaway API configuration
const HOSTAWAY_BASE_URL = 'https://api.hostaway.com/v1';
const HOSTAWAY_CLIENT_ID = config.HOSTAWAY_CLIENT_ID;
const HOSTAWAY_CLIENT_SECRET = config.HOSTAWAY_CLIENT_SECRET;

// Authentication token cache
let authToken = null;
let tokenExpires = 0;

// Environment variables or config for Airdna credentials 
const AIRDNA_EMAIL = config.AIRDNA_EMAIL || process.env.AIRDNA_EMAIL;
const AIRDNA_PASSWORD = config.AIRDNA_PASSWORD || process.env.AIRDNA_PASSWORD;

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
// router.use(authenticateToken);

// API route handlers for different endpoints
router.get('/listings', authenticateToken, async (req, res, next) => {
  // const data1 = await makeApiRequest('GET', '/users', req.query, null, req.user);
  try {
    const data = await makeApiRequest('GET', '/listings', req.query, null, req.user);

    // if (req.user.email != 'dnovakovic21@gmail.com' && data && data.result && data.result.length > 50) {
    //   return res.json({
    //     result: {
    //       listings: []
    //     }
    //   });
    // }

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
router.get('/listings/:id', authenticateToken, async (req, res, next) => {
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
router.get('/reservations', authenticateToken, async (req, res, next) => {
  try {
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
router.get('/reservations/:id', authenticateToken, async (req, res, next) => {
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
router.get('/calendar', authenticateToken, async (req, res, next) => {
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
router.post('/finance/report/consolidated', authenticateToken, async (req, res, next) => {
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
    const data = await makeApiRequest('POST', '/finance/report/consolidated', {}, requestBody);
    
    res.json(data);
  } catch (error) {
    // Error handling is now part of makeApiRequest
    next(error);
  }
});

router.post('/finance/report/listingFinancials', authenticateToken, async (req, res, next) => {
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

/**
 * Get income estimate from Airdna
 * This endpoint scrapes Airdna.co to get income estimates for a property
 */
router.get('/income-estimate', authenticateToken, async (req, res, next) => {
  // Get query parameters: address, bedrooms, bathrooms, accommodates
  const { address, city, state, zipCode, bedrooms, bathrooms, accommodates } = req.query;
  
  // Check required parameters
  if (!address) {
    return res.status(400).json({
      error: { message: 'Missing required parameter: address' }
    });
  }

  // Create a full address string including city, state, and zip if provided
  let fullAddress = address;
  if (city) fullAddress += `, ${city}`;
  if (state) fullAddress += `, ${state}`;
  if (zipCode) fullAddress += ` ${zipCode}`;

  // Check if Airdna credentials are available
  if (!AIRDNA_EMAIL || !AIRDNA_PASSWORD) {
    return res.status(500).json({
      error: { message: 'Airdna credentials not configured on the server' }
    });
  }

  console.log({ AIRDNA_EMAIL, AIRDNA_PASSWORD, fullAddress, bedrooms, bathrooms, accommodates });

  let browser;
  try {
    // Create a new browser instance and open the page
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    
    // Set viewport size
    await page.setViewport({ width: 1280, height: 800 });

    // Go to Airdna login page
    const loginPages = [
      'https://auth.airdna.co/oauth2/authorize?response_type=code&scope=profile+openid&state=%7B%22path%22%3A%22%2Fdata%2Fus%22%2C%22search%22%3A%22%22%7D&client_id=5f040464-0aef-48a1-a1d1-daa9fbf81415&redirect_uri=https%3A%2F%2Fapp.airdna.co',
    ];

    let loginSuccess = false;
    for (const loginUrl of loginPages) {
      try {
        await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Check if we've reached a login page by looking for common login elements
        const hasLoginElements = await page.evaluate(() => {
          const emailInput = document.querySelector('input[type="email"], input#loginId, input[name="email"], input.amplify-input');
          const passwordInput = document.querySelector('input[type="password"], input#password, input[name="password"], input[placeholder="Password"]');
          return !!(emailInput && passwordInput);
        });
        
        if (hasLoginElements) {
          loginSuccess = true;
          break;
        }
      } catch (err) {
        console.warn(`Failed to load ${loginUrl}: ${err.message}`);
      }
    }
    
    if (!loginSuccess) {
      throw new Error('Could not load Airdna login page');
    }
    
    // Wait for email and password inputs to appear
    try {
      await page.waitForSelector('input#loginId, input[type="email"], input[name="email"], input.amplify-input, input[placeholder*="mail"]', {
        visible: true,
        timeout: 10000
      });
      
      await page.waitForSelector('input#password, input[type="password"], input[name="password"], input[placeholder="Password"]', {
        visible: true,
        timeout: 5000
      });
    } catch (err) {
      console.warn('Could not find login inputs using standard selectors:', err.message);
    }
    
    // Try to find the email and password input handles with multiple selectors
    const emailInputSelectors = [
      'input#loginId',
      'input[type="email"]',
      'input[name="email"]',
      'input.amplify-input',
      'input[placeholder*="mail"]'
    ];
    
    const passwordInputSelectors = [
      'input#password',
      'input[type="password"]',
      'input[name="password"]',
      'input[placeholder="Password"]'
    ];
    
    let emailInputHandle = null;
    for (const selector of emailInputSelectors) {
      emailInputHandle = await page.$(selector);
      if (emailInputHandle) {
        console.log(`Found email input with selector: ${selector}`);
        break;
      }
    }
    
    let passwordInputHandle = null;
    for (const selector of passwordInputSelectors) {
      passwordInputHandle = await page.$(selector);
      if (passwordInputHandle) {
        console.log(`Found password input with selector: ${selector}`);
        break;
      }
    }
    
    // If we can't find the form elements, try looking for them in the page
    if (!emailInputHandle || !passwordInputHandle) {
      // Save a screenshot and HTML for debugging
      // await page.screenshot({ path: path.join(screenshotsDir, `airdna-login-form-not-found-${Date.now()}.png`) });
      // fs.writeFileSync(path.join(screenshotsDir, `airdna-login-form-not-found-${Date.now()}.html`), await page.content());
      
      throw new Error('Could not find login form elements on the page. The page structure may have changed.');
    }

    console.log('Login form elements found, attempting to log in...');
    
    // Try to clear inputs first
    try {
      await emailInputHandle.click({ clickCount: 3 }); // Triple click to select all text
      await emailInputHandle.press('Backspace'); // Clear the field
      
      await passwordInputHandle.click({ clickCount: 3 });
      await passwordInputHandle.press('Backspace');
    } catch (e) {
      console.warn('Error during input clearing:', e.message);
    }

    // Fill in login credentials using the handles we found - with detailed logging
    console.log(`Typing email: ${AIRDNA_EMAIL}`);
    try {
      await emailInputHandle.type(AIRDNA_EMAIL, { delay: 100 });
      console.log('Successfully typed email');
    } catch (e) {
      console.error('Error typing email:', e.message);
      
      // Try alternative approach using page.evaluate
      await page.evaluate((selector, value) => {
        const input = document.querySelector(selector);
        if (input) {
          input.value = value;
          const event = new Event('input', { bubbles: true });
          input.dispatchEvent(event);
        }
      }, 'input#loginId', AIRDNA_EMAIL);
      console.log('Tried alternative approach for typing email');
    }

    console.log(`Typing password: [hidden for security]`);
    try {
      await passwordInputHandle.type(AIRDNA_PASSWORD, { delay: 100 });
      console.log('Successfully typed password');
    } catch (e) {
      console.error('Error typing password:', e.message);
      
      // Try alternative approach using page.evaluate
      await page.evaluate((selector, value) => {
        const input = document.querySelector(selector);
        if (input) {
          input.value = value;
          const event = new Event('input', { bubbles: true });
          input.dispatchEvent(event);
        }
      }, 'input#password', AIRDNA_PASSWORD);
      console.log('Tried alternative approach for typing password');
    }
    
    // Find and click the login button 
    console.log('Looking for login button...');

    // Try to find the login button by evaluating page content for any button with "Log In" text
    const loginButtonHandle = await page.evaluateHandle(() => {
      // Look for any button containing "Log In"
      const buttons = Array.from(document.querySelectorAll('button, .amplify-button'));
      const loginBtn = buttons.find(btn => 
        btn.textContent.trim() === 'Log In' || 
        btn.textContent.trim() === 'Log in' || 
        btn.textContent.trim() === 'LOGIN' || 
        btn.textContent.trim() === 'login'
      );
      
      if (loginBtn) {
        console.log('Found login button with text:', loginBtn.textContent.trim());
        return loginBtn;
      }
      
      console.log('No button with "Log In" text found, looking for submit button...');
      // Look for submit button
      return buttons.find(btn => btn.type === 'submit') || null;
    });

    if (!loginButtonHandle || (await loginButtonHandle.evaluate(btn => !btn))) {
      console.error('Could not find login button by text content');
      
      // Try to find button using common CSS selectors
      const submitButtonSelector = 'button[type="submit"], button.amplify-button--primary, .amplify-button';
      const submitButtonHandle = await page.$(submitButtonSelector);
      
      if (!submitButtonHandle) {
        console.error('Could not find login submit button with selector:', submitButtonSelector);
        
        // Try to press Enter to submit the form
        console.log('No login button found, trying to submit form with Enter key');
        await passwordInputHandle.press('Enter');
        
        try {
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
          console.log('Navigation occurred after pressing Enter');
        } catch (e) {
          console.warn('Navigation timeout after pressing Enter:', e.message);
          console.log('Continuing anyway since some forms submit without navigation');
        }
      } else {
        console.log('Found login button with CSS selector');
        // Click the submit button and wait for navigation
        try {
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
            submitButtonHandle.click()
          ]);
          console.log('Navigation occurred after clicking button');
        } catch (e) {
          console.warn('Navigation issue after clicking button:', e.message);
          console.log('Continuing anyway since login might have worked');
        }
      }
    } else {
      console.log('Found login button by text content, clicking it...');
      // Click the login button and wait for navigation
      try {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
          loginButtonHandle.click()
        ]);
        console.log('Navigation occurred after clicking login button');
      } catch (e) {
        console.warn('Navigation issue after clicking login button:', e.message);
        console.log('Continuing anyway since login might have worked');
      }
    }
    
    // Verify login was successful and we were redirected to the app
    console.log('Checking if login was successful...');
    await new Promise(resolve => setTimeout(resolve, 2000)); // Give the page a moment to fully load after redirect

    // Take a screenshot of where we landed
    // await page.screenshot({ path: path.join(screenshotsDir, `airdna-post-login-${Date.now()}.png`) });

    // Check the current URL to see if we're logged in to the app
    const currentUrl = page.url();
    console.log('Current URL after login attempt:', currentUrl);

    // Check if we're on a dashboard/app page
    const isLoggedIn = currentUrl.includes('app.airdna.co') || 
                      currentUrl.includes('dashboard') || 
                      currentUrl.includes('rentalizer');

    if (!isLoggedIn) {
      console.error('Login appears to have failed, still on login page or error page');
      // fs.writeFileSync(path.join(screenshotsDir, `airdna-login-failed-${Date.now()}.html`), await page.content());
      throw new Error('Failed to log in to Airdna with the provided credentials');
    }

    console.log('Successfully logged in to Airdna');
    console.log(`Navigating to Rentalizer to fetch income estimate for address: ${fullAddress}`);

    // Use the correct URL for the rentalizer tool
    const rentalizerUrls = [
      'https://app.airdna.co/data/my-rentalizer',  // Primary URL provided by user
      'https://app.airdna.co/us/rentalizer',
      'https://app.airdna.co/rentalizer',
      'https://app.airdna.co/calculator',
      'https://www.airdna.co/vacation-rental-data/app/us/rentalizer'
    ];
    
    let navigatedToRentalizer = false;
    for (const url of rentalizerUrls) {
      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Check if we found the search box
        const searchBox = await page.$('input[placeholder*="Search"], input[placeholder*="search"], input[placeholder*="address"], input[placeholder*="Address"]');
        if (searchBox) {
          navigatedToRentalizer = true;
          break;
        }
      } catch (err) {
        console.warn(`Failed to navigate to ${url}: ${err.message}`);
      }
    }
    
    if (!navigatedToRentalizer) {
      throw new Error('Could not find the Rentalizer tool. The URL may have changed.');
    }
    
    // Take screenshot of rentalizer page
    // await page.screenshot({ path: path.join(screenshotsDir, `airdna-rentalizer-${Date.now()}.png`) });
    
    // Find and use the search box
    const searchBoxSelector = 'input[placeholder*="Search"], input[placeholder*="search"], input[placeholder*="address"], input[placeholder*="Address"]';
    await page.waitForSelector(searchBoxSelector, { timeout: 10000 });
    
    const searchBox = await page.$(searchBoxSelector);
    if (!searchBox) {
      throw new Error('Search box not found on Rentalizer page');
    }
    
    // Enter the address in the search box
    await searchBox.type(fullAddress);
    console.log('Entered address in search box:', fullAddress);
    await page.keyboard.press('Enter');
    
    // Wait longer initially for the dropdown to appear and populate with options
    console.log('Waiting for address search to process and dropdown to appear...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Take screenshot at this point to see what we have
    // await page.screenshot({ path: `${screenshotsDir}/after-address-entry.png` });
    
    // Check for dropdown visibility after the initial wait
    const dropdownVisible = await page.evaluate(() => {
      const dropdown = document.querySelector('.MuiAutocomplete-popper, .MuiAutocomplete-listbox, [role="listbox"]');
      return !!dropdown;
    });
    
    if (dropdownVisible) {
      console.log('Address dropdown is visible');
    } else {
      console.log('Address dropdown not visible yet, waiting longer...');
      // Wait additional time for dropdown to appear
      await new Promise(resolve => setTimeout(resolve, 5000));
      // await page.screenshot({ path: `${screenshotsDir}/after-extended-dropdown-wait.png` });
    }
    
    // Try to select from the dropdown if visible
    const addressOptions = await page.evaluate(() => {
      const options = Array.from(document.querySelectorAll('.MuiAutocomplete-option, [role="option"]'));
      return options.map(opt => ({
        text: opt.textContent.trim(),
        exists: true
      }));
    });
    
    console.log(`Found ${addressOptions.length} address options in dropdown`);
    
    if (addressOptions.length > 0) {
      console.log('Selecting first address option');
      try {
        // Click the first option
        await page.click('.MuiAutocomplete-option:first-child, [role="option"]:first-child');
        console.log('Successfully clicked first address option');
      } catch (error) {
        console.log('Failed to click option directly:', error.message);
        
        // Try alternate method - use keyboard navigation
        try {
          console.log('Trying keyboard navigation to select address');
          await page.keyboard.press('ArrowDown');
          await new Promise(resolve => setTimeout(resolve, 1000));
          await page.keyboard.press('Enter');
          console.log('Used keyboard navigation to select address');
        } catch (keyError) {
          console.log('Keyboard navigation failed:', keyError.message);
        }
      }
    } else {
      // If no dropdown options found but we see addresses in the UI, try clicking where they should be
      console.log('No dropdown options found via evaluate, trying direct click approach');
      try {
        // Try clicking in areas where addresses might appear
        const potentialSelectors = [
          '.MuiAutocomplete-popper .MuiAutocomplete-option:first-child', 
          '[role="listbox"] [role="option"]:first-child',
          '.results-list li:first-child',
          '.address-results li:first-child'
        ];
        
        for (const selector of potentialSelectors) {
          const exists = await page.$(selector);
          if (exists) {
            console.log(`Found potential address option with selector: ${selector}`);
            await page.click(selector);
            console.log(`Clicked on ${selector}`);
            break;
          }
        }
      } catch (clickError) {
        console.log('Direct click approach failed:', clickError.message);
      }
    }
    
    // Wait longer for results to load after attempting to select an address
    console.log('Waiting for results to load after address selection...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Give time for the page to load the results
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('Waiting for rental data to load...');
    
    // Take a screenshot after selection
    // await page.screenshot({ path: `${screenshotsDir}/after-address-selection.png` });
    console.log('Saved screenshot after address selection');

    // Check if rental data is displayed on the page
    const rentalDataSelectors = [
      '.MuiTypography-body1:contains("Projected Revenue")',
      '.MuiTypography-body1:contains("Occupancy")',
      '.MuiTypography-body1:contains("ADR")',
      '.MuiTypography-body1:contains("Operating Expenses")'
    ];
    
    let rentalDataFound = false;
    for (const selector of rentalDataSelectors) {
      const hasData = await page.evaluate((sel) => {
        // Use a function that mimics jQuery :contains selector since regular querySelector doesn't support it
        function findElementsContainingText(selector, text) {
          const elements = document.querySelectorAll(selector.split(':contains')[0]);
          return Array.from(elements).filter(el => el.textContent.includes(text));
        }
        
        const searchText = sel.match(/:contains\("(.+?)"\)/)[1];
        const elements = findElementsContainingText(sel.split(':contains')[0], searchText);
        return elements.length > 0;
      }, selector);

      console.log({ hasData, selector });
      
      if (hasData) {
        console.log(`Found rental data using selector: ${selector}`);
        rentalDataFound = true;
        break;
      }
    }
    
    if (!rentalDataFound) {
      console.log('No rental data selectors found on page yet. Taking screenshot and waiting longer...');
      // await page.screenshot({ path: `${screenshotsDir}/no-rental-data-yet.png` });
      
      // Wait longer to see if data appears
      await new Promise(resolve => setTimeout(resolve, 15000));
      // await page.screenshot({ path: `${screenshotsDir}/after-extended-wait.png` });
    }

    // Skip the search results selection step if we already see rental data
    if (!rentalDataFound) {
      // Wait for search results to load with more flexible selector
      const searchResultsSelector = '.search-results, .results-list, .address-results, ul[role="listbox"]';
      await page.waitForSelector(searchResultsSelector, { timeout: 15000 }).catch(() => {
        throw new Error('Search results not found on Airdna');
      });

      // Take screenshot of search results
      // await page.screenshot({ path: path.join(screenshotsDir, `airdna-search-results-${Date.now()}.png`) });

      // Get the first result and click on it
      const firstResultSelector = `${searchResultsSelector} li:first-child, ${searchResultsSelector} .result:first-child`;
      const firstResult = await page.$(firstResultSelector);
      if (!firstResult) {
        throw new Error('No results found for the given address');
      }
      
      await firstResult.click();

      // Wait for the rentalizer data to load with more flexible selector
      const resultsSelector = '.rentalizer-results, .results-container, .revenue-data, .revenue-summary';
      await page.waitForSelector(resultsSelector, { timeout: 20000 }).catch(() => {
        throw new Error('Rental data not found for this location');
      });

      // Take screenshot of results page
      // await page.screenshot({ path: path.join(screenshotsDir, `airdna-results-page-${Date.now()}.png`) });
    }

    // Extract income data from the page
    const pageContent = await page.content();
    const $ = cheerio.load(pageContent);
    
    // Save the full HTML for debugging
    // fs.writeFileSync(path.join(screenshotsDir, `airdna-results-${Date.now()}.html`), pageContent);
    
    // Extract data from the HTML using Cheerio with very specific selectors
    
    // First, extract the property address - using a more precise selector
    const propertyAddress = $('h6.MuiTypography-titleXXS').first().text().trim().split('USAApr')[0].trim();
    
    // Look directly for values with specific classes and positions in the HTML structure
    // For the revenue card, we need to find the value within the projected revenue box
    let annualRevenue = '';
    $('.MuiTypography-body1:contains("Projected Revenue")').each(function() {
      // We need to go to the parent of the parent's parent to find the container with both elements
      const containerDiv = $(this).parent().parent().parent();
      
      // Look for the h3 within this container
      const valueElement = containerDiv.find('h3.MuiTypography-titleM');
      
      if (valueElement.length) {
        annualRevenue = valueElement.text().trim();
      }
    });

    // Since it appears the extracted string contains multiple values concatenated together,
    // let's parse them correctly based on the pattern we see: $219K59%$1022
    // Revenue: starts with $ and ends with K
    // Occupancy: contains % symbol
    // ADR: starts with $ and contains a number without K

    let combinedValues = annualRevenue;

    // Parse the values from the combined string if needed
    let parsedAnnualRevenue = '';
    let parsedOccupancy = '';
    let parsedDailyRate = '';

    if (combinedValues && combinedValues.includes('$') && combinedValues.includes('%')) {
      // Extract revenue (pattern: $XXXK)
      const revenueMatch = combinedValues.match(/\$[\d.]+K/);
      if (revenueMatch) {
        parsedAnnualRevenue = revenueMatch[0];
      }
      
      // Extract occupancy (pattern: XX%)
      const occupancyMatch = combinedValues.match(/[\d.]+%/);
      if (occupancyMatch) {
        parsedOccupancy = occupancyMatch[0];
      }
      
      // Extract ADR (pattern: $XXX with no K after)
      const adrMatch = combinedValues.match(/\$[\d.]+(?!K)/);
      if (adrMatch) {
        parsedDailyRate = adrMatch[0];
      }
      
      // Use parsed values if they exist
      annualRevenue = parsedAnnualRevenue || annualRevenue;
      averageOccupancy = parsedOccupancy || '';
      averageDailyRate = parsedDailyRate || '';
    } else {
      // If we don't have a combined string, try the original approach for the other metrics
      
      // Update occupancy with the same pattern
      $('.MuiTypography-body1:contains("Occupancy")').each(function() {
        const containerDiv = $(this).parent().parent().parent();
        const valueElement = containerDiv.find('h3.MuiTypography-titleM');
        if (valueElement.length) {
          averageOccupancy = valueElement.text().trim();
        }
      });
      
      // Update ADR with the same pattern
      $('.MuiTypography-body1:contains("ADR")').each(function() {
        const containerDiv = $(this).parent().parent().parent();
        const valueElement = containerDiv.find('h3.MuiTypography-titleM');
        if (valueElement.length) {
          averageDailyRate = valueElement.text().trim();
        }
      });
    }
    
    // For confidence score - keep the original approach since it's working
    let confidenceScore = '';
    $('.MuiTypography-body1:contains("Confidence Score")').each(function() {
      const valueElement = $(this).closest('.MuiBox-root').parent().find('h6.MuiTypography-subtitle2');
      if (valueElement.length) {
        confidenceScore = valueElement.text().trim();
      }
    });
    
    // For operating expenses
    let operatingExpenses = '';
    $('.MuiTypography-body1:contains("Operating Expenses")').each(function() {
      const valueElement = $(this).closest('.MuiBox-root').parent().find('h4.MuiTypography-titleS');
      if (valueElement.length) {
        operatingExpenses = valueElement.text().trim();
      }
    });
    
    // For net operating income
    let netOperatingIncome = '';
    $('.MuiTypography-body1:contains("Net Operating Income")').each(function() {
      const valueElement = $(this).closest('.MuiBox-root').parent().find('h4.MuiTypography-titleS');
      if (valueElement.length) {
        netOperatingIncome = valueElement.text().trim();
      }
    });
    
    // For cap rate
    let capRate = '';
    $('.MuiTypography-body1:contains("Cap Rate")').each(function() {
      const valueElement = $(this).closest('.MuiBox-root').parent().find('h4.MuiTypography-titleS');
      if (valueElement.length) {
        capRate = valueElement.text().trim();
      }
    });

    console.log({ annualRevenue, averageOccupancy, averageDailyRate, confidenceScore });
    
    // Create a response with the extracted data
    const result = {
      address: fullAddress,
      annualRevenue: annualRevenue || 'Data not available',
      averageOccupancy: averageOccupancy || 'Data not available',
      averageDailyRate: averageDailyRate || 'Data not available',
      confidenceScore: confidenceScore || 'Not available',
      financials: {
        operatingExpenses: operatingExpenses || 'Data not available',
        netOperatingIncome: netOperatingIncome || 'Data not available',
        capRate: capRate || 'Data not available'
      },
      propertyDetails: {
        bedrooms: bedrooms || 'Not specified',
        bathrooms: bathrooms || 'Not specified',
        accommodates: accommodates || 'Not specified'
      },
      note: "Data extracted from Airdna's Rentalizer tool."
    };
    
    console.log('Sending response with extracted data:', JSON.stringify(result, null, 2));
    
    // Close the browser
    await browser.close();
    browser = null;
    
    // Ensure we're sending the response
    return res.json({ result });
    
  } catch (error) {
    console.error('Income estimate error:', error.message);
    
    // Close browser if it's still open
    if (browser) {
      await browser.close().catch(err => console.error('Error closing browser:', err));
    }
    
    // Ensure we respond and don't fall through to the catch-all
    if (!res.headersSent) {
      return res.status(500).json({ 
        error: { 
          message: `Failed to retrieve income estimate: ${error.message}` 
        } 
      });
    }
  }
});

router.post('/new-reservation', async (request, response, next) => {
  try {
    const source = request.headers['x-internal-source'];
    if (source !== 'securestay.ai') {
      console.error(`[processNewReservation] Invalid source: ${source}`);
      return response.status(403).json({ status: false, message: "Forbidden" });
    }

    await processNewReservation(request.body);

    response.status(200).json({
      success: true,
      message: 'Handled new reservation for push notification'
    });
  } catch (error) {
    console.error(`{Api:${request.url}, Error: ${error} }`);
    return response.status(500).json({
      status: false,
      message: `Something went wrong processing reservation ${request.body?.id}`
    });
  }
})

router.get("/getpartnershipinfo", authenticateToken, async (request, response, next) => {
  try {
    const userId = request.user.userId;

    const partnershipInfo = await getPartnershipInfo(userId);

    response.status(200).json({
      success: true,
      data: partnershipInfo
    });
  } catch (error) {
    console.error(`{Api:${request.url}, Error: ${error} }`);
    return response.status(500).json({
      status: false,
      message: `Something went wrong fetching partnership info`
    });
  }
})

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

async function processNewReservation(reservation) {
  const guestName = reservation.guestName;
  const checkIn = reservation.arrivalDate;
  const checkOut = reservation.departureDate;
  const totalPrice = reservation.totalPrice;
  const guestFirstName = reservation.guestFirstName || reservation.guestName;
  const listingName = reservation.listingName;
  const listingMapId = reservation.listingMapId;

  const payload = {
    title: `🎉 New Booking: ${formatCurrency(totalPrice)} Earned!`,
    body: `${guestFirstName} booked ${listingName} from ${checkIn} to ${checkOut}. Tap to view details!`
  };

  // find the user that needs to be notified
  const hostawayUserRepo = AppDataSource.getRepository(HostawayUser);
  const hostawayUsers = await hostawayUserRepo.find({ where: { listingId: listingMapId } });
  if (!hostawayUsers || hostawayUsers.length == 0) {
    console.log(`[processNewReservation] No hostaway user found for the listingMapId:${listingMapId}`);
    return;
  }

  const userIds = hostawayUsers.map(user => user.ha_userId);

  await sendNotificationToUser(userIds, payload);
  return;
}

async function getPartnershipInfo(userId) {
  const mobileUserRepository = AppDataSource.getRepository(MobileUser);
  const mobileUser = await mobileUserRepository.findOne({ where: { id: userId } });
  if (!mobileUser) {
    console.log(`Mobile user not found with userId: ${userId}`);
    return null;
  }

  const data = await makeApiRequest('GET', '/listings', { userId: mobileUser.hostawayId }, null, null);
  if (!data) {
    console.log(`No listing fetched from hostaway for the userId: ${mobileUser.hostawayId}`);
    return null;
  }
  const listings = data.result.map((listing) => listing.id);

  const partnershipInfoRepo = AppDataSource.getRepository(PartnershipInfo);
  return await partnershipInfoRepo.find({
    where: {
      listingId: In(listings)
    },
    // select: ["listingId", "totalEarned", "pendingCommission", "activeReferral", "yearlyProjection"]
  });
}

module.exports = router;