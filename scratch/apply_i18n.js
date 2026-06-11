const { Project, SyntaxKind } = require('ts-morph');
const fs = require('fs');

const project = new Project();
project.addSourceFilesAtPaths('../apps/frontend/src/**/*.tsx');

const locales = ['bg', 'en', 'ro'];
const translations = {};
for (const loc of locales) {
    const p = `../apps/frontend/src/locales/${loc}/translation.json`;
    if (fs.existsSync(p)) {
        translations[loc] = JSON.parse(fs.readFileSync(p, 'utf8'));
    }
}

function setKey(obj, path, value) {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {};
        current = current[keys[i]];
    }
    // Only set if not already present
    if (!current[keys[keys.length - 1]]) {
        current[keys[keys.length - 1]] = value;
    }
}

function checkKeyExists(obj, path) {
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
        if (current[key] === undefined) return false;
        current = current[key];
    }
    return true;
}

function camelCase(str) {
    return str.replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
        return index === 0 ? word.toLowerCase() : word.toUpperCase();
    }).replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '');
}

let modifiedFiles = 0;

for (const sourceFile of project.getSourceFiles()) {
    let fileChanged = false;

    // 1. Find missing keys from t() calls
    const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
    for (const call of calls) {
        const expr = call.getExpression();
        if (expr.getText() === 't' || expr.getText() === 'i18n.t') {
            const args = call.getArguments();
            if (args.length > 0 && args[0].getKind() === SyntaxKind.StringLiteral) {
                const key = args[0].getLiteralText();
                const defaultText = args.length > 1 && args[1].getKind() === SyntaxKind.StringLiteral ? args[1].getLiteralText() : key.split('.').pop();
                
                for (const loc of locales) {
                    if (translations[loc] && !checkKeyExists(translations[loc], key)) {
                        setKey(translations[loc], key, defaultText);
                    }
                }
            }
        }
    }

    // 2. Safe AST replace for raw text (Only if `t` is available in the closest block/function)
    const jsxTextNodes = sourceFile.getDescendantsOfKind(SyntaxKind.JsxText);
    for (const node of jsxTextNodes) {
        const text = node.getLiteralText().trim();
        if (text && text.length > 2 && /[a-zA-Zа-яА-Я]/.test(text) && text.split(' ').length <= 10) {
            // Check if t is in scope. A simple heuristic: check if file has `const { t }` or `const { t, `
            const fullText = sourceFile.getFullText();
            if (fullText.includes('const { t }') || fullText.includes('const { t,') || fullText.includes('const { i18n, t }')) {
                const keyName = 'auto.' + camelCase(text.substring(0, 30));
                
                // Add to translations
                for (const loc of locales) {
                    if (translations[loc]) setKey(translations[loc], keyName, text);
                }

                node.replaceWithText(`{t('${keyName}', '${text.replace(/'/g, "\\'")}')}`);
                fileChanged = true;
            }
        }
    }

    if (fileChanged) {
        sourceFile.saveSync();
        modifiedFiles++;
    }
}

for (const loc of locales) {
    if (translations[loc]) {
        fs.writeFileSync(`../apps/frontend/src/locales/${loc}/translation.json`, JSON.stringify(translations[loc], null, 2) + '\n');
    }
}

console.log(`Saved ${modifiedFiles} files and updated translation JSONs.`);
