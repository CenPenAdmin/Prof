const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const https = require('https');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');

// SSL Certificate options
const sslOptions = {
    key: fs.readFileSync(path.join(__dirname, 'privkey.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'cert.pem'))
};

const app = express();

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false, // Disable for now to avoid blocking inline scripts
    crossOriginEmbedderPolicy: false
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Add request logging
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.url}`);
  next();
});

const server = https.createServer(sslOptions, app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const PORT = 443; // Standard HTTPS port

// Configure multer for audio uploads
const uploadAudio = multer({ 
  dest: 'uploads/temp/',
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    fieldSize: 1024 * 1024,     // 1MB field size limit
  },
  fileFilter: (req, file, cb) => {
    // Accept audio files
    const allowedMimes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/m4a'];
    if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.(mp3|wav|m4a)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only MP3, WAV, and M4A files are allowed.'), false);
    }
  }
});

// Configure multer for image uploads
const uploadImage = multer({ 
  dest: 'uploads/temp/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for images
    fieldSize: 1024 * 1024,     // 1MB field size limit
  },
  fileFilter: (req, file, cb) => {
    // Accept image files
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG, PNG, GIF, and WebP images are allowed.'), false);
    }
  }
});

app.use(express.static('.'));
app.use(express.json()); // Add JSON parsing middleware

// Add CORS middleware for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Add audio streaming endpoint - now show-aware
// Test endpoint
app.get('/test-debug', (req, res) => {
  console.log('🔍 TEST DEBUG ENDPOINT HIT!');
  res.json({ message: 'Debug test working', timestamp: new Date() });
});

app.get('/stream', (req, res) => {
  console.log('🎵 STREAM ENDPOINT HIT!');
  try {
    // Get current show and stream its current track
    const scheduleFile = path.join(__dirname, 'schedule.json');
    let audioPath = path.join(__dirname, 'uploads', 'g.drizzle%40cap', 'audio.wav'); // fallback
    
    console.log('🎵 STREAM REQUEST - Current hour:', new Date().getHours());
    
    if (fs.existsSync(scheduleFile)) {
      const schedule = JSON.parse(fs.readFileSync(scheduleFile));
      const currentHour = new Date().getHours();
      const currentSlot = schedule.schedule.find(slot => slot.slot === currentHour);
      
      console.log('📅 Current slot:', currentSlot);
      
      if (currentSlot && currentSlot.showId) {
        const showFile = path.join(__dirname, 'shows', `${currentSlot.showId}.json`);
        console.log('📁 Show file:', showFile);
        
        if (fs.existsSync(showFile)) {
          const show = JSON.parse(fs.readFileSync(showFile));
          console.log('🎵 Show loaded:', { 
            id: show.id, 
            title: show.title, 
            playlistLength: show.playlist?.length,
            currentTrackIndex: show.currentTrackIndex 
          });
          
          if (show.playlist && show.playlist.length > 0) {
            const currentTrack = show.playlist[show.currentTrackIndex] || show.playlist[0];
            const trackPath = path.join(__dirname, currentTrack.file);
            console.log('🎧 Current track:', { 
              title: currentTrack.title, 
              file: currentTrack.file,
              fullPath: trackPath,
              exists: fs.existsSync(trackPath)
            });
            
            if (fs.existsSync(trackPath)) {
              audioPath = trackPath;
              console.log('✅ Using show track:', audioPath);
            } else {
              console.log('❌ Track file not found, using fallback');
            }
          } else {
            console.log('❌ No playlist found, using fallback');
          }
        } else {
          console.log('❌ Show file not found, using fallback');
        }
      } else {
        console.log('❌ No scheduled show, using fallback');
      }
    } else {
      console.log('❌ Schedule file not found, using fallback');
    }
    
    console.log('🎵 Final audio path:', audioPath);
  
    if (fs.existsSync(audioPath)) {
      const stat = fs.statSync(audioPath);
      const fileSize = stat.size;
      
      // Determine content type from file extension
      let contentType = 'audio/wav';
      const ext = path.extname(audioPath).toLowerCase();
      if (ext === '.mp3') contentType = 'audio/mpeg';
      else if (ext === '.m4a') contentType = 'audio/mp4';
      
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*'
      });
      
      const readStream = fs.createReadStream(audioPath);
      readStream.pipe(res);
    } else {
      res.status(404).send('Audio content not available');
    }
  } catch (error) {
    console.error('Streaming error:', error);
    res.status(500).send('Streaming error');
  }
});

// Add API endpoint to get current audio info
app.get('/api/current-audio', (req, res) => {
  // Parse the current audio file path to extract DJ and artist info
  const audioPath = 'uploads/g.drizzle%40cap/audio.wav';
  const pathParts = audioPath.split('/');
  
  if (pathParts.length >= 3) {
    const djFolder = pathParts[1]; // 'g.drizzle%40cap'
    const fileName = pathParts[2].replace('.wav', '').replace('.mp3', '').replace('.m4a', ''); // 'audio'
    
    res.json({
      success: true,
      dj: djFolder,
      artist: fileName,
      fullPath: audioPath
    });
  } else {
    res.status(404).json({
      success: false,
      message: 'Could not parse audio file info'
    });
  }
});

// ================================
// SHOW MANAGEMENT API ENDPOINTS
// ================================

// Get current show info (replaces current-audio endpoint for show-based system)
// Get all shows
// Test endpoint to verify server is working
app.get('/api/test', (req, res) => {
  console.log('🧪 TEST ENDPOINT HIT');
  res.json({ success: true, message: 'Server is working!', timestamp: new Date().toISOString() });
});

app.get('/api/shows', (req, res) => {
  try {
    const showsDir = path.join(__dirname, 'shows');
    const owner = req.query.owner ? decodeURIComponent(req.query.owner) : undefined;
    
    console.log('📋 GET /api/shows - Owner filter:', owner);
    
    if (!fs.existsSync(showsDir)) {
      fs.mkdirSync(showsDir);
    }

    const showFiles = fs.readdirSync(showsDir).filter(file => file.endsWith('.json'));
    const shows = [];
    
    showFiles.forEach(file => {
      try {
        const showData = JSON.parse(fs.readFileSync(path.join(showsDir, file)));
        
        // Filter by owner if specified
        if (!owner || showData.owner === owner) {
          shows.push({
            id: showData.id,
            title: showData.title,
            owner: showData.owner,
            collaborators: showData.collaborators || [],
            description: showData.description,
            status: showData.status,
            plays: showData.plays || 0,
            likes: showData.likes || 0,
            created: showData.created,
            scheduledSlot: showData.scheduledSlot,
            playlist: showData.playlist || [],
            isCollaborative: showData.isCollaborative || false
          });
        }
      } catch (err) {
        console.error(`Error reading show file ${file}:`, err);
      }
    });
    
    console.log(`📋 Found ${shows.length} shows for owner: ${owner || 'all users'}`);
    res.json({ success: true, shows });
  } catch (error) {
    console.error('❌ Error in GET /api/shows:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get specific show details
app.get('/api/shows/:showId', (req, res) => {
  try {
    const showFile = path.join(__dirname, 'shows', `${req.params.showId}.json`);
    
    if (!fs.existsSync(showFile)) {
      return res.status(404).json({ success: false, error: 'Show not found' });
    }
    
    const show = JSON.parse(fs.readFileSync(showFile));
    res.json({ success: true, show });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update show
app.put('/api/shows/:showId', (req, res) => {
  try {
    const showFile = path.join(__dirname, 'shows', `${req.params.showId}.json`);
    
    if (!fs.existsSync(showFile)) {
      return res.status(404).json({ success: false, error: 'Show not found' });
    }
    
    const show = JSON.parse(fs.readFileSync(showFile));
    const { title, description, playlist, newSlot } = req.body;
    
    console.log('📝 Updating show:', req.params.showId);
    console.log('📋 Update data:', { title, description, playlistLength: playlist?.length, newSlot });
    
    // Update basic fields
    if (title) show.title = title;
    if (description !== undefined) show.description = description;
    if (playlist) show.playlist = playlist;
    
    // Handle slot change
    if (newSlot !== undefined && newSlot !== show.scheduledSlot) {
      const scheduleFile = path.join(__dirname, 'schedule.json');
      
      if (fs.existsSync(scheduleFile)) {
        const schedule = JSON.parse(fs.readFileSync(scheduleFile));
        
        // Check if new slot is available
        const newSlotData = schedule.schedule.find(slot => slot.slot === newSlot);
        const oldSlotData = schedule.schedule.find(slot => slot.slot === show.scheduledSlot);
        
        if (newSlotData && (newSlotData.status === 'available' || newSlotData.showId === null)) {
          // Free up old slot
          if (oldSlotData) {
            oldSlotData.showId = null;
            oldSlotData.status = 'available';
            delete oldSlotData.title;
            delete oldSlotData.dj;
          }
          
          // Assign new slot
          newSlotData.showId = show.id;
          newSlotData.status = 'scheduled';
          newSlotData.title = show.title;
          newSlotData.dj = show.owner;
          
          // Update show
          show.scheduledSlot = newSlot;
          
          // Save schedule
          fs.writeFileSync(scheduleFile, JSON.stringify(schedule, null, 2));
          
          console.log(`✅ Slot changed from ${show.scheduledSlot} to ${newSlot}`);
        } else {
          return res.status(400).json({ success: false, error: 'Selected time slot is not available' });
        }
      }
    }
    
    // Save updated show
    fs.writeFileSync(showFile, JSON.stringify(show, null, 2));
    
    console.log('✅ Show updated successfully');
    res.json({ success: true, show });
  } catch (error) {
    console.error('❌ Error updating show:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete show
app.delete('/api/shows/:showId', (req, res) => {
  try {
    console.log('🗑️ DELETE request received for show:', req.params.showId);
    console.log('🗑️ Request body:', req.body);
    console.log('🗑️ Request headers:', req.headers);
    
    const showFile = path.join(__dirname, 'shows', `${req.params.showId}.json`);
    const { userEmail } = req.body;
    
    console.log('🗑️ Looking for show file:', showFile);
    console.log('🗑️ User email from request:', userEmail);
    
    if (!fs.existsSync(showFile)) {
      console.log('❌ Show file not found:', showFile);
      return res.status(404).json({ success: false, error: 'Show not found' });
    }
    
    const show = JSON.parse(fs.readFileSync(showFile));
    console.log('🗑️ Show data:', { id: show.id, title: show.title, owner: show.owner });
    
    // Verify ownership
    if (show.owner !== userEmail) {
      console.log('❌ Ownership verification failed:', { showOwner: show.owner, requestUser: userEmail });
      return res.status(403).json({ success: false, error: 'You can only delete your own shows' });
    }
    
    console.log('✅ Ownership verified, proceeding with deletion');
    console.log('🗑️ Deleting show:', req.params.showId, 'by:', userEmail);
    
    // Free up the schedule slot
    const scheduleFile = path.join(__dirname, 'schedule.json');
    if (fs.existsSync(scheduleFile)) {
      const schedule = JSON.parse(fs.readFileSync(scheduleFile));
      const slotData = schedule.schedule.find(slot => slot.showId === show.id);
      
      if (slotData) {
        slotData.showId = null;
        slotData.status = 'available';
        delete slotData.title;
        delete slotData.dj;
        delete slotData.duration;
        delete slotData.showTitle;
        delete slotData.showOwner;
        
        fs.writeFileSync(scheduleFile, JSON.stringify(schedule, null, 2));
        console.log(`✅ Freed up slot ${show.scheduledSlot}`);
      }
    }
    
    // Delete uploaded files for this show only
    if (show.playlist) {
      show.playlist.forEach(track => {
        if (track.file) {
          const trackFile = path.join(__dirname, track.file);
          if (fs.existsSync(trackFile)) {
            try {
              fs.unlinkSync(trackFile);
              console.log(`🗑️ Deleted track file: ${track.file}`);
            } catch (error) {
              console.warn(`⚠️ Could not delete track file: ${track.file}`, error.message);
            }
          }
        }
      });
    }

    // Delete the show file
    fs.unlinkSync(showFile);    console.log('✅ Show deleted successfully');
    res.json({ success: true, message: 'Show deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting show:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new show
app.post('/api/shows', (req, res) => {
  try {
    const { title, description, owner, playlist, isCollaborative, djName } = req.body;
    
    if (!title || !owner) {
      return res.status(400).json({ success: false, error: 'Title and owner are required' });
    }
    
    // Check if user already has a show (one per 24 hours rule)
    const showsDir = path.join(__dirname, 'shows');
    if (fs.existsSync(showsDir)) {
      const showFiles = fs.readdirSync(showsDir).filter(file => file.endsWith('.json'));
      
      for (const file of showFiles) {
        try {
          const existingShow = JSON.parse(fs.readFileSync(path.join(showsDir, file)));
          if (existingShow.owner === owner) {
            return res.status(400).json({ 
              success: false, 
              error: 'You can only have one show per 24-hour period. Please edit your existing show instead.' 
            });
          }
        } catch (err) {
          console.error(`Error reading show file ${file}:`, err);
        }
      }
    }
    
    // Find next available slot
    const scheduleFile = path.join(__dirname, 'schedule.json');
    let schedule = { schedule: [] };
    
    if (fs.existsSync(scheduleFile)) {
      schedule = JSON.parse(fs.readFileSync(scheduleFile));
    }
    
    const availableSlot = schedule.schedule.find(slot => slot.status === 'available');
    
    if (!availableSlot) {
      return res.status(400).json({ success: false, error: 'No available time slots' });
    }
    
    // Generate show ID
    const showId = `show_${Date.now()}`;
    
    const newShow = {
      id: showId,
      title,
      owner,
      djName: djName || owner, // Use djName if provided, otherwise fall back to owner
      collaborators: [],
      description: description || '',
      created: new Date().toISOString(),
      status: 'draft',
      tags: [],
      visibility: 'public',
      allowDownload: false,
      plays: 0,
      likes: 0,
      scheduledSlot: availableSlot.slot,
      playlist: playlist || [],
      invitations: [],
      isCollaborative: isCollaborative || false,
      currentTrackIndex: 0,
      playbackPosition: 0
    };
    
    // Save show
    const showFile = path.join(__dirname, 'shows', `${showId}.json`);
    fs.writeFileSync(showFile, JSON.stringify(newShow, null, 2));
    
    // Update schedule
    availableSlot.showId = showId;
    availableSlot.status = 'scheduled';
    fs.writeFileSync(scheduleFile, JSON.stringify(schedule, null, 2));
    
    res.json({ success: true, show: newShow });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get schedule
app.get('/api/schedule', (req, res) => {
  try {
    const scheduleFile = path.join(__dirname, 'schedule.json');
    
    if (!fs.existsSync(scheduleFile)) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }
    
    const schedule = JSON.parse(fs.readFileSync(scheduleFile));
    
    // Add show details to schedule
    const enrichedSchedule = schedule.schedule.map(slot => {
      if (slot.showId) {
        try {
          const showFile = path.join(__dirname, 'shows', `${slot.showId}.json`);
          if (fs.existsSync(showFile)) {
            const show = JSON.parse(fs.readFileSync(showFile));
            return {
              ...slot,
              showTitle: show.title,
              showOwner: show.owner,
              showDjName: show.djName || show.owner,
              showStatus: show.status
            };
          }
        } catch (err) {
          console.error(`Error reading show ${slot.showId}:`, err);
        }
      }
      return slot;
    });
    
    res.json({ 
      success: true, 
      schedule: enrichedSchedule,
      currentSlot: schedule.currentSlot || 0
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get current playing show based on time
app.get('/api/current-show', (req, res) => {
  try {
    const scheduleFile = path.join(__dirname, 'schedule.json');
    
    if (!fs.existsSync(scheduleFile)) {
      // Fallback to original system
      return res.json({
        success: true,
        show: {
          title: "Breeze Radio",
          dj: "g.drizzle@cap",
          currentTrack: { title: "audio", artist: "G.Drizzle", type: "music" }
        }
      });
    }
    
    const schedule = JSON.parse(fs.readFileSync(scheduleFile));
    const currentHour = new Date().getHours();
    
    // Find current time slot
    const currentSlot = schedule.schedule.find(slot => slot.slot === currentHour);
    
    if (currentSlot && currentSlot.showId) {
      const showFile = path.join(__dirname, 'shows', `${currentSlot.showId}.json`);
      
      if (fs.existsSync(showFile)) {
        const show = JSON.parse(fs.readFileSync(showFile));
        const currentTrack = show.playlist[show.currentTrackIndex] || show.playlist[0];
        
        if (currentTrack) {
          return res.json({
            success: true,
            show: {
              id: show.id,
              title: show.title,
              dj: show.djName || show.owner,
              description: show.description,
              currentTrack: {
                title: currentTrack.title,
                artist: currentTrack.artist,
                type: currentTrack.type
              },
              totalTracks: show.playlist.length,
              scheduledSlot: show.scheduledSlot,
              timeSlot: currentSlot.time
            }
          });
        }
      }
    }
    
    // Fallback: find any available show
    const fallbackShow = schedule.schedule.find(slot => slot.showId);
    if (fallbackShow) {
      const showFile = path.join(__dirname, 'shows', `${fallbackShow.showId}.json`);
      if (fs.existsSync(showFile)) {
        const show = JSON.parse(fs.readFileSync(showFile));
        const currentTrack = show.playlist[0];
        
        return res.json({
          success: true,
          show: {
            id: show.id,
            title: show.title,
            dj: show.owner,
            currentTrack: {
              title: currentTrack?.title || "No content",
              artist: currentTrack?.artist || show.owner,
              type: currentTrack?.type || "music"
            }
          }
        });
      }
    }
    
    // Final fallback
    res.json({
      success: true,
      show: {
        title: "Breeze Radio",
        dj: "Station",
        currentTrack: { title: "No show scheduled", artist: "Please create a show", type: "announcement" }
      }
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Invite collaborator to show
app.post('/api/shows/:showId/invite', (req, res) => {
  try {
    const { collaboratorEmail } = req.body;
    const showFile = path.join(__dirname, 'shows', `${req.params.showId}.json`);
    
    if (!fs.existsSync(showFile)) {
      return res.status(404).json({ success: false, error: 'Show not found' });
    }
    
    const show = JSON.parse(fs.readFileSync(showFile));
    
    // Check if user exists
    const userFile = path.join(__dirname, 'users', `${encodeURIComponent(collaboratorEmail)}.json`);
    if (!fs.existsSync(userFile)) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Check if already invited or collaborating
    if (show.collaborators.includes(collaboratorEmail) || 
        show.invitations.some(inv => inv.email === collaboratorEmail)) {
      return res.status(400).json({ success: false, error: 'User already invited or collaborating' });
    }
    
    // Add invitation
    show.invitations.push({
      email: collaboratorEmail,
      invitedAt: new Date().toISOString(),
      status: 'pending'
    });
    
    show.isCollaborative = true;
    
    fs.writeFileSync(showFile, JSON.stringify(show, null, 2));
    
    res.json({ success: true, message: 'Invitation sent' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Accept collaboration invitation
app.post('/api/shows/:showId/accept-invite', (req, res) => {
  try {
    const { userEmail } = req.body;
    const showFile = path.join(__dirname, 'shows', `${req.params.showId}.json`);
    
    if (!fs.existsSync(showFile)) {
      return res.status(404).json({ success: false, error: 'Show not found' });
    }
    
    const show = JSON.parse(fs.readFileSync(showFile));
    
    // Find invitation
    const invitationIndex = show.invitations.findIndex(inv => inv.email === userEmail);
    if (invitationIndex === -1) {
      return res.status(404).json({ success: false, error: 'Invitation not found' });
    }
    
    // Move to collaborators
    show.collaborators.push(userEmail);
    show.invitations.splice(invitationIndex, 1);
    
    fs.writeFileSync(showFile, JSON.stringify(show, null, 2));
    
    res.json({ success: true, message: 'Invitation accepted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add content to show
app.post('/api/shows/:showId/content', (req, res) => {
  try {
    const { title, artist, fileName, uploadedBy } = req.body;
    const showFile = path.join(__dirname, 'shows', `${req.params.showId}.json`);
    
    if (!fs.existsSync(showFile)) {
      return res.status(404).json({ success: false, error: 'Show not found' });
    }
    
    const show = JSON.parse(fs.readFileSync(showFile));
    
    // Check if user can add content (owner or collaborator)
    if (show.owner !== uploadedBy && !show.collaborators.includes(uploadedBy)) {
      return res.status(403).json({ success: false, error: 'Not authorized to add content' });
    }
    
    // Add new content
    const newItem = {
      id: `item_${Date.now()}`,
      type: 'music',
      file: fileName,
      title: title || 'Untitled',
      artist: artist || uploadedBy,
      owner: uploadedBy,
      uploadedBy: uploadedBy,
      order: show.playlist.length + 1
    };
    
    show.playlist.push(newItem);
    
    // Update status to published if it has content
    if (show.status === 'draft' && show.playlist.length > 0) {
      show.status = 'published';
    }
    
    fs.writeFileSync(showFile, JSON.stringify(show, null, 2));
    
    res.json({ success: true, show, contentAdded: newItem });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🧪 Test endpoint for external access verification
app.get('/api/test', (req, res) => {
  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress;
  res.json({
    success: true,
    message: 'Prof HTTPS Server is accessible!',
    timestamp: new Date().toISOString(),
    serverIP: '192.168.88.4',
    clientIP: clientIP,
    protocol: req.protocol,
    secure: req.secure,
    headers: {
      host: req.headers.host,
      userAgent: req.headers['user-agent']
    }
  });
});

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
app.post('/api/upload-image', uploadImage.single('profileImage'), (req, res) => {
  console.log('🖼️ Image upload request received');
  console.log('File:', req.file ? 'File received' : 'No file received');
  
  const email = req.query.email;
  if (!email || !req.file) {
    console.error('❌ Missing email or file for image upload');
    return res.status(400).json({ error: 'Missing email or file.' });
  }

  try {
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

    console.log(`✅ Image uploaded successfully for ${email}`);
    res.json({ success: true, imageUrl: userData.imageUrl });
  } catch (error) {
    console.error('❌ Error uploading image:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Audio upload endpoint for shows
app.post('/api/upload-audio', uploadAudio.single('audioFile'), (req, res) => {
  console.log('📱 Audio upload request received');
  console.log('Body:', req.body);
  console.log('File:', req.file ? 'File received' : 'No file received');
  console.log('Headers:', req.headers);
  
  const { showId, title, artist, userEmail } = req.body;
  
  if (!showId || !userEmail || !req.file) {
    console.error('❌ Missing required fields:', { showId: !!showId, userEmail: !!userEmail, file: !!req.file });
    return res.status(400).json({ 
      success: false,
      error: 'Missing required fields or file.',
      details: {
        showId: !showId ? 'Missing showId' : 'OK',
        userEmail: !userEmail ? 'Missing userEmail' : 'OK',
        file: !req.file ? 'Missing file' : 'OK'
      }
    });
  }

  try {
    console.log(`🎵 Processing upload for show ${showId} by ${userEmail}`);
    
    // Check if show exists and user has permission
    const showFile = path.join(__dirname, 'shows', `${showId}.json`);
    if (!fs.existsSync(showFile)) {
      console.error('❌ Show not found:', showId);
      return res.status(404).json({ success: false, error: 'Show not found' });
    }

    const show = JSON.parse(fs.readFileSync(showFile));
    console.log(`📋 Show loaded: ${show.title}, Owner: ${show.owner}`);
    
    // Verify user can upload (owner or collaborator)
    if (show.owner !== userEmail && !show.collaborators.includes(userEmail)) {
      console.error('❌ User not authorized:', userEmail, 'for show owned by:', show.owner);
      return res.status(403).json({ success: false, error: 'Not authorized to upload to this show' });
    }

    const safeEmail = encodeURIComponent(userEmail);
    const userMusicDir = path.join(__dirname, 'uploads', safeEmail, 'music');
    console.log(`📁 Creating directory: ${userMusicDir}`);
    
    if (!fs.existsSync(userMusicDir)) {
      fs.mkdirSync(userMusicDir, { recursive: true });
    }

    // Generate unique filename
    const fileExtension = path.extname(req.file.originalname);
    const fileName = `${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = path.join(userMusicDir, fileName);
    
    console.log(`📂 Moving file from ${req.file.path} to ${filePath}`);
    
    // Move uploaded file
    fs.renameSync(req.file.path, filePath);

    const relativePath = `uploads/${safeEmail}/music/${fileName}`;

    // Create new item
    const newItem = {
      id: `item_${Date.now()}`,
      type: 'music',
      file: relativePath,
      title: title || req.file.originalname.replace(fileExtension, ''),
      artist: artist || userEmail.replace('%40', '@'),
      owner: userEmail,
      uploadedBy: userEmail,
      order: show.playlist.length + 1
    };

    console.log(`➕ Adding item to show:`, newItem.title);

    // Update show
    show.playlist.push(newItem);
    
    if (show.status === 'draft' && show.playlist.length > 0) {
      show.status = 'published';
      console.log('📢 Show status changed to published');
    }

    fs.writeFileSync(showFile, JSON.stringify(show, null, 2));
    console.log('✅ Show updated successfully');

    res.json({ 
      success: true, 
      message: 'Audio uploaded successfully',
      filePath: relativePath,
      contentAdded: newItem,
      show: {
        id: show.id,
        title: show.title,
        trackCount: show.playlist.length,
        status: show.status
      }
    });

  } catch (error) {
    console.error('💥 Audio upload error:', error);
    console.error('Stack trace:', error.stack);
    
    // Clean up temp file if it exists
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('Failed to cleanup temp file:', cleanupError);
      }
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Upload failed: ' + error.message,
      details: error.stack
    });
  }
});

