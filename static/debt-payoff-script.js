let debtChart = null;
let debtCounter = 0;

// Format number with commas
function formatNumber(input) {
    let value = input.value.replace(/,/g, '');
    if (!isNaN(value) && value !== '') {
        input.value = parseFloat(value).toLocaleString('en-US');
    }
}

// Parse formatted number
function parseFormattedNumber(value) {
    if (!value) return 0;
    return parseFloat(value.replace(/,/g, '')) || 0;
}

// Clamp text inputs that have a data-max attribute
function clampDebtInput(input) {
    const max = parseFloat(input.dataset.max);
    if (isNaN(max)) return;
    const val = parseFormattedNumber(input.value);
    if (val > max) input.value = Math.round(max).toLocaleString('en-US');
}

// ── Empty-state helpers ──────────────────────────────────────────────────────

function setDebtResultsEmpty(message) {
    const msg = message || '--';
    document.getElementById('actionPlan').innerHTML     = msg;
    document.getElementById('bestMethod').textContent  = '--';
    document.getElementById('bestMethod').style.color  = '';
    document.getElementById('debtExtraSavings').textContent = '--';
    document.getElementById('debtTimeSaved').textContent    = '';
    document.getElementById('avalancheTime').textContent    = '--';
    document.getElementById('avalancheInterest').textContent = '';
    document.getElementById('avalancheDate').textContent    = '';
    document.getElementById('snowballTime').textContent     = '--';
    document.getElementById('snowballInterest').textContent = '';
    document.getElementById('snowballDate').textContent     = '';
    if (debtChart) { debtChart.destroy(); debtChart = null; }
    syncDebtFloat();
}

