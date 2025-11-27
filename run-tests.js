
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id) {
    if (id === 'vscode') {
        return {
            Position: class { constructor(l, c) { this.line = l; this.character = c; } },
            Range: class { constructor(s, e) { this.start = s; this.end = e; } }
        };
    }
    return originalRequire.apply(this, arguments);
};

const { parseHeadings } = require('./dist/providers/parser');
const assert = require('assert');

function runTests() {
    console.log('Running tests...');

    // Test 1: Markdown with tags
    {
        const content = '## My Heading <!-- #todo #review -->';
        const matches = parseHeadings(content);
        assert.strictEqual(matches.length, 1);
        assert.strictEqual(matches[0].text, 'My Heading');
        assert.deepStrictEqual(matches[0].tags, ['todo', 'review']);
        console.log('Test 1 passed');
    }

    // Test 2: Typst with tags
    {
        const content = '== My Heading // #todo #review';
        const matches = parseHeadings(content);
        assert.strictEqual(matches.length, 1);
        assert.strictEqual(matches[0].text, 'My Heading');
        assert.deepStrictEqual(matches[0].tags, ['todo', 'review']);
        console.log('Test 2 passed');
    }

    // Test 3: Mixed
    {
        const content = '# T1 <!-- #a -->\n\n== T2 // #b';
        const matches = parseHeadings(content);
        assert.strictEqual(matches.length, 2);
        assert.deepStrictEqual(matches[0].tags, ['a']);
        assert.deepStrictEqual(matches[1].tags, ['b']);
        console.log('Test 3 passed');
    }

     // Test 4: Mixed - compact
    {
        const content = '# T1 <!--#a -->';
        const matches = parseHeadings(content);
        assert.strictEqual(matches.length, 1);
        assert.deepStrictEqual(matches[0].tags, ['a']);
        console.log('Test 4 passed');
    }
}

try {
    runTests();
} catch (e) {
    console.error('Test failed:', e);
    process.exit(1);
}
