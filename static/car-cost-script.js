/* True Cost of Car Ownership calculator
   - Toggle button for down payment (% ↔ $), shared across new/used
   - Unified handleInput() + formatCurrencyInput()
   - Required-field validation with "Missing: ..." display
   - localStorage persistence
   - DOMContentLoaded init
*/

let carChart = null;
const STATE_IDS = ['newPrice','newRate','newTerm','usedPrice','usedRate','usedTerm',
                 'newDownPayment','usedDownPayment','holdYears','marketReturn'];

// ─── Dual-mode field state ────────────────────────────────────────────────────
const fieldModes = {
    carDownPayment: 'percent'
};

const TOGGLE_CONFIG = {
    carDownPayment: {
        percent: { label: 'Down Payment (%)', placeholder: 'e.g. 10',    inputType: 'percent',  min: 0, max: 100    },
        dollar:  { label: 'Down Payment ($)', placeholder: 'e.g. 5,000', inputType: 'currency', min: 0, max: 200000 }
    }
};

const REQUIRED_FIELDS = {
    newPrice:        'New Car Price',
    newRate:         'New Loan Rate',
    newTerm:         'New Loan Term',
    usedPrice:       'Used Car Price',
    usedRate:        'Used Loan Rate',
    usedTerm:        'Used Loan Term',
    newDownPayment:  'New Down Payment',
    usedDownPayment: 'Used Down Payment',
    holdYears:       'Hold Time',
    marketReturn:    'Market Return'
};

// ─── Currency formatting ──────────────────────────────────────────────────────

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
    calculateCarCost();
}

// ─── Toggle buttons ───────────────────────────────────────────────────────────

function toggleFieldMode(fieldId) {
    const config = TOGGLE_CONFIG[fieldId];
    fieldModes[fieldId] = fieldModes[fieldId] === 'percent' ? 'dollar' : 'percent';
    const cfg = config[fieldModes[fieldId]];

    // Both down payment inputs share the same toggle
    const targets = (fieldId === 'carDownPayment')
        ? ['newDownPayment', 'usedDownPayment']
        : [fieldId];

    targets.forEach(id => {
        const input = document.getElementById(id);
        if (!input) return;
        input.value = '';
        input.placeholder = cfg.placeholder;
        input.dataset.inputType = cfg.inputType;
        input.dataset.max = cfg.max;
        const labelEl = document.querySelector(`label[for="${id}"]`);
        if (labelEl) labelEl.textContent = cfg.label;
    });

    const btn = document.getElementById(fieldId + '-toggle');
    if (btn) {
        btn.textContent = fieldModes[fieldId] === 'percent' ? '%' : '$';
        btn.dataset.mode = fieldModes[fieldId];
    }

    calculateCarCost();
}

function initToggleButtons() {
    Object.keys(TOGGLE_CONFIG).forEach(fieldId => {
        // Anchor the single toggle button to the newDownPayment input group
        const anchorId = (fieldId === 'carDownPayment') ? 'newDownPayment' : fieldId;
        const anchorInput = document.getElementById(anchorId);
        if (!anchorInput) return;

        const mode = fieldModes[fieldId];
        const cfg  = TOGGLE_CONFIG[fieldId][mode];

        // Apply initial config to both inputs
        const targets = (fieldId === 'carDownPayment')
            ? ['newDownPayment', 'usedDownPayment']
            : [fieldId];

        targets.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.dataset.inputType = cfg.inputType;
            el.placeholder       = cfg.placeholder;
            el.dataset.min       = cfg.min ?? '';
            el.dataset.max       = cfg.max ?? '';
            const labelEl = document.querySelector(`label[for="${id}"]`);
            if (labelEl) labelEl.textContent = cfg.label;
            el.setAttribute('oninput', 'handleInput(this)');
        });

        // Wrap the anchor input with the toggle button
        const wrapper = document.createElement('div');
        wrapper.className = 'input-toggle-wrapper';
        anchorInput.parentNode.insertBefore(wrapper, anchorInput);
        wrapper.appendChild(anchorInput);

        const btn = document.createElement('button');
        btn.type      = 'button';
        btn.id        = fieldId + '-toggle';
        btn.className = 'unit-toggle-btn';
        btn.textContent  = mode === 'percent' ? '%' : '$';
        btn.dataset.mode = mode;
        btn.title        = 'Click to switch between % and $';
        btn.addEventListener('click', () => toggleFieldMode(fieldId));
        wrapper.appendChild(btn);
    });
}

