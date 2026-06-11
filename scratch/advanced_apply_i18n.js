const { Project, SyntaxKind } = require('ts-morph');
const fs = require('fs');
const path = require('path');

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
    if (!current[keys[keys.length - 1]]) {
        current[keys[keys.length - 1]] = value;
    }
}

function camelCase(str) {
    return str.replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
        return index === 0 ? word.toLowerCase() : word.toUpperCase();
    }).replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '');
}

function isValidText(text) {
    return text && text.length > 1 && /[a-zA-Zа-яА-Я]/.test(text) && !text.includes('var(--') && !text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i) && text.split(' ').length <= 20 && !text.startsWith('http');
}

let modifiedFiles = 0;

for (const sourceFile of project.getSourceFiles()) {
    if (sourceFile.getFilePath().includes('.test.') || sourceFile.getFilePath().includes('locales')) continue;
    
    let fileChanged = false;
    let needsImport = false;

    const replaceWithString = (node, text, isAttribute = false) => {
        if (!isValidText(text)) return false;
        
        // Skip if already inside a translation call
        let currentParent = node.getParent();
        while (currentParent) {
            if (currentParent.getKind() === SyntaxKind.CallExpression) {
                const exprText = currentParent.getExpression().getText();
                if (exprText === 't' || exprText === 'i18n.t') return false;
            }
            currentParent = currentParent.getParent();
        }

        const keyName = 'auto.' + camelCase(text.substring(0, 40));
        for (const loc of locales) {
            if (translations[loc]) setKey(translations[loc], keyName, text);
        }

        const escapedText = text.replace(/'/g, "\\'");
        
        if (node.getKind() === SyntaxKind.JsxText) {
            node.replaceWithText(`{t('${keyName}', '${escapedText}')}`);
        } else if (node.getKind() === SyntaxKind.StringLiteral && isAttribute) {
            node.replaceWithText(`{t('${keyName}', '${escapedText}')}`);
        } else {
            return false;
        }
        
        needsImport = true;
        fileChanged = true;
        return true;
    };

    const jsxTextNodes = sourceFile.getDescendantsOfKind(SyntaxKind.JsxText);
    for (const node of jsxTextNodes) {
        replaceWithString(node, node.getLiteralText().trim());
    }

    const jsxAttributes = sourceFile.getDescendantsOfKind(SyntaxKind.JsxAttribute);
    for (const attr of jsxAttributes) {
        const name = attr.getNameNode().getText();
        if (['placeholder', 'label', 'title', 'alt', 'fallback', 'description', 'message', 'text'].includes(name)) {
            const init = attr.getInitializer();
            if (init && init.getKind() === SyntaxKind.StringLiteral) {
                replaceWithString(init, init.getLiteralText(), true);
            }
        }
    }

    if (fileChanged) {
        const fullText = sourceFile.getFullText();
        let hasImport = fullText.includes('useTranslation');
        
        if (!hasImport) {
            sourceFile.addImportDeclaration({
                namedImports: ['useTranslation'],
                moduleSpecifier: 'react-i18next'
            });
        }
        
        if (!fullText.includes('const { t }') && !fullText.includes('const { t,')) {
            const funcDecls = sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration);
            const arrowFuncs = sourceFile.getDescendantsOfKind(SyntaxKind.ArrowFunction);
            const comps = [...funcDecls, ...arrowFuncs].filter(f => {
                const parent = f.getParent();
                return parent && (parent.getKind() === SyntaxKind.VariableDeclaration || parent.getKind() === SyntaxKind.SourceFile) 
                && f.getDescendantsOfKind(SyntaxKind.JsxElement).length > 0;
            });
            
            for (const comp of comps) {
                const body = comp.getBody();
                if (body && body.getKind() === SyntaxKind.Block) {
                    if (!body.getText().includes('useTranslation()')) {
                        body.insertStatements(0, 'const { t } = useTranslation();');
                    }
                } else if (body && body.getKind() !== SyntaxKind.Block) {
                    // It's an implicit return arrow function like `() => <div/>`
                    // We need to wrap it in a block: `() => { const { t } = useTranslation(); return <div/>; }`
                    const returnExprText = body.getText();
                    body.replaceWithText(`{\n  const { t } = useTranslation();\n  return ${returnExprText};\n}`);
                }
            }
        }

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
