// ─────────────────────────────────────────────────────────────────────────────
//  MoneyByMath - Stock Market Education Simulator v2
//  100% frontend · No backend · No real money
//  Memory-safe: all data structures bounded, DOM trimmed, loop pauses on hide
//  Persistent: portfolio equity curve + holdings saved to localStorage
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// ── CSS injection ─────────────────────────────────────────────────────────────
(function injectCSS() {
    const s = document.createElement('style');
    s.textContent = `
/* ── Ticker bar ──────────────────────────────────────────────────────── */
.sim-ticker-bar{overflow:hidden;background:var(--bg-alt,rgba(0,0,0,0.35));border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:0;height:36px;display:flex;align-items:center;}
.sim-ticker-track{display:flex;align-items:center;white-space:nowrap;animation:tickerScroll 40s linear infinite;gap:0;padding-left:100%;}
.sim-ticker-track:hover{animation-play-state:paused;}
@keyframes tickerScroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
.sim-ticker-item{display:inline-flex;align-items:center;gap:8px;padding:0 24px;font-size:0.8rem;font-family:'Courier New',monospace;font-weight:600;color:var(--text-secondary);border-right:1px solid var(--border);}
.sim-ticker-item strong{color:var(--text-primary);}
.sim-ticker-item .up{color:#10B981;}.sim-ticker-item .down{color:#EF4444;}
.sim-ticker-loading{padding:0 20px;font-size:0.8rem;color:var(--text-muted);}

/* ── Market status bar ──────────────────────────────────────────────── */
.sim-market-status-bar{display:flex;align-items:center;gap:10px;margin-bottom:1.25rem;padding:0.5rem 0;flex-wrap:wrap;}
.sim-market-open-dot{width:9px;height:9px;border-radius:50%;background:#10B981;animation:blink 1.4s infinite;flex-shrink:0;}
.sim-market-open-label{font-size:0.75rem;font-weight:700;color:#10B981;text-transform:uppercase;letter-spacing:0.06em;}
.sim-market-time{font-size:0.75rem;color:var(--text-muted);font-family:'Courier New',monospace;}
.sim-market-right{margin-left:auto;display:flex;align-items:center;gap:12px;}
.sim-tick-label{font-size:0.7rem;color:var(--text-muted);font-family:'Courier New',monospace;}
.sim-reset-btn{background:transparent;border:1px solid var(--border);color:var(--text-muted);font-size:0.75rem;font-weight:600;padding:0.3rem 0.7rem;border-radius:6px;cursor:pointer;transition:all 0.2s;}
.sim-reset-btn:hover{border-color:#EF4444;color:#EF4444;}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0.2}}

/* ── Stock selector tabs ─────────────────────────────────────────────── */
.sim-stock-tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:0;border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:1.5rem;}
.sim-stock-tab{background:transparent;border:none;border-right:1px solid var(--border);padding:0.75rem 0.5rem;cursor:pointer;display:flex;flex-direction:column;align-items:flex-start;gap:1px;transition:background 0.2s;text-align:left;}
.sim-stock-tab:last-child{border-right:none;}
.sim-stock-tab:hover{background:var(--bg-alt,rgba(255,255,255,0.04));}
.sim-stock-tab.active{background:rgba(59,130,246,0.1);border-bottom:2px solid #3b82f6;}
.sim-tab-sym{font-size:0.95rem;font-weight:800;color:var(--text-primary);font-family:'Courier New',monospace;line-height:1;}
.sim-tab-name{font-size:0.65rem;color:var(--text-muted);line-height:1;}
.sim-tab-price{font-size:0.85rem;font-weight:700;color:var(--text-primary);font-family:'Courier New',monospace;}
.sim-tab-chg{font-size:0.7rem;font-weight:600;}
.sim-tab-chg.up{color:#10B981;}.sim-tab-chg.down{color:#EF4444;}
@media(max-width:600px){.sim-stock-tabs{grid-template-columns:repeat(2,1fr);}.sim-stock-tab{border-bottom:1px solid var(--border);}}

/* ── Main grid ───────────────────────────────────────────────────────── */
.sim-main-grid{display:grid;grid-template-columns:2fr 1fr;gap:1.5rem;margin-bottom:1.5rem;}
.sim-order-portfolio-grid{display:grid;grid-template-columns:1fr 1.4fr;gap:1.5rem;}
.sim-trade-news-grid{display:grid;grid-template-columns:1.2fr 1fr;gap:1.5rem;}
@media(max-width:900px){.sim-main-grid,.sim-order-portfolio-grid,.sim-trade-news-grid{grid-template-columns:1fr;}}

/* ── Chart card ──────────────────────────────────────────────────────── */
.sim-chart-card{display:flex;flex-direction:column;gap:0.75rem;}
.sim-chart-header{display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:0.5rem;}
.sim-chart-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;}
.sim-ticker-badge{background:linear-gradient(135deg,#3b82f6,#6366f1);color:#fff;font-weight:800;font-size:1rem;letter-spacing:0.05em;padding:0.2rem 0.6rem;border-radius:6px;font-family:'Courier New',monospace;}
.sim-company-name{font-weight:700;font-size:0.95rem;color:var(--text-primary);}
.sim-exchange{font-size:0.7rem;color:var(--text-muted);}
.sim-price-row{display:flex;align-items:baseline;gap:10px;}
.sim-price{font-size:2rem;font-weight:800;color:var(--text-primary);font-family:'Courier New',monospace;transition:color 0.3s;}
.sim-change{font-size:0.9rem;font-weight:600;transition:color 0.3s;}
.sim-change.up{color:#10B981;}.sim-change.down{color:#EF4444;}
.sim-chart-legend{display:flex;gap:12px;font-size:0.72rem;font-weight:600;}
.sim-legend-item{display:flex;align-items:center;gap:4px;}
.sim-legend-item.vwap{color:rgba(251,191,36,0.8);}
.sim-legend-item.price{color:#10B981;}
.sim-stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:0.4rem;}
.sim-stat-box{background:var(--bg-alt,rgba(0,0,0,0.18));border-radius:8px;padding:0.45rem 0.4rem;text-align:center;cursor:default;}
.sim-stat-label{font-size:0.6rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);font-weight:700;margin-bottom:2px;display:flex;align-items:center;justify-content:center;gap:3px;}
.sim-stat-val{font-size:0.88rem;font-weight:700;color:var(--text-primary);font-family:'Courier New',monospace;}
.sim-stat-val.green{color:#10B981;}.sim-stat-val.red{color:#EF4444;}
.sim-stat-val.amber{color:#F59E0B;}
.sim-tip-dot{display:inline-flex;align-items:center;justify-content:center;width:13px;height:13px;border-radius:50%;background:var(--border);color:var(--text-muted);font-size:0.6rem;font-weight:700;cursor:help;flex-shrink:0;}

/* ── Order Book ──────────────────────────────────────────────────────── */
.sim-book-card{display:flex;flex-direction:column;}
.sim-book-live-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#10B981;animation:blink 1.2s infinite;margin-left:6px;vertical-align:middle;}
.sim-book-live-label{font-size:0.65rem;font-weight:400;color:var(--text-muted);margin-left:4px;}
.sim-book-header-row{display:grid;grid-template-columns:1fr 1fr 1fr;font-size:0.62rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);font-weight:700;padding:0.3rem 0.5rem 0.4rem;border-bottom:1px solid var(--border);}
.sim-book-side{display:flex;flex-direction:column;}
.sim-asks{flex-direction:column-reverse;}
.sim-book-row{display:grid;grid-template-columns:1fr 1fr 1fr;font-size:0.78rem;padding:0.18rem 0.5rem;border-radius:3px;position:relative;overflow:hidden;transition:opacity 0.2s;}
.sim-depth-bg{position:absolute;top:0;bottom:0;right:0;border-radius:3px;transition:width 0.5s ease;}
.sim-book-row>*{position:relative;z-index:1;}
.sim-book-row .red{color:#EF4444;font-weight:600;font-family:'Courier New',monospace;font-size:0.78rem;}
.sim-book-row .green{color:#10B981;font-weight:600;font-family:'Courier New',monospace;font-size:0.78rem;}
.sim-book-row span:not(.red):not(.green){font-family:'Courier New',monospace;font-size:0.78rem;color:var(--text-secondary);}
.sim-book-cum{color:var(--text-muted)!important;font-size:0.72rem!important;}
.sim-book-spread-row{text-align:center;font-size:0.72rem;color:var(--text-muted);font-weight:600;padding:0.25rem 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);margin:0.2rem 0;}

/* ── Order form ──────────────────────────────────────────────────────── */
.sim-order-sub{font-size:0.85rem;color:var(--text-muted);margin-bottom:0.9rem;}
.sim-order-tabs{display:flex;border-radius:8px;overflow:hidden;border:1px solid var(--border);margin-bottom:1rem;}
.sim-tab{flex:1;background:transparent;border:none;padding:0.55rem;font-size:0.9rem;font-weight:700;cursor:pointer;color:var(--text-muted);transition:all 0.2s;}
.sim-tab.active[data-side="buy"]{background:#10B981;color:#fff;}
.sim-tab.active[data-side="sell"]{background:#EF4444;color:#fff;}
.sim-type-tabs{display:flex;border-radius:8px;overflow:hidden;border:1px solid var(--border);}
.sim-type-tab{flex:1;background:transparent;border:none;border-right:1px solid var(--border);padding:0.45rem 0.25rem;font-size:0.78rem;font-weight:700;cursor:pointer;color:var(--text-muted);transition:all 0.2s;}
.sim-type-tab:last-child{border-right:none;}
.sim-type-tab.active{background:#3b82f6;color:#fff;}
.sim-field-group{margin-bottom:0.9rem;}
.sim-label{display:flex;align-items:center;gap:4px;font-size:0.75rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.35rem;}
.sim-input{width:100%;box-sizing:border-box;padding:0.55rem 0.7rem;border-radius:8px;border:1px solid var(--border);background:var(--bg-alt,rgba(0,0,0,0.18));color:var(--text-primary);font-size:1rem;font-family:'Courier New',monospace;outline:none;transition:border-color 0.2s;}
.sim-input:focus{border-color:#3b82f6;}
.sim-order-estimate{display:flex;justify-content:space-between;align-items:center;background:var(--bg-alt,rgba(0,0,0,0.12));border-radius:8px;padding:0.55rem 0.7rem;margin-bottom:0.9rem;border:1px solid var(--border);}
.sim-est-label{font-size:0.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;display:flex;align-items:center;gap:4px;}
.sim-est-val{font-size:0.95rem;font-weight:800;color:var(--text-primary);font-family:'Courier New',monospace;}
.sim-place-btn{width:100%;font-size:0.95rem;padding:0.7rem;transition:background 0.2s,transform 0.1s;}
.sim-place-btn:active{transform:scale(0.98);}
.sim-order-msg{margin-top:0.6rem;padding:0.55rem 0.7rem;border-radius:8px;font-size:0.825rem;font-weight:600;animation:fadeSlideIn 0.3s ease;}
.sim-order-msg.success{background:rgba(16,185,129,0.12);border:1px solid #10B981;color:#10B981;}
.sim-order-msg.error{background:rgba(239,68,68,0.12);border:1px solid #EF4444;color:#EF4444;}
.sim-pending-label{margin-top:0.5rem;font-size:0.78rem;color:#F59E0B;font-weight:600;}
@keyframes fadeSlideIn{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:none}}

/* ── Portfolio ───────────────────────────────────────────────────────── */
.sim-port-summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;margin-bottom:0.75rem;}
.sim-port-box{background:var(--bg-alt,rgba(0,0,0,0.12));border-radius:8px;padding:0.65rem 0.75rem;}
.sim-pnl-val{font-size:1rem;font-weight:800;color:var(--text-primary);font-family:'Courier New',monospace;margin-top:3px;}
.sim-pnl-val.green{color:#10B981;}.sim-pnl-val.red{color:#EF4444;}
.sim-holdings-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem;}
.sim-section-label{font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);}
.sim-table-wrap{overflow-x:auto;}
.sim-table{width:100%;border-collapse:collapse;font-size:0.78rem;}
.sim-table th{padding:0.35rem 0.4rem;text-align:left;font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);border-bottom:1px solid var(--border);white-space:nowrap;cursor:default;}
.sim-table td{padding:0.35rem 0.4rem;color:var(--text-primary);font-family:'Courier New',monospace;font-size:0.78rem;white-space:nowrap;}
.sim-table tbody tr{border-bottom:1px solid rgba(255,255,255,0.04);transition:background 0.2s;}
.sim-table tbody tr:hover{background:var(--bg-alt,rgba(255,255,255,0.03));}
.sim-table-empty{text-align:center;color:var(--text-muted);padding:1rem;font-size:0.825rem;font-family:inherit;}
.sim-table td.green{color:#10B981;font-weight:700;}
.sim-table td.red{color:#EF4444;font-weight:700;}

/* ── Equity chart ─────────────────────────────────────────────────────── */
.sim-equity-header{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:0.5rem;}
.sim-equity-sub{font-size:0.72rem;color:var(--text-muted);}
.sim-saved-badge{font-size:0.65rem;font-weight:600;color:#10B981;margin-left:8px;animation:fadeSlideIn 0.3s ease;}

/* ── Trade history ────────────────────────────────────────────────────── */
.sim-trade-scroll{max-height:260px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;}
.sim-trade-row{white-space:nowrap;display:grid;grid-template-columns:70px 65px auto 1fr auto;align-items:center;gap:6px;padding:0.3rem 0.4rem;border-radius:5px;font-size:0.78rem;animation:fadeSlideIn 0.25s ease;}
.sim-trade-row.buy{background:rgba(16,185,129,0.07);}
.sim-trade-row.sell{background:rgba(239,68,68,0.07);}
.sim-trade-time{font-family:'Courier New',monospace;font-size:0.68rem;color:var(--text-muted);}
.sim-trade-badge{display:inline-block;font-size:0.65rem;font-weight:700;padding:0.1rem 0.4rem;border-radius:4px;text-align:center;}
.sim-trade-badge.buy{background:rgba(16,185,129,0.2);color:#10B981;}
.sim-trade-badge.sell{background:rgba(239,68,68,0.2);color:#EF4444;}

/* ── Pending orders ────────────────────────────────────────────────────── */
.sim-pending-row{display:flex;align-items:center;gap:8px;padding:0.35rem 0.4rem;border-radius:6px;background:var(--bg-alt,rgba(0,0,0,0.12));margin-bottom:4px;font-size:0.8rem;}
.sim-cancel-btn{margin-left:auto;background:transparent;border:1px solid var(--border);color:var(--text-muted);padding:0.1rem 0.4rem;border-radius:4px;cursor:pointer;font-size:0.7rem;transition:all 0.2s;}
.sim-cancel-btn:hover{border-color:#EF4444;color:#EF4444;}
.sim-pending-count{background:#F59E0B;color:#000;font-size:0.65rem;font-weight:700;padding:0.1rem 0.4rem;border-radius:10px;margin-left:8px;}

/* ── News feed ─────────────────────────────────────────────────────────── */
.sim-news-row{display:flex;align-items:flex-start;gap:8px;padding:0.4rem 0.5rem;border-radius:6px;margin-bottom:4px;font-size:0.78rem;line-height:1.4;animation:fadeSlideIn 0.3s ease;}
.sim-news-row.positive{background:rgba(16,185,129,0.08);border-left:2px solid #10B981;}
.sim-news-row.negative{background:rgba(239,68,68,0.08);border-left:2px solid #EF4444;}
.sim-news-time{font-size:0.65rem;color:var(--text-muted);font-family:'Courier New',monospace;white-space:nowrap;margin-top:1px;}
.sim-news-text{color:var(--text-secondary);}
.sim-news-sym{font-weight:700;color:var(--text-primary);}

/* ── Achievements ──────────────────────────────────────────────────────── */
.sim-ach-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:0.6rem;}
.sim-ach-badge{display:flex;flex-direction:column;align-items:center;gap:4px;padding:0.75rem 0.4rem;border-radius:10px;border:1px solid var(--border);background:var(--bg-alt,rgba(0,0,0,0.12));opacity:0.35;filter:grayscale(1);transition:all 0.3s;cursor:default;text-align:center;}
.sim-ach-badge.unlocked{opacity:1;filter:none;border-color:#F59E0B;background:rgba(245,158,11,0.08);}
.sim-ach-badge-icon{font-size:1.6rem;line-height:1;}
.sim-ach-badge-title{font-size:0.65rem;font-weight:700;color:var(--text-secondary);line-height:1.2;}
.sim-achievement-toast{position:fixed;bottom:24px;right:24px;background:var(--bg-main,#1e2330);border:1px solid #F59E0B;border-radius:12px;padding:1rem 1.25rem;display:flex;align-items:center;gap:12px;box-shadow:0 8px 32px rgba(0,0,0,0.4);z-index:9999;transform:translateY(20px);opacity:0;transition:all 0.4s cubic-bezier(0.34,1.56,0.64,1);max-width:320px;}
.sim-achievement-toast.show{transform:none;opacity:1;}
.sim-ach-icon{font-size:2rem;}
.sim-ach-title{font-size:0.85rem;font-weight:700;color:#F59E0B;}
.sim-ach-desc{font-size:0.75rem;color:var(--text-muted);margin-top:1px;}

/* ── Tape ───────────────────────────────────────────────────────────────── */
.sim-tape-header-row{display:grid;grid-template-columns:80px 70px 90px 70px 1fr;font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);padding:0.25rem 0.4rem 0.4rem;border-bottom:1px solid var(--border);}
.sim-tape{max-height:200px;overflow-y:auto;display:flex;flex-direction:column;gap:1px;}
.sim-tape-empty{text-align:center;color:var(--text-muted);padding:1.25rem;font-size:0.825rem;}
.sim-tape-row{white-space:nowrap;display:grid;grid-template-columns:80px 70px 90px 70px 1fr;align-items:center;font-size:0.76rem;font-family:'Courier New',monospace;padding:0.18rem 0.4rem;border-radius:3px;animation:fadeSlideIn 0.2s ease;}
.sim-tape-row.buyer{background:rgba(16,185,129,0.07);color:#10B981;}
.sim-tape-row.seller{background:rgba(239,68,68,0.07);color:#EF4444;}
.sim-tape-row.mine{font-weight:700;outline:1px solid currentColor;outline-offset:-1px;}
.sim-tape-time{color:var(--text-muted);font-size:0.68rem;}
.sim-tape-sym{font-weight:800;}
.sim-tape-label{font-size:0.68rem;opacity:0.75;}
.sim-tape-legend{font-size:0.85rem;}
.sim-tape-legend.buyer{color:#10B981;}
.sim-tape-legend.seller{color:#EF4444;}
.sim-tape-legend.mine{color:#F59E0B;}

/* ── Tooltip ──────────────────────────────────────────────────────────── */
#simTooltip{position:fixed;z-index:10000;background:rgba(15,23,42,0.97);color:#e2e8f0;font-size:0.78rem;line-height:1.5;padding:0.5rem 0.75rem;border-radius:8px;border:1px solid rgba(255,255,255,0.1);max-width:280px;pointer-events:none;box-shadow:0 4px 20px rgba(0,0,0,0.5);display:none;}
.inline-tip{border-bottom:1px dashed var(--text-muted);cursor:help;}

/* ── Flash animations ───────────────────────────────────────────────── */
@keyframes flashGreen{0%,100%{background:transparent}50%{background:rgba(16,185,129,0.15)}}
@keyframes flashRed{0%,100%{background:transparent}50%{background:rgba(239,68,68,0.15)}}
.flash-green{animation:flashGreen 0.4s ease;}
.flash-red{animation:flashRed 0.4s ease;}
`;
    document.head.appendChild(s);
})();

