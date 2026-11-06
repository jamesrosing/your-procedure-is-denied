#!/usr/bin/env bash
# Rebuild manuscript.pdf and manuscript.docx from manuscript.md (pandoc 3.x, xelatex, TeX Gyre Pagella).
set -euo pipefail
cd "$(dirname "$0")"
pandoc manuscript.md -f markdown-tex_math_dollars+autolink_bare_uris -o manuscript.pdf \
  --pdf-engine=xelatex -H header.tex --number-sections \
  -V geometry:margin=1in -V papersize=letter -V fontsize=10pt -V mainfont="TeX Gyre Pagella" \
  -V linkcolor=NavyBlue -V urlcolor=NavyBlue -V colorlinks=true
pandoc manuscript.md -f markdown-tex_math_dollars+autolink_bare_uris -o manuscript.docx --number-sections
