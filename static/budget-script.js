/* ══════════════════════════════════════════════════
   STATE & CONSTANTS
══════════════════════════════════════════════════ */

const API_BASE = window.location.origin; 

const STATE_IDS = [
    'grossSalary', 'actualPaycheck', 'payFreq', 'filingStatus', 'contrib401kPct', 'contrib401kAmt',
    'employerMatch', 'healthInsurance', 'hsaFsa', 'otherPreTax', 'sideIncome',
    'roth401kPct', 'roth401kAmt', 'emergencyFund', 'currentEmergencyFund', 'rothIRA',
    'brokerageInvest', 'otherSavings', 'housingType', 'rentMortgage', 'utilities',
    'internet', 'rentersInsurance', 'hoaMaint', 'carPayment', 'carInsurance', 'gas',
    'parkingTolls', 'carMaintenance', 'groceries', 'diningOut', 'coffeeSnacks',
    'creditCardMin', 'creditCardBalance', 'creditCardAPR', 'studentLoan', 'personalLoan',
    'otherDebt', 'subscriptions', 'entertainment', 'clothing', 'personalCare', 'familyCare',
    'healthcare', 'petExpenses', 'travel', 'gifts', 'miscOther'
];

/* ══════════════════════════════════════════════════
   UTILITY FUNCTIONS
══════════════════════════════════════════════════ */

function fmt(el) {
    let v = el.value.replace(/[^\d.]/g, '');
    const parts = v.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (parts.length > 2) parts.pop();
    el.value = parts.join('.');
}

function parseFmt(id) {
    const el = document.getElementById(id);
    if (!el || el.value.trim() === '') return 0;
    return parseFloat(el.value.replace(/,/g, '')) || 0;
}

function parseNum(id) {
    const el = document.getElementById(id);
    if (!el || el.value.trim() === '') return 0;
    return parseFloat(el.value) || 0;
}

function val(id) { return document.getElementById(id)?.value || ''; }
function get(id) { const el = document.getElementById(id); if (!el) return ''; return (el.value ?? el.textContent ?? '').trim(); }
function result(id) { return (document.getElementById(id)?.textContent || '').trim(); }

