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

@app.route("/drip")
def drip():
    return render_template("drip.html")

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

@app.route("/financial-health-check")
def healthCheck():
    return render_template("financial-health-check.html")

@app.route("/newsletter")
def newsletter():
    return render_template("newsletter.html", article=LATEST_ARTICLE)

@app.route("/ads.txt")
def ads():
    return send_from_directory(app.root_path, "ads.txt", mimetype="text/plain")

# ── Edit this every week ──────────────────────────────────────────────────────
LATEST_ARTICLE = {
    "title": "5 Mistakes to Avoid When Starting the Wheel Strategy",
    "date": "Apr 8, 2026",
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

@app.context_processor
def inject_is_prod():
    # This will be True if the variable exists at all in Render's "Environment" tab
    is_prod = os.environ.get("SHOW_ADS", "false").lower() == "true"
    return dict(IS_PROD=is_prod)

# ─────────────────────────────────────────────────────────────────────────────
#  MAIN FUNCITON
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)