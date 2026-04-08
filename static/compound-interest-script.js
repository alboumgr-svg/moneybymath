let compoundChart = null;

const STATE_IDS = ['initialAmount','monthlyContribution','annualReturn','years','months'];

// Validation Fields (Months defaults to 0 if left empty)
const REQUIRED_FIELDS = {
    initialAmount:       'Initial Investment',
    monthlyContribution: 'Monthly Contribution',
    annualReturn:        'Annual Return Rate',
    years:               'Years'
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
    document.getElementById('yearsDisplay').textContent = '--';
    document.getElementById('yearBreakdown').innerHTML = '';
    if (compoundChart) { 
        compoundChart.destroy(); 
        compoundChart = null; 
    }
}

// ─── Compound Interest Calculator Function ────────────────────────────────────

function calculateCompound() {
    saveToStorage();
    // 1. Validate required fields
    const missing = [];
    const finalAfter = document.getElementById('final-after');
    const finalAfterFloat = document.getElementById('finalBalanceAfter');
    
    for (const [id, label] of Object.entries(REQUIRED_FIELDS)) {
        const raw = document.getElementById(id).value.trim().replace(/,/g, '');
        if (raw === '' || isNaN(parseFloat(raw))) missing.push(label);
    }
    
    if (missing.length > 0) {
        setResultsMessage('--');
        const finalBalanceEl = document.getElementById('finalBalance');
        
        if (finalAfter) finalAfter.style.display = 'none';
        if (finalAfterFloat) finalAfterFloat.style.display = 'none';
        
        if (missing.length === Object.keys(REQUIRED_FIELDS).length || missing.length > 2) {
            // If everything is missing OR more than 3 things are missing
            finalBalanceEl.textContent = 'Fill in fields to calculate';
        } else {
            // If 1-3 things are missing, list them
            finalBalanceEl.textContent = 'Missing: ' + missing.join(', ');
        }
        
        finalBalanceEl.style.color = '#6B7280';
        syncFloat();
        return;
    }

    // Unhide the "After X Years" labels
    if (finalAfter) finalAfter.style.display = 'block';
    if (finalAfterFloat) finalAfterFloat.style.display = 'block';
    document.getElementById('finalBalance').style.color = 'var(--primary, #2563EB)';

    // 2. Parse Validated Inputs
    const initialAmount = parseFormattedNumber(document.getElementById('initialAmount').value);
    const monthlyContribution = parseFormattedNumber(document.getElementById('monthlyContribution').value);
    const annualReturn = parseFloat(document.getElementById('annualReturn').value) / 100;
    const years = parseInt(document.getElementById('years').value);
    const months = parseInt(document.getElementById('months').value) || 0;
    
    const totalMonths = (years * 12) + months;
    const monthlyReturn = annualReturn / 12;
    
    let balance = initialAmount;
    const yearlyData = [];
    const contributionsData = [];
    const balanceData = [];
    const yearsArray = [];
    
    let totalContributions = initialAmount;
    
    yearsArray.push(0);
    balanceData.push(balance);
    contributionsData.push(totalContributions);
    
    for (let month = 1; month <= totalMonths; month++) {
        balance = balance * (1 + monthlyReturn) + monthlyContribution;
        totalContributions += monthlyContribution;
        
        if (month % 12 === 0) {
            const year = month / 12;
            yearsArray.push(year);
            balanceData.push(balance);
            contributionsData.push(totalContributions);
            
            yearlyData.push({
                year: year,
                balance: balance,
                contributions: totalContributions,
                interest: balance - totalContributions
            });
        }
    }
    
    if (totalMonths % 12 !== 0 && totalMonths > 0) {
        const finalYear = totalMonths / 12;
        yearsArray.push(finalYear);
        balanceData.push(balance);
        contributionsData.push(totalContributions);
        
        yearlyData.push({
            year: finalYear,
            balance: balance,
            contributions: totalContributions,
            interest: balance - totalContributions
        });
    }
    
    const finalBalance = balance;
    const totalInterest = finalBalance - totalContributions;
    const multiplier = totalContributions > 0 ? (finalBalance / totalContributions).toFixed(2) : "0.00";
    
    let timeString = '';
    if (years > 0) timeString += years + ' year' + (years !== 1 ? 's' : '');
    if (months > 0) {
        if (timeString) timeString += ', ';
        timeString += months + ' month' + (months !== 1 ? 's' : '');
    }
    
    document.getElementById('yearsDisplay').textContent = timeString;
    document.getElementById('finalBalance').textContent = '$' + finalBalance.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});
    document.getElementById('totalContributions').textContent = '$' + totalContributions.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});
    document.getElementById('totalInterest').textContent = '$' + totalInterest.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});
    document.getElementById('multiplier').textContent = multiplier + 'x';
    
    updateYearBreakdown(yearlyData);
    updateCompoundChart(yearsArray, balanceData, contributionsData);
    syncFloat();
}

