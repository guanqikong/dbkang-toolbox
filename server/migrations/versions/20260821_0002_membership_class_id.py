"""Track the real Chaoxing teaching-class id on memberships.

Revision ID: 20260821_0002
Revises: 20260821_0001
Create Date: 2026-08-21
"""

import sqlalchemy as sa
from alembic import op

revision = "20260821_0002"
down_revision = "20260821_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("course_memberships")}
    if "chaoxing_class_id" not in columns:
        with op.batch_alter_table("course_memberships") as batch:
            batch.add_column(
                sa.Column(
                    "chaoxing_class_id",
                    sa.String(length=100),
                    nullable=False,
                    server_default="legacy",
                )
            )

    indexes = {index["name"] for index in sa.inspect(bind).get_indexes("course_memberships")}
    if "ix_course_memberships_chaoxing_class_id" not in indexes:
        with op.batch_alter_table("course_memberships") as batch:
            batch.create_index(
                "ix_course_memberships_chaoxing_class_id", ["chaoxing_class_id"]
            )


def downgrade() -> None:
    bind = op.get_bind()
    indexes = {index["name"] for index in sa.inspect(bind).get_indexes("course_memberships")}
    if "ix_course_memberships_chaoxing_class_id" in indexes:
        with op.batch_alter_table("course_memberships") as batch:
            batch.drop_index("ix_course_memberships_chaoxing_class_id")

    columns = {column["name"] for column in sa.inspect(bind).get_columns("course_memberships")}
    if "chaoxing_class_id" in columns:
        with op.batch_alter_table("course_memberships") as batch:
            batch.drop_column("chaoxing_class_id")
