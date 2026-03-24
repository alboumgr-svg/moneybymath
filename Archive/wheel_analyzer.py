"""
Options Wheel Stock Analyzer
=============================
Run:  python wheel_analyzer.py
Deps: pip install yfinance numpy pandas scipy

Checks every criterion from the Easy Mode + Hard Mode stock-selection guides,
scores the ticker 0-100, and prints a colour-coded report.
"""

import sys
import math
import datetime
import warnings
warnings.filterwarnings("ignore")

try:
    import yfinance as yf
    import numpy as np
    import pandas as pd
except ImportError:
    print("\n❌  Missing dependencies. Run:\n    pip install yfinance numpy pandas\n")
    sys.exit(1)

# ── ANSI colours ──────────────────────────────────────────────────────────────
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
BLUE   = "\033[94m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
DIM    = "\033[2m"
RESET  = "\033[0m"

def clr(text, color): return f"{color}{text}{RESET}"
def bold(text):        return f"{BOLD}{text}{RESET}"


# ── Helpers ───────────────────────────────────────────────────────────────────
def calc_rsi(prices: pd.Series, period: int = 14) -> float:
    delta  = prices.diff().dropna()
    gain   = delta.clip(lower=0)
    loss   = (-delta).clip(lower=0)
    avg_g  = gain.ewm(com=period - 1, adjust=False).mean()
    avg_l  = loss.ewm(com=period - 1, adjust=False).mean()
    rs     = avg_g / avg_l.replace(0, np.nan)
    rsi    = 100 - (100 / (1 + rs))
    return float(rsi.iloc[-1])


def calc_iv_from_chain(ticker_obj, spot: float) -> tuple[float | None, str]:
    """Return (average_atm_iv, source_note). Uses nearest expiry ≥ 14 days."""
    try:
        exps = ticker_obj.options
        if not exps:
            return None, "no options listed"
        today = datetime.date.today()
        # Pick first expiry ≥ 14 days out (more representative)
        target_exp = None
        for exp in exps:
            exp_date = datetime.date.fromisoformat(exp)
            if (exp_date - today).days >= 14:
                target_exp = exp
                break
        if not target_exp:
            target_exp = exps[0]

        chain  = ticker_obj.option_chain(target_exp)
        puts   = chain.puts
        calls  = chain.calls

        # ATM = strike closest to spot
        atm_put  = puts.iloc[(puts["strike"] - spot).abs().argsort()[:3]]
        atm_call = calls.iloc[(calls["strike"] - spot).abs().argsort()[:3]]

        ivs = []
        for df in [atm_put, atm_call]:
            col = "impliedVolatility"
            if col in df.columns:
                valid = df[col][df[col] > 0.01]
                ivs.extend(valid.tolist())

        if not ivs:
            return None, "IV data unavailable"

        avg_iv = float(np.mean(ivs))
        return avg_iv, f"ATM options ({target_exp})"
    except Exception as e:
        return None, f"error: {e}"


def calc_bid_ask_spread(ticker_obj, spot: float) -> tuple[float | None, float | None, str]:
    """Return (avg_spread_pct, avg_spread_dollar, note) from nearest ATM options."""
    try:
        exps = ticker_obj.options
        if not exps:
            return None, None, "no options"
        today = datetime.date.today()
        target_exp = None
        for exp in exps:
            if (datetime.date.fromisoformat(exp) - today).days >= 14:
                target_exp = exp
                break
        if not target_exp:
            target_exp = exps[0]

        chain = ticker_obj.option_chain(target_exp)
        rows  = []
        for df in [chain.puts, chain.calls]:
            atm = df.iloc[(df["strike"] - spot).abs().argsort()[:3]]
            rows.append(atm)
        combined = pd.concat(rows)

        spreads_abs  = (combined["ask"] - combined["bid"]).dropna()
        spreads_abs  = spreads_abs[spreads_abs > 0]
        mids         = ((combined["ask"] + combined["bid"]) / 2).replace(0, np.nan).dropna()

        if spreads_abs.empty:
            return None, None, "spread data missing"

        avg_dollar = float(spreads_abs.mean())
        avg_pct    = float((spreads_abs / mids.reindex(spreads_abs.index)).mean() * 100)
        return avg_pct, avg_dollar, target_exp
    except Exception as e:
        return None, None, f"error: {e}"


