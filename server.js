// server.js
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const cors = require('cors');
const app = express();
const PORT = 3000;

// Middlewarenpm
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname)); // Serves index.html

// Simple database using JSON file
const DB_FILE = 'users.json';
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]');

// Handle POST request to save user info
app.post('/api/users', (req, res) => {
  const { name, email } = req.body;
  const users = JSON.parse(fs.readFileSync(DB_FILE));
  users.push({ name, email, timestamp: new Date().toISOString() });
  fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
  res.json({ name });
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
