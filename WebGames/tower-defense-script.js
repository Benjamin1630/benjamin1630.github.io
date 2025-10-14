// Tower Defense: Grid Command - Main Script
// Retro Terminal ASCII Tower Defense

// ========================================
// WEB WORKER INITIALIZATION (Multithreading)
// ========================================

let pathfindingWorker = null;
let workerAvailable = true;
let pathfindingCallbacks = new Map();
let pathRequestId = 0;

// Initialize Web Worker for pathfinding
try {
    pathfindingWorker = new Worker('tower-defense-worker.js');
    pathfindingWorker.onmessage = function(e) {
        const { type, data } = e.data;
        
        if (type === 'PATH_RESULT' && data.requestId) {
            const callback = pathfindingCallbacks.get(data.requestId);
            if (callback) {
                callback(data.path);
                pathfindingCallbacks.delete(data.requestId);
            }
        } else if (type === 'SERPENTINE_PATH_RESULT' && data.requestId) {
            const callback = pathfindingCallbacks.get(data.requestId);
            if (callback) {
                callback(data.path);
                pathfindingCallbacks.delete(data.requestId);
            }
        } else if (type === 'BATCH_PATH_RESULT') {
            // Handle batch pathfinding results
            data.paths.forEach(result => {
                const callback = pathfindingCallbacks.get(result.id);
                if (callback) {
                    callback(result.path);
                    pathfindingCallbacks.delete(result.id);
                }
            });
        }
    };
    
    pathfindingWorker.onerror = function(error) {
        console.warn('Pathfinding worker error, falling back to main thread:', error);
        workerAvailable = false;
    };
} catch (error) {
    console.warn('Web Worker not available, using main thread for pathfinding');
    workerAvailable = false;
}

// ========================================
// SPATIAL PARTITIONING (Performance Optimization)
// ========================================

class SpatialGrid {
    constructor(cellSize, worldWidth, worldHeight) {
        this.cellSize = cellSize;
        this.cols = Math.ceil(worldWidth / cellSize);
        this.rows = Math.ceil(worldHeight / cellSize);
        this.cells = new Map();
    }
    
    clear() {
        this.cells.clear();
    }
    
    getCellKey(x, y) {
        const col = Math.floor(x / this.cellSize);
        const row = Math.floor(y / this.cellSize);
        return `${col},${row}`;
    }
    
    insert(entity, x, y) {
        const key = this.getCellKey(x, y);
        if (!this.cells.has(key)) {
            this.cells.set(key, []);
        }
        this.cells.get(key).push(entity);
    }
    
    query(x, y, radius) {
        const results = [];
        const minCol = Math.floor((x - radius) / this.cellSize);
        const maxCol = Math.floor((x + radius) / this.cellSize);
        const minRow = Math.floor((y - radius) / this.cellSize);
        const maxRow = Math.floor((y + radius) / this.cellSize);
        
        for (let col = minCol; col <= maxCol; col++) {
            for (let row = minRow; row <= maxRow; row++) {
                const key = `${col},${row}`;
                const cellEntities = this.cells.get(key);
                if (cellEntities) {
                    results.push(...cellEntities);
                }
            }
        }
        
        return results;
    }
}

let enemySpatialGrid = null;
let towerSpatialGrid = null;

// ========================================
// OBJECT POOLING (Memory Optimization)
// ========================================

class ObjectPool {
    constructor(createFn, resetFn, initialSize = 50) {
        this.createFn = createFn;
        this.resetFn = resetFn;
        this.pool = [];
        this.active = [];
        
        // Pre-allocate objects
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(createFn());
        }
    }
    
    acquire() {
        let obj;
        if (this.pool.length > 0) {
            obj = this.pool.pop();
        } else {
            obj = this.createFn();
        }
        this.active.push(obj);
        return obj;
    }
    
    release(obj) {
        const index = this.active.indexOf(obj);
        if (index !== -1) {
            this.active.splice(index, 1);
            this.resetFn(obj);
            this.pool.push(obj);
        }
    }
    
    releaseAll() {
        while (this.active.length > 0) {
            const obj = this.active.pop();
            this.resetFn(obj);
            this.pool.push(obj);
        }
    }
}

// Projectile pool
const projectilePool = new ObjectPool(
    () => ({ x: 0, y: 0, targetX: 0, targetY: 0, target: null, damage: 0, speed: 0, color: '', tower: null }),
    (obj) => {
        obj.x = 0;
        obj.y = 0;
        obj.targetX = 0;
        obj.targetY = 0;
        obj.target = null;
        obj.damage = 0;
        obj.speed = 0;
        obj.aoe = undefined;
        obj.color = '';
        obj.tower = null;
        obj.isChain = undefined;
        obj.isInitialShot = undefined;
        obj.lifetime = undefined;
        obj.chainTargets = undefined;
        obj.chainRange = undefined;
        obj.hitTargets = undefined;
    }
);

// ========================================
// GAME CONFIGURATION
// ========================================

const CONFIG = {
    CELL_SIZE: 40,
    GRID_PADDING: 20,
    MAX_PATH_DISTANCE: 2,
    FPS: 60,
    TOWER_TYPES: {
        shooter: {
            name: 'Transistor',
            icon: '▲',
            cost: 60,
            damage: 10,
            range: 3,
            fireRate: 500,
            projectileSpeed: 15,
            color: '#00ffff'
        },
        sniper: {
            name: 'Diode Array',
            icon: '⊗',
            cost: 120,
            damage: 40,
            range: 5,
            fireRate: 2000,
            projectileSpeed: 25,
            color: '#ffffff'
        },
        artillery: {
            name: 'Capacitor',
            icon: '⊕',
            cost: 150,
            damage: 25,
            range: 4,
            fireRate: 1500,
            aoe: 1.5,
            projectileSpeed: 10,
            color: '#ff0000'
        },
        cpu: {
            name: 'CPU Core',
            icon: '▣',
            cost: 180,
            damage: 18,
            range: 3.5,
            fireRate: 800,
            projectileSpeed: 18,
            multiTarget: true,
            maxTargets: 3,
            color: '#ff8800'
        },
        slower: {
            name: 'Resistor',
            icon: '◊',
            cost: 100,
            damage: 0,
            range: 3,
            fireRate: 100,
            slow: 0.5,
            color: '#00ffff'
        },
        laser: {
            name: 'Laser Diode',
            icon: '═►',
            cost: 200,
            damage: 5,
            range: 6,
            continuous: true,
            color: '#ffff00'
        },
        pulse: {
            name: 'EMP Coil',
            icon: '◎',
            cost: 120,
            damage: 15,
            range: 2.5,
            fireRate: 1200,
            aoe: 2.5,
            projectileSpeed: 20,
            multiTarget: true,
            color: '#ff00ff'
        },
        ram: {
            name: 'RAM Bank',
            icon: '≡',
            cost: 130,
            damage: 0,
            range: 2,
            boost: 0.25,
            color: '#00ff00'
        },
        voltage: {
            name: 'Voltage Regulator',
            icon: '⚡',
            cost: 220,
            damage: 30,
            range: 3,
            fireRate: 600,
            projectileSpeed: 30,
            chain: true,
            chainRange: 2,
            chainTargets: 3,
            color: '#00ddff'
        },
        heatsink: {
            name: 'Heat Sink',
            icon: '▦',
            cost: 160,
            damage: 0,
            range: 3,
            cooldown: 0.3,
            color: '#88ccff'
        },
        overclock: {
            name: 'Overclock Module',
            icon: '⟳',
            cost: 140,
            damage: 0,
            range: 2.5,
            rangeBoost: 2,
            color: '#ff44ff'
        },
        shield: {
            name: 'Shield Generator',
            icon: '◘',
            cost: 130,
            damage: 0,
            range: 2.5,
            armor: 0.25,
            color: '#44ddff'
        },
        battery: {
            name: 'Battery Array',
            icon: '▥',
            cost: 110,
            damage: 0,
            range: 2,
            goldBoost: 0.5,
            color: '#ffaa00'
        },
        conductor: {
            name: 'Conductor Coil',
            icon: '⊚',
            cost: 175,
            damage: 0,
            range: 3.5,
            chainBoost: 1,
            color: '#00ffaa'
        }
    },
    ENEMY_TYPES: {
        scout: {
            name: 'Bug',
            icon: '●',
            hp: 60,
            speed: 0.7,
            reward: 8,
            color: '#ff0000'
        },
        soldier: {
            name: 'Virus',
            icon: '♦',
            hp: 100,
            speed: 0.55,
            reward: 15,
            color: '#ff3333'
        },
        tank: {
            name: 'Malware',
            icon: '۞',
            hp: 250,
            speed: 0.35,
            reward: 35,
            color: '#ff6666'
        },
        runner: {
            name: 'Worm',
            icon: '►',
            hp: 40,
            speed: 1.1,
            reward: 12,
            color: '#ff9999'
        },
        boss: {
            name: 'Trojan',
            icon: '★',
            hp: 1000,
            speed: 0.2,
            reward: 150,
            color: '#ffff00'
        }
    }
};

// ========================================
// GAME STATE
// ========================================

let gameState = {
    wave: 1,
    lives: 3,
    gold: 250,
    score: 0,
    isPaused: true,  // Start paused until boot sequence completes
    isGameOver: false,
    speed: 1,
    waveInProgress: false,
    enemiesKilled: 0,
    enemiesSpawned: 0,
    waveTimer: 0,
    waveDelay: 30000,
    maxPathTurns: 16,  // Start with 16 turns for more complex paths, increases with difficulty
    runsCompleted: 0  // Track number of times wave 15 has been completed
};

// Track if pause was initiated by user vs automatically (for modals)
let wasUserPaused = false;

// Track if new level modal has been shown after completing wave 15
let newLevelModalShown = false;

let grid = {
    cols: 0,
    rows: 0,
    cells: [],
    path: [],
    entry: null,
    exit: null
};

let viewport = {
    x: 0,
    y: 0,
    zoom: 1.0,
    minZoom: 0.5,
    maxZoom: 2.0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    lastTouchDist: 0
};

let selectedCell = null;
let selectedTowerType = null;
let towers = [];
let enemies = [];
let projectiles = [];

// Game time tracking (for consistent speed)
let gameTime = 0;
let enemySpawnQueue = [];

// ========================================
// CANVAS SETUP
// ========================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    const container = canvas.parentElement;
    const oldWidth = canvas.width;
    const oldHeight = canvas.height;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    
    // Only regenerate level on initial load (when grid doesn't exist)
    // Don't regenerate on window resize during gameplay
    if (grid.cols === 0) {
        generateLevel();
    }
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ========================================
// CUSTOM MODAL SYSTEM
// ========================================

function showCustomModal(message, title = 'SYSTEM MESSAGE', options = {}) {
    return new Promise((resolve) => {
        const modal = document.getElementById('customModal');
        const dialogTitle = document.getElementById('dialogTitle');
        const dialogMessage = document.getElementById('dialogMessage');
        const dialogStats = document.getElementById('dialogStats');
        const confirmBtn = document.getElementById('dialogConfirm');
        const cancelBtn = document.getElementById('dialogCancel');
        
        // Auto-pause the game when modal opens (but remember if it was already paused)
        const wasPausedBeforeModal = gameState.isPaused;
        if (!gameState.isPaused) {
            gameState.isPaused = true;
            document.getElementById('pauseText').textContent = 'RESUME';
        }
        
        // Default options
        const {
            showCancel = false,
            confirmText = 'OK',
            cancelText = 'NO',
            stats = null
        } = options;
        
        // Set content
        dialogTitle.textContent = `║   ${title.toUpperCase()}   ║`;
        dialogMessage.textContent = message;
        
        // Handle stats display
        if (stats) {
            dialogStats.innerHTML = Object.entries(stats)
                .map(([label, value]) => `
                    <div class="dialog-stat">
                        <span>${label}:</span>
                        <span class="dialog-stat-value">${value}</span>
                    </div>
                `)
                .join('');
            dialogStats.style.display = 'flex';
        } else {
            dialogStats.innerHTML = '';
            dialogStats.style.display = 'none';
        }
        
        // Configure buttons
        if (showCancel) {
            confirmBtn.innerHTML = `<span class="btn-bracket">[</span>${confirmText}<span class="btn-bracket">]</span>`;
            cancelBtn.innerHTML = `<span class="btn-bracket">[</span>${cancelText}<span class="btn-bracket">]</span>`;
            cancelBtn.style.display = 'inline-block';
        } else {
            confirmBtn.innerHTML = `<span class="btn-bracket">[</span>${confirmText}<span class="btn-bracket">]</span>`;
            cancelBtn.style.display = 'none';
        }
        
        // Show modal
        modal.classList.remove('hidden');
        
        // Handle clicks
        const handleConfirm = () => {
            modal.classList.add('hidden');
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
            document.removeEventListener('keydown', handleKeypress);
            
            // Auto-unpause only if game wasn't paused before modal
            if (!wasPausedBeforeModal && !wasUserPaused) {
                gameState.isPaused = false;
                document.getElementById('pauseText').textContent = 'PAUSE';
            }
            
            resolve(true);
        };
        
        const handleCancel = () => {
            modal.classList.add('hidden');
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
            document.removeEventListener('keydown', handleKeypress);
            
            // Auto-unpause only if game wasn't paused before modal
            if (!wasPausedBeforeModal && !wasUserPaused) {
                gameState.isPaused = false;
                document.getElementById('pauseText').textContent = 'PAUSE';
            }
            
            resolve(false);
        };
        
        const handleKeypress = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleConfirm();
            } else if (e.key === 'Escape' && showCancel) {
                e.preventDefault();
                handleCancel();
            }
        };
        
        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
        document.addEventListener('keydown', handleKeypress);
        
        // Focus confirm button
        confirmBtn.focus();
    });
}

// Custom confirm function
async function customConfirm(message, title = 'CONFIRM') {
    return await showCustomModal(message, title, { showCancel: true, confirmText: 'YES', cancelText: 'NO' });
}

// Custom alert function
async function customAlert(message, title = 'ALERT') {
    return await showCustomModal(message, title, { confirmText: 'OK' });
}

// ========================================
// BOOT SEQUENCE
// ========================================

const bootMessages = [
    'GRID COMMAND SYSTEM v1.0.1',
    'Copyright (C) 2025 Defense Systems Inc.',
    '',
    'Initializing tactical grid...',
    'Loading tower specifications...',
    'Calibrating targeting systems...',
    'Establishing enemy database...',
    'Running pathfinding algorithms...',
    '',
    'System ready.',
];

function runBootSequence() {
    const bootText = document.getElementById('bootText');
    const bootSeq = document.getElementById('bootSequence');
    let lineIndex = 0;
    
    function typeLine() {
        if (lineIndex < bootMessages.length) {
            bootText.textContent += bootMessages[lineIndex] + '\n';
            lineIndex++;
            setTimeout(typeLine, 300);
        } else {
            // Add countdown
            setTimeout(() => {
                bootText.textContent += 'Commencing program in 3...';
                setTimeout(() => {
                    bootText.textContent += ' 2...';
                    setTimeout(() => {
                        bootText.textContent += ' 1...';
                        setTimeout(() => {
                            bootSeq.classList.add('hidden');
                            document.body.classList.remove('booting');
                            // Unpause game now that boot sequence is complete
                            startGameAfterBoot();
                        }, 1000);
                    }, 1000);
                }, 1000);
            }, 500);
        }
    }
    
    setTimeout(typeLine, 500);
}

// Skip boot on click
document.getElementById('bootSequence').addEventListener('click', () => {
    document.getElementById('bootSequence').classList.add('hidden');
    document.body.classList.remove('booting');
    // Unpause game immediately when boot is skipped
    startGameAfterBoot();
});

// Function to start the game after boot sequence
function startGameAfterBoot() {
    gameState.isPaused = false;
    document.getElementById('pauseText').textContent = 'PAUSE';
}

runBootSequence();

// ========================================
// PROCEDURAL LEVEL GENERATION
// ========================================

