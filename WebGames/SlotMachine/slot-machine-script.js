// Game state
let balance = 100;
let betPercent = 25; // Bet as percentage of balance
let betAmount = 25;
let isSpinning = false;
let winLinesTimeout = null; // Track timeout for clearing win lines
let gridRows = 2; // Current number of rows
let gridCols = 4; // Current number of columns
let rebirthCount = 0; // Number of times rebirthed
let rebirthThreshold = 1000000; // Credits needed for rebirth
let stats = {
    totalSpins: 0,
    totalWon: 0,
    biggestWin: 0
};

// Symbols and their weights (lower weight = rarer)
const symbols = [
    { icon: '🍒', weight: 30, payout: 10 },
    { icon: '🍋', weight: 25, payout: 20 },
    { icon: '🍊', weight: 20, payout: 30 },
    { icon: '🍇', weight: 15, payout: 50 },
    { icon: '💎', weight: 7, payout: 100 },
    { icon: '🎰', weight: 2, payout: 200 },
    { icon: '7️⃣', weight: 1, payout: 1000 }
];

// Create weighted symbol array
let weightedSymbols = [];
symbols.forEach(symbol => {
    for (let i = 0; i < symbol.weight; i++) {
        weightedSymbols.push(symbol.icon);
    }
});

// DOM elements
const balanceDisplay = document.getElementById('balance');
const betAmountDisplay = document.getElementById('bet-amount');
const rebirthProgressDisplay = document.getElementById('rebirth-progress');
const spinCostDisplay = document.getElementById('spin-cost');
const resultMessage = document.getElementById('result-message');
const messageDisplay = document.getElementById('message-display');
const spinBtn = document.getElementById('spin-btn');
const betButtons = document.querySelectorAll('.bet-btn');
let reels = document.querySelectorAll('.reel');
const totalSpinsDisplay = document.getElementById('total-spins');
const totalWonDisplay = document.getElementById('total-won');
const biggestWinDisplay = document.getElementById('biggest-win');
const nightModeToggle = document.getElementById('nightModeToggle');
const confirmModal = document.getElementById('confirmModal');
const confirmYes = document.getElementById('confirmYes');
const confirmNo = document.getElementById('confirmNo');
const winLinesSvg = document.getElementById('win-lines-svg');
const rebirthModal = document.getElementById('rebirthModal');
const rebirthRow = document.getElementById('rebirthRow');
const rebirthCol = document.getElementById('rebirthCol');
const rebirthCancel = document.getElementById('rebirthCancel');
const gridSizeDisplay = document.getElementById('grid-size');
const rebirthCountDisplay = document.getElementById('rebirth-count');
const slotDisplay = document.querySelector('.slot-display');
const wipeBtn = document.getElementById('wipe-btn');
const wipeModal1 = document.getElementById('wipeModal1');
const wipeModal2 = document.getElementById('wipeModal2');
const wipeYes1 = document.getElementById('wipeYes1');
const wipeNo1 = document.getElementById('wipeNo1');
const wipeYes2 = document.getElementById('wipeYes2');
const wipeNo2 = document.getElementById('wipeNo2');
const numberRefToggle = document.getElementById('numberRefToggle');
const numberRefContent = document.getElementById('numberRefContent');
const paytableToggle = document.getElementById('paytableToggle');
const paytableContent = document.getElementById('paytableContent');
const gameOverModal = document.getElementById('gameOverModal');
const gameOverNewGame = document.getElementById('gameOverNewGame');

// Modal functions
let modalResolve = null;

function showModal() {
    return new Promise((resolve) => {
        modalResolve = resolve;
        confirmModal.classList.add('show');
    });
}

function hideModal() {
    confirmModal.classList.remove('show');
}

// Close modal on overlay click
function handleConfirmModalClick(e) {
    if (e.target === confirmModal) {
        hideModal();
        if (modalResolve) modalResolve(false);
    }
}

// Rebirth Modal Functions
function checkRebirthAvailable() {
    // This function now just checks if rebirth is available
    // The modal is triggered by clicking the rebirth progress button
    return balance >= rebirthThreshold && !isSpinning;
}

function showRebirthModal() {
    document.getElementById('rebirth-threshold').textContent = formatNumber(rebirthThreshold);
    document.getElementById('current-rows').textContent = gridRows;
    document.getElementById('current-cols').textContent = gridCols;
    document.getElementById('new-rows').textContent = gridRows + 1;
    document.getElementById('new-cols').textContent = gridCols + 1;
    rebirthModal.classList.add('show');
}

function hideRebirthModal() {
    rebirthModal.classList.remove('show');
}

function handleRebirthModalClick(e) {
    if (e.target === rebirthModal) {
        hideRebirthModal();
    }
}

// Wipe Progress Modal Functions
function showWipeModal1() {
    wipeModal1.classList.add('show');
}

function hideWipeModal1() {
    wipeModal1.classList.remove('show');
}

function showWipeModal2() {
    wipeModal2.classList.add('show');
}

function hideWipeModal2() {
    wipeModal2.classList.remove('show');
}

function handleWipeModal1Click(e) {
    if (e.target === wipeModal1) {
        hideWipeModal1();
    }
}

function handleWipeModal2Click(e) {
    if (e.target === wipeModal2) {
        hideWipeModal2();
    }
}

