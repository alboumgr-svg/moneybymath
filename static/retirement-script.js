// ════════════════════════════════════════════════════════════════════
//  RETIREMENT PLANNER SCRIPT
// ════════════════════════════════════════════════════════════════════

let fourzerokChart = null;
let runwayChart    = null;
let currentActiveTab = 'mixed';

const API_BASE = window.location.origin; 

// ── 2026 Federal Income Tax Brackets ────────────────────────────────
// Reflects inflation-adjusted TCJA rates for tax year 2026

// Define the global variable to hold the formatted data
let taxData2026 = null;

async function initTaxData() {
    try {
        const response = await fetch(`${API_BASE}/static/taxData.json`);
        const data = await response.json();
        
        taxData2026 = {
            single: {
                stdDeduction: data.STANDARD_DEDUCTIONS.single,
                brackets: data.BRACKETS.single.map(b => ({
                    rate: b[2], 
                    limit: b[1] === null ? Infinity : b[1]
                }))
            },
            joint: { 
                stdDeduction: data.STANDARD_DEDUCTIONS.mfj,
                brackets: data.BRACKETS.mfj.map(b => ({
                    rate: b[2], 
                    limit: b[1] === null ? Infinity : b[1]
                }))
            },
            hoh: { 
                stdDeduction: data.STANDARD_DEDUCTIONS.hoh,
                brackets: data.BRACKETS.hoh.map(b => ({
                    rate: b[2],
                    limit: b[1] === null ? Infinity : b[1]
                }))
            }
        };

        console.log("2026 Tax Data Loaded and Formatted successfully:", taxData2026);
        
        // Removed the broken calculateTax() block here!

    } catch (err) {
        console.error("Error loading tax data:", err);
    }
}

// ── Tab explanations ─────────────────────────────────────────────────

const explanations = {
    mixed:    "<strong>Portfolio:</strong> All four accounts combined. Having both pre-tax and Roth buckets lets you control your taxable income in retirement - filling lower brackets with traditional withdrawals and using Roth funds to avoid higher ones. Configure each account in the drop-down menus to the left.",
    payouts:  "<strong>Taxes &amp; Payouts:</strong> Fine-tune your retirement income target, Social Security, filing status, and withdrawal strategy.<br><br>The runway and tax analysis below use your <strong>Portfolio</strong> account inputs combined with these settings."
};

// ── Helpers ──────────────────────────────────────────────────────────

function formatNumber(input) {
    const value = input.value.replace(/,/g, '');
    if (!isNaN(value) && value !== '') {
        input.value = parseFloat(value).toLocaleString('en-US');
    }
}

function parseFormattedNumber(value) {
    if (typeof value === 'string') return parseFloat(value.replace(/,/g, '')) || 0;
    return parseFloat(value) || 0;
}

function fmt(n) {
    return Math.round(n).toLocaleString();
}

function getEl(id) { return document.getElementById(id); }

// ── Tab switching ────────────────────────────────────────────────────

function switchTab(tabId) {
    currentActiveTab = tabId;

    // Update button states (works whether triggered by button click or JS call)
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // Update left-panel content
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    getEl('tab-' + tabId).classList.add('active');

    // Update account explanation
    getEl('account-explanation').innerHTML = explanations[tabId];

    calculateAll();
}

// ── Compound growth engine ───────────────────────────────────────────
// accountType: 'trad' | 'roth' | 'ira'
// - 'trad': all contributions and match go to preTaxBal
// - 'roth': employee contributions go to rothBal; employer match goes to preTaxBal
// - 'ira' : flat annual contribution goes to rothBal (no match)

function calculateCompound(initialBal, salary, myContribRate, matchRate, matchLimitRate,
                            flatAnnualContrib, years, returnRate, salaryIncrease, accountType) {
    let preTaxBal = accountType === 'roth' || accountType === 'ira' ? 0 : initialBal;
    let rothBal   = accountType === 'roth' || accountType === 'ira' ? initialBal : 0;
    let currentSalary = salary;
    const totalMonths = Math.round(years * 12);
    const balanceHistory = [initialBal];

    for (let month = 1; month <= totalMonths; month++) {
        // Employee contribution
        let monthlyMyContrib = (currentSalary * myContribRate) / 12;
        if (flatAnnualContrib > 0) monthlyMyContrib += flatAnnualContrib / 12;

        // Employer match: matched up to matchLimitRate% of salary
        const matchableContrib  = Math.min(currentSalary * matchLimitRate, currentSalary * myContribRate);
        const monthlyMatch      = matchLimitRate > 0
            ? (matchableContrib * (matchRate / matchLimitRate)) / 12
            : 0;

        // Grow existing balances
        preTaxBal *= (1 + returnRate / 12);
        rothBal   *= (1 + returnRate / 12);

        // Add contributions
        if (accountType === 'roth') {
            rothBal   += monthlyMyContrib;  // employee → Roth
            preTaxBal += monthlyMatch;      // match → pre-tax
        } else if (accountType === 'ira') {
            rothBal   += monthlyMyContrib;  // all Roth, no match
        } else {
            preTaxBal += monthlyMyContrib + monthlyMatch; // trad: everything pre-tax
        }

        if (month % 12 === 0) {
            currentSalary *= (1 + salaryIncrease);
            balanceHistory.push(preTaxBal + rothBal);
        }
    }

    if (totalMonths % 12 !== 0) balanceHistory.push(preTaxBal + rothBal);
    return { preTaxBal, rothBal, history: balanceHistory };
}

// ── Main calculation entry point ─────────────────────────────────────

