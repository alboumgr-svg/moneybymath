/* Affordability calculator script
   Input pattern modeled after rent-vs-buy:
   - Placeholders instead of hardcoded values
   - Toggle buttons (% ↔ $) for downPayment, propTax, maintenance, insurance
   - Unified handleInput() + formatCurrencyInput()
   - Required-field validation
   - localStorage persistence
   - DOMContentLoaded init
   All calculation logic is unchanged.
*/

let budgetChart = null;
const API_BASE = window.location.origin; 

const STATE_IDS = [
    'homePrice', 'downPaymentPct', 'downPaymentDollar', 'closingPct', 'closingDollar', 'loanTerm', 'interestRate',
    'propTaxPct', 'propTaxDollar', 'insuranceDollar', 'insurancePct',
    'hoa', 'maintenancePct', 'maintenanceDollar', 'utilities',
    'takeHome', 'otherSpending', 'otherDebtMonthly', 'savingsTarget'
];

// ─── Dual-field sync helpers ──────────────────────────────────────────────────

function syncDownPaymentFromPct() {
    const price = parseFormattedNumber(document.getElementById('homePrice').value);
    const pct   = parseFloat(document.getElementById('downPaymentPct').value) || 0;
    const dollar = (price * pct) / 100;
    document.getElementById('downPaymentDollar').value = dollar > 0 ? Math.round(dollar).toLocaleString('en-US') : '';
}
function syncDownPaymentFromDollar() {
    const price  = parseFormattedNumber(document.getElementById('homePrice').value);
    const dollar = parseFormattedNumber(document.getElementById('downPaymentDollar').value);
    if (price > 0) document.getElementById('downPaymentPct').value = ((dollar / price) * 100).toFixed(2);
}

function syncPropTaxFromPct() {
    const price = parseFormattedNumber(document.getElementById('homePrice').value);
    const pct   = parseFloat(document.getElementById('propTaxPct').value) || 0;
    const dollar = (price * pct) / 100;
    document.getElementById('propTaxDollar').value = dollar > 0 ? Math.round(dollar).toLocaleString('en-US') : '';
}
function syncPropTaxFromDollar() {
    const price  = parseFormattedNumber(document.getElementById('homePrice').value);
    const dollar = parseFormattedNumber(document.getElementById('propTaxDollar').value);
    if (price > 0) document.getElementById('propTaxPct').value = ((dollar / price) * 100).toFixed(3);
}

function syncMaintenanceFromPct() {
    const price = parseFormattedNumber(document.getElementById('homePrice').value);
    const pct   = parseFloat(document.getElementById('maintenancePct').value) || 0;
    const dollar = (price * pct) / 100;
    document.getElementById('maintenanceDollar').value = dollar > 0 ? Math.round(dollar).toLocaleString('en-US') : '';
}
function syncMaintenanceFromDollar() {
    const price  = parseFormattedNumber(document.getElementById('homePrice').value);
    const dollar = parseFormattedNumber(document.getElementById('maintenanceDollar').value);
    if (price > 0) document.getElementById('maintenancePct').value = ((dollar / price) * 100).toFixed(3);
}

function syncInsuranceFromDollar() {
    const price  = parseFormattedNumber(document.getElementById('homePrice').value);
    const dollar = parseFormattedNumber(document.getElementById('insuranceDollar').value);
    if (price > 0) document.getElementById('insurancePct').value = ((dollar / price) * 100).toFixed(3);
}
function syncInsuranceFromPct() {
    const price = parseFormattedNumber(document.getElementById('homePrice').value);
    const pct   = parseFloat(document.getElementById('insurancePct').value) || 0;
    const dollar = (price * pct) / 100;
    document.getElementById('insuranceDollar').value = dollar > 0 ? Math.round(dollar).toLocaleString('en-US') : '';
}

function syncClosingFromPct() {
    const price = parseFormattedNumber(document.getElementById('homePrice').value);
    const pct   = parseFloat(document.getElementById('closingPct').value) || 0;
    const dollar = (price * pct) / 100;
    document.getElementById('closingDollar').value = dollar > 0 ? Math.round(dollar).toLocaleString('en-US') : '';
}
function syncClosingFromDollar() {
    const price  = parseFormattedNumber(document.getElementById('homePrice').value);
    const dollar = parseFormattedNumber(document.getElementById('closingDollar').value);
    if (price > 0) document.getElementById('closingPct').value = ((dollar / price) * 100).toFixed(2);
}

// ─── Required fields for validation ──────────────────────────────────────────
const REQUIRED_FIELDS = {
    homePrice:        'Home Price',
    downPaymentPct:   'Down Payment',
    closingPct:       'Closing Costs',
    loanTerm:         'Loan Term',
    interestRate:     'Interest Rate',
    propTaxPct:       'Property Tax',
    insuranceDollar:  'Home Insurance',
    hoa:              'HOA Fees',
    maintenancePct:   'Maintenance',
    utilities:        'Utilities',
    takeHome:         'Monthly Take-Home',
    otherSpending:    'Other Spending',
    otherDebtMonthly: 'Monthly Debt Payments',
    savingsTarget:    'Savings Target'
};

