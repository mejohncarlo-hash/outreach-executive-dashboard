import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../cloudflare/worker.ts', import.meta.url), 'utf8');
function worker(fetch) {
  const context = { exports: {}, require: (name) => name === '../lib/outreach-data' ? {} : require(name), fetch, Response, Request, URL, Intl, Date, console, TextEncoder };
  vm.runInNewContext(ts.transpileModule(source + '\nexport { handleExecutiveReview, appendNotionComment };', { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports;
}
const id = '00000000-0000-4000-8000-000000000005';
const page = { id, properties: { Placement: { title: [{ plain_text: 'Example Publisher' }] }, Status: { select: { name: 'Pending Internal Review' } }, Decision: { select: { name: 'Pending Executive Review' } }, 'Link Category': { select: { name: 'Free' } } } };
const request = () => new Request('https://example.com/api/review', { method: 'POST', body: JSON.stringify({ placementId: id, action: 'decline', comment: 'x'.repeat(2000) }) });
test('long decision comments preserve all text within Notion item limits', async () => {
  let body;
  const api = worker(async (_, options) => { body = JSON.parse(options.body); return Response.json({}); });
  const text = 'Declined by Executive: ' + 'x'.repeat(2000);
  await api.appendNotionComment('token', id, text);
  assert.equal(body.rich_text.map(item => item.text.content).join(''), text);
  assert.ok(body.rich_text.every(item => item.text.content.length <= 2000));
});
test('failed comment leaves pending properties untouched', async () => {
  const writes = [];
  const api = worker(async (url, options = {}) => {
    if (!options.method && String(url).includes('/comments')) return Response.json({ results: [] });
    if (!options.method) return Response.json(page);
    writes.push([url, options.method]);
    return Response.json({}, { status: 403 });
  });
  const response = await api.handleExecutiveReview(request(), { NOTION_API_TOKEN: 'token' }, { email: 'executive@example.com' });
  assert.equal(response.status, 502);
  assert.equal(writes.length, 1);
  assert.ok(writes[0][0].endsWith('/comments'));
});
test('comment saved before decline and matching retries avoid duplicates', async () => {
  for (const existing of [false, true]) {
    const writes = [];
    const api = worker(async (url, options = {}) => {
      if (!options.method && String(url).includes('/comments')) return Response.json({ results: existing ? [{ rich_text: [{ plain_text: 'Declined in Executive Dashboard by Executive: ' + 'x'.repeat(2000) }] }] : [] });
      if (!options.method) return Response.json(page);
      writes.push([url, options.method]);
      return Response.json({ id, properties: {} });
    });
    const response = await api.handleExecutiveReview(request(), { NOTION_API_TOKEN: 'token' }, { email: 'executive@example.com' });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).commentSynced, true);
    assert.equal(writes.filter(([url]) => url.endsWith('/comments')).length, existing ? 0 : 1);
    assert.equal(writes[existing ? 0 : 1][1], 'PATCH');
  }
});
