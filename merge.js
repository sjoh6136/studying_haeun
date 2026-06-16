const fs = require('fs');
const path = require('path');

const projectDir = __dirname;
const htmlPath = path.join(projectDir, 'index.html');
const cssPath = path.join(projectDir, 'style.css');
const jsPath = path.join(projectDir, 'app.js');
const outputPath = path.join(projectDir, 'standalone_index.html');

try {
    let html = fs.readFileSync(htmlPath, 'utf8');
    const css = fs.readFileSync(cssPath, 'utf8');
    const js = fs.readFileSync(jsPath, 'utf8');

    // Replace CSS link with <style> (supports optional query parameters like ?v=1.1)
    const cssLinkPattern = /<link\s+rel=["']stylesheet["']\s+href=["']style\.css(?:\?.*)?["']\s*\/?>/i;
    html = html.replace(cssLinkPattern, `<style>\n${css}\n</style>`);

    // Replace JS script with <script> (supports defer and optional query parameters like ?v=1.1)
    const jsScriptPattern = /<script\s+[^>]*src=["']app\.js(?:\?.*)?["'][^>]*><\/script>/i;
    html = html.replace(jsScriptPattern, `<script>\n${js}\n</script>`);

    fs.writeFileSync(outputPath, html, 'utf8');
    console.log('Successfully generated standalone_index.html');
} catch (err) {
    console.error('Error merging files:', err);
    process.exit(1);
}