// Get future date
function getFutureDate(months) {
    const date = new Date();
    date.setMonth(date.getMonth() + months);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// Initialize debts
function initializeDebts() {
    const saved = localStorage.getItem('debtPayoffData');
    if (!saved) {
        const defaultDebts = [
            { balance: '', rate: '', min: '' },
        ];
        defaultDebts.forEach(debt => {
            addDebt(debt.balance, debt.rate, debt.min);
        });
    }
    loadFromStorage();
}

// Add debt
function addDebt(balance = '', rate = '', min = '') {
    const debtList = document.getElementById('debtList');
    const debtId = ++debtCounter;
    const debtNumber = debtList.querySelectorAll('.debt-item').length + 1;

    const debtItem = document.createElement('div');
    debtItem.className = 'debt-item';
    debtItem.id = `debt-${debtId}`;
    debtItem.innerHTML = `
        <div class="debt-item-header">
            <div class="debt-item-title" data-name="Debt #${debtNumber}">Debt #${debtNumber}</div>
            ${debtNumber > 1 ? '<button class="debt-remove-btn" onclick="removeDebt(' + debtId + ')">×</button>' : ''}
        </div>
        <div class="input-group" style="margin-bottom: 0.75rem; margin-top: 0rem;">
            <label>Balance ($)</label>
            <input type="text" inputmode="decimal" class="debt-balance" data-id="${debtId}"
                   value="${balance !== '' ? Number(balance).toLocaleString() : ''}"
                   placeholder="e.g. 5,000"
                   data-max="2000000"
                   oninput="formatNumber(this); clampDebtInput(this); calculateDebt(); saveToStorage()">
        </div>
        <div class="input-group" style="margin-bottom: 0.75rem;">
            <label>APR (%)</label>
            <input type="number" class="debt-rate" data-id="${debtId}" value="${rate}"
                   placeholder="e.g. 18.9"
                   min="0.01" max="100" step="0.1"
                   oninput="calculateDebt(); saveToStorage()">
        </div>
        <div class="input-group" style="margin-bottom: 0.75rem;">
            <label>Min Payment ($)</label>
            <input type="text" inputmode="decimal" class="debt-min" data-id="${debtId}" value="${min}"
                   placeholder="Optional"
                   data-max="50000"
                   oninput="formatNumber(this); clampDebtInput(this); calculateDebt(); saveToStorage()">
        </div>
    `;

    debtList.appendChild(debtItem);
    calculateDebt();
}

// Remove debt
function removeDebt(id) {
    const debtItem = document.getElementById(`debt-${id}`);
    if (debtItem) {
        debtItem.remove();
        document.querySelectorAll('.debt-item').forEach((elem, i) => {
            const n = i + 1;
            const titleEl = elem.querySelector('.debt-item-title');
            titleEl.textContent = `Debt #${n}`;
            titleEl.setAttribute('data-name', `Debt #${n}`);
        });
        calculateDebt();
        saveToStorage();
    }
}

function calculateDebt() {
    const debtElements = document.querySelectorAll('.debt-item');
    const debts = [];
    let totalMinimums = 0;
    let allMinimumsFilled = true;
    const missing = [];

    debtElements.forEach((elem, index) => {
        const balance = parseFormattedNumber(elem.querySelector('.debt-balance').value);
        const rateRaw = elem.querySelector('.debt-rate').value.trim();
        const rate    = parseFloat(rateRaw) / 100;
        const minValRaw   = elem.querySelector('.debt-min').value;
        const minPayment  = parseFormattedNumber(minValRaw) || 0;
        const name = elem.querySelector('.debt-item-title').getAttribute('data-name');

        if (balance > 0) {
            if (rateRaw === '' || isNaN(parseFloat(rateRaw))) {
                missing.push('APR for ' + name);
                return;
            }
            debts.push({ balance, rate, minPayment, name, id: index + 1 });
            totalMinimums += minPayment;
            if (minPayment <= 0) allMinimumsFilled = false;
        }
    });

    if (debts.length === 0 && missing.length === 0) {
        setDebtResultsEmpty("You're debt-free!");
        return;
    }

    if (missing.length > 0) {
        setDebtResultsEmpty('Missing: ' + missing.join(', '));
        document.getElementById('bestmethodlabel1').textContent  = '';
        return;
    }

    document.getElementById('bestmethodlabel1').textContent  = 'Best Method';

    const basePaymentRaw = document.getElementById('monthlyPayment').value.trim();
    if (basePaymentRaw === '' || isNaN(parseFormattedNumber(basePaymentRaw))) {
        setDebtResultsEmpty('Missing: Monthly Payment');
        return;
    }

    const basePayment = parseFormattedNumber(document.getElementById('monthlyPayment').value);
    const extraPayment = parseFormattedNumber(document.getElementById('extraDebtPayment').value);
    const totalPayment = basePayment + extraPayment;

    const avalancheResult    = simulatePayoff([...debts], totalPayment, 'rate');
    const snowballResult     = simulatePayoff([...debts], totalPayment, 'balance');
    const baseAvalancheResult = simulatePayoff([...debts], basePayment, 'rate');

    const methodSavings        = snowballResult.totalInterest - avalancheResult.totalInterest;
    const extraInterestSavings = baseAvalancheResult.totalInterest - avalancheResult.totalInterest;
    const timeSaved            = baseAvalancheResult.months - avalancheResult.months;

    document.getElementById('avalancheTime').textContent     = avalancheResult.months + ' months';
    document.getElementById('avalancheInterest').textContent = 'Interest Paid: $' + avalancheResult.totalInterest.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});
    document.getElementById('avalancheDate').textContent     = 'Paid off by ' + getFutureDate(avalancheResult.months);

    document.getElementById('snowballTime').textContent     = snowballResult.months + ' months';
    document.getElementById('snowballInterest').textContent = 'Interest Paid: $' + snowballResult.totalInterest.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});
    document.getElementById('snowballDate').textContent     = 'Paid off by ' + getFutureDate(snowballResult.months);

    document.getElementById('debtExtraSavings').textContent = '$' + Math.max(0, extraInterestSavings).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});
    const timeSavedDisplay = Math.max(0, timeSaved);
    document.getElementById('debtTimeSaved').textContent = `${timeSavedDisplay} ${timeSavedDisplay === 1 ? 'Month' : 'Months'} Faster`;

    const bestStrategy = methodSavings >= 0 ? 'Avalanche' : 'Snowball';
    document.getElementById('bestMethod').textContent  = bestStrategy;
    document.getElementById('bestMethod').style.color = 'var(--primary)';

    const activeDebts   = debts.filter(d => d.balance > 0);
    const actionPlanEl  = document.getElementById('actionPlan');

    if (totalPayment > 0 && totalPayment < totalMinimums) {
        actionPlanEl.innerHTML = `<span style="color: #ef4444; font-weight: bold;">Warning: Your total monthly payment ($${totalPayment.toLocaleString()}) is less than your required minimums ($${totalMinimums.toLocaleString()}).</span>`;
    } else if (activeDebts.length > 0) {
        let sortedForPlan = [...activeDebts].sort((a, b) => b.rate - a.rate);
        let targetDebt = sortedForPlan[0];

        if (allMinimumsFilled) {
            let otherMinimums    = totalMinimums - targetDebt.minPayment;
            let amountToTarget   = totalPayment - otherMinimums;
            if (activeDebts.length > 1) {
                actionPlanEl.innerHTML = `Put <strong>$${amountToTarget.toLocaleString(undefined, {maximumFractionDigits: 0})}</strong> towards <strong>${targetDebt.name}</strong>, and pay the minimums on the rest.`;
            } else {
                actionPlanEl.innerHTML = `Put <strong>$${amountToTarget.toLocaleString(undefined, {maximumFractionDigits: 0})}</strong> towards <strong>${targetDebt.name}</strong>.`;
            }
            } else {
            if (activeDebts.length > 1) {
                actionPlanEl.innerHTML = `Put the most amount possible towards <strong>${targetDebt.name}</strong>, and pay minimums on the rest.`;
            }
            else {
                actionPlanEl.innerHTML = `Put the most amount possible towards <strong>${targetDebt.name}</strong>.`;
            }
        }
    }

    updateDebtChart(avalancheResult.timeline, snowballResult.timeline);
    syncDebtFloat();
}

