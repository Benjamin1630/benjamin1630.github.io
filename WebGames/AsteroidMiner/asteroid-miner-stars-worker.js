// Web Worker for star parallax calculations
// Handles star position updates and parallax offsets off the main thread

let stars = [];
let viewport = { x: 0, y: 0, zoom: 1 };
const VIEWPORT_REFERENCE = { WIDTH: 1200, HEIGHT: 900 };

// Handle messages from main thread
self.onmessage = function(e) {
    const { type, data } = e.data;
    
    switch(type) {
        case 'init':
            // Initialize stars with position and velocity data
            stars = data.stars;
            break;
            
        case 'updateViewport':
            // Update viewport position for parallax calculations
            viewport = data.viewport;
            break;
            
        case 'update':
            // Update star positions based on velocity and delta time
            updateStars(data.dt);
            // Send updated star positions back to main thread
            self.postMessage({
                type: 'starsUpdated',
                stars: stars
            });
            break;
            
        case 'calculateRenderData':
            // Calculate screen positions for all stars
            const renderData = calculateStarRenderData(data.scaledWidth, data.scaledHeight);
            self.postMessage({
                type: 'renderData',
                data: renderData
            });
            break;
    }
};

function updateStars(dt) {
    const tileWidth = VIEWPORT_REFERENCE.WIDTH * 2;
    const tileHeight = VIEWPORT_REFERENCE.HEIGHT * 2;
    
    for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        
        // Update star position based on velocity and delta time
        star.x += star.vx * dt;
        star.y += star.vy * dt;
        
        // Wrap stars within tile boundaries
        star.x = ((star.x % tileWidth) + tileWidth) % tileWidth;
        star.y = ((star.y % tileHeight) + tileHeight) % tileHeight;
    }
}

function calculateStarRenderData(scaledWidth, scaledHeight) {
    const tileWidth = VIEWPORT_REFERENCE.WIDTH * 2;
    const tileHeight = VIEWPORT_REFERENCE.HEIGHT * 2;
    
    // Calculate viewport center in world coordinates
    const viewportCenterX = viewport.x + (VIEWPORT_REFERENCE.WIDTH / 2) / viewport.zoom;
    const viewportCenterY = viewport.y + (VIEWPORT_REFERENCE.HEIGHT / 2) / viewport.zoom;
    
    const centerX = scaledWidth / 2;
    const centerY = scaledHeight / 2;
    
    const renderData = [];
    
    for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        
        // Stars scroll based on viewport CENTER position in world space
        const scrollX = viewportCenterX * star.parallaxFactor;
        const scrollY = viewportCenterY * star.parallaxFactor;
        
        // Star position with parallax scroll applied
        let starX = star.x - scrollX;
        let starY = star.y - scrollY;
        
        // Tile the stars (wrap around)
        starX = ((starX % tileWidth) + tileWidth) % tileWidth;
        starY = ((starY % tileHeight) + tileHeight) % tileHeight;
        
        // Draw multiple tiles to cover the screen
        for (let tx = -1; tx <= 1; tx++) {
            for (let ty = -1; ty <= 1; ty++) {
                const screenX = centerX - tileWidth/2 + starX + tx * tileWidth;
                const screenY = centerY - tileHeight/2 + starY + ty * tileHeight;
                
                // Only include if on screen
                if (screenX >= -10 && screenX <= scaledWidth + 10 &&
                    screenY >= -10 && screenY <= scaledHeight + 10) {
                    
                    renderData.push({
                        x: screenX,
                        y: screenY,
                        size: star.size,
                        brightness: star.brightness
                    });
                }
            }
        }
    }
    
    return renderData;
}
