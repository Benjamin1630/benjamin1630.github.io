// ================================
// COOKIE CLICKER EMPIRE - GAME DATA
// ================================

// Game State
let gameState = {
    cookies: 0,
    totalCookiesBaked: 0,
    cookiesPerClick: 1,
    cookiesPerSecond: 0,
    
    // Bulk buy amount
    bulkBuyAmount: 1,
    
    // Prestige System
    prestigeLevel: 0,
    prestigePoints: 0,
    totalRebirths: 0,
    
    // Buildings
    buildings: {},
    
    // Upgrades
    purchasedUpgrades: [],
    purchasedPrestigeUpgrades: [],
    
    // Achievements
    unlockedAchievements: [],
    
    // Stats
    totalClicks: 0,
    goldenCookiesClicked: 0,
    sessionClicks: 0,
    timePlayed: 0,
    sessionTime: 0,
    
    // Active Effects
    activeEffects: []
};

// Building Definitions
const BUILDINGS = [
    {
        id: 'cursor',
        name: 'Cursor',
        icon: '👆',
        baseCost: 15,
        baseCps: 0.1,
        description: 'Autoclicks once every 10 seconds',
        costMultiplier: 1.15
    },
    {
        id: 'grandma',
        name: 'Grandma',
        icon: '👵',
        baseCost: 100,
        baseCps: 1,
        description: 'A nice grandma to bake cookies',
        costMultiplier: 1.15
    },
    {
        id: 'farm',
        name: 'Cookie Farm',
        icon: '🌾',
        baseCost: 1100,
        baseCps: 8,
        description: 'Grows cookie plants',
        costMultiplier: 1.15
    },
    {
        id: 'mine',
        name: 'Cookie Mine',
        icon: '⛏️',
        baseCost: 12000,
        baseCps: 47,
        description: 'Mines cookie dough',
        costMultiplier: 1.15
    },
    {
        id: 'factory',
        name: 'Cookie Factory',
        icon: '🏭',
        baseCost: 130000,
        baseCps: 260,
        description: 'Produces cookies en masse',
        costMultiplier: 1.15
    },
    {
        id: 'bank',
        name: 'Cookie Bank',
        icon: '🏦',
        baseCost: 1400000,
        baseCps: 1400,
        description: 'Generates cookies from interest',
        costMultiplier: 1.15
    },
    {
        id: 'temple',
        name: 'Cookie Temple',
        icon: '⛩️',
        baseCost: 20000000,
        baseCps: 7800,
        description: 'Worships the cookie gods',
        costMultiplier: 1.15
    },
    {
        id: 'wizard',
        name: 'Wizard Tower',
        icon: '🧙',
        baseCost: 330000000,
        baseCps: 44000,
        description: 'Summons cookies with magic',
        costMultiplier: 1.15
    },
    {
        id: 'shipment',
        name: 'Cookie Shipment',
        icon: '🚢',
        baseCost: 5100000000,
        baseCps: 260000,
        description: 'Ships cookies from other planets',
        costMultiplier: 1.15
    },
    {
        id: 'lab',
        name: 'Cookie Lab',
        icon: '🔬',
        baseCost: 75000000000,
        baseCps: 1600000,
        description: 'Researches efficient cookie technology',
        costMultiplier: 1.15
    },
    {
        id: 'portal',
        name: 'Cookie Portal',
        icon: '🌀',
        baseCost: 1000000000000,
        baseCps: 10000000,
        description: 'Opens portals to cookie dimensions',
        costMultiplier: 1.15
    },
    {
        id: 'timemachine',
        name: 'Time Machine',
        icon: '⏰',
        baseCost: 14000000000000,
        baseCps: 65000000,
        description: 'Brings cookies from the past',
        costMultiplier: 1.15
    },
    {
        id: 'antimatter',
        name: 'Antimatter Condenser',
        icon: '⚛️',
        baseCost: 170000000000000,
        baseCps: 430000000,
        description: 'Condenses antimatter into cookies',
        costMultiplier: 1.15
    },
    {
        id: 'prism',
        name: 'Prism',
        icon: '🔷',
        baseCost: 2100000000000000,
        baseCps: 2900000000,
        description: 'Converts light into cookies',
        costMultiplier: 1.15
    },
    {
        id: 'chancemaker',
        name: 'Chancemaker',
        icon: '🎲',
        baseCost: 26000000000000000,
        baseCps: 21000000000,
        description: 'Generates cookies by sheer luck',
        costMultiplier: 1.15
    }
];

