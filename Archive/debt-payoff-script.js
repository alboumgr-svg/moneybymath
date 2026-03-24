let debtChart = null;
let debtCounter = 0;
let currentMode = 'debt';

// Format number with commas
function formatNumber(input) {
    let value = input.value.replace(/,/g, '');
    if (!isNaN(value) && value !== '') {
        input.value = parseFloat(value).toLocaleString('en-US');
    }
}

// Parse formatted number
function parseFormattedNumber(value) {
    return parseFloat(value.replace(/,/g, '')) || 0;
}

// Get future date
function getFutureDate(months) {
    const date = new Date();
    date.setMonth(date.getMonth() + months);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// Initialize debts
function initializeDebts() {
    const defaultDebts = [
        { balance: 5000, rate: 18 },
        { balance: 3000, rate: 22 },
        { balance: 15000, rate: 5 }
    ];
    
    defaultDebts.forEach(debt => {
        addDebt(debt.balance, debt.rate);
    });
    
    loadFromStorage();
}

// Add debt
function addDebt(balance = 1000, rate = 15) {
    const debtList = document.getElementById('debtList');
    const debtId = ++debtCounter;
    
    const debtItem = document.createElement('div');
    debtItem.className = 'debt-item';
    debtItem.id = `debt-${debtId}`;
    debtItem.innerHTML = `
        <div class="debt-item-header">
            <div class="debt-item-title">Debt #${debtId}</div>
            ${debtId > 3 ? '<button class="debt-remove-btn" onclick="removeDebt(' + debtId + ')">×</button>' : ''}
        </div>
        <div class="input-group">
            <label>Balance ($)</label>
            <input type="text" class="debt-balance" data-id="${debtId}" value="${balance.toLocaleString()}" oninput="formatNumber(this); calculateDebt(); saveToStorage()">
        </div>
        <div class="input-group">
            <label>APR (%)</label>
            <input type="number" class="debt-rate" data-id="${debtId}" value="${rate}" step="0.1" oninput="calculateDebt(); saveToStorage()">
        </div>
    `;
    
    debtList.appendChild(debtItem);
    calculateDebt();
}

// Remove debt
function removeDebt(id) {
    const debtItem = document.getElementById(`debt-${id}`);
    if (debtItem) {
        debtItem.remove();
        calculateDebt();
        saveToStorage();
    }
}

// Switch mode
function switchMode(mode) {
    currentMode = mode;
    const btns = document.querySelectorAll('.mode-btn');
    btns.forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    if (mode === 'debt') {
        document.getElementById('debtMode').style.display = 'block';
        document.getElementById('mortgageMode').style.display = 'none';
        document.getElementById('debtResults').style.display = 'grid';
        document.getElementById('mortgageResults').style.display = 'none';
        document.getElementById('resultsTitle').textContent = 'Payoff Comparison';
        calculateDebt();
    } else {
        document.getElementById('debtMode').style.display = 'none';
        document.getElementById('mortgageMode').style.display = 'block';
        document.getElementById('debtResults').style.display = 'none';
        document.getElementById('mortgageResults').style.display = 'grid';
        document.getElementById('resultsTitle').textContent = 'Mortgage Payoff';
        calculateMortgage();
    }
    saveToStorage();
}

function calculateDebt() {
    const debtElements = document.querySelectorAll('.debt-item');
    const debts = [];
    
    debtElements.forEach((elem, index) => {
        const balanceInput = elem.querySelector('.debt-balance');
        const rateInput = elem.querySelector('.debt-rate');
        const balance = parseFormattedNumber(balanceInput.value);
        const rate = parseFloat(rateInput.value) / 100;
        
        if (balance > 0) {
            debts.push({ balance, rate, name: `Debt ${index + 1}` });
        }
    });
    
    if (debts.length === 0) return;
    
    const monthlyPayment = parseFormattedNumber(document.getElementById('monthlyPayment').value);
    
    const avalancheResult = simulatePayoff([...debts], monthlyPayment, 'rate');
    const snowballResult = simulatePayoff([...debts], monthlyPayment, 'balance');
    
    const savings = snowballResult.totalInterest - avalancheResult.totalInterest;
    
    document.getElementById('avalancheTime').textContent = avalancheResult.months + ' months';
    document.getElementById('avalancheInterest').textContent = '$' + avalancheResult.totalInterest.toLocaleString(undefined, {minimumFractionDigits: 0});
    document.getElementById('avalancheDate').textContent = 'Paid off by ' + getFutureDate(avalancheResult.months);
    
    document.getElementById('snowballTime').textContent = snowballResult.months + ' months';
    document.getElementById('snowballInterest').textContent = '$' + snowballResult.totalInterest.toLocaleString(undefined, {minimumFractionDigits: 0});
    document.getElementById('snowballDate').textContent = 'Paid off by ' + getFutureDate(snowballResult.months);
    
    document.getElementById('savings').textContent = '$' + Math.abs(savings).toLocaleString(undefined, {minimumFractionDigits: 0});
    
    document.getElementById('bestMethod').textContent = savings > 0 ? 'Avalanche' : 'Snowball';
    document.getElementById('bestMethod').style.color = 'var(--primary)';
    
    updateDebtChart(avalancheResult.timeline, snowballResult.timeline);
}

function calculateMortgage() {
    const balance = parseFormattedNumber(document.getElementById('mortgageBalance').value);
    const rate = parseFloat(document.getElementById('mortgageRate').value) / 100;
    const payment = parseFormattedNumber(document.getElementById('mortgagePayment').value);
    const extra = parseFormattedNumber(document.getElementById('extraPayment').value);
    
    const regularResult = simulateMortgage(balance, rate, payment);
    const extraResult = simulateMortgage(balance, rate, payment + extra);
    
    document.getElementById('mortgageTime').textContent = extraResult.months + ' months';
    document.getElementById('mortgageInterest').textContent = '$' + extraResult.totalInterest.toLocaleString(undefined, {minimumFractionDigits: 0});
    document.getElementById('mortgageSaved').textContent = '$' + (regularResult.totalInterest - extraResult.totalInterest).toLocaleString(undefined, {minimumFractionDigits: 0});
    document.getElementById('mortgagePayoffDate').textContent = getFutureDate(extraResult.months);
    
    updateDebtChart(regularResult.timeline, extraResult.timeline, ['Without Extra', 'With Extra']);
}

function simulateMortgage(balance, rate, payment) {
    let currentBalance = balance;
    let months = 0;
    let totalInterest = 0;
    const timeline = [];
    
    while (currentBalance > 0 && months < 600) {
        months++;
        const interest = currentBalance * (rate / 12);
        totalInterest += interest;
        currentBalance += interest;
        const pay = Math.min(payment, currentBalance);
        currentBalance -= pay;
        timeline.push(Math.max(0, currentBalance));
    }
    
    return { months, totalInterest, timeline };
}

function simulatePayoff(debts, payment, sortBy) {
    debts = debts.map(d => ({...d}));
    let months = 0;
    let totalInterest = 0;
    const timeline = [];
    
    while (debts.some(d => d.balance > 0)) {
        months++;
        if (months > 600) break;
        
        let totalBalance = 0;
        
        debts.forEach(d => {
            if (d.balance > 0) {
                const interest = d.balance * (d.rate / 12);
                d.balance += interest;
                totalInterest += interest;
            }
        });
        
        if (sortBy === 'rate') {
            debts.sort((a, b) => b.rate - a.rate);
        } else {
            debts.sort((a, b) => a.balance - b.balance);
        }
        
        let remaining = payment;
        for (let d of debts) {
            if (d.balance > 0) {
                const pay = Math.min(remaining, d.balance);
                d.balance -= pay;
                remaining -= pay;
                if (remaining <= 0) break;
            }
        }
        
        debts.forEach(d => totalBalance += Math.max(0, d.balance));
        timeline.push(totalBalance);
    }
    
    return {months, totalInterest, timeline};
}

function updateDebtChart(data1, data2, labels = ['Avalanche', 'Snowball']) {
    const ctx = document.getElementById('debtChart').getContext('2d');
    const months = Array.from({length: Math.max(data1.length, data2.length)}, (_, i) => i);
    
    if (debtChart) debtChart.destroy();
    
    debtChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: months,
            datasets: [{
                label: labels[0],
                data: data1,
                borderColor: '#2563EB',
                borderWidth: 3
            }, {
                label: labels[1],
                data: data2,
                borderColor: '#10B981',
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            aspectRatio: 2,
            plugins: {
                legend: {display: true, position: 'top'}
            },
            scales: {
                y: {
                    title: {display: true, text: 'Remaining Debt ($)'},
                    ticks: {callback: v => '$' + (v/1000).toFixed(0) + 'k'}
                },
                x: {title: {display: true, text: 'Months'}}
            }
        }
    });
}

