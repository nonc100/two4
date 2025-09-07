class CommandParser {
  constructor() {
    // 액션 명령어와 대응하는 이펙트 정의
    this.actionEffects = {
      '축하해': { emoji: '🎉🎊', effect: 'celebration', sound: 'celebration.mp3' },
      '놀람': { emoji: '😱⚡', effect: 'shock', sound: 'shock.mp3' },
      '춤춰': { emoji: '💃🕺', effect: 'dance', sound: 'music.mp3' },
      '위로해줘': { emoji: '🤗💙', effect: 'comfort', sound: 'healing.mp3' },
      '응원': { emoji: '📣💪', effect: 'cheer', sound: 'cheer.mp3' },
      '박수': { emoji: '👏👏', effect: 'applause', sound: 'applause.mp3' },
      '사랑': { emoji: '❤️💕', effect: 'love', sound: 'heart.mp3' },
      '화남': { emoji: '😡💢', effect: 'angry', sound: 'angry.mp3' },
      '웃어': { emoji: '😄😆', effect: 'laugh', sound: 'laugh.mp3' },
      '울어': { emoji: '😢💧', effect: 'cry', sound: 'cry.mp3' }
    };
  }

  // 메시지가 명령어인지 확인하고 파싱
  parseCommand(message, context) {
    const trimmedMessage = message.trim();
    
    // * 액션 모드
    if (trimmedMessage.startsWith('*')) {
      return this.parseActionCommand(trimmedMessage, context);
    }
    
    // ## 프라이빗 모드
    if (trimmedMessage.startsWith('##')) {
      return this.parsePrivateCommand(trimmedMessage, context);
    }
    
    // # 오픈톡 모드
    if (trimmedMessage.startsWith('#')) {
      return this.parsePublicCommand(trimmedMessage, context);
    }
    
    // @ 커넥트 모드
    if (trimmedMessage.startsWith('@')) {
      return this.parseMentionCommand(trimmedMessage, context);
    }
    
    // / 마이웨이 모드 (커스텀 명령어)
    if (trimmedMessage.startsWith('/')) {
      return this.parseCustomCommand(trimmedMessage, context);
    }
    
    // 일반 메시지
    return {
      isCommand: false,
      originalMessage: message,
      type: 'text'
    };
  }

  // * 액션 명령어 파싱
  parseActionCommand(message, context) {
    const action = message.substring(1).trim();
    const effect = this.actionEffects[action];
    
    return {
      isCommand: true,
      type: 'action',
      originalMessage: message,
      action: action,
      effect: effect || { emoji: '✨', effect: 'default', sound: 'default.mp3' },
      context,
      aiPrompt: `사용자가 "${action}" 액션을 요청했습니다. 이에 맞는 감정적이고 재미있는 반응을 보여주세요.`
    };
  }

  // ## 프라이빗 명령어 파싱
  parsePrivateCommand(message, context) {
    const query = message.substring(2).trim();
    
    return {
      isCommand: true,
      type: 'private',
      originalMessage: message,
      query: query,
      effect: { emoji: '🔒', effect: 'private', sound: 'private.mp3' },
      context,
      aiPrompt: `개인 전용 질문: "${query}". 사용자 ${context.username}님만을 위한 상세하고 개인적인 답변을 제공해주세요.`
    };
  }

  // # 오픈톡 명령어 파싱
  parsePublicCommand(message, context) {
    const query = message.substring(1).trim();
    
    return {
      isCommand: true,
      type: 'public',
      originalMessage: message,
      query: query,
      effect: { emoji: '📢', effect: 'public', sound: 'public.mp3' },
      context,
      aiPrompt: `공개 질문: "${query}". 커뮤니티 전체가 볼 수 있는 유익하고 전문적인 답변을 제공해주세요.`
    };
  }

  // @ 멘션 명령어 파싱
  parseMentionCommand(message, context) {
    const content = message.substring(1).trim();
    const parts = content.split(' ');
    const targetUser = parts[0];
    const mentionContent = parts.slice(1).join(' ');
    
    return {
      isCommand: true,
      type: 'mention',
      originalMessage: message,
      targetUser: targetUser,
      content: mentionContent,
      effect: { emoji: '🤝', effect: 'mention', sound: 'mention.mp3' },
      context,
      aiPrompt: `사용자 ${context.username}님이 ${targetUser}님에게 "${mentionContent}"라는 내용으로 AI 연결을 요청했습니다.`
    };
  }

  // / 커스텀 명령어 파싱
  parseCustomCommand(message, context) {
    const command = message.substring(1).trim();
    
    return {
      isCommand: true,
      type: 'custom',
      originalMessage: message,
      command: command,
      effect: { emoji: '⚙️', effect: 'custom', sound: 'custom.mp3' },
      context,
      aiPrompt: `방장이 설정한 커스텀 명령어 "${command}"가 실행되었습니다.`
    };
  }
}

module.exports = new CommandParser();
