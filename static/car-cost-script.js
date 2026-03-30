/* True Cost of Car Ownership calculator
   - Compares New, Used, and Leased (requires at least 2 to calculate)
   - Side-by-side % and $ down payment inputs
   - Unified handleInput() + formatCurrencyInput()
   - DOMContentLoaded init
*/

let carChart = null;
let winnerKey = null;

const STATE_IDS = [
    'newPrice','newRate','newTerm','newDownPayment', 'newDownPaymentPct',
    'usedPrice','usedRate','usedTerm','usedDownPayment', 'usedDownPaymentPct',
    'leaseDueAtSigning','leaseMonthly','leaseTerm',
    'holdYears','marketReturn'
];

const GROUPS = {
    new: ['newPrice','newRate','newTerm','newDownPayment'],
    used: ['usedPrice','usedRate','usedTerm','usedDownPayment'],
    lease: ['leaseDueAtSigning','leaseMonthly','leaseTerm']
};

const SHARED = ['holdYears','marketReturn'];

// ─── Synchronize Dollar and Percent inputs ────────────────────────────────────

function syncCarDownPayment(type, source) {
    const priceId   = type === 'new' ? 'newPrice' : 'usedPrice';
    const dollarId  = type === 'new' ? 'newDownPayment' : 'usedDownPayment';
    const percentId = type === 'new' ? 'newDownPaymentPct' : 'usedDownPaymentPct';

    const price     = parseFormattedNumber(document.getElementById(priceId).value);
    const dollarEl  = document.getElementById(dollarId);
    const percentEl = document.getElementById(percentId);

    if (source === 'percent') {
        const pct = parseFloat(percentEl.value) || 0;
        const calcDollar = (price * pct) / 100;
        dollarEl.value = calcDollar > 0 ? Math.round(calcDollar).toLocaleString('en-US') : '';
    } else {
        const dollar = parseFormattedNumber(dollarEl.value);
        const calcPct = price > 0 ? (dollar / price) * 100 : 0;
        percentEl.value = calcPct > 0 ? parseFloat(calcPct.toFixed(2)) : '';
    }

    calculateCarCost();
    saveToStorage();
}

// ─── Currency formatting & Parsing ────────────────────────────────────────────

function formatCurrencyInput(input) {
    const raw       = input.value;
    const cursorPos = input.selectionStart;
    const sigBeforeCursor = raw.slice(0, cursorPos).replace(/[^0-9.]/g, '').length;

    let clean = raw.replace(/[^0-9.]/g, '');
    const dotIdx = clean.indexOf('.');
    if (dotIdx !== -1) clean = clean.slice(0, dotIdx + 1) + clean.slice(dotIdx + 1).replace(/\./g, '');

    const parts = clean.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const formatted = parts.length > 1 ? parts[0] + '.' + parts[1] : parts[0];
    input.value = formatted;

    let sigCount = 0, newCursor = formatted.length;
    for (let i = 0; i < formatted.length; i++) {
        if (/[0-9.]/.test(formatted[i])) sigCount++;
        if (sigCount === sigBeforeCursor) { newCursor = i + 1; break; }
    }
    if (sigBeforeCursor === 0) newCursor = 0;
    try { input.setSelectionRange(newCursor, newCursor); } catch (e) {}
}

function parseFormattedNumber(value) {
    if (typeof value === 'string') return parseFloat(value.replace(/,/g, '')) || 0;
    return parseFloat(value) || 0;
}

function clampInput(input) {
    const max = parseFloat(input.dataset.max);
    if (isNaN(max)) return;
    const val = parseFormattedNumber(input.value);
    if (val > max) {
        input.value = input.dataset.inputType === 'currency'
            ? Math.round(max).toLocaleString('en-US')
            : max;
    }
}

function handleInput(input) {
    if (input.dataset.inputType === 'currency') formatCurrencyInput(input);
    clampInput(input);
    saveToStorage();
    calculateCarCost();
}

// ─── Results & UI Helpers ─────────────────────────────────────────────────────

function setResultsEmpty() {
    ['monthlyPayments', 'totalInterest', 'totalDepreciation',
     'opportunityCost', 'trueCost', 'trueCostLoss']
        .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '--'; });

    ['monthlyBreakdown', 'interestBreakdown', 'depreciationBreakdown',
     'oppCostBreakdown', 'trueCostLossBreakdown', 'trueCostBreakdown']
        .forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });

    document.querySelectorAll('.result-subtitle.dyn-labels').forEach(el => el.textContent = '--');

    if (carChart) { carChart.destroy(); carChart = null; }
}

