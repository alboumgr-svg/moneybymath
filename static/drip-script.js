let dripChartInstance = null;

const STATE_IDS = [
    'initialInvestment', 'sharePrice', 'dividendYield', 'dividendFrequency', 
    'dividendGrowthRate', 'sharePriceGrowth', 'monthlyPurchase', 'taxRate', 
    'years', 'months'
];

// Validation Fields (Months, Monthly Purchase, Tax Rate can default to 0 if left empty)
const REQUIRED_FIELDS = {
    initialInvestment:  'Initial Investment',
    sharePrice:         'Share Price',
    dividendYield:      'Dividend Yield',
    dividendGrowthRate: 'Dividend Growth Rate',
    sharePriceGrowth:   'Share Price Growth',
    years:              'Years'
};

// Format number with commas
function formatNumber(input) {
    let value = input.value.replace(/,/g, '');
    if (!isNaN(value) && value !== '') {
        input.value = parseFloat(value).toLocaleString('en-US');
    }
}

// Parse formatted number
function parseFormattedNumber(value) {
    if (typeof value === 'string') {
        return parseFloat(value.replace(/,/g, '')) || 0;
    }
    return parseFloat(value) || 0;
}

// ─── Floating winner pill ─────────────────────────────────────────────────────

function syncFloat() {
    const finalBalanceEl = document.getElementById('finalBalance');
    const yearsEl        = document.getElementById('yearsDisplay');
    const floatEl        = document.getElementById('balanceFloat');
    const floatValueEl   = document.getElementById('balanceFloat-value');
    const floatYearsEl   = document.getElementById('yearsDisplayFloat');
    const isScrolledDown = window.scrollY > 150;

    if (!floatEl || !finalBalanceEl) return;
    
    floatValueEl.textContent = finalBalanceEl.textContent;
    floatValueEl.style.color = finalBalanceEl.style.color || '#111827';
    if (floatYearsEl) floatYearsEl.textContent = (yearsEl && yearsEl.textContent !== '--') ? yearsEl.textContent : '--';
    
    // Mirror the left-border from the result card onto the float pill
    const card = finalBalanceEl.parentElement;
    if (card) floatEl.style.borderLeft = card.style.borderLeft || '1.5px solid #E5E7EB';

    if (resultCardIsOffScreen && isScrolledDown) {
        floatEl.classList.add('visible');
    } else {
        floatEl.classList.remove('visible');
    }
}

// Show/hide the float based on whether the original result-highlight card is on-screen
let resultCardIsOffScreen = false;

function initResultFloat() {
    const originalCard = document.querySelector('.calculator-results');
    const floatEl      = document.getElementById('balanceFloat');
    if (!originalCard || !floatEl) return;

    const observer = new IntersectionObserver(
        entries => {
            resultCardIsOffScreen = !entries[0].isIntersecting;
            syncFloat();
        },
        { threshold: 0.1 }
    );
    observer.observe(originalCard);

    // Disappears instantly when scrolling back to the top
    window.addEventListener('scroll', syncFloat);
}

// ─── Reset UI ───────────────────────────────────────────────────────────────

function setResultsMessage(msg) {
    document.getElementById('totalContributions').textContent = msg;
    document.getElementById('totalInterest').textContent = msg;
    document.getElementById('multiplier').textContent = msg;
    document.getElementById('annualIncome').textContent = msg;
    document.getElementById('totalReturn').textContent = msg;
    document.getElementById('yearsDisplay').textContent = '--';
    document.getElementById('yearBreakdown').innerHTML = '';
    
    if (dripChartInstance) { 
        dripChartInstance.destroy(); 
        dripChartInstance = null; 
    }
}

// ─── DRIP Calculator Function ─────────────────────────────────────────────────