function generateLevel() {
    // Consistent playable grid size across all devices
    const PLAYABLE_SIZE = 64;
    
    // Calculate decorative padding based on canvas size to create seamless, endless illusion
    // Padding = (half of canvas dimension / cell size) * 2 + 1
    const HORIZONTAL_PADDING = Math.ceil((canvas.width / 2) / CONFIG.CELL_SIZE) * 2 + 1;
    const VERTICAL_PADDING = Math.ceil((canvas.height / 2) / CONFIG.CELL_SIZE) * 2 + 1;
    
    // Total grid includes playable area + decorative padding on all sides
    grid.cols = PLAYABLE_SIZE + (HORIZONTAL_PADDING * 2);
    grid.rows = PLAYABLE_SIZE + (VERTICAL_PADDING * 2);
    
    // Store the playable bounds (centered area where path and towers can exist)
    grid.playableBounds = {
        minX: HORIZONTAL_PADDING,
        minY: VERTICAL_PADDING,
        maxX: HORIZONTAL_PADDING + PLAYABLE_SIZE - 1,
        maxY: VERTICAL_PADDING + PLAYABLE_SIZE - 1
    };
    
    // Initialize cells (0 = invalid/decorative, 1 = buildable, 2 = path, 3 = decorative wall)
    grid.cells = Array(grid.rows).fill(null).map((_, y) => 
        Array(grid.cols).fill(null).map((_, x) => {
            // Cells outside playable bounds are decorative (3 for visual walls)
            if (x < grid.playableBounds.minX || x > grid.playableBounds.maxX ||
                y < grid.playableBounds.minY || y > grid.playableBounds.maxY) {
                return 3; // Decorative wall area
            }
            return 0; // Will be set to buildable (1) or path (2) later
        })
    );
    
    // Randomize entry and exit points with minimum distance requirement
    const MIN_DISTANCE = 24; // Minimum distance between entry and exit (Manhattan distance)
    const EDGE_MARGIN = 2; // Keep away from absolute edges
    
    let entry, exit;
    let attempts = 0;
    const MAX_ATTEMPTS = 100;
    
    do {
        // Random position on any edge for entry
        const entrySide = Math.floor(Math.random() * 4); // 0=top, 1=right, 2=bottom, 3=left
        
        switch(entrySide) {
            case 0: // Top
                entry = {
                    x: HORIZONTAL_PADDING + EDGE_MARGIN + Math.floor(Math.random() * (PLAYABLE_SIZE - EDGE_MARGIN * 2)),
                    y: VERTICAL_PADDING + EDGE_MARGIN
                };
                break;
            case 1: // Right
                entry = {
                    x: HORIZONTAL_PADDING + PLAYABLE_SIZE - 1 - EDGE_MARGIN,
                    y: VERTICAL_PADDING + EDGE_MARGIN + Math.floor(Math.random() * (PLAYABLE_SIZE - EDGE_MARGIN * 2))
                };
                break;
            case 2: // Bottom
                entry = {
                    x: HORIZONTAL_PADDING + EDGE_MARGIN + Math.floor(Math.random() * (PLAYABLE_SIZE - EDGE_MARGIN * 2)),
                    y: VERTICAL_PADDING + PLAYABLE_SIZE - 1 - EDGE_MARGIN
                };
                break;
            case 3: // Left
                entry = {
                    x: HORIZONTAL_PADDING + EDGE_MARGIN,
                    y: VERTICAL_PADDING + EDGE_MARGIN + Math.floor(Math.random() * (PLAYABLE_SIZE - EDGE_MARGIN * 2))
                };
                break;
        }
        
        // Random position on any edge for exit
        const exitSide = Math.floor(Math.random() * 4);
        
        switch(exitSide) {
            case 0: // Top
                exit = {
                    x: HORIZONTAL_PADDING + EDGE_MARGIN + Math.floor(Math.random() * (PLAYABLE_SIZE - EDGE_MARGIN * 2)),
                    y: VERTICAL_PADDING + EDGE_MARGIN
                };
                break;
            case 1: // Right
                exit = {
                    x: HORIZONTAL_PADDING + PLAYABLE_SIZE - 1 - EDGE_MARGIN,
                    y: VERTICAL_PADDING + EDGE_MARGIN + Math.floor(Math.random() * (PLAYABLE_SIZE - EDGE_MARGIN * 2))
                };
                break;
            case 2: // Bottom
                exit = {
                    x: HORIZONTAL_PADDING + EDGE_MARGIN + Math.floor(Math.random() * (PLAYABLE_SIZE - EDGE_MARGIN * 2)),
                    y: VERTICAL_PADDING + PLAYABLE_SIZE - 1 - EDGE_MARGIN
                };
                break;
            case 3: // Left
                exit = {
                    x: HORIZONTAL_PADDING + EDGE_MARGIN,
                    y: VERTICAL_PADDING + EDGE_MARGIN + Math.floor(Math.random() * (PLAYABLE_SIZE - EDGE_MARGIN * 2))
                };
                break;
        }
        
        // Calculate distance
        const dx = exit.x - entry.x;
        const dy = exit.y - entry.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        attempts++;
        
        if (distance >= MIN_DISTANCE || attempts >= MAX_ATTEMPTS) {
            break;
        }
    } while (true);
    
    grid.entry = entry;
    grid.exit = exit;
    
    // Temporarily set cols/rows to playable size for path generation
    const originalCols = grid.cols;
    const originalRows = grid.rows;
    grid.cols = PLAYABLE_SIZE;
    grid.rows = PLAYABLE_SIZE;
    
    // Adjust entry/exit for path generation (relative coordinates)
    const pathEntry = {
        x: entry.x - HORIZONTAL_PADDING,
        y: entry.y - VERTICAL_PADDING
    };
    const pathExit = {
        x: exit.x - HORIZONTAL_PADDING,
        y: exit.y - VERTICAL_PADDING
    };
    
    // Temporarily swap entry/exit
    const realEntry = grid.entry;
    const realExit = grid.exit;
    grid.entry = pathEntry;
    grid.exit = pathExit;
    
    // Generate serpentine/winding path
    const generatedPath = generateSerpentinePath();
    
    // Restore actual grid size and entry/exit
    grid.cols = originalCols;
    grid.rows = originalRows;
    grid.entry = realEntry;
    grid.exit = realExit;
    
    // Calculate path bounds (in relative coordinates before padding offset)
    let minPathX = Infinity, maxPathX = -Infinity;
    let minPathY = Infinity, maxPathY = -Infinity;
    
    generatedPath.forEach(cell => {
        minPathX = Math.min(minPathX, cell.x);
        maxPathX = Math.max(maxPathX, cell.x);
        minPathY = Math.min(minPathY, cell.y);
        maxPathY = Math.max(maxPathY, cell.y);
    });
    
    // Calculate how much to shift the path to center it in the playable grid
    const pathWidth = maxPathX - minPathX;
    const pathHeight = maxPathY - minPathY;
    const centerOffsetX = Math.floor((PLAYABLE_SIZE - pathWidth) / 2) - minPathX;
    const centerOffsetY = Math.floor((PLAYABLE_SIZE - pathHeight) / 2) - minPathY;
    
    // Apply centering offset and decorative padding to path FIRST
    grid.path = generatedPath.map(cell => ({
        x: cell.x + centerOffsetX + HORIZONTAL_PADDING,
        y: cell.y + centerOffsetY + VERTICAL_PADDING
    }));
    
    // Update entry and exit to match the centered path
    grid.entry = {
        x: (entry.x - HORIZONTAL_PADDING) + centerOffsetX + HORIZONTAL_PADDING,
        y: (entry.y - VERTICAL_PADDING) + centerOffsetY + VERTICAL_PADDING
    };
    grid.exit = {
        x: (exit.x - HORIZONTAL_PADDING) + centerOffsetX + HORIZONTAL_PADDING,
        y: (exit.y - VERTICAL_PADDING) + centerOffsetY + VERTICAL_PADDING
    };
    
    // Recalculate path center (now should be centered in playable grid)
    const pathCenterX = (PLAYABLE_SIZE / 2) + HORIZONTAL_PADDING;
    const pathCenterY = (PLAYABLE_SIZE / 2) + VERTICAL_PADDING;
    
    // NOW mark buildable cells BEFORE marking path cells
    // This ensures buildable cells are calculated based on the centered path position
    for (let y = grid.playableBounds.minY; y <= grid.playableBounds.maxY; y++) {
        for (let x = grid.playableBounds.minX; x <= grid.playableBounds.maxX; x++) {
            if (grid.cells[y][x] === 0) {
                const dist = minDistanceToPath(x, y);
                if (dist <= CONFIG.MAX_PATH_DISTANCE) {
                    grid.cells[y][x] = 1; // Mark as buildable
                }
            }
        }
    }
    
    // Mark path cells AFTER buildable cells are determined
    // This ensures path cells overwrite buildable cells where they overlap
    grid.path.forEach(cell => {
        if (cell.x >= 0 && cell.x < grid.cols && cell.y >= 0 && cell.y < grid.rows) {
            grid.cells[cell.y][cell.x] = 2; // Mark as path
        }
    });
    
    // Center viewport on the path center
    viewport.x = pathCenterX * CONFIG.CELL_SIZE - canvas.width / (2 * viewport.zoom);
    viewport.y = pathCenterY * CONFIG.CELL_SIZE - canvas.height / (2 * viewport.zoom);
    clampViewport();
    updateZoomDisplay();
    
    console.log(`Level generated: ${grid.cols}x${grid.rows} total grid (${PLAYABLE_SIZE}x${PLAYABLE_SIZE} playable + ${HORIZONTAL_PADDING}h x ${VERTICAL_PADDING}v decorative padding), Entry: [${grid.entry.x}, ${grid.entry.y}], Exit: [${grid.exit.x}, ${grid.exit.y}], Distance: ${Math.floor(Math.sqrt(Math.pow(grid.exit.x - grid.entry.x, 2) + Math.pow(grid.exit.y - grid.entry.y, 2)))}, Path center: [${pathCenterX.toFixed(1)}, ${pathCenterY.toFixed(1)}], Path length: ${grid.path.length} cells, max turns: ${gameState.maxPathTurns}`);
}


function generateSerpentinePath() {
    // Enhanced path generation algorithm with complexity and variation
    // Rules:
    // 1. Path can only make 90-degree turns
    // 2. Path segments can cross each other ONLY at right angles (perpendicular crossing)
    // 3. Path segments CANNOT overlap (run parallel on the same cells) - prevents obscuring
    // 4. Minimum number of turns must be met
    // 5. Path has variation in segment lengths and patterns
    // 6. Minimum 4 straight cells after each turn (with one exception for entrance/exit)
    
    const maxPathTurns = gameState.maxPathTurns || 12;
    const minPathTurns = Math.max(6, Math.floor(maxPathTurns * 0.6)); // Minimum 60% of max turns
    
    let bestPath = null;
    let bestScore = -Infinity;
    const MAX_GENERATION_ATTEMPTS = 10;
    
    // Try multiple path generations and pick the best one
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
        const result = generateSinglePath(minPathTurns, maxPathTurns);
        
        if (result && result.turnCount >= minPathTurns) {
            // Score based on: turn count, path length, and variation
            const score = result.turnCount * 10 + result.path.length + result.variation * 5;
            
            if (score > bestScore) {
                bestScore = score;
                bestPath = result.path;
            }
        }
    }
    
    return bestPath || generateSinglePath(minPathTurns, maxPathTurns).path;
}

function generateSinglePath(minTurns, maxTurns) {
    const path = [];
    const occupiedCells = new Map(); // Track cells and their direction
    let crossoverUsed = false; // Track if we've used our one crossover
    let shortSegmentUsed = false; // Track if we've used our one short segment (<3 cells)
    let turnCount = 0;
    
    let currentX = grid.entry.x;
    let currentY = grid.entry.y;
    
    // Add starting position
    path.push({x: currentX, y: currentY});
    occupiedCells.set(`${currentX},${currentY}`, 'START');
    
    // Pattern types for complex path generation
    const PATTERN_TYPES = {
        STRAIGHT: 'straight',      // Simple straight line
        STAIRCASE: 'staircase',    // Staircase/zigzag pattern
        WIDE_TURN: 'wide_turn',    // Multi-cell wide turn
        SPIRAL: 'spiral'           // Small spiral pattern
    };
    
    // Helper: Check if we can place a segment
    const canPlaceSegment = (x1, y1, x2, y2, allowCrossover) => {
        let wouldCrossover = false;
        
        if (x1 === x2) {
            // Vertical segment
            const startY = Math.min(y1, y2);
            const endY = Math.max(y1, y2);
            
            for (let y = startY; y <= endY; y++) {
                if (y === y1) continue;
                
                const key = `${x1},${y}`;
                const existing = occupiedCells.get(key);
                
                if (existing) {
                    if (existing === 'H') {
                        continue; // Perpendicular crossing is always OK
                    } else if (existing === 'V' || existing === 'CROSS' || existing === 'BRIDGE') {
                        // Same direction overlap - NEVER allow this to prevent path obscuring
                        return {canPlace: false, crossover: false};
                    } else if (existing === 'START' || existing === 'END') {
                        return {canPlace: false, crossover: false};
                    }
                }
            }
        } else {
            // Horizontal segment
            const startX = Math.min(x1, x2);
            const endX = Math.max(x1, x2);
            
            for (let x = startX; x <= endX; x++) {
                if (x === x1) continue;
                
                const key = `${x},${y1}`;
                const existing = occupiedCells.get(key);
                
                if (existing) {
                    if (existing === 'V') {
                        continue; // Perpendicular crossing is always OK
                    } else if (existing === 'H' || existing === 'CROSS' || existing === 'BRIDGE') {
                        // Same direction overlap - NEVER allow this to prevent path obscuring
                        return {canPlace: false, crossover: false};
                    } else if (existing === 'START' || existing === 'END') {
                        return {canPlace: false, crossover: false};
                    }
                }
            }
        }
        
        return {canPlace: true, crossover: wouldCrossover};
    };
    
    // Helper: Place a segment and mark cells
    const placeSegment = (x1, y1, x2, y2, usedCrossover) => {
        if (x1 === x2) {
            // Vertical segment
            const startY = y1;
            const endY = y2;
            const step = endY > startY ? 1 : -1;
            
            for (let y = startY + step; y !== endY + step; y += step) {
                path.push({x: x1, y});
                
                const key = `${x1},${y}`;
                const existing = occupiedCells.get(key);
                
                // Only allow perpendicular crossings (H crossing V)
                if (existing && existing === 'H') {
                    occupiedCells.set(key, 'CROSS');
                } else if (!existing) {
                    occupiedCells.set(key, 'V');
                }
                // If existing is 'V', 'CROSS', or 'BRIDGE', this shouldn't happen
                // since canPlaceSegment should have rejected it
            }
        } else {
            // Horizontal segment
            const startX = x1;
            const endX = x2;
            const step = endX > startX ? 1 : -1;
            
            for (let x = startX + step; x !== endX + step; x += step) {
                path.push({x, y: y1});
                
                const key = `${x},${y1}`;
                const existing = occupiedCells.get(key);
                
                // Only allow perpendicular crossings (V crossing H)
                if (existing && existing === 'V') {
                    occupiedCells.set(key, 'CROSS');
                } else if (!existing) {
                    occupiedCells.set(key, 'H');
                }
                // If existing is 'H', 'CROSS', or 'BRIDGE', this shouldn't happen
                // since canPlaceSegment should have rejected it
            }
        }
        
        if (usedCrossover) {
            crossoverUsed = true;
        }
    };
    
    // Helper: Try to create a staircase/zigzag pattern
    const tryStaircasePattern = (startX, startY, targetDist, horizontal, allowCrossover) => {
        const steps = Math.min(Math.floor(targetDist / 2), 4); // 2-4 steps in staircase
        const stepSize = Math.floor(targetDist / steps);
        
        // Ensure minimum of 4 cells per segment
        if (stepSize < 4) return null;
        
        let testX = startX;
        let testY = startY;
        const testPath = [];
        
        for (let i = 0; i < steps; i++) {
            // Move in primary direction
            const primaryMove = horizontal ? stepSize : stepSize;
            const newX = horizontal ? testX + (Math.sign(targetDist) * stepSize) : testX;
            const newY = horizontal ? testY : testY + (Math.sign(targetDist) * stepSize);
            
            const result1 = canPlaceSegment(testX, testY, newX, newY, allowCrossover);
            if (!result1.canPlace) return null;
            
            testX = newX;
            testY = newY;
            testPath.push({x: testX, y: testY, result: result1});
            
            // Move perpendicular (minimum 4 cells)
            if (i < steps - 1) {
                const perpSize = Math.floor(Math.random() * 3) + 4; // 4-6 cells perpendicular
                const perpX = horizontal ? testX : testX + (Math.random() > 0.5 ? perpSize : -perpSize);
                const perpY = horizontal ? testY + (Math.random() > 0.5 ? perpSize : -perpSize) : testY;
                
                // Check bounds
                if (perpX < 0 || perpX >= grid.cols || perpY < 0 || perpY >= grid.rows) return null;
                
                const result2 = canPlaceSegment(testX, testY, perpX, perpY, allowCrossover);
                if (!result2.canPlace) return null;
                
                testX = perpX;
                testY = perpY;
                testPath.push({x: testX, y: testY, result: result2});
            }
        }
        
        return testPath;
    };
    
    // Helper: Try to create a wide turn (L-shape with thickness)
    const tryWideTurn = (startX, startY, goRight, goDown, allowCrossover) => {
        // Ensure minimum of 4 cells per segment
        const width = Math.floor(Math.random() * 4) + 4; // 4-7 cells wide
        const height = Math.floor(Math.random() * 4) + 4; // 4-7 cells high
        
        let testX = startX;
        let testY = startY;
        const testPath = [];
        
        // First leg
        const newX1 = goRight ? testX + width : testX - width;
        if (newX1 < 0 || newX1 >= grid.cols) return null;
        
        const result1 = canPlaceSegment(testX, testY, newX1, testY, allowCrossover);
        if (!result1.canPlace) return null;
        
        testX = newX1;
        testPath.push({x: testX, y: testY, result: result1});
        
        // Corner piece - move minimum 4 cells perpendicular
        const cornerSize = Math.floor(Math.random() * 2) + 4; // 4-5 cells
        const newY1 = goDown ? testY + cornerSize : testY - cornerSize;
        if (newY1 < 0 || newY1 >= grid.rows) return null;
        
        const result2 = canPlaceSegment(testX, testY, testX, newY1, allowCrossover);
        if (!result2.canPlace) return null;
        
        testY = newY1;
        testPath.push({x: testX, y: testY, result: result2});
        
        // Parallel return leg (minimum 4 cells)
        const returnWidth = Math.max(4, width - 1);
        const newX2 = goRight ? testX - returnWidth : testX + returnWidth;
        if (newX2 < 0 || newX2 >= grid.cols) return null;
        
        const result3 = canPlaceSegment(testX, testY, newX2, testY, allowCrossover);
        if (!result3.canPlace) return null;
        
        testX = newX2;
        testPath.push({x: testX, y: testY, result: result3});
        
        // Final leg down/up
        const newY2 = goDown ? testY + height : testY - height;
        if (newY2 < 0 || newY2 >= grid.rows) return null;
        
        const result4 = canPlaceSegment(testX, testY, testX, newY2, allowCrossover);
        if (!result4.canPlace) return null;
        
        testY = newY2;
        testPath.push({x: testX, y: testY, result: result4});
        
        return testPath;
    };
    
    // Generate path with variation in segment lengths and complex patterns
    let turnsRemaining = maxTurns;
    let lastMoveDirection = null;
    let segmentLengths = []; // Track for variation calculation
    let consecutiveSameLength = 0;
    let lastSegmentLength = 0;
    let patternsSinceComplex = 0; // Track patterns since last complex pattern
    
    while ((currentX !== grid.exit.x || currentY !== grid.exit.y) && turnsRemaining > 0) {
        const deltaX = grid.exit.x - currentX;
        const deltaY = grid.exit.y - currentY;
        
        if (deltaX === 0 && deltaY === 0) break;
        
        // Decide if we should try a complex pattern
        const distanceToExit = Math.abs(deltaX) + Math.abs(deltaY);
        const canUseComplexPattern = turnsRemaining >= 4 && distanceToExit > 12 && patternsSinceComplex >= 2;
        const shouldTryComplexPattern = canUseComplexPattern && Math.random() > 0.5;
        
        let moved = false;
        const allowCrossover = turnsRemaining > 2;
        
        // Try complex patterns first if conditions are right
        if (shouldTryComplexPattern) {
            const patternChoice = Math.random();
            
            // Try staircase pattern (40% chance)
            if (patternChoice < 0.4) {
                const horizontal = Math.abs(deltaX) > Math.abs(deltaY);
                const distance = horizontal ? Math.abs(deltaX) : Math.abs(deltaY);
                const staircase = tryStaircasePattern(currentX, currentY, distance, horizontal, allowCrossover);
                
                if (staircase && staircase.length > 0) {
                    // Apply the staircase pattern
                    for (const step of staircase) {
                        placeSegment(currentX, currentY, step.x, step.y, step.result.crossover);
                        currentX = step.x;
                        currentY = step.y;
                        turnsRemaining--;
                        turnCount++;
                        segmentLengths.push(Math.abs(step.x - currentX) + Math.abs(step.y - currentY));
                    }
                    lastMoveDirection = horizontal ? 'H' : 'V';
                    patternsSinceComplex = 0;
                    moved = true;
                }
            }
            // Try wide turn pattern (60% chance or fallback)
            else {
                const goRight = deltaX > 0;
                const goDown = deltaY > 0;
                const wideTurn = tryWideTurn(currentX, currentY, goRight, goDown, allowCrossover);
                
                if (wideTurn && wideTurn.length > 0) {
                    // Apply the wide turn pattern
                    for (const step of wideTurn) {
                        placeSegment(currentX, currentY, step.x, step.y, step.result.crossover);
                        currentX = step.x;
                        currentY = step.y;
                        turnsRemaining--;
                        turnCount++;
                        segmentLengths.push(Math.abs(step.x - currentX) + Math.abs(step.y - currentY));
                    }
                    lastMoveDirection = goRight ? 'H' : 'V';
                    patternsSinceComplex = 0;
                    moved = true;
                }
            }
        }
        
        // If complex pattern didn't work or wasn't tried, use standard movement
        if (!moved) {
            patternsSinceComplex++;
            
            // Add some randomness to create more interesting paths
            const addComplexity = turnsRemaining > (maxTurns * 0.3) && Math.random() > 0.6;
            
            // Determine direction priority
            let tryHorizontalFirst = Math.abs(deltaX) > Math.abs(deltaY);
            
            // Alternate to create winding paths
            if (lastMoveDirection === 'H' && deltaY !== 0) {
                tryHorizontalFirst = false;
            } else if (lastMoveDirection === 'V' && deltaX !== 0) {
                tryHorizontalFirst = true;
            }
            
            // Sometimes force alternation for complexity
            if (addComplexity && Math.random() > 0.5) {
                tryHorizontalFirst = !tryHorizontalFirst;
            }
            
            const directions = tryHorizontalFirst ? ['H', 'V'] : ['V', 'H'];
            
            for (const dir of directions) {
            if (dir === 'H' && deltaX !== 0) {
                // Variable segment length with more variation
                // Enforce minimum of 4 cells after each turn (with one exception allowed)
                const distanceRemaining = Math.abs(grid.exit.x - currentX) + Math.abs(grid.exit.y - currentY);
                const nearEnd = distanceRemaining < 10 || turnsRemaining <= 2;
                
                // Allow shorter segments only if:
                // 1. We haven't used the short segment yet AND
                // 2. We're near the end OR the distance available is less than 4
                const canUseShortSegment = !shortSegmentUsed && (nearEnd || Math.abs(deltaX) < 4);
                const minLength = canUseShortSegment && Math.abs(deltaX) < 4 ? Math.max(1, Math.abs(deltaX)) : 4;
                const maxLength = Math.min(Math.abs(deltaX), 12);
                
                // Skip if not enough distance and can't use short segment
                if (maxLength < minLength) continue;
                
                let segmentLength;
                
                // Vary segment length to avoid repetition
                if (consecutiveSameLength >= 2) {
                    segmentLength = lastSegmentLength + Math.floor(Math.random() * 4) - 2;
                } else {
                    segmentLength = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
                }
                
                segmentLength = Math.max(minLength, Math.min(maxLength, segmentLength));
                
                const targetX = currentX + (deltaX > 0 ? segmentLength : -segmentLength);
                
                if (targetX < 0 || targetX >= grid.cols) continue;
                
                const allowCrossover = turnsRemaining > 2; // Don't use crossover near the end
                const result = canPlaceSegment(currentX, currentY, targetX, currentY, allowCrossover);
                
                if (result.canPlace) {
                    placeSegment(currentX, currentY, targetX, currentY, result.crossover);
                    currentX = targetX;
                    lastMoveDirection = 'H';
                    turnsRemaining--;
                    turnCount++;
                    moved = true;
                    
                    // Mark if we used a short segment
                    if (segmentLength < 4) {
                        shortSegmentUsed = true;
                    }
                    
                    // Track segment lengths
                    segmentLengths.push(segmentLength);
                    if (segmentLength === lastSegmentLength) {
                        consecutiveSameLength++;
                    } else {
                        consecutiveSameLength = 0;
                    }
                    lastSegmentLength = segmentLength;
                    
                    break;
                }
            } else if (dir === 'V' && deltaY !== 0) {
                // Enforce minimum of 4 cells after each turn (with one exception allowed)
                const distanceRemaining = Math.abs(grid.exit.x - currentX) + Math.abs(grid.exit.y - currentY);
                const nearEnd = distanceRemaining < 10 || turnsRemaining <= 2;
                
                const canUseShortSegment = !shortSegmentUsed && (nearEnd || Math.abs(deltaY) < 4);
                const minLength = canUseShortSegment && Math.abs(deltaY) < 4 ? Math.max(1, Math.abs(deltaY)) : 4;
                const maxLength = Math.min(Math.abs(deltaY), 12);
                
                // Skip if not enough distance and can't use short segment
                if (maxLength < minLength) continue;
                
                let segmentLength;
                
                if (consecutiveSameLength >= 2) {
                    segmentLength = lastSegmentLength + Math.floor(Math.random() * 4) - 2;
                } else {
                    segmentLength = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
                }
                
                segmentLength = Math.max(minLength, Math.min(maxLength, segmentLength));
                
                const targetY = currentY + (deltaY > 0 ? segmentLength : -segmentLength);
                
                if (targetY < 0 || targetY >= grid.rows) continue;
                
                const allowCrossover = turnsRemaining > 2;
                const result = canPlaceSegment(currentX, currentY, currentX, targetY, allowCrossover);
                
                if (result.canPlace) {
                    placeSegment(currentX, currentY, currentX, targetY, result.crossover);
                    currentY = targetY;
                    lastMoveDirection = 'V';
                    turnsRemaining--;
                    turnCount++;
                    moved = true;
                    
                    // Mark if we used a short segment
                    if (segmentLength < 4) {
                        shortSegmentUsed = true;
                    }
                    
                    segmentLengths.push(segmentLength);
                    if (segmentLength === lastSegmentLength) {
                        consecutiveSameLength++;
                    } else {
                        consecutiveSameLength = 0;
                    }
                    lastSegmentLength = segmentLength;
                    
                    break;
                }
            }
            }
        }
        
        // If stuck or minimum turns not met but close to exit
        if (!moved || (turnsRemaining <= 1 && turnCount >= minTurns)) {
            // Final approach - direct path to exit
            if (currentX !== grid.exit.x) {
                const step = grid.exit.x > currentX ? 1 : -1;
                while (currentX !== grid.exit.x) {
                    currentX += step;
                    path.push({x: currentX, y: currentY});
                    const key = `${currentX},${currentY}`;
                    if (!occupiedCells.has(key)) {
                        occupiedCells.set(key, 'H');
                    }
                }
            }
            
            if (currentY !== grid.exit.y) {
                const step = grid.exit.y > currentY ? 1 : -1;
                while (currentY !== grid.exit.y) {
                    currentY += step;
                    path.push({x: currentX, y: currentY});
                    const key = `${currentX},${currentY}`;
                    if (!occupiedCells.has(key)) {
                        occupiedCells.set(key, 'V');
                    }
                }
            }
            
            break;
        }
        
        // If stuck and minimum turns not met, restart
        if (!moved && turnCount < minTurns) {
            return null;
        }
    }
    
    // Calculate variation score (higher is more varied)
    const variation = segmentLengths.length > 0 
        ? segmentLengths.reduce((sum, len, i, arr) => {
            if (i === 0) return 0;
            return sum + Math.abs(len - arr[i - 1]);
        }, 0) / segmentLengths.length
        : 0;
    
    occupiedCells.set(`${grid.exit.x},${grid.exit.y}`, 'END');
    
    return {
        path,
        turnCount,
        variation,
        usedCrossover: crossoverUsed
    };
}

