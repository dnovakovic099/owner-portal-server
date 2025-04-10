const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const apiRoutes = require('./routes/api');
const authRoutes = require('./routes/auth');
const fs = require('fs');

// Load environment variables
dotenv.config();

// Initialize app
const app = express();
const PORT = process.env.PORT || 3001;
app.disable('etag');

// Enable CORS for React application
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));

// Parse JSON body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the React app
app.use(express.static(path.join(__dirname, 'build')));

// Create a simple index.html if it doesn't exist (for API-only server)
const buildDir = path.join(__dirname, 'build');
const indexHtml = path.join(buildDir, 'index.html');
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}
if (!fs.existsSync(indexHtml)) {
  fs.writeFileSync(indexHtml, '<!DOCTYPE html><html><head><title>Owner Portal API</title></head><body><h1>Owner Portal API Server</h1><p>API is running. Frontend is not built.</p></body></html>');
}

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  const healthStatus = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  };
  
  res.json(healthStatus);
});

// Use route handlers
app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);

// Catch-all for React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: {
      message: 'An unexpected server error occurred',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
  console.log(`Health check at http://localhost:${PORT}/health`);
});