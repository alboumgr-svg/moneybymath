/* ── Mobile sizing for chartCardShow nodes ── */
(function() {
    if (document.getElementById('cfChartNodeStyle')) return;
    const s = document.createElement('style');
    s.id = 'cfChartNodeStyle';
    s.textContent = `
        .cf-node {
            border-radius: 6px;
            padding: 5px 10px;
            text-align: center;
            min-width: 80px;
        }
        .cf-line {
            flex: 1;
            min-width: 14px;
        }
        @media (max-width: 550px) {
            .cf-node {
                padding: 3px 5px;
                min-width: 54px;
            }
            /* Target the labels and values inside the node */
            .cf-node div {
                font-size: 0.35rem !important; 
                line-height: 1.5;
            }
            /* Specific fix for the bold dollar amounts to keep them tiny */
            .cf-node div[style*="font-weight:700"], 
            .cf-node div[style*="font-weight: 700"] {
                font-size: 0.35rem !important;
            }
            .cf-line {
                min-width: 5px;
            }
        }
    `;
    document.head.appendChild(s);
})();

let coastChart = null;
let resultFindOffScreen = false;
let resultTrackOffScreen = false;

const STATE_IDS = [
    'currentAge', 'retirementAge', 'currentSavings', 'annualSpending', 'withdrawalRate',
    'returnRate', 'coastTargetAge', 'userMonthlySavings'
];

let taxData = null;
let originalSpending = null; // Stores pre-tax-adjustment spending value

const API_BASE = window.location.origin; 

// Fetch the tax data when the script loads
async function fetchTaxData() {
    try {
        const response = await fetch(`${API_BASE}/static/taxData.json`);
        taxData = await response.json();

        // Re-apply checkbox adjustment if it was restored before taxData was ready
        const cb = document.getElementById('taxAccountCheckbox');
        if (cb && cb.checked) {
            restoreTaxCheckboxUI(); // was: handleTaxCheckbox()
        } else {
            updateTaxBuffer();
        }
    } catch (error) {
        console.error("Could not load tax data:", error);
    }
}

// Calculate total federal tax based on a gross withdrawal
function calculateFederalTax(grossIncome, status = 'single') {
    if (!taxData) return 0;
    const sd = taxData.STANDARD_DEDUCTIONS[status];
    const brackets = taxData.BRACKETS[status];
    let taxableIncome = Math.max(0, grossIncome - sd);
    let tax = 0;

    for (let i = 0; i < brackets.length; i++) {
        const [min, max, rate] = brackets[i];
        const upper = max === null ? Infinity : max;
        if (taxableIncome > min) {
            const amountInBracket = Math.min(taxableIncome, upper) - min;
            tax += amountInBracket * rate;
        } else {
            break;
        }
    }
    return tax;
}

// Reverse-engineer the gross withdrawal needed to hit the target net spending
function getGrossForNet(targetNet, status = 'single') {
    if (!taxData || targetNet <= 0) return targetNet;

    let low = targetNet;
    let high = targetNet * 2; // Safe upper bound since highest tax bracket is 37%
    let iterations = 0;

    // Binary search to find the exact gross amount
    while (high - low > 0.01 && iterations < 50) {
        let mid = (low + high) / 2;
        let tax = calculateFederalTax(mid, status);
        let net = mid - tax;

        if (net > targetNet) {
            high = mid;
        } else {
            low = mid;
        }
        iterations++;
    }
    return (low + high) / 2;
}

// Update the UI
function updateTaxBuffer() {
    const spendingRaw = document.getElementById('annualSpending').value;
    const noteEl = document.getElementById('taxBufferNote');
    const checkboxWrapper = document.getElementById('taxCheckboxWrapper');
    if (!noteEl) return;

    // If checkbox is checked, the field already holds the gross value — don't overwrite the note
    const cb = document.getElementById('taxAccountCheckbox');
    if (cb && cb.checked) return;

    const netSpending = parseFormattedNumber(spendingRaw);

    if (!taxData || isNaN(netSpending) || netSpending <= 0) {
        noteEl.textContent = "If withdrawing from a pre-tax account, add a buffer to account for taxes.";
        if (checkboxWrapper) checkboxWrapper.style.display = 'none';
        return;
    }

    const grossNeeded = getGrossForNet(netSpending, 'single');
    const taxBuffer = grossNeeded - netSpending;

    if (taxBuffer > 0) {
        const formattedBuffer = Math.round(taxBuffer).toLocaleString('en-US');
        const formattedGross = Math.round(grossNeeded).toLocaleString('en-US');
        noteEl.innerHTML = `Pre-tax account? Add <strong>$${formattedBuffer}</strong> for federal taxes (Single filer) → <strong>$${formattedGross}</strong> total.`;
        if (checkboxWrapper) checkboxWrapper.style.display = 'flex';
    } else {
        noteEl.textContent = "This spending amount is fully covered by the standard deduction. No federal tax buffer needed.";
        if (checkboxWrapper) checkboxWrapper.style.display = 'none';
    }
}

// Called when the user types in the Annual Spending field
function onSpendingInput(input) {
    // If the tax checkbox is checked, typing new values should uncheck it and restore the label
    const cb = document.getElementById('taxAccountCheckbox');
    if (cb && cb.checked) {
        cb.checked = false;
        originalSpending = null;
        restoreSpendingLabel();
    }
    formatNumber(input);
    calculateCoastFIRE();
    saveToStorage();
}

// Restore the Annual Spending label to its default text
function restoreSpendingLabel() {
    const labelEl = document.getElementById('annualSpendingLabel');
    if (labelEl) labelEl.textContent = 'Annual Spending in Retirement ($)';
}

