const { Project, SyntaxKind } = require('ts-morph');
const path = require('path');
const fs = require('fs');

const project = new Project();
project.addSourceFilesAtPaths('../apps/frontend/src/**/*.tsx');
project.addSourceFilesAtPaths('../apps/frontend/src/**/*.ts');

const results = [];

for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    
    // Skip test files, translation files, constants, etc. if needed
    if (filePath.includes('.test.') || filePath.includes('locales')) {
        continue;
    }

    // Find JSX Text nodes
    const jsxTextNodes = sourceFile.getDescendantsOfKind(SyntaxKind.JsxText);
    for (const node of jsxTextNodes) {
        const text = node.getLiteralText().trim();
        if (text && text.length > 1 && /[a-zA-Zа-яА-Я]/.test(text)) {
            results.push({
                file: path.relative(path.join(__dirname, '../apps/frontend/src'), filePath),
                text: text,
                line: node.getStartLineNumber(),
                type: 'JsxText'
            });
        }
    }

    // Find all StringLiterals inside the file that are not inside a CallExpression to 't',
    const jsxAttributes = sourceFile.getDescendantsOfKind(SyntaxKind.JsxAttribute);
    for (const attr of jsxAttributes) {
        const name = attr.getNameNode().getText();
        if (['placeholder', 'label', 'title', 'alt', 'fallback', 'description', 'message', 'text'].includes(name)) {
            const init = attr.getInitializer();
            if (init && init.getKind() === SyntaxKind.StringLiteral) {
                const text = init.getLiteralText();
                if (text && text.length > 1 && /[a-zA-Zа-яА-Я]/.test(text)) {
                    results.push({
                        file: path.relative(path.join(__dirname, '../apps/frontend/src'), filePath),
                        text: text,
                        line: attr.getStartLineNumber(),
                        type: `JsxAttribute: ${name}`
                    });
                }
            } else if (init && init.getKind() === SyntaxKind.JsxExpression) {
                const stringLiterals = init.getDescendantsOfKind(SyntaxKind.StringLiteral);
                for (const sl of stringLiterals) {
                    const parent = sl.getParent();
                    if (parent.getKind() === SyntaxKind.CallExpression && parent.getExpression().getText() === 't') {
                        continue;
                    }
                    const text = sl.getLiteralText();
                    if (text && text.length > 1 && /[a-zA-Zа-яА-Я]/.test(text)) {
                        results.push({
                            file: path.relative(path.join(__dirname, '../apps/frontend/src'), filePath),
                            text: text,
                            line: sl.getStartLineNumber(),
                            type: `JsxAttributeExpression: ${name}`
                        });
                    }
                }
            }
        }
    }

    // Check JSX Expressions inside JSX Elements (e.g. <div>{isOpen ? 'Open' : 'Closed'}</div>)
    const jsxExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.JsxExpression);
    for (const expr of jsxExpressions) {
        if (expr.getParent().getKind() === SyntaxKind.JsxElement || expr.getParent().getKind() === SyntaxKind.JsxFragment) {
            const stringLiterals = expr.getDescendantsOfKind(SyntaxKind.StringLiteral);
            for (const sl of stringLiterals) {
                const parent = sl.getParent();
                if (parent.getKind() === SyntaxKind.CallExpression && parent.getExpression().getText() === 't') {
                    continue;
                }
                const text = sl.getLiteralText();
                // ignore class names, hex codes, or dates in format "YYYY-MM-DD"
                if (text && text.length > 1 && /[a-zA-Zа-яА-Я]/.test(text) && !text.includes('var(--') && !text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)) {
                    results.push({
                        file: path.relative(path.join(__dirname, '../apps/frontend/src'), filePath),
                        text: text,
                        line: sl.getStartLineNumber(),
                        type: 'JsxExpression'
                    });
                }
            }
        }
    }
}

fs.writeFileSync('untranslated_strings.json', JSON.stringify(results, null, 2));
console.log(`Found ${results.length} potentially untranslated strings.`);
