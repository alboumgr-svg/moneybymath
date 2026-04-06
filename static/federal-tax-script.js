/* Federal Income Tax Calculator
   - 2026 IRS brackets, all three filing statuses
   - Standard deduction applied automatically
   - Visual bracket waterfall with animated fill bars
   - localStorage persistence
*/

const API_BASE = window.location.origin; 

// ─── 2026 Tax Data ────────────────────────────────────────────────────────────

let STANDARD_DEDUCTIONS = {};
let BRACKETS = {};

async function initTaxData() {
    try {
        const response = await fetch(`${API_BASE}/static/taxData.json`);
        const data = await response.json();
        
        // Assign to our global variables
        STANDARD_DEDUCTIONS = data.STANDARD_DEDUCTIONS;
        BRACKETS = data.BRACKETS;

        console.log("2026 Tax Data Loaded Successfully");
        
        // FIX: Call calculateTax instead of calculateAffordability
        if (typeof calculateTax === "function") {
            calculateTax();
        }
    } catch (err) {
        console.error("Error loading tax data:", err);
    }
}

// Heat-map: green → yellow → orange → red
const BRACKET_COLORS = [
    '#16a34a',  // 10% - green
    '#65a30d',  // 12% - lime
    '#ca8a04',  // 22% - amber
    '#ea580c',  // 24% - orange
    '#dc2626',  // 32% - red
    '#b91c1c',  // 35% - darker red
    '#7f1d1d'   // 37% - deep red
];

// ─── State ────────────────────────────────────────────────────────────────────

let filingStatus = 'single';

// ─── Input helpers ────────────────────────────────────────────────────────────

function formatCurrencyInput(input) {
    const raw       = input.value;
    const cursorPos = input.selectionStart;
    const sigBefore = raw.slice(0, cursorPos).replace(/[^0-9.]/g, '').length;

    let clean = raw.replace(/[^0-9.]/g, '');
    const dot = clean.indexOf('.');
    if (dot !== -1) clean = clean.slice(0, dot + 1) + clean.slice(dot + 1).replace(/\./g, '');

    const parts = clean.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const formatted = parts.length > 1 ? parts[0] + '.' + parts[1] : parts[0];
    input.value = formatted;

    let sigCount = 0, newCursor = formatted.length;
    for (let i = 0; i < formatted.length; i++) {
        if (/[0-9.]/.test(formatted[i])) sigCount++;
        if (sigCount === sigBefore) { newCursor = i + 1; break; }
    }
    if (sigBefore === 0) newCursor = 0;
    try { input.setSelectionRange(newCursor, newCursor); } catch (e) {}
}

function parseFormattedNumber(value) {
    if (typeof value === 'string') return parseFloat(value.replace(/,/g, '')) || 0;
    return parseFloat(value) || 0;
}

function handleTaxInput(input) {
    formatCurrencyInput(input);
    saveToStorage();
    calculateTax();
}

function setFiling(status) {
    filingStatus = status;
    document.querySelectorAll('.filing-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-' + status)?.classList.add('active');
    calculateTax();
}

// ─── Tax math ─────────────────────────────────────────────────────────────────

function computeTax(taxableIncome, status) {
    const brackets = BRACKETS[status];
    let totalTax = 0;
    const breakdown = [];

    for (let i = 0; i < brackets.length; i++) {
        const [lo, hi, rate] = brackets[i];
        if (taxableIncome <= lo) {
            // Income doesn't reach this bracket
            breakdown.push({ lo, hi, rate, incomeInBracket: 0, taxInBracket: 0, fillPct: 0 });
            continue;
        }
        const cap          = hi !== null ? Math.min(taxableIncome, hi) : taxableIncome;
        const bracketWidth = hi !== null ? hi - lo : taxableIncome - lo;
        const incomeIn     = cap - lo;
        const taxIn        = incomeIn * rate;
        const fillPct      = bracketWidth > 0 ? Math.min(100, (incomeIn / bracketWidth) * 100) : 100;

        totalTax += taxIn;
        breakdown.push({ lo, hi, rate, incomeInBracket: incomeIn, taxInBracket: taxIn, fillPct });
    }

    return { totalTax, breakdown };
}

