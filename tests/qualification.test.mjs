import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {normalizeLead, qualifyLead, prepareHandoff} from '../src/qualification.mjs';

const samples = JSON.parse(readFileSync(new URL('../examples/leads.json',import.meta.url)));
const workflow = JSON.parse(readFileSync(new URL('../workflows/lead-intake.json',import.meta.url)));
const base = samples[0].input;

for(const sample of samples) {
  test(`${sample.id} inquiry gets the expected qualification and unsent draft`, () => {
    const normalized=normalizeLead(sample.input);
    assert.equal(normalized.valid,true);
    const qualification=qualifyLead(normalized.lead);
    assert.equal(qualification.priority,sample.expectedPriority);
    assert.equal(qualification.score,qualification.reasons.reduce((sum,item)=>sum+item.points,0));
    const handoff=prepareHandoff(normalized.lead,qualification);
    assert.equal(handoff.draft.automaticallySent,false);
    assert.equal(handoff.draft.to,sample.input.email.toLowerCase());
  });
}
test('normalizes spaces and email case without retaining extra fields',()=>{
  const result=normalizeLead({...base,name:' Alex Rivera ',email:' ALEX@example.com ',admin:true});
  assert.equal(result.lead.name,'Alex Rivera');
  assert.equal(result.lead.email,'alex@example.com');
  assert.equal('admin' in result.lead,false);
});
test('rejects malformed objects and missing required fields',()=>{
  for(const input of [null,[],{},'text',{...base,email:'invalid'},{...base,message:'short'},{...base,name:'a'}]) assert.equal(normalizeLead(input).valid,false);
});
test('rejects unsupported enum values, numeric coercion and missing consent',()=>{
  for(const patch of [{service:'anything'},{timeline:'tomorrow'},{budgetUsd:'5000'},{budgetUsd:-1},{budgetUsd:Infinity},{budgetUsd:1.5},{budgetUsd:1000001},{consent:false},{consent:'true'}]) {
    assert.equal(normalizeLead({...base,...patch}).valid,false);
  }
});
test('rejects newline injection in contact fields and oversized message',()=>{
  for(const patch of [{name:'Alex\nBcc: other@example.com'},{email:'alex@example.com\r\nBcc: other@example.com'},{message:'x'.repeat(4001)}]) assert.equal(normalizeLead({...base,...patch}).valid,false);
});
test('qualification thresholds are deterministic at the boundaries',()=>{
  assert.equal(qualifyLead({...base,budgetUsd:999,timeline:'exploring'}).score,35);
  assert.equal(qualifyLead({...base,budgetUsd:1000,timeline:'exploring'}).score,55);
  assert.equal(qualifyLead({...base,budgetUsd:4999,timeline:'this-month'}).priority,'Priority');
  assert.equal(qualifyLead({...base,budgetUsd:5000,timeline:'exploring'}).score,70);
});
test('exported n8n Code nodes execute the same valid and invalid paths',()=>{
  function run(name,input) {
    const node=workflow.nodes.find(node=>node.name===name);
    return vm.runInNewContext(`(function(){${node.parameters.jsCode}})()`,{$input:{all:()=>[{json:input}]}},{timeout:1000})[0].json;
  }
  for(const sample of samples) {
    let result=run('Validate Inquiry',{body:sample.input});
    assert.equal(result.valid,true);
    result=run('Qualify Lead',result);
    result=run('Prepare Review Handoff',result);
    assert.equal(result.qualification.priority,sample.expectedPriority);
    assert.equal(result.handoff.draft.automaticallySent,false);
  }
  assert.equal(run('Validate Inquiry',{body:{}}).valid,false);
});
