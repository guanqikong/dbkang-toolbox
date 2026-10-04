import hashlib
import mimetypes
from dataclasses import dataclass
from pathlib import Path

from fastapi import HTTPException, Request, status
from fastapi.responses import FileResponse, Response, StreamingResponse
from mutagen import File as MutagenFile

from .config import Settings


@dataclass(frozen=True)
class Track:
    id: str
    playlist_id: str
    path: Path
    title: str
    artist: str
    album: str
    duration_seconds: float | None
    cover_path: Path | None


class MusicLibrary:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.playlists: list[dict[str, object]] = []
        self.tracks: dict[str, Track] = {}

    def scan(self) -> None:
        self.settings.music_dir.mkdir(parents=True, exist_ok=True)
        self.settings.cover_cache_dir.mkdir(parents=True, exist_ok=True)
        self.playlists = []
        self.tracks = {}
        for folder in sorted(
            (item for item in self.settings.music_dir.iterdir() if item.is_dir()),
            key=lambda item: item.name.casefold(),
        ):
            playlist_id = hashlib.sha256(folder.name.encode()).hexdigest()[:16]
            tracks = []
            for path in sorted(folder.glob("*.mp3"), key=lambda item: item.name.casefold()):
                track = self._parse_track(path, playlist_id)
                self.tracks[track.id] = track
                tracks.append(self.track_view(track))
            if tracks:
                self.playlists.append(
                    {
                        "id": playlist_id,
                        "name": folder.name,
                        "coverUrl": tracks[0]["coverUrl"],
                        "tracks": tracks,
                    }
                )

    def _parse_track(self, path: Path, playlist_id: str) -> Track:
        relative = path.relative_to(self.settings.music_dir).as_posix()
        track_id = hashlib.sha256(relative.encode()).hexdigest()[:24]
        title = path.stem
        artist = "未知歌手"
        album = "未知专辑"
        duration: float | None = None
        cover_path: Path | None = None
        try:
            audio = MutagenFile(path)
            if audio is not None:
                duration = float(audio.info.length) if getattr(audio, "info", None) else None
                tags = audio.tags
                if tags:
                    title = _first_tag(tags, "TIT2", "title") or title
                    artist = _first_tag(tags, "TPE1", "artist") or artist
                    album = _first_tag(tags, "TALB", "album") or album
                    pictures = [value for key, value in tags.items() if str(key).startswith("APIC")]
                    if pictures and getattr(pictures[0], "data", None):
                        extension = mimetypes.guess_extension(
                            getattr(pictures[0], "mime", "image/jpeg")
                        ) or ".jpg"
                        cover_path = self.settings.cover_cache_dir / f"{track_id}{extension}"
                        if not cover_path.exists():
                            cover_path.write_bytes(pictures[0].data)
        except Exception:
            pass
        return Track(track_id, playlist_id, path, title, artist, album, duration, cover_path)

    @staticmethod
    def track_view(track: Track) -> dict[str, object]:
        return {
            "id": track.id,
            "playlistId": track.playlist_id,
            "title": track.title,
            "artist": track.artist,
            "album": track.album,
            "durationSeconds": track.duration_seconds,
            "coverUrl": f"/api/v1/music/tracks/{track.id}/cover",
            "streamUrl": f"/api/v1/music/tracks/{track.id}/stream",
        }

    def get_track(self, track_id: str) -> Track:
        track = self.tracks.get(track_id)
        if track is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "歌曲不存在")
        return track


def _first_tag(tags: object, *keys: str) -> str | None:
    for key in keys:
        try:
            value = tags.get(key)  # type: ignore[attr-defined]
        except (AttributeError, KeyError):
            continue
        if value is None:
            continue
        text = getattr(value, "text", value)
        if isinstance(text, list) and text:
            return str(text[0])
        if isinstance(text, (str, int, float)):
            return str(text)
    return None


def cover_response(track: Track) -> Response:
    if track.cover_path and track.cover_path.exists():
        return FileResponse(track.cover_path)
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" '
        'viewBox="0 0 512 512"><rect width="512" height="512" fill="#edf1f7"/>'
        '<circle cx="256" cy="256" r="160" fill="#d5deeb"/>'
        '<circle cx="256" cy="256" r="60" fill="#ffffff"/>'
        '<circle cx="256" cy="256" r="18" fill="#6e7b91"/></svg>'
    )
    return Response(
        svg,
        media_type="image/svg+xml",
        headers={"Cache-Control": "public, max-age=86400"},
    )


def stream_response(track: Track, request: Request) -> Response:
    file_size = track.path.stat().st_size
    range_header = request.headers.get("range")
    if not range_header:
        return FileResponse(track.path, media_type="audio/mpeg", headers={"Accept-Ranges": "bytes"})
    try:
        unit, value = range_header.split("=", 1)
        if unit != "bytes" or "," in value:
            raise ValueError
        start_value, end_value = value.split("-", 1)
        start = int(start_value) if start_value else 0
        end = int(end_value) if end_value else file_size - 1
        if start < 0 or end < start or start >= file_size:
            raise ValueError
        end = min(end, file_size - 1)
    except ValueError as exc:
        raise HTTPException(
            status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE,
            "无效的音频 Range",
            headers={"Content-Range": f"bytes */{file_size}"},
        ) from exc

    def iterator() -> object:
        remaining = end - start + 1
        with track.path.open("rb") as file:
            file.seek(start)
            while remaining > 0:
                chunk = file.read(min(64 * 1024, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    return StreamingResponse(
        iterator(),
        status_code=status.HTTP_206_PARTIAL_CONTENT,
        media_type="audio/mpeg",
        headers={
            "Accept-Ranges": "bytes",
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Content-Length": str(end - start + 1),
        },
    )
