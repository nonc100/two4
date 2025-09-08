const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

// 기존 라우트들
// const existingRoutes = require('./routes/existing');

// 🆕 AI 채팅 관련 추가
const aiChatRoutes = require('./routes/ai-chat');
const setupAIChatSocket = require('./utils/socket');

const app = express();
const server = http.createServer(app);

// Socket.io 설정
const io = socketIo(server, {
  cors: {
    origin: "*", // 개발 시에만, 배포 시 도메인 지정
    methods: ["GET", "POST"]
  }
});

// 미들웨어
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // 정적 파일 제공
app.use(express.static(path.join(__dirname, '../web'))); // serve web app

// MongoDB 연결 (사용하는 경우)
if (process.env.AI_CHAT_DB_URI) {
  mongoose.connect(process.env.AI_CHAT_DB_URI)
    .then(() => console.log('📚 MongoDB 연결 성공'))
    .catch(err => console.error('❌ MongoDB 연결 실패:', err));
}

// 기존 라우트들
// app.use('/api/existing', existingRoutes);

// 🆕 AI 채팅 라우트 추가
app.use('/api/ai-chat', aiChatRoutes);

// 기본 라우트
app.get('/', (req, res) => {
  res.json({ 
    message: 'TWO4 서버 + AI 채팅이 실행중입니다! 🚀',
    services: ['기존 서비스', 'AI 채팅'],
    version: '1.0.0'
  });
});

// AI 채팅 테스트 페이지
app.get('/ai-chat-test', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>TWO4 AI 채팅 테스트</title>
        <meta charset="utf-8">
    </head>
    <body>
        <h1>🤖 TWO4 AI 채팅 테스트</h1>
        <div id="messages" style="border: 1px solid #ccc; height: 300px; overflow-y: scroll; padding: 10px; margin-bottom: 10px;"></div>
        <input type="text" id="messageInput" placeholder="메시지를 입력하세요... (*, #, ##, @, / 명령어 사용 가능)" style="width: 70%; padding: 10px;">
        <button onclick="sendMessage()" style="padding: 10px;">전송</button>
        <script src="/socket.io/socket.io.js"></script>
        <script>
            const socket = io('/ai-chat');
            const messagesDiv = document.getElementById('messages');
            const messageInput = document.getElementById('messageInput');
            
            const username = 'TestUser' + Math.floor(Math.random() * 1000);
            const roomId = 'test-room';
            
            // 방 참여
            socket.emit('join-room', { roomId, username });
            
            // 메시지 수신
            socket.on('receive-message', (data) => {
                addMessage(data.username + ': ' + data.content, data.effect ? '✨' : '💬');
            });
            
            socket.on('ai-response', (data) => {
                addMessage('🤖 ' + data.username + ': ' + data.content, '🤖');
            });
            
            function addMessage(text, icon) {
                const div = document.createElement('div');
                div.innerHTML = icon + ' ' + text;
                div.style.marginBottom = '5px';
                messagesDiv.appendChild(div);
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }
            
            function sendMessage() {
                const message = messageInput.value.trim();
                if (message) {
                    socket.emit('send-message', {
                        roomId,
                        message,
                        username,
                        userId: 'test-user-id'
                    });
                    messageInput.value = '';
                }
            }
            
            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') sendMessage();
            });
            
            // 연결 상태 표시
            addMessage('채팅방에 연결되었습니다! 명령어를 시도해보세요:', '🎉');
            addMessage('* + 액션 (예: *축하해, *춤춰)', '⭐');
            addMessage('# + 공개질문 (예: #비트코인전망)', '📢');
            addMessage('## + 개인질문 (예: ##포트폴리오분석)', '🔒');
            addMessage('@ + 멘션 (예: @TestUser 안녕하세요)', '🤝');
            addMessage('/ + 커스텀 (예: /이벤트시작)', '⚙️');
        </script>
    </body>
    </html>
  `);
});

// Socket.io 설정
setupAIChatSocket(io);

// 서버 시작
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 TWO4 서버 (with AI Chat) 포트 ${PORT}에서 실행중!`);
  console.log(`📡 Socket.io 서버 준비 완료!`);
  console.log(`🤖 AI 채팅 테스트: http://localhost:${PORT}/ai-chat-test`);
});
