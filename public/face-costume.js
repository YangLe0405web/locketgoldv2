import { loadScript } from './ai-filter.js';

let detector;

export function loadFaceDetector() {
    detector ??= (async () => {
        if (!window.tf) await loadScript('/vendor/tf.js');
        if (!window.blazeface) await loadScript('/vendor/blazeface.js');
        return window.blazeface.load({ maxFaces: 3 });
    })().catch(error => {
        detector = null;
        throw error;
    });
    return detector;
}

export function drawSmoothSkin(ctx, source, scratch, faces, amount) {
    if (!faces.length || !amount) return;
    const work = scratch.getContext('2d');
    const size = scratch.width;
    for (const { landmarks: [left, right, nose, mouth] } of faces) {
        if (!mouth) continue;
        const span = Math.hypot(right[0] - left[0], right[1] - left[1]);
        if (span < 6) continue;
        for (const side of [-1, 1]) {
            const x = nose[0] + side * span * 0.45;
            const y = (nose[1] + mouth[1]) / 2;
            const radius = span * 0.4;
            work.clearRect(0, 0, size, size);
            work.save();
            work.filter = `blur(${Math.max(1, span * 0.065)}px)`;
            work.drawImage(source, 0, 0);
            work.restore();
            const fade = work.createRadialGradient(x, y, radius * 0.25, x, y, radius);
            fade.addColorStop(0, `rgba(0,0,0,${amount * 0.8})`);
            fade.addColorStop(1, 'transparent');
            work.save();
            work.globalCompositeOperation = 'destination-in';
            work.fillStyle = fade;
            work.fillRect(0, 0, size, size);
            work.restore();
            ctx.drawImage(scratch, 0, 0, ctx.canvas.width, ctx.canvas.height);
        }
    }
}

const faceWarps = {
    fisheye: { radius: 1.45, strength: 0.67 },
    magnify: { radius: 2.1, strength: 0.52 },
    cheeks: { radius: 0.62, strength: 0.72 },
    tiny: { radius: 1.6, strength: -0.8 }
};

export function drawFaceWarp(ctx, source, scratch, faces, effect) {
    const warp = faceWarps[effect];
    if (!warp) return false;
    if (!faces.length) return true;
    const size = source.width;
    const input = source.getContext('2d').getImageData(0, 0, size, size).data;
    const work = scratch.getContext('2d');
    const output = work.createImageData(size, size);
    for (const { landmarks: [left, right, nose, mouth] } of faces) {
        if (!mouth) continue;
        const span = Math.hypot(right[0] - left[0], right[1] - left[1]);
        if (span < 6) continue;
        const radius = span * warp.radius;
        const centers = effect === 'cheeks'
            ? [-1, 1].map(side => [nose[0] + side * span * 0.51, (nose[1] + mouth[1]) / 2])
            : [[nose[0], nose[1] - span * 0.15]];
        for (const [cx, cy] of centers) {
            for (let y = Math.max(0, Math.floor(cy - radius)); y < Math.min(size, cy + radius); y++) {
                for (let x = Math.max(0, Math.floor(cx - radius)); x < Math.min(size, cx + radius); x++) {
                    const dx = x - cx;
                    const dy = y - cy;
                    const distance = Math.hypot(dx, dy) / radius;
                    if (distance >= 1) continue;
                    const factor = 1 - warp.strength * (1 - distance * distance) ** 2;
                    const sx = Math.max(0, Math.min(size - 1, Math.round(cx + dx * factor)));
                    const sy = Math.max(0, Math.min(size - 1, Math.round(cy + dy * factor)));
                    const from = (sy * size + sx) * 4;
                    const to = (y * size + x) * 4;
                    output.data[to] = input[from];
                    output.data[to + 1] = input[from + 1];
                    output.data[to + 2] = input[from + 2];
                    output.data[to + 3] = Math.round(255 * Math.min(1, (1 - distance) * 8));
                }
            }
        }
    }
    work.putImageData(output, 0, 0);
    ctx.drawImage(scratch, 0, 0, ctx.canvas.width, ctx.canvas.height);
    return true;
}

