export default async function handler(request, response) {
  const secureApiUrl = process.env.GOOGLE_SHEETS_URL;

  // 1. Check if the environment variable exists
  if (!secureApiUrl) {
    console.error("Vercel Error: GOOGLE_SHEETS_URL is missing.");
    return response.status(500).json({ error: "API URL is not configured on Vercel." });
  }

  try {
    // 2. Handle Query Parameters correctly
    // This takes everything after the '?' in your Vercel URL and adds it to the Google URL
    const urlParts = request.url.split('?');
    const queryString = urlParts.length > 1 ? `?${urlParts[1]}` : '';
    const finalUrl = `${secureApiUrl}${queryString}`;

    const options = {
      method: request.method,
      headers: {
        // Essential: Google Apps Script needs to know it's receiving JSON
        "Content-Type": "application/json",
      },
      redirect: "follow", // Mandatory for Google Apps Script redirects
    };

    // 3. Handle POST body
    if (request.method === 'POST') {
      // Vercel sometimes parses the body automatically. 
      // We must ensure it's a string before sending to Google.
      options.body = typeof request.body === 'string' 
        ? request.body 
        : JSON.stringify(request.body);
    }

    // 4. Fetch from Google
    const apiResponse = await fetch(finalUrl, options);
    
    // Google Apps Script always returns a 200 or 302, 
    // but the fetch might fail for network reasons.
    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      throw new Error(`Google API responded with status ${apiResponse.status}: ${errorText}`);
    }

    const data = await apiResponse.json();
    return response.status(200).json(data);

  } catch (error) {
    console.error("Secure Proxy Error:", error.message);
    return response.status(500).json({ 
      status: "error", 
      message: error.message 
    });
  }
}