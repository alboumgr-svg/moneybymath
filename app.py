import os
import math
import datetime
import pandas as pd
import numpy as np
from flask import Flask, jsonify, render_template, request, send_from_directory
from flask_cors import CORS
import requests
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# ─────────────────────────────────────────────────────────────────────────────
#  Financial Modeling Prep (FMP) helpers
# ─────────────────────────────────────────────────────────────────────────────

FMP_API_KEY = os.getenv("FMP_API_KEY")
# Root domain only - every call prefixes /stable/, /api/v3/, or /api/v4/ explicitly.
FMP_BASE = "https://financialmodelingprep.com"


def fmp_fetch(path, **params):
    """
    GET from FMP API; returns parsed JSON or raises on error.
    path must begin with /stable/, /api/v3/, or /api/v4/.
    Extra kwargs are forwarded as URL query parameters.
    """
    params["apikey"] = FMP_API_KEY
    url = f"{FMP_BASE}{path}"
    resp = requests.get(url, params=params, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    if isinstance(data, dict) and data.get("Error Message"):
        raise ValueError(data["Error Message"])
    return data


def _one(data):
    """Return first element if list, or the dict itself – handles both stable and legacy response shapes."""
    if isinstance(data, list):
        return data[0] if data else {}
    return data if isinstance(data, dict) else {}

def get_fmp_history(ticker, days=365):
    """
    Return a DataFrame with Open, High, Low, Close, Volume indexed by date (ascending).
    Uses FMP free /stable/historical-price-full/ endpoint.
    """
    from_date = (datetime.date.today() - datetime.timedelta(days=days)).isoformat()
    data = fmp_fetch(
        "/stable/historical-price-eod/full",
        symbol=ticker,
        **{"from": from_date}
    )
    if not isinstance(data, list) or not data:
        return pd.DataFrame()

    df = pd.DataFrame(data)

    if "date" not in df.columns:
        return pd.DataFrame()

    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").set_index("date")

    df = df.rename(columns={
        "open":   "Open",
        "high":   "High",
        "low":    "Low",
        "close":  "Close",
        "volume": "Volume",
    })

    for col in ["Open", "High", "Low", "Close", "Volume"]:
        if col not in df.columns:
            df[col] = float("nan")

    return df[["Open", "High", "Low", "Close", "Volume"]]


def build_fmp_info(ticker):
    """
    Fetch several FMP v3 endpoints and return a dict with
    yfinance-compatible key names so the signal code needs no changes.
    """
    info = {}

    # ── 1. Company profile ────────────────────────────────────────────────────
    try:
        data = fmp_fetch("/stable/profile", symbol=ticker)
        p = _one(data)
        if p:
            info["shortName"]     = p.get("companyName", ticker)
            info["longName"]      = p.get("companyName", ticker)
            info["sector"]        = p.get("sector")
            info["industry"]      = p.get("industry")
            info["beta"]          = p.get("beta")
            info["marketCap"]     = p.get("mktCap")
            info["averageVolume"] = p.get("volAvg")
            info["quoteType"]     = "ETF" if p.get("isEtf") else "EQUITY"
    except Exception as e:
        pass
        #print(f"DEBUG: Section 1 (Profile) failed for {ticker}: {e}")

    # ── 2. Real-time quote ────────────────────────────────────────────────────
    try:
        data = fmp_fetch(f"/stable/quote", symbol=ticker)
        q = _one(data)
        if q:
            info["currentPrice"]  = q.get("price")
            info["previousClose"] = q.get("previousClose")
            if not info.get("trailingPE"):
                info["trailingPE"] = q.get("pe")
            if not info.get("marketCap"):
                info["marketCap"] = q.get("marketCap")
            if not info.get("averageVolume"):
                info["averageVolume"] = q.get("avgVolume")
    except Exception as e:
        pass
        #print(f"DEBUG: Section 2 (Quote) failed for {ticker}: {e}")

    # ── 3. Key metrics TTM ────────────────────────────────────────────────────
    try:
        data = fmp_fetch(f"/stable/key-metrics-ttm", symbol=ticker)
        m = _one(data)
        if m:
            if not info.get("trailingPE"):
                info["trailingPE"] = m.get("peRatioTTM")
            info["priceToBook"]                  = m.get("pbRatioTTM")
            info["priceToSalesTrailing12Months"] = m.get("priceToSalesRatioTTM")
            info["enterpriseToEbitda"]           = m.get("enterpriseValueOverEBITDATTM")
            info["pegRatio"]                     = m.get("pegRatioTTM")
            dy = m.get("dividendYieldPercentageTTM") 
            if dy is not None:
                info["dividendYield"] = dy / 100 if dy > 1 else dy
            else:
                dy2 = m.get("dividendYieldTTM")
                if dy2 is not None:
                    info["dividendYield"] = dy2
    except Exception as e:
        pass
        #print(f"DEBUG: Section 3 (Metrics) failed for {ticker}: {e}")

    # ── 4. Financial ratios TTM ───────────────────────────────────────────────
    try:
        data = fmp_fetch(f"/stable/ratios-ttm", symbol=ticker)
        r = _one(data)
        if r:
            info["grossMargins"]   = r.get("grossProfitMarginTTM")
            info["profitMargins"]  = r.get("netProfitMarginTTM")
            info["returnOnEquity"] = r.get("returnOnEquityTTM")
            info["currentRatio"]   = r.get("currentRatioTTM")
            info["payoutRatio"]    = r.get("payoutRatioTTM")
            dte = r.get("debtToEquityRatioTTM")
            if dte is None:
                dte = r.get("debtEquityRatioTTM")
            info["debtToEquity"] = dte * 100 if dte is not None else None
            fpe = r.get("priceEarningsRatioTTM")
            if fpe is not None and not info.get("forwardPE"):
                info["forwardPE"] = fpe
            if not info.get("dividendYield"):
                dy = r.get("dividendYieldPercentageTTM") or r.get("dividendYieldTTM")
                if dy:
                    info["dividendYield"] = dy / 100 if dy > 1 else dy
    except Exception as e:
        pass
        #print(f"DEBUG: Section 4 (Ratios) failed for {ticker}: {e}")

    # ── 5. Cash-flow statement (most recent annual) ───────────────────────────
    try:
        data = fmp_fetch(f"/stable/cash-flow-statement", symbol=ticker, limit=1)
        cf = _one(data)
        if cf:
            info["freeCashflow"]      = cf.get("freeCashFlow")
            info["operatingCashflow"] = cf.get("operatingCashFlow")
    except Exception as e:
        pass
        #print(f"DEBUG: Section 5 (Cash Flow) failed for {ticker}: {e}")

    # ── 6. Balance sheet (most recent annual) ─────────────────────────────────
    try:
        data = fmp_fetch(f"/stable/balance-sheet-statement", symbol=ticker, limit=1)
        bs = _one(data)
        if bs:
            info["totalDebt"] = bs.get("totalDebt")
            cash = bs.get("cashAndCashEquivalents") or 0
            sti  = bs.get("shortTermInvestments")   or 0
            info["totalCash"] = cash + sti
    except Exception as e:
        pass
        #print(f"DEBUG: Section 6 (Balance Sheet) failed for {ticker}: {e}")

    # ── 7. Income statement – 2 years for YoY growth ──────────────────────────
    try:
        data = fmp_fetch(f"/stable/income-statement", symbol=ticker, limit=2)
        if isinstance(data, list) and data:
            info["netIncomeToCommon"] = data[0].get("netIncome")
            if len(data) >= 2:
                curr_rev = data[0].get("revenue") or 0
                prev_rev = data[1].get("revenue") or 0
                if prev_rev != 0:
                    info["revenueGrowth"] = (curr_rev - prev_rev) / abs(prev_rev)
                curr_eps = data[0].get("eps") or 0
                prev_eps = data[1].get("eps") or 0
                if prev_eps != 0:
                    info["earningsGrowth"] = (curr_eps - prev_eps) / abs(prev_eps)
    except Exception as e:
        pass
        #print(f"DEBUG: Section 7 (Income) failed for {ticker}: {e}")

    # ── 8. Analyst grades consensus ───────────────────────────────────────────
    try:
        data = fmp_fetch("/stable/grades-consensus", symbol=ticker)
        g = _one(data)
        if g:
            strong_buy  = g.get("strongBuy")  or 0
            buy         = g.get("buy")         or 0
            hold        = g.get("hold")        or 0
            sell        = g.get("sell")        or 0
            strong_sell = g.get("strongSell")  or 0
            total = strong_buy + buy + hold + sell + strong_sell
            if total > 0:
                bp = (strong_buy + buy) / total
                sp = (sell + strong_sell) / total
                info["analystBuyCount"]  = strong_buy + buy
                info["analystHoldCount"] = hold
                info["analystSellCount"] = sell + strong_sell
                info["analystTotal"]     = total
                if   bp >= 0.8: info["recommendationKey"] = "strong_buy"
                elif bp >= 0.6: info["recommendationKey"] = "buy"
                elif sp >= 0.5: info["recommendationKey"] = "sell"
                elif sp >= 0.3: info["recommendationKey"] = "underperform"
                else:           info["recommendationKey"] = "hold"
    except Exception as e:
        pass
        #print(f"DEBUG: Section 8 (Grades Consensus) failed for {ticker}: {e}")

    # ── 9. Financial health scores (Piotroski + Altman Z) ────────────────────
    try:
        data = fmp_fetch("/stable/financial-scores", symbol=ticker)
        fs = _one(data)
        if fs:
            info["piotroskiScore"] = fs.get("piotroskiScore")
            info["altmanZScore"]   = fs.get("altmanZScore")
    except Exception as e:
        pass
        #print(f"DEBUG: Section 9 (Financial Scores) failed for {ticker}: {e}")

    # ── 10. Multi-period price returns ────────────────────────────────────────
    try:
        data = fmp_fetch("/stable/stock-price-change", symbol=ticker)
        pc = _one(data)
        if pc:
            info["ret3M"] = pc.get("3M")
            info["ret6M"] = pc.get("6M")
            info["ret1Y"] = pc.get("1Y")
    except Exception as e:
        pass
        #print(f"DEBUG: Section 10 (Price Change) failed for {ticker}: {e}")

    # ── 11. DCF intrinsic value ───────────────────────────────────────────────
    try:
        data = fmp_fetch("/stable/discounted-cash-flow", symbol=ticker)
        dcf = _one(data)
        if dcf:
            info["dcfValue"] = dcf.get("dcf")
    except Exception as e:
        pass
        #print(f"DEBUG: Section 11 (DCF) failed for {ticker}: {e}")

    return info

def get_earnings_days(ticker):
    """
    Return days until next earnings (int), {"days": N, "estimated": True}, or None.
    Uses FMP v3 /stable/historical/earning_calendar/{ticker} endpoint.
    """
    now = datetime.datetime.now(datetime.timezone.utc)
    try:
        data = fmp_fetch(f"/stable/historical/earning_calendar", symbol=ticker)
        if not isinstance(data, list) or not data:
            return None

        future_dates = []
        past_dates   = []

        for entry in data:
            date_str = entry.get("date") or entry.get("reportedDate")
            if not date_str:
                continue
            try:
                dt = datetime.datetime.strptime(str(date_str)[:10], "%Y-%m-%d").replace(
                    tzinfo=datetime.timezone.utc
                )
                if dt > now:
                    future_dates.append(dt)
                else:
                    past_dates.append(dt)
            except Exception:
                continue

        if future_dates:
            nearest = min(future_dates)
            return max(math.ceil((nearest - now).total_seconds() / 86400), 0)

        # Estimate: last known date + 91 days (~1 quarter)
        if past_dates:
            most_recent = max(past_dates)
            estimated   = most_recent + datetime.timedelta(days=91)
            days = max(math.ceil((estimated - now).total_seconds() / 86400), 0)
            return {"days": days, "estimated": True}

    except Exception:
        pass

    return None

# Allow requests from your site. In production replace "*" with your domain,
# e.g. CORS(app, origins=["https://moneybymath.com"])
CORS(app, origins=["https://moneybymath.com"])

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/stock-analysis")
def stock_analysis():
    return render_template("stock-analysis.html")

@app.route("/afford-house")
def afford_house():
    return render_template("afford-house.html")

@app.route("/options-wheel")
def options_wheel():
    return render_template("options-wheel.html")

@app.route("/coast-fire")
def coast_fire():
    return render_template("coast-fire.html")

@app.route("/rent-vs-buy")
def rent_vs_buy():
    return render_template("rent-vs-buy.html")

@app.route("/compound-interest")
def compound_interest():
    return render_template("compound-interest.html")

@app.route("/debt-payoff")
def debt_payoff():
    return render_template("debt-payoff.html")

@app.route("/retirement")
def retirement():
    return render_template("retirement.html")

@app.route("/car-cost")
def car_cost():
    return render_template("car-cost.html")

@app.route("/kids-future")
def kids_future():
    return render_template("kids-future.html")

@app.route("/loan-from-401k")
def loan_from_401k():
    return render_template("loan-from-401k.html")

@app.route("/federal-tax")
def federal_tax():
    return render_template("federal-tax.html")

@app.route("/mortgage-calculator")
def mortgage_calculator():
    return render_template("mortgage-calculator.html")

@app.route("/budget")
def budget():
    return render_template("budget.html")

@app.route("/newsletter")
def newsletter():
    return render_template("newsletter.html", article=LATEST_ARTICLE)

@app.route("/ads.txt")
def ads():
    return send_from_directory(app.root_path, "ads.txt", mimetype="text/plain")

# ── Edit this every week ──────────────────────────────────────────────────────
LATEST_ARTICLE = {
    "title": "5 Mistakes to Avoid When Starting the Wheel Strategy",
    "date": "Feb 10, 2026",
    "read_time": "5 min read",
    "intro": "When I first started running the wheel strategy, I made several costly mistakes that ate into my returns. After two years of consistent execution, I've identified the five most common pitfalls that beginners face - and how to avoid them.",
    "sections": [
        {
            "heading": "1. Choosing High IV Stocks Without Understanding Why",
            "body": "Yes, high implied volatility means juicy premiums. But there's usually a reason a stock has elevated IV - it's risky. I learned this the hard way with a biotech stock that tanked 40% overnight on failed trial results. Now I only wheel stocks I'd be genuinely happy to own long-term."
        },
        {
            "heading": "2. Not Leaving Room for the Unexpected",
            "body": "Using all your capital on a single position leaves zero flexibility. When a better opportunity arose, I couldn't take advantage because I was fully deployed. Keep at least 20-30% in cash reserves to handle assignments and capitalize on volatility spikes."
        },
        {
            "heading": "3. Going Too Far Out of the Money on Puts",
            "body": "Selling puts at super low strikes feels safe, but the premiums are tiny and your return on capital suffers. I found the sweet spot is typically 5-10% below current price - enough premium to make it worthwhile, while staying within range of quality stocks I want to own."
        },
        {
            "heading": "4. Panicking and Closing Early",
            "body": "When a trade goes against you, the temptation to close early and take the loss is strong. But remember, the wheel strategy assumes you'll sometimes get assigned - that's not failure, that's the system working. Unless the fundamental thesis has changed, let the strategy play out."
        },
        {
            "heading": "5. Ignoring Earnings and Ex-Dividend Dates",
            "body": "Selling options right before earnings is essentially gambling. The IV crush after earnings can work in your favor if you're selling, but the risk of a gap move isn't worth it. Similarly, be aware of ex-dividend dates that might trigger early assignment on short calls."
        },
    ],
    "closing": "The wheel strategy is powerful, but it requires discipline and patience. Avoid these five mistakes and you'll be well on your way to consistent options income."
}

# ─────────────────────────────────────────────────────────────────────────────
#  Shared helpers
# ─────────────────────────────────────────────────────────────────────────────

def safe(val):
    """Return val if it's a finite number, else None."""
    try:
        v = float(val)
        return v if math.isfinite(v) else None
    except (TypeError, ValueError):
        return None


def ema(series, period):
    """Exponential moving average."""
    return series.ewm(span=period, adjust=False).mean()


def get_earnings_days(ticker):
    """
    Return days until next earnings (int), {"days": N, "estimated": True}, or None.
    Uses FMP stable /stable/earnings?symbol=TICKER endpoint.
    """
    now = datetime.datetime.now(datetime.timezone.utc)
    try:
        # Stable endpoint returns a list of earnings events, most recent first.
        data = fmp_fetch("/stable/earnings", symbol=ticker)
        if not isinstance(data, list) or not data:
            return None

        future_dates = []
        past_dates   = []

        for entry in data:
            date_str = entry.get("date") or entry.get("reportedDate")
            if not date_str:
                continue
            try:
                dt = datetime.datetime.strptime(str(date_str)[:10], "%Y-%m-%d").replace(
                    tzinfo=datetime.timezone.utc
                )
                if dt > now:
                    future_dates.append(dt)
                else:
                    past_dates.append(dt)
            except Exception:
                continue

        if future_dates:
            nearest = min(future_dates)
            return max(math.ceil((nearest - now).total_seconds() / 86400), 0)

        # Estimate: last known date + 91 days (~1 quarter)
        if past_dates:
            most_recent = max(past_dates)
            estimated   = most_recent + datetime.timedelta(days=91)
            days = max(math.ceil((estimated - now).total_seconds() / 86400), 0)
            return {"days": days, "estimated": True}

    except Exception:
        pass

    return None


# NOTE: get_options_data is commented out because FMP's options-chain endpoint
# requires a premium subscription.  The /api/stock route returns None for all
# options-related fields (iv, spreadDollar, optExpiry, atmOI, atmVolume) until
# a suitable data source is configured.

def get_options_data(_ticker, _spot):
    """Stub – returns all Nones until a supported options data source is added."""
    return None, None, None, None, None


def get_insider_data(ticker):
    """
    Fetch recent insider trades for a ticker via FMP free stable endpoint.
    Filters to open-market purchases (P) and sales (S) only - excludes gifts,
    option exercises, and automatic plan transactions.
    Returns (transactions_list, pct_held_or_None).
    """
    try:
        data = fmp_fetch("/stable/insider-trading/search", symbol=ticker, limit=20)
        if not isinstance(data, list):
            return [], None

        OPEN_MARKET = {"P", "S"}
        cutoff = datetime.date.today() - datetime.timedelta(days=180)
        txns = []
        for t in data:
            tx_type = (t.get("transactionType") or "").strip().upper()
            if tx_type not in OPEN_MARKET:
                continue
            date_str = str(t.get("transactionDate") or t.get("filingDate") or "")[:10]
            try:
                tx_date = datetime.date.fromisoformat(date_str)
                recent  = tx_date >= cutoff
            except Exception:
                recent = False
            shares = t.get("securitiesTransacted")
            price  = t.get("price") or 0
            txns.append({
                "date":   date_str,
                "type":   "buy" if tx_type == "P" else "sell",
                "name":   t.get("reportingName"),
                "role":   t.get("typeOfOwner"),
                "shares": shares,
                "value":  (shares or 0) * price,
                "recent": recent,
            })

        return txns[:15], None  # pct_held requires premium tier
    except Exception:
        return [], None


# ─────────────────────────────────────────────────────────────────────────────
#  UNIFIED API: /api/stock-data
#  Serves BOTH the Options Wheel Checker and the Comprehensive Buy Analyzer.
#  Maximizes the free FMP tier by pulling data once and running all logic.
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/stock-data")
def stock_data():
    ticker = request.args.get("ticker", "").strip().upper()
    if not ticker:
        return jsonify({"error": "ticker is required"}), 400

    try:
        info = build_fmp_info(ticker)
        # Fetch 2 years (730 days) of history to satisfy the MA200 and HVR calculations
        hist = get_fmp_history(ticker, days=730)

        if not info or hist.empty:
            raise ValueError("FMP returned no data or empty history.")
            
    except Exception as e:
        err_str = str(e).lower()
        if any(x in err_str for x in ["timeout", "403", "404", "rate limit", "429", "too many requests"]):
            resp = jsonify({
                "error": "FMP rate limit hit. Please try again.",
                "retryable": True,
            })
            resp.status_code = 503
            return resp
        return jsonify({"error": f"Analysis failed: Try A Different Stock"}), 502
        #return jsonify({"error": f"Analysis failed: {e}"}), 502

    # 1. Base Pricing
    spot = (
        safe(info.get("currentPrice"))
        or safe(info.get("regularMarketPrice"))
        or safe(info.get("previousClose"))
    )
    if not spot:
        return jsonify({"error": f'No price data found for "{ticker}". Check the symbol.'}), 404

    # 2. Historical Data Series
    close  = hist["Close"].dropna()
    high   = hist["High"].dropna()
    low    = hist["Low"].dropna()
    volume = hist["Volume"].dropna()

    if len(close) < 60:
        return jsonify({"error": "Not enough price history (need at least 60 trading days)."}), 422

    # 3. Global Technical Indicators (Used by both Wheel & Analyzer)
    ma50 = float(close.iloc[-50:].mean()) if len(close) >= 50 else None
    ma200 = float(close.iloc[-200:].mean()) if len(close) >= 200 else None
    
    # RSI (14) via Pandas EWM (Cleaner and more accurate)
    rsi = None
    if len(close) >= 16:
        delta = close.diff()
        avg_g = delta.clip(lower=0).ewm(com=13, adjust=False).mean()
        avg_l = (-delta).clip(lower=0).ewm(com=13, adjust=False).mean()
        rsi_s = 100 - 100 / (1 + avg_g / avg_l)
        rsi = float(rsi_s.iloc[-1])

    # HVR - Historical Volatility Rank (21-day rolling HV, 1-year window)
    hvr = None
    if len(close) >= 252: # Need about a year of data for true rank
        log_rets = np.log(close / close.shift(1)).dropna()
        # 21-day rolling historical volatility (annualized)
        rolling_hv = log_rets.rolling(21).std() * math.sqrt(252) * 100
        rolling_hv = rolling_hv.dropna()
        if len(rolling_hv) > 0:
            current_hv = float(rolling_hv.iloc[-1])
            min_hv = float(rolling_hv.min())
            max_hv = float(rolling_hv.max())
            hvr = round((current_hv - min_hv) / (max_hv - min_hv) * 100, 1) if max_hv > min_hv else None

    # ATR% (14-day)
    atr_pct = None
    if len(close) >= 15:
        prev_c = close.shift(1)
        tr = pd.concat([high - low, (high - prev_c).abs(), (low - prev_c).abs()], axis=1).max(axis=1)
        atr14 = float(tr.rolling(14).mean().iloc[-1])
        atr_pct = round(atr14 / spot * 100, 2)

    # 4. Dates & Proximities
    _ed = get_earnings_days(ticker)
    earn_days = _ed["days"] if isinstance(_ed, dict) else _ed
    earn_estimated = _ed["estimated"] if isinstance(_ed, dict) else False

    ex_div_days = None
    try:
        div_data = fmp_fetch(f"/stable/historical-price-full/stock_dividend", symbol=ticker)
        historical_divs = div_data.get("historical", []) if isinstance(div_data, dict) else []
        if historical_divs:
            now_utc = datetime.datetime.now(datetime.timezone.utc)
            for entry in sorted(historical_divs, key=lambda x: x.get("date", ""), reverse=True):
                ex_date_str = entry.get("date")
                if not ex_date_str: continue
                try:
                    ex_dt = datetime.datetime.strptime(str(ex_date_str)[:10], "%Y-%m-%d").replace(tzinfo=datetime.timezone.utc)
                    delta = (ex_dt - now_utc).days
                    if delta >= 0:
                        ex_div_days = delta
                        break
                except Exception:
                    continue
    except Exception:
        pass

    iv, spread_dollar, opt_expiry, atm_oi, atm_volume = get_options_data(ticker, spot)
    insider_transactions, insider_pct_held = get_insider_data(ticker)

    # =========================================================================
    # BUY ANALYZER LOGIC
    # =========================================================================
    signals = []
    bull_w = 0.0
    total_w = 0.0

    def add(category, name, value_str, interpretation, signal, weight=1):
        nonlocal bull_w, total_w
        total_w += weight
        if signal == "bullish": bull_w += weight
        elif signal == "neutral": bull_w += weight * 0.5
        signals.append({
            "category": category, "name": name, "value": value_str,
            "interpretation": interpretation, "signal": signal, "weight": weight,
        })

    is_etf = (info.get("quoteType", "") == "ETF")
    if is_etf:
        add("Asset Profile", "Exchange Traded Fund (ETF)", "ETF Detected",
            "ETFs lack standard corporate fundamentals. Score is driven entirely by price action and momentum.",
            "neutral", weight=0)

    # Trend
    if ma50:
        d = (spot - ma50) / ma50 * 100
        add("Trend", "Price vs MA50", f"${spot:.2f} vs MA50 ${ma50:.2f} ({d:+.1f}%)",
            "Above 50-day moving average - short-term uptrend." if spot > ma50 else "Below 50-day moving average - short-term downtrend.",
            "bullish" if spot > ma50 else "bearish", weight=2)
    if ma200:
        d = (spot - ma200) / ma200 * 100
        add("Trend", "Price vs MA200", f"${spot:.2f} vs MA200 ${ma200:.2f} ({d:+.1f}%)",
            "Above 200-day moving average - long-term uptrend." if spot > ma200 else "Below 200-day moving average - long-term downtrend.",
            "bullish" if spot > ma200 else "bearish", weight=3)

    if ma50 and ma200:
        if ma50 > ma200:
            add("Trend", "Golden/Death Cross", f"MA50 ${ma50:.2f} > MA200 ${ma200:.2f}", "Golden Cross active - long-term bullish signal.", "bullish", weight=2)
        else:
            add("Trend", "Golden/Death Cross", f"MA50 ${ma50:.2f} < MA200 ${ma200:.2f}", "Death Cross active - long-term bearish signal.", "bearish", weight=2)

    # Momentum
    if rsi is not None:
        dir_ = "rising" if rsi > float(rsi_s.iloc[-2]) else "falling"
        if   rsi > 70: sig, interp = "bearish", f"RSI {rsi:.1f} ({dir_}) - overbought. Pullback risk elevated."
        elif rsi > 60: sig, interp = "bullish", f"RSI {rsi:.1f} ({dir_}) - bullish momentum, approaching overbought."
        elif rsi >= 40:sig, interp = "bullish", f"RSI {rsi:.1f} ({dir_}) - healthy range, not stretched."
        elif rsi >= 30:sig, interp = "neutral", f"RSI {rsi:.1f} ({dir_}) - weak momentum, approaching oversold."
        else:          sig, interp = "bearish", f"RSI {rsi:.1f} ({dir_}) - oversold, strong selling pressure."
        add("Momentum", "RSI (14-day)", f"{rsi:.1f}", interp, sig, weight=2)

    # 20-day momentum
    if len(close) >= 21:
        ret20 = (float(close.iloc[-1]) - float(close.iloc[-21])) / float(close.iloc[-21]) * 100
        add("Trend", "20-Day Price Momentum", f"{ret20:+.1f}% over last 20 days",
            f"{'Strong positive' if ret20 > 5 else 'Mild positive' if ret20 > 0 else 'Negative'} momentum over the last month.",
            "bullish" if ret20 > 0 else "bearish", weight=1)

    # Free FMP Fundamentals (Annual Statements)
    pe = safe(info.get("trailingPE"))
    if pe is not None:
        if   pe <= 0:   sig = "bearish"; interp = f"P/E {pe:.1f} - negative, company is unprofitable."
        elif pe <= 15:  sig = "bullish"; interp = f"P/E {pe:.1f} - potentially undervalued."
        elif pe <= 25:  sig = "bullish"; interp = f"P/E {pe:.1f} - fair valuation."
        elif pe <= 40:  sig = "neutral"; interp = f"P/E {pe:.1f} - elevated, priced for strong growth."
        else:           sig = "bearish"; interp = f"P/E {pe:.1f} - very high, little margin for error."
        add("Fundamentals", "Trailing P/E Ratio", f"{pe:.1f}", interp, sig, weight=2)

    fcf = safe(info.get("freeCashflow"))
    if fcf is not None:
        fcf_b = fcf / 1e9
        add("Fundamentals", "Free Cash Flow", f"${fcf_b:.2f}B annually",
            f"Positive FCF ${fcf_b:.2f}B - company generates real cash." if fcf > 0 else f"Negative FCF ${fcf_b:.2f}B - company is burning cash.",
            "bullish" if fcf > 0 else "bearish", weight=3)

    ocf = safe(info.get("operatingCashflow"))
    ni  = safe(info.get("netIncomeToCommon"))
    if ocf is not None and ni is not None:
        if ni <= 0 and ocf > 0:
            sig = "bullish"; interp = f"OCF ${ocf/1e9:.2f}B despite net loss - cash generation is real."
        elif ni > 0 and ocf > ni:
            sig = "bullish"; interp = f"OCF exceeds net income ({ocf/ni:.1f}x) - high-quality earnings backed by real cash."
        elif ni > 0 and ocf > 0:
            sig = "neutral"; interp = "OCF positive but below net income - earnings partially accrual-based."
        else:
            sig = "bearish"; interp = "OCF negative - company is consuming cash regardless of reported earnings."
        add("Fundamentals", "Earnings Quality (OCF vs Net Income)", f"OCF ${ocf/1e9:.2f}B / Net ${ni/1e9:.2f}B" if ni else f"OCF ${ocf/1e9:.2f}B", interp, sig, weight=2)

    rg = safe(info.get("revenueGrowth"))
    if rg is not None:
        rg_pct = rg * 100
        if   rg_pct >= 15: sig = "bullish"; interp = f"Revenue growing {rg_pct:.1f}% YoY - rapid expansion."
        elif rg_pct >= 5:  sig = "bullish"; interp = f"Revenue growing {rg_pct:.1f}% YoY - healthy growth."
        elif rg_pct >= 0:  sig = "neutral"; interp = f"Revenue growth {rg_pct:.1f}% - flat, growth has stalled."
        else:              sig = "bearish"; interp = f"Revenue declining {rg_pct:.1f}% YoY - business contracting."
        add("Fundamentals", "Revenue Growth (YoY)", f"{rg_pct:+.1f}%", interp, sig, weight=2)

    td = safe(info.get("totalDebt"))
    tc = safe(info.get("totalCash"))
    if td is not None and tc is not None and tc > 0:
        dcr = td / tc
        add("Fundamentals", "Debt vs Cash", f"Debt ${td/1e9:.1f}B / Cash ${tc/1e9:.1f}B ({dcr:.1f}x)",
            "More cash than debt - strong balance sheet." if dcr < 1 else f"Debt is {dcr:.1f}x cash - manageable." if dcr <= 3 else f"Debt is {dcr:.1f}x cash - high leverage.",
            "bullish" if dcr < 1 else "neutral" if dcr <= 3 else "bearish", weight=2)

    # Piotroski F-Score
    ps = safe(info.get("piotroskiScore"))
    if ps is not None and not is_etf:
        psi = int(ps)
        if   psi >= 7: sig, interp = "bullish", f"Piotroski Score {psi}/9 - strong profitability, leverage, and efficiency signals."
        elif psi >= 5: sig, interp = "neutral",  f"Piotroski Score {psi}/9 - average financial health."
        else:          sig, interp = "bearish",  f"Piotroski Score {psi}/9 - multiple weak financial health signals."
        add("Fundamentals", "Piotroski F-Score", f"{psi}/9", interp, sig, weight=2)

    # Altman Z-Score
    az = safe(info.get("altmanZScore"))
    if az is not None and not is_etf:
        if   az > 2.99: sig, interp = "bullish", f"Altman Z-Score {az:.2f} - safe zone, low bankruptcy risk."
        elif az > 1.81: sig, interp = "neutral",  f"Altman Z-Score {az:.2f} - grey zone, monitor financial health."
        else:           sig, interp = "bearish",  f"Altman Z-Score {az:.2f} - distress zone, elevated financial risk."
        add("Fundamentals", "Altman Z-Score", f"{az:.2f}", interp, sig, weight=2)

    # DCF intrinsic value
    dcf_val = safe(info.get("dcfValue"))
    if dcf_val is not None and spot and dcf_val > 0:
        margin = (dcf_val - spot) / dcf_val * 100
        if   margin >= 30: sig, interp = "bullish", f"Trading {margin:.0f}% below DCF value ${dcf_val:.2f} - significant margin of safety."
        elif margin >= 10: sig, interp = "bullish", f"Trading {margin:.0f}% below DCF value ${dcf_val:.2f} - modest discount to intrinsic value."
        elif margin >= -10:sig, interp = "neutral",  f"Trading near DCF intrinsic value of ${dcf_val:.2f}."
        else:              sig, interp = "bearish",  f"Trading {abs(margin):.0f}% above DCF value ${dcf_val:.2f} - priced above model intrinsic value."
        add("Valuation", "DCF Intrinsic Value", f"DCF ${dcf_val:.2f} vs Price ${spot:.2f}", interp, sig, weight=2)

    # Analyst consensus (grades)
    rec = info.get("recommendationKey")
    analyst_total = safe(info.get("analystTotal"))
    if rec and analyst_total and analyst_total >= 3:
        buy_c  = info.get("analystBuyCount",  0)
        hold_c = info.get("analystHoldCount", 0)
        sell_c = info.get("analystSellCount", 0)
        label_map = {
            "strong_buy":  "Strong Buy",
            "buy":         "Buy",
            "hold":        "Hold",
            "underperform":"Underperform",
            "sell":        "Sell",
        }
        label   = label_map.get(rec, rec.replace("_", " ").title())
        val_str = f"{label} - {buy_c} buy / {hold_c} hold / {sell_c} sell"
        if rec in ("strong_buy", "buy"):
            sig, interp = "bullish", f"Analyst consensus is {label} across {int(analyst_total)} ratings."
        elif rec == "hold":
            sig, interp = "neutral",  f"Analysts are mixed with a Hold consensus from {int(analyst_total)} ratings."
        else:
            sig, interp = "bearish",  f"Analyst consensus is {label} across {int(analyst_total)} ratings."
        add("Analyst", "Analyst Consensus", val_str, interp, sig, weight=2)

    # Multi-period price performance (from /stable/stock-price-change)
    ret3m = safe(info.get("ret3M"))
    if ret3m is not None:
        if   ret3m >= 15:  sig, interp = "bullish", f"Up {ret3m:.1f}% over 3 months - strong near-term momentum."
        elif ret3m >= 5:   sig, interp = "bullish", f"Up {ret3m:.1f}% over 3 months - positive trend."
        elif ret3m >= -5:  sig, interp = "neutral",  f"{ret3m:+.1f}% over 3 months - essentially flat."
        else:              sig, interp = "bearish",  f"Down {abs(ret3m):.1f}% over 3 months - weak near-term trend."
        add("Trend", "3-Month Price Performance", f"{ret3m:+.1f}%", interp, sig, weight=1)

    ret1y = safe(info.get("ret1Y"))
    if ret1y is not None:
        if   ret1y >= 25:  sig, interp = "bullish", f"Up {ret1y:.1f}% over 1 year - strong annual performance."
        elif ret1y >= 5:   sig, interp = "bullish", f"Up {ret1y:.1f}% over 1 year - positive annual return."
        elif ret1y >= -10: sig, interp = "neutral",  f"{ret1y:+.1f}% over 1 year - modest annual performance."
        else:              sig, interp = "bearish",  f"Down {abs(ret1y):.1f}% over 1 year - underperforming."
        add("Trend", "1-Year Price Performance", f"{ret1y:+.1f}%", interp, sig, weight=1)

    # Insider net buying signal (from get_insider_data)
    if insider_transactions:
        recent_buys  = sum(1 for t in insider_transactions if t["type"] == "buy"  and t.get("recent"))
        recent_sells = sum(1 for t in insider_transactions if t["type"] == "sell" and t.get("recent"))
        if recent_buys + recent_sells > 0:
            if   recent_buys > recent_sells * 2:
                sig, interp = "bullish", f"{recent_buys} insider purchase(s) vs {recent_sells} sale(s) in the last 6 months - insiders are net buyers."
            elif recent_sells > recent_buys * 2:
                sig, interp = "bearish",  f"{recent_sells} insider sale(s) vs {recent_buys} purchase(s) in the last 6 months - insiders are net sellers."
            else:
                sig, interp = "neutral",  f"{recent_buys} insider purchase(s) and {recent_sells} sale(s) in the last 6 months - mixed insider activity."
            add("Insider Activity", "Insider Transactions (6 months)",
                f"{recent_buys} buys / {recent_sells} sells", interp, sig, weight=1)

    # Score & verdict Math
    score = round(bull_w / total_w * 100, 1) if total_w > 0 else 50.0

    for s in signals:
        s["max_contribution"]    = round((s["weight"] / total_w) * 100, 2)
        multiplier               = 1.0 if s["signal"] == "bullish" else (0.5 if s["signal"] == "neutral" else 0.0)
        s["actual_contribution"] = round(s["max_contribution"] * multiplier, 2)

    if score >= 85:   verdict, vsub = "STRONG BUY", "Exceptional alignment across technicals and value. High conviction."
    elif score >= 70: verdict, vsub = "BUY", "Solid bullish structure. Most indicators suggest a favorable entry point."
    elif score >= 50: verdict, vsub = "NEUTRAL / HOLD", "Mixed signals. The stock may be fairly valued or in a consolidation phase."
    elif score >= 35: verdict, vsub = "CAUTION", "Weakening technicals or high valuation risk. Exercise significant patience."
    else:             verdict, vsub = "AVOID / SELL", "High-risk profile. Majority of indicators are currently bearish."

    # Return the Massive Unified Dictionary
    return jsonify({
        # ── Global Info ──
        "ticker":        ticker,
        "name":          info.get("shortName") or info.get("longName") or ticker,
        "sector":        info.get("sector"),
        "industry":      info.get("industry"),
        "spot":          spot,
        "marketCap":     safe(info.get("marketCap")),
        "beta":          safe(info.get("beta")),
        
        # ── Fundamentals (Wheel Flat variables) ──
        "peRatio":       pe,
        "pbRatio":       safe(info.get("priceToBook")),
        "divYield":      safe(info.get("dividendYield")),
        "fcf":           fcf,
        "revGrowth":     rg,
        "totalCash":     tc,
        "totalDebt":     td,
        "avgVolume":     safe(info.get("averageVolume")),
        
        # ── Proximities ──
        "earnDays":          earn_days,
        "earnDaysEstimated": earn_estimated,
        "exDivDays":         ex_div_days,
        
        # ── Technicals ──
        "ma50":          ma50,
        "ma200":         ma200,
        "rsi":           rsi,
        "hvr":           hvr,
        "atrPct":        atr_pct,
        
        # ── Options (Currently Stubbed) ──
        "iv":            iv,
        "spreadDollar":  spread_dollar,
        "optExpiry":     opt_expiry,
        "atmOI":         atm_oi,
        "atmVolume":     atm_volume,

        # ── Buy Analyzer Specifics ──
        "score":         score,
        "verdict":       verdict,
        "verdict_sub":   vsub,
        "signal_counts": {
            "bullish": len([s for s in signals if s["signal"] == "bullish"]),
            "neutral": len([s for s in signals if s["signal"] == "neutral"]),
            "bearish": len([s for s in signals if s["signal"] == "bearish"]),
            "total":   len(signals),
        },
        "signals":              signals,
        "insider_transactions": insider_transactions,
        "insider_pct_held":     insider_pct_held
    })

# ─────────────────────────────────────────────────────────────────────────────
#  Mortgage Rate Getter
# ─────────────────────────────────────────────────────────────────────────────

FRED_API_KEY = os.getenv("FRED_API_KEY")

_cached_rate = None
_cached_time = None

def get_latest_mortgage_rate():
    global _cached_rate, _cached_time

    if _cached_rate is not None and _cached_time is not None:
        elapsed = (datetime.datetime.now() - _cached_time).total_seconds()
        if elapsed < 86400:
            return _cached_rate

    try:
        url = f"https://api.stlouisfed.org/fred/series/observations?series_id=MORTGAGE30US&api_key={FRED_API_KEY}&file_type=json&sort_order=desc&limit=5"
        
        res = requests.get(url, timeout=5)
        res.raise_for_status()
        data = res.json()

        observations = data.get("observations", [])

        # Find first valid numeric value
        rate = None
        for obs in observations:
            val = obs.get("value", "")
            try:
                rate = float(val)
                break
            except:
                continue

        if rate is None:
            return _cached_rate

        _cached_rate = rate
        _cached_time = datetime.datetime.now()

        return rate

    except Exception as e:
        #print("Mortgage rate fetch error:", e)
        return _cached_rate

@app.route("/api/mortgage-rate")
def mortgage_rate():
    rate = get_latest_mortgage_rate()

    if rate is None:
        return jsonify({
            "rate": 6.5,   # fallback
            "fallback": True
        })

    return jsonify({
        "rate": round(rate, 2),
        "fallback": False
    })

# ─────────────────────────────────────────────────────────────────────────────
#  Health check
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/health")
def health():
    return jsonify({"status": "ok"})

# ─────────────────────────────────────────────────────────────────────────────
#  Privacy Policy Page
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/privacy")
def privacy():
    return render_template("privacy.html")

# ─────────────────────────────────────────────────────────────────────────────
#  IS_PROD
# ─────────────────────────────────────────────────────────────────────────────

#@app.context_processor
#def inject_is_prod():
#    # This will be True if the variable exists at all in Render's "Environment" tab
#    is_prod = os.environ.get("SHOW_ADS", "false").lower() == "true"
#    return dict(IS_PROD=is_prod)

# ─────────────────────────────────────────────────────────────────────────────
#  MAIN FUNCITON
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)