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
              id: Date.now() + 1,
              userId: 'AI',
              username: 'TWO4 AI',
              content: aiResponse.response,
              timestamp: new Date(),
              isAI: true,
              isPrivate: true,
              effect: aiResponse.effect
            });

            // 개인 메시지도 DB에 저장
            const aiMessage = new ChatMessage({
              roomId,
              content: aiResponse.response,
              username: 'TWO4 AI',
              userId: 'AI',
              type: 'ai-response',
              isPrivate: true,
              targetUser: username,
              effect: aiResponse.effect,
              tokens: aiResponse.tokens
            });
            await aiMessage.save();
          } else {
            // 다른 명령어들 - 전체 공개
            const publicAiMessage = {
              id: Date.now() + 1,
              userId: 'AI',
              username: 'TWO4 AI',
              content: aiResponse.response,
              timestamp: new Date(),
              isAI: true,
              effect: aiResponse.effect
            };

            aiChatNamespace.to(roomId).emit('ai-response', publicAiMessage);

            // 공개 AI 응답 DB 저장
            const aiMessage = new ChatMessage({
              roomId,
              content: aiResponse.response,
              username: 'TWO4 AI',
              userId: 'AI',
              type: 'ai-response',
              isPrivate: false,
              effect: aiResponse.effect,
              tokens: aiResponse.tokens
            });
            await aiMessage.save();
          }
        } else {
          // 일반 메시지
          const normalMessage = {
            id: Date.now(),
            userId,
            username,
            content: message,
            timestamp: new Date()
          };

          // 일반 메시지 DB 저장
          const savedMessage = new ChatMessage({
            roomId,
            content: message,
            username,
            userId,
            type: 'text'
          });
          await savedMessage.save();

          aiChatNamespace.to(roomId).emit('receive-message', normalMessage);
        }
      } catch (error) {
        console.error('❌ 메시지 처리 오류:', error);
        socket.emit('error', { message: '메시지 처리 중 오류가 발생했습니다.' });
      }
    });

    // 타이핑 상태
    socket.on('typing', (data) => {
      socket.to(data.roomId).emit('user-typing', {
        username: socket.username,
        isTyping: data.isTyping
      });
    });

    // 연결 해제
    socket.on('disconnect', () => {
      console.log(`👋 AI 채팅 사용자 연결 해제: ${socket.id}`);
      if (socket.roomId && socket.username) {
        socket.to(socket.roomId).emit('user-left', { 
          username: socket.username,
          socketId: socket.id 
        });
      }
    });
  });

  return aiChatNamespace;
};

module.exports = setupAIChatSocket;
