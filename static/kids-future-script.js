/* Fund My Kid's Future calculator
   Compares 529 vs. Taxable Brokerage under two scenarios:
     Path A - College-bound (education use)
     Path B - Non-college (non-qualified use)
   Follows same patterns as rent-vs-buy / afford-house scripts.
*/

let kidsChart = null;
const STATE_IDS = ['childAge','targetAge','initialContrib','monthlyContrib',
             'kidsReturn','kidsTaxBracket','capitalGainsRate'];

const REQUIRED_FIELDS = {
    childAge:        'Child Age',
    targetAge:       'Target Age',
    initialContrib:  'Initial Contribution',
    monthlyContrib:  'Monthly Contribution',
    kidsReturn:      'Expected Return',
    kidsTaxBracket:  'Tax Bracket',
    capitalGainsRate:'Capital Gains Rate'
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
    saveToStorage();
    calculateKidsFuture();
}

// ─── Validation helper ────────────────────────────────────────────────────────

function setResultsEmpty() {
    ['totalContribs','balance529','pathA529','pathABrokerage',
     'pathB529','pathBBrokerage']
        .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '--'; });
    if (kidsChart) { kidsChart.destroy(); kidsChart = null; }
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

function calcFutureValue(initial, monthly, annualRatePct, months) {
    // FV = initial × (1+r)^n + monthly × [(1+r)^n − 1] / r
    const r = annualRatePct / 100 / 12;
    if (r === 0) return initial + monthly * months;
    const growth = Math.pow(1 + r, months);
    return initial * growth + monthly * (growth - 1) / r;
}

// ─── Main calculation ─────────────────────────────────────────────────────────

function calculateKidsFuture() {
    const missing = [];
    for (const [id, label] of Object.entries(REQUIRED_FIELDS)) {
        const raw = (document.getElementById(id).value || '').trim().replace(/,/g, '');
        if (raw === '' || isNaN(parseFloat(raw))) missing.push(label);
    }

    const verdictEl  = document.getElementById('kidsVerdict');
    const subtitleEl = document.getElementById('kidsVerdictSubtitle');

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
    const childAge     = parseInt(document.getElementById('childAge').value);
    const targetAge    = parseInt(document.getElementById('targetAge').value);
    const initial      = parseFormattedNumber(document.getElementById('initialContrib').value);
    const monthly      = parseFormattedNumber(document.getElementById('monthlyContrib').value);
    const returnPct    = parseFloat(document.getElementById('kidsReturn').value);
    const taxRate      = parseFloat(document.getElementById('kidsTaxBracket').value) / 100;
    const cgRate       = parseFloat(document.getElementById('capitalGainsRate').value) / 100;

    const verdictCard = verdictEl.parentElement;

    // ── Guard: target age must be greater than child age ─────────────────────
    if (targetAge <= childAge) {
        setResultsEmpty();
        verdictEl.textContent  = 'Target age must be greater than child\'s current age.';
        verdictEl.style.color  = '#EF4444';
        subtitleEl.textContent = '';
        if (verdictCard) verdictCard.style.borderLeft = '4px solid #EF4444';
        return;
    }

    // ── Guard: must have some contribution ────────────────────────────────────
    if (initial === 0 && monthly === 0) {
        setResultsEmpty();
        verdictEl.textContent  = 'Enter an initial or monthly contribution to continue.';
        verdictEl.style.color  = '#EF4444';
        subtitleEl.textContent = '';
        if (verdictCard) verdictCard.style.borderLeft = '4px solid #EF4444';
        return;
    }

    const years  = targetAge - childAge;
    const months = years * 12;

    // ── Total contributions ───────────────────────────────────────────────────
    const totalContribs = initial + monthly * months;

    // ── 529 Plan: full tax-free compound growth ───────────────────────────────
    const balance529   = calcFutureValue(initial, monthly, returnPct, months);
    const earnings529  = Math.max(0, balance529 - totalContribs);

    // Path A - Education: 100% tax-free
    const pathA529Net  = balance529;

    // Path B - Non-qualified: earnings × (income tax + 10% penalty)
    const penalty529   = earnings529 * (taxRate + 0.10);
    const pathB529Net  = balance529 - penalty529;

    // ── Taxable Brokerage: annual tax drag on dividend yield ─────────────────
    // Dividend yield assumption: 1.5% of portfolio value, taxed at income rate each year
    // Tax drag reduces the effective annual return
    const annualDividendYield = 0.015;
    const annualDrag          = annualDividendYield * taxRate;
    const effectiveReturn     = Math.max(0, returnPct / 100 - annualDrag) * 100;

    const balanceBrokerage    = calcFutureValue(initial, monthly, effectiveReturn, months);
    const profitsBrokerage    = Math.max(0, balanceBrokerage - totalContribs);

    // Capital gains tax on profits at sale (same net amount for Path A & Path B)
    const cgTax                  = profitsBrokerage * cgRate;
    const brokerageNetSpendable  = balanceBrokerage - cgTax;

    // ── UI output ─────────────────────────────────────────────────────────────
    const fmt = v => '$' + Math.round(v).toLocaleString('en-US');

    document.getElementById('totalContribs').textContent = fmt(totalContribs);
    document.getElementById('balance529').textContent    = fmt(balance529);
    document.getElementById('balance529Subtitle').textContent =
        `${returnPct}% annual return over ${years} year${years !== 1 ? 's' : ''}`;

    document.getElementById('pathA529').textContent      = fmt(pathA529Net);
    document.getElementById('pathABrokerage').textContent = fmt(brokerageNetSpendable);
    document.getElementById('pathABrokerageSubtitle').textContent =
        `After ${(cgRate * 100).toFixed(0)}% capital gains tax on $${Math.round(profitsBrokerage).toLocaleString()} profit`;

    document.getElementById('pathB529').textContent      = fmt(pathB529Net);
    document.getElementById('pathB529Subtitle').textContent =
        `Penalty on $${Math.round(earnings529).toLocaleString()} earnings: ${fmt(penalty529)} (${(taxRate * 100).toFixed(0)}% tax + 10%)`;
    document.getElementById('pathBBrokerage').textContent = fmt(brokerageNetSpendable);
    document.getElementById('pathBBrokerageSubtitle').textContent =
        `Effective return ${effectiveReturn.toFixed(2)}% after tax drag, then ${(cgRate * 100).toFixed(0)}% cap gains`;

    // ── Verdict ───────────────────────────────────────────────────────────────
    const collegeAdvantage    = pathA529Net - brokerageNetSpendable;
    const nonCollegeAdvantage = brokerageNetSpendable - pathB529Net;

    verdictEl.style.color = '';
    verdictEl.textContent = '529 for college, Brokerage for everything else';
    verdictCard.style.borderLeft = '4px solid #10B981';

    subtitleEl.textContent =
        `College path: 529 beats brokerage by ${fmt(Math.max(0, collegeAdvantage))}. ` +
        `Non-college path: brokerage beats penalized 529 by ${fmt(Math.max(0, nonCollegeAdvantage))}.`;

    // ── Chart ─────────────────────────────────────────────────────────────────
    renderKidsChart(
        [Math.round(pathA529Net),  Math.round(brokerageNetSpendable)],
        [Math.round(pathB529Net),  Math.round(brokerageNetSpendable)],
        totalContribs
    );
}

