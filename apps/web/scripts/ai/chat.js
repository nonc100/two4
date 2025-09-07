class TWO4AIChatApp {
    constructor() {
        this.socket = null;
        this.username = null;
        this.userId = null;
        this.roomId = 'general'; // 기본 방
        this.isConnected = false;
        
        this.init();
    }
    
    init() {
        this.setupElements();
        this.generateUserInfo();
        this.connectSocket();
        this.setupEventListeners();
        this.showWelcomeMessage();
    }
    
    setupElements() {
        this.messagesContainer = document.getElementById('messagesContainer');
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');
    }
    
    generateUserInfo() {
        // 임시 사용자 정보 생성 (실제로는 로그인 시스템에서 가져오기)
        this.username = 'User' + Math.floor(Math.random() * 10000);
        this.userId = 'user_' + Date.now();
    }
    
    connectSocket() {
        // Socket.io 연결
        this.socket = io('/ai-chat');
        
        this.socket.on('connect', () => {
            console.log('✅ 서버에 연결되었습니다!');
            this.isConnected = true;
            this.joinRoom();
        });
        
        this.socket.on('disconnect', () => {
            console.log('❌ 서버 연결이 끊어졌습니다.');
            this.isConnected = false;
            this.addSystemMessage('서버 연결이 끊어졌습니다. 재연결을 시도하고 있습니다...');
        });
        
        this.socket.on('receive-message', (data) => {
            this.displayMessage(data);
        });
        
        this.socket.on('ai-response', (data) => {
            this.displayAIResponse(data);
            this.showEffect(data.effect);
        });
        
        this.socket.on('user-joined', (data) => {
            this.addSystemMessage(`${data.username}님이 입장하셨습니다.`);
        });
        
        this.socket.on('user-left', (data) => {
            this.addSystemMessage(`${data.username}님이 퇴장하셨습니다.`);
        });
        
        this.socket.on('error', (data) => {
            this.addSystemMessage(`오류: ${data.message}`, 'error');
        });
    }
    
    joinRoom() {
        this.socket.emit('join-room', {
            roomId: this.roomId,
            username: this.username
        });
    }
    
    setupEventListeners() {
        // 전송 버튼 클릭
        this.sendButton.addEventListener('click', () => {
            this.sendMessage();
        });
        
        // 엔터키로 전송
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        // 입력 중 표시 (선택사항)
        let typingTimer;
        this.messageInput.addEventListener('input', () => {
            clearTimeout(typingTimer);
            this.socket.emit('typing', { roomId: this.roomId, isTyping: true });
            
            typingTimer = setTimeout(() => {
                this.socket.emit('typing', { roomId: this.roomId, isTyping: false });
            }, 1000);
        });
    }
    
    sendMessage() {
        const message = this.messageInput.value.trim();
        
        if (!message) return;
        if (!this.isConnected) {
            this.addSystemMessage('서버에 연결되지 않았습니다.', 'error');
            return;
        }
        
        // 메시지 전송
        this.socket.emit('send-message', {
            roomId: this.roomId,
            message: message,
            username: this.username,
            userId: this.userId
        });
        
        // 입력창 초기화
        this.messageInput.value = '';
        this.messageInput.focus();
    }
    
    displayMessage(data) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${data.isCommand ? 'command' : 'user'}`;
        
        const headerDiv = document.createElement('div');
        headerDiv.className = 'message-header';
        headerDiv.textContent = `${data.username} • ${this.formatTime(data.timestamp)}`;
        
        const contentDiv = document.createElement('div');
        contentDiv.textContent = data.content;
        
        messageDiv.appendChild(headerDiv);
        messageDiv.appendChild(contentDiv);
        
        this.messagesContainer.appendChild(messageDiv);
        this.scrollToBottom();
        
        // 명령어 이펙트 표시
        if (data.effect) {
            this.showEffect(data.effect);
        }
    }
    
    displayAIResponse(data) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ai ${data.isPrivate ? 'private' : ''}`;
        
        const headerDiv = document.createElement('div');
        headerDiv.className = 'message-header';
        headerDiv.innerHTML = `🤖 ${data.username} ${data.isPrivate ? '(개인 메시지)' : ''} • ${this.formatTime(data.timestamp)}`;
        
        const contentDiv = document.createElement('div');
        contentDiv.textContent = data.content;
        
        messageDiv.appendChild(headerDiv);
        messageDiv.appendChild(contentDiv);
        
        this.messagesContainer.appendChild(messageDiv);
        this.scrollToBottom();
        
        // AI 응답 애니메이션
        messageDiv.style.animation = 'slideIn 0.5s ease';
    }
    
    addSystemMessage(text, type = 'info') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message system ${type}`;
        messageDiv.style.background = type === 'error' ? '#ffebee' : '#e8f5e8';
        messageDiv.style.color = type === 'error' ? '#c62828' : '#2e7d32';
        messageDiv.style.textAlign = 'center';
        messageDiv.style.fontStyle = 'italic';
        messageDiv.style.margin = '10px auto';
        messageDiv.style.maxWidth = '60%';
        
        messageDiv.textContent = text;
        
        this.messagesContainer.appendChild(messageDiv);
        this.scrollToBottom();
    }
    
    showWelcomeMessage() {
        setTimeout(() => {
            this.addSystemMessage(`환영합니다, ${this.username}님! 🎉`);
            this.addSystemMessage('특수문자 명령어를 사용해서 AI와 대화해보세요!');
        }, 500);
    }
    
    showEffect(effect) {
        if (!effect || !effect.emoji) return;
        
        const effectOverlay = document.createElement('div');
        effectOverlay.className = 'effect-overlay';
        effectOverlay.textContent = effect.emoji;
        
        document.body.appendChild(effectOverlay);
        
        // 이펙트 제거
        setTimeout(() => {
            document.body.removeChild(effectOverlay);
        }, 2000);
        
        // 사운드 재생 (선택사항)
        if (effect.sound) {
            this.playSound(effect.sound);
        }
    }
    
    playSound(soundFile) {
        try {
            const audio = new Audio(`/media/ai/sounds/${soundFile}`);
            audio.volume = 0.3;
            audio.play().catch(e => {
                console.log('사운드 재생 실패:', e);
            });
        } catch (e) {
            console.log('사운드 파일 없음:', soundFile);
        }
    }
    
    formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
}

// 페이지 로드 후 앱 시작
document.addEventListener('DOMContentLoaded', () => {
    window.aiChatApp = new TWO4AIChatApp();
});