// Game Over Modal Functions
function showGameOverModal() {
    if (gameOverModal) {
        gameOverModal.classList.add('show');
    }
}

function hideGameOverModal() {
    if (gameOverModal) {
        gameOverModal.classList.remove('show');
    }
}

function handleGameOverModalClick(e) {
    if (e.target === gameOverModal) {
        // Don't allow closing by clicking overlay for game over
        // Player must make a choice
    }
}

function performRebirth(type) {
    hideRebirthModal();
    
    if (type === 'row') {
        addRow();
    } else {
        addColumn();
    }
    
    // Reset balance and increase threshold exponentially
    balance = 100;
    rebirthCount++;
    // Exponential formula: baseThreshold * (scaleFactor ^ rebirthCount)
    // 1M * (10000 ^ rebirthCount) = 1M, 10B, 100T, 1Q, etc.
    rebirthThreshold = Math.floor(1000000 * Math.pow(10000, rebirthCount + 1));
    
    // Recalculate bet amount
    calculateBetAmount();
    updateDisplay();
    saveGameState();
    
    showMessage(`🌟 Rebirth ${rebirthCount}! Grid expanded to ${gridRows}×${gridCols}! 🌟`, 'jackpot');
}

function addRow() {
    gridRows++;
    const slotDisplay = document.querySelector('.slot-display');
    
    // Update CSS grid
    slotDisplay.style.gridTemplateRows = `repeat(${gridRows}, 1fr)`;
    
    // Add new row cells
    for (let col = 0; col < gridCols; col++) {
        const reel = document.createElement('div');
        reel.className = 'reel';
        reel.setAttribute('data-row', gridRows - 1);
        reel.setAttribute('data-col', col);
        reel.innerHTML = '<div class="symbol">🍒</div>';
        slotDisplay.appendChild(reel);
    }
    
    // Refresh reels reference
    updateReelsReference();
}

function addColumn() {
    gridCols++;
    const slotDisplay = document.querySelector('.slot-display');
    
    // Update CSS grid
    slotDisplay.style.gridTemplateColumns = `repeat(${gridCols}, 1fr)`;
    
    // Get all existing reels and their data
    const existingReels = Array.from(slotDisplay.querySelectorAll('.reel'));
    const reelData = existingReels.map(reel => ({
        row: parseInt(reel.getAttribute('data-row')),
        col: parseInt(reel.getAttribute('data-col')),
        symbol: reel.querySelector('.symbol').textContent
    }));
    
    // Clear the display
    slotDisplay.innerHTML = '';
    
    // Rebuild grid in proper row-major order
    for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
            const reel = document.createElement('div');
            reel.className = 'reel';
            reel.setAttribute('data-row', row);
            reel.setAttribute('data-col', col);
            
            // Find existing data or use default symbol
            const existing = reelData.find(d => d.row === row && d.col === col);
            const symbol = existing ? existing.symbol : '🍒';
            
            reel.innerHTML = `<div class="symbol">${symbol}</div>`;
            slotDisplay.appendChild(reel);
        }
    }
    
    // Refresh reels reference
    updateReelsReference();
}

function updateReelsReference() {
    // Update the global reels reference
    reels = document.querySelectorAll('.reel');
}

// Night mode toggle
function toggleNightMode() {
    document.body.classList.toggle('night-mode');
    localStorage.setItem('nightMode', document.body.classList.contains('night-mode'));
}

// Load night mode preference
if (localStorage.getItem('nightMode') === 'true') {
    document.body.classList.add('night-mode');
}

