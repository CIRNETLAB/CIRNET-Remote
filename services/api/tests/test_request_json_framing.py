"""JSON encoding must not bypass preparse byte/depth budgets."""
import asyncio
import codecs
import json

import pytest
from starlette.responses import JSONResponse
from app.config import Settings
from app.services.request_limits import RequestBudgetMiddleware


def probe(body):
    forwarded=[];messages=[]
    async def application(scope,receive,send):
        forwarded.append((await receive())['body'])
        await JSONResponse({'accepted':True})(scope,receive,send)
    async def receive():return {'type':'http.request','body':body,'more_body':False}
    async def send(message):messages.append(message)
    scope={'type':'http','path':'/api/experiments','method':'POST','headers':[(b'content-type',b'application/json')]}
    asyncio.run(RequestBudgetMiddleware(application,Settings())(scope,receive,send))
    return messages[0]['status'],json.loads(messages[-1]['body']),forwarded


@pytest.mark.parametrize('encoding,bom',[
    ('utf-16-le',b''),('utf-16-be',b''),('utf-32-le',b''),('utf-32-be',b''),
    ('utf-16-le',codecs.BOM_UTF16_LE),('utf-16-be',codecs.BOM_UTF16_BE),
    ('utf-32-le',codecs.BOM_UTF32_LE),('utf-32-be',codecs.BOM_UTF32_BE),
],ids=['16le','16be','32le','32be','16le-bom','16be-bom','32le-bom','32be-bom'])
def test_non_utf8_json_is_rejected_before_escaped_quote_can_hide_nesting(encoding,bom):
    # A raw-byte escape scanner incorrectly closes the escaped quote when the
    # encoding inserts a zero byte between backslash and quote, hiding depth.
    source=json.dumps({'note':'escaped " quote','nested':[]}).replace('[]','['*70+'0'+']'*70)
    status,body,forwarded=probe(bom+source.encode(encoding))
    assert status==400 and body['code']=='INVALID_REQUEST_FRAMING'
    assert not forwarded


@pytest.mark.parametrize('body',[b'{"note":"\x00"}',b'{"note":"\xff"}'],ids=['raw-nul','invalid-utf8'])
def test_invalid_utf8_framing_has_controlled_error_before_parse(body):
    status,value,forwarded=probe(body)
    assert status==400 and value['code']=='INVALID_REQUEST_FRAMING'
    assert not forwarded


@pytest.mark.parametrize('bom',[b'',codecs.BOM_UTF8],ids=['plain','utf8-bom'])
def test_valid_utf8_quotes_unicode_and_near_two_megabyte_document_remain_supported(bom):
    graph={'schema_version':'1.0','circuit_id':'utf8','modules':[],'connections':[],
           'metadata':{'note':'escaped " quote, braces [ ] { }, tiếng Việt','padding':'x'*1_990_000}}
    encoded=bom+json.dumps(graph,ensure_ascii=False).encode('utf-8')
    status,_,forwarded=probe(encoded)
    assert status==200 and forwarded==[encoded]
    assert json.loads(forwarded[0])==graph


@pytest.mark.parametrize('bom',[b'',codecs.BOM_UTF8],ids=['plain','utf8-bom'])
def test_valid_utf8_escape_sequences_cannot_hide_real_excessive_nesting(bom):
    source=json.dumps({'note':'escaped " quote','nested':[]}).replace('[]','['*70+'0'+']'*70)
    status,body,forwarded=probe(bom+source.encode('utf-8'))
    assert status==400 and body['code']=='REQUEST_COMPLEXITY_EXCEEDED'
    assert not forwarded
