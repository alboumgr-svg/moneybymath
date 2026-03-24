// ── State ────────────────────────────────────────────────────────────────────
let mortgageChart = null;
let amortData     = [];       // full month-by-month schedule
let amortView     = 'annual'; // 'annual' | 'monthly'

const API_BASE = 'http://localhost:5000'; // ← change to your Render URL for production

const STATE_IDS = [
    'homePrice', 'downPaymentDollar', 'downPaymentPercent',
    'loanTerm', 'rateType', 'interestRate', 'armAdjustedRate', 'startDate',
    'propertyTax', 'propertyTaxPct', 'homeInsurance', 'pmiRate', 'hoaFees', 'extraPayment', 'extraYearlyPayment',
    'originationFee', 'originationPercent', 'discountPoints', 'pointRateReduction',
    'appraisalFee', 'titleInsurance', 'recordingFees', 'otherClosingCosts'
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatNumber(input) {
    let value = input.value.replace(/,/g, '');
    if (!isNaN(value) && value !== '') {
        input.value = parseFloat(value).toLocaleString('en-US');
    }
}

function parseNum(value) {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    return parseFloat(String(value).replace(/,/g, '')) || 0;
}

function fmt(n, decimals = 0) {
    return '$' + n.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function fmtMonths(months) {
    const y = Math.floor(months / 12);
    const m = months % 12;
    const parts = [];
    if (y > 0) parts.push(y + (y === 1 ? ' year' : ' years'));
    if (m > 0) parts.push(m + (m === 1 ? ' month' : ' months'));
    return parts.join(', ') || '0 months';
}

function getFutureDate(months, startDateStr) {
    const base = startDateStr ? new Date(startDateStr + '-01') : new Date();
    base.setMonth(base.getMonth() + months);
    return base.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function clampMortgageInput(input) {
    const max = parseFloat(input.dataset.max);
    if (isNaN(max)) return;
    const val = parseNum(input.value);
    if (val > max) input.value = Math.round(max).toLocaleString('en-US');
}

function setResultsEmpty(msg) {
    document.getElementById('payoffDate').textContent        = msg || 'Fill in fields to calculate';
    document.getElementById('payoffTime').textContent        = '';
    document.getElementById('upfrontNeeded').textContent     = '--';
    document.getElementById('upfrontNeededSubtitle').textContent = '';
    document.getElementById('totalInterest').textContent     = '--';
    document.getElementById('totalCost').textContent         = '--';
    document.getElementById('interestSaved').textContent     = '--';
    document.getElementById('timeSaved').textContent         = '';
    document.getElementById('pmiMonthly').textContent        = '--';
    document.getElementById('pmiDropDate').textContent       = '';
    document.getElementById('pointsBreakeven').textContent   = '--';
    document.getElementById('armPayment').textContent        = '--';
    document.getElementById('paymentBreakdownContainer').innerHTML =
        '<div class="breakdown-empty">Fill in loan details to see your payment breakdown.</div>';
    document.getElementById('amortTableContainer').innerHTML =
        '<div class="breakdown-empty">Fill in loan details to see the amortization schedule.</div>';
    document.getElementById('closingSummary').style.display = 'none';
    if (mortgageChart) { mortgageChart.destroy(); mortgageChart = null; }
    syncFloat();
}

// ── Sync helpers ─────────────────────────────────────────────────────────────

function syncLoanAmount() {
    const homePrice  = parseNum(document.getElementById('homePrice').value);
    const downDollar = parseNum(document.getElementById('downPaymentDollar').value);
    const loan       = Math.max(0, homePrice - downDollar);
    document.getElementById('loanAmount').value = loan > 0 ? loan.toLocaleString('en-US') : '';
}

function syncDownPaymentFromDollar() {
    const homePrice  = parseNum(document.getElementById('homePrice').value);
    const downDollar = parseNum(document.getElementById('downPaymentDollar').value);
    if (homePrice > 0) {
        document.getElementById('downPaymentPercent').value =
            ((downDollar / homePrice) * 100).toFixed(2);
    }
    syncLoanAmount();
}

function syncDownPaymentFromPercent() {
    const homePrice = parseNum(document.getElementById('homePrice').value);
    const pct       = parseFloat(document.getElementById('downPaymentPercent').value) || 0;
    const dollar    = (homePrice * pct) / 100;
    document.getElementById('downPaymentDollar').value =
        dollar > 0 ? Math.round(dollar).toLocaleString('en-US') : '';
    syncLoanAmount();
}

function syncOriginationFromPercent() {
    const loanAmount = parseNum(document.getElementById('loanAmount').value);
    const pct        = parseFloat(document.getElementById('originationPercent').value) || 0;
    const fee        = (loanAmount * pct) / 100;
    document.getElementById('originationFee').value =
        fee > 0 ? Math.round(fee).toLocaleString('en-US') : '';
}

function syncOriginationFromDollar() {
    const loanAmount = parseNum(document.getElementById('loanAmount').value);
    const dollar     = parseNum(document.getElementById('originationFee').value);
    if (loanAmount > 0) {
        document.getElementById('originationPercent').value =
            ((dollar / loanAmount) * 100).toFixed(2);
    }
}

function syncPropertyTaxFromPercent() {
    const homePrice = parseNum(document.getElementById('homePrice').value);
    const pct       = parseFloat(document.getElementById('propertyTaxPct').value) || 0;
    const dollar    = (homePrice * pct) / 100;
    document.getElementById('propertyTax').value =
        dollar > 0 ? Math.round(dollar).toLocaleString('en-US') : '';
}

function syncPropertyTaxFromDollar() {
    const homePrice = parseNum(document.getElementById('homePrice').value);
    const dollar    = parseNum(document.getElementById('propertyTax').value);
    if (homePrice > 0) {
        document.getElementById('propertyTaxPct').value =
            ((dollar / homePrice) * 100).toFixed(3);
    }
}

// ── Floating payoff pill ──────────────────────────────────────────────────────

function syncFloat() {
    const payoffEl     = document.getElementById('payoffDate');
    const timeEl       = document.getElementById('payoffTime');
    const floatEl      = document.getElementById('payoffFloat');
    const floatValueEl = document.getElementById('payoffFloat-value');
    const floatTimeEl  = document.getElementById('payoffFloat-time');
    if (!floatEl || !payoffEl) return;
    floatValueEl.textContent = payoffEl.textContent;
    if (floatTimeEl) {
        let timeText = timeEl ? timeEl.textContent : '';
        floatTimeEl.textContent = timeText.replace(' (with extra payments)', '');
    }

    const monthlyValueEl      = document.getElementById('totalMonthlyValue');
    const monthlyFloatValueEl = document.getElementById('monthlyFloat-value');
    if (monthlyFloatValueEl) {
        monthlyFloatValueEl.textContent = monthlyValueEl ? monthlyValueEl.textContent : '--';
    }
}

function initPayoffFloat() {
    const originalCard  = document.querySelector('.result-card.result-highlight');
    const floatEl       = document.getElementById('payoffFloat');
    const monthlyFloatEl = document.getElementById('monthlyFloat');
    if (!originalCard || !floatEl) return;

    const observer = new IntersectionObserver(
        entries => {
            const isVisible = entries[0].isIntersecting;
            if (isVisible) {
                floatEl.classList.remove('visible');
                if (monthlyFloatEl) monthlyFloatEl.classList.remove('visible');
            } else {
                syncFloat();
                floatEl.classList.add('visible');
                if (monthlyFloatEl) monthlyFloatEl.classList.add('visible');
            }
        },
        { threshold: 0.5 }
    );
    observer.observe(originalCard);
}

function toggleArmFields() {
    const isArm = document.getElementById('rateType').value !== 'fixed';
    document.getElementById('armFields').style.display = isArm ? 'block' : 'none';
    document.getElementById('armCard').style.display   = isArm ? '' : 'none';
}

function switchAmortView(view) {
    amortView = view;
    document.getElementById('tableViewBtn').classList.toggle('active', view === 'annual');
    document.getElementById('tableMonthlyBtn').classList.toggle('active', view === 'monthly');
    renderAmortTable();
}

// ── Core calculator ──────────────────────────────────────────────────────────

function calculateMortgage() {
    // --- Read inputs ---
    const homePrice      = parseNum(document.getElementById('homePrice').value);
    const loanAmount     = parseNum(document.getElementById('loanAmount').value);
    const interestRateAnn = parseFloat(document.getElementById('interestRate').value);
    const loanTermYears  = parseInt(document.getElementById('loanTerm').value);
    const rateType       = document.getElementById('rateType').value;
    const startDateStr   = document.getElementById('startDate').value; // YYYY-MM or ''

    // Monthly cost inputs
    const propertyTaxAnn = parseNum(document.getElementById('propertyTax').value);
    const homeInsAnn     = parseNum(document.getElementById('homeInsurance').value);
    const pmiRateInput   = parseFloat(document.getElementById('pmiRate').value);
    const hoaMonthly     = parseNum(document.getElementById('hoaFees').value);
    const extraPayment   = parseNum(document.getElementById('extraPayment').value);
    const extraYearlyPayment   = parseNum(document.getElementById('extraYearlyPayment').value);

    // Closing cost inputs
    const originationFee   = parseNum(document.getElementById('originationFee').value);
    const discountPoints   = parseFloat(document.getElementById('discountPoints').value) || 0;
    const pointRateRedPct  = parseFloat(document.getElementById('pointRateReduction').value) || 0;
    const appraisalFee     = parseNum(document.getElementById('appraisalFee').value);
    const titleInsurance   = parseNum(document.getElementById('titleInsurance').value);
    const recordingFees    = parseNum(document.getElementById('recordingFees').value);
    const otherClosing     = parseNum(document.getElementById('otherClosingCosts').value);

    // --- Validate required fields ---
    const missing = [];
    if (!homePrice || homePrice <= 0)      missing.push('Home Price');
    if (!loanAmount || loanAmount <= 0)    missing.push('Loan Amount');
    if (isNaN(interestRateAnn))            missing.push('Interest Rate');

    if (missing.length > 0) {
        setResultsEmpty(missing.length === 3 ? 'Fill in fields to calculate' : 'Missing: ' + missing.join(', '));
        return;
    }

    const r         = interestRateAnn / 100 / 12;
    const n         = loanTermYears * 12;
    const pmt       = loanAmount * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);

    if (!isFinite(pmt) || pmt <= 0) {
        setResultsEmpty('Payment calculation error — check your inputs.');
        return;
    }

    // --- ARM params ---
    let armFixedMonths = 0;
    if (rateType !== 'fixed') {
        armFixedMonths = rateType === 'arm51' ? 60 : rateType === 'arm71' ? 84 : 120;
    }
    const armAdjRate = parseFloat(document.getElementById('armAdjustedRate').value) || interestRateAnn;

    // --- Monthly overhead ---
    const taxMonthly = propertyTaxAnn / 12;
    const insMonthly = homeInsAnn / 12;

    // --- PMI ---
    const ltv = loanAmount / homePrice;
    let pmiRateAnn = 0;
    if (ltv > 0.80) {
        pmiRateAnn = isNaN(pmiRateInput) || pmiRateInput <= 0 ? 0.5 : pmiRateInput;
    } else if (!isNaN(pmiRateInput) && pmiRateInput > 0) {
        pmiRateAnn = pmiRateInput;
    }

    // --- Discount point cost & rate reduction ---
    const pointCostTotal = discountPoints * (loanAmount / 100);
    const rateWithPoints = Math.max(0.01, interestRateAnn - discountPoints * pointRateRedPct);
    const rWithPoints    = rateWithPoints / 100 / 12;
    const pmtWithPoints  = loanAmount * (rWithPoints * Math.pow(1 + rWithPoints, n)) / (Math.pow(1 + rWithPoints, n) - 1);
    const monthlySavingsFromPoints = pmt - pmtWithPoints;
    const pointsBreakevenMonths = monthlySavingsFromPoints > 0
        ? Math.ceil(pointCostTotal / monthlySavingsFromPoints) : null;

    // Use the rate-after-points for the actual calculation if discount points entered
    const effectiveR   = (discountPoints > 0 && pointRateRedPct > 0) ? rWithPoints : r;
    const effectivePmt = (discountPoints > 0 && pointRateRedPct > 0) ? pmtWithPoints : pmt;

    // --- Full amortization (with and without extra payment) ---
    function buildSchedule(principalBal, monthlyRate, regularPmt, extraMonthly, extraYearly, armFixedMonths, armAdjustedAnnRate) {
        let balance = principalBal;
        const schedule = [];
        let cumInterest = 0;
        let pmiDroppedMonth = null;

        for (let mo = 1; mo <= 600; mo++) {
            if (balance <= 0.005) break;

            // ARM rate switch
            let currentR = monthlyRate;
            if (armFixedMonths > 0 && mo > armFixedMonths) {
                currentR = armAdjustedAnnRate / 100 / 12;
            }

            // Apply yearly payment every 12th month
            let currentExtra = extraMonthly;
            if (mo % 12 === 0) {
                currentExtra += extraYearly;
            }

            const interest  = balance * currentR;
            // Use currentExtra instead of extra
            const totalPmt  = Math.min(regularPmt + currentExtra, balance + interest); 
            const principal = totalPmt - interest;
            balance        -= principal;
            balance         = Math.max(0, balance);
            cumInterest    += interest;

            // PMI: charged while LTV > 80% of original home price
            const currentLTV = balance / homePrice;
            const pmiCharge  = (currentLTV > 0.80 && pmiRateAnn > 0)
                ? (balance * pmiRateAnn / 100 / 12) : 0;
            if (pmiRateAnn > 0 && currentLTV <= 0.80 && pmiDroppedMonth === null) {
                pmiDroppedMonth = mo;
            }

            schedule.push({
                month:       mo,
                payment:     totalPmt, // This will spike every 12th month!
                principal,
                interest,
                balance,
                cumInterest,
                pmi:         pmiCharge,
                tax:         taxMonthly,
                insurance:   insMonthly,
                hoa:         hoaMonthly
            });
        }
        return { schedule, pmiDroppedMonth };
    }

    const { schedule: schedBase, pmiDroppedMonth } = buildSchedule(
        loanAmount, effectiveR, effectivePmt, 0, 0, // <-- Pass two 0s here
        armFixedMonths, armAdjRate
    );
    const { schedule: schedExtra } = buildSchedule(
        loanAmount, effectiveR, effectivePmt, extraPayment, extraYearlyPayment, // <-- Pass both extra variables here
        armFixedMonths, armAdjRate
    );

    amortData = schedExtra; // for the table (show extra-payment version)

    const totalInterestBase  = schedBase[schedBase.length - 1].cumInterest;
    const totalInterestExtra = schedExtra[schedExtra.length - 1].cumInterest;
    const monthsBase         = schedBase.length;
    const monthsExtra        = schedExtra.length;
    const timeSavedMonths    = monthsBase - monthsExtra;

    // --- PMI monthly for first month ---
    const firstPmi = schedBase[0] ? schedBase[0].pmi : 0;

    // --- ARM adjusted payment ---
    let armAdjustedPmt = null;
    if (rateType !== 'fixed') {
        const remainingMonths = n - armFixedMonths;
        const balAtSwitch     = schedBase[armFixedMonths - 1]
            ? schedBase[armFixedMonths - 1].balance : loanAmount;
        const rAdj = armAdjRate / 100 / 12;
        armAdjustedPmt = balAtSwitch *
            (rAdj * Math.pow(1 + rAdj, remainingMonths)) /
            (Math.pow(1 + rAdj, remainingMonths) - 1);
    }

    // --- Total monthly payment (base + overhead) ---
    const totalMonthly = effectivePmt + taxMonthly + insMonthly + firstPmi + hoaMonthly;

    // --- Closing costs ---
    const totalClosing = originationFee + pointCostTotal + appraisalFee +
                         titleInsurance + recordingFees + otherClosing;

    // ── Populate results ──────────────────────────────────────────────────────

    document.getElementById('payoffDate').textContent =
        getFutureDate(monthsExtra, startDateStr);
    document.getElementById('payoffTime').textContent =
        fmtMonths(monthsExtra) + ((extraPayment > 0 || extraYearlyPayment > 0) ? ' (with extra payments)' : '');
    syncFloat();

    document.getElementById('totalInterest').textContent      = fmt(totalInterestExtra);
    document.getElementById('totalCost').textContent          = fmt(loanAmount + totalInterestExtra);

    // Upfront money needed
    const downPayment    = homePrice - loanAmount;
    const upfrontTotal   = downPayment + totalClosing;
    const subtitleParts  = [];
    if (downPayment > 0)   subtitleParts.push(fmt(downPayment) + ' down payment');
    if (totalClosing > 0)  subtitleParts.push(fmt(totalClosing) + ' closing costs');
    document.getElementById('upfrontNeeded').textContent          = fmt(upfrontTotal);
    document.getElementById('upfrontNeededSubtitle').textContent  = subtitleParts.join(' + ') || 'Down payment only';

    if ((extraPayment > 0 || extraYearlyPayment > 0) && timeSavedMonths > 0) {
        document.getElementById('interestSaved').textContent =
            fmt(totalInterestBase - totalInterestExtra);
        document.getElementById('timeSaved').textContent =
            fmtMonths(timeSavedMonths) + ' faster';
    } else {
        if (extraPayment > 0 || extraYearlyPayment > 0) {
            document.getElementById('interestSaved').textContent = 
            fmt(totalInterestBase - totalInterestExtra);
            document.getElementById('timeSaved').textContent     = 'Extra payment is not enough to impact payoff date';
        }
        else {
            document.getElementById('interestSaved').textContent = '--';
            document.getElementById('timeSaved').textContent     = 'Add an extra payment to see savings';
        }
        
    }



    // PMI
    if (firstPmi > 0) {
        document.getElementById('pmiMonthly').textContent = fmt(firstPmi, 2);
        document.getElementById('pmiDropDate').textContent = pmiDroppedMonth
            ? 'Drops ~' + getFutureDate(pmiDroppedMonth, startDateStr)
            : 'PMI may persist';
    } else {
        document.getElementById('pmiMonthly').textContent = '$0';
        document.getElementById('pmiDropDate').textContent = ltv <= 0.80
            ? 'LTV ≤ 80% — no PMI' : '';
    }

    // Points break-even
    if (discountPoints > 0 && pointsBreakevenMonths !== null) {
        document.getElementById('pointsBreakevenCard').style.display = '';
        document.getElementById('pointsBreakeven').textContent =
            fmtMonths(pointsBreakevenMonths) +
            ' (' + fmt(pointCostTotal) + ' cost)';
    } else {
        document.getElementById('pointsBreakevenCard').style.display = 'none';
    }

    // ARM
    if (rateType !== 'fixed' && armAdjustedPmt) {
        document.getElementById('armCard').style.display    = '';
        document.getElementById('armPayment').textContent   = fmt(armAdjustedPmt, 2);
        document.getElementById('armPaymentNote').textContent =
            'at ' + armAdjRate.toFixed(3) + '% after fixed period';
    }

    // Closing costs summary
    if (totalClosing > 0) {
        document.getElementById('closingSummary').style.display = 'flex';
        document.getElementById('totalClosingCosts').textContent = '\u00A0' + fmt(totalClosing);
    } else {
        document.getElementById('closingSummary').style.display = 'none';
    }

    // Payment breakdown bar
    renderPaymentBreakdown(effectivePmt, taxMonthly, insMonthly, firstPmi, hoaMonthly, extraPayment);

    // Chart
    updateMortgageChart(
        schedBase.map(r => r.balance),
        schedExtra.map(r => r.balance)
    );

    // Amort table
    renderAmortTable();
}

// ── Payment breakdown bar ─────────────────────────────────────────────────────

function renderPaymentBreakdown(pi, tax, ins, pmi, hoa, extra) {
    const total = pi + tax + ins + pmi + hoa + (extra || 0);
    if (total <= 0) return;

    const segments = [
        { label: 'Principal & Interest', value: pi,  color: 'var(--primary)' },
        { label: 'Extra Payments',       value: extra, color: '#2563EB' },
        { label: 'Property Tax',         value: tax, color: '#f59e0b' },
        { label: 'Home Insurance',       value: ins, color: '#10b981' },
        { label: 'PMI',                  value: pmi, color: '#ef4444' },
        { label: 'HOA',                  value: hoa, color: '#8b5cf6' }
    ].filter(s => s.value > 0);

    const cardsHtml = segments.map(s => `
        <div class="result-card">
            <div class="result-label">
                ${s.label}
            </div>
            <div class="result-value">${fmt(s.value, 2)}</div>
            <div class="result-subtitle">${(s.value / total * 100).toFixed(1)}% of total</div>
        </div>`
    ).join('');

    const totalCard = `
        <div class="result-card result-highlight" style="grid-column: 1 / -1; background: #f8fafc; border-left: 4px solid var(--primary);">
            <div class="result-label">Total Monthly Payment</div>
            <div class="result-value" id="totalMonthlyValue">${fmt(total, 2)}</div>
            <div class="result-subtitle">All components combined</div>
        </div>`;

    document.getElementById('paymentBreakdownContainer').innerHTML = `
        <div class="calculator-results">${totalCard}${cardsHtml}</div>
    `;
    syncFloat();
}

// ── Amortization table ────────────────────────────────────────────────────────
function renderAmortTable() {
    const container = document.getElementById('amortTableContainer');
    if (!amortData || amortData.length === 0) {
        container.innerHTML = '<div class="breakdown-empty">Fill in loan details to see the amortization schedule.</div>';
        return;
    }
 
    if (amortView === 'monthly') {
        renderMonthlyTable(container);
    } else {
        renderAnnualTable(container);
    }
}
 
function renderAnnualTable(container) {
    // Aggregate monthly data by year
    const years = [];
    let yearBucket = null;
 
    amortData.forEach((row, i) => {
        const yearNum = Math.ceil(row.month / 12);
        if (!yearBucket || yearBucket.year !== yearNum) {
            if (yearBucket) years.push(yearBucket);
            yearBucket = {
                year: yearNum,
                totalPayment: 0,
                totalPrincipal: 0,
                totalInterest: 0,
                totalPmi: 0,
                endBalance: 0
            };
        }
        yearBucket.totalPayment   += row.payment;
        yearBucket.totalPrincipal += row.principal;
        yearBucket.totalInterest  += row.interest;
        yearBucket.totalPmi       += row.pmi;
        yearBucket.endBalance      = row.balance;
    });
    if (yearBucket) years.push(yearBucket);
 
    container.innerHTML = `
        <div class="amort-table-wrapper" style="overflow-x: unset;">
            <table class="amort-table" style="table-layout: fixed; width: 100%;">
                <colgroup>
                    <col style="width: 20%"><col style="width: 20%">
                    <col style="width: 20%"><col style="width: 20%">
                    <col style="width: 20%">
                </colgroup>
                <thead>
                    <tr style="text-align: left; text-decoration: underline;">
                        <th>Year</th>
                        <th>Principal</th>
                        <th>Interest</th>
                        <th>PMI</th>
                        <th>End Balance</th>
                    </tr>
                </thead>
                <tbody>
                    ${years.map(y => `
                    <tr>
                        <td>Year ${y.year}</td>
                        <td>${fmt(y.totalPrincipal)}</td>
                        <td>${fmt(y.totalInterest)}</td>
                        <td>${y.totalPmi > 0 ? fmt(y.totalPmi) : '—'}</td>
                        <td>${fmt(y.endBalance)}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
}
 
function renderMonthlyTable(container) {
    // Show first 24 months by default with a "show all" toggle
    const showAll = container.dataset.showAll === 'true';
    const rows    = showAll ? amortData : amortData.slice(0, 24);
 
    container.innerHTML = `
        <div class="amort-table-wrapper" style="overflow-x: unset;">
            <table class="amort-table" style="table-layout: fixed; width: 100%;">
                <colgroup>
                    <col style="width: 16%"><col style="width: 17%">
                    <col style="width: 17%"><col style="width: 17%">
                    <col style="width: 16%"><col style="width: 17%">
                </colgroup>
                <thead>
                    <tr style="text-align: left; text-decoration: underline;">
                        <th>Month</th>
                        <th>Payment</th>
                        <th>Principal</th>
                        <th>Interest</th>
                        <th>PMI</th>
                        <th>Balance</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(r => `
                    <tr>
                        <td>${r.month}</td>
                        <td>${fmt(r.payment, 2)}</td>
                        <td>${fmt(r.principal, 2)}</td>
                        <td>${fmt(r.interest, 2)}</td>
                        <td>${r.pmi > 0 ? fmt(r.pmi, 2) : '—'}</td>
                        <td>${fmt(r.balance)}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>
        ${!showAll && amortData.length > 24 ? `
        <div style="text-align:center; margin-top: 1rem;">
            <button class="mode-btn" onclick="document.getElementById('amortTableContainer').dataset.showAll='true'; renderAmortTable();">
                Show All ${amortData.length} Months
            </button>
        </div>` : ''}`;
}
// ── Chart ─────────────────────────────────────────────────────────────────────

function updateMortgageChart(balanceBase, balanceExtra) {
    const ctx    = document.getElementById('mortgageChart').getContext('2d');
    const maxLen = Math.max(balanceBase.length, balanceExtra.length);
    const labels = Array.from({ length: maxLen }, (_, i) => i + 1);

    if (mortgageChart) mortgageChart.destroy();

    const datasets = [{
        label: 'Standard Payoff',
        data: balanceBase,
        borderColor: '#2563EB',
        borderWidth: 3,
        pointRadius: 0,
        fill: false
    }];

    if (balanceExtra.length < balanceBase.length) {
        datasets.push({
            label: 'With Extra Payments',
            data: balanceExtra,
            borderColor: '#10B981',
            borderWidth: 3,
            pointRadius: 0,
            fill: false
        });
    }

    mortgageChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            aspectRatio: 2,
            animation: false,
            plugins: {
                legend: { display: true, position: 'top' },
                tooltip: {
                    callbacks: {
                        label: ctx => ' ' + ctx.dataset.label + ': $' +
                            ctx.parsed.y.toLocaleString(undefined, {maximumFractionDigits: 0})
                    }
                }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Remaining Balance ($)' },
                    ticks: { callback: v => '$' + (v / 1000).toFixed(0) + 'k' }
                },
                x: { title: { display: true, text: 'Month' } }
            }
        }
    });
}

// ─── Get Mortgage Rate ────────────────────────────────────────────────────────────────────

async function loadMortgageRate() {
    try {
        const res = await fetch(`${API_BASE}/api/mortgage-rate`);

        if (!res.ok) {
            console.error('API error:', res.status);
            return;
        }

        const data = await res.json();

        if (!data.rate) return;

        const input = document.getElementById('interestRate');
        const label = document.querySelector('label[for="interestRate"]');

        const rate = parseFloat(data.rate).toFixed(2);

        if (input) {
            input.placeholder = `e.g. ${rate} (current avg)`;
        }

        if (label) {
            label.innerHTML = `Interest Rate (APR %) <br><span style="color:var(--primary)">Current Avg: ${rate}% (provided by Freddie Mac through <a href="https://fred.stlouisfed.org/series/MORTGAGE30US" target="_blank" rel="noopener" class="inlineLinks">FRED® API)</a></span>`;
        }

    } catch (err) {
        console.error('Error loading mortgage rate:', err);
    }
}

// ── LocalStorage ──────────────────────────────────────────────────────────────

function saveToStorage() {
    const data = {};
    STATE_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) data[id] = el.value;
    });
    localStorage.setItem('mortgageCalcData', JSON.stringify(data));
}

function loadFromStorage() {
    const saved = localStorage.getItem('mortgageCalcData');
    if (!saved) return;
    const data = JSON.parse(saved);
    Object.entries(data).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el && val !== undefined) el.value = val;
    });
    // Re-sync computed fields
    syncLoanAmount();
    syncPropertyTaxFromDollar();
    toggleArmFields();
    calculateMortgage();
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

async function downloadPDF() {
    const { jsPDF } = window.jspdf;

    const btn = document.getElementById('downloadPdfBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Generating...';
    btn.disabled = true;

    const loadImage = (url) => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = url;
            img.onload = () => resolve(img);
            img.onerror = reject;
        });
    };

    let logoImg = null;
    try {
        // Change 'logo.png' to the actual path of your file
        logoImg = await loadImage(`${API_BASE}/static/logo.png`);
    } catch (e) {
        console.error("Logo failed to load, continuing without it.", e);
    }

    const doc = new jsPDF({ unit: 'pt', format: 'letter' });

    const PW    = 612;   // page width
    const PH    = 792;   // page height
    const ML    = 40;    // margin left
    const MR    = 40;    // margin right
    const CW    = PW - ML - MR;  // content width
    let y       = 0;

    // ── Colours ────────────────────────────────────────────────────────────
    const C = {
        navy:       [30,  58, 138],
        blue:       [37,  99, 235],
        lightBlue:  [219,234,254],
        teal:       [16, 165, 109],
        amber:      [225,138, 11],
        red:        [239, 68, 68],
        purple:     [139, 92,246],
        cyan:       [6,  182,212],
        gray900:    [17,  24, 39],
        gray600:    [75,  85, 99],
        gray300:    [209,213,219],
        gray100:    [243,244,246],
        white:      [255,255,255],
        black:      [  0,  0,  0],
    };

    // ── Helpers ────────────────────────────────────────────────────────────

    function checkPage(needed = 30) {
        if (y + needed > PH - 50) { doc.addPage(); y = 50; }
    }

    function setColor(rgb, type = 'text') {
        if (type === 'text') doc.setTextColor(...rgb);
        else if (type === 'fill') doc.setFillColor(...rgb);
        else if (type === 'draw') doc.setDrawColor(...rgb);
    }

    function txt(text, x, yy, opts = {}) {
        doc.text(String(text), x, yy, opts);
    }

    function get(id) {
        const el = document.getElementById(id);
        if (!el) return '';
        return (el.value ?? el.textContent ?? '').trim();
    }

    function result(id) {
        return (document.getElementById(id)?.textContent || '').trim();
    }

    // Section header with coloured bar
    function section(title, color = C.blue) {
        checkPage(50);
        y += 22;
        setColor(color, 'fill');
        doc.roundedRect(ML, y - 14, CW, 22, 3, 3, 'F');
        setColor(C.navy, 'text');
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        txt(title.toUpperCase(), ML + 6, y - 14 + 22 / 2 + 4);
        setColor(C.gray900, 'text');
        y += 18;
    }

    // Two-column data row with optional alternating shading
    function row(label, value, shade = false, valueColor = null) {
        checkPage(20);
        if (shade) {
            setColor(C.gray100, 'fill');
            doc.rect(ML, y - 11, CW, 20, 'F');
        }
        doc.setFontSize(9.5);
        doc.setFont(undefined, 'normal');
        setColor(C.gray600, 'text');
        txt(label, ML + 6, y+3);
        doc.setFont(undefined, 'bold');
        setColor(valueColor || C.gray900, 'text');
        txt(String(value), ML + CW - 6, y+3, { align: 'right' });
        setColor(C.gray900, 'text');
        y += 20;
    }

    // Thin divider line
    function divider(color = C.gray300) {
        setColor(color, 'draw');
        doc.setLineWidth(0.5);
        doc.line(ML, y, ML + CW, y);
        y += 20;
    }

    // Bold total row
    function totalRow(label, value, color = C.blue) {
        color = C.gray100
        checkPage(22);
        setColor(color, 'fill');
        doc.rect(ML, y - 12, CW, 19, 'F');
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        setColor(C.black, 'text');
        txt(label, ML + 6, y+1);
        txt(String(value), ML + CW - 6, y+1, { align: 'right' });
        setColor(C.black, 'text');
        y += 22;
    }

    // Mini stat card (3 across)
    function statCards(items) {
        checkPage(52);
        const cardW = CW / items.length - 4;
        items.forEach((item, i) => {
            const cx = ML + i * (cardW + 6);
            setColor(item.bg || C.lightBlue, 'fill');
            doc.roundedRect(cx, y, cardW, 44, 4, 4, 'F');
            doc.setFontSize(7.5);
            doc.setFont(undefined, 'normal');
            setColor(item.labelColor || C.blue, 'text');
            txt(item.label.toUpperCase(), cx + cardW / 2, y + 13, { align: 'center' });
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            setColor(item.valueColor || C.navy, 'text');
            txt(item.value, cx + cardW / 2, y + 32, { align: 'center' });
        });
        setColor(C.gray900, 'text');
        y += 54;
    }

    // ── PAGE 1 HEADER ──────────────────────────────────────────────────────

    // Dark navy banner
    setColor(C.lightBlue, 'fill');
    doc.rect(0, 0, PW, 70, 'F');

    if (logoImg) {
        const logoHeight = 40; // Height in points
        const logoWidth = (logoImg.width * logoHeight) / logoImg.height; // Maintain aspect ratio
        // Position it on the far right, vertically centered in the 70pt banner
        doc.addImage(logoImg, 'PNG', PW - MR - logoWidth, (70 - logoHeight) / 2, logoWidth, logoHeight);
    }

    setColor(C.black, 'text');
    doc.setFontSize(22);
    doc.setFont(undefined, 'bold');
    txt('Mortgage Analysis Report', ML, 36);

    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    setColor(C.black, 'text');
    txt('Generated by MoneyByMath  ·  ' + new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), ML, 54);

    // Right-align property address / price hint
    const hpVal = get('homePrice');
    if (hpVal && !logoImg) { // Only show here if no logo, or move it
        setColor([180, 200, 255], 'text');
        doc.setFontSize(9);
        txt('Home Price: $' + hpVal, PW - MR, 36, { align: 'right' });
    }

    y = 88;

    // ── HERO STAT CARDS ────────────────────────────────────────────────────

    const payoffDateVal  = result('payoffDate');
    const totalMonthlyEl = document.getElementById('totalMonthlyValue');
    const totalMonthly   = totalMonthlyEl ? totalMonthlyEl.textContent.trim() : '--';
    const upfrontVal     = result('upfrontNeeded');

    statCards([
        { label: 'Est. Payoff Date',      value: payoffDateVal || '--',  bg: [219,234,254], labelColor: C.blue,  valueColor: C.navy   },
        { label: 'Total Monthly Payment', value: totalMonthly,           bg: [209,250,229], labelColor: C.teal,  valueColor: [6,95,70] },
        { label: 'Upfront Cash Needed',   value: upfrontVal || '--',     bg: [254,243,199], labelColor: C.amber, valueColor: [120,53,15] },
    ]);

    y += 4;

    // ── SECTION 1: LOAN DETAILS ────────────────────────────────────────────

    section('Loan Details', C.lightBlue);

    const loanTerm   = get('loanTerm');
    const rateTypeEl = document.getElementById('rateType');
    const rateLabel  = rateTypeEl ? rateTypeEl.options[rateTypeEl.selectedIndex].text : get('rateType');

    row('Home Price',             '$' + get('homePrice'),                          false);
    row('Down Payment',           '$' + get('downPaymentDollar') + '  (' + (get('downPaymentPercent') || '0') + '%)', true);
    row('Loan Amount',            '$' + get('loanAmount'),                         false);
    row('Loan Term',              loanTerm + ' years',                             true);
    row('Rate Type',              rateLabel,                                       false);
    row('Interest Rate (APR)',    get('interestRate') + '%',                       true);

    const armAdj = get('armAdjustedRate');
    if (armAdj) row('ARM Adjusted Rate', armAdj + '%', false);

    row('Loan Start Date', get('startDate') || '--', armAdj ? true : false);

    // ── SECTION 2: MONTHLY COSTS INPUTS ───────────────────────────────────

    section('Monthly Cost Inputs', C.lightBlue);

    const propTax   = get('propertyTax');
    const propTaxPct = get('propertyTaxPct');
    row('Annual Property Tax',   '$' + propTax + (propTaxPct ? '  (' + propTaxPct + '% of price)' : ''),  false);
    row('Annual Home Insurance', '$' + get('homeInsurance'),  true);

    const pmiRate = get('pmiRate');
    row('PMI Rate',              pmiRate ? pmiRate + '% / year (manual)' : 'Auto-estimated',  false);

    const hoa   = get('hoaFees');
    const extra  = get('extraPayment');
    if (hoa)   row('Monthly HOA Fees',       '$' + hoa,   true);
    if (extra) row('Extra Monthly Payment',  '$' + extra, !hoa);

    // ── SECTION 3: CLOSING COSTS ───────────────────────────────────────────

    const origFee    = get('originationFee');
    const points     = get('discountPoints');
    const appraisal  = get('appraisalFee');
    const title      = get('titleInsurance');
    const recording  = get('recordingFees');
    const otherCC    = get('otherClosingCosts');
    const totalCC    = result('totalClosingCosts').replace(/\s/g,'');
    const hasClosing = origFee || points || appraisal || title || recording || otherCC;

    if (hasClosing || totalCC) {
        section('Closing Costs', C.lightBlue);
        let shade = false;
        if (origFee)   { row('Origination Fee',   '$' + origFee,   shade); shade = !shade; }
        if (points)    { row('Discount Points',    points + ' pt(s)', shade); shade = !shade; }
        if (appraisal) { row('Appraisal Fee',      '$' + appraisal, shade); shade = !shade; }
        if (title)     { row('Title Insurance',    '$' + title,     shade); shade = !shade; }
        if (recording) { row('Recording Fees',     '$' + recording, shade); shade = !shade; }
        if (otherCC)   { row('Other Closing Costs','$' + otherCC,   shade); shade = !shade; }
        if (totalCC)   totalRow('Total Closing Costs', totalCC, C.lightBlue);
        else           divider();
    }

    // ── PAGE BREAK before Results ──────────────────────────────────────────

    doc.addPage();
    y = 50;

    // Small repeat header on page 2+
    setColor(C.navy, 'fill');
    doc.rect(0, 0, PW, 30, 'F');
    setColor(C.white, 'text');
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    txt('Mortgage Analysis Report  ·  MoneyByMath', ML, 20);
    doc.setFont(undefined, 'normal');
    txt('Page 2', PW - MR, 20, { align: 'right' });

    y = 48;

    // ── SECTION 4: SUMMARY RESULTS ─────────────────────────────────────────

    section('Payoff & Cost Summary', C.lightBlue);

    const payoffTime    = result('payoffTime');
    const totalInterest = result('totalInterest');
    const totalCost     = result('totalCost');
    const interestSaved = result('interestSaved');
    const timeSaved     = result('timeSaved');
    const upfrontSub    = result('upfrontNeededSubtitle');

    row('Estimated Payoff Date',    payoffDateVal || '--',         false, C.black);
    row('Payoff Timeline',          payoffTime    || '--',         true);
    row('Total Interest Paid',      totalInterest || '--',         false, C.black);
    row('Total Cost of Loan',       totalCost     || '--',         true,  C.black);
    row('Upfront Cash Needed',      upfrontVal    || '--',         false, C.black);
    if (upfrontSub) row('-->(breakdown)', upfrontSub, true);

    if (extra && interestSaved && interestSaved !== '--') {
        row('Interest Saved (Extra Payments)', interestSaved, false, C.black);
        if (timeSaved) row('Time Saved',       timeSaved,     true,  C.black);
    }

    // PMI
    const pmiMonthly  = result('pmiMonthly');
    const pmiDropDate = result('pmiDropDate');
    if (pmiMonthly && pmiMonthly !== '--') {
        row('Monthly PMI',      pmiMonthly,  false, C.black);
        if (pmiDropDate != 'LTV ≤ 80% — no PMI' && pmiDropDate != 'PMI may persist') row('PMI Drop Date', pmiDropDate, true);
    }

    // Points break-even
    const ptBreakeven = result('pointsBreakeven');
    if (ptBreakeven && ptBreakeven !== '--') {
        row('Points Break-Even', ptBreakeven, false, C.black);
    }

    // ARM adjusted payment
    const armPmt  = result('armPayment');
    const armNote = result('armPaymentNote');
    if (armPmt && armPmt !== '--') {
        row('Payment After ARM Adjustment', armPmt, false, C.black);
        if (armNote) row('', armNote, true);
    }

    y += 6;

    // ── SECTION 5: MONTHLY PAYMENT BREAKDOWN ───────────────────────────────

    section('Monthly Payment Breakdown', C.lightBlue);

    // Gather live segment values from the rendered breakdown cards
    const breakdownContainer = document.getElementById('paymentBreakdownContainer');
    const segmentCards = breakdownContainer ? breakdownContainer.querySelectorAll('.result-card:not(.result-highlight)') : [];
    const segColors = [C.black]//, C.amber, C.teal, C.red, C.purple, C.cyan];
    let shade = false;

    if (segmentCards.length > 0) {
        segmentCards.forEach((card, i) => {
            const lbl = card.querySelector('.result-label')?.textContent?.trim() || '';
            const val = card.querySelector('.result-value')?.textContent?.trim() || '';
            const sub = card.querySelector('.result-subtitle')?.textContent?.trim() || '';
            row(lbl + (sub ? '  (' + sub + ')' : ''), val, shade, segColors[i % segColors.length]);
            shade = !shade;
        });
    }

    totalRow('Total Monthly Payment', totalMonthly, C.lightBlue);

    y += 4;

    // ── SECTION 6: AMORTIZATION SUMMARY (Annual) ───────────────────────────

    if (amortData && amortData.length > 0) {
        section('Amortization Summary (Annual)', C.lightBlue);

        // Build annual buckets
        const years = [];
        let bucket  = null;
        amortData.forEach(r => {
            const yr = Math.ceil(r.month / 12);
            if (!bucket || bucket.year !== yr) {
                if (bucket) years.push(bucket);
                bucket = { year: yr, principal: 0, interest: 0, pmi: 0, endBalance: 0 };
            }
            bucket.principal  += r.principal;
            bucket.interest   += r.interest;
            bucket.pmi        += r.pmi;
            bucket.endBalance  = r.balance;
        });
        if (bucket) years.push(bucket);

        // Table header
        checkPage(30);
        const cols = { year: ML+6, prin: ML+140, int: ML+240, pmi: ML+330, bal: ML+CW-6 };

        setColor(C.navy, 'fill');
        doc.rect(ML, y - 11, CW, 18, 'F');
        doc.setFontSize(8.5);
        doc.setFont(undefined, 'bold');
        setColor(C.white, 'text');
        txt('Year',           cols.year, y);
        txt('Principal',      cols.prin, y);
        txt('Interest',       cols.int,  y);
        txt('PMI',            cols.pmi,  y);
        txt('End Balance',    cols.bal,  y, { align: 'right' });
        y += 18;

        const fmtN = n => '$' + Math.round(n).toLocaleString();
        setColor(C.gray900, 'text');

        years.forEach((yr, i) => {
            checkPage(16);
            if (i % 2 === 0) {
                setColor(C.gray100, 'fill');
                doc.rect(ML, y - 11, CW, 15, 'F');
            }
            doc.setFontSize(8.5);
            doc.setFont(undefined, 'normal');
            setColor(C.gray600, 'text');
            txt('Year ' + yr.year,    cols.year, y);
            setColor(C.blue, 'text');
            txt(fmtN(yr.principal),   cols.prin, y);
            setColor(C.red, 'text');
            txt(fmtN(yr.interest),    cols.int,  y);
            setColor(yr.pmi > 0 ? C.amber : C.gray300, 'text');
            txt(yr.pmi > 0 ? fmtN(yr.pmi) : '—', cols.pmi, y);
            setColor(C.gray900, 'text');
            doc.setFont(undefined, 'bold');
            txt(fmtN(yr.endBalance),  cols.bal,  y, { align: 'right' });
            y += 15;
        });

        y += 4;
    }

    // ── FOOTER on every page ───────────────────────────────────────────────

    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        setColor(C.gray300, 'draw');
        doc.setLineWidth(0.5);
        doc.line(ML, PH - 36, PW - MR, PH - 36);
        doc.setFontSize(7.5);
        doc.setFont(undefined, 'normal');
        setColor(C.gray600, 'text');
        txt('MoneyByMath  ·  For informational purposes only. Not a loan offer or commitment to lend.', ML, PH - 22);
        txt('Page ' + p + ' of ' + totalPages, PW - MR, PH - 22, { align: 'right' });
    }

    // ── Save ───────────────────────────────────────────────────────────────

    doc.save('Mortgage-Report.pdf');

    btn.innerHTML = 'Saved!';
    btn.disabled = false;
    setTimeout(() => (btn.innerHTML = originalText), 2000);
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    // Default start date to current month
    const now = new Date();
    const defaultMonth = now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0');
    
    const dateInput = document.getElementById('startDate');
    if (dateInput && !dateInput.value) {
        dateInput.value = defaultMonth;
    }

    // 1. Check if the user arrived via a shared link
    const loadedFromUrl = loadFromUrl();

    // 2. If no link data, try to load from their previous session
    if (!loadedFromUrl) {
        loadFromStorage();
    } else {
        // If they did use a link, we need to manually trigger the syncs
        syncLoanAmount();
        syncPropertyTaxFromDollar();
        toggleArmFields();
        calculateMortgage();
    }

    initPayoffFloat();
    await loadMortgageRate();
});