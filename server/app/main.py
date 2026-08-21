import base64
import binascii
import secrets
from collections.abc import Generator
from contextlib import asynccontextmanager
from datetime import timedelta
from pathlib import Path
from typing import Annotated, Any
from urllib.parse import parse_qs, urlparse

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import Settings, get_settings
from .database import Base, build_engine, build_session_factory
from .models import (
    Achievement,
    AchievementUnlock,
    AdminAccount,
    Announcement,
    Course,
    CourseMembership,
    FocusInterval,
    User,
    UserPreference,
    utcnow,
)
from .music import MusicLibrary, cover_response, stream_response
from .schemas import (
    AdminAchievementCreate,
    AdminAchievementGrant,
    AdminAnnouncementCreate,
    AdminCourseCreate,
    AdminCourseUpdate,
    AdminLoginRequest,
    AdminStudentUpdate,
    BootstrapRequest,
    FocusRequest,
    FocusStopRequest,
    HomeworkSyncRequest,
    PreferencesUpdate,
    ProfileUpdate,
)
from .security import create_admin_token, verify_admin_token, verify_password
from .services import (
    bootstrap_payload,
    delete_achievement,
    delete_course,
    ensure_bootstrap_data,
    ensure_membership,
    evaluate_achievements,
    get_course,
    newly_unlocked_views,
    preference_view,
    require_available_course,
    require_existing_user,
    stop_focus,
    study_summary,
    sync_homework,
    touch_focus,
)


