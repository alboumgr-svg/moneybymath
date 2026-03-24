// Global chart variable
let pnlChart = null;
let currentStrategy = 'wheel'; // Default strategy: 'csp', 'cc', or 'wheel'

const DAILY_LIMIT = 10;
const STORAGE_KEY = 'stock_lookups'; // use a different key per page if you want separate limits

function getRateLimitData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { count: 0, windowStart: Date.now() };
    const data = JSON.parse(raw);
    // Reset if 24 hours have passed since first call in this window
    if (Date.now() - data.windowStart > 86400000) {
      return { count: 0, windowStart: Date.now() };
    }
    return data;
  } catch {
    return { count: 0, windowStart: Date.now() };
  }
}

function checkAndRecordLookup() {

    const errorEl   = document.getElementById('checkerError');
    errorEl.style.display   = 'none';

    const data = getRateLimitData();
    if (data.count >= DAILY_LIMIT) {
      const resetIn = 86400000 - (Date.now() - data.windowStart);
      const hours = Math.floor(resetIn / 3600000);
      const minutes = Math.floor((resetIn % 3600000) / 60000);
      errorEl.textContent   =   `You've used all ${DAILY_LIMIT} free lookups today. Resets in ${hours}h ${minutes}m.`;
      errorEl.style.display = 'block';
      return false;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      count: data.count + 1,
      windowStart: data.windowStart
    }));
    return true;
}

// Format number with commas
function formatNumber(input) {
    let value = input.value.replace(/,/g, '');
    if (!isNaN(value) && value !== '') {
        input.value = parseFloat(value).toLocaleString('en-US');
    }
}

// Parse formatted number - returns NaN if invalid instead of defaulting to 0
function parseFormattedNumber(value) {
    if (typeof value === 'string') {
        const parsed = parseFloat(value.replace(/,/g, ''));
        return isNaN(parsed) ? NaN : parsed;
    }
    const parsed = parseFloat(value);
    return isNaN(parsed) ? NaN : parsed;
}

// Show a validation error, or clear it when msg is empty
function setError(msg) {
    const el = document.getElementById('calcError');
    if (!el) return;
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
}

// Wipe all result outputs and destroy charts
function clearOutputs() {
    ['totalPremium', 'capitalRequired', 'returnOnCapital', 'annualizedReturn']
        .forEach(id => { const e = document.getElementById(id); if (e) e.textContent = '--'; });
    const bc = document.getElementById('breakdownContent');
    if (bc) bc.innerHTML = '';
    if (pnlChart)     { pnlChart.destroy();     pnlChart     = null; }
    if (pnlChartCall) { pnlChartCall.destroy();  pnlChartCall = null; }
}

// Strategy Toggle Function
function setStrategy(strategy) {
    currentStrategy = strategy;
    
    // Update button states - select all buttons fresh each time
    const allButtons = document.querySelectorAll('.strategy-btn');
    allButtons.forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Add active to the clicked button
    const clickedButton = event?.currentTarget || event?.target;
    if (clickedButton && clickedButton.classList.contains('strategy-btn')) {
        clickedButton.classList.add('active');
    } else {
        // Fallback: find button by strategy
        allButtons.forEach(btn => {
            const onclickAttr = btn.getAttribute('onclick');
            if (onclickAttr && onclickAttr.includes(`'${strategy}'`)) {
                btn.classList.add('active');
            }
        });
    }
    
    // Show/hide relevant inputs based on strategy
    const callInputs = document.querySelectorAll('.call-inputs');
    const putInputs = document.querySelectorAll('.put-inputs');
    const cyclesInput = document.querySelector('.cycles-input');
    
    if (strategy === 'csp') {
        // Cash Secured Put - hide call inputs
        callInputs.forEach(input => input.style.display = 'none');
        putInputs.forEach(input => input.style.display = 'flex');
        if (cyclesInput) cyclesInput.style.display = 'none';
    } else if (strategy === 'cc') {
        // Covered Call - hide put inputs
        callInputs.forEach(input => input.style.display = 'flex');
        putInputs.forEach(input => input.style.display = 'none');
        if (cyclesInput) cyclesInput.style.display = 'none';
    } else {
        // Full Wheel - show all inputs
        callInputs.forEach(input => input.style.display = 'flex');
        putInputs.forEach(input => input.style.display = 'flex');
        if (cyclesInput) cyclesInput.style.display = 'flex';
    }
    
    // Recalculate with new strategy
    calculateWheel();
    saveToStorage();
}

