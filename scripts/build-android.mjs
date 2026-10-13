import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, copyFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const options = process.argv.slice(2);
if (options.some(option => option !== '--prepare-only')) throw new Error('Supported option: --prepare-only');
const sdk = resolve(process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? resolve(root, '../.android-sdk'));
const gradleHome = resolve(process.env.GRADLE_USER_HOME ?? resolve(root, '../.cache/gradle'));
const jdkRoot = resolve(root, '../.jdks');
const env = {
  ...process.env,
  CI: '1', NODE_ENV: 'production', EXPO_OFFLINE: '1', EXPO_NO_TELEMETRY: '1', EXPO_UNSTABLE_HEADLESS: '1',
  __UNSAFE_EXPO_HOME_DIRECTORY: process.env.__UNSAFE_EXPO_HOME_DIRECTORY ?? resolve(root, '../.cache/expo'),
  ANDROID_HOME: sdk,
  ANDROID_USER_HOME: process.env.ANDROID_USER_HOME ?? resolve(root, '../.cache/android/user'),
  GRADLE_USER_HOME: gradleHome,
  JAVA_HOME: resolve(process.env.NOETING_JAVA_HOME ?? join(jdkRoot, 'msopenjdk-17.0.20.1/usr/lib/jvm/msopenjdk-17-amd64')),
};

async function run(command, args, cwd = root) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code, signal) => code === 0 ? resolvePromise() : reject(new Error(`${command} failed (${signal ?? code})`)));
  });
}

// Java does not use the shell's HTTP(S)_PROXY automatically. Keep only non-secret
// routing metadata in the writable Gradle cache, preserving unrelated settings.
const proxyValue = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
if (proxyValue) {
  const proxy = new URL(proxyValue);
  if (proxy.protocol !== 'http:') throw new Error('This JVM setup requires an HTTP CONNECT proxy URL; unsupported proxy transport.');
  if (proxy.username || proxy.password) throw new Error('Use platform-provided proxy authentication; do not copy credentials into Gradle settings.');
  if (!/^[A-Za-z0-9.-]+$/.test(proxy.hostname)) throw new Error('Unsupported proxy hostname.');
  await mkdir(gradleHome, { recursive: true });
  const propertiesFile = join(gradleHome, 'gradle.properties');
  let properties = '';
  try { properties = await readFile(propertiesFile, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const lines = properties.split('\n').filter(line => !/^systemProp\.(http|https)\.proxy(Host|Port)=/.test(line));
  for (const protocol of ['http', 'https']) {
    lines.push(`systemProp.${protocol}.proxyHost=${proxy.hostname}`, `systemProp.${protocol}.proxyPort=${proxy.port || 80}`);
  }
  if (!lines.some(line => line.startsWith('systemProp.javax.net.ssl.trustStore='))) {
    try {
      await access('/etc/ssl/certs/java/cacerts');
      // The cloud platform's maintained trust store includes its HTTPS proxy CA.
      lines.push('systemProp.javax.net.ssl.trustStore=/etc/ssl/certs/java/cacerts');
    } catch { /* Use the JDK's normal verified CA store on other machines. */ }
  }
  await writeFile(propertiesFile, lines.join('\n') + '\n');
}

await run('python3', [join(root, 'scripts/setup-java.py'),
  ...(process.env.NOETING_JAVA_HOME ? ['--java-home', env.JAVA_HOME] : ['--jdk-root', jdkRoot])]);
await run('python3', [join(root, 'scripts/setup-android-sdk.py'), '--sdk-root', sdk]);
const inputs = createHash('sha256')
  .update(await readFile(join(root, 'app.json')))
  .update(await readFile(join(root, 'package-lock.json'))).digest('hex');
const generationRecord = join(root, '.expo/noeting-android-generation.json');
let nativeExists = false;
try { await access(join(root, 'android')); nativeExists = true; }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (!nativeExists) {
  await run(process.execPath, [join(root, 'node_modules/expo/bin/cli'), 'prebuild', '--platform', 'android', '--no-install']);
} else {
  // Expo may automatically clear malformed native folders even without --clean.
  // Preserve an existing tree, and refuse stale recorded generation inputs.
  try {
    const previous = JSON.parse(await readFile(generationRecord, 'utf8'));
    if (previous.inputs !== inputs) throw new Error('Native configuration changed. Preserve local Android edits and regenerate it deliberately before building.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
await mkdir(dirname(generationRecord), { recursive: true });
await writeFile(generationRecord, JSON.stringify({ inputs }, null, 2) + '\n');
const wrapperFile = join(root, 'android/gradle/wrapper/gradle-wrapper.properties');
let wrapper = await readFile(wrapperFile, 'utf8');
if (!wrapper.includes('gradle-9.3.1-bin.zip')) throw new Error('Generated Gradle version changed; review the official distribution checksum before building.');
// Published by services.gradle.org/distributions/gradle-9.3.1-bin.zip.sha256.
const expectedChecksum = 'b266d5ff6b90eada6dc3b20cb090e3731302e553a27c5d3e4df1f0d76beaff06';
const existingChecksum = wrapper.match(/^distributionSha256Sum=(.+)$/m)?.[1];
if (existingChecksum && existingChecksum !== expectedChecksum) throw new Error('Unexpected Gradle distribution checksum; refusing to replace it.');
if (!existingChecksum) {
  wrapper = wrapper.trimEnd() + `\ndistributionSha256Sum=${expectedChecksum}\n`;
  await writeFile(wrapperFile, wrapper);
}
if (options.includes('--prepare-only')) {
  console.log('Verified Android toolchains and prepared the Gradle wrapper. Native compilation and APK verification were not run.');
  process.exit(0);
}

await run(join(root, 'android/gradlew'), [
  ':app:assembleRelease', '-PreactNativeArchitectures=arm64-v8a', '-Pandroid.cmakeVersion=3.22.1',
  '--no-daemon', '--max-workers=2', '-Dorg.gradle.parallel=false',
  '-Dorg.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g',
], join(root, 'android'));
await mkdir(join(root, 'artifacts'), { recursive: true });
const artifact = join(root, 'artifacts/noeting-m1-android-arm64-test.apk');
await copyFile(join(root, 'android/app/build/outputs/apk/release/app-release.apk'), artifact);
await run('python3', [join(root, 'scripts/verify-android-apk.py'), artifact, '--build-tools', join(sdk, 'build-tools/36.0.0')]);
console.log(`Standalone ARM64 test APK: ${artifact}`);
console.log('This APK uses the generated development signing key. Validate it on Android before M2; it is not a store release.');
