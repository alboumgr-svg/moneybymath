let rentBuyChart = null;

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
function getFutureDate(years, months = 0) {
    const date = new Date();
    date.setMonth(date.getMonth() + Math.round(years * 12) + months);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// Rent vs Buy Calculator Function
function calculateRentVsBuy() {
    const homePrice = parseFormattedNumber(document.getElementById('homePrice').value);
    const downPaymentPercent = parseFloat(document.getElementById('downPayment').value) / 100;
    const mortgageRate = parseFloat(document.getElementById('mortgageRate').value) / 100;
    const mortgageTerm = parseInt(document.getElementById('mortgageTerm').value);
    const propertyTax = parseFormattedNumber(document.getElementById('propertyTax').value);
    const homeInsurance = parseFormattedNumber(document.getElementById('homeInsurance').value);
    const hoaFees = parseFormattedNumber(document.getElementById('hoaFees').value);
    const maintenancePercent = parseFloat(document.getElementById('maintenance').value) / 100;
    const appreciationRate = parseFloat(document.getElementById('appreciation').value) / 100;
    
    const monthlyRent = parseFormattedNumber(document.getElementById('monthlyRent').value);
    const rentIncreaseRate = parseFloat(document.getElementById('rentIncrease').value) / 100;
    const rentersInsurance = parseFormattedNumber(document.getElementById('rentersInsurance').value);
    const investmentReturn = parseFloat(document.getElementById('investmentReturn').value) / 100;
    const yearsToAnalyze = parseInt(document.getElementById('yearsToAnalyze').value);
    const monthsToAnalyze = parseInt(document.getElementById('monthsToAnalyze').value) || 0;
    
    const totalMonths = (yearsToAnalyze * 12) + monthsToAnalyze;
    const totalYears = totalMonths / 12;
    
    const downPayment = homePrice * downPaymentPercent;
    const loanAmount = homePrice - downPayment;
    
    const monthlyRate = mortgageRate / 12;
    const numPayments = mortgageTerm * 12;
    const monthlyMortgage = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / 
                           (Math.pow(1 + monthlyRate, numPayments) - 1);
    
    const monthlyPropertyTax = propertyTax / 12;
    const monthlyInsurance = homeInsurance / 12;
    const monthlyMaintenance = (homePrice * maintenancePercent) / 12;
    const totalMonthlyBuy = monthlyMortgage + monthlyPropertyTax + monthlyInsurance + hoaFees + monthlyMaintenance;
    
    let buyNetWorth = 0;
    let rentNetWorth = 0;
    let homeValue = homePrice;
    let loanBalance = loanAmount;
    let investmentPortfolio = downPayment;
    let totalBuyCost = downPayment;
    let totalRentCost = 0;
    let currentRent = monthlyRent;
    let breakEvenYear = null;
    
    const buyNetWorthHistory = [];
    const rentNetWorthHistory = [];
    const years = [];
    
    for (let month = 0; month <= totalMonths; month++) {
        const currentYear = month / 12;
        
        if (month % 12 === 0 || month === totalMonths) {
            years.push(currentYear);
            
            if (month === 0) {
                buyNetWorth = homeValue - loanBalance - (homePrice * 0.06);
                rentNetWorth = investmentPortfolio;
            } else {
                buyNetWorth = homeValue - loanBalance - (homeValue * 0.06);
                rentNetWorth = investmentPortfolio;
                
                if (breakEvenYear === null && buyNetWorth > rentNetWorth) {
                    breakEvenYear = currentYear;
                }
            }
            
            buyNetWorthHistory.push(buyNetWorth);
            rentNetWorthHistory.push(rentNetWorth);
        }
        
        if (month > 0) {
            homeValue = homeValue * (1 + appreciationRate / 12);
            
            const interestPayment = loanBalance * monthlyRate;
            const principalPayment = monthlyMortgage - interestPayment;
            loanBalance = Math.max(0, loanBalance - principalPayment);
            totalBuyCost += totalMonthlyBuy;
            
            const monthlyRentCurrent = monthlyRent * Math.pow(1 + rentIncreaseRate, (month - 1) / 12);
            totalRentCost += monthlyRentCurrent + (rentersInsurance / 12);
            
            const monthlySavings = totalMonthlyBuy - monthlyRentCurrent;
            if (monthlySavings > 0) {
                investmentPortfolio = investmentPortfolio * (1 + investmentReturn / 12) + monthlySavings;
            } else {
                investmentPortfolio = investmentPortfolio * (1 + investmentReturn / 12);
            }
        }
    }
    
    let timeString = '';
    if (yearsToAnalyze > 0) timeString += yearsToAnalyze + ' year' + (yearsToAnalyze !== 1 ? 's' : '');
    if (monthsToAnalyze > 0) {
        if (timeString) timeString += ', ';
        timeString += monthsToAnalyze + ' month' + (monthsToAnalyze !== 1 ? 's' : '');
    }
    
    document.getElementById('yearsDisplay').textContent = timeString;
    document.getElementById('buyNetWorth').textContent = '$' + buyNetWorth.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});
    document.getElementById('rentNetWorth').textContent = '$' + rentNetWorth.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});
    
    const difference = buyNetWorth - rentNetWorth;
    const diffPercent = ((Math.abs(difference) / Math.max(buyNetWorth, rentNetWorth)) * 100).toFixed(1);
    document.getElementById('difference').textContent = '$' + Math.abs(difference).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});
    
    if (difference > 0) {
        document.getElementById('differencePercent').textContent = 'Buying wins by ' + diffPercent + '%';
        document.getElementById('winner').textContent = 'Buying is Better';
        document.getElementById('winner').style.color = 'var(--primary)';
    } else {
        document.getElementById('differencePercent').textContent = 'Renting wins by ' + diffPercent + '%';
        document.getElementById('winner').textContent = 'Renting is Better';
        document.getElementById('winner').style.color = 'var(--secondary)';
    }
    
    document.getElementById('buyMonthly').textContent = '$' + totalMonthlyBuy.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});
    
    if (breakEvenYear !== null) {
        const beYears = Math.floor(breakEvenYear);
        const beMonths = Math.round((breakEvenYear - beYears) * 12);
        let beString = 'Year ' + beYears;
        if (beMonths > 0) beString += ', ' + beMonths + ' mo';
        document.getElementById('breakEven').textContent = beString;
        document.getElementById('breakEvenDate').textContent = 'Break-even: ' + getFutureDate(beYears, beMonths);
    } else {
        document.getElementById('breakEven').textContent = 'Never (in this timeframe)';
        document.getElementById('breakEvenDate').textContent = '';
    }
    
    document.getElementById('totalBuyCost').textContent = '$' + totalBuyCost.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});
    document.getElementById('totalRentCost').textContent = '$' + totalRentCost.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});
    document.getElementById('homeEquity').textContent = '$' + (homeValue - loanBalance).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});
    document.getElementById('investmentPortfolio').textContent = '$' + investmentPortfolio.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});
    
    updateRentBuyChart(years, buyNetWorthHistory, rentNetWorthHistory);
    saveToStorage();
}

