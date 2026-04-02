// ─────────────────────────────────────────────────────────────────────────────
//  Buy Analysis Script
//  Calls Flask backend /api/buy-analysis and renders results.
//  Change API_BASE to your Render URL when deploying.
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = window.location.origin; 

const DAILY_LIMIT = 10;
const STORAGE_KEY = 'stock_lookups'; // use a different key per page if you want separate limits

function getRateLimitData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { count: 0, windowStart: Date.now() };
    const data = JSON.parse(raw);
    // Reset if 24 hours have passed since first call in this window
    if (Date.now() - data.windowStart > 86400000) {
      return { count: 0, windowStart: Date.now() };
    }
    return data;
  } catch {
    return { count: 0, windowStart: Date.now() };
  }
}

function checkAndRecordLookup() {

    const errorEl   = document.getElementById('baError');
    errorEl.style.display   = 'none';

    const data = getRateLimitData();
    if (data.count >= DAILY_LIMIT) {
      const resetIn = 86400000 - (Date.now() - data.windowStart);
      const hours = Math.floor(resetIn / 3600000);
      const minutes = Math.floor((resetIn % 3600000) / 60000);
      errorEl.textContent   =   `You've used all ${DAILY_LIMIT} free lookups today. Resets in ${hours}h ${minutes}m.`;
      errorEl.style.display = 'block';
      return false;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      count: data.count + 1,
      windowStart: data.windowStart
    }));
    return true;
}

// ── Entry point ───────────────────────────────────────────────────────────────
async function runBuyAnalysis() {
    const inputEl   = document.getElementById('baTicker');
    const errorEl   = document.getElementById('baError');
    const loadingEl = document.getElementById('baLoading');
    const resultsEl = document.getElementById('baResults');
    const loadTick  = document.getElementById('baLoadingTicker');

    const ticker = inputEl.value.trim().toUpperCase().replace(/[^A-Z0-9.^-]/g, '');

    errorEl.style.display   = 'none';
    resultsEl.style.display = 'none';

    if (!ticker) {
        errorEl.textContent   = 'Please enter a ticker symbol (e.g. AAPL, MSFT, VOO).';
        errorEl.style.display = 'block';
        return;
    }

    if (!checkAndRecordLookup()) return;

    inputEl.disabled        = true;
    if (loadTick) loadTick.textContent = ticker;
    loadingEl.style.display = 'flex';

    try {
        const res  = await fetch(`${API_BASE}/api/stock-data?ticker=${encodeURIComponent(ticker)}`);
        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || `Server error (${res.status}). Please try again.`);
        }

        renderResults(data);
        resultsEl.style.display = 'block';
        setTimeout(() => resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);

    } catch (err) {
        const msg = err.message || '';
        errorEl.textContent = msg.includes('Failed to fetch')
            ? 'Could not reach the server. If this is the first request in a while, Render may be waking up - wait 30 seconds and try again.'
            : msg || 'Something went wrong. Please try again.';
        errorEl.style.display = 'block';
    } finally {
        loadingEl.style.display = 'none';
        inputEl.disabled        = false;
    }
}

