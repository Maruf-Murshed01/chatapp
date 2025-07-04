class VoiceChat {
    constructor(socket) {
        this.socket = socket;
        this.peerConnection = null;
        this.localStream = null;
        this.isInCall = false;
        this.isMuted = false;
        this.currentCallPartner = null;
        this.isInitiator = false;
        
        // STUN servers for NAT traversal
        this.iceServers = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
        
        this.initializeElements();
        this.initializeSocketEvents();
    }
    
    initializeElements() {
        this.voiceCallBtn = document.getElementById('voice-call-btn');
        this.muteBtn = document.getElementById('mute-btn');
        this.endCallBtn = document.getElementById('end-call-btn');
        this.callStatus = document.getElementById('call-status');
        this.incomingCallModal = document.getElementById('incoming-call-modal');
        this.callerName = document.getElementById('caller-name');
        this.acceptCallBtn = document.getElementById('accept-call-btn');
        this.rejectCallBtn = document.getElementById('reject-call-btn');
        this.localAudio = document.getElementById('local-audio');
        this.remoteAudio = document.getElementById('remote-audio');
        
        // Event listeners
        this.voiceCallBtn.addEventListener('click', () => this.startVoiceCall());
        this.muteBtn.addEventListener('click', () => this.toggleMute());
        this.endCallBtn.addEventListener('click', () => this.endCall());
        this.acceptCallBtn.addEventListener('click', () => this.acceptCall());
        this.rejectCallBtn.addEventListener('click', () => this.rejectCall());
    }
    
    initializeSocketEvents() {
        this.socket.on('incoming-voice-call', (data) => {
            this.handleIncomingCall(data);
        });
        
        this.socket.on('voice-call-accepted', (data) => {
            this.handleCallAccepted(data);
        });
        
        this.socket.on('voice-call-rejected', () => {
            this.handleCallRejected();
        });
        
        this.socket.on('voice-call-ended', () => {
            this.handleCallEnded();
        });
        
        this.socket.on('webrtc-offer', (data) => {
            this.handleOffer(data);
        });
        
        this.socket.on('webrtc-answer', (data) => {
            this.handleAnswer(data);
        });
        
        this.socket.on('webrtc-ice-candidate', (data) => {
            this.handleIceCandidate(data);
        });
    }
    
    async startVoiceCall() {
        const selectedUser = this.getSelectedUser();
        if (!selectedUser) {
            alert('Please select a user to call from the online users list');
            return;
        }
        
        try {
            await this.getUserMedia();
            this.socket.emit('request-voice-call', { targetUsername: selectedUser });
            this.updateCallStatus('Calling ' + selectedUser + '...', 'calling');
            this.isInitiator = true;
        } catch (error) {
            console.error('Error accessing microphone:', error);
            alert('Could not access microphone. Please check permissions and try again.');
        }
    }
    
    async getUserMedia() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }, 
                video: false 
            });
            this.localAudio.srcObject = this.localStream;
            return this.localStream;
        } catch (error) {
            throw new Error('Microphone access denied or not available');
        }
    }
    
    createPeerConnection() {
        this.peerConnection = new RTCPeerConnection(this.iceServers);
        
        // Add local stream tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
        }
        
        // Handle remote stream
        this.peerConnection.ontrack = (event) => {
            const [remoteStream] = event.streams;
            this.remoteAudio.srcObject = remoteStream;
        };
        
        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('webrtc-ice-candidate', {
                    candidate: event.candidate,
                    targetId: this.currentCallPartner
                });
            }
        };
        
        // Handle connection state changes
        this.peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', this.peerConnection.connectionState);
            if (this.peerConnection.connectionState === 'connected') {
                this.updateCallStatus('Connected', 'connected');
            } else if (this.peerConnection.connectionState === 'disconnected' || 
                      this.peerConnection.connectionState === 'failed') {
                this.handleCallEnded();
            }
        };
    }
    
    async handleIncomingCall(data) {
        this.callerName.textContent = data.callerUsername;
        this.currentCallPartner = data.callerId;
        this.isInitiator = false;
        this.incomingCallModal.classList.remove('hidden');
    }
    
    async acceptCall() {
        this.incomingCallModal.classList.add('hidden');
        
        try {
            await this.getUserMedia();
            this.socket.emit('accept-voice-call', { callerId: this.currentCallPartner });
            this.createPeerConnection();
            this.isInCall = true;
            this.toggleCallButtons();
        } catch (error) {
            console.error('Error accepting call:', error);
            alert('Could not accept call. Please check microphone permissions.');
        }
    }
    
    rejectCall() {
        this.incomingCallModal.classList.add('hidden');
        this.socket.emit('reject-voice-call', { callerId: this.currentCallPartner });
        this.currentCallPartner = null;
    }
    
    async handleCallAccepted(data) {
        this.currentCallPartner = data.accepterId;
        this.createPeerConnection();
        
        try {
            // Create and send offer
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            
            this.socket.emit('webrtc-offer', {
                offer: offer,
                targetId: this.currentCallPartner
            });
            
            this.isInCall = true;
            this.toggleCallButtons();
        } catch (error) {
            console.error('Error creating offer:', error);
        }
    }
    
    async handleOffer(data) {
        try {
            await this.peerConnection.setRemoteDescription(data.offer);
            
            // Create and send answer
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            
            this.socket.emit('webrtc-answer', {
                answer: answer,
                targetId: data.senderId
            });
        } catch (error) {
            console.error('Error handling offer:', error);
        }
    }
    
    async handleAnswer(data) {
        try {
            await this.peerConnection.setRemoteDescription(data.answer);
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    }
    
    async handleIceCandidate(data) {
        try {
            if (this.peerConnection) {
                await this.peerConnection.addIceCandidate(data.candidate);
            }
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
    }
    
    handleCallRejected() {
        this.updateCallStatus('Call rejected', '');
        this.cleanup();
        setTimeout(() => this.updateCallStatus('', ''), 3000);
    }
    
    handleCallEnded() {
        this.updateCallStatus('Call ended', '');
        this.cleanup();
        setTimeout(() => this.updateCallStatus('', ''), 3000);
    }
    
    toggleMute() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                this.isMuted = !audioTrack.enabled;
                
                this.muteBtn.textContent = this.isMuted ? '🔊 Unmute' : '🔇 Mute';
                this.muteBtn.classList.toggle('muted', this.isMuted);
            }
        }
    }
    
    endCall() {
        this.socket.emit('end-voice-call', { targetId: this.currentCallPartner });
        this.cleanup();
        this.updateCallStatus('', '');
    }
    
    cleanup() {
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        this.remoteAudio.srcObject = null;
        this.localAudio.srcObject = null;
        
        this.isInCall = false;
        this.isMuted = false;
        this.currentCallPartner = null;
        this.isInitiator = false;
        this.toggleCallButtons();
    }
    
    toggleCallButtons() {
        this.voiceCallBtn.classList.toggle('hidden', this.isInCall);
        this.muteBtn.classList.toggle('hidden', !this.isInCall);
        this.endCallBtn.classList.toggle('hidden', !this.isInCall);
        
        if (!this.isInCall) {
            this.muteBtn.textContent = '🔇 Mute';
            this.muteBtn.classList.remove('muted');
        }
    }
    
    updateCallStatus(status, className = '') {
        this.callStatus.textContent = status;
        this.callStatus.className = 'call-status ' + className;
    }
    
    enableVoiceCall() {
        this.voiceCallBtn.disabled = false;
    }
    
    disableVoiceCall() {
        this.voiceCallBtn.disabled = true;
    }
    
    getSelectedUser() {
        // Simple implementation - gets the first available user
        // You can enhance this with a proper user selection UI
        const usersList = document.querySelectorAll('#users-list li');
        if (usersList.length > 0) {
            // Return the first user that's not the current user
            for (let userItem of usersList) {
                const username = userItem.textContent.trim();
                const currentUser = document.getElementById('current-user').textContent;
                if (username !== currentUser) {
                    return username;
                }
            }
        }
        return null;
    }
} 