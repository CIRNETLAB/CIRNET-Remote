"""Download pinned release bytes with authentication confined to GitHub's API."""
import hashlib
import os
import re
from urllib.parse import urljoin, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener


def checked_https(url):
    parsed = urlparse(url)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('Artifact requests and redirects require HTTPS without URL credentials.')
    if 'latest' in parsed.path.lower().split('/'):
        raise ValueError('Artifact URLs must identify an exact release asset, not latest.')
    return parsed


def artifact_request(url, *, token=None):
    parsed = checked_https(url)
    headers = {'User-Agent': 'netcircuit-artifact-consumer'}
    private_asset = (parsed.hostname == 'api.github.com' and parsed.port in (None, 443)
        and re.fullmatch(r'/repos/[^/]+/[^/]+/releases/assets/[0-9]+', parsed.path) is not None)
    if private_asset:
        headers['Accept'] = 'application/octet-stream'
        credential = token if token is not None else os.environ.get('NETCIRCUIT_ARTIFACTS_TOKEN')
        if credential:
            headers['Authorization'] = 'Bearer ' + credential
    return Request(url, headers=headers)


class ArtifactRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        selected = urljoin(request.full_url, newurl)
        checked_https(selected)
        redirected = super().redirect_request(request, fp, code, message, headers, selected)
        if redirected is not None:
            for collection in (redirected.headers, redirected.unredirected_hdrs):
                for name in tuple(collection):
                    if name.lower() in {'authorization', 'cookie', 'proxy-authorization'}:
                        collection.pop(name)
        return redirected


def download_artifact(url, digest, *, token=None, opener=None):
    if not re.fullmatch(r'[0-9a-fA-F]{64}', digest or ''):
        raise ValueError('An exact artifact SHA256 is required before download.')
    request = artifact_request(url, token=token)
    selected = opener or build_opener(ArtifactRedirectHandler())
    with selected.open(request, timeout=60) as response:
        checked_https(response.url)
        contents = response.read()
    if hashlib.sha256(contents).hexdigest() != digest.lower():
        raise ValueError('Downloaded artifact SHA256 does not match the selected release.')
    return contents
