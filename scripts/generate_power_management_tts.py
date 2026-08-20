#!/usr/bin/env python3
"""Generate the 10-question power-management neural TTS prototype.

The API key is read from OPENAI_API_KEY or from a local, ignored .env file.
Generated MP3 files are written below AnkiTapWeb/audio/power_management/.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TEXTS_PATH = ROOT / "AnkiTapWeb" / "audio" / "power_management" / "tts_texts.json"
OUTPUT_DIR = TEXTS_PATH.parent
DEPLOY_OUTPUT_DIR = ROOT / "deploy" / "AnkiTapWeb" / "audio" / "power_management"
API_URL = "https://api.openai.com/v1/audio/speech"
DEFAULT_MODEL = "gpt-4o-mini-tts"
DEFAULT_VOICE = "marin"
DEFAULT_SPEED = 0.95


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"'")
        if key and key not in os.environ:
            os.environ[key] = value


def format_bytes(size: int) -> str:
    if size < 1024:
        return f"{size} B"
    if size < 1024 * 1024:
        return f"{size / 1024:.1f} KB"
    return f"{size / (1024 * 1024):.2f} MB"


def optional_duration(path: Path) -> float | None:
    try:
        from mutagen.mp3 import MP3  # type: ignore[import-not-found]
    except ImportError:
        return None

    try:
        return float(MP3(path).info.length)
    except Exception:
        return None


def request_audio(api_key: str, text: str, model: str, voice: str, speed: float) -> bytes:
    payload: dict[str, object] = {
        "model": model,
        "input": text,
        "voice": voice,
        "response_format": "mp3",
        "speed": speed,
    }
    if model.startswith("gpt-4o-mini-tts"):
        payload["instructions"] = (
            "日本語の落ち着いた教育用ナレーション。電力工学の専門用語を明瞭に読み、"
            "句読点では自然に間を置く。感情表現は控えめにする。"
        )

    request = urllib.request.Request(
        API_URL,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(detail).get("error", {}).get("message", detail)
        except json.JSONDecodeError:
            pass
        raise RuntimeError(f"TTS API error {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"TTS APIへ接続できませんでした: {error.reason}") from error


def sync_deploy_audio(source: Path) -> None:
    if not (ROOT / "deploy" / "AnkiTapWeb").exists():
        return
    DEPLOY_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, DEPLOY_OUTPUT_DIR / source.name)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="既存MP3も再生成する")
    parser.add_argument("--id", help="指定した試作IDだけ生成する")
    parser.add_argument("--model", default=os.getenv("OPENAI_TTS_MODEL", DEFAULT_MODEL))
    parser.add_argument("--voice", default=os.getenv("OPENAI_TTS_VOICE", DEFAULT_VOICE))
    parser.add_argument("--speed", type=float, default=float(os.getenv("OPENAI_TTS_SPEED", DEFAULT_SPEED)))
    return parser.parse_args()


def main() -> int:
    load_dotenv(ROOT / ".env")
    args = parse_args()
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("OPENAI_API_KEYが設定されていません。環境変数または.gitignore対象の.envへ設定してください。", file=sys.stderr)
        return 2
    if not 0.25 <= args.speed <= 4.0:
        print("--speedは0.25以上4.0以下で指定してください。", file=sys.stderr)
        return 2

    records = json.loads(TEXTS_PATH.read_text(encoding="utf-8"))
    if args.id:
        records = [record for record in records if record.get("id") == args.id]
        if not records:
            print(f"対象IDが見つかりません: {args.id}", file=sys.stderr)
            return 2

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    generated = 0
    skipped = 0
    failed = 0
    total_bytes = 0
    durations: list[float] = []

    for record in records:
        record_id = record["id"]
        output_path = OUTPUT_DIR / record["audioFile"]
        if output_path.exists() and not args.force:
            skipped += 1
            sync_deploy_audio(output_path)
            print(f"SKIP {record_id}: {output_path.relative_to(ROOT)}")
            continue

        text = str(record["speechText"])
        if len(text) > 4096:
            print(f"FAIL {record_id}: speechTextが4096文字を超えています。", file=sys.stderr)
            failed += 1
            continue

        try:
            audio_bytes = request_audio(api_key, text, args.model, args.voice, args.speed)
            output_path.write_bytes(audio_bytes)
            sync_deploy_audio(output_path)
        except (OSError, RuntimeError) as error:
            print(f"FAIL {record_id}: {error}", file=sys.stderr)
            failed += 1
            continue

        size = output_path.stat().st_size
        duration = optional_duration(output_path)
        total_bytes += size
        generated += 1
        if duration is not None:
            durations.append(duration)
        duration_label = f"{duration:.1f}s" if duration is not None else "計測不可"
        print(f"OK   {record_id}: {format_bytes(size)}, {duration_label}")

    print(
        f"完了: 生成{generated}件、既存スキップ{skipped}件、失敗{failed}件、"
        f"今回の生成容量{format_bytes(total_bytes)}"
    )
    if durations:
        print(f"再生時間: 合計{sum(durations):.1f}秒、平均{sum(durations) / len(durations):.1f}秒")
    else:
        print("再生時間: mutagen未導入のため計測していません。")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
