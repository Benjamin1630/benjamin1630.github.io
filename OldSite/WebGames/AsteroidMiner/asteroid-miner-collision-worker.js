// ================================
// COLLISION DETECTION WORKER
// Handles collision detection for hazards and mining range checks
// Runs off main thread to prevent stuttering
// ================================

// Hazard type data (replicated from main thread)
const HAZARD_TYPES = {
    debris: {
        size: 25,
        color: '#888888',
        damage: 15,
        pullForce: 0
    },
    mine: {
        size: 20,
        color: '#ff0000',
        damage: 25,
        pullForce: 0
    },
    vortex: {
        size: 40,
        color: '#9966ff',
        damage: 5,
        pullForce: 0.3
    }
};

// Worker state
let playerData = { x: 0, y: 0, size: 20, vx: 0, vy: 0 };
let asteroids = [];
let hazards = [];

// Message handler
self.onmessage = function(e) {
    const { type, data } = e.data;
    
    switch(type) {
        case 'checkHazardCollisions':
            // Update local copies
            playerData = data.player;
            hazards = data.hazards;
            
            // Perform collision detection
            const collisionResults = checkHazardCollisions(data.dt);
            
            self.postMessage({
                type: 'hazardCollisionResults',
                data: collisionResults
            });
            break;
            
        case 'checkMiningRange':
            // Update local copies
            playerData = data.player;
            asteroids = data.asteroids;
            
            // Check if any asteroids are in mining range
            const miningRangeResults = checkMiningRange(data.miningRange);
            
            self.postMessage({
                type: 'miningRangeResults',
                data: miningRangeResults
            });
            break;
            
        case 'checkBatchCollisions':
            // Batch check for better performance
            playerData = data.player;
            asteroids = data.asteroids || [];
            hazards = data.hazards || [];
            
            const hazardResults = checkHazardCollisions(data.dt);
            const miningCheckResults = checkMiningRange(data.miningRange);
            
            self.postMessage({
                type: 'batchCollisionResults',
                data: {
                    hazardCollisions: hazardResults,
                    miningRange: miningCheckResults
                }
            });
            break;
    }
};

// ================================
// COLLISION DETECTION FUNCTIONS
// ================================

function checkHazardCollisions(dt) {
    const collisions = [];
    const vortexPulls = [];
    
    for (let i = hazards.length - 1; i >= 0; i--) {
        const hazard = hazards[i];
        const hazardData = HAZARD_TYPES[hazard.type];
        const dx = hazard.x - playerData.x;
        const dy = hazard.y - playerData.y;
        const distSq = dx * dx + dy * dy; // Use squared distance to avoid sqrt
        
        if (hazard.type === 'vortex') {
            const pullRadiusSq = (hazardData.size * 3) * (hazardData.size * 3);
            
            // Gravity pull - properly scaled with deltaTime
            if (distSq < pullRadiusSq) {
                const dist = Math.sqrt(distSq);
                const angle = Math.atan2(dy, dx);
                const distanceFactor = 1 - (dist / (hazardData.size * 3));
                const pullStrength = hazardData.pullForce * distanceFactor * dt;
                
                vortexPulls.push({
                    vx: Math.cos(angle) * pullStrength,
                    vy: Math.sin(angle) * pullStrength
                });
            }
            
            // Damage if too close
            const damageSq = hazardData.size * hazardData.size;
            if (distSq < damageSq) {
                collisions.push({
                    index: i,
                    damage: hazardData.damage,
                    type: hazard.type,
                    x: hazard.x,
                    y: hazard.y,
                    color: hazardData.color,
                    removeHazard: false
                });
            }
        } else {
            // Direct collision (use squared distance)
            const collisionRadiusSq = ((hazardData.size + playerData.size) / 2) * ((hazardData.size + playerData.size) / 2);
            
            if (distSq < collisionRadiusSq) {
                collisions.push({
                    index: i,
                    damage: hazardData.damage,
                    type: hazard.type,
                    x: hazard.x,
                    y: hazard.y,
                    color: hazardData.color,
                    removeHazard: true
                });
            }
        }
    }
    
    return {
        collisions: collisions,
        vortexPulls: vortexPulls
    };
}

function checkMiningRange(miningRange) {
    const asteroidsInRange = [];
    
    for (let i = 0; i < asteroids.length; i++) {
        const asteroid = asteroids[i];
        
        // Skip destroyed asteroids
        if (asteroid.destroyed) continue;
        
        const dx = asteroid.x - playerData.x;
        const dy = asteroid.y - playerData.y;
        const distSq = dx * dx + dy * dy;
        const rangeSq = miningRange * miningRange;
        
        if (distSq < rangeSq) {
            asteroidsInRange.push({
                index: i,
                distance: Math.sqrt(distSq),
                x: asteroid.x,
                y: asteroid.y
            });
        }
    }
    
    return {
        asteroidInRange: asteroidsInRange.length > 0,
        closestAsteroid: asteroidsInRange.length > 0 ? 
            asteroidsInRange.reduce((closest, current) => 
                current.distance < closest.distance ? current : closest
            ) : null
    };
}
