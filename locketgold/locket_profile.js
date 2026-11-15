/**
 * Locket Gold VIP - Profile & Badge Injector
 * Tác giả: Lê Hoàng Giang
 * Github: https://github.com/YangLe0405web/locketgoldv2
 */
const url = $request ? ($request.url || '') : '';

function injectGoldBadge(target) {
  if (!target || typeof target !== 'object') return;
  if ('badge' in target || 'badge_tier' in target || 'badge_name' in target || 'phone_number' in target || 'is_gold' in target) {
    target.badge = 'gold';
    target.badge_tier = 'gold';
    target.is_gold = true;
    target.has_badge = true;
  }
  for (const key of Object.keys(target)) {
    if (target[key] && typeof target[key] === 'object') {
      injectGoldBadge(target[key]);
    }
  }
}

if (url.includes('changeProfileInfo')) {
  $done({
    response: {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        data: {
          badge: 'gold',
          badge_tier: 'gold',
          is_gold: true,
          success: true
        },
        result: {
          badge: 'gold',
          badge_tier: 'gold',
          is_gold: true,
          success: true
        }
      })
    }
  });
} else {
  let body = $response ? $response.body : null;
  if (body) {
    try {
      const obj = JSON.parse(body);
      injectGoldBadge(obj);
      body = JSON.stringify(obj);
    } catch (e) {}
  }
  $done({ body });
}
