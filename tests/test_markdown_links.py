from scripts.check_markdown import check_document, heading_anchors


def test_checks_decoded_relative_paths_duplicate_and_unicode_heading_anchors(tmp_path):
    (tmp_path/'target file.md').write_text('# Tiếng Việt\n## Same `code`\n## Same `code`\n', encoding='utf-8')
    source=tmp_path/'README.md'
    source.write_text('[ok](target%20file.md#tiếng-việt)\n[duplicate](target%20file.md#same-code-1)\n[bad](target%20file.md#absent)\n',encoding='utf-8')
    errors=check_document(source,tmp_path)
    assert len(errors)==1 and 'absent' in errors[0]


def test_reference_links_and_images_are_checked_but_code_and_remote_urls_are_not(tmp_path):
    source=tmp_path/'README.md'
    source.write_text('''# A
```md
[example](not-real.md)
```
`[inline](not-real.md)`
[remote](https://example.invalid/no-network-needed)
[missing][ref]
![image](absent.png)
[ref]: missing.md
''',encoding='utf-8')
    errors=check_document(source,tmp_path)
    assert len(errors)==2
    assert any('missing.md' in item for item in errors)
    assert any('absent.png' in item for item in errors)


def test_reports_case_mismatch_for_linux_portability_and_supports_explicit_html_anchor(tmp_path):
    (tmp_path/'Target.md').write_text('<a id="explicit"></a>\n# Intro\n',encoding='utf-8')
    source=tmp_path/'README.md'
    source.write_text('[case](target.md)\n[anchor](Target.md#explicit)\n',encoding='utf-8')
    errors=check_document(source,tmp_path)
    assert len(errors)==1 and 'case' in errors[0].lower()


def test_shortcut_reference_links_and_rendered_link_heading_text(tmp_path):
    source=tmp_path/'README.md'
    source.write_text('# [Title](https://example.invalid)\n[Missing]\n[Missing]: absent.md\n[ok](#title)\n[wrong](#titlehttpsexampleinvalid)\n',encoding='utf-8')
    errors=check_document(source,tmp_path)
    assert len(errors)==2
    assert any('absent.md' in error for error in errors)
    assert any('missing anchor' in error for error in errors)