// ─── Currency formatting ──────────────────────────────────────────────────────

function formatCurrencyInput(input) {
    const raw       = input.value;
    const cursorPos = input.selectionStart;

    const sigBeforeCursor = raw.slice(0, cursorPos).replace(/[^0-9.]/g, '').length;

    let clean = raw.replace(/[^0-9.]/g, '');
    const dotIdx = clean.indexOf('.');
    if (dotIdx !== -1) {
        clean = clean.slice(0, dotIdx + 1) + clean.slice(dotIdx + 1).replace(/\./g, '');
    }

    const parts  = clean.split('.');
    parts[0]     = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const formatted = parts.length > 1 ? parts[0] + '.' + parts[1] : parts[0];

    input.value = formatted;

    let sigCount  = 0;
    let newCursor = formatted.length;
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

// ─── Clamp helper (silently caps at data-max while typing) ───────────────────

function clampInput(input) {
    const max = parseFloat(input.dataset.max);
    if (isNaN(max)) return;
    const val = parseFormattedNumber(input.value);
    if (val > max) {
        if (input.dataset.inputType === 'currency') {
            input.value = Math.round(max).toLocaleString('en-US');
        } else {
            input.value = max;
        }
    }
}

// ─── Unified input handler ────────────────────────────────────────────────────

function handleInput(input) {
    if (input.dataset.inputType === 'currency') {
        formatCurrencyInput(input);
    }
    saveToStorage();
    clampInput(input);
    calculateAffordability();
}

// ─── Validation ───────────────────────────────────────────────────────────────

function setResultsEmpty() {
    ['monthlyMortgage', 'totalHousing', 'leftover', 'upfrontTotal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '--';
    });
    const upfrontBreakdownEl = document.getElementById('upfrontBreakdown');
    if (upfrontBreakdownEl) upfrontBreakdownEl.innerHTML = '';
    const housingBreakdownEl = document.getElementById('housingBreakdown');
    if (housingBreakdownEl) housingBreakdownEl.innerHTML = '';
    const mortgageBreakdownEl = document.getElementById('mortgageBreakdown');
    if (mortgageBreakdownEl) mortgageBreakdownEl.innerHTML = '';
    const leftoverBreakdownEl = document.getElementById('leftoverBreakdown');
    if (leftoverBreakdownEl) leftoverBreakdownEl.innerHTML = '';
    const leftoverSubtitleEl = document.getElementById('leftoverSubtitle');
    if (leftoverSubtitleEl) leftoverSubtitleEl.textContent = '';
    const verdictSubtitleEl = document.getElementById('verdictSubtitle');
    if (verdictSubtitleEl) verdictSubtitleEl.textContent = '';
    if (budgetChart) { budgetChart.destroy(); budgetChart = null; }
}

// ─── Floating verdict pill ────────────────────────────────────────────────────

// Copy current verdict card state into the floating pill
function syncFloat() {
    const verdictEl    = document.getElementById('verdict');
    const floatEl      = document.getElementById('verdictFloat');
    const floatValueEl = document.getElementById('verdictFloat-value');
    if (!floatEl || !verdictEl) return;
    floatValueEl.textContent = verdictEl.textContent;
    floatValueEl.style.color = verdictEl.style.color || '#6B7280';
    // Mirror the left-border colour that updateVerdict sets on the card
    const card = verdictEl.parentElement;
    if (card) floatEl.style.borderLeft = card.style.borderLeft || '1.5px solid #E5E7EB';
}

// Show/hide the float based on whether the original result-highlight card is on-screen
function initVerdictFloat() {
    const originalCard = document.querySelector('.result-card.result-highlight');
    const floatEl      = document.getElementById('verdictFloat');
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
        { threshold: 0.5 }
    );
    observer.observe(originalCard);
}

// ─── Mortgage helper ──────────────────────────────────────────────────────────

function mortgagePayment(principal, annualRate, months) {
    if (principal <= 0 || months <= 0) return 0;
    const r = annualRate / 12;
    if (r === 0) return principal / months;
    const denom = Math.pow(1 + r, months) - 1;
    return principal * (r * Math.pow(1 + r, months) / denom);
}

// ─── Main calculation ─────────────────────────────────────────────────────────

