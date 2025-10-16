// ================================
// ASTEROID MINER: DEEP SPACE OPS
// Game Logic Script
// ================================
//
// PERFORMANCE OPTIMIZATIONS:
// - Object pooling for particles (reduces GC pressure)
// - Viewport culling (only render visible objects)
// - Squared distance calculations (avoid sqrt when possible)
// - for loops instead of forEach (faster iteration)
// - Cached calculations (crack patterns, etc.)
// - Batch rendering operations (z-index)
// - RequestAnimationFrame optimization
//
// ================================

// ================================
// GAME STATE
// ================================

const gameState = {
    // Player stats
    credits: 0,
    hull: 100,
    maxHull: 100,
    fuel: 100,
    maxFuel: 100,
    cargo: 0,
    maxCargo: 100,
    
    // Upgrades
    upgrades: {
        speed: 1,
        cargo: 1,
        mining: 1,
        hull: 1,
        fuel: 1,
        range: 1,
        multiMining: 1,
        scanRange: 1,
        scanCooldown: 1,
        advancedScanner: 0,  // 0 = not purchased, 1 = purchased (one-time upgrade)
        cargoDrone: 0  // 0 = not purchased, 1 = purchased (one-time upgrade)
    },
    
    // Prestige
    prestige: 0,
    prestigeBonus: 0,
    
    // Sector info
    sector: 1,
    sectorName: 'ALPHA-001',
    sectorsExplored: 1,
    
    // Inventory (resource counts)
    inventory: {},
    
    // Statistics
    stats: {
        totalMined: 0,
        distanceTraveled: 0,
        asteroidsDestroyed: 0,
        hazardsAvoided: 0,
        sectorsVisited: 1,
        playTime: 0
    },
    
    // Game flags
    isPaused: false,
    isAtStation: false
};

// ================================
// GAME CONFIGURATION
// ================================

const CONFIG = {
    // Ship physics (scaled up for time-consistent movement)
    baseSpeed: 1,
    acceleration: 0.4,
    friction: 0.92,
    
    // Mining
    baseMiningSpeed: 60, // frames to mine
    miningRange: 75,
    
    // Fuel consumption (less efficient - increased consumption)
    baseFuelConsumption: 0.005,
    miningFuelCost: 0.01,
    
    // Spawn rates (base values - multiplied by sector bonuses)
    // Sector bonuses: +10% spawn rate per sector, increased rare asteroid chances
    asteroidSpawnChance: 0.02,
    hazardSpawnChance: 0.005,
    rareAsteroidChance: 0.15,
    legendaryAsteroidChance: 0.03,
    
    // Max object limits (scaled by sector)
    baseMaxAsteroids: 100, // Base limit for sector 1
    maxAsteroidsPerSector: 50, // Additional asteroids allowed per sector
    baseMaxHazards: 40, // Base limit for sector 1
    maxHazardsPerSector: 15, // Additional hazards allowed per sector

    // World size
    worldWidth: 3000,
    worldHeight: 3000
};

// Reference resolution for consistent viewport across all screen sizes
// This is the virtual resolution that determines how much of the game world is visible
const VIEWPORT_REFERENCE = {
    WIDTH: 1200,
    HEIGHT: 900
};

// ================================
// PLAYER SHIP
// ================================

const player = {
    x: 1500, // Center of world (CONFIG.worldWidth / 2)
    y: 1500, // Center of world (CONFIG.worldHeight / 2)
    vx: 0,
    vy: 0,
    angle: 0,
    size: 36,
    isMining: false,
    miningTargets: [], // Array of {asteroid, progress} objects for multi-mining
    miningTarget: null, // Kept for backward compatibility
    miningProgress: 0, // Kept for backward compatibility
    isManuallyControlled: false, // Track if player is actively providing input
    asteroidInRange: false, // Populated by collision worker
    closestAsteroidData: null, // Populated by collision worker
    colors: {
        primary: '#e0e0e0',    // Main hull color (light grey/white)
        secondary: '#808080',  // Hull outline color (medium grey)
        accent: '#c0c0c0',     // Laser/detail color (silver)
        thruster: '#ff6600'    // Thruster flame color (red-orange)
    }
};

// ================================
// FUEL WARNING TRACKING
// ================================

const fuelWarnings = {
    warning50: { triggered: false, timestamp: 0 }, // 40% warning
    warning25: { triggered: false, timestamp: 0 }  // 20% warning
};

// ================================
// VIEWPORT / CAMERA
// ================================

const viewport = {
    x: 0,
    y: 0,
    zoom: 1.5,
    targetZoom: 1.5,
    minZoom: 0.75,
    maxZoom: 1.5,
    smoothing: 0.1,
    zoomSmoothing: 0.15
};

// ================================
// CARGO DRONE SYSTEM
// ================================

let cargoDrone = null; // Will hold drone state when active

// ================================
// ASTEROID TYPES
// ================================

const ASTEROID_TYPES = {
    common: {
        name: 'Iron Ore',
        color: '#888888',
        icon: '●',
        value: 2,
        health: 10,  // Most common, most health
        size: 12,
        chance: 0.70
    },
    copper: {
        name: 'Copper',
        color: '#ff8844',
        icon: '◆',
        value: 5,
        health: 8,
        size: 14,
        chance: 0.15
    },
    silver: {
        name: 'Silver',
        color: '#ccccff',
        icon: '◇',
        value: 10,
        health: 6,
        size: 16,
        chance: 0.08
    },
    gold: {
        name: 'Gold',
        color: '#ffdd00',
        icon: '◈',
        value: 20,
        health: 5,
        size: 18,
        chance: 0.04
    },
    platinum: {
        name: 'Platinum',
        color: '#aaffff',
        icon: '◎',
        value: 40,
        health: 3,
        size: 20,
        chance: 0.02
    },
    crystal: {
        name: 'Quantum Crystal',
        color: '#ff00ff',
        icon: '❖',
        value: 100,
        health: 2,  // Rarest, least health
        size: 22,
        chance: 0.01
    }
};

// ================================
// HAZARD TYPES
// ================================

const HAZARD_TYPES = {
    debris: {
        name: 'Space Debris',
        color: '#ff4444',
        icon: '✕',
        damage: 10,
        size: 14,
        speed: 0.75  // Reduced from 8.33
    },
    mine: {
        name: 'Proximity Mine',
        color: '#ff0000',
        icon: '⊗',
        damage: 25,
        size: 12,
        speed: 0
    },
    vortex: {
        name: 'Gravity Vortex',
        color: '#8800ff',
        icon: '◉',
        damage: 5,
        size: 30,
        speed: 0,
        pullForce: 0.08  // Reduced from 0.25 for more manageable gravity
    }
};

// ================================
// GAME OBJECTS
// ================================

let asteroids = [];
let hazards = [];
let particles = [];
let floatingText = [];
let stars = [];
let starRenderData = []; // Pre-calculated star positions from worker

// Star worker for multi-threaded optimization
let starWorker = null;
let starWorkerReady = false;

// Physics worker for asteroid/hazard/particle updates
let physicsWorker = null;
let physicsWorkerReady = false;
let pendingPhysicsUpdate = false;

// Collision worker for collision detection
let collisionWorker = null;
let collisionWorkerReady = false;
let pendingCollisionCheck = false;

// FPS counter worker for zero-overhead FPS tracking
let fpsWorker = null;
let fpsWorkerReady = false;

// Auto-pilot state
let autoPilotActive = false;

// Rescue ship state
let rescueShip = null;

// ================================
// SCAN SYSTEM
// ================================

const scanState = {
    active: false,
    waveRadius: 0,
    waveMaxRadius: 400, // Will be calculated based on upgrades
    waveSpeed: 10,
    detectedItems: [],
    displayTime: 7000, // Will be calculated based on upgrades
    startTime: 0,
    cooldown: 0,
    cooldownMax: 8000 // Will be calculated based on upgrades
};

const SCAN_CONFIG = {
    baseRange: 400, // Base scan range
    rangePerLevel: 100, // Additional range per upgrade level
    baseCooldown: 8000, // Base cooldown (8 seconds)
    cooldownReduction: 800, // Cooldown reduction per level (0.8 seconds)
    displayDuration: 7000, // Fixed display duration (7 seconds)
    lineColor: '#00ffff',
    labelOffset: 30,
    horizontalLength: 80,
    fontSize: 15,
    fadeOutDuration: 2000 // 2 second fade
};

// Space Stations - array with main station at index 0
let stations = [];

// Main Space Station template (first station in array will be dockable)
const createStation = (x, y, vx, vy, colorScheme, name, isDocked = false) => ({
    x,
    y,
    vx,
    vy,
    size: 100,  // Visual size of the station (increased from 60)
    dockingRange: 100,  // Gravity pull zone and visual circle range (increased from 60)
    isDocked,
    rotation: 0,
    rotationSpeed: 0.001,
    pullStrength: 0.25,
    colorScheme,
    name,
    vertices: []
});

// Station name presets (pop-culture references)
const STATION_NAMES = [
    // Star Trek
    'Deep Space 9',
    'Deep Space Station K-7',
    'Starbase 1',
    'Earth Spacedock',
    'Regula I',
    'Jupiter Station',
    
    // Star Wars
    'Yavin IV Station',
    'Cloud City',
    'The Wheel',
    'Bespin Mining Colony',
    'Polis Massa',
    
    // Babylon 5
    'Babylon 5',
    'Babylon 4',
    
    // The Expanse
    'Tycho Station',
    'Ceres Station',
    'Phoebe Station',
    'Ganymede Ag-Dome',
    
    // 2001: A Space Odyssey
    'Space Station V',
    'Clavius Base',
    
    // Interstellar
    'Cooper Station',
    'Endurance Dock',
    
    // Alien franchise
    'Gateway Station',
    'Sevastopol',
    'LV-426 Outpost',
    
    // Mass Effect
    'The Citadel',
    'Omega',
    'Arcturus Station',
    
    // Elysium
    'Elysium',
    
    // Firefly/Serenity
    'Persephone Eavesdown',
    'Osiris Station',
    
    // Doctor Who
    'Satellite Five',
    
    // Cowboy Bebop
    'Ganymede Waystation',
    
    // Dead Space
    'Titan Station',
    'Sprawl',
    
    // Halo
    'Cairo Station',
    'Anchor 9',
    
    // Portal
    'Aperture Station',
    
    // The Martian
    'Hermes Dock',
    
    // Moon (2009)
    'Sarang Station',
    
    // Other/Generic Sci-Fi
    'Stellar Cartography',
    'Nova Prime',
    'Helios One'
];

// Track recently used station names to avoid repetition
let recentStationNames = [];
const MAX_RECENT_NAMES = 15;

// Station color presets
const STATION_COLORS = [
    { name: 'Dark Red', primary: '#ff0000', secondary: '#880000', tertiary: '#aa0000', fill: '#330000' },
    { name: 'Cyan', primary: '#00ffff', secondary: '#0088aa', tertiary: '#00aacc', fill: '#003333' },
    { name: 'Green', primary: '#00ff00', secondary: '#008800', tertiary: '#00aa00', fill: '#003300' },
    { name: 'Purple', primary: '#ff00ff', secondary: '#880088', tertiary: '#aa00aa', fill: '#330033' },
    { name: 'Orange', primary: '#ff8800', secondary: '#aa5500', tertiary: '#cc6600', fill: '#332200' },
    { name: 'Yellow', primary: '#ffff00', secondary: '#aaaa00', tertiary: '#cccc00', fill: '#333300' },
    { name: 'Blue', primary: '#0088ff', secondary: '#0055aa', tertiary: '#0066cc', fill: '#002233' },
    { name: 'White', primary: '#ffffff', secondary: '#aaaaaa', tertiary: '#cccccc', fill: '#333333' }
];

// ================================
// INPUT HANDLING
// ================================

const keys = {};
const mouse = {
    x: 0,
    y: 0,
    worldX: 0,
    worldY: 0,
    down: false,
    dragStart: null
};

// Touch/Mobile
let isTouchDevice = false;
let touchActive = false;
let touchX = 0;
let touchY = 0;
let autoMiningEnabled = false; // Auto-mining toggle for touchscreen

// Time tracking
let currentDeltaTime = 16.67; // Store current frame's delta time for use in render functions

// Pinch zoom for touch devices
let lastTouchDistance = 0;
let isPinching = false;

// ================================
// EARLY INITIALIZATION (Before Boot Sequence)
// ================================

function detectInputMethod() {
    // Detect touch device
    isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    
    // Check for already-connected gamepads
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gamepadDetected = false;
    for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i]) {
            gamepadDetected = true;
            gamepadConnected = true;
            gamepadIndex = i;
            console.log('Gamepad already connected at startup:', gamepads[i].id);
            break;
        }
    }
    
    // Set initial input method for tutorial (priority: gamepad > touch > keyboard)
    if (gamepadDetected) {
        lastInputMethod = 'gamepad';
    } else if (isTouchDevice) {
        lastInputMethod = 'touch';
    } else {
        lastInputMethod = 'keyboard';
    }
    
    // Setup pause button visibility immediately
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
        pauseBtn.style.display = isTouchDevice ? 'flex' : 'none';
    }
    
    // Setup auto-mine button visibility immediately (touchscreen only)
    const autoMineBtn = document.getElementById('autoMineBtn');
    if (autoMineBtn) {
        autoMineBtn.style.display = isTouchDevice ? 'flex' : 'none';
    }
    
    console.log(`Input method detected: ${lastInputMethod}, isTouchDevice: ${isTouchDevice}`);
}

// ================================
// BOOT SEQUENCE
// ================================

let shipName = 'PROSPECTOR-1'; // Default name

function getBootMessages(includeNamePrompt = false, isDocked = true) {
    const messages = [
        "DEEP SPACE MINING SYSTEMS v2.3.1",
        "Copyright (c) 2385 Interstellar Resource Corp.",
        "",
        "Initializing ship systems...",
        "- Loading navigation protocols... OK",
        "- Calibrating mining laser array... OK",
        "- Establishing quantum uplink... OK",
        "- Scanning local asteroid field... OK",
        ""
    ];
    
    // Calculate actual percentages
    const hullPercent = Math.ceil((gameState.hull / gameState.maxHull) * 100);
    const fuelPercent = Math.ceil((gameState.fuel / gameState.maxFuel) * 100);
    const hullStatus = hullPercent >= 100 ? '100%' : hullPercent >= 75 ? `${hullPercent}% (GOOD)` : hullPercent >= 50 ? `${hullPercent}% (FAIR)` : hullPercent >= 25 ? `${hullPercent}% (DAMAGED)` : `${hullPercent}% (CRITICAL)`;
    const fuelStatus = fuelPercent >= 100 ? 'FULL' : fuelPercent >= 75 ? `${fuelPercent}% (HIGH)` : fuelPercent >= 50 ? `${fuelPercent}% (MODERATE)` : fuelPercent >= 25 ? `${fuelPercent}% (LOW)` : `${fuelPercent}% (CRITICAL)`;
    const sectorName = `ALPHA-${String(gameState.sector).padStart(3, '0')}`;
    
    // Calculate sector-based statistics
    const asteroidDensity = gameState.sector <= 2 ? 'LOW' : gameState.sector <= 4 ? 'MODERATE' : gameState.sector <= 6 ? 'HIGH' : gameState.sector <= 8 ? 'VERY HIGH' : 'EXTREME';
    const hazardLevel = gameState.sector <= 2 ? 'MINIMAL' : gameState.sector <= 4 ? 'LOW' : gameState.sector <= 6 ? 'MODERATE' : gameState.sector <= 8 ? 'HIGH' : 'CRITICAL';
    const resourceQuality = gameState.sector <= 2 ? 'STANDARD' : gameState.sector <= 4 ? 'IMPROVED' : gameState.sector <= 6 ? 'ENHANCED' : gameState.sector <= 8 ? 'SUPERIOR' : 'EXCEPTIONAL';
    
    if (includeNamePrompt) {
        messages.push(
            "VESSEL REGISTRATION:",
            "ERROR - VESSEL REGISTRATION MISSING",
            "Enter vessel designation: [INPUT]",
            "- Ship Class: Deep Space Mining Frigate",
            `- Hull Integrity: ${hullStatus}`,
            `- Fuel Reserves: ${fuelStatus}`,
            `- STATUS: ${isDocked ? 'DOCKED' : 'IN FLIGHT'}`,
            "",
        );
    } else {
        messages.push(
            "VESSEL IDENTIFICATION:",
            `- Ship Name: ${shipName}`,
            "- Class: Deep Space Mining Frigate",
            `- Hull Integrity: ${hullStatus}`,
            `- Fuel Reserves: ${fuelStatus}`,
            `- STATUS: ${isDocked ? 'DOCKED' : 'IN FLIGHT'}`,
            "",
            "SECTOR ANALYSIS:",
            `- Location: ${sectorName} (Mining Zone)`,
            `- Asteroid Density: ${asteroidDensity}`,
            `- Hazard Level: ${hazardLevel}`,
            `- Resource Quality: ${resourceQuality}`,
            ""
        );
        
        if (isDocked) {
            messages.push(
                "All systems nominal.",
                "Ready for deployment.",
                "",
                "Press any key or button to launch..."
            );
        } else {
            messages.push(
                "All systems nominal.",
                "Ship is currently in flight.",
                "",
                "Press any key or button to continue..."
            );
        }
    }
    
    return messages;
}

let bootLineIndex = 0;
let bootCharIndex = 0;
const bootSpeed = 5; // milliseconds per character
let bootMessages = [];
let awaitingNameInput = false;

function displayBootSequence() {
    const bootText = document.getElementById('bootText');
    const bootSequence = document.getElementById('bootSequence');
    
    // Check if ship name is saved
    const savedName = localStorage.getItem('asteroidMinerShipName');
    const isAnyStationDocked = stations.some(st => st.isDocked);
    
    if (savedName) {
        shipName = savedName;
        bootMessages = getBootMessages(false, isAnyStationDocked);
    } else {
        // First time - include name prompt in boot sequence
        bootMessages = getBootMessages(true, isAnyStationDocked);
    }
    
    function typeNextChar() {
        if (bootLineIndex < bootMessages.length) {
            const currentLine = bootMessages[bootLineIndex];
            
            // Check if this is the input line
            if (currentLine.includes('[INPUT]')) {
                const textBeforeInput = currentLine.replace('[INPUT]', '');
                
                // Animate the text up to [INPUT] character by character
                if (bootCharIndex < textBeforeInput.length) {
                    bootText.textContent += textBeforeInput[bootCharIndex];
                    bootCharIndex++;
                    setTimeout(typeNextChar, bootSpeed);
                } else {
                    // Text animation complete, now create the input field
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.maxLength = 20;
                    input.style.cssText = `
                        background: transparent;
                        border: none;
                        color: inherit;
                        font-family: 'Courier New', monospace;
                        font-size: 16px;
                        outline: none;
                        border-bottom: 2px solid currentColor;
                        padding: 2px 4px;
                        width: 220px;
                        animation: blink-caret 1s step-end infinite;
                    `;
                    input.placeholder = 'PROSPECTOR-1';
                    
                    bootText.appendChild(input);
                    
                    // Add instruction for gamepad users
                    const instruction = document.createElement('div');
                    instruction.style.cssText = `
                        color: inherit;
                        font-family: 'Courier New', monospace;
                        font-size: 12px;
                        margin-top: 10px;
                        opacity: 0.7;
                    `;
                    instruction.textContent = '(Press ENTER or gamepad A to confirm)';
                    bootText.appendChild(instruction);
                    
                    input.focus();
                    awaitingNameInput = true;
                    
                    // Function to continue boot with name
                    const continueWithName = (name) => {
                        if (!awaitingNameInput) return;
                        
                        awaitingNameInput = false;
                        name = name.trim().toUpperCase();
                        if (!name) name = 'PROSPECTOR-1';
                        
                        shipName = name;
                        localStorage.setItem('asteroidMinerShipName', shipName);
                        
                        // Replace input with the entered name and remove instruction
                        input.remove();
                        instruction.remove();
                        bootText.textContent += name;
                        bootText.textContent += '\n';
                        
                        bootLineIndex++;
                        bootCharIndex = 0;
                        
                        // Continue with rest of boot sequence
                        const hullPercent = Math.ceil((gameState.hull / gameState.maxHull) * 100);
                        const fuelPercent = Math.ceil((gameState.fuel / gameState.maxFuel) * 100);
                        const hullStatus = hullPercent >= 100 ? '100%' : hullPercent >= 75 ? `${hullPercent}% (GOOD)` : hullPercent >= 50 ? `${hullPercent}% (FAIR)` : hullPercent >= 25 ? `${hullPercent}% (DAMAGED)` : `${hullPercent}% (CRITICAL)`;
                        const fuelStatus = fuelPercent >= 100 ? 'FULL' : fuelPercent >= 75 ? `${fuelPercent}% (HIGH)` : fuelPercent >= 50 ? `${fuelPercent}% (MODERATE)` : fuelPercent >= 25 ? `${fuelPercent}% (LOW)` : `${fuelPercent}% (CRITICAL)`;
                        const sectorName = `ALPHA-${String(gameState.sector).padStart(3, '0')}`;
                        const asteroidDensity = gameState.sector <= 2 ? 'LOW' : gameState.sector <= 4 ? 'MODERATE' : gameState.sector <= 6 ? 'HIGH' : gameState.sector <= 8 ? 'VERY HIGH' : 'EXTREME';
                        const hazardLevel = gameState.sector <= 2 ? 'MINIMAL' : gameState.sector <= 4 ? 'LOW' : gameState.sector <= 6 ? 'MODERATE' : gameState.sector <= 8 ? 'HIGH' : 'CRITICAL';
                        const resourceQuality = gameState.sector <= 2 ? 'STANDARD' : gameState.sector <= 4 ? 'IMPROVED' : gameState.sector <= 6 ? 'ENHANCED' : gameState.sector <= 8 ? 'SUPERIOR' : 'EXCEPTIONAL';
                        const isDockedAtAny = stations.some(st => st.isDocked);
                        const statusText = isDockedAtAny ? 'DOCKED' : 'IN FLIGHT';
                        const readyText = isDockedAtAny 
                            ? ["All systems nominal.", "Ready for deployment.", "", "Press any key or button to launch..."]
                            : ["All systems nominal.", "Ship is currently in flight.", "", "Press any key or button to continue..."];
                        
                        bootMessages = [
                            ...bootMessages.slice(0, bootLineIndex),
                            "- Vessel registration confirmed.",
                            "",
                            "VESSEL IDENTIFICATION:",
                            `- Ship Name: ${shipName}`,
                            "- Class: Deep Space Mining Frigate",
                            `- Hull Integrity: ${hullStatus}`,
                            `- Fuel Reserves: ${fuelStatus}`,
                            `- STATUS: ${statusText}`,
                            "",
                            "SECTOR ANALYSIS:",
                            `- Location: ${sectorName} (Mining Zone)`,
                            `- Asteroid Density: ${asteroidDensity}`,
                            `- Hazard Level: ${hazardLevel}`,
                            `- Resource Quality: ${resourceQuality}`,
                            "",
                            ...readyText
                        ];
                        
                        setTimeout(typeNextChar, bootSpeed * 10);
                    };
                    
                    // Keyboard input handler
                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            continueWithName(input.value);
                        }
                    });
                    
                    // Gamepad handler - A button to use default name
                    let lastAButtonState = false;
                    const checkGamepadForNameInput = () => {
                        if (!awaitingNameInput) return;
                        
                        if (gamepadConnected && gamepadIndex !== null) {
                            const gamepads = navigator.getGamepads();
                            const gamepad = gamepads[gamepadIndex];
                            
                            if (gamepad) {
                                const aButton = gamepad.buttons[0] && gamepad.buttons[0].pressed;
                                const aButtonJustPressed = aButton && !lastAButtonState;
                                
                                if (aButtonJustPressed) {
                                    // Use current input value or default
                                    continueWithName(input.value || 'PROSPECTOR-1');
                                    return;
                                }
                                
                                lastAButtonState = aButton;
                            }
                        }
                        
                        requestAnimationFrame(checkGamepadForNameInput);
                    };
                    
                    requestAnimationFrame(checkGamepadForNameInput);
                }
            } else if (bootCharIndex < currentLine.length) {
                bootText.textContent += currentLine[bootCharIndex];
                bootCharIndex++;
                setTimeout(typeNextChar, bootSpeed);
            } else {
                bootText.textContent += '\n';
                bootLineIndex++;
                bootCharIndex = 0;
                setTimeout(typeNextChar, bootSpeed * 2);
            }
        } else if (!awaitingNameInput) {
            document.addEventListener('keydown', finishBoot, { once: true });
            document.addEventListener('click', finishBoot, { once: true });
            
            // Add gamepad support for finishing boot sequence
            const checkGamepadForBoot = () => {
                if (!gamepadConnected || gamepadIndex === null) {
                    requestAnimationFrame(checkGamepadForBoot);
                    return;
                }
                
                const gamepads = navigator.getGamepads();
                const gamepad = gamepads[gamepadIndex];
                
                if (gamepad) {
                    // Check if any button is pressed
                    const anyButtonPressed = gamepad.buttons.some(button => button.pressed);
                    
                    if (anyButtonPressed) {
                        // Remove listeners to prevent double-triggering
                        document.removeEventListener('keydown', finishBoot);
                        document.removeEventListener('click', finishBoot);
                        finishBoot();
                        return;
                    }
                }
                
                requestAnimationFrame(checkGamepadForBoot);
            };
            
            requestAnimationFrame(checkGamepadForBoot);
        }
    }
    
    typeNextChar();
}

function promptShipName() {
    const bootText = document.getElementById('bootText');
    bootText.textContent = "DEEP SPACE MINING SYSTEMS v2.3.1\n";
    bootText.textContent += "Copyright (c) 2385 Interstellar Resource Corp.\n\n";
    bootText.textContent += "VESSEL REGISTRATION REQUIRED\n\n";
    bootText.textContent += "Enter ship designation: ";
    
    // Create input element
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 20;
    input.style.cssText = `
        background: transparent;
        border: none;
        color: inherit;
        font-family: 'Courier New', monospace;
        font-size: 16px;
        outline: none;
        border-bottom: 2px solid currentColor;
        padding: 4px;
        width: 300px;
    `;
    input.placeholder = 'PROSPECTOR-1';
    
    bootText.appendChild(input);
    input.focus();
    
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            let name = input.value.trim().toUpperCase();
            if (!name) name = 'PROSPECTOR-1';
            
            shipName = name;
            localStorage.setItem('asteroidMinerShipName', shipName);
            
            // Clear and restart boot sequence
            bootText.textContent = '';
            bootLineIndex = 0;
            bootCharIndex = 0;
            bootMessages = getBootMessages();
            
            setTimeout(() => {
                displayBootSequence();
            }, 100);
        }
    });
}

function finishBoot() {
    const bootSequence = document.getElementById('bootSequence');
    bootSequence.classList.add('hidden');
    document.body.classList.remove('booting');
    
    setTimeout(() => {
        initGame();
    }, 100);
}

// Get a random station name that hasn't been used recently
function getRandomStationName() {
    // If we've used all names, clear the recent list (keep last 5)
    if (recentStationNames.length >= STATION_NAMES.length - 5) {
        recentStationNames = recentStationNames.slice(-5);
    }
    
    // Get available names (not in recent list)
    const availableNames = STATION_NAMES.filter(name => !recentStationNames.includes(name));
    
    // If somehow no names are available (shouldn't happen), clear recent list
    if (availableNames.length === 0) {
        recentStationNames = [];
        return STATION_NAMES[Math.floor(Math.random() * STATION_NAMES.length)];
    }
    
    // Pick a random name from available ones
    const selectedName = availableNames[Math.floor(Math.random() * availableNames.length)];
    
    // Add to recent list
    recentStationNames.push(selectedName);
    
    // Keep only last MAX_RECENT_NAMES entries
    if (recentStationNames.length > MAX_RECENT_NAMES) {
        recentStationNames.shift(); // Remove oldest
    }
    
    return selectedName;
}

// Initialize station state early (before boot sequence)
function initStationState() {
    // Clear existing stations
    stations = [];
    
    // Track used color indices to prevent duplicates
    const usedColorIndices = [];
    
    // Helper function to get a unique color index
    const getUniqueColorIndex = () => {
        let colorIndex;
        do {
            colorIndex = Math.floor(Math.random() * STATION_COLORS.length);
        } while (usedColorIndices.includes(colorIndex));
        usedColorIndices.push(colorIndex);
        return colorIndex;
    };
    
    // Create main station (always dockable)
    const margin = 500;
    const x = margin + Math.random() * (CONFIG.worldWidth - margin * 2);
    const y = margin + Math.random() * (CONFIG.worldHeight - margin * 2);
    
    const stationSpeed = 0.25;
    const randomAngle = Math.random() * Math.PI * 2;
    const vx = Math.cos(randomAngle) * stationSpeed;
    const vy = Math.sin(randomAngle) * stationSpeed;
    
    const colorIndex = getUniqueColorIndex();
    const colorScheme = STATION_COLORS[colorIndex];
    const name = getRandomStationName();
    const isDocked = Math.random() < 0.5;
    
    // Add main station
    stations.push(createStation(x, y, vx, vy, colorScheme, name, isDocked));
    
    // 33% chance to spawn a second station
    if (Math.random() < 0.33) {
        const x2 = margin + Math.random() * (CONFIG.worldWidth - margin * 2);
        const y2 = margin + Math.random() * (CONFIG.worldHeight - margin * 2);
        const randomAngle2 = Math.random() * Math.PI * 2;
        const vx2 = Math.cos(randomAngle2) * stationSpeed;
        const vy2 = Math.sin(randomAngle2) * stationSpeed;
        const colorIndex2 = getUniqueColorIndex();
        const colorScheme2 = STATION_COLORS[colorIndex2];
        const name2 = getRandomStationName();
        
        stations.push(createStation(x2, y2, vx2, vy2, colorScheme2, name2, false));
        logMessage(`Secondary station detected: ${name2}`);
        
        // If second station spawned, 33% chance for a third station
        if (Math.random() < 0.33) {
            const x3 = margin + Math.random() * (CONFIG.worldWidth - margin * 2);
            const y3 = margin + Math.random() * (CONFIG.worldHeight - margin * 2);
            const randomAngle3 = Math.random() * Math.PI * 2;
            const vx3 = Math.cos(randomAngle3) * stationSpeed;
            const vy3 = Math.sin(randomAngle3) * stationSpeed;
            const colorIndex3 = getUniqueColorIndex();
            const colorScheme3 = STATION_COLORS[colorIndex3];
            const name3 = getRandomStationName();
            
            stations.push(createStation(x3, y3, vx3, vy3, colorScheme3, name3, false));
            logMessage(`Tertiary station detected: ${name3}`);
        }
    }
}

// ================================
// THEME MANAGEMENT
// ================================

let currentTheme = 'mono';
const themes = ['green', 'amber', 'blue', 'red', 'mono'];
const themeNames = {
    'green': 'GREEN',
    'amber': 'AMBER',
    'blue': 'BLUE',
    'red': 'RED',
    'mono': 'MONO'
};

function initTheme() {
    const themeToggle = document.getElementById('themeToggle');
    const themeText = document.getElementById('themeText');
    
    themeToggle.addEventListener('click', () => {
        const currentIndex = themes.indexOf(currentTheme);
        const nextIndex = (currentIndex + 1) % themes.length;
        currentTheme = themes[nextIndex];
        
        themes.forEach(theme => {
            document.body.classList.remove(`theme-${theme}`);
        });
        
        if (currentTheme !== 'green') {
            document.body.classList.add(`theme-${currentTheme}`);
        }
        
        themeText.textContent = themeNames[currentTheme];
        localStorage.setItem('asteroidMinerTheme', currentTheme);
    });
    const savedTheme = localStorage.getItem('asteroidMinerTheme');
    if (savedTheme && themes.includes(savedTheme)) {
        currentTheme = savedTheme;
        if (currentTheme !== 'green') {
            document.body.classList.add(`theme-${currentTheme}`);
        }
        themeText.textContent = themeNames[currentTheme];
    } else {
        // Apply default mono theme on first load
        currentTheme = 'mono';
        document.body.classList.add('theme-mono');
        themeText.textContent = themeNames['mono'];
        localStorage.setItem('asteroidMinerTheme', 'mono');
    }
}

// ================================
// CRT EFFECT TOGGLE
// ================================

let crtEnabled = true; // Default to on

function initCRT() {
    const crtToggle = document.getElementById('crtToggle');
    
    crtToggle.addEventListener('click', () => {
        crtEnabled = !crtEnabled;
        document.body.classList.toggle('crt-mode', crtEnabled);
        crtToggle.querySelector('.btn-text').textContent = crtEnabled ? 'CRT: ON' : 'CRT: OFF';
        localStorage.setItem('asteroidMinerCRT', crtEnabled);
    });
    
    const savedCRT = localStorage.getItem('asteroidMinerCRT');
    if (savedCRT === 'false') {
        crtEnabled = false;
        document.body.classList.remove('crt-mode');
        crtToggle.querySelector('.btn-text').textContent = 'CRT: OFF';
    } else {
        // Default to on
        crtEnabled = true;
        document.body.classList.add('crt-mode');
        crtToggle.querySelector('.btn-text').textContent = 'CRT: ON';
    }
}

// ================================
// ================================
// CONSOLE LOGGING
// ================================

function logMessage(message, type = 'info') {
    const consoleContent = document.getElementById('consoleContent');
    const now = new Date();
    const timestamp = now.toTimeString().split(' ')[0];
    
    const line = document.createElement('div');
    line.className = 'console-line';
    
    const time = document.createElement('span');
    time.className = 'console-time';
    time.textContent = `[${timestamp}]`;
    
    const text = document.createElement('span');
    text.className = 'console-text';
    text.textContent = message;
    
    line.appendChild(time);
    line.appendChild(text);
    consoleContent.appendChild(line);
    
    consoleContent.scrollTop = consoleContent.scrollHeight;
    
    while (consoleContent.children.length > 100) {
        consoleContent.removeChild(consoleContent.firstChild);
    }
}

function clearConsole() {
    const consoleContent = document.getElementById('consoleContent');
    consoleContent.innerHTML = '';
    logMessage('Console cleared.');
}

// ================================
// CONSOLE COMMAND PROCESSING
// ================================

function processCommand(commandString) {
    // Log the user's command
    logMessage(`> ${commandString}`, 'command');
    
    // Parse the command
    const parts = commandString.trim().split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);
    
    // Process commands
    switch(command) {
        case 'sv_cheats':
            if (args.length === 0) {
                logMessage(`Error: sv_cheats requires a boolean value. Usage: sv_cheats <true|false>`, 'error');
                return;
            }
            
            const value = args[0].toLowerCase();
            if (value === 'true' || value === '1') {
                sv_cheats = true;
                logMessage('CHEAT ACCESS GRANTED - Developer commands unlocked', 'success');
            } else if (value === 'false' || value === '0') {
                sv_cheats = false;
                logMessage('CHEAT ACCESS REVOKED - Developer commands locked', 'info');
            } else {
                logMessage(`Error: "${args[0]}" is not a valid boolean (use true/false or 1/0)`, 'error');
            }
            break;
        
        case 'AddCredits':
            if (!sv_cheats) {
                logMessage('Error: This command requires sv_cheats to be enabled', 'error');
                return;
            }
            if (args.length === 0) {
                logMessage('Error: AddCredits requires a numerical value. Usage: AddCredits <amount>', 'error');
                return;
            }
            
            const amount = parseFloat(args[0]);
            if (isNaN(amount)) {
                logMessage(`Error: "${args[0]}" is not a valid number.`, 'error');
                return;
            }
            
            gameState.credits += amount;
            updateUI();
            logMessage(`Added ${amount} credits. New balance: ${gameState.credits.toFixed(2)} CR`, 'success');
            break;
            
        case 'GodMode':
            if (!sv_cheats) {
                logMessage('Error: This command requires sv_cheats to be enabled', 'error');
                return;
            }
            godModeActive = !godModeActive;
            if (godModeActive) {
                // Set hull and fuel to max
                gameState.hull = gameState.maxHull;
                gameState.fuel = gameState.maxFuel;
                updateUI();
                logMessage('GOD MODE ENABLED - Invincibility and unlimited fuel activated', 'success');
            } else {
                logMessage('GOD MODE DISABLED - Normal gameplay resumed', 'info');
            }
            break;
            
        case 'FPSToggle':
            fpsCounterEnabled = !fpsCounterEnabled;
            const fpsCounter = document.getElementById('fpsCounter');
            if (fpsCounterEnabled) {
                fpsCounter.style.display = 'inline';
                if (fpsWorkerReady && fpsWorker) {
                    fpsWorker.postMessage({ type: 'enable', timestamp: performance.now() });
                }
                logMessage('FPS COUNTER ENABLED', 'success');
            } else {
                fpsCounter.style.display = 'none';
                if (fpsWorkerReady && fpsWorker) {
                    fpsWorker.postMessage({ type: 'disable' });
                }
                logMessage('FPS COUNTER DISABLED', 'info');
            }
            break;
            
        case 'GoToStation':
            if (!sv_cheats) {
                logMessage('Error: This command requires sv_cheats to be enabled', 'error');
                return;
            }
            const nearestStation = findNearestStation();
            if (!nearestStation) {
                logMessage('Error: No station found in current sector', 'error');
                return;
            }
            
            // Teleport player to station location
            player.x = nearestStation.x;
            player.y = nearestStation.y;
            
            // Stop player movement
            player.vx = 0;
            player.vy = 0;
            
            // Update viewport to center on new position
            viewport.x = player.x - (VIEWPORT_REFERENCE.WIDTH / 2) / viewport.zoom;
            viewport.y = player.y - (VIEWPORT_REFERENCE.HEIGHT / 2) / viewport.zoom;
            
            // Cancel autopilot if active
            if (autoPilotActive) {
                autoPilotActive = false;
                updateNavigationButtonText();
            }
            
            logMessage(`Teleported to ${nearestStation.name}`, 'success');
            break;
            
        case 'Help':
            logMessage('Available commands:', 'info');
            if (sv_cheats) {
                logMessage('"sv_cheats <true|false>" - Toggle cheat access (ENABLED)', 'success');
                logMessage('"AddCredits <amount>" - Add credits to your account', 'info');
                logMessage('"GodMode" - Toggle invincibility and unlimited fuel', 'info');
                logMessage('"GoToStation" - Teleport to nearest space station', 'info');
            }
            logMessage('"FPSToggle" - Toggle FPS counter display', 'info');
            logMessage('"Help" - Show this help message', 'info');
            break;
            
        case '':
            // Empty command, do nothing
            break;
            
        default:
            logMessage(`Unknown command: "${command}". Type "Help" for available commands.`, 'error');
            break;
    }
}