// Regular Upgrades
const UPGRADES = [
    // Click Upgrades
    { id: 'click1', name: 'Reinforced Cursor', icon: '💪', cost: 100, effect: 'click', value: 1, desc: '+1 per click', requirement: () => true },
    { id: 'click2', name: 'Strong Fingers', icon: '✊', cost: 500, effect: 'click', value: 1, desc: '+1 per click', requirement: () => gameState.purchasedUpgrades.includes('click1') },
    { id: 'click3', name: 'Mighty Hands', icon: '🤜', cost: 10000, effect: 'click', value: 5, desc: '+5 per click', requirement: () => gameState.purchasedUpgrades.includes('click2') },
    { id: 'click4', name: 'Cookie Claws', icon: '🦅', cost: 100000, effect: 'click', value: 10, desc: '+10 per click', requirement: () => gameState.purchasedUpgrades.includes('click3') },
    { id: 'click5', name: 'Titan Grip', icon: '👊', cost: 10000000, effect: 'click', value: 50, desc: '+50 per click', requirement: () => gameState.purchasedUpgrades.includes('click4') },
    
    // CPS Multipliers
    { id: 'cps1', name: 'Better Ovens', icon: '🔥', cost: 1000, effect: 'cps_mult', value: 0.1, desc: '+10% CPS', requirement: () => gameState.cookiesPerSecond >= 5 },
    { id: 'cps2', name: 'Premium Recipe', icon: '📜', cost: 50000, effect: 'cps_mult', value: 0.15, desc: '+15% CPS', requirement: () => gameState.cookiesPerSecond >= 50 },
    { id: 'cps3', name: 'Cookie Science', icon: '🧪', cost: 500000, effect: 'cps_mult', value: 0.2, desc: '+20% CPS', requirement: () => gameState.cookiesPerSecond >= 500 },
    { id: 'cps4', name: 'Cookie Engineering', icon: '⚙️', cost: 5000000, effect: 'cps_mult', value: 0.25, desc: '+25% CPS', requirement: () => gameState.cookiesPerSecond >= 5000 },
    { id: 'cps5', name: 'Cookie Mastery', icon: '👑', cost: 500000000, effect: 'cps_mult', value: 0.5, desc: '+50% CPS', requirement: () => gameState.cookiesPerSecond >= 100000 },
    
    // Building-Specific Upgrades
    { id: 'cursor_up1', name: 'Carpal Tunnel Prevention', icon: '💉', cost: 500, effect: 'building_mult', building: 'cursor', value: 1, desc: '2x Cursor production', requirement: () => (gameState.buildings.cursor || 0) >= 1 },
    { id: 'cursor_up2', name: 'Ambidextrous', icon: '👐', cost: 50000, effect: 'building_mult', building: 'cursor', value: 1, desc: '2x Cursor production', requirement: () => (gameState.buildings.cursor || 0) >= 10 },
    
    { id: 'grandma_up1', name: 'Forwards from Grandma', icon: '📧', cost: 1000, effect: 'building_mult', building: 'grandma', value: 1, desc: '2x Grandma production', requirement: () => (gameState.buildings.grandma || 0) >= 1 },
    { id: 'grandma_up2', name: 'Steel-plated Rolling Pins', icon: '🔩', cost: 55000, effect: 'building_mult', building: 'grandma', value: 1, desc: '2x Grandma production', requirement: () => (gameState.buildings.grandma || 0) >= 5 },
    { id: 'grandma_up3', name: 'Grandmas Retirement Fund', icon: '💰', cost: 5500000, effect: 'building_mult', building: 'grandma', value: 1, desc: '2x Grandma production', requirement: () => (gameState.buildings.grandma || 0) >= 25 },
    
    { id: 'farm_up1', name: 'Cheap Hoes', icon: '🔨', cost: 11000, effect: 'building_mult', building: 'farm', value: 1, desc: '2x Farm production', requirement: () => (gameState.buildings.farm || 0) >= 1 },
    { id: 'farm_up2', name: 'Fertilizer', icon: '🌿', cost: 550000, effect: 'building_mult', building: 'farm', value: 1, desc: '2x Farm production', requirement: () => (gameState.buildings.farm || 0) >= 5 },
    
    { id: 'mine_up1', name: 'Sugar Gas', icon: '💨', cost: 120000, effect: 'building_mult', building: 'mine', value: 1, desc: '2x Mine production', requirement: () => (gameState.buildings.mine || 0) >= 1 },
    { id: 'mine_up2', name: 'Megadrill', icon: '🚁', cost: 6000000, effect: 'building_mult', building: 'mine', value: 1, desc: '2x Mine production', requirement: () => (gameState.buildings.mine || 0) >= 5 },
    
    { id: 'factory_up1', name: 'Sturdier Conveyor Belts', icon: '📦', cost: 1300000, effect: 'building_mult', building: 'factory', value: 1, desc: '2x Factory production', requirement: () => (gameState.buildings.factory || 0) >= 1 },
    { id: 'factory_up2', name: 'Cookie Robots', icon: '🤖', cost: 65000000, effect: 'building_mult', building: 'factory', value: 1, desc: '2x Factory production', requirement: () => (gameState.buildings.factory || 0) >= 5 },
    
    { id: 'bank_up1', name: 'Taller Tellers', icon: '👔', cost: 14000000, effect: 'building_mult', building: 'bank', value: 1, desc: '2x Bank production', requirement: () => (gameState.buildings.bank || 0) >= 1 },
    { id: 'bank_up2', name: 'Scissor-resistant Credit Cards', icon: '💳', cost: 700000000, effect: 'building_mult', building: 'bank', value: 1, desc: '2x Bank production', requirement: () => (gameState.buildings.bank || 0) >= 5 },
    
    { id: 'temple_up1', name: 'Golden Idols', icon: '🗿', cost: 200000000, effect: 'building_mult', building: 'temple', value: 1, desc: '2x Temple production', requirement: () => (gameState.buildings.temple || 0) >= 1 },
    
    { id: 'wizard_up1', name: 'Pointier Hats', icon: '🎩', cost: 3300000000, effect: 'building_mult', building: 'wizard', value: 1, desc: '2x Wizard production', requirement: () => (gameState.buildings.wizard || 0) >= 1 },
    
    { id: 'shipment_up1', name: 'Vanilla Nebulae', icon: '☄️', cost: 51000000000, effect: 'building_mult', building: 'shipment', value: 1, desc: '2x Shipment production', requirement: () => (gameState.buildings.shipment || 0) >= 1 },
    
    { id: 'lab_up1', name: 'Antimony', icon: '🔭', cost: 750000000000, effect: 'building_mult', building: 'lab', value: 1, desc: '2x Lab production', requirement: () => (gameState.buildings.lab || 0) >= 1 },
    
    { id: 'portal_up1', name: 'Ancient Tablet', icon: '📿', cost: 10000000000000, effect: 'building_mult', building: 'portal', value: 1, desc: '2x Portal production', requirement: () => (gameState.buildings.portal || 0) >= 1 },
    
    // Synergy Upgrades
    { id: 'synergy1', name: 'Cookie Synergy I', icon: '🔗', cost: 100000, effect: 'cps_mult', value: 0.05, desc: '+5% CPS for each building type owned', requirement: () => Object.keys(gameState.buildings).length >= 3 },
    { id: 'synergy2', name: 'Cookie Synergy II', icon: '⛓️', cost: 10000000, effect: 'cps_mult', value: 0.1, desc: '+10% CPS for each building type owned', requirement: () => Object.keys(gameState.buildings).length >= 5 },
    
    // Golden Cookie Upgrades
    { id: 'golden1', name: 'Lucky Day', icon: '🍀', cost: 77777, effect: 'golden_freq', value: 0.2, desc: 'Golden cookies appear 20% more often', requirement: () => gameState.goldenCookiesClicked >= 1 },
    { id: 'golden2', name: 'Serendipity', icon: '✨', cost: 777777, effect: 'golden_mult', value: 0.5, desc: 'Golden cookies give 50% more', requirement: () => gameState.goldenCookiesClicked >= 7 },
    { id: 'golden3', name: 'Get Lucky', icon: '💫', cost: 77777777, effect: 'golden_freq', value: 0.3, desc: 'Golden cookies appear 30% more often', requirement: () => gameState.goldenCookiesClicked >= 27 },
];