// 🪙 ProfCoin API Endpoints

// Update user's ProfCoin balance
app.post('/api/user/update-balance', (req, res) => {
  const { email, balance, blocksMined, totalEarned, miningActive, sessionId } = req.body;
  if (!email || balance === undefined) {
    return res.status(400).json({ error: 'Missing email or balance' });
  }

  try {
    const safeEmail = encodeURIComponent(email);
    const userFile = path.join(__dirname, 'users', `${safeEmail}.json`);
    
    if (!fs.existsSync(userFile)) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = JSON.parse(fs.readFileSync(userFile, 'utf8'));
    userData.profcoinBalance = balance;
    userData.blocksMined = blocksMined || userData.blocksMined || 0;
    userData.totalEarned = totalEarned || userData.totalEarned || 0;
    userData.lastMiningUpdate = new Date().toISOString();
    
    // Track mining state
    if (miningActive !== undefined) {
      userData.miningActive = miningActive;
      userData.miningSessionId = sessionId || userData.miningSessionId;
      userData.miningStartTime = miningActive ? (userData.miningStartTime || new Date().toISOString()) : null;
    }
    
    fs.writeFileSync(userFile, JSON.stringify(userData, null, 2));
    res.json({ success: true, balance: userData.profcoinBalance });
  } catch (error) {
    console.error('Error updating user balance:', error);
    res.status(500).json({ error: 'Failed to update balance' });
  }
});

