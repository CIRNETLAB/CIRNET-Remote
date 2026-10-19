"""Offline local Markdown path/case/anchor checks; never requests remote URLs."""
from pathlib import Path
import argparse
import html
import os
import re
import subprocess
from urllib.parse import unquote, urlsplit

ROOT=Path(__file__).resolve().parents[1]
EXCLUDED={'.git','node_modules','vendor','.audit-runtime','.venv','venv','.build','.test-build','.runtime','.superpowers','dist','.vite','__pycache__','.pytest_cache','.benchmark-build'}


def managed_markdown(root=ROOT):
    # Git defines managed inputs. Include relevant untracked files; ignored build
    # caches and dependencies are excluded without assuming a fixed file count.
    result=subprocess.run(['git','-C',str(root),'ls-files','--cached','--others','--exclude-standard','-z'],capture_output=True,text=True,check=True)
    return sorted({root/name for name in result.stdout.split('\0') if name and Path(name).suffix.lower() in {'.md','.markdown'} and not EXCLUDED.intersection(Path(name).parts) and (root/name).is_file()})


def without_code(text):
    lines=[];fence=None
    for line in text.splitlines():
        marker=re.match(r'^\s{0,3}(`{3,}|~{3,})',line)
        if marker:
            if fence is None:fence=marker[1][0]
            elif marker[1][0]==fence:fence=None
            lines.append('');continue
        lines.append('' if fence else line)
    return '\n'.join(lines)


def heading_anchors(text):
    text=without_code(text);anchors=set();counts={}
    for match in re.finditer(r'<(?:a|h[1-6])\b[^>]*(?:id|name)=["\']([^"\']+)',text,re.I):anchors.add(match[1])
    lines=text.splitlines()
    for index,line in enumerate(lines):
        match=re.match(r'^\s{0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$',line)
        heading=match[1] if match else (line if index+1<len(lines) and re.match(r'^\s{0,3}(?:=+|-+)\s*$',lines[index+1]) else None)
        if not heading:continue
        heading=re.sub(r'!?\[([^\]]+)\]\([^)]*\)',r'\1',heading)
        heading=re.sub(r'\[([^\]]+)\]\[[^\]]*\]',r'\1',heading)
        heading=re.sub(r'<[^>]+>','',html.unescape(heading)).lower()
        heading=re.sub(r'[^\w\-\s]','',heading,flags=re.UNICODE).replace(' ','-')
        count=counts.get(heading,0);counts[heading]=count+1
        anchors.add(heading+(f'-{count}' if count else ''))
    return anchors


def local_targets(text):
    text=without_code(text)
    # Inline code is prose, not a navigable link.
    text=re.sub(r'(`+).*?\1','',text)
    definitions={match[1].strip().lower():match[2] or match[3] for match in re.finditer(r'^\s{0,3}\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))',text,re.M)}
    targets=[]
    for match in re.finditer(r'!?\[[^\]\n]*\]\(\s*(?:<([^>]+)>|([^\s)]+(?:\([^)]*\)[^\s)]*)*))[^\n)]*\)',text):targets.append(match[1] or match[2])
    for match in re.finditer(r'!?\[([^\]\n]+)\]\[([^\]\n]*)\]',text):
        key=(match[2] or match[1]).strip().lower()
        if key in definitions:targets.append(definitions[key])
    for match in re.finditer(r'(?<![\]\[])\[([^\]\n]+)\](?![\[(:])',text):
        key=match[1].strip().lower()
        if key in definitions:targets.append(definitions[key])
    for match in re.finditer(r'<(?:img|a)\b[^>]*(?:src|href)=["\']([^"\']+)',text,re.I):targets.append(match[1])
    return targets


def correct_case(path,root):
    try:parts=path.relative_to(root).parts
    except ValueError:return True
    current=root
    for part in parts:
        if not current.is_dir():return True
        names={entry.name for entry in current.iterdir()}
        if part not in names and any(name.lower()==part.lower() for name in names):return False
        current=current/part
    return True


def check_document(path,root=ROOT):
    errors=[]
    for target in local_targets(path.read_text(encoding='utf-8-sig')):
        try:url=urlsplit(target)
        except ValueError:
            errors.append(f'{path.relative_to(root)}: invalid link {target}');continue
        if url.scheme or url.netloc:continue
        decoded=unquote(url.path)
        destination=Path(os.path.abspath(root/decoded.lstrip('/') if decoded.startswith('/') else path.parent/decoded)) if decoded else path
        prefix=f'{path.relative_to(root).as_posix()}: {target}'
        if not correct_case(destination,root):errors.append(prefix+' (path case mismatch)');continue
        if not destination.exists():errors.append(prefix+' (missing target)');continue
        if url.fragment and destination.suffix.lower() in {'.md','.markdown'}:
            anchor=unquote(url.fragment)
            if anchor not in heading_anchors(destination.read_text(encoding='utf-8-sig')):errors.append(prefix+' (missing anchor)')
    return errors


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('paths',nargs='*',type=Path);options=parser.parse_args()
    paths=options.paths or managed_markdown()
    errors=[error for path in paths for error in check_document(path.resolve())]
    for error in errors:print('markdown-check: ERROR: '+error)
    print(f'markdown-check: {"FAIL" if errors else "PASS"} ({len(paths)} files, {len(errors)} errors; external URLs not fetched)')
    return bool(errors)


if __name__=='__main__':raise SystemExit(main())
