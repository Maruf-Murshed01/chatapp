const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"], // Allow both
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors({
  origin: ["http://localhost:5173", "http://127.0.0.1:5173"]
}));
app.use(express.json());

// API health check
app.get('/api/health', (req, res) => {
  res.json({ message: 'Chat server is running!' });
});

// Store connected users
let connectedUsers = new Map();

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Handle user joining
    socket.on('user-joined', (username) => {
        connectedUsers.set(socket.id, username);
        socket.broadcast.emit('user-connected', username);
        
        // Send list of connected users to the new user
        const usersList = Array.from(connectedUsers.values());
        socket.emit('users-list', usersList);
        
        console.log(`${username} joined the chat`);
    });

    // Handle sending messages
    socket.on('send-message', (data) => {
        const username = connectedUsers.get(socket.id);
        if (username) {
            // Broadcast message to all users including sender
            io.emit('receive-message', {
                username: username,
                message: data.message,
                timestamp: new Date().toLocaleTimeString()
            });
        }
    });

    // Handle typing indicator
    socket.on('typing', () => {
        const username = connectedUsers.get(socket.id);
        if (username) {
            socket.broadcast.emit('user-typing', username);
        }
    });

    socket.on('stop-typing', () => {
        const username = connectedUsers.get(socket.id);
        if (username) {
            socket.broadcast.emit('user-stop-typing', username);
        }
    });

    // Voice Chat Events
    socket.on('request-voice-call', (data) => {
        const callerUsername = connectedUsers.get(socket.id);
        if (callerUsername) {
            const targetSocketId = Array.from(connectedUsers.entries())
                .find(([id, username]) => username === data.targetUsername)?.[0];
            
            if (targetSocketId) {
                io.to(targetSocketId).emit('incoming-voice-call', {
                    callerUsername,
                    callerId: socket.id
                });
            }
        }
    });

    socket.on('accept-voice-call', (data) => {
        io.to(data.callerId).emit('voice-call-accepted', {
            accepterId: socket.id
        });
    });

    socket.on('reject-voice-call', (data) => {
        io.to(data.callerId).emit('voice-call-rejected');
    });

    socket.on('end-voice-call', (data) => {
        if (data.targetId) {
            io.to(data.targetId).emit('voice-call-ended');
        }
    });

    // WebRTC signaling events
    socket.on('webrtc-offer', (data) => {
        io.to(data.targetId).emit('webrtc-offer', {
            offer: data.offer,
            senderId: socket.id
        });
    });

    socket.on('webrtc-answer', (data) => {
        io.to(data.targetId).emit('webrtc-answer', {
            answer: data.answer,
            senderId: socket.id
        });
    });

    socket.on('webrtc-ice-candidate', (data) => {
        io.to(data.targetId).emit('webrtc-ice-candidate', {
            candidate: data.candidate,
            senderId: socket.id
        });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        const username = connectedUsers.get(socket.id);
        if (username) {
            connectedUsers.delete(socket.id);
            socket.broadcast.emit('user-disconnected', username);
            console.log(`${username} left the chat`);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Backend server ready for frontend connections');
}); 