def days_to_earnings(ticker_obj) -> int | None:
    """Return number of calendar days until next earnings, or None."""
    try:
        cal = ticker_obj.calendar
        if cal is None:
            return None
        # calendar is a dict with 'Earnings Date' key (list of dates) in newer yfinance
        if isinstance(cal, dict):
            dates = cal.get("Earnings Date", [])
            if not dates:
                return None
            next_earn = min(
                (d.date() if hasattr(d, "date") else d) for d in dates
                if (d.date() if hasattr(d, "date") else d) >= datetime.date.today()
            )
        else:
            # older yfinance returns a DataFrame
            row = cal.loc["Earnings Date"] if "Earnings Date" in cal.index else None
            if row is None:
                return None
            dates = [v for v in row.values if pd.notna(v)]
            if not dates:
                return None
            next_earn = min(
                (d.date() if hasattr(d, "date") else d) for d in dates
            )
        return (next_earn - datetime.date.today()).days
    except Exception:
        return None


def score_label(score: int) -> str:
    if score >= 75: return clr("EXCELLENT ✅", GREEN)
    if score >= 55: return clr("GOOD  ✅",     GREEN)
    if score >= 40: return clr("FAIR  ⚠️",     YELLOW)
    return clr("POOR  ❌", RED)


def pass_fail(condition: bool, good_msg: str, bad_msg: str) -> tuple[str, int]:
    """Returns (display_string, points_earned)."""
    if condition:
        return clr(f"✅  {good_msg}", GREEN), 1
    return clr(f"❌  {bad_msg}", RED), 0


def warn_pass(condition: bool, good_msg: str, warn_msg: str) -> tuple[str, int]:
    if condition:
        return clr(f"✅  {good_msg}", GREEN), 1
    return clr(f"⚠️  {warn_msg}", YELLOW), 0


