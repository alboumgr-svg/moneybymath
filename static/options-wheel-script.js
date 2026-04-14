// ─────────────────────────────────────────────────────────────────────────────
//  MoneyByMath - Options Wheel Strategy Simulator
//  Live simulation: GBM price · Black-Scholes pricing · Wheel state machine
//  Memory-safe · localStorage persistence · Page Visibility pause
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// ── CSS Injection ─────────────────────────────────────────────────────────────
(function injectCSS() {
    const s = document.createElement('style');
    s.textContent = `
/* ── Simulator shell ─────────────────────────────────────────────────── */
.whl-statusbar{display:flex;align-items:center;gap:10px;margin-bottom:1.25rem;padding:0.5rem 0;flex-wrap:wrap;}
.whl-live-dot{width:9px;height:9px;border-radius:50%;background:#10B981;animation:whlBlink 1.4s infinite;flex-shrink:0;}
@keyframes whlBlink{0%,100%{opacity:1}50%{opacity:0.15}}
.whl-live-label{font-size:0.72rem;font-weight:700;color:#10B981;text-transform:uppercase;letter-spacing:0.06em;}
.whl-day-label{font-size:0.72rem;color:var(--text-muted);font-family:'Courier New',monospace;}
.whl-statusbar-right{margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.whl-speed-label{font-size:0.72rem;color:var(--text-muted);}
.whl-speed-tabs{display:flex;border-radius:6px;overflow:hidden;border:1px solid var(--border);}
.whl-speed-tab{background:transparent;border:none;border-right:1px solid var(--border);padding:0.25rem 0.65rem;font-size:0.72rem;font-weight:600;cursor:pointer;color:var(--text-muted);transition:all 0.2s;}
.whl-speed-tab:last-child{border-right:none;}
.whl-speed-tab.active{background:#3b82f6;color:#fff;}
.whl-pause-btn,.whl-reset-btn{background:transparent;border:1px solid var(--border);color:var(--text-muted);font-size:0.72rem;font-weight:600;padding:0.28rem 0.7rem;border-radius:6px;cursor:pointer;transition:all 0.2s;}
.whl-pause-btn:hover{border-color:#3b82f6;color:#3b82f6;}
.whl-reset-btn:hover{border-color:#EF4444;color:#EF4444;}

/* ── Stock tabs ──────────────────────────────────────────────────────── */
.whl-stock-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:0;border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:1.5rem;}
.whl-stock-tab{background:transparent;border:none;border-right:1px solid var(--border);padding:0.85rem 0.75rem;cursor:pointer;display:flex;flex-direction:column;align-items:flex-start;gap:2px;transition:background 0.2s;}
.whl-stock-tab:last-child{border-right:none;}
.whl-stock-tab:hover{background:var(--bg-alt,rgba(255,255,255,0.04));}
.whl-stock-tab.active{background:rgba(59,130,246,0.1);border-bottom:3px solid #3b82f6;}
.whl-tab-sym{font-size:1rem;font-weight:800;color:var(--text-primary);font-family:'Courier New',monospace;}
.whl-tab-name{font-size:0.7rem;color:var(--text-secondary);}
.whl-tab-meta{font-size:0.65rem;color:var(--text-muted);}
@media(max-width:600px){.whl-stock-tabs{grid-template-columns:1fr;}.whl-stock-tab{border-right:none;border-bottom:1px solid var(--border);}}

/* ── Main grid ───────────────────────────────────────────────────────── */
.whl-main-grid{display:grid;grid-template-columns:1fr 1.7fr;gap:1.5rem;margin-bottom:1.5rem;}
.whl-position-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1.5rem;margin-bottom:1.5rem;}
.whl-charts-row{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;}
@media(max-width:900px){.whl-main-grid,.whl-position-grid,.whl-charts-row{grid-template-columns:1fr;}}

/* ── Diagram card ────────────────────────────────────────────────────── */
.whl-diagram-card{display:flex;flex-direction:column;}
.whl-phase-desc{text-align:center;padding:0.75rem 0 0.25rem;}
.whl-phase-title{font-size:0.95rem;font-weight:700;color:var(--text-primary);}
.whl-phase-sub{font-size:0.78rem;color:var(--text-muted);margin-top:3px;min-height:1.1em;}

/* ── Price chart header ──────────────────────────────────────────────── */
.whl-chart-header{display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:0.5rem;}
.whl-ticker-badge{background:linear-gradient(135deg,#3b82f6,#6366f1);color:#fff;font-weight:800;font-size:0.95rem;letter-spacing:0.05em;padding:0.2rem 0.6rem;border-radius:6px;font-family:'Courier New',monospace;}
.whl-stock-name-label{font-weight:700;color:var(--text-primary);font-size:0.9rem;}
.whl-price-big{font-size:1.6rem;font-weight:800;color:var(--text-primary);font-family:'Courier New',monospace;}
.whl-price-chg{font-size:0.80rem;font-weight:600;}
.whl-price-chg.up{color:#10B981;}.whl-price-chg.down{color:#EF4444;}
.whl-legend-col{display:flex;flex-direction:column;gap:2px;font-size:0.8rem;font-weight:600;text-align:right;}
@media(max-width:900px){.whl-legend-col{font-size:0.55rem;}}
.whl-leg-item{white-space:nowrap;}
.whl-dte-row{display:flex;align-items:center;gap:10px;margin-top:8px;}
.whl-dte-label{font-size:0.72rem;color:var(--text-muted);white-space:nowrap;}
.whl-dte-track{flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden;}
.whl-dte-fill{height:100%;border-radius:3px;background:#3b82f6;transition:width 0.6s ease;}
.whl-chart-sub{font-size:0.75rem;color:var(--text-muted);margin-bottom:0.5rem;}

/* ── Position grid ───────────────────────────────────────────────────── */
.whl-pos-grid{display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;}
.whl-acct-grid{display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;}
.whl-pos-box,.whl-acct-box{background:var(--bg-alt,rgba(0,0,0,0.12));border-radius:8px;padding:0.6rem 0.65rem;}
.whl-pos-label{font-size:0.6rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);font-weight:700;margin-bottom:3px;display:flex;align-items:center;gap:3px;cursor:default;}
.whl-pos-val{font-size:0.92rem;font-weight:800;color:var(--text-primary);font-family:'Courier New',monospace;}
.whl-acct-val{font-size:0.95rem;font-weight:800;color:var(--text-primary);font-family:'Courier New',monospace;margin-top:3px;}

/* ── Settings ────────────────────────────────────────────────────────── */
.whl-setting-group{margin-bottom:0.85rem;}
.whl-setting-label{display:flex;align-items:center;gap:4px;font-size:0.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.35rem;cursor:default;}
.whl-setting-input{width:100%;box-sizing:border-box;padding:0.5rem 0.65rem;border-radius:8px;border:1px solid var(--border);background:var(--bg-alt,rgba(0,0,0,0.18));color:var(--text-primary);font-size:0.95rem;font-family:'Courier New',monospace;outline:none;transition:border-color 0.2s;}
.whl-setting-input:focus{border-color:#3b82f6;}
.whl-input-row{display:flex;align-items:center;gap:8px;}
.whl-setting-hint{font-size:0.72rem;color:#10B981;font-family:'Courier New',monospace;white-space:nowrap;}
.whl-tip-dot{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;background:var(--border);color:var(--text-muted);font-size:0.6rem;font-weight:700;cursor:help;flex-shrink:0;}

/* ── Event Log ───────────────────────────────────────────────────────── */
.whl-log-wrap{overflow-x:auto;}
.whl-log-header-row{display:grid;grid-template-columns:55px 130px 1fr 90px 100px;min-width:520px; ...rest unchanged...}
.whl-log-scroll{max-height:280px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;min-width:520px;}
.whl-log-empty{text-align:center;color:var(--text-muted);padding:1.5rem;font-size:0.825rem;}
.whl-log-row{display:grid;grid-template-columns:55px 130px 1fr 90px 100px;align-items:center;padding:0.3rem 0.5rem;border-radius:5px;font-size:0.75rem;animation:whlFadeIn 0.3s ease;}
.whl-log-row.sell-put{background:rgba(239,68,68,0.07);}
.whl-log-row.expired-otm{background:rgba(16,185,129,0.07);}
.whl-log-row.assigned{background:rgba(245,158,11,0.1);}
.whl-log-row.sell-call{background:rgba(59,130,246,0.07);}
.whl-log-row.called-away{background:rgba(139,92,246,0.1);}
.whl-log-row.reset-csp{background:rgba(16,185,129,0.05);}
.whl-log-day{font-family:'Courier New',monospace;color:var(--text-muted);font-size:0.68rem;}
.whl-log-event{font-weight:700;font-size:0.72rem;}
.whl-log-detail{color:var(--text-secondary);font-size:0.72rem;}
.whl-log-premium{font-family:'Courier New',monospace;font-weight:700;color:#10B981;text-align:right;}
.whl-log-total{font-family:'Courier New',monospace;font-weight:700;text-align:right;color:var(--text-primary);}
.whl-log-badge{display:inline-block;padding:0.08rem 0.45rem;border-radius:4px;font-size:0.65rem;font-weight:700;}
.whl-log-badge.sell-put{background:rgba(239,68,68,0.2);color:#EF4444;}
.whl-log-badge.expired-otm{background:rgba(16,185,129,0.2);color:#10B981;}
.whl-log-badge.assigned{background:rgba(245,158,11,0.2);color:#F59E0B;}
.whl-log-badge.sell-call{background:rgba(59,130,246,0.2);color:#3b82f6;}
.whl-log-badge.called-away{background:rgba(139,92,246,0.2);color:#8B5CF6;}

/* ── Calculator section ──────────────────────────────────────────────── */
.whl-calc-strategy-row{display:flex;gap:0;border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:1.5rem;}
.whl-calc-strategy-row .strategy-btn{flex:1;border:none;border-right:1px solid var(--border);}
.whl-calc-strategy-row .strategy-btn:last-child{border-right:none;}

/* ── Tooltip ─────────────────────────────────────────────────────────── */
#whlTooltip{position:fixed;z-index:10000;background:rgba(15,23,42,0.97);color:#e2e8f0;font-size:0.78rem;line-height:1.5;padding:0.5rem 0.75rem;border-radius:8px;border:1px solid rgba(255,255,255,0.1);max-width:280px;pointer-events:none;box-shadow:0 4px 20px rgba(0,0,0,0.5);display:none;}
.inline-tip{border-bottom:1px dashed var(--text-muted);cursor:help;}

/* ── Notification toasts ─────────────────────────────────────────────── */
.whl-toast{position:fixed;bottom:24px;right:24px;z-index:9999;padding:0.9rem 1.2rem;border-radius:10px;font-size:0.85rem;font-weight:600;color:#fff;box-shadow:0 6px 24px rgba(0,0,0,0.35);transform:translateY(20px);opacity:0;transition:all 0.35s cubic-bezier(0.34,1.56,0.64,1);max-width:340px;display:flex;align-items:center;gap:10px;}
.whl-toast.show{transform:none;opacity:1;}
.whl-toast.premium{background:linear-gradient(135deg,#059669,#10B981);}
.whl-toast.assigned{background:linear-gradient(135deg,#B45309,#F59E0B);}
.whl-toast.called{background:linear-gradient(135deg,#5B21B6,#8B5CF6);}
.whl-toast.info{background:linear-gradient(135deg,#1D4ED8,#3b82f6);}

/* ── Phase glow animations ────────────────────────────────────────────── */
@keyframes whlFadeIn{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}
@keyframes whlGlow{0%,100%{box-shadow:0 0 0 rgba(16,185,129,0)}50%{box-shadow:0 0 16px rgba(16,185,129,0.4)}}
`;
    document.head.appendChild(s);
})();

