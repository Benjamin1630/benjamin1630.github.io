// Game Canvas Setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game State
let gameState = {
    isPaused: false,
    isGameOver: false,
    money: 0,
    totalMoneyEarned: 0,
    moneyThisRun: 0,
    score: 0,
    lives: 3,
    wave: 1,
    prestigePoints: 0,
    rebirths: 0,
    keys: {},
    lastShot: 0,
    shiftHeld: false
};

// Upgrades
let upgrades = {
    fireRate: 1,
    damage: 1,
    speed: 1,
    multiShot: 0,
    bulletSpeed: 1,
    moneyPerKill: 1,
    bonusMultiplier: 1,
    waveBonus: 0,
    critical: 0
};

// Prestige Upgrades (permanent)
let prestigeUpgrades = {
    damage: 0,
    money: 0,
    speed: 0,
    lives: 0,
    startingMoney: 0
};

// Upgrade Costs
let upgradeCosts = {
    fireRate: 100,
    damage: 150,
    speed: 120,
    multiShot: 500,
    bulletSpeed: 200,
    moneyPerKill: 200,
    bonusMultiplier: 300,
    waveBonus: 400,
    critical: 600,
    extraLife: 1000
};

// Prestige Upgrade Costs
let prestigeCosts = {
    damage: 1,
    money: 1,
    speed: 1,
    lives: 2,
    startingMoney: 3
};

// Player
let player = {
    x: canvas.width / 2 - 20,
    y: canvas.height - 60,
    width: 40,
    height: 40,
    speed: 3,
    color: '#00ff00'
};

// Arrays
let bullets = [];
let enemies = [];
let particles = [];

// Enemy Settings
let enemySettings = {
    rows: 3,
    cols: 8,
    speed: 1,
    direction: 1,
    dropAmount: 20
};

// Format numbers to compact notation using standard dictionary names
function formatNumber(num) {
    // Handle extremely large numbers (short scale naming with abbreviations)
    if (num >= 1e303) return (num / 1e303).toFixed(1).replace(/\.0$/, '') + ' Cen';  // Centillion
    if (num >= 1e273) return (num / 1e273).toFixed(1).replace(/\.0$/, '') + ' Noa';  // Nonagintillion
    if (num >= 1e243) return (num / 1e243).toFixed(1).replace(/\.0$/, '') + ' Oco';  // Octogintillion
    if (num >= 1e213) return (num / 1e213).toFixed(1).replace(/\.0$/, '') + ' Spg';  // Septuagintillion
    if (num >= 1e183) return (num / 1e183).toFixed(1).replace(/\.0$/, '') + ' Sxg';  // Sexagintillion
    if (num >= 1e153) return (num / 1e153).toFixed(1).replace(/\.0$/, '') + ' Qqa';  // Quinquagintillion
    if (num >= 1e123) return (num / 1e123).toFixed(1).replace(/\.0$/, '') + ' Qda';  // Quadragintillion
    if (num >= 1e120) return (num / 1e120).toFixed(1).replace(/\.0$/, '') + ' NvT';  // Noventrigintillion
    if (num >= 1e117) return (num / 1e117).toFixed(1).replace(/\.0$/, '') + ' OcT';  // Octotrigintillion
    if (num >= 1e114) return (num / 1e114).toFixed(1).replace(/\.0$/, '') + ' SpT';  // Septentrigintillion
    if (num >= 1e111) return (num / 1e111).toFixed(1).replace(/\.0$/, '') + ' SsT';  // Sestrigintillion
    if (num >= 1e108) return (num / 1e108).toFixed(1).replace(/\.0$/, '') + ' QnT';  // Quintrigintillion
    if (num >= 1e105) return (num / 1e105).toFixed(1).replace(/\.0$/, '') + ' QtT';  // Quattuortrigintillion
    if (num >= 1e102) return (num / 1e102).toFixed(1).replace(/\.0$/, '') + ' TrT';  // Trestrigintillion
    if (num >= 1e99) return (num / 1e99).toFixed(1).replace(/\.0$/, '') + ' DuT';  // Duotrigintillion
    if (num >= 1e96) return (num / 1e96).toFixed(1).replace(/\.0$/, '') + ' UnT';  // Untrigintillion
    if (num >= 1e93) return (num / 1e93).toFixed(1).replace(/\.0$/, '') + ' Trg';  // Trigintillion
    if (num >= 1e90) return (num / 1e90).toFixed(1).replace(/\.0$/, '') + ' NvV';  // Novemvigintillion
    if (num >= 1e87) return (num / 1e87).toFixed(1).replace(/\.0$/, '') + ' OcV';  // Octovigintillion
    if (num >= 1e84) return (num / 1e84).toFixed(1).replace(/\.0$/, '') + ' SpV';  // Septemvigintillion
    if (num >= 1e81) return (num / 1e81).toFixed(1).replace(/\.0$/, '') + ' SsV';  // Sesvigintillion
    if (num >= 1e78) return (num / 1e78).toFixed(1).replace(/\.0$/, '') + ' QnV';  // Quinvigintillion
    if (num >= 1e75) return (num / 1e75).toFixed(1).replace(/\.0$/, '') + ' QtV';  // Quattuorvigintillion
    if (num >= 1e72) return (num / 1e72).toFixed(1).replace(/\.0$/, '') + ' TrV';  // Tresvigintillion
    if (num >= 1e69) return (num / 1e69).toFixed(1).replace(/\.0$/, '') + ' DuV';  // Duovigintillion
    if (num >= 1e66) return (num / 1e66).toFixed(1).replace(/\.0$/, '') + ' UnV';  // Unvigintillion
    if (num >= 1e63) return (num / 1e63).toFixed(1).replace(/\.0$/, '') + ' Vig';  // Vigintillion
    if (num >= 1e60) return (num / 1e60).toFixed(1).replace(/\.0$/, '') + ' NoD';  // Novemdecillion
    if (num >= 1e57) return (num / 1e57).toFixed(1).replace(/\.0$/, '') + ' OcD';  // Octodecillion
    if (num >= 1e54) return (num / 1e54).toFixed(1).replace(/\.0$/, '') + ' SpD';  // Septendecillion
    if (num >= 1e51) return (num / 1e51).toFixed(1).replace(/\.0$/, '') + ' SxD';  // Sexdecillion
    if (num >= 1e48) return (num / 1e48).toFixed(1).replace(/\.0$/, '') + ' QnD';  // Quindecillion
    if (num >= 1e45) return (num / 1e45).toFixed(1).replace(/\.0$/, '') + ' QtD';  // Quattuordecillion
    if (num >= 1e42) return (num / 1e42).toFixed(1).replace(/\.0$/, '') + ' TrD';  // Tredecillion
    if (num >= 1e39) return (num / 1e39).toFixed(1).replace(/\.0$/, '') + ' DuD';  // Duodecillion
    if (num >= 1e36) return (num / 1e36).toFixed(1).replace(/\.0$/, '') + ' UnD';  // Undecillion
    if (num >= 1e33) return (num / 1e33).toFixed(1).replace(/\.0$/, '') + ' Dec';  // Decillion
    if (num >= 1e30) return (num / 1e30).toFixed(1).replace(/\.0$/, '') + ' Non';  // Nonillion
    if (num >= 1e27) return (num / 1e27).toFixed(1).replace(/\.0$/, '') + ' Oct';  // Octillion
    if (num >= 1e24) return (num / 1e24).toFixed(1).replace(/\.0$/, '') + ' Sep';  // Septillion
    if (num >= 1e21) return (num / 1e21).toFixed(1).replace(/\.0$/, '') + ' Sxt';  // Sextillion
    if (num >= 1e18) return (num / 1e18).toFixed(1).replace(/\.0$/, '') + ' Qnt';  // Quintillion
    if (num >= 1e15) return (num / 1e15).toFixed(1).replace(/\.0$/, '') + ' Qad';  // Quadrillion
    if (num >= 1e12) return (num / 1e12).toFixed(1).replace(/\.0$/, '') + ' Tri';  // Trillion
    if (num >= 1e9) return (num / 1e9).toFixed(1).replace(/\.0$/, '') + ' Bil';  // Billion
    if (num >= 1e6) return (num / 1e6).toFixed(1).replace(/\.0$/, '') + ' Mil';  // Million
    if (num >= 1e4) return (num / 1e4).toFixed(1).replace(/\.0$/, '') + 'K';  // Thousand
    return num.toLocaleString();  // Comma-separated for smaller numbers
}