function initConsoleInput() {
    const consoleInput = document.getElementById('consoleInput');
    if (!consoleInput) return;
    
    // Track when user is focused on console input
    consoleInput.addEventListener('focus', () => {
        isTypingInConsole = true;
    });
    
    consoleInput.addEventListener('blur', () => {
        isTypingInConsole = false;
    });
    
    consoleInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const command = consoleInput.value.trim();
            if (command) {
                processCommand(command);
                consoleInput.value = '';
            }
        }
        // Allow Escape to unfocus the input
        if (e.key === 'Escape') {
            consoleInput.blur();
        }
    });
}

// ================================
// CONTROLS HINT
// ================================

// Track last input method for automatic tutorial switching
let lastInputMethod = 'keyboard'; // 'keyboard', 'touch', or 'gamepad'

// Define control schemes for different devices
const controlSchemes = {
    keyboard: {
        title: '╔═ KEYBOARD CONTROLS ═╗',
        controls: [
            { key: 'W/A/S/D', desc: 'Move Ship' },
            { key: 'ARROW KEYS', desc: 'Alternative Movement' },
            { key: 'SPACE', desc: 'Mining Laser (Auto-targets)' },
            { key: 'E / Q', desc: 'Deep Space Scan' },
            { key: 'SCROLL', desc: 'Zoom In/Out' },
            { key: 'F5', desc: 'Quick Save' },
            { key: 'F9', desc: 'Quick Load' },
            { key: 'ESC', desc: 'Pause Menu' }
        ]
    },
    touch: {
        title: '╔═ TOUCH CONTROLS ═╗',
        controls: [
            { key: 'TAP CANVAS', desc: 'Move ship toward location' },
            { key: 'DRAG CANVAS', desc: 'Continuous movement control' },
            { key: 'PINCH', desc: 'Zoom In/Out' },
            { key: 'LASER BTN', desc: 'Toggle auto-mining (bottom-left)' },
            { key: 'TAP MINIMAP', desc: 'Trigger deep space scan' },
            { key: 'PAUSE BTN', desc: 'Access menu (top-right)' },
            { key: 'SIDE PANELS', desc: 'Swipe to access stats & upgrades' }
        ]
    },
    gamepad: {
        title: '╔═ CONTROLLER LAYOUT ═╗',
        controls: [
            { key: 'LEFT STICK', desc: 'Move Ship (Analog)' },
            { key: 'A / CROSS', desc: 'Mining Laser' },
            { key: 'B / CIRCLE', desc: 'Deep Space Scan' },
            { key: 'LB / L1', desc: 'Zoom Out' },
            { key: 'RB / R1', desc: 'Zoom In' },
            { key: 'D-PAD UP', desc: 'Toggle Autopilot' },
            { key: 'SELECT/BACK', desc: 'Virtual Mouse Mode' },
            { key: 'L-STICK (V-MOUSE)', desc: 'Move Cursor' },
            { key: 'R-STICK (V-MOUSE)', desc: 'Scroll Up/Down' },
            { key: 'D-PAD (V-MOUSE)', desc: 'Jump to Button' },
            { key: 'A (V-MOUSE)', desc: 'Click Button' },
            { key: 'HOLD L3 (2s)', desc: 'Quick Load' },
            { key: 'HOLD R3 (2s)', desc: 'Quick Save' },
            { key: 'START/OPTIONS', desc: 'Pause Menu' }
        ]
    }
};

function initControlsHint() {
    const controlsHint = document.getElementById('controlsHint');
    const closeHint = document.getElementById('closeHint');
    
    // Input method already detected in detectInputMethod() before boot sequence
    // Just render the controls with the correct scheme
    updateControlsHint();
    
    // Close button handler
    closeHint.addEventListener('click', () => {
        controlsHint.classList.add('hidden');
        localStorage.setItem('asteroidMinerHintClosed', 'true');
    });
    
    // Check if hint was previously closed
    const hintClosed = localStorage.getItem('asteroidMinerHintClosed');
    if (hintClosed === 'true') {
        controlsHint.classList.add('hidden');
    }
}

function updateControlsHint() {
    const controlsHint = document.getElementById('controlsHint');
    const closeHint = document.getElementById('closeHint');
    
    if (!controlsHint || !closeHint) return;
    
    // Get the appropriate scheme based on last input
    const scheme = controlSchemes[lastInputMethod];
    
    // Update title
    const hintTitle = controlsHint.querySelector('.hint-title');
    if (hintTitle) {
        hintTitle.textContent = scheme.title;
    }
    
    // Clear existing controls (keep only title and close button)
    const existingItems = controlsHint.querySelectorAll('.hint-item');
    existingItems.forEach(item => item.remove());
    
    // Create new control items
    scheme.controls.forEach(control => {
        const item = document.createElement('div');
        item.className = 'hint-item';
        item.innerHTML = `
            <span class="hint-key">${control.key}</span>
            <span class="hint-desc">${control.desc}</span>
        `;
        // Insert before the close button
        controlsHint.insertBefore(item, closeHint);
    });
}

function setInputMethod(method) {
    if (lastInputMethod !== method) {
        lastInputMethod = method;
        updateControlsHint();
    }
}

// Track if ship name is being edited (needs to be global so updateUI can check it)
let isEditingShipName = false;
let isTypingInConsole = false;

// Cheat access control
let sv_cheats = false;

// God mode state
let godModeActive = false;

// FPS counter state (now handled by worker)
let fpsCounterEnabled = false;

function initShipRename() {
    const shipNameEl = document.getElementById('shipName');
    
    shipNameEl.addEventListener('click', () => {
        if (isEditingShipName) return;
        
        isEditingShipName = true;
        const currentName = shipName;
        const originalContent = shipNameEl.textContent;
        
        // Create input field
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentName;
        input.maxLength = 20;
        input.className = 'ship-name-input';
        input.style.cssText = `
            background: rgba(0, 0, 0, 0.5);
            border: 1px solid var(--term-text);
            color: var(--term-text);
            font-family: 'Courier New', monospace;
            font-size: inherit;
            padding: 2px 4px;
            width: 140px;
            outline: none;
        `;
        
        // Create confirm button
        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = '✓';
        confirmBtn.className = 'ship-name-confirm';
        confirmBtn.style.cssText = `
            background: rgba(0, 255, 0, 0.2);
            border: 1px solid var(--term-text);
            color: var(--term-text);
            font-family: 'Courier New', monospace;
            font-size: inherit;
            padding: 2px 6px;
            margin-left: 4px;
            cursor: pointer;
            transition: all 0.2s ease;
        `;
        
        confirmBtn.addEventListener('mouseenter', () => {
            confirmBtn.style.background = 'rgba(0, 255, 0, 0.4)';
        });
        
        confirmBtn.addEventListener('mouseleave', () => {
            confirmBtn.style.background = 'rgba(0, 255, 0, 0.2)';
        });
        
        const applyName = () => {
            const newName = input.value.trim().toUpperCase();
            if (newName && newName !== '') {
                const sanitizedName = newName.substring(0, 20);
                shipName = sanitizedName;
                localStorage.setItem('asteroidMinerShipName', shipName);
                shipNameEl.textContent = shipName;
                logMessage(`Vessel renamed to: ${shipName}`);
            } else {
                shipNameEl.textContent = originalContent;
            }
            isEditingShipName = false;
            // Remove the outside click handler when applying
            document.removeEventListener('click', handleClickOutside);
        };
        
        const cancelEdit = () => {
            shipNameEl.textContent = originalContent;
            isEditingShipName = false;
            document.removeEventListener('click', handleClickOutside);
        };
        
        // Confirm button click
        confirmBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            applyName();
        });
        
        // Enter key to confirm
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                applyName();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
            }
        });
        
        // Click outside to cancel
        const handleClickOutside = (e) => {
            if (!shipNameEl.contains(e.target)) {
                cancelEdit();
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', handleClickOutside);
        }, 10);
        
        // Replace content with input and button
        shipNameEl.textContent = '';
        shipNameEl.appendChild(input);
        shipNameEl.appendChild(confirmBtn);
        
        // Focus input and select all
        input.focus();
        input.select();
    });
}

// ================================
// CUSTOM MODAL SYSTEM
// ================================

function showConfirm(title, message, onConfirm, onCancel) {
    const modal = document.getElementById('confirmModal');
    const titleEl = document.getElementById('confirmTitle');
    const messageEl = document.getElementById('confirmMessage');
    const yesBtn = document.getElementById('confirmYes');
    const noBtn = document.getElementById('confirmNo');
    
    titleEl.textContent = `╔════ ${title} ════╗`;
    messageEl.textContent = message;
    
    modal.classList.add('active');
    gameState.isPaused = true;
    
    const handleYes = () => {
        modal.classList.remove('active');
        gameState.isPaused = false;
        yesBtn.removeEventListener('click', handleYes);
        noBtn.removeEventListener('click', handleNo);
        if (onConfirm) onConfirm();
    };
    
    const handleNo = () => {
        modal.classList.remove('active');
        gameState.isPaused = false;
        yesBtn.removeEventListener('click', handleYes);
        noBtn.removeEventListener('click', handleNo);
        if (onCancel) onCancel();
    };
    
    yesBtn.addEventListener('click', handleYes);
    noBtn.addEventListener('click', handleNo);
}

function showAlert(title, message, onClose) {
    const modal = document.getElementById('alertModal');
    const titleEl = document.getElementById('alertTitle');
    const messageEl = document.getElementById('alertMessage');
    const okBtn = document.getElementById('alertOk');
    
    titleEl.textContent = `╔════ ${title} ════╗`;
    messageEl.textContent = message;
    
    modal.classList.add('active');
    gameState.isPaused = true;
    
    const handleClose = () => {
        modal.classList.remove('active');
        gameState.isPaused = false;
        okBtn.removeEventListener('click', handleClose);
        if (onClose) onClose();
    };
    
    okBtn.addEventListener('click', handleClose);
}

function showGameOver(credits, asteroids, sectors, distance, reason = 'damage') {
    const modal = document.getElementById('gameOverModal');
    
    document.getElementById('finalCredits').textContent = formatNumber(credits);
    document.getElementById('finalAsteroids').textContent = asteroids;
    document.getElementById('finalSectors').textContent = sectors;
    document.getElementById('finalDistance').textContent = formatNumber(Math.floor(distance));
    
    // Update game over message based on reason
    const messageEl = modal.querySelector('.game-over-message');
    if (reason === 'fuel') {
        messageEl.innerHTML = 'OUT OF FUEL - NO CREDITS FOR RESCUE<br>SHIP ADRIFT IN DEEP SPACE';
    } else {
        messageEl.innerHTML = 'CRITICAL DAMAGE SUSTAINED<br>SHIP DISABLED - RETURNING TO BASE';
    }
    
    modal.classList.add('active');
    
    // Check if any saves exist
    const loadBtn = document.getElementById('gameOverLoadSave');
    const latestSave = getLatestSaveName();
    
    if (latestSave) {
        loadBtn.style.display = 'block';
        const handleLoad = () => {
            loadBtn.removeEventListener('click', handleLoad);
            if (loadGame(latestSave)) {
                modal.classList.remove('active');
                gameState.isPaused = false;
                initGame();
            } else {
                showMessage('Failed to load save. Please try again or restart.');
            }
        };
        loadBtn.addEventListener('click', handleLoad);
    } else {
        loadBtn.style.display = 'none';
    }
    
    const restartBtn = document.getElementById('gameOverRestart');
    const handleRestart = () => {
        restartBtn.removeEventListener('click', handleRestart);
        
        // Clear all game-related localStorage except theme and CRT settings
        localStorage.removeItem('asteroidMinerShipName');
        localStorage.removeItem('asteroidMinerHintClosed');
        localStorage.removeItem('asteroidMinerSaves');
        
        location.reload();
    };
    
    restartBtn.addEventListener('click', handleRestart);
}

// Get the name of the most recently saved game (excluding AutoSave)
function getLatestSaveName() {
    try {
        const savesString = localStorage.getItem('asteroidMinerSaves') || '{}';
        const saves = JSON.parse(savesString);
        
        // Get all save names except AutoSave
        const saveNames = Object.keys(saves).filter(name => name !== 'AutoSave');
        
        if (saveNames.length === 0) {
            // No manual saves, check if AutoSave exists
            if (saves['AutoSave']) {
                return 'AutoSave';
            }
            return null;
        }
        
        // Find the most recent save by timestamp
        let latestName = saveNames[0];
        let latestTime = saves[latestName].timestamp || 0;
        
        for (let i = 1; i < saveNames.length; i++) {
            const name = saveNames[i];
            const time = saves[name].timestamp || 0;
            if (time > latestTime) {
                latestTime = time;
                latestName = name;
            }
        }
        
        return latestName;
    } catch (e) {
        console.error('Failed to get latest save:', e);
        return null;
    }
}

// ================================
// PAUSE MODAL
// ================================

function initPauseModal() {
    const pauseModal = document.getElementById('pauseModal');
    const resumeBtn = document.getElementById('resumeBtn');
    const restartBtn = document.getElementById('restartBtn');
    const tutorialBtn = document.getElementById('tutorialBtn');
    
    resumeBtn.addEventListener('click', () => {
        pauseModal.classList.remove('active');
        gameState.isPaused = false;
    });
    
    restartBtn.addEventListener('click', () => {
        pauseModal.classList.remove('active');
        showConfirm(
            'RESTART GAME',
            'Are you sure you want to restart?\n\n' +
            'WARNING: This will permanently delete:\n' +
            '• All saved games (QuickSave, AutoSave, etc.)\n' +
            '• Your current ship name\n' +
            '• Controls hint status\n' +
            '• All current progress\n\n' +
            'Theme and CRT settings will be preserved.\n\n' +
            'This action cannot be undone!',
            () => {
                // Clear all game-related localStorage except theme and CRT settings
                localStorage.removeItem('asteroidMinerShipName');
                localStorage.removeItem('asteroidMinerHintClosed');
                localStorage.removeItem('asteroidMinerSaves');
                
                // Reload the page to restart
                location.reload();
            },
            () => {
                pauseModal.classList.add('active');
            }
        );
    });
    
    tutorialBtn.addEventListener('click', () => {
        pauseModal.classList.remove('active');
        document.getElementById('controlsHint').classList.remove('hidden');
        gameState.isPaused = false;
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !document.body.classList.contains('booting')) {
            pauseModal.classList.toggle('active');
            gameState.isPaused = !gameState.isPaused;
        }
    });
    
    // Initialize save/load functionality
    initSaveLoad();
}

// ================================
// SHIP CUSTOMIZATION MODAL
// ================================

function initCustomization() {
    const applyBtn = document.getElementById('customizeApply');
    const cancelBtn = document.getElementById('customizeCancel');
    const presetButtons = document.querySelectorAll('.preset-btn');
    
    applyBtn.addEventListener('click', applyShipCustomization);
    cancelBtn.addEventListener('click', closeShipCustomization);
    
    // Add preset button handlers
    presetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const presetName = btn.dataset.preset;
            applyColorPreset(presetName);
        });
    });
    
    // Color swatch button handlers
    const swatchButtons = [
        'swatchPrimary',
        'swatchSecondary',
        'swatchAccent',
        'swatchThruster'
    ];
    
    swatchButtons.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', () => {
                const colorType = btn.dataset.colorType;
                openColorPicker(colorType);
            });
        }
    });
    
    // Color picker modal handlers
    const colorPickerClose = document.getElementById('colorPickerClose');
    if (colorPickerClose) {
        colorPickerClose.addEventListener('click', closeColorPicker);
    }
    
    // Custom hex input handler
    const applyCustomHex = document.getElementById('applyCustomHex');
    const customHexInput = document.getElementById('customHexInput');
    
    if (applyCustomHex && customHexInput) {
        applyCustomHex.addEventListener('click', () => {
            let hex = customHexInput.value.trim();
            // Add # if missing
            if (!hex.startsWith('#')) {
                hex = '#' + hex;
            }
            selectColor(hex);
        });
        
        // Also allow Enter key to apply
        customHexInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                let hex = customHexInput.value.trim();
                if (!hex.startsWith('#')) {
                    hex = '#' + hex;
                }
                selectColor(hex);
            }
        });
    }
}

// ================================
// SAVE/LOAD SYSTEM
// ================================

function saveGame(saveName) {
    // Only save essential data that can't be inferred
    const saveData = {
        version: '1.0',
        timestamp: Date.now(),
        shipName: shipName,
        gameState: {
            credits: gameState.credits,
            sector: gameState.sector,
            sectorName: gameState.sectorName,
            sectorsExplored: gameState.sectorsExplored,
            stats: {
                totalMined: gameState.stats.totalMined,
                distanceTraveled: gameState.stats.distanceTraveled,
                asteroidsDestroyed: gameState.stats.asteroidsDestroyed,
                hazardsAvoided: gameState.stats.hazardsAvoided,
                sectorsVisited: gameState.stats.sectorsVisited,
                playTime: gameState.stats.playTime
            }
        },
        player: {
            x: player.x,
            y: player.y,
            vx: player.vx,
            vy: player.vy,
            angle: player.angle,
            size: player.size,
            colors: {
                primary: player.colors.primary,
                secondary: player.colors.secondary,
                accent: player.colors.accent,
                thruster: player.colors.thruster
            }
            // Don't save isMining or miningTargets - runtime state
        },
        stations: stations.map(st => ({
            x: st.x,
            y: st.y,
            vx: st.vx,
            vy: st.vy,
            rotation: st.rotation,
            isDocked: st.isDocked,
            colorScheme: st.colorScheme,
            name: st.name,
            size: st.size,
            dockingRange: st.dockingRange,
            rotationSpeed: st.rotationSpeed,
            pullStrength: st.pullStrength
        })),
        upgrades: {
            // Upgrade values determine ship's visual appearance (thrusters, cargo pods, lasers, etc.)
            // Ship rendering in renderPlayer() reads these values to display upgrade decorations
            speed: gameState.upgrades.speed,
            cargo: gameState.upgrades.cargo,
            mining: gameState.upgrades.mining,
            hull: gameState.upgrades.hull,
            fuel: gameState.upgrades.fuel,
            range: gameState.upgrades.range,
            multiMining: gameState.upgrades.multiMining,
            advancedScanner: gameState.upgrades.advancedScanner,
            scanRange: gameState.upgrades.scanRange,
            scanCooldown: gameState.upgrades.scanCooldown,
            cargoDrone: gameState.upgrades.cargoDrone
        },
        resources: {
            hull: gameState.hull,
            fuel: gameState.fuel,
            cargo: gameState.cargo,
            inventory: {...gameState.inventory}
        },
        prestige: {
            level: gameState.prestige,
            bonus: gameState.prestigeBonus,
        },
        viewport: {
            zoom: viewport.zoom,
            targetZoom: viewport.targetZoom,
            // x and y will be recalculated based on player position
        },
        autoMiningEnabled: autoMiningEnabled, // Save auto-mining toggle state
        cargoDrone: cargoDrone ? {
            x: cargoDrone.x,
            y: cargoDrone.y,
            vx: cargoDrone.vx,
            vy: cargoDrone.vy,
            targetStation: cargoDrone.targetStation ? {
                name: cargoDrone.targetStation.name,
                x: cargoDrone.targetStation.x,
                y: cargoDrone.targetStation.y
            } : null,
            state: cargoDrone.state,
            cargo: cargoDrone.cargo,
            cargoAmount: cargoDrone.cargoAmount,
            credits: cargoDrone.credits,
            dockTime: cargoDrone.dockTime
        } : null,
        recentStationNames: recentStationNames,
        asteroids: asteroids.map(ast => ({
            x: ast.x,
            y: ast.y,
            vx: ast.vx,
            vy: ast.vy,
            radius: ast.radius,
            type: ast.type,
            health: ast.health,
            maxHealth: ast.maxHealth,
            value: ast.value,
            rotation: ast.rotation,
            rotationSpeed: ast.rotationSpeed,
            geometry: ast.geometry,
            originalGeometry: ast.originalGeometry
        })),
        hazards: hazards.map(haz => ({
            x: haz.x,
            y: haz.y,
            vx: haz.vx,
            vy: haz.vy,
            radius: haz.radius,
            type: haz.type,
            rotation: haz.rotation,
            rotationSpeed: haz.rotationSpeed
        }))
        // Don't save stars - will be regenerated (visual only, no gameplay impact)
        // Don't save UI state, particle effects, scanState, or other runtime data
    };
    
    try {
        const savesString = localStorage.getItem('asteroidMinerSaves') || '{}';
        let saves;
        
        try {
            saves = JSON.parse(savesString);
        } catch (parseError) {
            console.error('Failed to parse existing saves, starting fresh:', parseError);
            saves = {};
        }
        
        saves[saveName] = saveData;
        localStorage.setItem('asteroidMinerSaves', JSON.stringify(saves));
        
        // Also create/update AutoSave (except when saving to AutoSave itself to avoid recursion)
        if (saveName !== 'AutoSave') {
            saves['AutoSave'] = saveData;
            localStorage.setItem('asteroidMinerSaves', JSON.stringify(saves));
        }
        
        return true;
    } catch (e) {
        console.error('Failed to save game:', e);
        return false;
    }
}

function loadGame(saveName) {
    try {
        const savesString = localStorage.getItem('asteroidMinerSaves') || '{}';
        let saves;
        
        try {
            saves = JSON.parse(savesString);
        } catch (parseError) {
            console.error('Failed to parse save data, clearing corrupted saves:', parseError);
            localStorage.removeItem('asteroidMinerSaves');
            logMessage('ERROR: Save data corrupted. Cleared all saves.');
            return false;
        }
        
        const saveData = saves[saveName];
        
        if (!saveData) {
            console.error('Save not found:', saveName);
            return false;
        }
        
        // Restore ship name
        shipName = saveData.shipName || 'PROSPECTOR-1';
        
        // Restore game state
        gameState.credits = saveData.gameState.credits;
        gameState.sector = saveData.gameState.sector;
        gameState.sectorName = saveData.gameState.sectorName || `ALPHA-${String(saveData.gameState.sector).padStart(3, '0')}`;
        gameState.sectorsExplored = saveData.gameState.sectorsExplored || saveData.gameState.sector;
        
        // Restore stats (with fallbacks for older saves)
        if (saveData.gameState.stats) {
            gameState.stats.totalMined = saveData.gameState.stats.totalMined || 0;
            gameState.stats.distanceTraveled = saveData.gameState.stats.distanceTraveled || 0;
            gameState.stats.asteroidsDestroyed = saveData.gameState.stats.asteroidsDestroyed || 0;
            gameState.stats.hazardsAvoided = saveData.gameState.stats.hazardsAvoided || 0;
            gameState.stats.sectorsVisited = saveData.gameState.stats.sectorsVisited || 1;
            gameState.stats.playTime = saveData.gameState.stats.playTime || 0;
        }
        
        // Restore player
        player.x = saveData.player.x;
        player.y = saveData.player.y;
        player.vx = saveData.player.vx;
        player.vy = saveData.player.vy;
        player.angle = saveData.player.angle;
        player.size = saveData.player.size || 36;
        player.isMining = false;
        player.miningTargets = [];
        player.miningTarget = null;
        player.miningProgress = 0;
        player.isManuallyControlled = false;
        
        // Restore ship colors (with defaults if not present in save)
        if (saveData.player.colors) {
            player.colors.primary = saveData.player.colors.primary || '#e0e0e0';
            player.colors.secondary = saveData.player.colors.secondary || '#808080';
            player.colors.accent = saveData.player.colors.accent || '#c0c0c0';
            player.colors.thruster = saveData.player.colors.thruster || '#ff6600';
        }
        
        // Restore stations array
        if (saveData.stations && saveData.stations.length > 0) {
            // Load stations from save with full state restoration
            stations = saveData.stations.map(st => {
                const station = createStation(
                    st.x, st.y, st.vx, st.vy,
                    st.colorScheme || STATION_COLORS[2],
                    st.name || 'Deep Space 9',
                    st.isDocked || false
                );
                // Restore rotation state
                station.rotation = st.rotation || 0;
                station.rotationSpeed = st.rotationSpeed || 0.001;
                station.pullStrength = st.pullStrength || 0.25;
                station.size = st.size || 100;
                station.dockingRange = st.dockingRange || 100;
                return station;
            });
        } else if (saveData.station) {
            // Legacy save with single station - migrate to array
            const st = saveData.station;
            stations = [createStation(
                st.x, st.y, st.vx, st.vy,
                st.colorScheme || STATION_COLORS[2],
                st.name || 'Deep Space 9',
                st.isDocked || false
            )];
            stations[0].rotation = st.rotation || 0;
        } else {
            // No station data in save - generate new stations
            initStationState();
        }
        
        // Restore upgrades
        gameState.upgrades.speed = saveData.upgrades.speed;
        gameState.upgrades.cargo = saveData.upgrades.cargo;
        gameState.upgrades.mining = saveData.upgrades.mining;
        gameState.upgrades.hull = saveData.upgrades.hull;
        gameState.upgrades.fuel = saveData.upgrades.fuel;
        gameState.upgrades.range = saveData.upgrades.range;
        gameState.upgrades.multiMining = saveData.upgrades.multiMining;
        gameState.upgrades.advancedScanner = saveData.upgrades.advancedScanner || 0;
        gameState.upgrades.scanRange = saveData.upgrades.scanRange || 1;
        gameState.upgrades.scanCooldown = saveData.upgrades.scanCooldown || 1;
        gameState.upgrades.cargoDrone = saveData.upgrades.cargoDrone || 0;
        
        // Recalculate max values based on upgrades
        gameState.maxCargo = 100 + (gameState.upgrades.cargo - 1) * 50;
        gameState.maxHull = 100 + (gameState.upgrades.hull - 1) * 25;
        gameState.maxFuel = 100 + (gameState.upgrades.fuel - 1) * 20;
        
        // Restore resources
        gameState.hull = saveData.resources.hull;
        gameState.fuel = saveData.resources.fuel;
        gameState.cargo = saveData.resources.cargo;
        gameState.inventory = {...saveData.resources.inventory};
        
        // Restore prestige
        gameState.prestige = saveData.prestige.level;
        gameState.prestigeBonus = saveData.prestige.bonus;
        
        // Restore viewport with both zoom and targetZoom
        viewport.zoom = saveData.viewport.zoom || 1.5;
        viewport.targetZoom = saveData.viewport.targetZoom || saveData.viewport.zoom || 1.5;
        viewport.x = player.x - (VIEWPORT_REFERENCE.WIDTH / 2) / viewport.zoom;
        viewport.y = player.y - (VIEWPORT_REFERENCE.HEIGHT / 2) / viewport.zoom;
        
        // Restore auto-mining toggle state
        if (saveData.autoMiningEnabled !== undefined) {
            autoMiningEnabled = saveData.autoMiningEnabled;
            updateAutoMineButton();
        }
        
        // Restore cargo drone if it was active
        if (saveData.cargoDrone) {
            const droneData = saveData.cargoDrone;
            // Find the target station by name
            const targetStation = droneData.targetStation ? 
                stations.find(st => st.name === droneData.targetStation.name && 
                               Math.abs(st.x - droneData.targetStation.x) < 10 && 
                               Math.abs(st.y - droneData.targetStation.y) < 10) : null;
            
            cargoDrone = {
                x: droneData.x,
                y: droneData.y,
                vx: droneData.vx,
                vy: droneData.vy,
                targetStation: targetStation || stations[0], // Fallback to first station if not found
                state: droneData.state || 'traveling',
                cargo: droneData.cargo || {},
                cargoAmount: droneData.cargoAmount || 0,
                credits: droneData.credits || 0,
                dockTime: droneData.dockTime || 0,
                dockDuration: 1000,
                size: 15,
                speed: 3.5
            };
        } else {
            cargoDrone = null;
        }
        
        // Restore recent station names
        recentStationNames = saveData.recentStationNames || [];
        
        // Reset fuel warnings
        fuelWarnings.warning50.triggered = false;
        fuelWarnings.warning50.timestamp = 0;
        fuelWarnings.warning25.triggered = false;
        fuelWarnings.warning25.timestamp = 0;
        
        // Reset scan state to defaults
        scanState.active = false;
        scanState.waveRadius = 0;
        scanState.detectedItems = [];
        scanState.startTime = 0;
        scanState.cooldown = 0;
        
        // Regenerate stars (visual only)
        generateStars();
        
        // Restore asteroids and hazards if saved, otherwise generate new ones
        if (saveData.asteroids && saveData.hazards) {
            asteroids = saveData.asteroids.map(ast => ({
                x: ast.x,
                y: ast.y,
                vx: ast.vx,
                vy: ast.vy,
                radius: ast.radius,
                type: ast.type,
                health: ast.health,
                maxHealth: ast.maxHealth,
                value: ast.value,
                rotation: ast.rotation,
                rotationSpeed: ast.rotationSpeed,
                geometry: ast.geometry,
                originalGeometry: ast.originalGeometry
            }));
            
            hazards = saveData.hazards.map(haz => ({
                x: haz.x,
                y: haz.y,
                vx: haz.vx,
                vy: haz.vy,
                radius: haz.radius,
                type: haz.type,
                rotation: haz.rotation,
                rotationSpeed: haz.rotationSpeed
            }));
        } else {
            // Old save format or missing data - generate new sector
            generateSector();
        }
        
        // Clear particles and floating text (runtime visual effects)
        particles = [];
        floatingText = [];
        
        // Reset game flags
        gameState.isPaused = false;
        gameState.isAtStation = false;
        
        // Update UI
        updateUI();
        
        return true;
    } catch (e) {
        console.error('Failed to load game:', e);
        return false;
    }
}

function loadGameData(saveName) {
    // Load game data without regenerating world or updating UI
    // Used for auto-loading before boot sequence
    try {
        const savesString = localStorage.getItem('asteroidMinerSaves') || '{}';
        let saves;
        
        try {
            saves = JSON.parse(savesString);
        } catch (parseError) {
            console.error('Failed to parse save data, clearing corrupted saves:', parseError);
            localStorage.removeItem('asteroidMinerSaves');
            return false;
        }
        
        const saveData = saves[saveName];
        
        if (!saveData) {
            return false;
        }
        
        // Restore ship name
        shipName = saveData.shipName || 'PROSPECTOR-1';
        
        // Restore game state
        gameState.credits = saveData.gameState.credits;
        gameState.sector = saveData.gameState.sector;
        gameState.sectorName = saveData.gameState.sectorName || `ALPHA-${String(saveData.gameState.sector).padStart(3, '0')}`;
        gameState.sectorsExplored = saveData.gameState.sectorsExplored || saveData.gameState.sector;
        
        // Restore stats (with fallbacks for older saves)
        if (saveData.gameState.stats) {
            gameState.stats.totalMined = saveData.gameState.stats.totalMined || 0;
            gameState.stats.distanceTraveled = saveData.gameState.stats.distanceTraveled || 0;
            gameState.stats.asteroidsDestroyed = saveData.gameState.stats.asteroidsDestroyed || 0;
            gameState.stats.hazardsAvoided = saveData.gameState.stats.hazardsAvoided || 0;
            gameState.stats.sectorsVisited = saveData.gameState.stats.sectorsVisited || 1;
            gameState.stats.playTime = saveData.gameState.stats.playTime || 0;
        }
        
        // Restore player
        player.x = saveData.player.x;
        player.y = saveData.player.y;
        player.vx = saveData.player.vx;
        player.vy = saveData.player.vy;
        player.angle = saveData.player.angle;
        player.size = saveData.player.size || 36;
        
        // Restore ship colors (with defaults if not present in save)
        if (saveData.player.colors) {
            player.colors.primary = saveData.player.colors.primary || '#e0e0e0';
            player.colors.secondary = saveData.player.colors.secondary || '#808080';
            player.colors.accent = saveData.player.colors.accent || '#c0c0c0';
            player.colors.thruster = saveData.player.colors.thruster || '#ff6600';
        }
        
        // Restore stations array
        if (saveData.stations && saveData.stations.length > 0) {
            // Load stations from save
            stations = saveData.stations.map(st => {
                const station = createStation(
                    st.x, st.y, st.vx, st.vy,
                    st.colorScheme || STATION_COLORS[2],
                    st.name || 'Deep Space 9',
                    st.isDocked || false
                );
                station.rotation = st.rotation || 0;
                station.rotationSpeed = st.rotationSpeed || 0.001;
                station.pullStrength = st.pullStrength || 0.25;
                station.size = st.size || 100;
                station.dockingRange = st.dockingRange || 100;
                return station;
            });
        } else if (saveData.station) {
            // Legacy save with single station - migrate to array
            stations = [createStation(
                saveData.station.x,
                saveData.station.y,
                saveData.station.vx,
                saveData.station.vy,
                saveData.station.colorScheme || STATION_COLORS[2],
                saveData.station.name || 'Deep Space 9',
                saveData.station.isDocked || false
            )];
            stations[0].rotation = saveData.station.rotation || 0;
        } else {
            // No station data in save - create a default one
            initStationState();
        }
        
        // Restore upgrades
        gameState.upgrades.speed = saveData.upgrades.speed;
        gameState.upgrades.cargo = saveData.upgrades.cargo;
        gameState.upgrades.mining = saveData.upgrades.mining;
        gameState.upgrades.hull = saveData.upgrades.hull;
        gameState.upgrades.fuel = saveData.upgrades.fuel;
        gameState.upgrades.range = saveData.upgrades.range;
        gameState.upgrades.multiMining = saveData.upgrades.multiMining;
        gameState.upgrades.advancedScanner = saveData.upgrades.advancedScanner || 0;
        gameState.upgrades.scanRange = saveData.upgrades.scanRange || 1;
        gameState.upgrades.scanCooldown = saveData.upgrades.scanCooldown || 1;
        gameState.upgrades.cargoDrone = saveData.upgrades.cargoDrone || 0;
        
        // Recalculate max values based on upgrades
        gameState.maxCargo = 100 + (gameState.upgrades.cargo - 1) * 50;
        gameState.maxHull = 100 + (gameState.upgrades.hull - 1) * 25;
        gameState.maxFuel = 100 + (gameState.upgrades.fuel - 1) * 20;
        
        // Restore resources
        gameState.hull = saveData.resources.hull;
        gameState.fuel = saveData.resources.fuel;
        gameState.cargo = saveData.resources.cargo;
        gameState.inventory = {...saveData.resources.inventory};
        
        // Restore prestige
        gameState.prestige = saveData.prestige.level;
        gameState.prestigeBonus = saveData.prestige.bonus;
        
        // Restore viewport with both zoom and targetZoom
        viewport.zoom = saveData.viewport.zoom || 1.5;
        viewport.targetZoom = saveData.viewport.targetZoom || saveData.viewport.zoom || 1.5;
        
        // Restore cargo drone if it was active
        if (saveData.cargoDrone) {
            const droneData = saveData.cargoDrone;
            const targetStation = droneData.targetStation ? 
                stations.find(st => st.name === droneData.targetStation.name) : null;
            
            cargoDrone = {
                x: droneData.x,
                y: droneData.y,
                vx: droneData.vx,
                vy: droneData.vy,
                targetStation: targetStation || stations[0],
                state: droneData.state || 'traveling',
                cargo: droneData.cargo || {},
                cargoAmount: droneData.cargoAmount || 0,
                credits: droneData.credits || 0,
                dockTime: droneData.dockTime || 0,
                dockDuration: 1000,
                size: 15,
                speed: 3.5
            };
        } else {
            cargoDrone = null;
        }
        
        // Restore recent station names
        recentStationNames = saveData.recentStationNames || [];
        
        // Restore asteroids and hazards if saved
        if (saveData.asteroids && saveData.hazards) {
            asteroids = saveData.asteroids.map(ast => ({
                x: ast.x,
                y: ast.y,
                vx: ast.vx,
                vy: ast.vy,
                radius: ast.radius,
                type: ast.type,
                health: ast.health,
                maxHealth: ast.maxHealth,
                value: ast.value,
                rotation: ast.rotation,
                rotationSpeed: ast.rotationSpeed,
                geometry: ast.geometry,
                originalGeometry: ast.originalGeometry
            }));
            
            hazards = saveData.hazards.map(haz => ({
                x: haz.x,
                y: haz.y,
                vx: haz.vx,
                vy: haz.vy,
                radius: haz.radius,
                type: haz.type,
                rotation: haz.rotation,
                rotationSpeed: haz.rotationSpeed
            }));
        }
        // If no asteroids/hazards in save, they'll be generated later in initGame
        
        return true;
    } catch (e) {
        console.error('Failed to load game data:', e);
        return false;
    }
}

function deleteSave(saveName) {
    try {
        const savesString = localStorage.getItem('asteroidMinerSaves') || '{}';
        let saves;
        
        try {
            saves = JSON.parse(savesString);
        } catch (parseError) {
            console.error('Failed to parse save data, clearing corrupted saves:', parseError);
            localStorage.removeItem('asteroidMinerSaves');
            return false;
        }
        
        delete saves[saveName];
        localStorage.setItem('asteroidMinerSaves', JSON.stringify(saves));
        return true;
    } catch (e) {
        console.error('Failed to delete save:', e);
        return false;
    }
}

function getSaveList() {
    try {
        const savesString = localStorage.getItem('asteroidMinerSaves') || '{}';
        let saves;
        
        try {
            saves = JSON.parse(savesString);
        } catch (parseError) {
            console.error('Failed to parse save data, clearing corrupted saves:', parseError);
            localStorage.removeItem('asteroidMinerSaves');
            return [];
        }
        
        return Object.keys(saves).map(name => ({
            name,
            ...saves[name]
        }));
    } catch (e) {
        console.error('Failed to get save list:', e);
        return [];
    }
}

