// ================================
// PHYSICS WORKER
// Handles asteroid, hazard, and particle position updates
// Runs off main thread to prevent stuttering
// ================================

const CONFIG = {
    worldWidth: 4000,
    worldHeight: 4000
};

// Worker state
let asteroids = [];
let hazards = [];
let particles = [];

// Message handler
self.onmessage = function(e) {
    const { type, data } = e.data;
    
    switch(type) {
        case 'init':
            // Initialize world configuration
            if (data.worldWidth) CONFIG.worldWidth = data.worldWidth;
            if (data.worldHeight) CONFIG.worldHeight = data.worldHeight;
            self.postMessage({ type: 'ready' });
            break;
            
        case 'updateAsteroids':
            // Update asteroid positions and rotations
            asteroids = data.asteroids;
            updateAsteroids(data.dt);
            self.postMessage({
                type: 'asteroidsUpdated',
                data: { asteroids: asteroids }
            });
            break;
            
        case 'updateHazards':
            // Update hazard positions and rotations
            hazards = data.hazards;
            updateHazards(data.dt);
            self.postMessage({
                type: 'hazardsUpdated',
                data: { hazards: hazards }
            });
            break;
            
        case 'updateParticles':
            // Update particle positions and lifetimes
            particles = data.particles;
            updateParticles(data.dt);
            self.postMessage({
                type: 'particlesUpdated',
                data: { particles: particles }
            });
            break;
            
        case 'updateAll':
            // Batch update for better performance
            asteroids = data.asteroids || [];
            hazards = data.hazards || [];
            particles = data.particles || [];
            
            const dt = data.dt;
            updateAsteroids(dt);
            updateHazards(dt);
            updateParticles(dt);
            
            self.postMessage({
                type: 'allUpdated',
                data: {
                    asteroids: asteroids,
                    hazards: hazards,
                    particles: particles
                }
            });
            break;
    }
};

// ================================
// UPDATE FUNCTIONS
// ================================

function updateAsteroids(dt) {
    const len = asteroids.length;
    for (let i = 0; i < len; i++) {
        const asteroid = asteroids[i];
        
        // Skip destroyed asteroids
        if (asteroid.destroyed) continue;
        
        // Update position (time-consistent)
        asteroid.x += asteroid.vx * dt;
        asteroid.y += asteroid.vy * dt;
        asteroid.rotation += asteroid.rotationSpeed * dt;
        
        // Wrap around world (optimized with single checks)
        if (asteroid.x < 0) asteroid.x = CONFIG.worldWidth;
        else if (asteroid.x > CONFIG.worldWidth) asteroid.x = 0;
        
        if (asteroid.y < 0) asteroid.y = CONFIG.worldHeight;
        else if (asteroid.y > CONFIG.worldHeight) asteroid.y = 0;
    }
}

function updateHazards(dt) {
    const len = hazards.length;
    for (let i = 0; i < len; i++) {
        const hazard = hazards[i];
        
        // Update position (time-consistent)
        hazard.x += hazard.vx * dt;
        hazard.y += hazard.vy * dt;
        hazard.rotation += 0.05 * dt;
        
        // Wrap around world
        if (hazard.x < -50) hazard.x = CONFIG.worldWidth + 50;
        else if (hazard.x > CONFIG.worldWidth + 50) hazard.x = -50;
        
        if (hazard.y < -50) hazard.y = CONFIG.worldHeight + 50;
        else if (hazard.y > CONFIG.worldHeight + 50) hazard.y = -50;
    }
}

function updateParticles(dt) {
    // Update particles and mark dead ones for removal
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        
        // Update position (time-consistent)
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        p.alpha -= 0.02 * dt;
        
        // Mark for removal if dead
        if (p.life <= 0 || p.alpha <= 0) {
            p.dead = true;
        }
    }
}
