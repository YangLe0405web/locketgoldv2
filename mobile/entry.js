import { Capacitor, registerPlugin } from '@capacitor/core';
import { Buffer } from 'buffer';
import MD5 from 'crypto-js/md5.js';
import Hex from 'crypto-js/enc-hex.js';
import WordArray from 'crypto-js/lib-typedarrays.js';
import { registerRoutes } from './generated-routes.js';

const Native = registerPlugin('StudioNative');
const nativeFetch = window.fetch.bind(window);
const cryptoAdapter = {
    randomUUID: () => crypto.randomUUID(),
    randomBytes: size => Buffer.from(crypto.getRandomValues(new Uint8Array(size))),
    createHash: algorithm => {
        if (algorithm !== 'md5') throw new Error('Unsupported digest');
        let bytes;
        return { update(value) { bytes = value; return this; }, digest() { return MD5(WordArray.create(bytes)).toString(Hex); } };
    }
};
async function request(method, url, data, config = {}) {
    const target = new URL(url);
    for (const [key, value] of Object.entries(config.params || {})) if (value !== undefined) target.searchParams.set(key, value);
    const headers = Object.fromEntries(Object.entries(config.headers || {}).map(([k,v])=>[k,String(v)]));
    let body;
    let binary = false;
    if (Buffer.isBuffer(data)) { body = data.toString('base64'); binary = true; }
    else if (data instanceof URLSearchParams) body = data.toString();
    else if (data !== undefined) { body = JSON.stringify(data); headers['Content-Type'] ||= 'application/json'; }
    const response = await Native.request({ url: target.href, method, headers, body, binary, timeout: config.timeout || 30000 });
    let parsed = response.body;
    try { parsed = JSON.parse(parsed); } catch (_) {}
    const result = { status: response.status, headers: response.headers, data: parsed };
    if (!(config.validateStatus ? config.validateStatus(result.status) : result.status >= 200 && result.status < 300)) {
        const error = new Error(parsed?.error?.message || `HTTP ${result.status}`); error.response = result; throw error;
    }
    return result;
}
const axios = {
    get: (url, config) => request('GET',url,undefined,config),
    post: (url,data,config) => request('POST',url,data,config),
    put: (url,data,config) => request('PUT',url,data,config)
};
const routes = new Map();
registerRoutes({ post: (route, fn) => routes.set('POST '+route,fn), get: (route,fn) => routes.set('GET '+route,fn) }, axios, cryptoAdapter, Buffer);

window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return nativeFetch(input,options);
    const json = (value, status = 200) => new Response(JSON.stringify(value), {status,headers:{'Content-Type':'application/json'}});
    if (url.pathname === '/api/local-ai/status') return json(await Native.modelStatus());
    if (url.pathname === '/api/local-ai/transform' || url.pathname === '/api/ai/transform') {
        const body = JSON.parse(options.body || '{}');
        if (body.reference) return json({error:'Bản AI trên iPhone chưa hỗ trợ biến hình theo ảnh mẫu.'},422);
        try { return json(await Native.transform(body)); }
        catch (error) { return json({error:error.message || 'AI chưa tạo được ảnh.'},503); }
    }
    const handler = routes.get((options.method || 'GET').toUpperCase()+' '+url.pathname);
    if (!handler) return json({error:'Chức năng này chưa có trong bản iOS.'},404);
    let status = 200, result;
    const res = { status(code) { status=code;return this; }, json(value) { result=value;return this; } };
    try { await handler({body:JSON.parse(options.body || '{}'),query:Object.fromEntries(url.searchParams)},res); }
    catch (_) { return json({error:'Không kết nối được dịch vụ. Kiểm tra mạng rồi thử lại.'},502); }
    return json(result ?? {}, status);
};

// WebKit doesn't reliably download blob/data URLs: send generated photos to the native share sheet.
document.addEventListener('click', async event => {
    const link = event.target.closest?.('a[download]');
    if (!link || !Capacitor.isNativePlatform()) return;
    event.preventDefault();
    try {
        const blob = await (await nativeFetch(link.href)).blob();
        const data = await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob);});
        await Native.shareImage({name:link.download, data});
    } catch (_) { alert('Không lưu được ảnh. Hãy thử lại.'); }
}, true);
// Import once after DOM has loaded; app.js then has no pending DOMContentLoaded listener.
if (document.readyState === 'loading') await new Promise(resolve => document.addEventListener('DOMContentLoaded',resolve,{once:true}));
const box = document.createElement('div'); box.className='fine';
box.innerHTML='<button type="button" class="ghost" id="nativeModelDownload">Tải AI miễn phí về iPhone (~1,6 GB)</button><p id="nativeModelState">AI chạy trên iPhone, cần giữ app mở khi tải và tạo ảnh. Chất lượng có thể thay đổi nét mặt.</p>';
document.getElementById('transformForm').prepend(box);
let modelPolling;
async function updateModelStatus() {
    const status=await Native.modelStatus();
    document.getElementById('nativeModelState').textContent=status.ready ? 'Mô hình đã tải. AI iPhone là bản thử nghiệm; chọn ảnh rõ mặt và giữ app mở.' : status.message || `Tải mô hình: ${status.downloadPercent || 0}%`;
    document.getElementById('nativeModelDownload').disabled=status.ready || status.downloading;
    if (status.ready && modelPolling) clearInterval(modelPolling);
}
document.getElementById('nativeModelDownload').onclick=async()=>{try{await Native.downloadModel();await updateModelStatus();modelPolling ||= setInterval(()=>updateModelStatus().catch(()=>{}),3000);}catch(e){alert(e.message);}};
updateModelStatus().catch(()=>{});
const { initAppUi } = await import('../public/app.js'); initAppUi();
