"""Tests for write plan data model."""
import pytest
from src.core.write_plan import WritePlan, WriteOperation, WriteResult, OpType


def test_empty_plan():
    plan = WritePlan()
    assert plan.total == 0
    assert plan.updates == 0
    assert plan.creates == 0
    assert plan.skips == 0
    assert plan.flags == 0


def test_add_update():
    plan = WritePlan()
    plan.add(WriteOperation(
        op_type=OpType.UPDATE_REPORT,
        entity_id=12345,
        folder_id="1124761700",
        client_name="כהן יעקב",
        match_key="123456789",
        properties={"תאריך הגשה": "15/03/2025"},
        old_values={"תאריך הגשה": ""},
        reason="IDOM has submission date",
    ))
    assert plan.total == 1
    assert plan.updates == 1
    assert plan.creates == 0


def test_add_create():
    plan = WritePlan()
    plan.add(WriteOperation(
        op_type=OpType.CREATE_REPORT,
        entity_id=None,
        folder_id="1144157121",
        client_name="לוי שרה",
        match_key="987654321",
        client_entity_id=99999,
        properties={"לקוח": 99999, "שנת מס": 1125575564},
        old_values={},
        reason="New report card",
    ))
    assert plan.total == 1
    assert plan.creates == 1


def test_add_client_update():
    plan = WritePlan()
    plan.add(WriteOperation(
        op_type=OpType.UPDATE_CLIENT,
        entity_id=99999,
        folder_id="557688522",
        client_name="כהן יעקב",
        match_key="123456789",
        properties={"פקיד שומה": 1099384290},
        old_values={"פקיד שומה": ""},
        reason="IDOM has פ.ש code 38",
    ))
    assert plan.total == 1
    assert plan.client_updates == 1


def test_add_flag():
    plan = WritePlan()
    plan.add(WriteOperation(
        op_type=OpType.FLAG,
        entity_id=None,
        folder_id="1144157121",
        client_name="אלמוני",
        match_key="000000000",
        properties={},
        old_values={},
        reason="Client not found",
    ))
    assert plan.flags == 1


def test_plan_summary():
    plan = WritePlan()
    plan.add(WriteOperation(
        op_type=OpType.UPDATE_REPORT, entity_id=1, folder_id="f",
        client_name="a", match_key="1", properties={"x": 1}, old_values={}, reason="",
    ))
    plan.add(WriteOperation(
        op_type=OpType.CREATE_REPORT, entity_id=None, folder_id="f",
        client_name="b", match_key="2", properties={"x": 1}, old_values={}, reason="",
    ))
    plan.add(WriteOperation(
        op_type=OpType.SKIP, entity_id=3, folder_id="f",
        client_name="c", match_key="3", properties={}, old_values={}, reason="no changes",
    ))
    plan.add(WriteOperation(
        op_type=OpType.UPDATE_CLIENT, entity_id=4, folder_id="f",
        client_name="d", match_key="4", properties={"y": 2}, old_values={}, reason="",
    ))
    summary = plan.summary()
    assert summary["total"] == 4
    assert summary["updates"] == 1
    assert summary["creates"] == 1
    assert summary["skips"] == 1
    assert summary["client_updates"] == 1


def test_operation_to_dict():
    op = WriteOperation(
        op_type=OpType.UPDATE_REPORT,
        entity_id=123,
        folder_id="f1",
        client_name="test",
        match_key="999",
        properties={"a": 1},
        old_values={"a": 0},
        reason="test reason",
    )
    d = op.to_dict()
    assert d["op_type"] == "update_report"
    assert d["entity_id"] == 123
    assert d["properties"] == {"a": 1}


def test_plan_to_json():
    plan = WritePlan()
    plan.add(WriteOperation(
        op_type=OpType.SKIP, entity_id=1, folder_id="f",
        client_name="x", match_key="1", properties={}, old_values={}, reason="noop",
    ))
    j = plan.to_json()
    assert '"skips": 1' in j


def test_write_result():
    result = WriteResult(dry_run=True)
    result.succeeded = 5
    result.failed = 1
    result.total_attempted = 6
    d = result.to_dict()
    assert d["dry_run"] is True
    assert d["succeeded"] == 5
    assert d["failed"] == 1
