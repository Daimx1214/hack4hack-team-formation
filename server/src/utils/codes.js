const { randomBytes } = require('crypto');

// Invite codes: 8 characters from an alphabet without look-alikes
// (no 0/O, 1/l/I), so a code read aloud or typed from a screenshot is
// hard to get wrong. 32^8 ≈ 1.1 trillion combinations.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateInviteCode() {
  const bytes = randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i += 1) code += ALPHABET[bytes[i] % ALPHABET.length];
  return code;
}

module.exports = { generateInviteCode };
