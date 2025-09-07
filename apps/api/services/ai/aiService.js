class AIService {
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY;
    this.baseURL = 'https://openrouter.ai/api/v1';
    this.appName = process.env.OPENROUTER_APP_NAME || 'TWO4-AI-Chat';
    this.siteURL = process.env.OPENROUTER_SITE_URL || 'http://localhost:5000';

        // 사용 가능한 모델들 (OpenRouter 기준)
    this.models = {
      'gpt-3.5-turbo': 'openai/gpt-3.5-turbo',
      'gpt-4': 'openai/gpt-4',
      'claude-3-haiku': 'anthropic/claude-3-haiku',
      'claude-3-sonnet': 'anthropic/claude-3-sonnet', 
      'gemini-pro': 'google/gemini-pro',
      'llama-2': 'meta-llama/llama-2-70b-chat'
    };
    
    // AI 성격별 시스템 프롬프트
    this.personalities = {
      professional: "당신은 전문적이고 정확한 금융 투자 전문가입니다. 냉정하고 객관적인 분석을 제공합니다.",
      friendly: "당신은 친근하고 재미있는 AI 어시스턴트입니다. 사용자와 편안하게 대화하며 도움을 줍니다.",
      mentor: "당신은 따뜻하고 격려하는 멘토입니다. 사용자를 응원하고 동기부여를 제공합니다.",
      strict: "당신은 직설적이고 명확한 조언을 하는 AI입니다. 불필요한 말은 하지 않고 핵심만 전달합니다."
    };
  
    console.log('🤖 OpenRouter AI 서비스 초기화 완료');
}
  
  // 명령어 처리 및 AI 응답 생성
  async processCommand(commandResult) {
    try {
      if (!commandResult.isCommand) {
        throw new Error('유효하지 않은 명령어입니다.');
      }

            console.log(`🎯 AI 명령어 처리: ${commandResult.type} - ${commandResult.originalMessage}`);
      
      const response = await this.generateResponse(commandResult);
      
      return {
        success: true,
        response: response,
        effect: commandResult.effect,
        tokens: this.estimateTokens(commandResult.aiPrompt + response),
        model: this.getModelForCommand(commandResult.type)
      };
    } catch (error) {
     console.error('❌ AI 처리 오류:', error);
      return {
        success: false,
        response: this.getErrorResponse(commandResult.type),
        effect: { emoji: '❌', effect: 'error' },
        tokens: 0
      };
    }
  }

  // OpenRouter API로 AI 응답 생성
  async generateResponse(commandResult) {
    const systemPrompt = this.getSystemPrompt(commandResult);
    const model = this.getModelForCommand(commandResult.type);
    
    const requestBody = {
      model: model,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
            role: "user", 
          content: commandResult.aiPrompt
        }
      ],
      max_tokens: this.getMaxTokens(commandResult.type),
            temperature: this.getTemperature(commandResult.type),
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0
    };

    console.log(`📡 OpenRouter API 호출: ${model}`);

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': this.siteURL,
        'X-Title': this.appName
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`OpenRouter API 오류: ${response.status} - ${errorData.error?.message || '알 수 없는 오류'}`);
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('API 응답 형식이 올바르지 않습니다.');
    }

    return data.choices[0].message.content;   
  }

   // 명령어 타입별 적합한 모델 선택
  getModelForCommand(type) {
    const modelSelection = {
      action: this.models['gpt-3.5-turbo'],      // 빠른 응답이 필요
      private: this.models['claude-3-sonnet'],   // 정확한 분석 필요  
      public: this.models['gpt-4'],              // 고품질 공개 답변
      mention: this.models['gpt-3.5-turbo'],     // 빠른 소셜 응답
      custom: this.models['claude-3-haiku']      // 커스텀 기능
    };
    
    return modelSelection[type] || this.models['gpt-3.5-turbo'];
  }

  // 시스템 프롬프트 생성
  getSystemPrompt(commandResult) {
    const basePrompt = "당신은 TWO4 AI 채팅방의 전문 어시스턴트입니다.";
    const personalityPrompt = this.personalities.friendly; // 기본값, 나중에 방 설정에서 가져오기
    
    let specificPrompt = "";
    
    switch (commandResult.type) {
      case 'action':
        specificPrompt = "사용자의 감정 표현에 맞는 재미있고 생동감 있는 반응을 보여주세요. 이모티콘과 함께 짧고 임팩트 있게 답변하세요. 한국어로 자연스럽게 대답해주세요.";
        break;
      case 'private':
        specificPrompt = "개인적이고 맞춤화된 조언을 제공하세요. 구체적이고 실용적인 정보를 포함해주세요. 투자나 재정 관련 질문이라면 전문적인 분석을 제공하되, 투자 결정은 본인 책임임을 언급해주세요.";
        break;
      case 'public':
        specificPrompt = "커뮤니티 전체에게 유익한 정보를 제공하세요. 전문적이고 정확한 분석을 포함해주세요. 암호화폐, 주식 등 금융 관련 질문이라면 최신 트렌드와 객관적 분석을 제공해주세요.";
        break;
      case 'mention':
        specificPrompt = "사용자 간 연결을 도와주는 따뜻하고 친근한 메시지를 작성하세요. 커뮤니티 분위기를 좋게 만드는 중재자 역할을 해주세요.";
        break;
      case 'custom':
        specificPrompt = "방장이 설정한 특별한 기능에 맞는 창의적인 응답을 제공하세요. 이벤트나 특별 기능이라면 흥미롭고 참여를 유도하는 방식으로 답변해주세요.";
        break;
    }
    
    return `${basePrompt} ${personalityPrompt} ${specificPrompt}`;
  }

  // 명령어 타입별 최대 토큰 수
  getMaxTokens(type) {
    const tokenLimits = {
      action: 150,      // 짧고 임팩트 있는 응답
      private: 800,     // 상세한 개인 분석
      public: 600,      // 정보성 공개 답변
      mention: 250,     // 적당한 소셜 메시지
      custom: 400       // 유연한 커스텀 응답
    };
    return tokenLimits[type] || 300;
  }

    // 명령어 타입별 창의성 정도
  getTemperature(type) {
    const temperatures = {
      action: 0.9,      // 높은 창의성 (재미있는 반응)
      private: 0.6,     // 중간 창의성 (정확성과 개성 균형)
      public: 0.4,      // 낮은 창의성 (정확성 중시)
      mention: 0.8,     // 높은 창의성 (친근한 소통)
      custom: 0.7       // 중상 창의성 (유연한 대응)
    };
    return temperatures[type] || 0.7;
  }

    // 토큰 수 추정
  estimateTokens(text) {
      // 한국어 기준 대략적인 토큰 계산
    return Math.ceil(text.length / 3);
  }

    // 오류 시 기본 응답
  getErrorResponse(type) {
    const errorResponses = {
      action: "아, 지금은 그 기분을 표현하기 어려워요! 😅 다시 한번 시도해주세요~",
      private: "개인 상담 처리 중 문제가 발생했어요. 잠시 후 다시 질문해주시면 더 좋은 답변을 드릴게요! 🔒",
      public: "질문을 처리하는 중에 오류가 발생했어요. 다시 한번 질문해주시면 정확한 정보를 제공해드리겠습니다! 📢",
      mention: "메시지 전달 중 문제가 생겼어요. 다시 시도해주세요! 🤝",
      custom: "특별 기능 실행 중 오류가 발생했어요. 잠시 후 다시 시도해주세요! ⚙️"
    };
    return errorResponses[type] || "처리 중 일시적인 문제가 발생했어요. 다시 시도해주세요! 🙏";
  }

  // API 연결 상태 확인
  async checkConnection() {
    try {
      const response = await fetch(`${this.baseURL}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': this.siteURL,
          'X-Title': this.appName
        }
      });
      
      return response.ok;
    } catch (error) {
      console.error('🔌 OpenRouter 연결 확인 실패:', error);
      return false;
    }
  }

  // 사용 가능한 모델 목록 조회
  async getAvailableModels() {
    try {
      const response = await fetch(`${this.baseURL}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': this.siteURL,
          'X-Title': this.appName
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.data || [];
      }
      
      return [];
    } catch (error) {
      console.error('📋 모델 목록 조회 실패:', error);
      return [];
    }
  }
}

module.exports = new AIService();