function refreshSaveList() {
    const saveList = document.getElementById('saveList');
    const saves = getSaveList();
    
    if (saves.length === 0) {
        saveList.innerHTML = '<div class="info-text dim">No saved games</div>';
        return;
    }
    
    saveList.innerHTML = saves.map(save => {
        const date = new Date(save.timestamp);
        const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        return `
            <div class="save-item">
                <div class="save-item-info">
                    <div class="save-item-name">${save.name}</div>
                    <div class="save-item-details">
                        Sector ${save.gameState.sector} | ${save.gameState.credits}¢ | ${dateStr}
                    </div>
                </div>
                <div class="save-item-buttons">
                    <button class="save-item-btn" onclick="loadSaveFromList('${save.name}')">LOAD</button>
                    <button class="save-item-btn delete" onclick="deleteSaveFromList('${save.name}')">DEL</button>
                </div>
            </div>
        `;
    }).join('');
}

window.loadSaveFromList = function(saveName) {
    if (loadGame(saveName)) {
        document.getElementById('pauseModal').classList.remove('active');
        gameState.isPaused = false;
        showSaveMessage('Game loaded successfully!', 'success');
    } else {
        showSaveMessage('Failed to load game', 'error');
    }
};

window.deleteSaveFromList = function(saveName) {
    showConfirm(
        'DELETE SAVE',
        `Are you sure you want to delete "${saveName}"?\n\nThis cannot be undone.`,
        () => {
            if (deleteSave(saveName)) {
                refreshSaveList();
                showSaveMessage('Save deleted', 'success');
            } else {
                showSaveMessage('Failed to delete save', 'error');
            }
        }
    );
};

function showSaveMessage(message, type = '') {
    const messageEl = document.getElementById('saveMessage');
    messageEl.textContent = message;
    messageEl.className = 'save-message ' + type;
    setTimeout(() => {
        messageEl.textContent = '';
        messageEl.className = 'save-message';
    }, 3000);
}

function initSaveLoad() {
    // Save Game button
    document.getElementById('saveGameBtn').addEventListener('click', () => {
        const saveName = document.getElementById('saveName').value.trim();
        
        if (!saveName) {
            showSaveMessage('Please enter a save name', 'error');
            return;
        }
        
        // Check if save already exists
        const saves = getSaveList();
        const existingSave = saves.find(s => s.name === saveName);
        
        if (existingSave) {
            showConfirm(
                'OVERWRITE SAVE',
                `A save named "${saveName}" already exists.\n\nDo you want to overwrite it?`,
                () => {
                    if (saveGame(saveName)) {
                        showSaveMessage('Game saved successfully!', 'success');
                        document.getElementById('saveName').value = '';
                        refreshSaveList();
                    } else {
                        showSaveMessage('Failed to save game', 'error');
                    }
                }
            );
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
    
    // Quick Save button
    document.getElementById('quickSaveBtn').addEventListener('click', () => {
        if (saveGame('QuickSave')) {
            showSaveMessage('Quick save successful!', 'success');
            refreshSaveList();
        } else {
            showSaveMessage('Quick save failed', 'error');
        }
    });
    
    // Quick Load button
    document.getElementById('quickLoadBtn').addEventListener('click', () => {
        if (loadGame('QuickSave')) {
            document.getElementById('pauseModal').classList.remove('active');
            gameState.isPaused = false;
            showSaveMessage('Quick load successful!', 'success');
        } else {
            showSaveMessage('No quick save found', 'error');
        }
    });
    
    // Export Saves button
    document.getElementById('exportSaveBtn').addEventListener('click', () => {
        try {
            const saves = localStorage.getItem('asteroidMinerSaves') || '{}';
            const blob = new Blob([saves], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `asteroid-miner-saves-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showSaveMessage('Saves exported successfully!', 'success');
        } catch (e) {
            console.error('Failed to export saves:', e);
            showSaveMessage('Failed to export saves', 'error');
        }
    });
    
    // Import Saves button
    document.getElementById('importSaveBtn').addEventListener('click', () => {
        document.getElementById('importFileInput').click();
    });
    
    document.getElementById('importFileInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedData = JSON.parse(event.target.result);
                localStorage.setItem('asteroidMinerSaves', JSON.stringify(importedData));
                refreshSaveList();
                showSaveMessage('Saves imported successfully!', 'success');
            } catch (error) {
                console.error('Failed to import saves:', error);
                showSaveMessage('Failed to import saves', 'error');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    });
    
    // Refresh save list when pause menu opens
    const pauseModal = document.getElementById('pauseModal');
    const observer = new MutationObserver(() => {
        if (pauseModal.classList.contains('active')) {
            refreshSaveList();
        }
    });
    observer.observe(pauseModal, { attributes: true, attributeFilter: ['class'] });
}

// ================================
// CANVAS SETUP
// ================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const minimapCanvas = document.getElementById('minimapCanvas');
const minimapCtx = minimapCanvas.getContext('2d');

// Phosphor decay layer for CRT effect
const phosphorCanvas = document.createElement('canvas');
const phosphorCtx = phosphorCanvas.getContext('2d');
phosphorCanvas.width = canvas.width;
phosphorCanvas.height = canvas.height;

// Clean frame buffer for saturation boost (untouched by phosphor)
const cleanFrameCanvas = document.createElement('canvas');
const cleanFrameCtx = cleanFrameCanvas.getContext('2d');
cleanFrameCanvas.width = canvas.width;
cleanFrameCanvas.height = canvas.height;

function resizeCanvas() {
    const canvasContainer = canvas.parentElement; // .canvas-container
    const centerPanel = document.querySelector('.center-panel');
    const containerWidth = canvasContainer.clientWidth;
    const containerHeight = canvasContainer.clientHeight;
    
    const aspectRatio = 4 / 3;
    
    const oldWidth = canvas.width;
    const oldHeight = canvas.height;
    
    if (containerWidth / containerHeight > aspectRatio) {
        // Height-constrained: fill height, adjust width to maintain aspect ratio
        canvas.height = containerHeight;
        canvas.width = canvas.height * aspectRatio;
        
        // Reset heights - let flex containers expand naturally
        canvasContainer.style.height = '';
        if (centerPanel) {
            centerPanel.style.height = '';
            centerPanel.classList.remove('width-constrained');
        }
    } else {
        // Width-constrained: fill width, adjust height to maintain aspect ratio
        canvas.width = containerWidth;
        canvas.height = canvas.width / aspectRatio;
        
        // Set explicit height on canvas-container only (not center-panel)
        // This allows the console-messages below to remain visible
        canvasContainer.style.height = canvas.height + 'px';
        if (centerPanel) {
            // Don't set height on center-panel - let it fill the screen
            // The canvas-container height constraint is sufficient
            centerPanel.style.height = '';
            centerPanel.classList.add('width-constrained');
        }
    }
    
    // Calculate scale factor to maintain consistent viewport across all screen sizes
    // This ensures the game always shows the same amount of world space
    const scaleX = canvas.width / VIEWPORT_REFERENCE.WIDTH;
    const scaleY = canvas.height / VIEWPORT_REFERENCE.HEIGHT;
    const canvasScale = Math.min(scaleX, scaleY);
    
    // Store the scale for use in rendering
    canvas.renderScale = canvasScale;
    
    // Resize phosphor decay canvas to match main canvas
    phosphorCanvas.width = canvas.width;
    phosphorCanvas.height = canvas.height;
    
    // Resize clean frame canvas to match main canvas
    cleanFrameCanvas.width = canvas.width;
    cleanFrameCanvas.height = canvas.height;
    
    // Update viewport if canvas size changed and player exists
    if (player && (oldWidth !== canvas.width || oldHeight !== canvas.height)) {
        viewport.x = player.x - (VIEWPORT_REFERENCE.WIDTH / 2) / viewport.zoom;
        viewport.y = player.y - (VIEWPORT_REFERENCE.HEIGHT / 2) / viewport.zoom;
    }
}

// ================================
// INPUT LISTENERS
// ================================

function initInput() {
    // Keyboard
    document.addEventListener('keydown', (e) => {
        // Don't process game input while editing ship name or typing in console
        if (isEditingShipName || isTypingInConsole) {
            return;
        }
        
        // Prevent default browser behaviors for game keys
        if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || 
            e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Tab') {
            e.preventDefault();
        }
        
        // Track keyboard input
        setInputMethod('keyboard');
        
        keys[e.key.toLowerCase()] = true;
        
        // Quick actions
        if (e.key === ' ') {
            keys['space'] = true;
        }
        
        // Scan function (E or Q key)
        if ((e.key.toLowerCase() === 'e' || e.key.toLowerCase() === 'q') && !gameState.isPaused) {
            triggerScan();
        }
        
        // Quick Save (F5)
        if (e.key === 'F5') {
            e.preventDefault();
            if (saveGame('QuickSave')) {
                showSaveMessage('Quick save successful!', 'success');
                refreshSaveList();
            } else {
                showSaveMessage('Quick save failed', 'error');
            }
        }
        
        // Quick Load (F9)
        if (e.key === 'F9') {
            e.preventDefault();
            if (loadGame('QuickSave')) {
                showSaveMessage('Quick load successful!', 'success');
            } else {
                showSaveMessage('No quick save found', 'error');
            }
        }
    });
    
    document.addEventListener('keyup', (e) => {
        // Don't process game input while editing ship name or typing in console
        if (isEditingShipName || isTypingInConsole) {
            return;
        }
        
        keys[e.key.toLowerCase()] = false;
        if (e.key === ' ') {
            keys['space'] = false;
        }
    });
    
    // Mouse
    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
        
        // Convert to world coordinates
        mouse.worldX = (mouse.x / viewport.zoom) + viewport.x;
        mouse.worldY = (mouse.y / viewport.zoom) + viewport.y;
        
        // Mouse drag camera disabled
        // if (mouse.down && mouse.dragStart) {
        //     const dx = e.clientX - mouse.dragStart.x;
        //     const dy = e.clientY - mouse.dragStart.y;
        //     viewport.x -= dx / viewport.zoom;
        //     viewport.y -= dy / viewport.zoom;
        //     mouse.dragStart = { x: e.clientX, y: e.clientY };
        // }
    });
    
    canvas.addEventListener('mousedown', (e) => {
        mouse.down = true;
        // Mouse drag disabled
        // mouse.dragStart = { x: e.clientX, y: e.clientY };
    });
    
    canvas.addEventListener('mouseup', () => {
        mouse.down = false;
        // Mouse drag disabled
        // mouse.dragStart = null;
    });
    
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        
        // Update target zoom instead of direct zoom
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        viewport.targetZoom = Math.max(viewport.minZoom, Math.min(viewport.maxZoom, viewport.targetZoom * zoomFactor));
    });
    
    // Touch controls for mobile
    initTouchControls();
}

function initTouchControls() {
    // Touch detection and pause button setup already done in detectInputMethod()
    // Just need to setup the pause button event listener here
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn && !pauseBtn.hasAttribute('data-listener-added')) {
        pauseBtn.addEventListener('click', () => {
            const pauseModal = document.getElementById('pauseModal');
            pauseModal.classList.add('active');
            gameState.isPaused = true;
        });
        pauseBtn.setAttribute('data-listener-added', 'true');
    }
    
    // Setup auto-mining button for touch devices
    const autoMineBtn = document.getElementById('autoMineBtn');
    if (autoMineBtn && !autoMineBtn.hasAttribute('data-listener-added')) {
        autoMineBtn.addEventListener('click', () => {
            autoMiningEnabled = !autoMiningEnabled;
            updateAutoMineButton();
        });
        autoMineBtn.setAttribute('data-listener-added', 'true');
    }
    
    if (!isTouchDevice) return;
    
    console.log('Setting up touch controls for canvas joystick');
    
    // Auto-blur buttons and links after they're clicked on touch devices
    document.addEventListener('click', (e) => {
        // Check if the clicked element or its parent is a button or anchor
        let element = null;
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') {
            element = e.target;
        } else if (e.target.closest('button')) {
            element = e.target.closest('button');
        } else if (e.target.closest('a')) {
            element = e.target.closest('a');
        }
        
        if (element) {
            // Use setTimeout to ensure the click completes before blurring
            setTimeout(() => {
                element.blur();
            }, 10);
        }
    }, true); // Use capture phase to catch all clicks
    
    // Helper function to calculate distance between two touches
    function getTouchDistance(touch1, touch2) {
        const dx = touch2.clientX - touch1.clientX;
        const dy = touch2.clientY - touch1.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    // Use the entire canvas as a directional joystick
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        
        // Track touch input
        setInputMethod('touch');
        
        if (e.touches.length === 2) {
            // Two fingers - start pinch zoom
            isPinching = true;
            touchActive = false; // Disable movement when pinching
            lastTouchDistance = getTouchDistance(e.touches[0], e.touches[1]);
        } else if (e.touches.length === 1) {
            // One finger - movement
            isPinching = false;
            touchActive = true;
            const touch = e.touches[0];
            const rect = canvas.getBoundingClientRect();
            
            // Convert touch coordinates to VIEWPORT_REFERENCE coordinate space
            // Touch is in canvas pixels, we need to map it to the viewport reference dimensions
            const canvasX = touch.clientX - rect.left;
            const canvasY = touch.clientY - rect.top;
            
            // Map from canvas pixels to viewport reference space
            // The canvas may be larger/smaller than VIEWPORT_REFERENCE due to aspect ratio
            touchX = (canvasX / rect.width) * VIEWPORT_REFERENCE.WIDTH;
            touchY = (canvasY / rect.height) * VIEWPORT_REFERENCE.HEIGHT;
        }
    }, { passive: false });
    
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        
        if (e.touches.length === 2 && isPinching) {
            // Two fingers - handle pinch zoom
            const currentDistance = getTouchDistance(e.touches[0], e.touches[1]);
            
            if (lastTouchDistance > 0) {
                // Calculate zoom factor based on distance change
                const distanceChange = currentDistance - lastTouchDistance;
                const zoomFactor = 1 + (distanceChange * 0.01); // Adjust sensitivity
                
                // Update target zoom
                viewport.targetZoom = Math.max(
                    viewport.minZoom, 
                    Math.min(viewport.maxZoom, viewport.targetZoom * zoomFactor)
                );
            }
            
            lastTouchDistance = currentDistance;
        } else if (e.touches.length === 1 && touchActive && !isPinching) {
            // One finger - handle movement
            const touch = e.touches[0];
            const rect = canvas.getBoundingClientRect();
            
            // Convert touch coordinates to VIEWPORT_REFERENCE coordinate space
            const canvasX = touch.clientX - rect.left;
            const canvasY = touch.clientY - rect.top;
            
            // Map from canvas pixels to viewport reference space
            touchX = (canvasX / rect.width) * VIEWPORT_REFERENCE.WIDTH;
            touchY = (canvasY / rect.height) * VIEWPORT_REFERENCE.HEIGHT;
        }
    }, { passive: false });
    
    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        
        if (e.touches.length < 2) {
            // Less than 2 fingers - end pinch
            isPinching = false;
            lastTouchDistance = 0;
        }
        
        if (e.touches.length === 0) {
            // No fingers - end movement
            touchActive = false;
            touchX = 0;
            touchY = 0;
        } else if (e.touches.length === 1 && !isPinching) {
            // One finger remaining - continue movement
            const touch = e.touches[0];
            const rect = canvas.getBoundingClientRect();
            touchX = touch.clientX - rect.left;
            touchY = touch.clientY - rect.top;
        }
    }, { passive: false });
    
    canvas.addEventListener('touchcancel', (e) => {
        e.preventDefault();
        touchActive = false;
        isPinching = false;
        lastTouchDistance = 0;
        touchX = 0;
        touchY = 0;
    }, { passive: false });
    
    // Prevent UI elements from interfering with game controls
    const uiElements = document.querySelectorAll('button, input, textarea, select, .side-panel, .modal, .console-messages');
    uiElements.forEach(element => {
        element.addEventListener('touchstart', (e) => {
            // Stop propagation to prevent canvas touch handling
            e.stopPropagation();
        }, { passive: true });
        
        element.addEventListener('touchmove', (e) => {
            e.stopPropagation();
        }, { passive: true });
        
        element.addEventListener('touchend', (e) => {
            e.stopPropagation();
        }, { passive: true });
    });
    
    // Add visual feedback for button taps
    const buttons = document.querySelectorAll('button');
    buttons.forEach(button => {
        button.addEventListener('touchstart', () => {
            if (!button.disabled) {
                button.style.transition = 'all 0.1s';
            }
        }, { passive: true });
        
        button.addEventListener('touchend', () => {
            if (!button.disabled) {
                button.style.transition = 'all 0.2s';
            }
        }, { passive: true });
    });
}

// Update auto-mining button appearance
function updateAutoMineButton() {
    const autoMineBtn = document.getElementById('autoMineBtn');
    const statusText = autoMineBtn?.querySelector('.auto-mine-status');
    
    if (autoMineBtn) {
        if (autoMiningEnabled) {
            autoMineBtn.classList.add('active');
            if (statusText) statusText.textContent = 'ON';
        } else {
            autoMineBtn.classList.remove('active');
            if (statusText) statusText.textContent = 'OFF';
        }
    }
}

// ================================
// GAMEPAD/CONTROLLER SUPPORT
// ================================

let gamepadConnected = false;
let gamepadIndex = null;
let lastGamepadState = {
    buttons: [],
    axes: [],
    l3HoldStart: 0,  // Left stick press (Quick Load)
    r3HoldStart: 0,  // Right stick press (Quick Save)
    dpadUpPressed: false, // Track D-pad up for autopilot toggle
    dpadDownPressed: false, // Track D-pad down for virtual mouse jumps
    dpadLeftPressed: false, // Track D-pad left for virtual mouse jumps
    dpadRightPressed: false, // Track D-pad right for virtual mouse jumps
    selectPressed: false  // Track SELECT button for virtual mouse toggle
};

// Virtual Mouse for Controller UI Navigation
let virtualMouseActive = false;
let virtualMouse = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    speed: 8,
    magnetRange: 150,
    magnetStrength: 0.5,
    visible: false
};

// Get all interactive elements for virtual mouse targeting
function getInteractiveElements() {
    return Array.from(document.querySelectorAll('button:not([disabled]), input, select, .upgrade-btn, .hint-close, .modal-btn, .modal-btn-small, .color-swatch-btn, .preset-btn, .color-swatch, a.terminal-btn, a.exit-btn'));
}

// Find nearest interactive element to virtual mouse
function findNearestButton() {
    const elements = getInteractiveElements();
    let nearest = null;
    let nearestDist = virtualMouse.magnetRange;
    
    elements.forEach(el => {
        const rect = el.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        const dx = centerX - virtualMouse.x;
        const dy = centerY - virtualMouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < nearestDist) {
            nearestDist = dist;
            nearest = { element: el, x: centerX, y: centerY, dist };
        }
    });
    
    return nearest;
}

// Find nearest button in a specific direction
function findButtonInDirection(direction) {
    const elements = getInteractiveElements();
    let best = null;
    let bestScore = Infinity;
    
    elements.forEach(el => {
        const rect = el.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        const dx = centerX - virtualMouse.x;
        const dy = centerY - virtualMouse.y;
        
        // Check if element is in the general direction
        let isInDirection = false;
        let primaryDistance = 0;
        let secondaryDistance = 0;
        let alignmentScore = 0; // How well aligned in the desired direction
        
        switch(direction) {
            case 'up':
                isInDirection = dy < -10; // Must be above
                primaryDistance = Math.abs(dy);
                secondaryDistance = Math.abs(dx);
                // Alignment: prefer buttons directly above (small dx relative to dy)
                alignmentScore = secondaryDistance / (primaryDistance + 1);
                break;
            case 'down':
                isInDirection = dy > 10; // Must be below
                primaryDistance = Math.abs(dy);
                secondaryDistance = Math.abs(dx);
                // Alignment: prefer buttons directly below
                alignmentScore = secondaryDistance / (primaryDistance + 1);
                break;
            case 'left':
                isInDirection = dx < -10; // Must be to the left
                primaryDistance = Math.abs(dx);
                secondaryDistance = Math.abs(dy);
                // Alignment: prefer buttons directly to the left
                alignmentScore = secondaryDistance / (primaryDistance + 1);
                break;
            case 'right':
                isInDirection = dx > 10; // Must be to the right
                primaryDistance = Math.abs(dx);
                secondaryDistance = Math.abs(dy);
                // Alignment: prefer buttons directly to the right
                alignmentScore = secondaryDistance / (primaryDistance + 1);
                break;
        }
        
        if (isInDirection) {
            // Score based on alignment first, then distance
            // Lower score is better
            // Weight alignment heavily (x3) to prioritize direction over proximity
            const score = (alignmentScore * 300) + primaryDistance + (secondaryDistance * 0.2);
            
            if (score < bestScore) {
                bestScore = score;
                best = { element: el, x: centerX, y: centerY };
            }
        }
    });
    
    return best;
}

// Create virtual mouse cursor element
function createVirtualMouseCursor() {
    const cursor = document.createElement('div');
    cursor.id = 'virtualMouseCursor';
    cursor.style.cssText = `
        position: fixed;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: rgba(0, 255, 255, 0.6);
        border: 2px solid var(--term-text);
        pointer-events: none;
        z-index: 100000;
        display: none;
        transform: translate(-50%, -50%);
        box-shadow: 0 0 10px rgba(0, 255, 255, 0.8), 0 0 20px rgba(0, 255, 255, 0.4);
        transition: all 0.1s ease;
    `;
    document.body.appendChild(cursor);
    return cursor;
}

// Update virtual mouse cursor position
function updateVirtualMouseCursor() {
    let cursor = document.getElementById('virtualMouseCursor');
    if (!cursor) {
        cursor = createVirtualMouseCursor();
    }
    
    if (virtualMouseActive) {
        cursor.style.display = 'block';
        cursor.style.left = virtualMouse.x + 'px';
        cursor.style.top = virtualMouse.y + 'px';
        
        // Highlight hovered element
        const nearest = findNearestButton();
        if (nearest && nearest.dist < 50) {
            cursor.style.transform = 'translate(-50%, -50%) scale(1.3)';
            cursor.style.background = 'rgba(0, 255, 0, 0.8)';
            
            // Add hover effect to button
            nearest.element.style.filter = 'brightness(1.3)';
        } else {
            cursor.style.transform = 'translate(-50%, -50%) scale(1)';
            cursor.style.background = 'rgba(0, 255, 255, 0.6)';
            
            // Remove hover effects from all buttons
            getInteractiveElements().forEach(el => {
                el.style.filter = '';
            });
        }
    } else {
        cursor.style.display = 'none';
        // Remove hover effects when cursor is hidden
        getInteractiveElements().forEach(el => {
            el.style.filter = '';
        });
    }
}

// Toggle virtual mouse mode
function toggleVirtualMouse() {
    virtualMouseActive = !virtualMouseActive;
    virtualMouse.visible = virtualMouseActive;
    
    if (virtualMouseActive) {
        // Center cursor on screen
        virtualMouse.x = window.innerWidth / 2;
        virtualMouse.y = window.innerHeight / 2;
        logMessage('Virtual Mouse: ACTIVE (L-Stick=Move, R-Stick=Scroll, D-Pad=Jump, A=Click, SELECT=Exit)');
    } else {
        logMessage('Virtual Mouse: INACTIVE');
    }
    
    updateVirtualMouseCursor();
}

// Gamepad connection events
window.addEventListener('gamepadconnected', (e) => {
    console.log('Gamepad connected:', e.gamepad.id);
    gamepadConnected = true;
    gamepadIndex = e.gamepad.index;
    logMessage(`Controller connected: ${e.gamepad.id.substring(0, 30)}`);
    
    // Update input method to gamepad
    setInputMethod('gamepad');
    
    // Show controller tutorial briefly
    showControllerHint();
});

window.addEventListener('gamepaddisconnected', (e) => {
    console.log('Gamepad disconnected');
    if (e.gamepad.index === gamepadIndex) {
        gamepadConnected = false;
        gamepadIndex = null;
        logMessage('Controller disconnected');
        
        // Revert to touch or keyboard depending on device
        setInputMethod(isTouchDevice ? 'touch' : 'keyboard');
    }
});

function showControllerHint() {
    // Briefly show a message about controller being connected
    const hint = document.createElement('div');
    hint.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.9);
        border: 2px solid var(--term-text);
        padding: 20px 30px;
        color: var(--term-text);
        font-family: 'Courier New', monospace;
        font-size: 14px;
        z-index: 10000;
        text-align: center;
        line-height: 1.6;
    `;
    hint.innerHTML = `
        <div style="font-size: 18px; margin-bottom: 10px;">╔═ CONTROLLER DETECTED ═╗</div>
        <div>Press START/OPTIONS for controls</div>
    `;
    document.body.appendChild(hint);
    
    setTimeout(() => {
        hint.remove();
    }, 3000);
}

function updateGamepad() {
    if (!gamepadConnected || gamepadIndex === null) return;
    
    const gamepads = navigator.getGamepads();
    const gamepad = gamepads[gamepadIndex];
    
    if (!gamepad) return;
    
    // Don't process game input while editing ship name or typing in console
    if (isEditingShipName || isTypingInConsole) return;
    
    const DEADZONE = 0.15; // Ignore small stick movements
    const HOLD_DURATION = 2000; // 2 seconds in milliseconds
    
    // Track if any gamepad input is detected this frame
    let gamepadInputDetected = false;
    
    // ====================
    // SELECT/BACK Button (Button 8) - Toggle Virtual Mouse (works even when paused)
    // ====================
    const selectButton = gamepad.buttons[8] && gamepad.buttons[8].pressed;
    const selectButtonJustPressed = selectButton && !lastGamepadState.selectPressed;
    
    if (selectButtonJustPressed) {
        gamepadInputDetected = true;
        toggleVirtualMouse();
    }
    
    // Update SELECT button state
    lastGamepadState.selectPressed = selectButton;
    
    // ====================
    // Start/Options Button - Pause Menu (works even when paused)
    // ====================
    const startButton = gamepad.buttons[9] && gamepad.buttons[9].pressed;
    const startButtonJustPressed = startButton && !(lastGamepadState.buttons[9]);
    
    if (startButtonJustPressed) {
        gamepadInputDetected = true;
        const pauseModal = document.getElementById('pauseModal');
        pauseModal.classList.toggle('active');
        gameState.isPaused = !gameState.isPaused;
    }
    
    // ====================
    // VIRTUAL MOUSE MODE (works even when paused for menu interaction)
    // ====================
    if (virtualMouseActive) {
        // LEFT STICK - Smooth analog movement
        const leftX = Math.abs(gamepad.axes[0]) > DEADZONE ? gamepad.axes[0] : 0;
        const leftY = Math.abs(gamepad.axes[1]) > DEADZONE ? gamepad.axes[1] : 0;
        
        if (leftX !== 0 || leftY !== 0) {
            gamepadInputDetected = true;
            
            // Smooth movement based on stick position
            let moveSpeed = 8; // Base speed for virtual mouse
            
            // Check proximity to buttons for slowdown effect
            const nearest = findNearestButton();
            if (nearest && nearest.dist < virtualMouse.magnetRange) {
                // Calculate slowdown factor based on distance (closer = slower)
                // At distance 0: slowdown = 0.3 (30% speed)
                // At magnetRange: slowdown = 1.0 (100% speed)
                const distanceRatio = nearest.dist / virtualMouse.magnetRange;
                const minSpeedFactor = 0.3; // Minimum 30% speed when very close
                const slowdownFactor = minSpeedFactor + (1.0 - minSpeedFactor) * distanceRatio;
                moveSpeed *= slowdownFactor;
            }
            
            const moveX = leftX * moveSpeed;
            const moveY = leftY * moveSpeed;
            
            // Check if we're moving toward a button before applying magnetism
            if (nearest && nearest.dist < virtualMouse.magnetRange) {
                // Calculate direction to nearest button
                const toButtonX = nearest.x - virtualMouse.x;
                const toButtonY = nearest.y - virtualMouse.y;
                
                // Calculate dot product to see if we're moving toward the button
                const dotProduct = (moveX * toButtonX + moveY * toButtonY);
                
                // Only apply magnetism if moving toward the button (positive dot product)
                if (dotProduct > 0) {
                    const pullX = toButtonX * virtualMouse.magnetStrength;
                    const pullY = toButtonY * virtualMouse.magnetStrength;
                    virtualMouse.x += moveX + pullX;
                    virtualMouse.y += moveY + pullY;
                } else {
                    // Moving away - no magnetism
                    virtualMouse.x += moveX;
                    virtualMouse.y += moveY;
                }
            } else {
                // No nearby buttons - normal movement
                virtualMouse.x += moveX;
                virtualMouse.y += moveY;
            }
            
            // Clamp to screen bounds
            virtualMouse.x = Math.max(0, Math.min(window.innerWidth, virtualMouse.x));
            virtualMouse.y = Math.max(0, Math.min(window.innerHeight, virtualMouse.y));
        }
        
        // RIGHT STICK - Scroll up/down (for scrollable elements)
        const rightY = Math.abs(gamepad.axes[3]) > DEADZONE ? gamepad.axes[3] : 0;
        
        if (rightY !== 0) {
            gamepadInputDetected = true;
            
            // Find the element under the virtual mouse cursor
            const elementUnderCursor = document.elementFromPoint(virtualMouse.x, virtualMouse.y);
            
            if (elementUnderCursor) {
                // Find the nearest scrollable parent element
                let scrollableElement = elementUnderCursor;
                
                // Walk up the DOM tree to find a scrollable element
                while (scrollableElement && scrollableElement !== document.body) {
                    const computedStyle = window.getComputedStyle(scrollableElement);
                    const overflowY = computedStyle.overflowY;
                    const isScrollable = (overflowY === 'auto' || overflowY === 'scroll') && 
                                        scrollableElement.scrollHeight > scrollableElement.clientHeight;
                    
                    if (isScrollable) {
                        break;
                    }
                    scrollableElement = scrollableElement.parentElement;
                }
                
                // If we found a scrollable element, scroll it
                if (scrollableElement && scrollableElement !== document.body) {
                    const scrollSpeed = 15; // Pixels per frame
                    scrollableElement.scrollTop += rightY * scrollSpeed;
                } else {
                    // If no scrollable element found, scroll the window
                    const scrollSpeed = 15;
                    window.scrollBy(0, rightY * scrollSpeed);
                }
            }
        }
        
        // D-PAD - Jump to nearest button in direction
        const dpadLeft = gamepad.buttons[14] && gamepad.buttons[14].pressed;
        const dpadRight = gamepad.buttons[15] && gamepad.buttons[15].pressed;
        const dpadUp = gamepad.buttons[12] && gamepad.buttons[12].pressed;
        const dpadDown = gamepad.buttons[13] && gamepad.buttons[13].pressed;
        
        // Track D-pad button presses to only jump once per press
        const dpadLeftJustPressed = dpadLeft && !lastGamepadState.dpadLeftPressed;
        const dpadRightJustPressed = dpadRight && !lastGamepadState.dpadRightPressed;
        const dpadUpJustPressed = dpadUp && !lastGamepadState.dpadUpPressed;
        const dpadDownJustPressed = dpadDown && !lastGamepadState.dpadDownPressed;
        
        // Jump to button in direction
        if (dpadLeftJustPressed) {
            gamepadInputDetected = true;
            const target = findButtonInDirection('left');
            if (target) {
                virtualMouse.x = target.x;
                virtualMouse.y = target.y;
            }
        }
        if (dpadRightJustPressed) {
            gamepadInputDetected = true;
            const target = findButtonInDirection('right');
            if (target) {
                virtualMouse.x = target.x;
                virtualMouse.y = target.y;
            }
        }
        if (dpadUpJustPressed) {
            gamepadInputDetected = true;
            const target = findButtonInDirection('up');
            if (target) {
                virtualMouse.x = target.x;
                virtualMouse.y = target.y;
            }
        }
        if (dpadDownJustPressed) {
            gamepadInputDetected = true;
            const target = findButtonInDirection('down');
            if (target) {
                virtualMouse.x = target.x;
                virtualMouse.y = target.y;
            }
        }
        
        // Update D-pad state tracking
        lastGamepadState.dpadLeftPressed = dpadLeft;
        lastGamepadState.dpadRightPressed = dpadRight;
        lastGamepadState.dpadUpPressed = dpadUp;
        lastGamepadState.dpadDownPressed = dpadDown;
        
        // A button clicks the element under cursor (only on button down, not hold)
        const aButton = gamepad.buttons[0] && gamepad.buttons[0].pressed;
        const aButtonJustPressed = aButton && !(lastGamepadState.buttons[0]);
        const nearest = findNearestButton();
        if (aButtonJustPressed && nearest && nearest.dist < 50) {
            gamepadInputDetected = true;
            // Simulate click on the element
            nearest.element.click();
            
            // For input fields, also focus them so user can type
            if (nearest.element.tagName === 'INPUT' || nearest.element.tagName === 'TEXTAREA') {
                nearest.element.focus();
            }
            
            // Visual feedback
            const cursor = document.getElementById('virtualMouseCursor');
            if (cursor) {
                cursor.style.transform = 'translate(-50%, -50%) scale(0.8)';
                setTimeout(() => {
                    cursor.style.transform = 'translate(-50%, -50%) scale(1.3)';
                }, 100);
            }
        }
        
        // Update A button state tracking
        lastGamepadState.buttons[0] = aButton;
        
        // Update cursor visual
        updateVirtualMouseCursor();
        
        // Update input method if any gamepad input was detected
        if (gamepadInputDetected) {
            setInputMethod('gamepad');
        }
        
        // Save button states for next frame
        lastGamepadState.buttons[9] = startButton; // Save START button state
        
        // In virtual mouse mode, disable game controls
        return;
    }
    
    // Don't process game controls if paused (but virtual mouse above still works)
    if (gameState.isPaused) {
        // Save button states for next frame before returning
        lastGamepadState.buttons[9] = startButton;
        return;
    }
    
    // ====================
    // NOTE: Left stick movement is now handled in updatePlayer() 
    // to use the same physics system as keyboard/touch
    // But we still need to detect it for input method tracking
    // ====================
    const leftX = Math.abs(gamepad.axes[0]) > DEADZONE ? gamepad.axes[0] : 0;
    const leftY = Math.abs(gamepad.axes[1]) > DEADZONE ? gamepad.axes[1] : 0;
    
    if (leftX !== 0 || leftY !== 0) {
        gamepadInputDetected = true;
    }
    
    // ====================
    // L3 (Left Stick Press) - Quick Load (Hold 2 sec)
    // ====================
    const l3Pressed = gamepad.buttons[10] && gamepad.buttons[10].pressed;
    
    if (l3Pressed) {
        gamepadInputDetected = true;
        if (lastGamepadState.l3HoldStart === 0) {
            lastGamepadState.l3HoldStart = Date.now();
        } else {
            const holdTime = Date.now() - lastGamepadState.l3HoldStart;
            if (holdTime >= HOLD_DURATION) {
                // Quick Load
                const savesString = localStorage.getItem('asteroidMinerSaves') || '{}';
                const saves = JSON.parse(savesString);
                if (saves['QuickSave']) {
                    if (loadGame('QuickSave')) {
                        logMessage('Quick Load successful');
                        createFloatingText(player.x, player.y - 30, 'LOADED', '#00ff00');
                    }
                } else {
                    logMessage('No QuickSave found');
                }
                lastGamepadState.l3HoldStart = 0; // Reset to prevent repeat
            }
        }
    } else {
        lastGamepadState.l3HoldStart = 0;
    }
    
    // ====================
    // R3 (Right Stick Press) - Quick Save (Hold 2 sec)
    // ====================
    const r3Pressed = gamepad.buttons[11] && gamepad.buttons[11].pressed;
    
    if (r3Pressed) {
        gamepadInputDetected = true;
        if (lastGamepadState.r3HoldStart === 0) {
            lastGamepadState.r3HoldStart = Date.now();
        } else {
            const holdTime = Date.now() - lastGamepadState.r3HoldStart;
            if (holdTime >= HOLD_DURATION) {
                // Quick Save
                if (saveGame('QuickSave')) {
                    logMessage('Quick Save successful');
                    createFloatingText(player.x, player.y - 30, 'SAVED', '#00ff00');
                }
                lastGamepadState.r3HoldStart = 0; // Reset to prevent repeat
            }
        }
    } else {
        lastGamepadState.r3HoldStart = 0;
    }
    
    // ====================
    // GAME CONTROLS (Only when virtual mouse is inactive and game not paused)
    // ====================
    
    // ====================
    // A/Cross Button - Mining Laser
    // ====================
    const aButton = gamepad.buttons[0] && gamepad.buttons[0].pressed;
    if (aButton) {
        gamepadInputDetected = true;
        keys['space'] = true;
    } else if (lastInputMethod === 'gamepad') {
        // Only clear space key if gamepad is the active input method
        // This prevents overriding keyboard input when using keyboard
        keys['space'] = false;
    }
    
    // ====================
    // B/Circle Button - Deep Space Scan
    // ====================
    const bButton = gamepad.buttons[1] && gamepad.buttons[1].pressed;
    const bButtonJustPressed = bButton && !(lastGamepadState.buttons[1]);
    
    if (bButtonJustPressed) {
        gamepadInputDetected = true;
        triggerScan();
    }
    
    // ====================
    // LB/L1 - Zoom Out (works in both modes)
    // ====================
    const lbButton = gamepad.buttons[4] && gamepad.buttons[4].pressed;
    if (lbButton && !virtualMouseActive) {
        gamepadInputDetected = true;
        viewport.targetZoom = Math.max(viewport.minZoom, viewport.targetZoom * 0.98);
    }
    
    // ====================
    // RB/R1 - Zoom In (works in both modes)
    // ====================
    const rbButton = gamepad.buttons[5] && gamepad.buttons[5].pressed;
    if (rbButton && !virtualMouseActive) {
        gamepadInputDetected = true;
        viewport.targetZoom = Math.min(viewport.maxZoom, viewport.targetZoom * 1.02);
    }
    
    // ====================
    // D-Pad Up - Toggle Autopilot (only when virtual mouse is OFF)
    // ====================
    if (!virtualMouseActive) {
        const dpadUp = gamepad.buttons[12] && gamepad.buttons[12].pressed;
        const dpadUpJustPressed = dpadUp && !lastGamepadState.dpadUpPressed;
        
        if (dpadUpJustPressed) {
            gamepadInputDetected = true;
            autoPilotActive = !autoPilotActive;
            logMessage(autoPilotActive ? 'Autopilot ENGAGED' : 'Autopilot DISENGAGED');
            updateNavigationButtonText(); // Update UI to reflect autopilot state
        }
        
        lastGamepadState.dpadUpPressed = dpadUp;
    } else {
        lastGamepadState.dpadUpPressed = false;
    }
    
    // Update input method if any gamepad input was detected
    if (gamepadInputDetected) {
        setInputMethod('gamepad');
    }
    
    // Save button states for next frame
    lastGamepadState.buttons = gamepad.buttons.map(b => b.pressed);
    lastGamepadState.axes = [...gamepad.axes];
}

function initMinimapScanner() {
    // Add touch support for triggering scanner via minimap
    // Only enabled for touchscreen devices
    
    // Only initialize for touch devices
    if (!isTouchDevice) return;
    
    const handleMinimapTouch = (e) => {
        e.preventDefault();
        
        // Don't trigger scan if game is paused
        if (gameState.isPaused) return;
        
        // Trigger the scan
        triggerScan();
        
        // Visual feedback - briefly highlight the minimap
        minimapCanvas.style.boxShadow = '0 0 15px rgba(0, 255, 255, 0.8)';
        setTimeout(() => {
            minimapCanvas.style.boxShadow = '';
        }, 200);
    };
    
    // Touch support only (for mobile devices)
    minimapCanvas.addEventListener('touchstart', handleMinimapTouch, { passive: false });
}

// ================================
// UPGRADE SYSTEM
// ================================

function initUpgrades() {
    const upgradeCosts = {
        speed: [100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600, 51200],
        cargo: [150, 300, 600, 1200, 2400, 4800, 9600, 19200, 38400, 76800],
        mining: [120, 240, 480, 960, 1920, 3840, 7680, 15360, 30720, 61440],
        hull: [200, 400, 800, 1600, 3200, 6400, 12800, 25600, 51200, 102400],
        fuel: [180, 360, 720, 1440, 2880, 5760, 11520, 23040, 46080, 92160],
        range: [160, 320, 640, 1280, 2560, 5120, 10240, 20480, 40960, 81920],
        multiMining: [600, 1200, 2400, 4800, 9600], // Max 6 lasers (5 upgrades from level 1)
        advancedScanner: [50], // One-time purchase
        scanRange: [250, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000],
        scanCooldown: [200, 400, 800, 1600, 3200, 6400, 12800, 25600, 51200, 102400],
        cargoDrone: [5000] // One-time purchase
    };
    
    // Initialize collapsible upgrade categories
    const categoryHeaders = document.querySelectorAll('.category-header');
    categoryHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const categoryName = header.dataset.category;
            const content = document.getElementById(`${categoryName}Content`);
            const icon = header.querySelector('.category-icon');
            
            // Check if this category is currently open
            const isOpen = content.style.display !== 'none';
            
            // Close all categories
            document.querySelectorAll('.category-content').forEach(c => {
                c.style.display = 'none';
            });
            document.querySelectorAll('.category-icon').forEach(i => {
                i.textContent = '▶';
            });
            
            // If this category was closed, open it
            if (!isOpen) {
                content.style.display = 'block';
                icon.textContent = '▼';
            }
        });
    });
    
    Object.keys(gameState.upgrades).forEach(upgradeType => {
        const btn = document.getElementById(`upgrade${upgradeType.charAt(0).toUpperCase() + upgradeType.slice(1)}`);
        
        if (!btn) {
            console.log(`Button not found for upgrade: ${upgradeType}`);
            return; // Skip if button doesn't exist
        }
        
        btn.addEventListener('click', () => {
            console.log(`Clicked upgrade: ${upgradeType}`);
            
            // Check if player is docked
            if (!isDockedAtAnyStation()) {
                logMessage('Must be docked at station to purchase upgrades.');
                return;
            }
            
            const level = gameState.upgrades[upgradeType];
            
            // Special handling for one-time purchases (advanced scanner, cargo drone)
            if (upgradeType === 'advancedScanner' || upgradeType === 'cargoDrone') {
                console.log(`=== ${upgradeType.toUpperCase()} DEBUG ===`);
                console.log(`Current level: ${level}`);
                console.log(`Current credits: ${gameState.credits}`);
                console.log(`Cost: ${upgradeCosts[upgradeType][0]}`);
                console.log(`Is docked: ${isDockedAtAnyStation()}`);
                console.log(`Level >= 1: ${level >= 1}`);
                
                if (level >= 1) {
                    logMessage(`${upgradeType === 'advancedScanner' ? 'Advanced scanner' : 'Cargo drone'} already purchased.`);
                    console.log('Already purchased - exiting');
                    return;
                }
                
                const cost = upgradeCosts[upgradeType][0]; // First (and only) cost
                
                console.log(`Checking if credits (${gameState.credits}) >= cost (${cost}): ${gameState.credits >= cost}`);
                
                if (gameState.credits >= cost) {
                    console.log('Purchasing...');
                    gameState.credits -= cost;
                    gameState.upgrades[upgradeType] = 1;
                    
                    console.log(`New level: ${gameState.upgrades[upgradeType]}`);
                    
                    // Apply upgrade effects
                    applyUpgradeEffects(upgradeType);
                    
                    const displayName = upgradeType === 'advancedScanner' ? 'ADVANCED SCANNER' : 'CARGO DRONE';
                    logMessage(`Purchased ${displayName}`);
                    createFloatingText(player.x, player.y - 30, `+${displayName}`, '#00ff00');
                    
                    updateUI();
                    console.log('Purchase complete!');
                } else {
                    console.log('Insufficient credits!');
                    logMessage(`Insufficient credits. Need ${cost}¢`);
                }
                console.log(`=== END DEBUG ===`);
                return;
            }
            
            // Regular upgrades (level 1-10, except multiMining which caps at 6)
            const maxLevel = (upgradeType === 'multiMining') ? 6 : 10;
            
            if (level >= maxLevel) {
                logMessage(`${upgradeType.toUpperCase()} is already at maximum level.`);
                return;
            }
            
            const cost = upgradeCosts[upgradeType][level - 1];
            
            if (gameState.credits >= cost) {
                gameState.credits -= cost;
                gameState.upgrades[upgradeType]++;
                
                // Apply upgrade effects
                applyUpgradeEffects(upgradeType);
                
                logMessage(`Upgraded ${upgradeType.toUpperCase()} to level ${gameState.upgrades[upgradeType]}`);
                createFloatingText(player.x, player.y - 30, `+${upgradeType.toUpperCase()}`, '#00ff00');
                
                updateUI();
            } else {
                logMessage(`Insufficient credits. Need ${cost}¢`);
            }
        });
    });
    
    // Prestige
    document.getElementById('prestigeBtn').addEventListener('click', () => {
        if (gameState.credits >= 50000) {
            showConfirm(
                'PRESTIGE',
                'Prestige will reset all progress but grant permanent bonuses.\n\nYou will gain +10% to all earnings permanently.\n\nContinue?',
                () => {
                    performPrestige();
                }
            );
        }
    });
    
    // Navigation buttons
    document.getElementById('returnToStation').addEventListener('click', () => {
        returnToStation();
    });
    
    document.getElementById('callForHelp').addEventListener('click', () => {
        // Calculate rescue cost (1.5x fuel needed)
        const fuelNeeded = gameState.maxFuel - gameState.fuel;
        const rescueCost = Math.ceil(fuelNeeded * 1.5);
        
        if (gameState.credits >= rescueCost && !rescueShip) {
            showConfirm(
                'CALL FOR HELP',
                `Send a rescue ship from the station to refuel your vessel?\n\nCOST: ${rescueCost} Credits (1.5x fuel cost)\n\nThe rescue ship will fly to your position, refuel your ship, then return to the station.`,
                () => {
                    callForHelp();
                }
            );
        }
    });
    
    document.getElementById('nextSector').addEventListener('click', () => {
        if (gameState.credits < 1000) {
            logMessage('Insufficient credits for sector jump. Need 1,000¢');
            return;
        }
        
        if (gameState.fuel < 50) {
            logMessage('Insufficient fuel for sector jump. Need 50 fuel.');
            return;
        }
        
        const currentSector = gameState.sector;
        const nextSectorNum = currentSector + 1;
        const nextSectorName = `ALPHA-${String(nextSectorNum).padStart(3, '0')}`;
        
        // Calculate current sector stats
        const currentAsteroids = 30 + currentSector * 5;
        const currentHazards = Math.floor(2 + currentSector * 0.5);
        const currentRareChance = (currentSector - 1) * 10; // As percentage
        const currentSpawnRate = (currentSector - 1) * 10; // As percentage above base
        
        // Calculate next sector stats
        const nextAsteroids = 30 + nextSectorNum * 5;
        const nextHazards = Math.floor(2 + nextSectorNum * 0.5);
        const nextRareChance = (nextSectorNum - 1) * 10; // As percentage
        const nextSpawnRate = (nextSectorNum - 1) * 10; // As percentage above base
        
        // Calculate differences
        const asteroidIncrease = nextAsteroids - currentAsteroids;
        const hazardIncrease = nextHazards - currentHazards;
        const rareChanceIncrease = nextRareChance - currentRareChance;
        const spawnRateIncrease = nextSpawnRate - currentSpawnRate;
        
        showConfirm(
            'JUMP TO NEXT SECTOR',
            `SECTOR JUMP ANALYSIS:\n\n` +
            `Destination: ${nextSectorName}\n` +
            `Cost: 1,000 Credits + 50 Fuel\n\n` +
            `SECTOR DIFFICULTY INCREASE:\n` +
            `• Asteroid density: ${currentAsteroids} → ${nextAsteroids} (+${asteroidIncrease})\n` +
            `• Hazard encounters: ${currentHazards} → ${nextHazards} (+${hazardIncrease})\n` +
            `• Rare asteroid chance: ${currentRareChance}% → ${nextRareChance}% (+${rareChanceIncrease}%)\n` +
            `• Spawn rate bonus: +${currentSpawnRate}% → +${nextSpawnRate}% (+${spawnRateIncrease}%)\n\n` +
            `WARNING: Higher sectors contain more valuable\n` +
            `resources but significantly increased danger.\n\n` +
            `Proceed with sector jump?`,
            () => {
                jumpToNextSector();
            }
        );
    });
    
    // Station service buttons
    document.getElementById('sellCargoBtn').addEventListener('click', () => {
        // Check if player is docked - if so, sell normally
        if (isDockedAtAnyStation()) {
            sellCargo();
        } else {
            // If not docked, check if cargo drone is available
            if (gameState.upgrades.cargoDrone >= 1) {
                deployCargoDrone();
            } else {
                logMessage('Must be docked at station to sell cargo, or purchase Cargo Drone upgrade.');
            }
        }
    });
    
    document.getElementById('refuelShipBtn').addEventListener('click', () => {
        refuelAndRepair();
    });
    
    document.getElementById('customizeShipBtn').addEventListener('click', () => {
        openShipCustomization();
    });
}

// Ship Customization Functions
let currentColorType = ''; // Track which color is being edited
let tempShipColors = {}; // Temporary storage for colors being edited

// Predefined color palette
const COLOR_PALETTE = [
    // Cyans/Blues
    '#00ffff', '#00aaaa', '#0088cc', '#0066ff', '#0044aa', '#003388', '#1a1a2e', '#16213e',
    // Greens
    '#00ff00', '#00cc00', '#00aa00', '#008800', '#7cb342', '#4caf50', '#2d5016', '#1a3010',
    // Yellows/Oranges
    '#ffff00', '#ffcc00', '#ff9600', '#ff6600', '#ff4400', '#f39c12', '#e67e22', '#d35400',
    // Reds/Pinks
    '#ff0000', '#cc0000', '#aa0000', '#880000', '#c0392b', '#e74c3c', '#ff00ff', '#cc00cc',
    // Purples
    '#9b59b6', '#8e44ad', '#6c3483', '#5b2c6f', '#7b1fa2', '#6a1b9a', '#4a148c', '#311b92',
    // Grays/Whites
    '#ffffff', '#cccccc', '#999999', '#666666', '#4a5568', '#333333', '#222222', '#111111',
    // Browns
    '#8b4513', '#654321', '#5c4033', '#3e2723', '#6d4c41', '#4e342e', '#3e2c23', '#2c1810',
    // Special
    '#00bfff', '#1e90ff', '#4169e1', '#00ced1', '#20b2aa', '#48d1cc', '#40e0d0', '#7fffd4'
];

function openShipCustomization() {
    const modal = document.getElementById('customizeModal');
    
    // Store current colors in temp storage
    tempShipColors = {
        primary: player.colors.primary,
        secondary: player.colors.secondary,
        accent: player.colors.accent,
        thruster: player.colors.thruster
    };
    
    // Update swatch displays
    updateColorSwatches();
    
    modal.classList.add('active');
}

function updateColorSwatches() {
    // Update preview swatches and hex values
    const types = ['primary', 'secondary', 'accent', 'thruster'];
    types.forEach(type => {
        const preview = document.getElementById(`preview${type.charAt(0).toUpperCase() + type.slice(1)}`);
        const hex = document.getElementById(`hex${type.charAt(0).toUpperCase() + type.slice(1)}`);
        const color = tempShipColors[type];
        
        if (preview) preview.style.backgroundColor = color;
        if (hex) hex.textContent = color.toUpperCase();
    });
}

function openColorPicker(colorType) {
    currentColorType = colorType;
    const modal = document.getElementById('colorPickerModal');
    const title = document.getElementById('colorPickerTitle');
    
    // Set title based on color type
    const titles = {
        primary: 'HULL COLOR',
        secondary: 'OUTLINE COLOR',
        accent: 'ACCENT/LASER COLOR',
        thruster: 'THRUSTER COLOR'
    };
    title.textContent = `╔════ SELECT ${titles[colorType]} ════╗`;
    
    // Generate color swatches
    const grid = document.getElementById('colorSwatchesGrid');
    grid.innerHTML = '';
    
    COLOR_PALETTE.forEach(color => {
        const swatch = document.createElement('button');
        swatch.className = 'color-swatch';
        swatch.style.setProperty('--swatch-color', color);
        swatch.style.backgroundColor = color;
        swatch.title = color.toUpperCase();
        
        // Highlight if this is the current color
        if (color.toLowerCase() === tempShipColors[colorType].toLowerCase()) {
            swatch.classList.add('selected');
        }
        
        swatch.addEventListener('click', () => {
            selectColor(color);
        });
        
        grid.appendChild(swatch);
    });
    
    // Set custom hex input to current color
    document.getElementById('customHexInput').value = tempShipColors[colorType].toUpperCase();
    
    modal.classList.add('active');
}

function selectColor(color) {
    // Validate hex color
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
        logMessage('Invalid color format. Use #RRGGBB');
        return;
    }
    
    // Update temp storage
    tempShipColors[currentColorType] = color.toLowerCase();
    
    // Update the swatch in the customization modal
    updateColorSwatches();
    
    // Close color picker
    closeColorPicker();
}

function closeColorPicker() {
    const modal = document.getElementById('colorPickerModal');
    modal.classList.remove('active');
}

function applyShipCustomization() {
    // Apply temp colors to actual player colors
    player.colors.primary = tempShipColors.primary;
    player.colors.secondary = tempShipColors.secondary;
    player.colors.accent = tempShipColors.accent;
    player.colors.thruster = tempShipColors.thruster;
    
    logMessage('Ship customization applied!');
    closeShipCustomization();
}

function closeShipCustomization() {
    const modal = document.getElementById('customizeModal');
    modal.classList.remove('active');
}

function applyColorPreset(presetName) {
    const presets = {
        default: {
            primary: '#e0e0e0',
            secondary: '#808080',
            accent: '#c0c0c0',
            thruster: '#ff6600'
        },
        normandy: {
            primary: '#2c3e50',
            secondary: '#1a252f',
            accent: '#e74c3c',
            thruster: '#3498db'
        },
        spartan: {
            primary: '#2d5016',
            secondary: '#1a3010',
            accent: '#7cb342',
            thruster: '#ff6b35'
        },
        arwing: {
            primary: '#e8e8e8',
            secondary: '#7f8c8d',
            accent: '#3498db',
            thruster: '#e67e22'
        },
        atlas: {
            primary: '#c0392b',
            secondary: '#7f1d1d',
            accent: '#e74c3c',
            thruster: '#ff6b6b'
        },
        viper: {
            primary: '#34495e',
            secondary: '#2c3e50',
            accent: '#f39c12',
            thruster: '#00d4ff'
        }
    };
    
    const preset = presets[presetName];
    if (preset) {
        tempShipColors.primary = preset.primary;
        tempShipColors.secondary = preset.secondary;
        tempShipColors.accent = preset.accent;
        tempShipColors.thruster = preset.thruster;
        updateColorSwatches();
    }
}

function applyUpgradeEffects(upgradeType) {
    switch(upgradeType) {
        case 'speed':
            // Speed is calculated dynamically in updatePlayer()
            // Effect: +20% speed per level
            logMessage(`Ship speed increased to ${100 + (gameState.upgrades.speed - 1) * 20}%`);
            break;
        case 'cargo':
            gameState.maxCargo = 100 + (gameState.upgrades.cargo - 1) * 50;
            logMessage(`Cargo capacity increased to ${gameState.maxCargo} units`);
            break;
        case 'mining':
            // Mining speed is calculated dynamically in attemptMining()
            // Effect: -10% mining time per level
            const miningBonus = (gameState.upgrades.mining - 1) * 10;
            logMessage(`Mining speed increased by ${miningBonus}%`);
            break;
        case 'hull':
            const oldMaxHull = gameState.maxHull;
            gameState.maxHull = 100 + (gameState.upgrades.hull - 1) * 25;
            gameState.hull = Math.min(gameState.hull + (gameState.maxHull - oldMaxHull), gameState.maxHull);
            logMessage(`Max hull increased to ${gameState.maxHull}HP (+${gameState.maxHull - oldMaxHull}HP healed)`);
            break;
        case 'fuel':
            const oldMaxFuel = gameState.maxFuel;
            gameState.maxFuel = 100 + (gameState.upgrades.fuel - 1) * 20;
            gameState.fuel = Math.min(gameState.fuel + (gameState.maxFuel - oldMaxFuel), gameState.maxFuel);
            const fuelEfficiency = (gameState.upgrades.fuel - 1) * 5;
            logMessage(`Max fuel increased to ${gameState.maxFuel}% (+${fuelEfficiency}% efficiency)`);
            break;
        case 'range':
            // Mining range is calculated dynamically in attemptMining()
            // Effect: +10 units per level
            const newRange = 50 + (gameState.upgrades.range - 1) * 10;
            logMessage(`Mining range increased to ${newRange} units`);
            break;
        case 'multiMining':
            // Multi-mining allows targeting multiple asteroids
            // Effect: +1 simultaneous target per level
            const targets = gameState.upgrades.multiMining;
            logMessage(`Can now mine ${targets} asteroid${targets > 1 ? 's' : ''} simultaneously`);
            break;
        case 'advancedScanner':
            // Advanced scanner enables value/danger display on scans
            logMessage('Advanced scanner installed: Scan results now display item values and hazard warnings');
            break;
        case 'scanRange':
            // Scan range is calculated dynamically in triggerScan()
            // Effect: +100 units per level
            const scanRange = SCAN_CONFIG.baseRange + (gameState.upgrades.scanRange - 1) * SCAN_CONFIG.rangePerLevel;
            logMessage(`Scanner range increased to ${scanRange} units`);
            break;
        case 'scanCooldown':
            // Scan cooldown is calculated dynamically in triggerScan()
            // Effect: -0.8s per level (minimum 2s)
            const scanCooldown = Math.max(2000, SCAN_CONFIG.baseCooldown - (gameState.upgrades.scanCooldown - 1) * SCAN_CONFIG.cooldownReduction);
            logMessage(`Scanner cooldown reduced to ${scanCooldown / 1000}s`);
            break;
        case 'cargoDrone':
            // Cargo drone allows remote selling
            logMessage('Cargo drone installed: Use "Sell Cargo" button when not docked to deploy remotely');
            break;
    }
}

function performPrestige() {
    gameState.prestige++;
    gameState.prestigeBonus = gameState.prestige * 10;
    
    // Reset most stats
    gameState.credits = 0;
    gameState.sector = 1;
    gameState.cargo = 0;
    gameState.inventory = {};
    
    // Keep 1 level in each upgrade
    Object.keys(gameState.upgrades).forEach(key => {
        gameState.upgrades[key] = 1;
    });
    
    // Reset stat values to base
    gameState.maxCargo = 100;
    gameState.maxHull = 100;
    gameState.hull = 100;
    gameState.maxFuel = 100;
    gameState.fuel = 100;
    
    // Reset world
    asteroids = [];
    hazards = [];
    player.x = CONFIG.worldWidth / 2;
    player.y = CONFIG.worldHeight / 2;
    
    // Re-center viewport on player
    viewport.x = player.x - (VIEWPORT_REFERENCE.WIDTH / 2) / viewport.zoom;
    viewport.y = player.y - (VIEWPORT_REFERENCE.HEIGHT / 2) / viewport.zoom;
    
    logMessage(`PRESTIGE COMPLETE! Bonus: +${gameState.prestigeBonus}% to all gains`);
    generateSector();
    updateUI();
}

function returnToStation() {
    // Toggle auto-pilot
    autoPilotActive = !autoPilotActive;
    
    if (autoPilotActive) {
        logMessage('Auto-pilot engaged. Flying to station...');
    } else {
        logMessage('Auto-pilot disengaged. Manual control resumed.');
    }
    
    // Update button text
    updateNavigationButtonText();
}

function updateNavigationButtonText() {
    const btn = document.getElementById('returnToStation');
    const btnText = btn.querySelector('.btn-text');
    
    if (autoPilotActive) {
        btnText.textContent = 'CANCEL AUTO-PILOT';
        btn.style.backgroundColor = 'rgba(255, 100, 0, 0.2)';
    } else {
        btnText.textContent = 'AUTO-PILOT TO STATION';
        btn.style.backgroundColor = '';
    }
}

// Find the nearest station to a given position
function findNearestStation(x, y) {
    if (stations.length === 0) return null;
    
    let nearest = stations[0];
    let minDist = Infinity;
    
    for (const s of stations) {
        const dx = s.x - x;
        const dy = s.y - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < minDist) {
            minDist = dist;
            nearest = s;
        }
    }
    
    return nearest;
}

function callForHelp() {
    // Calculate rescue cost (1.5x fuel needed)
    const fuelNeeded = gameState.maxFuel - gameState.fuel;
    const rescueCost = Math.ceil(fuelNeeded * 1.5);
    
    if (gameState.credits < rescueCost) {
        logMessage(`Insufficient credits for rescue service. Need ${rescueCost}¢.`);
        return;
    }
    
    if (rescueShip) {
        logMessage('Rescue ship already dispatched.');
        return;
    }
    
    // Deduct cost
    gameState.credits -= rescueCost;
    
    // Find nearest station to player
    const nearestStation = findNearestStation(player.x, player.y);
    
    // Create rescue ship at nearest station
    rescueShip = {
        x: nearestStation.x,
        y: nearestStation.y,
        vx: 0,
        vy: 0,
        angle: 0,
        size: 12,
        speed: 2.5,
        state: 'flying_to_player', // States: flying_to_player, refueling, returning_to_station
        refuelRate: 0.5, // Fuel per frame
        sourceStation: nearestStation // Remember which station it came from
    };
    
    logMessage(`Rescue ship dispatched from ${nearestStation.name} for ${rescueCost}¢. ETA: calculating...`);
}

function updateRescueShip(dt = 1) {
    if (!rescueShip) return;
    
    if (rescueShip.state === 'flying_to_player') {
        // Fly toward player
        const dx = player.x - rescueShip.x;
        const dy = player.y - rescueShip.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 60) {  // Doubled from 30 to 60
            // Reached player, start refueling
            rescueShip.state = 'refueling';
            rescueShip.vx = 0;
            rescueShip.vy = 0;
            logMessage('Rescue ship arrived. Refueling in progress...');
            logMessage('Ship locked in place during refueling.');
        } else {
            // Move toward player
            rescueShip.angle = Math.atan2(dy, dx);
            rescueShip.vx = Math.cos(rescueShip.angle) * rescueShip.speed;
            rescueShip.vy = Math.sin(rescueShip.angle) * rescueShip.speed;
            rescueShip.x += rescueShip.vx * dt;
            rescueShip.y += rescueShip.vy * dt;
        }
    } else if (rescueShip.state === 'refueling') {
        // Refuel player from current position (no need to move)
        const maxFuel = gameState.maxFuel;
        gameState.fuel = Math.min(maxFuel, gameState.fuel + rescueShip.refuelRate * dt);
        
        // Stay at current position - no movement needed
        rescueShip.vx = 0;
        rescueShip.vy = 0;
        
        // Point rescue ship toward player
        const angleToPlayer = Math.atan2(player.y - rescueShip.y, player.x - rescueShip.x);
        rescueShip.angle = angleToPlayer;
        
        if (gameState.fuel >= maxFuel) {
            // Refueling complete - find nearest station NOW
            const nearestStation = findNearestStation(rescueShip.x, rescueShip.y);
            rescueShip.targetStation = nearestStation;
            rescueShip.state = 'returning_to_station';
            logMessage('Refueling complete. Rescue ship returning to station.');
            logMessage('Controls restored.');
        }
    } else if (rescueShip.state === 'returning_to_station') {
        // Fly back to nearest station (determined after refueling)
        const targetStation = rescueShip.targetStation || stations[0];
        const dx = targetStation.x - rescueShip.x;
        const dy = targetStation.y - rescueShip.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 20) {
            // Reached station, disappear
            const stationName = targetStation.name;
            rescueShip = null;
            logMessage(`Rescue ship returned to ${stationName}.`);
        } else {
            // Move toward station
            rescueShip.angle = Math.atan2(dy, dx);
            rescueShip.vx = Math.cos(rescueShip.angle) * rescueShip.speed;
            rescueShip.vy = Math.sin(rescueShip.angle) * rescueShip.speed;
            rescueShip.x += rescueShip.vx * dt;
            rescueShip.y += rescueShip.vy * dt;
        }
    }
}

