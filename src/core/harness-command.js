const fs = require('fs');
const path = require('path');

function readPackageJson(projectPath) {
  const packagePath = path.join(projectPath, 'package.json');
  if (!fs.existsSync(packagePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  } catch (error) {
    return null;
  }
}

function commandForScript(relativePath) {
  const extension = path.extname(relativePath).toLowerCase();
  return extension === '.js' || extension === '.cjs' || extension === '.mjs'
    ? `node ${relativePath}`
    : `bash ${relativePath}`;
}

function findHarnessScript(projectPath) {
  const exactCandidates = [
    '.github/harness/harness_check.sh',
    '.github/harness/harness-check.sh',
    '.github/harness/check.sh',
    '.github/harness/test.sh',
    '.github/script/harness_check.sh',
    '.github/script/harness-check.sh',
    '.github/script/check.sh',
    '.github/script/test.sh',
    '.github/scripts/harness_check.sh',
    '.github/scripts/harness-check.sh',
    '.github/scripts/check.sh',
    '.github/scripts/test.sh',
    'scripts/harness_check.sh',
    'scripts/harness-check.sh',
    'scripts/check-harness.sh',
    'scripts/test-harness.sh',
    'scripts/test.sh',
    'run_tests.sh',
    'test.sh'
  ];
  const exactMatch = exactCandidates.find(candidate => fs.existsSync(path.join(projectPath, candidate)));
  if (exactMatch) return commandForScript(exactMatch);

  const scriptDirectories = ['.github/script', '.github/scripts', 'scripts'];
  for (const relativeDir of scriptDirectories) {
    const scriptsDir = path.join(projectPath, relativeDir);
    if (!fs.existsSync(scriptsDir)) continue;
    try {
      const dynamicMatch = fs.readdirSync(scriptsDir, { withFileTypes: true })
        .filter(entry => entry.isFile())
        .map(entry => entry.name)
        .filter(name => /(?:harness|check|test)/i.test(name) && /\.(?:sh|js|cjs|mjs)$/.test(name))
        .sort((left, right) => {
          const priority = name => /harness/i.test(name) ? 0 : /check/i.test(name) ? 1 : 2;
          return priority(left) - priority(right) || left.localeCompare(right);
        })[0];
      if (dynamicMatch) return commandForScript(path.join(relativeDir, dynamicMatch));
    } catch (error) {}
  }
  return null;
}

function collectMarkdownFiles(directoryPath) {
  if (!fs.existsSync(directoryPath)) return [];
  try {
    return fs.readdirSync(directoryPath, { withFileTypes: true }).flatMap(entry => {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) return collectMarkdownFiles(entryPath);
      return entry.isFile() && entry.name.toLowerCase().endsWith('.md') ? [entryPath] : [];
    });
  } catch (error) {
    return [];
  }
}

function findReferencedPackageScript(projectPath, scripts) {
  const markdown = collectMarkdownFiles(path.join(projectPath, '.github', 'harness'))
    .map(filePath => fs.readFileSync(filePath, 'utf8'))
    .join('\n');
  if (!markdown) return null;

  const referencedScripts = Object.keys(scripts)
    .filter(name => /(?:harness|check|test|lint|build)/i.test(name) && markdown.includes(name))
    .sort((left, right) => {
      const priority = name => /harness/i.test(name) ? 0 : /(?:check|test)/i.test(name) ? 1 : 2;
      return priority(left) - priority(right) || left.localeCompare(right);
    });
  return referencedScripts[0] || null;
}

function detectHarnessCommand(projectPath, options = {}) {
  const pkg = options.pkg || readPackageJson(projectPath);
  const scripts = pkg?.scripts || {};
  const preferredPackageScripts = ['harness:check', 'test:harness', 'harness:test', 'harness'];
  const harnessScriptName = preferredPackageScripts.find(name => scripts[name])
    || Object.keys(scripts).sort().find(name => /harness/i.test(name) && !/(?:watch|ui|debug)/i.test(name));
  if (harnessScriptName) return `npm run ${harnessScriptName}`;

  const fileCommand = findHarnessScript(projectPath);
  if (fileCommand) return fileCommand;

  const referencedScriptName = findReferencedPackageScript(projectPath, scripts);
  if (referencedScriptName) return `npm run ${referencedScriptName}`;
  return null;
}

module.exports = { detectHarnessCommand };