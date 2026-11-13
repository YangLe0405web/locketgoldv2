const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
let busy = false;
module.exports = function registerLocalAI(app) {
    app.get('/api/local-ai/status', (req, res) => {
        const ready = fs.existsSync(path.join(__dirname, '.local-ai-cache', 'ready'));
        let downloaded = 0;
        try { downloaded = fs.statSync(path.join(__dirname, '.local-ai-temp', 'torch-2.6.0+cu124-cp311-cp311-win_amd64.whl')).size; } catch (_) {}
        const packageNames = ['torch', 'torchvision', 'diffusers', 'transformers', 'accelerate', 'safetensors'];
        let installed = [];
        try {
            const entries = fs.readdirSync(path.join(__dirname, '.venv-local-ai/Lib/site-packages'));
            installed = packageNames.filter(name => entries.some(entry => entry.startsWith(name + '-') && entry.endsWith('.dist-info') &&
                fs.existsSync(path.join(__dirname, '.venv-local-ai/Lib/site-packages', entry, 'RECORD'))));
        } catch (_) {}
        let modelBytes = 0;
        let modelFiles = 0;
        let lastWrite = 0;
        const blobs = path.join(__dirname, '.local-ai-cache/hub/models--timbrooks--instruct-pix2pix/blobs');
        function countModelFiles(directory) {
            try {
                for (const entry of fs.readdirSync(directory)) {
                    const file = path.join(directory, entry);
                    const stat = fs.lstatSync(file);
                    // On Windows without symlink support, completed blobs move to snapshots.
                    // Skip symlinks so systems supporting them don't count blobs twice.
                    if (stat.isSymbolicLink()) continue;
                    if (stat.isDirectory()) countModelFiles(file);
                    else if (stat.isFile()) {
                        modelBytes += stat.size;
                        lastWrite = Math.max(lastWrite, stat.mtimeMs);
                        if (!entry.endsWith('.incomplete')) modelFiles++;
                    }
                }
            } catch (_) {}
        }
        countModelFiles(blobs);
        countModelFiles(path.join(blobs, '../snapshots'));
        let modelState = null;
        try { modelState = JSON.parse(fs.readFileSync(path.join(__dirname, '.local-ai-cache/model-status.json'), 'utf8').replace(/^\uFEFF/, '')); } catch (_) {}
        res.set('Cache-Control', 'no-store');
        res.json({ ready, busy, downloadPercent: Math.min(100, Math.floor(downloaded / 2532350702 * 100)),
            libraries: { installed, total: packageNames.length, pending: packageNames.filter(name => !installed.includes(name)) },
            model: { bytes: modelBytes, files: modelFiles, lastWrite, started: fs.existsSync(blobs), state: modelState?.state, attempt: modelState?.attempt } });
    });
    app.post('/api/local-ai/transform', async (req, res) => {
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) ||
            (req.get('Sec-Fetch-Site') && req.get('Sec-Fetch-Site') !== 'same-origin')) {
            return res.status(403).json({ error: 'Mở Studio qua localhost trên máy tính để dùng AI cục bộ.' });
        }
        const { image, style } = req.body || {};
        if (!['santa', 'tire'].includes(style) || typeof image !== 'string' || image.length > 8_000_000 ||
            !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) {
            return res.status(400).json({ error: 'Chọn ảnh và mẫu Noel hoặc người lốp xe.' });
        }
        const python = path.join(__dirname, '.venv-local-ai', 'Scripts', 'python.exe');
        if (!fs.existsSync(python) || !fs.existsSync(path.join(__dirname, '.local-ai-cache', 'ready'))) {
            return res.status(503).json({ error: 'AI cục bộ chưa cài xong mô hình. Bạn có thể dùng Ghép hóa trang ngay.' });
        }
        if (busy) return res.status(409).json({ error: 'Máy đang tạo một ảnh. Chờ ảnh đó xong rồi thử lại.' });
        busy = true;
        let output = '';
        let diagnostic = '';
        let timedOut = false;
        let finished = false;
        const child = spawn(python, [path.join(__dirname, 'scripts/local-transform.py')], {
            windowsHide: true, cwd: __dirname, stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, HF_HUB_OFFLINE: '1', PYTHONIOENCODING: 'utf-8',
                TEMP: path.join(__dirname, '.local-ai-temp'), TMP: path.join(__dirname, '.local-ai-temp'),
                HF_HOME: path.join(__dirname, '.local-ai-cache'), TORCH_HOME: path.join(__dirname, '.local-ai-cache/torch') }
        });
        const timer = setTimeout(() => { timedOut = true; child.kill(); }, 600000);
        const finish = (status, data) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer); busy = false;
            if (!res.writableEnded && !res.destroyed) res.status(status).json(data);
        };
        child.stdout.on('data', chunk => { output += chunk; });
        child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk.toString()).slice(-16000); });
        child.on('error', () => finish(503, { error: 'Không khởi động được AI cục bộ.' }));
        child.on('close', code => {
            let result;
            try { result = JSON.parse(output); } catch (_) {}
            if (code === 0 && result?.image) return finish(200, result);
            const detail = result?.error || diagnostic || `Worker exited: ${code}`;
            try { fs.writeFileSync(path.join(__dirname, '.local-ai-temp/last-generation-error.log'), `${new Date().toISOString()}\n${detail}\n${diagnostic}`); } catch (_) {}
            let message = 'AI cục bộ gặp lỗi xử lý. Chi tiết đã lưu trong last-generation-error.log để kiểm tra.';
            if (timedOut) message = 'AI xử lý quá 10 phút nên đã dừng. Hãy thử lại với chế độ nhẹ.';
            else if (/out of memory|not enough memory|paging file|WinError 1455/i.test(detail)) message = 'Máy thiếu bộ nhớ khi chạy AI. Đóng ứng dụng nặng rồi thử lại.';
            else if (/không trả ảnh phù hợp/i.test(detail)) message = 'Mô hình không trả ảnh phù hợp. Hãy thử ảnh khác.';
            else if (/size mismatch|Half|Float|dtype|device/i.test(detail)) message = 'Mô hình gặp lỗi cấu hình kiểu dữ liệu hoặc thiết bị. Chi tiết đã được ghi lại.';
            finish(timedOut ? 504 : 502, { error: message });
        });
        res.on('close', () => { if (!res.writableEnded) child.kill(); });
        child.stdin.on('error', () => {});
        child.stdin.end(JSON.stringify({ image, style }));
    });
};