// Calculator Function
function calculateWheel() {
    // 1. Read raw strings to check for emptiness
    const stockPriceRaw  = document.getElementById('stockPrice').value.trim();
    const putStrikeRaw   = document.getElementById('putStrike').value.trim();
    const putPremiumRaw  = document.getElementById('putPremium').value.trim();
    const callStrikeRaw  = document.getElementById('callStrike').value.trim();
    const callPremiumRaw = document.getElementById('callPremium').value.trim();
    const contractsRaw   = document.getElementById('contracts').value.trim();
    const cyclesRaw      = document.getElementById('cycles').value.trim();

    // 2. Determine which fields are required for this strategy
    const needPut  = currentStrategy === 'csp'   || currentStrategy === 'wheel';
    const needCall = currentStrategy === 'cc'    || currentStrategy === 'wheel';
    const needCycles = currentStrategy === 'wheel';

    // 3. If any required field is blank, clear outputs silently and wait
    const requiredBlanks = [
        !stockPriceRaw,
        !contractsRaw,
        needPut  && !putStrikeRaw,
        needPut  && !putPremiumRaw,
        needCall && !callStrikeRaw,
        needCall && !callPremiumRaw,
        needCycles && !cyclesRaw
    ];
    if (requiredBlanks.some(Boolean)) {
        setError('');
        clearOutputs();
        return;
    }

    // 4. Parse values
    const stockPrice  = parseFormattedNumber(stockPriceRaw);
    const putStrike   = parseFormattedNumber(putStrikeRaw);
    const putPremium  = parseFloat(putPremiumRaw);
    const callStrike  = parseFormattedNumber(callStrikeRaw);
    const callPremium = parseFloat(callPremiumRaw);
    const contracts   = parseInt(contractsRaw);
    const cycles      = parseInt(cyclesRaw);

    // 5. Validate
    if (isNaN(stockPrice) || stockPrice <= 0) {
        setError('Stock price must be greater than $0.'); clearOutputs(); return;
    }
    if (needPut) {
        if (isNaN(putStrike) || putStrike <= 0) {
            setError('Put strike price must be greater than $0.'); clearOutputs(); return;
        }
        if (isNaN(putPremium) || putPremium < 0) {
            setError('Put premium must be $0 or more.'); clearOutputs(); return;
        }
        if (putStrike >= stockPrice) {
            setError('Put strike should be below the current stock price.'); clearOutputs(); return;
        }
    }
    if (needCall) {
        if (isNaN(callStrike) || callStrike <= 0) {
            setError('Call strike price must be greater than $0.'); clearOutputs(); return;
        }
        if (isNaN(callPremium) || callPremium < 0) {
            setError('Call premium must be $0 or more.'); clearOutputs(); return;
        }
        if (currentStrategy === 'cc' && callStrike <= stockPrice) {
            setError('Call strike should be above the current stock price.'); clearOutputs(); return;
        }
    }
    if (isNaN(contracts) || contracts < 1) {
        setError('Number of contracts must be at least 1.'); clearOutputs(); return;
    }
    if (needCycles && (isNaN(cycles) || cycles < 1)) {
        setError('Number of cycles must be at least 1.'); clearOutputs(); return;
    }

    // All validation passed — clear any previous error
    setError('');

    let totalPremium, capitalRequired, returnOnCapital, annualizedReturn;
    
    if (currentStrategy === 'csp') {
        totalPremium = putPremium * 100 * contracts;
        capitalRequired = putStrike * 100 * contracts;
        returnOnCapital = (totalPremium / capitalRequired) * 100;
        annualizedReturn = returnOnCapital * 12;
        
    } else if (currentStrategy === 'cc') {
        totalPremium = callPremium * 100 * contracts;
        capitalRequired = stockPrice * 100 * contracts;
        returnOnCapital = (totalPremium / capitalRequired) * 100;
        annualizedReturn = returnOnCapital * 12;
        
    } else {
        const premiumPerCycle = (putPremium + callPremium) * 100 * contracts;
        totalPremium = premiumPerCycle * cycles;
        capitalRequired = putStrike * 100 * contracts;
        returnOnCapital = (totalPremium / capitalRequired) * 100;
        annualizedReturn = (returnOnCapital / cycles) * 12;
    }
    
    // Update display
    document.getElementById('totalPremium').textContent = '$' + totalPremium.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    document.getElementById('capitalRequired').textContent = '$' + capitalRequired.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    document.getElementById('returnOnCapital').textContent = returnOnCapital.toFixed(2) + '%';
    document.getElementById('annualizedReturn').textContent = annualizedReturn.toFixed(2) + '%';
    
    // Update strategy breakdown
    updateBreakdown(stockPrice, putStrike, putPremium, callStrike, callPremium, contracts, cycles);
    
    // Update P&L Graph based on strategy
    updatePnLGraph(stockPrice, putStrike, putPremium, callStrike, callPremium);
}

// Update Strategy Breakdown
function updateBreakdown(stockPrice, putStrike, putPremium, callStrike, callPremium, contracts, cycles) {
    const breakdownContent = document.getElementById('breakdownContent');
    if (!breakdownContent) return;
    
    let html = '';
    
    if (currentStrategy === 'csp') {
        // Cash Secured Put breakdown
        html = `
            <div class="breakdown-step">
                <div class="step-icon">📉</div>
                <div class="step-details">
                    <div class="step-title">Sell Cash-Secured Put</div>
                    <div class="step-value">Strike: $${putStrike.toFixed(2)}</div>
                    <div class="step-value">Premium: $${(putPremium * 100).toFixed(2)} per contract</div>
                </div>
            </div>
            <div class="breakdown-step">
                <div class="step-icon">💰</div>
                <div class="step-details">
                    <div class="step-title">Total Premium Income</div>
                    <div class="step-value highlight-value">$${(putPremium * 100 * contracts).toFixed(2)}</div>
                    <div class="step-desc">${contracts} contract${contracts > 1 ? 's' : ''}</div>
                </div>
            </div>
            <div class="breakdown-step">
                <div class="step-icon">🎯</div>
                <div class="step-details">
                    <div class="step-title">Breakeven Price</div>
                    <div class="step-value">$${(putStrike - putPremium).toFixed(2)}</div>
                    <div class="step-desc">Strike minus premium collected</div>
                </div>
            </div>
            <div class="breakdown-step">
                <div class="step-icon">📊</div>
                <div class="step-details">
                    <div class="step-title">Max Profit</div>
                    <div class="step-value">$${(putPremium * 100 * contracts).toFixed(2)}</div>
                    <div class="step-desc">If stock stays above strike</div>
                </div>
            </div>
        `;
    } else if (currentStrategy === 'cc') {
        // Covered Call breakdown
        const totalCallPremium = callPremium * 100 * contracts;
        const maxProfit = (callStrike - stockPrice) * 100 * contracts + totalCallPremium;
        
        html = `
            <div class="breakdown-step">
                <div class="step-icon">📈</div>
                <div class="step-details">
                    <div class="step-title">Own Stock</div>
                    <div class="step-value">Cost Basis: $${stockPrice.toFixed(2)}</div>
                    <div class="step-value">${contracts * 100} shares (${contracts} contract${contracts > 1 ? 's' : ''})</div>
                </div>
            </div>
            <div class="breakdown-step">
                <div class="step-icon">📞</div>
                <div class="step-details">
                    <div class="step-title">Sell Covered Call</div>
                    <div class="step-value">Strike: $${callStrike.toFixed(2)}</div>
                    <div class="step-value">Premium: $${(callPremium * 100).toFixed(2)} per contract</div>
                </div>
            </div>
            <div class="breakdown-step">
                <div class="step-icon">💰</div>
                <div class="step-details">
                    <div class="step-title">Total Premium Income</div>
                    <div class="step-value highlight-value">$${totalCallPremium.toFixed(2)}</div>
                </div>
            </div>
            <div class="breakdown-step">
                <div class="step-icon">📊</div>
                <div class="step-details">
                    <div class="step-title">Max Profit</div>
                    <div class="step-value">$${maxProfit.toFixed(2)}</div>
                    <div class="step-desc">If stock reaches $${callStrike.toFixed(2)}</div>
                </div>
            </div>
        `;
    } else {
        // Full Wheel breakdown
        const totalPremiumPerCycle = (putPremium + callPremium) * 100 * contracts;
        const totalPremiumAllCycles = totalPremiumPerCycle * cycles;
        
        html = `
            <div class="breakdown-step">
                <div class="step-icon">1️⃣</div>
                <div class="step-details">
                    <div class="step-title">Sell Cash-Secured Put</div>
                    <div class="step-value">Premium: $${(putPremium * 100).toFixed(2)}/contract</div>
                    <div class="step-desc">At $${putStrike.toFixed(2)} strike</div>
                </div>
            </div>
            <div class="breakdown-step">
                <div class="step-icon">2️⃣</div>
                <div class="step-details">
                    <div class="step-title">If Assigned, Own Stock</div>
                    <div class="step-value">Cost: $${putStrike.toFixed(2)}/share</div>
                    <div class="step-desc">${contracts * 100} shares total</div>
                </div>
            </div>
            <div class="breakdown-step">
                <div class="step-icon">3️⃣</div>
                <div class="step-details">
                    <div class="step-title">Sell Covered Call</div>
                    <div class="step-value">Premium: $${(callPremium * 100).toFixed(2)}/contract</div>
                    <div class="step-desc">At $${callStrike.toFixed(2)} strike</div>
                </div>
            </div>
            <div class="breakdown-step">
                <div class="step-icon">🔄</div>
                <div class="step-details">
                    <div class="step-title">Repeat Cycle</div>
                    <div class="step-value highlight-value">$${totalPremiumPerCycle.toFixed(2)}/cycle</div>
                    <div class="step-desc">${cycles} cycles = $${totalPremiumAllCycles.toFixed(2)} total</div>
                </div>
            </div>
        `;
    }
    
    breakdownContent.innerHTML = html;
}

