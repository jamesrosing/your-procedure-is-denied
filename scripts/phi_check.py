#!/usr/bin/env python3
"""Fail if any tracked text file looks like it contains real patient data.

Checks content, not file type (.gitignore handles types). Files under
synthetic/ are exempt because that is where fabricated fixtures live.

Usage: phi_check.py [paths...]   (no paths: every file tracked by git)
Exit 1 on any finding.
"""
import re
import subprocess
import sys

EXEMPT_PREFIXES = ("synthetic/", "scripts/phi_check.py", "tests/test_phi_check.py")

LABELED = r"(?i:\b{})[ \t]*[:#=]?[ \t]*"
PATTERNS = {
    "SSN": re.compile(r"\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b"),
    "labeled date of birth": re.compile(LABELED.format(r"(?:dob|date of birth|birth ?date)") + r"\d{1,4}[/-]\d{1,2}[/-]\d{1,4}"),
    "labeled MRN": re.compile(LABELED.format(r"(?:mrn|medical record (?:number|no\.?))") + r"[A-Z0-9-]{5,}"),
    "labeled member or subscriber ID": re.compile(LABELED.format(r"(?:member|subscriber|insurance)[ \t]*(?:id|number|no\.?|#)") + r"[A-Z0-9-]{6,}"),
    "labeled claim number": re.compile(LABELED.format(r"claim[ \t]*(?:id|number|no\.?|#)") + r"[A-Z0-9-]{8,}"),
    "X12 interchange header": re.compile(r"^ISA\*\d{2}\*", re.M),
    "X12 patient name segment": re.compile(r"\bNM1\*(?:IL|QC)\*1\*"),
}
# Ten digits not embedded in a longer hex string: a hash is not an NPI.
NPI_CANDIDATE = re.compile(r"(?<![0-9A-Fa-f])\d{10}(?![0-9A-Fa-f])")


def is_npi(digits: str) -> bool:
    """Luhn check with the 80840 prefix that every NPI carries."""
    total, parity = 0, 0
    for i, ch in enumerate(reversed("80840" + digits)):
        d = int(ch)
        if i % 2 == 1:
            d = d * 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


def scan(path: str, text: str):
    for name, pat in PATTERNS.items():
        for m in pat.finditer(text):
            yield name, text.count("\n", 0, m.start()) + 1
    for m in NPI_CANDIDATE.finditer(text):
        if is_npi(m.group()):
            yield "NPI (Luhn-valid 10 digits)", text.count("\n", 0, m.start()) + 1


def tracked_files():
    out = subprocess.run(["git", "ls-files", "-z"], check=True, capture_output=True).stdout
    return [p for p in out.decode().split("\0") if p]


def main(argv):
    paths = argv or tracked_files()
    findings = []
    for p in paths:
        if p.startswith(EXEMPT_PREFIXES):
            continue
        try:
            text = open(p, encoding="utf-8").read()
        except (UnicodeDecodeError, OSError):
            continue
        findings += [(p, line, name) for name, line in scan(p, text)]
    for p, line, name in findings:
        print(f"{p}:{line}: possible {name}")
    if findings:
        print(f"\n{len(findings)} possible patient-data finding(s). Remove the data or move fixtures under synthetic/.")
        return 1
    print("No patient-data patterns found.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
