let benchmarkData = null;
let scoreBreakdownChart = null;
let benchmarkChart = null;
let lastEvaluation = null;
let taxData2026 = null;
const AVG_STATE_TAX_RATE = 0.045;

const API_BASE = window.location.origin || '';
const STORAGE_KEY = 'financialHealthCheckData';

const DEFAULT_WEIGHTS = {
    income: 6,
    cashFlow: 14,
    emergencyFund: 12,
    retirementReadiness: 18,
    investing: 12,
    netWorth: 12,
    debtManagement: 16,
    protectionAndPlanning: 10
};

const DEFAULT_THRESHOLDS = {
    monthlySurplusRatio: { minimum: 0.05, strong: 0.15, excellent: 0.25 },
    emergencyFundMonths: { minimum: 3, strong: 6, excellent: 9 },
    savingsRate: { minimum: 0.08, strong: 0.20, excellent: 0.30 },
    retirementContributionRate: { minimum: 0.10, strong: 0.15, excellent: 0.20 },
    investingRate: { minimum: 0.05, strong: 0.12, excellent: 0.20 },
    housingRatio: { healthy: 0.28, stretch: 0.35, danger: 0.45 },
    fixedObligationRatio: { healthy: 0.36, stretch: 0.43, danger: 0.50 },
    consumerDebtToIncome: { healthy: 0.05, stretch: 0.10, danger: 0.20 },
    creditUtilization: { healthy: 0.10, stretch: 0.30, danger: 0.50 },
    creditScore: { minimum: 670, strong: 740, excellent: 780 }
};

const CATEGORY_DESCRIPTIONS = {
    income: 'Compares your income with the typical range for your age band.',
    cashFlow: 'Checks whether your cash flow leaves breathing room after core outflows, debt payments, and planned saving.',
    emergencyFund: 'Measures how long liquid cash can support your core monthly life.',
    retirementReadiness: 'Looks at retirement balances, contribution rate, and progress toward age-based milestones.',
    investing: 'Measures how much capital you are building outside of basic cash reserves.',
    netWorth: 'Compares your total balance sheet with age-based benchmarks and target multiples.',
    debtManagement: 'Penalizes tight fixed obligations, consumer debt, and stressed credit usage.',
    protectionAndPlanning: 'Rewards insurance, match capture, credit health, and basic estate housekeeping.'
};

const STATE_IDS = [
    'age', 'filingStatus', 'householdSize', 'dependents', 'homeStatus',
    'annualGrossIncome', 'annualBonus', 'monthlyTakeHome',
    'monthlyHousing', 'monthlyCoreSpending', 'monthlyFlexibleSpending',
    'checkingSavings', 'emergencyFund', 'retirementAccounts', 'taxableInvestments',
    'hsaBalance', 'collegeSavings', 'homeValue', 'mortgageBalance', 'otherAssets',
    'monthlyRetirementContrib', 'monthlyOtherPreTax', 'monthlyRothContrib', 'monthlyEmployerMatch', 'monthlyTaxableInvesting',
    'monthlyEmergencySaving',
    'creditCardBalance', 'creditCardPayment', 'creditCardLimit', 'creditCardAPR',
    'studentLoanBalance', 'studentLoanPayment',
    'autoLoanBalance', 'autoLoanPayment',
    'personalLoanBalance', 'personalLoanPayment',
    'otherDebtBalance', 'otherDebtPayment',
    'creditScore', 'capturesEmployerMatch',
    'hasHealthInsurance', 'hasDisabilityInsurance', 'hasLifeInsurance',
    'hasWill', 'hasBeneficiaries'
];

function getEl(id) {
    return document.getElementById(id);
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function safeDivide(numerator, denominator) {
    return denominator ? numerator / denominator : 0;
}

function parseNumber(value) {
    if (value === null || value === undefined) return 0;
    return parseFloat(String(value).replace(/,/g, '')) || 0;
}

function num(id) {
    return parseNumber(getEl(id)?.value);
}

function isChecked(id) {
    return !!getEl(id)?.checked;
}

function money(value) {
    const sign = value < 0 ? '-' : '';
    return `${sign}$${Math.round(Math.abs(value)).toLocaleString()}`;
}

function percent(value, digits = 1) {
    return `${(value * 100).toFixed(digits)}%`;
}

function multiple(value, digits = 1) {
    return `${value.toFixed(digits)}x`;
}

function sanitizeMoneyInput(input) {
    if (!input) return;

    // 1. Get the current cursor position and the number of raw digits before it
    const cursor = input.selectionStart;
    const originalValue = input.value;
    const digitsBeforeCursor = originalValue.slice(0, cursor).replace(/[^\d]/g, '').length;
    
    // 2. Extract only digits and single decimal points
    let cleanValue = originalValue.replace(/[^\d.]/g, '');
    const firstDot = cleanValue.indexOf('.');
    if (firstDot !== -1) {
        cleanValue = cleanValue.slice(0, firstDot + 1) + cleanValue.slice(firstDot + 1).replace(/\./g, '');
    }
    
    // 3. Separate the integer and decimal parts
    const parts = cleanValue.split('.');
    let integerPart = parts[0];
    let decimalPart = parts.length > 1 ? '.' + parts[1].slice(0, 2) : '';
    
    // 4. Format the integer part with commas
    if (integerPart) {
        integerPart = parseInt(integerPart, 10).toLocaleString('en-US');
    }
    
    const newValue = integerPart + decimalPart;
    input.value = newValue;
    
    // 5. Calculate and restore the cursor position so it doesn't jump
    let newCursor = 0;
    let digitCount = 0;
    while (digitCount < digitsBeforeCursor && newCursor < newValue.length) {
        if (/\d/.test(newValue[newCursor])) {
            digitCount++;
        }
        newCursor++;
    }
    input.setSelectionRange(newCursor, newCursor);
}

function formatMoneyInput(input) {
    if (!input) return;
    const value = input.value.replace(/,/g, '');
    if (!value) {
        input.value = '';
        return;
    }
    const parsed = parseFloat(value);
    if (!Number.isFinite(parsed)) return;
    input.value = parsed.toLocaleString('en-US', {
        maximumFractionDigits: value.includes('.') ? 2 : 0
    });
}

function formatAllMoneyInputs() {
    document.querySelectorAll('.money-input').forEach(formatMoneyInput);
}

function serializeState() {
    const data = {};
    STATE_IDS.forEach(id => {
        const el = getEl(id);
        if (!el) return;
        if (el.type === 'checkbox') data[id] = el.checked ? '1' : '0';
        else data[id] = el.value;
    });
    return data;
}

function applyState(data) {
    Object.entries(data || {}).forEach(([id, value]) => {
        const el = getEl(id);
        if (!el) return;
        if (el.type === 'checkbox') {
            el.checked = value === true || value === '1' || value === 'true' || value === 'yes';
        } else {
            el.value = value;
        }
    });
}

function saveToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState()));
}

function loadFromStorage() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
        applyState(JSON.parse(raw));
    } catch (err) {
        console.error('Failed to load saved financial health data', err);
    }
}

function loadFromUrl() {
    const params = new URLSearchParams(window.location.search);
    let hasParams = false;

    STATE_IDS.forEach(id => {
        if (!params.has(id)) return;
        const el = getEl(id);
        if (!el) return;
        if (el.type === 'checkbox') {
            el.checked = ['1', 'true', 'yes'].includes(params.get(id));
        } else {
            el.value = params.get(id);
        }
        hasParams = true;
    });

    return hasParams;
}

async function initBenchmarks() {
    try {
        const response = await fetch(`${API_BASE}/static/financial-health-benchmarks.json`);
        if (!response.ok) throw new Error(`Benchmark file returned ${response.status}`);
        benchmarkData = await response.json();
    } catch (err) {
        console.error('Failed to load financial health benchmarks', err);
        benchmarkData = {
            meta: {
                benchmarkYear: 'Unknown',
                notes: ['Benchmark data could not be loaded.']
            },
            scoringWeights: DEFAULT_WEIGHTS,
            thresholds: DEFAULT_THRESHOLDS,
            ageBands: []
        };
    }
}

async function initTaxData() {
    try {
        const response = await fetch(`${API_BASE}/static/taxData.json`);
        const data = await response.json();
        taxData2026 = {
            ficaWageBase: data.FICA_WAGE_BASE || 176100,
            single: {
                stdDeduction: data.STANDARD_DEDUCTIONS.single,
                brackets: data.BRACKETS.single.map(b => ({ rate: b[2], limit: b[1] === null ? Infinity : b[1] }))
            },
            mfj: {
                stdDeduction: data.STANDARD_DEDUCTIONS.mfj,
                brackets: data.BRACKETS.mfj.map(b => ({ rate: b[2], limit: b[1] === null ? Infinity : b[1] }))
            },
            hoh: {
                stdDeduction: data.STANDARD_DEDUCTIONS.hoh,
                brackets: data.BRACKETS.hoh.map(b => ({ rate: b[2], limit: b[1] === null ? Infinity : b[1] }))
            }
        };
    } catch (err) {
        console.error('Error loading tax data:', err);
    }
}

