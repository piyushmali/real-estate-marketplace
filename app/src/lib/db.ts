// Import Pool conditionally to handle potential missing pg module
let Pool;
try {
  const pg = require('pg');
  Pool = pg.Pool;
} catch (err) {
  console.error('PostgreSQL module not found. Please install it with: npm install pg');
  // Creating a mock Pool implementation
  Pool = class MockPool {
    constructor() {
      console.warn('Using mock database connection');
    }
    
    async connect() {
      return {
        query: async () => ({ rows: [] }),
        release: () => {}
      };
    }
    
    async query() {
      return { rows: [] };
    }
  };
}

// Mock data for fallback when db connection fails
const mockProperties = [
  {
    id: "1",
    property_id: "property_001",
    owner_wallet: "wallet123",
    price: 1000000,
    metadata_uri: "https://wallpaperaccess.com/full/2315968.jpg",
    location: "123 Main St",
    square_feet: 2000,
    bedrooms: 3,
    bathrooms: 2,
    is_active: true,
    created_at: "2023-01-01T00:00:00Z",
    updated_at: "2023-01-01T00:00:00Z"
  },
  {
    id: "2",
    property_id: "property_002",
    owner_wallet: "wallet456",
    price: 1500000,
    metadata_uri: "https://wallpaperaccess.com/full/2315968.jpg",
    location: "456 Oak Ave",
    square_feet: 2500,
    bedrooms: 4,
    bathrooms: 3,
    is_active: true,
    created_at: "2023-01-02T00:00:00Z",
    updated_at: "2023-01-02T00:00:00Z"
  }
];

// Database connection configuration
const pool = new Pool({
  connectionString: 'postgres://asta:123@localhost/real_estate_db'
});

// Flag to track if the database is connected
let isDatabaseConnected = false;

// Function to update the database connection status
const updateConnectionStatus = (isConnected: boolean) => {
  isDatabaseConnected = isConnected;
  if (db) {
    db._isConnected = isConnected;
  }
};