# ── Main analyzer ─────────────────────────────────────────────────────────────
def analyze(ticker_symbol: str):
    ticker_symbol = ticker_symbol.upper().strip()

    print()
    print(clr("━" * 60, BLUE))
    print(bold(clr(f"  OPTIONS WHEEL ANALYZER — {ticker_symbol}", CYAN)))
    print(clr("━" * 60, BLUE))
    print(DIM + f"  Fetching data from Yahoo Finance…" + RESET)

    t = yf.Ticker(ticker_symbol)

    # ── Pull raw data ─────────────────────────────────────────────────────────
    try:
        info = t.info
    except Exception as e:
        print(clr(f"\n❌  Could not fetch data for '{ticker_symbol}': {e}\n", RED))
        return

    # Spot price
    spot = (
        info.get("currentPrice")
        or info.get("regularMarketPrice")
        or info.get("previousClose")
    )
    if not spot:
        print(clr(f"\n❌  No price data for '{ticker_symbol}'. Check the ticker.\n", RED))
        return

    # Historical prices (1 year for RSI, MAs, IVR approximation)
    hist = t.history(period="1y", auto_adjust=True)
    if hist.empty:
        print(clr("\n❌  No historical price data available.\n", RED))
        return

    closes = hist["Close"]

    # Fundamental data
    market_cap    = info.get("marketCap")          # int (dollars)
    pe_ratio      = info.get("trailingPE")         # float
    pb_ratio      = info.get("priceToBook")        # float
    div_yield     = info.get("dividendYield")      # float (0.03 = 3%)
    sector        = info.get("sector", "Unknown")
    industry      = info.get("industry", "Unknown")
    short_name    = info.get("shortName", ticker_symbol)
    beta          = info.get("beta")
    total_cash    = info.get("totalCash")
    total_debt    = info.get("totalDebt")
    free_cashflow = info.get("freeCashflow")
    revenue_growth= info.get("revenueGrowth")     # float (0.12 = 12%)
    avg_volume    = info.get("averageVolume")
    options_volume= info.get("averageVolume10days")

    # Moving averages
    ma50  = float(closes.tail(50).mean())  if len(closes) >= 50  else None
    ma200 = float(closes.tail(200).mean()) if len(closes) >= 200 else None

    # RSI
    rsi = calc_rsi(closes) if len(closes) >= 20 else None

    # IV
    iv, iv_source = calc_iv_from_chain(t, spot)

    # IVR  (52-week high/low of IV is ideal, but not available free;
    #       we approximate using price-based HV and positional ranking)
    # Historical Volatility (30-day HV as proxy for "current IV" history)
    log_ret  = np.log(closes / closes.shift(1)).dropna()
    hv_series = log_ret.rolling(21).std() * math.sqrt(252) * 100  # annualised %
    hv_current = float(hv_series.iloc[-1]) if not hv_series.empty else None
    hv_52wk_high = float(hv_series.max())  if not hv_series.empty else None
    hv_52wk_low  = float(hv_series.min())  if not hv_series.empty else None
    ivr_approx = None
    if hv_52wk_high and hv_52wk_low and hv_current and (hv_52wk_high - hv_52wk_low) > 0:
        ivr_approx = (hv_current - hv_52wk_low) / (hv_52wk_high - hv_52wk_low) * 100

    # Bid-ask spread
    spread_pct, spread_dollar, spread_note = calc_bid_ask_spread(t, spot)

    # Earnings
    earn_days = days_to_earnings(t)

    # ── PRINT HEADER ──────────────────────────────────────────────────────────
    print()
    print(bold(f"  {short_name}  ({ticker_symbol})"))
    print(f"  {sector} → {industry}")
    print(f"  Current Price : {bold('$' + f'{spot:.2f}')}")
    if market_cap:
        mc_b = market_cap / 1e9
        print(f"  Market Cap    : {'$' + f'{mc_b:.1f}B'}")
    print()

    total_points = 0
    max_points   = 0
    results      = []

    def check(label: str, display: str, pts: int, weight: int = 1):
        nonlocal total_points, max_points
        total_points += pts * weight
        max_points   += weight
        results.append((label, display, pts, weight))

    # ══════════════════════════════════════════════════════════════════════════
    #  EASY MODE CHECKS
    # ══════════════════════════════════════════════════════════════════════════
    print(clr("  ── EASY MODE CRITERIA ──────────────────────────────────", BLUE))
    print()

    # 1. Stock price range $20–$150
    in_price_range = 20 <= spot <= 150
    if in_price_range:
        d = clr(f"✅  ${spot:.2f} — in ideal $20–$150 range", GREEN), 1
    elif spot < 20:
        d = clr(f"❌  ${spot:.2f} — too cheap (under $20), premiums will be small", RED), 0
    else:
        d = clr(f"⚠️  ${spot:.2f} — above $150, requires more capital per contract", YELLOW), 0
    print(f"  Stock Price              {d[0]}")
    check("Price Range", d[0], d[1], weight=2)

    # 2. Market cap > $2B
    if market_cap:
        mc_b = market_cap / 1e9
        d = pass_fail(mc_b >= 2,
                      f"${mc_b:.1f}B market cap — meets >$2B threshold",
                      f"${mc_b:.1f}B market cap — below $2B, higher volatility risk")
        print(f"  Market Cap               {d[0]}")
        check("Market Cap", d[0], d[1], weight=2)
    else:
        print(f"  Market Cap               {clr('⚠️  Data unavailable', YELLOW)}")

    # 3. Earnings date
    if earn_days is not None:
        if earn_days <= 0:
            d = clr(f"❌  Earnings was {abs(earn_days)}d ago — check for upcoming dates", RED), 0
        elif earn_days <= 21:
            d = clr(f"❌  Earnings in {earn_days} days — HIGH RISK, avoid new positions!", RED), 0
        elif earn_days <= 45:
            d = clr(f"⚠️  Earnings in {earn_days} days — stay at short expirations", YELLOW), 1
        else:
            d = clr(f"✅  Earnings in {earn_days} days — safe window for most expirations", GREEN), 1
        print(f"  Earnings Safety          {d[0]}")
        check("Earnings", d[0], d[1], weight=3)
    else:
        print(f"  Earnings Safety          {clr('⚠️  Date unavailable — check manually', YELLOW)}")

    # 4. Liquidity (bid-ask spread)
    if spread_dollar is not None:
        tight = spread_dollar <= 0.15
        ok    = spread_dollar <= 0.30
        if tight:
            d = clr(f"✅  Avg ATM spread ${spread_dollar:.2f} — tight, good liquidity", GREEN), 1
        elif ok:
            d = clr(f"⚠️  Avg ATM spread ${spread_dollar:.2f} — acceptable but not ideal", YELLOW), 1
        else:
            d = clr(f"❌  Avg ATM spread ${spread_dollar:.2f} — wide spread, costly to trade", RED), 0
        print(f"  Options Bid-Ask Spread   {d[0]}")
        check("Bid-Ask Spread", d[0], d[1], weight=2)
    else:
        print(f"  Options Liquidity        {clr(f'⚠️  Spread data unavailable ({spread_note})', YELLOW)}")

    # 5. P/E ratio
    if pe_ratio and pe_ratio > 0:
        reasonable_pe = pe_ratio <= 35
        d = warn_pass(reasonable_pe,
                      f"P/E {pe_ratio:.1f} — reasonable valuation",
                      f"P/E {pe_ratio:.1f} — elevated, overvalued stocks have further to fall")
        print(f"  P/E Ratio                {d[0]}")
        check("P/E Ratio", d[0], d[1], weight=1)
    elif pe_ratio and pe_ratio < 0:
        print(f"  P/E Ratio                {clr('⚠️  Negative P/E — company is unprofitable', YELLOW)}")
        check("P/E Ratio", "", 0, weight=1)
    else:
        print(f"  P/E Ratio                {clr('⚠️  Data unavailable', YELLOW)}")

    # 6. P/B ratio
    if pb_ratio:
        d = warn_pass(pb_ratio <= 3,
                      f"P/B {pb_ratio:.2f} — under 3, not excessively overvalued",
                      f"P/B {pb_ratio:.2f} — above 3, assets may be overstated vs. price")
        print(f"  Price-to-Book (P/B)      {d[0]}")
        check("P/B Ratio", d[0], d[1], weight=1)
    else:
        print(f"  Price-to-Book (P/B)      {clr('⚠️  Data unavailable', YELLOW)}")

    # 7. Fundamental health (free cash flow + revenue growth)
    fcf_pos     = free_cashflow is not None and free_cashflow > 0
    rev_growing = revenue_growth is not None and revenue_growth > 0
    debt_ratio  = (total_debt / total_cash) if (total_debt and total_cash and total_cash > 0) else None

    if fcf_pos and rev_growing:
        d = clr("✅  Positive FCF + positive revenue growth", GREEN), 1
    elif fcf_pos:
        d = clr(f"⚠️  Positive FCF but flat/declining revenue growth ({revenue_growth*100:.1f}% YoY)" if revenue_growth else "⚠️  Positive FCF, revenue growth data unavailable", YELLOW), 1
    else:
        d = clr("❌  Negative or unavailable free cash flow — fundamental risk", RED), 0
    print(f"  Fundamental Health       {d[0]}")
    check("Fundamentals", d[0], d[1], weight=2)

    if debt_ratio is not None:
        debt_str = f"Debt/Cash ratio: {debt_ratio:.1f}x"
        if debt_ratio > 5:
            print(f"    {clr('⚠️  ' + debt_str + ' — high leverage', YELLOW)}")
        else:
            print(f"    {clr('✅  ' + debt_str, DIM)}")

    # 8. Dividend
    if div_yield and div_yield > 0:
        div_pct = div_yield * 100
        ideal   = 1 <= div_pct <= 5
        d = warn_pass(ideal,
                      f"Dividend yield {div_pct:.2f}% — pays you while holding if assigned",
                      f"Dividend yield {div_pct:.2f}% — {'very high, check sustainability' if div_pct > 5 else 'below 1%'}")
        print(f"  Dividend Yield           {d[0]}")
        check("Dividend", d[0], 1 if ideal else 0, weight=1)
    else:
        print(f"  Dividend Yield           {clr('ℹ️  No dividend — miss out on income if assigned', DIM)}")
        check("Dividend", "", 0, weight=1)

    print()

    # ══════════════════════════════════════════════════════════════════════════
    #  HARD MODE CHECKS
    # ══════════════════════════════════════════════════════════════════════════
    print(clr("  ── HARD MODE CRITERIA ──────────────────────────────────", BLUE))
    print()

    # 9. Moving averages (trend)
    above_50  = ma50  and spot > ma50
    above_200 = ma200 and spot > ma200
    if above_50 and above_200:
        d = clr(f"✅  Above both MA50 (${ma50:.2f}) and MA200 (${ma200:.2f}) — uptrend", GREEN), 1
    elif above_200:
        d = clr(f"⚠️  Below MA50 (${ma50:.2f}) but above MA200 (${ma200:.2f}) — mild weakness", YELLOW), 1
    elif above_50:
        d = clr(f"⚠️  Above MA50 (${ma50:.2f}) but below MA200 (${ma200:.2f}) — long-term downtrend", YELLOW), 0
    else:
        d = clr(f"❌  Below MA50 (${(ma50 or 0):.2f}) and MA200 (${(ma200 or 0):.2f}) — bearish", RED), 0
    print(f"  Moving Averages          {d[0]}")
    check("Moving Averages", d[0], d[1], weight=2)

    # 10. RSI
    if rsi is not None:
        if rsi < 30:
            d = clr(f"⚠️  RSI {rsi:.1f} — oversold, bounce possible but momentum is weak", YELLOW), 0
        elif 40 <= rsi <= 65:
            d = clr(f"✅  RSI {rsi:.1f} — healthy range (40–65)", GREEN), 1
        elif 30 <= rsi < 40:
            d = clr(f"⚠️  RSI {rsi:.1f} — slightly weak momentum", YELLOW), 1
        elif 65 < rsi <= 75:
            d = clr(f"⚠️  RSI {rsi:.1f} — approaching overbought territory", YELLOW), 0
        else:
            d = clr(f"❌  RSI {rsi:.1f} — overbought (>75), pullback risk is elevated", RED), 0
        print(f"  RSI (14-day)             {d[0]}")
        check("RSI", d[0], d[1], weight=2)
    else:
        print(f"  RSI (14-day)             {clr('⚠️  Insufficient data', YELLOW)}")

    # 11. Implied Volatility
    if iv is not None:
        iv_pct = iv * 100
        if iv_pct < 20:
            d = clr(f"❌  IV {iv_pct:.1f}% — too low, premiums barely worth selling", RED), 0
        elif iv_pct > 80:
            d = clr(f"❌  IV {iv_pct:.1f}% — dangerously high, market pricing in a big move", RED), 0
        elif 25 <= iv_pct <= 60:
            d = clr(f"✅  IV {iv_pct:.1f}% — sweet spot (25–60%), good premium potential", GREEN), 1
        else:
            d = clr(f"⚠️  IV {iv_pct:.1f}% — usable but outside the ideal 25–60% range", YELLOW), 0
        print(f"  Implied Volatility (IV)  {d[0]}")
        print(f"    {DIM}Source: {iv_source}{RESET}")
        check("Implied Volatility", d[0], d[1], weight=2)
    else:
        print(f"  Implied Volatility (IV)  {clr(f'⚠️  Unavailable ({iv_source})', YELLOW)}")

    # 12. IVR (approximated via historical volatility rank)
    if ivr_approx is not None:
        if ivr_approx >= 50:
            d = clr(f"✅  HV Rank {ivr_approx:.0f} — volatility is elevated vs. past year, sell premium now", GREEN), 1
        elif ivr_approx >= 30:
            d = clr(f"⚠️  HV Rank {ivr_approx:.0f} — moderate (>30 preferred, >50 ideal)", YELLOW), 1
        else:
            d = clr(f"❌  HV Rank {ivr_approx:.0f} — volatility is historically LOW, premiums are cheap", RED), 0
        print(f"  IV Rank (HV-based approx){d[0]}")
        print(f"    {DIM}Note: True IVR needs historical IV data. Use your broker for exact IVR.{RESET}")
        check("IVR", d[0], d[1], weight=2)
    else:
        print(f"  IV Rank (approx)         {clr('⚠️  Insufficient data (need 1 year of prices)', YELLOW)}")

    # 13. Beta / extreme volatility check
    if beta is not None:
        if beta <= 0:
            d = clr(f"ℹ️  Beta {beta:.2f} — inverse/uncorrelated to market", DIM), 1
        elif beta <= 1.5:
            d = clr(f"✅  Beta {beta:.2f} — manageable market sensitivity", GREEN), 1
        elif beta <= 2.5:
            d = clr(f"⚠️  Beta {beta:.2f} — above-average market swings", YELLOW), 0
        else:
            d = clr(f"❌  Beta {beta:.2f} — very high beta, large gap-risk on macro events", RED), 0
        print(f"  Beta                     {d[0]}")
        check("Beta", d[0], d[1], weight=1)

    print()

    # ══════════════════════════════════════════════════════════════════════════
    #  SUMMARY
    # ══════════════════════════════════════════════════════════════════════════
    score_pct = int(round(total_points / max_points * 100)) if max_points else 0
    print(clr("━" * 60, BLUE))
    print()
    print(bold(f"  OVERALL SCORE  →  {score_pct}/100   {score_label(score_pct)}"))
    print()

    # Bar chart
    filled = score_pct // 2
    bar = "█" * filled + "░" * (50 - filled)
    bar_color = GREEN if score_pct >= 65 else YELLOW if score_pct >= 40 else RED
    print(f"  [{clr(bar, bar_color)}]")
    print()

    # Verdict
    if score_pct >= 75:
        verdict = clr("  ✅ STRONG CANDIDATE for the Wheel Strategy", GREEN)
        detail  = "  This stock passes most criteria. Consider selling a CSP on next dip."
    elif score_pct >= 55:
        verdict = clr("  ✅ DECENT CANDIDATE — proceed with awareness", GREEN)
        detail  = "  A few yellow flags. Stick to short expirations and smaller size."
    elif score_pct >= 40:
        verdict = clr("  ⚠️  MARGINAL — significant risks present", YELLOW)
        detail  = "  Multiple criteria failed. Only trade this if you know why you want it."
    else:
        verdict = clr("  ❌ NOT RECOMMENDED for the Wheel Strategy", RED)
        detail  = "  Too many red flags. Wait for better conditions or pick another stock."

    print(bold(verdict))
    print(clr(detail, DIM))
    print()

    # Failed items quick-list
    fails = [label for label, disp, pts, w in results if pts == 0 and w >= 2]
    if fails:
        print(clr("  Key concerns:", RED))
        for f in fails:
            print(clr(f"    • {f}", RED))
        print()

    print(clr("━" * 60, BLUE))

    # Suggested next steps
    print()
    print(clr("  NEXT STEPS", CYAN))
    if earn_days is not None and earn_days <= 30:
        print(clr(f"  ⚠️  Earnings in {earn_days} days — wait until AFTER earnings to enter!", YELLOW))
    if iv and iv * 100 >= 25:
        print(clr("  💡  IV is workable — check your broker for current IVR before entering.", DIM))
    print(clr("  💡  Verify support levels on a chart (TradingView is free).", DIM))
    print(clr("  💡  Confirm no upcoming FDA/legal/macro events with a quick news search.", DIM))
    print(clr("  💡  Check open interest on the options chain — you want > 100 OI at your strike.", DIM))
    print()


# ── Entry point ───────────────────────────────────────────────────────────────
def main():
    if len(sys.argv) > 1:
        tickers = sys.argv[1:]
    else:
        raw = input(bold("\n  Enter ticker symbol(s) separated by spaces: ")).strip()
        tickers = raw.upper().split()

    if not tickers:
        print(clr("  No ticker entered. Exiting.\n", RED))
        return

    for ticker in tickers:
        analyze(ticker)
        if len(tickers) > 1 and ticker != tickers[-1]:
            input(clr("  Press Enter to continue to next ticker…", DIM))


if __name__ == "__main__":
    main()
