import ast
import re
from collections.abc import Callable, Mapping
from typing import Any


class RuleError(ValueError):
    pass


def normalize_expression(expression: str) -> str:
    normalized = expression.replace("&&", " and ").replace("||", " or ")
    normalized = re.sub(r"!(?!=)", " not ", normalized)
    normalized = re.sub(r"\btrue\b", "True", normalized, flags=re.IGNORECASE)
    return re.sub(r"\bfalse\b", "False", normalized, flags=re.IGNORECASE).strip()


class SafeRuleEvaluator:
    def __init__(
        self,
        context: Mapping[str, Any],
        homework_lookup: Callable[[str], Mapping[str, Any] | None],
    ) -> None:
        self.context = context
        self.homework_lookup = homework_lookup

    def evaluate(self, expression: str) -> bool:
        if not expression.strip():
            return False
        try:
            tree = ast.parse(normalize_expression(expression), mode="eval")
            return bool(self._visit(tree.body))
        except (SyntaxError, TypeError, ValueError, ZeroDivisionError) as exc:
            raise RuleError(str(exc)) from exc

    def _visit(self, node: ast.AST) -> Any:
        if isinstance(node, ast.Constant):
            if isinstance(node.value, (str, int, float, bool, type(None))):
                return node.value
            raise RuleError("不支持的常量")
        if isinstance(node, ast.Name):
            if node.id in self.context:
                return self.context[node.id]
            raise RuleError(f"未知变量：{node.id}")
        if isinstance(node, ast.Attribute):
            value = self._visit(node.value)
            if isinstance(value, Mapping) and node.attr in value:
                return value[node.attr]
            raise RuleError(f"未知属性：{node.attr}")
        if isinstance(node, ast.BoolOp):
            values = [bool(self._visit(item)) for item in node.values]
            if isinstance(node.op, ast.And):
                return all(values)
            if isinstance(node.op, ast.Or):
                return any(values)
        if isinstance(node, ast.UnaryOp):
            value = self._visit(node.operand)
            if isinstance(node.op, ast.Not):
                return not bool(value)
            if isinstance(node.op, ast.USub) and isinstance(value, (int, float)):
                return -value
        if isinstance(node, ast.BinOp):
            left = self._visit(node.left)
            right = self._visit(node.right)
            if not isinstance(left, (int, float)) or not isinstance(right, (int, float)):
                raise RuleError("算术运算仅支持数字")
            if isinstance(node.op, ast.Add):
                return left + right
            if isinstance(node.op, ast.Sub):
                return left - right
            if isinstance(node.op, ast.Mult):
                return left * right
            if isinstance(node.op, ast.Div):
                return left / right
        if isinstance(node, ast.Compare):
            left = self._visit(node.left)
            for operator, comparator in zip(node.ops, node.comparators, strict=True):
                right = self._visit(comparator)
                if not self._compare(operator, left, right):
                    return False
                left = right
            return True
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name) or node.func.id != "homework":
                raise RuleError("仅允许调用 homework()")
            if len(node.args) != 1 or node.keywords:
                raise RuleError("homework() 需要一个 assignmentId")
            assignment_id = self._visit(node.args[0])
            if not isinstance(assignment_id, str):
                raise RuleError("assignmentId 必须是字符串")
            return self.homework_lookup(assignment_id) or {
                "score": None,
                "total_score": None,
                "visible": False,
            }
        raise RuleError(f"不支持的表达式节点：{node.__class__.__name__}")

    @staticmethod
    def _compare(operator: ast.cmpop, left: Any, right: Any) -> bool:
        if isinstance(operator, ast.Eq):
            return left == right
        if isinstance(operator, ast.NotEq):
            return left != right
        if isinstance(operator, ast.Gt):
            return left > right
        if isinstance(operator, ast.GtE):
            return left >= right
        if isinstance(operator, ast.Lt):
            return left < right
        if isinstance(operator, ast.LtE):
            return left <= right
        raise RuleError("不支持的比较运算符")


def resolve_progress_value(context: Mapping[str, Any], dotted_key: str | None) -> float | None:
    if not dotted_key:
        return None
    value: Any = context
    for part in dotted_key.split("."):
        if not isinstance(value, Mapping) or part not in value:
            return None
        value = value[part]
    return float(value) if isinstance(value, (int, float)) else None

