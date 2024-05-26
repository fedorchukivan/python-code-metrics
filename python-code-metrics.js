const fs = require('fs');

const filename = 'test-file-python-code.txt';

fs.readFile(filename, (err, data) => {
    if (err) {
        console.error(err);
        return;
    }

    const codeText = data.toString();
    const codeLines = codeText.split('\n').map(line => line.trim());
    const metrics = getMetricsForPythonCodeLines(codeLines);

    printMetrics(metrics);
});

function getMetricsForPythonCodeLines(codeLines) {
    const metrics = {
        loc: codeLines.length,
        empty: 0,
        commented: 0,
        logical: 0
    }

    const multilineLiteral = {
        symbol: undefined,
        comment: false,
        reset: function() {
            this.symbol = undefined;
            this.comment = false;
        }
    }
    const tripleQuotes = `'''`;
    const tripleDbQuotes = `"""`;

    codeLines.forEach(line => {
        if (multilineLiteral.symbol !== undefined && multilineLiteral.comment) {
            metrics.commented++;
        }
        if (line.length === 0) {
            metrics.empty++;
            return;
        }
        let lineToModify = line;
        
        while (true) {
            lineToModify = lineToModify.trim();
            
            const slashIndex = lineToModify.indexOf('\\');
            if (slashIndex !== -1) {
                lineToModify = lineToModify.slice(0, slashIndex) + lineToModify.slice(slashIndex + 2);
                continue;
            }

            if(multilineLiteral.symbol === undefined) {
                const trQuotesIndex = lineToModify.indexOf(tripleQuotes) === -1 ? Infinity : lineToModify.indexOf(tripleQuotes);
                const trDbQuotesIndex = lineToModify.indexOf(tripleDbQuotes) === -1 ? Infinity : lineToModify.indexOf(tripleDbQuotes);
                const quotesIndex = lineToModify.indexOf("'") === -1 ? Infinity : lineToModify.indexOf("'");
                const dbQuotesIndex = lineToModify.indexOf('"') === -1 ? Infinity : lineToModify.indexOf('"');
                const singlelineCommentIndex = lineToModify.indexOf('#') === -1 ? Infinity : lineToModify.indexOf('#');
                const multilineLiteralIndex = Math.min(trQuotesIndex, trDbQuotesIndex);
                const singlelineLiteralIndex = Math.min(quotesIndex, dbQuotesIndex);

                if (singlelineLiteralIndex < Math.min(multilineLiteralIndex, singlelineCommentIndex)) {
                    const singlelineLiteralSymbol = lineToModify.at(singlelineLiteralIndex);
                    lineToModify = lineToModify.slice(0, singlelineLiteralIndex) + lineToModify.slice(singlelineLiteralIndex + 1);
                    const singlelineLiteralEndIndex = lineToModify.indexOf(singlelineLiteralSymbol);
                    lineToModify = lineToModify.slice(0, singlelineLiteralIndex) + lineToModify.slice(singlelineLiteralEndIndex + 1);
                    continue;
                }

                if (Number.isFinite(multilineLiteralIndex) && multilineLiteralIndex < singlelineCommentIndex) {
                    if (multilineLiteralIndex === 0) {
                        multilineLiteral.comment = true;
                        metrics.commented++;
                    }
                    multilineLiteral.symbol = lineToModify.slice(multilineLiteralIndex, multilineLiteralIndex + 3);
                    lineToModify = lineToModify.slice(0, multilineLiteralIndex) + lineToModify.slice(multilineLiteralIndex + 3);
                    if (lineToModify.includes(multilineLiteral.symbol)) {
                        const multilineLiteralEndIndex = lineToModify.indexOf(multilineLiteral.symbol);
                        lineToModify = lineToModify.slice(0, multilineLiteralIndex) + lineToModify.slice(multilineLiteralEndIndex + 3);
                        multilineLiteral.reset();
                        continue;
                    } else {
                        lineToModify = lineToModify.slice(0, multilineLiteralIndex).trim();
                        break;
                    }
                } else {
                    break;
                }
            } else if (lineToModify.includes(multilineLiteral.symbol)) {
                const multilineLiteralEndIndex = lineToModify.indexOf(multilineLiteral.symbol);
                lineToModify = lineToModify.slice(multilineLiteralEndIndex + 3).trim();
                multilineLiteral.reset();
                continue;
            } else {
                lineToModify = '';
                break;
            }
        }

        if (lineToModify.includes('#')) {
            metrics.commented++;
            lineToModify = lineToModify.slice(0, lineToModify.indexOf('#')).trim();
        }

        const logicalParts = [];
        let logicalPart = '';

        const breakers = ['(', ')', ':'];
        const operators = ['=', '<', '>', '+', '-', '/', '*', '^', '&', '|', ';'];
        for (let i = 0, char = lineToModify[i]; i < lineToModify.length; i++, char = lineToModify[i]) {
            if (char === ' ' && logicalPart.length > 0) {
                logicalParts.push(logicalPart);
                logicalPart = '';
            } else if (breakers.includes(char)) {
                if (logicalPart.length > 0) {
                    logicalParts.push(logicalPart);
                    logicalPart = '';
                }
                logicalParts.push(char);
            } else if (operators.includes(char)) {
                if (logicalPart.length > 0) {
                    logicalParts.push(logicalPart);
                    logicalPart = '';
                }
                const nextChar = lineToModify[i+1];
                if (operators.includes(nextChar)) {
                    logicalParts.push(char + nextChar);
                    i++;
                } else {
                    logicalParts.push(char);
                }
            } else {
                logicalPart += char;
            }
        }
        if (logicalPart.length > 0) {
            logicalParts.push(logicalPart);
        }
        
        let count = 0;
        let modifiedParts = logicalParts;
        
        const logicalBlockKeywords = ['if', 'else', 'elif', 'try', 'except', 'finally', 'while', 'for', 'def'];
        const singleStatements = ['break', 'continue', 'return', 'goto', 'raise', '='];

        for (let i = 0, part = modifiedParts[i]; i < modifiedParts.length; i++, part = modifiedParts[i]) {
            if (part === 'def') {
                modifiedParts = modifiedParts.filter((_, index) => index < i || index > modifiedParts.indexOf(':'));
                count++;
            } else if (part === '(') {
                if (
                    i > 0 &&
                    !singleStatements.includes(modifiedParts[i-1]) &&
                    !logicalBlockKeywords.includes(modifiedParts[i-1]) &&
                    !modifiedParts[i-1].split('').every(char => operators.includes(char))
                ) {
                    count++;
                }
            }
        }
        for (let i = 0, part = modifiedParts[i]; i < modifiedParts.length; i++, part = modifiedParts[i]) {
            if (singleStatements.includes(part) || logicalBlockKeywords.includes(part)) {
                count++;
            }
        }
        // console.log(logicalParts, ':', count);
        metrics.logical += count;
    });

    return metrics;
}

function printMetrics(metrics) {
    console.log(
`
Total: ${metrics.loc} LOC
Empty: ${metrics.empty} LOC
Physical: ${Math.floor(metrics.loc - metrics.empty + Math.min((metrics.loc - metrics.empty) * 0.25, metrics.empty))} LOC
Logical: ${metrics.logical} LOC
Commented: ${metrics.commented} LOC
Commenting rate: ${metrics.commented / metrics.loc * 100}%
`
    );
}