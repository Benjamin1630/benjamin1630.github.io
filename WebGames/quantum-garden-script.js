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
        
        this.currentTutorialStep = 1;
        this.totalTutorialSteps = 8;
        
        // New overlay tutorial system
        this.tutorialActive = false;
        this.tutorialSteps = this.createTutorialSteps();
        
        // Tutorial task tracking
        this.tutorialTasks = {
            step2: false,  // Place first particle
            step3: false,  // Press play
            step4: false,  // Place electron
            step5: false,  // Use observe tool
            step6: { pause: false, slow: false, fast: false },  // Time controls
            step7: 0       // Place 3+ particles (count)
        };
        this.tutorialMode = false;
        this.particleCountAtTutorialStart = 0;
        
        // Auto-save interval
        this.autoSaveInterval = null;
        
        this.setupEventListeners();
        this.checkFirstTimeUser();
        this.setupTutorialEventListeners();
        this.loadAutoSave();
        this.startAutoSave();
        this.gameLoop();
    }
    
    createTutorialSteps() {
        return [
            {
                step: 1,
                title: "Welcome! 🌸",
                text: "Cultivate quantum particles to create beautiful patterns. Let's learn the basics!",
                position: { top: '80px', right: '20px' },
                highlightElement: null,
                arrow: null,
                hasTask: false,
                canSkip: false
            },
            {
                step: 2,
                title: "Plant Your First Seed 🌱",
                text: "Photon is selected. Click the canvas to place your first quantum particle!",
                position: { top: '80px', right: '320px' },
                highlightElement: '#garden-canvas',
                arrow: { direction: 'left', offset: { x: -30, y: 0 } },
                hasTask: true,
                taskTitle: "Place a Photon",
                taskCheck: () => this.tutorialTasks.step2,
                canSkip: false
            },
            {
                step: 3,
                title: "Quantum Superposition 👻",
                text: "See the ghostly effect? That's quantum physics! Click Play (▶️) to start time.",
                position: { top: '200px', right: '20px' },
                highlightElement: '#btn-play',
                arrow: { direction: 'left', offset: { x: -20, y: 0 } },
                hasTask: true,
                taskTitle: "Click Play",
                taskCheck: () => this.tutorialTasks.step3,
                canSkip: false
            },
            {
                step: 4,
                title: "Add Variety ✨",
                text: "Your Photon spreads energy! Now select Electron (blue) and place it.",
                position: { top: '200px', left: '20px' },
                highlightElement: '.particle-btn[data-type="electron"]',
                arrow: { direction: 'right', offset: { x: 20, y: 0 } },
                hasTask: true,
                taskTitle: "Place an Electron",
                taskCheck: () => this.tutorialTasks.step4,
                canSkip: false
            },
            {
                step: 5,
                title: "Observe & Lock 🔍",
                text: "Electrons orbit! Use Observe (👁️) to collapse their quantum state.",
                position: { top: '400px', left: '20px' },
                highlightElement: '.particle-btn[data-type="observe"]',
                arrow: { direction: 'right', offset: { x: 20, y: 0 } },
                hasTask: true,
                taskTitle: "Use Observe tool",
                taskCheck: () => this.tutorialTasks.step5,
                canSkip: false
            },
            {
                step: 6,
                title: "Control Time ⏱️",
                text: "Master time! Try Pause, Slow, and Fast to control your garden.",
                position: { top: '200px', right: '20px' },
                highlightElement: '.controls-section',
                arrow: { direction: 'left', offset: { x: -20, y: 0 } },
                hasTask: true,
                taskTitle: "Try all time controls",
                taskCheck: () => this.tutorialTasks.step6.pause && this.tutorialTasks.step6.slow && this.tutorialTasks.step6.fast,
                canSkip: false
            },
            {
                step: 7,
                title: "Build Your Garden 🌿",
                text: "Experiment! Place 3 more particles and watch how they interact.",
                position: { top: '80px', left: '20px' },
                highlightElement: '.particle-palette',
                arrow: { direction: 'right', offset: { x: 20, y: 0 } },
                hasTask: true,
                taskTitle: "Place 3 more particles",
                taskCheck: () => this.tutorialTasks.step7 >= 3,
                canSkip: false
            },
            {
                step: 8,
                title: "You're Ready! 🎉",
                text: "Great job! Now create, explore, and find your zen. There's no winning or losing - just beautiful patterns!",
                position: { top: '80px', right: '20px' },
                highlightElement: null,
                arrow: null,
                hasTask: false,
                canSkip: false
            }
        ];
    }
    
    setupTutorialEventListeners() {
        // Tutorial navigation
        document.getElementById('tutorial-prev-btn').addEventListener('click', () => {
            this.previousTutorial();
        });
        
        document.getElementById('tutorial-finish-btn').addEventListener('click', () => {
            this.endTutorial();
        });
        
        document.getElementById('tutorial-skip').addEventListener('click', () => {
            this.showSkipTutorialModal();
        });
        
        // Make tutorial progress dots clickable to navigate to completed steps
        document.querySelectorAll('.tutorial-progress-dots .progress-dot').forEach((dot, index) => {
            dot.addEventListener('click', () => {
                const targetStep = index + 1;
                // Only allow navigating to step 1 or previously completed steps
                if (targetStep === 1 || targetStep < this.currentTutorialStep) {
                    this.currentTutorialStep = targetStep;
                    this.showTutorialStep(targetStep);
                }
            });
        });
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
            
            // Tutorial task tracking
            if (this.tutorialMode && this.currentTutorialStep === 3 && !this.tutorialTasks.step3) {
                this.tutorialTasks.step3 = true;
                this.updateTaskStatus(3);
            }
        });
        
        document.getElementById('btn-pause').addEventListener('click', () => {
            this.isPaused = true;
            this.updateControlButtons();
            
            // Tutorial task tracking
            if (this.tutorialMode && this.currentTutorialStep === 6) {
                this.tutorialTasks.step6.pause = true;
                this.updateTaskStatus(6);
            }
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
        });
        
        document.getElementById('btn-slow').addEventListener('click', () => {
            this.timeSpeed = 0.5;
            this.isPaused = false;
            this.updateControlButtons();
            
            // Tutorial task tracking
            if (this.tutorialMode && this.currentTutorialStep === 6) {
                this.tutorialTasks.step6.slow = true;
                this.updateTaskStatus(6);
            }
        });
        
        document.getElementById('btn-fast').addEventListener('click', () => {
            this.timeSpeed = 2;
            this.isPaused = false;
            this.updateControlButtons();
            
            // Tutorial task tracking
            if (this.tutorialMode && this.currentTutorialStep === 6) {
                this.tutorialTasks.step6.fast = true;
                this.updateTaskStatus(6);
            }
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
            this.showTutorial();
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
            // Update tutorial positions on resize
            if (this.tutorialActive && this.currentTutorialStep) {
                const step = this.tutorialSteps[this.currentTutorialStep - 1];
                if (step) {
                    this.highlightElement(step.highlightElement);
                    this.positionArrow(step.highlightElement, step.arrow);
                }
            }
        });
        
        // Scroll event - update tutorial highlight positions
        let scrollTimeout;
        window.addEventListener('scroll', () => {
            if (this.tutorialActive && this.currentTutorialStep) {
                // Debounce for performance
                clearTimeout(scrollTimeout);
                scrollTimeout = setTimeout(() => {
                    const step = this.tutorialSteps[this.currentTutorialStep - 1];
                    if (step) {
                        this.highlightElement(step.highlightElement);
                        this.positionArrow(step.highlightElement, step.arrow);
                    }
                }, 10);
            }
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

    showSkipTutorialModal() {
        const modal = document.getElementById('skip-tutorial-modal');
        const skipBtn = document.getElementById('skip-tutorial-confirm-btn');
        const cancelBtn = document.getElementById('skip-tutorial-cancel-btn');

        // Show modal with animation
        setTimeout(() => modal.classList.add('show'), 10);

        // Skip button handler
        const handleSkip = () => {
            this.endTutorial();
            modal.classList.remove('show');
            skipBtn.removeEventListener('click', handleSkip);
            cancelBtn.removeEventListener('click', handleCancel);
        };

        // Cancel button handler
        const handleCancel = () => {
            modal.classList.remove('show');
            skipBtn.removeEventListener('click', handleSkip);
            cancelBtn.removeEventListener('click', handleCancel);
        };

        skipBtn.addEventListener('click', handleSkip);
        cancelBtn.addEventListener('click', handleCancel);
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
        const hasVisited = localStorage.getItem('quantumGardenVisited');
        if (!hasVisited) {
            localStorage.setItem('quantumGardenVisited', 'true');
            // Start overlay tutorial instead of modal
            setTimeout(() => this.startOverlayTutorial(), 500);
        }
    }
    
    startOverlayTutorial() {
        this.tutorialActive = true;
        this.tutorialMode = true;
        this.currentTutorialStep = 1;
        this.particleCountAtTutorialStart = this.particles.length;
        
        // Reset tutorial tasks
        this.tutorialTasks = {
            step2: false,
            step3: false,
            step4: false,
            step5: false,
            step6: { pause: false, slow: false, fast: false },
            step7: 0
        };
        
        // Show overlay
        const overlay = document.getElementById('tutorial-overlay');
        overlay.classList.remove('hidden');
        
        // Show first step
        this.showTutorialStep(1);
    }
    
    showTutorialStep(stepNumber) {
        const step = this.tutorialSteps[stepNumber - 1];
        if (!step) return;
        
        // Clear any pending auto-advance from previous step
        if (this.tutorialAdvanceTimeout) {
            clearTimeout(this.tutorialAdvanceTimeout);
            this.tutorialAdvanceTimeout = null;
        }
        
        // Update step indicator
        document.getElementById('tutorial-step-num').textContent = stepNumber;
        
        // Update content
        document.getElementById('tutorial-title').textContent = step.title;
        document.getElementById('tutorial-text').textContent = step.text;
        
        // Update progress dots
        document.querySelectorAll('.tutorial-progress-dots .progress-dot').forEach((dot, index) => {
            dot.classList.remove('active', 'completed');
            if (index + 1 === stepNumber) {
                dot.classList.add('active');
            } else if (index + 1 < stepNumber) {
                dot.classList.add('completed');
            }
        });
        
        // Update task
        const taskBox = document.getElementById('tutorial-task');
        if (step.hasTask) {
            taskBox.classList.remove('hidden', 'completed');
            document.getElementById('task-text').textContent = step.taskTitle;
            document.querySelector('.task-status-text').textContent = 'In Progress...';
            this.updateTaskStatus(stepNumber);
        } else {
            taskBox.classList.add('hidden');
            
            // Auto-advance welcome screen after 3 seconds
            if (stepNumber === 1) {
                this.tutorialAdvanceTimeout = setTimeout(() => {
                    this.tutorialAdvanceTimeout = null;
                    this.advanceTutorial();
                }, 3000);
            }
        }
        
        // Update navigation buttons
        const prevBtn = document.getElementById('tutorial-prev-btn');
        const finishBtn = document.getElementById('tutorial-finish-btn');
        
        prevBtn.disabled = stepNumber === 1;
        
        // Show finish button only on last step
        if (stepNumber === this.totalTutorialSteps) {
            finishBtn.classList.remove('hidden');
        } else {
            finishBtn.classList.add('hidden');
        }
        
        // Position card
        const card = document.getElementById('tutorial-card');
        Object.assign(card.style, step.position);
        
        // Highlight element
        this.highlightElement(step.highlightElement);
        
        // Show/position arrow
        this.positionArrow(step.highlightElement, step.arrow);
    }
    
    highlightElement(selector) {
        // Remove previous highlights
        document.querySelectorAll('.tutorial-highlight').forEach(el => {
            el.classList.remove('tutorial-highlight');
        });
        
        const spotlight = document.getElementById('tutorial-spotlight');
        
        if (!selector) {
            spotlight.style.opacity = '0';
            return;
        }
        
        const element = document.querySelector(selector);
        if (!element) {
            spotlight.style.opacity = '0';
            return;
        }
        
        // Add highlight class
        element.classList.add('tutorial-highlight');
        
        // Scroll element into view if needed
        element.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center',
            inline: 'nearest'
        });
        
        // Wait for scroll to complete before positioning
        setTimeout(() => {
            // Position spotlight accounting for scroll
            const rect = element.getBoundingClientRect();
            const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
            const scrollY = window.pageYOffset || document.documentElement.scrollTop;
            
            spotlight.style.left = `${rect.left + scrollX - 10}px`;
            spotlight.style.top = `${rect.top + scrollY - 10}px`;
            spotlight.style.width = `${rect.width + 20}px`;
            spotlight.style.height = `${rect.height + 20}px`;
            spotlight.style.opacity = '1';
        }, 300);
    }
    
    positionArrow(elementSelector, arrowConfig) {
        const arrow = document.getElementById('tutorial-arrow');
        
        if (!elementSelector || !arrowConfig) {
            arrow.classList.add('hidden');
            return;
        }
        
        const element = document.querySelector(elementSelector);
        if (!element) {
            arrow.classList.add('hidden');
            return;
        }
        
        // Wait for scroll to complete before positioning
        setTimeout(() => {
            const rect = element.getBoundingClientRect();
            const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
            const scrollY = window.pageYOffset || document.documentElement.scrollTop;
            
            arrow.className = `tutorial-arrow ${arrowConfig.direction}`;
            
            // Calculate arrow position based on direction, accounting for scroll
            let left, top;
            switch (arrowConfig.direction) {
                case 'top':
                    left = rect.left + scrollX + rect.width / 2;
                    top = rect.top + scrollY + arrowConfig.offset.y;
                    break;
                case 'bottom':
                    left = rect.left + scrollX + rect.width / 2;
                    top = rect.bottom + scrollY + arrowConfig.offset.y;
                    break;
                case 'left':
                    left = rect.left + scrollX + arrowConfig.offset.x;
                    top = rect.top + scrollY + rect.height / 2;
                    break;
                case 'right':
                    left = rect.right + scrollX + arrowConfig.offset.x;
                    top = rect.top + scrollY + rect.height / 2;
                    break;
            }
            
            arrow.style.left = `${left}px`;
            arrow.style.top = `${top}px`;
        }, 300);
    }
    
    advanceTutorial() {
        const step = this.tutorialSteps[this.currentTutorialStep - 1];
        
        // Check if task is completed
        if (step.hasTask && !step.taskCheck()) {
            this.shakeTutorialMessage();
            return;
        }
        
        if (this.currentTutorialStep < this.totalTutorialSteps) {
            this.currentTutorialStep++;
            
            // Update particle count for step 7
            if (this.currentTutorialStep === 7) {
                this.particleCountAtTutorialStart = this.particles.length;
                this.tutorialTasks.step7 = 0;
            }
            
            this.showTutorialStep(this.currentTutorialStep);
        } else {
            this.endTutorial();
        }
    }
    
    previousTutorial() {
        if (this.currentTutorialStep > 1) {
            this.currentTutorialStep--;
            this.showTutorialStep(this.currentTutorialStep);
        }
    }
    
    endTutorial() {
        this.tutorialActive = false;
        this.tutorialMode = false;
        
        // Clear any pending auto-advance
        if (this.tutorialAdvanceTimeout) {
            clearTimeout(this.tutorialAdvanceTimeout);
            this.tutorialAdvanceTimeout = null;
        }
        
        const overlay = document.getElementById('tutorial-overlay');
        overlay.classList.add('hidden');
        
        // Remove all highlights
        document.querySelectorAll('.tutorial-highlight').forEach(el => {
            el.classList.remove('tutorial-highlight');
        });
    }
    
    shakeTutorialMessage() {
        const card = document.getElementById('tutorial-card');
        if (card) {
            card.style.animation = 'shake 0.5s';
            setTimeout(() => {
                card.style.animation = '';
            }, 500);
        }
    }
    
    updateTaskStatus(stepNumber) {
        const step = this.tutorialSteps[stepNumber - 1];
        if (!step.hasTask) return;
        
        const taskBox = document.getElementById('tutorial-task');
        const taskCheck = document.getElementById('task-check');
        const statusText = document.querySelector('.task-status-text');
        
        const isCompleted = step.taskCheck();
        
        if (isCompleted) {
            taskBox.classList.add('completed');
            taskCheck.textContent = '✓';
            taskCheck.classList.remove('pending');
            taskCheck.classList.add('completed');
            statusText.textContent = 'Completed!';
            
            // Auto-advance to next step after 1 second
            if (!this.tutorialAdvanceTimeout) {
                this.tutorialAdvanceTimeout = setTimeout(() => {
                    this.tutorialAdvanceTimeout = null;
                    this.advanceTutorial();
                }, 1000);
            }
        } else {
            taskBox.classList.remove('completed');
            taskCheck.textContent = '⏳';
            taskCheck.classList.add('pending');
            taskCheck.classList.remove('completed');
            statusText.textContent = 'In Progress...';
            
            // Clear any pending auto-advance
            if (this.tutorialAdvanceTimeout) {
                clearTimeout(this.tutorialAdvanceTimeout);
                this.tutorialAdvanceTimeout = null;
            }
        }
    }
    
    showTutorial() {
        // Start the overlay tutorial
        this.startOverlayTutorial();
    }
    
    closeTutorial() {
        const modal = document.getElementById('tutorial-modal');
        modal.classList.remove('show');
        this.tutorialMode = false;
    }
    
    navigateTutorial(direction) {
        const newStep = this.currentTutorialStep + direction;
        
        // Check if current step task is completed before advancing
        if (direction === 1 && !this.isTaskCompleted(this.currentTutorialStep)) {
            this.showTaskIncompleteMessage();
            return;
        }
        
        if (newStep >= 1 && newStep <= this.totalTutorialSteps) {
            this.currentTutorialStep = newStep;
            
            // Update particle count for step 7
            if (this.currentTutorialStep === 7) {
                this.particleCountAtTutorialStart = this.particles.length;
                this.tutorialTasks.step7 = 0;
            }
            
            this.updateTutorialStep();
        }
        
        // Close on last step's next button
        if (this.currentTutorialStep === this.totalTutorialSteps && direction === 1) {
            this.closeTutorial();
        }
    }
    
    isTaskCompleted(step) {
        // Step 1 has no task, always allow progression
        if (step === 1) return true;
        
        switch(step) {
            case 2:
                return this.tutorialTasks.step2;
            case 3:
                return this.tutorialTasks.step3;
            case 4:
                return this.tutorialTasks.step4;
            case 5:
                return this.tutorialTasks.step5;
            case 6:
                return this.tutorialTasks.step6.pause && 
                       this.tutorialTasks.step6.slow && 
                       this.tutorialTasks.step6.fast;
            case 7:
                return this.tutorialTasks.step7 >= 3;
            case 8:
                return true; // Final step, always allow
            default:
                return true;
        }
    }
    
    showTaskIncompleteMessage() {
        // Flash the task box
        const taskBox = document.querySelector('.tutorial-step.active .tutorial-task');
        if (taskBox) {
            taskBox.style.animation = 'shake 0.5s';
            setTimeout(() => {
                taskBox.style.animation = '';
            }, 500);
        }
    }
    
    updateTutorialTaskStatus(step) {
        let statusElement, isCompleted;
        
        switch(step) {
            case 2:
                statusElement = document.getElementById('task-2-status');
                isCompleted = this.tutorialTasks.step2;
                if (statusElement) {
                    statusElement.textContent = isCompleted ? '✅ Completed!' : '❌ Not completed';
                    if (isCompleted) statusElement.classList.add('task-completed');
                }
                break;
                
            case 3:
                statusElement = document.getElementById('task-3-status');
                isCompleted = this.tutorialTasks.step3;
                if (statusElement) {
                    statusElement.textContent = isCompleted ? '✅ Completed!' : '❌ Not completed';
                    if (isCompleted) statusElement.classList.add('task-completed');
                }
                break;
                
            case 4:
                statusElement = document.getElementById('task-4-status');
                isCompleted = this.tutorialTasks.step4;
                if (statusElement) {
                    statusElement.textContent = isCompleted ? '✅ Completed!' : '❌ Not completed';
                    if (isCompleted) statusElement.classList.add('task-completed');
                }
                break;
                
            case 5:
                statusElement = document.getElementById('task-5-status');
                isCompleted = this.tutorialTasks.step5;
                if (statusElement) {
                    statusElement.textContent = isCompleted ? '✅ Completed!' : '❌ Not completed';
                    if (isCompleted) statusElement.classList.add('task-completed');
                }
                break;
                
            case 6:
                const pauseEl = document.getElementById('task-6-pause');
                const slowEl = document.getElementById('task-6-slow');
                const fastEl = document.getElementById('task-6-fast');
                statusElement = document.getElementById('task-6-status');
                
                if (pauseEl) pauseEl.innerHTML = this.tutorialTasks.step6.pause ? '⏸️ Pause - ✅' : '⏸️ Pause - ❌';
                if (slowEl) slowEl.innerHTML = this.tutorialTasks.step6.slow ? '🐌 Slow - ✅' : '🐌 Slow - ❌';
                if (fastEl) fastEl.innerHTML = this.tutorialTasks.step6.fast ? '⚡ Fast - ✅' : '⚡ Fast - ❌';
                
                isCompleted = this.tutorialTasks.step6.pause && this.tutorialTasks.step6.slow && this.tutorialTasks.step6.fast;
                if (statusElement) {
                    statusElement.textContent = isCompleted ? '✅ All controls tested!' : '❌ Try all controls';
                    if (isCompleted) statusElement.classList.add('task-completed');
                }
                break;
                
            case 7:
                const countEl = document.getElementById('task-7-count');
                statusElement = document.getElementById('task-7-status');
                if (countEl) countEl.textContent = this.tutorialTasks.step7;
                
                isCompleted = this.tutorialTasks.step7 >= 3;
                if (statusElement) {
                    statusElement.innerHTML = `Particles: <span id="task-7-count">${this.tutorialTasks.step7}</span>/3 ${isCompleted ? '✅' : '❌'}`;
                    if (isCompleted) statusElement.classList.add('task-completed');
                }
                break;
        }
    }
    
    goToTutorialStep(step) {
        this.currentTutorialStep = step;
        this.updateTutorialStep();
    }
    
    updateTutorialStep() {
        // Update step visibility
        document.querySelectorAll('.tutorial-step').forEach(step => {
            step.classList.remove('active');
        });
        document.querySelector(`.tutorial-step[data-step="${this.currentTutorialStep}"]`).classList.add('active');
        
        // Update dots
        document.querySelectorAll('.dot').forEach(dot => {
            dot.classList.remove('active');
        });
        document.querySelector(`.dot[data-step="${this.currentTutorialStep}"]`).classList.add('active');
        
        // Update navigation buttons
        const prevBtn = document.getElementById('tutorial-prev');
        const nextBtn = document.getElementById('tutorial-next');
        
        prevBtn.disabled = this.currentTutorialStep === 1;
        
        if (this.currentTutorialStep === this.totalTutorialSteps) {
            nextBtn.textContent = 'Start Gardening! 🌸';
        } else {
            nextBtn.textContent = 'Next →';
        }
    }
    
    placeParticle(x, y) {
        const cost = this.costs[this.selectedType];
        
        if (this.selectedType === 'observe') {
            // Observe collapses nearby particles
            this.observeParticles(x, y);
            
            // Tutorial task tracking
            if (this.tutorialMode && this.currentTutorialStep === 5 && !this.tutorialTasks.step5) {
                this.tutorialTasks.step5 = true;
                this.updateTaskStatus(5);
            }
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
        
        // Tutorial task tracking
        if (this.tutorialMode) {
            if (this.currentTutorialStep === 2 && !this.tutorialTasks.step2) {
                this.tutorialTasks.step2 = true;
                this.updateTaskStatus(2);
            }
            
            if (this.currentTutorialStep === 4 && this.selectedType === 'electron' && !this.tutorialTasks.step4) {
                this.tutorialTasks.step4 = true;
                this.updateTaskStatus(4);
            }
            
            if (this.currentTutorialStep === 7) {
                const newParticles = this.particles.length - this.particleCountAtTutorialStart;
                this.tutorialTasks.step7 = newParticles;
                this.updateTaskStatus(7);
            }
        }
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

// Initialize game when page loads
window.addEventListener('DOMContentLoaded', () => {
    const game = new QuantumGarden();
});
