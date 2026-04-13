"""Tests for Summit taxonomy lookups."""
import pytest
from src.core.taxonomy import (
    resolve_tax_year,
    resolve_status,
    resolve_pkid_shoma,
    resolve_sug_tik,
    get_status_label,
    STATUS_COMPLETED_ID,
    STATUS_PRE_WORK_ID,
)


def test_resolve_tax_year_2024():
    assert resolve_tax_year(2024) == 1125575564


def test_resolve_tax_year_2025():
    assert resolve_tax_year(2025) == 1125583827


def test_resolve_tax_year_2026():
    assert resolve_tax_year(2026) == 1125583873


def test_resolve_tax_year_unknown():
    assert resolve_tax_year(2019) is None


def test_resolve_status_completed():
    assert resolve_status(has_submission=True) == STATUS_COMPLETED_ID


def test_resolve_status_no_submission():
    assert resolve_status(has_submission=False) == STATUS_PRE_WORK_ID


def test_resolve_pkid_shoma_by_code():
    result = resolve_pkid_shoma("38")
    assert result is not None
    assert result["id"] == 1099384290
    assert "תל אביב" in result["label"]


def test_resolve_pkid_shoma_by_code_51():
    result = resolve_pkid_shoma("51")
    assert result is not None
    assert result["id"] == 1099384296


def test_resolve_pkid_shoma_unknown():
    assert resolve_pkid_shoma("999") is None


def test_resolve_pkid_shoma_empty():
    assert resolve_pkid_shoma("") is None


def test_resolve_sug_tik():
    result = resolve_sug_tik("7")
    assert result is not None
    assert result["id"] == 1099349748


def test_resolve_sug_tik_10():
    result = resolve_sug_tik("10")
    assert result is not None
    assert result["id"] == 1099349795


def test_resolve_sug_tik_unknown():
    assert resolve_sug_tik("999") is None


def test_get_status_label():
    assert "הושלם" in get_status_label(STATUS_COMPLETED_ID)
    assert "טרום" in get_status_label(STATUS_PRE_WORK_ID)