function checkGroup(groupArr) {
    return groupArr.every(id => {
        const v = (document.getElementById(id)?.value || '').trim().replace(/,/g, '');
        return v !== '' && !isNaN(parseFloat(v));
    });
}

// ─── Math Engine ──────────────────────────────────────────────────────────────

function calcMonthlyPayment(principal, annualRatePct, months) {
    if (principal <= 0 || months <= 0) return 0;
    const r = annualRatePct / 100 / 12;
    if (r === 0) return principal / months;
    return principal * (r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}

function calcDepreciation(price, years, isNew = true) {
    let value = price;
    for (let y = 1; y <= years; y++) value *= (isNew && y === 1) ? 0.80 : 0.85;
    return price - value;
}

function calcFVLumpSumGains(principal, annualRatePct, years) {
    if (principal <= 0 || years <= 0) return 0;
    const r = annualRatePct / 100 / 12;
    if (r === 0) return 0;
    return principal * Math.pow(1 + r, years * 12) - principal;
}

function calcFVAnnuityGains(pmt, annualRatePct, months) {
    if (pmt <= 0 || months <= 0) return 0;
    const r = annualRatePct / 100 / 12;
    if (r === 0) return 0;
    const fv = pmt * (Math.pow(1 + r, months) - 1) / r;
    return fv - (pmt * months);
}

// ─── Main calculation ─────────────────────────────────────────────────────────

function calculateCarCost() {
    const hasShared = checkGroup(SHARED);
    const hasNew    = checkGroup(GROUPS.new);
    const hasUsed   = checkGroup(GROUPS.used);
    const hasLease  = checkGroup(GROUPS.lease);

    const activeCount = [hasNew, hasUsed, hasLease].filter(Boolean).length;
    const verdictEl  = document.getElementById('carVerdict');
    const subtitleEl = document.getElementById('carVerdictSubtitle');
    const card       = verdictEl.parentElement;
    const floatPill = document.getElementById('carFloat');
    const floatLabelShowEl = document.getElementById('floatLabelShow');

    if (!hasShared || activeCount < 2) {
        setResultsEmpty();
        verdictEl.textContent = 'Fill in at least two car profiles and shared parameters to compare';
        verdictEl.style.color = '#6B7280';
        subtitleEl.textContent = '';
        if (card) card.style.borderLeft = '4px solid var(--primary)';
        if (floatPill) floatPill.style.borderLeft = '4px solid var(--primary)';
        if (floatLabelShowEl) floatLabelShowEl.textContent = '';
        syncCarFloat();
        return;
    }
    
    if (floatLabelShowEl) floatLabelShowEl.textContent = 'Winning Decision';

    const holdYears  = parseInt(document.getElementById('holdYears').value);
    const mktReturn  = parseFloat(document.getElementById('marketReturn').value);
    const holdMonths = holdYears * 12;

    // ── Parse Optional Groups ─────────────────────────────────────────────────
    let newPrice=0, newRate=0, newTerm=0, downNew=0, newMonthly=0, newInterest=0, newDeprec=0, newOOP=0, newOpp=null;
    if (hasNew) {
        newPrice = parseFormattedNumber(document.getElementById('newPrice').value);
        newRate  = parseFloat(document.getElementById('newRate').value);
        newTerm  = parseInt(document.getElementById('newTerm').value);
        downNew  = parseFormattedNumber(document.getElementById('newDownPayment').value);
        
        newMonthly  = calcMonthlyPayment(newPrice - downNew, newRate, newTerm);
        newInterest = Math.max(0, newMonthly * newTerm - (newPrice - downNew));
        newDeprec   = calcDepreciation(newPrice, holdYears, true);
        newOOP      = downNew + (newMonthly * newTerm);
        newOpp      = calcFVLumpSumGains(downNew, mktReturn, holdYears) + calcFVAnnuityGains(newMonthly, mktReturn, Math.min(newTerm, holdMonths));
    }

    let usedPrice=0, usedRate=0, usedTerm=0, downUsed=0, usedMonthly=0, usedInterest=0, usedDeprec=0, usedOOP=0, usedOpp=null;
    if (hasUsed) {
        usedPrice = parseFormattedNumber(document.getElementById('usedPrice').value);
        usedRate  = parseFloat(document.getElementById('usedRate').value);
        usedTerm  = parseInt(document.getElementById('usedTerm').value);
        downUsed  = parseFormattedNumber(document.getElementById('usedDownPayment').value);
            
        usedMonthly  = calcMonthlyPayment(usedPrice - downUsed, usedRate, usedTerm);
        usedInterest = Math.max(0, usedMonthly * usedTerm - (usedPrice - downUsed));
        usedDeprec   = calcDepreciation(usedPrice, holdYears, false);
        usedOOP      = downUsed + (usedMonthly * usedTerm);
        usedOpp      = calcFVLumpSumGains(downUsed, mktReturn, holdYears) + calcFVAnnuityGains(usedMonthly, mktReturn, Math.min(usedTerm, holdMonths));
    }

    let leaseDue=0, leasePmt=0, leaseTerm=0, numLeases=0, leaseInterest=0, leaseDeprec=0, leaseOOP=0, leaseOpp=null;
    if (hasLease) {
        leaseDue  = parseFormattedNumber(document.getElementById('leaseDueAtSigning').value);
        leasePmt  = parseFormattedNumber(document.getElementById('leaseMonthly').value);
        leaseTerm = parseInt(document.getElementById('leaseTerm').value);
        
        numLeases   = Math.ceil(holdMonths / leaseTerm);
        leaseOOP    = (leaseDue * numLeases) + (leasePmt * holdMonths);
        leaseDeprec = leaseOOP; 
        leaseInterest = 0; 
        
        leaseOpp = 0;
        for(let i=0; i<numLeases; i++) {
            const yearsRemaining = holdYears - (i * leaseTerm / 12);
            if (yearsRemaining > 0) leaseOpp += calcFVLumpSumGains(leaseDue, mktReturn, yearsRemaining);
        }
        leaseOpp += calcFVAnnuityGains(leasePmt, mktReturn, holdMonths);
    }

    // ── Opportunity Cost Normalisation ────────────────────────────────────────
    const validOpps = [newOpp, usedOpp, leaseOpp].filter(v => v !== null);
    const minOpp    = validOpps.length > 0 ? Math.min(...validOpps) : 0;

    const newOppAdj   = hasNew   ? newOpp - minOpp : null;
    const usedOppAdj  = hasUsed  ? usedOpp - minOpp : null;
    const leaseOppAdj = hasLease ? leaseOpp - minOpp : null;

    const newAllIn   = hasNew   ? newInterest + newDeprec + newOppAdj : null;
    const usedAllIn  = hasUsed  ? usedInterest + usedDeprec + usedOppAdj : null;
    const leaseAllIn = hasLease ? leaseInterest + leaseDeprec + leaseOppAdj : null;

    // ── Verdict ───────────────────────────────────────────────────────────────
    verdictEl.style.color = '';
    const fmtC = v => '$' + Math.round(v).toLocaleString('en-US');
    
    const results = [];
    if (hasNew)   results.push({ name: 'New Car', cost: newAllIn,  color: '#2563EB' });
    if (hasUsed)  results.push({ name: 'Used Car', cost: usedAllIn, color: '#10B981' });
    if (hasLease) results.push({ name: 'Leased Car', cost: leaseAllIn, color: '#8B5CF6' });

    results.sort((a, b) => a.cost - b.cost);
    const winner = results[0];

    if (winner.name === 'New Car') winnerKey = 'new';
    if (winner.name === 'Used Car') winnerKey = 'used';
    if (winner.name === 'Leased Car') winnerKey = 'lease';

    function pickWinnerValue(n, u, l) {
        if (winnerKey === 'new') return fmtC(n);
        if (winnerKey === 'used') return fmtC(u);
        if (winnerKey === 'lease') return fmtC(l);
        return '--';
    }

    const runnerUp = results[1];
    verdictEl.textContent = `${winner.name} Wins`;
    card.style.borderLeft = `4px solid ${winner.color}`;
    if (floatPill) floatPill.style.borderLeft = `4px solid ${winner.color}`;

    if (results.length === 2) {
        subtitleEl.textContent = `Saves you ${fmtC(runnerUp.cost - winner.cost)} over the ${runnerUp.name}.`;
    } else {
        const thirdPlace = results[2];
        subtitleEl.textContent = `Saves ${fmtC(runnerUp.cost - winner.cost)} over ${runnerUp.name}, and ${fmtC(thirdPlace.cost - winner.cost)} over ${thirdPlace.name}.`;
    }

    let winnerLabel = winner.name;
    document.querySelectorAll('.result-subtitle.dyn-labels').forEach(el => el.textContent = winnerLabel);

    document.getElementById('monthlyPayments').textContent   = pickWinnerValue(newMonthly, usedMonthly, leasePmt);
    document.getElementById('totalInterest').textContent     = pickWinnerValue(newInterest, usedInterest, leaseInterest);
    document.getElementById('totalDepreciation').textContent = pickWinnerValue(newDeprec, usedDeprec, leaseDeprec);
    document.getElementById('opportunityCost').textContent   = pickWinnerValue(newOppAdj, usedOppAdj, leaseOppAdj);
    document.getElementById('trueCost').textContent          = pickWinnerValue(newOOP, usedOOP, leaseOOP);
    document.getElementById('trueCostLoss').textContent      = pickWinnerValue(newAllIn, usedAllIn, leaseAllIn);

    // ── Breakdowns ────────────────────────────────────────────────────────────
    const rowS = `display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px solid #f1f5f9; font-size: 0.82rem; gap: 12px;`;
    const lblS = `color: #6b7280; white-space: nowrap;`;
    const valS = `font-weight: 700; color: #111827; white-space: nowrap;`;
    const totRowS = `display: flex; justify-content: space-between; align-items: center; padding: 7px 0 2px; font-size: 0.84rem; gap: 12px;`;
    const totLblS = `font-weight: 700; color: #374151;`;
    const totValS = `font-weight: 800; color: var(--primary, #2563eb);`;

    function bRow(label, val, isTotal = false) {
        return `<div style="${isTotal ? totRowS : rowS}"><span style="${isTotal ? totLblS : lblS}">${label}</span><span style="${isTotal ? totValS : valS}">${fmtC(val)}</span></div>`;
    }

    function buildBreakdown(title, nVal, uVal, lVal) {
        let html = `<div style="margin-top:12px; border-top:1px solid #f1f5f9; padding-top:4px;">`;
        if (title) html += `<div style="color:#6b7280; font-size:0.82rem; margin-bottom:8px;">${title}</div>`;
        const vals = [];
        if (hasNew)   { html += bRow('New Car', nVal); vals.push(nVal); }
        if (hasUsed)  { html += bRow('Used Car', uVal); vals.push(uVal); }
        if (hasLease) { html += bRow('Leased Car', lVal); vals.push(lVal); }
        if (vals.length > 1) {
            html += bRow('Difference (Highest vs Lowest)', Math.max(...vals) - Math.min(...vals), true);
        }
        html += `</div>`;
        return html;
    }

    document.getElementById('monthlyBreakdown').innerHTML      = buildBreakdown('', newMonthly, usedMonthly, leasePmt);
    document.getElementById('trueCostBreakdown').innerHTML     = buildBreakdown('', newOOP, usedOOP, leaseOOP);
    document.getElementById('interestBreakdown').innerHTML     = buildBreakdown('', newInterest, usedInterest, leaseInterest);
    document.getElementById('depreciationBreakdown').innerHTML = buildBreakdown('', newDeprec, usedDeprec, leaseDeprec);
    document.getElementById('oppCostBreakdown').innerHTML      = buildBreakdown('Investment gains forfeited by choosing the costlier option:', newOppAdj, usedOppAdj, leaseOppAdj);
    document.getElementById('trueCostLossBreakdown').innerHTML = buildBreakdown(`Total interest paid + depreciation loss + opportunity cost of investing savings at ${mktReturn}%/yr over ${holdYears} yrs.`, newAllIn, usedAllIn, leaseAllIn);

    document.getElementById('carFloat-value').textContent = winner.name;
    syncCarFloat();

    // ── Chart ─────────────────────────────────────────────────────────────────
    const chartLabels = [];
    const intData = [], depData = [], oppData = [];

    if (hasNew) { chartLabels.push('New Car'); intData.push(Math.round(newInterest)); depData.push(Math.round(newDeprec)); oppData.push(Math.round(newOppAdj)); }
    if (hasUsed) { chartLabels.push('Used Car'); intData.push(Math.round(usedInterest)); depData.push(Math.round(usedDeprec)); oppData.push(Math.round(usedOppAdj)); }
    if (hasLease) { chartLabels.push('Leased Car'); intData.push(Math.round(leaseInterest)); depData.push(Math.round(leaseDeprec)); oppData.push(Math.round(leaseOppAdj)); }

    renderCarChart(chartLabels, intData, depData, oppData);
    saveToStorage();
}

// ─── Chart ────────────────────────────────────────────────────────────────────

function renderCarChart(labels, interestData, deprecData, oppData) {
    const canvas = document.getElementById('carChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (carChart) carChart.destroy();

    carChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Interest Paid',    data: interestData, backgroundColor: '#3B82F6', borderRadius: 4 },
                { label: 'Depreciation / Rent', data: deprecData, backgroundColor: '#EF4444', borderRadius: 4 },
                { label: 'Opportunity Cost', data: oppData,      backgroundColor: '#F59E0B', borderRadius: 4 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2,
            scales: {
                x: { stacked: true, grid: { display: false } },
                y: {
                    stacked: true,
                    ticks: {
                        color: '#9CA3AF',
                        callback: v => v >= 1000000 ? '$' + (v / 1000000).toFixed(1) + 'M' : '$' + (v / 1000).toFixed(0) + 'k'
                    },
                    grid: { color: '#E5E7EB' }
                }
            },
            plugins: {
                legend: { position: 'bottom', labels: { usePointStyle: true } },
                tooltip: {
                    callbacks: {
                        label: ctx => (ctx.dataset.label || '') + ': $' + Math.round(ctx.parsed.y).toLocaleString('en-US')
                    }
                }
            }
        }
    });
}

