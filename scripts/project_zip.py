#!/usr/bin/env python3
"""
Create a ZIP backup of a Git project (or a selected subfolder) while honoring
Git ignore rules.

Why Git is used instead of manually parsing .gitignore:
    git ls-files --cached --others --exclude-standard

This includes:
- tracked files;
- untracked, non-ignored files;

and excludes:
- .git/ metadata;
- files ignored by .gitignore;
- .git/info/exclude;
- configured global Git excludes.

The archive is written to a temporary file, verified, then atomically moved
over the destination. If packaging or verification fails, an existing ZIP is
left untouched.

Usage:
    python project_zip.py
    python project_zip.py "D:\\Projects\\net-Circuit-Remote"
    python project_zip.py "D:\\Projects\\net-Circuit-Remote" -o "D:\\Backups\\net-Circuit-Remote.zip"
"""

from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import subprocess
import sys
import tempfile
from typing import NamedTuple
import zipfile


class ProjectZipError(RuntimeError):
    """Raised when a safe project archive cannot be created."""


class ZipResult(NamedTuple):
    output_path: Path
    file_count: int
    source_bytes: int
    archive_bytes: int
    sha256: str
    replaced_existing: bool
    excluded_output_from_archive: bool


def _run_git(cwd: Path, args: list[str]) -> bytes:
    git = shutil.which("git")
    if not git:
        raise ProjectZipError(
            "Không tìm thấy Git trong PATH. Hãy cài Git hoặc thêm git.exe vào PATH."
        )

    proc = subprocess.run(
        [git, "-C", str(cwd), *args],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if proc.returncode != 0:
        detail = proc.stderr.decode(errors="replace").strip()
        raise ProjectZipError(
            f"Git không thể xử lý thư mục '{cwd}'. "
            f"Hãy chắc chắn đây là Git repository hoặc thư mục con của repository."
            + (f"\nChi tiết Git: {detail}" if detail else "")
        )
    return proc.stdout


def find_git_root(selected_dir: Path) -> Path:
    """Return the repository root containing selected_dir."""
    selected_dir = selected_dir.expanduser().resolve()
    if not selected_dir.is_dir():
        raise ProjectZipError(f"Thư mục không tồn tại: {selected_dir}")

    raw = _run_git(selected_dir, ["rev-parse", "--show-toplevel"])
    root_text = os.fsdecode(raw).strip()
    if not root_text:
        raise ProjectZipError("Git không trả về repository root.")
    return Path(root_text).resolve()


def _git_entries(repo_root: Path, selected_dir: Path) -> list[Path]:
    """
    Return repo-relative paths for tracked + untracked/non-ignored files
    under selected_dir. Tracked files that are missing from disk remain in
    this list so the caller can fail instead of silently producing an
    incomplete backup.
    """
    try:
        selected_rel = selected_dir.relative_to(repo_root)
    except ValueError as exc:
        raise ProjectZipError(
            f"Thư mục đã chọn không nằm trong Git root: {repo_root}"
        ) from exc

    pathspec = "." if selected_rel == Path(".") else selected_rel.as_posix()
    raw = _run_git(
        repo_root,
        [
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
            "--",
            pathspec,
        ],
    )

    entries: list[Path] = []
    for item in raw.split(b"\0"):
        if item:
            entries.append(Path(os.fsdecode(item)))

    # Git normally returns unique paths, but make that invariant explicit.
    return sorted(set(entries), key=lambda p: p.as_posix())


def _same_path(a: Path, b: Path) -> bool:
    """Cross-platform path identity suitable for excluding the output ZIP."""
    return os.path.normcase(os.path.abspath(a)) == os.path.normcase(os.path.abspath(b))


def collect_source_files(
    selected_dir: Path,
    output_path: Path | None = None,
) -> tuple[Path, list[tuple[Path, Path]], bool]:
    """
    Collect files as (absolute_path, path_relative_to_selected_dir).

    The output archive itself is explicitly excluded if it lives inside the
    selected folder, preventing recursive/self inclusion on subsequent runs.
    """
    selected_dir = selected_dir.expanduser().resolve()
    repo_root = find_git_root(selected_dir)
    repo_entries = _git_entries(repo_root, selected_dir)

    output_abs = output_path.expanduser().resolve() if output_path else None
    selected_rel_to_repo = selected_dir.relative_to(repo_root)

    files: list[tuple[Path, Path]] = []
    missing: list[str] = []
    invalid: list[str] = []
    excluded_output = False

    for repo_rel in repo_entries:
        abs_path = repo_root / repo_rel

        if output_abs is not None and _same_path(abs_path, output_abs):
            excluded_output = True
            continue

        if not os.path.lexists(abs_path):
            # Most commonly: a tracked file has been deleted from the worktree
            # but not staged/committed yet. Silently skipping it would make the
            # backup incomplete, so abort before touching the old ZIP.
            missing.append(repo_rel.as_posix())
            continue

        if abs_path.is_dir() and not abs_path.is_symlink():
            # A directory entry returned by git ls-files is typically a gitlink
            # (submodule). A normal ZIP of the parent repo cannot reconstruct an
            # uninitialized submodule's content safely.
            invalid.append(
                f"{repo_rel.as_posix()} (directory/gitlink; submodule cần được xử lý riêng)"
            )
            continue

        rel_to_selected = repo_rel.relative_to(selected_rel_to_repo)
        files.append((abs_path, rel_to_selected))

    if missing:
        preview = "\n".join(f"  - {name}" for name in missing[:20])
        more = "" if len(missing) <= 20 else f"\n  ... và {len(missing) - 20} file khác"
        raise ProjectZipError(
            "Phát hiện file tracked bởi Git nhưng đang thiếu trên ổ đĩa. "
            "Dừng nén để tránh tạo backup thiếu source:\n"
            f"{preview}{more}"
        )

    if invalid:
        preview = "\n".join(f"  - {name}" for name in invalid[:20])
        raise ProjectZipError(
            "Có entry Git không phải file thông thường/symlink. "
            "Dừng nén để tránh backup không đầy đủ:\n"
            f"{preview}"
        )

    if not files:
        raise ProjectZipError(
            "Không tìm thấy file nguồn nào để nén sau khi áp dụng quy tắc Git ignore."
        )

    return repo_root, files, excluded_output


def _archive_name(folder_name: str, rel_path: Path) -> str:
    if not folder_name:
        raise ProjectZipError("Không thể dùng thư mục gốc của filesystem làm archive root.")
    return str(PurePosixPath(folder_name) / PurePosixPath(rel_path.as_posix()))


def _write_symlink(zf: zipfile.ZipFile, source: Path, arcname: str) -> int:
    """
    Preserve a symbolic link as a Unix-style ZIP symlink entry instead of
    following it outside the selected source tree.
    """
    target = os.readlink(source)
    payload = os.fsencode(target)

    info = zipfile.ZipInfo(arcname)
    info.create_system = 3  # Unix
    info.external_attr = (stat.S_IFLNK | 0o777) << 16
    info.compress_type = zipfile.ZIP_DEFLATED
    zf.writestr(info, payload)
    return len(payload)


def _write_archive(
    temp_path: Path,
    selected_dir: Path,
    files: list[tuple[Path, Path]],
) -> tuple[list[str], int]:
    expected_names: list[str] = []
    source_bytes = 0
    root_name = selected_dir.name

    with zipfile.ZipFile(
        temp_path,
        mode="w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=6,
        allowZip64=True,
    ) as zf:
        for source, rel in files:
            arcname = _archive_name(root_name, rel)
            expected_names.append(arcname)

            if source.is_symlink():
                source_bytes += _write_symlink(zf, source, arcname)
            else:
                try:
                    source_bytes += source.stat().st_size
                    zf.write(source, arcname=arcname)
                except FileNotFoundError as exc:
                    raise ProjectZipError(
                        f"File biến mất trong lúc nén: {source}. "
                        "ZIP cũ (nếu có) chưa bị thay thế."
                    ) from exc

    return expected_names, source_bytes


def verify_archive(zip_path: Path, expected_names: list[str]) -> None:
    """Verify CRC/readability and exact entry-name coverage before overwrite."""
    expected_set = set(expected_names)
    if len(expected_set) != len(expected_names):
        raise ProjectZipError("Danh sách file dự kiến có đường dẫn ZIP bị trùng.")

    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            bad = zf.testzip()
            if bad is not None:
                raise ProjectZipError(f"ZIP verification lỗi CRC tại entry: {bad}")

            actual = zf.namelist()
            actual_set = set(actual)
            if len(actual) != len(actual_set):
                raise ProjectZipError("ZIP chứa entry trùng tên.")

            if actual_set != expected_set:
                missing = sorted(expected_set - actual_set)
                extra = sorted(actual_set - expected_set)
                parts = ["ZIP verification không khớp danh sách source."]
                if missing:
                    parts.append("Thiếu:\n" + "\n".join(f"  - {x}" for x in missing[:20]))
                if extra:
                    parts.append("Dư:\n" + "\n".join(f"  - {x}" for x in extra[:20]))
                raise ProjectZipError("\n".join(parts))
    except zipfile.BadZipFile as exc:
        raise ProjectZipError(f"File tạm không phải ZIP hợp lệ: {zip_path}") from exc


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def default_output_path(selected_dir: Path) -> Path:
    """Place project.zip beside the selected folder, not inside it."""
    selected_dir = selected_dir.expanduser().resolve()
    if not selected_dir.name:
        raise ProjectZipError("Không thể tạo tên ZIP mặc định cho filesystem root.")
    return selected_dir.parent / f"{selected_dir.name}.zip"


def create_project_zip(
    selected_dir: Path | str,
    output_path: Path | str | None = None,
) -> ZipResult:
    """
    Safely build and atomically replace a project ZIP.

    Existing output is not touched until the temporary archive has passed:
    - ZIP CRC/readability validation;
    - exact file-entry coverage validation.
    """
    selected = Path(selected_dir).expanduser().resolve()
    output = (
        Path(output_path).expanduser().resolve()
        if output_path is not None
        else default_output_path(selected)
    )

    if output.is_dir():
        raise ProjectZipError(f"Output đang là thư mục, không phải file ZIP: {output}")

    output.parent.mkdir(parents=True, exist_ok=True)
    replaced_existing = output.exists()

    _repo_root, files, excluded_output = collect_source_files(selected, output)

    fd, temp_name = tempfile.mkstemp(
        prefix=f".{output.stem}.",
        suffix=".zip.tmp",
        dir=output.parent,
    )
    os.close(fd)
    temp_path = Path(temp_name)

    try:
        expected_names, source_bytes = _write_archive(temp_path, selected, files)
        verify_archive(temp_path, expected_names)

        # Only now replace the destination. os.replace is atomic on the same
        # filesystem on normal local filesystems and works whether output exists.
        os.replace(temp_path, output)

        archive_bytes = output.stat().st_size
        checksum = sha256_file(output)
        return ZipResult(
            output_path=output,
            file_count=len(expected_names),
            source_bytes=source_bytes,
            archive_bytes=archive_bytes,
            sha256=checksum,
            replaced_existing=replaced_existing,
            excluded_output_from_archive=excluded_output,
        )
    except Exception:
        # Never destroy the previous good ZIP if generation/verification fails.
        try:
            temp_path.unlink(missing_ok=True)
        finally:
            pass
        raise


def choose_folder_gui() -> Path:
    """Open a folder picker when no CLI folder was supplied."""
    try:
        import tkinter as tk
        from tkinter import filedialog
    except ImportError as exc:
        raise ProjectZipError(
            "Python hiện tại không có tkinter. "
            "Hãy truyền đường dẫn qua CLI: python project_zip.py <folder>"
        ) from exc

    try:
        root = tk.Tk()
        root.withdraw()
        root.update()
        chosen = filedialog.askdirectory(
            title="Chọn Git project/folder cần nén ZIP",
            mustexist=True,
        )
        root.destroy()
    except Exception as exc:
        raise ProjectZipError(
            "Không thể mở hộp thoại chọn thư mục. "
            "Hãy dùng CLI: python project_zip.py <folder>"
        ) from exc

    if not chosen:
        raise ProjectZipError("Đã hủy chọn thư mục.")
    return Path(chosen)


def _human_bytes(value: int) -> str:
    units = ["B", "KiB", "MiB", "GiB", "TiB"]
    size = float(value)
    for unit in units:
        if size < 1024.0 or unit == units[-1]:
            return f"{size:.2f} {unit}"
        size /= 1024.0
    return f"{value} B"


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Nén Git project/folder thành ZIP, giữ tracked + untracked source "
            "và loại file theo quy tắc .gitignore/Git excludes."
        )
    )
    parser.add_argument(
        "folder",
        nargs="?",
        help="Folder cần nén. Bỏ trống để mở cửa sổ chọn thư mục.",
    )
    parser.add_argument(
        "-o",
        "--output",
        help=(
            "Đường dẫn ZIP output. Mặc định: <folder>.zip nằm bên cạnh folder. "
            "Nếu đã tồn tại sẽ được thay thế sau khi ZIP mới verify thành công."
        ),
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)

    try:
        selected = Path(args.folder) if args.folder else choose_folder_gui()
        output = Path(args.output) if args.output else None

        print(f"Folder: {selected.expanduser().resolve()}")
        print("Đang lấy danh sách source bằng Git ignore rules và tạo ZIP an toàn...")

        result = create_project_zip(selected, output)

        print("\n============================= HOÀN TẤT =============================")
        print(f"ZIP: {result.output_path}")
        print(f"Số file: {result.file_count}")
        print(f"Tổng source: {_human_bytes(result.source_bytes)}")
        print(f"Kích thước ZIP: {_human_bytes(result.archive_bytes)}")
        print(f"SHA-256: {result.sha256}")
        print(
            "Ghi đè ZIP cũ: "
            + ("Có (sau khi verify ZIP mới)" if result.replaced_existing else "Không")
        )
        if result.excluded_output_from_archive:
            print("Self-exclusion: ZIP output cũ nằm trong source folder và đã được loại.")
        print(
            "Bộ lọc: tracked files + untracked non-ignored files; "
            "tuân theo .gitignore, .git/info/exclude và global Git excludes."
        )
        return 0

    except ProjectZipError as exc:
        print(f"\nLỖI: {exc}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("\nĐã hủy.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