// ── Constants ──────────────────────────────────────────────────────────────────
const TICK_MS        = 1200;   // ms between price ticks
const MAX_PRICE_HIST = 300;    // bounded price history per stock
const MAX_TAPE_DOM   = 50;     // max DOM rows in tape
const MAX_EQUITY_PTS = 600;    // equity curve data points
const MAX_TRADES     = 200;    // stored trade records
const MAX_NEWS       = 12;     // news items kept in feed
const CANDLE_TICKS   = 6;      // ticks aggregated per candle
const SAVE_KEY       = 'mbm_sim_v3';
const STARTING_CASH  = 10000;

// ── Stock definitions ──────────────────────────────────────────────────────────
const STOCK_DEFS = {
    MMBX:  { name:'MoneyByMath Corp', sector:'Technology', startPrice:142.50, vol:0.007, drift: 0.00004, color:'#3b82f6' },
    GOLDY: { name:'Goldfield Mining',  sector:'Materials',  startPrice:58.20,  vol:0.013, drift: 0.00001, color:'#F59E0B' },
    BNKR:  { name:'Banker Financial',  sector:'Financials', startPrice:94.75,  vol:0.005, drift: 0.00006, color:'#10B981' },
    VLTX:  { name:'Voltage Energy',    sector:'Energy',     startPrice:23.40,  vol:0.017, drift:-0.00002, color:'#EF4444' },
};

