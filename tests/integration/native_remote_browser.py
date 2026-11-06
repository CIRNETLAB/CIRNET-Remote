"""Drive the released Interface with Playwright Python over a same-origin proxy."""
import asyncio
from hashlib import sha256
from importlib.metadata import version
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit

from playwright.async_api import async_playwright, expect

expect.set_options(timeout=10000)

def path(request):
    return urlsplit(request.url).path


def posts(response, pattern):
    return response.request.method == "POST" and re.fullmatch(pattern, path(response))


async def import_graph(page, name, graph):
    await page.get_by_label("Open circuit file", exact=True).set_input_files({
        "name": name, "mimeType": "application/json", "buffer": json.dumps(graph).encode(),
    })
    await expect(page.locator(".project-title")).to_contain_text(graph["metadata"]["name"])


async def inspector(page):
    await page.get_by_role("button", name="Open Inspector", exact=True).click()
    status = page.locator(".window-note").filter(has_text=re.compile(r"^Events:"))
    await expect(status).to_have_text(re.compile(r"^Events: connected\."))
    return status


async def run_button(page, name):
    await page.get_by_role("tab", name="Run", exact=True).click()
    return page.get_by_role("toolbar", name="Execution controls", exact=True).get_by_role(
        "button", name=name, exact=True,
    )


async def record_until(context, identity, deadline=20):
    async with asyncio.timeout(deadline):
        while True:
            response = await context.request.get(f"/api/experiments/{identity}", timeout=5000)
            assert response.status == 200
            record = await response.json()
            assert record["state"] != "FAULT", record
            if record["state"] == "COMPLETE":
                return record
            await asyncio.sleep(.05)


async def released_run(page, context, workload, lane):
    streams = []
    active = []

    async def connect(route):
        server = route.connect_to_server()
        active.append((route, server))

        def receive(message):
            if isinstance(message, str):
                event = json.loads(message)
                if event["type"] == "hello":
                    assert event["protocol_version"] == "1.0"
                    assert event["resync_required"] is True
                    streams.append(event["stream_id"])
            route.send(message)

        server.on_message(receive)

    await page.route_web_socket("**/ws/events", connect)
    assert (await page.goto("/")).status == 200
    await expect(page.get_by_label("Three-dimensional circuit workspace", exact=True)).to_be_visible()
    await page.get_by_role("button", name="Open account", exact=True).click()
    await page.get_by_label("Username", exact=True).fill("e2e_admin")
    await page.get_by_label("Password", exact=True).fill(os.environ["CIRNET_E2E_ADMIN_PASSWORD"])
    async with page.expect_response(lambda response: posts(response, r"/api/auth/login")) as login:
        await page.get_by_role("button", name="Sign in", exact=True).click()
    assert (await login.value).status == 200
    await expect(page.get_by_role("button", name="Sign out", exact=True)).to_be_visible()
    await page.get_by_role("button", name="Close account", exact=True).click()
    await import_graph(page, "and.json", workload["graph"])
    status = await inspector(page)
    assert streams
    before = len(streams)
    route, server = active[-1]
    # Close the real Remote connection and the routed browser socket. Observe
    # a second server hello before accepting the application's reconciled UI.
    server.close(code=1012, reason="test reconnect")
    await route.close(code=1012, reason="test reconnect")
    async with asyncio.timeout(15):
        while len(streams) == before:
            await asyncio.sleep(.05)
    assert len(streams) == before + 1 and streams[-1] != streams[-2]
    await expect(status).to_have_text(re.compile(r"^Events: connected\."), timeout=15000)

    configuration = workload["configuration"]
    for label, value in {
        "Capture duration (ns)": configuration["duration_ns"],
        "Capture signals": ",".join(configuration["signals"]),
        "Capture maximum events": configuration["max_events"],
    }.items():
        field = page.get_by_label(label, exact=True)
        await field.fill(str(value))
        await field.press("Tab")
    vector, = workload["vectors"]
    await page.get_by_label("Test vector time (ns)", exact=True).fill(str(vector["time_ns"]))
    await page.get_by_label("Test vector inputs", exact=True).fill(
        ",".join(f"{name}={value}" for name, value in vector["inputs"].items()),
    )
    await page.get_by_role("button", name="Add test vector", exact=True).click()
    await page.get_by_role("button", name="Close Inspector", exact=True).click()

    async with page.expect_response(lambda response: posts(response, r"/api/(?:v2/)?experiments")) as create:
        async with page.expect_response(
            lambda response: posts(response, r"/api/(?:v2/)?experiments/[^/]+/run"),
        ) as run:
            await (await run_button(page, "Run")).click()
    created = await create.value
    run_status = (await run.value).status
    assert created.status == 201 and run_status == 200
    submitted = created.request.post_data_json
    assert submitted["capture_config"] == configuration
    assert submitted["test_vectors"] == workload["vectors"]
    identity = (await created.json())["experiment_id"]
    record = await record_until(context, identity)
    assert record["capture"]["available"] is True

    await page.get_by_role("button", name="File", exact=True).click()
    await page.get_by_role("menu", name="File", exact=True).get_by_role(
        "menuitem", name="History", exact=True,
    ).click()
    history = page.get_by_role("region", name="Experiment history and queue", exact=True)
    await history.get_by_role("button", name="Refresh execution history", exact=True).click()
    await history.get_by_role("button", name=f"Read experiment {identity}", exact=True).click()
    await history.get_by_role("button", name="Open selected capture", exact=True).click()
    await expect(page.get_by_role("img", name="Observed digital event traces", exact=True)).to_be_visible()
    trace = page.locator('path.observed-trace[data-signal="G.Y1"]')
    await expect(trace).to_have_attribute("d", re.compile("V8"))
    capture = record["capture"]
    response = await context.request.get(
        f"/api/captures/{capture['capture_id']}/payload",
        headers={"Accept": "application/vnd.cirnet.capture; version=1"},
    )
    assert response.status == 200
    payload = await response.body()
    assert payload[:4] == b"NCAP" and len(payload) == capture["payload_byte_count"]
    assert sha256(payload).hexdigest() == capture["sha256"]
    (lane / "capture.ncap").write_bytes(payload)
    await page.screenshot(path=lane / "capture.png")
    return {
        "reconnected": True, "state": record["state"], "trace": await trace.get_attribute("d"),
        "capture_bytes": len(payload), "capture_sha256": capture["sha256"],
        "create_status": created.status, "run_status": run_status,
    }


