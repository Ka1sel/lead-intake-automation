import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { normalizeLead, qualifyLead, prepareHandoff } from '../src/qualification.mjs';

const samples = JSON.parse(readFileSync(new URL('../examples/leads.json', import.meta.url)));
const workflow = JSON.parse(readFileSync(new URL('../workflows/lead-intake.json', import.meta.url)));
const base = samples[0].input;
const node = name => workflow.nodes.find(item => item.name === name);
const run = (name, input) => JSON.parse(JSON.stringify(vm.runInNewContext(
  `(function(){${node(name).parameters.jsCode}})()`,
  { $input: { all: () => [{ json: structuredClone(input) }] } },
  { timeout: 1000 },
)))[0].json;

for (const service of ['email-workflows', 'form-to-sheets']) {
  for (const [timeline, priority] of [['this-month', 'Priority'], ['next-quarter', 'Standard'], ['exploring', 'Discovery']]) {
    test(`${service} / ${timeline} gets ${priority} and an unsent draft`, () => {
      const normalized = normalizeLead({ ...base, service, timeline });
      assert.equal(normalized.valid, true);
      const qualification = qualifyLead(normalized.lead);
      assert.equal(qualification.priority, priority);
      assert.equal('score' in qualification, false);
      assert.equal(qualification.reasons.length, 3);
      const handoff = prepareHandoff(normalized.lead, qualification);
      assert.equal(handoff.draft.automaticallySent, false);
      assert.equal(handoff.draft.to, base.email.toLowerCase());
      assert.equal(handoff.nextStep, qualification.nextStep);
    });
  }
}

test('omitted and null budgets are accepted and explained as undecided', () => {
  const { budgetUsd, ...withoutBudget } = base;
  for (const input of [withoutBudget, { ...base, budgetUsd: null }]) {
    const result = normalizeLead(input);
    assert.equal(result.valid, true);
    assert.equal(result.lead.budgetUsd, null);
    assert.match(qualifyLead(result.lead).reasons[2], /undecided/);
  }
});
test('zero is preserved and budget never changes timeline priority', () => {
  for (const budgetUsd of [0, 100, 5000, 1000000]) {
    const result = normalizeLead({ ...base, budgetUsd });
    assert.equal(result.lead.budgetUsd, budgetUsd);
    assert.equal(qualifyLead(result.lead).priority, 'Priority');
  }
});
test('normalizes contact data and discards unsupported fields', () => {
  const result = normalizeLead({ ...base, name: ' Alex Rivera ', email: ' ALEX@example.com ', admin: true });
  assert.equal(result.lead.name, 'Alex Rivera');
  assert.equal(result.lead.email, 'alex@example.com');
  assert.equal('admin' in result.lead, false);
});
test('rejects missing fields, bad shapes and multiline contact fields', () => {
  for (const input of [null, [], {}, 'text', { ...base, email: 'invalid' }, { ...base, message: 'short' }, { ...base, name: 'Alex\nOther' }]) {
    assert.equal(normalizeLead(input).valid, false);
  }
});
test('rejects unsupported service, timeline, budget values and non-boolean consent', () => {
  for (const patch of [{ service: 'automation' }, { service: 'social-media-management' }, { timeline: 'tomorrow' }, { budgetUsd: '100' }, { budgetUsd: '' }, { budgetUsd: -1 }, { budgetUsd: 1.5 }, { budgetUsd: 1000001 }, { consent: false }, { consent: 'true' }, { consent: undefined }]) {
    assert.equal(normalizeLead({ ...base, ...patch }).valid, false);
  }
});
test('generated Code nodes agree with the source for accepted and rejected requests', () => {
  for (const sample of samples) {
    const validated = run('Validate Inquiry', { body: sample.input });
    assert.deepEqual(validated, normalizeLead(sample.input));
    const qualified = run('Qualify Lead', validated);
    assert.deepEqual(qualified.qualification, qualifyLead(validated.lead));
    assert.equal(qualified.qualification.priority, sample.expectedPriority);
    const prepared = run('Prepare Review Handoff', qualified);
    assert.deepEqual(prepared.handoff, prepareHandoff(qualified.lead, qualified.qualification));
  }
  assert.equal(run('Validate Inquiry', { body: { ...base, consent: false } }).valid, false);
});
test('valid requests reach Sheets before success and invalid requests bypass Sheets', () => {
  const edges = name => workflow.connections[name].main.map(output => output.map(edge => edge.node));
  assert.deepEqual(edges('Valid Inquiry?'), [['Qualify Lead'], ['Return Validation Errors']]);
  assert.equal(node('Valid Inquiry?').parameters.conditions.conditions[0].leftValue, '={{ $json.valid }}');
  assert.deepEqual(edges('Prepare Review Handoff'), [['Save Inquiry']]);
  assert.deepEqual(edges('Save Inquiry'), [['Return Qualified Lead']]);
  assert.equal(node('Return Validation Errors').parameters.options.responseCode, 422);
  assert.equal(node('Return Qualified Lead').parameters.responseBody, "={{ $('Prepare Review Handoff').item.json }}");
});
test('Sheets appends eleven mapped fields and represents an undecided budget correctly', () => {
  const parameters = node('Save Inquiry').parameters;
  assert.equal(parameters.operation, 'append');
  assert.equal(Object.keys(parameters.columns.value).length, 11);
  assert.equal(parameters.columns.value['Review Status'], 'New');
  assert.match(parameters.columns.value['Budget USD'], /\?\? 'Undecided'/);
  assert.match(parameters.columns.value['Received At'], /Asia\/Taipei/);
});
test('shareable workflow is inactive, has a webhook identifier and no account bindings', () => {
  assert.equal(workflow.nodes.length, 8);
  assert.equal(workflow.active, false);
  assert.match(node('Receive Inquiry').webhookId, /^[a-f0-9-]{36}$/);
  const raw = JSON.stringify(workflow);
  for (const key of ['credentials', 'pinData', 'meta', 'cachedResultUrl', 'cachedResultName']) assert.equal(raw.includes(`"${key}"`), false);
  assert.equal(node('Save Inquiry').parameters.documentId.value, 'REPLACE_SPREADSHEET_ID');
});
