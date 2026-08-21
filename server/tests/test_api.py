import base64

from sqlalchemy import func, select

from app.models import (
    Achievement,
    AchievementUnlock,
    Announcement,
    Course,
    CourseMembership,
    EventCounter,
    FocusInterval,
    HomeworkSnapshot,
    PomodoroCompletion,
    User,
)


def test_bootstrap_registers_membership_and_unlocks_first_open(client, student_payload) -> None:
    response = client.post("/api/v1/student/bootstrap", json=student_payload)

    assert response.status_code == 200
    payload = response.json()
    assert payload["user"]["studentId"] == "2099000101"
    assert payload["course"]["courseName"] == "大学计算机基础"
    assert payload["course"]["classId"] == "800000001"
    assert payload["achievements"][0]["name"] == "初来乍到"
    assert payload["achievements"][0]["unlocked"] is True
    assert payload["newlyUnlocked"][0]["name"] == "初来乍到"

    repeated = client.post("/api/v1/student/bootstrap", json=student_payload)
    assert repeated.status_code == 200
    assert repeated.json()["newlyUnlocked"] == []


def test_student_can_update_nickname_and_avatar(client, student_payload) -> None:
    client.post("/api/v1/student/bootstrap", json=student_payload)
    webp = base64.b64encode(b"RIFF\x04\x00\x00\x00WEBP").decode()

    response = client.put(
        "/api/v1/student/profile",
        json={
            "studentId": student_payload["studentId"],
            "nickname": "新的昵称",
            "avatarDataUrl": f"data:image/webp;base64,{webp}",
        },
    )

    assert response.status_code == 200
    assert response.json()["nickname"] == "新的昵称"
    assert response.json()["avatarUrl"].startswith("/uploads/avatars/user-")


def test_disabled_or_unknown_course_is_not_injected(client) -> None:
    response = client.get("/api/v1/public/courses/unknown-course")
    assert response.status_code == 200
    assert response.json()["status"] == "disabled"


def test_student_visible_course_name_does_not_replace_admin_note(client, student_payload) -> None:
    client.post("/api/v1/student/bootstrap", json=student_payload)
    login = client.post(
        "/api/v1/admin/auth/login",
        json={"username": "admin", "password": "test-password"},
    )
    courses = client.get(
        "/api/v1/admin/courses",
        headers={"Authorization": f"Bearer {login.json()['accessToken']}"},
    ).json()
    course = next(item for item in courses if item["courseId"] == "demo-course")
    assert course["name"] == "课程 demo-course"
    students = client.get(
        f"/api/v1/admin/students?course_id={course['id']}",
        headers={"Authorization": f"Bearer {login.json()['accessToken']}"},
    ).json()
    assert next(item for item in students if item["studentId"] == "2099000101")["classId"] == (
        "800000001"
    )


def test_focus_session_is_idempotent_and_updates_summary(client, student_payload) -> None:
    client.post("/api/v1/student/bootstrap", json=student_payload)
    focus = {
        key: student_payload[key]
        for key in ("studentId", "realName", "grade", "classNumber", "classId", "courseId")
    }
    focus["sessionId"] = "session-1"

    assert client.post("/api/v1/student/focus/start", json=focus).status_code == 200
    assert client.post("/api/v1/student/focus/heartbeat", json=focus).status_code == 200
    completed = client.post(
        "/api/v1/student/focus/stop", json={**focus, "completed": True}
    )
    assert completed.status_code == 200
    assert completed.json()["summary"]["totalPomodoros"] == 1

    repeated = client.post(
        "/api/v1/student/focus/stop", json={**focus, "completed": True}
    )
    assert repeated.status_code == 200
    assert repeated.json()["summary"]["totalPomodoros"] == 1


