Synthetic certificate PDFs
=========================

These six files are fictional test data, not real certificates or contracts.
Upload each file separately from Admin > Environmental Certificates > Upload
certificate, and enter the supplier name shown inside the PDF.

Expected extraction and status on 30 October 2026:

01-iso-14001-valid.pdf
  ISO 14001 — Valid
02-miljofyrtarn-critical.pdf
  Miljøfyrtårn — Critical (expires in 16 days)
03-gront-punkt-expiring-60d.pdf
  Grønt Punkt Norge — Expiring (60 days; orange)
04-retura-expiring-150d.pdf
  Retura — Expiring (150 days; yellow)
05-eco-driving-expired.pdf
  Eco-driving course — Expired
06-unrecognized-missing-expiry.pdf
  Unrecognized certificate — Documentation missing

The dates are fixed, so statuses will change as time passes. EMAS is listed in
the page's data model but is not currently recognized by the PDF parser; an
EMAS upload will appear as an unrecognized certificate. Uploaded PDFs are
processed and discarded; only parsed metadata is stored.
