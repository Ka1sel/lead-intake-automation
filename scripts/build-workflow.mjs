import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { normalizeLead, qualifyLead, prepareHandoff } from '../src/qualification.mjs';

// Preserve the reviewed eight-node topology, mappings, and sanitized resource references.
const target = new URL('../workflows/lead-intake.json', import.meta.url);
const workflow = JSON.parse(await readFile(target, 'utf8'));
const code = {
  'Validate Inquiry': `${normalizeLead.toString()}\nreturn $input.all().map(item => ({ json: normalizeLead(item.json.body) }));`,
  'Qualify Lead': `${qualifyLead.toString()}\nreturn $input.all().map(item => ({ json: { ...item.json, qualification: qualifyLead(item.json.lead) } }));`,
  'Prepare Review Handoff': `${prepareHandoff.toString()}\nreturn $input.all().map(item => ({ json: { ...item.json, handoff: prepareHandoff(item.json.lead, item.json.qualification) } }));`,
};
for (const node of workflow.nodes) if (code[node.name]) node.parameters.jsCode = code[node.name];
workflow.active = false;
await writeFile(target, JSON.stringify(workflow, null, 2) + '\n');

if (process.argv.includes('--portfolio')) {
  await mkdir(new URL('../../hanz-os/lib/', import.meta.url), { recursive: true });
  for (const [from, to] of [
    ['../src/qualification.mjs', '../../hanz-os/lib/lead-qualification.mjs'],
    ['../examples/leads.json', '../../hanz-os/data/lead-samples.json'],
    ['../workflows/lead-intake.json', '../../hanz-os/public/projects/lead-intake.json'],
  ]) await copyFile(new URL(from, import.meta.url), new URL(to, import.meta.url));
}
console.log('Built inactive eight-node workflow with Google Sheets logging from reviewed source.');
