import mimetypes

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def test_javascript_and_css_are_not_served_as_plain_text() -> None:
    """StaticFiles 依赖 mimetypes 注册表；.js 回退成 text/plain 会让浏览器拒绝 ES module。"""
    for suffix in (".js", ".mjs", ".css", ".svg"):
        guessed = mimetypes.guess_type(f"index{suffix}")[0] or ""
        assert not guessed.startswith("text/plain"), f"{suffix} 被识别为 {guessed}"


def test_toolbox_bundle_is_served_with_a_javascript_content_type(tmp_path) -> None:
    static_dir = tmp_path / "toolbox"
    assets_dir = static_dir / "assets"
    assets_dir.mkdir(parents=True)
    (static_dir / "index.html").write_text(
        '<!doctype html><script type="module" src="/toolbox/assets/index.js"></script>',
        encoding="utf-8",
    )
    (assets_dir / "index.js").write_text("export const ready = true\n", encoding="utf-8")
    (assets_dir / "index.css").write_text("body{margin:0}\n", encoding="utf-8")

    app = create_app(Settings(toolbox_static_dir=static_dir))
    with TestClient(app) as client:
        script = client.get("/toolbox/assets/index.js")
        style = client.get("/toolbox/assets/index.css")

    assert script.status_code == 200
    assert "javascript" in script.headers["content-type"]
    assert style.status_code == 200
    assert style.headers["content-type"].startswith("text/css")