const mongoose = require('mongoose');

const chatRoomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  description: {
    type: String,
    maxlength: 200
  },
  owner: {
    type: String,  // 또는 기존 User 모델 참조
    required: true
  },
  category: {
    type: String,
    enum: ['crypto', 'stock', 'futures', 'forex', 'general'],
    default: 'general'
  },
  isPrivate: {
    type: Boolean,
    default: false
  },
  password: String,
  maxMembers: {
    type: Number,
    default: 100,
    min: 5,
    max: 1000
  },
  members: [{
    username: String,
    role: {
      type: String,
      enum: ['owner', 'admin', 'vip', 'member'],
      default: 'member'
    },
    tier: {
      type: String,
      enum: ['basic', 'vip', 'premium'],
      default: 'basic'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  settings: {
    aiPersonality: {
      type: String,
      enum: ['professional', 'friendly', 'mentor', 'strict'],
      default: 'friendly'
    },
    aiModel: {
      type: String,
      enum: ['gpt-3.5-turbo', 'gpt-4'],
      default: 'gpt-3.5-turbo'
    },
    customCommands: [{
      trigger: String,
      response: String,
      isActive: { type: Boolean, default: true }
    }],
    allowPrivateCommands: {
      type: Boolean,
      default: true
    }
  },
  stats: {
    totalMessages: { type: Number, default: 0 },
    aiInteractions: { type: Number, default: 0 },
    activeUsers: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ChatRoom', chatRoomSchema);