// Initialize Game
function init() {
    // Load saved progress first
    loadGameState();
    
    // Apply prestige bonuses
    gameState.lives = 3 + prestigeUpgrades.lives;
    gameState.money = Math.max(gameState.money, prestigeUpgrades.startingMoney * 500);
    
    document.getElementById('lives').textContent = gameState.lives;
    document.getElementById('money').textContent = formatNumber(Math.floor(gameState.money));
    document.getElementById('prestigePoints').textContent = formatNumber(gameState.prestigePoints);
    document.getElementById('rebirths').textContent = formatNumber(gameState.rebirths);
    
    // Pause the game if not on wave 1 (returning player)
    if (gameState.wave > 1) {
        gameState.isPaused = true;
        document.getElementById('pauseScreen').classList.remove('hidden');
    }
    
    spawnWave();
    updateAllUI();
    gameLoop();
}

// Spawn Wave
function spawnWave() {
    enemies = [];
    const rows = Math.min(3 + Math.floor(gameState.wave / 3), 6);
    const cols = Math.min(8 + Math.floor(gameState.wave / 5), 12);
    
    const enemyWidth = 40;
    const enemyHeight = 30;
    const spacing = 20;
    const startX = (canvas.width - (cols * (enemyWidth + spacing))) / 2;
    const startY = 50;
    
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            enemies.push({
                x: startX + col * (enemyWidth + spacing),
                y: startY + row * (enemyHeight + spacing),
                width: enemyWidth,
                height: enemyHeight,
                hp: 1 + Math.floor(gameState.wave / 5),
                maxHp: 1 + Math.floor(gameState.wave / 5),
                color: getEnemyColor(row)
            });
        }
    }
    
    // Increase difficulty
    enemySettings.speed = 1 + (gameState.wave * 0.1);
}

function getEnemyColor(row) {
    const colors = ['#ff0000', '#ff6600', '#ffff00', '#00ff00', '#00ffff', '#0066ff'];
    return colors[row % colors.length];
}

// Game Loop
function gameLoop() {
    if (!gameState.isPaused && !gameState.isGameOver) {
        update();
        render();
    }
    requestAnimationFrame(gameLoop);
}