function jumpToNextSector() {
    if (gameState.fuel < 50) {
        logMessage('Insufficient fuel for sector jump. Refuel at a station or Call for rescue.');
        return;
    }
    
    if (gameState.credits < 10000) {
        logMessage('Insufficient credits for sector jump. Need 10,000¢');
        return;
    }
    
    if (godModeActive) {
        gameState.fuel = gameState.maxFuel;
    } else {
        gameState.fuel -= 50;
    }
    gameState.credits -= 10000;
    gameState.sector++;
    gameState.sectorName = `ALPHA-${String(gameState.sector).padStart(3, '0')}`;
    gameState.stats.sectorsVisited++;
    
    player.x = CONFIG.worldWidth / 2;
    player.y = CONFIG.worldHeight / 2;
    
    // Re-center viewport on player
    viewport.x = player.x - (VIEWPORT_REFERENCE.WIDTH / 2) / viewport.zoom;
    viewport.y = player.y - (VIEWPORT_REFERENCE.HEIGHT / 2) / viewport.zoom;
    
    // Clear stations before generating new sector (each sector has new stations)
    stations = [];
    
    generateSector();
    logMessage(`Jumped to sector ${gameState.sectorName}`);
    logMessage(`Sector difficulty: +${Math.floor((gameState.sector - 1) * 10)}% spawn rate, improved rare asteroid drops`);
    updateUI();
}

// ================================
// WORLD GENERATION
// ================================

function generateStars() {
    stars = [];
    
    // Generate many more stars distributed across screen space
    // These will tile and scroll at different rates for parallax
    const viewportWidth = VIEWPORT_REFERENCE.WIDTH;
    const viewportHeight = VIEWPORT_REFERENCE.HEIGHT;
    
    // Ultra-far layer (1000 stars) - barely any movement, smallest, dimmest
    for (let i = 0; i < 1000; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 0.005 + 0.001; // 0.001-0.006 pixels per second
        stars.push({
            // Position in a tileable pattern
            x: Math.random() * viewportWidth * 2,
            y: Math.random() * viewportHeight * 2,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: Math.random() * 0.8 + 0.3, // 0.3-1.1
            brightness: Math.random() * 0.25 + 0.15, // 0.15-0.4
            layer: 0,
            parallaxFactor: 0.05 // Barely moves - very distant
        });
    }

    // Very far layer (800 stars) - extremely slow movement
    for (let i = 0; i < 800; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 0.008 + 0.002; // 0.002-0.01 pixels per second
        stars.push({
            x: Math.random() * viewportWidth * 2,
            y: Math.random() * viewportHeight * 2,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: Math.random() * 0.9 + 0.4, // 0.4-1.3
            brightness: Math.random() * 0.27 + 0.2, // 0.2-0.47
            layer: 0.5,
            parallaxFactor: 0.12 // Between ultra-far and far
        });
    }
    
    // Far layer (600 stars) - slow movement
    for (let i = 0; i < 600; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 0.01 + 0.003; // 0.003-0.013 pixels per second
        stars.push({
            x: Math.random() * viewportWidth * 2,
            y: Math.random() * viewportHeight * 2,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: Math.random() * 1 + 0.5, // 0.5-1.5
            brightness: Math.random() * 0.3 + 0.25, // 0.25-0.55
            layer: 1,
            parallaxFactor: 0.2 // Slow movement
        });
    }
    
    // Mid-far layer (450 stars) - moderate-slow movement
    for (let i = 0; i < 450; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 0.012 + 0.005; // 0.005-0.017 pixels per second
        stars.push({
            x: Math.random() * viewportWidth * 2,
            y: Math.random() * viewportHeight * 2,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: Math.random() * 1.3 + 0.5, // 0.5-1.8
            brightness: Math.random() * 0.35 + 0.3, // 0.3-0.65
            layer: 1.5,
            parallaxFactor: 0.35 // Between far and medium
        });
    }
    
    // Medium layer (300 stars) - medium movement
    for (let i = 0; i < 300; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 0.015 + 0.007; // 0.007-0.022 pixels per second
        stars.push({
            x: Math.random() * viewportWidth * 2,
            y: Math.random() * viewportHeight * 2,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: Math.random() * 1.5 + 0.5, // 0.5-2
            brightness: Math.random() * 0.4 + 0.35, // 0.35-0.75
            layer: 2,
            parallaxFactor: 0.45 // Medium speed
        });
    }
    
    // Near layer (200 stars) - faster movement, larger, brighter
    for (let i = 0; i < 200; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 0.02 + 0.01; // 0.01-0.03 pixels per second
        stars.push({
            x: Math.random() * viewportWidth * 2,
            y: Math.random() * viewportHeight * 2,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: Math.random() * 2 + 0.5, // 0.5-2.5
            brightness: Math.random() * 0.5 + 0.5, // 0.5-1.0
            layer: 3,
            parallaxFactor: 0.65 // Moves almost with viewport
        });
    }

    // Shooting stars layer (5 stars) - extremely rare, very fast, brightest
    for (let i = 0; i < 3; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 2 + 8; // 8-10 pixels per second (FAST!)
        stars.push({
            x: Math.random() * viewportWidth * 2,
            y: Math.random() * viewportHeight * 2,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: Math.random() * 1.5 + 5, // 5-6.5 (slightly smaller but bright)
            brightness: Math.random() * 0.3 + 0.7, // 0.7-1.0 (very bright)
            layer: 4,
            parallaxFactor: 0.95 // Moves almost exactly with viewport (closest)
        });
    }
    
    // Initialize star worker with the generated stars
    initStarWorker();
    
    // Initialize physics and collision workers
    initPhysicsWorker();
    initCollisionWorker();
    
    // Initialize FPS worker
    initFPSWorker();
}

function initStarWorker() {
    try {
        // Create the worker
        starWorker = new Worker('asteroid-miner-stars-worker.js');
        
        // Handle messages from worker
        starWorker.onmessage = function(e) {
            const { type, data, stars: updatedStars } = e.data;
            
            if (type === 'starsUpdated') {
                // Update main thread's star data
                stars = updatedStars;
            } else if (type === 'renderData') {
                // Store pre-calculated render data
                starRenderData = data;
            }
        };
        
        starWorker.onerror = function(error) {
            console.error('Star worker error:', error);
            starWorkerReady = false;
        };
        
        // Send initial star data to worker
        starWorker.postMessage({
            type: 'init',
            data: { stars: stars }
        });
        
        starWorkerReady = true;
        console.log('Star worker initialized with', stars.length, 'stars');
        
    } catch (error) {
        console.warn('Could not initialize star worker, using main thread:', error);
        starWorkerReady = false;
    }
}

function initPhysicsWorker() {
    try {
        // Create the worker
        physicsWorker = new Worker('asteroid-miner-physics-worker.js');
        
        // Handle messages from worker
        physicsWorker.onmessage = function(e) {
            const { type, data } = e.data;
            
            if (type === 'ready') {
                physicsWorkerReady = true;
                console.log('Physics worker ready');
            } else if (type === 'allUpdated') {
                // Update main thread's physics data
                // Note: Asteroids are updated on main thread to preserve object references for mining
                // asteroids = data.asteroids; // DISABLED - breaks mining references
                hazards = data.hazards;
                
                // Filter out dead particles
                particles = data.particles.filter(p => !p.dead);
                
                pendingPhysicsUpdate = false;
            }
        };
        
        physicsWorker.onerror = function(error) {
            console.error('Physics worker error:', error);
            physicsWorkerReady = false;
            pendingPhysicsUpdate = false;
        };
        
        // Send initial config to worker
        physicsWorker.postMessage({
            type: 'init',
            data: { 
                worldWidth: CONFIG.worldWidth,
                worldHeight: CONFIG.worldHeight 
            }
        });
        
        console.log('Physics worker initialized');
        
    } catch (error) {
        console.warn('Could not initialize physics worker, using main thread:', error);
        physicsWorkerReady = false;
    }
}

function initCollisionWorker() {
    try {
        // Create the worker
        collisionWorker = new Worker('asteroid-miner-collision-worker.js');
        
        // Handle messages from worker
        collisionWorker.onmessage = function(e) {
            const { type, data } = e.data;
            
            if (type === 'batchCollisionResults') {
                // Process hazard collisions
                const { hazardCollisions, miningRange } = data;
                
                // Apply vortex pulls
                if (hazardCollisions.vortexPulls) {
                    for (const pull of hazardCollisions.vortexPulls) {
                        player.vx += pull.vx;
                        player.vy += pull.vy;
                    }
                }
                
                // Process collisions and damage
                if (hazardCollisions.collisions) {
                    for (const collision of hazardCollisions.collisions) {
                        // Only apply damage every 30 frames (same as before)
                        if (frameCount % 30 === 0) {
                            damagePlayer(collision.damage);
                        }
                        
                        // Remove hazard if needed
                        if (collision.removeHazard && collision.index < hazards.length) {
                            hazards.splice(collision.index, 1);
                            
                            // Create explosion particles
                            for (let j = 0; j < 20; j++) {
                                createParticle(collision.x, collision.y, collision.color);
                            }
                        }
                    }
                }
                
                // Store mining range result for use in mining logic
                player.asteroidInRange = miningRange.asteroidInRange;
                player.closestAsteroidData = miningRange.closestAsteroid;
                
                pendingCollisionCheck = false;
            }
        };
        
        collisionWorker.onerror = function(error) {
            console.error('Collision worker error:', error);
            collisionWorkerReady = false;
            pendingCollisionCheck = false;
        };
        
        console.log('Collision worker initialized');
        
    } catch (error) {
        console.warn('Could not initialize collision worker, using main thread:', error);
        collisionWorkerReady = false;
    }
}

function initFPSWorker() {
    try {
        // Create the worker
        fpsWorker = new Worker('asteroid-miner-fps-worker.js');
        
        // Handle messages from worker
        fpsWorker.onmessage = function(e) {
            const { type, fps } = e.data;
            
            if (type === 'ready') {
                fpsWorkerReady = true;
                console.log('FPS worker ready');
            } else if (type === 'fpsUpdate') {
                // Update the display with the FPS value from the worker
                const fpsCounter = document.getElementById('fpsCounter');
                if (fpsCounter && fpsCounterEnabled) {
                    fpsCounter.textContent = `FPS: ${fps}`;
                }
            }
        };
        
        fpsWorker.onerror = function(error) {
            console.error('FPS worker error:', error);
            fpsWorkerReady = false;
        };
        
        // Initialize the worker
        fpsWorker.postMessage({ type: 'init', timestamp: performance.now() });
        
        console.log('FPS worker initialized');
        
    } catch (error) {
        console.warn('Could not initialize FPS worker, FPS counter may have minor overhead:', error);
        fpsWorkerReady = false;
    }
}

function generateSector() {
    asteroids = [];
    hazards = [];
    
    // Generate new stations for this sector ONLY if stations don't already exist
    // (stations may have been loaded from save)
    if (stations.length === 0) {
        initStationState();
    }
    
    // Generate asteroids based on sector
    const asteroidCount = 30 + gameState.sector * 5;
    
    for (let i = 0; i < asteroidCount; i++) {
        spawnAsteroid(
            Math.random() * CONFIG.worldWidth,
            Math.random() * CONFIG.worldHeight
        );
    }
    
    // Generate hazards
    const hazardCount = Math.floor(2 + gameState.sector * 0.5);
    
    for (let i = 0; i < hazardCount; i++) {
        spawnHazard(
            Math.random() * CONFIG.worldWidth,
            Math.random() * CONFIG.worldHeight
        );
    }
    
    logMessage(`Generated sector ${gameState.sectorName} with ${asteroidCount} asteroids`);
}

function generateAsteroidGeometry() {
    // Create irregular polygon for asteroid
    const points = [];
    const numPoints = 8 + Math.floor(Math.random() * 5); // 8-12 points
    const baseRadius = 15;
    
    for (let i = 0; i < numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        const radiusVariation = 0.6 + Math.random() * 0.4; // 60-100% of base radius
        const radius = baseRadius * radiusVariation;
        
        points.push({
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius
        });
    }
    
    return points;
}