let resultCardIsOffScreen = false;

function syncCarFloat() {
    const floatPill = document.getElementById('carFloat');
    const verdictText = document.getElementById('carVerdict').textContent;
    const verdictTextEl = document.getElementById('carVerdict');
    const verdictValue = document.getElementById('carFloat-value');

    verdictValue.textContent = verdictText;
    floatcolor = verdictTextEl.style.color
    verdictValue.style.color = floatcolor;

    const isScrolledDown = window.scrollY > 150;
    
    if (resultCardIsOffScreen && isScrolledDown) {
        floatPill.classList.add('visible');
    } else {
        floatPill.classList.remove('visible');
    }
}

function initCarFloat() {
    const target = document.getElementById('resultsFloatShow');
    if (!target) return;

    const observer = new IntersectionObserver(entries => {
        resultCardIsOffScreen = !entries[0].isIntersecting;
        syncCarFloat();
    }, { threshold: 0.1 });

    observer.observe(target);
    window.addEventListener('scroll', syncCarFloat);
}

// ─── Local Storage & State ────────────────────────────────────────────────────

function saveToStorage() {
    const data = {};
    STATE_IDS.forEach(id => { const el = document.getElementById(id); if (el) data[id] = el.value; });
    localStorage.setItem('carCostData', JSON.stringify(data));
}

