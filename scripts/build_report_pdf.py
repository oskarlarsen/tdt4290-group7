"""
Build PDF Report from HTML Specification
Target: Trondheim kommune - Environmental Monitoring Project
Author: NTNU CDP Team
"""

import os
import sys
import subprocess
import shutil

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML_FILE = os.path.join(ROOT_DIR, "docs", "Supplier_Onboarding_Specification_Trondheim_Kommune.html")
PDF_FILE = os.path.join(ROOT_DIR, "docs", "Supplier_Onboarding_Specification_Trondheim_Kommune.pdf")

def find_browser():
    # Common Windows paths for Edge and Chrome
    candidates = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"),
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
    ]
    for c in candidates:
        if os.path.exists(c):
            return c

    # System PATH lookups (Windows, Linux, macOS)
    for name in ["msedge", "microsoft-edge", "chrome", "google-chrome", "chromium", "chromium-browser"]:
        found = shutil.which(name)
        if found:
            return found

    return None

def main():
    print("=" * 70)
    print("Trondheim Kommune - Environmental Monitoring Project")
    print("Generating Supplier Onboarding Technical Specification PDF...")
    print("=" * 70)

    if not os.path.exists(HTML_FILE):
        print(f"Error: HTML specification file not found at: {HTML_FILE}")
        sys.exit(1)

    browser = find_browser()
    if not browser:
        print("Warning: Neither Microsoft Edge nor Google Chrome executable could be located automatically.")
        print("You can manually open the following HTML file in any modern web browser:")
        print(f"  {HTML_FILE}")
        print("And use 'Print -> Save as PDF' (Ctrl + P) with background graphics enabled.")
        sys.exit(1)

    print(f"Using browser rendering engine: {browser}")
    print(f"Input HTML:  {HTML_FILE}")
    print(f"Output PDF:  {PDF_FILE}")

    # Headless print-to-pdf command
    cmd = [
        browser,
        "--headless",
        "--disable-gpu",
        "--run-all-compositor-stages-before-draw",
        f"--print-to-pdf={PDF_FILE}",
        "--no-pdf-header-footer",
        HTML_FILE
    ]

    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        if os.path.exists(PDF_FILE) and os.path.getsize(PDF_FILE) > 0:
            size_kb = os.path.getsize(PDF_FILE) / 1024.0
            print("-" * 70)
            print(f"SUCCESS! PDF successfully generated: {PDF_FILE}")
            print(f"File size: {size_kb:.2f} KB ({size_kb / 1024.0:.2f} MB)")
            print("-" * 70)
        else:
            print("Error: Command executed but output PDF is empty or missing.")
            sys.exit(1)
    except subprocess.CalledProcessError as e:
        print(f"Error executing browser command: {e}")
        print(f"Output: {e.output}")
        print(f"Stderr: {e.stderr}")
        sys.exit(1)
    except Exception as ex:
        print(f"Unexpected error: {ex}")
        sys.exit(1)

if __name__ == "__main__":
    main()
