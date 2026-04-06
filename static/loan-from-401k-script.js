/* 401(k) Early Withdrawal vs. Loan calculator
   No toggle fields - all inputs are straightforward $ or %.
   Follows same patterns as rent-vs-buy / afford-house scripts.
*/

let retChart = null;

const REQUIRED_FIELDS = {
    currentAge:     'Current Age',
    retirementAge:  'Retirement Age',
    amountNeeded:   'Amount Needed',
    taxBracket:     'Tax Bracket',
    expectedReturn: 'Expected Return',
    loanRate:       'Loan Rate',
    loanTerm:       'Loan Term'
};

const STATE_IDS = ['currentAge','retirementAge','amountNeeded','taxBracket','expectedReturn','loanRate','loanTerm'];


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
    saveToStorage();
    calculateRetirement();
}

// ─── Validation helper ────────────────────────────────────────────────────────

function setResultsEmpty() {
    ['grossWithdrawal','taxesPenalties','futureWealthLost','loanMonthly','loanInterestTotal','loanOpportunityCost']
        .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '--'; });
    ['taxesPenaltiesSubtitle','futureWealthLostSubtitle','loanOpportunityCostSubtitle']
        .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = el.getAttribute('data-default') || ''; });
    if (retChart) { retChart.destroy(); retChart = null; }
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

