import numpy as np
import pandas as pd
from db.connection import query


def run_forecast(horizon: int = 6, model_type: str = "hybrid", region: str = None, service_line: str = None):
    filters = []
    if region:
        filters.append(f"region_id = '{region}'")
    if service_line:
        filters.append(f"service_line_id = '{service_line}'")
    where = "WHERE " + " AND ".join(filters) if filters else ""

    df = query(f"""
        SELECT date, SUM(booked_revenue) as revenue
        FROM fact_revenue
        {where}
        GROUP BY date
        ORDER BY date
    """)

    if df.empty:
        return {"forecast": [], "model": model_type}

    df["date"] = pd.to_datetime(df["date"])
    df = df.set_index("date").asfreq("MS", fill_value=0).reset_index()

    revenue = df["revenue"].values
    dates = df["date"].values

    last_date = pd.Timestamp(dates[-1])
    forecast_dates = pd.date_range(last_date + pd.DateOffset(months=1), periods=horizon, freq="MS")

    if model_type in ("prophet", "hybrid"):
        prophet_pred = _prophet_forecast(revenue, horizon)
    if model_type in ("xgboost", "hybrid"):
        xgb_pred = _xgboost_forecast(revenue, horizon)

    if model_type == "prophet":
        predictions = prophet_pred
    elif model_type == "xgboost":
        predictions = xgb_pred
    else:
        predictions = 0.6 * prophet_pred + 0.4 * xgb_pred

    noise_scale = np.std(revenue[-12:]) * 0.1
    ci_80 = 1.28 * noise_scale
    ci_95 = 1.96 * noise_scale

    historical = [
        {"date": str(d)[:10], "revenue": round(float(r), 2), "type": "actual"}
        for d, r in zip(dates[-18:], revenue[-18:])
    ]

    forecast = [
        {
            "date": str(fd)[:10],
            "revenue": round(float(p), 2),
            "lower_80": round(float(p - ci_80), 2),
            "upper_80": round(float(p + ci_80), 2),
            "lower_95": round(float(p - ci_95), 2),
            "upper_95": round(float(p + ci_95), 2),
            "type": "forecast",
        }
        for fd, p in zip(forecast_dates, predictions)
    ]

    return {
        "model": model_type,
        "horizon": horizon,
        "historical": historical,
        "forecast": forecast,
    }


def _prophet_forecast(values: np.ndarray, horizon: int) -> np.ndarray:
    """Simplified Prophet-style decomposition: trend + seasonality."""
    n = len(values)
    x = np.arange(n)

    coeffs = np.polyfit(x, values, deg=1)
    trend = np.polyval(coeffs, np.arange(n, n + horizon))

    if n >= 12:
        seasonal = np.array([
            np.mean(values[i::12]) - np.mean(values) for i in range(12)
        ])
        seasonal_forecast = np.array([seasonal[(n + i) % 12] for i in range(horizon)])
    else:
        seasonal_forecast = np.zeros(horizon)

    noise = np.random.normal(0, np.std(values) * 0.03, horizon)
    return np.maximum(0, trend + seasonal_forecast + noise)


def _xgboost_forecast(values: np.ndarray, horizon: int) -> np.ndarray:
    """Simplified XGBoost-style forecast using lag features."""
    n = len(values)

    if n < 13:
        return _prophet_forecast(values, horizon)

    X, y = [], []
    for i in range(12, n):
        features = [
            values[i - 1],
            values[i - 3],
            values[i - 6],
            values[i - 12],
            np.mean(values[max(0, i - 3):i]),
            np.mean(values[max(0, i - 6):i]),
            i % 12,
        ]
        X.append(features)
        y.append(values[i])

    X = np.array(X)
    y = np.array(y)

    from sklearn.ensemble import GradientBoostingRegressor
    model = GradientBoostingRegressor(n_estimators=100, max_depth=4, random_state=42)
    model.fit(X, y)

    predictions = []
    extended = list(values)
    for step in range(horizon):
        idx = n + step
        features = [
            extended[-1],
            extended[-3] if len(extended) >= 3 else extended[-1],
            extended[-6] if len(extended) >= 6 else extended[-1],
            extended[-12] if len(extended) >= 12 else extended[-1],
            np.mean(extended[-3:]),
            np.mean(extended[-6:]),
            idx % 12,
        ]
        pred = model.predict([features])[0]
        pred = max(0, pred)
        predictions.append(pred)
        extended.append(pred)

    return np.array(predictions)
