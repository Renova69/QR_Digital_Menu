const { Project, SyntaxKind } = require('ts-morph');
const fs = require('fs');

const project = new Project();
project.addSourceFilesAtPaths('../apps/frontend/src/**/*.tsx');
project.addSourceFilesAtPaths('../apps/frontend/src/**/*.ts');

const bgTranslation = JSON.parse(fs.readFileSync('../apps/frontend/src/locales/bg/translation.json', 'utf8'));

function checkKeyExists(obj, path) {
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
        if (current[key] === undefined) return false;
        current = current[key];
    }
    return true;
}

const missingKeys = [];

for (const sourceFile of project.getSourceFiles()) {
    const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
    for (const call of calls) {
        const expr = call.getExpression();
        if (expr.getText() === 't' || expr.getText() === 'i18n.t') {
            const args = call.getArguments();
            if (args.length > 0 && args[0].getKind() === SyntaxKind.StringLiteral) {
                const key = args[0].getLiteralText();
                if (!checkKeyExists(bgTranslation, key)) {
                    missingKeys.push({
                        key,
                        file: sourceFile.getFilePath(),
                        line: call.getStartLineNumber(),
                        defaultText: args.length > 1 && args[1].getKind() === SyntaxKind.StringLiteral ? args[1].getLiteralText() : null
                    });
                }
            }
        }
    }
}

fs.writeFileSync('missing_keys.json', JSON.stringify(missingKeys, null, 2));
console.log(`Found ${missingKeys.length} missing keys in bg/translation.json`);
