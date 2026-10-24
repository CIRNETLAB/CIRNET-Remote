"""Private release asset credentials stay on the initial pinned GitHub API request."""
import importlib.util
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


def downloader():
    source = ROOT / 'scripts/artifact_download.py'
    assert source.is_file(), 'authenticated immutable artifact downloader is missing'
    spec = importlib.util.spec_from_file_location('artifact_download_test', source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_private_asset_request_uses_binary_accept_and_scoped_authentication():
    module = downloader()
    request = module.artifact_request('https://api.github.com/repos/TINIHI-Labs/net-Circuit-Contracts/releases/assets/12345', token='fixture-secret')
    assert request.get_header('Authorization') == 'Bearer fixture-secret'
    assert request.get_header('Accept') == 'application/octet-stream'
    for url in ('https://github.com/org/repo/releases/download/v1.0.1/example.whl',
                'https://api.github.com.evil.test/repos/org/repo/releases/assets/12345',
                'https://api.github.com/other-api'):
        assert module.artifact_request(url, token='fixture-secret').get_header('Authorization') is None


def test_release_redirect_never_forwards_authorization_or_cookies():
    module = downloader()
    request = module.artifact_request('https://api.github.com/repos/org/repo/releases/assets/12345', token='fixture-secret')
    request.add_header('Cookie', 'fixture-cookie')
    request.add_unredirected_header('Authorization', 'Bearer fixture-secret')
    redirected = module.ArtifactRedirectHandler().redirect_request(request, None, 302, 'Found', {},
                                                                   'https://release-assets.githubusercontent.com/file.whl?signature=fixture')
    assert redirected.full_url.startswith('https://release-assets.githubusercontent.com/')
    assert all(key.lower() not in {'authorization', 'cookie', 'proxy-authorization'}
               for key, _ in redirected.header_items())


def test_artifact_redirect_cannot_downgrade_to_http():
    module = downloader()
    request = module.artifact_request('https://api.github.com/repos/org/repo/releases/assets/12345', token='fixture-secret')
    with pytest.raises(ValueError, match='HTTPS'):
        module.ArtifactRedirectHandler().redirect_request(request, None, 302, 'Found', {}, 'http://example.test/file.whl')


def test_wheel_bytes_are_verified_before_the_caller_can_write_them():
    module = downloader()
    class Response:
        url = 'https://release-assets.githubusercontent.com/file.whl'
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def read(self): return b'altered-product-artifact'
    class Opener:
        def open(self, request, timeout): return Response()
    with pytest.raises(ValueError, match='SHA256'):
        module.download_artifact('https://example.test/file.whl', '0' * 64, opener=Opener())
