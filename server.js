const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const PORT = 3000;

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/temp/' });

app.use(express.static('.'));
app.use(express.json()); // Add JSON parsing middleware

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

// 📰 NEWS STORIES API ENDPOINTS

// Get all news stories
app.get('/api/news/stories', (req, res) => {
  const storiesPath = path.join(__dirname, 'news-stories.json');
  
  if (!fs.existsSync(storiesPath)) {
    return res.json({ stories: [] });
  }

  const stories = JSON.parse(fs.readFileSync(storiesPath, 'utf8'));
  res.json({ stories });
});

// Post a new story
app.post('/api/news/stories', express.json(), (req, res) => {
  const story = req.body;
  if (!story || !story.title || !story.content || !story.author) {
    return res.status(400).json({ error: 'Missing required story fields' });
  }

  const storiesPath = path.join(__dirname, 'news-stories.json');
  
  // Load existing stories or create empty array
  let stories = [];
  if (fs.existsSync(storiesPath)) {
    stories = JSON.parse(fs.readFileSync(storiesPath, 'utf8'));
  }

  // Add new story
  stories.unshift(story);

  // Save stories
  fs.writeFileSync(storiesPath, JSON.stringify(stories, null, 2));
  
  res.json({ success: true, story });
});

// Update story (likes, etc.)
app.put('/api/news/stories/:storyId', express.json(), (req, res) => {
  const { storyId } = req.params;
  const updates = req.body;
  
  const storiesPath = path.join(__dirname, 'news-stories.json');
  
  if (!fs.existsSync(storiesPath)) {
    return res.status(404).json({ error: 'Stories not found' });
  }

  let stories = JSON.parse(fs.readFileSync(storiesPath, 'utf8'));
  const storyIndex = stories.findIndex(s => s.id === storyId);
  
  if (storyIndex === -1) {
    return res.status(404).json({ error: 'Story not found' });
  }

  // Update story
  stories[storyIndex] = { ...stories[storyIndex], ...updates };

  // Save stories
  fs.writeFileSync(storiesPath, JSON.stringify(stories, null, 2));
  
  res.json({ success: true, story: stories[storyIndex] });
});

// Get comments for all stories
app.get('/api/news/comments', (req, res) => {
  const commentsPath = path.join(__dirname, 'news-comments.json');
  
  if (!fs.existsSync(commentsPath)) {
    return res.json({ comments: {} });
  }

  const comments = JSON.parse(fs.readFileSync(commentsPath, 'utf8'));
  res.json({ comments });
});

// Post a new comment
app.post('/api/news/comments', express.json(), (req, res) => {
  const { storyId, comment } = req.body;
  if (!storyId || !comment) {
    return res.status(400).json({ error: 'Missing storyId or comment' });
  }

  const commentsPath = path.join(__dirname, 'news-comments.json');
  
  // Load existing comments or create empty object
  let comments = {};
  if (fs.existsSync(commentsPath)) {
    comments = JSON.parse(fs.readFileSync(commentsPath, 'utf8'));
  }

  // Add new comment
  if (!comments[storyId]) {
    comments[storyId] = [];
  }
  comments[storyId].unshift(comment);

  // Save comments
  fs.writeFileSync(commentsPath, JSON.stringify(comments, null, 2));
  
  res.json({ success: true, comment });
});

// � WebSocket handling for real-time updates
io.on('connection', (socket) => {
  console.log('User connected to Prof News:', socket.id);
  
  // Join news room for real-time updates
  socket.join('news-feed');
  
  // Handle new story posted
  socket.on('story-posted', (story) => {
    // Broadcast to all other users in the news room
    socket.to('news-feed').emit('new-story', story);
  });
  
  // Handle story liked
  socket.on('story-liked', (data) => {
    socket.to('news-feed').emit('story-updated', data);
  });
  
  // Handle new comment
  socket.on('comment-posted', (data) => {
    socket.to('news-feed').emit('new-comment', data);
  });
  
  // Handle story engagement update
  socket.on('engagement-update', (data) => {
    socket.to('news-feed').emit('engagement-updated', data);
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// �🚀 Start Server
server.listen(PORT, () => {
  console.log(`✅ Prof Server with real-time updates running at http://localhost:${PORT}`);
  console.log(`📡 WebSocket server ready for real-time news updates`);
});
