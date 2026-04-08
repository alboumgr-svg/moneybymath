// ── State ────────────────────────────────────────────────────────────────────
let mortgageChart = null;
let amortData     = [];       // full month-by-month schedule
let amortView     = 'annual'; // 'annual' | 'monthly'
let resultCardIsOffScreen = false;
let breakdownIsOnScreen   = false; 

const API_BASE = window.location.origin; 

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
    document.getElementById('payoffDate').style.color        = 'var(--text-secondary)';
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
    const monthlyFloatEl = document.getElementById('monthlyFloat');
    if (monthlyFloatEl) monthlyFloatEl.classList.remove('visible');
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
    const pctRaw = document.getElementById('downPaymentPercent').value;
    if (pctRaw === '') { syncLoanAmount(); return; }
    const homePrice = parseNum(document.getElementById('homePrice').value);
    const pct       = parseFloat(pctRaw) || 0;
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
    floatValueEl.style.color = payoffEl.style.color;
    if (floatTimeEl) {
        let timeText = timeEl ? timeEl.textContent : '';
        floatTimeEl.textContent = timeText.replace(' (with extra payments)', '');
    }

    const monthlyValueEl      = document.getElementById('totalMonthlyValue');
    const monthlyFloatValueEl = document.getElementById('monthlyFloat-value');
    if (monthlyFloatValueEl) {
        monthlyFloatValueEl.textContent = monthlyValueEl ? monthlyValueEl.textContent : '--';
    }

    const monthlyFloatEl = document.getElementById('monthlyFloat');
    const hasCalcRun     = !!document.getElementById('totalMonthlyValue');
    
    // THE RULES: Must be scrolled down past the hero, original card must be off-screen, 
    // AND the breakdown container must NOT be visible.
    const isScrolledDown = window.scrollY > 150;
    const canShow = resultCardIsOffScreen && isScrolledDown && !breakdownIsOnScreen;

    if (monthlyFloatEl) {
        if (canShow && hasCalcRun) {
            monthlyFloatEl.classList.add('visible');
        } else {
            monthlyFloatEl.classList.remove('visible');
        }
    }

    if (canShow) {
        floatEl.classList.add('visible');
    } else {
        floatEl.classList.remove('visible');
    }
}

function initPayoffFloat() {
    const originalCard  = document.getElementById('mortgageResults');
    const breakdownCard = document.getElementById('paymentBreakdownContainer');
    if (!originalCard) return;

    // Observe BOTH the original result card and the breakdown container
    const observer = new IntersectionObserver(
        entries => {
            entries.forEach(entry => {
                if (entry.target === originalCard) {
                    resultCardIsOffScreen = !entry.isIntersecting;
                }
                if (entry.target === breakdownCard) {
                    breakdownIsOnScreen = entry.isIntersecting;
                }
            });
            syncFloat();
        },
        { threshold: 0.1 } // Triggers as soon as 10% of the element is visible
    );
    
    observer.observe(originalCard);
    if (breakdownCard) observer.observe(breakdownCard);

    // Also trigger on scroll so they disappear instantly when you hit the top
    window.addEventListener('scroll', syncFloat);
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
        document.getElementById('floatpayofflabel').textContent = ''
        return;
    }

    document.getElementById('floatpayofflabel').textContent = 'Estimated Payoff Date'

    const r         = interestRateAnn / 100 / 12;
    const n         = loanTermYears * 12;
    const pmt       = loanAmount * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);

    if (!isFinite(pmt) || pmt <= 0) {
        setResultsEmpty('Payment calculation error - check your inputs.');
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
    document.getElementById('payoffDate').style.color = '';
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
            ? 'LTV ≤ 80% - no PMI' : '';
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
        <div class="amort-table-wrapper">
            <table class="amort-table">
                <thead>
                    <tr>
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
                        <td>${y.totalPmi > 0 ? fmt(y.totalPmi) : '-'}</td>
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
        <div class="amort-table-wrapper">
            <table class="amort-table">
                <thead>
                    <tr>
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
                        <td>${r.pmi > 0 ? fmt(r.pmi, 2) : '-'}</td>
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

    const isMobile = window.innerWidth < 600;

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
            aspectRatio: isMobile ? 0.5 : 2,
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
            label.innerHTML = `Interest Rate (APR %) <br><span style="color:var(--primary)">Current Avg: ${rate}% (provided by Freddie Mac via <a href="https://fred.stlouisfed.org/series/MORTGAGE30US" target="_blank" rel="noopener" class="inlineLinks">FRED® API)</a></span>`;
        }

    } catch (err) {
        console.error('Error loading mortgage rate:', err);
    }
}