function minDistanceToPath(x, y) {
    let minDist = Infinity;
    
    for (let cell of grid.path) {
        const dist = Math.abs(x - cell.x) + Math.abs(y - cell.y);
        minDist = Math.min(minDist, dist);
    }
    
    return minDist;
}

// ========================================
// A* PATHFINDING
// ========================================

// Async pathfinding using Web Worker (when available)
function findPathAsync(start, end, callback) {
    if (workerAvailable && pathfindingWorker) {
        const requestId = ++pathRequestId;
        pathfindingCallbacks.set(requestId, callback);
        
        pathfindingWorker.postMessage({
            type: 'FIND_PATH',
            data: {
                start,
                end,
                grid: grid.cells,
                cols: grid.cols,
                rows: grid.rows,
                requestId
            }
        });
    } else {
        // Fallback to synchronous pathfinding on main thread
        const path = findPath(start, end);
        callback(path);
    }
}

// Synchronous pathfinding (fallback)
function findPath(start, end) {
    const openSet = [start];
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();
    
    const key = (x, y) => `${x},${y}`;
    
    gScore.set(key(start.x, start.y), 0);
    fScore.set(key(start.x, start.y), heuristic(start, end));
    
    while (openSet.length > 0) {
        // Get node with lowest fScore
        let current = openSet.reduce((min, node) => {
            const minScore = fScore.get(key(min.x, min.y)) || Infinity;
            const nodeScore = fScore.get(key(node.x, node.y)) || Infinity;
            return nodeScore < minScore ? node : min;
        });
        
        if (current.x === end.x && current.y === end.y) {
            return reconstructPath(cameFrom, current);
        }
        
        openSet.splice(openSet.indexOf(current), 1);
        
        // Check neighbors (no diagonals)
        const neighbors = [
            {x: current.x + 1, y: current.y},
            {x: current.x - 1, y: current.y},
            {x: current.x, y: current.y + 1},
            {x: current.x, y: current.y - 1}
        ];
        
        for (let neighbor of neighbors) {
            if (neighbor.x < 0 || neighbor.x >= grid.cols || 
                neighbor.y < 0 || neighbor.y >= grid.rows) {
                continue;
            }
            
            // Skip walls (cell type 3) and invalid cells (cell type 0)
            const cellType = grid.cells[neighbor.y][neighbor.x];
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

// ========================================
// VIEWPORT CONTROLS
// ========================================

function centerView() {
    // Center on the playable area, not the entire grid
    if (grid.playableBounds) {
        const playableWidth = (grid.playableBounds.maxX - grid.playableBounds.minX + 1) * CONFIG.CELL_SIZE;
        const playableHeight = (grid.playableBounds.maxY - grid.playableBounds.minY + 1) * CONFIG.CELL_SIZE;
        const playableOffsetX = grid.playableBounds.minX * CONFIG.CELL_SIZE;
        const playableOffsetY = grid.playableBounds.minY * CONFIG.CELL_SIZE;
        
        viewport.x = playableOffsetX + (playableWidth - canvas.width / viewport.zoom) / 2;
        viewport.y = playableOffsetY + (playableHeight - canvas.height / viewport.zoom) / 2;
    } else {
        // Fallback for old behavior
        const gridWidth = grid.cols * CONFIG.CELL_SIZE;
        const gridHeight = grid.rows * CONFIG.CELL_SIZE;
        
        viewport.x = (gridWidth - canvas.width / viewport.zoom) / 2;
        viewport.y = (gridHeight - canvas.height / viewport.zoom) / 2;
    }
    
    clampViewport();
}

function clampViewport() {
    // Use playable bounds (64x64 grid) instead of full grid (128x128)
    const playableMinX = grid.playableBounds.minX * CONFIG.CELL_SIZE;
    const playableMinY = grid.playableBounds.minY * CONFIG.CELL_SIZE;
    const playableMaxX = (grid.playableBounds.maxX + 1) * CONFIG.CELL_SIZE;
    const playableMaxY = (grid.playableBounds.maxY + 1) * CONFIG.CELL_SIZE;
    
    const playableWidth = playableMaxX - playableMinX;
    const playableHeight = playableMaxY - playableMinY;
    
    const viewportWidth = canvas.width / viewport.zoom;
    const viewportHeight = canvas.height / viewport.zoom;
    
    // Allow scrolling within playable area with margin to center edges
    const minX = playableMinX - (viewportWidth / 2);
    const minY = playableMinY - (viewportHeight / 2);
    const maxX = playableMinX + playableWidth - (viewportWidth / 2);
    const maxY = playableMinY + playableHeight - (viewportHeight / 2);
    
    viewport.x = Math.max(minX, Math.min(viewport.x, maxX));
    viewport.y = Math.max(minY, Math.min(viewport.y, maxY));
}

function screenToWorld(screenX, screenY) {
    return {
        x: screenX / viewport.zoom + viewport.x,
        y: screenY / viewport.zoom + viewport.y
    };
}

function worldToGrid(worldX, worldY) {
    return {
        x: Math.floor(worldX / CONFIG.CELL_SIZE),
        y: Math.floor(worldY / CONFIG.CELL_SIZE)
    };
}

// ========================================
// INPUT HANDLING
// ========================================

// Mouse/Touch controls
canvas.addEventListener('mousedown', handlePointerDown);
canvas.addEventListener('mousemove', handlePointerMove);
canvas.addEventListener('mouseup', handlePointerUp);
canvas.addEventListener('wheel', handleWheel);

canvas.addEventListener('touchstart', handleTouchStart, {passive: false});
canvas.addEventListener('touchmove', handleTouchMove, {passive: false});
canvas.addEventListener('touchend', handleTouchEnd);

function handlePointerDown(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (e.button === 0) { // Left click
        viewport.isDragging = true;
        viewport.dragStartX = x;
        viewport.dragStartY = y;
        viewport.lastViewX = viewport.x;
        viewport.lastViewY = viewport.y;
    }
}

function handlePointerMove(e) {
    if (viewport.isDragging) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const dx = (viewport.dragStartX - x) / viewport.zoom;
        const dy = (viewport.dragStartY - y) / viewport.zoom;
        
        viewport.x = viewport.lastViewX + dx;
        viewport.y = viewport.lastViewY + dy;
        
        clampViewport();
    }
}

function handlePointerUp(e) {
    if (viewport.isDragging) {
        viewport.isDragging = false;
        
        // Check if it was a click (minimal drag)
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const dragDist = Math.sqrt(
            Math.pow(x - viewport.dragStartX, 2) + 
            Math.pow(y - viewport.dragStartY, 2)
        );
        
        if (dragDist < 5) {
            handleCellClick(x, y);
        }
    }
}

function handleWheel(e) {
    e.preventDefault();
    
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(viewport.minZoom, Math.min(viewport.maxZoom, viewport.zoom * zoomFactor));
    
    // Zoom towards mouse position
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const worldPos = screenToWorld(mouseX, mouseY);
    
    viewport.zoom = newZoom;
    
    viewport.x = worldPos.x - mouseX / viewport.zoom;
    viewport.y = worldPos.y - mouseY / viewport.zoom;
    
    clampViewport();
    updateZoomDisplay();
}

let touchStartPositions = [];

function handleTouchStart(e) {
    e.preventDefault();
    touchStartPositions = Array.from(e.touches).map(t => ({x: t.clientX, y: t.clientY}));
    
    if (e.touches.length === 1) {
        const rect = canvas.getBoundingClientRect();
        viewport.isDragging = true;
        viewport.dragStartX = e.touches[0].clientX - rect.left;
        viewport.dragStartY = e.touches[0].clientY - rect.top;
        viewport.lastViewX = viewport.x;
        viewport.lastViewY = viewport.y;
    } else if (e.touches.length === 2) {
        viewport.isDragging = false;
        viewport.lastTouchDist = getTouchDistance(e.touches[0], e.touches[1]);
    }
}

function handleTouchMove(e) {
    e.preventDefault();
    
    if (e.touches.length === 1 && viewport.isDragging) {
        const rect = canvas.getBoundingClientRect();
        const x = e.touches[0].clientX - rect.left;
        const y = e.touches[0].clientY - rect.top;
        
        const dx = (viewport.dragStartX - x) / viewport.zoom;
        const dy = (viewport.dragStartY - y) / viewport.zoom;
        
        viewport.x = viewport.lastViewX + dx;
        viewport.y = viewport.lastViewY + dy;
        
        clampViewport();
    } else if (e.touches.length === 2) {
        const dist = getTouchDistance(e.touches[0], e.touches[1]);
        
        if (viewport.lastTouchDist > 0) {
            const zoomFactor = dist / viewport.lastTouchDist;
            const oldZoom = viewport.zoom;
            const newZoom = Math.max(viewport.minZoom, Math.min(viewport.maxZoom, viewport.zoom * zoomFactor));
            
            // Calculate the midpoint of the two touches in canvas coordinates
            const rect = canvas.getBoundingClientRect();
            const touch1X = e.touches[0].clientX - rect.left;
            const touch1Y = e.touches[0].clientY - rect.top;
            const touch2X = e.touches[1].clientX - rect.left;
            const touch2Y = e.touches[1].clientY - rect.top;
            
            const midX = (touch1X + touch2X) / 2;
            const midY = (touch1Y + touch2Y) / 2;
            
            // Convert midpoint to world coordinates before zoom
            const worldX = viewport.x + midX / oldZoom;
            const worldY = viewport.y + midY / oldZoom;
            
            // Update zoom
            viewport.zoom = newZoom;
            
            // Adjust viewport position to keep the same world point under the midpoint
            viewport.x = worldX - midX / newZoom;
            viewport.y = worldY - midY / newZoom;
            
            clampViewport();
            updateZoomDisplay();
        }
        
        viewport.lastTouchDist = dist;
    }
}

function handleTouchEnd(e) {
    if (e.touches.length === 0) {
        if (viewport.isDragging && touchStartPositions.length === 1) {
            // Check if it was a tap
            const rect = canvas.getBoundingClientRect();
            const dx = Math.abs(touchStartPositions[0].x - rect.left - viewport.dragStartX);
            const dy = Math.abs(touchStartPositions[0].y - rect.top - viewport.dragStartY);
            
            if (dx < 10 && dy < 10) {
                handleCellClick(viewport.dragStartX, viewport.dragStartY);
            }
        }
        
        viewport.isDragging = false;
        viewport.lastTouchDist = 0;
        touchStartPositions = [];
    }
}

function getTouchDistance(touch1, touch2) {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function handleCellClick(screenX, screenY) {
    const world = screenToWorld(screenX, screenY);
    
    // Check if clicking on tower UI buttons first
    if (selectedCell) {
        const tower = towers.find(t => t.x === selectedCell.x && t.y === selectedCell.y);
        if (tower && tower.uiButtons) {
            // Check upgrade button
            if (tower.uiButtons.upgrade) {
                const btn = tower.uiButtons.upgrade;
                if (world.x >= btn.x && world.x <= btn.x + btn.width &&
                    world.y >= btn.y && world.y <= btn.y + btn.height) {
                    // Clicked upgrade button
                    if (gameState.gold >= btn.cost) {
                        upgradeTower();
                    }
                    return; // Don't change selection
                }
            }
            
            // Check sell button
            if (tower.uiButtons.sell) {
                const btn = tower.uiButtons.sell;
                if (world.x >= btn.x && world.x <= btn.x + btn.width &&
                    world.y >= btn.y && world.y <= btn.y + btn.height) {
                    // Clicked sell button
                    sellTower();
                    return; // Don't change selection
                }
            }
        }
    }
    
    // If not clicking a button, select the cell
    const gridPos = worldToGrid(world.x, world.y);
    
    if (gridPos.x >= 0 && gridPos.x < grid.cols && gridPos.y >= 0 && gridPos.y < grid.rows) {
        selectCell(gridPos.x, gridPos.y);
    }
}

// Keyboard controls
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        togglePause();
    } else if (e.code === 'Escape') {
        selectedCell = null;
        selectedTowerType = null;
        updateSelectionInfo();
    } else if (e.code === 'KeyC') {
        centerView();
    }
});

// ========================================
// CELL SELECTION
// ========================================

function selectCell(x, y) {
    selectedCell = {x, y};
    updateSelectionInfo();
}

function updateSelectionInfo() {
    const infoDiv = document.getElementById('selectionInfo');
    const upgradeBtn = document.getElementById('upgradeBtn');
    const sellBtn = document.getElementById('sellBtn');
    
    // These elements were removed from the side panel, so they may not exist
    if (!selectedCell) {
        if (infoDiv) infoDiv.innerHTML = '<div class="info-text">Click a cell to select</div>';
        if (upgradeBtn) upgradeBtn.disabled = true;
        if (sellBtn) sellBtn.disabled = true;
        return;
    }
    
    const cellType = grid.cells[selectedCell.y][selectedCell.x];
    const tower = towers.find(t => t.x === selectedCell.x && t.y === selectedCell.y);
    
    if (tower) {
        const config = CONFIG.TOWER_TYPES[tower.type];
        const sellValue = Math.floor(tower.totalCost * 0.7);
        const upgradeCost = tower.level >= 3 ? null : Math.floor(config.cost * Math.pow(2, tower.level)); // Increased from 1.5 to 2.0 for balance
        
        if (infoDiv) {
            let infoHTML = `
                <div><strong>${config.name}</strong> (Lv${tower.level})</div>
                <div>Position: [${selectedCell.x}, ${selectedCell.y}]</div>
                <div>Kills: ${tower.kills || 0}</div>
            `;
            
            if (upgradeCost !== null) {
                infoHTML += `<div>Upgrade: ${upgradeCost}G</div>`;
            }
            
            infoHTML += `<div>Sell value: ${sellValue}G</div>`;
            
            infoDiv.innerHTML = infoHTML;
        }
        
        if (upgradeBtn) upgradeBtn.disabled = tower.level >= 3;
        if (sellBtn) sellBtn.disabled = false;
    } else {
        if (infoDiv) {
            const typeStr = cellType === 0 ? 'Invalid' : cellType === 1 ? 'Buildable' : 'Path';
            infoDiv.innerHTML = `
                <div>Cell: [${selectedCell.x}, ${selectedCell.y}]</div>
                <div>Type: ${typeStr}</div>
                <div>${selectedTowerType ? `Ready to build ${selectedTowerType}` : 'Select tower type'}</div>
            `;
        }
        
        if (upgradeBtn) upgradeBtn.disabled = true;
        if (sellBtn) sellBtn.disabled = true;
    }
}

// ========================================
// TOWER BUILDING
// ========================================

function buildTower(type, x, y) {
    const cellType = grid.cells[y][x];
    
    if (cellType !== 1) {
        console.log('Cannot build on this cell');
        return false;
    }
    
    const existing = towers.find(t => t.x === x && t.y === y);
    if (existing) {
        console.log('Cell already has a tower');
        return false;
    }
    
    const config = CONFIG.TOWER_TYPES[type];
    if (gameState.gold < config.cost) {
        console.log('Not enough gold');
        return false;
    }
    
    const tower = {
        type,
        x,
        y,
        level: 1,
        lastShot: 0,
        kills: 0,
        totalCost: config.cost,
        target: null
    };
    
    towers.push(tower);
    gameState.gold -= config.cost;
    
    updateUI();
    updateSelectionInfo();
    
    return true;
}

function upgradeTower() {
    if (!selectedCell) return;
    
    const tower = towers.find(t => t.x === selectedCell.x && t.y === selectedCell.y);
    if (!tower || tower.level >= 3) return;
    
    const config = CONFIG.TOWER_TYPES[tower.type];
    const upgradeCost = Math.floor(config.cost * Math.pow(2, tower.level)); // Increased from 1.5 to 2.0 for balance
    
    if (gameState.gold < upgradeCost) {
        console.log('Not enough gold');
        return;
    }
    
    gameState.gold -= upgradeCost;
    tower.level++;
    tower.totalCost += upgradeCost;
    
    updateUI();
    updateSelectionInfo();
}