// ─── Main calculation ─────────────────────────────────────────────────────────

function calculateTax() {
    const grossIncome = parseFormattedNumber(document.getElementById('grossIncome').value);

    if (!grossIncome || grossIncome <= 0) {
        clearDisplays();
        return;
    }

    const stdDeduction   = STANDARD_DEDUCTIONS[filingStatus];
    const taxableIncome  = Math.max(0, grossIncome - stdDeduction);
    const { totalTax, breakdown } = computeTax(taxableIncome, filingStatus);

    const effectiveRate  = grossIncome > 0 ? (totalTax / grossIncome) * 100 : 0;
    const takeHome       = grossIncome - totalTax;
    const monthlyTH      = takeHome / 12;

    // Find marginal rate (top bracket hit)
    let marginalRate = 0;
    for (const b of breakdown) {
        if (b.incomeInBracket > 0) marginalRate = b.rate;
    }

    const fmt  = v => '$' + Math.round(v).toLocaleString('en-US');
    const fmtK = v => v >= 1_000_000
        ? '$' + (v / 1_000_000).toFixed(2) + 'M'
        : '$' + Math.round(v).toLocaleString('en-US');

    // Summary results
    document.getElementById('totalTax').textContent        = fmtK(totalTax);
    document.getElementById('effectiveRateLabel').textContent =
        `${effectiveRate.toFixed(2)}% effective rate`;
    document.getElementById('grossDisplay').textContent    = fmtK(grossIncome);
    document.getElementById('taxableDisplay').textContent  = fmtK(taxableIncome);
    document.getElementById('deductionLabel').textContent  =
        `After $${stdDeduction.toLocaleString()} standard deduction`;
    document.getElementById('marginalRate').textContent    = (marginalRate * 100).toFixed(0) + '%';
    document.getElementById('monthlyTakeHome').textContent = fmt(monthlyTH);

    // Take-home vs tax split bar
    const taxPct  = grossIncome > 0 ? (totalTax / grossIncome) * 100 : 0;
    const homePct = 100 - taxPct;
    document.getElementById('barTakeHome').style.width = homePct.toFixed(2) + '%';
    document.getElementById('barTax').style.width      = taxPct.toFixed(2) + '%';
    document.getElementById('takeHomeLabel').textContent =
        `Take-Home ${fmt(takeHome)} (${homePct.toFixed(1)}%)`;
    document.getElementById('taxLabel').textContent =
        `Tax ${fmtK(totalTax)} (${taxPct.toFixed(1)}%)`;

    // Bracket waterfall
    renderWaterfall(breakdown, taxableIncome, fmt);
}

// ─── Waterfall renderer ───────────────────────────────────────────────────────

function renderWaterfall(breakdown, taxableIncome, fmt) {
    const container = document.getElementById('bracketWaterfall');
    container.innerHTML = '';

    breakdown.forEach((b, i) => {
        const color   = BRACKET_COLORS[i];
        const ratePct = (b.rate * 100).toFixed(0) + '%';
        const isActive = b.incomeInBracket > 0;
        const loFmt   = '$' + b.lo.toLocaleString('en-US');
        const hiFmt   = b.hi !== null ? '$' + b.hi.toLocaleString('en-US') : 'and above';

        const incomeText = isActive
            ? `${fmt(b.incomeInBracket)} taxed here`
            : 'Not reached';

        const row = document.createElement('div');
        row.className = 'bracket-row ' + (isActive ? 'active' : 'inactive');
        row.style.setProperty('--bracket-color', color);

        row.innerHTML = `
            <div class="bracket-header">
                <div class="rate-badge">${ratePct}</div>
                <div class="bracket-meta">
                    <div class="bracket-range">${loFmt} – ${hiFmt}</div>
                    <div class="bracket-income-in">${incomeText}</div>
                </div>
                <div class="bracket-tax-owed">
                    <div class="bracket-tax-label">Tax from bracket</div>
                    <div class="bracket-tax-value">${isActive ? fmt(b.taxInBracket) : '--'}</div>
                </div>
            </div>
            <div class="bracket-fill-track">
                <div class="bracket-fill-bar" data-fill="${b.fillPct.toFixed(2)}" style="width:0%"></div>
            </div>
        `;

        container.appendChild(row);
    });

    // Animate fill bars after a brief paint delay
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            container.querySelectorAll('.bracket-fill-bar').forEach(bar => {
                bar.style.width = bar.dataset.fill + '%';
            });
        });
    });
}