// Get user's ProfCoin balance
app.get('/api/user/:email/balance', (req, res) => {
  try {
    const safeEmail = encodeURIComponent(req.params.email);
    const userFile = path.join(__dirname, 'users', `${safeEmail}.json`);
    
    if (!fs.existsSync(userFile)) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = JSON.parse(fs.readFileSync(userFile, 'utf8'));
    res.json({ 
      balance: userData.profcoinBalance || 0,
      blocksMined: userData.blocksMined || 0,
      totalEarned: userData.totalEarned || 0,
      miningActive: userData.miningActive || false,
      miningSessionId: userData.miningSessionId || null,
      miningStartTime: userData.miningStartTime || null
    });
  } catch (error) {
    console.error('Error getting user balance:', error);
    res.status(500).json({ error: 'Failed to get balance' });
  }
});

// Get top ProfCoin miners
app.get('/api/top-miners', (req, res) => {
  try {
    const usersDir = path.join(__dirname, 'users');
    const userFiles = fs.readdirSync(usersDir).filter(file => file.endsWith('.json'));
    
    const miners = [];
    
    userFiles.forEach(file => {
      try {
        const userData = JSON.parse(fs.readFileSync(path.join(usersDir, file), 'utf8'));
        if (userData.profcoinBalance && userData.profcoinBalance > 0) {
          miners.push({
            name: userData.name || userData.email,
            email: userData.email,
            balance: userData.profcoinBalance || 0,
            blocksMined: userData.blocksMined || 0,
            totalEarned: userData.totalEarned || 0
          });
        }
      } catch (error) {
        console.error(`Error reading user file ${file}:`, error);
      }
    });
    
    // Sort by balance descending and get top 10
    miners.sort((a, b) => b.balance - a.balance);
    const topMiners = miners.slice(0, 10);
    
    res.json({ miners: topMiners });
  } catch (error) {
    console.error('Error getting top miners:', error);
    res.status(500).json({ error: 'Failed to get top miners' });
  }
});

