const fs = require('fs');
const path = require('path');
const readline = require('readline');

const localLogPath = path.join(__dirname, 'transcript.jsonl');
const userHome = process.env.USERPROFILE || process.env.HOME || '';
const globalLogPath = path.join(userHome, '.gemini', 'antigravity-ide', 'brain', 'ff02df5d-65f2-447e-bbf4-937b28bd971e', '.system_generated', 'logs', 'transcript.jsonl');

const logPath = fs.existsSync(localLogPath) ? localLogPath : globalLogPath;

const rl = readline.createInterface({
    input: fs.createReadStream(logPath),
    crlfDelay: Infinity
});

let stepCount = 0;
rl.on('line', (line) => {
    stepCount++;
    try {
        const obj = JSON.parse(line);
        if (obj.tool_calls) {
            obj.tool_calls.forEach(tc => {
                if (tc.name === 'write_to_file' || tc.name === 'replace_file_content' || tc.name === 'multi_replace_file_content') {
                    const file = tc.args.TargetFile || '';
                    if (file.includes('app.js')) {
                        console.log(`[Step ${stepCount}] app.js modified`);
                        let content = tc.args.CodeContent || tc.args.ReplacementContent || '';
                        content = content.replace(/\\n/g, '\n').replace(/\\"/g, '"');
                        const lines = content.split('\n');
                        lines.forEach((l, i) => {
                            if (l.includes('Audio') || l.includes('sounds') || l.includes('mp3')) {
                                if (l.includes('http') || l.includes('assets')) {
                                    console.log(`  L${i+1}: ${l.trim()}`);
                                }
                            }
                        });
                        console.log('-------------------------------------------');
                    }
                }
            });
        }
    } catch (e) {}
});
