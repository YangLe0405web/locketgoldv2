let model;

export function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const timeout = setTimeout(() => finish(new Error('Tải thư viện AI quá lâu.')), 12000);
        function finish(error) {
            clearTimeout(timeout);
            script.remove();
            if (error) reject(error);
            else resolve();
        }
        script.onload = () => finish();
        script.onerror = () => finish(new Error('Không tải được thư viện AI.'));
        script.src = src;
        document.head.append(script);
    });
}

function loadModel() {
    if (!model) {
        model = (async () => {
            if (!window.tf) await loadScript('/vendor/tf.js');
            if (!window.mobilenet) await loadScript('/vendor/mobilenet.js');
            return window.mobilenet.load({ version: 2, alpha: 0.5 });
        })().catch(error => {
            model = null;
            throw error;
        });
    }
    return model;
}

export async function recommendFilter(canvas) {
    const network = await loadModel();
    const predictions = await network.classify(canvas, 3);
    const labels = predictions.filter(item => item.probability >= 0.12).map(item => item.className).join(' ');
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let luminance = 0;
    for (let index = 0; index < pixels.length; index += 4) {
        luminance += pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
    }
    if (luminance / (pixels.length / 4) < 88) return 'lowlight';
    if (/beach|seashore|lakeside|coral|ocean|water/.test(labels)) return 'cold';
    if (/pizza|coffee|espresso|bakery|dough|chocolate|pastry|restaurant/.test(labels)) return 'warm';
    if (/forest|daisy|meadow|valley|mountain|garden/.test(labels)) return 'fresh';
    return 'natural';
}