// Trading system
let trades = []; // In-memory trades (use database for production)

// Create a trade proposal
app.post('/api/trade', (req, res) => {
  const { sender, recipient, amount, note } = req.body;
  if (!sender || !recipient || !amount || amount <= 0) {
    return res.status(400).json({ error: 'Missing or invalid trade details' });
  }

  try {
    // Check if sender has sufficient balance
    const senderFile = path.join(__dirname, 'users', `${encodeURIComponent(sender)}.json`);
    if (!fs.existsSync(senderFile)) {
      return res.status(404).json({ error: 'Sender not found' });
    }

    const senderData = JSON.parse(fs.readFileSync(senderFile, 'utf8'));
    const senderBalance = senderData.profcoinBalance || 0;

    if (senderBalance < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Check if recipient exists
    const recipientFile = path.join(__dirname, 'users', `${encodeURIComponent(recipient)}.json`);
    if (!fs.existsSync(recipientFile)) {
      return res.status(404).json({ error: 'Recipient not found' });
    }

    const trade = {
      id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sender,
      recipient,
      amount: parseFloat(amount),
      note: note || '',
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    trades.push(trade);
    res.json({ success: true, trade });
  } catch (error) {
    console.error('Error creating trade:', error);
    res.status(500).json({ error: 'Failed to create trade' });
  }
});

// Get trades for a user (sent and received)
app.get('/api/trades/:email', (req, res) => {
  const email = req.params.email;
  const userTrades = trades.filter(trade => 
    trade.sender === email || trade.recipient === email
  );
  res.json(userTrades);
});

// Accept or reject a trade
app.post('/api/trade/update', (req, res) => {
  const { tradeId, status, userEmail } = req.body;
  
  if (!['accepted', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const trade = trades.find(t => t.id === tradeId);
    if (!trade) {
      return res.status(404).json({ error: 'Trade not found' });
    }

    if (trade.recipient !== userEmail) {
      return res.status(403).json({ error: 'Unauthorized to update this trade' });
    }

    if (trade.status !== 'pending') {
      return res.status(400).json({ error: 'Trade already processed' });
    }

    trade.status = status;
    trade.updatedAt = new Date().toISOString();

    // If accepted, transfer the coins
    if (status === 'accepted') {
      const senderFile = path.join(__dirname, 'users', `${encodeURIComponent(trade.sender)}.json`);
      const recipientFile = path.join(__dirname, 'users', `${encodeURIComponent(trade.recipient)}.json`);

      const senderData = JSON.parse(fs.readFileSync(senderFile, 'utf8'));
      const recipientData = JSON.parse(fs.readFileSync(recipientFile, 'utf8'));

      // Check sender still has balance
      if ((senderData.profcoinBalance || 0) < trade.amount) {
        return res.status(400).json({ error: 'Sender no longer has sufficient balance' });
      }

      // Transfer coins
      senderData.profcoinBalance = (senderData.profcoinBalance || 0) - trade.amount;
      recipientData.profcoinBalance = (recipientData.profcoinBalance || 0) + trade.amount;

      // Save updated balances
      fs.writeFileSync(senderFile, JSON.stringify(senderData, null, 2));
      fs.writeFileSync(recipientFile, JSON.stringify(recipientData, null, 2));
    }

    res.json({ success: true, trade });
  } catch (error) {
    console.error('Error updating trade:', error);
    res.status(500).json({ error: 'Failed to update trade' });
  }
});

// Get all pending trades (for marketplace view)
app.get('/api/trades', (req, res) => {
  const pendingTrades = trades.filter(trade => trade.status === 'pending');
  res.json(pendingTrades);
});

// Cancel a trade (only by sender)
app.delete('/api/trade/:tradeId', (req, res) => {
  const { tradeId } = req.params;
  const { userEmail } = req.body;

  try {
    const tradeIndex = trades.findIndex(t => t.id === tradeId);
    if (tradeIndex === -1) {
      return res.status(404).json({ error: 'Trade not found' });
    }

    const trade = trades[tradeIndex];
    if (trade.sender !== userEmail) {
      return res.status(403).json({ error: 'Unauthorized to cancel this trade' });
    }

    if (trade.status !== 'pending') {
      return res.status(400).json({ error: 'Cannot cancel processed trade' });
    }

    trades.splice(tradeIndex, 1);
    res.json({ success: true, message: 'Trade cancelled' });
  } catch (error) {
    console.error('Error cancelling trade:', error);
    res.status(500).json({ error: 'Failed to cancel trade' });
  }
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

// Send a message
app.post('/api/messages', (req, res) => {
  const { sender, recipient, message, timestamp } = req.body;
  if (!sender || !recipient || !message) return res.status(400).json({ error: 'Missing required fields' });

  // Create a consistent conversation ID by sorting emails alphabetically
  const conversationId = [sender, recipient].sort().join('|');
  const messagesPath = path.join(__dirname, 'messages', `${encodeURIComponent(conversationId)}.json`);
  
  // Load existing messages or create empty array
  let messages = [];
  if (fs.existsSync(messagesPath)) {
    messages = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));
  }

  // Add new message
  const newMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    sender,
    recipient,
    message,
    timestamp: timestamp || new Date().toISOString()
  };
  
  messages.push(newMessage);
  
  // Save messages
  fs.writeFileSync(messagesPath, JSON.stringify(messages, null, 2));
  
  res.json({ success: true, message: newMessage });
});

// News API - Stories
app.get('/api/news/stories', (req, res) => {
  const newsPath = path.join(__dirname, 'news-stories.json');
  
  if (!fs.existsSync(newsPath)) {
    return res.json({ stories: [] });
  }

  const fileContent = JSON.parse(fs.readFileSync(newsPath, 'utf8'));
  // Handle both old array format and new object format
  let newsData;
  if (Array.isArray(fileContent)) {
    newsData = { stories: fileContent };
  } else {
    newsData = fileContent;
    // Ensure stories array exists
    if (!newsData.stories) {
      newsData.stories = [];
    }
  }
  res.json(newsData);
});

app.post('/api/news/stories', (req, res) => {
  const story = req.body;
  if (!story.title || !story.content || !story.author) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const newsPath = path.join(__dirname, 'news-stories.json');
  
  // Load existing news or create empty array
  let newsData = { stories: [] };
  if (fs.existsSync(newsPath)) {
    const fileContent = JSON.parse(fs.readFileSync(newsPath, 'utf8'));
    // Handle both old array format and new object format
    if (Array.isArray(fileContent)) {
      newsData = { stories: fileContent };
    } else {
      newsData = fileContent;
    }
    // Ensure stories array exists
    if (!newsData.stories) {
      newsData.stories = [];
    }
  }

  // Add new story (use the story object from frontend directly)
  newsData.stories.unshift(story);
  
  // Save news
  fs.writeFileSync(newsPath, JSON.stringify(newsData, null, 2));
  
  // Emit to all connected clients
  io.emit('new-story', story);
  
  res.json({ success: true, story: story });
});

// Update story (for likes)
app.put('/api/news/stories/:id', (req, res) => {
  const storyId = req.params.id;
  const updates = req.body;
  
  const newsPath = path.join(__dirname, 'news-stories.json');
  
  if (!fs.existsSync(newsPath)) {
    return res.status(404).json({ error: 'No stories found' });
  }

  let newsData = JSON.parse(fs.readFileSync(newsPath, 'utf8'));
  const storyIndex = newsData.stories.findIndex(s => s.id === storyId);
  
  if (storyIndex === -1) {
    return res.status(404).json({ error: 'Story not found' });
  }

  // Update story
  Object.assign(newsData.stories[storyIndex], updates);
  
  // Save updated news
  fs.writeFileSync(newsPath, JSON.stringify(newsData, null, 2));
  
  // Emit update to all connected clients
  io.emit('story-updated', {
    storyId: storyId,
    likes: newsData.stories[storyIndex].likes,
    likedBy: newsData.stories[storyIndex].likedBy
  });
  
  res.json({ success: true });
});

// News API - Comments
app.get('/api/news/comments', (req, res) => {
  const commentsPath = path.join(__dirname, 'news-comments.json');
  
  if (!fs.existsSync(commentsPath)) {
    return res.json({ comments: {} });
  }

  const commentsData = JSON.parse(fs.readFileSync(commentsPath, 'utf8'));
  res.json(commentsData);
});

app.post('/api/news/comments', (req, res) => {
  const { storyId, comment } = req.body;
  if (!storyId || !comment) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const commentsPath = path.join(__dirname, 'news-comments.json');
  
  // Load existing comments or create empty object
  let commentsData = { comments: {} };
  if (fs.existsSync(commentsPath)) {
    commentsData = JSON.parse(fs.readFileSync(commentsPath, 'utf8'));
  }

  // Initialize comments array for story if it doesn't exist
  if (!commentsData.comments[storyId]) {
    commentsData.comments[storyId] = [];
  }

  // Add new comment
  commentsData.comments[storyId].unshift(comment);
  
  // Save comments
  fs.writeFileSync(commentsPath, JSON.stringify(commentsData, null, 2));
  
  // Emit to all connected clients
  io.emit('new-comment', {
    storyId: storyId,
    comment: comment
  });
  
  res.json({ success: true, comment: comment });
});

// Legacy endpoints for backward compatibility
app.get('/api/news', (req, res) => {
  res.redirect('/api/news/stories');
});

app.post('/api/news', (req, res) => {
  res.redirect(307, '/api/news/stories');
});

// Socket.IO for real-time updates
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Handle story posting from frontend
  socket.on('story-posted', (story) => {
    console.log('Broadcasting new story via WebSocket:', story.title);
    socket.broadcast.emit('new-story', story);
  });

  // Handle story likes from frontend
  socket.on('story-liked', (data) => {
    console.log('Broadcasting story like update:', data.storyId);
    socket.broadcast.emit('story-updated', data);
  });

  // Handle comments from frontend
  socket.on('comment-posted', (data) => {
    console.log('Broadcasting new comment:', data.storyId);
    socket.broadcast.emit('new-comment', data);
  });

  // Legacy event handler
  socket.on('story-engagement', (data) => {
    socket.broadcast.emit('engagement-updated', data);
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// 🚀 Start Server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Prof HTTPS Server running at https://localhost:${PORT}`);
  console.log(`🌐 Server accessible from all network interfaces (0.0.0.0:${PORT})`);
  console.log(`🔒 SSL/TLS encryption enabled`);
  console.log(`📡 WebSocket server ready for real-time news updates`);
  console.log(`🪙 ProfCoin trading system enabled`);
  console.log(`🛡️  Security middleware active (Helmet + Rate Limiting)`);
  console.log(`⚠️  Note: Using self-signed certificate. Browsers will show security warning.`);
});