// Update Year Breakdown
function updateYearBreakdown(yearlyData) {
    const breakdownDiv = document.getElementById('yearBreakdown');
    
    //const totalYears = yearlyData.length;
    const interval = 1;
    
    let html = '<div class="year-list">';
    
    for (let i = 0; i < yearlyData.length; i++) {
        if (i === yearlyData.length - 1 || yearlyData[i].year % interval === 0) {
            const data = yearlyData[i];
            const percentInterest = ((data.interest / data.balance) * 100).toFixed(1);
            
            html += `
                <div class="year-item">
                    <div class="year-number">Year ${Math.floor(data.year)}</div>
                    <div class="year-details">
                        <div class="year-stat">
                            <span class="year-label">Balance:</span>
                            <span class="year-value">$${data.balance.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
                        </div>
                        <div class="year-stat">
                            <span class="year-label">Interest:</span>
                            <span class="year-value">$${data.interest.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
                            <span class="year-percent">(${percentInterest}% of balance)</span>
                        </div>
                    </div>
                </div>
            `;
        }
    }
    
    html += '</div>';
    breakdownDiv.innerHTML = html;
}

// Update Compound Chart
function updateCompoundChart(years, balanceData, contributionsData) {
    const ctx = document.getElementById('compoundChart').getContext('2d');
    const interestData = balanceData.map((balance, index) => balance - contributionsData[index]);
    
    if (compoundChart) compoundChart.destroy();

    const isMobile = window.innerWidth < 600;
    
    compoundChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: years,
            datasets: [
                {
                    label: 'Total Balance',
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
                    label: 'Your Contributions',
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
                    label: 'Interest Earned',
                    data: interestData,
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
                                // Retrieves the actual number from your 'years' array
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
                            return '$' + (value / 1000).toFixed(0) + 'k';
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
        if (el) el.value = '';
    });
    localStorage.removeItem('compoundInterestData');
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
    const data = {
        initialAmount: document.getElementById('initialAmount').value,
        monthlyContribution: document.getElementById('monthlyContribution').value,
        annualReturn: document.getElementById('annualReturn').value,
        years: document.getElementById('years').value,
        months: document.getElementById('months').value
    };
    localStorage.setItem('compoundInterestData', JSON.stringify(data));
}

function loadFromStorage() {
    const saved = localStorage.getItem('compoundInterestData');
    if (!saved) return;
    
    try {
        const data = JSON.parse(saved);
        if (data.initialAmount) document.getElementById('initialAmount').value = data.initialAmount;
        if (data.monthlyContribution) document.getElementById('monthlyContribution').value = data.monthlyContribution;
        if (data.annualReturn) document.getElementById('annualReturn').value = data.annualReturn;
        if (data.years) document.getElementById('years').value = data.years;
        if (data.months) document.getElementById('months').value = data.months;
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
    btn.disabled = true;

    // Use native share sheet on mobile (iOS, Android), fallback to clipboard on desktop
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'Compound Interest Calculator',
                text: 'Check out my compound interest results!',
                url: shareUrl,
            });
            const originalText = btn.textContent;
            btn.textContent = '✓ Link Copied!';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
            }, 2000);
        } catch (err) {
            // User dismissed the share sheet - not an error worth logging
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

// Initialize calculator 
document.addEventListener('DOMContentLoaded', function() {
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
    
    // Check if required fields are filled to calculate immediately
    const hasData = Object.keys(REQUIRED_FIELDS).every(id => {
        const v = document.getElementById(id).value.trim().replace(/,/g, '');
        return v !== '' && !isNaN(parseFloat(v));
    });

    if (hasData) {
        calculateCompound();
    } else {
        setResultsMessage('--');
        const finalBalanceEl = document.getElementById('finalBalance');
        finalBalanceEl.textContent = 'Fill in fields to calculate';
        finalBalanceEl.style.color = '#6B7280';
        
        const finalAfter = document.getElementById('final-after');
        const finalAfterFloat = document.getElementById('result-after-float');
        if (finalAfter) finalAfter.style.display = 'none';
        if (finalAfterFloat) finalAfterFloat.style.display = 'none';
        
        syncFloat();
    }
    
    calculateCompound();
    initResultFloat();
});