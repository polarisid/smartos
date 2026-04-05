export async function getCoordinates(city: string, neighborhood: string, state: string, addressDetails?: string): Promise<[number, number] | null> {
    if (!city) return null;

    // Use a clean version of neighborhood, fallback to city alone if neighborhood is absent
    const safeNeighborhood = neighborhood ? neighborhood.replace(/[^\w\s\u00C0-\u00FF]/gi, '').trim() : '';
    const safeCity = city.trim();
    const safeState = state ? state.trim() : 'Brasil';
    const safeAddress = addressDetails ? addressDetails.replace(/[^\w\s\u00C0-\u00FF,]/gi, '').trim() : '';

    const key = `geocode_${safeAddress}_${safeNeighborhood}_${safeCity}_${safeState}`.toLowerCase();
    
    // Check local storage directly if available (browser context)
    if (typeof window !== 'undefined') {
        const cached = localStorage.getItem(key);
        if (cached) {
            try { return JSON.parse(cached); } catch(e) {}
        }
    }

    // Add API rate limiter (1 request per second max to respect Nominatim policy)
    await delayQueue();

    try {
        // Attempt 1: Full detailed address
        if (safeAddress) {
            const q0 = `${safeAddress}, ${safeNeighborhood ? safeNeighborhood + ', ' : ''}${safeCity}, ${safeState}`;
            const res0 = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q0)}`);
            if (res0.ok) {
                const data0 = await res0.json();
                if (data0 && data0.length > 0) {
                    const coords: [number, number] = [parseFloat(data0[0].lat), parseFloat(data0[0].lon)];
                    saveCache(key, coords);
                    return coords;
                }
            }
            await delayQueue(); // wait before fallback
        }

        // Attempt 2: Neighborhood
        if (safeNeighborhood) {
            const q1 = `${safeNeighborhood}, ${safeCity}, ${safeState}`;
            const res1 = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q1)}`);
            if (res1.ok) {
                const data1 = await res1.json();
                if (data1 && data1.length > 0) {
                    const coords: [number, number] = [parseFloat(data1[0].lat), parseFloat(data1[0].lon)];
                    saveCache(key, coords);
                    return coords;
                }
            }
        }

        // Attempt 3: City fallback
        await delayQueue(); // wait again to avoid ban
        const q2 = `${safeCity}, ${safeState}`;
        const res2 = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q2)}`);
        
        if (res2.ok) {
            const data2 = await res2.json();
            if (data2 && data2.length > 0) {
                const coords: [number, number] = [parseFloat(data2[0].lat), parseFloat(data2[0].lon)];
                // Add a small jitter (approx 500m) to prevent dots from completely overlapping in the city center fallback
                coords[0] += (Math.random() - 0.5) * 0.01;
                coords[1] += (Math.random() - 0.5) * 0.01;
                
                saveCache(key, coords);
                return coords;
            }
        }

    } catch (err) {
        console.error("Geocoding failed", err);
    }

    return null;
}

function saveCache(key: string, coords: [number, number]) {
    if (typeof window !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(coords));
    }
}

// Global promise to chain requests with 1s minimum delay
let lastRequestTime = 0;
let queuePromise = Promise.resolve();

function delayQueue(): Promise<void> {
    return new Promise((resolve) => {
        queuePromise = queuePromise.then(() => {
            const now = Date.now();
            const delay = Math.max(1000 - (now - lastRequestTime), 0);
            return new Promise<void>((r) => {
                setTimeout(() => {
                    lastRequestTime = Date.now();
                    r();
                    resolve();
                }, delay);
            });
        });
    });
}