// ─── Validation helper ────────────────────────────────────────────────────────

function setResultsEmpty() {
    ['monthlyPayments', 'totalInterest', 'totalDepreciation',
     'opportunityCost', 'trueCost', 'trueCostLoss']
        .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '--'; });

    ['monthlyBreakdown', 'interestBreakdown', 'depreciationBreakdown',
     'oppCostBreakdown', 'trueCostLossBreakdown', 'trueCostBreakdown']
        .forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });

    if (carChart) { carChart.destroy(); carChart = null; }
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

/**
 * Standard amortised monthly payment.
 * P × [r(1+r)^n] ÷ [(1+r)^n − 1]
 * where r = monthly rate, n = term in months.
 */
function calcMonthlyPayment(principal, annualRatePct, months) {
    if (principal <= 0 || months <= 0) return 0;
    const r = annualRatePct / 100 / 12;
    if (r === 0) return principal / months;
    return principal * (r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}

/**
 * Depreciation loss over the hold period.
 * New car: 20 % drop in Year 1, then 15 %/yr thereafter.
 * Used car: 15 %/yr every year (Year-1 cliff already absorbed).
 * Returns: purchase price − residual value = total depreciation loss.
 */
function calcDepreciation(price, years, isNew = true) {
    let value = price;
    for (let y = 1; y <= years; y++) {
        value *= (isNew && y === 1) ? 0.80 : 0.85;
    }
    return price - value;  // positive = amount lost
}

/**
 * Investment GAINS on a lump-sum (e.g. down-payment difference).
 * Uses monthly compounding of the annual rate over the hold period.
 * Returns only the gains (FV − principal), not the full FV,
 * because the principal is money already accounted for as a car expense.
 */
function calcFVLumpSumGains(principal, annualRatePct, years) {
    if (principal <= 0 || years <= 0) return 0;
    const r      = annualRatePct / 100 / 12;
    const months = years * 12;
    if (r === 0) return 0;
    return principal * Math.pow(1 + r, months) - principal;
}

/**
 * Investment GAINS on a recurring monthly contribution (payment difference).
 * FV of ordinary annuity: PMT × [(1+r)^n − 1] ÷ r
 * Returns only the gains (FV − total principal contributed).
 */
function calcFVAnnuityGains(pmt, annualRatePct, months) {
    if (pmt <= 0 || months <= 0) return 0;
    const r = annualRatePct / 100 / 12;
    if (r === 0) return 0;
    const fv = pmt * (Math.pow(1 + r, months) - 1) / r;
    return fv - (pmt * months);  // gains only
}

// ─── Main calculation ─────────────────────────────────────────────────────────

function calculateCarCost() {
    // Validate all required fields
    const missing = [];
    for (const [id, label] of Object.entries(REQUIRED_FIELDS)) {
        const raw = (document.getElementById(id)?.value || '').trim().replace(/,/g, '');
        if (raw === '' || isNaN(parseFloat(raw))) missing.push(label);
    }

    const verdictEl  = document.getElementById('carVerdict');
    const subtitleEl = document.getElementById('carVerdictSubtitle');

    if (missing.length > 0) {
        setResultsEmpty();
        if (missing.length === Object.keys(REQUIRED_FIELDS).length || missing.length > 3) {
            // If everything is missing OR more than 3 things are missing
            verdictEl.textContent = 'Fill in fields to calculate';
        } else {
            // If 1-3 things are missing, list them
            verdictEl.textContent = 'Missing: ' + missing.join(', ');
        }
        verdictEl.style.color = '#6B7280';
        subtitleEl.textContent = '';
        const card = verdictEl.parentElement;
        if (card) card.style.borderLeft = '4px solid var(--primary)';
        return;
    }

    // ── Parse inputs ──────────────────────────────────────────────────────────
    const newPrice  = parseFormattedNumber(document.getElementById('newPrice').value);
    const usedPrice = parseFormattedNumber(document.getElementById('usedPrice').value);
    const newRate   = parseFloat(document.getElementById('newRate').value);
    const newTerm   = parseInt(document.getElementById('newTerm').value);
    const usedRate  = parseFloat(document.getElementById('usedRate').value);
    const usedTerm  = parseInt(document.getElementById('usedTerm').value);
    const holdYears = parseInt(document.getElementById('holdYears').value);
    const mktReturn = parseFloat(document.getElementById('marketReturn').value);
    const holdMonths = holdYears * 12;

    // ── Down payments ─────────────────────────────────────────────────────────
    let downNew, downUsed;
    if (fieldModes.carDownPayment === 'percent') {
        const pctNew  = parseFloat(document.getElementById('newDownPayment').value  || 0) / 100;
        const pctUsed = parseFloat(document.getElementById('usedDownPayment').value || 0) / 100;
        downNew  = newPrice  * pctNew;
        downUsed = usedPrice * pctUsed;
    } else {
        downNew  = parseFormattedNumber(document.getElementById('newDownPayment').value);
        downUsed = parseFormattedNumber(document.getElementById('usedDownPayment').value);
        // Down payment can't exceed the car price
        downNew  = Math.min(downNew,  newPrice);
        downUsed = Math.min(downUsed, usedPrice);
    }

    // ── Monthly loan payments ─────────────────────────────────────────────────
    const newMonthly  = calcMonthlyPayment(newPrice  - downNew,  newRate,  newTerm);
    const usedMonthly = calcMonthlyPayment(usedPrice - downUsed, usedRate, usedTerm);

    // ── Total interest paid (over each car's full loan term) ──────────────────
    const newInterest  = Math.max(0, newMonthly  * newTerm  - (newPrice  - downNew));
    const usedInterest = Math.max(0, usedMonthly * usedTerm - (usedPrice - downUsed));

    // ── Depreciation over the hold period ─────────────────────────────────────
    const newDeprec  = calcDepreciation(newPrice,  holdYears, true);
    const usedDeprec = calcDepreciation(usedPrice, holdYears, false);

    // ── Opportunity cost: gains from investing the savings ────────────────────
    //
    // Down-payment difference: invested as a lump sum for the full hold period.
    const downDiff    = Math.abs(downNew - downUsed);
    const oppCostDown = calcFVLumpSumGains(downDiff, mktReturn, holdYears);

    // Monthly-payment difference: invested each month.
    // Cap the term at holdMonths - you can't invest savings beyond the hold period.
    // Use the loan term of the car with the higher payment, capped at holdMonths.
    const paymentDiff   = Math.abs(newMonthly - usedMonthly);
    const relevantTerm  = Math.min(
        newMonthly >= usedMonthly ? newTerm : usedTerm,
        holdMonths
    );
    const oppCostMonthly = calcFVAnnuityGains(paymentDiff, mktReturn, relevantTerm);

    const totalOppCost = oppCostDown + oppCostMonthly;

    // ── Attribute full opportunity cost to the costlier car by total outflow ──
    // Opportunity cost is the penalty for choosing the more expensive path overall.
    // Splitting oppCostDown and oppCostMonthly independently (e.g. one car has
    // higher down payment, the other higher monthly) leaves each car short by
    // half the total - the True Cost would be understated by exactly the missing
    // component. Instead: compare total cash outflow (down + all payments) and
    // assign the entire penalty to whichever car costs more to own.
    const newTotalOutflow  = downNew  + (newMonthly  * newTerm);
    const usedTotalOutflow = downUsed + (usedMonthly * usedTerm);
    const newIsCostlier    = newTotalOutflow >= usedTotalOutflow;

    // ── True Cost = Interest + Depreciation + Opportunity Cost ────────────────
    // Represents the total economic loss of ownership over the hold period.
    const newAllIn  = newInterest  + newDeprec  + (newIsCostlier  ? totalOppCost : 0);
    const usedAllIn = usedInterest + usedDeprec + (!newIsCostlier ? totalOppCost : 0);

    // ── Total out-of-pocket cash spent (down payment + all loan payments) ─────
    const newOOP  = downNew  + (newMonthly  * newTerm);
    const usedOOP = downUsed + (usedMonthly * usedTerm);

    // ── UI formatting helper ──────────────────────────────────────────────────
    const fmt = v => '$' + Math.round(v).toLocaleString('en-US');

    // ── Main result values ────────────────────────────────────────────────────
    document.getElementById('monthlyPayments').textContent   = `${fmt(newMonthly)} / ${fmt(usedMonthly)}`;
    document.getElementById('totalInterest').textContent     = `${fmt(newInterest)} / ${fmt(usedInterest)}`;
    document.getElementById('totalDepreciation').textContent = `${fmt(newDeprec)} / ${fmt(usedDeprec)}`;
    document.getElementById('opportunityCost').textContent   = fmt(totalOppCost);
    document.getElementById('trueCost').textContent          = `${fmt(newOOP)} / ${fmt(usedOOP)}`;
    document.getElementById('trueCostLoss').textContent      = `${fmt(newAllIn)} / ${fmt(usedAllIn)}`;

    // ── Breakdown row helper ──────────────────────────────────────────────────
    const breakdownRowStyle = `
        display: flex; justify-content: space-between; align-items: center;
        padding: 5px 0; border-bottom: 1px solid #f1f5f9;
        font-size: 0.82rem; gap: 12px;
    `;
    const breakdownLabelStyle = `color: #6b7280; white-space: nowrap;`;
    const breakdownValueStyle = `font-weight: 700; color: #111827; white-space: nowrap;`;
    const breakdownTotalStyle = `
        display: flex; justify-content: space-between; align-items: center;
        padding: 7px 0 2px; font-size: 0.84rem; gap: 12px;
    `;
    const breakdownTotalLabelStyle = `font-weight: 700; color: #374151;`;
    const breakdownTotalValueStyle = `font-weight: 800; color: var(--primary, #2563eb);`;

    function bRow(label, val, isTotal = false) {
        const rowS = isTotal ? breakdownTotalStyle     : breakdownRowStyle;
        const lblS = isTotal ? breakdownTotalLabelStyle : breakdownLabelStyle;
        const valS = isTotal ? breakdownTotalValueStyle : breakdownValueStyle;
        return `<div style="${rowS}"><span style="${lblS}">${label}</span><span style="${valS}">${fmt(val)}</span></div>`;
    }

    // ── Breakdowns ────────────────────────────────────────────────────────────
    document.getElementById('monthlyBreakdown').innerHTML = `
        <div style="margin-top:12px; border-top:1px solid #f1f5f9; padding-top:4px;">
            ${bRow('New Car', newMonthly)}
            ${bRow('Used Car', usedMonthly)}
            ${bRow('Difference', Math.abs(newMonthly - usedMonthly), true)}
        </div>
    `;

    document.getElementById('trueCostBreakdown').innerHTML = `
        <div style="margin-top:12px; border-top:1px solid #f1f5f9; padding-top:4px;">
            ${bRow('New Car Total', newOOP)}
            ${bRow('Used Car Total', usedOOP)}
            ${bRow('Cash Savings', Math.abs(newOOP - usedOOP), true)}
        </div>
    `;

    document.getElementById('interestBreakdown').innerHTML = `
        <div style="margin-top:12px; border-top:1px solid #f1f5f9; padding-top:4px;">
            ${bRow('New Car', newInterest)}
            ${bRow('Used Car', usedInterest)}
            ${bRow('Difference', Math.abs(newInterest - usedInterest), true)}
        </div>
    `;

    document.getElementById('depreciationBreakdown').innerHTML = `
        <div style="margin-top:12px; border-top:1px solid #f1f5f9; padding-top:4px;">
            ${bRow('New Car', newDeprec)}
            ${bRow('Used Car', usedDeprec)}
            ${bRow('Difference', Math.abs(newDeprec - usedDeprec), true)}
        </div>
    `;

    document.getElementById('oppCostBreakdown').innerHTML = `
        <div style="margin-top:12px; border-top:1px solid #f1f5f9; padding-top:4px;">
            <div style="color:#6b7280; font-size:0.82rem; margin-bottom:8px;">
                Investment gains forfeited by choosing the costlier option:
            </div>
            ${bRow('Down Payment Gains (' + holdYears + ' yrs)', oppCostDown)}
            ${bRow('Monthly Payment Gains (' + relevantTerm + ' mo)', oppCostMonthly)}
            ${bRow('Total', totalOppCost, true)}
        </div>
    `;

    document.getElementById('trueCostLossBreakdown').innerHTML = `
        <div style="margin-top:12px; border-top:1px solid #f1f5f9; padding-top:4px;">
            <div style="color:#6b7280; font-size:0.82rem; margin-bottom:10px;">
                True cost = total interest paid + depreciation loss + opportunity cost
                of investing the cheaper option's savings at ${mktReturn}%/yr over ${holdYears} yrs.
            </div>
            ${bRow('New True Cost', newAllIn)}
            ${bRow('Used True Cost', usedAllIn)}
            ${bRow('Difference', Math.abs(newAllIn - usedAllIn), true)}
        </div>
    `;

    // ── Verdict ───────────────────────────────────────────────────────────────
    verdictEl.style.color = '';
    const savings = newAllIn - usedAllIn;
    const card    = verdictEl.parentElement;

    if (savings > 500) {
        verdictEl.textContent  = 'Used Car Wins';
        subtitleEl.textContent = `Buying used saves you ${fmt(savings)} in true total cost.`;
        card.style.borderLeft  = '4px solid #10B981';
    } else if (savings < -500) {
        verdictEl.textContent  = 'New Car Wins';
        subtitleEl.textContent = `Surprisingly, the new car costs ${fmt(Math.abs(savings))} less in true total cost.`;
        card.style.borderLeft  = '4px solid #2563EB';
    } else {
        verdictEl.textContent  = "It's a Toss-Up";
        subtitleEl.textContent = `Difference is only ${fmt(Math.abs(savings))}. Reliability, mileage, and features should decide it.`;
        card.style.borderLeft  = '4px solid #F59E0B';
    }

    // ── Chart ─────────────────────────────────────────────────────────────────
    // Full opportunity cost goes on whichever car had the higher total outflow.
    renderCarChart(
        [Math.round(newInterest),  Math.round(usedInterest)],
        [Math.round(newDeprec),    Math.round(usedDeprec)],
        [newIsCostlier  ? Math.round(totalOppCost) : 0,
        !newIsCostlier  ? Math.round(totalOppCost) : 0]
    );

    saveToStorage();
}

// ─── Chart ────────────────────────────────────────────────────────────────────

function renderCarChart(interestData, deprecData, oppData) {
    const canvas = document.getElementById('carChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (carChart) carChart.destroy();

    carChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['New Car', 'Used Car'],
            datasets: [
                { label: 'Interest Paid',    data: interestData, backgroundColor: '#3B82F6', borderRadius: 4 },
                { label: 'Depreciation',     data: deprecData,   backgroundColor: '#EF4444', borderRadius: 4 },
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
                        callback: v => v >= 1000000
                            ? '$' + (v / 1000000).toFixed(1) + 'M'
                            : '$' + (v / 1000).toFixed(0) + 'k'
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

// ─── Local storage ────────────────────────────────────────────────────────────

function saveToStorage() {
    const data = { modes: { ...fieldModes } };
    STATE_IDS.forEach(id => { const el = document.getElementById(id); if (el) data[id] = el.value; });
    localStorage.setItem('carCostData', JSON.stringify(data));
}

function loadFromStorage() {
    const saved = localStorage.getItem('carCostData');
    if (!saved) return;
    try {
        const data = JSON.parse(saved);
        if (data.modes) Object.assign(fieldModes, data.modes);
        Object.keys(data).forEach(key => {
            if (key === 'modes') return;
            const el = document.getElementById(key);
            if (el) el.value = data[key];
        });
    } catch (e) {}
}

// ─── Reset ────────────────────────────────────────────────────────────────────

function clearAll() {
    ['newPrice','newRate','newTerm','usedPrice','usedRate','usedTerm',
     'newDownPayment','usedDownPayment','holdYears','marketReturn']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

    // Reset down payment toggle back to percent mode
    fieldModes.carDownPayment = 'percent';
    const cfg = TOGGLE_CONFIG.carDownPayment.percent;
    ['newDownPayment', 'usedDownPayment'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.placeholder       = cfg.placeholder;
        el.dataset.inputType = cfg.inputType;
        el.dataset.min       = cfg.min ?? '';
        el.dataset.max       = cfg.max ?? '';
        const labelEl = document.querySelector(`label[for="${id}"]`);
        if (labelEl) labelEl.textContent = cfg.label;
    });
    const btn = document.getElementById('carDownPayment-toggle');
    if (btn) { btn.textContent = '%'; btn.dataset.mode = 'percent'; }

    localStorage.removeItem('carCostData');
    setResultsEmpty();

    const verdictEl = document.getElementById('carVerdict');
    if (verdictEl) {
        verdictEl.textContent = 'Fill in fields to calculate';
        verdictEl.style.color = '#6B7280';
        const card = verdictEl.parentElement;
        if (card) card.style.borderLeft = '4px solid var(--primary)';
    }
    document.getElementById('carVerdictSubtitle').textContent = '';
}

// ── Sharing & Export ─────────────────────────────────────────────────────────

function copyShareLink() {
    const params = new URLSearchParams();
    
    // Grab all current values and put them in the URL parameters
    STATE_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el && el.value) {
            params.set(id, el.value);
        }
    });

    // Build the final URL
    const shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;

    // Copy to clipboard
    const btn = document.getElementById('shareLinkBtn');
    btn.disabled = true;

    navigator.clipboard.writeText(shareUrl).then(() => {
        const originalText = btn.textContent;
        btn.textContent = '✓ Link Copied!';

        setTimeout(() => {
            btn.textContent = originalText;
            btn.disabled = false;
        }, 2000);
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
            if (el) {
                el.value = params.get(id);
                hasParams = true;
            }
        }
    });

    return hasParams; // Returns true if the URL had data in it
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
    // 1. Check if the user arrived via a shared link
    const loadedFromUrl = loadFromUrl();

    // 2. If no link data, try to load from their previous session
    if (!loadedFromUrl) {
        loadFromStorage();
    }

    if (loadedFromUrl) {
        setTimeout(() => {
            const el = document.querySelector('.share-btn');
            if (el) {
                const yOffset = -120; // adjust this (px above the button)
                const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;

                window.scrollTo({
                    top: y,
                    behavior: 'smooth'
                });
            }
        }, 50);
    }

    initToggleButtons();

    const hasData = Object.keys(REQUIRED_FIELDS).every(id => {
        const v = (document.getElementById(id)?.value || '').trim().replace(/,/g, '');
        return v !== '' && !isNaN(parseFloat(v));
    });

    if (hasData) {
        calculateCarCost();
    } else {
        setResultsEmpty();
        const verdictEl = document.getElementById('carVerdict');
        if (verdictEl) { verdictEl.textContent = 'Fill in fields to calculate'; verdictEl.style.color = '#6B7280'; }
    }
});