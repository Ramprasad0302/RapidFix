import { describe, expect, it } from 'vitest';
import { indianPhoneSchema, otpSchema } from './validation';

describe('indianPhoneSchema', () => {
  it.each(['9876543210', '+91 98765 43210', '098765-43210'])('normalises %s', (input) => {
    expect(indianPhoneSchema.parse(input)).toBe('9876543210');
  });
  it.each(['12345', '5876543210', '98765432101', 'abcdefghij'])('rejects %s', (input) => {
    expect(indianPhoneSchema.safeParse(input).success).toBe(false);
  });
});

describe('otpSchema', () => {
  it('accepts exactly 6 digits', () => {
    expect(otpSchema.safeParse('123456').success).toBe(true);
    expect(otpSchema.safeParse('12345').success).toBe(false);
    expect(otpSchema.safeParse('12a456').success).toBe(false);
  });
});
