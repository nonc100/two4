const OpenAI = require('openai');

class AIService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    this.personalities = {
      professional: "당신은 전문적이고 정확한 금융 투자 전문가입니다.",
      friendly: "당신은 친근하고 재미있는 AI 어시스턴트입니다.",
      mentor: "당신은 따뜻하고 격려하는 멘토입니다.",
      strict: "당신은 직설적이고 명확한 조언을 하는 AI입니다."
    };
  }

  // 명령어 처리 및 AI 응답 생성
  async processCommand(commandResult) {
    try {
      if (!commandResult.isCommand) {
        throw new Error('유효하지 않은 명령어입니다.');
      }

      const response = await this.generateResponse(commandResult);
      
      return {
        success: true,
        response: response,
        effect: commandResult.effect,
        tokens: this.estimateTokens(commandResult.aiPrompt + response)
      };
    } catch (error) {
      console.error('AI 처리 오류:', error);
      return {
        success: false,
        response: this.getErrorResponse(commandResult.type),
        effect: { emoji: '❌', effect: 'error' },
        tokens: 0
      };
    }
  }

  // AI 응답 생성
  async generateResponse(commandResult) {
    const systemPrompt = this.getSystemPrompt(commandResult);
    
    const completion = await this.openai.chat.completions.create({
      model: "gpt-3.5-turbo",
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
      temperature: this.getTemperature(commandResult.type)
    });

    return completion.choices[0].message.content;
  }

  getSystemPrompt(commandResult) {
    return "당신은 TWO4 AI 채팅방의 전문 어시스턴트입니다. " + this.personalities.friendly;
  }

  getMaxTokens(type) {
    const tokenLimits = {
      action: 100,
      private: 500,
      public: 400,
      mention: 200,
      custom: 300
    };
    return tokenLimits[type] || 200;
  }

  getTemperature(type) {
    const temperatures = {
      action: 0.9,
      private: 0.7,
      public: 0.5,
      mention: 0.8,
      custom: 0.8
    };
    return temperatures[type] || 0.7;
  }

  estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }

  getErrorResponse(type) {
    const errorResponses = {
      action: "죄송해요! 지금은 그 액션을 처리할 수 없어요 😅",
      private: "개인 질문 처리 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.",
      public: "질문 처리 중 문제가 발생했어요. 다시 한번 질문해주세요!",
      mention: "메시지 전달 중 오류가 발생했어요.",
      custom: "커스텀 명령어 실행 중 오류가 발생했어요."
    };
    return errorResponses[type] || "처리 중 오류가 발생했어요.";
  }
}

module.exports = new AIService();
