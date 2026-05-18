// Share Article Function (Globally accessible for the onclick handlers)
function shareArticle(platform) {
    const url   = encodeURIComponent(window.location.href);
    const titleEl = document.querySelector('.article-preview h2');
    const title = titleEl ? encodeURIComponent(titleEl.innerText) : '';

    if (platform === 'twitter') {
        window.open(`https://twitter.com/intent/tweet?text=${title}&url=${url}`, '_blank');
    } else if (platform === 'linkedin') {
        window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, '_blank');
    } else if (platform === 'copy') {
        navigator.clipboard.writeText(window.location.href).then(() => {
            const btn = document.getElementById('copyBtn');
            if (btn) {
                btn.innerHTML = `<svg width="17" height="17" viewBox="0 0 20 20" fill="none"><path d="M5 10 L8 13 L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Copied!`;
                setTimeout(() => {
                    btn.innerHTML = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path></svg> Copy Link`;
                }, 2000);
            }
        });
    }
}

// Run logic when the DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    
    // --- 1. Tools Randomizer ---
    const ALL_TOOLS = [
        { href: "/options-wheel",          label: "Options Wheel Analyzer" },
        { href: "/stock-analysis",         label: "Stock Buy Analyzer" },
        { href: "/coast-fire",             label: "Coast FIRE Calculator" },
        { href: "/retirement",             label: "Retirement Planner" },
        { href: "/afford-house",           label: "Can I Afford This House?" },
        { href: "/rent-vs-buy",            label: "Rent vs Buy A House" },
        { href: "/compound-interest",      label: "Compound Interest Calculator" },
        { href: "/debt-payoff",            label: "Debt Payoff Planner" },
        { href: "/car-cost",               label: "New, Used, or Leased Car" },
        { href: "/kids-future",            label: "Kids Future Calculator" },
        { href: "/loan-from-401k",         label: "401k Loan Analyzer" },
        { href: "/federal-tax",            label: "Federal Tax Estimator" },
        { href: "/mortgage-calculator",    label: "Mortgage Calculator" },
        { href: "/budget",                 label: "Budget Analyzer" },
        { href: "/financial-health-check", label: "Financial Health Check" },
    ];

    const shareTwitterBtn = document.getElementById('shareTwitterBtn');
    if (shareTwitterBtn) {
        shareTwitterBtn.addEventListener('click', () => shareArticle('twitter'));
    }

    const shareLinkedinBtn = document.getElementById('shareLinkedinBtn');
    if (shareLinkedinBtn) {
        shareLinkedinBtn.addEventListener('click', () => shareArticle('linkedin'));
    }

    const copyBtn = document.getElementById('copyBtn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => shareArticle('copy'));
    }
    
    const checkSVG = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M5 10 L8 13 L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
    
    const container = document.getElementById('moreTools');
    if (container) {
        // Shuffle and pick 4
        const shuffled = ALL_TOOLS.sort(() => Math.random() - 0.5).slice(0, 4);
        
        shuffled.forEach(tool => {
            const div = document.createElement('div');
            div.className = 'benefit';
            // Note: If you implement Trusted Types later as suggested previously, 
            // you will want to route this `.innerHTML` through DOMPurify too!
            div.innerHTML = `${checkSVG}<a href="${tool.href}" class="inlineLinks">${tool.label}</a>`;
            container.appendChild(div);
        });
    }

    // --- 2. Initialize Disqus ---
    const disqusThread = document.getElementById('disqus_thread');
    if (disqusThread) {
        // Read the identifier that Jinja safely placed in the HTML
        const disqusIdentifier = disqusThread.getAttribute('data-identifier');

        // Disqus requires the configuration function to be attached to the global window object
        window.disqus_config = function () {
            this.page.url = window.location.href;
            this.page.identifier = disqusIdentifier;
        };

        const d = document;
        const s = d.createElement('script');
        // USE THE POLICY:
        if (window.trustedTypes && scriptURLPolicy) {
            s.src = scriptURLPolicy.createScriptURL('https://MoneyByMath.disqus.com/embed.js');
        } else {
            s.src = 'https://MoneyByMath.disqus.com/embed.js';
        }
        s.setAttribute('data-timestamp', +new Date());
        (d.head || d.body).appendChild(s);
    }
});