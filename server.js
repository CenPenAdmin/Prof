const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const upload = multer({ dest: 'uploads/' });

// Serve static files from uploads folder
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Handle audio upload
app.post('/api/upload-audio', upload.single('audio'), (req, res) => {
  const email = req.query.email;
  if (!email || !req.file) return res.status(400).json({ error: 'Missing email or file.' });

  const safeEmail = encodeURIComponent(email);
  const userDir = path.join(__dirname, 'uploads', safeEmail);
  if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });

  const audioPath = path.join(userDir, 'audio.wav');
  fs.renameSync(req.file.path, audioPath);

  // Update user's JSON file with audioFile field
  const userJsonPath = path.join(__dirname, 'users', `${safeEmail}.json`);
  let userData = {};
  if (fs.existsSync(userJsonPath)) {
    userData = JSON.parse(fs.readFileSync(userJsonPath, 'utf8'));
  }
  // Always set the audioFile field to the correct URL
  userData.audioFile = `/uploads/${safeEmail}/audio.wav`;
  fs.writeFileSync(userJsonPath, JSON.stringify(userData, null, 2));

  res.json({ success: true, audioFile: userData.audioFile });
});

// 📤 Serve Uploaded Audio File
app.get('/api/audio/:email', (req, res) => {
  const email = encodeURIComponent(req.params.email);
  const audioPath = path.join(UPLOADS_DIR, email, 'audio.wav');

  if (!fs.existsSync(audioPath)) {
    return res.status(404).send({ error: "Audio not found" });
  }

  res.sendFile(audioPath);
});

// 📄 Get User Profile
app.get('/api/user/:email', (req, res) => {
  const email = decodeURIComponent(req.params.email);
  const safeEmail = encodeURIComponent(email);
  const userFile = path.join(USERS_DIR, `${safeEmail}.json`);

  if (!fs.existsSync(userFile)) {
    return res.status(404).send({ error: "User not found." });
  }

  const user = JSON.parse(fs.readFileSync(userFile));
  res.json(user);
});

// 📝 Create New User
app.post('/api/signup', (req, res) => {
  const { name, email, location } = req.body;

  if (!name || !email || !location) {
    return res.status(400).send({ error: "Name, email, and location are required." });
  }

  const safeEmail = encodeURIComponent(email);
  const userFile = path.join(USERS_DIR, `${safeEmail}.json`);

  if (fs.existsSync(userFile)) {
    return res.status(400).send({ error: "User already exists." });
  }

  const newUser = { name, email, location };
  fs.writeFileSync(userFile, JSON.stringify(newUser, null, 2));
  res.status(200).json(newUser);
});

app.post('/api/log-login', express.json(), (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Missing email.' });

  const safeEmail = encodeURIComponent(email);
  const userJsonPath = path.join(__dirname, 'users', `${safeEmail}.json`);
  let userData = {};
  if (fs.existsSync(userJsonPath)) {
    userData = JSON.parse(fs.readFileSync(userJsonPath, 'utf8'));
  }
  if (!userData.loginHistory) userData.loginHistory = [];
  userData.loginHistory.push({ login: Date.now(), logout: null, duration: null });
  fs.writeFileSync(userJsonPath, JSON.stringify(userData, null, 2));
  res.json({ success: true });
});

app.post('/api/log-logout', express.json(), (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Missing email.' });

  const safeEmail = encodeURIComponent(email);
  const userJsonPath = path.join(__dirname, 'users', `${safeEmail}.json`);
  let userData = {};
  if (fs.existsSync(userJsonPath)) {
    userData = JSON.parse(fs.readFileSync(userJsonPath, 'utf8'));
  }
  if (userData.loginHistory && userData.loginHistory.length > 0) {
    const lastSession = userData.loginHistory[userData.loginHistory.length - 1];
    if (lastSession.logout === null) {
      lastSession.logout = Date.now();
      lastSession.duration = lastSession.logout - lastSession.login;
      fs.writeFileSync(userJsonPath, JSON.stringify(userData, null, 2));
    }
  }
  res.json({ success: true });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 🚀 Start Server
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