// Update
function update() {
    // Move player
    if (gameState.keys['ArrowLeft'] || gameState.keys['a'] || gameState.keys['A']) {
        player.x -= player.speed * (1 + upgrades.speed * 0.2 + prestigeUpgrades.speed * 0.15);
    }
    if (gameState.keys['ArrowRight'] || gameState.keys['d'] || gameState.keys['D']) {
        player.x += player.speed * (1 + upgrades.speed * 0.2 + prestigeUpgrades.speed * 0.15);
    }
    
    // Keep player in bounds
    player.x = Math.max(0, Math.min(canvas.width - player.width, player.x));
    
    // Auto-shoot (removed manual shooting)
    shoot();
    
    // Update bullets
    bullets.forEach((bullet, index) => {
        bullet.y -= bullet.speed;
        if (bullet.y < 0) {
            bullets.splice(index, 1);
        }
    });
    
    // Update particles
    particles.forEach((particle, index) => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.life -= 1;
        if (particle.life <= 0) {
            particles.splice(index, 1);
        }
    });
    
    // Check bullet collision
    bullets.forEach((bullet, bIndex) => {
        enemies.forEach((enemy, eIndex) => {
            if (checkCollision(bullet, enemy)) {
                const baseDamage = upgrades.damage * (1 + prestigeUpgrades.damage * 0.2);
                const isCrit = Math.random() < (upgrades.critical * 0.05);
                const damage = isCrit ? baseDamage * 2 : baseDamage;
                
                enemy.hp -= damage;
                bullets.splice(bIndex, 1);
                
                // Create hit particle
                createParticles(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, isCrit ? '#ffd700' : '#fff', 5);
                
                if (enemy.hp <= 0) {
                    // Enemy killed
                    const baseMoney = 10 * upgrades.moneyPerKill;
                    const moneyBonus = 1 + ((upgrades.bonusMultiplier - 1) * 0.1) + (prestigeUpgrades.money * 0.25);
                    let earnedMoney = baseMoney * moneyBonus;
                    
                    if (isCrit) {
                        earnedMoney *= 2;
                    }
                    
                    gameState.money += earnedMoney;
                    gameState.totalMoneyEarned += earnedMoney;
                    gameState.moneyThisRun += earnedMoney;
                    gameState.score += 100;
                    
                    createParticles(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, enemy.color, 10);
                    enemies.splice(eIndex, 1);
                    
                    updateUI();
                }
            }
        });
    });
    
    // Move enemies
    let hitEdge = false;
    enemies.forEach(enemy => {
        enemy.x += enemySettings.speed * enemySettings.direction;
        if (enemy.x <= 0 || enemy.x + enemy.width >= canvas.width) {
            hitEdge = true;
        }
    });
    
    if (hitEdge) {
        enemySettings.direction *= -1;
        enemies.forEach(enemy => {
            enemy.y += enemySettings.dropAmount;
        });
    }
    
    // Check if enemies reached bottom
    enemies.forEach(enemy => {
        if (enemy.y + enemy.height >= player.y) {
            loseLife();
        }
    });
    
    // Check if wave cleared
    if (enemies.length === 0) {
        nextWave();
    }
}

// Render
function render() {
    // Clear canvas
    ctx.fillStyle = '#000428';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw stars background
    drawStars();
    
    // Draw player
    ctx.fillStyle = player.color;
    ctx.fillRect(player.x, player.y, player.width, player.height);
    
    // Draw player details
    ctx.fillStyle = '#00ff00';
    ctx.beginPath();
    ctx.moveTo(player.x + player.width / 2, player.y);
    ctx.lineTo(player.x, player.y + player.height);
    ctx.lineTo(player.x + player.width, player.y + player.height);
    ctx.closePath();
    ctx.fill();
    
    // Draw bullets
    bullets.forEach(bullet => {
        ctx.fillStyle = bullet.color;
        ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
        
        // Bullet glow
        ctx.shadowBlur = 10;
        ctx.shadowColor = bullet.color;
        ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
        ctx.shadowBlur = 0;
    });
    
    // Draw enemies
    enemies.forEach(enemy => {
        ctx.fillStyle = enemy.color;
        ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
        
        // HP bar
        if (enemy.hp < enemy.maxHp) {
            const hpBarWidth = enemy.width;
            const hpBarHeight = 4;
            const hpPercent = enemy.hp / enemy.maxHp;
            
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(enemy.x, enemy.y - 8, hpBarWidth, hpBarHeight);
            ctx.fillStyle = '#00ff00';
            ctx.fillRect(enemy.x, enemy.y - 8, hpBarWidth * hpPercent, hpBarHeight);
        }
    });
    
    // Draw particles
    particles.forEach(particle => {
        ctx.fillStyle = particle.color;
        ctx.globalAlpha = particle.life / particle.maxLife;
        ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    });
    ctx.globalAlpha = 1;
}

// Background stars
let stars = [];
function drawStars() {
    if (stars.length === 0) {
        for (let i = 0; i < 100; i++) {
            stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 2
            });
        }
    }
    
    ctx.fillStyle = '#ffffff';
    stars.forEach(star => {
        ctx.fillRect(star.x, star.y, star.size, star.size);
    });
}

// Shoot
function shoot() {
    const now = Date.now();
    const fireDelay = 300 / (1 + upgrades.fireRate * 0.3);
    
    if (now - gameState.lastShot > fireDelay) {
        gameState.lastShot = now;
        
        const bulletSpeed = 8 + upgrades.bulletSpeed * 2;
        const shots = 1 + upgrades.multiShot;
        
        if (shots === 1) {
            bullets.push({
                x: player.x + player.width / 2 - 2,
                y: player.y,
                width: 4,
                height: 12,
                speed: bulletSpeed,
                color: '#00ffff'
            });
        } else {
            // Multi-shot spread
            const spreadAngle = 30;
            for (let i = 0; i < shots; i++) {
                const offset = (i - (shots - 1) / 2) * 15;
                bullets.push({
                    x: player.x + player.width / 2 - 2 + offset,
                    y: player.y,
                    width: 4,
                    height: 12,
                    speed: bulletSpeed,
                    color: '#00ffff'
                });
            }
        }
    }
}

// Collision Detection
function checkCollision(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}

// Create Particles
function createParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            size: Math.random() * 3 + 2,
            color: color,
            life: 30,
            maxLife: 30
        });
    }
}

// Lose Life
function loseLife() {
    gameState.lives--;
    document.getElementById('lives').textContent = gameState.lives;
    
    if (gameState.lives <= 0) {
        gameOver();
    } else {
        // Reset enemies position
        enemies.forEach(enemy => {
            enemy.y = Math.min(enemy.y, 100);
        });
    }
}

// Next Wave
function nextWave() {
    gameState.wave++;
    document.getElementById('wave').textContent = formatNumber(gameState.wave);
    
    // Wave bonus
    if (upgrades.waveBonus > 0) {
        const waveBonus = 50 * upgrades.waveBonus * (1 + prestigeUpgrades.money * 0.25);
        gameState.money += waveBonus;
        gameState.totalMoneyEarned += waveBonus;
        gameState.moneyThisRun += waveBonus;
        updateUI();
    }
    
    spawnWave();
}

