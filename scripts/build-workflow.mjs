import {mkdir, readFile, writeFile, copyFile} from 'node:fs/promises';
import {normalizeLead, qualifyLead, prepareHandoff} from '../src/qualification.mjs';

const codeNode = (name, fn, code, position) => ({
  name, id:name.toLowerCase().replaceAll(' ', '-'), type:'n8n-nodes-base.code', typeVersion:2,
  position, parameters:{jsCode:`${fn.toString()}\n${code}`},
});
const workflow = {
  name:'Lead Intake & Qualification', active:false, settings:{executionOrder:'v1'},
  nodes:[
    {name:'Receive Inquiry',id:'receive-inquiry',webhookId:'1f896004-1d55-4eb3-ad6a-b727371034c8',type:'n8n-nodes-base.webhook',typeVersion:2,position:[0,0],parameters:{httpMethod:'POST',path:'hanz-lead-intake',responseMode:'responseNode',options:{}}},
    codeNode('Validate Inquiry', normalizeLead, 'return $input.all().map(item => ({json:normalizeLead(item.json.body)}));', [240,0]),
    {name:'Valid Inquiry?',id:'valid-inquiry',type:'n8n-nodes-base.if',typeVersion:2.2,position:[480,0],parameters:{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},conditions:[{id:'valid',leftValue:'={{ $json.valid }}',rightValue:'',operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}}},
    codeNode('Qualify Lead', qualifyLead, 'return $input.all().map(item => ({json:{...item.json, qualification:qualifyLead(item.json.lead)}}));', [720,-100]),
    codeNode('Prepare Review Handoff', prepareHandoff, 'return $input.all().map(item => ({json:{...item.json, handoff:prepareHandoff(item.json.lead,item.json.qualification)}}));', [960,-100]),
    {name:'Return Qualified Lead',id:'return-qualified',type:'n8n-nodes-base.respondToWebhook',typeVersion:1.4,position:[1200,-100],parameters:{respondWith:'json',responseBody:'={{ $json }}',options:{responseCode:200}}},
    {name:'Return Validation Errors',id:'return-invalid',type:'n8n-nodes-base.respondToWebhook',typeVersion:1.4,position:[720,180],parameters:{respondWith:'json',responseBody:'={{ $json }}',options:{responseCode:422}}},
  ],
  connections:{
    'Receive Inquiry':{main:[[{node:'Validate Inquiry',type:'main',index:0}]]},
    'Validate Inquiry':{main:[[{node:'Valid Inquiry?',type:'main',index:0}]]},
    'Valid Inquiry?':{main:[[{node:'Qualify Lead',type:'main',index:0}],[{node:'Return Validation Errors',type:'main',index:0}]]},
    'Qualify Lead':{main:[[{node:'Prepare Review Handoff',type:'main',index:0}]]},
    'Prepare Review Handoff':{main:[[{node:'Return Qualified Lead',type:'main',index:0}]]},
  },
};
await mkdir(new URL('../workflows/',import.meta.url),{recursive:true});
await writeFile(new URL('../workflows/lead-intake.json',import.meta.url),JSON.stringify(workflow,null,2)+'\n');

if(process.argv.includes('--portfolio')) {
  await mkdir(new URL('../../hanz-os/lib/',import.meta.url),{recursive:true});
  await copyFile(new URL('../src/qualification.mjs',import.meta.url),new URL('../../hanz-os/lib/lead-qualification.mjs',import.meta.url));
  await copyFile(new URL('../examples/leads.json',import.meta.url),new URL('../../hanz-os/data/lead-samples.json',import.meta.url));
  await copyFile(new URL('../workflows/lead-intake.json',import.meta.url),new URL('../../hanz-os/public/projects/lead-intake.json',import.meta.url));
}
console.log('Built inactive seven-node n8n workflow from tested source.');