function calculateDrip() {
    saveToStorage();
    
    // 1. Validate required fields
    const missing = [];
    const finalAfter = document.getElementById('final-after');
    const finalAfterFloat = document.getElementById('finalBalanceAfter');
    
    for (const [id, label] of Object.entries(REQUIRED_FIELDS)) {
        const raw = document.getElementById(id).value.trim().replace(/,/g, '');
        if (raw === '' || isNaN(parseFloat(raw))) missing.push(label);
    }
    
    const finalBalanceEl = document.getElementById('finalBalance');
    
    if (missing.length > 0) {
        setResultsMessage('--');
        
        if (finalAfter) finalAfter.style.display = 'none';
        if (finalAfterFloat) finalAfterFloat.style.display = 'none';
        
        if (missing.length === Object.keys(REQUIRED_FIELDS).length || missing.length > 2) {
            finalBalanceEl.textContent = 'Fill in fields to calculate';
        } else {
            finalBalanceEl.textContent = 'Missing: ' + missing.join(', ');
        }
        
        finalBalanceEl.style.color = '#6B7280';
        syncFloat();
        return;
    }

    // Unhide the "After X Years" labels
    if (finalAfter) finalAfter.style.display = 'block';
    if (finalAfterFloat) finalAfterFloat.style.display = 'block';
    finalBalanceEl.style.color = 'var(--primary, #2563EB)';

    // 2. Parse Validated Inputs
    const initInv = parseFormattedNumber(document.getElementById('initialInvestment').value);
    const sharePrice = parseFormattedNumber(document.getElementById('sharePrice').value);
    const divYield = parseFloat(document.getElementById('dividendYield').value) / 100;
    const divFreq = parseInt(document.getElementById('dividendFrequency').value);
    const divGrowth = parseFloat(document.getElementById('dividendGrowthRate').value) / 100;
    const priceGrowth = parseFloat(document.getElementById('sharePriceGrowth').value) / 100;
    
    // Optional fields default to 0
    const monthlyPurch = parseFormattedNumber(document.getElementById('monthlyPurchase').value) || 0;
    const taxRate = parseFloat(document.getElementById('taxRate').value || 0) / 100;
    const years = parseInt(document.getElementById('years').value);
    const months = parseInt(document.getElementById('months').value || 0);
    
    // Core parameters setup
    const totalMonths = (years * 12) + months;
    const monthlyPriceGrowth = priceGrowth / 12;
    const payoutIntervalMonths = 12 / divFreq;
    
    let currentSharePrice = sharePrice;
    let shares = initInv / currentSharePrice;
    let annualDivPerShare = currentSharePrice * divYield;
    
    let totalContributions = initInv;
    let totalDividends = 0; // Cumulative Gross Dividends
    
    const yearlyData = [];
    const yearsArray = [0];
    const balanceData = [initInv];
    const contributionsData = [initInv];
    
    // 3. Simulation Loop
    for (let m = 1; m <= totalMonths; m++) {
        // A. Share price appreciation (monthly compound)
        currentSharePrice *= (1 + monthlyPriceGrowth);
        
        // B. Add monthly purchases
        if (monthlyPurch > 0) {
            shares += monthlyPurch / currentSharePrice;
            totalContributions += monthlyPurch;
        }
        
        // C. Pay and reinvest dividends
        if (m % payoutIntervalMonths === 0) {
            const divPayoutPerShare = annualDivPerShare / divFreq;
            const grossDividend = shares * divPayoutPerShare;
            const netDividend = grossDividend * (1 - taxRate);
            
            totalDividends += grossDividend;
            shares += netDividend / currentSharePrice; // Reinvest net dividend
        }
        
        // D. Annual dividend growth (applied end of year)
        if (m % 12 === 0) {
            annualDivPerShare *= (1 + divGrowth);
        }
        
        // E. Record data annually (or final month)
        if (m % 12 === 0 || m === totalMonths) {
            const yearFraction = m / 12;
            const currentBalance = shares * currentSharePrice;
            
            // Avoid duplicate log if totalMonths is exactly on a year boundary
            if (m % 12 === 0 || (m === totalMonths && totalMonths % 12 !== 0)) {
                yearsArray.push(yearFraction);
                balanceData.push(currentBalance);
                contributionsData.push(totalContributions);
                
                yearlyData.push({
                    year: yearFraction,
                    balance: currentBalance,
                    contributions: totalContributions,
                    shares: shares,
                    sharePrice: currentSharePrice,
                    cumulativeDividends: totalDividends
                });
            }
        }
    }
    
    // 4. Calculate Final Outputs
    const finalBalance = shares * currentSharePrice;
    const totalReturn = totalContributions > 0 ? ((finalBalance - totalContributions) / totalContributions) * 100 : 0;
    const projectedAnnualIncome = shares * annualDivPerShare * (1 - taxRate);
    
    // Generate Time String
    let timeString = '';
    if (years > 0) timeString += years + ' year' + (years !== 1 ? 's' : '');
    if (months > 0) {
        if (timeString) timeString += ', ';
        timeString += months + ' month' + (months !== 1 ? 's' : '');
    }
    if (timeString === '') timeString = '0 months';
    
    // 5. Update DOM
    document.getElementById('yearsDisplay').textContent = timeString;
    document.getElementById('finalBalance').textContent = '$' + finalBalance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    document.getElementById('totalContributions').textContent = '$' + totalContributions.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});
    document.getElementById('totalInterest').textContent = '$' + totalDividends.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});
    document.getElementById('multiplier').textContent = shares.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    document.getElementById('annualIncome').textContent = '$' + projectedAnnualIncome.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});
    document.getElementById('totalReturn').textContent = totalReturn.toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 1}) + '%';
    
    updateYearBreakdown(yearlyData);
    updateDripChart(yearsArray, balanceData, contributionsData);
    syncFloat();
}

