// ================================
// NPC MINER WORKER
// ================================
// Handles NPC miner pathfinding and AI behavior off the main thread

let worldWidth = 5000;
let worldHeight = 5000;

// Worker message handler
self.onmessage = function(e) {
    const { type, data } = e.data;
    
    switch (type) {
        case 'init':
            worldWidth = data.worldWidth;
            worldHeight = data.worldHeight;
            self.postMessage({ type: 'ready' });
            break;
            
        case 'updateConfig':
            worldWidth = data.worldWidth;
            worldHeight = data.worldHeight;
            break;
            
        case 'updateNPCs':
            const result = updateNPCMiners(data);
            self.postMessage({ 
                type: 'npcUpdated', 
                data: result 
            });
            break;
    }
};

function updateNPCMiners(data) {
    const { npcMiners, asteroids, hazards, stations, playerMiningTargets, dt } = data;
    
    const miningRange = 75;
    const speed = 0.8;
    const acceleration = 0.3;
    const friction = 0.92;
    
    const removedNPCs = [];
    const respawnRequests = [];
    const asteroidUpdates = [];
    const stateChanges = [];
    
    for (let i = npcMiners.length - 1; i >= 0; i--) {
        const npc = npcMiners[i];
        
        // Handle docked state
        if (npc.state === 'docked') {
            // Check if docking duration is complete
            if (Date.now() >= npc.dockedUntil) {
                // Undock and depart
                npc.state = 'departing';
                npc.departureAngle = Math.random() * Math.PI * 2; // New random direction
                stateChanges.push({ index: i, state: 'departing', departureAngle: npc.departureAngle });
            }
            continue; // Skip physics updates while docked
        }
        
        switch (npc.state) {
            case 'departing':
                const dxDepart = npc.x - npc.homeStation.x;
                const dyDepart = npc.y - npc.homeStation.y;
                const distToStation = Math.sqrt(dxDepart * dxDepart + dyDepart * dyDepart);
                
                if (distToStation > npc.homeStation.dockingRange + 50) {
                    npc.state = 'seeking';
                    stateChanges.push({ index: i, state: 'seeking' });
                } else {
                    // Move in the random departure direction set when spawned
                    npc.vx += Math.cos(npc.departureAngle) * acceleration * dt;
                    npc.vy += Math.sin(npc.departureAngle) * acceleration * dt;
                }
                break;
                
            case 'seeking':
                // Add independent timing to each NPC
                npc.seekingTimer = (npc.seekingTimer || 0) + dt;
                
                // Only evaluate new asteroids periodically (creates independence)
                const evaluationInterval = 300 + (Math.abs(Math.sin(npc.x + npc.y)) * 200); // 300-500ms varied per NPC
                
                if (npc.trackingTargetIndex !== undefined && npc.trackingTargetIndex !== -1) {
                    // Currently tracking an asteroid to see if we're getting closer
                    const trackingElapsed = Date.now() - npc.trackingStartTime;
                    
                    if (trackingElapsed >= npc.trackingDuration) {
                        // Tracking period complete - check if we got closer
                        const trackingTarget = asteroids[npc.trackingTargetIndex];
                        if (trackingTarget && !trackingTarget.destroyed) {
                            const dx = trackingTarget.x - npc.x;
                            const dy = trackingTarget.y - npc.y;
                            const currentDist = Math.sqrt(dx * dx + dy * dy);
                            
                            // If we're getting closer (or about the same), commit to this asteroid
                            if (currentDist <= npc.trackingStartDist * 1.1) {
                                npc.targetAsteroidIndex = npc.trackingTargetIndex;
                                npc.state = 'approaching';
                                npc.trackingTargetIndex = -1;
                                stateChanges.push({ 
                                    index: i, 
                                    state: 'approaching',
                                    targetAsteroidIndex: npc.targetAsteroidIndex,
                                    trackingTargetIndex: -1
                                });
                            } else {
                                // Getting further - abandon this target and pick a new tracking duration
                                npc.trackingTargetIndex = -1;
                                npc.trackingDuration = 1000 + Math.random() * 1000;
                                npc.seekingTimer = 0; // Reset to immediately look for another
                            }
                        } else {
                            // Target destroyed, reset
                            npc.trackingTargetIndex = -1;
                            npc.seekingTimer = 0;
                        }
                    } else {
                        // Continue moving toward tracking target while evaluating
                        const trackingTarget = asteroids[npc.trackingTargetIndex];
                        if (trackingTarget && !trackingTarget.destroyed) {
                            const dx = trackingTarget.x - npc.x;
                            const dy = trackingTarget.y - npc.y;
                            const angleToTarget = Math.atan2(dy, dx);
                            npc.vx += Math.cos(angleToTarget) * acceleration * dt * 0.5; // Half speed while tracking
                            npc.vy += Math.sin(angleToTarget) * acceleration * dt * 0.5;
                        }
                    }
                } else if (npc.seekingTimer >= evaluationInterval) {
                    // Time to look for a new asteroid to track
                    npc.seekingTimer = 0;
                    
                    let closestAsteroid = null;
                    let closestDist = Infinity;
                    let closestAsteroidIndex = -1;
                    
                    for (let j = 0; j < asteroids.length; j++) {
                        const asteroid = asteroids[j];
                        if (asteroid.destroyed) continue;
                        
                        // Check if any NPC is already mining, approaching, or tracking this asteroid
                        const beingMined = npcMiners.some(other => 
                            other !== npc && (
                                other.targetAsteroidIndex === j || 
                                other.trackingTargetIndex === j
                            )
                        );
                        
                        // Check if player is mining it
                        const playerMining = playerMiningTargets.some(mt => mt.asteroidIndex === j);
                        
                        if (beingMined || playerMining) continue;
                        
                        const dx = asteroid.x - npc.x;
                        const dy = asteroid.y - npc.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        
                        if (dist < closestDist) {
                            closestDist = dist;
                            closestAsteroid = asteroid;
                            closestAsteroidIndex = j;
                        }
                    }
                    
                    if (closestAsteroid) {
                        // Start tracking this asteroid
                        npc.trackingTargetIndex = closestAsteroidIndex;
                        npc.trackingStartDist = closestDist;
                        npc.trackingStartTime = Date.now();
                    }
                }
                break;
                
            case 'approaching':
                if (npc.targetAsteroidIndex === -1 || 
                    npc.targetAsteroidIndex >= asteroids.length ||
                    asteroids[npc.targetAsteroidIndex].destroyed) {
                    npc.targetAsteroidIndex = -1;
                    npc.state = 'seeking';
                    stateChanges.push({ index: i, state: 'seeking', targetAsteroidIndex: -1 });
                    break;
                }
                
                const targetAsteroid = asteroids[npc.targetAsteroidIndex];
                const dxApproach = targetAsteroid.x - npc.x;
                const dyApproach = targetAsteroid.y - npc.y;
                const distToAsteroid = Math.sqrt(dxApproach * dxApproach + dyApproach * dyApproach);
                
                if (distToAsteroid < miningRange) {
                    npc.state = 'mining';
                    npc.miningProgress = 0;
                    stateChanges.push({ index: i, state: 'mining', miningProgress: 0 });
                } else {
                    const angleToAsteroid = Math.atan2(dyApproach, dxApproach);
                    npc.vx += Math.cos(angleToAsteroid) * acceleration * dt;
                    npc.vy += Math.sin(angleToAsteroid) * acceleration * dt;
                    // Don't instantly set angle - will be smoothed below
                }
                break;
                
            case 'mining':
                if (npc.targetAsteroidIndex === -1 || 
                    npc.targetAsteroidIndex >= asteroids.length ||
                    asteroids[npc.targetAsteroidIndex].destroyed || 
                    npc.cargo >= npc.maxCargo) {
                    npc.targetAsteroidIndex = -1;
                    npc.miningProgress = 0;
                    
                    if (npc.cargo >= npc.maxCargo) {
                        npc.state = 'returning';
                        stateChanges.push({ index: i, state: 'returning', targetAsteroidIndex: -1, miningProgress: 0 });
                    } else {
                        npc.state = 'seeking';
                        stateChanges.push({ index: i, state: 'seeking', targetAsteroidIndex: -1, miningProgress: 0 });
                    }
                    break;
                }
                
                // Check if player started mining this asteroid - if so, stop and find another
                const playerMiningThis = playerMiningTargets.some(mt => mt.asteroidIndex === npc.targetAsteroidIndex);
                if (playerMiningThis) {
                    npc.targetAsteroidIndex = -1;
                    npc.miningProgress = 0;
                    npc.state = 'seeking';
                    stateChanges.push({ index: i, state: 'seeking', targetAsteroidIndex: -1, miningProgress: 0 });
                    break;
                }
                
                const miningTarget = asteroids[npc.targetAsteroidIndex];
                const dxMine = miningTarget.x - npc.x;
                const dyMine = miningTarget.y - npc.y;
                const distMine = Math.sqrt(dxMine * dxMine + dyMine * dyMine);
                
                if (distMine > miningRange * 1.5) {
                    npc.state = 'approaching';
                    npc.miningProgress = 0;
                    stateChanges.push({ index: i, state: 'approaching', miningProgress: 0 });
                    break;
                }
                
                // Calculate tractor beam effects on asteroid
                const pullDistance = npc.size * 1.5; // Extended distance in front of ship (was 0.5)
                const pullTargetX = npc.x + Math.cos(npc.angle) * pullDistance;
                const pullTargetY = npc.y + Math.sin(npc.angle) * pullDistance;
                
                const dx = pullTargetX - miningTarget.x;
                const dy = pullTargetY - miningTarget.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                const holdRadius = 8;
                const approachRadius = 25;
                const maxPullSpeed = 2.5;
                
                const dirX = dx / dist;
                const dirY = dy / dist;
                const velocityTowardTarget = miningTarget.vx * dirX + miningTarget.vy * dirY;
                
                let asteroidVxUpdate = 0;
                let asteroidVyUpdate = 0;
                
                if (dist > holdRadius) {
                    // Pulling phase
                    const normalizedDist = Math.min(dist / miningRange, 1);
                    const proportionalStrength = 0.3 + normalizedDist * 0.4;
                    const proportionalForce = dirX * proportionalStrength * dt;
                    const proportionalForceY = dirY * proportionalStrength * dt;
                    
                    asteroidVxUpdate += proportionalForce;
                    asteroidVyUpdate += proportionalForceY;
                    
                    let dampingStrength = 0.02;
                    
                    if (dist < approachRadius) {
                        const approachFactor = 1 - (dist / approachRadius);
                        dampingStrength += approachFactor * 0.15;
                    }
                    
                    if (velocityTowardTarget > 0) {
                        const velocityFactor = Math.min(velocityTowardTarget / 2, 1);
                        dampingStrength += velocityFactor * 0.08;
                    }
                    
                    const dampingFactor = Math.pow(1 - dampingStrength, dt);
                    miningTarget.vx *= dampingFactor;
                    miningTarget.vy *= dampingFactor;
                    
                    miningTarget.vx += asteroidVxUpdate;
                    miningTarget.vy += asteroidVyUpdate;
                    
                    const currentSpeed = Math.sqrt(miningTarget.vx * miningTarget.vx + miningTarget.vy * miningTarget.vy);
                    if (currentSpeed > maxPullSpeed) {
                        const speedRatio = maxPullSpeed / currentSpeed;
                        miningTarget.vx *= speedRatio;
                        miningTarget.vy *= speedRatio;
                    }
                    
                } else {
                    // Holding phase
                    const holdDampingFactor = Math.pow(0.1, dt);
                    miningTarget.vx *= holdDampingFactor;
                    miningTarget.vy *= holdDampingFactor;
                    
                    const centeringStrength = 0.02 * dt;
                    miningTarget.vx += dirX * centeringStrength;
                    miningTarget.vy += dirY * centeringStrength;
                    
                    const maxHoldSpeed = 0.1;
                    const currentSpeed = Math.sqrt(miningTarget.vx * miningTarget.vx + miningTarget.vy * miningTarget.vy);
                    if (currentSpeed > maxHoldSpeed) {
                        const speedRatio = maxHoldSpeed / currentSpeed;
                        miningTarget.vx *= speedRatio;
                        miningTarget.vy *= speedRatio;
                    }
                }
                
                asteroidUpdates.push({
                    index: npc.targetAsteroidIndex,
                    vx: miningTarget.vx,
                    vy: miningTarget.vy
                });
                
                // Increment mining progress
                npc.miningProgress += dt;
                
                // Complete mining cycle - reduce health and handle destruction
                if (npc.miningProgress >= npc.miningSpeed) {
                    npc.cargo++;
                    npc.miningProgress = 0;
                    
                    // Reduce asteroid health
                    miningTarget.health--;
                    
                    // Check if asteroid destroyed
                    const asteroidDestroyed = miningTarget.health <= 0;
                    
                    // Signal main thread to handle visual effects (particles, geometry shrinking)
                    stateChanges.push({
                        index: i,
                        npcMinedAsteroid: true,
                        asteroidIndex: npc.targetAsteroidIndex, // Use current index before clearing
                        asteroidHealth: miningTarget.health,
                        asteroidDestroyed: asteroidDestroyed
                    });
                    
                    // Update asteroid state BEFORE clearing target index
                    asteroidUpdates.push({
                        index: npc.targetAsteroidIndex,
                        health: miningTarget.health,
                        destroyed: asteroidDestroyed
                    });
                    
                    // Now handle destruction and clear target
                    if (asteroidDestroyed) {
                        miningTarget.destroyed = true;
                        npc.targetAsteroidIndex = -1;
                        
                        if (npc.cargo >= npc.maxCargo) {
                            npc.state = 'returning';
                            stateChanges.push({ index: i, state: 'returning', targetAsteroidIndex: -1 });
                        } else {
                            npc.state = 'seeking';
                            stateChanges.push({ index: i, state: 'seeking', targetAsteroidIndex: -1 });
                        }
                    }
                }
                break;
                
            case 'returning':
                const dxReturn = npc.homeStation.x - npc.x;
                const dyReturn = npc.homeStation.y - npc.y;
                const distReturn = Math.sqrt(dxReturn * dxReturn + dyReturn * dyReturn);
                
                if (distReturn < npc.homeStation.dockingRange) {
                    // Dock at station - set docked state with timer
                    npc.state = 'docked';
                    npc.dockedUntil = Date.now() + (10000 + Math.random() * 20000); // 10-30 seconds
                    npc.cargo = 0; // Sold cargo
                    npc.vx = 0;
                    npc.vy = 0;
                    stateChanges.push({ index: i, state: 'docked', dockedUntil: npc.dockedUntil });
                    continue;
                } else {
                    const angleToStation = Math.atan2(dyReturn, dxReturn);
                    npc.vx += Math.cos(angleToStation) * acceleration * dt;
                    npc.vy += Math.sin(angleToStation) * acceleration * dt;
                    // Don't instantly set angle - will be smoothed below
                }
                break;
        }
        
        // Smooth turning - calculate desired angle from velocity
        if (npc.vx !== 0 || npc.vy !== 0) {
            const desiredAngle = Math.atan2(npc.vy, npc.vx);
            
            // Calculate angle difference (shortest path)
            let angleDiff = desiredAngle - npc.angle;
            
            // Normalize angle difference to [-PI, PI]
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            
            // Apply angular acceleration (turn rate)
            const turnSpeed = 0.08 * dt;
            const maxAngularVelocity = 0.1;
            
            // Calculate angular acceleration toward desired angle
            const angularAcceleration = angleDiff * turnSpeed;
            npc.angularVelocity = (npc.angularVelocity || 0) + angularAcceleration;
            
            // Clamp angular velocity
            if (npc.angularVelocity > maxAngularVelocity) npc.angularVelocity = maxAngularVelocity;
            if (npc.angularVelocity < -maxAngularVelocity) npc.angularVelocity = -maxAngularVelocity;
            
            // Apply angular damping
            npc.angularVelocity *= 0.85;
            
            // Update angle
            npc.angle += npc.angularVelocity * dt;
            
            // Normalize angle to [0, 2PI]
            while (npc.angle > Math.PI * 2) npc.angle -= Math.PI * 2;
            while (npc.angle < 0) npc.angle += Math.PI * 2;
        }
        
        // Apply friction
        const frictionFactor = Math.pow(friction, dt);
        npc.vx *= frictionFactor;
        npc.vy *= frictionFactor;
        
        // Limit speed
        const currentSpeed = Math.sqrt(npc.vx * npc.vx + npc.vy * npc.vy);
        if (currentSpeed > speed) {
            npc.vx = (npc.vx / currentSpeed) * speed;
            npc.vy = (npc.vy / currentSpeed) * speed;
        }
        
        // Update position
        npc.x += npc.vx * dt;
        npc.y += npc.vy * dt;
        
        // Clamp to world bounds
        npc.x = Math.max(npc.size, Math.min(worldWidth - npc.size, npc.x));
        npc.y = Math.max(npc.size, Math.min(worldHeight - npc.size, npc.y));
        
        // Check for hazard collisions
        for (const hazard of hazards) {
            const dx = hazard.x - npc.x;
            const dy = hazard.y - npc.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < hazard.size + npc.size + 50) {
                const avoidAngle = Math.atan2(-dy, -dx);
                npc.vx += Math.cos(avoidAngle) * 0.5 * dt;
                npc.vy += Math.sin(avoidAngle) * 0.5 * dt;
            }
        }
    }
    
    return {
        npcMiners,
        removedNPCs,
        respawnRequests,
        asteroidUpdates,
        stateChanges
    };
}