// Initialize game
function initGame() {
    loadGameState();
    
    // Update reels reference after potential grid rebuild
    updateReelsReference();
    
    calculateBetAmount();
    updateDisplay();
    
    // Highlight the active bet button based on loaded betPercent
    betButtons.forEach(btn => {
        btn.classList.remove('active');
        if (parseInt(btn.getAttribute('data-bet-percent')) === betPercent) {
            btn.classList.add('active');
        }
    });
    
    // Attach all event listeners with null checks
    if (spinBtn) spinBtn.addEventListener('click', spin);
    if (wipeBtn) wipeBtn.addEventListener('click', wipeProgress);
    if (nightModeToggle) nightModeToggle.addEventListener('click', toggleNightMode);
    
    if (rebirthProgressDisplay) {
        rebirthProgressDisplay.addEventListener('click', () => {
            if (!rebirthProgressDisplay.disabled) {
                showRebirthModal();
            }
        });
    }
    
    betButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const newPercent = parseInt(btn.getAttribute('data-bet-percent'));
            setBetPercent(newPercent);
        });
    });
    
    // Paytable drawer toggle
    if (paytableToggle && paytableContent) {
        paytableToggle.addEventListener('click', () => {
            const isOpen = paytableContent.classList.toggle('open');
            const icon = paytableToggle.querySelector('.toggle-icon');
            icon.textContent = isOpen ? '▲' : '▼';
        });
    }
    
    // Number reference drawer toggle
    if (numberRefToggle && numberRefContent) {
        numberRefToggle.addEventListener('click', () => {
            const isOpen = numberRefContent.classList.toggle('open');
            const icon = numberRefToggle.querySelector('.toggle-icon');
            icon.textContent = isOpen ? '▲' : '▼';
        });
    }
    
    // Confirm modal listeners
    if (confirmYes) {
        confirmYes.addEventListener('click', () => {
            hideModal();
            if (modalResolve) modalResolve(true);
        });
    }
    
    if (confirmNo) {
        confirmNo.addEventListener('click', () => {
            hideModal();
            if (modalResolve) modalResolve(false);
        });
    }
    
    if (confirmModal) confirmModal.addEventListener('click', handleConfirmModalClick);
    
    // Rebirth modal listeners
    if (rebirthRow) {
        rebirthRow.addEventListener('click', () => {
            performRebirth('row');
        });
    }
    
    if (rebirthCol) {
        rebirthCol.addEventListener('click', () => {
            performRebirth('col');
        });
    }
    
    if (rebirthCancel) {
        rebirthCancel.addEventListener('click', () => {
            hideRebirthModal();
        });
    }
    
    if (rebirthModal) rebirthModal.addEventListener('click', handleRebirthModalClick);
    
    // Wipe modal listeners
    if (wipeYes1) {
        wipeYes1.addEventListener('click', () => {
            hideWipeModal1();
            showWipeModal2();
        });
    }
    
    if (wipeNo1) {
        wipeNo1.addEventListener('click', () => {
            hideWipeModal1();
        });
    }
    
    if (wipeYes2) {
        wipeYes2.addEventListener('click', () => {
            hideWipeModal2();
            performWipe();
        });
    }
    
    if (wipeNo2) {
        wipeNo2.addEventListener('click', () => {
            hideWipeModal2();
        });
    }
    
    if (wipeModal1) wipeModal1.addEventListener('click', handleWipeModal1Click);
    if (wipeModal2) wipeModal2.addEventListener('click', handleWipeModal2Click);
    
    // Game over modal listeners
    if (gameOverNewGame) {
        gameOverNewGame.addEventListener('click', () => {
            hideGameOverModal();
            performWipe(); // Start a completely new game
        });
    }
    
    if (gameOverModal) gameOverModal.addEventListener('click', handleGameOverModalClick);
}

// Calculate bet amount from percentage
function calculateBetAmount() {
    betAmount = Math.max(1, Math.floor(balance * (betPercent / 100)));
}

// Set bet percentage
async function setBetPercent(percent) {
    if (isSpinning) return;
    
    // Confirm 100% bet (all-in)
    if (percent === 100) {
        const confirmed = await showModal();
        if (!confirmed) {
            return; // User cancelled, don't change bet
        }
    }
    
    betPercent = percent;
    calculateBetAmount();
    betButtons.forEach(btn => {
        btn.classList.remove('active');
        if (parseInt(btn.getAttribute('data-bet-percent')) === percent) {
            btn.classList.add('active');
        }
    });
    
    updateDisplay();
    saveGameState();
}

// Spin the reels
async function spin() {
    if (isSpinning) return;
    
    if (balance < betAmount) {
        showMessage('Not enough credits!', 'error');
        return;
    }
    
    // Clear any existing win lines and winner highlights immediately
    clearWinLines();
    const currentReels = document.querySelectorAll('.reel');
    currentReels.forEach(reel => reel.classList.remove('winner'));
    
    isSpinning = true;
    
    // Store the actual bet amount before deducting from balance
    const actualBetAmount = betAmount;
    
    balance -= actualBetAmount;
    stats.totalSpins++;
    
    // Update display but keep showing the actual bet amount (skip recalc)
    betAmount = actualBetAmount; // Preserve the bet amount
    updateDisplay(true);
    
    spinBtn.classList.add('disabled');
    spinBtn.querySelector('.btn-text').textContent = 'SPINNING...';
    
    // Show spinning animation
    const results = await spinReels();
    
    // Check for win using the actual bet amount
    const winAmount = checkWin(results, actualBetAmount);
    
    if (winAmount > 0) {
        balance += winAmount;
        stats.totalWon += winAmount;
        if (winAmount > stats.biggestWin) {
            stats.biggestWin = winAmount;
        }
        
        const multiplier = winAmount / actualBetAmount;
        if (multiplier >= 1000) {
            showMessage(`🎉 MEGA JACKPOT! Won ${formatNumber(winAmount)} credits! 🎉`, 'jackpot');
        } else if (multiplier >= 200) {
            showMessage(`🌟 SUPER WIN! Won ${formatNumber(winAmount)} credits! 🌟`, 'jackpot');
        } else if (multiplier >= 50) {
            showMessage(`💰 BIG WIN! Won ${formatNumber(winAmount)} credits! 💰`, 'big-win');
        } else {
            showMessage(`✨ You won ${formatNumber(winAmount)} credits! ✨`, 'win');
        }
    } else {
        // Player lost - check if it was a 100% bet (all-in)
        if (betPercent === 100 && balance === 0) {
            // Game Over!
            showMessage('💀 GAME OVER! 💀', 'error');
            // Show game over modal after a brief delay
            setTimeout(() => {
                showGameOverModal();
            }, 1500);
        } else {
            showMessage('Try again!', 'lose');
        }
    }
    
    // Now recalculate bet based on new balance
    updateDisplay();
    saveGameState();
    
    spinBtn.classList.remove('disabled');
    spinBtn.querySelector('.btn-text').textContent = 'SPIN';
    isSpinning = false;
}