// Game Over
function gameOver() {
    gameState.isGameOver = true;
    
    // Save game state before showing modal
    saveGameState();
    
    // Update modal with final stats
    document.getElementById('finalScore').textContent = formatNumber(gameState.score);
    document.getElementById('finalWave').textContent = formatNumber(gameState.wave);
    document.getElementById('finalMoney').textContent = formatNumber(Math.floor(gameState.moneyThisRun));
    
    // Show game over modal
    showGameOverModal();
}

// Game Over Modal Functions
function showGameOverModal() {
    const gameOverModal = document.getElementById('gameOverModal');
    if (gameOverModal) {
        gameOverModal.classList.add('show');
    }
}

function hideGameOverModal() {
    const gameOverModal = document.getElementById('gameOverModal');
    if (gameOverModal) {
        gameOverModal.classList.remove('show');
    }
}

function handleGameOverModalClick(e) {
    const gameOverModal = document.getElementById('gameOverModal');
    if (e.target === gameOverModal) {
        // Don't allow closing by clicking overlay for game over
        // Player must click the button to continue
    }
}

// Restart Game
function restartGame() {
    hideGameOverModal();
    
    gameState.isGameOver = false;
    gameState.lives = 3 + prestigeUpgrades.lives;
    gameState.score = 0;
    gameState.wave = 1;
    gameState.moneyThisRun = 0;
    bullets = [];
    particles = [];
    enemies = [];
    
    // Reset enemy settings for new run
    enemySettings.rows = 3;
    enemySettings.cols = 8;
    enemySettings.speed = 1;
    enemySettings.direction = 1;
    
    // Update displays
    document.getElementById('lives').textContent = gameState.lives;
    document.getElementById('score').textContent = '0';
    document.getElementById('wave').textContent = '1';
    
    // Spawn first wave
    spawnWave();
    
    // Save the reset state
    saveGameState();
}

// Pause/Resume
function togglePause() {
    gameState.isPaused = !gameState.isPaused;
    if (gameState.isPaused) {
        document.getElementById('pauseScreen').classList.remove('hidden');
    } else {
        document.getElementById('pauseScreen').classList.add('hidden');
    }
}

// Update UI
function updateUI() {
    document.getElementById('money').textContent = formatNumber(Math.floor(gameState.money));
    document.getElementById('score').textContent = formatNumber(gameState.score);
    document.getElementById('wave').textContent = formatNumber(gameState.wave);
    updatePotentialPrestige();
    saveGameState();
}

function updateAllUI() {
    updateUI();
    updateUpgradeUI();
}

// Update bulk button labels based on shift key
function updateBulkButtonLabels() {
    const bulkButtons = document.querySelectorAll('.upgrade-btn-bulk');
    const multiplier = gameState.shiftHeld ? 100 : 10;
    bulkButtons.forEach(btn => {
        btn.textContent = `x${multiplier}`;
        if (gameState.shiftHeld) {
            btn.classList.add('shift-active');
        } else {
            btn.classList.remove('shift-active');
        }
    });
    // Update button states to reflect new affordability requirements
    updateButtonStates();
}

// Get current bulk buy multiplier
function getBulkMultiplier() {
    return gameState.shiftHeld ? 100 : 10;
}

function updateUpgradeUI() {
    // Combat upgrades
    document.getElementById('fireRateLevel').textContent = formatNumber(upgrades.fireRate);
    document.getElementById('fireRateCost').textContent = formatNumber(upgradeCosts.fireRate);
    document.getElementById('damageLevel').textContent = formatNumber(upgrades.damage);
    document.getElementById('damageCost').textContent = formatNumber(upgradeCosts.damage);
    document.getElementById('speedLevel').textContent = formatNumber(upgrades.speed);
    document.getElementById('speedCost').textContent = formatNumber(upgradeCosts.speed);
    document.getElementById('multiShotLevel').textContent = formatNumber(upgrades.multiShot);
    document.getElementById('multiShotCost').textContent = formatNumber(upgradeCosts.multiShot);
    document.getElementById('bulletSpeedLevel').textContent = formatNumber(upgrades.bulletSpeed);
    document.getElementById('bulletSpeedCost').textContent = formatNumber(upgradeCosts.bulletSpeed);
    document.getElementById('extraLifeCost').textContent = formatNumber(upgradeCosts.extraLife);
    
    // Economy upgrades
    document.getElementById('moneyPerKillLevel').textContent = formatNumber(upgrades.moneyPerKill);
    document.getElementById('moneyPerKillCost').textContent = formatNumber(upgradeCosts.moneyPerKill);
    document.getElementById('bonusMultiplierLevel').textContent = formatNumber(upgrades.bonusMultiplier);
    document.getElementById('bonusMultiplierCost').textContent = formatNumber(upgradeCosts.bonusMultiplier);
    document.getElementById('waveBonusLevel').textContent = formatNumber(upgrades.waveBonus);
    document.getElementById('waveBonusCost').textContent = formatNumber(upgradeCosts.waveBonus);
    document.getElementById('criticalLevel').textContent = formatNumber(upgrades.critical);
    document.getElementById('criticalCost').textContent = formatNumber(upgradeCosts.critical);
    
    // Prestige upgrades
    document.getElementById('prestigePointsDisplay').textContent = formatNumber(gameState.prestigePoints);
    document.getElementById('prestigeDamageLevel').textContent = formatNumber(prestigeUpgrades.damage);
    document.getElementById('prestigeDamageCost').textContent = formatNumber(prestigeCosts.damage);
    document.getElementById('prestigeMoneyLevel').textContent = formatNumber(prestigeUpgrades.money);
    document.getElementById('prestigeMoneyCost').textContent = formatNumber(prestigeCosts.money);
    document.getElementById('prestigeSpeedLevel').textContent = formatNumber(prestigeUpgrades.speed);
    document.getElementById('prestigeSpeedCost').textContent = formatNumber(prestigeCosts.speed);
    document.getElementById('prestigeLivesLevel').textContent = formatNumber(prestigeUpgrades.lives);
    document.getElementById('prestigeLivesCost').textContent = formatNumber(prestigeCosts.lives);
    document.getElementById('startingMoneyLevel').textContent = formatNumber(prestigeUpgrades.startingMoney);
    document.getElementById('startingMoneyCost').textContent = formatNumber(prestigeCosts.startingMoney);
    
    // Enable/disable buttons
    updateButtonStates();
}