// ── Application state ──────────────────────────────────────────────────────────
const STATE = {
    active:    'MMBX',
    stocks:    {},
    portfolio: {
        cash:         STARTING_CASH,
        holdings:     {},   // sym → {shares, avgCost, totalCost}
        trades:       [],   // [{date,symbol,side,qty,price,pnl}]
        equity:       [],   // [{tick,value}]
        achievements: new Set(),
    },
    pendingOrders: [],
    tickCount:     0,
    tapeDomCount:  0,
    newsQueue:     [],
    limitFills:    0,
};

let mainLoopId  = null;
let orderSide   = 'buy';
let orderType   = 'market';
let priceCtx    = null;
let equityCtx   = null;

// ── Utility ────────────────────────────────────────────────────────────────────
function randn() {
    let u=0,v=0;
    while(!u) u=Math.random();
    while(!v) v=Math.random();
    return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}
const clamp  = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
const fmt    = n => '$'+Math.abs(+n).toFixed(2);
const fmtS   = n => (n>=0?'+':'-')+'$'+Math.abs(+n).toFixed(2);
const fmtPct = n => (n>=0?'+':'')+n.toFixed(2)+'%';
const fmtN   = n => Math.round(+n).toLocaleString();
const $      = id => document.getElementById(id);
const setText = (id,t) => { const e=$(id); if(e) e.textContent=t; };

// ── Stock simulation ───────────────────────────────────────────────────────────
function initStock(sym) {
    const def = STOCK_DEFS[sym];
    return {
        ...def,
        price:       def.startPrice,
        prevClose:   def.startPrice,
        open:        def.startPrice,
        high:        def.startPrice,
        low:         def.startPrice,
        w52High:     def.startPrice * (1 + Math.random()*0.3),
        w52Low:      def.startPrice * (1 - Math.random()*0.3),
        dayVolume:   0,
        priceHistory:[def.startPrice],
        candles:     [],
        candleBuf:   { o:def.startPrice, h:def.startPrice, l:def.startPrice, c:def.startPrice, v:0, ticks:0 },
        vwapNum:     0,
        vwapDen:     0,
        rsiGains:    [],
        rsiLosses:   [],
        rsi14:       50,
        prevPrice:   def.startPrice,
    };
}

