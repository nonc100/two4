const aiService = require('../services/ai/aiService');

async function testOpenRouter() {
  console.log('🧪 OpenRouter 연결 테스트 시작...');
  
  // 연결 확인
  const isConnected = await aiService.checkConnection();
  console.log(`🔌 연결 상태: ${isConnected ? '✅ 성공' : '❌ 실패'}`);
  
  if (!isConnected) {
    console.log('💡 API 키와 환경변수를 확인해주세요!');
    return;
  }
  
  // 모델 목록 확인
  const models = await aiService.getAvailableModels();
  console.log(`📋 사용 가능한 모델 수: ${models.length}`);
  
  // 간단한 테스트 요청
  try {
    const testCommand = {
      isCommand: true,
      type: 'action',
      originalMessage: '*테스트',
      aiPrompt: '테스트 메시지입니다. 간단히 인사해주세요.',
      effect: { emoji: '🧪', effect: 'test' }
    };
    
    console.log('🎯 테스트 요청 전송 중...');
    const result = await aiService.processCommand(testCommand);
    
    if (result.success) {
      console.log('✅ 테스트 성공!');
      console.log(`🤖 AI 응답: ${result.response}`);
      console.log(`📊 사용된 토큰: ${result.tokens}`);
      console.log(`🎨 모델: ${result.model}`);
    } else {
      console.log('❌ 테스트 실패:', result.response);
    }
  } catch (error) {
    console.error('🚨 테스트 오류:', error.message);
  }
}

// 스크립트로 실행 시 테스트 자동 실행
if (require.main === module) {
  testOpenRouter();
}

module.exports = testOpenRouter;