// Helper function to calculate cost for buying X upgrades
function calculateBulkCost(type, count) {
    let totalCost = 0;
    let currentCost = upgradeCosts[type];
    
    for (let i = 0; i < count; i++) {
        totalCost += currentCost;
        currentCost = Math.floor(currentCost * 1.5);
    }
    
    return totalCost;
}

// Helper function to check if can afford at least some bulk purchases
function canAffordBulk(type, count) {
    let totalCost = 0;
    let currentCost = upgradeCosts[type];
    
    for (let i = 0; i < count; i++) {
        if (gameState.money >= totalCost + currentCost) {
            totalCost += currentCost;
            currentCost = Math.floor(currentCost * 1.5);
        } else {
            return i; // Returns how many can be afforded
        }
    }
    
    return count; // Can afford all
}

function updateButtonStates() {
    // Regular upgrades - single buy
    document.getElementById('fireRateBtn').disabled = gameState.money < upgradeCosts.fireRate;
    document.getElementById('damageBtn').disabled = gameState.money < upgradeCosts.damage;
    document.getElementById('speedBtn').disabled = gameState.money < upgradeCosts.speed;
    document.getElementById('multiShotBtn').disabled = gameState.money < upgradeCosts.multiShot;
    document.getElementById('bulletSpeedBtn').disabled = gameState.money < upgradeCosts.bulletSpeed;
    document.getElementById('extraLifeBtn').disabled = gameState.money < upgradeCosts.extraLife;
    document.getElementById('moneyPerKillBtn').disabled = gameState.money < upgradeCosts.moneyPerKill;
    document.getElementById('bonusMultiplierBtn').disabled = gameState.money < upgradeCosts.bonusMultiplier;
    document.getElementById('waveBonusBtn').disabled = gameState.money < upgradeCosts.waveBonus;
    document.getElementById('criticalBtn').disabled = gameState.money < upgradeCosts.critical;
    
    // Bulk buy buttons - check affordability based on current multiplier (10 or 100)
    ['fireRate', 'damage', 'speed', 'multiShot', 'bulletSpeed', 'moneyPerKill', 'bonusMultiplier', 'waveBonus', 'critical'].forEach(type => {
        const multiplier = getBulkMultiplier();
        const canAfford = canAffordBulk(type, multiplier) >= multiplier;
        document.getElementById(type + 'Btn10').disabled = !canAfford;
    });
    
    // Prestige upgrades - single buy
    document.getElementById('prestigeDamageBtn').disabled = gameState.prestigePoints < prestigeCosts.damage;
    document.getElementById('prestigeMoneyBtn').disabled = gameState.prestigePoints < prestigeCosts.money;
    document.getElementById('prestigeSpeedBtn').disabled = gameState.prestigePoints < prestigeCosts.speed;
    document.getElementById('prestigeLivesBtn').disabled = gameState.prestigePoints < prestigeCosts.lives;
    document.getElementById('startingMoneyBtn').disabled = gameState.prestigePoints < prestigeCosts.startingMoney;
    
    // Prestige bulk buy buttons - check affordability based on current multiplier (10 or 100)
    ['damage', 'money', 'speed'].forEach(type => {
        const multiplier = getBulkMultiplier();
        const canAfford = canAffordPrestigeBulk(type, multiplier) >= multiplier;
        document.getElementById('prestige' + type.charAt(0).toUpperCase() + type.slice(1) + 'Btn10').disabled = !canAfford;
    });
    
    // Rebirth button
    const potentialPrestige = Math.floor(gameState.totalMoneyEarned / 1000000);
    document.getElementById('rebirthBtn').disabled = potentialPrestige === 0;
}

function updatePotentialPrestige() {
    const potential = Math.floor(gameState.totalMoneyEarned / 1000000);
    document.getElementById('potentialPrestige').textContent = formatNumber(potential);
    updateButtonStates();
}

// Buy Upgrades
function buyUpgrade(type, count = 1) {
    let totalCost = 0;
    let currentCost = upgradeCosts[type];
    let bought = 0;
    
    // Calculate total cost for buying 'count' upgrades
    for (let i = 0; i < count; i++) {
        if (gameState.money >= totalCost + currentCost) {
            totalCost += currentCost;
            currentCost = Math.floor(currentCost * 1.5);
            bought++;
        } else {
            break;
        }
    }
    
    if (bought > 0) {
        gameState.money -= totalCost;
        upgrades[type] += bought;
        
        // Update cost to the next cost after all purchases
        let newCost = upgradeCosts[type];
        for (let i = 0; i < bought; i++) {
            newCost = Math.floor(newCost * 1.5);
        }
        upgradeCosts[type] = newCost;
        
        updateAllUI();
        saveGameState();
    }
    
    return bought;
}

function buyUpgradeMax(type) {
    let totalCost = 0;
    let currentCost = upgradeCosts[type];
    let bought = 0;
    
    // Keep buying until we can't afford anymore
    while (gameState.money >= totalCost + currentCost) {
        totalCost += currentCost;
        currentCost = Math.floor(currentCost * 1.5);
        bought++;
        
        // Safety limit to prevent infinite loops
        if (bought >= 1000) break;
    }
    
    if (bought > 0) {
        gameState.money -= totalCost;
        upgrades[type] += bought;
        
        // Update cost
        upgradeCosts[type] = currentCost;
        
        updateAllUI();
        saveGameState();
    }
    
    return bought;
}

function buyExtraLife() {
    const cost = upgradeCosts.extraLife;
    if (gameState.money >= cost) {
        gameState.money -= cost;
        gameState.lives++;
        
        document.getElementById('lives').textContent = gameState.lives;
        document.getElementById('extraLivesCount').textContent = (parseInt(document.getElementById('extraLivesCount').textContent) || 0) + 1;
        
        // Increase cost significantly
        upgradeCosts.extraLife = Math.floor(cost * 2);
        
        updateAllUI();
        saveGameState();
    }
}

