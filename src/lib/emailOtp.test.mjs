import assert from 'node:assert/strict';
import test from 'node:test';
import { EMAIL_OTP_PATTERN, emailVerificationToken } from './emailOtp.ts';

test('email verification preserves complete six through ten digit codes, including leading zeros', () => {
  const inputPattern = new RegExp(`^(?:${EMAIL_OTP_PATTERN})$`);
  for (const token of ['012345', '0123456', '01234567', '012345678', '0123456789']) {
    assert.equal(emailVerificationToken(token), token);
    assert.ok(inputPattern.test(token));
  }
});

test('codes copied from formatted emails retain all digits', () => {
  assert.equal(emailVerificationToken(' 01 23 45 67\n'), '01234567');
  assert.equal(emailVerificationToken('01\u00a023\t45\u202f67'), '01234567');
});

test('partial, oversized, and malformed codes are rejected instead of truncated or repaired', () => {
  const inputPattern = new RegExp(`^(?:${EMAIL_OTP_PATTERN})$`);
  for (const token of ['', '123', '12345', '01234567890', '123abc456', '12-34-56', '１２３４５６']) {
    assert.throws(() => emailVerificationToken(token), /complete verification code/);
    assert.equal(inputPattern.test(token), false);
  }
});
