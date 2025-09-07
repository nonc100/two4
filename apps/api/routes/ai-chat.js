const express = require('express');
const ChatRoom = require('../models/ChatRoom');
const ChatMessage = require('../models/ChatMessage');

const router = express.Router();

// 방 목록 조회
router.get('/rooms', async (req, res) => {
  try {
    const { category, search, page = 1, limit = 20 } = req.query;
    
    let filter = { isPrivate: false };
    
    if (category && category !== 'all') {
      filter.category = category;
    }
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const rooms = await ChatRoom.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await ChatRoom.countDocuments(filter);

    res.json({
      success: true,
      rooms: rooms.map(room => ({
        id: room._id,
        name: room.name,
        description: room.description,
        category: room.category,
        owner: room.owner,
        memberCount: room.members.length,
        maxMembers: room.maxMembers,
        createdAt: room.createdAt
      })),
      pagination: {
        current: page,
        total: Math.ceil(total / limit),
        hasNext: page * limit < total
      }
    });
  } catch (error) {
    console.error('방 목록 조회 오류:', error);
    res.status(500).json({ 
      success: false, 
      message: '서버 오류가 발생했습니다.' 
    });
  }
});

// 방 생성
router.post('/rooms', async (req, res) => {
  try {
    const { name, description, category, isPrivate, password, maxMembers, owner } = req.body;

    // 필수 필드 검증
    if (!name || !owner) {
      return res.status(400).json({
        success: false,
        message: '방 이름과 소유자는 필수입니다.'
      });
    }

    const room = new ChatRoom({
      name,
      description,
      category,
      isPrivate,
      password,
      maxMembers,
      owner,
      members: [{
        username: owner,
        role: 'owner'
      }]
    });

    await room.save();

    res.status(201).json({
      success: true,
      message: '방이 성공적으로 생성되었습니다!',
      room: {
        id: room._id,
        name: room.name,
        description: room.description,
        category: room.category
      }
    });
  } catch (error) {
    console.error('방 생성 오류:', error);
    res.status(500).json({ 
      success: false, 
      message: '서버 오류가 발생했습니다.' 
    });
  }
});

// 방 참여
router.post('/rooms/:roomId/join', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { username, password } = req.body;

    if (!username) {
      return res.status(400).json({
        success: false,
        message: '사용자명이 필요합니다.'
      });
    }

    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({ 
        success: false, 
        message: '방을 찾을 수 없습니다.' 
      });
    }

    // 이미 참여한 멤버인지 확인
    const existingMember = room.members.find(
      member => member.username === username
    );
    if (existingMember) {
      return res.status(400).json({ 
        success: false, 
        message: '이미 참여한 방입니다.' 
      });
    }

    // 비밀번호 확인 (비공개 방인 경우)
    if (room.isPrivate && room.password !== password) {
      return res.status(401).json({ 
        success: false, 
        message: '잘못된 비밀번호입니다.' 
      });
    }

    // 최대 인원 확인
    if (room.members.length >= room.maxMembers) {
      return res.status(400).json({ 
        success: false, 
        message: '방이 가득 찼습니다.' 
      });
    }

    // 멤버 추가
    room.members.push({
      username: username,
      role: 'member'
    });
    await room.save();

    res.json({ 
      success: true, 
      message: '방에 성공적으로 참여했습니다!' 
    });
  } catch (error) {
    console.error('방 참여 오류:', error);
    res.status(500).json({ 
      success: false, 
      message: '서버 오류가 발생했습니다.' 
    });
  }
});

// 방 정보 조회
router.get('/rooms/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;

    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({ 
        success: false, 
        message: '방을 찾을 수 없습니다.' 
      });
    }

    res.json({
      success: true,
      room: {
        id: room._id,
        name: room.name,
        description: room.description,
        category: room.category,
        owner: room.owner,
        members: room.members,
        settings: room.settings,
        stats: room.stats,
        isPrivate: room.isPrivate
      }
    });
  } catch (error) {
    console.error('방 정보 조회 오류:', error);
    res.status(500).json({ 
      success: false, 
      message: '서버 오류가 발생했습니다.' 
    });
  }
});

// 채팅 메시지 조회
router.get('/rooms/:roomId/messages', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { page = 1, limit = 50, username } = req.query;

    // 방 존재 여부 확인
    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({ 
        success: false, 
        message: '방을 찾을 수 없습니다.' 
      });
    }

    // 메시지 조회 (개인 메시지는 본인 것만)
    let messageFilter = {
      roomId: roomId,
      $or: [
        { isPrivate: false },
        { isPrivate: true, username: username }
      ]
    };

    const messages = await ChatMessage.find(messageFilter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    res.json({
      success: true,
      messages: messages.reverse().map(msg => ({
        id: msg._id,
        content: msg.content,
        type: msg.type,
        username: msg.username,
        isPrivate: msg.isPrivate,
        effect: msg.effect,
        createdAt: msg.createdAt
      }))
    });
  } catch (error) {
    console.error('메시지 조회 오류:', error);
    res.status(500).json({ 
      success: false, 
      message: '서버 오류가 발생했습니다.' 
    });
  }
});

// 메시지 저장
router.post('/rooms/:roomId/messages', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { content, type, username, userId, commandType, isPrivate, targetUser, effect } = req.body;

    const message = new ChatMessage({
      roomId,
      content,
      username,
      userId,
      type: type || 'text',
      commandType,
      isPrivate: isPrivate || false,
      targetUser,
      effect
    });

    await message.save();

    // 방 통계 업데이트
    await ChatRoom.findByIdAndUpdate(roomId, {
      $inc: { 
        'stats.totalMessages': 1,
        'stats.aiInteractions': type === 'command' ? 1 : 0
      }
    });

    res.status(201).json({
      success: true,
      message: '메시지가 저장되었습니다.',
      messageId: message._id
    });
  } catch (error) {
    console.error('메시지 저장 오류:', error);
    res.status(500).json({ 
      success: false, 
      message: '서버 오류가 발생했습니다.' 
    });
  }
});

module.exports = router;
