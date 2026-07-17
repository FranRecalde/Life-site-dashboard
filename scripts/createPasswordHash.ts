import readline from 'readline';
import crypto from 'crypto';

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = 390000; // solid PBKDF2 iteration count
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
  return `pbkdf2_sha256$${iterations}$${salt}$${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  try {
    if (!storedHash) return false;
    const parts = storedHash.split('$');
    if (parts.length === 4) {
      const [scheme, iterationsStr, salt, hash] = parts;
      if (scheme !== 'pbkdf2_sha256') {
        return false;
      }
      const iterations = parseInt(iterationsStr, 10);
      if (isNaN(iterations) || iterations <= 0) {
        return false;
      }
      if (!salt || salt.length === 0) {
        return false;
      }
      if (!hash || hash.length !== 64 || !/^[0-9a-fA-F]+$/.test(hash)) {
        return false;
      }
      const testHash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
      const bufTest = Buffer.from(testHash, 'hex');
      const bufStored = Buffer.from(hash, 'hex');
      return crypto.timingSafeEqual(bufTest, bufStored);
    }
    return false;
  } catch (e) {
    return false;
  }
}

async function promptPassword(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('Enter the password to hash: ', (password) => {
      rl.close();
      resolve(password);
    });
    // Mute the input display
    const oldWrite = (rl as any)._writeToOutput;
    (rl as any)._writeToOutput = function (stringToWrite: string) {
      if (stringToWrite === '\r\n' || stringToWrite === '\n' || stringToWrite === '\r') {
        oldWrite.call(rl, stringToWrite);
      } else if (stringToWrite.startsWith('Enter the password to hash: ')) {
        oldWrite.call(rl, stringToWrite);
      } else {
        oldWrite.call(rl, '*'); // mask input with *
      }
    };
  });
}

async function main() {
  let password = process.env.PASSWORD_TO_HASH;
  if (password) {
    console.log('[Info] Using password from PASSWORD_TO_HASH environment variable.');
  } else {
    // Check if stdin is interactive
    if (process.stdin.isTTY) {
      try {
        password = await promptPassword();
        console.log(''); // newline after masked input
      } catch (err) {
        // fallback
      }
    }
  }

  if (!password) {
    console.error('[Error] No password provided.');
    console.log('\nTo generate a password hash, please run this command with the PASSWORD_TO_HASH environment variable set:');
    console.log('  PASSWORD_TO_HASH="your_password" npm run create-password-hash');
    console.log('\nCRITICAL: Remember to clear your shell history or delete the PASSWORD_TO_HASH variable immediately afterwards!');
    process.exit(1);
  }

  const result = hashPassword(password);
  console.log('\nUse this value for LIFE_SITE_PASSWORD_HASH:');
  console.log(result);

  // Verification step
  const isValid = verifyPassword(password, result);
  if (isValid) {
    console.log('\n[Success] Verification passed! The generated hash successfully verified against the password.');
  } else {
    console.error('\n[Error] Verification failed! The generated hash is invalid.');
    process.exit(1);
  }
}

main().catch(console.error);
