import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "scripts"))
import phi_check


def names(text):
    return sorted({n for n, _ in phi_check.scan("x.txt", text)})


def test_clean_prose_passes():
    assert names("CARC 50: not deemed a medical necessity. 3.2 million denied in 2023.") == []


def test_ssn():
    assert names("SSN 123-45-6789") == ["SSN"]


def test_labeled_dob_and_mrn():
    assert "labeled date of birth" in names("DOB: 04/12/1961")
    assert "labeled MRN" in names("MRN 00458213")


def test_member_and_claim_ids():
    assert "labeled member or subscriber ID" in names("Member ID: W123456789")
    assert "labeled claim number" in names("Claim #: 2026AB12345")


def test_npi_luhn():
    # 1234567893 is a published example NPI that passes the Luhn check.
    assert names("NPI 1234567893") == ["NPI (Luhn-valid 10 digits)"]
    assert names("phone 9497067874") == []


def test_x12_segments():
    assert "X12 interchange header" in names("ISA*00*          *00*")
    assert "X12 patient name segment" in names("NM1*IL*1*DOE*JANE")
