import pytest

from app.rules import RuleError, SafeRuleEvaluator, resolve_progress_value


def test_rule_evaluator_supports_state_event_and_homework() -> None:
    context = {
        "state": {"study": {"total_focus_minutes": 120}},
        "event": {"type": "pomodoro_completed", "focus_minutes": 60},
    }
    homework = {"a1": {"score": 5, "total_score": 5, "visible": True}}
    evaluator = SafeRuleEvaluator(context, homework.get)

    assert evaluator.evaluate(
        'state.study.total_focus_minutes >= 100 && '
        'homework("a1").score == homework("a1").total_score'
    )
    assert evaluator.evaluate('event.type == "pomodoro_completed" && event.focus_minutes >= 60')


def test_rule_evaluator_rejects_arbitrary_calls() -> None:
    evaluator = SafeRuleEvaluator({}, lambda _assignment_id: None)
    with pytest.raises(RuleError):
        evaluator.evaluate('__import__("os").system("echo unsafe")')


def test_progress_resolution_is_explicit() -> None:
    context = {"state": {"study": {"total_focus_minutes": 42}}}
    assert resolve_progress_value(context, "state.study.total_focus_minutes") == 42
    assert resolve_progress_value(context, "state.unknown") is None
