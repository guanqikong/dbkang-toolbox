from collections.abc import Iterable, Mapping
from datetime import UTC, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import delete, distinct, func, select
from sqlalchemy.orm import Session

from .config import Settings
from .models import (
    Achievement,
    AchievementUnlock,
    AdminAccount,
    Announcement,
    Course,
    CourseMembership,
    EventCounter,
    FocusInterval,
    HomeworkSnapshot,
    PomodoroCompletion,
    User,
    UserPreference,
    utcnow,
)
from .rules import RuleError, SafeRuleEvaluator, resolve_progress_value
from .schemas import BootstrapRequest, FocusRequest, HomeworkItem, StudentIdentity
from .security import hash_password


def get_course(db: Session, external_id: str) -> Course | None:
    return db.scalar(select(Course).where(Course.chaoxing_course_id == external_id))


def require_available_course(db: Session, external_id: str, course_ended: bool = False) -> Course:
    course = get_course(db, external_id)
    if not course or not course.enabled:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "该课程未启用 DBKang Toolbox")
    if course_ended:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "课程已结束，DBKang Toolbox 不可用")
    return course


def get_or_create_user(db: Session, identity: StudentIdentity) -> User:
    user = db.scalar(select(User).where(User.student_id == identity.student_id))
    if user is None:
        user = User(
            student_id=identity.student_id,
            real_name=identity.real_name,
            nickname=identity.real_name[:20],
            grade=identity.grade or 0,
            class_number=identity.class_number or 0,
        )
        db.add(user)
        db.flush()
    else:
        user.real_name = identity.real_name
        if identity.role == "student":
            user.grade = identity.grade or 0
            user.class_number = identity.class_number or 0

    if user.status == "disabled":
        reason = user.disabled_reason or "未提供原因"
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"当前账号暂时无法使用阿康工具箱。原因：{reason}",
        )
    return user


def require_existing_user(db: Session, identity: StudentIdentity) -> User:
    user = db.scalar(select(User).where(User.student_id == identity.student_id))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "请先打开一次 DBKang Toolbox 完成注册")
    if user.status == "disabled":
        reason = user.disabled_reason or "未提供原因"
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"当前账号暂时无法使用阿康工具箱。原因：{reason}",
        )
    return user


def ensure_membership(
    db: Session, user: User, course: Course, chaoxing_class_id: str
) -> CourseMembership:
    membership = db.scalar(
        select(CourseMembership).where(
            CourseMembership.user_id == user.id,
            CourseMembership.course_id == course.id,
        )
    )
    if membership is None:
        membership = CourseMembership(
            user_id=user.id,
            course_id=course.id,
            chaoxing_class_id=chaoxing_class_id,
        )
        db.add(membership)
    else:
        membership.chaoxing_class_id = chaoxing_class_id
        membership.last_seen_at = utcnow()
    db.flush()
    return membership


def ensure_preferences(db: Session, user: User) -> UserPreference:
    preferences = db.get(UserPreference, user.id)
    if preferences is None:
        preferences = UserPreference(user_id=user.id)
        db.add(preferences)
        db.flush()
    return preferences


def increment_event(db: Session, user_id: int, course_id: int, event_name: str) -> int:
    counter = db.scalar(
        select(EventCounter).where(
            EventCounter.user_id == user_id,
            EventCounter.course_id == course_id,
            EventCounter.event_name == event_name,
        )
    )
    if counter is None:
        counter = EventCounter(
            user_id=user_id,
            course_id=course_id,
            event_name=event_name,
            count=1,
        )
        db.add(counter)
    else:
        counter.count += 1
    db.flush()
    return counter.count


def _day_bounds(timezone_name: str) -> tuple[datetime, datetime]:
    zone = ZoneInfo(timezone_name)
    now = datetime.now(zone)
    local_start = datetime.combine(now.date(), time.min, tzinfo=zone)
    utc_start = local_start.astimezone(UTC).replace(tzinfo=None)
    return utc_start, utc_start + timedelta(days=1)


def _merge_seconds(intervals: Iterable[tuple[datetime, datetime]]) -> int:
    normalized = sorted((start, end) for start, end in intervals if end > start)
    if not normalized:
        return 0
    total = 0.0
    current_start, current_end = normalized[0]
    for start, end in normalized[1:]:
        if start <= current_end:
            current_end = max(current_end, end)
        else:
            total += (current_end - current_start).total_seconds()
            current_start, current_end = start, end
    total += (current_end - current_start).total_seconds()
    return max(0, int(total))


