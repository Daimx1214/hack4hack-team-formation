// Artillery processor: tiny helper functions the scenarios in
// artillery.yml call before making requests.
//
// Why this exists: the join endpoint needs (a) the id of the team created
// by prepare.js and (b) a logged-in user's JWT. Both live in
// load/context.json, which prepare.js writes. `pickUser` loads that file
// once, then hands each virtual user the team id and a token picked at
// random from the pool — so the stampede comes from many different users,
// exactly like the real last-seat rush.
const fs = require('fs');
const path = require('path');

let cached = null;
function loadContext() {
  if (!cached) {
    cached = JSON.parse(fs.readFileSync(path.join(__dirname, 'context.json'), 'utf8'));
  }
  return cached;
}

function pickUser(context, events, done) {
  const { teamId, tokens } = loadContext();
  context.vars.teamId = teamId;
  context.vars.token = tokens[Math.floor(Math.random() * tokens.length)];
  return done();
}

module.exports = { pickUser };
