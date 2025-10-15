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
        advancedScanner: 0  // 0 = not purchased, 1 = purchased (one-time upgrade)
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
    miningRange: 50,
    
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

// ================================
// PLAYER SHIP
// ================================

const player = {
    x: 1500, // Center of world (CONFIG.worldWidth / 2)
    y: 1500, // Center of world (CONFIG.worldHeight / 2)
    vx: 0,
    vy: 0,
    angle: 0,
    size: 18,
    isMining: false,
    miningTargets: [], // Array of {asteroid, progress} objects for multi-mining
    miningTarget: null, // Kept for backward compatibility
    miningProgress: 0, // Kept for backward compatibility
    isManuallyControlled: false, // Track if player is actively providing input
    colors: {
        primary: '#00ffff',    // Main hull color (cyan)
        secondary: '#00aaaa',  // Hull outline color
        accent: '#ffff00',     // Laser/detail color (yellow)
        thruster: '#ff9600'    // Thruster flame color (orange)
    }
};

// ================================
// VIEWPORT / CAMERA
// ================================

const viewport = {
    x: 0,
    y: 0,
    zoom: 1.0,
    targetZoom: 1.0,
    minZoom: 0.75,
    maxZoom: 1.5,
    smoothing: 0.1,
    zoomSmoothing: 0.15
};

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
        pullForce: 0.25  // Reduced from 3.33
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
    fontSize: 10,
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

// Pinch zoom for touch devices
let lastTouchDistance = 0;
let isPinching = false;

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
                "Press any key to launch..."
            );
        } else {
            messages.push(
                "All systems nominal.",
                "Ship is currently in flight.",
                "",
                "Press any key to continue..."
            );
        }
    }
    
    return messages;
}