function estimateTax(grossAnnual, preTaxDeductionsAnnual, status) {
    // Fallback brackets (2026 single-filer estimates) are used only when the
    // taxData.json fetch fails. The live JSON always takes precedence.
    const FALLBACK_2026 = {
        single: { stdDeduction: 15350, brackets: [
            { rate: 0.10, limit: 12150 }, { rate: 0.12, limit: 49350 },
            { rate: 0.22, limit: 105225 }, { rate: 0.24, limit: 200850 },
            { rate: 0.32, limit: 255150 }, { rate: 0.35, limit: 638350 },
            { rate: 0.37, limit: Infinity }
        ]},
        mfj: { stdDeduction: 30700, brackets: [
            { rate: 0.10, limit: 24300 }, { rate: 0.12, limit: 98700 },
            { rate: 0.22, limit: 210450 }, { rate: 0.24, limit: 401700 },
            { rate: 0.32, limit: 510300 }, { rate: 0.35, limit: 765000 },
            { rate: 0.37, limit: Infinity }
        ]},
        hoh: { stdDeduction: 22900, brackets: [
            { rate: 0.10, limit: 17350 }, { rate: 0.12, limit: 65900 },
            { rate: 0.22, limit: 105225 }, { rate: 0.24, limit: 200850 },
            { rate: 0.32, limit: 255150 }, { rate: 0.35, limit: 638350 },
            { rate: 0.37, limit: Infinity }
        ]}
    };
    const info = taxData2026
        ? (taxData2026[status] || taxData2026.single)
        : (FALLBACK_2026[status] || FALLBACK_2026.single);

    const taxableIncome = Math.max(0, grossAnnual - preTaxDeductionsAnnual - info.stdDeduction);
    let fedTax = 0;
    let prev = 0;
    for (const b of info.brackets) {
        if (taxableIncome <= prev) break;
        fedTax += Math.min(taxableIncome - prev, b.limit - prev) * b.rate;
        prev = b.limit;
    }
    
    const limit = taxData2026 ? taxData2026.ficaWageBase : 176100;
    const fica = Math.min(grossAnnual, limit) * 0.062;
    const medicareSurtaxThreshold = status === 'mfj' ? 250000 : 200000;
    const medicare = grossAnnual * 0.0145 + Math.max(0, grossAnnual - medicareSurtaxThreshold) * 0.009;
    const stateTax = (grossAnnual - preTaxDeductionsAnnual) * AVG_STATE_TAX_RATE;

    return { fedTax, fica, medicare, stateTax, total: fedTax + fica + medicare + stateTax };
}

function getThresholds() {
    return benchmarkData?.thresholds || DEFAULT_THRESHOLDS;
}

function getWeights() {
    return benchmarkData?.scoringWeights || DEFAULT_WEIGHTS;
}

function getAgeBand(age) {
    const bands = benchmarkData?.ageBands || [];
    if (!bands.length) return null;
    const exact = bands.find(b => age >= b.minAge && age <= b.maxAge);
    if (exact) return exact;
    if (age < bands[0].minAge) return bands[0];
    return bands[bands.length - 1];
}

function getBenchmarkMetric(ageBand, key) {
    return ageBand?.benchmarks?.[key] || null;
}

function countConfiguredBenchmarks(ageBand) {
    if (!ageBand?.benchmarks) return 0;
    return Object.values(ageBand.benchmarks).filter(metric => (metric?.median || 0) > 0 || (metric?.average || 0) > 0).length;
}

function averageScores(items, fallback = 50) {
    const valid = items.filter(item => typeof item.score === 'number' && !Number.isNaN(item.score));
    if (!valid.length) return fallback;
    const totalWeight = valid.reduce((sum, item) => sum + (item.weight || 1), 0);
    return valid.reduce((sum, item) => sum + item.score * (item.weight || 1), 0) / totalWeight;
}

function scorePositiveThreshold(value, cfg) {
    if (!cfg) return null;
    const minimum = cfg.minimum ?? cfg.healthy ?? 0;
    const strong = cfg.strong ?? cfg.target ?? minimum;
    const excellent = cfg.excellent ?? strong;

    if (value >= excellent) return 100;
    if (value >= strong) {
        return 80 + 20 * clamp(safeDivide(value - strong, (excellent - strong) || 1), 0, 1);
    }
    if (value >= minimum) {
        return 55 + 25 * clamp(safeDivide(value - minimum, (strong - minimum) || 1), 0, 1);
    }
    return clamp(55 * safeDivide(value, minimum || 1), 0, 55);
}

function scoreNegativeThreshold(value, cfg) {
    if (!cfg) return null;
    const healthy = cfg.healthy ?? 0;
    const stretch = cfg.stretch ?? healthy;
    const danger = cfg.danger ?? stretch;

    if (value <= healthy) return 100;
    if (value <= stretch) {
        return 75 + 25 * clamp(safeDivide(stretch - value, (stretch - healthy) || 1), 0, 1);
    }
    if (value <= danger) {
        return 35 + 40 * clamp(safeDivide(danger - value, (danger - stretch) || 1), 0, 1);
    }
    return Math.max(0, 35 - 35 * safeDivide(value - danger, danger || 1));
}

function scoreBenchmarkHigher(value, metric) {
    const median = parseNumber(metric?.median);
    const average = parseNumber(metric?.average);
    if (!median && !average) return null;

    const floorRef = median || average;
    const upperRef = average > median ? average : floorRef * 1.35;

    if (value >= upperRef) return 100;
    if (value >= floorRef) {
        return 70 + 30 * clamp(safeDivide(value - floorRef, (upperRef - floorRef) || 1), 0, 1);
    }
    return clamp(70 * safeDivide(value, floorRef || 1), 0, 70);
}

function scoreBenchmarkLower(value, metric) {
    const median = parseNumber(metric?.median);
    const average = parseNumber(metric?.average);
    if (!median && !average) return null;

    const good = median || average * 0.85;
    const caution = Math.max(average || good * 1.25, good * 1.1);

    if (value <= good) return 100;
    if (value <= caution) {
        return 70 + 30 * clamp(safeDivide(caution - value, (caution - good) || 1), 0, 1);
    }
    return Math.max(0, 70 - 70 * safeDivide(value - caution, caution || 1));
}

function scoreTargetMultiple(value, target) {
    if (!target) return null;
    if (value >= target) {
        return 85 + 15 * clamp(safeDivide(value - target, target * 0.5 || 1), 0, 1);
    }
    return clamp(85 * safeDivide(value, target), 0, 85);
}

function scoreCreditScore(value, cfg) {
    if (!value) return null;
    return scorePositiveThreshold(value, cfg);
}

function statusFromNormalized(normalized) {
    if (normalized === null || normalized === undefined || Number.isNaN(normalized)) {
        return { label: 'JSON needed', className: 'muted' };
    }
    if (normalized >= 130) return { label: 'Well above median', className: 'good' };
    if (normalized >= 105) return { label: 'Above median', className: 'good' };
    if (normalized >= 95) return { label: 'Around median', className: 'warn' };
    if (normalized >= 70) return { label: 'Below median', className: 'warn' };
    return { label: 'Far below median', className: 'risk' };
}