function sellTower() {
    if (!selectedCell) return;
    
    const towerIndex = towers.findIndex(t => t.x === selectedCell.x && t.y === selectedCell.y);
    if (towerIndex === -1) return;
    
    const tower = towers[towerIndex];
    const config = CONFIG.TOWER_TYPES[tower.type];
    const sellValue = Math.floor(tower.totalCost * 0.7);
    
    gameState.gold += sellValue;
    towers.splice(towerIndex, 1);
    
    if (config.blocking) {
        grid.cells[tower.y][tower.x] = 1; // Restore buildable
        updateEnemyPaths();
    }
    
    selectedCell = null;
    updateUI();
    updateSelectionInfo();
}

function updateEnemyPaths() {
    // Recalculate path for all enemies from their current grid position
    // Use async pathfinding with Web Worker when available
    enemies.forEach(enemy => {
        // Use current grid position as starting point
        const currentGridPos = {
            x: enemy.gridX || Math.floor(enemy.x / CONFIG.CELL_SIZE),
            y: enemy.gridY || Math.floor(enemy.y / CONFIG.CELL_SIZE)
        };
        
        // Try async pathfinding first (non-blocking)
        if (workerAvailable && pathfindingWorker) {
            findPathAsync(currentGridPos, grid.exit, (path) => {
                // Only update if enemy still exists (might have been destroyed while calculating)
                if (enemies.includes(enemy)) {
                    enemy.path = path;
                    enemy.pathIndex = 0;
                    enemy.moveProgress = 0;
                }
            });
        } else {
            // Fallback to synchronous (blocking)
            enemy.path = findPath(currentGridPos, grid.exit);
            enemy.pathIndex = 0;
            enemy.moveProgress = 0;
        }
    });
}

// ========================================
// WAVE MANAGEMENT
// ========================================

function startWave() {
    if (gameState.waveInProgress) return;
    
    gameState.waveInProgress = true;
    gameState.enemiesSpawned = 0;
    
    const waveConfig = getWaveConfig(gameState.wave);
    
    spawnEnemies(waveConfig);
    updateUI();
}

function getWaveConfig(wave) {
    const config = {
        enemies: [],
        total: 0
    };
    
    // Progressive difficulty - rebalanced for more challenge
    if (wave <= 3) {
        config.enemies.push({type: 'scout', count: 8 + wave * 3});
    } else if (wave <= 7) {
        config.enemies.push({type: 'scout', count: 8 + wave});
        config.enemies.push({type: 'soldier', count: 5 + wave * 2});
        config.enemies.push({type: 'runner', count: 2});
    } else if (wave <= 10) {
        config.enemies.push({type: 'scout', count: 5});
        config.enemies.push({type: 'soldier', count: 8 + wave});
        config.enemies.push({type: 'tank', count: 3 + wave});
        config.enemies.push({type: 'runner', count: 5 + wave});
    } else {
        config.enemies.push({type: 'soldier', count: 15 + wave});
        config.enemies.push({type: 'tank', count: 8 + Math.floor(wave / 2)});
        config.enemies.push({type: 'runner', count: 10 + wave});
        
        if (wave % 5 === 0) {
            config.enemies.push({type: 'boss', count: 1 + Math.floor((wave - 10) / 5)});
        }
    }
    
    config.total = config.enemies.reduce((sum, e) => sum + e.count, 0);
    
    return config;
}

function spawnEnemies(waveConfig) {
    // Clear previous spawn queue
    enemySpawnQueue = [];
    
    const spawnInterval = 1000; // 1 second between spawns in game time
    let spawnIndex = 0;
    
    // Build spawn queue with game-time timestamps
    for (let typeConfig of waveConfig.enemies) {
        for (let i = 0; i < typeConfig.count; i++) {
            enemySpawnQueue.push({
                type: typeConfig.type,
                spawnTime: gameTime + (spawnIndex * spawnInterval)
            });
            spawnIndex++;
        }
    }
}

function createEnemy(type) {
    const config = CONFIG.ENEMY_TYPES[type];
    
    const enemy = {
        type,
        gridX: grid.entry.x,
        gridY: grid.entry.y,
        x: grid.entry.x * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2,
        y: grid.entry.y * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2,
        hp: config.hp * (1 + gameState.wave * 0.15), // Scale HP with wave (increased from 0.1 to 0.15)
        maxHp: config.hp * (1 + gameState.wave * 0.15),
        speed: config.speed,
        reward: config.reward,
        path: [...grid.path],
        pathIndex: 0,
        slowEffect: 1.0,
        moveProgress: 0 // Progress from current cell to next (0 to 1)
    };
    
    enemies.push(enemy);
}

// ========================================
// GAME UPDATE LOOP
// ========================================

let lastTime = 0;
let accumulator = 0;
const FIXED_TIMESTEP = 16.67; // ~60 FPS (1000ms / 60)

function gameLoop(timestamp) {
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;
    
    if (!gameState.isPaused && !gameState.isGameOver) {
        // Add real delta time to accumulator
        accumulator += deltaTime;
        
        // Run update cycles based on speed multiplier
        // This ensures consistent game logic regardless of speed
        const timestepWithSpeed = FIXED_TIMESTEP / gameState.speed;
        
        // Process accumulated time in fixed steps
        while (accumulator >= timestepWithSpeed) {
            update(FIXED_TIMESTEP);
            accumulator -= timestepWithSpeed;
        }
        
        // Cap accumulator to prevent spiral of death
        if (accumulator > timestepWithSpeed * 5) {
            accumulator = timestepWithSpeed;
        }
    }
    
    render();
    
    requestAnimationFrame(gameLoop);
}

function update(dt) {
    // Advance game time
    gameTime += dt;
    
    // Update wave timer
    if (!gameState.waveInProgress) {
        gameState.waveTimer += dt;
        
        if (gameState.waveTimer >= gameState.waveDelay) {
            startWave();
            gameState.waveTimer = 0;
        }
        
        updateWaveTimerDisplay();
    } else {
        // Update timer display to show wave in progress
        updateWaveTimerDisplay();
        
        // Process enemy spawns from queue based on game time
        while (enemySpawnQueue.length > 0 && enemySpawnQueue[0].spawnTime <= gameTime) {
            const spawn = enemySpawnQueue.shift();
            createEnemy(spawn.type);
            gameState.enemiesSpawned++;
            updateUI();
        }
        
        // Check if wave is complete
        if (enemies.length === 0 && gameState.enemiesSpawned >= getWaveConfig(gameState.wave).total) {
            completeWave();
        }
    }
    
    // Update enemies
    updateEnemies(dt);
    
    // Update towers
    updateTowers(dt);
    
    // Update projectiles
    updateProjectiles(dt);
    
    updateUI();
}

function updateEnemies(dt) {
    // Clear and rebuild spatial grid for this frame
    if (!enemySpatialGrid) {
        const gridWidth = grid.cols * CONFIG.CELL_SIZE;
        const gridHeight = grid.rows * CONFIG.CELL_SIZE;
        enemySpatialGrid = new SpatialGrid(CONFIG.CELL_SIZE * 4, gridWidth, gridHeight);
    }
    enemySpatialGrid.clear();
    
    // Process enemies with optimized loop
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        
        // Reset slow effect
        enemy.slowEffect = 1.0;
        
        // Grid-based movement along path
        if (enemy.pathIndex < enemy.path.length - 1) {
            const currentCell = enemy.path[enemy.pathIndex];
            const nextCell = enemy.path[enemy.pathIndex + 1];
            
            // Calculate movement speed (cells per second)
            const config = CONFIG.ENEMY_TYPES[enemy.type];
            const cellsPerSecond = config.speed * enemy.slowEffect;
            const moveAmount = (cellsPerSecond * dt) / 1000;
            
            enemy.moveProgress += moveAmount;
            
            // If reached next cell
            if (enemy.moveProgress >= 1.0) {
                enemy.moveProgress = 0;
                enemy.pathIndex++;
                enemy.gridX = nextCell.x;
                enemy.gridY = nextCell.y;
                
                // Check if at the end of path
                if (enemy.pathIndex >= enemy.path.length - 1) {
                    // Snap to final position
                    enemy.x = nextCell.x * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
                    enemy.y = nextCell.y * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
                }
            } else {
                // Interpolate position between current and next cell
                // Only move horizontally OR vertically (grid-aligned)
                const startX = currentCell.x * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
                const startY = currentCell.y * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
                const endX = nextCell.x * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
                const endY = nextCell.y * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
                
                // Linear interpolation
                enemy.x = startX + (endX - startX) * enemy.moveProgress;
                enemy.y = startY + (endY - startY) * enemy.moveProgress;
            }
        } else if (enemy.pathIndex >= enemy.path.length - 1) {
            // Reached exit
            enemies.splice(i, 1);
            gameState.lives--;
            
            if (gameState.lives <= 0) {
                gameOver();
            }
            
            continue;
        }
        
        // Insert into spatial grid for efficient tower targeting
        enemySpatialGrid.insert(enemy, enemy.x, enemy.y);
        
        // Check if dead
        if (enemy.hp <= 0) {
            enemies.splice(i, 1);
            
            // Calculate gold bonus from nearby Battery Arrays (optimized check)
            let goldMultiplier = 1.0;
            const nearbyTowers = towerSpatialGrid ? 
                towerSpatialGrid.query(enemy.x, enemy.y, CONFIG.CELL_SIZE * 3) : 
                towers;
            
            for (let tower of nearbyTowers) {
                if (tower.type === 'battery') {
                    const batteryConfig = CONFIG.TOWER_TYPES['battery'];
                    const towerX = tower.x * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
                    const towerY = tower.y * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
                    
                    const dx = enemy.x - towerX;
                    const dy = enemy.y - towerY;
                    const distSq = dx * dx + dy * dy; // Use squared distance to avoid sqrt
                    const rangeSq = (batteryConfig.range * CONFIG.CELL_SIZE) ** 2;
                    
                    if (distSq <= rangeSq) {
                        goldMultiplier += batteryConfig.goldBoost * tower.level;
                    }
                }
            }
            
            gameState.gold += Math.floor(enemy.reward * goldMultiplier);
            gameState.score += enemy.reward * 10;
            gameState.enemiesKilled++;
        }
    }
}

function getEffectiveFireRate(tower, config) {
    let fireRateReduction = 1.0;
    
    // Check for nearby Heat Sinks using spatial grid
    const towerX = tower.x * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
    const towerY = tower.y * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
    const nearbyTowers = towerSpatialGrid ? 
        towerSpatialGrid.query(towerX, towerY, CONFIG.CELL_SIZE * 4) : 
        towers;
    
    for (let otherTower of nearbyTowers) {
        if (otherTower.type === 'heatsink') {
            const heatsinkConfig = CONFIG.TOWER_TYPES['heatsink'];
            const dx = Math.abs(tower.x - otherTower.x);
            const dy = Math.abs(tower.y - otherTower.y);
            const distance = Math.max(dx, dy);
            
            if (distance <= heatsinkConfig.range) {
                fireRateReduction -= heatsinkConfig.cooldown * otherTower.level;
            }
        }
    }
    
    // Ensure fire rate doesn't go below 20% of original
    fireRateReduction = Math.max(0.2, fireRateReduction);
    
    return (config.fireRate / tower.level) * fireRateReduction;
}

function getEffectiveRange(tower, config) {
    let baseRange = config.range;
    
    // Calculate range boost from nearby Overclock Modules using spatial grid
    const towerX = tower.x * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
    const towerY = tower.y * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
    const nearbyTowers = towerSpatialGrid ? 
        towerSpatialGrid.query(towerX, towerY, CONFIG.CELL_SIZE * 4) : 
        towers;
    
    for (let otherTower of nearbyTowers) {
        if (otherTower.type === 'overclock') {
            const overclockConfig = CONFIG.TOWER_TYPES['overclock'];
            const dx = Math.abs(tower.x - otherTower.x);
            const dy = Math.abs(tower.y - otherTower.y);
            const distance = Math.max(dx, dy);
            
            // Overclock module's effective range increases with its level
            // Base range + (rangeBoost * level) gives the overclock's own range
            const overclockEffectiveRange = overclockConfig.range + (overclockConfig.rangeBoost * otherTower.level * 0.5);
            
            if (distance <= overclockEffectiveRange) {
                baseRange += overclockConfig.rangeBoost * otherTower.level;
            }
        }
    }
    
    return baseRange;
}

function getEnemyArmor(enemy) {
    let armorReduction = 1.0;
    
    // Calculate armor from nearby Shield Generators using spatial grid
    const nearbyTowers = towerSpatialGrid ? 
        towerSpatialGrid.query(enemy.x, enemy.y, CONFIG.CELL_SIZE * 4) : 
        towers;
    
    for (let tower of nearbyTowers) {
        if (tower.type === 'shield') {
            const shieldConfig = CONFIG.TOWER_TYPES['shield'];
            const towerX = tower.x * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
            const towerY = tower.y * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
            
            const dx = enemy.x - towerX;
            const dy = enemy.y - towerY;
            const distSq = dx * dx + dy * dy; // Use squared distance
            const rangeSq = (shieldConfig.range * CONFIG.CELL_SIZE) ** 2;
            
            if (distSq <= rangeSq) {
                armorReduction -= shieldConfig.armor * tower.level;
            }
        }
    }
    
    // Ensure damage doesn't go below 25% of original
    armorReduction = Math.max(0.25, armorReduction);
    
    return armorReduction;
}

function updateTowers(dt) {
    // Build spatial grid for towers if not exists
    if (!towerSpatialGrid) {
        const gridWidth = grid.cols * CONFIG.CELL_SIZE;
        const gridHeight = grid.rows * CONFIG.CELL_SIZE;
        towerSpatialGrid = new SpatialGrid(CONFIG.CELL_SIZE * 3, gridWidth, gridHeight);
    }
    towerSpatialGrid.clear();
    
    // Insert all towers into spatial grid
    for (let tower of towers) {
        const towerX = tower.x * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
        const towerY = tower.y * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
        towerSpatialGrid.insert(tower, towerX, towerY);
    }
    
    // Process each tower
    for (let tower of towers) {
        const config = CONFIG.TOWER_TYPES[tower.type];
        
        const towerX = tower.x * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
        const towerY = tower.y * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
        const effectiveRange = getEffectiveRange(tower, config);
        const rangeDist = effectiveRange * CONFIG.CELL_SIZE;
        
        // Use spatial partitioning to find enemies in range (much faster than checking all enemies)
        const nearbyEnemies = enemySpatialGrid ? 
            enemySpatialGrid.query(towerX, towerY, rangeDist) : 
            enemies;
        
        // Find all enemies in range with optimized distance check
        const enemiesInRange = [];
        const rangeSq = rangeDist * rangeDist; // Use squared distance to avoid sqrt
        
        for (let enemy of nearbyEnemies) {
            const dx = enemy.x - towerX;
            const dy = enemy.y - towerY;
            const distSq = dx * dx + dy * dy;
            
            if (distSq <= rangeSq) {
                enemiesInRange.push(enemy);
            }
        }
        
        // Target the enemy that's furthest along the path
        if (enemiesInRange.length > 0) {
            // Sort by path progress (pathIndex + moveProgress gives total progress)
            enemiesInRange.sort((a, b) => {
                const progressA = a.pathIndex + a.moveProgress;
                const progressB = b.pathIndex + b.moveProgress;
                return progressB - progressA; // Descending order (furthest first)
            });
            
            // Always target the enemy that's furthest along
            tower.target = enemiesInRange[0];
        } else {
            // No enemies in range
            tower.target = null;
        }
        
        // Shoot at target
        if (tower.target) {
            if (config.continuous) {
                // Laser tower - continuous damage with RAM boost
                let damageMultiplier = 1.0;
                const nearbyTowers = towerSpatialGrid.query(towerX, towerY, CONFIG.CELL_SIZE * 3);
                
                for (let otherTower of nearbyTowers) {
                    if (otherTower.type === 'ram') {
                        const ramConfig = CONFIG.TOWER_TYPES['ram'];
                        const dx = Math.abs(tower.x - otherTower.x);
                        const dy = Math.abs(tower.y - otherTower.y);
                        const distance = Math.max(dx, dy);
                        
                        if (distance <= ramConfig.range) {
                            damageMultiplier += ramConfig.boost;
                        }
                    }
                }
                
                const armorMultiplier = getEnemyArmor(tower.target);
                tower.target.hp -= config.damage * tower.level * damageMultiplier * armorMultiplier * dt * 0.001;
            } else if (config.slow) {
                // Slower tower - apply slow effect
                tower.target.slowEffect = config.slow;
            } else if (config.boost) {
                // RAM Bank - boost nearby towers (passive, handled in damage calculation)
                // No active shooting behavior
            } else if (config.cooldown) {
                // Heat Sink - reduces fire rate of nearby towers (passive support)
                // No active shooting behavior
            } else if (config.rangeBoost) {
                // Overclock Module - boosts range of nearby towers (passive support)
                // No active shooting behavior
            } else if (config.armor) {
                // Shield Generator - reduces damage to nearby enemies (passive support)
                // No active shooting behavior
            } else if (config.goldBoost) {
                // Battery Array - increases gold from kills (passive support)
                // No active shooting behavior
            } else if (config.chainBoost) {
                // Conductor Coil - increases chain targets for nearby towers (passive support)
                // No active shooting behavior
            } else if (config.chain) {
                // Voltage Regulator - chain lightning attack
                const effectiveFireRate = getEffectiveFireRate(tower, config);
                if (gameTime - tower.lastShot >= effectiveFireRate) {
                    shootChainProjectile(tower, tower.target, enemiesInRange);
                    tower.lastShot = gameTime;
                }
            } else if (tower.type === 'cpu' && config.multiTarget) {
                // CPU Core - targets up to 3 enemies
                const effectiveFireRate = getEffectiveFireRate(tower, config);
                if (gameTime - tower.lastShot >= effectiveFireRate) {
                    const maxTargets = config.maxTargets || 3;
                    const targets = enemiesInRange.slice(0, maxTargets);
                    for (let enemy of targets) {
                        shootProjectile(tower, enemy);
                    }
                    tower.lastShot = gameTime;
                }
            } else if (config.multiTarget) {
                // Pulse tower - shoots at all enemies in range
                const effectiveFireRate = getEffectiveFireRate(tower, config);
                if (gameTime - tower.lastShot >= effectiveFireRate) {
                    for (let enemy of enemiesInRange) {
                        shootProjectile(tower, enemy);
                    }
                    tower.lastShot = gameTime;
                }
            } else {
                // Regular tower - shoot projectile
                const effectiveFireRate = getEffectiveFireRate(tower, config);
                if (gameTime - tower.lastShot >= effectiveFireRate) {
                    shootProjectile(tower, tower.target);
                    tower.lastShot = gameTime;
                }
            }
        }
    }
}

function shootProjectile(tower, target) {
    const config = CONFIG.TOWER_TYPES[tower.type];
    
    const towerX = tower.x * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
    const towerY = tower.y * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
    
    // Calculate damage boost from nearby RAM Banks using spatial grid
    let damageMultiplier = 1.0;
    const nearbyTowers = towerSpatialGrid ? 
        towerSpatialGrid.query(towerX, towerY, CONFIG.CELL_SIZE * 3) : 
        towers;
    
    for (let otherTower of nearbyTowers) {
        if (otherTower.type === 'ram') {
            const ramConfig = CONFIG.TOWER_TYPES['ram'];
            const dx = Math.abs(tower.x - otherTower.x);
            const dy = Math.abs(tower.y - otherTower.y);
            const distance = Math.max(dx, dy); // Grid distance
            
            if (distance <= ramConfig.range) {
                damageMultiplier += ramConfig.boost;
            }
        }
    }
    
    // Use object pool for projectiles
    const proj = projectilePool.acquire();
    proj.x = towerX;
    proj.y = towerY;
    proj.targetX = target.x;
    proj.targetY = target.y;
    proj.target = target;
    proj.damage = config.damage * tower.level * damageMultiplier;
    proj.speed = config.projectileSpeed || 15;
    proj.aoe = config.aoe;
    proj.color = config.color;
    proj.tower = tower;
    
    projectiles.push(proj);
}