function calculateAffordability() {
    // Validate required fields
    const missing = [];
    for (const [id, label] of Object.entries(REQUIRED_FIELDS)) {
        const raw = (document.getElementById(id).value || '').trim().replace(/,/g, '');
        if (raw === '' || isNaN(parseFloat(raw))) missing.push(label);
    }

    const verdictEl         = document.getElementById('verdict');
    const verdictSubtitleEl = document.getElementById('verdictSubtitle');
    const verdictFloatLabel = document.getElementById('verdictFloatLabel');

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
        verdictSubtitleEl.textContent = '';
        verdictFloatLabel.style.display = 'none'
        const card = verdictEl.parentElement;
        if (card) card.style.borderLeft = '4px solid var(--primary)';
        syncFloat();
        return;
    }

    verdictFloatLabel.style.display = 'block'

    // ── Parse inputs ──────────────────────────────────────────────────────────
    const price      = parseFormattedNumber(document.getElementById('homePrice').value);
    const loanMonths = (parseInt(document.getElementById('loanTerm').value) || 30) * 12;
    const apr        = (parseFloat(document.getElementById('interestRate').value) || 0) / 100;
    const closingPct = (parseFloat(document.getElementById('closingPct').value) || 0) / 100;

    const hoaMonthly       = parseFormattedNumber(document.getElementById('hoa').value);
    const utilitiesMonthly = parseFormattedNumber(document.getElementById('utilities').value);
    const takeHomeMonthly  = parseFormattedNumber(document.getElementById('takeHome').value);
    const otherSpendingMonthly  = parseFormattedNumber(document.getElementById('otherSpending').value);
    const otherDebtMonthlyVal   = parseFormattedNumber(document.getElementById('otherDebtMonthly').value);
    const savingsTargetMonthly  = parseFormattedNumber(document.getElementById('savingsTarget').value);

    // Down payment - prefer dollar (synced from %), fall back to pct
    const dpDollar = parseFormattedNumber(document.getElementById('downPaymentDollar').value);
    const dpPct    = parseFloat(document.getElementById('downPaymentPct').value) || 0;
    const downAmount = dpDollar > 0 ? dpDollar : (price * dpPct / 100);

    // Property tax - prefer dollar (synced from %), fall back to pct
    const ptDollar = parseFormattedNumber(document.getElementById('propTaxDollar').value);
    const ptPct    = parseFloat(document.getElementById('propTaxPct').value) || 0;
    const monthlyPropTax = ptDollar > 0 ? (ptDollar / 12) : ((price * ptPct / 100) / 12);

    // Maintenance - prefer dollar (synced from %), fall back to pct
    const mtDollar = parseFormattedNumber(document.getElementById('maintenanceDollar').value);
    const mtPct    = parseFloat(document.getElementById('maintenancePct').value) || 0;
    const monthlyMaintenance = mtDollar > 0 ? (mtDollar / 12) : ((price * mtPct / 100) / 12);

    // Insurance - prefer dollar, fall back to pct
    const insDollar = parseFormattedNumber(document.getElementById('insuranceDollar').value);
    const insPct    = parseFloat(document.getElementById('insurancePct').value) || 0;
    const insuranceMonthly = insDollar > 0 ? (insDollar / 12) : ((price * insPct / 100) / 12);

    // ── Core calculations (logic unchanged) ───────────────────────────────────
    const principal  = Math.max(0, price - downAmount);
    const monthlyPI  = mortgagePayment(principal, apr, loanMonths);

    const totalHousing = monthlyPI + monthlyPropTax + insuranceMonthly + monthlyMaintenance + hoaMonthly + utilitiesMonthly;
    const leftover     = takeHomeMonthly - (otherSpendingMonthly + otherDebtMonthlyVal + savingsTargetMonthly + totalHousing);

    /* ===== ONE-TIME UPFRONT COSTS ===== */
    const ccDollar     = parseFormattedNumber(document.getElementById('closingDollar').value);
    const closingCosts = ccDollar > 0 ? ccDollar : (price * closingPct);
    const taxEscrow         = monthlyPropTax * 3;
    const insuranceEscrow   = insuranceMonthly * 3;
    const prepaidInsurance  = insuranceMonthly * 12;
    const maintenanceBuffer = monthlyMaintenance * 2;
    const movingCosts       = 2000;

    const totalUpfront = downAmount + closingCosts + taxEscrow + insuranceEscrow + prepaidInsurance + maintenanceBuffer + movingCosts;

    /* ===== UI OUTPUT ===== */
    document.getElementById('monthlyMortgage').textContent = '$' + Math.round(monthlyPI).toLocaleString();
    document.getElementById('totalHousing').textContent    = '$' + Math.round(totalHousing).toLocaleString();
    document.getElementById('leftover').textContent        = '$' + Math.round(leftover).toLocaleString();
    document.getElementById('upfrontTotal').textContent    = '$' + Math.round(totalUpfront).toLocaleString();
    
    if (leftover >= 0) {
    //    document.getElementById('leftoverSubtitle').textContent = 'Remaining after housing, debt, and savings target.';
        document.getElementById('leftover').style.color  = 'black';
    }
    else {
    //    document.getElementById('leftoverSubtitle').textContent = 'Short after housing, debt, and savings target.';
        document.getElementById('leftover').style.color = '#EF4444';
    }

    const breakdownRowStyle = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 5px 0;
        border-bottom: 1px solid #f1f5f9;
        font-size: 0.82rem;
        gap: 12px;
    `;
    const breakdownLabelStyle = `color: #6b7280; white-space: nowrap;`;
    const breakdownValueStyle = `font-weight: 700; color: #111827; white-space: nowrap;`;
    const breakdownTotalStyle = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 7px 0 2px;
        font-size: 0.84rem;
        gap: 12px;
    `;
    const breakdownTotalLabelStyle = `font-weight: 700; color: #374151;`;
    const breakdownTotalValueStyle = `font-weight: 800; color: var(--primary, #2563eb);`;

    function bRow(label, val, isTotal = false) {
        // Check if the value is meant to be negative (starts with '-')
        const isNegative = typeof val === 'string' && val.startsWith('-');
        
        // Extract just the number for rounding/formatting
        // If it was a string like '-$500', we strip the '-$' to get the number
        const numericVal = typeof val === 'string' 
            ? parseFloat(val.replace(/[^0-9.-]/g, '')) 
            : val;

        const rowS = isTotal ? breakdownTotalStyle : breakdownRowStyle;
        const lblS = isTotal ? breakdownTotalLabelStyle : breakdownLabelStyle;
        const valS = isTotal ? breakdownTotalValueStyle : breakdownValueStyle;

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

    document.getElementById('housingBreakdown').innerHTML = `
        <div style="margin-top:12px; border-top:1px solid #f1f5f9; padding-top:4px;">
            ${bRow('Mortgage P&amp;I', monthlyPI)}
            ${bRow('Property Tax', monthlyPropTax)}
            ${bRow('Home Insurance', insuranceMonthly)}
            ${bRow('HOA Fees', hoaMonthly)}
            ${bRow('Maintenance', monthlyMaintenance)}
            ${bRow('Utilities', utilitiesMonthly)}
            ${bRow('Total / month', totalHousing, true)}
        </div>
    `;

    document.getElementById('upfrontBreakdown').innerHTML = `
        <div style="margin-top:12px; border-top:1px solid #f1f5f9; padding-top:4px;">
            ${bRow('Down Payment', downAmount)}
            ${bRow('Closing Costs', closingCosts)}
            ${bRow('Property Tax Escrow (3 mo)', taxEscrow)}
            ${bRow('Insurance Escrow (3 mo)', insuranceEscrow)}
            ${bRow('Prepaid Insurance (1 yr)', prepaidInsurance)}
            ${bRow('Maintenance Buffer', maintenanceBuffer)}
            ${bRow('Moving Costs', movingCosts)}
            ${bRow('Total up front', totalUpfront, true)}
        </div>
    `;

    // First-month principal vs interest split
    const firstMonthInterest   = principal * (apr / 12);
    const firstMonthPrincipal  = monthlyPI - firstMonthInterest;
    document.getElementById('mortgageBreakdown').innerHTML = `
        <div style="margin-top:12px; border-top:1px solid #f1f5f9; padding-top:4px;">
            ${bRow('Loan Amount', principal)}
            ${bRow('Est. Interest (mo 1)', firstMonthInterest)}
            ${bRow('Est. Principal (mo 1)', firstMonthPrincipal)}
            ${bRow('Total P&amp;I / month', monthlyPI, true)}
        </div>
    `;

    const leftoverColor = leftover >= 0 ? 'var(--primary, #2563eb)' : '#dc2626';
    document.getElementById('leftoverBreakdown').innerHTML = `
        <div style="margin-top:12px; border-top:1px solid #f1f5f9; padding-top:4px;">
            ${bRow('Take-Home Pay', takeHomeMonthly)}
            ${bRow('Total Housing', -totalHousing)}
            ${bRow('Other Spending', -otherSpendingMonthly)}
            ${bRow('Debt Payments', -otherDebtMonthlyVal)}
            ${bRow('Savings Target', -savingsTargetMonthly)}
            <div style="${breakdownTotalStyle}">
                <span style="${breakdownTotalLabelStyle}">Leftover / month</span>
                <span style="font-weight:800; color:${leftoverColor}; white-space:nowrap;">$${Math.round(leftover).toLocaleString()}</span>
            </div>
        </div>
    `;

    /* ===== VERDICT ===== */
    let verdictText = '';
    let subtitle    = '';
    let verdictState = '';

    if (totalHousing > takeHomeMonthly * 0.6) {
        verdictText  = 'You cannot afford this house, sorry!';
        subtitle     = `You're short $${Math.round(Math.abs(leftover)).toLocaleString()} per month after obligations. Housing alone eats over 60% of your take-home.`;
        verdictState = 'bad';
        verdictEl.style.color        = '#EF4444';
    } else if (leftover < 0) {
        verdictText  = 'You cannot afford this house, sorry!';
        subtitle     = `You're short $${Math.round(Math.abs(leftover)).toLocaleString()} per month after obligations.`;
        verdictState = 'bad';
        verdictEl.style.color        = '#EF4444';
    } else {
        const leftoverPct = leftover / Math.max(1, takeHomeMonthly);
        if (leftoverPct >= 0.20) {
            verdictText  = 'You can afford it safely';
            subtitle     = `You keep $${Math.round(leftover).toLocaleString()} per month (~${(leftoverPct * 100).toFixed(0)}% buffer).`;
            verdictState = 'good';
            verdictEl.style.color        = '#10B981';
        } else {
            verdictText  = 'You can afford it, but you will be house-poor.';
            subtitle     = `You'll have $${Math.round(leftover).toLocaleString()} left per month. Flexibility is minimal. Try to lower your monthly obligations.`;
            verdictState = 'warning';
            verdictEl.style.color        = '#F59E0B';
        }
    }

    verdictEl.textContent        = verdictText;
    verdictSubtitleEl.textContent = subtitle;
    updateVerdict(verdictEl, verdictState);
    syncFloat();

    /* ── Chart ────────────────────────────────────────────────────────────── */
    renderBudgetChart(
        document.getElementById('budgetChart'),
        [
            Math.round(totalHousing),
            Math.round(otherSpendingMonthly + otherDebtMonthlyVal + savingsTargetMonthly),
            Math.max(0, Math.round(leftover))
        ],
        ['Housing', 'Spending + Debt + Savings', 'Leftover']
    );
}