// Handle the pre-tax adjustment checkbox
function handleTaxCheckbox() {
    const cb = document.getElementById('taxAccountCheckbox');
    const spendingInput = document.getElementById('annualSpending');

    if (cb.checked) {
        const netSpending = parseFormattedNumber(spendingInput.value);
        if (isNaN(netSpending) || netSpending <= 0 || !taxData) {
            return; // taxData not ready yet — fetchTaxData() will re-run this once loaded
        }
        originalSpending = netSpending;
        const grossNeeded = getGrossForNet(netSpending, 'single');
        const taxBuffer = grossNeeded - netSpending;

        // Fill the field with the grossed-up value
        spendingInput.value = Math.round(grossNeeded).toLocaleString('en-US');

        // Update the label to show the breakdown
        const labelEl = document.getElementById('annualSpendingLabel');
        if (labelEl) {
            const fmtNet    = '$' + Math.round(netSpending).toLocaleString('en-US');
            const fmtBuffer = '$' + Math.round(taxBuffer).toLocaleString('en-US');
            const fmtGross  = '$' + Math.round(grossNeeded).toLocaleString('en-US');
            labelEl.innerHTML = `Annual Spending in Retirement&nbsp;<span style="font-weight:400; color:#6B7280; font-size:0.82em;">(${fmtNet} + ${fmtBuffer} tax&nbsp;=&nbsp;${fmtGross})</span>`;
        }

        // Update note to reflect the adjustment is applied
        const noteEl = document.getElementById('taxBufferNote');
        if (noteEl) noteEl.innerHTML = `✓ Tax adjustment applied. Field updated to reflect gross withdrawal needed.`;

    } else {
        // Restore original net spending value
        if (originalSpending !== null) {
            spendingInput.value = Math.round(originalSpending).toLocaleString('en-US');
            originalSpending = null;
        }
        restoreSpendingLabel();
        updateTaxBuffer(); // Recalculate note from restored value
    }

    calculateCoastFIRE();
    saveToStorage();
}

// Format number with commas
function formatNumber(input) {
    let value = input.value.replace(/,/g, '');
    if (!isNaN(value) && value !== '') {
        input.value = parseFloat(value).toLocaleString('en-US');
    }
}

// Parse formatted number - Returns NaN if invalid instead of defaulting to 0
function parseFormattedNumber(value) {
    if (typeof value === 'string') {
        const parsed = parseFloat(value.replace(/,/g, ''));
        return isNaN(parsed) ? NaN : parsed;
    }
    const parsedNum = parseFloat(value);
    return isNaN(parsedNum) ? NaN : parsedNum;
}

// Get future date
function getFutureDate(years, months) {
    const date = new Date();
    date.setMonth(date.getMonth() + Math.round(years * 12) + months);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// ── Floating pills ────────────────────────────────────────────────────────────
function syncCoastFloat() {
    const activeTab    = document.querySelector('.mode-btn.active')?.dataset.tab || 'find';
    const isScrolledDown = window.scrollY > 150;

    // ── Find pill ──────────────────────────────────────────
    const findFloatEl  = document.getElementById('findFloat');
    const findValueEl  = document.getElementById('findFloat-value');
    const findSubEl    = document.getElementById('findFloat-sub');
    // Grab the main text label (the first div without an ID)
    const findLabelEl  = findFloatEl ? findFloatEl.querySelector('.float-label:not(#findFloat-sub)') : null;

    // ── Track pill ─────────────────────────────────────────
    const trackFloatEl = document.getElementById('trackFloat');
    const trackValueEl = document.getElementById('trackFloat-value');
    const trackSubEl   = document.getElementById('trackFloat-sub');
    // Grab the main text label (the first div without an ID)
    const trackLabelEl = trackFloatEl ? trackFloatEl.querySelector('.float-label:not(#trackFloat-sub)') : null;
    const trackMonthlySavingsEl = document.getElementById('trackMonthlySavings');
    const userSavingsRateEl = document.getElementById('userSavingsRate');

    // ── Check for missing inputs ──────────────────────────
    const ageRaw      = document.getElementById('currentAge')?.value.trim();
    const retAgeRaw   = document.getElementById('retirementAge')?.value.trim();
    const savingsRaw  = document.getElementById('currentSavings')?.value.trim();
    const spendingRaw = document.getElementById('annualSpending')?.value.trim();
    const wRateRaw    = document.getElementById('withdrawalRate')?.value.trim();
    const rRateRaw    = document.getElementById('returnRate')?.value.trim();

    const hasMissingInputs = !ageRaw || !retAgeRaw || !savingsRaw || !spendingRaw || !wRateRaw || !rRateRaw;

    // Real-time rect check so tab switches are instant
    const findCard = document.getElementById('results-find');
    if (findCard && getComputedStyle(findCard).display !== 'none') {
        const rect = findCard.getBoundingClientRect();
        resultFindOffScreen = rect.bottom < 0 || rect.top > window.innerHeight;
    }

    const trackCard = document.getElementById('results-track');
    if (trackCard && getComputedStyle(trackCard).display !== 'none') {
        const rect = trackCard.getBoundingClientRect();
        resultTrackOffScreen = rect.bottom < 0 || rect.top > window.innerHeight;
    }

    const coastNumText   = document.getElementById('coastNumber')?.textContent || '--';
    const monthlySavText = document.getElementById('monthlySavings')?.textContent || '--';
    const userCoastText  = document.getElementById('userCoastTime')?.textContent || '--';
    const sourceEl       = document.getElementById('userCoastTime');
    const userCoastColor = sourceEl ? sourceEl.style.color : 'inherit';
    const userBalText    = document.getElementById('userBalAtCoast')?.textContent || '--';

    // ── Fill values & hide components if incomplete ─────────
    if (hasMissingInputs || coastNumText === '--') {
        if (findValueEl) findValueEl.textContent = "Please fill in inputs";
        if (findValueEl) findValueEl.style.color = '#6B7280';
        if (findSubEl) findSubEl.textContent = "";
        if (findLabelEl) findLabelEl.style.display = "none";
        if (trackValueEl) trackValueEl.textContent = "Please fill in inputs";

        if (trackSubEl) trackSubEl.textContent = "";
        if (trackLabelEl) trackLabelEl.style.display = "none";
        if (trackMonthlySavingsEl) trackMonthlySavingsEl.textContent = "";
    } else {
        if (findValueEl) findValueEl.textContent = coastNumText;
        if (findValueEl) findValueEl.style.color = '';
        if (findSubEl)   findSubEl.textContent   = 'Monthly Savings Needed: ' + monthlySavText;
        if (findLabelEl) findLabelEl.style.display = "";

        if (trackValueEl) trackValueEl.textContent = userCoastText;
        if (trackValueEl) trackValueEl.style.color = userCoastColor;
        if (trackSubEl)   trackSubEl.textContent   = (document.getElementById('userBalCardLabel')?.textContent || 'Portfolio at Coast') + ': ' + userBalText;
        if (trackLabelEl) trackLabelEl.style.display = "";
        if (trackMonthlySavingsEl && userSavingsRateEl) {
            trackMonthlySavingsEl.textContent = userSavingsRateEl.textContent;
        }
    }

    // ── Visibility ──────────────────────────────────────────
    const canShowFind = resultTrackOffScreen && resultFindOffScreen && isScrolledDown;
    if (findFloatEl) {
        if (canShowFind) findFloatEl.classList.add('visible');
        else             findFloatEl.classList.remove('visible');
    }

    const canShowTrack = resultFindOffScreen && resultTrackOffScreen && isScrolledDown && userCoastText !== '--';
    if (trackFloatEl) {
        if (canShowTrack) trackFloatEl.classList.add('visible');
        else              trackFloatEl.classList.remove('visible');
    }
}

function initCoastFloat() {
    const findCard  = document.getElementById('results-find');
    const trackCard = document.getElementById('results-track');
    if (!findCard && !trackCard) return;

    const observer = new IntersectionObserver(
        entries => {
            entries.forEach(entry => {
                if (entry.target === findCard)  resultFindOffScreen  = !entry.isIntersecting;
                if (entry.target === trackCard) resultTrackOffScreen = !entry.isIntersecting;
            });
            syncCoastFloat();
        },
        { threshold: 0.1 }
    );

    if (findCard)  observer.observe(findCard);
    if (trackCard) observer.observe(trackCard);

    window.addEventListener('scroll', syncCoastFloat);
}

// Safe money formatter - returns '--' for any non-finite value
function safeMoney(value) {
    if (value === null || value === undefined || !isFinite(value) || isNaN(value)) {
        return '--';
    }
    return '$' + value.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});
}

