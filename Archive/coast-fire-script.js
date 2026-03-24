let coastChart = null;

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

// Get future date
function getFutureDate(years, months) {
    const date = new Date();
    date.setMonth(date.getMonth() + Math.round(years * 12) + months);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// Coast FIRE Calculator Function
function calculateCoastFIRE() {
    const currentAgeYears = parseInt(document.getElementById('currentAge').value);
    const currentAgeMonths = parseInt(document.getElementById('currentAgeMonths').value) || 0;
    const retirementAgeYears = parseInt(document.getElementById('retirementAge').value);
    const retirementAgeMonths = parseInt(document.getElementById('retirementAgeMonths').value) || 0;
    const currentSavings = parseFormattedNumber(document.getElementById('currentSavings').value);
    const annualSpending = parseFormattedNumber(document.getElementById('annualSpending').value);
    const withdrawalRate = parseFloat(document.getElementById('withdrawalRate').value) / 100;
    const returnRate = parseFloat(document.getElementById('returnRate').value) / 100;
    
    // Convert ages to decimal years
    const currentAge = currentAgeYears + (currentAgeMonths / 12);
    const retirementAge = retirementAgeYears + (retirementAgeMonths / 12);
    
    // Calculate FI Number (amount needed at retirement)
    const fiNumber = annualSpending / withdrawalRate;
    
    // Calculate years until retirement
    const yearsToRetirement = retirementAge - currentAge;
    
    // Calculate Coast FIRE number (present value of FI number)
    const coastNumber = fiNumber / Math.pow(1 + returnRate, yearsToRetirement);
    
    // Update FI Number display
    document.getElementById('fiNumber').textContent = '$' + fiNumber.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});
    
    // Update Coast FIRE Number display
    document.getElementById('coastNumber').textContent = '$' + coastNumber.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});
    
    // Check if already at Coast FIRE
    const statusElement = document.getElementById('coastStatus');
    const yearsToCoastElement = document.getElementById('yearsToCoast');
    const coastAgeElement = document.getElementById('coastAge');
    const coastDateElement = document.getElementById('coastDate');
    const monthlySavingsElement = document.getElementById('monthlySavings');
    
    if (currentSavings >= coastNumber) {
        statusElement.textContent = '✓ You\'ve reached Coast FIRE!';
        statusElement.style.color = 'var(--secondary)';
        statusElement.style.fontSize = '1.25rem';
        yearsToCoastElement.textContent = '0 years';
        coastAgeElement.textContent = 'You\'re there!';
        coastDateElement.textContent = '';
        monthlySavingsElement.textContent = '$0';
    } else {
        statusElement.textContent = '→ Keep saving!';
        statusElement.style.color = 'var(--accent)';
        statusElement.style.fontSize = '1.25rem';
        
        const targetYears = Math.min(10, yearsToRetirement - 5);
        const months = targetYears * 12;
        
        const futureCurrentSavings = currentSavings * Math.pow(1 + returnRate/12, months);
        
        const monthlyRate = returnRate / 12;
        const fvFactor = (Math.pow(1 + monthlyRate, months) - 1) / monthlyRate;
        const monthlySavings = (coastNumber - futureCurrentSavings) / fvFactor;
        
        let balance = currentSavings;
        let monthsToCoast = 0;
        const maxMonths = yearsToRetirement * 12;
        
        while (balance < coastNumber && monthsToCoast < maxMonths) {
            balance = balance * (1 + returnRate/12) + monthlySavings;
            monthsToCoast++;
        }
        
        const yearsToCoast = monthsToCoast / 12;
        const yearsWhole = Math.floor(yearsToCoast);
        const monthsRemainder = Math.round((yearsToCoast - yearsWhole) * 12);
        
        let timeString = '';
        if (yearsWhole > 0) timeString += yearsWhole + ' year' + (yearsWhole !== 1 ? 's' : '');
        if (monthsRemainder > 0) {
            if (timeString) timeString += ', ';
            timeString += monthsRemainder + ' month' + (monthsRemainder !== 1 ? 's' : '');
        }
        
        const coastAge = currentAge + yearsToCoast;
        const coastAgeYears = Math.floor(coastAge);
        const coastAgeMonths = Math.round((coastAge - coastAgeYears) * 12);
        
        yearsToCoastElement.textContent = timeString;
        coastAgeElement.textContent = 'Age ' + coastAgeYears + (coastAgeMonths > 0 ? ', ' + coastAgeMonths + ' mo' : '');
        coastDateElement.textContent = 'Goal date: ' + getFutureDate(yearsWhole, monthsRemainder);
        monthlySavingsElement.textContent = '$' + monthlySavings.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});
    }
    
    // Update chart
    updateCoastChart(currentAge, retirementAge, currentSavings, coastNumber, fiNumber, returnRate);
}