// Update Year Breakdown
function updateYearBreakdown(yearlyData) {
    const breakdownDiv = document.getElementById('yearBreakdown');
    const interval = 1; // Show every year
    
    let html = '<div class="year-list">';
    
    for (let i = 0; i < yearlyData.length; i++) {
        if (i === yearlyData.length - 1 || yearlyData[i].year % interval === 0) {
            const data = yearlyData[i];
            
            html += `
                <div class="year-item">
                    <div class="year-number">Year ${Math.floor(data.year)}</div>
                    <div class="year-details">
                        <div class="year-stat">
                            <span class="year-label">Portfolio Value:</span>
                            <span class="year-value">$${data.balance.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
                        </div>
                        <div class="year-stat">
                            <span class="year-label">Shares / Price:</span>
                            <span class="year-value">${data.shares.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} <span style="font-size:0.85em;color:#9CA3AF;">@ $${data.sharePrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span></span>
                        </div>
                    </div>
                </div>
            `;
        }
    }
    
    html += '</div>';
    breakdownDiv.innerHTML = html;
}

// Update Chart
function updateDripChart(years, balanceData, contributionsData) {
    const ctx = document.getElementById('dripChart').getContext('2d');
    
    // Growth includes capital gains + reinvested dividends
    const growthData = balanceData.map((balance, index) => balance - contributionsData[index]);
    
    if (dripChartInstance) dripChartInstance.destroy();

    const isMobile = window.innerWidth < 600;
    
    dripChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: years,
            datasets: [
                {
                    label: 'Portfolio Value',
                    data: balanceData,
                    borderColor: '#2563EB',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 6
                },
                {
                    label: 'Total Contributions',
                    data: contributionsData,
                    borderColor: '#10B981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 6
                },
                {
                    label: 'Total Growth (Divs + Cap Gains)',
                    data: growthData,
                    borderColor: '#F59E0B',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    borderWidth: 2,
                    fill: true,
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
                    labels: { usePointStyle: true, padding: 15, font: { size: 12, weight: '600' } }
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
                        title: function(context) {
                            let year = context[0].label;
                            return parseFloat(year).toFixed(2) + ' Years';
                        },
                        label: function(context) {
                            let label = context.dataset.label ? context.dataset.label + ': ' : '';
                            label += '$' + context.parsed.y.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    title: { display: true, text: 'Years', color: '#6B7280', font: { size: 12, weight: '600' } },
                    ticks: { 
                        color: '#9CA3AF', 
                        font: { size: 11 },
                        callback: function(val) {
                            const value = this.getLabelForValue(val);
                            return parseFloat(value).toFixed(2);
                        }
                    },
                    grid: { color: '#E5E7EB', drawTicks: false }
                },
                y: {
                    display: true,
                    title: { display: true, text: 'Value ($)', color: '#6B7280', font: { size: 12, weight: '600' } },
                    ticks: {
                        color: '#9CA3AF',
                        font: { size: 11 },
                        callback: function(value) {
                            if (value >= 1000000) return '$' + (value / 1000000).toFixed(1) + 'M';
                            if (value >= 1000) return '$' + (value / 1000).toFixed(0) + 'k';
                            return '$' + value;
                        }
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
        if (el && id !== 'dividendFrequency') el.value = '';
    });
    
    // Reset select to default
    const freqEl = document.getElementById('dividendFrequency');
    if (freqEl) freqEl.value = '4'; 

    localStorage.removeItem('dripCalculatorData');
    setResultsMessage('--');
    
    const finalBalanceEl = document.getElementById('finalBalance');
    if (finalBalanceEl) {
        finalBalanceEl.textContent = 'Fill in fields to calculate';
        finalBalanceEl.style.color = '#6B7280';
    }
    
    const finalAfter = document.getElementById('final-after');
    const finalAfterFloat = document.getElementById('finalBalanceAfter');
    if (finalAfter) finalAfter.style.display = 'none';
    if (finalAfterFloat) finalAfterFloat.style.display = 'none';
    
    syncFloat();
}

// LocalStorage functions
function saveToStorage() {
    const data = {};
    STATE_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) data[id] = el.value;
    });
    localStorage.setItem('dripCalculatorData', JSON.stringify(data));
}

