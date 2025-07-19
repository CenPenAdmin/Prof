const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = 3000;

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/temp/' });

app.use(express.static('.'));

// 📋 Get User Profile
app.get('/api/user/:email', (req, res) => {
  const safeEmail = encodeURIComponent(req.params.email);
  const userFile = path.join(__dirname, 'users', `${safeEmail}.json`);
  
  if (!fs.existsSync(userFile)) {
    return res.status(404).send({ error: "User not found." });
  }

  const user = JSON.parse(fs.readFileSync(userFile));
  res.json(user);
});

// 📝 Create New User
app.post('/api/signup', express.json(), (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).send({ error: "Name and email are required." });
  }

  const safeEmail = encodeURIComponent(email);
  const userFile = path.join(__dirname, 'users', `${safeEmail}.json`);

  if (fs.existsSync(userFile)) {
    return res.status(400).send({ error: "User already exists." });
  }

  const newUser = { name, email };
  fs.writeFileSync(userFile, JSON.stringify(newUser, null, 2));
  res.status(200).json(newUser);
});

// Serve index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Image upload endpoint
app.post('/api/upload-image', upload.single('profileImage'), (req, res) => {
  const email = req.query.email;
  if (!email || !req.file) return res.status(400).json({ error: 'Missing email or file.' });

  const safeEmail = encodeURIComponent(email);
  const userDir = path.join(__dirname, 'uploads', safeEmail);
  if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });

  // Save image as profile.jpg
  const imagePath = path.join(userDir, 'profile.jpg');
  fs.renameSync(req.file.path, imagePath);

  // Update user's JSON
  const userJsonPath = path.join(__dirname, 'users', `${safeEmail}.json`);
  let userData = {};
  if (fs.existsSync(userJsonPath)) {
    userData = JSON.parse(fs.readFileSync(userJsonPath, 'utf8'));
  }
  userData.imageUrl = `/uploads/${safeEmail}/profile.jpg`;
  fs.writeFileSync(userJsonPath, JSON.stringify(userData, null, 2));

  res.json({ success: true, imageUrl: userData.imageUrl });
});

// Get messages between two users
app.get('/api/messages', (req, res) => {
  const { user1, user2 } = req.query;
  if (!user1 || !user2) return res.status(400).json({ error: 'Missing user1 or user2 parameters' });

  // Create a consistent conversation ID by sorting emails alphabetically
  const conversationId = [user1, user2].sort().join('|');
  const messagesPath = path.join(__dirname, 'messages', `${encodeURIComponent(conversationId)}.json`);
  
  if (!fs.existsSync(messagesPath)) {
    return res.json({ messages: [] });
  }

  const messages = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));
  res.json({ messages });
});

// Send a message between two users
app.post('/api/messages', express.json(), (req, res) => {
  const { from, to, message } = req.body;
  if (!from || !to || !message) return res.status(400).json({ error: 'Missing from, to, or message' });

  // Create a consistent conversation ID by sorting emails alphabetically
  const conversationId = [from, to].sort().join('|');
  const messagesDir = path.join(__dirname, 'messages');
  const messagesPath = path.join(messagesDir, `${encodeURIComponent(conversationId)}.json`);
  
  // Ensure messages directory exists
  if (!fs.existsSync(messagesDir)) {
    fs.mkdirSync(messagesDir, { recursive: true });
  }

  // Load existing messages or create empty array
  let messages = [];
  if (fs.existsSync(messagesPath)) {
    messages = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));
  }

  // Add new message
  const newMessage = {
    id: Date.now().toString(),
    from,
    to,
    message,
    timestamp: new Date().toISOString()
  };
  messages.push(newMessage);

  // Save messages
  fs.writeFileSync(messagesPath, JSON.stringify(messages, null, 2));
  
  res.json({ success: true, message: newMessage });
});

// 🚀 Start Server
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