// Update Coast FIRE Chart
function updateCoastChart(currentAge, retirementAge, currentSavings, coastNumber, fiNumber, returnRate) {
    const ctx = document.getElementById('coastChart').getContext('2d');
    
    const years = [];
    const balances = [];
    const coastLine = [];
    const fiLine = [];
    
    const startAge = Math.floor(currentAge);
    const endAge = Math.ceil(retirementAge);
    
    for (let age = startAge; age <= endAge; age++) {
        years.push(age);
        const yearsFromNow = age - currentAge;
        
        const balance = currentSavings * Math.pow(1 + returnRate, yearsFromNow);
        balances.push(balance);
        
        coastLine.push(coastNumber);
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
                    data: balances,
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
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        padding: 15,
                        font: {
                            size: 12,
                            weight: '600'
                        }
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
                            if (label) {
                                label += ': ';
                            }
                            label += '$' + context.parsed.y.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    title: {
                        display: true,
                        text: 'Age',
                        color: '#6B7280',
                        font: {
                            size: 12,
                            weight: '600'
                        }
                    },
                    ticks: {
                        color: '#9CA3AF',
                        font: {
                            size: 11
                        }
                    },
                    grid: {
                        color: '#E5E7EB',
                        drawTicks: false
                    }
                },
                y: {
                    display: true,
                    title: {
                        display: true,
                        text: 'Portfolio Value ($)',
                        color: '#6B7280',
                        font: {
                            size: 12,
                            weight: '600'
                        }
                    },
                    ticks: {
                        color: '#9CA3AF',
                        font: {
                            size: 11
                        },
                        callback: function(value) {
                            return '$' + (value / 1000).toFixed(0) + 'k';
                        }
                    },
                    grid: {
                        color: '#E5E7EB'
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}

// LocalStorage functions
function saveToStorage() {
    const data = {
        currentAge: document.getElementById('currentAge').value,
        currentAgeMonths: document.getElementById('currentAgeMonths').value,
        retirementAge: document.getElementById('retirementAge').value,
        retirementAgeMonths: document.getElementById('retirementAgeMonths').value,
        currentSavings: document.getElementById('currentSavings').value,
        annualSpending: document.getElementById('annualSpending').value,
        withdrawalRate: document.getElementById('withdrawalRate').value,
        returnRate: document.getElementById('returnRate').value
    };
    localStorage.setItem('coastFireData', JSON.stringify(data));
}

function loadFromStorage() {
    const saved = localStorage.getItem('coastFireData');
    if (!saved) return;
    
    const data = JSON.parse(saved);
    if (data.currentAge) document.getElementById('currentAge').value = data.currentAge;
    if (data.currentAgeMonths) document.getElementById('currentAgeMonths').value = data.currentAgeMonths;
    if (data.retirementAge) document.getElementById('retirementAge').value = data.retirementAge;
    if (data.retirementAgeMonths) document.getElementById('retirementAgeMonths').value = data.retirementAgeMonths;
    if (data.currentSavings) document.getElementById('currentSavings').value = data.currentSavings;
    if (data.annualSpending) document.getElementById('annualSpending').value = data.annualSpending;
    if (data.withdrawalRate) document.getElementById('withdrawalRate').value = data.withdrawalRate;
    if (data.returnRate) document.getElementById('returnRate').value = data.returnRate;
}

// Initialize calculator with default calculation
document.addEventListener('DOMContentLoaded', function() {
    loadFromStorage();
    calculateCoastFIRE();
});