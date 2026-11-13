const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname,'..');
process.chdir(root);
const server = fs.readFileSync('server.js','utf8');
function section(start,end) {
    const a=server.indexOf(start), b=server.indexOf(end,a);
    if (a<0 || b<0) throw new Error('Server route boundary changed: '+start);
    return server.slice(a,b);
}
// Reuse the tested data routes; exclude all server files, secrets, AI provider keys and HTTP listeners.
const shared = section('const FIREBASE_API_KEY', 'const portraitStyles')
    .replace("process.env.LOCKET_API_KEY || ", '');
const handlers = section('function buildOverlays', 'function getLanIp');
if (/process\.|fs\.|require\(/.test(shared+handlers)) throw new Error('Node-only code leaked into mobile routes');
fs.mkdirSync('mobile',{recursive:true});
fs.writeFileSync('mobile/generated-routes.js', `export function registerRoutes(app, axios, crypto, Buffer) {\n${shared}\n${handlers}\n}\n`);
fs.mkdirSync('mobile-dist',{recursive:true});
for (const name of fs.readdirSync('public')) {
    const source=path.join('public',name);
    if (fs.statSync(source).isFile() && /\.(html|css|svg|json|js|png)$/.test(name)) fs.copyFileSync(source,path.join('mobile-dist',name));
}
fs.mkdirSync('mobile-dist/vendor',{recursive:true});
for (const [source,target] of [
    ['gifenc/dist/gifenc.esm.js','gifenc.js'], ['@tensorflow/tfjs/dist/tf.min.js','tf.js'],
    ['@tensorflow-models/mobilenet/dist/mobilenet.min.js','mobilenet.js'],
    ['@tensorflow-models/blazeface/dist/blazeface.min.umd.js','blazeface.js']
]) fs.copyFileSync(path.join('node_modules',source),path.join('mobile-dist/vendor',target));
let html=fs.readFileSync('mobile-dist/index.html','utf8').replace('src="/app.js"','src="/native-app.js"');
html=html.replace('<head>', '<head><meta name="apple-mobile-web-app-capable" content="yes">');
html=html.replace('AI trên máy — không cần Gemini','AI trên iPhone · thử nghiệm');
html=html.replace(/<p class="fine"><a href="\/local-ai-progress.html"[\s\S]*?<\/p>/, '<p class="fine">AI iPhone cần bộ mô hình Core ML. Mở mục AI trong app để kiểm tra.</p>');
fs.writeFileSync('mobile-dist/index.html',html);
esbuild.buildSync({entryPoints:['mobile/entry.js'],bundle:true,format:'esm',platform:'browser',target:'safari17',external:['/vendor/*'],outfile:'mobile-dist/native-app.js'});
console.log('Mobile bundle built: native networking, no localhost backend, no .env or Python files.');