function spawnAsteroid(x, y) {
    // Determine asteroid type based on rarity
    // Higher sectors increase rare asteroid chances
    const sectorBonus = (gameState.sector - 1) * 0.1; // +10% per sector
    
    let type = 'common';
    const roll = Math.random();
    let cumulative = 0;
    
    // Adjust probabilities based on sector
    // Common becomes less likely, rare becomes more likely
    const adjustedChances = {};
    let totalAdjusted = 0;
    
    for (const [key, data] of Object.entries(ASTEROID_TYPES)) {
        if (key === 'common') {
            // Reduce common asteroid chance in higher sectors
            adjustedChances[key] = Math.max(0.2, data.chance - sectorBonus);
        } else {
            // Increase rare asteroid chances
            const rareMultiplier = key === 'crystal' || key === 'platinum' ? 2.0 : 1.5;
            adjustedChances[key] = data.chance * (1 + sectorBonus * rareMultiplier);
        }
        totalAdjusted += adjustedChances[key];
    }
    
    // Normalize probabilities to sum to 1
    for (const key in adjustedChances) {
        adjustedChances[key] /= totalAdjusted;
    }
    
    // Select asteroid type based on adjusted probabilities
    for (const [key, chance] of Object.entries(adjustedChances)) {
        cumulative += chance;
        if (roll <= cumulative) {
            type = key;
            break;
        }
    }
    
    const asteroidData = ASTEROID_TYPES[type];
    const geometry = generateAsteroidGeometry();
    
    asteroids.push({
        x: x,
        y: y,
        type: type,
        health: asteroidData.health,
        maxHealth: asteroidData.health,
        vx: (Math.random() - 0.5) * 0.3,  // Reduced from 3.33
        vy: (Math.random() - 0.5) * 0.3,  // Reduced from 3.33
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.03,  // Reduced from 0.33
        geometry: geometry, // Current shape
        originalGeometry: JSON.parse(JSON.stringify(geometry)) // Store original shape for scaling
    });
}

function spawnHazard(x, y) {
    const types = Object.keys(HAZARD_TYPES);
    const type = types[Math.floor(Math.random() * types.length)];
    const hazardData = HAZARD_TYPES[type];
    
    hazards.push({
        x: x,
        y: y,
        type: type,
        vx: (Math.random() - 0.5) * hazardData.speed,
        vy: (Math.random() - 0.5) * hazardData.speed,
        rotation: Math.random() * Math.PI * 2
    });
}

// ================================
// GAME INITIALIZATION
// ================================

let gameInitialized = false;

function initGame() {
    if (gameInitialized) {
        //console.warn('Game already initialized, skipping duplicate init');
        return;
    }
    
    gameInitialized = true;
    logMessage('Initializing game systems...');
    
    initTheme();
    initCRT();
    initControlsHint();
    initShipRename();
    initPauseModal();
    initCustomization();
    initInput();
    initUpgrades();
    initMinimapScanner();
    initConsoleInput();
    
    document.getElementById('clearConsole').addEventListener('click', clearConsole);
    
    resizeCanvas();
    
    // Debounced resize handler for better consistency
    let resizeTimeout;
    window.addEventListener('resize', () => {
        // Clear any pending resize
        if (resizeTimeout) {
            clearTimeout(resizeTimeout);
        }
        
        // Wait for layout to stabilize, then resize twice to ensure proper dimensions
        resizeTimeout = setTimeout(() => {
            requestAnimationFrame(() => {
                resizeCanvas();
                // Do it again after a frame to catch any delayed flex calculations
                requestAnimationFrame(() => {
                    resizeCanvas();
                });
            });
        }, 50); // 50ms debounce
    });
    
    generateStars();
    
    // Only generate a new sector if asteroids/hazards weren't loaded from save
    if (asteroids.length === 0 && hazards.length === 0) {
        generateSector();
    }
    
    // Station state was already initialized before boot sequence
    // Only set player position if NOT loaded from save (check if position is default)
    // Default player position is 0,0, so if player is still at origin, we need to set a proper position
    if (player.x === 0 && player.y === 0 && player.vx === 0 && player.vy === 0) {
        const dockedStation = stations.find(st => st.isDocked);
        
        if (dockedStation) {
            // Start docked at the station
            player.x = dockedStation.x;
            player.y = dockedStation.y;
            player.vx = dockedStation.vx;
            player.vy = dockedStation.vy;
        } else {
            // Start somewhere random in the world
            const margin = 500;
            player.x = margin + Math.random() * (CONFIG.worldWidth - margin * 2);
            player.y = margin + Math.random() * (CONFIG.worldHeight - margin * 2);
            player.vx = 0;
            player.vy = 0;
        }
    }
    // If player position was loaded from save, keep it unchanged
    
    // Initialize viewport centered on player (use loaded zoom if available, or default to 1.0)
    if (viewport.zoom === 1.0 && viewport.targetZoom === 1.0) {
        // No zoom was loaded from save, use defaults
        viewport.zoom = 1.0;
        viewport.targetZoom = 1.0;
    }
    // Always recalculate viewport position based on player location
    viewport.x = player.x - (VIEWPORT_REFERENCE.WIDTH / 2) / viewport.zoom;
    viewport.y = player.y - (VIEWPORT_REFERENCE.HEIGHT / 2) / viewport.zoom;
    
    updateUI();
    
    logMessage('All systems online. Ready for mining operations.');
    logMessage('Use WASD to move, SPACE to mine asteroids.');
    
    gameLoop();
}


// ================================
// GAME LOOP
// ================================

let lastTime = 0;
let frameCount = 0;
let lastAutoSaveTime = 0;
const AUTO_SAVE_INTERVAL = 30000; // 30 seconds in milliseconds

function gameLoop(currentTime = 0) {
    requestAnimationFrame(gameLoop);
    
    let deltaTime = currentTime - lastTime;
    lastTime = currentTime;
    
    // Clamp deltaTime to prevent issues on first frame or tab switching
    // Max 100ms (10 FPS minimum) to prevent huge jumps
    if (deltaTime > 100 || deltaTime <= 0) {
        deltaTime = 16.67; // Default to 60 FPS
    }
    
    // Store delta time for use in render functions
    currentDeltaTime = deltaTime;
    
    if (!gameState.isPaused) {
        // Update gamepad input
        updateGamepad();
        
        update(deltaTime);
    } else {
        // Even when paused, update gamepad for virtual mouse in menus
        updateGamepad();
    }
    
    render();
    
    // Update virtual mouse cursor (works even when paused)
    if (virtualMouseActive) {
        updateVirtualMouseCursor();
    }
    
    frameCount++;
    if (frameCount % 60 === 0) {
        gameState.stats.playTime++;
    }
    
    // Send frame notification to FPS worker (zero overhead on main thread)
    if (fpsCounterEnabled && fpsWorkerReady && fpsWorker) {
        fpsWorker.postMessage({ type: 'frame', timestamp: currentTime });
    }
    
    // Auto-save every 30 seconds
    if (currentTime - lastAutoSaveTime >= AUTO_SAVE_INTERVAL) {
        saveGame('AutoSave');
        lastAutoSaveTime = currentTime;
    }
}

// ================================
// SCAN SYSTEM FUNCTIONS
// ================================

function triggerScan() {
    // Check cooldown
    if (scanState.cooldown > 0) {
        logMessage(`Scan recharging... ${Math.ceil(scanState.cooldown / 1000)}s remaining`);
        return;
    }

    // Calculate upgraded values
    const scanRange = SCAN_CONFIG.baseRange + (gameState.upgrades.scanRange - 1) * SCAN_CONFIG.rangePerLevel;
    const scanCooldown = Math.max(2000, SCAN_CONFIG.baseCooldown - (gameState.upgrades.scanCooldown - 1) * SCAN_CONFIG.cooldownReduction);
    
    // Start scan
    scanState.active = true;
    scanState.waveRadius = 0;
    scanState.waveMaxRadius = scanRange;
    scanState.displayTime = SCAN_CONFIG.displayDuration;
    scanState.detectedItems = [];
    scanState.startTime = Date.now();
    scanState.cooldown = scanCooldown;
    scanState.cooldownMax = scanCooldown;
    
    logMessage('Initiating deep space scan...');
}

function updateScan(deltaTime) {
    // Update cooldown
    if (scanState.cooldown > 0) {
        scanState.cooldown -= deltaTime;
        if (scanState.cooldown < 0) scanState.cooldown = 0;
    }
    
    if (!scanState.active) return;
    
    // Expand wave
    scanState.waveRadius += scanState.waveSpeed;
    
    // Detect objects as wave passes over them
    if (scanState.waveRadius <= scanState.waveMaxRadius) {
        const prevRadius = scanState.waveRadius - scanState.waveSpeed;
        
        // Check asteroids
        for (let i = 0; i < asteroids.length; i++) {
            const ast = asteroids[i];
            const dx = ast.x - player.x;
            const dy = ast.y - player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            // If object is in the ring between previous and current wave radius
            if (dist > prevRadius && dist <= scanState.waveRadius && dist <= scanState.waveMaxRadius) {
                // Check if not already detected
                const alreadyDetected = scanState.detectedItems.some(item => 
                    item.type === 'asteroid' && item.object === ast
                );
                
                if (!alreadyDetected) {
                    const typeData = ASTEROID_TYPES[ast.type];
                    // Calculate value with prestige bonus (same as when selling)
                    const baseValue = typeData.value;
                    const bonusValue = Math.floor(baseValue * (gameState.prestigeBonus / 100));
                    const totalValue = baseValue + bonusValue;
                    
                    scanState.detectedItems.push({
                        type: 'asteroid',
                        object: ast, // Store reference to track movement
                        name: typeData.name,
                        value: totalValue,
                        color: typeData.color
                    });
                }
            }
        }
        
        // Check hazards
        for (let i = 0; i < hazards.length; i++) {
            const haz = hazards[i];
            const dx = haz.x - player.x;
            const dy = haz.y - player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist > prevRadius && dist <= scanState.waveRadius && dist <= scanState.waveMaxRadius) {
                const alreadyDetected = scanState.detectedItems.some(item => 
                    item.type === 'hazard' && item.object === haz
                );
                
                if (!alreadyDetected) {
                    const typeData = HAZARD_TYPES[haz.type];
                    scanState.detectedItems.push({
                        type: 'hazard',
                        object: haz, // Store reference to track movement
                        name: typeData.name,
                        color: typeData.color
                    });
                }
            }
        }
    }
    
    // Check if wave is complete
    if (scanState.waveRadius >= scanState.waveMaxRadius) {
        scanState.active = false;
        logMessage(`Scan complete. ${scanState.detectedItems.length} objects detected.`);
    }
    
    // Clean up detected items that no longer exist (destroyed asteroids/hazards)
    scanState.detectedItems = scanState.detectedItems.filter(item => {
        if (item.type === 'asteroid') {
            // Remove if asteroid is destroyed or no longer in the array
            return asteroids.includes(item.object) && !item.object.destroyed;
        } else if (item.type === 'hazard') {
            return hazards.includes(item.object);
        }
        return false;
    });
    
    // Check if display time has expired
    const elapsed = Date.now() - scanState.startTime;
    if (elapsed > scanState.displayTime) {
        scanState.detectedItems = [];
    }
}

// ================================
// CARGO DRONE SYSTEM
// ================================

function deployCargoDrone() {
    // Check if upgrade is purchased
    if (gameState.upgrades.cargoDrone < 1) {
        logMessage('Cargo drone not installed. Purchase from External upgrades.');
        return;
    }
    
    // Check if drone is already active
    if (cargoDrone !== null) {
        logMessage('Cargo drone already deployed.');
        return;
    }
    
    // Check if player has cargo to sell
    if (gameState.cargo === 0) {
        logMessage('No cargo to sell.');
        return;
    }
    
    // Find nearest station
    const nearestStation = findNearestStation();
    if (!nearestStation) {
        logMessage('No station found in this sector.');
        return;
    }
    
    console.log('Deploying cargo drone:');
    console.log('- Nearest station:', nearestStation.name);
    console.log('- Station position:', nearestStation.x, nearestStation.y);
    console.log('- Player position:', player.x, player.y);
    console.log('- Player angle:', player.angle);
    
    // Create cargo inventory snapshot
    const cargoToSell = { ...gameState.inventory };
    const cargoAmount = gameState.cargo;
    
    // Clear player cargo
    gameState.inventory = {};
    gameState.cargo = 0;
    updateUI();
    
    // Spawn drone at ship's exact location
    // It will immediately start moving toward the station
    const spawnX = player.x;
    const spawnY = player.y;
    
    // Deploy drone
    cargoDrone = {
        x: spawnX,
        y: spawnY,
        vx: 0,
        vy: 0,
        targetStation: nearestStation,
        state: 'traveling', // 'traveling', 'docked', 'returning'
        cargo: cargoToSell,
        cargoAmount: cargoAmount,
        credits: 0,
        dockTime: 0,
        dockDuration: 1000, // 1 second at station
        size: 15,
        speed: 3.5 // Faster than player
    };
    
    logMessage(`Cargo drone deployed with ${cargoAmount} units. Heading to ${nearestStation.name}.`);
    createFloatingText(player.x, player.y - 30, 'DRONE DEPLOYED', '#00ff00');
}

function findNearestStation() {
    let nearest = null;
    let minDist = Infinity;
    
    for (let station of stations) {
        const dx = station.x - player.x;
        const dy = station.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < minDist) {
            minDist = dist;
            nearest = station;
        }
    }
    
    return nearest;
}

function updateCargoDrone(dt) {
    if (cargoDrone === null) return;
    
    const drone = cargoDrone;
    
    if (drone.state === 'traveling') {
        // Move toward target station
        const dx = drone.targetStation.x - drone.x;
        const dy = drone.targetStation.y - drone.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Debug: Log distance to target every 60 frames (once per second at 60fps)
        if (frameCount % 60 === 0) {
            console.log(`Drone traveling - Distance to ${drone.targetStation.name}: ${dist.toFixed(2)}`);
        }
        
        if (dist < 50) {
            // Arrived at station
            drone.state = 'docked';
            drone.dockTime = Date.now();
            logMessage(`Drone docked at ${drone.targetStation.name}. Selling cargo...`);
        } else {
            // Move toward station
            const angle = Math.atan2(dy, dx);
            drone.vx = Math.cos(angle) * drone.speed;
            drone.vy = Math.sin(angle) * drone.speed;
            drone.x += drone.vx * dt;
            drone.y += drone.vy * dt;
        }
    } else if (drone.state === 'docked') {
        // Wait at station
        const elapsed = Date.now() - drone.dockTime;
        
        if (elapsed >= drone.dockDuration) {
            // Sell cargo and get credits
            let totalValue = 0;
            for (let type in drone.cargo) {
                const quantity = drone.cargo[type];
                const asteroidData = ASTEROID_TYPES[type];
                if (asteroidData) {
                    totalValue += asteroidData.value * quantity;
                }
            }
            
            drone.credits = totalValue;
            drone.state = 'returning';
            logMessage(`Drone sold cargo for ${totalValue}¢. Returning to ship.`);
        }
    } else if (drone.state === 'returning') {
        // Move back toward player
        const dx = player.x - drone.x;
        const dy = player.y - drone.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 50) {
            // Arrived back at player
            gameState.credits += drone.credits;
            logMessage(`Drone returned with ${drone.credits}¢!`);
            createFloatingText(player.x, player.y - 30, `+${drone.credits}¢`, '#00ff00');
            updateUI();
            
            // Remove drone
            cargoDrone = null;
        } else {
            // Move toward player
            const angle = Math.atan2(dy, dx);
            drone.vx = Math.cos(angle) * drone.speed;
            drone.vy = Math.sin(angle) * drone.speed;
            drone.x += drone.vx * dt;
            drone.y += drone.vy * dt;
        }
    }
}

function renderCargoDrone(ctx) {
    if (cargoDrone === null) return;
    
    const drone = cargoDrone;
    
    // Render in world space (like other game objects)
    ctx.save();
    ctx.translate(drone.x, drone.y);
    
    // Calculate angle based on velocity
    let angle = 0;
    if (drone.vx !== 0 || drone.vy !== 0) {
        angle = Math.atan2(drone.vy, drone.vx);
    }
    ctx.rotate(angle);
    
    // Draw small rectangle body using player colors
    ctx.fillStyle = player.colors.primary;
    ctx.strokeStyle = player.colors.secondary;
    ctx.lineWidth = 1.5;
    
    ctx.fillRect(-drone.size * 0.6, -drone.size * 0.3, drone.size * 1.2, drone.size * 0.6);
    ctx.strokeRect(-drone.size * 0.6, -drone.size * 0.3, drone.size * 1.2, drone.size * 0.6);
    
    // Draw cargo indicator (if carrying cargo) - using accent color
    if (drone.state === 'traveling' || drone.state === 'docked') {
        ctx.fillStyle = player.colors.accent;
        ctx.fillRect(-drone.size * 0.3, -drone.size * 0.2, drone.size * 0.6, drone.size * 0.4);
    }
    
    // Draw credits indicator (if carrying credits) - using accent color
    if (drone.state === 'returning') {
        ctx.fillStyle = player.colors.accent;
        ctx.fillRect(-drone.size * 0.3, -drone.size * 0.2, drone.size * 0.6, drone.size * 0.4);
    }
    
    // Draw thruster flame if moving - using player thruster color
    if (drone.vx !== 0 || drone.vy !== 0) {
        const speed = Math.sqrt(drone.vx * drone.vx + drone.vy * drone.vy);
        const flameLength = speed * 3;
        
        ctx.fillStyle = player.colors.thruster;
        ctx.beginPath();
        ctx.moveTo(-drone.size * 0.6, 0);
        ctx.lineTo(-drone.size * 0.6 - flameLength, -drone.size * 0.15);
        ctx.lineTo(-drone.size * 0.6 - flameLength * 0.7, 0);
        ctx.lineTo(-drone.size * 0.6 - flameLength, drone.size * 0.15);
        ctx.closePath();
        ctx.fill();
    }
    
    ctx.restore();
    
    // Draw status label in world space above the drone
    ctx.save();
    ctx.translate(drone.x, drone.y - drone.size);
    ctx.scale(1 / viewport.zoom, 1 / viewport.zoom); // Keep text size consistent
    ctx.fillStyle = player.colors.accent;
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    let statusText = '';
    if (drone.state === 'traveling') statusText = 'TRAVELING';
    else if (drone.state === 'docked') statusText = 'SELLING';
    else if (drone.state === 'returning') statusText = `RETURNING (${drone.credits}¢)`;
    ctx.fillText(statusText, 0, 0);
    ctx.restore();
}

function renderScan() {
    // Render expanding wave
    if (scanState.active) {
        ctx.save();
        ctx.strokeStyle = SCAN_CONFIG.lineColor;
        ctx.lineWidth = 2 / viewport.zoom; // Scale line width with zoom
        ctx.globalAlpha = 0.6;
        
        ctx.beginPath();
        ctx.arc(player.x, player.y, scanState.waveRadius, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.restore();
    }
    
    // Render detected items
    if (scanState.detectedItems.length > 0) {
        const elapsed = Date.now() - scanState.startTime;
        const fadeStart = scanState.displayTime - SCAN_CONFIG.fadeOutDuration;
        
        let alpha = 1;
        if (elapsed > fadeStart) {
            alpha = 1 - ((elapsed - fadeStart) / SCAN_CONFIG.fadeOutDuration);
        }
        
        if (alpha > 0) {
            ctx.save();
            ctx.globalAlpha = alpha;
            
            for (let i = 0; i < scanState.detectedItems.length; i++) {
                const item = scanState.detectedItems[i];
                
                // Use the object's current position (tracks movement)
                const currentX = item.object.x;
                const currentY = item.object.y;
                
                // Scale diagonal length with zoom for consistent screen size
                const scaledLabelOffset = SCAN_CONFIG.labelOffset / viewport.zoom;
                
                // Set up bold font first to measure text width
                ctx.font = `bold ${SCAN_CONFIG.fontSize / viewport.zoom}px 'Courier New', monospace`;
                
                // Measure the name text width
                const nameWidth = ctx.measureText(item.name).width;
                
                // Measure value/danger text width if Advanced Scanner is active
                let valueWidth = 0;
                if (gameState.upgrades.advancedScanner >= 1) {
                    if (item.type === 'asteroid') {
                        valueWidth = ctx.measureText(`${item.value}¢`).width;
                    } else if (item.type === 'hazard') {
                        valueWidth = ctx.measureText('DANGER!!').width;
                    }
                }
                
                // Use the longest text width to determine horizontal line length
                const maxTextWidth = Math.max(nameWidth, valueWidth);
                const textHorizontalOffset = 5 / viewport.zoom;
                const scaledHorizontalLength = maxTextWidth + textHorizontalOffset * 2; // Add padding on both sides
                
                // Draw diagonal line up-right from current position
                const diagonalEndX = currentX + scaledLabelOffset;
                const diagonalEndY = currentY - scaledLabelOffset;
                
                ctx.strokeStyle = item.color;
                ctx.lineWidth = 2 / viewport.zoom; // Thicker lines to match bold text
                ctx.beginPath();
                ctx.moveTo(currentX, currentY);
                ctx.lineTo(diagonalEndX, diagonalEndY);
                ctx.stroke();
                
                // Draw horizontal line based on text width
                const horizontalEndX = diagonalEndX + scaledHorizontalLength;
                ctx.beginPath();
                ctx.moveTo(diagonalEndX, diagonalEndY);
                ctx.lineTo(horizontalEndX, diagonalEndY);
                ctx.stroke();
                
                // Draw labels with bold font
                ctx.fillStyle = item.color;
                ctx.textAlign = 'left';
                
                // Scale spacing with zoom for consistency
                const textVerticalSpacing = 5 / viewport.zoom;
                const textLineSpacing = 12 / viewport.zoom;
                
                // Name above the horizontal line
                ctx.fillText(item.name, diagonalEndX + textHorizontalOffset, diagonalEndY - textVerticalSpacing);
                
                // Only show value/danger text if Advanced Scanner is purchased
                if (gameState.upgrades.advancedScanner >= 1) {
                    // For asteroids, show value below the line
                    if (item.type === 'asteroid') {
                        ctx.fillText(`${item.value}¢`, diagonalEndX + textHorizontalOffset, diagonalEndY + textLineSpacing);
                    }
                    
                    // For hazards, show danger warning below the line
                    if (item.type === 'hazard') {
                        ctx.fillText('DANGER!!', diagonalEndX + textHorizontalOffset, diagonalEndY + textLineSpacing);
                    }
                }
            }
            
            ctx.restore();
        }
    }
}

// ================================
// UPDATE LOGIC
// ================================

function update(deltaTime) {
    // Normalize deltaTime to 60 FPS (16.67ms per frame)
    // This makes all calculations framerate-independent
    const dt = deltaTime / 16.67;
    
    // Update scan system
    updateScan(deltaTime);
    
    // Update cargo drone
    updateCargoDrone(dt);
    
    // Update station
    updateStation(dt);
    
    // Update rescue ship
    updateRescueShip(dt);
    
    // Update player
    updatePlayer(dt);
    
    // Update asteroids on main thread (preserves object references for mining)
    updateAsteroids(dt);
    
    // Update hazards and particles using worker if available
    if (physicsWorkerReady && !pendingPhysicsUpdate) {
        // Send to worker for parallel processing
        // Note: Asteroids are updated on main thread to preserve object references
        pendingPhysicsUpdate = true;
        physicsWorker.postMessage({
            type: 'updateAll',
            data: {
                asteroids: [], // Don't send asteroids to worker
                hazards: hazards,
                particles: particles,
                dt: dt
            }
        });
    } else {
        // Fallback to main thread if worker not ready or still processing
        updateHazards(dt);
        updateParticles(dt);
    }
    
    // Update floating text
    updateFloatingText(dt);
    
    // Update viewport
    updateViewport(dt);
    
    // Update star positions (slow drift)
    updateStars(dt);
    
    // Spawn new objects (time-consistent spawning)
    // Scale spawn chances by deltaTime to maintain consistent spawn rates
    // Higher sectors have increased spawn rates (+10% per sector)
    const sectorSpawnMultiplier = 1 + (gameState.sector - 1) * 0.1;
    
    // Calculate max limits based on sector
    const maxAsteroids = CONFIG.baseMaxAsteroids + (gameState.sector * CONFIG.maxAsteroidsPerSector);
    const maxHazards = CONFIG.baseMaxHazards + (gameState.sector * CONFIG.maxHazardsPerSector);
    
    // Only spawn if under the limit
    if (asteroids.length < maxAsteroids && Math.random() < CONFIG.asteroidSpawnChance * sectorSpawnMultiplier * dt) {
        const edge = Math.floor(Math.random() * 4);
        let x, y;
        
        switch(edge) {
            case 0: x = Math.random() * CONFIG.worldWidth; y = 0; break;
            case 1: x = CONFIG.worldWidth; y = Math.random() * CONFIG.worldHeight; break;
            case 2: x = Math.random() * CONFIG.worldWidth; y = CONFIG.worldHeight; break;
            case 3: x = 0; y = Math.random() * CONFIG.worldHeight; break;
        }
        
        spawnAsteroid(x, y);
    }
    
    // Only spawn hazards if under the limit
    if (hazards.length < maxHazards && Math.random() < CONFIG.hazardSpawnChance * sectorSpawnMultiplier * dt) {
        const edge = Math.floor(Math.random() * 4);
        let x, y;
        
        switch(edge) {
            case 0: x = Math.random() * CONFIG.worldWidth; y = 0; break;
            case 1: x = CONFIG.worldWidth; y = Math.random() * CONFIG.worldHeight; break;
            case 2: x = Math.random() * CONFIG.worldWidth; y = CONFIG.worldHeight; break;
            case 3: x = 0; y = Math.random() * CONFIG.worldHeight; break;
        }
        
        spawnHazard(x, y);
    }
    
    // Update UI periodically
    if (frameCount % 10 === 0) {
        updateUI();
    }
}

function updatePlayer(dt = 1) {
    // Only lock player during flying_to_player and refueling states, NOT when rescue ship is returning
    if (rescueShip && (rescueShip.state === 'flying_to_player' || rescueShip.state === 'refueling')) {
        // Completely lock the ship in place - no movement at all
        player.vx = 0;
        player.vy = 0;
        
        // Don't change angle - keep player's current rotation
        // (Removed the "point toward rescue ship" behavior)
        
        return; // Skip all normal player controls
    }
    
    // Check for player input FIRST (before auto-pilot processes)
    // This allows player to cancel auto-pilot with any input
    let moveX = 0;
    let moveY = 0;
    
    // Keyboard
    if (keys['w'] || keys['arrowup']) moveY -= 1;
    if (keys['s'] || keys['arrowdown']) moveY += 1;
    if (keys['a'] || keys['arrowleft']) moveX -= 1;
    if (keys['d'] || keys['arrowright']) moveX += 1;
    
    // Gamepad (Left Stick) - inject into the same moveX/moveY system
    // BUT: Don't read gamepad input if virtual mouse is active
    if (gamepadConnected && gamepadIndex !== null && !virtualMouseActive) {
        const gamepads = navigator.getGamepads();
        const gamepad = gamepads[gamepadIndex];
        
        if (gamepad) {
            const DEADZONE = 0.15;
            const leftX = Math.abs(gamepad.axes[0]) > DEADZONE ? gamepad.axes[0] : 0;
            const leftY = Math.abs(gamepad.axes[1]) > DEADZONE ? gamepad.axes[1] : 0;
            
            if (leftX !== 0 || leftY !== 0) {
                // Add gamepad stick input to movement (it will override keyboard if both are used)
                moveX = leftX;
                moveY = leftY;
            }
        }
    }
    
    // Touch Controls - canvas acts as directional joystick
    if (touchActive) {
        // Calculate ship position in viewport reference space
        // This accounts for viewport clamping at world edges
        const shipScreenX = (player.x - viewport.x) * viewport.zoom;
        const shipScreenY = (player.y - viewport.y) * viewport.zoom;
        
        // Calculate direction from ship's screen position to touch point
        const dx = touchX - shipScreenX;
        const dy = touchY - shipScreenY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Only apply movement if touch is not too close to ship (dead zone)
        if (distance > 30) {
            // Normalize to -1 to 1 range with smooth scaling
            const maxDistance = Math.min(VIEWPORT_REFERENCE.WIDTH, VIEWPORT_REFERENCE.HEIGHT) / 2;
            const normalizedDistance = Math.min(distance / maxDistance, 1);
            
            moveX = (dx / distance) * normalizedDistance;
            moveY = (dy / distance) * normalizedDistance;
        }
    }
    
    // Auto-mining toggle for touch devices - automatically mine when asteroids are in range
    let playerWantsToMine = keys['space'];
    if (isTouchDevice && autoMiningEnabled && !isDockedAtAnyStation()) {
        // Automatically attempt mining on touch devices when toggle is ON
        playerWantsToMine = true;
    }
    
    // Check if there are asteroids in mining range (only needed if trying to mine)
    let asteroidInRange = false;
    if (playerWantsToMine) {
        const miningRange = CONFIG.miningRange + (gameState.upgrades.range - 1) * 10;
        for (let i = 0; i < asteroids.length; i++) {
            const dx = asteroids[i].x - player.x;
            const dy = asteroids[i].y - player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < miningRange) {
                asteroidInRange = true;
                break;
            }
        }
    }
    
    // Cancel auto-pilot if player provides movement input (but NOT mining - allow mining during autopilot)
    if (autoPilotActive && (moveX !== 0 || moveY !== 0)) {
        autoPilotActive = false;
        logMessage('Auto-pilot cancelled - manual control resumed.');
        updateNavigationButtonText();
    }
    
    // Auto-pilot logic (only runs if still active after input check)
    if (autoPilotActive) {
        // Find the nearest station
        const nearestStation = findNearestStation(player.x, player.y);
        
        if (!nearestStation) {
            autoPilotActive = false;
            logMessage('Auto-pilot error: No station found.');
            updateNavigationButtonText();
            return;
        }
        
        const dx = nearestStation.x - player.x;
        const dy = nearestStation.y - player.y;
        const distToStation = Math.sqrt(dx * dx + dy * dy);
        
        // Disable auto-pilot if we're in the gravitational pull zone
        if (distToStation < nearestStation.dockingRange) {
            autoPilotActive = false;
            logMessage(`Auto-pilot disengaged. ${nearestStation.name} gravity engaged.`);
            updateNavigationButtonText();
        } else {
            // Auto-navigate toward station
            const targetAngle = Math.atan2(dy, dx);
            const angleDiff = targetAngle - player.angle;
            
            // Normalize angle difference to [-PI, PI]
            let normalizedAngleDiff = angleDiff;
            while (normalizedAngleDiff > Math.PI) normalizedAngleDiff -= 2 * Math.PI;
            while (normalizedAngleDiff < -Math.PI) normalizedAngleDiff += 2 * Math.PI;
            
            // Smoothly rotate toward target
            player.angle += normalizedAngleDiff * 0.1 * dt;
            
            // Accelerate forward - only if fuel available
            const autopilotMoveX = Math.cos(player.angle);
            const autopilotMoveY = Math.sin(player.angle);
            const speed = CONFIG.baseSpeed * (1 + (gameState.upgrades.speed - 1) * 0.2);
            if (gameState.fuel > 0) {
                player.vx += autopilotMoveX * CONFIG.acceleration * dt;
                player.vy += autopilotMoveY * CONFIG.acceleration * dt;
            }
            
            // Apply friction and speed limit
            const frictionFactor = Math.pow(CONFIG.friction, dt);
            player.vx *= frictionFactor;
            player.vy *= frictionFactor;
            
            const currentSpeed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
            if (currentSpeed > speed) {
                player.vx = (player.vx / currentSpeed) * speed;
                player.vy = (player.vy / currentSpeed) * speed;
            }
            
            // Update position
            player.x += player.vx * dt;
            player.y += player.vy * dt;
            
            // Consume fuel during autopilot movement (only if not docked)
            if (!isDockedAtAnyStation()) {
                if (godModeActive) {
                    gameState.fuel = gameState.maxFuel;
                } else {
                    const fuelCost = CONFIG.baseFuelConsumption * (1 - (gameState.upgrades.fuel - 1) * 0.05) * dt;
                    gameState.fuel = Math.max(0, gameState.fuel - fuelCost);
                }
                gameState.stats.distanceTraveled += currentSpeed * dt;
            }
            
            // Keep player in bounds (with wrapping)
            player.x = Math.max(player.size, Math.min(CONFIG.worldWidth - player.size, player.x));
            player.y = Math.max(player.size, Math.min(CONFIG.worldHeight - player.size, player.y));
            
            // Check station proximity for docking (do this before updating angle)
            checkStationProximity(dt);
            
            // Mining logic during autopilot - allow mining while autopilot is active
            if (playerWantsToMine) {
                attemptMining(dt);
            } else {
                player.isMining = false;
                player.miningTarget = null;
                player.miningProgress = 0;
            }
            
            // Check hazard collisions during autopilot using worker if available
            if (collisionWorkerReady && !pendingCollisionCheck) {
                const miningRange = CONFIG.miningRange + (gameState.upgrades.range - 1) * 10;
                pendingCollisionCheck = true;
                collisionWorker.postMessage({
                    type: 'checkBatchCollisions',
                    data: {
                        player: {
                            x: player.x,
                            y: player.y,
                            size: player.size,
                            vx: player.vx,
                            vy: player.vy
                        },
                        asteroids: asteroids,
                        hazards: hazards,
                        dt: dt,
                        miningRange: miningRange
                    }
                });
            } else {
                // Fallback to main thread if worker not ready
                checkHazardCollisions(dt);
            }
            
            // Set manual control to false since auto-pilot is controlling
            player.isManuallyControlled = false;
            
            return; // Skip manual control
        }
    }
    
    // Manual control - use the moveX/moveY we already calculated at the top
    // (no need to recalculate - already done for auto-pilot cancellation check)
    
    // Set player manual control flag (calculate once, use everywhere)
    // This should NOT include autoPilotActive - only actual player input
    player.isManuallyControlled = (moveX !== 0 || moveY !== 0);
    
    // Apply movement (time-consistent) - only if fuel available
    const speed = CONFIG.baseSpeed * (1 + (gameState.upgrades.speed - 1) * 0.2);
    if (gameState.fuel > 0) {
        player.vx += moveX * CONFIG.acceleration * dt;
        player.vy += moveY * CONFIG.acceleration * dt;
    }
    
    // Apply friction (time-consistent)
    const frictionFactor = Math.pow(CONFIG.friction, dt);
    player.vx *= frictionFactor;
    player.vy *= frictionFactor;
    
    // Limit speed
    const currentSpeed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
    if (currentSpeed > speed) {
        player.vx = (player.vx / currentSpeed) * speed;
        player.vy = (player.vy / currentSpeed) * speed;
    }
    
    // Update position (time-consistent)
    if (currentSpeed > 0.1) {
        player.x += player.vx * dt;
        player.y += player.vy * dt;
        
        // Consume fuel ONLY when player is manually controlling (providing input) - not from gravity/momentum
        if (!isDockedAtAnyStation() && player.isManuallyControlled) {
            if (godModeActive) {
                gameState.fuel = gameState.maxFuel;
            } else {
                const fuelCost = CONFIG.baseFuelConsumption * (1 - (gameState.upgrades.fuel - 1) * 0.05) * dt;
                gameState.fuel = Math.max(0, gameState.fuel - fuelCost);
            }
            
            gameState.stats.distanceTraveled += currentSpeed * dt;
        }
    }
    
    // Clamp to world bounds
    player.x = Math.max(player.size, Math.min(CONFIG.worldWidth - player.size, player.x));
    player.y = Math.max(player.size, Math.min(CONFIG.worldHeight - player.size, player.y));
    
    // Check station proximity for docking (do this before updating angle)
    checkStationProximity(dt);
    
    // Check if player is within any station's docking range
    let withinDockingRange = false;
    for (const st of stations) {
        const dx = st.x - player.x;
        const dy = st.y - player.y;
        const distToStation = Math.sqrt(dx * dx + dy * dy);
        if (distToStation < st.dockingRange) {
            withinDockingRange = true;
            break;
        }
    }
    
    // Update angle based on velocity (skip if within docking range and not moving - station handles rotation)
    if (!(withinDockingRange && !player.isManuallyControlled) && (Math.abs(player.vx) > 0.1 || Math.abs(player.vy) > 0.1)) {
        player.angle = Math.atan2(player.vy, player.vx);
    }
    
    // Mining logic - use playerWantsToMine (includes auto-mining on touch devices)
    // Mining is now allowed during autopilot - autopilot won't be cancelled
    if (playerWantsToMine) {
        attemptMining(dt);
    } else {
        player.isMining = false;
        player.miningTarget = null;
        player.miningProgress = 0;
    }
    
    // Check hazard collisions using worker if available
    if (collisionWorkerReady && !pendingCollisionCheck) {
        const miningRange = CONFIG.miningRange + (gameState.upgrades.range - 1) * 10;
        pendingCollisionCheck = true;
        collisionWorker.postMessage({
            type: 'checkBatchCollisions',
            data: {
                player: {
                    x: player.x,
                    y: player.y,
                    size: player.size,
                    vx: player.vx,
                    vy: player.vy
                },
                asteroids: asteroids,
                hazards: hazards,
                dt: dt,
                miningRange: miningRange
            }
        });
    } else {
        // Fallback to main thread if worker not ready
        checkHazardCollisions(dt);
    }
    
    // Out of fuel warning and game over check
    if (gameState.fuel <= 0) {
        // Check if player can afford rescue (1.5x fuel needed) or is docked
        const fuelNeeded = gameState.maxFuel - gameState.fuel;
        const rescueCost = Math.ceil(fuelNeeded * 1.5);
        const canAffordRescue = gameState.credits >= rescueCost;
        const isDocked = isDockedAtAnyStation();
        
        // If player cannot afford rescue and is not docked, game over
        if (!canAffordRescue && !isDocked && frameCount % 120 === 0) {
            gameOverOutOfFuel();
        } else if (frameCount % 120 === 0) {
            if (isDocked) {
                logMessage('WARNING: Out of fuel! Refuel at station.');
            } else if (canAffordRescue) {
                logMessage('WARNING: Out of fuel! Call for rescue.');
            }
        }
    }
    
    // Low hull warning
    if (gameState.hull <= 20 && frameCount % 180 === 0) {
        logMessage('CRITICAL: Hull integrity low! Return to station immediately.');
    }
}

