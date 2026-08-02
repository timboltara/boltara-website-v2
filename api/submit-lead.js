const ipBuckets = new Map();
const MAX_REQUESTS = 5;
const WINDOW_MS = 60_000;

function checkRateLimit(ip) {
  const now = Date.now();

  if (ipBuckets.size > 1000) {
    for (const [k, v] of ipBuckets) {
      if (now > v.resetAt) ipBuckets.delete(k);
    }
  }

  const bucket = ipBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    ipBuckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, retryAfter: 0 };
  }

  bucket.count++;
  if (bucket.count > MAX_REQUESTS) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  return { ok: true, retryAfter: 0 };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const origin = req.headers.origin || '';
  const allowedOrigins = [
    'https://boltarascaling.com',
    'https://www.boltarascaling.com',
  ];
  if (origin && !allowedOrigins.includes(origin)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.headers['x-real-ip'] || 'unknown';
  const limit = checkRateLimit(ip);
  if (!limit.ok) {
    res.setHeader('Retry-After', String(limit.retryAfter));
    return res.status(429).json({ error: 'Too many requests' });
  }

  const clean = (s) => (typeof s === 'string' ? s.trim() : '');
  const firstName = clean(req.body?.firstName);
  const lastName = clean(req.body?.lastName);
  const phone = clean(req.body?.phone);
  const email = clean(req.body?.email);

  if (!firstName || !phone) {
    return res.status(400).json({ error: 'First name and phone are required' });
  }

  if (firstName.length > 100 || lastName.length > 100 || email.length > 254 || phone.length > 30) {
    return res.status(400).json({ error: 'Field too long' });
  }

  if (!/^[0-9+\-() .]{7,30}$/.test(phone)) {
    return res.status(400).json({ error: 'Invalid phone' });
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  const GHL_API_KEY = process.env.GHL_API_KEY;
  const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID;

  if (!GHL_API_KEY || !GHL_LOCATION_ID) {
    console.error('Missing GHL env vars');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const response = await fetch('https://services.leadconnectorhq.com/contacts/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GHL_API_KEY}`,
        'Version': '2021-07-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        firstName,
        lastName,
        email,
        phone,
        locationId: GHL_LOCATION_ID,
        source: 'Website Opt-In',
        tags: ['website-optin'],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('GHL API error:', data);
      return res.status(500).json({ error: 'Failed to create contact' });
    }

    return res.status(200).json({ success: true, contactId: data.contact?.id });
  } catch (err) {
    console.error('Unexpected error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
