/** Validate one JSON form submission and return only supported fields. */
export function normalizeLead(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: ['Expected a JSON object.'] };
  }
  const errors = [];
  const text = (field, min, max) => {
    const value = typeof input[field] === 'string' ? input[field].trim() : '';
    if (value.length < min || value.length > max) errors.push(`${field} must contain ${min}-${max} characters.`);
    if (/[\r\n\u0000]/.test(value) && field !== 'message') errors.push(`${field} must be a single line.`);
    return value;
  };
  const name = text('name', 2, 100);
  const email = text('email', 3, 254).toLowerCase();
  const company = text('company', 2, 100);
  const message = text('message', 20, 4000);
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) errors.push('email must be a valid address.');
  if (!['automation', 'integration', 'reporting'].includes(input.service)) errors.push('Choose a supported service.');
  if (!['this-month', 'next-quarter', 'exploring'].includes(input.timeline)) errors.push('Choose a supported timeline.');
  if (typeof input.budgetUsd !== 'number' || !Number.isInteger(input.budgetUsd) || input.budgetUsd < 0 || input.budgetUsd > 1000000) {
    errors.push('budgetUsd must be an integer from 0 to 1000000.');
  }
  if (input.consent !== true) errors.push('Consent to processing this inquiry is required.');
  if (errors.length) return { valid: false, errors };
  return {
    valid: true,
    lead: {name, email, company, message, service:input.service, timeline:input.timeline, budgetUsd:input.budgetUsd},
  };
}

/** Transparent, illustrative business rules. This is not AI scoring. */
export function qualifyLead(lead) {
  const reasons = [{label:'Complete inquiry', points:20}];
  const budgetPoints = lead.budgetUsd >= 5000 ? 35 : lead.budgetUsd >= 1000 ? 20 : 0;
  const timelinePoints = lead.timeline === 'this-month' ? 30 : lead.timeline === 'next-quarter' ? 15 : 0;
  const servicePoints = lead.service === 'automation' ? 15 : 10;
  reasons.push({label:'Budget fit', points:budgetPoints});
  reasons.push({label:'Timeline', points:timelinePoints});
  reasons.push({label:'Service fit', points:servicePoints});
  const score = reasons.reduce((total, reason) => total + reason.points, 0);
  const priority = score >= 75 ? 'Priority' : score >= 40 ? 'Standard' : 'Discovery';
  const nextStep = priority === 'Priority' ? 'Review for a discovery call' : priority === 'Standard' ? 'Review scope and ask for missing details' : 'Review goals before recommending a service';
  return {score, priority, reasons, nextStep};
}

/** Produce a review packet and a plain-text draft; this function never sends mail. */
export function prepareHandoff(lead, qualification) {
  const request = qualification.priority === 'Priority'
    ? 'Could you share two suitable times for a discovery call and the tools involved in your current process?'
    : qualification.priority === 'Standard'
      ? 'Could you share the main steps in your process, the tools involved, and the outcome you want to improve?'
      : 'Could you share which repetitive task you want to improve first and roughly how often it happens?';
  return {
    status:'Ready for human review',
    nextStep:qualification.nextStep,
    draft:{
      to:lead.email,
      subject:'Your automation inquiry',
      body:`Hi ${lead.name},\n\nThanks for sharing your inquiry. ${request}\n\nBest regards,\nHanz`,
      automaticallySent:false,
    },
  };
}
