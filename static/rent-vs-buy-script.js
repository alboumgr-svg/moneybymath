let rentBuyChart = null;
const API_BASE = 'http://localhost:5000'; // ← change to your Render URL for production

const STATE_IDS = ['homePrice','downPaymentPct','downPaymentDollar','mortgageRate','mortgageTerm',
                      'propertyTaxDollar','propertyTaxPct','homeInsurance','hoaFees',
                      'maintenancePct','maintenanceDollar','appreciation','monthlyRent',
                      'rentIncrease','rentersInsurance','investmentReturn','yearsToAnalyze','monthsToAnalyze'];

// ─── Dual-field sync helpers ──────────────────────────────────────────────────

function syncDownPaymentFromPct() {
    const price  = parseFormattedNumber(document.getElementById('homePrice').value);
    const pct    = parseFloat(document.getElementById('downPaymentPct').value) || 0;
    const dollar = (price * pct) / 100;
    document.getElementById('downPaymentDollar').value = dollar > 0 ? Math.round(dollar).toLocaleString('en-US') : '';
}
function syncDownPaymentFromDollar() {
    const price  = parseFormattedNumber(document.getElementById('homePrice').value);
    const dollar = parseFormattedNumber(document.getElementById('downPaymentDollar').value);
    if (price > 0) document.getElementById('downPaymentPct').value = ((dollar / price) * 100).toFixed(2);
}

function syncPropertyTaxFromPct() {
    const price  = parseFormattedNumber(document.getElementById('homePrice').value);
    const pct    = parseFloat(document.getElementById('propertyTaxPct').value) || 0;
    const dollar = (price * pct) / 100;
    document.getElementById('propertyTaxDollar').value = dollar > 0 ? Math.round(dollar).toLocaleString('en-US') : '';
}
function syncPropertyTaxFromDollar() {
    const price  = parseFormattedNumber(document.getElementById('homePrice').value);
    const dollar = parseFormattedNumber(document.getElementById('propertyTaxDollar').value);
    if (price > 0) document.getElementById('propertyTaxPct').value = ((dollar / price) * 100).toFixed(3);
}

function syncMaintenanceFromPct() {
    const price  = parseFormattedNumber(document.getElementById('homePrice').value);
    const pct    = parseFloat(document.getElementById('maintenancePct').value) || 0;
    const dollar = (price * pct) / 100;
    document.getElementById('maintenanceDollar').value = dollar > 0 ? Math.round(dollar).toLocaleString('en-US') : '';
}
function syncMaintenanceFromDollar() {
    const price  = parseFormattedNumber(document.getElementById('homePrice').value);
    const dollar = parseFormattedNumber(document.getElementById('maintenanceDollar').value);
    if (price > 0) document.getElementById('maintenancePct').value = ((dollar / price) * 100).toFixed(3);
}

// ─── Currency formatting ──────────────────────────────────────────────────────