// ─── Verdict border helper ────────────────────────────────────────────────────

function updateVerdict(el, state) {
    const card = el.parentElement;
    if (!card) return;
    card.style.borderLeft =
        state === 'good'    ? '4px solid #10B981' :
        state === 'warning' ? '4px solid #F59E0B' :
                              '4px solid #EF4444';
}

// ─── Chart ────────────────────────────────────────────────────────────────────

function renderBudgetChart(canvasEl, data, labels) {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (budgetChart) budgetChart.destroy();

    budgetChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{ data, borderWidth: 0 }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { usePointStyle: true }
                }
            }
        }
    });
}

// ─── Local storage ────────────────────────────────────────────────────────────

function saveToStorage() {
    const data = {};
    STATE_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) data[id] = el.value;
    });
    localStorage.setItem('affordHouseData', JSON.stringify(data));
}

function loadFromStorage() {
    const saved = localStorage.getItem('affordHouseData');
    if (!saved) return;
    try {
        const data = JSON.parse(saved);
        Object.keys(data).forEach(key => {
            const el = document.getElementById(key);
            if (el && data[key] !== undefined) el.value = data[key];
        });
    } catch (e) {}
}

// ─── Reset ────────────────────────────────────────────────────────────────────

function clearAll() {
    STATE_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    localStorage.removeItem('affordHouseData');
    setResultsEmpty();

    const verdictEl = document.getElementById('verdict');
    if (verdictEl) {
        verdictEl.textContent = 'Fill in fields to calculate';
        verdictEl.style.color = '#6B7280';
        const card = verdictEl.parentElement;
        if (card) card.style.borderLeft = '4px solid var(--primary)';
    }
    document.getElementById('verdictSubtitle').textContent = '';
    syncFloat();
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

// ── PDF Export ───────────────────────────────────────────────────────────────

async function downloadPDF() {
    const { jsPDF } = window.jspdf;

    const btn = document.getElementById('downloadPdfBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Generating...';
    btn.disabled = true;

    // ── Helper: read a result element's text ──────────────────────────────────
    function result(id) { return (document.getElementById(id)?.textContent || '').trim(); }
    function fmtMoney(n) { return '$' + Math.round(n).toLocaleString(); }

    // ── Re-read all computed values straight from the DOM ─────────────────────
    const homePrice       = parseFormattedNumber(document.getElementById('homePrice').value);
    const downPct         = parseFloat(document.getElementById('downPaymentPct').value) || 0;
    const downDollar      = parseFormattedNumber(document.getElementById('downPaymentDollar').value);
    const downAmount      = downDollar > 0 ? downDollar : (homePrice * downPct / 100);
    const loanTerm        = parseInt(document.getElementById('loanTerm').value) || 30;
    const interestRate    = parseFloat(document.getElementById('interestRate').value) || 0;
    const closingPctVal   = parseFloat(document.getElementById('closingPct').value) || 0;
    const closingDollar   = parseFormattedNumber(document.getElementById('closingDollar').value);
    const closingCosts    = closingDollar > 0 ? closingDollar : (homePrice * closingPctVal / 100);

    const ptDollar        = parseFormattedNumber(document.getElementById('propTaxDollar').value);
    const ptPct           = parseFloat(document.getElementById('propTaxPct').value) || 0;
    const monthlyPropTax  = ptDollar > 0 ? (ptDollar / 12) : ((homePrice * ptPct / 100) / 12);

    const insDollar       = parseFormattedNumber(document.getElementById('insuranceDollar').value);
    const insPct          = parseFloat(document.getElementById('insurancePct').value) || 0;
    const insuranceMonthly = insDollar > 0 ? (insDollar / 12) : ((homePrice * insPct / 100) / 12);

    const mtDollar        = parseFormattedNumber(document.getElementById('maintenanceDollar').value);
    const mtPct           = parseFloat(document.getElementById('maintenancePct').value) || 0;
    const monthlyMaint    = mtDollar > 0 ? (mtDollar / 12) : ((homePrice * mtPct / 100) / 12);

    const hoaMonthly      = parseFormattedNumber(document.getElementById('hoa').value);
    const utilitiesMonthly = parseFormattedNumber(document.getElementById('utilities').value);
    const takeHome        = parseFormattedNumber(document.getElementById('takeHome').value);
    const otherSpending   = parseFormattedNumber(document.getElementById('otherSpending').value);
    const otherDebt       = parseFormattedNumber(document.getElementById('otherDebtMonthly').value);
    const savingsTarget   = parseFormattedNumber(document.getElementById('savingsTarget').value);

    const principal       = Math.max(0, homePrice - downAmount);
    const apr             = interestRate / 100;
    const loanMonths      = loanTerm * 12;
    const monthlyPI       = mortgagePayment(principal, apr, loanMonths);
    const totalHousing    = monthlyPI + monthlyPropTax + insuranceMonthly + monthlyMaint + hoaMonthly + utilitiesMonthly;
    const leftover        = takeHome - (otherSpending + otherDebt + savingsTarget + totalHousing);

    const taxEscrow         = monthlyPropTax * 3;
    const insuranceEscrow   = insuranceMonthly * 3;
    const prepaidInsurance  = insuranceMonthly * 12;
    const maintenanceBuffer = monthlyMaint * 2;
    const movingCosts       = 2000;
    const totalUpfront      = downAmount + closingCosts + taxEscrow + insuranceEscrow + prepaidInsurance + maintenanceBuffer + movingCosts;

    const firstMonthInterest  = principal * (apr / 12);
    const firstMonthPrincipal = monthlyPI - firstMonthInterest;

    const verdictText    = result('verdict');
    const verdictSubText = result('verdictSubtitle');

    // ════════════════════════════════════════════════════════════════════════
    // REPORT DATA
    // ════════════════════════════════════════════════════════════════════════
    const REPORT = {
        title:    'Home Affordability Report',
        filename: 'Home-Affordability-Report.pdf',
        logoPath: `${typeof API_BASE !== 'undefined' ? API_BASE : ''}/static/logo.png`,

        summary: [
            { label: 'Verdict',               value: verdictText,                                               accent: true  },
            { label: 'Monthly Mortgage (P&I)', value: fmtMoney(monthlyPI),                                      accent: false },
            { label: 'Total Monthly Housing',  value: fmtMoney(totalHousing),                                   accent: false },
            { label: 'Monthly Leftover',       value: fmtMoney(leftover),                                       accent: leftover >= 0 },
            { label: 'Total Cash Up Front',    value: fmtMoney(totalUpfront),                                   accent: false },
            { label: 'Loan Amount',            value: fmtMoney(principal) + '  ·  ' + loanTerm + '-yr @ ' + interestRate + '%', accent: false },
        ],

        verdictText,
        verdictSubText,

        // Loan & property inputs for the details table
        loanDetails: [
            { label: 'Home Price',           value: fmtMoney(homePrice) },
            { label: 'Down Payment',         value: fmtMoney(downAmount) + ' (' + downPct.toFixed(1) + '%)' },
            { label: 'Loan Amount',          value: fmtMoney(principal) },
            { label: 'Loan Term',            value: loanTerm + ' years' },
            { label: 'Interest Rate (APR)',  value: interestRate.toFixed(2) + '%' },
            { label: 'Closing Costs',        value: fmtMoney(closingCosts) + ' (' + closingPctVal.toFixed(1) + '%)' },
        ],

        // Monthly cost rows for the housing table
        housingCosts: [
            { label: 'Mortgage P&I',      value: monthlyPI },
            { label: 'Property Tax',      value: monthlyPropTax },
            { label: 'Home Insurance',    value: insuranceMonthly },
            { label: 'HOA Fees',          value: hoaMonthly },
            { label: 'Maintenance',       value: monthlyMaint },
            { label: 'Utilities',         value: utilitiesMonthly },
        ],
        totalHousing,

        // Monthly budget rows
        budgetRows: [
            { label: 'Take-Home Pay',       value: takeHome,       positive: true },
            { label: 'Total Housing',       value: -totalHousing,  positive: false },
            { label: 'Other Spending',      value: -otherSpending, positive: false },
            { label: 'Debt Payments',       value: -otherDebt,     positive: false },
            { label: 'Savings Target',      value: -savingsTarget, positive: false },
        ],
        leftover,

        // Upfront cost rows
        upfrontCosts: [
            { label: 'Down Payment',                   value: downAmount },
            { label: 'Closing Costs',                  value: closingCosts },
            { label: 'Property Tax Escrow (3 mo)',      value: taxEscrow },
            { label: 'Insurance Escrow (3 mo)',         value: insuranceEscrow },
            { label: 'Prepaid Insurance (1 yr)',        value: prepaidInsurance },
            { label: 'Maintenance Buffer',              value: maintenanceBuffer },
            { label: 'Moving Costs',                   value: movingCosts },
        ],
        totalUpfront,
    };

    // ════════════════════════════════════════════════════════════════════════
    // ENGINE  ←  Identical rendering approach to debt-payoff PDF
    // ════════════════════════════════════════════════════════════════════════

    const PW = 612, PH = 792, ML = 48, MR = 48, CW = PW - ML - MR;
    const ACCENT  = [37, 99, 235];
    const INK     = [22, 22, 22];
    const MUTED   = [110, 110, 110];
    const RULE    = [220, 220, 220];
    const STRIPE  = [248, 249, 251];
    let y = 0;

    const doc = new jsPDF({ unit: 'pt', format: 'letter' });

    function sc(rgb, t = 'text') {
        if (t === 'text') doc.setTextColor(...rgb);
        else if (t === 'fill') doc.setFillColor(...rgb);
        else if (t === 'draw') doc.setDrawColor(...rgb);
    }
    function t(str, x, yy, opts = {}) { doc.text(String(str), x, yy, opts); }

    function hRule(x = ML, w = CW, weight = 0.5, color = RULE) {
        sc(color, 'draw'); doc.setLineWidth(weight);
        doc.line(x, y, x + w, y); y += 10;
    }

    function sectionHeading(title) {
        doc.setFontSize(8); doc.setFont(undefined, 'bold');
        sc(ACCENT, 'text');
        t(title.toUpperCase(), ML, y);
        sc(ACCENT, 'draw'); doc.setLineWidth(1.5);
        doc.line(ML, y + 3, ML + CW, y + 3);
        sc(INK, 'text');
        y += 14;
    }

    // ── Logo loader ───────────────────────────────────────────────────────────
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
    // SUMMARY STRIP
    // ════════════════════════════════════════════════════════
    const validSummary = REPORT.summary.filter(s => s.value && s.value !== '--' && s.value.trim() !== '');
    if (validSummary.length > 0) {
        const cols = 2;
        const colW = CW / cols;
        const rowH = 22;
        const startY = y;

        validSummary.forEach((item, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const cx  = ML + col * colW;
            const cy  = startY + row * rowH;

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
    // VERDICT BOX
    // ════════════════════════════════════════════════════════
    if (REPORT.verdictText) {
        sectionHeading('Affordability Verdict');

        const allText   = REPORT.verdictSubText
            ? REPORT.verdictText + REPORT.verdictSubText
            : REPORT.verdictText;
        const textMaxW  = CW - 50;
        const lines     = doc.splitTextToSize(allText, textMaxW);
        const boxH      = lines.length * 13 + 14;

        sc(STRIPE, 'fill');
        doc.roundedRect(ML, y, CW, boxH, 3, 3, 'F');

        sc(ACCENT, 'draw'); doc.setLineWidth(2);
        doc.line(ML, y, ML, y + boxH);

        sc(INK, 'text'); doc.setFontSize(9.5); doc.setFont(undefined, 'normal');
        lines.forEach((line, i) => { t(line, ML + 10, y + 10 + i * 13); });

        y += boxH + 14;
    }

    // ════════════════════════════════════════════════════════
    // LOAN DETAILS TABLE
    // ════════════════════════════════════════════════════════
    sectionHeading('Loan & Property Details');

    const C_LABEL = ML;
    const C_VALUE = ML + CW;
    const ROW_H   = 14;

    REPORT.loanDetails.forEach((row, i) => {
        if (i % 2 === 1) {
            sc(STRIPE, 'fill');
            doc.rect(ML, y, CW, ROW_H, 'F');
        }
        doc.setFontSize(8.5); doc.setFont(undefined, 'normal'); sc(MUTED, 'text');
        t(row.label, C_LABEL, y + 10);
        doc.setFont(undefined, 'bold'); sc(INK, 'text');
        t(row.value, C_VALUE, y + 10, { align: 'right' });
        y += ROW_H;
    });
    hRule(ML, CW, 0.5, RULE);
    y += 10;

    // ════════════════════════════════════════════════════════
    // TWO-COLUMN SECTION: Monthly Housing  |  Monthly Budget
    // ════════════════════════════════════════════════════════
    const colGap  = 24;
    const halfW   = (CW - colGap) / 2;
    const colR    = ML + halfW + colGap;   // x start of right column

    // ── Left: Monthly Housing Costs ───────────────────────────────────────────
    const housingStartY = y;
    doc.setFontSize(8); doc.setFont(undefined, 'bold'); sc(ACCENT, 'text');
    t('MONTHLY HOUSING COSTS', ML, y);
    sc(ACCENT, 'draw'); doc.setLineWidth(1);
    doc.line(ML, y + 3, ML + halfW, y + 3);
    y += 14;

    REPORT.housingCosts.forEach((row, i) => {
        if (i % 2 === 1) { sc(STRIPE, 'fill'); doc.rect(ML, y, halfW, ROW_H, 'F'); }
        doc.setFontSize(8); doc.setFont(undefined, 'normal'); sc(MUTED, 'text');
        t(row.label, ML + 4, y + 10);
        doc.setFont(undefined, 'bold'); sc(INK, 'text');
        t(fmtMoney(row.value), ML + halfW, y + 10, { align: 'right' });
        y += ROW_H;
    });
    // Total row
    sc(STRIPE, 'fill'); doc.rect(ML, y, halfW, ROW_H + 2, 'F');
    doc.setFontSize(8.5); doc.setFont(undefined, 'bold'); sc(ACCENT, 'text');
    t('Total / month', ML + 4, y + 11);
    t(fmtMoney(REPORT.totalHousing), ML + halfW, y + 11, { align: 'right' });
    const housingEndY = y + ROW_H + 2;

    // ── Right: Monthly Budget ─────────────────────────────────────────────────
    y = housingStartY;
    doc.setFontSize(8); doc.setFont(undefined, 'bold'); sc(ACCENT, 'text');
    t('MONTHLY BUDGET', colR, y);
    sc(ACCENT, 'draw'); doc.setLineWidth(1);
    doc.line(colR, y + 3, colR + halfW, y + 3);
    y += 14;

    REPORT.budgetRows.forEach((row, i) => {
        if (i % 2 === 1) { sc(STRIPE, 'fill'); doc.rect(colR, y, halfW, ROW_H, 'F'); }
        doc.setFontSize(8); doc.setFont(undefined, 'normal'); sc(MUTED, 'text');
        t(row.label, colR + 4, y + 10);
        doc.setFont(undefined, 'bold');
        sc(row.positive ? INK : MUTED, 'text');
        const sign = row.value < 0 ? '-' : '';
        t(sign + fmtMoney(Math.abs(row.value)), colR + halfW, y + 10, { align: 'right' });
        y += ROW_H;
    });
    // Leftover row
    const leftoverColor = REPORT.leftover >= 0 ? ACCENT : [239, 68, 68];
    sc(STRIPE, 'fill'); doc.rect(colR, y, halfW, ROW_H + 2, 'F');
    doc.setFontSize(8.5); doc.setFont(undefined, 'bold'); sc(leftoverColor, 'text');
    t('Leftover / month', colR + 4, y + 11);
    t(fmtMoney(REPORT.leftover), colR + halfW, y + 11, { align: 'right' });

    y = Math.max(housingEndY, y + ROW_H + 2) + 14;

    // ════════════════════════════════════════════════════════
    // UPFRONT COSTS TABLE
    // ════════════════════════════════════════════════════════
    sectionHeading('Total Cash Needed Up Front');

    REPORT.upfrontCosts.forEach((row, i) => {
        if (i % 2 === 1) { sc(STRIPE, 'fill'); doc.rect(ML, y, CW, ROW_H, 'F'); }
        doc.setFontSize(8.5); doc.setFont(undefined, 'normal'); sc(MUTED, 'text');
        t(row.label, C_LABEL, y + 10);
        doc.setFont(undefined, 'bold'); sc(INK, 'text');
        t(fmtMoney(row.value), C_VALUE, y + 10, { align: 'right' });
        y += ROW_H;
    });
    // Total row
    sc(STRIPE, 'fill'); doc.rect(ML, y, CW, ROW_H + 2, 'F');
    doc.setFontSize(9); doc.setFont(undefined, 'bold'); sc(ACCENT, 'text');
    t('Total Up Front', C_LABEL, y + 11);
    t(fmtMoney(REPORT.totalUpfront), C_VALUE, y + 11, { align: 'right' });
    y += ROW_H + 16;

    // ════════════════════════════════════════════════════════
    // FOOTNOTE
    // ════════════════════════════════════════════════════════
    sc(MUTED, 'text'); doc.setFontSize(6.5); doc.setFont(undefined, 'italic');
    const noteText = 'Moving costs estimated at $2,000. Tax & insurance escrows estimated at 3 months. Monthly costs do not include closing costs.';
    const noteLines = doc.splitTextToSize(noteText, CW);
    noteLines.forEach(line => { t(line, ML, y); y += 9; });

    // ════════════════════════════════════════════════════════
    // FOOTER
    // ════════════════════════════════════════════════════════
    sc(RULE, 'draw'); doc.setLineWidth(0.5);
    doc.line(ML, PH - 32, PW - MR, PH - 32);
    sc(MUTED, 'text'); doc.setFontSize(7); doc.setFont(undefined, 'normal');
    t('MoneyByMath  ·  For informational purposes only. Not financial advice.', ML, PH - 20);
    t(new Date().getFullYear().toString(), PW - MR, PH - 20, { align: 'right' });

    doc.save(REPORT.filename);
    btn.innerHTML = '✓ Saved!';
    btn.disabled = false;
    setTimeout(() => (btn.innerHTML = originalText), 2000);
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
        const v = (document.getElementById(id).value || '').trim().replace(/,/g, '');
        return v !== '' && !isNaN(parseFloat(v));
    });

    if (hasData) {
        calculateAffordability();
    } else {
        setResultsEmpty();
        const verdictEl = document.getElementById('verdict');
        const verdictFloatLabel = document.getElementById('verdictFloatLabel');
        if (verdictEl) {
            verdictEl.textContent = 'Fill in fields to calculate';
            verdictEl.style.color = '#6B7280';
            verdictFloatLabel.style.display = 'none'
        }
        syncFloat();
    }

    initVerdictFloat();
    loadMortgageRate();
});