function updateStation(dt = 1) {
    // Update all stations
    stations.forEach(station => {
        // Update station rotation (time-consistent)
        station.rotation += station.rotationSpeed * dt;
        
        // Update station position (slow drift) (time-consistent)
        station.x += station.vx * dt;
        station.y += station.vy * dt;
        
        // Update hexagon vertices for collision detection
        station.vertices = [];
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i + station.rotation;
            station.vertices.push({
                x: station.x + Math.cos(angle) * station.size,
                y: station.y + Math.sin(angle) * station.size
            });
        }
        
        // Realistic bouncing using hexagon geometry
        // Check each vertex against world boundaries
        let hitLeft = false, hitRight = false, hitTop = false, hitBottom = false;
        let maxLeftPenetration = 0, maxRightPenetration = 0;
        let maxTopPenetration = 0, maxBottomPenetration = 0;
        
        for (const vertex of station.vertices) {
            // Check horizontal boundaries
            if (vertex.x < 0) {
                hitLeft = true;
                maxLeftPenetration = Math.max(maxLeftPenetration, -vertex.x);
            } else if (vertex.x > CONFIG.worldWidth) {
                hitRight = true;
                maxRightPenetration = Math.max(maxRightPenetration, vertex.x - CONFIG.worldWidth);
            }
            
            // Check vertical boundaries
            if (vertex.y < 0) {
                hitTop = true;
                maxTopPenetration = Math.max(maxTopPenetration, -vertex.y);
            } else if (vertex.y > CONFIG.worldHeight) {
                hitBottom = true;
                maxBottomPenetration = Math.max(maxBottomPenetration, vertex.y - CONFIG.worldHeight);
            }
        }
        
        // Store current speed to maintain it after bounce
        const currentSpeed = Math.sqrt(station.vx * station.vx + station.vy * station.vy);
        
        // Handle horizontal collisions
        if (hitLeft) {
            // Push station away from left wall
            station.x += maxLeftPenetration;
            // Reflect velocity (reverse horizontal component)
            station.vx = Math.abs(station.vx);
            // Add rotational impulse from wall collision
            station.rotationSpeed += (Math.random() - 0.5) * 0.002;
        } else if (hitRight) {
            // Push station away from right wall
            station.x -= maxRightPenetration;
            // Reflect velocity (reverse horizontal component)
            station.vx = -Math.abs(station.vx);
            // Add rotational impulse from wall collision
            station.rotationSpeed += (Math.random() - 0.5) * 0.002;
        }
        
        // Handle vertical collisions
        if (hitTop) {
            // Push station away from top wall
            station.y += maxTopPenetration;
            // Reflect velocity (reverse vertical component)
            station.vy = Math.abs(station.vy);
            // Add rotational impulse from wall collision
            station.rotationSpeed += (Math.random() - 0.5) * 0.002;
        } else if (hitBottom) {
            // Push station away from bottom wall
            station.y -= maxBottomPenetration;
            // Reflect velocity (reverse vertical component)
            station.vy = -Math.abs(station.vy);
            // Add rotational impulse from wall collision
            station.rotationSpeed += (Math.random() - 0.5) * 0.002;
        }
        
        // Normalize velocity to maintain original speed after bounce
        // This prevents speed loss from bouncing at angles
        if (hitLeft || hitRight || hitTop || hitBottom) {
            const newSpeed = Math.sqrt(station.vx * station.vx + station.vy * station.vy);
            if (newSpeed > 0) {
                const speedRatio = currentSpeed / newSpeed;
                station.vx *= speedRatio;
                station.vy *= speedRatio;
            }
        }
        
        // Cap rotation speed to prevent excessive spinning
        const maxRotationSpeed = 0.01; // Maximum rotation speed
        if (Math.abs(station.rotationSpeed) > maxRotationSpeed) {
            station.rotationSpeed = Math.sign(station.rotationSpeed) * maxRotationSpeed;
        }
    });
    
    // Check collisions with asteroids for ALL stations
    if (stations.length === 0) return;
    
    // Check each station for collisions
    stations.forEach(currentStation => {
        asteroids.forEach((asteroid, index) => {
            // Get asteroid base size from type data and scale by health
            const baseSize = ASTEROID_TYPES[asteroid.type]?.size || 12;
            const healthRatio = asteroid.health / asteroid.maxHealth;
            const asteroidSize = baseSize * healthRatio; // Shrink collision size as asteroid is mined
            
            // Check distance to each edge of the hexagon
            let closestDist = Infinity;
            let closestPoint = null;
            let closestNormal = null;
            
            for (let i = 0; i < currentStation.vertices.length; i++) {
                const v1 = currentStation.vertices[i];
                const v2 = currentStation.vertices[(i + 1) % currentStation.vertices.length];
                
                // Get distance from asteroid to this edge
                const dist = distanceToLineSegment(asteroid.x, asteroid.y, v1.x, v1.y, v2.x, v2.y);
                
                if (dist < closestDist) {
                    closestDist = dist;
                    
                    // Calculate the closest point on this edge
                    const A = asteroid.x - v1.x;
                    const B = asteroid.y - v1.y;
                    const C = v2.x - v1.x;
                    const D = v2.y - v1.y;
                    
                    const dot = A * C + B * D;
                    const lenSq = C * C + D * D;
                    let param = lenSq !== 0 ? dot / lenSq : -1;
                    
                    let closestX, closestY;
                    
                    if (param < 0) {
                        closestX = v1.x;
                        closestY = v1.y;
                    } else if (param > 1) {
                        closestX = v2.x;
                        closestY = v2.y;
                    } else {
                        closestX = v1.x + param * C;
                        closestY = v1.y + param * D;
                    }
                    
                    closestPoint = { x: closestX, y: closestY };
                    
                    // Calculate edge normal (perpendicular, pointing outward)
                    const edgeX = v2.x - v1.x;
                    const edgeY = v2.y - v1.y;
                    const edgeLen = Math.sqrt(edgeX * edgeX + edgeY * edgeY);
                    
                    // Perpendicular to edge
                    let normalX = -edgeY / edgeLen;
                    let normalY = edgeX / edgeLen;
                    
                    // Make sure normal points outward (away from station center)
                    const toCenter = (closestX - currentStation.x) * normalX + (closestY - currentStation.y) * normalY;
                    if (toCenter < 0) {
                        normalX = -normalX;
                        normalY = -normalY;
                    }
                    
                    closestNormal = { x: normalX, y: normalY };
                }
            }
            
            // Check if asteroid is colliding with any wall
            if (closestDist < asteroidSize) {
                // Collision detected - bounce off the wall
                if (closestNormal) {
                    // Always push asteroid out of collision zone first
                    const overlap = asteroidSize - closestDist;
                    asteroid.x += closestNormal.x * (overlap + 1);
                    asteroid.y += closestNormal.y * (overlap + 1);
                    
                    // Calculate relative velocity (asteroid velocity relative to station)
                    const relVx = asteroid.vx - currentStation.vx;
                    const relVy = asteroid.vy - currentStation.vy;
                    
                    // Calculate how much the asteroid is moving toward the wall (in relative space)
                    const dotProduct = relVx * closestNormal.x + relVy * closestNormal.y;
                    
                    // Only bounce if moving toward the wall relative to station
                    if (dotProduct < 0) {
                        // Reflect relative velocity across the wall normal
                        const newRelVx = relVx - 2 * dotProduct * closestNormal.x;
                        const newRelVy = relVy - 2 * dotProduct * closestNormal.y;
                        
                        // Convert back to world velocity
                        asteroid.vx = newRelVx + currentStation.vx;
                        asteroid.vy = newRelVy + currentStation.vy;
                    }
                }
            }
        });
        
        // Check collisions with hazards - station destroys hazards on contact
        for (let i = hazards.length - 1; i >= 0; i--) {
            const hazard = hazards[i];
            const hazardData = HAZARD_TYPES[hazard.type];
            
            const dx = hazard.x - currentStation.x;
            const dy = hazard.y - currentStation.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            // Check if hazard is close enough to collide with station
            if (dist < currentStation.size + hazardData.size) {
                // Station destroys the hazard
                hazards.splice(i, 1);
                
                // Add rotational impulse from hazard collision
                // Direction based on collision angle
                const collisionAngle = Math.atan2(dy, dx);
                const rotationImpulse = Math.sin(collisionAngle) * 0.003;
                currentStation.rotationSpeed += rotationImpulse;
                
                // Create explosion effect
                for (let j = 0; j < 15; j++) {
                    createParticle(hazard.x, hazard.y, hazardData.color);
                }
                
                logMessage(`Station defense system destroyed ${hazardData.name}`);
            }
        }
    }); // End of stations.forEach
    
    // Check station-to-station collisions with realistic physics
    for (let i = 0; i < stations.length; i++) {
        for (let j = i + 1; j < stations.length; j++) {
            const station1 = stations[i];
            const station2 = stations[j];
            
            // Calculate distance between stations
            const dx = station2.x - station1.x;
            const dy = station2.y - station1.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const minDistance = station1.size + station2.size;
            
            // Check if stations are colliding
            if (distance < minDistance && distance > 0) {
                // Normalize collision vector
                const nx = dx / distance;
                const ny = dy / distance;
                
                // Separate stations to prevent overlap
                const overlap = minDistance - distance;
                const separationX = nx * overlap * 0.5;
                const separationY = ny * overlap * 0.5;
                
                station1.x -= separationX;
                station1.y -= separationY;
                station2.x += separationX;
                station2.y += separationY;
                
                // Calculate relative velocity
                const relVx = station1.vx - station2.vx;
                const relVy = station1.vy - station2.vy;
                
                // Calculate relative velocity in collision normal direction
                const velAlongNormal = relVx * nx + relVy * ny;
                
                // Only resolve if stations are moving towards each other
                if (velAlongNormal < 0) {
                    // Elastic collision (conserve momentum and kinetic energy)
                    // Assume equal mass for stations
                    const restitution = 0.95; // Slightly inelastic (0.95 = 95% energy retained)
                    
                    // Calculate impulse scalar
                    const impulse = -(1 + restitution) * velAlongNormal / 2;
                    
                    // Apply impulse to both stations
                    const impulseX = impulse * nx;
                    const impulseY = impulse * ny;
                    
                    station1.vx += impulseX;
                    station1.vy += impulseY;
                    station2.vx -= impulseX;
                    station2.vy -= impulseY;
                    
                    // Add rotational impulse based on collision geometry
                    // Calculate tangent component (perpendicular to collision normal)
                    const tangentX = -ny;
                    const tangentY = nx;
                    
                    // Calculate relative velocity along tangent (creates rotation)
                    const tangentVel = relVx * tangentX + relVy * tangentY;
                    
                    // Apply rotational impulse proportional to tangent velocity
                    const rotationImpulse = tangentVel * 0.0002;
                    station1.rotationSpeed += rotationImpulse;
                    station2.rotationSpeed -= rotationImpulse;
                    
                    // Create visual feedback
                    const collisionX = station1.x + dx * 0.5;
                    const collisionY = station1.y + dy * 0.5;
                    
                    for (let k = 0; k < 10; k++) {
                        createParticle(collisionX, collisionY, '#00ffff');
                    }
                    
                    // Optional: Log station collision
                    if (frameCount % 30 === 0) {
                        logMessage(`${station1.name} and ${station2.name} collided!`);
                    }
                }
            }
        }
    }
    
    // Apply rotation speed cap to all stations after all collisions
    const maxRotationSpeed = 0.01; // Maximum rotation speed
    stations.forEach(station => {
        if (Math.abs(station.rotationSpeed) > maxRotationSpeed) {
            station.rotationSpeed = Math.sign(station.rotationSpeed) * maxRotationSpeed;
        }
    });
}

function checkStationAsteroidCollision(asteroid) {
    // Check if asteroid is close enough for collision
    const dx = asteroid.x - station.x;
    const dy = asteroid.y - station.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    // Use simple radius check for reliable collision detection
    return dist < station.size + asteroid.size;
}

function pointInPolygon(x, y, vertices) {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        const xi = vertices[i].x, yi = vertices[i].y;
        const xj = vertices[j].x, yj = vertices[j].y;
        
        const intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function circleIntersectsPolygon(cx, cy, radius, vertices) {
    // Check if any edge of the polygon is within radius of the circle
    for (let i = 0; i < vertices.length; i++) {
        const v1 = vertices[i];
        const v2 = vertices[(i + 1) % vertices.length];
        
        const dist = distanceToLineSegment(cx, cy, v1.x, v1.y, v2.x, v2.y);
        if (dist < radius) {
            return true;
        }
    }
    return false;
}

function distanceToLineSegment(px, py, x1, y1, x2, y2) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    
    if (lenSq !== 0) {
        param = dot / lenSq;
    }
    
    let xx, yy;
    
    if (param < 0) {
        xx = x1;
        yy = y1;
    } else if (param > 1) {
        xx = x2;
        yy = y2;
    } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }
    
    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
}

function checkStationProximity(dt = 1) {
    if (!stations || stations.length === 0) return;
    
    const playerSpeed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
    const centerZone = 15; // Ship must be within 15 units of center to dock
    
    let closestStationForEffects = null;
    let closestDistForEffects = Infinity;
    
    // Process each station independently
    stations.forEach(st => {
        const dx = st.x - player.x;
        const dy = st.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const pullZone = st.dockingRange;
        
        // Track closest station for rotation/pull effects
        if (dist < closestDistForEffects && dist < pullZone) {
            closestDistForEffects = dist;
            closestStationForEffects = st;
        }
        
        // Update docking status for this station
        if (dist < centerZone) {
            if (!st.isDocked) {
                st.isDocked = true;
                logMessage(`Docked with ${st.name}. Station services available.`);
            }
            
            // When docked at this station, lock to its motion
            if (!player.isManuallyControlled) {
                player.vx = st.vx;
                player.vy = st.vy;
                
                // Lock position to station center
                const lockStrength = 0.2 * dt;
                player.x += dx * lockStrength;
                player.y += dy * lockStrength;
            }
        } else {
            if (st.isDocked) {
                st.isDocked = false;
                logMessage(`Undocked from ${st.name}.`);
            }
        }
    });
    
    // Apply rotation and pull effects from the closest station (if any)
    if (closestStationForEffects && !player.isManuallyControlled) {
        const dx = closestStationForEffects.x - player.x;
        const dy = closestStationForEffects.y - player.y;
        const dist = closestDistForEffects;
        const pullZone = closestStationForEffects.dockingRange;
        
        // Smoothly rotate to match the station's rotation
        let normalizedStationRotation = closestStationForEffects.rotation % (Math.PI * 2);
        if (normalizedStationRotation > Math.PI) normalizedStationRotation -= Math.PI * 2;
        if (normalizedStationRotation < -Math.PI) normalizedStationRotation += Math.PI * 2;
        
        let angleDiff = normalizedStationRotation - player.angle;
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        
        player.angle += angleDiff * 0.2 * dt;
        
        // Apply gravitational pull if not too close and moving slowly
        if (dist >= centerZone && playerSpeed < 1.5) {
            // Use inverse-square-like falloff for stronger pull at outer ranges
            // Normalized distance from 0 (at edge) to 1 (at center)
            const normalizedDist = dist / pullZone;
            // Inverse relationship: stronger at edge (when normalizedDist is high)
            const gravityMultiplier = 1 / (normalizedDist * normalizedDist + 0.1);
            const pullForce = closestStationForEffects.pullStrength * gravityMultiplier * dt;
            player.vx += (dx / dist) * pullForce;
            player.vy += (dy / dist) * pullForce;
        }
    }
}

function isDockedAtAnyStation() {
    return stations.some(st => st.isDocked);
}

function sellCargo() {
    // Check if docked
    if (!isDockedAtAnyStation()) {
        logMessage('Must be docked at station to sell cargo.');
        return;
    }
    
    // Sell all cargo
    let totalValue = 0;
    Object.keys(gameState.inventory).forEach(type => {
        const count = gameState.inventory[type];
        const asteroidType = ASTEROID_TYPES[type];
        if (asteroidType) {
            const value = asteroidType.value * count;
            const bonusValue = Math.floor(value * (gameState.prestigeBonus / 100));
            totalValue += value + bonusValue;
        }
    });
    
    if (totalValue > 0) {
        gameState.credits += totalValue;
        gameState.cargo = 0;
        gameState.inventory = {};
        
        createFloatingText(player.x, player.y - 30, `+${formatNumber(totalValue)}¢`, '#ffff00');
        logMessage(`Sold cargo for ${formatNumber(totalValue)} credits!`);
    } else {
        logMessage('No cargo to sell.');
    }
    
    updateUI();
}

function refuelAndRepair() {
    // Check if docked
    if (!isDockedAtAnyStation()) {
        logMessage('Must be docked at station to refuel and repair.');
        return;
    }
    
    const fuelNeeded = gameState.maxFuel - gameState.fuel;
    const hullNeeded = gameState.maxHull - gameState.hull;
    
    // Pricing: 1 credit per fuel, 2 credits per hull
    const fuelCost = Math.ceil(fuelNeeded * 1);
    const hullCost = Math.ceil(hullNeeded * 2);
    const totalCost = fuelCost + hullCost;
    
    // Check if player can afford it
    if (totalCost > gameState.credits) {
        logMessage(`Insufficient credits. Need ${totalCost}¢ (Fuel: ${fuelCost}¢, Hull: ${hullCost}¢)`);
        return;
    }
    
    // Refuel and repair (deduct credits)
    if (fuelNeeded > 0 || hullNeeded > 0) {
        gameState.credits -= totalCost;
        gameState.fuel = gameState.maxFuel;
        gameState.hull = gameState.maxHull;
        
        logMessage(`Ship refueled and repaired for ${totalCost}¢. All systems nominal.`);
        if (fuelNeeded > 0) {
            createFloatingText(player.x - 20, player.y - 20, `+${Math.floor(fuelNeeded)}% FUEL`, '#00ffff');
        }
        if (hullNeeded > 0) {
            createFloatingText(player.x + 20, player.y - 20, `+${Math.floor(hullNeeded)}% HULL`, '#00ff00');
        }
    } else {
        logMessage('Ship already at full fuel and hull.');
    }
    
    updateUI();
}


function attemptMining(dt = 1) {
    if (gameState.fuel < CONFIG.miningFuelCost) {
        if (frameCount % 60 === 0) {
            logMessage('Insufficient fuel for mining.');
        }
        return;
    }
    
    // Check if cargo is full
    if (gameState.cargo >= gameState.maxCargo) {
        if (frameCount % 60 === 0) {
            logMessage('Cargo hold full! Return to station to sell.');
        }
        
        player.isMining = false;
        player.miningTarget = null;
        player.miningProgress = 0;
        player.miningTargets = [];
        return;
    }
    
    // Calculate how many lasers we have available
    const maxTargets = gameState.upgrades.multiMining;
    const miningRange = CONFIG.miningRange + (gameState.upgrades.range - 1) * 10;
    const miningSpeed = CONFIG.baseMiningSpeed * (1 - (gameState.upgrades.mining - 1) * 0.1);
    const miningRangeSq = miningRange * miningRange; // Squared for faster comparison
    
    // Define laser positions relative to ship (matching rendering positions)
    const getLaserWorldPositions = () => {
        const positions = [];
        
        // Tank dimensions (MUST match the rendering code exactly)
        const cargoLevel = gameState.upgrades.cargo || 1;
        const fuelLevel = gameState.upgrades.fuel || 1;
        const tankLength = Math.min(0.8 + Math.max(cargoLevel, fuelLevel) * 0.03, 1.1);
        const tankStartX = -tankLength / 2;
        const tankEndX = tankLength / 2;
        
        // These must match the rendering positions in renderMiningLaser()
        if (maxTargets >= 1) positions.push({ x: tankEndX, y: 0.47 }); // Front fuel
        if (maxTargets >= 2) positions.push({ x: tankEndX, y: -0.47 }); // Front cargo
        if (maxTargets >= 3) positions.push({ x: 0.0, y: 0.47 }); // Center fuel outer
        if (maxTargets >= 4) positions.push({ x: 0.0, y: -0.47 }); // Center cargo outer
        if (maxTargets >= 5) positions.push({ x: tankStartX, y: 0.47 }); // Rear fuel
        if (maxTargets >= 6) positions.push({ x: tankStartX, y: -0.47 }); // Rear cargo
        
        // Convert to world coordinates
        const cos = Math.cos(player.angle);
        const sin = Math.sin(player.angle);
        
        return positions.map(pos => {
            const localX = player.size * pos.x;
            const localY = player.size * pos.y;
            
            // Rotate and translate to world position
            return {
                x: player.x + (localX * cos - localY * sin),
                y: player.y + (localX * sin + localY * cos)
            };
        });
    };
    
    const laserWorldPositions = getLaserWorldPositions();
    
    // Initialize miningTargets array if needed (maintain laser slots)
    if (!player.miningTargets || player.miningTargets.length !== maxTargets) {
        const oldTargets = player.miningTargets || [];
        player.miningTargets = new Array(maxTargets).fill(null).map((_, i) => {
            // Preserve existing targets when resizing
            if (i < oldTargets.length && oldTargets[i]) {
                return oldTargets[i];
            }
            return {
                asteroid: null,
                progress: 0
            };
        });
    }
    
    // First pass: Clean up invalid targets and check if they're still in range
    for (let i = 0; i < maxTargets; i++) {
        const target = player.miningTargets[i];
        
        // Safety check - ensure target object exists
        if (!target) {
            player.miningTargets[i] = { asteroid: null, progress: 0 };
            continue;
        }
        
        if (target.asteroid) {
            // Check if asteroid is destroyed or out of range
            const asteroid = target.asteroid;
            if (asteroid.destroyed || !asteroids.includes(asteroid)) {
                // Free up this laser slot
                target.asteroid = null;
                target.progress = 0;
            } else {
                // Check if still in range
                const dx = asteroid.x - player.x;
                const dy = asteroid.y - player.y;
                const distSq = dx * dx + dy * dy;
                
                if (distSq >= miningRangeSq) {
                    // Out of range, free up this laser slot
                    target.asteroid = null;
                    target.progress = 0;
                }
            }
        }
    }
    
    // Second pass: Find new targets for idle lasers
    // Build list of asteroids in range that aren't already being mined
    const asteroidsInRange = [];
    const len = asteroids.length;
    
    // Get set of asteroids already being targeted
    const targetedAsteroids = new Set();
    for (let i = 0; i < maxTargets; i++) {
        if (player.miningTargets[i].asteroid) {
            targetedAsteroids.add(player.miningTargets[i].asteroid);
        }
    }
    
    // Find available asteroids
    for (let i = 0; i < len; i++) {
        const asteroid = asteroids[i];
        
        // Skip destroyed asteroids or ones already being mined
        if (asteroid.destroyed || targetedAsteroids.has(asteroid)) continue;
        
        // Calculate distance from ship center
        const dx = asteroid.x - player.x;
        const dy = asteroid.y - player.y;
        const distSq = dx * dx + dy * dy;
        
        if (distSq < miningRangeSq) {
            asteroidsInRange.push({ 
                asteroid, 
                distSq: distSq
            });
        }
    }
    
    // Sort available asteroids by distance
    asteroidsInRange.sort((a, b) => a.distSq - b.distSq);
    
    // Assign new targets to idle laser slots using closest-laser matching
    // For each available asteroid, find the closest idle laser
    for (const asteroidData of asteroidsInRange) {
        // Find all idle lasers
        const idleLasers = [];
        for (let i = 0; i < maxTargets; i++) {
            if (!player.miningTargets[i].asteroid) {
                idleLasers.push(i);
            }
        }
        
        // If no idle lasers, we're done
        if (idleLasers.length === 0) break;
        
        // Find the closest idle laser to this asteroid
        let closestLaser = idleLasers[0];
        let closestDistSq = Infinity;
        
        for (const laserIndex of idleLasers) {
            const laserPos = laserWorldPositions[laserIndex];
            const dx = asteroidData.asteroid.x - laserPos.x;
            const dy = asteroidData.asteroid.y - laserPos.y;
            const distSq = dx * dx + dy * dy;
            
            if (distSq < closestDistSq) {
                closestDistSq = distSq;
                closestLaser = laserIndex;
            }
        }
        
        // Assign this asteroid to the closest idle laser
        player.miningTargets[closestLaser].asteroid = asteroidData.asteroid;
        player.miningTargets[closestLaser].progress = 0;
    }
    
    // Third pass: Process mining for each laser that has a target
    let activeLasers = 0;
    
    for (let i = 0; i < maxTargets; i++) {
        const target = player.miningTargets[i];
        
        // Safety check - ensure target exists
        if (!target) continue;
        
        const asteroid = target.asteroid;
        
        // Skip idle lasers
        if (!asteroid) continue;
        
        // Additional safety check - ensure asteroid still exists
        if (asteroid.destroyed || !asteroids.includes(asteroid)) {
            target.asteroid = null;
            target.progress = 0;
            continue;
        }
        
        activeLasers++;
        
        // Calculate laser position for this target (matching renderMiningLaser logic)
        const cargoLevel = gameState.upgrades.cargo || 1;
        const fuelLevel = gameState.upgrades.fuel || 1;
        const tankLength = Math.min(0.8 + Math.max(cargoLevel, fuelLevel) * 0.03, 1.1);
        const tankWidth = 0.22;
        const tankStartX = -tankLength / 2;
        const tankEndX = tankLength / 2;
        
        // Determine laser position based on laser index
        let laserLocalX = 0;
        let laserLocalY = 0;
        
        // Match the laser positions from renderMiningLaser
        switch (i) {
            // Laser 1: Front of fuel tank
            case 0:
                laserLocalX = tankEndX;
                laserLocalY = 0.47;
                break;
            case 1:
                // Laser 2: Front of cargo tank
                laserLocalX = tankEndX;
                laserLocalY = -0.47;
                break;
            case 2:
                // Laser 3: Center, far side of fuel tank
                laserLocalX = 0.0;
                laserLocalY = 0.47;
                break;
            case 3:
                // Laser 4: Center, far side of cargo tank
                laserLocalX = 0.0;
                laserLocalY = -0.47;
                break;
            case 4:
                // Laser 5: Back of fuel tank
                laserLocalX = tankStartX;
                laserLocalY = 0.47;
                break;
            case 5:
                // Laser 6: Back of cargo tank
                laserLocalX = tankStartX;
                laserLocalY = -0.47;
                break;
        }
        
        // Calculate pull target: radial position outward from ship center through laser
        // Direction vector from ship center to laser (in local coordinates)
        const laserDirLength = Math.sqrt(laserLocalX * laserLocalX + laserLocalY * laserLocalY);
        const pullDistance = player.size * 0.5; // How far beyond the laser to pull asteroids
        
        // Normalized direction in local space
        const dirX = laserLocalX / laserDirLength;
        const dirY = laserLocalY / laserDirLength;
        
        // Pull target in local space (laser position + outward extension)
        const targetLocalX = (laserLocalX + dirX * pullDistance / player.size) * player.size;
        const targetLocalY = (laserLocalY + dirY * pullDistance / player.size) * player.size;
        
        // Transform to world coordinates
        const pullTargetX = player.x + Math.cos(player.angle) * targetLocalX - Math.sin(player.angle) * targetLocalY;
        const pullTargetY = player.y + Math.sin(player.angle) * targetLocalX + Math.cos(player.angle) * targetLocalY;
        
        const dx = pullTargetX - asteroid.x;
        const dy = pullTargetY - asteroid.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Tractor beam effect - consistent force-based attraction (time-consistent)
        const normalizedDist = Math.min(dist / miningRange, 1);
        
        if (dist > 3) {
            // Calculate direction to target
            const dirX = dx / dist;
            const dirY = dy / dist;
            
            // Base pull force - inversely proportional to distance (stronger when closer)
            // This creates more reliable pulling behavior
            const distanceFactor = 1 / (1 + normalizedDist * 2); // 1.0 at target, 0.33 at max range
            const basePullForce = 0.15 * distanceFactor * dt;
            
            // Apply tractor beam force toward target
            asteroid.vx += dirX * basePullForce;
            asteroid.vy += dirY * basePullForce;
            
            // Calculate velocity toward target (dot product)
            const velocityTowardTarget = asteroid.vx * dirX + asteroid.vy * dirY;
            
            // Velocity-based damping: stronger when moving fast toward target
            // This prevents overshooting and creates smooth convergence
            if (velocityTowardTarget > 0) {
                // Damping proportional to velocity toward target and proximity
                const velocityDamping = Math.min(velocityTowardTarget * 0.08 * (1 - normalizedDist), 0.95);
                const dampingFactor = Math.pow(1 - velocityDamping, dt);
                
                // Apply damping only to velocity component toward target
                asteroid.vx -= dirX * velocityTowardTarget * (1 - dampingFactor);
                asteroid.vy -= dirY * velocityTowardTarget * (1 - dampingFactor);
            }
            
            // General velocity damping for stability (small constant drag)
            const stabilityDamping = Math.pow(0.98, dt);
            asteroid.vx *= stabilityDamping;
            asteroid.vy *= stabilityDamping;
        }
        
        // Calculate laser world position for particles
        const laserWorldX = player.x + Math.cos(player.angle) * laserLocalX * player.size - Math.sin(player.angle) * laserLocalY * player.size;
        const laserWorldY = player.y + Math.sin(player.angle) * laserLocalX * player.size + Math.cos(player.angle) * laserLocalY * player.size;
        
        // Create laser particles from the actual laser position
        if (frameCount % 3 === 0) {
            createLaserParticle(laserWorldX, laserWorldY, asteroid.x, asteroid.y);
        }
        
        // Increment mining progress (time-consistent)
        target.progress += dt;
        
        // Check if mining cycle is complete
        if (target.progress >= miningSpeed) {
            mineAsteroid(asteroid);
            
            // Clean up if asteroid was destroyed - free up this laser slot
            if (asteroid.destroyed) {
                target.asteroid = null;
                target.progress = 0;
            } else {
                // Reset progress for next mining cycle
                target.progress = 0;
            }
        }
    }
    
    // Update player mining state
    if (activeLasers > 0) {
        player.isMining = true;
        
        // Consume fuel (once per frame, not per target) (time-consistent) - only if not docked
        if (!isDockedAtAnyStation()) {
            if (godModeActive) {
                gameState.fuel = gameState.maxFuel;
            } else {
                gameState.fuel = Math.max(0, gameState.fuel - CONFIG.miningFuelCost * dt);
            }
        }
        
        // Update backward compatibility properties (use first active target)
        const firstActiveTarget = player.miningTargets.find(t => t.asteroid);
        player.miningTarget = firstActiveTarget?.asteroid || null;
        player.miningProgress = firstActiveTarget?.progress || 0;
    } else {
        player.isMining = false;
        player.miningTarget = null;
        player.miningProgress = 0;
        player.miningTargets = [];
    }
}
function mineAsteroid(asteroid) {
    // Reduce asteroid health first
    asteroid.health--;
    
    // Calculate health ratio for proportional scaling
    const healthRatio = asteroid.health / asteroid.maxHealth;
    
    // Create chunk breaking effect at damaged vertices
    if (asteroid.geometry && asteroid.geometry.length > 0) {
        // Break off 1-3 chunks per mining cycle
        const numChunks = 1 + Math.floor(Math.random() * 2);
        
        for (let chunk = 0; chunk < numChunks; chunk++) {
            // Pick a random vertex to damage
            const damageIndex = Math.floor(Math.random() * asteroid.geometry.length);
            const vertsToShrink = [damageIndex];
            
            // Randomly include one or both neighbors
            const includeLeft = Math.random() > 0.5;
            const includeRight = Math.random() > 0.5;
            
            if (includeLeft) {
                const leftIndex = (damageIndex - 1 + asteroid.geometry.length) % asteroid.geometry.length;
                vertsToShrink.push(leftIndex);
            }
            
            if (includeRight) {
                const rightIndex = (damageIndex + 1) % asteroid.geometry.length;
                vertsToShrink.push(rightIndex);
            }
            
            // Shrink the selected vertices proportionally based on health
            vertsToShrink.forEach(index => {
                const point = asteroid.geometry[index];
                const originalPoint = asteroid.originalGeometry[index];
                
                // Calculate world position for particles BEFORE shrinking
                const worldX = asteroid.x + point.x * Math.cos(asteroid.rotation) - point.y * Math.sin(asteroid.rotation);
                const worldY = asteroid.y + point.x * Math.sin(asteroid.rotation) + point.y * Math.cos(asteroid.rotation);
                
                // Create particles at the vertex location
                for (let i = 0; i < 5; i++) {
                    createParticle(worldX, worldY, ASTEROID_TYPES[asteroid.type].color);
                }
                
                // Shrink this vertex proportionally based on health ratio
                point.x = originalPoint.x * healthRatio;
                point.y = originalPoint.y * healthRatio;
            });
        }
    }
    
    // Add one piece to cargo after each mining cycle
    const asteroidType = ASTEROID_TYPES[asteroid.type];
    
    gameState.inventory[asteroid.type] = (gameState.inventory[asteroid.type] || 0) + 1;
    gameState.cargo++;
    gameState.stats.totalMined++;
    
    createFloatingText(asteroid.x, asteroid.y - 20, `+1 ${asteroidType.name}`, asteroidType.color);
    
    if (asteroid.health <= 0) {
        // Asteroid fully destroyed
        gameState.stats.asteroidsDestroyed++;
        
        createFloatingText(asteroid.x, asteroid.y, `DESTROYED`, asteroidType.color);
        
        // Mark asteroid as destroyed instead of removing immediately
        asteroid.destroyed = true;
        
        // Large explosion particles
        for (let i = 0; i < 20; i++) {
            createParticle(asteroid.x, asteroid.y, asteroidType.color);
        }
    }
}

function checkHazardCollisions(dt = 1) {
    // Optimized with for loop instead of forEach
    const len = hazards.length;
    
    for (let i = len - 1; i >= 0; i--) {
        const hazard = hazards[i];
        const hazardData = HAZARD_TYPES[hazard.type];
        const dx = hazard.x - player.x;
        const dy = hazard.y - player.y;
        const distSq = dx * dx + dy * dy; // Use squared distance to avoid sqrt
        
        if (hazard.type === 'vortex') {
            const pullRadiusSq = (hazardData.size * 3) * (hazardData.size * 3);
            
            // Gravity pull - now properly scaled with deltaTime for consistent behavior across frame rates
            if (distSq < pullRadiusSq) {
                const dist = Math.sqrt(distSq);
                const angle = Math.atan2(dy, dx);
                // Pull force decreases with distance (inverse square law)
                const distanceFactor = 1 - (dist / (hazardData.size * 3));
                const pullStrength = hazardData.pullForce * distanceFactor * dt;
                player.vx += Math.cos(angle) * pullStrength;
                player.vy += Math.sin(angle) * pullStrength;
            }
            
            // Damage if too close
            const damageSq = hazardData.size * hazardData.size;
            if (distSq < damageSq && frameCount % 30 === 0) {
                damagePlayer(hazardData.damage);
            }
        } else {
            // Direct collision (use squared distance)
            const collisionRadiusSq = ((hazardData.size + player.size) / 2) * ((hazardData.size + player.size) / 2);
            
            if (distSq < collisionRadiusSq) {
                damagePlayer(hazardData.damage);
                
                // Remove hazard if it's debris or mine
                if (hazard.type !== 'vortex') {
                    hazards.splice(i, 1);
                    
                    // Explosion
                    for (let j = 0; j < 20; j++) {
                        createParticle(hazard.x, hazard.y, hazardData.color);
                    }
                }
            }
        }
    }
}

function damagePlayer(amount) {
    // God mode prevents all damage
    if (godModeActive) {
        gameState.hull = gameState.maxHull;
        return;
    }
    
    gameState.hull = Math.max(0, gameState.hull - amount);
    createFloatingText(player.x, player.y - 20, `-${amount} HP`, '#ff0000');
    
    logMessage(`Hull damaged! -${amount} HP`);
    
    if (gameState.hull <= 0) {
        gameOver();
    }
}

function gameOver() {
    gameState.isPaused = true;
    
    // Auto sell cargo before game over
    returnToStation();
    
    logMessage('CRITICAL DAMAGE! Ship disabled. Returning to base...');
    
    setTimeout(() => {
        showGameOver(
            gameState.credits,
            gameState.stats.asteroidsDestroyed,
            gameState.stats.sectorsVisited,
            gameState.stats.distanceTraveled
        );
    }, 1000);
}

function gameOverOutOfFuel() {
    gameState.isPaused = true;
    
    logMessage('CRITICAL: Out of fuel with no credits for rescue!');
    logMessage('Mission failed. Ship adrift in deep space...');
    
    setTimeout(() => {
        showGameOver(
            gameState.credits,
            gameState.stats.asteroidsDestroyed,
            gameState.stats.sectorsVisited,
            gameState.stats.distanceTraveled,
            'fuel' // Pass reason for fuel-based game over
        );
    }, 1000);
}