// ─── Clear ────────────────────────────────────────────────────────────────────

function clearDisplays() {
    ['totalTax','grossDisplay','taxableDisplay','marginalRate','monthlyTakeHome']
        .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '--'; });
    document.getElementById('effectiveRateLabel').textContent = 'Effective rate';
    document.getElementById('deductionLabel').textContent     = 'After standard deduction';
    document.getElementById('barTakeHome').style.width = '100%';
    document.getElementById('barTax').style.width      = '0%';
    document.getElementById('takeHomeLabel').textContent = 'Take-Home';
    document.getElementById('taxLabel').textContent     = 'Federal Tax';
    document.getElementById('bracketWaterfall').innerHTML = '';
}

function clearTax() {
    document.getElementById('grossIncome').value = '';
    filingStatus = 'single';
    document.querySelectorAll('.filing-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-single')?.classList.add('active');
    localStorage.removeItem('federalTaxData');
    clearDisplays();
}

// ─── Storage ──────────────────────────────────────────────────────────────────

function saveToStorage() {
    localStorage.setItem('federalTaxData', JSON.stringify({
        grossIncome:   document.getElementById('grossIncome').value,
        filingStatus
    }));
}

function loadFromStorage() {
    const saved = localStorage.getItem('federalTaxData');
    if (!saved) return;
    try {
        const data = JSON.parse(saved);
        if (data.grossIncome) document.getElementById('grossIncome').value = data.grossIncome;
        if (data.filingStatus) {
            filingStatus = data.filingStatus;
            document.querySelectorAll('.filing-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('btn-' + filingStatus)?.classList.add('active');
        }
    } catch (e) {}
}

// ── Sharing & Export ─────────────────────────────────────────────────────────
const STATE_IDS = ['grossIncome'];

async function copyShareLink() {
    const params = new URLSearchParams();
    
    STATE_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el && el.value) {
            params.set(id, el.value);
        }
    });

    params.set('filingStatus', filingStatus);

    const shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;

    const btn = document.getElementById('shareLinkBtn');
    if (!btn) return;

    btn.disabled = true;

    if (navigator.share) {
        try {
            await navigator.share({
                title: 'My Tax Breakdown',
                text: 'Check out my Federal tax breakdown!',
                url: shareUrl,
            });
        } catch (err) {
            if (err.name !== 'AbortError') console.error(err);
        }
        btn.disabled = false;
    } else {
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
}

function loadFromUrl() {
    const params = new URLSearchParams(window.location.search);
    let hasParams = false;

    // 1. Load standard inputs
    STATE_IDS.forEach(id => {
        if (params.has(id)) {
            const el = document.getElementById(id);
            if (el) {
                el.value = params.get(id);
                // Format the currency so it looks nice immediately
                if (id === 'grossIncome') formatCurrencyInput(el);
                hasParams = true;
            }
        }
    });

    // 2. Load filing status and update the UI buttons
    if (params.has('filingStatus')) {
        const status = params.get('filingStatus');
        filingStatus = status;
        
        // Update the button visuals
        document.querySelectorAll('.filing-btn').forEach(b => b.classList.remove('active'));
        const activeBtn = document.getElementById('btn-' + status);
        if (activeBtn) activeBtn.classList.add('active');
        
        hasParams = true;
    }

    return hasParams;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
    // 1. Check if the user arrived via a shared link
    const loadedFromUrl = loadFromUrl();

    // 2. If no link data, try to load from their previous session
    if (!loadedFromUrl) {
        loadFromStorage();
        // Also ensure standard inputs look correct if loaded from storage
        const incEl = document.getElementById('grossIncome');
        if (incEl && incEl.value) formatCurrencyInput(incEl);
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
    
    // 3. Load tax data (This function automatically triggers calculateTax() when done!)
    initTaxData();
});