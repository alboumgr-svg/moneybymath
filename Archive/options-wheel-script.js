// Global chart variable
let pnlChart = null;
let currentStrategy = 'wheel'; // Default strategy: 'csp', 'cc', or 'wheel'

// Format number with commas
function formatNumber(input) {
    let value = input.value.replace(/,/g, '');
    if (!isNaN(value) && value !== '') {
        input.value = parseFloat(value).toLocaleString('en-US');
    }
}

// Parse formatted number
function parseFormattedNumber(value) {
    if (typeof value === 'string') {
        return parseFloat(value.replace(/,/g, '')) || 0;
    }
    return parseFloat(value) || 0;
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
    const stockPrice = parseFormattedNumber(document.getElementById('stockPrice').value);
    const putStrike = parseFormattedNumber(document.getElementById('putStrike').value);
    const putPremium = parseFloat(document.getElementById('putPremium').value);
    const callStrike = parseFormattedNumber(document.getElementById('callStrike').value);
    const callPremium = parseFloat(document.getElementById('callPremium').value);
    const contracts = parseInt(document.getElementById('contracts').value);
    const cycles = parseInt(document.getElementById('cycles').value);
    
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
                    tension: 0,           // ← STRAIGHT lines — critical for accuracy
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
        // ── Full Wheel — two side-by-side charts ──────────────────────────
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

// Initialize calculator with default calculation
document.addEventListener('DOMContentLoaded', function() {
    loadFromStorage();
    calculateWheel();
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