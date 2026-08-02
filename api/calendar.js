export default async function handler(req, res) {
  const GHL_URL = 'https://api.leadconnectorhq.com/widget/booking/timothy-sebolt-personal-calendar-p_hbhfwfw';

  const path = req.url.replace('/api/calendar', '') || '';
  const targetUrl = path ? `https://api.leadconnectorhq.com${path}` : GHL_URL;

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return res.status(400).send('Invalid path');
  }
  if (parsed.hostname !== 'api.leadconnectorhq.com') {
    return res.status(400).send('Invalid path');
  }

  const response = await fetch(parsed.toString(), {
    headers: {
      'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
      'Accept': req.headers['accept'] || '*/*',
      'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.9',
    },
    redirect: 'manual',
  });

  const contentType = response.headers.get('content-type') || 'text/html';
  res.setHeader('Content-Type', contentType);

  if (contentType.includes('text/html')) {
    const html = await response.text();
    res.send(html);
  } else {
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  }
}