function calculateAll() {
    const salary         = parseFormattedNumber(getEl('salary').value);
    const currentAge     = parseInt(getEl('currentAge').value)    || 30;
    const retirementAge  = parseInt(getEl('retirementAge').value) || 65;
    const returnRate     = parseFloat(getEl('returnRate').value)    / 100 || 0.07;
    const salaryIncrease = parseFloat(getEl('salaryIncrease').value) / 100 || 0.03;
    const years          = Math.max(0, retirementAge - currentAge);
    const tab            = currentActiveTab;

    const agesArray = Array.from({ length: years + 1 }, (_, i) => currentAge + i);
    let totalPreTax = 0, totalRoth = 0;
    let history = new Array(agesArray.length).fill(0);

    // ── Accumulation phase (always mixed) ─────────────────────────
    const tradRes = calculateCompound(
        parseFormattedNumber(getEl('mix_tradBalance').value),
        salary,
        parseFloat(getEl('mix_tradContrib').value)   / 100 || 0,
        parseFloat(getEl('mix_employerMatch').value) / 100 || 0,
        parseFloat(getEl('mix_matchLimit').value)    / 100 || 1,
        0, years, returnRate, salaryIncrease, 'trad'
    );
    const roth401kRes = calculateCompound(
        parseFormattedNumber(getEl('mix_rothBalance').value),
        salary,
        parseFloat(getEl('mix_rothContrib').value)        / 100 || 0,
        parseFloat(getEl('mix_rothEmployerMatch').value)  / 100 || 0,
        parseFloat(getEl('mix_rothMatchLimit').value)     / 100 || 1,
        0, years, returnRate, salaryIncrease, 'roth'
    );
    const tradIraRes = calculateCompound(
        parseFormattedNumber(getEl('mix_tradIraBalance').value),
        salary, 0, 0, 1,
        parseFormattedNumber(getEl('mix_tradIraContrib').value),
        years, returnRate, salaryIncrease, 'trad'
    );
    const iraRes = calculateCompound(
        parseFormattedNumber(getEl('mix_iraBalance').value),
        salary, 0, 0, 1,
        parseFormattedNumber(getEl('mix_iraContrib').value),
        years, returnRate, salaryIncrease, 'ira'
    );

    totalPreTax = tradRes.preTaxBal + roth401kRes.preTaxBal + tradIraRes.preTaxBal + iraRes.preTaxBal;
    totalRoth   = tradRes.rothBal   + roth401kRes.rothBal   + tradIraRes.rothBal   + iraRes.rothBal;
    [tradRes, roth401kRes, tradIraRes, iraRes].forEach(r => r.history.forEach((v, i) => history[i] += v));

    // Update accordion summary badges
    getEl('mix_trad_summary').textContent    = '$' + fmt(tradRes.preTaxBal + tradRes.rothBal);
    getEl('mix_roth_summary').textContent    = '$' + fmt(roth401kRes.preTaxBal + roth401kRes.rothBal);
    getEl('mix_tradira_summary').textContent = '$' + fmt(tradIraRes.preTaxBal);
    getEl('mix_ira_summary').textContent     = '$' + fmt(iraRes.rothBal);

    // ── Update result header cards ─────────────────────────────────
    const total = totalPreTax + totalRoth;
    getEl('retireAgeSpan').textContent = retirementAge;
    getEl('finalBalance').textContent  = '$' + fmt(total);
    getEl('finalPreTax').textContent   = '$' + fmt(totalPreTax);
    getEl('finalRoth').textContent     = '$' + fmt(totalRoth);

    // ── Drive all tab-specific UI ──────────────────────────────────
    updateTabDisplay(agesArray, history, totalPreTax, totalRoth);

    saveToStorage();
}

// ── Tab display orchestrator ─────────────────────────────────────────

function updateTabDisplay(agesArray, history, totalPreTax, totalRoth) {
    const tab       = currentActiveTab;
    const isPayouts = tab === 'payouts';

    // Hide hint bar when already on payouts tab
    getEl('runwaySettingsBar').style.display = isPayouts ? 'none' : 'block';

    // Tax breakdown always visible (both tabs have pre-tax accounts)
    getEl('tax-free-banner').style.display       = 'none';
    getEl('tax-breakdown-section').style.display = 'block';
    renderFirstYearTax(totalPreTax, totalRoth, null);

    // Strategy comparison and conversion tips always enabled for mixed/payouts
    const showStrategyComparison = totalPreTax > 100 && totalRoth > 100;
    const showConversionTips     = totalPreTax > 5000;

    calculateRunway(totalPreTax, totalRoth,
        getEl('withdrawStrategy').value,
        showStrategyComparison, showConversionTips);
}

// ── First-year tax breakdown ─────────────────────────────────────────
// overrideStrategy: if null, reads from the DOM withdrawStrategy select

function renderFirstYearTax(totalPreTax, totalRoth, overrideStrategy) {
    if (!taxData2026) return;
    const targetIncome = parseFormattedNumber(getEl('targetIncome').value);
    const includeSS    = getEl('includeSS').checked;
    const ssMonthly    = parseFormattedNumber(getEl('ssMonthly').value);
    const filingStatus = getEl('filingStatus').value;
    const strategy     = overrideStrategy || getEl('withdrawStrategy').value;

    getEl('ss-inputs').style.display = includeSS ? 'block' : 'none';

    const ssAnnual = includeSS ? ssMonthly * 12 : 0;
    const needed   = Math.max(0, targetIncome - ssAnnual);
    let ptW = 0, rW = 0;

    if (strategy === 'proportional') {
        const tot = totalPreTax + totalRoth;
        if (tot > 0) { ptW = needed * (totalPreTax / tot); rW = needed * (totalRoth / tot); }
    } else if (strategy === 'pretax-first') {
        ptW = Math.min(needed, totalPreTax);
        rW  = Math.max(0, needed - ptW);
    } else { // roth-first
        rW  = Math.min(needed, totalRoth);
        ptW = Math.max(0, needed - rW);
    }

    getEl('targetIncomeDisplay').textContent     = targetIncome.toLocaleString();
    getEl('ssAnnualDisplay').textContent         = fmt(ssAnnual);
    getEl('preTaxWithdrawalDisplay').textContent = fmt(ptW);
    getEl('rothWithdrawalDisplay').textContent   = fmt(rW);

    const taxInfo = taxData2026[filingStatus];
    getEl('stdDeductionDisplay').textContent = taxInfo.stdDeduction.toLocaleString();

    // Taxable Social Security estimate
    let taxableSS = 0;
    if (ssAnnual > 0) {
        const combined = ptW + ssAnnual * 0.5;
        const base1 = filingStatus === 'single' ? 25000 : 32000;
        const base2 = filingStatus === 'single' ? 34000 : 44000;
        if (combined > base2) {
            taxableSS = Math.min(ssAnnual * 0.85, (combined - base2) * 0.85 + (base2 - base1) * 0.5);
        } else if (combined > base1) {
            taxableSS = Math.min(ssAnnual * 0.5, (combined - base1) * 0.5);
        }
    }

    // Only pre-tax withdrawal (+ taxable SS) is subject to income tax.
    // Roth withdrawals are completely excluded from taxable income.
    const grossTaxable    = ptW + taxableSS;
    const adjustedTaxable = Math.max(0, grossTaxable - taxInfo.stdDeduction);

    let totalTax = 0, prev = 0, tableHTML = '';
    if (adjustedTaxable === 0) {
        tableHTML = '<tr><td colspan="3" style="text-align:center;">Income fully covered by Standard Deduction. No federal tax owed.</td></tr>';
    } else {
        for (const b of taxInfo.brackets) {
            if (adjustedTaxable <= prev) break;
            const inBracket  = Math.min(adjustedTaxable - prev, b.limit - prev);
            const taxInBr    = inBracket * b.rate;
            totalTax += taxInBr;
            tableHTML += `<tr>
                <td>${(b.rate * 100).toFixed(0)}% Bracket</td>
                <td>$${fmt(inBracket)}</td>
                <td>$${fmt(taxInBr)}</td>
            </tr>`;
            prev = b.limit;
        }
    }

    getEl('taxTableBody').innerHTML = tableHTML;
    const takeHome      = targetIncome - totalTax;
    const effectiveRate = targetIncome > 0 ? (totalTax / targetIncome) * 100 : 0;
    getEl('totalTaxOwed').textContent     = '$' + fmt(totalTax);
    getEl('effectiveTaxRate').textContent = effectiveRate.toFixed(1) + '%';
    getEl('takeHomePay').textContent      = '$' + fmt(takeHome);
}