function calcMonthlyPayment(principal, annualRatePct, months) {
    if (principal <= 0 || months <= 0) return 0;
    const r = annualRatePct / 100 / 12;
    if (r === 0) return principal / months;
    return principal * (r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}

function calcFVAnnuity(pmt, annualRatePct, months) {
    const r = annualRatePct / 100 / 12;
    if (r === 0) return pmt * months;
    return pmt * (Math.pow(1 + r, months) - 1) / r;
}

// ─── Main calculation ─────────────────────────────────────────────────────────

function calculateRetirement() {
    const missing = [];
    for (const [id, label] of Object.entries(REQUIRED_FIELDS)) {
        const raw = (document.getElementById(id).value || '').trim().replace(/,/g, '');
        if (raw === '' || isNaN(parseFloat(raw))) missing.push(label);
    }

    const verdictEl  = document.getElementById('retVerdict');
    const subtitleEl = document.getElementById('retVerdictSubtitle');

    if (missing.length > 0) {
        setResultsEmpty();
        verdictEl.textContent = missing.length === Object.keys(REQUIRED_FIELDS).length
            ? 'Fill in fields to calculate'
            : 'Missing: ' + missing.join(', ');
        verdictEl.style.color = '#6B7280';
        subtitleEl.textContent = '';
        const card = verdictEl.parentElement;
        if (card) card.style.borderLeft = '4px solid var(--primary)';
        return;
    }

    // ── Parse inputs ──────────────────────────────────────────────────────────
    const currentAge    = parseInt(document.getElementById('currentAge').value);
    const retirementAge = parseInt(document.getElementById('retirementAge').value);
    const amountNeeded  = parseFormattedNumber(document.getElementById('amountNeeded').value);
    const taxRate       = parseFloat(document.getElementById('taxBracket').value) / 100;
    const expReturn     = parseFloat(document.getElementById('expectedReturn').value);
    const loanRatePct   = parseFloat(document.getElementById('loanRate').value);
    const loanTermYears = parseInt(document.getElementById('loanTerm').value);

    const verdictCard = verdictEl.parentElement;

    // ── Guard: retirement age must be greater than current age ────────────────
    if (retirementAge <= currentAge) {
        setResultsEmpty();
        verdictEl.textContent  = 'Retirement age must be greater than current age.';
        verdictEl.style.color  = '#EF4444';
        subtitleEl.textContent = '';
        if (verdictCard) verdictCard.style.borderLeft = '4px solid #EF4444';
        return;
    }

    // ── Guard: loan term must be less than years to retirement ────────────────
    const yearsToRetirement = retirementAge - currentAge;
    if (loanTermYears >= yearsToRetirement) {
        setResultsEmpty();
        verdictEl.textContent  = 'Loan term must be shorter than years to retirement.';
        verdictEl.style.color  = '#EF4444';
        subtitleEl.textContent = '';
        if (verdictCard) verdictCard.style.borderLeft = '4px solid #EF4444';
        return;
    }

    // ── Guard: tax rate + penalty cannot be >= 100% ────────────────────────
    const totalTakeRate = taxRate + 0.10;
    if (totalTakeRate >= 1) {
        setResultsEmpty();
        verdictEl.textContent  = 'Tax bracket too high - combined rate would exceed 100%.';
        verdictEl.style.color  = '#EF4444';
        subtitleEl.textContent = '';
        if (verdictCard) verdictCard.style.borderLeft = '4px solid #EF4444';
        return;
    }

    const retMonths     = yearsToRetirement * 12;
    // ── Withdrawal scenario ───────────────────────────────────────────────────
    // Gross withdrawal needed to net amountNeeded after income tax + 10% penalty
    const grossWithdrawal = amountNeeded / (1 - totalTakeRate);
    const taxesPenalties  = grossWithdrawal - amountNeeded;

    // Future wealth lost: gross amount compounded to retirement
    const r_annual           = expReturn / 100;
    const futureWealthLost = grossWithdrawal * Math.pow(1 + r_annual / 12, retMonths);

    // ── Loan scenario ─────────────────────────────────────────────────────────
    const loanMonths    = loanTermYears * 12;
    const r_monthly     = expReturn / 100 / 12;

    const loanPayment   = calcMonthlyPayment(amountNeeded, loanRatePct, loanMonths);
    const totalRepaid   = loanPayment * loanMonths;
    const loanInterest  = Math.max(0, totalRepaid - amountNeeded);

    // Opportunity cost of loan:
    // "Ideal" = loan amount growing untouched for all years to retirement
    // "Actual" = FV of each monthly repayment (compounded from payment date to retirement)
    // FV of annuity at end of repayment, then grows for remaining time
    const remainingMonths    = retMonths - loanMonths;
    const fvAtRepaymentEnd   = calcFVAnnuity(loanPayment, loanRatePct, loanMonths);
    const fvAtRetirement     = fvAtRepaymentEnd * Math.pow(1 + r_monthly, remainingMonths);
    const idealFV            = amountNeeded * Math.pow(1 + r_monthly, retMonths);
    const loanOpportunityCost = Math.max(0, idealFV - fvAtRetirement);

    // ── UI output ─────────────────────────────────────────────────────────────
    const fmt  = v => '$' + Math.round(v).toLocaleString('en-US');
    const fmtK = v => v >= 1000000
        ? '$' + (v / 1000000).toFixed(2) + 'M'
        : '$' + Math.round(v / 1000) + 'k';

    document.getElementById('grossWithdrawal').textContent   = fmt(grossWithdrawal);
    document.getElementById('taxesPenalties').textContent    = fmt(taxesPenalties);
    document.getElementById('taxesPenaltiesSubtitle').textContent =
        `${(taxRate * 100).toFixed(0)}% income tax + 10% early withdrawal penalty`;
    document.getElementById('futureWealthLost').textContent  = fmtK(futureWealthLost);
    document.getElementById('futureWealthLostSubtitle').textContent =
        `${fmt(grossWithdrawal)} would have grown to this number with ${expReturn}% annual return over ${yearsToRetirement} years`;
    document.getElementById('loanMonthly').textContent       = fmt(loanPayment);
    document.getElementById('loanInterestTotal').textContent = fmt(loanInterest);
    document.getElementById('loanOpportunityCost').textContent = `${fmtK(loanOpportunityCost)}`;
    document.getElementById('loanOpportunityCostSubtitle').innerHTML = `
    <ul style="list-style-type: disc; margin-left: 1.5rem; margin-top: 0.5rem;">
        <li>Loan amount of ${fmt(amountNeeded)} would be worth ${fmt(idealFV)} at retirement if never taken as a loan.</li>
        <li>Loan amount of ${fmt(amountNeeded)} is worth ${fmt(fvAtRepaymentEnd)} after ${loanTermYears}-year repayment at ${loanRatePct}% interest. It then will grow to ${fmt(fvAtRetirement)} at retirement.</li>
        <li>Growth until retirement factors in a ${expReturn}% annual return. Borrowed amount is not invested during repayment.</li>
    </ul>`;

    // ── Verdict ───────────────────────────────────────────────────────────────
    verdictEl.style.color = '';
    const withdrawalCost  = futureWealthLost;
    const loanCost        = loanOpportunityCost;
    const diff            = withdrawalCost - loanCost;

    if (diff > 0) {
        verdictEl.textContent  = 'Take a 401(k) Loan - Withdrawal is Worse';
        subtitleEl.textContent = `Early withdrawal costs you ${fmtK(diff)} more in retirement wealth than the loan.`;
        verdictCard.style.borderLeft = '4px solid #10B981';
    } else {
        verdictEl.textContent  = 'Withdrawal Costs Less Than Expected';
        subtitleEl.textContent = `In this scenario the loan opportunity cost (${fmtK(loanCost)}) exceeds the withdrawal cost. Review your assumptions.`;
        verdictCard.style.borderLeft = '4px solid #F59E0B';
    }

    // ── Chart ─────────────────────────────────────────────────────────────────
    renderRetChart(
        Math.round(taxesPenalties),
        Math.round(futureWealthLost),
        Math.round(loanInterest),
        Math.round(loanOpportunityCost)
    );
}

// ─── Chart ────────────────────────────────────────────────────────────────────

function renderRetChart(taxPenalty, wealthLost, loanInterest, loanOppCost) {
    const canvas = document.getElementById('retChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (retChart) retChart.destroy();

    const isMobile = window.innerWidth < 600;

    retChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Early Withdrawal', '401(k) Loan'],
            datasets: [
                {
                    label: 'Immediate Taxes & Penalty / Interest Paid',
                    data: [taxPenalty, loanInterest],
                    backgroundColor: '#EF4444',
                    borderRadius: 4
                },
                {
                    label: 'Retirement Wealth Lost',
                    data: [wealthLost, loanOppCost],
                    backgroundColor: '#F59E0B',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: isMobile ? 0.5 : 2,
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
    const data = {};
    STATE_IDS.forEach(id => { const el = document.getElementById(id); if (el) data[id] = el.value; });
    localStorage.setItem('retirement401kData', JSON.stringify(data));
}

function loadFromStorage() {
    const saved = localStorage.getItem('retirement401kData');
    if (!saved) return;
    try {
        const data = JSON.parse(saved);
        Object.keys(data).forEach(key => {
            const el = document.getElementById(key);
            if (el) el.value = data[key];
        });
    } catch (e) {}
}

// ─── Reset ────────────────────────────────────────────────────────────────────

function clearAll() {
    ['currentAge','retirementAge','amountNeeded','taxBracket','expectedReturn','loanRate','loanTerm']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

    localStorage.removeItem('retirement401kData');
    setResultsEmpty();

    const verdictEl = document.getElementById('retVerdict');
    if (verdictEl) {
        verdictEl.textContent = 'Fill in fields to calculate';
        verdictEl.style.color = '#6B7280';
        const card = verdictEl.parentElement;
        if (card) card.style.borderLeft = '4px solid var(--primary)';
    }
    document.getElementById('retVerdictSubtitle').textContent = '';
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
                title: '401(k) Loan Calculator',
                text: 'Check out 401(k) loan analysis!',
                url: shareUrl,
            });
        } catch (err) {
            // User dismissed the share sheet — not an error worth logging
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
        calculateRetirement();
    } else {
        setResultsEmpty();
        const verdictEl = document.getElementById('retVerdict');
        if (verdictEl) { verdictEl.textContent = 'Fill in fields to calculate'; verdictEl.style.color = '#6B7280'; }
    }
});
