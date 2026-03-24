let fourzerokChart = null;

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

function calculate401k() {
    const salary = parseFormattedNumber(document.getElementById('salary').value);
    const currentBalance = parseFormattedNumber(document.getElementById('currentBalance').value);
    const contributionPercent = parseFloat(document.getElementById('contribution').value) / 100;
    const employerMatchPercent = parseFloat(document.getElementById('employerMatch').value) / 100;
    const matchLimit = parseFloat(document.getElementById('matchLimit').value) / 100;
    const currentAgeYears = parseInt(document.getElementById('currentAge').value);
    const currentAgeMonths = parseInt(document.getElementById('currentAgeMonths').value) || 0;
    const retirementAgeYears = parseInt(document.getElementById('retirementAge').value);
    const retirementAgeMonths = parseInt(document.getElementById('retirementAgeMonths').value) || 0;
    const returnRate = parseFloat(document.getElementById('returnRate').value) / 100;
    const salaryIncrease = parseFloat(document.getElementById('salaryIncrease').value) / 100;
    
    const currentAge = currentAgeYears + (currentAgeMonths / 12);
    const retirementAge = retirementAgeYears + (retirementAgeMonths / 12);
    const years = retirementAge - currentAge;
    
    let balance = currentBalance;
    let currentSalary = salary;
    let totalYourContributions = 0;
    let totalEmployerContributions = 0;
    
    const balanceHistory = [balance];
    const agesArray = [Math.floor(currentAge)];
    
    const totalMonths = Math.round(years * 12);
    
    for (let month = 1; month <= totalMonths; month++) {
        const monthlyYourContribution = (currentSalary * contributionPercent) / 12;
        const matchableAmount = Math.min(currentSalary * matchLimit, currentSalary * contributionPercent);
        const monthlyEmployerContribution = (matchableAmount * (employerMatchPercent / matchLimit)) / 12;
        
        totalYourContributions += monthlyYourContribution;
        totalEmployerContributions += monthlyEmployerContribution;
        
        balance = balance * (1 + returnRate / 12) + monthlyYourContribution + monthlyEmployerContribution;
        
        if (month % 12 === 0) {
            currentSalary *= (1 + salaryIncrease);
            balanceHistory.push(balance);
            agesArray.push(Math.floor(currentAge + (month / 12)));
        }
    }
    
    if (totalMonths % 12 !== 0) {
        balanceHistory.push(balance);
        agesArray.push(Math.floor(retirementAge));
    }
    
    const investmentGrowth = balance - totalYourContributions - totalEmployerContributions - currentBalance;
    
    document.getElementById('retireAge').textContent = retirementAgeYears + (retirementAgeMonths > 0 ? ', ' + retirementAgeMonths + ' mo' : '');
    document.getElementById('finalBalance').textContent = '$' + balance.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});
    document.getElementById('yourContributions').textContent = '$' + totalYourContributions.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});
    document.getElementById('employerContributions').textContent = '$' + totalEmployerContributions.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});
    document.getElementById('investmentGrowth').textContent = '$' + investmentGrowth.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});
    
    const monthlyYourContribution = (salary * contributionPercent) / 12;
    const monthlyEmployerContribution = ((Math.min(salary * matchLimit, salary * contributionPercent) * (employerMatchPercent / matchLimit)) / 12);
    const totalMonthly = monthlyYourContribution + monthlyEmployerContribution;
    document.getElementById('monthlyContribution').textContent = '$' + totalMonthly.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});
    
    update401kChart(agesArray, balanceHistory);
    saveToStorage();
}

function update401kChart(ages, balances) {
    const ctx = document.getElementById('fourzerokChart').getContext('2d');
    
    if (fourzerokChart) fourzerokChart.destroy();
    
    fourzerokChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ages,
            datasets: [{
                label: '401(k) Balance',
                data: balances,
                borderColor: '#2563EB',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4
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
                    title: {display: true, text: 'Balance ($)'},
                    ticks: {callback: v => '$' + (v >= 1000000 ? (v/1000000).toFixed(1) + 'M' : (v/1000).toFixed(0) + 'k')}
                },
                x: {title: {display: true, text: 'Age'}}
            }
        }
    });
}

// LocalStorage functions
function saveToStorage() {
    const data = {
        salary: document.getElementById('salary').value,
        currentBalance: document.getElementById('currentBalance').value,
        contribution: document.getElementById('contribution').value,
        employerMatch: document.getElementById('employerMatch').value,
        matchLimit: document.getElementById('matchLimit').value,
        currentAge: document.getElementById('currentAge').value,
        currentAgeMonths: document.getElementById('currentAgeMonths').value,
        retirementAge: document.getElementById('retirementAge').value,
        retirementAgeMonths: document.getElementById('retirementAgeMonths').value,
        returnRate: document.getElementById('returnRate').value,
        salaryIncrease: document.getElementById('salaryIncrease').value
    };
    localStorage.setItem('401kData', JSON.stringify(data));
}

function loadFromStorage() {
    const saved = localStorage.getItem('401kData');
    if (!saved) return;
    
    const data = JSON.parse(saved);
    Object.keys(data).forEach(key => {
        const elem = document.getElementById(key);
        if (elem && data[key]) elem.value = data[key];
    });
}

document.addEventListener('DOMContentLoaded', () => {
    loadFromStorage();
    calculate401k();
});