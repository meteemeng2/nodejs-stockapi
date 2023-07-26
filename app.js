const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const sql = require('mssql');
const bodyParser = require('body-parser');

const app = express();
const port = 3333;
const jwtSecretKey = 'JWTAuthenticationHIGHsecuredPasswordVVVp10H7Xzyr'; // Replace with a strong secret key for JWT


// Middleware to parse JSON data from requests
app.use(bodyParser.json());

// Database configuration (replace with your actual SQL Server connection details)
const dbConfig = {
  user: 'Meng',
  password: '1234',
  server: 'localhost',
  database: 'MengStockPort',
  trustServerCertificate: true,
  //port: 1433, // Replace with your SQL Server port
  // options: {
  //   encrypt: false, // Set to true if you are using Azure SQL Database
  //   trustServerCertificate: true, // Set to true if you want to trust the server certificate
  // },
};

// Function to call the Finnhub API for each stock
async function fetchStockData(stockSymbol) {
  try {
    const token = 'cinqml1r01qrmpml18ugcinqml1r01qrmpml18v0'; // Replace with your Finnhub API token
    const apiUrl = `https://finnhub.io/api/v1/quote?symbol=${stockSymbol}&token=${token}`;
    const response = await axios.get(apiUrl);
    return response.data;
  } catch (error) {
    console.error('Error fetching stock data:', error);
    return null;
  }
}

// Function to insert stock price into the database
async function insertStockPrice(stockSymbol, closingPrice) {
  try {
    const pool = await sql.connect(dbConfig); // Connecting to SQL Server
    const query = 'INSERT INTO StockPriceHistory (stock_symbol, price_date, closing_price) VALUES (@stockSymbol, GETDATE(), @closingPrice)';
    const result = await pool.request()
      .input('stockSymbol', sql.NVarChar, stockSymbol)
      .input('closingPrice', sql.Decimal, closingPrice)
      .query(query);

    await sql.close(); // Closing the connection pool after the query
  } catch (error) {
    console.error('Error inserting stock price:', error);
  }
}

// Middleware to verify JWT token
function verifyToken(req, res, next) {
  const token = req.header('Authorization');

  if (!token) {
    return res.status(401).json({ error: 'No token provided.' });
  }

  jwt.verify(token.replace('Bearer ', ''), jwtSecretKey, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: 'Invalid token.' });
    }
    req.user = decoded;
    next();
  });
}
// API endpoint to get a JWT token (for demonstration purposes only)
app.get('/getToken', (req, res) => {
  const user = { id: 1, username: 'example_user' }; // Replace with your user data
  const token = jwt.sign(user, jwtSecretKey, { expiresIn: '1h' }); // Token will expire in 1 hour
  res.json({ token });
});

// Protected API endpoint to trigger the process
app.get('/updateStockPrices', verifyToken, async (req, res) => {
  try {
    // Create a connection pool
    const pool = await sql.connect(dbConfig);

    const query = 'SELECT stock_symbol FROM StockData';
    const result = await pool.request().query(query);

    for (const row of result.recordset) {
      const stockSymbol = row.stock_symbol;
      const stockData = await fetchStockData(stockSymbol);
      if (stockData) {
        const { c: closingPrice } = stockData;
        await insertStockPrice(stockSymbol, closingPrice);
      }
    }

    // Close the connection pool
    await pool.close();
    res.status(200).json({ message: 'Stock prices updated successfully!' });
  } catch (error) {
    console.error('Error processing stock data:', error);
    res.status(500).json({ error: 'An error occurred while updating stock prices.' + error.message });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

module.exports = app;