let bootLineIndex = 0;
let bootCharIndex = 0;
const bootSpeed = 10; // milliseconds per character
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
                    input.focus();
                    awaitingNameInput = true;
                    
                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' && awaitingNameInput) {
                            awaitingNameInput = false;
                            let name = input.value.trim().toUpperCase();
                            if (!name) name = 'PROSPECTOR-1';
                            
                            shipName = name;
                            localStorage.setItem('asteroidMinerShipName', shipName);
                            
                            // Replace input with the entered name
                            input.remove();
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
                                ? ["All systems nominal.", "Ready for deployment.", "", "Press any key to launch..."]
                                : ["All systems nominal.", "Ship is currently in flight.", "", "Press any key to continue..."];
                            
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
                        }
                    });
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
        // Apply default mono theme
        document.body.classList.add('theme-mono');
        themeText.textContent = themeNames['mono'];
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
            { key: 'TAP', desc: 'Move ship toward tap location' },
            { key: 'DRAG', desc: 'Continuous movement' },
            { key: 'PINCH', desc: 'Zoom In/Out' },
            { key: 'AUTO-MINING', desc: 'Laser fires automatically in range' },
            { key: 'AUTO-SCAN', desc: 'Auto-scans when available' },
            { key: 'MENU BTN', desc: 'Access upgrades & saves' }
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
            { key: 'D-PAD (V-MOUSE)', desc: 'Move Cursor (Magnetizes to buttons)' },
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
    
    // Detect initial input method
    if (isTouchDevice) {
        lastInputMethod = 'touch';
    }
    
    // Render the controls
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
            // Don't save totalMined or totalTraveled - can be inferred from upgrades/sector
        },
        player: {
            x: player.x,
            y: player.y,
            vx: player.vx,
            vy: player.vy,
            angle: player.angle,
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
            scanCooldown: gameState.upgrades.scanCooldown
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
            // x and y will be recalculated based on player position
        },
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
        // Don't save UI state, particle effects, or other runtime data
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
        gameState.totalMined = 0; // Will be updated as they mine
        gameState.totalTraveled = 0; // Will be updated as they travel
        
        // Restore player
        player.x = saveData.player.x;
        player.y = saveData.player.y;
        player.vx = saveData.player.vx;
        player.vy = saveData.player.vy;
        player.angle = saveData.player.angle;
        player.isMining = false;
        player.miningTargets = [];
        player.miningTarget = null;
        player.miningProgress = 0;
        
        // Restore ship colors (with defaults if not present in save)
        if (saveData.player.colors) {
            player.colors.primary = saveData.player.colors.primary || '#00ffff';
            player.colors.secondary = saveData.player.colors.secondary || '#00aaaa';
            player.colors.accent = saveData.player.colors.accent || '#ffff00';
            player.colors.thruster = saveData.player.colors.thruster || '#ff9600';
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
        
        // Restore viewport
        viewport.zoom = saveData.viewport.zoom;
        viewport.targetZoom = saveData.viewport.zoom;
        viewport.x = player.x - canvas.width / (2 * viewport.zoom);
        viewport.y = player.y - canvas.height / (2 * viewport.zoom);
        
        // Restore recent station names
        recentStationNames = saveData.recentStationNames || [];
        
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
        
        // Restore player
        player.x = saveData.player.x;
        player.y = saveData.player.y;
        player.vx = saveData.player.vx;
        player.vy = saveData.player.vy;
        player.angle = saveData.player.angle;
        
        // Restore stations array
        if (saveData.stations && saveData.stations.length > 0) {
            // Load stations from save
            stations = saveData.stations.map(st => createStation(
                st.x, st.y, st.vx, st.vy,
                st.colorScheme || STATION_COLORS[2],
                st.name || 'Deep Space 9',
                st.isDocked || false
            ));
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
        
        // Restore viewport
        viewport.zoom = saveData.viewport.zoom;
        viewport.targetZoom = saveData.viewport.zoom;
        
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

function resizeCanvas() {
    const container = canvas.parentElement;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    const aspectRatio = 4 / 3;
    
    const oldWidth = canvas.width;
    const oldHeight = canvas.height;
    
    if (containerWidth / containerHeight > aspectRatio) {
        canvas.height = containerHeight - 40;
        canvas.width = canvas.height * aspectRatio;
    } else {
        canvas.width = containerWidth - 40;
        canvas.height = canvas.width / aspectRatio;
    }
    
    // Update viewport if canvas size changed and player exists
    if (player && (oldWidth !== canvas.width || oldHeight !== canvas.height)) {
        viewport.x = player.x - canvas.width / (2 * viewport.zoom);
        viewport.y = player.y - canvas.height / (2 * viewport.zoom);
    }
}

// ================================
// INPUT LISTENERS
// ================================

function initInput() {
    // Keyboard
    document.addEventListener('keydown', (e) => {
        // Prevent default browser behaviors for game keys
        if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || 
            e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Tab') {
            e.preventDefault();
        }
        
        // Don't process game input while editing ship name
        if (isEditingShipName) {
            return;
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
        // Don't process game input while editing ship name
        if (isEditingShipName) {
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
    // Detect if this is a touch device
    isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    
    if (!isTouchDevice) return;
    
    console.log('Touch device detected - enabling canvas joystick controls');
    
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
            touchX = touch.clientX - rect.left;
            touchY = touch.clientY - rect.top;
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
            touchX = touch.clientX - rect.left;
            touchY = touch.clientY - rect.top;
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
    
    // Mobile pause button
    const mobilePause = document.getElementById('mobilePause');
    if (mobilePause) {
        mobilePause.addEventListener('click', () => {
            const pauseModal = document.getElementById('pauseModal');
            pauseModal.classList.add('active');
            gameState.isPaused = true;
        });
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
    magnetStrength: 0.3,
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
        logMessage('Virtual Mouse: ACTIVE (Left Stick=Move, D-Pad=Jump to button, A=Click, SELECT=Exit)');
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
    
    // Show controller tutorial briefly
    showControllerHint();
});

window.addEventListener('gamepaddisconnected', (e) => {
    console.log('Gamepad disconnected');
    if (e.gamepad.index === gamepadIndex) {
        gamepadConnected = false;
        gamepadIndex = null;
        logMessage('Controller disconnected');
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
    
    // Don't process controller input if game is paused
    if (gameState.isPaused) return;
    
    // Don't process game input while editing ship name
    if (isEditingShipName) return;
    
    const DEADZONE = 0.15; // Ignore small stick movements
    const HOLD_DURATION = 2000; // 2 seconds in milliseconds
    
    // Track if any gamepad input is detected this frame
    let gamepadInputDetected = false;
    
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
    // SELECT/BACK Button (Button 8) - Toggle Virtual Mouse
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
    // VIRTUAL MOUSE MODE
    // ====================
    if (virtualMouseActive) {
        // LEFT STICK - Smooth analog movement
        const leftX = Math.abs(gamepad.axes[0]) > DEADZONE ? gamepad.axes[0] : 0;
        const leftY = Math.abs(gamepad.axes[1]) > DEADZONE ? gamepad.axes[1] : 0;
        
        if (leftX !== 0 || leftY !== 0) {
            gamepadInputDetected = true;
            
            // Smooth movement based on stick position
            const moveSpeed = 12; // Base speed for virtual mouse
            virtualMouse.x += leftX * moveSpeed;
            virtualMouse.y += leftY * moveSpeed;
            
            // Magnetize to nearest button
            const nearest = findNearestButton();
            if (nearest && nearest.dist < virtualMouse.magnetRange) {
                const pullX = (nearest.x - virtualMouse.x) * virtualMouse.magnetStrength;
                const pullY = (nearest.y - virtualMouse.y) * virtualMouse.magnetStrength;
                virtualMouse.x += pullX;
                virtualMouse.y += pullY;
            }
            
            // Clamp to screen bounds
            virtualMouse.x = Math.max(0, Math.min(window.innerWidth, virtualMouse.x));
            virtualMouse.y = Math.max(0, Math.min(window.innerHeight, virtualMouse.y));
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
        
        // In virtual mouse mode, disable game controls
        return;
    }
    
    // ====================
    // GAME CONTROLS (Only when virtual mouse is inactive)
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
    
    // ====================
    // Start/Options Button - Pause Menu
    // ====================
    const startButton = gamepad.buttons[9] && gamepad.buttons[9].pressed;
    const startButtonJustPressed = startButton && !(lastGamepadState.buttons[9]);
    
    if (startButtonJustPressed) {
        gamepadInputDetected = true;
        const pauseModal = document.getElementById('pauseModal');
        pauseModal.classList.add('active');
        gameState.isPaused = true;
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
        multiMining: [600, 1200, 2400, 4800, 9600, 19200, 38400, 76800, 153600, 307200],
        advancedScanner: [50], // One-time purchase
        scanRange: [250, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000],
        scanCooldown: [200, 400, 800, 1600, 3200, 6400, 12800, 25600, 51200, 102400]
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
            
            // Special handling for advanced scanner (one-time purchase)
            if (upgradeType === 'advancedScanner') {
                console.log(`Advanced scanner clicked. Level: ${level}, Credits: ${gameState.credits}, Cost: ${upgradeCosts[upgradeType][0]}`);
                console.log(`Level check: level >= 1 is ${level >= 1}`);
                
                if (level >= 1) {
                    logMessage('Advanced scanner already purchased.');
                    console.log('Scanner already purchased - exiting');
                    return;
                }
                
                const cost = upgradeCosts[upgradeType][0]; // First (and only) cost
                
                if (gameState.credits >= cost) {
                    gameState.credits -= cost;
                    gameState.upgrades[upgradeType] = 1;
                    
                    // Apply upgrade effects
                    applyUpgradeEffects(upgradeType);
                    
                    logMessage(`Purchased ADVANCED SCANNER`);
                    createFloatingText(player.x, player.y - 30, `+ADVANCED SCANNER`, '#00ff00');
                    
                    updateUI();
                } else {
                    logMessage(`Insufficient credits. Need ${cost}¢`);
                }
                return;
            }
            
            // Regular upgrades (level 1-10)
            if (level >= 10) return;
            
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
        if (gameState.credits >= 100 && !rescueShip) {
            showConfirm(
                'CALL FOR HELP',
                'Send a rescue ship from the station to refuel your vessel?\n\nCOST: 100 Credits\n\nThe rescue ship will fly to your position, refuel your ship, then return to the station.',
                () => {
                    callForHelp();
                }
            );
        }
    });
    
    document.getElementById('nextSector').addEventListener('click', () => {
        if (gameState.credits < 10000) {
            logMessage('Insufficient credits for sector jump. Need 10,000¢');
            return;
        }
        
        if (gameState.fuel < 50) {
            logMessage('Insufficient fuel for sector jump. Need 50 fuel.');
            return;
        }
        
        const nextSectorNum = gameState.sector + 1;
        const nextSectorName = `ALPHA-${String(nextSectorNum).padStart(3, '0')}`;
        
        showConfirm(
            'JUMP TO NEXT SECTOR',
            `SECTOR JUMP ANALYSIS:\n\n` +
            `Destination: ${nextSectorName}\n` +
            `Cost: 10,000 Credits + 50 Fuel\n\n` +
            `SECTOR DIFFICULTY INCREASE:\n` +
            `• Asteroid density: +${5 * nextSectorNum} objects\n` +
            `• Hazard encounters: +${Math.floor(nextSectorNum * 0.5)} threats\n` +
            `• Rare asteroid chance: +${Math.floor(nextSectorNum * 10)}%\n` +
            `• Spawn rate increase: +${Math.floor(nextSectorNum * 10)}%\n\n` +
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
        sellCargo();
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
            primary: '#00ffff',
            secondary: '#00aaaa',
            accent: '#ffff00',
            thruster: '#ff9600'
        },
        stealth: {
            primary: '#1a1a2e',
            secondary: '#0f0f1a',
            accent: '#16213e',
            thruster: '#4a5568'
        },
        military: {
            primary: '#2d5016',
            secondary: '#1a3010',
            accent: '#7cb342',
            thruster: '#ff6b35'
        },
        luxury: {
            primary: '#9b59b6',
            secondary: '#6c3483',
            accent: '#f1c40f',
            thruster: '#e74c3c'
        },
        danger: {
            primary: '#c0392b',
            secondary: '#7f1d1d',
            accent: '#f39c12',
            thruster: '#ff00ff'
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
    viewport.x = player.x - canvas.width / (2 * viewport.zoom);
    viewport.y = player.y - canvas.height / (2 * viewport.zoom);
    
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
    if (gameState.credits < 100) {
        logMessage('Insufficient credits for rescue service.');
        return;
    }
    
    if (rescueShip) {
        logMessage('Rescue ship already dispatched.');
        return;
    }
    
    // Deduct cost
    gameState.credits -= 100;
    
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
    
    logMessage(`Rescue ship dispatched from ${nearestStation.name}. ETA: calculating...`);
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
    
    gameState.fuel -= 50;
    gameState.credits -= 10000;
    gameState.sector++;
    gameState.sectorName = `ALPHA-${String(gameState.sector).padStart(3, '0')}`;
    gameState.stats.sectorsVisited++;
    
    player.x = CONFIG.worldWidth / 2;
    player.y = CONFIG.worldHeight / 2;
    
    // Re-center viewport on player
    viewport.x = player.x - canvas.width / (2 * viewport.zoom);
    viewport.y = player.y - canvas.height / (2 * viewport.zoom);
    
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
    for (let i = 0; i < 800; i++) {
        stars.push({
            x: Math.random() * CONFIG.worldWidth,
            y: Math.random() * CONFIG.worldHeight,
            size: Math.random() * 2,
            brightness: Math.random()
        });
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
    
    document.getElementById('clearConsole').addEventListener('click', clearConsole);
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
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
    viewport.x = player.x - canvas.width / (2 * viewport.zoom);
    viewport.y = player.y - canvas.height / (2 * viewport.zoom);
    
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
    
    // Check if enough fuel
    const scanFuelCost = 5;
    if (gameState.fuel < scanFuelCost) {
        logMessage('Insufficient fuel for scan');
        return;
    }
    
    // Consume fuel
    gameState.fuel -= scanFuelCost;
    
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
                
                // Scale diagonal and horizontal lengths with zoom for consistent screen size
                const scaledLabelOffset = SCAN_CONFIG.labelOffset / viewport.zoom;
                const scaledHorizontalLength = SCAN_CONFIG.horizontalLength / viewport.zoom;
                
                // Draw diagonal line up-right from current position
                const diagonalEndX = currentX + scaledLabelOffset;
                const diagonalEndY = currentY - scaledLabelOffset;
                
                ctx.strokeStyle = item.color;
                ctx.lineWidth = 1 / viewport.zoom; // Scale line width with zoom
                ctx.beginPath();
                ctx.moveTo(currentX, currentY);
                ctx.lineTo(diagonalEndX, diagonalEndY);
                ctx.stroke();
                
                // Draw horizontal line
                const horizontalEndX = diagonalEndX + scaledHorizontalLength;
                ctx.beginPath();
                ctx.moveTo(diagonalEndX, diagonalEndY);
                ctx.lineTo(horizontalEndX, diagonalEndY);
                ctx.stroke();
                
                // Draw labels
                ctx.fillStyle = item.color;
                ctx.font = `${SCAN_CONFIG.fontSize / viewport.zoom}px 'Courier New', monospace`; // Scale font with zoom
                ctx.textAlign = 'left';
                
                // Scale spacing with zoom for consistency
                const textHorizontalOffset = 5 / viewport.zoom;
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
    
    // Update station
    updateStation(dt);
    
    // Update rescue ship
    updateRescueShip(dt);
    
    // Update player
    updatePlayer(dt);
    
    // Update asteroids
    updateAsteroids(dt);
    
    // Update hazards
    updateHazards(dt);
    
    // Update particles
    updateParticles(dt);
    
    // Update floating text
    updateFloatingText(dt);
    
    // Update viewport
    updateViewport(dt);
    
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
        // Calculate ship's position on screen (accounting for viewport)
        const shipScreenX = (player.x - viewport.x) * viewport.zoom;
        const shipScreenY = (player.y - viewport.y) * viewport.zoom;
        
        // Calculate direction from ship's screen position to touch point
        const dx = touchX - shipScreenX;
        const dy = touchY - shipScreenY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Only apply movement if touch is not too close to ship (dead zone)
        if (distance > 30) {
            // Normalize to -1 to 1 range with smooth scaling
            const maxDistance = Math.min(canvas.width, canvas.height) / 2;
            const normalizedDistance = Math.min(distance / maxDistance, 1);
            
            moveX = (dx / distance) * normalizedDistance;
            moveY = (dy / distance) * normalizedDistance;
        }
    }
    
    // Auto-mining on touch devices - automatically mine when asteroids are in range
    let playerWantsToMine = keys['space'];
    if (isTouchDevice && !isDockedAtAnyStation()) {
        // Automatically attempt mining on touch devices
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
            
            // Consume fuel (only if not docked)
            if (!isDockedAtAnyStation()) {
                const fuelCost = CONFIG.baseFuelConsumption * (1 - (gameState.upgrades.fuel - 1) * 0.05) * dt;
                gameState.fuel = Math.max(0, gameState.fuel - fuelCost);
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
            
            // Check hazard collisions during autopilot
            checkHazardCollisions();
            
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
        
        // Consume fuel (time-consistent) - only if not docked
        if (!isDockedAtAnyStation()) {
            const fuelCost = CONFIG.baseFuelConsumption * (1 - (gameState.upgrades.fuel - 1) * 0.05) * dt;
            gameState.fuel = Math.max(0, gameState.fuel - fuelCost);
            
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
    
    // Check hazard collisions
    checkHazardCollisions();
    
    // Out of fuel warning and game over check
    if (gameState.fuel <= 0) {
        // Check if player can afford rescue (100 credits) or is docked
        const canAffordRescue = gameState.credits >= 100;
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
        
        // Wrap around world bounds
        if (station.x < 0) station.x = CONFIG.worldWidth;
        if (station.x > CONFIG.worldWidth) station.x = 0;
        if (station.y < 0) station.y = CONFIG.worldHeight;
        if (station.y > CONFIG.worldHeight) station.y = 0;
        
        // Update hexagon vertices for collision detection
        station.vertices = [];
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i + station.rotation;
            station.vertices.push({
                x: station.x + Math.cos(angle) * station.size,
                y: station.y + Math.sin(angle) * station.size
            });
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
    
    // Calculate how many asteroids we can mine simultaneously
    const maxTargets = gameState.upgrades.multiMining;
    const miningRange = CONFIG.miningRange + (gameState.upgrades.range - 1) * 10;
    const miningSpeed = CONFIG.baseMiningSpeed * (1 - (gameState.upgrades.mining - 1) * 0.1);
    const miningRangeSq = miningRange * miningRange; // Squared for faster comparison
    
    // Find nearest asteroids in range (optimized with for loop and squared distance)
    const asteroidsInRange = [];
    const len = asteroids.length;
    
    for (let i = 0; i < len; i++) {
        const asteroid = asteroids[i];
        
        // Skip destroyed asteroids
        if (asteroid.destroyed) continue;
        
        const dx = asteroid.x - player.x;
        const dy = asteroid.y - player.y;
        const distSq = dx * dx + dy * dy;
        
        if (distSq < miningRangeSq) {
            asteroidsInRange.push({ 
                asteroid, 
                distSq: distSq,
                dist: Math.sqrt(distSq) // Only calculate when needed for sorting
            });
        }
    }
    
    // Sort by distance and take the closest ones up to maxTargets
    if (asteroidsInRange.length > maxTargets) {
        asteroidsInRange.sort((a, b) => a.distSq - b.distSq);
    }
    const targetAsteroids = asteroidsInRange.slice(0, maxTargets);
    
    if (targetAsteroids.length > 0) {
        player.isMining = true;
        
        // Update miningTargets array
        // Remove targets that are no longer valid or out of range
        player.miningTargets = player.miningTargets.filter(mt => {
            return !mt.asteroid.destroyed && 
                   asteroids.includes(mt.asteroid) && 
                   targetAsteroids.some(ta => ta.asteroid === mt.asteroid);
        });
        
        // Add new targets
        const targetsLen = targetAsteroids.length;
        for (let i = 0; i < targetsLen; i++) {
            const ta = targetAsteroids[i];
            const existingTarget = player.miningTargets.find(mt => mt.asteroid === ta.asteroid);
            if (!existingTarget) {
                player.miningTargets.push({
                    asteroid: ta.asteroid,
                    progress: 0
                });
            }
        }
        
        // Process each mining target - use for loop to safely handle removal during iteration
        for (let i = player.miningTargets.length - 1; i >= 0; i--) {
            const target = player.miningTargets[i];
            const asteroid = target.asteroid;
            
            // Safety check: ensure asteroid still exists and isn't destroyed
            if (!asteroid || asteroid.destroyed || !asteroids.includes(asteroid)) {
                player.miningTargets.splice(i, 1);
                continue;
            }
            
            const dx = player.x - asteroid.x;
            const dy = player.y - asteroid.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            // Tractor beam effect - pull asteroid toward player (time-consistent)
            const normalizedDist = Math.min(dist / miningRange, 1);
            const pullStrength = 0.0167 * normalizedDist * dt;
            
            if (dist > 5) {
                asteroid.vx += (dx / dist) * pullStrength;
                asteroid.vy += (dy / dist) * pullStrength;
                
                const dragFactor = Math.pow(1 - (0.02 * (1 - normalizedDist)), dt);
                asteroid.vx *= dragFactor;
                asteroid.vy *= dragFactor;
            }
            
            // Create laser particles
            if (frameCount % 3 === 0) {
                createLaserParticle(player.x, player.y, asteroid.x, asteroid.y);
            }
            
            // Increment mining progress (time-consistent)
            target.progress += dt;
            
            // Check if mining cycle is complete
            if (target.progress >= miningSpeed) {
                mineAsteroid(asteroid);
                target.progress = 0;
                
                // Clean up if asteroid was destroyed
                if (asteroid.destroyed) {
                    player.miningTargets.splice(i, 1);
                }
            }
        }
        
        // Consume fuel (once per frame, not per target) (time-consistent) - only if not docked
        if (!isDockedAtAnyStation()) {
            gameState.fuel = Math.max(0, gameState.fuel - CONFIG.miningFuelCost * dt);
        }
        
        // Update backward compatibility properties (use first target)
        player.miningTarget = player.miningTargets[0]?.asteroid || null;
        player.miningProgress = player.miningTargets[0]?.progress || 0;
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

function checkHazardCollisions() {
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
            
            // Gravity pull
            if (distSq < pullRadiusSq) {
                const angle = Math.atan2(dy, dx);
                player.vx += Math.cos(angle) * hazardData.pullForce;
                player.vy += Math.sin(angle) * hazardData.pullForce;
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
        const centerWorldX = viewport.x + canvas.width / (2 * oldZoom);
        const centerWorldY = viewport.y + canvas.height / (2 * oldZoom);
        
        viewport.x = centerWorldX - canvas.width / (2 * viewport.zoom);
        viewport.y = centerWorldY - canvas.height / (2 * viewport.zoom);
    }
    
    // Center camera on player with smoothing (time-consistent)
    const targetX = player.x - canvas.width / (2 * viewport.zoom);
    const targetY = player.y - canvas.height / (2 * viewport.zoom);
    
    const smoothingFactor = 1 - Math.pow(1 - viewport.smoothing, dt);
    viewport.x += (targetX - viewport.x) * smoothingFactor;
    viewport.y += (targetY - viewport.y) * smoothingFactor;
    
    // Clamp viewport to world bounds
    viewport.x = Math.max(0, Math.min(CONFIG.worldWidth - canvas.width / viewport.zoom, viewport.x));
    viewport.y = Math.max(0, Math.min(CONFIG.worldHeight - canvas.height / viewport.zoom, viewport.y));
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
    
    // Apply camera transform
    ctx.translate(-viewport.x * viewport.zoom, -viewport.y * viewport.zoom);
    ctx.scale(viewport.zoom, viewport.zoom);
    
    // Render stars (background)
    renderStars();
    
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
    
    // Render scan system (on top of everything in world space)
    renderScan();
    
    // Render floating text
    renderFloatingText();
    
    ctx.restore();
    
    // Render minimap
    renderMinimap();
    
    // Render touch control indicator (in screen space, after ctx.restore())
    if (touchActive && isTouchDevice) {
        renderTouchIndicator();
    }
}

function renderStars() {
    stars.forEach(star => {
        ctx.fillStyle = `rgba(255, 255, 255, ${star.brightness})`;
        ctx.fillRect(star.x, star.y, star.size, star.size);
    });
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
        const thrusterLength = Math.min(currentSpeed * 3, player.size * 1.5);
        const flicker = Math.random() * 0.3 + 0.7;
        
        // Enhanced thrusters based on speed upgrade - use player's thruster color
        const thrusterIntensity = Math.min(speedLevel / 10, 1);
        // Parse the player's thruster color to create gradient variations
        const baseColor = player.colors.thruster;
        const thrusterColor = `${baseColor}${Math.floor(flicker * 204 + 51).toString(16).padStart(2, '0')}`; // Add alpha
        const innerColor = `rgba(255, 255, ${100 + Math.floor(thrusterIntensity * 155)}, ${flicker})`;
        
        for (let i = 0; i < thrusterCount; i++) {
            const offset = (i - (thrusterCount - 1) / 2) * player.size * 0.3;
            
            ctx.fillStyle = thrusterColor;
            ctx.beginPath();
            ctx.moveTo(-player.size * 0.6, -player.size * 0.3 + offset);
            ctx.lineTo(-player.size - thrusterLength, offset);
            ctx.lineTo(-player.size * 0.6, player.size * 0.3 + offset);
            ctx.closePath();
            ctx.fill();
            
            // Inner flame
            ctx.fillStyle = innerColor;
            ctx.beginPath();
            ctx.moveTo(-player.size * 0.6, -player.size * 0.2 + offset);
            ctx.lineTo(-player.size - thrusterLength * 0.6, offset);
            ctx.lineTo(-player.size * 0.6, player.size * 0.2 + offset);
            ctx.closePath();
            ctx.fill();
        }
    }
    
    // Main ship body - Mining Vessel design - use player's custom colors
    ctx.fillStyle = player.colors.primary;
    ctx.strokeStyle = player.colors.secondary;
    ctx.lineWidth = 2;
    
    // Central hull (triangle)
    ctx.beginPath();
    ctx.moveTo(player.size * 0.8, 0);
    ctx.lineTo(-player.size * 0.4, -player.size * 0.5);
    ctx.lineTo(-player.size * 0.4, player.size * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Cargo pods (side attachments) - scale with cargo upgrade
    const cargoLevel = gameState.upgrades.cargo || 1;
    const podSize = Math.min(0.3 + (cargoLevel - 1) * 0.03, 0.6); // Grows from 0.3 to 0.6
    const podOpacity = Math.min(0.3 + cargoLevel * 0.07, 1);
    
    ctx.fillStyle = `rgba(0, 200, 200, ${podOpacity})`;
    ctx.strokeStyle = '#00aaaa';
    ctx.lineWidth = 1.5;
    
    // Left cargo pod
    ctx.beginPath();
    ctx.rect(-player.size * 0.3, -player.size * (0.5 + podSize * 0.5), player.size * 0.6, player.size * podSize);
    ctx.fill();
    ctx.stroke();
    
    // Right cargo pod
    ctx.beginPath();
    ctx.rect(-player.size * 0.3, player.size * (0.5 - podSize * 0.5), player.size * 0.6, player.size * podSize);
    ctx.fill();
    ctx.stroke();
    
    // Hull reinforcement lines - appears with hull upgrades
    const hullLevel = gameState.upgrades.hull || 1;
    if (hullLevel >= 3) {
        ctx.strokeStyle = '#00dddd';
        ctx.lineWidth = 1;
        const reinforcementLines = Math.min(Math.floor(hullLevel / 2), 5);
        for (let i = 0; i < reinforcementLines; i++) {
            const x = player.size * 0.6 - (i * player.size * 0.25);
            ctx.beginPath();
            ctx.moveTo(x, -player.size * 0.4);
            ctx.lineTo(x, player.size * 0.4);
            ctx.stroke();
        }
    }
    
    // Mining lasers (front-mounted) - based on multiMining upgrade - use player's accent color
    const miningLasers = gameState.upgrades.multiMining || 1;
    ctx.fillStyle = player.colors.accent;
    ctx.strokeStyle = player.colors.secondary;
    ctx.lineWidth = 1;
    
    for (let i = 0; i < Math.min(miningLasers, 4); i++) {
        const angle = (i - (miningLasers - 1) / 2) * 0.4;
        const laserX = player.size * 0.6 * Math.cos(angle);
        const laserY = player.size * 0.6 * Math.sin(angle);
        
        ctx.beginPath();
        ctx.arc(laserX, laserY, player.size * 0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Laser glow when actively mining
        if (player.isMining && i < player.miningTargets.length) {
            ctx.fillStyle = `${player.colors.accent}80`; // Use accent color with transparency
            ctx.beginPath();
            ctx.arc(laserX, laserY, player.size * 0.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = player.colors.accent;
        }
    }
    
    // Scanner dish - only if advanced scanner purchased
    if (gameState.upgrades.advancedScanner >= 1) {
        ctx.strokeStyle = '#00ff00';
        ctx.fillStyle = '#004400';
        ctx.lineWidth = 1.5;
        
        // Dish mount (top of ship)
        ctx.beginPath();
        ctx.rect(-player.size * 0.1, -player.size * 0.8, player.size * 0.2, player.size * 0.3);
        ctx.fill();
        ctx.stroke();
        
        // Dish (rotating slightly)
        const dishAngle = Math.sin(Date.now() / 1000) * 0.2;
        ctx.save();
        ctx.translate(0, -player.size * 0.65);
        ctx.rotate(dishAngle);
        
        ctx.fillStyle = '#006600';
        ctx.beginPath();
        ctx.ellipse(0, 0, player.size * 0.25, player.size * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Scanner pulse when scanning
        if (scanState.active) {
            ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
            ctx.lineWidth = 2;
            const pulseRadius = (scanState.duration / SCAN_CONFIG.scanDuration) * player.size * 0.4;
            ctx.beginPath();
            ctx.arc(0, 0, pulseRadius, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        ctx.restore();
    }
    
    // Fuel tanks (bottom attachment) - scale with fuel upgrade
    const fuelLevel = gameState.upgrades.fuel || 1;
    if (fuelLevel >= 3) {
        const tankSize = Math.min(0.15 + (fuelLevel - 3) * 0.02, 0.3);
        ctx.fillStyle = '#0088ff';
        ctx.strokeStyle = '#0066cc';
        ctx.lineWidth = 1;
        
        ctx.beginPath();
        ctx.rect(-player.size * 0.6, -player.size * (tankSize / 2), player.size * 0.3, player.size * tankSize);
        ctx.fill();
        ctx.stroke();
    }
    
    // Cockpit (central detail)
    ctx.fillStyle = '#008888';
    ctx.strokeStyle = '#00aaaa';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(player.size * 0.3, 0, player.size * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Cockpit window
    ctx.fillStyle = '#00ddff';
    ctx.beginPath();
    ctx.arc(player.size * 0.35, 0, player.size * 0.12, 0, Math.PI * 2);
    ctx.fill();
    
    // Range indicator lines (mining range upgrade visual)
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
        
        // Hazard sprite
        ctx.fillStyle = data.color;
        ctx.font = `${data.size * 2}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(data.icon, 0, 0);
        
        // Vortex effect (only for visible vortexes)
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
    // Draw lasers for all mining targets
    player.miningTargets.forEach(target => {
        // Safety check: ensure asteroid still exists and isn't destroyed
        if (!target.asteroid || target.asteroid.destroyed || !asteroids.includes(target.asteroid)) {
            return;
        }
        
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(player.x, player.y);
        ctx.lineTo(target.asteroid.x, target.asteroid.y);
        ctx.stroke();
        
        // Glow effect
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)';
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
    
    // Draw viewport bounds
    minimapCtx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    minimapCtx.strokeRect(
        viewport.x * scale,
        viewport.y * scale,
        (canvas.width / viewport.zoom) * scale,
        (canvas.height / viewport.zoom) * scale
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
    
    // Calculate ship's position on screen (accounting for viewport)
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
    
    // Call for Help button - only enabled if have credits and no rescue ship active
    document.getElementById('callForHelp').disabled = gameState.credits < 100 || rescueShip !== null;
    
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
    
    document.getElementById('cargoValue').textContent = `${formatNumber(cargoValue)}¢`;
    
    const fuelNeeded = gameState.maxFuel - gameState.fuel;
    const hullNeeded = gameState.maxHull - gameState.hull;
    
    // Calculate costs (1 credit per fuel, 2 credits per hull)
    const fuelCost = Math.ceil(fuelNeeded * 1);
    const hullCost = Math.ceil(hullNeeded * 2);
    
    // Display fuel needed with cost
    if (fuelNeeded > 0) {
        document.getElementById('fuelNeeded').textContent = `${Math.ceil(fuelNeeded)}% (${fuelCost}¢)`;
    } else {
        document.getElementById('fuelNeeded').textContent = `0%`;
    }
    
    // Display hull repairs with cost
    if (hullNeeded > 0) {
        document.getElementById('hullNeeded').textContent = `${Math.ceil(hullNeeded)}% (${hullCost}¢)`;
    } else {
        document.getElementById('hullNeeded').textContent = `0%`;
    }
    
    // Enable/disable buttons based on docking status and availability
    if (isDockedAtAnyStation()) {
        sellCargoBtn.disabled = gameState.cargo === 0;
        refuelShipBtn.disabled = fuelNeeded === 0 && hullNeeded === 0;
        customizeShipBtn.disabled = false; // Always available when docked
    } else {
        // Disable all station service buttons when not docked
        sellCargoBtn.disabled = true;
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
        
        if (target && player.isMining) {
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
        multiMining: [600, 1200, 2400, 4800, 9600, 19200, 38400, 76800, 153600, 307200],
        advancedScanner: [50],
        scanRange: [250, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000],
        scanCooldown: [200, 400, 800, 1600, 3200, 6400, 12800, 25600, 51200, 102400]
    };
    
    Object.keys(gameState.upgrades).forEach(upgradeType => {
        const level = gameState.upgrades[upgradeType];
        const levelDisplay = document.getElementById(`${upgradeType}Level`);
        const costDisplay = document.getElementById(`${upgradeType}Cost`);
        const valueDisplay = document.getElementById(`${upgradeType}Value`);
        const btn = document.getElementById(`upgrade${upgradeType.charAt(0).toUpperCase() + upgradeType.slice(1)}`);
        
        if (!levelDisplay || !costDisplay || !btn) return; // Skip if elements don't exist
        
        // Update value displays
        if (valueDisplay) {
            switch(upgradeType) {
                case 'speed':
                    if (level >= 10) {
                        valueDisplay.textContent = `SPEED: ${100 + (level - 1) * 20}%`;
                    } else {
                        valueDisplay.textContent = `SPEED: +20%`;
                    }
                    break;
                case 'cargo':
                    if (level >= 10) {
                        valueDisplay.textContent = `CAPACITY: ${100 + (level - 1) * 50}`;
                    } else {
                        valueDisplay.textContent = `CAPACITY: +50`;
                    }
                    break;
                case 'mining':
                    if (level >= 10) {
                        valueDisplay.textContent = `MINING: +${(level - 1) * 10}%`;
                    } else {
                        valueDisplay.textContent = `MINING: +10%`;
                    }
                    break;
                case 'hull':
                    if (level >= 10) {
                        valueDisplay.textContent = `MAX HULL: ${100 + (level - 1) * 25} HP`;
                    } else {
                        valueDisplay.textContent = `MAX HULL: +25 HP`;
                    }
                    break;
                case 'fuel':
                    if (level >= 10) {
                        valueDisplay.textContent = `MAX FUEL: ${100 + (level - 1) * 20}%`;
                    } else {
                        valueDisplay.textContent = `MAX FUEL: +20%`;
                    }
                    break;
                case 'range':
                    if (level >= 10) {
                        valueDisplay.textContent = `RANGE: ${50 + (level - 1) * 10}`;
                    } else {
                        valueDisplay.textContent = `RANGE: +10`;
                    }
                    break;
                case 'multiMining':
                    if (level >= 10) {
                        valueDisplay.textContent = `TARGETS: ${level}`;
                    } else {
                        valueDisplay.textContent = `TARGETS: +1`;
                    }
                    break;
                case 'scanRange':
                    if (level >= 10) {
                        valueDisplay.textContent = `RANGE: ${SCAN_CONFIG.baseRange + (level - 1) * SCAN_CONFIG.rangePerLevel}`;
                    } else {
                        valueDisplay.textContent = `RANGE: +${SCAN_CONFIG.rangePerLevel}`;
                    }
                    break;
                case 'scanCooldown':
                    if (level >= 10) {
                        const cooldown = Math.max(2000, SCAN_CONFIG.baseCooldown - (level - 1) * SCAN_CONFIG.cooldownReduction);
                        valueDisplay.textContent = `COOLDOWN: ${(cooldown / 1000).toFixed(1)}s`;
                    } else {
                        valueDisplay.textContent = `COOLDOWN: -0.8s`;
                    }
                    break;
                case 'advancedScanner':
                    // Keep the description static for one-time purchase
                    if (valueDisplay) {
                        valueDisplay.textContent = 'Value & Danger Display';
                    }
                    break;
            }
        }
        
        // Special handling for one-time purchases
        if (upgradeType === 'advancedScanner') {
            if (level >= 1) {
                levelDisplay.textContent = 'PURCHASED';
                costDisplay.textContent = '-';
                btn.disabled = true;
                btn.querySelector('.btn-text').textContent = 'PURCHASED';
            } else {
                levelDisplay.textContent = 'NOT PURCHASED';
                const cost = upgradeCosts[upgradeType][0];
                costDisplay.textContent = cost;
                const isDocked = stations.some(s => s.isDocked);
                btn.disabled = !isDocked || gameState.credits < cost;
                btn.querySelector('.btn-text').textContent = `PURCHASE: ${cost}¢`;
            }
        } else {
            // Normal multi-level upgrades
            levelDisplay.textContent = level;
            
            if (level >= 10) {
                costDisplay.textContent = 'MAX';
                btn.disabled = true;
                btn.querySelector('.btn-text').textContent = 'MAX LEVEL';
            } else {
                const cost = upgradeCosts[upgradeType][level - 1];
                costDisplay.textContent = cost;
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