// ── HTML escape helper ────────────────────────────────────────────────────────
function h(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── Render results ────────────────────────────────────────────────────────────
function renderResults(d) {
    const resultsEl = document.getElementById('baResults');

    const score    = d.score ?? 0;

    const barColor = score >= 85 ? '#059669' // Emerald (Strong Buy)
                   : score >= 70 ? '#10B981' // Green (Buy)
                   : score >= 50 ? '#3b82f6' // Blue (Hold)
                   : score >= 35 ? '#f59e0b' // Amber (Caution)
                   :               '#ef4444'; // Red (Avoid)

    const verdictClass = score >= 85 ? 'ba-verdict-pass'
                       : score >= 70 ? 'ba-verdict-buy'
                       : score >= 50 ? 'ba-verdict-hold'
                       : score >= 35 ? 'ba-verdict-caution'
                       :               'ba-verdict-fail';

    const mc        = d.spot != null ? `$${d.spot.toFixed(2)}` : 'N/A';
    const sectorStr = [d.sector, d.industry].filter(Boolean).join(' · ');

    // Group signals by category, preserving backend order
    const categories = [];
    const seen       = {};
    (d.signals || []).forEach(sig => {
        if (!seen[sig.category]) {
            seen[sig.category] = [];
            categories.push({ name: sig.category, signals: seen[sig.category] });
        }
        seen[sig.category].push(sig);
    });

    // Split categories into two columns for desktop layout
    const mid     = Math.ceil(categories.length / 2);
    const leftCats  = categories.slice(0, mid);
    const rightCats = categories.slice(mid);

    // Summary buckets
    const bullish = (d.signals || []).filter(s => s.signal === 'bullish');
    const neutral  = (d.signals || []).filter(s => s.signal === 'neutral');
    const bearish  = (d.signals || []).filter(s => s.signal === 'bearish');

    resultsEl.innerHTML = `
        ${headerCard(d, score, barColor, mc, sectorStr)}

        ${verdictCard(d, verdictClass, bullish, neutral, bearish)}

        <div class="ba-checklist-grid">
            <div class="calculator-card">
                ${leftCats.map(renderCategory).join('')}
            </div>
            <div class="calculator-card">
                ${rightCats.map(renderCategory).join('')}
            </div>
        </div>

        ${insiderTable(d)}
    `;
}

// ── Header card ───────────────────────────────────────────────────────────────
function headerCard(d, score, barColor, price, sectorStr) {
    const counts = d.signal_counts || {};
    const marketCap = d.marketCap != null ? (() => {
        const val = d.marketCap;
        if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
        if (val >= 1e9)  return `$${(val / 1e9).toFixed(1)}B`;
        if (val >= 1e6)  return `$${(val / 1e6).toFixed(1)}M`;
        return `$${val.toLocaleString()}`;
    })() : 'N/A';
    return `
    <div class="calculator-card" style="margin-bottom:1.5rem;">
        <div class="ba-header-card">
            <div>
                <div style="font-size:1.4rem;font-weight:800;color:#111827;">
                    ${h(d.name)}
                    <span style="color:#6B7280;font-size:0.95rem;font-weight:500;">(${h(d.ticker)})</span>
                </div>
                ${sectorStr ? `<div style="color:#9CA3AF;font-size:0.8rem;margin-top:3px;">${h(sectorStr)}</div>` : ''}
                <div style="display:flex;gap:2.5rem;margin-top:1rem;flex-wrap:wrap;">
                    <div>
                        <div style="font-size:0.68rem;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.06em;">Price</div>
                        <div style="font-size:1.3rem;font-weight:700;color:#111827;">${price}</div>
                    </div>
                    <div>
                        <div style="font-size:0.68rem;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.06em;">Market Cap</div>
                        <div style="font-size:1.3rem;font-weight:700;color:#111827;">${marketCap}</div>
                    </div>
                    <div>
                        <div style="font-size:0.68rem;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.06em;">Bullish Signals</div>
                        <div style="font-size:1.3rem;font-weight:700;color:#059669;">${counts.bullish ?? 0}</div>
                    </div>
                    <div>
                        <div style="font-size:0.68rem;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.06em;">Neutral</div>
                        <div style="font-size:1.3rem;font-weight:700;color:#D97706;">${counts.neutral ?? 0}</div>
                    </div>
                    <div>
                        <div style="font-size:0.68rem;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.06em;">Bearish Signals</div>
                        <div style="font-size:1.3rem;font-weight:700;color:#DC2626;">${counts.bearish ?? 0}</div>
                    </div>
                </div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
                <div style="font-size:0.68rem;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Buy Score</div>
                <div class="ba-score-value" style="color:${barColor};">
                    ${score}<span style="font-size:1rem;font-weight:400;color:#9CA3AF;">/100</span>
                </div>
                <div class="ba-score-bar-track">
                    <div class="ba-score-bar-fill" style="width:${score}%;background:${barColor};"></div>
                </div>
            </div>
        </div>
    </div>`;
}

// ── Category block ────────────────────────────────────────────────────────────
function renderCategory(cat) {
    return `
        <div class="ba-category-label">${h(cat.name)}</div>
        ${cat.signals.map(renderSignalRow).join('')}
    `;
}

// ── Verdict card ──────────────────────────────────────────────────────────────
function verdictCard(d, verdictClass, bullish, neutral, bearish) {
    return `
    <div class="calculator-card" style="margin-bottom:1.5rem;">
        <div class="ba-verdict-box ${verdictClass}">
            <div class="ba-verdict-eyebrow">Verdict</div>
            <div class="ba-verdict-title">${h(d.verdict)}</div>
            <div class="ba-verdict-sub">${h(d.verdict_sub)}</div>
        </div>
        <div class="ba-summary-cols">
            ${bullish.length ? `
            <div>
                <div class="ba-summary-col-head" style="color:#059669;">Working in its Favor</div>
                ${bullish.map(s => `<div class="ba-summary-item" style="border-color:#10B981;color:#065F46;"><strong>${h(s.name)}</strong></div>`).join('')}
            </div>` : ''}
            ${neutral.length ? `
            <div>
                <div class="ba-summary-col-head" style="color:#D97706;">Mixed / Neutral</div>
                ${neutral.map(s => `<div class="ba-summary-item" style="border-color:#F59E0B;color:#92400E;"><strong>${h(s.name)}</strong></div>`).join('')}
            </div>` : ''}
            ${bearish.length ? `
            <div>
                <div class="ba-summary-col-head" style="color:#DC2626;">Working Against It</div>
                ${bearish.map(s => `<div class="ba-summary-item" style="border-color:#EF4444;color:#7F1D1D;"><strong>${h(s.name)}</strong></div>`).join('')}
            </div>` : ''}
        </div>
    </div>`;
}

// ── Individual signal row with Score display ──────────────────────────────────
function renderSignalRow(sig) {
    const tagMap = {
        bullish: ['ba-tag-bull',    'BULLISH', 1.0],
        neutral: ['ba-tag-neutral', 'NEUTRAL', 0.5],
        bearish: ['ba-tag-bear',    'BEARISH', 0.0],
    };
    
    const [tagCls, tagLbl, multiplier] = tagMap[sig.signal] || tagMap.neutral;
    
    // Calculate points: e.g., Neutral on a weight of 2 = 1.0 points
    const pointsReached = (sig.weight * multiplier).toFixed(1);
    // Remove .0 if it's a whole number for cleaner look
    const displayPoints = pointsReached.endsWith('.0') ? parseInt(pointsReached) : pointsReached;

    return `
    <div class="ba-row" style="display: flex; align-items: center; gap: 1rem;">
        <span class="ba-tag ${tagCls}">${tagLbl}</span>
        <div style="flex:1; min-width:0;">
            <div class="ba-row-name">${h(sig.name)}</div>
            <div class="ba-row-value">${h(sig.value)}</div>
            <div class="ba-row-interp">${h(sig.interpretation)}</div>
        </div>
        <div style="text-align: right; flex-shrink: 0; margin-left: 10px;">
            <div style="font-size: 0.70rem; color: #9CA3AF; text-transform: uppercase; font-weight: 700;">Score</div>
            <div style="font-size: 0.8rem; font-weight: 600; color: #9CA3AF;">
                ${displayPoints}<span style="color: #9CA3AF; font-weight: 600; font-size: 0.8rem;">/${sig.weight}</span>
            </div>
        </div>
    </div>`;
}
//// With actual scores instead of weighted scores:
//function renderSignalRow(sig) {
//    const tagMap = {
//        bullish: ['ba-tag-bull',    'BULLISH'],
//        neutral: ['ba-tag-neutral', 'NEUTRAL'],
//        bearish: ['ba-tag-bear',    'BEARISH'],
//    };
//    
//    const [tagCls, tagLbl] = tagMap[sig.signal] || tagMap.neutral;
//
//    return `
//    <div class="ba-row" style="display: flex; align-items: center; gap: 1rem;">
//        <span class="ba-tag ${tagCls}">${tagLbl}</span>
//        <div style="flex:1; min-width:0;">
//            <div class="ba-row-name">${h(sig.name)}</div>
//            <div class="ba-row-value">${h(sig.value)}</div>
//            <div class="ba-row-interp">${h(sig.interpretation)}</div>
//        </div>
//        <div style="text-align: right; flex-shrink: 0; min-width: 90px;">
//            <div style="font-size: 0.65rem; color: #9CA3AF; text-transform: uppercase; font-weight: 700;">Impact</div>
//            <div style="font-size: 1.1rem; font-weight: 700; color: #374151;">
//                +${sig.actual_contribution}<span style="color: #D1D5DB; font-size: 0.8rem;"> / ${sig.max_contribution}</span>
//            </div>
//        </div>
//    </div>`;
//}

// ── Insider transactions table ────────────────────────────────────────────────
function insiderTable(d) {
    const txns = d.insider_transactions || [];
    const pct  = d.insider_pct_held;

    if (txns.length === 0 && pct == null) return '';

    const pctBadge = pct != null
        ? `<span style="font-size:0.8rem;font-weight:600;color:var(--text-secondary);margin-left:0.75rem;">${pct.toFixed(2)}% insider owned</span>`
        : '';

    const rows = txns.map(tx => {
        const isBuy   = tx.type === 'buy';
        const tagCls  = isBuy ? 'ba-tag-bull' : 'ba-tag-bear';
        const tagLbl  = isBuy ? 'BUY' : 'SELL';
        const dimmed  = tx.recent ? '' : 'opacity:0.55;';
        const shares  = tx.shares  ? tx.shares.toLocaleString()  : '-';
        const value   = tx.value && tx.value > 0
                        ? '$' + (tx.value >= 1e6
                            ? (tx.value / 1e6).toFixed(1) + 'M'
                            : tx.value.toLocaleString(undefined, { maximumFractionDigits: 0 }))
                        : '-';
        return `
        <tr style="${dimmed}">
            <td style="padding:0.625rem 0.5rem;white-space:nowrap;color:var(--text-muted);font-size:0.8125rem;">${h(tx.date)}</td>
            <td style="padding:0.625rem 0.5rem;"><span class="ba-tag ${tagCls}" style="min-width:40px;">${tagLbl}</span></td>
            <td style="padding:0.625rem 0.5rem;font-weight:600;color:var(--text-primary);font-size:0.875rem;">${h(tx.name || '-')}</td>
            <td style="padding:0.625rem 0.5rem;color:var(--text-secondary);font-size:0.8125rem;">${h(tx.role || '-')}</td>
            <td style="padding:0.625rem 0.5rem;text-align:right;font-weight:600;color:var(--text-primary);font-size:0.875rem;">${shares}</td>
            <td style="padding:0.625rem 0.5rem;text-align:right;color:var(--text-secondary);font-size:0.8125rem;">${value}</td>
        </tr>`;
    }).join('');

    const emptyRow = txns.length === 0
        ? `<tr><td colspan="6" style="padding:1.5rem;text-align:center;color:var(--text-muted);font-size:0.875rem;">No recent insider transactions found</td></tr>`
        : '';

    return `
    <div class="calculator-card" style="margin-bottom:1.5rem;">
        <h3 class="card-title" style="display:flex;align-items:baseline;gap:0;flex-wrap:wrap;">
            Insider Transactions${pctBadge}
        </h3>
        <p style="font-size:0.8125rem;color:var(--text-muted);margin-bottom:1rem;">
            Discretionary buys and sells on the open market only (excludes automatic, gift, and option-exercise transactions).
            Faded rows are older than 6 months.
        </p>
        <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="border-bottom:2px solid var(--border);">
                        <th style="padding:0.5rem;text-align:left;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);">Date</th>
                        <th style="padding:0.5rem;text-align:left;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);">Type</th>
                        <th style="padding:0.5rem;text-align:left;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);">Insider</th>
                        <th style="padding:0.5rem;text-align:left;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);">Role</th>
                        <th style="padding:0.5rem;text-align:right;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);">Shares</th>
                        <th style="padding:0.5rem;text-align:right;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);">Value</th>
                    </tr>
                </thead>
                <tbody style="border-top:1px solid var(--border);">
                    ${rows}${emptyRow}
                </tbody>
            </table>
        </div>
    </div>`;
}