// Spin reels animation
function spinReels() {
    return new Promise(resolve => {
        // Query reels fresh each spin to ensure we have all current reels
        const currentReels = document.querySelectorAll('.reel');
        
        // Initialize results as a proper 2D array
        const results = Array(gridRows).fill(null).map(() => Array(gridCols).fill(null));
        
        // Generate dynamic spin durations based on current column count
        const spinDurations = Array.from({ length: gridCols }, (_, i) => 1200 + (i * 400));
        
        let completedReels = 0;
        const totalReels = gridRows * gridCols;
        
        currentReels.forEach((reel) => {
            reel.classList.add('spinning');
            
            // Randomly select final symbol
            const finalSymbol = weightedSymbols[Math.floor(Math.random() * weightedSymbols.length)];
            const row = parseInt(reel.getAttribute('data-row'));
            const col = parseInt(reel.getAttribute('data-col'));
            
            // Store result in proper 2D array position
            results[row][col] = finalSymbol;
            
            // Stop spinning after delay based on column
            const delay = spinDurations[col];
            
            // Add bounce effect when stopping
            setTimeout(() => {
                reel.classList.remove('spinning');
                reel.classList.add('stopping');
                
                // Show final symbol with bounce
                setTimeout(() => {
                    reel.querySelector('.symbol').textContent = finalSymbol;
                    reel.classList.remove('stopping');
                    
                    completedReels++;
                    // Resolve when all reels stop
                    if (completedReels === totalReels) {
                        setTimeout(() => resolve(results), 300);
                    }
                }, 100);
            }, delay);
        });
    });
}

// Find adjacent matching cells using optimized flood fill (BFS)
// Optimized for large grids with early termination and efficient memory usage
function findAdjacentChain(results, startRow, startCol, symbol, visited) {
    const key = `${startRow},${startCol}`;
    
    // Early exit if already visited or out of bounds
    if (visited.has(key)) return [];
    if (startRow < 0 || startRow >= gridRows || startCol < 0 || startCol >= gridCols) return [];
    if (results[startRow][startCol] !== symbol) return [];
    
    const chain = [];
    const queue = [[startRow, startCol]];
    let queueIndex = 0; // Use index instead of shift() for better performance
    
    // Mark starting cell as visited immediately
    visited.add(key);
    
    // Process queue using BFS (more cache-friendly than DFS for grids)
    while (queueIndex < queue.length) {
        const [row, col] = queue[queueIndex++];
        chain.push([row, col]);
        
        // Check all 8 adjacent cells (horizontal, vertical, diagonal)
        // Order optimized for typical slot machine patterns (horizontal/vertical first)
        const neighbors = [
            [row, col - 1],     // Left
            [row, col + 1],     // Right
            [row - 1, col],     // Up
            [row + 1, col],     // Down
            [row - 1, col - 1], // Up-Left
            [row - 1, col + 1], // Up-Right
            [row + 1, col - 1], // Down-Left
            [row + 1, col + 1]  // Down-Right
        ];
        
        for (const [newRow, newCol] of neighbors) {
            // Bounds check
            if (newRow < 0 || newRow >= gridRows || newCol < 0 || newCol >= gridCols) {
                continue;
            }
            
            const neighborKey = `${newRow},${newCol}`;
            
            // Skip if already visited
            if (visited.has(neighborKey)) {
                continue;
            }
            
            // Skip if symbol doesn't match
            if (results[newRow][newCol] !== symbol) {
                continue;
            }
            
            // Mark as visited and add to queue
            visited.add(neighborKey);
            queue.push([newRow, newCol]);
        }
    }
    
    return chain;
}

// Check for winning combination
function checkWin(results, actualBetAmount) {
    let totalWinAmount = 0;
    const allWinningChains = [];
    const globalVisited = new Set();
    
    // Check for adjacent chains using flood fill algorithm
    for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
            const key = `${row},${col}`;
            
            // Skip if already part of a winning pattern
            if (globalVisited.has(key)) continue;
            
            const symbol = results[row][col];
            const visited = new Set();
            const chain = findAdjacentChain(results, row, col, symbol, visited);
            
            // Chain must have at least 3 adjacent cells
            if (chain.length >= 3) {
                const symbolData = symbols.find(s => s.icon === symbol);
                
                // Award based on chain length
                let multiplier;
                if (chain.length >= 8) {
                    multiplier = 1.5;  // Huge bonus for massive chains
                } else if (chain.length >= 6) {
                    multiplier = 1.2;  // Bonus for large chains
                } else if (chain.length === 5) {
                    multiplier = 1.0;  // Full payout
                } else if (chain.length === 4) {
                    multiplier = 0.6;  // 60% payout
                } else {  // chain.length === 3
                    multiplier = 0.4;  // 40% payout
                }
                
                const winAmount = Math.floor(symbolData.payout * actualBetAmount * multiplier);
                totalWinAmount += winAmount;
                allWinningChains.push(chain);
                
                // Mark these cells as processed
                chain.forEach(([r, c]) => {
                    globalVisited.add(`${r},${c}`);
                });
            }
        }
    }
    
    // Highlight winning cells
    if (allWinningChains.length > 0) {
        highlightWinningCells(allWinningChains);
    }
    
    return totalWinAmount;
}