function buyPrestigeUpgrade(type, count = 1) {
    let totalCost = 0;
    let currentCost = prestigeCosts[type];
    let bought = 0;
    
    // Calculate total cost for buying 'count' upgrades
    for (let i = 0; i < count; i++) {
        if (gameState.prestigePoints >= totalCost + currentCost) {
            totalCost += currentCost;
            currentCost = Math.floor(currentCost * 1.5);
            bought++;
        } else {
            break;
        }
    }
    
    if (bought > 0) {
        gameState.prestigePoints -= totalCost;
        prestigeUpgrades[type] += bought;
        
        // Update cost to the next cost after all purchases
        let newCost = prestigeCosts[type];
        for (let i = 0; i < bought; i++) {
            newCost = Math.floor(newCost * 1.5);
        }
        prestigeCosts[type] = newCost;
        
        document.getElementById('prestigePoints').textContent = formatNumber(gameState.prestigePoints);
        updateAllUI();
        saveGameState();
    }
    
    return bought;
}

// Helper function to check if can afford prestige bulk purchases
function canAffordPrestigeBulk(type, count) {
    let totalCost = 0;
    let currentCost = prestigeCosts[type];
    
    for (let i = 0; i < count; i++) {
        if (gameState.prestigePoints >= totalCost + currentCost) {
            totalCost += currentCost;
            currentCost = Math.floor(currentCost * 1.5);
        } else {
            return i; // Returns how many can be afforded
        }
    }
    
    return count; // Can afford all
}

// Rebirth
function performRebirth() {
    const potentialPrestige = Math.floor(gameState.totalMoneyEarned / 1000000);
    
    if (potentialPrestige === 0) {
        return;
    }
    
    // Pause the game
    if (!gameState.isPaused) {
        gameState.isPaused = true;
    }
    
    // Show modal instead of confirm dialog
    document.getElementById('modalPrestigePoints').textContent = formatNumber(potentialPrestige);
    document.getElementById('rebirthModal').classList.add('show');
}

function confirmRebirth() {
    const potentialPrestige = Math.floor(gameState.totalMoneyEarned / 1000000);
    
    // Gain prestige points
    gameState.prestigePoints += potentialPrestige;
    gameState.rebirths++;
    
    // Reset everything except prestige
    gameState.money = prestigeUpgrades.startingMoney * 500;
    gameState.totalMoneyEarned = 0;
    gameState.moneyThisRun = 0;
    gameState.score = 0;
    gameState.lives = 3 + prestigeUpgrades.lives;
    gameState.wave = 1;
    
    // Reset upgrades
    upgrades = {
        fireRate: 1,
        damage: 1,
        speed: 1,
        multiShot: 0,
        bulletSpeed: 1,
        moneyPerKill: 1,
        bonusMultiplier: 1,
        waveBonus: 0,
        critical: 0
    };
    
    // Reset costs
    upgradeCosts = {
        fireRate: 100,
        damage: 150,
        speed: 120,
        multiShot: 500,
        bulletSpeed: 200,
        moneyPerKill: 200,
        bonusMultiplier: 300,
        waveBonus: 400,
        critical: 600,
        extraLife: 1000
    };
    
    // Reset game
    bullets = [];
    enemies = [];
    particles = [];
    gameState.isGameOver = false;
    hideGameOverModal();
    
    // Update UI
    document.getElementById('prestigePoints').textContent = formatNumber(gameState.prestigePoints);
    document.getElementById('rebirths').textContent = formatNumber(gameState.rebirths);
    document.getElementById('extraLivesCount').textContent = 0;
    
    // Hide modal
    document.getElementById('rebirthModal').classList.remove('show');
    
    // Resume the game
    gameState.isPaused = false;
    
    spawnWave();
    updateAllUI();
    saveGameState();
}

function cancelRebirth() {
    document.getElementById('rebirthModal').classList.remove('show');
    
    // Resume the game
    if (gameState.isPaused && !gameState.isGameOver) {
        gameState.isPaused = false;
    }
}

// Wipe Progress Functions
function showWipeWarning1() {
    // Pause the game
    if (!gameState.isPaused) {
        gameState.isPaused = true;
    }
    
    document.getElementById('wipeWarning1Modal').classList.add('show');
}

function cancelWipeWarning1() {
    document.getElementById('wipeWarning1Modal').classList.remove('show');
    
    // Resume the game
    if (gameState.isPaused && !gameState.isGameOver) {
        gameState.isPaused = false;
    }
}

function showWipeWarning2() {
    // Close first modal and show second
    document.getElementById('wipeWarning1Modal').classList.remove('show');
    document.getElementById('wipeWarning2Modal').classList.add('show');
}

function cancelWipeWarning2() {
    document.getElementById('wipeWarning2Modal').classList.remove('show');
    
    // Resume the game
    if (gameState.isPaused && !gameState.isGameOver) {
        gameState.isPaused = false;
    }
}