// ── Accumulation chart ───────────────────────────────────────────────

/* function update401kChart(ages, balances) {
    const ctx = getEl('fourzerokChart').getContext('2d');
    if (fourzerokChart) fourzerokChart.destroy();

    fourzerokChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ages,
            datasets: [{
                label: 'Total Portfolio Balance',
                data: balances,
                borderColor: '#2563EB',
                backgroundColor: 'rgba(37,99,235,0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            aspectRatio: 2,
            plugins: { legend: { display: true, position: 'top' } },
            scales: {
                y: {
                    title: { display: true, text: 'Balance ($)' },
                    ticks: { callback: v => '$' + (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : (v / 1000).toFixed(0) + 'k') }
                },
                x: { title: { display: true, text: 'Age' } }
            }
        }
    });
}
*/



// ── Sharing & Export ─────────────────────────────────────────────────

function copyShareLink() {
    const params = new URLSearchParams();
    document.querySelectorAll('input, select').forEach(el => {
        if (el.id) params.set(el.id, el.type === 'checkbox' ? el.checked : el.value);
    });
    const shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    const btn = getEl('shareLinkBtn');
    btn.disabled = true;
    navigator.clipboard.writeText(shareUrl).then(() => {
        const orig = btn.innerHTML;
        btn.innerHTML = '✓ Link Copied!';
        setTimeout(() => { btn.innerHTML = orig; btn.disabled = false; }, 2000);
    }).catch(err => { btn.disabled = false; console.error(err); });
}

function loadFromUrl() {
    const params = new URLSearchParams(window.location.search);
    if (!params.size) return false;
    let loaded = false;
    params.forEach((val, key) => {
        const el = getEl(key);
        if (!el) return;
        if (el.type === 'checkbox') el.checked = val === 'true';
        else el.value = val;
        loaded = true;
    });
    return loaded;
}