// Highlight winning cells
function highlightWinningCells(winningLines) {
    // Query all current reels and clear previous highlights
    const currentReels = document.querySelectorAll('.reel');
    currentReels.forEach(reel => reel.classList.remove('winner'));
    
    // Add highlight to winning cells
    setTimeout(() => {
        winningLines.forEach(line => {
            line.forEach(([row, col]) => {
                const reel = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
                if (reel) {
                    reel.classList.add('winner');
                }
            });
        });
    }, 100);
    
    // Draw win lines
    drawWinLines(winningLines);
    
    // Create confetti for winning cells
    createConfetti(winningLines);
    
    // Remove highlights after animation
    setTimeout(() => {
        const currentReels = document.querySelectorAll('.reel');
        currentReels.forEach(reel => reel.classList.remove('winner'));
    }, 3000);
}

// Create confetti particles from winning cells
function createConfetti(winningLines) {
    const slotDisplay = document.querySelector('.slot-display');
    
    winningLines.forEach(line => {
        line.forEach(([row, col]) => {
            const reel = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
            if (!reel) return;
            
            const rect = reel.getBoundingClientRect();
            const slotRect = slotDisplay.getBoundingClientRect();
            
            // Create multiple confetti pieces per cell
            const confettiCount = 8;
            for (let i = 0; i < confettiCount; i++) {
                const confetti = document.createElement('div');
                confetti.className = 'confetti';
                
                // Position at center of cell relative to slot display
                const centerX = rect.left - slotRect.left + rect.width / 2;
                const centerY = rect.top - slotRect.top + rect.height / 2;
                
                confetti.style.left = centerX + 'px';
                confetti.style.top = centerY + 'px';
                
                // Random movement direction and distance (increased spread area)
                const angle = (Math.PI * 2 * i) / confettiCount + (Math.random() - 0.5) * 0.5;
                const distance = 120 + Math.random() * 200; // Increased from 80-230 to 120-320
                const fallX = Math.cos(angle) * distance;
                const fallY = Math.sin(angle) * distance;
                const rotation = Math.random() * 720 - 360;
                
                confetti.style.setProperty('--fall-x', fallX + 'px');
                confetti.style.setProperty('--fall-y', fallY + 'px');
                confetti.style.setProperty('--rotation', rotation + 'deg');
                
                // Random delay for staggered effect
                confetti.style.animationDelay = (Math.random() * 0.2) + 's';
                
                slotDisplay.appendChild(confetti);
                
                // Remove confetti after animation
                setTimeout(() => {
                    confetti.remove();
                }, 1700);
            }
        });
    });
}

// Draw SVG lines connecting winning cells
function drawWinLines(winningLines) {
    // Clear previous lines and timeout
    clearWinLines();
    
    if (winningLines.length === 0) return;
    
    // Get the slot display dimensions
    const slotDisplay = document.querySelector('.slot-display');
    const rect = slotDisplay.getBoundingClientRect();
    
    // Set SVG dimensions and viewBox to match slot display
    winLinesSvg.setAttribute('width', rect.width);
    winLinesSvg.setAttribute('height', rect.height);
    winLinesSvg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
    winLinesSvg.setAttribute('preserveAspectRatio', 'none');
    
    // Draw a line for each winning combination
    winningLines.forEach((line, index) => {
        // Build adjacency path for this winning line
        const path = buildAdjacentPath(line);
        
        const points = path.map(([row, col]) => {
            const reel = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
            const reelRect = reel.getBoundingClientRect();
            const slotRect = slotDisplay.getBoundingClientRect();
            
            // Calculate center point of the reel relative to slot display
            const x = reelRect.left - slotRect.left + reelRect.width / 2;
            const y = reelRect.top - slotRect.top + reelRect.height / 2;
            
            return { x, y };
        });
        
        // Create path element
        const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        
        // Build path data
        let pathData = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
            pathData += ` L ${points[i].x} ${points[i].y}`;
        }
        
        pathElement.setAttribute('d', pathData);
        pathElement.setAttribute('class', 'win-line');
        pathElement.style.animationDelay = `${index * 0.15}s`;
        
        winLinesSvg.appendChild(pathElement);
    });
    
    // Clear lines after animation completes (8 seconds total: 7s display + 1s fadeout)
    winLinesTimeout = setTimeout(() => {
        winLinesSvg.innerHTML = '';
        winLinesTimeout = null;
    }, 8000);
}

