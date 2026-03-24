let compoundChart = null;

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

// Compound Interest Calculator Function
function calculateCompound() {
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
    
    if (totalMonths % 12 !== 0) {
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
    const multiplier = (finalBalance / totalContributions).toFixed(2);
    
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
    saveToStorage();
}

// Update Year Breakdown
function updateYearBreakdown(yearlyData) {
    const breakdownDiv = document.getElementById('yearBreakdown');
    
    const totalYears = yearlyData.length;
    const interval = totalYears > 20 ? 5 : (totalYears > 10 ? 2 : 1);
    
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
    
    if (compoundChart) {
        compoundChart.destroy();
    }
    
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
                        text: 'Years',
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
                        text: 'Value ($)',
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
                            if (value >= 1000000) {
                                return '$' + (value / 1000000).toFixed(1) + 'M';
                            }
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
    
    const data = JSON.parse(saved);
    if (data.initialAmount) document.getElementById('initialAmount').value = data.initialAmount;
    if (data.monthlyContribution) document.getElementById('monthlyContribution').value = data.monthlyContribution;
    if (data.annualReturn) document.getElementById('annualReturn').value = data.annualReturn;
    if (data.years) document.getElementById('years').value = data.years;
    if (data.months) document.getElementById('months').value = data.months;
}

// Initialize calculator with default calculation
document.addEventListener('DOMContentLoaded', function() {
    loadFromStorage();
    calculateCompound();
});