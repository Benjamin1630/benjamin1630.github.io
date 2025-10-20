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

// Unique ID counters
let nextHazardId = 1;

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
        fuelCapacity: 1,  // Renamed from 'fuel' - increases max fuel
        fuelEfficiency: 1,  // NEW - reduces fuel consumption
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
    
    // Missions
    missions: [],
    stationMissions: {},  // Maps station names to their available missions
    nextMissionId: 1,     // Counter for generating unique mission IDs
    
    // Statistics
    stats: {
        totalMined: 0,
        distanceTraveled: 0,
        asteroidsDestroyed: 0,
        hazardsAvoided: 0,
        sectorsVisited: 1,
        playTime: 0,
        creditsEarned: 0,
        mineralsMined: {} // Track each resource type mined (for mineral survey missions)
    },
    
    // Game flags
    isPaused: false,
    isAtStation: false,
    firstRefuelUsed: false  // Track if first free remote refuel has been used
};

// ================================
// GAME VERSION
// ================================

const GAME_VERSION = '0.8.8'; // Major.Minor.Patch - Update when making breaking changes to save format

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
    asteroidSpawnChance: 0.05, // Increased from 0.02 for faster spawning
    hazardSpawnChance: 0.005,
    rareAsteroidChance: 0.15,
    legendaryAsteroidChance: 0.03,
    
    // Max object limits (scaled by sector)
    baseMaxAsteroids: 150, // Increased from 100 to allow more asteroids
    maxAsteroidsPerSector: 50, // Additional asteroids allowed per sector
    baseMaxHazards: 40, // Base limit for sector 1
    maxHazardsPerSector: 15, // Additional hazards allowed per sector

    // World size (base size, increases by 250 per sector)
    baseWorldWidth: 3000,
    baseWorldHeight: 3000,
    worldWidth: 3000,  // Dynamic, updated per sector
    worldHeight: 3000  // Dynamic, updated per sector
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
// NPC MINING SHIPS
// ================================

let npcMiners = []; // Array of NPC mining ships

// NPC ship color schemes for variety
const NPC_SHIP_COLORS = [
    { primary: '#4488ff', secondary: '#2255aa', accent: '#66aaff', thruster: '#00ccff', name: 'Blue Nomad' },
    { primary: '#ff4488', secondary: '#aa2255', accent: '#ff66aa', thruster: '#ff0066', name: 'Red Hauler' },
    { primary: '#44ff88', secondary: '#22aa55', accent: '#66ffaa', thruster: '#00ff66', name: 'Green Prospector' },
    { primary: '#ffaa44', secondary: '#aa6622', accent: '#ffcc66', thruster: '#ff8800', name: 'Orange Trader' },
    { primary: '#aa44ff', secondary: '#6622aa', accent: '#cc66ff', thruster: '#8800ff', name: 'Purple Voyager' },
    { primary: '#44ffff', secondary: '#22aaaa', accent: '#66ffff', thruster: '#00ffff', name: 'Cyan Explorer' },
    { primary: '#ffff44', secondary: '#aaaa22', accent: '#ffff66', thruster: '#ffff00', name: 'Yellow Miner' },
    { primary: '#ff44ff', secondary: '#aa22aa', accent: '#ff66ff', thruster: '#ff00ff', name: 'Magenta Runner' }
];

// ================================
// FUEL WARNING TRACKING
// ================================

const fuelWarnings = {
    warning50: { triggered: false, timestamp: 0 }, // 40% warning
    warning25: { triggered: false, timestamp: 0 }  // 20% warning
};

// ================================
// MINING DISPLAY TRACKING
// ================================

let wasMining = false; // Track previous mining state to know when to update display

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
// TRADING SYSTEM
// ================================

let tradingState = {
    isTrading: false,
    currentNPC: null,
    nearbyNPC: null, // NPC within trade range
    tradeOffer: {
        playerGives: { iron: 0, copper: 0, silver: 0, gold: 0, platinum: 0 },
        playerTakes: { iron: 0, copper: 0, silver: 0, gold: 0, platinum: 0 }
    }
};

// ================================
// NPC PERSONALITY SYSTEM
// ================================

const NPC_PERSONALITIES = {
    cautious: {
        name: 'Cautious',
        description: 'Careful and risk-averse, prioritizes safety',
        traits: {
            hazardAvoidance: 1.5,      // Avoids hazards at 1.5x distance
            miningSpeed: 0.9,          // Mines 10% slower
            cargoThreshold: 0.6,       // Returns at 60% cargo capacity
            dockDuration: [15, 35],    // Longer dock times (seconds)
            asteroidPreference: 'safe' // Prefers common asteroids away from hazards
        },
        color: '#88ccff'  // Light blue
    },
    aggressive: {
        name: 'Aggressive',
        description: 'Bold and risk-taking, pushes for maximum profit',
        traits: {
            hazardAvoidance: 0.7,      // Less concerned about hazards
            miningSpeed: 1.2,          // Mines 20% faster
            cargoThreshold: 0.95,      // Returns at 95% cargo (very full)
            dockDuration: [5, 12],     // Quick dock times
            asteroidPreference: 'valuable' // Prefers rare/valuable asteroids
        },
        color: '#ff6644'  // Red-orange
    },
    efficient: {
        name: 'Efficient',
        description: 'Optimized and methodical, balanced approach',
        traits: {
            hazardAvoidance: 1.0,      // Normal hazard avoidance
            miningSpeed: 1.1,          // Mines 10% faster
            cargoThreshold: 0.85,      // Returns at 85% cargo
            dockDuration: [8, 18],     // Average dock times
            asteroidPreference: 'balanced' // Balanced selection
        },
        color: '#66ff66'  // Green
    },
    greedy: {
        name: 'Greedy',
        description: 'Money-focused, chases high-value targets',
        traits: {
            hazardAvoidance: 0.8,      // Willing to risk for profit
            miningSpeed: 1.0,          // Normal mining speed
            cargoThreshold: 1.0,       // Returns only when completely full
            dockDuration: [6, 15],     // Moderate dock times
            asteroidPreference: 'valuable' // Always seeks valuable asteroids
        },
        color: '#ffdd44'  // Gold
    },
    lazy: {
        name: 'Lazy',
        description: 'Easygoing and relaxed, minimal effort',
        traits: {
            hazardAvoidance: 1.3,      // Avoids danger (too much work)
            miningSpeed: 0.8,          // Mines 20% slower
            cargoThreshold: 0.5,       // Returns at 50% cargo (can't be bothered)
            dockDuration: [20, 45],    // Very long dock times (taking breaks)
            asteroidPreference: 'nearest' // Takes whatever is closest
        },
        color: '#aa88ff'  // Purple
    },
    professional: {
        name: 'Professional',
        description: 'Experienced and reliable, consistent performance',
        traits: {
            hazardAvoidance: 1.1,      // Slightly cautious
            miningSpeed: 1.05,         // Slightly faster
            cargoThreshold: 0.8,       // Returns at 80% cargo
            dockDuration: [10, 20],    // Consistent dock times
            asteroidPreference: 'balanced' // Well-rounded choices
        },
        color: '#ffffff'  // White
    },
    opportunist: {
        name: 'Opportunist',
        description: 'Adaptable and opportunistic, follows trends',
        traits: {
            hazardAvoidance: 1.0,      // Normal avoidance
            miningSpeed: 1.0,          // Normal speed
            cargoThreshold: 0.75,      // Returns at 75% cargo
            dockDuration: [8, 22],     // Variable dock times
            asteroidPreference: 'random' // Unpredictable selection
        },
        color: '#ffaa44'  // Orange
    },
    reckless: {
        name: 'Reckless',
        description: 'Daring and unpredictable, ignores danger',
        traits: {
            hazardAvoidance: 0.5,      // Minimal hazard concern
            miningSpeed: 1.3,          // Mines very fast (rushing)
            cargoThreshold: 0.9,       // Returns at 90% cargo
            dockDuration: [4, 10],     // Very quick docks
            asteroidPreference: 'valuable' // Chases valuable targets
        },
        color: '#ff3366'  // Hot pink
    }
};

// Helper function to get random personality
function getRandomPersonality() {
    const personalities = Object.keys(NPC_PERSONALITIES);
    return personalities[Math.floor(Math.random() * personalities.length)];
}

// ================================
// NPC RADIO CHATTER SYSTEM
// ================================

const RADIO_MESSAGES = {
    // Greeting messages when player approaches
    greeting: {
        cautious: [
            "Oh, hello there... please keep your distance.",
            "Greetings. I hope you're not here to cause trouble.",
            "Hello. Just... give me some space, okay?",
            "Hi. Let's keep this civil, shall we?"
        ],
        aggressive: [
            "What do you want?",
            "This is MY sector, back off!",
            "You looking for trouble?",
            "Better not be after my asteroids!"
        ],
        efficient: [
            "Hello, <PLAYER>. Mining efficiency optimal today.",
            "Greetings. Good hunting out here.",
            "Hello there. May your cargo bay fill quickly.",
            "Good to see another professional at work."
        ],
        greedy: [
            "Hello, <PLAYER>. Don't even think about my finds.",
            "Hey there. Remember, I saw that platinum first!",
            "Greetings. Looking for a trade perhaps?",
            "Hello. Keep your eyes on your own asteroids."
        ],
        lazy: [
            "Oh... hey. Too tired to chat much.",
            "Hello. You're working hard, aren't you? Good for you.",
            "Hey there... mind if I just drift here a bit?",
            "Hello. Don't suppose you want to trade shifts?"
        ],
        professional: [
            "Hello, <PLAYER>. Safe mining out there.",
            "Greetings, colleague. Beautiful day for mining.",
            "Hello there. May your yields be high.",
            "Good day, <PLAYER>. Fly safe."
        ],
        opportunist: [
            "Well, well, look who it is!",
            "Hey there! Got any rare finds today?",
            "Hello! Anything interesting in your sector?",
            "Hey, <PLAYER>! Let me know if you find anything good."
        ],
        reckless: [
            "Hey! Want to race?",
            "What's up? Fancy some competition?",
            "Yo! Bet I can mine faster than you!",
            "Hey there! Let's make this interesting!"
        ]
    },
    
    // Player gets too close
    tooClose: {
        cautious: [
            "Too close! Please back away!",
            "You're making me nervous!",
            "Personal space, please!",
            "Watch it! Too close!"
        ],
        aggressive: [
            "Back off before I make you!",
            "Get out of my way!",
            "Move it or lose it!",
            "You want a problem? Keep it up!"
        ],
        efficient: [
            "Please maintain safe distance.",
            "You're in my flight path.",
            "Recommend you adjust course.",
            "Mind the proximity alarm."
        ],
        greedy: [
            "Back off, this is my territory!",
            "Stay away from my finds!",
            "Too close to my operation!",
            "This sector's claimed, move along!"
        ],
        lazy: [
            "Ugh, do you mind?",
            "Really? You have to be right here?",
            "Can't a miner get some peace?",
            "You're blocking my view..."
        ],
        professional: [
            "Please maintain safe distance, <PLAYER>.",
            "Collision risk detected. Suggest course correction.",
            "Professional courtesy: please give me room.",
            "Safety protocols, <PLAYER>. A bit more space?"
        ],
        opportunist: [
            "Whoa, easy there!",
            "Hey, watch it!",
            "Little too close for comfort!",
            "Personal space, friend!"
        ],
        reckless: [
            "Ha! Trying to intimidate me?",
            "Come any closer, I dare you!",
            "Oh, we're playing chicken now?",
            "Bring it on!"
        ]
    },
    
    // Lost asteroid to player
    lostAsteroid: {
        cautious: [
            "Oh... you got it. That's fine, I suppose.",
            "Well, there are plenty more...",
            "You needed it more than me, I'm sure.",
            "Okay then. I'll find another."
        ],
        aggressive: [
            "Damn you! That was mine!",
            "Hey! I was mining that!",
            "You just made my list!",
            "That's it, we're enemies now!"
        ],
        efficient: [
            "You claimed that asteroid efficiently. Well done.",
            "Noted. Moving to next target.",
            "Fair acquisition. Proceeding to alternate target.",
            "Your claim is recognized. Updating search parameters."
        ],
        greedy: [
            "That was MINE! You'll pay for this!",
            "Thief! I saw it first!",
            "You're going to regret that!",
            "I'll remember this, <PLAYER>!"
        ],
        lazy: [
            "Eh, saved me the effort.",
            "You can have it. Too much work anyway.",
            "One less for me to worry about.",
            "Thanks for taking that off my list."
        ],
        professional: [
            "Professional courtesy would appreciate acknowledgment.",
            "I had targeted that, but I respect your claim.",
            "Your asteroid. I'll find another.",
            "Fair play, <PLAYER>. That was yours."
        ],
        opportunist: [
            "Hey! I was going for that!",
            "Sneaky move, <PLAYER>!",
            "Alright, you win this round!",
            "Nice grab! I'll get the next one!"
        ],
        reckless: [
            "You got lucky!",
            "Damn! Beat me to it!",
            "Next one's mine!",
            "Ha! Nice steal! Game on!"
        ]
    },
    
    // Successfully destroyed asteroid
    success: {
        cautious: [
            "Got one. That wasn't too difficult.",
            "Success. Small victories matter.",
            "Another one down safely.",
            "Good. No complications."
        ],
        aggressive: [
            "Yeah! That's how it's done!",
            "Crushed it!",
            "Who's the best? I'm the best!",
            "Too easy!"
        ],
        efficient: [
            "Target eliminated. 87.3% efficiency.",
            "Successful extraction. Optimal yield.",
            "Asteroid processed. Moving to next target.",
            "Another unit secured."
        ],
        greedy: [
            "Cha-ching! More credits!",
            "Yes! That's valuable cargo!",
            "Profit secured!",
            "Money in the bank!"
        ],
        lazy: [
            "Finally. That took forever.",
            "Ugh, about time.",
            "Done. Can I nap now?",
            "Whew. Need a break."
        ],
        professional: [
            "Clean extraction. Textbook execution.",
            "Asteroid secured. Professional standard maintained.",
            "Successful operation.",
            "Another satisfied customer."
        ],
        opportunist: [
            "Nice! Got a good one!",
            "Score!",
            "That'll sell well!",
            "Jackpot!"
        ],
        reckless: [
            "BOOM! Demolished!",
            "Wrecked it!",
            "Obliterated!",
            "That was awesome!"
        ]
    },
    
    // Near hazard
    danger: {
        cautious: [
            "Warning! Hazard detected!",
            "Danger! Proceeding carefully!",
            "This is too risky!",
            "Alert! Hazard proximity!"
        ],
        aggressive: [
            "Hazard? I laugh at danger!",
            "Bring it on, I'm not scared!",
            "I can handle this!",
            "Danger is my middle name!"
        ],
        efficient: [
            "Hazard detected. Calculating safe trajectory.",
            "Warning: environmental risk. Adjusting course.",
            "Anomaly proximity alert. Proceeding with caution.",
            "Hazard acknowledged. Optimal path computed."
        ],
        greedy: [
            "Hazard here, but so is profit!",
            "Risk versus reward... I'll take it!",
            "Danger means everyone else stays away!",
            "High risk, high reward!"
        ],
        lazy: [
            "Ugh, seriously? A hazard?",
            "Too much effort to avoid this...",
            "Why is there always something?",
            "Can't catch a break..."
        ],
        professional: [
            "Hazard detected. Maintaining safe distance.",
            "Professional advisory: danger zone ahead.",
            "Proceeding with standard safety protocols.",
            "Hazard noted. Adjusting mining pattern."
        ],
        opportunist: [
            "Whoa! Hazard! Time to relocate!",
            "Yikes! Danger zone!",
            "Not worth the risk!",
            "Time to find safer pastures!"
        ],
        reckless: [
            "Hazard? Pfft! I've seen worse!",
            "This is NOTHING!",
            "Just makes it more exciting!",
            "Danger is where the action is!"
        ]
    },
    
    // Full cargo
    fullCargo: {
        cautious: [
            "Cargo full. Better head back safely.",
            "That's enough for now. Time to dock.",
            "Full load. Heading home before something happens.",
            "Cargo bay full. Safe return to station."
        ],
        aggressive: [
            "Maxed out! Time to cash in!",
            "Cargo full! Everyone out of my way!",
            "Full load, making my run!",
            "Got my haul, heading back!"
        ],
        efficient: [
            "Maximum capacity reached. Returning to base.",
            "Cargo optimal. Initiating return sequence.",
            "100% capacity. En route to station.",
            "Full manifest. RTB initiated."
        ],
        greedy: [
            "Overflowing with riches!",
            "Maximum profit achieved! Heading to cash out!",
            "Can't fit any more! Time to count my credits!",
            "Jackpot! Full cargo, full wallet!"
        ],
        lazy: [
            "Ugh, finally full. Can rest at the station.",
            "That's enough work for one trip.",
            "Time for a long dock break.",
            "Full. Thank goodness."
        ],
        professional: [
            "Cargo manifest complete. Professional standards met.",
            "Optimal load achieved. Returning to station.",
            "Capacity reached. Clean return initiated.",
            "Full cargo. Excellent productivity today."
        ],
        opportunist: [
            "Cargo's full! Good haul today!",
            "Maxed out! Time to sell!",
            "Full up! Station here I come!",
            "Perfect timing! Full cargo!"
        ],
        reckless: [
            "Cargo maxed! Record time!",
            "Full already? I'm on fire!",
            "Fastest fill ever! Let's go!",
            "Loaded and ready to race back!"
        ]
    }
};

// Helper function to get appropriate message
function getNPCMessage(npc, context, playerName = "Captain") {
    const personality = npc.personality || 'efficient';
    const messages = RADIO_MESSAGES[context]?.[personality];
    if (!messages || messages.length === 0) return null;
    
    const message = messages[Math.floor(Math.random() * messages.length)];
    return message.replace('<PLAYER>', playerName);
}

// ================================
// ASTEROID TYPES
// ================================

