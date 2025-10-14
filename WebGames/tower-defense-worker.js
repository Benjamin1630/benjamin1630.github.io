// Tower Defense: Web Worker for Pathfinding and Heavy Computations
// This worker handles CPU-intensive tasks off the main thread

// Message handler for worker tasks
self.onmessage = function(e) {
    const { type, data } = e.data;
    
    switch(type) {
        case 'FIND_PATH':
            const path = findPath(data.start, data.end, data.grid, data.cols, data.rows);
            self.postMessage({ type: 'PATH_RESULT', data: { path, requestId: data.requestId } });
            break;
            
        case 'GENERATE_SERPENTINE_PATH':
            const serpentinePath = generateSerpentinePath(
                data.entry,
                data.exit,
                data.cols,
                data.rows,
                data.minTurns,
                data.maxTurns
            );
            self.postMessage({ 
                type: 'SERPENTINE_PATH_RESULT', 
                data: { path: serpentinePath, requestId: data.requestId } 
            });
            break;
            
        case 'BATCH_PATHFIND':
            const paths = data.requests.map(req => ({
                id: req.id,
                path: findPath(req.start, req.end, data.grid, data.cols, data.rows)
            }));
            self.postMessage({ type: 'BATCH_PATH_RESULT', data: { paths } });
            break;
    }
};

// A* Pathfinding algorithm
function findPath(start, end, grid, cols, rows) {
    const openSet = [start];
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();
    
    const key = (x, y) => `${x},${y}`;
    
    gScore.set(key(start.x, start.y), 0);
    fScore.set(key(start.x, start.y), heuristic(start, end));
    
    while (openSet.length > 0) {
        // Get node with lowest fScore (optimized with min-heap would be better, but this is simpler)
        let currentIdx = 0;
        let minScore = fScore.get(key(openSet[0].x, openSet[0].y)) || Infinity;
        
        for (let i = 1; i < openSet.length; i++) {
            const nodeScore = fScore.get(key(openSet[i].x, openSet[i].y)) || Infinity;
            if (nodeScore < minScore) {
                minScore = nodeScore;
                currentIdx = i;
            }
        }
        
        const current = openSet[currentIdx];
        
        if (current.x === end.x && current.y === end.y) {
            return reconstructPath(cameFrom, current);
        }
        
        openSet.splice(currentIdx, 1);
        
        // Check neighbors (no diagonals)
        const neighbors = [
            {x: current.x + 1, y: current.y},
            {x: current.x - 1, y: current.y},
            {x: current.x, y: current.y + 1},
            {x: current.x, y: current.y - 1}
        ];
        
        for (let neighbor of neighbors) {
            if (neighbor.x < 0 || neighbor.x >= cols || 
                neighbor.y < 0 || neighbor.y >= rows) {
                continue;
            }
            
            // Skip walls (cell type 3) and invalid cells (cell type 0)
            const cellType = grid[neighbor.y][neighbor.x];
            if (cellType === 0 || cellType === 3) {
                continue;
            }
            
            const tentativeGScore = (gScore.get(key(current.x, current.y)) || Infinity) + 1;
            const neighborKey = key(neighbor.x, neighbor.y);
            
            if (tentativeGScore < (gScore.get(neighborKey) || Infinity)) {
                cameFrom.set(neighborKey, current);
                gScore.set(neighborKey, tentativeGScore);
                fScore.set(neighborKey, tentativeGScore + heuristic(neighbor, end));
                
                if (!openSet.some(n => n.x === neighbor.x && n.y === neighbor.y)) {
                    openSet.push(neighbor);
                }
            }
        }
    }
    
    // No path found, return straight line
    return [{x: start.x, y: start.y}, {x: end.x, y: end.y}];
}

function heuristic(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function reconstructPath(cameFrom, current) {
    const path = [current];
    const key = (x, y) => `${x},${y}`;
    
    while (cameFrom.has(key(current.x, current.y))) {
        current = cameFrom.get(key(current.x, current.y));
        path.unshift(current);
    }
    
    return path;
}

// Generate serpentine path (complex path generation)
function generateSerpentinePath(entry, exit, cols, rows, minTurns, maxTurns) {
    let bestPath = null;
    let bestScore = -Infinity;
    const MAX_GENERATION_ATTEMPTS = 10;
    
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
        const result = generateSinglePath(entry, exit, cols, rows, minTurns, maxTurns);
        
        if (result && result.turnCount >= minTurns) {
            const score = result.turnCount * 10 + result.path.length + result.variation * 5;
            
            if (score > bestScore) {
                bestScore = score;
                bestPath = result.path;
            }
        }
    }
    
    return bestPath || generateSinglePath(entry, exit, cols, rows, minTurns, maxTurns).path;
}

function generateSinglePath(entry, exit, cols, rows, minTurns, maxTurns) {
    const path = [];
    const occupiedCells = new Map();
    let turnCount = 0;
    let variation = 0;
    
    let currentX = entry.x;
    let currentY = entry.y;
    
    path.push({x: currentX, y: currentY});
    occupiedCells.set(`${currentX},${currentY}`, 'START');
    
    // Simple serpentine generation - can be enhanced further
    let direction = 0; // 0=right, 1=down, 2=left, 3=up
    const targetX = exit.x;
    const targetY = exit.y;
    
    while (currentX !== targetX || currentY !== targetY) {
        const dx = targetX - currentX;
        const dy = targetY - currentY;
        
        // Determine next direction
        if (Math.abs(dx) > Math.abs(dy)) {
            direction = dx > 0 ? 0 : 2; // Right or left
        } else {
            direction = dy > 0 ? 1 : 3; // Down or up
        }
        
        // Add some randomness for variation
        if (Math.random() < 0.3 && turnCount < maxTurns) {
            direction = (direction + (Math.random() < 0.5 ? 1 : -1) + 4) % 4;
            turnCount++;
            variation++;
        }
        
        // Move in the chosen direction
        const segmentLength = Math.min(
            Math.floor(Math.random() * 5) + 3,
            Math.abs(direction % 2 === 0 ? dx : dy) || 1
        );
        
        for (let i = 0; i < segmentLength; i++) {
            const nextX = currentX + (direction === 0 ? 1 : direction === 2 ? -1 : 0);
            const nextY = currentY + (direction === 1 ? 1 : direction === 3 ? -1 : 0);
            
            if (nextX < 0 || nextX >= cols || nextY < 0 || nextY >= rows) break;
            if (nextX === targetX && nextY === targetY) {
                path.push({x: nextX, y: nextY});
                return { path, turnCount, variation };
            }
            
            currentX = nextX;
            currentY = nextY;
            path.push({x: currentX, y: currentY});
            occupiedCells.set(`${currentX},${currentY}`, direction % 2 === 0 ? 'H' : 'V');
        }
    }
    
    return { path, turnCount, variation };
}