// Build a path that connects cells through adjacent neighbors only
// Rules: 
// - Must connect to directly adjacent cells only (no gaps)
// - Only connects cells with the same symbol (already ensured by findAdjacentChain)
function buildAdjacentPath(cells) {
    if (cells.length <= 1) return cells;
    
    // Create a set for quick lookup
    const cellSet = new Set(cells.map(([r, c]) => `${r},${c}`));
    
    // Start from top-left cell
    let current = cells[0];
    for (const cell of cells) {
        if (cell[0] < current[0] || (cell[0] === current[0] && cell[1] < current[1])) {
            current = cell;
        }
    }
    
    const path = [current];
    const visited = new Set([`${current[0]},${current[1]}`]);
    
    // Build path by always choosing an adjacent unvisited cell
    while (visited.size < cells.length) {
        const [row, col] = current;
        let nextCell = null;
        let minDistance = Infinity;
        
        // Check all 8 adjacent positions (including diagonals)
        // Prioritize horizontal/vertical over diagonal for cleaner lines
        const adjacentOffsets = [
            [0, -1],  [0, 1],   // Left, Right (priority 1)
            [-1, 0],  [1, 0],   // Up, Down (priority 1)
            [-1, -1], [-1, 1],  // Diagonals (priority 2)
            [1, -1],  [1, 1]
        ];
        
        for (const [dr, dc] of adjacentOffsets) {
            const newRow = row + dr;
            const newCol = col + dc;
            const key = `${newRow},${newCol}`;
            
            // STRICT RULE: Only connect to cells that are:
            // 1. In our winning set (same symbol)
            // 2. Directly adjacent (no gaps)
            // 3. Not yet visited
            if (cellSet.has(key) && !visited.has(key)) {
                // Prefer horizontal/vertical (distance=1) over diagonal (distance=2)
                const distance = Math.abs(dr) + Math.abs(dc);
                if (distance < minDistance) {
                    minDistance = distance;
                    nextCell = [newRow, newCol];
                }
            }
        }
        
        // If we found an adjacent cell, add it to the path
        if (nextCell) {
            path.push(nextCell);
            visited.add(`${nextCell[0]},${nextCell[1]}`);
            current = nextCell;
        } else {
            // No adjacent cells found - this means we have a disconnected group
            // Find the nearest unvisited cell to start a new segment
            let nearestCell = null;
            let nearestDistance = Infinity;
            
            for (const cell of cells) {
                const key = `${cell[0]},${cell[1]}`;
                if (!visited.has(key)) {
                    // Calculate Manhattan distance to find nearest cell
                    const distance = Math.abs(cell[0] - current[0]) + Math.abs(cell[1] - current[1]);
                    if (distance < nearestDistance) {
                        nearestDistance = distance;
                        nearestCell = cell;
                    }
                }
            }
            
            if (nearestCell) {
                path.push(nearestCell);
                visited.add(`${nearestCell[0]},${nearestCell[1]}`);
                current = nearestCell;
            } else {
                // Should never happen, but break to prevent infinite loop
                break;
            }
        }
    }
    
    return path;
}

// Clear win lines immediately
function clearWinLines() {
    if (winLinesTimeout) {
        clearTimeout(winLinesTimeout);
        winLinesTimeout = null;
    }
    winLinesSvg.innerHTML = '';
}

// Show message
function showMessage(text, type) {
    resultMessage.textContent = text;
    messageDisplay.className = 'message-display show ' + type;
    
    setTimeout(() => {
        messageDisplay.className = 'message-display';
    }, 1500);
}