def study_summary(
    db: Session,
    user: User,
    course: Course,
    settings: Settings,
    *,
    chaoxing_class_id: str | None = None,
) -> dict[str, int]:
    now = utcnow()
    cutoff = now - timedelta(seconds=settings.focus_ttl_seconds)
    day_start, day_end = _day_bounds(settings.timezone)
    rows = db.execute(
        select(FocusInterval.started_at, FocusInterval.ended_at).where(
            FocusInterval.user_id == user.id
        )
    ).all()
    all_intervals = [(row.started_at, row.ended_at) for row in rows]
    today_intervals = [
        (max(start, day_start), min(end, day_end))
        for start, end in all_intervals
        if end > day_start and start < day_end
    ]
    total_pomodoros = db.scalar(
        select(func.count(PomodoroCompletion.id)).where(PomodoroCompletion.user_id == user.id)
    ) or 0
    today_pomodoros = db.scalar(
        select(func.count(PomodoroCompletion.id)).where(
            PomodoroCompletion.user_id == user.id,
            PomodoroCompletion.completed_at >= day_start,
            PomodoroCompletion.completed_at < day_end,
        )
    ) or 0
    current_class_id = chaoxing_class_id
    if current_class_id is None:
        current_class_id = db.scalar(
            select(CourseMembership.chaoxing_class_id).where(
                CourseMembership.user_id == user.id,
                CourseMembership.course_id == course.id,
            )
        )
    focusing_count = db.scalar(
        select(func.count(distinct(FocusInterval.user_id)))
        .join(
            CourseMembership,
            (CourseMembership.user_id == FocusInterval.user_id)
            & (CourseMembership.course_id == FocusInterval.course_id),
        )
        .where(
            FocusInterval.course_id == course.id,
            FocusInterval.active.is_(True),
            FocusInterval.last_heartbeat_at >= cutoff,
            CourseMembership.chaoxing_class_id == current_class_id,
        )
    ) or 0
    return {
        "todayFocusSeconds": _merge_seconds(today_intervals),
        "totalFocusSeconds": _merge_seconds(all_intervals),
        "todayPomodoros": int(today_pomodoros),
        "totalPomodoros": int(total_pomodoros),
        "focusingStudentCount": int(focusing_count),
    }


def build_rule_context(
    db: Session,
    user: User,
    course: Course,
    settings: Settings,
    event: Mapping[str, Any] | None = None,
) -> tuple[dict[str, Any], dict[str, Mapping[str, Any]]]:
    summary = study_summary(db, user, course, settings)
    counters = db.scalars(
        select(EventCounter).where(
            EventCounter.user_id == user.id,
            EventCounter.course_id == course.id,
        )
    ).all()
    event_counts = {counter.event_name: {"count": counter.count} for counter in counters}
    state = {
        "study": {
            "today_focus_seconds": summary["todayFocusSeconds"],
            "today_focus_minutes": summary["todayFocusSeconds"] / 60,
            "total_focus_seconds": summary["totalFocusSeconds"],
            "total_focus_minutes": summary["totalFocusSeconds"] / 60,
            "today_pomodoros": summary["todayPomodoros"],
            "total_pomodoros": summary["totalPomodoros"],
        },
        "toolbox": {"open_count": event_counts.get("toolbox_open", {}).get("count", 0)},
        "lofi": {"open_count": event_counts.get("lofi_open", {}).get("count", 0)},
    }
    now = datetime.now(ZoneInfo(settings.timezone))
    context = {
        "state": state,
        "event": dict(event or {}),
        "events": event_counts,
        "time": {"hour": now.hour, "weekday": now.weekday(), "date": now.date().isoformat()},
        **state,
    }
    homework_rows = db.scalars(
        select(HomeworkSnapshot).where(
            HomeworkSnapshot.user_id == user.id,
            HomeworkSnapshot.course_id == course.id,
            HomeworkSnapshot.visible.is_(True),
        )
    ).all()
    homework = {
        row.assignment_id: {
            "score": row.score,
            "total_score": row.total_score,
            "visible": True,
        }
        for row in homework_rows
    }
    return context, homework