// Second chart instance for the call side (wheel mode)
let pnlChartCall = null;

// ── Vertical reference-line plugin ─────────────────────────────────────────
const verticalLinesPlugin = {
    id: 'verticalLines',
    afterDraw(chart) {
        const lines = chart.config.options.verticalLines;
        if (!lines || !lines.length) return;
        const ctx = chart.ctx;
        const xScale = chart.scales.x;
        const yScale = chart.scales.y;
        lines.forEach(line => {
            // Find the dataset index for this x value (closest label)
            const labels = chart.data.labels;
            const target = parseFloat(line.value);
            let closest = 0, minDiff = Infinity;
            labels.forEach((lbl, i) => {
                const diff = Math.abs(parseFloat(lbl) - target);
                if (diff < minDiff) { minDiff = diff; closest = i; }
            });
            const xPx = xScale.getPixelForValue(closest);
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(xPx, yScale.top);
            ctx.lineTo(xPx, yScale.bottom);
            ctx.strokeStyle = line.color || 'rgba(100,116,139,0.6)';
            ctx.lineWidth = line.width || 1.5;
            ctx.setLineDash(line.dash || [5, 4]);
            ctx.stroke();
            ctx.restore();
        });
    }
};
Chart.register(verticalLinesPlugin);

// ── Render a small HTML legend beneath a canvas ────────────────────────────
function renderChartLegend(canvasId, vertLines) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    // Remove any existing legend
    const existing = canvas.parentNode.querySelector('.vline-legend');
    if (existing) existing.remove();
    if (!vertLines || !vertLines.length) return;

    const legend = document.createElement('div');
    legend.className = 'vline-legend';
    legend.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px 16px;justify-content:center;margin-top:8px;font-size:12px;';
    vertLines.forEach(line => {
        const item = document.createElement('span');
        item.style.cssText = 'display:flex;align-items:center;gap:5px;color:#4B5563;';
        item.innerHTML = `<span style="display:inline-block;width:20px;height:2px;background:${line.color};border-top:2px dashed ${line.color};"></span>${line.label}`;
        legend.appendChild(item);
    });
    canvas.parentNode.appendChild(legend);
}

// ── Build price array with exact kink points inserted ──────────────────────
function buildPriceArray(priceMin, priceMax, kinkPoints, steps = 200) {
    const step = (priceMax - priceMin) / steps;
    const set = new Set();
    for (let p = priceMin; p <= priceMax + 1e-9; p += step) set.add(+p.toFixed(4));
    kinkPoints.forEach(k => { if (k >= priceMin && k <= priceMax) set.add(+k.toFixed(4)); });
    return Array.from(set).map(Number).sort((a, b) => a - b);
}