// Format numbers to compact notation using standard dictionary names
function formatNumber(num) {
    // Handle extremely large numbers (short scale naming with abbreviations)
    if (num >= 1e303) {
        return (num / 1e303).toFixed(1).replace(/\.0$/, '') + ' Cen';  // Centillion
    }
    if (num >= 1e273) {
        return (num / 1e273).toFixed(1).replace(/\.0$/, '') + ' Noa';  // Nonagintillion
    }
    if (num >= 1e243) {
        return (num / 1e243).toFixed(1).replace(/\.0$/, '') + ' Oco';  // Octogintillion
    }
    if (num >= 1e213) {
        return (num / 1e213).toFixed(1).replace(/\.0$/, '') + ' Spg';  // Septuagintillion
    }
    if (num >= 1e183) {
        return (num / 1e183).toFixed(1).replace(/\.0$/, '') + ' Sxg';  // Sexagintillion
    }
    if (num >= 1e153) {
        return (num / 1e153).toFixed(1).replace(/\.0$/, '') + ' Qqa';  // Quinquagintillion
    }
    if (num >= 1e123) {
        return (num / 1e123).toFixed(1).replace(/\.0$/, '') + ' Qda';  // Quadragintillion
    }
    if (num >= 1e120) {
        return (num / 1e120).toFixed(1).replace(/\.0$/, '') + ' NvT';  // Noventrigintillion
    }
    if (num >= 1e117) {
        return (num / 1e117).toFixed(1).replace(/\.0$/, '') + ' OcT';  // Octotrigintillion
    }
    if (num >= 1e114) {
        return (num / 1e114).toFixed(1).replace(/\.0$/, '') + ' SpT';  // Septentrigintillion
    }
    if (num >= 1e111) {
        return (num / 1e111).toFixed(1).replace(/\.0$/, '') + ' SsT';  // Sestrigintillion
    }
    if (num >= 1e108) {
        return (num / 1e108).toFixed(1).replace(/\.0$/, '') + ' QnT';  // Quintrigintillion
    }
    if (num >= 1e105) {
        return (num / 1e105).toFixed(1).replace(/\.0$/, '') + ' QtT';  // Quattuortrigintillion
    }
    if (num >= 1e102) {
        return (num / 1e102).toFixed(1).replace(/\.0$/, '') + ' TrT';  // Trestrigintillion
    }
    if (num >= 1e99) {
        return (num / 1e99).toFixed(1).replace(/\.0$/, '') + ' DuT';  // Duotrigintillion
    }
    if (num >= 1e96) {
        return (num / 1e96).toFixed(1).replace(/\.0$/, '') + ' UnT';  // Untrigintillion
    }
    if (num >= 1e93) {
        return (num / 1e93).toFixed(1).replace(/\.0$/, '') + ' Trg';  // Trigintillion
    }
    if (num >= 1e90) {
        return (num / 1e90).toFixed(1).replace(/\.0$/, '') + ' NvV';  // Novemvigintillion
    }
    if (num >= 1e87) {
        return (num / 1e87).toFixed(1).replace(/\.0$/, '') + ' OcV';  // Octovigintillion
    }
    if (num >= 1e84) {
        return (num / 1e84).toFixed(1).replace(/\.0$/, '') + ' SpV';  // Septemvigintillion
    }
    if (num >= 1e81) {
        return (num / 1e81).toFixed(1).replace(/\.0$/, '') + ' SsV';  // Sesvigintillion
    }
    if (num >= 1e78) {
        return (num / 1e78).toFixed(1).replace(/\.0$/, '') + ' QnV';  // Quinvigintillion
    }
    if (num >= 1e75) {
        return (num / 1e75).toFixed(1).replace(/\.0$/, '') + ' QtV';  // Quattuorvigintillion
    }
    if (num >= 1e72) {
        return (num / 1e72).toFixed(1).replace(/\.0$/, '') + ' TrV';  // Tresvigintillion
    }
    if (num >= 1e69) {
        return (num / 1e69).toFixed(1).replace(/\.0$/, '') + ' DuV';  // Duovigintillion
    }
    if (num >= 1e66) {
        return (num / 1e66).toFixed(1).replace(/\.0$/, '') + ' UnV';  // Unvigintillion
    }
    if (num >= 1e63) {
        return (num / 1e63).toFixed(1).replace(/\.0$/, '') + ' Vig';  // Vigintillion
    }
    if (num >= 1e60) {
        return (num / 1e60).toFixed(1).replace(/\.0$/, '') + ' NoD';  // Novemdecillion
    }
    if (num >= 1e57) {
        return (num / 1e57).toFixed(1).replace(/\.0$/, '') + ' OcD';  // Octodecillion
    }
    if (num >= 1e54) {
        return (num / 1e54).toFixed(1).replace(/\.0$/, '') + ' SpD';  // Septendecillion
    }
    if (num >= 1e51) {
        return (num / 1e51).toFixed(1).replace(/\.0$/, '') + ' SxD';  // Sexdecillion
    }
    if (num >= 1e48) {
        return (num / 1e48).toFixed(1).replace(/\.0$/, '') + ' QnD';  // Quindecillion
    }
    if (num >= 1e45) {
        return (num / 1e45).toFixed(1).replace(/\.0$/, '') + ' QtD';  // Quattuordecillion
    }
    if (num >= 1e42) {
        return (num / 1e42).toFixed(1).replace(/\.0$/, '') + ' TrD';  // Tredecillion
    }
    if (num >= 1e39) {
        return (num / 1e39).toFixed(1).replace(/\.0$/, '') + ' DuD';  // Duodecillion
    }
    if (num >= 1e36) {
        return (num / 1e36).toFixed(1).replace(/\.0$/, '') + ' UnD';  // Undecillion
    }
    if (num >= 1e33) {
        return (num / 1e33).toFixed(1).replace(/\.0$/, '') + ' Dec';  // Decillion
    }
    if (num >= 1e30) {
        return (num / 1e30).toFixed(1).replace(/\.0$/, '') + ' Non';  // Nonillion
    }
    if (num >= 1e27) {
        return (num / 1e27).toFixed(1).replace(/\.0$/, '') + ' Oct';  // Octillion
    }
    if (num >= 1e24) {
        return (num / 1e24).toFixed(1).replace(/\.0$/, '') + ' Sep';  // Septillion
    }
    if (num >= 1e21) {
        return (num / 1e21).toFixed(1).replace(/\.0$/, '') + ' Sxt';  // Sextillion
    }
    if (num >= 1e18) {
        return (num / 1e18).toFixed(1).replace(/\.0$/, '') + ' Qnt';  // Quintillion
    }
    if (num >= 1e15) {
        return (num / 1e15).toFixed(1).replace(/\.0$/, '') + ' Qad';  // Quadrillion
    }
    if (num >= 1e12) {
        return (num / 1e12).toFixed(1).replace(/\.0$/, '') + ' Tri';  // Trillion
    }
    if (num >= 1e9) {
        return (num / 1e9).toFixed(1).replace(/\.0$/, '') + ' Bil';  // Billion
    }
    if (num >= 1e6) {
        return (num / 1e6).toFixed(1).replace(/\.0$/, '') + ' Mil';  // Million
    }
    if (num >= 1e4) {
        return (num / 1e4).toFixed(1).replace(/\.0$/, '') + 'K';  // Thousand
    }
    return num.toLocaleString();  // Comma-separated for smaller numbers
}