function shootChainProjectile(tower, target, enemiesInRange) {
    const config = CONFIG.TOWER_TYPES[tower.type];
    
    const towerX = tower.x * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
    const towerY = tower.y * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
    
    // Calculate damage boost from nearby RAM Banks using spatial grid
    let damageMultiplier = 1.0;
    const nearbyTowers = towerSpatialGrid ? 
        towerSpatialGrid.query(towerX, towerY, CONFIG.CELL_SIZE * 3) : 
        towers;
    
    for (let otherTower of nearbyTowers) {
        if (otherTower.type === 'ram') {
            const ramConfig = CONFIG.TOWER_TYPES['ram'];
            const dx = Math.abs(tower.x - otherTower.x);
            const dy = Math.abs(tower.y - otherTower.y);
            const distance = Math.max(dx, dy);
            
            if (distance <= ramConfig.range) {
                damageMultiplier += ramConfig.boost;
            }
        }
    }
    
    // Calculate chain target boost from nearby Conductor Coils using spatial grid
    let chainTargetsBoost = 0;
    for (let otherTower of nearbyTowers) {
        if (otherTower.type === 'conductor') {
            const conductorConfig = CONFIG.TOWER_TYPES['conductor'];
            const dx = Math.abs(tower.x - otherTower.x);
            const dy = Math.abs(tower.y - otherTower.y);
            const distance = Math.max(dx, dy);
            
            if (distance <= conductorConfig.range) {
                chainTargetsBoost += conductorConfig.chainBoost * otherTower.level;
            }
        }
    }
    
    // Use object pool for projectiles
    const proj = projectilePool.acquire();
    proj.x = towerX;
    proj.y = towerY;
    proj.targetX = target.x;
    proj.targetY = target.y;
    proj.target = target;
    proj.damage = config.damage * tower.level * damageMultiplier;
    proj.speed = config.projectileSpeed || 30;
    proj.color = config.color;
    proj.tower = tower;
    proj.isChain = true;
    proj.isInitialShot = true; // Mark initial shot for quick travel time
    proj.chainTargets = config.chainTargets + chainTargetsBoost;
    proj.chainRange = config.chainRange * CONFIG.CELL_SIZE;
    proj.hitTargets = [target]; // Track which enemies were already hit
    
    projectiles.push(proj);
}

function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const proj = projectiles[i];
        
        // Chain lightning projectiles
        if (proj.isChain) {
            // Initial shot has quick travel time, chain jumps are instant
            if (proj.isInitialShot) {
                // Quick travel for initial lightning bolt
                const dx = proj.targetX - proj.x;
                const dy = proj.targetY - proj.y;
                const distSq = dx * dx + dy * dy;
                
                if (distSq < 25) { // Reached target (5^2 = 25)
                    // Hit the target immediately and apply damage
                    if (enemies.includes(proj.target)) {
                        const armorMultiplier = getEnemyArmor(proj.target);
                        proj.target.hp -= proj.damage * armorMultiplier;
                        
                        if (proj.target.hp <= 0 && proj.tower) {
                            proj.tower.kills = (proj.tower.kills || 0) + 1;
                        }
                    }
                    
                    // Check for chain to next target
                    if (proj.hitTargets.length < proj.chainTargets) {
                        // Find next enemy to chain to using spatial grid
                        let nextTarget = null;
                        let closestDistSq = Infinity;
                        const chainRangeSq = proj.chainRange * proj.chainRange;
                        
                        const nearbyEnemies = enemySpatialGrid ? 
                            enemySpatialGrid.query(proj.targetX, proj.targetY, proj.chainRange) : 
                            enemies;
                        
                        for (let enemy of nearbyEnemies) {
                            if (proj.hitTargets.includes(enemy)) continue;
                            
                            const dx = enemy.x - proj.targetX;
                            const dy = enemy.y - proj.targetY;
                            const distSq = dx * dx + dy * dy;
                            
                            if (distSq <= chainRangeSq && distSq < closestDistSq) {
                                closestDistSq = distSq;
                                nextTarget = enemy;
                            }
                        }
                        
                        if (nextTarget) {
                            // Chain to next target with reduced damage (instant jump)
                            proj.hitTargets.push(nextTarget);
                            proj.x = proj.targetX; // Start from previous target
                            proj.y = proj.targetY;
                            proj.target = nextTarget;
                            proj.targetX = nextTarget.x;
                            proj.targetY = nextTarget.y;
                            proj.damage *= 0.7; // 30% damage reduction per chain
                            proj.isInitialShot = false;
                            proj.lifetime = 150; // Display chain for 150ms
                            continue; // Don't remove projectile, show the chain
                        }
                    }
                    
                    // No chain available, remove projectile
                    projectiles.splice(i, 1);
                    projectilePool.release(proj);
                } else {
                    // Move very fast towards target
                    const dist = Math.sqrt(distSq);
                    const moveSpeed = (proj.speed * CONFIG.CELL_SIZE * dt) / 1000;
                    proj.x += (dx / dist) * moveSpeed;
                    proj.y += (dy / dist) * moveSpeed;
                }
                continue;
            }
            
            // Decrement lifetime for visual effect (chain segments only)
            if (!proj.lifetime) {
                proj.lifetime = 150; // Display for 150ms
            }
            proj.lifetime -= dt;
            
            // Check if lightning chain should disappear
            if (proj.lifetime <= 0) {
                // Hit target if still alive
                if (enemies.includes(proj.target)) {
                    const armorMultiplier = getEnemyArmor(proj.target);
                    proj.target.hp -= proj.damage * armorMultiplier;
                    
                    if (proj.target.hp <= 0 && proj.tower) {
                        proj.tower.kills = (proj.tower.kills || 0) + 1;
                    }
                }
                
                // Check for chain to next target
                if (proj.hitTargets.length < proj.chainTargets) {
                    // Find next enemy to chain to using spatial grid
                    let nextTarget = null;
                    let closestDistSq = Infinity;
                    const chainRangeSq = proj.chainRange * proj.chainRange;
                    
                    const nearbyEnemies = enemySpatialGrid ? 
                        enemySpatialGrid.query(proj.targetX, proj.targetY, proj.chainRange) : 
                        enemies;
                    
                    for (let enemy of nearbyEnemies) {
                        if (proj.hitTargets.includes(enemy)) continue;
                        
                        const dx = enemy.x - proj.targetX;
                        const dy = enemy.y - proj.targetY;
                        const distSq = dx * dx + dy * dy;
                        
                        if (distSq <= chainRangeSq && distSq < closestDistSq) {
                            closestDistSq = distSq;
                            nextTarget = enemy;
                        }
                    }
                    
                    if (nextTarget) {
                        // Chain to next target with reduced damage (instant jump)
                        proj.hitTargets.push(nextTarget);
                        proj.x = proj.targetX; // Start from previous target
                        proj.y = proj.targetY;
                        proj.target = nextTarget;
                        proj.targetX = nextTarget.x;
                        proj.targetY = nextTarget.y;
                        proj.damage *= 0.7; // 30% damage reduction per chain
                        proj.lifetime = 150; // Reset lifetime for next chain segment
                        continue; // Don't remove projectile, let it continue to next chain
                    }
                }
                
                // Remove projectile and return to pool
                projectiles.splice(i, 1);
                projectilePool.release(proj);
            }
            continue;
        }
        
        // Regular projectile movement
        const dx = proj.targetX - proj.x;
        const dy = proj.targetY - proj.y;
        const distSq = dx * dx + dy * dy; // Use squared distance
        
        if (distSq < 25 || !enemies.includes(proj.target)) { // 5^2 = 25
            // Hit target or target is dead
            if (enemies.includes(proj.target)) {
                const armorMultiplier = getEnemyArmor(proj.target);
                proj.target.hp -= proj.damage * armorMultiplier;
                
                if (proj.target.hp <= 0 && proj.tower) {
                    proj.tower.kills = (proj.tower.kills || 0) + 1;
                }
                
                // AOE damage - use spatial grid for efficiency
                if (proj.aoe) {
                    const aoeRadius = proj.aoe * CONFIG.CELL_SIZE;
                    const nearbyEnemies = enemySpatialGrid ? 
                        enemySpatialGrid.query(proj.targetX, proj.targetY, aoeRadius) : 
                        enemies;
                    
                    const aoeRadiusSq = aoeRadius * aoeRadius;
                    
                    for (let enemy of nearbyEnemies) {
                        if (enemy === proj.target) continue;
                        
                        const ex = enemy.x - proj.targetX;
                        const ey = enemy.y - proj.targetY;
                        const edistSq = ex * ex + ey * ey;
                        
                        if (edistSq <= aoeRadiusSq) {
                            const aoeArmorMultiplier = getEnemyArmor(enemy);
                            enemy.hp -= proj.damage * 0.5 * aoeArmorMultiplier;
                        }
                    }
                }
            }
            
            // Remove projectile and return to pool
            projectiles.splice(i, 1);
            projectilePool.release(proj);
        } else {
            // Move projectile towards target (speed is in pixels per second)
            const dist = Math.sqrt(distSq);
            const moveSpeed = (proj.speed * CONFIG.CELL_SIZE * dt) / 1000;
            proj.x += (dx / dist) * moveSpeed;
            proj.y += (dy / dist) * moveSpeed;
        }
    }
}

function completeWave() {
    // Prevent multiple calls
    if (!gameState.waveInProgress) {
        return;
    }
    
    gameState.waveInProgress = false;
    
    // Track completed runs (finishing wave 15)
    if (gameState.wave === 15) {
        gameState.runsCompleted++;
    }
    
    gameState.wave++;
    gameState.waveTimer = 0;
    gameState.gold += 30 + gameState.wave * 5; // Wave completion bonus (reduced for balance)
    gameState.score += 100 * gameState.wave;
    
    updateUI();
    
    // After wave 15, show the New Level button and modal (first time only)
    if (gameState.wave > 15) {
        const newLevelBtn = document.getElementById('newLevelBtn');
        if (newLevelBtn) {
            newLevelBtn.style.display = 'block';
        }
        
        // Show the modal automatically the first time
        if (!newLevelModalShown) {
            newLevelModalShown = true;
            showNewLevelModal();
        }
    }
}

// ========================================
// RENDERING (with viewport culling for performance)
// ========================================

function render() {
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Apply viewport transformation
    ctx.translate(-viewport.x * viewport.zoom, -viewport.y * viewport.zoom);
    ctx.scale(viewport.zoom, viewport.zoom);
    
    // Calculate visible bounds for culling
    const visibleBounds = {
        minX: viewport.x - CONFIG.CELL_SIZE,
        minY: viewport.y - CONFIG.CELL_SIZE,
        maxX: viewport.x + (canvas.width / viewport.zoom) + CONFIG.CELL_SIZE,
        maxY: viewport.y + (canvas.height / viewport.zoom) + CONFIG.CELL_SIZE
    };
    
    // Draw grid
    drawGrid(visibleBounds);
    
    // Draw towers
    drawTowers(visibleBounds);
    
    // Draw enemies
    drawEnemies(visibleBounds);
    
    // Draw projectiles
    drawProjectiles(visibleBounds);
    
    // Draw selection
    drawSelection();
    
    ctx.restore();
}

function drawGrid(visibleBounds) {
    ctx.font = `${CONFIG.CELL_SIZE * 0.4}px ${getComputedStyle(document.body).getPropertyValue('--font-main')}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Calculate visible cell range for culling
    const startX = Math.max(0, Math.floor(visibleBounds.minX / CONFIG.CELL_SIZE));
    const endX = Math.min(grid.cols - 1, Math.ceil(visibleBounds.maxX / CONFIG.CELL_SIZE));
    const startY = Math.max(0, Math.floor(visibleBounds.minY / CONFIG.CELL_SIZE));
    const endY = Math.min(grid.rows - 1, Math.ceil(visibleBounds.maxY / CONFIG.CELL_SIZE));
    
    // First pass: Draw all visible cells
    for (let y = startY; y <= endY; y++) {
        for (let x = startX; x <= endX; x++) {
            const cellType = grid.cells[y][x];
            const px = x * CONFIG.CELL_SIZE;
            const py = y * CONFIG.CELL_SIZE;
            
            // Fill cell
            if (cellType === 0 || cellType === 3) {
                // Invalid cell and decorative wall - just background
                ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--color-invalid');
                ctx.fillRect(px, py, CONFIG.CELL_SIZE, CONFIG.CELL_SIZE);
            } else if (cellType === 1) {
                // Buildable
                ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--color-buildable');
                ctx.fillRect(px, py, CONFIG.CELL_SIZE, CONFIG.CELL_SIZE);
            } else if (cellType === 2) {
                // Path - circuit board style with darker background
                ctx.fillStyle = 'rgba(0, 50, 0, 0.3)';
                ctx.fillRect(px, py, CONFIG.CELL_SIZE, CONFIG.CELL_SIZE);
            }
            
            // Draw grid lines
            ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--term-dim');
            ctx.lineWidth = 0.5;
            ctx.strokeRect(px, py, CONFIG.CELL_SIZE, CONFIG.CELL_SIZE);
        }
    }
    
    // Draw circuit board style path
    if (grid.path && grid.path.length > 1) {
        const pathColor = getComputedStyle(document.body).getPropertyValue('--color-path');
        
        // Draw circuit traces (the copper lines)
        ctx.strokeStyle = pathColor;
        ctx.lineWidth = 6;
        ctx.globalAlpha = 0.3;
        ctx.lineCap = 'square';
        ctx.lineJoin = 'miter';
        
        ctx.beginPath();
        const firstCell = grid.path[0];
        ctx.moveTo(
            firstCell.x * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2,
            firstCell.y * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2
        );
        
        for (let i = 1; i < grid.path.length; i++) {
            const cell = grid.path[i];
            ctx.lineTo(
                cell.x * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2,
                cell.y * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2
            );
        }
        
        ctx.stroke();
        
        // Draw inner trace (brighter center line)
        ctx.strokeStyle = pathColor;
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.6;
        
        ctx.beginPath();
        ctx.moveTo(
            firstCell.x * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2,
            firstCell.y * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2
        );
        
        for (let i = 1; i < grid.path.length; i++) {
            const cell = grid.path[i];
            ctx.lineTo(
                cell.x * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2,
                cell.y * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2
            );
        }
        
        ctx.stroke();
        ctx.globalAlpha = 1.0;
        
        // Draw circuit pads at corners/turns
        ctx.fillStyle = pathColor;
        ctx.globalAlpha = 0.5;
        
        for (let i = 0; i < grid.path.length; i++) {
            const current = grid.path[i];
            const cx = current.x * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
            const cy = current.y * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
            
            // Check if this is a corner (direction changes)
            if (i > 0 && i < grid.path.length - 1) {
                const prev = grid.path[i - 1];
                const next = grid.path[i + 1];
                
                const dirIn = { x: current.x - prev.x, y: current.y - prev.y };
                const dirOut = { x: next.x - current.x, y: next.y - current.y };
                
                // If direction changed, it's a corner
                if (dirIn.x !== dirOut.x || dirIn.y !== dirOut.y) {
                    // Draw circular pad at corner
                    ctx.beginPath();
                    ctx.arc(cx, cy, CONFIG.CELL_SIZE * 0.2, 0, Math.PI * 2);
                    ctx.fill();
                    
                    // Inner bright center
                    ctx.globalAlpha = 0.8;
                    ctx.beginPath();
                    ctx.arc(cx, cy, CONFIG.CELL_SIZE * 0.12, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalAlpha = 0.5;
                }
            }
        }
        
        ctx.globalAlpha = 1.0;
        
        // Draw animated energy pulses flowing through the circuit
        const numPulses = 16; // Number of moving pulses (doubled frequency)
        const pulseSpacing = grid.path.length / numPulses;
        const animSpeed = 0.008; // Speed of movement along path (slowed down even more)
        const animOffset = (Date.now() * animSpeed) % grid.path.length;
        
        for (let n = 0; n < numPulses; n++) {
            const pathPos = (animOffset + n * pulseSpacing) % grid.path.length;
            const index = Math.floor(pathPos);
            const nextIndex = (index + 1) % grid.path.length;
            
            if (nextIndex === 0) continue; // Skip wrapping to avoid visual glitch at end
            
            const current = grid.path[index];
            const next = grid.path[nextIndex];
            
            // Interpolate position between path cells for smooth movement
            const progress = pathPos - index;
            const cx = (current.x + (next.x - current.x) * progress) * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
            const cy = (current.y + (next.y - current.y) * progress) * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
            
            // Draw energy pulse with glow
            const pulse = Math.sin(Date.now() * 0.003 + n * 1.5) * 0.3 + 0.7; // Pulsing alpha (slowed down)
            
            // Outer glow (smaller)
            ctx.shadowColor = getComputedStyle(document.body).getPropertyValue('--term-glow');
            ctx.shadowBlur = 15;
            ctx.fillStyle = `rgba(0, 255, 255, ${pulse * 0.35})`;
            ctx.beginPath();
            ctx.arc(cx, cy, CONFIG.CELL_SIZE * 0.18, 0, Math.PI * 2);
            ctx.fill();
            
            // Middle ring (smaller)
            ctx.shadowBlur = 10;
            ctx.fillStyle = `rgba(100, 255, 255, ${pulse * 0.5})`;
            ctx.beginPath();
            ctx.arc(cx, cy, CONFIG.CELL_SIZE * 0.13, 0, Math.PI * 2);
            ctx.fill();
            
            // Inner bright core (smaller)
            ctx.shadowBlur = 6;
            ctx.fillStyle = `rgba(200, 255, 255, ${pulse})`;
            ctx.beginPath();
            ctx.arc(cx, cy, CONFIG.CELL_SIZE * 0.07, 0, Math.PI * 2);
            ctx.fill();
            
            // Reset shadow
            ctx.shadowBlur = 0;
        }
    }
    
    // Draw entry and exit as audio jack port-style circles
    const portRadius = CONFIG.CELL_SIZE * 0.4;
    const termBright = getComputedStyle(document.body).getPropertyValue('--term-bright');
    const termText = getComputedStyle(document.body).getPropertyValue('--term-text');
    
    if (grid.entry) {
        const ex = grid.entry.x * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
        const ey = grid.entry.y * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
        
        // Outer ring
        ctx.strokeStyle = termBright;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ex, ey, portRadius, 0, Math.PI * 2);
        ctx.stroke();
        
        // Inner circle
        ctx.fillStyle = termText;
        ctx.beginPath();
        ctx.arc(ex, ey, portRadius * 0.6, 0, Math.PI * 2);
        ctx.fill();
        
        // Center dot
        ctx.fillStyle = termBright;
        ctx.beginPath();
        ctx.arc(ex, ey, portRadius * 0.25, 0, Math.PI * 2);
        ctx.fill();
    }
    
    if (grid.exit) {
        const ex = grid.exit.x * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
        const ey = grid.exit.y * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
        
        // Outer ring
        ctx.strokeStyle = termBright;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ex, ey, portRadius, 0, Math.PI * 2);
        ctx.stroke();
        
        // Inner circle
        ctx.fillStyle = termText;
        ctx.beginPath();
        ctx.arc(ex, ey, portRadius * 0.6, 0, Math.PI * 2);
        ctx.fill();
        
        // Center dot
        ctx.fillStyle = termBright;
        ctx.beginPath();
        ctx.arc(ex, ey, portRadius * 0.25, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawTowers(visibleBounds) {
    ctx.font = `${CONFIG.CELL_SIZE * 0.5}px ${getComputedStyle(document.body).getPropertyValue('--font-main')}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    for (let tower of towers) {
        const config = CONFIG.TOWER_TYPES[tower.type];
        const x = tower.x * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
        const y = tower.y * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
        
        // Viewport culling - skip towers not in view
        if (x < visibleBounds.minX || x > visibleBounds.maxX ||
            y < visibleBounds.minY || y > visibleBounds.maxY) {
            continue;
        }
        
        // Draw grid-based range (Manhattan distance with corner extensions)
        if (selectedCell && selectedCell.x === tower.x && selectedCell.y === tower.y && config.range) {
            // Use different colors for RAM Bank (support) vs offensive towers
            const isBoostTower = config.boost !== undefined;
            const fillColor = isBoostTower ? 'rgba(0, 255, 0, 0.1)' : 'rgba(0, 255, 255, 0.1)';
            const strokeColor = isBoostTower ? 'rgba(0, 255, 0, 0.6)' : 'rgba(0, 255, 255, 0.6)';
            
            ctx.fillStyle = fillColor;
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 2;
            
            // Calculate all cells within range using Manhattan distance + corner cells
            // Use effective range which includes boosts from Overclock Modules
            const effectiveRange = getEffectiveRange(tower, config);
            const range = Math.floor(effectiveRange);
            const rangeCells = new Set(); // All cells in range
            const edgeCells = new Set(); // Track edge cells for outline
            
            for (let dx = -(range + 1); dx <= (range + 1); dx++) {
                for (let dy = -(range + 1); dy <= (range + 1); dy++) {
                    const distance = Math.abs(dx) + Math.abs(dy);
                    
                    // Include cells within normal range OR corner cells (diagonal adjacents to edge)
                    const isInRange = distance <= range;
                    const isCornerExtension = distance === range + 1 && Math.abs(dx) > 0 && Math.abs(dy) > 0;
                    
                    if (isInRange || isCornerExtension) {
                        const cellX = tower.x + dx;
                        const cellY = tower.y + dy;
                        
                        // Check if cell is in bounds
                        if (cellX >= 0 && cellX < grid.cols && cellY >= 0 && cellY < grid.rows) {
                            const px = cellX * CONFIG.CELL_SIZE;
                            const py = cellY * CONFIG.CELL_SIZE;
                            
                            // Fill the cell with transparent color
                            ctx.fillRect(px, py, CONFIG.CELL_SIZE, CONFIG.CELL_SIZE);
                            
                            rangeCells.add(`${cellX},${cellY}`);
                            
                            // Track edge cells (those at exact range or corner extensions)
                            if (distance === range || isCornerExtension) {
                                edgeCells.add(`${cellX},${cellY}`);
                            }
                        }
                    }
                }
            }
            
            // Draw continuous outline by connecting edge segments
            ctx.beginPath();
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 2;
            
            // For each edge cell, draw only the outer edges (edges not adjacent to another range cell)
            for (let cellKey of edgeCells) {
                const [cellX, cellY] = cellKey.split(',').map(Number);
                const px = cellX * CONFIG.CELL_SIZE;
                const py = cellY * CONFIG.CELL_SIZE;
                
                // Check each side to see if it's an outer edge
                const hasTop = rangeCells.has(`${cellX},${cellY - 1}`);
                const hasBottom = rangeCells.has(`${cellX},${cellY + 1}`);
                const hasLeft = rangeCells.has(`${cellX - 1},${cellY}`);
                const hasRight = rangeCells.has(`${cellX + 1},${cellY}`);
                
                // Draw top edge if no cell above
                if (!hasTop) {
                    ctx.moveTo(px, py);
                    ctx.lineTo(px + CONFIG.CELL_SIZE, py);
                }
                
                // Draw bottom edge if no cell below
                if (!hasBottom) {
                    ctx.moveTo(px, py + CONFIG.CELL_SIZE);
                    ctx.lineTo(px + CONFIG.CELL_SIZE, py + CONFIG.CELL_SIZE);
                }
                
                // Draw left edge if no cell to left
                if (!hasLeft) {
                    ctx.moveTo(px, py);
                    ctx.lineTo(px, py + CONFIG.CELL_SIZE);
                }
                
                // Draw right edge if no cell to right
                if (!hasRight) {
                    ctx.moveTo(px + CONFIG.CELL_SIZE, py);
                    ctx.lineTo(px + CONFIG.CELL_SIZE, py + CONFIG.CELL_SIZE);
                }
            }
            
            ctx.stroke();
        }
        
        // Draw tower icon
        ctx.fillStyle = config.color;
        ctx.fillText(config.icon, x, y);
        
        // Draw level indicator
        if (tower.level > 1) {
            ctx.font = `${CONFIG.CELL_SIZE * 0.2}px ${getComputedStyle(document.body).getPropertyValue('--font-main')}`;
            ctx.fillStyle = '#ffff00';
            ctx.fillText(`Lv${tower.level}`, x, y + CONFIG.CELL_SIZE * 0.35);
            ctx.font = `${CONFIG.CELL_SIZE * 0.5}px ${getComputedStyle(document.body).getPropertyValue('--font-main')}`;
        }
        
        // Draw laser beam
        if (tower.target && config.continuous) {
            ctx.strokeStyle = config.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(tower.target.x, tower.target.y);
            ctx.stroke();
        }
    }
}