async function downloadPDF() {
    const { jsPDF } = window.jspdf;

    const btn = getEl('downloadPdfBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Generating...';
    btn.disabled = true;

    // ════════════════════════════════════════════════════════════════════════
    // REPORT DATA  ←  Only section you need to change per calculator page
    // ════════════════════════════════════════════════════════════════════════

    const g  = id => { const el = getEl(id); if (!el) return ''; return (el.value ?? el.textContent ?? '').trim(); };
    const rs = id => (getEl(id)?.textContent || '').trim();

    const filingLabel = (() => {
        const el = getEl('filingStatus');
        return el ? el.options[el.selectedIndex].text : '';
    })();
    const strategyLabel = (() => {
        const el = getEl('withdrawStrategy');
        return el ? el.options[el.selectedIndex].text : '';
    })();

    const REPORT = {
        title:    'Retirement Plan Report',
        filename: 'Retirement-Report.pdf',
        logoPath: `${typeof API_BASE !== 'undefined' ? API_BASE : ''}/static/logo.png`,

        // 2-column summary strip at the top
        summary: [
            { label: 'Total Portfolio at Retirement', value: rs('finalBalance'),        accent: true  },
            { label: 'Portfolio Longevity',           value: rs('longevityDisplay'),     accent: true  },
            { label: 'Pre-Tax Balance',               value: rs('finalPreTax'),          accent: false },
            { label: 'Roth Balance',                  value: rs('finalRoth'),            accent: false },
            { label: 'Lifetime Taxes Paid',           value: rs('totalTaxesDisplay'),    accent: false },
            { label: 'Total Withdrawals',             value: rs('totalWithdrawalsDisplay'), accent: false },
        ],

        // Key-value sections
        sections: [
            {
                heading: 'Accumulation — Inputs',
                items: [
                    { label: 'Current Salary',           value: '$' + g('salary') },
                    { label: 'Current Age',              value: g('currentAge') },
                    { label: 'Retirement Age',           value: g('retirementAge') },
                    { label: 'Years to Retirement',      value: Math.max(0, parseInt(g('retirementAge')) - parseInt(g('currentAge'))) + ' years' },
                    { label: 'Pre-Retirement Return',    value: g('returnRate') + '%' },
                    { label: 'Annual Salary Growth',     value: g('salaryIncrease') + '%' },
                ]
            },
            {
                heading: 'Account Balances & Contributions',
                items: [
                    { label: 'Traditional 401(k) Balance',     value: '$' + g('mix_tradBalance') },
                    { label: '--> Employee Contribution',        value: g('mix_tradContrib') + '%' },
                    { label: '--> Employer Match',               value: g('mix_employerMatch') + '% up to ' + g('mix_matchLimit') + '% of salary' },
                    { label: 'Roth 401(k) Balance',           value: '$' + g('mix_rothBalance') },
                    { label: '--> Employee Contribution',        value: g('mix_rothContrib') + '%' },
                    { label: '--> Employer Match',               value: g('mix_rothEmployerMatch') + '% up to ' + g('mix_rothMatchLimit') + '% of salary' },
                    { label: 'Traditional IRA Balance',        value: '$' + g('mix_tradIraBalance') },
                    { label: '--> Annual Contribution',          value: '$' + g('mix_tradIraContrib') },
                    { label: 'Roth IRA Balance',               value: '$' + g('mix_iraBalance') },
                    { label: '--> Annual Contribution',          value: '$' + g('mix_iraContrib') },
                ]
            },
            {
                heading: 'Retirement Settings',
                items: [
                    { label: 'Annual Income Target',        value: '$' + g('targetIncome') },
                    { label: 'Post-Retirement Return',      value: g('postReturnRate') + '%' },
                    { label: 'Life Expectancy',             value: g('lifeExpectancy') },
                    { label: 'Withdrawal Inflation',        value: g('withdrawalInflation') + '%' },
                    { label: 'Filing Status',               value: filingLabel },
                    { label: 'Withdrawal Strategy',         value: strategyLabel },
                    ...( getEl('includeSS')?.checked
                        ? [{ label: 'Social Security (monthly)', value: '$' + g('ssMonthly') }]
                        : [{ label: 'Social Security', value: 'Not included' }]
                    ),
                ]
            },
            {
                heading: 'First-Year Tax Estimate',
                items: [
                    { label: 'Income Target',              value: '$' + rs('targetIncomeDisplay') },
                    { label: 'Social Security (annual)',   value: '$' + rs('ssAnnualDisplay') },
                    { label: 'Pre-Tax Withdrawal',         value: '$' + rs('preTaxWithdrawalDisplay') },
                    { label: 'Roth Withdrawal (tax-free)', value: '$' + rs('rothWithdrawalDisplay') },
                    { label: 'Standard Deduction',         value: '$' + rs('stdDeductionDisplay') },
                    { label: 'Effective Tax Rate',         value: rs('effectiveTaxRate') },
                    { label: 'Federal Tax Owed',           value: rs('totalTaxOwed') },
                    { label: 'Take-Home Pay',              value: rs('takeHomePay') },
                ]
            },
        ],

        // Action plan box — a concise summary sentence
        actionPlan: (() => {
            const total     = rs('finalBalance');
            const longevity = rs('longevityDisplay');
            const target    = g('targetIncome');
            const savings   = rs('taxSavingsDisplay');
            
            if (!total || total === '$0') return [];
            
            const plan = [
                `1. Target Milestone: Your portfolio is projected to reach ${total} by retirement. Continue maximizing your employer match and maintaining your current contribution rates.`,
                `2. Income Strategy: To safely sustain your $${target.replace(/,/g, ',')} annual target through ${longevity}, monitor your withdrawal rate closely during the first 5 years of retirement.`,
            ];
            
            if (savings && savings !== '--' && savings !== '$0') {
                plan.push(`3. Tax Optimization: Implement an optimized bracket-fill withdrawal strategy in retirement. By withdrawing pre-tax funds up to the 12% bracket and using Roth funds for the rest, you could save ${savings} in lifetime taxes.`);
            }
            
            plan.push(`4. Annual Maintenance: Revisit this calculator annually to adjust for real-world inflation, salary increases, and actual market returns.`);
            
            return plan;
        })(),
    };

    // ════════════════════════════════════════════════════════════════════════
    // ENGINE  ←  Generic renderer (identical to debt-payoff)
    // ════════════════════════════════════════════════════════════════════════

    const PW = 612, PH = 792, ML = 48, MR = 48, CW = PW - ML - MR;
    const ACCENT = [37,  99, 235];
    const INK    = [22,  22,  22];
    const MUTED  = [110, 110, 110];
    const RULE   = [220, 220, 220];
    const STRIPE = [248, 249, 251];
    let y = 0;

    const doc = new jsPDF({ unit: 'pt', format: 'letter' });

    function sc(rgb, tp = 'text') {
        if (tp === 'text')       doc.setTextColor(...rgb);
        else if (tp === 'fill') doc.setFillColor(...rgb);
        else if (tp === 'draw') doc.setDrawColor(...rgb);
    }
    function t(str, x, yy, opts = {}) { doc.text(String(str), x, yy, opts); }
    function hRule(x = ML, w = CW, weight = 0.5, color = RULE) {
        sc(color, 'draw'); doc.setLineWidth(weight);
        doc.line(x, y, x + w, y); y += 10;
    }

    // Logo
    let logoImg = null;
    try {
        logoImg = await new Promise((res, rej) => {
            const img = new Image();
            img.onload = () => res(img);
            img.onerror = rej;
            img.src = REPORT.logoPath;
        });
    } catch (_) {}

    // ── Header ───────────────────────────────────────────────────────────────
    const HDR_H = 62;
    sc([255, 255, 255], 'fill'); doc.rect(0, 0, PW, HDR_H, 'F');
    if (logoImg) {
        const lh = 34, lw = (logoImg.width * lh) / logoImg.height;
        doc.addImage(logoImg, 'PNG', PW - MR - lw, (HDR_H - lh) / 2, lw, lh);
    }
    sc(INK, 'text'); doc.setFontSize(18); doc.setFont(undefined, 'bold');
    t(REPORT.title, ML, 28);
    sc(MUTED, 'text'); doc.setFontSize(8); doc.setFont(undefined, 'normal');
    t('Generated ' + new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), ML, 44);
    y = HDR_H;
    sc(ACCENT, 'fill'); doc.rect(0, y, PW, 2.5, 'F');
    y += 18;

    // ── Summary strip ────────────────────────────────────────────────────────
    const validSummary = REPORT.summary.filter(s => s.value && s.value !== '--' && s.value.trim() !== '');
    if (validSummary.length > 0) {
        const cols = 2, colW = CW / cols, rowH = 22, startY = y;
        validSummary.forEach((item, i) => {
            const cx = ML + (i % cols) * colW;
            const cy = startY + Math.floor(i / cols) * rowH;
            doc.setFontSize(7.5); doc.setFont(undefined, 'normal'); sc(MUTED, 'text');
            t(item.label.toUpperCase(), cx, cy + 8);
            doc.setFontSize(9.5); doc.setFont(undefined, 'bold');
            sc(item.accent ? ACCENT : INK, 'text');
            t(item.value, cx, cy + 19);
        });
        y = startY + Math.ceil(validSummary.length / cols) * rowH + 10;
        hRule(ML, CW, 0.75, RULE); y += 4;
    }

    // ── Section heading helper ────────────────────────────────────────────────
    function sectionHeading(title) {
        if (y + 20 > PH - 50) { doc.addPage(); y = 50; }
        doc.setFontSize(8); doc.setFont(undefined, 'bold'); sc(ACCENT, 'text');
        t(title.toUpperCase(), ML, y);
        sc(ACCENT, 'draw'); doc.setLineWidth(1.5);
        doc.line(ML, y + 3, ML + CW, y + 3);
        sc(INK, 'text'); y += 14;
    }

    // ── Generic sections ─────────────────────────────────────────────────────
    const ROW_H = 14;
    (REPORT.sections || []).forEach(sec => {
        sectionHeading(sec.heading);
        sec.items.forEach((item, i) => {
            if (y + ROW_H > PH - 50) { doc.addPage(); y = 50; }
            if (i % 2 === 1) { sc(STRIPE, 'fill'); doc.rect(ML, y, CW, ROW_H, 'F'); }
            doc.setFontSize(8.5); doc.setFont(undefined, 'normal');
            sc(MUTED, 'text'); t(item.label, ML + 6, y + 10);
            sc(INK, 'text'); doc.setFont(undefined, 'bold');
            t(String(item.value), ML + CW - 6, y + 10, { align: 'right' });
            y += ROW_H;
        });
        hRule(ML, CW, 0.5, RULE); y += 4;
    });

    // ── SECTION: ACTION PLAN (NEW PAGE) ────────────────────────────────────

    if (REPORT.actionPlan && REPORT.actionPlan.length > 0) {
        doc.addPage();
        y = 50; 

        sectionHeading('Next Steps & Action Plan');

        // CRITICAL FIX: Set font style BEFORE calculating heights/wrapping
        doc.setFontSize(9.5);
        doc.setFont(undefined, 'normal');

        const lineHt = 13;
        const stepSpacing = 10; 
        let boxH = 20; // Internal padding

        // Now splitTextToSize knows to use 9.5pt font logic
        const stepsData = REPORT.actionPlan.map(step => {
            return doc.splitTextToSize(step, CW - 50); 
        });

        // Calculate height based on the correct number of lines
        stepsData.forEach((lines, i) => {
            boxH += lines.length * lineHt;
            if (i < stepsData.length - 1) boxH += stepSpacing;
        });

        if (y + boxH > PH - 50) { doc.addPage(); y = 50; }

        // Draw Box
        sc(STRIPE, 'fill'); 
        doc.roundedRect(ML, y, CW, boxH, 3, 3, 'F');

        // Draw Accent Line
        sc(ACCENT, 'draw');
        doc.setLineWidth(2);
        doc.line(ML, y, ML, y + boxH);

        // Print Text
        sc(INK, 'text');
        // (Font size is already set above)

        let textY = y + 14; 
        stepsData.forEach((lines) => {
            lines.forEach(line => {
                t(line, ML + 10, textY);
                textY += lineHt;
            });
            textY += stepSpacing;
        });

        y += boxH + 16;
    }


    // ── Footer (every page) ──────────────────────────────────────────────────
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        sc(RULE, 'draw'); doc.setLineWidth(0.5);
        doc.line(ML, PH - 32, PW - MR, PH - 32);
        sc(MUTED, 'text'); doc.setFontSize(7); doc.setFont(undefined, 'normal');
        t('MoneyByMath  ·  For informational purposes only. Not financial advice.', ML, PH - 20);
        t('Page ' + p + ' of ' + totalPages, PW - MR, PH - 20, { align: 'right' });
    }

    doc.save(REPORT.filename);
    btn.innerHTML = '✓ Saved!';
    btn.disabled = false;
    setTimeout(() => (btn.innerHTML = originalText), 2000);
}

