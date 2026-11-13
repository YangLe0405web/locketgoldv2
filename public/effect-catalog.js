export const THEMES = {
    dragon: ['Long Phụng · Rồng đỏ', '#9f1527', '#ffd278', '🐉', 'TẾT 2026'],
    phoenix: ['Long Phụng · Phượng', '#d73332', '#ffe3af', '🦚', 'LONG PHỤNG'],
    fortune: ['Long Phụng · Vạn sự', '#8c1320', '#f9c34b', '🧧', 'VẠN SỰ NHƯ Ý'],
    lion: ['Lân sư rồng', '#b92020', '#ffd35c', '🐲', 'ĐÓN XUÂN'],
    blossom: ['Mai vàng đón Tết', '#761c20', '#ffcf4b', '🌼', 'TẾT AN KHANG'],
    peach: ['Đào hồng ngày Tết', '#ffe1de', '#df526c', '🌸', 'XUÂN YÊU THƯƠNG'],
    fireworks: ['Pháo hoa giao thừa', '#421239', '#ffd05f', '🎆', 'CHÚC MỪNG NĂM MỚI'],
    lunar: ['Photobooth Tết Lunar', '#8d1028', '#f3d6a4', '🧧', 'LUNAR MEMORIES'],
    christmas: ['Giáng sinh', '#17493c', '#fbe8d1', '🎄', 'MERRY CHRISTMAS'],
    berry: ['Berry Days', '#ffdae3', '#c6446d', '🍓', 'BERRY DAYS'],
    happy: ['Happy Snap', '#d4c4fa', '#6962ae', '🦋', 'HAPPY SNAP'],
    sky: ['Sky Diary', '#dbe9fa', '#7293bc', '☁️', 'SKY DIARY'],
    sweet: ['Sweet Moments', '#f9dfe8', '#b86f8e', '🎀', 'SWEET MOMENTS'],
    kitty: ['Mèo hồng ngọt ngào', '#ffe0ed', '#ec729a', '🐱', 'SWEET KITTY'],
    birthday: ['Sinh nhật', '#292439', '#f7c767', '🎂', 'HAPPY BIRTHDAY'],
    ribbon: ['Nơ pastel viền ren', '#efe0fc', '#b17ca5', '🎀', 'LOVE YOU']
};

export const STICKERS = [
    ['off', 'Bỏ sticker', '◯'], ['apricot', 'Hoa mai ngày Tết', '🌼🧧'],
    ['crown', 'Vương miện vàng', '👑'], ['valentine', 'Valentine ngọt ngào', '💞'],
    ['moon', 'Thỏ ngọc Trung thu', '🐰🌕'], ['pumpkin', 'Bí ngô Halloween', '🎃']
];

export function drawSticker(ctx, key, size) {
    const item = STICKERS.find(item => item[0] === key);
    if (!item || key === 'off') return;
    ctx.save(); ctx.font = `${size * 0.12}px "Segoe UI Emoji",system-ui`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText(item[2], size * 0.94, size * 0.91); ctx.restore();
}

export function createThemeFrame(key, size = 1080) {
    const theme = THEMES[key];
    if (!theme) return null;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d'); ctx.scale(size / 1080, size / 1080);
    const [, background, accent, motif, title] = theme;
    ctx.fillStyle = background; ctx.fillRect(0, 0, 1080, 1080);
    ctx.clearRect(62, 82, 956, 900);
    ctx.strokeStyle = accent; ctx.lineWidth = 5;
    ctx.strokeRect(20, 20, 1040, 1040); ctx.strokeRect(52, 72, 976, 920);
    // Repeating scallops and fine ornaments keep the picture opening unobstructed.
    for (let p = 85; p < 1000; p += 46) {
        ctx.fillStyle = accent;
        for (const [x,y] of [[35,p],[1045,p],[p,39],[p,1020]]) {
            ctx.beginPath(); ctx.arc(x,y,7,0,Math.PI*2); ctx.fill();
        }
    }
    ctx.font = '85px "Segoe UI Emoji",system-ui'; ctx.textAlign = 'center';
    [[70,115],[1010,115],[70,1000],[1010,1000]].forEach(([x,y])=>ctx.fillText(motif,x,y));
    ctx.font = 'bold 29px system-ui'; ctx.fillStyle = accent; ctx.fillText(title,540,1055);
    return canvas;
}