// ── Shared chart config factory ────────────────────────────────────────────
function buildChartConfig(prices, profits, vertLines, tooltipTitle) {
    const posColor     = '#10B981';
    const negColor     = '#EF4444';
    const posColorFill = 'rgba(16,185,129,0.12)';
    const negColorFill = 'rgba(239,68,68,0.12)';

    return {
        type: 'line',
        data: {
            labels: prices.map(p => p.toFixed(2)),
            datasets: [
                // Zero reference line
                {
                    label: 'Breakeven',
                    data: Array(prices.length).fill(0),
                    borderColor: 'rgba(107,114,128,0.45)',
                    borderWidth: 1.5,
                    borderDash: [6, 4],
                    fill: false,
                    tension: 0,
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    order: 2
                },
                // P&L line
                {
                    label: 'P&L',
                    data: profits,
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0,           // ← STRAIGHT lines - critical for accuracy
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    pointHoverBackgroundColor: '#2563EB',
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 2,
                    order: 1,
                    // Segment-level coloring crosses zero correctly
                    segment: {
                        borderColor: ctx => ctx.p1.parsed.y >= 0 ? posColor : negColor,
                        backgroundColor: ctx => ctx.p1.parsed.y >= 0 ? posColorFill : negColorFill
                    },
                    borderColor: posColor,
                    backgroundColor: posColorFill
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            verticalLines: vertLines,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1F2937',
                    titleColor: '#F9FAFB',
                    bodyColor: '#F9FAFB',
                    borderColor: '#374151',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    filter: item => item.datasetIndex === 1,
                    callbacks: {
                        label: ctx => {
                            const pnl = ctx.parsed.y;
                            return (pnl >= 0 ? '✅ Profit: $' : '🔴 Loss:   $') + Math.abs(pnl).toFixed(2);
                        },
                        title: ctx => tooltipTitle + ': $' + ctx[0].label
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    title: {
                        display: true,
                        text: 'Stock Price at Expiration ($)',
                        color: '#6B7280',
                        font: { size: 11, weight: '600' }
                    },
                    ticks: {
                        maxTicksLimit: 7,
                        color: '#9CA3AF',
                        font: { size: 10.5 },
                        callback: function(val) { return '$' + parseFloat(this.getLabelForValue(val)).toFixed(0); }
                    },
                    grid: { color: '#E5E7EB', drawTicks: false }
                },
                y: {
                    display: true,
                    title: {
                        display: true,
                        text: 'Profit / Loss ($)',
                        color: '#6B7280',
                        font: { size: 11, weight: '600' }
                    },
                    ticks: {
                        color: '#9CA3AF',
                        font: { size: 10.5 },
                        callback: val => (val >= 0 ? '+' : '') + '$' + val.toFixed(0)
                    },
                    grid: { color: '#E5E7EB' }
                }
            }
        }
    };
}

// ── P&L Graph Function ─────────────────────────────────────────────────────
function updatePnLGraph(stockPrice, putStrike, putPremium, callStrike, callPremium) {
    const canvas1 = document.getElementById('pnlChart');
    const canvas2 = document.getElementById('pnlChartCall');
    const callSidePanel = document.getElementById('callChartSide');
    const putSideLabel  = document.getElementById('putChartSideLabel');
    if (!canvas1) return;

    // ── Show/hide second chart panel ────────────────────────────────────────
    if (currentStrategy === 'wheel') {
        if (callSidePanel) callSidePanel.style.display = 'flex';
        if (putSideLabel)  putSideLabel.textContent   = '📉 Cash-Secured Put Phase';
    } else {
        if (callSidePanel) callSidePanel.style.display = 'none';
        if (putSideLabel)  putSideLabel.textContent   = '';
    }

    // Destroy stale charts
    if (pnlChart)     { pnlChart.destroy();     pnlChart     = null; }
    if (pnlChartCall) { pnlChartCall.destroy();  pnlChartCall = null; }

    // ────────────────────────────────────────────────────────────────────────
    if (currentStrategy === 'csp') {
        // ── Cash-Secured Put ──────────────────────────────────────────────
        // P&L (per contract = 100 shares):
        //   price < strike  → (price − strike)×100 + premium×100   [losing]
        //   price ≥ strike  → premium×100                            [max profit]
        const breakeven = putStrike - putPremium;
        const priceMin  = Math.min(breakeven * 0.82, putStrike * 0.78);
        const priceMax  = putStrike * 1.22;
        const prices    = buildPriceArray(priceMin, priceMax, [breakeven, putStrike]);
        const profits   = prices.map(p =>
            p < putStrike
                ? (p - putStrike) * 100 + putPremium * 100
                : putPremium * 100
        );
        const vertLines = [
            { value: putStrike,  label: `Strike $${putStrike.toFixed(0)}`,    color: '#2563EB', dash: [5,4], width: 1.5 },
            { value: breakeven,  label: `B/E $${breakeven.toFixed(2)}`,       color: '#F59E0B', dash: [4,3], width: 1.5 }
        ];
        const cfg = buildChartConfig(prices, profits, vertLines, 'Stock Price');
        // Fix x-axis tick labels
        cfg.options.scales.x.ticks.callback = function(val) {
            const lbl = this.getLabelForValue(val);
            return '$' + parseFloat(lbl).toFixed(0);
        };
        pnlChart = new Chart(canvas1, cfg);
        renderChartLegend('pnlChart', vertLines);

    } else if (currentStrategy === 'cc') {
        // ── Covered Call ──────────────────────────────────────────────────
        // Own stock at stockPrice, sell call at callStrike for callPremium.
        // P&L (per contract = 100 shares):
        //   price ≤ callStrike → (price − stockPrice)×100 + premium×100
        //   price > callStrike → (callStrike − stockPrice)×100 + premium×100   [capped]
        const breakeven = stockPrice - callPremium;
        const priceMin  = Math.min(breakeven * 0.82, stockPrice * 0.78);
        const priceMax  = callStrike * 1.22;
        const prices    = buildPriceArray(priceMin, priceMax, [breakeven, stockPrice, callStrike]);
        const profits   = prices.map(p =>
            p <= callStrike
                ? (p - stockPrice) * 100 + callPremium * 100
                : (callStrike - stockPrice) * 100 + callPremium * 100
        );
        const vertLines = [
            { value: stockPrice, label: `Owned @ $${stockPrice.toFixed(0)}`, color: '#6366F1', dash: [5,4], width: 1.5 },
            { value: callStrike, label: `Strike $${callStrike.toFixed(0)}`,   color: '#2563EB', dash: [5,4], width: 1.5 },
            { value: breakeven,  label: `B/E $${breakeven.toFixed(2)}`,       color: '#F59E0B', dash: [4,3], width: 1.5 }
        ];
        const cfg = buildChartConfig(prices, profits, vertLines, 'Stock Price');
        cfg.options.scales.x.ticks.callback = function(val) {
            return '$' + parseFloat(this.getLabelForValue(val)).toFixed(0);
        };
        pnlChart = new Chart(canvas1, cfg);
        renderChartLegend('pnlChart', vertLines);

    } else {
        // ── Full Wheel - two side-by-side charts ──────────────────────────
        if (!canvas2) return;

        // PUT SIDE: Cash-Secured Put phase
        // Sell put at putStrike for putPremium. P&L at put expiration:
        //   price < putStrike → (price − putStrike)×100 + putPremium×100
        //   price ≥ putStrike → putPremium×100
        const putBreakeven = putStrike - putPremium;
        const putMin  = Math.min(putBreakeven * 0.82, putStrike * 0.78);
        const putMax  = putStrike * 1.22;
        const putPrices  = buildPriceArray(putMin, putMax, [putBreakeven, putStrike]);
        const putProfits = putPrices.map(p =>
            p < putStrike
                ? (p - putStrike) * 100 + putPremium * 100
                : putPremium * 100
        );
        const putVertLines = [
            { value: putStrike,    label: `Put Strike $${putStrike.toFixed(0)}`,  color: '#2563EB', dash: [5,4], width: 1.5 },
            { value: putBreakeven, label: `B/E $${putBreakeven.toFixed(2)}`,      color: '#F59E0B', dash: [4,3], width: 1.5 }
        ];
        const putCfg = buildChartConfig(putPrices, putProfits, putVertLines, 'Stock Price');
        putCfg.options.scales.x.ticks.callback = function(val) {
            return '$' + parseFloat(this.getLabelForValue(val)).toFixed(0);
        };
        pnlChart = new Chart(canvas1, putCfg);
        renderChartLegend('pnlChart', putVertLines);

        // CALL SIDE: Covered Call phase (entered stock at putStrike cost basis)
        // Own stock at putStrike, sell call at callStrike for callPremium. P&L at call expiration:
        //   price ≤ callStrike → (price − putStrike)×100 + callPremium×100
        //   price > callStrike → (callStrike − putStrike)×100 + callPremium×100  [capped]
        const callBreakeven = putStrike - callPremium;
        const callMin  = Math.min(callBreakeven * 0.82, putStrike * 0.78);
        const callMax  = callStrike * 1.22;
        const callPrices  = buildPriceArray(callMin, callMax, [callBreakeven, putStrike, callStrike]);
        const callProfits = callPrices.map(p =>
            p <= callStrike
                ? (p - putStrike) * 100 + callPremium * 100
                : (callStrike - putStrike) * 100 + callPremium * 100
        );
        const callVertLines = [
            { value: putStrike,    label: `Cost $${putStrike.toFixed(0)}`,         color: '#6366F1', dash: [5,4], width: 1.5 },
            { value: callStrike,   label: `Call Strike $${callStrike.toFixed(0)}`, color: '#2563EB', dash: [5,4], width: 1.5 },
            { value: callBreakeven,label: `B/E $${callBreakeven.toFixed(2)}`,      color: '#F59E0B', dash: [4,3], width: 1.5 }
        ];
        const callCfg = buildChartConfig(callPrices, callProfits, callVertLines, 'Stock Price');
        callCfg.options.scales.x.ticks.callback = function(val) {
            return '$' + parseFloat(this.getLabelForValue(val)).toFixed(0);
        };
        pnlChartCall = new Chart(canvas2, callCfg);
        renderChartLegend('pnlChartCall', callVertLines);
    }
}

// LocalStorage functions
function saveToStorage() {
    const data = {
        strategy: currentStrategy,
        stockPrice: document.getElementById('stockPrice').value,
        putStrike: document.getElementById('putStrike').value,
        putPremium: document.getElementById('putPremium').value,
        callStrike: document.getElementById('callStrike').value,
        callPremium: document.getElementById('callPremium').value,
        contracts: document.getElementById('contracts').value,
        cycles: document.getElementById('cycles').value
    };
    localStorage.setItem('optionsWheelData', JSON.stringify(data));
}

function loadFromStorage() {
    const saved = localStorage.getItem('optionsWheelData');
    if (!saved) return;
    
    const data = JSON.parse(saved);
    
    if (data.strategy) {
        currentStrategy = data.strategy;
        document.querySelectorAll('.strategy-btn').forEach(btn => {
            btn.classList.remove('active');
            const onclickAttr = btn.getAttribute('onclick');
            if (onclickAttr && onclickAttr.includes(`'${data.strategy}'`)) {
                btn.classList.add('active');
            }
        });
        // Apply show/hide for the loaded strategy
        const callInputs = document.querySelectorAll('.call-inputs');
        const putInputs = document.querySelectorAll('.put-inputs');
        const cyclesInput = document.querySelector('.cycles-input');
        if (data.strategy === 'csp') {
            callInputs.forEach(i => i.style.display = 'none');
            putInputs.forEach(i => i.style.display = 'flex');
            if (cyclesInput) cyclesInput.style.display = 'none';
        } else if (data.strategy === 'cc') {
            callInputs.forEach(i => i.style.display = 'flex');
            putInputs.forEach(i => i.style.display = 'none');
            if (cyclesInput) cyclesInput.style.display = 'none';
        } else {
            callInputs.forEach(i => i.style.display = 'flex');
            putInputs.forEach(i => i.style.display = 'flex');
            if (cyclesInput) cyclesInput.style.display = 'flex';
        }
    }
    
    if (data.stockPrice) document.getElementById('stockPrice').value = data.stockPrice;
    if (data.putStrike) document.getElementById('putStrike').value = data.putStrike;
    if (data.putPremium) document.getElementById('putPremium').value = data.putPremium;
    if (data.callStrike) document.getElementById('callStrike').value = data.callStrike;
    if (data.callPremium) document.getElementById('callPremium').value = data.callPremium;
    if (data.contracts) document.getElementById('contracts').value = data.contracts;
    if (data.cycles) document.getElementById('cycles').value = data.cycles;
}

// Initialize calculator — load saved values, then calculate only if storage had data
document.addEventListener('DOMContentLoaded', function() {
    loadFromStorage();
    calculateWheel(); // will clear outputs silently if fields are blank
});

// Tab switching for stocks section
function showTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.stocks-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove active class from all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab
    document.getElementById(tabName + '-tab').classList.add('active');
    
    // Add active class to clicked button
    event.target.classList.add('active');
}