function drawEnemies(visibleBounds) {
    for (let enemy of enemies) {
        // Viewport culling - skip enemies not in view
        if (enemy.x < visibleBounds.minX || enemy.x > visibleBounds.maxX ||
            enemy.y < visibleBounds.minY || enemy.y > visibleBounds.maxY) {
            continue;
        }
        
        const config = CONFIG.ENEMY_TYPES[enemy.type];
        const healthPercent = enemy.hp / enemy.maxHp;
        
        // Calculate circle size based on cell size
        const radius = CONFIG.CELL_SIZE * 0.35;
        
        // Draw filled portion (health remaining)
        if (healthPercent > 0) {
            ctx.fillStyle = config.color;
            ctx.beginPath();
            ctx.arc(enemy.x, enemy.y, radius, 0, Math.PI * 2);
            ctx.fill();
            
            // If not at full health, draw the "drained" portion
            if (healthPercent < 1) {
                // Draw a lighter/darker overlay to show damage
                ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                ctx.beginPath();
                ctx.arc(enemy.x, enemy.y, radius, 0, Math.PI * 2);
                ctx.fill();
                
                // Redraw the remaining health as filled portion
                ctx.fillStyle = config.color;
                ctx.beginPath();
                ctx.arc(enemy.x, enemy.y, radius * healthPercent, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        // Always draw the circle outline (shows "hollow" when health is 0)
        ctx.strokeStyle = config.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        
        // Draw enemy icon on top
        ctx.fillStyle = healthPercent > 0.5 ? '#000000' : config.color;
        ctx.font = `${CONFIG.CELL_SIZE * 0.4}px ${getComputedStyle(document.body).getPropertyValue('--font-main')}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(config.icon, enemy.x, enemy.y);
    }
}

function drawProjectiles(visibleBounds) {
    for (let proj of projectiles) {
        // Viewport culling - skip projectiles not in view
        if (proj.x < visibleBounds.minX || proj.x > visibleBounds.maxX ||
            proj.y < visibleBounds.minY || proj.y > visibleBounds.maxY) {
            continue;
        }
        
        if (proj.isChain) {
            // Draw lightning bolt effect for chain lightning
            drawLightningBolt(proj.x, proj.y, proj.targetX, proj.targetY, proj.color);
        } else {
            // Regular projectile
            ctx.fillStyle = proj.color;
            ctx.beginPath();
            ctx.arc(proj.x, proj.y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

function drawLightningBolt(startX, startY, endX, endY, color) {
    const dx = endX - startX;
    const dy = endY - startY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance < 1) return;
    
    // Create jagged lightning path
    const segments = Math.max(3, Math.floor(distance / 15));
    const points = [{x: startX, y: startY}];
    
    for (let i = 1; i < segments; i++) {
        const t = i / segments;
        const baseX = startX + dx * t;
        const baseY = startY + dy * t;
        
        // Perpendicular offset for zigzag effect
        const perpX = -dy / distance;
        const perpY = dx / distance;
        const offset = (Math.random() - 0.5) * 20;
        
        points.push({
            x: baseX + perpX * offset,
            y: baseY + perpY * offset
        });
    }
    
    points.push({x: endX, y: endY});
    
    // Draw main lightning bolt
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 8;
    ctx.shadowColor = color;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    
    ctx.stroke();
    
    // Draw inner glow
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    
    ctx.stroke();
    
    // Reset shadow
    ctx.shadowBlur = 0;
}

function drawSelection() {
    if (selectedCell) {
        const x = selectedCell.x * CONFIG.CELL_SIZE;
        const y = selectedCell.y * CONFIG.CELL_SIZE;
        
        ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--color-highlight');
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, CONFIG.CELL_SIZE, CONFIG.CELL_SIZE);
        
        // If tower type selected, show preview
        if (selectedTowerType && grid.cells[selectedCell.y][selectedCell.x] === 1) {
            const config = CONFIG.TOWER_TYPES[selectedTowerType];
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = config.color;
            ctx.font = `${CONFIG.CELL_SIZE * 0.5}px ${getComputedStyle(document.body).getPropertyValue('--font-main')}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(config.icon, x + CONFIG.CELL_SIZE / 2, y + CONFIG.CELL_SIZE / 2);
            ctx.globalAlpha = 1.0;
        }
        
        // Draw selection info box for towers
        const tower = towers.find(t => t.x === selectedCell.x && t.y === selectedCell.y);
        if (tower) {
            const config = CONFIG.TOWER_TYPES[tower.type];
            const sellValue = Math.floor(tower.totalCost * 0.7);
            const upgradeCost = tower.level >= 3 ? null : Math.floor(config.cost * Math.pow(2, tower.level)); // Increased from 1.5 to 2.0 for balance
            
            // Generate relevant stats based on tower type
            const stats = [];
            
            // Offensive towers show kills and damage
            if (config.damage > 0) {
                stats.push(`Kills: ${tower.kills || 0}`);
                const baseDmg = config.damage * tower.level;
                
                // Check for RAM Bank boost
                let damageBoost = 1.0;
                for (let otherTower of towers) {
                    if (otherTower.type === 'ram') {
                        const ramConfig = CONFIG.TOWER_TYPES['ram'];
                        const dx = Math.abs(tower.x - otherTower.x);
                        const dy = Math.abs(tower.y - otherTower.y);
                        const distance = Math.max(dx, dy);
                        if (distance <= ramConfig.range) {
                            damageBoost += ramConfig.boost * otherTower.level;
                        }
                    }
                }
                
                const effectiveDmg = Math.floor(baseDmg * damageBoost);
                if (damageBoost > 1.0) {
                    stats.push(`Damage: ${baseDmg} → ${effectiveDmg}`);
                } else {
                    stats.push(`Damage: ${baseDmg}`);
                }
            }
            
            // Support towers show their effect
            if (config.boost) {
                // RAM Bank - damage boost
                const boostPercent = Math.floor(config.boost * tower.level * 100);
                stats.push(`Damage Boost: +${boostPercent}%`);
                stats.push(`Effect Range: ${config.range} cells`);
            } else if (config.rangeBoost) {
                // Overclock Module - range boost
                const rangeBoost = config.rangeBoost * tower.level;
                stats.push(`Range Boost: +${rangeBoost} cells`);
                stats.push(`Effect Range: ${config.range} cells`);
            } else if (config.cooldown) {
                // Heat Sink - fire rate boost
                const cooldownPercent = Math.floor(config.cooldown * tower.level * 100);
                stats.push(`Fire Rate Boost: +${cooldownPercent}%`);
                stats.push(`Effect Range: ${config.range} cells`);
            } else if (config.armor) {
                // Shield Generator - armor
                const armorPercent = Math.floor(config.armor * tower.level * 100);
                stats.push(`Armor Reduction: ${armorPercent}%`);
                stats.push(`Effect Range: ${config.range} cells`);
            } else if (config.goldBoost) {
                // Battery Array - gold boost
                const goldPercent = Math.floor(config.goldBoost * tower.level * 100);
                stats.push(`Gold Boost: +${goldPercent}%`);
                stats.push(`Effect Range: ${config.range} cells`);
            } else if (config.chainBoost) {
                // Conductor Coil - chain targets
                const chainBoost = config.chainBoost * tower.level;
                stats.push(`Chain Boost: +${chainBoost} targets`);
                stats.push(`Effect Range: ${config.range} cells`);
            } else if (config.slow) {
                // Resistor - slow
                const slowPercent = Math.floor(config.slow * 100);
                stats.push(`Slow: ${slowPercent}%`);
            }
            
            // Show effective range for all towers
            if (config.range) {
                const effectiveRange = getEffectiveRange(tower, config);
                if (effectiveRange > config.range) {
                    stats.push(`Range: ${config.range} → ${effectiveRange.toFixed(1)}`);
                } else {
                    stats.push(`Range: ${config.range} cells`);
                }
            }
            
            // Calculate box dimensions
            const fontSize = 14;
            const lineHeight = fontSize + 4;
            const padding = 8;
            const boxWidth = 200;
            const infoHeight = (1 + stats.length) * lineHeight; // Tower name + stats
            const buttonHeight = 28;
            const buttonSpacing = 6;
            const boxHeight = infoHeight + buttonHeight * 2 + buttonSpacing + padding * 3;
            
            // Position box below the tower
            let boxX = x + CONFIG.CELL_SIZE / 2 - boxWidth / 2;
            let boxY = y + CONFIG.CELL_SIZE + 10;
            
            // Keep box within viewport bounds
            const minX = viewport.x;
            const maxX = viewport.x + canvas.width / viewport.zoom - boxWidth;
            const minY = viewport.y;
            const maxY = viewport.y + canvas.height / viewport.zoom - boxHeight;
            
            boxX = Math.max(minX, Math.min(maxX, boxX));
            boxY = Math.max(minY, Math.min(maxY, boxY));
            
            // Draw box background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
            ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
            
            // Draw box border
            ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--color-highlight');
            ctx.lineWidth = 2;
            ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
            
            // Draw tower info text
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--term-bright');
            ctx.font = `${fontSize}px ${getComputedStyle(document.body).getPropertyValue('--font-main')}`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            
            // Draw tower name
            ctx.fillText(`${config.name}`, boxX + padding, boxY + padding);
            
            // Draw stats
            for (let i = 0; i < stats.length; i++) {
                ctx.fillText(stats[i], boxX + padding, boxY + padding + (i + 1) * lineHeight);
            }
            
            // Draw buttons
            const buttonY = boxY + padding + infoHeight + padding;
            const buttonWidth = boxWidth - padding * 2;
            
            // Store button bounds for click detection
            tower.uiButtons = {
                upgrade: null,
                sell: null
            };
            
            // Upgrade button (if not max level)
            if (upgradeCost !== null) {
                const upgradeY = buttonY;
                const canAfford = gameState.gold >= upgradeCost;
                
                // Draw button background
                ctx.fillStyle = canAfford ? 'rgba(0, 200, 0, 0.3)' : 'rgba(100, 100, 100, 0.3)';
                ctx.fillRect(boxX + padding, upgradeY, buttonWidth, buttonHeight);
                
                // Draw button border
                ctx.strokeStyle = canAfford ? '#00ff00' : '#666666';
                ctx.lineWidth = 1;
                ctx.strokeRect(boxX + padding, upgradeY, buttonWidth, buttonHeight);
                
                // Draw button text
                ctx.fillStyle = canAfford ? '#00ff00' : '#666666';
                ctx.font = `bold ${fontSize}px ${getComputedStyle(document.body).getPropertyValue('--font-main')}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`UPGRADE: ${upgradeCost}G`, boxX + boxWidth / 2, upgradeY + buttonHeight / 2);
                
                // Store button bounds (in world coordinates)
                tower.uiButtons.upgrade = {
                    x: boxX + padding,
                    y: upgradeY,
                    width: buttonWidth,
                    height: buttonHeight,
                    cost: upgradeCost
                };
                
                // Sell button below upgrade
                const sellY = upgradeY + buttonHeight + buttonSpacing;
                
                ctx.fillStyle = 'rgba(200, 0, 0, 0.3)';
                ctx.fillRect(boxX + padding, sellY, buttonWidth, buttonHeight);
                
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 1;
                ctx.strokeRect(boxX + padding, sellY, buttonWidth, buttonHeight);
                
                ctx.fillStyle = '#ff0000';
                ctx.fillText(`SELL: ${sellValue}G`, boxX + boxWidth / 2, sellY + buttonHeight / 2);
                
                tower.uiButtons.sell = {
                    x: boxX + padding,
                    y: sellY,
                    width: buttonWidth,
                    height: buttonHeight,
                    value: sellValue
                };
            } else {
                // Max level - only show sell button
                const maxLevelY = buttonY;
                
                // Draw max level indicator
                ctx.fillStyle = 'rgba(255, 215, 0, 0.2)';
                ctx.fillRect(boxX + padding, maxLevelY, buttonWidth, buttonHeight);
                
                ctx.strokeStyle = '#ffd700';
                ctx.lineWidth = 1;
                ctx.strokeRect(boxX + padding, maxLevelY, buttonWidth, buttonHeight);
                
                ctx.fillStyle = '#ffd700';
                ctx.font = `bold ${fontSize}px ${getComputedStyle(document.body).getPropertyValue('--font-main')}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('MAX LEVEL', boxX + boxWidth / 2, maxLevelY + buttonHeight / 2);
                
                // Sell button below max level
                const sellY = maxLevelY + buttonHeight + buttonSpacing;
                
                ctx.fillStyle = 'rgba(200, 0, 0, 0.3)';
                ctx.fillRect(boxX + padding, sellY, buttonWidth, buttonHeight);
                
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 1;
                ctx.strokeRect(boxX + padding, sellY, buttonWidth, buttonHeight);
                
                ctx.fillStyle = '#ff0000';
                ctx.fillText(`SELL: ${sellValue}G`, boxX + boxWidth / 2, sellY + buttonHeight / 2);
                
                tower.uiButtons.sell = {
                    x: boxX + padding,
                    y: sellY,
                    width: buttonWidth,
                    height: buttonHeight,
                    value: sellValue
                };
            }
        }
    }
}

// ========================================
// UI UPDATES
// ========================================

function updateUI() {
    document.getElementById('waveDisplay').textContent = String(gameState.wave).padStart(2, '0');
    document.getElementById('runsDisplay').textContent = gameState.runsCompleted;
    document.getElementById('livesDisplay').textContent = '♥'.repeat(gameState.lives);
    document.getElementById('goldDisplay').textContent = gameState.gold;
    document.getElementById('scoreDisplay').textContent = gameState.score;
    
    document.getElementById('currentWave').textContent = gameState.wave;
    document.getElementById('enemiesLeft').textContent = enemies.length;
    document.getElementById('enemiesSpawned').textContent = gameState.enemiesSpawned;
    document.getElementById('enemiesKilled').textContent = gameState.enemiesKilled;
    
    // Update tower buttons affordability
    document.querySelectorAll('.tower-btn').forEach(btn => {
        const cost = parseInt(btn.dataset.cost);
        if (gameState.gold < cost) {
            btn.classList.add('disabled');
        } else {
            btn.classList.remove('disabled');
        }
    });
    
    // Update start wave button state
    const startWaveBtn = document.getElementById('startWaveBtn');
    if (gameState.waveInProgress) {
        startWaveBtn.disabled = true;
        startWaveBtn.style.opacity = '0.5';
        startWaveBtn.style.cursor = 'not-allowed';
    } else {
        startWaveBtn.disabled = false;
        startWaveBtn.style.opacity = '1';
        startWaveBtn.style.cursor = 'pointer';
    }
}

function updateZoomDisplay() {
    document.getElementById('zoomLevel').textContent = Math.round(viewport.zoom * 100) + '%';
}

function updateWaveTimerDisplay() {
    const timerElement = document.getElementById('waveTimer');
    const labelElement = document.getElementById('waveTimerLabel');
    
    if (gameState.waveInProgress) {
        labelElement.textContent = 'WAVE ';
        timerElement.textContent = 'IN PROGRESS';
    } else {
        labelElement.textContent = 'Next wave in: ';
        const remaining = Math.ceil((gameState.waveDelay - gameState.waveTimer) / 1000);
        timerElement.textContent = remaining + 's';
    }
}

// ========================================
// UI EVENT HANDLERS
// ========================================

// Tower selection
document.querySelectorAll('.tower-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const towerType = btn.dataset.tower;
        
        // Deselect all
        document.querySelectorAll('.tower-btn').forEach(b => b.classList.remove('selected'));
        
        if (selectedTowerType === towerType) {
            selectedTowerType = null;
        } else {
            selectedTowerType = towerType;
            btn.classList.add('selected');
            
            // If cell is selected and buildable, try to build
            if (selectedCell && grid.cells[selectedCell.y][selectedCell.x] === 1) {
                if (buildTower(towerType, selectedCell.x, selectedCell.y)) {
                    selectedTowerType = null;
                    document.querySelectorAll('.tower-btn').forEach(b => b.classList.remove('selected'));
                }
            }
        }
    });
});