// Safe future-value annuity factor - handles returnRate = 0
function fvAnnuityFactor(monthlyRate, months) {
    if (monthlyRate === 0) return months;
    return (Math.pow(1 + monthlyRate, months) - 1) / monthlyRate;
}

// Show a validation error, or clear it when msg is empty
function setError(msg) {
    const el = document.getElementById('calcError');
    if (!el) return;
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
}

// Strictly wipe all outputs and destroy the chart
function clearOutputs() {
    // Standard dashboard metrics
    ['fiNumber', 'coastNumber', 'yearsToCoast', 'coastAge', 'coastDate', 'monthlySavings',
     'userCoastTime', 'userCoastAge', 'userCoastDate', 'userBalAtCoast', 'fiNumber2', 'coastNumber2']
        .forEach(id => { const e = document.getElementById(id); if (e) e.textContent = '--'; if (e) e.style.color = "black"});
    
    // Status text resets
    const status1 = document.getElementById('coastStatus');
    if (status1) { status1.textContent = 'Awaiting inputs...'; status1.style.color = '#6B7280'; }
    const status2 = document.getElementById('coastStatus2');
    if (status2) { status2.textContent = 'Awaiting inputs...'; status2.style.color = '#6B7280'; }

    // Explanation fragments
    ['subBalAtCoast', 'subBalAtRet', 'subGrowthYears', 'withOrwithout', 'explanationWording']
        .forEach(id => { const e = document.getElementById(id); if (e) e.textContent = ''; });

    // Wipe chart
    if (coastChart) {
        coastChart.destroy();
        coastChart = null;
    }
    syncCoastFloat();
}

// Tab switching
function switchTab(tab) {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    const activeBtns = document.querySelectorAll('.mode-btn[data-tab="' + tab + '"]');
    activeBtns.forEach(btn => btn.classList.add('active'));

    document.getElementById('tab-find').style.display  = tab === 'find'  ? '' : 'none';
    document.getElementById('tab-track').style.display = tab === 'track' ? '' : 'none';

    document.getElementById('results-find').style.display  = tab === 'find'  ? '' : 'none';
    document.getElementById('results-track').style.display = tab === 'track' ? '' : 'none';
    saveToStorage();
    calculateCoastFIRE();
    syncCoastFloat();
}