// ── Constants ─────────────────────────────────────────────────────────────────
const STARTING_CASH    = 10000;
const SAVE_KEY         = 'mbm_wheel_v2';
const MAX_PRICE_HIST   = 252;   // 1 trading year
const MAX_EQUITY_PTS   = 500;
const MAX_LOG_DOM      = 40;
const MAX_INCOME_BARS  = 30;
const SPEEDS           = { slow:2000, normal:700, fast:200, turbo:60 };

// ── Stock Definitions ─────────────────────────────────────────────────────────
const STOCKS = {
    MMBX: { name:'MoneyByMath Corp',   startPrice:100, annualVol:0.25, drift:0.05 },
    GSTK: { name:'GreenStone Holdings', startPrice:75,  annualVol:0.16, drift:0.03 },
    HIVE: { name:'HiveChain Energy',    startPrice:42,  annualVol:0.48, drift:0.02 },
};

// ── Application State ─────────────────────────────────────────────────────────
const SIM = {
    sym:         'MMBX',
    price:       100,
    prevClose:   100,
    dayOpen:     100,
    priceHistory:[100],
    tradingDay:  0,

    // Settings
    contracts:   1,
    putOtmPct:   5,
    callOtmPct:  5,
    dteSetting:  14,

    // Wheel state machine
    phase:       'csp',    // 'csp' | 'cc'
    dte:         14,       // days remaining
    dteMax:      14,
    putStrike:   0,
    callStrike:  0,
    costBasis:   0,        // effective cost basis (strike - put premium received)
    sharesHeld:  0,
    positionPremium: 0,    // premium from current open option
    totalPremiumCollected: 0,
    realizedGains: 0,
    assignments: 0,
    cyclesDone:  0,
    cash:        STARTING_CASH,

    // Income per completed cycle
    incomeCycles: [],    // [{premium, gain, label}]

    // Equity over time
    equity:      [],     // [{day, value}]

    // Log entries
    logEntries:  [],

    // Control
    paused:      false,
    tickCount:   0,
    loopId:      null,
    speed:       'normal',

    // Notify cooldown
    lastToast:   '',
};

// ── Utility ──────────────────────────────────────────────────────────────────
function randn() {
    let u=0, v=0;
    while(!u) u=Math.random();
    while(!v) v=Math.random();
    return Math.sqrt(-2*Math.log(u)) * Math.cos(2*Math.PI*v);
}
const clamp  = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
const fmt    = n => '$'+Math.abs(+n).toFixed(2);
const fmtS   = n => (n>=0?'+':'-')+'$'+Math.abs(+n).toFixed(2);
const fmtPct = n => (n>=0?'+':'')+n.toFixed(2)+'%';
const $      = id => document.getElementById(id);
const setText= (id,t) => { const e=$(id); if(e) e.textContent=t; };

// ── Black-Scholes (European, no dividends) ────────────────────────────────────
function normCDF(x) {
    const t = 1/(1+0.2316419*Math.abs(x));
    const poly = t*(0.319381530+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));
    const r = 1 - (1/Math.sqrt(2*Math.PI))*Math.exp(-x*x/2)*poly;
    return x>=0 ? r : 1-r;
}

function blackScholes(spot, strike, dte, annualVol, isCall) {
    const T = dte / 365;
    if (T <= 0) {
        if (isCall) return Math.max(0, spot - strike);
        return Math.max(0, strike - spot);
    }
    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(spot/strike) + 0.5*annualVol*annualVol*T) / (annualVol*sqrtT);
    const d2 = d1 - annualVol*sqrtT;
    if (isCall) return Math.max(0.01, spot*normCDF(d1) - strike*normCDF(d2));
    return Math.max(0.01, strike*normCDF(-d2) - spot*normCDF(-d1));
}

// ── Price simulation ──────────────────────────────────────────────────────────
function tickPrice() {
    const st  = STOCKS[SIM.sym];
    const vol = st.annualVol / Math.sqrt(252);
    const mu  = st.drift    / 252;
    const old = SIM.price;

    // Mean-reversion: gentle pull back toward startPrice when price drifts too far.
    // Strength scales with how far the price has deviated (as a fraction of startPrice).
    const deviation = (SIM.price - st.startPrice) / st.startPrice;
    const reversion = -0.04 * deviation; // 4% reversion force per daily unit of deviation

    SIM.price = parseFloat((SIM.price * Math.exp(mu + reversion + vol*randn())).toFixed(2));
    // Hard clamp: price can never go below 50% or above 200% of the start price
    SIM.price = clamp(SIM.price, st.startPrice * 0.50, st.startPrice * 2.0);
    SIM.prevClose = old;

    SIM.priceHistory.push(SIM.price);
    if (SIM.priceHistory.length > MAX_PRICE_HIST) SIM.priceHistory.shift();
    SIM.tradingDay++;
    SIM.dte = Math.max(0, SIM.dte - 1);
}

// ── Wheel State Machine ───────────────────────────────────────────────────────
function initCSPPhase(noReset=false) {
    const st   = STOCKS[SIM.sym];
    const spot = SIM.price;
    const otm  = SIM.putOtmPct / 100;
    SIM.putStrike = parseFloat((spot * (1 - otm)).toFixed(2));
    SIM.dteMax    = SIM.dteSetting;
    SIM.dte       = SIM.dteSetting;
    SIM.phase     = 'csp';
    SIM.sharesHeld= 0;
    SIM.costBasis = 0;
    SIM.callStrike= 0;

    // Calculate put premium via Black-Scholes
    const putPrem = blackScholes(spot, SIM.putStrike, SIM.dte, st.annualVol, false);
    SIM.positionPremium = parseFloat((putPrem * 100 * SIM.contracts).toFixed(2));

    // Collect premium into cash
    SIM.totalPremiumCollected += SIM.positionPremium;
    SIM.cash += SIM.positionPremium;

    addLog('sell-put', `Sold ${SIM.contracts}x CSP`,
        `Strike ${fmt(SIM.putStrike)} · ${SIM.dte}DTE`,
        SIM.positionPremium, SIM.totalPremiumCollected + SIM.realizedGains);

    showToast(`Sold put @ ${fmt(SIM.putStrike)} · Collected ${fmt(SIM.positionPremium)}`, 'premium');
}

