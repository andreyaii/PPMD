export default async function handler(request, response) {
  // Grab your hidden Apps Script URL from Vercel's environment variables
  const secureApiUrl = process.env.GOOGLE_SHEETS_URL;

  if (!secureApiUrl) {
    return response.status(500).json({ error: "API URL is not configured on Vercel." });
  }

  try {
    // Configure the request options to pass along whatever method (GET, POST) 
    // and body data your frontend JavaScript sends.
    const options = {
      method: request.method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (request.method !== 'GET' && request.body) {
      options.body = JSON.stringify(request.body);
    }

    const apiResponse = await fetch(secureApiUrl, options);
    const data = await apiResponse.json();

    return response.status(200).json(data);
  } catch (error) {
    return response.status(500).json({ error: "Failed to communicate with Google Apps Script." });
  }
}