function collectProfile() {
    const age = parseInt(getEl('age')?.value, 10) || 0;
    const grossIncomeInput = num('annualGrossIncome') + num('annualBonus');
    const takeHomeInput = num('monthlyTakeHome');
    
    // Pre-tax contributions (e.g. traditional 401k) reduce taxable income.
    // Roth contributions do NOT reduce taxable income — they come out after tax.
    const monthlyRoth   = num('monthlyRothContrib');
    const monthlyPreTax = num('monthlyRetirementContrib') + num('monthlyOtherPreTax');


    // Estimate Gross (mirrors budget script Mode B):
    //   Take-home already has both pre-tax and Roth removed.
    //   Add Roth back in before grossing up the taxable portion, then
    //   add pre-tax deductions back on top.
    const grossIncome = grossIncomeInput > 0
        ? grossIncomeInput
        : (takeHomeInput > 0
            ? (((takeHomeInput + monthlyRoth) / (1 - 0.28)) + monthlyPreTax) * 12
            : 0);

    let takeHomeMonthly;
    if (takeHomeInput > 0) {
        takeHomeMonthly = takeHomeInput;
    } else if (grossIncome > 0) {
        // Only pre-tax deductions reduce taxable income; Roth is an after-tax outflow.
        const preTaxAnnual = monthlyPreTax * 12;
        const rothAnnual   = monthlyRoth   * 12;

        // estimateTax returns { fedTax, fica, medicare, stateTax, total }
        // .total already bundles all four — do not add fica/state a second time.
        const taxes = estimateTax(grossIncome, preTaxAnnual, getEl('filingStatus')?.value || 'single');

        // Take-home = Gross − taxes − pre-tax deductions − Roth (after-tax outflow)
        takeHomeMonthly = Math.max(0, (grossIncome - taxes.total - preTaxAnnual - rothAnnual) / 12);
    } else {
        takeHomeMonthly = 0;
    }
    const takeHomeEstimated = takeHomeInput <= 0 && grossIncome > 0;
    const grossEstimated    = grossIncomeInput <= 0 && takeHomeInput > 0;

    const profile = {
        age,
        filingStatus: getEl('filingStatus')?.value || 'single',
        householdSize: parseInt(getEl('householdSize')?.value, 10) || 1,
        dependents: parseInt(getEl('dependents')?.value, 10) || 0,
        homeStatus: getEl('homeStatus')?.value || 'rent',
        grossIncome,
        takeHomeMonthly,
        takeHomeAnnual: takeHomeMonthly * 12,
        takeHomeEstimated,
        grossEstimated,

        monthlyHousing: num('monthlyHousing'),
        monthlyCoreSpending: num('monthlyCoreSpending'),
        monthlyFlexibleSpending: num('monthlyFlexibleSpending'),

        checkingSavings: num('checkingSavings'),
        emergencyFund: num('emergencyFund'),
        retirementAccounts: num('retirementAccounts'),
        taxableInvestments: num('taxableInvestments'),
        hsaBalance: num('hsaBalance'),
        collegeSavings: num('collegeSavings'),
        homeValue: num('homeValue'),
        mortgageBalance: num('mortgageBalance'),
        otherAssets: num('otherAssets'),

        monthlyRetirementContrib: monthlyPreTax,
        monthlyRothContrib: monthlyRoth,
        monthlyEmployerMatch: num('monthlyEmployerMatch'),
        monthlyTaxableInvesting: num('monthlyTaxableInvesting'),
        monthlyEmergencySaving: num('monthlyEmergencySaving'),

        creditCardBalance: num('creditCardBalance'),
        creditCardPayment: num('creditCardPayment'),
        creditCardLimit: num('creditCardLimit'),
        creditCardAPR: num('creditCardAPR'),
        studentLoanBalance: num('studentLoanBalance'),
        studentLoanPayment: num('studentLoanPayment'),
        autoLoanBalance: num('autoLoanBalance'),
        autoLoanPayment: num('autoLoanPayment'),
        personalLoanBalance: num('personalLoanBalance'),
        personalLoanPayment: num('personalLoanPayment'),
        otherDebtBalance: num('otherDebtBalance'),
        otherDebtPayment: num('otherDebtPayment'),

        creditScore: parseInt(getEl('creditScore')?.value, 10) || 0,
        capturesEmployerMatch: getEl('capturesEmployerMatch')?.value || 'yes',
        hasHealthInsurance: isChecked('hasHealthInsurance'),
        hasDisabilityInsurance: isChecked('hasDisabilityInsurance'),
        hasLifeInsurance: isChecked('hasLifeInsurance'),
        hasWill: isChecked('hasWill'),
        hasBeneficiaries: isChecked('hasBeneficiaries')
    };

    profile.minimumDebtPayments =
        profile.creditCardPayment +
        profile.studentLoanPayment +
        profile.autoLoanPayment +
        profile.personalLoanPayment +
        profile.otherDebtPayment;

    profile.coreMonthlyExpenses =
        profile.monthlyHousing +
        profile.monthlyCoreSpending +
        profile.minimumDebtPayments;

    profile.totalMonthlySpending =
        profile.coreMonthlyExpenses +
        profile.monthlyFlexibleSpending;

    profile.plannedSavingMonthly =
        profile.monthlyRetirementContrib +
        profile.monthlyRothContrib +
        profile.monthlyEmployerMatch +
        profile.monthlyTaxableInvesting +
        profile.monthlyEmergencySaving;

    // Employer match never hits the employee's take-home, so exclude it
    // from the surplus calculation. Keep it in plannedSavingMonthly for
    // savings rate and retirement contribution rate (it IS building wealth).
    const employeeSavingMonthly =
        profile.monthlyRetirementContrib +
        profile.monthlyRothContrib +
        profile.monthlyTaxableInvesting +
        profile.monthlyEmergencySaving;

    profile.monthlySurplus = profile.takeHomeMonthly - profile.totalMonthlySpending - employeeSavingMonthly;
    profile.monthlySurplusRatio = safeDivide(profile.monthlySurplus, profile.takeHomeMonthly);
    profile.liquidCash = profile.checkingSavings + profile.emergencyFund;
    profile.homeEquity = Math.max(0, profile.homeValue - profile.mortgageBalance);
    profile.investmentAssets =
        profile.retirementAccounts +
        profile.taxableInvestments +
        profile.hsaBalance +
        profile.collegeSavings;
    profile.totalAssets = profile.liquidCash + profile.investmentAssets + profile.homeEquity + profile.otherAssets;
    profile.consumerDebtBalance = profile.creditCardBalance + profile.personalLoanBalance;
    profile.totalDebtBalance =
        profile.consumerDebtBalance +
        profile.studentLoanBalance +
        profile.autoLoanBalance +
        profile.otherDebtBalance +
        profile.mortgageBalance;
    profile.netWorth = profile.totalAssets - profile.totalDebtBalance;

    const grossMonthly = profile.grossIncome / 12;
    profile.housingRatio = safeDivide(profile.monthlyHousing, grossMonthly);
    profile.fixedObligationRatio = safeDivide(profile.monthlyHousing + profile.minimumDebtPayments, grossMonthly);
    profile.consumerDebtToIncome = safeDivide(profile.consumerDebtBalance, profile.grossIncome);
    profile.creditUtilization = profile.creditCardLimit > 0 ? profile.creditCardBalance / profile.creditCardLimit : null;
    profile.emergencyFundMonths = safeDivide(profile.liquidCash, profile.coreMonthlyExpenses);
    profile.savingsRate = safeDivide(profile.plannedSavingMonthly * 12, profile.grossIncome);
    profile.retirementContributionRate = safeDivide((profile.monthlyRetirementContrib + profile.monthlyRothContrib + profile.monthlyEmployerMatch) * 12, profile.grossIncome);
    profile.investingRate = safeDivide((profile.monthlyRetirementContrib + profile.monthlyRothContrib + profile.monthlyEmployerMatch + profile.monthlyTaxableInvesting) * 12, profile.grossIncome);
    profile.retirementMultiple = safeDivide(profile.retirementAccounts, profile.grossIncome);
    profile.investableMultiple = safeDivide(profile.investmentAssets, profile.grossIncome);
    profile.netWorthMultiple = safeDivide(profile.netWorth, profile.grossIncome);

    // ── Profile Completeness ───────────────────────────────────────────────────
    // Measures how much of the financial picture the tool actually has.
    // Three design rules:
    //   1. Context-filter: home fields excluded for renters; college savings
    //      excluded when dependents = 0. Irrelevant blanks don't count against.
    //   2. Slot collapsing: income (gross OR take-home) counts as 1 slot, not 2.
    //      Debt collapses to 1 slot so a debt-free user loses at most ~5%,
    //      not ~26% from 12 blank fields.
    //   3. Checkboxes excluded entirely from the denominator. Unchecked means
    //      "no" — a valid answer — not a missing answer. The scoring engine
    //      reads them directly and handles the "no" case correctly already.
    //
    // Optional/zero-valid fields (bonus, HSA, Roth, other assets, contribution
    // companions) are also excluded: blank and $0 are indistinguishable, so
    // they should never penalize a user who legitimately has none.

    // Core fields where a blank IS meaningfully different from zero
    const CORE_FIELDS = [
        'age', 'filingStatus', 'homeStatus', 'householdSize', 'dependents',
        'monthlyHousing', 'monthlyCoreSpending', 'monthlyFlexibleSpending',
        'checkingSavings', 'emergencyFund',
        'retirementAccounts', 'taxableInvestments',
        'monthlyRetirementContrib',
        'creditScore', 'capturesEmployerMatch'
    ];

    // Contextual fields — only added to the denominator when they apply
    const contextFields = [];
    if (profile.homeStatus === 'own') {
        contextFields.push('homeValue', 'mortgageBalance');
    }
    if (profile.dependents > 0) {
        contextFields.push('collegeSavings');
    }

    const measuredFields = [...CORE_FIELDS, ...contextFields];

    const fieldsFilled = measuredFields.filter(id => {
        const el = getEl(id);
        if (!el) return false;
        return String(el.value || '').trim() !== '';
    }).length;

    // Income slot — either gross salary or monthly take-home satisfies it
    const incomeFilled = (
        (getEl('annualGrossIncome')?.value || '').trim() !== '' ||
        (getEl('monthlyTakeHome')?.value || '').trim() !== ''
    ) ? 1 : 0;

    // Debt slot — any balance field entered means the debt section is answered.
    // Leaving all blank is treated as "no debt entered" (~5% dock), not 12 docks.
    const debtFilled = ['creditCardBalance', 'studentLoanBalance',
        'autoLoanBalance', 'personalLoanBalance', 'otherDebtBalance'
    ].some(id => (getEl(id)?.value || '').trim() !== '') ? 1 : 0;

    // Total possible slots: measured individual fields + income slot + debt slot
    const totalSlots = measuredFields.length + 2;
    profile.completeness = safeDivide(
        fieldsFilled + incomeFilled + debtFilled,
        totalSlots
    );

    return profile;
}

function computeProtectionScore(profile, thresholds) {
    let points = 0;
    let total = 0;

    function addScore(condition, weight, partial = 0) {
        total += weight;
        points += condition ? weight : partial;
    }

    addScore(profile.hasHealthInsurance, 20);
    addScore(profile.hasDisabilityInsurance, 15);
    if (profile.dependents > 0) addScore(profile.hasLifeInsurance, 15);
    addScore(profile.hasWill, 15);
    addScore(profile.hasBeneficiaries, 15);

    total += 12;
    if (profile.capturesEmployerMatch === 'yes') points += 12;
    else if (profile.capturesEmployerMatch === 'partial' || profile.capturesEmployerMatch === 'none') points += 6;

    const creditScoreScore = scoreCreditScore(profile.creditScore, thresholds.creditScore);
    total += 23;
    points += typeof creditScoreScore === 'number' ? (creditScoreScore / 100) * 23 : 11.5;

    return total ? (points / total) * 100 : 50;
}

