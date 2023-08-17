const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const sql = require('mssql');
const moment = require('moment');
const cors = require('cors');

const app = express();
// Enable CORS for all routes
app.use(cors());
const port = 3333;
const jwtSecretKey = 'JWTAuthenticationHIGHsecuredPasswordVVVp10H7Xzyr'; // Replace with a strong secret key for JWT



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

// Protected API endpoint to trigger the process
app.get('/updateStockPricesHistory', verifyToken, async (req, res) => {
  try {
    // Create a connection pool
    const pool = await sql.connect(dbConfig);

    const query = 'SELECT stock_symbol FROM StockData';
    const result = await pool.request().query(query);

    const todayDate = moment().format('YYYY-MM-DD');

    for (const row of result.recordset) {
      const stockSymbol = row.stock_symbol;

      // Check if the stock price for today already exists
      const existingData = await checkIfStockPriceExists(stockSymbol, todayDate);
      if (existingData) {
        // If data exists, update the stock price
        const stockData = await fetchStockData(stockSymbol);
        if (stockData) {
          const { c: closingPrice } = stockData;
          await updateStockPrice(stockSymbol, closingPrice, todayDate);
        }
      } else {
        // If data does not exist, insert the stock price
        const stockData = await fetchStockData(stockSymbol);
        if (stockData) {
          const { c: closingPrice } = stockData;
          await insertStockPrice(stockSymbol, closingPrice, todayDate);
        }
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

app.get('/api/singleStockPriceHistory', verifyToken, async (req, res) => {
  const stockSymbol = req.query.stock_symbol; // Access the stock_symbol from query parameters
  try {
    // Connect to the SQL Server
    const pool = await sql.connect(dbConfig);

    // Query the database for the specific stock_symbol's StockPriceHistory
    const result = await pool.request()
      .input('stock_symbol', sql.NVarChar, stockSymbol)
      .query('SELECT [id], [stock_symbol], [price_date], [closing_price] FROM [StockPriceHistory] WHERE [stock_symbol] = @stock_symbol ORDER BY [price_date]');

    // Send the result as the response
    res.json(result.recordset);
  } catch (error) {
    console.error('Error occurred while fetching data:', error);
    res.status(500).json({ error: 'An error occurred while fetching data.' });
  }
});

app.get('/api/stocks', verifyToken, async (req, res) => {
  const userId = req.user.userid;
  console.log(req.user);

  try {
    // Connect to the database
    await sql.connect(dbConfig);

    // Fetch user's stock symbols and associated stock price history
    const userStockPriceHistoryResult = await sql.query`
      SELECT sph.[id], us.[stock_symbol], sph.[price_date], sph.[closing_price]
      FROM [dbo].[UsersStock] AS us
      INNER JOIN [dbo].[StockPriceHistory] AS sph
      ON us.[stock_symbol] = sph.[stock_symbol]
      WHERE us.[userid] = ${userId}
    `;

    const userStockPriceHistory = userStockPriceHistoryResult.recordset;

    res.json(userStockPriceHistory);
  } catch (err) {
    console.error('Error occurred:', err);
    res.status(500).json({ error: 'An internal server error occurred.' });
  } finally {
    // Close the database connection
    await sql.close();
  }
});

// Helper function to check if the stock price for today already exists
async function checkIfStockPriceExists(stockSymbol, date) {
  const pool = await sql.connect(dbConfig);
  const query = `SELECT * FROM StockPriceHistory WHERE stock_symbol = '${stockSymbol}' AND price_date = '${date}'`;
  const result = await pool.request().query(query);
  await pool.close();
  return result.recordset.length > 0;
}

// Helper function to update the stock price for today
async function updateStockPrice(stockSymbol, closingPrice, date) {
  const pool = await sql.connect(dbConfig);
  const query = `UPDATE StockPriceHistory SET closing_price = ${closingPrice} WHERE stock_symbol = '${stockSymbol}' AND price_date = '${date}'`;
  await pool.request().query(query);
  await pool.close();
}

// Helper function to insert the stock price for today
async function insertStockPrice(stockSymbol, closingPrice, date) {
  const pool = await sql.connect(dbConfig);
  const query = `INSERT INTO StockPriceHistory (stock_symbol, closing_price, price_date) VALUES ('${stockSymbol}', ${closingPrice}, '${date}')`;
  await pool.request().query(query);
  await pool.close();
}


// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

module.exports = app;