export function drawCostumes(ctx, faces, effect, scale = 1) {
    ctx.save();
    ctx.scale(scale, scale);
    for (const face of faces) {
        const [left, right, nose, mouth] = face.landmarks;
        const eyes = [left, right].sort((a, b) => a[0] - b[0]);
        const span = Math.hypot(right[0] - left[0], right[1] - left[1]);
        if (span < 6) continue;
        ctx.lineWidth = span * 0.09;
        ctx.lineCap = 'round';
        if (['rose', 'ogre', 'hero', 'ghost', 'pirate'].includes(effect)) {
            const x = (left[0] + right[0]) / 2;
            ctx.save();
            ctx.textAlign = 'center'; ctx.font = `${span * 1.55}px "Segoe UI Emoji",system-ui`;
            if (effect === 'rose') {
                ctx.fillText('🌹', mouth?.[0] || nose[0], (mouth?.[1] || nose[1]) + span * 0.55);
            } else if (effect === 'ogre') {
                ctx.strokeStyle = '#97b344'; ctx.fillStyle = '#789630'; ctx.lineWidth = span * 0.2;
                for (const side of [-1,1]) {
                    ctx.beginPath();ctx.moveTo(x+side*span*0.75,face.topLeft[1]+span*0.3);ctx.lineTo(x+side*span*1.05,face.topLeft[1]-span*0.3);ctx.stroke();
                    ctx.beginPath();ctx.ellipse(x+side*span*1.05,face.topLeft[1]-span*0.3,span*0.22,span*0.13,side*0.4,0,Math.PI*2);ctx.fill();
                }
            } else if (effect === 'hero') {
                ctx.fillStyle='#b82438';ctx.beginPath();ctx.moveTo(x-span,face.bottomRight[1]);ctx.lineTo(x-span*1.7,face.bottomRight[1]+span*2.5);ctx.lineTo(x+span*1.7,face.bottomRight[1]+span*2.5);ctx.lineTo(x+span,face.bottomRight[1]);ctx.fill();
                ctx.fillText('🛡️',x,face.bottomRight[1]+span*1.5);
            } else {
                ctx.fillText(effect === 'ghost' ? '👻' : '🏴‍☠️',x,face.topLeft[1]+span*0.15);
            }
            ctx.restore();
        } else if (effect === 'santa' || effect === 'tire') {
            const x = (left[0] + right[0]) / 2;
            const y = (left[1] + right[1]) / 2;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(Math.atan2(eyes[1][1] - eyes[0][1], eyes[1][0] - eyes[0][0]));
            ctx.scale(span, span);
            const oval = (cx, cy, rx, ry, color) => {
                ctx.fillStyle = color;
                ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
            };
            if (effect === 'santa') {
                oval(0, 2.25, 1.75, 1.55, '#c91c32');
                ctx.fillStyle = '#fff5e5'; ctx.fillRect(-0.13, 1.15, 0.26, 2.5);
                ctx.fillStyle = '#302226'; ctx.fillRect(-1.6, 2.8, 3.2, 0.3);
                ctx.strokeStyle = '#f9cb53'; ctx.lineWidth = 0.1; ctx.strokeRect(-0.25, 2.75, 0.5, 0.4);
                ctx.fillStyle = '#df2440';
                ctx.beginPath(); ctx.moveTo(-0.95, -0.65); ctx.quadraticCurveTo(-0.8, -2.5, 1.25, -1.15);
                ctx.lineTo(0.95, -0.65); ctx.closePath(); ctx.fill();
                oval(0, -0.65, 1.05, 0.22, '#fff9ed');
                oval(1.22, -1.16, 0.26, 0.28, '#fff9ed');
                // Beard surrounds the mouth while leaving the central face visible.
                ctx.fillStyle = '#fff9ed';
                ctx.beginPath(); ctx.moveTo(-0.9, 0.35); ctx.quadraticCurveTo(-0.35, 1.1, 0, 0.85);
                ctx.quadraticCurveTo(0.35, 1.1, 0.9, 0.35); ctx.quadraticCurveTo(1.0, 1.55, 0, 2.0);
                ctx.quadraticCurveTo(-1.0, 1.55, -0.9, 0.35); ctx.fill();
                oval(-0.24, 0.67, 0.32, 0.13, '#fff9ed'); oval(0.24, 0.67, 0.32, 0.13, '#fff9ed');
            } else {
                for (let row = 0; row < 4; row++) {
                    const cy = 1.3 + row * 0.55;
                    oval(0, cy, 1.5 - row * 0.08, 0.48, '#181b20');
                    ctx.strokeStyle = '#535b65'; ctx.lineWidth = 0.07;
                    ctx.beginPath(); ctx.ellipse(0, cy - 0.07, 1.25 - row * 0.08, 0.22, 0, 0, Math.PI * 2); ctx.stroke();
                    for (let t = -1; t <= 1; t += 0.25) {
                        ctx.beginPath(); ctx.moveTo(t, cy + 0.08); ctx.lineTo(t + 0.08, cy + 0.3); ctx.stroke();
                    }
                }
                for (const side of [-1, 1]) for (let row = 0; row < 3; row++) {
                    oval(side * (1.5 + row * 0.12), 1.25 + row * 0.5, 0.44, 0.36, '#252a30');
                    ctx.strokeStyle = '#626b76'; ctx.lineWidth = 0.06;
                    ctx.beginPath(); ctx.ellipse(side * (1.5 + row * 0.12), 1.25 + row * 0.5, 0.31, 0.22, 0, 0, Math.PI * 2); ctx.stroke();
                }
                ctx.strokeStyle = '#252a30'; ctx.lineWidth = 0.23;
                ctx.beginPath(); ctx.ellipse(0, 0.03, 1.0, 1.12, 0, 0, Math.PI * 2); ctx.stroke();
            }
            ctx.restore();
        } else if (effect === 'lips' || effect === 'braces') {
            if (!mouth) continue;
            const [x, y] = mouth;
            ctx.fillStyle = effect === 'lips' ? '#dc3c76' : '#623145';
            ctx.beginPath();
            ctx.ellipse(x, y, span * 0.38, span * 0.15, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = effect === 'lips' ? '#ff99b5' : '#fff3e5';
            ctx.fillRect(x - span * 0.23, y - span * 0.035, span * 0.46, span * 0.07);
            if (effect === 'braces') {
                ctx.fillStyle = '#a2abb8';
                for (const position of [-2, -1, 0, 1, 2]) {
                    ctx.fillRect(x + position * span * 0.09 - span * 0.025, y - span * 0.045, span * 0.05, span * 0.09);
                }
            }
        } else if (effect === 'buns' || effect === 'mohawk' || effect === 'crown' || effect === 'party') {
            const x = (left[0] + right[0]) / 2;
            const y = face.topLeft[1];
            if (effect === 'buns') {
                ctx.fillStyle = '#42283c';
                for (const side of [-1, 1]) {
                    ctx.beginPath();
                    ctx.ellipse(x + side * span * 0.6, y, span * 0.3, span * 0.32, 0, 0, Math.PI * 2);
                    ctx.fill();
                }
            } else if (effect === 'mohawk') {
                ctx.fillStyle = '#a442ef';
                ctx.beginPath();
                ctx.moveTo(x - span * 0.5, y + span * 0.2);
                ctx.lineTo(x - span * 0.32, y - span * 0.48);
                ctx.lineTo(x - span * 0.12, y - span * 0.24);
                ctx.lineTo(x + span * 0.15, y - span * 0.8);
                ctx.lineTo(x + span * 0.42, y + span * 0.2);
                ctx.closePath();
                ctx.fill();
            } else {
                ctx.font = `${span * 1.55}px system-ui`;
                ctx.textAlign = 'center';
                ctx.fillText(effect === 'crown' ? '👑' : '🎉', x, y + span * 0.26);
            }
        } else if (effect === 'glasses') {
            ctx.strokeStyle = '#ffc94b';
            ctx.fillStyle = '#25162ab5';
            ctx.beginPath();
            ctx.moveTo(...eyes[0]);
            ctx.lineTo(...eyes[1]);
            ctx.stroke();
            for (const [x, y] of eyes) {
                ctx.beginPath();
                ctx.ellipse(x, y, span * 0.42, span * 0.31, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }
        } else {
            ctx.font = `${span * 1.35}px system-ui`;
            ctx.textAlign = 'center';
            ctx.fillText('🐱', (left[0] + right[0]) / 2, face.topLeft[1] + span * 0.1);
            ctx.fillStyle = '#ff81ad';
            ctx.beginPath();
            ctx.ellipse(nose[0], nose[1], span * 0.17, span * 0.11, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#fff4ef';
            for (const side of [-1, 1]) {
                for (const tilt of [-1, 0, 1]) {
                    ctx.beginPath();
                    ctx.moveTo(nose[0] + side * span * 0.3, nose[1] + tilt * span * 0.1);
                    ctx.lineTo(nose[0] + side * span * 0.85, nose[1] + tilt * span * 0.21);
                    ctx.stroke();
                }
            }
        }
    }
    ctx.restore();
}