async def physical_preview_and_stop(page, context, graph):
    assert (await page.goto("/")).status == 200
    await import_graph(page, "physical-hc08-led.json", graph)
    await inspector(page)
    await page.get_by_role("button", name="Close Inspector", exact=True).click()

    loop = asyncio.get_running_loop()
    committed = loop.create_future()
    release = asyncio.Event()
    counts = dict(create=0, run=0, stop=0)
    experiment = r"/api/(?:v2/)?experiments"

    def count(request):
        if request.method == "POST":
            for name, pattern in (("create", experiment), ("run", experiment + r"/[^/]+/run"),
                                  ("stop", experiment + r"/[^/]+/stop")):
                if re.fullmatch(pattern, path(request)):
                    counts[name] += 1

    async def hold_create(route):
        if route.request.method != "POST":
            await route.continue_()
            return
        try:
            response = await route.fetch(max_retries=0, timeout=10000)
            assert response.status == 201, await response.text()
            committed.set_result(await response.json())
            await release.wait()
            await route.abort("connectionreset")
        except Exception as error:
            if not committed.done():
                committed.set_exception(error)
            else:
                raise

    page.on("request", count)
    await page.route(re.compile(experiment + "$"), hold_create)
    try:
        async with page.expect_response(
            lambda response: posts(response, r"/api/circuits/physical-preview"),
        ) as preview:
            await (await run_button(page, "Run")).click()
        response = await preview.value
        assert response.status == 200
        presentation = await response.json()
        assert presentation["device_states"]["D1"]["state"] == "ON"
        assert presentation["pin_values"]
        created = await asyncio.wait_for(committed, 12)
        assert created["state"] == "CREATED"
        identity = created["experiment_id"]
        assert (await context.request.get(f"/api/experiments/{identity}")).status == 200
        async with page.expect_response(
            lambda response: posts(response, experiment + r"/" + identity + "/stop"),
        ) as stop:
            await (await run_button(page, "Stop")).click()
            release.set()
        assert (await stop.value).status == 200
        final = await record_until(context, identity)
        assert final["error_code"] == "STOPPED" and final["capture"] is None
        assert counts == {"create": 1, "run": 0, "stop": 1}
        return {"preview_status": response.status, "preview": presentation,
                "terminal": final["state"], "stop_error": final["error_code"], "requests": counts}
    finally:
        release.set()


async def main(origin, executable, lane):
    assert origin == "http://127.0.0.1:14173" and executable.is_file()
    workload = json.loads((lane / "workload.json").read_bytes())
    async with async_playwright() as runtime:
        browser = await runtime.chromium.launch(
            executable_path=executable, headless=True, args=[
                "--use-gl=angle", "--use-angle=swiftshader",
                "--enable-unsafe-swiftshader", "--disable-gpu-compositing",
            ],
        )
        assert browser.version == "156.0.8078.4"
        context = await browser.new_context(base_url=origin, viewport={"width": 1440, "height": 1000})
        page = await context.new_page()
        errors = []
        try:
            for step in ("run", "stop"):
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.set_default_timeout(12000)
                if step == "run":
                    run = await released_run(page, context, workload, lane)
                    await page.close()
                    page = await context.new_page()
                else:
                    stop = await physical_preview_and_stop(page, context, workload["physical"])
            assert not errors, errors
            (lane / "python-browser.json").write_text(json.dumps({
                "playwright": version("playwright"), "chromium": browser.version,
                "run": run, "physical_stop": stop,
            }, indent=2) + "\n", encoding="utf-8")
        except BaseException:
            if not page.is_closed():
                try:
                    await page.screenshot(path=lane / "failure.png", timeout=3000)
                except Exception:
                    pass
            raise
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])))
