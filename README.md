# AMMCO

AMMCO is a branch Excel intelligence and reporting system.

## Product goal
Each branch uploads its daily Excel workbook. The system validates and versions the upload, imports normalized facts, and provides central dashboards and detailed cross-branch reporting.

## Safety
- This repository is independent from Premieros/johna-s and Premieros/.com.
- Supabase project: yumeijsyiphzdsulsubf (AMMCO).
- Daily imports are idempotent and versioned; duplicate uploads must never double-count data.
