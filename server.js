require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./routes/api');
const authRoutes = require('./routes/auth');
const fs = require('fs');
const { connectDatabase } = require('./config/database');



// Start server after DB connects
connectDatabase().then((dataSource) => {
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

  // Static & fallback
  const buildDir = path.join(__dirname, 'build');
  const indexHtml = path.join(buildDir, 'index.html');
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  }
  if (!fs.existsSync(indexHtml)) {
    fs.writeFileSync(indexHtml, '<!DOCTYPE html><html><head><title>Owner Portal API</title></head><body><h1>Owner Portal API Server</h1><p>API is running. Frontend is not built.</p></body></html>');
  }
  app.use(express.static(buildDir));

  // Logging
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
    next();
  });

  // Health check
  app.get('/health', (req, res) => {
    const healthStatus = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development'
    };
    res.json(healthStatus);
  });


  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api', apiRoutes);

  // React fallback
  app.get('*', (req, res) => {
    res.sendFile(path.join(buildDir, 'index.html'));
  });

  // Error handling
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
      error: {
        message: 'An unexpected server error occurred',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      }
    });
  });

  // Listen
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API available at http://localhost:${PORT}/api`);
    console.log(`Health check at http://localhost:${PORT}/health`);
  });

}).catch((err) => {
  console.error('Failed to connect to database:', err);
});