// Update display
function updateDisplay(skipBetRecalc = false) {
    if (!skipBetRecalc) {
        calculateBetAmount(); // Recalculate bet based on current balance
    }
    balanceDisplay.textContent = formatNumber(balance);
    betAmountDisplay.textContent = formatNumber(betAmount);
    spinCostDisplay.textContent = formatNumber(betAmount);
    totalSpinsDisplay.textContent = formatNumber(stats.totalSpins);
    totalWonDisplay.textContent = formatNumber(stats.totalWon);
    biggestWinDisplay.textContent = formatNumber(stats.biggestWin);
    gridSizeDisplay.textContent = `${gridRows}×${gridCols}`;
    rebirthCountDisplay.textContent = rebirthCount;
    
    // Update rebirth progress
    if (balance >= rebirthThreshold) {
        rebirthProgressDisplay.textContent = 'READY! 🌟';
        rebirthProgressDisplay.style.color = '#4CAF50';
        rebirthProgressDisplay.style.fontWeight = 'bold';
        rebirthProgressDisplay.disabled = false;
        rebirthProgressDisplay.style.cursor = 'pointer';
        
        // Add jiggle animation
        if (!rebirthProgressDisplay.classList.contains('jiggle')) {
            rebirthProgressDisplay.classList.add('jiggle');
        }
    } else {
        rebirthProgressDisplay.textContent = formatNumber(rebirthThreshold);
        rebirthProgressDisplay.style.color = '';
        rebirthProgressDisplay.style.fontWeight = '';
        rebirthProgressDisplay.disabled = true;
        rebirthProgressDisplay.classList.remove('jiggle');
        rebirthProgressDisplay.style.cursor = 'default';
    }
    
    // Check if rebirth is available
    checkRebirthAvailable();
    
    // Disable spin if not enough credits
    if (balance < betAmount || balance < 1) {
        spinBtn.classList.add('disabled');
    } else {
        spinBtn.classList.remove('disabled');
    }
}

// Wipe all progress and restart from beginning
function wipeProgress() {
    showWipeModal1();
}

function performWipe() {
    // Clear localStorage (but preserve night mode preference)
    localStorage.removeItem('slotMachineState');
    
    // Reset all game state to defaults
    balance = 100;
    betPercent = 25;
    betAmount = 25;
    gridRows = 2;
    gridCols = 4;
    rebirthCount = 0;
    rebirthThreshold = 1000000;
    stats = {
        totalSpins: 0,
        totalWon: 0,
        biggestWin: 0
    };
    
    // Rebuild grid to default size
    slotDisplay.style.gridTemplateRows = `repeat(${gridRows}, 1fr)`;
    slotDisplay.style.gridTemplateColumns = `repeat(${gridCols}, 1fr)`;
    slotDisplay.innerHTML = '';
    
    // Rebuild default 2×4 grid
    for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
            const reel = document.createElement('div');
            reel.className = 'reel';
            reel.setAttribute('data-row', row);
            reel.setAttribute('data-col', col);
            reel.innerHTML = '<div class="symbol">🍒</div>';
            slotDisplay.appendChild(reel);
        }
    }
    
    // Update reels reference
    updateReelsReference();
    
    // Reset bet buttons
    betButtons.forEach(btn => {
        btn.classList.remove('active');
        if (parseInt(btn.getAttribute('data-bet-percent')) === 25) {
            btn.classList.add('active');
        }
    });
    
    // Don't change night mode - keep user's preference
    
    // Update display
    calculateBetAmount();
    updateDisplay();
    
    showMessage('🔄 All progress wiped! Starting fresh!', 'info');
}

// Save game state
function saveGameState() {
    const gameState = {
        balance: balance,
        betPercent: betPercent,
        stats: stats,
        gridRows: gridRows,
        gridCols: gridCols,
        rebirthCount: rebirthCount,
        rebirthThreshold: rebirthThreshold
    };
    localStorage.setItem('slotMachineState', JSON.stringify(gameState));
}

// Load game state
function loadGameState() {
    const savedState = localStorage.getItem('slotMachineState');
    if (savedState) {
        const gameState = JSON.parse(savedState);
        balance = gameState.balance || 100;
        betPercent = gameState.betPercent || 25;
        stats = gameState.stats || { totalSpins: 0, totalWon: 0, biggestWin: 0 };
        gridRows = gameState.gridRows || 2;
        gridCols = gameState.gridCols || 4;
        rebirthCount = gameState.rebirthCount || 0;
        rebirthThreshold = gameState.rebirthThreshold || 1000000;
        
        // Rebuild grid if it was expanded
        if (gridRows > 2 || gridCols > 4) {
            rebuildGrid();
        }
    }
}

function rebuildGrid() {
    const slotDisplay = document.querySelector('.slot-display');
    
    // Update CSS grid
    slotDisplay.style.gridTemplateRows = `repeat(${gridRows}, 1fr)`;
    slotDisplay.style.gridTemplateColumns = `repeat(${gridCols}, 1fr)`;
    
    // Clear existing grid
    slotDisplay.innerHTML = '';
    
    // Rebuild all cells
    for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
            const reel = document.createElement('div');
            reel.className = 'reel';
            reel.setAttribute('data-row', row);
            reel.setAttribute('data-col', col);
            reel.innerHTML = '<div class="symbol">🍒</div>';
            slotDisplay.appendChild(reel);
        }
    }
    
    // Update reels reference
    updateReelsReference();
}

// Start the game
initGame();