function handleCSPExpiration() {
    if (SIM.price < SIM.putStrike) {
        // ── ASSIGNED ──────────────────────────────────────────────────────
        SIM.assignments++;
        SIM.sharesHeld = 100 * SIM.contracts;
        // Cost basis = strike minus put premium already collected
        const putPremPerShare = SIM.positionPremium / (100 * SIM.contracts);
        SIM.costBasis = parseFloat((SIM.putStrike - putPremPerShare).toFixed(2));
        // Cash out: we pay for shares
        SIM.cash -= SIM.putStrike * 100 * SIM.contracts;

        addLog('assigned', `Assigned ${SIM.sharesHeld} shares`,
            `Bought @ ${fmt(SIM.putStrike)} · Cost basis ${fmt(SIM.costBasis)}`,
            0, SIM.totalPremiumCollected + SIM.realizedGains);

        showToast(`Assigned ${SIM.sharesHeld} shares @ ${fmt(SIM.putStrike)} · Basis ${fmt(SIM.costBasis)}`, 'assigned');
        initCCPhase();
    } else {
        // ── EXPIRED OTM - premium kept, sell another put ──────────────────
        SIM.cyclesDone++;
        SIM.incomeCycles.push({ premium: SIM.positionPremium, gain:0, label:`C${SIM.cyclesDone}` });
        if (SIM.incomeCycles.length > MAX_INCOME_BARS) SIM.incomeCycles.shift();

        addLog('expired-otm', `Put expired OTM`,
            `Price ${fmt(SIM.price)} > Strike ${fmt(SIM.putStrike)} · Premium kept`,
            SIM.positionPremium, SIM.totalPremiumCollected + SIM.realizedGains);

        showToast(`Put expired worthless! Kept ${fmt(SIM.positionPremium)} premium`, 'premium');
        initCSPPhase();
    }
}

function initCCPhase() {
    const st   = STOCKS[SIM.sym];
    const otm  = SIM.callOtmPct / 100;
    SIM.callStrike = parseFloat((SIM.costBasis * (1 + otm)).toFixed(2));
    SIM.dteMax     = SIM.dteSetting;
    SIM.dte        = SIM.dteSetting;
    SIM.phase      = 'cc';

    const callPrem = blackScholes(SIM.price, SIM.callStrike, SIM.dte, st.annualVol, true);
    SIM.positionPremium = parseFloat((callPrem * 100 * SIM.contracts).toFixed(2));

    SIM.totalPremiumCollected += SIM.positionPremium;
    SIM.cash += SIM.positionPremium;

    addLog('sell-call', `Sold ${SIM.contracts}x CC`,
        `Strike ${fmt(SIM.callStrike)} · ${SIM.dte}DTE · Basis ${fmt(SIM.costBasis)}`,
        SIM.positionPremium, SIM.totalPremiumCollected + SIM.realizedGains);

    showToast(`Sold call @ ${fmt(SIM.callStrike)} · Collected ${fmt(SIM.positionPremium)}`, 'info');
}

function handleCCExpiration() {
    if (SIM.price > SIM.callStrike) {
        // ── CALLED AWAY ───────────────────────────────────────────────────
        const saleProceeds = SIM.callStrike * 100 * SIM.contracts;
        const stockCost    = SIM.costBasis  * 100 * SIM.contracts;
        const stockGain    = saleProceeds - stockCost;
        SIM.realizedGains += stockGain;
        SIM.cash += saleProceeds;
        SIM.sharesHeld = 0;

        const cycleTotal = SIM.positionPremium + stockGain;
        SIM.cyclesDone++;
        SIM.incomeCycles.push({ premium: SIM.positionPremium, gain: stockGain, label:`C${SIM.cyclesDone}` });
        if (SIM.incomeCycles.length > MAX_INCOME_BARS) SIM.incomeCycles.shift();

        addLog('called-away', `Shares called away`,
            `Sold ${SIM.sharesHeld+100*SIM.contracts} @ ${fmt(SIM.callStrike)} · Gain ${fmtS(stockGain)}`,
            SIM.positionPremium, SIM.totalPremiumCollected + SIM.realizedGains);

        showToast(`Shares called away @ ${fmt(SIM.callStrike)} · Stock gain ${fmtS(stockGain)}`, 'called');
        initCSPPhase();
    } else {
        // ── CC EXPIRED OTM - keep shares, sell another call ───────────────
        addLog('expired-otm', `Call expired OTM`,
            `Price ${fmt(SIM.price)} < Strike ${fmt(SIM.callStrike)} · Kept shares + premium`,
            SIM.positionPremium, SIM.totalPremiumCollected + SIM.realizedGains);

        showToast(`Call expired worthless! Kept ${fmt(SIM.positionPremium)} + shares`, 'premium');
        SIM.incomeCycles.push({ premium: SIM.positionPremium, gain:0, label:`C${SIM.cyclesDone+1}` });
        if (SIM.incomeCycles.length > MAX_INCOME_BARS) SIM.incomeCycles.shift();
        SIM.cyclesDone++;
        initCCPhase();
    }
}

// ── Portfolio Value ───────────────────────────────────────────────────────────
function portfolioValue() {
    const stockVal = SIM.sharesHeld * SIM.price;
    // Cash includes collateral held for CSP (putStrike * shares) minus stock cost if assigned
    return SIM.cash + stockVal;
}

// ── Main simulation tick ──────────────────────────────────────────────────────
function tick() {
    tickPrice();
    SIM.tickCount++;

    if (SIM.dte === 0) {
        if (SIM.phase === 'csp') handleCSPExpiration();
        else handleCCExpiration();
    }

    // Equity tracking (bounded)
    const val = portfolioValue();
    SIM.equity.push({ day: SIM.tradingDay, value: val });
    if (SIM.equity.length > MAX_EQUITY_PTS) SIM.equity.shift();

    // Update all renders
    render();

    // Auto-save every 15 ticks
    if (SIM.tickCount % 15 === 0) saveState();
}

// ── Canvas setup ──────────────────────────────────────────────────────────────
function setupCanvas(id) {
    const canvas = $(id);
    if (!canvas) return null;
    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W    = Math.max(rect.width || 500, 200);
    const H    = parseInt(canvas.dataset.h) || 200;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx._w = W; ctx._h = H;
    return ctx;
}

let priceCtx   = null;
let diagramCtx = null;
let incomeCtx  = null;
let equityCtx  = null;

// ── Draw Wheel Diagram (canvas donut) ─────────────────────────────────────────
const PHASES_DEF = [
    { id:'csp',        label:'Sell Put',      icon: '', color:'#EF4444', bgAlpha:0.12,
      title:'Phase 1: Selling Cash-Secured Put',
      sub:'Collecting premium · Waiting for expiration' },
    { id:'assigned',   label:'Assigned',      icon: '', color:'#F59E0B', bgAlpha:0.12,
      title:'Assignment Event',
      sub:'Stock fell below strike · You now own shares' },
    { id:'cc',         label:'Sell Call',      icon: '', color:'#3b82f6', bgAlpha:0.12,
      title:'Phase 3: Selling Covered Call',
      sub:'Collecting premium on shares you own' },
    { id:'called_away',label:'Called Away',    icon: '', color:'#8B5CF6', bgAlpha:0.12,
      title:'Shares Called Away',
      sub:'Sold at call strike · Starting new cycle' },
];

// Map SIM.phase to a visual phase index (0–3)
function currentDiagramPhase() {
    if (SIM.phase === 'csp')  return 0;
    if (SIM.phase === 'cc')   return 2;
    return 2; // fallback
}

function drawWheelDiagram(ctx) {
    if (!ctx) return;
    const W=ctx._w, H=ctx._h;
    const cx=W/2, cy=H/2;
    const outerR = Math.min(W,H)*0.44;
    const innerR = outerR*0.52;
    const gap    = 0.03; // radians gap between segments
    const activePhase = currentDiagramPhase();

    ctx.clearRect(0,0,W,H);

    // Draw 4 segments (CSP top-right, Assigned bottom-right, CC bottom-left, Called Away top-left)
    // Starting angle: -PI/2 (top), going clockwise
    for (let i=0; i<4; i++) {
        const phase = PHASES_DEF[i];
        const start = -Math.PI/2 + i*(Math.PI/2) + gap/2;
        const end   = -Math.PI/2 + (i+1)*(Math.PI/2) - gap/2;
        const isActive = (i===activePhase);

        // Outer glow for active
        if (isActive) {
            ctx.save();
            ctx.shadowColor = phase.color;
            ctx.shadowBlur  = 18;
            ctx.beginPath();
            ctx.arc(cx,cy,outerR+4,start,end);
            ctx.arc(cx,cy,innerR-4,end,start,true);
            ctx.closePath();
            ctx.fillStyle = phase.color+'22';
            ctx.fill();
            ctx.restore();
        }

        // Main segment
        ctx.beginPath();
        ctx.arc(cx,cy,outerR,start,end);
        ctx.arc(cx,cy,innerR,end,start,true);
        ctx.closePath();
        ctx.fillStyle = isActive ? phase.color+'30' : phase.color+'14';
        ctx.fill();
        ctx.strokeStyle = isActive ? phase.color : phase.color+'55';
        ctx.lineWidth   = isActive ? 2.5 : 1;
        ctx.stroke();

        // Icon + label at mid-angle
        const midAngle = (start+end)/2;
        const iconR    = (outerR+innerR)/2;
        const ix = cx + iconR*Math.cos(midAngle);
        const iy = cy + iconR*Math.sin(midAngle);
        ctx.font = isActive ? `bold ${Math.min(20,outerR*0.18)}px sans-serif` : `${Math.min(17,outerR*0.16)}px sans-serif`;
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(phase.icon, ix, iy - 8);
        ctx.font = `${isActive?'bold ':''}${Math.min(11,outerR*0.1)}px sans-serif`;
        ctx.fillStyle = isActive ? phase.color : 'rgba(150,150,150,0.8)';
        ctx.fillText(phase.label, ix, iy);
    }

    // Center: show DTE or phase info
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle = 'var(--text-primary, #f1f5f9)';
    const cur = PHASES_DEF[activePhase];
    ctx.font = `bold ${Math.min(13,W*0.05)}px sans-serif`;
    ctx.fillStyle = cur.color;
    ctx.fillText(SIM.phase==='csp'?'SELL PUT':'SELL CALL', cx, cy-14);
    ctx.font = `${Math.min(11,W*0.04)}px monospace`;
    ctx.fillStyle = 'rgba(150,150,150,0.9)';
    ctx.fillText(`DTE: ${SIM.dte}`, cx, cy+2);
    ctx.font = `bold ${Math.min(18,W*0.06)}px monospace`;
    ctx.fillStyle = 'var(--text-primary, #f1f5f9)';
    const dPct = SIM.dteMax>0 ? Math.round((1-SIM.dte/SIM.dteMax)*100) : 0;
    ctx.fillText(`${dPct}%`, cx, cy+20);
}

