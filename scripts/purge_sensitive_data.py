import os
import shutil
import sys

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TARGETS_TO_DELETE = [
    # Sensitive input directory containing original contracts and spreadsheets
    os.path.join(ROOT_DIR, "data"),

    # Extracted data summaries and temporary files
    os.path.join(ROOT_DIR, "data_inventory.json"),
    os.path.join(ROOT_DIR, "deep_data_summary.json"),
    os.path.join(ROOT_DIR, "pdf_summary.json"),
    os.path.join(ROOT_DIR, "extracted.txt"),
    os.path.join(ROOT_DIR, "backend", "extracted.txt"),
    os.path.join(ROOT_DIR, "test_classifier.txt"),

    # Inspection scripts used during discovery phase
    os.path.join(ROOT_DIR, "scripts", "inventory_data.py"),
    os.path.join(ROOT_DIR, "scripts", "deep_inspect.py"),
    os.path.join(ROOT_DIR, "scripts", "inspect_pdfs.py"),
    os.path.join(ROOT_DIR, "scripts", "test_pdf_gen.py"),
]

def main():
    print("=" * 70)
    print("Purging Sensitive Data and Temporary Inspection Files")
    print("=" * 70)

    deleted_count = 0
    for target in TARGETS_TO_DELETE:
        rel_path = os.path.relpath(target, ROOT_DIR)
        if os.path.isdir(target):
            try:
                shutil.rmtree(target)
                print(f"[DELETED DIRECTORY] {rel_path}")
                deleted_count += 1
            except Exception as e:
                print(f"[ERROR DELETING DIRECTORY] {rel_path}: {e}")
        elif os.path.isfile(target):
            try:
                os.remove(target)
                print(f"[DELETED FILE]      {rel_path}")
                deleted_count += 1
            except Exception as e:
                print(f"[ERROR DELETING FILE] {rel_path}: {e}")
        else:
            print(f"[SKIPPED / NOT FOUND] {rel_path}")

    print("-" * 70)
    print(f"Cleanup complete. Total targets removed: {deleted_count}")
    print("Your repository is now completely free of sensitive source data.")
    print("=" * 70)

if __name__ == "__main__":
    main()