// Coast FIRE Calculator Function
function calculateCoastFIRE() {

    // 1. Get raw string values to check for emptiness
    const ageRaw      = document.getElementById('currentAge').value.trim();
    const retAgeRaw   = document.getElementById('retirementAge').value.trim();
    const savingsRaw  = document.getElementById('currentSavings').value.trim();
    const spendingRaw = document.getElementById('annualSpending').value.trim();
    const wRateRaw    = document.getElementById('withdrawalRate').value.trim();
    const rRateRaw    = document.getElementById('returnRate').value.trim();
    const coastTargetAgeRaw = document.getElementById('coastTargetAge').value.trim();
    const userMonthlyRaw    = document.getElementById('userMonthlySavings').value.trim();

    if (spendingRaw) {
        updateTaxBuffer();
    }

    // 2. If any strictly required field is blank, clear outputs silently and wait for them to type
    if (!ageRaw || !retAgeRaw || !savingsRaw || !spendingRaw || !wRateRaw || !rRateRaw ) {
        setError('Please fill in all inputs'); 
        clearOutputs();
        return;
    }

    // 3. Parse numbers
    const currentAge     = parseFloat(ageRaw);
    const retirementAge  = parseFloat(retAgeRaw);
    const currentSavings = parseFormattedNumber(savingsRaw);
    const annualSpending = parseFormattedNumber(spendingRaw);
    const withdrawalRate = parseFloat(wRateRaw) / 100;
    const returnRate     = parseFloat(rRateRaw) / 100;
    
    const coastTargetAge = coastTargetAgeRaw !== '' ? parseFloat(coastTargetAgeRaw) 
                                                    : (currentAge + (retirementAge - currentAge) / 2);
    const userMonthly    = userMonthlyRaw !== '' ? parseFormattedNumber(userMonthlyRaw) : 0;

    // ── Update the dynamic card label with the user's monthly savings ──
    const userSavingsRateEl = document.getElementById('userSavingsRate');

    if (userMonthly && userSavingsRateEl) {
        
        // Format to a readable currency string
        const formattedVal = '$' + userMonthly.toLocaleString('en-US');
        
        userSavingsRateEl.textContent = `Time Until Coast FIRE with ${formattedVal} saved per month`;
    }

    else {
        userSavingsRateEl.textContent = `Time Until Coast FIRE`;
    }

    updateTaxBuffer();

    

    // 4. Logical Validation (bounds, NaNs, impossible scenarios)
    if (isNaN(currentAge) || currentAge < 1 || currentAge > 99) {
        setError('Current age must be a number between 1 and 99.'); clearOutputs(); return;
    }
    if (isNaN(retirementAge) || retirementAge > 100) {
        setError('Retirement age must be 100 or below.'); clearOutputs(); return;
    }
    if (retirementAge <= currentAge) {
        setError('Retirement age must be greater than your current age.'); clearOutputs(); return;
    }
    if (retirementAge - currentAge < 2) {
        setError('You need at least 2 years until retirement to calculate Coast FIRE.'); clearOutputs(); return;
    }
    if (isNaN(currentSavings) || currentSavings < 0) {
        setError('Current savings must be $0 or more.'); clearOutputs(); return;
    }
    if (isNaN(annualSpending) || annualSpending <= 0) {
        setError('Annual spending must be greater than $0.'); clearOutputs(); return;
    }
    if (isNaN(withdrawalRate) || withdrawalRate <= 0 || withdrawalRate > 0.20) {
        setError('Withdrawal rate must be between 0.1% and 20%.'); clearOutputs(); return;
    }
    if (isNaN(returnRate) || returnRate < 0 || returnRate > 0.30) {
        setError('Expected annual return must be between 0% and 30%.'); clearOutputs(); return;
    }
    if (coastTargetAgeRaw !== '') {
        if (isNaN(coastTargetAge) || coastTargetAge <= currentAge) {
            setError('Target Coast FIRE age must be greater than your current age.'); clearOutputs(); return;
        }
        if (coastTargetAge >= retirementAge) {
            setError('Target Coast FIRE age must be less than your retirement age.'); clearOutputs(); return;
        }
    }
    if (userMonthlyRaw !== '' && (isNaN(userMonthly) || userMonthly < 0)) {
        setError('Monthly savings must be a valid number of $0 or more.'); clearOutputs(); return;
    }

    // All validation passed, clear errors
    setError(''); 
    
    // ── Core calculations ─────────────────────────────────────────────────────
    const fiNumber          = annualSpending / withdrawalRate;
    const yearsToRetirement = retirementAge - currentAge;
    const monthlyRate       = returnRate / 12;
    const maxMonths         = Math.floor(yearsToRetirement * 12);
    const coastNumber       = fiNumber / Math.pow(1 + monthlyRate, maxMonths);
    const targetMonths      = Math.max(1, Math.round((coastTargetAge - currentAge) * 12));

    document.getElementById('fiNumber').textContent    = safeMoney(fiNumber);
    document.getElementById('coastNumber').textContent = safeMoney(coastNumber);
    
    // Mirror into tab-2 result panel
    const fn2 = document.getElementById('fiNumber2');
    const cn2 = document.getElementById('coastNumber2');
    if (fn2) fn2.textContent = safeMoney(fiNumber);
    if (cn2) cn2.textContent = safeMoney(coastNumber);

    const statusElement         = document.getElementById('coastStatus');
    const yearsToCoastElement   = document.getElementById('yearsToCoast');
    const coastAgeElement       = document.getElementById('coastAge');
    const coastDateElement      = document.getElementById('coastDate');
    const monthlySavingsElement = document.getElementById('monthlySavings');

    let monthlySavings = 0;
    let monthsToCoast  = 0;

    const status2El = document.getElementById('coastStatus2');

    let retirementBal = currentSavings;
        for (let m = 1; m <= maxMonths; m++) {
            retirementBal = retirementBal * (1 + monthlyRate) + userMonthly;
        }
    
    if (currentSavings >= coastNumber) {
        statusElement.textContent     = 'You\'ve reached Coast FIRE!';
        statusElement.style.color     = 'var(--secondary)';
        yearsToCoastElement.textContent   = '0 years';
        coastAgeElement.textContent       = 'You\'re there!';
        coastDateElement.textContent      = '';
        monthlySavingsElement.textContent = '$0';
        if (status2El) { status2El.textContent = '\u2713 You\'ve reached Coast FIRE!'; status2El.style.color = 'var(--secondary)'; }
    } else {
        statusElement.textContent    = 'Keep saving!';
        statusElement.style.color    = 'var(--accent)';
        if (status2El) { status2El.textContent = '\u2192 Keep saving!'; status2El.style.color = 'var(--accent)'; }

        const monthsAfterCoast  = maxMonths - targetMonths;
        const requiredAtTarget  = monthsAfterCoast > 0 
            ? fiNumber / Math.pow(1 + monthlyRate, monthsAfterCoast) 
            : fiNumber;
        const fvCurrentAtTarget = currentSavings * Math.pow(1 + monthlyRate, targetMonths);
        const fvAnnuity         = fvAnnuityFactor(monthlyRate, targetMonths);
        
        monthlySavings = Math.max(0, (requiredAtTarget - fvCurrentAtTarget) / fvAnnuity);
        monthsToCoast  = targetMonths;

        const yearsToCoast    = monthsToCoast / 12;
        const yearsWhole      = Math.floor(yearsToCoast);
        const monthsRemainder = Math.round((yearsToCoast - yearsWhole) * 12);

        let timeString = '';
        if (yearsWhole > 0)      timeString += yearsWhole + ' year' + (yearsWhole !== 1 ? 's' : '');
        if (monthsRemainder > 0) {
            if (timeString) timeString += ', ';
            timeString += monthsRemainder + ' month' + (monthsRemainder !== 1 ? 's' : '');
        }
        if (!timeString) timeString = 'Less than 1 month';

        const cAgeYears  = Math.floor(coastTargetAge);
        const cAgeMonths = Math.round((coastTargetAge - cAgeYears) * 12);

        yearsToCoastElement.textContent   = timeString;
        coastAgeElement.textContent       = 'Age ' + cAgeYears + (cAgeMonths > 0 ? ', ' + cAgeMonths + ' mo' : '');
        coastDateElement.textContent      = 'Goal date: ' + getFutureDate(yearsWhole, monthsRemainder);
        monthlySavingsElement.textContent = safeMoney(monthlySavings);
    }

    // ── User custom monthly savings scenario ─────────────────────────────────
    const userTimeEl = document.getElementById('userCoastTime');
    const userAgeEl  = document.getElementById('userCoastAge');
    const userDateEl = document.getElementById('userCoastDate');
    const subBalAtCoast = document.querySelector('.result-subtitle #subBalAtCoast');
    const subBalAtRet = document.querySelector('.result-subtitle #subBalAtRet');
    const subGrowthYears = document.querySelector('.result-subtitle #subGrowthYears');
    const withOrwithout = document.querySelector('.result-subtitle #withOrwithout');
    const explanationWording = document.querySelector('.result-subtitle #explanationWording');
    let userMonthsToCoast = 0;
    const userBalAtCoast = document.getElementById('userBalAtCoast');
    const labelEl = document.getElementById('userBalCardLabel');
    const subtitleEl = document.getElementById('userBalSubtitle');

    if (currentSavings >= coastNumber) {
        if (userTimeEl) { userTimeEl.textContent = 'Congrats!'; userTimeEl.style.color = 'var(--secondary)'; }
        if (userAgeEl) { userAgeEl.textContent = 'You are already coasting!'; userAgeEl.style.color = '#111827'; }
        if (userDateEl) userDateEl.textContent = '';
        if (labelEl) labelEl.textContent = 'Portfolio Value at Retirement';
        if (subtitleEl) subtitleEl.textContent = 'Your projected balance at retirement age';
        if (userBalAtCoast) userBalAtCoast.textContent = safeMoney(retirementBal);
        if (explanationWording) {
            explanationWording.innerHTML = `
                You've already hit your Coast FIRE number! Your current portfolio of <strong>${safeMoney(currentSavings)}</strong> exceeds the required <strong>${safeMoney(coastNumber)}</strong>. Even without another dollar of contributions, compound growth alone will carry you to <strong>${safeMoney(retirementBal)}</strong> by age <strong>${retirementAge}</strong>.
                <div class="chartCardShow" style="margin-top:12px;display:flex;align-items:center;gap:0;font-size:0.75rem;flex-wrap:wrap;">
                    <div class="cf-node" style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:6px;text-align:center">
                        <div style="color:#6B7280;font-size:0.68rem;text-transform:uppercase;letter-spacing:0.04em;">Today</div>
                        <div style="font-weight:700;color:#1D4ED8;">${safeMoney(currentSavings)}</div>
                    </div>
                    <div class="cf-line" style="height:2px;background:linear-gradient(to right,#BFDBFE,#86EFAC)"></div>
                    <div class="cf-node" style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:6px;text-align:center">
                        <div style="color:#6B7280;font-size:0.68rem;text-transform:uppercase;letter-spacing:0.04em;">Coast FIRE ✓</div>
                        <div style="font-weight:700;color:#16A34A;">Already there!</div>
                    </div>
                    <div class="cf-line" style="height:2px;background:linear-gradient(to right,#86EFAC,#FCD34D)"></div>
                    <div class="cf-node" style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:6px;text-align:center">
                        <div style="color:#6B7280;font-size:0.68rem;text-transform:uppercase;letter-spacing:0.04em;">Retirement</div>
                        <div style="font-weight:700;color:#D97706;">${safeMoney(retirementBal)}</div>
                        <div style="color:#6B7280;font-size:0.68rem;text-transform:uppercase;letter-spacing:0.04em;">Age ${retirementAge}</div>
                    </div>
                </div>
            `;
        }
    } 
    else if (!userMonthly || userMonthly <= 0) {
        if (userTimeEl) { userTimeEl.textContent = '--'; userTimeEl.style.color = ''; }
        if (userAgeEl) { userAgeEl.textContent = 'Enter your monthly savings on the left'; userAgeEl.style.color = '#DC2626'; userAgeEl.style.fontWeight = '600';}
        if (userDateEl) userDateEl.textContent = '';
        if (explanationWording) {
            explanationWording.innerHTML = `
                Your portfolio sits at <strong>${safeMoney(currentSavings)}</strong> today. You need to reach <strong>${safeMoney(coastNumber)}</strong> to coast - enter a monthly savings amount on the left to see exactly when you'll get there and how your balance grows to <strong>${safeMoney(fiNumber)}</strong> by retirement.
                <div class="chartCardShow" style="margin-top:12px;display:flex;align-items:center;gap:0;font-size:0.75rem;flex-wrap:wrap;">
                    <div class="cf-node" style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:6px;text-align:center">
                        <div style="color:#6B7280;font-size:0.68rem;text-transform:uppercase;letter-spacing:0.04em;">Today</div>
                        <div style="font-weight:700;color:#1D4ED8;">${safeMoney(currentSavings)}</div>
                    </div>
                    <div class="cf-line" style="height:0;border-top:2px dashed #9CA3AF"></div>
                    <div class="cf-node" style="background:#F9FAFB;border:1px dashed #9CA3AF;border-radius:6px;text-align:center">
                        <div style="color:#6B7280;font-size:0.68rem;text-transform:uppercase;letter-spacing:0.04em;">Coast FIRE</div>
                        <div style="font-weight:700;color:#6B7280;">${safeMoney(coastNumber)}</div>
                    </div>
                    <div class="cf-line" style="height:0;border-top:2px dashed #9CA3AF"></div>
                    <div class="cf-node" style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:6px;text-align:center">
                        <div style="color:#6B7280;font-size:0.68rem;text-transform:uppercase;letter-spacing:0.04em;">Retirement</div>
                        <div style="font-weight:700;color:#D97706;">${safeMoney(fiNumber)}</div>
                        <div style="color:#6B7280;font-size:0.68rem;text-transform:uppercase;letter-spacing:0.04em;">Age ${retirementAge}</div>
                    </div>
                </div>
            `;
        }
    } else {
        const requiredAt = (m) => {
            const ml = maxMonths - m;
            return ml > 0 ? fiNumber / Math.pow(1 + monthlyRate, ml) : fiNumber;
        };
        let balU = currentSavings;
        for (let m = 1; m <= maxMonths; m++) {
            balU = balU * (1 + monthlyRate) + userMonthly;
            if (balU >= requiredAt(m)) { userMonthsToCoast = m; break; }
        }

        if (userMonthsToCoast === 0) {
            if (userTimeEl) { userTimeEl.textContent = 'Not reachable'; userTimeEl.style.color = '#DC2626'; }
            if (userAgeEl) { userAgeEl.textContent = 'Savings is too low to reach Coast FIRE before retirement'; userAgeEl.style.color = '#111827'; }
            if (userDateEl) userDateEl.textContent = '';

            if (labelEl) labelEl.textContent = 'Portfolio Value at Retirement';
            if (subtitleEl) subtitleEl.textContent = 'Your projected balance at retirement age';
            if (userBalAtCoast) userBalAtCoast.textContent = safeMoney(retirementBal);

            if (subBalAtCoast) subBalAtCoast.textContent = safeMoney(currentSavings);
            if (subGrowthYears) subGrowthYears.textContent = retirementAge-currentAge;
            if (subBalAtRet) subBalAtRet.textContent = safeMoney(retirementBal);
            if (withOrwithout) withOrwithout.textContent = 'with investing your listed monthly savings every month. Do not stop investing every month!';
            if (explanationWording) {
                explanationWording.innerHTML = `
                    At <strong>${safeMoney(userMonthly)}/mo</strong>, your portfolio grows from <strong>${safeMoney(currentSavings)}</strong> to <strong>${safeMoney(retirementBal)}</strong> by age <strong>${retirementAge}</strong> - but it never crosses your Coast FIRE threshold before then. You'll need to increase your monthly savings to reach Coast FIRE before retirement.
                    <div class="chartCardShow" style="margin-top:12px;display:flex;align-items:center;gap:0;font-size:0.75rem;flex-wrap:wrap;">
                        <div class="cf-node" style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:6px;text-align:center">
                            <div style="color:#6B7280;font-size:0.68rem;text-transform:uppercase;letter-spacing:0.04em;">Today</div>
                            <div style="font-weight:700;color:#1D4ED8;">${safeMoney(currentSavings)}</div>
                            <div style="color:#6B7280;font-size:0.67rem;">+${safeMoney(userMonthly)}/mo</div>
                        </div>
                        <div class="cf-line" style="height:0;border-top:2px solid #FCA5A5"></div>
                        <div class="cf-node" style="background:#FEF2F2;border:1px solid #FCA5A5;border-radius:6px;text-align:center">
                            <div style="color:#6B7280;font-size:0.68rem;text-transform:uppercase;letter-spacing:0.04em;">Coast FIRE</div>
                            <div style="font-weight:700;color:#DC2626;">Not reached</div>
                        </div>
                        <div class="cf-line" style="height:0;border-top:2px dashed #9CA3AF"></div>
                        <div class="cf-node" style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:6px;text-align:center">
                            <div style="color:#6B7280;font-size:0.68rem;text-transform:uppercase;letter-spacing:0.04em;">Retirement</div>
                            <div style="font-weight:700;color:#D97706;">${safeMoney(retirementBal)}</div>
                            <div style="color:#6B7280;font-size:0.68rem;text-transform:uppercase;letter-spacing:0.04em;">Age ${retirementAge}</div>
                        </div>
                    </div>
                `;
            }
        } else {
            if (userTimeEl) userTimeEl.style.color = '#111827';
            const yTC  = userMonthsToCoast / 12;
            const yW   = Math.floor(yTC);
            const mRem = Math.round((yTC - yW) * 12);
            let ts = '';
            if (yW > 0)   ts += yW + ' year' + (yW !== 1 ? 's' : '');
            if (mRem > 0) ts += (ts ? ', ' : '') + mRem + ' month' + (mRem !== 1 ? 's' : '');
            if (!ts) ts = 'Less than 1 month';
            const cAge    = currentAge + yTC;
            const cAgeYrs = Math.floor(cAge);
            const cAgeMos = Math.round((cAge - cAgeYrs) * 12);
            
            if (userTimeEl) userTimeEl.textContent = ts;
            if (userAgeEl)  { userAgeEl.textContent  = 'Age ' + cAgeYrs + (cAgeMos > 0 ? ', ' + cAgeMos + ' mo' : ''); userAgeEl.style.color = '#111827'; }
            if (userDateEl) userDateEl.textContent = 'Goal date: ' + getFutureDate(yW, mRem);
            if (userBalAtCoast) userBalAtCoast.textContent = safeMoney(balU);
            
            const yearsLeftToGrow = (retirementAge - cAge).toFixed(1);

            const yearsRemaining = retirementAge - cAge;
            const growYears = Math.floor(yearsRemaining);
            const growMonths = Math.round((yearsRemaining - growYears) * 12);

            let growTimeString = '';

            if (growYears > 0) {
                growTimeString += growYears + ' year' + (growYears !== 1 ? 's' : '');
            }

            if (growMonths > 0) {
                if (growTimeString) growTimeString += ', ';
                growTimeString += growMonths + ' month' + (growMonths !== 1 ? 's' : '');
            }

            if (!growTimeString) growTimeString = 'less than 1 month';

            if (explanationWording) {
                explanationWording.innerHTML = `
                    By saving <strong>${safeMoney(userMonthly)}/mo</strong> for <strong>${ts}</strong>, your portfolio grows from <strong>${safeMoney(currentSavings)}</strong> to <strong>${safeMoney(balU)}</strong> - hitting your Coast FIRE number at age <strong>${cAgeYrs}</strong>. From there, you can stop contributing entirely and let compounding do the work for <strong>${growTimeString}</strong>, carrying your portfolio to <strong>${safeMoney(fiNumber)}</strong> by retirement.
                    <div class="chartCardShow" style="margin-top:12px;display:flex;align-items:center;gap:0;font-size:0.75rem;flex-wrap:wrap;">
                        <div class="cf-node" style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:6px;text-align:center">
                            <div style="color:#6B7280;font-size:0.68rem;text-transform:uppercase;letter-spacing:0.04em;">Today</div>
                            <div style="font-weight:700;color:#1D4ED8;">${safeMoney(currentSavings)}</div>
                            <div style="color:#6B7280;font-size:0.67rem;">+${safeMoney(userMonthly)}/mo</div>
                        </div>
                        <div class="cf-line" style="height:0;border-top:2px solid #93C5FD"></div>
                        <div class="cf-node" style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:6px;text-align:center">
                            <div style="color:#6B7280;font-size:0.68rem;text-transform:uppercase;letter-spacing:0.04em;">Coast FIRE (Age ${cAgeYrs})</div>
                            <div style="font-weight:700;color:#16A34A;">${safeMoney(balU)}</div>
                            <div style="color:#6B7280;font-size:0.67rem;">stop contributing</div>
                        </div>
                        <div class="cf-line" style="height:0;border-top:2px dashed #6EE7B7"></div>
                        <div class="cf-node" style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:6px;text-align:center">
                            <div style="color:#6B7280;font-size:0.68rem;text-transform:uppercase;letter-spacing:0.04em;">Retirement</div>
                            <div style="font-weight:700;color:#D97706;">${safeMoney(fiNumber)}</div>
                            <div style="color:#6B7280;font-size:0.68rem;text-transform:uppercase;letter-spacing:0.04em;">Age ${retirementAge}</div>
                        </div>
                    </div>
                `;
            }

            if (subBalAtCoast) subBalAtCoast.textContent = '';
            if (subBalAtRet) subBalAtRet.textContent = '';
            if (subGrowthYears) subGrowthYears.textContent = '';
            if (withOrwithout) withOrwithout.textContent = '';

            if (labelEl) labelEl.textContent = 'Portfolio Value at Coast FIRE';
            if (subtitleEl) subtitleEl.textContent = 'Your projected balance when you hit Coast FIRE';
        }
    }

    // Update chart
    const activeTab = document.querySelector('.mode-btn.active') ? document.querySelector('.mode-btn.active').dataset.tab : 'find';
    updateCoastChart(currentAge, retirementAge, currentSavings, coastNumber, fiNumber, returnRate, monthlySavings, monthsToCoast, userMonthly, userMonthsToCoast, activeTab);
    syncCoastFloat();
}