function formatCurrencyInput(input) {
    const raw       = input.value;
    const cursorPos = input.selectionStart;

    // Count significant characters (digits + dot) before cursor in old value
    const sigBeforeCursor = raw.slice(0, cursorPos).replace(/[^0-9.]/g, '').length;

    // Strip everything except digits and first decimal point
    let clean = raw.replace(/[^0-9.]/g, '');
    const dotIdx = clean.indexOf('.');
    if (dotIdx !== -1) {
        clean = clean.slice(0, dotIdx + 1) + clean.slice(dotIdx + 1).replace(/\./g, '');
    }

    // Add commas to integer part only
    const parts   = clean.split('.');
    parts[0]      = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const formatted = parts.length > 1 ? parts[0] + '.' + parts[1] : parts[0];

    input.value = formatted;

    // Restore cursor by re-counting significant chars in formatted string
    let sigCount  = 0;
    let newCursor = formatted.length; // default to end
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

// ─── Input handler (called by oninput on every field) ────────────────────────

function handleInput(input) {
    if (input.dataset.inputType === 'currency') {
        formatCurrencyInput(input);
    }
    saveToStorage();
    calculateRentVsBuy();
}

// ─── Validation ───────────────────────────────────────────────────────────────

const REQUIRED_FIELDS = {
    homePrice:        'Home Price',
    downPaymentPct:   'Down Payment',
    mortgageRate:     'Mortgage Rate',
    mortgageTerm:     'Mortgage Term',
    monthlyRent:      'Monthly Rent',
    yearsToAnalyze:   'Years to Analyze',
    appreciation:     'Appreciation Rate',
    investmentReturn: 'Investment Return',
    maintenancePct:   'Maintenance',
    propertyTaxDollar:'Property Tax',
    homeInsurance:    'Home Insurance',
    hoaFees:          'HOA Fees',
    rentIncrease:     'Rent Increase',
    rentersInsurance: 'Renters Insurance'
};

function setResultsMessage(msg) {
    ['buyNetWorth','rentNetWorth','difference','buyMonthly','breakEven',
     'totalBuyCost','totalRentCost','investmentPortfolio'
    ].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = msg; });
    document.getElementById('differencePercent').textContent = '';
    document.getElementById('breakEvenDate').textContent     = '';
    document.getElementById('breakEven').style.color     = 'black';
    document.getElementById('yearsDisplay').textContent      = '--';
    document.getElementById('yearsDisplay1').textContent      = '--';
    document.getElementById('yearsDisplay2').textContent      = '--';
    ['buyNetWorthBreakdown','rentNetWorthBreakdown','differenceBreakdown',
     'buyMonthlyBreakdown','breakEvenBreakdown','totalBuyCostBreakdown',
     'totalRentCostBreakdown'
    ].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
    if (rentBuyChart) { rentBuyChart.destroy(); rentBuyChart = null; }
}

// ─── Floating winner pill ─────────────────────────────────────────────────────

// Copy current winner card state into the floating pill
function syncFloat() {
    const winnerEl      = document.getElementById('winner');
    const yearsEl       = document.getElementById('yearsDisplay');
    const floatEl       = document.getElementById('winnerFloat');
    const floatValueEl  = document.getElementById('winnerFloat-value');
    const floatYearsEl  = document.getElementById('yearsDisplayFloat');
    if (!floatEl || !winnerEl) return;
    floatValueEl.textContent  = winnerEl.textContent;
    floatValueEl.style.color  = winnerEl.style.color || '#6B7280';
    if (floatYearsEl) floatYearsEl.textContent = yearsEl ? yearsEl.textContent : '--';
    // Mirror the left-border from the result card onto the float pill
    const card = winnerEl.parentElement;
    if (card) floatEl.style.borderLeft = card.style.borderLeft || '1.5px solid #E5E7EB';
}

// Show/hide the float based on whether the original result-highlight card is on-screen
function initWinnerFloat() {
    const originalCard = document.querySelector('.result-card.result-highlight');
    const floatEl      = document.getElementById('winnerFloat');
    if (!originalCard || !floatEl) return;

    const observer = new IntersectionObserver(
        entries => {
            const isVisible = entries[0].isIntersecting;
            if (isVisible) {
                floatEl.classList.remove('visible');
            } else {
                syncFloat();
                floatEl.classList.add('visible');
            }
        },
        { threshold: 0.5 }   // card must be at least half-visible to suppress the float
    );
    observer.observe(originalCard);
}

// ─── Main calculation ─────────────────────────────────────────────────────────