function buildBenchmarkRow(label, value, metric, direction, formatter) {
    const median = parseNumber(metric?.median);
    const average = parseNumber(metric?.average);
    const hasBenchmark = median > 0 || average > 0;
    const baseline = median || average || 0;
    let normalized = null;

    if (hasBenchmark && baseline > 0) {
        if (direction === 'higher') {
            normalized = clamp((value / baseline) * 100, 0, 200);
        } else {
            normalized = value <= 0 ? 200 : clamp((baseline / value) * 100, 0, 200);
        }
    }

    const status = statusFromNormalized(normalized);

    return {
        label,
        value,
        median,
        average,
        hasBenchmark,
        normalized,
        direction,
        formatter,
        userText: formatter(value),
        medianText: median > 0 ? formatter(median) : '--',
        averageText: average > 0 ? formatter(average) : '--',
        statusLabel: status.label,
        statusClass: status.className
    };
}

function buildBenchmarkRows(profile, ageBand) {
    const rows = [
        buildBenchmarkRow('Annual Income', profile.grossIncome, getBenchmarkMetric(ageBand, 'annualIncome'), 'higher', money),
        buildBenchmarkRow('Take-Home Pay', profile.takeHomeAnnual, getBenchmarkMetric(ageBand, 'takeHomePayAnnual'), 'higher', money),
        buildBenchmarkRow('Retirement Savings', profile.retirementAccounts, getBenchmarkMetric(ageBand, 'retirementSavings'), 'higher', money),
        buildBenchmarkRow('Non-Retirement Investments', profile.taxableInvestments, getBenchmarkMetric(ageBand, 'taxableInvestments'), 'higher', money),
        buildBenchmarkRow('Emergency Fund Balance', profile.liquidCash, getBenchmarkMetric(ageBand, 'emergencyFundBalance'), 'higher', money),
        buildBenchmarkRow('Net Worth', profile.netWorth, getBenchmarkMetric(ageBand, 'netWorth'), 'higher', money),
        buildBenchmarkRow('Consumer Debt', profile.consumerDebtBalance, getBenchmarkMetric(ageBand, 'consumerDebtBalance'), 'lower', money),
        buildBenchmarkRow('Savings Rate', profile.savingsRate, getBenchmarkMetric(ageBand, 'savingsRate'), 'higher', value => percent(value))
    ];

    if (profile.homeStatus === 'own') {
        rows.push(buildBenchmarkRow('Home Equity', profile.homeEquity, getBenchmarkMetric(ageBand, 'homeEquity'), 'higher', money));
    }

    return rows;
}

function buildMilestones(profile, ageBand, thresholds) {
    const targets = ageBand?.targets || {};
    const items = [
        {
            label: 'Retirement Multiple',
            current: profile.retirementMultiple,
            target: targets.retirementMultipleOfIncome || 0,
            valueText: multiple(profile.retirementMultiple),
            targetText: `Target ${multiple(targets.retirementMultipleOfIncome || 0)}`
        },
        {
            label: 'Net Worth Multiple',
            current: profile.netWorthMultiple,
            target: targets.netWorthMultipleOfIncome || 0,
            valueText: multiple(profile.netWorthMultiple),
            targetText: `Target ${multiple(targets.netWorthMultipleOfIncome || 0)}`
        },
        {
            label: 'Investable Assets',
            current: profile.investableMultiple,
            target: targets.investableAssetsMultipleOfIncome || 0,
            valueText: multiple(profile.investableMultiple),
            targetText: `Target ${multiple(targets.investableAssetsMultipleOfIncome || 0)}`
        },
        {
            label: 'Emergency Fund',
            current: profile.emergencyFundMonths,
            target: targets.emergencyFundMonths || thresholds.emergencyFundMonths.strong,
            valueText: `${profile.emergencyFundMonths.toFixed(1)} mo`,
            targetText: `Target ${(targets.emergencyFundMonths || thresholds.emergencyFundMonths.strong).toFixed(1)} mo`
        }
    ];

    return items.map(item => {
        const ratioToTarget = item.target > 0 ? item.current / item.target : 0;
        let className = 'risk';
        if (ratioToTarget >= 1) className = 'good';
        else if (ratioToTarget >= 0.75) className = 'warn';
        return { ...item, className };
    });
}

function buildComparisonChips(rows) {
    const chipRows = rows.filter(row => row.hasBenchmark && row.normalized !== null).slice(0, 5);
    return chipRows.map(row => {
        if (row.direction === 'higher') {
            const delta = row.median > 0 ? ((row.value / row.median) - 1) * 100 : 0;
            const sign = delta >= 0 ? '+' : '';
            return {
                text: `${row.label}: ${sign}${Math.round(delta)}% vs median`,
                className: row.statusClass
            };
        }

        if (row.value <= 0) {
            return { text: `${row.label}: no balance`, className: 'good' };
        }

        const debtDelta = row.median > 0 ? ((row.value / row.median) - 1) * 100 : 0;
        const label = debtDelta <= 0
            ? `${row.label}: ${Math.round(Math.abs(debtDelta))}% lower than median`
            : `${row.label}: ${Math.round(debtDelta)}% higher than median`;

        return {
            text: label,
            className: debtDelta <= 0 ? 'good' : 'risk'
        };
    });
}

function buildStrengths(profile, categories, benchmarkRows) {
    const strengths = [];
    const sortedCategories = [...categories].sort((a, b) => b.score - a.score);

    if (profile.emergencyFundMonths >= 6) {
        strengths.push({
            title: 'Strong cash buffer',
            body: `You have about ${profile.emergencyFundMonths.toFixed(1)} months of core expenses in liquid cash, which gives your plan room to absorb shocks without going backward.`,
            className: 'good'
        });
    }

    if (profile.consumerDebtBalance <= 0 && profile.creditCardBalance <= 0) {
        strengths.push({
            title: 'Low consumer debt drag',
            body: 'You are not carrying revolving or personal consumer debt that would normally tax your monthly cash flow and slow wealth building.',
            className: 'good'
        });
    }

    if (profile.retirementContributionRate >= 0.15) {
        strengths.push({
            title: 'Healthy retirement saving habit',
            body: `Your retirement contribution rate is around ${percent(profile.retirementContributionRate)}, which is a strong long-term habit even before market growth does its job.`,
            className: 'good'
        });
    }

    const netWorthRow = benchmarkRows.find(row => row.label === 'Net Worth');
    if (netWorthRow?.hasBenchmark && netWorthRow.normalized >= 105) {
        strengths.push({
            title: 'Net worth is ahead of your age median',
            body: 'Your balance sheet is already running ahead of the median for your age band, which gives you optionality on future goals and shocks.',
            className: 'good'
        });
    }

    sortedCategories.slice(0, 3).forEach(category => {
        if (strengths.length >= 4 || category.score < 70) return;
        strengths.push({
            title: `${category.label} is holding up well`,
            body: CATEGORY_DESCRIPTIONS[category.key],
            className: category.score >= 85 ? 'good' : 'warn'
        });
    });

    return strengths.slice(0, 4);
}

