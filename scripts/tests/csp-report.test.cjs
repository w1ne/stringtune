const {test} = require('node:test');
const assert = require('node:assert/strict');
const {checkCspAudit, advisoryMessages} = require('../verify-csp-report.cjs');
const audit = items => ({scoreDisplayMode: 'informative', details: {items}});
test('CSP gate accepts only the documented hosting and compatibility advisories', () => {
 assert.doesNotThrow(() => checkCspAudit(audit([...advisoryMessages].map(description => ({description, severity: 'Medium'})))));
});
test('CSP gate fails closed on missing policy, bypasses, syntax errors and unknown findings', () => {
 for (const item of [
  {description: 'No CSP found in enforcement mode', severity: 'High'},
  {description: [...advisoryMessages][0], severity: 'High'},
  {description: 'Unknown directive', severity: 'Syntax'},
  {description: 'New advisory', severity: 'Medium'}
 ]) assert.throws(() => checkCspAudit(audit([item])));
 assert.throws(() => checkCspAudit(undefined));
 assert.throws(() => checkCspAudit({errorMessage: 'Audit failed'}));
});