function tickStock(sym, externalShock=0) {
    const s = STATE.stocks[sym];
    const old = s.price;
    const shock = randn() * s.vol + s.drift + externalShock;
    s.price = parseFloat((s.price * (1+shock)).toFixed(2));
    s.price = clamp(s.price, 0.10, 99999);
    s.prevPrice = old;

    // OHLC candle aggregation
    const cb = s.candleBuf;
    cb.ticks++;
    cb.h = Math.max(cb.h, s.price);
    cb.l = Math.min(cb.l, s.price);
    cb.c = s.price;
    const tv = Math.floor(80 + Math.random()*600);
    cb.v += tv;
    if (cb.ticks >= CANDLE_TICKS) {
        s.candles.push({ o:cb.o, h:cb.h, l:cb.l, c:cb.c, v:cb.v });
        if (s.candles.length > 120) s.candles.shift();
        s.candleBuf = { o:s.price, h:s.price, l:s.price, c:s.price, v:0, ticks:0 };
    }

    // Bounded price history
    s.priceHistory.push(s.price);
    if (s.priceHistory.length > MAX_PRICE_HIST) s.priceHistory.shift();

    // Day stats
    s.dayVolume += tv;
    s.high = Math.max(s.high, s.price);
    s.low  = Math.min(s.low,  s.price);
    s.w52High = Math.max(s.w52High, s.price);
    s.w52Low  = Math.min(s.w52Low,  s.price);

    // VWAP
    const mid = (s.high + s.low + s.price) / 3;
    s.vwapNum += mid * tv;
    s.vwapDen += tv;

    // Running RSI-14
    const chg = s.price - old;
    s.rsiGains.push(Math.max(0, chg));
    s.rsiLosses.push(Math.max(0, -chg));
    if (s.rsiGains.length > 14) { s.rsiGains.shift(); s.rsiLosses.shift(); }
    const ag = s.rsiGains.reduce((a,b)=>a+b,0)/14;
    const al = s.rsiLosses.reduce((a,b)=>a+b,0)/14;
    s.rsi14 = al===0 ? 100 : parseFloat((100 - 100/(1+ag/al)).toFixed(1));

    return tv;
}

// ── Order Book ─────────────────────────────────────────────────────────────────
function generateBook(price, vol) {
    const vf  = (vol||0.008) / 0.008;
    const hs  = parseFloat((0.004 + Math.random()*0.018*vf).toFixed(3));
    const bid = parseFloat((price - hs).toFixed(2));
    const ask = parseFloat((price + hs).toFixed(2));
    const asks=[], bids=[];
    let cumA=0, cumB=0;
    for (let i=0;i<10;i++) {
        const ap = parseFloat((ask + i*(0.01+Math.random()*0.04)).toFixed(2));
        const sz = Math.floor(60 + Math.random()*700*(1-i*0.06));
        cumA += sz;
        asks.push({ price:ap, size:sz, cum:cumA });
    }
    for (let i=0;i<10;i++) {
        const bp = parseFloat((bid - i*(0.01+Math.random()*0.04)).toFixed(2));
        const sz = Math.floor(60 + Math.random()*700*(1-i*0.06));
        cumB += sz;
        bids.push({ price:bp, size:sz, cum:cumB });
    }
    asks.sort((a,b)=>a.price-b.price);
    bids.sort((a,b)=>b.price-a.price);
    return { asks, bids, bestAsk:ask, bestBid:bid, spread:parseFloat((ask-bid).toFixed(3)), maxCum:Math.max(cumA,cumB) };
}

// ── Canvas chart helpers ──────────────────────────────────────────────────────
function setupCanvas(id) {
    const canvas = $(id);
    if (!canvas) return null;
    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W    = Math.max(rect.width||600, 200);
    const H    = parseInt(canvas.dataset.h) || 180;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx._w = W; ctx._h = H;
    return ctx;
}