function buildActionPlan(profile, ageBand, thresholds) {
    const actions = [];
    const targets = ageBand?.targets || {};

    function addAction(key, priority, title, body) {
        if (actions.some(item => item.key === key)) return;
        actions.push({ key, priority, title, body });
    }

    if (profile.monthlySurplus < 0) {
        addAction(
            'surplus',
            'risk',
            'Close the monthly cash-flow gap',
            `You are running about ${money(Math.abs(profile.monthlySurplus))} short each month after core outflows and planned saving. Tightening fixed costs, flexible spending, or planned contributions would restore breathing room fastest.`
        );
    }

    const emergencyTarget = targets.emergencyFundMonths || thresholds.emergencyFundMonths.strong;
    if (profile.emergencyFundMonths < thresholds.emergencyFundMonths.minimum) {
        const targetCash = profile.coreMonthlyExpenses * emergencyTarget;
        addAction(
            'emergency',
            'risk',
            'Build a bigger cash runway',
            `Your liquid cash covers roughly ${profile.emergencyFundMonths.toFixed(1)} months of core expenses. A stronger buffer here is about ${money(Math.max(0, targetCash - profile.liquidCash))} away.`
        );
    }

    if (profile.creditCardBalance > 0 && (profile.creditCardAPR >= 15 || (profile.creditUtilization || 0) > thresholds.creditUtilization.stretch)) {
        addAction(
            'credit-card',
            'risk',
            'Attack revolving debt first',
            `Credit card debt at roughly ${profile.creditCardAPR ? profile.creditCardAPR.toFixed(1) : 'high'}% APR and ${percent(profile.creditUtilization || 0)} utilization is likely destroying wealth faster than your investments can build it.`
        );
    }

    if (profile.fixedObligationRatio > thresholds.fixedObligationRatio.stretch || profile.housingRatio > thresholds.housingRatio.stretch) {
        addAction(
            'fixed-costs',
            'warn',
            'Lower fixed obligations',
            `Housing plus minimum debt payments are taking about ${percent(profile.fixedObligationRatio)} of gross income. That leaves too little flexibility for saving, investing, and absorbing surprises.`
        );
    }

    if (profile.capturesEmployerMatch === 'no' || profile.capturesEmployerMatch === 'partial') {
        addAction(
            'match',
            'warn',
            'Capture more of the employer match',
            'If your employer offers matching dollars and you are not collecting all of it, part of your compensation is being left on the table.'
        );
    }

    if (profile.retirementContributionRate < thresholds.retirementContributionRate.strong) {
        const targetMonthly = Math.max(0, ((profile.grossIncome * thresholds.retirementContributionRate.strong) / 12) - (profile.monthlyRetirementContrib + profile.monthlyRothContrib + profile.monthlyEmployerMatch));
        addAction(
            'retirement-rate',
            'warn',
            'Raise retirement saving rate',
            `Your retirement saving rate is about ${percent(profile.retirementContributionRate)}. Adding about ${money(targetMonthly)} per month would move you toward a stronger long-term pace.`
        );
    }

    if (!profile.hasHealthInsurance) {
        addAction(
            'health-insurance',
            'risk',
            'Protect against catastrophic medical risk',
            'One uninsured medical event can erase years of progress. Health coverage should come before most optimization moves.'
        );
    }

    if (profile.dependents > 0 && !profile.collegeSavings) {
        addAction(
            'college savings',
            'risk',
            'Add college savings for dependents',
            'College is expensive. Saving for your dependents now will help you later.'
        );
    }

    if (profile.dependents > 0 && profile.collegeSavings <= 25000) {
        addAction(
            'college savings',
            'warn',
            'Add more college savings for dependents',
            'College is expensive. Saving for your dependents now will help you later.'
        );
    }

    if (profile.dependents > 0 && !profile.hasLifeInsurance) {
        addAction(
            'life-insurance',
            'warn',
            'Add income protection for dependents',
            'If other people rely on your income, term life insurance is one of the cheapest ways to protect their financial stability.'
        );
    }

    if (!profile.hasWill || !profile.hasBeneficiaries) {
        addAction(
            'estate-basics',
            'warn',
            'Handle estate basics',
            'A simple will and up-to-date account beneficiaries are low effort and high value, especially if you own a home or have dependents.'
        );
    }

    if (!actions.length) {
        addAction(
            'maintain',
            'good',
            'Keep compounding the good habits',
            'There are no obvious alarms in the current profile. The biggest win now is consistency: keep saving, keep investing, and keep fixed costs from creeping upward.'
        );
    }

    const order = { risk: 0, warn: 1, good: 2 };
    return actions.sort((a, b) => order[a.priority] - order[b.priority]).slice(0, 5);
}

function evaluateProfile(profile) {
    const thresholds = getThresholds();
    const weights = getWeights();
    const ageBand = getAgeBand(profile.age);
    const targets = ageBand?.targets || {};

    const incomeScore = averageScores([
        { score: scoreBenchmarkHigher(profile.grossIncome, getBenchmarkMetric(ageBand, 'annualIncome')), weight: 65 },
        { score: scoreBenchmarkHigher(profile.takeHomeAnnual, getBenchmarkMetric(ageBand, 'takeHomePayAnnual')), weight: 35 }
    ], 50);

    const cashFlowScore = averageScores([
        { score: scorePositiveThreshold(profile.monthlySurplusRatio, thresholds.monthlySurplusRatio), weight: 60 },
        { score: scorePositiveThreshold(profile.savingsRate, thresholds.savingsRate), weight: 40 }
    ], 50);

    const emergencyFundScore = averageScores([
        { score: scorePositiveThreshold(profile.emergencyFundMonths, thresholds.emergencyFundMonths), weight: 65 },
        { score: scoreBenchmarkHigher(profile.liquidCash, getBenchmarkMetric(ageBand, 'emergencyFundBalance')), weight: 35 }
    ], 50);

    const retirementReadinessScore = averageScores([
        { score: scoreTargetMultiple(profile.retirementMultiple, targets.retirementMultipleOfIncome), weight: 35 },
        { score: scoreBenchmarkHigher(profile.retirementAccounts, getBenchmarkMetric(ageBand, 'retirementSavings')), weight: 35 },
        {
            score: averageScores([
                { score: scorePositiveThreshold(profile.retirementContributionRate, thresholds.retirementContributionRate), weight: 60 },
                { score: scoreBenchmarkHigher(profile.retirementContributionRate, getBenchmarkMetric(ageBand, 'retirementContributionRate')), weight: 40 }
            ], 50),
            weight: 30
        }
    ], 50);

    const investingScore = averageScores([
        { score: scoreBenchmarkHigher(profile.taxableInvestments, getBenchmarkMetric(ageBand, 'taxableInvestments')), weight: 40 },
        { score: scoreTargetMultiple(profile.investableMultiple, targets.investableAssetsMultipleOfIncome), weight: 30 },
        {
            score: averageScores([
                { score: scorePositiveThreshold(profile.investingRate, thresholds.investingRate), weight: 60 },
                { score: scoreBenchmarkHigher(profile.investingRate, getBenchmarkMetric(ageBand, 'investingRate')), weight: 40 }
            ], 50),
            weight: 30
        }
    ], 50);

    const netWorthScore = averageScores([
        { score: scoreBenchmarkHigher(profile.netWorth, getBenchmarkMetric(ageBand, 'netWorth')), weight: 60 },
        { score: scoreTargetMultiple(profile.netWorthMultiple, targets.netWorthMultipleOfIncome), weight: 40 }
    ], 50);

    const debtManagementScore = averageScores([
        { score: scoreNegativeThreshold(profile.fixedObligationRatio, thresholds.fixedObligationRatio), weight: 30 },
        { score: scoreNegativeThreshold(profile.housingRatio, thresholds.housingRatio), weight: 15 },
        { score: scoreNegativeThreshold(profile.consumerDebtToIncome, thresholds.consumerDebtToIncome), weight: 20 },
        { score: scoreBenchmarkLower(profile.consumerDebtBalance, getBenchmarkMetric(ageBand, 'consumerDebtBalance')), weight: 20 },
        { score: profile.creditUtilization !== null ? scoreNegativeThreshold(profile.creditUtilization, thresholds.creditUtilization) : 50, weight: 15 }
    ], 50);

    const protectionAndPlanningScore = computeProtectionScore(profile, thresholds);

    const rawCategories = [
        { key: 'income', label: 'Income', score: incomeScore, weight: weights.income },
        { key: 'cashFlow', label: 'Cash Flow', score: cashFlowScore, weight: weights.cashFlow },
        { key: 'emergencyFund', label: 'Emergency Fund', score: emergencyFundScore, weight: weights.emergencyFund },
        { key: 'retirementReadiness', label: 'Retirement', score: retirementReadinessScore, weight: weights.retirementReadiness },
        { key: 'investing', label: 'Investing', score: investingScore, weight: weights.investing },
        { key: 'netWorth', label: 'Net Worth', score: netWorthScore, weight: weights.netWorth },
        { key: 'debtManagement', label: 'Debt', score: debtManagementScore, weight: weights.debtManagement },
        { key: 'protectionAndPlanning', label: 'Protection', score: protectionAndPlanningScore, weight: weights.protectionAndPlanning }
    ];

    const totalWeight = rawCategories.reduce((sum, category) => sum + category.weight, 0) || 100;
    const categories = rawCategories.map(category => ({
        ...category,
        score: Math.round(category.score),
        weightedPoints: (category.score * category.weight) / totalWeight,
        description: CATEGORY_DESCRIPTIONS[category.key]
    }));

    const overallScore = Math.round(categories.reduce((sum, category) => sum + category.weightedPoints, 0));
    let grade = 'A';
    let statusLabel = 'Exceptional';
    let statusClass = 'status-strong';

    if (overallScore < 60) {
        grade = 'F';
        statusLabel = 'At Risk';
        statusClass = 'status-risk';
    } else if (overallScore < 70) {
        grade = 'D';
        statusLabel = 'Needs Attention';
        statusClass = 'status-watch';
    } else if (overallScore < 80) {
        grade = 'C';
        statusLabel = 'Stable';
        statusClass = 'status-stable';
    } else if (overallScore < 90) {
        grade = 'B';
        statusLabel = 'Strong';
        statusClass = 'status-strong';
    }

    const benchmarkRows = buildBenchmarkRows(profile, ageBand);
    const comparisonChips = buildComparisonChips(benchmarkRows);
    const strengths = buildStrengths(profile, categories, benchmarkRows);
    const actions = buildActionPlan(profile, ageBand, thresholds);
    const milestones = buildMilestones(profile, ageBand, thresholds);

    const strongest = [...categories].sort((a, b) => b.score - a.score).slice(0, 2);
    const weakest = [...categories].sort((a, b) => a.score - b.score).slice(0, 2);
    const configuredBenchmarks = countConfiguredBenchmarks(ageBand);

    const benchmarkYear = benchmarkData?.meta?.benchmarkYear || 'Unknown';
    let benchmarkNotice = `Using the ${ageBand?.label || 'closest'} age band data from the ${benchmarkYear} Consensus.`;
    if (!configuredBenchmarks) {
        benchmarkNotice = 'The current benchmark JSON still contains placeholders, so peer comparison rows will stay muted until you add real median and average values.';
    } else if (configuredBenchmarks < 6) {
        benchmarkNotice = `Only ${configuredBenchmarks} benchmark metrics are configured in the JSON right now, so the peer comparison is partially complete.`;
    }

    let summaryTitle = 'You are operating from a position of strength.';
    if (grade === 'B') summaryTitle = 'Strong base with a few upgrade points.';
    if (grade === 'C') summaryTitle = 'Solid start, but the system needs tightening.';
    if (grade === 'D') summaryTitle = 'Several money systems need attention.';
    if (grade === 'F') summaryTitle = 'The current setup is under pressure.';

    let indicatorClass = 'good';
    if (overallScore < 70) indicatorClass = 'risk';
    else if (overallScore < 80) indicatorClass = 'warn';

    const summaryIndicatorText =
        `Your strongest areas are ${strongest.map(item => item.label.toLowerCase()).join(' and ')}, ` +
        `while ${weakest.map(item => item.label.toLowerCase()).join(' and ')} are the biggest drags on the score.`;

    const summaryText = '';
    
        let indicatorText = summaryIndicatorText;
    if (profile.monthlySurplus < 0) {
        indicatorText += ` Right now your cash flow is short by about ${money(Math.abs(profile.monthlySurplus))} per month.`;
    } else if (profile.emergencyFundMonths < thresholds.emergencyFundMonths.minimum) {
        indicatorText += ` Cash reserves are thin at ${profile.emergencyFundMonths.toFixed(1)} months of core expenses.`;
    } else if (profile.creditCardBalance > 0 && profile.creditCardAPR >= 15) {
        indicatorText += ` High-interest debt is still expensive enough to deserve front-of-line attention.`;
    }

    return {
        profile,
        ageBand,
        categories,
        overallScore,
        grade,
        statusLabel,
        statusClass,
        benchmarkRows,
        comparisonChips,
        strengths,
        actions,
        milestones,
        benchmarkNotice,
        configuredBenchmarks,
        summaryTitle,
        summaryText: profile.takeHomeEstimated ? `${summaryText} Net take-home was estimated from gross income.`
                   : profile.grossEstimated    ? `${summaryText} Gross income was estimated from take-home pay.`
                   : summaryText,
        indicatorText,
        indicatorClass
    };
}

