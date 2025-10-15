// Quantum Garden - Game Logic (Optimized with Web Workers)
class QuantumGarden {
    constructor() {
        this.canvas = document.getElementById('garden-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.setupCanvas();
        
        // Game state
        this.particles = [];
        this.cycle = 0;
        this.harmony = 0;
        this.energy = 100;
        this.selectedType = 'photon';
        this.isPaused = true;
        this.timeSpeed = 1;
        this.lastUpdate = Date.now();
        
        // Performance optimizations
        this.useWorker = true; // Toggle for Web Worker
        this.worker = null;
        this.workerBusy = false;
        this.offscreenCanvas = null;
        this.offscreenCtx = null;
        
        // Initialize Web Worker for physics calculations
        this.initWorker();
        
        // Frame rate limiting
        this.targetFPS = 60;
        this.frameInterval = 1000 / this.targetFPS;
        this.lastFrameTime = 0;
        
        // Particle costs
        this.costs = {
            photon: 5,
            electron: 8,
            quark: 12,
            neutrino: 10,
            boson: 15,
            observe: 3
        };
        
        // Achievements
        this.achievements = {
            'first-seed': false,
            'harmony-10': false,
            'pattern-maker': false,
            'zen-master': false
        };
        
        // Tutorial tracking
        this.observationsCount = 0; // Track observations for tutorial
        this.nextCycleCount = 0; // Track next cycle clicks for tutorial
        
        // Auto-save interval
        this.autoSaveInterval = null;
        
        this.setupEventListeners();
        this.loadAutoSave();
        this.startAutoSave();
        
        // Initialize tutorial system
        this.tutorialManager = new TutorialManager(this);
        this.checkFirstTimeUser();
        
        this.gameLoop();
    }
    
    checkFirstTimeUser() {
        const hasCompletedTutorial = localStorage.getItem('quantumGardenTutorialCompleted');
        if (!hasCompletedTutorial) {
            // Show tutorial prompt modal after slight delay
            setTimeout(() => this.showTutorialPrompt(), 500);
        }
    }
    
    showTutorialPrompt() {
        const modal = document.getElementById('tutorial-prompt-modal');
        const startBtn = document.getElementById('tutorial-start-btn');
        const skipBtn = document.getElementById('tutorial-skip-btn');

        // Show modal with animation
        setTimeout(() => modal.classList.add('show'), 10);

        // Handle start tutorial
        const handleStart = () => {
            modal.classList.remove('show');
            setTimeout(() => {
                this.tutorialManager.start();
            }, 300);
            cleanup();
        };

        // Handle skip tutorial
        const handleSkip = () => {
            modal.classList.remove('show');
            // Mark tutorial as completed so prompt doesn't show again
            localStorage.setItem('quantumGardenTutorialCompleted', 'true');
            cleanup();
        };

        // Cleanup function to remove event listeners
        const cleanup = () => {
            startBtn.removeEventListener('click', handleStart);
            skipBtn.removeEventListener('click', handleSkip);
        };

        startBtn.addEventListener('click', handleStart);
        skipBtn.addEventListener('click', handleSkip);
    }
    
    initWorker() {
        // Check if Web Workers are supported
        if (typeof Worker !== 'undefined' && this.useWorker) {
            try {
                this.worker = new Worker('quantum-garden-worker.js');
                
                // Handle worker messages
                this.worker.onmessage = (e) => {
                    const { particles, harmony } = e.data;
                    this.particles = particles;
                    this.harmony = harmony;
                    this.workerBusy = false;
                };
                
                this.worker.onerror = (error) => {
                    console.warn('Worker error, falling back to main thread:', error);
                    this.useWorker = false;
                    this.worker = null;
                };
            } catch (error) {
                console.warn('Web Worker not available, using main thread:', error);
                this.useWorker = false;
            }
        } else {
            this.useWorker = false;
        }
    }
    
    setupCanvas() {
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
        this.gridSize = 20;
    }
    
    setupEventListeners() {
        // Particle selection
        document.querySelectorAll('.particle-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.particle-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedType = btn.dataset.type;
            });
        });
        
        // Canvas click
        this.canvas.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            this.placeParticle(x, y);
        });
        
        // Canvas hover
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            this.showTooltip(x, y);
        });
        
        // Control buttons
        document.getElementById('btn-play').addEventListener('click', () => {
            this.isPaused = false;
            this.updateControlButtons();
        });
        
        document.getElementById('btn-pause').addEventListener('click', () => {
            this.isPaused = true;
            this.updateControlButtons();
        });
        
        document.getElementById('btn-next-cycle').addEventListener('click', () => {
            // Run exactly one simulation step
            const fixedDeltaTime = 16.67; // ~60 FPS frame time
            const wasPaused = this.isPaused;
            
            // Temporarily unpause to run one update
            this.isPaused = false;
            this.update(fixedDeltaTime);
            this.render();
            
            // Restore paused state
            this.isPaused = wasPaused;
            
            // Track for tutorial
            this.nextCycleCount = (this.nextCycleCount || 0) + 1;
        });
        
        document.getElementById('btn-slow').addEventListener('click', () => {
            this.timeSpeed = 0.5;
            this.isPaused = false;
            this.updateControlButtons();
        });
        
        document.getElementById('btn-fast').addEventListener('click', () => {
            this.timeSpeed = 2;
            this.isPaused = false;
            this.updateControlButtons();
        });
        
        document.getElementById('btn-clear').addEventListener('click', () => {
            if (confirm('Clear your quantum garden?')) {
                this.particles = [];
                this.cycle = 0;
                this.harmony = 0;
                this.isPaused = true;
                this.updateUI();
                this.updateControlButtons();
            }
        });
        
        // Tutorial button
        document.getElementById('btn-tutorial').addEventListener('click', () => {
            this.tutorialManager.start();
        });
        
        // Save/Load buttons
        document.getElementById('btn-save').addEventListener('click', () => {
            this.saveGarden();
        });
        
        document.getElementById('btn-load').addEventListener('click', () => {
            this.loadGarden();
        });
        
        document.getElementById('btn-export').addEventListener('click', () => {
            this.exportGarden();
        });
        
        document.getElementById('btn-import').addEventListener('click', () => {
            this.showImportModal();
        });
        
        // Import modal
        document.getElementById('close-import').addEventListener('click', () => {
            this.closeImportModal();
        });
        
        document.getElementById('btn-import-confirm').addEventListener('click', () => {
            this.importGarden();
        });
        
        document.getElementById('btn-import-cancel').addEventListener('click', () => {
            this.closeImportModal();
        });
        
        document.getElementById('import-modal').addEventListener('click', (e) => {
            if (e.target.id === 'import-modal') {
                this.closeImportModal();
            }
        });
        
        // Window resize
        window.addEventListener('resize', () => {
            this.setupCanvas();
        });
    }
    
    // Save/Load System
    startAutoSave() {
        // Auto-save every 30 seconds
        this.autoSaveInterval = setInterval(() => {
            if (this.particles.length > 0) {
                this.autoSave();
            }
        }, 30000);
    }
    
    autoSave() {
        const saveData = this.createSaveData();
        localStorage.setItem('quantumGardenAutoSave', JSON.stringify(saveData));
    }
    
    loadAutoSave() {
        try {
            const autoSaveData = localStorage.getItem('quantumGardenAutoSave');
            if (autoSaveData) {
                const data = JSON.parse(autoSaveData);
                // Only auto-load if it's recent (within 24 hours)
                const saveTime = new Date(data.timestamp);
                const now = new Date();
                const hoursDiff = (now - saveTime) / (1000 * 60 * 60);
                
                if (hoursDiff < 24 && data.particles.length > 0) {
                    // Show themed modal instead of confirm dialog
                    this.showAutoSaveModal(data);
                }
            }
        } catch (error) {
            console.warn('Failed to load auto-save:', error);
        }
    }

    showAutoSaveModal(saveData) {
        const modal = document.getElementById('autosave-modal');
        const restoreBtn = document.getElementById('autosave-restore-btn');
        const discardBtn = document.getElementById('autosave-discard-btn');

        // Show modal with animation
        setTimeout(() => modal.classList.add('show'), 10);

        // Restore button handler
        const handleRestore = () => {
            this.loadSaveData(saveData);
            modal.classList.remove('show');
            restoreBtn.removeEventListener('click', handleRestore);
            discardBtn.removeEventListener('click', handleDiscard);
        };

        // Discard button handler
        const handleDiscard = () => {
            modal.classList.remove('show');
            restoreBtn.removeEventListener('click', handleRestore);
            discardBtn.removeEventListener('click', handleDiscard);
        };

        restoreBtn.addEventListener('click', handleRestore);
        discardBtn.addEventListener('click', handleDiscard);
    }
    
    createSaveData() {
        return {
            version: '1.0',
            timestamp: new Date().toISOString(),
            particles: this.particles.map(p => ({
                x: p.x,
                y: p.y,
                type: p.type,
                age: p.age,
                phase: p.phase,
                velocity: { ...p.velocity },
                superposition: p.superposition,
                states: p.states.map(s => ({ ...s })),
                energy: p.energy
            })),
            cycle: this.cycle,
            harmony: this.harmony,
            energy: this.energy,
            achievements: { ...this.achievements }
        };
    }
    
    loadSaveData(data) {
        try {
            // Validate data
            if (!data.version || !data.particles) {
                throw new Error('Invalid save data format');
            }
            
            // Restore particles
            this.particles = data.particles.map(p => ({
                ...p,
                connections: [] // Rebuild connections on next update
            }));
            
            // Restore game state
            this.cycle = data.cycle || data.wave || 0;
            this.harmony = data.harmony || 0;
            this.energy = data.energy || 100;
            
            // Restore achievements
            if (data.achievements) {
                this.achievements = { ...this.achievements, ...data.achievements };
                this.updateAchievementDisplay();
            }
            
            this.updateUI();
            return true;
        } catch (error) {
            console.error('Failed to load save data:', error);
            return false;
        }
    }
    
    saveGarden() {
        try {
            const saveData = this.createSaveData();
            localStorage.setItem('quantumGardenSave', JSON.stringify(saveData));
            this.showNotification('✅ Garden saved successfully!', 'success');
        } catch (error) {
            console.error('Failed to save:', error);
            this.showNotification('❌ Failed to save garden', 'error');
        }
    }
    
    loadGarden() {
        try {
            const saveData = localStorage.getItem('quantumGardenSave');
            if (!saveData) {
                this.showNotification('⚠️ No saved garden found', 'error');
                return;
            }
            
            const data = JSON.parse(saveData);
            if (this.loadSaveData(data)) {
                this.showNotification('✅ Garden loaded successfully!', 'success');
            } else {
                this.showNotification('❌ Failed to load garden', 'error');
            }
        } catch (error) {
            console.error('Failed to load:', error);
            this.showNotification('❌ Failed to load garden', 'error');
        }
    }
    
    exportGarden() {
        try {
            const saveData = this.createSaveData();
            const exportString = btoa(JSON.stringify(saveData)); // Base64 encode
            
            // Copy to clipboard
            navigator.clipboard.writeText(exportString).then(() => {
                this.showNotification('✅ Garden code copied to clipboard!', 'success');
            }).catch(() => {
                // Fallback: show in prompt
                prompt('Copy this code to share your garden:', exportString);
            });
        } catch (error) {
            console.error('Failed to export:', error);
            this.showNotification('❌ Failed to export garden', 'error');
        }
    }
    
    showImportModal() {
        const modal = document.getElementById('import-modal');
        modal.classList.add('show');
        document.getElementById('import-text').value = '';
        document.getElementById('import-message').className = 'import-message';
    }
    
    closeImportModal() {
        const modal = document.getElementById('import-modal');
        modal.classList.remove('show');
    }
    
    importGarden() {
        const importText = document.getElementById('import-text').value.trim();
        const messageEl = document.getElementById('import-message');
        
        if (!importText) {
            messageEl.textContent = '⚠️ Please paste a garden code';
            messageEl.className = 'import-message error';
            return;
        }
        
        try {
            // Decode from base64
            const jsonString = atob(importText);
            const data = JSON.parse(jsonString);
            
            if (this.loadSaveData(data)) {
                messageEl.textContent = '✅ Garden imported successfully!';
                messageEl.className = 'import-message success';
                
                setTimeout(() => {
                    this.closeImportModal();
                }, 1500);
            } else {
                messageEl.textContent = '❌ Invalid garden data';
                messageEl.className = 'import-message error';
            }
        } catch (error) {
            console.error('Import error:', error);
            messageEl.textContent = '❌ Invalid garden code';
            messageEl.className = 'import-message error';
        }
    }
    
    updateAchievementDisplay() {
        Object.keys(this.achievements).forEach(key => {
            const elem = document.querySelector(`[data-achievement="${key}"]`);
            if (elem && this.achievements[key]) {
                elem.classList.remove('locked');
                elem.classList.add('unlocked');
            }
        });
    }
    
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            background: ${type === 'success' ? 'rgba(76, 175, 80, 0.9)' : 'rgba(244, 67, 54, 0.9)'};
            color: white;
            border-radius: 10px;
            font-weight: bold;
            z-index: 10000;
            animation: slideIn 0.3s ease;
            box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
        `;
        
        document.body.appendChild(notification);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
    
    checkFirstTimeUser() {
        const hasCompletedTutorial = localStorage.getItem('quantumGardenTutorialCompleted');
        if (!hasCompletedTutorial) {
            // Show tutorial prompt modal
            setTimeout(() => this.showTutorialPrompt(), 500);
        }
    }
    
    placeParticle(x, y) {
        const cost = this.costs[this.selectedType];
        
        if (this.selectedType === 'observe') {
            // Observe collapses nearby particles
            this.observeParticles(x, y);
            
            // Track observations for tutorial
            this.observationsCount = (this.observationsCount || 0) + 1;
            
            return;
        }
        
        if (this.energy < cost) {
            this.showMessage('Not enough energy!');
            return;
        }
        
        const particle = {
            x: x,
            y: y,
            type: this.selectedType,
            age: 0,
            phase: Math.random() * Math.PI * 2,
            velocity: { x: 0, y: 0 },
            superposition: true,
            states: [],
            energy: 1,
            connections: []
        };
        
        // Initialize superposition states
        for (let i = 0; i < 3; i++) {
            particle.states.push({
                x: x + (Math.random() - 0.5) * 30,
                y: y + (Math.random() - 0.5) * 30,
                probability: Math.random()
            });
        }
        
        this.particles.push(particle);
        this.energy -= cost;
        this.updateUI();
        this.checkAchievement('first-seed');
    }
    
    observeParticles(x, y) {
        const observeRadius = 80;
        let observed = 0;
        
        this.particles.forEach(particle => {
            const dist = Math.hypot(particle.x - x, particle.y - y);
            if (dist < observeRadius && particle.superposition) {
                particle.superposition = false;
                observed++;
            }
        });
        
        if (observed > 0) {
            this.energy -= this.costs.observe;
            this.updateUI();
            this.checkAchievement('pattern-maker');
        }
    }
    
    updateControlButtons() {
        document.querySelectorAll('.control-btn').forEach(btn => btn.classList.remove('active'));
        
        if (this.isPaused) {
            document.getElementById('btn-pause').classList.add('active');
        } else if (this.timeSpeed === 0.5) {
            document.getElementById('btn-slow').classList.add('active');
        } else if (this.timeSpeed === 2) {
            document.getElementById('btn-fast').classList.add('active');
        } else {
            document.getElementById('btn-play').classList.add('active');
        }
    }
    
    update(deltaTime) {
        if (this.isPaused) return;
        
        const dt = deltaTime * this.timeSpeed * 0.001;
        
        // Use Web Worker for physics if available and not busy
        if (this.useWorker && this.worker && !this.workerBusy && this.particles.length > 0) {
            this.workerBusy = true;
            this.worker.postMessage({
                particles: this.particles,
                deltaTime: deltaTime * this.timeSpeed,
                canvasWidth: this.canvas.width,
                canvasHeight: this.canvas.height
            });
        } else if (!this.useWorker) {
            // Fallback to main thread (original logic)
            this.updateMainThread(deltaTime);
        }
        
        // Energy regeneration based on harmony
        this.energy = Math.min(100, this.energy + this.harmony * 0.01);
        
        // Increment cycle
        if (this.cycle % 10 === 0 && this.particles.length > 0) {
            this.checkAchievement('harmony-10');
        }
        
        if (this.cycle > 100 && this.harmony > 50) {
            this.checkAchievement('zen-master');
        }
        
        this.cycle++;
        this.updateUI();
    }
    
    updateMainThread(deltaTime) {
        // Original update logic for fallback
        const dt = deltaTime * this.timeSpeed * 0.001;
        
        // Update each particle
        this.particles.forEach((particle, index) => {
            particle.age += dt;
            particle.phase += dt;
            
            // Type-specific behaviors
            switch (particle.type) {
                case 'photon':
                    this.updatePhoton(particle, dt);
                    break;
                case 'electron':
                    this.updateElectron(particle, dt);
                    break;
                case 'quark':
                    this.updateQuark(particle, dt);
                    break;
                case 'neutrino':
                    this.updateNeutrino(particle, dt);
                    break;
                case 'boson':
                    this.updateBoson(particle, dt);
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
        this.calculateHarmony();
        
        // Energy regeneration based on harmony
        this.energy = Math.min(100, this.energy + this.harmony * 0.01);
        
        // Increment cycle
        if (this.cycle % 10 === 0 && this.particles.length > 0) {
            this.checkAchievement('harmony-10');
        }
        
        if (this.cycle > 100 && this.harmony > 50) {
            this.checkAchievement('zen-master');
        }
        
        this.cycle++;
        this.updateUI();
    }
    
    updatePhoton(particle, dt) {
        // Photons spread energy outward
        particle.velocity.x += Math.cos(particle.phase) * 0.5;
        particle.velocity.y += Math.sin(particle.phase) * 0.5;
        particle.velocity.x *= 0.95;
        particle.velocity.y *= 0.95;
        
        particle.x += particle.velocity.x;
        particle.y += particle.velocity.y;
        
        // Emit light to nearby particles (optimized with distance squared)
        for (let i = 0; i < this.particles.length; i++) {
            const other = this.particles[i];
            if (other === particle) continue;
            
            const dx = particle.x - other.x;
            const dy = particle.y - other.y;
            const distSq = dx * dx + dy * dy;
            
            if (distSq < 10000) { // 100px radius, squared to avoid sqrt
                other.energy += 0.002;
            }
        }
    }
    
    updateElectron(particle, dt) {
        // Electrons orbit nearby particles
        let nearestParticle = null;
        let minDistSq = Infinity;
        
        // Optimized nearest particle search
        for (let i = 0; i < this.particles.length; i++) {
            const other = this.particles[i];
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
            
            // Store connection for rendering
            particle.connections = [nearestParticle];
        } else {
            particle.connections = [];
        }
    }
    
    updateQuark(particle, dt) {
        // Quarks form stable triangular structures
        const quarks = this.particles.filter(p => p.type === 'quark' && p !== particle);
        
        if (quarks.length >= 2) {
            particle.connections = quarks.slice(0, 2);
            
            // Pull towards forming equilateral triangle
            quarks.slice(0, 2).forEach(other => {
                const dist = Math.hypot(particle.x - other.x, particle.y - other.y);
                const idealDist = 60;
                
                if (dist > idealDist) {
                    const angle = Math.atan2(other.y - particle.y, other.x - particle.x);
                    particle.velocity.x += Math.cos(angle) * 0.1;
                    particle.velocity.y += Math.sin(angle) * 0.1;
                } else if (dist < idealDist) {
                    const angle = Math.atan2(other.y - particle.y, other.x - particle.x);
                    particle.velocity.x -= Math.cos(angle) * 0.1;
                    particle.velocity.y -= Math.sin(angle) * 0.1;
                }
            });
            
            particle.x += particle.velocity.x;
            particle.y += particle.velocity.y;
            particle.velocity.x *= 0.9;
            particle.velocity.y *= 0.9;
        }
    }
    
    updateNeutrino(particle, dt) {
        // Neutrinos move in straight lines, phasing through everything
        if (particle.age < 0.1) {
            const angle = Math.random() * Math.PI * 2;
            particle.velocity.x = Math.cos(angle) * 3;
            particle.velocity.y = Math.sin(angle) * 3;
        }
        
        particle.x += particle.velocity.x;
        particle.y += particle.velocity.y;
        
        // Wrap around canvas
        if (particle.x < 0) particle.x = this.canvas.width;
        if (particle.x > this.canvas.width) particle.x = 0;
        if (particle.y < 0) particle.y = this.canvas.height;
        if (particle.y > this.canvas.height) particle.y = 0;
    }
    
    updateBoson(particle, dt) {
        // Bosons create harmony fields
        const radiusSq = 14400; // 120px radius squared
        const field = [];
        
        for (let i = 0; i < this.particles.length; i++) {
            const other = this.particles[i];
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
    
    calculateHarmony() {
        let harmonyScore = 0;
        
        // Count particle types (optimized)
        const types = {};
        for (let i = 0; i < this.particles.length; i++) {
            const type = this.particles[i].type;
            types[type] = (types[type] || 0) + 1;
        }
        
        // Diversity bonus
        const diversity = Object.keys(types).length;
        harmonyScore += diversity * 5;
        
        // Connection bonus
        let totalConnections = 0;
        for (let i = 0; i < this.particles.length; i++) {
            totalConnections += this.particles[i].connections.length;
        }
        harmonyScore += totalConnections * 2;
        
        // Energy balance
        let totalEnergy = 0;
        for (let i = 0; i < this.particles.length; i++) {
            totalEnergy += this.particles[i].energy;
        }
        const avgEnergy = totalEnergy / Math.max(1, this.particles.length);
        harmonyScore += avgEnergy * 3;
        
        this.harmony = Math.floor(harmonyScore);
    }
    
    render() {
        // Clear canvas with alpha blending for trail effect
        this.ctx.fillStyle = 'rgba(10, 14, 39, 0.3)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw grid (subtle) - only every other line for performance
        this.ctx.strokeStyle = 'rgba(123, 104, 238, 0.1)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        for (let x = 0; x < this.canvas.width; x += this.gridSize * 2) {
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
        }
        for (let y = 0; y < this.canvas.height; y += this.gridSize * 2) {
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
        }
        this.ctx.stroke();
        
        // Batch draw connections to minimize state changes
        this.ctx.lineWidth = 2;
        for (let i = 0; i < this.particles.length; i++) {
            const particle = this.particles[i];
            if (particle.connections.length === 0) continue;
            
            this.ctx.strokeStyle = this.getParticleColor(particle.type, 0.3);
            this.ctx.beginPath();
            
            for (let j = 0; j < particle.connections.length; j++) {
                const other = particle.connections[j];
                this.ctx.moveTo(particle.x, particle.y);
                this.ctx.lineTo(other.x, other.y);
            }
            this.ctx.stroke();
        }
        
        // Draw particles (batched by type for better performance)
        for (let i = 0; i < this.particles.length; i++) {
            const particle = this.particles[i];
            
            if (particle.superposition) {
                // Draw superposition states (ghostly)
                for (let j = 0; j < particle.states.length; j++) {
                    const state = particle.states[j];
                    this.ctx.beginPath();
                    this.ctx.arc(state.x, state.y, 5 * state.probability, 0, Math.PI * 2);
                    this.ctx.fillStyle = this.getParticleColor(particle.type, 0.2 * state.probability);
                    this.ctx.fill();
                }
            }
            
            // Draw main particle
            const size = particle.superposition ? 8 : 12;
            const pulse = Math.sin(particle.phase) * 0.2 + 1;
            
            // Glow effect
            const gradient = this.ctx.createRadialGradient(
                particle.x, particle.y, 0,
                particle.x, particle.y, size * 2 * pulse
            );
            gradient.addColorStop(0, this.getParticleColor(particle.type, 0.8));
            gradient.addColorStop(1, this.getParticleColor(particle.type, 0));
            
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, size * 2 * pulse, 0, Math.PI * 2);
            this.ctx.fillStyle = gradient;
            this.ctx.fill();
            
            // Core
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, size, 0, Math.PI * 2);
            this.ctx.fillStyle = this.getParticleColor(particle.type, 1);
            this.ctx.fill();
            
            // Border
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            this.ctx.lineWidth = 1;
            this.ctx.stroke();
        }
    }
    
    getParticleColor(type, alpha = 1) {
        const colors = {
            photon: `rgba(255, 235, 59, ${alpha})`,
            electron: `rgba(0, 212, 255, ${alpha})`,
            quark: `rgba(255, 110, 199, ${alpha})`,
            neutrino: `rgba(156, 39, 176, ${alpha})`,
            boson: `rgba(76, 175, 80, ${alpha})`
        };
        return colors[type] || `rgba(255, 255, 255, ${alpha})`;
    }
    
    showTooltip(x, y) {
        const tooltip = document.getElementById('tooltip');
        let found = false;
        
        for (let particle of this.particles) {
            const dist = Math.hypot(particle.x - x, particle.y - y);
            if (dist < 15) {
                tooltip.textContent = `${particle.type.toUpperCase()} | Age: ${particle.age.toFixed(1)}s | Energy: ${particle.energy.toFixed(2)}`;
                tooltip.style.left = `${x + 20}px`;
                tooltip.style.top = `${y + 20}px`;
                tooltip.classList.add('show');
                found = true;
                break;
            }
        }
        
        if (!found) {
            tooltip.classList.remove('show');
        }
    }
    
    updateUI() {
        document.getElementById('cycle-count').textContent = this.cycle;
        document.getElementById('harmony').textContent = this.harmony;
        document.getElementById('energy').textContent = Math.floor(this.energy);
    }
    
    checkAchievement(achievement) {
        if (this.achievements[achievement]) return;
        
        let unlocked = false;
        
        switch (achievement) {
            case 'first-seed':
                if (this.particles.length >= 1) unlocked = true;
                break;
            case 'harmony-10':
                if (this.harmony >= 10) unlocked = true;
                break;
            case 'pattern-maker':
                const observed = this.particles.filter(p => !p.superposition).length;
                if (observed >= 5) unlocked = true;
                break;
            case 'zen-master':
                if (this.cycle > 100 && this.harmony > 50) unlocked = true;
                break;
        }
        
        if (unlocked) {
            this.achievements[achievement] = true;
            const elem = document.querySelector(`[data-achievement="${achievement}"]`);
            elem.classList.remove('locked');
            elem.classList.add('unlocked');
        }
    }
    
    showMessage(text) {
        // Simple alert for now (could be enhanced)
        console.log(text);
    }
    
    gameLoop() {
        const now = Date.now();
        const deltaTime = now - this.lastUpdate;
        
        // Frame rate limiting
        const timeSinceLastFrame = now - this.lastFrameTime;
        
        if (timeSinceLastFrame >= this.frameInterval) {
            this.lastUpdate = now;
            this.lastFrameTime = now - (timeSinceLastFrame % this.frameInterval);
            
            this.update(deltaTime);
            this.render();
        }
        
        requestAnimationFrame(() => this.gameLoop());
    }
}

// Tutorial Manager Class
class TutorialManager {
    constructor(game) {
        this.game = game;
        this.currentStep = 0;
        this.steps = this.defineSteps();
        this.system = document.getElementById('tutorial-system');
        this.tooltip = document.getElementById('tutorial-tooltip');
        this.highlight = document.getElementById('tutorial-highlight');
        this.backdrop = document.querySelector('.tutorial-backdrop');
        this.setupEventListeners();
    }
    
    defineSteps() {
        return [
            {
                title: "Welcome to Quantum Garden! 🌸",
                content: "Create a beautiful quantum garden where particles interact and evolve. Let's learn the basics!",
                target: null,
                position: 'bottom',
                task: null
            },
            {
                title: "Select a Particle ✨",
                content: "Start by selecting Photon from the particle palette. Photons spread energy through your garden.",
                target: '.particle-btn[data-type="photon"]',
                position: 'right',
                task: {
                    description: "Select the Photon particle",
                    validation: () => this.game.selectedType === 'photon'
                }
            },
            {
                title: "Plant Your First Seed 🌱",
                content: "Click anywhere on the canvas to place your Photon particle and watch it bloom!",
                target: '#garden-canvas',
                position: 'top',
                task: {
                    description: "Place a particle on the canvas",
                    validation: () => this.game.particles.length > 0
                }
            },
            {
                title: "Advance Time ⏭️",
                content: "Use the Next Cycle button to advance your garden one step at a time and watch how particles evolve!",
                target: '#btn-next-cycle',
                position: 'left',
                task: {
                    description: "Click the Next Cycle button",
                    validation: () => this.game.nextCycleCount > 0
                }
            },
            {
                title: "Observe the Quantum 🔍",
                content: "Select the Observe tool and click particles to collapse their quantum state. Experiment and have fun!",
                target: '.particle-btn[data-type="observe"]',
                position: 'right',
                task: {
                    description: "Use the Observe tool",
                    validation: () => this.game.observationsCount > 0
                }
            }
        ];
    }
    
    start() {
        this.system.classList.remove('hidden');
        this.currentStep = 0;
        this.showStep(0);
    }
    
    showStep(index) {
        const step = this.steps[index];
        if (!step) return;
        
        this.currentStep = index;
        
        // Clean up previous step
        this.highlight.classList.remove('active');
        this.backdrop.classList.remove('active');
        
        // Update tooltip content
        const badge = this.tooltip.querySelector('.tutorial-badge');
        badge.textContent = `${index + 1}/${this.steps.length}`;
        
        const title = this.tooltip.querySelector('.tutorial-tooltip-title');
        title.textContent = step.title;
        
        const content = this.tooltip.querySelector('.tutorial-tooltip-content');
        content.textContent = step.content;
        
        // Update task indicator
        const taskContainer = this.tooltip.querySelector('.tutorial-task');
        if (step.task) {
            taskContainer.style.display = 'flex';
            const taskText = taskContainer.querySelector('.tutorial-task-text');
            taskText.textContent = step.task.description;
            const taskStatus = taskContainer.querySelector('.tutorial-task-status');
            taskStatus.textContent = '⏳';
            taskStatus.classList.remove('completed');
            this.startTaskValidation(step);
        } else {
            taskContainer.style.display = 'none';
        }
        
        // Update next button
        const nextBtn = this.tooltip.querySelector('.tutorial-next-btn');
        const nextBtnText = nextBtn.querySelector('span:first-child');
        const nextBtnIcon = nextBtn.querySelector('.btn-icon');
        if (index === this.steps.length - 1) {
            nextBtnText.textContent = "Start Gardening!";
            nextBtnIcon.textContent = "🌸";
        } else {
            nextBtnText.textContent = "Next";
            nextBtnIcon.textContent = "→";
        }
        
        // Show/hide based on task
        if (step.task) {
            nextBtn.style.display = 'none';
        } else {
            nextBtn.style.display = 'block';
        }
        
        // Position tooltip and highlight element
        if (step.target) {
            const targetElement = document.querySelector(step.target);
            if (targetElement) {
                this.highlightElement(targetElement);
                // Delay tooltip positioning to allow scroll to complete
                setTimeout(() => {
                    this.positionTooltip(targetElement, step.position);
                }, 150);
                this.backdrop.classList.add('active');
            }
        } else {
            this.highlight.classList.remove('active');
            this.backdrop.classList.remove('active');
            this.positionTooltip(null, step.position);
        }
    }
    
    highlightElement(element) {
        if (!element) {
            this.highlight.classList.remove('active');
            return;
        }
        
        // Scroll element into view first (before getting rect)
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        
        // Small delay to let scroll complete, then get position
        setTimeout(() => {
            const rect = element.getBoundingClientRect();
            this.highlight.style.left = `${rect.left}px`;
            this.highlight.style.top = `${rect.top}px`;
            this.highlight.style.width = `${rect.width}px`;
            this.highlight.style.height = `${rect.height}px`;
            this.highlight.classList.add('active');
        }, 100);
    }
    
    positionTooltip(targetElement, position) {
        if (!targetElement) {
            // Center tooltip when no target
            this.tooltip.style.position = 'fixed';
            this.tooltip.style.left = '50%';
            this.tooltip.style.top = '50%';
            this.tooltip.style.transform = 'translate(-50%, -50%)';
            this.tooltip.setAttribute('data-position', 'bottom');
            return;
        }
        
        const rect = targetElement.getBoundingClientRect();
        const tooltipRect = this.tooltip.getBoundingClientRect();
        const spacing = 20;
        
        let left, top, actualPosition = position;
        
        // For very large elements (like canvas), position tooltip in center instead
        const isLargeElement = rect.height > window.innerHeight * 0.6 || rect.width > window.innerWidth * 0.6;
        if (isLargeElement) {
            // Position tooltip in the center-top area of the element
            left = rect.left + (rect.width / 2);
            top = rect.top + Math.min(100, rect.height * 0.2);
            this.tooltip.style.position = 'fixed';
            this.tooltip.style.left = `${left}px`;
            this.tooltip.style.top = `${top}px`;
            this.tooltip.style.transform = 'translate(-50%, 0)';
            this.tooltip.setAttribute('data-position', 'bottom');
            return;
        }
        
        // For elements in the left sidebar, ensure tooltip doesn't go off right edge
        const isInLeftSidebar = rect.left < window.innerWidth * 0.25;
        if (isInLeftSidebar && position === 'right') {
            // Check if tooltip would extend beyond viewport
            const proposedLeft = rect.right + spacing;
            if (proposedLeft + tooltipRect.width > window.innerWidth - 20) {
                // Position tooltip below instead, centered on element
                left = rect.left + (rect.width / 2);
                top = rect.bottom + spacing;
                this.tooltip.style.position = 'fixed';
                this.tooltip.style.left = `${left}px`;
                this.tooltip.style.top = `${top}px`;
                this.tooltip.style.transform = 'translate(-50%, 0)';
                this.tooltip.setAttribute('data-position', 'bottom');
                return;
            }
        }
        
        // Calculate position with collision detection
        switch (position) {
            case 'top':
                left = rect.left + (rect.width / 2);
                top = rect.top - spacing;
                if (top < tooltipRect.height) actualPosition = 'bottom';
                break;
            case 'bottom':
                left = rect.left + (rect.width / 2);
                top = rect.bottom + spacing;
                if (top + tooltipRect.height > window.innerHeight) actualPosition = 'top';
                break;
            case 'left':
                left = rect.left - spacing;
                top = rect.top + (rect.height / 2);
                if (left < tooltipRect.width) actualPosition = 'right';
                break;
            case 'right':
                left = rect.right + spacing;
                top = rect.top + (rect.height / 2);
                if (left + tooltipRect.width > window.innerWidth) actualPosition = 'left';
                break;
        }
        
        // Recalculate if position changed
        if (actualPosition !== position) {
            switch (actualPosition) {
                case 'top':
                    left = rect.left + (rect.width / 2);
                    top = rect.top - spacing;
                    break;
                case 'bottom':
                    left = rect.left + (rect.width / 2);
                    top = rect.bottom + spacing;
                    break;
                case 'left':
                    left = rect.left - spacing;
                    top = rect.top + (rect.height / 2);
                    break;
                case 'right':
                    left = rect.right + spacing;
                    top = rect.top + (rect.height / 2);
                    break;
            }
        }
        
        this.tooltip.style.position = 'fixed';
        this.tooltip.style.left = `${left}px`;
        this.tooltip.style.top = `${top}px`;
        
        // Set transform based on position
        const transforms = {
            'top': 'translate(-50%, -100%)',
            'bottom': 'translate(-50%, 0)',
            'left': 'translate(-100%, -50%)',
            'right': 'translate(0, -50%)'
        };
        this.tooltip.style.transform = transforms[actualPosition];
        this.tooltip.setAttribute('data-position', actualPosition);
        
        // Ensure tooltip stays within viewport bounds
        setTimeout(() => {
            const tooltipBounds = this.tooltip.getBoundingClientRect();
            const margin = 10; // Minimum margin from viewport edge
            
            let adjustedLeft = parseFloat(this.tooltip.style.left);
            let adjustedTop = parseFloat(this.tooltip.style.top);
            
            // Check right edge
            if (tooltipBounds.right > window.innerWidth - margin) {
                adjustedLeft -= (tooltipBounds.right - window.innerWidth + margin);
            }
            
            // Check left edge
            if (tooltipBounds.left < margin) {
                adjustedLeft += (margin - tooltipBounds.left);
            }
            
            // Check bottom edge
            if (tooltipBounds.bottom > window.innerHeight - margin) {
                adjustedTop -= (tooltipBounds.bottom - window.innerHeight + margin);
            }
            
            // Check top edge
            if (tooltipBounds.top < margin) {
                adjustedTop += (margin - tooltipBounds.top);
            }
            
            // Apply adjustments if needed
            this.tooltip.style.left = `${adjustedLeft}px`;
            this.tooltip.style.top = `${adjustedTop}px`;
        }, 10);
    }
    
    startTaskValidation(step) {
        if (!step.task) return;
        
        const checkInterval = setInterval(() => {
            if (step.task.validation()) {
                clearInterval(checkInterval);
                this.completeTask();
            }
        }, 100);
        
        // Store interval ID to clear if tutorial ends
        this.currentValidation = checkInterval;
    }
    
    completeTask() {
        const taskStatus = this.tooltip.querySelector('.tutorial-task-status');
        taskStatus.textContent = '✓';
        taskStatus.classList.add('completed');
        
        // Auto-advance after 1.5 seconds
        setTimeout(() => {
            this.next();
        }, 1500);
    }
    
    next() {
        if (this.currentValidation) {
            clearInterval(this.currentValidation);
            this.currentValidation = null;
        }
        
        if (this.currentStep < this.steps.length - 1) {
            this.showStep(this.currentStep + 1);
        } else {
            this.end();
        }
    }
    
    end() {
        if (this.currentValidation) {
            clearInterval(this.currentValidation);
            this.currentValidation = null;
        }
        
        this.system.classList.add('hidden');
        this.highlight.classList.remove('active');
        this.backdrop.classList.remove('active');
        
        // Mark tutorial as completed
        localStorage.setItem('quantumGardenTutorialCompleted', 'true');
    }
    
    setupEventListeners() {
        // Next button
        const nextBtn = this.tooltip.querySelector('.tutorial-next-btn');
        nextBtn.addEventListener('click', () => this.next());
        
        // Close button
        const closeBtn = this.tooltip.querySelector('.tutorial-close-btn');
        closeBtn.addEventListener('click', () => this.end());
        
        // Reposition on window resize
        window.addEventListener('resize', () => {
            if (!this.system.classList.contains('hidden')) {
                const step = this.steps[this.currentStep];
                if (step && step.target) {
                    const targetElement = document.querySelector(step.target);
                    if (targetElement) {
                        this.highlightElement(targetElement);
                        this.positionTooltip(targetElement, step.position);
                    }
                }
            }
        });
    }
}

// Initialize game when page loads
window.addEventListener('DOMContentLoaded', () => {
    const game = new QuantumGarden();
});
