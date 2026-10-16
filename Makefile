PYTHON ?= python3
.PHONY: context-check test dev-info contracts-generate contracts-check web-boundaries contracts-suite python-check web-check postgres-check browser-check package-check release-check load-check

context-check:
	$(PYTHON) scripts/check_context.py

test:
	$(PYTHON) scripts/check_release.py --group python

dev-info:
	$(PYTHON) scripts/dev-info.py

contracts-generate:
	$(PYTHON) scripts/generate_contracts.py
	$(PYTHON) scripts/generate_hardware_rpc.py

contracts-check:
	$(PYTHON) scripts/generate_contracts.py --check

web-boundaries:
	cd apps/web && npm run check:boundaries

contracts-suite:
	$(PYTHON) scripts/check_release.py --group contracts

python-check:
	$(PYTHON) scripts/check_release.py --group python

web-check:
	$(PYTHON) scripts/check_release.py --group web

postgres-check:
	$(PYTHON) scripts/check_release.py --group postgres

browser-check:
	$(PYTHON) scripts/check_release.py --group browser

package-check:
	$(PYTHON) scripts/check_release.py --group package

release-check:
	$(PYTHON) scripts/check_release.py --group all

load-check:
	$(PYTHON) scripts/check_release.py --group load