def evaluate_achievements(
    db: Session,
    user: User,
    course: Course,
    settings: Settings,
    event: Mapping[str, Any] | None = None,
) -> list[Achievement]:
    membership = db.scalar(
        select(CourseMembership.id).where(
            CourseMembership.user_id == user.id,
            CourseMembership.course_id == course.id,
        )
    )
    if membership is None:
        return []
    already_unlocked = set(
        db.scalars(
            select(AchievementUnlock.achievement_id).where(AchievementUnlock.user_id == user.id)
        ).all()
    )
    achievements = db.scalars(
        select(Achievement).where(
            Achievement.course_id == course.id,
            Achievement.trigger_type == "automatic",
        )
    ).all()
    context, homework = build_rule_context(db, user, course, settings, event)
    evaluator = SafeRuleEvaluator(context, homework.get)
    unlocked: list[Achievement] = []
    for achievement in achievements:
        if achievement.id in already_unlocked or not achievement.rule_expression:
            continue
        try:
            matches = evaluator.evaluate(achievement.rule_expression)
        except RuleError:
            matches = False
        if matches:
            db.add(
                AchievementUnlock(
                    achievement_id=achievement.id,
                    user_id=user.id,
                    source="automatic",
                )
            )
            unlocked.append(achievement)
    db.flush()
    return unlocked


def class_unlock_stats(
    db: Session,
    achievement_id: int,
    course_id: int,
    user: User,
    chaoxing_class_id: str | None = None,
) -> tuple[int, int, float]:
    current_class_id = chaoxing_class_id
    if current_class_id is None:
        current_class_id = db.scalar(
            select(CourseMembership.chaoxing_class_id).where(
                CourseMembership.user_id == user.id,
                CourseMembership.course_id == course_id,
            )
        )
    if current_class_id is None:
        return 0, 0, 0.0
    member_count = db.scalar(
        select(func.count(CourseMembership.id))
        .where(
            CourseMembership.course_id == course_id,
            CourseMembership.chaoxing_class_id == current_class_id,
        )
    ) or 0
    unlock_count = db.scalar(
        select(func.count(AchievementUnlock.id))
        .join(
            CourseMembership,
            (CourseMembership.user_id == AchievementUnlock.user_id)
            & (CourseMembership.course_id == course_id),
        )
        .where(
            AchievementUnlock.achievement_id == achievement_id,
            CourseMembership.chaoxing_class_id == current_class_id,
        )
    ) or 0
    rate = round((unlock_count / member_count) * 100, 1) if member_count else 0.0
    return int(unlock_count), int(member_count), rate


def achievement_views(
    db: Session,
    user: User,
    course: Course,
    settings: Settings,
    *,
    role: str = "student",
    chaoxing_class_id: str | None = None,
) -> list[dict[str, Any]]:
    achievements = db.scalars(
        select(Achievement)
        .where(Achievement.course_id == course.id)
        .order_by(Achievement.sort_order, Achievement.id)
    ).all()
    unlocks = (
        {
            unlock.achievement_id: unlock
            for unlock in db.scalars(
                select(AchievementUnlock).where(AchievementUnlock.user_id == user.id)
            ).all()
        }
        if role == "student"
        else {}
    )
    context, _ = build_rule_context(db, user, course, settings)
    views: list[dict[str, Any]] = []
    for achievement in achievements:
        unlock = unlocks.get(achievement.id)
        locked_hidden = role == "student" and achievement.hidden and unlock is None
        unlock_count, member_count, rate = class_unlock_stats(
            db,
            achievement.id,
            course.id,
            user,
            chaoxing_class_id=chaoxing_class_id,
        )
        views.append(
            {
                "id": achievement.id,
                "name": "???" if locked_hidden else achievement.name,
                "description": "隐藏成就" if locked_hidden else achievement.description,
                "iconUrl": (
                    None
                    if locked_hidden or not achievement.icon_path
                    else achievement.icon_path
                ),
                "tier": achievement.tier,
                "hidden": achievement.hidden,
                "unlocked": unlock is not None,
                "unlockedAt": unlock.unlocked_at if unlock else None,
                "unlockRate": rate,
                "unlockCount": unlock_count,
                "memberCount": member_count,
                "sortOrder": achievement.sort_order,
                "progressCurrent": (
                    resolve_progress_value(context, achievement.progress_key)
                    if role == "student"
                    else None
                ),
                "progressTarget": achievement.progress_target,
            }
        )
    return sorted(views, key=lambda item: (not item["unlocked"], item["sortOrder"], item["id"]))