// Update Coast FIRE Chart
function updateCoastChart(currentAge, retirementAge, currentSavings, coastNumber, fiNumber, returnRate, monthlySavings, monthsToCoast, userMonthly, userMonthsToCoast, activeTab) {
    
    const isMobile = window.innerWidth < 600;
    
    const ctx = document.getElementById('coastChart').getContext('2d');

    const monthlyRate = returnRate / 12;
    const startAge    = Math.floor(currentAge);
    const endAge      = Math.ceil(retirementAge);
    const totalMonths = Math.round((retirementAge - currentAge) * 12);

    const monthlyBalances     = [currentSavings];
    const userMonthlyBalances = [currentSavings];
    for (let m = 1; m <= totalMonths; m++) {
        const prev = monthlyBalances[m - 1];
        monthlyBalances.push(prev * (1 + monthlyRate) + (m <= monthsToCoast ? monthlySavings : 0));
        const prevU = userMonthlyBalances[m - 1];
        userMonthlyBalances.push(prevU * (1 + monthlyRate) + (userMonthly > 0 && m <= (userMonthsToCoast || totalMonths) ? userMonthly : 0));
    }

    const years        = [];
    const balances     = [];
    const userBalances = [];
    const coastLine    = [];
    const fiLine       = [];

    for (let age = startAge; age <= endAge; age++) {
        years.push(age);
        const mIndex = Math.round((age - currentAge) * 12);
        balances.push(monthlyBalances[Math.min(mIndex, monthlyBalances.length - 1)]);
        userBalances.push(userMonthlyBalances[Math.min(mIndex, userMonthlyBalances.length - 1)]);
        const monthsLeftAtAge = Math.round((retirementAge - age) * 12);
        coastLine.push(monthsLeftAtAge > 0 ? fiNumber / Math.pow(1 + monthlyRate, monthsLeftAtAge) : fiNumber);
        fiLine.push(fiNumber);
    }
    
    if (coastChart) {
        coastChart.destroy();
    }
    
    coastChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: years,
            datasets: [
                {
                    label: 'Your Projected Balance',
                    data: activeTab !== 'track' ? balances : [],
                    borderColor: '#2563EB',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 6
                },
                {
                    label: 'Coast FIRE Number',
                    data: coastLine,
                    borderColor: '#10B981',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0,
                    pointHoverRadius: 0
                },
                {
                    label: 'FI Number',
                    data: fiLine,
                    borderColor: '#F59E0B',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [10, 5],
                    fill: false,
                    pointRadius: 0,
                    pointHoverRadius: 0
                },
                {
                    label: 'Your Savings Rate',
                    data: activeTab === 'track' && userMonthly > 0 ? userBalances : [],
                    borderColor: '#8B5CF6',
                    backgroundColor: activeTab === 'track' ? 'rgba(139, 92, 246, 0.08)' : 'transparent',
                    borderWidth: 2,
                    borderDash: activeTab === 'track' ? [] : [4, 3],
                    fill: activeTab === 'track',
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: isMobile ? 0.5 : 2,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        padding: 15,
                        font: { size: 12, weight: '600' }
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    titleColor: '#1F2937',
                    bodyColor: '#6B7280',
                    borderColor: '#E5E7EB',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            label += '$' + context.parsed.y.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    title: { display: true, text: 'Age', color: '#6B7280', font: { size: 12, weight: '600' } },
                    ticks: { color: '#9CA3AF', font: { size: 11 } },
                    grid: { color: '#E5E7EB', drawTicks: false }
                },
                y: {
                    display: true,
                    title: { display: true, text: 'Portfolio Value ($)', color: '#6B7280', font: { size: 12, weight: '600' } },
                    ticks: {
                        color: '#9CA3AF',
                        font: { size: 11 },
                        callback: function(value) { return '$' + (value / 1000).toFixed(0) + 'k'; }
                    },
                    grid: { color: '#E5E7EB' }
                }
            },
            interaction: { mode: 'nearest', axis: 'x', intersect: false }
        }
    });
}