function calculateRentVsBuy() {
    // Validate required fields
    const missing = [];
    const winnerAfter = document.getElementById('winner-after');
    const winnerAfterFloat = document.getElementById('winner-after-float'); 
    for (const [id, label] of Object.entries(REQUIRED_FIELDS)) {
        const raw = document.getElementById(id).value.trim().replace(/,/g, '');
        if (raw === '' || isNaN(parseFloat(raw))) missing.push(label);
    }
    if (missing.length > 0) {
        setResultsMessage('--');
        const winnerEl = document.getElementById('winner');
        winnerAfter.style.display = 'none';
        winnerAfterFloat.style.display = 'none';
        
        if (missing.length === Object.keys(REQUIRED_FIELDS).length || missing.length > 3) {
            // If everything is missing OR more than 3 things are missing
            winnerEl.textContent = 'Fill in fields to calculate';
        } else {
            // If 1-3 things are missing, list them
            winnerEl.textContent = 'Missing: ' + missing.join(', ');
        }

        winnerEl.style.color = '#6B7280';
        syncFloat();
        return;
    }

    winnerAfter.style.display = 'block';
    winnerAfterFloat.style.display = 'block';

    // ── Parse inputs ──────────────────────────────────────────────────────────
    const homePrice = parseFormattedNumber(document.getElementById('homePrice').value);

    // Down payment - prefer dollar (synced from %), fall back to pct
    const dpDollar = parseFormattedNumber(document.getElementById('downPaymentDollar').value);
    const dpPct    = parseFloat(document.getElementById('downPaymentPct').value) || 0;
    const downPayment = dpDollar > 0 ? dpDollar : (homePrice * dpPct / 100);

    const mortgageRate = parseFloat(document.getElementById('mortgageRate').value) / 100;
    const mortgageTerm = parseInt(document.getElementById('mortgageTerm').value);

    // Property tax - prefer dollar (synced from %), fall back to pct
    const ptDollar = parseFormattedNumber(document.getElementById('propertyTaxDollar').value);
    const ptPct    = parseFloat(document.getElementById('propertyTaxPct').value) || 0;
    const propertyTax = ptDollar > 0 ? ptDollar : (homePrice * ptPct / 100);

    const homeInsurance = parseFormattedNumber(document.getElementById('homeInsurance').value);
    const hoaFees       = parseFormattedNumber(document.getElementById('hoaFees').value);

    // Maintenance - prefer dollar (synced from %), fall back to pct
    const mtDollar = parseFormattedNumber(document.getElementById('maintenanceDollar').value);
    const mtPct    = parseFloat(document.getElementById('maintenancePct').value) || 0;
    const maintenanceAnnual = mtDollar > 0 ? mtDollar : (homePrice * mtPct / 100);

    const appreciationRate = parseFloat(document.getElementById('appreciation').value) / 100 || 0;
    const monthlyRent      = parseFormattedNumber(document.getElementById('monthlyRent').value);
    const rentIncreaseRate = parseFloat(document.getElementById('rentIncrease').value) / 100 || 0;
    const rentersInsurance = parseFormattedNumber(document.getElementById('rentersInsurance').value);
    const investmentReturn = parseFloat(document.getElementById('investmentReturn').value) / 100 || 0;
    const yearsToAnalyze   = parseInt(document.getElementById('yearsToAnalyze').value);
    const monthsToAnalyze  = parseInt(document.getElementById('monthsToAnalyze').value) || 0;

    const totalMonths = (yearsToAnalyze * 12) + monthsToAnalyze;

    // ── Mortgage calculation ──────────────────────────────────────────────────
    const loanAmount      = homePrice - downPayment;
    const monthlyRate     = mortgageRate / 12;
    const numPayments     = mortgageTerm * 12;
    const monthlyMortgage = loanAmount > 0 && monthlyRate > 0
        ? loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
          (Math.pow(1 + monthlyRate, numPayments) - 1)
        : loanAmount / numPayments;

    const monthlyPropertyTax = propertyTax / 12;
    const monthlyInsurance   = homeInsurance / 12;
    const monthlyMaintenance = maintenanceAnnual / 12;
    const totalMonthlyBuy    = monthlyMortgage + monthlyPropertyTax + monthlyInsurance + hoaFees + monthlyMaintenance;

    // ── Simulation loop ───────────────────────────────────────────────────────
    let buyNetWorth         = 0;
    let rentNetWorth        = 0;
    let homeValue           = homePrice;
    let loanBalance         = loanAmount;
    let investmentPortfolio = downPayment;
    let totalBuyCost        = downPayment;
    let totalRentCost       = 0;
    let breakEvenYear       = null;
    let snapshotHomeValue   = homePrice;   // homeValue at the time buyNetWorth was last computed
    let snapshotLoanBalance = loanAmount;  // loanBalance at the same moment

    // Sub-total trackers for detailed breakdowns
    let totalMortgagePayments   = 0;
    let totalPropertyTaxPaid    = 0;
    let totalInsurancePaid      = 0;
    let totalHOAPaid            = 0;
    let totalMaintenancePaid    = 0;
    let totalRentOnly           = 0;
    let totalRentersInsurancePaid = 0;
    let totalSavingsContributed = 0;

    const buyNetWorthHistory  = [];
    const rentNetWorthHistory = [];
    const years               = [];

    for (let month = 0; month <= totalMonths; month++) {
        const currentYear = month / 12;

        if (month % 12 === 0 || month === totalMonths) {
            years.push(currentYear);

            if (month === 0) {
                buyNetWorth  = homeValue - loanBalance - (homePrice * 0.06);
                rentNetWorth = investmentPortfolio;
                snapshotHomeValue   = homeValue;
                snapshotLoanBalance = loanBalance;
            } else {
                buyNetWorth  = homeValue - loanBalance - (homeValue * 0.06);
                rentNetWorth = investmentPortfolio;
                snapshotHomeValue   = homeValue;
                snapshotLoanBalance = loanBalance;

                if (breakEvenYear === null && buyNetWorth > rentNetWorth) {
                    breakEvenYear = currentYear;
                }
            }

            buyNetWorthHistory.push(buyNetWorth);
            rentNetWorthHistory.push(rentNetWorth);
        }

        if (month > 0) {
            homeValue = homeValue * (1 + appreciationRate / 12);

            const interestPayment  = loanBalance * monthlyRate;
            const principalPayment = monthlyMortgage - interestPayment;
            const hadLoan          = loanBalance > 0;                        // check BEFORE applying
            loanBalance            = Math.max(0, loanBalance - principalPayment);

            const mortgageThisMonth = hadLoan ? monthlyMortgage : 0;         // zero after payoff
            const actualMonthlyBuy  = mortgageThisMonth + monthlyPropertyTax + monthlyInsurance + hoaFees + monthlyMaintenance;
            totalBuyCost          += actualMonthlyBuy;

            // Sub-total accumulation
            totalMortgagePayments   += mortgageThisMonth;
            totalPropertyTaxPaid    += monthlyPropertyTax;
            totalInsurancePaid      += monthlyInsurance;
            totalHOAPaid            += hoaFees;
            totalMaintenancePaid    += monthlyMaintenance;

            const monthlyRentCurrent = monthlyRent * Math.pow(1 + rentIncreaseRate, (month - 1) / 12);
            totalRentCost           += monthlyRentCurrent + (rentersInsurance / 12);
            totalRentOnly           += monthlyRentCurrent;
            totalRentersInsurancePaid += rentersInsurance / 12;

            const monthlySavings = totalMonthlyBuy - (monthlyRentCurrent + rentersInsurance / 12);
            if (monthlySavings > 0) totalSavingsContributed += monthlySavings;
            investmentPortfolio  = investmentPortfolio * (1 + investmentReturn / 12)
                                 + (monthlySavings > 0 ? monthlySavings : 0);
            rentNetWorth = investmentPortfolio;
        }
    }

    // ── Render results ────────────────────────────────────────────────────────
    const fmt = v => '$' + Math.round(v).toLocaleString('en-US');

    let timeString = '';
    if (yearsToAnalyze  > 0) timeString += yearsToAnalyze  + ' year'  + (yearsToAnalyze  !== 1 ? 's' : '');
    if (monthsToAnalyze > 0) {
        if (timeString) timeString += ', ';
        timeString += monthsToAnalyze + ' month' + (monthsToAnalyze !== 1 ? 's' : '');
    }
    document.getElementById('yearsDisplay').textContent  = timeString;
    document.getElementById('yearsDisplay1').textContent  = timeString;
    document.getElementById('yearsDisplay2').textContent  = timeString;
    document.getElementById('buyNetWorth').textContent   = fmt(buyNetWorth);
    document.getElementById('rentNetWorth').textContent  = fmt(rentNetWorth);

    const difference  = buyNetWorth - rentNetWorth;
    const denom       = Math.max(Math.abs(buyNetWorth), Math.abs(rentNetWorth), 1);
    const diffPercent = ((Math.abs(difference) / denom) * 100).toFixed(1);
    document.getElementById('difference').textContent = fmt(Math.abs(difference));

    const winnerEl = document.getElementById('winner');
    const winnerCard = winnerEl.parentElement;
    if (difference > 0) {
        document.getElementById('differencePercent').textContent = 'Buying wins by ' + diffPercent + '%';
        winnerEl.textContent = 'Buying is Better';
        winnerEl.style.color = 'var(--primary)';
        if (winnerCard) winnerCard.style.borderLeft = '4px solid var(--primary)';
    } else {
        document.getElementById('differencePercent').textContent = 'Renting wins by ' + diffPercent + '%';
        winnerEl.textContent = 'Renting is Better';
        winnerEl.style.color = 'var(--secondary)';
        if (winnerCard) winnerCard.style.borderLeft = '4px solid var(--secondary)';
    }
    syncFloat();

    document.getElementById('buyMonthly').textContent = fmt(totalMonthlyBuy);

    if (breakEvenYear !== null) {
        const beYears  = Math.floor(breakEvenYear);
        const beMonths = Math.round((breakEvenYear - beYears) * 12);
        let beString   = 'Year ' + beYears;
        if (beMonths > 0) beString += ', ' + beMonths + ' mo';
        document.getElementById('breakEven').textContent     = beString;
        document.getElementById('breakEven').style.color     = 'black';
        document.getElementById('breakEvenDate').textContent = 'Break-even: ' + getFutureDate(beYears, beMonths);
    } else {
        document.getElementById('breakEven').textContent     = 'Never (in this timeframe)';
        document.getElementById('breakEven').style.color     = 'var(--accent)';
        document.getElementById('breakEvenDate').textContent = '';
    }

    document.getElementById('totalBuyCost').textContent        = fmt(totalBuyCost);
    document.getElementById('totalRentCost').textContent       = fmt(totalRentCost);

    // ── Detailed breakdowns ───────────────────────────────────────────────────
    const bRowStyle      = `display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #f1f5f9;font-size:0.82rem;gap:12px;`;
    const bTotalStyle    = `display:flex;justify-content:space-between;align-items:center;padding:7px 0 2px;font-size:0.84rem;gap:12px;`;
    const lblStyle       = `color:#6b7280;white-space:nowrap;`;
    const valStyle       = `font-weight:700;color:#111827;white-space:nowrap;`;
    const totalLblStyle  = `font-weight:700;color:#374151;`;
    const totalValStyle  = `font-weight:800;color:var(--primary,#2563eb);`;

    function bRow(label, val, isTotal = false) {
        // Check if the value is meant to be negative (starts with '-')
        const isNegative = typeof val === 'string' && val.startsWith('-');
        
        // Extract just the number for rounding/formatting
        // If it was a string like '-$500', we strip the '-$' to get the number
        const numericVal = typeof val === 'string' 
            ? parseFloat(val.replace(/[^0-9.-]/g, '')) 
            : val;

        const rowS = isTotal ? bTotalStyle : bRowStyle;
        const lblS = isTotal ? totalLblStyle : lblStyle;
        const valS = isTotal ? totalValStyle : valStyle;

        // Format the number
        const formattedNum = Math.round(Math.abs(numericVal)).toLocaleString();
        
        // Reconstruct the string: puts the minus sign BEFORE the dollar sign
        const displayVal = (isNegative || numericVal < 0 ? '-' : '') + '$' + formattedNum;

        return `
            <div style="${rowS}">
                <span style="${lblS}">${label}</span>
                <span style="${valS}">${displayVal}</span>
            </div>`;
    }

    function bRowText(label, text, isTotal = false) {
        const rs = isTotal ? bTotalStyle   : bRowStyle;
        const ls = isTotal ? totalLblStyle : lblStyle;
        const vs = isTotal ? totalValStyle : valStyle;
        return `<div style="${rs}"><span style="${ls}">${label}</span><span style="${vs}">${text}</span></div>`;
    }
    const wrap = html => `<div style="margin-top:12px;border-top:1px solid #f1f5f9;padding-top:4px;">${html}</div>`;

    // Derived values - use snapshot homeValue/loanBalance so breakdown rows sum to buyNetWorth
    const principalPaid      = loanAmount - snapshotLoanBalance;
    const totalInterestPaid  = Math.max(0, totalMortgagePayments - principalPaid);
    const appreciationGained = snapshotHomeValue - homePrice;
    const sellingCosts       = snapshotHomeValue * 0.06;
    const downPaymentGrown   = downPayment * Math.pow(1 + investmentReturn / 12, totalMonths);
    const savingsGrowth      = investmentPortfolio - downPaymentGrown;

    // Monthly Payment (Buying)
    document.getElementById('buyMonthlyBreakdown').innerHTML = wrap(
        bRow('Mortgage P&I',   monthlyMortgage) +
        bRow('Property Tax',   monthlyPropertyTax) +
        bRow('Home Insurance', monthlyInsurance) +
        (hoaFees > 0 ? bRow('HOA Fees', hoaFees) : '') +
        bRow('Maintenance',    monthlyMaintenance) +
        bRow('Total',          totalMonthlyBuy, true)
    );

    // Buying Net Worth
    document.getElementById('buyNetWorthBreakdown').innerHTML = wrap(
        bRow('Final Home Value',       snapshotHomeValue) +
        bRow('Remaining Loan Balance', -snapshotLoanBalance) +
        bRow('Selling Costs (6%)',     -sellingCosts) +
        bRow('Net Equity',             buyNetWorth, true)
    );

    // Renting Net Worth
    document.getElementById('rentNetWorthBreakdown').innerHTML = wrap(
        bRow('Down Payment Initial Investment',  downPayment) +
        bRow('Down Payment Investment Growth',    downPaymentGrown) +
        bRow('Monthly Savings Invested', totalSavingsContributed) +
        bRow('Monthly Savings Growth',  Math.max(0, savingsGrowth)) +
        bRow('Total Portfolio',        investmentPortfolio, true)
    );

    // Difference
    document.getElementById('differenceBreakdown').innerHTML = wrap(
        bRow('Buying Net Worth',  buyNetWorth) +
        bRow('Renting Net Worth', rentNetWorth) +
        bRow('Advantage',         Math.abs(difference), true)
    );

    // Break Even
    document.getElementById('breakEvenBreakdown').innerHTML = wrap(
        bRowText('Upfront Buying Cost',   fmt(downPayment)) +
        bRowText('Initial Rent Advantage', 'Ongoing') +
        bRowText('Appreciation Needed',   fmt(downPayment * (mortgageRate + 0.02)))
    );

    // Total Cost of Buying
    document.getElementById('totalBuyCostBreakdown').innerHTML = wrap(
        bRow('Down Payment',           downPayment) +
        bRow('Mortgage Payments',      totalMortgagePayments) +
        bRow('↳ Principal Paid',       principalPaid) +
        bRow('↳ Interest Paid',        totalInterestPaid) +
        bRow('Property Tax',           totalPropertyTaxPaid) +
        bRow('Home Insurance',         totalInsurancePaid) +
        (totalHOAPaid > 0 ? bRow('HOA Fees', totalHOAPaid) : '') +
        bRow('Maintenance',            totalMaintenancePaid) +
        bRow('Total',                  totalBuyCost, true)
    );

    // Total Cost of Renting
    document.getElementById('totalRentCostBreakdown').innerHTML = wrap(
        bRow('Rent Paid',              totalRentOnly) +
        bRow('Renters Insurance',      totalRentersInsurancePaid) +
        bRow('Total',                  totalRentCost, true)
    );

    updateRentBuyChart(years, buyNetWorthHistory, rentNetWorthHistory);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getFutureDate(years, months = 0) {
    const date = new Date();
    date.setMonth(date.getMonth() + Math.round(years * 12) + months);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// ─── Chart ────────────────────────────────────────────────────────────────────

function updateRentBuyChart(years, buyData, rentData) {
    const ctx = document.getElementById('rentBuyChart').getContext('2d');
    if (rentBuyChart) rentBuyChart.destroy();

    rentBuyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: years,
            datasets: [
                {
                    label: 'Buying Net Worth',
                    data: buyData,
                    borderColor: '#2563EB',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    borderWidth: 3, fill: true, tension: 0.4,
                    pointRadius: 0, pointHoverRadius: 6
                },
                {
                    label: 'Renting Net Worth',
                    data: rentData,
                    borderColor: '#10B981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 3, fill: true, tension: 0.4,
                    pointRadius: 0, pointHoverRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2,
            plugins: {
                legend: {
                    display: true, position: 'top',
                    labels: { usePointStyle: true, padding: 15, font: { size: 12, weight: '600' } }
                },
                tooltip: {
                    mode: 'index', intersect: false,
                    backgroundColor: 'rgba(255,255,255,0.95)',
                    titleColor: '#1F2937', bodyColor: '#6B7280',
                    borderColor: '#E5E7EB', borderWidth: 1, padding: 12,
                    callbacks: {
                        label: ctx => {
                            const lbl = ctx.dataset.label ? ctx.dataset.label + ': ' : '';
                            return lbl + '$' + Math.round(ctx.parsed.y).toLocaleString('en-US');
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    title: { display: true, text: 'Years', color: '#6B7280', font: { size: 12, weight: '600' } },
                    ticks: { color: '#9CA3AF', font: { size: 11 } },
                    grid:  { color: '#E5E7EB', drawTicks: false }
                },
                y: {
                    display: true,
                    title: { display: true, text: 'Net Worth ($)', color: '#6B7280', font: { size: 12, weight: '600' } },
                    ticks: {
                        color: '#9CA3AF', font: { size: 11 },
                        callback: v => v >= 1000000
                            ? '$' + (v / 1000000).toFixed(1) + 'M'
                            : '$' + (v / 1000).toFixed(0) + 'k'
                    },
                    grid: { color: '#E5E7EB' }
                }
            },
            interaction: { mode: 'nearest', axis: 'x', intersect: false }
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

        const input = document.getElementById('mortgageRate');
        const label = document.querySelector('label[for="mortgageRate"]');

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

// ─── Reset ────────────────────────────────────────────────────────────────────

function clearAll() {
    STATE_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    localStorage.removeItem('rentVsBuyData');
    setResultsMessage('--');
    const winnerEl = document.getElementById('winner');
    if (winnerEl) {
        winnerEl.textContent = 'Fill in fields to calculate';
        winnerEl.style.color = '#6B7280';
    }
    const winnerAfter = document.getElementById('winner-after');
    if (winnerAfter) winnerAfter.style.display = 'none';
    const winnerAfterFloat = document.getElementById('winner-after-float');
    if (winnerAfterFloat) winnerAfterFloat.style.display = 'none';
    syncFloat();
}

// ─── Local storage ────────────────────────────────────────────────────────────

function saveToStorage() {
    const data = {};
    STATE_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) data[id] = el.value;
    });
    localStorage.setItem('rentVsBuyData', JSON.stringify(data));
}

function loadFromStorage() {
    const saved = localStorage.getItem('rentVsBuyData');
    if (!saved) return;
    try {
        const data = JSON.parse(saved);
        Object.keys(data).forEach(key => {
            const el = document.getElementById(key);
            if (el && data[key] !== undefined) el.value = data[key];
        });
    } catch (e) {}
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

    const hasData = Object.keys(REQUIRED_FIELDS).every(id => {
        const v = document.getElementById(id).value.trim().replace(/,/g, '');
        return v !== '' && !isNaN(parseFloat(v));
    });

    //if (hasData) {
    //    calculateRentVsBuy();
    //} else {
    //    setResultsMessage('--');
    //    const winnerEl      = document.getElementById('winner');
    //    winnerEl.textContent = 'Fill in fields to calculate';
    //    winnerEl.style.color = '#6B7280';
    //    syncFloat();
    //}
    calculateRentVsBuy();
    syncFloat();
    initWinnerFloat();
    loadMortgageRate();
});