function confirmWipeProgress() {
    // Clear localStorage completely
    localStorage.removeItem('spaceInvadersGameState');
    
    // Reset EVERYTHING to initial state
    gameState = {
        money: 0,
        totalMoneyEarned: 0,
        moneyThisRun: 0,
        score: 0,
        lives: 3,
        wave: 1,
        isPaused: false,
        isGameOver: false,
        prestigePoints: 0,
        rebirths: 0,
        keys: {}
    };
    
    upgrades = {
        fireRate: 1,
        damage: 1,
        speed: 1,
        multiShot: 0,
        bulletSpeed: 1,
        moneyPerKill: 1,
        bonusMultiplier: 1,
        waveBonus: 0,
        critical: 0,
        extraLives: 0
    };
    
    prestigeUpgrades = {
        damage: 0,
        money: 0,
        speed: 0,
        lives: 0,
        startingMoney: 0
    };
    
    upgradeCosts = {
        fireRate: 100,
        damage: 150,
        speed: 120,
        multiShot: 500,
        bulletSpeed: 200,
        moneyPerKill: 200,
        bonusMultiplier: 300,
        waveBonus: 400,
        critical: 600,
        extraLife: 1000
    };
    
    prestigeCosts = {
        damage: 1,
        money: 1,
        speed: 1,
        lives: 5,
        startingMoney: 3
    };
    
    // Reset player to initial position and state
    player.x = canvas.width / 2 - 25;
    player.y = canvas.height - 70;
    player.width = 50;
    player.height = 30;
    player.speed = 5;
    player.shootCooldown = 0;
    
    // Reset enemy settings
    enemySettings.speed = 1;
    enemySettings.direction = 1;
    
    // Clear all game arrays
    bullets = [];
    enemies = [];
    particles = [];
    
    // Reset game state flags
    gameState.isGameOver = false;
    gameState.isPaused = false;
    
    // Hide all overlays and modals
    hideGameOverModal();
    document.getElementById('pauseScreen').classList.add('hidden');
    
    // Close modal
    document.getElementById('wipeWarning2Modal').classList.remove('show');
    
    // Reset wave to 1 and spawn fresh wave
    gameState.wave = 1;
    spawnWave();
    
    // Update all UI elements to reflect fresh state
    updateAllUI();
    
    // Save the fresh state
    saveGameState();
}

// Save and Load Game State
function saveGameState() {
    const saveData = {
        gameState: {
            money: gameState.money,
            totalMoneyEarned: gameState.totalMoneyEarned,
            score: gameState.score,
            lives: gameState.lives,
            wave: gameState.wave,
            prestigePoints: gameState.prestigePoints,
            rebirths: gameState.rebirths
        },
        player: {
            x: player.x
        },
        upgrades: upgrades,
        upgradeCosts: upgradeCosts,
        prestigeUpgrades: prestigeUpgrades,
        prestigeCosts: prestigeCosts
    };
    
    localStorage.setItem('spaceInvadersState', JSON.stringify(saveData));
}

function loadGameState() {
    const savedState = localStorage.getItem('spaceInvadersState');
    if (savedState) {
        try {
            const saveData = JSON.parse(savedState);
            
            // Load game state
            if (saveData.gameState) {
                gameState.money = saveData.gameState.money || 0;
                gameState.totalMoneyEarned = saveData.gameState.totalMoneyEarned || 0;
                gameState.score = saveData.gameState.score || 0;
                gameState.lives = saveData.gameState.lives || 3;
                gameState.wave = saveData.gameState.wave || 1;
                gameState.prestigePoints = saveData.gameState.prestigePoints || 0;
                gameState.rebirths = saveData.gameState.rebirths || 0;
            }
            
            // Load player position
            if (saveData.player) {
                player.x = saveData.player.x || (canvas.width / 2 - 20);
            }
            
            // Load upgrades
            if (saveData.upgrades) {
                upgrades = saveData.upgrades;
            }
            
            // Load upgrade costs
            if (saveData.upgradeCosts) {
                upgradeCosts = saveData.upgradeCosts;
            }
            
            // Load prestige upgrades
            if (saveData.prestigeUpgrades) {
                prestigeUpgrades = saveData.prestigeUpgrades;
            }
            
            // Load prestige costs
            if (saveData.prestigeCosts) {
                prestigeCosts = saveData.prestigeCosts;
            }
        } catch (e) {
            console.error('Error loading save data:', e);
        }
    }
}

// Event Listeners
document.addEventListener('keydown', (e) => {
    gameState.keys[e.key] = true;
    
    // Track shift key for bulk buy modifier
    if (e.key === 'Shift') {
        gameState.shiftHeld = true;
        updateBulkButtonLabels();
    }
    
    if (e.key === 'p' || e.key === 'P') {
        if (!gameState.isGameOver) {
            togglePause();
        }
    }
});

document.addEventListener('keyup', (e) => {
    gameState.keys[e.key] = false;
    
    // Track shift key release
    if (e.key === 'Shift') {
        gameState.shiftHeld = false;
        updateBulkButtonLabels();
    }
});

// Tab switching - refactored to work per panel
document.querySelectorAll('.upgrade-panel').forEach(panel => {
    const tabButtons = panel.querySelectorAll('.tab-btn');
    const tabContents = panel.querySelectorAll('.tab-content');
    
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            
            // Only affect tabs within this panel
            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            const targetTab = panel.querySelector(`#${tab}-tab`);
            if (targetTab) {
                targetTab.classList.add('active');
            }
        });
    });
});

// Upgrade buttons
document.getElementById('fireRateBtn').addEventListener('click', () => buyUpgrade('fireRate'));
document.getElementById('fireRateBtn10').addEventListener('click', () => buyUpgrade('fireRate', getBulkMultiplier()));

document.getElementById('damageBtn').addEventListener('click', () => buyUpgrade('damage'));
document.getElementById('damageBtn10').addEventListener('click', () => buyUpgrade('damage', getBulkMultiplier()));

document.getElementById('speedBtn').addEventListener('click', () => buyUpgrade('speed'));
document.getElementById('speedBtn10').addEventListener('click', () => buyUpgrade('speed', getBulkMultiplier()));

document.getElementById('multiShotBtn').addEventListener('click', () => buyUpgrade('multiShot'));
document.getElementById('multiShotBtn10').addEventListener('click', () => buyUpgrade('multiShot', getBulkMultiplier()));

document.getElementById('bulletSpeedBtn').addEventListener('click', () => buyUpgrade('bulletSpeed'));
document.getElementById('bulletSpeedBtn10').addEventListener('click', () => buyUpgrade('bulletSpeed', getBulkMultiplier()));

document.getElementById('extraLifeBtn').addEventListener('click', () => buyExtraLife());

document.getElementById('moneyPerKillBtn').addEventListener('click', () => buyUpgrade('moneyPerKill'));
document.getElementById('moneyPerKillBtn10').addEventListener('click', () => buyUpgrade('moneyPerKill', getBulkMultiplier()));

