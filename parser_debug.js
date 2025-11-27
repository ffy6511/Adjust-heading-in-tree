
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
const line = '=== 与OKHttp // #example #highlight';
const matches = parseHeadings(line);
console.log(JSON.stringify(matches, null, 2));
