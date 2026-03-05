def seed_database(conn, data: dict):
    """Load all generated DataFrames into DuckDB tables."""
    for table_name, df in data.items():
        conn.execute(f"DROP TABLE IF EXISTS {table_name}")
        conn.register("_tmp_df", df)
        conn.execute(f"CREATE TABLE {table_name} AS SELECT * FROM _tmp_df")
        conn.unregister("_tmp_df")
        print(f"  Seeded {table_name}: {len(df)} rows")