def newly_unlocked_views(
    db: Session,
    achievements: Iterable[Achievement],
    course: Course,
    user: User,
) -> list[dict[str, Any]]:
    result = []
    for achievement in achievements:
        _, _, rate = class_unlock_stats(db, achievement.id, course.id, user)
        result.append(
            {
                "id": achievement.id,
                "name": achievement.name,
                "description": achievement.description,
                "iconUrl": achievement.icon_path,
                "tier": achievement.tier,
                "unlockRate": rate,
            }
        )
    return result


def bootstrap_payload(
    db: Session,
    request: BootstrapRequest,
    settings: Settings,
) -> dict[str, Any]:
    course = require_available_course(db, request.course_id, request.course_ended)
    user = get_or_create_user(db, request)
    preferences = ensure_preferences(db, user)
    unlocked: list[Achievement] = []
    if request.role == "student":
        ensure_membership(db, user, course, request.class_id)
        open_count = increment_event(db, user.id, course.id, "toolbox_open")
        unlocked = evaluate_achievements(
            db,
            user,
            course,
            settings,
            event={"type": "toolbox_open", "count": open_count},
        )
    db.commit()

    announcements = db.scalars(
        select(Announcement)
        .where(Announcement.course_id == course.id)
        .order_by(Announcement.sort_order, Announcement.created_at.desc())
    ).all()
    return {
        "user": {
            "role": request.role,
            "studentId": user.student_id,
            "realName": user.real_name,
            "nickname": user.nickname,
            "avatarUrl": user.avatar_path,
            "grade": request.grade,
            "classNumber": request.class_number,
            "status": user.status,
            "disabledReason": user.disabled_reason,
        },
        "course": {
            "courseId": course.chaoxing_course_id,
            "classId": request.class_id,
            "courseName": request.course_name,
        },
        "summary": study_summary(
            db,
            user,
            course,
            settings,
            chaoxing_class_id=request.class_id,
        ),
        "preferences": preference_view(preferences),
        "achievements": achievement_views(
            db,
            user,
            course,
            settings,
            role=request.role,
            chaoxing_class_id=request.class_id,
        ),
        "announcements": [
            {
                "id": item.id,
                "title": item.title,
                "content": item.content,
                "order": item.sort_order,
                "createdAt": item.created_at,
            }
            for item in announcements
        ],
        "newlyUnlocked": newly_unlocked_views(db, unlocked, course, user),
    }


def preference_view(preferences: UserPreference) -> dict[str, Any]:
    return {
        "focusMinutes": preferences.focus_minutes,
        "restMinutes": preferences.rest_minutes,
        "rounds": preferences.rounds,
        "musicVolume": preferences.music_volume,
        "ambienceVolume": preferences.ambience_volume,
        "ambienceType": preferences.ambience_type,
        "playbackMode": preferences.playback_mode,
        "lastPlaylistId": preferences.last_playlist_id,
    }


def _active_focus_interval(db: Session, user_id: int, session_id: str) -> FocusInterval | None:
    return db.scalar(
        select(FocusInterval)
        .where(
            FocusInterval.user_id == user_id,
            FocusInterval.session_id == session_id,
            FocusInterval.active.is_(True),
        )
        .order_by(FocusInterval.id.desc())
    )


def touch_focus(
    db: Session,
    request: FocusRequest,
    settings: Settings,
    *,
    count_open: bool = False,
) -> tuple[User, Course]:
    course = require_available_course(db, request.course_id)
    user = require_existing_user(db, request)
    if request.role == "student":
        ensure_membership(db, user, course, request.class_id)
    now = utcnow()
    cutoff = now - timedelta(seconds=settings.focus_ttl_seconds)
    interval = _active_focus_interval(db, user.id, request.session_id)
    if interval and interval.last_heartbeat_at < cutoff:
        interval.active = False
        interval = None
    if interval is None:
        had_session = db.scalar(
            select(FocusInterval.id).where(
                FocusInterval.user_id == user.id,
                FocusInterval.session_id == request.session_id,
            )
        )
        interval = FocusInterval(
            user_id=user.id,
            course_id=course.id,
            session_id=request.session_id,
            started_at=now,
            ended_at=now,
            last_heartbeat_at=now,
            active=True,
        )
        db.add(interval)
        if request.role == "student" and count_open and had_session is None:
            increment_event(db, user.id, course.id, "lofi_open")
    else:
        interval.ended_at = now
        interval.last_heartbeat_at = now
    db.flush()
    return user, course


