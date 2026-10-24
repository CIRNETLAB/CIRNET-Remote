"""Install explicitly selected Interface release bytes into the owned session."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import uuid
from urllib.parse import urlparse
import tarfile
from scripts.artifact_download import download_artifact
from scripts.artifact_paths import artifact_directory


MAX_MEMBERS=10_000
MAX_EXPANDED_BYTES=128*1024*1024


def extract_product(contents, directory):
    directory=Path(directory)
    with tarfile.open(fileobj=io.BytesIO(contents),mode='r:gz') as archive:
        members=[]; expanded=0; targets={}; spelling={}; required_directories=set()
        for member in archive:
            if len(members)>=MAX_MEMBERS:raise ValueError('Interface product archive exceeds its member limit.')
            members.append(member)
            expanded+=member.size
            if expanded>MAX_EXPANDED_BYTES:raise ValueError('Interface product archive exceeds its expanded byte limit.')
            name=PurePosixPath(member.name)
            if (name.is_absolute() or '..' in name.parts or any(part.casefold()=='.git' for part in name.parts)
                    or '\\' in member.name or ':' in member.name or member.issym() or member.islnk()
                    or not (member.isfile() or member.isdir())):
                raise ValueError('Interface product archive contains an unsafe path, alias or special file.')
            if not name.parts:
                if not member.isdir():raise ValueError('Interface archive root must be a directory.')
                continue
            if any(part.endswith(('.', ' ')) or re.fullmatch(r'(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?',part,re.IGNORECASE) for part in name.parts):
                raise ValueError('Interface product archive contains an unsafe Windows path alias.')
            normalized=name.as_posix(); key=normalized.casefold()
            for index in range(1,len(name.parts)+1):
                prefix='/'.join(name.parts[:index]); folded=prefix.casefold()
                if folded in spelling and spelling[folded]!=prefix:
                    raise ValueError('Interface product archive contains case-colliding paths.')
                spelling[folded]=prefix
            if key in targets:raise ValueError('Interface product archive contains duplicate paths.')
            if member.isfile() and key in required_directories:
                raise ValueError('Interface product archive contains a file/directory collision.')
            for index in range(1,len(name.parts)):
                ancestor='/'.join(name.parts[:index]).casefold()
                if targets.get(ancestor)=='file':raise ValueError('Interface product archive contains a file/directory collision.')
                required_directories.add(ancestor)
            targets[key]='file' if member.isfile() else 'directory' 
        if not any(member.name.removeprefix('./')=='package.json' and member.isfile() for member in members):
            raise ValueError('The Interface product must contain package.json at its archive root.')
        manifest=next(member for member in members if member.name.removeprefix('./')=='package.json')
        if json.loads(archive.extractfile(manifest).read()).get('version')!='0.1.0-m2.0':
            raise ValueError('Expected the reviewed Interface product version 0.1.0-m2.0.')
        metadata=next((member for member in members if member.name.removeprefix('./')=='interface-artifact.json' and member.isfile()),None)
        if metadata is None:raise ValueError('The Interface source product requires interface-artifact.json at its archive root.')
        identity=json.loads(archive.extractfile(metadata).read())
        if (identity.get('schema')!=1 or identity.get('name')!='netcircuit-interface'
                or identity.get('version')!='0.1.0-m2.0' or identity.get('kind')!='source'
                or identity.get('contractsVersion')!='1.0.1'
                or not re.fullmatch('[0-9a-f]{64}',identity.get('sourceFingerprint',''))):
            raise ValueError('The Interface source product metadata does not match the reviewed version and Contracts set.')
        source=identity.get('source',{})
        if not isinstance(source,dict):raise ValueError('Interface source provenance is required.')
        repository=urlparse(source.get('repository',''))
        if (repository.scheme!='https' or not repository.hostname or repository.username or repository.password
                or not repository.path.endswith('.git') or repository.query or repository.fragment
                or not re.fullmatch('[0-9a-f]{40}',source.get('revision',''))
                or type(source.get('uncommittedMigration')) is not bool):
            raise ValueError('Interface source provenance requires an exact repository, revision and migration state.')
        fingerprint=hashlib.sha256()
        files=sorted((PurePosixPath(member.name).as_posix(),member) for member in members if member.isfile())
        for name,member in files:
            if name in ('interface-artifact.json','migration/verification.md'):continue
            fingerprint.update((hashlib.sha256(archive.extractfile(member).read()).hexdigest()+'  '+name+'\n').encode())
        if fingerprint.hexdigest()!=identity['sourceFingerprint']:
            raise ValueError('Interface source fingerprint does not match the exported product bytes.')
        # Only this fresh child is owned by the installer. Never erase an
        # existing product or another allocator session after an extraction error.
        directory.mkdir(exist_ok=False)
        owned=directory.resolve(strict=True); parent=directory.parent.resolve(strict=True)
        if owned.parent!=parent:raise ValueError('Interface extraction target escaped its intended parent.')
        try:
            archive.extractall(owned,members=members,filter='data')
        except BaseException:
            resolved=directory.resolve(strict=True)
            if resolved!=owned or resolved.parent!=parent:
                raise RuntimeError('Refusing cleanup because the owned Interface product path changed.')
            shutil.rmtree(resolved)
            raise
    return directory


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--github-env',type=Path)
    arguments=parser.parse_args(argv)
    url=os.environ.get('NETCIRCUIT_INTERFACE_ARTIFACT_URL')
    digest=os.environ.get('NETCIRCUIT_INTERFACE_ARTIFACT_SHA256')
    if not url or not digest:
        parser.error('Configure exact NETCIRCUIT_INTERFACE_ARTIFACT_URL/SHA256 for a reviewed exported Interface product; no retained-source fallback is allowed.')
    # HTTPS redirect/authentication and exact SHA256 verification are shared
    # with the existing immutable Contracts consumer, before any extraction.
    contents=download_artifact(url,digest)
    directory=extract_product(contents,artifact_directory('interface-products')/('product-'+uuid.uuid4().hex))
    if arguments.github_env:
        with arguments.github_env.open('a',encoding='utf-8') as output:
            output.write('NETCIRCUIT_INTERFACE_ROOT='+str(directory)+'\n')
    print(json.dumps({'interfaceRoot':str(directory)}))
    return 0


if __name__=='__main__':raise SystemExit(main())
