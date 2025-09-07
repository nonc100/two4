class CommandHelper {
    constructor() {
        this.commands = {
            action: {
                prefix: '*',
                description: '감정/액션 표현',
                examples: ['*축하해', '*춤춰', '*위로해줘', '*응원', '*놀람'],
                color: '#ff6b6b'
            },
            public: {
                prefix: '#',
                description: '공개 AI 질문',
                examples: ['#비트코인전망', '#오늘날씨', '#주식추천', '#뉴스요약'],
                color: '#4ecdc4'
            },
            private: {
                prefix: '##',
                description: '개인 전용 AI 질문',
                examples: ['##내포트폴리오분석', '##매매타이밍', '##투자상담'],
                color: '#45b7d1'
            },
            mention: {
                prefix: '@',
                description: '사용자 멘션',
                examples: ['@철수님 안녕하세요', '@영희님 추천'],
                color: '#96ceb4'
            },
            custom: {
                prefix: '/',
                description: '방장 커스텀 명령어',
                examples: ['/이벤트시작', '/퀴즈타임', '/급등주알림'],
                color: '#ffeaa7'
            }
        };
    }
    
    // 명령어 자동완성 제안
    getSuggestions(input) {
        const suggestions = [];
        
        for (const [type, command] of Object.entries(this.commands)) {
            if (input.startsWith(command.prefix)) {
                suggestions.push(...command.examples.filter(example => 
                    example.toLowerCase().includes(input.toLowerCase())
                ));
            }
        }
        
        return suggestions;
    }
    
    // 명령어 도움말 생성
    generateHelpHTML() {
        let html = '<div class="command-help-detail">';
        
        for (const [type, command] of Object.entries(this.commands)) {
            html += `
                <div class="command-section" style="border-left: 4px solid ${command.color}; padding-left: 15px; margin-bottom: 20px;">
                    <h4 style="color: ${command.color}; margin-bottom: 10px;">
                        ${command.prefix} ${command.description}
                    </h4>
                    <div class="command-examples">
                        ${command.examples.map(example => `
                            <span class="command-example" style="background: ${command.color}20; color: ${command.color}; padding: 4px 8px; border-radius: 12px; margin-right: 8px; font-family: monospace; font-size: 12px;">
                                ${example}
                            </span>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        html += '</div>';
        return html;
    }
    
    // 명령어 타입 감지
    detectCommandType(message) {
        const trimmed = message.trim();
        
        for (const [type, command] of Object.entries(this.commands)) {
            if (trimmed.startsWith(command.prefix)) {
                return {
                    type: type,
                    prefix: command.prefix,
                    content: trimmed.substring(command.prefix.length).trim(),
                    color: command.color
                };
            }
        }
        
        return null;
    }
    
    // 명령어 유효성 검사
    validateCommand(message) {
        const commandInfo = this.detectCommandType(message);
        
        if (!commandInfo) {
            return { isValid: true,