def stop_focus(
    db: Session,
    request: FocusRequest,
    settings: Settings,
    *,
    completed: bool,
) -> tuple[User, Course, list[Achievement]]:
    course = require_available_course(db, request.course_id)
    user = require_existing_user(db, request)
    now = utcnow()
    interval = _active_focus_interval(db, user.id, request.session_id)
    if interval:
        # 心跳超时意味着客户端离线；离线区间不计入专注时长。
        cutoff = now - timedelta(seconds=settings.focus_ttl_seconds)
        disconnected_at = getattr(request, "disconnected_at", None)
        if disconnected_at is not None:
            if disconnected_at.tzinfo is not None:
                disconnected_at = disconnected_at.astimezone(UTC).replace(tzinfo=None)
            interval.ended_at = max(interval.started_at, min(now, disconnected_at))
        else:
            interval.ended_at = (
                interval.last_heartbeat_at if interval.last_heartbeat_at < cutoff else now
            )
        interval.last_heartbeat_at = now
        interval.active = False
    event: dict[str, Any] = {"type": "focus_stopped", "completed": completed}
    if completed:
        existing = db.scalar(
            select(PomodoroCompletion).where(
                PomodoroCompletion.user_id == user.id,
                PomodoroCompletion.session_id == request.session_id,
            )
        )
        if existing is None:
            db.add(
                PomodoroCompletion(
                    user_id=user.id,
                    course_id=course.id,
                    session_id=request.session_id,
                )
            )
            if request.role == "student":
                event["count"] = increment_event(
                    db, user.id, course.id, "pomodoro_completed"
                )
            event["type"] = "pomodoro_completed"
    db.flush()
    unlocked = (
        evaluate_achievements(db, user, course, settings, event=event)
        if request.role == "student"
        else []
    )
    db.commit()
    return user, course, unlocked


def sync_homework(
    db: Session,
    user: User,
    course: Course,
    assignments: list[HomeworkItem],
    *,
    complete_snapshot: bool,
) -> None:
    now = utcnow()
    incoming_ids = {item.assignment_id for item in assignments}
    existing_rows = db.scalars(
        select(HomeworkSnapshot).where(
            HomeworkSnapshot.user_id == user.id,
            HomeworkSnapshot.course_id == course.id,
        )
    ).all()
    existing = {row.assignment_id: row for row in existing_rows}
    if complete_snapshot:
        for row in existing_rows:
            if row.assignment_id not in incoming_ids:
                row.visible = False
    for item in assignments:
        row = existing.get(item.assignment_id)
        if row is None:
            row = HomeworkSnapshot(
                user_id=user.id,
                course_id=course.id,
                assignment_id=item.assignment_id,
                assignment_name=item.assignment_name,
            )
            db.add(row)
        row.assignment_name = item.assignment_name
        row.score = item.score
        row.total_score = item.total_score
        row.visible = True
        row.last_seen_at = now


def ensure_bootstrap_data(db: Session, settings: Settings) -> None:
    for external_id in settings.bootstrap_course_ids:
        course = get_course(db, external_id)
        if course is None:
            course = Course(chaoxing_course_id=external_id, name=f"课程 {external_id}")
            db.add(course)
            db.flush()
        has_achievement = db.scalar(
            select(Achievement.id).where(Achievement.course_id == course.id).limit(1)
        )
        if has_achievement is None:
            db.add(
                Achievement(
                    course_id=course.id,
                    name="初来乍到",
                    description="第一次打开 DBKang Toolbox",
                    tier="bronze",
                    trigger_type="automatic",
                    rule_expression="events.toolbox_open.count >= 1",
                    progress_key="toolbox.open_count",
                    progress_target=1,
                    sort_order=10,
                )
            )
    admin = db.scalar(select(AdminAccount).where(AdminAccount.username == settings.admin_username))
    if admin is None:
        db.add(
            AdminAccount(
                username=settings.admin_username,
                password_hash=hash_password(settings.admin_password),
            )
        )
    db.commit()


def delete_achievement(db: Session, achievement: Achievement) -> None:
    db.execute(
        delete(AchievementUnlock).where(AchievementUnlock.achievement_id == achievement.id)
    )
    db.delete(achievement)
    db.commit()


def delete_course(db: Session, course: Course) -> None:
    """删除课程主记录，并由数据库外键级联清理全部课程数据。"""
    db.execute(delete(Course).where(Course.id == course.id))
    db.commit()