// ─── Chart ────────────────────────────────────────────────────────────────────

function renderKidsChart(pathAData, pathBData, contributions) {
    const canvas = document.getElementById('kidsChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (kidsChart) kidsChart.destroy();

    kidsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Path A: College\n(529)', 'Path A: College\n(Brokerage)', 'Path B: Non-College\n(529 penalized)', 'Path B: Non-College\n(Brokerage)'],
            datasets: [
                {
                    label: 'Contributions',
                    data: [contributions, contributions, contributions, contributions],
                    backgroundColor: '#6B7280',
                    borderRadius: 4
                },
                {
                    label: 'Net Growth (after taxes)',
                    data: [
                        Math.max(0, pathAData[0] - contributions),
                        Math.max(0, pathAData[1] - contributions),
                        Math.max(0, pathBData[0] - contributions),
                        Math.max(0, pathBData[1] - contributions)
                    ],
                    backgroundColor: ['#10B981', '#3B82F6', '#EF4444', '#10B981'],
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2,
            scales: {
                x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } },
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
    localStorage.setItem('kidsFutureData', JSON.stringify(data));
}

function loadFromStorage() {
    const saved = localStorage.getItem('kidsFutureData');
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
    ['childAge','targetAge','initialContrib','monthlyContrib',
     'kidsReturn','kidsTaxBracket','capitalGainsRate']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

    localStorage.removeItem('kidsFutureData');
    setResultsEmpty();

    const verdictEl = document.getElementById('kidsVerdict');
    if (verdictEl) {
        verdictEl.textContent = 'Fill in fields to calculate';
        verdictEl.style.color = '#6B7280';
        const card = verdictEl.parentElement;
        if (card) card.style.borderLeft = '4px solid var(--primary)';
    }
    document.getElementById('kidsVerdictSubtitle').textContent = '';
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
                title: 'Kids Financial Future Calculator',
                text: 'Check out my kids financial future analysis!',
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
        calculateKidsFuture();
    } else {
        setResultsEmpty();
        const verdictEl = document.getElementById('kidsVerdict');
        if (verdictEl) { verdictEl.textContent = 'Fill in fields to calculate'; verdictEl.style.color = '#6B7280'; }
    }
});