// Smooth scroll enhancement
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            const offsetTop = target.offsetTop - 80; // Account for fixed navbar
            window.scrollTo({
                top: offsetTop,
                behavior: 'smooth'
            });
        }
    });
});

// Add intersection observer for scroll animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver(function(entries) {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe sections for animations
document.addEventListener('DOMContentLoaded', function() {
    const animatedElements = document.querySelectorAll('.stock-card, .learn-card, .result-card');
    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
});

// Add navbar background on scroll
let lastScroll = 0;
const navbar = document.querySelector('.navbar');

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    
    if (currentScroll > 50) {
        navbar.style.background = 'rgba(255, 255, 255, 0.98)';
        navbar.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
    } else {
        navbar.style.background = 'rgba(255, 255, 255, 0.95)';
        navbar.style.boxShadow = 'none';
    }
    
    lastScroll = currentScroll;
});

// ─────────────────────────────────────────────────────────────────────────────
//  STOCK WHEEL CHECKER
//  Calls your Flask backend on Render - no CORS issues, no API keys in JS.
//  Change API_BASE to your Render service URL once deployed.
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = 'http://localhost:5000' //'https://your-service-name.onrender.com';  // ← update after deploy

// ── Main entry point ──────────────────────────────────────────────────────────
async function runChecker() {
    const inputEl   = document.getElementById('checkerTicker');
    const errorEl   = document.getElementById('checkerError');
    const loadingEl = document.getElementById('checkerLoading');
    const resultsEl = document.getElementById('checkerResults');
    const loadTick  = document.getElementById('checkerLoadingTicker');

    const ticker = inputEl.value.trim().toUpperCase().replace(/[^A-Z0-9.^-]/g, '');

    errorEl.style.display   = 'none';
    resultsEl.style.display = 'none';

    if (!ticker) {
        errorEl.textContent   = 'Please enter a ticker symbol (e.g. AAPL, MSFT, NOW).';
        errorEl.style.display = 'block';
        return;
    }

    if (!checkAndRecordLookup()) return;

    inputEl.disabled        = true;
    if (loadTick) loadTick.textContent = ticker;
    loadingEl.style.display = 'flex';

    try {
        const res = await fetch(`${API_BASE}/api/stock?ticker=${encodeURIComponent(ticker)}`);
        const d   = await res.json();

        if (!res.ok) {
            throw new Error(d.error || `Server error (${res.status}). Please try again.`);
        }

        renderCheckerResults(d);
        resultsEl.style.display = 'block';
        setTimeout(() => resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);

    } catch (err) {
        const msg = err.message || '';
        // Friendly message if Render free tier is waking up from sleep
        errorEl.textContent = msg.includes('Failed to fetch')
            ? 'Could not reach the server. If this is your first request in a while, Render may be waking up - wait 30 seconds and try again.'
            : msg || 'Something went wrong. Please try again.';
        errorEl.style.display = 'block';
    } finally {
        loadingEl.style.display = 'none';
        inputEl.disabled        = false;
    }
}

