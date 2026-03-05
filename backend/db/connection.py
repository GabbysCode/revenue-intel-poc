import duckdb
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "revintel.duckdb")

_conn = None


def get_conn() -> duckdb.DuckDBPyConnection:
    global _conn
    if _conn is None:
        _conn = duckdb.connect(DB_PATH)
    return _conn


def init_db():
    conn = get_conn()
    tables = conn.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='main'").fetchall()
    table_names = [t[0] for t in tables]
    if "fact_revenue" not in table_names:
        from synthetic.generate import generate_all
        from synthetic.seed import seed_database
        data = generate_all()
        seed_database(conn, data)
        print("Database seeded with synthetic data.")
    else:
        print(f"Database already contains {len(table_names)} tables.")


def query(sql: str, params=None):
    conn = get_conn()
    if params:
        return conn.execute(sql, params).fetchdf()
    return conn.execute(sql).fetchdf()