// ─── Reset ────────────────────────────────────────────────────────────────────

function clearAll() {
    STATE_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    // Reset tax checkbox state
    const cb = document.getElementById('taxAccountCheckbox');
    if (cb) cb.checked = false;
    originalSpending = null;
    restoreSpendingLabel();
    const checkboxWrapper = document.getElementById('taxCheckboxWrapper');
    if (checkboxWrapper) checkboxWrapper.style.display = 'none';
    const noteEl = document.getElementById('taxBufferNote');
    if (noteEl) noteEl.textContent = "The total amount you wish to spend per year in retirement.";

    localStorage.removeItem('coastFireData');
    setError('');
    clearOutputs();
}

function restoreTaxCheckboxUI() {
    if (!originalSpending) return;
    const grossNeeded = originalSpending ? parseFormattedNumber(document.getElementById('annualSpending').value) : null;
    const taxBuffer = grossNeeded - originalSpending;

    const labelEl = document.getElementById('annualSpendingLabel');
    if (labelEl) {
        const fmtNet    = '$' + Math.round(originalSpending).toLocaleString('en-US');
        const fmtBuffer = '$' + Math.round(taxBuffer).toLocaleString('en-US');
        const fmtGross  = '$' + Math.round(grossNeeded).toLocaleString('en-US');
        labelEl.innerHTML = `Annual Spending in Retirement&nbsp;<span style="font-weight:400; color:#6B7280; font-size:0.82em;">(${fmtNet} + ${fmtBuffer} tax&nbsp;=&nbsp;${fmtGross})</span>`;
    }
    const noteEl = document.getElementById('taxBufferNote');
    if (noteEl) noteEl.innerHTML = `✓ Tax adjustment applied. Field updated to reflect gross withdrawal needed.`;
    const checkboxWrapper = document.getElementById('taxCheckboxWrapper');
    if (checkboxWrapper) checkboxWrapper.style.display = 'flex';
}

