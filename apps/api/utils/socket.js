const commandParser = require('../services/ai/commandParser');
const aiService = require('../services/ai/aiService');
const ChatMessage = require('../models/ChatMessage');

const setupAIChatSocket = (io) => {
  // AI 채팅 네임스페이스 생성
  const aiChatNamespace = io.of('/ai-chat');
  
  aiChatNamespace.on('connection', (socket) => {
    console.log(`👤 AI 채팅 사용자 연결: ${socket.id}`);

    // 방 참여
    socket.on('join-room', (data) => {
      const { roomId, username } = data;
      socket.join(roomId);
      socket.username = username;
      socket.roomId = roomId;
      
      console.log(`🏠 ${username}이 방 ${roomId}에 입장`);
      socket.to(roomId).emit('user-joined', { username, socketId: socket.id });
    });

    // 메시지 처리
    socket.on('send-message', async (data) => {
      try {
        const { roomId, message, userId, username } = data;
        
        // 특수문자 명령어 체크
        const commandResult = commandParser.parseCommand(message, {
          userId,
          username,
          roomId
        });

        if (commandResult.isCommand) {
          // 명령어 메시지 먼저 전송
          const commandMessage = {
            id: Date.now(),
            userId,
            username,
            content: commandResult.originalMessage,
            timestamp: new Date(),
            isCommand: true,
            commandType: commandResult.type,
            effect: commandResult.effect
          };

          // 메시지 DB 저장
          const savedMessage = new ChatMessage({
            roomId,
            content: message,
            username,
            userId,
            type: 'command',
            commandType: commandResult.type,
            effect: commandResult.effect
          });
          await savedMessage.save();

          // 방에 메시지 전송
          aiChatNamespace.to(roomId).emit('receive-message', commandMessage);

          // AI 응답 생성
          const aiResponse = await aiService.processCommand(commandResult);
          
          // AI 응답 전송 (타입에 따라 공개/비공개)
          if (commandResult.type === 'private') {
            // ## 개인 전용 - 본인에게만
            socket.emit('ai-response', {
