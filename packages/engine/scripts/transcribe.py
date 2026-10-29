"""Transcribe one audio file on this Mac (mlx-whisper, Apple Silicon); prints [{"start": s, "text": "..."}] as JSON.

Used by the engine for YouTube videos that have no captions at all. Run with the whisper venv's python:
  ~/.local/share/thuysinh/whisper-venv/bin/python transcribe.py <audio> [language]
"""
import json
import sys

import mlx_whisper

audio = sys.argv[1]
lang = sys.argv[2] if len(sys.argv) > 2 else 'en'
r = mlx_whisper.transcribe(audio, path_or_hf_repo='mlx-community/whisper-large-v3-turbo', language=lang)
print(json.dumps([{'start': s['start'], 'text': s['text']} for s in r['segments']]))