// LocalStorage functions
function saveToStorage() {
    const data = {};
    
    // 1. Grab all the input values using your STATE_IDS array
    STATE_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) data[id] = el.value;
    });

    data.taxChecked = document.getElementById('taxAccountCheckbox')?.checked || false;
    data.originalSpending = originalSpending;

    // 2. Grab the currently active tab
    const activeTabBtn = document.querySelector('.mode-btn.active');
    data.activeTab = activeTabBtn ? activeTabBtn.dataset.tab : 'find';

    // 3. Save it all
    localStorage.setItem('coastFireData', JSON.stringify(data));
}

function loadFromStorage() {
    const saved = localStorage.getItem('coastFireData');
    if (!saved) return;
    
    try {
        const data = JSON.parse(saved);
        
        // 1. Restore all the input values
        STATE_IDS.forEach(key => {
            const el = document.getElementById(key);
            if (el && data[key] !== undefined) {
                el.value = data[key];
            }
        });

        if (data.taxChecked) { 
            originalSpending = data.originalSpending;  
            const cb = document.getElementById('taxAccountCheckbox');
            if (cb) cb.checked = true;
            // Don't call handleTaxCheckbox() — the field already has the gross value saved.
            // Just restore the visual state.
            restoreTaxCheckboxUI();
        }

        // 2. Restore the active tab
        // Note: Calling switchTab() here will automatically trigger calculateCoastFIRE() for you!
        if (data.activeTab) {
            switchTab(data.activeTab);
        }

    } catch (e) {
        console.error("Error loading from storage:", e);
    }
}

