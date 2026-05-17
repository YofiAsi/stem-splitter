#!/usr/bin/env python3
"""Demucs CLI wrapper.

Runs htdemucs (4-stem) on the given audio file and emits a single JSON line:

    {"stems": {"vocals": "...", "drums": "...", "bass": "...", "other": "..."}}

Fails fast if the requested device is unavailable.
"""

import argparse
import json
import sys
from pathlib import Path


def fail(msg: str) -> None:
    print(f"separate.py ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def probe_cuda() -> None:
    try:
        import torch
    except Exception as exc:
        fail(f"failed to import torch: {exc}")
    if not torch.cuda.is_available():
        fail("torch reports CUDA is not available")


def run_demucs(model: str, device: str, input_path: Path, output_dir: Path) -> None:
    try:
        from demucs.separate import main as demucs_main
    except Exception as exc:
        fail(f"failed to import demucs: {exc}")

    argv = [
        "-n", model,
        "-d", device,
        "-o", str(output_dir),
        str(input_path),
    ]
    try:
        demucs_main(argv)
    except SystemExit as e:
        if e.code not in (None, 0):
            fail(f"demucs exited with code {e.code}")
    except Exception as exc:
        fail(f"demucs raised: {exc}")


def find_stems(output_dir: Path, model: str, input_path: Path) -> dict:
    # Demucs writes to: <output_dir>/<model>/<track_stem>/{vocals,drums,bass,other}.wav
    track_dir = output_dir / model / input_path.stem
    if not track_dir.is_dir():
        # Fallback: pick the only subdir under <output_dir>/<model> if naming differs
        model_dir = output_dir / model
        if model_dir.is_dir():
            subs = [p for p in model_dir.iterdir() if p.is_dir()]
            if len(subs) == 1:
                track_dir = subs[0]
    if not track_dir.is_dir():
        fail(f"demucs output dir not found, expected under {output_dir / model}")

    stems = {}
    for name in ("vocals", "drums", "bass", "other"):
        p = track_dir / f"{name}.wav"
        if not p.exists():
            fail(f"expected stem missing: {p}")
        stems[name] = str(p.resolve())
    return stems


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--model", default="htdemucs")
    parser.add_argument("--device", default="cuda", choices=["cuda", "cpu"])
    args = parser.parse_args()

    input_path = Path(args.input)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    if not input_path.exists():
        fail(f"input file does not exist: {input_path}")

    if args.device == "cuda":
        probe_cuda()

    run_demucs(args.model, args.device, input_path, output_dir)
    stems = find_stems(output_dir, args.model, input_path)
    print(json.dumps({"stems": stems}))


if __name__ == "__main__":
    main()
