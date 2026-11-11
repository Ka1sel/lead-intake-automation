// Functions taken from Hanz's reviewed and manually tested n8n export.

export function normalizeLead(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      valid: false,
      errors: ['Expected a JSON object.']
    };
  }

  const errors = [];

  const text = (field, min, max) => {
    const value =
      typeof input[field] === 'string'
        ? input[field].trim()
        : '';

    if (value.length < min || value.length > max) {
      errors.push(
        `${field} must contain ${min}-${max} characters.`
      );
    }

    if (/[\r\n\u0000]/.test(value) && field !== 'message') {
      errors.push(`${field} must be a single line.`);
    }

    return value;
  };

  const name = text('name', 2, 100);
  const email = text('email', 3, 254).toLowerCase();
  const company = text('company', 2, 100);
  const message = text('message', 20, 4000);

  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
    errors.push('email must be a valid address.');
  }

  if (!['email-workflows', 'form-to-sheets'].includes(input.service)) {
    errors.push('Choose email-workflows or form-to-sheets.');
  }

  if (
    !['this-month', 'next-quarter', 'exploring'].includes(input.timeline)
  ) {
    errors.push('Choose a supported timeline.');
  }

  // An omitted budget or null means the prospect is undecided.
  // A provided zero stays zero.
  const budgetUsd = input.budgetUsd ?? null;

  if (
    budgetUsd !== null &&
    (
      typeof budgetUsd !== 'number' ||
      !Number.isInteger(budgetUsd) ||
      budgetUsd < 0 ||
      budgetUsd > 1000000
    )
  ) {
    errors.push(
      'budgetUsd must be an integer from 0 to 1000000, or omitted if undecided.'
    );
  }

  if (input.consent !== true) {
    errors.push('Consent to processing this inquiry is required.');
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors
    };
  }

  return {
    valid: true,
    lead: {
      name,
      email,
      company,
      message,
      service: input.service,
      timeline: input.timeline,
      budgetUsd
    }
  };
}

export function qualifyLead(lead) {
  const rules = {
    'this-month': {
      priority: 'Priority',
      reason: 'The prospect wants to start this month.',
      nextStep:
        'Review scope and availability before arranging a discovery call.'
    },
    'next-quarter': {
      priority: 'Standard',
      reason: 'The prospect is planning for next quarter.',
      nextStep:
        'Review the process, tools, and desired outcome.'
    },
    'exploring': {
      priority: 'Discovery',
      reason: 'The prospect is exploring possible improvements.',
      nextStep:
        'Ask which repetitive task they want to improve first.'
    }
  };

  const rule = rules[lead.timeline];

  if (!rule) {
    throw new Error('Unsupported timeline reached qualification.');
  }

  return {
    priority: rule.priority,
    reasons: [
      'The selected service is supported.',
      rule.reason,
      lead.budgetUsd === null
        ? 'Budget is undecided and can be discussed during review.'
        : 'Budget is provided for discussion and does not affect review order.'
    ],
    nextStep: rule.nextStep
  };
}

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