// ── Reset ────────────────────────────────────────────────────────────────────

function clearAll() {
    document.querySelectorAll('input, select').forEach(el => {
        if (!el.id) return;
        if (el.type === 'checkbox') {
            // restore the only checkbox to its HTML default (checked)
            el.checked = (el.id === 'includeSS');
        } else if (el.tagName === 'SELECT') {
            el.selectedIndex = 0;
        } else {
            el.value = '';
        }
    });
    localStorage.removeItem('retirementData');
    calculateAll();
}

// ── Persistence ──────────────────────────────────────────────────────

function saveToStorage() {
    const data = {};
    document.querySelectorAll('input, select').forEach(el => {
        if (el.id) {
            data[el.id] = el.type === 'checkbox' ? el.checked : el.value;
        }
    });
    localStorage.setItem('retirementData', JSON.stringify(data));
}

function loadFromStorage() {
    const saved = localStorage.getItem('retirementData');
    if (!saved) return;
    const data = JSON.parse(saved);
    Object.keys(data).forEach(key => {
        const el = getEl(key);
        if (el) {
            if (el.type === 'checkbox') el.checked = data[key];
            else el.value = data[key];
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
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
                const yOffset = -300; // adjust this (px above the button)
                const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;

                window.scrollTo({
                    top: y,
                    behavior: 'smooth'
                });
            }
        }, 50);
    }


    getEl('account-explanation').innerHTML = explanations['mixed'];
    
    // WAIT for the JSON to download and format
    await initTaxData(); 
    
    // Now it is safe to trigger the UI and calculations
    switchTab('mixed'); 
});


// ════════════════════════════════════════════════════════════════════
//  RETIREMENT RUNWAY - Decumulation simulation & rendering
// ════════════════════════════════════════════════════════════════════

// ── Tax helpers ──────────────────────────────────────────────────────

/**
 * Federal income tax on grossIncome (before std deduction).
 * Only pre-tax withdrawals (+ taxable SS) pass through here.
 * Roth withdrawals are never included.
 */
function rw_calcFederalTax(grossIncome, filingStatus) {
    const info    = taxData2026[filingStatus];
    const taxable = Math.max(0, grossIncome - info.stdDeduction);
    let tax = 0, prev = 0;
    for (const b of info.brackets) {
        if (taxable <= prev) break;
        tax += Math.min(taxable - prev, b.limit - prev) * b.rate;
        prev = b.limit;
    }
    return tax;
}