// Action buttons (if they exist)
const upgradeBtn = document.getElementById('upgradeBtn');
const sellBtn = document.getElementById('sellBtn');
if (upgradeBtn) upgradeBtn.addEventListener('click', upgradeTower);
if (sellBtn) sellBtn.addEventListener('click', sellTower);

// Control buttons
document.getElementById('startWaveBtn').addEventListener('click', () => {
    if (!gameState.waveInProgress) {
        startWave();
    }
});

document.getElementById('newLevelBtn').addEventListener('click', () => {
    showNewLevelModal();
});

document.getElementById('pauseBtn').addEventListener('click', togglePause);

document.getElementById('speedBtn').addEventListener('click', () => {
    const speeds = [1, 2, 3];
    const currentIndex = speeds.indexOf(gameState.speed);
    gameState.speed = speeds[(currentIndex + 1) % speeds.length];
    document.getElementById('speedText').textContent = `SPEED: x${gameState.speed}`;
});

// Drawer toggle functionality for small screens
document.getElementById('drawerToggle').addEventListener('click', () => {
    const rightPanel = document.querySelector('.right-panel');
    const overlay = document.getElementById('drawerOverlay');
    
    rightPanel.classList.add('drawer-open');
    overlay.classList.add('active');
});

document.getElementById('drawerOverlay').addEventListener('click', () => {
    const rightPanel = document.querySelector('.right-panel');
    const overlay = document.getElementById('drawerOverlay');
    
    rightPanel.classList.remove('drawer-open');
    overlay.classList.remove('active');
});

document.getElementById('drawerClose').addEventListener('click', () => {
    const rightPanel = document.querySelector('.right-panel');
    const overlay = document.getElementById('drawerOverlay');
    
    rightPanel.classList.remove('drawer-open');
    overlay.classList.remove('active');
});

// Stats drawer toggle functionality for mobile
let statsDrawerOpen = false; // Start closed on mobile
const statsBox = document.getElementById('statsBox');
const statsDrawerToggle = document.getElementById('statsDrawerToggle');
const arrow = document.getElementById('statsDrawerArrow');

// Only initialize drawer state on mobile screens
function initStatsDrawer() {
    if (window.innerWidth <= 1024) {
        statsBox.classList.add('stats-drawer-closed');
        statsDrawerToggle.classList.add('stats-drawer-closed');
        arrow.textContent = '<<';
        statsDrawerOpen = false;
    } else {
        // Remove drawer classes on desktop
        statsBox.classList.remove('stats-drawer-closed', 'stats-drawer-open');
        statsDrawerToggle.classList.remove('stats-drawer-closed', 'stats-drawer-open');
    }
}

// Initialize on load
initStatsDrawer();

// Re-initialize on window resize
window.addEventListener('resize', initStatsDrawer);

document.getElementById('statsDrawerToggle').addEventListener('click', () => {
    statsDrawerOpen = !statsDrawerOpen;
    
    if (statsDrawerOpen) {
        statsBox.classList.remove('stats-drawer-closed');
        statsBox.classList.add('stats-drawer-open');
        statsDrawerToggle.classList.remove('stats-drawer-closed');
        statsDrawerToggle.classList.add('stats-drawer-open');
        arrow.textContent = '>>'; // Arrows point away when open (to close it)
    } else {
        statsBox.classList.remove('stats-drawer-open');
        statsBox.classList.add('stats-drawer-closed');
        statsDrawerToggle.classList.remove('stats-drawer-open');
        statsDrawerToggle.classList.add('stats-drawer-closed');
        arrow.textContent = '<<'; // Arrows point in when closed (to open it)
    }
});

// Zoom controls
document.getElementById('zoomIn').addEventListener('click', () => {
    viewport.zoom = Math.min(viewport.maxZoom, viewport.zoom * 1.2);
    clampViewport();
    updateZoomDisplay();
});

document.getElementById('zoomOut').addEventListener('click', () => {
    viewport.zoom = Math.max(viewport.minZoom, viewport.zoom * 0.8);
    clampViewport();
    updateZoomDisplay();
});

document.getElementById('centerView').addEventListener('click', centerView);

// ========================================
// PREFERENCES SYSTEM (separate from game saves)
// ========================================
const PREFS_KEY = 'towerDefensePreferences';

function savePreferences() {
    const prefs = {
        theme: currentTheme
    };
    try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch (e) {
        console.error('Failed to save preferences:', e);
    }
}

function loadPreferences() {
    try {
        const saved = localStorage.getItem(PREFS_KEY);
        if (saved) {
            const prefs = JSON.parse(saved);
            
            // Restore theme
            if (typeof prefs.theme === 'number' && prefs.theme >= 0 && prefs.theme < themes.length) {
                currentTheme = prefs.theme;
                document.body.classList.add(`theme-${themes[currentTheme]}`);
                document.getElementById('themeText').textContent = themeDisplayNames[themes[currentTheme]];
            }
            
            return true;
        }
    } catch (e) {
        console.error('Failed to load preferences:', e);
    }
    
    return false;
}

// Theme toggle
let currentTheme = 0;
const themes = [
    'green', 
    'tron', 
    'sark', 
    'clu', 
    'flynn'
];

const themeDisplayNames = {
    'green': 'GREEN',
    'tron': 'TRON',
    'sark': 'SARK',
    'clu': 'CLU',
    'flynn': 'FLYNN'
};

document.getElementById('themeToggle').addEventListener('click', () => {
    document.body.classList.remove(`theme-${themes[currentTheme]}`);
    currentTheme = (currentTheme + 1) % themes.length;
    document.body.classList.add(`theme-${themes[currentTheme]}`);
    document.getElementById('themeText').textContent = themeDisplayNames[themes[currentTheme]];
    savePreferences();
});

// Modal buttons
document.getElementById('restartBtn').addEventListener('click', () => {
    document.getElementById('gameOverModal').classList.add('hidden');
    resetGame();
});

document.getElementById('menuBtn').addEventListener('click', () => {
    window.location.href = '../projects.html';
});

// ========================================
// GAME STATE FUNCTIONS
// ========================================

function togglePause() {
    gameState.isPaused = !gameState.isPaused;
    document.getElementById('pauseText').textContent = gameState.isPaused ? 'RESUME' : 'PAUSE';
    
    // Track if this is a user-initiated pause
    wasUserPaused = gameState.isPaused;
    
    // Reset speed to 1x when pausing
    if (gameState.isPaused) {
        gameState.speed = 1;
        document.getElementById('speedText').textContent = 'SPEED: x1';
        // Reset accumulator to prevent time buildup
        accumulator = 0;
    }
}

function resetGame() {
    gameState = {
        wave: 1,
        lives: 3,
        gold: 500,
        score: 0,
        isPaused: false,
        isGameOver: false,
        speed: 1,
        waveInProgress: false,
        enemiesKilled: 0,
        enemiesSpawned: 0,
        waveTimer: 0,
        waveDelay: 30000,
        maxPathTurns: 16,  // Reset to initial value
        runsCompleted: 0  // Reset to 0
    };
    
    // Reset pause tracking
    wasUserPaused = false;
    
    // Reset new level modal flag
    newLevelModalShown = false;
    
    towers = [];
    enemies = [];
    projectiles = [];
    selectedCell = null;
    selectedTowerType = null;
    
    // Reset game time and spawn queue
    gameTime = 0;
    enemySpawnQueue = [];
    
    // Reset grid cells that were walls back to buildable
    for (let y = 0; y < grid.rows; y++) {
        for (let x = 0; x < grid.cols; x++) {
            if (grid.cells[y][x] === 3) {
                grid.cells[y][x] = 1;
            }
        }
    }
    
    // Hide the New Level button
    const newLevelBtn = document.getElementById('newLevelBtn');
    if (newLevelBtn) {
        newLevelBtn.style.display = 'none';
    }
    
    // Update UI including speed display
    document.getElementById('speedText').textContent = 'SPEED: x1';
    updateUI();
    updateSelectionInfo();
}

function gameOver() {
    gameState.isGameOver = true;
    
    // Auto-pause the game
    if (!gameState.isPaused) {
        gameState.isPaused = true;
        document.getElementById('pauseText').textContent = 'RESUME';
    }
    
    const gameOverArt = `
╔════════════════════════════════════╗
║                                    ║
║        GAME OVER                   ║
║                                    ║
║    DEFENSE SYSTEMS FAILED          ║
║                                    ║
╚════════════════════════════════════╝
    `;
    
    document.getElementById('gameOverArt').textContent = gameOverArt;
    document.getElementById('finalWave').textContent = gameState.wave;
    document.getElementById('finalScore').textContent = gameState.score;
    document.getElementById('finalKills').textContent = gameState.enemiesKilled;
    
    document.getElementById('gameOverModal').classList.remove('hidden');
}

function showNewLevelModal() {
    const perfectRun = gameState.lives === 3;
    const wavesCompleted = gameState.wave;
    
    // Increase path complexity
    gameState.maxPathTurns += 4;
    
    showCustomModal(
        `╔════════════════════════════════════╗
║                                    ║
║    GENERATE NEW LEVEL              ║
║                                    ║
╚════════════════════════════════════╝

Path complexity increased to ${gameState.maxPathTurns} turns.

Generate a new level with more complex layout?

(Game will restart from Wave 1 with increased difficulty)

Current Stats:
• Waves Completed: ${wavesCompleted}
• Score: ${gameState.score}
• Perfect Run: ${perfectRun ? 'YES ✓' : 'NO'}`,
        'NEW LEVEL',
        { showCancel: true, confirmText: 'NEW LEVEL', cancelText: 'CONTINUE' }
    ).then(confirmNewLevel => {
        if (confirmNewLevel) {
            // Save the current max turns and runs completed before reset
            const currentMaxTurns = gameState.maxPathTurns;
            const currentRunsCompleted = gameState.runsCompleted;
            
            // Reset game to initial state
            resetGame();
            
            // Restore the increased turn complexity and runs completed
            gameState.maxPathTurns = currentMaxTurns;
            gameState.runsCompleted = currentRunsCompleted;
            
            // Reset the modal shown flag
            newLevelModalShown = false;
            
            // Hide the New Level button
            const newLevelBtn = document.getElementById('newLevelBtn');
            if (newLevelBtn) {
                newLevelBtn.style.display = 'none';
            }
            
            // Generate new level with increased complexity
            generateLevel();
        } else {
            // User declined, restore the previous max turns
            gameState.maxPathTurns -= 4;
            
            // Show a helpful message about the New Level button
            customAlert(
                `You can access the New Level option at any time by clicking the [NEW LEVEL] button next to the Start Wave button.`,
                'CONTINUE'
            );
        }
    });
}

// ========================================
// SAVE/LOAD SYSTEM
// ========================================

// Tab switching
document.getElementById('intelTab').addEventListener('click', () => {
    document.getElementById('intelTab').classList.add('active');
    document.getElementById('saveLoadTab').classList.remove('active');
    document.getElementById('intelPanel').classList.add('active');
    document.getElementById('saveLoadPanel').classList.remove('active');
});

document.getElementById('saveLoadTab').addEventListener('click', () => {
    document.getElementById('saveLoadTab').classList.add('active');
    document.getElementById('intelTab').classList.remove('active');
    document.getElementById('saveLoadPanel').classList.add('active');
    document.getElementById('intelPanel').classList.remove('active');
    refreshSaveList();
});

function saveGame(saveName) {
    // Extract only the playable grid data without device-specific padding
    const playableBounds = grid.playableBounds;
    const PLAYABLE_SIZE = playableBounds.maxX - playableBounds.minX + 1;
    
    // Extract only playable cells (without padding)
    const playableCells = [];
    for (let y = playableBounds.minY; y <= playableBounds.maxY; y++) {
        const row = [];
        for (let x = playableBounds.minX; x <= playableBounds.maxX; x++) {
            row.push(grid.cells[y][x]);
        }
        playableCells.push(row);
    }
    
    // Convert path, entry, exit to relative coordinates (without padding offset)
    const pathRelative = grid.path.map(cell => ({
        x: cell.x - playableBounds.minX,
        y: cell.y - playableBounds.minY
    }));
    
    const entryRelative = {
        x: grid.entry.x - playableBounds.minX,
        y: grid.entry.y - playableBounds.minY
    };
    
    const exitRelative = {
        x: grid.exit.x - playableBounds.minX,
        y: grid.exit.y - playableBounds.minY
    };
    
    // Convert tower positions to relative coordinates and save only persistent data
    const towersRelative = towers.map(t => ({
        type: t.type,
        x: t.x - playableBounds.minX,
        y: t.y - playableBounds.minY,
        level: t.level,
        kills: t.kills,
        totalCost: t.totalCost
        // Don't save runtime properties: lastShot, target
    }));
    
    const saveData = {
        version: '2.0', // Updated version to handle padding-free saves
        timestamp: Date.now(),
        gameState: {
            // Only save persistent data, not runtime/UI state
            wave: gameState.wave,
            lives: gameState.lives,
            gold: gameState.gold,
            score: gameState.score,
            enemiesKilled: gameState.enemiesKilled,
            maxPathTurns: gameState.maxPathTurns,
            runsCompleted: gameState.runsCompleted
        },
        grid: {
            playableSize: PLAYABLE_SIZE,
            cells: playableCells, // Only playable cells
            path: pathRelative,
            entry: entryRelative,
            exit: exitRelative
        },
        towers: towersRelative,
        viewport: {
            zoom: viewport.zoom
            // Don't save x/y as they need to be recalculated for new padding
        }
    };
    
    try {
        const saves = JSON.parse(localStorage.getItem('towerDefenseSaves') || '{}');
        saves[saveName] = saveData;
        localStorage.setItem('towerDefenseSaves', JSON.stringify(saves));
        return true;
    } catch (e) {
        console.error('Failed to save game:', e);
        return false;
    }
}

function loadGame(saveName) {
    try {
        const saves = JSON.parse(localStorage.getItem('towerDefenseSaves') || '{}');
        const saveData = saves[saveName];
        
        if (!saveData) {
            return false;
        }
        
        // Temporarily pause game to ensure clean state restoration
        gameState.isPaused = true;
        
        // Clear all runtime entities FIRST before restoring state
        // This prevents any race conditions with the game loop
        enemies = [];
        projectiles = [];
        enemySpawnQueue = [];
        gameTime = 0;
        accumulator = 0;
        lastTime = 0;
        
        // Restore persistent game state only (not runtime/UI state)
        gameState.wave = saveData.gameState.wave;
        gameState.lives = saveData.gameState.lives;
        gameState.gold = saveData.gameState.gold;
        gameState.score = saveData.gameState.score;
        gameState.enemiesKilled = saveData.gameState.enemiesKilled || 0;
        gameState.maxPathTurns = saveData.gameState.maxPathTurns || 16;
        gameState.runsCompleted = saveData.gameState.runsCompleted || 0;
        
        // Reset runtime state (these should never be loaded from saves)
        gameState.isGameOver = false;
        gameState.speed = 1;
        gameState.waveInProgress = false;
        gameState.enemiesSpawned = 0;
        gameState.waveTimer = 0;
        gameState.waveDelay = 30000;
        // Note: isPaused will be set to false at the end
        
        // Handle both old (v1.0) and new (v2.0) save formats
        if (saveData.version === '2.0') {
            // New format: Reconstruct grid with device-appropriate padding
            const PLAYABLE_SIZE = saveData.grid.playableSize;
            
            // Calculate padding for current device
            const HORIZONTAL_PADDING = Math.ceil((canvas.width / 2) / CONFIG.CELL_SIZE) * 2 + 1;
            const VERTICAL_PADDING = Math.ceil((canvas.height / 2) / CONFIG.CELL_SIZE) * 2 + 1;
            
            // Setup grid dimensions
            grid.cols = PLAYABLE_SIZE + (HORIZONTAL_PADDING * 2);
            grid.rows = PLAYABLE_SIZE + (VERTICAL_PADDING * 2);
            
            // Store playable bounds
            grid.playableBounds = {
                minX: HORIZONTAL_PADDING,
                minY: VERTICAL_PADDING,
                maxX: HORIZONTAL_PADDING + PLAYABLE_SIZE - 1,
                maxY: VERTICAL_PADDING + PLAYABLE_SIZE - 1
            };
            
            // Initialize full grid with padding
            grid.cells = Array(grid.rows).fill(null).map((_, y) => 
                Array(grid.cols).fill(null).map((_, x) => {
                    // Cells outside playable bounds are decorative
                    if (x < grid.playableBounds.minX || x > grid.playableBounds.maxX ||
                        y < grid.playableBounds.minY || y > grid.playableBounds.maxY) {
                        return 3; // Decorative wall area
                    }
                    
                    // Insert saved playable cells
                    const relX = x - HORIZONTAL_PADDING;
                    const relY = y - VERTICAL_PADDING;
                    return saveData.grid.cells[relY][relX];
                })
            );
            
            // Convert path back to absolute coordinates with new padding
            grid.path = saveData.grid.path.map(cell => ({
                x: cell.x + HORIZONTAL_PADDING,
                y: cell.y + VERTICAL_PADDING
            }));
            
            // Convert entry/exit back to absolute coordinates
            grid.entry = {
                x: saveData.grid.entry.x + HORIZONTAL_PADDING,
                y: saveData.grid.entry.y + VERTICAL_PADDING
            };
            
            grid.exit = {
                x: saveData.grid.exit.x + HORIZONTAL_PADDING,
                y: saveData.grid.exit.y + VERTICAL_PADDING
            };
            
            // Convert towers back to absolute coordinates and initialize runtime properties
            towers = saveData.towers.map(t => ({
                type: t.type,
                x: t.x + HORIZONTAL_PADDING,
                y: t.y + VERTICAL_PADDING,
                level: t.level,
                kills: t.kills || 0,
                totalCost: t.totalCost,
                lastShot: 0,  // Initialize runtime property
                target: null  // Initialize runtime property
            }));
            
            // Recenter viewport on path
            const pathCenterX = (PLAYABLE_SIZE / 2) + HORIZONTAL_PADDING;
            const pathCenterY = (PLAYABLE_SIZE / 2) + VERTICAL_PADDING;
            viewport.x = pathCenterX * CONFIG.CELL_SIZE - canvas.width / (2 * saveData.viewport.zoom);
            viewport.y = pathCenterY * CONFIG.CELL_SIZE - canvas.height / (2 * saveData.viewport.zoom);
            viewport.zoom = saveData.viewport.zoom;
            
        } else {
            // Old format (v1.0): Load as-is (legacy support)
            grid.cols = saveData.grid.cols;
            grid.rows = saveData.grid.rows;
            grid.cells = saveData.grid.cells.map(row => [...row]);
            grid.path = [...saveData.grid.path];
            grid.entry = {...saveData.grid.entry};
            grid.exit = {...saveData.grid.exit};
            
            // If playableBounds exists, use it; otherwise calculate from grid
            if (saveData.grid.playableBounds) {
                grid.playableBounds = {...saveData.grid.playableBounds};
            } else {
                // Calculate playableBounds by finding the extent of non-decorative cells
                // This is a fallback for very old saves
                let minX = grid.cols, maxX = 0, minY = grid.rows, maxY = 0;
                for (let y = 0; y < grid.rows; y++) {
                    for (let x = 0; x < grid.cols; x++) {
                        if (grid.cells[y][x] !== 3) {  // Not decorative wall
                            minX = Math.min(minX, x);
                            maxX = Math.max(maxX, x);
                            minY = Math.min(minY, y);
                            maxY = Math.max(maxY, y);
                        }
                    }
                }
                grid.playableBounds = { minX, minY, maxX, maxY };
            }
            
            // Restore towers (legacy format may have extra properties, filter to essentials)
            towers = saveData.towers.map(t => ({
                type: t.type,
                x: t.x,
                y: t.y,
                level: t.level || 1,
                kills: t.kills || 0,
                totalCost: t.totalCost || 0,
                lastShot: 0,
                target: null
            }));
            
            // Restore viewport
            viewport.x = saveData.viewport.x;
            viewport.y = saveData.viewport.y;
            viewport.zoom = saveData.viewport.zoom;
        }
        
        // Clear remaining runtime state
        selectedCell = null;
        selectedTowerType = null;
        wasUserPaused = false;
        touchStartPositions = [];
        
        // Reset viewport drag state
        viewport.isDragging = false;
        viewport.dragStartX = 0;
        viewport.dragStartY = 0;
        viewport.lastTouchDist = 0;
        
        // CRITICAL: Reset lastTime to current timestamp to prevent huge deltaTime spike
        // This must be done before unpausing to avoid wave timer jumping forward
        lastTime = performance.now();
        
        // Unpause game - always unpause after load to allow wave to start
        gameState.isPaused = false;
        
        // Update UI to reflect runtime state
        document.getElementById('pauseText').textContent = 'PAUSE';
        document.getElementById('speedText').textContent = 'SPEED: x1';
        
        // Hide New Level button (only shown after completing wave 15)
        const newLevelBtn = document.getElementById('newLevelBtn');
        if (newLevelBtn) {
            newLevelBtn.style.display = gameState.wave > 15 ? 'block' : 'none';
        }
        
        // If loading a save beyond wave 15, mark the new level modal as already shown
        // to prevent it from appearing when the next wave completes
        if (gameState.wave > 15) {
            newLevelModalShown = true;
        }
        
        // Update all UI elements
        updateUI();
        updateSelectionInfo();
        updateZoomDisplay();
        updateWaveTimerDisplay();
        
        return true;
    } catch (e) {
        console.error('Failed to load game:', e);
        return false;
    }
}