document.getElementById('bonusMultiplierBtn').addEventListener('click', () => buyUpgrade('bonusMultiplier'));
document.getElementById('bonusMultiplierBtn10').addEventListener('click', () => buyUpgrade('bonusMultiplier', getBulkMultiplier()));

document.getElementById('waveBonusBtn').addEventListener('click', () => buyUpgrade('waveBonus'));
document.getElementById('waveBonusBtn10').addEventListener('click', () => buyUpgrade('waveBonus', getBulkMultiplier()));

document.getElementById('criticalBtn').addEventListener('click', () => buyUpgrade('critical'));
document.getElementById('criticalBtn10').addEventListener('click', () => buyUpgrade('critical', getBulkMultiplier()));

// Prestige buttons - single buy
document.getElementById('prestigeDamageBtn').addEventListener('click', () => buyPrestigeUpgrade('damage'));
document.getElementById('prestigeMoneyBtn').addEventListener('click', () => buyPrestigeUpgrade('money'));
document.getElementById('prestigeSpeedBtn').addEventListener('click', () => buyPrestigeUpgrade('speed'));
document.getElementById('prestigeLivesBtn').addEventListener('click', () => buyPrestigeUpgrade('lives'));
document.getElementById('startingMoneyBtn').addEventListener('click', () => buyPrestigeUpgrade('startingMoney'));

// Prestige bulk buy buttons (x10 or x100 with shift)
document.getElementById('prestigeDamageBtn10').addEventListener('click', () => buyPrestigeUpgrade('damage', getBulkMultiplier()));
document.getElementById('prestigeMoneyBtn10').addEventListener('click', () => buyPrestigeUpgrade('money', getBulkMultiplier()));
document.getElementById('prestigeSpeedBtn10').addEventListener('click', () => buyPrestigeUpgrade('speed', getBulkMultiplier()));

// Rebirth button
document.getElementById('rebirthBtn').addEventListener('click', performRebirth);

// Modal buttons
document.getElementById('confirmRebirthBtn').addEventListener('click', confirmRebirth);
document.getElementById('cancelRebirthBtn').addEventListener('click', cancelRebirth);

// Wipe Progress buttons
document.getElementById('wipeProgressBtn').addEventListener('click', showWipeWarning1);
document.getElementById('wipeWarning1YesBtn').addEventListener('click', showWipeWarning2);
document.getElementById('wipeWarning1NoBtn').addEventListener('click', cancelWipeWarning1);
document.getElementById('wipeWarning2YesBtn').addEventListener('click', confirmWipeProgress);
document.getElementById('wipeWarning2NoBtn').addEventListener('click', cancelWipeWarning2);

// Game Over Modal
const gameOverModal = document.getElementById('gameOverModal');
const gameOverNewGame = document.getElementById('gameOverNewGame');

if (gameOverNewGame) {
    gameOverNewGame.addEventListener('click', restartGame);
}

if (gameOverModal) {
    gameOverModal.addEventListener('click', handleGameOverModalClick);
}

// Pause/Resume buttons
document.getElementById('resumeBtn').addEventListener('click', togglePause);

// Number reference drawer toggle
const numberRefToggle = document.getElementById('numberRefToggle');
const numberRefContent = document.getElementById('numberRefContent');

numberRefToggle.addEventListener('click', () => {
    const isOpen = numberRefContent.classList.toggle('open');
    numberRefToggle.classList.toggle('active', isOpen);
});

// Panel toggle for mobile
const panelToggle = document.getElementById('panelToggle');
const upgradePanel = document.querySelector('.upgrade-panel.right-panel');

if (panelToggle && upgradePanel) {
    panelToggle.addEventListener('click', () => {
        const isActive = upgradePanel.classList.toggle('active');
        panelToggle.querySelector('.toggle-icon').textContent = isActive ? '▶' : '◀';
    });
}

// Night mode toggle
const nightModeToggle = document.getElementById('nightModeToggle');

// Load saved night mode preference
if (localStorage.getItem('spaceInvadersNightMode') === 'true') {
    document.body.classList.add('night-mode');
}

nightModeToggle.addEventListener('click', () => {
    document.body.classList.toggle('night-mode');
    const isNightMode = document.body.classList.contains('night-mode');
    localStorage.setItem('spaceInvadersNightMode', isNightMode);
});

// Touch controls
const touchLeftBtn = document.getElementById('touchLeftBtn');
const touchRightBtn = document.getElementById('touchRightBtn');
const touchPauseBtn = document.getElementById('touchPauseBtn');

// Left button
touchLeftBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    gameState.keys['ArrowLeft'] = true;
});

touchLeftBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    gameState.keys['ArrowLeft'] = false;
});

touchLeftBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    gameState.keys['ArrowLeft'] = true;
});

touchLeftBtn.addEventListener('mouseup', (e) => {
    e.preventDefault();
    gameState.keys['ArrowLeft'] = false;
});

touchLeftBtn.addEventListener('mouseleave', () => {
    gameState.keys['ArrowLeft'] = false;
});

// Right button
touchRightBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    gameState.keys['ArrowRight'] = true;
});

touchRightBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    gameState.keys['ArrowRight'] = false;
});

touchRightBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    gameState.keys['ArrowRight'] = true;
});

touchRightBtn.addEventListener('mouseup', (e) => {
    e.preventDefault();
    gameState.keys['ArrowRight'] = false;
});

touchRightBtn.addEventListener('mouseleave', () => {
    gameState.keys['ArrowRight'] = false;
});

// Pause button
touchPauseBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (!gameState.isGameOver) {
        togglePause();
    }
});

// Drawer toggle functionality
const drawerToggle = document.getElementById('drawerToggle');
const controlBar = document.querySelector('.control-bar');

drawerToggle.addEventListener('click', () => {
    controlBar.classList.toggle('open');
    drawerToggle.classList.toggle('open');
});

// Auto-update button states
setInterval(updateButtonStates, 100);

// Start game
init();