function loadFromStorage() {
    const saved = localStorage.getItem('carCostData');
    if (!saved) return;
    try {
        const data = JSON.parse(saved);
        Object.keys(data).forEach(key => {
            const el = document.getElementById(key);
            if (el) el.value = data[key];
        });
    } catch (e) {}
}

function clearAll() {
    STATE_IDS.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    localStorage.removeItem('carCostData');
    setResultsEmpty();

    const verdictEl = document.getElementById('carVerdict');
    if (verdictEl) {
        verdictEl.textContent = 'Fill in at least two car profiles and shared parameters to compare';
        verdictEl.style.color = '#6B7280';
        const card = verdictEl.parentElement;
        if (card) card.style.borderLeft = '4px solid var(--primary)';
    }
    document.getElementById('carVerdictSubtitle').textContent = '';
}

// ── Sharing ───────────────────────────────────────────────────────────────────

function copyShareLink() {
    const params = new URLSearchParams();
    STATE_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el && el.value) params.set(id, el.value);
    });

    const shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    const btn = document.getElementById('shareLinkBtn');
    btn.disabled = true;

    navigator.clipboard.writeText(shareUrl).then(() => {
        const originalText = btn.textContent;
        btn.textContent = '✓ Link Copied!';
        setTimeout(() => { btn.textContent = originalText; btn.disabled = false; }, 2000);
    }).catch(err => {
        btn.disabled = false;
        console.error(err);
    });
}

function loadFromUrl() {
    const params = new URLSearchParams(window.location.search);
    let hasParams = false;
    STATE_IDS.forEach(id => {
        if (params.has(id)) {
            const el = document.getElementById(id);
            if (el) { el.value = params.get(id); hasParams = true; }
        }
    });
    return hasParams;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
    const loadedFromUrl = loadFromUrl();
    if (!loadedFromUrl) loadFromStorage();

    if (loadedFromUrl) {
        setTimeout(() => {
            const el = document.querySelector('.share-btn');
            if (el) {
                const yOffset = -120;
                const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
                window.scrollTo({ top: y, behavior: 'smooth' });
            }
        }, 50);
    }

    initCarFloat();
    calculateCarCost();
});