/**
 * Estimate the taxable fraction of Social Security
 * based on pre-tax withdrawal amount and filing status.
 */
function rw_calcTaxableSS(ssAnnual, preTaxW, filingStatus) {
    if (ssAnnual <= 0) return 0;
    const combined = preTaxW + ssAnnual * 0.5;
    const base1    = filingStatus === 'single' ? 25000 : 32000;
    const base2    = filingStatus === 'single' ? 34000 : 44000;
    if (combined > base2) return Math.min(ssAnnual * 0.85, (combined - base2) * 0.85 + (base2 - base1) * 0.5);
    if (combined > base1) return Math.min(ssAnnual * 0.5, (combined - base1) * 0.5);
    return 0;
}

/**
 * Bracket-fill strategy: withdraw pre-tax up to the top of the 12% bracket,
 * then use tax-free Roth for the rest. This minimizes lifetime tax.
 */
function rw_getOptimizedWithdrawal(targetIncome, ssAnnual, ptBal, rBal, filingStatus) {
    const info    = taxData2026[filingStatus];
    const top12   = (filingStatus === 'single' ? 49900 : 99850) + info.stdDeduction;
    const needed  = Math.max(0, targetIncome - ssAnnual);
    // Rough SS taxability estimate at the proposed pre-tax level
    const estSS   = rw_calcTaxableSS(ssAnnual, Math.min(needed, top12), filingStatus);
    const maxPreTax  = Math.max(0, Math.min(needed, top12 - estSS, ptBal));
    const rothNeeded = Math.min(Math.max(0, needed - maxPreTax), rBal);
    const extraPre   = Math.min(Math.max(0, needed - maxPreTax - rothNeeded), ptBal - maxPreTax);
    return { preTaxWithdrawal: maxPreTax + extraPre, rothWithdrawal: rothNeeded };
}

// ── Core year-by-year simulation ─────────────────────────────────────

function rw_simulate(startPreTax, startRoth, targetIncome, ssAnnual,
                     returnRate, inflationRate, filingStatus, strategy,
                     startAge, years) {
    let ptBal  = startPreTax;
    let rBal   = startRoth;
    let target = targetIncome;
    const rows = [];

    for (let yr = 0; yr < years; yr++) {
        const age      = startAge + yr;
        const startBal = ptBal + rBal;
        const needed   = Math.max(0, target - ssAnnual);

        // Portfolio depleted
        if (startBal <= 0 && needed > 0) {
            rows.push({ age, startBal: 0, preTaxW: 0, rothW: 0, ssAnnual,
                        taxPaid: 0, netIncome: ssAnnual, endBal: 0, depleted: true });
            target *= (1 + inflationRate);
            continue;
        }

        let ptW = 0, rW = 0;

        switch (strategy) {
            case 'optimized': {
                const o = rw_getOptimizedWithdrawal(target, ssAnnual, ptBal, rBal, filingStatus);
                ptW = Math.min(o.preTaxWithdrawal, ptBal);
                rW  = Math.min(o.rothWithdrawal,   rBal);
                break;
            }
            case 'pretax-first':
                ptW = Math.min(needed, ptBal);
                rW  = Math.min(needed - ptW, rBal);
                break;
            case 'roth-first':
                rW  = Math.min(needed, rBal);
                ptW = Math.min(needed - rW, ptBal);
                break;
            default: // proportional
                ptW = startBal > 0 ? Math.min(needed * (ptBal / startBal), ptBal) : 0;
                rW  = Math.min(needed - ptW, rBal);
        }

        // Tax applies ONLY to pre-tax withdrawal and taxable portion of SS.
        // Roth withdrawal is 100% tax-free - excluded from taxable income.
        const taxableSS = rw_calcTaxableSS(ssAnnual, ptW, filingStatus);
        const taxPaid   = rw_calcFederalTax(ptW + taxableSS, filingStatus);

        // Remaining balances grow at post-retirement return
        ptBal = Math.max(0, (ptBal - ptW) * (1 + returnRate));
        rBal  = Math.max(0, (rBal  - rW)  * (1 + returnRate));

        rows.push({
            age, startBal, preTaxW: ptW, rothW: rW, ssAnnual,
            taxPaid,
            netIncome: ptW + rW + ssAnnual - taxPaid,
            endBal: ptBal + rBal,
            depleted: false
        });

        target *= (1 + inflationRate);
    }
    return rows;
}

// ── Runway entry point ───────────────────────────────────────────────

function calculateRunway(totalPreTax, totalRoth, strategy, showStrategyComparison, showConversionTips) {
    const retirementAge  = parseInt(getEl('retirementAge').value)          || 65;
    const lifeExpectancy = parseInt(getEl('lifeExpectancy').value)         || 90;
    const targetIncome   = parseFormattedNumber(getEl('targetIncome').value);
    const postReturn     = parseFloat(getEl('postReturnRate').value)    / 100 || 0.05;
    const inflation      = parseFloat(getEl('withdrawalInflation').value) / 100 || 0.025;
    const includeSS      = getEl('includeSS').checked;
    const ssMonthly      = parseFormattedNumber(getEl('ssMonthly').value);
    const filingStatus   = getEl('filingStatus').value;

    const ssAnnual = includeSS ? ssMonthly * 12 : 0;
    const years    = Math.max(1, lifeExpectancy - retirementAge + 1);

    const current   = rw_simulate(totalPreTax, totalRoth, targetIncome, ssAnnual,
                                   postReturn, inflation, filingStatus, strategy, retirementAge, years);

    // Only run the optimized simulation when strategy comparison is shown
    const optimized = showStrategyComparison
        ? rw_simulate(totalPreTax, totalRoth, targetIncome, ssAnnual,
                      postReturn, inflation, filingStatus, 'optimized', retirementAge, years)
        : current; // reference equality - no comparison will show $0 savings

    // Update hint bar
    getEl('hintTarget').textContent  = fmt(targetIncome);
    getEl('hintLifeExp').textContent = lifeExpectancy;
    getEl('hintReturn').textContent  = (postReturn * 100).toFixed(1) + '%';

    rw_updateUI(current, optimized, retirementAge, lifeExpectancy, targetIncome,
                totalPreTax + totalRoth, showStrategyComparison, showConversionTips);
}

