"""Generate JSON/HTTP boundary evidence from the exact installed Python Remote."""
from importlib.metadata import version
import json

from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from app.services.persistence import Repository


config = Settings()
repo = Repository("sqlite://")
app = create_app(repository=repo, gateway=object())
client = TestClient(app)
cases = []
try:
    session = client.get("/api/auth/session")
    assert session.status_code == 200
    headers = {"Origin": config.trusted_origins[0], "X-CIRNET-CSRF": session.json()["csrf_token"]}
    project = "/api/projects"
    typed_auth = "/api/auth/login"

    def record(kind, name, body, *, path=project, profile="structural", media="application/json"):
        request_headers = dict(headers, **{"X-Request-ID": "body-oracle"})
        if media is not None:
            request_headers["Content-Type"] = media
        response = client.post(path, content=body.encode(), headers=request_headers)
        output = response.json()
        case = {"kind": kind, "name": name, "input": body, "content_type": media,
                "profile": profile, "status": response.status_code}
        if response.status_code == 201:
            case["value"] = output["name"]
        else:
            case["error"] = output.get("code")
            case["issues"] = output.get("issues", [])
            if kind == "any":
                case["value"] = output
        if kind == "syntax":
            try:
                json.loads(body.encode())
            except json.JSONDecodeError as error:
                assert case["issues"][0]["path"] == f"/body/{error.pos}", (name, case)
                case["offset"] = error.pos
            else:
                raise AssertionError(name)
        cases.append(case)

    for name, body in (
        ("missing-value-eof", '{"name":'),
        ("invalid-value-token", '{"name":oops}'),
        ("trailing-data", '{"name":"ok"}oops'),
        ("multiline", '{\n"name": @}'),
        ("unicode-codepoint-offset", '{"name":"điện😀", "other": }'),
        ("unterminated-string", '{"name":"abc'),
        ("unterminated-string-escape", '{"name":"abc\\'),
        ("invalid-escape", r'{"name":"x\q"}'),
        ("invalid-hex-escape", r'{"name":"x\u123z"}'),
        ("short-hex-escape", r'{"name":"x\u12'),
        ("bare-control-in-string", '{"name":"x\tz"}'),
        ("trailing-object-comma", '{"name":"ok", \r\n }'),
        ("trailing-array-comma", '{"name":[1, \n ]}'),
        ("array-missing-comma", '{"name":[1 \n2]}'),
        ("missing-colon", '{"name" "ok"}'),
        ("unterminated-array", '{"name":[1,'),
        ("literal-prefix", '{"name":fal}'),
        ("leading-zero", '{"name":012}'),
        ("decimal-no-digits", '{"name":1.}'),
        ("exponent-no-digits", '{"name":1e+}'),
        ("negative-no-digits", '{"name":-}'),
        ("nonfinite-trailing-invalid", '{"name":Infinityx}'),
        ("nonfinite-and-later-syntax", '{"name":[NaN, ]}'),
        ("escaped-key-then-syntax", r'{"\u006eame":"ok","x":}'),
        ("escaped-surrogate-pair-then-syntax", r'{"name":"\uD83D\uDE00","other":}'),
        ("bom-with-invalid-utf8-position", '\ufeff{"name":"é",}'),
        ("whitespace-only", ' \r\n\t '),
    ):
        record("syntax", name, body)

    for name, body in (
        ("nan", '{"name":NaN}'), ("positive-infinity", '{"name":Infinity}'),
        ("negative-infinity", '{"name":-Infinity}'), ("exponent-overflow", '{"name":1e400}'),
        ("nested-json-pointer", '{"name":{"a/b~":[0,NaN]}}'),
        ("top-level-nan", 'NaN'), ("duplicate-final-invalid", '{"name":"first","name":NaN}'),
        ("first-nonfinite-order", '{"description":Infinity,"name":NaN}'),
    ):
        record("nonfinite", name, body)
    record("nonfinite", "auth-transport-profile", '{"username":NaN,"password":"aaaaaaaaaaaa"}',
           path=typed_auth, profile="transport")
    for name, body in (
        ("quoted-nonfinite", '{"name":"Infinity and NaN and -Infinity"}'),
        ("duplicate-final-valid", '{"name":NaN,"name":"final"}'),
        ("utf8-bom-valid", '\ufeff{"name":"BOM"}'),
        ("valid-surrogate-pair", r'{"name":"\uD83D\uDE00"}'),
    ):
        record("valid", name, body)
    for name, mime in (
        ("missing-content-type", None), ("empty-content-type", ""), ("plain-text", "text/plain"),
        ("text-json", "text/json"), ("xml", "application/xml"), ("invalid-mime", "application//json"),
        ("json", "application/json"), ("mixed-case", "Application/JSON; charset=utf-8"),
        ("plus-json", "application/vnd.cirnet+json"), ("spaces", " application/json ; charset=utf-8 "),
    ):
        record("media", name, '{"name":"media"}', media=mime)
    for path in ("/api/circuits/validate", "/api/v2/circuits/validate",
                 "/api/circuits/physical-preview", "/api/v2/circuits/physical-preview"):
        record("any", path, '{broken', path=path, media="text/plain")
finally:
    client.close()
    app.state.manager.close()
    repo.close()
print(json.dumps({"fastapi": version("fastapi"), "cases": cases}, ensure_ascii=True, indent=2))