function simulatePayoff(debts, totalPayment, sortBy) {
    let simDebts = debts.map(d => ({...d}));
    let months = 0;
    let totalInterest = 0;
    const timeline = [];

    while (simDebts.some(d => d.balance > 0.01)) {
        months++;
        if (months > 1200) break;

        let totalBalance = 0;

        // 1. Accrue Interest
        simDebts.forEach(d => {
            if (d.balance > 0) {
                const interest = d.balance * (d.rate / 12);
                d.balance += interest;
                totalInterest += interest;
            }
        });

        // 2. Sort Debts
        if (sortBy === 'rate') {
            simDebts.sort((a, b) => b.rate - a.rate); // Avalanche
        } else {
            simDebts.sort((a, b) => a.balance - b.balance); // Snowball
        }

        let remainingCash = totalPayment;

        // 3. Pay Minimums FIRST
        simDebts.forEach(d => {
            if (d.balance > 0) {
                let minToPay = Math.min(d.minPayment || 0, d.balance);
                if (remainingCash >= minToPay) {
                    d.balance -= minToPay;
                    remainingCash -= minToPay;
                } else {
                    d.balance -= remainingCash;
                    remainingCash = 0;
                }
            }
        });

        // 4. Allocate Remaining Cash
        for (let d of simDebts) {
            if (remainingCash <= 0) break;
            if (d.balance > 0) {
                const extraPay = Math.min(remainingCash, d.balance);
                d.balance -= extraPay;
                remainingCash -= extraPay;
            }
        }

        simDebts.forEach(d => totalBalance += Math.max(0, d.balance));
        timeline.push(totalBalance);
    }

    return { months, totalInterest, timeline };
}