const ASTEROID_TYPES = {
    // COMMON TIER - 60% total
    common: {
        name: 'Iron Ore',
        color: '#888888',
        icon: '●',
        value: 2,
        health: 10,
        size: 12,
        rarity: 'common',
        baseChance: 0.40,      // 40% base chance
        rarityMultiplier: 1.0
    },
    copper: {
        name: 'Copper',
        color: '#ff8844',
        icon: '◆',
        value: 5,
        health: 9,
        size: 13,
        rarity: 'common',
        baseChance: 0.20,      // 20% base chance
        rarityMultiplier: 1.0
    },
    
    // UNCOMMON TIER - 20% total
    nickel: {
        name: 'Nickel',
        color: '#c0c0a0',
        icon: '◇',
        value: 12,
        health: 7,
        size: 14,
        rarity: 'uncommon',
        baseChance: 0.10,      // 10% base chance
        rarityMultiplier: 1.3
    },
    silver: {
        name: 'Silver',
        color: '#ccccff',
        icon: '◈',
        value: 18,
        health: 6,
        size: 15,
        rarity: 'uncommon',
        baseChance: 0.07,      // 7% base chance
        rarityMultiplier: 1.5
    },
    titanium: {
        name: 'Titanium',
        color: '#b0b0d0',
        icon: '⬡',
        value: 25,
        health: 8,
        size: 16,
        rarity: 'uncommon',
        baseChance: 0.03,      // 3% base chance
        rarityMultiplier: 1.5
    },
    
    // RARE TIER - 12% total
    gold: {
        name: 'Gold',
        color: '#ffdd00',
        icon: '◉',
        value: 40,
        health: 5,
        size: 17,
        rarity: 'rare',
        baseChance: 0.05,      // 5% base chance
        rarityMultiplier: 2.0
    },
    emerald: {
        name: 'Emerald',
        color: '#00ff88',
        icon: '◊',
        value: 55,
        health: 4,
        size: 18,
        rarity: 'rare',
        baseChance: 0.04,      // 4% base chance
        rarityMultiplier: 2.0
    },
    platinum: {
        name: 'Platinum',
        color: '#aaffff',
        icon: '◎',
        value: 70,
        health: 4,
        size: 19,
        rarity: 'rare',
        baseChance: 0.03,      // 3% base chance
        rarityMultiplier: 2.0
    },
    
    // EPIC TIER - 6% total
    ruby: {
        name: 'Ruby',
        color: '#ff0066',
        icon: '◆',
        value: 100,
        health: 3,
        size: 20,
        rarity: 'epic',
        baseChance: 0.025,     // 2.5% base chance
        rarityMultiplier: 2.5
    },
    sapphire: {
        name: 'Sapphire',
        color: '#0066ff',
        icon: '◈',
        value: 120,
        health: 3,
        size: 20,
        rarity: 'epic',
        baseChance: 0.020,     // 2% base chance
        rarityMultiplier: 2.5
    },
    obsidian: {
        name: 'Obsidian',
        color: '#1a0033',
        icon: '⬢',
        value: 140,
        health: 5,
        size: 21,
        rarity: 'epic',
        baseChance: 0.015,     // 1.5% base chance
        rarityMultiplier: 2.5
    },
    
    // LEGENDARY TIER - 2% total
    crystal: {
        name: 'Quantum Crystal',
        color: '#ff00ff',
        icon: '❖',
        value: 200,
        health: 2,
        size: 22,
        rarity: 'legendary',
        baseChance: 0.010,     // 1% base chance
        rarityMultiplier: 3.0
    },
    nebulite: {
        name: 'Nebulite',
        color: '#00ffff',
        icon: '✦',
        value: 250,
        health: 2,
        size: 23,
        rarity: 'legendary',
        baseChance: 0.007,     // 0.7% base chance
        rarityMultiplier: 3.0
    },
    darkMatter: {
        name: 'Dark Matter',
        color: '#6600ff',
        icon: '◉',
        value: 350,
        health: 3,
        size: 24,
        rarity: 'legendary',
        baseChance: 0.003,     // 0.3% base chance
        rarityMultiplier: 3.5
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
        speed: 0.2
    },
    vortex: {
        name: 'Gravity Vortex',
        color: '#8800ff',
        icon: '◉',
        damage: 5,
        size: 60,
        speed: 0.1, // Fixed speed for vortex movement
        pullForce: 0.4  // Reduced from 0.25 for more manageable gravity
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

// NPC miner worker for offloading AI pathfinding
let npcWorker = null;
let npcWorkerReady = false;
let pendingNPCUpdate = false;

// Auto-pilot state
let autoPilotActive = false;

// Remote refuelling tanker state
let refuelTanker = null;

// ================================
// PERFORMANCE OPTIMIZATION SYSTEMS
// ================================
// Three-tier optimization approach for maximum efficiency:
//
// 1. DOM CACHE: Store DOM element references (avoid repeated getElementById)
// 2. FRAME CACHE: Pre-calculate expensive values once per frame
// 3. DIRTY FLAGS: Only update UI when underlying data changes
//
// PERFORMANCE GAINS:
// - DOM operations: ~70-80% reduction
// - UI updates: ~95% reduction (dirty flag controlled)
// - Math calculations: ~30% reduction (frame cache)
// - Overall FPS improvement: +15-25 FPS on low-end devices
//
// MAINTAINED BY: These systems are permanent and should be used for all future features
// ================================
// DOM CACHE OPTIMIZATION SYSTEM
// ================================
// Stores references to frequently accessed DOM elements to avoid repeated getElementById calls
// Initialized once in initDOMCache() during game startup
//
// INTEGRATION GUIDE FOR NEW FEATURES:
// 1. Add new property to domCache object below (set to null)
// 2. Add corresponding line in initDOMCache() to cache the element
// 3. Use domCache.yourElement instead of document.getElementById('yourElement')
//
// Benefits: Eliminates 600+ DOM queries per second, ~30-50% faster DOM access
// ================================

const domCache = {
    // Left panel
    shipName: null,
    sectorName: null,
    hullDisplay: null,
    dockingStatus: null,
    creditsDisplay: null,
    cargoDisplay: null,
    fuelDisplay: null,
    
    // Station interface
    stationName: null,
    stationStatus: null,
    cargoValueCredits: null,
    fuelNeeded: null,
    hullNeeded: null,
    
    // Buttons
    sellCargoBtn: null,
    refuelShipBtn: null,
    customizeShipBtn: null,
    returnToStation: null,
    remoteRefuel: null,
    prestigeBtn: null,
    
    // Mission displays
    missionsList: null,
    missionCount: null,
    
    // Prestige
    prestigeCount: null,
    prestigeBonus: null,
    prestigeNextBonus: null,
    
    // Upgrades drawer
    upgradesDrawerContent: null,
    upgradesDrawerIcon: null,
    
    // Console
    consoleContent: null,
    
    // Inventory
    inventoryList: null
    
    // Add new cached elements here for future features
};

// ================================
// FRAME CACHE OPTIMIZATION SYSTEM
// ================================
// Pre-calculates expensive values once per frame for reuse throughout the frame
// Updated in update() function at the start of each frame
//
// INTEGRATION GUIDE FOR NEW FEATURES:
// 1. Add new property to frameCache object below
// 2. Calculate value once in update() function (around line 7400)
// 3. Reference frameCache.yourValue instead of recalculating
//
// Benefits: Reduces redundant calculations by ~30%, especially for viewport math
// ================================

const frameCache = {
    playerX: 0,
    playerY: 0,
    playerSpeed: 0,
    viewportLeft: 0,
    viewportRight: 0,
    viewportTop: 0,
    viewportBottom: 0,
    viewportCenterX: 0,
    viewportCenterY: 0
};

// ================================
// DIRTY FLAG OPTIMIZATION SYSTEM
// ================================
// Tracks which UI elements need updating to avoid unnecessary DOM manipulation
// Only update UI elements when their underlying data has changed
// 
// USAGE: When you change game state that affects UI, call markUIDirty() with relevant flags
// Example: markUIDirty('credits', 'fuel') after spending credits on fuel
//
// INTEGRATION GUIDE FOR NEW FEATURES:
// 1. Add new flag to uiDirtyFlags object below
// 2. Add conditional check in updateUI() or create dedicated update function
// 3. Call markUIDirty('yourFlag') whenever data changes
// 4. Reset flag to false after updating UI
//
// Benefits: 70-99% reduction in UI updates depending on change frequency
// ================================

const uiDirtyFlags = {
    credits: true,      // Player credits/money
    cargo: true,        // Cargo hold status
    hull: true,         // Ship health/integrity
    fuel: true,         // Fuel level
    inventory: true,    // Cargo inventory items
    missions: true,     // Mission list and progress
    upgrades: true,     // Upgrade buttons and costs
    station: true,      // Station interface and docking status
    prestige: true      // Prestige counter and bonuses
    // Add new flags here for future features
};

// Helper function to mark UI elements as dirty
// Call this whenever you change game state that affects UI
// Accepts multiple flags: markUIDirty('credits', 'fuel', 'hull')
function markUIDirty(...flags) {
    for (const flag of flags) {
        if (uiDirtyFlags.hasOwnProperty(flag)) {
            uiDirtyFlags[flag] = true;
        }
    }
}

// ================================
// OPTIMIZATION QUICK REFERENCE
// ================================
// When adding new features, follow this checklist:
//
// ✓ DOM ACCESS:     Use domCache.element instead of document.getElementById()
// ✓ UI UPDATES:     Call markUIDirty('flag') when data changes
// ✓ CALCULATIONS:   Store expensive calculations in frameCache if used multiple times
// ✓ INITIALIZATION: Add new DOM elements to initDOMCache() function
// ✓ CONDITIONALS:   Check dirty flags before updating UI (if (uiDirtyFlags.flag))
// ✓ RESET FLAGS:    Set flag to false after updating UI
//
// EXISTING INTEGRATION POINTS:
// - initDOMCache() (line ~6130): Initialize cached DOM elements
// - updateUI() (line ~10900): Main UI update loop with dirty flag checks
// - update() (line ~7400): Frame cache updates
// - All game state changes: markUIDirty() calls throughout codebase
// ================================

// ================================
// SCAN SYSTEM
// ================================

const scanState = {
    active: false,
    waveRadius: 0,
    waveMaxRadius: 300, // Will be calculated based on upgrades
    waveSpeed: 5, // Reduced from 10 for slower scan wave expansion
    detectedItems: [],
    displayTime: 3000, // Will be calculated based on upgrades
    startTime: 0,
    cooldown: 0,
    cooldownMax: 10000 // Will be calculated based on upgrades
};

const SCAN_CONFIG = {
    baseRange: 300, // Base scan range
    rangePerLevel: 100, // Additional range per upgrade level
    baseCooldown: 8000, // Base cooldown (8 seconds)
    cooldownReduction: 800, // Cooldown reduction per level (0.8 seconds)
    displayDuration: 3000, // Fixed display duration (3 seconds)
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

// Warp animation state
let warpState = {
    active: false,
    phase: 'countdown', // 'countdown', 'warp', 'fadeOut', 'blackHold', 'fadeIn'
    startTime: 0,
    elapsedTime: 0,
    countdownDuration: 3000, // 3 seconds countdown
    warpDuration: 1000, // 1 second warp effect
    fadeOutDuration: 500, // 0.5 seconds fade to black
    blackHoldDuration: 500, // 0.5 seconds holding at black screen
    fadeInDuration: 500, // 0.5 seconds fade from black
    totalDuration: 5500, // Total 5.5 seconds (increased from 5)
    nextSectorData: null, // Stores data for sector jump
    sectorJumped: false, // Flag to ensure sector jump only happens once
    shipScale: 1.0, // Current ship scale multiplier
    originalShipSize: 0 // Store original size to restore later
};

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
        `DEEP SPACE MINING SYSTEMS v${GAME_VERSION}`,
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
            "ERROR - VESSEL REGISTRATION MISSING",
            "",
            "VESSEL REGISTRATION:",
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
                            "- Class: Deep Space Mining Frigate",
                            `- Hull Integrity: ${hullStatus}`,
                            `- Fuel Reserves: ${fuelStatus}`,
                            `- STATUS: ${statusText}`,
                            "",
                            "- Vessel registration complete.",
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
    bootText.textContent = `DEEP SPACE MINING SYSTEMS v${GAME_VERSION}\n`;
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
    
    // Spawn NPC miners for each station
    spawnNPCMiners();
}

// ================================
// NPC MINER FUNCTIONS
// ================================

function spawnNPCMiners() {
    // Clear existing NPC miners
    npcMiners = [];
    
    // Spawn 5 NPC miners per station with staggered departure times
    stations.forEach((station, stationIndex) => {
        for (let i = 0; i < 5; i++) {
            const colorScheme = NPC_SHIP_COLORS[(stationIndex * 5 + i) % NPC_SHIP_COLORS.length];
            
            // Random delay before departure (0-10 seconds)
            const departureDelay = Math.random() * 10000;
            
            setTimeout(() => {
                const personality = getRandomPersonality();
                const personalityData = NPC_PERSONALITIES[personality];
                
                npcMiners.push({
                    id: `npc_${stationIndex}_${i}`,
                    x: station.x,
                    y: station.y,
                    vx: 0,
                    vy: 0,
                    angle: Math.random() * Math.PI * 2,
                    angularVelocity: 0, // For smooth turning
                    departureAngle: Math.random() * Math.PI * 2, // Random direction to leave station
                    size: 28, // Slightly smaller than player
                    homeStation: station,
                    cargo: Math.floor(10 + Math.random() * 31), // Random cargo 10-40
                    maxCargo: 50,
                    state: 'departing', // States: departing, seeking, mining, returning, docked
                    targetAsteroid: null,
                    miningProgress: 0,
                    miningSpeed: 80 * personalityData.traits.miningSpeed, // Personality affects mining speed
                    colors: {
                        primary: colorScheme.primary,
                        secondary: colorScheme.secondary,
                        accent: colorScheme.accent,
                        thruster: colorScheme.thruster
                    },
                    name: `${colorScheme.name} ${i + 1}`,
                    // Personality system
                    personality: personality,
                    personalityTraits: personalityData.traits,
                    // Interaction system
                    proximityToPlayer: Infinity,
                    playerInRange: false,
                    lastPlayerProximityChange: 0,
                    lastMessageTime: 0,
                    messageQueue: [],
                    reputation: 0, // -100 to +100, tracks relationship with player
                    lastInteractionTime: 0,
                    awarenessIndicator: null, // Visual indicator state
                    // Tracking properties for smarter asteroid selection
                    trackingTarget: null,
                    trackingStartDist: 0,
                    trackingStartTime: 0,
                    trackingDuration: 1000 + Math.random() * 1000, // Random 1-2 seconds
                    seekingTimer: Math.random() * 500 // Random offset to desync NPCs
                });
            }, departureDelay);
        }
    });
    
    logMessage(`${stations.length * 5} NPC miners preparing for deployment...`);
}

// ================================
// NPC INTERACTION & PROXIMITY DETECTION
// ================================

const PROXIMITY_RANGE = 400; // Distance for NPCs to detect player
const TRADE_RANGE = 200; // Distance required for trading (half of proximity range)
const CLOSE_RANGE = 75; // Distance considered "too close" (reduced from 150)
const MESSAGE_COOLDOWN = 5000; // Minimum time between messages (ms)

function updateNPCProximityAndInteractions(dt = 1) {
    const currentTime = Date.now();
    
    // Track the nearest NPC for trading
    let nearestNPC = null;
    let nearestDistance = Infinity;
    
    for (const npc of npcMiners) {
        if (npc.state === 'docked') continue;
        
        // Calculate distance to player
        const dx = player.x - npc.x;
        const dy = player.y - npc.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        npc.proximityToPlayer = distance;
        
        // Track nearest NPC within trade range (not just proximity range)
        if (distance < TRADE_RANGE && distance < nearestDistance) {
            nearestNPC = npc;
            nearestDistance = distance;
        }
        
        const wasInRange = npc.playerInRange;
        const nowInRange = distance < PROXIMITY_RANGE;
        
        // Player entered proximity range
        if (nowInRange && !wasInRange) {
            npc.playerInRange = true;
            npc.lastPlayerProximityChange = currentTime;
            
            // Send greeting message
            if (currentTime - npc.lastMessageTime > MESSAGE_COOLDOWN) {
                const message = getNPCMessage(npc, 'greeting', player.name || 'Captain');
                if (message) {
                    npc.messageQueue.push({
                        text: message,
                        timestamp: currentTime,
                        type: 'greeting'
                    });
                    npc.lastMessageTime = currentTime;
                }
            }
            
            // Activate awareness indicator
            npc.awarenessIndicator = {
                type: 'detected',
                startTime: currentTime,
                duration: 2000 // 2 seconds
            };
        }
        // Player left proximity range
        else if (!nowInRange && wasInRange) {
            npc.playerInRange = false;
            npc.lastPlayerProximityChange = currentTime;
            npc.awarenessIndicator = null;
        }
        
        // Player is too close
        if (nowInRange && distance < CLOSE_RANGE) {
            if (currentTime - npc.lastMessageTime > MESSAGE_COOLDOWN) {
                const message = getNPCMessage(npc, 'tooClose', player.name || 'Captain');
                if (message) {
                    npc.messageQueue.push({
                        text: message,
                        timestamp: currentTime,
                        type: 'warning'
                    });
                    npc.lastMessageTime = currentTime;
                }
                
                // Visual warning indicator
                npc.awarenessIndicator = {
                    type: 'warning',
                    startTime: currentTime,
                    duration: 1500
                };
            }
        }
        
        // Clean old messages from queue (keep last 3)
        if (npc.messageQueue.length > 3) {
            npc.messageQueue.shift();
        }
    }
    
    // Update trading state with nearest NPC
    tradingState.nearbyNPC = nearestNPC;
}

function updateNPCMiners(dt = 1) {
    // Use worker if available and not already updating
    if (npcWorkerReady && !pendingNPCUpdate && npcMiners.length > 0) {
        pendingNPCUpdate = true;
        
        // Prepare data for worker (serialize everything needed)
        const npcData = npcMiners.map((npc, index) => ({
            ...npc,
            targetAsteroidIndex: npc.targetAsteroid ? asteroids.indexOf(npc.targetAsteroid) : -1,
            trackingTargetIndex: npc.trackingTarget ? asteroids.indexOf(npc.trackingTarget) : -1,
            homeStation: {
                x: npc.homeStation.x,
                y: npc.homeStation.y,
                name: npc.homeStation.name,
                dockingRange: npc.homeStation.dockingRange
            }
        }));
        
        const asteroidData = asteroids.map(a => ({
            x: a.x,
            y: a.y,
            vx: a.vx,
            vy: a.vy,
            health: a.health,
            maxHealth: a.maxHealth,
            destroyed: a.destroyed,
            type: a.type,
            radius: a.radius
        }));
        
        const hazardData = hazards.map(h => ({
            x: h.x,
            y: h.y,
            size: HAZARD_TYPES[h.type].size
        }));
        
        const playerMiningTargetData = player.miningTargets.map(mt => ({
            asteroidIndex: mt.asteroid ? asteroids.indexOf(mt.asteroid) : -1
        }));
        
        npcWorker.postMessage({
            type: 'updateNPCs',
            data: {
                npcMiners: npcData,
                asteroids: asteroidData,
                hazards: hazardData,
                stations: stations.map(s => ({ x: s.x, y: s.y, name: s.name, dockingRange: s.dockingRange })),
                playerMiningTargets: playerMiningTargetData,
                dt: dt
            }
        });
        
        return; // Worker will handle update
    }
    
    // Fallback to main thread if worker not ready or already updating
    const miningRange = 75; // Same as player base range
    const speed = 0.8; // NPC ship speed
    const acceleration = 0.3;
    const friction = 0.92;
    
    for (let i = npcMiners.length - 1; i >= 0; i--) {
        const npc = npcMiners[i];
        
        // Handle docked state
        if (npc.state === 'docked') {
            // Check if docking duration is complete
            if (Date.now() >= npc.dockedUntil) {
                // Undock and depart
                npc.state = 'departing';
                npc.departureAngle = Math.random() * Math.PI * 2; // New random direction
            }
            continue; // Skip physics updates while docked
        }
        
        switch (npc.state) {
            case 'departing':
                // Move away from station until outside docking range
                const dxDepart = npc.x - npc.homeStation.x;
                const dyDepart = npc.y - npc.homeStation.y;
                const distToStation = Math.sqrt(dxDepart * dxDepart + dyDepart * dyDepart);
                
                if (distToStation > npc.homeStation.dockingRange + 50) {
                    npc.state = 'seeking';
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
                const evaluationInterval = 100 + (Math.abs(Math.sin(npc.x + npc.y)) * 100); // 100-200ms varied per NPC (was 300-500ms)
                
                if (npc.trackingTarget) {
                    // Currently tracking an asteroid to see if we're getting closer
                    const trackingElapsed = Date.now() - npc.trackingStartTime;
                    
                    if (trackingElapsed >= npc.trackingDuration) {
                        // Tracking period complete - check if we got closer
                        const dx = npc.trackingTarget.x - npc.x;
                        const dy = npc.trackingTarget.y - npc.y;
                        const currentDist = Math.sqrt(dx * dx + dy * dy);
                        
                        // If we're getting closer or reasonably close, commit to this asteroid
                        if (currentDist <= npc.trackingStartDist * 1.3) { // More forgiving threshold (was 1.1)
                            npc.targetAsteroid = npc.trackingTarget;
                            npc.state = 'approaching';
                            npc.trackingTarget = null;
                        } else {
                            // Getting further - abandon this target and pick a new tracking duration
                            npc.trackingTarget = null;
                            npc.trackingDuration = 400 + Math.random() * 400; // Shorter evaluation (was 1000-2000ms)
                            npc.seekingTimer = 0; // Reset to immediately look for another
                        }
                    } else {
                        // Continue moving toward tracking target while evaluating
                        const dx = npc.trackingTarget.x - npc.x;
                        const dy = npc.trackingTarget.y - npc.y;
                        const angleToTarget = Math.atan2(dy, dx);
                        npc.vx += Math.cos(angleToTarget) * acceleration * dt * 0.8; // Faster while tracking (was 0.5)
                        npc.vy += Math.sin(angleToTarget) * acceleration * dt * 0.8;
                    }
                } else if (npc.seekingTimer >= evaluationInterval) {
                    // Time to look for a new asteroid to track
                    npc.seekingTimer = 0;
                    
                    let closestAsteroid = null;
                    let closestDist = Infinity;
                    
                    for (const asteroid of asteroids) {
                        if (asteroid.destroyed) continue;
                        
                        // Check if any NPC is already mining, approaching, or tracking this asteroid
                        const beingMined = npcMiners.some(other => 
                            other !== npc && (
                                other.targetAsteroid === asteroid || 
                                other.trackingTarget === asteroid
                            )
                        );
                        
                        // Also check if player is mining it
                        const playerMining = player.miningTargets.some(mt => mt.asteroid === asteroid);
                        
                        if (beingMined || playerMining) continue;
                        
                        const dx = asteroid.x - npc.x;
                        const dy = asteroid.y - npc.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        
                        if (dist < closestDist) {
                            closestDist = dist;
                            closestAsteroid = asteroid;
                        }
                    }
                    
                    if (closestAsteroid) {
                        // Start tracking this asteroid
                        npc.trackingTarget = closestAsteroid;
                        npc.trackingStartDist = closestDist;
                        npc.trackingStartTime = Date.now();
                        // Set shorter initial tracking duration (was not set here)
                        if (!npc.trackingDuration) {
                            npc.trackingDuration = 400 + Math.random() * 400; // 400-800ms
                        }
                    }
                }
                break;
                
            case 'approaching':
                // Navigate toward target asteroid
                if (!npc.targetAsteroid || npc.targetAsteroid.destroyed) {
                    npc.targetAsteroid = null;
                    npc.state = 'seeking';
                    break;
                }
                
                const dxApproach = npc.targetAsteroid.x - npc.x;
                const dyApproach = npc.targetAsteroid.y - npc.y;
                const distToAsteroid = Math.sqrt(dxApproach * dxApproach + dyApproach * dyApproach);
                
                if (distToAsteroid < miningRange) {
                    npc.state = 'mining';
                    npc.miningProgress = 0;
                } else {
                    // Navigate toward asteroid with smooth turning
                    const angleToAsteroid = Math.atan2(dyApproach, dxApproach);
                    npc.vx += Math.cos(angleToAsteroid) * acceleration * dt;
                    npc.vy += Math.sin(angleToAsteroid) * acceleration * dt;
                    // Don't instantly set angle - will be smoothed below
                }
                break;
                
            case 'mining':
                // Mine the target asteroid
                // Check cargo threshold based on personality
                const cargoPercentage = npc.cargo / npc.maxCargo;
                const shouldReturn = cargoPercentage >= npc.personalityTraits.cargoThreshold;
                
                if (!npc.targetAsteroid || npc.targetAsteroid.destroyed || shouldReturn) {
                    npc.targetAsteroid = null;
                    npc.miningProgress = 0;
                    
                    if (shouldReturn) {
                        npc.state = 'returning';
                    } else {
                        npc.state = 'seeking';
                    }
                    break;
                }
                
                // Check if player started mining this asteroid - if so, stop and find another
                const playerMiningThis = player.miningTargets.some(mt => mt.asteroid === npc.targetAsteroid);
                if (playerMiningThis) {
                    npc.targetAsteroid = null;
                    npc.miningProgress = 0;
                    npc.state = 'seeking';
                    break;
                }
                
                // Stay near asteroid
                const dxMine = npc.targetAsteroid.x - npc.x;
                const dyMine = npc.targetAsteroid.y - npc.y;
                const distMine = Math.sqrt(dxMine * dxMine + dyMine * dyMine);
                
                if (distMine > miningRange * 1.5) {
                    // Lost target, go back to approaching
                    npc.state = 'approaching';
                    npc.miningProgress = 0;
                    break;
                }
                
                // Apply tractor beam to pull asteroid toward NPC ship (same as player's tractor beam)
                const asteroid = npc.targetAsteroid;
                const pullDistance = npc.size * 1.5; // Extended distance in front of ship (was 0.5)
                
                // Calculate pull target: position in front of NPC ship's nose
                const pullTargetX = npc.x + Math.cos(npc.angle) * pullDistance;
                const pullTargetY = npc.y + Math.sin(npc.angle) * pullDistance;
                
                const dx = pullTargetX - asteroid.x;
                const dy = pullTargetY - asteroid.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                // Tractor beam physics (matching player's system)
                const holdRadius = 8;      // Distance where asteroid is "locked" in place
                const approachRadius = 25; // Distance where approach behavior begins
                const maxPullSpeed = 2.5;  // Maximum speed asteroid can move while being pulled
                
                // Normalized direction to target
                const dirX = dx / dist;
                const dirY = dy / dist;
                
                // Velocity component toward target
                const velocityTowardTarget = asteroid.vx * dirX + asteroid.vy * dirY;
                
                if (dist > holdRadius) {
                    // === PULLING PHASE ===
                    // Proportional force: stronger when further from target
                    const normalizedDist = Math.min(dist / miningRange, 1);
                    const proportionalStrength = 0.3 + normalizedDist * 0.4; // Range: 0.3-0.7
                    const proportionalForce = dirX * proportionalStrength * dt;
                    const proportionalForceY = dirY * proportionalStrength * dt;
                    
                    // Apply proportional force
                    asteroid.vx += proportionalForce;
                    asteroid.vy += proportionalForceY;
                    
                    // Derivative damping: reduce velocity to prevent overshoot
                    let dampingStrength = 0.02; // Base damping (2% per frame at 60fps)
                    
                    if (dist < approachRadius) {
                        // Increase damping dramatically in approach zone
                        const approachFactor = 1 - (dist / approachRadius); // 0 at edge, 1 at center
                        dampingStrength += approachFactor * 0.15; // Up to 17% damping near target
                    }
                    
                    if (velocityTowardTarget > 0) {
                        // Extra damping when moving toward target to prevent overshoot
                        const velocityFactor = Math.min(velocityTowardTarget / 2, 1);
                        dampingStrength += velocityFactor * 0.08; // Up to 8% extra damping
                    }
                    
                    // Apply velocity damping (frame-rate independent)
                    const dampingFactor = Math.pow(1 - dampingStrength, dt);
                    asteroid.vx *= dampingFactor;
                    asteroid.vy *= dampingFactor;
                    
                    // Speed limiter: Clamp overall velocity
                    const currentSpeed = Math.sqrt(asteroid.vx * asteroid.vx + asteroid.vy * asteroid.vy);
                    if (currentSpeed > maxPullSpeed) {
                        const speedRatio = maxPullSpeed / currentSpeed;
                        asteroid.vx *= speedRatio;
                        asteroid.vy *= speedRatio;
                    }
                    
                } else {
                    // === HOLDING PHASE ===
                    // Asteroid is within hold radius - lock it in place
                    
                    // Apply very strong damping to kill all velocity
                    const holdDampingFactor = Math.pow(0.1, dt); // 90% damping per frame
                    asteroid.vx *= holdDampingFactor;
                    asteroid.vy *= holdDampingFactor;
                    
                    // Apply gentle centering force to keep asteroid exactly at target
                    const centeringStrength = 0.02 * dt;
                    asteroid.vx += dirX * centeringStrength;
                    asteroid.vy += dirY * centeringStrength;
                    
                    // Clamp velocity to prevent any significant movement while held
                    const maxHoldSpeed = 0.1;
                    const currentSpeed = Math.sqrt(asteroid.vx * asteroid.vx + asteroid.vy * asteroid.vy);
                    if (currentSpeed > maxHoldSpeed) {
                        const speedRatio = maxHoldSpeed / currentSpeed;
                        asteroid.vx *= speedRatio;
                        asteroid.vy *= speedRatio;
                    }
                }
                
                // Create laser particles for visual effect (matching player)
                if (frameCount % 3 === 0) {
                    const laserOriginX = npc.x + Math.cos(npc.angle) * npc.size * 0.85;
                    const laserOriginY = npc.y + Math.sin(npc.angle) * npc.size * 0.85;
                    createLaserParticle(laserOriginX, laserOriginY, npc.targetAsteroid.x, npc.targetAsteroid.y);
                }
                
                // Increment mining progress
                npc.miningProgress += dt;
                
                // Complete mining cycle - use same visual system as player but don't add to player cargo
                if (npc.miningProgress >= npc.miningSpeed) {
                    // Reduce asteroid health
                    npc.targetAsteroid.health--;
                    
                    // Calculate health ratio for proportional scaling
                    const healthRatio = npc.targetAsteroid.health / npc.targetAsteroid.maxHealth;
                    
                    // Create chunk breaking effect at damaged vertices (same as player)
                    if (npc.targetAsteroid.geometry && npc.targetAsteroid.geometry.length > 0) {
                        const numChunks = 1 + Math.floor(Math.random() * 2);
                        
                        for (let chunk = 0; chunk < numChunks; chunk++) {
                            const damageIndex = Math.floor(Math.random() * npc.targetAsteroid.geometry.length);
                            const vertsToShrink = [damageIndex];
                            
                            if (Math.random() > 0.5) {
                                const leftIndex = (damageIndex - 1 + npc.targetAsteroid.geometry.length) % npc.targetAsteroid.geometry.length;
                                vertsToShrink.push(leftIndex);
                            }
                            
                            if (Math.random() > 0.5) {
                                const rightIndex = (damageIndex + 1) % npc.targetAsteroid.geometry.length;
                                vertsToShrink.push(rightIndex);
                            }
                            
                            vertsToShrink.forEach(index => {
                                const point = npc.targetAsteroid.geometry[index];
                                const originalPoint = npc.targetAsteroid.originalGeometry[index];
                                
                                // Calculate world position for particles BEFORE shrinking
                                const worldX = npc.targetAsteroid.x + point.x * Math.cos(npc.targetAsteroid.rotation) - point.y * Math.sin(npc.targetAsteroid.rotation);
                                const worldY = npc.targetAsteroid.y + point.x * Math.sin(npc.targetAsteroid.rotation) + point.y * Math.cos(npc.targetAsteroid.rotation);
                                
                                // Create particles at the vertex location
                                for (let i = 0; i < 5; i++) {
                                    createParticle(worldX, worldY, ASTEROID_TYPES[npc.targetAsteroid.type].color);
                                }
                                
                                // Shrink this vertex proportionally based on health ratio
                                point.x = originalPoint.x * healthRatio;
                                point.y = originalPoint.y * healthRatio;
                            });
                        }
                    }
                    
                    // Add to NPC cargo (not player cargo!)
                    npc.cargo++;
                    npc.miningProgress = 0;
                    
                    // Check if asteroid destroyed
                    if (npc.targetAsteroid.health <= 0) {
                        // Asteroid fully destroyed
                        gameState.stats.asteroidsDestroyed++;
                        
                        const asteroidType = ASTEROID_TYPES[npc.targetAsteroid.type];
                        createFloatingText(npc.targetAsteroid.x, npc.targetAsteroid.y, `DESTROYED`, asteroidType.color);
                        
                        // Mark asteroid as destroyed
                        npc.targetAsteroid.destroyed = true;
                        
                        // Large explosion particles
                        for (let i = 0; i < 20; i++) {
                            createParticle(npc.targetAsteroid.x, npc.targetAsteroid.y, asteroidType.color);
                        }
                        
                        npc.targetAsteroid = null;
                        
                        // Check if should return based on personality cargo threshold
                        const cargoPercentage = npc.cargo / npc.maxCargo;
                        if (cargoPercentage >= npc.personalityTraits.cargoThreshold) {
                            npc.state = 'returning';
                        } else {
                            npc.state = 'seeking';
                        }
                    }
                }
                break;
                
            case 'returning':
                // Navigate back to home station
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
                    continue; // Skip rest of update for this NPC
                } else {
                    // Navigate toward station with smooth turning
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
            const turnSpeed = 0.08 * dt; // Adjust this value for faster/slower turning
            const maxAngularVelocity = 0.1; // Maximum rotation speed per frame
            
            // Calculate angular acceleration toward desired angle
            const angularAcceleration = angleDiff * turnSpeed;
            npc.angularVelocity += angularAcceleration;
            
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
        npc.x = Math.max(npc.size, Math.min(CONFIG.worldWidth - npc.size, npc.x));
        npc.y = Math.max(npc.size, Math.min(CONFIG.worldHeight - npc.size, npc.y));
        
        // Check for hazard collisions (simple avoidance)
        for (const hazard of hazards) {
            const hazardData = HAZARD_TYPES[hazard.type];
            const dx = hazard.x - npc.x;
            const dy = hazard.y - npc.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < hazardData.size + npc.size + 50) {
                // Steer away from hazard
                const avoidAngle = Math.atan2(-dy, -dx);
                npc.vx += Math.cos(avoidAngle) * 0.5 * dt;
                npc.vy += Math.sin(avoidAngle) * 0.5 * dt;
            }
        }
    }
}

function spawnSingleNPCMiner(station, colors, name) {
    const personality = getRandomPersonality();
    const personalityData = NPC_PERSONALITIES[personality];
    
    npcMiners.push({
        id: `npc_respawn_${Date.now()}_${Math.random()}`,
        x: station.x,
        y: station.y,
        vx: 0,
        vy: 0,
        angle: Math.random() * Math.PI * 2,
        angularVelocity: 0, // For smooth turning
        departureAngle: Math.random() * Math.PI * 2, // Random direction to leave station
        size: 28,
        homeStation: station,
        cargo: 0, // Always start with 0 cargo after docking/selling
        maxCargo: 50,
        state: 'departing',
        targetAsteroid: null,
        miningProgress: 0,
        miningSpeed: 80 * personalityData.traits.miningSpeed, // Personality affects mining speed
        colors: colors,
        name: name,
        // Personality system
        personality: personality,
        personalityTraits: personalityData.traits,
        // Interaction system
        proximityToPlayer: Infinity,
        playerInRange: false,
        lastPlayerProximityChange: 0,
        lastMessageTime: 0,
        messageQueue: [],
        reputation: 0,
        lastInteractionTime: 0,
        awarenessIndicator: null,
        // Tracking properties for smarter asteroid selection
        trackingTarget: null,
        trackingStartDist: 0,
        trackingStartTime: 0,
        trackingDuration: 1000 + Math.random() * 1000, // Random 1-2 seconds
        seekingTimer: Math.random() * 500 // Random offset to desync NPCs
    });
}

// ================================
// THEME MANAGEMENT
// ================================

let currentTheme = 'green';
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
        // Apply default green theme on first load
        currentTheme = 'green';
        // Green is the default, no need to add a theme class
        themeText.textContent = themeNames['green'];
        localStorage.setItem('asteroidMinerTheme', 'green');
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
    const consoleContent = domCache.consoleContent;
    if (!consoleContent) return; // Guard for early calls before DOM is ready
    
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
    const consoleContent = domCache.consoleContent;
    if (!consoleContent) return;
    
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
            if (amount > 0) gameState.stats.creditsEarned += amount;
            markUIDirty('credits', 'prestige');
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
            
        case 'SetUpgrade':
            if (!sv_cheats) {
                logMessage('Error: This command requires sv_cheats to be enabled', 'error');
                return;
            }
            if (args.length < 2) {
                logMessage('Error: SetUpgrade requires an upgrade name and level. Usage: SetUpgrade <upgrade> <level>', 'error');
                return;
            }
            
            const upgradeName = args[0];
            const upgradeLevel = parseInt(args[1]);
            
            // Check if upgrade exists
            if (!gameState.upgrades.hasOwnProperty(upgradeName)) {
                logMessage(`Error: "${upgradeName}" is not an available upgrade.`, 'error');
                logMessage('Available upgrades: speed, cargo, mining, hull, fuelCapacity, fuelEfficiency, range, multiMining, scanRange, scanCooldown, advancedScanner, cargoDrone', 'info');
                return;
            }
            
            // Check if level is a valid number
            if (isNaN(upgradeLevel)) {
                logMessage(`Error: "${args[1]}" is not a valid number.`, 'error');
                return;
            }
            
            // Determine max level for the upgrade
            let minLevel = 1; // Default minimum is 1
            let maxLevel;
            
            if (upgradeName === 'multiMining') {
                maxLevel = 6;
            } else if (upgradeName === 'advancedScanner' || upgradeName === 'cargoDrone') {
                minLevel = 0;
                maxLevel = 1;
            } else if (upgradeName === 'cargo' || upgradeName === 'fuelCapacity') {
                maxLevel = Infinity; // Infinite upgrades
            } else {
                maxLevel = 10;
            }
            
            // Check if level is within valid range (minimum 1)
            if (upgradeLevel < minLevel || upgradeLevel > maxLevel) {
                if (maxLevel === Infinity) {
                    logMessage(`Error: Level must be ${minLevel} or greater for ${upgradeName}.`, 'error');
                } else {
                    logMessage(`Error: "${upgradeLevel}" is not a compatible level. Valid range: ${minLevel}-${maxLevel}`, 'error');
                }
                return;
            }
            
            // Set the upgrade level
            const oldLevel = gameState.upgrades[upgradeName];
            gameState.upgrades[upgradeName] = upgradeLevel;
            
            // Apply upgrade effects
            applyUpgradeEffects(upgradeName);
            
            // Update UI
            updateUI();
            updateUpgradeButtons();
            
            logMessage(`Set ${upgradeName} from level ${oldLevel} to ${upgradeLevel}`, 'success');
            break;
            
        case 'Help':
            logMessage('Available commands:', 'info');
            if (sv_cheats) {
                logMessage('"sv_cheats <true|false>" - Toggle cheat access (ENABLED)', 'success');
                logMessage('"AddCredits <amount>" - Add credits to your account', 'info');
                logMessage('"GodMode" - Toggle invincibility and unlimited fuel', 'info');
                logMessage('"GoToStation" - Teleport to nearest space station', 'info');
                logMessage('"SetUpgrade <upgrade> <level>" - Set upgrade level (e.g. SetUpgrade cargo 10)', 'info');
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
            { key: 'D-PAD LEFT', desc: 'Toggle Missions Drawer' },
            { key: 'D-PAD RIGHT', desc: 'Sell Cargo (Docked/Remote)' },
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

function showConfirm(title, message, onConfirm, onCancel, shouldDisableConfirm) {
    const modal = document.getElementById('confirmModal');
    const titleEl = document.getElementById('confirmTitle');
    const messageEl = document.getElementById('confirmMessage');
    const yesBtn = document.getElementById('confirmYes');
    const noBtn = document.getElementById('confirmNo');
    
    titleEl.textContent = `╔════ ${title} ════╗`;
    // Use innerHTML to support HTML formatting (like bold/red text)
    messageEl.innerHTML = message.replace(/\n/g, '<br>');
    
    modal.classList.add('active');
    gameState.isPaused = true;
    
    // Disable confirm button if validation function provided and returns true
    if (typeof shouldDisableConfirm === 'function') {
        yesBtn.disabled = shouldDisableConfirm();
    } else {
        yesBtn.disabled = false;
    }
    
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
        messageEl.innerHTML = 'OUT OF FUEL - NO CREDITS FOR REFUEL<br>SHIP ADRIFT IN DEEP SPACE';
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
        version: GAME_VERSION,
        timestamp: Date.now(),
        shipName: shipName,
        gameState: {
            credits: gameState.credits,
            sector: gameState.sector,
            sectorName: gameState.sectorName,
            sectorsExplored: gameState.sectorsExplored,
            firstRefuelUsed: gameState.firstRefuelUsed,  // Save first refuel flag
            missions: gameState.missions,  // Save active missions
            stationMissions: gameState.stationMissions,  // Save station-specific missions
            nextMissionId: gameState.nextMissionId,  // Save mission ID counter
            stats: {
                totalMined: gameState.stats.totalMined,
                distanceTraveled: gameState.stats.distanceTraveled,
                asteroidsDestroyed: gameState.stats.asteroidsDestroyed,
                hazardsAvoided: gameState.stats.hazardsAvoided,
                sectorsVisited: gameState.stats.sectorsVisited,
                playTime: gameState.stats.playTime,
                creditsEarned: gameState.stats.creditsEarned,
                mineralsMined: gameState.stats.mineralsMined || {}
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
            fuelCapacity: gameState.upgrades.fuelCapacity,
            fuelEfficiency: gameState.upgrades.fuelEfficiency,
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
        world: {
            width: CONFIG.worldWidth,
            height: CONFIG.worldHeight
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
        npcMiners: npcMiners.map(npc => ({
            id: npc.id,
            x: npc.x,
            y: npc.y,
            vx: npc.vx,
            vy: npc.vy,
            angle: npc.angle,
            angularVelocity: npc.angularVelocity || 0,
            departureAngle: npc.departureAngle || 0,
            size: npc.size,
            homeStationName: npc.homeStation.name,  // Save station reference by name
            homeStationX: npc.homeStation.x,
            homeStationY: npc.homeStation.y,
            cargo: npc.cargo,
            maxCargo: npc.maxCargo,
            state: npc.state,
            dockedUntil: npc.dockedUntil || 0,
            targetAsteroidIndex: npc.targetAsteroid ? asteroids.indexOf(npc.targetAsteroid) : -1,  // Save by index
            miningProgress: npc.miningProgress,
            miningSpeed: npc.miningSpeed,
            colors: {
                primary: npc.colors.primary,
                secondary: npc.colors.secondary,
                accent: npc.colors.accent,
                thruster: npc.colors.thruster
            },
            name: npc.name,
            // Save personality
            personality: npc.personality || 'efficient',
            personalityTraits: npc.personalityTraits || NPC_PERSONALITIES.efficient.traits,
            // Save interaction state
            reputation: npc.reputation || 0,
            inventory: npc.inventory || null,
            // Save tracking properties
            trackingTargetIndex: npc.trackingTarget ? asteroids.indexOf(npc.trackingTarget) : -1,
            trackingStartDist: npc.trackingStartDist || 0,
            trackingStartTime: npc.trackingStartTime || 0,
            trackingDuration: npc.trackingDuration || 1500,
            seekingTimer: npc.seekingTimer || 0
        })),
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
        
        // Check save version and log compatibility info
        const saveVersion = saveData.version || '1.0.0';
        console.log(`Loading save: ${saveName} (Version: ${saveVersion}, Current: ${GAME_VERSION})`);
        
        if (saveVersion !== GAME_VERSION) {
            const isOlder = compareVersions(saveVersion, GAME_VERSION) < 0;
            if (isOlder) {
                logMessage(`⚠ Loading older save (v${saveVersion}). Some features may not work as expected.`);
                console.warn(`Save version ${saveVersion} is older than current version ${GAME_VERSION}`);
            } else {
                logMessage(`⚠ Loading newer save (v${saveVersion}). Attempting compatibility...`);
                console.warn(`Save version ${saveVersion} is newer than current version ${GAME_VERSION}`);
            }
        } else {
            logMessage(`✓ Save version matches (v${GAME_VERSION})`);
        }
        
        // Restore ship name
        shipName = saveData.shipName || 'PROSPECTOR-1';
        
        // Restore game state
        gameState.credits = saveData.gameState.credits;
        gameState.sector = saveData.gameState.sector;
        gameState.sectorName = saveData.gameState.sectorName || `ALPHA-${String(saveData.gameState.sector).padStart(3, '0')}`;
        gameState.sectorsExplored = saveData.gameState.sectorsExplored || saveData.gameState.sector;
        gameState.firstRefuelUsed = saveData.gameState.firstRefuelUsed || false;  // Load first refuel flag
        
        // Restore missions (with fallback for older saves)
        gameState.missions = saveData.gameState.missions || [];
        gameState.stationMissions = saveData.gameState.stationMissions || {};
        gameState.nextMissionId = saveData.gameState.nextMissionId || 1;
        
        // Restore stats (with fallbacks for older saves)
        if (saveData.gameState.stats) {
            gameState.stats.totalMined = saveData.gameState.stats.totalMined || 0;
            gameState.stats.distanceTraveled = saveData.gameState.stats.distanceTraveled || 0;
            gameState.stats.asteroidsDestroyed = saveData.gameState.stats.asteroidsDestroyed || 0;
            gameState.stats.hazardsAvoided = saveData.gameState.stats.hazardsAvoided || 0;
            gameState.stats.sectorsVisited = saveData.gameState.stats.sectorsVisited || 1;
            gameState.stats.playTime = saveData.gameState.stats.playTime || 0;
            gameState.stats.creditsEarned = saveData.gameState.stats.creditsEarned || 0;
            gameState.stats.mineralsMined = saveData.gameState.stats.mineralsMined || {};
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
        // Handle old 'fuel' upgrade or new separate upgrades
        gameState.upgrades.fuelCapacity = saveData.upgrades.fuelCapacity || saveData.upgrades.fuel || 1;
        gameState.upgrades.fuelEfficiency = saveData.upgrades.fuelEfficiency || saveData.upgrades.fuel || 1;
        gameState.upgrades.range = saveData.upgrades.range;
        gameState.upgrades.multiMining = saveData.upgrades.multiMining;
        gameState.upgrades.advancedScanner = saveData.upgrades.advancedScanner || 0;
        gameState.upgrades.scanRange = saveData.upgrades.scanRange || 1;
        gameState.upgrades.scanCooldown = saveData.upgrades.scanCooldown || 1;
        gameState.upgrades.cargoDrone = saveData.upgrades.cargoDrone || 0;
        
        // Recalculate max values based on upgrades
        gameState.maxCargo = 100 + (gameState.upgrades.cargo - 1) * 50;
        gameState.maxHull = 100 + (gameState.upgrades.hull - 1) * 25;
        gameState.maxFuel = 100 + (gameState.upgrades.fuelCapacity - 1) * 20;
        
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
        
        // Restore world size (with fallback calculation for older saves)
        if (saveData.world) {
            CONFIG.worldWidth = saveData.world.width;
            CONFIG.worldHeight = saveData.world.height;
        } else {
            // Calculate world size based on sector for older saves
            CONFIG.worldWidth = CONFIG.baseWorldWidth + (gameState.sector - 1) * 250;
            CONFIG.worldHeight = CONFIG.baseWorldHeight + (gameState.sector - 1) * 250;
        }
        
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
        
        // Restore NPC miners if saved
        if (saveData.npcMiners && Array.isArray(saveData.npcMiners)) {
            npcMiners = saveData.npcMiners.map(npcData => {
                // Find the home station by name and position
                const homeStation = stations.find(st => 
                    st.name === npcData.homeStationName &&
                    Math.abs(st.x - npcData.homeStationX) < 10 &&
                    Math.abs(st.y - npcData.homeStationY) < 10
                );
                
                // Skip this NPC if station not found (shouldn't happen)
                if (!homeStation) {
                    console.warn('Could not find home station for NPC:', npcData.name);
                    return null;
                }
                
                return {
                    id: npcData.id,
                    x: npcData.x,
                    y: npcData.y,
                    vx: npcData.vx,
                    vy: npcData.vy,
                    angle: npcData.angle,
                    angularVelocity: npcData.angularVelocity || 0,
                    departureAngle: npcData.departureAngle || (Math.random() * Math.PI * 2),
                    size: npcData.size,
                    homeStation: homeStation,
                    cargo: npcData.cargo,
                    maxCargo: npcData.maxCargo,
                    state: npcData.state,
                    dockedUntil: npcData.dockedUntil || 0,
                    targetAsteroid: null,  // Will be restored after asteroids are loaded
                    targetAsteroidIndex: npcData.targetAsteroidIndex,  // Temp storage for index
                    miningProgress: npcData.miningProgress,
                    miningSpeed: npcData.miningSpeed,
                    colors: {
                        primary: npcData.colors.primary,
                        secondary: npcData.colors.secondary,
                        accent: npcData.colors.accent,
                        thruster: npcData.colors.thruster
                    },
                    name: npcData.name,
                    // Restore personality
                    personality: npcData.personality || 'efficient',
                    personalityTraits: npcData.personalityTraits || NPC_PERSONALITIES.efficient.traits,
                    // Restore interaction system
                    proximityToPlayer: Infinity,
                    playerInRange: false,
                    lastPlayerProximityChange: 0,
                    lastMessageTime: 0,
                    messageQueue: [],
                    reputation: npcData.reputation || 0,
                    inventory: npcData.inventory || null,
                    lastInteractionTime: 0,
                    awarenessIndicator: null,
                    // Restore tracking properties
                    trackingTarget: null,  // Will be restored after asteroids are loaded
                    trackingTargetIndex: npcData.trackingTargetIndex || -1,
                    trackingStartDist: npcData.trackingStartDist || 0,
                    trackingStartTime: npcData.trackingStartTime || 0,
                    trackingDuration: npcData.trackingDuration || (1000 + Math.random() * 1000),
                    seekingTimer: npcData.seekingTimer || (Math.random() * 500)
                };
            }).filter(npc => npc !== null);  // Remove any NPCs that couldn't be restored
        } else {
            // No saved NPCs or old save format - spawn new ones
            npcMiners = [];
        }
        
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
                id: haz.id || nextHazardId++, // Use existing ID or assign new one
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
        
        // Restore NPC target asteroid references (now that asteroids are loaded)
        for (const npc of npcMiners) {
            if (npc.targetAsteroidIndex >= 0 && npc.targetAsteroidIndex < asteroids.length) {
                npc.targetAsteroid = asteroids[npc.targetAsteroidIndex];
            } else {
                npc.targetAsteroid = null;
            }
            // Restore tracking target reference
            if (npc.trackingTargetIndex >= 0 && npc.trackingTargetIndex < asteroids.length) {
                npc.trackingTarget = asteroids[npc.trackingTargetIndex];
            } else {
                npc.trackingTarget = null;
            }
            // Clean up the temporary index properties
            delete npc.targetAsteroidIndex;
            delete npc.trackingTargetIndex;
        }
        
        // Clear particles and floating text (runtime visual effects)
        particles = [];
        floatingText = [];
        
        // Reset game flags
        gameState.isPaused = false;
        gameState.isAtStation = false;
        
        // Mark all UI as dirty after loading
        markUIDirty('credits', 'cargo', 'hull', 'fuel', 'inventory', 'missions', 'upgrades', 'station', 'prestige');
        
        // Update UI
        updateUI();
        updateMiningLasersDisplay(); // Initialize the laser display after loading
        updateMissionsDisplay(); // Update missions display after loading
        
        // Check if player is docked and update mission board if needed
        const dockedStation = stations.find(s => s.isDocked);
        if (dockedStation) {
            updateMissionBoard(dockedStation.name, dockedStation.colorScheme);
        }
        
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
        
        // Restore missions (with fallback for older saves)
        gameState.missions = saveData.gameState.missions || [];
        gameState.stationMissions = saveData.gameState.stationMissions || {};
        gameState.nextMissionId = saveData.gameState.nextMissionId || 1;
        
        // Restore stats (with fallbacks for older saves)
        if (saveData.gameState.stats) {
            gameState.stats.totalMined = saveData.gameState.stats.totalMined || 0;
            gameState.stats.distanceTraveled = saveData.gameState.stats.distanceTraveled || 0;
            gameState.stats.asteroidsDestroyed = saveData.gameState.stats.asteroidsDestroyed || 0;
            gameState.stats.hazardsAvoided = saveData.gameState.stats.hazardsAvoided || 0;
            gameState.stats.sectorsVisited = saveData.gameState.stats.sectorsVisited || 1;
            gameState.stats.playTime = saveData.gameState.stats.playTime || 0;
            gameState.stats.creditsEarned = saveData.gameState.stats.creditsEarned || 0;
            gameState.stats.mineralsMined = saveData.gameState.stats.mineralsMined || {};
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
        // Handle old 'fuel' upgrade or new separate upgrades
        gameState.upgrades.fuelCapacity = saveData.upgrades.fuelCapacity || saveData.upgrades.fuel || 1;
        gameState.upgrades.fuelEfficiency = saveData.upgrades.fuelEfficiency || saveData.upgrades.fuel || 1;
        gameState.upgrades.range = saveData.upgrades.range;
        gameState.upgrades.multiMining = saveData.upgrades.multiMining;
        gameState.upgrades.advancedScanner = saveData.upgrades.advancedScanner || 0;
        gameState.upgrades.scanRange = saveData.upgrades.scanRange || 1;
        gameState.upgrades.scanCooldown = saveData.upgrades.scanCooldown || 1;
        gameState.upgrades.cargoDrone = saveData.upgrades.cargoDrone || 0;
        
        // Recalculate max values based on upgrades
        gameState.maxCargo = 100 + (gameState.upgrades.cargo - 1) * 50;
        gameState.maxHull = 100 + (gameState.upgrades.hull - 1) * 25;
        gameState.maxFuel = 100 + (gameState.upgrades.fuelCapacity - 1) * 20;
        
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
        
        // Restore world size (with fallback calculation for older saves)
        if (saveData.world) {
            CONFIG.worldWidth = saveData.world.width;
            CONFIG.worldHeight = saveData.world.height;
        } else {
            // Calculate world size based on sector for older saves
            CONFIG.worldWidth = CONFIG.baseWorldWidth + (gameState.sector - 1) * 250;
            CONFIG.worldHeight = CONFIG.baseWorldHeight + (gameState.sector - 1) * 250;
        }
        
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
        
        // Restore NPC miners if saved
        if (saveData.npcMiners && Array.isArray(saveData.npcMiners)) {
            npcMiners = saveData.npcMiners.map(npcData => {
                // Find the home station by name and position
                const homeStation = stations.find(st => 
                    st.name === npcData.homeStationName &&
                    Math.abs(st.x - npcData.homeStationX) < 10 &&
                    Math.abs(st.y - npcData.homeStationY) < 10
                );
                
                // Skip this NPC if station not found (shouldn't happen)
                if (!homeStation) {
                    console.warn('Could not find home station for NPC:', npcData.name);
                    return null;
                }
                
                return {
                    id: npcData.id,
                    x: npcData.x,
                    y: npcData.y,
                    vx: npcData.vx,
                    vy: npcData.vy,
                    angle: npcData.angle,
                    angularVelocity: npcData.angularVelocity || 0,
                    departureAngle: npcData.departureAngle || (Math.random() * Math.PI * 2),
                    size: npcData.size,
                    homeStation: homeStation,
                    cargo: npcData.cargo,
                    maxCargo: npcData.maxCargo,
                    state: npcData.state,
                    dockedUntil: npcData.dockedUntil || 0,
                    targetAsteroid: null,  // Will be restored after asteroids are loaded
                    targetAsteroidIndex: npcData.targetAsteroidIndex,  // Temp storage for index
                    miningProgress: npcData.miningProgress,
                    miningSpeed: npcData.miningSpeed,
                    colors: {
                        primary: npcData.colors.primary,
                        secondary: npcData.colors.secondary,
                        accent: npcData.colors.accent,
                        thruster: npcData.colors.thruster
                    },
                    name: npcData.name,
                    // Restore personality
                    personality: npcData.personality || 'efficient',
                    personalityTraits: npcData.personalityTraits || NPC_PERSONALITIES.efficient.traits,
                    // Restore interaction system
                    proximityToPlayer: Infinity,
                    playerInRange: false,
                    lastPlayerProximityChange: 0,
                    lastMessageTime: 0,
                    messageQueue: [],
                    reputation: npcData.reputation || 0,
                    inventory: npcData.inventory || null,
                    lastInteractionTime: 0,
                    awarenessIndicator: null,
                    // Restore tracking properties
                    trackingTarget: null,  // Will be restored after asteroids are loaded
                    trackingTargetIndex: npcData.trackingTargetIndex || -1,
                    trackingStartDist: npcData.trackingStartDist || 0,
                    trackingStartTime: npcData.trackingStartTime || 0,
                    trackingDuration: npcData.trackingDuration || (1000 + Math.random() * 1000),
                    seekingTimer: npcData.seekingTimer || (Math.random() * 500)
                };
            }).filter(npc => npc !== null);  // Remove any NPCs that couldn't be restored
        } else {
            // No saved NPCs or old save format - spawn new ones
            npcMiners = [];
        }
        
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
                id: haz.id || nextHazardId++, // Use existing ID or assign new one
                x: haz.x,
                y: haz.y,
                vx: haz.vx,
                vy: haz.vy,
                radius: haz.radius,
                type: haz.type,
                rotation: haz.rotation,
                rotationSpeed: haz.rotationSpeed
            }));
            
            // Restore NPC target asteroid references (now that asteroids are loaded)
            for (const npc of npcMiners) {
                if (npc.targetAsteroidIndex >= 0 && npc.targetAsteroidIndex < asteroids.length) {
                    npc.targetAsteroid = asteroids[npc.targetAsteroidIndex];
                } else {
                    npc.targetAsteroid = null;
                }
                // Restore tracking target reference
                if (npc.trackingTargetIndex >= 0 && npc.trackingTargetIndex < asteroids.length) {
                    npc.trackingTarget = asteroids[npc.trackingTargetIndex];
                } else {
                    npc.trackingTarget = null;
                }
                // Clean up the temporary index properties
                delete npc.targetAsteroidIndex;
                delete npc.trackingTargetIndex;
            }
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
        const saveVersion = save.version || '1.0.0';
        const isCurrentVersion = saveVersion === GAME_VERSION;
        const versionClass = isCurrentVersion ? '' : 'version-warning';
        const versionText = isCurrentVersion ? `v${saveVersion}` : `v${saveVersion} ⚠`;
        const rebirths = save.prestige?.level || 0;
        const rebirthText = rebirths > 0 ? `Rebirths: ${rebirths} | ` : '';
        
        return `
            <div class="save-item">
                <div class="save-item-info">
                    <div class="save-item-name">${save.name}</div>
                    <div class="save-item-details">
                        ${rebirthText}Sector ${save.gameState.sector} | ${save.gameState.credits}¢ | <span class="${versionClass}">${versionText}</span> | ${dateStr}
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
// TRADING MODAL FUNCTIONS
// ================================

function openTradeModal(npc) {
    if (!npc || gameState.isPaused || tradingState.isTrading) return;
    
    // Set trading state
    tradingState.isTrading = true;
    tradingState.currentNPC = npc;
    gameState.isPaused = true;
    
    // Get modal elements
    const tradeModal = document.getElementById('tradeModal');
    const tradeTitle = document.getElementById('tradeTitle');
    const tradeSubtitle = document.getElementById('tradeSubtitle');
    const tradeNpcName = document.getElementById('tradeNpcName');
    const tradeNpcPersonality = document.getElementById('tradeNpcPersonality');
    const tradeNpcReputation = document.getElementById('tradeNpcReputation');
    const tradeNpcCargo = document.getElementById('tradeNpcCargo');
    const tradeMultiplier = document.getElementById('tradeMultiplier');
    
    // Update NPC info with modern styling
    tradeTitle.textContent = `SECURE TRADE PROTOCOL`;
    tradeSubtitle.textContent = `CONNECTION ESTABLISHED WITH ${npc.name.toUpperCase()}`;
    tradeNpcName.textContent = npc.name.toUpperCase();
    tradeNpcPersonality.textContent = npc.personality || 'Professional';
    tradeNpcReputation.textContent = npc.reputation || 0;
    tradeNpcCargo.textContent = Math.floor(npc.cargo) || 0;
    
    // Calculate and display price multiplier based on personality
    const multiplier = getPersonalityPriceMultiplier(npc);
    tradeMultiplier.textContent = `${multiplier.toFixed(2)}x`;
    
    // Update player inventory display
    updateTradeInventoryDisplays(npc);
    
    // Reset trade inputs
    resetTradeInputs();
    
    // Check for personality event
    checkPersonalityEvent(npc);
    
    // Show modal
    tradeModal.classList.add('active');
}

function closeTradeModal() {
    const tradeModal = document.getElementById('tradeModal');
    tradeModal.classList.remove('active');
    
    // Reset trading state
    tradingState.isTrading = false;
    tradingState.currentNPC = null;
    gameState.isPaused = false;
    
    // Hide personality event section
    const eventSection = document.getElementById('personalityEventSection');
    if (eventSection) eventSection.style.display = 'none';
}

function getPersonalityPriceMultiplier(npc) {
    const personality = npc.personality || 'Professional';
    const traits = NPC_PERSONALITIES[personality];
    
    if (!traits) return 1.0;
    
    // Base multiplier on personality
    switch (personality) {
        case 'Greedy': return 1.5; // Wants more from player
        case 'Lazy': return 0.8; // Gives better deals (less work)
        case 'Professional': return 1.0; // Fair 1:1
        case 'Opportunist': return 1.2; // Slight markup
        case 'Cautious': return 1.1; // Slightly careful
        case 'Aggressive': return 0.9; // Competitive pricing
        case 'Efficient': return 1.0; // Fair pricing
        case 'Reckless': return 0.85; // Doesn't care about value
        default: return 1.0;
    }
}

function updateTradeInventoryDisplays(npc) {
    // Update player inventory amounts
    const playerInventory = gameState.inventory;
    
    // Update NPC inventory amounts (simulated)
    const npcInventory = npc.inventory || generateNPCInventory(npc);
    npc.inventory = npcInventory; // Store it
    
    // Get all unique asteroid types from both inventories
    const allTypes = new Set([
        ...Object.keys(playerInventory),
        ...Object.keys(npcInventory)
    ]);
    
    // Clear existing cards
    const playerGrid = document.getElementById('playerCargoGrid');
    const npcGrid = document.getElementById('npcCargoGrid');
    playerGrid.innerHTML = '';
    npcGrid.innerHTML = '';
    
    // Generate cards for each type that exists
    allTypes.forEach(resourceType => {
        const playerAmount = playerInventory[resourceType] || 0;
        const npcAmount = npcInventory[resourceType] || 0;
        
        // Only show if at least one party has some
        if (playerAmount > 0 || npcAmount > 0) {
            const asteroidData = ASTEROID_TYPES[resourceType];
            if (asteroidData) {
                // Create player card
                playerGrid.appendChild(createCargoCard(resourceType, asteroidData, playerAmount, 'player', 'give'));
                
                // Create NPC card
                npcGrid.appendChild(createCargoCard(resourceType, asteroidData, npcAmount, 'npc', 'take'));
            }
        }
    });
    
    // Re-setup button listeners for new cards
    setupTradeButtons();
    
    // Update trade summary
    updateTradeSummary();
}

function createCargoCard(resourceType, asteroidData, amount, owner, action) {
    const card = document.createElement('div');
    card.className = 'cargo-card';
    card.setAttribute('data-resource', resourceType);
    card.id = `${owner}${capitalize(resourceType)}Card`;
    
    // Use asteroid color for the card
    card.style.setProperty('--resource-color', asteroidData.color);
    
    const tradeValue = asteroidData.value * 5; // Same multiplier as calculateTradeValue
    
    card.innerHTML = `
        <div class="card-glow"></div>
        <div class="card-header">
            <span class="resource-icon" style="color: ${asteroidData.color}; text-shadow: 0 0 10px ${asteroidData.color};">${asteroidData.icon}</span>
            <span class="resource-name">${asteroidData.name.toUpperCase()}</span>
        </div>
        <div class="card-value">
            <span class="value-label">VALUE:</span>
            <span class="value-amount">${tradeValue} CR</span>
        </div>
        <div class="card-amount">
            <span class="amount-label">AVAILABLE:</span>
            <span class="amount-value" id="${owner}${capitalize(resourceType)}">${amount}</span>
        </div>
        <div class="card-controls">
            <div class="input-controls">
                <button class="control-btn decrease-btn" data-input="${owner}${capitalize(resourceType)}Input">-</button>
                <input type="number" class="resource-input" id="${owner}${capitalize(resourceType)}Input" min="0" max="${amount}" value="0" placeholder="0">
                <button class="control-btn increase-btn" data-input="${owner}${capitalize(resourceType)}Input">+</button>
            </div>
            <button class="transfer-btn ${action}-btn" data-resource="${resourceType}" data-action="${action}">
                <span class="btn-icon">${action === 'give' ? '→' : '←'}</span>
                <span class="btn-label">${action === 'give' ? 'GIVE' : 'TAKE'}</span>
            </button>
        </div>
    `;
    
    return card;
}

function generateNPCInventory(npc) {
    // Generate random inventory based on personality and cargo
    const cargo = Math.floor(npc.cargo) || 20;
    const inventory = {};
    
    // Get all asteroid types and their base chances to use as weights
    const asteroidTypes = Object.keys(ASTEROID_TYPES);
    const totalWeight = asteroidTypes.reduce((sum, type) => sum + ASTEROID_TYPES[type].baseChance, 0);
    
    // Distribute cargo across all asteroid types (weighted by their spawn chances)
    let remaining = cargo;
    asteroidTypes.forEach((type, index) => {
        const weight = ASTEROID_TYPES[type].baseChance / totalWeight;
        const isLast = index === asteroidTypes.length - 1;
        
        if (isLast) {
            // Give all remaining to last type to ensure we use all cargo
            inventory[type] = remaining;
        } else {
            const amount = Math.floor(remaining * weight * (0.7 + Math.random() * 0.6));
            inventory[type] = amount;
            remaining -= amount;
        }
    });
    
    return inventory;
}

function resetTradeInputs() {
    // Reset trade offers for all asteroid types
    tradingState.tradeOffer.playerGives = {};
    tradingState.tradeOffer.playerTakes = {};
    
    // Initialize all asteroid types to 0
    Object.keys(ASTEROID_TYPES).forEach(type => {
        tradingState.tradeOffer.playerGives[type] = 0;
        tradingState.tradeOffer.playerTakes[type] = 0;
    });
    
    // Reset all input values (they're dynamically created, so we need to query them)
    document.querySelectorAll('.resource-input').forEach(input => {
        input.value = 0;
    });
    
    // Update summary to show initial state
    updateTradeSummary();
}

function checkPersonalityEvent(npc) {
    const personality = npc.personality || 'Professional';
    const eventSection = document.getElementById('personalityEventSection');
    const eventMessage = document.getElementById('eventMessage');
    const eventButtons = document.getElementById('eventButtons');
    
    // 30% chance of personality event
    if (Math.random() > 0.3) {
        eventSection.style.display = 'none';
        return;
    }
    
    // Generate event based on personality
    const events = getPersonalityEvents(personality, npc);
    if (!events || events.length === 0) {
        eventSection.style.display = 'none';
        return;
    }
    
    const event = events[Math.floor(Math.random() * events.length)];
    
    // Display event
    eventMessage.textContent = event.message;
    eventButtons.innerHTML = '';
    
    event.options.forEach(option => {
        const btn = document.createElement('button');
        btn.className = 'modal-btn modal-btn-small';
        btn.innerHTML = `<span class="btn-bracket">[</span><span class="btn-text">${option.text}</span><span class="btn-bracket">]</span>`;
        btn.onclick = () => handleEventOption(option, npc);
        eventButtons.appendChild(btn);
    });
    
    eventSection.style.display = 'block';
}

function getPersonalityEvents(personality, npc) {
    const playerName = player.name || 'Captain';
    
    switch (personality) {
        case 'Aggressive':
            return [{
                message: `${npc.name} challenges you: "Think you can out-mine me? Bet 100 credits you can't get 50 ore before I do!"`,
                options: [
                    { text: 'ACCEPT', action: 'challenge-accept', reward: 200, reputation: 10 },
                    { text: 'DECLINE', action: 'challenge-decline', reputation: -5 }
                ]
            }];
            
        case 'Greedy':
            return [{
                message: `${npc.name} offers: "I've got some 'premium' platinum here. Only 500 credits for 5 units. Great deal!"`,
                options: [
                    { text: 'BUY', action: 'scam-buy', cost: 500, platinum: 5, reputation: -10 },
                    { text: 'REFUSE', action: 'scam-refuse', reputation: 5 }
                ]
            }];
            
        case 'Reckless':
            return [{
                message: `${npc.name} grins: "Dare you to fly into that hazard field. I'll give you 50 gold if you survive!"`,
                options: [
                    { text: 'DO IT', action: 'dare-accept', gold: 50, hull: -30, reputation: 15 },
                    { text: 'NO WAY', action: 'dare-decline', reputation: -5 }
                ]
            }];
            
        case 'Lazy':
            return [{
                message: `${npc.name} yawns: "Hey ${playerName}, mind grabbing me 20 iron? I'll make it worth your while..."`,
                options: [
                    { text: 'HELP', action: 'delegate-accept', ironCost: 20, reward: 150, reputation: 15 },
                    { text: 'BUSY', action: 'delegate-decline', reputation: 0 }
                ]
            }];
            
        default:
            return [];
    }
}

function handleEventOption(option, npc) {
    const eventSection = document.getElementById('personalityEventSection');
    const eventMessage = document.getElementById('eventMessage');
    
    switch (option.action) {
        case 'challenge-accept':
            eventMessage.textContent = `Challenge accepted! Mine 50 ore to win 200 credits.`;
            if (option.reputation) npc.reputation = (npc.reputation || 0) + option.reputation;
            // Note: Actual challenge would be implemented in game loop
            setTimeout(() => eventSection.style.display = 'none', 3000);
            break;
            
        case 'challenge-decline':
            eventMessage.textContent = `${npc.name} scoffs: "Thought so..."`; 
            if (option.reputation) npc.reputation = (npc.reputation || 0) + option.reputation;
            setTimeout(() => eventSection.style.display = 'none', 2000);
            break;
            
        case 'scam-buy':
            if (gameState.credits >= option.cost) {
                gameState.credits -= option.cost;
                gameState.inventory.platinum = (gameState.inventory.platinum || 0) + option.platinum;
                eventMessage.textContent = `Purchased! (You overpaid...)`;
                if (option.reputation) npc.reputation = (npc.reputation || 0) + option.reputation;
                updateTradeInventoryDisplays(npc);
            } else {
                eventMessage.textContent = `Not enough credits!`;
            }
            setTimeout(() => eventSection.style.display = 'none', 2000);
            break;
            
        case 'scam-refuse':
            eventMessage.textContent = `${npc.name} mutters: "Your loss..."`; 
            if (option.reputation) npc.reputation = (npc.reputation || 0) + option.reputation;
            setTimeout(() => eventSection.style.display = 'none', 2000);
            break;
            
        case 'dare-accept':
            gameState.hull = Math.max(1, gameState.hull + option.hull);
            gameState.inventory.gold = (gameState.inventory.gold || 0) + option.gold;
            eventMessage.textContent = `You did it! +${option.gold} gold (but -${Math.abs(option.hull)} hull!)`;
            if (option.reputation) npc.reputation = (npc.reputation || 0) + option.reputation;
            setTimeout(() => eventSection.style.display = 'none', 3000);
            break;
            
        case 'dare-decline':
            eventMessage.textContent = `${npc.name} shrugs: "Smart choice, probably."`; 
            if (option.reputation) npc.reputation = (npc.reputation || 0) + option.reputation;
            setTimeout(() => eventSection.style.display = 'none', 2000);
            break;
            
        case 'delegate-accept':
            if ((gameState.inventory.iron || 0) >= option.ironCost) {
                gameState.inventory.iron -= option.ironCost;
                gameState.credits += option.reward;
                eventMessage.textContent = `Thanks! Here's ${option.reward} credits.`;
                if (option.reputation) npc.reputation = (npc.reputation || 0) + option.reputation;
                updateTradeInventoryDisplays(npc);
            } else {
                eventMessage.textContent = `You don't have enough iron!`;
            }
            setTimeout(() => eventSection.style.display = 'none', 2000);
            break;
            
        case 'delegate-decline':
            eventMessage.textContent = `${npc.name} sighs: "Fine, I'll do it myself... eventually."`; 
            setTimeout(() => eventSection.style.display = 'none', 2000);
            break;
    }
}

function setupTradeModalEventListeners() {
    // Close button
    const closeBtn = document.getElementById('tradeClose');
    if (closeBtn) closeBtn.onclick = closeTradeModal;
    
    // Cancel button
    const cancelBtn = document.getElementById('cancelTrade');
    if (cancelBtn) cancelBtn.onclick = closeTradeModal;
    
    // Propose trade button
    const proposeBtn = document.getElementById('proposeTrade');
    if (proposeBtn) proposeBtn.onclick = proposeTrade;
    
    // Set up trade input buttons
    setupTradeButtons();
}

function setupTradeButtons() {
    const tradeButtons = document.querySelectorAll('.transfer-btn');
    
    tradeButtons.forEach(btn => {
        if (btn.hasAttribute('data-listener-added')) return;
        
        btn.addEventListener('click', () => {
            const resource = btn.getAttribute('data-resource');
            const action = btn.getAttribute('data-action');
            const input = action === 'give' 
                ? document.getElementById(`player${capitalize(resource)}Input`)
                : document.getElementById(`npc${capitalize(resource)}Input`);
            
            if (input) {
                const max = parseInt(input.max) || 0;
                input.value = max;
                
                // Update trade offer
                if (action === 'give') {
                    tradingState.tradeOffer.playerGives[resource] = max;
                } else {
                    tradingState.tradeOffer.playerTakes[resource] = max;
                }
                
                // Update summary
                updateTradeSummary();
            }
        });
        
        btn.setAttribute('data-listener-added', 'true');
    });
    
    // Setup increment/decrement buttons
    const controlButtons = document.querySelectorAll('.control-btn');
    controlButtons.forEach(btn => {
        if (btn.hasAttribute('data-listener-added')) return;
        
        btn.addEventListener('click', () => {
            const inputId = btn.getAttribute('data-input');
            const input = document.getElementById(inputId);
            if (!input) return;
            
            const currentValue = parseInt(input.value) || 0;
            const max = parseInt(input.max) || 0;
            const min = parseInt(input.min) || 0;
            
            if (btn.classList.contains('increase-btn')) {
                input.value = Math.min(currentValue + 1, max);
            } else if (btn.classList.contains('decrease-btn')) {
                input.value = Math.max(currentValue - 1, min);
            }
            
            // Trigger input event to update trade offer
            input.dispatchEvent(new Event('input'));
        });
        
        btn.setAttribute('data-listener-added', 'true');
    });
    
    // Setup input change listeners
    const inputs = document.querySelectorAll('.resource-input');
    inputs.forEach(input => {
        if (input.hasAttribute('data-listener-added')) return;
        
        input.addEventListener('input', () => {
            const inputId = input.id;
            const value = parseInt(input.value) || 0;
            
            // Determine resource and action
            let resource, action;
            if (inputId.startsWith('player')) {
                action = 'give';
                resource = inputId.replace('player', '').replace('Input', '').toLowerCase();
            } else if (inputId.startsWith('npc')) {
                action = 'take';
                resource = inputId.replace('npc', '').replace('Input', '').toLowerCase();
            }
            
            // Update trade offer
            if (action === 'give') {
                tradingState.tradeOffer.playerGives[resource] = value;
            } else if (action === 'take') {
                tradingState.tradeOffer.playerTakes[resource] = value;
            }
            
            // Update summary
            updateTradeSummary();
        });
        
        input.setAttribute('data-listener-added', 'true');
    });
}

function updateTradeSummary() {
    // Calculate what player gives
    let giveValue = 0;
    let giveItems = [];
    for (const [resource, amount] of Object.entries(tradingState.tradeOffer.playerGives)) {
        if (amount > 0) {
            const asteroidData = ASTEROID_TYPES[resource];
            if (asteroidData) {
                giveValue += asteroidData.value * 5 * amount;
                giveItems.push(`${amount}x ${asteroidData.name}`);
            }
        }
    }
    
    // Calculate what player takes
    let takeValue = 0;
    let takeItems = [];
    for (const [resource, amount] of Object.entries(tradingState.tradeOffer.playerTakes)) {
        if (amount > 0) {
            const asteroidData = ASTEROID_TYPES[resource];
            if (asteroidData) {
                takeValue += asteroidData.value * 5 * amount;
                takeItems.push(`${amount}x ${asteroidData.name}`);
            }
        }
    }
    
    // Update summary display
    document.getElementById('summaryGiveItems').textContent = giveItems.length > 0 ? giveItems.join(', ') : '---';
    document.getElementById('summaryGiveValue').textContent = `${giveValue} CR`;
    document.getElementById('summaryTakeItems').textContent = takeItems.length > 0 ? takeItems.join(', ') : '---';
    document.getElementById('summaryTakeValue').textContent = `${takeValue} CR`;
    
    // Calculate net balance (what you receive - what you give)
    const netBalance = takeValue - giveValue;
    const balanceElement = document.getElementById('balanceValue');
    balanceElement.textContent = `${netBalance >= 0 ? '+' : ''}${netBalance} CR`;
    balanceElement.style.color = netBalance >= 0 ? '#00ff00' : '#ff0000';
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function proposeTrade() {
    const npc = tradingState.currentNPC;
    if (!npc) return;
    
    // Calculate trade values
    const playerGiveValue = calculateTradeValue(tradingState.tradeOffer.playerGives);
    const playerTakeValue = calculateTradeValue(tradingState.tradeOffer.playerTakes);
    const multiplier = getPersonalityPriceMultiplier(npc);
    const adjustedTakeValue = playerTakeValue * multiplier;
    
    // Validate trade
    if (playerGiveValue < adjustedTakeValue * 0.8) {
        showTradeWarning('NPC wants a fairer deal!');
        return;
    }
    
    // Check player has resources
    const playerInventory = gameState.inventory;
    for (const [resource, amount] of Object.entries(tradingState.tradeOffer.playerGives)) {
        if (amount > 0 && (playerInventory[resource] || 0) < amount) {
            const asteroidData = ASTEROID_TYPES[resource];
            const resourceName = asteroidData ? asteroidData.name : resource;
            showTradeWarning(`Not enough ${resourceName}!`);
            return;
        }
    }
    
    // Check NPC has resources
    const npcInventory = npc.inventory;
    for (const [resource, amount] of Object.entries(tradingState.tradeOffer.playerTakes)) {
        if (amount > 0 && (npcInventory[resource] || 0) < amount) {
            const asteroidData = ASTEROID_TYPES[resource];
            const resourceName = asteroidData ? asteroidData.name : resource;
            showTradeWarning(`NPC doesn't have enough ${resourceName}!`);
            return;
        }
    }
    
    // Execute trade
    for (const [resource, amount] of Object.entries(tradingState.tradeOffer.playerGives)) {
        if (amount > 0) {
            playerInventory[resource] = (playerInventory[resource] || 0) - amount;
            npcInventory[resource] = (npcInventory[resource] || 0) + amount;
        }
    }
    
    for (const [resource, amount] of Object.entries(tradingState.tradeOffer.playerTakes)) {
        if (amount > 0) {
            playerInventory[resource] = (playerInventory[resource] || 0) + amount;
            npcInventory[resource] = (npcInventory[resource] || 0) - amount;
        }
    }
    
    // Update reputation
    npc.reputation = (npc.reputation || 0) + 2;
    
    // Show success message
    showTradeWarning('Trade successful!');
    
    // Update displays and reset
    setTimeout(() => {
        updateTradeInventoryDisplays(npc);
        resetTradeInputs();
        document.getElementById('tradeWarning').style.display = 'none';
    }, 1500);
}

function calculateTradeValue(resources) {
    let total = 0;
    
    for (const [resource, amount] of Object.entries(resources)) {
        const asteroidType = ASTEROID_TYPES[resource];
        if (asteroidType && amount > 0) {
            // Use the asteroid's value, multiplied by 5 to make trade values more meaningful
            total += asteroidType.value * 5 * amount;
        }
    }
    
    return total;
}

function showTradeWarning(message) {
    const warning = document.getElementById('tradeWarning');
    if (warning) {
        warning.textContent = message;
        warning.style.display = 'block';
    }
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
const phosphorCtx = phosphorCanvas.getContext('2d', { willReadFrequently: true });
phosphorCanvas.width = canvas.width;
phosphorCanvas.height = canvas.height;

// Clean frame buffer for saturation boost (untouched by phosphor)
const cleanFrameCanvas = document.createElement('canvas');
const cleanFrameCtx = cleanFrameCanvas.getContext('2d', { willReadFrequently: true });
cleanFrameCanvas.width = canvas.width;
cleanFrameCanvas.height = canvas.height;

// Detect Apple/iOS devices for CRT compatibility mode
const isAppleDevice = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) || 
                      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);

// Temporary canvas for Apple-compatible CRT processing
let appleBlendCanvas = null;
let appleBlendCtx = null;
if (isAppleDevice) {
    appleBlendCanvas = document.createElement('canvas');
    appleBlendCtx = appleBlendCanvas.getContext('2d', { willReadFrequently: true });
    appleBlendCanvas.width = canvas.width;
    appleBlendCanvas.height = canvas.height;
}

function resizeCanvas() {
    const canvasContainer = canvas.parentElement; // .canvas-container
    const centerPanel = document.querySelector('.center-panel');
    const containerWidth = canvasContainer.clientWidth;
    const containerHeight = canvasContainer.clientHeight;
    
    const aspectRatio = 4 / 3;
    const isMobile = window.innerWidth <= 768; // Detect mobile screens
    
    // Mobile viewport height fix: Set CSS custom property for dynamic viewport height
    // This accounts for browser chrome (address bar, navigation) on mobile devices
    if (isMobile) {
        // Use the actual visible viewport height
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }
    
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
            // Don't remove width-constrained on mobile (CSS handles it differently)
            if (!isMobile) {
                centerPanel.classList.remove('width-constrained');
            }
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
            // Don't add width-constrained class on mobile (CSS handles layout differently)
            if (!isMobile) {
                centerPanel.classList.add('width-constrained');
            }
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
    
    // Resize Apple blend canvas if it exists
    if (appleBlendCanvas) {
        appleBlendCanvas.width = canvas.width;
        appleBlendCanvas.height = canvas.height;
    }
    
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
        
        // Trade function (T key)
        if (e.key.toLowerCase() === 't' && !gameState.isPaused && !tradingState.isTrading) {
            // Check if there's a nearby NPC to trade with
            if (tradingState.nearbyNPC) {
                openTradeModal(tradingState.nearbyNPC);
            }
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
        
        // Check if touch is on trade button
        if (e.touches.length === 1 && window.tradeButtonBounds && tradingState.nearbyNPC) {
            const touch = e.touches[0];
            const rect = canvas.getBoundingClientRect();
            const canvasX = touch.clientX - rect.left;
            const canvasY = touch.clientY - rect.top;
            
            const bounds = window.tradeButtonBounds;
            if (canvasX >= bounds.x && canvasX <= bounds.x + bounds.width &&
                canvasY >= bounds.y && canvasY <= bounds.y + bounds.height) {
                // Trade button was tapped
                if (!tradingState.isTrading) {
                    openTradeModal(tradingState.nearbyNPC);
                }
                return; // Don't process as movement
            }
        }
        
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
    return Array.from(document.querySelectorAll('button:not([disabled]), input, select, .upgrade-btn, .hint-close, .modal-btn, .modal-btn-small, .transfer-btn, .control-btn, .color-swatch-btn, .preset-btn, .color-swatch, a.terminal-btn, a.exit-btn, .mission-board-item:not(.accepted):not(.completed):not(.failed):not(.empty)'));
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
            // Priority 1: Must be in the correct direction (already filtered by isInDirection)
            // Priority 2: Find the closest element (using total distance)
            // Calculate total distance (Euclidean distance)
            const totalDistance = Math.sqrt(dx * dx + dy * dy);
            
            // Lower score is better - closest element wins
            const score = totalDistance;
            
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
    
    // Save START button state immediately after checking
    lastGamepadState.buttons[9] = startButton;
    
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
        
        // In virtual mouse mode, disable game controls
        return;
    }
    
    // Don't process game controls if paused (but virtual mouse above still works)
    if (gameState.isPaused) {
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
    // Y/Triangle Button - Trade with Nearby NPC
    // ====================
    const yButton = gamepad.buttons[3] && gamepad.buttons[3].pressed;
    const yButtonJustPressed = yButton && !(lastGamepadState.buttons[3]);
    
    if (yButtonJustPressed && !tradingState.isTrading) {
        gamepadInputDetected = true;
        // Check if there's a nearby NPC to trade with
        if (tradingState.nearbyNPC) {
            openTradeModal(tradingState.nearbyNPC);
        }
    }
    
    // Update button state tracking
    lastGamepadState.buttons[1] = bButton;
    lastGamepadState.buttons[3] = yButton;
    
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
        
        // D-Pad Left - Toggle Missions Drawer (only when virtual mouse is OFF)
        const dpadLeft = gamepad.buttons[14] && gamepad.buttons[14].pressed;
        const dpadLeftJustPressed = dpadLeft && !lastGamepadState.dpadLeftPressed;
        
        if (dpadLeftJustPressed) {
            gamepadInputDetected = true;
            toggleMissionsDrawer();
        }
        
        lastGamepadState.dpadLeftPressed = dpadLeft;
        
        // D-Pad Right - Sell Cargo (docked or remote with drone) (only when virtual mouse is OFF)
        const dpadRight = gamepad.buttons[15] && gamepad.buttons[15].pressed;
        const dpadRightJustPressed = dpadRight && !lastGamepadState.dpadRightPressed;
        
        if (dpadRightJustPressed) {
            gamepadInputDetected = true;
            // Check if player has cargo to sell
            if (gameState.cargo > 0) {
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
            } else {
                logMessage('No cargo to sell.');
            }
        }
        
        lastGamepadState.dpadRightPressed = dpadRight;
    } else {
        lastGamepadState.dpadUpPressed = false;
        lastGamepadState.dpadLeftPressed = false;
        lastGamepadState.dpadRightPressed = false;
    }
    
    // Update input method if any gamepad input was detected
    if (gamepadInputDetected) {
        setInputMethod('gamepad');
    }
    
    // Save button states for next frame (but preserve START button state already saved earlier)
    const startButtonState = lastGamepadState.buttons[9];
    lastGamepadState.buttons = gamepad.buttons.map(b => b.pressed);
    lastGamepadState.buttons[9] = startButtonState; // Restore START button state to prevent double-trigger
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
// MISSION SYSTEM
// ================================

// Mission templates for random generation
const MISSION_TEMPLATES = [
    // Basic mining missions - destroy asteroids
    {
        type: 'mine_asteroids',
        icon: '◆',
        titleTemplates: ['MINING CONTRACT', 'ASTEROID CLEARING', 'ORE EXTRACTION'],
        descriptionTemplates: [
            'Mine and destroy {target} asteroids',
            'Clear {target} asteroids from shipping lanes',
            'Harvest ore from {target} asteroids'
        ],
        rewardMultiplier: 60,
        difficulties: { 
            easy: [8, 12], 
            medium: [13, 18], 
            hard: [19, 25] 
        }
    },
    // Specific resource collection missions
    {
        type: 'mine_specific',
        icon: '◇',
        titleTemplates: ['RARE ORE REQUEST', 'MINERAL SURVEY', 'RESOURCE COLLECTION'],
        descriptionTemplates: [
            'Collect {target} units of {resourceType}',
            'Mine {target} {resourceType} asteroids',
            'Harvest {target} {resourceType} specimens for research'
        ],
        rewardMultiplier: 180,
        difficulties: { 
            easy: [4, 6], 
            medium: [7, 10], 
            hard: [11, 15] 
        }
    },
    // Exploration missions - travel distance
    {
        type: 'travel_distance',
        icon: '▸',
        titleTemplates: ['EXPLORATION MISSION', 'DEEP SPACE SURVEY', 'SECTOR MAPPING'],
        descriptionTemplates: [
            'Explore and travel {target} units through space',
            'Map {target} units of uncharted territory',
            'Navigate {target} units for sector reconnaissance'
        ],
        rewardMultiplier: 0.15,
        difficulties: { 
            easy: [8000, 12000], 
            medium: [12001, 18000], 
            hard: [18001, 25000] 
        }
    },
    // Cargo delivery missions - collect and hold resources
    {
        type: 'cargo_delivery',
        icon: '■',
        titleTemplates: ['CARGO DELIVERY', 'FREIGHT CONTRACT', 'SUPPLY RUN'],
        descriptionTemplates: [
            'Collect and hold {target} units of cargo simultaneously',
            'Fill your cargo bay with {target} total units',
            'Accumulate {target} units of resources in inventory'
        ],
        rewardMultiplier: 25,
        difficulties: { 
            easy: [20, 35], 
            medium: [36, 60], 
            hard: [61, 100] 
        }
    },
    // Hazard survival missions - avoid taking damage
    {
        type: 'hazard_survival',
        icon: '⚠',
        titleTemplates: ['HAZARD NAVIGATION', 'DANGER ZONE', 'SURVIVAL TEST'],
        descriptionTemplates: [
            'Mine {target} asteroids without hull dropping below {threshold}%',
            'Destroy {target} asteroids while maintaining {threshold}%+ hull',
            'Complete {target} mining operations without taking critical damage ({threshold}%+ hull)'
        ],
        rewardMultiplier: 100,
        difficulties: { 
            easy: [10, 15],   // asteroids to mine
            medium: [16, 22], 
            hard: [23, 30] 
        },
        thresholds: {
            easy: 60,    // hull threshold %
            medium: 50,
            hard: 40
        }
    },
    // Credit generation missions
    {
        type: 'earn_credits',
        icon: '₵',
        titleTemplates: ['PROFIT CONTRACT', 'TRADE MISSION', 'REVENUE GENERATION'],
        descriptionTemplates: [
            'Generate {target} credits through mining and trading',
            'Earn {target} credits from ore sales',
            'Accumulate {target} credits in profits'
        ],
        rewardMultiplier: 0.4,
        difficulties: { 
            easy: [2500, 4000], 
            medium: [4001, 7000], 
            hard: [7001, 12000] 
        }
    },
    // Speed challenge - complete quickly
    {
        type: 'speed_mining',
        icon: '»',
        titleTemplates: ['SPEED MINING', 'RAPID EXTRACTION', 'TIME TRIAL'],
        descriptionTemplates: [
            'Mine {target} asteroids within {timeLimit} seconds',
            'Destroy {target} asteroids before time runs out ({timeLimit}s)',
            'Complete rapid extraction of {target} asteroids in {timeLimit}s'
        ],
        rewardMultiplier: 120,
        difficulties: { 
            easy: [6, 8],      // asteroids to mine
            medium: [9, 12], 
            hard: [13, 18] 
        },
        timeLimits: {
            easy: 180,    // seconds
            medium: 150,
            hard: 120
        }
    }
];

function initMissions() {
    // Initialize mission system (don't create dummy missions)
    // Missions will be generated per-station when player docks
    updateMissionsDisplay();
    
    // Initialize mission board drawer toggle
    const missionBoardDrawerBtn = document.getElementById('missionBoardDrawerBtn');
    const missionBoardContent = document.getElementById('missionBoardContent');
    const missionBoardDrawerIcon = missionBoardDrawerBtn.querySelector('.drawer-icon');
    
    missionBoardDrawerBtn.addEventListener('click', () => {
        const isOpen = missionBoardContent.style.display !== 'none';
        
        if (isOpen) {
            // Close the mission board drawer
            missionBoardContent.style.display = 'none';
            missionBoardDrawerIcon.textContent = '▶';
        } else {
            // Open the mission board drawer
            missionBoardContent.style.display = 'block';
            missionBoardDrawerIcon.textContent = '▼';
        }
    });
}

// Generate random missions for a station
function generateStationMissions(stationName, stationColor) {
    const missions = [];
    const numMissions = 3; // Always 3 missions per station
    
    for (let i = 0; i < numMissions; i++) {
        const template = MISSION_TEMPLATES[Math.floor(Math.random() * MISSION_TEMPLATES.length)];
        const difficulty = ['easy', 'medium', 'hard'][Math.floor(Math.random() * 3)];
        const difficultyRange = template.difficulties[difficulty];
        const target = Math.floor(Math.random() * (difficultyRange[1] - difficultyRange[0] + 1)) + difficultyRange[0];
        
        // Select random title and description
        const title = template.titleTemplates[Math.floor(Math.random() * template.titleTemplates.length)];
        let description = template.descriptionTemplates[Math.floor(Math.random() * template.descriptionTemplates.length)];
        
        // For specific resource missions, pick a random resource type
        let resourceType = null;
        let rarityMultiplier = 1.0;
        if (template.type === 'mine_specific') {
            const resourceTypes = Object.keys(ASTEROID_TYPES).filter(t => t !== 'common');
            resourceType = resourceTypes[Math.floor(Math.random() * resourceTypes.length)];
            const resourceData = ASTEROID_TYPES[resourceType];
            const resourceName = resourceData.name;
            rarityMultiplier = resourceData.rarityMultiplier; // Use rarity for reward scaling
            description = description.replace('{resourceType}', resourceName);
        }
        
        // Handle special parameters for different mission types
        let threshold = null;
        let timeLimit = null;
        
        if (template.type === 'hazard_survival') {
            threshold = template.thresholds[difficulty];
            description = description.replace('{threshold}', threshold);
        }
        
        if (template.type === 'speed_mining') {
            timeLimit = template.timeLimits[difficulty];
            description = description.replace('{timeLimit}', timeLimit);
        }
        
        description = description.replace('{target}', target);
        
        // Calculate reward based on difficulty, rarity, and sector
        const difficultyMultiplier = difficulty === 'hard' ? 1.5 : difficulty === 'medium' ? 1.25 : 1;
        const sectorMultiplier = 1.0 + (gameState.sector - 1) * 0.1; // 1.0x for sector 1, 1.1x for sector 2, 1.2x for sector 3, etc.
        const reward = Math.floor(target * template.rewardMultiplier * difficultyMultiplier * rarityMultiplier * sectorMultiplier);
        
        missions.push({
            id: gameState.nextMissionId++,
            icon: template.icon,
            title: title,
            description: description,
            type: template.type,
            resourceType: resourceType,
            difficulty: difficulty,
            target: target,
            threshold: threshold,
            timeLimit: timeLimit,
            reward: reward,
            stationName: stationName,
            stationColor: stationColor,
            startValue: 0,  // Will be set when mission is accepted
            startTime: 0    // For time-based missions
        });
    }
    
    return missions;
}

// Calculate mission reward with prestige bonus
function calculateMissionReward(baseReward) {
    const bonusValue = Math.floor(baseReward * (gameState.prestigeBonus / 100));
    return baseReward + bonusValue;
}

// Show mission board when docked
function updateMissionBoard(stationName, stationColor) {
    const missionBoard = document.getElementById('missionBoard');
    const missionBoardContent = document.getElementById('missionBoardContent');
    const missionBoardList = document.getElementById('missionBoardList');
    const missionBoardDrawerIcon = document.querySelector('#missionBoardDrawerBtn .drawer-icon');
    
    // Show mission board and auto-expand it
    missionBoard.style.display = 'block';
    missionBoardContent.style.display = 'block';
    if (missionBoardDrawerIcon) {
        missionBoardDrawerIcon.textContent = '▼';
    }
    
    // Generate missions for this station if they don't exist
    if (!gameState.stationMissions[stationName]) {
        gameState.stationMissions[stationName] = generateStationMissions(stationName, stationColor);
    }
    
    const availableMissions = gameState.stationMissions[stationName];
    
    // Find completed missions for this station
    const completedMissions = gameState.missions.filter(m => 
        m.status === 'completed' && m.stationName === stationName
    );
    
    // Find failed missions for this station
    const failedMissions = gameState.missions.filter(m => 
        m.status === 'failed' && m.stationName === stationName
    );
    
    // Clear current display
    missionBoardList.innerHTML = '';
    
    if (availableMissions.length === 0 && completedMissions.length === 0 && failedMissions.length === 0) {
        const emptyItem = document.createElement('div');
        emptyItem.className = 'mission-board-item empty';
        emptyItem.innerHTML = `
            <span class="item-icon">⊗</span>
            <span class="item-text">NO MISSIONS AVAILABLE</span>
        `;
        missionBoardList.appendChild(emptyItem);
    } else {
        // First, show completed missions at the top
        completedMissions.forEach(mission => {
            const item = document.createElement('div');
            item.className = 'mission-board-item completed';
            
            const progressPercent = 100;
            const rewardWithBonus = calculateMissionReward(mission.reward);
            
            item.innerHTML = `
                <div class="mission-header">
                    <span class="item-icon">${mission.icon}</span>
                    <span class="mission-title">${mission.title}</span>
                    <span class="mission-status"><span style="color: #00ff00;">✓ COMPLETED</span></span>
                </div>
                <div class="mission-description">${mission.description}</div>
                <div class="mission-progress">
                    <span>${mission.current}/${mission.target}</span>
                    <div class="mission-progress-bar">
                        <div class="mission-progress-fill" style="width: ${progressPercent}%"></div>
                    </div>
                </div>
                <div class="mission-reward">REWARD: ${rewardWithBonus}¢</div>
                <button class="claim-reward-btn" data-mission-id="${mission.id}">
                    [CLAIM REWARD]
                </button>
            `;
            
            // Add event listener to the claim button
            const btn = item.querySelector('.claim-reward-btn');
            btn.addEventListener('click', () => claimMissionReward(mission.id));
            
            missionBoardList.appendChild(item);
        });
        
        // Then show available/in-progress/failed missions
        availableMissions.forEach(mission => {
            // Only display missions that belong to this station
            if (mission.stationName !== stationName) {
                return; // Skip missions from other stations
            }
            
            // Check if mission is already accepted or failed
            const acceptedMission = gameState.missions.find(m => m.id === mission.id);
            const isAccepted = !!acceptedMission;
            
            // Skip if mission is completed (already shown above)
            if (isAccepted && acceptedMission && acceptedMission.status === 'completed') {
                return;
            }
            
            const item = document.createElement('div');
            
            if (isAccepted && acceptedMission) {
                // Only show accepted missions if they're from this station
                if (acceptedMission.stationName !== stationName) {
                    return; // Skip accepted missions from other stations
                }
                
                // Check if mission is failed
                if (acceptedMission.status === 'failed') {
                    // Show failed mission with abandon button
                    item.className = 'mission-board-item failed';
                    const progressPercent = Math.min(100, (acceptedMission.current / acceptedMission.target) * 100);
                    const rewardWithBonus = calculateMissionReward(acceptedMission.reward);
                    
                    item.innerHTML = `
                        <div class="mission-header">
                            <span class="item-icon">${acceptedMission.icon}</span>
                            <span class="mission-title">${acceptedMission.title}</span>
                            <span class="mission-status"><span style="color: #ff0000;">✗ FAILED</span></span>
                        </div>
                        <div class="mission-description">${acceptedMission.description}</div>
                        <div class="mission-progress">
                            <span>${acceptedMission.current}/${acceptedMission.target}</span>
                            <div class="mission-progress-bar">
                                <div class="mission-progress-fill" style="width: ${progressPercent}%"></div>
                            </div>
                        </div>
                        <div class="mission-reward" style="color: #888888; text-decoration: line-through;">REWARD: ${rewardWithBonus}¢</div>
                        <button class="claim-reward-btn" style="background-color: rgba(255, 0, 0, 0.2); border-color: #ff0000;" data-mission-id="${acceptedMission.id}">
                            [ABANDON MISSION]
                        </button>
                    `;
                    
                    // Add event listener to the abandon button
                    const btn = item.querySelector('.claim-reward-btn');
                    btn.addEventListener('click', () => abandonMission(acceptedMission.id));
                } else {
                    // Show accepted mission in progress
                    item.className = 'mission-board-item accepted';
                    const progressPercent = Math.min(100, (acceptedMission.current / acceptedMission.target) * 100);
                    const rewardWithBonus = calculateMissionReward(acceptedMission.reward);
                    
                    item.innerHTML = `
                        <div class="mission-header">
                            <span class="item-icon">${acceptedMission.icon}</span>
                            <span class="mission-title">${acceptedMission.title}</span>
                            <span class="mission-status"><span style="color: #ffaa00;">◉ IN PROGRESS</span></span>
                        </div>
                        <div class="mission-description">${acceptedMission.description}</div>
                        <div class="mission-progress">
                            <span>${acceptedMission.current}/${acceptedMission.target}</span>
                            <div class="mission-progress-bar">
                                <div class="mission-progress-fill" style="width: ${progressPercent}%"></div>
                            </div>
                        </div>
                        <div class="mission-reward">REWARD: ${rewardWithBonus}¢</div>
                    `;
                }
            } else {
                // Show unaccepted mission (clickable)
                item.className = 'mission-board-item';
                const rewardWithBonus = calculateMissionReward(mission.reward);
                item.innerHTML = `
                    <div class="mission-header">
                        <span class="item-icon">${mission.icon}</span>
                        <span class="mission-title">${mission.title}</span>
                        <span class="mission-status"><span class="mission-board-difficulty ${mission.difficulty}">${mission.difficulty.toUpperCase()}</span></span>
                    </div>
                    <div class="mission-description">${mission.description}</div>
                    <div class="mission-reward">REWARD: ${rewardWithBonus}¢</div>
                `;
                item.addEventListener('click', () => acceptMission(mission, stationName, stationColor));
            }
            
            missionBoardList.appendChild(item);
        });
    }
}

// Accept a mission from the board
function acceptMission(mission, stationName, stationColor) {
    // Set start values based on mission type
    switch (mission.type) {
        case 'mine_asteroids':
            mission.startValue = gameState.stats.asteroidsDestroyed;
            mission.current = 0;
            break;
        case 'mine_specific':
            mission.startValue = gameState.stats.mineralsMined[mission.resourceType] || 0;
            mission.current = 0;
            break;
        case 'earn_credits':
            mission.startValue = gameState.stats.creditsEarned;
            mission.current = 0;
            break;
        case 'travel_distance':
            mission.startValue = gameState.stats.distanceTraveled;
            mission.current = 0;
            break;
        case 'cargo_delivery':
            mission.startValue = 0;
            mission.current = 0;
            break;
        case 'hazard_survival':
            mission.startValue = gameState.stats.asteroidsDestroyed;
            mission.current = 0;
            mission.lowestHull = gameState.hull;
            mission.failed = false;
            break;
        case 'speed_mining':
            mission.startValue = gameState.stats.asteroidsDestroyed;
            mission.current = 0;
            mission.startTime = Date.now();
            mission.failed = false;
            break;
    }
    
    mission.status = 'active';
    gameState.missions.push(mission);
    
    logMessage(`Mission accepted: ${mission.title}`, 'success');
    markUIDirty('missions');
    updateMissionBoard(stationName, stationColor);
    updateMissionsDisplay();
}

// Update mission completion area
// Claim mission reward (must be at the correct station)
function claimMissionReward(missionId) {
    const mission = gameState.missions.find(m => m.id === missionId);
    if (!mission || mission.status !== 'completed') return;
    
    // Award the reward with prestige bonus
    const rewardWithBonus = calculateMissionReward(mission.reward);
    gameState.credits += rewardWithBonus;
    gameState.stats.creditsEarned += rewardWithBonus;
    logMessage(`Mission reward claimed: ${rewardWithBonus}¢ from ${mission.title}!`, 'success');
    
    // Mark UI as dirty (include prestige for button state)
    markUIDirty('credits', 'missions', 'prestige');
    
    // Remove mission from active list
    removeMission(missionId);
    
    // Remove from station's available missions
    if (gameState.stationMissions[mission.stationName]) {
        gameState.stationMissions[mission.stationName] = gameState.stationMissions[mission.stationName].filter(m => m.id !== missionId);
        
        // Generate a new mission to replace it
        const newMission = generateStationMissions(mission.stationName, mission.stationColor)[0];
        gameState.stationMissions[mission.stationName].push(newMission);
    }
    
    updateUI();
    
    // Refresh mission board if still docked
    const dockedStation = stations.find(s => s.isDocked);
    if (dockedStation) {
        updateMissionBoard(dockedStation.name, dockedStation.colorScheme);
    }
}

// Abandon a failed mission
function abandonMission(missionId) {
    const mission = gameState.missions.find(m => m.id === missionId);
    if (!mission || mission.status !== 'failed') return;
    
    logMessage(`Mission abandoned: ${mission.title}`, 'info');
    
    // Mark missions as dirty
    markUIDirty('missions');
    
    // Remove mission from active list
    removeMission(missionId);
    
    // Remove from station's available missions
    if (gameState.stationMissions[mission.stationName]) {
        gameState.stationMissions[mission.stationName] = gameState.stationMissions[mission.stationName].filter(m => m.id !== missionId);
        
        // Generate a new mission to replace it
        const newMission = generateStationMissions(mission.stationName, mission.stationColor)[0];
        gameState.stationMissions[mission.stationName].push(newMission);
    }
    
    updateUI();
    
    // Refresh mission board if still docked
    const dockedStation = stations.find(s => s.isDocked);
    if (dockedStation) {
        updateMissionBoard(dockedStation.name, dockedStation.colorScheme);
    }
}

// Collapse mission board when undocked and clear missions
function hideMissionBoard() {
    const missionBoardContent = document.getElementById('missionBoardContent');
    const missionBoardDrawerIcon = document.querySelector('#missionBoardDrawerBtn .drawer-icon');
    const missionBoardList = document.getElementById('missionBoardList');
    
    // Collapse the drawer
    missionBoardContent.style.display = 'none';
    if (missionBoardDrawerIcon) {
        missionBoardDrawerIcon.textContent = '▶';
    }
    
    // Show "Dock at a station" message
    missionBoardList.innerHTML = `
        <div class="mission-board-item empty">
            <span class="item-icon">⊗</span>
            <span class="item-text">DOCK AT A STATION TO VIEW MISSIONS</span>
        </div>
    `;
}

// Close upgrades drawer (called when undocking)
function closeUpgradesDrawer() {
    // Use cached DOM elements for performance
    const upgradesDrawerContent = domCache.upgradesDrawerContent;
    const upgradesDrawerIcon = domCache.upgradesDrawerIcon;
    
    // Close the master drawer
    if (upgradesDrawerContent) {
        upgradesDrawerContent.style.display = 'none';
    }
    if (upgradesDrawerIcon) {
        upgradesDrawerIcon.textContent = '▶';
    }
    
    // Close all upgrade categories
    document.querySelectorAll('.category-content').forEach(c => {
        c.style.display = 'none';
    });
    document.querySelectorAll('.category-icon').forEach(i => {
        i.textContent = '▶';
    });
}

// Update mission progress (called from game loop)
function updateMissionProgress(missionId, progress) {
    const mission = gameState.missions.find(m => m.id === missionId);
    if (!mission || mission.status !== 'active') return;
    
    const oldProgress = mission.current;
    const oldStatus = mission.status;
    
    mission.current = Math.min(progress, mission.target);
    
    // Check if mission is completed
    if (mission.current >= mission.target) {
        mission.status = 'completed';
        logMessage(`Mission completed: ${mission.title}! Return to ${mission.stationName} to claim reward.`, 'success');
    }
    
    // Only mark dirty if progress or status actually changed
    if (mission.current !== oldProgress || mission.status !== oldStatus) {
        markUIDirty('missions');
        
        // If docked at a station, refresh the mission board to show updated progress
        const dockedStation = stations.find(st => st.isDocked);
        if (dockedStation) {
            updateMissionBoard(dockedStation.name, dockedStation.colorScheme);
        }
    }
}

// Update all active missions based on current game state
function updateAllMissions() {
    // Early exit if no active missions
    const hasActiveMissions = gameState.missions.some(m => m.status === 'active');
    if (!hasActiveMissions) return;
    
    gameState.missions.forEach(mission => {
        if (mission.status !== 'active') return;
        
        let progress = 0;
        
        switch (mission.type) {
            case 'mine_asteroids':
                // Track asteroids destroyed since mission start
                progress = gameState.stats.asteroidsDestroyed - mission.startValue;
                updateMissionProgress(mission.id, progress);
                break;
                
            case 'mine_specific':
                // Track specific resource type mined (total mined, not current inventory)
                const totalMined = gameState.stats.mineralsMined[mission.resourceType] || 0;
                progress = totalMined - mission.startValue;
                updateMissionProgress(mission.id, progress);
                break;
                
            case 'earn_credits':
                // Track credits earned since mission start
                progress = gameState.stats.creditsEarned - mission.startValue;
                updateMissionProgress(mission.id, progress);
                break;
                
            case 'travel_distance':
                // Track distance traveled since mission start
                progress = Math.floor(gameState.stats.distanceTraveled - mission.startValue);
                updateMissionProgress(mission.id, progress);
                break;
                
            case 'cargo_delivery':
                // Track total cargo currently held
                let totalCargo = 0;
                Object.values(gameState.inventory).forEach(count => totalCargo += count);
                updateMissionProgress(mission.id, totalCargo);
                break;
                
            case 'hazard_survival':
                // Track asteroids mined while maintaining hull threshold
                if (mission.failed) {
                    // Mission already failed, don't update
                    break;
                }
                
                // Check if hull dropped below threshold
                const hullPercentage = (gameState.hull / gameState.maxHull) * 100;
                if (hullPercentage < mission.threshold) {
                    // Failed the mission
                    mission.failed = true;
                    mission.status = 'failed';
                    logMessage(`Mission failed: Hull dropped below ${mission.threshold}%`, 'error');
                    updateMissionsDisplay();
                    break;
                }
                
                // Track asteroids destroyed while maintaining hull
                progress = gameState.stats.asteroidsDestroyed - mission.startValue;
                updateMissionProgress(mission.id, progress);
                break;
                
            case 'speed_mining':
                // Track asteroids destroyed within time limit
                if (mission.failed) {
                    // Mission already failed, don't update
                    break;
                }
                
                const elapsedTime = (Date.now() - mission.startTime) / 1000; // seconds
                
                // Check if time limit exceeded
                if (elapsedTime > mission.timeLimit) {
                    // Check if already completed
                    const asteroidsMined = gameState.stats.asteroidsDestroyed - mission.startValue;
                    if (asteroidsMined < mission.target) {
                        // Failed to complete in time
                        mission.failed = true;
                        mission.status = 'failed';
                        logMessage(`Mission failed: Time limit exceeded`, 'error');
                        updateMissionsDisplay();
                    }
                    break;
                }
                
                // Update progress
                progress = gameState.stats.asteroidsDestroyed - mission.startValue;
                updateMissionProgress(mission.id, progress);
                break;
        }
    });
}

// Function to add a new mission
function addMission(mission) {
    gameState.missions.push(mission);
    updateMissionsDisplay();
}

// Function to remove a mission
function removeMission(missionId) {
    const index = gameState.missions.findIndex(m => m.id === missionId);
    if (index !== -1) {
        gameState.missions.splice(index, 1);
        updateMissionsDisplay();
    }
}

// Helper function to toggle missions drawer (used by UI and gamepad)
function toggleMissionsDrawer() {
    const missionsList = document.getElementById('missionsList');
    const missionsDrawerIcon = document.querySelector('#missionsDrawerBtn .drawer-icon');
    const isOpen = missionsList.style.display !== 'none';
    
    if (isOpen) {
        // Close the missions drawer
        missionsList.style.display = 'none';
        missionsDrawerIcon.textContent = '▶';
    } else {
        // Open the missions drawer
        missionsList.style.display = 'block';
        missionsDrawerIcon.textContent = '▼';
    }
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
        fuelCapacity: [180, 360, 720, 1440, 2880, 5760, 11520, 23040, 46080, 92160],
        fuelEfficiency: [200, 400, 800, 1600, 3200, 6400, 12800, 25600, 51200, 102400],
        range: [160, 320, 640, 1280, 2560, 5120, 10240, 20480, 40960, 81920],
        multiMining: [2400, 4800, 9600, 19200, 38400], // Max 6 lasers (5 upgrades from level 1)
        advancedScanner: [5000], // One-time purchase
        scanRange: [250, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000],
        scanCooldown: [200, 400, 800, 1600, 3200, 6400, 12800, 25600, 51200, 102400],
        cargoDrone: [20000] // One-time purchase
    };
    
    // Initialize master upgrades drawer toggle
    const upgradesDrawerBtn = document.getElementById('upgradesDrawerBtn');
    const upgradesDrawerContent = document.getElementById('upgradesDrawerContent');
    const upgradesDrawerIcon = upgradesDrawerBtn.querySelector('.drawer-icon');
    
    upgradesDrawerBtn.addEventListener('click', () => {
        const isOpen = upgradesDrawerContent.style.display !== 'none';
        
        if (isOpen) {
            // Close the master drawer
            upgradesDrawerContent.style.display = 'none';
            upgradesDrawerIcon.textContent = '▶';
            
            // Close all upgrade categories when drawer is closed
            document.querySelectorAll('.category-content').forEach(c => {
                c.style.display = 'none';
            });
            document.querySelectorAll('.category-icon').forEach(i => {
                i.textContent = '▶';
            });
        } else {
            // Open the master drawer
            upgradesDrawerContent.style.display = 'block';
            upgradesDrawerIcon.textContent = '▼';
        }
    });
    
    // Initialize missions drawer toggle
    const missionsDrawerBtn = document.getElementById('missionsDrawerBtn');
    const missionsList = document.getElementById('missionsList');
    const missionsDrawerIcon = missionsDrawerBtn.querySelector('.drawer-icon');
    
    missionsDrawerBtn.addEventListener('click', () => {
        toggleMissionsDrawer();
    });
    
    // Initialize collapsible upgrade categories (inside the master drawer)
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
            
            // Regular upgrades (level 1-10, except multiMining which caps at 6, cargo and fuelCapacity are infinite)
            let maxLevel;
            if (upgradeType === 'multiMining') {
                maxLevel = 6;
            } else if (upgradeType === 'cargo' || upgradeType === 'fuelCapacity') {
                maxLevel = Infinity; // Infinite upgrades for cargo and fuel capacity
            } else {
                maxLevel = 10;
            }
            
            if (level >= maxLevel) {
                logMessage(`${upgradeType.toUpperCase()} is already at maximum level.`);
                return;
            }
            
            // Calculate cost - use exponential scaling for levels beyond array
            let cost;
            if (level - 1 < upgradeCosts[upgradeType].length) {
                cost = upgradeCosts[upgradeType][level - 1];
            } else {
                // For levels beyond the array, use exponential scaling
                const lastCost = upgradeCosts[upgradeType][upgradeCosts[upgradeType].length - 1];
                const costMultiplier = 2; // Double the cost each level
                const levelsBeyond = level - upgradeCosts[upgradeType].length;
                cost = Math.floor(lastCost * Math.pow(costMultiplier, levelsBeyond));
            }
            
            if (gameState.credits >= cost) {
                gameState.credits -= cost;
                gameState.upgrades[upgradeType]++;
                
                // Apply upgrade effects (includes prestige flag)
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
            const currentBonus = gameState.prestigeBonus;
            const newBonus = currentBonus + 50;
            showConfirm(
                'PRESTIGE',
                `Prestige will reset all progress but grant permanent bonuses.\n\nCurrent Bonus: +${currentBonus}%\nNew Bonus: +${newBonus}%\n\nYou will gain +50% to all earnings permanently.\n\nContinue?`,
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
    
    document.getElementById('remoteRefuel').addEventListener('click', () => {
        // Calculate refuelling cost (2x fuel needed)
        const fuelNeeded = gameState.maxFuel - gameState.fuel;
        const refuelCost = Math.ceil(fuelNeeded * 2);
        const isFree = !gameState.firstRefuelUsed;
        
        if ((isFree || gameState.credits >= refuelCost) && !refuelTanker) {
            const costText = isFree 
                ? 'FREE (First time)' 
                : `${refuelCost} Credits (2x fuel cost)`;
            
            showConfirm(
                'REMOTE REFUELLING',
                `Request a fuel tanker to fly to your location?\n\nSERVICE FEE: ${costText}\n\nA specialized refuelling vessel will be dispatched from the nearest station to top up your tanks.`,
                () => {
                    requestRemoteRefuel();
                }
            );
        }
    });
    
    document.getElementById('nextSector').addEventListener('click', () => {
        const currentSector = gameState.sector;
        const nextSectorNum = currentSector + 1;
        const nextSectorName = `ALPHA-${String(nextSectorNum).padStart(3, '0')}`;
        
        // Calculate current and next sector map sizes
        const currentMapSize = CONFIG.baseWorldWidth + (currentSector - 1) * 250;
        const nextMapSize = CONFIG.baseWorldWidth + (nextSectorNum - 1) * 250;
        const mapSizeIncrease = nextMapSize - currentMapSize;
        
        // Calculate current sector stats
        const currentAsteroids = 30 + currentSector * 5;
        const currentHazards = Math.floor(2 + currentSector * 0.5);
        const currentUncommonChance = (currentSector - 1) * 1.5; // Uncommon increase per sector
        const currentRareChance = (currentSector - 1) * 1.2; // Rare increase per sector
        const currentSpawnRate = (currentSector - 1) * 10; // As percentage above base
        
        // Calculate next sector stats
        const nextAsteroids = 30 + nextSectorNum * 5;
        const nextHazards = Math.floor(2 + nextSectorNum * 0.5);
        const nextUncommonChance = (nextSectorNum - 1) * 1.5; // Uncommon increase per sector
        const nextRareChance = (nextSectorNum - 1) * 1.2; // Rare increase per sector
        const nextSpawnRate = (nextSectorNum - 1) * 10; // As percentage above base
        
        // Calculate mission reward multipliers
        const currentRewardMultiplier = 1.0 + (currentSector - 1) * 0.1;
        const nextRewardMultiplier = 1.0 + (nextSectorNum - 1) * 0.1;
        const rewardIncreasePercent = Math.round((nextRewardMultiplier - currentRewardMultiplier) * 100);
        
        // Calculate differences
        const asteroidIncrease = nextAsteroids - currentAsteroids;
        const hazardIncrease = nextHazards - currentHazards;
        const uncommonChanceIncrease = nextUncommonChance - currentUncommonChance;
        const rareChanceIncrease = nextRareChance - currentRareChance;
        const spawnRateIncrease = nextSpawnRate - currentSpawnRate;
        
        // Check for missing requirements
        const missingCredits = gameState.credits < 5000;
        const missingFuel = gameState.fuel < 50;
        const hasActiveMissions = gameState.missions.length > 0;
        let warningText = '';
        
        if (missingCredits || missingFuel) {
            warningText = '\n\n<b style="color: #ff0000;">INSUFFICIENT RESOURCES:</b>\n';
            if (missingCredits) {
                warningText += `<b style="color: #ff0000;">• Need ${5000 - gameState.credits} more credits</b>\n`;
            }
            if (missingFuel) {
                warningText += `<b style="color: #ff0000;">• Need ${Math.ceil(50 - gameState.fuel)} more fuel</b>\n`;
            }
        }
        
        // Add mission abandonment warning if player has active missions
        if (hasActiveMissions) {
            warningText += '\n\n<b style="color: #ff6600;">\u26A0 MISSION WARNING \u26A0</b>\n';
            warningText += `<b style="color: #ff6600;">You have ${gameState.missions.length} active mission(s)!</b>\n`;
            warningText += `<b style="color: #ff6600;">All missions will be ABANDONED if you jump sectors.</b>\n`;
            warningText += `<b style="color: #ff6600;">Return to stations to complete missions first!</b>`;
        }
        
        showConfirm(
            'JUMP TO NEXT SECTOR',
            `SECTOR JUMP ANALYSIS:\n\n` +
            `Destination: ${nextSectorName}\n` +
            `Cost: 5,000 Credits + 50 Fuel\n\n` +
            `SECTOR DIFFICULTY INCREASE:\n` +
            `• Map size: ${currentMapSize} → ${nextMapSize} (+${mapSizeIncrease})\n` +
            `• Asteroid density: ${currentAsteroids} → ${nextAsteroids} (+${asteroidIncrease})\n` +
            `• Hazard encounters: ${currentHazards} → ${nextHazards} (+${hazardIncrease})\n` +
            `• Uncommon drops: +${currentUncommonChance.toFixed(1)}% → +${nextUncommonChance.toFixed(1)}% (+${uncommonChanceIncrease.toFixed(1)}%)\n` +
            `• Rare drops: +${currentRareChance.toFixed(1)}% → +${nextRareChance.toFixed(1)}% (+${rareChanceIncrease.toFixed(1)}%)\n` +
            `• Spawn rate bonus: +${currentSpawnRate}% → +${nextSpawnRate}% (+${spawnRateIncrease}%)\n` +
            `• Mission rewards: ${currentRewardMultiplier.toFixed(1)}x → ${nextRewardMultiplier.toFixed(1)}x (+${rewardIncreasePercent}%)\n\n` +
            `WARNING: Higher sectors contain more valuable\n` +
            `resources but significantly increased danger.` +
            warningText +
            `\n\nProceed with sector jump?`,
            () => {
                // Keep game paused during warp - it will unpause when warp completes
                gameState.isPaused = true;
                jumpToNextSector();
            },
            null,
            () => gameState.fuel < 50 || gameState.credits < 5000 // Disable confirm if insufficient resources
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
    // Mark UI elements as dirty when upgrading (include prestige for button state)
    markUIDirty('upgrades', 'credits', 'cargo', 'fuel', 'hull', 'prestige');
    
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
        case 'fuelCapacity':
            const oldMaxFuel = gameState.maxFuel;
            gameState.maxFuel = 100 + (gameState.upgrades.fuelCapacity - 1) * 20;
            gameState.fuel = Math.min(gameState.fuel + (gameState.maxFuel - oldMaxFuel), gameState.maxFuel);
            logMessage(`Max fuel capacity increased to ${gameState.maxFuel}%`);
            break;
        case 'fuelEfficiency':
            const efficiencyPercent = Math.round(Math.pow(0.9, gameState.upgrades.fuelEfficiency - 1) * 100);
            logMessage(`Fuel efficiency improved to ${efficiencyPercent}% consumption`);
            break;
        case 'range':
            // Mining range is calculated dynamically in attemptMining()
            // Effect: +10 units per level
            const newRange = CONFIG.miningRange + (gameState.upgrades.range - 1) * 10;
            logMessage(`Mining range increased to ${newRange} units`);
            break;
        case 'multiMining':
            // Multi-mining allows targeting multiple asteroids
            // Effect: +1 simultaneous target per level
            const targets = gameState.upgrades.multiMining;
            logMessage(`Can now mine ${targets} asteroid${targets > 1 ? 's' : ''} simultaneously`);
            // Update the mining lasers display to show new laser slots
            updateMiningLasersDisplay();
            break;
        case 'advancedScanner':
            // Advanced scanner enables value/danger display on scans, full minimap vision, and inventory values
            logMessage('Advanced scanner installed: Scan results display values & hazards, minimap shows all objects, inventory displays ore values');
            // Force update displays to show new scanner features
            updateInventoryDisplay();
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
    gameState.prestigeBonus = gameState.prestige * 50;
    
    // Reset most stats
    gameState.credits = 0;
    gameState.sector = 1;
    gameState.sectorName = 'ALPHA-001';
    gameState.cargo = 0;
    gameState.inventory = {};
    gameState.firstRefuelUsed = false;  // Reset first refuel flag on prestige
    
    // Keep 1 level in each upgrade (except one-time purchases)
    Object.keys(gameState.upgrades).forEach(key => {
        // Reset one-time purchases (advanced scanner and cargo drone) to 0
        if (key === 'advancedScanner' || key === 'cargoDrone') {
            gameState.upgrades[key] = 0;
        } else {
            gameState.upgrades[key] = 1;
        }
    });
    
    // Clear cargo drone if it exists
    cargoDrone = null;
    
    // Clear NPC miners
    npcMiners = [];
    
    // Clear missions when performing prestige (missions are station-specific)
    if (gameState.missions.length > 0) {
        gameState.missions = [];
        updateMissionsDisplay();
    }
    
    // Clear stations before generating new sector (each prestige resets stations)
    stations = [];
    // Clear station missions (new prestige = new stations = new missions)
    gameState.stationMissions = {};
    
    // Clear mission board display
    hideMissionBoard();
    const missionBoardList = document.getElementById('missionBoardList');
    if (missionBoardList) {
        missionBoardList.innerHTML = '';
    }
    
    // Mark everything as dirty since prestige resets everything
    markUIDirty('credits', 'cargo', 'hull', 'fuel', 'inventory', 'missions', 'upgrades', 'station', 'prestige');
    
    // Reset stat values to base
    gameState.maxCargo = 100;
    gameState.maxHull = 100;
    gameState.hull = 100;
    gameState.maxFuel = 100;
    gameState.fuel = 100;
    
    // Reset world size to base values
    CONFIG.worldWidth = CONFIG.baseWorldWidth;
    CONFIG.worldHeight = CONFIG.baseWorldHeight;
    
    // Update NPC worker with reset world bounds
    if (npcWorkerReady) {
        npcWorker.postMessage({
            type: 'updateConfig',
            data: {
                worldWidth: CONFIG.worldWidth,
                worldHeight: CONFIG.worldHeight
            }
        });
    }
    
    // Reset world
    asteroids = [];
    hazards = [];
    player.x = CONFIG.worldWidth / 2;
    player.y = CONFIG.worldHeight / 2;
    
    // Re-center viewport on player
    viewport.x = player.x - (VIEWPORT_REFERENCE.WIDTH / 2) / viewport.zoom;
    viewport.y = player.y - (VIEWPORT_REFERENCE.HEIGHT / 2) / viewport.zoom;
    
    logMessage(`PRESTIGE COMPLETE! Bonus: +${gameState.prestigeBonus}% to all gains`);
    logMessage('Generating new sector with fresh stations...');
    generateSector();
    updateUI();
    updateUpgradeButtons();
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

function requestRemoteRefuel() {
    // Check if this is the first time using remote refuel
    const isFree = !gameState.firstRefuelUsed;
    
    // Calculate refuelling service cost (2x fuel needed)
    const fuelNeeded = gameState.maxFuel - gameState.fuel;
    const refuelCost = Math.ceil(fuelNeeded * 2);
    
    if (!isFree && gameState.credits < refuelCost) {
        logMessage(`Insufficient credits for remote refuelling. Need ${refuelCost}¢.`);
        return;
    }
    
    if (refuelTanker) {
        logMessage('Fuel tanker already en route.');
        return;
    }
    
    // Deduct service fee (free first time)
    if (isFree) {
        gameState.firstRefuelUsed = true;
        logMessage('Using your FREE first-time remote refuelling!');
    } else {
        gameState.credits -= refuelCost;
        markUIDirty('credits');
    }
    
    // Find nearest station to player
    const nearestStation = findNearestStation(player.x, player.y);
    
    // Create refuelling tanker at nearest station
    refuelTanker = {
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
    
    const costMessage = isFree ? 'FREE (first time)' : `${refuelCost}¢`;
    logMessage(`Fuel tanker dispatched from ${nearestStation.name} for ${costMessage}. ETA: calculating...`);
}

function updateRefuelTanker(dt = 1) {
    if (!refuelTanker) return;
    
    if (refuelTanker.state === 'flying_to_player') {
        // Fly toward player
        const dx = player.x - refuelTanker.x;
        const dy = player.y - refuelTanker.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 60) {  // Doubled from 30 to 60
            // Reached player, start refueling
            refuelTanker.state = 'refueling';
            refuelTanker.vx = 0;
            refuelTanker.vy = 0;
            logMessage('Fuel tanker arrived. Refueling in progress...');
            logMessage('Ship locked in place during refueling.');
        } else {
            // Move toward player
            refuelTanker.angle = Math.atan2(dy, dx);
            refuelTanker.vx = Math.cos(refuelTanker.angle) * refuelTanker.speed;
            refuelTanker.vy = Math.sin(refuelTanker.angle) * refuelTanker.speed;
            refuelTanker.x += refuelTanker.vx * dt;
            refuelTanker.y += refuelTanker.vy * dt;
        }
    } else if (refuelTanker.state === 'refueling') {
        // Refuel player from current position (no need to move)
        const maxFuel = gameState.maxFuel;
        const oldFuel = gameState.fuel;
        gameState.fuel = Math.min(maxFuel, gameState.fuel + refuelTanker.refuelRate * dt);
        
        // Mark fuel as dirty if it changed
        if (oldFuel !== gameState.fuel) {
            markUIDirty('fuel');
        }
        
        // Stay at current position - no movement needed
        refuelTanker.vx = 0;
        refuelTanker.vy = 0;
        
        // Point tanker toward player
        const angleToPlayer = Math.atan2(player.y - refuelTanker.y, player.x - refuelTanker.x);
        refuelTanker.angle = angleToPlayer;
        
        if (gameState.fuel >= maxFuel) {
            // Refueling complete - find nearest station NOW
            const nearestStation = findNearestStation(refuelTanker.x, refuelTanker.y);
            refuelTanker.targetStation = nearestStation;
            refuelTanker.state = 'returning_to_station';
            logMessage('Refueling complete. Tanker returning to station.');
            logMessage('Controls restored.');
        }
    } else if (refuelTanker.state === 'returning_to_station') {
        // Fly back to nearest station (determined after refueling)
        const targetStation = refuelTanker.targetStation || stations[0];
        const dx = targetStation.x - refuelTanker.x;
        const dy = targetStation.y - refuelTanker.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 20) {
            // Reached station, disappear
            const stationName = targetStation.name;
            refuelTanker = null;
            logMessage(`Fuel tanker returned to ${stationName}.`);
        } else {
            // Move toward station
            refuelTanker.angle = Math.atan2(dy, dx);
            refuelTanker.vx = Math.cos(refuelTanker.angle) * refuelTanker.speed;
            refuelTanker.vy = Math.sin(refuelTanker.angle) * refuelTanker.speed;
            refuelTanker.x += refuelTanker.vx * dt;
            refuelTanker.y += refuelTanker.vy * dt;
        }
    }
}

function jumpToNextSector() {
    // Prevent multiple jump attempts while warp is active
    if (warpState.active) {
        logMessage('Warp sequence already in progress...');
        return;
    }
    
    if (gameState.fuel < 50) {
        logMessage('Insufficient fuel for sector jump. Refuel at a station or request remote refuelling.');
        return;
    }
    
    if (gameState.credits < 5000) {
        logMessage('Insufficient credits for sector jump. Need 5,000¢');
        return;
    }
    
    // Undock from any station before warping
    stations.forEach(st => {
        if (st.isDocked) {
            st.isDocked = false;
            logMessage(`Undocking from ${st.name} for sector jump...`);
        }
    });
    
    // Hide mission board and station UI
    hideMissionBoard();
    
    // Disable navigation buttons during warp
    const nextSectorBtn = document.getElementById('nextSector');
    const autoPilotBtn = document.getElementById('returnToStation');
    const remoteRefuelBtn = document.getElementById('remoteRefuel');
    if (nextSectorBtn) nextSectorBtn.disabled = true;
    if (autoPilotBtn) autoPilotBtn.disabled = true;
    if (remoteRefuelBtn) remoteRefuelBtn.disabled = true;
    
    // Start warp animation sequence
    warpState.active = true;
    warpState.phase = 'countdown';
    warpState.startTime = Date.now();
    warpState.elapsedTime = 0;
    warpState.shipScale = 1.0;
    warpState.sectorJumped = false;
    
    // Store sector jump data for execution after animation
    warpState.nextSectorData = {
        fuel: gameState.fuel,
        credits: gameState.credits,
        sector: gameState.sector + 1,
        missionsCount: gameState.missions.length
    };
    
    logMessage('INITIATING WARP SEQUENCE...');
}

// Execute the actual sector jump after warp animation completes
function executeSectorJump() {
    if (godModeActive) {
        gameState.fuel = gameState.maxFuel;
    } else {
        gameState.fuel -= 50;
    }
    gameState.credits -= 5000;
    gameState.sector++;
    gameState.sectorName = `ALPHA-${String(gameState.sector).padStart(3, '0')}`;
    gameState.stats.sectorsVisited++;
    
    // Mark UI as dirty after sector jump
    markUIDirty('credits', 'fuel');
    
    // Increase world size by 250 per sector
    CONFIG.worldWidth = CONFIG.baseWorldWidth + (gameState.sector - 1) * 250;
    CONFIG.worldHeight = CONFIG.baseWorldHeight + (gameState.sector - 1) * 250;
    
    // Update NPC worker with new world bounds
    if (npcWorkerReady) {
        npcWorker.postMessage({
            type: 'updateConfig',
            data: {
                worldWidth: CONFIG.worldWidth,
                worldHeight: CONFIG.worldHeight
            }
        });
    }
    
    player.x = CONFIG.worldWidth / 2;
    player.y = CONFIG.worldHeight / 2;
    
    // Re-center viewport on player
    viewport.x = player.x - (VIEWPORT_REFERENCE.WIDTH / 2) / viewport.zoom;
    viewport.y = player.y - (VIEWPORT_REFERENCE.HEIGHT / 2) / viewport.zoom;
    
    // Clear missions when jumping sectors (missions are station-specific)
    if (gameState.missions.length > 0) {
        gameState.missions = [];
        updateMissionsDisplay();
    }
    
    // Clear stations before generating new sector (each sector has new stations)
    stations = [];
    // Clear station missions (new sector = new stations = new missions)
    gameState.stationMissions = {};
    
    // Clear mission board display
    hideMissionBoard();
    const missionBoardList = document.getElementById('missionBoardList');
    if (missionBoardList) {
        missionBoardList.innerHTML = '';
    }
    
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
    
    // Initialize NPC miner worker
    initNPCWorker();
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
                // Note: Asteroids and hazards are updated on main thread to preserve object references
                // asteroids = data.asteroids; // DISABLED - breaks mining references
                // hazards = data.hazards; // DISABLED - breaks scan references
                
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

function initNPCWorker() {
    try {
        // Create the worker
        npcWorker = new Worker('asteroid-miner-npc-worker.js');
        
        // Handle messages from worker
        npcWorker.onmessage = function(e) {
            const { type, data } = e.data;
            
            if (type === 'ready') {
                npcWorkerReady = true;
                console.log('NPC worker ready');
            } else if (type === 'npcUpdated') {
                // Apply updates from worker
                const { npcMiners: updatedNPCs, removedNPCs, respawnRequests, asteroidUpdates, stateChanges } = data;
                
                // Update NPC positions and velocities
                for (let i = 0; i < npcMiners.length && i < updatedNPCs.length; i++) {
                    npcMiners[i].x = updatedNPCs[i].x;
                    npcMiners[i].y = updatedNPCs[i].y;
                    npcMiners[i].vx = updatedNPCs[i].vx;
                    npcMiners[i].vy = updatedNPCs[i].vy;
                    npcMiners[i].angle = updatedNPCs[i].angle;
                    npcMiners[i].angularVelocity = updatedNPCs[i].angularVelocity || 0;
                    npcMiners[i].state = updatedNPCs[i].state;
                    npcMiners[i].cargo = updatedNPCs[i].cargo;
                    npcMiners[i].miningProgress = updatedNPCs[i].miningProgress;
                    npcMiners[i].targetAsteroidIndex = updatedNPCs[i].targetAsteroidIndex;
                    
                    // Update tracking properties
                    npcMiners[i].trackingTargetIndex = updatedNPCs[i].trackingTargetIndex;
                    npcMiners[i].trackingStartDist = updatedNPCs[i].trackingStartDist;
                    npcMiners[i].trackingStartTime = updatedNPCs[i].trackingStartTime;
                    npcMiners[i].trackingDuration = updatedNPCs[i].trackingDuration;
                    npcMiners[i].seekingTimer = updatedNPCs[i].seekingTimer;
                    
                    // Update target asteroid reference
                    if (updatedNPCs[i].targetAsteroidIndex >= 0 && updatedNPCs[i].targetAsteroidIndex < asteroids.length) {
                        npcMiners[i].targetAsteroid = asteroids[updatedNPCs[i].targetAsteroidIndex];
                    } else {
                        npcMiners[i].targetAsteroid = null;
                    }
                    
                    // Update tracking target reference
                    if (updatedNPCs[i].trackingTargetIndex >= 0 && updatedNPCs[i].trackingTargetIndex < asteroids.length) {
                        npcMiners[i].trackingTarget = asteroids[updatedNPCs[i].trackingTargetIndex];
                    } else {
                        npcMiners[i].trackingTarget = null;
                    }
                }
                
                // Apply asteroid updates (health, velocity from tractor beam)
                for (const update of asteroidUpdates) {
                    if (update.index >= 0 && update.index < asteroids.length) {
                        if (update.vx !== undefined) asteroids[update.index].vx = update.vx;
                        if (update.vy !== undefined) asteroids[update.index].vy = update.vy;
                        if (update.health !== undefined) asteroids[update.index].health = update.health;
                        if (update.destroyed !== undefined) asteroids[update.index].destroyed = update.destroyed;
                    }
                }
                
                // Handle state changes (mining, asteroid destruction, particles, etc.)
                for (const change of stateChanges) {
                    // Process NPC mining events - visual effects only, no player cargo changes
                    if (change.npcMinedAsteroid && change.asteroidIndex >= 0 && change.asteroidIndex < asteroids.length) {
                        const asteroid = asteroids[change.asteroidIndex];
                        
                        // Validate that the NPC still exists and is in a valid state
                        if (change.index < 0 || change.index >= npcMiners.length) {
                            console.warn('NPC mining event from invalid NPC index:', change.index);
                            continue;
                        }
                        
                        const miningNPC = npcMiners[change.index];
                        if (!miningNPC) {
                            console.warn('NPC mining event but NPC does not exist:', change.index);
                            continue;
                        }
                        
                        // Only process if asteroid hasn't been destroyed yet
                        if (asteroid.destroyed) {
                            console.warn('NPC tried to mine already destroyed asteroid');
                            continue;
                        }
                        
                        // Update asteroid health (already done in worker, but sync it)
                        asteroid.health = change.asteroidHealth;
                        
                        // Calculate health ratio for proportional scaling
                        const healthRatio = asteroid.health / asteroid.maxHealth;
                        
                        // Create chunk breaking effect at damaged vertices (same as player)
                        if (asteroid.geometry && asteroid.geometry.length > 0) {
                            const numChunks = 1 + Math.floor(Math.random() * 2);
                            
                            for (let chunk = 0; chunk < numChunks; chunk++) {
                                const damageIndex = Math.floor(Math.random() * asteroid.geometry.length);
                                const vertsToShrink = [damageIndex];
                                
                                if (Math.random() > 0.5) {
                                    const leftIndex = (damageIndex - 1 + asteroid.geometry.length) % asteroid.geometry.length;
                                    vertsToShrink.push(leftIndex);
                                }
                                
                                if (Math.random() > 0.5) {
                                    const rightIndex = (damageIndex + 1) % asteroid.geometry.length;
                                    vertsToShrink.push(rightIndex);
                                }
                                
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
                        
                        // Check if asteroid was destroyed
                        if (change.asteroidDestroyed) {
                            asteroid.destroyed = true;
                            gameState.stats.asteroidsDestroyed++;
                            
                            const asteroidType = ASTEROID_TYPES[asteroid.type];
                            createFloatingText(asteroid.x, asteroid.y, `DESTROYED`, asteroidType.color);
                            
                            // Large explosion particles
                            for (let i = 0; i < 20; i++) {
                                createParticle(asteroid.x, asteroid.y, asteroidType.color);
                            }
                        }
                    }
                    
                    // Legacy asteroid destruction handling (for old code paths)
                    if (change.asteroidDestroyed && !change.npcMinedAsteroid) {
                        gameState.stats.asteroidsDestroyed++;
                        
                        // Get asteroid type for particles
                        if (change.asteroidIndex >= 0 && change.asteroidIndex < asteroids.length) {
                            const asteroidType = ASTEROID_TYPES[asteroids[change.asteroidIndex].type];
                            for (let j = 0; j < 20; j++) {
                                createParticle(change.asteroidX, change.asteroidY, asteroidType.color);
                            }
                        }
                    }
                }
                
                // Note: NPCs are no longer removed when docking - they remain in array with state='docked'
                // The removedNPCs and respawnRequests arrays are kept for backward compatibility but should be empty
                
                pendingNPCUpdate = false;
            }
        };
        
        npcWorker.onerror = function(error) {
            console.error('NPC worker error:', error);
            npcWorkerReady = false;
            pendingNPCUpdate = false;
        };
        
        // Send initial config to worker
        npcWorker.postMessage({
            type: 'init',
            data: { 
                worldWidth: CONFIG.worldWidth,
                worldHeight: CONFIG.worldHeight 
            }
        });
        
        console.log('NPC worker initialized');
        
    } catch (error) {
        console.warn('Could not initialize NPC worker, using main thread:', error);
        npcWorkerReady = false;
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
    // Determine asteroid type based on rarity with sector progression
    // Each sector increases rare asteroid chances
    const sectorLevel = gameState.sector - 1;
    
    // Calculate dynamic chances based on sector
    // Common asteroids: decrease 2.5% per sector (min 25%)
    // Uncommon: increase 1.5% per sector
    // Rare: increase 1.2% per sector  
    // Epic: increase 0.8% per sector
    // Legendary: increase 0.4% per sector
    
    const adjustedChances = {};
    let totalChance = 0;
    
    for (const [key, data] of Object.entries(ASTEROID_TYPES)) {
        let chance = data.baseChance;
        
        switch(data.rarity) {
            case 'common':
                // Reduce common by 2.5% per sector, but never below 25% total for both commons
                if (key === 'common') {
                    chance = Math.max(0.20, data.baseChance - (sectorLevel * 0.020));
                } else { // copper
                    chance = Math.max(0.10, data.baseChance - (sectorLevel * 0.012));
                }
                break;
            case 'uncommon':
                // Increase uncommon by 1.5% per sector
                chance = data.baseChance + (sectorLevel * 0.015);
                break;
            case 'rare':
                // Increase rare by 1.2% per sector
                chance = data.baseChance + (sectorLevel * 0.012);
                break;
            case 'epic':
                // Increase epic by 0.8% per sector
                chance = data.baseChance + (sectorLevel * 0.008);
                break;
            case 'legendary':
                // Increase legendary by 0.4% per sector
                chance = data.baseChance + (sectorLevel * 0.004);
                break;
        }
        
        adjustedChances[key] = Math.max(0.001, chance); // Minimum 0.1% for any type
        totalChance += adjustedChances[key];
    }
    
    // Normalize probabilities to sum to 1.0
    for (const key in adjustedChances) {
        adjustedChances[key] /= totalChance;
    }
    
    // Select asteroid type using weighted random selection
    let type = 'common';
    const roll = Math.random();
    let cumulative = 0;
    
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
        id: nextHazardId++, // Unique ID for tracking through physics worker updates
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

// ================================
// DOM CACHE INITIALIZATION
// ================================

function initDOMCache() {
    // Cache all frequently accessed DOM elements
    domCache.shipName = document.getElementById('shipName');
    domCache.sectorName = document.getElementById('sectorName');
    domCache.hullDisplay = document.getElementById('hullDisplay');
    domCache.dockingStatus = document.getElementById('dockingStatus');
    domCache.creditsDisplay = document.getElementById('creditsDisplay');
    domCache.cargoDisplay = document.getElementById('cargoDisplay');
    domCache.fuelDisplay = document.getElementById('fuelDisplay');
    
    domCache.stationName = document.getElementById('stationName');
    domCache.stationStatus = document.getElementById('stationStatus');
    domCache.cargoValueCredits = document.getElementById('cargoValueCredits');
    domCache.fuelNeeded = document.getElementById('fuelNeeded');
    domCache.hullNeeded = document.getElementById('hullNeeded');
    domCache.repairTotalCost = document.getElementById('repairTotalCost');
    
    domCache.sellCargoBtn = document.getElementById('sellCargoBtn');
    domCache.refuelShipBtn = document.getElementById('refuelShipBtn');
    domCache.customizeShipBtn = document.getElementById('customizeShipBtn');
    domCache.returnToStation = document.getElementById('returnToStation');
    domCache.remoteRefuel = document.getElementById('remoteRefuel');
    domCache.prestigeBtn = document.getElementById('prestigeBtn');
    
    domCache.missionsList = document.getElementById('missionsList');
    domCache.missionCount = document.getElementById('missionCount');
    
    domCache.prestigeCount = document.getElementById('prestigeCount');
    domCache.prestigeBonus = document.getElementById('prestigeBonus');
    domCache.prestigeNextBonus = document.getElementById('prestigeNextBonus');
    
    domCache.upgradesDrawerContent = document.getElementById('upgradesDrawerContent');
    domCache.upgradesDrawerIcon = document.querySelector('#upgradesDrawerBtn .drawer-icon');
    
    domCache.consoleContent = document.getElementById('consoleContent');
    domCache.inventoryList = document.getElementById('inventoryList');
}

// ================================
// GAME INITIALIZATION
// ================================

function initGame() {
    if (gameInitialized) {
        //console.warn('Game already initialized, skipping duplicate init');
        return;
    }
    
    gameInitialized = true;
    logMessage('Initializing game systems...');
    
    // Initialize DOM cache for performance
    initDOMCache();
    
    initTheme();
    initCRT();
    initControlsHint();
    initShipRename();
    initPauseModal();
    initCustomization();
    initInput();
    initUpgrades();
    initMissions();  // Initialize mission system
    initMinimapScanner();
    initConsoleInput();
    setupTradeModalEventListeners(); // Initialize trading system
    
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
    
    // Mobile-specific: Listen for visualViewport changes to handle address bar show/hide
    // This ensures the game always fits within the visible area on mobile browsers
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => {
            if (resizeTimeout) {
                clearTimeout(resizeTimeout);
            }
            
            resizeTimeout = setTimeout(() => {
                requestAnimationFrame(() => {
                    resizeCanvas();
                });
            }, 50);
        });
    }
    
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
    
    // Mark all UI as dirty on game start
    markUIDirty('credits', 'cargo', 'hull', 'fuel', 'inventory', 'missions', 'upgrades', 'station', 'prestige');
    
    updateUI();
    updateMiningLasersDisplay(); // Initialize the laser display
    updateInventoryDisplay(); // Initialize the inventory display
    updateMissionsDisplay(); // Initialize missions display (especially important after loading from boot)
    
    // Open missions drawer by default
    const missionsList = document.getElementById('missionsList');
    const missionsDrawerIcon = document.querySelector('#missionsDrawerBtn .drawer-icon');
    if (missionsList && missionsDrawerIcon) {
        missionsList.style.display = 'block';
        missionsDrawerIcon.textContent = '▼';
    }
    
    // Check if player is docked and update mission board if needed
    const dockedStation = stations.find(s => s.isDocked);
    if (dockedStation) {
        updateMissionBoard(dockedStation.name, dockedStation.colorScheme);
    }
    
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
    
    // Update warp animation (must run even when paused)
    updateWarpAnimation(deltaTime);
    
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
    
    // Check if display time has expired
    const elapsed = Date.now() - scanState.startTime;
    if (elapsed > scanState.displayTime) {
        // Only clear detectedItems when display expires (not every frame)
        if (scanState.detectedItems.length > 0) {
            scanState.detectedItems = [];
        }
    } else if (scanState.detectedItems.length > 0) {
        // Filter out destroyed/removed items immediately for responsive scan display
        scanState.detectedItems = scanState.detectedItems.filter(item => {
            if (item.type === 'asteroid') {
                // Keep asteroid if it still exists in the array AND is not destroyed
                // Partially damaged asteroids (health > 0) should remain visible
                if (!item.object) return false; // Object reference lost
                if (item.object.destroyed) return false; // Fully destroyed
                return asteroids.includes(item.object); // Still in array
            } else if (item.type === 'hazard') {
                // Remove if hazard no longer exists in the array
                return hazards.includes(item.object);
            } else if (item.type === 'station') {
                // Remove if station no longer exists in the array
                return stations.includes(item.object);
            }
            return false;
        });
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
                        color: typeData.color,
                        rarity: typeData.rarity  // Add rarity info
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
        
        // Check stations
        for (let i = 0; i < stations.length; i++) {
            const station = stations[i];
            const dx = station.x - player.x;
            const dy = station.y - player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist > prevRadius && dist <= scanState.waveRadius && dist <= scanState.waveMaxRadius) {
                const alreadyDetected = scanState.detectedItems.some(item => 
                    item.type === 'station' && item.object === station
                );
                
                if (!alreadyDetected) {
                    const stationColors = station.colorScheme || STATION_COLORS[2];
                    scanState.detectedItems.push({
                        type: 'station',
                        object: station, // Store reference to track movement
                        name: station.name,
                        color: stationColors.primary
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
}

// ================================
// WARP ANIMATION SYSTEM
// ================================

function updateWarpAnimation(deltaTime) {
    if (!warpState.active) return;
    
    warpState.elapsedTime += deltaTime;
    
    // Calculate ship scale based on animation phase
    if (warpState.phase === 'countdown') {
        // During countdown: gradually increase size (1.0 to 1.5)
        const countdownProgress = Math.min(warpState.elapsedTime / warpState.countdownDuration, 1);
        warpState.shipScale = 1.0 + (countdownProgress * 0.25);
    } else if (warpState.phase === 'warp') {
        // During warp: rapidly shrink from 1.5 to 0.0 (disappear)
        const warpProgress = (warpState.elapsedTime - warpState.countdownDuration) / warpState.warpDuration;
        warpState.shipScale = 1.5 - (warpProgress * 1.5);
    } else if (warpState.phase === 'fadeOut') {
        // During fadeOut: keep ship invisible
        warpState.shipScale = 0;
    } else if (warpState.phase === 'blackHold') {
        // During blackHold: ship is invisible, but will be restored to normal size at the end
        const holdProgress = (warpState.elapsedTime - warpState.countdownDuration - warpState.warpDuration - warpState.fadeOutDuration) / warpState.blackHoldDuration;
        if (holdProgress >= 0.9) {
            // Near end of black screen hold - restore ship to normal size
            warpState.shipScale = 1.0;
        } else {
            warpState.shipScale = 0;
        }
    } else if (warpState.phase === 'fadeIn') {
        // During fadeIn: ship is already at normal size (1.0), just keep it there
        warpState.shipScale = 1.0;
    }
    
    // Phase transitions based on elapsed time
    if (warpState.elapsedTime < warpState.countdownDuration) {
        // PHASE 1: Countdown (0-3s)
        warpState.phase = 'countdown';
    } else if (warpState.elapsedTime < warpState.countdownDuration + warpState.warpDuration) {
        // PHASE 2: Warp effect (3-4s)
        if (warpState.phase === 'countdown') {
            // Just entered warp phase
            logMessage('WARP DRIVE ENGAGED!');
        }
        warpState.phase = 'warp';
    } else if (warpState.elapsedTime < warpState.countdownDuration + warpState.warpDuration + warpState.fadeOutDuration) {
        // PHASE 3: Fade to black (4-4.5s)
        warpState.phase = 'fadeOut';
    } else if (warpState.elapsedTime < warpState.countdownDuration + warpState.warpDuration + warpState.fadeOutDuration + warpState.blackHoldDuration) {
        // PHASE 4: Hold at black screen (4.5-5s) - execute sector jump here
        if (warpState.phase !== 'blackHold' && !warpState.sectorJumped) {
            executeSectorJump();
            warpState.sectorJumped = true;
        }
        warpState.phase = 'blackHold';
    } else if (warpState.elapsedTime < warpState.totalDuration) {
        // PHASE 5: Fade from black (5-5.5s)
        warpState.phase = 'fadeIn';
    } else {
        // Animation complete - reset ship scale
        warpState.active = false;
        warpState.phase = 'countdown';
        warpState.elapsedTime = 0;
        warpState.nextSectorData = null;
        warpState.sectorJumped = false;
        warpState.shipScale = 1.0;
        
        // Re-enable navigation buttons after warp completes
        const nextSectorBtn = document.getElementById('nextSector');
        const autoPilotBtn = document.getElementById('returnToStation');
        const remoteRefuelBtn = document.getElementById('remoteRefuel');
        if (nextSectorBtn) nextSectorBtn.disabled = false;
        if (autoPilotBtn) autoPilotBtn.disabled = false;
        if (remoteRefuelBtn) remoteRefuelBtn.disabled = false;
        
        // Unpause the game after warp completes
        gameState.isPaused = false;
        
        logMessage('Warp complete. Welcome to the new sector!');
    }
}

function renderWarpAnimation() {
    if (!warpState.active) return;
    
    const progress = warpState.elapsedTime / warpState.totalDuration;
    
    // Apply the same render scale as the main game rendering
    const renderScale = canvas.renderScale || 1;
    
    ctx.save();
    ctx.scale(renderScale, renderScale);
    
    // Calculate ship's screen position in scaled coordinates
    const scaledWidth = canvas.width / renderScale;
    const scaledHeight = canvas.height / renderScale;
    const shipScreenX = (player.x - viewport.x) * viewport.zoom;
    const shipScreenY = (player.y - viewport.y) * viewport.zoom;
    
    // Phase-specific rendering
    if (warpState.phase === 'countdown') {
        // Countdown phase (0-3s)
        const countdownProgress = warpState.elapsedTime / warpState.countdownDuration;
        const secondsRemaining = Math.ceil(3 - (warpState.elapsedTime / 1000));
        
        // Use ship's thruster color for warp effects
        const warpColor = player.colors.thruster;
        
        // Multiple pulsing rings around ship
        for (let i = 0; i < 3; i++) {
            const ringProgress = (countdownProgress + i * 0.33) % 1;
            const ringRadius = player.size * viewport.zoom * (2 + ringProgress * 8);
            const ringAlpha = (1 - ringProgress) * 0.4;
            
            ctx.globalAlpha = ringAlpha;
            ctx.strokeStyle = warpColor;
            ctx.lineWidth = 3;
            ctx.shadowBlur = 20;
            ctx.shadowColor = warpColor;
            ctx.beginPath();
            ctx.arc(shipScreenX, shipScreenY, ringRadius, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        
        // Energy particles spiraling around ship
        const particleCount = 30;
        for (let i = 0; i < particleCount; i++) {
            const angle = (i / particleCount) * Math.PI * 2 + countdownProgress * Math.PI * 4;
            const radius = player.size * viewport.zoom * (1.5 + Math.sin(countdownProgress * Math.PI * 2) * 0.5);
            const x = shipScreenX + Math.cos(angle) * radius;
            const y = shipScreenY + Math.sin(angle) * radius;
            const particleSize = 2 + Math.sin(warpState.elapsedTime * 0.02 + i) * 1;
            
            ctx.globalAlpha = 0.6 + Math.sin(warpState.elapsedTime * 0.01 + i) * 0.4;
            ctx.fillStyle = warpColor;
            ctx.shadowBlur = 10;
            ctx.shadowColor = warpColor;
            ctx.beginPath();
            ctx.arc(x, y, particleSize, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        
        // Pulsing ship glow effect
        const pulseIntensity = Math.sin(warpState.elapsedTime * 0.01) * 0.5 + 0.5;
        ctx.globalAlpha = 0.3 * pulseIntensity;
        ctx.shadowBlur = 60 * pulseIntensity;
        ctx.shadowColor = warpColor;
        ctx.beginPath();
        ctx.arc(shipScreenX, shipScreenY, player.size * viewport.zoom * 3, 0, Math.PI * 2);
        ctx.fillStyle = warpColor;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        
        // Electric arcs around ship
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 15;
        ctx.shadowColor = warpColor;
        for (let i = 0; i < 5; i++) {
            if (Math.random() > 0.7) {
                const angle = Math.random() * Math.PI * 2;
                const distance = player.size * viewport.zoom * (2 + Math.random() * 2);
                const x = shipScreenX + Math.cos(angle) * distance;
                const y = shipScreenY + Math.sin(angle) * distance;
                
                ctx.beginPath();
                ctx.moveTo(shipScreenX, shipScreenY);
                ctx.lineTo(x, y);
                ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        
        // Energy sparks flying outward
        const sparkCount = 20;
        for (let i = 0; i < sparkCount; i++) {
            const sparkLife = (countdownProgress + i / sparkCount) % 1;
            const angle = (i / sparkCount) * Math.PI * 2 + countdownProgress * Math.PI;
            const distance = sparkLife * player.size * viewport.zoom * 6;
            const x = shipScreenX + Math.cos(angle) * distance;
            const y = shipScreenY + Math.sin(angle) * distance;
            const sparkSize = (1 - sparkLife) * 3;
            
            ctx.globalAlpha = (1 - sparkLife) * 0.8;
            ctx.fillStyle = '#ffffff';
            ctx.shadowBlur = 8;
            ctx.shadowColor = warpColor;
            ctx.beginPath();
            ctx.arc(x, y, sparkSize, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        
        // Energy build-up particles converging on ship
        const convergeCount = 15;
        for (let i = 0; i < convergeCount; i++) {
            const particleProgress = (countdownProgress * 2 + i / convergeCount) % 1;
            const angle = (i / convergeCount) * Math.PI * 2;
            const startDist = player.size * viewport.zoom * 8;
            const currentDist = startDist * (1 - particleProgress);
            const x = shipScreenX + Math.cos(angle) * currentDist;
            const y = shipScreenY + Math.sin(angle) * currentDist;
            
            ctx.globalAlpha = particleProgress * 0.7;
            ctx.fillStyle = warpColor;
            ctx.shadowBlur = 12;
            ctx.shadowColor = warpColor;
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        
        // Hexagonal energy shield forming
        const hexagonRadius = player.size * viewport.zoom * (2 + countdownProgress * 1.5);
        ctx.globalAlpha = 0.3 + countdownProgress * 0.4;
        ctx.strokeStyle = warpColor;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 15;
        ctx.shadowColor = warpColor;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
            const x = shipScreenX + Math.cos(angle) * hexagonRadius;
            const y = shipScreenY + Math.sin(angle) * hexagonRadius;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        
        // Energy trails from ship corners
        const shipCorners = 4;
        for (let i = 0; i < shipCorners; i++) {
            const angle = (i / shipCorners) * Math.PI * 2 + countdownProgress * Math.PI * 0.5;
            const cornerDist = player.size * viewport.zoom * 1.2;
            const cornerX = shipScreenX + Math.cos(angle) * cornerDist;
            const cornerY = shipScreenY + Math.sin(angle) * cornerDist;
            
            // Trail segments
            for (let j = 0; j < 5; j++) {
                const trailProgress = (countdownProgress + j * 0.1) % 1;
                const trailDist = trailProgress * 50;
                const tx = cornerX + Math.cos(angle) * trailDist;
                const ty = cornerY + Math.sin(angle) * trailDist;
                
                ctx.globalAlpha = (1 - trailProgress) * 0.5;
                ctx.fillStyle = warpColor;
                ctx.beginPath();
                ctx.arc(tx, ty, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
        
        // Draw countdown number
        const numberScale = 1 + Math.sin(countdownProgress * Math.PI) * 0.2;
        ctx.font = `bold ${120 * numberScale}px "Courier New"`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = warpColor;
        ctx.shadowBlur = 30;
        ctx.shadowColor = warpColor;
        ctx.globalAlpha = 0.9;
        ctx.fillText(secondsRemaining, scaledWidth / 2, scaledHeight / 2);
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        
        // Draw "WARP DRIVE CHARGING" text
        ctx.font = 'bold 24px "Courier New"';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#00ff00';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00ff00';
        const textAlpha = 0.7 + Math.sin(warpState.elapsedTime * 0.005) * 0.3;
        ctx.globalAlpha = textAlpha;
        ctx.fillText('WARP DRIVE CHARGING...', scaledWidth / 2, scaledHeight / 2 + 100);
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        
    } else if (warpState.phase === 'warp') {
        // Warp effect phase (3-4s)
        const warpProgress = (warpState.elapsedTime - warpState.countdownDuration) / warpState.warpDuration;
        
        // Use ship's thruster color for warp effects
        const warpColor = player.colors.thruster;
        
        // Intense ship glow during warp
        ctx.globalAlpha = 0.6;
        ctx.shadowBlur = 100;
        ctx.shadowColor = warpColor;
        ctx.beginPath();
        ctx.arc(shipScreenX, shipScreenY, player.size * viewport.zoom * 4, 0, Math.PI * 2);
        ctx.fillStyle = warpColor;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        
        // Star streaking effect centered on ship
        ctx.globalAlpha = 0.8;
        
        const streakCount = 150;
        for (let i = 0; i < streakCount; i++) {
            const angle = (i / streakCount) * Math.PI * 2;
            const length = warpProgress * 600 * (0.8 + Math.random() * 0.4);
            const startDist = 50 + warpProgress * 250;
            
            const startX = shipScreenX + Math.cos(angle) * startDist;
            const startY = shipScreenY + Math.sin(angle) * startDist;
            const endX = shipScreenX + Math.cos(angle) * (startDist + length);
            const endY = shipScreenY + Math.sin(angle) * (startDist + length);
            
            // Extract RGB from warp color for gradient
            const r = parseInt(warpColor.substr(1, 2), 16);
            const g = parseInt(warpColor.substr(3, 2), 16);
            const b = parseInt(warpColor.substr(5, 2), 16);
            
            const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
            gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
            gradient.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, 0.9)`);
            gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.9)');
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            
            ctx.strokeStyle = gradient;
            ctx.lineWidth = 1.5 + Math.random();
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        
        // Extract RGB from warp color
        const r = parseInt(warpColor.substr(1, 2), 16);
        const g = parseInt(warpColor.substr(3, 2), 16);
        const b = parseInt(warpColor.substr(5, 2), 16);
        
        // Expanding energy rings
        for (let ri = 0; ri < 5; ri++) {
            const ringTime = (warpProgress + ri * 0.2) % 1;
            const radius = ringTime * 800;
            const alpha = (1 - ringTime) * 0.5;
            
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
            ctx.lineWidth = 4;
            ctx.shadowBlur = 20;
            ctx.shadowColor = warpColor;
            ctx.beginPath();
            ctx.arc(shipScreenX, shipScreenY, radius, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.shadowBlur = 0;
        
        // Tunnel vortex effect centered on ship
        for (let ri = 0; ri < 12; ri++) {
            const radius = (ri * 60) + (warpProgress * 600);
            const alpha = (1 - warpProgress) * (1 - ri / 12) * 0.6;
            const rotation = warpProgress * Math.PI * 2 * (ri % 2 === 0 ? 1 : -1);
            
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
            ctx.lineWidth = 3;
            ctx.setLineDash([10, 10]);
            ctx.lineDashOffset = -rotation * 20;
            ctx.beginPath();
            ctx.arc(shipScreenX, shipScreenY, radius, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.setLineDash([]);
        
        // Speed lines/distortion
        ctx.globalAlpha = warpProgress * 0.3;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        for (let i = 0; i < 50; i++) {
            const angle = Math.random() * Math.PI * 2;
            const startDist = Math.random() * 300;
            const endDist = startDist + 100 + warpProgress * 200;
            
            const startX = shipScreenX + Math.cos(angle) * startDist;
            const startY = shipScreenY + Math.sin(angle) * startDist;
            const endX = shipScreenX + Math.cos(angle) * endDist;
            const endY = shipScreenY + Math.sin(angle) * endDist;
            
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        
        // Radial blur effect
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = warpProgress * 0.2;
        const radialGradient = ctx.createRadialGradient(shipScreenX, shipScreenY, 0, shipScreenX, shipScreenY, 400);
        radialGradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.8)`);
        radialGradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.2)`);
        radialGradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.fillStyle = radialGradient;
        ctx.fillRect(0, 0, scaledWidth, scaledHeight);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        
        // Energy crackling around ship during warp
        const crackleCount = 40;
        for (let i = 0; i < crackleCount; i++) {
            if (Math.random() > 0.3) continue; // Random appearance
            
            const angle1 = Math.random() * Math.PI * 2;
            const angle2 = angle1 + (Math.random() - 0.5) * 0.5;
            const dist1 = (Math.random() * 0.5 + 0.5) * player.size * viewport.zoom * 2;
            const dist2 = dist1 + Math.random() * 30;
            
            const x1 = shipScreenX + Math.cos(angle1) * dist1;
            const y1 = shipScreenY + Math.sin(angle1) * dist1;
            const x2 = shipScreenX + Math.cos(angle2) * dist2;
            const y2 = shipScreenY + Math.sin(angle2) * dist2;
            
            ctx.globalAlpha = 0.4 + Math.random() * 0.4;
            ctx.strokeStyle = Math.random() > 0.5 ? warpColor : '#ffffff';
            ctx.lineWidth = 1 + Math.random() * 1.5;
            ctx.shadowBlur = 8;
            ctx.shadowColor = warpColor;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        
        // Particle explosion effect
        const explosionParticles = 60;
        for (let i = 0; i < explosionParticles; i++) {
            const particleProgress = (warpProgress + i / explosionParticles * 0.5) % 1;
            const angle = (i / explosionParticles) * Math.PI * 2;
            const speed = 1 + Math.random() * 0.5;
            const distance = particleProgress * 300 * speed;
            const x = shipScreenX + Math.cos(angle) * distance;
            const y = shipScreenY + Math.sin(angle) * distance;
            const size = (1 - particleProgress) * (2 + Math.random() * 2);
            
            ctx.globalAlpha = (1 - particleProgress) * 0.7;
            ctx.fillStyle = Math.random() > 0.7 ? '#ffffff' : warpColor;
            ctx.shadowBlur = 10;
            ctx.shadowColor = warpColor;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        
        // Geometric patterns spinning around ship
        const geometryCount = 3;
        for (let g = 0; g < geometryCount; g++) {
            const geometryProgress = (warpProgress + g * 0.33) % 1;
            const rotation = geometryProgress * Math.PI * 4 * (g % 2 === 0 ? 1 : -1);
            const radius = player.size * viewport.zoom * (3 + geometryProgress * 2);
            const sides = 3 + g;
            
            ctx.save();
            ctx.translate(shipScreenX, shipScreenY);
            ctx.rotate(rotation);
            
            ctx.globalAlpha = (1 - geometryProgress) * 0.4;
            ctx.strokeStyle = warpColor;
            ctx.lineWidth = 2;
            ctx.shadowBlur = 12;
            ctx.shadowColor = warpColor;
            
            ctx.beginPath();
            for (let i = 0; i <= sides; i++) {
                const angle = (i / sides) * Math.PI * 2;
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
            ctx.restore();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        
        // Energy discharge bolts
        const boltCount = 12;
        for (let i = 0; i < boltCount; i++) {
            const boltProgress = (warpProgress * 3 + i / boltCount) % 1;
            const angle = (i / boltCount) * Math.PI * 2 + warpProgress * Math.PI;
            const length = boltProgress * 150;
            const startDist = player.size * viewport.zoom * 2;
            
            const startX = shipScreenX + Math.cos(angle) * startDist;
            const startY = shipScreenY + Math.sin(angle) * startDist;
            const endX = startX + Math.cos(angle) * length;
            const endY = startY + Math.sin(angle) * length;
            
            ctx.globalAlpha = (1 - boltProgress) * 0.6;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.shadowBlur = 15;
            ctx.shadowColor = warpColor;
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            
            // Jagged lightning effect
            const segments = 5;
            for (let s = 1; s <= segments; s++) {
                const t = s / segments;
                const midX = startX + (endX - startX) * t;
                const midY = startY + (endY - startY) * t;
                const offset = (Math.random() - 0.5) * 20;
                const perpX = -(endY - startY) / length;
                const perpY = (endX - startX) / length;
                ctx.lineTo(midX + perpX * offset, midY + perpY * offset);
            }
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        
    } else if (warpState.phase === 'fadeOut') {
        // Fade to black (4-4.5s)
        const fadeProgress = (warpState.elapsedTime - warpState.countdownDuration - warpState.warpDuration) / warpState.fadeOutDuration;
        
        // Use ship's thruster color for warp effects
        const warpColor = player.colors.thruster;
        
        // Continue warp effect briefly during fade
        if (fadeProgress < 0.5) {
            const residualIntensity = (1 - fadeProgress * 2);
            
            // Fading streaks
            ctx.globalAlpha = 0.4 * residualIntensity;
            for (let i = 0; i < 50; i++) {
                const angle = (i / 50) * Math.PI * 2;
                const length = 400;
                const startDist = 200;
                
                const startX = shipScreenX + Math.cos(angle) * startDist;
                const startY = shipScreenY + Math.sin(angle) * startDist;
                const endX = shipScreenX + Math.cos(angle) * (startDist + length);
                const endY = shipScreenY + Math.sin(angle) * (startDist + length);
                
                ctx.strokeStyle = warpColor;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(endX, endY);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }
        
        // Black overlay fade
        ctx.fillStyle = `rgba(0, 0, 0, ${fadeProgress})`;
        ctx.fillRect(0, 0, scaledWidth, scaledHeight);
        
    } else if (warpState.phase === 'blackHold') {
        // Hold at black screen (4.5-5s)
        // Screen stays completely black while sector jump executes
        ctx.fillStyle = 'rgba(0, 0, 0, 1)';
        ctx.fillRect(0, 0, scaledWidth, scaledHeight);
        
    } else if (warpState.phase === 'fadeIn') {
        // Fade from black (5-5.5s)
        const fadeProgress = (warpState.elapsedTime - warpState.countdownDuration - warpState.warpDuration - warpState.fadeOutDuration - warpState.blackHoldDuration) / warpState.fadeInDuration;
        const alpha = 1 - fadeProgress;
        
        // Add brief flash/shimmer effect as world appears
        if (fadeProgress < 0.3) {
            const flashIntensity = (0.3 - fadeProgress) / 0.3;
            ctx.globalAlpha = flashIntensity * 0.3;
            ctx.fillStyle = '#00ffff';
            ctx.fillRect(0, 0, scaledWidth, scaledHeight);
            ctx.globalAlpha = 1;
        }
        
        ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
        ctx.fillRect(0, 0, scaledWidth, scaledHeight);
    }
    
    ctx.restore();
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
    markUIDirty('cargo', 'inventory', 'station');
    
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
            gameState.stats.creditsEarned += drone.credits;
            logMessage(`Drone returned with ${drone.credits}¢!`);
            createFloatingText(player.x, player.y - 30, `+${drone.credits}¢`, '#00ff00');
            markUIDirty('credits', 'station', 'prestige'); // Mark station and prestige dirty
            
            // Update upgrade buttons to reflect new credit balance
            updateUpgradeButtons();
            
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
                
                // Skip if object no longer exists or has been destroyed (asteroids only have destroyed property)
                if (!item.object || (item.object.destroyed && item.type !== 'station')) continue;
                
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
                
                // Use the name width to determine horizontal line length (value will be right-aligned)
                const textHorizontalOffset = 5 / viewport.zoom;
                const scaledHorizontalLength = nameWidth + textHorizontalOffset * 2; // Add padding on both sides
                
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
                
                // Scale spacing with zoom for consistency
                const textVerticalSpacing = 5 / viewport.zoom;
                const textLineSpacing = 12 / viewport.zoom;
                
                // Name above the horizontal line (left-aligned)
                ctx.textAlign = 'left';
                ctx.fillText(item.name, diagonalEndX + textHorizontalOffset, diagonalEndY - textVerticalSpacing);
                
                // Only show value/danger text if Advanced Scanner is purchased
                if (gameState.upgrades.advancedScanner >= 1) {
                    // For asteroids, show value below the line (right-aligned to end of line)
                    if (item.type === 'asteroid') {
                        ctx.textAlign = 'right';
                        ctx.fillText(`${item.value}¢`, horizontalEndX - textHorizontalOffset, diagonalEndY + textLineSpacing);
                    }
                    
                    // For hazards, show danger warning below the line (right-aligned to end of line)
                    if (item.type === 'hazard') {
                        ctx.textAlign = 'right';
                        ctx.fillText('DANGER!!', horizontalEndX - textHorizontalOffset, diagonalEndY + textLineSpacing);
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
    
    // Don't update game logic during warp (warp animation is updated in gameLoop)
    if (warpState.active) {
        return;
    }
    
    // Update frame cache for frequently accessed values (OPTIMIZATION)
    frameCache.playerX = player.x;
    frameCache.playerY = player.y;
    frameCache.playerSpeed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
    frameCache.viewportLeft = viewport.x;
    frameCache.viewportRight = viewport.x + (VIEWPORT_REFERENCE.WIDTH / viewport.zoom);
    frameCache.viewportTop = viewport.y;
    frameCache.viewportBottom = viewport.y + (VIEWPORT_REFERENCE.HEIGHT / viewport.zoom);
    frameCache.viewportCenterX = viewport.x + (VIEWPORT_REFERENCE.WIDTH / 2) / viewport.zoom;
    frameCache.viewportCenterY = viewport.y + (VIEWPORT_REFERENCE.HEIGHT / 2) / viewport.zoom;
    
    // Update scan system
    updateScan(deltaTime);
    
    // Update missions (only every 10 frames to reduce overhead)
    if (frameCount % 10 === 0 && gameState.missions.length > 0) {
        updateAllMissions();
    }
    
    // Update missions display if dirty (separate from update logic)
    if (uiDirtyFlags.missions) {
        updateMissionsDisplay();
    }
    
    // Update cargo drone
    updateCargoDrone(dt);
    
    // Update NPC proximity and interactions
    updateNPCProximityAndInteractions(dt);
    
    // Update NPC miners
    updateNPCMiners(dt);
    
    // Update station
    updateStation(dt);
    
    // Update remote refuel tanker
    updateRefuelTanker(dt);
    
    // Update player
    updatePlayer(dt);
    
    // Update asteroids on main thread (preserves object references for mining)
    updateAsteroids(dt);
    
    // Update http://127.0.0.1:5500/WebAsteroidMiner.html hazards on main thread (preserves object references for scan system)
    updateHazards(dt);
    
    // Update particles using worker if available
    if (physicsWorkerReady && !pendingPhysicsUpdate) {
        // Send to worker for parallel processing
        // Note: Asteroids and hazards are updated on main thread to preserve object references
        pendingPhysicsUpdate = true;
        physicsWorker.postMessage({
            type: 'updateAll',
            data: {
                asteroids: [], // Don't send asteroids to worker
                hazards: [], // Don't send hazards to worker (preserve references for scan)
                particles: particles,
                dt: dt
            }
        });
    } else {
        // Fallback to main thread if worker not ready or still processing
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
        const margin = 100; // Spawn margin to prevent appearing too far inside the world
        let x, y;
        
        switch(edge) {
            case 0: x = Math.random() * CONFIG.worldWidth; y = -margin; break; // Top edge
            case 1: x = CONFIG.worldWidth + margin; y = Math.random() * CONFIG.worldHeight; break; // Right edge
            case 2: x = Math.random() * CONFIG.worldWidth; y = CONFIG.worldHeight + margin; break; // Bottom edge
            case 3: x = -margin; y = Math.random() * CONFIG.worldHeight; break; // Left edge
        }
        
        spawnAsteroid(x, y);
    }
    
    // Only spawn hazards if under the limit
    if (hazards.length < maxHazards && Math.random() < CONFIG.hazardSpawnChance * sectorSpawnMultiplier * dt) {
        const edge = Math.floor(Math.random() * 4);
        const margin = 100; // Spawn margin to prevent appearing too far inside the world
        let x, y;
        
        switch(edge) {
            case 0: x = Math.random() * CONFIG.worldWidth; y = -margin; break; // Top edge
            case 1: x = CONFIG.worldWidth + margin; y = Math.random() * CONFIG.worldHeight; break; // Right edge
            case 2: x = Math.random() * CONFIG.worldWidth; y = CONFIG.worldHeight + margin; break; // Bottom edge
            case 3: x = -margin; y = Math.random() * CONFIG.worldHeight; break; // Left edge
        }
        
        spawnHazard(x, y);
    }
    
    // Update UI periodically
    if (frameCount % 10 === 0) {
        updateUI();
    }
}

function updatePlayer(dt = 1) {
    // Only lock player during flying_to_player and refueling states, NOT when fuel tanker is returning
    if (refuelTanker && (refuelTanker.state === 'flying_to_player' || refuelTanker.state === 'refueling')) {
        // Completely lock the ship in place - no movement at all
        player.vx = 0;
        player.vy = 0;
        
        // Don't change angle - keep player's current rotation
        // (Removed the "point toward fuel tanker" behavior)
        
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
                    // Apply fuel efficiency upgrade (x0.9 per level)
                    const efficiencyMultiplier = Math.pow(0.9, gameState.upgrades.fuelEfficiency - 1);
                    const fuelCost = CONFIG.baseFuelConsumption * efficiencyMultiplier * dt;
                    gameState.fuel = Math.max(0, gameState.fuel - fuelCost);
                    markUIDirty('station'); // Update station stats when fuel changes
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
                player.miningTargets = []; // Clear all mining targets and their progress
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
                // Apply fuel efficiency upgrade (x0.9 per level)
                const efficiencyMultiplier = Math.pow(0.9, gameState.upgrades.fuelEfficiency - 1);
                const fuelCost = CONFIG.baseFuelConsumption * efficiencyMultiplier * dt;
                gameState.fuel = Math.max(0, gameState.fuel - fuelCost);
                markUIDirty('station'); // Update station stats when fuel changes
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
        player.miningTargets = []; // Clear all mining targets and their progress
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
        // Check if player can afford remote refuel (2x fuel needed) or has free refuel available, or is docked
        const fuelNeeded = gameState.maxFuel - gameState.fuel;
        const refuelCost = Math.ceil(fuelNeeded * 2);
        const hasFreeRefuel = !gameState.firstRefuelUsed;
        const canAffordRefuel = gameState.credits >= refuelCost || hasFreeRefuel;
        const isDocked = isDockedAtAnyStation();
        
        // If player cannot afford refuel (and no free refuel) and is not docked, game over
        if (!canAffordRefuel && !isDocked && frameCount % 120 === 0) {
            gameOverOutOfFuel();
        } else if (frameCount % 120 === 0) {
            if (isDocked) {
                logMessage('WARNING: Out of fuel! Refuel at station.');
            } else if (canAffordRefuel) {
                const refuelMsg = hasFreeRefuel ? 'Request FREE remote refuelling!' : 'Request remote refuelling.';
                logMessage(`WARNING: Out of fuel! ${refuelMsg}`);
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
    
    // Don't process docking/undocking during warp animation
    if (warpState.active) return;
    
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
        if (dist < centerZone && !player.isManuallyControlled) {
            if (!st.isDocked) {
                st.isDocked = true;
                logMessage(`Docked with ${st.name}. Station services available.`);
                
                // Show mission board for this station
                updateMissionBoard(st.name, st.colorScheme);
                
                // Mark station and upgrades UI as dirty (upgrades need to update button states)
                markUIDirty('station', 'upgrades');
            }
            
            // When docked at this station, lock to its motion
            player.vx = st.vx;
            player.vy = st.vy;
            
            // Lock position to station center
            const lockStrength = 0.2 * dt;
            player.x += dx * lockStrength;
            player.y += dy * lockStrength;
        } else {
            if (st.isDocked) {
                st.isDocked = false;
                logMessage(`Undocked from ${st.name}.`);
                
                // Hide mission board when undocking
                hideMissionBoard();
                
                // Close upgrades drawer when undocking
                closeUpgradesDrawer();
                
                // Mark station and upgrades UI as dirty (upgrades need to update button states)
                markUIDirty('station', 'upgrades');
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
        gameState.stats.creditsEarned += totalValue;
        gameState.cargo = 0;
        gameState.inventory = {};
        
        createFloatingText(player.x, player.y - 30, `+${formatNumber(totalValue)}¢`, '#ffff00');
        logMessage(`Sold cargo for ${formatNumber(totalValue)} credits!`);
        
        // Update mission progress (for trader missions)
        updateAllMissions();
        
        // Mark UI elements as dirty (include prestige for button state)
        markUIDirty('credits', 'cargo', 'inventory', 'station', 'prestige');
        
        // Update upgrade buttons to reflect new credit balance
        updateUpgradeButtons();
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
        
        // Mark UI elements as dirty (include prestige for button state)
        markUIDirty('credits', 'fuel', 'hull', 'station', 'prestige');
        
        // Update upgrade buttons to reflect new credit balance
        updateUpgradeButtons();
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
        const fuelLevel = gameState.upgrades.fuelCapacity || 1;
        const cargoTankLength = Math.min(0.8 + cargoLevel * 0.07, 1.25);
        const fuelTankLength = Math.min(0.8 + fuelLevel * 0.07, 1.25);
        const cargoTankStartX = -cargoTankLength / 2;
        const cargoTankEndX = cargoTankLength / 2;
        const fuelTankStartX = -fuelTankLength / 2;
        const fuelTankEndX = fuelTankLength / 2;
        
        // These must match the rendering positions in renderMiningLaser()
        if (maxTargets >= 1) positions.push({ x: fuelTankEndX, y: 0.47 }); // Front fuel
        if (maxTargets >= 2) positions.push({ x: cargoTankEndX, y: -0.47 }); // Front cargo
        if (maxTargets >= 3) positions.push({ x: 0.0, y: 0.47 }); // Center fuel outer
        if (maxTargets >= 4) positions.push({ x: 0.0, y: -0.47 }); // Center cargo outer
        if (maxTargets >= 5) positions.push({ x: fuelTankStartX, y: 0.47 }); // Rear fuel
        if (maxTargets >= 6) positions.push({ x: cargoTankStartX, y: -0.47 }); // Rear cargo
        
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
        const fuelLevel = gameState.upgrades.fuelCapacity || 1;
        const cargoTankLength = Math.min(0.8 + cargoLevel * 0.07, 1.25);
        const fuelTankLength = Math.min(0.8 + fuelLevel * 0.07, 1.25);
        const tankWidth = 0.22;
        const cargoTankStartX = -cargoTankLength / 2;
        const cargoTankEndX = cargoTankLength / 2;
        const fuelTankStartX = -fuelTankLength / 2;
        const fuelTankEndX = fuelTankLength / 2;
        
        // Determine laser position based on laser index
        let laserLocalX = 0;
        let laserLocalY = 0;
        
        // Match the laser positions from renderMiningLaser
        switch (i) {
            // Laser 1: Front of fuel tank
            case 0:
                laserLocalX = fuelTankEndX;
                laserLocalY = 0.47;
                break;
            case 1:
                // Laser 2: Front of cargo tank
                laserLocalX = cargoTankEndX;
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
                laserLocalX = fuelTankStartX;
                laserLocalY = 0.47;
                break;
            case 5:
                // Laser 6: Back of cargo tank
                laserLocalX = cargoTankStartX;
                laserLocalY = -0.47;
                break;
        }
        
        // Calculate pull target: radial position outward from ship center through laser
        // Direction vector from ship center to laser (in local coordinates)
        const laserDirLength = Math.sqrt(laserLocalX * laserLocalX + laserLocalY * laserLocalY);
        const pullDistance = player.size * 0.5; // How far beyond the laser to pull asteroids
        
        // Normalized direction in local space
        const laserDirX = laserLocalX / laserDirLength;
        const laserDirY = laserLocalY / laserDirLength;
        
        // Pull target in local space (laser position + outward extension)
        const targetLocalX = (laserLocalX + laserDirX * pullDistance / player.size) * player.size;
        const targetLocalY = (laserLocalY + laserDirY * pullDistance / player.size) * player.size;
        
        // Transform to world coordinates
        const pullTargetX = player.x + Math.cos(player.angle) * targetLocalX - Math.sin(player.angle) * targetLocalY;
        const pullTargetY = player.y + Math.sin(player.angle) * targetLocalX + Math.cos(player.angle) * targetLocalY;
        
        const dx = pullTargetX - asteroid.x;
        const dy = pullTargetY - asteroid.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // ===== REFACTORED TRACTOR BEAM SYSTEM =====
        // Uses PID-like controller for reliable, smooth asteroid positioning
        // Three states: Far (strong pull) → Near (smooth approach) → Hold (locked)
        
        // Define distance thresholds
        const holdRadius = 8;      // Distance where asteroid is "locked" in place
        const approachRadius = 25; // Distance where approach behavior begins
        const maxPullSpeed = 2.5;  // Maximum speed asteroid can move while being pulled (units/frame at 60fps)
        
        // Normalized direction to target
        const dirX = dx / dist;
        const dirY = dy / dist;
        
        // Calculate current velocity magnitude and direction
        const speed = Math.sqrt(asteroid.vx * asteroid.vx + asteroid.vy * asteroid.vy);
        
        // Velocity component toward target (positive = moving toward, negative = moving away)
        const velocityTowardTarget = asteroid.vx * dirX + asteroid.vy * dirY;
        
        if (dist > holdRadius) {
            // === PULLING PHASE ===
            // Apply forces to bring asteroid to target position
            
            // Proportional force: stronger when further from target
            // Scale: 1.0 at max range, decreasing as we get closer
            const normalizedDist = Math.min(dist / miningRange, 1);
            const proportionalStrength = 0.3 + normalizedDist * 0.4; // Range: 0.3-0.7
            const proportionalForce = dirX * proportionalStrength * dt;
            const proportionalForceY = dirY * proportionalStrength * dt;
            
            // Apply proportional force
            asteroid.vx += proportionalForce;
            asteroid.vy += proportionalForceY;
            
            // Derivative damping: reduce velocity to prevent overshoot
            // Stronger damping when:
            // 1. Moving fast toward target (high velocityTowardTarget)
            // 2. Close to target (low dist)
            // 3. In approach zone (dist < approachRadius)
            
            let dampingStrength = 0.02; // Base damping (2% per frame at 60fps)
            
            if (dist < approachRadius) {
                // Increase damping dramatically in approach zone
                const approachFactor = 1 - (dist / approachRadius); // 0 at edge, 1 at center
                dampingStrength += approachFactor * 0.15; // Up to 17% damping near target
            }
            
            if (velocityTowardTarget > 0) {
                // Extra damping when moving toward target to prevent overshoot
                const velocityFactor = Math.min(velocityTowardTarget / 2, 1); // Normalized velocity
                dampingStrength += velocityFactor * 0.08; // Up to 8% extra damping
            }
            
            // Apply velocity damping (frame-rate independent)
            const dampingFactor = Math.pow(1 - dampingStrength, dt);
            asteroid.vx *= dampingFactor;
            asteroid.vy *= dampingFactor;
            
            // Speed limiter: Clamp overall velocity to prevent asteroids from moving too fast
            // This ensures smooth, controlled movement even with strong forces
            const currentSpeed = Math.sqrt(asteroid.vx * asteroid.vx + asteroid.vy * asteroid.vy);
            if (currentSpeed > maxPullSpeed) {
                const speedRatio = maxPullSpeed / currentSpeed;
                asteroid.vx *= speedRatio;
                asteroid.vy *= speedRatio;
            }
            
        } else {
            // === HOLDING PHASE ===
            // Asteroid is within hold radius - lock it in place
            
            // Apply very strong damping to kill all velocity
            const holdDampingFactor = Math.pow(0.1, dt); // 90% damping per frame
            asteroid.vx *= holdDampingFactor;
            asteroid.vy *= holdDampingFactor;
            
            // Apply gentle centering force to keep asteroid exactly at target
            // This prevents drift while mining
            const centeringStrength = 0.02 * dt;
            asteroid.vx += dirX * centeringStrength;
            asteroid.vy += dirY * centeringStrength;
            
            // Clamp velocity to prevent any significant movement while held
            const maxHoldSpeed = 0.1;
            const currentSpeed = Math.sqrt(asteroid.vx * asteroid.vx + asteroid.vy * asteroid.vy);
            if (currentSpeed > maxHoldSpeed) {
                const speedRatio = maxHoldSpeed / currentSpeed;
                asteroid.vx *= speedRatio;
                asteroid.vy *= speedRatio;
            }
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
                // Apply fuel efficiency upgrade (x0.9 per level)
                const efficiencyMultiplier = Math.pow(0.9, gameState.upgrades.fuelEfficiency - 1);
                gameState.fuel = Math.max(0, gameState.fuel - CONFIG.miningFuelCost * efficiencyMultiplier * dt);
                markUIDirty('station'); // Update station stats when fuel changes
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
    
    // Track minerals mined by type (for mineral survey missions)
    if (!gameState.stats.mineralsMined[asteroid.type]) {
        gameState.stats.mineralsMined[asteroid.type] = 0;
    }
    gameState.stats.mineralsMined[asteroid.type]++;
    
    markUIDirty('cargo', 'inventory', 'station');
    
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
    markUIDirty('hull', 'station'); // Update hull display and station stats
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
    
    logMessage('CRITICAL: Out of fuel with no credits for remote refuelling!');
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
    // IMPORTANT: Filtering changes indices, so we need to update NPC target references
    const oldAsteroids = asteroids;
    asteroids = asteroids.filter(a => !a.destroyed);
    
    // If asteroids were removed, update NPC target indices
    if (oldAsteroids.length !== asteroids.length) {
        // Create mapping of old indices to new indices
        const indexMap = new Map();
        let newIndex = 0;
        for (let oldIndex = 0; oldIndex < oldAsteroids.length; oldIndex++) {
            if (!oldAsteroids[oldIndex].destroyed) {
                indexMap.set(oldIndex, newIndex);
                newIndex++;
            }
        }
        
        // Update all NPC target asteroid indices
        for (const npc of npcMiners) {
            if (npc.targetAsteroidIndex >= 0) {
                const newIdx = indexMap.get(npc.targetAsteroidIndex);
                if (newIdx !== undefined) {
                    npc.targetAsteroidIndex = newIdx;
                    // Also update the direct reference if it exists
                    if (npc.targetAsteroid && !npc.targetAsteroid.destroyed) {
                        npc.targetAsteroid = asteroids[newIdx];
                    } else {
                        npc.targetAsteroid = null;
                        npc.targetAsteroidIndex = -1;
                    }
                } else {
                    // Old asteroid was destroyed
                    npc.targetAsteroid = null;
                    npc.targetAsteroidIndex = -1;
                }
            }
            
            // Also update tracking target index
            if (npc.trackingTargetIndex >= 0) {
                const newIdx = indexMap.get(npc.trackingTargetIndex);
                if (newIdx !== undefined) {
                    npc.trackingTargetIndex = newIdx;
                    if (npc.trackingTarget && !npc.trackingTarget.destroyed) {
                        npc.trackingTarget = asteroids[newIdx];
                    } else {
                        npc.trackingTarget = null;
                        npc.trackingTargetIndex = -1;
                    }
                } else {
                    npc.trackingTarget = null;
                    npc.trackingTargetIndex = -1;
                }
            }
        }
    }
    
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
        
        // Wrap around world with proper margin
        const margin = asteroid.radius || 50; // Use asteroid radius for proper wrapping
        
        if (asteroid.x < -margin) {
            asteroid.x = CONFIG.worldWidth + margin;
        } else if (asteroid.x > CONFIG.worldWidth + margin) {
            asteroid.x = -margin;
        }
        
        if (asteroid.y < -margin) {
            asteroid.y = CONFIG.worldHeight + margin;
        } else if (asteroid.y > CONFIG.worldHeight + margin) {
            asteroid.y = -margin;
        }
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
        
        // Wrap around world with proper margin based on hazard size
        const margin = hazard.radius || 50; // Use hazard radius for proper wrapping
        
        if (hazard.x < -margin) {
            hazard.x = CONFIG.worldWidth + margin;
        } else if (hazard.x > CONFIG.worldWidth + margin) {
            hazard.x = -margin;
        }
        
        if (hazard.y < -margin) {
            hazard.y = CONFIG.worldHeight + margin;
        } else if (hazard.y > CONFIG.worldHeight + margin) {
            hazard.y = -margin;
        }
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
    
    // Render remote refuel tanker
    if (refuelTanker) {
        renderRefuelTanker();
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
    
    // Render NPC miners
    renderNPCMiners();
    
    // Render cargo drone
    renderCargoDrone(ctx);
    
    // Render scan system (on top of everything in world space)
    renderScan();
    
    // Render floating text
    renderFloatingText();
    
    ctx.restore();
    
    // Render trade prompt (in screen space, after ctx.restore())
    if (!gameState.isPaused && tradingState.nearbyNPC && !tradingState.isTrading) {
        renderTradePrompt();
    }
    
    // Apply phosphor decay effect if CRT mode is enabled
    if (crtEnabled) {
        applyPhosphorDecay();
    }
    
    // Render minimap
    renderMinimap();
    
    // Render warp animation (always on top of everything)
    renderWarpAnimation();
    
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
    const baseDecayPerFrame = 0.06; // Reduced for longer trails
    const targetFrameTime = 16.67; // 60 FPS in milliseconds
    const decayPerSecond = (baseDecayPerFrame * 1000) / targetFrameTime;
    const timeScaledDecay = (decayPerSecond * currentDeltaTime) / 1000;
    const actualDecay = Math.min(Math.max(timeScaledDecay, 0.01), 0.99);
    
    // Use Apple-compatible rendering path for iOS/Safari devices
    // Safari has poor support for certain composite operations like 'destination-out' and 'multiply'
    if (isAppleDevice) {
        // === APPLE-COMPATIBLE CRT EFFECT ===
        // Uses only canvas drawing operations (no getImageData/putImageData to avoid rendering glitches)
        // This is faster and prevents asteroids from disappearing
        
        // First pass: Fade phosphor layer using semi-transparent black rectangle
        // This is Safari-compatible and doesn't cause rendering artifacts
        phosphorCtx.globalCompositeOperation = 'source-over';
        phosphorCtx.globalAlpha = actualDecay * 0.5;
        phosphorCtx.fillStyle = '#000000';
        phosphorCtx.fillRect(0, 0, phosphorCanvas.width, phosphorCanvas.height);
        
        // Second pass: Add current frame with screen blending (works well on iOS)
        phosphorCtx.globalCompositeOperation = 'screen';
        phosphorCtx.globalAlpha = 0.55;
        phosphorCtx.drawImage(cleanFrameCanvas, 0, 0);
        
        // Reset phosphor context
        phosphorCtx.globalCompositeOperation = 'source-over';
        phosphorCtx.globalAlpha = 1.0;
        
        // Third pass: Draw phosphor trails onto main canvas with reduced opacity
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.45;
        ctx.drawImage(phosphorCanvas, 0, 0);
        
        // Fourth pass: Subtle color boost using screen blend mode (Safari-compatible)
        // Screen mode brightens without the heavy pixel manipulation
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.12; // Very subtle brightening
        ctx.drawImage(cleanFrameCanvas, 0, 0);
        
        // Fifth pass: Slight darkening for contrast (using source-over with dark color)
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Reset composite operation
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = 'source-over';
        
    } else {
        // === STANDARD CRT EFFECT (for non-Apple devices) ===
        // Uses advanced composite operations for best visual quality
        
        // First pass: Fade the phosphor layer slowly
        phosphorCtx.globalCompositeOperation = 'destination-out';
        phosphorCtx.globalAlpha = actualDecay * 0.5; // Even slower decay for longer trails
        phosphorCtx.fillStyle = '#000000';
        phosphorCtx.fillRect(0, 0, phosphorCanvas.width, phosphorCanvas.height);
        
        // Second pass: Add CLEAN current frame to phosphor layer (not the filtered canvas)
        phosphorCtx.globalCompositeOperation = 'lighter';
        phosphorCtx.globalAlpha = 0.6; // Higher alpha for brighter trail accumulation
        phosphorCtx.drawImage(cleanFrameCanvas, 0, 0); // Use clean frame to avoid feedback loop
        
        // Third pass: Subtle darkening to prevent excessive glow (optional, reduced impact)
        phosphorCtx.globalCompositeOperation = 'multiply';
        phosphorCtx.globalAlpha = 0.04; // Very subtle darkening - reduced from 0.08
        phosphorCtx.fillStyle = '#1a1a28'; // Dark blue-grey for CRT feel
        phosphorCtx.fillRect(0, 0, phosphorCanvas.width, phosphorCanvas.height);
        
        // Fourth pass: Overlay trails onto main canvas with higher visibility
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.5; // Increased from 0.5 for more visible trails
        ctx.drawImage(phosphorCanvas, 0, 0);
        
        // Fifth pass: Boost color saturation using the CLEAN untouched frame
        ctx.globalCompositeOperation = 'overlay'; // Enhances saturation and contrast
        ctx.globalAlpha = 0.2; // Increased from 0.15 for more saturation
        ctx.drawImage(cleanFrameCanvas, 0, 0); // Use clean frame, not filtered canvas
        
        // Sixth pass: Enhance contrast by darkening with the clean frame
        ctx.globalCompositeOperation = 'multiply'; // Darkens and adds contrast
        ctx.globalAlpha = 0.15; // Reduced from 0.25 to avoid over-darkening
        ctx.drawImage(cleanFrameCanvas, 0, 0); // Use clean frame for contrast definition
        
        // Reset composite operation
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = 'source-over';
    }
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
        
        const centerX = scaledWidth / 2;
        const centerY = scaledHeight / 2;
        
        stars.forEach(star => {
            // Enhanced parallax effect: stars move in/out based on zoom level (INVERTED)
            // Zoom > 1 (zoomed in): stars appear to move inward toward center (stars recede into distance)
            // Zoom < 1 (zoomed out): stars appear to move outward from center (stars come forward)
            const zoomParallaxFactor = 1 + (viewport.zoom - 1) * star.parallaxFactor * 0.75;
            
            const scrollX = viewportCenterX * star.parallaxFactor;
            const scrollY = viewportCenterY * star.parallaxFactor;
            
            let starX = star.x - scrollX;
            let starY = star.y - scrollY;
            
            starX = ((starX % tileWidth) + tileWidth) % tileWidth;
            starY = ((starY % tileHeight) + tileHeight) % tileHeight;
            
            for (let tx = -1; tx <= 1; tx++) {
                for (let ty = -1; ty <= 1; ty++) {
                    const baseTileX = centerX - tileWidth/2 + starX + tx * tileWidth;
                    const baseTileY = centerY - tileHeight/2 + starY + ty * tileHeight;
                    
                    // Apply zoom-based parallax offset from center
                    const offsetX = (baseTileX - centerX) * zoomParallaxFactor;
                    const offsetY = (baseTileY - centerY) * zoomParallaxFactor;
                    
                    const screenX = centerX + offsetX;
                    const screenY = centerY + offsetY;
                    
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

function renderRefuelTanker() {
    if (!refuelTanker) return;
    
    // Draw refueling beam first (before ship, so it appears behind)
    if (refuelTanker.state === 'refueling') {
        ctx.save();
        
        // Animated refueling beam with enhanced particles
        const pulsePhase = (Date.now() / 100) % 1;
        const beamLength = Math.sqrt(
            Math.pow(player.x - refuelTanker.x, 2) + 
            Math.pow(player.y - refuelTanker.y, 2)
        );
        
        // Main beam - wider and more vibrant
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 4;
        ctx.globalAlpha = 0.7;
        ctx.setLineDash([8, 4]);
        ctx.lineDashOffset = -pulsePhase * 12;
        ctx.beginPath();
        ctx.moveTo(refuelTanker.x, refuelTanker.y);
        ctx.lineTo(player.x, player.y);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Secondary beam layers for depth
        ctx.strokeStyle = '#0088ff';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.moveTo(refuelTanker.x, refuelTanker.y);
        ctx.lineTo(player.x, player.y);
        ctx.stroke();
        
        // Core beam - bright white
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.moveTo(refuelTanker.x, refuelTanker.y);
        ctx.lineTo(player.x, player.y);
        ctx.stroke();
        
        // Enhanced energy particles along the beam
        const particleCount = Math.floor(beamLength / 15) + 10; // More particles for longer beams
        for (let i = 0; i < particleCount; i++) {
            const t = (pulsePhase + i / particleCount) % 1;
            const px = refuelTanker.x + (player.x - refuelTanker.x) * t;
            const py = refuelTanker.y + (player.y - refuelTanker.y) * t;
            
            // Random offset for particle wobble
            const wobblePhase = (Date.now() / 200 + i) % (Math.PI * 2);
            const wobble = Math.sin(wobblePhase) * 3;
            const angle = Math.atan2(player.y - refuelTanker.y, player.x - refuelTanker.x);
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
        
        // Fuel tanker connection point
        for (let i = 0; i < 8; i++) {
            const orbitAngle = (time + i / 8 * Math.PI * 2) % (Math.PI * 2);
            const orbitRadius = 8 + Math.sin(time * 2 + i) * 2;
            const ox = refuelTanker.x + Math.cos(orbitAngle) * orbitRadius;
            const oy = refuelTanker.y + Math.sin(orbitAngle) * orbitRadius;
            
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
        const glowGradient1 = ctx.createRadialGradient(refuelTanker.x, refuelTanker.y, 0, refuelTanker.x, refuelTanker.y, 15);
        glowGradient1.addColorStop(0, 'rgba(0, 255, 255, 0.6)');
        glowGradient1.addColorStop(1, 'rgba(0, 255, 255, 0)');
        ctx.fillStyle = glowGradient1;
        ctx.globalAlpha = 0.5 + Math.sin(time * 3) * 0.2;
        ctx.beginPath();
        ctx.arc(refuelTanker.x, refuelTanker.y, 15, 0, Math.PI * 2);
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
    ctx.translate(refuelTanker.x, refuelTanker.y);
    ctx.rotate(refuelTanker.angle);
    
    // Fuel tanker body (smaller ship, yellow/orange)
    ctx.fillStyle = '#ffaa00';
    ctx.strokeStyle = '#ffff00';
    ctx.lineWidth = 2;
    
    // Main body (triangle)
    ctx.beginPath();
    ctx.moveTo(refuelTanker.size, 0);
    ctx.lineTo(-refuelTanker.size, refuelTanker.size * 0.6);
    ctx.lineTo(-refuelTanker.size, -refuelTanker.size * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Fuel symbol (droplet)
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(4, 0);
    ctx.moveTo(0, -4);
    ctx.lineTo(0, 4);
    ctx.stroke();
    
    // Engine glow when moving
    if (refuelTanker.state !== 'refueling') {
        ctx.fillStyle = '#00ffff';
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(-refuelTanker.size, 0, 4, 0, Math.PI * 2);
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
    
    // Apply warp animation scale if active
    if (warpState.active && warpState.shipScale !== 1.0) {
        ctx.scale(warpState.shipScale, warpState.shipScale);
    }
    
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
            
            // Nacelle body (moved further back from -0.55 to -0.75)
            ctx.beginPath();
            ctx.rect(-player.size * 0.6, offset - nacelleSize / 2, player.size * 0.2, nacelleSize);
            ctx.fill();
            ctx.stroke();
            
            // Thruster port (glowing) - moved further back to match
            ctx.fillStyle = player.colors.thruster;
            ctx.beginPath();
            ctx.arc(-player.size * 0.6, offset, nacelleSize * 0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = `rgba(80, 100, 120, ${nacelleOpacity})`;
        }
    }
    
    // ===== SIDE TANKS (Cargo/Fuel Pods) - Running parallel alongside body =====
    const cargoLevel = gameState.upgrades.cargo || 1;
    const fuelLevel = gameState.upgrades.fuelCapacity || 1;
    const cargoTankLength = Math.min(0.8 + cargoLevel * 0.07, 1.25); // Grows with cargo upgrades, capped at 1.25
    const fuelTankLength = Math.min(0.8 + fuelLevel * 0.07, 1.25); // Grows with fuel capacity upgrades, capped at 1.25
    const tankWidth = player.size * 0.22; // Much wider tanks
    
    // Calculate tank start and end positions to center them at 0.0
    const cargoTankStartX = -cargoTankLength / 2;
    const cargoTankEndX = cargoTankLength / 2;
    const fuelTankStartX = -fuelTankLength / 2;
    const fuelTankEndX = fuelTankLength / 2;
    
    // Left tank is CARGO (left side of ship)
    const cargoFillPercent = gameState.cargo / gameState.maxCargo;
    const cargoFillWidth = player.size * cargoTankLength * cargoFillPercent;
    
    // Cargo fill - DRAW FIRST (behind) - fills from front to back
    // Parse accent color and create semi-transparent version
    const accentR = parseInt(player.colors.accent.substr(1, 2), 16);
    const accentG = parseInt(player.colors.accent.substr(3, 2), 16);
    const accentB = parseInt(player.colors.accent.substr(5, 2), 16);
    ctx.fillStyle = `rgba(${accentR}, ${accentG}, ${accentB}, ${0.6 + cargoLevel * 0.04})`;
    ctx.beginPath();
    ctx.rect(
        player.size * cargoTankStartX, 
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
    ctx.rect(player.size * cargoTankStartX, -player.size * 0.47, player.size * cargoTankLength, tankWidth);
    ctx.fill();
    ctx.stroke();
    
    // Right tank is FUEL (right side of ship)
    const fuelFillPercent = gameState.fuel / gameState.maxFuel;
    const fuelFillWidth = player.size * fuelTankLength * fuelFillPercent;
    
    // Fuel fill - DRAW FIRST (behind) - fills from front to back
    // Parse thruster color and create semi-transparent version
    const thrusterR = parseInt(player.colors.thruster.substr(1, 2), 16);
    const thrusterG = parseInt(player.colors.thruster.substr(3, 2), 16);
    const thrusterB = parseInt(player.colors.thruster.substr(5, 2), 16);
    ctx.fillStyle = `rgba(${thrusterR}, ${thrusterG}, ${thrusterB}, ${0.6 + fuelLevel * 0.04})`;
    ctx.beginPath();
    ctx.rect(
        player.size * fuelTankStartX,
        player.size * 0.47 - tankWidth,
        fuelFillWidth,
        tankWidth
    );
    ctx.fill();
    
    // Fuel tank outline - DRAW SECOND (on top)
    ctx.fillStyle = 'rgba(0, 50, 80, 0.3)'; // Dark background
    ctx.beginPath();
    ctx.rect(player.size * fuelTankStartX, player.size * 0.47 - tankWidth, player.size * fuelTankLength, tankWidth);
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
    
    ctx.fillStyle = player.colors.accent;
    ctx.strokeStyle = player.colors.secondary;
    ctx.lineWidth = 1;
    
    // Define laser positions on tanks (using respective tank lengths)
    const laserPositions = [];
    if (miningLasers >= 1) laserPositions.push({ x: fuelTankEndX, y: 0.47 }); // Front fuel
    if (miningLasers >= 2) laserPositions.push({ x: cargoTankEndX, y: -0.47 }); // Front cargo
    if (miningLasers >= 3) laserPositions.push({ x: 0.0, y: 0.47 /*+ (tankWidth / player.size) */}); // Center fuel outer
    if (miningLasers >= 4) laserPositions.push({ x: 0.0, y: -0.47 /*- (tankWidth / player.size) */}); // Center cargo outer
    if (miningLasers >= 5) laserPositions.push({ x: fuelTankStartX, y: 0.47 }); // Rear fuel
    if (miningLasers >= 6) laserPositions.push({ x: cargoTankStartX, y: -0.47 }); // Rear cargo
    
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
                ctx.fillText('\u26A0 FUEL AT 20%', 0, -player.size * 1.25);
                
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

function renderNPCMiners() {
    // Viewport culling
    const viewLeft = viewport.x;
    const viewRight = viewport.x + VIEWPORT_REFERENCE.WIDTH / viewport.zoom;
    const viewTop = viewport.y;
    const viewBottom = viewport.y + VIEWPORT_REFERENCE.HEIGHT / viewport.zoom;
    const cullMargin = 100;
    
    for (const npc of npcMiners) {
        // Cull NPCs outside viewport
        if (npc.x + npc.size < viewLeft - cullMargin || 
            npc.x - npc.size > viewRight + cullMargin ||
            npc.y + npc.size < viewTop - cullMargin || 
            npc.y - npc.size > viewBottom + cullMargin) {
            continue;
        }
        
        ctx.save();
        ctx.translate(npc.x, npc.y);
        ctx.rotate(npc.angle);
        
        // Show thruster if moving
        const currentSpeed = Math.sqrt(npc.vx ** 2 + npc.vy ** 2);
        if (currentSpeed > 0.1) {
            const thrusterLength = Math.min(currentSpeed * 10, npc.size * 6);
            const flicker = Math.random() * 0.3 + 0.7;
            
            const thrusterColor = `${npc.colors.thruster}${Math.floor(flicker * 204 + 51).toString(16).padStart(2, '0')}`;
            
            ctx.fillStyle = thrusterColor;
            ctx.beginPath();
            ctx.moveTo(-npc.size * 0.75, -npc.size * 0.2);
            ctx.lineTo(-npc.size * 0.75 - thrusterLength, 0);
            ctx.lineTo(-npc.size * 0.75, npc.size * 0.2);
            ctx.closePath();
            ctx.fill();
        }
        
        // Main ship body (simplified version of player ship)
        ctx.fillStyle = npc.colors.primary;
        ctx.strokeStyle = npc.colors.secondary;
        ctx.lineWidth = 1.5;
        
        // Nose
        ctx.beginPath();
        ctx.moveTo(npc.size * 0.85, 0);
        ctx.lineTo(npc.size * 0.4, -npc.size * 0.25);
        ctx.lineTo(npc.size * 0.4, npc.size * 0.25);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Body
        ctx.beginPath();
        ctx.rect(-npc.size * 0.4, -npc.size * 0.25, npc.size * 0.8, npc.size * 0.5);
        ctx.fill();
        ctx.stroke();
        
        // Rear
        ctx.beginPath();
        ctx.moveTo(-npc.size * 0.4, -npc.size * 0.25);
        ctx.lineTo(-npc.size * 0.75, -npc.size * 0.15);
        ctx.lineTo(-npc.size * 0.75, npc.size * 0.15);
        ctx.lineTo(-npc.size * 0.4, npc.size * 0.25);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Cockpit
        ctx.fillStyle = npc.colors.accent;
        ctx.beginPath();
        ctx.arc(npc.size * 0.15, 0, npc.size * 0.12, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore(); // Restore before drawing laser so it's in world space
        
        // Mining beam if mining (match player's laser visual style)
        if (npc.state === 'mining' && npc.targetAsteroid) {
            // Calculate laser origin at ship's nose (in world coordinates)
            const laserOriginX = npc.x + Math.cos(npc.angle) * npc.size * 0.85;
            const laserOriginY = npc.y + Math.sin(npc.angle) * npc.size * 0.85;
            
            // Main laser beam (60% opacity like player)
            ctx.strokeStyle = `${npc.colors.accent}99`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(laserOriginX, laserOriginY);
            ctx.lineTo(npc.targetAsteroid.x, npc.targetAsteroid.y);
            ctx.stroke();
            
            // Glow effect (30% opacity like player)
            ctx.strokeStyle = `${npc.colors.accent}4D`;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(laserOriginX, laserOriginY);
            ctx.lineTo(npc.targetAsteroid.x, npc.targetAsteroid.y);
            ctx.stroke();
        }
        
        // Visual awareness indicators
        if (npc.awarenessIndicator) {
            const elapsed = Date.now() - npc.awarenessIndicator.startTime;
            if (elapsed < npc.awarenessIndicator.duration) {
                const alpha = 1 - (elapsed / npc.awarenessIndicator.duration);
                
                if (npc.awarenessIndicator.type === 'detected') {
                    // Exclamation mark above ship
                    ctx.save();
                    ctx.fillStyle = `rgba(255, 255, 0, ${alpha})`;
                    ctx.font = 'bold 24px monospace';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    ctx.fillText('!', npc.x, npc.y - npc.size * 1.5);
                    ctx.restore();
                    
                    // Pulsing ring
                    const ringSize = npc.size * 1.5 + Math.sin(elapsed / 200) * 10;
                    ctx.strokeStyle = `rgba(255, 255, 0, ${alpha * 0.5})`;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(npc.x, npc.y, ringSize, 0, Math.PI * 2);
                    ctx.stroke();
                }
                else if (npc.awarenessIndicator.type === 'warning') {
                    // Warning symbol
                    ctx.save();
                    ctx.fillStyle = `rgba(255, 100, 0, ${alpha})`;
                    ctx.font = 'bold 28px monospace';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    ctx.fillText('!', npc.x, npc.y - npc.size * 1.5);
                    ctx.restore();
                    
                    // Red warning ring
                    const ringSize = npc.size * 1.5 + Math.sin(elapsed / 150) * 8;
                    ctx.strokeStyle = `rgba(255, 50, 0, ${alpha * 0.7})`;
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(npc.x, npc.y, ringSize, 0, Math.PI * 2);
                    ctx.stroke();
                }
            } else {
                npc.awarenessIndicator = null;
            }
        }
        
        // Display most recent message
        if (npc.messageQueue.length > 0) {
            const latestMessage = npc.messageQueue[npc.messageQueue.length - 1];
            const messageAge = Date.now() - latestMessage.timestamp;
            const messageDuration = 3000; // 3 seconds
            
            if (messageAge < messageDuration) {
                const alpha = messageAge < 500 ? messageAge / 500 : 
                             messageAge > messageDuration - 500 ? (messageDuration - messageAge) / 500 : 1;
                
                ctx.save();
                ctx.font = 'bold 14px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                
                // Background
                const textWidth = ctx.measureText(latestMessage.text).width;
                ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.7})`;
                ctx.fillRect(
                    npc.x - textWidth / 2 - 6,
                    npc.y - npc.size * 2.5 - 20,
                    textWidth + 12,
                    18
                );
                
                // Text color based on message type
                const color = latestMessage.type === 'warning' ? '255, 100, 0' :
                             latestMessage.type === 'greeting' ? '100, 255, 100' :
                             '200, 200, 255';
                ctx.fillStyle = `rgba(${color}, ${alpha})`;
                ctx.fillText(latestMessage.text, npc.x, npc.y - npc.size * 2.5);
                ctx.restore();
            }
        }
    }
}

function renderAsteroids() {
    // Viewport culling - only render visible asteroids
    // Use VIEWPORT_REFERENCE dimensions (not canvas dimensions) for consistent culling across all devices
    const viewLeft = viewport.x;
    const viewRight = viewport.x + VIEWPORT_REFERENCE.WIDTH / viewport.zoom;
    const viewTop = viewport.y;
    const viewBottom = viewport.y + VIEWPORT_REFERENCE.HEIGHT / viewport.zoom;
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
            // Use gradients for high rarity asteroids
            if (data.rarity === 'rare' || data.rarity === 'epic' || data.rarity === 'legendary') {
                const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, data.size * 1.5);
                
                // Define gradient colors based on rarity
                if (data.rarity === 'legendary') {
                    // Shimmering, multi-color gradients for legendary
                    if (asteroid.type === 'crystal') {
                        gradient.addColorStop(0, '#ffffff');
                        gradient.addColorStop(0.3, '#ff00ff');
                        gradient.addColorStop(0.6, '#ff00aa');
                        gradient.addColorStop(1, '#8800ff');
                    } else if (asteroid.type === 'nebulite') {
                        gradient.addColorStop(0, '#ffffff');
                        gradient.addColorStop(0.3, '#00ffff');
                        gradient.addColorStop(0.6, '#0088ff');
                        gradient.addColorStop(1, '#0044aa');
                    } else if (asteroid.type === 'darkMatter') {
                        gradient.addColorStop(0, '#aa88ff');
                        gradient.addColorStop(0.3, '#6600ff');
                        gradient.addColorStop(0.6, '#4400aa');
                        gradient.addColorStop(1, '#220055');
                    }
                } else if (data.rarity === 'epic') {
                    // Rich gradients for epic
                    if (asteroid.type === 'ruby') {
                        gradient.addColorStop(0, '#ff88aa');
                        gradient.addColorStop(0.5, '#ff0066');
                        gradient.addColorStop(1, '#aa0044');
                    } else if (asteroid.type === 'sapphire') {
                        gradient.addColorStop(0, '#6699ff');
                        gradient.addColorStop(0.5, '#0066ff');
                        gradient.addColorStop(1, '#0044aa');
                    } else if (asteroid.type === 'obsidian') {
                        gradient.addColorStop(0, '#4d0066');
                        gradient.addColorStop(0.5, '#1a0033');
                        gradient.addColorStop(1, '#000000');
                    }
                } else if (data.rarity === 'rare') {
                    // Subtle gradients for rare
                    if (asteroid.type === 'gold') {
                        gradient.addColorStop(0, '#ffffaa');
                        gradient.addColorStop(0.5, '#ffdd00');
                        gradient.addColorStop(1, '#cc9900');
                    } else if (asteroid.type === 'emerald') {
                        gradient.addColorStop(0, '#88ffcc');
                        gradient.addColorStop(0.5, '#00ff88');
                        gradient.addColorStop(1, '#00aa55');
                    } else if (asteroid.type === 'platinum') {
                        gradient.addColorStop(0, '#ffffff');
                        gradient.addColorStop(0.5, '#aaffff');
                        gradient.addColorStop(1, '#66cccc');
                    }
                }
                
                ctx.fillStyle = gradient;
                ctx.strokeStyle = data.color;
            } else {
                ctx.fillStyle = data.color;
                ctx.strokeStyle = data.color;
            }
            
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
        
        // Draw laser glow outline if this asteroid is being mined
        const miningTarget = player.miningTargets.find(mt => mt.asteroid === asteroid);
        const npcMiningThis = npcMiners.find(npc => npc.targetAsteroid === asteroid && npc.state === 'mining');
        
        if (miningTarget) {
            // Use the player's laser color (accent color) for the glow
            const laserColor = player.colors.accent;
            
            // Parse the laser color for gradient
            const r = parseInt(laserColor.substr(1, 2), 16);
            const g = parseInt(laserColor.substr(3, 2), 16);
            const b = parseInt(laserColor.substr(5, 2), 16);
            
            // Draw multiple layers for glowing effect
            // Outer glow (largest, most transparent)
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.15)`;
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.moveTo(asteroid.geometry[0].x, asteroid.geometry[0].y);
            const geomLen = asteroid.geometry.length;
            for (let j = 1; j < geomLen; j++) {
                ctx.lineTo(asteroid.geometry[j].x, asteroid.geometry[j].y);
            }
            ctx.closePath();
            ctx.stroke();
            
            // Middle glow
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.3)`;
            ctx.lineWidth = 5;
            ctx.stroke();
            
            // Inner glow (brightest)
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.6)`;
            ctx.lineWidth = 2;
            ctx.stroke();
        } else if (npcMiningThis) {
            // Use the NPC's laser color (accent color) for the glow
            const laserColor = npcMiningThis.colors.accent;
            
            // Parse the laser color for gradient
            const r = parseInt(laserColor.substr(1, 2), 16);
            const g = parseInt(laserColor.substr(3, 2), 16);
            const b = parseInt(laserColor.substr(5, 2), 16);
            
            // Draw multiple layers for glowing effect
            // Outer glow (largest, most transparent)
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.15)`;
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.moveTo(asteroid.geometry[0].x, asteroid.geometry[0].y);
            const geomLen = asteroid.geometry.length;
            for (let j = 1; j < geomLen; j++) {
                ctx.lineTo(asteroid.geometry[j].x, asteroid.geometry[j].y);
            }
            ctx.closePath();
            ctx.stroke();
            
            // Middle glow
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.3)`;
            ctx.lineWidth = 5;
            ctx.stroke();
            
            // Inner glow (brightest)
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.6)`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        
        ctx.restore();
        
        // Draw mining progress bar if this asteroid is being mined
        let showProgressBar = false;
        let progress = 0;
        let barColor = '#ffff00';
        
        // Check if player is mining this asteroid
        if (miningTarget) {
            const miningSpeed = CONFIG.baseMiningSpeed * (1 - (gameState.upgrades.mining - 1) * 0.1);
            progress = miningTarget.progress / miningSpeed;
            showProgressBar = true;
            barColor = '#ffff00'; // Yellow for player
        } else {
            // Check if any NPC is mining this asteroid
            for (let npc of npcMiners) {
                if (npc.state === 'mining' && npc.targetAsteroid === asteroid) {
                    progress = npc.miningProgress / npc.miningSpeed;
                    showProgressBar = true;
                    barColor = '#00ffff'; // Cyan for NPCs
                    break;
                }
            }
        }
        
        if (showProgressBar) {
            // Draw progress bar above the asteroid
            const barWidth = 40;
            const barHeight = 6;
            const barX = asteroid.x - barWidth / 2;
            const barY = asteroid.y - data.size - 15;
            
            // Background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(barX, barY, barWidth, barHeight);
            
            // Progress fill
            ctx.fillStyle = barColor;
            ctx.fillRect(barX, barY, barWidth * progress, barHeight);
            
            // Border
            ctx.strokeStyle = barColor;
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, barY, barWidth, barHeight);
        }
    }
}

function renderHazards() {
    // Viewport culling - use VIEWPORT_REFERENCE for consistent culling across all devices
    const viewLeft = viewport.x;
    const viewRight = viewport.x + VIEWPORT_REFERENCE.WIDTH / viewport.zoom;
    const viewTop = viewport.y;
    const viewBottom = viewport.y + VIEWPORT_REFERENCE.HEIGHT / viewport.zoom;
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
    // Optimized with for loop and viewport culling - use VIEWPORT_REFERENCE for consistency
    const viewLeft = viewport.x - 50;
    const viewRight = viewport.x + VIEWPORT_REFERENCE.WIDTH / viewport.zoom + 50;
    const viewTop = viewport.y - 50;
    const viewBottom = viewport.y + VIEWPORT_REFERENCE.HEIGHT / viewport.zoom + 50;
    
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
    const fuelLevel = gameState.upgrades.fuelCapacity || 1;
    const cargoTankLength = Math.min(0.8 + cargoLevel * 0.07, 1.25);
    const fuelTankLength = Math.min(0.8 + fuelLevel * 0.07, 1.25);
    const cargoTankStartX = -cargoTankLength / 2;
    const cargoTankEndX = cargoTankLength / 2;
    const fuelTankStartX = -fuelTankLength / 2;
    const fuelTankEndX = fuelTankLength / 2;
    
    // Define laser positions in ship-local coordinates (before rotation)
    const laserLocalPositions = [];
    
    if (miningLasers >= 1) {
        // Laser 1: Front of fuel tank (bottom-front)
        laserLocalPositions.push({ x: fuelTankEndX, y: 0.47 });
    }
    if (miningLasers >= 2) {
        // Laser 2: Front of cargo tank (top-front)
        laserLocalPositions.push({ x: cargoTankEndX, y: -0.47 });
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
        laserLocalPositions.push({ x: fuelTankStartX, y: 0.47 });
    }
    if (miningLasers >= 6) {
        // Laser 6: Back of cargo tank (top-rear)
        laserLocalPositions.push({ x: cargoTankStartX, y: -0.47 });
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

function renderTradePrompt() {
    const npc = tradingState.nearbyNPC;
    if (!npc) return;
    
    // Calculate distance for pulsing effect
    const dx = player.x - npc.x;
    const dy = player.y - npc.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Pulse effect based on time
    const pulse = Math.sin(Date.now() / 300) * 0.15 + 0.85;
    
    // Position at bottom center of screen
    const x = canvas.width / 2;
    const y = canvas.height - 80;
    
    ctx.save();
    ctx.globalAlpha = pulse;
    
    // Determine prompt text based on input method
    let promptText = '';
    let keyDisplay = '';
    
    if (lastInputMethod === 'touch') {
        // For touch, we'll create a clickable button instead of just text
        ctx.globalAlpha = 1.0; // Full opacity for button
        
        // Button dimensions
        const buttonWidth = 240;
        const buttonHeight = 60;
        const buttonX = x - buttonWidth / 2;
        const buttonY = y - buttonHeight / 2;
        
        // Store button bounds for click detection
        if (!window.tradeButtonBounds) {
            window.tradeButtonBounds = {};
        }
        window.tradeButtonBounds = {
            x: buttonX,
            y: buttonY,
            width: buttonWidth,
            height: buttonHeight
        };
        
        // Retro terminal background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);
        
        // Animated double border
        const borderPulse = Math.sin(Date.now() / 200) * 0.3 + 0.7;
        ctx.strokeStyle = `rgba(0, 255, 0, ${borderPulse})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(buttonX, buttonY, buttonWidth, buttonHeight);
        
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(buttonX + 4, buttonY + 4, buttonWidth - 8, buttonHeight - 8);
        
        // Corner brackets
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        const cornerLen = 10;
        // Top-left
        ctx.beginPath();
        ctx.moveTo(buttonX + cornerLen, buttonY);
        ctx.lineTo(buttonX, buttonY);
        ctx.lineTo(buttonX, buttonY + cornerLen);
        ctx.stroke();
        // Top-right
        ctx.beginPath();
        ctx.moveTo(buttonX + buttonWidth - cornerLen, buttonY);
        ctx.lineTo(buttonX + buttonWidth, buttonY);
        ctx.lineTo(buttonX + buttonWidth, buttonY + cornerLen);
        ctx.stroke();
        // Bottom-left
        ctx.beginPath();
        ctx.moveTo(buttonX, buttonY + buttonHeight - cornerLen);
        ctx.lineTo(buttonX, buttonY + buttonHeight);
        ctx.lineTo(buttonX + cornerLen, buttonY + buttonHeight);
        ctx.stroke();
        // Bottom-right
        ctx.beginPath();
        ctx.moveTo(buttonX + buttonWidth, buttonY + buttonHeight - cornerLen);
        ctx.lineTo(buttonX + buttonWidth, buttonY + buttonHeight);
        ctx.lineTo(buttonX + buttonWidth - cornerLen, buttonY + buttonHeight);
        ctx.stroke();
        
        // Button text with scanline effect
        ctx.fillStyle = '#00ff00';
        ctx.font = 'bold 16px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#00ff00';
        ctx.shadowBlur = 8;
        ctx.fillText('[ TAP TO TRADE ]', x, y - 6);
        
        // NPC name below
        ctx.font = '12px "Courier New", monospace';
        ctx.fillStyle = '#007700';
        ctx.shadowBlur = 4;
        ctx.fillText(`> ${npc.name.toUpperCase()} <`, x, y + 10);
        
        ctx.restore();
        return;
    } else if (lastInputMethod === 'gamepad') {
        keyDisplay = 'Y/△';
        promptText = `TRADE: ${npc.name.toUpperCase()}`;
    } else { // keyboard
        keyDisplay = 'T';
        promptText = `TRADE: ${npc.name.toUpperCase()}`;
    }
    
    // Retro terminal HUD-style background
    ctx.font = 'bold 14px "Courier New", monospace';
    const textWidth = ctx.measureText(promptText).width;
    const padding = 16;
    const keyBoxSize = 36;
    const totalWidth = keyBoxSize + padding + textWidth + padding * 2;
    const boxHeight = 54;
    const boxX = x - totalWidth / 2;
    const boxY = y - boxHeight / 2;
    
    // Solid black background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(boxX, boxY, totalWidth, boxHeight);
    
    // Double border effect
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, totalWidth, boxHeight);
    
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX + 3, boxY + 3, totalWidth - 6, boxHeight - 6);
    
    // Retro corner brackets
    const cornerSize = 10;
    const accentAlpha = Math.sin(Date.now() / 200) * 0.3 + 0.7;
    ctx.strokeStyle = `rgba(0, 255, 0, ${accentAlpha})`;
    ctx.lineWidth = 2;
    
    // Top-left corner
    ctx.beginPath();
    ctx.moveTo(boxX, boxY + cornerSize);
    ctx.lineTo(boxX, boxY);
    ctx.lineTo(boxX + cornerSize, boxY);
    ctx.stroke();
    
    // Top-right corner
    ctx.beginPath();
    ctx.moveTo(boxX + totalWidth - cornerSize, boxY);
    ctx.lineTo(boxX + totalWidth, boxY);
    ctx.lineTo(boxX + totalWidth, boxY + cornerSize);
    ctx.stroke();
    
    // Bottom-left corner
    ctx.beginPath();
    ctx.moveTo(boxX, boxY + boxHeight - cornerSize);
    ctx.lineTo(boxX, boxY + boxHeight);
    ctx.lineTo(boxX + cornerSize, boxY + boxHeight);
    ctx.stroke();
    
    // Bottom-right corner
    ctx.beginPath();
    ctx.moveTo(boxX + totalWidth - cornerSize, boxY + boxHeight);
    ctx.lineTo(boxX + totalWidth, boxY + boxHeight);
    ctx.lineTo(boxX + totalWidth, boxY + boxHeight - cornerSize);
    ctx.stroke();
    
    // Key button background (terminal style)
    const keyBoxX = boxX + padding;
    const keyBoxY = boxY + (boxHeight - keyBoxSize) / 2;
    
    ctx.fillStyle = 'rgba(0, 100, 0, 0.3)';
    ctx.fillRect(keyBoxX, keyBoxY, keyBoxSize, keyBoxSize);
    
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.strokeRect(keyBoxX, keyBoxY, keyBoxSize, keyBoxSize);
    
    // Inner border for depth
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(keyBoxX + 2, keyBoxY + 2, keyBoxSize - 4, keyBoxSize - 4);
    
    // Key text with glow
    ctx.fillStyle = '#00ff00';
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#00ff00';
    ctx.shadowBlur = 6;
    ctx.fillText(keyDisplay, keyBoxX + keyBoxSize / 2, keyBoxY + keyBoxSize / 2);
    
    // Prompt text with glow
    ctx.font = 'bold 14px "Courier New", monospace';
    ctx.fillStyle = '#00ff00';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 4;
    ctx.fillText(promptText, keyBoxX + keyBoxSize + padding / 2, y);
    
    ctx.restore();
}

function renderMinimap() {
    const scale = minimapCanvas.width / CONFIG.worldWidth;
    
    minimapCtx.fillStyle = '#000000';
    minimapCtx.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);
    
    minimapCtx.strokeStyle = '#00ff00';
    minimapCtx.strokeRect(0, 0, minimapCanvas.width, minimapCanvas.height);
    
    // Check if advanced scanner is purchased (shows all asteroids/hazards)
    const hasAdvancedScanner = gameState.upgrades.advancedScanner >= 1;
    
    // Calculate viewport boundaries if scanner not purchased
    let viewportLeft, viewportRight, viewportTop, viewportBottom;
    if (!hasAdvancedScanner) {
        const viewportWidth = VIEWPORT_REFERENCE.WIDTH / viewport.zoom;
        const viewportHeight = VIEWPORT_REFERENCE.HEIGHT / viewport.zoom;
        viewportLeft = viewport.x;
        viewportRight = viewport.x + viewportWidth;
        viewportTop = viewport.y;
        viewportBottom = viewport.y + viewportHeight;
    }
    
    // Draw asteroids (only in viewport unless advanced scanner purchased)
    asteroids.forEach(asteroid => {
        // Skip if not in viewport and scanner not purchased
        if (!hasAdvancedScanner) {
            if (asteroid.x < viewportLeft || asteroid.x > viewportRight ||
                asteroid.y < viewportTop || asteroid.y > viewportBottom) {
                return;
            }
        }
        
        const data = ASTEROID_TYPES[asteroid.type];
        minimapCtx.fillStyle = data.color;
        minimapCtx.fillRect(
            asteroid.x * scale - 1,
            asteroid.y * scale - 1,
            2, 2
        );
    });
    
    // Draw hazards (only in viewport unless advanced scanner purchased)
    hazards.forEach(hazard => {
        // Skip if not in viewport and scanner not purchased
        if (!hasAdvancedScanner) {
            if (hazard.x < viewportLeft || hazard.x > viewportRight ||
                hazard.y < viewportTop || hazard.y > viewportBottom) {
                return;
            }
        }
        
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
    // Left panel - use cached DOM elements
    // Only update ship name if not currently editing it
    if (!isEditingShipName) {
        domCache.shipName.textContent = shipName;
    }
    domCache.sectorName.textContent = gameState.sectorName;
    
    // Only update hull if it changed (check dirty flag or every frame for smooth animation)
    if (uiDirtyFlags.hull || frameCount % 2 === 0) {
        domCache.hullDisplay.textContent = `${Math.ceil(gameState.hull)}%`;
        uiDirtyFlags.hull = false;
    }
    
    // Docking status - only update when station state changes
    if (uiDirtyFlags.station) {
        if (isDockedAtAnyStation()) {
            domCache.dockingStatus.textContent = 'DOCKED';
            domCache.dockingStatus.style.color = '#00ff00';
        } else {
            domCache.dockingStatus.textContent = 'FLYING';
            domCache.dockingStatus.style.color = '#888888';
        }
    }
    
    // Credits - only update when dirty
    if (uiDirtyFlags.credits) {
        domCache.creditsDisplay.textContent = formatNumber(gameState.credits);
        uiDirtyFlags.credits = false;
    }
    
    // Cargo - only update when dirty
    if (uiDirtyFlags.cargo) {
        domCache.cargoDisplay.textContent = `${gameState.cargo} / ${gameState.maxCargo}`;
        uiDirtyFlags.cargo = false;
    }
    
    // Fuel display with warning at 15% - update every frame for smooth animation
    if (uiDirtyFlags.fuel || frameCount % 5 === 0) {
        const currentFuel = Math.ceil(gameState.fuel);
        const maxFuel = Math.ceil(gameState.maxFuel);
        const fuelPercentage = (gameState.fuel / gameState.maxFuel) * 100;
        
        domCache.fuelDisplay.textContent = `${currentFuel} / ${maxFuel}`;
        
        // Add blinking red warning when fuel is at or below 15%
        if (fuelPercentage <= 15) {
            domCache.fuelDisplay.style.animation = 'blinkRed 1s steps(2) infinite';
        } else {
            domCache.fuelDisplay.style.animation = '';
        }
        uiDirtyFlags.fuel = false;
    }
    
    // Inventory - only update when dirty
    if (uiDirtyFlags.inventory) {
        updateInventoryDisplay();
        uiDirtyFlags.inventory = false;
    }
    
    // Mining Lasers Display - update when actively mining OR when mining state changes
    if (player.isMining || wasMining !== player.isMining) {
        updateMiningLasersDisplay();
        wasMining = player.isMining;
    }
    
    // Scan System Display
    updateScanDisplay();
    
    // Upgrades - only update when dirty
    if (uiDirtyFlags.upgrades) {
        updateUpgradeButtons();
        uiDirtyFlags.upgrades = false;
    }
    
    // Navigation buttons - update less frequently
    if (frameCount % 30 === 0) {
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
        
        domCache.returnToStation.disabled = withinStationRange;
        
        // Remote Refuel button - cost is 2x fuel needed (free first time)
        const fuelNeededForRefuel = gameState.maxFuel - gameState.fuel;
        const refuelCost = Math.ceil(fuelNeededForRefuel * 2);
        const isFreeRefuel = !gameState.firstRefuelUsed;
        
        // Button is enabled if: (free first time OR have enough credits) AND not already active AND need fuel AND not at station
        const canUseRefuel = isFreeRefuel || gameState.credits >= refuelCost;
        const needsFuel = fuelNeededForRefuel > 0;
        domCache.remoteRefuel.disabled = !canUseRefuel || refuelTanker !== null || !needsFuel || gameState.isAtStation;
        
        const refuelButtonText = isFreeRefuel 
            ? `REMOTE REFUEL - FREE` 
            : `REMOTE REFUEL - ${refuelCost} CR`;
        domCache.remoteRefuel.querySelector('.btn-text').textContent = refuelButtonText;
        
        // Flash the button if fuel is critically low (<15%) and button is enabled
        const fuelPercentage = (gameState.fuel / gameState.maxFuel) * 100;
        const isCriticallyLow = fuelPercentage < 15;
        if (isCriticallyLow && !domCache.remoteRefuel.disabled) {
            domCache.remoteRefuel.classList.add('flash-warning');
        } else {
            domCache.remoteRefuel.classList.remove('flash-warning');
        }
    }
    
    // Station interface - only update when dirty
    if (uiDirtyFlags.station) {
        updateStationInterface();
        uiDirtyFlags.station = false;
    }
    
    // Prestige - only update when dirty
    if (uiDirtyFlags.prestige) {
        domCache.prestigeCount.textContent = gameState.prestige;
        domCache.prestigeBonus.textContent = `+${gameState.prestigeBonus}%`;
        const nextBonus = gameState.prestigeBonus + 50;
        domCache.prestigeNextBonus.textContent = `+${nextBonus}%`;
        domCache.prestigeBtn.disabled = gameState.credits < 50000;
        uiDirtyFlags.prestige = false;
    }
}

function updateStationInterface() {
    // Find the docked station (if any)
    const dockedStation = stations.find(st => st.isDocked);
    
    if (dockedStation) {
        domCache.stationName.textContent = dockedStation.name.toUpperCase();
        domCache.stationStatus.textContent = 'DOCKING BAY ACTIVE';
        domCache.stationStatus.style.color = '#00ff00';
    } else {
        domCache.stationName.textContent = '---------';
        domCache.stationStatus.textContent = 'NOT DOCKED';
        domCache.stationStatus.style.color = '#888888';
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
    
    domCache.cargoValueCredits.textContent = `${formatNumber(cargoValue)}¢`;
    
    const fuelNeeded = gameState.maxFuel - gameState.fuel;
    const hullNeeded = gameState.maxHull - gameState.hull;
    
    // Calculate costs (1 credit per fuel, 2 credits per hull)
    const fuelCost = Math.ceil(fuelNeeded * 1);
    const hullCost = Math.ceil(hullNeeded * 2);
    
    // Display fuel needed with cost (as percentage of max)
    if (fuelNeeded > 0) {
        const fuelNeededPercent = Math.ceil((fuelNeeded / gameState.maxFuel) * 100);
        domCache.fuelNeeded.textContent = `${fuelNeededPercent}% (${fuelCost}¢)`;
    } else {
        domCache.fuelNeeded.textContent = `0%`;
    }
    
    // Display hull repairs with cost (as percentage of max)
    if (hullNeeded > 0) {
        const hullNeededPercent = Math.ceil((hullNeeded / gameState.maxHull) * 100);
        domCache.hullNeeded.textContent = `${hullNeededPercent}% (${hullCost}¢)`;
    } else {
        domCache.hullNeeded.textContent = `0%`;
    }
    
    // Display total repair cost (fuel + hull)
    const totalCost = fuelCost + hullCost;
    domCache.repairTotalCost.textContent = `${formatNumber(totalCost)}¢`;
    
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
    
    // Use shorter labels and bars on small screens
    const isSmallScreen = window.innerWidth <= 768;
    const laserLabel = isSmallScreen ? 'LSR' : 'LASER';
    const barLength = isSmallScreen ? 17 : 20; // Shorter bar for small screens
    
    // Show all available laser slots
    for (let i = 0; i < maxLasers; i++) {
        const target = player.miningTargets && player.miningTargets[i];
        
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
            <span class="stat-label">${laserLabel} ${i + 1}:</span>
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
    const inventoryList = domCache.inventoryList;
    if (!inventoryList) return;
    
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
        const hasAdvancedScanner = gameState.upgrades.advancedScanner >= 1;
        
        Object.entries(gameState.inventory).forEach(([type, count]) => {
            const asteroidType = ASTEROID_TYPES[type];
            if (asteroidType && count > 0) {
                const item = document.createElement('div');
                item.className = 'inventory-item';
                
                // Show value only if advanced scanner is purchased
                const valueDisplay = hasAdvancedScanner 
                    ? `${asteroidType.value}¢ ×${count}` 
                    : `×${count}`;
                
                item.innerHTML = `
                    <span class="item-icon" style="color: ${asteroidType.color}">${asteroidType.icon}</span>
                    <span class="item-text">${asteroidType.name}</span>
                    <span class="item-count">${valueDisplay}</span>
                `;
                inventoryList.appendChild(item);
            }
        });
    }
}

function updateMissionsDisplay() {
    // Only update if dirty flag is set
    if (!uiDirtyFlags.missions) return;
    
    // Update mission count - show total missions including completed ones
    domCache.missionCount.textContent = `(${gameState.missions.length})`;
    
    // Clear current display
    domCache.missionsList.innerHTML = '';
    
    if (gameState.missions.length === 0) {
        const emptyItem = document.createElement('div');
        emptyItem.className = 'mission-item empty';
        emptyItem.innerHTML = `
            <span class="item-icon">⊗</span>
            <span class="item-text">NO ACTIVE MISSIONS</span>
        `;
        domCache.missionsList.appendChild(emptyItem);
    } else {
        gameState.missions.forEach(mission => {
            const item = document.createElement('div');
            item.className = `mission-item ${mission.status}`;
            
            // Calculate progress percentage
            const progressPercent = Math.min(100, (mission.current / mission.target) * 100);
            
            // Status display
            let statusText = '';
            if (mission.status === 'completed') {
                statusText = '<span style="color: #00ff00;">✓ COMPLETED - DOCK AT STATION TO CLAIM</span>';
            } else if (mission.status === 'failed') {
                statusText = '<span style="color: #ff0000;">✗ FAILED</span>';
            } else {
                statusText = '<span style="color: #ffaa00;">◉ IN PROGRESS</span>';
            }
            
            // Station name with color (use primary color from colorScheme)
            const stationNameHtml = mission.stationName ? 
                `<div class="mission-station-name" style="color: ${mission.stationColor?.primary || mission.stationColor};">FROM: ${mission.stationName}</div>` : '';
            
            // Time remaining for speed missions
            let timeRemainingHtml = '';
            if (mission.type === 'speed_mining' && mission.status === 'active' && !mission.failed) {
                const elapsedTime = (Date.now() - mission.startTime) / 1000;
                const timeRemaining = Math.max(0, mission.timeLimit - elapsedTime);
                const minutes = Math.floor(timeRemaining / 60);
                const seconds = Math.floor(timeRemaining % 60);
                const timeColor = timeRemaining < 30 ? '#ff0000' : timeRemaining < 60 ? '#ffaa00' : '#00ff00';
                timeRemainingHtml = `<div class="mission-time" style="color: ${timeColor};">TIME: ${minutes}:${seconds.toString().padStart(2, '0')}</div>`;
            }
            
            // Hull threshold for hazard missions
            let hullInfoHtml = '';
            if (mission.type === 'hazard_survival' && mission.status === 'active' && !mission.failed) {
                const currentHullPercent = Math.floor((gameState.hull / gameState.maxHull) * 100);
                const hullColor = currentHullPercent < mission.threshold ? '#ff0000' : '#00ff00';
                hullInfoHtml = `<div class="mission-hull" style="color: ${hullColor};">HULL: ${currentHullPercent}% (MIN: ${mission.threshold}%)</div>`;
            }
            
            const rewardWithBonus = calculateMissionReward(mission.reward);
            
            item.innerHTML = `
                <div class="mission-header">
                    <span class="item-icon">${mission.icon}</span>
                    <span class="mission-title">${mission.title}</span>
                    <span class="mission-status">${statusText}</span>
                </div>
                <div class="mission-description">${mission.description}</div>
                ${stationNameHtml}
                ${timeRemainingHtml}
                ${hullInfoHtml}
                <div class="mission-progress">
                    <span>${mission.current}/${mission.target}</span>
                    <div class="mission-progress-bar">
                        <div class="mission-progress-fill" style="width: ${progressPercent}%"></div>
                    </div>
                </div>
                <div class="mission-reward">REWARD: ${rewardWithBonus}¢</div>
            `;
            domCache.missionsList.appendChild(item);
        });
    }
    
    uiDirtyFlags.missions = false;
}

function updateUpgradeButtons() {
    const upgradeCosts = {
        speed: [100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600, 51200],
        cargo: [150, 300, 600, 1200, 2400, 4800, 9600, 19200, 38400, 76800],
        mining: [120, 240, 480, 960, 1920, 3840, 7680, 15360, 30720, 61440],
        hull: [200, 400, 800, 1600, 3200, 6400, 12800, 25600, 51200, 102400],
        fuelCapacity: [180, 360, 720, 1440, 2880, 5760, 11520, 23040, 46080, 92160],
        fuelEfficiency: [200, 400, 800, 1600, 3200, 6400, 12800, 25600, 51200, 102400],
        range: [160, 320, 640, 1280, 2560, 5120, 10240, 20480, 40960, 81920],
        multiMining: [2400, 4800, 9600, 19200, 38400], // Max 6 lasers (5 upgrades from level 1)
        advancedScanner: [5000],
        scanRange: [250, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000],
        scanCooldown: [200, 400, 800, 1600, 3200, 6400, 12800, 25600, 51200, 102400],
        cargoDrone: [20000]
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
                    // Cargo is infinite, never show MAX
                    valueDisplay.textContent = `${currentCargo} → ${nextCargo}`;
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
                case 'fuelCapacity':
                    const currentFuelPercent = 100 + (level - 1) * 20;
                    const nextFuelPercent = 100 + level * 20;
                    // Fuel capacity is infinite, never show MAX
                    valueDisplay.textContent = `${currentFuelPercent}% → ${nextFuelPercent}%`;
                    break;
                    break;
                case 'fuelEfficiency':
                    const currentEfficiency = Math.round(Math.pow(0.9, level - 1) * 100);
                    const nextEfficiency = Math.round(Math.pow(0.9, level) * 100);
                    if (level >= 10) {
                        valueDisplay.textContent = `${currentEfficiency}% (MAX)`;
                    } else {
                        valueDisplay.textContent = `${currentEfficiency}% → ${nextEfficiency}%`;
                    }
                    break;
                case 'range':
                    const currentRange = CONFIG.miningRange + (level - 1) * 10;
                    const nextRange = CONFIG.miningRange + level * 10;
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
            
            // Check max level (6 for multiMining, infinite for cargo/fuelCapacity, 10 for others)
            let maxLevel;
            if (upgradeType === 'multiMining') {
                maxLevel = 6;
            } else if (upgradeType === 'cargo' || upgradeType === 'fuelCapacity') {
                maxLevel = Infinity; // No limit
            } else {
                maxLevel = 10;
            }
            
            if (level >= maxLevel) {
                if (costDisplay) costDisplay.textContent = 'MAX';
                btn.disabled = true;
                const btnText = btn.querySelector('.btn-text');
                if (btnText) btnText.textContent = 'MAX LEVEL';
            } else {
                // Calculate cost - use exponential scaling for levels beyond array
                let cost;
                if (level - 1 < upgradeCosts[upgradeType].length) {
                    cost = upgradeCosts[upgradeType][level - 1];
                } else {
                    // For levels beyond the array, use exponential scaling
                    const lastCost = upgradeCosts[upgradeType][upgradeCosts[upgradeType].length - 1];
                    const costMultiplier = 2; // Double the cost each level
                    const levelsBeyond = level - upgradeCosts[upgradeType].length;
                    cost = Math.floor(lastCost * Math.pow(costMultiplier, levelsBeyond));
                }
                
                if (costDisplay) costDisplay.textContent = cost;
                // Disable upgrade buttons if not docked OR insufficient credits
                const isDocked = isDockedAtAnyStation();
                btn.disabled = !isDocked || gameState.credits < cost;
                // Update button text
                const btnText = btn.querySelector('.btn-text');
                if (btnText) btnText.textContent = `UPGRADE: ${cost}¢`;
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

function compareVersions(v1, v2) {
    // Compare two semantic version strings (e.g., "2.0.0" vs "1.5.3")
    // Returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const num1 = parts1[i] || 0;
        const num2 = parts2[i] || 0;
        
        if (num1 < num2) return -1;
        if (num1 > num2) return 1;
    }
    
    return 0;
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
