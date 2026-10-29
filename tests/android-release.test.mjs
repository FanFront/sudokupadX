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

test('CI verifies Android package metadata and distributes the real APK instead of a nested ZIP',()=>{
  const workflow=fs.readFileSync(path.join(root,'.github/workflows/android.yml'),'utf8');
  assert.ok(workflow.includes('name aapt | sort -V'));
  assert.ok(workflow.includes('dump badging "$APK"'));
  assert.ok(workflow.includes("package: name='com.fanfront.sudokupadx'"));
  assert.ok(workflow.includes('launchable-activity:'));
  assert.ok(workflow.includes('unzip -tq "$APK"'));
  assert.ok(workflow.includes('path: installable/SudokuPadX-arm64.apk'));
  assert.ok(workflow.includes('gh release upload "$TAG" "$APK_FILE" --clobber'));
  assert.ok(workflow.includes('gh release create "$TAG" "$APK_FILE"'));
  assert.ok(!workflow.includes('path: src-tauri/gen/android/app/build/outputs/apk/**/*release*.apk'));
  assert.ok(!workflow.includes('echo "File: `'), 'backticks in double-quoted echo execute filenames as commands');
});