export function mountEffectCatalog() {
    const host = document.getElementById('extraEffectCatalog');
    if (!host || host.childElementCount) return;
    function section(title, items, kind) {
        const heading = document.createElement('h4'); heading.textContent = title; host.append(heading);
        const row = document.createElement('div'); row.className = 'effect-row catalog-row'; host.append(row);
        for (const item of items) {
            const [key, label, layout] = item;
            const button = document.createElement('button'); button.type = 'button'; button.className = 'choice';
            if (kind === 'costume' || kind === 'sticker') {
                button.dataset[kind] = key; button.setAttribute('aria-pressed','false');
                const icon = document.createElement('span'); icon.textContent = layout; button.append(icon);
            } else {
                if (kind === 'booth') { button.dataset.booth = layout; button.dataset.boothFrame = 'theme-' + key; }
                else button.dataset.frame = 'theme-' + key;
                if (kind === 'booth') {
                    const preview = createThemeFrame(key, 96); const ctx = preview.getContext('2d');
                    ctx.save(); ctx.globalCompositeOperation='destination-over'; ctx.fillStyle='#29262c';ctx.fillRect(0,0,96,96);ctx.restore();
                    ctx.strokeStyle = THEMES[key][2];ctx.lineWidth=3;
                    const [cols,rows]=layout.split('x').map(Number);
                    for(let y=1;y<rows;y++){ctx.beginPath();ctx.moveTo(6,7+y*80/rows);ctx.lineTo(90,7+y*80/rows);ctx.stroke();}
                    for(let x=1;x<cols;x++){ctx.beginPath();ctx.moveTo(6+x*84/cols,7);ctx.lineTo(6+x*84/cols,87);ctx.stroke();}
                    preview.className='catalog-preview'; button.append(preview);
                }
            }
            button.append(document.createTextNode(label)); row.append(button);
        }
    }
    section('🐉 Long Phụng Tết 2026', ['dragon','phoenix','fortune','lion'].map(k=>[k,THEMES[k][0],'2x2']), 'booth');
    section('📸 Photobooth trend mới', [['lunar','Tết Lunar · 4 ảnh','1x4'],['sweet','Sweet Moments · 4 ô','2x2'],['kitty','Mèo hồng · 4 ô','2x2']], 'booth');
    section('🧧 Khung Tết 2026', ['blossom','peach','fireworks','lion'].map(k=>[k,THEMES[k][0]]), 'frame');
    section('🎄 Photobooth Tết & Noel', [['lunar','Tết · 4 ô','2x2'],['christmas','Noel · 4 ô','2x2'],['christmas','Noel · 3 ô','1x3'],['christmas','Noel · 2 ô','1x2']], 'booth');
    section('📷 Photobooth Hàn Quốc', ['berry','happy','sky','sweet'].map(k=>[k,THEMES[k][0],'2x2']), 'booth');
    section('🖼️ Khung viền & pastel', ['kitty','birthday','ribbon'].map(k=>[k,THEMES[k][0]]), 'frame');
    section('✨ Sticker lễ hội', STICKERS, 'sticker');
    section('🎭 Phụ kiện theo khuôn mặt', [['rose','Ngậm hoa hồng','🌹'],['ogre','Tai Ogre','👹'],['hero','Siêu anh hùng','🦸'],['ghost','Bóng ma nhỏ','👻'],['pirate','Mũ cướp biển','🏴‍☠️']], 'costume');
}