// Prestige Upgrades
const PRESTIGE_UPGRADES = [
    { id: 'prestige_cps1', name: 'Heavenly Cookies', icon: '☁️', cost: 1, effect: 'prestige_cps', value: 0.01, desc: '+1% CPS permanently', maxLevel: 100 },
    { id: 'prestige_cpc1', name: 'Heavenly Fingers', icon: '👼', cost: 1, effect: 'prestige_cpc', value: 0.01, desc: '+1% clicking power permanently', maxLevel: 100 },
    { id: 'prestige_cost1', name: 'Divine Discount', icon: '💸', cost: 5, effect: 'prestige_cost', value: 0.01, desc: '-1% building costs', maxLevel: 50 },
    { id: 'prestige_golden1', name: 'Golden Blessing', icon: '🌟', cost: 10, effect: 'prestige_golden', value: 0.05, desc: '+5% golden cookie effects', maxLevel: 20 },
    { id: 'prestige_start', name: 'Starter Kit', icon: '🎁', cost: 50, effect: 'prestige_starter', value: 1000, desc: 'Start each prestige with 1000 cookies', maxLevel: 1 },
    { id: 'prestige_auto', name: 'Cookie Automation', icon: '⚡', cost: 100, effect: 'prestige_auto', value: 0.1, desc: '+10% production while offline', maxLevel: 10 },
];

// Achievements
const ACHIEVEMENTS = [
    // Cookie Milestones
    { id: 'cookies_100', name: 'Getting Started', icon: '🍪', desc: 'Bake 100 cookies', requirement: () => gameState.totalCookiesBaked >= 100 },
    { id: 'cookies_1000', name: 'Cookie Baker', icon: '👨‍🍳', desc: 'Bake 1,000 cookies', requirement: () => gameState.totalCookiesBaked >= 1000 },
    { id: 'cookies_10000', name: 'Cookie Factory', icon: '🏭', desc: 'Bake 10,000 cookies', requirement: () => gameState.totalCookiesBaked >= 10000 },
    { id: 'cookies_100000', name: 'Cookie Empire', icon: '👑', desc: 'Bake 100,000 cookies', requirement: () => gameState.totalCookiesBaked >= 100000 },
    { id: 'cookies_1000000', name: 'Cookie Tycoon', icon: '💰', desc: 'Bake 1,000,000 cookies', requirement: () => gameState.totalCookiesBaked >= 1000000 },
    { id: 'cookies_1000000000', name: 'Cookie God', icon: '⚡', desc: 'Bake 1 billion cookies', requirement: () => gameState.totalCookiesBaked >= 1000000000 },
    
    // Click Achievements
    { id: 'clicks_100', name: 'Clicktastic', icon: '👆', desc: 'Click the cookie 100 times', requirement: () => gameState.totalClicks >= 100 },
    { id: 'clicks_1000', name: 'Click Master', icon: '👊', desc: 'Click the cookie 1,000 times', requirement: () => gameState.totalClicks >= 1000 },
    { id: 'clicks_10000', name: 'Clicking Legend', icon: '🦾', desc: 'Click the cookie 10,000 times', requirement: () => gameState.totalClicks >= 10000 },
    { id: 'clicks_100000', name: 'Carpal Tunnel', icon: '💀', desc: 'Click the cookie 100,000 times', requirement: () => gameState.totalClicks >= 100000 },
    
    // Building Achievements
    { id: 'buildings_10', name: 'Building Up', icon: '🏗️', desc: 'Own 10 buildings', requirement: () => getTotalBuildings() >= 10 },
    { id: 'buildings_50', name: 'Architect', icon: '📐', desc: 'Own 50 buildings', requirement: () => getTotalBuildings() >= 50 },
    { id: 'buildings_100', name: 'City Planner', icon: '🌆', desc: 'Own 100 buildings', requirement: () => getTotalBuildings() >= 100 },
    { id: 'buildings_250', name: 'Metropolis', icon: '🏙️', desc: 'Own 250 buildings', requirement: () => getTotalBuildings() >= 250 },
    { id: 'buildings_500', name: 'Megacity', icon: '🌃', desc: 'Own 500 buildings', requirement: () => getTotalBuildings() >= 500 },
    
    // CPS Achievements
    { id: 'cps_10', name: 'Baking Steady', icon: '⏱️', desc: 'Reach 10 CPS', requirement: () => gameState.cookiesPerSecond >= 10 },
    { id: 'cps_100', name: 'Cookie Flow', icon: '🌊', desc: 'Reach 100 CPS', requirement: () => gameState.cookiesPerSecond >= 100 },
    { id: 'cps_1000', name: 'Cookie Tsunami', icon: '🌪️', desc: 'Reach 1,000 CPS', requirement: () => gameState.cookiesPerSecond >= 1000 },
    { id: 'cps_100000', name: 'Cookie Hurricane', icon: '🌀', desc: 'Reach 100,000 CPS', requirement: () => gameState.cookiesPerSecond >= 100000 },
    { id: 'cps_10000000', name: 'Cookie Apocalypse', icon: '☄️', desc: 'Reach 10,000,000 CPS', requirement: () => gameState.cookiesPerSecond >= 10000000 },
    
    // Golden Cookie Achievements
    { id: 'golden_1', name: 'Lucky Find', icon: '🍀', desc: 'Click 1 golden cookie', requirement: () => gameState.goldenCookiesClicked >= 1 },
    { id: 'golden_7', name: 'Lucky Number', icon: '🎰', desc: 'Click 7 golden cookies', requirement: () => gameState.goldenCookiesClicked >= 7 },
    { id: 'golden_27', name: 'Golden Touch', icon: '✨', desc: 'Click 27 golden cookies', requirement: () => gameState.goldenCookiesClicked >= 27 },
    { id: 'golden_77', name: 'Midas', icon: '👑', desc: 'Click 77 golden cookies', requirement: () => gameState.goldenCookiesClicked >= 77 },
    
    // Prestige Achievements
    { id: 'prestige_1', name: 'Rebirth', icon: '🌟', desc: 'Prestige for the first time', requirement: () => gameState.totalRebirths >= 1 },
    { id: 'prestige_5', name: 'Reincarnation', icon: '💫', desc: 'Prestige 5 times', requirement: () => gameState.totalRebirths >= 5 },
    { id: 'prestige_10', name: 'Eternal', icon: '♾️', desc: 'Prestige 10 times', requirement: () => gameState.totalRebirths >= 10 },
    
    // Special Achievements
    { id: 'all_buildings', name: 'Full House', icon: '🏘️', desc: 'Own at least 1 of every building', requirement: () => Object.keys(gameState.buildings).length >= BUILDINGS.length },
    { id: 'no_click_1000', name: 'Idle Game', icon: '😴', desc: 'Bake 1,000 cookies with 0 clicks this session', requirement: () => gameState.totalCookiesBaked >= 1000 && gameState.sessionClicks === 0 },
    { id: 'speed_100', name: 'Speed Baker', icon: '⚡', desc: 'Reach 100 cookies in first minute', requirement: () => gameState.cookies >= 100 && gameState.sessionTime <= 60 },
];