function fmtDollar(n, decimals = 0) {
    if (isNaN(n)) return '--';
    const sign = n < 0 ? '-' : '';
    return sign + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtPct(n, d = 1) { return n.toFixed(d) + '%'; }

/* ══════════════════════════════════════════════════
   SYNC HELPERS
══════════════════════════════════════════════════ */
function syncContrib401kFromPct() {
    const gross = parseFmt('grossSalary');
    const pct = parseNum('contrib401kPct');
    // Only sync if gross salary is entered; otherwise user must enter the dollar amount directly
    if (gross > 0) {
        const monthly = (gross * pct / 100) / 12;
        const el = document.getElementById('contrib401kAmt');
        el.value = monthly > 0 ? Math.round(monthly).toLocaleString('en-US') : '';
    }
}

function syncContrib401kFromAmt() {
    const gross = parseFmt('grossSalary');
    const monthly = parseFmt('contrib401kAmt');
    const el = document.getElementById('contrib401kPct');
    if (gross > 0) {
        el.value = ((monthly * 12 / gross) * 100).toFixed(1);
    }
}

function syncRoth401kFromPct() {
    const gross = parseFmt('grossSalary');
    const pct = parseNum('roth401kPct');
    if (gross > 0) {
        const monthly = (gross * pct / 100) / 12;
        const el = document.getElementById('roth401kAmt');
        el.value = monthly > 0 ? Math.round(monthly).toLocaleString('en-US') : '';
    }
}

function syncRoth401kFromAmt() {
    const gross = parseFmt('grossSalary');
    const monthly = parseFmt('roth401kAmt');
    const el = document.getElementById('roth401kPct');
    if (gross > 0) {
        el.value = ((monthly * 12 / gross) * 100).toFixed(1);
    }
}

/* ══════════════════════════════════════════════════
   FEDERAL TAX ESTIMATION
══════════════════════════════════════════════════ */
let taxData2026 = null;
const AVG_STATE_TAX_RATE = 0.045; // Blended 4.5% proxy

async function initTaxData() {
    try {
        const response = await fetch(`${API_BASE}/static/taxData.json`);
        const data = await response.json();
        
        taxData2026 = {
            ficaWageBase: data.FICA_WAGE_BASE || 176100,
            single: {
                stdDeduction: data.STANDARD_DEDUCTIONS.single,
                brackets: data.BRACKETS.single.map(b => ({
                    rate: b[2], 
                    limit: b[1] === null ? Infinity : b[1]
                }))
            },
            mfj: { 
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
    } catch (err) {
        console.error("Error loading tax data:", err);
    }
}

function estimateTax(grossAnnual, preTaxDeductionsAnnual, status) {
    const FALLBACK_2026 = {
        single: { stdDeduction: 16100, brackets: [
            { rate: 0.10, limit: 12400 }, { rate: 0.12, limit: 50400 },
            { rate: 0.22, limit: 105700 }, { rate: 0.24, limit: 201775 },
            { rate: 0.32, limit: 256225 }, { rate: 0.35, limit: 640600 },
            { rate: 0.37, limit: Infinity }
        ]},
        mfj: { stdDeduction: 32200, brackets: [
            { rate: 0.10, limit: 24800 }, { rate: 0.12, limit: 100800 },
            { rate: 0.22, limit: 211400 }, { rate: 0.24, limit: 403550 },
            { rate: 0.32, limit: 512450 }, { rate: 0.35, limit: 768700 },
            { rate: 0.37, limit: Infinity }
        ]},
        hoh: { stdDeduction: 24150, brackets: [
            { rate: 0.10, limit: 17700 }, { rate: 0.12, limit: 67450 },
            { rate: 0.22, limit: 105700 }, { rate: 0.24, limit: 201775 },
            { rate: 0.32, limit: 256200 }, { rate: 0.35, limit: 640600 },
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
    // Medicare: 1.45% + 0.9% additional over $200k (single)
    const medicareSurtaxThreshold = status === 'mfj' ? 250000 : 200000;
    const medicare = grossAnnual * 0.0145 + Math.max(0, grossAnnual - medicareSurtaxThreshold) * 0.009;
    const stateTax = (grossAnnual - preTaxDeductionsAnnual) * AVG_STATE_TAX_RATE;
    
    return { fedTax, fica, medicare, stateTax, total: fedTax + fica + medicare + stateTax };
}

/* ══════════════════════════════════════════════════
   SCORE ENGINE & MATH
══════════════════════════════════════════════════ */

let spendingChartInst = null;

function getGrade(score) {
    if (score >= 90) return { grade: 'A+', label: 'Outstanding', sub: 'Your budget is exemplary. You\'re building serious wealth.', cls: '' };
    if (score >= 80) return { grade: 'A',  label: 'Excellent',    sub: 'Strong foundation with minor room for optimization.', cls: '' };
    if (score >= 70) return { grade: 'B',  label: 'Good',         sub: 'Solid budget, a few areas could use attention.', cls: 'grade-b' };
    if (score >= 60) return { grade: 'C',  label: 'Fair',         sub: 'Budget is functional but has meaningful gaps to address.', cls: 'grade-c' };
    if (score >= 50) return { grade: 'D',  label: 'Needs Work',   sub: 'Several budget categories need restructuring.', cls: 'grade-d' };
    return                 { grade: 'F',  label: 'Critical',     sub: 'Budget is under significant strain - action needed now.', cls: 'grade-f' };
}

function getDtiText() {
    const el = document.getElementById('dtiIndicator');
    if(!el) return '--';
    const match = el.textContent.match(/Ratio:\s*([\d.]+%\s*-\s*[a-zA-Z.]+)/);
    if(match) return match[1];
    return el.textContent.replace(/[🚨⚠️✅]/g, '').split('-')[0].trim();
}

function calculate() {
    /* ── 1. GATHER INPUTS ── */
    const grossSalaryInputted  = parseFmt('grossSalary');
    const actualPaycheck       = parseFmt('actualPaycheck');

    if (grossSalaryInputted <= 0 && actualPaycheck <= 0) {
        // Show placeholder and hide results
        document.getElementById('paycheckBreakdown').innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Enter your gross salary or actual paycheck above to see a full breakdown.</p>';
        document.getElementById('scorePlaceholder').style.display = 'block';
        document.getElementById('scoreSection').style.display = 'none';
        document.getElementById('ruleCard').style.display = 'none';
        document.getElementById('categoryCard').style.display = 'none';
        document.getElementById('priorityCard').style.display = 'none';
        
        // Hide floating widget
        floatPill = document.getElementById('budgetFloat');
        if (floatPill) {
            floatPill.classList.remove('visible')
        }
        
        // Clean up the chart memory so it doesn't leave ghost renders
        if (spendingChartInst) { spendingChartInst.destroy(); spendingChartInst = null; }

        return; // Halt execution
    }

    const payFreq              = parseInt(val('payFreq')) || 12;
    const filingStatus         = val('filingStatus') || 'single';

    const contrib401kMo        = parseFmt('contrib401kAmt');
    const empMatchPct          = parseNum('employerMatch');
    const healthIns            = parseFmt('healthInsurance');
    const hsaFsa               = parseFmt('hsaFsa');
    const otherPreTax          = parseFmt('otherPreTax');
    const sideIncome           = parseFmt('sideIncome');

    const rentMortgage         = parseFmt('rentMortgage');
    const utilities            = parseFmt('utilities');
    const internet             = parseFmt('internet');
    const rentersIns           = parseFmt('rentersInsurance');
    const hoaMaint             = parseFmt('hoaMaint');

    const carPayment           = parseFmt('carPayment');
    const carInsurance         = parseFmt('carInsurance');
    const gas                  = parseFmt('gas');
    const parkingTolls         = parseFmt('parkingTolls');
    const carMaint             = parseFmt('carMaintenance');

    const groceries            = parseFmt('groceries');
    const diningOut            = parseFmt('diningOut');
    const coffeeSnacks         = parseFmt('coffeeSnacks');

    const ccMin                = parseFmt('creditCardMin');
    const ccBalance            = parseFmt('creditCardBalance');
    const ccAPR                = parseNum('creditCardAPR');
    const studentLoan          = parseFmt('studentLoan');
    const personalLoan         = parseFmt('personalLoan');
    const otherDebt            = parseFmt('otherDebt');

    const subscriptions        = parseFmt('subscriptions');
    const entertainment        = parseFmt('entertainment');
    const clothing             = parseFmt('clothing');
    const personalCare         = parseFmt('personalCare');
    const familyCare           = parseFmt('familyCare');
    const healthcare           = parseFmt('healthcare');
    const petExp               = parseFmt('petExpenses');
    const travel               = parseFmt('travel');
    const gifts                = parseFmt('gifts');
    const miscOther            = parseFmt('miscOther');

    const emergencyFundContrib    = parseFmt('emergencyFund');
    const currentEmergencyFund    = parseFmt('currentEmergencyFund');
    const roth401kMo              = parseFmt('roth401kAmt');
    const rothIRA                 = parseFmt('rothIRA');
    const brokerageInvest         = parseFmt('brokerageInvest');
    const otherSavings            = parseFmt('otherSavings');

    /* ── 2. PAYCHECK MATH (3 Modes) ──────────────────────────────────────────
     *
     *  MODE A - Gross salary only:
     *    All taxes estimated. Paycheck = Gross − preTax − roth401k − est.taxes.
     *
     *  MODE B - Actual paycheck only (no gross entered):
     *    Bank deposit = paycheck × payFreq / 12.
     *    Gross is ESTIMATED by working backwards through known deductions
     *    and an assumed ~28% effective tax rate on take-home portion.
     *    Gross-based ratios (DTI, housing %) are marked as estimated.
     *
     *  MODE C - Both entered:
     *    Bank deposit = paycheck × payFreq / 12 (user-confirmed take-home).
     *    Federal tax is estimated from gross. The remaining gap is shown as
     *    "FICA, State & Other" so the math reconciles:
     *    Gross − preTax − roth401k − fedTax − otherTax = paycheck.
     * ─────────────────────────────────────────────────────────────────────── */

    const hasGross    = grossSalaryInputted > 0;
    const hasPaycheck = actualPaycheck > 0;
    const hasSomeIncome = hasGross || hasPaycheck;

    // Pay period label and monthly→period converter
    const periodLabel = payFreq === 26 ? 'Biweekly' : payFreq === 24 ? 'Semimonthly' : payFreq === 52 ? 'Weekly' : 'Monthly';
    const mToPeriod   = 12 / payFreq;  // multiply a monthly amount to get per-period amount

    const preTaxDeductionsMonthly = contrib401kMo + healthIns + hsaFsa + otherPreTax;
    const preTaxDeductionsAnnual  = preTaxDeductionsMonthly * 12;

    let grossMonthly      = 0;
    let bankDepositMonthly = 0;
    let fedTaxMonthly     = 0;
    let otherTaxesMonthly = 0;  // FICA + Medicare + State (or implied remainder in Mode C)
    let isGrossEstimated  = false;

    if (hasGross && hasPaycheck) {
        // ── MODE C: Both entered ──────────────────────────────────────────
        grossMonthly       = grossSalaryInputted / 12;
        bankDepositMonthly = (actualPaycheck * payFreq) / 12;
        const taxes        = estimateTax(grossSalaryInputted, preTaxDeductionsAnnual, filingStatus);
        fedTaxMonthly      = taxes.fedTax / 12;
        // "Other taxes" = whatever makes the math balance to the user's actual paycheck
        // clamp to 0 - can't be negative (may happen if user entered a high paycheck)
        otherTaxesMonthly  = Math.max(0,
            grossMonthly - preTaxDeductionsMonthly - roth401kMo - fedTaxMonthly - bankDepositMonthly
        );

    } else if (hasGross) {
        // ── MODE A: Gross only ────────────────────────────────────────────
        grossMonthly       = grossSalaryInputted / 12;
        const taxes        = estimateTax(grossSalaryInputted, preTaxDeductionsAnnual, filingStatus);
        fedTaxMonthly      = taxes.fedTax / 12;
        otherTaxesMonthly  = (taxes.fica + taxes.medicare + taxes.stateTax) / 12;
        bankDepositMonthly = Math.max(0,
            grossMonthly - preTaxDeductionsMonthly - roth401kMo - fedTaxMonthly - otherTaxesMonthly
        );

    } else if (hasPaycheck) {
        // ── MODE B: Paycheck only - estimate gross ────────────────────────
        bankDepositMonthly = (actualPaycheck * payFreq) / 12;
        // Estimate gross by grossing up the known monthly cash flows.
        // Known after-gross items: bank deposit + preTax deductions + roth401k (before any tax)
        // Tax on the "take-home gross" (gross minus preTax) ≈ 28% blended rate (avg US worker).
        // Gross − preTax = (bankDeposit + roth401k) / (1 − 0.28)
        const knownAfterPreTax = bankDepositMonthly + roth401kMo;
        const grossAfterPreTax = knownAfterPreTax / (1 - 0.28);
        grossMonthly           = grossAfterPreTax + preTaxDeductionsMonthly;
        const estGrossAnnual   = grossMonthly * 12;
        const taxes            = estimateTax(estGrossAnnual, preTaxDeductionsAnnual, filingStatus);
        fedTaxMonthly          = taxes.fedTax / 12;
        otherTaxesMonthly      = (taxes.fica + taxes.medicare + taxes.stateTax) / 12;
        isGrossEstimated       = true;
    }

    // Effective annual gross for all ratio calculations (may be estimated in Mode B)
    const effectiveGrossAnnual  = grossMonthly * 12;
    const totalTaxMonthly       = fedTaxMonthly + otherTaxesMonthly;
    // Side/freelance income carries ~15.3% SE tax + income tax. A 70% net factor
    // is a conservative but realistic estimate for most self-employment situations.
    const sideIncomeNet = sideIncome * 0.70;
    const availableCashMonthly = bankDepositMonthly + sideIncomeNet;
    const employerMatchMonthly  = grossMonthly * Math.min(empMatchPct, 100) / 100;

    /* ── 3. CATEGORY TOTALS ── */
    const totalHousing       = rentMortgage + utilities + internet + rentersIns + hoaMaint;
    const totalTransport     = carPayment + carInsurance + gas + parkingTolls + carMaint;
    const totalFood          = groceries + diningOut + coffeeSnacks;
    const totalDebtPayments  = ccMin + studentLoan + personalLoan + otherDebt;
    const totalLifestyle     = subscriptions + entertainment + clothing + personalCare + familyCare + healthcare + petExp + travel + gifts + miscOther;
    
    // After-tax savings paid from the bank account (NOT the paycheck)
    const totalAfterTaxSavingsFromBank = emergencyFundContrib + rothIRA + brokerageInvest + otherSavings;
    
    // Complete savings picture for scoring
    const totalSavingsIncl401k  = totalAfterTaxSavingsFromBank + roth401kMo + contrib401kMo;
    const totalSavingsWithMatch = totalSavingsIncl401k + employerMatchMonthly;

    const totalMonthlySpending = totalHousing + totalTransport + totalFood + totalDebtPayments + totalLifestyle + totalAfterTaxSavingsFromBank;
    const leftover             = availableCashMonthly - totalMonthlySpending;

    /* ── 4. KEY RATIOS ── */
    const housingRatioPct   = grossMonthly > 0 ? (totalHousing / grossMonthly) * 100 : 0;
    const transportRatioPct = availableCashMonthly > 0 ? (totalTransport / availableCashMonthly) * 100 : 0;
    // Back-end DTI: all recurring debt payments vs gross income
    const totalDebtForDTI   = rentMortgage + carPayment + ccMin + studentLoan + personalLoan + otherDebt;
    const dtiPct            = grossMonthly > 0 ? (totalDebtForDTI / grossMonthly) * 100 : 0;
    const savingsRate       = effectiveGrossAnnual > 0 ? (totalSavingsWithMatch * 12 / effectiveGrossAnnual) * 100 : 0;
    const ccInterestMonthly = ccBalance > 0 && ccAPR > 0 ? ccBalance * (ccAPR / 100 / 12) : 0;
    
    // Emergency fund months (cap display at 24 to avoid 999)
    const essentialMonthly  = Math.max(0, totalMonthlySpending - totalAfterTaxSavingsFromBank);
    const efMonths          = essentialMonthly > 0
        ? Math.min(currentEmergencyFund / essentialMonthly, 24)
        : currentEmergencyFund > 0 ? 24 : 0;
    const efMonthsRaw       = essentialMonthly > 0 ? currentEmergencyFund / essentialMonthly : 24; // raw for logic

    /* ── 5. 50/30/20 BASE ──────────────────────────────────────────────────
     *  The 50/30/20 rule uses "after-tax income", which is gross minus taxes.
     *  Pre-tax 401k is included in this base because it's money you chose to
     *  save - it still counts as income for the purposes of the rule.
     * ─────────────────────────────────────────────────────────────────────── */
    const afterTaxIncome = Math.max(grossMonthly - totalTaxMonthly + sideIncome, availableCashMonthly);
    
    // Needs: housing + essential transport + groceries + healthcare + min debt payments
    const needs2    = totalHousing + totalTransport + groceries + healthcare + familyCare + totalDebtPayments;
    // Wants: all discretionary lifestyle
    const wants2    = diningOut + coffeeSnacks + subscriptions + entertainment + clothing + personalCare + petExp + travel + gifts + miscOther;
    // Savings: all savings including pre-tax 401k and Roth 401k from paycheck
    const savings2  = totalSavingsIncl401k;

    const needsPct    = afterTaxIncome > 0 ? (needs2   / afterTaxIncome) * 100 : 0;
    const wantsPct    = afterTaxIncome > 0 ? (wants2   / afterTaxIncome) * 100 : 0;
    const savingsPct2 = afterTaxIncome > 0 ? (savings2 / afterTaxIncome) * 100 : 0;

    /* ── 6. RENDER PAYCHECK BREAKDOWN ─────────────────────────────────────
     *  Shows two columns: Per [Period] and Monthly.
     *  All inputs are monthly - convert to per-period using mToPeriod.
     *  In Mode C, the per-period take-home = the user's actual paycheck.
     * ─────────────────────────────────────────────────────────────────────── */
    if (hasSomeIncome) {
        // Per-period amounts (convert monthly inputs → per-period)
        const pp = (monthly) => fmtDollar(monthly * mToPeriod);  // per-period formatter
        const mo = (monthly) => fmtDollar(monthly);               // monthly formatter

        // Gross per-period: if gross is estimated, note it
        const grossPerPeriod = grossMonthly * mToPeriod;
        const grossLabel     = isGrossEstimated ? `Gross Pay (Estimated)` : `Gross Pay`;

        // Bank deposit per-period: in Mode C/B use actual paycheck directly; in Mode A compute it
        const bankDepositPerPeriod = hasPaycheck ? actualPaycheck : bankDepositMonthly * mToPeriod;

        // Build "other taxes" label
        const otherTaxLabel = (hasGross && hasPaycheck)
            ? 'FICA, State &amp; Other Taxes (implied)'
            : 'Social Security, Medicare &amp; State Taxes';

        const html = `
            <div class="tax-table-wrapper">
                <table class="tax-table">
                    <thead>
                        <tr>
                            <th style="text-align:left;">Earnings &amp; Deductions</th>
                            <th>Per ${periodLabel}</th>
                            <th>Monthly</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style="background:#f8fafc;"><td colspan="3" style="font-weight:700; font-size:0.7rem; color:var(--primary); text-transform:uppercase; letter-spacing:0.05em; padding:0.5rem 0.6rem;">Gross Earnings</td></tr>
                        <tr>
                            <td>${grossLabel}${isGrossEstimated ? ' <span style="font-size:0.7rem;color:var(--text-muted);display:block;margin-top:2px;">(enter gross salary for exact figure)</span>' : ''}</td>
                            <td class="col-green">${fmtDollar(grossPerPeriod)}</td>
                            <td class="col-green">${mo(grossMonthly)}</td>
                        </tr>
                        ${sideIncome > 0 ? `<tr><td>Side Income / Freelance</td><td>-</td><td class="col-green">+${mo(sideIncome)}</td></tr>` : ''}

                        <tr style="background:#f8fafc;"><td colspan="3" style="font-weight:700; font-size:0.7rem; color:var(--primary); text-transform:uppercase; letter-spacing:0.05em; padding:0.5rem 0.6rem;">Pre-Tax Deductions</td></tr>
                        ${contrib401kMo > 0 ? `<tr><td>Traditional 401(k) Contribution</td><td class="col-red">−${pp(contrib401kMo)}</td><td class="col-red">−${mo(contrib401kMo)}</td></tr>` : ''}
                        ${healthIns > 0 ? `<tr><td>Health Insurance</td><td class="col-red">−${pp(healthIns)}</td><td class="col-red">−${mo(healthIns)}</td></tr>` : ''}
                        ${hsaFsa > 0 ? `<tr><td>HSA / FSA</td><td class="col-red">−${pp(hsaFsa)}</td><td class="col-red">−${mo(hsaFsa)}</td></tr>` : ''}
                        ${otherPreTax > 0 ? `<tr><td>Other Pre-Tax Deductions</td><td class="col-red">−${pp(otherPreTax)}</td><td class="col-red">−${mo(otherPreTax)}</td></tr>` : ''}
                        ${preTaxDeductionsMonthly === 0 ? `<tr><td colspan="3" style="color:var(--text-muted);font-style:italic;text-align:center;font-size:0.8rem;">No pre-tax deductions entered</td></tr>` : ''}

                        <tr style="background:#f8fafc;"><td colspan="3" style="font-weight:700; font-size:0.7rem; color:var(--primary); text-transform:uppercase; letter-spacing:0.05em; padding:0.5rem 0.6rem;">After-Tax Deductions</td></tr>
                        ${roth401kMo > 0 ? `<tr><td>Roth 401(k) Contribution</td><td class="col-red">−${pp(roth401kMo)}</td><td class="col-red">−${mo(roth401kMo)}</td></tr>` : `<tr><td colspan="3" style="color:var(--text-muted);font-style:italic;text-align:center;font-size:0.8rem;">No after-tax paycheck deductions entered</td></tr>`}

                        <tr style="background:#f8fafc;"><td colspan="3" style="font-weight:700; font-size:0.7rem; color:var(--primary); text-transform:uppercase; letter-spacing:0.05em; padding:0.5rem 0.6rem;">Taxes</td></tr>
                        <tr>
                            <td>Federal Income Tax${!hasGross ? ' <span style="font-size:0.7rem;color:var(--text-muted);display:block;margin-top:2px;">(estimated)</span>' : ' <span style="font-size:0.7rem;color:var(--text-muted);display:block;margin-top:2px;">(estimated from gross)</span>'}</td>
                            <td class="col-red">−${pp(fedTaxMonthly)}</td>
                            <td class="col-red">−${mo(fedTaxMonthly)}</td>
                        </tr>
                        <tr>
                            <td>${otherTaxLabel}${(hasGross && hasPaycheck) ? ' <span style="font-size:0.7rem;color:var(--text-muted);display:block;margin-top:2px;">(reconciled to your paycheck)</span>' : ''}</td>
                            <td class="col-red">−${pp(otherTaxesMonthly)}</td>
                            <td class="col-red">−${mo(otherTaxesMonthly)}</td>
                        </tr>

                        ${employerMatchMonthly > 0 ? `
                        <tr style="background:#f8fafc;"><td colspan="3" style="font-weight:700; font-size:0.7rem; color:var(--primary); text-transform:uppercase; letter-spacing:0.05em; padding:0.5rem 0.6rem;">Employer Contributions</td></tr>
                        <tr>
                            <td>Employer 401(k) Match <span style="font-size:0.7rem;color:#065f46;display:block;margin-top:2px;">(free money - not in your paycheck)</span></td>
                            <td class="col-green">+${pp(employerMatchMonthly)}</td>
                            <td class="col-green">+${mo(employerMatchMonthly)}</td>
                        </tr>
                        ` : ''}

                        <tr style="background:#e0f2fe; border-top:2px solid #0284c7;">
                            <td style="font-weight:800; font-size:0.85rem; color:#0369a1; padding:0.8rem 0.6rem;">
                                NET ${periodLabel.toUpperCase()} PAYCHECK${hasPaycheck ? ' <span style="font-size:0.7rem;font-weight:600;opacity:0.8;display:block;">(entered)</span>' : ' <span style="font-size:0.7rem;font-weight:600;opacity:0.8;display:block;">(estimated)</span>'}
                            </td>
                            <td style="font-weight:800; font-size:1rem; color:#0369a1; text-align:right; vertical-align:middle;">${fmtDollar(bankDepositPerPeriod)}</td>
                            <td style="font-weight:800; font-size:1rem; color:#0369a1; text-align:right; vertical-align:middle;">${mo(bankDepositMonthly)}</td>
                        </tr>
                        ${sideIncome > 0 ? `
                        <tr style="background:#f0fdf4;">
                            <td style="font-weight:700; color:#15803d; padding:0.8rem 0.6rem;">Total Cash Available <span style="font-size:0.7rem;font-weight:600;opacity:0.8;display:block;">(paycheck + side income)</span></td>
                            <td style="font-weight:700; color:#15803d; text-align:right; vertical-align:middle;">-</td>
                            <td style="font-weight:700; color:#15803d; text-align:right; vertical-align:middle;">${mo(availableCashMonthly)}</td>
                        </tr>` : ''}
                        ${employerMatchMonthly > 0 ? `
                        <tr style="background:#f0fdf4;">
                            <td style="font-weight:700; color:#15803d; padding:0.8rem 0.6rem;">Total Retirement Saved <span style="font-size:0.7rem;font-weight:600;opacity:0.8;display:block;">(your contrib. + match)</span></td>
                            <td style="font-weight:700; color:#15803d; text-align:right; vertical-align:middle;">${pp(contrib401kMo + roth401kMo + employerMatchMonthly)}</td>
                            <td style="font-weight:700; color:#15803d; text-align:right; vertical-align:middle;">${mo(contrib401kMo + roth401kMo + employerMatchMonthly)}</td>
                        </tr>` : ''}
                    </tbody>
                </table>
            </div>
            ${isGrossEstimated ? `<p style="font-size:0.75rem;color:var(--text-muted);margin-top:0.75rem;font-style:italic;">⚠️ Gross salary is estimated (~28% effective tax rate assumed). Enter your Gross Annual Salary for a precise breakdown and more accurate ratios.</p>` : ''}`;
        document.getElementById('paycheckBreakdown').innerHTML = html;
    } else {
        document.getElementById('paycheckBreakdown').innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Enter your gross salary or actual paycheck above to see a full breakdown.</p>';
    }

    /* ── 7. SCORE CALCULATION ── */
    // Run score if we have any income data
    if (!hasSomeIncome) return;

    let score = 100;
    let scoreCap = 100;

    // Housing ratio (28% rule vs gross)
    if (housingRatioPct > 45)       { score -= 20; }
    else if (housingRatioPct > 36)  { score -= 12; }
    else if (housingRatioPct > 28)  { score -= 6; }

    // DTI (all debt payments vs gross)
    if (dtiPct > 50)       { score -= 20; }
    else if (dtiPct > 43)  { score -= 14; }
    else if (dtiPct > 36)  { score -= 8; }

    // Savings rate (of gross, including employer match)
    if (savingsRate >= 20) {
    score += 5; // Reward excellent savings
    } else {
        // Continuously penalize for being under the 20% target
        score -= (20 - savingsRate) * 1.5; 
    }

    // Employer match capture (combined trad + roth must reach the match threshold)
    if (empMatchPct > 0 && (contrib401kMo + roth401kMo) < (grossMonthly * empMatchPct / 100)) {
        score -= 10;
    }

    // Emergency fund
    if (efMonthsRaw < 1)       { score -= 15; }
    else if (efMonthsRaw < 3)  { score -= 8; }
    else if (efMonthsRaw >= 6) { score += 3; }

    // CC high-APR debt - penalize by severity relative to income
    if (ccBalance > 0 && ccAPR >= 15) {
        const balanceToIncome = effectiveGrossAnnual > 0 ? ccBalance / effectiveGrossAnnual : 1;
        if (balanceToIncome > 0.3)      { score -= 15; }
        else if (balanceToIncome > 0.1) { score -= 8; }
        else                             { score -= 4; }
    }

    // Transport ratio (of available cash / take-home)
    if (transportRatioPct > 25) { score -= 8; }
    else if (transportRatioPct > 20) { score -= 4; }

    const overspendRatio = availableCashMonthly > 0 && leftover < 0 ? Math.abs(leftover) / availableCashMonthly : 0;
    const bufferRatio    = availableCashMonthly > 0 ? leftover / availableCashMonthly : 0;

    // Monthly leftover / buffer
    if (overspendRatio >= 0.20) {
        score -= 45;
        scoreCap = Math.min(scoreCap, 25);
    } else if (overspendRatio >= 0.10) {
        score -= 36;
        scoreCap = Math.min(scoreCap, 39);
    } else if (overspendRatio >= 0.05) {
        score -= 30;
        scoreCap = Math.min(scoreCap, 49);
    } else if (overspendRatio > 0) {
        score -= 24;
        scoreCap = Math.min(scoreCap, 59);
    } else if (bufferRatio < 0.02) {
        score -= 12;
    } else if (bufferRatio < 0.05) {
        score -= 6;
    } else if (bufferRatio >= 0.15) {
        score += 3;
    }

    // 50/30/20 compliance bonus/penalty
    if (needsPct <= 50 && wantsPct <= 30 && savingsPct2 >= 20) { score += 5; }
    else if (needsPct > 80) { score -= 15; }
    else if (needsPct > 70) { score -= 8; }
    else if (needsPct > 60) { score -= 4; }

    if (wantsPct > 45)      { score -= 10; }
    else if (wantsPct > 35) { score -= 5; }

    score = Math.min(score, scoreCap);
    score = Math.max(0, Math.min(100, score));
    score = Math.round(score);

    /* ── 8. SHOW RESULTS ── */
    document.getElementById('scorePlaceholder').style.display = 'none';
    document.getElementById('scoreSection').style.display = 'block';
    document.getElementById('ruleCard').style.display = 'block';
    document.getElementById('categoryCard').style.display = 'block';
    document.getElementById('priorityCard').style.display = 'block';

    const g = getGrade(score);
    const badge = document.getElementById('gradeBadge');
    badge.textContent = g.grade;
    badge.className = `budget-score-badge ${g.cls}`;
    document.getElementById('gradeText').textContent = `${score}/100 - ${g.label}`;
    document.getElementById('gradeSub').textContent = g.sub;

    document.getElementById('resTakeHome').textContent = fmtDollar(availableCashMonthly);

    const leftoverCard = document.getElementById('leftoverCard');
    document.getElementById('resLeftover').textContent = fmtDollar(leftover);
    document.getElementById('resLeftoverSub').textContent = leftover >= 0 ? 'Buffer each month' : 'You are overspending!';
    leftoverCard.className = 'result-card ' + (leftover < 0 ? 'result-card--danger' : leftover < availableCashMonthly * 0.05 ? 'result-card--caution' : 'result-card--success');

    // DTI indicator
    const dtiEl = document.getElementById('dtiIndicator');
    if (dtiPct <= 36) {
        dtiEl.className = 'dti-indicator dti-safe';
        dtiEl.innerHTML = `✅ <strong>Debt-to-Income Ratio: ${fmtPct(dtiPct)}</strong> - Healthy. Below the 36% benchmark.`;
    } else if (dtiPct <= 43) {
        dtiEl.className = 'dti-indicator dti-caution';
        dtiEl.innerHTML = `⚠️ <strong>Debt-to-Income Ratio: ${fmtPct(dtiPct)}</strong> - Elevated. Aim to reduce below 36%.`;
    } else {
        dtiEl.className = 'dti-indicator dti-danger';
        dtiEl.innerHTML = `🚨 <strong>Debt-to-Income Ratio: ${fmtPct(dtiPct)}</strong> - Critical. Lenders flag anything above 43%. Prioritize debt reduction.`;
    }

    // Spending donut chart
    const chartLabels = ['Housing', 'Transport', 'Food', 'Debt Pmts', 'Lifestyle', 'Savings', 'Leftover'];
    const chartData   = [totalHousing, totalTransport, totalFood, totalDebtPayments, totalLifestyle, totalAfterTaxSavingsFromBank, Math.max(0, leftover)];
    const chartColors = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#d1d5db'];

    if (spendingChartInst) spendingChartInst.destroy();
    const ctx = document.getElementById('spendingChart').getContext('2d');
    spendingChartInst = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: chartLabels, datasets: [{ data: chartData, backgroundColor: chartColors, borderWidth: 2, borderColor: '#fff' }] },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '62%',
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 10 } },
                tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${fmtDollar(ctx.parsed)} (${availableCashMonthly > 0 ? fmtPct(ctx.parsed / availableCashMonthly * 100) : '0%'})` } }
            }
        }
    });

    /* ── 9. 50/30/20 BARS ── */
    function threeBar(label, pct, target, maxOk, minOk) {
        const ok   = (label === 'Savings' ? pct >= minOk : pct <= maxOk);
        const warn = (label === 'Savings' ? (pct >= minOk * 0.5 && pct < minOk) : (pct > maxOk && pct <= maxOk * 1.2));
        const cls  = ok ? 'tbc-ok' : warn ? 'tbc-warn' : 'tbc-bad';
        return `<div class="three-bar-cell ${cls}">
            <div class="tbc-label">${label}</div>
            <div class="tbc-pct">${fmtPct(pct)}</div>
            <div class="tbc-target">Target: ${target}</div>
        </div>`;
    }
    document.getElementById('threeBarGrid').innerHTML =
        threeBar('Needs', needsPct, '≤ 50%', 50, 0) +
        threeBar('Wants', wantsPct, '≤ 30%', 30, 0) +
        threeBar('Savings', savingsPct2, '≥ 20%', 100, 20);

    let narrative = '';
    if (needsPct > 60) narrative += `⚠️ Your needs are consuming <strong>${fmtPct(needsPct)}</strong> of income - far above the 50% guideline. Housing and essential expenses are crowding out savings and wants. `;
    if (wantsPct > 35) narrative += `🎯 Lifestyle spending is at <strong>${fmtPct(wantsPct)}</strong> - trimming dining, entertainment, or subscriptions could free up significant cash. `;
    if (savingsPct2 < 10) narrative += `🚨 Only <strong>${fmtPct(savingsPct2)}</strong> going toward savings - well below the 20% target. This will significantly delay financial independence. `;
    else if (savingsPct2 >= 20) narrative += `✅ Great savings discipline at <strong>${fmtPct(savingsPct2)}</strong> - you're on track to build real wealth over time. `;
    document.getElementById('ruleNarrative').innerHTML = narrative;

    /* ── 10. CATEGORY STATUS LIST ── */
    const categories = [];

    // Housing (vs gross)
    const hCls   = housingRatioPct <= 28 ? 'cs-ok' : housingRatioPct <= 36 ? 'cs-warn' : 'cs-bad';
    const hEmoji = housingRatioPct <= 28 ? '✅' : housingRatioPct <= 36 ? '⚠️' : '🚨';
    const hNote  = housingRatioPct <= 28 ? 'Within the 28% guideline' : housingRatioPct <= 36 ? 'Slightly above 28% - manageable' : 'Over 36% of gross - house-poor risk';
    categories.push({ emoji: hEmoji, name: 'Housing', amount: totalHousing, pct: housingRatioPct, note: hNote, cls: hCls, base: 'gross' });

    // Transport (vs available cash)
    const tPct   = availableCashMonthly > 0 ? (totalTransport / availableCashMonthly) * 100 : 0;
    const tCls   = tPct <= 15 ? 'cs-ok' : tPct <= 20 ? 'cs-warn' : 'cs-bad';
    const tEmoji = tPct <= 15 ? '✅' : tPct <= 20 ? '⚠️' : '🚨';
    const tNote  = tPct <= 15 ? 'Efficient transport spend' : tPct <= 20 ? 'Slightly high - consider refinancing car or reducing costs' : 'Transportation is consuming too much income';
    categories.push({ emoji: tEmoji, name: 'Transportation', amount: totalTransport, pct: tPct, note: tNote, cls: tCls, base: 'take-home' });

    // Food (vs available cash)
    const fPct   = availableCashMonthly > 0 ? (totalFood / availableCashMonthly) * 100 : 0;
    const fCls   = fPct <= 10 ? 'cs-ok' : fPct <= 15 ? 'cs-warn' : 'cs-bad';
    const fEmoji = fPct <= 10 ? '✅' : fPct <= 15 ? '⚠️' : '🚨';
    const fNote  = fPct <= 10 ? 'Food costs well managed' : fPct <= 15 ? 'Dining out may be adding up' : 'Food spending is high - try meal prep to cut costs';
    categories.push({ emoji: fEmoji, name: 'Food & Dining', amount: totalFood, pct: fPct, note: fNote, cls: fCls, base: 'take-home' });

    // DTI (vs gross) - uses same dtiPct as the main indicator
    const dCls   = dtiPct <= 36 ? 'cs-ok' : dtiPct <= 43 ? 'cs-warn' : 'cs-bad';
    const dEmoji = dtiPct <= 36 ? '✅' : dtiPct <= 43 ? '⚠️' : '🚨';
    const dNote  = dtiPct <= 36 ? 'Debt load is manageable' : dtiPct <= 43 ? 'Approaching the 43% lender threshold' : 'Debt-to-income is critical - debt payoff should be priority #1';
    categories.push({ emoji: dEmoji, name: 'Debt Payments (Back-End DTI)', amount: totalDebtForDTI, pct: dtiPct, note: dNote, cls: dCls, base: 'gross' });

    // Lifestyle (vs available cash)
    const lPct   = availableCashMonthly > 0 ? (totalLifestyle / availableCashMonthly) * 100 : 0;
    const lCls   = lPct <= 25 ? 'cs-ok' : lPct <= 35 ? 'cs-warn' : 'cs-bad';
    const lEmoji = lPct <= 25 ? '✅' : lPct <= 35 ? '⚠️' : '🚨';
    const lNote  = lPct <= 25 ? 'Lifestyle spending is disciplined' : lPct <= 35 ? 'Some lifestyle expenses worth auditing' : 'Lifestyle costs are significantly crowding out savings';
    categories.push({ emoji: lEmoji, name: 'Lifestyle & Personal', amount: totalLifestyle, pct: lPct, note: lNote, cls: lCls, base: 'take-home' });

    // Savings rate (vs gross, including employer match)
    const sCls   = savingsRate >= 20 ? 'cs-ok' : savingsRate >= 10 ? 'cs-warn' : 'cs-bad';
    const sEmoji = savingsRate >= 20 ? '✅' : savingsRate >= 10 ? '⚠️' : '🚨';
    const sNote  = savingsRate >= 20 ? 'Excellent savings rate - building wealth fast' : savingsRate >= 10 ? 'Decent - aim to push toward 20% of gross' : 'Savings rate is too low - retirement at risk';
    categories.push({ emoji: sEmoji, name: 'Savings Rate (incl. 401k/Match)', amount: totalSavingsIncl401k, pct: savingsRate, note: sNote, cls: sCls, base: 'gross' });

    // Emergency fund
    const efCls   = efMonthsRaw >= 6 ? 'cs-ok' : efMonthsRaw >= 3 ? 'cs-warn' : 'cs-bad';
    const efEmoji = efMonthsRaw >= 6 ? '✅' : efMonthsRaw >= 3 ? '⚠️' : '🚨';
    const efLabel = efMonths >= 24 ? '24+' : efMonths.toFixed(1);
    const efNote  = efMonthsRaw >= 12 ? `${efLabel} months covered - outstanding financial cushion`
                  : efMonthsRaw >= 6  ? `${efLabel} months covered - fully funded`
                  : efMonthsRaw >= 3  ? `${efLabel} months covered - keep building`
                                      : `${efLabel} months covered - critically underfunded`;
    categories.push({ emoji: efEmoji, name: 'Emergency Fund', amount: currentEmergencyFund, pct: efMonths, note: efNote, cls: efCls, base: 'months' });

    // CC debt (if present)
    if (ccBalance > 0) {
        const ccCls   = ccAPR < 12 ? 'cs-warn' : 'cs-bad';
        const ccEmoji = ccAPR < 12 ? '⚠️' : '🚨';
        const ccNote  = `${fmtDollar(ccInterestMonthly)}/mo in interest at ${ccAPR}% APR - paying off = guaranteed ${ccAPR}% return`;
        categories.push({ emoji: ccEmoji, name: 'Credit Card Debt', amount: ccBalance, pct: ccAPR, note: ccNote, cls: ccCls, base: 'balance' });
    }

    // Employer match (if employer offers one)
    const matchNeeded = grossMonthly * empMatchPct / 100;
    if (empMatchPct > 0) {
        const matchCapture = (contrib401kMo + roth401kMo) >= matchNeeded;
        const mCls   = matchCapture ? 'cs-ok' : 'cs-bad';
        const mEmoji = matchCapture ? '✅' : '🚨';
        const mNote  = matchCapture
            ? `Capturing full employer match of ${fmtDollar(employerMatchMonthly)}/mo 🎉`
            : `Not capturing full match - contribute ${fmtDollar(matchNeeded)}/mo to unlock ${fmtDollar(employerMatchMonthly)}/mo free`;
        categories.push({ emoji: mEmoji, name: 'Employer 401(k) Match', amount: employerMatchMonthly, pct: empMatchPct, note: mNote, cls: mCls, base: 'match' });
    }

    document.getElementById('categoryStatusList').innerHTML = categories.map(cat => {
        let amtDisplay = fmtDollar(cat.amount) + '/mo';
        let pctDisplay = '';
        if (cat.base === 'months')  { amtDisplay = fmtDollar(cat.amount) + ' saved';   pctDisplay = `${cat.pct <= 23.9 ? cat.pct.toFixed(1) : '24+'} mo`; }
        else if (cat.base === 'balance') { amtDisplay = fmtDollar(cat.amount) + ' bal'; pctDisplay = `${cat.pct}% APR`; }
        else if (cat.base === 'match')   { amtDisplay = fmtDollar(cat.amount) + '/mo'; pctDisplay = `${cat.pct}% match`; }
        else { pctDisplay = fmtPct(cat.pct) + ' of ' + (cat.base === 'gross' ? 'gross' : 'take-home'); }
        return `
        <div class="category-status-row ${cat.cls}">
            <span class="cs-icon">${cat.emoji}</span>
            <div style="flex:1;min-width:0;">
                <div class="cs-name">${cat.name}</div>
                <div class="cs-pct">${cat.note}</div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
                <div class="cs-amount">${amtDisplay}</div>
                <div class="cs-pct">${pctDisplay}</div>
            </div>
        </div>`;
    }).join('');

    /* ── 11. PRIORITY ACTION PLAN ── */
    const actions = [];

    // Negative leftover - most critical
    if (leftover < 0) {
        actions.push({ level: 'p-critical', numCls: 'pn-red',
            title: 'You Are Overspending by ' + fmtDollar(Math.abs(leftover)) + '/mo',
            body: `Your monthly expenses exceed your available income by ${fmtDollar(Math.abs(leftover))}. This is unsustainable and is likely being funded by credit card debt or savings depletion. Immediately audit every non-essential category and cut until you have a positive buffer.` });
    }

    // Not capturing employer match
    if (empMatchPct > 0 && (contrib401kMo + roth401kMo) < matchNeeded) {
        const gap = matchNeeded - (contrib401kMo + roth401kMo);
        actions.push({ level: 'p-critical', numCls: 'pn-red',
            title: 'You Are Leaving ' + fmtDollar(employerMatchMonthly) + '/mo on the Table',
            body: `Your employer offers a ${empMatchPct}% 401(k) match but you are not contributing enough to capture it. Increase your contributions by ${fmtDollar(gap)}/mo. This is literally free money - an instant 100% return on that contribution before any investment growth.` });
    }

    // High-APR CC debt
    if (ccBalance > 0 && ccAPR >= 15) {
        actions.push({ level: 'p-critical', numCls: 'pn-red',
            title: `High-Interest Credit Card Debt (${ccAPR}% APR)`,
            body: `You are paying approximately ${fmtDollar(ccInterestMonthly)}/mo ($${Math.round(ccInterestMonthly * 12).toLocaleString()}/yr) in interest on your ${fmtDollar(ccBalance)} balance. No investment reliably beats a guaranteed ${ccAPR}% return from paying this off. After capturing your employer match, throw every extra dollar here using the avalanche method.` });
    }

    // Emergency fund underfunded
    if (efMonthsRaw < 3) {
        const dollarNeeded = essentialMonthly * (3 - Math.min(efMonthsRaw, 3));
        actions.push({ level: 'p-critical', numCls: 'pn-red',
            title: `Emergency Fund: Only ${efMonths.toFixed(1)} Months of Coverage`,
            body: `You need at least 3 months of expenses (${fmtDollar(essentialMonthly)}/mo) in liquid savings. You need approximately ${fmtDollar(dollarNeeded)} more. Any unexpected expense right now forces you into high-interest debt. Prioritize this before aggressive investing.` });
    } else if (efMonthsRaw < 6) {
        actions.push({ level: 'p-important', numCls: 'pn-yellow',
            title: `Continue Building Emergency Fund to 6 Months`,
            body: `You have ${efMonths.toFixed(1)} months of coverage - good, but aim for 6 months for full financial security. Continue contributing ${fmtDollar(emergencyFundContrib)}/mo until the gap is closed. Your target balance is ${fmtDollar(essentialMonthly * 6)}.` });
    }

    // DTI elevated
    if (dtiPct > 43) {
        actions.push({ level: 'p-critical', numCls: 'pn-red',
            title: `Debt-to-Income at ${fmtPct(dtiPct)} - Above the 43% Critical Threshold`,
            body: `At this DTI, you will be denied most mortgages and are in a financially fragile position. Focus on aggressively paying down non-housing debt. Every $100/mo of debt eliminated improves your DTI and frees up cash flow.` });
    } else if (dtiPct > 36) {
        actions.push({ level: 'p-important', numCls: 'pn-yellow',
            title: `Debt-to-Income at ${fmtPct(dtiPct)} - Approaching the Limit`,
            body: `You are above the 36% healthy threshold. Avoid taking on any new debt and accelerate paydown of the highest-rate balances to bring this below 36%.` });
    }

    // Housing high
    if (housingRatioPct > 36) {
        actions.push({ level: 'p-critical', numCls: 'pn-red',
            title: `Housing at ${fmtPct(housingRatioPct)} of Gross Income`,
            body: `Housing costs above 36% of gross income indicate you may be house-poor. If renting, consider a smaller unit or roommate. If owning, explore refinancing options or additional income streams to bring this ratio down.` });
    } else if (housingRatioPct > 28) {
        actions.push({ level: 'p-important', numCls: 'pn-yellow',
            title: `Housing at ${fmtPct(housingRatioPct)} - Above the 28% Rule`,
            body: `Try to keep total housing below 28% of gross. You may want to be cautious about increasing other expenses until income grows or housing costs decrease.` });
    }

    // Low savings rate
    if (savingsRate < 10) {
        actions.push({ level: 'p-important', numCls: 'pn-yellow',
            title: `Savings Rate at ${fmtPct(savingsRate)} of Gross - Too Low`,
            body: `At this savings rate, retirement will likely require working well into your 60s. After clearing high-interest debt and fully funding your emergency fund, begin aggressively increasing your savings rate. Even an extra ${fmtDollar(effectiveGrossAnnual / 12 * 0.05)}/mo (5% of gross) would make a meaningful difference over decades of compounding.` });
    }

    // Positive signals
    if (savingsRate >= 20) {
        actions.push({ level: 'p-good', numCls: 'pn-green',
            title: `Excellent Savings Rate: ${fmtPct(savingsRate)}`,
            body: `You are saving over 20% of gross income - this is exceptional. At this rate, you may be on track for early retirement or financial independence. Make sure your savings are in the right vehicles: 401k first (for match), then Roth IRA (up to $7,000/yr), then brokerage.` });
    }

    if (dtiPct <= 36 && leftover > 0 && savingsRate >= 15 && efMonthsRaw >= 6) {
        actions.push({ level: 'p-good', numCls: 'pn-green',
            title: `Your Budget Is in Strong Shape`,
            body: `DTI is healthy, you have an adequate emergency fund, and your savings rate is solid. Your next focus should be optimizing your investment allocation and potentially increasing your income through skills, raises, or side hustles to further accelerate wealth building.` });
    }

    if (actions.length === 0) {
        actions.push({ level: 'p-good', numCls: 'pn-green',
            title: `No Critical Issues Detected`,
            body: `Your budget appears well-structured. Enter more details to get a more complete analysis.` });
    }

    document.getElementById('priorityList').innerHTML = actions.map((a, i) => `
        <div class="priority-item ${a.level}">
            <div class="priority-num ${a.numCls}">${i + 1}</div>
            <div class="priority-text">
                <strong>${a.title}</strong>
                <p>${a.body}</p>
            </div>
        </div>`).join('');

    /* ── 12. FLOATING PILL ── */
    const floatEl  = document.getElementById('budgetFloat');
    const floatVal = document.getElementById('budgetFloatValue');
    const floatSub = document.getElementById('budgetFloatSub');
    floatVal.textContent = `Grade: ${g.grade} (${score}/100)`;
    floatSub.textContent = leftover >= 0 ? `${fmtDollar(leftover)}/mo leftover` : `${fmtDollar(Math.abs(leftover))}/mo over budget`;
    floatEl.style.borderLeftColor = score >= 80 ? 'var(--green)' : score >= 60 ? 'var(--yellow)' : 'var(--red)';
    
    handleScrollFloat();
}

// ── Reset ──────────────────────────────────────────────────────────────────────

function resetAll() {
    STATE_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.tagName === 'SELECT') {
            el.selectedIndex = 0;
        } else {
            el.value = '';
        }
    });

    document.getElementById('payFreq').value = '24';
    document.getElementById('filingStatus').value = 'single';
    document.getElementById('housingType').value = 'rent';
    
    localStorage.removeItem('budgetCalcData');

    document.getElementById('paycheckBreakdown').innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Enter your gross salary or actual paycheck above to see a full breakdown.</p>';
    document.getElementById('scorePlaceholder').style.display = 'block';
    document.getElementById('scoreSection').style.display = 'none';
    document.getElementById('ruleCard').style.display = 'none';
    document.getElementById('categoryCard').style.display = 'none';
    document.getElementById('priorityCard').style.display = 'none';
    document.getElementById('budgetFloat').classList.remove('visible');
    
    if (spendingChartInst) { spendingChartInst.destroy(); spendingChartInst = null; }
}