// ── Scoring engine ────────────────────────────────────────────────────────────
function renderCheckerResults(d) {
    const resultsEl = document.getElementById('checkerResults');
    const checks = [];
    let totalPts = 0, maxPts = 0;

    function chk(section, label, status, detail, note = '', weight = 1) {
        totalPts += status === 'pass' ? weight : 0;
        maxPts   += weight;
        checks.push({ section, label, status, detail, note });
    }

    // ── EASY MODE ────────────────────────────────────────────────────────
    if      (d.spot < 20)   chk('easy','Stock Price','fail',`$${d.spot.toFixed(2)} - too cheap, dollar premiums will be very small`,'',2);
    else if (d.spot <= 150) chk('easy','Stock Price','pass',`$${d.spot.toFixed(2)} - in ideal $20–$150 range`,'',2);
    else                    chk('easy','Stock Price','warn',`$${d.spot.toFixed(2)} - above $150, requires more capital per contract`,'',2);

    if (d.marketCap != null) {
        const mc = d.marketCap / 1e9;
        mc >= 2
            ? chk('easy','Market Cap','pass',`$${mc.toFixed(1)}B - meets the >$2B stability threshold`,'',2)
            : chk('easy','Market Cap','fail',`$${mc.toFixed(1)}B - below $2B, higher small-cap risk`,'',2);
    } else chk('easy','Market Cap','info','Data unavailable','',2);

    if (d.earnDays != null) {
        const est      = !!d.earnDaysEstimated;
        const estNote  = est ? 'Date estimated from last known earnings + 3 months. Verify on your broker.' : '';
        const approx   = est ? '~' : '';
        const days     = d.earnDays;

        if (!est && days <= 0)
            chk('easy','Earnings Safety','fail','Earnings recently passed - check for next report date', estNote, 3);
        else if (days <= 14)
            chk('easy','Earnings Safety','fail', `Earnings in ${approx}${days} days - do not open new positions. Wait until after the report before entering any trade.`, estNote, 3);
        else if (days <= 28)
            chk('easy','Earnings Safety','warn', `Earnings in ${approx}${days} days - use short expirations only`, estNote, 3);
        else
            chk('easy','Earnings Safety','pass', `Earnings in ${approx}${days} days - safe window for most expirations`, estNote, 3);
    } else chk('easy','Earnings Safety','info','Date unavailable - verify manually before trading','',3);
    
    if (d.spreadDollar != null) {
        const n = d.optExpiry ? `Nearest expiry: ${d.optExpiry}` : '';
        if      (d.spreadDollar <= 0.15) chk('easy','Options Liquidity','pass',`Avg ATM spread $${d.spreadDollar.toFixed(2)} - tight, good fill quality`,n,2);
        else if (d.spreadDollar <= 0.30) chk('easy','Options Liquidity','warn',`Avg ATM spread $${d.spreadDollar.toFixed(2)} - acceptable, watch your fills`,n,2);
        else                             chk('easy','Options Liquidity','fail',`Avg ATM spread $${d.spreadDollar.toFixed(2)} - wide, spreads eat your premium`,n,2);
    } else chk('easy','Options Liquidity','info','Spread data unavailable - check your broker','',2);

    if (d.peRatio != null && d.peRatio > 0)
        d.peRatio <= 35
            ? chk('easy','P/E Ratio','pass',`${d.peRatio.toFixed(1)} - reasonable valuation`,'',1)
            : chk('easy','P/E Ratio','warn',`${d.peRatio.toFixed(1)} - elevated, overvalued stocks have further to fall`,'',1);
    else if (d.peRatio != null && d.peRatio < 0)
        chk('easy','P/E Ratio','warn','Negative - company is currently unprofitable','',1);
    else chk('easy','P/E Ratio','info','Data unavailable','',1);

    if (d.pbRatio != null)
        d.pbRatio <= 3
            ? chk('easy','Price-to-Book','pass',`${d.pbRatio.toFixed(2)} - not excessively overpriced vs. assets`,'',1)
            : chk('easy','Price-to-Book','warn',`${d.pbRatio.toFixed(2)} - above 3, premium valuation`,'',1);
    else chk('easy','Price-to-Book','info','Data unavailable','',1);

    const fcfPos   = d.fcf != null && d.fcf > 0;
    const revOk    = d.revGrowth != null && d.revGrowth > 0;
    const debtR    = (d.totalDebt && d.totalCash > 0) ? d.totalDebt / d.totalCash : null;
    const debtNote = debtR != null ? `Debt/Cash: ${debtR.toFixed(1)}x` : '';
    if      (fcfPos && revOk) chk('easy','Fundamentals','pass',`Positive free cash flow + ${(d.revGrowth*100).toFixed(1)}% revenue growth`,debtNote,2);
    else if (fcfPos)          chk('easy','Fundamentals','warn',`Positive free cash flow but ${d.revGrowth != null ? (d.revGrowth*100).toFixed(1)+'% revenue growth' : 'revenue growth unavailable'}`,debtNote,2);
    else                      chk('easy','Fundamentals','fail','Negative or unavailable free cash flow - core risk',debtNote,2);

    if (d.divYield != null && d.divYield > 0) {
        const dp = d.divYield;
        if      (dp >= 1 && dp <= 9) chk('easy','Dividend Yield','pass',`${dp.toFixed(2)}% - pays you while holding if assigned`,'',1);
        else if (dp > 9)             chk('easy','Dividend Yield','warn',`${dp.toFixed(2)}% - very high, verify sustainability`,'',1);
        else                         chk('easy','Dividend Yield','warn',`${dp.toFixed(2)}% - below 1%, minimal cushion`,'',1);
    } else chk('easy','Dividend Yield','warn','No dividend - no cushion while holding assigned shares','',1);

    // ── HARD MODE ────────────────────────────────────────────────────────
    const a50 = d.ma50 != null && d.spot > d.ma50;
    const a200= d.ma200!= null && d.spot > d.ma200;
    const m50s  = d.ma50  != null ? `$${d.ma50.toFixed(2)}`  : 'N/A';
    const m200s = d.ma200 != null ? `$${d.ma200.toFixed(2)}` : 'N/A';
    if      (a50 && a200)  chk('hard','Moving Averages','pass',`Above MA50 (${m50s}) and MA200 (${m200s}) - uptrend confirmed`,'',2);
    else if (!a50 && a200) chk('hard','Moving Averages','warn',`Below MA50 (${m50s}), above MA200 (${m200s}) - short-term weakness`,'',2);
    else if (a50 && !a200) chk('hard','Moving Averages','warn',`Above MA50 (${m50s}), below MA200 (${m200s}) - long-term downtrend`,'',2);
    else                   chk('hard','Moving Averages','fail',`Below MA50 (${m50s}) and MA200 (${m200s}) - bearish trend`,'',2);

    if (d.rsi != null) {
        const r = d.rsi;
        if      (r >= 40 && r <= 65) chk('hard','RSI (14-day)','pass',`${r.toFixed(1)} - healthy range (40–65)`,'',2);
        else if (r >= 30 && r < 40)  chk('hard','RSI (14-day)','warn',`${r.toFixed(1)} - slightly weak, approaching oversold`,'',2);
        else if (r < 30)             chk('hard','RSI (14-day)','warn',`${r.toFixed(1)} - oversold, downtrend momentum is strong`,'',2);
        else if (r <= 75)            chk('hard','RSI (14-day)','warn',`${r.toFixed(1)} - approaching overbought, pullback risk rising`,'',2);
        else                         chk('hard','RSI (14-day)','fail',`${r.toFixed(1)} - overbought (above 75), elevated pullback risk`,'',2);
    } else chk('hard','RSI (14-day)','info','Insufficient price history','',2);

    if (d.iv != null) {
        const ivp = d.iv * 100;
        const src = d.optExpiry ? `Expiry used: ${d.optExpiry}` : '';
        if      (ivp >= 25 && ivp <= 60) chk('hard','Implied Volatility','pass',`${ivp.toFixed(1)}% - sweet spot (25–60%), solid premium potential`,src,2);
        else if (ivp < 20)               chk('hard','Implied Volatility','fail',`${ivp.toFixed(1)}% - too low, premiums barely worth selling`,src,2);
        else if (ivp > 80)               chk('hard','Implied Volatility','fail',`${ivp.toFixed(1)}% - dangerously high, market expects a large move`,src,2);
        else                             chk('hard','Implied Volatility','warn',`${ivp.toFixed(1)}% - usable but outside ideal 25–60% range`,src,2);
    } else chk('hard','Implied Volatility','info','Unavailable - check your broker for IV','',2);

    if (d.hvr != null) {
        const n = 'Approximated from 1-year historical volatility. Confirm with your broker.';
        if      (d.hvr >= 50) chk('hard','IV Rank (approx)','pass',`${d.hvr.toFixed(0)} - elevated vs. past year, good time to sell premium`,n,2);
        else if (d.hvr >= 30) chk('hard','IV Rank (approx)','warn',`${d.hvr.toFixed(0)} - moderate (above 30 preferred, above 50 ideal)`,n,2);
        else                  chk('hard','IV Rank (approx)','fail',`${d.hvr.toFixed(0)} - historically low volatility, premiums are cheap`,n,2);
    } else chk('hard','IV Rank (approx)','info','Need at least 1 year of price history','',2);

    if (d.beta != null) {
        if      (d.beta <= 1.5) chk('hard','Beta','pass',`${d.beta.toFixed(2)} - manageable market sensitivity`,'',1);
        else if (d.beta <= 2.5) chk('hard','Beta','warn',`${d.beta.toFixed(2)} - above-average swings on market moves`,'',1);
        else                    chk('hard','Beta','fail',`${d.beta.toFixed(2)} - very high, large gap risk on macro events`,'',1);
    } else chk('hard','Beta','info','Data unavailable','',1);

    // ── Render ────────────────────────────────────────────────────────────
    const score  = maxPts > 0 ? Math.round(totalPts / maxPts * 100) : 0;
    const passes = checks.filter(c => c.status === 'pass');
    const warns  = checks.filter(c => c.status === 'warn');
    const fails  = checks.filter(c => c.status === 'fail');
    const barClr = score >= 65 ? '#10B981' : score >= 40 ? '#F59E0B' : '#EF4444';

    let vClass, vTitle, vSub;
    if      (score >= 75) { vClass='checker-verdict-pass'; vTitle='STRONG CANDIDATE';   vSub='Passes most criteria. A solid choice for the Wheel Strategy.'; }
    else if (score >= 55) { vClass='checker-verdict-pass'; vTitle='DECENT CANDIDATE';   vSub='A few yellow flags. Use shorter expirations and smaller size.'; }
    else if (score >= 40) { vClass='checker-verdict-warn'; vTitle='MARGINAL CANDIDATE'; vSub='Significant concerns. Only trade this with a clear thesis.'; }
    else                  { vClass='checker-verdict-fail'; vTitle='BAD CANDIDATE';      vSub='Too many red flags. Wait for better conditions or pick another stock.'; }

    const mc = d.marketCap != null ? (() => {
        const val = d.marketCap;
        if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
        if (val >= 1e9)  return `$${(val / 1e9).toFixed(1)}B`;
        if (val >= 1e6)  return `$${(val / 1e6).toFixed(1)}M`;
        return `$${val.toLocaleString()}`;
    })() : 'N/A';
    const sectorStr = [d.sector, d.industry].filter(Boolean).join(' · ');
    const easyRows = checks.filter(c => c.section === 'easy');
    const hardRows = checks.filter(c => c.section === 'hard');

    resultsEl.innerHTML = `
        <div class="calculator-card" style="margin-bottom:1rem;">
            <div class="checker-header-card">
                <div>
                    <div style="font-size:1.4rem;font-weight:800;color:#111827;">
                        ${h(d.name)} <span style="color:#6B7280;font-size:0.95rem;font-weight:500;">(${d.ticker})</span>
                    </div>
                    ${sectorStr ? `<div style="color:#9CA3AF;font-size:0.8rem;margin-top:2px;">${h(sectorStr)}</div>` : ''}
                    <div style="display:flex;gap:2.5rem;margin-top:0.9rem;flex-wrap:wrap;">
                        <div>
                            <div style="font-size:0.68rem;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.06em;">Price</div>
                            <div style="font-size:1.3rem;font-weight:700;color:#111827;">$${d.spot.toFixed(2)}</div>
                        </div>
                        <div>
                            <div style="font-size:0.68rem;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.06em;">Market Cap</div>
                            <div style="font-size:1.3rem;font-weight:700;color:#111827;">${mc}</div>
                        </div>
                        ${d.peRatio  != null && d.peRatio > 0 ? `<div><div style="font-size:0.68rem;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.06em;">P/E</div><div style="font-size:1.3rem;font-weight:700;color:#111827;">${d.peRatio.toFixed(1)}</div></div>` : ''}
                        ${d.beta     != null ? `<div><div style="font-size:0.68rem;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.06em;">Beta</div><div style="font-size:1.3rem;font-weight:700;color:#111827;">${d.beta.toFixed(2)}</div></div>` : ''}
                        ${d.divYield != null && d.divYield > 0 ? `<div><div style="font-size:0.68rem;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.06em;">Div Yield</div><div style="font-size:1.3rem;font-weight:700;color:#111827;">${(d.divYield).toFixed(2)}%</div></div>` : ''}
                    </div>
                </div>
                <div style="text-align:right;flex-shrink:0;">
                    <div style="font-size:0.68rem;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Wheel Score</div>
                    <div class="checker-score-value" style="color:${barClr};">${score}<span style="font-size:1rem;font-weight:400;color:#9CA3AF;">/100</span></div>
                    <div class="checker-score-bar-track"><div class="checker-score-bar-fill" style="width:${score}%;background:${barClr};"></div></div>
                </div>
            </div>
        </div>

        <div class="checker-checklist-grid">
            <div class="calculator-card">
                <h3 class="card-title">Easy Mode Criteria</h3>
                ${easyRows.map(cRow).join('')}
            </div>
            <div class="calculator-card">
                <h3 class="card-title">Hard Mode Criteria</h3>
                ${hardRows.map(cRow).join('')}
            </div>
        </div>

        <div class="calculator-card">
            <div class="checker-verdict-box ${vClass}">
                <div class="checker-verdict-eyebrow">Verdict</div>
                <div class="checker-verdict-title">${vTitle}</div>
                <div class="checker-verdict-sub">${vSub}</div>
            </div>
            <div class="checker-summary-cols">
                ${passes.length ? `<div><div class="checker-summary-col-head" style="color:#059669;">Working in its Favor</div>${passes.map(c=>`<div class="checker-summary-item" style="border-color:#10B981;color:#065F46;"><strong>${h(c.label)}</strong></div>`).join('')}</div>` : ''}
                ${warns.length  ? `<div><div class="checker-summary-col-head" style="color:#D97706;">Yellow Flags</div>${warns.map(c=>`<div class="checker-summary-item" style="border-color:#F59E0B;color:#92400E;"><strong>${h(c.label)}</strong></div>`).join('')}</div>` : ''}
                ${fails.length  ? `<div><div class="checker-summary-col-head" style="color:#DC2626;">Working Against It</div>${fails.map(c=>`<div class="checker-summary-item" style="border-color:#EF4444;color:#7F1D1D;"><strong>${h(c.label)}</strong></div>`).join('')}</div>` : ''}
            </div>
        </div>`;
}

function cRow(c) {
    const tags = { pass:['checker-tag-pass','PASS'], warn:['checker-tag-warn','WARN'], fail:['checker-tag-fail','FAIL'], info:['checker-tag-info','INFO'] };
    const [cls, lbl] = tags[c.status] || tags.info;
    return `<div class="checker-row">
        <span class="checker-tag ${cls}">${lbl}</span>
        <div>
            <div class="checker-row-label">${h(c.label)}</div>
            <div class="checker-row-detail">${h(c.detail)}</div>
            ${c.note ? `<div class="checker-row-note">${h(c.note)}</div>` : ''}
        </div>
    </div>`;
}

function h(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}