// ── Reset ──────────────────────────────────────────────────────────────────────

function clearAll() {
    STATE_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.tagName === 'SELECT') {
            el.selectedIndex = 0;
        } else {
            el.value = '';
        }
    });
    // Clear the computed read-only field too
    const loanAmountEl = document.getElementById('loanAmount');
    if (loanAmountEl) loanAmountEl.value = '';

    localStorage.removeItem('mortgageCalcData');
    toggleArmFields();
    setResultsEmpty('Fill in fields to calculate');
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
async function copyShareLink() {
    const params = new URLSearchParams();
    
    STATE_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el && el.value) {
            params.set(id, el.value);
        }
    });

    const shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    const btn = document.getElementById('shareLinkBtn');
    btn.disabled = true;

    // Use native share sheet on mobile (iOS, Android), fallback to clipboard on desktop
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'Mortgage Calculator',
                text: 'Check out my mortgage analysis!',
                url: shareUrl,
            });
            const originalText = btn.textContent;
            btn.textContent = '✓ Link Copied!';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
            }, 2000);
        } catch (err) {
            // User dismissed the share sheet - not an error worth logging
            if (err.name !== 'AbortError') console.error(err);
        }
        btn.disabled = false;
    } else {
        // Desktop fallback: copy to clipboard
        try {
            await navigator.clipboard.writeText(shareUrl);
            const originalText = btn.textContent;
            btn.textContent = '✓ Link Copied!';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
            }, 2000);
        } catch (err) {
            btn.disabled = false;
            console.error(err);
        }
    }
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

    // ════════════════════════════════════════════════════════════════════════
    // REPORT DATA  ←  Only section you need to change per calculator page
    // ════════════════════════════════════════════════════════════════════════

    const REPORT = {
        title:    'Mortgage Analysis Report',
        filename: 'Mortgage-Report.pdf',
        logoPath: `${API_BASE}/static/logo.png`,

        // Generic key-value sections - each renders as a labelled group of rows
        // { heading, items: [{ label, value }] }
        // Items whose label starts with "Total" are automatically bolded by the engine
        sections: [
            {
                heading: 'Loan Details',
                items: [
                    { label: 'Home Price',          value: '$' + get('homePrice') },
                    { label: 'Down Payment',        value: '$' + get('downPaymentDollar') + '  (' + (get('downPaymentPercent') || '0') + '%)' },
                    { label: 'Loan Amount',         value: '$' + get('loanAmount') },
                    { label: 'Loan Term',           value: get('loanTerm') + ' years' },
                    { label: 'Rate Type',           value: (() => { const el = document.getElementById('rateType'); return el ? el.options[el.selectedIndex].text : ''; })() },
                    { label: 'Interest Rate (APR)', value: get('interestRate') + '%' },
                    ...( get('armAdjustedRate') ? [{ label: 'ARM Adjusted Rate', value: get('armAdjustedRate') + '%' }] : [] ),
                    { label: 'Start Date',          value: get('startDate') || '--' },
                ]
            },
            {
                heading: 'Results',
                items: [
                    { label: 'Payoff Date',              value: result('payoffDate') || '--' },
                    { label: 'Time to Pay Off',          value: result('payoffTime')  || '--' },
                    { label: 'Cash Needed Upfront',      value: result('upfrontNeeded') || '--' },
                    { label: '-->(Down payment + closing costs)', value: result('upfrontNeededSubtitle') || '--' },
                    ...( result('interestSaved') && result('interestSaved') !== '--'
                        ? [
                            { label: 'Interest Saved via Extra Payments', value: result('interestSaved') },
                            { label: 'Time Saved via Extra Payments',     value: result('timeSaved') },
                          ]
                        : []
                    ),
                    ...( result('pmiMonthly') && result('pmiMonthly') !== '--' && result('pmiMonthly') !== '$0'
                        ? [
                            { label: 'Monthly PMI',   value: result('pmiMonthly') },
                            { label: 'PMI Drops Off', value: result('pmiDropDate') },
                          ]
                        : []
                    ),
                    ...( result('pointsBreakeven') && result('pointsBreakeven') !== '--'
                        ? [{ label: 'Discount Points Break-Even', value: result('pointsBreakeven') }]
                        : []
                    ),
                    ...( result('armPayment') && result('armPayment') !== '--'
                        ? [
                            { label: 'Payment After ARM Adjustment', value: result('armPayment') },
                            { label: '  (Rate after fixed period)',   value: result('armPaymentNote') },
                          ]
                        : []
                    ),
                    { label: 'Total Interest Paid',      value: result('totalInterest') || '--' },
                    { label: 'Total Cost of Loan',       value: result('totalCost')   || '--' },
                ]
            },
            {
                heading: 'Monthly Costs',
                items: [
                    { label: 'Annual Property Tax',    value: '$' + get('propertyTax') + ( get('propertyTaxPct') ? '  (' + get('propertyTaxPct') + '% of price)' : '' ) },
                    { label: 'Annual Home Insurance',  value: '$' + get('homeInsurance') },
                    { label: 'PMI Rate',               value: get('pmiRate') ? get('pmiRate') + '% / year (manual)' : 'Auto-estimated' },
                    ...( get('hoaFees')      ? [{ label: 'Monthly HOA Fees',      value: '$' + get('hoaFees')      }] : [] ),
                    ...( get('extraPayment') ? [{ label: 'Extra Monthly Payment', value: '$' + get('extraPayment') }] : [] ),
                ]
            },
            // Closing costs - only included when at least one field is filled
            ...(() => {
                const items = [];
                if (get('originationFee'))   items.push({ label: 'Origination Fee',    value: '$' + get('originationFee') });
                if (get('discountPoints'))    items.push({ label: 'Discount Points',    value: get('discountPoints') + ' pt(s)' });
                if (get('appraisalFee'))      items.push({ label: 'Appraisal Fee',      value: '$' + get('appraisalFee') });
                if (get('titleInsurance'))    items.push({ label: 'Title Insurance',    value: '$' + get('titleInsurance') });
                if (get('recordingFees'))     items.push({ label: 'Recording Fees',     value: '$' + get('recordingFees') });
                if (get('otherClosingCosts')) items.push({ label: 'Other Closing Costs',value: '$' + get('otherClosingCosts') });
                const totalCC = result('totalClosingCosts').replace(/\s/g, '');
                if (totalCC) items.push({ label: 'Total Closing Costs', value: totalCC });
                return items.length > 0 ? [{ heading: 'Closing Costs', items }] : [];
            })(),
        ],

        // paymentsPosition - the engine injects the Monthly Payment Breakdown
        // section immediately after this section index.
        // Closing Costs is conditional, so we compute the correct index dynamically:
        //   Loan Details(0) -> Monthly Costs(1) -> Closing Costs(2, if present) -> [PAYMENTS] -> Results
        paymentsPosition: (() => {
            const hasCC = !!(get('originationFee') || get('discountPoints') || get('appraisalFee') ||
                             get('titleInsurance') || get('recordingFees') || get('otherClosingCosts') ||
                             result('totalClosingCosts').replace(/\s/g, ''));
            return hasCC ? 2 : 1;
        })(),

        // Payments - left-justified rows pulled live from the rendered breakdown cards
        payments: (() => {
            const out = [];
            const container = document.getElementById('paymentBreakdownContainer');
            const cards = container ? container.querySelectorAll('.result-card:not(.result-highlight)') : [];
            cards.forEach(card => {
                const lbl = card.querySelector('.result-label')?.textContent?.trim() || '';
                const val = card.querySelector('.result-value')?.textContent?.trim() || '';
                if (lbl && val) out.push({ label: lbl, value: val });
            });
            return out;
        })(),

        // totalMonthlyPayment - shown as a bold total row at the bottom of the payments section
        totalMonthlyPayment: (document.getElementById('totalMonthlyValue')?.textContent || '').trim() || '--',

        // Amortization table - annual buckets built from amortData
        // Set to null to omit; swap in different data for other calculators
        amortTable: (() => {
            if (!amortData || amortData.length === 0) return null;
            const years = [];
            let bucket = null;
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
            return { rows: years };
        })(),
    };

    // ════════════════════════════════════════════════════════════════════════
    // ENGINE  ←  Generic renderer - identical to debt-payoff, plus
    //            sections[] and amortTable renderers for portability
    // ════════════════════════════════════════════════════════════════════════

    // ── Constants ────────────────────────────────────────────────────────────
    const PW = 612, PH = 792, ML = 48, MR = 48, CW = PW - ML - MR;
    const ACCENT = [37,  99, 235];   // blue - key numbers only
    const INK    = [22,  22,  22];   // near-black body text
    const MUTED  = [110, 110, 110];  // labels / secondary text
    const RULE   = [220, 220, 220];  // divider lines
    const STRIPE = [248, 249, 251];  // table stripe
    let y = 0;

    const doc = new jsPDF({ unit: 'pt', format: 'letter' });

    // ── Tiny helpers ─────────────────────────────────────────────────────────
    function sc(rgb, tp = 'text') {
        if (tp === 'text')       doc.setTextColor(...rgb);
        else if (tp === 'fill') doc.setFillColor(...rgb);
        else if (tp === 'draw') doc.setDrawColor(...rgb);
    }
    function t(str, x, yy, opts = {}) { doc.text(String(str), x, yy, opts); }
    function result(id) { return (document.getElementById(id)?.textContent || '').trim(); }
    function get(id) { const el = document.getElementById(id); if (!el) return ''; return (el.value ?? el.textContent ?? '').trim(); }
    function fmtMoney(n) { return '$' + Math.round(n).toLocaleString(); }
    function isTotal(label) { return /^total/i.test(label.trim()); }

    function hRule(x = ML, w = CW, weight = 0.5, color = RULE) {
        sc(color, 'draw'); doc.setLineWidth(weight);
        doc.line(x, y, x + w, y); y += 10;
    }

    // ── Logo loader ──────────────────────────────────────────────────────────
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
    sc([255, 255, 255], 'fill');
    doc.rect(0, 0, PW, HDR_H, 'F');

    if (logoImg) {
        const lh = 34;
        const lw = (logoImg.width * lh) / logoImg.height;
        doc.addImage(logoImg, 'PNG', PW - MR - lw, (HDR_H - lh) / 2, lw, lh);
    }

    sc(INK, 'text');
    doc.setFontSize(18); doc.setFont(undefined, 'bold');
    t(REPORT.title, ML, 28);

    sc(MUTED, 'text');
    doc.setFontSize(8); doc.setFont(undefined, 'normal');
    t('Generated ' + new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), ML, 44);

    y = HDR_H;
    sc(ACCENT, 'fill'); doc.rect(0, y, PW, 2.5, 'F');
    y += 18;

    // ════════════════════════════════════════════════════════
    // SECTION HEADING helper
    // ════════════════════════════════════════════════════════
    function sectionHeading(title) {
        if (y + 20 > PH - 50) { doc.addPage(); y = 50; }
        doc.setFontSize(8); doc.setFont(undefined, 'bold');
        sc(ACCENT, 'text');
        t(title.toUpperCase(), ML, y);
        sc(ACCENT, 'draw'); doc.setLineWidth(1.5);
        doc.line(ML, y + 3, ML + CW, y + 3);
        sc(INK, 'text');
        y += 14;
    }

    // ════════════════════════════════════════════════════════
    // PAYMENTS renderer  (left-justified, injected between sections)
    // ════════════════════════════════════════════════════════
    function renderPayments() {
        if (!REPORT.payments || REPORT.payments.length === 0) return;
        sectionHeading('Monthly Payment Breakdown');

        const ROW_H = 14;
        REPORT.payments.forEach((p, i) => {
            if (y + ROW_H > PH - 50) { doc.addPage(); y = 50; }
            if (i % 2 === 1) { sc(STRIPE, 'fill'); doc.rect(ML, y, CW, ROW_H, 'F'); }
            doc.setFontSize(8.5); doc.setFont(undefined, 'normal');
            sc(MUTED, 'text');
            t(p.label, ML + 6, y + 10);
            sc(INK, 'text'); doc.setFont(undefined, 'bold');
            t(p.value, ML + 160, y + 10);
            y += ROW_H;
        });

        // Total monthly payment - bold total row
        if (REPORT.totalMonthlyPayment && REPORT.totalMonthlyPayment !== '--') {
            if (y + ROW_H > PH - 50) { doc.addPage(); y = 50; }
            sc(STRIPE, 'fill'); doc.rect(ML, y, CW, ROW_H + 2, 'F');
            doc.setFontSize(9); doc.setFont(undefined, 'bold');
            sc(INK, 'text');
            t('Total Monthly Payment', ML + 6, y + 11);
            sc(ACCENT, 'text');
            t(REPORT.totalMonthlyPayment, ML + 160, y + 11);
            y += ROW_H + 2;
        }

        hRule(ML, CW, 0.5, RULE);
        y += 4;
    }

    // ════════════════════════════════════════════════════════
    // GENERIC SECTIONS  (key-value rows)
    // Rows whose label starts with "Total" are rendered bold
    // Payments are injected after REPORT.paymentsPosition index
    // ════════════════════════════════════════════════════════
    if (REPORT.sections && REPORT.sections.length > 0) {
        REPORT.sections.forEach((sec, secIdx) => {
            sectionHeading(sec.heading);
            sec.items.forEach((item, i) => {
                if (y + 15 > PH - 50) { doc.addPage(); y = 50; }
                const bold = isTotal(item.label);
                if (i % 2 === 1 || bold) {
                    sc(bold ? STRIPE : STRIPE, 'fill');
                    doc.rect(ML, y, CW, 14, 'F');
                }
                doc.setFontSize(8.5);
                sc(MUTED, 'text'); doc.setFont(undefined, bold ? 'bold' : 'normal');
                t(item.label, ML + 6, y + 10);
                sc(INK, 'text'); doc.setFont(undefined, 'bold');
                t(String(item.value), ML + CW - 6, y + 10, { align: 'right' });
                y += 14;
            });
            hRule(ML, CW, 0.5, RULE);
            y += 4;

            // Inject payments section immediately after paymentsPosition
            if (secIdx === REPORT.paymentsPosition) renderPayments();
        });
    }

    // ════════════════════════════════════════════════════════
    // AMORTIZATION TABLE  (starts on a new page)
    // ════════════════════════════════════════════════════════
    if (REPORT.amortTable && REPORT.amortTable.rows.length > 0) {
        doc.addPage(); y = 50;
        sectionHeading('Amortization Summary (Annual)');

        const C_YEAR = ML;
        const C_PRIN = ML + 130;
        const C_INT  = ML + 240;
        const C_PMI  = ML + 340;
        const C_BAL  = ML + CW;

        // Column headers
        doc.setFontSize(7.5); doc.setFont(undefined, 'bold'); sc(MUTED, 'text');
        t('Year',        C_YEAR, y);
        t('Principal',   C_PRIN, y);
        t('Interest',    C_INT,  y);
        t('PMI',         C_PMI,  y);
        t('End Balance', C_BAL,  y, { align: 'right' });
        y += 4;
        hRule(ML, CW, 0.5, RULE);

        const ROW_H = 14;
        REPORT.amortTable.rows.forEach((yr, i) => {
            if (y + ROW_H > PH - 50) { doc.addPage(); y = 50; }
            if (i % 2 === 1) { sc(STRIPE, 'fill'); doc.rect(ML, y, CW, ROW_H, 'F'); }

            doc.setFontSize(8.5); doc.setFont(undefined, 'normal');
            sc(MUTED,  'text'); t('Year ' + yr.year,       C_YEAR, y + 10);
            sc(INK,    'text'); doc.setFont(undefined, 'bold');
                                t(fmtMoney(yr.principal),  C_PRIN, y + 10);
            sc(ACCENT, 'text'); t(fmtMoney(yr.interest),   C_INT,  y + 10);
            sc(yr.pmi > 0 ? MUTED : RULE, 'text');
                                t(yr.pmi > 0 ? fmtMoney(yr.pmi) : '-', C_PMI, y + 10);
            sc(INK,    'text'); t(fmtMoney(yr.endBalance), C_BAL,  y + 10, { align: 'right' });
            y += ROW_H;
        });
        hRule(ML, CW, 0.5, RULE);
        y += 4;
    }

    // ════════════════════════════════════════════════════════
    // FOOTER  (applied to every page)
    // ════════════════════════════════════════════════════════
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        sc(RULE, 'draw'); doc.setLineWidth(0.5);
        doc.line(ML, PH - 32, PW - MR, PH - 32);
        sc(MUTED, 'text'); doc.setFontSize(7); doc.setFont(undefined, 'normal');
        t('MoneyByMath  ·  For informational purposes only. Not a loan offer or commitment to lend.', ML, PH - 20);
        t('Page ' + p + ' of ' + totalPages, PW - MR, PH - 20, { align: 'right' });
    }

    // ── Save ─────────────────────────────────────────────────────────────────
    doc.save(REPORT.filename);
    btn.innerHTML = '✓ Saved!';
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

    syncLoanAmount();
    syncPropertyTaxFromDollar();
    toggleArmFields();
    calculateMortgage();
    initPayoffFloat();
    await loadMortgageRate();
});