// ── Sharing & Export ─────────────────────────────────────────────────────────

function copyShareLink() {
    const params = new URLSearchParams();
    
    // 1. Grab all current input values
    STATE_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el && el.value) {
            params.set(id, el.value);
        }
    });

    if (document.getElementById('taxAccountCheckbox')?.checked) {
        params.set('taxChecked', '1');
        if (originalSpending !== null) params.set('originalSpending', originalSpending);
    }

    // 2. NEW: Grab the active tab state
    const activeTabBtn = document.querySelector('.mode-btn.active');
    if (activeTabBtn && activeTabBtn.dataset.tab) {
        params.set('tab', activeTabBtn.dataset.tab);
    }

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

    // Restore inputs
    STATE_IDS.forEach(id => {
        if (params.has(id)) {
            const el = document.getElementById(id);
            if (el) {
                el.value = params.get(id);
                hasParams = true;
            }
        }
    });

    if (params.get('taxChecked') === '1') { 
        originalSpending = params.has('originalSpending') ? parseFloat(params.get('originalSpending')) : null;
        const cb = document.getElementById('taxAccountCheckbox');
        if (cb) cb.checked = true;
        // Don't call handleTaxCheckbox() — the field already has the gross value saved.
        // Just restore the visual state.
        restoreTaxCheckboxUI();
    }

    // NEW: Restore the tab if present
    if (params.has('tab')) {
        switchTab(params.get('tab'));
        hasParams = true;
    }

    return hasParams; 
}

// Initialize calculator
document.addEventListener('DOMContentLoaded', function() {

    const loadedFromUrl = loadFromUrl();

    fetchTaxData();

    if (!loadedFromUrl) {
        loadFromStorage();
    }

    // Only set default if neither URL nor Storage set a tab
    const activeTabBtn = document.querySelector('.mode-btn.active');
    if (!activeTabBtn) {
        switchTab('find');
    }

    calculateCoastFIRE();
    initCoastFloat();

    // Smooth scroll logic for shared links
    if (loadedFromUrl) {
        setTimeout(() => {
            const el = document.querySelector('.share-btn');
            if (el) {
                const yOffset = -120;
                const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
                window.scrollTo({ top: y, behavior: 'smooth' });
            }
        }, 100);
    }
});