function updateDebtChart(data1, data2, labels = ['Avalanche', 'Snowball']) {
    const ctx = document.getElementById('debtChart').getContext('2d');
    const months = Array.from({length: Math.max(data1.length, data2.length)}, (_, i) => i);

    if (debtChart) debtChart.destroy();

    debtChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: months,
            datasets: [{
                label: labels[0],
                data: data1,
                borderColor: '#2563EB',
                borderWidth: 3
            }, {
                label: labels[1],
                data: data2,
                borderColor: '#10B981',
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            aspectRatio: 2,
            plugins: {
                legend: { display: true, position: 'top' }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Remaining Debt ($)' },
                    ticks: { callback: v => '$' + (v / 1000).toFixed(0) + 'k' }
                },
                x: { title: { display: true, text: 'Months' } }
            }
        }
    });
}

// Show/hide the float based on whether the original result-highlight card is on-screen
let resultCardIsOffScreen = false;

// ── Floating pills ───────────────────────────────────────────────────────────
function syncDebtFloat() {
    const actionEl         = document.getElementById('actionPlan');
    const actionFloatEl    = document.getElementById('debtActionFloat');
    const actionFloatValEl = document.getElementById('debtActionFloat-value');
    const bestMethodEl     = document.getElementById('bestMethod');
    const methodFloatEl    = document.getElementById('debtMethodFloat');
    const methodFloatValEl = document.getElementById('debtMethodFloat-value');
    const methodFloatSubEl = document.getElementById('debtMethodFloat-sub');
    
    const isScrolledDown = window.scrollY > 150;

    const best     = bestMethodEl ? bestMethodEl.textContent.trim() : '';
    const isFilled = (best === 'Avalanche' || best === 'Snowball');

    // ── ALWAYS apply the border highlight ──
    if (methodFloatEl) {
        methodFloatEl.style.borderLeft = '4px solid var(--primary)';
    }
    if (actionFloatEl) {
        actionFloatEl.style.borderLeft = '4px solid var(--primary)';
    }

    // ── Method pill Content ──────────────────────────────────────────────────
    if (methodFloatValEl) {
        if (isFilled) {
            methodFloatValEl.textContent = best;
            methodFloatValEl.style.color = 'var(--primary)';
            if (methodFloatSubEl) {
                const prefix   = best === 'Avalanche' ? 'avalanche' : 'snowball';
                const timeText = (document.getElementById(prefix + 'Time')     || {}).textContent || '';
                const intText  = (document.getElementById(prefix + 'Interest') || {}).textContent || '';
                const dateText = (document.getElementById(prefix + 'Date')     || {}).textContent || '';
                methodFloatSubEl.textContent = [timeText, intText, dateText].filter(Boolean).join(' · ');
            }
        } else {
            // Show status (e.g., "Missing: APR") in gray when incomplete
            const statusText = actionEl ? actionEl.textContent : '--';
            methodFloatValEl.textContent = statusText || '--';
            methodFloatValEl.style.color = '#6B7280';
            if (methodFloatSubEl) methodFloatSubEl.textContent = '';
        }
    }
    
    // ── Action pill Content ──────────────────────────────────────────────────
    if (actionFloatValEl && actionEl) {
        actionFloatValEl.innerHTML = actionEl.innerHTML;
    }

    // ── Visibility Toggling ──────────────────────────────────────────────────
    // Evaluate if the conditions are met to show the floaters
    const canShow = resultCardIsOffScreen && isScrolledDown;

    if (methodFloatEl) {
        // Adds 'visible' if true, removes it if false
        methodFloatEl.classList.toggle('visible', canShow);
    }

    if (actionFloatEl) {
        // Only visible when off-screen, scrolled down, AND fields are filled
        actionFloatEl.classList.toggle('visible', canShow && isFilled);
    }
}

function initDebtFloat() {
    const originalCard = document.querySelector('#debtResults .result-card.result-highlight');
    if (!originalCard) return;

    const observer = new IntersectionObserver(
        entries => {
            resultCardIsOffScreen = !entries[0].isIntersecting;
            syncDebtFloat();
        },
        { threshold: 0.1 }
    );
    observer.observe(originalCard);

    // Disappears instantly when scrolling back to the top
    window.addEventListener('scroll', syncDebtFloat);
}

// ── Sharing & Export ─────────────────────────────────────────────────────────

