const assert=require('node:assert/strict');
const fs=require('fs');
const crypto=require('crypto');
(async()=>{
    const source=fs.readFileSync('mobile/generated-routes.js','utf8');
    assert(!/process\.env|require\(|child_process|localhost|OPENAI_API_KEY|GEMINI_API_KEY/.test(source));
    const {registerRoutes}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
    const routes=new Map();
    const calls=[];
    const axios={post:async(url,body,config)=>{calls.push({url,body,config});return {data:{idToken:'test-token',localId:'uid',expiresIn:'3600'},status:200};}};
    registerRoutes({post:(p,f)=>routes.set(p,f),get:(p,f)=>routes.set(p,f)},axios,crypto,Buffer);
    let output,status=200;const res={status(n){status=n;return this},json(v){output=v;return this}};
    await routes.get('/api/login')({body:{email:'test@example.com',password:'test-only'}},res);
    assert.equal(status,200);assert.equal(output.localId,'uid');assert.equal(calls.length,1);
    assert(calls[0].url.startsWith('https://www.googleapis.com/'));assert.equal(calls[0].config.headers['X-Ios-Bundle-Identifier'],'com.locket.Locket');
    for(const route of ['/api/post-moment','/api/feed','/api/friends','/api/chat/send','/api/chat/history','/api/react','/api/refresh'])assert(routes.has(route));
    assert(!routes.has('/api/ai/transform')); // Remote paid AI handlers must never be packaged.
    const config=JSON.parse(fs.readFileSync('capacitor.config.json'));assert(!config.server?.url);
    assert(fs.existsSync('mobile-dist/native-app.js'));
    console.log('PASS: mobile route extraction, direct authentication request, social routes, no PC backend configuration');
})().catch(e=>{console.error(e);process.exitCode=1});