// LocalStorage functions
function saveToStorage() {
    const data = {
        mode: currentMode,
        debts: [],
        monthlyPayment: document.getElementById('monthlyPayment').value,
        mortgage: {
            balance: document.getElementById('mortgageBalance').value,
            rate: document.getElementById('mortgageRate').value,
            payment: document.getElementById('mortgagePayment').value,
            extra: document.getElementById('extraPayment').value
        }
    };
    
    document.querySelectorAll('.debt-item').forEach(elem => {
        const balance = elem.querySelector('.debt-balance').value;
        const rate = elem.querySelector('.debt-rate').value;
        data.debts.push({ balance, rate });
    });
    
    localStorage.setItem('debtPayoffData', JSON.stringify(data));
}

function loadFromStorage() {
    const saved = localStorage.getItem('debtPayoffData');
    if (!saved) return;
    
    const data = JSON.parse(saved);
    
    if (data.mode === 'mortgage') {
        document.querySelector('.mode-btn:last-child').click();
    }
    
    if (data.monthlyPayment) {
        document.getElementById('monthlyPayment').value = data.monthlyPayment;
    }
    
    if (data.mortgage) {
        document.getElementById('mortgageBalance').value = data.mortgage.balance;
        document.getElementById('mortgageRate').value = data.mortgage.rate;
        document.getElementById('mortgagePayment').value = data.mortgage.payment;
        document.getElementById('extraPayment').value = data.mortgage.extra;
    }
    
    if (data.debts && data.debts.length > 0) {
        document.querySelectorAll('.debt-item').forEach((elem, idx) => {
            if (data.debts[idx]) {
                elem.querySelector('.debt-balance').value = data.debts[idx].balance;
                elem.querySelector('.debt-rate').value = data.debts[idx].rate;
            }
        });
    }
    
    if (currentMode === 'debt') {
        calculateDebt();
    } else {
        calculateMortgage();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initializeDebts();
    document.getElementById('monthlyPayment').addEventListener('input', saveToStorage);
    ['mortgageBalance', 'mortgageRate', 'mortgagePayment', 'extraPayment'].forEach(id => {
        document.getElementById(id).addEventListener('input', saveToStorage);
    });
});