function drawPriceChart(ctx, stock) {
    if (!ctx) return;
    const W=ctx._w, H=ctx._h;
    ctx.clearRect(0,0,W,H);
    const data = stock.priceHistory;
    if (data.length < 2) return;

    const lo = Math.min(...data)*0.999;
    const hi = Math.max(...data)*1.001;
    const rng = hi - lo || 1;
    const pad = { t:8, r:64, b:22, l:10 };
    const cW  = W - pad.l - pad.r;
    const cH  = H - pad.t - pad.b;
    const xS  = i => pad.l + (i/(data.length-1||1))*cW;
    const yS  = v => pad.t + (1-(v-lo)/rng)*cH;

    // Grid lines + price labels (right side)
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    for (let i=0;i<=4;i++) {
        const y = pad.t + (i/4)*cH;
        ctx.strokeStyle = 'rgba(150,150,150,0.08)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3,3]);
        ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(pad.l+cW,y); ctx.stroke();
        ctx.setLineDash([]);
        const v = hi - (i/4)*rng;
        ctx.fillStyle = 'rgba(150,150,150,0.5)';
        ctx.fillText('$'+v.toFixed(2), pad.l+cW+3, y+3);
    }

    // VWAP dashed line
    if (stock.vwapDen > 0) {
        const vwap = stock.vwapNum/stock.vwapDen;
        if (vwap>=lo && vwap<=hi) {
            const vy = yS(vwap);
            ctx.setLineDash([4,4]);
            ctx.strokeStyle = 'rgba(251,191,36,0.55)';
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(pad.l,vy); ctx.lineTo(pad.l+cW,vy); ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    const isUp = data[data.length-1] >= data[0];
    const lineColor = isUp ? '#10B981' : '#EF4444';

    // Fill gradient
    const grad = ctx.createLinearGradient(0,pad.t,0,pad.t+cH);
    grad.addColorStop(0, isUp ? 'rgba(16,185,129,0.22)':'rgba(239,68,68,0.22)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    data.forEach((p,i)=>{ const x=xS(i),y=yS(p); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
    ctx.lineTo(xS(data.length-1),pad.t+cH); ctx.lineTo(pad.l,pad.t+cH); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    // Price line
    ctx.beginPath();
    data.forEach((p,i)=>{ const x=xS(i),y=yS(p); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
    ctx.strokeStyle = lineColor; ctx.lineWidth = 2; ctx.stroke();

    // Current price marker
    const ly = yS(data[data.length-1]);
    ctx.fillStyle = lineColor;
    ctx.fillRect(pad.l+cW+1, ly-8, 60, 16);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('$'+data[data.length-1].toFixed(2), pad.l+cW+4, ly+4);

    // x-axis label
    ctx.fillStyle = 'rgba(150,150,150,0.4)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('← price history →', pad.l+cW/2, H-4);
}

function drawEquityChart(ctx, equity) {
    if (!ctx || equity.length < 2) return;
    const W=ctx._w, H=ctx._h;
    ctx.clearRect(0,0,W,H);
    const values = equity.map(e=>e.value);
    const lo = Math.min(...values, STARTING_CASH)*0.994;
    const hi = Math.max(...values, STARTING_CASH)*1.006;
    const rng = hi - lo || 1;
    const pad = { t:8, r:72, b:22, l:10 };
    const cW  = W - pad.l - pad.r;
    const cH  = H - pad.t - pad.b;
    const xS  = i => pad.l + (i/(equity.length-1||1))*cW;
    const yS  = v => pad.t + (1-(v-lo)/rng)*cH;

    // Starting value baseline
    const by = yS(STARTING_CASH);
    ctx.setLineDash([4,4]);
    ctx.strokeStyle = 'rgba(150,150,150,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l,by); ctx.lineTo(pad.l+cW,by); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '9px monospace'; ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(150,150,150,0.5)';
    ctx.fillText('$'+STARTING_CASH.toLocaleString(), pad.l+cW+3, by+3);

    // Grid
    for (let i=0;i<=3;i++) {
        const y = pad.t + (i/3)*cH;
        ctx.strokeStyle = 'rgba(150,150,150,0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(pad.l+cW,y); ctx.stroke();
        const v = hi - (i/3)*rng;
        ctx.fillStyle = 'rgba(150,150,150,0.45)';
        ctx.fillText('$'+Math.round(v).toLocaleString(), pad.l+cW+3, y+3);
    }

    const lastVal  = values[values.length-1];
    const isUp     = lastVal >= STARTING_CASH;
    const lineCol  = isUp ? '#10B981' : '#EF4444';

    const grad = ctx.createLinearGradient(0,pad.t,0,pad.t+cH);
    grad.addColorStop(0, isUp?'rgba(16,185,129,0.28)':'rgba(239,68,68,0.28)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.beginPath();
    equity.forEach((e,i)=>{ const x=xS(i),y=yS(e.value); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
    ctx.lineTo(xS(equity.length-1),pad.t+cH); ctx.lineTo(pad.l,pad.t+cH); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    ctx.beginPath();
    equity.forEach((e,i)=>{ const x=xS(i),y=yS(e.value); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
    ctx.strokeStyle = lineCol; ctx.lineWidth = 2.5; ctx.stroke();

    // Last value marker
    const ly = yS(lastVal);
    ctx.fillStyle = lineCol;
    ctx.fillRect(pad.l+cW+1, ly-8, 68, 16);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px monospace';
    ctx.fillText('$'+lastVal.toFixed(2), pad.l+cW+4, ly+4);

    ctx.fillStyle = 'rgba(150,150,150,0.4)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('← portfolio value over time →', pad.l+cW/2, H-4);
}

// ── localStorage ───────────────────────────────────────────────────────────────
function saveState() {
    try {
        const p = STATE.portfolio;
        localStorage.setItem(SAVE_KEY, JSON.stringify({
            cash:         p.cash,
            holdings:     p.holdings,
            trades:       p.trades.slice(0, MAX_TRADES),
            equity:       p.equity.slice(-MAX_EQUITY_PTS),
            achievements: [...p.achievements],
            limitFills:   STATE.limitFills,
        }));
        const badge = $('simSavedBadge');
        if (badge) { badge.style.display='inline'; clearTimeout(badge._t); badge._t=setTimeout(()=>badge.style.display='none',2000); }
    } catch(e) {}
}

function loadState() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return;
        const sv = JSON.parse(raw);
        const p  = STATE.portfolio;
        p.cash         = sv.cash         ?? STARTING_CASH;
        p.holdings     = sv.holdings     ?? {};
        p.trades       = sv.trades       ?? [];
        p.equity       = sv.equity       ?? [];
        p.achievements = new Set(sv.achievements ?? []);
        STATE.limitFills = sv.limitFills ?? 0;
    } catch(e) {}
}

// ── News system ────────────────────────────────────────────────────────────────
const NEWS_EVENTS = [
    { text:'[SYM] beats earnings estimates - analysts raise price targets', impact:0.028, type:'specific' },
    { text:'Analyst downgrades [SYM] to "Underperform", cuts target by 20%', impact:-0.020, type:'specific' },
    { text:'[SYM] announces $500M share buyback program', impact:0.016, type:'specific' },
    { text:'[SYM] insider buying spike - CEO purchases 50,000 shares', impact:0.013, type:'specific' },
    { text:'[SYM] misses revenue forecast - guidance lowered for next quarter', impact:-0.024, type:'specific' },
    { text:'[SYM] announces major new product launch', impact:0.022, type:'specific' },
    { text:'[SYM] faces regulatory scrutiny - DOJ investigating practices', impact:-0.030, type:'specific' },
    { text:'Federal Reserve holds rates steady - broad rally begins', impact:0.011, type:'market' },
    { text:'Inflation data hotter than expected - selloff across indices', impact:-0.016, type:'market' },
    { text:'Strong jobs report boosts investor confidence', impact:0.009, type:'market' },
    { text:'Geopolitical tensions rise - risk-off sentiment grips market', impact:-0.013, type:'market' },
    { text:'Tech sector rotation sparks broad gains in growth names', impact:0.012, type:'sector', sector:'Technology' },
    { text:'Energy prices surge - supply cut announcement rocks the market', impact:0.019, type:'sector', sector:'Energy' },
    { text:'Banking sector under pressure - credit concerns mount', impact:-0.016, type:'sector', sector:'Financials' },
    { text:'Infrastructure bill passes - materials stocks surge', impact:0.015, type:'sector', sector:'Materials' },
];

function maybeFireNews() {
    if (Math.random() > 0.035) return null;
    const ev  = NEWS_EVENTS[Math.floor(Math.random()*NEWS_EVENTS.length)];
    const syms = Object.keys(STOCK_DEFS);
    const tSym = ev.type==='specific' ? syms[Math.floor(Math.random()*syms.length)] : null;
    const text = ev.text.replace('[SYM]', tSym||'Market');

    syms.forEach(sym => {
        const s = STATE.stocks[sym];
        let shock = 0;
        const rand = 0.4 + Math.random()*0.9;
        if (ev.type==='market') shock = ev.impact * rand;
        else if (ev.type==='specific' && sym===tSym) shock = ev.impact * rand;
        else if (ev.type==='sector' && STOCK_DEFS[sym].sector===ev.sector) shock = ev.impact * rand * 0.8;
        if (shock !== 0) s.price = parseFloat((s.price*(1+shock)).toFixed(2));
    });

    const news = { text, impact:ev.impact, sym:tSym, time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) };
    STATE.newsQueue.unshift(news);
    if (STATE.newsQueue.length > MAX_NEWS) STATE.newsQueue.pop();
    return news;
}

// ── Achievements ───────────────────────────────────────────────────────────────
const ACHIEVEMENTS = [
    { id:'first_trade',    icon:'🎯', title:'First Trade',       desc:'Place your very first order' },
    { id:'first_profit',   icon:'💰', title:'In The Green',      desc:'Close a trade with a profit' },
    { id:'big_win',        icon:'🚀', title:'Moonshot',          desc:'Make over $500 on a single trade' },
    { id:'portfolio_10',   icon:'📈', title:'On The Rise',       desc:'Grow portfolio above $11,000' },
    { id:'portfolio_25',   icon:'🏆', title:'Quarter Up',        desc:'Grow portfolio above $12,500' },
    { id:'diamond_hands',  icon:'💎', title:'Diamond Hands',     desc:'Hold a position through a -10% drawdown' },
    { id:'diversified',    icon:'🌐', title:'Diversified',       desc:'Hold 3+ different stocks simultaneously' },
    { id:'limit_master',   icon:'🎯', title:'Limit Master',      desc:'Have 5 limit orders fill successfully' },
];

function checkAchievements(newTrade=null) {
    const p   = STATE.portfolio;
    const ach = p.achievements;
    const fire = id => {
        if (ach.has(id)) return;
        ach.add(id);
        const a = ACHIEVEMENTS.find(x=>x.id===id);
        if (a) showAchToast(a);
    };

    if (p.trades.length >= 1) fire('first_trade');
    if (newTrade && newTrade.pnl != null && newTrade.pnl > 0) fire('first_profit');
    if (newTrade && newTrade.pnl != null && newTrade.pnl > 500) fire('big_win');

    const tv = portfolioValue();
    if (tv >= 11000) fire('portfolio_10');
    if (tv >= 12500) fire('portfolio_25');
    if (STATE.limitFills >= 5) fire('limit_master');

    const held = Object.values(p.holdings).filter(h=>h&&h.shares>0).length;
    if (held >= 3) fire('diversified');

    // Diamond hands: check if any position has unrealized loss > 10%
    Object.entries(p.holdings).forEach(([sym,h])=>{
        if (!h||h.shares<=0) return;
        const pnlPct = (STATE.stocks[sym].price - h.avgCost)/h.avgCost*100;
        if (pnlPct <= -10) fire('diamond_hands');
    });
}

function showAchToast(a) {
    const t = document.createElement('div');
    t.className = 'sim-achievement-toast';
    t.innerHTML = `<span class="sim-ach-icon">${a.icon}</span><div><div class="sim-ach-title">Achievement: ${a.title}</div><div class="sim-ach-desc">${a.desc}</div></div>`;
    document.body.appendChild(t);
    setTimeout(()=>t.classList.add('show'), 30);
    setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(),500); }, 4200);
}

// ── Portfolio helpers ──────────────────────────────────────────────────────────
function portfolioValue() {
    const p = STATE.portfolio;
    return p.cash + Object.entries(p.holdings).reduce((sum,[sym,h])=>{
        return sum + (h&&h.shares>0 ? h.shares*STATE.stocks[sym].price : 0);
    }, 0);
}

// ── Order placement (exposed globally) ────────────────────────────────────────
window.placeOrder = function() {
    const msgEl  = $('simOrderMsg');
    const pendEl = $('simPendingLabel');
    if (msgEl)  msgEl.style.display = 'none';
    if (pendEl) pendEl.style.display = 'none';

    const sym   = STATE.active;
    const stock = STATE.stocks[sym];
    const qty   = parseInt($('simShares').value);

    if (!qty||qty<1||qty>50000) { showMsg('error','Enter a valid share count (1–50,000).'); return; }

    const book = generateBook(stock.price, stock.vol);

    if (orderType==='market') {
        executeMarket(sym, qty, book);
    } else if (orderType==='limit') {
        const lp = parseFloat($('simLimitPrice')?.value);
        if (!lp||lp<=0) { showMsg('error','Enter a valid limit price.'); return; }
        enqueueLimitOrder(sym, qty, lp, book);
    } else {
        const sp = parseFloat($('simStopPrice')?.value);
        if (!sp||sp<=0) { showMsg('error','Enter a valid stop price.'); return; }
        if (orderSide==='buy'  && sp <= stock.price) { showMsg('error','Buy-stop must be above current price.'); return; }
        if (orderSide==='sell' && sp >= stock.price) { showMsg('error','Stop-loss must be below current price.'); return; }
        STATE.pendingOrders.push({ side:orderSide, type:'stop', symbol:sym, qty, limitPrice:sp });
        showMsg('success',`⏳ Stop ${orderSide.toUpperCase()} set: ${fmtN(qty)} ${sym} @ ${fmt(sp)}`);
        if (pendEl) pendEl.style.display='block';
        renderPendingOrders();
    }
};

window.cancelOrder = function(i) {
    STATE.pendingOrders.splice(i, 1);
    renderPendingOrders();
    if (!STATE.pendingOrders.length) { const e=$('simPendingLabel'); if(e) e.style.display='none'; }
};

function executeMarket(sym, qty, book, silent=false) {
    const p = STATE.portfolio;
    const stock = STATE.stocks[sym];

    if (orderSide==='buy') {
        const ep   = book.bestAsk;
        const cost = ep * qty;
        if (cost > p.cash) { if(!silent) showMsg('error',`Need ${fmt(cost)} but only ${fmt(p.cash)} available.`); return false; }
        p.cash -= cost;
        if (!p.holdings[sym]) p.holdings[sym] = { shares:0, avgCost:0, totalCost:0 };
        const h = p.holdings[sym];
        h.totalCost += cost; h.shares += qty; h.avgCost = h.totalCost/h.shares;
        stock.dayVolume += qty;
        addTapeRow(sym, ep, qty, 'buy', !silent);
        const trade = { date:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'}), symbol:sym, side:'buy', qty, price:ep, pnl:null };
        p.trades.unshift(trade); if(p.trades.length>MAX_TRADES) p.trades.pop();
        if (!silent) { showMsg('success',`✓ Bought ${fmtN(qty)} ${sym} @ ${fmt(ep)} - Cost: ${fmt(cost)}`); flashEl('simPriceChart','flash-green'); }
        checkAchievements();
        return true;
    } else {
        const h = p.holdings[sym];
        if (!h||h.shares<qty) { if(!silent) showMsg('error',`You only hold ${fmtN(h?.shares||0)} ${sym} shares.`); return false; }
        const ep       = book.bestBid;
        const proceeds = ep * qty;
        const basis    = h.avgCost * qty;
        const pnl      = proceeds - basis;
        p.cash += proceeds;
        h.shares -= qty; h.totalCost -= basis;
        if (h.shares <= 0) { h.shares=0; h.totalCost=0; h.avgCost=0; }
        else h.avgCost = h.totalCost/h.shares;
        stock.dayVolume += qty;
        addTapeRow(sym, ep, qty, 'sell', !silent);
        const trade = { date:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'}), symbol:sym, side:'sell', qty, price:ep, pnl };
        p.trades.unshift(trade); if(p.trades.length>MAX_TRADES) p.trades.pop();
        if (!silent) { showMsg('success',`✓ Sold ${fmtN(qty)} ${sym} @ ${fmt(ep)} - P&L: ${fmtS(pnl)}`); flashEl('simPriceChart', pnl>=0?'flash-green':'flash-red'); }
        checkAchievements(trade);
        return true;
    }
}

function enqueueLimitOrder(sym, qty, lp, book) {
    // Immediately fillable?
    if (orderSide==='buy'  && lp >= book.bestAsk) { executeMarket(sym,qty,book); return; }
    if (orderSide==='sell' && lp <= book.bestBid) { executeMarket(sym,qty,book); return; }
    const p = STATE.portfolio;
    if (orderSide==='buy'  && lp*qty > p.cash) { showMsg('error',`Need up to ${fmt(lp*qty)} to fill - only ${fmt(p.cash)} available.`); return; }
    if (orderSide==='sell') {
        const h = p.holdings[sym];
        if (!h||h.shares<qty) { showMsg('error',`You only hold ${fmtN(h?.shares||0)} ${sym} shares.`); return; }
    }
    STATE.pendingOrders.push({ side:orderSide, type:'limit', symbol:sym, qty, limitPrice:lp });
    showMsg('success',`⏳ Limit ${orderSide.toUpperCase()} queued: ${fmtN(qty)} ${sym} @ ${fmt(lp)} - watching for price…`);
    const pendEl = $('simPendingLabel'); if(pendEl) pendEl.style.display='block';
    renderPendingOrders();
}

function checkPendingOrders() {
    const keep = [];
    const prevSide = orderSide;
    STATE.pendingOrders.forEach(o => {
        const s = STATE.stocks[o.symbol];
        let fill = false;
        if (o.type==='limit') {
            if (o.side==='buy'  && s.price <= o.limitPrice) fill=true;
            if (o.side==='sell' && s.price >= o.limitPrice) fill=true;
        } else if (o.type==='stop') {
            if (o.side==='buy'  && s.price >= o.limitPrice) fill=true;
            if (o.side==='sell' && s.price <= o.limitPrice) fill=true;
        }
        if (fill) {
            orderSide = o.side;
            const book = generateBook(s.price, s.vol);
            const ok = executeMarket(o.symbol, o.qty, book, true);
            if (ok && o.type==='limit') { STATE.limitFills++; checkAchievements(); }
            if (ok) showMsg('success',`⚡ ${o.type==='limit'?'Limit':'Stop'} ${o.side.toUpperCase()} filled: ${fmtN(o.qty)} ${o.symbol} @ ${fmt(o.limitPrice)}`);
        } else {
            keep.push(o);
        }
    });
    orderSide = prevSide;
    STATE.pendingOrders = keep;
    const pendEl = $('simPendingLabel');
    if (pendEl) pendEl.style.display = keep.length ? 'block' : 'none';
    updatePendingCount();
}

// ── DOM helpers ────────────────────────────────────────────────────────────────
function flashEl(id, cls) {
    const el = $(id); if(!el) return;
    el.classList.remove('flash-green','flash-red');
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(()=>el.classList.remove(cls), 500);
}

function showMsg(type, text) {
    const el = $('simOrderMsg'); if(!el) return;
    el.textContent = text; el.className = 'sim-order-msg '+type; el.style.display='block';
    clearTimeout(el._t);
    if (type==='success') el._t = setTimeout(()=>el.style.display='none', 6000);
}

function addTapeRow(sym, price, qty, side, mine=false) {
    const tape = $('simTape'); if(!tape) return;
    const empty = tape.querySelector('.sim-tape-empty');
    if (empty) empty.remove();

    const now = new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    const row = document.createElement('div');
    row.className = `sim-tape-row ${side==='buy'?'buyer':'seller'}${mine?' mine':''}`;
    row.innerHTML = `<span class="sim-tape-time">${now}</span><span class="sim-tape-sym">${sym}</span><span>$${price.toFixed(2)}</span><span>${fmtN(qty)}</span><span class="sim-tape-label">${mine?'★ YOU - ':''} ${side==='buy'?'Buyer':'Seller'}</span>`;
    tape.prepend(row);

    // Memory-safe DOM trim
    STATE.tapeDomCount++;
    if (STATE.tapeDomCount > MAX_TAPE_DOM + 15) {
        while (tape.children.length > MAX_TAPE_DOM) tape.removeChild(tape.lastChild);
        STATE.tapeDomCount = MAX_TAPE_DOM;
    }
}

// ── Render functions ──────────────────────────────────────────────────────────
function renderTickerBar() {
    const track = $('simTickerTrack'); if(!track) return;
    const syms = Object.keys(STOCK_DEFS);
    const items = [...syms,...syms].map(sym => {
        const s   = STATE.stocks[sym];
        const chg = (s.price - s.prevClose)/s.prevClose*100;
        const dir = chg>=0?'up':'down';
        return `<span class="sim-ticker-item"><strong>${sym}</strong> $${s.price.toFixed(2)} <span class="${dir}">${fmtPct(chg)}</span></span>`;
    }).join('');
    track.innerHTML = items;
}

function renderStockTabs() {
    Object.keys(STOCK_DEFS).forEach(sym => {
        const s   = STATE.stocks[sym];
        const chg = (s.price - s.prevClose)/s.prevClose*100;
        const dir = chg>=0?'up':'down';
        const pe  = $('tabPrice_'+sym);
        const ce  = $('tabChg_'+sym);
        if (pe) pe.textContent = '$'+s.price.toFixed(2);
        if (ce) { ce.textContent = fmtPct(chg); ce.className = 'sim-tab-chg '+dir; }
    });
}

function renderPriceCard(book) {
    const sym   = STATE.active;
    const stock = STATE.stocks[sym];
    const chg   = stock.price - stock.prevClose;
    const pct   = (chg/stock.prevClose)*100;

    setText('simPrice', '$'+stock.price.toFixed(2));
    const chEl = $('simChange');
    if (chEl) { chEl.textContent=`${chg>=0?'+':'-'}$${Math.abs(chg).toFixed(2)} (${fmtPct(pct)})`; chEl.className='sim-change '+(chg>=0?'up':'down'); }
    setText('simChartTicker', sym);
    setText('simChartName',   STOCK_DEFS[sym].name);
    setText('simBid',    '$'+book.bestBid.toFixed(2));
    setText('simAsk',    '$'+book.bestAsk.toFixed(2));
    setText('simSpread', '$'+book.spread.toFixed(3));
    setText('simVolume', fmtN(stock.dayVolume));
    setText('simDayHigh','$'+stock.high.toFixed(2));
    setText('simDayLow', '$'+stock.low.toFixed(2));
    const vwap = stock.vwapDen>0 ? stock.vwapNum/stock.vwapDen : stock.price;
    setText('simVwap',   '$'+vwap.toFixed(2));
    setText('simRsi',    stock.rsi14.toFixed(1));
    const rsiEl = $('simRsi');
    if (rsiEl) rsiEl.className='sim-stat-val'+(stock.rsi14>70?' red':stock.rsi14<30?' green':' amber');
}

function renderBook(book) {
    const mc = book.maxCum || 1;
    const row = (r, side) => {
        const pct = (r.cum/mc*100).toFixed(1);
        const bg  = side==='ask'?'rgba(239,68,68,0.12)':'rgba(16,185,129,0.12)';
        return `<div class="sim-book-row"><div class="sim-depth-bg" style="width:${pct}%;background:${bg};"></div><span class="${side==='ask'?'red':'green'}">$${r.price.toFixed(2)}</span><span>${fmtN(r.size)}</span><span class="sim-book-cum">${fmtN(r.cum)}</span></div>`;
    };
    const asksEl=$('simAsks'), bidsEl=$('simBids');
    if (asksEl) asksEl.innerHTML = book.asks.map(r=>row(r,'ask')).join('');
    if (bidsEl) bidsEl.innerHTML = book.bids.map(r=>row(r,'bid')).join('');
    setText('simSpreadRow', `Spread: $${book.spread.toFixed(3)}`);
}

function renderPortfolio() {
    const p  = STATE.portfolio;
    const tv = portfolioValue();
    const pl = tv - STARTING_CASH;
    const pp = (pl/STARTING_CASH)*100;

    setText('simCash',     fmt(p.cash));
    setText('simCash2',    fmt(p.cash));
    setText('simTotalVal', '$'+tv.toFixed(2));
    const pvEl = $('simTotalPnl');
    if (pvEl) { pvEl.textContent=`${fmtS(pl)} (${fmtPct(pp)})`; pvEl.className='sim-pnl-val '+(pl>=0?'green':'red'); }

    // Holdings table
    const tbody = $('simHoldingsBody'); if(!tbody) return;
    const rows = Object.entries(p.holdings).filter(([,h])=>h&&h.shares>0).map(([sym,h])=>{
        const s   = STATE.stocks[sym];
        const mv  = h.shares * s.price;
        const pnl = mv - h.totalCost;
        const pp2 = (pnl/h.totalCost)*100;
        const cls = pnl>=0?'green':'red';
        return `<tr><td><strong>${sym}</strong></td><td>${fmtN(h.shares)}</td><td>$${h.avgCost.toFixed(2)}</td><td>$${s.price.toFixed(2)}</td><td>$${mv.toFixed(2)}</td><td class="${cls}">${fmtS(pnl)} (${fmtPct(pp2)})</td></tr>`;
    });
    tbody.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="6" class="sim-table-empty">No open positions</td></tr>';
}

function renderTradeHistory() {
    const el = $('simTradeHistory'); if(!el) return;
    const trades = STATE.portfolio.trades.slice(0,30);
    if (!trades.length) { el.innerHTML='<div class="sim-tape-empty">No trades yet</div>'; return; }
    el.innerHTML = trades.map(t=>{
        const pnlHtml = t.pnl!=null ? `<span class="${t.pnl>=0?'green':'red'}" style="color:${t.pnl>=0?'#10B981':'#EF4444'}">${fmtS(t.pnl)}</span>` : '-';
        return `<div class="sim-trade-row ${t.side}"><span class="sim-trade-time">${t.date}</span><span class="sim-trade-badge ${t.side}">${t.side.toUpperCase()}</span><span><strong>${t.symbol}</strong></span><span style="font-family:'Courier New',monospace;font-size:0.75rem;">${fmtN(t.qty)} @ $${t.price.toFixed(2)}</span><span>${pnlHtml}</span></div>`;
    }).join('');
}

function renderNews() {
    const el = $('simNewsFeed'); if(!el) return;
    if (!STATE.newsQueue.length) { el.innerHTML='<div class="sim-tape-empty">Awaiting market events…</div>'; return; }
    el.innerHTML = STATE.newsQueue.map(n=>{
        const cls = n.impact>=0?'positive':'negative';
        return `<div class="sim-news-row ${cls}"><span class="sim-news-time">${n.time}</span><span>${n.impact>=0?'📈':'📉'}</span><span class="sim-news-text">${n.sym?`<span class="sim-news-sym">${n.sym}</span> - `:''} ${n.text.replace('[SYM]','').trim()}</span></div>`;
    }).join('');
}

function renderAchievements() {
    const el = $('simAchievementGrid'); if(!el) return;
    el.innerHTML = ACHIEVEMENTS.map(a=>{
        const un = STATE.portfolio.achievements.has(a.id);
        return `<div class="sim-ach-badge${un?' unlocked':''}" data-tip="${a.desc}"><span class="sim-ach-badge-icon">${a.icon}</span><span class="sim-ach-badge-title">${a.title}</span></div>`;
    }).join('');
}

function renderPendingOrders() {
    const el = $('simPendingOrders'); if(!el) return;
    const orders = STATE.pendingOrders;
    updatePendingCount();
    if (!orders.length) { el.innerHTML='<div class="sim-tape-empty">No pending orders</div>'; return; }
    el.innerHTML = orders.map((o,i)=>`<div class="sim-pending-row"><span class="sim-trade-badge ${o.side}">${o.type.toUpperCase()} ${o.side.toUpperCase()}</span><span style="font-size:0.78rem;font-family:'Courier New',monospace;"><strong>${o.symbol}</strong> ×${fmtN(o.qty)} @ ${fmt(o.limitPrice)}</span><button class="sim-cancel-btn" onclick="cancelOrder(${i})">✕ Cancel</button></div>`).join('');
}

function updatePendingCount() {
    const el = $('simPendingCount');
    const n  = STATE.pendingOrders.length;
    if (!el) return;
    el.style.display = n>0 ? 'inline' : 'none';
    el.textContent   = n;
}

function updateEstimate() {
    const el = $('simEstVal'); if(!el) return;
    const qty = parseInt($('simShares')?.value)||0;
    if (qty<=0) { el.textContent='-'; return; }
    const stock = STATE.stocks[STATE.active];
    const book  = generateBook(stock.price, stock.vol);
    let ep;
    if (orderType==='market') ep = orderSide==='buy'?book.bestAsk:book.bestBid;
    else if (orderType==='limit') ep = parseFloat($('simLimitPrice')?.value)||0;
    else ep = parseFloat($('simStopPrice')?.value)||0;
    el.textContent = ep>0 ? `${fmt(ep*qty)} (${fmtN(qty)} × ${fmt(ep)})` : '-';
}

function simulateBgTrades() {
    Object.keys(STOCK_DEFS).forEach(sym=>{
        if (Math.random()<0.4) return;
        const s  = STATE.stocks[sym];
        const bk = generateBook(s.price, s.vol);
        const sd = Math.random()<0.5?'buy':'sell';
        const qt = Math.floor(10+Math.random()*600);
        addTapeRow(sym, sd==='buy'?bk.bestAsk:bk.bestBid, qt, sd, false);
        s.dayVolume += qt;
    });
}

function updateMarketTime() {
    const el = $('simMarketTime');
    if (el) el.textContent = new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    setText('simTickCount', `Tick ${STATE.tickCount.toLocaleString()}`);
}

// ── Tooltip system ────────────────────────────────────────────────────────────
function initTooltips() {
    const tip = document.createElement('div');
    tip.id = 'simTooltip'; tip.className = 'sim-tooltip'; document.body.appendChild(tip);

    let active = null;
    document.addEventListener('mouseover', e=>{
        const el = e.target.closest('[data-tip]');
        if (!el) { tip.style.display='none'; active=null; return; }
        active = el;
        tip.textContent = el.dataset.tip;
        tip.style.display = 'block';
    });
    document.addEventListener('mousemove', e=>{
        if (!active||tip.style.display==='none') return;
        const x = e.clientX+14, y = e.clientY+14;
        tip.style.left = Math.min(x, window.innerWidth-tip.offsetWidth-8)+'px';
        tip.style.top  = Math.min(y, window.innerHeight-tip.offsetHeight-8)+'px';
    });
    document.addEventListener('mouseout', e=>{
        if (active && !active.contains(e.relatedTarget)) { tip.style.display='none'; active=null; }
    });
}

// ── UI wiring ─────────────────────────────────────────────────────────────────
function wireUI() {
    // Stock tabs
    document.querySelectorAll('.sim-stock-tab').forEach(btn=>{
        btn.addEventListener('click',()=>{
            document.querySelectorAll('.sim-stock-tab').forEach(b=>b.classList.remove('active'));
            btn.classList.add('active');
            STATE.active = btn.dataset.sym;
            priceCtx = setupCanvas('simPriceChart');
        });
    });

    // Buy/Sell tabs
    document.querySelectorAll('.sim-tab').forEach(btn=>{
        btn.addEventListener('click',()=>{
            document.querySelectorAll('.sim-tab').forEach(b=>b.classList.remove('active'));
            btn.classList.add('active');
            orderSide = btn.dataset.side;
            const pb = $('simPlaceBtn');
            if (pb) { pb.textContent = orderSide==='buy'?'Buy Shares':'Sell Shares'; pb.style.background=orderSide==='buy'?'':'#EF4444'; }
            updateEstimate();
        });
    });

    // Order type tabs
    document.querySelectorAll('.sim-type-tab').forEach(btn=>{
        btn.addEventListener('click',()=>{
            document.querySelectorAll('.sim-type-tab').forEach(b=>b.classList.remove('active'));
            btn.classList.add('active');
            orderType = btn.dataset.type;
            const lg=$('simLimitPriceGroup'), sg=$('simStopPriceGroup');
            if (lg) lg.style.display = orderType==='limit'?'':'none';
            if (sg) sg.style.display = orderType==='stop'?'':'none';
            updateEstimate();
        });
    });

    $('simShares')?.addEventListener('input', updateEstimate);
    $('simLimitPrice')?.addEventListener('input', updateEstimate);
    $('simStopPrice')?.addEventListener('input', updateEstimate);

    // Enter key on inputs
    ['simShares','simLimitPrice','simStopPrice'].forEach(id=>{
        $(id)?.addEventListener('keydown', e=>{ if(e.key==='Enter') window.placeOrder(); });
    });

    // Reset
    $('simResetBtn')?.addEventListener('click',()=>{
        if (!confirm('Reset your entire portfolio and start fresh with $10,000?')) return;
        const p = STATE.portfolio;
        p.cash=STARTING_CASH; p.holdings={}; p.trades=[]; p.equity=[]; p.achievements=new Set();
        STATE.pendingOrders=[]; STATE.limitFills=0;
        localStorage.removeItem(SAVE_KEY);
        renderPortfolio(); renderTradeHistory(); renderAchievements(); renderPendingOrders(); renderNews();
        if (equityCtx) { equityCtx.clearRect(0,0,equityCtx._w,equityCtx._h); }
        showMsg('success','Portfolio reset! Starting fresh with $10,000.');
    });

    // Resize handler (debounced)
    let rTimer;
    window.addEventListener('resize',()=>{
        clearTimeout(rTimer);
        rTimer = setTimeout(()=>{
            priceCtx  = setupCanvas('simPriceChart');
            equityCtx = setupCanvas('simEquityChart');
        }, 250);
    });
}

// ── Main update loop ──────────────────────────────────────────────────────────
function update() {
    STATE.tickCount++;

    // Price simulation - fire news occasionally
    const news = maybeFireNews();
    Object.keys(STOCK_DEFS).forEach(sym => tickStock(sym));

    // Active stock book
    const active = STATE.stocks[STATE.active];
    const book   = generateBook(active.price, active.vol);

    // Render all the things
    updateMarketTime();
    renderTickerBar();
    renderStockTabs();
    renderPriceCard(book);
    renderBook(book);
    drawPriceChart(priceCtx, active);

    // Background market activity
    simulateBgTrades();

    // Check pending orders
    checkPendingOrders();

    // Portfolio equity tracking (bounded)
    const eq = STATE.portfolio.equity;
    eq.push({ tick:STATE.tickCount, value:portfolioValue() });
    if (eq.length > MAX_EQUITY_PTS) eq.shift();

    drawEquityChart(equityCtx, eq);
    renderPortfolio();
    updateEstimate();

    // Less frequent renders
    if (STATE.tickCount % 3 === 0) { renderTradeHistory(); renderPendingOrders(); }
    if (news) renderNews();
    if (STATE.tickCount % 5 === 0) { renderAchievements(); saveState(); }
}

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
    // Build all stock state
    Object.keys(STOCK_DEFS).forEach(sym => { STATE.stocks[sym] = initStock(sym); });

    // Seed history - run 150 silent ticks to warm up
    for (let i=0; i<150; i++) Object.keys(STOCK_DEFS).forEach(sym => tickStock(sym));

    // Restore from localStorage
    loadState();

    // Setup canvases (after DOM is laid out)
    requestAnimationFrame(()=>{
        priceCtx  = setupCanvas('simPriceChart');
        equityCtx = setupCanvas('simEquityChart');

        // Wire UI & tooltips
        wireUI();
        initTooltips();

        // Initial renders
        renderAchievements();
        renderPendingOrders();
        renderTradeHistory();
        renderNews();

        // First tick
        update();

        // Start main loop
        mainLoopId = setInterval(update, TICK_MS);
    });

    // ── Page Visibility API - pause loop when tab is hidden (infinite runtime) ─
    document.addEventListener('visibilitychange', ()=>{
        if (document.hidden) {
            clearInterval(mainLoopId);
            mainLoopId = null;
        } else {
            if (!mainLoopId) {
                update();
                mainLoopId = setInterval(update, TICK_MS);
            }
        }
    });
}

// Boot
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();