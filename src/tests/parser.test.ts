import * as assert from 'assert';
import { parseHeadings } from '../providers/parser';

suite('Parser Test Suite', () => {
    test('Markdown Heading with Tags', () => {
        const content = '## My Heading <!-- #todo #review -->';
        const matches = parseHeadings(content);
        assert.strictEqual(matches.length, 1);
        assert.strictEqual(matches[0].text, 'My Heading');
        assert.deepStrictEqual(matches[0].tags, ['todo', 'review']);
    });

    test('Markdown Heading without Tags', () => {
        const content = '## My Heading';
        const matches = parseHeadings(content);
        assert.strictEqual(matches.length, 1);
        assert.strictEqual(matches[0].text, 'My Heading');
        assert.deepStrictEqual(matches[0].tags, []);
    });

    test('Typst Heading with Tags', () => {
        const content = '== My Heading // #todo #review';
        const matches = parseHeadings(content);
        assert.strictEqual(matches.length, 1);
        assert.strictEqual(matches[0].text, 'My Heading');
        assert.deepStrictEqual(matches[0].tags, ['todo', 'review']);
    });

    test('Typst Heading without Tags', () => {
        const content = '== My Heading';
        const matches = parseHeadings(content);
        assert.strictEqual(matches.length, 1);
        assert.strictEqual(matches[0].text, 'My Heading');
        assert.deepStrictEqual(matches[0].tags, []);
    });

    test('Mixed Content', () => {
        const content = `
# Title

## Section 1 <!-- #wip -->
Text

== Typst Section // #final
        `;
        const matches = parseHeadings(content);
        assert.strictEqual(matches.length, 3);
        assert.deepStrictEqual(matches[1].tags, ['wip']);
        assert.deepStrictEqual(matches[2].tags, ['final']);
    });
});