def test_teacher_can_use_toolbox_but_only_view_achievements(client) -> None:
    teacher_payload = {
        "role": "teacher",
        "studentId": "teacher-test-001",
        "realName": "测试教师",
        "grade": None,
        "classNumber": None,
        "classId": "800000001",
        "courseId": "demo-course",
        "courseName": "教师看到的大学计算机基础",
        "courseEnded": False,
    }
    session_factory = client.app.state.session_factory
    with session_factory() as db:
        course = db.scalar(
            select(Course).where(Course.chaoxing_course_id == "demo-course")
        )
        assert course is not None
        hidden = Achievement(
            course_id=course.id,
            name="教师可见的隐藏成就",
            description="学生解锁前不可见，教师始终可见",
            tier="gold",
            hidden=True,
            trigger_type="manual",
            sort_order=20,
        )
        db.add(hidden)
        db.commit()
        hidden_id = hidden.id

    response = client.post("/api/v1/student/bootstrap", json=teacher_payload)

    assert response.status_code == 200
    payload = response.json()
    assert payload["user"]["role"] == "teacher"
    assert payload["user"]["grade"] is None
    assert payload["newlyUnlocked"] == []
    assert payload["achievements"][0]["name"] == "初来乍到"
    assert payload["achievements"][0]["unlocked"] is False
    assert payload["achievements"][0]["progressCurrent"] is None
    hidden_view = next(item for item in payload["achievements"] if item["id"] == hidden_id)
    assert hidden_view["name"] == "教师可见的隐藏成就"
    assert hidden_view["description"] == "学生解锁前不可见，教师始终可见"
    assert hidden_view["hidden"] is True
    assert hidden_view["unlocked"] is False

    focus = {
        key: teacher_payload[key]
        for key in (
            "role",
            "studentId",
            "realName",
            "grade",
            "classNumber",
            "classId",
            "courseId",
        )
    }
    focus["sessionId"] = "teacher-session"
    assert client.post("/api/v1/student/focus/start", json=focus).status_code == 200
    completed = client.post(
        "/api/v1/student/focus/stop", json={**focus, "completed": True}
    )
    assert completed.status_code == 200
    assert completed.json()["summary"]["totalPomodoros"] == 1
    assert completed.json()["newlyUnlocked"] == []

    with session_factory() as db:
        teacher = db.scalar(select(User).where(User.student_id == "teacher-test-001"))
        course = db.scalar(
            select(Course).where(Course.chaoxing_course_id == "demo-course")
        )
        assert teacher is not None
        assert course is not None
        assert db.scalar(
            select(func.count(CourseMembership.id)).where(
                CourseMembership.user_id == teacher.id,
                CourseMembership.course_id == course.id,
            )
        ) == 0
        assert db.scalar(
            select(func.count(AchievementUnlock.id)).where(
                AchievementUnlock.user_id == teacher.id
            )
        ) == 0
        assert db.scalar(
            select(func.count(EventCounter.id)).where(EventCounter.user_id == teacher.id)
        ) == 0