// ── Draw Price Chart ──────────────────────────────────────────────────────────
function drawPriceChart(ctx) {
    if (!ctx) return;
    const W=ctx._w, H=ctx._h;
    ctx.clearRect(0,0,W,H);
    const data = SIM.priceHistory;
    if (data.length < 2) return;

    const pad = { t:10, r:58, b:24, l:10 };
    const cW  = W - pad.l - pad.r;
    const cH  = H - pad.t - pad.b;

    // Price range: use only the most recent 80 data points so the chart stays
    // zoomed-in and readable, then extend to include active strike/basis lines.
    const recentData = data.slice(-80);
    const strikes = [SIM.putStrike, SIM.costBasis, SIM.callStrike].filter(v=>v>0);
    const allVals  = [...recentData, ...strikes];
    const rawLo = Math.min(...allVals);
    const rawHi = Math.max(...allVals);
    // Enforce a minimum visible range of 15% of current price so labels never bunch up
    const minHalfSpan = SIM.price * 0.075;
    const lo = Math.min(rawLo * 0.975, SIM.price - minHalfSpan);
    const hi = Math.max(rawHi * 1.025, SIM.price + minHalfSpan);
    const rng= hi-lo||1;

    const xS = i => pad.l + (i/(data.length-1||1))*cW;
    const yS = v => pad.t + (1-(v-lo)/rng)*cH;

    // Grid + right-side labels
    ctx.font='9px monospace'; ctx.textAlign='left';
    for (let i=0;i<=4;i++) {
        const y = pad.t+(i/4)*cH;
        ctx.setLineDash([3,3]); ctx.strokeStyle='rgba(150,150,150,0.08)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(pad.l+cW,y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle='rgba(150,150,150,0.5)';
        ctx.fillText('$'+(hi-(i/4)*rng).toFixed(1), pad.l+cW+3, y+3);
    }

    // Shaded zones
    if (SIM.phase==='csp' && SIM.putStrike>0) {
        // Red zone below put strike (danger zone)
        const psy = yS(SIM.putStrike);
        ctx.fillStyle='rgba(239,68,68,0.06)';
        ctx.fillRect(pad.l, psy, cW, pad.t+cH-psy);
    }
    if (SIM.phase==='cc' && SIM.callStrike>0 && SIM.costBasis>0) {
        // Green profit zone between cost basis and call strike
        const cby = yS(SIM.costBasis);
        const csy = yS(SIM.callStrike);
        ctx.fillStyle='rgba(16,185,129,0.07)';
        ctx.fillRect(pad.l, csy, cW, cby-csy);
    }

    // Horizontal reference lines
    const hLines = [
        { val:SIM.putStrike,  color:'#EF4444', label:'Put Strike '+fmt(SIM.putStrike),    show: (SIM.phase === 'csp' && SIM.putStrike > 0) },
        { val:SIM.costBasis,  color:'#3b82f6', label:'Basis '+fmt(SIM.costBasis),  show: SIM.costBasis>0 },
        { val:SIM.callStrike, color:'#8B5CF6', label:'Call Strike '+fmt(SIM.callStrike),  show: SIM.callStrike>0 },
    ];
    hLines.forEach(hl=>{
        if (!hl.show || hl.val<=0) return;
        const hy=yS(hl.val);
        ctx.setLineDash([5,4]); ctx.strokeStyle=hl.color+'aa'; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.moveTo(pad.l,hy); ctx.lineTo(pad.l+cW,hy); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle=hl.color; ctx.font='bold 12px monospace'; ctx.textAlign='left';
        ctx.fillText(hl.label, pad.l+3, hy-3);
    });

    // Price area gradient
    const isUp = data[data.length-1] >= data[0];
    const lc   = isUp?'#10B981':'#EF4444';
    const grad = ctx.createLinearGradient(0,pad.t,0,pad.t+cH);
    grad.addColorStop(0, isUp?'rgba(16,185,129,0.25)':'rgba(239,68,68,0.25)');
    grad.addColorStop(1,'rgba(0,0,0,0)');
    ctx.beginPath();
    data.forEach((p,i)=>{ const x=xS(i),y=yS(p); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
    ctx.lineTo(xS(data.length-1),pad.t+cH); ctx.lineTo(pad.l,pad.t+cH); ctx.closePath();
    ctx.fillStyle=grad; ctx.fill();

    // Price line
    ctx.beginPath();
    data.forEach((p,i)=>{ const x=xS(i),y=yS(p); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
    ctx.strokeStyle=lc; ctx.lineWidth=2; ctx.stroke();

    // Current price marker
    const ly=yS(data[data.length-1]);
    ctx.fillStyle=lc;
    ctx.fillRect(pad.l+cW+1,ly-8,55,16);
    ctx.fillStyle='#fff'; ctx.font='bold 8px monospace'; ctx.textAlign='left';
    ctx.fillText('$'+data[data.length-1].toFixed(2), pad.l+cW+4, ly+3);

    // X axis label
    ctx.fillStyle='rgba(150,150,150,0.35)'; ctx.font='8px monospace'; ctx.textAlign='center';
    ctx.fillText('← trading days →', pad.l+cW/2, H-5);
}

// ── Draw Income Bar Chart ─────────────────────────────────────────────────────
function drawIncomeChart(ctx) {
    if (!ctx) return;
    const W=ctx._w, H=ctx._h;
    ctx.clearRect(0,0,W,H);
    // Always show only the most recent 12 cycles so bars stay wide and readable.
    // SIM.incomeCycles may hold up to MAX_INCOME_BARS - we just slice for display.
    const VISIBLE = 12;
    const cycles = SIM.incomeCycles.slice(-VISIBLE);
    if (!cycles.length) {
        ctx.font='12px sans-serif'; ctx.fillStyle='rgba(150,150,150,0.5)'; ctx.textAlign='center';
        ctx.fillText('Complete cycles will appear here', W/2, H/2); return;
    }

    const pad = { t:16, r:10, b:30, l:50 };
    const cW  = W - pad.l - pad.r;
    const cH  = H - pad.t - pad.b;
    const maxVal = Math.max(...cycles.map(c=>c.premium+Math.max(0,c.gain)), 0.01);
    const barW   = Math.max(4, (cW/cycles.length)*0.65);
    const gap    = (cW/cycles.length);

    // Y gridlines
    ctx.font='8px monospace'; ctx.textAlign='right';
    for (let i=0;i<=3;i++) {
        const y=pad.t+(i/3)*cH, v=maxVal*(1-i/3);
        ctx.setLineDash([2,3]); ctx.strokeStyle='rgba(150,150,150,0.08)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(pad.l+cW,y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle='rgba(150,150,150,0.5)';
        ctx.fillText('$'+v.toFixed(0), pad.l-3, y+3);
    }

    cycles.forEach((c,i)=>{
        const x    = pad.l + i*gap + (gap-barW)/2;
        const premH= (c.premium/maxVal)*cH;
        const gainH= (Math.max(0,c.gain)/maxVal)*cH;
        const total= premH+gainH;
        const topY = pad.t + cH - total;

        // Gain part (teal)
        if (c.gain>0) {
            ctx.fillStyle='rgba(16,185,129,0.6)';
            ctx.fillRect(x, topY, barW, gainH);
        }
        // Premium part (green)
        ctx.fillStyle='rgba(16,185,129,0.35)';
        ctx.fillRect(x, topY+gainH, barW, premH);
        ctx.strokeStyle='#10B981'; ctx.lineWidth=1;
        ctx.strokeRect(x, topY, barW, total);

        // Label
        ctx.fillStyle='rgba(150,150,150,0.7)'; ctx.font='7px monospace'; ctx.textAlign='center';
        ctx.fillText(c.label, x+barW/2, pad.t+cH+12);
    });

    // Axis labels
    ctx.fillStyle='rgba(150,150,150,0.5)'; ctx.font='8px monospace'; ctx.textAlign='center';
    ctx.fillText('Cycles', pad.l+cW/2, H-3);
}

// ── Draw Equity Chart ─────────────────────────────────────────────────────────
function drawEquityChart(ctx) {
    if (!ctx||SIM.equity.length<2) return;
    const W=ctx._w, H=ctx._h;
    ctx.clearRect(0,0,W,H);
    const vals = SIM.equity.map(e=>e.value);
    const pad  = { t:10, r:60, b:22, l:10 };
    const cW   = W-pad.l-pad.r;
    const cH   = H-pad.t-pad.b;
    const lo   = Math.min(...vals, STARTING_CASH)*0.99;
    const hi   = Math.max(...vals, STARTING_CASH)*1.01;
    const rng  = hi-lo||1;
    const xS   = i => pad.l+(i/(vals.length-1||1))*cW;
    const yS   = v => pad.t+(1-(v-lo)/rng)*cH;

    // Baseline
    const by=yS(STARTING_CASH);
    ctx.setLineDash([4,4]); ctx.strokeStyle='rgba(150,150,150,0.3)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(pad.l,by); ctx.lineTo(pad.l+cW,by); ctx.stroke(); ctx.setLineDash([]);
    ctx.font='8px monospace'; ctx.textAlign='left'; ctx.fillStyle='rgba(150,150,150,0.45)';
    ctx.fillText('$'+STARTING_CASH.toLocaleString(), pad.l+cW+3, by+3);

    // Y labels
    for (let i=0;i<=3;i++) {
        const y=pad.t+(i/3)*cH, v=hi-(i/3)*rng;
        ctx.fillStyle='rgba(150,150,150,0.45)'; ctx.fillText('$'+Math.round(v).toLocaleString(), pad.l+cW+3, y+3);
    }

    const last  = vals[vals.length-1];
    const isUp  = last>=STARTING_CASH;
    const lc    = isUp?'#10B981':'#EF4444';
    const grad  = ctx.createLinearGradient(0,pad.t,0,pad.t+cH);
    grad.addColorStop(0, isUp?'rgba(16,185,129,0.28)':'rgba(239,68,68,0.28)');
    grad.addColorStop(1,'rgba(0,0,0,0)');

    ctx.beginPath();
    vals.forEach((v,i)=>{ const x=xS(i),y=yS(v); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
    ctx.lineTo(xS(vals.length-1),pad.t+cH); ctx.lineTo(pad.l,pad.t+cH); ctx.closePath();
    ctx.fillStyle=grad; ctx.fill();

    ctx.beginPath();
    vals.forEach((v,i)=>{ const x=xS(i),y=yS(v); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
    ctx.strokeStyle=lc; ctx.lineWidth=2.5; ctx.stroke();

    const ly=yS(last);
    ctx.fillStyle=lc; ctx.fillRect(pad.l+cW+1,ly-8,58,16);
    ctx.fillStyle='#fff'; ctx.font='bold 8px monospace';
    ctx.fillText('$'+last.toFixed(0), pad.l+cW+4, ly+3);

    ctx.fillStyle='rgba(150,150,150,0.35)'; ctx.font='8px monospace'; ctx.textAlign='center';
    ctx.fillText('← portfolio value over time →', pad.l+cW/2, H-4);
}

// ── Event Log DOM ─────────────────────────────────────────────────────────────
function addLog(type, event, detail, premium, runningTotal) {
    SIM.logEntries.unshift({ type, event, detail, premium, runningTotal, day:SIM.tradingDay });
    if (SIM.logEntries.length > MAX_LOG_DOM+5) SIM.logEntries.pop();
    renderLog();
}

function renderLog() {
    const el = $('whlLog'); if(!el) return;
    const empty = el.querySelector('.whl-log-empty');
    if (empty) empty.remove();

    while (el.children.length > MAX_LOG_DOM) el.removeChild(el.lastChild);

    const top = SIM.logEntries[0];
    if (!top) return;

    const row = document.createElement('div');
    row.className = `whl-log-row ${top.type}`;
    const premStr = top.premium>0 ? '+'+fmt(top.premium) : '-';
    const totStr  = fmt(top.runningTotal);
    row.innerHTML = `
        <span class="whl-log-day">${top.day}</span>
        <span><span class="whl-log-badge ${top.type}">${top.event.replace(/&#\d+;/g,'')}</span></span>
        <span class="whl-log-detail">${top.detail}</span>
        <span class="whl-log-premium">${premStr}</span>
        <span class="whl-log-total">${totStr}</span>
    `;
    el.prepend(row);
}

// ── Toast Notifications ────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type='info') {
    if (SIM.speed==='turbo') return; // skip toasts in turbo
    let t = document.querySelector('.whl-toast');
    if (!t) { t=document.createElement('div'); document.body.appendChild(t); }
    t.className = `whl-toast ${type}`;
    t.innerHTML = `<span>${msg}</span>`;
    clearTimeout(toastTimer);
    setTimeout(()=>t.classList.add('show'),20);
    toastTimer=setTimeout(()=>t.classList.remove('show'), 3800);
}

// ── UI Render ─────────────────────────────────────────────────────────────────
function render() {
    const st  = STOCKS[SIM.sym];
    const chg = SIM.price - SIM.dayOpen;
    const pct = (chg/SIM.dayOpen)*100;

    // Price display
    setText('whlPrice', '$'+SIM.price.toFixed(2));
    const chEl=$('whlPriceChg');
    if (chEl){ chEl.textContent=`${chg>=0?'+':'-'}$${Math.abs(chg).toFixed(2)} (${fmtPct(pct)})`; chEl.className='whl-price-chg '+(chg>=0?'up':'down'); }

    setText('whlDayLabel', `Day ${SIM.tradingDay}`);
    setText('whlDTE',      SIM.dte.toString());
    setText('whlCycleNum', (SIM.cyclesDone+1).toString());

    // DTE progress bar
    const dtePct = SIM.dteMax>0 ? Math.max(3,(SIM.dte/SIM.dteMax)*100) : 100;
    const dteEl = $('whlDTEFill');
    if (dteEl) { dteEl.style.width=dtePct+'%'; dteEl.style.background=dtePct<25?'#EF4444':dtePct<50?'#F59E0B':'#3b82f6'; }

    // Phase description
    const phaseDef = SIM.phase==='csp' ? PHASES_DEF[0] : PHASES_DEF[2];
    setText('whlPhaseTitle', phaseDef.title);
    setText('whlPhaseSub',   phaseDef.sub);

    // Position panel
    setText('posPhase',     SIM.phase==='csp' ? 'Cash-Secured Put' : 'Covered Call');
    setText('posContracts', SIM.contracts.toString());
    setText('posStrike',    SIM.phase==='csp' ? fmt(SIM.putStrike) : fmt(SIM.callStrike));
    setText('posPremium',   fmt(SIM.positionPremium));
    setText('posCostBasis', SIM.costBasis>0 ? fmt(SIM.costBasis) : '-');

    const pnlEl=$('posPnl');
    if (pnlEl) {
        if (SIM.sharesHeld>0) {
            const pnl=(SIM.price-SIM.costBasis)*SIM.sharesHeld;
            pnlEl.textContent=fmtS(pnl)+` (${fmtPct((SIM.price-SIM.costBasis)/SIM.costBasis*100)})`;
            pnlEl.style.color=pnl>=0?'#10B981':'#EF4444';
        } else { pnlEl.textContent='-'; pnlEl.style.color=''; }
    }

    // Account
    const portVal  = portfolioValue();
    const totalRet = (portVal - STARTING_CASH);
    const retPct   = (totalRet/STARTING_CASH)*100;
    setText('acctPremium', fmt(SIM.totalPremiumCollected));
    setText('acctGains',   fmtS(SIM.realizedGains));
    setText('acctValue',   '$'+portVal.toFixed(2));
    setText('acctCycles',  SIM.cyclesDone.toString());
    setText('acctAssign',  SIM.assignments.toString());
    const retEl=$('acctReturn');
    if (retEl){ retEl.textContent=fmtPct(retPct); retEl.style.color=totalRet>=0?'#10B981':'#EF4444'; }

    // Settings hints
    const putHint=$('whlPutStrikeHint'),callHint=$('whlCallStrikeHint');
    if (putHint)  putHint.textContent  = `→ ${fmt(SIM.putStrike)}`;
    if (callHint) callHint.textContent = SIM.costBasis>0 ? `→ ${fmt(SIM.callStrike)}` : '';

    // Charts
    drawWheelDiagram(diagramCtx);
    drawPriceChart(priceCtx);
    if (SIM.tickCount % 3 === 0) {
        drawIncomeChart(incomeCtx);
        drawEquityChart(equityCtx);
    }
}

// ── LocalStorage ───────────────────────────────────────────────────────────────
function saveState() {
    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({
            sym:        SIM.sym,
            price:      SIM.price,
            tradingDay: SIM.tradingDay,
            phase:      SIM.phase,
            dte:        SIM.dte,
            dteMax:     SIM.dteMax,
            putStrike:  SIM.putStrike,
            callStrike: SIM.callStrike,
            costBasis:  SIM.costBasis,
            sharesHeld: SIM.sharesHeld,
            contracts:  SIM.contracts,
            putOtmPct:  SIM.putOtmPct,
            callOtmPct: SIM.callOtmPct,
            dteSetting: SIM.dteSetting,
            positionPremium: SIM.positionPremium,
            totalPremiumCollected: SIM.totalPremiumCollected,
            realizedGains: SIM.realizedGains,
            assignments:SIM.assignments,
            cyclesDone: SIM.cyclesDone,
            cash:       SIM.cash,
            priceHistory: SIM.priceHistory.slice(-MAX_PRICE_HIST),
            equity:     SIM.equity.slice(-MAX_EQUITY_PTS),
            incomeCycles: SIM.incomeCycles.slice(-MAX_INCOME_BARS),
        }));
        const b=$('whlSavedBadge');
        if(b){ b.style.display='inline'; clearTimeout(b._t); b._t=setTimeout(()=>b.style.display='none',2000); }
    } catch(e){}
}

function loadState() {
    try {
        const raw=localStorage.getItem(SAVE_KEY);
        if (!raw) return false;
        const d=JSON.parse(raw);
        Object.assign(SIM, {
            sym:        d.sym        ?? 'MMBX',
            price:      d.price      ?? 100,
            tradingDay: d.tradingDay ?? 0,
            phase:      d.phase      ?? 'csp',
            dte:        d.dte        ?? 30,
            dteMax:     d.dteMax     ?? 30,
            putStrike:  d.putStrike  ?? 0,
            callStrike: d.callStrike ?? 0,
            costBasis:  d.costBasis  ?? 0,
            sharesHeld: d.sharesHeld ?? 0,
            contracts:  d.contracts  ?? 1,
            putOtmPct:  d.putOtmPct  ?? 5,
            callOtmPct: d.callOtmPct ?? 5,
            dteSetting: d.dteSetting ?? 30,
            positionPremium: d.positionPremium ?? 0,
            totalPremiumCollected: d.totalPremiumCollected ?? 0,
            realizedGains: d.realizedGains ?? 0,
            assignments: d.assignments ?? 0,
            cyclesDone: d.cyclesDone ?? 0,
            cash:       d.cash       ?? STARTING_CASH,
            priceHistory: Array.isArray(d.priceHistory) ? d.priceHistory : [d.price||100],
            equity:     Array.isArray(d.equity)     ? d.equity     : [],
            incomeCycles: Array.isArray(d.incomeCycles) ? d.incomeCycles : [],
        });
        SIM.dayOpen = SIM.price;
        return true;
    } catch(e){ return false; }
}

// ── Loop control ──────────────────────────────────────────────────────────────
function startLoop() {
    if (SIM.loopId) clearInterval(SIM.loopId);
    SIM.loopId = setInterval(()=>{ if(!SIM.paused) tick(); }, SPEEDS[SIM.speed]||700);
}

function stopLoop() { clearInterval(SIM.loopId); SIM.loopId=null; }

// ── Tooltip system ────────────────────────────────────────────────────────────
function initTooltips() {
    const tip=document.createElement('div'); tip.id='whlTooltip'; document.body.appendChild(tip);
    let active=null;
    document.addEventListener('mouseover', e=>{
        const el=e.target.closest('[data-tip]');
        if(!el){ tip.style.display='none'; active=null; return; }
        active=el; tip.textContent=el.dataset.tip; tip.style.display='block';
    });
    document.addEventListener('mousemove', e=>{
        if(!active||tip.style.display==='none') return;
        tip.style.left=Math.min(e.clientX+14,window.innerWidth-tip.offsetWidth-8)+'px';
        tip.style.top =Math.min(e.clientY+14,window.innerHeight-tip.offsetHeight-8)+'px';
    });
    document.addEventListener('mouseout', e=>{ if(active&&!active.contains(e.relatedTarget)){ tip.style.display='none'; active=null; } });
}

// ── Wire simulator UI ─────────────────────────────────────────────────────────
function wireSimUI() {
    // Stock tabs
    document.querySelectorAll('.whl-stock-tab').forEach(btn=>{
        btn.addEventListener('click',()=>{
            const sym=btn.dataset.sym;
            if (sym===SIM.sym) return;
            document.querySelectorAll('.whl-stock-tab').forEach(b=>b.classList.remove('active'));
            btn.classList.add('active');
            const st=STOCKS[sym];
            SIM.sym      = sym;
            SIM.price    = st.startPrice;
            SIM.dayOpen  = st.startPrice;
            SIM.priceHistory=[st.startPrice];
            SIM.totalPremiumCollected=0; SIM.realizedGains=0; SIM.assignments=0;
            SIM.cyclesDone=0; SIM.cash=STARTING_CASH; SIM.equity=[]; SIM.incomeCycles=[];
            SIM.logEntries=[];
            setText('whlLog',''); $('whlLog').innerHTML='<div class="whl-log-empty">Switched stock - new simulation starting…</div>';
            setText('whlTickerBadge', sym);
            setText('whlStockName', st.name);
            initCSPPhase();
            setupCanvases();
        });
    });

    // Speed tabs
    document.querySelectorAll('.whl-speed-tab').forEach(btn=>{
        btn.addEventListener('click',()=>{
            document.querySelectorAll('.whl-speed-tab').forEach(b=>b.classList.remove('active'));
            btn.classList.add('active');
            SIM.speed=btn.dataset.speed;
            startLoop();
        });
    });

    // Pause
    $('whlPauseBtn')?.addEventListener('click',()=>{
        SIM.paused=!SIM.paused;
        $('whlPauseBtn').textContent=SIM.paused?'▶ Resume':'Pause';
    });

    // Reset
    $('whlResetBtn')?.addEventListener('click',()=>{
        if(!confirm('Reset simulation to day 0 with $10,000?')) return;
        const st=STOCKS[SIM.sym];
        Object.assign(SIM, {
            price:st.startPrice, dayOpen:st.startPrice, priceHistory:[st.startPrice],
            tradingDay:0, phase:'csp', dte:SIM.dteSetting, dteMax:SIM.dteSetting,
            putStrike:0, callStrike:0, costBasis:0, sharesHeld:0, positionPremium:0,
            totalPremiumCollected:0, realizedGains:0, assignments:0, cyclesDone:0,
            cash:STARTING_CASH, equity:[], incomeCycles:[], logEntries:[],
        });
        $('whlLog').innerHTML='<div class="whl-log-empty">Reset complete - starting fresh</div>';
        localStorage.removeItem(SAVE_KEY);
        initCSPPhase();
        setupCanvases();
    });

    // Apply settings
    $('whlApplyBtn')?.addEventListener('click',()=>{
        const c  = parseInt($('whlContracts')?.value)||1;
        const po = parseInt($('whlPutOtm')?.value)||5;
        const co = parseInt($('whlCallOtm')?.value)||5;
        const dt = parseInt($('whlDteInput')?.value)||30;
        SIM.contracts=clamp(c,1,20);
        SIM.putOtmPct=clamp(po,1,20);
        SIM.callOtmPct=clamp(co,1,20);
        SIM.dteSetting=clamp(dt,7,60);
        showToast(`Settings applied - will take effect on next cycle`, 'info');
    });

    // Sync inputs from state
    const ci=$('whlContracts'), poi=$('whlPutOtm'), coi=$('whlCallOtm'), di=$('whlDteInput');
    if(ci) ci.value=SIM.contracts;
    if(poi)poi.value=SIM.putOtmPct;
    if(coi)coi.value=SIM.callOtmPct;
    if(di) di.value=SIM.dteSetting;

    // Resize
    let rTimer;
    window.addEventListener('resize',()=>{ clearTimeout(rTimer); rTimer=setTimeout(setupCanvases,200); });

    // Page Visibility - pause loop when tab hidden
    document.addEventListener('visibilitychange',()=>{
        if (document.hidden) stopLoop();
        else { tick(); startLoop(); }
    });
}

function setupCanvases() {
    priceCtx   = setupCanvas('whlPriceChart');
    diagramCtx = setupCanvas('whlDiagram');
    incomeCtx  = setupCanvas('whlIncomeChart');
    equityCtx  = setupCanvas('whlEquityChart');
}

// ─────────────────────────────────────────────────────────────────────────────
//  CALCULATOR SECTION (from original, adapted to match template)
// ─────────────────────────────────────────────────────────────────────────────
let pnlChart     = null;
let pnlChartCall = null;
let currentStrategy = 'wheel';

function formatNumber(input) {
    let v=input.value.replace(/,/g,'');
    if(!isNaN(v)&&v!=='') input.value=parseFloat(v).toLocaleString('en-US');
}
function parseFormattedNumber(v) {
    const p=parseFloat((v+'').replace(/,/g,''));
    return isNaN(p)?NaN:p;
}
function setError(msg) {
    const el=$('calcError'); if(!el) return;
    el.textContent=msg; el.style.display=msg?'block':'none';
}
function clearOutputs() {
    ['totalPremium','capitalRequired','returnOnCapital','annualizedReturn'].forEach(id=>{const e=$(id);if(e)e.textContent='--';});
    const bc=$('breakdownContent'); if(bc) bc.innerHTML='';
    if(pnlChart)    {pnlChart.destroy();pnlChart=null;}
    if(pnlChartCall){pnlChartCall.destroy();pnlChartCall=null;}
}

function setStrategy(strategy) {
    currentStrategy=strategy;
    document.querySelectorAll('.strategy-btn').forEach(btn=>btn.classList.remove('active'));
    document.querySelectorAll('.strategy-btn').forEach(btn=>{
        const oc=btn.getAttribute('onclick')||'';
        if(oc.includes(`'${strategy}'`)) btn.classList.add('active');
    });
    const callInputs=document.querySelectorAll('.call-inputs');
    const putInputs=document.querySelectorAll('.put-inputs');
    const cyclesInput=document.querySelector('.cycles-input');
    if(strategy==='csp'){ callInputs.forEach(i=>i.style.display='none'); putInputs.forEach(i=>i.style.display='flex'); if(cyclesInput)cyclesInput.style.display='none'; }
    else if(strategy==='cc'){ callInputs.forEach(i=>i.style.display='flex'); putInputs.forEach(i=>i.style.display='none'); if(cyclesInput)cyclesInput.style.display='none'; }
    else{ callInputs.forEach(i=>i.style.display='flex'); putInputs.forEach(i=>i.style.display='flex'); if(cyclesInput)cyclesInput.style.display='flex'; }
    calculateWheel(); saveToStorage();
}

function calculateWheel() {
    const sr=document.getElementById('stockPrice')?.value.trim()||'';
    const psr=document.getElementById('putStrike')?.value.trim()||'';
    const ppr=document.getElementById('putPremium')?.value.trim()||'';
    const csr=document.getElementById('callStrike')?.value.trim()||'';
    const cpr=document.getElementById('callPremium')?.value.trim()||'';
    const cr=document.getElementById('contracts')?.value.trim()||'';
    const ycr=document.getElementById('cycles')?.value.trim()||'';

    const needPut=currentStrategy==='csp'||currentStrategy==='wheel';
    const needCall=currentStrategy==='cc'||currentStrategy==='wheel';
    const needCycles=currentStrategy==='wheel';

    const blanks=[!sr,!cr,needPut&&!psr,needPut&&!ppr,needCall&&!csr,needCall&&!cpr,needCycles&&!ycr];
    if(blanks.some(Boolean)){setError('');clearOutputs();return;}

    const sp=parseFormattedNumber(sr),ps=parseFormattedNumber(psr),pp=parseFloat(ppr),
          cs=parseFormattedNumber(csr),cp=parseFloat(cpr),c=parseInt(cr),y=parseInt(ycr);

    if(isNaN(sp)||sp<=0){setError('Stock price must be > $0.');clearOutputs();return;}
    if(needPut){
        if(isNaN(ps)||ps<=0){setError('Put strike must be > $0.');clearOutputs();return;}
        if(isNaN(pp)||pp<0){setError('Put premium must be ≥ $0.');clearOutputs();return;}
        if(ps>=sp){setError('Put strike should be below current stock price.');clearOutputs();return;}
    }
    if(needCall){
        if(isNaN(cs)||cs<=0){setError('Call strike must be > $0.');clearOutputs();return;}
        if(isNaN(cp)||cp<0){setError('Call premium must be ≥ $0.');clearOutputs();return;}
        if(currentStrategy==='cc'&&cs<=sp){setError('Call strike should be above stock price.');clearOutputs();return;}
    }
    if(isNaN(c)||c<1){setError('Contracts must be ≥ 1.');clearOutputs();return;}
    if(needCycles&&(isNaN(y)||y<1)){setError('Cycles must be ≥ 1.');clearOutputs();return;}
    setError('');

    let total,cap,roc,ann;
    if(currentStrategy==='csp'){ total=pp*100*c; cap=ps*100*c; roc=(total/cap)*100; ann=roc*12; }
    else if(currentStrategy==='cc'){ total=cp*100*c; cap=sp*100*c; roc=(total/cap)*100; ann=roc*12; }
    else{ total=(pp+cp)*100*c*y; cap=ps*100*c; roc=(total/cap)*100; ann=(roc/y)*12; }

    document.getElementById('totalPremium').textContent='$'+total.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
    document.getElementById('capitalRequired').textContent='$'+cap.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
    document.getElementById('returnOnCapital').textContent=roc.toFixed(2)+'%';
    document.getElementById('annualizedReturn').textContent=ann.toFixed(2)+'%';

    updateBreakdown(sp,ps,pp,cs,cp,c,y);
    updatePnLGraph(sp,ps,pp,cs,cp);
}

function updateBreakdown(sp,ps,pp,cs,cp,c,y) {
    const bc=$('breakdownContent'); if(!bc) return;
    let html='';
    if(currentStrategy==='csp'){
        const be=ps-pp;
        html=`<div class="breakdown-step"><div class="step-icon">📉</div><div class="step-details"><div class="step-title">Sell Cash-Secured Put</div><div class="step-value">Strike: $${ps.toFixed(2)} · Premium: $${(pp*100).toFixed(2)}/contract</div></div></div>
        <div class="breakdown-step"><div class="step-icon">💰</div><div class="step-details"><div class="step-title">Total Premium Collected</div><div class="step-value highlight-value">$${(pp*100*c).toFixed(2)}</div><div class="step-desc">${c} contract${c>1?'s':''} · ${c*100} shares potential</div></div></div>
        <div class="breakdown-step"><div class="step-icon">🎯</div><div class="step-details"><div class="step-title">Breakeven at Expiration</div><div class="step-value">$${be.toFixed(2)}</div><div class="step-desc">You profit if stock stays above $${be.toFixed(2)}</div></div></div>
        <div class="breakdown-step"><div class="step-icon">📊</div><div class="step-details"><div class="step-title">Max Loss Scenario</div><div class="step-value" style="color:#EF4444;">Stock → $0: -$${(ps*100*c-pp*100*c).toFixed(2)}</div><div class="step-desc">Reduced by premium collected</div></div></div>`;
    } else if(currentStrategy==='cc'){
        const be=sp-cp;
        const maxP=(cs-sp)*100*c+cp*100*c;
        html=`<div class="breakdown-step"><div class="step-icon">📈</div><div class="step-details"><div class="step-title">Own ${c*100} Shares</div><div class="step-value">Cost Basis: $${sp.toFixed(2)} per share</div></div></div>
        <div class="breakdown-step"><div class="step-icon">📞</div><div class="step-details"><div class="step-title">Sell Covered Call</div><div class="step-value">Strike: $${cs.toFixed(2)} · Premium: $${(cp*100).toFixed(2)}/contract</div></div></div>
        <div class="breakdown-step"><div class="step-icon">💰</div><div class="step-details"><div class="step-title">Max Profit (stock called away)</div><div class="step-value highlight-value">$${maxP.toFixed(2)}</div><div class="step-desc">Stock appreciation + all premium</div></div></div>
        <div class="breakdown-step"><div class="step-icon">🎯</div><div class="step-details"><div class="step-title">Downside Breakeven</div><div class="step-value">$${be.toFixed(2)}</div><div class="step-desc">Premium cushions downside by $${cp.toFixed(2)}/share</div></div></div>`;
    } else {
        const ppc=(pp+cp)*100*c;
        html=`<div class="breakdown-step"><div class="step-icon">1️⃣</div><div class="step-details"><div class="step-title">Sell Cash-Secured Put</div><div class="step-value">Strike $${ps.toFixed(2)} · Premium $${(pp*100).toFixed(2)}/contract</div></div></div>
        <div class="breakdown-step"><div class="step-icon">2️⃣</div><div class="step-details"><div class="step-title">If Assigned → Own Stock</div><div class="step-value">Cost basis $${(ps-pp).toFixed(2)}/share</div><div class="step-desc">Premium reduces your true buy price</div></div></div>
        <div class="breakdown-step"><div class="step-icon">3️⃣</div><div class="step-details"><div class="step-title">Sell Covered Call</div><div class="step-value">Strike $${cs.toFixed(2)} · Premium $${(cp*100).toFixed(2)}/contract</div></div></div>
        <div class="breakdown-step"><div class="step-icon">🔄</div><div class="step-details"><div class="step-title">Repeat ${y} Cycles</div><div class="step-value highlight-value">$${ppc.toFixed(2)}/cycle · $${(ppc*y).toFixed(2)} total</div><div class="step-desc">Assumes consistent fills at same premium</div></div></div>`;
    }
    bc.innerHTML=html;
}

// ── P&L Chart (Chart.js) ──────────────────────────────────────────────────────
const verticalLinesPlugin = {
    id:'verticalLines',
    afterDraw(chart){
        const lines=chart.config.options.verticalLines;
        if(!lines||!lines.length) return;
        const ctx=chart.ctx, xScale=chart.scales.x, yScale=chart.scales.y;
        lines.forEach(line=>{
            const labels=chart.data.labels, target=parseFloat(line.value);
            let closest=0, minDiff=Infinity;
            labels.forEach((l,i)=>{ const d=Math.abs(parseFloat(l)-target); if(d<minDiff){minDiff=d;closest=i;} });
            const xPx=xScale.getPixelForValue(closest);
            ctx.save(); ctx.beginPath(); ctx.moveTo(xPx,yScale.top); ctx.lineTo(xPx,yScale.bottom);
            ctx.strokeStyle=line.color||'rgba(100,116,139,0.6)'; ctx.lineWidth=line.width||1.5;
            ctx.setLineDash(line.dash||[5,4]); ctx.stroke(); ctx.restore();
        });
    }
};
if (typeof Chart!=='undefined') Chart.register(verticalLinesPlugin);

function buildPriceArray(lo,hi,forcePoints) {
    const n=80;
    const arr=[];
    for(let i=0;i<=n;i++) arr.push(lo+(hi-lo)*i/n);
    (forcePoints||[]).forEach(p=>{ if(p>lo&&p<hi) arr.push(p); });
    return [...new Set(arr)].sort((a,b)=>a-b);
}

function renderChartLegend(canvasId, vertLines) {
    const legId = canvasId==='pnlChart'?'pnlChartLegend':'pnlChartCallLegend';
    const el=$(legId); if(!el) return;
    el.innerHTML=vertLines.map(l=>`<span style="font-size:0.7rem;color:${l.color};font-weight:700;">- ${l.label}</span>`).join('');
}

function buildChartConfig(prices, profits, vertLines, xTitle) {
    if (typeof Chart==='undefined') return null;
    const posColor='rgba(16,185,129,1)', negColor='rgba(239,68,68,1)';
    const posColorFill='rgba(16,185,129,0.15)', negColorFill='rgba(239,68,68,0.15)';
    const zeroLine={label:'Zero',data:prices.map(()=>0),borderColor:'rgba(100,116,139,0.4)',borderWidth:1,borderDash:[3,3],fill:false,tension:0,pointRadius:0,order:2};
    return {
        type:'line',
        data:{ labels:prices.map(p=>p.toFixed(2)), datasets:[zeroLine,{label:'P&L',data:profits,borderWidth:2.5,fill:true,tension:0,pointRadius:0,pointHoverRadius:5,order:1,
            segment:{ borderColor:ctx=>ctx.p1.parsed.y>=0?posColor:negColor, backgroundColor:ctx=>ctx.p1.parsed.y>=0?posColorFill:negColorFill },
            borderColor:posColor,backgroundColor:posColorFill}]},
        options:{responsive:true,maintainAspectRatio:true,verticalLines:vertLines,interaction:{intersect:false,mode:'index'},
            plugins:{legend:{display:false},tooltip:{backgroundColor:'#1F2937',titleColor:'#F9FAFB',bodyColor:'#F9FAFB',borderColor:'#374151',borderWidth:1,padding:10,displayColors:false,
                filter:item=>item.datasetIndex===1,callbacks:{label:ctx=>(ctx.parsed.y>=0?'✅ Profit: $':'🔴 Loss: $')+Math.abs(ctx.parsed.y).toFixed(2),title:ctx=>xTitle+': $'+ctx[0].label}}},
            scales:{x:{display:true,title:{display:true,text:'Stock Price at Expiration ($)',color:'#6B7280',font:{size:10,weight:'600'}},
                ticks:{maxTicksLimit:7,color:'#9CA3AF',font:{size:10},callback:function(val){return '$'+parseFloat(this.getLabelForValue(val)).toFixed(0);}},
                grid:{color:'rgba(150,150,150,0.08)'}},
            y:{display:true,title:{display:true,text:'Profit / Loss ($)',color:'#6B7280',font:{size:10,weight:'600'}},
                ticks:{color:'#9CA3AF',font:{size:10},callback:val=>(val>=0?'+':'')+val.toFixed(0)},
                grid:{color:'rgba(150,150,150,0.08)'}}}}
    };
}

function updatePnLGraph(sp,ps,pp,cs,cp) {
    if(typeof Chart==='undefined') return;
    const c1=$('pnlChart'), c2=$('pnlChartCall'), callPanel=$('callChartSide'), putLabel=$('putChartSideLabel');
    if(!c1) return;
    if(currentStrategy==='wheel'){ if(callPanel)callPanel.style.display='flex'; if(putLabel)putLabel.textContent='📉 Cash-Secured Put Phase'; }
    else{ if(callPanel)callPanel.style.display='none'; if(putLabel)putLabel.textContent=''; }
    if(pnlChart)    {pnlChart.destroy();pnlChart=null;}
    if(pnlChartCall){pnlChartCall.destroy();pnlChartCall=null;}

    if(currentStrategy==='csp') {
        const be=ps-pp, lo=Math.min(be*0.82,ps*0.78), hi=ps*1.22;
        const prices=buildPriceArray(lo,hi,[be,ps]);
        const profits=prices.map(p=>p<ps?(p-ps)*100+pp*100:pp*100);
        const vl=[{value:ps,label:`Strike $${ps.toFixed(0)}`,color:'#2563EB',dash:[5,4],width:1.5},{value:be,label:`B/E $${be.toFixed(2)}`,color:'#F59E0B',dash:[4,3],width:1.5}];
        const cfg=buildChartConfig(prices,profits,vl,'Stock Price'); if(!cfg) return;
        pnlChart=new Chart(c1,cfg); renderChartLegend('pnlChart',vl);
    } else if(currentStrategy==='cc') {
        const be=sp-cp, lo=Math.min(be*0.82,sp*0.78), hi=cs*1.22;
        const prices=buildPriceArray(lo,hi,[be,sp,cs]);
        const profits=prices.map(p=>p<=cs?(p-sp)*100+cp*100:(cs-sp)*100+cp*100);
        const vl=[{value:sp,label:`Owned $${sp.toFixed(0)}`,color:'#6366F1',dash:[5,4],width:1.5},{value:cs,label:`Strike $${cs.toFixed(0)}`,color:'#2563EB',dash:[5,4],width:1.5},{value:be,label:`B/E $${be.toFixed(2)}`,color:'#F59E0B',dash:[4,3],width:1.5}];
        const cfg=buildChartConfig(prices,profits,vl,'Stock Price'); if(!cfg) return;
        pnlChart=new Chart(c1,cfg); renderChartLegend('pnlChart',vl);
    } else {
        if(!c2) return;
        // PUT side
        const pbe=ps-pp, plo=Math.min(pbe*0.82,ps*0.78), phi=ps*1.22;
        const pp2=buildPriceArray(plo,phi,[pbe,ps]);
        const ppf=pp2.map(p=>p<ps?(p-ps)*100+pp*100:pp*100);
        const pvl=[{value:ps,label:`Put Strike $${ps.toFixed(0)}`,color:'#2563EB',dash:[5,4],width:1.5},{value:pbe,label:`B/E $${pbe.toFixed(2)}`,color:'#F59E0B',dash:[4,3],width:1.5}];
        const pcfg=buildChartConfig(pp2,ppf,pvl,'Stock Price'); if(!pcfg) return;
        pnlChart=new Chart(c1,pcfg); renderChartLegend('pnlChart',pvl);
        // CALL side
        const cbe=ps-cp, clo=Math.min(cbe*0.82,ps*0.78), chi=cs*1.22;
        const cp2=buildPriceArray(clo,chi,[cbe,ps,cs]);
        const cpf=cp2.map(p=>p<=cs?(p-ps)*100+cp*100:(cs-ps)*100+cp*100);
        const cvl=[{value:ps,label:`Cost $${ps.toFixed(0)}`,color:'#6366F1',dash:[5,4],width:1.5},{value:cs,label:`Call Strike $${cs.toFixed(0)}`,color:'#2563EB',dash:[5,4],width:1.5},{value:cbe,label:`B/E $${cbe.toFixed(2)}`,color:'#F59E0B',dash:[4,3],width:1.5}];
        const ccfg=buildChartConfig(cp2,cpf,cvl,'Stock Price'); if(!ccfg) return;
        pnlChartCall=new Chart(c2,ccfg); renderChartLegend('pnlChartCall',cvl);
    }
}

// ── Calculator Storage ────────────────────────────────────────────────────────
function saveToStorage() {
    try{
        localStorage.setItem('optionsWheelCalc', JSON.stringify({
            strategy:currentStrategy,
            stockPrice:$('stockPrice')?.value, putStrike:$('putStrike')?.value,
            putPremium:$('putPremium')?.value, callStrike:$('callStrike')?.value,
            callPremium:$('callPremium')?.value, contracts:$('contracts')?.value, cycles:$('cycles')?.value
        }));
    }catch(e){}
}

function loadFromStorage() {
    try{
        const raw=localStorage.getItem('optionsWheelCalc'); if(!raw) return;
        const d=JSON.parse(raw);
        if(d.strategy) setStrategy(d.strategy);
        const fields=['stockPrice','putStrike','putPremium','callStrike','callPremium','contracts','cycles'];
        fields.forEach(f=>{ if(d[f]&&$(f)) $(f).value=d[f]; });
    }catch(e){}
}

// ── Smooth scroll ─────────────────────────────────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(a=>{
    a.addEventListener('click',e=>{
        e.preventDefault();
        const t=document.querySelector(a.getAttribute('href'));
        if(t) window.scrollTo({top:t.offsetTop-80,behavior:'smooth'});
    });
});

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
    // Restore simulator state or start fresh
    const restored = loadState();

    if (!restored) {
        const st=STOCKS[SIM.sym];
        SIM.price=st.startPrice; SIM.dayOpen=st.startPrice;
        SIM.priceHistory=[st.startPrice];
        SIM.dteSetting=30; SIM.dteMax=30;
    } else {
        // Sync inputs
        const ci=$('whlContracts'), poi=$('whlPutOtm'), coi=$('whlCallOtm'), di=$('whlDteInput');
        if(ci) ci.value=SIM.contracts;
        if(poi)poi.value=SIM.putOtmPct;
        if(coi)coi.value=SIM.callOtmPct;
        if(di) di.value=SIM.dteSetting;
        // Sync stock tab
        document.querySelectorAll('.whl-stock-tab').forEach(b=>{
            b.classList.toggle('active', b.dataset.sym===SIM.sym);
        });
        setText('whlTickerBadge', SIM.sym);
        setText('whlStockName', STOCKS[SIM.sym].name);
    }

    // Wire UI and tooltips
    wireSimUI();
    initTooltips();

    // Warm up: run 5 silent ticks before display
    for(let i=0;i<5;i++) tickPrice();

    // If no open position, open one
    if (!SIM.putStrike && !SIM.costBasis) initCSPPhase();

    // Setup canvases (after layout)
    requestAnimationFrame(()=>{
        setupCanvases();
        render();
        startLoop();
    });

    // Calculator
    loadFromStorage();
    calculateWheel();
}

if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();