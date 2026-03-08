/**
 * Rate limiter for Labelary API calls.
 * Labelary limits to 3 requests per second.
 * @see https://labelary.com/service.html#limits
 */

let lastApiCall = 0;
const MIN_INTERVAL = 334; // 3 requests per second = 1 request per 333ms, rounded up for safety

/**
 * Wait if necessary to respect the Labelary API rate limit (3 req/sec).
 * Call this before making any API request to ensure we don't exceed the rate limit.
 */
export async function waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCall = now - lastApiCall;

    if (timeSinceLastCall < MIN_INTERVAL) {
        const waitTime = MIN_INTERVAL - timeSinceLastCall;
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    lastApiCall = Date.now();
}