def test_admin_can_login_and_create_course(client) -> None:
    login = client.post(
        "/api/v1/admin/auth/login",
        json={"username": "admin", "password": "test-password"},
    )
    assert login.status_code == 200
    token = login.json()["accessToken"]
    response = client.post(
        "/api/v1/admin/courses",
        json={
            "courseUrlOrId": "https://mooc.example/course?courseId=900000004",
            "name": "新课程",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    assert response.json()["courseId"] == "900000004"


def test_admin_can_manage_v1_content_and_students(client, student_payload) -> None:
    client.post("/api/v1/student/bootstrap", json=student_payload)
    login = client.post(
        "/api/v1/admin/auth/login",
        json={"username": "admin", "password": "test-password"},
    )
    headers = {"Authorization": f"Bearer {login.json()['accessToken']}"}
    courses = client.get("/api/v1/admin/courses", headers=headers).json()
    course_id = next(item["id"] for item in courses if item["courseId"] == "demo-course")

    achievement = client.post(
        f"/api/v1/admin/courses/{course_id}/achievements",
        headers=headers,
        json={
            "name": "管理测试成就",
            "description": "创建后可编辑",
            "tier": "bronze",
            "hidden": False,
            "triggerType": "manual",
            "ruleExpression": None,
            "progressKey": None,
            "progressTarget": None,
            "sortOrder": 9,
        },
    )
    achievement_id = achievement.json()["id"]
    updated = client.put(
        f"/api/v1/admin/achievements/{achievement_id}",
        headers=headers,
        json={
            **achievement.json(),
            "name": "已编辑成就",
            "triggerType": "manual",
        },
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "已编辑成就"

    granted = client.post(
        f"/api/v1/admin/achievements/{achievement_id}/grant",
        headers=headers,
        json={"studentIds": [], "classId": "800000001", "grant": True},
    )
    assert granted.json()["affected"] == 1

    announcement = client.post(
        f"/api/v1/admin/courses/{course_id}/announcements",
        headers=headers,
        json={"title": "原公告", "content": "正文", "order": 1},
    )
    announcement_id = announcement.json()["id"]
    edited_announcement = client.put(
        f"/api/v1/admin/announcements/{announcement_id}",
        headers=headers,
        json={"title": "新公告", "content": "新正文", "order": 2},
    )
    assert edited_announcement.json()["title"] == "新公告"
    assert (
        client.delete(f"/api/v1/admin/announcements/{announcement_id}", headers=headers).status_code
        == 204
    )

    disabled = client.patch(
        f"/api/v1/admin/students/{student_payload['studentId']}",
        headers=headers,
        json={"disabled": True, "disabledReason": "测试原因"},
    )
    assert disabled.json()["status"] == "disabled"
    assert client.post("/api/v1/student/bootstrap", json=student_payload).status_code == 403
    restored = client.patch(
        f"/api/v1/admin/students/{student_payload['studentId']}",
        headers=headers,
        json={"disabled": False},
    )
    assert restored.json()["status"] == "active"


def test_admin_can_fully_delete_course_and_related_data(client, student_payload) -> None:
    login = client.post(
        "/api/v1/admin/auth/login",
        json={"username": "admin", "password": "test-password"},
    )
    headers = {"Authorization": f"Bearer {login.json()['accessToken']}"}
    created = client.post(
        "/api/v1/admin/courses",
        headers=headers,
        json={"courseUrlOrId": "delete-me", "name": "待删除课程"},
    )
    course_pk = created.json()["id"]
    course_payload = {
        **student_payload,
        "courseId": "delete-me",
        "courseName": "学生看到的待删除课程",
    }
    assert client.post("/api/v1/student/bootstrap", json=course_payload).status_code == 200

    achievement = client.post(
        f"/api/v1/admin/courses/{course_pk}/achievements",
        headers=headers,
        json={
            "name": "待删除成就",
            "description": "随课程删除",
            "tier": "bronze",
            "hidden": False,
            "triggerType": "manual",
            "ruleExpression": None,
            "progressKey": None,
            "progressTarget": None,
            "sortOrder": 1,
        },
    )
    achievement_id = achievement.json()["id"]
    client.post(
        f"/api/v1/admin/achievements/{achievement_id}/grant",
        headers=headers,
        json={"studentIds": [], "allCourseMembers": True, "grant": True},
    )
    client.post(
        f"/api/v1/admin/courses/{course_pk}/announcements",
        headers=headers,
        json={"title": "待删除公告", "content": "正文", "order": 1},
    )
    focus = {
        key: course_payload[key]
        for key in ("studentId", "realName", "grade", "classNumber", "classId", "courseId")
    }
    focus["sessionId"] = "delete-course-session"
    client.post("/api/v1/student/focus/start", json=focus)
    client.post("/api/v1/student/focus/stop", json={**focus, "completed": True})
    client.post(
        "/api/v1/student/homework/sync",
        json={
            **{key: course_payload[key] for key in (
                "studentId", "realName", "grade", "classNumber", "classId", "courseId"
            )},
            "assignments": [{
                "assignmentId": "delete-assignment",
                "assignmentName": "待删除作业",
                "score": 5,
                "totalScore": 5,
            }],
            "completeSnapshot": True,
        },
    )

    response = client.delete(f"/api/v1/admin/courses/{course_pk}", headers=headers)
    assert response.status_code == 204
    assert client.get("/api/v1/public/courses/delete-me").json()["status"] == "disabled"

    session_factory = client.app.state.session_factory
    with session_factory() as db:
        assert db.scalar(select(func.count(Course.id)).where(Course.id == course_pk)) == 0
        for model in (
            CourseMembership,
            Achievement,
            Announcement,
            EventCounter,
            HomeworkSnapshot,
            FocusInterval,
            PomodoroCompletion,
        ):
            assert db.scalar(select(func.count(model.id)).where(model.course_id == course_pk)) == 0
        assert db.scalar(
            select(func.count(AchievementUnlock.id)).where(
                AchievementUnlock.achievement_id == achievement_id
            )
        ) == 0
        assert db.scalar(
            select(func.count(User.id)).where(User.student_id == student_payload["studentId"])
        ) == 1

    recreated = client.post(
        "/api/v1/admin/courses",
        headers=headers,
        json={"courseUrlOrId": "delete-me", "name": "重新添加"},
    )
    assert recreated.status_code == 201
