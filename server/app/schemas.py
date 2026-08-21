from datetime import datetime
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ApiModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class StudentIdentity(ApiModel):
    role: Literal["student", "teacher"] = "student"
    student_id: str = Field(alias="studentId", min_length=1, max_length=64)
    real_name: str = Field(alias="realName", min_length=1, max_length=100)
    grade: int | None = Field(default=None, ge=2000, le=2200)
    class_number: int | None = Field(alias="classNumber", default=None, ge=1, le=9)
    class_id: str = Field(alias="classId", min_length=1, max_length=100)

    @model_validator(mode="after")
    def require_student_class_identity(self) -> Self:
        if self.role == "student" and (self.grade is None or self.class_number is None):
            raise ValueError("学生身份必须提供年级与行政班序号")
        return self


class BootstrapRequest(StudentIdentity):
    course_id: str = Field(alias="courseId", min_length=1, max_length=100)
    course_name: str = Field(alias="courseName", min_length=1, max_length=200)
    course_ended: bool = Field(alias="courseEnded", default=False)


class FocusRequest(StudentIdentity):
    course_id: str = Field(alias="courseId", min_length=1, max_length=100)
    session_id: str = Field(alias="sessionId", min_length=1, max_length=100)


class FocusStopRequest(FocusRequest):
    completed: bool = False
    disconnected_at: datetime | None = Field(alias="disconnectedAt", default=None)


class HomeworkItem(ApiModel):
    assignment_id: str = Field(alias="assignmentId", min_length=1, max_length=200)
    assignment_name: str = Field(alias="assignmentName", min_length=1, max_length=300)
    score: float | None = None
    total_score: float | None = Field(alias="totalScore", default=None)


class HomeworkSyncRequest(StudentIdentity):
    course_id: str = Field(alias="courseId", min_length=1, max_length=100)
    assignments: list[HomeworkItem]
    complete_snapshot: bool = Field(alias="completeSnapshot", default=True)


class PreferencesUpdate(ApiModel):
    student_id: str = Field(alias="studentId", min_length=1, max_length=64)
    focus_minutes: int = Field(alias="focusMinutes", ge=1, le=180)
    rest_minutes: int = Field(alias="restMinutes", ge=1, le=60)
    rounds: int = Field(ge=1, le=20)
    music_volume: float = Field(alias="musicVolume", ge=0, le=1)
    ambience_volume: float = Field(alias="ambienceVolume", ge=0, le=1)
    ambience_type: Literal["rain", "wind", "fire"] | None = Field(alias="ambienceType")
    playback_mode: Literal["sequential", "repeat-all", "shuffle", "repeat-one"] = Field(
        alias="playbackMode"
    )
    last_playlist_id: str | None = Field(alias="lastPlaylistId", max_length=100)


class ProfileUpdate(ApiModel):
    role: Literal["student", "teacher"] = "student"
    student_id: str = Field(alias="studentId", min_length=1, max_length=64)
    nickname: str = Field(min_length=1, max_length=20)
    avatar_data_url: str | None = Field(alias="avatarDataUrl", default=None, max_length=1_500_000)


class AdminLoginRequest(ApiModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=200)


class AdminCourseCreate(ApiModel):
    course_url_or_id: str = Field(alias="courseUrlOrId", min_length=1, max_length=1000)
    name: str | None = Field(default=None, max_length=200)


class AdminCourseUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    enabled: bool | None = None


class AdminAchievementCreate(ApiModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1, max_length=500)
    tier: Literal["bronze", "silver", "gold"] = "bronze"
    hidden: bool = False
    trigger_type: Literal["automatic", "manual"] = Field(alias="triggerType")
    rule_expression: str | None = Field(alias="ruleExpression", default=None, max_length=2000)
    progress_key: str | None = Field(alias="progressKey", default=None, max_length=200)
    progress_target: float | None = Field(alias="progressTarget", default=None, gt=0)
    sort_order: int = Field(alias="sortOrder", default=0)


class AdminAnnouncementCreate(ApiModel):
    title: str = Field(min_length=1, max_length=150)
    content: str = Field(min_length=1, max_length=10000)
    order: int = 0


class AdminAchievementGrant(ApiModel):
    student_ids: list[str] = Field(alias="studentIds", default_factory=list)
    class_id: str | None = Field(alias="classId", default=None, max_length=100)
    all_course_members: bool = Field(alias="allCourseMembers", default=False)
    grant: bool = True


class AdminStudentUpdate(ApiModel):
    nickname: str | None = Field(default=None, min_length=1, max_length=20)
    disabled: bool | None = None
    disabled_reason: str | None = Field(alias="disabledReason", default=None, max_length=1000)
    reset_profile: bool = Field(alias="resetProfile", default=False)


class TokenResponse(ApiModel):
    access_token: str = Field(alias="accessToken")
    token_type: Literal["bearer"] = Field(alias="tokenType", default="bearer")
    expires_at: datetime = Field(alias="expiresAt")
