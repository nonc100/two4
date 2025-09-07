const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
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

// ==========================================
// 📁 apps/web/ai-chat.html (새 파일)
// ==========================================
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TWO4 AI 채팅방</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Arial', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        
        .chat-container {
            width: 90%;
            max-width: 800px;
            height: 80vh;
            background: white;
            border-radius: 15px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        
        .chat-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            text-align: center;
        }
        
        .chat-header h1 {
            font-size: 24px;
            margin-bottom: 5px;
        }
        
        .chat-header p {
            opacity: 0.9;
            font-size: 14px;
        }
        
        .messages-container {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
            background-color: #f8f9fa;
        }
        
        .message {
            margin-bottom: 15px;
            padding: 12px 15px;
            border-radius: 10px;
            max-width: 80%;
            position: relative;
            animation: slideIn 0.3s ease;
        }
        
        @keyframes slideIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .message.user {
            background: #667eea;
            color: white;
            margin-left: auto;
            border-bottom-right-radius: 4px;
        }
        
        .message.ai {
            background: #e3f2fd;
            color: #1565c0;
            border-bottom-left-radius: 4px;
        }
        
        .message.command {
            background: linear-gradient(135deg, #ff6b6b, #feca57);
            color: white;
            border-bottom-left-radius: 4px;
        }
        
        .message.private {
            background: #f8d7da;
            border: 2px dashed #dc3545;
            color: #721c24;
        }
        
        .message-header {
            font-size: 12px;
            opacity: 0.7;
            margin-bottom: 5px;
        }
        
        .effect-overlay {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 100px;
            z-index: 1000;
            pointer-events: none;
            animation: effectPop 2s ease-out forwards;
        }
        
        @keyframes effectPop {
            0% { opacity: 0; transform: translate(-50%, -50%) scale(0); }
            50% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
            100% { opacity: 0; transform: translate(-50%, -50%) scale(1); }
        }
        
        .input-container {
            padding: 20px;
            background: white;
            border-top: 1px solid #eee;
            display: flex;
            gap: 10px;
        }
        
        .message-input {
            flex: 1;
            padding: 15px;
            border: 2px solid #e0e0e0;
            border-radius: 25px;
            outline: none;
            font-size: 16px;
            transition: border-color 0.3s;
        }
        
        .message-input:focus {
            border-color: #667eea;
        }
        
        .send-button {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 15px 25px;
            border-radius: 25px;
            cursor: pointer;
            font-size: 16px;
            transition: transform 0.2s;
        }
        
        .send-button:hover {
            transform: scale(1.05);
        }
        
        .command-help {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 10px;
            padding: 15px;
            margin-bottom: 20px;
            font-size: 14px;
        }
        
        .command-help h3 {
            color: #856404;
            margin-bottom: 10px;
        }
        
        .command-list {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 10px;
        }
        
        .command-item {
            background: white;
            padding: 8px 12px;
            border-radius: 5px;
            font-family: monospace;
        }
    </style>
</head>
<body>
    <div class="chat-container">
        <div class="chat-header">
            <h1>🤖 TWO4 AI 채팅방</h1>
            <p>특수문자 명령어로 AI와 스마트하게 소통하세요!</p>
        </div>
        
        <div class="messages-container" id="messagesContainer">
            <div class="command-help">
                <h3>💡 사용 가능한 명령어</h3>
                <div class="command-list">
                    <div class="command-item">⭐ *축하해 - 액션</div>
                    <div class="command-item">📢 #비트코인전망 - 공개질문</div>
                    <div class="command-item">🔒 ##포트폴리오분석 - 개인질문</div>
                    <div class="command-item">🤝 @사용자 메시지 - 멘션</div>
                    <div class="command-item">⚙️ /이벤트시작 - 커스텀</div>
                </div>
            </div>
        </div>
        
        <div class="input-container">
            <input 
                type="text" 
                id="messageInput" 
                class="message-input" 
                placeholder="메시지를 입력하세요... (*, #, ##, @, / 명령어 사용 가능)"
                maxlength="1000"
            >
            <button id="sendButton" class="send-button">전송</button>
        </div>
    </div>
    
    <script src="/socket.io/socket.io.js"></script>
    <script src="scripts/ai/chat.js"></script>
</body>
</html>