function renderScoreRows(categories) {
    return categories.map(category => `
        <div class="score-row">
            <div class="score-row-top">
                <div>
                    <div class="score-row-label">${category.label}</div>
                    <div class="score-row-meta">${category.weight} pts weight</div>
                </div>
                <div class="score-row-value">${category.score}/100</div>
            </div>
            <div class="score-bar">
                <div class="score-bar-fill" style="width:${category.score}%"></div>
            </div>
            <div class="score-row-sub">${category.description}</div>
        </div>
    `).join('');
}

function renderBenchmarkTable(rows) {
    return rows.map(row => `
        <tr>
            <td>${row.label}</td>
            <td>${row.userText}</td>
            <td>${row.medianText}</td>
            <td>${row.averageText}</td>
            <td class="benchmark-status ${row.statusClass}">${row.statusLabel}</td>
        </tr>
    `).join('');
}

function renderPriorityList(items) {
    return items.map((item, index) => `
        <div class="priority-item ${item.priority === 'risk' ? 'risk' : item.priority === 'warn' ? 'warn' : ''}">
            <div class="priority-num">${index + 1}</div>
            <div class="priority-text">
                <strong>${item.title}</strong>
                <p>${item.body}</p>
            </div>
        </div>
    `).join('');
}

function renderStrengthList(items) {
    return items.map((item, index) => `
        <div class="feedback-item ${item.className}">
            <div class="feedback-badge">${index + 1}</div>
            <div class="feedback-copy">
                <strong>${item.title}</strong>
                <p>${item.body}</p>
            </div>
        </div>
    `).join('');
}

function renderMilestones(items) {
    return items.map(item => `
        <div class="milestone-card ${item.className}">
            <div class="milestone-label">${item.label}</div>
            <div class="milestone-value">${item.valueText}</div>
            <div class="milestone-sub">${item.targetText}</div>
        </div>
    `).join('');
}

function renderChips(items) {
    return items.map(item => `<span class="chip ${item.className}">${item.text}</span>`).join('');
}

function destroyCharts() {
    if (scoreBreakdownChart) {
        scoreBreakdownChart.destroy();
        scoreBreakdownChart = null;
    }
    if (benchmarkChart) {
        benchmarkChart.destroy();
        benchmarkChart = null;
    }
}