def create_app(settings: Settings | None = None) -> FastAPI:
    active_settings = settings or get_settings()
    engine = build_engine(active_settings)
    session_factory = build_session_factory(engine)
    library = MusicLibrary(active_settings)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        Path(active_settings.assets_dir).mkdir(parents=True, exist_ok=True)
        Path(active_settings.cover_cache_dir).mkdir(parents=True, exist_ok=True)
        Path(active_settings.uploads_dir).mkdir(parents=True, exist_ok=True)
        if active_settings.auto_create_tables:
            Base.metadata.create_all(engine)
        with session_factory() as db:
            ensure_bootstrap_data(db, active_settings)
        library.scan()
        yield
        engine.dispose()

    app = FastAPI(
        title=active_settings.app_name,
        version=active_settings.app_version,
        lifespan=lifespan,
    )
    app.state.settings = active_settings
    app.state.session_factory = session_factory
    app.state.music_library = library
    app.add_middleware(
        CORSMiddleware,
        allow_origins=active_settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.mount(
        "/assets",
        StaticFiles(directory=str(active_settings.assets_dir), check_dir=False),
        name="assets",
    )
    app.mount(
        "/uploads",
        StaticFiles(directory=str(active_settings.uploads_dir), check_dir=False),
        name="uploads",
    )
    app.mount(
        "/toolbox",
        StaticFiles(
            directory=str(active_settings.toolbox_static_dir),
            html=True,
            check_dir=False,
        ),
        name="toolbox",
    )
    app.mount(
        "/admin",
        StaticFiles(
            directory=str(active_settings.admin_static_dir),
            html=True,
            check_dir=False,
        ),
        name="admin",
    )
    app.mount(
        "/updates",
        StaticFiles(directory=str(active_settings.updates_dir), check_dir=False),
        name="updates",
    )

    def get_db() -> Generator[Session, None, None]:
        with session_factory() as db:
            yield db

    Db = Annotated[Session, Depends(get_db)]

    def require_admin(
        authorization: Annotated[str | None, Header()] = None,
    ) -> str:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "需要管理员登录")
        username = verify_admin_token(
            authorization.removeprefix("Bearer ").strip(), active_settings.secret_key
        )
        if username is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "管理员会话已失效")
        return username

    Admin = Annotated[str, Depends(require_admin)]

    @app.get("/", response_class=HTMLResponse)
    def landing_page() -> str:
        browser_packages = sorted(Path(active_settings.updates_dir).glob("DBKangBrowser*.exe"))
        if browser_packages:
            package = browser_packages[-1]
            browser_action = (
                f'<a class="button" href="/updates/{package.name}">'
                "下载 Windows x64 客户端</a>"
            )
        else:
            browser_action = '<span class="unavailable">Windows 客户端尚未随当前版本发布</span>'
        page = """<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <title>DBKang Toolbox · 阿康工具箱</title>
  <style>
    body { margin: 0; font: 15px system-ui; color: #182338; background: #f6f8fb; }
    main { max-width: 900px; margin: 64px auto; padding: 0 24px; }
    header { padding-bottom: 28px; border-bottom: 1px solid #dfe5ed; }
    h1 { margin: 0 0 8px; font-size: 34px; }
    header p, small { color: #64748b; }
    .downloads { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 24px 0; }
    article { padding: 24px; border: 1px solid #dfe5ed; border-radius: 8px; background: #fff; }
    article h2 { margin: 0 0 8px; font-size: 18px; }
    article p { min-height: 44px; color: #64748b; line-height: 1.6; }
    .button { display: inline-block; padding: 9px 14px; border-radius: 5px; }
    .button { color: #fff; text-decoration: none; background: #2f6fe4; }
    .unavailable { color: #7b8798; }
    footer { display: flex; gap: 18px; padding-top: 12px; }
    footer a { color: #2f6fe4; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>DBKang Toolbox</h1>
      <p>阿康工具箱 · 版本 __VERSION__</p>
      <small>学生端会嵌入已启用的学习通课程内容区，不需要从这里单独登录。</small>
    </header>
    <section class="downloads">
      <article>
        <h2>阿康浏览器</h2>
        <p>面向普通学生的 Windows 10/11 x64 便携客户端。</p>
        __BROWSER_ACTION__
      </article>
      <article>
        <h2>高级用户 Userscript</h2>
        <p>用于已安装兼容脚本管理器的普通 Chromium 浏览器。</p>
        <a class="button" href="/updates/DBKangToolbox.user.js">安装 Userscript</a>
      </article>
    </section>
    <footer>
      <a href="/admin/">管理端</a>
      <a href="/health">服务状态</a>
      <a href="/docs">API 文档</a>
    </footer>
  </main>
</body>
</html>"""
        return page.replace("__VERSION__", active_settings.app_version).replace(
            "__BROWSER_ACTION__", browser_action
        )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "version": active_settings.app_version}

    @app.get("/api/v1/public/courses/{course_id}")
    def course_access(course_id: str, db: Db) -> dict[str, str]:
        course = get_course(db, course_id)
        if course is None or not course.enabled:
            return {"courseId": course_id, "status": "disabled"}
        return {"courseId": course_id, "status": "available"}

    @app.post("/api/v1/student/bootstrap")
    def bootstrap(request: BootstrapRequest, db: Db) -> dict[str, Any]:
        return bootstrap_payload(db, request, active_settings)

    def focus_response(
        db: Session,
        user: User,
        course: Course,
        unlocked: list[Achievement],
        request: FocusRequest,
    ) -> dict[str, Any]:
        return {
            "accepted": True,
            "connected": True,
            "summary": study_summary(
                db,
                user,
                course,
                active_settings,
                chaoxing_class_id=request.class_id,
            ),
            "newlyUnlocked": newly_unlocked_views(db, unlocked, course, user),
        }

    @app.post("/api/v1/student/focus/start")
    def focus_start(request: FocusRequest, db: Db) -> dict[str, Any]:
        user, course = touch_focus(db, request, active_settings, count_open=True)
        unlocked = (
            evaluate_achievements(
                db, user, course, active_settings, {"type": "focus_started"}
            )
            if request.role == "student"
            else []
        )
        db.commit()
        return focus_response(db, user, course, unlocked, request)

    @app.post("/api/v1/student/focus/heartbeat")
    def focus_heartbeat(request: FocusRequest, db: Db) -> dict[str, Any]:
        user, course = touch_focus(db, request, active_settings)
        unlocked = (
            evaluate_achievements(
                db,
                user,
                course,
                active_settings,
                {"type": "focus_heartbeat"},
            )
            if request.role == "student"
            else []
        )
        db.commit()
        return focus_response(db, user, course, unlocked, request)

    @app.post("/api/v1/student/focus/pause")
    def focus_pause(request: FocusRequest, db: Db) -> dict[str, Any]:
        user, course, unlocked = stop_focus(
            db, request, active_settings, completed=False
        )
        return focus_response(db, user, course, unlocked, request)

    @app.post("/api/v1/student/focus/stop")
    def focus_stop(request: FocusStopRequest, db: Db) -> dict[str, Any]:
        user, course, unlocked = stop_focus(
            db, request, active_settings, completed=request.completed
        )
        return focus_response(db, user, course, unlocked, request)

    @app.put("/api/v1/student/preferences")
    def update_preferences(request: PreferencesUpdate, db: Db) -> dict[str, Any]:
        user = db.scalar(select(User).where(User.student_id == request.student_id))
        if user is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "用户不存在")
        preferences = db.get(UserPreference, user.id)
        if preferences is None:
            preferences = UserPreference(user_id=user.id)
            db.add(preferences)
        preferences.focus_minutes = request.focus_minutes
        preferences.rest_minutes = request.rest_minutes
        preferences.rounds = request.rounds
        preferences.music_volume = request.music_volume
        preferences.ambience_volume = request.ambience_volume
        preferences.ambience_type = request.ambience_type
        preferences.playback_mode = request.playback_mode
        preferences.last_playlist_id = request.last_playlist_id
        db.commit()
        return preference_view(preferences)

    @app.put("/api/v1/student/profile")
    def update_profile(request: ProfileUpdate, db: Db) -> dict[str, Any]:
        user = db.scalar(select(User).where(User.student_id == request.student_id))
        if user is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "请先打开一次阿康工具箱完成注册")
        if user.status == "disabled":
            reason = user.disabled_reason or "未提供原因"
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"当前账号暂时无法使用阿康工具箱。原因：{reason}",
            )

        nickname = request.nickname.strip()
        if not nickname:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "昵称不能为空")
        user.nickname = nickname

        if request.avatar_data_url:
            prefix = "data:image/webp;base64,"
            if not request.avatar_data_url.startswith(prefix):
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "头像必须是 WebP 图片")
            try:
                image = base64.b64decode(
                    request.avatar_data_url.removeprefix(prefix), validate=True
                )
            except (binascii.Error, ValueError) as error:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY, "头像数据无效"
                ) from error
            if len(image) > 1_000_000:
                raise HTTPException(
                    status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "头像文件不能超过 1 MB"
                )
            if len(image) < 12 or image[:4] != b"RIFF" or image[8:12] != b"WEBP":
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "头像文件格式无效")

            avatar_dir = Path(active_settings.uploads_dir) / "avatars"
            avatar_dir.mkdir(parents=True, exist_ok=True)
            filename = f"user-{user.id}-{secrets.token_hex(6)}.webp"
            target = avatar_dir / filename
            target.write_bytes(image)
            previous_path = user.avatar_path
            user.avatar_path = f"/uploads/avatars/{filename}"
            if previous_path and previous_path.startswith("/uploads/avatars/"):
                previous_file = avatar_dir / Path(previous_path).name
                if previous_file != target:
                    previous_file.unlink(missing_ok=True)

        db.commit()
        return {
            "role": request.role,
            "studentId": user.student_id,
            "realName": user.real_name,
            "nickname": user.nickname,
            "avatarUrl": user.avatar_path,
            "grade": user.grade if request.role == "student" else None,
            "classNumber": user.class_number if request.role == "student" else None,
            "status": user.status,
            "disabledReason": user.disabled_reason,
        }

    @app.post("/api/v1/student/homework/sync")
    def homework_sync(request: HomeworkSyncRequest, db: Db) -> dict[str, Any]:
        course = require_available_course(db, request.course_id)
        user = require_existing_user(db, request)
        if request.role == "teacher":
            return {"synced": 0, "newlyUnlocked": []}
        ensure_membership(db, user, course, request.class_id)
        sync_homework(
            db,
            user,
            course,
            request.assignments,
            complete_snapshot=request.complete_snapshot,
        )
        unlocked = evaluate_achievements(
            db,
            user,
            course,
            active_settings,
            {"type": "homework_synced", "assignment_count": len(request.assignments)},
        )
        db.commit()
        return {
            "synced": len(request.assignments),
            "newlyUnlocked": newly_unlocked_views(db, unlocked, course, user),
        }

    @app.get("/api/v1/music/playlists")
    def music_playlists() -> list[dict[str, object]]:
        return library.playlists

    @app.get("/api/v1/music/tracks/{track_id}/cover")
    def music_cover(track_id: str) -> Response:
        return cover_response(library.get_track(track_id))

    @app.get("/api/v1/music/tracks/{track_id}/stream")
    def music_stream(track_id: str, request: Request) -> Response:
        return stream_response(library.get_track(track_id), request)

    @app.post("/api/v1/admin/auth/login")
    def admin_login(request: AdminLoginRequest, db: Db) -> dict[str, Any]:
        admin = db.scalar(select(AdminAccount).where(AdminAccount.username == request.username))
        if admin is None or not verify_password(request.password, admin.password_hash):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "管理员账号或密码错误")
        token, expires_at = create_admin_token(
            admin.username,
            active_settings.secret_key,
            active_settings.admin_token_minutes,
        )
        return {"accessToken": token, "tokenType": "bearer", "expiresAt": expires_at}

    @app.get("/api/v1/admin/dashboard")
    def admin_dashboard(_admin: Admin, db: Db) -> dict[str, int]:
        cutoff = utcnow() - timedelta(seconds=active_settings.focus_ttl_seconds)
        return {
            "courseCount": db.scalar(select(func.count(Course.id))) or 0,
            "studentCount": db.scalar(
                select(func.count(func.distinct(CourseMembership.user_id)))
            )
            or 0,
            "focusingStudentCount": db.scalar(
                select(func.count(func.distinct(FocusInterval.user_id)))
                .join(
                    CourseMembership,
                    (CourseMembership.user_id == FocusInterval.user_id)
                    & (CourseMembership.course_id == FocusInterval.course_id),
                )
                .where(
                    FocusInterval.active.is_(True),
                    FocusInterval.last_heartbeat_at >= cutoff,
                )
            )
            or 0,
            "achievementCount": db.scalar(select(func.count(Achievement.id))) or 0,
            "announcementCount": db.scalar(select(func.count(Announcement.id))) or 0,
        }

    @app.get("/api/v1/admin/courses")
    def admin_courses(_admin: Admin, db: Db) -> list[dict[str, Any]]:
        courses = db.scalars(select(Course).order_by(Course.created_at.desc())).all()
        return [
            {
                "id": course.id,
                "courseId": course.chaoxing_course_id,
                "name": course.name,
                "enabled": course.enabled,
                "memberCount": db.scalar(
                    select(func.count(CourseMembership.id)).where(
                        CourseMembership.course_id == course.id
                    )
                )
                or 0,
            }
            for course in courses
        ]

    @app.post("/api/v1/admin/courses", status_code=status.HTTP_201_CREATED)
    def admin_create_course(request: AdminCourseCreate, _admin: Admin, db: Db) -> dict[str, Any]:
        external_id = parse_course_id(request.course_url_or_id)
        if get_course(db, external_id):
            raise HTTPException(status.HTTP_409_CONFLICT, "该 courseId 已存在")
        course = Course(
            chaoxing_course_id=external_id,
            name=request.name or f"课程 {external_id}",
            enabled=True,
        )
        db.add(course)
        db.commit()
        return {
            "id": course.id,
            "courseId": course.chaoxing_course_id,
            "name": course.name,
            "enabled": course.enabled,
        }

    @app.patch("/api/v1/admin/courses/{course_pk}")
    def admin_update_course(
        course_pk: int, request: AdminCourseUpdate, _admin: Admin, db: Db
    ) -> dict[str, Any]:
        course = db.get(Course, course_pk)
        if course is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "课程不存在")
        if request.name is not None:
            course.name = request.name
        if request.enabled is not None:
            course.enabled = request.enabled
        db.commit()
        return {
            "id": course.id,
            "courseId": course.chaoxing_course_id,
            "name": course.name,
            "enabled": course.enabled,
        }

    @app.delete("/api/v1/admin/courses/{course_pk}", status_code=204)
    def admin_delete_course(course_pk: int, _admin: Admin, db: Db) -> Response:
        course = db.get(Course, course_pk)
        if course is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "课程不存在")
        delete_course(db, course)
        return Response(status_code=204)

    @app.get("/api/v1/admin/courses/{course_pk}/achievements")
    def admin_achievements(course_pk: int, _admin: Admin, db: Db) -> list[dict[str, Any]]:
        items = db.scalars(
            select(Achievement)
            .where(Achievement.course_id == course_pk)
            .order_by(Achievement.sort_order, Achievement.id)
        ).all()
        return [admin_achievement_view(item) for item in items]

    @app.post(
        "/api/v1/admin/courses/{course_pk}/achievements",
        status_code=status.HTTP_201_CREATED,
    )
    def admin_create_achievement(
        course_pk: int,
        request: AdminAchievementCreate,
        _admin: Admin,
        db: Db,
    ) -> dict[str, Any]:
        course = db.get(Course, course_pk)
        if course is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "课程不存在")
        if request.trigger_type == "automatic" and not request.rule_expression:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "自动成就必须提供规则表达式")
        achievement = Achievement(
            course_id=course.id,
            name=request.name,
            description=request.description,
            tier=request.tier,
            hidden=request.hidden,
            trigger_type=request.trigger_type,
            rule_expression=request.rule_expression,
            progress_key=request.progress_key,
            progress_target=request.progress_target,
            sort_order=request.sort_order,
        )
        db.add(achievement)
        db.flush()
        if achievement.trigger_type == "automatic":
            members = db.scalars(
                select(User)
                .join(CourseMembership, CourseMembership.user_id == User.id)
                .where(CourseMembership.course_id == course.id)
            ).all()
            for user in members:
                evaluate_achievements(db, user, course, active_settings, {"type": "rule_created"})
        db.commit()
        return admin_achievement_view(achievement)

    @app.put("/api/v1/admin/achievements/{achievement_id}")
    def admin_update_achievement(
        achievement_id: int,
        request: AdminAchievementCreate,
        _admin: Admin,
        db: Db,
    ) -> dict[str, Any]:
        achievement = db.get(Achievement, achievement_id)
        if achievement is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "成就不存在")
        if request.trigger_type == "automatic" and not request.rule_expression:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "自动成就必须提供规则表达式")
        achievement.name = request.name
        achievement.description = request.description
        achievement.tier = request.tier
        achievement.hidden = request.hidden
        achievement.trigger_type = request.trigger_type
        achievement.rule_expression = request.rule_expression
        achievement.progress_key = request.progress_key
        achievement.progress_target = request.progress_target
        achievement.sort_order = request.sort_order
        db.flush()

        if achievement.trigger_type == "automatic":
            course = db.get(Course, achievement.course_id)
            if course is not None:
                members = db.scalars(
                    select(User)
                    .join(CourseMembership, CourseMembership.user_id == User.id)
                    .where(CourseMembership.course_id == course.id)
                ).all()
                for user in members:
                    evaluate_achievements(
                        db, user, course, active_settings, {"type": "rule_updated"}
                    )
        db.commit()
        return admin_achievement_view(achievement)

    @app.post("/api/v1/admin/courses/{source_course_pk}/achievements/copy-to/{target_course_pk}")
    def admin_copy_achievements(
        source_course_pk: int,
        target_course_pk: int,
        _admin: Admin,
        db: Db,
    ) -> dict[str, int]:
        source = db.get(Course, source_course_pk)
        target = db.get(Course, target_course_pk)
        if source is None or target is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "来源课程或目标课程不存在")
        items = db.scalars(
            select(Achievement)
            .where(Achievement.course_id == source.id)
            .order_by(Achievement.sort_order, Achievement.id)
        ).all()
        for item in items:
            db.add(
                Achievement(
                    course_id=target.id,
                    name=item.name,
                    description=item.description,
                    icon_path=item.icon_path,
                    tier=item.tier,
                    hidden=item.hidden,
                    trigger_type=item.trigger_type,
                    rule_expression=item.rule_expression,
                    progress_key=item.progress_key,
                    progress_target=item.progress_target,
                    sort_order=item.sort_order,
                )
            )
        db.flush()
        members = db.scalars(
            select(User)
            .join(CourseMembership, CourseMembership.user_id == User.id)
            .where(CourseMembership.course_id == target.id)
        ).all()
        for user in members:
            evaluate_achievements(
                db, user, target, active_settings, {"type": "rules_copied"}
            )
        db.commit()
        return {"copied": len(items)}

    @app.delete("/api/v1/admin/achievements/{achievement_id}", status_code=204)
    def admin_delete_achievement(
        achievement_id: int, _admin: Admin, db: Db
    ) -> Response:
        achievement = db.get(Achievement, achievement_id)
        if achievement is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "成就不存在")
        delete_achievement(db, achievement)
        return Response(status_code=204)

    @app.post("/api/v1/admin/achievements/{achievement_id}/grant")
    def admin_grant_achievement(
        achievement_id: int,
        request: AdminAchievementGrant,
        _admin: Admin,
        db: Db,
    ) -> dict[str, int]:
        achievement = db.get(Achievement, achievement_id)
        if achievement is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "成就不存在")
        statement = (
            select(User)
            .join(CourseMembership, CourseMembership.user_id == User.id)
            .where(CourseMembership.course_id == achievement.course_id)
            .distinct()
        )
        if request.student_ids:
            statement = statement.where(User.student_id.in_(request.student_ids))
        elif request.all_course_members:
            pass
        elif request.class_id:
            statement = statement.where(
                CourseMembership.chaoxing_class_id == request.class_id,
            )
        else:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "请选择学号、班级或当前课程全部成员",
            )
        users = db.scalars(statement).all()
        affected = 0
        for user in users:
            unlock = db.scalar(
                select(AchievementUnlock).where(
                    AchievementUnlock.achievement_id == achievement.id,
                    AchievementUnlock.user_id == user.id,
                )
            )
            if request.grant and unlock is None:
                db.add(
                    AchievementUnlock(
                        achievement_id=achievement.id,
                        user_id=user.id,
                        source="manual",
                    )
                )
                affected += 1
            elif not request.grant and unlock is not None:
                db.delete(unlock)
                affected += 1
        db.commit()
        return {"affected": affected}

    @app.get("/api/v1/admin/courses/{course_pk}/announcements")
    def admin_announcements(course_pk: int, _admin: Admin, db: Db) -> list[dict[str, Any]]:
        items = db.scalars(
            select(Announcement)
            .where(Announcement.course_id == course_pk)
            .order_by(Announcement.sort_order, Announcement.id)
        ).all()
        return [announcement_view(item) for item in items]

    @app.post(
        "/api/v1/admin/courses/{course_pk}/announcements",
        status_code=status.HTTP_201_CREATED,
    )
    def admin_create_announcement(
        course_pk: int,
        request: AdminAnnouncementCreate,
        _admin: Admin,
        db: Db,
    ) -> dict[str, Any]:
        if db.get(Course, course_pk) is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "课程不存在")
        item = Announcement(
            course_id=course_pk,
            title=request.title,
            content=request.content,
            sort_order=request.order,
        )
        db.add(item)
        db.commit()
        return announcement_view(item)

    @app.put("/api/v1/admin/announcements/{announcement_id}")
    def admin_update_announcement(
        announcement_id: int,
        request: AdminAnnouncementCreate,
        _admin: Admin,
        db: Db,
    ) -> dict[str, Any]:
        item = db.get(Announcement, announcement_id)
        if item is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "公告不存在")
        item.title = request.title
        item.content = request.content
        item.sort_order = request.order
        db.commit()
        return announcement_view(item)

    @app.delete("/api/v1/admin/announcements/{announcement_id}", status_code=204)
    def admin_delete_announcement(
        announcement_id: int, _admin: Admin, db: Db
    ) -> Response:
        item = db.get(Announcement, announcement_id)
        if item is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "公告不存在")
        db.delete(item)
        db.commit()
        return Response(status_code=204)

    @app.get("/api/v1/admin/students")
    def admin_students(
        _admin: Admin,
        db: Db,
        course_id: int | None = None,
        query: str | None = None,
        grade: int | None = None,
        class_number: int | None = None,
    ) -> list[dict[str, Any]]:
        selected_course = db.get(Course, course_id) if course_id is not None else None
        statement = select(User).join(CourseMembership).distinct()
        if course_id is not None:
            statement = statement.where(CourseMembership.course_id == course_id)
        if query:
            pattern = f"%{query}%"
            statement = statement.where(
                User.student_id.like(pattern)
                | User.real_name.like(pattern)
                | User.nickname.like(pattern)
            )
        if grade is not None:
            statement = statement.where(User.grade == grade)
        if class_number is not None:
            statement = statement.where(User.class_number == class_number)
        users = db.scalars(statement.order_by(User.student_id)).all()
        result: list[dict[str, Any]] = []
        for user in users:
            membership = (
                db.scalar(
                    select(CourseMembership).where(
                        CourseMembership.user_id == user.id,
                        CourseMembership.course_id == selected_course.id,
                    )
                )
                if selected_course is not None
                else None
            )
            summary = (
                study_summary(db, user, selected_course, active_settings)
                if selected_course is not None
                else None
            )
            achievement_count = 0
            if selected_course is not None:
                achievement_count = db.scalar(
                    select(func.count(AchievementUnlock.id))
                    .join(Achievement, Achievement.id == AchievementUnlock.achievement_id)
                    .where(
                        AchievementUnlock.user_id == user.id,
                        Achievement.course_id == selected_course.id,
                    )
                ) or 0
            result.append({
                "studentId": user.student_id,
                "realName": user.real_name,
                "nickname": user.nickname,
                "avatarUrl": user.avatar_path,
                "grade": user.grade,
                "classNumber": user.class_number,
                "classId": membership.chaoxing_class_id if membership else None,
                "status": user.status,
                "disabledReason": user.disabled_reason,
                "totalFocusSeconds": summary["totalFocusSeconds"] if summary else 0,
                "totalPomodoros": summary["totalPomodoros"] if summary else 0,
                "achievementCount": achievement_count,
            })
        return result

    @app.patch("/api/v1/admin/students/{student_id}")
    def admin_update_student(
        student_id: str,
        request: AdminStudentUpdate,
        _admin: Admin,
        db: Db,
    ) -> dict[str, Any]:
        user = db.scalar(select(User).where(User.student_id == student_id))
        if user is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "学生不存在")
        if request.reset_profile:
            user.nickname = user.real_name[:20]
            if user.avatar_path and user.avatar_path.startswith("/uploads/avatars/"):
                avatar = Path(active_settings.uploads_dir) / "avatars" / Path(user.avatar_path).name
                avatar.unlink(missing_ok=True)
            user.avatar_path = None
        elif request.nickname is not None:
            user.nickname = request.nickname.strip()
        if request.disabled is not None:
            user.status = "disabled" if request.disabled else "active"
            user.disabled_reason = request.disabled_reason if request.disabled else None
        db.commit()
        return {
            "studentId": user.student_id,
            "realName": user.real_name,
            "nickname": user.nickname,
            "avatarUrl": user.avatar_path,
            "grade": user.grade,
            "classNumber": user.class_number,
            "status": user.status,
            "disabledReason": user.disabled_reason,
        }

    return app


def parse_course_id(value: str) -> str:
    stripped = value.strip()
    if "://" not in stripped:
        return stripped
    parsed = urlparse(stripped)
    query = parse_qs(parsed.query)
    for key in ("courseId", "courseid", "course_id"):
        candidate = query.get(key, [None])[0]
        if candidate:
            return candidate
    path_parts = [part for part in parsed.path.split("/") if part]
    for part in reversed(path_parts):
        if part.isdigit():
            return part
    raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "无法从课程链接解析 courseId")


def admin_achievement_view(item: Achievement) -> dict[str, Any]:
    return {
        "id": item.id,
        "courseId": item.course_id,
        "name": item.name,
        "description": item.description,
        "tier": item.tier,
        "hidden": item.hidden,
        "triggerType": item.trigger_type,
        "ruleExpression": item.rule_expression,
        "progressKey": item.progress_key,
        "progressTarget": item.progress_target,
        "sortOrder": item.sort_order,
    }


def announcement_view(item: Announcement) -> dict[str, Any]:
    return {
        "id": item.id,
        "courseId": item.course_id,
        "title": item.title,
        "content": item.content,
        "order": item.sort_order,
        "createdAt": item.created_at,
    }


app = create_app()