// Update Rent vs Buy Chart
function updateRentBuyChart(years, buyData, rentData) {
    const ctx = document.getElementById('rentBuyChart').getContext('2d');
    
    if (rentBuyChart) {
        rentBuyChart.destroy();
    }
    
    rentBuyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: years,
            datasets: [
                {
                    label: 'Buying Net Worth',
                    data: buyData,
                    borderColor: '#2563EB',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 6
                },
                {
                    label: 'Renting Net Worth',
                    data: rentData,
                    borderColor: '#10B981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 3,
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
                        text: 'Net Worth ($)',
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
        homePrice: document.getElementById('homePrice').value,
        downPayment: document.getElementById('downPayment').value,
        mortgageRate: document.getElementById('mortgageRate').value,
        mortgageTerm: document.getElementById('mortgageTerm').value,
        propertyTax: document.getElementById('propertyTax').value,
        homeInsurance: document.getElementById('homeInsurance').value,
        hoaFees: document.getElementById('hoaFees').value,
        maintenance: document.getElementById('maintenance').value,
        appreciation: document.getElementById('appreciation').value,
        monthlyRent: document.getElementById('monthlyRent').value,
        rentIncrease: document.getElementById('rentIncrease').value,
        rentersInsurance: document.getElementById('rentersInsurance').value,
        investmentReturn: document.getElementById('investmentReturn').value,
        yearsToAnalyze: document.getElementById('yearsToAnalyze').value,
        monthsToAnalyze: document.getElementById('monthsToAnalyze').value
    };
    localStorage.setItem('rentVsBuyData', JSON.stringify(data));
}

function loadFromStorage() {
    const saved = localStorage.getItem('rentVsBuyData');
    if (!saved) return;
    
    const data = JSON.parse(saved);
    Object.keys(data).forEach(key => {
        const elem = document.getElementById(key);
        if (elem && data[key]) elem.value = data[key];
    });
}

// Initialize calculator with default calculation
document.addEventListener('DOMContentLoaded', function() {
    loadFromStorage();
    calculateRentVsBuy();
});