function copyShareLink() {
    const params = new URLSearchParams();

    params.set('monthlyPayment',   document.getElementById('monthlyPayment').value);
    params.set('extraDebtPayment', document.getElementById('extraDebtPayment').value);

    const debts = [];
    document.querySelectorAll('.debt-item').forEach(elem => {
        debts.push({
            balance:    elem.querySelector('.debt-balance').value,
            rate:       elem.querySelector('.debt-rate').value,
            minPayment: elem.querySelector('.debt-min') ? elem.querySelector('.debt-min').value : ''
        });
    });
    params.set('debts', JSON.stringify(debts));

    const shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;

    const btn = document.getElementById('shareLinkBtn');
    btn.disabled = true;

    navigator.clipboard.writeText(shareUrl).then(() => {
        const originalText = btn.innerHTML;
        btn.innerHTML = '✓ Link Copied!';
        setTimeout(() => { btn.innerHTML = originalText; btn.disabled = false; }, 2000);
    }).catch(err => { btn.disabled = false; console.error(err); });
}

function loadFromUrl() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('debts') && !params.has('monthlyPayment')) return false;

    if (params.has('monthlyPayment'))   document.getElementById('monthlyPayment').value   = params.get('monthlyPayment');
    if (params.has('extraDebtPayment')) document.getElementById('extraDebtPayment').value = params.get('extraDebtPayment');

    if (params.has('debts')) {
        try {
            const debts = JSON.parse(params.get('debts'));
            const debtList = document.getElementById('debtList');
            debtList.innerHTML = '';
            debtCounter = 0;
            debts.forEach(d => addDebt(
                parseFloat((d.balance || '').replace(/,/g, '')) || '',
                d.rate       || '',
                d.minPayment || ''
            ));
        } catch (e) { console.error('Failed to parse shared debts', e); }
    }

    calculateDebt();
    return true;
}

