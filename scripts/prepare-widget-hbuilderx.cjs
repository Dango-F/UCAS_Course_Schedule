// Disposable HBuilderX source projection for toolchains that cannot open a CLI project with UTS.
// The maintained source remains src/. No source directories are moved or deleted.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const sourceRoot = path.join(root, 'src');
const outputFlag = process.argv.indexOf('--output');
const output = outputFlag >= 0 ? path.resolve(process.argv[outputFlag + 1] || '') : path.join(root, '.artifacts', 'hbuilderx-widget');
if (output === root || root.startsWith(output + path.sep) || output === path.join(root, 'src') || output.startsWith(path.join(root, 'src') + path.sep)) throw new Error('Build output must not overwrite maintained sources.');
fs.mkdirSync(output, { recursive: true });
fs.cpSync(sourceRoot, output, { recursive: true });
// manifest.json references these root-level assets, which are outside src/ in the CLI project.
const icons = path.join(root, 'unpackage', 'res', 'icons');
if (!fs.existsSync(icons)) throw new Error('Missing app icons: ' + icons);
fs.cpSync(icons, path.join(output, 'unpackage', 'res', 'icons'), { recursive: true });
const launchArt = path.join(root, 'unpackage', 'res', 'splash');
if (fs.existsSync(launchArt)) fs.cpSync(launchArt, path.join(output, 'unpackage', 'res', 'splash'), { recursive: true });
fs.writeFileSync(path.join(output, 'package.json'), JSON.stringify({ name: 'lakeside-widget-hbuilderx-build', private: true, version: '0.1.0', dependencies: { pinia: '2.1.7', vue: '3.4.21' } }, null, 2));
fs.writeFileSync(path.join(output, 'README.md'), '# Generated HBuilderX source project\n\nOpen this directory in HBuilderX 5.26 or compatible newer version. Install dependencies, then choose Android + release package + traditional cloud packaging (or custom debug base for debugging), with your existing package/signing settings. This projection is a diagnostic route; the current release workflow uses the maintained CLI project directly with safe packaging. Do not edit this generated copy; prepare a new build after changing src/. Verify the resulting APK with scripts/verify-widget-apk.ps1 in the maintained workspace before installing or distributing.\n');
// Record exactly which native sources/resources were supplied to this build.
// These hashes describe build inputs; they are not a claim that cloud compilation succeeded.
const nativeRoot = path.join(output, 'uni_modules', 'lakeside-widget');
const inventory = [];
function inventoryNative(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) inventoryNative(filename);
    else if (entry.isFile()) inventory.push({ path: path.relative(output, filename).replaceAll('\\', '/'), sha256: crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex') });
  }
}
inventoryNative(nativeRoot);
inventory.sort((a, b) => a.path.localeCompare(b.path));
// Verify every maintained application source, not just native files. A release
// projection must contain the real App, pages, stores and assets unchanged.
const sourceFiles = [];
function verifySourceCopies(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) verifySourceCopies(filename);
    else if (entry.isFile()) {
      const relative = path.relative(sourceRoot, filename);
      const digest = crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
      const copiedDigest = crypto.createHash('sha256').update(fs.readFileSync(path.join(output, relative))).digest('hex');
      if (digest !== copiedDigest) throw new Error('Build source differs from maintained source: ' + relative);
      sourceFiles.push({ path: relative.replaceAll('\\', '/'), sha256: digest });
    }
  }
}
verifySourceCopies(sourceRoot);
sourceFiles.sort((a, b) => a.path.localeCompare(b.path));
fs.writeFileSync(path.join(output, 'lakeside-build-inputs.json'), JSON.stringify({ generatedAt: new Date().toISOString(), sourceRoot, appId: '__UNI__F1ADC35', packageName: 'ucas.course.schedule', sourceCopiesVerified: true, sourceFiles, nativeFiles: inventory }, null, 2));
console.log('Generated HBuilderX source project: ' + output);
console.log(`Verified ${sourceFiles.length} application source files and ${inventory.length} native plugin files against maintained src/.`);
