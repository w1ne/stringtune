const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Lighthouse's informative CSP audit has no numeric score. GitHub Pages cannot
// set response headers, and we intentionally require modern hash-aware browsers.
// Accept only these exact advisories; never ignore bypasses or syntax failures.
const advisoryMessages = new Set([
 "Consider adding 'unsafe-inline' (ignored by browsers supporting nonces/hashes) to be backward compatible with older browsers.",
 "Consider adding https: and http: URL schemes (ignored by browsers supporting 'strict-dynamic') to be backward compatible with older browsers.",
 'The page contains a CSP defined in a <meta> tag. Consider moving the CSP to an HTTP header or defining another strict CSP in an HTTP header.'
]);
function checkCspAudit(audit) {
 assert.ok(audit && !audit.errorMessage && Array.isArray(audit.details?.items), 'CSP audit is missing or failed');
 for (const item of audit.details.items) {
  assert.ok(item.severity === 'Medium' && advisoryMessages.has(item.description), `Unsafe or unexpected CSP finding: ${JSON.stringify(item)}`);
 }
}
if (require.main === module) {
 const directory = process.argv[2] || '.lighthouseci';
 const files = fs.readdirSync(directory).filter(name => /^lhr-.*\.json$/.test(name));
 assert.ok(files.length, 'No Lighthouse reports found');
 for (const file of files) checkCspAudit(JSON.parse(fs.readFileSync(path.join(directory, file))).audits?.['csp-xss']);
 console.log(`CSP security checks passed for ${files.length} Lighthouse reports (hosting/legacy-browser advisories only).`);
}
module.exports = {checkCspAudit, advisoryMessages};
