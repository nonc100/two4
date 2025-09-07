const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true
  },
  username: {
    type: String,
    required: true
  },
  userId: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true,
    maxlength: 1000
  },
  type: {
    type: String,
    enum: ['text', 'command', 'ai-response', 'system'],
    default: 'text'
  },
  commandType: {
    type: String,
    enum: ['action', 'public', 'private', 'mention', 'custom']
  },
  isPrivate: {
    type: Boolean,
    default: false
  },
  targetUser: String,
  effect: {
    emoji: String,
    effectName: String,
    sound: String
  },
  aiModel: String,
  tokens: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// 인덱스 설정
chatMessageSchema.index({ roomId: 1, createdAt: -1 });
chatMessageSchema.index({ username: 1, createdAt: -1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