async function downloadPDF() {
    const { jsPDF } = window.jspdf;

    const btn = document.getElementById('downloadPdfBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Generating...';
    btn.disabled = true;

    // ════════════════════════════════════════════════════════════════════════
    // REPORT DATA  ←  Only section needs to change per calculator page
    // ════════════════════════════════════════════════════════════════════════

    const REPORT = {
        title:    'Debt Payoff Report',
        filename: 'Debt-Payoff-Report.pdf',
        logoPath: `${typeof API_BASE !== 'undefined' ? API_BASE : ''}/static/logo.png`,

        // Summary rows shown in the top key-metrics strip
        // { label, value, accent: true/false }
        summary: [
            { label: 'Best Method',          value: result('bestMethod'),                                                   accent: true  },
            { label: 'Avalanche Payoff',      value: result('avalancheDate').replace('Paid off by ', ''),                   accent: false },
            { label: 'Avalanche Interest',    value: result('avalancheInterest').replace('Interest Paid: ', ''),            accent: false },
            { label: 'Snowball Payoff',       value: result('snowballDate').replace('Paid off by ', ''),                    accent: false },
            { label: 'Snowball Interest',     value: result('snowballInterest').replace('Interest Paid: ', ''),             accent: false },
            { label: 'Extra Payment Savings', value: result('debtExtraSavings') + ' · ' + result('debtTimeSaved'),         accent: true  },
        ],

        // Action plan — plain text extracted from the element
        actionPlan: (() => {
            const el = document.getElementById('actionPlan');
            return (el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim();
        })(),

        // Debt table rows — pulled dynamically from the DOM
        // Each: { name, balance, apr, minPayment }
        debts: (() => {
            const rows = [];
            document.querySelectorAll('.debt-item').forEach(elem => {
                const balance = parseFormattedNumber(elem.querySelector('.debt-balance').value);
                if (!balance) return;
                rows.push({
                    name:       elem.querySelector('.debt-item-title').getAttribute('data-name'),
                    balance:    balance,
                    apr:        parseFloat(elem.querySelector('.debt-rate').value) || 0,
                    minPayment: parseFormattedNumber(elem.querySelector('.debt-min')?.value || '0'),
                });
            });
            return rows;
        })(),

        // Payments shown below the debt table
        payments: [
            { label: 'Base Monthly Payment',  value: '$' + (document.getElementById('monthlyPayment').value || '0')   },
            { label: 'Extra Monthly Payment', value: '$' + (document.getElementById('extraDebtPayment').value || '0') },
        ],
    };

    // ════════════════════════════════════════════════════════════════════════
    // ENGINE  ←  Generic renderer, no calculator-specific logic below here
    // ════════════════════════════════════════════════════════════════════════

    // ── Constants ───────────────────────────────────────────────────────────
    const PW = 612, PH = 792, ML = 48, MR = 48, CW = PW - ML - MR;
    const ACCENT  = [37, 99, 235];   // blue — key numbers only
    const INK     = [22, 22, 22];    // near-black body text
    const MUTED   = [110, 110, 110]; // labels / secondary text
    const RULE    = [220, 220, 220]; // divider lines
    const STRIPE  = [248, 249, 251]; // table stripe
    let y = 0;

    const doc = new jsPDF({ unit: 'pt', format: 'letter' });

    // ── Tiny helpers ────────────────────────────────────────────────────────
    function sc(rgb, t = 'text') {
        if (t === 'text') doc.setTextColor(...rgb);
        else if (t === 'fill') doc.setFillColor(...rgb);
        else if (t === 'draw') doc.setDrawColor(...rgb);
    }
    function t(str, x, yy, opts = {}) { doc.text(String(str), x, yy, opts); }
    function result(id) { return (document.getElementById(id)?.textContent || '').trim(); }
    function fmtMoney(n) { return '$' + Math.round(n).toLocaleString(); }

    function hRule(x = ML, w = CW, weight = 0.5, color = RULE) {
        sc(color, 'draw'); doc.setLineWidth(weight);
        doc.line(x, y, x + w, y); y += 10;
    }

    // ── Logo loader ─────────────────────────────────────────────────────────
    let logoImg = null;
    try {
        logoImg = await new Promise((res, rej) => {
            const img = new Image();
            img.onload = () => res(img);
            img.onerror = rej;
            img.src = REPORT.logoPath;
        });
    } catch (_) { /* continue without logo */ }

    // ════════════════════════════════════════════════════════
    // HEADER
    // ════════════════════════════════════════════════════════
    const HDR_H = 62;
    sc([255,255,255], 'fill');
    doc.rect(0, 0, PW, HDR_H, 'F');

    // Logo — right-aligned, vertically centred
    if (logoImg) {
        const lh = 34;
        const lw = (logoImg.width * lh) / logoImg.height;
        doc.addImage(logoImg, 'PNG', PW - MR - lw, (HDR_H - lh) / 2, lw, lh);
    }

    // Title
    sc(INK, 'text');
    doc.setFontSize(18); doc.setFont(undefined, 'bold');
    t(REPORT.title, ML, 28);

    // Date
    sc(MUTED, 'text');
    doc.setFontSize(8); doc.setFont(undefined, 'normal');
    t('Generated ' + new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), ML, 44);

    y = HDR_H;
    sc(ACCENT, 'fill'); doc.rect(0, y, PW, 2.5, 'F');   // accent bar under header
    y += 18;

    // ════════════════════════════════════════════════════════
    // SUMMARY STRIP  (2-column label/value pairs)
    // ════════════════════════════════════════════════════════
    const validSummary = REPORT.summary.filter(s => s.value && s.value !== '--' && s.value.trim() !== '' && s.value !== '· ');
    if (validSummary.length > 0) {
        const cols = 2;
        const colW = CW / cols;
        const rowH = 22;
        const startY = y;

        validSummary.forEach((item, i) => {
            const col  = i % cols;
            const row  = Math.floor(i / cols);
            const cx   = ML + col * colW;
            const cy   = startY + row * rowH;

            doc.setFontSize(7.5); doc.setFont(undefined, 'normal');
            sc(MUTED, 'text');
            t(item.label.toUpperCase(), cx, cy + 8);

            doc.setFontSize(9.5); doc.setFont(undefined, 'bold');
            sc(item.accent ? ACCENT : INK, 'text');
            t(item.value, cx, cy + 19);
        });

        const summaryRows = Math.ceil(validSummary.length / cols);
        y = startY + summaryRows * rowH + 10;

        hRule(ML, CW, 0.75, RULE);
        y += 4;
    }

    // ════════════════════════════════════════════════════════
    // SECTION HEADING helper
    // ════════════════════════════════════════════════════════
    function sectionHeading(title) {
        doc.setFontSize(8); doc.setFont(undefined, 'bold');
        sc(ACCENT, 'text');
        t(title.toUpperCase(), ML, y);
        sc(ACCENT, 'draw'); doc.setLineWidth(1.5);
        doc.line(ML, y + 3, ML + CW, y + 3);
        sc(INK, 'text');
        y += 14;
    }

    // ════════════════════════════════════════════════════════
    // DEBT TABLE
    // ════════════════════════════════════════════════════════
    if (REPORT.debts.length > 0) {
        sectionHeading('Your Debts');

        // Column x positions
        const C_NAME = ML;
        const C_BAL  = ML + 192;
        const C_APR  = ML + 292;
        const C_MIN  = ML + 362;
        const C_INT  = ML + CW;   // right-align

        // Table header
        doc.setFontSize(7.5); doc.setFont(undefined, 'bold');
        sc(MUTED, 'text');
        t('Debt',           C_NAME, y);
        t('Balance',        C_BAL,  y);
        t('APR',            C_APR,  y);
        t('Min Payment',    C_MIN,  y);
        t('Est. Interest*', C_INT,  y, { align: 'right' });
        y += 4;
        hRule(ML, CW, 0.5, RULE);

        const ROW_H = 15;
        REPORT.debts.forEach((d, i) => {
            if (i % 2 === 1) {
                sc(STRIPE, 'fill');
                doc.rect(ML, y, CW, ROW_H, 'F');
            }

            // Estimate interest paying min-only on this debt alone
            const r = d.apr / 100 / 12;
            const pmt = d.minPayment > 0 ? d.minPayment : Math.max(d.balance * 0.02, 25);
            let estInt = 0, bal = d.balance, mo = 0;
            while (bal > 0.01 && mo < 1200) {
                const interest = bal * r; bal += interest; estInt += interest;
                bal -= Math.min(pmt, bal); mo++;
            }

            doc.setFontSize(8.5);
            sc(INK, 'text');   doc.setFont(undefined, 'normal');
            t(d.name, C_NAME, y + 10);

            sc(INK, 'text');   doc.setFont(undefined, 'bold');
            t(fmtMoney(d.balance), C_BAL, y + 10);

            sc(MUTED, 'text'); doc.setFont(undefined, 'normal');
            t(d.apr.toFixed(2) + '%', C_APR, y + 10);

            sc(INK, 'text');
            t(d.minPayment > 0 ? fmtMoney(d.minPayment) : '—', C_MIN, y + 10);

            sc(ACCENT, 'text'); doc.setFont(undefined, 'bold');
            t(fmtMoney(estInt), C_INT, y + 10, { align: 'right' });

            y += ROW_H;
        });

        hRule(ML, CW, 0.5, RULE);

        sc(MUTED, 'text'); doc.setFontSize(6.5); doc.setFont(undefined, 'italic');
        t('* Estimated total interest if only minimum payments made on each debt independently.', ML, y);
        y += 16;

        // Payments summary inline — right-aligned small text
        doc.setFontSize(8); doc.setFont(undefined, 'normal'); sc(MUTED, 'text');
        REPORT.payments.forEach(p => {
            t(p.label + ':', ML + CW - 150, y);
            sc(INK, 'text'); doc.setFont(undefined, 'bold');
            t(p.value, ML + CW, y, { align: 'right' });
            sc(MUTED, 'text'); doc.setFont(undefined, 'normal');
            y += 12;
        });
        y += 8;
    }

    // ════════════════════════════════════════════════════════
    // ACTION PLAN
    // ════════════════════════════════════════════════════════
    if (REPORT.actionPlan) {
        sectionHeading('Your Action Plan');

        // Render inside a subtle box
        const textMaxW = CW - 50;
        const lines    = doc.splitTextToSize(REPORT.actionPlan, textMaxW);
        const boxH     = lines.length * 13 + 14;

        sc(STRIPE, 'fill');
        doc.roundedRect(ML, y, CW, boxH, 3, 3, 'F');

        sc(ACCENT, 'draw'); doc.setLineWidth(2);
        doc.line(ML, y, ML, y + boxH);        // left accent bar

        sc(INK, 'text'); doc.setFontSize(9.5); doc.setFont(undefined, 'normal');
        lines.forEach((line, i) => { t(line, ML + 10, y + 10 + i * 13); });

        y += boxH + 12;
    }

    // ════════════════════════════════════════════════════════
    // FOOTER
    // ════════════════════════════════════════════════════════
    sc(RULE, 'draw'); doc.setLineWidth(0.5);
    doc.line(ML, PH - 32, PW - MR, PH - 32);
    sc(MUTED, 'text'); doc.setFontSize(7); doc.setFont(undefined, 'normal');
    t('MoneyByMath  ·  For informational purposes only. Not financial advice.', ML, PH - 20);
    t(new Date().getFullYear().toString(), PW - MR, PH - 20, { align: 'right' });

    // ── Save ────────────────────────────────────────────────────────────────
    doc.save(REPORT.filename);
    btn.innerHTML = '✓ Saved!';
    btn.disabled = false;
    setTimeout(() => (btn.innerHTML = originalText), 2000);
}

// ─── Reset ────────────────────────────────────────────────────────────────────

function clearAll() {
    document.getElementById('monthlyPayment').value = '';
    document.getElementById('extraDebtPayment').value = '';

    const debtList = document.getElementById('debtList');
    debtList.innerHTML = '';
    debtCounter = 0;
    addDebt(); // adds one blank debt row

    localStorage.removeItem('debtPayoffData');
    setDebtResultsEmpty('--');
    syncDebtFloat();
}

// ── LocalStorage ─────────────────────────────────────────────────────────────

function saveToStorage() {
    const data = {
        debts: [],
        monthlyPayment: document.getElementById('monthlyPayment').value,
        extraDebtPayment: document.getElementById('extraDebtPayment').value
    };

    document.querySelectorAll('.debt-item').forEach(elem => {
        const balance    = elem.querySelector('.debt-balance').value;
        const rate       = elem.querySelector('.debt-rate').value;
        const minPayment = elem.querySelector('.debt-min') ? elem.querySelector('.debt-min').value : '';
        data.debts.push({ balance, rate, minPayment });
    });

    localStorage.setItem('debtPayoffData', JSON.stringify(data));
}

function loadFromStorage() {
    const saved = localStorage.getItem('debtPayoffData');
    if (!saved) return;

    const data = JSON.parse(saved);

    if (data.monthlyPayment) {
        document.getElementById('monthlyPayment').value = data.monthlyPayment;
    }

    if (data.extraDebtPayment) {
        document.getElementById('extraDebtPayment').value = data.extraDebtPayment;
    }

    if (data.debts && data.debts.length > 0) {
        const debtList = document.getElementById('debtList');
        debtList.innerHTML = '';
        debtCounter = 0;

        data.debts.forEach(debt => {
            const rawBalance = parseFloat((debt.balance || '').replace(/,/g, '')) || '';
            addDebt(rawBalance, debt.rate || '', debt.minPayment || '');
        });
    }

    calculateDebt();
}

document.addEventListener('DOMContentLoaded', () => {
    const loadedFromUrl = loadFromUrl();
    if (!loadedFromUrl) {
        initializeDebts();
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

    initDebtFloat();
    document.getElementById('monthlyPayment').addEventListener('input', saveToStorage);
    document.getElementById('extraDebtPayment').addEventListener('input', saveToStorage);
});