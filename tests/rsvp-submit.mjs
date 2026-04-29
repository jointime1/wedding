// Smoke test for the real Google Forms RSVP flow.
//
// Reads env from process.env (you can `export $(grep -v '^#' .env | xargs)`
// or use a node --env-file flag if your Node ≥ 20.6):
//
//   node --env-file=.env tests/rsvp-submit.mjs
//
// Or pass everything inline:
//
//   PUBLIC_GOOGLE_FORM_ACTION=... PUBLIC_ENTRY_NAME=entry.123 ... \
//     node tests/rsvp-submit.mjs
//
// Submits a clearly-labelled test record (name = "Smoke Test — please ignore")
// so it's easy to delete afterwards in the Google Forms responses sheet.

const action = process.env.PUBLIC_GOOGLE_FORM_ACTION;
const eName = process.env.PUBLIC_ENTRY_NAME;
const eAttending = process.env.PUBLIC_ENTRY_ATTENDING;
const ePlusOne = process.env.PUBLIC_ENTRY_PLUS_ONE;
const ePicnic = process.env.PUBLIC_ENTRY_PICNIC;
const eNote = process.env.PUBLIC_ENTRY_NOTE;

const missing = [];
for (const [k, v] of Object.entries({
  PUBLIC_GOOGLE_FORM_ACTION: action,
  PUBLIC_ENTRY_NAME: eName,
  PUBLIC_ENTRY_ATTENDING: eAttending,
  PUBLIC_ENTRY_PLUS_ONE: ePlusOne,
  PUBLIC_ENTRY_NOTE: eNote,
})) {
  if (!v) missing.push(k);
}
if (missing.length) {
  console.error('✗ missing env:', missing.join(', '));
  console.error('  set them in .env or pass them inline; see .env.example for the shape.');
  process.exit(2);
}

if (!/^https:\/\/docs\.google\.com\/forms\/d\/e\/[^/]+\/formResponse$/.test(action)) {
  console.error(`✗ PUBLIC_GOOGLE_FORM_ACTION doesn't look right: ${action}`);
  console.error('  expected: https://docs.google.com/forms/d/e/<FORM_ID>/formResponse');
  process.exit(2);
}
for (const [k, v] of Object.entries({ eName, eAttending, ePlusOne, ePicnic, eNote })) {
  if (v && !/^entry\.\d+$/.test(v)) {
    console.error(`✗ ${k}="${v}" doesn't look like a Google Forms entry id (entry.<digits>)`);
    process.exit(2);
  }
}

const body = new URLSearchParams();
body.set(eName, 'Smoke Test — please ignore');
body.set(eAttending, 'Да, буду');
body.set(ePlusOne, 'Один(одна)');
if (ePicnic) body.set(ePicnic, 'Только свадьба');
body.set(eNote, `automated smoke test from tests/rsvp-submit.mjs at ${new Date().toISOString()}`);

console.log('→ POST', action);
console.log('  payload:', Object.fromEntries(body));

const res = await fetch(action, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body,
  redirect: 'follow',
});
console.log('← status', res.status, res.statusText);

// Google Forms returns 200 on success and serves the "form submitted" thank-you page.
// A 400 typically means an entry ID is wrong or doesn't match the live form.
if (res.status >= 200 && res.status < 400) {
  const html = await res.text();
  // Heuristic: the success page contains "Your response has been recorded" /
  // "Ваш ответ записан" depending on the form locale.
  const ok = /response has been recorded|ответ записан|response a été enregistrée/i.test(html);
  if (ok) {
    console.log('✓ Google Forms acknowledged the submission.');
    console.log('  Open the form\'s responses sheet to confirm and delete the test row.');
  } else {
    console.log('? Got 2xx but couldn\'t find the success phrase — check the responses sheet manually.');
  }
  process.exit(0);
} else {
  console.error('✗ submission failed.');
  process.exit(1);
}