function renderCharts(evaluation) {
    destroyCharts();

    const scoreCtx = getEl('scoreBreakdownChart')?.getContext('2d');
    if (scoreCtx) {
        scoreBreakdownChart = new Chart(scoreCtx, {
            type: 'doughnut',
            data: {
                labels: evaluation.categories.map(category => category.label),
                datasets: [{
                    data: evaluation.categories.map(category => Number(category.weightedPoints.toFixed(1))),
                    backgroundColor: [
                        '#2563eb',
                        '#10b981',
                        '#f59e0b',
                        '#8b5cf6',
                        '#0ea5e9',
                        '#14b8a6',
                        '#ef4444',
                        '#6366f1'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { boxWidth: 12, padding: 14 }
                    },
                    tooltip: {
                        callbacks: {
                            label(context) {
                                const category = evaluation.categories[context.dataIndex];
                                return `${category.label}: ${category.score}/100 (${category.weightedPoints.toFixed(1)} weighted pts)`;
                            }
                        }
                    }
                }
            }
        });
    }

    const benchmarkRows = evaluation.benchmarkRows.filter(row => row.hasBenchmark && row.normalized !== null);
    const benchmarkWrap = getEl('benchmarkChartWrap');
    const benchmarkCtx = getEl('benchmarkChart')?.getContext('2d');

    if (!benchmarkRows.length || !benchmarkCtx) {
        if (benchmarkWrap) benchmarkWrap.style.display = 'none';
        return;
    }

    if (benchmarkWrap) benchmarkWrap.style.display = 'block';

    if (benchmarkChart) {
        benchmarkChart.destroy();
    }

    // 1. Check if we are on a small screen
    const isMobile = window.innerWidth < 600;

    // 2. Set the canvas container height dynamically based on the number of bars 
    // so it never squishes when the width gets smaller.
    const chartCanvas = getEl('benchmarkChart');
    if (chartCanvas && benchmarkRows.length) {
        // Give each bar roughly 40px on mobile, 50px on desktop, plus some padding
        const calculatedHeight = benchmarkRows.length * (isMobile ? 35 : 45) + 60;
        chartCanvas.style.height = `${calculatedHeight}px`;
        // If you use a chart shell wrapper, you might need to make sure it doesn't constrain the height
    }

    benchmarkChart = new Chart(benchmarkCtx, {
        type: 'bar',
        data: {
            labels: benchmarkRows.map(row => row.label),
            datasets: [{
                label: '100 = age-band median',
                data: benchmarkRows.map(row => row.normalized),
                backgroundColor: benchmarkRows.map(row => {
                    if (row.statusClass === 'good') return 'rgba(16,185,129,0.85)';
                    if (row.statusClass === 'warn') return 'rgba(245,158,11,0.85)';
                    return 'rgba(239,68,68,0.85)';
                }),
                borderRadius: 6,
                // 3. Make bars thinner on mobile so they don't overlap
                barThickness: isMobile ? 16 : 24, 
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false, // 4. CRITICAL: Allows the custom height we set above to take effect!
            scales: {
                x: {
                    min: 0,
                    max: 200,
                    title: {
                        display: true,
                        // 5. Shorten the axis title on mobile screens
                        text: isMobile ? 'Score vs age-band (100 = median)' : 'Score vs age-band median (median = 100)',
                        font: {
                            size: isMobile ? 9 : 12,
                            weight: 'bold'
                        }
                    },
                    ticks: {
                        font: {
                            size: isMobile ? 8 : 11
                        }
                    }
                },
                y: {
                    ticks: {
                        font: {
                            size: isMobile ? 9 : 12
                        },
                        // 6. Truncate long labels on mobile so the bars have space
                        callback: function(value) {
                            const label = this.getLabelForValue(value);
                            if (isMobile && label.length > 15) {
                                return label.slice(0, 12) + '...';
                            }
                            return label;
                        }
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label(context) {
                            return `${context.raw.toFixed(0)} where 100 = your age-band median`;
                        }
                    }
                }
            }
        }
    });
}

function clearResults() {
    lastEvaluation = null;
    destroyCharts();
    getEl('resultsPlaceholder').style.display = 'block';
    getEl('resultsSection').style.display = 'none';
    getEl('breakdownCard').style.display = 'none';
    getEl('comparisonCard').style.display = 'none';
    getEl('priorityCard').style.display = 'none';
    getEl('strengthsCard').style.display = 'none';
    getEl('healthFloat').classList.remove('visible');
}

function renderResults(evaluation) {
    lastEvaluation = evaluation;

    getEl('resultsPlaceholder').style.display = 'none';
    getEl('resultsSection').style.display = 'block';
    getEl('breakdownCard').style.display = 'block';
    getEl('comparisonCard').style.display = 'block';
    getEl('priorityCard').style.display = 'block';
    getEl('strengthsCard').style.display = 'block';

    const ring = getEl('healthScoreRing');
    ring.className = 'health-score-ring';
    if (evaluation.grade === 'B') ring.classList.add('grade-b');
    if (evaluation.grade === 'C') ring.classList.add('grade-c');
    if (evaluation.grade === 'D') ring.classList.add('grade-d');
    if (evaluation.grade === 'F') ring.classList.add('grade-f');

    getEl('healthScoreValue').textContent = evaluation.overallScore;
    getEl('healthScoreGrade').textContent = evaluation.grade;

    const chip = getEl('healthStatusChip');
    chip.className = `health-status-chip ${evaluation.statusClass}`;
    chip.textContent = evaluation.statusLabel;

    getEl('healthSummaryTitle').textContent = evaluation.summaryTitle;
    getEl('healthSummaryText').textContent = evaluation.summaryText;

    const indicator = getEl('healthIndicator');
    indicator.className = `health-indicator ${evaluation.indicatorClass}`;
    indicator.textContent = evaluation.indicatorText;

    getEl('comparisonStrip').innerHTML = renderChips(evaluation.comparisonChips);
    getEl('benchmarkNotice').textContent = evaluation.benchmarkNotice;

    getEl('kpiNetWorth').textContent = money(evaluation.profile.netWorth);
    getEl('kpiNetWorthSub').textContent = `${multiple(evaluation.profile.netWorthMultiple)} of income`;
    getEl('kpiEmergencyMonths').textContent = `${evaluation.profile.emergencyFundMonths.toFixed(1)} mo`;
    getEl('kpiEmergencySub').textContent = `${money(evaluation.profile.liquidCash)} liquid cash`;
    getEl('kpiSavingsRate').textContent = percent(evaluation.profile.savingsRate);
    getEl('kpiSavingsSub').textContent = `${money(evaluation.profile.plannedSavingMonthly)}/mo committed`;
    getEl('kpiFixedRatio').textContent = percent(evaluation.profile.fixedObligationRatio);
    getEl('kpiFixedSub').textContent = `${money(evaluation.profile.monthlyHousing + evaluation.profile.minimumDebtPayments)}/mo fixed costs`;
    getEl('kpiSurplus').textContent = money(evaluation.profile.monthlySurplus);

    // Show an inline badge whenever a key income figure was derived, not entered directly.
    // This alerts the user that the surplus (and all downstream ratios) rest on an estimate.
    const surplusBaseNote = evaluation.profile.monthlySurplus >= 0
        ? 'Still left after the plan runs'
        : 'Short after core outflows and saving';
    if (evaluation.profile.takeHomeEstimated) {
        getEl('kpiSurplusSub').innerHTML =
            `${surplusBaseNote} <span style="font-size:0.7em;font-weight:600;background:var(--warn,#f59e0b);color:#fff;border-radius:3px;padding:1px 5px;vertical-align:middle;margin-left:4px;">take-home est.</span>`;
    } else if (evaluation.profile.grossEstimated) {
        getEl('kpiSurplusSub').innerHTML =
            `${surplusBaseNote} <span style="font-size:0.7em;font-weight:600;background:var(--info,#3b82f6);color:#fff;border-radius:3px;padding:1px 5px;vertical-align:middle;margin-left:4px;">gross est.</span>`;
    } else {
        getEl('kpiSurplusSub').textContent = surplusBaseNote;
    }

    getEl('kpiCompleteness').textContent = percent(evaluation.profile.completeness, 0);
    getEl('kpiCompletenessSub').textContent =
        evaluation.profile.takeHomeEstimated ? 'Take-home estimated from gross — enter actual paycheck for precision' :
        evaluation.profile.grossEstimated    ? 'Gross income estimated from take-home — enter annual salary for precision' :
        'More inputs = sharper feedback';

    getEl('scoreCategoryList').innerHTML = renderScoreRows(evaluation.categories);
    getEl('comparisonSummary').textContent = `Using the ${evaluation.ageBand?.label || 'closest'} age band. On the chart, 100 means exactly at the age-band median.`;
    getEl('benchmarkTableBody').innerHTML = renderBenchmarkTable(evaluation.benchmarkRows);
    getEl('milestoneGrid').innerHTML = renderMilestones(evaluation.milestones);
    getEl('priorityList').innerHTML = renderPriorityList(evaluation.actions);
    getEl('strengthList').innerHTML = renderStrengthList(evaluation.strengths);

    renderCharts(evaluation);
    syncFloat();
}

function calculateHealthCheck() {
    const profile = collectProfile();
    const hasMinimumData = profile.age >= 18 && (profile.grossIncome > 0 || profile.takeHomeMonthly > 0);
    if (!hasMinimumData) {
        clearResults();
        return;
    }

    const evaluation = evaluateProfile(profile);
    renderResults(evaluation);
}

function copyShareLink() {
    const params = new URLSearchParams();
    STATE_IDS.forEach(id => {
        const el = getEl(id);
        if (!el) return;
        if (el.type === 'checkbox') {
            if (el.checked) params.set(id, '1');
            return;
        }
        if (String(el.value || '').trim() !== '') params.set(id, el.value);
    });

    const shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    const btn = getEl('shareLinkBtn');
    btn.disabled = true;

    navigator.clipboard.writeText(shareUrl).then(() => {
        const originalText = btn.textContent;
        btn.textContent = '✓ Link Copied';
        setTimeout(() => {
            btn.textContent = originalText;
            btn.disabled = false;
        }, 2000);
    }).catch(err => {
        console.error(err);
        btn.disabled = false;
    });
}

function resetAll() {
    document.querySelectorAll('#healthForm input').forEach(input => {
        if (input.type === 'checkbox') input.checked = false;
        else input.value = '';
    });

    document.querySelectorAll('#healthForm select').forEach(select => {
        select.selectedIndex = 0;
    });

    localStorage.removeItem(STORAGE_KEY);
    clearResults();
}

function syncFloat() {
    if (!lastEvaluation) return;

    const resultsCard = getEl('resultsCard');
    const floatEl = getEl('healthFloat');
    if (!resultsCard || !floatEl) return;

    const rect = resultsCard.getBoundingClientRect();
    const isOffScreen = rect.top > window.innerHeight || rect.bottom < 0;
    const shouldShow = window.scrollY > 160 && isOffScreen;

    getEl('healthFloatValue').textContent = `${lastEvaluation.overallScore}/100 (${lastEvaluation.grade})`;
    getEl('healthFloatSub').textContent = lastEvaluation.statusLabel;

    if (shouldShow) floatEl.classList.add('visible');
    else floatEl.classList.remove('visible');
}

function buildPdfSections(evaluation) {
    const m = (v) => v > 0 ? money(v) : '--';
    return [
        {
            heading: 'Profile Snapshot',
            items: [
                { label: 'Age', value: String(evaluation.profile.age) },
                { label: 'Age Band', value: evaluation.ageBand?.label || 'Not found' },
                { label: 'Household Size', value: String(evaluation.profile.householdSize) },
                { label: 'Dependents', value: String(evaluation.profile.dependents) },
                { label: 'Housing Situation', value: evaluation.profile.homeStatus },
                { label: 'Profile Completeness', value: percent(evaluation.profile.completeness, 0) }
            ]
        },
        {
            heading: 'Cash Flow Snapshot',
            items: [
                { label: 'Gross Income', value: money(evaluation.profile.grossIncome) },
                { label: 'Net Take-Home', value: money(evaluation.profile.takeHomeMonthly) + ' / month' },
                { label: 'Housing Cost', value: evaluation.profile.monthlyHousing > 0 ? money(evaluation.profile.monthlyHousing) + ' / month' : '--' },
                { label: 'Core Non-Housing Costs', value: evaluation.profile.monthlyCoreSpending > 0 ? money(evaluation.profile.monthlyCoreSpending) + ' / month' : '--' },
                { label: 'Minimum Debt Payments', value: money(evaluation.profile.minimumDebtPayments) + ' / month' },
                { label: 'Flexible Spending', value: evaluation.profile.monthlyFlexibleSpending > 0 ? money(evaluation.profile.monthlyFlexibleSpending) + ' / month' : '--' },
                { label: 'Planned Monthly Saving', value: money(evaluation.profile.plannedSavingMonthly) + ' / month' },
                { label: 'Monthly Surplus', value: money(evaluation.profile.monthlySurplus) }
            ]
        },
        {
            heading: 'Assets and Net Worth',
            items: [
                { label: 'Net Worth', value: money(evaluation.profile.netWorth) },
                { label: 'Liquid Cash', value: money(evaluation.profile.liquidCash) },
                { label: 'Retirement Assets', value: m(evaluation.profile.retirementAccounts) },
                { label: 'Taxable Investments', value: m(evaluation.profile.taxableInvestments) },
                { label: 'HSA Balance', value: m(evaluation.profile.hsaBalance) },
                { label: 'Home Equity', value: m(evaluation.profile.homeEquity) },
                { label: 'Other Assets', value: m(evaluation.profile.otherAssets) }
            ]
        },
        {
            heading: 'Debt and Protection',
            items: [
                { label: 'Consumer Debt', value: money(evaluation.profile.consumerDebtBalance) },
                { label: 'Total Debt', value: money(evaluation.profile.totalDebtBalance) },
                { label: 'Fixed Obligation Ratio', value: percent(evaluation.profile.fixedObligationRatio) },
                { label: 'Credit Utilization', value: evaluation.profile.creditUtilization !== null ? percent(evaluation.profile.creditUtilization) : '--' },
                { label: 'Credit Score', value: evaluation.profile.creditScore ? String(evaluation.profile.creditScore) : '--' },
                { label: 'Employer Match Status', value: evaluation.profile.capturesEmployerMatch },
                { label: 'Health Insurance', value: evaluation.profile.hasHealthInsurance ? 'Yes' : 'No' },
                { label: 'Disability Insurance', value: evaluation.profile.hasDisabilityInsurance ? 'Yes' : 'No' },
                { label: 'Life Insurance', value: evaluation.profile.hasLifeInsurance ? 'Yes' : 'No' },
                { label: 'Will / Estate Docs', value: evaluation.profile.hasWill ? 'Yes' : 'No' },
                { label: 'Beneficiaries Updated', value: evaluation.profile.hasBeneficiaries ? 'Yes' : 'No' }
            ]
        },
        {
            heading: 'Score Breakdown',
            items: evaluation.categories.map(category => ({
                label: `${category.label} (${category.weight} pts)`,
                value: `${category.score}/100`
            }))
        },
        {
            heading: 'Age-Band Comparison',
            items: evaluation.benchmarkRows.slice(0, 8).map(row => ({
                label: row.label,
                value: `You ${row.userText} | Median ${row.medianText} | Avg ${row.averageText}`
            }))
        }
    ];
}

function buildPdfLists(evaluation) {
    return {
        actions: evaluation.actions.map(item => `${item.title}: ${item.body}`),
        strengths: evaluation.strengths.map(item => `${item.title}: ${item.body}`)
    };
}

function loadImageDataUrl(path) {
    return new Promise(resolve => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => resolve(null);
        img.src = path;
    });
}

async function downloadPDF() {
    if (!lastEvaluation) return;

    const { jsPDF } = window.jspdf;
    const btn = getEl('downloadPdfBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Generating...';
    btn.disabled = true;

    try {
        const REPORT = {
            title: 'Financial Health Check Report',
            filename: 'Financial-Health-Check-Report.pdf',
            logoPath: `${API_BASE}/static/logo.png`,
            sections: buildPdfSections(lastEvaluation),
            actionPlan: buildPdfLists(lastEvaluation).actions,
            strengths: buildPdfLists(lastEvaluation).strengths
        };

        const PW = 612, PH = 792, ML = 48, MR = 48, CW = PW - ML - MR;
        const ACCENT = [37, 99, 235];
        const INK = [22, 22, 22];
        const MUTED = [110, 110, 110];
        const RULE = [220, 220, 220];
        const STRIPE = [248, 249, 251];
        let y = 0;

        const doc = new jsPDF({ unit: 'pt', format: 'letter' });

        function sc(rgb, type = 'text') {
            if (type === 'text') doc.setTextColor(...rgb);
            else if (type === 'fill') doc.setFillColor(...rgb);
            else if (type === 'draw') doc.setDrawColor(...rgb);
        }

        function t(text, x, yy, opts = {}) {
            doc.text(String(text), x, yy, opts);
        }

        function newPage() {
            doc.addPage();
            y = 50;
        }

        function sectionHeading(title) {
            if (y + 20 > PH - 50) newPage();
            doc.setFontSize(8);
            doc.setFont(undefined, 'bold');
            sc(ACCENT, 'text');
            t(title.toUpperCase(), ML, y);
            sc(ACCENT, 'draw');
            doc.setLineWidth(1.5);
            doc.line(ML, y + 3, ML + CW, y + 3);
            sc(INK, 'text');
            y += 14;
        }

        function renderRows(items) {
            const LABEL_X = ML + 6;
            const VALUE_X = ML + 250;
            const VALUE_W = CW - (VALUE_X - ML) - 8;
            const LABEL_W = VALUE_X - LABEL_X - 12;

            items.forEach((item, index) => {
                const labelLines = doc.splitTextToSize(item.label, LABEL_W);
                const valueLines = doc.splitTextToSize(item.value, VALUE_W);
                const rowHeight = Math.max(labelLines.length, valueLines.length) * 11 + 7;

                if (y + rowHeight > PH - 50) newPage();
                if (index % 2 === 0) {
                    sc(STRIPE, 'fill');
                    doc.rect(ML, y, CW, rowHeight, 'F');
                }

                doc.setFontSize(8.5);
                doc.setFont(undefined, 'normal');
                sc(MUTED, 'text');
                doc.text(labelLines, LABEL_X, y + 10);

                doc.setFont(undefined, /^Total|Overall Score/.test(item.label) ? 'bold' : 'bold');
                sc(/^Overall Score/.test(item.label) ? ACCENT : INK, 'text');
                doc.text(valueLines, VALUE_X, y + 10);

                y += rowHeight;
            });
            y += 12;
        }

        function renderNarrativeList(title, items) {
            if (!items.length) return;
            sectionHeading(title);
            items.forEach((item, index) => {
                const lines = doc.splitTextToSize(`${index + 1}. ${item}`, CW - 8);
                const rowHeight = lines.length * 11 + 8;
                if (y + rowHeight > PH - 50) newPage();
                if (index % 2 === 1) {
                    sc(STRIPE, 'fill');
                    doc.rect(ML, y, CW, rowHeight, 'F');
                }
                doc.setFontSize(8.5);
                doc.setFont(undefined, 'normal');
                sc(INK, 'text');
                doc.text(lines, ML + 6, y + 10);
                y += rowHeight;
            });
            y += 12;
        }

        let logoImg = null;
        try {
            logoImg = await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = REPORT.logoPath;
            });
        } catch (_) {}

        const HDR_H = 62;
        sc([255, 255, 255], 'fill');
        doc.rect(0, 0, PW, HDR_H, 'F');

        if (logoImg) {
            const lh = 34;
            const lw = (logoImg.width * lh) / logoImg.height;
            doc.addImage(logoImg, 'PNG', PW - MR - lw, (HDR_H - lh) / 2, lw, lh);
        }

        sc(INK, 'text');
        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        t(REPORT.title, ML, 28);

        sc(MUTED, 'text');
        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        t('Generated ' + new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), ML, 44);

        y = HDR_H;
        sc(ACCENT, 'fill');
        doc.rect(0, y, PW, 2.5, 'F');
        y += 18;

        sectionHeading('Summary');
        renderRows([
            { label: 'Overall Score', value: `${lastEvaluation.overallScore}/100 (${lastEvaluation.grade}) - ${lastEvaluation.statusLabel}` },
            //{ label: 'Summary', value: lastEvaluation.summaryText },
            { label: 'Summary', value: lastEvaluation.indicatorText }
        ]);

        REPORT.sections.forEach(section => {
            sectionHeading(section.heading);
            renderRows(section.items);
        });

        renderNarrativeList('Priority Action Plan', REPORT.actionPlan);
        renderNarrativeList('Strengths to Protect', REPORT.strengths);

        const totalPages = doc.internal.getNumberOfPages();
        for (let p = 1; p <= totalPages; p++) {
            doc.setPage(p);
            sc(RULE, 'draw'); doc.setLineWidth(0.5);
            doc.line(ML, PH - 32, PW - MR, PH - 32);
            sc(MUTED, 'text'); doc.setFontSize(7); doc.setFont(undefined, 'normal');
            t('MoneyByMath  ·  For informational purposes only.', ML, PH - 20);
            t('Page ' + p + ' of ' + totalPages, PW - MR, PH - 20, { align: 'right' });
        }

        doc.save(REPORT.filename);
    } catch (err) {
        console.error('Failed to generate PDF', err);
    } finally {
        btn.innerHTML = '✓ Saved!';
        btn.disabled = false;
        setTimeout(() => (btn.innerHTML = originalText), 2000);
        
    }
}