function updateAsteroids(dt = 1) {
    // Clean up destroyed asteroids BEFORE processing
    asteroids = asteroids.filter(a => !a.destroyed);
    
    // Main thread physics - simple and reliable
    // Physics is trivial (position += velocity) so multi-threading overhead isn't worth it
    // This also eliminates array synchronization issues during mining/destruction
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

function updateHazards(dt = 1) {
    // Main thread physics - simple and reliable
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

function updateParticles(dt = 1) {
    // Particles are frequently created/destroyed, so worker overhead isn't worth it
    // Just use optimized main thread code with pooling
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        // Update position (time-consistent)
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        p.alpha -= 0.02 * dt;
        
        if (p.life <= 0 || p.alpha <= 0) {
            returnParticleToPool(p); // Return to pool instead of GC
            particles.splice(i, 1);
        }
    }
}

function updateFloatingText(dt = 1) {
    for (let i = floatingText.length - 1; i >= 0; i--) {
        const text = floatingText[i];
        // Update position (time-consistent)
        text.y -= 1 * dt;
        text.life -= dt;
        text.alpha -= 0.02 * dt;
        
        if (text.life <= 0 || text.alpha <= 0) {
            floatingText.splice(i, 1);
        }
    }
}

function updateViewport(dt = 1) {
    // Smooth zoom interpolation (time-consistent)
    if (Math.abs(viewport.targetZoom - viewport.zoom) > 0.001) {
        const oldZoom = viewport.zoom;
        const smoothingFactor = 1 - Math.pow(1 - viewport.zoomSmoothing, dt);
        viewport.zoom += (viewport.targetZoom - viewport.zoom) * smoothingFactor;
        
        // Adjust viewport position to keep the center point fixed during zoom
        const centerWorldX = viewport.x + VIEWPORT_REFERENCE.WIDTH / (2 * oldZoom);
        const centerWorldY = viewport.y + VIEWPORT_REFERENCE.HEIGHT / (2 * oldZoom);
        
        viewport.x = centerWorldX - VIEWPORT_REFERENCE.WIDTH / (2 * viewport.zoom);
        viewport.y = centerWorldY - VIEWPORT_REFERENCE.HEIGHT / (2 * viewport.zoom);
    }
    
    // Center camera on player with smoothing (time-consistent)
    const targetX = player.x - VIEWPORT_REFERENCE.WIDTH / (2 * viewport.zoom);
    const targetY = player.y - VIEWPORT_REFERENCE.HEIGHT / (2 * viewport.zoom);
    
    const smoothingFactor = 1 - Math.pow(1 - viewport.smoothing, dt);
    viewport.x += (targetX - viewport.x) * smoothingFactor;
    viewport.y += (targetY - viewport.y) * smoothingFactor;
    
    // Clamp viewport to world bounds
    viewport.x = Math.max(0, Math.min(CONFIG.worldWidth - VIEWPORT_REFERENCE.WIDTH / viewport.zoom, viewport.x));
    viewport.y = Math.max(0, Math.min(CONFIG.worldHeight - VIEWPORT_REFERENCE.HEIGHT / viewport.zoom, viewport.y));
}

function updateStars(dt = 1) {
    if (starWorkerReady && starWorker) {
        // Send update request to worker
        starWorker.postMessage({
            type: 'update',
            data: { dt: dt }
        });
    } else {
        // Fallback to main thread if worker not available
        const tileWidth = VIEWPORT_REFERENCE.WIDTH * 2;
        const tileHeight = VIEWPORT_REFERENCE.HEIGHT * 2;
        
        stars.forEach(star => {
            // Update star position based on velocity and delta time
            star.x += star.vx * dt;
            star.y += star.vy * dt;
            
            // Wrap stars within tile boundaries
            star.x = ((star.x % tileWidth) + tileWidth) % tileWidth;
            star.y = ((star.y % tileHeight) + tileHeight) % tileHeight;
        });
    }
}

// ================================
// PARTICLE SYSTEM (with Object Pooling)
// ================================

// Particle pool for performance
const particlePool = [];
const maxPoolSize = 500;

function getParticleFromPool() {
    if (particlePool.length > 0) {
        return particlePool.pop();
    }
    return null;
}

function returnParticleToPool(particle) {
    if (particlePool.length < maxPoolSize) {
        particlePool.push(particle);
    }
}

function createParticle(x, y, color, size = 3) {
    let particle = getParticleFromPool();
    
    if (particle) {
        // Reuse existing particle
        particle.x = x;
        particle.y = y;
        particle.vx = (Math.random() - 0.5) * 5;
        particle.vy = (Math.random() - 0.5) * 5;
        particle.color = color;
        particle.size = size;
        particle.life = 30;
        particle.alpha = 1;
        particles.push(particle);
    } else {
        // Create new particle if pool is empty
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 5,
            vy: (Math.random() - 0.5) * 5,
            color: color,
            size: size,
            life: 30,
            alpha: 1
        });
    }
}

function createLaserParticle(x1, y1, x2, y2) {
    const t = Math.random();
    let particle = getParticleFromPool();
    
    if (particle) {
        particle.x = x1 + (x2 - x1) * t;
        particle.y = y1 + (y2 - y1) * t;
        particle.vx = (Math.random() - 0.5) * 3;
        particle.vy = (Math.random() - 0.5) * 3;
        particle.color = '#ffff00';
        particle.size = 2;
        particle.life = 15;
        particle.alpha = 1;
        particles.push(particle);
    } else {
        particles.push({
            x: x1 + (x2 - x1) * t,
            y: y1 + (y2 - y1) * t,
            vx: (Math.random() - 0.5) * 3,
            vy: (Math.random() - 0.5) * 3,
            color: '#ffff00',
            size: 2,
            life: 15,
            alpha: 1
        });
    }
}

function createFloatingText(x, y, text, color) {
    floatingText.push({
        x: x,
        y: y,
        text: text,
        color: color,
        life: 60,
        alpha: 1
    });
}

// ================================
// RENDERING
// ================================

function render() {
    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    
    // Apply canvas scaling to maintain consistent viewport across all screen sizes
    // This ensures the game shows the same world space regardless of physical canvas size
    const renderScale = canvas.renderScale || 1;
    ctx.scale(renderScale, renderScale);
    
    // Render stars BEFORE camera transform for proper parallax effect
    renderStars();
    
    // Apply camera transform
    ctx.translate(-viewport.x * viewport.zoom, -viewport.y * viewport.zoom);
    ctx.scale(viewport.zoom, viewport.zoom);
    
    // Render space station
    renderStation();
    
    // Render rescue ship
    if (rescueShip) {
        renderRescueShip();
    }
    
    // Render asteroids
    renderAsteroids();
    
    // Render mining laser (behind player, in front of asteroids)
    if (player.isMining && player.miningTargets && player.miningTargets.length > 0) {
        renderMiningLaser();
    }
    
    // Render hazards
    renderHazards();
    
    // Render particles
    renderParticles();
    
    // Render player (on top of mining laser)
    renderPlayer();
    
    // Render cargo drone
    renderCargoDrone(ctx);
    
    // Render scan system (on top of everything in world space)
    renderScan();
    
    // Render floating text
    renderFloatingText();
    
    ctx.restore();
    
    // Apply phosphor decay effect if CRT mode is enabled
    if (crtEnabled) {
        applyPhosphorDecay();
    }
    
    // Render minimap
    renderMinimap();
    
    // Render touch control indicator (in screen space, after ctx.restore())
    if (touchActive && isTouchDevice) {
        renderTouchIndicator();
    }
}

// ================================
// PHOSPHOR DECAY EFFECT (CRT)
// ================================

function applyPhosphorDecay() {
    // Save a clean copy of the current frame BEFORE applying any effects
    cleanFrameCtx.clearRect(0, 0, cleanFrameCanvas.width, cleanFrameCanvas.height);
    cleanFrameCtx.drawImage(canvas, 0, 0);
    
    // Enhanced phosphor decay that preserves color saturation and contrast
    // Calculate time-consistent decay rate
    const baseDecayPerFrame = 0.08; // Reduced from 0.12 - slower decay for longer trails
    const targetFrameTime = 16.67; // 60 FPS in milliseconds
    const decayPerSecond = (baseDecayPerFrame * 1000) / targetFrameTime;
    const timeScaledDecay = (decayPerSecond * currentDeltaTime) / 1000;
    const actualDecay = Math.min(Math.max(timeScaledDecay, 0.01), 0.99);
    
    // First pass: Fade the phosphor layer
    phosphorCtx.globalCompositeOperation = 'destination-out';
    phosphorCtx.globalAlpha = actualDecay * 0.5; // Slower decay for longer trails
    phosphorCtx.fillStyle = '#000000';
    phosphorCtx.fillRect(0, 0, phosphorCanvas.width, phosphorCanvas.height);
    
    // Second pass: Add CLEAN current frame to phosphor layer (not the filtered canvas)
    phosphorCtx.globalCompositeOperation = 'lighter';
    phosphorCtx.globalAlpha = 0.7; // More visible trails
    phosphorCtx.drawImage(cleanFrameCanvas, 0, 0); // Use clean frame to avoid feedback loop
    
    // Third pass: Darken to control brightness
    phosphorCtx.globalCompositeOperation = 'multiply';
    phosphorCtx.globalAlpha = 0.08; // Subtle darkening
    phosphorCtx.fillStyle = '#1a1a28'; // Dark blue-grey for CRT feel
    phosphorCtx.fillRect(0, 0, phosphorCanvas.width, phosphorCanvas.height);
    
    // Fourth pass: Overlay trails onto main canvas
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.5; // Visible trails
    ctx.drawImage(phosphorCanvas, 0, 0);
    
    // Fifth pass: Boost color saturation using the CLEAN untouched frame
    ctx.globalCompositeOperation = 'overlay'; // Enhances saturation and contrast
    ctx.globalAlpha = 0.15; // Subtle saturation boost
    ctx.drawImage(cleanFrameCanvas, 0, 0); // Use clean frame, not filtered canvas
    
    // Sixth pass: Enhance contrast by darkening with the clean frame
    ctx.globalCompositeOperation = 'multiply'; // Darkens and adds contrast
    ctx.globalAlpha = 0.25; // Moderate darkening for punchier contrast
    ctx.drawImage(cleanFrameCanvas, 0, 0); // Use clean frame for contrast definition
    
    // Reset composite operation
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';
}

function renderStars() {
    const renderScale = canvas.renderScale || 1;
    const scaledWidth = canvas.width / renderScale;
    const scaledHeight = canvas.height / renderScale;
    
    // Request render data calculation from worker (non-blocking)
    if (starWorkerReady && starWorker) {
        starWorker.postMessage({
            type: 'updateViewport',
            data: { viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom } }
        });
        
        starWorker.postMessage({
            type: 'calculateRenderData',
            data: { scaledWidth, scaledHeight }
        });
        
        // Render using pre-calculated data from previous frame
        // This is one frame behind but imperceptible and keeps rendering smooth
        for (let i = 0; i < starRenderData.length; i++) {
            const star = starRenderData[i];
            ctx.fillStyle = `rgba(255, 255, 255, ${star.brightness})`;
            ctx.fillRect(star.x, star.y, star.size, star.size);
        }
    } else {
        // Fallback to main thread rendering if worker not available
        const tileWidth = VIEWPORT_REFERENCE.WIDTH * 2;
        const tileHeight = VIEWPORT_REFERENCE.HEIGHT * 2;
        
        const viewportCenterX = viewport.x + (VIEWPORT_REFERENCE.WIDTH / 2) / viewport.zoom;
        const viewportCenterY = viewport.y + (VIEWPORT_REFERENCE.HEIGHT / 2) / viewport.zoom;
        
        stars.forEach(star => {
            const scrollX = viewportCenterX * star.parallaxFactor;
            const scrollY = viewportCenterY * star.parallaxFactor;
            
            let starX = star.x - scrollX;
            let starY = star.y - scrollY;
            
            starX = ((starX % tileWidth) + tileWidth) % tileWidth;
            starY = ((starY % tileHeight) + tileHeight) % tileHeight;
            
            const centerX = scaledWidth / 2;
            const centerY = scaledHeight / 2;
            
            for (let tx = -1; tx <= 1; tx++) {
                for (let ty = -1; ty <= 1; ty++) {
                    const screenX = centerX - tileWidth/2 + starX + tx * tileWidth;
                    const screenY = centerY - tileHeight/2 + starY + ty * tileHeight;
                    
                    if (screenX >= -10 && screenX <= scaledWidth + 10 &&
                        screenY >= -10 && screenY <= scaledHeight + 10) {
                        
                        ctx.fillStyle = `rgba(255, 255, 255, ${star.brightness})`;
                        ctx.fillRect(screenX, screenY, star.size, star.size);
                    }
                }
            }
        });
    }
}

