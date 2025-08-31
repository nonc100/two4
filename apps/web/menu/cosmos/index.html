<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>TWO4 COSMOS</title>
<style>
  :root{
    --bg:#0b1018; --panel:#111827; --text:#e8eefc; --muted:#9aa3b6;
    --up:#22c55e; --down:#ef4444;
    --toolbar-h: 44px;            /* 상단 컨트롤러 높이(헤더 sticky 보정) */
    --starVis: .7;                /* 별 밝기(0~1) */
  }
  *{box-sizing:border-box}
  html,body{
    margin:0;padding:0;color:var(--text);
    font:14px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic";
    background:radial-gradient(1200px 600px at 50% 0%, #182036 0%, var(--bg) 60%);
    overflow-x:hidden;
  }
  a{color:inherit;text-decoration:none}       /* 밑줄/보라색 제거 */
  a:visited{color:inherit}

  /* ⭐ 별 배경 */
  .sky{position:fixed; inset:0; pointer-events:none; z-index:0;}
  .stars,.stars2,.stars3{
    position:absolute; inset:0; background-repeat:repeat; background-size:1600px 1600px;
    animation:twinkle 18s linear infinite; filter:blur(.2px)
  }
  .stars{opacity:calc(.55 * var(--starVis));
    background-image:
      radial-gradient(1px 1px at 20px 30px,#fff8 50%,transparent 51%),
      radial-gradient(1px 1px at 120px 80px,#fff8 50%,transparent 51%),
      radial-gradient(1px 1px at 300px 120px,#fff8 50%,transparent 51%)}
  .stars2{opacity:calc(.35 * var(--starVis)); animation-duration:26s;
    background-image:
      radial-gradient(1px 1px at 40px 60px,#fff6 50%,transparent 51%),
      radial-gradient(1px 1px at 220px 140px,#fff6 50%,transparent 51%),
      radial-gradient(1px 1px at 460px 240px,#fff6 50%,transparent 51%)}
  .stars3{opacity:calc(.25 * var(--starVis)); animation-duration:34s;
    background-image:
      radial-gradient(1px 1px at 70px 20px,#fff5 50%,transparent 51%),
      radial-gradient(1px 1px at 260px 220px,#fff5 50%,transparent 51%),
      radial-gradient(1px 1px at 520px 420px,#fff5 50%,transparent 51%)}
  @keyframes twinkle{from{background-position:0 0} to{background-position:-1600px -1600px}}

  .wrap{position:relative; z-index:1; max-width:1220px; margin:0 auto; padding:0 16px 80px;}

  /* 상단 로고/컨트롤러 */
  .brand{display:flex; align-items:center; gap:14px; margin:14px 0 12px;}
  .brand img{width:168px; height:auto; object-fit:contain;}
  .brand h1{display:none} /* 요청: COSMOS 텍스트 삭제 */

  .star-ctl{
    position:fixed; top:8px; left:50%; transform:translateX(-50%);
    z-index:10; height:var(--toolbar-h); display:flex; align-items:center;
    padding:0 10px; border-radius:999px;
    background:linear-gradient(180deg, rgba(255,255,255,.16), rgba(255,255,255,.06));
    border:1px solid rgba(255,255,255,.2);
    backdrop-filter: blur(10px);
  }
  .star-ctl input[type="range"]{width:120px; height:6px; background:transparent}
  .star-ctl input[type="range"]::-webkit-slider-thumb{appearance:none; width:14px; height:14px; border-radius:50%; background:#a78bfa; border:1px solid #fff9}
  .star-ctl input[type="range"]::-webkit-slider-runnable-track{height:6px; border-radius:999px; background:linear-gradient(90deg,#a78bfa,#22d3ee)}

  /* 3D 허브 / 도넛 (기존 스타일 유지; 핵심만) */
  .hub-wrap{display:grid;grid-template-columns:minmax(320px,520px) 1fr;gap:16px;align-items:center;margin:6px 0 16px}
  .hub3d{position:relative;width:100%;max-width:520px;border-radius:50%;aspect-ratio:1/1;box-shadow:inset 0 10px 26px rgba(180,200,255,.20), inset 0 -16px 46px rgba(0,0,0,.50), 0 18px 48px rgba(0,0,0,.38), 0 0 40px rgba(56,189,248,.20), 0 0 80px rgba(124,58,237,.16); border:1px solid rgba(255,255,255,.10);}
  .hub3d svg{position:absolute;inset:0}
  .hub-center{position:absolute; inset:50% auto auto 50%; transform:translate(-50%,-50%); width:36%; height:36%; border-radius:50%; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; background:radial-gradient(100% 100% at 35% 30%, rgba(34,211,238,.18), rgba(99,102,241,.12) 60%, rgba(0,0,0,0) 80%); border:1px solid rgba(255,255,255,.14);}
  .hub-center .val{font-size:clamp(20px,3.2vw,28px);font-weight:900;line-height:1.1;margin:0}
  .hub-center .lbl{font-size:12px;color:#9aa3b6;margin:4px 0 0}
  .hub-badge{font-weight:900;font-size:clamp(14px,1.6vw,18px);fill:url(#mintWhiteGrad);filter:url(#textGlow);pointer-events:none;}
  .hub-seg{cursor:pointer;stroke:rgba(255,255,255,.12);stroke-width:1.2;transition:transform .18s ease,filter .18s ease}
  .hub-seg:hover{transform:scale(1.025);filter:drop-shadow(0 0 14px rgba(124,58,237,.7))}
  .hub-panel{position:relative; min-height:220px; border-radius:16px; padding:14px; background:linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.03)); border:1px solid rgba(255,255,255,.10);}
  .hub-panel.hidden{display:none}

  @media (max-width:767px){.hub-wrap{grid-template-columns:1fr}.hub3d{max-width:360px;margin:0 auto}}

  /* 검색/정렬 컨트롤 (심플) */
  .controls{display:flex; gap:10px; align-items:center; margin:10px 0}
  .controls .search{flex:1}
  input[type="text"], select, button{background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12); color:var(--text); border-radius:10px; padding:9px 12px; outline:none}
  button.sortdir{min-width:40px}

  /* 테이블 */
  .table-wrap{overflow-x:auto}
  table.cosmos-table{width:1200px; border-collapse:separate; border-spacing:0 10px;}
  thead th{
    position:sticky; top:calc(var(--toolbar-h) + 10px); z-index:2;
    background:rgba(17,24,39,.88); backdrop-filter:blur(6px);
    font-size:12px; color:var(--muted); font-weight:700; text-align:left; padding:8px 10px;
  }
  thead th.sortable{cursor:pointer}
  tbody td{background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08); padding:12px 10px; vertical-align:middle}
  tbody tr td:first-child{border-radius:12px 0 0 12px}
  tbody tr td:last-child{border-radius:0 12px 12px 0}
  .text-right{text-align:right}

  /* 코인 칼럼(티커) */
  .coin-cell{display:flex; align-items:center; gap:10px; min-width:220px; position:sticky; left:46px; background:rgba(17,24,39,.88); backdrop-filter:blur(6px); z-index:1; cursor:pointer;}
  .coin-img{width:22px; height:22px; min-width:22px; border-radius:50%; object-fit:contain}
  .row-index{width:46px; text-align:right; opacity:.7; font-weight:700; position:sticky; left:0; background:rgba(17,24,39,.88); backdrop-filter:blur(6px); z-index:1}

  /* 모바일: 티커만 보이게 */
  @media (max-width:767px){
    thead th{ top:calc(var(--toolbar-h) + 6px); }   /* 겹침 보정 */

    .cosmos-table thead th:nth-child(1),
    .cosmos-table thead th:nth-child(3),
    .cosmos-table thead th:nth-child(4),
    .cosmos-table thead th:nth-child(5),
    .cosmos-table thead th:nth-child(6),
    .cosmos-table thead th:nth-child(7),
    .cosmos-table thead th:nth-child(8),
    .cosmos-table thead th:nth-child(9),
    .cosmos-table tbody td:nth-child(1),
    .cosmos-table tbody td:nth-child(3),
    .cosmos-table tbody td:nth-child(4),
    .cosmos-table tbody td:nth-child(5),
    .cosmos-table tbody td:nth-child(6),
    .cosmos-table tbody td:nth-child(7),
    .cosmos-table tbody td:nth-child(8),
    .cosmos-table tbody td:nth-child(9){
      display:none !important;
    }
    .cosmos-table tbody td:nth-child(2){
      display:block; width:100%; border-radius:12px;
    }
    .coin-cell{position:static; left:auto; min-width:0; gap:10px;}
    .row-index{display:none}
    table.cosmos-table{width:100%}
  }

  footer{margin:22px auto 0; max-width:1220px; color:#9aa3b6; opacity:.8; font-size:12px; text-align:center}
</style>
</head>
<body>
  <!-- ⭐ 별 배경 -->
  <div class="sky"><div class="stars"></div><div class="stars2"></div><div class="stars3"></div></div>

  <!-- ⭐ 상단(간결 컨트롤러) -->
  <div class="star-ctl" aria-label="Star background controller">
    <input id="starRange" type="range" min="0" max="100" value="70" />
  </div>

  <div class="wrap">
    <!-- 로고 -->
    <div class="brand">
      <img src="/media/logo.png" alt="TWO4">
      <h1>COSMOS</h1> <!-- 숨김 처리됨 -->
    </div>

    <!-- 3D 허브 (요약) -->
    <section class="hub-wrap">
      <div class="hub3d">
        <svg id="hubSvg" viewBox="0 0 1000 1000" role="img" aria-label="Cosmos overview hub">
          <defs>
            <linearGradient id="mintWhiteGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#dffff9"/>
              <stop offset="100%" stop-color="#7efcf3"/>
            </linearGradient>
            <filter id="textGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
        </svg>
        <div class="hub-center">
          <div class="val" id="hubVal">—</div>
          <div class="lbl" id="hubLbl">COSMOS</div>
        </div>
      </div>
      <aside class="hub-panel hidden" id="hubPanel">
        <h4 id="hubTitle" style="margin:2px 0 10px;color:#9aa3b6;letter-spacing:.06em;font-size:13px">—</h4>
        <div id="hubContent"></div>
      </aside>
    </section>

    <!-- 검색/정렬 -->
    <div class="controls">
      <input class="search" type="text" id="search" placeholder="코인 검색 (이름/심볼)">
      <label>정렬:
        <select id="sortkey">
          <option value="market_cap">시가총액</option>
          <option value="price">가격</option>
          <option value="volume">거래량</option>
          <option value="change1h">1시간</option>
          <option value="change24h">24시간</option>
          <option value="change7d">7일</option>
          <option value="rank">순위</option>
          <option value="symbol">티커</option>
        </select>
      </label>
      <button id="sortdir" class="sortdir" title="정렬 방향">▼</button>
      <label>페이지:
        <select id="page"></select>
      </label>
    </div>

    <!-- 마켓 테이블 -->
    <div class="table-wrap">
      <table class="cosmos-table" id="mkt">
        <colgroup>
          <col><col><col><col><col><col><col><col><col>
        </colgroup>
        <thead>
          <tr>
            <th class="sortable" data-key="rank">순위</th>
            <th class="sortable" data-key="symbol">코인</th>
            <th class="text-right sortable" data-key="price">시세</th>
            <th class="text-right sortable" data-key="change1h">1h</th>
            <th class="text-right sortable" data-key="change24h">24h</th>
            <th class="text-right sortable" data-key="change7d">7d</th>
            <th class="text-right sortable" data-key="market_cap">시가총액</th>
            <th class="text-right sortable" data-key="volume">거래량</th>
            <th class="text-right">7일 차트</th>
          </tr>
        </thead>
        <tbody id="cosmos-tbody"></tbody>
      </table>
    </div>

    <footer>🚀 CoinGecko · Binance · Alternative.me | 네온 허브 + 마켓 테이블 · 30초 자동 업데이트</footer>
  </div>

  <!-- 데이터/로직: 기존 cosmos.js 사용 -->
  <script src="./cosmos.js"></script>

  <!-- 별 컨트롤러 -->
  <script>
    (function(){
      const range=document.getElementById('starRange');
      const apply=v=>document.documentElement.style.setProperty('--starVis', String(Math.max(0,Math.min(1,v/100))));
      range.addEventListener('input',e=>apply(e.target.value)); apply(range.value);
    })();
  </script>

  <!-- 허브(도넛) 간단 빌드: 섹션/텍스트 등은 cosmos.js 데이터로 그려짐 -->
  <script>
    (function(){
      const svg = document.getElementById('hubSvg');
      const centerVal = document.getElementById('hubVal');
      const centerLbl = document.getElementById('hubLbl');
      const panel = document.getElementById('hubPanel');
      const panelTitle = document.getElementById('hubTitle');
      const panelContent = document.getElementById('hubContent');

      function arcPath(cx, cy, r0, r1, a0, a1){
        const p=(r,a)=>[cx+r*Math.cos(a),cy+r*Math.sin(a)];
        const [x0,y0]=p(r1,a0),[x1,y1]=p(r1,a1),[x2,y2]=p(r0,a1),[x3,y3]=p(r0,a0);
        const laf=(a1-a0)>Math.PI?1:0;
        return `M ${x0} ${y0} A ${r1} ${r1} 0 ${laf} 1 ${x1} ${y1} L ${x2} ${y2} A ${r0} ${r0} 0 ${laf} 0 ${x3} ${y3} Z`;
      }
      function setCenter(lbl,val){centerLbl.textContent=lbl;centerVal.textContent=val}

      // 샘플(데이터는 cosmos.js initHub에서 주기적 갱신한다면 이 부분 생략 가능)
      const TAU=Math.PI*2, cx=500,cy=500,rO=470,rI=260, n=7, seg=TAU/n, start=-Math.PI/2;
      for(let i=0;i<n;i++){
        const a0=start+seg*i+0.014, a1=start+seg*(i+1)-0.014;
        const path=document.createElementNS(svg.namespaceURI,'path');
        path.setAttribute('d',arcPath(cx,cy,rI,rO,a0,a1));
        path.setAttribute('fill','url(#mintWhiteGrad)'); path.setAttribute('opacity','.18');
        path.classList.add('hub-seg'); svg.appendChild(path);

        const mid=(a0+a1)/2, rx=(rI+rO)/2, tx=cx+(rx-30)*Math.cos(mid), ty=cy+(rx-30)*Math.sin(mid)+6;
        const text=document.createElementNS(svg.namespaceURI,'text');
        text.setAttribute('x',tx); text.setAttribute('y',ty);
        text.setAttribute('text-anchor','middle'); text.textContent=['TOP10','VOL','69%','56%','48','2.17T','168.03B'][i]||'';
        text.setAttribute('class','hub-badge'); svg.appendChild(text);
        path.addEventListener('mouseenter',()=>setCenter('COSMOS','—'));
      }
      setCenter('COSMOS','—');
    })();
  </script>

  <!-- ✅ 추가 패치: ① 티커 클릭 → 차트 연동 ② 모바일은 티커만 보이게(스타일은 CSS에서) -->
  <script>
    // ① 티커(코인 칼럼) 클릭 → chart.html?id=... 이동
    document.addEventListener("click", (e) => {
      const coinCell = e.target.closest(".coin-cell");
      const row = e.target.closest("tr.row");
      if (!coinCell || !row) return;
      const id = row.dataset.id || row.getAttribute("data-id");
      if (!id) return;
      location.href = `./chart.html?id=${encodeURIComponent(id)}`;
    });

    // ② 헤더 정렬 텍스트 클릭 (cosmos.js의 wireHeaderSort와 중복되지 않도록 selector 동일)
    document.addEventListener("click",(e)=>{
      const th=e.target.closest(".cosmos-table thead th.sortable[data-key]");
      if(!th || !window._cosmos) return;
      const st=window._cosmos.state;
      const k=th.dataset.key;
      if(st.sortKey===k){ st.sortDir = st.sortDir===-1 ? 1 : -1; }
      else{ st.sortKey=k; st.sortDir=-1; }
      if(typeof window.applySortFilter==="function") window.applySortFilter();
      else if(window._cosmos && typeof window._cosmos.initData==="function") window._cosmos.initData();
    });
  </script>
</body>
</html>