// ── LocalStorage ──────────────────────────────────────────────────────────────

function saveToStorage() {
    const data = {};
    STATE_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) data[id] = el.value;
    });
    localStorage.setItem('budgetCalcData', JSON.stringify(data));
}

function loadFromStorage() {
    const saved = localStorage.getItem('budgetCalcData');
    if (!saved) return;
    const data = JSON.parse(saved);
    Object.entries(data).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el && val !== undefined) el.value = val;
    });
}

// ── Sharing & Export ─────────────────────────────────────────────────────────

function copyShareLink() {
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

    return hasParams;
}

// ── Floating Pill Scroll Logic ─────────────────────────────────────────
function handleScrollFloat() {
    const isScrolledDown = window.scrollY > 150;
    const floatEl = document.getElementById('budgetFloat');
    if (!floatEl) return;
    
    const resultsCard = document.getElementById('resultsCard');
    let isOffScreen = true;
    
    if (resultsCard) {
        const rect = resultsCard.getBoundingClientRect();
        isOffScreen = rect.top > window.innerHeight || rect.bottom < 0;
    }

    const hasSomeIncome = parseFmt('grossSalary') > 0 || parseFmt('actualPaycheck') > 0;

    if (isScrolledDown && isOffScreen && hasSomeIncome) {
        floatEl.classList.add('visible');
    } else {
        floatEl.classList.remove('visible');
    }
}

