import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, createHash, timingSafeEqual, scryptSync } from 'node:crypto';

/**
 * AES-256-GCM field encryption for PII and tenant LINE credentials.
 * Stored form: base64( iv(12) | authTag(16) | ciphertext ).
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor() {
    const raw = process.env.ENCRYPTION_KEY ?? '';
    // accept hex(64) or base64, else derive a 32-byte key from the string
    if (/^[0-9a-fA-F]{64}$/.test(raw)) this.key = Buffer.from(raw, 'hex');
    else {
      const b = Buffer.from(raw, 'base64');
      this.key = b.length === 32 ? b : createHash('sha256').update(raw).digest();
    }
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
  }

  decrypt(stored: string): string {
    const buf = Buffer.from(stored, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  }

  /** Employee-set payslip password (not derived from PII). scrypt hash: salt.hash (hex). */
  hashPassword(password: string): string {
    const salt = randomBytes(16);
    const hash = scryptSync(password, salt, 32);
    return `${salt.toString('hex')}.${hash.toString('hex')}`;
  }

  verifyPassword(password: string, stored: string): boolean {
    const [saltHex, hashHex] = stored.split('.');
    if (!saltHex || !hashHex) return false;
    const hash = scryptSync(password, Buffer.from(saltHex, 'hex'), 32);
    const expected = Buffer.from(hashHex, 'hex');
    return hash.length === expected.length && timingSafeEqual(hash, expected);
  }
}