// ── Runway UI orchestrator ────────────────────────────────────────────

function rw_updateUI(current, optimized, retirementAge, lifeExpectancy, targetIncome,
                     portfolioAtRetirement, showStrategyComparison, showConversionTips) {

    const totalTaxCur    = current.reduce((s, d) => s + d.taxPaid, 0);
    const totalTaxOpt    = optimized.reduce((s, d) => s + d.taxPaid, 0);
    const taxSavings     = Math.max(0, totalTaxCur - totalTaxOpt);
    const totalWithdrawn = current.reduce((s, d) => s + d.preTaxW + d.rothW, 0);

    const funded      = current.filter(d => !d.depleted);
    const lastsAge    = funded.length > 0 ? funded[funded.length - 1].age : retirementAge;
    const fullyFunded = lastsAge >= lifeExpectancy;

    // ── Stat cards ──────────────────────────────────────────────────
    const lonEl = getEl('longevityDisplay');
    lonEl.textContent = fullyFunded ? `Age ${lifeExpectancy}+` : `Age ${lastsAge}`;
    lonEl.style.color = fullyFunded ? '#059669' : '#dc2626';

    getEl('totalTaxesDisplay').textContent      = '$' + fmt(totalTaxCur);
    getEl('totalWithdrawalsDisplay').textContent = '$' + fmt(totalWithdrawn);
    const savEl = getEl('taxSavingsDisplay');
    savEl.textContent = showStrategyComparison ? '$' + fmt(taxSavings) : '--';
    savEl.style.color = taxSavings > 500 ? '#059669' : '#374151';

    getEl('runwayYearsLabel').textContent =
        `${retirementAge}–${lifeExpectancy} (${lifeExpectancy - retirementAge} years)`;

    // ── SWR banner ──────────────────────────────────────────────────
    const swr   = portfolioAtRetirement > 0 ? (targetIncome / portfolioAtRetirement) * 100 : 0;
    const swrEl = getEl('swrIndicator');
    swrEl.className = 'swr-indicator';
    if (swr === 0) {
        swrEl.innerHTML = '';
    } else if (swr <= 4) {
        swrEl.classList.add('swr-safe');
        swrEl.innerHTML = `<strong>Safe Withdrawal Rate: ${swr.toFixed(1)}%</strong> - Within the 4% guideline. This portfolio is well-positioned for a long retirement.`;
    } else if (swr <= 5) {
        swrEl.classList.add('swr-caution');
        swrEl.innerHTML = `<strong>Withdrawal Rate: ${swr.toFixed(1)}%</strong> - Slightly above the 4% guideline. Consider trimming spending or delaying retirement to improve longevity.`;
    } else {
        swrEl.classList.add('swr-danger');
        swrEl.innerHTML = `<strong>Withdrawal Rate: ${swr.toFixed(1)}%</strong> - Above 5%. High depletion risk. Increase contributions, reduce target income, or delay retirement.`;
    }

    // ── Coverage gauge ──────────────────────────────────────────────
    const retirementYears = lifeExpectancy - retirementAge;
    const fundedYears     = Math.max(0, lastsAge - retirementAge);
    const gaugeWidth      = retirementYears > 0 ? Math.min(100, (fundedYears / retirementYears) * 100) : 100;
    getEl('gaugeFill').style.width = gaugeWidth + '%';
    getEl('gaugePct').textContent   = `${fundedYears} of ${retirementYears} years funded`;
    getEl('gaugeStart').textContent = `Age ${retirementAge}`;
    getEl('gaugeEnd').textContent   = `Age ${lifeExpectancy}`;

    // ── Sub-sections ────────────────────────────────────────────────
    if (showConversionTips) {
        rw_updateConversionTips(current);
    } else {
        getEl('conversionOpportunities').innerHTML = '';
    }

    if (showStrategyComparison) {
        rw_updateStrategyComparison(totalTaxCur, totalTaxOpt, taxSavings);
    } else {
        getEl('strategyComparison').innerHTML = '';
    }

    // Hide "Opt. Savings" column header when not comparing strategies
    const optHeader = getEl('runway-opt-header');
    if (optHeader) optHeader.style.display = showStrategyComparison ? '' : 'none';

    rw_updateChart(current, optimized, showStrategyComparison);
    rw_updateTable(current, optimized, showStrategyComparison);
}

// ── Roth conversion opportunities ────────────────────────────────────

function rw_updateConversionTips(current) {
    const filingStatus = getEl('filingStatus').value;
    const info         = taxData2026[filingStatus];
    const top12        = (filingStatus === 'single' ? 49900 : 99850) + info.stdDeduction;

    const tips = current.filter(d => {
        if (d.depleted) return false;
        const usedGross = d.preTaxW + rw_calcTaxableSS(d.ssAnnual, d.preTaxW, filingStatus);
        return (top12 - usedGross) > 10000 && d.endBal > 50000;
    }).slice(0, 5);

    const el = getEl('conversionOpportunities');
    if (tips.length === 0) { el.innerHTML = ''; return; }

    let rows = '';
    tips.forEach(t => {
        const usedGross = t.preTaxW + rw_calcTaxableSS(t.ssAnnual, t.preTaxW, filingStatus);
        const headroom  = Math.max(0, top12 - usedGross);
        rows += `<div class="conversion-row">
            <span class="conversion-row-age">Age <strong>${t.age}</strong></span>
            <span class="conversion-row-amt">Convert up to $${fmt(headroom)} - stays in the 12% bracket</span>
        </div>`;
    });

    el.innerHTML = `<div class="conversion-panel">
        <p class="conversion-panel-title">Roth Conversion Opportunities</p>
        <p class="conversion-panel-note">In these early retirement years you have unused room in the lower tax brackets. Converting pre-tax funds to Roth locks in today's low rates and reduces future Required Minimum Distributions.</p>
        ${rows}
    </div>`;
}

// ── Lifetime strategy comparison ─────────────────────────────────────