// ================================
// GAME FUNCTIONS
// ================================

// Initialize Buildings
function initBuildings() {
    BUILDINGS.forEach(building => {
        if (!gameState.buildings[building.id]) {
            gameState.buildings[building.id] = 0;
        }
    });
}

// Calculate Building Cost
function getBuildingCost(building, amount = 1) {
    const owned = gameState.buildings[building.id] || 0;
    let totalCost = 0;
    
    for (let i = 0; i < amount; i++) {
        let cost = building.baseCost * Math.pow(building.costMultiplier, owned + i);
        
        // Apply cost reduction from prestige upgrades
        const costReduction = getPrestigeUpgradeValue('prestige_cost');
        cost *= (1 - costReduction);
        
        totalCost += cost;
    }
    
    return Math.ceil(totalCost);
}

// Calculate Building Production
function getBuildingProduction(building) {
    let production = building.baseCps;
    
    // Apply building-specific multipliers from upgrades
    const buildingMult = getBuildingMultiplier(building.id);
    production *= buildingMult;
    
    // Apply prestige multiplier
    production *= getPrestigeMultiplier();
    
    return production;
}

// Get Building Multiplier
function getBuildingMultiplier(buildingId) {
    let multiplier = 1;
    
    gameState.purchasedUpgrades.forEach(upgradeId => {
        const upgrade = UPGRADES.find(u => u.id === upgradeId);
        if (upgrade && upgrade.effect === 'building_mult' && upgrade.building === buildingId) {
            multiplier *= 2; // Each building upgrade doubles production
        }
    });
    
    return multiplier;
}

// Calculate Total CPS
function calculateCPS() {
    let totalCPS = 0;
    
    // Calculate from buildings
    BUILDINGS.forEach(building => {
        const owned = gameState.buildings[building.id] || 0;
        if (owned > 0) {
            totalCPS += getBuildingProduction(building) * owned;
        }
    });
    
    // Apply CPS multiplier upgrades
    let cpsMultiplier = 1;
    gameState.purchasedUpgrades.forEach(upgradeId => {
        const upgrade = UPGRADES.find(u => u.id === upgradeId);
        if (upgrade && upgrade.effect === 'cps_mult') {
            cpsMultiplier += upgrade.value;
        }
    });
    
    // Apply prestige CPS bonus
    const prestigeCPSBonus = getPrestigeUpgradeValue('prestige_cps');
    cpsMultiplier += prestigeCPSBonus;
    
    totalCPS *= cpsMultiplier;
    
    // Apply prestige multiplier
    totalCPS *= getPrestigeMultiplier();
    
    gameState.cookiesPerSecond = totalCPS;
    return totalCPS;
}

// Calculate Cookies Per Click
function calculateCPC() {
    let cpc = 1;
    
    // Add click upgrades
    gameState.purchasedUpgrades.forEach(upgradeId => {
        const upgrade = UPGRADES.find(u => u.id === upgradeId);
        if (upgrade && upgrade.effect === 'click') {
            cpc += upgrade.value;
        }
    });
    
    // Apply 1% of CPS to clicking power
    cpc += gameState.cookiesPerSecond * 0.01;
    
    // Apply prestige CPC bonus
    const prestigeCPCBonus = getPrestigeUpgradeValue('prestige_cpc');
    cpc *= (1 + prestigeCPCBonus);
    
    // Apply prestige multiplier
    cpc *= getPrestigeMultiplier();
    
    gameState.cookiesPerClick = cpc;
    return cpc;
}

// Get Prestige Multiplier
function getPrestigeMultiplier() {
    return 1 + (gameState.prestigePoints * 0.01);
}

// Get Prestige Upgrade Value
function getPrestigeUpgradeValue(upgradeId) {
    let total = 0;
    gameState.purchasedPrestigeUpgrades.forEach(purchase => {
        if (purchase.id === upgradeId) {
            const upgrade = PRESTIGE_UPGRADES.find(u => u.id === upgradeId);
            if (upgrade) {
                total += upgrade.value * purchase.level;
            }
        }
    });
    return total;
}

// Calculate Prestige Points on Rebirth
function calculatePrestigePoints() {
    // Prestige points = sqrt(total cookies baked / 1,000,000)
    const points = Math.floor(Math.sqrt(gameState.totalCookiesBaked / 1000000));
    return points;
}

