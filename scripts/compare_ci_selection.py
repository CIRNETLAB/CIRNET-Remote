"""Compare the full Python run and the advisory CI selection on the same inputs."""

import argparse
from collections import Counter
import json
import os
from pathlib import Path
import re


OUTCOMES = {'PASS', 'FAIL', 'SKIP', 'XFAIL', 'XPASS', 'NOT_RUN'}


def matches_target(nodeid, target):
    path = nodeid.partition('::')[0]
    return path == target or path.startswith(target + '/')


def compare(full, selected, *, expected_candidate=None):
    def unavailable(reason):
        return {'status': 'NOT_VERIFIED', 'reason': reason}

    for kind, receipt in (('full', full), ('selected', selected)):
        if not isinstance(receipt, dict) or receipt.get('schema') != 1 or receipt.get('kind') != kind:
            return unavailable(f'Missing or invalid {kind} receipt.')
        candidate = receipt.get('candidate')
        inputs = receipt.get('inputs')
        if not isinstance(candidate, str) or not re.fullmatch(r'[0-9a-f]{40}', candidate) or not isinstance(inputs, dict) or not inputs:
            return unavailable(f'Missing {kind} candidate or input provenance.')
        if receipt.get('exitCode') not in (0, 1):
            return unavailable(f'The {kind} pytest run did not complete normally.')
        collection = receipt.get('collected')
        if (not isinstance(collection, list) or not collection or not all(isinstance(nodeid, str) for nodeid in collection)
                or len(set(collection)) != len(collection)):
            return unavailable(f'Missing or ambiguous {kind} test collection.')
        outcomes = receipt.get('outcomes')
        if not isinstance(outcomes, dict) or any(
                not isinstance(row, dict) or not isinstance(row.get('status'), str) or row['status'] not in OUTCOMES
                for row in outcomes.values()):
            return unavailable(f'Invalid {kind} test outcomes.')

    if full['candidate'] != selected['candidate'] or full['inputs'] != selected['inputs']:
        return unavailable('Candidate revision or verified input provenance differs.')
    if expected_candidate is not None and full['candidate'] != expected_candidate:
        return unavailable('The two receipts do not belong to the current CI candidate.')
    collected = set(full['collected'])
    if collected != set(selected['collected']):
        return unavailable('The two jobs collected different case IDs before selection.')

    decision = selected.get('decision')
    if not isinstance(decision, dict):
        return unavailable('The selected job did not record a decision.')
    mode, targets = decision.get('mode'), decision.get('targets')
    if mode == 'full' and targets == []:
        expected = collected
    elif mode == 'selected' and isinstance(targets, list) and targets and all(isinstance(target, str) and target for target in targets):
        if decision.get('candidate') != selected['candidate']:
            return unavailable('The selected decision does not identify the observed candidate.')
        expected = {nodeid for nodeid in collected if any(matches_target(nodeid, target) for target in targets)}
        if not expected:
            return unavailable('No collected tests matched the selected paths.')
    else:
        return unavailable('The selected job recorded an invalid decision.')

    reference, actual = full['outcomes'], selected['outcomes']
    full_ids, selected_ids = set(reference), set(actual)
    differences = {
        'missingFull': sorted(collected - full_ids),
        'unexpectedFull': sorted(full_ids - collected),
        'missingSelected': sorted(expected - selected_ids),
        'unexpectedSelected': sorted(selected_ids - expected),
        'outcomeDifferences': sorted(nodeid for nodeid in full_ids & selected_ids if reference[nodeid] != actual[nodeid]),
        'missedFailures': sorted(nodeid for nodeid in full_ids - selected_ids if reference[nodeid]['status'] in {'FAIL', 'XPASS'}),
    }
    counts = {kind: dict(Counter(row['status'] for row in receipt['outcomes'].values()))
              for kind, receipt in (('full', full), ('selected', selected))}
    failed = (any(differences.values()) or full['exitCode'] != 0 or selected['exitCode'] != 0
              or any({'FAIL', 'XPASS', 'NOT_RUN'} & totals.keys() for totals in counts.values()))
    return {'status': 'FAIL' if failed else 'PASS', 'candidate': full['candidate'], 'decision': decision,
            'counts': counts, 'unselected': sorted(collected - expected), **differences}


def load_receipt(path):
    try:
        value = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, UnicodeError, ValueError):
        return None
    return value


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('full', type=Path)
    parser.add_argument('selected', type=Path)
    args = parser.parse_args(argv)
    from scripts.artifact_paths import artifact_directory

    result = compare(load_receipt(args.full), load_receipt(args.selected), expected_candidate=os.environ.get('GITHUB_SHA'))
    report = artifact_directory('ci-selection') / 'comparison.json'
    report.write_text(json.dumps(result, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    print(f"CI selector observation: {result['status']}")
    if 'counts' in result:
        print(f"Full outcomes: {result['counts']['full']}")
        print(f"Selected outcomes: {result['counts']['selected']}")
        print(f"Cases outside selection: {len(result['unselected'])}")
        print(f"Full-run failures absent from selection: {len(result['missedFailures'])}")
    else:
        print(result['reason'])
    return 0 if result['status'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