function deleteSave(saveName) {
    try {
        const saves = JSON.parse(localStorage.getItem('towerDefenseSaves') || '{}');
        delete saves[saveName];
        localStorage.setItem('towerDefenseSaves', JSON.stringify(saves));
        return true;
    } catch (e) {
        console.error('Failed to delete save:', e);
        return false;
    }
}

function getSaveList() {
    try {
        return JSON.parse(localStorage.getItem('towerDefenseSaves') || '{}');
    } catch (e) {
        return {};
    }
}

function refreshSaveList() {
    const saveList = document.getElementById('saveList');
    const saves = getSaveList();
    const saveNames = Object.keys(saves).sort((a, b) => saves[b].timestamp - saves[a].timestamp);
    
    if (saveNames.length === 0) {
        saveList.innerHTML = '<div class="info-text dim">No saved games</div>';
        return;
    }
    
    saveList.innerHTML = saveNames.map(name => {
        const save = saves[name];
        const date = new Date(save.timestamp);
        const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        const runs = save.gameState.runsCompleted || 0;
        
        return `
            <div class="save-item">
                <div class="save-item-header">
                    <span class="save-item-name">${name}</span>
                </div>
                <div class="save-item-details">
                    Wave: ${save.gameState.wave} | Runs: ${runs} | Gold: ${save.gameState.gold} | Lives: ${save.gameState.lives}
                </div>
                <div class="save-item-details">
                    ${dateStr}
                </div>
                <div class="save-item-buttons">
                    <button class="save-item-btn" onclick="loadSaveFromList('${name}')">
                        <span class="btn-bracket">[</span>LOAD<span class="btn-bracket">]</span>
                    </button>
                    <button class="save-item-btn delete" onclick="deleteSaveFromList('${name}')">
                        <span class="btn-bracket">[</span>DELETE<span class="btn-bracket">]</span>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Global functions for onclick handlers
window.loadSaveFromList = function(saveName) {
    if (loadGame(saveName)) {
        showSaveMessage('Game loaded successfully!', 'success');
    } else {
        showSaveMessage('Failed to load game', 'error');
    }
};

window.deleteSaveFromList = function(saveName) {
    customConfirm(`Delete save "${saveName}"?`, 'DELETE SAVE').then(confirmed => {
        if (confirmed) {
            if (deleteSave(saveName)) {
                refreshSaveList();
                showSaveMessage('Save deleted', 'success');
            } else {
                showSaveMessage('Failed to delete save', 'error');
            }
        }
    });
};

function showSaveMessage(message, type = '') {
    const msgEl = document.getElementById('saveMessage');
    msgEl.textContent = message;
    msgEl.className = 'save-message ' + type;
    setTimeout(() => {
        msgEl.textContent = '';
        msgEl.className = 'save-message';
    }, 3000);
}

// Save game button
document.getElementById('saveGameBtn').addEventListener('click', () => {
    const saveName = document.getElementById('saveName').value.trim();
    
    if (!saveName) {
        showSaveMessage('Please enter a save name', 'error');
        return;
    }
    
    const saves = getSaveList();
    if (saves[saveName]) {
        customConfirm(`Overwrite existing save "${saveName}"?`, 'OVERWRITE').then(confirmed => {
            if (!confirmed) return;
            
            if (saveGame(saveName)) {
                showSaveMessage('Game saved successfully!', 'success');
                document.getElementById('saveName').value = '';
                refreshSaveList();
            } else {
                showSaveMessage('Failed to save game', 'error');
            }
        });
    } else {
        if (saveGame(saveName)) {
            showSaveMessage('Game saved successfully!', 'success');
            document.getElementById('saveName').value = '';
            refreshSaveList();
        } else {
            showSaveMessage('Failed to save game', 'error');
        }
    }
});

// Quick save/load
document.getElementById('quickSaveBtn').addEventListener('click', () => {
    if (saveGame('QuickSave')) {
        showSaveMessage('Quick save successful!', 'success');
        refreshSaveList();
    } else {
        showSaveMessage('Quick save failed', 'error');
    }
});

document.getElementById('quickLoadBtn').addEventListener('click', () => {
    if (loadGame('QuickSave')) {
        showSaveMessage('Quick load successful!', 'success');
    } else {
        showSaveMessage('No quick save found', 'error');
    }
});

// Export saves
document.getElementById('exportSaveBtn').addEventListener('click', () => {
    try {
        const saves = getSaveList();
        const saveCount = Object.keys(saves).length;
        
        if (saveCount === 0) {
            showSaveMessage('No saves to export', 'error');
            return;
        }
        
        const exportData = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            saves: saves
        };
        
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `tower-defense-saves-${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showSaveMessage(`Exported ${saveCount} save(s)`, 'success');
    } catch (e) {
        console.error('Export failed:', e);
        showSaveMessage('Export failed', 'error');
    }
});

// Import saves
document.getElementById('importSaveBtn').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
});

document.getElementById('importFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const importData = JSON.parse(event.target.result);
            
            if (!importData.saves || typeof importData.saves !== 'object') {
                showSaveMessage('Invalid save file format', 'error');
                return;
            }
            
            const currentSaves = getSaveList();
            const importCount = Object.keys(importData.saves).length;
            let conflictCount = 0;
            
            // Check for conflicts
            for (let saveName in importData.saves) {
                if (currentSaves[saveName]) {
                    conflictCount++;
                }
            }
            
            const processImport = () => {
                // Merge saves
                const mergedSaves = {...currentSaves, ...importData.saves};
                localStorage.setItem('towerDefenseSaves', JSON.stringify(mergedSaves));
                
                refreshSaveList();
                showSaveMessage(`Imported ${importCount} save(s)`, 'success');
            };
            
            if (conflictCount > 0) {
                customConfirm(
                    `Import ${importCount} save(s)?\n\n` +
                    `${conflictCount} save(s) will be overwritten.`,
                    'IMPORT SAVES'
                ).then(confirmed => {
                    if (confirmed) {
                        processImport();
                    }
                });
            } else {
                processImport();
            }
        } catch (e) {
            console.error('Import failed:', e);
            showSaveMessage('Failed to import saves', 'error');
        }
        
        // Reset file input
        e.target.value = '';
    };
    
    reader.readAsText(file);
});

// Wipe all progress
document.getElementById('wipeProgressBtn').addEventListener('click', () => {
    customConfirm(
        '⚠️ DANGER ⚠️\n\n' +
        'This will:\n' +
        '• Delete ALL saved games\n' +
        '• Reset difficulty to default (12 turns)\n' +
        '• Reset current game to Wave 1\n\n' +
        'This action CANNOT be undone!\n\n' +
        'Are you absolutely sure?',
        'WIPE PROGRESS'
    ).then(confirmed => {
        if (!confirmed) return;
        
        customConfirm(
            'Last chance!\n\n' +
            'Click YES to wipe everything or NO to cancel.',
            'FINAL WARNING'
        ).then(doubleConfirm => {
            if (doubleConfirm) {
                try {
                    // Clear all saves from localStorage
                    localStorage.removeItem('towerDefenseSaves');
                    
                    // Reset game completely
                    gameState = {
                        wave: 1,
                        lives: 3,
                        gold: 500,
                        score: 0,
                        isPaused: false,
                        isGameOver: false,
                        speed: 1,
                        waveInProgress: false,
                        enemiesKilled: 0,
                        enemiesSpawned: 0,
                        waveTimer: 0,
                        waveDelay: 30000,
                        maxPathTurns: 16  // Reset to default
                    };
                    
                    towers = [];
                    enemies = [];
                    projectiles = [];
                    selectedCell = null;
                    selectedTowerType = null;
                    
                    // Reset game time and spawn queue
                    gameTime = 0;
                    enemySpawnQueue = [];
                    
                    // Generate fresh level
                    generateLevel();
                    
                    refreshSaveList();
                    document.getElementById('speedText').textContent = 'SPEED: x1';
                    updateUI();
                    updateSelectionInfo();
                    
                    showSaveMessage('All progress wiped', 'success');
                } catch (e) {
                    console.error('Wipe failed:', e);
                    showSaveMessage('Wipe failed', 'error');
                }
            }
        });
    });
});

// ========================================
// CUSTOM TOOLTIP SYSTEM
// ========================================

class TooltipManager {
    constructor() {
        this.tooltip = document.getElementById('customTooltip');
        this.tooltipTitle = document.getElementById('tooltipTitle');
        this.tooltipContent = document.getElementById('tooltipContent');
        this.currentTarget = null;
        this.hideTimeout = null;
        
        // Bind event handlers
        this.handleMouseEnter = this.handleMouseEnter.bind(this);
        this.handleMouseLeave = this.handleMouseLeave.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        
        this.init();
    }
    
    init() {
        // Find all tower buttons and attach event listeners
        const towerButtons = document.querySelectorAll('.tower-btn[data-tower]');
        towerButtons.forEach(button => {
            button.addEventListener('mouseenter', this.handleMouseEnter);
            button.addEventListener('mouseleave', this.handleMouseLeave);
            button.addEventListener('mousemove', this.handleMouseMove);
            
            // Remove default title attribute since we're using custom tooltips
            button.removeAttribute('title');
        });
    }
    
    handleMouseEnter(event) {
        clearTimeout(this.hideTimeout);
        this.currentTarget = event.currentTarget;
        
        const towerType = this.currentTarget.getAttribute('data-tower');
        const towerData = CONFIG.TOWER_TYPES[towerType];
        
        if (towerData) {
            this.showTooltip(towerType, towerData, event);
        }
    }
    
    handleMouseLeave() {
        this.hideTimeout = setTimeout(() => {
            this.hideTooltip();
        }, 100);
    }
    
    handleMouseMove(event) {
        if (this.tooltip.classList.contains('show')) {
            this.positionTooltip(event);
        }
    }
    
    showTooltip(towerType, towerData, event) {
        // Set tooltip title
        this.tooltipTitle.textContent = towerData.name.toUpperCase();
        
        // Build tooltip content
        const content = this.buildTooltipContent(towerType, towerData);
        this.tooltipContent.innerHTML = content;
        
        // Position and show tooltip
        this.positionTooltip(event);
        this.tooltip.classList.add('show');
    }
    
    hideTooltip() {
        this.tooltip.classList.remove('show');
        this.currentTarget = null;
    }
    
    positionTooltip(event) {
        const tooltipRect = this.tooltip.getBoundingClientRect();
        const padding = 15;
        
        let left = event.clientX + padding;
        let top = event.clientY + padding;
        
        // Check if tooltip would go off right edge
        if (left + tooltipRect.width > window.innerWidth) {
            left = event.clientX - tooltipRect.width - padding;
        }
        
        // Check if tooltip would go off bottom edge
        if (top + tooltipRect.height > window.innerHeight) {
            top = event.clientY - tooltipRect.height - padding;
        }
        
        // Ensure tooltip doesn't go off left or top edges
        left = Math.max(padding, left);
        top = Math.max(padding, top);
        
        this.tooltip.style.left = `${left}px`;
        this.tooltip.style.top = `${top}px`;
    }
    
    buildTooltipContent(towerType, towerData) {
        let html = '';
        
        // Description section
        const description = this.getTowerDescription(towerType);
        if (description) {
            html += `<div class="tooltip-section">
                <div class="tooltip-description">${description}</div>
            </div>`;
        }
        
        // Stats section
        html += '<div class="tooltip-section">';
        html += '<div class="tooltip-stats-grid">';
        
        // Cost
        html += `<div class="tooltip-stat-item">
            <span class="tooltip-label">COST:</span>
            <span class="tooltip-value">${towerData.cost}G</span>
        </div>`;
        
        // Damage
        if (towerData.damage > 0) {
            html += `<div class="tooltip-stat-item">
                <span class="tooltip-label">DAMAGE:</span>
                <span class="tooltip-value">${towerData.damage}</span>
            </div>`;
        }
        
        // Range
        if (towerData.range) {
            html += `<div class="tooltip-stat-item">
                <span class="tooltip-label">RANGE:</span>
                <span class="tooltip-value">${towerData.range} cells</span>
            </div>`;
        }
        
        // Fire Rate
        if (towerData.fireRate && !towerData.continuous) {
            const fireRatePerSec = (1000 / towerData.fireRate).toFixed(1);
            html += `<div class="tooltip-stat-item">
                <span class="tooltip-label">FIRE RATE:</span>
                <span class="tooltip-value">${fireRatePerSec}/sec</span>
            </div>`;
        }
        
        // Special attributes
        if (towerData.aoe) {
            html += `<div class="tooltip-stat-item">
                <span class="tooltip-label">AOE RADIUS:</span>
                <span class="tooltip-value">${towerData.aoe} cells</span>
            </div>`;
        }
        
        if (towerData.maxTargets) {
            html += `<div class="tooltip-stat-item">
                <span class="tooltip-label">TARGETS:</span>
                <span class="tooltip-value">${towerData.maxTargets}</span>
            </div>`;
        }
        
        if (towerData.slow) {
            html += `<div class="tooltip-stat-item">
                <span class="tooltip-label">SLOW:</span>
                <span class="tooltip-value">${(towerData.slow * 100)}%</span>
            </div>`;
        }
        
        if (towerData.boost) {
            html += `<div class="tooltip-stat-item">
                <span class="tooltip-label">BOOST:</span>
                <span class="tooltip-value">+${(towerData.boost * 100)}%</span>
            </div>`;
        }
        
        if (towerData.goldBoost) {
            html += `<div class="tooltip-stat-item">
                <span class="tooltip-label">GOLD BOOST:</span>
                <span class="tooltip-value">+${(towerData.goldBoost * 100)}%</span>
            </div>`;
        }
        
        if (towerData.rangeBoost) {
            html += `<div class="tooltip-stat-item">
                <span class="tooltip-label">RANGE BOOST:</span>
                <span class="tooltip-value">+${towerData.rangeBoost}</span>
            </div>`;
        }
        
        if (towerData.speedBoost) {
            html += `<div class="tooltip-stat-item">
                <span class="tooltip-label">SPEED BOOST:</span>
                <span class="tooltip-value">-${(towerData.speedBoost * 100)}%</span>
            </div>`;
        }
        
        if (towerData.chainBoost) {
            html += `<div class="tooltip-stat-item">
                <span class="tooltip-label">CHAIN BOOST:</span>
                <span class="tooltip-value">+${towerData.chainBoost}</span>
            </div>`;
        }
        
        if (towerData.chainTargets) {
            html += `<div class="tooltip-stat-item">
                <span class="tooltip-label">CHAIN JUMPS:</span>
                <span class="tooltip-value">${towerData.chainTargets}</span>
            </div>`;
        }
        
        if (towerData.continuous) {
            html += `<div class="tooltip-stat-item">
                <span class="tooltip-label">TYPE:</span>
                <span class="tooltip-value">CONTINUOUS</span>
            </div>`;
        }
        
        html += '</div></div>';
        
        // Synergies section
        const synergies = this.getTowerSynergies(towerType);
        if (synergies) {
            html += `<div class="tooltip-synergy">
                <div class="tooltip-synergy-title">▸ SYNERGIES:</div>
                <div class="tooltip-synergy-list">${synergies}</div>
            </div>`;
        }
        
        return html;
    }
    
    getTowerDescription(towerType) {
        const descriptions = {
            shooter: 'Basic single-target damage tower. Cheap and reliable starter unit.',
            pulse: 'Multi-target AOE tower. Hits all enemies in range simultaneously. Excellent crowd control.',
            sniper: 'High damage, long range sniper tower. Slow fire rate but devastating single shots.',
            artillery: 'Area of effect explosive tower. Damages primary target and nearby enemies.',
            cpu: 'Targets up to 3 enemies simultaneously with multi-threaded attacks. Great for handling multiple threats.',
            laser: 'Continuous beam damage over time. Locks onto a single target and melts it.',
            voltage: 'Chain lightning damage jumps between targets. Extremely powerful against groups.',
            slower: 'Slows enemy movement by 50%. Essential for giving your offensive towers more time.',
            battery: 'Increases gold earned from kills. Place near high-traffic areas to maximize economy.',
            shield: 'Reduces damage enemies take by 25% while in range. WARNING: Makes enemies harder to kill!',
            ram: 'Boosts damage of all nearby towers. Stacks with multiple RAM Banks!',
            overclock: 'Extends range of nearby towers. Stacks with multiple Overclocks!',
            heatsink: 'Reduces fire rate cooldown (towers shoot FASTER). Stacks with multiple Heat Sinks! Max 80% reduction.',
            conductor: 'Increases chain lightning targets. Makes Voltage Regulator devastatingly powerful!'
        };
        return descriptions[towerType] || '';
    }
    
    getTowerSynergies(towerType) {
        const synergies = {
            shooter: 'Works well with RAM Bank for damage boost and Heat Sink for faster firing.',
            pulse: 'Boosted by RAM Bank and Heat Sink. Overclock extends its already wide area.',
            sniper: 'Enhanced by RAM Bank, Overclock, and Heat Sink. Overclock makes it cover massive areas.',
            artillery: 'Pairs well with RAM Bank for increased AOE damage. Overclock extends range.',
            cpu: 'Synergizes with RAM Bank and Heat Sink. Very effective with multiple support towers.',
            laser: 'Highly effective with RAM Bank damage boost. Overclock extends beam reach.',
            voltage: 'Enhanced by RAM Bank and Heat Sink. ESPECIALLY Conductor Coil for more chain jumps!',
            slower: 'Works with all damage towers by giving them more time to attack enemies.',
            battery: 'Affects all enemies killed in range. Stack multiple for massive gold generation.',
            shield: 'Use strategically at chokepoints. Can protect specific paths while others deal damage.',
            ram: 'Affects: Transistor, Diode Array, Capacitor, CPU Core, Laser Diode, Voltage Regulator, EMP Coil.',
            overclock: 'Affects: ALL offensive towers. Stack multiple for massive range extension.',
            heatsink: 'Affects: ALL offensive towers. Stack multiple for maximum fire rate (up to 80% reduction).',
            conductor: 'Affects: ONLY Voltage Regulator. Stack multiple to create devastating chain reactions!'
        };
        return synergies[towerType] || '';
    }
}

// Initialize tooltip manager after DOM is loaded
let tooltipManager;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        tooltipManager = new TooltipManager();
        loadPreferences(); // Load user preferences on startup
    });
} else {
    tooltipManager = new TooltipManager();
    loadPreferences(); // Load user preferences on startup
}

// ========================================
// START GAME
// ========================================

updateUI();
updateZoomDisplay();
requestAnimationFrame(gameLoop);
