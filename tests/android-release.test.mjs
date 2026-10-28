import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyGradleSigning, calculateVersionCode, TEST_KEYSTORE_SHA256,
  prepareVersionCode, SIGNING_MARKER } from '../scripts/android-release.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('bundled key checksum stays fixed across releases', () => {
  const key=fs.readFileSync(path.join(root,'android-signing/test-signing.p12'));
  assert.equal(createHash('sha256').update(key).digest('hex'),TEST_KEYSTORE_SHA256);
});

test('monotonic CI version codes support in-place upgrades', () => {
  assert.equal(calculateVersionCode(),2_000_000);
  assert.equal(calculateVersionCode('55'),2_000_055);
  assert.ok(calculateVersionCode('56')>calculateVersionCode('55'));
  assert.equal(calculateVersionCode('', '3000001'),3_000_001);
  assert.throws(()=>calculateVersionCode('not-a-number'));
  assert.throws(()=>calculateVersionCode('3.2'));
  assert.throws(()=>calculateVersionCode('0','500'));
});

test('Gradle patch is valid, deterministic, repeatable and release-only', () => {
  const source='plugins { id("com.android.application") }\nandroid { buildTypes { getByName("debug") { isDebuggable = true } } }\n';
  const patched=applyGradleSigning(source);
  assert.ok(patched.includes(SIGNING_MARKER));
  assert.ok(patched.includes('getByName("release")'));
  assert.ok(patched.includes('isMinifyEnabled = true'));
  assert.ok(patched.includes('isShrinkResources = true'));
  assert.ok(patched.includes('storeFile = rootProject.file("../../../android-signing/test-signing.p12")'));
  assert.equal(applyGradleSigning(patched),patched);
  assert.throws(()=>applyGradleSigning('plugins { id("com.android.library") }'));
});

test('version generation preserves application id in Tauri configuration',()=>{
  const conf=JSON.parse(fs.readFileSync(path.join(root,'src-tauri/tauri.conf.json'),'utf8'));
  assert.equal(conf.identifier,'com.fanfront.sudokupadx');
  assert.equal(conf.bundle.android.versionCode,2_000_000);
});