function rw_updateStrategyComparison(totalTaxCur, totalTaxOpt, savings) {
    const el         = getEl('strategyComparison');
    const strategyEl = getEl('withdrawStrategy');
    const stratName  = strategyEl.options[strategyEl.selectedIndex].text.split(' (')[0];

    if (savings < 500) {
        el.innerHTML = `<div class="strategy-optimal-panel">
            <strong>Your "${stratName}" strategy is near-optimal.</strong>
            The bracket-fill optimizer finds only $${fmt(savings)} in additional potential lifetime savings.
        </div>`;
        return;
    }

    el.innerHTML = `<div class="strategy-comparison-panel">
        <p class="strategy-comparison-title-bar">Tax Strategy Comparison - Lifetime</p>
        <div class="strategy-comparison-grid">
            <div class="strategy-card strategy-card--current">
                <div class="strategy-card-label strategy-card-label--current">${stratName}</div>
                <div class="strategy-card-amount strategy-card-amount--current">$${fmt(totalTaxCur)}</div>
                <div class="strategy-card-sub">lifetime taxes paid</div>
            </div>
            <div class="strategy-card strategy-card--optimized">
                <div class="strategy-card-label strategy-card-label--optimized">Bracket Fill (Optimized)</div>
                <div class="strategy-card-amount strategy-card-amount--optimized">$${fmt(totalTaxOpt)}</div>
                <div class="strategy-card-sub">lifetime taxes paid</div>
            </div>
        </div>
        <div class="strategy-savings-highlight">Potential Lifetime Tax Savings: $${fmt(savings)}</div>
        <p class="strategy-comparison-footnote">The Bracket Fill strategy fills pre-tax withdrawals up to the top of the 12% federal bracket each year, then uses tax-free Roth funds for the remainder - minimizing lifetime taxes while meeting your income target.</p>
    </div>`;
}

// ── Runway chart ──────────────────────────────────────────────────────

function rw_updateChart(current, optimized, showOptimized) {
    const ctx = getEl('runwayChart').getContext('2d');
    if (runwayChart) runwayChart.destroy();

    const ages  = current.map(d => d.age);
    const ssVal = current[0] ? current[0].ssAnnual : 0;

    const datasets = [
        {
            label: 'Federal Taxes',
            data: current.map(d => d.taxPaid),
            backgroundColor: 'rgba(239,68,68,0.8)',
            stack: 'income', order: 2, borderRadius: 2
        },
        {
            label: 'Pre-Tax Withdrawal',
            data: current.map(d => d.preTaxW),
            backgroundColor: 'rgba(59,130,246,0.8)',
            stack: 'income', order: 2, borderRadius: 2
        },
        {
            label: 'Roth Withdrawal',
            data: current.map(d => d.rothW),
            backgroundColor: 'rgba(16,185,129,0.8)',
            stack: 'income', order: 2, borderRadius: 2
        },
        {
            label: 'Social Security',
            data: current.map(() => ssVal),
            backgroundColor: 'rgba(139,92,246,0.7)',
            stack: 'income', order: 2, borderRadius: 2
        },
        {
            label: 'Portfolio Balance',
            data: current.map(d => d.endBal),
            type: 'line',
            borderColor: '#1e40af',
            backgroundColor: 'rgba(37,99,235,0.07)',
            borderWidth: 3,
            fill: true,
            tension: 0.4,
            yAxisID: 'y2', order: 1,
            pointRadius: ages.length > 20 ? 0 : 3,
            pointHoverRadius: 5
        }
    ];

    if (showOptimized && optimized !== current) {
        datasets.push({
            label: 'Portfolio Balance (Optimized Strategy)',
            data: optimized.map(d => d.endBal),
            type: 'line',
            borderColor: '#10b981',
            borderDash: [6, 4],
            borderWidth: 2.5,
            fill: false,
            tension: 0.4,
            yAxisID: 'y2', order: 1,
            pointRadius: 0,
            pointHoverRadius: 5
        });
    }

    runwayChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: ages, datasets },
        options: {
            responsive: true,
            aspectRatio: window.innerWidth < 600 ? 0.8 : 1.75,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 13, padding: 10 } },
                tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: $${Math.round(ctx.raw).toLocaleString()}` } }
            },
            scales: {
                y: {
                    stacked: true,
                    position: 'left',
                    title: { display: true, text: 'Annual Income & Taxes ($)', font: { size: 11 } },
                    ticks: {
                        callback: v => '$' + (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v),
                        font: { size: 10 }
                    },
                    grid: { color: 'rgba(0,0,0,0.04)' }
                },
                y2: {
                    position: 'right',
                    title: { display: true, text: 'Portfolio Balance ($)', font: { size: 11 } },
                    ticks: {
                        callback: v => '$' + (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : (v / 1000).toFixed(0) + 'k'),
                        font: { size: 10 }
                    },
                    grid: { drawOnChartArea: false }
                },
                x: { title: { display: true, text: 'Age', font: { size: 11 } }, ticks: { font: { size: 10 } } }
            }
        }
    });
}

// ── Year-by-year table ────────────────────────────────────────────────

function rw_updateTable(current, optimized, showOptimized) {
    let html = '';
    current.forEach((d, i) => {
        const opt           = optimized[i];
        const savedThisYear = showOptimized && opt && opt !== d
            ? Math.max(0, d.taxPaid - opt.taxPaid)
            : 0;

        let rowClass = '';
        if (d.depleted) rowClass = 'row-depleted';
        else if (d.endBal > 0 && d.endBal < d.startBal * 0.35) rowClass = 'row-warning';

        const optCell = showOptimized
            ? `<td class="col-purple">${savedThisYear >= 1 ? '-$' + fmt(savedThisYear) : '--'}</td>`
            : '<td style="display:none"></td>';

        html += `<tr class="${rowClass}">
            <td>${d.age}</td>
            <td>$${fmt(d.startBal)}</td>
            <td class="col-blue">$${fmt(d.preTaxW)}</td>
            <td class="col-green">$${fmt(d.rothW)}</td>
            <td class="col-purple">$${fmt(d.ssAnnual)}</td>
            <td class="col-red">$${fmt(d.taxPaid)}</td>
            <td class="col-green"><strong>$${fmt(d.netIncome)}</strong></td>
            <td>${d.depleted ? '<em style="color:#dc2626">Depleted</em>' : '$' + fmt(d.endBal)}</td>
            ${optCell}
        </tr>`;
    });
    getEl('runwayTableBody').innerHTML = html;
}