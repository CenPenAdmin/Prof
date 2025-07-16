const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

// Directory for user profiles
const USERS_DIR = path.join(__dirname, 'users');

app.use(express.json());
app.use(express.static(__dirname));

// ✅ Ensure users/ folder exists
if (!fs.existsSync(USERS_DIR)) {
  fs.mkdirSync(USERS_DIR);
}

// ✅ Fetch user profile by email (GET)
app.get('/api/user/:email', (req, res) => {
  const email = decodeURIComponent(req.params.email);
  const safeEmail = encodeURIComponent(email); // make filename safe
  const userFile = path.join(USERS_DIR, `${safeEmail}.json`);

  if (!fs.existsSync(userFile)) {
    return res.status(404).send({ error: "User not found." });
  }

  const user = JSON.parse(fs.readFileSync(userFile));
  res.json(user);
});

// ✅ Handle new user signup (POST)
app.post('/api/signup', (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).send({ error: "Name and email are required." });
  }

  const safeEmail = encodeURIComponent(email);
  const userFile = path.join(USERS_DIR, `${safeEmail}.json`);

  if (fs.existsSync(userFile)) {
    return res.status(400).send({ error: "User already exists." });
  }

  const newUser = { name, email };
  fs.writeFileSync(userFile, JSON.stringify(newUser, null, 2));
  res.status(200).json(newUser);
});

// ✅ Start the server
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
