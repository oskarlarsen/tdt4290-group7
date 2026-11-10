import sqlite3
import sys

def inspect_db():
    db_path = "backend/data/app.db"
    print(f"Inspecting {db_path} in read-only mode...")
    try:
        # Open in read-only mode using URI
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        cursor = conn.cursor()

        cursor.execute("PRAGMA user_version;")
        version = cursor.fetchone()[0]
        print(f"User Version: {version}\n")

        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
        tables = [r[0] for r in cursor.fetchall()]

        print("--- TABLE ROW COUNTS ---")
        for table in tables:
            cursor.execute(f"SELECT COUNT(*) FROM {table};")
            count = cursor.fetchone()[0]
            print(f"{table}: {count} rows")

        print("\n--- SCHEMA ---")
        for table in tables:
            cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?;", (table,))
            row = cursor.fetchone()
            if row and row[0]:
                print(row[0] + ";\n")

        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    inspect_db()
