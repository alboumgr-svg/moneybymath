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
    Uses FMP stable /stable/historical-price-eod/full endpoint.
    """
    from_date = (datetime.date.today() - datetime.timedelta(days=days)).isoformat()
    data = fmp_fetch(
        f"/stable/historical-price-eod/full",
        symbol=ticker,
        **{"from": from_date}
    )
    historical = data.get("historical", []) if isinstance(data, dict) else []
    if not historical:
        return pd.DataFrame()
    df = pd.DataFrame(historical)
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
    Fetch several FMP stable/v3/v4 endpoints and return a dict with
    yfinance-compatible key names so the signal code below needs no changes.

    Endpoint reference (FMP stable API docs):
      /stable/profile                       – company overview, beta, mktCap
      /stable/quote                         – real-time price, pe, avgVolume
      /stable/key-metrics-ttm               – P/B, P/S, EV/EBITDA, PEG, divYield
      /stable/ratios-ttm                    – margins, ROE, currentRatio, D/E, payout
      /stable/cash-flow-statement           – freeCashFlow, operatingCashFlow
      /stable/balance-sheet-statement       – totalDebt, cash
      /stable/income-statement              – netIncome, revenue, eps  (YoY growth)
      /stable/analyst-stock-recommendations – analyst consensus counts
      /stable/price-target-consensus        – mean analyst price target
      /api/v4/short-of-float-change         – short % of float  (legacy v4, graceful)
      /api/v3/institutional-holder/{ticker} – institutional holders list (legacy v3)
      /stable/shares-float                  – float / outstanding shares
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
            # isEtf is a boolean in the stable profile response
            info["quoteType"]     = "ETF" if p.get("isEtf") else "EQUITY"
    except Exception:
        pass

    # ── 2. Real-time quote ────────────────────────────────────────────────────
    try:
        data = fmp_fetch("/stable/quote", symbol=ticker)
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
    except Exception:
        pass

    # ── 3. Key metrics TTM ────────────────────────────────────────────────────
    # Stable endpoint: /stable/key-metrics-ttm?symbol=TICKER
    # Field names confirmed in FMP stable docs (camelCase, no "TTM" suffix on most).
    try:
        data = fmp_fetch("/stable/key-metrics-ttm", symbol=ticker)
        m = _one(data)
        if m:
            if not info.get("trailingPE"):
                info["trailingPE"] = m.get("peRatio")
            info["priceToBook"]                 = m.get("pbRatio")
            info["priceToSalesTrailing12Months"] = m.get("priceToSalesRatio")
            info["enterpriseToEbitda"]           = m.get("enterpriseValueOverEBITDA")
            info["pegRatio"]                     = m.get("pegRatio")
            # dividendYield in key-metrics is already a decimal fraction (0.005 = 0.5%)
            dy = m.get("dividendYield")
            if dy is not None:
                info["dividendYield"] = dy
    except Exception:
        pass

    # ── 4. Financial ratios TTM ───────────────────────────────────────────────
    # Stable endpoint: /stable/ratios-ttm?symbol=TICKER
    try:
        data = fmp_fetch("/stable/ratios-ttm", symbol=ticker)
        r = _one(data)
        if r:
            info["grossMargins"]   = r.get("grossProfitMargin")
            info["profitMargins"]  = r.get("netProfitMargin")
            info["returnOnEquity"] = r.get("returnOnEquity")
            info["currentRatio"]   = r.get("currentRatio")
            info["payoutRatio"]    = r.get("payoutRatio")
            # D/E in FMP ratios-ttm is already a ratio (e.g. 1.5).
            # The downstream signal code divides by 100 (yfinance returned %).
            # So multiply by 100 here to normalise.
            dte = r.get("debtToEquityRatio")
            if dte is None:
                dte = r.get("debtEquityRatio")
            info["debtToEquity"] = dte * 100 if dte is not None else None
            # Forward P/E lives in ratios-ttm as priceEarningsRatio
            fpe = r.get("priceEarningsRatio")
            if fpe is not None and not info.get("forwardPE"):
                info["forwardPE"] = fpe
            # Secondary dividend yield source
            if not info.get("dividendYield"):
                info["dividendYield"] = r.get("dividendYield")
    except Exception:
        pass

    # ── 5. Cash-flow statement (most recent annual) ───────────────────────────
    # Stable endpoint: /stable/cash-flow-statement?symbol=TICKER&limit=1
    try:
        data = fmp_fetch("/stable/cash-flow-statement", symbol=ticker, limit=1)
        cf = _one(data)
        if cf:
            info["freeCashflow"]      = cf.get("freeCashFlow")
            info["operatingCashflow"] = cf.get("operatingCashFlow")
    except Exception:
        pass

    # ── 6. Balance sheet (most recent annual) ─────────────────────────────────
    # Stable endpoint: /stable/balance-sheet-statement?symbol=TICKER&limit=1
    try:
        data = fmp_fetch("/stable/balance-sheet-statement", symbol=ticker, limit=1)
        bs = _one(data)
        if bs:
            info["totalDebt"] = bs.get("totalDebt")
            cash = bs.get("cashAndCashEquivalents") or 0
            sti  = bs.get("shortTermInvestments")   or 0
            info["totalCash"] = cash + sti
    except Exception:
        pass

    # ── 7. Income statement – 2 years for YoY growth ──────────────────────────
    # Stable endpoint: /stable/income-statement?symbol=TICKER&limit=2
    try:
        data = fmp_fetch("/stable/income-statement", symbol=ticker, limit=2)
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
    except Exception:
        pass

    # ── 8. Analyst recommendations → map to recommendationKey ─────────────────
    # Stable endpoint: /stable/analyst-stock-recommendations?symbol=TICKER
    try:
        data = fmp_fetch("/stable/analyst-stock-recommendations", symbol=ticker)
        r = _one(data)
        if r:
            buy  = (r.get("analystRatingsBuy")       or 0) + (r.get("analystRatingsStrongBuy")  or 0)
            hold = (r.get("analystRatingsHold")       or 0)
            sell = (r.get("analystRatingsSell")       or 0) + (r.get("analystRatingsStrongSell") or 0)
            total = buy + hold + sell
            if total > 0:
                bp = buy  / total
                sp = sell / total
                if bp >= 0.8:
                    info["recommendationKey"] = "strong_buy"
                elif bp >= 0.6:
                    info["recommendationKey"] = "buy"
                elif sp >= 0.5:
                    info["recommendationKey"] = "sell"
                elif sp >= 0.3:
                    info["recommendationKey"] = "underperform"
                else:
                    info["recommendationKey"] = "hold"
    except Exception:
        pass

    # ── 9. Price-target consensus ─────────────────────────────────────────────
    # Stable endpoint: /stable/price-target-consensus?symbol=TICKER
    try:
        data = fmp_fetch("/stable/price-target-consensus", symbol=ticker)
        pt = _one(data)
        if pt:
            info["targetMeanPrice"] = pt.get("targetConsensus")
    except Exception:
        pass

    # ── 10. Short interest (v4 legacy – graceful if unavailable) ──────────────
    # /api/v4/short-of-float-change?symbol=TICKER
    try:
        si_data = fmp_fetch("/api/v4/short-of-float-change", symbol=ticker)
        si = _one(si_data)
        if si:
            sif = si.get("shortPercentOfFloat")
            if sif is not None:
                # FMP returns percent (e.g. 5.2); downstream expects decimal (0.052)
                info["shortPercentOfFloat"] = sif / 100
    except Exception:
        pass

    # ── 11. Institutional ownership % ────────────────────────────────────────
    # Legacy v3 list endpoint + stable shares-float for denominator
    try:
        inst_data = fmp_fetch(f"/api/v3/institutional-holder/{ticker}")
        if inst_data:
            sf_data = fmp_fetch("/stable/shares-float", symbol=ticker)
            sf = _one(sf_data)
            float_shares = None
            if sf:
                float_shares = sf.get("outstandingShares") or sf.get("floatShares")
            if float_shares:
                total_inst = sum((h.get("shares") or 0) for h in inst_data)
                info["institutionsPercentHeld"] = total_inst / float_shares
    except Exception:
        pass

    return info

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
#
# def get_options_data(t, spot):
#     ...

def get_options_data(_ticker, _spot):
    """Stub – returns all Nones until a supported options data source is added."""
    return None, None, None, None, None


# ─────────────────────────────────────────────────────────────────────────────
#  /api/stock  -  Options Wheel candidate checker
#
#  NOTE: The field previously named "ivr" has been renamed "hvr" (Historical
#  Volatility Rank). It is computed from a 52-week rolling window of 21-day
#  realised (historical) volatility, NOT from a history of implied volatility.
#  True IV Rank requires a 52-week IV history which Yahoo Finance does not
#  expose. HVR is a reasonable proxy but users should be aware of this
#  distinction. If your frontend JS references `data.ivr`, update it to
#  `data.hvr`.
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/stock")
def stock():
    ticker = request.args.get("ticker", "").strip().upper()
    if not ticker:
        return jsonify({"error": "ticker is required"}), 400

    try:
        info = build_fmp_info(ticker)
        if not info:
            raise ValueError("FMP returned no data.")
    except Exception as e:
        err_str = str(e).lower()
        if any(x in err_str for x in ["timeout", "connection", "403", "404"]):
            resp = jsonify({
                "error": "FMP is limiting requests. Please try again in 10-15 seconds.",
                "retryable": True,
            })
            resp.status_code = 503
            return resp
        return jsonify({"error": f"Could not fetch data: {e}"}), 502

    spot = (
        safe(info.get("currentPrice"))
        or safe(info.get("regularMarketPrice"))
        or safe(info.get("previousClose"))
    )
    if not spot:
        return jsonify({"error": f'No price data found for "{ticker}". Symbol may be delisted or invalid.'}), 404

    _ed            = get_earnings_days(ticker)
    earn_days      = _ed["days"]      if isinstance(_ed, dict) else _ed
    earn_estimated = _ed["estimated"] if isinstance(_ed, dict) else False

    rsi  = None
    hvr  = None   # Historical Volatility Rank (was previously labelled ivr)
    atr_pct = None

    try:
        hist   = get_fmp_history(ticker, days=365)
        closes = hist["Close"].dropna().tolist()
        highs  = hist["High"].dropna().tolist()
        lows   = hist["Low"].dropna().tolist()

        # ── RSI (14) ──────────────────────────────────────────────────────
        if len(closes) >= 16:
            period = 14
            gains, losses = [], []
            for i in range(1, period + 1):
                d = closes[i] - closes[i - 1]
                (gains if d > 0 else losses).append(abs(d))
            avg_g = sum(gains)  / period
            avg_l = sum(losses) / period
            for i in range(period + 1, len(closes)):
                d = closes[i] - closes[i - 1]
                avg_g = (avg_g * (period - 1) + max(d, 0))  / period
                avg_l = (avg_l * (period - 1) + max(-d, 0)) / period
            rsi = round(100 - 100 / (1 + avg_g / avg_l), 1) if avg_l else 100.0

        # ── HVR - Historical Volatility Rank (21-day rolling HV, 1-year) ──
        if len(closes) >= 30:
            log_rets = [math.log(closes[i] / closes[i-1])
                        for i in range(1, len(closes)) if closes[i-1] > 0]
            W, series = 21, []
            for i in range(W, len(log_rets) + 1):
                sl   = log_rets[i - W:i]
                mean = sum(sl) / W
                var  = sum((x - mean) ** 2 for x in sl) / W
                series.append(math.sqrt(var * 252) * 100)
            if series:
                hv = series[-1]
                lo, hi = min(series), max(series)
                hvr = round((hv - lo) / (hi - lo) * 100, 1) if hi > lo else None

        # ── ATR% (14-day) ─────────────────────────────────────────────────
        if len(closes) >= 15 and len(highs) >= 15 and len(lows) >= 15:
            trs = []
            for i in range(1, 15):
                h, l, pc = highs[-i], lows[-i], closes[-(i+1)]
                trs.append(max(h - l, abs(h - pc), abs(l - pc)))
            atr14   = sum(trs) / len(trs)
            atr_pct = round(atr14 / spot * 100, 2)

    except Exception:
        pass

    iv, spread_dollar, opt_expiry, atm_oi, atm_volume = get_options_data(ticker, spot)

    # ── Dividend ex-date proximity ──────────────────────────────────────────
    ex_div_days = None
    try:
        # Stable endpoint: /stable/dividends?symbol=TICKER
        # Returns list sorted newest first; each entry has "date" = ex-dividend date.
        div_data = fmp_fetch("/stable/dividends", symbol=ticker)
        if isinstance(div_data, list):
            now_utc = datetime.datetime.now(datetime.timezone.utc)
            # Find the next upcoming ex-date (date >= today)
            for entry in sorted(div_data, key=lambda x: x.get("date", ""), reverse=True):
                ex_date_str = entry.get("date")
                if not ex_date_str:
                    continue
                try:
                    ex_dt = datetime.datetime.strptime(str(ex_date_str)[:10], "%Y-%m-%d").replace(
                        tzinfo=datetime.timezone.utc
                    )
                    delta = (ex_dt - now_utc).days
                    if delta >= 0:
                        ex_div_days = delta
                        break
                except Exception:
                    continue
    except Exception:
        pass

    return jsonify({
        "ticker":       ticker,
        "name":         info.get("shortName") or info.get("longName") or ticker,
        "sector":       info.get("sector"),
        "industry":     info.get("industry"),
        "spot":         spot,
        "marketCap":    safe(info.get("marketCap")),
        "peRatio":      safe(info.get("trailingPE")),
        "pbRatio":      safe(info.get("priceToBook")),
        "divYield":     safe(info.get("dividendYield")),
        "beta":         safe(info.get("beta")),
        "ma50":         safe(info.get("fiftyDayAverage")),
        "ma200":        safe(info.get("twoHundredDayAverage")),
        "fcf":          safe(info.get("freeCashflow")),
        "revGrowth":    safe(info.get("revenueGrowth")),
        "totalCash":    safe(info.get("totalCash")),
        "totalDebt":    safe(info.get("totalDebt")),
        "avgVolume":    safe(info.get("averageVolume")),
        "earnDays":          earn_days,
        "earnDaysEstimated": earn_estimated,
        "exDivDays":    ex_div_days,
        "rsi":          rsi,
        "hvr":          hvr,         # renamed from ivr - see note above
        "atrPct":       atr_pct,
        "iv":           iv,
        "spreadDollar": spread_dollar,
        "optExpiry":    opt_expiry,
        "atmOI":        atm_oi,
        "atmVolume":    atm_volume,
    })


# ─────────────────────────────────────────────────────────────────────────────
#  /api/buy-analysis  -  comprehensive buy signal checker
#
#  Every signal has: category, name, value, interpretation, signal
#  (bullish/neutral/bearish), and weight.
#
#  Score = bullish_weight / total_weight * 100  (neutral counts as 0.5)
#  85+  → STRONG BUY
#  70+  → BUY
#  50+  → NEUTRAL / HOLD
#  35+  → CAUTION
#  <35  → AVOID / SELL
#
#  Test: GET /api/buy-analysis?ticker=AAPL
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/buy-analysis")
def buy_analysis():
    ticker = request.args.get("ticker", "").strip().upper()
    if not ticker:
        return jsonify({"error": "ticker is required"}), 400

    try:
        info = build_fmp_info(ticker)
        hist = get_fmp_history(ticker, days=730)   # 2 years

        if hist.empty:
            return jsonify({"error": f'No historical data for "{ticker}".'}), 404

    except Exception as e:
        err_str = str(e).lower()
        if any(x in err_str for x in ["timeout", "403", "404", "rate limit"]):
            resp = jsonify({
                "error": "FMP connection error. Retrying usually helps.",
                "retryable": True,
            })
            resp.status_code = 503
            return resp
        return jsonify({"error": f"Analysis failed: {e}"}), 502

    spot = (
        safe(info.get("currentPrice"))
        or safe(info.get("regularMarketPrice"))
        or safe(info.get("previousClose"))
    )
    if not spot:
        return jsonify({"error": f'No price data found for "{ticker}". Check the symbol.'}), 404

    if len(hist) < 60:
        return jsonify({"error": "Not enough price history (need at least 60 trading days)."}), 422

    close  = hist["Close"].dropna()
    high   = hist["High"].dropna()
    low    = hist["Low"].dropna()
    volume = hist["Volume"].dropna()

    signals  = []
    bull_w   = 0.0
    total_w  = 0.0

    def add(category, name, value_str, interpretation, signal, weight=1):
        nonlocal bull_w, total_w
        total_w += weight
        if signal == "bullish":
            bull_w += weight
        elif signal == "neutral":
            bull_w += weight * 0.5
        signals.append({
            "category":       category,
            "name":           name,
            "value":          value_str,
            "interpretation": interpretation,
            "signal":         signal,
            "weight":         weight,
        })

    quote_type = info.get("quoteType", "")
    is_etf = (quote_type == "ETF")

    if is_etf:
        add("Asset Profile", "Exchange Traded Fund (ETF)", "ETF Detected",
            "ETFs lack standard corporate fundamentals (P/E, FCF). The score below is driven entirely by price action, trend, and momentum.",
            "neutral", weight=0)

    # ── 1. TREND ──────────────────────────────────────────────────────────────

    # 1a. Price vs MA50
    if len(close) >= 50:
        ma50 = float(close.iloc[-50:].mean())
        d = (spot - ma50) / ma50 * 100
        add("Trend", "Price vs MA50",
            f"${spot:.2f} vs MA50 ${ma50:.2f} ({d:+.1f}%)",
            "Above 50-day moving average - short-term uptrend." if spot > ma50
            else "Below 50-day moving average - short-term downtrend.",
            "bullish" if spot > ma50 else "bearish", weight=2)

    # 1b. Price vs MA200
    if len(close) >= 200:
        ma200 = float(close.iloc[-200:].mean())
        d = (spot - ma200) / ma200 * 100
        add("Trend", "Price vs MA200",
            f"${spot:.2f} vs MA200 ${ma200:.2f} ({d:+.1f}%)",
            "Above 200-day moving average - long-term uptrend." if spot > ma200
            else "Below 200-day moving average - long-term downtrend.",
            "bullish" if spot > ma200 else "bearish", weight=3)

    # 1c. Golden / Death Cross
    if len(close) >= 200:
        ma50_now  = float(close.iloc[-50:].mean())
        ma200_now = float(close.iloc[-200:].mean())
        if ma50_now > ma200_now:
            add("Trend", "Golden/Death Cross",
                f"MA50 ${ma50_now:.2f} > MA200 ${ma200_now:.2f}",
                "Golden Cross active - MA50 above MA200, a long-term bullish signal.",
                "bullish", weight=2)
        else:
            add("Trend", "Golden/Death Cross",
                f"MA50 ${ma50_now:.2f} < MA200 ${ma200_now:.2f}",
                "Death Cross active - MA50 below MA200, a long-term bearish signal.",
                "bearish", weight=2)

    # 1d. MACD (12/26/9)
    if len(close) >= 35:
        macd_line   = ema(close, 12) - ema(close, 26)
        signal_line = ema(macd_line, 9)
        histogram   = macd_line - signal_line
        mv = float(macd_line.iloc[-1])
        sv = float(signal_line.iloc[-1])
        hv = float(histogram.iloc[-1])
        hp = float(histogram.iloc[-2])

        if mv > 0 and mv > sv and hv > hp:
            sig = "bullish"; interp = f"MACD {mv:.3f} above zero and signal, histogram expanding - strong momentum."
        elif mv > 0 and mv > sv:
            sig = "bullish"; interp = f"MACD {mv:.3f} above zero and signal line - positive momentum."
        elif mv < 0 and mv < sv:
            sig = "bearish"; interp = f"MACD {mv:.3f} below zero and signal line - negative momentum."
        else:
            sig = "neutral"; interp = f"MACD {mv:.3f} showing mixed signals - momentum is transitioning."

        add("Trend", "MACD (12/26/9)",
            f"MACD {mv:.3f} / Signal {sv:.3f} / Hist {hv:.3f}", interp, sig, weight=2)

    # 1e. 52-week price position
    # Fix: 80-100% of range is bullish (strong momentum), not neutral
    if len(close) >= 50:
        h52 = float(high.iloc[-252:].max()) if len(high) >= 252 else float(high.max())
        l52 = float(low.iloc[-252:].min())  if len(low)  >= 252 else float(low.min())
        rng = h52 - l52
        pos = (spot - l52) / rng * 100 if rng > 0 else 50
        add("Trend", "52-Week Price Position",
            f"${spot:.2f}  (Low ${l52:.2f} - High ${h52:.2f},  {pos:.0f}% of range)",
            "Near 52-week highs - strong momentum." if pos >= 70
            else "Mid-range - neutral territory." if pos >= 20
            else "Near 52-week lows - potential bargain or continued decline.",
            "bullish" if pos >= 50 else "neutral" if pos >= 20 else "bearish",
            weight=1)

    # 1f. 20-day momentum
    if len(close) >= 21:
        ret20 = (float(close.iloc[-1]) - float(close.iloc[-21])) / float(close.iloc[-21]) * 100
        add("Trend", "20-Day Price Momentum",
            f"{ret20:+.1f}% over last 20 trading days",
            f"{'Strong positive' if ret20 > 5 else 'Mild positive' if ret20 > 0 else 'Negative'} momentum over the last month.",
            "bullish" if ret20 > 0 else "bearish", weight=1)

    # 1g. Relative Strength vs SPY (3-month)
    # Compares the stock's 63-day return against the S&P 500 ETF.
    # Outperforming the market is a meaningful independent bullish signal.
    try:
        spy_hist = get_fmp_history("SPY", days=130)["Close"].dropna()
        if len(spy_hist) >= 63 and len(close) >= 63:
            stock_ret = (float(close.iloc[-1]) - float(close.iloc[-63])) / float(close.iloc[-63]) * 100
            spy_ret   = (float(spy_hist.iloc[-1]) - float(spy_hist.iloc[-63])) / float(spy_hist.iloc[-63]) * 100
            rs_diff   = stock_ret - spy_ret
            add("Trend", "Relative Strength vs S&P 500 (3-month)",
                f"Stock {stock_ret:+.1f}% vs SPY {spy_ret:+.1f}% → {rs_diff:+.1f}% alpha",
                f"{'Outperforming' if rs_diff > 0 else 'Underperforming'} the S&P 500 by {abs(rs_diff):.1f}% over 3 months - "
                f"{'money is rotating into this stock.' if rs_diff > 5 else 'modest outperformance.' if rs_diff > 0 else 'weak relative strength, market prefers other names.'}",
                "bullish" if rs_diff > 3 else "neutral" if rs_diff >= -3 else "bearish", weight=2)
    except Exception:
        pass

    # ── 2. MOMENTUM OSCILLATORS ───────────────────────────────────────────────

    # 2a. RSI (14)
    if len(close) >= 16:
        delta = close.diff()
        avg_g = delta.clip(lower=0).ewm(com=13, adjust=False).mean()
        avg_l = (-delta).clip(lower=0).ewm(com=13, adjust=False).mean()
        rsi_s = 100 - 100 / (1 + avg_g / avg_l)
        rv = float(rsi_s.iloc[-1])
        rp = float(rsi_s.iloc[-2])
        dir_ = "rising" if rv > rp else "falling"
        if   rv > 70: sig, interp = "bearish", f"RSI {rv:.1f} ({dir_}) - overbought. Pullback risk elevated."
        elif rv > 60: sig, interp = "bullish", f"RSI {rv:.1f} ({dir_}) - bullish momentum, approaching overbought."
        elif rv >= 40:sig, interp = "bullish", f"RSI {rv:.1f} ({dir_}) - healthy range, not stretched."
        elif rv >= 30:sig, interp = "neutral", f"RSI {rv:.1f} ({dir_}) - weak momentum, approaching oversold."
        else:         sig, interp = "bearish", f"RSI {rv:.1f} ({dir_}) - oversold, strong selling pressure."
        add("Momentum", "RSI (14-day)", f"{rv:.1f}", interp, sig, weight=2)

    # 2b. Stochastic %K/%D (14,3,3)
    if len(close) >= 17:
        lo14 = low.rolling(14).min()
        hi14 = high.rolling(14).max()
        k = (100 * (close - lo14) / (hi14 - lo14).replace(0, np.nan)).rolling(3).mean()
        d = k.rolling(3).mean()
        kv, dv = float(k.iloc[-1]), float(d.iloc[-1])
        kp, dp = float(k.iloc[-2]), float(d.iloc[-2])
        cross_up = kv > dv and kp <= dp

        if kv < 20:
            sig = "bullish" if cross_up else "neutral"
            interp = f"%K {kv:.1f} / %D {dv:.1f} - oversold zone." + (" Bullish crossover forming." if cross_up else "")
        elif kv > 80:
            sig = "bearish"; interp = f"%K {kv:.1f} / %D {dv:.1f} - overbought zone. Reversal risk."
        else:
            sig = "bullish" if kv > dv else "neutral"
            interp = f"%K {kv:.1f} / %D {dv:.1f} - {'%K above %D, positive bias.' if kv > dv else 'neutral momentum.'}"
        add("Momentum", "Stochastic %K/%D (14,3,3)",
            f"%K {kv:.1f} / %D {dv:.1f}", interp, sig, weight=1)

    # 2c. Williams %R (14)
    if len(close) >= 14:
        wr = -100 * (high.rolling(14).max() - close) / (high.rolling(14).max() - low.rolling(14).min()).replace(0, np.nan)
        wv = float(wr.iloc[-1])
        if   wv >= -20:  sig = "bearish"; interp = f"Williams %R {wv:.1f} - overbought (above -20)."
        elif wv <= -80:  sig = "bullish"; interp = f"Williams %R {wv:.1f} - oversold (below -80), potential bounce."
        elif wv > -50:   sig = "bullish"; interp = f"Williams %R {wv:.1f} - upper half, mild bullish bias."
        else:            sig = "neutral"; interp = f"Williams %R {wv:.1f} - lower half, mild bearish bias."
        add("Momentum", "Williams %R (14-day)", f"{wv:.1f}", interp, sig, weight=1)

    # 2d. Rate of Change - ROC (20-day)
    if len(close) >= 21:
        roc = float(((close - close.shift(20)) / close.shift(20) * 100).iloc[-1])
        add("Momentum", "Rate of Change (20-day)", f"{roc:+.1f}%",
            f"ROC {roc:+.1f}% - {'strong positive' if roc > 5 else 'mild positive' if roc > 0 else 'negative'} momentum over 20 days.",
            "bullish" if roc > 0 else "bearish", weight=1)

    # 2e. CCI (20-day)
    if len(close) >= 20:
        tp = (high + low + close) / 3
        cci = (tp - tp.rolling(20).mean()) / (0.015 * tp.rolling(20).apply(lambda x: np.abs(x - x.mean()).mean()))
        cv = float(cci.iloc[-1])
        if   cv > 100:  sig = "bearish"; interp = f"CCI {cv:.0f} - above +100, overbought."
        elif cv < -100: sig = "bullish"; interp = f"CCI {cv:.0f} - below -100, oversold, potential reversal."
        elif cv > 0:    sig = "bullish"; interp = f"CCI {cv:.0f} - positive, mild upward pressure."
        else:           sig = "neutral"; interp = f"CCI {cv:.0f} - negative, mild downward pressure."
        add("Momentum", "Commodity Channel Index (20-day)", f"{cv:.0f}", interp, sig, weight=1)

    # ── 3. VOLUME ─────────────────────────────────────────────────────────────

    # 3a. Volume trend (10d vs 50d)
    if len(volume) >= 50:
        v10 = float(volume.iloc[-10:].mean())
        v50 = float(volume.iloc[-50:].mean())
        vr  = v10 / v50 if v50 > 0 else 1.0
        add("Volume", "Volume Trend (10d vs 50d avg)",
            f"10d avg {v10:,.0f} / 50d avg {v50:,.0f} ({vr:.2f}x)",
            f"Volume {'elevated' if vr >= 1.2 else 'near average' if vr >= 0.8 else 'below average'} ({vr:.1f}x avg) - {'confirms price moves.' if vr >= 1.2 else 'normal participation.' if vr >= 0.8 else 'weak participation, moves less reliable.'}",
            "bullish" if vr >= 1.2 else "neutral" if vr >= 0.8 else "bearish", weight=1)

    # 3b. On-Balance Volume trend
    if len(close) >= 20:
        obv = (np.sign(close.diff()) * volume).fillna(0).cumsum()
        obv_slope = float(obv.iloc[-1]) - float(obv.iloc[-20])
        add("Volume", "On-Balance Volume (OBV) 20-day trend",
            f"{'Rising' if obv_slope > 0 else 'Falling'} OBV ({obv_slope:+,.0f})",
            "OBV rising - volume heavier on up days, buyers in control." if obv_slope > 0
            else "OBV falling - volume heavier on down days, sellers in control.",
            "bullish" if obv_slope > 0 else "bearish", weight=2)

    # 3c. Up-day vs down-day volume ratio (20 sessions)
    if len(close) >= 21 and len(volume) >= 21:
        dr   = close.diff().iloc[-20:]
        v20  = volume.iloc[-20:]
        upv  = float(v20[dr > 0].sum())
        dnv  = float(v20[dr < 0].sum())
        tot  = upv + dnv
        if tot > 0:
            up_pct = upv / tot * 100
            add("Volume", "Up-Day vs Down-Day Volume (20d)",
                f"{up_pct:.0f}% up-day / {100-up_pct:.0f}% down-day",
                f"{up_pct:.0f}% of volume on up days - {'buyers in control.' if up_pct >= 55 else 'balanced.' if up_pct >= 45 else 'sellers in control.'}",
                "bullish" if up_pct >= 55 else "neutral" if up_pct >= 45 else "bearish", weight=1)

    # ── 4. VOLATILITY ─────────────────────────────────────────────────────────

    # 4a. Bollinger Band position (20,2)
    if len(close) >= 20:
        bb_mid   = close.rolling(20).mean()
        bb_std   = close.rolling(20).std()
        bb_upper = bb_mid + 2 * bb_std
        bb_lower = bb_mid - 2 * bb_std
        bm = float(bb_mid.iloc[-1])
        bu = float(bb_upper.iloc[-1])
        bl = float(bb_lower.iloc[-1])

        if spot > bu:
            sig = "bearish"; interp = f"Price above upper band (${bu:.2f}) - overbought, mean reversion likely."
        elif spot < bl:
            sig = "bullish"; interp = f"Price below lower band (${bl:.2f}) - oversold, potential bounce."
        elif spot > bm:
            sig = "bullish"; interp = f"Price in upper half of Bollinger Bands - positive momentum."
        else:
            sig = "neutral"; interp = f"Price in lower half of Bollinger Bands - mild bearish bias."
        add("Volatility", "Bollinger Band Position (20,2)",
            f"${spot:.2f}  [Lower ${bl:.2f} - Mid ${bm:.2f} - Upper ${bu:.2f}]",
            interp, sig, weight=1)

        # Bollinger Band Squeeze
        bw_series = ((bb_upper - bb_lower) / bb_mid * 100).dropna()
        if len(bw_series) >= 50:
            bw_now = float(bw_series.iloc[-1])
            bw_avg = float(bw_series.mean())
            if bw_now < bw_avg * 0.7:
                add("Volatility", "Bollinger Band Squeeze",
                    f"Band width {bw_now:.1f}% (avg {bw_avg:.1f}%)",
                    "Bands are unusually tight - volatility is compressed. A large breakout move is likely soon (direction unknown).",
                    "neutral", weight=1)

    # 4b. ATR% (14-day)
    if len(close) >= 15:
        prev_c = close.shift(1)
        tr = pd.concat([high - low, (high - prev_c).abs(), (low - prev_c).abs()], axis=1).max(axis=1)
        atr14    = float(tr.rolling(14).mean().iloc[-1])
        atr_pct  = atr14 / spot * 100
        add("Volatility", "ATR% (14-day Average True Range)",
            f"ATR ${atr14:.2f} = {atr_pct:.1f}% of price",
            f"Daily swing avg {atr_pct:.1f}% - {'low volatility, smooth price action.' if atr_pct < 1.5 else 'moderate daily volatility.' if atr_pct <= 3 else 'high daily swings, elevated entry risk.'}",
            "bullish" if atr_pct < 1.5 else "neutral" if atr_pct <= 3 else "bearish", weight=1)

    # 4c. Historical Volatility (21-day annualised)
    if len(close) >= 25:
        hv21 = float(np.log(close / close.shift(1)).dropna().iloc[-21:].std() * math.sqrt(252) * 100)
        add("Volatility", "Historical Volatility (21-day annualised)",
            f"{hv21:.1f}%",
            f"Annualised HV {hv21:.1f}% - {'low, calm price action.' if hv21 < 20 else 'moderate.' if hv21 <= 40 else 'high, large price swings.'}",
            "bullish" if hv21 < 20 else "neutral" if hv21 <= 40 else "bearish", weight=1)

    # ── 5. PRICE STRUCTURE ────────────────────────────────────────────────────

    # 5a. Higher highs & higher lows (20-day)
    if len(close) >= 20:
        h20 = high.iloc[-20:].tolist()
        l20 = low.iloc[-20:].tolist()
        hh  = max(h20[10:]) > max(h20[:10])
        hl  = min(l20[10:]) > min(l20[:10])
        if hh and hl:
            add("Price Structure", "Higher Highs & Higher Lows (20d)",
                "Higher highs AND higher lows",
                "Classic uptrend structure - both peaks and troughs are rising.",
                "bullish", weight=2)
        elif not hh and not hl:
            add("Price Structure", "Lower Highs & Lower Lows (20d)",
                "Lower highs AND lower lows",
                "Classic downtrend structure - both peaks and troughs are falling.",
                "bearish", weight=2)
        else:
            add("Price Structure", "Mixed Price Structure (20d)",
                f"Higher highs: {'yes' if hh else 'no'} / Higher lows: {'yes' if hl else 'no'}",
                "Mixed structure - no clear trend direction.",
                "neutral", weight=2)

    # 5b. Distance from 52-week high
    if len(close) >= 50:
        h52 = float(high.iloc[-252:].max()) if len(high) >= 252 else float(high.max())
        dfh = (h52 - spot) / h52 * 100
        add("Price Structure", "Distance from 52-Week High",
            f"{dfh:.1f}% below 52-week high (${h52:.2f})",
            "Near 52-week highs - strong momentum." if dfh <= 5
            else "Moderately off highs." if dfh <= 20
            else "Well below highs - assess if it's a bargain or broken trend.",
            "bullish" if dfh <= 5 else "neutral" if dfh <= 20 else "bearish", weight=1)

    # 5c. Distance from 52-week low
    if len(close) >= 50:
        l52 = float(low.iloc[-252:].min()) if len(low) >= 252 else float(low.min())
        dfl = (spot - l52) / l52 * 100
        add("Price Structure", "Distance from 52-Week Low",
            f"{dfl:.1f}% above 52-week low (${l52:.2f})",
            "Near 52-week lows - high risk." if dfl < 10
            else "Moderate support cushion beneath." if dfl < 30
            else "Well above lows - strong support base.",
            "bearish" if dfl < 10 else "neutral" if dfl < 30 else "bullish", weight=1)

    # ── 6. FUNDAMENTALS ───────────────────────────────────────────────────────

    # 6a. Trailing P/E Ratio
    pe = safe(info.get("trailingPE"))
    if pe is not None:
        if   pe <= 0:   sig = "bearish"; interp = f"P/E {pe:.1f} - negative, company is unprofitable."
        elif pe <= 15:  sig = "bullish"; interp = f"P/E {pe:.1f} - potentially undervalued."
        elif pe <= 25:  sig = "bullish"; interp = f"P/E {pe:.1f} - fair valuation."
        elif pe <= 40:  sig = "neutral"; interp = f"P/E {pe:.1f} - elevated, priced for strong growth."
        else:           sig = "bearish"; interp = f"P/E {pe:.1f} - very high, little margin for error."
        add("Fundamentals", "Trailing P/E Ratio", f"{pe:.1f}", interp, sig, weight=2)

    # 6b. Forward P/E Ratio
    # If forward P/E < trailing P/E, analysts expect earnings to grow - a positive signal.
    fwd_pe = safe(info.get("forwardPE"))
    if fwd_pe is not None:
        if   fwd_pe <= 0:   sig = "bearish"; interp = f"Forward P/E {fwd_pe:.1f} - analysts expect continued losses."
        elif fwd_pe <= 15:  sig = "bullish"; interp = f"Forward P/E {fwd_pe:.1f} - cheap on expected earnings."
        elif fwd_pe <= 25:  sig = "bullish"; interp = f"Forward P/E {fwd_pe:.1f} - fair forward valuation."
        elif fwd_pe <= 40:  sig = "neutral"; interp = f"Forward P/E {fwd_pe:.1f} - elevated, requires strong earnings delivery."
        else:               sig = "bearish"; interp = f"Forward P/E {fwd_pe:.1f} - expensive even on future estimates."
        # Add context if we also have trailing P/E for comparison
        if pe is not None and pe > 0 and fwd_pe > 0:
            expansion = pe - fwd_pe
            direction = "earnings expected to grow" if expansion > 2 else "earnings expected to shrink" if expansion < -2 else "earnings roughly flat"
            interp += f" Trailing P/E {pe:.1f} vs Forward {fwd_pe:.1f} - {direction}."
        add("Fundamentals", "Forward P/E Ratio", f"{fwd_pe:.1f}", interp, sig, weight=2)

    # 6c. PEG Ratio (Price/Earnings to Growth)
    peg = safe(info.get("pegRatio"))
    if peg is not None:
        if peg < 1.0:   sig = "bullish"; interp = f"PEG {peg:.2f} - strongly undervalued relative to growth."
        elif peg <= 1.5:sig = "bullish"; interp = f"PEG {peg:.2f} - fair valuation for its growth rate."
        elif peg <= 2.5:sig = "neutral"; interp = f"PEG {peg:.2f} - growth is priced in."
        else:           sig = "bearish"; interp = f"PEG {peg:.2f} - highly overvalued relative to growth."
        add("Fundamentals", "PEG Ratio", f"{peg:.2f}", interp, sig, weight=2)

    # 6d. EV / EBITDA
    # Better cross-sector valuation metric than P/E; accounts for debt and depreciation.
    ev_ebitda = safe(info.get("enterpriseToEbitda"))
    if ev_ebitda is not None:
        if   ev_ebitda <= 0:  sig = "bearish"; interp = f"EV/EBITDA {ev_ebitda:.1f} - negative EBITDA, operating losses."
        elif ev_ebitda <= 10: sig = "bullish"; interp = f"EV/EBITDA {ev_ebitda:.1f} - attractive valuation, cheap relative to operating earnings."
        elif ev_ebitda <= 20: sig = "neutral"; interp = f"EV/EBITDA {ev_ebitda:.1f} - fair, in line with typical market multiples."
        else:                 sig = "bearish"; interp = f"EV/EBITDA {ev_ebitda:.1f} - expensive; significant growth required to justify."
        add("Fundamentals", "EV/EBITDA", f"{ev_ebitda:.1f}x", interp, sig, weight=2)

    # 6e. Price-to-Book
    pb = safe(info.get("priceToBook"))
    if pb is not None:
        if   pb < 0:  sig = "bearish"; interp = f"P/B {pb:.2f} - negative book value, liabilities exceed assets."
        elif pb <= 1: sig = "bullish"; interp = f"P/B {pb:.2f} - at or below book value, potentially undervalued."
        elif pb <= 3: sig = "bullish"; interp = f"P/B {pb:.2f} - reasonable asset valuation."
        else:         sig = "neutral"; interp = f"P/B {pb:.2f} - premium to book, typical for asset-light businesses."
        add("Fundamentals", "Price-to-Book (P/B)", f"{pb:.2f}", interp, sig, weight=1)

    # 6f. Price to Sales
    ps = safe(info.get("priceToSalesTrailing12Months"))
    if ps is not None:
        if ps <= 1:    sig = "bullish"; interp = f"P/S {ps:.2f} - highly undervalued. Paying less than $1 for $1 of sales."
        elif ps <= 3:  sig = "bullish"; interp = f"P/S {ps:.2f} - reasonable sales valuation."
        elif ps <= 8:  sig = "neutral"; interp = f"P/S {ps:.2f} - moderate premium, common in software/high-margin sectors."
        else:          sig = "bearish"; interp = f"P/S {ps:.2f} - extremely expensive. Priced for absolute perfection."
        add("Fundamentals", "Price-to-Sales (P/S)", f"{ps:.2f}", interp, sig, weight=1)

    # 6g. Free Cash Flow
    fcf = safe(info.get("freeCashflow"))
    if fcf is not None:
        fcf_b = fcf / 1e9
        add("Fundamentals", "Free Cash Flow",
            f"${fcf_b:.2f}B annually",
            f"Positive FCF ${fcf_b:.2f}B - company generates real cash." if fcf > 0
            else f"Negative FCF ${fcf_b:.2f}B - company is burning cash.",
            "bullish" if fcf > 0 else "bearish", weight=3)

    # 6h. Earnings Quality: Operating Cash Flow vs Net Income
    # When OCF > net income, earnings are high quality (cash-backed, not accounting artifacts).
    ocf = safe(info.get("operatingCashflow"))
    ni  = safe(info.get("netIncomeToCommon"))
    if ocf is not None and ni is not None:
        if ni <= 0 and ocf > 0:
            sig = "bullish"; interp = f"OCF ${ocf/1e9:.2f}B despite net loss - cash generation is real even with accounting losses."
        elif ni > 0 and ocf > ni:
            ratio = ocf / ni
            sig = "bullish"; interp = f"OCF ${ocf/1e9:.2f}B exceeds net income ${ni/1e9:.2f}B ({ratio:.1f}x) - high-quality earnings backed by real cash."
        elif ni > 0 and ocf > 0:
            sig = "neutral"; interp = f"OCF ${ocf/1e9:.2f}B positive but below net income ${ni/1e9:.2f}B - earnings partially accrual-based."
        else:
            sig = "bearish"; interp = f"OCF ${ocf/1e9:.2f}B negative - company is consuming cash regardless of reported earnings."
        add("Fundamentals", "Earnings Quality (OCF vs Net Income)",
            f"OCF ${ocf/1e9:.2f}B / Net Income ${ni/1e9:.2f}B" if ni is not None else f"OCF ${ocf/1e9:.2f}B",
            interp, sig, weight=2)

    # 6i. Revenue Growth
    rg = safe(info.get("revenueGrowth"))
    if rg is not None:
        rg_pct = rg * 100
        if   rg_pct >= 15: sig = "bullish"; interp = f"Revenue growing {rg_pct:.1f}% YoY - rapid expansion."
        elif rg_pct >= 5:  sig = "bullish"; interp = f"Revenue growing {rg_pct:.1f}% YoY - healthy growth."
        elif rg_pct >= 0:  sig = "neutral"; interp = f"Revenue growth {rg_pct:.1f}% - flat, growth has stalled."
        else:              sig = "bearish"; interp = f"Revenue declining {rg_pct:.1f}% YoY - business contracting."
        add("Fundamentals", "Revenue Growth (YoY)", f"{rg_pct:+.1f}%", interp, sig, weight=2)

    # 6j. EPS Growth (YoY)
    # Revenue growing while EPS shrinks is a red flag for margin compression.
    eps_growth = safe(info.get("earningsGrowth"))
    if eps_growth is None:
        eps_growth = safe(info.get("earningsQuarterlyGrowth"))
    if eps_growth is not None:
        eg_pct = eps_growth * 100
        if   eg_pct >= 20: sig = "bullish"; interp = f"EPS growing {eg_pct:.1f}% YoY - strong earnings leverage."
        elif eg_pct >= 5:  sig = "bullish"; interp = f"EPS growing {eg_pct:.1f}% YoY - solid earnings growth."
        elif eg_pct >= 0:  sig = "neutral"; interp = f"EPS growth {eg_pct:.1f}% - flat earnings, growth has stalled."
        else:              sig = "bearish"; interp = f"EPS shrinking {eg_pct:.1f}% YoY - earnings are deteriorating."
        add("Fundamentals", "EPS Growth (YoY)", f"{eg_pct:+.1f}%", interp, sig, weight=2)

    # 6k. Gross Margin
    # Reveals pricing power and competitive moat. High margins are defensible.
    gm = safe(info.get("grossMargins"))
    if gm is not None:
        gm_pct = gm * 100
        if   gm_pct >= 60: sig = "bullish"; interp = f"Gross margin {gm_pct:.1f}% - exceptional pricing power, wide moat."
        elif gm_pct >= 40: sig = "bullish"; interp = f"Gross margin {gm_pct:.1f}% - healthy margins, good competitive position."
        elif gm_pct >= 20: sig = "neutral"; interp = f"Gross margin {gm_pct:.1f}% - moderate, typical for industrial/retail sectors."
        else:              sig = "bearish"; interp = f"Gross margin {gm_pct:.1f}% - thin margins, vulnerable to cost increases."
        add("Fundamentals", "Gross Margin", f"{gm_pct:.1f}%", interp, sig, weight=2)

    # 6l. Net Profit Margin
    pm = safe(info.get("profitMargins"))
    if pm is not None:
        pm_pct = pm * 100
        if   pm_pct >= 20: sig = "bullish"; interp = f"Net margin {pm_pct:.1f}% - high efficiency, strong pricing power."
        elif pm_pct >= 10: sig = "bullish"; interp = f"Net margin {pm_pct:.1f}% - healthy profitability."
        elif pm_pct >= 0:  sig = "neutral"; interp = f"Net margin {pm_pct:.1f}% - thin but profitable."
        else:              sig = "bearish"; interp = f"Net margin {pm_pct:.1f}% - company is losing money."
        add("Fundamentals", "Net Profit Margin", f"{pm_pct:.1f}%", interp, sig, weight=2)

    # 6m. Return on Equity
    roe = safe(info.get("returnOnEquity"))
    if roe is not None:
        roe_pct = roe * 100
        if   roe_pct >= 15: sig = "bullish"; interp = f"ROE {roe_pct:.1f}% - strong returns on shareholder capital."
        elif roe_pct >= 8:  sig = "neutral"; interp = f"ROE {roe_pct:.1f}% - adequate returns."
        else:               sig = "bearish"; interp = f"ROE {roe_pct:.1f}% - weak returns on capital."
        add("Fundamentals", "Return on Equity (ROE)", f"{roe_pct:.1f}%", interp, sig, weight=1)

    # 6n. Debt-to-Equity
    # More standardised leverage metric than debt/cash, directly comparable cross-sector.
    dte = safe(info.get("debtToEquity"))
    if dte is not None:
        # yfinance returns this as a percentage (e.g. 150 means 1.5x), normalise to ratio
        dte_ratio = dte / 100
        if   dte_ratio < 0.5:  sig = "bullish"; interp = f"D/E {dte_ratio:.2f}x - conservative leverage, strong balance sheet."
        elif dte_ratio <= 1.5: sig = "neutral"; interp = f"D/E {dte_ratio:.2f}x - moderate debt, manageable."
        elif dte_ratio <= 3.0: sig = "neutral"; interp = f"D/E {dte_ratio:.2f}x - elevated leverage, watch interest coverage."
        else:                  sig = "bearish"; interp = f"D/E {dte_ratio:.2f}x - high leverage, vulnerable to rate rises and downturns."
        add("Fundamentals", "Debt-to-Equity Ratio", f"{dte_ratio:.2f}x", interp, sig, weight=2)

    # 6o. Debt vs Cash (absolute)
    td = safe(info.get("totalDebt"))
    tc = safe(info.get("totalCash"))
    if td is not None and tc is not None and tc > 0:
        dcr = td / tc
        add("Fundamentals", "Debt vs Cash",
            f"Debt ${td/1e9:.1f}B / Cash ${tc/1e9:.1f}B ({dcr:.1f}x)",
            "More cash than debt - strong balance sheet." if dcr < 1
            else f"Debt is {dcr:.1f}x cash - manageable leverage." if dcr <= 3
            else f"Debt is {dcr:.1f}x cash - high leverage, vulnerable in downturns.",
            "bullish" if dcr < 1 else "neutral" if dcr <= 3 else "bearish", weight=2)

    # 6p. Current Ratio
    cr = safe(info.get("currentRatio"))
    if cr is not None:
        if cr >= 1.5:   sig = "bullish"; interp = f"Current Ratio {cr:.2f} - strong liquidity, can easily cover short-term debts."
        elif cr >= 1.0: sig = "neutral"; interp = f"Current Ratio {cr:.2f} - adequate liquidity, short-term assets cover short-term liabilities."
        else:           sig = "bearish"; interp = f"Current Ratio {cr:.2f} - poor liquidity, risk of a short-term cash crunch."
        add("Fundamentals", "Current Ratio", f"{cr:.2f}", interp, sig, weight=1)

    # 6q. Dividend Yield + Payout Ratio
    dy_pct = safe(info.get("dividendYield"))
    payout    = safe(info.get("payoutRatio"))
    if dy_pct is not None and dy_pct > 0:
        if payout is not None:
            pr_pct = payout * 100
            if pr_pct > 100:
                sig = "bearish"; interp = f"Dividend yield {dy_pct:.1f}% but payout ratio {pr_pct:.0f}% - dividend exceeds earnings, likely unsustainable."
            elif pr_pct > 75:
                sig = "neutral"; interp = f"Dividend yield {dy_pct:.1f}%, payout ratio {pr_pct:.0f}% - high payout leaves little room for growth or stress."
            elif dy_pct >= 3:
                sig = "bullish"; interp = f"Dividend yield {dy_pct:.1f}%, payout ratio {pr_pct:.0f}% - attractive yield with sustainable payout."
            else:
                sig = "bullish"; interp = f"Dividend yield {dy_pct:.1f}%, payout ratio {pr_pct:.0f}% - modest yield, well covered."
            add("Fundamentals", "Dividend Yield & Payout Ratio",
                f"{dy_pct:.1f}% yield / {pr_pct:.0f}% payout", interp, sig, weight=1)
        else:
            sig = "bullish" if dy_pct >= 2 else "neutral"
            add("Fundamentals", "Dividend Yield",
                f"{dy_pct:.1f}%",
                f"Dividend yield {dy_pct:.1f}% - {'attractive income.' if dy_pct >= 3 else 'modest income.'}",
                sig, weight=1)

    # 6r. Analyst Consensus
    rec = info.get("recommendationKey", "")
    rec_map = {
        "strong_buy":  ("bullish", "Strong Buy",   3),
        "buy":         ("bullish", "Buy",           2),
        "hold":        ("neutral", "Hold",          1),
        "underperform":("bearish", "Underperform",  2),
        "sell":        ("bearish", "Sell",          3),
    }
    if rec in rec_map:
        sig, label, w = rec_map[rec]
        mt = safe(info.get("targetMeanPrice"))
        upside = (mt - spot) / spot * 100 if mt else None
        add("Fundamentals", "Analyst Consensus",
            f"{label}" + (f" / Mean target ${mt:.2f} ({upside:+.1f}%)" if upside else ""),
            f"Wall Street consensus: '{label}'." + (f" Avg target implies {upside:+.1f}% upside." if upside else ""),
            sig, weight=2)

    # ── 7. RISK ───────────────────────────────────────────────────────────────

    # 7a. Earnings proximity
    _ed2           = get_earnings_days(ticker)
    earn_days      = _ed2["days"]      if isinstance(_ed2, dict) else _ed2
    earn_estimated = _ed2["estimated"] if isinstance(_ed2, dict) else False
    est_tag        = " (estimated)" if earn_estimated else ""

    if earn_days is not None:
        if earn_days <= 14:
            add("Risk", "Earnings Proximity", f"Earnings in {earn_days} days{est_tag}",
                f"Report in {earn_days} days{est_tag} - high binary event risk. Stock can move 5-15% overnight.",
                "bearish", weight=2)
        elif earn_days <= 30:
            add("Risk", "Earnings Proximity", f"Earnings in {earn_days} days{est_tag}",
                f"Earnings in {earn_days} days{est_tag} - be aware of upcoming event risk.",
                "neutral", weight=1)
        else:
            add("Risk", "Earnings Proximity", f"Earnings in {earn_days} days{est_tag}",
                f"Earnings ~{earn_days} days away{est_tag} - no immediate event risk.",
                "bullish", weight=1)

    # 7b. Beta (market sensitivity)
    beta = safe(info.get("beta"))
    if beta is not None:
        if   beta <= 0.8: sig = "bullish"; interp = f"Beta {beta:.2f} - defensive, moves less than the market."
        elif beta <= 1.2: sig = "neutral"; interp = f"Beta {beta:.2f} - moves broadly in line with the market."
        elif beta <= 2.0: sig = "neutral"; interp = f"Beta {beta:.2f} - moderately more volatile than the market."
        else:             sig = "bearish"; interp = f"Beta {beta:.2f} - very high market sensitivity, large swings."
        add("Risk", "Beta (Market Sensitivity)", f"{beta:.2f}", interp, sig, weight=1)

    # 7c. Short Interest
    short_pct = safe(info.get("shortPercentOfFloat"))
    if short_pct is not None:
        short_pct = short_pct * 100
        if short_pct > 15:   sig = "bearish"; interp = f"{short_pct:.1f}% of float shorted - high pessimism, squeeze potential."
        elif short_pct > 5:  sig = "neutral"; interp = f"{short_pct:.1f}% shorted - moderate skepticism."
        else:                sig = "bullish"; interp = f"{short_pct:.1f}% shorted - little bet against the company."
        add("Risk", "Short Interest", f"{short_pct:.1f}%", interp, sig, weight=1)

    # 7d. Institutional Ownership
    inst_pct = safe(info.get("institutionsPercentHeld"))
    if inst_pct is None:
        inst_pct = safe(info.get("institutionPercentHeld"))
    if inst_pct is not None:
        ip = inst_pct * 100
        if   ip >= 70: sig = "bullish"; interp = f"{ip:.1f}% institutionally owned - strong conviction from funds and large investors."
        elif ip >= 40: sig = "neutral"; interp = f"{ip:.1f}% institutionally owned - moderate institutional interest."
        else:          sig = "bearish"; interp = f"{ip:.1f}% institutionally owned - low institutional interest, less scrutinised."
        add("Risk", "Institutional Ownership", f"{ip:.1f}%", interp, sig, weight=1)

    # ── 8. INSIDER ACTIVITY ───────────────────────────────────────────────────
    insider_transactions = []
    insider_pct_held     = None
    buyback_shares       = 0
    buyback_value        = 0.0
    buyback_count        = 0

    now = datetime.datetime.now(datetime.timezone.utc)

    # 1. Determine Market Cap Tiers (Adjust thresholds as needed)
    market_cap = safe(info.get("marketCap")) or 0
    is_large_cap = market_cap >= 10_000_000_000  # > $10B
    is_mega_cap = market_cap >= 100_000_000_000  # > $100B
    is_small_cap = market_cap < 2_000_000_000    # < $2B

    # 2. Dynamic Thresholding Logic
    # Large caps have much lower insider %; Small caps expect much higher
    if is_mega_cap:
        bullish_threshold = 0.05
        neutral_threshold = 0.005

    elif is_large_cap:
        bullish_threshold = 0.5
        neutral_threshold = 0.1

    elif is_small_cap:
        bullish_threshold = 7.0
        neutral_threshold = 2.0
    
    else:
        bullish_threshold = 2.0
        neutral_threshold = 0.5

    try:
        # ── Insider % held via FMP stable insider-ownership endpoint ─────────
        # /stable/insider-ownership?symbol=TICKER
        ins_own_data = fmp_fetch("/stable/insider-ownership", symbol=ticker)
        ins_own = _one(ins_own_data)
        if ins_own:
            total_shares   = ins_own.get("sharesOutstanding") or ins_own.get("totalSharesOutstanding")
            insider_shares = ins_own.get("insidersShares")    or ins_own.get("insidersSharesOwned")
            if total_shares and insider_shares and total_shares > 0:
                insider_pct_held = round(insider_shares / total_shares * 100, 4)
    except Exception:
        pass

    try:
        # ── Insider trades via stable endpoint ──────────────────────────────
        # /stable/insider-trading?symbol=TICKER&limit=100
        idf_raw = fmp_fetch("/stable/insider-trading", symbol=ticker, limit=100)
        if isinstance(idf_raw, list) and idf_raw:
            cutoff    = now - datetime.timedelta(days=180)
            buys_180  = 0
            sells_180 = 0

            for row in idf_raw:
                txn_type = str(row.get("transactionType") or "").strip()
                name_raw = str(row.get("reportingName")  or "").strip()
                role_raw = str(row.get("typeOfOwner")    or "").strip()

                # Determine direction: FMP uses SEC transaction codes
                is_buy  = txn_type in ("P-Purchase",)
                is_sell = txn_type in ("S-Sale", "S-Sale+OE", "S-Sale+M")
                if not is_buy and not is_sell:
                    continue

                date_str = row.get("transactionDate") or row.get("filingDate") or ""
                dt = None
                try:
                    dt = datetime.datetime.strptime(date_str[:10], "%Y-%m-%d").replace(
                        tzinfo=datetime.timezone.utc
                    )
                except Exception:
                    continue

                try:
                    shares = int(row.get("securitiesTransacted") or 0)
                    price  = float(row.get("price") or 0)
                    value  = shares * price
                    if not math.isfinite(value):
                        value = 0.0
                except Exception:
                    shares, value = 0, 0.0

                within_window = dt >= cutoff
                if within_window:
                    buys_180  += is_buy
                    sells_180 += is_sell

                insider_transactions.append({
                    "date":         dt.strftime("%Y-%m-%d"),
                    "name":         name_raw or "Unknown",
                    "role":         role_raw or "Insider",
                    "type":         "buy" if is_buy else "sell",
                    "shares":       shares,
                    "value":        value,
                    "recent":       within_window,
                    "is_corporate": False,
                })

            # Trim to the 20 most recent human trades
            insider_transactions = insider_transactions[:20]

            # Signal logic (no corporate buyback row from FMP Form-4 data)
            total_human = buys_180 + sells_180
            if total_human > 0:
                net = buys_180 - sells_180
                if net >= 3 or (net > 0 and buys_180 / total_human >= 0.7):
                    sig = "bullish"
                    msg = "strong insider conviction. Insiders only buy for one reason."
                elif net > 0:
                    sig = "bullish"
                    msg = "mild net buying. A modest positive signal."
                elif net == 0:
                    sig = "neutral"
                    msg = "equal buys and sells - no clear directional signal."
                elif net >= -2:
                    sig = "neutral"
                    msg = "mild net selling. Insiders sell for many reasons (diversification, taxes, etc.)."
                else:
                    sig = "bearish"
                    msg = "significant insider selling. Worth monitoring closely."

                interp = (
                    f"{buys_180} insider buy{'s' if buys_180 != 1 else ''} vs "
                    f"{sells_180} sell{'s' if sells_180 != 1 else ''} in the last 6 months - "
                    f"{msg}"
                )
                value_str = f"{buys_180}B / {sells_180}S"
                add("Insider Activity", "Insider Buy/Sell (180d)", value_str, interp, sig, weight=2)

                # Insider ownership %
                if insider_pct_held is not None:
                    cap_desc = "Mega Cap" if is_mega_cap else "Large Cap" if is_large_cap else "Small/Micro Cap" if is_small_cap else "Mid Cap"
                    if insider_pct_held >= bullish_threshold:
                        sentiment = "bullish"
                        explanation = f"High insider ownership for a {cap_desc} ({insider_pct_held:.2f}%) - significant skin in the game."
                    elif insider_pct_held >= neutral_threshold:
                        sentiment = "neutral"
                        explanation = f"Insiders hold {insider_pct_held:.2f}% - typical ownership levels for a {cap_desc}."
                    else:
                        sentiment = "bearish"
                        explanation = f"Very low insider ownership for a {cap_desc} ({insider_pct_held:.2f}%) - lack of management alignment."
                    add("Insider Activity", "Insider Ownership %",
                        f"{insider_pct_held:.2f}% insider owned",
                        explanation, sentiment, weight=1)

            elif insider_pct_held is not None:
                cap_desc = "Large Cap" if is_large_cap else "Small/Micro Cap" if is_small_cap else "Mid Cap"
                if insider_pct_held >= bullish_threshold:
                    sentiment = "bullish"
                    explanation = f"High insider ownership for a {cap_desc} ({insider_pct_held:.2f}%) - significant skin in the game."
                elif insider_pct_held >= neutral_threshold:
                    sentiment = "neutral"
                    explanation = f"Insiders hold {insider_pct_held:.2f}% - typical ownership levels for a {cap_desc}."
                else:
                    sentiment = "bearish"
                    explanation = f"Very low insider ownership for a {cap_desc} ({insider_pct_held:.2f}%) - lack of management alignment."
                add("Insider Activity", "Insider Ownership %",
                    f"{insider_pct_held:.2f}% insider owned",
                    explanation, sentiment, weight=1)

    except Exception:
        pass

    # ── Score & verdict ───────────────────────────────────────────────────────
    score = round(bull_w / total_w * 100, 1) if total_w > 0 else 50.0

    for s in signals:
        s["max_contribution"]    = round((s["weight"] / total_w) * 100, 2)
        multiplier               = 1.0 if s["signal"] == "bullish" else (0.5 if s["signal"] == "neutral" else 0.0)
        s["actual_contribution"] = round(s["max_contribution"] * multiplier, 2)

    if score >= 85:
        verdict = "STRONG BUY"
        vsub = "Exceptional alignment across technicals, value, and risk metrics. High conviction."
    elif score >= 70:
        verdict = "BUY"
        vsub = "Solid bullish structure. Most indicators suggest a favorable entry point."
    elif score >= 50:
        verdict = "NEUTRAL / HOLD"
        vsub = "Mixed signals. The stock may be fairly valued or in a consolidation phase."
    elif score >= 35:
        verdict = "CAUTION"
        vsub = "Weakening technicals or high valuation risk. Exercise significant patience."
    else:
        verdict = "AVOID / SELL"
        vsub = "High-risk profile. Majority of indicators are currently bearish."

    return jsonify({
        "ticker":        ticker,
        "marketCap":     market_cap,
        "name":          info.get("shortName") or info.get("longName") or ticker,
        "sector":        info.get("sector"),
        "industry":      info.get("industry"),
        "spot":          spot,
        "score":         score,
        "verdict":       verdict,
        "verdict_sub":   vsub,
        "signal_counts": {
            "bullish": len([s for s in signals if s["signal"] == "bullish"]),
            "neutral":  len([s for s in signals if s["signal"] == "neutral"]),
            "bearish":  len([s for s in signals if s["signal"] == "bearish"]),
            "total":    len(signals),
        },
        "signals":              signals,
        "insider_transactions": insider_transactions,
        "insider_pct_held":     insider_pct_held,
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
        print("Mortgage rate fetch error:", e)
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

@app.context_processor
def inject_is_prod():
    # If debug is False, we are likely in Production
    return dict(IS_PROD=not app.debug)

# ─────────────────────────────────────────────────────────────────────────────
#  MAIN FUNCITON
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)