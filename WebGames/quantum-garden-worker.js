// Web Worker for particle physics calculations
// This runs in a separate thread, keeping the UI responsive

self.onmessage = function(e) {
    const { particles, deltaTime, canvasWidth, canvasHeight } = e.data;
    
    // Update all particles
    particles.forEach((particle, index) => {
        const dt = deltaTime * 0.001;
        
        particle.age += dt;
        particle.phase += dt;
        
        // Type-specific behaviors
        switch (particle.type) {
            case 'photon':
                updatePhoton(particle, particles, dt);
                break;
            case 'electron':
                updateElectron(particle, particles, dt);
                break;
            case 'quark':
                updateQuark(particle, particles, dt);
                break;
            case 'neutrino':
                updateNeutrino(particle, dt, canvasWidth, canvasHeight);
                break;
            case 'boson':
                updateBoson(particle, particles, dt);
                break;
        }
        
        // Update superposition states
        if (particle.superposition) {
            particle.states.forEach(state => {
                state.x += (Math.random() - 0.5) * 2;
                state.y += (Math.random() - 0.5) * 2;
                state.probability = Math.max(0.1, Math.min(1, state.probability + (Math.random() - 0.5) * 0.1));
            });
        }
    });
    
    // Calculate harmony
    const harmony = calculateHarmony(particles);
    
    // Send updated data back to main thread
    self.postMessage({ particles, harmony });
};

function updatePhoton(particle, allParticles, dt) {
    particle.velocity.x += Math.cos(particle.phase) * 0.5;
    particle.velocity.y += Math.sin(particle.phase) * 0.5;
    particle.velocity.x *= 0.95;
    particle.velocity.y *= 0.95;
    
    particle.x += particle.velocity.x;
    particle.y += particle.velocity.y;
    
    // Emit light to nearby particles (optimized with range check)
    for (let i = 0; i < allParticles.length; i++) {
        const other = allParticles[i];
        if (other === particle) continue;
        
        const dx = particle.x - other.x;
        const dy = particle.y - other.y;
        const distSq = dx * dx + dy * dy;
        
        if (distSq < 10000) { // 100px radius, squared to avoid sqrt
            other.energy += 0.002;
        }
    }
}

function updateElectron(particle, allParticles, dt) {
    let nearestParticle = null;
    let minDistSq = Infinity;
    
    // Find nearest non-electron particle (optimized)
    for (let i = 0; i < allParticles.length; i++) {
        const other = allParticles[i];
        if (other === particle || other.type === 'electron') continue;
        
        const dx = particle.x - other.x;
        const dy = particle.y - other.y;
        const distSq = dx * dx + dy * dy;
        
        if (distSq < 22500 && distSq < minDistSq) { // 150px radius
            minDistSq = distSq;
            nearestParticle = other;
        }
    }
    
    if (nearestParticle) {
        const angle = Math.atan2(particle.y - nearestParticle.y, particle.x - nearestParticle.x);
        const orbitAngle = angle + Math.PI / 2;
        particle.velocity.x = Math.cos(orbitAngle) * 2;
        particle.velocity.y = Math.sin(orbitAngle) * 2;
        
        particle.x += particle.velocity.x;
        particle.y += particle.velocity.y;
        
        particle.connections = [nearestParticle];
    } else {
        particle.connections = [];
    }
}

function updateQuark(particle, allParticles, dt) {
    const quarks = [];
    
    // Find other quarks (optimized)
    for (let i = 0; i < allParticles.length; i++) {
        const p = allParticles[i];
        if (p.type === 'quark' && p !== particle) {
            quarks.push(p);
            if (quarks.length >= 2) break; // Only need 2
        }
    }
    
    if (quarks.length >= 2) {
        particle.connections = quarks.slice(0, 2);
        
        const idealDist = 60;
        
        for (let i = 0; i < 2; i++) {
            const other = quarks[i];
            const dx = other.x - particle.x;
            const dy = other.y - particle.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist > idealDist) {
                particle.velocity.x += (dx / dist) * 0.1;
                particle.velocity.y += (dy / dist) * 0.1;
            } else if (dist < idealDist && dist > 0) {
                particle.velocity.x -= (dx / dist) * 0.1;
                particle.velocity.y -= (dy / dist) * 0.1;
            }
        }
        
        particle.x += particle.velocity.x;
        particle.y += particle.velocity.y;
        particle.velocity.x *= 0.9;
        particle.velocity.y *= 0.9;
    } else {
        particle.connections = [];
    }
}

function updateNeutrino(particle, dt, canvasWidth, canvasHeight) {
    if (particle.age < 0.1) {
        const angle = Math.random() * Math.PI * 2;
        particle.velocity.x = Math.cos(angle) * 3;
        particle.velocity.y = Math.sin(angle) * 3;
    }
    
    particle.x += particle.velocity.x;
    particle.y += particle.velocity.y;
    
    // Wrap around canvas
    if (particle.x < 0) particle.x = canvasWidth;
    if (particle.x > canvasWidth) particle.x = 0;
    if (particle.y < 0) particle.y = canvasHeight;
    if (particle.y > canvasHeight) particle.y = 0;
    
    particle.connections = [];
}

function updateBoson(particle, allParticles, dt) {
    const radiusSq = 14400; // 120px radius squared
    const field = [];
    
    for (let i = 0; i < allParticles.length; i++) {
        const other = allParticles[i];
        if (other === particle) continue;
        
        const dx = particle.x - other.x;
        const dy = particle.y - other.y;
        const distSq = dx * dx + dy * dy;
        
        if (distSq < radiusSq) {
            other.energy += 0.005;
            field.push(other);
        }
    }
    
    particle.connections = field;
}

function calculateHarmony(particles) {
    let harmonyScore = 0;
    
    // Count particle types
    const types = {};
    for (let i = 0; i < particles.length; i++) {
        const type = particles[i].type;
        types[type] = (types[type] || 0) + 1;
    }
    
    // Diversity bonus
    const diversity = Object.keys(types).length;
    harmonyScore += diversity * 5;
    
    // Connection bonus
    let totalConnections = 0;
    for (let i = 0; i < particles.length; i++) {
        totalConnections += particles[i].connections.length;
    }
    harmonyScore += totalConnections * 2;
    
    // Energy balance
    let totalEnergy = 0;
    for (let i = 0; i < particles.length; i++) {
        totalEnergy += particles[i].energy;
    }
    const avgEnergy = totalEnergy / Math.max(1, particles.length);
    harmonyScore += avgEnergy * 3;
    
    return Math.floor(harmonyScore);
}
