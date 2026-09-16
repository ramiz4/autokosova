// Explicit acceptance inventory. Removing/filtering a mandatory case must not turn CI green.
export const requiredCases = [
  'customer-crud',
  'garage-crud',
  'published-deletion',
  'account-isolation',
  'persistent-restart',
  'localized-navigation',
  'error-feedback',
  'late-response',
  'review-workflow',
  'review-boundaries',
  'admin-workflow',
  'admin-boundaries',
  'real-runner-contract',
  'real-harness-lifecycle',
  'admin-context',
  'staff-context',
  'privacy-context',
];
export const requiredProjects = ['desktop', 'mobile'];

export function acceptanceProblems(cases, full = true) {
  const problems = [];
  if (!cases.length) problems.push('No acceptance cases executed');
  for (const item of cases) {
    if (
      item.expected !== 'passed' ||
      item.results.length !== 1 ||
      item.results[0]?.status !== 'passed' ||
      item.results[0]?.retry !== 0
    )
      problems.push(`Not passed on the first attempt: ${item.project}/${item.id}`);
  }
  if (full)
    for (const project of requiredProjects)
      for (const id of requiredCases) {
        if (cases.filter((item) => item.project === project && item.id === id).length !== 1)
          problems.push(`Missing or duplicate required case: ${project}/${id}`);
      }
  return problems;
}

export function assertControlDatabase(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('A dedicated local E2E database is required');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.pathname !== '/autokosova' ||
    url.search ||
    url.hash
  )
    throw new Error('E2E control DB must be local autokosova without connection overrides');
  return url;
}

// Never inherit application/provider/1Password credentials into synthetic test children.
export function processEnvironment(source = process.env) {
  return Object.fromEntries(
    [
      'PATH',
      'HOME',
      'TMPDIR',
      'TEMP',
      'TMP',
      'SystemRoot',
      'LANG',
      'LC_ALL',
      'CI',
      'PLAYWRIGHT_BROWSERS_PATH',
    ]
      .filter((key) => source[key] !== undefined)
      .map((key) => [key, source[key]]),
  );
}

/** Independent launcher check: reporter failures must not silently turn an incomplete run green. */
export function assertAcceptanceReport(report, { commit, nonce, full }) {
  if (
    !report ||
    typeof report !== 'object' ||
    report.status !== 'passed' ||
    report.commit !== commit ||
    report.nonce !== nonce ||
    report.fullAcceptance !== full ||
    !Array.isArray(report.cases) ||
    !Array.isArray(report.problems) ||
    report.problems.length ||
    acceptanceProblems(report.cases, full).length
  )
    throw new Error('Current complete E2E report is missing or unsuccessful');
}