function loadFromStorage() {
    const saved = localStorage.getItem('dripCalculatorData');
    if (!saved) return;
    
    try {
        const data = JSON.parse(saved);
        STATE_IDS.forEach(id => {
            if (data[id] !== undefined) {
                const el = document.getElementById(id);
                if (el) el.value = data[id];
            }
        });
    } catch(e) {}
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
    if (!btn) return;

    btn.disabled = true;

    if (navigator.share) {
        try {
            await navigator.share({
                title: 'DRIP Calculator',
                text: 'Check out my Dividend Reinvestment Growth!',
                url: shareUrl,
            });
            const originalText = btn.innerHTML;
            btn.innerHTML = '✓ Link Copied!';
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }, 2000);
        } catch (err) {
            if (err.name !== 'AbortError') console.error(err);
            btn.disabled = false;
        }
    } else {
        try {
            await navigator.clipboard.writeText(shareUrl);
            const originalText = btn.innerHTML;
            btn.innerHTML = '✓ Link Copied!';
            setTimeout(() => {
                btn.innerHTML = originalText;
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

    return hasParams;
}

// ─── Initialization ──────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
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

                window.scrollTo({
                    top: y,
                    behavior: 'smooth'
                });
            }
        }, 50);
    }
    
    const hasData = Object.keys(REQUIRED_FIELDS).every(id => {
        const el = document.getElementById(id);
        if (!el) return false;
        const v = el.value.trim().replace(/,/g, '');
        return v !== '' && !isNaN(parseFloat(v));
    });

    if (hasData) {
        calculateDrip();
    } else {
        setResultsMessage('--');
        const finalBalanceEl = document.getElementById('finalBalance');
        if (finalBalanceEl) {
            finalBalanceEl.textContent = 'Fill in fields to calculate';
            finalBalanceEl.style.color = '#6B7280';
        }
        
        const finalAfter = document.getElementById('final-after');
        const finalAfterFloat = document.getElementById('finalBalanceAfter');
        if (finalAfter) finalAfter.style.display = 'none';
        if (finalAfterFloat) finalAfterFloat.style.display = 'none';
        
        syncFloat();
    }
    
    calculateDrip();
    initResultFloat();
});