// Get Total Buildings
function getTotalBuildings() {
    return Object.values(gameState.buildings).reduce((sum, count) => sum + count, 0);
}

// ================================
// UI FUNCTIONS
// ================================

// Format Numbers
function formatNumber(num) {
    if (num < 1000) return Math.floor(num).toString();
    if (num < 1000000) return (num / 1000).toFixed(1) + 'K';
    if (num < 1000000000) return (num / 1000000).toFixed(2) + 'M';
    if (num < 1000000000000) return (num / 1000000000).toFixed(2) + 'B';
    if (num < 1000000000000000) return (num / 1000000000000).toFixed(2) + 'T';
    return (num / 1000000000000000).toFixed(2) + 'Q';
}

// Format Time
function formatTime(seconds) {
    if (seconds < 60) return `${Math.floor(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
}

// Update Display
function updateDisplay() {
    document.getElementById('cookie-count').textContent = formatNumber(gameState.cookies);
    document.getElementById('cps').textContent = formatNumber(gameState.cookiesPerSecond);
    document.getElementById('cpc').textContent = formatNumber(gameState.cookiesPerClick);
    document.getElementById('prestige-level').textContent = gameState.prestigePoints;
    document.getElementById('prestige-multiplier').textContent = getPrestigeMultiplier().toFixed(2) + 'x';
    
    const rebirthCost = Math.max(1000000, gameState.totalCookiesBaked * 2);
    document.getElementById('rebirth-cost').textContent = formatNumber(rebirthCost);
    
    const rebirthBtn = document.getElementById('rebirth-btn');
    if (gameState.totalCookiesBaked >= 1000000) {
        rebirthBtn.disabled = false;
        rebirthBtn.classList.add('glow');
    } else {
        rebirthBtn.disabled = true;
        rebirthBtn.classList.remove('glow');
    }
}

// Update Buildings Display
function updateBuildingsDisplay() {
    const grid = document.getElementById('buildings-grid');
    grid.innerHTML = '';
    
    const bulkAmount = gameState.bulkBuyAmount;
    
    BUILDINGS.forEach(building => {
        const owned = gameState.buildings[building.id] || 0;
        const cost = getBuildingCost(building, bulkAmount);
        const production = getBuildingProduction(building);
        const canAfford = gameState.cookies >= cost;
        
        const div = document.createElement('div');
        div.className = 'building-item' + (canAfford ? '' : ' disabled');
        div.onclick = () => canAfford && buyBuilding(building, bulkAmount);
        
        const buyText = bulkAmount > 1 ? `Buy ${bulkAmount}` : 'Buy';
        
        div.innerHTML = `
            <div class="building-icon">${building.icon}</div>
            <div class="building-info">
                <div class="building-name">${building.name}</div>
                <div class="building-desc">${building.description}</div>
                <div class="building-production">${formatNumber(production)} CPS each</div>
            </div>
            <div class="building-buy">
                <div class="building-owned">Owned: ${owned}</div>
                <div class="building-cost">${buyText}: ${formatNumber(cost)}</div>
            </div>
        `;
        
        grid.appendChild(div);
    });
}

// Update Upgrades Display
function updateUpgradesDisplay() {
    const grid = document.getElementById('upgrades-grid');
    const noUpgradesMsg = document.getElementById('no-upgrades-msg');
    grid.innerHTML = '';
    
    const availableUpgrades = UPGRADES.filter(upgrade => 
        !gameState.purchasedUpgrades.includes(upgrade.id) && upgrade.requirement()
    );
    
    if (availableUpgrades.length === 0) {
        noUpgradesMsg.style.display = 'block';
        return;
    }
    
    noUpgradesMsg.style.display = 'none';
    
    availableUpgrades.forEach(upgrade => {
        const canAfford = gameState.cookies >= upgrade.cost;
        
        const div = document.createElement('div');
        div.className = 'upgrade-item' + (canAfford ? '' : ' disabled');
        div.onclick = () => canAfford && buyUpgrade(upgrade);
        
        div.innerHTML = `
            <div class="upgrade-icon">${upgrade.icon}</div>
            <div class="upgrade-name">${upgrade.name}</div>
            <div class="upgrade-desc">${upgrade.desc}</div>
            <div class="upgrade-cost">${formatNumber(upgrade.cost)}</div>
        `;
        
        grid.appendChild(div);
    });
}

// Update Achievements Display
function updateAchievementsDisplay() {
    const grid = document.getElementById('achievements-grid');
    const filter = document.querySelector('.filter-btn.active').dataset.filter;
    
    grid.innerHTML = '';
    
    let filteredAchievements = ACHIEVEMENTS;
    if (filter === 'unlocked') {
        filteredAchievements = ACHIEVEMENTS.filter(a => gameState.unlockedAchievements.includes(a.id));
    } else if (filter === 'locked') {
        filteredAchievements = ACHIEVEMENTS.filter(a => !gameState.unlockedAchievements.includes(a.id));
    }
    
    filteredAchievements.forEach(achievement => {
        const unlocked = gameState.unlockedAchievements.includes(achievement.id);
        
        const div = document.createElement('div');
        div.className = 'achievement-item' + (unlocked ? ' unlocked' : ' locked');
        
        div.innerHTML = `
            <div class="achievement-icon">${unlocked ? achievement.icon : '🔒'}</div>
            <div class="achievement-info">
                <div class="achievement-name">${unlocked ? achievement.name : '???'}</div>
                <div class="achievement-desc">${unlocked ? achievement.desc : 'Hidden Achievement'}</div>
            </div>
        `;
        
        grid.appendChild(div);
    });
    
    // Update counts
    const unlockedCount = gameState.unlockedAchievements.length;
    const totalCount = ACHIEVEMENTS.length;
    document.getElementById('total-achievements').textContent = totalCount;
    document.getElementById('unlocked-achievements').textContent = unlockedCount;
    document.getElementById('locked-achievements').textContent = totalCount - unlockedCount;
}

// Update Prestige Display
function updatePrestigeDisplay() {
    const totalCookies = gameState.totalCookiesBaked;
    const currentPoints = gameState.prestigePoints;
    const newPoints = calculatePrestigePoints();
    const pointsGained = newPoints - currentPoints;
    
    const currentMult = getPrestigeMultiplier();
    const newMult = 1 + (newPoints * 0.01);
    const multIncrease = newMult - currentMult;
    
    document.getElementById('total-cookies-baked').textContent = formatNumber(totalCookies);
    document.getElementById('prestige-points-preview').textContent = pointsGained;
    document.getElementById('current-multiplier').textContent = currentMult.toFixed(2) + 'x';
    document.getElementById('new-multiplier').textContent = newMult.toFixed(2) + 'x';
    document.getElementById('multiplier-increase').textContent = '+' + multIncrease.toFixed(2) + 'x';
    
    const confirmBtn = document.getElementById('prestige-confirm-btn');
    if (totalCookies >= 1000000 && pointsGained > 0) {
        confirmBtn.disabled = false;
    } else {
        confirmBtn.disabled = true;
    }
    
    updatePrestigeUpgradesDisplay();
}

// Update Prestige Upgrades Display
function updatePrestigeUpgradesDisplay() {
    const grid = document.getElementById('prestige-upgrades-grid');
    grid.innerHTML = '';
    
    PRESTIGE_UPGRADES.forEach(upgrade => {
        const purchased = gameState.purchasedPrestigeUpgrades.find(p => p.id === upgrade.id);
        const currentLevel = purchased ? purchased.level : 0;
        const maxLevel = upgrade.maxLevel || Infinity;
        const nextCost = upgrade.cost * (currentLevel + 1);
        const canAfford = gameState.prestigePoints >= nextCost;
        const maxed = currentLevel >= maxLevel;
        
        const div = document.createElement('div');
        div.className = 'prestige-upgrade-item';
        if (!canAfford || maxed) div.classList.add('disabled');
        if (maxed) div.classList.add('purchased');
        
        div.onclick = () => !maxed && canAfford && buyPrestigeUpgrade(upgrade);
        
        div.innerHTML = `
            <div class="prestige-upgrade-icon">${upgrade.icon}</div>
            <div class="prestige-upgrade-name">${upgrade.name}</div>
            <div class="prestige-upgrade-desc">${upgrade.desc}</div>
            ${!maxed ? `<div class="prestige-upgrade-cost">${nextCost} PP</div>` : ''}
            <div class="prestige-upgrade-level">Level: ${currentLevel}${maxLevel < Infinity ? '/' + maxLevel : ''}</div>
        `;
        
        grid.appendChild(div);
    });
}

// Update Stats Display
function updateStatsDisplay() {
    document.getElementById('stat-total-cookies').textContent = formatNumber(gameState.totalCookiesBaked);
    document.getElementById('stat-hand-made').textContent = formatNumber(gameState.totalClicks * gameState.cookiesPerClick);
    document.getElementById('stat-cps').textContent = formatNumber(gameState.cookiesPerSecond);
    document.getElementById('stat-cpc').textContent = formatNumber(gameState.cookiesPerClick);
    document.getElementById('stat-total-clicks').textContent = formatNumber(gameState.totalClicks);
    document.getElementById('stat-golden-clicks').textContent = gameState.goldenCookiesClicked;
    document.getElementById('stat-session-clicks').textContent = gameState.sessionClicks;
    document.getElementById('stat-total-buildings').textContent = getTotalBuildings();
    
    // Most expensive building
    let mostExpensive = 'None';
    BUILDINGS.forEach(building => {
        if (gameState.buildings[building.id] > 0) {
            mostExpensive = building.name;
        }
    });
    document.getElementById('stat-most-expensive').textContent = mostExpensive;
    
    document.getElementById('stat-upgrades-bought').textContent = gameState.purchasedUpgrades.length;
    document.getElementById('stat-achievements-unlocked').textContent = gameState.unlockedAchievements.length;
    document.getElementById('stat-prestige-level').textContent = gameState.prestigePoints;
    document.getElementById('stat-total-rebirths').textContent = gameState.totalRebirths;
    document.getElementById('stat-time-played').textContent = formatTime(gameState.timePlayed);
    document.getElementById('stat-session-time').textContent = formatTime(gameState.sessionTime);
}

// ================================
// GAME ACTIONS
// ================================

// Click Cookie
function clickCookie() {
    const amount = gameState.cookiesPerClick;
    gameState.cookies += amount;
    gameState.totalCookiesBaked += amount;
    gameState.totalClicks++;
    gameState.sessionClicks++;
    
    // Show click number
    showClickNumber(amount);
    
    // Cookie animation
    const cookieBtn = document.getElementById('cookie-btn');
    cookieBtn.classList.add('bounce');
    setTimeout(() => cookieBtn.classList.remove('bounce'), 100);
    
    updateDisplay();
    checkAchievements();
}

// Show Click Number
function showClickNumber(amount) {
    const container = document.getElementById('click-numbers');
    const number = document.createElement('div');
    number.className = 'click-number';
    number.textContent = '+' + formatNumber(amount);
    
    const x = Math.random() * 200 - 100;
    const y = Math.random() * 100 - 50;
    number.style.left = `calc(50% + ${x}px)`;
    number.style.top = `calc(50% + ${y}px)`;
    
    container.appendChild(number);
    
    setTimeout(() => number.remove(), 1000);
}

// Buy Building
function buyBuilding(building, amount = 1) {
    const cost = getBuildingCost(building, amount);
    
    if (gameState.cookies >= cost) {
        gameState.cookies -= cost;
        gameState.buildings[building.id] += amount;
        
        calculateCPS();
        calculateCPC();
        updateDisplay();
        updateBuildingsDisplay();
        updateUpgradesDisplay();
        checkAchievements();
        
        const plural = amount > 1 ? 's' : '';
        showMessage(`Purchased ${amount} ${building.name}${plural}!`);
    }
}

// Buy Upgrade
function buyUpgrade(upgrade) {
    if (gameState.cookies >= upgrade.cost) {
        gameState.cookies -= upgrade.cost;
        gameState.purchasedUpgrades.push(upgrade.id);
        
        calculateCPS();
        calculateCPC();
        updateDisplay();
        updateUpgradesDisplay();
        checkAchievements();
        
        showMessage(`Purchased ${upgrade.name}!`);
    }
}

// Buy Prestige Upgrade
function buyPrestigeUpgrade(upgrade) {
    const purchased = gameState.purchasedPrestigeUpgrades.find(p => p.id === upgrade.id);
    const currentLevel = purchased ? purchased.level : 0;
    const nextCost = upgrade.cost * (currentLevel + 1);
    
    if (gameState.prestigePoints >= nextCost) {
        gameState.prestigePoints -= nextCost;
        
        if (purchased) {
            purchased.level++;
        } else {
            gameState.purchasedPrestigeUpgrades.push({ id: upgrade.id, level: 1 });
        }
        
        calculateCPS();
        calculateCPC();
        updateDisplay();
        updatePrestigeDisplay();
        
        showMessage(`Purchased ${upgrade.name} Level ${currentLevel + 1}!`);
    }
}

// Prestige/Rebirth
function prestige() {
    const pointsGained = calculatePrestigePoints() - gameState.prestigePoints;
    
    if (pointsGained <= 0) {
        showMessage('Not enough cookies to prestige!');
        return;
    }
    
    if (!confirm(`Are you sure you want to prestige? You will gain ${pointsGained} prestige points and reset your progress (keeping achievements and upgrades).`)) {
        return;
    }
    
    // Add prestige points
    gameState.prestigePoints += pointsGained;
    gameState.totalRebirths++;
    
    // Apply starter kit if purchased
    const starterKit = getPrestigeUpgradeValue('prestige_starter');
    
    // Reset game state
    gameState.cookies = starterKit;
    gameState.cookiesPerSecond = 0;
    gameState.cookiesPerClick = 1;
    gameState.buildings = {};
    initBuildings();
    
    calculateCPS();
    calculateCPC();
    updateDisplay();
    updateBuildingsDisplay();
    updateUpgradesDisplay();
    updatePrestigeDisplay();
    checkAchievements();
    
    showMessage(`🌟 Prestige! Gained ${pointsGained} prestige points! 🌟`);
    
    // Switch to prestige tab
    switchTab('prestige');
}

// Show Message
function showMessage(message) {
    const messageText = document.getElementById('message-text');
    messageText.textContent = message;
    
    const messageDisplay = document.getElementById('message-display');
    messageDisplay.classList.add('glow');
    setTimeout(() => messageDisplay.classList.remove('glow'), 2000);
}

// Check Achievements
function checkAchievements() {
    ACHIEVEMENTS.forEach(achievement => {
        if (!gameState.unlockedAchievements.includes(achievement.id)) {
            if (achievement.requirement()) {
                gameState.unlockedAchievements.push(achievement.id);
                showMessage(`🏆 Achievement Unlocked: ${achievement.name}!`);
                updateAchievementsDisplay();
            }
        }
    });
}

// ================================
// GOLDEN COOKIES
// ================================

let goldenCookieTimeout;

function spawnGoldenCookie() {
    const area = document.getElementById('golden-cookie-area');
    
    // Clear existing golden cookies
    area.innerHTML = '';
    
    const goldenCookie = document.createElement('div');
    goldenCookie.className = 'golden-cookie';
    goldenCookie.textContent = '🌟';
    
    // Random position
    const x = Math.random() * 80 + 10; // 10-90%
    const y = Math.random() * 80 + 10;
    goldenCookie.style.left = x + '%';
    goldenCookie.style.top = y + '%';
    
    goldenCookie.onclick = () => {
        clickGoldenCookie();
        goldenCookie.remove();
        scheduleNextGoldenCookie();
    };
    
    area.appendChild(goldenCookie);
    
    // Auto-disappear after 13 seconds
    setTimeout(() => {
        goldenCookie.remove();
        scheduleNextGoldenCookie();
    }, 13000);
}

function clickGoldenCookie() {
    gameState.goldenCookiesClicked++;
    
    // Random effect
    const effects = ['frenzy', 'lucky', 'bonus'];
    const effect = effects[Math.floor(Math.random() * effects.length)];
    
    let bonusMultiplier = 1;
    
    // Apply golden cookie upgrade bonuses
    gameState.purchasedUpgrades.forEach(upgradeId => {
        const upgrade = UPGRADES.find(u => u.id === upgradeId);
        if (upgrade && upgrade.effect === 'golden_mult') {
            bonusMultiplier += upgrade.value;
        }
    });
    
    const prestigeGoldenBonus = getPrestigeUpgradeValue('prestige_golden');
    bonusMultiplier += prestigeGoldenBonus;
    
    switch (effect) {
        case 'frenzy':
            const frenzyBonus = gameState.cookiesPerSecond * 77 * bonusMultiplier;
            gameState.cookies += frenzyBonus;
            gameState.totalCookiesBaked += frenzyBonus;
            showMessage(`🌟 Frenzy! +${formatNumber(frenzyBonus)} cookies!`);
            break;
        case 'lucky':
            const luckyBonus = gameState.cookies * 0.15 * bonusMultiplier;
            gameState.cookies += luckyBonus;
            gameState.totalCookiesBaked += luckyBonus;
            showMessage(`🍀 Lucky! +${formatNumber(luckyBonus)} cookies!`);
            break;
        case 'bonus':
            const bonus = gameState.cookiesPerClick * 100 * bonusMultiplier;
            gameState.cookies += bonus;
            gameState.totalCookiesBaked += bonus;
            showMessage(`💫 Bonus! +${formatNumber(bonus)} cookies!`);
            break;
    }
    
    updateDisplay();
    checkAchievements();
}

function scheduleNextGoldenCookie() {
    clearTimeout(goldenCookieTimeout);
    
    let baseTime = 60000; // 1 minute
    
    // Apply frequency upgrades
    gameState.purchasedUpgrades.forEach(upgradeId => {
        const upgrade = UPGRADES.find(u => u.id === upgradeId);
        if (upgrade && upgrade.effect === 'golden_freq') {
            baseTime *= (1 - upgrade.value);
        }
    });
    
    const randomTime = baseTime + Math.random() * 60000; // +0-60 seconds
    
    goldenCookieTimeout = setTimeout(spawnGoldenCookie, randomTime);
}

// ================================
// SAVE/LOAD SYSTEM
// ================================

function saveGame() {
    try {
        localStorage.setItem('cookieClickerSave', JSON.stringify(gameState));
        showMessage('💾 Game Saved!');
    } catch (e) {
        showMessage('❌ Failed to save game!');
        console.error(e);
    }
}

function loadGame() {
    try {
        const saved = localStorage.getItem('cookieClickerSave');
        if (saved) {
            const loaded = JSON.parse(saved);
            Object.assign(gameState, loaded);
            
            // Reset session stats
            gameState.sessionClicks = 0;
            gameState.sessionTime = 0;
            
            initBuildings();
            calculateCPS();
            calculateCPC();
            return true;
        }
    } catch (e) {
        console.error('Failed to load game:', e);
    }
    return false;
}

function exportSave() {
    const saveData = JSON.stringify(gameState);
    const encoded = btoa(saveData);
    
    navigator.clipboard.writeText(encoded).then(() => {
        showMessage('📤 Save data copied to clipboard!');
    }).catch(() => {
        prompt('Copy this save data:', encoded);
    });
}

function importSave() {
    const modal = document.getElementById('import-modal');
    modal.classList.add('active');
}

function confirmImport() {
    const textarea = document.getElementById('import-textarea');
    const encoded = textarea.value.trim();
    
    try {
        const decoded = atob(encoded);
        const imported = JSON.parse(decoded);
        
        Object.assign(gameState, imported);
        initBuildings();
        calculateCPS();
        calculateCPC();
        updateDisplay();
        updateBuildingsDisplay();
        updateUpgradesDisplay();
        updateAchievementsDisplay();
        updatePrestigeDisplay();
        updateStatsDisplay();
        
        closeImportModal();
        showMessage('📥 Save data imported successfully!');
    } catch (e) {
        showMessage('❌ Invalid save data!');
        console.error(e);
    }
}

function closeImportModal() {
    const modal = document.getElementById('import-modal');
    modal.classList.remove('active');
    document.getElementById('import-textarea').value = '';
}

function resetGame() {
    if (confirm('Are you sure you want to COMPLETELY RESET your game? This cannot be undone!')) {
        if (confirm('Really? All progress will be lost forever!')) {
            localStorage.removeItem('cookieClickerSave');
            location.reload();
        }
    }
}

// ================================
// GAME LOOP
// ================================

let lastUpdate = Date.now();

function gameLoop() {
    const now = Date.now();
    const delta = (now - lastUpdate) / 1000; // seconds
    lastUpdate = now;
    
    // Add cookies from CPS
    const cookiesGained = gameState.cookiesPerSecond * delta;
    gameState.cookies += cookiesGained;
    gameState.totalCookiesBaked += cookiesGained;
    
    // Update time
    gameState.timePlayed += delta;
    gameState.sessionTime += delta;
    
    // Update displays
    updateDisplay();
    
    // Auto-save every 30 seconds
    if (Math.floor(gameState.timePlayed) % 30 === 0) {
        saveGame();
    }
}

// ================================
// EVENT LISTENERS
// ================================

document.addEventListener('DOMContentLoaded', () => {
    // Load game
    const loaded = loadGame();
    if (!loaded) {
        initBuildings();
    }
    
    // Initialize displays
    updateDisplay();
    updateBuildingsDisplay();
    updateUpgradesDisplay();
    updateAchievementsDisplay();
    updatePrestigeDisplay();
    updateStatsDisplay();
    
    // Cookie click
    document.getElementById('cookie-btn').addEventListener('click', clickCookie);
    
    // Spacebar to click cookie
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' || e.key === ' ') {
            e.preventDefault(); // Prevent scrolling
            clickCookie();
        }
    });
    
    // Rebirth button
    document.getElementById('rebirth-btn').addEventListener('click', () => {
        switchTab('prestige');
    });
    
    // Prestige confirm
    document.getElementById('prestige-confirm-btn').addEventListener('click', prestige);
    
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
        });
    });
    
    // Achievement filters
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateAchievementsDisplay();
        });
    });
    
    // Bulk buy buttons
    document.querySelectorAll('.bulk-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.bulk-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            gameState.bulkBuyAmount = parseInt(btn.dataset.bulk);
            updateBuildingsDisplay();
        });
    });
    
    // Action buttons
    document.getElementById('save-btn').addEventListener('click', saveGame);
    document.getElementById('export-btn').addEventListener('click', exportSave);
    document.getElementById('import-btn').addEventListener('click', importSave);
    document.getElementById('reset-btn').addEventListener('click', resetGame);
    
    // Import modal
    document.getElementById('import-confirm-btn').addEventListener('click', confirmImport);
    document.getElementById('import-cancel-btn').addEventListener('click', closeImportModal);
    
    // Night mode toggle
    document.getElementById('nightModeToggle').addEventListener('click', () => {
        document.body.classList.toggle('night-mode');
        localStorage.setItem('nightMode', document.body.classList.contains('night-mode'));
    });
    
    // Load night mode preference
    if (localStorage.getItem('nightMode') === 'true') {
        document.body.classList.add('night-mode');
    }
    
    // Start game loop
    setInterval(gameLoop, 100); // Update 10 times per second
    
    // Start golden cookie spawning
    scheduleNextGoldenCookie();
    
    // Initial achievement check
    checkAchievements();
});

function switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove active from all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab
    document.getElementById(tabName + '-tab').classList.add('active');
    
    // Activate button
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Update displays based on tab
    switch (tabName) {
        case 'buildings':
            updateBuildingsDisplay();
            break;
        case 'upgrades':
            updateUpgradesDisplay();
            break;
        case 'achievements':
            updateAchievementsDisplay();
            break;
        case 'prestige':
            updatePrestigeDisplay();
            break;
        case 'stats':
            updateStatsDisplay();
            break;
    }
}