// ── Generate PDF ─────────────────────────────────────────────────────────
async function downloadPDF() {
    const { jsPDF } = window.jspdf;

    const btn = document.getElementById('downloadPdfBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Generating...';
    btn.disabled = true;

    const gradeSplit = result('gradeText').split('-');
    const displayGrade = result('gradeBadge') + (gradeSplit[0] ? ' (' + gradeSplit[0].trim() + ')' : '');

    const actions = [];
    document.querySelectorAll('.priority-item').forEach(item => {
        const title = item.querySelector('strong')?.textContent;
        const desc = item.querySelector('p')?.textContent;
        if(title && desc) actions.push(`${title}: ${desc}`);
    });

    const categoryStats = [];
    document.querySelectorAll('.category-status-row').forEach(row => {
        const name = row.querySelector('.cs-name')?.textContent || '';
        const pct = row.querySelector('.cs-pct:last-child')?.textContent || '';
        if(name && pct) categoryStats.push({ label: name, value: pct });
    });

    const REPORT = {
        title:    'Budget Analysis Report',
        filename: 'Budget-Report.pdf',
        logoPath: `${API_BASE}/static/logo.png`,
        
        summary: [
            { label: 'Budget Grade',           value: displayGrade,          accent: true },
            { label: 'Monthly Available Cash', value: result('resTakeHome'), accent: true },
            { label: 'Monthly Leftover',       value: result('resLeftover'), accent: false },
            { label: 'DTI Ratio',              value: getDtiText(),          accent: false }
        ],

        sections: [
            {
                heading: 'Income & Paycheck (Monthly)',
                items: [
                    { label: 'Gross Annual Salary',   value: get('grossSalary') ? '$' + get('grossSalary') : '--' },
                    { label: 'Actual Paycheck',       value: get('actualPaycheck') ? '$' + get('actualPaycheck') : '' },
                    { label: 'Side Income',           value: get('sideIncome') ? '$' + get('sideIncome') : '' },
                    { label: '401(k) Pre-Tax',        value: get('contrib401kAmt') ? '$' + get('contrib401kAmt') : '' },
                    { label: 'Roth 401(k)',           value: get('roth401kAmt') ? '$' + get('roth401kAmt') : '' },
                    { label: 'Health Insurance',      value: get('healthInsurance') ? '$' + get('healthInsurance') : '' },
                    { label: 'HSA / FSA',             value: get('hsaFsa') ? '$' + get('hsaFsa') : '' }
                ].filter(i => i.value)
            },
            {
                heading: 'Savings & Investments (Monthly)',
                items: [
                    { label: 'Roth IRA',              value: get('rothIRA') ? '$' + get('rothIRA') : '' },
                    { label: 'Emergency Fund',        value: get('emergencyFund') ? '$' + get('emergencyFund') : '' },
                    { label: 'Brokerage',             value: get('brokerageInvest') ? '$' + get('brokerageInvest') : '' },
                    { label: 'Other Savings',         value: get('otherSavings') ? '$' + get('otherSavings') : '' },
                ].filter(i => i.value)
            },
            {
                heading: 'Housing & Utilities (Monthly)',
                items: [
                    { label: 'Rent/Mortgage',         value: get('rentMortgage') ? '$' + get('rentMortgage') : '' },
                    { label: 'Utilities',             value: get('utilities') ? '$' + get('utilities') : '' },
                    { label: 'Internet',              value: get('internet') ? '$' + get('internet') : '' },
                    { label: 'Renter/Home Ins.',      value: get('rentersInsurance') ? '$' + get('rentersInsurance') : '' },
                    { label: 'HOA/Maintenance',       value: get('hoaMaint') ? '$' + get('hoaMaint') : '' },
                ].filter(i => i.value)
            },
            {
                heading: 'Transportation (Monthly)',
                items: [
                    { label: 'Car Payment',           value: get('carPayment') ? '$' + get('carPayment') : '' },
                    { label: 'Car Insurance',         value: get('carInsurance') ? '$' + get('carInsurance') : '' },
                    { label: 'Gas',                   value: get('gas') ? '$' + get('gas') : '' },
                    { label: 'Parking/Tolls',         value: get('parkingTolls') ? '$' + get('parkingTolls') : '' },
                    { label: 'Car Maintenance',       value: get('carMaintenance') ? '$' + get('carMaintenance') : '' },
                ].filter(i => i.value)
            },
            {
                heading: 'Food & Lifestyle (Monthly)',
                items: [
                    { label: 'Groceries',             value: get('groceries') ? '$' + get('groceries') : '' },
                    { label: 'Dining Out',            value: get('diningOut') ? '$' + get('diningOut') : '' },
                    { label: 'Subscriptions',         value: get('subscriptions') ? '$' + get('subscriptions') : '' },
                    { label: 'Entertainment',         value: get('entertainment') ? '$' + get('entertainment') : '' },
                    { label: 'Clothing',              value: get('clothing') ? '$' + get('clothing') : '' },
                    { label: 'Family Care',           value: get('familyCare') ? '$' + get('familyCare') : '' },
                ].filter(i => i.value)
            },
            {
                heading: 'Debt Payments (Monthly)',
                items: [
                    { label: 'Credit Card Min',       value: get('creditCardMin') ? '$' + get('creditCardMin') : '' },
                    { label: 'Student Loan',          value: get('studentLoan') ? '$' + get('studentLoan') : '' },
                    { label: 'Personal Loan',         value: get('personalLoan') ? '$' + get('personalLoan') : '' },
                    { label: 'Other Debt',            value: get('otherDebt') ? '$' + get('otherDebt') : '' },
                ].filter(i => i.value)
            },
            {
                heading: 'Category Ratio Breakdown',
                items: categoryStats
            }
        ].filter(s => s.items.length > 0),
        
        actionPlan: actions
    };

    // Rendering Engine (Identical to Retirement planner)
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

    let logoImg = null;
    try {
        logoImg = await new Promise((res, rej) => {
            const img = new Image();
            img.onload = () => res(img);
            img.onerror = rej;
            img.src = REPORT.logoPath;
        });
    } catch (_) { }

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

    const ROW_H = 14;
    if (REPORT.sections && REPORT.sections.length > 0) {
        REPORT.sections.forEach((sec) => {
            sectionHeading(sec.heading);
            sec.items.forEach((item, i) => {
                if (y + ROW_H > PH - 50) { doc.addPage(); y = 50; }
                if (i % 2 === 1) {
                    sc(STRIPE, 'fill');
                    doc.rect(ML, y, CW, 14, 'F');
                }
                doc.setFontSize(8.5);
                sc(MUTED, 'text'); doc.setFont(undefined, 'normal');
                t(item.label, ML + 6, y + 10);
                sc(INK, 'text'); doc.setFont(undefined, 'bold');
                t(String(item.value), ML + CW - 6, y + 10, { align: 'right' });
                y += ROW_H;
            });
            hRule(ML, CW, 0.5, RULE);
            y += 4;
        });
    }

    if (REPORT.actionPlan && REPORT.actionPlan.length > 0) {
        doc.addPage();
        y = 50; 

        sectionHeading('Next Steps & Action Plan');

        doc.setFontSize(9.5);
        doc.setFont(undefined, 'normal');

        const lineHt = 13;
        const stepSpacing = 10; 
        let boxH = 20;

        const stepsData = REPORT.actionPlan.map(step => {
            return doc.splitTextToSize(step, CW - 50); 
        });

        stepsData.forEach((lines, i) => {
            boxH += lines.length * lineHt;
            if (i < stepsData.length - 1) boxH += stepSpacing;
        });

        if (y + boxH > PH - 50) { doc.addPage(); y = 50; }

        sc(STRIPE, 'fill'); 
        doc.roundedRect(ML, y, CW, boxH, 3, 3, 'F');

        sc(ACCENT, 'draw');
        doc.setLineWidth(2);
        doc.line(ML, y, ML, y + boxH);

        sc(INK, 'text');

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
    btn.innerHTML = '✓ Saved!';
    btn.disabled = false;
    setTimeout(() => (btn.innerHTML = originalText), 2000);
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    const loadedFromUrl = loadFromUrl();

    if (!loadedFromUrl) {
        loadFromStorage();
    } 

    if (loadedFromUrl) {
        setTimeout(() => {
            const el = document.querySelector('.share-btn');
            if (el) {
                const yOffset = -120;
                const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
                window.scrollTo({ top: y, behavior: 'smooth' });
            }
        }, 50);
    }
    
    await initTaxData();

    // Run calculate if any income data exists
    if (parseFmt('grossSalary') > 0 || parseFmt('actualPaycheck') > 0) {
        calculate();
    }

    window.addEventListener('scroll', handleScrollFloat);
});