function renderStation() {
    // Render all stations
    stations.forEach((station, index) => {
        // Use station's color scheme, or default to green if not set
        const colors = station.colorScheme || STATION_COLORS[2]; // Default to green
        
        // Draw docking range indicator when docked at this station
        if (station.isDocked) {
            ctx.strokeStyle = colors.primary;
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            ctx.arc(station.x, station.y, station.dockingRange, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
        
        // Draw station structure
        ctx.save();
        ctx.translate(station.x, station.y);
        
        // Rotating station (use station's rotation property)
        ctx.rotate(station.rotation);
        
        // Main station body (hexagon)
        ctx.strokeStyle = colors.primary;
        ctx.fillStyle = colors.fill;
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i;
            const x = Math.cos(angle) * station.size;
            const y = Math.sin(angle) * station.size;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Inner hexagon details
        ctx.strokeStyle = colors.tertiary;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i;
            const x = Math.cos(angle) * station.size * 0.6;
            const y = Math.sin(angle) * station.size * 0.6;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
        
        // Docking bays (lines from center to vertices)
        ctx.strokeStyle = colors.primary;
        ctx.lineWidth = 1;
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i;
            const x = Math.cos(angle) * station.size;
            const y = Math.sin(angle) * station.size;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(x, y);
            ctx.stroke();
        }
        
        // Center core
        ctx.fillStyle = colors.primary;
        ctx.beginPath();
        ctx.arc(0, 0, station.size * 0.15, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    });
}

function renderRescueShip() {
    if (!rescueShip) return;
    
    // Draw refueling beam first (before ship, so it appears behind)
    if (rescueShip.state === 'refueling') {
        ctx.save();
        
        // Animated refueling beam with enhanced particles
        const pulsePhase = (Date.now() / 100) % 1;
        const beamLength = Math.sqrt(
            Math.pow(player.x - rescueShip.x, 2) + 
            Math.pow(player.y - rescueShip.y, 2)
        );
        
        // Main beam - wider and more vibrant
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 4;
        ctx.globalAlpha = 0.7;
        ctx.setLineDash([8, 4]);
        ctx.lineDashOffset = -pulsePhase * 12;
        ctx.beginPath();
        ctx.moveTo(rescueShip.x, rescueShip.y);
        ctx.lineTo(player.x, player.y);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Secondary beam layers for depth
        ctx.strokeStyle = '#0088ff';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.moveTo(rescueShip.x, rescueShip.y);
        ctx.lineTo(player.x, player.y);
        ctx.stroke();
        
        // Core beam - bright white
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.moveTo(rescueShip.x, rescueShip.y);
        ctx.lineTo(player.x, player.y);
        ctx.stroke();
        
        // Enhanced energy particles along the beam
        const particleCount = Math.floor(beamLength / 15) + 10; // More particles for longer beams
        for (let i = 0; i < particleCount; i++) {
            const t = (pulsePhase + i / particleCount) % 1;
            const px = rescueShip.x + (player.x - rescueShip.x) * t;
            const py = rescueShip.y + (player.y - rescueShip.y) * t;
            
            // Random offset for particle wobble
            const wobblePhase = (Date.now() / 200 + i) % (Math.PI * 2);
            const wobble = Math.sin(wobblePhase) * 3;
            const angle = Math.atan2(player.y - rescueShip.y, player.x - rescueShip.x);
            const wobbleX = Math.cos(angle + Math.PI / 2) * wobble;
            const wobbleY = Math.sin(angle + Math.PI / 2) * wobble;
            
            // Particle glow
            const gradient = ctx.createRadialGradient(px + wobbleX, py + wobbleY, 0, px + wobbleX, py + wobbleY, 4);
            gradient.addColorStop(0, 'rgba(0, 255, 255, 1)');
            gradient.addColorStop(0.5, 'rgba(0, 200, 255, 0.6)');
            gradient.addColorStop(1, 'rgba(0, 150, 255, 0)');
            
            ctx.fillStyle = gradient;
            ctx.globalAlpha = 0.9 * (1 - Math.abs(t - 0.5) * 1.5);
            ctx.beginPath();
            ctx.arc(px + wobbleX, py + wobbleY, 3, 0, Math.PI * 2);
            ctx.fill();
            
            // Smaller bright core
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = 0.8;
            ctx.beginPath();
            ctx.arc(px + wobbleX, py + wobbleY, 1, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Swirling particles at connection points
        const time = Date.now() / 500;
        
        // Rescue ship connection point
        for (let i = 0; i < 8; i++) {
            const orbitAngle = (time + i / 8 * Math.PI * 2) % (Math.PI * 2);
            const orbitRadius = 8 + Math.sin(time * 2 + i) * 2;
            const ox = rescueShip.x + Math.cos(orbitAngle) * orbitRadius;
            const oy = rescueShip.y + Math.sin(orbitAngle) * orbitRadius;
            
            ctx.fillStyle = '#00ffff';
            ctx.globalAlpha = 0.6;
            ctx.beginPath();
            ctx.arc(ox, oy, 2, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Player ship connection point
        for (let i = 0; i < 8; i++) {
            const orbitAngle = (-time + i / 8 * Math.PI * 2) % (Math.PI * 2);
            const orbitRadius = 10 + Math.sin(time * 2 + i) * 2;
            const ox = player.x + Math.cos(orbitAngle) * orbitRadius;
            const oy = player.y + Math.sin(orbitAngle) * orbitRadius;
            
            ctx.fillStyle = '#00ffff';
            ctx.globalAlpha = 0.6;
            ctx.beginPath();
            ctx.arc(ox, oy, 2, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Larger glow at connection points
        const glowGradient1 = ctx.createRadialGradient(rescueShip.x, rescueShip.y, 0, rescueShip.x, rescueShip.y, 15);
        glowGradient1.addColorStop(0, 'rgba(0, 255, 255, 0.6)');
        glowGradient1.addColorStop(1, 'rgba(0, 255, 255, 0)');
        ctx.fillStyle = glowGradient1;
        ctx.globalAlpha = 0.5 + Math.sin(time * 3) * 0.2;
        ctx.beginPath();
        ctx.arc(rescueShip.x, rescueShip.y, 15, 0, Math.PI * 2);
        ctx.fill();
        
        const glowGradient2 = ctx.createRadialGradient(player.x, player.y, 0, player.x, player.y, 18);
        glowGradient2.addColorStop(0, 'rgba(0, 255, 255, 0.6)');
        glowGradient2.addColorStop(1, 'rgba(0, 255, 255, 0)');
        ctx.fillStyle = glowGradient2;
        ctx.globalAlpha = 0.5 + Math.sin(time * 3 + Math.PI) * 0.2;
        ctx.beginPath();
        ctx.arc(player.x, player.y, 18, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.globalAlpha = 1;
        ctx.restore();
    }
    
    ctx.save();
    ctx.translate(rescueShip.x, rescueShip.y);
    ctx.rotate(rescueShip.angle);
    
    // Rescue ship body (smaller ship, yellow/orange)
    ctx.fillStyle = '#ffaa00';
    ctx.strokeStyle = '#ffff00';
    ctx.lineWidth = 2;
    
    // Main body (triangle)
    ctx.beginPath();
    ctx.moveTo(rescueShip.size, 0);
    ctx.lineTo(-rescueShip.size, rescueShip.size * 0.6);
    ctx.lineTo(-rescueShip.size, -rescueShip.size * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Rescue symbol (cross)
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(4, 0);
    ctx.moveTo(0, -4);
    ctx.lineTo(0, 4);
    ctx.stroke();
    
    // Engine glow when moving
    if (rescueShip.state !== 'refueling') {
        ctx.fillStyle = '#00ffff';
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(-rescueShip.size, 0, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
    
    ctx.restore();
}

function renderPlayer() {
    // Ship visuals are dynamically generated based on gameState.upgrades
    // This ensures visual appearance is consistent with save/load system
    // (all upgrade values are saved and restored automatically)
    
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    
    // Calculate distance to nearest station
    const nearestStation = findNearestStation(player.x, player.y);
    let withinStationRange = false;
    if (nearestStation) {
        const dx = nearestStation.x - player.x;
        const dy = nearestStation.y - player.y;
        const distToStation = Math.sqrt(dx * dx + dy * dy);
        withinStationRange = distToStation < nearestStation.dockingRange;
    }
    
    // Thruster effect (behind ship) - show if moving AND (outside station range OR player is manually controlling)
    const currentSpeed = Math.sqrt(player.vx ** 2 + player.vy ** 2);
    const showThruster = currentSpeed > 0.1 && (!withinStationRange || player.isManuallyControlled);
    
    if (showThruster) {
        const speedLevel = gameState.upgrades.speed || 1;
        const thrusterCount = Math.min(Math.floor(speedLevel / 3) + 1, 3); // 1-3 thrusters based on speed
        const thrusterLength = Math.min(currentSpeed * 15, player.size * 8); // Even longer: 15x speed, 8x max size
        const flicker = Math.random() * 0.3 + 0.7;
        
        // Enhanced thrusters based on speed upgrade - use player's thruster color
        const thrusterIntensity = Math.min(speedLevel / 10, 1);
        
        // Parse the player's thruster color to create gradient variations
        const baseColor = player.colors.thruster;
        
        // Extract RGB from hex color
        const r = parseInt(baseColor.substr(1, 2), 16);
        const g = parseInt(baseColor.substr(3, 2), 16);
        const b = parseInt(baseColor.substr(5, 2), 16);
        
        // Outer flame - uses base color with flickering alpha
        const thrusterColor = `${baseColor}${Math.floor(flicker * 204 + 51).toString(16).padStart(2, '0')}`;
        
        // Inner flame - lighter/brighter version of base color with flickering alpha
        const lightenFactor = 0.6 + (thrusterIntensity * 0.4); // 0.6 to 1.0
        const innerR = Math.min(255, Math.floor(r + (255 - r) * lightenFactor));
        const innerG = Math.min(255, Math.floor(g + (255 - g) * lightenFactor));
        const innerB = Math.min(255, Math.floor(b + (255 - b) * lightenFactor));
        const innerColor = `rgba(${innerR}, ${innerG}, ${innerB}, ${flicker})`;
        
        for (let i = 0; i < thrusterCount; i++) {
            const offset = (i - (thrusterCount - 1) / 2) * player.size * 0.25;
            
            ctx.fillStyle = thrusterColor;
            ctx.beginPath();
            // Flames start from tapered trapezoid rear edge - wider opening (±0.2 instead of ±0.15)
            ctx.moveTo(-player.size * 0.75, -player.size * 0.2 + offset);
            ctx.lineTo(-player.size * 0.75 - thrusterLength, offset);
            ctx.lineTo(-player.size * 0.75, player.size * 0.2 + offset);
            ctx.closePath();
            ctx.fill();
            
            // Inner flame - bigger core
            ctx.fillStyle = innerColor;
            ctx.beginPath();
            ctx.moveTo(-player.size * 0.75, -player.size * 0.15 + offset);
            ctx.lineTo(-player.size * 0.75 - thrusterLength * 0.7, offset);
            ctx.lineTo(-player.size * 0.75, player.size * 0.15 + offset);
            ctx.closePath();
            ctx.fill();
        }
    }
    
    // Main ship body - Mining Vessel design (Design #6: Sleek Frigate)
    // Ship structure: Triangle nose -> Rectangular body with side tanks -> Triangle rear
    /*
        /\
     []/__\[]
     | |()| |
     | |  | |
     |_|  |_|
       \  /
        \/
    */
    
    ctx.fillStyle = player.colors.primary;
    ctx.strokeStyle = player.colors.secondary;
    ctx.lineWidth = 2;
    
    // ===== FRONT: Triangle Nose =====
    ctx.beginPath();
    ctx.moveTo(player.size * 0.85, 0);                          // Nose tip (pointed)
    ctx.lineTo(player.size * 0.4, -player.size * 0.25);         // Top-left of nose (matches body width)
    ctx.lineTo(player.size * 0.4, player.size * 0.25);          // Bottom-left of nose (matches body width)
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // ===== MIDDLE: Rectangular Main Body (elongated) =====
    ctx.beginPath();
    ctx.rect(-player.size * 0.4, -player.size * 0.25, player.size * 0.8, player.size * 0.5);
    ctx.fill();
    ctx.stroke();
    
    // ===== REAR: Trapezoid Thruster Section (wide at body, tapers to rear) =====
    ctx.beginPath();
    ctx.moveTo(-player.size * 0.4, -player.size * 0.25);        // Top-right of body (matches body width)
    ctx.lineTo(-player.size * 0.75, -player.size * 0.15);       // Top-rear (tapered narrower)
    ctx.lineTo(-player.size * 0.75, player.size * 0.15);        // Bottom-rear (tapered narrower)
    ctx.lineTo(-player.size * 0.4, player.size * 0.25);         // Bottom-right of body (matches body width)
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // ===== THRUSTER NACELLES (Speed upgrade visual) =====
    const speedLevel = gameState.upgrades.speed || 1;
    if (speedLevel >= 3) {
        const nacelleOpacity = Math.min(0.3 + (speedLevel - 3) * 0.07, 0.9);
        ctx.fillStyle = `rgba(80, 100, 120, ${nacelleOpacity})`;
        ctx.strokeStyle = player.colors.secondary;
        ctx.lineWidth = 1;
        
        // Number of nacelles based on speed level
        const nacelleCount = Math.min(Math.floor((speedLevel - 2) / 3) + 1, 3);
        const nacelleSize = player.size * 0.12;
        
        for (let i = 0; i < nacelleCount; i++) {
            const offset = (i - (nacelleCount - 1) / 2) * player.size * 0.25;
            
            // Nacelle body
            ctx.beginPath();
            ctx.rect(-player.size * 0.55, offset - nacelleSize / 2, player.size * 0.2, nacelleSize);
            ctx.fill();
            ctx.stroke();
            
            // Thruster port (glowing)
            ctx.fillStyle = player.colors.thruster;
            ctx.beginPath();
            ctx.arc(-player.size * 0.55, offset, nacelleSize * 0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = `rgba(80, 100, 120, ${nacelleOpacity})`;
        }
    }
    
    // ===== SIDE TANKS (Cargo/Fuel Pods) - Running parallel alongside body =====
    const cargoLevel = gameState.upgrades.cargo || 1;
    const fuelLevel = gameState.upgrades.fuel || 1;
    const tankLength = Math.min(0.8 + Math.max(cargoLevel, fuelLevel) * 0.03, 1.1); // Longer base + grows with upgrades
    const tankWidth = player.size * 0.22; // Much wider tanks
    
    // Calculate tank start position to center it at 0.0
    const tankStartX = -tankLength / 2;
    
    // Left tank is CARGO (left side of ship)
    const cargoFillPercent = gameState.cargo / gameState.maxCargo;
    const cargoFillWidth = player.size * tankLength * cargoFillPercent;
    
    // Cargo fill - DRAW FIRST (behind) - fills from front to back
    // Parse accent color and create semi-transparent version
    const accentR = parseInt(player.colors.accent.substr(1, 2), 16);
    const accentG = parseInt(player.colors.accent.substr(3, 2), 16);
    const accentB = parseInt(player.colors.accent.substr(5, 2), 16);
    ctx.fillStyle = `rgba(${accentR}, ${accentG}, ${accentB}, ${0.6 + cargoLevel * 0.04})`;
    ctx.beginPath();
    ctx.rect(
        player.size * tankStartX, 
        -player.size * 0.47,
        cargoFillWidth,
        tankWidth
    );
    ctx.fill();
    
    // Cargo tank outline - DRAW SECOND (on top)
    ctx.strokeStyle = player.colors.secondary;
    ctx.lineWidth = 1.5;
    ctx.fillStyle = 'rgba(0, 50, 50, 0.3)'; // Dark background
    ctx.beginPath();
    ctx.rect(player.size * tankStartX, -player.size * 0.47, player.size * tankLength, tankWidth);
    ctx.fill();
    ctx.stroke();
    
    // Right tank is FUEL (right side of ship)
    const fuelFillPercent = gameState.fuel / gameState.maxFuel;
    const fuelFillWidth = player.size * tankLength * fuelFillPercent;
    
    // Fuel fill - DRAW FIRST (behind) - fills from front to back
    // Parse thruster color and create semi-transparent version
    const thrusterR = parseInt(player.colors.thruster.substr(1, 2), 16);
    const thrusterG = parseInt(player.colors.thruster.substr(3, 2), 16);
    const thrusterB = parseInt(player.colors.thruster.substr(5, 2), 16);
    ctx.fillStyle = `rgba(${thrusterR}, ${thrusterG}, ${thrusterB}, ${0.6 + fuelLevel * 0.04})`;
    ctx.beginPath();
    ctx.rect(
        player.size * tankStartX,
        player.size * 0.47 - tankWidth,
        fuelFillWidth,
        tankWidth
    );
    ctx.fill();
    
    // Fuel tank outline - DRAW SECOND (on top)
    ctx.fillStyle = 'rgba(0, 50, 80, 0.3)'; // Dark background
    ctx.beginPath();
    ctx.rect(player.size * tankStartX, player.size * 0.47 - tankWidth, player.size * tankLength, tankWidth);
    ctx.fill();
    ctx.stroke();
    
    // Tank connection struts - connecting tanks to main body
    ctx.strokeStyle = player.colors.secondary;
    ctx.lineWidth = 1;
    // Front struts
    ctx.beginPath();
    ctx.moveTo(player.size * 0.3, -player.size * 0.25);
    ctx.lineTo(player.size * 0.3, -player.size * 0.47);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(player.size * 0.3, player.size * 0.25);
    ctx.lineTo(player.size * 0.3, player.size * 0.47 - tankWidth);
    ctx.stroke();
    // Rear struts
    ctx.beginPath();
    ctx.moveTo(-player.size * 0.3, -player.size * 0.25);
    ctx.lineTo(-player.size * 0.3, -player.size * 0.47);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-player.size * 0.3, player.size * 0.25);
    ctx.lineTo(-player.size * 0.3, player.size * 0.47 - tankWidth);
    ctx.stroke();
    
    // ===== COCKPIT WINDOW (Center of body) =====
    ctx.fillStyle = '#00ddff';
    ctx.strokeStyle = player.colors.accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(player.size * 0.15, 0, player.size * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Cockpit inner window (glowing)
    ctx.fillStyle = '#00ffff';
    ctx.beginPath();
    ctx.arc(player.size * 0.15, 0, player.size * 0.1, 0, Math.PI * 2);
    ctx.fill();
    
    // ===== DETAIL LINES (Body paneling) =====
    ctx.strokeStyle = player.colors.secondary;
    ctx.lineWidth = 1;
    
    // Horizontal center line
    ctx.beginPath();
    ctx.moveTo(-player.size * 0.4, 0);
    ctx.lineTo(player.size * 0.4, 0);
    ctx.stroke();
    
    // Vertical separation lines (between sections)
    ctx.beginPath();
    ctx.moveTo(player.size * 0.4, -player.size * 0.25);
    ctx.lineTo(player.size * 0.4, player.size * 0.25);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(-player.size * 0.4, -player.size * 0.25);
    ctx.lineTo(-player.size * 0.4, player.size * 0.25);
    ctx.stroke();
    
    // ===== HULL REINFORCEMENT (Armor Plating) =====
    const hullLevel = gameState.upgrades.hull || 1;
    
    // Armor plating appears at level 2+ with increasing visibility
    if (hullLevel >= 2) {
        const armorOpacity = Math.min(0.2 + (hullLevel - 2) * 0.08, 0.8);
        ctx.fillStyle = `rgba(100, 120, 140, ${armorOpacity})`;
        ctx.strokeStyle = player.colors.secondary;
        ctx.lineWidth = 1.5;
        
        // Armor plates on main body
        const plateCount = Math.min(Math.floor((hullLevel - 1) / 2), 3);
        for (let i = 0; i < plateCount; i++) {
            const x = player.size * 0.15 - (i * player.size * 0.2);
            const plateWidth = player.size * 0.15;
            const plateHeight = player.size * 0.4;
            
            ctx.beginPath();
            ctx.rect(x - plateWidth / 2, -plateHeight / 2, plateWidth, plateHeight);
            ctx.fill();
            ctx.stroke();
        }
    }
    
    // Reinforcement lines at level 5+
    if (hullLevel >= 5) {
        ctx.strokeStyle = player.colors.accent;
        ctx.lineWidth = 2;
        const reinforcementLines = Math.min(Math.floor((hullLevel - 4) / 2), 3);
        for (let i = 0; i < reinforcementLines; i++) {
            const x = player.size * 0.1 - (i * player.size * 0.15);
            ctx.beginPath();
            ctx.moveTo(x, -player.size * 0.2);
            ctx.lineTo(x, player.size * 0.2);
            ctx.stroke();
        }
    }
    
    // ===== MINING LASERS (Tank-mounted) =====
    const miningLasers = gameState.upgrades.multiMining || 1;
    const tankEndX = tankLength / 2;
    
    ctx.fillStyle = player.colors.accent;
    ctx.strokeStyle = player.colors.secondary;
    ctx.lineWidth = 1;
    
    // Define laser positions on tanks (reusing tank variables from above)
    const laserPositions = [];
    if (miningLasers >= 1) laserPositions.push({ x: tankEndX, y: 0.47 }); // Front fuel
    if (miningLasers >= 2) laserPositions.push({ x: tankEndX, y: -0.47 }); // Front cargo
    if (miningLasers >= 3) laserPositions.push({ x: 0.0, y: 0.47 /*+ (tankWidth / player.size) */}); // Center fuel outer
    if (miningLasers >= 4) laserPositions.push({ x: 0.0, y: -0.47 /*- (tankWidth / player.size) */}); // Center cargo outer
    if (miningLasers >= 5) laserPositions.push({ x: tankStartX, y: 0.47 }); // Rear fuel
    if (miningLasers >= 6) laserPositions.push({ x: tankStartX, y: -0.47 }); // Rear cargo
    
    laserPositions.forEach((pos, i) => {
        const laserX = player.size * pos.x;
        const laserY = player.size * pos.y;
        
        ctx.beginPath();
        ctx.arc(laserX, laserY, player.size * 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Laser glow when actively mining AND this specific laser has a target
        if (player.isMining && i < player.miningTargets.length && player.miningTargets[i] && player.miningTargets[i].asteroid) {
            ctx.fillStyle = `${player.colors.accent}80`;
            ctx.beginPath();
            ctx.arc(laserX, laserY, player.size * 0.18, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = player.colors.accent;
        }
    });
    
    // ===== ADVANCED SCANNER ANTENNA (Nose mount) =====
    if (gameState.upgrades.advancedScanner >= 1) {
        // Pulsing glow effect
        const pulseSpeed = 2; // Pulses per second
        const pulsePhase = (Date.now() / 1000) * pulseSpeed;
        const pulseIntensity = (Math.sin(pulsePhase * Math.PI * 2) + 1) / 2; // 0 to 1
        
        const noseX = player.size * 0.85; // At the tip of the nose
        const noseY = 0;
        const baseRadius = 2; // Half the previous size (was 4)
        const glowRadius = baseRadius + (pulseIntensity * 1.5); // Grows from 2 to 3.5
        
        // Convert accent color to RGB for gradient
        const accentColor = player.colors.accent;
        const r = parseInt(accentColor.slice(1, 3), 16);
        const g = parseInt(accentColor.slice(3, 5), 16);
        const b = parseInt(accentColor.slice(5, 7), 16);
        
        // Outer glow (pulsing)
        const gradient = ctx.createRadialGradient(noseX, noseY, 0, noseX, noseY, glowRadius);
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.8 * pulseIntensity})`);
        gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${0.4 * pulseIntensity})`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(noseX, noseY, glowRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Core circle (accent color)
        ctx.fillStyle = player.colors.accent;
        ctx.beginPath();
        ctx.arc(noseX, noseY, baseRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Bright inner core
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(noseX, noseY, baseRadius * 0.5, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // ===== MINING LASERS (Front-mounted on nose) =====
    const rangeLevel = gameState.upgrades.range || 1;
    if (rangeLevel >= 5) {
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.2)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        
        const rangeLines = Math.min(Math.floor((rangeLevel - 4) / 2), 3);
        for (let i = 0; i < rangeLines; i++) {
            const lineAngle = (i - (rangeLines - 1) / 2) * 0.6;
            const lineLength = player.size * 1.2;
            ctx.beginPath();
            ctx.moveTo(player.size * 0.8, 0);
            ctx.lineTo(
                player.size * 0.8 + lineLength * Math.cos(lineAngle),
                lineLength * Math.sin(lineAngle)
            );
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }
    
    // Shield effect
    if (gameState.shieldActive) {
        ctx.strokeStyle = 'rgba(0, 200, 255, 0.5)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, player.size * 1.5, 0, Math.PI * 2);
        ctx.stroke();
    }
    
    // ===== FUEL WARNING INDICATORS =====
    const fuelPercentage = (gameState.fuel / gameState.maxFuel) * 100;
    const currentTime = Date.now();
    
    // Track when warnings are triggered
    if (fuelPercentage <= 40 && fuelPercentage > 20 && !fuelWarnings.warning50.triggered) {
        fuelWarnings.warning50.triggered = true;
        fuelWarnings.warning50.timestamp = currentTime;
    }
    if (fuelPercentage <= 20 && fuelPercentage > 10 && !fuelWarnings.warning25.triggered) {
        fuelWarnings.warning25.triggered = true;
        fuelWarnings.warning25.timestamp = currentTime;
    }
    
    // Reset warnings if fuel goes back above threshold (refueling)
    if (fuelPercentage > 40) {
        fuelWarnings.warning50.triggered = false;
    }
    if (fuelPercentage > 20) {
        fuelWarnings.warning25.triggered = false;
    }
    
    if (fuelPercentage <= 40) {
        // Save current rotation state and reset to upright
        ctx.save();
        ctx.rotate(-player.angle); // Counter-rotate to make warning upright
        
        if (fuelPercentage > 20) {
            // 40% warning - yellow caution (1 sec display + 1 sec fade)
            const timeSinceTriggered = currentTime - fuelWarnings.warning50.timestamp;
            let warningAlpha = 0;
            
            if (timeSinceTriggered < 1000) {
                // First second: full visibility
                warningAlpha = 1.0;
            } else if (timeSinceTriggered < 2000) {
                // Second second: fade out
                warningAlpha = 1.0 - ((timeSinceTriggered - 1000) / 1000);
            }
            
            if (warningAlpha > 0) {
                const pulse = Math.sin(Date.now() / 1000) * 0.3 + 0.7; // Slow pulse
                ctx.fillStyle = `rgba(255, 200, 0, ${pulse * warningAlpha})`;
                ctx.font = `bold ${player.size * 0.4}px monospace`;
                ctx.textAlign = 'center';
                ctx.fillText('FUEL AT 40%', 0, -player.size * 1.2);
                
                // Small indicator triangle
                ctx.strokeStyle = `rgba(255, 200, 0, ${pulse * warningAlpha})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(-player.size * 0.15, -player.size * 0.95);
                ctx.lineTo(0, -player.size * 1.05);
                ctx.lineTo(player.size * 0.15, -player.size * 0.95);
                ctx.closePath();
                ctx.stroke();
            }
        } else if (fuelPercentage > 15) {
            // 20% warning - orange urgent (1 sec display + 1 sec fade)
            const timeSinceTriggered = currentTime - fuelWarnings.warning25.timestamp;
            let warningAlpha = 0;
            
            if (timeSinceTriggered < 1000) {
                // First second: full visibility
                warningAlpha = 1.0;
            } else if (timeSinceTriggered < 2000) {
                // Second second: fade out
                warningAlpha = 1.0 - ((timeSinceTriggered - 1000) / 1000);
            }
            
            if (warningAlpha > 0) {
                const pulse = Math.sin(Date.now() / 500) * 0.4 + 0.6; // Faster pulse
                ctx.fillStyle = `rgba(255, 120, 0, ${pulse * warningAlpha})`;
                ctx.font = `bold ${player.size * 0.45}px monospace`;
                ctx.textAlign = 'center';
                ctx.fillText('⚠ FUEL AT 20%', 0, -player.size * 1.25);
                
                // Double warning triangles
                ctx.strokeStyle = `rgba(255, 120, 0, ${pulse * warningAlpha})`;
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.moveTo(-player.size * 0.25, -player.size * 0.95);
                ctx.lineTo(-player.size * 0.1, -player.size * 1.05);
                ctx.lineTo(player.size * 0.05, -player.size * 0.95);
                ctx.closePath();
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(-player.size * 0.05, -player.size * 0.95);
                ctx.lineTo(player.size * 0.1, -player.size * 1.05);
                ctx.lineTo(player.size * 0.25, -player.size * 0.95);
                ctx.closePath();
                ctx.stroke();
            }
        } else {
            // Critical warning - red persistent with fast flash
            const flash = Math.sin(Date.now() / 200) * 0.5 + 0.5; // Fast flash
            ctx.fillStyle = `rgba(255, 0, 0, ${0.8 + flash * 0.2})`;
            ctx.font = `bold ${player.size * 0.5}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText('FUEL CRITICAL!', 0, -player.size * 1.3);
            
            // Critical background box
            ctx.fillStyle = `rgba(255, 0, 0, ${0.2 + flash * 0.15})`;
            ctx.fillRect(-player.size * 0.6, -player.size * 1.5, player.size * 1.2, player.size * 0.35);
            
            // Re-render text on top of box
            ctx.fillStyle = `rgba(255, 0, 0, ${0.8 + flash * 0.2})`;
            ctx.fillText('FUEL CRITICAL!', 0, -player.size * 1.3);
            
            // Triple warning triangles
            ctx.strokeStyle = `rgba(255, 0, 0, ${0.8 + flash * 0.2})`;
            ctx.lineWidth = 3;
            for (let i = 0; i < 3; i++) {
                const offsetX = (i - 1) * player.size * 0.22;
                ctx.beginPath();
                ctx.moveTo(offsetX - player.size * 0.08, -player.size * 0.95);
                ctx.lineTo(offsetX, -player.size * 1.05);
                ctx.lineTo(offsetX + player.size * 0.08, -player.size * 0.95);
                ctx.closePath();
                ctx.stroke();
            }
            
            // Fuel percentage display
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.font = `bold ${player.size * 0.35}px monospace`;
            ctx.fillText(`${fuelPercentage.toFixed(1)}%`, 0, -player.size * 0.7);
        }
        
        // Restore rotation state
        ctx.restore();
    }
    
    ctx.restore();
}

function renderAsteroids() {
    // Viewport culling - only render visible asteroids
    const viewLeft = viewport.x;
    const viewRight = viewport.x + canvas.width / viewport.zoom;
    const viewTop = viewport.y;
    const viewBottom = viewport.y + canvas.height / viewport.zoom;
    const cullMargin = 100; // Extra margin to avoid pop-in
    
    const len = asteroids.length;
    for (let i = 0; i < len; i++) {
        const asteroid = asteroids[i];
        
        // Skip destroyed asteroids
        if (asteroid.destroyed) continue;
        
        // Cull asteroids outside viewport
        if (asteroid.x + 50 < viewLeft - cullMargin || 
            asteroid.x - 50 > viewRight + cullMargin ||
            asteroid.y + 50 < viewTop - cullMargin || 
            asteroid.y - 50 > viewBottom + cullMargin) {
            continue; // Skip rendering this asteroid
        }
        
        const data = ASTEROID_TYPES[asteroid.type];
        
        ctx.save();
        ctx.translate(asteroid.x, asteroid.y);
        ctx.rotate(asteroid.rotation);
        
        // Draw custom geometry
        if (asteroid.geometry && asteroid.geometry.length > 0) {
            ctx.fillStyle = data.color;
            ctx.strokeStyle = data.color;
            ctx.lineWidth = 2;
            
            // Draw filled polygon
            ctx.beginPath();
            ctx.moveTo(asteroid.geometry[0].x, asteroid.geometry[0].y);
            const geomLen = asteroid.geometry.length;
            for (let j = 1; j < geomLen; j++) {
                ctx.lineTo(asteroid.geometry[j].x, asteroid.geometry[j].y);
            }
            ctx.closePath();
            ctx.fill();
            
            // Draw outline with slightly darker color
            ctx.globalAlpha = 0.6;
            ctx.stroke();
            ctx.globalAlpha = 1.0;
            
            // Draw some interior details (cracks/features) - only if not mined yet
            if (asteroid.health === asteroid.maxHealth) {
                ctx.strokeStyle = data.color;
                ctx.globalAlpha = 0.3;
                ctx.lineWidth = 1;
                const numCracks = 2 + Math.floor(Math.random() * 3);
                for (let j = 0; j < numCracks; j++) {
                    const p1 = asteroid.geometry[Math.floor(Math.random() * geomLen)];
                    const p2 = asteroid.geometry[Math.floor(Math.random() * geomLen)];
                    ctx.beginPath();
                    ctx.moveTo(p1.x * 0.5, p1.y * 0.5);
                    ctx.lineTo(p2.x * 0.5, p2.y * 0.5);
                    ctx.stroke();
                }
                ctx.globalAlpha = 1.0;
            }
        } else {
            // Fallback to icon if no geometry
            ctx.fillStyle = data.color;
            ctx.font = `${data.size * 2}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(data.icon, 0, 0);
        }
        
        ctx.restore();
        
        // Draw mining progress bar if this asteroid is being mined
        const miningTarget = player.miningTargets.find(mt => mt.asteroid === asteroid);
        if (miningTarget) {
            const miningSpeed = CONFIG.baseMiningSpeed * (1 - (gameState.upgrades.mining - 1) * 0.1);
            const progress = miningTarget.progress / miningSpeed;
            
            // Draw progress bar above the asteroid
            const barWidth = 40;
            const barHeight = 6;
            const barX = asteroid.x - barWidth / 2;
            const barY = asteroid.y - data.size - 15;
            
            // Background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(barX, barY, barWidth, barHeight);
            
            // Progress fill
            ctx.fillStyle = '#ffff00';
            ctx.fillRect(barX, barY, barWidth * progress, barHeight);
            
            // Border
            ctx.strokeStyle = '#ffff00';
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, barY, barWidth, barHeight);
        }
    }
}

function renderHazards() {
    // Viewport culling
    const viewLeft = viewport.x;
    const viewRight = viewport.x + canvas.width / viewport.zoom;
    const viewTop = viewport.y;
    const viewBottom = viewport.y + canvas.height / viewport.zoom;
    const cullMargin = 100;
    
    const len = hazards.length;
    for (let i = 0; i < len; i++) {
        const hazard = hazards[i];
        const data = HAZARD_TYPES[hazard.type];
        
        // Cull hazards outside viewport
        if (hazard.x + data.size < viewLeft - cullMargin || 
            hazard.x - data.size > viewRight + cullMargin ||
            hazard.y + data.size < viewTop - cullMargin || 
            hazard.y - data.size > viewBottom + cullMargin) {
            continue;
        }
        
        ctx.save();
        ctx.translate(hazard.x, hazard.y);
        ctx.rotate(hazard.rotation);
        
        // Draw hazard as geometric shape instead of text (for consistent cross-platform rendering)
        ctx.fillStyle = data.color;
        ctx.strokeStyle = data.color;
        ctx.lineWidth = 2;
        
        if (hazard.type === 'debris') {
            // Space Debris: X shape with rotating fragments
            const size = data.size;
            ctx.beginPath();
            // Diagonal line 1
            ctx.moveTo(-size * 0.6, -size * 0.6);
            ctx.lineTo(size * 0.6, size * 0.6);
            // Diagonal line 2
            ctx.moveTo(size * 0.6, -size * 0.6);
            ctx.lineTo(-size * 0.6, size * 0.6);
            ctx.stroke();
            
            // Add small squares at the ends for detail
            const squareSize = size * 0.2;
            ctx.fillRect(-size * 0.6 - squareSize/2, -size * 0.6 - squareSize/2, squareSize, squareSize);
            ctx.fillRect(size * 0.6 - squareSize/2, size * 0.6 - squareSize/2, squareSize, squareSize);
            ctx.fillRect(size * 0.6 - squareSize/2, -size * 0.6 - squareSize/2, squareSize, squareSize);
            ctx.fillRect(-size * 0.6 - squareSize/2, size * 0.6 - squareSize/2, squareSize, squareSize);
            
        } else if (hazard.type === 'mine') {
            // Proximity Mine: Circle with spikes
            const size = data.size;
            
            // Central circle
            ctx.beginPath();
            ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2);
            ctx.fill();
            
            // Spikes around the mine
            const spikeCount = 8;
            for (let s = 0; s < spikeCount; s++) {
                const angle = (s / spikeCount) * Math.PI * 2;
                const innerRadius = size * 0.5;
                const outerRadius = size * 0.9;
                ctx.beginPath();
                ctx.moveTo(Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius);
                ctx.lineTo(Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius);
                ctx.stroke();
            }
            
            // Inner ring for detail
            ctx.beginPath();
            ctx.arc(0, 0, size * 0.3, 0, Math.PI * 2);
            ctx.strokeStyle = '#880000';
            ctx.stroke();
            
        } else if (hazard.type === 'vortex') {
            // Gravity Vortex: Spiral pattern
            const size = data.size;
            
            // Draw swirling spiral
            ctx.strokeStyle = data.color;
            ctx.lineWidth = 3;
            const spiralTurns = 3;
            ctx.beginPath();
            for (let t = 0; t < spiralTurns; t += 0.1) {
                const angle = t * Math.PI * 2;
                const radius = (size * 0.6) * (t / spiralTurns);
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;
                if (t === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
            
            // Center dot
            ctx.fillStyle = data.color;
            ctx.beginPath();
            ctx.arc(0, 0, size * 0.15, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Vortex effect (animated rings for vortex only)
        if (hazard.type === 'vortex') {
            ctx.strokeStyle = `rgba(136, 0, 255, ${0.3 + Math.sin(frameCount * 0.1) * 0.2})`;
            ctx.lineWidth = 2;
            for (let j = 1; j <= 3; j++) {
                ctx.beginPath();
                ctx.arc(0, 0, data.size * j * 0.8, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
        
        ctx.restore();
    }
}

function renderParticles() {
    // Optimized with for loop and viewport culling
    const viewLeft = viewport.x - 50;
    const viewRight = viewport.x + canvas.width / viewport.zoom + 50;
    const viewTop = viewport.y - 50;
    const viewBottom = viewport.y + canvas.height / viewport.zoom + 50;
    
    const len = particles.length;
    for (let i = 0; i < len; i++) {
        const p = particles[i];
        
        // Cull particles outside viewport
        if (p.x < viewLeft || p.x > viewRight || p.y < viewTop || p.y > viewBottom) {
            continue;
        }
        
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
}

function renderMiningLaser() {
    // Calculate physical laser positions on the ship based on tank locations
    const miningLasers = gameState.upgrades.multiMining || 1;
    const laserPositions = [];
    
    // Tank dimensions (match the tank rendering code)
    const cargoLevel = gameState.upgrades.cargo || 1;
    const fuelLevel = gameState.upgrades.fuel || 1;
    const tankLength = Math.min(0.8 + Math.max(cargoLevel, fuelLevel) * 0.03, 1.1);
    const tankWidth = 0.22; // Relative to player.size
    const tankStartX = -tankLength / 2;
    const tankEndX = tankLength / 2;
    
    // Define laser positions in ship-local coordinates (before rotation)
    const laserLocalPositions = [];
    
    if (miningLasers >= 1) {
        // Laser 1: Front of fuel tank (bottom-front)
        laserLocalPositions.push({ x: tankEndX, y: 0.47 });
    }
    if (miningLasers >= 2) {
        // Laser 2: Front of cargo tank (top-front)
        laserLocalPositions.push({ x: tankEndX, y: -0.47 });
    }
    if (miningLasers >= 3) {
        // Laser 3: Center, far side of fuel tank (bottom-center, outer edge)
        laserLocalPositions.push({ x: 0.0, y: 0.47 });
    }
    if (miningLasers >= 4) {
        // Laser 4: Center, far side of cargo tank (top-center, outer edge)
        laserLocalPositions.push({ x: 0.0, y: -0.47 });
    }
    if (miningLasers >= 5) {
        // Laser 5: Back of fuel tank (bottom-rear)
        laserLocalPositions.push({ x: tankStartX, y: 0.47 });
    }
    if (miningLasers >= 6) {
        // Laser 6: Back of cargo tank (top-rear)
        laserLocalPositions.push({ x: tankStartX, y: -0.47 });
    }
    
    // Transform local coordinates to world coordinates using ship's rotation
    laserLocalPositions.forEach(local => {
        const localX = local.x * player.size;
        const localY = local.y * player.size;
        
        const worldX = player.x + Math.cos(player.angle) * localX - Math.sin(player.angle) * localY;
        const worldY = player.y + Math.sin(player.angle) * localX + Math.cos(player.angle) * localY;
        
        laserPositions.push({ x: worldX, y: worldY, localX: local.x, localY: local.y });
    });
    
    // Draw lasers from physical laser positions to targets
    player.miningTargets.forEach((target, index) => {
        // Skip idle lasers (no target assigned)
        if (!target || !target.asteroid) {
            return;
        }
        
        // Safety check: ensure asteroid still exists and isn't destroyed
        if (target.asteroid.destroyed || !asteroids.includes(target.asteroid)) {
            return;
        }
        
        // Get the corresponding laser position for this laser index
        const laserPos = laserPositions[index];
        if (!laserPos) return; // Safety check
        
        // Use player's accent color for laser beam
        ctx.strokeStyle = `${player.colors.accent}99`; // 60% opacity
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(laserPos.x, laserPos.y);
        ctx.lineTo(target.asteroid.x, target.asteroid.y);
        ctx.stroke();
        
        // Glow effect
        ctx.strokeStyle = `${player.colors.accent}4D`; // 30% opacity
        ctx.lineWidth = 4;
        ctx.stroke();
    });
}

function renderFloatingText() {
    floatingText.forEach(text => {
        ctx.globalAlpha = text.alpha;
        ctx.fillStyle = text.color;
        ctx.font = '14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(text.text, text.x, text.y);
    });
    ctx.globalAlpha = 1;
}

function renderMinimap() {
    const scale = minimapCanvas.width / CONFIG.worldWidth;
    
    minimapCtx.fillStyle = '#000000';
    minimapCtx.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);
    
    minimapCtx.strokeStyle = '#00ff00';
    minimapCtx.strokeRect(0, 0, minimapCanvas.width, minimapCanvas.height);
    
    // Draw asteroids
    asteroids.forEach(asteroid => {
        const data = ASTEROID_TYPES[asteroid.type];
        minimapCtx.fillStyle = data.color;
        minimapCtx.fillRect(
            asteroid.x * scale - 1,
            asteroid.y * scale - 1,
            2, 2
        );
    });
    
    // Draw hazards
    hazards.forEach(hazard => {
        const data = HAZARD_TYPES[hazard.type];
        minimapCtx.fillStyle = data.color;
        minimapCtx.fillRect(
            hazard.x * scale - 1,
            hazard.y * scale - 1,
            3, 3
        );
    });
    
    // Draw all space stations
    stations.forEach(st => {
        const stationColors = st.colorScheme || STATION_COLORS[2];
        minimapCtx.fillStyle = st.isDocked ? stationColors.primary : stationColors.tertiary;
        minimapCtx.strokeStyle = stationColors.primary;
        minimapCtx.lineWidth = 2;
        const stationSize = 6;
        minimapCtx.fillRect(
            st.x * scale - stationSize / 2,
            st.y * scale - stationSize / 2,
            stationSize, stationSize
        );
        minimapCtx.strokeRect(
            st.x * scale - stationSize / 2,
            st.y * scale - stationSize / 2,
            stationSize, stationSize
        );
    });
    
    // Draw player
    minimapCtx.fillStyle = '#00ffff';
    minimapCtx.fillRect(
        player.x * scale - 2,
        player.y * scale - 2,
        4, 4
    );
    
    // Draw cargo drone
    if (cargoDrone !== null) {
        minimapCtx.fillStyle = player.colors.accent;
        minimapCtx.fillRect(
            cargoDrone.x * scale - 2,
            cargoDrone.y * scale - 2,
            3, 3
        );
    }
    
    // Draw viewport bounds (using reference resolution for consistent viewport size)
    minimapCtx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    minimapCtx.strokeRect(
        viewport.x * scale,
        viewport.y * scale,
        (VIEWPORT_REFERENCE.WIDTH / viewport.zoom) * scale,
        (VIEWPORT_REFERENCE.HEIGHT / viewport.zoom) * scale
    );
    
    // Scanner indicator - show if scanner is ready
    if (scanState.cooldown <= 0 && !scanState.active) {
        // Subtle pulsing indicator in corner to show scanner is ready
        const pulseAlpha = 0.3 + Math.sin(Date.now() / 500) * 0.2;
        minimapCtx.fillStyle = `rgba(0, 255, 0, ${pulseAlpha})`;
        minimapCtx.font = '10px monospace';
        minimapCtx.textAlign = 'right';
        minimapCtx.textBaseline = 'top';
        minimapCtx.fillText('SCAN', minimapCanvas.width - 3, 3);
    }
}

function renderTouchIndicator() {
    // Draw touch position indicator
    ctx.save();
    
    // Get the render scale to convert from viewport reference to canvas coordinates
    const renderScale = canvas.renderScale || 1;
    const scaledWidth = canvas.width / renderScale;
    const scaledHeight = canvas.height / renderScale;
    
    // Apply the same scaling as the main render
    ctx.scale(renderScale, renderScale);
    
    // Calculate ship position in scaled canvas coordinates
    const shipScreenX = (player.x - viewport.x) * viewport.zoom;
    const shipScreenY = (player.y - viewport.y) * viewport.zoom;
    
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(shipScreenX, shipScreenY);
    ctx.lineTo(touchX, touchY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw touch point
    ctx.fillStyle = 'rgba(0, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.arc(touchX, touchY, 30, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(touchX, touchY, 30, 0, Math.PI * 2);
    ctx.stroke();
    
    // Draw direction arrow at touch point
    const dx = touchX - shipScreenX;
    const dy = touchY - shipScreenY;
    const angle = Math.atan2(dy, dx);
    const arrowLength = 20;
    
    ctx.strokeStyle = 'rgba(0, 255, 255, 1)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(touchX - Math.cos(angle) * 10, touchY - Math.sin(angle) * 10);
    ctx.lineTo(touchX + Math.cos(angle) * arrowLength, touchY + Math.sin(angle) * arrowLength);
    ctx.stroke();
    
    // Arrow head
    const arrowHeadAngle = 0.5;
    const arrowHeadLength = 10;
    ctx.beginPath();
    ctx.moveTo(
        touchX + Math.cos(angle) * arrowLength,
        touchY + Math.sin(angle) * arrowLength
    );
    ctx.lineTo(
        touchX + Math.cos(angle - Math.PI + arrowHeadAngle) * arrowHeadLength,
        touchY + Math.sin(angle - Math.PI + arrowHeadAngle) * arrowHeadLength
    );
    ctx.moveTo(
        touchX + Math.cos(angle) * arrowLength,
        touchY + Math.sin(angle) * arrowLength
    );
    ctx.lineTo(
        touchX + Math.cos(angle - Math.PI - arrowHeadAngle) * arrowHeadLength,
        touchY + Math.sin(angle - Math.PI - arrowHeadAngle) * arrowHeadLength
    );
    ctx.stroke();
    
    ctx.restore();
}

// ================================
// UI UPDATES
// ================================

function updateUI() {
    // Left panel
    // Only update ship name if not currently editing it
    if (!isEditingShipName) {
        document.getElementById('shipName').textContent = shipName;
    }
    document.getElementById('sectorName').textContent = gameState.sectorName;
    document.getElementById('hullDisplay').textContent = `${Math.ceil(gameState.hull)}%`;
    
    // Docking status
    const dockingStatusEl = document.getElementById('dockingStatus');
    if (isDockedAtAnyStation()) {
        dockingStatusEl.textContent = 'DOCKED';
        dockingStatusEl.style.color = '#00ff00';
    } else {
        dockingStatusEl.textContent = 'FLYING';
        dockingStatusEl.style.color = '#888888';
    }
    
    document.getElementById('creditsDisplay').textContent = formatNumber(gameState.credits);
    document.getElementById('cargoDisplay').textContent = `${gameState.cargo} / ${gameState.maxCargo}`;
    
    // Fuel display with warning at 15%
    const fuelDisplayEl = document.getElementById('fuelDisplay');
    const currentFuel = Math.ceil(gameState.fuel);
    const maxFuel = Math.ceil(gameState.maxFuel);
    const fuelPercentage = (gameState.fuel / gameState.maxFuel) * 100;
    
    fuelDisplayEl.textContent = `${currentFuel} / ${maxFuel}`;
    
    // Add blinking red warning when fuel is at or below 15%
    if (fuelPercentage <= 15) {
        fuelDisplayEl.style.animation = 'blinkRed 1s steps(2) infinite';
    } else {
        fuelDisplayEl.style.animation = '';
    }
    
    // Mining Lasers Display
    updateMiningLasersDisplay();
    
    // Scan System Display
    updateScanDisplay();
    
    // Inventory
    updateInventoryDisplay();
    
    // Upgrades
    updateUpgradeButtons();
    
    // Navigation buttons
    // Disable auto-pilot if already within any station's gravitational range
    let withinStationRange = false;
    for (const st of stations) {
        const dx = st.x - player.x;
        const dy = st.y - player.y;
        const distToStation = Math.sqrt(dx * dx + dy * dy);
        if (distToStation < st.dockingRange) {
            withinStationRange = true;
            break;
        }
    }
    
    document.getElementById('returnToStation').disabled = withinStationRange;
    
    // Call for Help button - cost is 1.5x fuel needed
    const fuelNeededForRescue = gameState.maxFuel - gameState.fuel;
    const rescueCost = Math.ceil(fuelNeededForRescue * 1.5);
    const callForHelpBtn = document.getElementById('callForHelp');
    callForHelpBtn.disabled = gameState.credits < rescueCost || rescueShip !== null;
    callForHelpBtn.querySelector('.btn-text').textContent = `CALL FOR HELP - ${rescueCost} CR`;
    
    // Next Sector button - requires both fuel and credits
    document.getElementById('nextSector').disabled = gameState.fuel < 50 || gameState.credits < 10000;
    
    // Station interface - always visible, update based on docking status
    updateStationInterface();
    
    // Prestige
    document.getElementById('prestigeCount').textContent = gameState.prestige;
    document.getElementById('prestigeBonus').textContent = `+${gameState.prestigeBonus}%`;
    document.getElementById('prestigeBtn').disabled = gameState.credits < 50000;
}

function updateStationInterface() {
    // Update station name and status based on docking
    const stationNameEl = document.getElementById('stationName');
    const stationStatusEl = document.getElementById('stationStatus');
    const sellCargoBtn = document.getElementById('sellCargoBtn');
    const refuelShipBtn = document.getElementById('refuelShipBtn');
    const customizeShipBtn = document.getElementById('customizeShipBtn');
    
    // Find the docked station (if any)
    const dockedStation = stations.find(st => st.isDocked);
    
    if (dockedStation) {
        stationNameEl.textContent = dockedStation.name.toUpperCase();
        stationStatusEl.textContent = 'DOCKING BAY ACTIVE';
        stationStatusEl.style.color = '#00ff00';
    } else {
        stationNameEl.textContent = '---------';
        stationStatusEl.textContent = 'NOT DOCKED';
        stationStatusEl.style.color = '#888888';
    }
    
    // Calculate cargo value (always update)
    let cargoValue = 0;
    Object.keys(gameState.inventory).forEach(type => {
        const count = gameState.inventory[type];
        const asteroidType = ASTEROID_TYPES[type];
        if (asteroidType) {
            const value = asteroidType.value * count;
            const bonusValue = Math.floor(value * (gameState.prestigeBonus / 100));
            cargoValue += value + bonusValue;
        }
    });
    
    document.getElementById('cargoValueCredits').textContent = `${formatNumber(cargoValue)}¢`;
    
    const fuelNeeded = gameState.maxFuel - gameState.fuel;
    const hullNeeded = gameState.maxHull - gameState.hull;
    
    // Calculate costs (1 credit per fuel, 2 credits per hull)
    const fuelCost = Math.ceil(fuelNeeded * 1);
    const hullCost = Math.ceil(hullNeeded * 2);
    
    // Display fuel needed with cost (as percentage of max)
    if (fuelNeeded > 0) {
        const fuelNeededPercent = Math.ceil((fuelNeeded / gameState.maxFuel) * 100);
        document.getElementById('fuelNeeded').textContent = `${fuelNeededPercent}% (${fuelCost}¢)`;
    } else {
        document.getElementById('fuelNeeded').textContent = `0%`;
    }
    
    // Display hull repairs with cost (as percentage of max)
    if (hullNeeded > 0) {
        const hullNeededPercent = Math.ceil((hullNeeded / gameState.maxHull) * 100);
        document.getElementById('hullNeeded').textContent = `${hullNeededPercent}% (${hullCost}¢)`;
    } else {
        document.getElementById('hullNeeded').textContent = `0%`;
    }
    
    // Enable/disable buttons based on docking status and availability
    if (isDockedAtAnyStation()) {
        // Normal docked behavior
        sellCargoBtn.disabled = gameState.cargo === 0;
        sellCargoBtn.querySelector('.btn-text').textContent = 'SELL CARGO';
        refuelShipBtn.disabled = fuelNeeded === 0 && hullNeeded === 0;
        customizeShipBtn.disabled = false; // Always available when docked
    } else {
        // Not docked - check if cargo drone is available
        if (gameState.upgrades.cargoDrone >= 1) {
            // Cargo drone available - change button text and enable if player has cargo and no drone is active
            sellCargoBtn.querySelector('.btn-text').textContent = 'SELL CARGO REMOTELY';
            sellCargoBtn.disabled = gameState.cargo === 0 || cargoDrone !== null;
        } else {
            // No cargo drone - disable button
            sellCargoBtn.querySelector('.btn-text').textContent = 'SELL CARGO';
            sellCargoBtn.disabled = true;
        }
        refuelShipBtn.disabled = true;
        customizeShipBtn.disabled = true;
    }
}

function updateMiningLasersDisplay() {
    const displayContainer = document.getElementById('miningLasersDisplay');
    const lasersList = document.getElementById('miningLasersList');
    
    // Always show the display
    displayContainer.style.display = 'block';
    lasersList.innerHTML = '';
    
    const maxLasers = gameState.upgrades.multiMining;
    const miningSpeed = CONFIG.baseMiningSpeed * (1 - (gameState.upgrades.mining - 1) * 0.1);
    
    // Show all available laser slots
    for (let i = 0; i < maxLasers; i++) {
        const target = player.miningTargets && player.miningTargets[i];
        const barLength = 20; // Total characters for the progress bar
        
        let barContent, color;
        
        if (target && target.asteroid && player.isMining) {
            // Active laser - show progress
            const progress = target.progress / miningSpeed;
            const filledLength = Math.floor(progress * barLength);
            const emptyLength = barLength - filledLength;
            
            const filled = '|'.repeat(filledLength);
            const empty = '·'.repeat(emptyLength);
            
            // Get asteroid type for color
            const asteroidType = ASTEROID_TYPES[target.asteroid.type];
            color = asteroidType.color;
            barContent = `[${filled}${empty}]`;
        } else {
            // Inactive laser - show empty
            const empty = '·'.repeat(barLength);
            color = '#444444';
            barContent = `[${empty}]`;
        }
        
        const laserItem = document.createElement('div');
        laserItem.className = 'stat-item';
        laserItem.style.marginBottom = '4px';
        laserItem.innerHTML = `
            <span class="stat-label">LASER ${i + 1}:</span>
            <span class="stat-value" style="color: ${color}; font-family: monospace;">${barContent}</span>
        `;
        lasersList.appendChild(laserItem);
    }
}

function updateScanDisplay() {
    const scanStatusEl = document.getElementById('scanStatus');
    
    if (scanState.cooldown > 0) {
        const secondsLeft = Math.ceil(scanState.cooldown / 1000);
        scanStatusEl.textContent = `RECHARGE ${secondsLeft}s`;
        scanStatusEl.style.color = '#ff8800';
    } else if (scanState.active) {
        scanStatusEl.textContent = 'SCANNING...';
        scanStatusEl.style.color = '#00ffff';
    } else if (scanState.detectedItems.length > 0) {
        scanStatusEl.textContent = `${scanState.detectedItems.length} DETECTED`;
        scanStatusEl.style.color = '#00ff00';
    } else {
        scanStatusEl.textContent = 'READY';
        scanStatusEl.style.color = '#00ff00';
    }
}

function updateInventoryDisplay() {
    const inventoryList = document.getElementById('inventoryList');
    inventoryList.innerHTML = '';
    
    if (Object.keys(gameState.inventory).length === 0) {
        const emptyItem = document.createElement('div');
        emptyItem.className = 'inventory-item empty';
        emptyItem.innerHTML = `
            <span class="item-icon">∅</span>
            <span class="item-text">CARGO BAY EMPTY</span>
        `;
        inventoryList.appendChild(emptyItem);
    } else {
        Object.entries(gameState.inventory).forEach(([type, count]) => {
            const asteroidType = ASTEROID_TYPES[type];
            if (asteroidType && count > 0) {
                const item = document.createElement('div');
                item.className = 'inventory-item';
                item.innerHTML = `
                    <span class="item-icon" style="color: ${asteroidType.color}">${asteroidType.icon}</span>
                    <span class="item-text">${asteroidType.name}</span>
                    <span class="item-count">${asteroidType.value}¢ ×${count}</span>
                `;
                inventoryList.appendChild(item);
            }
        });
    }
}

function updateUpgradeButtons() {
    const upgradeCosts = {
        speed: [100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600, 51200],
        cargo: [150, 300, 600, 1200, 2400, 4800, 9600, 19200, 38400, 76800],
        mining: [120, 240, 480, 960, 1920, 3840, 7680, 15360, 30720, 61440],
        hull: [200, 400, 800, 1600, 3200, 6400, 12800, 25600, 51200, 102400],
        fuel: [180, 360, 720, 1440, 2880, 5760, 11520, 23040, 46080, 92160],
        range: [160, 320, 640, 1280, 2560, 5120, 10240, 20480, 40960, 81920],
        multiMining: [600, 1200, 2400, 4800, 9600], // Max 6 lasers (5 upgrades from level 1)
        advancedScanner: [50],
        scanRange: [250, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000],
        scanCooldown: [200, 400, 800, 1600, 3200, 6400, 12800, 25600, 51200, 102400],
        cargoDrone: [5000]
    };
    
    Object.keys(gameState.upgrades).forEach(upgradeType => {
        const level = gameState.upgrades[upgradeType];
        const levelDisplay = document.getElementById(`${upgradeType}Level`);
        const costDisplay = document.getElementById(`${upgradeType}Cost`);
        const valueDisplay = document.getElementById(`${upgradeType}Value`);
        const btn = document.getElementById(`upgrade${upgradeType.charAt(0).toUpperCase() + upgradeType.slice(1)}`);
        
        if (!btn) {
            return; // Skip if button doesn't exist
        }
        
        // Update value displays
        if (valueDisplay) {
            switch(upgradeType) {
                case 'speed':
                    const currentSpeedPercent = 100 + (level - 1) * 20;
                    const nextSpeedPercent = 100 + level * 20;
                    if (level >= 10) {
                        valueDisplay.textContent = `${currentSpeedPercent}% (MAX)`;
                    } else {
                        valueDisplay.textContent = `${currentSpeedPercent}% → ${nextSpeedPercent}%`;
                    }
                    break;
                case 'cargo':
                    const currentCargo = 100 + (level - 1) * 50;
                    const nextCargo = 100 + level * 50;
                    if (level >= 10) {
                        valueDisplay.textContent = `${currentCargo} (MAX)`;
                    } else {
                        valueDisplay.textContent = `${currentCargo} → ${nextCargo}`;
                    }
                    break;
                case 'mining':
                    const currentMiningBonus = (level - 1) * 10;
                    const nextMiningBonus = level * 10;
                    if (level >= 10) {
                        valueDisplay.textContent = `+${currentMiningBonus}% (MAX)`;
                    } else {
                        valueDisplay.textContent = `+${currentMiningBonus}% → +${nextMiningBonus}%`;
                    }
                    break;
                case 'hull':
                    const currentHull = 100 + (level - 1) * 25;
                    const nextHull = 100 + level * 25;
                    if (level >= 10) {
                        valueDisplay.textContent = `${currentHull} HP (MAX)`;
                    } else {
                        valueDisplay.textContent = `${currentHull} → ${nextHull} HP`;
                    }
                    break;
                case 'fuel':
                    const currentFuelPercent = 100 + (level - 1) * 20;
                    const nextFuelPercent = 100 + level * 20;
                    if (level >= 10) {
                        valueDisplay.textContent = `${currentFuelPercent}% (MAX)`;
                    } else {
                        valueDisplay.textContent = `${currentFuelPercent}% → ${nextFuelPercent}%`;
                    }
                    break;
                case 'range':
                    const currentRange = 75 + (level - 1) * 10;
                    const nextRange = 75 + level * 10;
                    if (level >= 10) {
                        valueDisplay.textContent = `${currentRange} (MAX)`;
                    } else {
                        valueDisplay.textContent = `${currentRange} → ${nextRange}`;
                    }
                    break;
                case 'multiMining':
                    const currentTargets = level;
                    const nextTargets = level + 1;
                    if (level >= 6) {
                        valueDisplay.textContent = `${currentTargets} (MAX)`;
                    } else {
                        valueDisplay.textContent = `${currentTargets} → ${nextTargets}`;
                    }
                    break;
                case 'scanRange':
                    const currentScanRange = SCAN_CONFIG.baseRange + (level - 1) * SCAN_CONFIG.rangePerLevel;
                    const nextScanRange = SCAN_CONFIG.baseRange + level * SCAN_CONFIG.rangePerLevel;
                    if (level >= 10) {
                        valueDisplay.textContent = `${currentScanRange} (MAX)`;
                    } else {
                        valueDisplay.textContent = `${currentScanRange} → ${nextScanRange}`;
                    }
                    break;
                case 'scanCooldown':
                    const currentCooldown = Math.max(2000, SCAN_CONFIG.baseCooldown - (level - 1) * SCAN_CONFIG.cooldownReduction);
                    const nextCooldown = Math.max(2000, SCAN_CONFIG.baseCooldown - level * SCAN_CONFIG.cooldownReduction);
                    if (level >= 10) {
                        valueDisplay.textContent = `${(currentCooldown / 1000).toFixed(1)}s (MAX)`;
                    } else {
                        valueDisplay.textContent = `${(currentCooldown / 1000).toFixed(1)}s → ${(nextCooldown / 1000).toFixed(1)}s`;
                    }
                    break;
                case 'advancedScanner':
                    // Keep the description static for one-time purchase
                    if (valueDisplay) {
                        valueDisplay.textContent = 'Value & Danger Display';
                    }
                    break;
                case 'cargoDrone':
                    // Keep the description static for one-time purchase
                    if (valueDisplay) {
                        valueDisplay.textContent = 'Remote Cargo Selling';
                    }
                    break;
            }
        }
        
        // Special handling for one-time purchases
        if (upgradeType === 'advancedScanner' || upgradeType === 'cargoDrone') {
            if (level >= 1) {
                if (levelDisplay) levelDisplay.textContent = 'PURCHASED';
                if (costDisplay) costDisplay.textContent = '-';
                btn.disabled = true;
                const btnText = btn.querySelector('.btn-text');
                if (btnText) btnText.textContent = 'PURCHASED';
            } else {
                if (levelDisplay) levelDisplay.textContent = 'NOT PURCHASED';
                const cost = upgradeCosts[upgradeType][0];
                if (costDisplay) costDisplay.textContent = cost;
                const isDocked = isDockedAtAnyStation();
                btn.disabled = !isDocked || gameState.credits < cost;
                const btnText = btn.querySelector('.btn-text');
                if (btnText) btnText.textContent = `PURCHASE: ${cost}¢`;
            }
        } else {
            // Normal multi-level upgrades
            if (levelDisplay) levelDisplay.textContent = level;
            
            // Check max level (6 for multiMining, 10 for others)
            const maxLevel = (upgradeType === 'multiMining') ? 6 : 10;
            
            if (level >= maxLevel) {
                if (costDisplay) costDisplay.textContent = 'MAX';
                btn.disabled = true;
                const btnText = btn.querySelector('.btn-text');
                if (btnText) btnText.textContent = 'MAX LEVEL';
            } else {
                const cost = upgradeCosts[upgradeType][level - 1];
                if (costDisplay) costDisplay.textContent = cost;
                // Disable upgrade buttons if not docked OR insufficient credits
                btn.disabled = !isDockedAtAnyStation() || gameState.credits < cost;
            }
        }
    });
}

// ================================
// UTILITY FUNCTIONS
// ================================

function formatNumber(num) {
    if (num >= 1000000000) return (num / 1000000000).toFixed(2) + 'B';
    if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(2) + 'K';
    return Math.floor(num).toString();
}

// ================================
// START BOOT SEQUENCE
// ================================

window.addEventListener('DOMContentLoaded', () => {
    // Detect input method FIRST (before boot sequence)
    detectInputMethod();
    
    // Try to load AutoSave first (before boot sequence)
    const autoSaveLoaded = loadGameData('AutoSave');
    
    if (!autoSaveLoaded) {
        // No AutoSave found, initialize fresh station state
        initStationState();
    }
    // If AutoSave was loaded, station state is already set from the save
    
    // Apply saved theme BEFORE boot sequence
    const savedTheme = localStorage.getItem('asteroidMinerTheme');
    if (savedTheme && ['green', 'amber', 'blue', 'red', 'mono'].includes(savedTheme)) {
        if (savedTheme !== 'green') {
            document.body.classList.add(`theme-${savedTheme}`);
        }
    }
    
    // Apply saved CRT setting BEFORE boot sequence
    const savedCRT = localStorage.getItem('asteroidMinerCRT');
    if (savedCRT === 'true') {
        document.body.classList.add('crt-effect');
    }
    
    displayBootSequence();
});
