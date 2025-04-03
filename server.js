const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Database connection
const pool = new Pool({
  connectionString: 'postgres://asta:123@localhost/real_estate_db'
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Error connecting to PostgreSQL:', err);
  } else {
    console.log('PostgreSQL connected:', res.rows[0].now);
    
    // Check if properties table exists
    pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'properties'
      );
    `, (err, result) => {
      if (err) {
        console.error('Error checking properties table:', err.message);
      } else if (!result.rows[0].exists) {
        console.log('Properties table does not exist, creating it...');
        
        // Create pgcrypto extension
        pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto', (err) => {
          if (err) {
            console.error('Error creating pgcrypto extension:', err);
          } else {
            // Create properties table
            pool.query(`
              CREATE TABLE properties (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                property_id VARCHAR(255) NOT NULL,
                owner_wallet VARCHAR(255) NOT NULL,
                price BIGINT NOT NULL,
                metadata_uri TEXT NOT NULL,
                location VARCHAR(255) NOT NULL,
                square_feet BIGINT NOT NULL,
                bedrooms SMALLINT NOT NULL,
                bathrooms SMALLINT NOT NULL,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP NOT NULL
              )
            `, (err) => {
              if (err) {
                console.error('Error creating properties table:', err);
              } else {
                console.log('Properties table created successfully');
              }
            });
          }
        });
      } else {
        console.log('Properties table exists');
      }
    });
  }
});

// API Routes

// Get all properties
app.get('/api/properties', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM properties WHERE is_active = true ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching properties:', error);
    res.status(500).json({ error: 'Failed to fetch properties' });
  }
});

// Create a property
app.post('/api/properties', async (req, res) => {
  try {
    const {
      property_id,
      owner_wallet,
      price,
      metadata_uri,
      location,
      square_feet,
      bedrooms,
      bathrooms
    } = req.body;
    
    const now = new Date().toISOString();
    
    const result = await pool.query(
      `INSERT INTO properties 
      (id, property_id, owner_wallet, price, metadata_uri, location, square_feet, bedrooms, bathrooms, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        uuidv4(),
        property_id,
        owner_wallet,
        price,
        metadata_uri,
        location,
        square_feet,
        bedrooms,
        bathrooms,
        true,
        now,
        now
      ]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating property:', error);
    res.status(500).json({ error: 'Failed to create property' });
  }
});

// Get property by ID
app.get('/api/properties/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM properties WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Property not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching property:', error);
    res.status(500).json({ error: 'Failed to fetch property' });
  }
});

// Update property
app.put('/api/properties/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      property_id,
      owner_wallet,
      price,
      metadata_uri,
      location,
      square_feet,
      bedrooms,
      bathrooms,
      is_active
    } = req.body;
    
    const now = new Date().toISOString();
    
    const result = await pool.query(
      `UPDATE properties 
      SET property_id = $1, owner_wallet = $2, price = $3, metadata_uri = $4, 
          location = $5, square_feet = $6, bedrooms = $7, bathrooms = $8, 
          is_active = $9, updated_at = $10
      WHERE id = $11
      RETURNING *`,
      [
        property_id,
        owner_wallet,
        price,
        metadata_uri,
        location,
        square_feet,
        bedrooms,
        bathrooms,
        is_active,
        now,
        id
      ]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Property not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating property:', error);
    res.status(500).json({ error: 'Failed to update property' });
  }
});

// Delete property (soft delete)
app.delete('/api/properties/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const now = new Date().toISOString();
    
    const result = await pool.query(
      `UPDATE properties 
      SET is_active = false, updated_at = $1
      WHERE id = $2
      RETURNING *`,
      [now, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Property not found' });
    }
    
    res.json({ message: 'Property deleted successfully' });
  } catch (error) {
    console.error('Error deleting property:', error);
    res.status(500).json({ error: 'Failed to delete property' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
}); 