// Test the connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Error connecting to PostgreSQL:', err);
    console.warn('Falling back to mock data');
    console.error('Database connection details:', {
      connectionString: 'postgres://asta:123@localhost/real_estate_db',
      error: err.message
    });
    updateConnectionStatus(false);
  } else {
    console.log('PostgreSQL connected successfully:', res.rows[0].now);
    console.log('Database connection is established and working');
    updateConnectionStatus(true);
    
    // Check if properties table exists instead of checking for rows
    pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'properties'
      );
    `, (err, result) => {
      if (err) {
        console.error('Error checking properties table:', err.message);
      } else {
        if (result.rows[0].exists) {
          console.log('Properties table exists');
        } else {
          console.error('Properties table does not exist!');
          console.log('Consider creating the properties table with:');
          console.log(`
            -- First, add the pgcrypto extension for UUID generation
            CREATE EXTENSION IF NOT EXISTS pgcrypto;
            
            -- Then create the properties table
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
            );
          `);
        }
      }
    });
  }
});

// Export the pool so it can be used in other files
export const db = {
  _isConnected: isDatabaseConnected,
  query: async (text: string, params?: any[]) => {
    try {
      if (!isDatabaseConnected) {
        console.warn('Database not connected when trying to execute query:', text);
        throw new Error('Database not connected');
      }
      
      console.log('Executing query:', {
        text,
        params: params || []
      });
      
      const start = Date.now();
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      
      console.log('Query executed successfully:', {
        text,
        duration: duration + 'ms',
        rows: res.rowCount
      });
      
      return res;
    } catch (error) {
      console.error('Database query error:', error);
      console.error('Failed query:', {
        text,
        params: params || []
      });
      
      // Check for specific error types to provide better diagnostics
      if (error.code === '42P01') {
        console.error('ERROR: Table does not exist - check your schema');
      } else if (error.code === '23505') {
        console.error('ERROR: Unique violation - duplicate key value');
      } else if (error.code === '23503') {
        console.error('ERROR: Foreign key violation');
      } else if (error.code === '42703') {
        console.error('ERROR: Column does not exist');
      }
      
      // Return empty result
      return { rows: [] };
    }
  },
  getClient: async () => {
    try {
      if (!isDatabaseConnected) {
        throw new Error('Database not connected');
      }
      const client = await pool.connect();
      return {
        query: (text: string, params?: any[]) => client.query(text, params),
        release: () => client.release(),
      };
    } catch (error) {
      console.error('Error getting database client:', error);
      // Return mock client
      return {
        query: async () => ({ rows: [] }),
        release: () => {},
      };
    }
  },
};

// Keeping this commented out for reference
// export const mockProperties = [
//   {
//     property_id: "property_001",
//     price: 1000000,
//     metadata_uri: "https://wallpaperaccess.com/full/2315968.jpg",
//     location: "123 Main St",
//     square_feet: 2000,
//     bedrooms: 3,
//     bathrooms: 2,
//   },
//   // ... other mock properties
// ];

// For backward compatibility, will use real DB if connected, otherwise mock data
export const getProperties = async () => {
  try {
    if (!isDatabaseConnected) {
      console.warn('Database not connected, using mock data');
      return mockProperties;
    }
    
    const result = await db.query(
      'SELECT * FROM properties WHERE is_active = true ORDER BY created_at DESC'
    );
    
    if (result.rows.length === 0) {
      console.warn('No properties found in database, using mock data');
      return mockProperties;
    }
    
    return result.rows;
  } catch (error) {
    console.error('Error fetching properties from database:', error);
    console.warn('Falling back to mock data');
    return mockProperties;
  }
};

// Function to test database connection directly
export const testDatabaseConnection = async () => {
  console.log('Testing database connection...');
  
  try {
    // Test basic connection
    const connResult = await pool.query('SELECT NOW() as current_time');
    console.log('Connection test result:', connResult.rows[0]);
    
    // Test properties table
    try {
      const tableResult = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      console.log('Available tables:', tableResult.rows.map(row => row.table_name));
      
      // Check if properties table exists
      const hasPropertiesTable = tableResult.rows.some(row => 
        row.table_name === 'properties'
      );
      
      if (hasPropertiesTable) {
        // Check properties table schema
        const columnsResult = await pool.query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = 'properties'
        `);
        console.log('Properties table columns:', columnsResult.rows);
        
        // Try to insert a test record
        const testId = 'test-' + Date.now();
        const insertResult = await pool.query(`
          INSERT INTO properties 
          (property_id, owner_wallet, price, metadata_uri, location, square_feet, bedrooms, bathrooms, is_active, created_at, updated_at)
          VALUES ($1, $2, 100000, 'https://example.com/test.jpg', 'Test Location', 1000, 2, 1, true, NOW(), NOW())
          RETURNING *
        `, [testId, 'test-wallet']);
        
        console.log('Test record inserted:', insertResult.rows[0]);
        
        // Delete the test record
        await pool.query(`DELETE FROM properties WHERE property_id = $1`, [testId]);
        console.log('Test record deleted successfully');
        
        // Explicitly set database connection status to true after successful test
        updateConnectionStatus(true);
        console.log('Database connection fully verified and working!');
      } else {
        console.error('Properties table does not exist!');
        
        // Suggest CREATE TABLE statement
        console.log('Consider creating the properties table with:');
        console.log(`
          -- First, add the pgcrypto extension for UUID generation
          CREATE EXTENSION IF NOT EXISTS pgcrypto;
          
          -- Then create the properties table
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
          );
        `);
      }
    } catch (tableError) {
      console.error('Error checking tables:', tableError);
    }
    
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
};

// Call the test function automatically when the module is loaded
setTimeout(() => {
  testDatabaseConnection().then(success => {
    console.log('Database connection test complete:', success ? 'SUCCESS' : 'FAILED');
  });
}, 2000); // Delay to allow the initial connection to complete