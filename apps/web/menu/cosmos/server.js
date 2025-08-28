import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.COSMOS_PORT || 3001;
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;

console.log('🌌 Cosmos 암호화폐 대시보드 서버 시작...');
console.log('🔑 API 키 상태:', COINGECKO_API_KEY ? '✅ 설정됨' : '❌ 설정 안됨');
if (!COINGECKO_API_KEY) {
    console.warn('⚠️ COINGECKO_API_KEY가 설정되지 않았습니다. 글로벌 시장 데이터 엔드포인트는 키가 제공될 때까지 안내 메시지를 반환합니다.');
}
// CORS 설정
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? [/\.railway\.app$/, /localhost/]
        : true,
    credentials: true
}));

app.use(express.json());
app.use(express.static(__dirname));

// CoinGecko API 호출 함수
async function callCoinGeckoAPI(endpoint, retries = 2) {
    const url = `https://api.coingecko.com/api/v3${endpoint}`;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`📡 API 호출 (${attempt}/${retries}):`, endpoint);
            
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Cosmos-CryptoDashboard/1.0',
                    ...(COINGECKO_API_KEY && { 'x-cg-demo-api-key': COINGECKO_API_KEY })
                },
                signal: controller.signal
            });
            
            clearTimeout(timeout);

            if (!response.ok) {
                if (response.status === 429) {
                    throw new Error('Rate limit exceeded - 요청 한도 초과');
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log(`✅ API 호출 성공: ${endpoint}`);
            return { success: true, data };

        } catch (error) {
            console.error(`❌ API 호출 실패 (${attempt}/${retries}):`, error.message);
            
            if (attempt === retries) {
                return { 
                    success: false, 
                    error: error.message,
                    statusCode: error.name === 'AbortError' ? 408 : 500
                };
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
}

// 라우트들
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        service: 'Cosmos Crypto Dashboard',
        timestamp: new Date().toISOString(),
        apiKey: COINGECKO_API_KEY ? 'configured' : 'missing'
    });
});

// 전체 시장 데이터
app.get('/api/global', async (req, res) => {
    if (!COINGECKO_API_KEY) {
        console.warn('⚠️ 요청 거부: COINGECKO_API_KEY가 설정되지 않았습니다.');
        return res.status(400).json({
            error: 'COINGECKO_API_KEY가 필요합니다. https://www.coingecko.com/en/api 에서 무료 키를 발급받으세요.'
        });
    }

    const result = await callCoinGeckoAPI('/global');
    
    if (result.success) {
        res.json(result.data);
    } else {
        res.status(result.statusCode || 500).json({ error: result.error });
    }
});

// 트렌딩 코인
app.get('/api/trending', async (req, res) => {
    const result = await callCoinGeckoAPI('/search/trending');
    
    if (result.success) {
        res.json(result.data);
    } else {
        res.status(result.statusCode || 500).json({ error: result.error });
    }
});

// 코인 마켓 데이터
app.get('/api/coins/markets', async (req, res) => {
    const queryParams = new URLSearchParams();
    
    queryParams.set('vs_currency', req.query.vs_currency || 'usd');
    queryParams.set('order', req.query.order || 'market_cap_desc');
    queryParams.set('per_page', Math.min(parseInt(req.query.per_page) || 20, 50));
    queryParams.set('page', Math.max(parseInt(req.query.page) || 1, 1));
    
    if (req.query.sparkline) queryParams.set('sparkline', req.query.sparkline);
    if (req.query.price_change_percentage) queryParams.set('price_change_percentage', req.query.price_change_percentage);
    if (req.query.ids) queryParams.set('ids', req.query.ids);
    
    const result = await callCoinGeckoAPI(`/coins/markets?${queryParams.toString()}`);
    
    if (result.success) {
        res.json(result.data);
    } else {
        res.status(result.statusCode || 500).json({ error: result.error });
    }
});

// 404 핸들링
app.use((req, res) => {
    res.status(404).json({ error: '요청한 리소스를 찾을 수 없습니다.' });
});

// 에러 핸들링
app.use((error, req, res, next) => {
    console.error('서버 에러:', error);
    res.status(500).json({ 
        error: '서버 내부 오류'
    });
});

// Railway에서 서버 시작
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌌 Cosmos 서버 실행 중: Port ${PORT}`);
    console.log(`📡 Health check: /health`);
    console.log(`🎯 Dashboard: /`);
});

process.on('SIGTERM', () => {
    console.log('🛑 Cosmos 서버 종료 신호 받음');
export default app;
});

module.exports = app;