function bindFormEvents() {
    const form = getEl('healthForm');
    if (!form) return;

    form.addEventListener('input', event => {
        if (event.target.classList.contains('money-input')) {
            sanitizeMoneyInput(event.target);
        }
        calculateHealthCheck();
        saveToStorage();
    });

    form.addEventListener('change', () => {
        calculateHealthCheck();
        saveToStorage();
    });

    form.addEventListener('blur', event => {
        if (event.target.classList.contains('money-input')) {
            formatMoneyInput(event.target);
            calculateHealthCheck();
            saveToStorage();
        }
    }, true);
}

function scrollSharedLinkIntoView() {
    setTimeout(() => {
        const target = document.querySelector('.share-btn');
        if (!target) return;
        const y = target.getBoundingClientRect().top + window.pageYOffset - 120;
        window.scrollTo({ top: y, behavior: 'smooth' });
    }, 50);
}

document.addEventListener('DOMContentLoaded', async () => {
    const loadedFromUrl = loadFromUrl();
    if (!loadedFromUrl) loadFromStorage();

    formatAllMoneyInputs();
    bindFormEvents();
    await initBenchmarks();
    await initTaxData();
    calculateHealthCheck();

    if (loadedFromUrl) scrollSharedLinkIntoView();

    window.addEventListener('scroll', syncFloat);
});